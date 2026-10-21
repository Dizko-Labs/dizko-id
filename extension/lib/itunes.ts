import { artistNames, norm, splitTitle } from './match';

/**
 * iTunes Search API results (public, no key) for a track, kept only when artist and title both match: the search is
 * loose ("Dam Swindle That's Right" finds Cole Swindell), and wrong art or a wrong preview is worse than none.
 */
export async function itunesMatches(artist: string, title: string): Promise<any[]> {
  const base = splitTitle(title).base;
  const q = encodeURIComponent(`${artist} ${base}`);
  const hits = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=8`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).catch(() => null);
  const want = artistNames(artist);
  return (hits?.results ?? []).filter(
    (x: any) => artistNames(String(x.artistName ?? '')).some((a) => want.includes(a)) && norm(splitTitle(String(x.trackName ?? '')).base) === norm(base),
  );
}
