/**
 * npx tsx tools/render-bench-run.ts [--quick] [--require-fps]
 * Exits 1 when the bench fails or a behaviour gate (aggregation rule, reduced motion) fails; with
 * --require-fps also when 60 fps is not reached at neighborhood zoom (needs a real GPU).
 *
 * Headless renderer bench (P1.5): starts the Vite dev server on :4176, opens
 * /tools/render-bench.html in Playwright Chromium with the same GPU flags as playwright.config.ts
 * (SwiftShader WebGL), at 1440×900, 360×800 and 360×800 @2x, waits for window.__bench and prints
 * one JSON document with the machine context (nproc, load average, GPU string). The server is
 * stopped by port afterwards. `--quick` shortens every window for a smoke run.
 *
 * SwiftShader is a software rasterizer: numbers from a shared CI/Codespace box are a lower bound,
 * never a device measurement (see docs/reports/render-perf-g1.md).
 */
import { execSync, spawn } from 'node:child_process';
import { availableParallelism, cpus, loadavg } from 'node:os';
import { chromium } from '@playwright/test';
import { REPO_ROOT } from './lib/content-fs';

const PORT = 4176;
const BASE = `http://127.0.0.1:${PORT}`;
const GPU_ARGS = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'];
const quick = process.argv.includes('--quick');
const QUERY = quick ? '?warmup=1&measure=3&short=2' : '';

const VIEWPORTS: readonly { name: string; width: number; height: number; deviceScaleFactor: number }[] = [
  { name: 'desktop-1440x900', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'phone-360x800', width: 360, height: 800, deviceScaleFactor: 1 },
  { name: 'phone-360x800@2x', width: 360, height: 800, deviceScaleFactor: 2 },
];

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function stopServer(): void {
  sh(`lsof -t -i :${PORT} | xargs -r kill`);
}

async function waitForServer(timeoutMs: number): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch(`${BASE}/tools/render-bench.html`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`vite did not answer on ${BASE} within ${timeoutMs} ms`);
}

async function main(): Promise<void> {
  if (sh(`lsof -t -i :${PORT}`) !== '') throw new Error(`port ${PORT} is busy; stop that process first`);
  const machine = {
    nproc: Number(sh('nproc')) || availableParallelism(),
    cpuModel: cpus()[0]?.model ?? 'unknown',
    loadavgBefore: loadavg().map((v) => Math.round(v * 100) / 100),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    chromiumArgs: GPU_ARGS,
  };
  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  server.stdout.on('data', (d: Buffer) => (serverLog += d.toString()));
  server.stderr.on('data', (d: Buffer) => (serverLog += d.toString()));
  const runs: Record<string, unknown> = {};
  try {
    await waitForServer(120_000);
    const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
    try {
      for (const v of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: v.width, height: v.height },
          deviceScaleFactor: v.deviceScaleFactor,
        });
        const page = await context.newPage();
        const consoleErrors: string[] = [];
        page.on('console', (m) => {
          if (m.type() === 'error') consoleErrors.push(m.text());
        });
        page.on('pageerror', (e) => consoleErrors.push(e.message));
        const loadBefore = loadavg()[0]!;
        process.stderr.write(`[render-bench] ${v.name} …\n`);
        await page.goto(`${BASE}/tools/render-bench.html${QUERY}`);
        // Poll once a second: rAF polling would add work to every measured frame.
        await page.waitForFunction(
          () => (window as unknown as { __bench?: unknown }).__bench !== undefined,
          null,
          { timeout: 300_000, polling: 1000 },
        );
        const result = await page.evaluate(() => (window as unknown as { __bench?: unknown }).__bench);
        runs[v.name] = {
          viewport: v,
          loadavg1mBefore: Math.round(loadBefore * 100) / 100,
          loadavg1mAfter: Math.round(loadavg()[0]! * 100) / 100,
          consoleErrors,
          result,
        };
        await context.close();
      }
    } finally {
      await browser.close();
    }
  } catch (e) {
    process.stderr.write(`${serverLog}\n`);
    throw e;
  } finally {
    stopServer();
    server.kill();
  }
  const out = {
    tool: 'tools/render-bench-run.ts',
    date: new Date().toISOString(),
    quick,
    machine: { ...machine, loadavgAfter: loadavg().map((v) => Math.round(v * 100) / 100) },
    runs,
  };
  console.log(JSON.stringify(out, null, 2));
  const requireFps = process.argv.includes('--require-fps');
  const failures: string[] = [];
  for (const [name, run] of Object.entries(runs)) {
    const r = (run as { result?: { ok?: boolean; gates?: Record<string, boolean> } }).result;
    if (!r?.ok) {
      failures.push(`${name}: bench did not complete`);
      continue;
    }
    for (const [gate, pass] of Object.entries(r.gates ?? {})) {
      if (!pass && (gate !== 'fps60AtNeighborhood' || requireFps)) failures.push(`${name}: ${gate}`);
    }
  }
  if (failures.length > 0) {
    console.error(`render bench FAILED: ${failures.join('; ')}`);
    process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  stopServer();
  console.error(e);
  process.exit(1);
});
