import { norm } from './match';

/** What the panel shows about the DJ behind a mix, from Dizko's public event graph. */
export interface Artist {
  name: string;
  url: string;
  /** the DJ has published their Dizko page; otherwise the panel invites them to claim it */
  claimed: boolean;
  genres: string[];
  cities: string[];
  events: { title: string; date: string; city: string; venue: string; url: string }[];
  /** their SoundCloud profile, from Dizko's links */
  soundcloud?: string;
  /** their profile picture (from SoundCloud) */
  avatar?: string;
  /** when this was fetched: dates go stale, so a saved artist is refreshed after a while */
  fetchedAt?: number;
  /** shape version; older saved copies are fetched again */
  v?: number;
}

/** A saved artist worth fetching again: older than 12 hours, or saved before fetch times were kept. */
export const isStale = (a?: Artist) => !a?.fetchedAt || a.v !== 2 || Date.now() - a.fetchedAt > 12 * 3600 * 1000;


/** One get_artist call on Dizko's public MCP endpoint (stateless JSON-RPC over HTTP, no key). */
async function getArtist(query: string): Promise<any> {
  const res = await fetch('https://mcp.dizko.app/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-method': 'tools/call', 'mcp-name': 'get_artist' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'get_artist',
        arguments: { query, limit: 20 },
        _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} },
      },
    }),
  });
  const text = (await res.json())?.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

/**
 * Channels that host other DJs' sets. When one of these uploaded the mix, the DJ is in the title, and the
 * channel's name in the title marks where the DJ's name ends ("Honey Dijon Boiler Room Sugar Mountain ...").
 */
const PLATFORMS = [
  'boiler room', 'mixmag', 'cercle', 'resident advisor', 'ra', 'hör', 'hoer', 'hör berlin', 'defected', 'defected records',
  'the lot radio', 'lot radio', 'nts', 'nts radio', 'rinse fm', 'rinse', 'dekmantel', 'keep hush', 'be-at.tv', 'beattv',
  'awakenings', 'tomorrowland', 'circoloco', 'dj mag', 'djmag', 'fact', 'fact magazine', 'crack magazine', 'kiosk radio',
  'balamii', 'worldwide fm', 'radio 1', 'bbc radio 1', 'essential mix', 'ministry of sound', 'cafe mambo', 'cercle records',
  'stay true sounds', 'lights on', 'dirtybird', 'anjunadeep', 'drumcode', 'mixcloud', 'soundcloud', 'youtube',
];
const PLATFORM_RE = new RegExp(`\\b(${PLATFORMS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');

/** The uploader is a channel that hosts sets, not the DJ. */
export const isPlatform = (name?: string) => !!name && PLATFORMS.includes(norm(name));

/** Names worth looking up: the title split at venues, platforms and separators, plus the uploader when it is a DJ. */
export function candidates(title: string, uploader?: string): string[] {
  const parts = title
    .replace(PLATFORM_RE, ' | ')
    .split(/\s+[|\-–:@]\s+|\s*\|\s*|\s+(?:live at|at|b2b|x|presents|in|from)\s+|[()[\]]/i)
    .map((p) => p.replace(/\b(dj set|dj mix|mixtape|mix|live|set|podcast|session|sessions|episode|ep\.?|full|stream|showcase)\b/gi, ' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 2 && p.length < 40 && !/^\d+$/.test(p));
  const dj = uploader && !isPlatform(uploader) ? uploader.trim() : undefined;
  return [...new Set([dj, ...parts].filter(Boolean) as string[])].slice(0, 3);
}

/**
 * The DJ, when Dizko knows them for sure: only a confident profile match whose name is in the mix title (or is
 * the uploader) counts, so a near miss never puts the wrong DJ's dates next to a mix.
 */
export async function findArtist(title: string, uploader?: string): Promise<Artist | undefined> {
  const inTitle = norm(title);
  for (const q of candidates(title, uploader)) {
    const r = await getArtist(q).catch(() => null);
    const e = r?.mode === 'profile' ? r.entity : null;
    if (!e?.name) continue;
    const name = norm(e.name);
    if (isPlatform(e.name)) continue;
    if (!inTitle.includes(name) && name !== norm(uploader ?? '')) continue;
    return {
      name: e.name,
      url: r.page?.page_url ?? e.dizko_url,
      claimed: !!r.page?.published,
      fetchedAt: Date.now(),
      v: 2,
      soundcloud: typeof e.links?.soundcloud === 'string' ? e.links.soundcloud : undefined,
      genres: (e.genres ?? []).slice(0, 3),
      cities: (e.cities ?? []).slice(0, 3),
      events: [...(e.upcoming_appearances ?? [])]
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .slice(0, 10)
        .map((ev) => ({ title: ev.title, date: ev.date, city: ev.city, venue: ev.venue, url: ev.event_url })),
    };
  }
  return undefined;
}
