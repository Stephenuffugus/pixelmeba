/**
 * Phase 5 wave 12 (structures-art-audio) journeys: the polished Build icons and the gate-class pips, in a NEW
 * dish (the Garden from Home → Play; since the systems flip, D-0121, a new dish records the barriers, climate
 * and devices systems and S01–S12, so no import is needed).
 *   - Tools → Build lists the twelve structures (then Remove), each with an svg icon and its content name;
 *   - an S02 line and a closed S03 are drawn through the UI; from the cell inspector's edge line the gate sheet
 *     shows the pip glyph cell beside "50 %" / "Passes" / "Blocked" (pip shapes read through data-pip), all
 *     blocked for the closed shutter; the shutter toggles Open and back and the table follows;
 *   - with Settings → Reduced motion on, the sheet and its pips still show (static);
 *   - axe clean on the Build group and the gate sheet, no sideways overflow, 48 px targets.
 * No screenshot assertions; the world-layer badges are canvas drawing (unit-tested in tests/render/gate-badges).
 */
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, startGarden } from './helpers';

const SLOW = 420_000;
/** A quiet corner of the Garden (FIRST_DISH_V1 founders sit near (48–66, 48–64)): the S02 line on y = 36, the S03 on y = 40. */
const GATE_CELL = [90, 35] as const;
const SHUTTER_CELL = [90, 39] as const;

const BUILD_NAMES = [
  'Fine membrane',
  'Small gate',
  'Shutter gate',
  'One-way channel',
  'Porous shelter',
  'Attachment mesh',
  'Nutrient basket',
  'Adsorption resin',
  'Heater',
  'Cooler',
  'Shade roof',
  'Moisture wick',
];

async function ensurePaused(page: Page): Promise<void> {
  const run = page.getByTestId('run-toggle');
  if ((await run.getAttribute('aria-label')) === 'Pause') await run.click();
  await expect(run).toHaveAttribute('aria-label', 'Run');
}

async function openLab(page: Page): Promise<void> {
  const toggle = page.getByTestId('view-toggle');
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lab-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Whole dish' }).click();
}

/** Screen point of a dish position (cells) at the whole-dish zoom (as structures.spec.ts maps it). */
async function screenAt(page: Page, cx: number, cy: number): Promise<[number, number]> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  return [box.x + box.width / 2 + (cx - 64) * zoom, box.y + box.height / 2 + (cy - 64) * zoom];
}

/** Pick a Build item and close the tray with "Use on the dish". */
async function pickBuild(page: Page, id: string, setup?: () => Promise<void>): Promise<void> {
  await page.getByTestId('lab-cat-tools').click();
  const button = page.getByTestId(`lab-item-build:${id}`);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  if (setup) await setup();
  await page.getByTestId('lab-use').click();
  await expect(page.getByTestId('lab-tray')).toBeHidden();
}

/** Drag along the horizontal grid line `y` from x0 to x1 (an edge stroke). */
async function strokeLine(page: Page, y: number, x0: number, x1: number): Promise<void> {
  const a = await screenAt(page, x0, y);
  const b = await screenAt(page, x1, y);
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { steps: 6 });
  await page.mouse.move(b[0], b[1], { steps: 6 });
  await page.mouse.up();
}

async function inspectCell(page: Page, cell: readonly [number, number]): Promise<void> {
  await page.getByTestId('lab-cat-inspect').click();
  const [x, y] = await screenAt(page, cell[0] + 0.5, cell[1] + 0.5);
  await page.mouse.click(x, y);
  await expect(page.getByTestId('inspector').getByRole('heading', { level: 2 })).toHaveText(`Cell ${cell[0]}, ${cell[1]}`);
}

/** The value cell of a gate table row: its words and its pip's shape. */
async function expectRow(page: Page, row: string, words: string, pip: 'pass' | 'partial' | 'blocked' | 'oneWay'): Promise<void> {
  const td = page.getByTestId(`gate-row-${row}`).locator('td').first();
  await expect(td).toHaveText(words);
  await expect(td.locator('svg.gate-pip')).toHaveAttribute('data-pip', pip);
  await expect(td.locator('svg.gate-pip')).toHaveAttribute('aria-hidden', 'true');
}

async function closeSheets(page: Page): Promise<void> {
  await page.getByTestId('gate-sheet-close').click();
  await page.getByTestId('inspector').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByTestId('inspector')).toBeHidden();
}

test('a new dish: Build icons, gate pips beside the table words, a shutter toggled, reduced motion still static', async ({ page }) => {
  test.setTimeout(SLOW);
  await startGarden(page);
  await ensurePaused(page);
  await openLab(page);

  // Tools → Build: twelve structures and Remove, each an svg icon beside its content name.
  await page.getByTestId('lab-cat-tools').click();
  const build = page.getByTestId('lab-build');
  await expect(build).toBeVisible();
  expect(await build.locator('.lab-item span').allInnerTexts()).toEqual([...BUILD_NAMES, 'Remove']);
  const items = build.locator('.lab-item');
  for (let i = 0; i < BUILD_NAMES.length; i++) {
    const it = items.nth(i);
    await expect(it.locator('svg')).toHaveCount(1);
    await expect(it.locator('svg')).toHaveAttribute('viewBox', '0 0 24 24');
    await expect(it).toHaveAccessibleName(BUILD_NAMES[i]!);
  }
  await expectReachable(page.getByTestId('lab-item-build:S02'));
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('lab-tray-close').click();

  // An S02 line and a closed S03, drawn through the UI.
  await pickBuild(page, 'S02');
  await strokeLine(page, GATE_CELL[1] + 1, 82, 98);
  await expect(page.locator('.toast')).toContainText('Placed a small gate on');
  await pickBuild(page, 'S03', async () => {
    await page.getByTestId('build-shutter-no').click();
    await expect(page.getByTestId('build-shutter-no')).toHaveAttribute('aria-pressed', 'true');
  });
  await strokeLine(page, SHUTTER_CELL[1] + 1, 88, 92);
  await expect(page.locator('.toast')).toContainText('Placed a shutter gate');

  // The S02's gate sheet: partial fields, Small passes, the rest blocked, each with its pip.
  await inspectCell(page, GATE_CELL);
  await expect(page.getByTestId('cell-edge-S')).toContainText('Small gate');
  await expectReachable(page.getByTestId('cell-edge-S-gate'));
  await page.getByTestId('cell-edge-S-gate').click();
  await expect(page.getByTestId('gate-sheet')).toBeVisible();
  for (const row of ['dissolved', 'activity', 'viral']) await expectRow(page, row, '50 %', 'partial');
  await expectRow(page, 'small', 'Passes', 'pass');
  for (const row of ['medium', 'large', 'fixed']) await expectRow(page, row, 'Blocked', 'blocked');
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  await closeSheets(page);

  // The closed shutter: everything blocked; Open, then Close again, and the table follows.
  await inspectCell(page, SHUTTER_CELL);
  await expect(page.getByTestId('cell-edge-S')).toContainText('Shutter gate (closed)');
  await page.getByTestId('cell-edge-S-gate').click();
  for (const row of ['dissolved', 'activity', 'viral']) await expectRow(page, row, '0 %', 'blocked');
  for (const row of ['small', 'medium', 'large', 'fixed']) await expectRow(page, row, 'Blocked', 'blocked');
  await expectReachable(page.getByTestId('gate-shutter'));
  await page.getByTestId('gate-shutter').click();
  await expect(page.locator('.toast')).toContainText('Shutter gate open');
  await expectRow(page, 'dissolved', '100 %', 'pass');
  await expectRow(page, 'small', 'Passes', 'pass');
  await expectRow(page, 'fixed', 'Stays put', 'pass');
  await expect(page.getByTestId('gate-shutter')).toHaveText('Close it');
  await page.getByTestId('gate-shutter').click();
  await expect(page.getByTestId('gate-shutter')).toHaveText('Open it');
  await expectRow(page, 'small', 'Blocked', 'blocked');
  await expectNoSeriousA11yViolations(page);
  await closeSheets(page);

  // Settings → Reduced motion on: the sheet and its pips still show (they never animate).
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const box = page.getByTestId('setting-reduced-motion');
  await box.check();
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await ensurePaused(page);
  await openLab(page);
  await inspectCell(page, GATE_CELL);
  await page.getByTestId('cell-edge-S-gate').click();
  await expect(page.getByTestId('gate-sheet')).toBeVisible();
  await expectRow(page, 'dissolved', '50 %', 'partial');
  await expectRow(page, 'small', 'Passes', 'pass');
  // Running, the sheet (and the renderer's selected-gate badge) stay; only the tracer note changes.
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('gate-tracer-note')).toHaveAttribute('data-paused', 'no');
  await expectRow(page, 'small', 'Passes', 'pass');
  await page.getByTestId('run-toggle').click();
  await expectNoHorizontalOverflow(page);
});
