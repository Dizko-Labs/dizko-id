import { useSyncExternalStore } from 'react';
import { Pause, Play } from 'lucide-react';
import { previewSources } from '@/lib/preview';
import { settings } from '@/lib/settings';
import { trackKey, type Row } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useSettings } from './Settings';

/** One preview plays at a time across the whole panel; starting another stops the last. */
type State = { key: string | null; status: 'idle' | 'loading' | 'playing' | 'none' };
let state: State = { key: null, status: 'idle' };
const listeners = new Set<() => void>();
const audio = new Audio();
audio.preload = 'none';
const set = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
};
audio.addEventListener('ended', () => set({ key: state.key, status: 'idle' }));
audio.addEventListener('pause', () => state.status === 'playing' && set({ key: state.key, status: 'idle' }));

async function toggle(row: Row) {
  const key = trackKey(row);
  if (state.key === key && state.status === 'playing') return audio.pause();
  audio.pause();
  set({ key, status: 'loading' });
  const s = await settings();
  if (s.preview === 'off') return set({ key, status: 'none' });
  for (const source of previewSources(row, s.preview)) {
    const url = await source().catch(() => undefined);
    if (state.key !== key) return; // another track was pressed meanwhile
    if (!url) continue;
    audio.src = url;
    try {
      await audio.play();
      if (state.key === key) set({ key, status: 'playing' });
      return;
    } catch (e) {
      // pressing another track (or leaving the screen) aborts this play; a sample that will not load tries the next source
      if (state.key !== key || (e as DOMException)?.name === 'AbortError') return;
    }
  }
  set({ key, status: 'none' });
}

/** Stop whatever is previewing, e.g. when the panel changes screen. */
export const stopPreview = () => {
  audio.pause();
  // also cancels one still loading, so it does not start on the next screen
  if (state.key) set({ key: null, status: 'idle' });
};

export function PreviewButton({ row }: { row: Row }) {
  const s = useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state);
  const { preview } = useSettings();
  if (preview === 'off') return null;
  const mine = s.key === trackKey(row);
  const playing = mine && s.status === 'playing';
  const missing = mine && s.status === 'none';
  const label = playing ? `Pause ${row.track.title}` : missing ? 'No preview found' : `Preview ${row.track.title}`;
  return (
    <button
      type="button"
      onClick={() => toggle(row)}
      aria-label={label}
      title={missing ? 'No preview found for this track' : undefined}
      className={cn(
        'flex size-7 items-center justify-center rounded-full border transition-colors',
        playing ? 'border-acid bg-acid text-on-acid' : 'border-toner-3 text-ink hover:border-toner-1',
        missing && 'opacity-40',
        mine && s.status === 'loading' && 'animate-pulse',
      )}
    >
      {playing ? <Pause className="size-3.5" fill="currentColor" aria-hidden /> : <Play className="ml-0.5 size-3.5" fill="currentColor" aria-hidden />}
    </button>
  );
}
