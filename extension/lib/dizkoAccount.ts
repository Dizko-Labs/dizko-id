/**
 * Linking Dizko ID to a Dizko account, so the DJs and artists from scanned mixes shape the Dizko feed.
 * Dizko's OAuth (api.dizko.app): the extension registers itself once as a public client, signs in with
 * authorization code + PKCE through chrome.identity, and then sends a taste summary to
 * PUT /connector/v1/taste-import (scope taste:write). Only names and weights leave the browser.
 */
import { installId } from './analytics';
import { isPlatform } from './dizko';
import type { Saved } from './history';
import { norm } from './match';

const API = 'https://api.dizko.app';
// the resource Dizko's OAuth binds tokens to; the same value must go to authorize and token
const RESOURCE = 'https://mcp.dizko.app/mcp';
const SCOPE = 'events:read taste:write';

export interface Account {
  clientId?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  /** follow the scanned DJs on Dizko too (a separate choice from importing taste) */
  follow?: boolean;
  linkedAt?: number;
  syncedAt?: number;
  last?: { artists: number; genres: number; followed: number };
}

export async function account(): Promise<Account> {
  return ((await browser.storage.local.get('dizkoAccount')).dizkoAccount as Account | undefined) ?? {};
}
async function save(patch: Partial<Account>) {
  await browser.storage.local.set({ dizkoAccount: { ...(await account()), ...patch } });
}

const redirect = () => browser.identity.getRedirectURL('dizko');
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function clientId(): Promise<string> {
  const known = (await account()).clientId;
  if (known) return known;
  const res = await fetch(`${API}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_name: 'Dizko ID', redirect_uris: [redirect()], scope: SCOPE, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
  });
  const id = (await res.json().catch(() => ({})))?.client_id;
  if (!id) throw new Error(`Dizko would not register the extension (${res.status})`);
  await save({ clientId: id });
  return id;
}

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(`${API}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Dizko sign-in failed (${j.error ?? res.status})`);
  await save({ access: j.access_token, refresh: j.refresh_token, expires: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token as string;
}

/** Sign in on Dizko's own page (or create an account there) and approve the import. */
export async function link(follow: boolean) {
  const id = await clientId();
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const url = new URL(`${API}/oauth/authorize`);
  url.search = new URLSearchParams({ response_type: 'code', client_id: id, redirect_uri: redirect(), scope: SCOPE, state, code_challenge: challenge, code_challenge_method: 'S256', resource: RESOURCE }).toString();
  const back = new URL((await browser.identity.launchWebAuthFlow({ url: url.href, interactive: true }))!);
  if (back.searchParams.get('error')) throw new Error(back.searchParams.get('error') === 'access_denied' ? 'Linking was cancelled' : `Dizko said ${back.searchParams.get('error')}`);
  const code = back.searchParams.get('code');
  if (back.searchParams.get('state') !== state || !code) throw new Error('Linking was cancelled');
  await tokenRequest({ grant_type: 'authorization_code', code, client_id: id, redirect_uri: redirect(), code_verifier: verifier, resource: RESOURCE });
  await save({ follow, linkedAt: Date.now() });
}

async function bearer(): Promise<string | undefined> {
  const a = await account();
  if (!a.access) return undefined;
  if ((a.expires ?? 0) > Date.now() + 60_000) return a.access;
  if (!a.refresh || !a.clientId) return undefined;
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: a.refresh, client_id: a.clientId }).catch(() => undefined);
}

/** Display names out of a credit: "A, B & C feat. D" -> A, B, C, D. */
function credits(artist: string): string[] {
  return artist.split(/\s*(?:,|&|\bx\b|\bfeat\.?|\bft\.?|\bfeaturing\b|\bvs\.?)\s*/i).map((s) => s.trim()).filter((s) => s.length > 1);
}

/**
 * The summary Dizko receives: the DJs scanned (stronger the more of their mixes), the artists of ticked tracks
 * (stronger the more often ticked), and the DJs' genres. No titles, carts, BPMs or scan history.
 */
export function tasteOf(items: Saved[], follow: boolean, install: string) {
  const artists = new Map<string, { name: string; weight: number; soundcloud_url?: string }>();
  const add = (name: string, weight: number, soundcloud_url?: string) => {
    const key = norm(name);
    if (!key) return;
    const was = artists.get(key);
    // noisy-or, as Dizko merges sources: repeats strengthen without passing 1
    artists.set(key, { name: was?.name ?? name, weight: was ? 1 - (1 - was.weight) * (1 - weight) : weight, soundcloud_url: was?.soundcloud_url ?? soundcloud_url });
  };
  const djs = new Map<string, { name: string; dizko_id?: string }>();
  const genres = new Map<string, number>();
  for (const h of items) {
    const dj = h.artist && !isPlatform(h.artist.name) ? h.artist : undefined;
    const djName = dj?.name ?? (isPlatform(h.mix.uploader) ? undefined : h.mix.uploader);
    if (djName) {
      add(djName, 0.6, dj?.soundcloud);
      djs.set(norm(djName), { name: djName, dizko_id: dj?.id });
      for (const g of dj?.genres ?? []) genres.set(g, (genres.get(g) ?? 0) + 1);
    }
    for (const r of h.rows) if (r.selected) for (const name of credits(r.track.artist)) add(name, 0.35);
  }
  const top = Math.max(1, ...genres.values());
  return {
    source: 'dizko_id' as const,
    install_id: install,
    artists: [...artists.values()].sort((a, b) => b.weight - a.weight).slice(0, 200).map((a) => ({ ...a, weight: Math.round(a.weight * 1000) / 1000, soundcloud_url: a.soundcloud_url?.startsWith('https://soundcloud.com/') ? a.soundcloud_url : undefined })),
    genres: Object.fromEntries([...genres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([g, n]) => [g, Math.round((n / top) * 1000) / 1000])),
    djs: [...djs.values()].slice(0, 100),
    follow_djs: follow,
  };
}

/** Send the current library's taste; replaces the previous import for this install. */
export async function sync(items: Saved[]) {
  const token = await bearer();
  if (!token) throw new Error('Link to Dizko again');
  const a = await account();
  const res = await fetch(`${API}/connector/v1/taste-import`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(tasteOf(items, !!a.follow, await installId())),
  });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw new Error('Link to Dizko again');
  if (!res.ok) throw new Error(`Dizko did not take the import (${res.status})`);
  await save({ syncedAt: Date.now(), last: { artists: j.imported_artists ?? 0, genres: j.genres ?? 0, followed: j.followed_djs ?? 0 } });
}

/** Remove the import from the Dizko account, revoke the token, forget the link here. */
export async function unlink() {
  const a = await account();
  const token = await bearer();
  if (token) await fetch(`${API}/connector/v1/taste-import`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  for (const t of [a.access, a.refresh]) {
    if (t && a.clientId) await fetch(`${API}/oauth/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: t, client_id: a.clientId }) }).catch(() => {});
  }
  await browser.storage.local.set({ dizkoAccount: { clientId: a.clientId } });
}
