/**
 * A Mix to Cart button in SoundCloud's own action row (Like, Share, Repost, ...). Pressing it opens the side
 * panel on this mix and starts identifying. SoundCloud renders the track page inside a same-site frame
 * (soundcloud.com/n/...), so this runs in every frame and only acts where the row exists.
 */
export default defineContentScript({
  matches: ['https://soundcloud.com/*'],
  allFrames: true,
  main() {
    const MARK = 'data-mix-to-cart';
    // A single track (a mix is one long upload), not a set, station, profile or listing
    const NOT_A_TRACK = /^(discover|stations|search|you|feed|charts|upload|settings|messages|notifications|pages|terms-of-use|tags|n)$/;
    const onTrack = () => {
      let path = '';
      try {
        path = window.top!.location.pathname;
      } catch {
        path = location.pathname.replace(/^\/n\//, '/');
      }
      const parts = path.split('/').filter(Boolean);
      return parts.length === 2 && !NOT_A_TRACK.test(parts[0]!) && !['sets', 'tracks', 'likes', 'reposts', 'albums', 'popular-tracks', 'followers', 'following', 'comments'].includes(parts[1]!);
    };
    const place = () => {
      if (!onTrack()) {
        document.querySelectorAll(`[${MARK}]`).forEach((b) => b.remove());
        return;
      }
      // Only the track's own row: the first Share button on the page belongs to the hero, the rest to comments
      const share = document.querySelector<HTMLElement>('button[aria-label="Share"]');
      const row = share?.parentElement;
      if (!share || !row || row.querySelector(`[${MARK}]`)) return;
      // Our own pill, dressed in the Share button's computed look so it sits in either SoundCloud layout: the
      // new one rings its round icon buttons with an outline, the classic one draws a border
      const look = getComputedStyle(share);
      const ringed = look.outlineStyle !== 'none' && parseFloat(look.outlineWidth) > 0;
      const height = Math.max(28, Math.round(share.getBoundingClientRect().height) || 32);
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute(MARK, '');
      button.setAttribute('aria-label', 'Mix to Cart: find the tracks in this mix');
      button.title = 'Find the tracks in this mix';
      button.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none">' +
        '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>' +
        '<span>Mix to Cart</span>';
      const radius = parseFloat(look.borderTopLeftRadius) >= height / 2 - 1 ? `${height / 2}px` : look.borderTopLeftRadius;
      Object.assign(button.style, {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: `${height}px`,
        padding: '0 12px 0 10px',
        marginLeft: '8px',
        boxSizing: 'border-box',
        border: ringed || look.borderTopStyle === 'none' ? '0' : `${look.borderTopWidth} ${look.borderTopStyle} ${look.borderTopColor}`,
        outline: ringed ? `${look.outlineWidth} ${look.outlineStyle} ${look.outlineColor}` : 'none',
        outlineOffset: look.outlineOffset,
        borderRadius: radius,
        background: look.backgroundColor,
        color: look.color,
        // the page's type, not the button's (SoundCloud's icon buttons inherit a fallback font)
        font: `600 14px/1 ${getComputedStyle(document.body).fontFamily}`,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        flex: 'none',
      });
      const rest = look.backgroundColor;
      button.addEventListener('mouseenter', () => (button.style.background = `color-mix(in srgb, ${look.color} 12%, ${rest === 'rgba(0, 0, 0, 0)' ? 'transparent' : rest})`));
      button.addEventListener('mouseleave', () => (button.style.background = rest));
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        browser.runtime.sendMessage({ type: 'launch' });
      });
      // After the last button in the row, so SoundCloud's own order is untouched
      row.appendChild(button);
    };
    place();
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        place();
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  },
});
