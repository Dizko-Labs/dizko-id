/**
 * Dizko ID buttons inside SoundCloud's own action rows (Like, Share, Repost, ...): one on a track page, and
 * one on each single track in a listing (profiles, streams). Pressing it opens the side panel on that mix and
 * starts identifying. SoundCloud's newer track page renders inside a same-site frame (soundcloud.com/n/...),
 * so this runs in every frame and only acts where a row exists.
 */
export default defineContentScript({
  matches: ['https://soundcloud.com/*'],
  allFrames: true,
  main() {
    const MARK = 'data-mix-to-cart';
    // Reloading the extension leaves this script's buttons in open tabs, cut off from the new extension. Each run
    // stamps its own buttons, replaces anyone else's, and turns its own into a reload prompt once it is cut off.
    const RUN = crypto.randomUUID();
    const alive = () => {
      try {
        return !!browser.runtime?.id;
      } catch {
        return false;
      }
    };
    const ACID = '#c4f236';
    const ACID_HOVER = '#d4f75f';
    const CART =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none">' +
      '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>';

    // A single track (a mix is one long upload), not a set, station, profile or listing
    const NOT_A_TRACK = /^(discover|stations|search|you|feed|charts|upload|settings|messages|notifications|pages|terms-of-use|tags|n)$/;
    const SUBPAGES = ['sets', 'tracks', 'likes', 'reposts', 'albums', 'popular-tracks', 'followers', 'following', 'comments'];
    const pagePath = () => {
      try {
        return window.top!.location.pathname;
      } catch {
        return location.pathname.replace(/^\/n\//, '/');
      }
    };
    const onTrack = () => {
      const parts = pagePath().split('/').filter(Boolean);
      return parts.length === 2 && !NOT_A_TRACK.test(parts[0]!) && !SUBPAGES.includes(parts[1]!);
    };

    /** Our pill, sized and shaped from a SoundCloud button in the same row so it sits in either layout. */
    function makeButton(reference: HTMLElement, onPress: () => void, small: boolean) {
      const look = getComputedStyle(reference);
      const height = Math.max(small ? 22 : 28, Math.round(reference.getBoundingClientRect().height) || (small ? 22 : 32));
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute(MARK, RUN);
      button.setAttribute('aria-label', 'Dizko ID: find the tracks in this mix');
      button.title = 'Find the tracks in this mix';
      button.innerHTML = `${CART}<span>Dizko ID</span>`;
      const round = parseFloat(look.borderTopLeftRadius) >= height / 2 - 1 || look.borderTopLeftRadius.endsWith('%');
      Object.assign(button.style, {
        display: 'inline-flex',
        alignItems: 'center',
        gap: small ? '4px' : '6px',
        height: `${height}px`,
        padding: small ? '0 8px 0 7px' : '0 12px 0 10px',
        marginLeft: small ? '4px' : '8px',
        boxSizing: 'border-box',
        border: '0',
        outline: 'none',
        outlineOffset: '2px',
        borderRadius: round ? `${height / 2}px` : look.borderTopLeftRadius,
        // Dizko acid so it reads as ours among SoundCloud's grey controls; near-black text keeps it legible
        background: ACID,
        color: '#0d0d0d',
        // the page's type, not the button's (SoundCloud's icon buttons inherit a fallback font)
        font: `600 ${small ? 12 : 14}px/1 ${getComputedStyle(document.body).fontFamily}`,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        flex: 'none',
        verticalAlign: 'middle',
      });
      button.addEventListener('mouseenter', () => (button.style.background = ACID_HOVER));
      button.addEventListener('mouseleave', () => (button.style.background = ACID));
      // the page's own text colour, so the ring shows on SoundCloud's light and dark pages alike
      button.addEventListener('focus', () => (button.style.outline = `2px solid ${look.color}`));
      button.addEventListener('blur', () => (button.style.outline = 'none'));
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onPress();
      });
      return button;
    }

    /** Ask the extension to open its panel; if Chrome refuses, say how to open it. */
    function launch(button: HTMLElement, url?: string) {
      if (!alive()) {
        // this copy belongs to a replaced extension: only a page reload brings the new one in
        location.reload();
        return;
      }
      browser.runtime
        .sendMessage({ type: 'launch', url })
        .then((r: { opened?: boolean } | undefined) => {
          if (r?.opened === false) {
            button.title = 'Click the Dizko ID icon in the toolbar to open it on this mix';
            button.querySelector('span')!.textContent = 'Open from toolbar';
          }
        })
        .catch(() => {
          button.title = 'Reload this page to use Dizko ID';
          button.querySelector('span')!.textContent = 'Reload page';
        });
    }

    const placeOnTrack = () => {
      // Only the track's own row: the first Share button on the page belongs to the hero, the rest to comments
      const share = document.querySelector<HTMLElement>('button[aria-label="Share"]');
      const row = share?.parentElement;
      if (!share || !row || row.querySelector(`[${MARK}]`)) return;
      const button = makeButton(share, () => launch(button), false);
      row.appendChild(button);
    };

    /** Listings (profiles, streams, search results): a button on each single track, which opens that track and starts there. */
    const placeInList = () => {
      for (const item of document.querySelectorAll<HTMLElement>('.soundList__item, .searchList__item')) {
        // single tracks only: albums, sets and playlists are many uploads, not one mix
        const link = item.querySelector<HTMLAnchorElement>('a.soundTitle__title');
        if (item.querySelector('.sound.playlist') || /\/sets\//.test(link?.getAttribute('href') ?? '')) continue;
        const group = item.querySelector<HTMLElement>('.soundActions .sc-button-group');
        const reference = group?.querySelector<HTMLElement>('button');
        if (!link || !group || !reference || group.querySelector(`[${MARK}]`)) continue;
        const button = makeButton(reference, () => {
          launch(button, link.href);
          // SoundCloud's own link, so the page changes in place and playback carries on
          link.click();
        }, true);
        group.appendChild(button);
      }
    };

    const place = () => {
      if (!alive()) {
        // cut off from a reloaded extension: stop, and leave the page to the new copy
        observer.disconnect();
        document.querySelectorAll(`[${MARK}="${RUN}"]`).forEach((b) => b.remove());
        return;
      }
      // buttons left by an earlier copy of the extension do nothing; replace them with this copy's
      document.querySelectorAll(`[${MARK}]:not([${MARK}="${RUN}"])`).forEach((b) => b.remove());
      if (onTrack()) placeOnTrack();
      else placeInList();
    };
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        place();
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    place();
  },
});
