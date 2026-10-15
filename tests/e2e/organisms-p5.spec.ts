/**
 * Wave 13 org-ui journeys (P5.7; UX §5.1-§5.2; D-0124): every Phase 5 organism state is visible and explained
 * in the inspector from real state. Each journey imports a fixture dish built in Node (tests/e2e/organismFixture.ts)
 * through Saved dishes → Import against the production build, with no dev flag (D-0119), and selects the
 * organism by tapping it, as a player does. Explore wording first, then the Lab view's wording with its value.
 * No screenshot assertions (the marks are atlas stills keyed to recorded state; tests/render covers their choice).
 * The trap and jacket cases are written now and skipped: the import refuses a dish recording TRAP until the wave 13
 * integration appends it, and E11 until the organism flip lists it.
 */
import { expect, test, type Page } from '@playwright/test';
import { rmSync } from 'node:fs';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, seedSettings } from './helpers';
import { ORGANISM_CELLS, TRAP_JACKET_CELLS, writeOrganismFixture, writeTrapJacketFixture } from './organismFixture';

let FIXTURE = '';

test.beforeAll(async () => {
  test.setTimeout(180_000);
  FIXTURE = await writeOrganismFixture();
});

test.afterAll(() => {
  if (FIXTURE) rmSync(FIXTURE, { force: true });
});

const SLOW = 300_000;

async function importDish(page: Page, file: string): Promise<void> {
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.locator('input[aria-label="Import a dish file"]').setInputFiles(file);
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await page.getByRole('button', { name: 'Whole dish' }).click();
}

/** Tap the organism of `species` in a fixture cell at the whole-dish zoom (choosing it when the tap is ambiguous). */
async function selectIn(page: Page, cell: readonly [number, number], species: string, dx = 0.5): Promise<void> {
  const insp = page.getByTestId('inspector');
  if (await insp.isVisible()) {
    const close = insp.getByRole('button', { name: 'Close' }).first();
    if (await close.isVisible()) await close.click();
  }
  // In Lab, the Inspect tool taps organisms (structures.spec.ts inspectCell).
  if ((await page.getByTestId('view-toggle').getAttribute('aria-pressed')) === 'true') await page.getByTestId('lab-cat-inspect').click();
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  await page.mouse.click(box.x + box.width / 2 + (cell[0] + dx - 64) * zoom, box.y + box.height / 2 + (cell[1] + 0.5 - 64) * zoom);
  const heading = insp.getByRole('heading', { level: 2 });
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  await expect(list.or(heading)).toBeVisible();
  if (await list.isVisible()) await list.getByRole('option', { name: new RegExp(`^${species} #`) }).click();
  await expect(heading).toContainText(species);
}

async function toLab(page: Page): Promise<void> {
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('view-toggle')).toHaveAttribute('aria-pressed', 'true');
}

/** The Phase 5 lines are body text (≥ 16 px) inside the inspector, which keeps its Close control reachable (≥ 48 px). */
async function expectReadable(page: Page): Promise<void> {
  const lines = page.getByTestId('organism-p5').locator('p');
  const sizes = await lines.evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  expect(sizes.length).toBeGreaterThan(0);
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(16);
  const close = await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).first().boundingBox();
  expect(close!.width).toBeGreaterThanOrEqual(48);
  expect(close!.height).toBeGreaterThanOrEqual(48);
}

test('a glowing Lantern: "It senses neighbors." and "Glowing."; in Lab "Signal 0.50 (threshold 0.30)."', async ({ page }) => {
  test.setTimeout(SLOW);
  await importDish(page, FIXTURE);
  await selectIn(page, ORGANISM_CELLS.lantern, 'Lantern');
  const lines = page.getByTestId('organism-p5');
  await expect(lines.getByTestId('p5-signal').first()).toHaveText('It senses neighbors.');
  await expect(lines.getByTestId('p5-signal').nth(1)).toHaveText('Glowing.');
  await expect(lines.getByTestId('p5-secretion')).toHaveText('Making glow signal.');
  await expectReadable(page);
  await expectNoSeriousA11yViolations(page);
  await toLab(page);
  await expect(lines.getByTestId('p5-signal').first()).toHaveText('Signal 0.50 (threshold 0.30).');
  await expect(lines.getByTestId('p5-signal').nth(1)).toHaveText('Glowing: it stops after 5 s at 0.15 or less.');
  await expectNoHorizontalOverflow(page);
});

test('a Turnleaf in light: "Making food from light."; in Lab with the light', async ({ page }) => {
  test.setTimeout(SLOW);
  await importDish(page, FIXTURE);
  await selectIn(page, ORGANISM_CELLS.turnleaf, 'Turnleaf');
  const mode = page.getByTestId('organism-p5').getByTestId('p5-mode');
  await expect(mode).toHaveText('Making food from light.');
  // Never said to be eating while it makes food from light (D-0123 MINOR 2).
  await expect(page.getByTestId('inspector').locator('.chip').first()).not.toHaveText(/Eating/);
  await toLab(page);
  await expect(mode).toHaveText('Making food from light (light 0.80). It turns to sugar at light 0.25 or less.');
  await expectNoSeriousA11yViolations(page);
});

test('a Needlejaw mid-attempt and its prey: "Holding on to its prey." / "Being caught.", with the progress in Lab', async ({ page }) => {
  test.setTimeout(SLOW);
  await importDish(page, FIXTURE);
  await selectIn(page, ORGANISM_CELLS.needlejaw, 'Needlejaw');
  const lines = page.getByTestId('organism-p5');
  await expect(lines.getByTestId('p5-handling')).toHaveText('Holding on to its prey.');
  await expect(page.getByTestId('constraint')).toContainText('Holding on to its prey.');
  await expectReadable(page);
  await expectNoSeriousA11yViolations(page);
  await toLab(page);
  await expect(lines.getByTestId('p5-handling')).toHaveText('Holding on: 0.3 of 1.0 s of contact (resets if contact breaks).');
  // Fix 1: "What's holding it back" names the attempt once, measured (no "? of ? s").
  const why = page.getByTestId('why-stop');
  await expect(why).toContainText('Holding on: 0.3 of 1.0 s of contact (resets if contact breaks).');
  await expect(why).not.toContainText('?');
  await expect(why.locator('li', { hasText: 'Holding on to its prey.' })).toHaveCount(1);
  await selectIn(page, ORGANISM_CELLS.needlejaw, 'Amoeba', 0.8);
  await expect(lines.getByTestId('p5-being-handled')).toHaveText(/^Being caught by Needlejaw #\d+: 0\.3 of 1\.0 s of contact \(resets if contact breaks\)\.$/);
  await page.getByTestId('view-toggle').click();
  await expect(lines.getByTestId('p5-being-handled')).toHaveText('Being caught.');
  await expect(page.getByTestId('constraint')).toContainText('Being caught.');
});

test('a Sprinter in rivalry chemical (no Rampart in the dish): "Rivalry chemical here is hurting it."; the amount in Lab', async ({ page }) => {
  test.setTimeout(SLOW);
  await importDish(page, FIXTURE);
  await selectIn(page, ORGANISM_CELLS.sprinter, 'Sprinter');
  const rival = page.getByTestId('organism-p5').getByTestId('p5-rival');
  await expect(rival).toHaveText('Rivalry chemical here is hurting it.');
  await toLab(page);
  await expect(rival).toHaveText('Rivalry chemical 0.40 here adds 0.10 to its exposure. In all: growth × 0.91, −0.80 health/s.');
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
});

// TRAP implemented since wave 13's integration.
test('a Siltworm held by a Traplace: "Caught in a trap." and the trap line', async ({ page }) => {
  test.setTimeout(SLOW);
  const file = await writeTrapJacketFixture();
  try {
    await importDish(page, file);
    await selectIn(page, TRAP_JACKET_CELLS.traplace, 'Siltworm', 0.6);
    const lines = page.getByTestId('organism-p5');
    await expect(lines.getByTestId('p5-held')).toHaveText('Caught in a trap.');
    await expect(page.getByTestId('why-stop')).toContainText("Can't split while caught in a trap.");
    await toLab(page);
    await expect(lines.getByTestId('p5-held')).toHaveText(/^Held by Traplace #\d+: \d\.\d of 8 s; drained \d\.\d{3} C in the last second\.$/);
    await selectIn(page, TRAP_JACKET_CELLS.traplace, 'Traplace');
    await expect(lines.getByTestId('p5-trap').first()).toHaveText(/^Holding a Siltworm: \d\.\d of 8 s\.$/);
    await expect(lines.getByTestId('p5-trap').nth(1)).toHaveText(/^Trap store 0\.20 C, \d\.\d\d N\.$/);
    await expectNoSeriousA11yViolations(page);
  } finally {
    rmSync(file, { force: true });
  }
});

// Until E11 is in IMPLEMENTED_MODULES (organism flip): the import refuses a dish recording it.
test.skip('a jacketed Dartfin (E11): the jacket line and the module card\'s "active now"', async ({ page }) => {
  test.setTimeout(SLOW);
  const file = await writeTrapJacketFixture();
  try {
    await importDish(page, file);
    await selectIn(page, TRAP_JACKET_CELLS.dartfin, 'Dartfin');
    const jacket = page.getByTestId('organism-p5').getByTestId('p5-jacket');
    await expect(jacket).toHaveText(/^Mineral jacket \d+ % built\.$/);
    await toLab(page);
    await expect(jacket).toHaveText(/^Mineral jacket \d+ % \(\d\.\d\d of \d\.\d\d\); moves at \d\.\d\d speed\.$/);
    await page.getByTestId('inspector').getByRole('tab', { name: 'Passed to offspring' }).click();
    await expect(page.getByTestId('module-list')).toContainText('Mineral jacket');
    await expectNoSeriousA11yViolations(page);
  } finally {
    rmSync(file, { force: true });
  }
});
