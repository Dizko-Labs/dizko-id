import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'Dizko ID',
    description: 'Find every track in a SoundCloud DJ mix, see where the DJ plays next, and fill your Beatport or Bandcamp cart.',
    // no tabs: host permissions already show the URL of SoundCloud, Beatport and Bandcamp tabs, the only ones read.
    // no tabCapture in the SoundCloud-only release (SoundCloud is heard from its own stream); YouTube brings it back.
    // unlimitedStorage: the saved library (50 mixes with their matches) can outgrow the 10 MB default mid-listen.
    // identity, api.dizko.app and us.i.posthog.com return with Link to Dizko and usage sharing (DIZKO_LINK, ANALYTICS_ON)
    permissions: ['sidePanel', 'offscreen', 'scripting', 'storage', 'unlimitedStorage'],
    host_permissions: [
      'https://soundcloud.com/*',
      'https://www.beatport.com/*',
      'https://*.bandcamp.com/*',
      'https://amp.shazam.com/*',
      // SoundCloud mixes are fingerprinted from their HLS segments
      'https://playback.media-streaming.soundcloud.cloud/*',
      // the DJ's upcoming dates and links, from Dizko's public endpoint
      'https://mcp.dizko.app/*',
      // a DJ's other SoundCloud mixes, for the artist page
      'https://api-v2.soundcloud.com/*',
      // cover art for tracks saved without it, and finding Apple's preview of a track
      'https://itunes.apple.com/*',
    ],
    action: { default_title: 'Dizko ID' },
    side_panel: { default_path: 'sidepanel.html' },
    // shazamio-core's fingerprinting runs as WebAssembly in the offscreen document
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
    web_accessible_resources: [],
  },
});
