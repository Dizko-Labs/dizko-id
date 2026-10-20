import { describe, expect, it } from 'vitest';
import { parseTracklist } from '../lib/tracklist';

describe('parseTracklist', () => {
  it('reads timestamped, numbered and labelled lines', () => {
    const tracks = parseTracklist(`Recorded live at Sugar Mountain.

Tracklist:
00:00 Block & Crown - Wish for Disco (Nu Disco Mix)
[02:00] Erick Morillo & Harry Romero – Bang (Harry & Erick Bang In Your Face Mix) [Subliminal]
1:02:03 Ben Klock & Fadi Mohem - Ultimately (feat. Coby Sey) [Amotik Remix]
04. ID - ID
05. 2 Unlimited - Get Ready For This
Follow me on https://instagram.com/x`);
    expect(tracks.map((t) => [t.at, t.artist, t.title])).toEqual([
      [0, 'Block & Crown', 'Wish for Disco (Nu Disco Mix)'],
      [120, 'Erick Morillo & Harry Romero', 'Bang (Harry & Erick Bang In Your Face Mix)'],
      [3723, 'Ben Klock & Fadi Mohem', 'Ultimately (feat. Coby Sey) [Amotik Remix]'],
      [null, '2 Unlimited', 'Get Ready For This'],
    ]);
  });
  it('drops untimed promo lines when the list is timestamped', () => {
    const tracks = parseTracklist(`Real vinyl, analog sound and authentic club culture - made for true house music lovers.
00:00 - Stardust - Music sounds better with you (1998)
03:02 - A Small Phat One - Music for Pushchairs (1999)
06:10 - Mousse T. vs. Hot 'N' Juicy - Horny (1998)`);
    expect(tracks.map((t) => t.artist)).toEqual(['Stardust', 'A Small Phat One', "Mousse T. vs. Hot 'N' Juicy"]);
    expect(tracks[0]!.title).toBe('Music sounds better with you');
  });
  it('ignores prose with the odd dash', () => {
    expect(parseTracklist('Big night - thanks all\nBack soon - love you')).toEqual([]);
  });
});
