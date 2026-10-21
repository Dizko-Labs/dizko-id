/**
 * A short audio preview for a track: Beatport's own sample of the exact release when the track was matched there
 * (about two minutes, no login), else Apple's 30 second preview from the public iTunes Search API, taken only when
 * artist and title both match. Played in a plain audio element; nothing is embedded per row.
 */
import { artistNames, norm, splitTitle } from './match';
import type { Row } from './types';

const cache = new Map<string, string | null>();

async function applePreview(row: Row): Promise<string | undefined> {
  const q = encodeURIComponent(`${row.track.artist} ${splitTitle(row.track.title).base}`);
  const hits = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=8`).then((r) => r.json()).catch(() => null);
  const want = artistNames(row.track.artist);
  const title = norm(splitTitle(row.track.title).base);
  const match = (hits?.results ?? []).find(
    (x: any) => x.previewUrl && artistNames(String(x.artistName ?? '')).some((a) => want.includes(a)) && norm(splitTitle(String(x.trackName ?? '')).base) === title,
  );
  return match?.previewUrl;
}

export async function previewUrl(row: Row, first: 'beatport' | 'apple'): Promise<string | undefined> {
  const key = `${first}|${row.track.artist}|${row.track.title}`;
  if (cache.has(key)) return cache.get(key) ?? undefined;
  const beatport = row.offer?.store === 'beatport' ? row.offer.sample : undefined;
  const url = first === 'beatport' ? beatport ?? (await applePreview(row)) : (await applePreview(row)) ?? beatport;
  cache.set(key, url ?? null);
  return url;
}
