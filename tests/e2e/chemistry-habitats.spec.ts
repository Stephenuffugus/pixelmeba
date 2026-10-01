/**
 * P3.1/P3.2 journey: New Dish → Start with 'Empty Sediment Edge' → Create (Lab) → Chemistry → Salt
 * (dose 0.50, radius 3) painted while paused → the cell inspector shows salinity 0.50 and pH 7 →
 * Acidifier, then Buffer, move the pH line as SPEC §4.3 says (7 + (base − acid)/(1 + buffer)) → the
 * lid toggles closed and back. Axe clean at each step. Also: 200 % text on New Dish, the Chemistry
 * tray and the cell inspector.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  expectReachable,
  seedSettings,
} from './helpers';

const SLOW = 420_000;
/** An open water cell of Sediment Edge, away from the stone (r 13 at (45,43)) and the sediment (y ≥ 64). */
const CELL: readonly [number, number] = [90, 30];

async function newSedimentEdge(page: Page, settings: Record<string, unknown> = {}): Promise<void> {
  await seedSettings(page, { showPrompts: false, ...settings });
  await page.goto('/');
  await page.getByTestId('home-new').click();
  await expect(page.getByRole('heading', { name: 'New dish' })).toBeVisible();
  const choice = page.getByTestId('new-dish-start-with-sediment');
  await expectReachable(choice);
  await choice.click();
  await expect(choice).toHaveAttribute('aria-checked', 'true');
  const summary = page.getByTestId('new-dish-summary');
  // Exactly what is preloaded: the habitat's own rules text, and no life.
  await expect(page.getByTestId('new-dish-habitat')).toContainText('Sediment Edge');
  await expect(page.getByTestId('new-dish-habitat')).toContainText(
    '0.10 debris carbon with 0.010 bound nutrient',
  );
  await expect(page.getByTestId('new-dish-habitat')).toContainText('No life until you add it.');
  await expect(page.getByTestId('new-dish-map')).toBeVisible();
  await expect(summary).toContainText('carbon');
}

async function create(page: Page): Promise<void> {
  const start = page.getByTestId('new-dish-start');
  await expectReachable(start);
  await start.click();
  await expect(page.getByTestId('dish-screen')).toHaveAttribute('data-view', 'lab');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expect(page.getByTestId('sim-time')).toContainText('0 alive');
}

/** Screen point of a cell's center at the whole-dish zoom. */
async function cellPoint(page: Page, [x, y]: readonly [number, number]): Promise<[number, number]> {
  await page.getByRole('button', { name: 'Whole dish' }).click();
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  return [box.x + box.width / 2 + (x + 0.5 - 64) * zoom, box.y + box.height / 2 + (y + 0.5 - 64) * zoom];
}

/** Open a tray and pick one item; returns with the tray still open (its options are inside). */
async function pick(page: Page, category: string, item: string): Promise<void> {
  const cat = page.getByTestId(`lab-cat-${category}`);
  await cat.scrollIntoViewIfNeeded();
  await cat.click();
  const tray = page.getByTestId('lab-tray');
  await expect(tray).toHaveAttribute('data-category', category);
  const button = page.getByTestId(`lab-item-${item}`);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lab-details')).toBeVisible();
}

/** Paint the chosen chemistry material on CELL with dose 0.50, radius 3, as one tap. */
async function dose(page: Page, item: string): Promise<void> {
  await pick(page, 'chemistry', `material:${item}`);
  await page.getByTestId('lab-dose-2').click();
  await expect(page.getByTestId('lab-dose-2')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('lab-radius-3').click();
  await expect(page.getByTestId('lab-details')).toContainText('0.5');
  await page.getByTestId('lab-use').click();
  await expect(page.getByTestId('lab-tray')).toBeHidden();
  const [sx, sy] = await cellPoint(page, CELL);
  await page.mouse.click(sx, sy);
}

/** Inspect CELL and return the cell inspector. */
async function inspectCell(page: Page) {
  const inspect = page.getByTestId('lab-cat-inspect');
  await inspect.scrollIntoViewIfNeeded();
  await inspect.click();
  const [sx, sy] = await cellPoint(page, CELL);
  await page.mouse.click(sx, sy);
  const insp = page.getByTestId('inspector');
  await expect(insp.getByRole('heading', { level: 2 })).toHaveText(`Cell ${CELL[0]}, ${CELL[1]}`);
  return insp;
}

async function closeInspector(page: Page): Promise<void> {
  await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('inspector')).toHaveCount(0);
}

test('Empty Sediment Edge: salt, acidifier and buffer change the cell readings as the rules say; the lid toggles', async ({
  page,
}) => {
  test.setTimeout(SLOW);
  await newSedimentEdge(page);
  await expectNoSeriousA11yViolations(page);
  await create(page);
  await expectNoHorizontalOverflow(page);

  // Chemistry → Salt: the tray lists the chemistry items, each explained before use.
  await pick(page, 'chemistry', 'material:SALT');
  const tray = page.getByTestId('lab-tray');
  for (const id of [
    'NUTRIENT',
    'OXYGEN',
    'CO2',
    'ACID',
    'BASE',
    'BUFFER',
    'SALT',
    'INH_BACT',
    'INH_FUNG',
    'INH_PHOTO',
  ])
    await expect(tray.getByTestId(`lab-item-material:${id}`)).toBeVisible();
  await expect(tray).not.toContainText('later update');
  await expect(page.getByTestId('lab-details')).toContainText('never decays');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('lab-tray-close').click();

  // Salt 0.50 at radius 3, painted while paused: no time passes, nothing spreads.
  await dose(page, 'SALT');
  await expect(page.getByTestId('sim-time')).toContainText('0:00');
  let insp = await inspectCell(page);
  await expect(insp.getByTestId('cell-salinity')).toHaveText('0.50');
  await expect(insp.getByTestId('cell-ph')).toHaveText('7.00');
  await expect(insp.getByTestId('cell-oxygen')).toHaveText('0.80');
  await expect(insp.getByTestId('cell-light')).toHaveText('0.80 (habitat 0.80 × shade 1.00)');
  await expect(insp.getByTestId('cell-exposure')).toHaveText('None here.');
  await expectNoSeriousA11yViolations(page);
  await closeInspector(page);

  // Acidifier 0.50: pH = 7 + (0 − 0.5)/(1 + 0) = 6.50.
  await dose(page, 'ACID');
  insp = await inspectCell(page);
  await expect(insp.getByTestId('cell-ph')).toHaveText('6.50');
  await expect(insp.getByTestId('cell-salinity')).toHaveText('0.50');
  await closeInspector(page);

  // Buffer 0.50: pH = 7 + (0 − 0.5)/(1 + 0.5) = 6.67.
  await dose(page, 'BUFFER');
  insp = await inspectCell(page);
  await expect(insp.getByTestId('cell-ph')).toHaveText('6.67');
  await expectNoSeriousA11yViolations(page);
  await closeInspector(page);

  // Habitat → Lid: closed, then open again; each is one recorded change.
  await page.getByTestId('lab-cat-habitat').click();
  await expect(page.getByTestId('lab-tray')).toHaveAttribute('data-category', 'habitat');
  const open = page.getByTestId('lab-lid-open');
  const closed = page.getByTestId('lab-lid-closed');
  await expectReachable(closed);
  await expect(open).toHaveAttribute('aria-pressed', 'true');
  await closed.click();
  // The buttons follow the lid the worker reports in its snapshots (the world's own setting).
  await expect(closed).toHaveAttribute('aria-pressed', 'true');
  await expect(open).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('lab-undo')).toBeEnabled();
  await expectNoSeriousA11yViolations(page);
  await expectReachable(open);
  await open.click();
  await expect(open).toHaveAttribute('aria-pressed', 'true');
  await expect(closed).toHaveAttribute('aria-pressed', 'false');
  // One recorded, undoable change: Undo rewinds exactly the reopening.
  await page.getByTestId('lab-undo').click();
  await expect(closed).toHaveAttribute('aria-pressed', 'true');
  await expectReachable(open);
  await open.click();
  await expect(open).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('sim-time')).toContainText('0:00');
});

test('200 % text: New Dish, the Chemistry tray and the cell inspector reflow without sideways scrolling', async ({
  page,
}) => {
  test.setTimeout(SLOW);
  await newSedimentEdge(page, { textScale: 2 });
  await expectNoHorizontalOverflow(page);
  for (const id of ['new-dish-start-with-gel', 'new-dish-start-with-sediment'])
    await expectReachable(page.getByTestId(id));
  await expectNoSeriousA11yViolations(page);
  await create(page);

  await pick(page, 'chemistry', 'material:SALT');
  for (const id of ['lab-item-material:INH_PHOTO', 'lab-dose-2', 'lab-radius-6', 'lab-use'])
    await expectReachable(page.getByTestId(id));
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('lab-tray-close').click();

  await dose(page, 'SALT');
  const insp = await inspectCell(page);
  for (const id of ['cell-salinity', 'cell-ph', 'cell-light', 'cell-exposure']) {
    const line = insp.getByTestId(id);
    await line.scrollIntoViewIfNeeded();
    await expect(line).toBeInViewport({ ratio: 0.5 });
  }
  await expect(insp.getByTestId('cell-salinity')).toHaveText('0.50');
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
});
