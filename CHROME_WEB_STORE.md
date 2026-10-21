# Chrome Web Store readiness

Audit of the `extension` build (`extension/.output/chrome-mv3`) against Chrome Web Store policy, 2026-10-21. Read-only review; nothing in the code was changed. Work through the checklist, tick items off, and fold the outcome into CLAUDE.md open work item 4 when done.

## Blockers

- [x] **Version.** Set to 0.1.0 (2026-10-21). The manifest says `0.0.0`, which Chrome rejects ("They must not be all zero"). Set `version` in `extension/package.json` (WXT copies it into the manifest), for example `0.1.0`.
- [ ] **Privacy policy.** Drafted as a Dizko ID section of Dizko's existing policy (EventChat PR #849, `https://www.dizko.app/privacy-policy.html#dizko-id`); live after merge and a web production deploy. Original note: Required, at a public URL, because the extension handles user data. It must name every recipient and what each receives:
  - Shazam (`amp.shazam.com`): audio fingerprints of the mix being played.
  - PostHog (`us.i.posthog.com`): opt-in usage events, fixed control names and counts only.
  - Dizko (`mcp.dizko.app`, `api.dizko.app`): DJ names looked up; with Link to Dizko, an OAuth token and DJ/artist names with weights.
  - Beatport, Bandcamp: cart and playlist actions in the DJ's own logged-in session; the Beatport session token is read in the page and only sent to `api.beatport.com`.
  - SoundCloud, iTunes: public metadata, cover art and previews.
  - Local storage: history of up to 50 mixes, never uploaded.
  - A Limited Use statement: data is used only for this purpose, never sold, never used for ads.
- [x] **Privacy link in the UI.** Settings, beside usage sharing, and in the first-run consent prompt (2026-10-21). Add a link to the policy in Settings next to the usage sharing toggle (and in `Consent.tsx` if it fits).
- [ ] **Extension ID.** CLAUDE.md item 4 says to pin a `key` before submitting; Chrome's documented order is the reverse. Upload the zip first without publishing, then copy the public key from the dashboard (Package tab, View public key, one line without the BEGIN/END lines) into `manifest.key` in `wxt.config.ts`. This matters because `identity.getRedirectURL('dizko')` derives the OAuth redirect from the ID, so Link to Dizko depends on unpacked and store builds sharing one ID.

## Permission trims (verify, then remove)

- [x] **`tabs`.** Removed 2026-10-21; verified headless that SoundCloud and Beatport tab URLs stay readable through host permissions, other tabs hidden, mix reading and scanning work. It triggers the "Read your browsing history" install warning. It appears to be used only to read `tab.url` (`entrypoints/sidepanel/App.tsx:46`, `entrypoints/background.ts:44`, `:173`) to check for a mix site. Host permissions already expose `url` on SoundCloud, and it is undefined elsewhere, which is the wanted result. `tabs.create`, `tabs.update`, `tabs.onUpdated` do not need the permission. Remove it and test that the panel still detects mix pages and that Beatport/Bandcamp tab flows still read their URLs (both are in host permissions).
- [ ] **`unlimitedStorage`.** Kept on purpose: the 50-mix library with matches, alternatives and art URLs can outgrow 10 MB, and a full quota makes every job update throw mid-listen. It shows no install warning. Original note: Not referenced in code. History is capped at 50 (`lib/history.ts:17`); the default 10 MB should be ample unless cover art is stored as data URIs. Check, then drop.

- [x] **`tabCapture`.** Removed for the SoundCloud-only release (SoundCloud is heard from its own HLS stream; tab capture was only a YouTube/Mixcloud fallback). The panel says it could not hear the mix if that fallback is ever reached. A high-scrutiny permission, so it comes back only with YouTube and Mixcloud.
- [ ] **When YouTube and Mixcloud return:** restore `tabCapture` and their host permissions, and update the single-purpose text, permission justifications and privacy policy in the same submission.

Keep: `sidePanel`, `offscreen`, `scripting`, `storage`, `unlimitedStorage`, `identity`. Each maps to a feature.

## Review risks to handle in the listing and privacy tab

- **Single purpose.** Frame everything as one job: identify the tracks in a DJ mix and buy them. Dizko profile, dates and the library support that job.
- **Third-party names.** "Works with Beatport and Bandcamp" in the description is fine. No third-party logos, and nothing in the name, icon or screenshots that implies partnership or endorsement. Avoid lists of brand names (counts as keyword spam).
- **Shazam.** The endpoint is unofficial. Do not present it as an official integration.
- **Bandcamp human check.** Keep it answered by the DJ; the store bans circumventing site protections.
- **Remote code.** Clean. No `eval`, no remote scripts, `executeScript` only runs packaged files and functions, shazamio WASM is bundled. Answer "No, I am not using remote code."
- **UTM.** Not affiliate links, so affiliate rules do not apply. If an affiliate code is ever added, it needs prominent disclosure and a user action before each use.

## Dashboard checklist

- [ ] Developer account: one-time registration fee and 2-Step Verification (required).
- [ ] Package: `cd extension && npm run zip`.
- [ ] Store icon: 128x128 PNG in the zip. Artwork about 96x96 with 16 px transparent padding per side, no edge, readable on light and dark backgrounds.
- [ ] Small promo tile: 440x280 (required).
- [ ] Screenshots: 1280x800 (or 640x400), at least 1, ideally 5, full bleed, square corners.
- [ ] Marquee: 1400x560 (optional, needed for featuring).
- [ ] Privacy tab:
  - Single purpose description.
  - One justification per permission plus host permissions (the comments in `wxt.config.ts` are a good start).
  - Remote code: No.
  - Data categories, probably: website content (mix pages), authentication information (Dizko OAuth token), user activity (analytics, opt-in). Must match the privacy policy exactly; contradictions are grounds for removal.
  - Limited Use certifications.
  - Privacy policy URL.
- [ ] Test instructions: a public SoundCloud mix URL; note that carting needs the reviewer's own Beatport login.
- [ ] Distribution: visibility and regions. Consider unlisted first.
- [ ] Untick publish automatically if you want to control launch timing; after approval there are 30 days to publish.

## Sources

- Program policies: https://developer.chrome.com/docs/webstore/program-policies/policies
- MV3 requirements: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- Privacy tab: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Images: https://developer.chrome.com/docs/webstore/images
- Publish: https://developer.chrome.com/docs/webstore/publish
- Manifest version: https://developer.chrome.com/docs/extensions/reference/manifest/version
- Manifest key: https://developer.chrome.com/docs/extensions/reference/manifest/key
