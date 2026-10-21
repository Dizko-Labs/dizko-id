import type { Track } from './types';
import { norm } from './match';

export interface Hit {
  at: number;
  artist: string;
  title: string;
  isrc?: string;
  art?: string;
}

/** Keep the first appearance of each distinct track, in play order, counting how often it was heard. */
export function collapse(hits: Hit[]): Track[] {
  const out: Track[] = [];
  const seen = new Map<string, Track>();
  for (const h of hits) {
    const key = norm(h.artist + h.title).replace(/\s/g, '');
    const prev = seen.get(key);
    if (prev) {
      prev.hits += 1;
      prev.isrc ??= h.isrc;
      prev.art ??= h.art;
      continue;
    }
    // Shazam sometimes repeats a credit: "Inside Me (feat. Astral T) (feat. Astral T)"
    const title = h.title.replace(/(\s*[([][^)\]]+[)\]])\1+/g, '$1');
    const t: Track = { at: h.at, artist: h.artist, title, hits: 1, isrc: h.isrc, art: h.art, source: 'shazam' };
    seen.set(key, t);
    out.push(t);
  }
  return out;
}

/** Sample points through the mix. Longer mixes are sampled more sparsely so a 2 hour set stays near 30 minutes. */
export function samplePoints(duration: number): { at: number[]; clip: number } {
  const every = duration > 5400 ? 60 : duration > 2700 ? 45 : 30;
  const clip = 10;
  const at: number[] = [];
  for (let t = 5; t + clip < duration; t += every) at.push(t);
  return { at, clip };
}
