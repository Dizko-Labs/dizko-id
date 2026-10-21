import { collapse, samplePoints, type Hit } from '@/lib/identify';
import { judge, pick, searchQuery, splitTitle } from '@/lib/match';
import type { ClipResult, OffscreenRequest, PanelRequest, SourceInfo, SourceRequest } from '@/lib/messages';
import {
  BEATPORT_CART, bandcampAddToCart, bandcampReadSearch, bandcampReadTrack, bandcampSearchUrl,
  beatportApi, beatportBuyAll, beatportPlaylistUrl, storeCheck,
} from '@/lib/stores';
import { findArtist, isPlatform, isStale } from '@/lib/dizko';
import { backfillArt, backfillArtists, backfillUploaders, forget, mixKey, remember, saved } from '@/lib/history';
import { setApp } from '@/lib/oauth';
import { profileMixes } from '@/lib/soundcloud';
import { soundcloudPlaylist, spotifyPlaylist } from '@/lib/playlists';
import { parseTracklist } from '@/lib/tracklist';
import { BANDCAMP_CARTABLE, BEATPORT_CARTABLE, coverage, type Job, type Offer, type Row, type Store, type Track } from '@/lib/types';

/** Price used when a Bandcamp track is "name your price" with no minimum. */
const NAME_YOUR_PRICE = 1;

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  recover();
  backfillUploaders().then(backfillArtists).then(backfillArt).catch(() => {});
  browser.runtime.onMessage.addListener((msg: PanelRequest & { streamId?: string }, sender, reply) => {
    // The button on the SoundCloud page: open the panel on that tab (the click is the user gesture it needs)
    // and leave a note so the panel starts identifying once it has read the mix
    if ((msg as { type: string }).type === 'launch' && sender.tab?.id) {
      const tabId = sender.tab.id;
      const target = (msg as { url?: string }).url ?? sender.tab.url ?? '';
      // Opened inside the click's user gesture; for the whole window if the tab-specific open is refused
      browser.sidePanel
        .open({ tabId })
        .catch(() => browser.sidePanel.open({ windowId: sender.tab!.windowId }))
        .then(() => true, () => false)
        .then(async (opened) => {
          // Another mix still listening or carting: stop it (its finds stay in the library) and read this one
          const job = await getJob();
          if (job && mixKey(job.mix.url) !== mixKey(target) && busy(job)) {
            await settle();
            // On the mix's own page read it now; from a listing the page is about to change and the panel reads it then
            if (mixKey(sender.tab!.url ?? '') === mixKey(target)) await read(tabId);
          }
          reply({ opened });
        })
        .catch(() => reply({ opened: false }));
      return true;
    }
    if (!msg.type?.startsWith('panel:')) return;
    handle(msg).then(reply, (e) => reply({ error: String(e) }));
    return true;
  });
});

// ---- job state lives in session storage so the side panel can subscribe and a restarted worker can resume reading it

async function getJob(): Promise<Job | null> {
  return ((await browser.storage.session.get('job')).job as Job | undefined) ?? null;
}
async function setJob(job: Job | null) {
  await browser.storage.session.set({ job });
  if (job) await remember(job);
}
/**
 * Listening and carting run at the same time and both edit the job, so every read-modify-write goes through one
 * queue: neither can overwrite a change the other made in between.
 */
let queue: Promise<unknown> = Promise.resolve();
function update(change: (job: Job) => Job): Promise<Job | null> {
  const next = queue.then(async () => {
    const job = await getJob();
    if (!job) return null;
    const changed = change(job);
    await setJob(changed);
    return changed;
  });
  queue = next.catch(() => {});
  return next;
}

const keyOf = (t: Track) => `${t.artist}|${t.title}`;
function patchRow(key: string, patch: Partial<Row>) {
  return update((job) => ({ ...job, rows: job.rows.map((r) => (keyOf(r.track) === key ? { ...r, ...patch } : r)) }));
}

/** Separate switches, so stopping the cart run leaves listening going and the other way round. */
let stopListening = false;
let stopCarting = false;
let stopFollowing = false;

/**
 * Chrome stops an idle extension worker after about 30 seconds, and a pending timer does not count as activity.
 * Wait in short steps that touch extension storage so a long wait (a Shazam back-off, a login) keeps it alive.
 */
async function nap(ms: number, stopped = () => stopListening) {
  for (const end = Date.now() + ms; Date.now() < end && !stopped(); ) {
    // short steps so Stop is felt within a second; each storage read also counts as worker activity
    await new Promise((r) => setTimeout(r, Math.min(1000, end - Date.now())));
    await browser.storage.session.get('job');
  }
}

const busy = (j: Job) => j.phase === 'identifying' || j.phase === 'carting' || !!j.listening || !!j.following;

/** Stop whatever the current mix is doing, wait for it to settle (it is saved as it goes), then read another tab. */
async function switchTo(tabId: number) {
  await settle();
  return read(tabId);
}

async function settle() {
  stopListening = stopCarting = stopFollowing = true;
  for (let i = 0; i < 80; i++) {
    const j = await getJob();
    if (!j || !busy(j)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const left = await getJob();
  // A stuck job is saved as it stands so the new mix can start
  if (left && busy(left)) await setJob({ ...left, phase: 'review', listening: false, following: false, waitingFor: undefined });
  stopListening = stopCarting = stopFollowing = false;
}

/** A fresh worker means any job that was running died with the old one: settle it so the panel is not stuck. */
async function recover() {
  const job = await getJob();
  if (!job || (job.phase !== 'identifying' && job.phase !== 'carting' && !job.listening && !job.following)) return;
  const rows = job.rows.map((r) => (r.status === 'searching' ? { ...r, status: 'queued' as const } : r));
  const error = job.phase === 'carting'
    ? 'Adding to cart stopped part way. Press Add to cart again to finish.'
    : 'Listening stopped part way. These are the tracks found before it did.';
  await setJob({ ...job, rows, phase: job.phase === 'carting' ? 'done' : 'review', listening: false, following: false, waitingFor: undefined, error });
}

async function handle(msg: PanelRequest & { streamId?: string }): Promise<unknown> {
  switch (msg.type) {
    case 'panel:read':
      return read(msg.tabId);
    case 'panel:profile-mixes':
      return { mixes: await profileMixes(msg.url).catch(() => []) };
    case 'panel:scan':
      // a new tab on the mix: the panel follows the active tab, reads it and starts listening
      await browser.tabs.create({ url: msg.url, active: true });
      return { ok: true };
    case 'panel:forget':
      await forget(msg.url);
      return { ok: true };
    case 'panel:open': {
      const before = await saved(msg.url);
      const now = await getJob();
      if (!before || now?.listening || now?.phase === 'carting') return { ok: false };
      const { savedAt: _, ...job } = before;
      await setJob(job);
      return { ok: true };
    }
    case 'panel:switch':
      return switchTo(msg.tabId);
    case 'panel:identify':
      stopListening = false;
      identify(msg.tabId, msg.streamId, msg.resume).catch((e) =>
        update((job) => ({ ...job, phase: job.phase === 'identifying' ? 'review' : job.phase, listening: false, error: e instanceof Error ? e.message : String(e) })),
      );
      return { ok: true };
    case 'panel:toggle':
      await update((job) => ({ ...job, rows: job.rows.map((r, i) => (i === msg.index ? { ...r, selected: !r.selected } : r)) }));
      return { ok: true };
    case 'panel:select':
      await update((job) => ({ ...job, rows: job.rows.map((r) => ({ ...r, selected: msg.all })) }));
      return { ok: true };
    case 'panel:cart':
      // Listening carries on: the cart run takes the tracks ticked now, and later finds can be added after
      if ((await getJob())?.phase === 'carting') return { ok: false };
      stopCarting = false;
      cart(msg.stores).catch((e) =>
        update((job) => ({ ...job, phase: job.listening ? 'identifying' : 'done', waitingFor: undefined, error: e instanceof Error ? e.message : String(e) })),
      );
      return { ok: true };
    case 'panel:stop':
      // The panel's Stop during a cart run stops the cart run; otherwise it stops listening
      if ((await getJob())?.phase === 'carting') stopCarting = true;
      else stopListening = true;
      return { ok: true };
    case 'panel:playlist':
      if ((await getJob())?.making) return { ok: false };
      playlist(msg.service).catch(() => {});
      return { ok: true };
    case 'panel:connect':
      await setApp(msg.service, msg.app);
      return { ok: true };
    case 'panel:stop-listening':
      stopListening = true;
      return { ok: true };
    case 'panel:reset': {
      // Start over means scan this mix afresh, so it leaves the history too
      stopListening = true;
      stopCarting = true;
      stopFollowing = true;
      const job = await getJob();
      if (job) await forget(job.mix.url);
      await setJob(null);
      return { ok: true };
    }
  }
}

// ---- reading the mix page

async function ask<T>(tabId: number, msg: SourceRequest): Promise<T> {
  try {
    return await browser.tabs.sendMessage(tabId, msg);
  } catch {
    // Tab was open before the extension loaded: inject the content script, then retry once
    await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/source.js'] });
    return browser.tabs.sendMessage(tabId, msg);
  }
}

const rowFor = (track: Track): Row => ({ track, selected: track.hits >= 2, status: 'queued' });

/** The DJ's Dizko profile arrives a moment after the tracklist, which does not wait for it. */
function lookUpArtist(info: SourceInfo) {
  findArtist(info.title, info.uploader)
    .then((artist) => artist && update((j) => (mixKey(j.mix.url) === mixKey(info.url) ? { ...j, artist } : j)))
    .catch(() => {});
}

async function read(tabId: number) {
  const info = await ask<SourceInfo>(tabId, { type: 'source:info' });
  // A mix scanned before opens as it was left, ticks and cart results included, instead of listening again
  const before = await saved(info.url);
  if (before) {
    const { savedAt: _, ...job } = before;
    job.mix.uploader ??= info.uploader;
    job.mix.art ??= info.art;
    // an older lookup took the hosting channel for the DJ; look again
    if (isPlatform(job.artist?.name)) job.artist = undefined;
    await setJob(job);
    // missing, or saved long enough ago that its dates may have moved: fetch again, showing the old copy meanwhile
    if (!job.artist || isStale(job.artist)) lookUpArtist(info);
    return job;
  }
  const tracks = parseTracklist(info.description);
  const job: Job = {
    mix: { title: info.title, url: info.url, duration: info.duration, uploader: info.uploader, art: info.art },
    rows: tracks.map(rowFor),
    phase: tracks.length ? 'review' : 'reading',
    tracklistFound: tracks.length > 0,
    method: info.stream ? 'stream' : info.seekable ? 'seek' : 'live',
  };
  await setJob(job);
  lookUpArtist(info);
  return job;
}

// ---- identifying by listening

async function offscreen<T>(msg: OffscreenRequest): Promise<T> {
  return browser.runtime.sendMessage(msg);
}

async function ensureOffscreen() {
  const has = await browser.offscreen.hasDocument?.();
  if (!has) {
    await browser.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Listen to the mix tab to identify its tracks',
    });
  }
}

const RATE_LIMITED = 'Shazam is turning away lookups for now (too many in a short time). Try again in an hour.';

/**
 * One Shazam lookup. A 429 means slow down, so wait and retry the same clip a few times, doubling the wait,
 * before giving up on the whole run with a message the DJ can act on.
 */
async function lookup(get: () => Promise<ClipResult>): Promise<ClipResult> {
  for (let wait = 20_000; ; wait *= 2) {
    const r = await get();
    if (r.error !== 'shazam 429') return r;
    if (wait > 80_000 || stopListening) throw new Error(RATE_LIMITED);
    await nap(wait);
    if (stopListening) return {};
  }
}

async function identify(tabId: number, streamId?: string, resume = false) {
  const before = (await getJob())!;
  // Keep listening picks up at the point it stopped, with what it had already heard
  const from = resume ? coverage(before) ?? 0 : 0;
  await update((job) => ({ ...job, phase: job.phase === 'carting' ? 'carting' : 'identifying', listening: true, progress: from, error: undefined }));
  const info = await ask<SourceInfo>(tabId, { type: 'source:info' });
  await ensureOffscreen();
  if (!info.stream) {
    if (!streamId) throw new Error('No audio stream for this tab');
    await offscreen({ type: 'offscreen:start', streamId });
  }
  const hits: Hit[] = resume
    ? before.rows.flatMap((r) => Array.from({ length: r.track.hits }, () => ({ at: r.track.at ?? 0, artist: r.track.artist, title: r.track.title, isrc: r.track.isrc })))
    : [];
  let failed = '';
  const publish = (progress: number) =>
    update((job) => {
      const prior = new Map(job.rows.map((r) => [keyOf(r.track), r]));
      const rows = collapse(hits).map((t) => {
        const was = prior.get(keyOf(t));
        if (!was) return rowFor(t);
        // keep cart results and the DJ's tick or untick; only a track's second hit ticks it automatically
        return { ...was, track: t, selected: was.track.hits < 2 && t.hits >= 2 ? true : was.selected };
      });
      return { ...job, rows, progress };
    });

  try {
    if (info.stream && info.duration) {
      const { at } = samplePoints(info.duration);
      for (let i = Math.floor(from * at.length); i < at.length && !stopListening; i++) {
        const point = at[i]!;
        const seg = info.stream.segments.find((s) => s.start <= point && s.start + s.dur > point);
        if (!seg) continue;
        const r = await lookup(() => offscreen<ClipResult>({ type: 'offscreen:segment', init: info.stream!.init, url: seg.url }));
        if (r.error) failed = r.error;
        if (r.track) hits.push({ at: seg.start, ...r.track });
        await publish((i + 1) / at.length);
      }
    } else if (info.seekable && info.duration) {
      const { at, clip } = samplePoints(info.duration);
      for (let i = Math.floor(from * at.length); i < at.length && !stopListening; i++) {
        const point = at[i]!;
        await ask(tabId, { type: 'source:seek', at: point });
        const r = await lookup(() => offscreen<ClipResult>({ type: 'offscreen:clip', seconds: clip }));
        if (r.error) failed = r.error;
        if (r.track) hits.push({ at: point, ...r.track });
        await publish((i + 1) / at.length);
      }
    } else {
      // No player we can seek (or a live page): sample clips in real time while the DJ plays the mix
      const started = Date.now();
      const limit = info.duration ?? 4 * 3600;
      while (!stopListening && (Date.now() - started) / 1000 < limit) {
        const at = (Date.now() - started) / 1000;
        const r = await lookup(() => offscreen<ClipResult>({ type: 'offscreen:clip', seconds: 10 }));
        if (r.track) hits.push({ at, ...r.track });
        await publish(Math.min(1, at / limit));
        await nap(20_000);
      }
    }
    // Every clip erroring is a broken run, not a mix with no known tracks
    if (!hits.length && failed && failed !== 'silence') throw new Error(`Could not identify any clips (${failed}).`);
  } finally {
    await offscreen({ type: 'offscreen:stop' }).catch(() => {});
    await browser.offscreen.closeDocument().catch(() => {});
    await ask(tabId, { type: 'source:pause' }).catch(() => {});
    // a stopped listen keeps its place, so Keep listening can resume from there
    const stoppedEarly = stopListening;
    await update((job) => ({ ...job, phase: job.phase === 'identifying' ? 'review' : job.phase, listening: false, progress: stoppedEarly ? job.progress : 1 }));
  }
}

// ---- carting

async function load(tabId: number, url: string, settle = 900) {
  await new Promise<void>((resolve) => {
    // Only a "complete" that follows this navigation's "loading" counts; the previous page can report one first
    let loading = false;
    const done = (id: number, change: { status?: string }) => {
      if (id !== tabId) return;
      if (change.status === 'loading') loading = true;
      if (loading && change.status === 'complete') {
        browser.tabs.onUpdated.removeListener(done);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(done);
    browser.tabs.update(tabId, { url });
    setTimeout(() => { browser.tabs.onUpdated.removeListener(done); resolve(); }, 20_000);
  });
  await new Promise((r) => setTimeout(r, settle)); // client-side hydration
}

/**
 * Stores sometimes answer with a human check instead of the page. Never try to get past it: bring the tab to the
 * front, say so in the panel, and carry on once the DJ has answered it. False means it was not answered in time.
 */
async function passCheck(worker: number): Promise<boolean> {
  if (!(await run(worker, storeCheck))) return true;
  await update((job) => ({ ...job, waitingFor: 'store-check' }));
  await browser.tabs.update(worker, { active: true });
  let passed = false;
  for (let i = 0; i < 100 && !stopCarting && !passed; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    passed = !(await run(worker, storeCheck).catch(() => true));
  }
  await update((job) => ({ ...job, waitingFor: undefined }));
  return passed;
}

async function run<A extends unknown[], R>(tabId: number, func: (...args: A) => R, ...args: A): Promise<Awaited<R>> {
  const [res] = await browser.scripting.executeScript({ target: { tabId }, func: func as any, args });
  return res?.result as Awaited<R>;
}

async function tryBandcamp(worker: number, track: Track): Promise<{ status: Row['status']; offer?: Offer; alternatives?: Offer[] }> {
  const search = bandcampSearchUrl(searchQuery(track));
  await load(worker, search, 400);
  if (await run(worker, storeCheck)) {
    if (!(await passCheck(worker))) return { status: 'failed' };
    await load(worker, search, 400);
  }
  const results = (await run(worker, bandcampReadSearch)) ?? [];
  const alternatives: Offer[] = [];
  for (const res of results) {
    const { base, version } = splitTitle(res.title);
    const rough: Offer = { store: 'bandcamp', id: res.url, url: res.url, artists: [res.artist], title: base, version, release: res.album };
    const v = judge(track, rough);
    if (!v.ok) {
      if (v.reason === 'version') alternatives.push(rough);
      continue;
    }
    await load(worker, res.url, 400);
    const page = await run(worker, bandcampReadTrack);
    if (!page || !judge(track, page.offer).ok) continue;
    if (!page.buyable) return { status: 'album-only', offer: page.offer };
    const price = page.setPrice ?? Math.max(page.minimum, page.minimum > 0 ? page.minimum : NAME_YOUR_PRICE);
    const offer = { ...page.offer, price: { ...page.offer.price!, value: price, display: `${price.toFixed(2)} ${page.offer.price!.currency}` } };
    const r = await run(worker, bandcampAddToCart, price, page.offer.title);
    return { status: r === 'carted' ? 'carted' : 'failed', offer };
  }
  return { status: alternatives.length ? 'version-missing' : 'not-found', alternatives };
}

const CARTABLE = BEATPORT_CARTABLE;

/** A miss names the store, so the row can say "Not on Beatport" rather than a bare "Not found". */
const missing = (row: Row | undefined, store: Store, status: Row['status']): Partial<Row> =>
  status === 'not-found' || status === 'version-missing' ? { missingFrom: [...new Set([...(row?.missingFrom ?? []), store])] } : {};

async function openTab(url: string): Promise<number> {
  const id = (await browser.tabs.create({ url: 'about:blank', active: false })).id!;
  await load(id, url);
  return id;
}

// ---- Beatport: match through the API, one playlist per mix, then the playlist's own Buy All

/** A track from the v4 catalog API, as an offer the matcher can judge. */
function beatportOffer(t: any): Offer {
  return {
    store: 'beatport',
    id: String(t.id),
    url: `https://www.beatport.com/track/${t.slug || 'track'}/${t.id}`,
    artists: (t.artists ?? []).map((a: any) => a.name),
    title: t.name ?? '',
    version: t.mix_name ?? '',
    price: t.price ? { value: t.price.value, currency: t.price.code, display: t.price.display } : undefined,
    isrc: t.isrc ?? undefined,
    release: t.release?.name,
    label: t.release?.label?.name,
    released: t.publish_date ?? t.new_release_date,
    art: t.image?.uri ?? t.release?.image?.uri,
  };
}

const api = (tab: number, path: string, method = 'GET', body: unknown = null) => run(tab, beatportApi, path, method, body);

/** Logged in, or wait for the DJ to log in: poll the session from the Beatport tab, no page reloads. */
async function beatportSession(tab: number): Promise<boolean> {
  if ((await api(tab, '/my/playlists/?per_page=1')).status !== 401) return true;
  await update((job) => ({ ...job, waitingFor: 'beatport-login' }));
  const login = await browser.tabs.create({ url: 'https://www.beatport.com/account/login', active: true });
  let ok = false;
  for (let i = 0; i < 100 && !stopCarting && !ok; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    ok = (await api(tab, '/my/playlists/?per_page=1').catch(() => ({ status: 401 }))).status !== 401;
  }
  await browser.tabs.remove(login.id!).catch(() => {});
  await update((job) => ({ ...job, waitingFor: undefined }));
  return ok;
}

async function matchBeatport(tab: number, track: Track): Promise<{ status: Row['status']; offer?: Offer; alternatives?: Offer[] }> {
  const r = await api(tab, `/catalog/search/?q=${encodeURIComponent(searchQuery(track))}&type=tracks&per_page=25`);
  if (r.status === 401) return { status: 'login-needed' };
  if (r.status !== 200) return { status: 'failed' };
  const { best, alternatives } = pick(track, (r.data?.tracks ?? []).map(beatportOffer));
  return best ? { status: 'searching', offer: best } : { status: alternatives.length ? 'version-missing' : 'not-found', alternatives };
}

/** Track ids from /tracks/ids/: { count, tracks: [{ id (the playlist entry), track_id }] }. */
function idsIn(data: unknown): number[] {
  const list = Array.isArray(data) ? data : (data as any)?.tracks ?? (data as any)?.results ?? [];
  return (list as any[]).map((x) => Number(typeof x === 'object' ? x?.track_id ?? x?.id ?? x?.track?.id : x)).filter(Number.isFinite);
}

/** The mix's playlist (reused on later runs, created the first time), with the given tracks added once each. */
async function fillPlaylist(tab: number, job: Job, trackIds: string[]): Promise<number | null> {
  let id = job.playlist?.beatport;
  if (id && (await api(tab, `/my/playlists/${id}/`)).status !== 200) id = undefined;
  if (!id) {
    const made = await api(tab, '/my/playlists/', 'POST', { name: job.mix.title.slice(0, 100) || 'Dizko ID' });
    id = made.data?.id;
    if (!id) return null;
  }
  const have = new Set(idsIn((await api(tab, `/my/playlists/${id}/tracks/ids/`)).data));
  const add = trackIds.map(Number).filter((n) => !have.has(n));
  if (add.length && (await api(tab, `/my/playlists/${id}/tracks/bulk/`, 'POST', { track_ids: add })).status >= 300) return null;
  return id;
}

async function cart(stores: Store[]) {
  // The tracks ticked when Add to cart was pressed; tracks found later by the still running listen wait for the next press
  const job = (await update((j) => ({ ...j, phase: 'carting', error: undefined })))!;
  const cartable = stores.includes('beatport') ? CARTABLE : BANDCAMP_CARTABLE;
  const keys = job.rows.filter((r) => r.selected && cartable.includes(r.status)).map((r) => keyOf(r.track));
  const rowFor = async (key: string) => (await getJob())!.rows.find((r) => keyOf(r.track) === key);
  const carts: Partial<Record<Store, string>> = {};
  const tried = new Map<string, Offer[]>();
  let toBandcamp = stores.includes('beatport') ? [] as string[] : keys;
  let beatportTab: number | undefined;
  let bandcampTab: number | undefined;
  let playlist: number | null = null;
  let playlistCarted = false;
  let handOff = false;
  try {
    if (stores.includes('beatport') && keys.length) {
      beatportTab = await openTab('https://www.beatport.com/');
      if (!(await passCheck(beatportTab)) || !(await beatportSession(beatportTab))) {
        for (const key of keys) await patchRow(key, { status: 'login-needed' });
        return;
      }
      const matched: { key: string; offer: Offer }[] = [];
      for (const key of keys) {
        if (stopCarting) break;
        const row = await rowFor(key);
        if (!row?.selected || !cartable.includes(row.status)) continue;
        await patchRow(key, { status: 'searching' });
        const m = await matchBeatport(beatportTab, row.track);
        if (m.offer) {
          matched.push({ key, offer: m.offer });
          await patchRow(key, { status: 'searching', offer: m.offer });
        } else {
          if (m.alternatives?.length) tried.set(key, m.alternatives);
          if (stores.includes('bandcamp')) toBandcamp.push(key);
          else await patchRow(key, { status: m.status, alternatives: m.alternatives?.slice(0, 4), ...missing(row, 'beatport', m.status) });
        }
      }
      if (matched.length && !stopCarting) {
        playlist = await fillPlaylist(beatportTab, (await getJob())!, matched.map((m) => m.offer.id));
        if (!playlist) {
          for (const m of matched) await patchRow(m.key, { status: 'failed' });
        } else {
          await update((j) => ({ ...j, playlist: { ...j.playlist, beatport: playlist! } }));
          for (const m of matched) await patchRow(m.key, { status: 'in-playlist' });
          // The playlist's Buy All puts the whole playlist in the cart in one press
          await load(beatportTab, beatportPlaylistUrl(playlist), 1500);
          playlistCarted = (await run(beatportTab, beatportBuyAll)) === 'carted';
          if (playlistCarted) {
            for (const m of matched) await patchRow(m.key, { status: 'carted' });
            carts.beatport = BEATPORT_CART;
          }
        }
      }
      // Still listening: keep this tab and put each new find in the playlist as it comes
      handOff = !!playlist && !stopCarting && !!(await getJob())?.listening;
    }
    for (const key of toBandcamp) {
      if (stopCarting) break;
      const row = await rowFor(key);
      if (!row?.selected) continue;
      await patchRow(key, { status: 'searching' });
      bandcampTab ??= (await browser.tabs.create({ url: 'about:blank', active: false })).id!;
      const result = await tryBandcamp(bandcampTab, row.track);
      const alternatives = [...(tried.get(key) ?? []), ...(result.alternatives ?? [])];
      if (result.status === 'carted') carts.bandcamp = result.offer!.url;
      await patchRow(key, { status: result.status, offer: result.offer, alternatives: alternatives.length ? alternatives.slice(0, 4) : undefined, ...missing(row, 'bandcamp', result.status) });
      await new Promise((r) => setTimeout(r, 800)); // human pace between tracks
    }
  } finally {
    for (const tab of [handOff ? undefined : beatportTab, bandcampTab]) if (tab) await browser.tabs.remove(tab).catch(() => {});
    await update((j) => ({
      ...j,
      phase: j.listening ? 'identifying' : 'done',
      waitingFor: undefined,
      carts: { ...j.carts, ...carts },
      rows: j.rows.map((r) => (r.status === 'searching' ? { ...r, status: 'queued' } : r)),
    }));
    for (const url of Object.values(carts)) await browser.tabs.create({ url, active: false });
    // Buy All did not go through: hand the DJ the playlist, where it is one press
    if (playlist && !playlistCarted) await browser.tabs.create({ url: beatportPlaylistUrl(playlist), active: true });
    if (handOff) follow(beatportTab!).catch(() => {});
  }
}

/**
 * After a playlist run started mid-listen: every track the listen confirms from then on (ticked by default) goes
 * into the mix's Beatport playlist within a few seconds. Not into the cart; the DJ curates the playlist and its
 * Buy All covers the rest. Ends with one last pass once listening finishes.
 */
async function follow(tab: number) {
  stopFollowing = false;
  await update((j) => ({ ...j, following: true }));
  try {
    for (;;) {
      const job = await getJob();
      if (!job || stopFollowing || job.phase === 'carting') break;
      const fresh = job.rows.filter((r) => r.selected && r.status === 'queued');
      const matched: { key: string; offer: Offer }[] = [];
      for (const row of fresh) {
        if (stopFollowing) break;
        const key = keyOf(row.track);
        const m = await matchBeatport(tab, row.track);
        if (m.offer) matched.push({ key, offer: m.offer });
        else await patchRow(key, { status: m.status, alternatives: m.alternatives?.slice(0, 4), ...missing(row, 'beatport', m.status) });
      }
      if (matched.length && (await fillPlaylist(tab, (await getJob())!, matched.map((m) => m.offer.id)))) {
        for (const m of matched) await patchRow(m.key, { status: 'in-playlist', offer: m.offer });
      }
      if (!job.listening) break;
      await nap(5000, () => stopFollowing);
    }
  } finally {
    await browser.tabs.remove(tab).catch(() => {});
    await update((j) => ({ ...j, following: false }));
  }
}

// ---- playlists on other services, from the ticked tracks

/** Beatport alone: the mix's playlist, without touching the cart. */
async function beatportPlaylistOnly(rows: Row[]): Promise<{ url: string; added: number; missing: string[] }> {
  const tab = await openTab('https://www.beatport.com/');
  try {
    if (!(await passCheck(tab)) || !(await beatportSession(tab))) throw new Error('Log in to Beatport first');
    const ids: string[] = [];
    const missing: string[] = [];
    for (const row of rows) {
      const offer = row.offer?.store === 'beatport' ? row.offer : (await matchBeatport(tab, row.track)).offer;
      if (offer) {
        ids.push(offer.id);
        if (row.status === 'queued') await patchRow(keyOf(row.track), { status: 'in-playlist', offer });
      } else missing.push(`${row.track.artist} - ${row.track.title}`);
    }
    const id = await fillPlaylist(tab, (await getJob())!, ids);
    if (!id) throw new Error('Beatport would not create the playlist');
    await update((j) => ({ ...j, playlist: { ...j.playlist, beatport: id } }));
    return { url: beatportPlaylistUrl(id), added: ids.length, missing };
  } finally {
    await browser.tabs.remove(tab).catch(() => {});
  }
}

async function playlist(service: 'beatport' | 'spotify' | 'soundcloud') {
  const job = (await update((j) => ({ ...j, making: service, error: undefined })))!;
  const rows = job.rows.filter((r) => r.selected);
  const description = `Tracklist of ${job.mix.url}, made with Dizko ID`;
  try {
    const made =
      service === 'beatport' ? await beatportPlaylistOnly(rows)
      : service === 'spotify' ? await spotifyPlaylist(job.mix.title, description, rows)
      : await soundcloudPlaylist(job.mix.title, description, rows);
    await update((j) => ({ ...j, made: { ...j.made, [service]: { ...made, at: Date.now() } } }));
    await browser.tabs.create({ url: made.url, active: true });
  } catch (e) {
    await update((j) => ({ ...j, error: e instanceof Error ? e.message : String(e) }));
  } finally {
    await update((j) => ({ ...j, making: undefined }));
  }
}

