/**
 * Organism flip journey (D-0127, the flip checklist's fresh-dish smoke; P5.5): with the Phase 5 organisms enabled, a
 * player's own dish shows a trap working from real state. New Dish → Empty Sediment Edge (seed 104729) → Lab: a Traplace
 * placed on sediment and fed broth builds its trap once it has 50 energy and 1.3 times its starting body (F03's rules
 * line; at about 12 dish seconds on this seed: "Trap set." and its store), and Siltworms dropped on it after 20 s are
 * caught: "Holding a Siltworm: … of 8 s." (Lab wording, with values). A Needlejaw and Amoebas placed in the water above
 * stay selectable (a Large hunter placed by the Life brush).
 * No screenshot assertions.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations, seedSettings, simSeconds } from './helpers';

const SLOW = 600_000;
/** Sediment (the lower half of Sediment Edge) and open water above it. */
const TRAP: readonly [number, number] = [64, 100];
const WATER: readonly [number, number] = [64, 30];

/** Screen point of a cell's center at the whole-dish zoom. */
async function cellPoint(page: Page, [x, y]: readonly [number, number], dx = 0.5): Promise<[number, number]> {
  await page.getByRole('button', { name: 'Whole dish' }).click();
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  return [box.x + box.width / 2 + (x + dx - 64) * zoom, box.y + box.height / 2 + (y + 0.5 - 64) * zoom];
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

/** Choose the options by test id, press Use and tap the cell once. */
async function useAt(page: Page, cell: readonly [number, number], options: readonly string[]): Promise<void> {
  for (const id of options) {
    await page.getByTestId(id).click();
    await expect(page.getByTestId(id)).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByTestId('lab-use').click();
  await expect(page.getByTestId('lab-tray')).toBeHidden();
  const [sx, sy] = await cellPoint(page, cell);
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

/** Tap a cell with the Inspect tool and choose `species` when the tap is ambiguous (organisms-p5.spec.ts selectIn). */
async function selectIn(page: Page, cell: readonly [number, number], species: string, dx = 0.5): Promise<void> {
  const insp = page.getByTestId('inspector');
  if (await insp.isVisible()) {
    const close = insp.getByRole('button', { name: 'Close' }).first();
    if (await close.isVisible()) await close.click();
  }
  const inspect = page.getByTestId('lab-cat-inspect');
  await inspect.scrollIntoViewIfNeeded();
  await inspect.click();
  const [sx, sy] = await cellPoint(page, cell, dx);
  await page.mouse.click(sx, sy);
  const heading = insp.getByRole('heading', { level: 2 });
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  await expect(list.or(heading)).toBeVisible();
  if (await list.isVisible()) await list.getByRole('option', { name: new RegExp(`^${species} #`) }).first().click();
  await expect(heading).toContainText(species);
}

test('a fresh Sediment Edge dish: a Traplace fed broth builds its trap and holds a Siltworm dropped on it', async ({ page }) => {
  test.setTimeout(SLOW);
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

  // The trap is built at about 12 s on this seed; drop five Siltworms on it after 20 s.
  await runUntil(page, 20, '4');
  const lines = page.getByTestId('organism-p5');
  await selectIn(page, TRAP, 'Traplace');
  await expect(lines.getByTestId('p5-trap').first()).toHaveText('Trap set.');
  await expect(lines.getByTestId('p5-trap').nth(1)).toHaveText(/^Trap store 0\.20 C, \d\.\d\d N\.$/);
  await pick(page, 'life', 'life:P04');
  await useAt(page, TRAP, ['lab-count-5', 'lab-radius-1']);

  // A second later one of them is held (a hold lasts 8 s).
  const t = await simSeconds(page);
  await runUntil(page, t + 1, '1');
  await selectIn(page, TRAP, 'Traplace');
  await expect(lines.getByTestId('p5-trap').first()).toHaveText(/^Holding a Siltworm: \d\.\d of 8 s\.$/);

  await selectIn(page, WATER, 'Needlejaw');
  await expectNoSeriousA11yViolations(page);
});
