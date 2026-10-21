import { createRoot } from 'react-dom/client';
import App from './App';
import { BrandBar } from './BrandBar';
import { ConsentBar } from './Consent';
import { hostOf, track } from '@/lib/analytics';
import { utm } from '@/lib/utm';
import './style.css';

/**
 * Every link out of the panel is tagged as it is clicked: the campaign is the panel area it sits in (the nearest
 * data-area), the content is the link's own label. Middle clicks count too. This is the one place outbound
 * clicks pass through.
 */
const KNOWN_LABELS = /^(dizko_logo|instagram|artist_name|follow on dizko|beatport|bandcamp|spotify|youtube|soundcloud|mixcloud|more on dizko|claim this page|claim your page on dizko|open beatport|open bandcamp|beatport playlist|open the mix to finish|.*(spotify|soundcloud|beatport) playlist)$/i;

function tagOutbound(e: MouseEvent) {
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || !/^https?:/.test(a.href) || a.dataset.tagged === a.href) return;
  const area = (a.closest('[data-area]') as HTMLElement | null)?.dataset.area ?? 'panel';
  const label = a.dataset.content ?? a.textContent?.trim();
  // only fixed control names go to analytics; anything else (a party, a mix title) is just 'other'
  const control = label && KNOWN_LABELS.test(label) ? label.toLowerCase() : 'other';
  track('link_click', { area, label: control, destination: hostOf(a.href) });
  a.href = utm(a.href, area, label);
  a.dataset.tagged = a.href;
}
document.addEventListener('click', tagOutbound, true);
document.addEventListener('auxclick', tagOutbound, true);

createRoot(document.getElementById('root')!).render(
  <div className="flex h-full flex-col">
    <BrandBar />
    {/* the brand bar stays; each screen scrolls as one beneath it */}
    <div className="min-h-0 flex-1 overflow-hidden">
      <App />
    </div>
    <ConsentBar />
  </div>,
);
