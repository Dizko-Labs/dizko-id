import { accessToken } from './oauth';
import { judge, searchQuery, splitTitle } from './match';
import type { Offer, Row, Track } from './types';

export interface Made {
  url: string;
  added: number;
  /** "Artist - Title" for tracks the service did not have */
  missing: string[];
}

/** Judge with the best ISRC known: Shazam's, or the one the Beatport match carried. */
const withIsrc = (row: Row): Track => ({ ...row.track, isrc: row.track.isrc ?? row.offer?.isrc });
const label = (row: Row) => `${row.track.artist} - ${row.track.title}`;

function best(track: Track, candidates: { id: string; offer: Offer }[]): string | undefined {
  let top: { id: string; score: number } | undefined;
  for (const c of candidates) {
    const v = judge(track, c.offer);
    if (v.ok && (!top || v.score > top.score)) top = { id: c.id, score: v.score };
  }
  return top?.id;
}

// ---- Spotify Web API (developer app in the DJ's name; development mode allows the owner plus a few listed users)

async function spotify(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken('spotify')}`, 'Content-Type': 'application/json', ...init.headers },
  });
  return { status: res.status, data: await res.json().catch(() => undefined) };
}

function spotifyOffer(t: any): Offer {
  // Spotify writes versions as "Title - Extended Mix"; the matcher expects them bracketed
  const name = String(t.name ?? '').replace(/ - ([^-]+)$/, ' ($1)');
  const { base, version } = splitTitle(name);
  return { store: 'spotify', id: t.id, url: t.external_urls?.spotify ?? '', artists: (t.artists ?? []).map((a: any) => a.name), title: base, version, isrc: t.external_ids?.isrc };
}

export async function spotifyPlaylist(name: string, description: string, rows: Row[]): Promise<Made> {
  const uris: string[] = [];
  const missing: string[] = [];
  for (const row of rows) {
    const track = withIsrc(row);
    let id: string | undefined;
    for (const q of [track.isrc && `isrc:${track.isrc}`, searchQuery(track)].filter(Boolean) as string[]) {
      const r = await spotify(`/search?type=track&limit=10&q=${encodeURIComponent(q)}`);
      id = best(track, (r.data?.tracks?.items ?? []).map((t: any) => ({ id: t.id, offer: spotifyOffer(t) })));
      if (id) break;
    }
    if (id) uris.push(`spotify:track:${id}`);
    else missing.push(label(row));
  }
  const made = await spotify('/me/playlists', { method: 'POST', body: JSON.stringify({ name, description, public: false }) });
  if (!made.data?.id) throw new Error(`Spotify would not create the playlist (${made.status})`);
  for (let i = 0; i < uris.length; i += 100) {
    const body = JSON.stringify({ uris: uris.slice(i, i + 100) });
    // /items replaced /tracks in Spotify's February 2026 API changes; try the older path if an account still needs it
    let r = await spotify(`/playlists/${made.data.id}/items`, { method: 'POST', body });
    if (r.status === 404) r = await spotify(`/playlists/${made.data.id}/tracks`, { method: 'POST', body });
    if (r.status >= 300) throw new Error(`Spotify would not add the tracks (${r.status})`);
  }
  return { url: made.data.external_urls?.spotify ?? `https://open.spotify.com/playlist/${made.data.id}`, added: uris.length, missing };
}

// ---- SoundCloud API (the DJ's registered app)

async function soundcloud(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.soundcloud.com${path}`, {
    ...init,
    headers: { Authorization: `OAuth ${await accessToken('soundcloud')}`, Accept: 'application/json; charset=utf-8', 'Content-Type': 'application/json', ...init.headers },
  });
  return { status: res.status, data: await res.json().catch(() => undefined) };
}

function soundcloudOffer(t: any): Offer {
  // Uploads are titled "Artist - Title (Version)" by labels, or just "Title" by the artist themselves
  const raw = String(t.title ?? '');
  const dash = raw.indexOf(' - ');
  const { base, version } = splitTitle(dash > 0 ? raw.slice(dash + 3) : raw);
  const artists = [dash > 0 ? raw.slice(0, dash) : '', t.user?.username ?? '', t.publisher_metadata?.artist ?? ''].filter(Boolean);
  return { store: 'soundcloud', id: String(t.id), url: t.permalink_url ?? '', artists, title: base, version, isrc: t.isrc || t.publisher_metadata?.isrc };
}

export async function soundcloudPlaylist(name: string, description: string, rows: Row[]): Promise<Made> {
  const ids: number[] = [];
  const missing: string[] = [];
  for (const row of rows) {
    const track = withIsrc(row);
    const r = await soundcloud(`/tracks?q=${encodeURIComponent(searchQuery(track))}&access=playable&limit=20`);
    const list = Array.isArray(r.data) ? r.data : r.data?.collection ?? [];
    const id = best(track, list.map((t: any) => ({ id: String(t.id), offer: soundcloudOffer(t) })));
    if (id) ids.push(Number(id));
    else missing.push(label(row));
  }
  const made = await soundcloud('/playlists', {
    method: 'POST',
    body: JSON.stringify({ playlist: { title: name, description, sharing: 'private', tracks: ids.map((id) => ({ id })) } }),
  });
  if (!made.data?.id) throw new Error(`SoundCloud would not create the playlist (${made.status})`);
  return { url: made.data.permalink_url ?? `https://soundcloud.com/you/sets`, added: ids.length, missing };
}
