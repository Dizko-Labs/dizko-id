/**
 * Sign-in for services with an official playlist API that the DJ registers an app for (Spotify, SoundCloud).
 * Authorization code flow with PKCE through chrome.identity, so the login happens on the service's own page.
 * App details and tokens live in this browser's extension storage only.
 */
export type Service = 'spotify' | 'soundcloud';

export interface App {
  clientId: string;
  /** SoundCloud treats every client as confidential, so its token exchange needs the app secret */
  clientSecret?: string;
}

interface Tokens {
  access: string;
  refresh?: string;
  expires: number;
}

const CONF: Record<Service, { authorize: string; token: string; scope?: string }> = {
  spotify: {
    authorize: 'https://accounts.spotify.com/authorize',
    token: 'https://accounts.spotify.com/api/token',
    scope: 'playlist-modify-private playlist-modify-public',
  },
  soundcloud: {
    authorize: 'https://secure.soundcloud.com/authorize',
    token: 'https://secure.soundcloud.com/oauth/token',
  },
};

/** The redirect to register in the service's app settings, e.g. https://<extension id>.chromiumapp.org/spotify */
export const redirectUri = (s: Service) => browser.identity.getRedirectURL(s);

export async function getApp(s: Service): Promise<App | undefined> {
  return ((await browser.storage.local.get('apps')).apps as Partial<Record<Service, App>> | undefined)?.[s];
}

export async function setApp(s: Service, app: App | undefined) {
  const apps = ((await browser.storage.local.get('apps')).apps as Partial<Record<Service, App>> | undefined) ?? {};
  await browser.storage.local.set({ apps: { ...apps, [s]: app } });
  await saveTokens(s, undefined);
}

async function saveTokens(s: Service, t: Tokens | undefined) {
  const auth = ((await browser.storage.local.get('auth')).auth as Partial<Record<Service, Tokens>> | undefined) ?? {};
  await browser.storage.local.set({ auth: { ...auth, [s]: t } });
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function exchange(s: Service, app: App, params: Record<string, string>): Promise<Tokens> {
  const body = new URLSearchParams({ client_id: app.clientId, ...params });
  if (app.clientSecret) body.set('client_secret', app.clientSecret);
  const res = await fetch(CONF[s].token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`${s} sign-in failed (${res.status} ${j.error ?? ''})`.trim());
  const t: Tokens = { access: j.access_token, refresh: j.refresh_token ?? params.refresh_token, expires: Date.now() + (j.expires_in ?? 3600) * 1000 };
  await saveTokens(s, t);
  return t;
}

/** A valid access token: the stored one, a refreshed one, or a fresh sign-in on the service's page. */
export async function accessToken(s: Service): Promise<string> {
  const app = await getApp(s);
  if (!app?.clientId) throw new Error(`Connect ${s === 'spotify' ? 'Spotify' : 'SoundCloud'} first`);
  const stored = ((await browser.storage.local.get('auth')).auth as Partial<Record<Service, Tokens>> | undefined)?.[s];
  if (stored && stored.expires > Date.now() + 60_000) return stored.access;
  if (stored?.refresh) {
    try {
      return (await exchange(s, app, { grant_type: 'refresh_token', refresh_token: stored.refresh })).access;
    } catch {
      // refresh tokens can be single use or revoked: fall through to a new sign-in
    }
  }
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  const url = new URL(CONF[s].authorize);
  url.search = new URLSearchParams({
    client_id: app.clientId,
    response_type: 'code',
    redirect_uri: redirectUri(s),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    ...(CONF[s].scope ? { scope: CONF[s].scope } : {}),
  }).toString();
  const back = new URL((await browser.identity.launchWebAuthFlow({ url: url.href, interactive: true }))!);
  const code = back.searchParams.get('code');
  if (back.searchParams.get('state') !== state || !code) throw new Error(`${s} sign-in was cancelled`);
  return (await exchange(s, app, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(s), code_verifier: verifier })).access;
}
