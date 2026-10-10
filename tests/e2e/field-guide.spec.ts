/**
 * P3.8 Field Guide journeys (UX §5.7, §2 blocking panels, §4.2 '/' search, §9; D-0039):
 * - Home → Field Guide, Back → Home;
 * - from a running dish, More → Field Guide pauses it (the UI sends setSpeed 0 and the world stops) and
 *   Back restores its speed (4×);
 * - '/' then "vel" → Velvet with General biology, Rules of this game and its predators;
 * - Materials → Salt says "No additional modeled reaction."; Structures & tools → Sample shows
 *   Changes / Does not change / Watch for;
 * - a Lab dish with Recyclers and a debris dose, run at 4×, until the Recycler entry shows
 *   "Seen in your dishes" and its badge;
 * - axe clean; body text ≥ 16 px; 48 px targets; at 200 % text nothing scrolls sideways.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { PROTOCOL_VERSION } from '../../src/worker/protocol';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings, startGarden } from './helpers';

const SLOW = 300_000;

/** Wrap Worker: remember the dish id and every setSpeed the UI sends (the e2e app has no test hook). */
async function watchWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { Worker: typeof Worker; __pm: { workers: Worker[]; dishId: string | null; next: number; speeds: number[] } };
    const Orig = w.Worker;
    w.__pm = { workers: [], dishId: null, next: 1_000_000_000, speeds: [] };
    w.Worker = class extends Orig {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        w.__pm.workers.push(this);
        this.addEventListener('message', (e: MessageEvent<{ type?: string; info?: { dishId: string } }>) => {
          if ((e.data?.type === 'ready' || e.data?.type === 'loaded') && e.data.info) w.__pm.dishId = e.data.info.dishId;
        });
      }
      override postMessage(msg: unknown, ...rest: unknown[]): void {
        const m = msg as { type?: string; speed?: number };
        if (m?.type === 'setSpeed' && typeof m.speed === 'number') w.__pm.speeds.push(m.speed);
        (super.postMessage as (...a: unknown[]) => void)(msg, ...rest);
      }
    };
  });
}

async function lastSpeedSent(page: Page): Promise<number | undefined> {
  return page.evaluate(() => (window as unknown as { __pm: { speeds: number[] } }).__pm.speeds.at(-1));
}

/** The open dish's tick, asked of the worker with the read-only 'hash' request. */
async function workerTick(page: Page): Promise<number> {
  return page.evaluate(async (protocolVersion) => {
    const pm = (window as unknown as { __pm: { workers: Worker[]; dishId: string | null; next: number } }).__pm;
    const worker = pm.workers[pm.workers.length - 1];
    if (!worker || !pm.dishId) throw new Error('no worker or dish yet');
    const requestId = pm.next++;
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no hash reply')), 10_000);
      const on = (e: MessageEvent<{ type: string; requestId?: number; tick?: number }>) => {
        if (e.data?.requestId !== requestId) return;
        worker.removeEventListener('message', on);
        clearTimeout(timer);
        if (e.data.type === 'hash' && typeof e.data.tick === 'number') resolve(e.data.tick);
        else reject(new Error(e.data.type));
      };
      worker.addEventListener('message', on);
      worker.postMessage({ type: 'hash', requestId, dishId: pm.dishId, protocolVersion });
    });
  }, PROTOCOL_VERSION);
}

async function fontPx(el: Locator): Promise<number> {
  return el.evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
}

/** Dish cell (cx, cy) → page coordinates at the whole-dish zoom. */
async function at(page: Page, cx: number, cy: number): Promise<[number, number]> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  return [box.x + box.width / 2 + (cx - 64) * zoom, box.y + box.height / 2 + (cy - 64) * zoom];
}

test('Home → Field Guide: every tab, search with "/", Salt, Sample; axe clean, 16 px text, Back → Home', async ({ page }) => {
  test.setTimeout(SLOW);
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByRole('button', { name: 'Field Guide' }).click();
  const guide = page.getByTestId('field-guide');
  await expect(guide.getByRole('heading', { level: 1, name: 'Field Guide' })).toBeVisible();
  await expect(page.getByTestId('guide-fictional')).toHaveText('All numbers are fictional game units.');
  await expect(page.getByTestId('guide-entry-B04')).toBeVisible(); // every entry listed at once, nothing locked

  // '/' focuses search; "vel" finds Velvet (B02) by name.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('/');
  await expect(page.getByTestId('guide-search')).toBeFocused();
  await page.keyboard.type('vel');
  const velvet = page.getByTestId('guide-entry-B02');
  await expect(velvet).toBeVisible();
  await expect(page.getByTestId('guide-entry-B04')).toHaveCount(0);
  await expect(velvet.getByRole('heading', { name: 'General biology' })).toBeVisible();
  await expect(velvet.getByRole('heading', { name: 'Rules of this game' })).toBeVisible();
  const predators = velvet.getByTestId('guide-predators');
  await expect(predators).toContainText('Amoeba');
  await expect(predators).toContainText('Siltworm');
  await expect(predators).not.toContainText('Ciliate');
  expect(await fontPx(velvet.getByTestId('guide-rules'))).toBeGreaterThanOrEqual(16);
  expect(await fontPx(predators.locator('p'))).toBeGreaterThanOrEqual(16);
  await expectNoSeriousA11yViolations(page);
  // Search by ID too.
  await page.getByTestId('guide-search').fill('b04');
  await expect(page.getByTestId('guide-entry-B04')).toBeVisible();
  // An ability entry says what its carriers can be noted for (notes stay on species; src/sim/moduleNotes.ts).
  await page.getByTestId('guide-search').fill('e01');
  await expect(page.getByTestId('guide-entry-E01').getByTestId('guide-seen')).toContainText('can be noted for its enzyme turning starch into sugar');
  await page.getByTestId('guide-search').fill('');

  // Materials → Salt.
  await page.getByTestId('guide-tab-materials').click();
  await expect(page.getByTestId('guide-tab-materials')).toHaveAttribute('aria-selected', 'true');
  const salt = page.getByTestId('guide-entry-SALT');
  await expect(salt).toContainText('No additional modeled reaction.');
  await expect(salt.getByTestId('guide-seen')).toBeVisible();

  // Structures & tools → Sample.
  await page.getByTestId('guide-tab-tools').click();
  const sample = page.getByTestId('guide-entry-SAMPLE');
  for (const h of ['Changes', 'Does not change', 'Watch for']) await expect(sample.getByRole('heading', { name: h, exact: true })).toBeVisible();
  await expect(sample.getByTestId('guide-watch').locator('p')).toHaveText('What happens to the place you emptied, and to the place you move it to.');
  // A tool's example is shown too, and every entry has "Seen in your dishes" (tools: nothing is noted).
  await expect(sample.getByTestId('guide-example').locator('p')).toHaveText('Lift a few Sprinters from a crowded patch and move them beside fresh sugar.');
  await expect(sample.getByTestId('guide-seen')).toContainText('This entry is none of those, so nothing is noted for it.');
  await expect(page.getByTestId('guide-entry-STONE').getByTestId('guide-seen')).toBeVisible();
  await expect(page.getByTestId('guide-entry-UNDO')).toContainText('A game tool with no lab analogue');
  await expectNoSeriousA11yViolations(page);

  // Glossary.
  await page.getByTestId('guide-tab-glossary').click();
  await expect(page.getByTestId('guide-glossary')).toContainText('All numbers are fictional game units');
  for (const tab of ['species', 'materials', 'tools', 'glossary']) await expectReachable(page.getByTestId(`guide-tab-${tab}`));
  await expectReachable(page.getByTestId('guide-back'));

  await page.getByTestId('guide-back').click();
  await expect(page.getByTestId('home-play')).toBeVisible();
});

test('the Field Guide reflows at 200 % text without sideways scrolling', async ({ page }) => {
  test.setTimeout(SLOW);
  await seedSettings(page, { showPrompts: false, textScale: 2 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Field Guide' }).click();
  await expect(page.getByTestId('guide-entry-B02')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(await fontPx(page.getByTestId('guide-entry-B02').getByTestId('guide-rules'))).toBeGreaterThanOrEqual(32);
  await page.getByTestId('guide-tab-tools').click();
  await expect(page.getByTestId('guide-entry-SAMPLE')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectReachable(page.getByTestId('guide-back'));
  await expectReachable(page.getByTestId('guide-search'));
});

test('More → Field Guide pauses the running dish and Back restores 4×; a debris dose shows "Seen in your dishes" for the Recycler', async ({ page }) => {
  test.setTimeout(SLOW);
  await watchWorker(page);
  await startGarden(page);

  // Lab: add Recyclers and a debris dose where the Garden's Recyclers are (66, 48).
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('lab-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Whole dish' }).click();
  const [x, y] = await at(page, 66, 48);
  await page.getByTestId('lab-cat-life').click();
  await page.getByTestId('lab-item-life:B04').click();
  await page.getByTestId('lab-use').click();
  await page.mouse.click(x, y);
  await page.getByTestId('lab-cat-food').click();
  await page.getByTestId('lab-item-material:DEBRIS').click();
  await page.getByTestId('lab-use').click();
  await page.mouse.click(x, y);

  // Run, then 4× (the speed buttons show while the dish runs).
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.getByRole('group', { name: 'Speed' }).getByRole('button', { name: '4×' }).click();
  await expect(page.getByRole('group', { name: 'Speed' }).getByRole('button', { name: '4×' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => workerTick(page), { timeout: 60_000 }).toBeGreaterThan(200);

  // More → Field Guide: the dish pauses (setSpeed 0 sent; its clock stops).
  await page.getByTestId('more').click();
  await page.getByTestId('more-guide').click();
  await expect(page.getByTestId('field-guide')).toBeVisible();
  await expect.poll(() => lastSpeedSent(page)).toBe(0);
  const t0 = await workerTick(page);
  await page.waitForTimeout(1500);
  expect(await workerTick(page)).toBe(t0);

  // The Recycler entry shows what this dish recorded, and its badge.
  await page.getByTestId('guide-search').fill('recycler');
  const recycler = page.getByTestId('guide-entry-B04');
  await expect(recycler.getByTestId('guide-seen')).toContainText('Seen in your dishes');
  await expect(recycler.getByTestId('seen-eats:B04:detritus')).toContainText('Recycler ate debris');
  await expect(recycler.getByTestId('badge-eats')).toContainText('Mealtime');
  await expect(page.getByTestId('guide-badges').getByTestId('badge-eats')).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Back: the dish runs again at 4×.
  await page.getByTestId('guide-back').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect.poll(() => lastSpeedSent(page)).toBe(4);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expect(page.getByRole('group', { name: 'Speed' }).getByRole('button', { name: '4×' })).toHaveAttribute('aria-pressed', 'true');
  const t1 = await workerTick(page);
  await expect.poll(() => workerTick(page), { timeout: 20_000 }).toBeGreaterThan(t1);

  // The record survives a reload of the app (device store), and changes nothing in the dish.
  await page.reload();
  await page.getByRole('button', { name: 'Field Guide' }).click();
  await page.getByTestId('guide-search').fill('recycler');
  await expect(page.getByTestId('guide-entry-B04').getByTestId('seen-eats:B04:detritus')).toBeVisible();
});
