# Mix to Cart (Chrome extension)

Open a DJ mix on YouTube, SoundCloud or Mixcloud, click the extension, and the side panel lists every track in the set. Tick the ones you want, press "Add to cart", and they go into your Beatport cart (falling back to Bandcamp). You review the cart and press Buy yourself; the extension never checks out.

## Load it

```bash
npm install
npm run build
```

Then in Chrome: `chrome://extensions`, turn on Developer mode, "Load unpacked", and pick `.output/chrome-mv3`. Pin it, open a mix, click the icon.

`npm run dev` opens a separate Chrome with the extension loaded and reloads on change.

## How it finds the tracks

1. **Written tracklist first.** If the description lists the tracks (`00:00 Artist - Title`), it uses that. Instant.
2. **SoundCloud without a tracklist:** it fetches the mix's own audio stream in 10 second segments and fingerprints one every 30 to 60 seconds of mix. About two minutes for an hour.
3. **YouTube without a tracklist:** it captures the tab's audio while jumping through the video. The tab goes quiet while it works. Roughly 20 to 30 minutes for a two hour set.
4. **Anything else:** press play and it listens in real time.

Fingerprints go to Shazam's recognition endpoint using the open source [shazamio-core](https://github.com/shazamio/shazamio-core) signature code compiled to WebAssembly. This is not an official Shazam API and can stop working without notice.

A track heard in only one clip is marked unconfirmed and starts unticked: single hits are often a sample or two records blended.

## How it fills the cart

For each ticked track it searches Beatport in a background tab, reads the results, and adds the exact version that was played: a named remix only matches that remix, a plain title takes the Original or Extended Mix, and karaoke or tribute copies are refused. If Beatport does not have that version, it tries Bandcamp. Anything it cannot place is listed with what does exist.

- **Beatport** keeps carts in your account. If you are logged out, it opens the login page and carries on by itself once you log in. Because the cart lives in your account, it is there on any device afterwards.
- **Bandcamp** has one cart across every label, logged in or not, so a whole set checks out together. It pays the label's set price, or the minimum.

## Export

Text (with links), CSV, or JSON. Every track carries Beatport, Bandcamp, Spotify and YouTube links: the exact release where one was found, otherwise a search.

## Permissions

| Permission | Why |
|---|---|
| `sidePanel` | the interface |
| `tabCapture`, `offscreen` | hear a YouTube mix to identify it |
| `scripting`, `tabs` | read store search results and press "Add to cart" in a background tab |
| `storage` | keep the current tracklist while the panel is closed |
| youtube.com, soundcloud.com, mixcloud.com | read the mix page and its tracklist |
| beatport.com, bandcamp.com | search and add to cart |
| amp.shazam.com | identify clips |
| playback.media-streaming.soundcloud.cloud | SoundCloud audio segments |

Nothing is sent anywhere else. There is no server and no account.

## Develop

```bash
npm test          # matcher and tracklist parser, against real Shazam titles
npm run compile   # typecheck
.preview/make.sh  # after a build: renders the side panel in a normal tab with synthetic states (serve .preview/site)
```

## Not done yet

- Later: a shareable playlist page (needs hosting, such as GitHub Pages).
- Later: Dizko artist panel in the header (upcoming dates, socials, sound, base, with More info to the Dizko page).
- Later: YouTube Music and Apple Music playlists through the logged-in web apps.
- Later: add to carts through Beatport's v4 cart API and Bandcamp's cart request instead of pressing buttons in a background tab.

- Mixcloud has only the generic "listen in real time" path.
- The icons are the WXT placeholder.
