---
name: Mix to Cart
description: A DJ mix's tracklist set like a photocopied club flyer, toner on paper, with a highlighter for what is in the cart.
colors:
  paper: "#f2f0ea"
  ink: "#111111"
  toner-1: "#3a3a37"
  toner-2: "#66655f"
  toner-3: "#c9c6bd"
  pink: "#ff3d8b"
  on-pink: "#111111"
  highlight: "#f4ff3a"
  on-highlight: "#111111"
  miss: "#c41f17"
  press-tint: "color-mix(in oklab, #111111 8%, #f2f0ea)"
  paper-black-stock: "#121211"
  ink-black-stock: "#f1efe8"
  toner-1-black-stock: "#d3d0c7"
  toner-2-black-stock: "#a29f96"
  toner-3-black-stock: "#3b3a36"
  miss-black-stock: "#ff6a5e"
typography:
  display:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 900
    lineHeight: 0.95
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 62"
  headline:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 900
    lineHeight: 1.08
    fontVariation: "'wdth' 64"
  figure:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 900
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 75"
  title:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 900
    fontVariation: "'wdth' 75"
  title-small:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.08
    fontVariation: "'wdth' 90"
  action:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 800
  body:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.375
    fontFeature: "'tnum' 1"
  label:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  caption:
    fontFamily: "Archivo Variable, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
rounded:
  sm: "4px"
  md: "6px"
  full: "9999px"
spacing:
  hairline-gap: "4px"
  gap: "8px"
  row: "10px"
  section: "12px"
  gutter: "16px"
  break: "20px"
components:
  header-band:
    backgroundColor: "{colors.pink}"
    textColor: "{colors.on-pink}"
    typography: "{typography.display}"
    padding: "16px 16px 14px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
  button-outline:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 16px"
  button-outline-hover:
    backgroundColor: "{colors.press-tint}"
  button-ghost:
    textColor: "{colors.toner-2}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 8px"
  button-ghost-hover:
    backgroundColor: "{colors.press-tint}"
  checkbox:
    textColor: "{colors.paper}"
    backgroundColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    size: "16px"
  track-title-confirmed:
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
  track-title-unconfirmed:
    textColor: "{colors.ink}"
    typography: "{typography.title-small}"
  highlighter-mark:
    backgroundColor: "{colors.highlight}"
    textColor: "{colors.on-highlight}"
    padding: "0 2px"
  dropdown-menu:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px"
  dropdown-menu-item-focus:
    backgroundColor: "{colors.press-tint}"
    rounded: "{rounded.sm}"
  progress:
    backgroundColor: "{colors.toner-3}"
    rounded: "{rounded.full}"
    height: "6px"
---

# Design System: Mix to Cart

## Overview

**Creative North Star: "The Photocopied Club Flyer"**

The side panel reads like a flyer pasted on a club wall: toner black on off-white paper, one band of Day-Glo pink across the top, and the lineup set in heavy condensed type. The tracklist is billed the way a promoter bills a lineup. Tracks confirmed by more than one clip are set large and narrow; tracks heard only once drop to a small "Plus N unconfirmed" line beneath them. When a track lands in the cart, a fluoro highlighter swipes across its name.

Density is high and flat. Everything sits on one sheet of paper, divided by plain rules: a fine toner hairline between rows, a heavy ink rule wherever the sheet changes job (status to lineup, lineup to footer, the "Plus" line). There are no cards, no shadows and no tinted panels. Dark mode is the same flyer printed on black stock: paper and ink swap, the toner ramp inverts, and the pink band, highlighter and on-colour ink stay exactly as they are.

**Key Characteristics:**
- One self-hosted variable face, Archivo, worked across its width axis (62% to 100%) and weight (400 to 900); upright only.
- Type size carries confidence: confirmed tracks are billed large, unconfirmed ones small.
- Colour is semantic and scarce: pink is the header band, yellow means in your cart, red means a miss.
- Structure comes from rules, never from containers or elevation.
- Light paper and black stock follow the system colour scheme; no in-panel theme switch.

## Colors

A photocopy palette: two inks, a three-step toner ramp, and three fluorescent or alarm colours that each carry exactly one meaning.

### Primary
- **Day-Glo Pink** (pink): the header band behind the mix title and its meta line, edge to edge. On black stock it is also the focus ring. Text on it is always On-Pink Ink, which stays near-black in both themes (5.66:1).

### Secondary
- **Highlighter Yellow** (highlight): the highlighter swipe behind a carted track's name, and nothing else. Text on it is always On-Highlight Ink (17.28:1), in both themes.

### Tertiary
- **Miss Red** (miss, miss-black-stock): store outcomes that failed (Not found, Version not found, Album only, Needs login, Could not add) and error lines. Lightened on black stock so it holds 6.67:1.

### Neutral
- **Flyer Paper** (paper / paper-black-stock): the single page background. Also the text colour on the ink primary button.
- **Toner Ink** (ink / ink-black-stock): track names, headings, primary button fill, checkbox fill, outline button borders, the 2px structural rules, and the focus ring on paper.
- **Heavy Toner** (toner-1): artist names, secondary sentences such as "Now:" and login notes (10:1 on paper).
- **Mid Toner** (toner-2): timestamps, counts, the "Plus" line's explanation, ghost buttons, the Searching status (5.13:1 on paper, 7.08:1 on black stock).
- **Light Toner** (toner-3): row hairlines, the progress track, link underlines at rest, scrollbar thumb and text selection. Never used for text.
- **Press Tint** (press-tint): hover and menu-item focus fill, 8% ink mixed into paper.

### Named Rules
**The Highlighter Means Cart Rule.** Yellow appears only as the swipe on a carted track's name. Text selection is Light Toner, not yellow, so the mark never means anything else.

**The One Band Rule.** Pink is the header band. It never fills a button, colours text or tints a row. Its single other job is the focus ring on black stock, where ink would vanish.

**The Toner Only Rule.** Every neutral is paper, ink or one of the three toner steps. No other greys enter the panel.

**The Red Is a Miss Rule.** Red marks something that did not make it into the cart, or an error. It never decorates.

## Typography

**Display Font:** Archivo Variable (with system-ui, sans-serif)
**Body Font:** Archivo Variable (with system-ui, sans-serif)

**Character:** One grotesque stretched two ways. Compressed to its narrowest at black weight it becomes the flyer's lineup type; at normal width and semibold it becomes the small print. Width changes are set with font-stretch on the self-hosted wdth axis, never by swapping families.

### Hierarchy
- **Display** (900, 34px, 0.95, width 62%, -0.01em): the mix title in the pink band, clamped to three lines. Also the "Mix to Cart" name on the empty state.
- **Headline** (900, 23px, 1.08, width 64%): confirmed track names in the lineup.
- **Figure** (900, 20px, width 75%, tabular): the running counter in a long status ("38%", "4 of 16").
- **Title** (900, 19px, width 75%): the "Plus N unconfirmed" line.
- **Title Small** (600, 15px, 1.08, width 90%): unconfirmed track names.
- **Action** (800, 15px): primary button labels.
- **Body** (400, 14px, snug): status sentences and the empty state. Tabular figures are on for the whole panel.
- **Label** (600, 13px): header meta, artist names, store status at the right of a row, outline and ghost button labels.
- **Caption** (500 to 600, 12px): timestamps, store links, the "Plus" line's explanation, alternative versions.

### Named Rules
**The Billing Rule.** Confidence sets size. A confirmed track is Headline; an unconfirmed track is Title Small under the "Plus" line. Never bill an unconfirmed ID at headline size.

**The Narrow Names Rule.** Condensed widths (62% to 90%) belong to names and figures: the mix title, track names, the counter, the "Plus" line. Metadata, buttons and sentences stay at normal width.

**The Upright Only Rule.** No italic or oblique anywhere. Emphasis comes from weight, width and size. Labels and headings are sentence case.

## Layout

A single column filling the side panel (about 360 to 480px wide, full browser height), in five stacked bands: pink header, status section, a selection bar, the scrolling lineup, and a footer. Only the lineup scrolls; header, status and footer stay put.

The horizontal gutter is 16px everywhere. The status section and footer pad 12px vertically; track rows pad 10px; the selection bar is compact (6px). Inline gaps are 8px between buttons and 12 to 14px between meta items. The "Plus" line opens with a 20px break above it.

A track row is a three-column grid: a 22px checkbox column, a 42px timestamp column, then the content column with 8px gaps. The content column stacks the artist line (status flush right on the same line), the track name, an optional alternatives note, and the store links. Status shares the artist line so the name gets the full width.

### Named Rules
**The Rules Not Boxes Rule.** Rows are separated by a 1px Light Toner hairline. Sections that change job are separated by a 2px ink rule. Content is never grouped into cards, tiles or tinted panels.

## Elevation & Depth

Flat. Nothing in the panel casts a shadow, including the dropdown menu, which instead carries a 2px ink border to lift it off the paper. Depth is conveyed only by the pink band, the 2px ink rules, and the ink-filled primary button.

### Named Rules
**The Photocopy Is Flat Rule.** A photocopier cannot print a shadow. Overlays get a 2px ink border; nothing gets box-shadow, glow or blur.

## Shapes

Square content, slightly softened controls. Rows, bands, rules and the header are square-edged and full-bleed to the gutter. Interactive controls carry small corners: buttons and the menu at 6px, checkboxes and menu items at 4px. The progress bar is the one fully rounded form, a 6px-tall pill. Borders are either 1px (outline buttons, checkboxes, hairlines) or 2px (structural rules, menu).

## Components

### Buttons
Blunt and printed: a solid ink block for the one thing to do, an outlined ink frame for anything else.
- **Shape:** softened corners (6px).
- **Primary:** ink fill, paper text, Action type (800, 15px), 40px tall, full width or flex-filling. One per state: Identify tracks, Add N to cart, Open cart. Hover drops the fill to 90% ink.
- **Outline:** 1px ink border, transparent fill, ink text at 13 to 14px, medium to semibold, 36 to 40px tall. Used for Stop, the store chooser and Export tracklist. Hover fills with Press Tint.
- **Ghost:** no border or fill, Label type, Mid Toner for Start over and ink for Select all and Deselect all. Hover fills with Press Tint.
- **Focus:** 2px solid outline offset 2px, ink on paper, pink on black stock.
- **Disabled:** 50% opacity, no pointer events.

### Checkbox
- **Style:** 16px square, 4px corners, 1px ink border; checked fills ink with a paper check.
- **Locked:** while identifying or carting, checkboxes are disabled but keep full ink. They are not faded, because the ticks still report what is being sent.

### Dropdown Menu
- **Style:** paper fill, 2px ink border, 6px corners, 4px inner padding, no shadow.
- **Items:** 14px body text, 4px corners, Press Tint on focus. Radio items show a small filled dot for the current choice.

### Progress
- **Style:** 6px tall pill, Light Toner track, ink fill. Paired with a Figure counter right-aligned on the same line as the status label.

### Header Band
The flyer's masthead. Full-width pink, 16px padding (14px at the bottom), the mix title in Display, then a Label meta line (site, duration, track count, tracklist source) spaced 14px apart. Text is On-Pink Ink in both themes.

### Track Row and Lineup Billing
The signature component. Confirmed rows set the name in Headline; after a 2px ink rule and the "Plus N unconfirmed" Title, unconfirmed rows set it in Title Small with a Caption explaining they start unticked. Store links (Beatport, Bandcamp, Spotify, YouTube) are Caption links underlined in Light Toner, darkening to ink on hover, with a 3px underline offset. Store status sits at the right of the artist line in Label bold: price or "In cart" in ink, Searching in Mid Toner, misses in Miss Red.

### Highlighter Mark
A carted track's name gets a yellow band from 16% to 88% of the line box, wrapping cleanly across lines (box-decoration-break: clone), with 2px of bleed either side. It draws in left to right over 420ms on cubic-bezier(0.16, 1, 0.3, 1) when the track is carted, and appears instantly under reduced motion.

## Do's and Don'ts

### Do:
- **Do** bill confirmed tracks at Headline (900, 23px, width 64%) and unconfirmed ones at Title Small (600, 15px, width 90%) under a "Plus N unconfirmed" line.
- **Do** separate rows with a 1px Light Toner hairline and sections with a 2px ink rule.
- **Do** keep exactly one ink-filled primary button per state, in the status section.
- **Do** use the 2px focus outline with 2px offset: ink on paper, pink on black stock.
- **Do** keep On-Pink and On-Highlight text near-black (#111111) in both themes.
- **Do** keep disabled checkboxes at full ink while a job runs.

### Don't:
- **Don't** use yellow for anything except the carted-track highlighter, including text selection.
- **Don't** use pink outside the header band and the black-stock focus ring; pink on paper is under 3:1 (2.93:1), so it never carries text or focus there.
- **Don't** add box-shadow, glow or blur to anything, menus included.
- **Don't** group tracks or settings into cards, tiles or tinted panels.
- **Don't** introduce greys outside the three toner steps.
- **Don't** set italic or oblique type, all-caps labels, or a label above a heading.
