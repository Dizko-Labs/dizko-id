import type { Track } from './types';

const TIME = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/;
const SEP = /\s+[-–—]\s+|\s+[-–—](?=\S)|(?<=\S)[–—]\s+/;
const UNKNOWN = /^(?:id|unknown|\?+|tba)$/i;

/**
 * Parse a written tracklist (a video description, a pinned comment, a 1001Tracklists paste) into tracks.
 * Accepts lines like "01. Artist - Title", "[12:30] Artist – Title [Label]", "1:02:03 Artist - Title (X Remix)".
 * Returns [] unless at least three lines look like tracks, so ordinary prose is not mistaken for a tracklist.
 */
export function parseTracklist(text: string): Track[] {
  const tracks: Track[] = [];
  const numbered = new Set<Track>();
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.length > 200) continue;
    const time = line.match(TIME);
    let at: number | null = null;
    if (time && line.indexOf(time[0]) < 6) {
      at = time[1] ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) : Number(time[2]) * 60 + Number(time[3]);
      line = line.replace(time[0], '');
    }
    const number = /^[\s|>*•-]*\[?(?:\d{1,3}[.):\]]|0\d\s)\s*/;
    const hasNumber = number.test(line);
    line = line
      .replace(number, '') // "01.", "[03]", "3)", "07 "; leaves "2 Unlimited" alone
      .replace(/^[\s|>*•\-[\]()]+/, '') // bullets, and brackets left behind by "[12:30]"
      .replace(/\s*\[([^\]]*)\]\s*$/, (m, inner: string) => (/\b(mix|remix|edit|dub|version|rework)\b/i.test(inner) ? m : '')) // trailing [Label], not [X Remix]
      .replace(/\s*\(\s*\d{4}\s*\)\s*$/, '') // trailing (1998)
      .trim();
    const parts = line.split(SEP);
    if (parts.length < 2) continue;
    const artist = parts[0]!.trim();
    const title = parts.slice(1).join(' - ').trim();
    if (!artist || !title || UNKNOWN.test(artist) || UNKNOWN.test(title)) continue;
    if (/https?:\/\//.test(line)) continue;
    const track: Track = { at, artist, title, hits: 2, source: 'tracklist' };
    if (hasNumber) numbered.add(track);
    tracks.push(track);
  }
  // A timestamped tracklist makes untimed dash lines ("Real vinyl - made for house lovers") prose, not tracks
  const timed = tracks.filter((t) => t.at != null);
  const list = timed.length >= 3 ? tracks.filter((t) => t.at != null || numbered.has(t)) : tracks;
  return list.length >= 3 ? list : [];
}
