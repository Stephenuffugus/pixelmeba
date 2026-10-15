/**
 * Organism flip journey (D-0127, the flip checklist's fresh-dish smoke; P5.5): with the Phase 5 organisms enabled, a
 * player's own dish shows a trap working from real state. New Dish → Empty Sediment Edge (seed 104729) → Lab: a Traplace
 * placed on sediment and fed broth builds its trap once it has 50 energy and 1.3 times its starting body (F03's rules
 * line; at about 12 dish seconds on this seed: "Trap set." and its store), and once Siltworms are dropped on it, it
 * catches one: "Holding a Siltworm: … of 8 s." (Lab wording, with values), read live from the inspector while the dish
 * runs. A Needlejaw and Amoebas placed in the water above show the Life brush placing a Phase 5 hunter.
 * No screenshot assertions.
 */
import { expect, test, type Page } from '@playwright/test';
import { E_SPECIES, E_X, E_Y, ENT_STRIDE } from '../../src/worker/protocol';
import { expectNoSeriousA11yViolations, seedSettings, simSeconds } from './helpers';

const SLOW = 600_000;
/** Dish points (cells): sediment (the lower half of Sediment Edge) and open water above it. */
const TRAP: readonly [number, number] = [64.5, 100.5];
const WATER: readonly [number, number] = [64.5, 30.5];

/**
 * Record organism positions and species from the worker's snapshots (the app has no test hook; an init script wraps
 * Worker and only listens, as a11y-screens.spec.ts does).
 */
async function watchPositions(page: Page): Promise<void> {
  await page.addInitScript(
    ({ stride, ex, ey, es }) => {
      const w = window as unknown as { Worker: typeof Worker; __pos: [number, number, number][] };
      const Orig = w.Worker;
      w.__pos = [];
      w.Worker = class extends Orig {
        constructor(url: string | URL, opts?: WorkerOptions) {
          super(url, opts);
          this.addEventListener('message', (e: MessageEvent<{ type?: string; ents?: Float32Array; count?: number }>) => {
            const d = e.data;
            if (d?.type !== 'snapshot' || !d.ents || typeof d.count !== 'number') return;
            const out: [number, number, number][] = [];
            for (let k = 0; k < d.count; k++)
              out.push([d.ents[k * stride + ex]!, d.ents[k * stride + ey]!, d.ents[k * stride + es]!]);
            w.__pos = out;
          });
        }
      };
    },
    { stride: ENT_STRIDE, ex: E_X, ey: E_Y, es: E_SPECIES },
  );
}

/** The recorded organism nearest a dish point (a paused dish: the last snapshot is current). */
async function nearestTo(page: Page, [px, py]: readonly [number, number]): Promise<{ at: [number, number]; distance: number }> {
  const pos = await page.evaluate(() => (window as unknown as { __pos: [number, number, number][] }).__pos);
  let best: { at: [number, number]; distance: number } | null = null;
  for (const [x, y] of pos) {
    const distance = Math.hypot(x - px, y - py);
    if (!best || distance < best.distance) best = { at: [x, y], distance };
  }
  if (!best) throw new Error('no organism recorded');
  return best;
}

/** Screen point of a dish point (cells) at the whole-dish zoom. */
async function screenPoint(page: Page, [x, y]: readonly [number, number]): Promise<[number, number]> {
  await page.getByRole('button', { name: 'Whole dish' }).click();
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  return [box.x + box.width / 2 + (x - 64) * zoom, box.y + box.height / 2 + (y - 64) * zoom];
}

async function pick(page: Page, category: string, item: string): Promise<void> {
  const tray = page.getByTestId('lab-tray');
  if (!(await tray.isVisible()) || (await tray.getAttribute('data-category')) !== category) {
    const cat = page.getByTestId(`lab-cat-${category}`);
    await cat.scrollIntoViewIfNeeded();
    await cat.click();
  }
  await expect(tray).toHaveAttribute('data-category', category);
  const button = page.getByTestId(`lab-item-${item}`);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lab-details')).toBeVisible();
}

/** Choose the options by test id, press Use and tap the dish point once. */
async function useAt(page: Page, point: readonly [number, number], options: readonly string[]): Promise<void> {
  for (const id of options) {
    await page.getByTestId(id).click();
    await expect(page.getByTestId(id)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByTestId('lab-use').click();
  await expect(page.getByTestId('lab-tray')).toBeHidden();
  const [sx, sy] = await screenPoint(page, point);
  await page.mouse.click(sx, sy);
}

/** Run at `speed` until the dish clock reaches `seconds`, then pause. */
async function runUntil(page: Page, seconds: number, speed: '1' | '4'): Promise<void> {
  await page.getByTestId('run-toggle').click();
  await page.keyboard.press(speed);
  await expect.poll(() => simSeconds(page), { timeout: 420_000, intervals: [500] }).toBeGreaterThanOrEqual(seconds);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
}

/** Close the inspector sheet, which covers the zoom buttons on desktop and the lower dish on a phone. */
async function closeInspector(page: Page): Promise<void> {
  const insp = page.getByTestId('inspector');
  if (await insp.isVisible()) {
    const close = insp.getByRole('button', { name: 'Close' }).first();
    if (await close.isVisible()) await close.click();
  }
  await expect(insp).toBeHidden();
}

/** The living count on the dish clock. */
async function aliveCount(page: Page): Promise<number> {
  const m = /(\d+) alive/.exec((await page.getByTestId('sim-time').textContent()) ?? '');
  if (!m) throw new Error('no alive count');
  return Number(m[1]);
}

/**
 * Tap a dish point with the Inspect tool and choose `species` when the tap is ambiguous. Organisms more than 0.35 cells
 * further than the nearest are not offered, so tap the organism's recorded position, not its cell.
 */
async function selectAt(page: Page, point: readonly [number, number], species: string): Promise<void> {
  const insp = page.getByTestId('inspector');
  await closeInspector(page);
  const inspect = page.getByTestId('lab-cat-inspect');
  await inspect.scrollIntoViewIfNeeded();
  await inspect.click();
  const [sx, sy] = await screenPoint(page, point);
  await page.mouse.click(sx, sy);
  const heading = insp.getByRole('heading', { level: 2 });
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  await expect(list.or(heading)).toBeVisible();
  if (await list.isVisible()) await list.getByRole('option', { name: new RegExp(`^${species} #`) }).first().click();
  await expect(heading).toContainText(species);
}

test('a fresh Sediment Edge dish: a Traplace fed broth builds its trap and holds a Siltworm dropped on it', async ({ page }) => {
  test.setTimeout(SLOW);
  await watchPositions(page);
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByTestId('home-new').click();
  await expect(page.getByRole('heading', { name: 'New dish' })).toBeVisible();
  const choice = page.getByTestId('new-dish-start-with-sediment');
  await choice.click();
  await expect(choice).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('new-dish-seed').fill('104729');
  await page.getByTestId('new-dish-start').click();
  await expect(page.getByTestId('dish-screen')).toHaveAttribute('data-view', 'lab');
  await expect(page.getByTestId('sim-time')).toContainText('0 alive');

  // A Traplace on sediment, broth around it; a Needlejaw and five Amoebas in the water.
  await pick(page, 'life', 'life:F03');
  await useAt(page, TRAP, ['lab-count-1', 'lab-radius-1']);
  await expect(page.getByTestId('sim-time')).toContainText('1 alive');
  await pick(page, 'food', 'material:M01');
  await useAt(page, TRAP, ['lab-dose-2', 'lab-radius-3']);
  await pick(page, 'life', 'life:P10');
  await useAt(page, WATER, ['lab-count-1', 'lab-radius-1']);
  await expect(page.getByTestId('sim-time')).toContainText('2 alive');
  await pick(page, 'life', 'life:P01');
  await useAt(page, WATER, ['lab-count-5', 'lab-radius-1']);
  await expect(page.getByTestId('sim-time')).toContainText('7 alive');

  // The trap is built at about 12 s on this seed. A Traplace never moves: the organism nearest the trap point is it.
  await runUntil(page, 20, '4');
  const traplace = await nearestTo(page, TRAP);
  expect(traplace.distance).toBeLessThan(2);
  const lines = page.getByTestId('organism-p5');
  await selectAt(page, traplace.at, 'Traplace');
  await expect(lines.getByTestId('p5-trap').first()).toHaveText('Trap set.');
  await expect(lines.getByTestId('p5-trap').nth(1)).toHaveText(/^Trap store 0\.20 C, \d\.\d\d N\.$/);

  // Five Siltworms dropped on it.
  await closeInspector(page);
  const before = await aliveCount(page);
  await pick(page, 'life', 'life:P04');
  await useAt(page, traplace.at, ['lab-count-5', 'lab-radius-1']);
  await expect(page.getByTestId('sim-time')).toContainText(`${before + 5} alive`);

  // With the Traplace inspected, run at 1× until it holds one (the inspector follows every snapshot; a hold lasts 8 s).
  await selectAt(page, traplace.at, 'Traplace');
  await page.getByTestId('run-toggle').click();
  await page.keyboard.press('1');
  await expect(lines.getByTestId('p5-trap').first()).toHaveText(/^Holding a Siltworm: \d\.\d of 8 s\.$/, { timeout: 120_000 });
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expectNoSeriousA11yViolations(page);
});
