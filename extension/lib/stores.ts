/**
 * Functions injected into store pages with chrome.scripting.executeScript.
 * Chrome serializes each function's source, so every one must be self-contained: no imports, no outer variables.
 */
import type { Offer } from './types';

export const beatportSearchUrl = (q: string) => `https://www.beatport.com/search/tracks?q=${encodeURIComponent(q)}`;
export const bandcampSearchUrl = (q: string) => `https://bandcamp.com/search?q=${encodeURIComponent(q)}&item_type=t`;
export const BEATPORT_CART = 'https://www.beatport.com/cart';

/** A store's bot check (Bandcamp's "Client Challenge", Cloudflare's "Just a moment") in place of the page asked for. */
export function storeCheck(): boolean {
  return /^(Client Challenge|Just a moment)/i.test(document.title) || /Enter the characters seen in the image/.test(document.body?.innerText ?? '');
}

/** Beatport search results ship as JSON in __NEXT_DATA__; read them instead of the rendered rows. */
export function beatportReadSearch(): { loggedIn: boolean; offers: Offer[] } | null {
  const el = document.getElementById('__NEXT_DATA__');
  if (!el) return null;
  const props = JSON.parse(el.textContent || '{}')?.props?.pageProps ?? {};
  const query = (props.dehydratedState?.queries ?? []).find((q: any) => q.queryKey?.[0] === 'search-tracks');
  const rows: any[] = query?.state?.data?.data ?? [];
  const offers: Offer[] = rows.slice(0, 40).map((r) => ({
    store: 'beatport',
    id: String(r.track_id),
    url: `https://www.beatport.com/track/${(r.track_name || 'track').toLowerCase().replace(/[^a-z0-9]+/g, '-')}/${r.track_id}`,
    artists: (r.artists ?? []).map((a: any) => a.artist_name),
    title: r.track_name ?? '',
    version: r.mix_name ?? '',
    price: r.price ? { value: r.price.value, currency: r.price.code, display: r.price.display } : undefined,
    isrc: r.isrc ?? undefined,
    release: r.release?.release_name,
    label: r.label?.label_name,
    released: r.publish_date ?? r.release_date,
  }));
  return { loggedIn: !props.anonSession, offers };
}

/**
 * Click the price button on the result row for this track id.
 * Resolves 'carted', 'in-cart' (already there), 'login' (Beatport asked to log in), or 'missing'.
 */
export async function beatportAddToCart(trackId: string): Promise<'carted' | 'in-cart' | 'login' | 'missing'> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const link = document.querySelector(`a[href$="/${trackId}"]`);
  let row: Element | null = link;
  while (row && !row.querySelector('button[aria-label^="Add track"], button[class*="AddToCart_priceButton"]')) row = row.parentElement;
  const button = row?.querySelector<HTMLButtonElement>('button[aria-label^="Add track"], button[class*="AddToCart_priceButton"]');
  if (!button) return 'missing';
  if (!/\d/.test(button.textContent || '')) return 'in-cart';
  button.click();
  for (let i = 0; i < 20; i++) {
    await sleep(250);
    if (/log in to continue|create account or log in/i.test(document.body.innerText)) return 'login';
    if (!/\d/.test(button.textContent || '') || button.disabled) return 'carted';
  }
  // No visible change but no login wall either: Beatport accepted the click
  return 'carted';
}

/** Bandcamp search results: track pages with title and "by Artist". Prices live on each track page. */
export function bandcampReadSearch(): { url: string; title: string; artist: string; album: string }[] {
  return [...document.querySelectorAll('.searchresult')].slice(0, 10).flatMap((r) => {
    const type = r.querySelector('.itemtype')?.textContent?.trim().toUpperCase();
    const url = r.querySelector('.itemurl')?.textContent?.trim() ?? '';
    const sub = r.querySelector('.subhead')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (type !== 'TRACK' || !url) return [];
    return [{
      url,
      title: r.querySelector('.heading')?.textContent?.trim() ?? '',
      artist: sub.match(/\bby (.+)$/)?.[1]?.trim() ?? '',
      album: sub.match(/^from (.+?) by /)?.[1]?.trim() ?? '',
    }];
  });
}

/** A Bandcamp track page: what it is, what it costs, and whether the track can be bought on its own. */
export function bandcampReadTrack(): {
  offer: Offer;
  buyable: boolean;
  minimum: number;
  setPrice: number | null;
} | null {
  const el = document.querySelector<HTMLElement>('script[data-tralbum]');
  if (!el?.dataset.tralbum) return null;
  const t = JSON.parse(el.dataset.tralbum);
  const currency = document.querySelector<HTMLElement>('script[data-band-currency]')?.dataset.bandCurrency
    ?? t.current?.currency ?? 'USD';
  const full: string = t.current?.title ?? '';
  const m = full.match(/^(.*?)\s*[([]([^)\]]*)[)\]]\s*$/);
  const minimum = Number(t.current?.minimum_price ?? 0);
  const setPrice = t.current?.set_price != null ? Number(t.current.set_price) : null;
  const value = setPrice ?? minimum;
  const buyable = !!document.querySelector('.buy-link') && /buy digital track/i.test(document.body.innerText);
  return {
    offer: {
      store: 'bandcamp',
      id: String(t.id),
      url: location.origin + location.pathname,
      artists: [t.artist ?? ''],
      title: m ? m[1]! : full,
      version: m ? m[2]! : '',
      price: { value, currency, display: `${value.toFixed(2)} ${currency}` },
      release: t.album_title ?? undefined,
      released: t.current?.release_date ?? undefined,
    },
    buyable,
    minimum,
    setPrice,
  };
}

/** Open "Buy Digital Track", enter the price, press "Add to cart", and confirm the side cart lists it. */
export async function bandcampAddToCart(price: number, title: string): Promise<'carted' | 'failed'> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const buy = [...document.querySelectorAll<HTMLElement>('button, a')].find((b) => /^\s*buy digital track\s*$/i.test(b.textContent || ''));
  if (!buy) return 'failed';
  buy.click();
  let input: HTMLInputElement | null = null;
  for (let i = 0; i < 20 && !input; i++) {
    await sleep(200);
    input = document.querySelector<HTMLInputElement>('#userPrice, input[name="userPrice"]');
  }
  if (input) {
    input.focus();
    input.value = price.toFixed(2);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const add = [...document.querySelectorAll<HTMLElement>('button, a')].find((b) => /^\s*add to cart\s*$/i.test(b.textContent || '') && b.offsetParent);
  if (!add) return 'failed';
  add.click();
  const want = title.toLowerCase().slice(0, 20);
  for (let i = 0; i < 30; i++) {
    await sleep(250);
    const cart = document.querySelector('#sidecart, .sidecart, [class*="cart"]');
    if (cart && cart.textContent?.toLowerCase().includes(want)) return 'carted';
  }
  return 'failed';
}
