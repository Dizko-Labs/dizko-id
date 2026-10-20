# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

WXT + TypeScript Chrome extension (Manifest V3), Chrome Web Store first; covers Arc, Brave and Edge. Firefox deferred. The existing Claude skill (SKILL.md, scripts/trackid.py) stays alongside it in this repo.

## Users

DJs who heard a set on YouTube, SoundCloud or Mixcloud and want to own its tracks to play out. They buy 10 to 40 tracks at once, mostly on Beatport, and the exact mix version matters (a named remix is a different record from the original).

## Product Purpose

On a mix page, one action turns the mix into a filled Beatport cart, falling back to Bandcamp, so the DJ reviews and presses Buy once. Success is the cart containing the right versions with nothing wrong added; misses are listed with search links rather than guessed.

## Positioning

It does the whole path in the user's own browser: reads the tracklist from the page when one exists, otherwise identifies tracks by fingerprinting the tab's audio, then adds exact versions to the user's own logged-in cart. No server, no account, no API key, no cost to the user.

## Operating Context

Runs on youtube.com, soundcloud.com and mixcloud.com tabs; acts on beatport.com and bandcamp.com in the user's logged-in session. Fingerprinting captures tab audio while seeking through the mix (roughly 12 s per 30 s slice), so an uncovered 1 hour mix takes about 20 to 25 minutes; description or comment tracklists are instant.

## Capabilities and Constraints

- Track ID uses Shazam's unofficial endpoint via the MIT shazamio-core signature code compiled to WebAssembly. Not an official API: it can break or be blocked, so recognition sits behind a swappable interface (AudD is the paid fallback).
- Neither Beatport nor Bandcamp offers a cart API or pre-filled cart links; carting is done by driving their pages. Page redesigns can break it.
- Never starts checkout, never touches payment details.
- Single-clip identifications are unconfirmed and are not carted until the user approves them.
- Matching: artist and title must match; a named remix is carted only as that remix; no covers, karaoke or tributes; prefer original releases over compilations.

## Evidence on Hand

Working Python reference implementation in scripts/trackid.py and matching rules in SKILL.md. Real Shazam tracklists in ~/code/ZakKrevitt/slsk-cli/lists/mixes for testing. No users, testimonials, metrics or press yet; do not invent any.

## Product Principles

- The user presses Buy. The extension only fills the cart.
- Right version or nothing: a wrong record in a DJ's cart is worse than a miss.
- Show what was not found as plainly as what was.
- Free and local: no server, account or key between the user and the result.
