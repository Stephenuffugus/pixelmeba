import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
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

export default defineConfig({
  base: './',
  plugins: [preact()],
  resolve: { alias: aliases },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    assetsInlineLimit: 0,
  },
  server: { host: true },
});
