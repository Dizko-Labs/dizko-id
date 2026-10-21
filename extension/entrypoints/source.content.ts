import type { PageClip, SourceInfo, SourceRequest, Stream } from '@/lib/messages';
import { avatarOf, soundcloudStream, soundOf } from '@/lib/soundcloudPage';

/**
 * Runs on mix pages. Reports the mix's title and any written tracklist, and seeks the page's player
 * so the background can sample a clip every few seconds of mix without the DJ scrubbing by hand.
 */
export default defineContentScript({
  // SoundCloud only for the first release; YouTube and Mixcloud work but wait on ad handling (see CLAUDE.md)
  matches: ['https://soundcloud.com/*'],
  main() {
    browser.runtime.onMessage.addListener((msg: SourceRequest, _sender, reply) => {
      handle(msg).then(reply, (e) => reply({ error: String(e) }));
      return true;
    });
  },
});

function media(): HTMLMediaElement | null {
  const all = [...document.querySelectorAll<HTMLMediaElement>('video, audio')];
  return all.find((m) => Number.isFinite(m.duration) && m.duration > 0) ?? all[0] ?? null;
}

/** JSON-escaped string value of "key":"..." in a page's inline scripts. */
function scriptString(html: string, key: string): string {
  const m = html.match(new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? JSON.parse(`"${m[1]}"`) : '';
}

async function info(): Promise<SourceInfo> {
  // Refetch the page: these sites are single-page apps, so inline data in the DOM can belong to a previous mix
  const html = await fetch(location.href, { credentials: 'include' }).then((r) => r.text()).catch(() => '');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const og = (p: string) => doc.querySelector(`meta[property="og:${p}"]`)?.getAttribute('content') ?? '';
  let description = '';
  let uploader: string | undefined;
  let uploaderAvatar: string | undefined;
  let stream: Stream | undefined;
  let duration: number | undefined;
  if (location.hostname.includes('youtube.com')) {
    description = scriptString(html, 'shortDescription');
    uploader = scriptString(html, 'ownerChannelName') || undefined;
    // the video's own length from its videoDetails in the page data: the player's (and the first lengthSeconds
    // on the page) may be a pre-roll ad's
    const video = new URL(location.href).searchParams.get('v') ?? '';
    const details = html.indexOf(`"videoDetails":{"videoId":"${video}"`);
    duration = details >= 0 ? Number(html.slice(details, details + 4000).match(/"lengthSeconds":"(\d+)"/)?.[1]) || undefined : undefined;
  }
  if (location.hostname.includes('soundcloud.com')) {
    // window.__sc_hydration holds the user, the sound, and more; only the sound's description is the mix's
    const sound = soundOf(html);
    description = sound?.description ?? '';
    if (sound?.duration) duration = sound.duration / 1000;
    uploader = sound?.user?.username;
    uploaderAvatar = avatarOf(sound?.user?.avatar_url);
    stream = await soundcloudStream(html, sound).catch(() => undefined);
  } else if (!location.hostname.includes('youtube.com')) description = scriptString(html, 'description');
  description ||= og('description');
  // no waiting out ads here: YouTube's length comes from the page data, and the player is only checked for seeking
  const m = media();
  return {
    title: og('title') || document.title.replace(/\s*[|-]\s*(YouTube|SoundCloud|Mixcloud).*$/i, ''),
    url: location.href,
    description,
    duration: duration ?? (m && Number.isFinite(m.duration) ? m.duration : undefined),
    seekable: !!m && Number.isFinite(m.duration) && m.duration > 0,
    uploader,
    art: og('image') || undefined,
    uploaderAvatar,
    stream,
  };
}

/** YouTube plays ads in the same video element: wait them out (up to two minutes) before seeking or listening. */
async function pastAds() {
  for (let i = 0; i < 240 && document.querySelector('.ad-showing, .ad-interrupting'); i++) {
    document.querySelector<HTMLElement>('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern')?.click();
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function seek(at: number): Promise<{ ok: boolean }> {
  await pastAds();
  const m = media();
  if (!m) return { ok: false };
  // seeking is only for listening by jumping through, which the DJ should not hear
  silence(m);
  m.currentTime = at;
  await new Promise<void>((resolve) => {
    const done = () => { m.removeEventListener('seeked', done); resolve(); };
    m.addEventListener('seeked', done);
    setTimeout(done, 4000);
  });
  if (m.paused) await m.play().catch(() => {});
  // Wait until audio is actually flowing, not just requested
  for (let i = 0; i < 40 && (m.readyState < 3 || m.paused); i++) await new Promise((r) => setTimeout(r, 100));
  return { ok: !m.paused };
}

/**
 * Listening to the page's own player: its media element's captureStream, which carries the audio even while the
 * element is muted, so jumping through a mix stays silent. No tab capture, so Chrome asks for nothing. A page whose
 * media is served cross-origin without CORS hands over silence; three silent clips in a row from the start report
 * 'element-blocked' and the background falls back to tab capture.
 */
const RATE = 16_000;
let cap: { m: HTMLMediaElement; ctx: AudioContext; heard: boolean; silent: number; take?: (frames: Float32Array) => void } | null = null;

/**
 * Keep the player silent while the listen jumps through: YouTube puts its own volume back after a seek or an ad,
 * so the mute is held until release, then the DJ's setting returns.
 */
let quiet: { m: HTMLMediaElement; was: boolean; hold: () => void } | null = null;
function silence(m: HTMLMediaElement) {
  if (quiet?.m === m) return void (m.muted = true);
  unsilence();
  const hold = () => { if (!m.muted) m.muted = true; };
  quiet = { m, was: m.muted, hold };
  m.muted = true;
  m.addEventListener('volumechange', hold);
}
function unsilence() {
  if (!quiet) return;
  quiet.m.removeEventListener('volumechange', quiet.hold);
  quiet.m.muted = quiet.was;
  quiet = null;
}

function release() {
  unsilence();
  cap?.ctx.close().catch(() => {});
  cap = null;
}

async function clip(seconds: number, mute: boolean): Promise<PageClip> {
  await pastAds();
  const m = media();
  if (!m) return { error: 'No player on this page' };
  if (cap?.m !== m) {
    release();
    let stream: MediaStream;
    try {
      stream = (m as HTMLMediaElement & { captureStream(): MediaStream }).captureStream();
    } catch {
      return { error: 'element-blocked' };
    }
    const ctx = new AudioContext({ sampleRate: RATE });
    const tap = ctx.createScriptProcessor(4096, 1, 1);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(tap).connect(sink).connect(ctx.destination);
    cap = { m, ctx, heard: false, silent: 0 };
    tap.onaudioprocess = (e) => cap?.take?.(new Float32Array(e.inputBuffer.getChannelData(0)));
  }
  const c = cap!;
  if (mute) silence(m);
  if (m.paused) await m.play().catch(() => {});
  await c.ctx.resume().catch(() => {});
  const want = Math.round(seconds * RATE);
  const chunks: Float32Array[] = [];
  await new Promise<void>((done) => {
    let got = 0;
    // a suspended context never calls back: give up a little after the clip should have ended
    const timer = setTimeout(done, (seconds + 3) * 1000);
    c.take = (frames) => {
      chunks.push(frames);
      got += frames.length;
      if (got >= want) { clearTimeout(timer); done(); }
    };
  });
  c.take = undefined;
  const total = chunks.reduce((n, f) => n + f.length, 0);
  const ints = new Int16Array(total);
  let o = 0;
  for (const f of chunks) for (const v of f) ints[o++] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  if (!ints.some((v) => v !== 0)) {
    c.silent++;
    return { error: !c.heard && c.silent >= 3 ? 'element-blocked' : 'silence' };
  }
  c.heard = true;
  c.silent = 0;
  let bin = '';
  const bytes = new Uint8Array(ints.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { pcm: btoa(bin), rate: RATE };
}

async function handle(msg: SourceRequest): Promise<unknown> {
  switch (msg.type) {
    case 'source:info':
      return info();
    case 'source:seek':
      return seek(msg.at);
    case 'source:pause':
      media()?.pause();
      return { ok: true };
    case 'source:clip':
      return clip(msg.seconds, msg.mute);
    case 'source:release':
      release();
      return { ok: true };
  }
}
