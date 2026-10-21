import { useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DEFAULTS, setSetting, type Settings as S } from '@/lib/settings';
import { UsageSetting } from './Consent';
import { DizkoLinkBar } from './DizkoLinkBar';

/** The DJ's settings; `ready` is false until they are read, so nothing acts on the defaults by mistake. */
export function useSettings(): S & { ready: boolean } {
  const [s, setS] = useState<S & { ready: boolean }>({ ...DEFAULTS, ready: false });
  useEffect(() => {
    const load = () => browser.storage.local.get('settings').then((r) => setS({ ...DEFAULTS, ...((r.settings as Partial<S>) ?? {}), ready: true }));
    load();
    const onChange = (changes: Record<string, unknown>, area: string) => area === 'local' && 'settings' in changes && load();
    browser.storage.onChanged.addListener(onChange);
    return () => browser.storage.onChanged.removeListener(onChange);
  }, []);
  return s;
}

const ITEM = 'h-9 flex-1 rounded-full border border-toner-3 px-3 text-[13px] font-semibold text-toner-1 data-[state=on]:border-ink data-[state=on]:bg-ink data-[state=on]:text-paper';

function Choice<K extends keyof S>({ label, hint, field, value, options }: { label: string; hint?: string; field: K; value: S[K]; options: { value: string; label: string }[] }) {
  return (
    <div className="py-3.5">
      <p className="text-[14px] font-semibold">{label}</p>
      {hint && <p className="mt-0.5 text-[12px] leading-snug text-toner-2">{hint}</p>}
      <ToggleGroup
        type="single"
        value={String(value)}
        onValueChange={(v) => v && setSetting(field, v as S[K])}
        aria-label={label}
        className="mt-2.5 flex w-full gap-2"
      >
        {options.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className={ITEM}>{o.label}</ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

/** Defaults, the Dizko account, usage sharing and what Dizko ID is, out of the library's way. */
export function SettingsPage({ onBack, motion }: { onBack: () => void; motion?: string }) {
  const s = useSettings();
  return (
    <main className={`flex h-full flex-col overflow-y-auto ${motion ?? ''}`}>
      <header className="px-4 pt-3 pb-2">
        <button type="button" onClick={onBack} className="-ml-1.5 flex min-h-9 items-center gap-1 pr-2 text-[16px] font-semibold hover:underline">
          <ChevronLeft className="size-6" strokeWidth={2.25} aria-hidden />
          Back
        </button>
        <h1 className="mt-2 text-[26px] leading-[1.05] font-semibold tracking-[-0.03em]">Settings</h1>
      </header>

      <section className="px-4 pb-2">
        <h2 className="mt-4 text-[12px] font-semibold text-toner-2">Defaults</h2>
        <div className="divide-y divide-toner-3">
          <Choice label="Marketplace" hint="The store your Purchase button leads with." field="marketplace" value={s.marketplace} options={[{ value: 'beatport', label: 'Beatport' }, { value: 'bandcamp', label: 'Bandcamp' }]} />
          <Choice label="Track previews" hint="Beatport plays its own clip of the exact release; Apple plays a 30 second preview. The other is tried when the first has none." field="preview" value={s.preview} options={[{ value: 'beatport', label: 'Beatport' }, { value: 'apple', label: 'Apple' }, { value: 'off', label: 'Off' }]} />
          <Choice label="Appearance" field="theme" value={s.theme} options={[{ value: 'system', label: 'System' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
          <label className="flex items-center justify-between gap-4 py-3.5">
            <span>
              <span className="block text-[14px] font-semibold">Start listening by itself</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-toner-2">When a mix has no written tracklist, identify it as soon as it opens.</span>
            </span>
            <Switch checked={s.autoListen} onCheckedChange={(v) => setSetting('autoListen', v)} className="data-[state=checked]:bg-acid data-[state=unchecked]:bg-toner-3" />
          </label>
        </div>
      </section>

      <section className="mt-2">
        <h2 className="px-4 text-[12px] font-semibold text-toner-2">Dizko account</h2>
        <DizkoLinkBar />
      </section>

      <section className="px-4 pt-4">
        <h2 className="text-[12px] font-semibold text-toner-2">Usage</h2>
        <div className="-mx-4"><UsageSetting /></div>
      </section>

      <section data-area="claim" className="mt-auto border-t border-toner-3 px-4 py-5 text-[13px] text-toner-1">
        <p className="max-w-[36ch] leading-snug">
          Dizko ID finds every track in a DJ mix, shows where the DJ plays next, and sends the tracks to your Beatport or Bandcamp cart or a playlist.
        </p>
        <p className="mt-3">
          Are you a DJ?{' '}
          <a href="https://build.dizko.app" target="_blank" rel="noreferrer" className="font-semibold text-ink underline decoration-1 underline-offset-2">Claim your page on Dizko</a>
        </p>
        <p className="mt-1.5">
          <a href="https://www.instagram.com/dizko.world/" target="_blank" rel="noreferrer" data-content="instagram" className="font-semibold text-ink underline decoration-1 underline-offset-2">Follow Dizko on Instagram</a>
        </p>
      </section>
    </main>
  );
}
