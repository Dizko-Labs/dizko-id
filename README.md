# mix-to-cart

An agent skill (Claude Code, or any tool that reads `SKILL.md`) that turns a DJ mix into a filled shopping cart.

Give it a SoundCloud, Mixcloud or YouTube link. It identifies every track with Shazam, shows you the list, then adds each confirmed track to your Beatport cart in your own browser, falling back to Bandcamp. You review the carts and press Buy yourself; the skill never checks out.

## Install

```bash
git clone https://github.com/ZakKrevitt/mix-to-cart ~/.claude/skills/mix-to-cart
```

Then the three command-line tools it needs:

| OS | Command |
|----|---------|
| macOS | `brew install uv yt-dlp ffmpeg` |
| Debian / Ubuntu | `sudo apt install ffmpeg yt-dlp`, then uv from [docs.astral.sh/uv](https://docs.astral.sh/uv/) |
| Windows | `winget install astral-sh.uv yt-dlp.yt-dlp Gyan.FFmpeg` |

Python and the Shazam library are fetched by `uv` on first run; nothing else to install.

Install the [Claude in Chrome](https://claude.com/chrome) extension and log in to beatport.com and bandcamp.com in that browser.

## Use

> Cart the tracks from https://soundcloud.com/...

Or run just the ID step:

```bash
uv run scripts/trackid.py "https://soundcloud.com/..." --json tracks.json
```

## Why a browser and not an API

Neither store offers a public cart API. Beatport's catalog API is read-only, and Bandcamp's developer API covers label merch orders only. So the skill drives the same pages you would, in your logged-in session, and stops at the cart.

## Limits

- Shazam misses unreleased IDs, edits and heavily layered blends. Tracks heard in only one clip are flagged for you to confirm.
- Beatport and Bandcamp may change their page layouts; the skill reads pages by text, which tolerates most redesigns.
- Respect each store's terms. This automates adding to cart at human pace; it does not scrape catalogs or buy anything.

## License

MIT
