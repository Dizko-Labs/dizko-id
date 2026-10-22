import type { Track } from './types';
import { norm } from './match';

export interface Hit {
  at: number;
  artist: string;
  title: string;
  isrc?: string;
  art?: string;
}

/** One distinct track, however Shazam spaced or punctuated it. */
export const hitKey = (h: { artist: string; title: string }) => norm(h.artist + h.title).replace(/\s/g, '');

/** Keep the first appearance of each distinct track, in play order, counting how often it was heard. */
export function collapse(hits: Hit[]): Track[] {
  const out: Track[] = [];
  const seen = new Map<string, Track>();
  // lookups run out of order, so play order comes from the times
  for (const h of [...hits].sort((a, b) => a.at - b.at)) {
    const key = hitKey(h);
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
export function samplePoints(duration: number): { at: number[]; clip: number; every: number } {
  const every = duration > 5400 ? 60 : duration > 2700 ? 45 : 30;
  const clip = 10;
  const at: number[] = [];
  for (let t = 5; t + clip < duration; t += every) at.push(t);
  return { at, clip, every };
}

/** What one listen point heard: a track's hitKey, or null for nothing known (or a failed lookup). */
export type Probe = [at: number, heard: string | null];

/**
 * Where to listen next in a mix, so the fewest Shazam lookups find every track. A mix changes track rarely: first
 * a coarse pass gives the outline, then only the gaps whose two ends heard different things (or nothing) are split,
 * down to the old fixed spacing. A gap with the same track at both ends is that track throughout. Last, a track
 * heard only once gets one more listen beside it, since a single hit is what marks a find as unconfirmed.
 */
export class ListenPlan {
  readonly fine: number;
  private readonly heard = new Map<number, string | null>();
  private readonly pending = new Set<number>();
  private readonly coarse: number[] = [];
  private readonly rechecked = new Set<string>();
  private readonly retried = new Set<number>();
  private readonly first: number;
  private readonly last: number;

  private readonly outline: number;

  /** `range` limits the listen to a stretch of the mix, in seconds, when the DJ only wants part of it. */
  constructor(readonly duration: number, seed: Probe[] = [], range?: [number, number]) {
    const [from, to] = range ?? [0, duration];
    // the spacing follows the stretch being heard, so a short section is listened to as closely as a short mix
    this.fine = samplePoints(to - from).every;
    // a power-of-two multiple of the fine spacing, so halving a gap lands on it exactly
    const step = this.fine * 4;
    this.first = Math.max(5, from);
    this.last = Math.max(this.first, Math.min(to, duration - 15));
    for (let t = this.first; t < this.last; t += step) this.coarse.push(t);
    this.coarse.push(this.last);
    this.outline = this.coarse.length;
    for (const [at, k] of seed) if (at >= this.first && at <= this.last) this.heard.set(at, k);
  }

  /** The next point to listen at, or undefined when nothing can be chosen until a pending lookup answers. */
  next(): number | undefined {
    const t = this.pick();
    if (t !== undefined) this.pending.add(t);
    return t;
  }

  record(at: number, heard: string | null) {
    this.pending.delete(at);
    this.heard.set(at, heard);
  }

  /** A lookup that broke (network, decoding, a Shazam error): try that point once more later, then count it as nothing. */
  fail(at: number) {
    this.pending.delete(at);
    if (this.retried.has(at)) {
      this.heard.set(at, null);
      return;
    }
    this.retried.add(at);
    this.coarse.push(at);
  }

  /** Nothing left to listen to and nothing waiting on an answer. */
  get done() {
    return !this.pending.size && this.pick() === undefined;
  }

  /**
   * How far along the listen is: the outline pass counts for the first 40%, so finds show movement straight away,
   * and the rest is the share of the stretch settled (covered by a gap that needs no more listening).
   */
  progress(): number {
    const outlined = 1 - this.coarse.filter((t) => !this.retried.has(t)).length / Math.max(1, this.outline);
    return Math.min(0.99, 0.4 * outlined + 0.6 * this.settled());
  }

  private settled(): number {
    const pts = this.points();
    let settled = 0;
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1]!, pts[i]!];
      if (!this.pending.has(a) && !this.pending.has(b) && !this.open(a, b)) settled += b - a;
    }
    return settled / Math.max(1, this.last - this.first);
  }

  probes(): Probe[] {
    return [...this.heard];
  }

  private points() {
    return [...new Set([...this.heard.keys(), ...this.pending])].sort((a, b) => a - b);
  }

  private open(a: number, b: number) {
    if (b - a <= this.fine || this.pending.has(a) || this.pending.has(b)) return false;
    const ka = this.heard.get(a);
    return ka == null || ka !== this.heard.get(b);
  }

  private pick(): number | undefined {
    const near = (t: number) => this.heard.has(t) || this.pending.has(t);
    while (this.coarse.length) {
      const t = this.coarse.shift()!;
      if (!near(t)) return t;
    }
    // split the widest unsettled gap first, so the outline sharpens evenly
    const pts = this.points();
    let best: [number, number] | undefined;
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1]!, pts[i]!];
      if (this.open(a, b) && (!best || b - a > best[1] - best[0])) best = [a, b];
    }
    if (best) return Math.round((best[0] + best[1]) / 2);
    if (this.pending.size) return undefined; // the second chance waits for every split to answer
    const counts = new Map<string, number>();
    for (const k of this.heard.values()) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const [at, k] of this.heard) {
      if (!k || counts.get(k)! > 1 || this.rechecked.has(k)) continue;
      this.rechecked.add(k);
      const half = Math.round(this.fine / 2);
      const t = at + half <= this.last ? at + half : at - half;
      if (t >= this.first && !near(t)) return t;
    }
    return undefined;
  }
}

/**
 * How many lookups run at once. Starts at a few; a 429 from Shazam drops it to one, and a run of answers without one
 * lets it climb back, so a listen settles just under Shazam's limit instead of stalling on long back-offs.
 */
export class Governor {
  limit: number;
  private calm = 0;
  constructor(private readonly max = 3) {
    this.limit = max;
  }
  limited() {
    this.limit = 1;
    this.calm = 0;
  }
  answered() {
    if (++this.calm >= 8 && this.limit < this.max) {
      this.limit++;
      this.calm = 0;
    }
  }
}

/** "1:05:30", "45:00", "45" (minutes) -> seconds; undefined when it cannot be read. */
export function parseClock(text: string): number | undefined {
  const parts = text.trim().split(':');
  if (!text.trim() || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return undefined;
  const n = parts.map(Number);
  if (n.length === 1) return n[0]! * 60;
  return n.reduce((t, v) => t * 60 + v, 0);
}
