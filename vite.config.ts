import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const r = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export const aliases = {
  '@sim': r('./src/sim'),
  '@ui': r('./src/ui'),
  '@render': r('./src/render'),
  '@persist': r('./src/persistence'),
  '@worker': r('./src/worker'),
  '@audio': r('./src/audio'),
  '@platform': r('./src/platform'),
  '@diag': r('./src/diagnostics'),
  '@content': r('./content'),
  '@art': r('./art'),
};

/** The promise line (CLAUDE.md), also the PWA manifest's description. */
const PROMISE = 'Grow a tiny living world. Change one thing. See what happens.';

/**
 * P4.11 (ARCH §14): the PWA manifest and a precache service worker (generateSW) for offline web play. The
 * page registers ./sw.js itself (src/platform/web.ts registerServiceWorker; injectRegister false). A new
 * version installs in the background and takes over when every Pixelmeba page has closed: no skipWaiting,
 * no clientsClaim, no prompt. Saves live in IndexedDB and are never cached or touched by the worker.
 */
const pwa = VitePWA({
  injectRegister: false,
  registerType: 'prompt',
  filename: 'sw.js',
  manifestFilename: 'manifest.webmanifest',
  includeManifestIcons: false,
  manifest: {
    name: 'Pixelmeba',
    short_name: 'Pixelmeba',
    description: PROMISE,
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#14252D',
    theme_color: '#14252D',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    // Every built js/css/html/png/json (the atlas and icons included); never a source map. The plugin adds
    // manifest.webmanifest itself (listing it here too would precache it twice).
    globPatterns: ['**/*.{js,css,html,png,json}'],
    globIgnores: ['**/*.map'],
    // Above the largest asset (the main bundle is about 0.9 MB; source maps are never precached).
    maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
    navigateFallback: 'index.html',
    cleanupOutdatedCaches: true,
    clientsClaim: false,
    skipWaiting: false,
    sourcemap: false,
  },
});

export default defineConfig({
  base: './',
  plugins: [preact(), pwa],
  resolve: { alias: aliases },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    assetsInlineLimit: 0,
  },
  server: { host: true },
});
