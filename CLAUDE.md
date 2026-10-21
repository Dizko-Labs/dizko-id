# Dizko ID (repo: mix-to-cart)

Read this first. It is the handoff for the next session: what exists, how it works, what was decided, how the owner likes to work, and what is left. Keep it current when you change something that a future session would need to know.

## What it is

Two things live here:

- **Dizko ID**, a Chrome MV3 extension in `extension/` (WXT 0.21, React 19, Tailwind v4, shadcn components). It was called Mix to Cart until 2026-10-21; the repo and branch names were kept. A DJ opens a mix on SoundCloud, YouTube or Mixcloud, the side panel finds every track, shows the DJ's Dizko profile and dates, and fills Beatport/Bandcamp carts or playlists. It never checks out.
- **The original Claude skill** (`SKILL.md`, `scripts/trackid.py`), on `main`, symlinked into `~/.claude/skills/mix-to-cart`. Identifies a mix with Shazam and carts it through Claude in Chrome.

Branch state (2026-10-21): all extension work is on `extension` (pushed, not merged to `main`, no PR opened yet). Ask before merging to `main`.

## First release scope

SoundCloud only (2026-10-21, owner's call). YouTube and Mixcloud listening works from the page's own player (commit "hear YouTube and Mixcloud from the page's own player") but long unskippable YouTube ads still stall a listen. To bring them back in an update: add their URLs to `matches` in `source.content.ts`, to `MIX_SITES` in `App.tsx`, and to `host_permissions` in `wxt.config.ts`, restore the first-run copy, and test with ads. Store submission checklist: `CHROME_WEB_STORE.md`.

## How the extension works

- `entrypoints/background.ts`: the service worker. One job in `storage.session` (`job`), every edit through `update()` (a queue so listening and carting never overwrite each other). Separate stop switches for listening, carting and the Beatport follower. `recover()` settles a job left running by a killed worker. Long runs pass their mix as `owner` to `update()`/`patchRow()` so their writes drop once the job is another mix; whole-job writes go through `replace()` in the same queue; `listening`/`carting`/`scanning` sets stop a double press starting a second run. `panel:*` messages are accepted only from `sidepanel.html`.
- Identification: a written tracklist in the description is used first (`lib/tracklist.ts`). Otherwise Shazam via shazamio-core compiled to WASM in the offscreen document (`entrypoints/offscreen/main.ts`): SoundCloud from its own HLS segments (no tab audio), YouTube by tab capture while seeking, anything else by listening live. Shazam's unofficial endpoint rate-limits a network (429) after a few hundred lookups; `lookup()` backs off. A stopped listen keeps `progress`; Keep listening resumes.
- Scan mix (artist page) reads a SoundCloud mix by URL in the background (`lib/soundcloudPage.ts`, shared with the content script) and listens without opening a tab.
- Beatport: no cart API. A beatport.com tab calls Beatport's v4 API with the site's own session token (`beatportApi` in `lib/stores.ts`, token from `/api/auth/session`, never leaves the page except to api.beatport.com). Carting = make or reuse one playlist per mix, bulk-add, press the playlist's Buy All (adds to cart). The follower keeps adding new finds to that playlist while listening. `enrich()` looks every track up once for BPM, Camelot key, length and the exact release link.
- Bandcamp: drives the page one track at a time; its human check is answered by the DJ (never bypass). Shows a CAPTCHA to automation-controlled browsers.
- Playlists: removed 2026-10-21 at the owner's request. Spotify and SoundCloud needed the DJ's own developer app, so they did not work for users, and a Beatport playlist on its own duplicated Purchase (the cart run already makes one and presses Buy All). The code is in git before commit "Extension: drop playlist buttons" if it comes back. SoundCloud's web API answers scripted writes with DataDome; do not try to get around it. The mix view keeps one Export tracklist menu (text, CSV, JSON, Scan again).
- Dizko: `lib/dizko.ts` calls `get_artist` on `https://mcp.dizko.app/mcp` (raw JSON-RPC, no key; extension origins allowed since dizko-mcp PR #41). Hosting channels (Boiler Room, Cercle, NTS...) are never taken as the DJ; the title is split at them. Artist data refreshes after 12 hours.
- Library (`lib/history.ts`, `storage.local`, 50 mixes): Artists, Mixes, Tracks tabs, artist pages with their other SoundCloud mixes (`lib/soundcloud.ts`), cover art (Shazam, Beatport, else iTunes only when artist and title both match), DJ avatars, startup backfills rate-limited weekly. Tabs sit straight under the Dizko ID bar; the product description shows only on the empty first run; a slim Now listening or Back to strip appears while a mix runs; one quiet row on Artists links to the Dizko account until linked. A saved mix opened during another run is a read-only peek.
- Link to Dizko (`lib/dizkoAccount.ts`, `DizkoLinkBar.tsx`): OAuth with api.dizko.app (dynamic registration, PKCE, scope `taste:write`), then `PUT /connector/v1/taste-import` with DJ and artist names and weights only. Needs EventChat PR #845 deployed.
- UTM on every outbound link (`lib/utm.ts`, the capture-phase handler in `sidepanel/main.tsx`); mix URLs are cleaned before saving so tagged links still match.
- Analytics (`lib/analytics.ts`): PostHog capture API, asked once on first run (`Consent.tsx`), inert until `POSTHOG_KEY` is set. Only fixed control names and counts, never titles, accounts or tokens.
- Settings (`lib/settings.ts`, `sidepanel/Settings.tsx`, opened by the gear in `BrandBar.tsx` through a `dizko-settings` window event): default marketplace (leads the Purchase row as the acid button), track previews (Beatport, Apple, Off), appearance (System, Dark, Light; `data-theme` on `<html>`, set in `main.tsx`), and auto-listen (off shows Identify tracks). `useSettings()` has `ready`; nothing acts on the defaults before storage is read. The Dizko account, usage sharing and About links live on this screen, not in the library.
- Track previews (`lib/preview.ts`, `sidepanel/Preview.tsx`): Beatport's `sample_url` (kept on the offer as `sample`, about two minutes of the exact release, no login) first, Apple's iTunes 30 second `previewUrl` as fallback only when artist and title both match. One shared `<audio>`; a screen change stops it. Spotify, YouTube and SoundCloud per-track embeds were rejected (no exact ids, heavy iframes).
- Language: no setting. The UI is English only and a control that does nothing is not shown; a translation pass is the way to add it.
- SoundCloud page button (`entrypoints/launcher.content.ts`, all frames, since the track page renders in a `soundcloud.com/n/` iframe): on track pages and on single tracks in listings. Reloading the extension leaves stale buttons in open tabs; each run stamps and replaces them.

## Design

- Visual direction: the Dizko design system (dizko.app web tokens from EventChat `web/src/index.css` and `components/arc/dizko-theme.css`): ground #080808, surface #111111, border #2D2D2B, text #F0F0EC / #A7A7A1 / #898985, acid #C4F236 with #0D0D0D on it, Instrument Sans, pill buttons, hairline dividers, no shadows, dark by default with Dizko's light palette for a light system setting. Full system in `DESIGN.md` and `.impeccable/`; product context in `PRODUCT.md`; surface brief in `.impeccable/surfaces/`.
- Acid is for the primary action, ticks, progress, the in-your-cart marker and the SoundCloud button. One acid button per screen.
- Motion follows where content comes from (deeper screens from the right, back from the left, tabs from their side, reveals from above); a fade under reduced motion.
- Visitor mode: Operate. Layout: a persistent Dizko ID bar, each screen scrolls as one beneath it.

## Owner preferences (standing)

- Use the Impeccable skill for any visual work (`~/.claude/skills/impeccable`), run its detector (`scripts/impeccable detect --json extension/entrypoints/sidepanel`) after UI batches and before handoff, and ask for a visual direction before a new surface.
- Absolute bans everywhere, including replies: no em dashes, no italics, no all-caps labels or eyebrows (Dizko's uppercase buttons were deliberately not copied), no JetBrains Mono, no side-stripe accents, fewest elements.
- Real components (shadcn, or Arc UI from uiarc.dev). ui.shadcn.com does not resolve on the owner's network; fetch component source from raw.githubusercontent.com/shadcn-ui/ui.
- Git: pull before changing, commit and push after, never commit to `main` without asking, stage by name, no secrets. Other repos (EventChat, dizko-mcp) have their own AGENTS.md rules: EventChat merges only after `scripts/ci.sh --report` is green from a clean worktree, and deploys only through its scripts.
- Never enter passwords, never check out or pay, never bypass CAPTCHAs or bot detection. The owner logs in themselves.
- Minimal UI copy: no labels, hints or summaries a control already conveys; where text is needed, make the control self-describing ("Beatport cart (2)", not a "Purchase" label over "Beatport").
- The owner works fast and iterates visually from screenshots. Make the change, verify it in a real render, report plainly. Answer direct questions directly.

## Testing

- `cd extension && npm test` (vitest), `npx tsc --noEmit`, `npm run build` (output in `.output/chrome-mv3`, loaded unpacked in the owner's Chrome; extension id there `iflfcmhibefjhgdcfkanapkjdpmelihd`).
- End-to-end: Playwright from another project (`~/code/AgroFloresta/agrofloresta-identifier/node_modules/playwright`) with the cached Chromium at `~/Library/Caches/ms-playwright/chromium-1223/...` and `--load-extension` (Chrome stable ignores that flag). Open `chrome-extension://<id>/sidepanel.html` as a tab to drive the panel, seed `chrome.storage.local.history` for UI states. Delete the profile dir each run or the old worker is reused. Keep scripts and screenshots in the scratchpad, never in the repo.
- The owner must reload the extension at `chrome://extensions` (and reload open SoundCloud tabs) to see a new build; Claude in Chrome cannot open extension pages.

## Open work

1. EventChat PR #845 (taste import, `taste:write`): green (`local-ci` success) and mergeable as of 2026-10-21; Claude's merge was refused by the auto-mode permission check, so the owner merges it. Then a backend deploy (`scripts/deploy-backend-production.sh`) and a web deploy (`npm run deploy:production` in `web/`) per EventChat's AGENTS.md. Until it is deployed, Link to Dizko fails at registration (unknown scope).
2. PostHog: create a project and set `POSTHOG_KEY` in `extension/lib/analytics.ts` (public key, safe to commit).
3. (none: Spotify and SoundCloud playlists were removed; a return would need one shared developer app per service or a small token-exchange backend for SoundCloud's secret.)
4. Chrome Web Store: pin a manifest `key` so the extension id is stable, write the privacy disclosure (analytics, Dizko link), store listing.
5. Queued features: shareable playlist page (needs hosting; ask before enabling GitHub Pages), YouTube Music and Apple Music playlists (via logged-in web sessions), a Mix to Cart button on YouTube.
6. Open a PR from `extension` to `main` when the owner asks.
