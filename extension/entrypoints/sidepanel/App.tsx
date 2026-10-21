import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isPlatform, type Artist } from '@/lib/dizko';
import { fileName, toCsv, toJson, toText } from '@/lib/export';
import { mixKey, type Saved } from '@/lib/history';
import { links } from '@/lib/links';
import { norm } from '@/lib/match';
import type { PanelRequest } from '@/lib/messages';
import { redirectUri, type App as ServiceApp, type Service } from '@/lib/oauth';
import { beatportPlaylistUrl } from '@/lib/stores';
import { BANDCAMP_CARTABLE, BEATPORT_CARTABLE, type Job, type PlaylistService, type Row, type Store } from '@/lib/types';
import { cn } from '@/lib/utils';

const MIX_SITES = /^https:\/\/(www\.youtube\.com\/watch|soundcloud\.com\/[^/]+\/[^/]+|www\.mixcloud\.com\/[^/]+\/[^/]+)/;

const send = (msg: PanelRequest & { streamId?: string }) => browser.runtime.sendMessage(msg);
const cartIn = (store: Store) => send({ type: 'panel:cart', stores: [store] });

const LINK = 'underline decoration-toner-3 underline-offset-2 hover:decoration-ink';

function clock(s: number | null | undefined) {
  if (s == null) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}

const sourceOf = (url: string) =>
  /youtube\.com/.test(url) ? 'YouTube' : /soundcloud\.com/.test(url) ? 'SoundCloud' : /mixcloud\.com/.test(url) ? 'Mixcloud' : 'Mix';

function when(t: number) {
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86_400_000);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

// ---- storage subscriptions

function useStored<T>(area: 'session' | 'local', key: string, fallback: T): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    browser.storage[area].get(key).then((r) => setValue((r[key] as T) ?? fallback));
    const onChange = (changes: Record<string, { newValue?: unknown }>, changed: string) => {
      if (changed === area && key in changes) setValue((changes[key]!.newValue as T) ?? fallback);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);
  return value;
}

function useActiveTab() {
  const [tab, setTab] = useState<{ id: number; url: string } | null>(null);
  useEffect(() => {
    const refresh = () =>
      browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => setTab(t?.id ? { id: t.id, url: t.url ?? '' } : null));
    refresh();
    browser.tabs.onActivated.addListener(refresh);
    browser.tabs.onUpdated.addListener(refresh);
    return () => {
      browser.tabs.onActivated.removeListener(refresh);
      browser.tabs.onUpdated.removeListener(refresh);
    };
  }, []);
  return tab;
}

function download(job: Job, kind: 'txt' | 'csv' | 'json') {
  const body = kind === 'txt' ? toText(job) : kind === 'csv' ? toCsv(job) : toJson(job);
  const type = kind === 'json' ? 'application/json' : kind === 'csv' ? 'text/csv' : 'text/plain';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type }));
  a.download = fileName(job, kind);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- small pieces

function StoreLinks({ row }: { row: Row }) {
  const l = links(row);
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 text-[12px] font-medium">
      <a href={l.beatport} target="_blank" rel="noreferrer" className={LINK}>Beatport</a>
      <a href={l.bandcamp} target="_blank" rel="noreferrer" className={LINK}>Bandcamp</a>
      <a href={l.spotify} target="_blank" rel="noreferrer" className={LINK}>Spotify</a>
      <a href={l.youtube} target="_blank" rel="noreferrer" className={LINK}>YouTube</a>
    </p>
  );
}

/** The DJ behind the mix, from Dizko: what they play, where they are based, and where they play next. */
function ArtistBlock({ artist }: { artist: Artist }) {
  const [allDates, setAllDates] = useState(false);
  const shown = allDates ? artist.events : artist.events.slice(0, 3);
  const about = [artist.genres.map(titleCase).join(', '), artist.cities.length ? `Based around ${artist.cities.join(', ')}` : '']
    .filter(Boolean)
    .join('. ');
  return (
    <section className="border-b border-toner-3 px-4 py-3 text-[13px]">
      <a href={artist.url} target="_blank" rel="noreferrer" className="text-[17px] font-semibold tracking-[-0.02em] hover:underline">{artist.name}</a>
      {about && <p className="mt-0.5 text-toner-1">{about}.</p>}
      <a href={artist.url} target="_blank" rel="noreferrer" className={cn(LINK, 'mt-1 inline-block text-[12px] font-semibold')}>More on Dizko</a>
      {artist.events.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {shown.map((e) => (
            <li key={e.url}>
              <a href={e.url} target="_blank" rel="noreferrer" className="group grid grid-cols-[76px_minmax(0,1fr)] gap-x-2">
                <span className="font-semibold">{new Date(`${e.date}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold group-hover:underline">{e.title}</span>
                  <span className="block truncate text-toner-1">{titleCase(e.city)}, {e.venue}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {artist.events.length > 3 && (
        <button
          type="button"
          onClick={() => setAllDates(!allDates)}
          aria-expanded={allDates}
          className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold text-toner-1 hover:text-ink"
        >
          {allDates ? 'Fewer dates' : `${artist.events.length - 3} more dates`}
          {allDates ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
        </button>
      )}
      {!artist.claimed && (
        <p className="mt-2 text-[12px] text-toner-2">
          Are you {artist.name}?{' '}
          <a href="https://build.dizko.app" target="_blank" rel="noreferrer" className={cn(LINK, 'font-semibold text-ink')}>Claim this page</a>
        </p>
      )}
    </section>
  );
}

// ---- library: saved mixes and the tracks ticked across them

/** The DJ for a saved mix: Dizko's match, else the uploader unless that is a channel hosting other DJs' sets. */
const dj = (h: Saved) => (h.artist && !isPlatform(h.artist.name) ? h.artist.name : isPlatform(h.mix.uploader) ? undefined : h.mix.uploader);

function Library({ items, onOpen }: { items: Saved[]; onOpen: (url: string) => void }) {
  const picks = new Map<string, { row: Row; mix: Saved }>();
  for (const h of items) {
    for (const row of h.rows) {
      if (!row.selected) continue;
      const key = norm(row.track.artist + row.track.title).replace(/\s/g, '');
      if (!picks.has(key)) picks.set(key, { row, mix: h });
    }
  }
  // DJs scanned so far, most mixes first: Dizko's profile where it knows them, else the uploader's name
  const byDj = new Map<string, { name: string; artist?: Artist; mixes: Saved[] }>();
  for (const h of items) {
    const name = dj(h);
    if (!name) continue;
    const key = norm(name);
    const entry = byDj.get(key) ?? { name, mixes: [] };
    entry.artist ??= h.artist && !isPlatform(h.artist.name) ? h.artist : undefined;
    entry.mixes.push(h);
    byDj.set(key, entry);
  }
  const artists = [...byDj.values()].sort((a, b) => b.mixes.length - a.mixes.length);
  return (
    <Tabs defaultValue="mixes" className="min-h-0 flex-1 gap-0">
      <TabsList variant="line" className="h-10 w-full justify-start gap-5 border-b border-toner-3 px-4">
        <TabsTrigger value="mixes" className="flex-none px-0 text-[14px] font-semibold">Mixes {items.length}</TabsTrigger>
        <TabsTrigger value="artists" className="flex-none px-0 text-[14px] font-semibold">Artists {artists.length}</TabsTrigger>
        <TabsTrigger value="tracks" className="flex-none px-0 text-[14px] font-semibold">Tracks {picks.size}</TabsTrigger>
      </TabsList>
      <TabsContent value="mixes" className="overflow-y-auto px-4">
        <ul>
          {items.map((h) => {
            const ticked = h.rows.filter((r) => r.selected).length;
            const carted = h.rows.filter((r) => r.status === 'carted').length;
            return (
              <li key={h.mix.url} className="border-b border-toner-3 py-3">
                <button type="button" onClick={() => onOpen(h.mix.url)} className="block w-full text-left hover:underline">
                  <span className="line-clamp-2 text-[18px] leading-[1.15] font-semibold tracking-[-0.02em]">{h.mix.title}</span>
                </button>
                {dj(h) && <p className="mt-0.5 truncate text-[13px] font-semibold text-toner-1">{dj(h)}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold whitespace-nowrap text-toner-2">
                  <a href={h.mix.url} target="_blank" rel="noreferrer" className={cn(LINK, 'text-ink')}>{sourceOf(h.mix.url)}</a>
                  <span>{ticked} of {h.rows.length} ticked</span>
                  {carted > 0 && <span className="text-ink">{carted} in cart</span>}
                  <span>{when(h.savedAt)}</span>
                  <button type="button" onClick={() => send({ type: 'panel:forget', url: h.mix.url })} className="ml-auto text-toner-2 hover:text-ink hover:underline">
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </TabsContent>
      <TabsContent value="artists" className="overflow-y-auto px-4">
        {!artists.length && <p className="py-5 text-[14px] text-toner-1">The DJs behind the mixes you open collect here.</p>}
        <ul>
          {artists.map(({ name, artist, mixes }) => {
            const next = artist?.events[0];
            return (
              <li key={name} className="border-b border-toner-3 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  {artist ? (
                    <a href={artist.url} target="_blank" rel="noreferrer" className="truncate text-[18px] leading-[1.15] font-semibold tracking-[-0.02em] hover:underline">{name}</a>
                  ) : (
                    <span className="truncate text-[18px] leading-[1.15] font-semibold tracking-[-0.02em]">{name}</span>
                  )}
                  {artist && <a href={artist.url} target="_blank" rel="noreferrer" className={cn(LINK, 'shrink-0 text-[12px] font-semibold')}>Dizko</a>}
                </div>
                {next && (
                  <a href={next.url} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-[13px] text-toner-1 hover:text-ink hover:underline">
                    Next: {new Date(`${next.date}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, {titleCase(next.city)}
                  </a>
                )}
                <ul className="mt-1.5 space-y-0.5">
                  {mixes.map((h) => (
                    <li key={h.mix.url}>
                      <button type="button" onClick={() => onOpen(h.mix.url)} className="block max-w-full truncate text-left text-[13px] font-semibold hover:underline">
                        {h.mix.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </TabsContent>
      <TabsContent value="tracks" className="overflow-y-auto px-4">
        {!picks.size && <p className="py-5 text-[14px] text-toner-1">Tracks you tick in a mix collect here.</p>}
        <ul>
          {[...picks.values()].map(({ row, mix }) => (
            <li key={`${row.track.artist}|${row.track.title}`} className="border-b border-toner-3 py-2.5">
              <p className="truncate text-[13px] font-semibold text-toner-1">{row.track.artist}</p>
              <p className="text-[16px] leading-[1.2] font-semibold tracking-[-0.01em]">
                <span className={row.status === 'carted' ? 'highlighter' : undefined}>{row.track.title}</span>
              </p>
              <button type="button" onClick={() => onOpen(mix.mix.url)} className="mt-0.5 block max-w-full truncate text-left text-[12px] text-toner-2 hover:text-ink hover:underline">
                From {mix.mix.title}
              </button>
              <StoreLinks row={row} />
            </li>
          ))}
        </ul>
      </TabsContent>
    </Tabs>
  );
}

// ---- playlists on other services

const SERVICES: { id: PlaylistService; name: string; app?: { where: string; url: string; secret: boolean } }[] = [
  { id: 'beatport', name: 'Beatport' },
  { id: 'spotify', name: 'Spotify', app: { where: 'Spotify developer dashboard', url: 'https://developer.spotify.com/dashboard', secret: false } },
  { id: 'soundcloud', name: 'SoundCloud', app: { where: 'SoundCloud app settings', url: 'https://soundcloud.com/you/apps', secret: true } },
];

/** One playlist per service from the ticked tracks; Spotify and SoundCloud go through the DJ's own developer app. */
function Playlists({ job, ticked }: { job: Job; ticked: number }) {
  const apps = useStored<Partial<Record<Service, ServiceApp>>>('local', 'apps', {});
  const [connecting, setConnecting] = useState<Service | null>(null);
  const urlFor = (id: PlaylistService) => job.made?.[id]?.url ?? (id === 'beatport' && job.playlist?.beatport ? beatportPlaylistUrl(job.playlist.beatport) : undefined);
  return (
    <section className="border-t border-toner-3 px-4 py-3">
      <p className="text-[13px] font-semibold">Playlist of the {ticked} ticked</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {SERVICES.map((s) => {
          const url = urlFor(s.id);
          if (url) {
            return (
              <Button key={s.id} asChild variant="outline" className="h-9 border-toner-2 bg-transparent hover:bg-surface px-2 text-[13px] font-semibold">
                <a href={url} target="_blank" rel="noreferrer" aria-label={`Open the ${s.name} playlist`}>{s.name}<ArrowUpRight className="size-3.5" aria-hidden /></a>
              </Button>
            );
          }
          const needsApp = s.app && !apps[s.id as Service]?.clientId;
          return (
            <Button
              key={s.id}
              variant="outline"
              disabled={!ticked || !!job.making}
              onClick={() => (needsApp ? setConnecting(s.id as Service) : send({ type: 'panel:playlist', service: s.id }))}
              className="h-9 border-toner-2 bg-transparent hover:bg-surface px-2 text-[13px] font-semibold"
            >
              {job.making === s.id ? 'Making…' : s.name}
            </Button>
          );
        })}
      </div>
      {SERVICES.map(({ id, name }) => {
        const m = job.made?.[id];
        return m?.missing.length ? (
          <p key={id} className="mt-1.5 text-[12px] text-toner-2">{name} did not have {m.missing.length}: {m.missing.slice(0, 3).join('; ')}{m.missing.length > 3 ? '…' : ''}</p>
        ) : null;
      })}
      {connecting && <Connect service={connecting} onDone={() => setConnecting(null)} />}
    </section>
  );
}

function Connect({ service, onDone }: { service: Service; onDone: () => void }) {
  const s = SERVICES.find((x) => x.id === service)!;
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  async function save() {
    await send({ type: 'panel:connect', service, app: { clientId: clientId.trim(), ...(s.app!.secret ? { clientSecret: clientSecret.trim() } : {}) } });
    onDone();
    await send({ type: 'panel:playlist', service });
  }
  return (
    <div className="mt-3 space-y-2 border-t border-toner-3 pt-3 text-[13px]">
      <p className="leading-snug">
        {s.name} playlists go through your own developer app. In the{' '}
        <a href={s.app!.url} target="_blank" rel="noreferrer" className="font-semibold underline decoration-1">{s.app!.where}</a>, add this redirect URI, then paste the app's details here. They stay in this browser.
      </p>
      <p className="bg-accent px-2 py-1.5 font-mono text-[12px] break-all select-all">{redirectUri(service)}</p>
      <label className="block">
        <span className="font-semibold">Client ID</span>
        <Input value={clientId} onChange={(e) => setClientId(e.target.value)} className="mt-1 rounded-[0.75rem] border-toner-2" autoComplete="off" spellCheck={false} />
      </label>
      {s.app!.secret && (
        <label className="block">
          <span className="font-semibold">Client secret</span>
          <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} className="mt-1 rounded-[0.75rem] border-toner-2" autoComplete="off" />
        </label>
      )}
      <div className="flex gap-2 pt-1">
        <Button onClick={save} disabled={!clientId.trim() || (s.app!.secret && !clientSecret.trim())} className="h-9 flex-1 text-[14px] font-semibold">Save and make playlist</Button>
        <Button variant="ghost" onClick={onDone} className="h-9 text-[13px] text-toner-2">Cancel</Button>
      </div>
    </div>
  );
}

// ---- the panel

export default function App() {
  const job = useStored<Job | null>('session', 'job', null);
  const items = useStored<Saved[]>('local', 'history', []);
  const tab = useActiveTab();
  const [error, setError] = useState('');
  // the DJ chose the library while a mix is loaded; cleared by opening a mix or moving to another page
  const [library, setLibrary] = useState(false);
  // a mix opened from the library, shown while the DJ is on some other page
  const [opened, setOpened] = useState<string | null>(null);
  const onMixPage = !!tab && MIX_SITES.test(tab.url);
  const sameMix = !!job && !!tab && mixKey(job.mix.url) === mixKey(tab.url);
  const fromLibrary = !!job && !!opened && !sameMix && mixKey(job.mix.url) === mixKey(opened);
  const busy = job?.phase === 'identifying' || job?.phase === 'carting' || !!job?.listening;

  // Read the page as soon as the panel opens on a mix that is not already loaded
  useEffect(() => {
    setLibrary(false);
    if (onMixPage) setOpened(null);
    if (tab && onMixPage && !sameMix && !busy) {
      send({ type: 'panel:read', tabId: tab.id }).then((r) => setError(r?.error ?? ''));
    }
  }, [tab?.id, tab?.url]);

  async function listen(resume = false) {
    if (!tab) return;
    try {
      // SoundCloud is fingerprinted from its own stream; other sites need the tab's audio
      const streamId = job?.method === 'stream' ? undefined : await browser.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      setError('');
      await send({ type: 'panel:identify', tabId: tab.id, streamId, resume });
    } catch (e) {
      setError(`Could not listen to this tab: ${String(e).replace(/^Error: /, '')}`);
    }
  }

  // A mix with no written tracklist starts identifying as soon as the panel has read it, once per mix; the
  // button below only comes back if that listen could not start
  const started = useRef(new Set<string>());
  useEffect(() => {
    if (!job || !sameMix || busy || job.phase !== 'reading' || job.rows.length || started.current.has(mixKey(job.mix.url))) return;
    started.current.add(mixKey(job.mix.url));
    listen();
  }, [job?.mix.url, job?.phase, sameMix]);

  async function open(url: string) {
    if (job && mixKey(job.mix.url) === mixKey(url)) {
      setLibrary(false);
      setOpened(url);
      return;
    }
    if ((await send({ type: 'panel:open', url }))?.ok) {
      setLibrary(false);
      setOpened(url);
    } else setError('Finish the current listen or cart run first.');
  }

  const showMix = !!job && !library && (sameMix || fromLibrary || busy);

  if (!showMix) {
    return (
      <main className="flex h-full flex-col">
        <header className="border-b border-toner-3 px-4 pt-4 pb-3.5">
          <h1 className="text-[26px] leading-none font-semibold tracking-[-0.03em]">Mix to Cart</h1>
          <p className="mt-2.5 text-[13px]">
            Are you a DJ?{' '}
            <a href="https://build.dizko.app" target="_blank" rel="noreferrer" className="font-semibold underline decoration-1">Claim your page on Dizko</a>
          </p>
        </header>
        {job && library && (sameMix || busy) && (
          <button type="button" onClick={() => setLibrary(false)} className="border-b border-toner-3 px-4 py-2.5 text-left text-[13px] font-semibold hover:underline">
            Back to {job.mix.title}
          </button>
        )}
        {onMixPage && !library ? (
          <p className="px-4 py-5 text-[15px] text-toner-1">Reading this mix…</p>
        ) : items.length ? (
          <Library items={items} onOpen={open} />
        ) : (
          <p className="px-4 py-5 text-[15px] leading-snug text-toner-1">Open a DJ mix on YouTube, SoundCloud or Mixcloud, and its tracklist appears here. Every mix you open is saved to your library.</p>
        )}
        {error && <p className="px-4 pb-3 text-[13px] text-miss">{error}</p>}
      </main>
    );
  }

  const selected = job.rows.filter((r) => r.selected);
  const unconfirmed = job.rows.filter((r) => r.track.hits < 2).length;
  const carted = job.rows.filter((r) => r.status === 'carted');
  const forBeatport = selected.filter((r) => BEATPORT_CARTABLE.includes(r.status)).length;
  const forBandcamp = selected.filter((r) => BANDCAMP_CARTABLE.includes(r.status)).length;
  const locked = job.phase === 'carting';
  const current = job.rows.find((r) => r.status === 'searching');
  const progress = Math.round((job.progress ?? 0) * 100);
  const playlistUrl = job.playlist?.beatport ? beatportPlaylistUrl(job.playlist.beatport) : undefined;

  const cartButtons = (forBeatport > 0 || forBandcamp > 0) && (
    <div>
      <p className="mb-1.5 text-[13px] font-semibold">Purchase</p>
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={!forBeatport} onClick={() => cartIn('beatport')} className="h-10 text-[14px] font-semibold">
          Beatport{forBeatport ? ` (${forBeatport})` : ''}
        </Button>
        <Button variant="outline" disabled={!forBandcamp} onClick={() => cartIn('bandcamp')} className="h-10 border-toner-2 bg-transparent hover:bg-surface text-[14px] font-semibold">
          Bandcamp{forBandcamp ? ` (${forBandcamp})` : ''}
        </Button>
      </div>
    </div>
  );

  return (
    <main className="flex h-full flex-col">
      <header className="border-b border-toner-3 px-4 pt-3 pb-3.5">
        <button type="button" onClick={() => setLibrary(true)} className="-ml-1 flex items-center gap-0.5 text-[13px] font-semibold hover:underline">
          <ChevronLeft className="size-4" aria-hidden />
          Library
        </button>
        <h1 className="mt-2 line-clamp-3 text-[26px] leading-[1.05] font-semibold tracking-[-0.03em]">{job.mix.title}</h1>
        <p className="mt-2 flex flex-wrap gap-x-3.5 text-[13px] font-semibold">
          <a href={job.mix.url} target="_blank" rel="noreferrer" className="underline decoration-1 underline-offset-2">{sourceOf(job.mix.url)}</a>
          {job.mix.duration ? <span>{clock(job.mix.duration)}</span> : null}
          {job.rows.length > 0 && <span>{job.rows.length} tracks</span>}
        </p>
      </header>

      {busy && onMixPage && !sameMix && tab && (
        <button
          type="button"
          onClick={() => send({ type: 'panel:switch', tabId: tab.id })}
          className="flex items-center justify-between gap-3 border-b border-toner-3 bg-ink px-4 py-2.5 text-left text-[13px] font-semibold text-paper"
        >
          <span>This tab has another mix. This one stops; what it found stays in your library.</span>
          <span className="shrink-0 underline decoration-1 underline-offset-2">Switch</span>
        </button>
      )}

      {job.artist && !isPlatform(job.artist.name) && <ArtistBlock artist={job.artist} />}

      <section className="space-y-2.5 border-b border-toner-3 px-4 py-3">
        {job.phase === 'reading' && !job.rows.length && (
          <>
            <p className="text-[14px] leading-snug">
              {error ? 'Listening could not start.' : 'No tracklist in the description, so it listens to the mix.'}
              {job.method === 'seek' ? ' This tab stays quiet while it jumps through.' : job.method === 'live' ? ' Press play and leave it running.' : ''}
            </p>
            {error && <Button onClick={() => listen()} disabled={!sameMix} className="h-10 w-full text-[15px] font-semibold">Try again</Button>}
          </>
        )}
        {(job.phase === 'identifying' || (job.phase === 'carting' && job.listening)) && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-semibold">Listening</span>
              <span className="flex items-baseline gap-3">
                <button type="button" onClick={() => send({ type: 'panel:stop-listening' })} className="text-[12px] text-toner-2 hover:text-ink hover:underline">Stop</button>
                <span className="text-[18px] font-semibold tabular-nums">{progress}%</span>
              </span>
            </div>
            <Progress value={progress} className="h-1.5 bg-toner-3 [&>*]:bg-fill" />
            {job.following && playlistUrl && (
              <p className="text-[13px] text-toner-1">
                New finds go straight into your <a href={playlistUrl} target="_blank" rel="noreferrer" className="font-semibold text-ink underline decoration-1">Beatport playlist</a>.
              </p>
            )}
          </div>
        )}
        {job.phase === 'review' && !job.rows.length && (
          <>
            {!job.error && <p className="text-[14px] leading-snug">No tracks were recognized in this mix.</p>}
            <Button onClick={() => listen()} disabled={!sameMix} className="h-10 w-full text-[15px] font-semibold">Try again</Button>
          </>
        )}
        {job.phase === 'carting' ? (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-semibold">
                {job.waitingFor === 'beatport-login' ? 'Log in to Beatport in the new tab' : job.waitingFor === 'store-check' ? 'The store wants to check you are human' : 'Adding to cart'}
              </span>
              <button type="button" onClick={() => send({ type: 'panel:stop' })} className="text-[12px] text-toner-2 hover:text-ink hover:underline">Stop</button>
            </div>
            <p className="truncate text-[13px] text-toner-1">
              {job.waitingFor === 'beatport-login'
                ? 'Beatport keeps carts in your account. It carries on by itself once you are logged in.'
                : job.waitingFor === 'store-check'
                  ? 'Answer it in the tab that just opened. It carries on by itself afterwards.'
                  : current
                    ? `Now: ${current.track.artist}, ${current.track.title}`
                    : 'Filling the cart…'}
            </p>
          </div>
        ) : (
          job.rows.length > 0 && (
            <>
              {carted.length > 0 && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14px] font-semibold">{carted.length} in your cart</p>
                  <span className="flex gap-3 text-[13px] font-semibold">
                    {Object.entries(job.carts ?? {}).map(([s, url]) => (
                      <a key={s} href={url} target="_blank" rel="noreferrer" className={LINK}>Open {s === 'beatport' ? 'Beatport' : 'Bandcamp'}</a>
                    ))}
                  </span>
                </div>
              )}
              {!carted.length && playlistUrl && job.rows.some((r) => r.status === 'in-playlist') && (
                <p className="text-[13px] text-toner-1">
                  In your <a href={playlistUrl} target="_blank" rel="noreferrer" className="font-semibold text-ink underline decoration-1">Beatport playlist</a>; its Buy All puts them in the cart.
                </p>
              )}
              {job.phase === 'review' && !job.tracklistFound && job.method !== 'live' && (job.progress ?? 1) < 0.98 && (
                <p className="flex items-center justify-between gap-3 text-[13px] text-toner-1">
                  <span>Listening stopped at {progress}%.</span>
                  {sameMix ? (
                    <button type="button" onClick={() => listen(true)} className="font-semibold text-ink underline decoration-1 underline-offset-2">Keep listening</button>
                  ) : (
                    <a href={job.mix.url} target="_blank" rel="noreferrer" className="font-semibold text-ink underline decoration-1 underline-offset-2">Open the mix to finish</a>
                  )}
                </p>
              )}
              {cartButtons}
            </>
          )
        )}
        {(error || job.error) && <p className="text-[13px] text-miss">{error || job.error}</p>}
      </section>

      {job.rows.length > 0 && (
        <div className="flex items-center justify-between border-b border-toner-3 px-4 py-1.5 text-[13px]">
          <span className="text-toner-2">{selected.length} of {job.rows.length} ticked</span>
          <span className="flex">
            <Button variant="ghost" size="sm" disabled={locked || selected.length === job.rows.length} onClick={() => send({ type: 'panel:select', all: true })} className="h-8 px-2 text-[13px]">Select all</Button>
            <Button variant="ghost" size="sm" disabled={locked || !selected.length} onClick={() => send({ type: 'panel:select', all: false })} className="h-8 px-2 text-[13px]">Deselect all</Button>
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Billing: confirmed tracks set large, single-hit IDs on the smaller "plus" line */}
        <ol>
          {job.rows.map((row, i) => row.track.hits >= 2 && <TrackRow key={`${row.track.artist}|${row.track.title}`} row={row} index={i} locked={locked} />)}
        </ol>
        {unconfirmed > 0 && (
          <>
            <h2 className="mt-5 border-b border-toner-3 pb-1.5 text-[16px] font-semibold tracking-[-0.01em]">Plus {unconfirmed} unconfirmed</h2>
            <p className="pt-1.5 text-[12px] text-toner-2">Each heard in one clip only. Often a sample or a blend, so they start unticked.</p>
            <ol>
              {job.rows.map((row, i) => row.track.hits < 2 && <TrackRow key={`${row.track.artist}|${row.track.title}`} row={row} index={i} locked={locked} />)}
            </ol>
          </>
        )}
        {job.phase === 'identifying' && !job.rows.length && <p className="py-6 text-[14px] text-toner-2">Tracks appear here as they are recognized.</p>}
      </div>

      {job.rows.length > 0 && <Playlists job={job} ticked={selected.length} />}

      {job.rows.length > 0 && (
        <footer className="flex items-center gap-2 border-t border-toner-3 px-4 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 gap-1 border-toner-2 bg-transparent hover:bg-surface text-[14px] font-semibold">Export tracklist<ChevronDown className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => download(job, 'txt')}>Text, with links</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => download(job, 'csv')}>Spreadsheet (CSV)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => download(job, 'json')}>JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {sameMix && !busy && (
            <Button
              variant="ghost"
              className="ml-auto h-9 text-[13px] text-toner-2"
              onClick={() => send({ type: 'panel:reset' }).then(() => tab && send({ type: 'panel:read', tabId: tab.id }))}
            >
              Scan again
            </Button>
          )}
        </footer>
      )}
    </main>
  );
}

const STATUS_TEXT: Partial<Record<Row['status'], string>> = {
  searching: 'Searching',
  carted: 'In cart',
  'in-playlist': 'In playlist',
  'version-missing': 'Version not found',
  'album-only': 'Album only',
  'not-found': 'Not found',
  'login-needed': 'Needs login',
  failed: 'Could not add',
};

const STORE_NAME: Record<Store, string> = { beatport: 'Beatport', bandcamp: 'Bandcamp' };

function TrackRow({ row, index, locked }: { row: Row; index: number; locked: boolean }) {
  const confirmed = row.track.hits >= 2;
  const where = row.missingFrom?.length ? row.missingFrom.map((s) => STORE_NAME[s]).join(' or ') : '';
  const status =
    row.status === 'not-found' && where ? `Not on ${where}`
    : row.status === 'version-missing' && where ? `Version not on ${where}`
    : STATUS_TEXT[row.status];
  // a store not having a record is information, not an error; only failures are red
  const miss = ['failed', 'login-needed'].includes(row.status);
  const id = `track-${index}`;
  return (
    // Status shares the artist line so the track name, notes and links get the full width
    <li className="grid grid-cols-[22px_42px_minmax(0,1fr)] gap-x-2 border-b border-toner-3 py-2.5">
      <Checkbox id={id} checked={row.selected} disabled={locked} onCheckedChange={() => send({ type: 'panel:toggle', index })} className="mt-0.5 border-toner-2 data-[state=checked]:border-tick data-[state=checked]:bg-tick data-[state=checked]:text-on-tick" />
      <span className="pt-0.5 text-[12px] font-semibold text-toner-2">{clock(row.track.at)}</span>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="min-w-0 cursor-pointer truncate text-[13px] font-semibold text-toner-1">{row.track.artist}</label>
          {status && <span className={cn('shrink-0 text-[12px] font-bold', miss ? 'text-miss' : row.status === 'carted' || row.status === 'in-playlist' ? '' : 'text-toner-2')}>{status}</span>}
        </div>
        <label htmlFor={id} className={cn('block cursor-pointer leading-[1.08]', confirmed ? 'text-[19px] font-semibold tracking-[-0.02em]' : 'text-[15px] font-medium')}>
          <span className={row.status === 'carted' ? 'highlighter' : undefined}>{row.track.title}</span>
        </label>
        {row.status === 'version-missing' && row.alternatives?.length ? (
          <p className="mt-0.5 text-[12px] text-toner-1">Available: {[...new Set(row.alternatives.map((a) => a.version || 'Original'))].join(', ')}</p>
        ) : null}
        <StoreLinks row={row} />
      </div>
    </li>
  );
}
