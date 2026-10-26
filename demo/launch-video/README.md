# Dizko ID launch video

A programmable product animation of Dizko ID, built with
[HyperFrames](https://github.com/heygen-com/hyperframes) (HTML + GSAP, rendered to MP4).

It is a product animation, not a screen recording:
- **Sample data only.** The artist, events, mix, tracks and counts in `config.js` are fictional.
- **Nothing runs live.** There is no identification, no store call, no cart and no payment.
- **The extension's own interface.** The side panel is rebuilt from screenshots of Dizko ID: its header, artist block, "Waiting for Shazam" progress, Stop listening, Add N to Beatport / Bandcamp, "N of M ticked", Export, Tick all, the track rows with play buttons and store links, and "Plus N unconfirmed". The film ends on the add-to-cart click, before any store page or checkout.
- **The mix page is a stand-in.** It is an unbranded SoundCloud-style page.

Nothing outside `demo/` changes; the extension and the skill are untouched.

## Edit

Everything you would change lives in **`config.js`**: the captions (text, accent word, timing, placement), the disclaimer, the mix, the artist block, the listening percentages, the confirmed and unconfirmed tracks, the track that arrives on screen, which track is previewed, which is ticked, which add button is pressed, every beat's start time, and the end card.

`index.html` builds the panes from that file. Change it only to change the look or the camera.

The panel's styles are copied from screenshots rather than from the extension's CSS, because that code isn't in this repo yet. Once it is, swap the `--panel`, `--acid` and font values for its real tokens.

## Preview and render

You need Node 22+ and FFmpeg. Rendering uses headless Chrome, which HyperFrames drives itself.

```bash
cd demo/launch-video
npm run dev       # live preview in the browser
npm run check     # lint, layout, motion and contrast checks
npm run render    # → renders/dizko-id-launch-1920x1080.mp4
```

Every script first runs `sync-duration.mjs`, which sets the film length from `end.at + end.hold` in `config.js`.

To render one still for review:

```bash
npx --yes hyperframes@0.8.202 snapshot --at 9.9 --no-end -o .work/stills
```

## Vertical

The camera targets are plain constants in `index.html` (`BROWSER`, `PANEL`, `V`), and almost every shot frames the 540px panel, so a 1080×1920 cut mostly means re-aiming `V` and moving the captions above the panel. Render it with `--resolution portrait`. That cut has not been built yet.
