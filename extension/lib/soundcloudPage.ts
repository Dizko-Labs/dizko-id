/**
 * Reading a SoundCloud track page without a tab: its server-rendered HTML carries the sound (description,
 * duration, uploader) in window.__sc_hydration, and the sound's AAC HLS stream resolves with SoundCloud's public
 * web client id. Used by the page's content script and by the background, which can scan a mix from an artist
 * page without opening it. No DOM parser: the background has none.
 */
import type { SourceInfo, Stream } from './messages';

/** The sound object in a SoundCloud page's hydration data, or null. */
export function soundOf(html: string): any {
  const hydration = html.match(/__sc_hydration\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/)?.[1];
  return hydration ? JSON.parse(hydration).find((h: any) => h.hydratable === 'sound')?.data ?? null : null;
}

/** A SoundCloud picture sized for the panel (-large is 100px), or nothing for the default silhouette. */
export const avatarOf = (url: string | undefined) => (url && !/default_avatar/.test(url) ? url.replace('-large', '-t500x500') : undefined);

/** SoundCloud's public web client id, read from the scripts a SoundCloud page loads. */
export async function clientIdFrom(html: string): Promise<string | undefined> {
  for (const src of [...html.matchAll(/<script crossorigin src="([^"]+)"/g)].map((m) => m[1]!).reverse()) {
    const found = (await fetch(src).then((r) => r.text())).match(/client_id[:=]"(\w{20,})"/)?.[1];
    if (found) return found;
  }
}

const meta = (html: string, property: string) =>
  html.match(new RegExp(`<meta[^>]+property="og:${property}"[^>]+content="([^"]*)"`))?.[1]?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'") ?? '';

/** The mix's own HLS segments, the same requests SoundCloud's web player makes. */
export async function soundcloudStream(html: string, sound: any): Promise<Stream | undefined> {
  const transcodings: any[] = sound?.media?.transcodings ?? [];
  const tc = transcodings.find((t) => t.format?.protocol === 'hls' && /mp4/.test(t.format?.mime_type ?? '')) ?? transcodings[0];
  if (!tc) return undefined;
  const clientId = await clientIdFrom(html);
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

/** Everything the panel needs from a SoundCloud mix, fetched by URL. */
export async function soundcloudInfo(url: string): Promise<SourceInfo> {
  const html = await fetch(url, { credentials: 'include' }).then((r) => r.text());
  const sound = soundOf(html);
  return {
    title: sound?.title ?? meta(html, 'title'),
    url,
    description: sound?.description ?? meta(html, 'description'),
    duration: sound?.duration ? sound.duration / 1000 : undefined,
    seekable: false,
    uploader: sound?.user?.username,
    uploaderAvatar: avatarOf(sound?.user?.avatar_url),
    art: meta(html, 'image') || undefined,
    stream: await soundcloudStream(html, sound).catch(() => undefined),
  };
}
