import { defineConfig, devices } from '@playwright/test';

// Parallel runs (e.g. several agents) each set their own E2E_PORT and E2E_OUTDIR so builds and
// servers never collide; the defaults are the single-run setup.
const PORT = Number(process.env.E2E_PORT ?? 4173);
const OUTDIR = process.env.E2E_OUTDIR ?? 'dist';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: `test-results/${PORT}`,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `npx vite build --outDir ${OUTDIR} --emptyOutDir && npx vite preview --outDir ${OUTDIR} --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
  projects: [
    { name: 'phone-portrait', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 800 }, hasTouch: true } },
    { name: 'phone-landscape', use: { ...devices['Desktop Chrome'], viewport: { width: 800, height: 360 }, hasTouch: true } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
