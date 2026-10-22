# Dizko ID: Chrome Web Store listing (draft, v0.1.0)

Paste-ready text for the dashboard. Keep it in step with the privacy policy (`www.dizko.app/privacy-policy.html#dizko-id`); the store removes listings whose privacy answers contradict the policy.

## Store listing

**Name:** Dizko ID

**Summary** (132 characters max):
Find every track in a SoundCloud DJ mix, see where the DJ plays next, and fill your Beatport or Bandcamp cart.

**Description:**

Open a DJ mix on SoundCloud and Dizko ID finds the tracks.

It reads the tracklist when the DJ wrote one, and otherwise listens to the mix itself. Each track shows its BPM, key and length, with a short preview to check it. Tick the ones you want and send them to your Beatport or Bandcamp cart in one go. Dizko ID never checks out: you review and pay in the store as usual.

You also see who the DJ is and where they play next, from Dizko's event listings. Every mix you open is saved to your library, with its DJs and the tracks you ticked.

Works with Beatport and Bandcamp. You need your own account on the store you buy from.

**Category:** Entertainment (alternative: Shopping)

**Language:** English

## Privacy tab

**Single purpose:**
Identify the tracks in a SoundCloud DJ mix the user opens, so they can add them to their own Beatport or Bandcamp cart.

**Permission justifications:**

- `sidePanel`: the extension's whole interface is a side panel beside the mix.
- `offscreen`: an offscreen document decodes short clips of the mix's audio with Web Audio and turns them into fingerprints (bundled WebAssembly); a service worker has no Web Audio.
- `scripting`: runs the extension's own packaged functions in a Beatport or Bandcamp tab. When the user presses a cart button, they search for the ticked tracks and add them to the user's cart. After a mix's tracks are found, a Beatport tab opened in the background looks each one up to show its BPM, key and length and link the exact release.
- `storage`: keeps the user's library of mixes, settings and Dizko sign-in token on their device.
- `unlimitedStorage`: the library (up to 50 mixes with their tracks and matches) can exceed the default quota, which would interrupt identification.

**Host permissions:**

- `soundcloud.com`, `api-v2.soundcloud.com`, `playback.media-streaming.soundcloud.cloud`: read the mix page the user opens and its audio stream; list a DJ's other mixes.
- `amp.shazam.com`: identify tracks from audio fingerprints.
- `www.beatport.com`, `*.bandcamp.com`: search and add the user's ticked tracks to their own cart, in their own session.
- `itunes.apple.com`: cover art, and finding Apple's short preview of a track.
- `mcp.dizko.app`: the DJ's profile and upcoming dates.

**Remote code:** No, I am not using remote code. (All JavaScript and the WebAssembly fingerprinter are packaged in the extension.)

**Data usage (tick these):**

- Website content: the SoundCloud mix page's title, description and audio fingerprints.

Leave unticked: authentication information, user activity, personally identifiable information, health, financial and payment, personal communications, location, web history.

**Certifications (tick all three):** not sold to third parties; not used for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.

**Privacy policy URL:** https://www.dizko.app/privacy-policy.html#dizko-id

## Test instructions for the reviewer

1. Open https://soundcloud.com/julianahuxtable/its-red-hot-sticks-sustain-yr and click the Dizko ID toolbar icon (or the green Dizko ID button beside Share on the page).
2. The side panel opens on the mix. Press Whole mix; tracks appear within a minute or two.
3. Tick tracks and press Add to Beatport or Add to Bandcamp. This needs the reviewer's own Beatport or Bandcamp login; nothing is purchased, the extension only adds to the cart.

## Images

In `store-assets/`, all from a real identification (Juliana Huxtable, GERMAN VISA PIPELINE (DEKMANTEL MIX 288), her real Dizko dates), composed by `store-assets/compose.mjs`:

- `promo-tile-440x280.png`: small promo tile (required).
- `screenshot-1-tracks.png`, `screenshot-2-dj-dates.png`, `screenshot-3-cart.png`, `screenshot-4-saved.png`: 1280x800, upload in this order.
- Store icon: the 128px icon inside the zip.
