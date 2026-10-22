import { describe, expect, it } from 'vitest';
import { collapse, Governor, ListenPlan, parseClock, samplePoints } from '../lib/identify';

describe('collapse', () => {
  it('counts repeat hits and drops a credit Shazam repeated', () => {
    const tracks = collapse([
      { at: 0, artist: 'Rhythm Plate', title: 'Inside Me (feat. Astral T) (feat. Astral T)' },
      { at: 45, artist: 'Rhythm Plate', title: 'Inside Me (feat. Astral T) (feat. Astral T)' },
      { at: 90, artist: 'Kamar', title: 'I Need You (Peggy Gou Remix)' },
    ]);
    expect(tracks.map((t) => [t.title, t.hits])).toEqual([['Inside Me (feat. Astral T)', 2], ['I Need You (Peggy Gou Remix)', 1]]);
  });
});

/** A mix as a list of [start second, track], with an optional set of tracks Shazam does not know. */
function simulate(duration: number, tracks: [number, string][], unknown = new Set<string>(), concurrency = 1) {
  const at = (t: number) => [...tracks].reverse().find(([s]) => s <= t)![1];
  const plan = new ListenPlan(duration);
  const found = new Map<string, number>();
  let lookups = 0;
  while (!plan.done) {
    const batch: number[] = [];
    for (let t; batch.length < concurrency && (t = plan.next()) !== undefined; ) batch.push(t);
    for (const t of batch) {
      lookups++;
      const k = at(t);
      const heard = unknown.has(k) ? null : k;
      if (heard) found.set(heard, (found.get(heard) ?? 0) + 1);
      plan.record(t, heard);
    }
  }
  return { lookups, found, progress: plan.progress() };
}

describe('ListenPlan', () => {
  // an hour, fifteen tracks of three to five minutes
  const lengths = [240, 210, 300, 180, 270, 240, 220, 260, 200, 290, 230, 250, 210, 240, 260];
  const tracks: [number, string][] = [];
  lengths.reduce((t, len, i) => (tracks.push([t, `t${i}`]), t + len), 0);
  const old = samplePoints(3600).at.length;

  it('finds every track, each heard at least twice, with far fewer lookups than fixed spacing', () => {
    for (const c of [1, 3]) {
      const { lookups, found, progress } = simulate(3600, tracks, undefined, c);
      expect([...found.keys()].sort()).toEqual(tracks.map(([, k]) => k).sort());
      expect([...found.values()].every((n) => n >= 2)).toBe(true);
      expect(lookups).toBeLessThan(old * 0.75);
      expect(progress).toBeGreaterThan(0.9);
    }
  });

  it('still finds a short track between two others', () => {
    const withShort: [number, string][] = [[0, 'a'], [600, 'b'], [690, 'c'], [1200, 'd']];
    expect(simulate(1800, withShort).found.has('b')).toBe(true);
  });

  it('never needs more lookups than fixed spacing when Shazam knows nothing', () => {
    const { lookups } = simulate(3600, tracks, new Set(tracks.map(([, k]) => k)));
    expect(lookups).toBeLessThanOrEqual(old + 2);
  });

  it('tries a broken lookup once more, then counts it as nothing', () => {
    const plan = new ListenPlan(600);
    const first = plan.next()!;
    plan.fail(first);
    const seen: number[] = [];
    for (let t; (t = plan.next()) !== undefined; ) {
      seen.push(t);
      if (t === first) plan.fail(t);
      else plan.record(t, 'a');
    }
    expect(seen.filter((t) => t === first)).toHaveLength(1);
    expect(plan.done).toBe(true);
  });

  it('carries on from saved probes without repeating them', () => {
    const plan = new ListenPlan(1800);
    const first = plan.next()!;
    plan.record(first, 'a');
    const resumed = new ListenPlan(1800, plan.probes());
    expect(resumed.next()).not.toBe(first);
  });
});

describe('Governor', () => {
  it('drops to one on a 429 and climbs back after calm answers', () => {
    const g = new Governor(3);
    g.limited();
    expect(g.limit).toBe(1);
    for (let i = 0; i < 8; i++) g.answered();
    expect(g.limit).toBe(2);
  });
});

describe('ListenPlan sections and stops', () => {
  it('only listens inside a section', () => {
    const plan = new ListenPlan(3600, [], [2400, 3000]);
    const seen: number[] = [];
    for (let t; (t = plan.next()) !== undefined; ) {
      seen.push(t);
      plan.record(t, t < 2700 ? 'a' : 'b');
    }
    expect(seen.every((t) => t >= 2400 && t <= 3000)).toBe(true);
    expect(plan.done).toBe(true);
  });

  it('leaves a stopped point unheard, so a resume listens there', () => {
    const plan = new ListenPlan(1800);
    const first = plan.next()!;
    plan.cancel(first);
    expect(plan.probes().some(([at]) => at === first)).toBe(false);
    expect(new ListenPlan(1800, plan.probes()).next()).toBe(first);
  });

  it('moves progress as soon as the outline pass finds something', () => {
    const plan = new ListenPlan(3600);
    for (let i = 0; i < 6; i++) plan.record(plan.next()!, `t${i}`);
    expect(plan.progress()).toBeGreaterThan(0.05);
  });
});

describe('parseClock', () => {
  it('reads hours, minutes and plain minutes', () => {
    expect(parseClock('1:05:30')).toBe(3930);
    expect(parseClock('45:00')).toBe(2700);
    expect(parseClock('45')).toBe(2700);
    expect(parseClock('4x')).toBeUndefined();
    expect(parseClock('')).toBeUndefined();
  });
});
