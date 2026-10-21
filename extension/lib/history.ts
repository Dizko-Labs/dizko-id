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
    progress: undefined,
    waitingFor: undefined,
    listening: undefined,
    error: undefined,
    rows: job.rows.map((r) => (r.status === 'searching' ? { ...r, status: 'queued' } : r)),
    savedAt: Date.now(),
  };
  const rest = (await history()).filter((h) => mixKey(h.mix.url) !== mixKey(job.mix.url));
  await browser.storage.local.set({ [KEY]: [entry, ...rest].slice(0, LIMIT) });
}

export async function forget(url: string) {
  await browser.storage.local.set({ [KEY]: (await history()).filter((h) => mixKey(h.mix.url) !== mixKey(url)) });
}
