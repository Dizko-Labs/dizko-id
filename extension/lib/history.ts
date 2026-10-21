import { findArtist, isPlatform } from './dizko';
import { itunesMatches } from './itunes';
import { soundOf } from './soundcloudPage';
import { trackKey, type Job } from './types';
import { cleanMixUrl } from './utm';
import { profileAvatar, profileOf } from './soundcloud';

/** A mix the DJ has scanned, kept across sessions so the panel can show it again without listening again. */
export interface Saved extends Job {
  savedAt: number;
}

const KEY = 'history';

/** The DJ for a saved mix: Dizko's match, else the uploader unless that is a channel hosting other DJs' sets. */
export const djOf = (h: Saved) => (h.artist && !isPlatform(h.artist.name) ? h.artist.name : isPlatform(h.mix.uploader) ? undefined : h.mix.uploader);
const LIMIT = 50;

/** One entry per mix: YouTube's extra query parameters (playlist, start time) do not make a new mix. */
export const mixKey = (url: string) => cleanMixUrl(url);

export async function history(): Promise<Saved[]> {
  return ((await browser.storage.local.get(KEY))[KEY] as Saved[] | undefined) ?? [];
}

export async function saved(url: string): Promise<Saved | undefined> {
  return (await history()).find((h) => mixKey(h.mix.url) === mixKey(url));
}

/** Upsert the mix to the top of the history. In-flight state is dropped so a restored mix opens ready to review. */
export async function remember(job: Job) {
  if (!job.rows.length) return;
  const entry: Saved = {
    ...job,
    phase: job.phase === 'done' ? 'done' : 'review',
    waitingFor: undefined,
    listening: undefined,
    following: undefined,
    error: undefined,
    rows: job.rows.map((r) => (r.status === 'searching' ? { ...r, status: 'queued' } : r)),
    savedAt: Date.now(),
  };
  const rest = (await history()).filter((h) => mixKey(h.mix.url) !== mixKey(job.mix.url));
  await browser.storage.local.set({ [KEY]: [entry, ...rest].slice(0, LIMIT) });
}

/**
 * Mixes saved before the uploader or artwork was recorded: read them from the mix page once (SoundCloud's hydration data,
 * YouTube's ownerChannelName) so the library can name the DJ.
 */
export async function backfillUploaders() {
  const found = new Map<string, { uploader?: string; art?: string }>();
  for (const h of await history()) {
    if ((h.mix.uploader || h.artist) && h.mix.art) continue;
    const html = await fetch(h.mix.url, { credentials: 'include' }).then((r) => r.text()).catch(() => '');
    const sound = (() => { try { return soundOf(html); } catch { return null; } })();
    const channel = html.match(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/)?.[1];
    const name: string | undefined = sound?.user?.username ?? (channel ? JSON.parse(`"${channel}"`) : undefined);
    const art = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    if (!name && !art) continue;
    found.set(mixKey(h.mix.url), { uploader: name, art });
  }
  if (!found.size) return;
  // re-read: a mix may have been saved while the pages were loading
  const now = await history();
  for (const h of now) {
    const f = found.get(mixKey(h.mix.url));
    h.mix.uploader ??= f?.uploader;
    h.mix.art ??= f?.art;
  }
  await browser.storage.local.set({ [KEY]: now });
}

/**
 * Saved mixes with no DJ yet, or a hosting channel taken for one: ask Dizko from the title and uploader. Each mix is
 * asked at most once a week, since the worker restarts often.
 */
export async function backfillArtists() {
  const week = 7 * 24 * 3600 * 1000;
  const found = new Map<string, NonNullable<Job['artist']> | null>();
  for (const h of await history()) {
    if ((h.artist && !isPlatform(h.artist.name)) || Date.now() - (h.mix.artistCheckedAt ?? 0) < week) continue;
    found.set(mixKey(h.mix.url), (await findArtist(h.mix.title, h.mix.uploader).catch(() => undefined)) ?? null);
  }
  if (!found.size) return;
  const now = await history();
  for (const h of now) {
    if (!found.has(mixKey(h.mix.url))) continue;
    const a = found.get(mixKey(h.mix.url));
    h.mix.artistCheckedAt = Date.now();
    if (a && (!h.artist || isPlatform(h.artist.name))) h.artist = a;
  }
  await browser.storage.local.set({ [KEY]: now });
}

/** Profile pictures for saved DJs: Dizko's SoundCloud link, else the uploader's own profile. Weekly at most per mix. */
export async function backfillAvatars() {
  const week = 7 * 24 * 3600 * 1000;
  const pics = new Map<string, { artist?: string; uploader?: string }>();
  let asked = 0;
  for (const h of await history()) {
    if (asked >= 20 || Date.now() - (h.mix.avatarCheckedAt ?? 0) < week) continue;
    const forArtist = h.artist && !isPlatform(h.artist.name) && !h.artist.avatar && h.artist.soundcloud;
    const forUploader = !h.mix.uploaderAvatar && h.mix.uploader && !isPlatform(h.mix.uploader) && /soundcloud\.com/.test(h.mix.url) && profileOf(h.mix.url);
    if (!forArtist && !forUploader) continue;
    asked++;
    pics.set(mixKey(h.mix.url), {
      artist: forArtist ? await profileAvatar(forArtist).catch(() => undefined) : undefined,
      uploader: forUploader ? await profileAvatar(forUploader).catch(() => undefined) : undefined,
    });
  }
  if (!pics.size) return;
  const now = await history();
  for (const h of now) {
    const p = pics.get(mixKey(h.mix.url));
    if (!p) continue;
    h.mix.avatarCheckedAt = Date.now();
    if (p.artist && h.artist) h.artist.avatar ??= p.artist;
    h.mix.uploaderAvatar ??= p.uploader;
  }
  await browser.storage.local.set({ [KEY]: now });
}

/**
 * Cover art for ticked tracks that have none (saved before art was kept, or from a written tracklist): one
 * iTunes Search API lookup each (public, no key), a few a second, at most 60 per run.
 */
export async function backfillArt() {
  const art = new Map<string, string>();
  const tried = new Set<string>();
  for (const h of await history()) {
    for (const r of h.rows) {
      const key = trackKey(r);
      if (!r.selected || r.track.art || r.offer?.art || tried.has(key) || tried.size >= 60) continue;
      tried.add(key);
      const url: string | undefined = (await itunesMatches(r.track.artist, r.track.title))[0]?.artworkUrl100;
      if (url) art.set(key, url.replace('100x100bb', '200x200bb'));
      await new Promise((ok) => setTimeout(ok, 350));
    }
  }
  if (!art.size) return;
  const now = await history();
  for (const h of now) for (const r of h.rows) r.track.art ??= art.get(trackKey(r));
  await browser.storage.local.set({ [KEY]: now });
}

export async function forget(url: string) {
  await browser.storage.local.set({ [KEY]: (await history()).filter((h) => mixKey(h.mix.url) !== mixKey(url)) });
}
