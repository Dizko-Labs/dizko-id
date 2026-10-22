import { collapse, Governor, hitKey, ListenPlan, samplePoints, type Hit, type Probe } from '@/lib/identify';
import { judge, pick, searchQuery, splitTitle } from '@/lib/match';
import { TAB_AUDIO_NEEDED, type ClipResult, type OffscreenRequest, type PageClip, type PanelRequest, type SourceInfo, type SourceRequest } from '@/lib/messages';
import {
  BEATPORT_CART, bandcampAddToCart, bandcampReadSearch, bandcampReadTrack, bandcampSearchUrl,
  beatportApi, beatportBuyAll, beatportPlaylistUrl, storeCheck,
} from '@/lib/stores';
import { findArtist, isPlatform, isStale } from '@/lib/dizko';
import { backfillArt, backfillArtists, backfillAvatars, backfillUploaders, forget, history, mixKey, remember, saved } from '@/lib/history';
import { profileAvatar, profileMixes } from '@/lib/soundcloud';
import { soundcloudInfo } from '@/lib/soundcloudPage';
import { cleanMixUrl, utm } from '@/lib/utm';
import { track } from '@/lib/analytics';
import { account as dizkoAccount, link as dizkoLink, sync as dizkoSync, unlink as dizkoUnlink } from '@/lib/dizkoAccount';
import { parseTracklist } from '@/lib/tracklist';
import { BANDCAMP_CARTABLE, BEATPORT_CARTABLE, coverage, type Job, type Offer, type Row, type Store, type Track } from '@/lib/types';

/** Price used when a Bandcamp track is "name your price" with no minimum. */
const NAME_YOUR_PRICE = 1;

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  // the Dizko tokens and the library stay out of reach of content scripts, which never read storage
  browser.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
  recover();
  syncTaste(60 * 60 * 1000);
  backfill().catch(() => {});
  browser.runtime.onMessage.addListener((msg: PanelRequest & { streamId?: string }, sender, reply) => {
    // The button on the SoundCloud page: open the panel on that tab (the click is the user gesture it needs);
    // the panel reads the mix and starts identifying when auto-listen is on
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
            // From a listing the page is changing to the mix: give it a few seconds to arrive, then read it
            for (let i = 0; i < 12; i++) {
              const at = (await browser.tabs.get(tabId).catch(() => null))?.url ?? '';
              if (mixKey(at) === mixKey(target)) {
                await read(tabId);
                break;
              }
              await new Promise((r) => setTimeout(r, 250));
            }
          }
          reply({ opened });
        })
        .catch(() => reply({ opened: false }));
      return true;
    }
    if (!msg.type?.startsWith('panel:')) return;
    // panel:* commands come only from the extension's own side panel, never a content script on a page
    if (!sender.url?.startsWith(browser.runtime.getURL('/sidepanel.html'))) return;
    handle(msg).then(reply, (e) => reply({ error: String(e) }));
    return true;
  });
});

/**
 * Library backfills (uploaders, DJs, avatars, cover art) at most once a day: the worker starts again after every
 * idle spell, and the uploader and art passes would otherwise refetch pages and iTunes for the same misses each time.
 */
async function backfill() {
  const { backfilledAt = 0 } = (await browser.storage.local.get('backfilledAt')) as { backfilledAt?: number };
  if (Date.now() - backfilledAt < 24 * 3600 * 1000) return;
  await browser.storage.local.set({ backfilledAt: Date.now() });
  await backfillUploaders().then(backfillArtists).then(backfillAvatars).then(backfillArt);
}

// ---- job state lives in session storage so the side panel can subscribe and a restarted worker can resume reading it

async function getJob(): Promise<Job | null> {
  return ((await browser.storage.session.get('job')).job as Job | undefined) ?? null;
}
/**
 * The library copy (`remember`) rewrites all saved mixes, so during a listen or cart run, which update the job many
 * times a minute, it is saved at most every few seconds; once the run ends it is saved straight away.
 */
let rememberedAt = 0;
let rememberLater: ReturnType<typeof setTimeout> | undefined;
async function setJob(job: Job | null) {
  await browser.storage.session.set({ job });
  if (!job) return;
  clearTimeout(rememberLater);
  if (!busy(job) || Date.now() - rememberedAt > 3000) {
    rememberedAt = Date.now();
    await remember(job);
  } else {
    rememberLater = setTimeout(() => {
      rememberedAt = Date.now();
      getJob().then((j) => j && remember(j)).catch(() => {});
    }, 3000);
  }
}
/**
 * Listening and carting run at the same time and both edit the job, so every read-modify-write goes through one
 * queue: neither can overwrite a change the other made in between.
 */
let queue: Promise<unknown> = Promise.resolve();
/**
 * `owner` is the mixKey of the mix a long run (a listen, a cart run) belongs to: once the job has moved on to another
 * mix, that run's writes are dropped (null) instead of landing in the new mix.
 */
function update(change: (job: Job) => Job, owner?: string): Promise<Job | null> {
  const next = queue.then(async () => {
    const job = await getJob();
    if (!job || (owner && mixKey(job.mix.url) !== owner)) return null;
    const changed = change(job);
    await setJob(changed);
    return changed;
  });
  queue = next.catch(() => {});
  return next;
}
/** Replace the job (a new mix, a reset, a settle) in the same queue, so no queued edit lands on top of it. */
function replace(job: Job | null) {
  const next = queue.then(() => setJob(job));
  queue = next.catch(() => {});
  return next;
}

/** The job, only while it is still the given mix's; null once the panel has moved on. */
async function ownJob(owner: string) {
  const job = await getJob();
  return job && mixKey(job.mix.url) === owner ? job : null;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

const keyOf = (t: Track) => `${t.artist}|${t.title}`;
function patchRow(key: string, patch: Partial<Row>, owner?: string) {
  return update((job) => ({ ...job, rows: job.rows.map((r) => (keyOf(r.track) === key ? { ...r, ...patch } : r)) }), owner);
}

/** Mixes with a listen or a cart run going, so a double press cannot start a second one on the same mix. */
const listening = new Set<string>();
const carting = new Set<string>();
const scanning = new Set<string>();

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
  if (left && busy(left)) await replace({ ...left, phase: 'review', listening: false, cooling: undefined, following: false, waitingFor: undefined });
  stopListening = stopCarting = stopFollowing = false;
}

/** A fresh worker means any job that was running died with the old one: settle it so the panel is not stuck. */
async function recover() {
  const job = await getJob();
  if (!job || !busy(job)) return;
  const rows = job.rows.map((r) => (r.status === 'searching' ? { ...r, status: 'queued' as const } : r));
  const error = job.phase === 'carting'
    ? 'Adding to your cart stopped part way. Press the cart button again to finish.'
    : 'Listening stopped part way. These are the tracks found before it did.';
  await replace({ ...job, rows, phase: job.phase === 'carting' ? 'done' : 'review', listening: false, cooling: undefined, following: false, waitingFor: undefined, error });
}

async function handle(msg: PanelRequest & { streamId?: string }): Promise<unknown> {
  switch (msg.type) {
    case 'panel:read': {
      // a panel opening on another mix while one runs offers Switch; reading here would cut the run off
      const now = await getJob();
      const url = (await browser.tabs.get(msg.tabId).catch(() => null))?.url ?? '';
      if (now && busy(now) && mixKey(now.mix.url) !== mixKey(url)) return { ok: false };
      return read(msg.tabId);
    }
    case 'panel:profile-mixes':
      return await profileMixes(msg.url).catch(() => ({ mixes: [] }));
    case 'panel:scan': {
      // claimed before any await, so a double press cannot read the mix twice and reset its own listen
      const key = mixKey(msg.url);
      if (scanning.has(key) || listening.has(key)) return { ok: true, url: msg.url };
      scanning.add(key);
      try {
        return await scan(msg.url, msg.auto);
      } finally {
        scanning.delete(key);
      }
    }

    case 'panel:dizko-link':
      try {
        await dizkoLink(msg.follow);
        await dizkoSync(await history());
        track('dizko_linked', { follow: msg.follow });
        return { ok: true };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    case 'panel:dizko-sync':
      return dizkoSync(await history()).then(() => ({ ok: true }), (e) => ({ error: e instanceof Error ? e.message : String(e) }));
    case 'panel:dizko-unlink':
      await dizkoUnlink();
      track('dizko_unlinked');
      return { ok: true };
    case 'panel:forget':
      await forget(msg.url);
      return { ok: true };
    case 'panel:open': {
      const before = await saved(msg.url);
      const now = await getJob();
      if (!before || now?.listening || now?.phase === 'carting') return { ok: false };
      const { savedAt: _, ...job } = before;
      await replace(job);
      return { ok: true };
    }
    case 'panel:switch':
      return switchTo(msg.tabId);
    case 'panel:identify': {
      stopListening = false;
      // a mix read by URL (Scan mix, or what the player was playing) is heard from its own stream, with no tab
      const info = msg.url ? await soundcloudInfo(msg.url).catch(() => undefined) : undefined;
      if (msg.url && !info?.stream) return { error: 'SoundCloud would not hand over this mix\'s audio. Open it to listen.' };
      identify(msg.tabId, msg.streamId, msg.resume, info, msg.range).catch(() => {});
      return { ok: true };
    }
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
      cart(msg.stores).catch(() => {});
      return { ok: true };
    case 'panel:stop':
      // The panel's Stop during a cart run stops the cart run; otherwise it stops listening
      if ((await getJob())?.phase === 'carting') stopCarting = true;
      else stopListening = true;
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
      await replace(null);
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
    .then(async (artist) => {
      if (artist?.soundcloud) artist.avatar = await profileAvatar(artist.soundcloud).catch(() => undefined);
      return artist;
    })
    .then((artist) => artist && update((j) => (mixKey(j.mix.url) === mixKey(info.url) ? { ...j, artist } : j)))
    .catch(() => {});
}

async function read(tabId: number) {
  return readInfo(await ask<SourceInfo>(tabId, { type: 'source:info' }));
}

/** Scan mix from an artist page: read a SoundCloud mix by URL and listen to its stream without opening it. */
async function scan(url: string, auto = false) {
  track('scan_from_artist_page');
  if (!/^https:\/\/soundcloud\.com\//.test(url)) {
    // only SoundCloud can be read and heard without its page; anything else opens, and the panel takes over
    await browser.tabs.create({ url: url, active: true });
    return { ok: true };
  }
  // Read and listen in the background: the DJ stays where they are while the panel shows the new mix
  const now = await getJob();
  // the same mix already running (a second press): leave it be
  if (now && busy(now) && mixKey(now.mix.url) === mixKey(url)) return { ok: true, url: now.mix.url };
  if (now && busy(now)) {
    // found in the player by itself, not pressed: never cut off another mix that is running
    if (auto) return { ok: false };
    await settle();
  }
  const info = await soundcloudInfo(url);
  const job = await readInfo(info);
  // listening waits for the DJ to choose the whole mix or a section
  if (job.phase === 'reading' && !job.rows.length && !info.stream) return { error: 'SoundCloud would not hand over this mix\'s audio. Open it to listen.' };
  return { ok: true, url: job.mix.url };
}

/** Make (or restore) the job for a mix from what its page says, wherever that came from. */
async function readInfo(info: SourceInfo) {
  // A mix scanned before opens as it was left, ticks and cart results included, instead of listening again
  const before = await saved(info.url);
  if (before) {
    const { savedAt: _, ...job } = before;
    job.mix.uploader ??= info.uploader;
    job.mix.art ??= info.art;
    job.mix.uploaderAvatar ??= info.uploaderAvatar;
    // an older lookup took the hosting channel for the DJ; look again
    if (isPlatform(job.artist?.name)) job.artist = undefined;
    await replace(job);
    // missing, or saved long enough ago that its dates may have moved: fetch again, showing the old copy meanwhile
    if (!job.artist || isStale(job.artist)) lookUpArtist(info);
    if (!job.enriched) enrich().catch(() => {});
    return job;
  }
  const tracks = parseTracklist(info.description);
  const job: Job = {
    mix: { title: info.title, url: cleanMixUrl(info.url), duration: info.duration, uploader: info.uploader, uploaderAvatar: info.uploaderAvatar, art: info.art },
    rows: tracks.map(rowFor),
    phase: tracks.length ? 'review' : 'reading',
    tracklistFound: tracks.length > 0,
    method: info.stream ? 'stream' : info.seekable ? 'seek' : 'live',
  };
  await replace(job);
  track('mix_read', { site: new URL(job.mix.url).hostname.replace(/^www\./, ''), tracklist: tracks.length > 0, tracks: tracks.length, method: job.method });
  lookUpArtist(info);
  if (tracks.length) enrich().catch(() => {});
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
      justification: 'Decode short clips of the mix with Web Audio and fingerprint them with bundled WebAssembly to identify its tracks',
    });
  }
}

const RATE_LIMITED = 'Shazam has paused lookups from your network for a while. Keep listening in about an hour.';

/**
 * Shazam's limit is per network, so one cool-down covers every lookup in every listen: after a 429 they all wait,
 * then try again, doubling the wait each time. A 429 for a request sent before the last cool-down began is the
 * same burst and does not count again. After the third, the run gives up with a message the DJ can act on.
 */
let coolUntil = 0;
let coolSince = 0;
let strikes = 0;

async function lookup(get: () => Promise<ClipResult>, onLimited?: () => void, onCooling?: (on: boolean) => unknown): Promise<ClipResult> {
  for (;;) {
    if (Date.now() < coolUntil) {
      // the panel says why nothing is moving, rather than sitting at a silent percentage
      await onCooling?.(true);
      await nap(coolUntil - Date.now());
      await onCooling?.(false);
    }
    if (stopListening) return { error: 'stopped' };
    const sent = Date.now();
    const r = await get();
    if (r.error !== 'shazam 429') {
      if (!r.error) strikes = 0;
      return r;
    }
    onLimited?.();
    if (sent >= coolSince) {
      if (++strikes > 3) throw new Error(RATE_LIMITED);
      coolSince = Date.now();
      coolUntil = coolSince + 20_000 * 2 ** (strikes - 1);
    }
  }
}

/**
 * Listen to a mix. `tabId` is the mix's tab; a SoundCloud mix read by URL (`given`) needs none, since its own
 * stream is fingerprinted directly.
 */
async function identify(tabId: number | undefined, streamId?: string, resume = false, given?: SourceInfo, range?: [number, number]) {
  // a mix read by URL is claimed before any await, so nothing slips in between the scan and the listen
  const claimed = given && mixKey(given.url);
  if (claimed && listening.has(claimed)) return;
  if (claimed) listening.add(claimed);
  const before = await getJob();
  if (!before) {
    if (claimed) listening.delete(claimed);
    return;
  }
  const owner = mixKey(before.mix.url);
  if (claimed && claimed !== owner) listening.delete(claimed);
  if (owner !== claimed && listening.has(owner)) return;
  listening.add(owner);
  try {
    await listen(before, owner, tabId, streamId, resume, given, range);
  } catch (e) {
    // the error belongs to this mix, even if the panel has moved to another since
    await update((job) => ({ ...job, phase: job.phase === 'identifying' ? 'review' : job.phase, listening: false, error: message(e) }), owner);
  } finally {
    listening.delete(owner);
  }
}

async function listen(before: Job, owner: string, tabId: number | undefined, streamId: string | undefined, resume: boolean, given?: SourceInfo, asked?: [number, number]) {
  // a resumed listen keeps the stretch it was asked for; a new one takes the DJ's choice (the whole mix when none)
  const wanted = resume ? asked ?? before.range : asked;
  // a range that spans the mix is the whole mix
  const span = before.mix.duration;
  const range = wanted && !(wanted[0] <= 5 && span && wanted[1] >= span - 15) ? wanted : undefined;
  // a new listen after Shazam's cool-down has passed starts with a clean slate of strikes
  if (Date.now() >= coolUntil) strikes = 0;
  // Keep listening picks up at the point it stopped, with what it had already heard
  const from = resume ? coverage(before) ?? 0 : 0;
  await update((job) => ({ ...job, phase: job.phase === 'carting' ? 'carting' : 'identifying', listening: true, cooling: undefined, progress: from, range, error: undefined }), owner);
  const info = given ?? (await ask<SourceInfo>(tabId!, { type: 'source:info' }));
  await ensureOffscreen();
  // YouTube and Mixcloud: the page's own player first (no permission needed); tab capture only when the panel
  // fell back to it for a page that will not share its player's audio
  const tabAudio = !info.stream && !!streamId;
  if (tabAudio) await offscreen({ type: 'offscreen:start', streamId: streamId! });
  const take = async (seconds: number, mute: boolean): Promise<ClipResult> => {
    if (tabAudio) return offscreen<ClipResult>({ type: 'offscreen:clip', seconds });
    const c = await ask<PageClip>(tabId!, { type: 'source:clip', seconds, mute });
    if (c.error === 'element-blocked') throw new Error(TAB_AUDIO_NEEDED);
    if (c.error || !c.pcm) return { error: c.error ?? 'silence' };
    return offscreen<ClipResult>({ type: 'offscreen:pcm', pcm: c.pcm, rate: c.rate! });
  };
  const cooling = (on: boolean) => update((job) => ({ ...job, cooling: on || undefined }), owner);
  const hits: Hit[] = resume
    ? before.rows.flatMap((r) => Array.from({ length: r.track.hits }, () => ({ at: r.track.at ?? 0, artist: r.track.artist, title: r.track.title, isrc: r.track.isrc })))
    : [];
  let failed = '';
  // any lookup that answered (match or not): a passing failure does not make the run an error
  let answered = false;
  const publish = (progress: number, probes?: Probe[]) =>
    update((job) => {
      const prior = new Map(job.rows.map((r) => [keyOf(r.track), r]));
      const rows = collapse(hits).map((t) => {
        const was = prior.get(keyOf(t));
        if (!was) return rowFor(t);
        // keep cart results and the DJ's tick or untick; only a track's second hit ticks it automatically
        return { ...was, track: t, selected: was.track.hits < 2 && t.hits >= 2 ? true : was.selected };
      });
      return { ...job, rows, progress, ...(probes && { probes }) };
    }, owner);

  // only a listen that ran to the end is complete; a stop or an error (Shazam's limit) keeps its place
  let completed = false;
  try {
    if (info.stream && info.duration) {
      // SoundCloud: any point of the stream can be fetched, so listen where the plan says and a few at a time
      const stream = info.stream;
      const seed: Probe[] = !resume ? [] : before.probes ?? before.rows.map((r) => [r.track.at ?? 0, hitKey(r.track)]);
      const plan = new ListenPlan(info.duration, seed, range);
      const governor = new Governor();
      const running = new Set<Promise<void>>();
      let fatal: unknown;
      let moved = false;
      // two points in one 10 second segment are the same audio: one lookup, and it counts as one hit
      const bySegment = new Map<number, Promise<ClipResult>>();
      const probe = async (point: number) => {
        const seg = stream.segments.find((s) => s.start <= point && s.start + s.dur > point);
        if (!seg) return plan.record(point, null);
        const known = bySegment.get(seg.start);
        const pending = known ?? lookup(() => offscreen<ClipResult>({ type: 'offscreen:segment', init: stream.init, url: seg.url }), () => governor.limited(), cooling);
        if (!known) bySegment.set(seg.start, pending);
        const r = await pending;
        if (r.error === 'stopped') {
          bySegment.delete(seg.start);
          return plan.cancel(point);
        }
        if (!r.error) answered = true;
        if (r.error && r.error !== 'silence') {
          failed = r.error;
          bySegment.delete(seg.start);
          return plan.fail(point);
        }
        if (!known) governor.answered();
        if (r.track && !known) hits.push({ at: seg.start, ...r.track });
        plan.record(point, r.track ? hitKey(r.track) : null);
        if (!(await publish(plan.progress(), plan.probes()))) moved = true; // the panel moved on to another mix
      };
      while (!stopListening && !moved && fatal === undefined) {
        for (let t; running.size < governor.limit && (t = plan.next()) !== undefined; ) {
          const task: Promise<void> = probe(t)
            .catch((e) => void (fatal ??= e))
            .finally(() => running.delete(task));
          running.add(task);
        }
        if (!running.size) break;
        await Promise.race(running);
      }
      await Promise.all(running);
      if (fatal !== undefined) throw fatal;
    } else if (info.seekable && info.duration) {
      const { clip } = samplePoints(info.duration);
      const at = samplePoints(info.duration).at.filter((t) => !range || (t >= range[0] && t <= range[1]));
      for (let i = Math.floor(from * at.length); i < at.length && !stopListening; i++) {
        const point = at[i]!;
        await ask(tabId!, { type: 'source:seek', at: point });
        // muted while it jumps through, so the DJ does not hear it skip
        const r = await lookup(() => take(clip, true), undefined, cooling);
        if (r.error === 'stopped') break; // this point stays unheard, so Keep listening starts from it
        if (!r.error) answered = true;
        if (r.error) failed = r.error;
        if (r.track) hits.push({ at: point, ...r.track });
        if (!(await publish((i + 1) / at.length))) break; // the panel moved on to another mix
      }
    } else {
      // No player we can seek (or a live page): sample clips in real time while the DJ plays the mix
      const started = Date.now();
      const limit = info.duration ?? 4 * 3600;
      while (!stopListening && (Date.now() - started) / 1000 < limit) {
        const at = (Date.now() - started) / 1000;
        // live: the DJ is listening along, so the player keeps its sound
        const r = await lookup(() => take(10, false), undefined, cooling);
        if (r.error === 'stopped') break;
        if (r.track) hits.push({ at, ...r.track });
        if (!(await publish(Math.min(1, at / limit)))) break;
        await nap(20_000);
      }
    }
    // Every clip erroring is a broken run, not a mix with no known tracks
    if (!hits.length && !answered && failed && failed !== 'silence') throw new Error(`Could not identify any clips (${failed}).`);
    completed = !stopListening;
  } finally {
    // the offscreen document is shared: a listen for the next mix may already be using it
    if (listening.size <= 1) {
      await offscreen({ type: 'offscreen:stop' }).catch(() => {});
      await browser.offscreen.closeDocument().catch(() => {});
    }
    if (tabId != null) {
      await ask(tabId, { type: 'source:release' }).catch(() => {});
      await ask(tabId, { type: 'source:pause' }).catch(() => {});
    }
    const stoppedEarly = stopListening;
    const now = await getJob();
    const finished = now && mixKey(now.mix.url) === owner ? now.rows : [];
    track('identify_end', { method: info.stream ? 'stream' : info.seekable ? 'seek' : 'live', tracks: finished.length, confirmed: finished.filter((r) => r.track.hits >= 2).length, stopped: stoppedEarly, resumed: resume });
    await update((job) => ({ ...job, phase: job.phase === 'identifying' ? 'review' : job.phase, listening: false, cooling: undefined, progress: completed ? 1 : job.progress }), owner);
    enrich().catch(() => {});
    syncTaste();
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
    // a tab the DJ closed fails here: stop waiting rather than sit out the timeout
    browser.tabs.update(tabId, { url }).catch(() => { browser.tabs.onUpdated.removeListener(done); resolve(); });
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
    const r = await run(worker, bandcampAddToCart, price, page.offer.title);
    const paid = r?.paid ?? price;
    const offer = { ...page.offer, price: { ...page.offer.price!, value: paid, display: `${paid.toFixed(2)} ${page.offer.price!.currency}` } };
    return { status: r?.result === 'carted' ? 'carted' : 'failed', offer };
  }
  return { status: alternatives.length ? 'version-missing' : 'not-found', alternatives };
}

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
    bpm: t.bpm ?? undefined,
    key: t.key?.camelot_number ? { camelot: `${t.key.camelot_number}${t.key.camelot_letter ?? ''}`, name: t.key.name ?? '' } : undefined,
    length: t.length_ms ? Math.round(t.length_ms / 1000) : undefined,
    sample: typeof t.sample_url === 'string' && t.sample_url.startsWith('https://') ? t.sample_url : undefined,
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
  const start = await getJob();
  if (!start) return;
  const owner = mixKey(start.mix.url);
  if (carting.has(owner)) return;
  carting.add(owner);
  try {
    await cartRun(stores, owner);
  } catch (e) {
    await update((job) => ({ ...job, phase: job.listening ? 'identifying' : 'done', waitingFor: undefined, error: message(e) }), owner);
  } finally {
    carting.delete(owner);
  }
}

async function cartRun(stores: Store[], owner: string) {
  // The tracks ticked when a cart button was pressed; tracks found later by the still running listen wait for the next press
  const job = await update((j) => ({ ...j, phase: 'carting', error: undefined }), owner);
  if (!job) return;
  const patch = (key: string, p: Partial<Row>) => patchRow(key, p, owner);
  const cartable = stores.includes('beatport') ? BEATPORT_CARTABLE : BANDCAMP_CARTABLE;
  // a store that already said it does not have a track is not asked again
  const keys = job.rows.filter((r) => r.selected && cartable.includes(r.status) && !stores.every((s) => r.missingFrom?.includes(s))).map((r) => keyOf(r.track));
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
        for (const key of keys) await patch(key, { status: 'login-needed' });
        return;
      }
      const matched: { key: string; offer: Offer }[] = [];
      for (const key of keys) {
        if (stopCarting) break;
        const row = await rowFor(key);
        if (!row?.selected || !cartable.includes(row.status)) continue;
        await patch(key, { status: 'searching' });
        const m = await matchBeatport(beatportTab, row.track);
        if (m.offer) {
          matched.push({ key, offer: m.offer });
          await patch(key, { status: 'searching', offer: m.offer });
        } else {
          if (m.alternatives?.length) tried.set(key, m.alternatives);
          if (stores.includes('bandcamp')) toBandcamp.push(key);
          else await patch(key, { status: m.status, alternatives: m.alternatives?.slice(0, 4), ...missing(row, 'beatport', m.status) });
        }
      }
      const mine = await ownJob(owner);
      if (matched.length && !stopCarting && mine) {
        playlist = await fillPlaylist(beatportTab, mine, matched.map((m) => m.offer.id));
        if (!playlist) {
          for (const m of matched) await patch(m.key, { status: 'failed' });
        } else {
          await update((j) => ({ ...j, playlist: { ...j.playlist, beatport: playlist! } }), owner);
          for (const m of matched) await patch(m.key, { status: 'in-playlist' });
          // The playlist's Buy All puts the whole playlist in the cart in one press
          await load(beatportTab, beatportPlaylistUrl(playlist), 1500);
          playlistCarted = (await run(beatportTab, beatportBuyAll)) === 'carted';
          if (playlistCarted) {
            for (const m of matched) await patch(m.key, { status: 'carted' });
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
      await patch(key, { status: 'searching' });
      bandcampTab ??= (await browser.tabs.create({ url: 'about:blank', active: false })).id!;
      const result = await tryBandcamp(bandcampTab, row.track);
      const alternatives = [...(tried.get(key) ?? []), ...(result.alternatives ?? [])];
      if (result.status === 'carted') carts.bandcamp = result.offer!.url;
      await patch(key, { status: result.status, offer: result.offer, alternatives: alternatives.length ? alternatives.slice(0, 4) : undefined, ...missing(row, 'bandcamp', result.status) });
      await new Promise((r) => setTimeout(r, 800)); // human pace between tracks
    }
  } finally {
    for (const tab of [handOff ? undefined : beatportTab, bandcampTab]) if (tab) await browser.tabs.remove(tab).catch(() => {});
    syncTaste();
    const after = (await getJob())?.rows ?? [];
    track('cart_run', { store: stores.join('+'), asked: keys.length, carted: after.filter((r) => keys.includes(keyOf(r.track)) && r.status === 'carted').length, playlist: !!playlist, buy_all: playlistCarted });
    await update((j) => ({
      ...j,
      phase: j.listening ? 'identifying' : 'done',
      waitingFor: undefined,
      carts: { ...j.carts, ...carts },
      rows: j.rows.map((r) => (r.status === 'searching' ? { ...r, status: 'queued' } : r)),
    }), owner);
    for (const [store, url] of Object.entries(carts)) await browser.tabs.create({ url: utm(url, 'cart', `${store}_cart`), active: false });
    // Buy All did not go through: hand the DJ the playlist, where it is one press
    if (playlist && !playlistCarted) await browser.tabs.create({ url: utm(beatportPlaylistUrl(playlist), 'cart', 'beatport_playlist'), active: true });
    if (handOff) follow(beatportTab!, owner).catch(() => {});
  }
}

/**
 * After a playlist run started mid-listen: every track the listen confirms from then on (ticked by default) goes
 * into the mix's Beatport playlist within a few seconds. Not into the cart; the DJ curates the playlist and its
 * Buy All covers the rest. Ends with one last pass once listening finishes.
 */
async function follow(tab: number, owner: string) {
  stopFollowing = false;
  await update((j) => ({ ...j, following: true }), owner);
  try {
    for (;;) {
      const job = await getJob();
      if (!job || mixKey(job.mix.url) !== owner || stopFollowing || job.phase === 'carting') break;
      const fresh = job.rows.filter((r) => r.selected && r.status === 'queued');
      const matched: { key: string; offer: Offer }[] = [];
      for (const row of fresh) {
        if (stopFollowing) break;
        const key = keyOf(row.track);
        const m = await matchBeatport(tab, row.track);
        if (m.offer) matched.push({ key, offer: m.offer });
        else await patchRow(key, { status: m.status, alternatives: m.alternatives?.slice(0, 4), ...missing(row, 'beatport', m.status) }, owner);
      }
      const mine = await ownJob(owner);
      if (!mine) break;
      if (matched.length && (await fillPlaylist(tab, mine, matched.map((m) => m.offer.id)))) {
        for (const m of matched) await patchRow(m.key, { status: 'in-playlist', offer: m.offer }, owner);
      }
      if (!job.listening) break;
      await nap(5000, () => stopFollowing);
    }
  } finally {
    await browser.tabs.remove(tab).catch(() => {});
    await update((j) => ({ ...j, following: false }), owner);
  }
}

/**
 * BPM, key and length for every track: one Beatport lookup each (the same match the cart uses, so the track's
 * Beatport link also becomes the exact release), without carting anything. Once per mix, and only while nothing
 * else is running; tracks Beatport does not have just stay without them.
 */
let enriching = false;
async function enrich() {
  if (enriching) return;
  enriching = true;
  try {
    await enrichJob();
  } finally {
    enriching = false;
  }
}

async function enrichJob() {
  const job = await getJob();
  if (!job || job.enriched || busy(job)) return;
  const todo = job.rows.filter((r) => r.offer?.store !== 'beatport' && !r.missingFrom?.includes('beatport'));
  if (!todo.length) return void (await update((j) => ({ ...j, enriched: true })));
  const tab = await openTab('https://www.beatport.com/');
  try {
    if (await run(tab, storeCheck)) return;
    for (const row of todo) {
      const now = await getJob();
      if (!now || mixKey(now.mix.url) !== mixKey(job.mix.url) || busy(now)) return;
      const m = await matchBeatport(tab, row.track);
      if (m.status === 'login-needed' || m.status === 'failed') return;
      if (m.offer) await patchRow(keyOf(row.track), { offer: m.offer });
    }
    await update((j) => (mixKey(j.mix.url) === mixKey(job.mix.url) ? { ...j, enriched: true } : j));
  } finally {
    await browser.tabs.remove(tab).catch(() => {});
  }
}

/** Keep a linked Dizko account's imported taste current; quiet, and not more often than `every`. */
function syncTaste(every = 5 * 60 * 1000) {
  (async () => {
    const a = await dizkoAccount();
    if (!a.access || Date.now() - (a.syncedAt ?? 0) < every) return;
    await dizkoSync(await history());
  })().catch(() => {});
}

