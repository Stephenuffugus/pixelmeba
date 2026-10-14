/**
 * P5.1/P5.2 structure journeys (structure-ui, wave 11; D-0119). Nothing is enabled in this build (D-0104):
 * the only way to these screens is a dish whose own recorded manifest has the systems, so each journey
 * imports a fixture dish built in Node (tests/e2e/structureFixture.ts) through Saved dishes → Import, as a
 * player could, with no dev flag and no build variant. The Garden (FIRST_DISH) shows none of it.
 * No screenshot assertions; the tracer is checked through its note's visibility rule (UX words).
 */
import { expect, test, type Page } from '@playwright/test';
import { rmSync } from 'node:fs';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings, startGarden } from './helpers';
import { FIXTURE_CELLS, writeStructureFixture } from './structureFixture';

let FIXTURE = '';

test.beforeAll(async () => {
  test.setTimeout(180_000);
  FIXTURE = await writeStructureFixture();
});

test.afterAll(() => {
  if (FIXTURE) rmSync(FIXTURE, { force: true });
});

const SLOW = 420_000;

async function importFixture(page: Page): Promise<void> {
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.locator('input[aria-label="Import a dish file"]').setInputFiles(FIXTURE);
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
}

async function wholeDish(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Whole dish' }).click();
}

async function openLab(page: Page): Promise<void> {
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('view-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lab-bar')).toBeVisible();
  await wholeDish(page);
}

/** Screen point of a dish position (cells) at the whole-dish zoom (as lab-tools.spec.ts maps it). */
async function screenAt(page: Page, cx: number, cy: number): Promise<[number, number]> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  return [box.x + box.width / 2 + (cx - 64) * zoom, box.y + box.height / 2 + (cy - 64) * zoom];
}

async function tapCell(page: Page, cell: readonly [number, number]): Promise<void> {
  const [x, y] = await screenAt(page, cell[0] + 0.5, cell[1] + 0.5);
  await page.mouse.click(x, y);
}

/** Pick a tray item and close the tray with "Use on the dish". */
async function pickTool(page: Page, category: string, item: string): Promise<void> {
  await page.getByTestId(`lab-cat-${category}`).click();
  const button = page.getByTestId(`lab-item-${item}`);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lab-details')).toBeVisible();
  await page.getByTestId('lab-use').click();
  await expect(page.getByTestId('lab-tray')).toBeHidden();
}

/** Inspect a cell (Lab's Inspect tool, or Explore's tap). */
async function inspectCell(page: Page, cell: readonly [number, number]): Promise<void> {
  if ((await page.getByTestId('view-toggle').getAttribute('aria-pressed')) === 'true') await page.getByTestId('lab-cat-inspect').click();
  await tapCell(page, cell);
  await expect(page.getByTestId('inspector').getByRole('heading', { level: 2 })).toHaveText(`Cell ${cell[0]}, ${cell[1]}`);
}

test('Build group: S01–S12 listed; an S01 stroke across a stone and the rim is previewed, then placed with its skipped counts', async ({ page }) => {
  test.setTimeout(SLOW);
  await importFixture(page);
  await openLab(page);
  await page.getByTestId('lab-cat-tools').click();
  const build = page.getByTestId('lab-build');
  await expect(build).toBeVisible();
  const names = await build.locator('.lab-item span').allInnerTexts();
  expect(names).toEqual([
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
    'Remove',
  ]);
  await page.getByTestId('lab-item-build:S03').click();
  await expect(page.getByTestId('build-shutter-yes')).toHaveAttribute('aria-pressed', 'true'); // a new shutter starts Open
  await page.getByTestId('lab-item-build:S01').click();
  await expect(page.getByTestId('lab-details')).toContainText('Fine membrane');
  await expect(page.getByTestId('lab-details')).toContainText('25 %');
  await expectReachable(page.getByTestId('lab-item-build:S01'));
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('lab-use').click();
  await expect(page.getByTestId('lab-tray')).toBeHidden();

  // Drag along the grid line y = 45 from beyond the rim into the stone near (42, 45).
  const a = await screenAt(page, 2, 45);
  const b = await screenAt(page, 38, 45);
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { steps: 8 });
  await page.mouse.move(b[0], b[1], { steps: 8 });
  const info = page.getByTestId('brush-info');
  await expect(info).toContainText('crossed out');
  await expect(info).toContainText('on the rim');
  await expect(info).toContainText('next to a stone or wall');
  const line = await info.innerText();
  const ok = Number(/^(\d+) edges?/.exec(line)![1]);
  expect(ok).toBeGreaterThan(5);
  await page.mouse.up();
  const toast = page.locator('.toast');
  // One assertion on the one toast (it is read while it shows): placed and skipped counts, content words only.
  await expect(toast).toHaveText(new RegExp(`^Placed a fine membrane on ${ok} edges?\\. Skipped: \\d+ (was|were) on the rim; \\d+ (was|were) next to a stone or wall\\.$`));
  await expectNoHorizontalOverflow(page);
});

test('a heater: placed Off, its sheet switches it On, Undo restores Off; Move only while paused', async ({ page }) => {
  test.setTimeout(SLOW);
  await importFixture(page);
  await openLab(page);
  await pickTool(page, 'tools', 'build:S09');
  await tapCell(page, FIXTURE_CELLS.newHeaterCell);
  await expect(page.locator('.toast')).toContainText('Placed a heater. It starts Off');

  await inspectCell(page, FIXTURE_CELLS.newHeaterCell);
  await expect(page.getByTestId('cell-device')).toContainText('Heater, Off');
  await expectReachable(page.getByTestId('cell-device-settings'));
  await page.getByTestId('cell-device-settings').click();
  const sheet = page.getByTestId('device-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('device-off')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('device-on').click();
  await expect(page.locator('.toast')).toContainText('Heater On.');
  await expect(page.getByTestId('device-on')).toHaveAttribute('aria-pressed', 'true');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('lab-undo').click();
  await expect(page.locator('.toast')).toContainText('Undone');
  await expect(page.getByTestId('device-off')).toHaveAttribute('aria-pressed', 'true');

  // Move: enabled while paused; disabled with its visible reason while running.
  await expect(page.getByTestId('device-move')).toBeEnabled();
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expect(page.getByTestId('device-move')).toBeDisabled();
  await expect(page.getByTestId('device-move-reason')).toHaveText('Pause to move a device.');
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expect(page.getByTestId('device-move')).toBeEnabled();
  await page.getByTestId('device-move').click();
  await expect(page.getByTestId('device-move-bar')).toBeVisible();
  const to = [FIXTURE_CELLS.newHeaterCell[0], FIXTURE_CELLS.newHeaterCell[1] + 4] as const;
  await tapCell(page, to);
  await expect(page.locator('.toast')).toContainText(`Moved the heater to cell ${to[0]}, ${to[1]}.`);
  await expect(page.getByTestId('device-sheet')).toBeVisible();
  await expect(page.getByTestId('device-sheet').getByRole('heading', { level: 2 })).toHaveText('Heater');
});

test('the gate inspector: the S02 table, measured totals, the tracer note while paused, a shutter opened', async ({ page }) => {
  test.setTimeout(SLOW);
  await importFixture(page);
  await wholeDish(page);
  await inspectCell(page, FIXTURE_CELLS.gateCell);
  await expect(page.getByTestId('cell-edge-E')).toContainText('East edge: Small gate');
  await expectReachable(page.getByTestId('cell-edge-E-gate'));
  await page.getByTestId('cell-edge-E-gate').click();
  const gate = page.getByTestId('gate-sheet');
  await expect(gate).toBeVisible();
  await expect(gate.locator('table caption')).toContainText('small gate');
  for (const row of ['dissolved', 'activity', 'viral']) await expect(page.getByTestId(`gate-row-${row}`).locator('td').first()).toHaveText('50 %');
  await expect(page.getByTestId('gate-row-small').locator('td').first()).toHaveText('Passes');
  await expect(page.getByTestId('gate-row-medium').locator('td').first()).toHaveText('Blocked');
  await expect(page.getByTestId('gate-totals')).toContainText('Measured since this barrier was placed: sugar');
  const note = page.getByTestId('gate-tracer-note');
  await expect(note).toHaveAttribute('data-paused', 'yes');
  await expect(note).toHaveText('The preview runs while paused; it moves nothing.');
  await expectNoSeriousA11yViolations(page);
  // Run: the tracer is cleared (its note says so) and the sheet still works.
  await page.getByTestId('run-toggle').click();
  await expect(note).toHaveAttribute('data-paused', 'no');
  await expect(page.getByTestId('gate-row-small')).toBeVisible();
  await page.getByTestId('run-toggle').click();
  await expect(note).toHaveAttribute('data-paused', 'yes');
  // Close returns to the cell inspector; close that too (on a phone it covers the middle of the dish).
  await page.getByTestId('gate-sheet-close').click();
  await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('inspector')).toBeHidden();

  // A closed shutter: opened from its gate sheet (one undoable command).
  await inspectCell(page, FIXTURE_CELLS.shutterCell);
  await expect(page.getByTestId('cell-edge-E')).toContainText('Shutter gate (closed)');
  await page.getByTestId('cell-edge-E-gate').click();
  await expect(page.getByTestId('gate-row-small').locator('td').first()).toHaveText('Blocked');
  await page.getByTestId('gate-shutter').click();
  await expect(page.locator('.toast')).toContainText('Shutter gate open');
  await expect(page.getByTestId('gate-row-small').locator('td').first()).toHaveText('Passes');
  await expect(page.getByTestId('gate-shutter')).toHaveText('Close it');
  await expectNoHorizontalOverflow(page);
});

test('climate per dish: wetting brush, light and drying for the fixture, the climate lines; none of it in the Garden', async ({ page }) => {
  test.setTimeout(SLOW);
  await importFixture(page);
  await openLab(page);
  await page.getByTestId('lab-cat-habitat').click();
  await expect(page.getByTestId('lab-item-wet')).toBeVisible();
  await expect(page.getByTestId('lab-item-wet')).toContainText('Wetting brush');
  await expect(page.getByTestId('lab-light-fixed')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lab-drying-off')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('lab-light-cycle').click();
  await expect(page.locator('.toast')).toContainText('Day and night: 90 s day, 30 s dusk, 90 s night, 30 s dawn.');
  await expect(page.getByTestId('lab-light-cycle')).toHaveAttribute('aria-pressed', 'true');
  await expectReachable(page.getByTestId('lab-drying-on'));
  await page.getByTestId('lab-drying-on').click();
  await expect(page.locator('.toast')).toContainText('Drying: uncovered gel and sediment lose 0.001 moisture per second');
  await expect(page.getByTestId('lab-drying-on')).toHaveAttribute('aria-pressed', 'true');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('lab-tray-close').click();

  await inspectCell(page, FIXTURE_CELLS.heaterCell);
  await expect(page.getByTestId('cell-warmth')).toContainText('0.50');
  await expect(page.getByTestId('cell-moisture')).toHaveText('1.00');
  await expect(page.getByTestId('cell-light')).toContainText('= baseline');
  await expect(page.getByTestId('cell-light')).toContainText('day and night');
  await page.getByTestId('lab-cat-observe').click();
  await expect(page.getByTestId('overlay-warmth')).toBeVisible();
  await expect(page.getByTestId('overlay-moisture')).toBeVisible();

  // The Garden records no climate, structures or devices: none of these controls appear.
  await startGarden(page);
  await openLab(page);
  await page.getByTestId('lab-cat-habitat').click();
  await expect(page.getByTestId('lab-tray')).toHaveAttribute('data-category', 'habitat');
  await expect(page.getByTestId('lab-item-wet')).toHaveCount(0);
  await expect(page.getByTestId('lab-light')).toHaveCount(0);
  await expect(page.getByTestId('lab-drying')).toHaveCount(0);
  await page.getByTestId('lab-cat-tools').click();
  await expect(page.getByTestId('lab-tray')).toHaveAttribute('data-category', 'tools');
  await expect(page.getByTestId('lab-build')).toHaveCount(0);
  await page.getByTestId('lab-cat-observe').click();
  await expect(page.getByTestId('overlay-warmth')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});
