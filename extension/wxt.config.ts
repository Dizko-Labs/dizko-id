import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'Dizko ID',
    description: 'Find every track in a DJ mix and add them to your Beatport or Bandcamp cart.',
    permissions: ['sidePanel', 'tabCapture', 'offscreen', 'scripting', 'storage', 'tabs', 'identity'],
    host_permissions: [
      'https://www.youtube.com/*',
      'https://soundcloud.com/*',
      'https://www.mixcloud.com/*',
      'https://www.beatport.com/*',
      'https://*.bandcamp.com/*',
      'https://amp.shazam.com/*',
      // SoundCloud mixes are fingerprinted from their HLS segments
      'https://playback.media-streaming.soundcloud.cloud/*',
      // playlists through the DJ's own Spotify and SoundCloud developer apps
      'https://api.spotify.com/*',
      'https://accounts.spotify.com/*',
      'https://api.soundcloud.com/*',
      'https://secure.soundcloud.com/*',
      // the DJ's upcoming dates and links, from Dizko's public endpoint
      'https://mcp.dizko.app/*',
      // a DJ's other SoundCloud mixes, for the artist page
      'https://api-v2.soundcloud.com/*',
      // cover art for tracks saved without it
      'https://itunes.apple.com/*',
      // anonymous usage events, only after the DJ agrees
      'https://us.i.posthog.com/*',
      // linking to a Dizko account and importing taste
      'https://api.dizko.app/*',
    ],
    action: { default_title: 'Dizko ID' },
    side_panel: { default_path: 'sidepanel.html' },
    // shazamio-core's fingerprinting runs as WebAssembly in the offscreen document
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
    web_accessible_resources: [],
  },
});
