import { DizkoMark } from '@/components/DizkoMark';

/** Dizko ID on every screen: the mark opens dizko.app. */
export function BrandBar() {
  return (
    <div data-area="brand" className="flex shrink-0 items-center gap-2.5 border-b border-toner-3 bg-surface px-4 py-3">
      <a href="https://www.dizko.app" target="_blank" rel="noreferrer" data-content="dizko_logo" aria-label="Dizko" className="rounded-[4px]">
        <DizkoMark className="h-[20px] w-auto text-ink" />
      </a>
      <span className="text-[18px] leading-none font-semibold tracking-[-0.02em]">Dizko ID</span>
    </div>
  );
}
