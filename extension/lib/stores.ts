/**
 * Functions injected into store pages with chrome.scripting.executeScript.
 * Chrome serializes each function's source, so every one must be self-contained: no imports, no outer variables.
 */
import type { Offer } from './types';

export const beatportSearchUrl = (q: string) => `https://www.beatport.com/search/tracks?q=${encodeURIComponent(q)}`;
export const bandcampSearchUrl = (q: string) => `https://bandcamp.com/search?q=${encodeURIComponent(q)}&item_type=t`;
export const BEATPORT_CART = 'https://www.beatport.com/cart';
export const beatportPlaylistUrl = (id: number) => `https://www.beatport.com/library/playlists/${id}`;

/**
 * Runs in a beatport.com tab. Calls Beatport's v4 API (api.beatport.com/v4, documented at /v4/docs) the way
 * beatport.com itself does: with the access token from the site's own session endpoint, so it acts as the DJ
 * and nothing about their login leaves the page except through this call. Status 401 means not logged in.
 */
export async function beatportApi(path: string, method = 'GET', body?: unknown): Promise<{ status: number; data?: any }> {
  const session = await fetch('/api/auth/session').then((r) => r.json()).catch(() => null);
  const token = session?.token
    ? session.token.accessToken ?? Object.entries(session.token).find(([k, v]) => /access/i.test(k) && typeof v === 'string')?.[1]
    : undefined;
  if (!token) return { status: 401 };
  const res = await fetch(`https://api.beatport.com/v4${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => undefined) };
}

/**
 * Runs on a playlist page: presses the playlist's own "Buy All", which adds every track to the cart (its
 * aria-label is "Add all tracks from playlist ... to cart"; nothing is bought). Resolves once the header's
 * cart count rises, or reports what stopped it.
 */
export async function beatportBuyAll(): Promise<'carted' | 'missing' | 'login' | 'unchanged'> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const count = () => Number(document.querySelector('[aria-label^="Open cart,"]')?.getAttribute('aria-label')?.match(/(\d+) item/)?.[1] ?? NaN);
  let button: HTMLButtonElement | null = null;
  for (let i = 0; i < 40 && !button; i++) {
    button = document.querySelector<HTMLButtonElement>('button[aria-label^="Add all tracks from playlist"]');
    if (!button) await sleep(250);
  }
  if (!button) return 'missing';
  const before = count();
  button.click();
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (/log in to continue|create account or log in/i.test(document.body.innerText)) return 'login';
    if (count() > before || /added to cart/i.test(document.body.innerText)) return 'carted';
  }
  return 'unchanged';
}

/** A store's bot check (Bandcamp's "Client Challenge", Cloudflare's "Just a moment") in place of the page asked for. */
export function storeCheck(): boolean {
  return /^(Client Challenge|Just a moment)/i.test(document.title) || /Enter the characters seen in the image/.test(document.body?.innerText ?? '');
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
