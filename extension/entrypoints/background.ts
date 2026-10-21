import { collapse, samplePoints, type Hit } from '@/lib/identify';
import { judge, pick, searchQuery, splitTitle } from '@/lib/match';
import type { ClipResult, OffscreenRequest, PanelRequest, SourceInfo, SourceRequest } from '@/lib/messages';
import {
  BEATPORT_CART, bandcampAddToCart, bandcampReadSearch, bandcampReadTrack, bandcampSearchUrl,
  beatportAddToCart, beatportReadSearch, beatportSearchUrl, storeCheck,
} from '@/lib/stores';
import { forget, remember, saved } from '@/lib/history';
import { parseTracklist } from '@/lib/tracklist';
import type { Job, Offer, Row, Store, Track } from '@/lib/types';

/** Price used when a Bandcamp track is "name your price" with no minimum. */
const NAME_YOUR_PRICE = 1;

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  recover();
  browser.runtime.onMessage.addListener((msg: PanelRequest & { streamId?: string }, _sender, reply) => {
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
async function patchRow(i: number, patch: Partial<Row>) {
  const job = await getJob();
  if (!job) return;
  job.rows[i] = { ...job.rows[i]!, ...patch };
  await setJob(job);
}

let stopping = false;

/**
 * Chrome stops an idle extension worker after about 30 seconds, and a pending timer does not count as activity.
 * Wait in short steps that touch extension storage so a long wait (a Shazam back-off, a login) keeps it alive.
 */
async function nap(ms: number) {
  for (const end = Date.now() + ms; Date.now() < end && !stopping; ) {
    await new Promise((r) => setTimeout(r, Math.min(10_000, end - Date.now())));
    await browser.storage.session.get('job');
  }
}

/** A fresh worker means any job that was running died with the old one: settle it so the panel is not stuck. */
async function recover() {
  const job = await getJob();
  if (job?.phase === 'identifying') {
    await setJob({ ...job, phase: 'review', error: 'Listening stopped part way. These are the tracks found before it did.' });
  } else if (job?.phase === 'carting') {
    const rows = job.rows.map((r) => (r.status === 'searching' ? { ...r, status: 'queued' as const } : r));
    await setJob({ ...job, rows, phase: 'done', waitingFor: undefined, error: 'Adding to cart stopped part way. Press Add to cart again to finish.' });
  }
}

async function handle(msg: PanelRequest & { streamId?: string }): Promise<unknown> {
  switch (msg.type) {
    case 'panel:read':
      return read(msg.tabId);
    case 'panel:open': {
      const before = await saved(msg.url);
      if (!before || (await getJob())?.phase === 'identifying' || (await getJob())?.phase === 'carting') return { ok: false };
      const { savedAt: _, ...job } = before;
      await setJob(job);
      return { ok: true };
    }
    case 'panel:identify':
      stopping = false;
      identify(msg.tabId, msg.streamId).catch(async (e) => {
        const job = await getJob();
        if (job) await setJob({ ...job, phase: 'review', error: e instanceof Error ? e.message : String(e) });
      });
      return { ok: true };
    case 'panel:toggle': {
      const job = await getJob();
      const row = job?.rows[msg.index];
      if (!job || !row) return { ok: false };
      row.selected = !row.selected;
      await setJob(job);
      return { ok: true };
    }
    case 'panel:select': {
      const job = await getJob();
      if (!job) return { ok: false };
      for (const row of job.rows) row.selected = msg.all;
      await setJob(job);
      return { ok: true };
    }
    case 'panel:cart':
      // Carting while still listening: stop listening and cart what has been found so far
      if ((await getJob())?.phase === 'identifying') {
        stopping = true;
        for (let i = 0; i < 120 && (await getJob())?.phase === 'identifying'; i++) await new Promise((r) => setTimeout(r, 250));
      }
      stopping = false;
      cart(msg.stores).catch(async (e) => {
        const job = await getJob();
        if (job) await setJob({ ...job, phase: 'done', error: e instanceof Error ? e.message : String(e) });
      });
      return { ok: true };
    case 'panel:stop':
      stopping = true;
      return { ok: true };
    case 'panel:reset': {
      // Start over means scan this mix afresh, so it leaves the history too
      stopping = true;
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

async function read(tabId: number) {
  const info = await ask<SourceInfo>(tabId, { type: 'source:info' });
  // A mix scanned before opens as it was left, ticks and cart results included, instead of listening again
  const before = await saved(info.url);
  if (before) {
    const { savedAt: _, ...job } = before;
    await setJob(job);
    return job;
  }
  const tracks = parseTracklist(info.description);
  const job: Job = {
    mix: { title: info.title, url: info.url, duration: info.duration },
    rows: tracks.map(rowFor),
    phase: tracks.length ? 'review' : 'reading',
    tracklistFound: tracks.length > 0,
    method: info.stream ? 'stream' : info.seekable ? 'seek' : 'live',
  };
  await setJob(job);
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
    if (wait > 80_000 || stopping) throw new Error(RATE_LIMITED);
    await nap(wait);
    if (stopping) return {};
  }
}

async function identify(tabId: number, streamId?: string) {
  let job = (await getJob())!;
  job = { ...job, phase: 'identifying', progress: 0, error: undefined };
  await setJob(job);
  const info = await ask<SourceInfo>(tabId, { type: 'source:info' });
  await ensureOffscreen();
  if (!info.stream) {
    if (!streamId) throw new Error('No audio stream for this tab');
    await offscreen({ type: 'offscreen:start', streamId });
  }
  const hits: Hit[] = [];
  let failed = '';
  const publish = async (progress: number) => {
    job = (await getJob())!;
    const prior = new Map(job.rows.map((r) => [`${r.track.artist}|${r.track.title}`, r]));
    job.rows = collapse(hits).map((t) => {
      const row = rowFor(t);
      // keep a tick the DJ already set; a second hit ticks a row that was unticked by default
      // keep the DJ's tick or untick; only a track's second hit ticks it automatically
      const was = prior.get(`${t.artist}|${t.title}`);
      if (was) row.selected = was.track.hits < 2 && t.hits >= 2 ? true : was.selected;
      return row;
    });
    await setJob({ ...job, phase: 'identifying', progress });
  };

  try {
    if (info.stream && info.duration) {
      const { at } = samplePoints(info.duration);
      for (let i = 0; i < at.length && !stopping; i++) {
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
      for (let i = 0; i < at.length && !stopping; i++) {
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
      while (!stopping && (Date.now() - started) / 1000 < limit) {
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
    job = (await getJob())!;
    await setJob({ ...job, phase: 'review', progress: 1 });
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
  await setJob({ ...(await getJob())!, waitingFor: 'store-check' });
  await browser.tabs.update(worker, { active: true });
  let passed = false;
  for (let i = 0; i < 100 && !stopping && !passed; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    passed = !(await run(worker, storeCheck).catch(() => true));
  }
  await setJob({ ...(await getJob())!, waitingFor: undefined });
  return passed;
}

async function run<A extends unknown[], R>(tabId: number, func: (...args: A) => R, ...args: A): Promise<Awaited<R>> {
  const [res] = await browser.scripting.executeScript({ target: { tabId }, func: func as any, args });
  return res?.result as Awaited<R>;
}

/** Beatport has no guest cart: wait for the DJ to log in, polling until the session shows up. */
async function beatportLogin(worker: number, probe: string): Promise<boolean> {
  const job = (await getJob())!;
  await setJob({ ...job, waitingFor: 'beatport-login' });
  const login = await browser.tabs.create({ url: 'https://www.beatport.com/account/login', active: true });
  for (let i = 0; i < 100 && !stopping; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    await load(worker, probe, 600);
    if ((await run(worker, beatportReadSearch))?.loggedIn === true) {
      await browser.tabs.remove(login.id!).catch(() => {});
      await setJob({ ...(await getJob())!, waitingFor: undefined });
      return true;
    }
  }
  return false;
}

async function tryBeatport(worker: number, track: Track): Promise<{ status: Row['status']; offer?: Offer; alternatives?: Offer[] }> {
  const url = beatportSearchUrl(searchQuery(track));
  await load(worker, url);
  if (await run(worker, storeCheck)) {
    if (!(await passCheck(worker))) return { status: 'failed' };
    await load(worker, url);
  }
  let page = await run(worker, beatportReadSearch);
  if (!page) return { status: 'failed' };
  if (page.loggedIn === false) {
    if (!(await beatportLogin(worker, url))) return { status: 'login-needed' };
    await load(worker, url);
    page = (await run(worker, beatportReadSearch))!;
  }
  const { best, alternatives } = pick(track, page.offers);
  if (!best) return { status: alternatives.length ? 'version-missing' : 'not-found', alternatives };
  let r = await run(worker, beatportAddToCart, best.id);
  // The press itself is the final word on login: Beatport answers a logged-out add with its login wall
  if (r === 'login' && (await beatportLogin(worker, url))) {
    await load(worker, url);
    r = await run(worker, beatportAddToCart, best.id);
  }
  if (r === 'carted' || r === 'in-cart') return { status: 'carted', offer: best };
  return { status: r === 'login' ? 'login-needed' : 'failed', offer: best };
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

async function cart(stores: Store[]) {
  let job = (await getJob())!;
  await setJob({ ...job, phase: 'carting' });
  const worker = (await browser.tabs.create({ url: 'about:blank', active: false })).id!;
  const carts: Partial<Record<Store, string>> = {};
  try {
    for (let i = 0; i < job.rows.length && !stopping; i++) {
      const row = (await getJob())!.rows[i]!;
      if (!row.selected || !['queued', 'failed', 'login-needed'].includes(row.status)) continue;
      await patchRow(i, { status: 'searching' });
      let result: Awaited<ReturnType<typeof tryBeatport>> = { status: 'not-found' };
      const tried: Offer[] = [];
      for (const store of stores) {
        result = store === 'beatport' ? await tryBeatport(worker, row.track) : await tryBandcamp(worker, row.track);
        tried.push(...(result.alternatives ?? []));
        if (result.status === 'carted' || result.status === 'album-only') break;
      }
      if (result.status === 'carted') {
        const o = result.offer!;
        carts[o.store] = o.store === 'beatport' ? BEATPORT_CART : o.url;
      }
      await patchRow(i, { status: result.status, offer: result.offer, alternatives: tried.length ? tried.slice(0, 4) : undefined });
      await new Promise((r) => setTimeout(r, 800)); // human pace between tracks
    }
  } finally {
    await browser.tabs.remove(worker).catch(() => {});
    job = (await getJob())!;
    await setJob({ ...job, phase: 'done', carts });
    for (const url of Object.values(carts)) await browser.tabs.create({ url, active: false });
  }
}
