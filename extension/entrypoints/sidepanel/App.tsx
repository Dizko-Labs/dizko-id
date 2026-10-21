import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { fileName, toCsv, toJson, toText } from '@/lib/export';
import { links } from '@/lib/links';
import type { PanelRequest } from '@/lib/messages';
import type { Job, Row, Store } from '@/lib/types';
import { cn } from '@/lib/utils';

const MIX_SITES = /^https:\/\/(www\.youtube\.com\/watch|soundcloud\.com\/[^/]+\/[^/]+|www\.mixcloud\.com\/[^/]+\/[^/]+)/;

const send = (msg: PanelRequest & { streamId?: string }) => browser.runtime.sendMessage(msg);

const STORE_PLANS: { id: string; label: string; short: string; stores: Store[] }[] = [
  { id: 'both', label: 'Beatport, then Bandcamp', short: 'Both stores', stores: ['beatport', 'bandcamp'] },
  { id: 'beatport', label: 'Beatport only', short: 'Beatport', stores: ['beatport'] },
  { id: 'bandcamp', label: 'Bandcamp only', short: 'Bandcamp', stores: ['bandcamp'] },
];

function clock(s: number | null | undefined) {
  if (s == null) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}

function useJob() {
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => {
    browser.storage.session.get('job').then((r) => setJob((r.job as Job) ?? null));
    const onChange = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'session' && 'job' in changes) setJob((changes.job!.newValue as Job) ?? null);
    };
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);
  return job;
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

export default function App() {
  const job = useJob();
  const tab = useActiveTab();
  const [plan, setPlan] = useState('both');
  const [error, setError] = useState('');
  const onMixPage = !!tab && MIX_SITES.test(tab.url);
  const sameMix = !!job && !!tab && job.mix.url.split('&')[0] === tab.url.split('&')[0];

  // Read the page as soon as the panel opens on a mix that is not already loaded
  useEffect(() => {
    if (tab && onMixPage && !sameMix && job?.phase !== 'identifying' && job?.phase !== 'carting') {
      send({ type: 'panel:read', tabId: tab.id }).then((r) => setError(r?.error ?? ''));
    }
  }, [tab?.id, tab?.url]);

  async function listen() {
    if (!tab) return;
    try {
      // SoundCloud is fingerprinted from its own stream; other sites need the tab's audio
      const streamId = job?.method === 'stream' ? undefined : await browser.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      setError('');
      await send({ type: 'panel:identify', tabId: tab.id, streamId });
    } catch (e) {
      setError(`Could not listen to this tab: ${String(e).replace(/^Error: /, '')}`);
    }
  }

  if (!job || (!sameMix && job.phase !== 'identifying' && job.phase !== 'carting')) {
    return (
      <main className="flex min-h-full flex-col">
        <header className="bg-pink px-4 pt-4 pb-3.5 text-on-pink">
          <h1 className="text-[34px] leading-[0.95] font-black [font-stretch:62%]">Mix to Cart</h1>
        </header>
        <p className="px-4 py-5 text-[15px] leading-snug text-toner-1">
          {onMixPage ? 'Reading this mix…' : 'Open a DJ mix on YouTube, SoundCloud or Mixcloud, and its tracklist appears here.'}
        </p>
        {error && <p className="px-4 text-[13px] text-miss">{error}</p>}
      </main>
    );
  }

  const selected = job.rows.filter((r) => r.selected);
  const unconfirmed = job.rows.filter((r) => r.track.hits < 2).length;
  const carted = job.rows.filter((r) => r.status === 'carted');
  const busy = job.phase === 'identifying' || job.phase === 'carting';
  const stores = STORE_PLANS.find((p) => p.id === plan)!.stores;
  const current = job.rows.findIndex((r) => r.status === 'searching');
  const source = /youtube\.com/.test(job.mix.url) ? 'YouTube' : /soundcloud\.com/.test(job.mix.url) ? 'SoundCloud' : /mixcloud\.com/.test(job.mix.url) ? 'Mixcloud' : '';

  return (
    <main className="flex h-full flex-col">
      <header className="bg-pink px-4 pt-4 pb-3.5 text-on-pink">
        <h1 className="line-clamp-3 text-[34px] leading-[0.95] font-black tracking-[-0.01em] [font-stretch:62%]">{job.mix.title}</h1>
        <p className="mt-2 flex flex-wrap gap-x-3.5 text-[13px] font-semibold">
          {source && <span>{source}</span>}
          {job.mix.duration ? <span>{clock(job.mix.duration)}</span> : null}
          {job.rows.length > 0 && <span>{job.rows.length} tracks</span>}
          <span>{job.tracklistFound ? 'From the description' : job.rows.length ? 'Identified by listening' : ''}</span>
        </p>
      </header>

      <section className="border-b-2 border-ink px-4 py-3">
        {job.phase === 'reading' && !job.rows.length && (
          <div className="space-y-2.5">
            <p className="text-[14px] leading-snug">No tracklist in the description. Listen to the mix to identify its tracks{job.method === 'stream' ? '. This takes a couple of minutes.' : job.method === 'seek' ? '; this tab stays quiet while it jumps through.' : '; press play and leave it running.'}</p>
            <Button onClick={listen} className="h-10 w-full text-[15px] font-extrabold">Identify tracks</Button>
          </div>
        )}
        {job.phase === 'identifying' && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-semibold">Listening</span>
              <span className="text-[20px] font-black [font-stretch:75%]">{Math.round((job.progress ?? 0) * 100)}%</span>
            </div>
            <Progress value={(job.progress ?? 0) * 100} className="h-1.5 bg-toner-3 [&>*]:bg-ink" />
            <Button variant="outline" onClick={() => send({ type: 'panel:stop' })} className="h-9 w-full border-ink bg-transparent">Stop and use what was found</Button>
          </div>
        )}
        {job.phase === 'review' && !job.rows.length && (
          <div className="space-y-2.5">
            {!job.error && <p className="text-[14px] leading-snug">No tracks were recognized in this mix.</p>}
            <Button onClick={listen} className="h-10 w-full text-[15px] font-extrabold">Try again</Button>
          </div>
        )}
        {job.phase === 'review' && job.rows.length > 0 && (
          <div className="flex gap-2">
            <Button disabled={!selected.length} onClick={() => send({ type: 'panel:cart', stores })} className="h-10 flex-1 text-[15px] font-extrabold">
              Add {selected.length} to cart
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 max-w-[48%] gap-1 border-ink bg-transparent px-3 text-[13px] font-semibold" aria-label="Choose stores">
                  <span className="truncate">{STORE_PLANS.find((p) => p.id === plan)!.short}</span>
                  <ChevronDown className="size-4 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup value={plan} onValueChange={setPlan}>
                  {STORE_PLANS.map((p) => <DropdownMenuRadioItem key={p.id} value={p.id}>{p.label}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {job.phase === 'carting' && (
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] font-semibold">{job.waitingFor === 'beatport-login' ? 'Log in to Beatport in the new tab' : job.waitingFor === 'store-check' ? 'The store wants to check you are human' : 'Adding to cart'}</span>
              <span className="text-[20px] font-black [font-stretch:75%]">{carted.length} of {selected.length}</span>
            </div>
            {job.waitingFor === 'beatport-login' ? (
              <p className="text-[13px] text-toner-1">Beatport keeps carts in your account. Carting carries on by itself once you are logged in.</p>
            ) : job.waitingFor === 'store-check' ? (
              <p className="text-[13px] text-toner-1">Answer it in the tab that just opened. Carting carries on by itself afterwards.</p>
            ) : current >= 0 ? (
              <p className="truncate text-[13px] text-toner-1">Now: <span className="font-semibold text-ink">{job.rows[current]!.track.artist}, {job.rows[current]!.track.title}</span></p>
            ) : null}
            <Button variant="outline" onClick={() => send({ type: 'panel:stop' })} className="mt-1 h-9 w-full border-ink bg-transparent">Stop</Button>
          </div>
        )}
        {job.phase === 'done' && (
          <div className="space-y-2.5">
            <p className="text-[14px] font-semibold">
              {carted.length ? `${carted.length} in your cart. Review it and buy what you want.` : 'Nothing was added. The links below search each store.'}
            </p>
            <div className="flex gap-2">
              {Object.entries(job.carts ?? {}).map(([s, url]) => (
                <Button key={s} asChild className="h-10 flex-1 text-[15px] font-extrabold">
                  <a href={url} target="_blank" rel="noreferrer">Open {s === 'beatport' ? 'Beatport' : 'Bandcamp'} cart</a>
                </Button>
              ))}
            </div>
          </div>
        )}
        {(error || job.error) && <p className="mt-2 text-[13px] text-miss">{error || job.error}</p>}
      </section>

      {job.rows.length > 0 && (
        <div className="flex items-center justify-between border-b border-toner-3 px-4 py-1.5 text-[13px]">
          <span className="text-toner-2">{selected.length} of {job.rows.length} selected</span>
          <span className="flex">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => send({ type: 'panel:select', all: true })} className="h-8 px-2 text-[13px]">Select all</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => send({ type: 'panel:select', all: false })} className="h-8 px-2 text-[13px]">Deselect all</Button>
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Billed like a flyer: confirmed tracks are the lineup, single-hit IDs go on the "plus" line */}
        <ol>
          {job.rows.map((row, i) => row.track.hits >= 2 && <TrackRow key={`${row.track.artist}|${row.track.title}`} row={row} index={i} locked={busy} />)}
        </ol>
        {unconfirmed > 0 && (
          <>
            <h2 className="mt-5 border-b-2 border-ink pb-1.5 text-[19px] font-black [font-stretch:75%]">Plus {unconfirmed} unconfirmed</h2>
            <p className="pt-1.5 text-[12px] text-toner-2">Each heard in one clip only. Often a sample or a blend, so they start unticked.</p>
            <ol>
              {job.rows.map((row, i) => row.track.hits < 2 && <TrackRow key={`${row.track.artist}|${row.track.title}`} row={row} index={i} locked={busy} />)}
            </ol>
          </>
        )}
        {job.phase === 'identifying' && !job.rows.length && <p className="py-6 text-[14px] text-toner-2">Tracks appear here as they are recognized.</p>}
      </div>

      {job.rows.length > 0 && (
        <footer className="flex items-center gap-2 border-t-2 border-ink px-4 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 gap-1 border-ink bg-transparent text-[14px] font-semibold">Export tracklist<ChevronDown className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => download(job, 'txt')}>Text, with links</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => download(job, 'csv')}>Spreadsheet (CSV)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => download(job, 'json')}>JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!busy && (
            <Button variant="ghost" className="ml-auto h-9 text-[13px] text-toner-2" onClick={() => send({ type: 'panel:reset' })}>Start over</Button>
          )}
        </footer>
      )}
    </main>
  );
}

const STATUS_TEXT: Partial<Record<Row['status'], string>> = {
  searching: 'Searching',
  'version-missing': 'Version not found',
  'album-only': 'Album only',
  'not-found': 'Not found',
  'login-needed': 'Needs login',
  failed: 'Could not add',
};

function TrackRow({ row, index, locked }: { row: Row; index: number; locked: boolean }) {
  const confirmed = row.track.hits >= 2;
  const l = links(row);
  const status = row.status === 'carted' ? row.offer?.price?.display ?? 'In cart' : row.status === 'queued' ? '' : STATUS_TEXT[row.status];
  const miss = ['version-missing', 'album-only', 'not-found', 'failed', 'login-needed'].includes(row.status);
  const id = `track-${index}`;
  return (
    // Status shares the artist line so the track name, notes and links get the full width
    <li className="grid grid-cols-[22px_42px_minmax(0,1fr)] gap-x-2 border-b border-toner-3 py-2.5">
      <Checkbox id={id} checked={row.selected} disabled={locked} onCheckedChange={() => send({ type: 'panel:toggle', index })} className="mt-1 border-ink data-[state=checked]:bg-ink" />
      <span className="pt-0.5 text-[12px] font-semibold text-toner-2">{clock(row.track.at)}</span>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="min-w-0 cursor-pointer truncate text-[13px] font-semibold text-toner-1">{row.track.artist}</label>
          {status && <span className={cn('shrink-0 text-[13px] font-bold', miss ? 'text-miss' : row.status === 'searching' ? 'text-toner-2' : '')}>{status}</span>}
        </div>
        <label htmlFor={id} className={cn('block cursor-pointer leading-[1.08]', confirmed ? 'text-[23px] font-black [font-stretch:64%]' : 'text-[15px] font-semibold [font-stretch:90%]')}>
          <span className={row.status === 'carted' ? 'highlighter' : undefined}>{row.track.title}</span>
        </label>
        {row.status === 'version-missing' && row.alternatives?.length ? (
          <p className="mt-0.5 text-[12px] text-toner-1">Available: {[...new Set(row.alternatives.map((a) => a.version || 'Original'))].join(', ')}</p>
        ) : null}
        <p className="mt-1 flex flex-wrap gap-x-3 text-[12px] font-medium">
          <a href={l.beatport} target="_blank" rel="noreferrer" className="underline decoration-toner-3 hover:decoration-ink">Beatport</a>
          <a href={l.bandcamp} target="_blank" rel="noreferrer" className="underline decoration-toner-3 hover:decoration-ink">Bandcamp</a>
          <a href={l.spotify} target="_blank" rel="noreferrer" className="underline decoration-toner-3 hover:decoration-ink">Spotify</a>
          <a href={l.youtube} target="_blank" rel="noreferrer" className="underline decoration-toner-3 hover:decoration-ink">YouTube</a>
        </p>
      </div>
    </li>
  );
}
