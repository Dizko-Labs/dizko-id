import { norm } from './match';

/** What the panel shows about the DJ behind a mix, from Dizko's public event graph. */
export interface Artist {
  name: string;
  url: string;
  /** the DJ has published their Dizko page; otherwise the panel invites them to claim it */
  claimed: boolean;
  genres: string[];
  cities: string[];
  links: { label: string; url: string }[];
  events: { title: string; date: string; city: string; venue: string; url: string }[];
}

const LABELS: Record<string, string> = { instagram: 'Instagram', soundcloud: 'SoundCloud', resident_advisor: 'RA', bandcamp: 'Bandcamp', spotify: 'Spotify', website: 'Website' };

const tag = (url: string) => {
  const u = new URL(url);
  u.searchParams.set('utm_source', 'mix_to_cart');
  u.searchParams.set('utm_medium', 'extension');
  return u.href;
};

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
        arguments: { query, limit: 5 },
        _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} },
      },
    }),
  });
  const text = (await res.json())?.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

/** Names worth looking up: the uploader, then the title with mix words and venues stripped. */
export function candidates(title: string, uploader?: string): string[] {
  const parts = title
    .split(/\s+[|\-–:@]\s+|\s+(?:live at|at|b2b|x|presents)\s+|[()[\]]/i)
    .map((p) => p.replace(/\b(boiler room|dj set|dj mix|mixtape|mix|live|set|podcast|session|sessions|episode|ep\.?|full)\b/gi, ' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 2 && p.length < 40 && !/^\d+$/.test(p));
  return [...new Set([uploader?.trim(), ...parts].filter(Boolean) as string[])].slice(0, 3);
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
    if (!inTitle.includes(name) && name !== norm(uploader ?? '')) continue;
    return {
      name: e.name,
      url: tag(r.page?.page_url ?? e.dizko_url),
      claimed: !!r.page?.published,
      genres: (e.genres ?? []).slice(0, 3),
      cities: (e.cities ?? []).slice(0, 3),
      links: Object.entries(e.links ?? {}).filter(([k]) => LABELS[k]).map(([k, url]) => ({ label: LABELS[k]!, url: String(url) })).slice(0, 4),
      events: [...(e.upcoming_appearances ?? [])]
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .slice(0, 3)
        .map((ev) => ({ title: ev.title, date: ev.date, city: ev.city, venue: ev.venue, url: /dizko\.app/.test(ev.event_url) ? tag(ev.event_url) : ev.event_url })),
    };
  }
  return undefined;
}
