/**
 * A short audio preview for a track: Beatport's own sample of the exact release when the track was matched there
 * (about two minutes, no login), else Apple's 30 second preview from the public iTunes Search API, taken only when
 * artist and title both match. Played in a plain audio element; nothing is embedded per row.
 */
import { itunesMatches } from './itunes';
import { trackKey, type Row } from './types';

// only found previews are kept: a miss is asked again next time, since the Beatport match or the network may have come back
const apple = new Map<string, string>();

async function applePreview(row: Row): Promise<string | undefined> {
  const key = trackKey(row);
  if (apple.has(key)) return apple.get(key);
  const url = (await itunesMatches(row.track.artist, row.track.title)).find((x) => x.previewUrl)?.previewUrl;
  if (url) apple.set(key, url);
  return url;
}

/** Where to look for a preview, in the DJ's preferred order; the player tries the next when one has none or fails. */
export function previewSources(row: Row, first: 'beatport' | 'apple'): (() => Promise<string | undefined>)[] {
  // read the row as it is at press time, so a Beatport match that arrived after an earlier miss is used
  const beatport = async () => (row.offer?.store === 'beatport' ? row.offer.sample : undefined);
  const fromApple = () => applePreview(row);
  return first === 'beatport' ? [beatport, fromApple] : [fromApple, beatport];
}
