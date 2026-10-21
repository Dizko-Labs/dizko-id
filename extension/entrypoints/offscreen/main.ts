import initShazamio, { DecodedSignature } from 'shazamio-core/web';
import wasmUrl from 'shazamio-core/web/shazamio-core_bg.wasm?url';
import type { ClipResult, OffscreenRequest } from '@/lib/messages';

/**
 * Offscreen document: holds the tab's audio stream, cuts clips from it, fingerprints them with
 * shazamio-core (WebAssembly) and asks Shazam what they are. Lives only while a mix is being identified.
 */
let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let recording: { chunks: Float32Array[][]; want: number; got: number; done: () => void } | null = null;
const ready = initShazamio(wasmUrl);

browser.runtime.onMessage.addListener((msg: OffscreenRequest, _sender, reply) => {
  if (!msg.type?.startsWith('offscreen:')) return;
  handle(msg).then(reply, (e) => reply({ error: String(e) }));
  return true;
});

async function handle(msg: OffscreenRequest): Promise<unknown> {
  switch (msg.type) {
    case 'offscreen:start':
      return start(msg.streamId);
    case 'offscreen:clip':
      return clip(msg.seconds);
    case 'offscreen:segment':
      return segment(msg.init, msg.url);
    case 'offscreen:stop':
      stream?.getTracks().forEach((t) => t.stop());
      await ctx?.close();
      ctx = null;
      stream = null;
      return { ok: true };
  }
}

async function start(streamId: string) {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as MediaTrackConstraints,
  });
  ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor rather than an AudioWorklet: one file, no module loading under the extension CSP,
  // and the 4096-frame callback is far below the latency anyone could notice here.
  const tap = ctx.createScriptProcessor(4096, 2, 2);
  tap.onaudioprocess = (e) => {
    if (!recording) return;
    const frames = [0, 1].map((c) => new Float32Array(e.inputBuffer.getChannelData(Math.min(c, e.inputBuffer.numberOfChannels - 1))));
    recording.chunks.push(frames);
    recording.got += e.inputBuffer.length;
    if (recording.got >= recording.want) recording.done();
  };
  // Tab capture silences the tab, so jumping through the mix is not heard; the tap still needs a sink to run
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(tap).connect(mute).connect(ctx.destination);
  return { ok: true };
}

async function clip(seconds: number): Promise<ClipResult> {
  if (!ctx) return { error: 'not capturing' };
  await ready;
  const rate = ctx.sampleRate;
  const chunks = await new Promise<Float32Array[][]>((resolve) => {
    const r = { chunks: [] as Float32Array[][], want: Math.round(seconds * rate), got: 0, done: () => {} };
    r.done = () => { recording = null; resolve(r.chunks); };
    recording = r;
  });
  // Interleave stereo, the layout shazamio-core expects with channel count 2
  const total = chunks.reduce((n, c) => n + c[0]!.length, 0);
  const pcm = new Float32Array(total * 2);
  let o = 0;
  for (const chunk of chunks) {
    const [l, r] = chunk as [Float32Array, Float32Array];
    for (let i = 0; i < l.length; i++) { pcm[o++] = l[i]!; pcm[o++] = r[i]!; }
  }
  return recognize(pcm, rate);
}

/** One HLS segment (with its fMP4 init segment when there is one), decoded and recognized. */
async function segment(init: string | undefined, url: string): Promise<ClipResult> {
  const parts = await Promise.all([init, url].filter(Boolean).map((u) => fetch(u!).then((r) => r.arrayBuffer())));
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let o = 0;
  for (const p of parts) { bytes.set(new Uint8Array(p), o); o += p.byteLength; }
  const buf = await new OfflineAudioContext(2, 44100, 44100).decodeAudioData(bytes.buffer);
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(Math.min(1, buf.numberOfChannels - 1));
  const pcm = new Float32Array(l.length * 2);
  for (let i = 0, j = 0; i < l.length; i++) { pcm[j++] = l[i]!; pcm[j++] = r[i]!; }
  return recognize(pcm, buf.sampleRate);
}

/** Interleaved stereo float PCM -> shazamio-core signature -> Shazam's tag endpoint. */
async function recognize(pcm: Float32Array, rate: number): Promise<ClipResult> {
  await ready;
  if (pcm.every((v) => v === 0)) return { error: 'silence' };

  const sig = DecodedSignature.new(pcm, rate, 2);
  const body = { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, signature: { uri: sig.uri, samplems: sig.samplems }, timestamp: Date.now(), context: {}, geolocation: {} };
  sig.free();
  const id = () => crypto.randomUUID().toUpperCase();
  const url = `https://amp.shazam.com/discovery/v5/en/US/web/-/tag/${id()}/${id()}?sync=true&webv3=true&sampling=true&connected=&shazamapiversion=v3&sharehub=true&hubv5minorversion=v5.1&hidelb=true&video=v3`;
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) return { error: `shazam ${res.status}` };
  const track = (await res.json()).track;
  return track
    ? { track: { artist: track.subtitle ?? '', title: track.title ?? '', isrc: track.isrc, art: track.images?.coverart ?? track.images?.background } }
    : {};
}
