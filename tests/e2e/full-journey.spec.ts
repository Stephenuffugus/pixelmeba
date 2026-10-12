/**
 * The v1.0 gate journey (BUILD_DIRECTIVE "v1.0 gate — evidence": Home → Garden → feed → inspect → pause →
 * undo → save → reload → What if? → compare → share; ARCH §16 'full-journey'), on the normal production
 * build, on desktop and phone-portrait:
 *
 * Home → Play → Garden Start (paused) → Run → Pause (the pre-feed moment's worker hash) → Feed one dose (the
 * accepted toast) → Look: inspect an organism (the inspector opens with its name) → Run → Pause → Undo
 * ("Undo rewinds time": the worker hash is the pre-feed moment's again) → Save to a slot → reload → Saved
 * dishes → Open: the same moment, paused (equal worker hash) → What if? → Start R-G3 "Dinner farther away"
 * (paused at 0:00) → What if? again → R-G3 → Compare with Garden (180 s) → Run at the fastest pacing → the
 * results ("this paired run" and its caveat) → a conclusion → Done: R-G3's own dish, paused at 0:00 → More →
 * Share: three labelled choices; Picture saves a 1080 × 1080 PNG; Close leaves the dish paused and unchanged.
 * Serious/critical axe violations: none at Home, the dish, the inspector, What if?, the results and Share.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { PROTOCOL_VERSION } from '../../src/worker/protocol';
import { expectNoSeriousA11yViolations, expectReachable, seedSettings, selectOrganism, simSeconds, tapViewport } from './helpers';

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
          if ((t === 'ready' || t === 'loaded' || t === 'whatIfStarted' || t === 'variantPairStarted') && e.data.info) w.__pm.dishId = e.data.info.dishId;
        });
      }
    };
  });
}

/** The open dish's state hash, by the protocol's read-only 'hash' request. */
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

const runToggle = (page: Page) => page.getByTestId('run-toggle');
const title = (page: Page) => page.locator('.topbar .title strong');

async function run(page: Page): Promise<void> {
  await runToggle(page).click();
  await expect(runToggle(page)).toHaveAttribute('aria-label', 'Pause');
}

async function pause(page: Page): Promise<void> {
  await runToggle(page).click();
  await expect(runToggle(page)).toHaveAttribute('aria-label', 'Run');
}

/** Scroll-and-retry, as the Play card can still grow after the first scroll on a phone (variants-paired.spec.ts). */
async function reachableAfterLayout(el: Locator): Promise<void> {
  await expect(async () => {
    await el.scrollIntoViewIfNeeded();
    await expect(el).toBeInViewport({ ratio: 0.9, timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expectReachable(el);
}

async function openWhatIfFromMore(page: Page): Promise<void> {
  await page.getByTestId('more').click();
  await expectReachable(page.getByTestId('more-whatif'));
  await page.getByTestId('more-whatif').click();
  await expect(page.getByTestId('whatif-sheet')).toBeVisible();
  await expect(page.getByTestId('whatif-plan')).toBeVisible();
}

/** A PNG's width and height from its IHDR chunk. */
function pngSize(path: string): [number, number] {
  const b = readFileSync(path);
  expect([...b.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('the full journey: Home → Garden → feed → inspect → pause → undo → save → reload → What if? → compare → share', async ({ page }) => {
  test.setTimeout(1_200_000);
  await watchWorker(page);
  await seedSettings(page, { showPrompts: false });

  // Home.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Pixelmeba' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Play → the Garden starts paused.
  await page.getByTestId('home-play').click();
  await reachableAfterLayout(page.getByTestId('start-garden'));
  await page.getByTestId('start-garden').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toHaveText(/^0:00 · 56 alive/);
  await expect(runToggle(page)).toHaveAttribute('aria-label', 'Run');
  await expectNoSeriousA11yViolations(page);

  // Run, then pause at the pre-feed moment.
  await run(page);
  await expect.poll(() => simSeconds(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await pause(page);
  const preFeedTime = await page.getByTestId('sim-time').innerText();
  const preFeed = await workerHash(page);

  // Feed one dose: the accepted toast.
  await page.getByTestId('action-feed').click();
  await page.getByTestId('feed-choose').click();
  await tapViewport(page, 0.62, 0.3);
  await expect(page.getByRole('status').filter({ hasText: /Added sugar to \d+ cells/ })).toBeVisible();
  expect(await workerHash(page)).not.toBe(preFeed);

  // Look: inspect an organism; the inspector opens with its name.
  await page.getByTestId('action-look').click();
  await selectOrganism(page);
  const heading = page.getByTestId('inspector').getByRole('heading', { level: 2 });
  await expect(heading).toHaveText(/(Sprinter|Crumbsmith|Recycler|Sunbead).*#\d+/);
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click();

  // Run on a little, pause, then Undo rewinds time to the moment before the feed.
  await run(page);
  await expect.poll(() => simSeconds(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(simSecondsOf(preFeedTime) + 1);
  await pause(page);
  const undo = page.getByRole('button', { name: 'Undo (rewinds time)' });
  await expect(undo).toHaveAttribute('title', 'Undo rewinds time');
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByRole('status').filter({ hasText: 'Undone' })).toBeVisible();
  await expect.poll(() => workerHash(page)).toBe(preFeed);
  await expect(page.getByTestId('sim-time')).toHaveText(preFeedTime);
  await expect(runToggle(page)).toHaveAttribute('aria-label', 'Run');

  // Save to a slot, reload the page, and open the same moment paused.
  await page.getByTestId('more').click();
  await expectReachable(page.getByTestId('more-save'));
  await page.getByTestId('more-save').click();
  await expectReachable(page.getByTestId('save-confirm'));
  await page.getByTestId('save-confirm').click();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.locator('li[data-slot="slot1"]').getByRole('button', { name: 'Open' }).click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toHaveText(preFeedTime);
  await expect(runToggle(page)).toHaveAttribute('aria-label', 'Run');
  expect(await workerHash(page)).toBe(preFeed);

  // What if? → R-G3 "Dinner farther away", started paused.
  await openWhatIfFromMore(page);
  await page.getByTestId('whatif-choice-R-G3').click();
  await expect(page.getByTestId('whatif-selected')).toContainText('Who reaches the food now?');
  await expectNoSeriousA11yViolations(page);
  await expectReachable(page.getByTestId('whatif-start'));
  await page.getByTestId('whatif-start').click();
  await expect(page.getByTestId('whatif-sheet')).toHaveCount(0);
  await expect(title(page)).toHaveText('Dinner farther away');
  await expect(page.getByTestId('sim-time')).toHaveText(/^0:00 · 56 alive/);
  await expect(runToggle(page)).toHaveAttribute('aria-label', 'Run');

  // Compare: the paired run (P4.5) — R-G3 beside the unchanged Garden for 180 s.
  await openWhatIfFromMore(page);
  await page.getByTestId('whatif-choice-R-G3').click();
  const pair = page.getByTestId('whatif-pair');
  await expectReachable(pair);
  await expect(pair).toHaveText('Compare with Garden (180 s)');
  await pair.click();
  await expect(page.getByTestId('compare-screen')).toHaveAttribute('data-status', 'setup');
  await expect(page.getByTestId('pair-setup')).toBeVisible();
  const runBtn = page.getByTestId('compare-run');
  await expectReachable(runBtn);
  await runBtn.click();
  await expect(page.getByTestId('compare-screen')).toHaveAttribute('data-status', /running|complete/);
  const fast = page.getByTestId('compare-speed-max');
  if (await fast.isVisible()) await fast.click();
  await expect(page.getByTestId('compare-results-title')).toBeVisible({ timeout: 900_000 });
  await expect(page.getByTestId('compare-results-title')).toHaveText('Dinner farther away vs Garden');
  await expect(page.getByTestId('compare-table')).toBeVisible();
  await expect(page.getByTestId('pair-label')).toHaveText('this paired run');
  await expect(page.getByTestId('pair-caveat')).toHaveText('One paired run is an illustration, not a general rule.');
  const cantTell = page.getByTestId('compare-conclusion-cantTell');
  await cantTell.scrollIntoViewIfNeeded();
  await cantTell.click();
  await expect(cantTell).toHaveAttribute('aria-checked', 'true');
  await expectNoSeriousA11yViolations(page);
  const done = page.getByTestId('compare-done');
  await expect(done).toHaveText('Done — open “Dinner farther away”');
  await done.click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(title(page)).toHaveText('Dinner farther away');
  await expect(page.getByTestId('sim-time')).toHaveText(/^0:00 · 56 alive/);
  await expect(runToggle(page)).toHaveAttribute('aria-label', 'Run');

  // Share: three labelled choices; Picture saves a 1080 × 1080 PNG; Close leaves the dish paused and unchanged.
  const beforeShare = await workerHash(page);
  await page.getByTestId('more').click();
  await expectReachable(page.getByTestId('more-share'));
  await page.getByTestId('more-share').click();
  const sheet = page.getByTestId('share-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('radio')).toHaveCount(3);
  for (const [name, line] of [
    ['Picture', 'a snapshot image; does not contain the living dish'],
    ['Starting recipe', 'the setup and seed; others can start the same dish'],
    ['Living dish', 'the full save; continue this exact world on a compatible build'],
  ]) await expect(sheet.getByRole('radio', { name: new RegExp(`^${name}`) })).toHaveAccessibleName(`${name} ${line}`);
  await expect(sheet.getByRole('radio', { name: /^Picture/ })).toBeChecked();
  await expectNoSeriousA11yViolations(page);
  const download = page.waitForEvent('download');
  await expectReachable(page.getByTestId('share-go'));
  await page.getByTestId('share-go').click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('pixelmeba-picture.png');
  expect(pngSize(await d.path())).toEqual([1080, 1080]);
  await page.getByTestId('share-close').click();
  await expect(sheet).toHaveCount(0);
  await expect(runToggle(page)).toHaveAttribute('aria-label', 'Run');
  await expect(page.getByTestId('sim-time')).toHaveText(/^0:00 · 56 alive/);
  expect(await workerHash(page)).toBe(beforeShare);
});

/** "1:05 · 56 alive" → 65. */
function simSecondsOf(text: string): number {
  const m = /^(?:(\d+):)?(\d+):(\d+)/.exec(text.trim());
  if (!m) throw new Error(`unparsable time ${text}`);
  return (Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3]);
}
