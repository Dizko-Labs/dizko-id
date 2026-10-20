---
version: 1
slug: "extension-entrypoints-sidepanel-app-tsx"
primary_target: "extension/entrypoints/sidepanel/App.tsx"
related_targets: []
---

Scope: the Chrome side panel of the Mix to Cart extension (extension/entrypoints/sidepanel). Visitor mode: Operate.

Audience and task: a DJ on a YouTube, SoundCloud or Mixcloud mix page opens the panel, gets the mix's tracklist (from the description, or by letting the extension listen), ticks which unconfirmed IDs to include, sends them to Beatport and/or Bandcamp, and leaves with cart links and an exported tracklist. Constraints: about 360 to 480 px wide, full browser height; long running states (identifying can take 20 to 30 minutes); never starts checkout.

## Direction contract

THESIS: The mix's tracklist set like a party flyer's lineup: confirmed tracks billed large, unconfirmed ones in the small "plus" line, carted ones marked with highlighter. Refuses the default extension panel of grey rows, blue checkboxes and a progress ring.

OWN-WORLD: Photocopy toner black on off-white paper (black flyer stock in dark mode); one Day-Glo pink owns the header band; fluoro yellow is only ever a highlighter mark meaning "in your cart"; red only for misses. Archivo at narrow widths and heavy weights for track names, regular width for metadata. Plain rules between rows, no cards, no shadows, no rounded tiles.

STORY: The DJ sees at a glance what played, how sure each ID is, and what is already in the cart; they act once (send to cart) and leave with links and a file.

FIRST VIEWPORT: Pink header band with source and the mix title in heavy condensed type, then one status line with the single primary action, then the lineup list: time, artist, track name at a size set by confidence, status at right. Footer holds Open cart links and Export.

FORM: Photocopied club flyer, position 4 of 7 on the grounded list. Signature move: confidence sets type size (lineup billing), and carting draws a highlighter swipe across the track name. seed:3eca86c2ac10a73f

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Unresolved: dark-stock variant needs its own contrast check; real behavior of SoundCloud/Mixcloud players decides whether the "listening in real time" state is common.
