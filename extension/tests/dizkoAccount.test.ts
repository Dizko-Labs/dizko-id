import { describe, expect, it } from 'vitest';
import { tasteOf } from '../lib/dizkoAccount';

const row = (artist: string, title: string, selected = true) => ({ track: { at: 0, artist, title, hits: 2, source: 'shazam' as const }, selected, status: 'queued' as const });
const mix = (title: string, uploader: string, rows: ReturnType<typeof row>[], artist?: object) =>
  ({ mix: { title, url: `https://soundcloud.com/x/${title}`, uploader }, artist, phase: 'review' as const, savedAt: 0, rows }) as any;

describe('tasteOf', () => {
  it('sends DJs and artist names with weights, never titles', () => {
    const t = tasteOf([
      mix('a', 'Boiler Room', [row('Dam Swindle', "That's Right"), row('Kevin McKay, Sven Kerkhoff & Nuray Alkan', 'Need You'), row('Nobody', 'x', false)],
        { id: 'honey-dijon', name: 'Honey Dijon', genres: ['house', 'disco'], soundcloud: 'https://soundcloud.com/honeydijon' }),
      mix('b', 'Kerri Chandler', [row('Dam Swindle', 'Other')]),
    ], true, 'install-1234');
    const names = t.artists.map((a) => a.name);
    expect(names).toEqual(expect.arrayContaining(['Honey Dijon', 'Kerri Chandler', 'Dam Swindle', 'Kevin McKay', 'Sven Kerkhoff', 'Nuray Alkan']));
    expect(names).not.toContain('Boiler Room');
    expect(names).not.toContain('Nobody');
    // ticked in two mixes reads stronger than once
    expect(t.artists.find((a) => a.name === 'Dam Swindle')!.weight).toBeGreaterThan(t.artists.find((a) => a.name === 'Nuray Alkan')!.weight);
    expect(t.djs).toEqual([{ name: 'Honey Dijon', dizko_id: 'honey-dijon' }, { name: 'Kerri Chandler', dizko_id: undefined }]);
    expect(t.genres).toEqual({ house: 1, disco: 1 });
    expect(JSON.stringify(t)).not.toMatch(/That's Right|Need You/);
    expect(t.follow_djs).toBe(true);
  });
});
