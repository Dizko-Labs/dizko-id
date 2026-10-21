import { describe, expect, it } from 'vitest';
import { collapse } from '../lib/identify';

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
