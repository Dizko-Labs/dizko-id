/**
 * A short audio preview for a track: Beatport's own sample of the exact release when the track was matched there
 * (about two minutes, no login), else Apple's 30 second preview from the public iTunes Search API, taken only when
 * artist and title both match. Played in a plain audio element; nothing is embedded per row.
 */
import { itunesMatches } from './itunes';
import { trackKey, type Row } from './types';

const cache = new Map<string, string | null>();

async function applePreview(row: Row): Promise<string | undefined> {
  return (await itunesMatches(row.track.artist, row.track.title)).find((x) => x.previewUrl)?.previewUrl;
}

export async function previewUrl(row: Row, first: 'beatport' | 'apple'): Promise<string | undefined> {
  const key = `${first}|${trackKey(row)}`;
  if (cache.has(key)) return cache.get(key) ?? undefined;
  const beatport = row.offer?.store === 'beatport' ? row.offer.sample : undefined;
  const url = first === 'beatport' ? beatport ?? (await applePreview(row)) : (await applePreview(row)) ?? beatport;
  cache.set(key, url ?? null);
  return url;
}
