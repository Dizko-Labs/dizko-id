import { ChevronLeft } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DEFAULTS, setSetting, type Settings as S } from '@/lib/settings';
import { UsageSetting } from './Consent';
import { DizkoLinkBar } from './DizkoLinkBar';
import { useStored } from './useStored';

/** The DJ's settings; `ready` is false until they are read, so nothing acts on the defaults by mistake. */
export function useSettings(): S & { ready: boolean } {
  const saved = useStored<Partial<S>, null>('local', 'settings', {}, null);
  return { ...DEFAULTS, ...saved, ready: saved !== null };
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
        <div className="mt-2 divide-y divide-toner-3">
          <Choice label="Marketplace" field="marketplace" value={s.marketplace} options={[{ value: 'beatport', label: 'Beatport' }, { value: 'bandcamp', label: 'Bandcamp' }]} />
          <Choice label="Track previews" field="preview" value={s.preview} options={[{ value: 'beatport', label: 'Beatport' }, { value: 'apple', label: 'Apple' }, { value: 'off', label: 'Off' }]} />
          <Choice label="Appearance" field="theme" value={s.theme} options={[{ value: 'system', label: 'System' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
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
        <p>
          <a href="https://build.dizko.app" target="_blank" rel="noreferrer" className="font-semibold text-ink underline decoration-1 underline-offset-2">Claim your page on Dizko</a>
        </p>
        <p className="mt-1.5">
          <a href="https://www.instagram.com/dizko.world/" target="_blank" rel="noreferrer" data-content="instagram" className="font-semibold text-ink underline decoration-1 underline-offset-2">Follow Dizko on Instagram</a>
        </p>
      </section>
    </main>
  );
}
