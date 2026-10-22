---
name: dizko-id
description: Identify the tracks in a DJ mix (SoundCloud, Mixcloud or YouTube link, or a local audio file) and add each one to the user's Beatport cart, falling back to Bandcamp, so they can buy the whole set in one checkout. Use when the user shares a mix link and wants to buy, cart, or shop for its tracks.
---

# Dizko ID

Turn a mix into a filled shopping cart. Two stages:

1. **Identify:** `scripts/trackid.py` downloads the mix, fingerprints a clip every 30 s with Shazam, and writes an ordered tracklist.
2. **Cart:** for each track, search Beatport first, then Bandcamp, open the matching release in the user's own logged-in browser, and press "Add to cart".

The user always presses the final Buy button. Never start checkout, enter payment details, or confirm an order.

## Requirements

- `uv`, `yt-dlp` and `ffmpeg` on PATH. macOS: `brew install uv yt-dlp ffmpeg`. Debian/Ubuntu: `sudo apt install ffmpeg yt-dlp` plus uv from https://docs.astral.sh/uv/. Windows: `winget install astral-sh.uv yt-dlp.yt-dlp Gyan.FFmpeg`. Check first with `uv --version && yt-dlp --version && ffmpeg -version`; if any is missing, tell the user the command for their OS and stop.
- Browser automation with the Claude in Chrome extension (`mcp__claude-in-chrome__*` tools), with the user already logged in to beatport.com and bandcamp.com. If the extension is not connected, stop after stage 1 and hand over the tracklist.

## Stage 1: identify

```bash
uv run "<dir containing this SKILL.md>/scripts/trackid.py" "<url or file>" --json "<temp dir>/tracks.json"
```

A 1 hour mix takes about 3 minutes (one Shazam call per 30 s slice). Progress goes to stderr. Each track in the JSON has `artist`, `title`, `at` (first heard), `hits`, `confident` (2+ hits) and `query` (a cleaned search string).

If the user already has a tracklist (pasted text, a 1001Tracklists page, the mix description), skip the script and build the same list from that instead; treat every entry as confident.

**Before any browser work, show the list and get confirmation.** Number the tracks. Mark single-hit entries as unconfirmed: one 12 s clip is often a sample, an acapella, or two records layered in a transition. Ask which unconfirmed tracks to include. Carry on with the confirmed tracks plus the ones the user approves.

## Stage 2: cart

Load the Chrome tools in one ToolSearch call, call `tabs_context_mcp`, then open one new tab and work in it. For each track, in order:

### Beatport

1. Navigate to `https://www.beatport.com/search/tracks?q=<url-encoded query>`.
2. Read the results with `get_page_text` or `find`, not screenshots, where possible.
3. Pick the match (rules below). If none qualifies, go to Bandcamp.
4. Press that row's price / add-to-cart button. Confirm the cart counter went up or the button changed state.

### Bandcamp (fallback)

1. Navigate to `https://bandcamp.com/search?q=<url-encoded query>&item_type=t`.
2. Pick the match, open its track page.
3. Press "Buy Digital Track". If the track is album-only, record it as album-only and do not cart the album unless the user asked for that.
4. In the price dialog, keep the listed minimum. For "name your price" with a 0 minimum, use the amount the user gave at the start, or ask once and reuse it.
5. Press "Add to cart" and confirm the cart shows the item.

### Picking a match

- The artist must match (ignoring case, accents, "&" vs "and", and featured artists). The title must match after dropping "(feat. ...)".
- The mix matters. "Original Mix" on Beatport equals a Shazam title with no mix name. If Shazam named a remix ("Amotik Remix", "Nu Disco Mix"), take only that remix; do not substitute the original or another remix. If only other versions exist, record "version not found" and list what was there.
- Prefer the earliest original release over compilations and "Best of" reissues of the same recording.
- Never cart a cover, karaoke, tribute, or "made famous by" version.
- When two candidates are equally good, take the cheaper one and note the other.

## Pacing and failures

- Wait for each page to finish loading before reading it. Do one track at a time; do not open many tabs.
- If a store shows a captcha, login wall, or region block, stop using that store, tell the user, and continue with the other.
- If a click does not change the cart, retry once after re-reading the page, then record it as failed rather than looping.

## Finish

Open the cart pages (`https://www.beatport.com/cart`, and Bandcamp's cart from the cart icon) so they are the visible tabs, and leave them there.

Write ``<temp dir>/<mix-slug>-cart.md`` and show it in the reply:

| # | Track | Store | Price | Status |
|---|-------|-------|-------|--------|

Status is one of: carted, version not found, album only, not found, skipped (unconfirmed), failed. Under the table, give each store's cart total as shown on the cart page, and list every non-carted track with its search link so the user can follow up by hand.

End by telling the user the carts are ready and that they need to review and press Buy themselves.
