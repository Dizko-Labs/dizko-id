import type { SourceInfo, SourceRequest, Stream } from '@/lib/messages';

/**
 * Runs on mix pages. Reports the mix's title and any written tracklist, and seeks the page's player
 * so the background can sample a clip every few seconds of mix without the DJ scrubbing by hand.
 */
export default defineContentScript({
  matches: ['https://www.youtube.com/*', 'https://soundcloud.com/*', 'https://www.mixcloud.com/*'],
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
  if (location.hostname.includes('youtube.com')) {
    description = scriptString(html, 'shortDescription');
    uploader = scriptString(html, 'ownerChannelName') || undefined;
  }
  let stream: Stream | undefined;
  let duration: number | undefined;
  if (location.hostname.includes('soundcloud.com')) {
    // window.__sc_hydration holds the user, the sound, and more; only the sound's description is the mix's
    const hydration = html.match(/__sc_hydration\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/)?.[1];
    const sound = hydration ? JSON.parse(hydration).find((h: any) => h.hydratable === 'sound')?.data : null;
    description = sound?.description ?? '';
    if (sound?.duration) duration = sound.duration / 1000;
    uploader = sound?.user?.username;
    stream = await soundcloudStream(html, sound).catch(() => undefined);
  } else if (!location.hostname.includes('youtube.com')) description = scriptString(html, 'description');
  description ||= og('description');
  const m = media();
  return {
    title: og('title') || document.title.replace(/\s*[|-]\s*(YouTube|SoundCloud|Mixcloud).*$/i, ''),
    url: location.href,
    description,
    duration: duration ?? (m && Number.isFinite(m.duration) ? m.duration : undefined),
    seekable: !!m && Number.isFinite(m.duration) && m.duration > 0,
    uploader,
    art: og('image') || undefined,
    stream,
  };
}

/**
 * SoundCloud's player keeps its audio out of the DOM, so there is nothing to seek. Instead resolve the
 * sound's AAC HLS playlist (the same requests the web player makes, with its public client id) and hand
 * the ~10 s segments to the offscreen document, which fingerprints only the slices it needs.
 */
async function soundcloudStream(html: string, sound: any): Promise<Stream | undefined> {
  const transcodings: any[] = sound?.media?.transcodings ?? [];
  const tc = transcodings.find((t) => t.format?.protocol === 'hls' && /mp4/.test(t.format?.mime_type ?? '')) ?? transcodings[0];
  if (!tc) return undefined;
  let clientId = '';
  for (const src of [...html.matchAll(/<script crossorigin src="([^"]+)"/g)].map((m) => m[1]!).reverse()) {
    clientId = (await fetch(src).then((r) => r.text())).match(/client_id[:=]"(\w{20,})"/)?.[1] ?? '';
    if (clientId) break;
  }
  if (!clientId) return undefined;
  const resolve = new URL(tc.url);
  resolve.searchParams.set('client_id', clientId);
  if (sound.track_authorization) resolve.searchParams.set('track_authorization', sound.track_authorization);
  const playlist = (await fetch(resolve).then((r) => r.json()))?.url as string | undefined;
  if (!playlist) return undefined;
  const lines = (await fetch(playlist).then((r) => r.text())).split('\n');
  const stream: Stream = { segments: [] };
  let t = 0;
  for (let i = 0; i < lines.length; i++) {
    const map = lines[i]!.match(/^#EXT-X-MAP:URI="([^"]+)"/);
    if (map) stream.init = new URL(map[1]!, playlist).href;
    const inf = lines[i]!.match(/^#EXTINF:([\d.]+)/);
    if (inf && lines[i + 1]) {
      stream.segments.push({ start: t, dur: Number(inf[1]), url: new URL(lines[i + 1]!, playlist).href });
      t += Number(inf[1]);
    }
  }
  return stream.segments.length ? stream : undefined;
}

async function seek(at: number): Promise<{ ok: boolean }> {
  const m = media();
  if (!m) return { ok: false };
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

async function handle(msg: SourceRequest): Promise<unknown> {
  switch (msg.type) {
    case 'source:info':
      return info();
    case 'source:seek':
      return seek(msg.at);
    case 'source:pause':
      media()?.pause();
      return { ok: true };
  }
}
