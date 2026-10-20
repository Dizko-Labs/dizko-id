import type { Offer, Track } from './types';

/** Lowercase, strip accents and punctuation, unify "&"/"and". */
export function norm(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const FEAT = /\s*[([]?\b(?:feat|ft|featuring)\b\.?\s[^)\]]*[)\]]?/gi;

const VERSION_WORD = /\b(mix|remix|rmx|edit|dub|version|rework|bootleg|vip|instrumental|acapella|re-?edit|club|extended)\b/i;

/**
 * Split "Ultimately (feat. Coby Sey) [Amotik Remix]" into base "Ultimately" and version "Amotik Remix".
 * Only a bracket naming a version counts as one: "One Day (Vandaag)" keeps "(Vandaag)" as part of the title.
 */
export function splitTitle(title: string): { base: string; version: string } {
  const t = title.replace(FEAT, ' ');
  const versions: string[] = [];
  const seen = new Set<string>();
  const base = t.replace(/\s*([([])([^)\]]*)[)\]]/g, (whole, _open: string, v: string) => {
    const key = norm(v);
    if (seen.has(key)) return ' '; // "Marea (we've lost dancing) (we've lost dancing)"
    seen.add(key);
    if (VERSION_WORD.test(v)) {
      versions.push(v.trim());
      return ' ';
    }
    return whole;
  });
  return { base: base.replace(/\s+/g, ' ').trim(), version: versions.at(-1) ?? '' };
}

/** Versions that all mean "the record as released", so any of them satisfies a Shazam title with no version. */
const GENERIC = /^(?:original|extended|club|main|album|full length|full|vocal|radio|single)?\s*(?:mix|version|edit)?$/;

export function isGenericVersion(v: string): boolean {
  const n = norm(v);
  return n === '' || GENERIC.test(n);
}

/** Split an artist credit into individual names: "A & B", "A, B", "A x B", "A vs. B", "A feat. B". */
export function artistNames(credit: string): string[] {
  return credit
    .split(/\s*(?:,|&|\band\b|\bx\b|\bvs\.?|\bfeat\.?|\bft\.?|\bfeaturing\b|\/)\s*/i)
    .map(norm)
    .filter(Boolean);
}

const NOT_THE_RECORD = /\b(karaoke|tribute|made famous|in the style of|originally performed|cover version|8 bit|lullaby)\b/;

export type Verdict =
  | { ok: true; score: number }
  | { ok: false; reason: 'artist' | 'title' | 'version' | 'imitation' };

/**
 * Is this offer the record that was played? Right version or nothing:
 * a named remix only matches that remix, and a plain title only matches the original/extended cut.
 */
export function judge(track: Track, offer: Offer): Verdict {
  const offerText = norm(`${offer.title} ${offer.version} ${offer.release ?? ''}`);
  if (NOT_THE_RECORD.test(offerText)) return { ok: false, reason: 'imitation' };
  if (track.isrc && offer.isrc && track.isrc.toUpperCase() === offer.isrc.toUpperCase()) {
    return { ok: true, score: 100 };
  }

  const want = artistNames(track.artist);
  const have = offer.artists.flatMap(artistNames);
  if (!want.some((w) => have.includes(w))) return { ok: false, reason: 'artist' };

  let t = splitTitle(track.title);
  const o = splitTitle(offer.version ? `${offer.title} (${offer.version})` : offer.title);
  if (norm(t.base) !== norm(o.base)) {
    // Shazam sometimes leaves the version unbracketed: "Total Eclipse of the Heart Spit & Polish Club Mix"
    const rest = norm(t.base).startsWith(`${norm(o.base)} `) ? t.base.slice(o.base.length).trim() : '';
    if (!t.version && rest && VERSION_WORD.test(rest)) t = { base: o.base, version: rest };
    else return { ok: false, reason: 'title' };
  }

  let score = 50;
  if (isGenericVersion(t.version)) {
    if (!isGenericVersion(o.version)) return { ok: false, reason: 'version' };
    // DJs want the long cut: extended, then original, then anything else generic; radio edits last
    const ov = norm(o.version);
    score += ov.startsWith('extended') ? 12 : ov.startsWith('original') ? 10 : ov.includes('radio') ? 0 : 6;
  } else {
    const tv = norm(t.version);
    const ov = norm(o.version);
    // Shazam and stores disagree on "Remix" vs "Mix", so compare with those words stripped
    const core = (s: string) => s.replace(/\b(remix|mix|rework|edit|version)\b/g, '').replace(/\s+/g, ' ').trim();
    if (!(ov === tv || (core(tv) !== '' && core(ov) === core(tv)))) return { ok: false, reason: 'version' };
    score += 15;
  }
  return { ok: true, score };
}

/** The best matching offer, or the versions that do exist when the played one is missing. */
export function pick(track: Track, offers: Offer[]): { best?: Offer; alternatives: Offer[] } {
  const judged = offers.map((offer) => ({ offer, v: judge(track, offer) }));
  const good = judged.filter((j): j is { offer: Offer; v: { ok: true; score: number } } => j.v.ok);
  good.sort(
    (a, b) =>
      b.v.score - a.v.score ||
      (a.offer.price?.value ?? Infinity) - (b.offer.price?.value ?? Infinity) ||
      (a.offer.released ?? '9999').localeCompare(b.offer.released ?? '9999'),
  );
  const alternatives = judged.filter((j) => !j.v.ok && j.v.reason === 'version').map((j) => j.offer);
  return { best: good[0]?.offer, alternatives };
}

/** What to type into a store's search box: feat. credits and generic mix names hurt search, named remixers help. */
export function searchQuery(track: Track): string {
  const { base, version } = splitTitle(track.title);
  const artist = track.artist.replace(/\s+(?:x|vs\.?|feat\.?|ft\.?)\s+/gi, ' ');
  return `${artist} ${base} ${isGenericVersion(version) ? '' : version}`.replace(/\s+/g, ' ').trim();
}
