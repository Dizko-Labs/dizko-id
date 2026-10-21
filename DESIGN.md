---
name: Dizko ID
description: A DJ mix's tracklist in Dizko's world, near-black ground, off-white type and one acid accent that means act now or in your cart.
colors:
  paper: "#080808"
  surface: "#111111"
  ink: "#f0f0ec"
  toner-1: "#a7a7a1"
  toner-2: "#898985"
  toner-3: "#2d2d2b"
  acid: "#c4f236"
  acid-hover: "#d4f75f"
  on-acid: "#0d0d0d"
  acid-text: "#c4f236"
  miss: "#f87171"
  focus: "#c4f236"
  paper-light: "#ecece6"
  surface-light: "#deded7"
  ink-light: "#0d0d0d"
  toner-1-light: "#45453f"
  toner-2-light: "#6f6f68"
  toner-3-light: "#c4c4bc"
  acid-text-light: "#4e6b00"
  miss-light: "#c0392b"
  focus-light: "#0d0d0d"
typography:
  display:
    fontFamily: "Instrument Sans Variable, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Instrument Sans Variable, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Instrument Sans Variable, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
    fontFeature: "'tnum' 1"
  title-small:
    fontFamily: "Instrument Sans Variable, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  track-small:
    fontFamily: "Instrument Sans Variable, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.08
  body:
    fontFamily: "Instrument Sans Variable, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.375
    letterSpacing: "-0.005em"
    fontFeature: "'tnum' 1"
  label:
    fontFamily: "Instrument Sans Variable, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  caption:
    fontFamily: "Instrument Sans Variable, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  status:
    fontFamily: "Instrument Sans Variable, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
rounded:
  mark: "3px"
  check: "4px"
  sm: "10px"
  md: "12px"
  full: "9999px"
spacing:
  hairline-gap: "4px"
  gap: "8px"
  row: "10px"
  section: "12px"
  gutter: "16px"
  break: "20px"
components:
  button-primary:
    backgroundColor: "{colors.acid}"
    textColor: "{colors.on-acid}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    height: "40px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "color-mix(in oklab, #c4f236 90%, transparent)"
  button-outline:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    height: "36px"
    padding: "0 16px"
  button-outline-hover:
    backgroundColor: "{colors.surface}"
  button-ghost:
    textColor: "{colors.toner-2}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    height: "32px"
    padding: "0 8px"
  button-ghost-hover:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  checkbox:
    rounded: "{rounded.check}"
    size: "16px"
  checkbox-checked:
    backgroundColor: "{colors.acid}"
    textColor: "{colors.on-acid}"
    rounded: "{rounded.check}"
    size: "16px"
  input:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "4px 12px"
  dropdown-menu:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px"
  dropdown-menu-item-focus:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sm}"
  progress:
    backgroundColor: "{colors.toner-3}"
    rounded: "{rounded.full}"
    height: "6px"
  progress-fill:
    backgroundColor: "{colors.acid}"
  tabs-trigger:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "40px"
  track-title-confirmed:
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
  track-title-unconfirmed:
    textColor: "{colors.ink}"
    typography: "{typography.track-small}"
  highlighter-mark:
    backgroundColor: "{colors.acid}"
    textColor: "{colors.on-acid}"
    rounded: "{rounded.mark}"
    padding: "0 3px"
  notice-band:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    padding: "10px 16px"
  launcher-button:
    backgroundColor: "{colors.acid}"
    textColor: "{colors.on-acid}"
    rounded: "{rounded.full}"
    padding: "0 12px 0 10px"
  launcher-button-hover:
    backgroundColor: "{colors.acid-hover}"
---

# Design System: Dizko ID

## Overview

**Creative North Star: "Part of Dizko"**

The side panel is a room inside Dizko. It uses dizko.app's web theme as its token source (EventChat web/src/index.css and components/arc/dizko-theme.css): a near-black ground, off-white type in three steps, one hairline border colour and a single acid green. A DJ moving between dizko.app and the panel should not notice a seam. Restraint is the register: this is an Operate surface the DJ keeps open for 20 to 30 minutes while a mix is identified, so it stays quiet and lets the tracklist carry the page.

Density is high and flat. Everything sits on the one ground, divided by 1px hairlines in the border colour; there are no cards, no tinted panels and no shadows. Acid is reserved for meaning: the one filled action, ticked boxes, listening progress, and the marker swiped across a track that is in the cart. Dark is the default, as on dizko.app. A light system setting swaps to Dizko's light palette, and every acid fill keeps its near-black text in both themes.

The tracklist keeps the lineup billing from the previous world: tracks confirmed by more than one clip are set larger than single-clip IDs, which sit beneath a "Plus N unconfirmed" heading and start unticked.

**Key Characteristics:**
- One self-hosted variable face, Instrument Sans, semibold with tight tracking for titles; upright only, sentence case only.
- Acid means act or carted; it never decorates.
- Hairline rules, not boxes. Flat, no elevation.
- Pill buttons, softly rounded fields and menus (12px), small square checkboxes (4px).
- Dark default, light variant from the system setting.

## Colors

Near-black and off-white with one acid green; colour is semantic and scarce.

### Primary
- **Dizko Acid** (acid): fill of the primary button, the in-your-cart marker and the SoundCloud page button in both themes; checked checkboxes and the listening progress fill on dark only. On light, acid barely separates from the paper, so checked boxes are ink with an acid check and the progress fill is Dizko's deep acid #4e6b00.
- **Acid Ink** (on-acid): the near-black text and check glyph on every acid fill, in both themes.
- **Acid Lift** (acid-hover): the SoundCloud page button's hover fill only. The panel's primary button hovers to 90% acid instead.

### Neutral
- **Ground** (paper; paper-light in light mode): the page. Dizko's dark background; in light mode Dizko's paper tone.
- **Surface** (surface; surface-light): hover fill for outline and ghost buttons, the dropdown menu's fill, the redirect URI well in the connect form.
- **Text** (ink; ink-light): titles, track names, primary links, ghost buttons on hover.
- **Secondary Text** (toner-1; toner-1-light): artist names, meta and explanatory lines, DJ genres and venues.
- **Tertiary Text** (toner-2; toner-2-light): timestamps, counts, "Searching", quiet actions such as Stop, Remove and Scan again, and the borders of outline buttons, checkboxes and inputs.
- **Hairline** (toner-3; toner-3-light): every divider, the default border, link underlines at rest, the progress track, scrollbar thumb and text selection.

### Status
- **Miss** (miss; miss-light): errors and failed store actions ("Could not add", "Needs login") only. A store not stocking a record is information and stays in Tertiary Text.

### Named Rules
**The Acid Means Something Rule.** Acid appears only on the primary action, a ticked box, listening progress, the carted-track marker and the SoundCloud launcher. Text selection uses the hairline colour so acid is never ambient.

**The Ink On Acid Rule.** Anything filled with acid carries Acid Ink text, in dark and light alike.

## Typography

**Display Font:** Instrument Sans Variable (with Helvetica Neue, Helvetica, Arial, sans-serif)
**Body Font:** Instrument Sans Variable (same stack)

**Character:** one neutral grotesque, the same face dizko.app uses for UI and headlines. Hierarchy comes from size, weight (400 to 700) and negative tracking, never from case or slant. Numerals are tabular throughout so timestamps, counts and the progress percentage do not jitter.

### Hierarchy
- **Display** (600, 26px, 1.05, -0.03em): the mix title in the header (up to three lines) and the "Dizko ID" name on the library view.
- **Headline** (600, 19px, 1.08, -0.02em): confirmed track names.
- **Title** (600, 18px, 1.15, -0.02em): mix titles in the library list and the listening percentage. The DJ name in the Dizko block sits beside it at 17px.
- **Title Small** (600, 16px, 1.2, -0.01em): the "Plus N unconfirmed" heading and track names in the Tracks tab.
- **Track Small** (500, 15px, 1.08): unconfirmed track names. Empty and reading states use 15px regular in Secondary Text.
- **Body** (400, 14px, 1.375, -0.005em): sentences in the status section, button labels (set to 600 on buttons).
- **Label** (600, 13px): artist lines, header meta, section labels such as "Playlist of the N ticked", tabs, ghost buttons at 13px regular.
- **Caption** (500, 12px): store links, timestamps, notes such as "Available:" and "did not have".
- **Status** (700, 12px): the store status at the right of each artist line.

### Named Rules
**The Billing Rule.** Confirmed tracks are set at Headline; single-clip IDs drop to Track Small under the Title Small "Plus N unconfirmed" heading. Size carries confidence.

**The Sentence Case Rule.** Dizko's uppercase buttons are not carried over. Every label, button, tab and heading is sentence case and upright.

## Layout

A single column for a 360 to 480px side panel at full browser height. A 16px gutter on both sides. Sections stack header, optional notice band, the Dizko DJ block, the status section (12px vertical padding, 10px between its lines), the tick bar, the scrolling tracklist, playlists, and the export footer. Only the tracklist (or the library tab content) scrolls; header and footer stay put.

Track rows are a three-column grid: a 22px checkbox column, a 42px timestamp column and a fluid content column, with 8px gaps and 10px vertical padding. The content column stacks the artist line (status flush right on the same line), the track name, an optional alternatives note and the store links (12px apart). Paired actions (the two cart buttons) share a two-column grid; the three playlist services share a three-column grid, both with 8px gaps. Upcoming Dizko dates use a 76px date column beside the event.

### Named Rules
**The Rules Not Boxes Rule.** Rows and sections are separated by a 1px hairline. Content is never grouped into cards, tiles or tinted panels.

## Elevation & Depth

Flat. Nothing in the panel casts a shadow, including the dropdown menu. Depth comes only from the Surface fill on hover and in the menu, and from the inverted notice band. Dizko's web theme defines shadow tokens; this surface deliberately uses none of them.

### Named Rules
**The One Plane Rule.** No box-shadow, glow or blur on anything. A raised element is told apart by fill, not by depth.

## Shapes

Round controls on a square page. Rows, sections and rules are square-edged and run to the gutter. Buttons and the SoundCloud launcher are full pills. Fields and the dropdown menu take Dizko's control radius (12px), menu items 10px, checkboxes a small 4px square, and the carted-track marker 3px. Borders are 1px. The progress bar is a 6px pill.

## Components

### Buttons
Dizko pills, sentence case.
- **Shape:** full pill.
- **Primary:** acid fill, Acid Ink text, 14 to 15px semibold, 40px tall, full width or filling its grid cell. One per state: Try again, Beatport (N) under the Purchase label, Save and make playlist. Hover drops to 90% acid.
- **Outline:** 1px Tertiary Text border, transparent fill, Text label at 13 to 14px semibold, 36 to 40px tall. Used for Bandcamp (N), the playlist services and Export tracklist. Hover fills with Surface. A finished playlist becomes an outline link with an up-right arrow.
- **Ghost:** no border or fill, 13px, Tertiary Text for Cancel and Scan again, Text for Select all and Deselect all. Hover fills with Surface and turns Text.
- **Focus:** 2px solid outline offset 2px in the focus colour: acid on dark, Text on light.
- **Disabled:** 50% opacity, no pointer events.

### Text actions and links
Underlined links use a Hairline underline that darkens to Text on hover, 2 to 3px offset. Quiet actions (Stop, Remove, the "From" line in Tracks) are plain Tertiary Text that turns Text and underlines on hover.

### Checkbox
- **Style:** 16px, 4px corners, 1px Tertiary Text border; checked fills acid with an Acid Ink check.
- **Locked:** while carting, checkboxes are disabled and keep their full colour, because the ticks still report what is being sent.

### Inputs
- **Style:** 36px tall, 12px corners, 1px Tertiary Text border, transparent fill, 14px text, placeholder in Tertiary Text.
- **Focus:** border turns acid, plus the global focus outline.

### Tabs
The library's Mixes, Artists and Tracks tabs use the line variant: 40px row, 20px apart, 14px semibold labels at 60% Text, the active tab in full Text with a 2px Text underline. The tab row sits on a hairline.

### Dropdown Menu
- **Style:** Surface fill, 12px corners, 4px inner padding, no shadow. Items are 14px with 10px corners and a Surface focus fill.
- **Drift:** the shipped menu still carries a 2px Text border left over from the previous world. It is not part of this system; menus take no border beyond the default 1px hairline, or none.

### Progress
- **Style:** 6px pill, Hairline track, acid fill. Paired with the Title-size percentage right-aligned on the "Listening" line, beside a Stop action.

### Notice Band
When the active tab holds a different mix during a run, a full-width inverted band (Text fill, Ground text, Label type) explains the switch with an underlined "Switch" at the right. It is the only inverted element.

### Dizko DJ Block
The DJ behind the mix: name at 17px semibold linking to Dizko, genres and base city in Secondary Text, "More on Dizko", then the next dates (date column plus party name and city, venue). An unclaimed page adds a "Claim this page" line in Caption.

### Track Row and Lineup Billing
The signature component. See The Billing Rule. Store status sits at the right of the artist line in Status type: "In cart" and "In playlist" in Text, Searching and not-stocked messages in Tertiary Text, failures in Miss. Store links (Beatport, Bandcamp, Spotify, YouTube) are Caption links.

### In Your Cart Marker
A carted track's name gets an acid band from 12% to 92% of the line box with Acid Ink text, 3px bleed either side and 3px corners, wrapping cleanly across lines. It draws in left to right over 420ms on cubic-bezier(0.16, 1, 0.3, 1) (Dizko's enter easing) when the track is carted, and appears instantly under reduced motion. Used in the tracklist and the Tracks tab.

### SoundCloud Launcher
A "Dizko ID" pill with a cart glyph, appended after the last button in SoundCloud's own action row: on a track page (14px text, height from SoundCloud's Share button, minimum 28px) and on each single track in a listing such as a profile or stream (12px text, height from the row's first button, minimum 22px; albums and sets get none). Acid fill, Acid Ink semibold text in SoundCloud's page font, a full pill where SoundCloud's buttons are round and their corner radius where they are square, Acid Lift on hover, a 2px focus outline in the page's own text colour (acid could not be seen on SoundCloud's light page). If Chrome will not open the panel, the label changes to "Open from toolbar".

## Do's and Don'ts

### Do:
- **Do** take colour values from Dizko's web theme; dark values match dizko.app's dark palette exactly.
- **Do** keep exactly one acid-filled primary button per state.
- **Do** separate rows and sections with a 1px hairline in the border colour.
- **Do** set Acid Ink text on every acid fill, in both themes.
- **Do** bill confirmed tracks at Headline and unconfirmed ones at Track Small under the "Plus N unconfirmed" heading.
- **Do** keep disabled checkboxes at full colour while a cart run is going.
- **Do** use the 2px focus outline with 2px offset: acid on dark, Text on light.

### Don't:
- **Don't** use acid outside the primary action, ticks, progress, the carted marker and the SoundCloud launcher; text selection stays neutral.
- **Don't** carry over Dizko's uppercase button labels; everything is sentence case.
- **Don't** add box-shadow, glow or blur, menus included.
- **Don't** group tracks or settings into cards, tiles or tinted panels.
- **Don't** colour a store's missing stock as an error; only failures use Miss.
- **Don't** set italic or oblique type, or put a label above a heading.
