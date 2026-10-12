/**
 * P4.13 first minute and the diagnostics bar (UX §3.2 first minutes, §6.5, §7.1; UX §2 Settings
 * "diagnostics (opt-in)"; ARCH §13).
 *
 * The Garden opens paused with its arrival line. Settings → "Show performance numbers" puts a line under
 * the top strip with six readings (worker tick time, effective speed, snapshot time, frame rate, memory,
 * the renderer's detail level); it is part of the layout and never overlaps the dish. A feed on open
 * water changes the worker's state hash once; a refused spot shows its refusal and changes nothing (the
 * ring is drawn only for an accepted placement: tests/ui/placement-ring.test.ts). The state hash is read
 * from the worker through the protocol's read-only 'hash' request (watchWorker / workerHash, as in
 * lab-tools.spec.ts). Axe on the dish with the bar and on Settings; no sideways scroll at 200 % text.
 */
import { expect, test, type Page } from '@playwright/test';
import { PROTOCOL_VERSION } from '../../src/worker/protocol';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, seedSettings, startGarden, tapViewport } from './helpers';

/** Record the app's worker and its current dish id (from 'ready'/'loaded' replies). */
async function watchWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      Worker: typeof Worker;
      __pm: { workers: Worker[]; dishId: string | null; next: number };
    };
    const Orig = w.Worker;
    w.__pm = { workers: [], dishId: null, next: 1_000_000_000 };
    w.Worker = class extends Orig {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        w.__pm.workers.push(this);
        this.addEventListener('message', (e: MessageEvent<{ type?: string; info?: { dishId: string } }>) => {
          if ((e.data?.type === 'ready' || e.data?.type === 'loaded') && e.data.info) w.__pm.dishId = e.data.info.dishId;
        });
      }
    };
  });
}

/** The active dish's state hash, asked of the worker with the protocol's read-only 'hash' request. */
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

/**
 * The active dish's world state without its record of commands, from the protocol's read-only 'save'
 * request: every command the dish receives is recorded, refused or not (it takes the next command number,
 * world.commands.nextSeq, which stateHash covers, and a 'command' event in the event ring). Returns the
 * rest of the world as JSON, and the newest event's type.
 */
async function dishWithoutCommands(page: Page): Promise<{ dish: string; lastEvent: string | null; events: number }> {
  return page.evaluate(async (protocolVersion) => {
    const pm = (window as unknown as { __pm: { workers: Worker[]; dishId: string | null; next: number } }).__pm;
    const worker = pm.workers[pm.workers.length - 1];
    if (!worker || !pm.dishId) throw new Error('no worker or dish yet');
    const requestId = pm.next++;
    return new Promise<{ dish: string; lastEvent: string | null; events: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no save reply')), 10_000);
      const on = (e: MessageEvent<{ type: string; requestId?: number; json?: string; message?: string }>) => {
        if (e.data?.requestId !== requestId) return;
        worker.removeEventListener('message', on);
        clearTimeout(timer);
        if (e.data.type !== 'saved' || !e.data.json) return reject(new Error(e.data.message ?? e.data.type));
        const { commands: _commands, events, counters, ...dish } = JSON.parse(e.data.json) as {
          commands: unknown;
          events: { ring: { type: string }[] };
          counters: Record<string, unknown>;
        } & Record<string, unknown>;
        const { nextEventId: _next, ...rest } = counters;
        resolve({ dish: JSON.stringify({ ...dish, counters: rest }), lastEvent: events.ring.at(-1)?.type ?? null, events: events.ring.length });
      };
      worker.addEventListener('message', on);
      worker.postMessage({ type: 'save', requestId, dishId: pm.dishId, protocolVersion });
    });
  }, PROTOCOL_VERSION);
}

async function openSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
}

async function backToDish(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByTestId('home-continue').or(page.getByRole('button', { name: 'Continue' })).first().click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
}

test('first minute: paused arrival, the performance bar beside the dish, an accepted and a refused feed', async ({ page }) => {
  test.setTimeout(240_000);
  await watchWorker(page);
  await seedSettings(page, { showPrompts: true });
  await startGarden(page);

  // The Garden opens paused with its arrival line (UX §3.2).
  await expect(page.locator('.prompt p')).toHaveText('Press play and look closely.');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expect(page.getByTestId('diag-bar')).toHaveCount(0); // off by default

  // Settings → Show performance numbers (and no prompts over the dish for the taps below).
  await openSettings(page);
  const toggle = page.getByTestId('setting-show-performance');
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText('Tick time, speed, frame rate and memory, for bug reports. Off by default.')).toBeVisible();
  await toggle.check();
  await page.getByRole('checkbox', { name: 'Show gentle prompts' }).uncheck();
  await expectNoSeriousA11yViolations(page);
  await backToDish(page);

  // The bar: six readings, under the top strip, never over the dish.
  const bar = page.getByTestId('diag-bar');
  await expect(bar).toBeVisible();
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('diag-tick')).toHaveText(/^Tick \d+\.\d ms \(p95 \d+\.\d\)$/, { timeout: 30_000 });
  await expect(page.getByTestId('diag-speed')).toHaveText(/^Speed \d+\.\d× of [124]×$/);
  await expect(page.getByTestId('diag-snapshot')).toHaveText(/^Snapshot \d+\.\d ms$/);
  await expect(page.getByTestId('diag-fps')).toHaveText(/^\d+ fps$/);
  await expect(page.getByTestId('diag-memory')).toHaveText(/^Memory (\d+ MB|n\/a)$/);
  await expect(page.getByTestId('diag-level')).toHaveText(/^Detail [0-3]$/);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const top = (await page.locator('.topbar').boundingBox())!;
  const b = (await bar.boundingBox())!;
  const vp = (await page.getByTestId('viewport').boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(top.y + top.height - 1); // below the top strip
  expect(b.y + b.height).toBeLessThanOrEqual(vp.y + 1); // above the dish: no overlap
  expect(vp.height).toBeGreaterThan(100);
  // Text at least 16 px in the bar (at 100 % text).
  const px = await page.getByTestId('diag-tick').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(px).toBeGreaterThanOrEqual(16);
  await expectNoSeriousA11yViolations(page);

  // Feed on open water: "Added sugar to N cells." and the worker's state changes once.
  const h0 = await workerHash(page);
  await page.getByTestId('action-feed').click();
  await page.getByTestId('feed-choose').click();
  await tapViewport(page, 0.62, 0.3);
  await expect(page.locator('.toast', { hasText: /^Added sugar to \d+ cells\.$/ })).toBeVisible();
  const h1 = await workerHash(page);
  expect(h1).not.toBe(h0);
  expect(await workerHash(page)).toBe(h1); // paused: nothing else changed it

  // A refused spot (beyond the rim): the refusal, and nothing in the dish changed. (The refused command is
  // still recorded — the next command number, which stateHash covers, and a 'command' event — so the hash
  // itself moves; the rest of the world is identical.)
  const d1 = await dishWithoutCommands(page);
  await page.getByTestId('action-feed').click();
  await page.getByTestId('feed-choose').click();
  await tapViewport(page, 0.01, 0.01);
  await expect(page.locator('.toast', { hasText: "That can't go there: food can't go onto stone, a wall or beyond the rim. Tap open water." })).toBeVisible();
  const d2 = await dishWithoutCommands(page);
  expect(d2.dish).toBe(d1.dish);
  expect(d2.events).toBe(d1.events + 1);
  expect(d2.lastEvent).toBe('command');

  // 200 % text: the bar wraps; nothing scrolls sideways.
  await openSettings(page);
  await page.getByTestId('text-size-200').click();
  await backToDish(page);
  await expect(bar).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const wrap = await bar.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(wrap).toBeLessThanOrEqual(1);
  const b2 = (await bar.boundingBox())!;
  const vp2 = (await page.getByTestId('viewport').boundingBox())!;
  expect(b2.y + b2.height).toBeLessThanOrEqual(vp2.y + 1);
});
