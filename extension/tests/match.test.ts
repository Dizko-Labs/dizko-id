import { describe, expect, it } from 'vitest';
import { judge, pick, searchQuery, splitTitle } from '../lib/match';
import type { Offer, Track } from '../lib/types';

const t = (artist: string, title: string, extra: Partial<Track> = {}): Track => ({ at: 0, artist, title, hits: 2, source: 'shazam', ...extra });
const bp = (artists: string[], title: string, version: string, extra: Partial<Offer> = {}): Offer => ({
  store: 'beatport', id: Math.random().toString(36), url: '', artists, title, version, ...extra,
});

describe('splitTitle', () => {
  it('drops feat. and keeps the named remix', () => {
    expect(splitTitle('Ultimately (feat. Coby Sey) [Amotik Remix]')).toEqual({ base: 'Ultimately', version: 'Amotik Remix' });
  });
  it('drops a DJ-mix compilation marker and keeps the remix', () => {
    expect(splitTitle('Love and Happiness (Melé Remix) [Mixed]')).toEqual({ base: 'Love and Happiness', version: 'Melé Remix' });
  });
  it('collapses a duplicated bracket and keeps a non-version bracket in the title', () => {
    expect(splitTitle("Marea (we've lost dancing) (we've lost dancing)")).toEqual({ base: "Marea (we've lost dancing)", version: '' });
    expect(splitTitle('One Day (Vandaag)')).toEqual({ base: 'One Day (Vandaag)', version: '' });
  });
});

describe('judge: right version or nothing', () => {
  it('a plain Shazam title takes the Original Mix', () => {
    expect(judge(t('Lidvall', 'Needles'), bp(['Lidvall'], 'Needles', 'Original Mix')).ok).toBe(true);
  });
  it('a plain Shazam title never takes a remix', () => {
    expect(judge(t('Lidvall', 'Needles'), bp(['Lidvall'], 'Needles', 'Somebody Remix'))).toEqual({ ok: false, reason: 'version' });
  });
  it('a named remix only takes that remix', () => {
    const track = t('Ben Klock & Fadi Mohem', 'Ultimately (feat. Coby Sey) [Amotik Remix]');
    expect(judge(track, bp(['Ben Klock', 'Fadi Mohem', 'Coby Sey'], 'Ultimately', 'Amotik Remix')).ok).toBe(true);
    expect(judge(track, bp(['Ben Klock', 'Fadi Mohem'], 'Ultimately', 'Original Mix'))).toEqual({ ok: false, reason: 'version' });
  });
  it('"Mix" and "Remix" spellings of the same version match', () => {
    expect(judge(t('Energy 52', "Café Del Mar (Three 'n One Remix)"), bp(['Energy 52'], 'Cafe Del Mar', "Three 'N One Mix")).ok).toBe(true);
  });
  it('treats a bracket that is part of the title as title, not version', () => {
    expect(judge(t('Bakermat', 'One Day (Vandaag)'), bp(['Bakermat'], 'One Day (Vandaag)', 'Original Mix')).ok).toBe(true);
  });
  it('matches an unbracketed version against the store split', () => {
    const track = t('Diva DJs Vs Nicki French', 'Total Eclipse of the Heart Spit & Polish Club Mix');
    expect(judge(track, bp(['Nicki French'], 'Total Eclipse of the Heart', 'Spit & Polish Club Mix')).ok).toBe(true);
    expect(judge(track, bp(['Nicki French'], 'Total Eclipse Of The Heart', 'Spit & Polish Radio Edit'))).toEqual({ ok: false, reason: 'version' });
  });
  it('rejects karaoke and tribute copies even with matching names', () => {
    expect(judge(t('Moby', 'Porcelain'), bp(['Moby'], 'Porcelain', 'Karaoke Version'))).toEqual({ ok: false, reason: 'imitation' });
  });
  it('rejects a different artist with the same title', () => {
    expect(judge(t('Robbie Rivera', "It's Midnight"), bp(['Someone Else'], "It's Midnight", 'Original Mix'))).toEqual({ ok: false, reason: 'artist' });
  });
  it('an ISRC match wins over spelling differences', () => {
    expect(judge(t('Lidvall', 'Needles (Original mix)', { isrc: 'GBKQU2235975' }), bp(['LIDVALL'], 'Needles', 'Original Mix', { isrc: 'gbkqu2235975' }))).toEqual({ ok: true, score: 100 });
  });
});

describe('pick', () => {
  it('prefers the extended cut, then the cheaper copy, and reports versions that exist', () => {
    const track = t('Block & Crown', 'Wish for Disco');
    const r = pick(track, [
      bp(['Block & Crown'], 'Wish for Disco', 'Radio Edit', { price: { value: 1.29, currency: 'USD', display: '$1.29' } }),
      bp(['Block & Crown'], 'Wish for Disco', 'Extended Mix', { price: { value: 1.49, currency: 'USD', display: '$1.49' } }),
      bp(['Block & Crown'], 'Wish for Disco', 'Nu Disco Mix'),
    ]);
    expect(r.best?.version).toBe('Extended Mix');
    expect(r.alternatives.map((o) => o.version)).toEqual(['Nu Disco Mix']);
  });
});

describe('searchQuery', () => {
  it('keeps the remixer, drops feat. and generic mix names', () => {
    expect(searchQuery(t('Ben Klock & Fadi Mohem', 'Ultimately (feat. Coby Sey) [Amotik Remix]'))).toBe('Ben Klock & Fadi Mohem Ultimately Amotik Remix');
    expect(searchQuery(t('Lidvall', 'Needles (Original Mix)'))).toBe('Lidvall Needles');
  });
});
