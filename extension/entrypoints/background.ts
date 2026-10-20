import { collapse, samplePoints, type Hit } from '@/lib/identify';
import { judge, pick, searchQuery, splitTitle } from '@/lib/match';
import type { ClipResult, OffscreenRequest, PanelRequest, SourceInfo, SourceRequest } from '@/lib/messages';
import {
  BEATPORT_CART, bandcampAddToCart, bandcampReadSearch, bandcampReadTrack, bandcampSearchUrl,
  beatportAddToCart, beatportReadSearch, beatportSearchUrl,
} from '@/lib/stores';
import { parseTracklist } from '@/lib/tracklist';
import type { Job, Offer, Row, Store, Track } from '@/lib/types';

/** Price used when a Bandcamp track is "name your price" with no minimum. */
const NAME_YOUR_PRICE = 1;

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
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
}
async function patchRow(i: number, patch: Partial<Row>) {
  const job = await getJob();
  if (!job) return;
  job.rows[i] = { ...job.rows[i]!, ...patch };
  await setJob(job);
}

let stopping = false;

async function handle(msg: PanelRequest & { streamId?: string }): Promise<unknown> {
  switch (msg.type) {
    case 'panel:read':
      return read(msg.tabId);
    case 'panel:identify':
      stopping = false;
      identify(msg.tabId, msg.streamId).catch(async (e) => {
        const job = await getJob();
        if (job) await setJob({ ...job, phase: 'review', error: String(e) });
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
      stopping = false;
      cart(msg.stores).catch(async (e) => {
        const job = await getJob();
        if (job) await setJob({ ...job, phase: 'done', error: String(e) });
      });
      return { ok: true };
    case 'panel:stop':
      stopping = true;
      return { ok: true };
    case 'panel:reset':
      stopping = true;
      await setJob(null);
      return { ok: true };
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

async function identify(tabId: number, streamId?: string) {
  let job = (await getJob())!;
  const info = await ask<SourceInfo>(tabId, { type: 'source:info' });
  await ensureOffscreen();
  if (!info.stream) {
    if (!streamId) throw new Error('No audio stream for this tab');
    await offscreen({ type: 'offscreen:start', streamId });
  }
  const hits: Hit[] = [];
  const publish = async (progress: number) => {
    job = (await getJob())!;
    const prior = new Map(job.rows.map((r) => [`${r.track.artist}|${r.track.title}`, r.selected]));
    job.rows = collapse(hits).map((t) => {
      const row = rowFor(t);
      // keep a tick the DJ already set; a second hit ticks a row that was unticked by default
      row.selected = row.selected || prior.get(`${t.artist}|${t.title}`) === true;
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
        const r = await offscreen<ClipResult>({ type: 'offscreen:segment', init: info.stream.init, url: seg.url });
        if (r.track) hits.push({ at: seg.start, ...r.track });
        await publish((i + 1) / at.length);
      }
    } else if (info.seekable && info.duration) {
      const { at, clip } = samplePoints(info.duration);
      for (let i = 0; i < at.length && !stopping; i++) {
        const point = at[i]!;
        await ask(tabId, { type: 'source:seek', at: point });
        const r = await offscreen<ClipResult>({ type: 'offscreen:clip', seconds: clip });
        if (r.track) hits.push({ at: point, ...r.track });
        await publish((i + 1) / at.length);
      }
    } else {
      // No player we can seek (or a live page): sample clips in real time while the DJ plays the mix
      const started = Date.now();
      const limit = info.duration ?? 4 * 3600;
      while (!stopping && (Date.now() - started) / 1000 < limit) {
        const at = (Date.now() - started) / 1000;
        const r = await offscreen<ClipResult>({ type: 'offscreen:clip', seconds: 10 });
        if (r.track) hits.push({ at, ...r.track });
        await publish(Math.min(1, at / limit));
        await new Promise((res) => setTimeout(res, 20_000));
      }
    }
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
  await browser.tabs.update(tabId, { url });
  await new Promise<void>((resolve) => {
    const done = (id: number, change: { status?: string }) => {
      if (id === tabId && change.status === 'complete') {
        browser.tabs.onUpdated.removeListener(done);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(done);
    setTimeout(() => { browser.tabs.onUpdated.removeListener(done); resolve(); }, 20_000);
  });
  await new Promise((r) => setTimeout(r, settle)); // client-side hydration
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
    if ((await run(worker, beatportReadSearch))?.loggedIn) {
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
  let page = await run(worker, beatportReadSearch);
  if (!page) return { status: 'failed' };
  if (!page.loggedIn) {
    if (!(await beatportLogin(worker, url))) return { status: 'login-needed' };
    await load(worker, url);
    page = (await run(worker, beatportReadSearch))!;
  }
  const { best, alternatives } = pick(track, page.offers);
  if (!best) return { status: alternatives.length ? 'version-missing' : 'not-found', alternatives };
  const r = await run(worker, beatportAddToCart, best.id);
  if (r === 'carted' || r === 'in-cart') return { status: 'carted', offer: best };
  return { status: r === 'login' ? 'login-needed' : 'failed', offer: best };
}

async function tryBandcamp(worker: number, track: Track): Promise<{ status: Row['status']; offer?: Offer; alternatives?: Offer[] }> {
  await load(worker, bandcampSearchUrl(searchQuery(track)), 400);
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
