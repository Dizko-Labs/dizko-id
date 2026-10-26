# Dizko ID launch video

A programmable product animation of Dizko ID, built with
[HyperFrames](https://github.com/heygen-com/hyperframes) (HTML + GSAP, rendered to MP4).

It is a product animation, not a screen recording:
- **Real mix, real panel states.** The film runs on Maara @ The Lot Radio 06-28-2026. Maara's appearances come from Dizko's data. The two track rows, "5 of 16 ticked", "Open Beatport cart", "Add 3 to Bandcamp", "Version not on Beatport", "In cart" and the green Bandcamp-cart highlight are all copied from the extension's own panel.
- **Shazam listening is sped up,** and the video says so on screen.
- **Nothing runs live.** There is no identification, no store call and no cart change; the film ends before any store page.
- **The SoundCloud page is a screenshot** kept in `assets/private/`, which is git-ignored because the photo belongs to The Lot Radio. To render, put `soundcloud-page.png` (1342×830 crop of the page) and `dizko-button.png` (the in-page Dizko ID button) there, or point `page.image` / `page.button` in `config.js` at your own.

Nothing outside `demo/` changes; the extension and the skill are untouched.

## Edit

Everything you would change lives in **`config.js`**: the captions (text, accent word, timing, placement), the on-screen note, the page screenshot, the artist and their dates, the mix, the counts, the track rows and their after-Beatport states, the Library counts, which track is previewed, every beat's start time, and the end card.

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
