import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { PreviewButton, stopPreview } from './Preview';
import { SettingsPage, useSettings } from './Settings';
import { useStored } from './useStored';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isPlatform, type Artist } from '@/lib/dizko';
import { fileName, time, toCsv, toJson, toText } from '@/lib/export';
import { djOf, mixKey, type Saved } from '@/lib/history';
import { links } from '@/lib/links';
import { DIZKO_LINK } from '@/lib/dizkoAccount';
import { parseClock } from '@/lib/identify';
import { norm } from '@/lib/match';
import { TAB_AUDIO_NEEDED, type PanelRequest } from '@/lib/messages';
import { profileOf, type Upload } from '@/lib/soundcloud';
import { beatportPlaylistUrl } from '@/lib/stores';
import { BANDCAMP_CARTABLE, BEATPORT_CARTABLE, coverage, type Job, trackKey, type Row, type Store } from '@/lib/types';
import { cn } from '@/lib/utils';

// SoundCloud only for the first release; YouTube (www\.youtube\.com\/watch) and Mixcloud come back in an update
const NOT_A_DJ = /^(discover|stations|search|you|feed|charts|upload|settings|messages|notifications|pages|terms-of-use|tags|n|people)$/;
const NOT_A_TRACK = /^(tracks|sets|albums|popular-tracks|reposts|likes|following|followers|comments|spotlight)$/;
/** A SoundCloud track page (soundcloud.com/dj/track), not a profile tab or a section of the site. */
const isMixPage = (url: string) => {
  const m = url.match(/^https:\/\/soundcloud\.com\/([^/?#]+)\/([^/?#]+)/);
  return !!m && !NOT_A_DJ.test(m[1]!) && !NOT_A_TRACK.test(m[2]!);
};

const send = (msg: PanelRequest & { streamId?: string }) => browser.runtime.sendMessage(msg);
const cartIn = (store: Store) => send({ type: 'panel:cart', stores: [store] });

const LINK = 'underline decoration-toner-3 underline-offset-2 hover:decoration-ink';


function when(t: number) {
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86_400_000);
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

// ---- storage subscriptions


function useActiveTab() {
  const [tab, setTab] = useState<{ id: number; url: string } | null>(null);
  useEffect(() => {
    const refresh = () =>
      browser.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
        const next = t?.id ? { id: t.id, url: t.url ?? '' } : null;
        // any tab's update calls this (the cart run's own tabs too); only a real change re-renders the panel
        setTab((now) => (now?.id === next?.id && now?.url === next?.url ? now : next));
      });
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
  // a store the cart run searched and did not find gets no link: it would only open an empty search
  const has = (store: Store) => !row.missingFrom?.includes(store);
  return (
    <p className="mt-1 flex flex-wrap gap-x-3 text-[12px] font-medium">
      {has('beatport') && <a href={l.beatport} target="_blank" rel="noreferrer" className={LINK}>Beatport</a>}
      {has('bandcamp') && <a href={l.bandcamp} target="_blank" rel="noreferrer" className={LINK}>Bandcamp</a>}
      <a href={l.spotify} target="_blank" rel="noreferrer" className={LINK}>Spotify</a>
      <a href={l.youtube} target="_blank" rel="noreferrer" className={LINK}>YouTube</a>
    </p>
  );
}

/** The DJ behind the mix, from Dizko: what they play, where they are based, and where they play next. */
function ArtistBlock({ artist, onName, hideName, claim, bare }: { artist: Artist; onName?: () => void; hideName?: boolean; claim?: boolean; bare?: boolean }) {
  const [allDates, setAllDates] = useState(false);
  const shown = allDates ? artist.events : artist.events.slice(0, 3);
  const about = [artist.genres.map(titleCase).join(', '), artist.cities.join(', ')].filter(Boolean).join('  ·  ');
  return (
    <section data-area="dizko" className={cn('text-[13px]', bare ? 'mt-1' : 'border-b border-toner-3 px-4 py-3')}>
      {!hideName && onName && (
        <button type="button" onClick={onName} className="text-left text-[17px] font-semibold tracking-[-0.02em] hover:underline">{artist.name}</button>
      )}
      {about && <p className={cn('text-toner-1', !hideName && 'mt-0.5')}>{about}</p>}
      {artist.events.length > 0 && (
        <ul className="mt-3 space-y-2">
          {shown.map((e, i) => (
            <li key={e.url} className={i >= 3 ? 'enter-down' : undefined} style={i >= 3 ? { animationDelay: `${(i - 3) * 40}ms` } : undefined}>
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
          <ChevronDown className={cn('size-3.5 transition-transform duration-200 ease-out', allDates && 'rotate-180')} aria-hidden />
        </button>
      )}
      {claim && !artist.claimed && (
        <p className="mt-2 text-[12px] text-toner-2">
          Are you {artist.name}?{' '}
          <a href="https://build.dizko.app" target="_blank" rel="noreferrer" className={cn(LINK, 'font-semibold text-ink')}>Claim this page</a>
        </p>
      )}
    </section>
  );
}

/** A DJ's picture in a circle; an empty surface circle holds the place. */
function Avatar({ src, size = 48 }: { src?: string; size?: number }) {
  const box = { width: size, height: size };
  return src ? (
    <img src={src} alt="" loading="lazy" style={box} className="shrink-0 rounded-full bg-surface object-cover" />
  ) : (
    <span style={box} className="shrink-0 rounded-full bg-surface" aria-hidden />
  );
}

/** Artwork square; an empty surface tile keeps rows aligned when there is none. */
function Cover({ src, size = 52 }: { src?: string; size?: number }) {
  const box = { width: size, height: size };
  return src ? (
    <img src={src} alt="" loading="lazy" style={box} className="mt-0.5 shrink-0 rounded-[6px] bg-surface object-cover" />
  ) : (
    <span style={box} className="mt-0.5 shrink-0 rounded-[6px] bg-surface" aria-hidden />
  );
}

// ---- library: saved mixes and the tracks ticked across them


interface Dj {
  key: string;
  name: string;
  artist?: Artist;
  avatar?: string;
  mixes: Saved[];
}

/** DJs scanned so far, most mixes first: Dizko's profile where it knows them, else the uploader's name. */
function djsOf(items: Saved[]): Dj[] {
  const byDj = new Map<string, Dj>();
  for (const h of items) {
    const name = djOf(h);
    if (!name) continue;
    const key = norm(name);
    const entry = byDj.get(key) ?? { key, name, mixes: [] };
    entry.artist ??= h.artist && !isPlatform(h.artist.name) ? h.artist : undefined;
    // Dizko's picture, else the uploader's when the DJ uploaded the mix themselves
    entry.avatar ??= entry.artist?.avatar ?? (h.mix.uploader && norm(h.mix.uploader) === key ? h.mix.uploaderAvatar : undefined);
    entry.mixes.push(h);
    byDj.set(key, entry);
  }
  return [...byDj.values()].sort((a, b) => b.mixes.length - a.mixes.length);
}

const TAB_ORDER = ['artists', 'mixes', 'tracks'];

function Library({ items, onOpen, onArtist, onAccount }: { items: Saved[]; onOpen: (url: string) => void; onArtist: (key: string) => void; onAccount: () => void }) {
  // follows the link made or undone in Settings
  const linked = !!useStored<{ access?: string } | null>('local', 'dizkoAccount', null)?.access;
  // the chosen tab survives a visit to a mix or an artist; the new tab slides in from the side it sits on
  const [tabValue, setTabValue] = useState(() => sessionStorage.getItem('library-tab') ?? 'artists');
  const [tabFrom, setTabFrom] = useState<'right' | 'left' | null>(null);
  const pickTab = (v: string) => {
    setTabFrom(TAB_ORDER.indexOf(v) > TAB_ORDER.indexOf(tabValue) ? 'right' : 'left');
    setTabValue(v);
    try { sessionStorage.setItem('library-tab', v); } catch { /* storage can be unavailable */ }
  };
  const tabMotion = tabFrom === 'right' ? 'enter-right' : tabFrom === 'left' ? 'enter-left' : undefined;
  const picks = new Map<string, { row: Row; mix: Saved }>();
  for (const h of items) {
    for (const row of h.rows) {
      if (!row.selected) continue;
      const key = norm(row.track.artist + row.track.title).replace(/\s/g, '');
      if (!picks.has(key)) picks.set(key, { row, mix: h });
    }
  }
  const artists = djsOf(items);
  return (
    <Tabs data-area="library" value={tabValue} onValueChange={pickTab} className="gap-0 overflow-x-clip">
      <TabsList variant="line" className="mt-2 h-11 w-full justify-start gap-6 border-b border-toner-3 px-4">
        <TabsTrigger value="artists" className="flex-none px-0 text-[14px] font-semibold">Artists {artists.length}</TabsTrigger>
        <TabsTrigger value="mixes" className="flex-none px-0 text-[14px] font-semibold">Mixes {items.length}</TabsTrigger>
        <TabsTrigger value="tracks" className="flex-none px-0 text-[14px] font-semibold">Tracks {picks.size}</TabsTrigger>
      </TabsList>
      <TabsContent value="mixes" className={cn("px-4 pb-6", tabMotion)}>
        <ul>
          {items.map((h) => {
            const ticked = h.rows.filter((r) => r.selected).length;
            return (
              <li key={h.mix.url} className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 border-b border-toner-3 py-3">
                <Cover src={h.mix.art} size={64} />
                <div className="min-w-0">
                <button type="button" onClick={() => onOpen(h.mix.url)} className="block w-full text-left hover:underline">
                  <span className="line-clamp-2 text-[18px] leading-[1.15] font-semibold tracking-[-0.02em]">{h.mix.title}</span>
                </button>
                {djOf(h) && (
                  <button type="button" onClick={() => onArtist(norm(djOf(h)!))} className="mt-0.5 block max-w-full truncate text-left text-[13px] font-semibold text-toner-1 hover:text-ink hover:underline">
                    {djOf(h)}
                  </button>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold whitespace-nowrap text-toner-2">
                  <span>{ticked} of {h.rows.length} ticked  ·  {when(h.savedAt)}</span>
                  <button type="button" onClick={() => send({ type: 'panel:forget', url: h.mix.url })} className="ml-auto text-toner-2 hover:text-ink hover:underline">
                    Remove
                  </button>
                </div>
                </div>
              </li>
            );
          })}
        </ul>
      </TabsContent>
      <TabsContent value="artists" className={cn("px-4 pb-6", tabMotion)}>
        {!artists.length && <p className="py-5 text-[14px] text-toner-1">The DJs behind the mixes you open collect here.</p>}
        {DIZKO_LINK && artists.length > 0 && !linked && (
          <button type="button" onClick={onAccount} className="mt-3 flex w-full items-center justify-between gap-3 rounded-[0.75rem] bg-surface px-3.5 py-3 text-left text-[13px] hover:bg-toner-3/40">
            <span className="font-semibold">Add these DJs to your Dizko feed</span>
            <ChevronRight className="size-4 shrink-0 text-toner-2" aria-hidden />
          </button>
        )}
        <ul>
          {artists.map(({ key, name, artist, avatar, mixes }) => {
            const next = artist?.events[0];
            return (
              <li key={key} className="flex gap-3 border-b border-toner-3 py-3">
                <Avatar src={avatar} size={48} />
                <div className="min-w-0 flex-1">
                <button type="button" onClick={() => onArtist(key)} className="block max-w-full truncate text-left text-[18px] leading-[1.15] font-semibold tracking-[-0.02em] hover:underline">
                  {name}
                </button>
                {next && (
                  <a href={next.url} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-[13px] text-toner-1 hover:text-ink hover:underline">
                    {/* the party's name says more than its date; the date is on the artist page */}
                    Next: {next.title || new Date(`${next.date}T12:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, {titleCase(next.city)}
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
                </div>
              </li>
            );
          })}
        </ul>
      </TabsContent>
      <TabsContent value="tracks" className={cn("px-4 pb-6", tabMotion)}>
        {!picks.size && <p className="py-5 text-[14px] text-toner-1">Tracks you tick in a mix collect here.</p>}
        <ul>
          {[...picks.values()].map(({ row, mix }) => (
            <li key={trackKey(row)} className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 border-b border-toner-3 py-2.5">
              <div className="flex flex-col items-center gap-2">
                <Cover src={row.track.art ?? row.offer?.art} />
                <PreviewButton row={row} />
              </div>
              <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-toner-1">{row.track.artist}</p>
              <p className="text-[16px] leading-[1.2] font-semibold tracking-[-0.01em]">
                <span className={row.status === 'carted' ? 'highlighter' : undefined}>{row.track.title}</span>
              </p>
              <TrackFacts offer={row.offer} />
              <button type="button" onClick={() => onOpen(mix.mix.url)} className="mt-0.5 block max-w-full truncate text-left text-[12px] text-toner-2 hover:text-ink hover:underline">
                From {mix.mix.title}
              </button>
              <StoreLinks row={row} />
              </div>
            </li>
          ))}
        </ul>
      </TabsContent>
    </Tabs>
  );
}

// ---- an artist's page inside the panel: Dizko profile, scanned mixes, their other SoundCloud mixes

/** SoundCloud's own embeddable player, so a mix plays inside the panel. */
function Player({ url }: { url: string }) {
  // appears below what opened it, so it drops in from above
  const src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23c4f236&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false`;
  return <iframe title="SoundCloud player" src={src} className="enter-down mt-2 h-[120px] w-full rounded-[0.75rem] border-0" allow="autoplay" loading="lazy" />;
}

function ArtistPage({ entry, onBack, onOpen, onScan, motion }: { entry: Dj; onBack: () => void; onOpen: (url: string) => void; onScan: (url: string) => void; motion?: string }) {
  const { name, artist, mixes } = entry;
  // their SoundCloud: Dizko's link, else the profile behind a mix they uploaded themselves
  const profile =
    artist?.soundcloud ??
    mixes.map((h) => (h.mix.uploader && norm(h.mix.uploader) === entry.key ? profileOf(h.mix.url) : undefined)).find(Boolean);
  const [more, setMore] = useState<Upload[] | null>(null);
  const [avatar, setAvatar] = useState<string | undefined>(entry.avatar);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => {
    if (!profile) return setMore([]);
    send({ type: 'panel:profile-mixes', url: profile }).then((r: { avatar?: string; mixes?: Upload[] }) => {
      setAvatar((a) => r?.avatar ?? a);
      setMore(r?.mixes ?? []);
    }, () => setMore([]));
  }, [profile]);
  const scanned = new Set(mixes.map((h) => mixKey(h.mix.url)));
  const unscanned = (more ?? []).filter((u) => !scanned.has(mixKey(u.url)));
  return (
    <main data-area="artist" className={cn('flex h-full flex-col overflow-y-auto', motion)}>
      <header className="border-b border-toner-3 px-4 pt-3 pb-3.5">
        <button type="button" onClick={onBack} className="-ml-1.5 flex min-h-9 items-center gap-1 pr-2 text-[16px] font-semibold hover:underline">
          <ChevronLeft className="size-6" strokeWidth={2.25} aria-hidden />
          Library
        </button>
        <div className="mt-2 flex items-center gap-3.5">
          {/* their SoundCloud picture; a blank surface circle holds the place while it loads or if there is none */}
          <Avatar src={avatar} size={64} />
          <div className="min-w-0">
            <h1 className="text-[26px] leading-[1.05] font-semibold tracking-[-0.03em]">
              {artist ? <a href={artist.url} target="_blank" rel="noreferrer" data-content="artist_name" className="hover:underline">{name}</a> : name}
            </h1>
            {artist && (
              <a href={artist.url} target="_blank" rel="noreferrer" className={cn(LINK, 'mt-1.5 inline-block text-[13px] font-semibold')}>Follow on Dizko</a>
            )}
          </div>
        </div>
      </header>
      {artist && <ArtistBlock artist={artist} hideName claim />}
      <section className="border-b border-toner-3 px-4 py-3">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Scanned</h2>
        <ul>
          {mixes.map((h) => (
            <li key={h.mix.url} className="flex gap-3 border-b border-toner-3 py-2.5 last:border-0">
              <Cover src={h.mix.art} size={44} />
              <div className="min-w-0">
                <button type="button" onClick={() => onOpen(h.mix.url)} className="block w-full text-left text-[15px] font-semibold hover:underline">{h.mix.title}</button>
                <p className="mt-0.5 text-[12px] text-toner-2">
                  {h.rows.filter((r) => r.selected).length} of {h.rows.length} ticked
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {profile && (
        <section className="px-4 py-3">
          <h2 className="text-[16px] font-semibold tracking-[-0.01em]">More mixes on SoundCloud</h2>
          {more === null && <p className="py-2 text-[13px] text-toner-2">Loading their uploads…</p>}
          {more !== null && !unscanned.length && <p className="py-2 text-[13px] text-toner-2">No other mixes on their SoundCloud.</p>}
          <ul>
            {unscanned.map((u) => (
              <li key={u.url} className="border-b border-toner-3 py-2.5 last:border-0">
                <div className="flex gap-3">
                  <Cover src={u.art} size={44} />
                  <p className="min-w-0 text-[15px] font-semibold">{u.title}</p>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[12px]">
                  <span className="text-toner-2">{time(u.duration)} · {new Date(u.at).getFullYear()}</span>
                  <button type="button" onClick={() => setPlaying(playing === u.url ? null : u.url)} className={cn(LINK, 'ml-auto font-semibold')}>
                    {playing === u.url ? 'Hide player' : 'Listen'}
                  </button>
                  <Button variant="outline" onClick={() => onScan(u.url)} className="h-8 border-toner-2 bg-transparent px-3.5 text-[13px] font-semibold hover:bg-surface">Scan mix</Button>
                </div>
                {playing === u.url && <Player url={u.url} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

// ---- playlists on other services

/** Export and Scan again, in one menu: the things done with a tracklist once it is found. */
function TracklistMenu({ job, onRescan }: { job: Job; onRescan?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-0.5 px-2 text-[13px]">
          Export
          <ChevronDown className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem onSelect={() => download(job, 'txt')}>Text, with links</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => download(job, 'csv')}>Spreadsheet (CSV)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => download(job, 'json')}>JSON</DropdownMenuItem>
        {onRescan && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onRescan}>Scan again</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Before listening: the whole mix, or only a stretch of it (a track near the end need not cost a full listen).
 * Times read as 45:00, 1:05:00, or plain minutes.
 */
function ListenChoice({ duration, disabled, onStart }: { duration?: number; disabled: boolean; onStart: (range?: [number, number]) => void }) {
  const [section, setSection] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const start = parseClock(from || '0');
  const end = to ? parseClock(to) : duration;
  const valid = start != null && end != null && start < end && (!duration || end <= duration + 1);
  const field = 'h-10 rounded-[0.75rem] border-toner-2 bg-transparent text-[15px] text-ink tabular-nums';
  if (!section) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={disabled} onClick={() => onStart()} className="h-10 text-[14px] font-semibold">Whole mix</Button>
        <Button variant="outline" disabled={disabled} onClick={() => setSection(true)} className="h-10 border-toner-2 bg-transparent text-[14px] font-semibold hover:bg-surface">A section</Button>
      </div>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onStart([start!, end!]);
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-[12px] font-semibold text-toner-1">
          From
          <Input autoFocus inputMode="numeric" placeholder="0:00" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
        </label>
        <label className="space-y-1 text-[12px] font-semibold text-toner-1">
          To
          <Input inputMode="numeric" placeholder={duration ? time(duration) : '1:00:00'} value={to} onChange={(e) => setTo(e.target.value)} className={field} />
        </label>
      </div>
      {(from || to) && !valid && <p className="text-[12px] text-miss">Use times inside the mix, like 45:00 or 1:05:00.</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="submit" disabled={disabled || !valid} className="h-10 text-[14px] font-semibold">Listen to this part</Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => onStart()} className="h-10 border-toner-2 bg-transparent text-[14px] font-semibold hover:bg-surface">Whole mix</Button>
      </div>
    </form>
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
  // an artist's page, by DJ key; cleared by moving to another page or opening a mix
  const [artistKey, setArtistKey] = useState<string | null>(null);
  // the settings screen, opened from the gear in the brand bar
  const [settingsOpen, setSettingsOpen] = useState(false);
  const prefs = useSettings();
  useEffect(() => {
    const show = () => setSettingsOpen(true);
    window.addEventListener('dizko-settings', show);
    return () => window.removeEventListener('dizko-settings', show);
  }, []);
  const onMixPage = !!tab && isMixPage(tab.url);
  const sameMix = !!job && !!tab && mixKey(job.mix.url) === mixKey(tab.url);
  const fromLibrary = !!job && !!opened && !sameMix && mixKey(job.mix.url) === mixKey(opened);
  const busy = job?.phase === 'identifying' || job?.phase === 'carting' || !!job?.listening;
  // the live mix can be listened to from its tab, or by URL when SoundCloud read it without one
  const canListen = !!job && !busy && (sameMix || /^https:\/\/soundcloud\.com\//.test(job.mix.url));

  // Read the page as soon as the panel opens on a mix that is not already loaded
  useEffect(() => {
    setLibrary(false);
    setArtistKey(null);
    setSettingsOpen(false);
    if (onMixPage) setOpened(null);
    if (tab && onMixPage && !sameMix && !busy) {
      send({ type: 'panel:read', tabId: tab.id }).then((r) => setError(r?.error ?? ''));
    } else if (tab && !onMixPage && !busy && /^https:\/\/soundcloud\.com\//.test(tab.url)) {
      // search, a profile, the feed: the mix the DJ is listening to is the one in SoundCloud's player
      browser.tabs.sendMessage(tab.id, { type: 'source:playing' }).then((p: { url?: string; playing: boolean } | undefined) => {
        if (p?.playing && p.url && isMixPage(p.url) && (!job || mixKey(job.mix.url) !== mixKey(p.url))) scan(p.url, true);
      }).catch(() => {});
    }
  }, [tab?.id, tab?.url]);

  // Chrome hands over a tab's audio only after the DJ invokes the extension on that tab (its toolbar icon);
  // a click inside the panel does not count. Until then the panel asks for that click and keeps trying.
  const [needsIcon, setNeedsIcon] = useState<{ tabId: number; resume: boolean } | null>(null);
  async function listen(resume = false, tabAudio = false, range?: [number, number]) {
    if (!job) return;
    // a mix read by URL (Scan mix, or what the player was playing) is heard from its own stream
    if (!sameMix || !tab) {
      setError('');
      const r = await send({ type: 'panel:identify', url: job.mix.url, resume, range });
      return setError(r?.error ?? '');
    }
    try {
      // SoundCloud is fingerprinted from its own stream, YouTube and Mixcloud from the page's player; Chrome's tab
      // capture only when a page will not share its player's audio
      // tab capture is not in the SoundCloud-only release's permissions
      if (tabAudio && !browser.tabCapture) return setError('Dizko ID could not hear this mix.');
      const streamId = tabAudio ? await browser.tabCapture.getMediaStreamId({ targetTabId: tab.id }) : undefined;
      setError('');
      setNeedsIcon(null);
      await send({ type: 'panel:identify', tabId: tab.id, streamId, resume, range });
    } catch (e) {
      const why = String(e).replace(/^Error: /, '');
      if (/not been invoked|activeTab/i.test(why)) {
        setError('');
        setNeedsIcon({ tabId: tab.id, resume });
        return;
      } else setError(`Could not listen to this tab: ${why}`);
    }
  }
  const fellBack = useRef('');
  useEffect(() => {
    if (!job || !sameMix || busy || job.error !== TAB_AUDIO_NEEDED || fellBack.current === job.mix.url) return;
    fellBack.current = job.mix.url;
    listen(!!job.progress, true);
  }, [job?.error, job?.mix.url, sameMix, busy]);
  useEffect(() => {
    if (!needsIcon) return;
    if (tab?.id !== needsIcon.tabId || !sameMix) return setNeedsIcon(null);
    const timer = setInterval(async () => {
      const streamId = await browser.tabCapture.getMediaStreamId({ targetTabId: needsIcon.tabId }).catch(() => null);
      if (!streamId) return;
      clearInterval(timer);
      setNeedsIcon(null);
      send({ type: 'panel:identify', tabId: needsIcon.tabId, streamId, resume: needsIcon.resume });
    }, 1500);
    return () => clearInterval(timer);
  }, [needsIcon, tab?.id, sameMix]);

  /** Scan a mix from an artist page without opening it: the panel moves to it while it is read and heard. */
  async function scan(url: string, auto = false) {
    setError('');
    const r = await send({ type: 'panel:scan', url, auto });
    if (r?.error) return setError(r.error);
    if (r?.url) {
      setArtistKey(null);
      setLibrary(false);
      setOpened(r.url);
    }
  }

  async function open(url: string) {
    setArtistKey(null);
    if (job && mixKey(job.mix.url) === mixKey(url)) {
      setLibrary(false);
      setOpened(url);
      return;
    }
    if ((await send({ type: 'panel:open', url }))?.ok) {
      setLibrary(false);
      setOpened(url);
    } else if (items.some((h) => mixKey(h.mix.url) === mixKey(url))) {
      // another mix is listening or carting: show this saved one read-only and leave that run alone
      setLibrary(false);
      setOpened(url);
    } else setError('Finish the current listen or cart run first.');
  }

  // A saved mix opened while another one is running: shown from the library, read-only, the run carries on
  const peek = !library && opened && job && busy && mixKey(job.mix.url) !== mixKey(opened) ? items.find((h) => mixKey(h.mix.url) === mixKey(opened)) : undefined;
  const showMix = !!job && !library && (sameMix || fromLibrary || busy);

  // Screens stack library < mix < artist: deeper arrives from the right, back from the left
  const screen = settingsOpen ? 'settings' : artistKey ? `artist:${artistKey}` : peek ? `mix:${mixKey(peek.mix.url)}` : showMix ? `mix:${mixKey(job!.mix.url)}` : 'library';
  const depth = settingsOpen ? 3 : artistKey ? 2 : showMix ? 1 : 0;
  const last = useRef({ screen, depth });
  const motion = useRef<string | undefined>(undefined);
  if (last.current.screen !== screen) {
    motion.current = depth >= last.current.depth ? 'enter-right' : 'enter-left';
    last.current = { screen, depth };
  }

  // a screen change stops any preview that was playing
  useEffect(() => stopPreview(), [screen]);

  if (settingsOpen) return <SettingsPage key="settings" motion={motion.current} onBack={() => setSettingsOpen(false)} />;

  if (artistKey) {
    const fromJob: Dj | undefined = job?.artist ? { key: artistKey, name: job.artist.name, artist: job.artist, mixes: [] } : undefined;
    const entry = djsOf(items).find((d) => d.key === artistKey) ?? fromJob;
    if (entry) return <ArtistPage key={screen} motion={motion.current} entry={entry} onBack={() => { setArtistKey(null); setLibrary(true); }} onOpen={open} onScan={scan} />;
  }

  if (!showMix) {
    return (
      <main key={screen} className={cn('flex h-full flex-col overflow-y-auto', motion.current)}>
        <h1 className="sr-only">Dizko ID library</h1>
        {job && library && (sameMix || busy) && (
          <button type="button" onClick={() => setLibrary(false)} className="flex items-center gap-2.5 border-b border-toner-3 px-4 py-2.5 text-left text-[13px] hover:bg-surface">
            {busy && <span className="size-2 shrink-0 animate-pulse rounded-full bg-acid" aria-hidden />}
            <span className="shrink-0 text-toner-2">{busy ? 'Now listening' : 'Back to'}</span>
            <span className="min-w-0 truncate font-semibold">{job.mix.title}</span>
          </button>
        )}
        {onMixPage && !library ? (
          <p className="px-4 py-5 text-[15px] text-toner-1">Reading this mix…</p>
        ) : items.length ? (
          <Library items={items} onOpen={open} onArtist={setArtistKey} onAccount={() => setSettingsOpen(true)} />
        ) : (
          // first run: say what this is, once, where the library will be
          <div className="px-4 py-6">
            <p className="text-[20px] leading-[1.2] font-semibold tracking-[-0.02em]">Open a DJ mix on SoundCloud.</p>
            <p className="mt-3 max-w-[36ch] text-[14px] leading-snug text-toner-1">Dizko ID finds every track, shows where the DJ plays next, and sends the tracks to your Beatport or Bandcamp cart or a playlist. Every mix you open is saved here.</p>
          </div>
        )}
        {error && <p className="px-4 pb-3 text-[13px] text-miss">{error}</p>}
      </main>
    );
  }

  // the live job, or a saved mix being looked at while that job runs
  const view: Job = peek ?? job!;
  const readOnly = !!peek;
  const selected = view.rows.filter((r) => r.selected);
  const unconfirmed = view.rows.filter((r) => r.track.hits < 2).length;
  const carted = view.rows.filter((r) => r.status === 'carted');
  // what each cart button would add now: ticked, not in a cart yet, and not already missing from that store
  const forBeatport = selected.filter((r) => BEATPORT_CARTABLE.includes(r.status) && !r.missingFrom?.includes('beatport')).length;
  const forBandcamp = selected.filter((r) => BANDCAMP_CARTABLE.includes(r.status) && !r.missingFrom?.includes('bandcamp')).length;
  // a peeked mix is read-only: ticks and stores wait until it is the live one
  const locked = view.phase === 'carting' || readOnly;
  const current = view.rows.find((r) => r.status === 'searching');
  const progress = Math.round((view.progress ?? 0) * 100);
  const paused = coverage(view);
  const playlistUrl = view.playlist?.beatport ? beatportPlaylistUrl(view.playlist.beatport) : undefined;

  // a SoundCloud mix opened from the library plays in the panel
  const embedded = (fromLibrary || readOnly) && /soundcloud\.com/.test(view.mix.url);
  // the DJ, when Dizko knows them (never a hosting channel such as Boiler Room)
  const dj = view.artist && !isPlatform(view.artist.name) ? view.artist : undefined;

  // each store's button adds what is left for it, then opens that store's cart once nothing is left
  const cartButtons = (forBeatport > 0 || forBandcamp > 0 || Object.keys(view.carts ?? {}).length > 0) && (
    <div className="grid grid-cols-2 gap-2">
      {(prefs.marketplace === 'bandcamp' ? (['bandcamp', 'beatport'] as const) : (['beatport', 'bandcamp'] as const)).map((store) => {
        const count = store === 'beatport' ? forBeatport : forBandcamp;
        const cart = view.carts?.[store];
        // acid marks the next step: the preferred store while it has tracks to add, else the other
        const preferred = prefs.marketplace === 'bandcamp' ? forBandcamp : forBeatport;
        const lead = count > 0 && (store === prefs.marketplace || !preferred);
        const quiet = 'border-toner-2 bg-transparent hover:bg-surface';
        if (!count && cart) {
          return (
            <Button key={store} asChild variant="outline" className={cn('h-10 text-[14px] font-semibold', quiet)}>
              <a href={cart} target="_blank" rel="noreferrer">Open {STORE_NAME[store]} cart</a>
            </Button>
          );
        }
        return (
          <Button key={store} variant={lead ? 'default' : 'outline'} disabled={!count} onClick={() => cartIn(store)} className={cn('h-10 text-[14px] font-semibold', !lead && quiet)}>
            {count ? `Add ${count} to ${STORE_NAME[store]}` : `Add to ${STORE_NAME[store]}`}
          </Button>
        );
      })}
    </div>
  );

  return (
    <main key={screen} className={cn('flex h-full flex-col overflow-y-auto', motion.current)}>
      <header data-area="mix" className="border-b border-toner-3 px-4 pt-3 pb-3.5">
        <button type="button" onClick={() => setLibrary(true)} className="-ml-1.5 flex min-h-9 items-center gap-1 pr-2 text-[16px] font-semibold hover:underline">
          <ChevronLeft className="size-6" strokeWidth={2.25} aria-hidden />
          Library
        </button>
        {/* the DJ leads, with where they play next; the mix follows, its title linking to it */}
        {dj ? (
          <>
            <h1 className="mt-2 text-[26px] leading-[1.05] font-semibold tracking-[-0.03em]">
              <button type="button" onClick={() => setArtistKey(norm(dj.name))} className="text-left hover:underline">{dj.name}</button>
            </h1>
            <ArtistBlock artist={dj} hideName bare />
          </>
        ) : (
          <h1 className="mt-2 line-clamp-3 text-[26px] leading-[1.05] font-semibold tracking-[-0.03em]">
            <a href={view.mix.url} target="_blank" rel="noreferrer" className="hover:underline">{view.mix.title}</a>
          </h1>
        )}
      </header>

      {busy && onMixPage && !sameMix && tab && (
        <button
          type="button"
          onClick={() => send({ type: 'panel:switch', tabId: tab.id })}
          className="flex items-center justify-between gap-3 border-b border-toner-3 bg-ink px-4 py-2.5 text-left text-[13px] font-semibold text-paper"
        >
          <span>Another mix is open in this tab</span>
          <span className="shrink-0 underline decoration-1 underline-offset-2">Switch</span>
        </button>
      )}

      {(dj || embedded) && (
        <section data-area="mix" className="border-b border-toner-3 px-4 py-3">
          {dj && <a href={view.mix.url} target="_blank" rel="noreferrer" className="line-clamp-3 text-[17px] leading-snug font-semibold tracking-[-0.02em] hover:underline">{view.mix.title}</a>}
          {embedded && <Player url={view.mix.url} />}
        </section>
      )}

      <section data-area="cart" className="space-y-2.5 border-b border-toner-3 px-4 py-3 empty:hidden">
        {readOnly && job && (
          <div className="space-y-1.5 text-[13px]">
            <p className="leading-snug text-toner-1">
              <span className="font-semibold text-ink">{job.mix.title}</span> is still {job.phase === 'carting' ? 'filling your cart' : 'listening'}. This mix opens fully once that is done.
            </p>
            <button type="button" onClick={() => setOpened(job.mix.url)} className="font-semibold underline decoration-1 underline-offset-2">Back to it</button>
          </div>
        )}
        {view.phase === 'reading' && !view.rows.length && (
          <>
            <p className="text-[14px] leading-snug">
              {needsIcon ? 'Click the Dizko ID icon in your toolbar to start listening.' : error ? 'Listening could not start.' : 'No tracklist in the description.'}
              {needsIcon ? '' : view.method === 'seek' ? ' This tab stays quiet while it jumps through.' : view.method === 'live' ? ' Press play and leave it running.' : ''}
            </p>
            {!needsIcon && <ListenChoice duration={view.mix.duration} disabled={!canListen || readOnly} onStart={(range) => listen(false, false, range)} />}
          </>
        )}
        {(view.phase === 'identifying' || (view.phase === 'carting' && view.listening)) && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-semibold">
                {view.cooling ? 'Waiting for Shazam' : 'Listening'}
                {view.range && <span className="font-normal text-toner-1">{`  ${time(view.range[0])} to ${time(view.range[1])}`}</span>}
              </span>
              <span className="text-[18px] font-semibold tabular-nums">{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5 bg-toner-3 [&>*]:bg-fill" />
            <Button variant="outline" size="sm" onClick={() => send({ type: 'panel:stop-listening' })} className="mt-1 h-8 border-toner-2 bg-transparent px-4 text-[13px] font-semibold hover:bg-surface">Stop listening</Button>
            {view.following && playlistUrl && (
              <p className="text-[13px] text-toner-1">
                New finds go straight into your <a href={playlistUrl} target="_blank" rel="noreferrer" className="font-semibold text-ink underline decoration-1">Beatport playlist</a>.
              </p>
            )}
          </div>
        )}
        {view.phase === 'review' && !view.rows.length && (
          <>
            {/* stopped before the first find: carry on from where it stopped rather than start over */}
            {(view.progress ?? 1) < 0.98 && view.probes?.length ? (
              <Button onClick={() => listen(true)} disabled={!canListen || readOnly} className="h-10 w-full text-[15px] font-semibold">Keep listening</Button>
            ) : (
              <>
                {!view.error && <p className="text-[14px] leading-snug">No tracks were recognized in this mix.</p>}
                {!needsIcon && <Button onClick={() => listen(false, view.error === TAB_AUDIO_NEEDED)} disabled={!canListen || readOnly} className="h-10 w-full text-[15px] font-semibold">Try again</Button>}
              </>
            )}
          </>
        )}
        {view.phase === 'carting' ? (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-semibold">
                {view.waitingFor === 'beatport-login' ? 'Log in to Beatport in the new tab' : view.waitingFor === 'store-check' ? 'The store wants to check you are human' : 'Adding to cart'}
              </span>
              <button type="button" onClick={() => send({ type: 'panel:stop' })} className="text-[12px] text-toner-2 hover:text-ink hover:underline">Stop</button>
            </div>
            <p className="truncate text-[13px] text-toner-1">
              {view.waitingFor === 'beatport-login'
                ? 'Beatport keeps carts in your account. It carries on by itself once you are logged in.'
                : view.waitingFor === 'store-check'
                  ? 'Answer it in the tab that just opened. It carries on by itself afterwards.'
                  : current
                    ? `Now: ${current.track.artist}, ${current.track.title}`
                    : 'Filling the cart…'}
            </p>
          </div>
        ) : (
          view.rows.length > 0 && (
            <>
              {!carted.length && playlistUrl && view.rows.some((r) => r.status === 'in-playlist') && (
                <p className="text-[13px] text-toner-1">
                  In your <a href={playlistUrl} target="_blank" rel="noreferrer" className="font-semibold text-ink underline decoration-1">Beatport playlist</a>; its Buy All puts them in the cart.
                </p>
              )}
              {view.phase === 'review' && view.method === 'stream' && view.range && (view.progress ?? 0) >= 0.98 && view.mix.duration && canListen && !readOnly && (
                // a section was heard: the rest can follow, keeping everything found so far
                <p className="flex items-baseline justify-between text-[13px]">
                  <span className="text-toner-1">{`Heard ${time(view.range[0])} to ${time(view.range[1])}`}</span>
                  <button type="button" onClick={() => listen(true, false, [0, view.mix.duration!])} className="font-semibold underline decoration-1 underline-offset-2">Listen to the whole mix</button>
                </p>
              )}
              {view.phase === 'review' && (view.method === 'stream' || view.method === 'seek') && paused != null && paused < (view.progress != null ? 0.98 : 0.85) && (
                // A listen that stopped part way (a stop, a switch, an extension reload): the bar stays, in grey
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[14px] font-semibold">Listening paused</span>
                    <span className="flex items-baseline gap-3">
                      {canListen && !readOnly ? (
                        <button type="button" onClick={() => listen(true)} className="text-[13px] font-semibold underline decoration-1 underline-offset-2">Keep listening</button>
                      ) : (
                        <a href={view.mix.url} target="_blank" rel="noreferrer" className="text-[13px] font-semibold underline decoration-1 underline-offset-2">Open the mix to finish</a>
                      )}
                      <span className="text-[18px] font-semibold tabular-nums text-toner-1">{Math.round(paused * 100)}%</span>
                    </span>
                  </div>
                  <Progress value={paused * 100} className="h-1.5 bg-toner-3 [&>*]:bg-toner-1" />
                </div>
              )}
              {!readOnly && cartButtons}
            </>
          )
        )}
        {(error || (view.error && view.error !== TAB_AUDIO_NEEDED)) && <p className="text-[13px] text-miss">{error || view.error}</p>}
        {needsIcon && view.phase !== 'reading' && (
          <p className="text-[14px] leading-snug">Click the Dizko ID icon in your toolbar to start listening.</p>
        )}
      </section>

      {view.rows.length > 0 && (
        <div className="flex items-center justify-between border-b border-toner-3 px-4 py-1.5 text-[13px]">
          <span className="text-toner-2">{selected.length} of {view.rows.length} ticked</span>
          <span className="-mr-2 flex items-center">
            <TracklistMenu
              job={view}
              onRescan={sameMix && !busy ? () => send({ type: 'panel:reset' }).then(() => tab && send({ type: 'panel:read', tabId: tab.id })) : undefined}
            />
            {selected.length === view.rows.length ? (
              <Button variant="ghost" size="sm" disabled={locked} onClick={() => send({ type: 'panel:select', all: false })} className="h-8 px-2 text-[13px]">Untick all</Button>
            ) : (
              <Button variant="ghost" size="sm" disabled={locked} onClick={() => send({ type: 'panel:select', all: true })} className="h-8 px-2 text-[13px]">Tick all</Button>
            )}
          </span>
        </div>
      )}

      <div data-area="tracklist" className="px-4 pb-24">
        {/* Billing: confirmed tracks set large, single-hit IDs on the smaller "plus" line */}
        <ol>
          {view.rows.map((row, i) => row.track.hits >= 2 && <TrackRow key={trackKey(row)} row={row} index={i} locked={locked} />)}
        </ol>
        {unconfirmed > 0 && (
          <>
            <h2 className="mt-5 border-b border-toner-3 pb-1.5 text-[16px] font-semibold tracking-[-0.01em]">Plus {unconfirmed} unconfirmed</h2>
            <p className="pt-1.5 text-[12px] text-toner-2">Heard only once, so they start unticked.</p>
            <ol>
              {view.rows.map((row, i) => row.track.hits < 2 && <TrackRow key={trackKey(row)} row={row} index={i} locked={locked} />)}
            </ol>
          </>
        )}
        {view.phase === 'identifying' && !view.rows.length && <p className="py-6 text-[14px] text-toner-2">Tracks appear here as they are recognized.</p>}
      </div>

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

/** BPM, key and length from the Beatport release, the numbers a DJ plans a set with. */
function TrackFacts({ offer }: { offer?: Row['offer'] }) {
  if (!offer || (!offer.bpm && !offer.key && !offer.length)) return null;
  // Camelot first (how most DJs mix in key), then the short musical key: "4A (Fm)"
  const short = offer.key?.name.replace(/ Minor$/, 'm').replace(/ Major$/, '').replace(/ /g, '');
  const key = offer.key && `${offer.key.camelot}${short ? ` (${short})` : ''}`;
  const facts = [offer.bpm && `${Math.round(offer.bpm)} BPM`, key, offer.length && time(offer.length)].filter(Boolean);
  return (
    <p className="mt-0.5 text-[12px] font-medium text-toner-1 tabular-nums" title={offer.key?.name || undefined}>
      {facts.join('  ·  ')}
      {offer.version && offer.version !== 'Original Mix' ? <span className="text-toner-2">{`  ·  ${offer.version}`}</span> : null}
    </p>
  );
}

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
      <div className="flex flex-col items-start gap-1.5">
        <span className="pt-0.5 text-[12px] font-semibold text-toner-2">{time(row.track.at)}</span>
        <PreviewButton row={row} />
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="min-w-0 cursor-pointer truncate text-[13px] font-semibold text-toner-1">{row.track.artist}</label>
          {status && <span className={cn('shrink-0 text-[12px] font-bold', miss ? 'text-miss' : row.status === 'carted' || row.status === 'in-playlist' ? '' : 'text-toner-2')}>{status}</span>}
        </div>
        <label htmlFor={id} className={cn('block cursor-pointer leading-[1.08]', confirmed ? 'text-[19px] font-semibold tracking-[-0.02em]' : 'text-[15px] font-medium')}>
          <span className={row.status === 'carted' ? 'highlighter' : undefined}>{row.track.title}</span>
        </label>
        <TrackFacts offer={row.offer} />
        {row.status === 'version-missing' && row.alternatives?.length ? (
          <p className="mt-0.5 text-[12px] text-toner-1">
            Available:{' '}
            {/* each other version links to itself, one link per version */}
            {[...new Map(row.alternatives.map((a) => [a.version || 'Original', a])).entries()].map(([version, a], i) => (
              <span key={a.url}>
                {i > 0 && ', '}
                <a href={a.url} target="_blank" rel="noreferrer" className={LINK}>{version}</a>
              </span>
            ))}
          </p>
        ) : null}
        <StoreLinks row={row} />
      </div>
    </li>
  );
}
