/**
 * P4.7 journey (SPEC §13.6; D09 lines 135-139; D-0081): Garden → run 5 s → More → Try my dish… → 60 s,
 * Free observation (checked by default) → Start: turn 1 opens paused at the same dish time with the
 * baseline's worker hash → Run at 4× until the horizon card → Keep this result (a named slot) → Another
 * turn opens turn 2 paused at the baseline time with the same hash → at its horizon Another turn asks to
 * discard first (Cancel keeps it) → Finish leaves the dish open → Saved dishes lists the kept turn.
 * No serious axe violations on the setup sheet and the horizon card; choices and buttons ≥ 48 px.
 */
import { expect, test, type Page } from '@playwright/test';
import { PROTOCOL_VERSION } from '../../src/worker/protocol';
import { chooseSpeed, expectNoSeriousA11yViolations, simSeconds, startGarden } from './helpers';

/** Wrap Worker (as tests/e2e/lab-tools.spec.ts does) and follow the open dish, including Try my dish turns. */
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
          if ((e.data?.type === 'ready' || e.data?.type === 'loaded' || e.data?.type === 'tryStarted') && e.data.info) w.__pm.dishId = e.data.info.dishId;
        });
      }
    };
  });
}

/** The open dish's state hash, asked of the worker with the read-only 'hash' request. */
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

async function expectPaused(page: Page): Promise<void> {
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
}

async function expectTargets(page: Page, selector: string): Promise<void> {
  for (const el of await page.locator(selector).all()) {
    if (!(await el.isVisible())) continue;
    expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
}

/** Run the turn at 4× until it pauses itself at its horizon and the card shows. */
async function runToHorizon(page: Page): Promise<void> {
  await page.getByTestId('run-toggle').click();
  await chooseSpeed(page, 4);
  await expect(page.getByTestId('try-horizon')).toBeVisible({ timeout: 150_000 });
  await expectPaused(page);
}

test('Try my dish: a baseline, two turns from it, keep, discard question, finish', async ({ page }) => {
  test.setTimeout(420_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await watchWorker(page);
  await startGarden(page);

  // Run about 5 s of dish time, then pause.
  await page.getByTestId('run-toggle').click();
  await expect.poll(() => simSeconds(page), { timeout: 60_000 }).toBeGreaterThanOrEqual(5);
  await page.getByTestId('run-toggle').click();
  await expectPaused(page);
  const t0 = await simSeconds(page);
  const h0 = await workerHash(page);

  // More → Try my dish…: the setup (a blocking panel), with its defaults.
  await page.getByTestId('more').click();
  await page.getByTestId('more-try').click();
  const setup = page.getByTestId('try-setup');
  await expect(setup).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Free observation/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^3:00 of dish time/ })).toBeChecked();
  await expect(page.getByTestId('try-goal-KEEP_SPRINTERS_GOING')).toBeVisible(); // fits 180 s
  await expect(page.getByLabel('What do you think will happen? (optional)')).toBeVisible();
  await expectTargets(page, '.try-sheet .goal-choice, .try-sheet .btn');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('try-length-60').click();
  await expect(page.getByRole('radio', { name: /^1:00 of dish time/ })).toBeChecked();
  await expect(page.getByTestId('try-goal-KEEP_SPRINTERS_GOING')).toHaveCount(0); // 180 s does not fit a 60 s turn
  await page.getByTestId('try-prediction').fill('More Sprinters near the sugar.');
  await page.getByTestId('try-start').click();

  // Turn 1: paused, at the same dish time, the same dish as the baseline (worker hash).
  await expect(page.getByTestId('try-badge')).toHaveText('Turn 1 · 1:00 left');
  await expect(setup).toHaveCount(0);
  await expectPaused(page);
  expect(await simSeconds(page)).toBe(t0);
  expect(await workerHash(page)).toBe(h0);
  await expect(page.locator('.topbar .title strong')).toHaveText('Little Living Garden (turn 1)');

  // Run at 4× until the horizon card.
  await runToHorizon(page);
  expect(await simSeconds(page)).toBe(t0 + 60);
  const card = page.getByTestId('try-horizon');
  await expect(page.getByTestId('try-reached')).toHaveText(`Turn 1 reached ${Math.floor((t0 + 60) / 60)}:${String((t0 + 60) % 60).padStart(2, '0')} of dish time.`);
  await expect(page.getByTestId('try-goal-line')).toHaveText('Free observation');
  await expect(page.getByTestId('try-events')).toContainText(/were recorded in this turn\./);
  await expect(page.getByTestId('try-prediction-note')).toContainText('Your prediction');
  await expect(page.getByTestId('try-prediction-note')).toContainText('More Sprinters near the sugar.');
  await expect(card).not.toContainText(/score/i);
  await expect(page.getByTestId('try-badge')).toHaveText('Turn 1 finished');
  await expectTargets(page, '.try-sheet .btn');
  await expectNoSeriousA11yViolations(page);

  // Keep this result: a normal named slot (the Garden itself was kept first, when the turn started).
  await page.getByTestId('try-keep').click();
  await expect(page.getByTestId('try-kept')).toHaveText(/^Kept in Slot \d+\.$/);
  await expect(page.getByTestId('try-keep')).toBeDisabled();

  // Another turn (kept: no question): turn 2 from the same baseline, paused, the same dish as turn 1's start.
  await page.getByTestId('try-another').click();
  await expect(page.getByTestId('try-badge')).toHaveText('Turn 2 · 1:00 left');
  await expect(card).toHaveCount(0);
  await expectPaused(page);
  expect(await simSeconds(page)).toBe(t0);
  expect(await workerHash(page)).toBe(h0);

  // Turn 2 at its horizon: Another turn asks to discard first; Cancel keeps the turn.
  await runToHorizon(page);
  await page.getByTestId('try-another').click();
  await expect(page.getByTestId('try-discard')).toContainText('Discard this turn? It has not been saved.');
  await expect(page.getByTestId('try-discard-confirm')).toHaveText('Discard turn');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('try-discard-cancel').click();
  await expect(page.getByTestId('try-discard')).toHaveCount(0);
  await expect(page.getByTestId('try-badge')).toHaveText('Turn 2 finished');

  // Finish: the dish stays open, paused, as an ordinary dish.
  await page.getByTestId('try-finish').click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('try-badge')).toHaveCount(0);
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expectPaused(page);
  expect(await simSeconds(page)).toBe(t0 + 60);

  // Saved dishes lists the kept turn.
  await page.getByTestId('more').click();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await expect(page.getByText('Little Living Garden (turn 1)').first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});
