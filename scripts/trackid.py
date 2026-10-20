# /// script
# requires-python = ">=3.11"
# dependencies = ["shazamio>=0.8.1"]
# ///
"""Track ID a DJ mix: fingerprint short clips with Shazam and collapse them into a tracklist.

A SoundCloud/Mixcloud/YouTube URL is pulled with yt-dlp first; a local file works too.
Every --every seconds a --clip-second mono slice is cut with ffmpeg and sent to Shazam
(via shazamio). Consecutive identical hits collapse into one entry, so the result is an
ordered list of (first seen at, Artist, Title, hit count) for the store-search step.

    uv run scripts/trackid.py URL --json tracks.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

MIX_CACHE = Path.home() / ".cache/mix-to-cart"
_FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
_FFPROBE = shutil.which("ffprobe") or "ffprobe"
INSTALL = "macOS: brew install ffmpeg yt-dlp | Debian/Ubuntu: sudo apt install ffmpeg yt-dlp | Windows: winget install Gyan.FFmpeg yt-dlp.yt-dlp"


def require(*tools: str) -> None:
    """Exit with an install hint instead of a FileNotFoundError traceback."""
    missing = [t for t in tools if not shutil.which(t)]
    if missing:
        sys.exit(f"missing {', '.join(missing)} on PATH. Install with: {INSTALL}")


def slug(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    return re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower() or "mix"


def fetch(url: str) -> tuple[Path, dict]:
    """Download the audio once into MIX_CACHE/<slug>/; return (audio path, yt-dlp info)."""
    MIX_CACHE.mkdir(parents=True, exist_ok=True)
    probe = subprocess.run(["yt-dlp", "-q", "--no-warnings", "--dump-json", url], capture_output=True, text=True, check=True)
    info = json.loads(probe.stdout.splitlines()[0])
    d = MIX_CACHE / slug(info.get("title") or info.get("id", "mix"))
    d.mkdir(exist_ok=True)
    existing = [p for p in d.iterdir() if p.stem == "mix" and p.suffix not in (".part", ".ytdl", ".json")]
    if existing:
        return existing[0], info
    subprocess.run(["yt-dlp", "-q", "--no-warnings", "-x", "-o", str(d / "mix.%(ext)s"), url], check=True)
    return next(p for p in d.iterdir() if p.stem == "mix" and p.suffix != ".json"), info


def duration(path: Path) -> float:
    out = subprocess.run([_FFPROBE, "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True).stdout.strip()
    return float(out or 0)


def clip(path: Path, start: float, seconds: float) -> bytes:
    """Mono 16 kHz 64 kbps MP3 bytes of [start, start+seconds): small, and all Shazam needs."""
    return subprocess.run([_FFMPEG, "-v", "quiet", "-ss", f"{start:.1f}", "-t", f"{seconds:.1f}", "-i", str(path),
                           "-ac", "1", "-ar", "16000", "-b:a", "64k", "-f", "mp3", "pipe:1"], capture_output=True, check=True).stdout


def hms(t: float) -> str:
    t = int(t)
    return f"{t // 3600}:{t % 3600 // 60:02d}:{t % 60:02d}" if t >= 3600 else f"{t // 60}:{t % 60:02d}"


async def identify(path: Path, *, every: float, clip_s: float, pause: float = 1.0) -> list[dict]:
    from shazamio import Shazam  # imported lazily: slow and only needed here
    shazam = Shazam()
    total = duration(path)
    hits: list[dict] = []
    t = 0.0
    while t + clip_s <= total:
        try:
            r = await shazam.recognize(clip(path, t, clip_s))
            track = r.get("track") or {}
        except Exception as e:  # noqa: BLE001  (network hiccup: skip this slice, keep going)
            print(f"  {hms(t)}  ! {e}", file=sys.stderr)
            track = {}
        if track:
            hit = {"at": t, "artist": track.get("subtitle", ""), "title": track.get("title", "")}
            print(f"  {hms(t)}  {hit['artist']} - {hit['title']}", file=sys.stderr, flush=True)
            hits.append(hit)
        else:
            print(f"  {hms(t)}  .", file=sys.stderr, flush=True)
        t += every
        await asyncio.sleep(pause)
    return hits


def collapse(hits: list[dict]) -> list[dict]:
    """Keep the first appearance of each distinct track, in play order."""
    out: list[dict] = []
    seen: dict[str, dict] = {}
    for h in hits:
        key = re.sub(r"\W+", "", (h["artist"] + h["title"]).lower())
        if key in seen:
            seen[key]["hits"] += 1
            continue
        seen[key] = {**h, "hits": 1}
        out.append(seen[key])
    return out


def store_query(artist: str, title: str) -> str:
    """The string typed into a store's search box for this track.

    Shazam titles carry decoration that store search engines handle badly:
    "(feat. Coby Sey)", "[Amotik Remix]", "(Nu Disco Mix)", "(we've lost dancing) (we've lost dancing)".
    The full title is still kept in the JSON, so the mix name can be checked when picking a result.
    """
    title = re.sub(r"\s*[(\[](?:feat|ft|featuring)\.?\s[^)\]]*[)\]]", "", title, flags=re.I)
    title = re.sub(r"(\s*\([^)]*\))\1+", r"\1", title)  # "(x) (x)" -> "(x)"
    # Keep a named remixer ("Amotik Remix") since it picks the version; drop generic mix names that only add noise.
    title = re.sub(r"\s*[(\[]([^)\]]*)[)\]]",
                   lambda m: f" {m.group(1)}" if re.search(r"\b(remix|rework|edit|dub)\b", m.group(1), re.I)
                   and not re.fullmatch(r"(radio|extended|original|club)\s+(edit|mix)", m.group(1).strip(), re.I) else "", title)
    artist = re.sub(r"\s+(?:x|vs\.?|feat\.?|ft\.?)\s+", " ", artist, flags=re.I)
    return re.sub(r"\s+", " ", f"{artist} {title}").strip()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("source", help="SoundCloud/Mixcloud/YouTube URL, or a local audio file")
    p.add_argument("--every", type=float, default=30, help="seconds between fingerprinted clips")
    p.add_argument("--clip", type=float, default=12, help="clip length in seconds")
    p.add_argument("--json", help="write the tracklist here (default: stdout)")
    a = p.parse_args(argv)

    url = re.match(r"https?://", a.source)
    require("ffmpeg", "ffprobe", *(["yt-dlp"] if url else []))
    if url:
        audio, info = fetch(a.source)
        title = info.get("title") or audio.parent.name
    else:
        audio, title = Path(a.source), Path(a.source).stem
    print(f"{title}  ({hms(duration(audio))}, one {a.clip:.0f}s clip every {a.every:.0f}s)", file=sys.stderr)
    tracks = collapse(asyncio.run(identify(audio, every=a.every, clip_s=a.clip)))
    out = {
        "mix": title,
        "source": a.source,
        "tracks": [{"at": hms(h["at"]), "artist": h["artist"], "title": h["title"], "hits": h["hits"],
                    "confident": h["hits"] > 1, "query": store_query(h["artist"], h["title"])} for h in tracks],
    }
    text = json.dumps(out, indent=1, ensure_ascii=False)
    if a.json:
        Path(a.json).write_text(text + "\n")
        print(f"{len(tracks)} tracks -> {a.json}", file=sys.stderr)
    else:
        print(text)
    return 0 if tracks else 1


if __name__ == "__main__":
    sys.exit(main())
