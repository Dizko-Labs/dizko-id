import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'Mix to Cart',
    description: 'Find every track in a DJ mix and add them to your Beatport or Bandcamp cart.',
    permissions: ['sidePanel', 'tabCapture', 'offscreen', 'scripting', 'storage', 'tabs'],
    host_permissions: [
      'https://www.youtube.com/*',
      'https://soundcloud.com/*',
      'https://www.mixcloud.com/*',
      'https://www.beatport.com/*',
      'https://*.bandcamp.com/*',
      'https://amp.shazam.com/*',
      // SoundCloud mixes are fingerprinted from their HLS segments
      'https://playback.media-streaming.soundcloud.cloud/*',
    ],
    action: { default_title: 'Mix to Cart' },
    side_panel: { default_path: 'sidepanel.html' },
    // shazamio-core's fingerprinting runs as WebAssembly in the offscreen document
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
    web_accessible_resources: [],
  },
});
