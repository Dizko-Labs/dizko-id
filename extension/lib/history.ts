import { findArtist, isPlatform } from './dizko';
import type { Job } from './types';

/** A mix the DJ has scanned, kept across sessions so the panel can show it again without listening again. */
export interface Saved extends Job {
  savedAt: number;
}

const KEY = 'history';
const LIMIT = 50;

/** One entry per mix: YouTube's extra query parameters (playlist, start time) do not make a new mix. */
export const mixKey = (url: string) => url.split('&')[0]!;

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
    making: undefined,
    error: undefined,
    rows: job.rows.map((r) => (r.status === 'searching' ? { ...r, status: 'queued' } : r)),
    savedAt: Date.now(),
  };
  const rest = (await history()).filter((h) => mixKey(h.mix.url) !== mixKey(job.mix.url));
  await browser.storage.local.set({ [KEY]: [entry, ...rest].slice(0, LIMIT) });
}

/**
 * Mixes saved before the uploader was recorded: read it from the mix page once (SoundCloud's hydration data,
 * YouTube's ownerChannelName) so the library can name the DJ.
 */
export async function backfillUploaders() {
  const found = new Map<string, string>();
  for (const h of await history()) {
    if (h.mix.uploader || h.artist) continue;
    const html = await fetch(h.mix.url, { credentials: 'include' }).then((r) => r.text()).catch(() => '');
    const hydration = html.match(/__sc_hydration\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/)?.[1];
    const sound = hydration ? JSON.parse(hydration).find((x: any) => x.hydratable === 'sound')?.data : null;
    const channel = html.match(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/)?.[1];
    const name: string | undefined = sound?.user?.username ?? (channel ? JSON.parse(`"${channel}"`) : undefined);
    if (!name) continue;
    found.set(mixKey(h.mix.url), name);
  }
  if (!found.size) return;
  // re-read: a mix may have been saved while the pages were loading
  const now = await history();
  for (const h of now) h.mix.uploader ??= found.get(mixKey(h.mix.url));
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

export async function forget(url: string) {
  await browser.storage.local.set({ [KEY]: (await history()).filter((h) => mixKey(h.mix.url) !== mixKey(url)) });
}
