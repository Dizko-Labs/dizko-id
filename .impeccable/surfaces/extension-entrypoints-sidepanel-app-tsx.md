---
version: 1
slug: "extension-entrypoints-sidepanel-app-tsx"
primary_target: "extension/entrypoints/sidepanel/App.tsx"
related_targets: []
---

Scope: the Chrome side panel of the Mix to Cart extension (extension/entrypoints/sidepanel). Visitor mode: Operate.

Audience and task: a DJ on a YouTube, SoundCloud or Mixcloud mix page opens the panel, gets the mix's tracklist (from the description, or by letting the extension listen), ticks which unconfirmed IDs to include, sends them to Beatport and/or Bandcamp, and leaves with cart links and an exported tracklist. Constraints: about 360 to 480 px wide, full browser height; long running states (identifying can take 20 to 30 minutes); never starts checkout.

## Direction contract

Visual direction: Dizko design system (user's choice, 2026-10-21), replacing the earlier photocopied-flyer world. Intensity: restrained, Operate mode.

THESIS: Mix to Cart looks like part of Dizko: the same near-black ground, off-white type, one acid accent and pill controls, so a DJ moving between dizko.app and the panel stays in one world.

OWN-WORLD: Tokens from dizko.app's web theme (EventChat web/src/index.css and components/arc/dizko-theme.css): ground #080808, surface #111111, border #2D2D2B, text #F0F0EC / #A7A7A1 / #898985, acid #C4F236 with #0D0D0D on it; light system setting uses Dizko's light palette with deep acid #4E6B00 for acid text. Instrument Sans Variable, semibold with tight tracking for titles. Acid marks the primary action, ticks, progress and "in your cart". Thin dividers, no cards, no shadows. Dizko's uppercase buttons are not carried over: labels stay sentence case.

STORY: unchanged. The DJ sees what played, how sure each ID is, and what is in the cart; acts once; leaves with links and a file.

FIRST VIEWPORT: Library back link (16px with a 24px chevron), mix title and meta line; the DJ from Dizko (genres, base, next dates with party names, More on Dizko); the status line with the cart buttons; the tracklist with confirmed tracks larger than the "Plus N unconfirmed" line; playlists and Export at the foot.
