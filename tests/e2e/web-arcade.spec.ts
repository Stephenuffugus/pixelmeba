/**
 * P4.11 Web and arcade build (BUILD_DIRECTIVE P4.11; ARCH §14; SPEC §17 'demo-scope'), on desktop and
 * phone-portrait. Each test serves a production build with tests/e2e/staticServer.ts and stops it by itself:
 *
 * (a) the normal build (E2E_OUTDIR, built by the Playwright web server) served from a subpath
 *     (/arcade/pixelmeba/ on 5283): online first load, the service worker takes control, then offline with
 *     the server stopped: Home renders, the Garden starts and runs, a save to a slot succeeds and reopens;
 *     every request is same-origin (ARCH §14 "No network requests at runtime other than same-origin");
 * (b) the same build inside an iframe on a host page: the Garden runs in the frame; 'pixelmeba:pause' pauses
 *     it; 'pixelmeba:resume' leaves it paused with Run available; other message shapes leave a running dish
 *     running; a visibilitychange to hidden pauses it;
 * (c) DEMO_MODE (VITE_DEMO_MODE=1 → tmp/dist-web-arcade-demo on 5383): the demo line on Home, the Play shelf
 *     holds only the Garden and What if?, Add Life lists exactly the five, no Explore/Lab toggle; a full save
 *     that needs absent content is refused with exactly one "Import failed: this dish needs the full version
 *     of Pixelmeba (it uses Dusk). Nothing changed." and the open demo dish's worker hash is unchanged; a
 *     demo export imports into the normal build; New Dish → Create opens the new dish in Explore (never the
 *     Lab) with Add Life's five, and the worker refuses Add Life of Dusk sent to it directly (fix round 1);
 * (d) the built index.html meets tools/deploy-arcade.mjs's three preconditions.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { PROTOCOL_VERSION } from '../../src/worker/protocol';
import { expectNoSeriousA11yViolations, seedSettings, tapViewport } from './helpers';
import { serveStatic, type StaticServer } from './staticServer';

test.use({ serviceWorkers: 'allow' });

const ROOT = join(import.meta.dirname, '..', '..');
const OUTDIR = join(ROOT, process.env.E2E_OUTDIR ?? 'dist');
const DEMO_OUTDIR = join(ROOT, 'tmp', 'dist-web-arcade-demo');
const ARCADE_PORT = 5283;
const DEMO_PORT = 5383;
const MOUNT = '/arcade/pixelmeba/';
const DEMO_LINE = 'This is the free Pixelmeba demo: the Garden, its three What if? ideas and five organisms.';

/** Wrap Worker so the test can speak the protocol (tests/e2e/lab-tools.spec.ts), following the open dish. */
async function watchWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { Worker: typeof Worker; __pm: { workers: Worker[]; dishId: string | null; next: number } };
    const Orig = w.Worker;
    w.__pm = { workers: [], dishId: null, next: 1_000_000_000 };
    w.Worker = class extends Orig {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        w.__pm.workers.push(this);
        this.addEventListener('message', (e: MessageEvent<{ type?: string; info?: { dishId: string } }>) => {
          const t = e.data?.type;
          if ((t === 'ready' || t === 'loaded' || t === 'whatIfStarted') && e.data.info) w.__pm.dishId = e.data.info.dishId;
        });
      }
    };
  });
}

async function workerHash(page: Page): Promise<string> {
  return page.evaluate(async (protocolVersion) => {
    const pm = (window as unknown as { __pm: { workers: Worker[]; dishId: string | null; next: number } }).__pm;
    const worker = pm.workers[pm.workers.length - 1];
    if (!worker || !pm.dishId) throw new Error('no worker or dish yet');
    const requestId = pm.next++;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no hash reply')), 10_000);
      const on = (e: MessageEvent<{ type: string; requestId?: number; hash?: string; message?: string }>) => {
        if (e.data?.requestId !== requestId) return;
        worker.removeEventListener('message', on);
        clearTimeout(timer);
        if (e.data.type === 'hash' && e.data.hash) resolve(e.data.hash);
        else reject(new Error(e.data.message ?? e.data.type));
      };
      worker.addEventListener('message', on);
      worker.postMessage({ type: 'hash', requestId, dishId: pm.dishId, protocolVersion });
    });
  }, PROTOCOL_VERSION);
}

/** Send one command to the open dish through the worker protocol; resolves the ack's result and error. */
async function workerCommand(page: Page, payload: Record<string, unknown>): Promise<{ result: unknown; error: string | null }> {
  return page.evaluate(async ({ payload, protocolVersion }) => {
    const pm = (window as unknown as { __pm: { workers: Worker[]; dishId: string | null; next: number } }).__pm;
    const worker = pm.workers[pm.workers.length - 1];
    if (!worker || !pm.dishId) throw new Error('no worker or dish yet');
    const requestId = pm.next++;
    return new Promise<{ result: unknown; error: string | null }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no ack')), 10_000);
      const on = (e: MessageEvent<{ type: string; requestId?: number; result?: unknown; error?: string; message?: string }>) => {
        if (e.data?.requestId !== requestId) return;
        worker.removeEventListener('message', on);
        clearTimeout(timer);
        if (e.data.type === 'ack') resolve({ result: e.data.result ?? null, error: e.data.error ?? null });
        else reject(new Error(`${e.data.type}: ${e.data.message ?? ''}`));
      };
      worker.addEventListener('message', on);
      worker.postMessage({ type: 'command', requestId, dishId: pm.dishId, commandId: `probe-${requestId}`, payload, undoable: true, protocolVersion });
    });
  }, { payload, protocolVersion: PROTOCOL_VERSION });
}

/** Start the Garden from Home on whichever page or frame. */
async function startGardenIn(p: Page | Frame): Promise<void> {
  await p.getByTestId('home-play').click();
  await p.getByTestId('start-garden').click();
  await expect(p.getByTestId('dish-screen')).toBeVisible();
  await expect(p.getByTestId('sim-time')).toContainText('56 alive');
}

async function secondsIn(p: Page | Frame): Promise<number> {
  const t = await p.getByTestId('sim-time').innerText();
  const m = /^(?:(\d+):)?(\d+):(\d+)/.exec(t.trim());
  if (!m) throw new Error(`unparsable time ${t}`);
  return (Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3]);
}

/** Every one of the first `n` servers is closed even when the test fails part-way. */
async function closeAll(servers: (StaticServer | null)[]): Promise<void> {
  for (const s of servers) await s?.close().catch(() => undefined);
}

test('(a) the normal build, served from a subpath, plays offline after its first load; every request is same-origin', async ({ page, context }) => {
  test.setTimeout(300_000);
  expect(existsSync(join(OUTDIR, 'sw.js')), `${OUTDIR}/sw.js`).toBe(true);
  const origin = `http://127.0.0.1:${ARCADE_PORT}`;
  const requests: string[] = [];
  context.on('request', (r) => requests.push(r.url()));
  let server: StaticServer | null = await serveStatic({ root: OUTDIR, mount: MOUNT, port: ARCADE_PORT });
  try {
    await seedSettings(page, { showPrompts: false });
    await page.goto(server.url);
    await expect(page.getByRole('heading', { level: 1, name: 'Pixelmeba' })).toBeVisible();
    // The worker installs on the first load; it controls the page from the next load (no clientsClaim).
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect(async () => {
      if (!(await page.evaluate(() => navigator.serviceWorker.controller !== null))) await page.reload();
      expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)).toBe(`${server!.url}sw.js`);
    }).toPass({ timeout: 60_000 });
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope ?? null);
    expect(scope).toBe(server.url);

    // Offline: the server is stopped and the context has no network; the page comes from the precache.
    await server.close();
    server = null;
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Pixelmeba' })).toBeVisible();
    await startGardenIn(page);
    await page.getByTestId('run-toggle').click();
    await expect.poll(() => secondsIn(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
    await page.getByTestId('run-toggle').click();
    await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
    const moment = await page.getByTestId('sim-time').innerText();
    await page.getByTestId('more').click();
    await page.getByTestId('more-save').click();
    await page.getByTestId('save-confirm').click();
    await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Saved dishes' }).click();
    await page.locator('li[data-slot="slot1"]').getByRole('button', { name: 'Open' }).click();
    await expect(page.getByTestId('dish-screen')).toBeVisible();
    await expect(page.getByTestId('sim-time')).toHaveText(moment);
    await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  } finally {
    await context.setOffline(false);
    await closeAll([server]);
  }
  // ARCH §14: no request ever left the page's own origin (data: URLs are not requests to anywhere).
  const foreign = requests.filter((u) => !u.startsWith('data:') && new URL(u).origin !== origin);
  expect(foreign).toEqual([]);
  expect(requests.length).toBeGreaterThan(10);
});

test('(b) inside an iframe: the Garden runs; the host pauses it; resume leaves it paused with Run; hiding pauses it', async ({ page }) => {
  test.setTimeout(240_000);
  const host = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Arcade host</title>
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;display:block;width:100%;height:100%}</style></head>
<body><main><iframe id="game" title="Pixelmeba" src="${MOUNT}"></iframe></main></body></html>`;
  const server = await serveStatic({ root: OUTDIR, mount: MOUNT, port: ARCADE_PORT, pages: { '/host.html': host } });
  try {
    await seedSettings(page, { showPrompts: false });
    await page.goto(`http://127.0.0.1:${ARCADE_PORT}/host.html`);
    const frameEl = page.locator('#game');
    await expect(frameEl).toBeVisible();
    const frame = page.frame({ url: (u) => u.pathname.startsWith(MOUNT) })!;
    expect(frame).toBeTruthy();
    await expect(frame.getByRole('heading', { level: 1, name: 'Pixelmeba' })).toBeVisible();
    await startGardenIn(frame);
    const toggle = frame.getByTestId('run-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Pause');
    await expect.poll(() => secondsIn(frame), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);

    const post = (type: string) =>
      page.evaluate((t) => (document.getElementById('game') as HTMLIFrameElement).contentWindow!.postMessage({ type: t }, '*'), type);
    // The host's pause.
    await post('pixelmeba:pause');
    await expect(toggle).toHaveAttribute('aria-label', 'Run');
    const pausedAt = await secondsIn(frame);
    // The host's resume ends the host's pause but never runs the dish: it stays paused, with Run available.
    await post('pixelmeba:resume');
    await page.waitForTimeout(1500);
    await expect(toggle).toHaveAttribute('aria-label', 'Run');
    await expect(toggle).toBeEnabled();
    expect(await secondsIn(frame)).toBe(pausedAt);
    // The player runs it again. Another message shape does nothing: a pause with an extra field, a bare
    // string and a near-miss type leave the dish running (only the two exact shapes act).
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-label', 'Pause');
    await page.evaluate(() => {
      const w = (document.getElementById('game') as HTMLIFrameElement).contentWindow!;
      w.postMessage({ type: 'pixelmeba:pause', extra: 1 }, '*');
      w.postMessage('pixelmeba:pause', '*');
      w.postMessage({ type: 'pixelmeba:pause ' }, '*');
    });
    const runningAt = await secondsIn(frame);
    await expect.poll(() => secondsIn(frame), { timeout: 30_000 }).toBeGreaterThanOrEqual(runningAt + 2);
    await expect(toggle).toHaveAttribute('aria-label', 'Pause');
    // The frame's page going hidden pauses it (SPEC §14.2 "Backgrounding pauses").
    await frame.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(toggle).toHaveAttribute('aria-label', 'Run');
    await frame.evaluate(() => {
      delete (document as unknown as { visibilityState?: unknown }).visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(1000);
    await expect(toggle).toHaveAttribute('aria-label', 'Run'); // coming back never runs it
  } finally {
    await closeAll([server]);
  }
});

test('(c) DEMO_MODE: the demo scope, a refused full save (nothing changed) and a demo save the full build opens', async ({ page, context }) => {
  test.setTimeout(420_000);
  // Build the demo once per run (the same app, VITE_DEMO_MODE=1).
  const built = spawnSync('npx', ['vite', 'build', '--outDir', DEMO_OUTDIR, '--emptyOutDir'], { cwd: ROOT, env: { ...process.env, VITE_DEMO_MODE: '1' }, encoding: 'utf8' });
  expect(built.status, built.stderr).toBe(0);
  const demoServer = await serveStatic({ root: DEMO_OUTDIR, mount: '/', port: DEMO_PORT });
  const fullServer = await serveStatic({ root: OUTDIR, mount: MOUNT, port: ARCADE_PORT });
  try {
    // A full save that needs absent content, made in the normal build: the Garden with Dusk added.
    const full = await context.newPage();
    await watchWorker(full);
    await seedSettings(full, { showPrompts: false });
    await full.goto(fullServer.url);
    await startGardenIn(full);
    await full.getByTestId('action-addlife').click();
    await full.getByTestId('species-B03').click();
    await tapViewport(full, 0.5, 0.5);
    await expect(full.getByRole('status').filter({ hasText: /Added \d+ Dusk/ })).toBeVisible();
    await full.getByTestId('more').click();
    let download = full.waitForEvent('download');
    await full.getByTestId('more-export').click();
    const duskText = readFileSync(await (await download).path(), 'utf8');
    expect(duskText).toContain('"B03"');

    // The demo.
    await watchWorker(page);
    await seedSettings(page, { showPrompts: false });
    await page.goto(demoServer.url);
    await expect(page.getByTestId('demo-line')).toHaveText(DEMO_LINE);
    await expectNoSeriousA11yViolations(page);
    // Play: the Garden and its What if? link only.
    await page.getByTestId('home-play').click();
    await expect(page.getByTestId('start-garden')).toBeVisible();
    await expect(page.getByTestId('whatif-open')).toBeVisible();
    await expect(page.getByTestId('goal-choice')).toHaveCount(0);
    await expect(page.getByTestId('recipe-id-import')).toHaveCount(0);
    await expect(page.locator('main section.card')).toHaveCount(1);
    // What if?: the ideas, but no paired "Compare with Garden" run.
    await page.getByTestId('whatif-open').click();
    await page.getByTestId('whatif-choice-R-G3').click();
    await expect(page.getByTestId('whatif-start')).toBeVisible();
    await expect(page.getByTestId('whatif-pair')).toHaveCount(0);
    // Notebook: no Experiments tab (the demo has no experiments).
    await page.goto(demoServer.url);
    await page.getByTestId('home-notebook').click();
    await expect(page.getByTestId('notebook-tab-stories')).toBeVisible();
    await expect(page.getByTestId('notebook-tab-experiments')).toHaveCount(0);
    await page.goto(demoServer.url);
    await page.getByTestId('home-play').click();
    await page.getByTestId('start-garden').click();
    await expect(page.getByTestId('sim-time')).toContainText('56 alive');
    // Explore only; Add Life lists exactly the five.
    await expect(page.getByTestId('view-toggle')).toHaveCount(0);
    await page.getByTestId('action-addlife').click();
    const tiles = page.locator('.species-tile');
    await expect(tiles).toHaveCount(5);
    expect(await tiles.evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent ?? ''))).toEqual(['Sunbead', 'Sprinter', 'Recycler', 'Crumbsmith', 'Amoeba']);
    await page.getByTestId('action-addlife').click();
    // More: no Compare, no challenge editor.
    await page.getByTestId('more').click();
    await expect(page.getByTestId('action-compare')).toHaveCount(0);

    // Importing the full save: exactly one refusal, and the open dish is exactly as it was.
    const before = await workerHash(page);
    await page.locator('section.sheet input[type="file"]').setInputFiles({ name: 'dusk.pixelmeba', mimeType: 'application/json', buffer: Buffer.from(duskText) });
    const refusal = 'Import failed: this dish needs the full version of Pixelmeba (it uses Dusk). Nothing changed.';
    await expect(page.locator('.toast')).toHaveText(refusal);
    await expect(page.getByRole('status').filter({ hasText: 'Import failed' })).toHaveText(refusal);
    expect(await workerHash(page)).toBe(before);
    await expect(page.locator('.topbar .title strong')).toHaveText('Little Living Garden');
    await expectNoSeriousA11yViolations(page);

    // A demo export opens in the full build.
    if (!(await page.getByTestId('more-export').isVisible())) await page.getByTestId('more').click();
    await expect(page.getByTestId('more-export')).toBeVisible();
    download = page.waitForEvent('download');
    await page.getByTestId('more-export').click();
    const demoText = readFileSync(await (await download).path(), 'utf8');
    await full.goto(fullServer.url);
    await full.getByRole('button', { name: 'Saved dishes' }).click();
    await full.locator('input[type="file"]').first().setInputFiles({ name: 'demo.pixelmeba', mimeType: 'application/json', buffer: Buffer.from(demoText) });
    await expect(full.getByTestId('dish-screen')).toBeVisible();
    await expect(full.locator('.topbar .title strong')).toHaveText('Little Living Garden');
    await expect(full.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
    // The very world the demo exported (the full build ignores the demo scope; one save format).
    await expect.poll(() => workerHash(full)).toBe(before);
    await full.close();

    // New Dish in the demo (fix round 1; D09 line 209 "Explore controls"): Create opens the new dish paused
    // in Explore, never the Lab, with Add Life open and exactly the five; the worker refuses Dusk.
    await page.goto(demoServer.url);
    await page.getByTestId('home-new').click();
    await expect(page.getByTestId('new-dish-summary')).toBeVisible();
    await page.getByTestId('new-dish-start').click();
    const screen = page.getByTestId('dish-screen');
    await expect(screen).toBeVisible();
    await expect(screen).toHaveAttribute('data-view', 'explore');
    await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
    await expect(page.getByTestId('lab-bar')).toHaveCount(0);
    await expect(page.getByTestId('view-toggle')).toHaveCount(0);
    await expect(tiles).toHaveCount(5);
    expect(await tiles.evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent ?? ''))).toEqual(['Sunbead', 'Sprinter', 'Recycler', 'Crumbsmith', 'Amoeba']);
    await page.waitForTimeout(500); // the dish stays in Explore (no late switch to the Lab)
    await expect(screen).toHaveAttribute('data-view', 'explore');
    // The worker is the guard too: Add Life of Dusk sent straight to it is refused and changes nothing.
    const fresh = await workerHash(page);
    expect(await workerCommand(page, { kind: 'inoculate', speciesId: 'B03', x: 64, y: 64, radius: 3, count: 4 })).toEqual({
      result: null,
      error: 'Dusk needs the full version of Pixelmeba. Nothing changed.',
    });
    expect(await workerHash(page)).toBe(fresh);
    // One of the five is placed as usual.
    await page.getByTestId('species-A01').click();
    await tapViewport(page, 0.5, 0.5);
    await expect(page.getByRole('status').filter({ hasText: /Added \d+ Sunbead/ })).toBeVisible();
  } finally {
    await closeAll([demoServer, fullServer]);
  }
});

test("(d) the built index.html meets deploy-arcade.mjs's preconditions (normal and demo builds)", () => {
  for (const dir of [OUTDIR, DEMO_OUTDIR]) {
    if (dir === DEMO_OUTDIR && !existsSync(join(dir, 'index.html'))) continue; // built by (c)
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    expect(html.split('<meta charset="UTF-8" />').length - 1, dir).toBe(1);
    expect(html, dir).toMatch(/src="\.\/assets\/index-[^"]+\.js"/);
    expect(html.toLowerCase(), dir).not.toContain('<base');
    expect(html, dir).toContain('<link rel="manifest" href="./manifest.webmanifest">');
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8')) as Record<string, unknown>;
    expect(manifest).toMatchObject({ name: 'Pixelmeba', short_name: 'Pixelmeba', start_url: './', scope: './', display: 'standalone', background_color: '#14252D', theme_color: '#14252D' });
    const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
    expect(sw).not.toMatch(/\.map"/);
    // A new version waits until every Pixelmeba page has closed: no clientsClaim, and skipWaiting only inside the
    // plugin's SKIP_WAITING message hook, which the app never sends.
    expect(sw).not.toContain('clientsClaim');
    expect(sw.split('skipWaiting').length - 1).toBe(1);
    expect(sw).toContain('"SKIP_WAITING"===');
  }
});
