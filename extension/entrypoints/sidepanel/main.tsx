import { createRoot } from 'react-dom/client';
import App from './App';
import { utm } from '@/lib/utm';
import './style.css';

/**
 * Every link out of the panel is tagged as it is clicked: the campaign is the panel area it sits in (the nearest
 * data-area), the content is the link's own label. Middle clicks count too. This is the one place outbound
 * clicks pass through.
 */
function tagOutbound(e: MouseEvent) {
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!a || !/^https?:/.test(a.href) || a.dataset.tagged === a.href) return;
  const area = (a.closest('[data-area]') as HTMLElement | null)?.dataset.area ?? 'panel';
  a.href = utm(a.href, area, a.dataset.content ?? a.textContent?.trim());
  a.dataset.tagged = a.href;
}
document.addEventListener('click', tagOutbound, true);
document.addEventListener('auxclick', tagOutbound, true);

createRoot(document.getElementById('root')!).render(<App />);
