/**
 * Wave 2 Add Life journey (UX §4.3–§4.4; W2-13, W2-14; P3.3/P3.4): the Explore Add Life sheet shows
 * every new organism's tile with its diet symbol and a diet line from the dish's own records; the
 * Pinphage tile reads its count as units per cell; in the Lab, the Siltworm's Life brush preview
 * crosses out open water, and a Pinphage dose reports the units it added per cell. Axe-clean, 48 px
 * targets, 16 px text.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations, expectReachable, startGarden } from './helpers';

const SLOW = 420_000;

const NEW_TILES: Readonly<Record<string, RegExp>> = {
  B03: /^Eats sugar without oxygen\.$/,
  B05: /^Eats metabolite\.$/,
  Y01: /^Eats sugar without oxygen\.$/,
  P02: /^Hunts .*Sprinter.*\(Crumbsmith only free-swimming\)/,
  P03: /^Hunts Sunbead and Bubble, and \d+ kinds? not in this dish\.$/,
  P04: /^Hunts .*Crossfeeder \(Crumbsmith only in sediment\)/,
  V01: /^Infects Sprinter\.$/,
};

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

test('Add Life shows the wave 2 organisms with diet lines; the Siltworm preview refuses open water; a Pinphage dose reads units per cell', async ({
  page,
}) => {
  test.setTimeout(SLOW);
  await startGarden(page);

  // Explore → Add Life.
  await page.getByTestId('action-addlife').click();
  const sheet = page.locator('section.sheet[aria-labelledby="addlife-title"]');
  await expect(sheet).toBeVisible();
  for (const [id, line] of Object.entries(NEW_TILES)) {
    const tile = page.getByTestId(`species-${id}`);
    await expectReachable(tile);
    const diet = page.getByTestId(`species-${id}-diet`);
    await expect(diet).toHaveText(line);
    await expect(diet.locator('svg[data-diet-symbol]')).toHaveCount(1);
    expect(await fontPx(diet)).toBeGreaterThanOrEqual(16);
  }
  // Pinphage: the count is units per cell.
  const dose = page.getByTestId('species-V01-dose');
  await expect(dose).toHaveText('5 units per cell');
  await sheet.getByRole('group', { name: 'How many' }).getByRole('button', { name: '20' }).click();
  await expect(dose).toHaveText('20 units per cell');
  await expect(page.getByTestId('phage-note-V01')).toContainText('units added to every covered cell');
  expect(await fontPx(dose)).toBeGreaterThanOrEqual(16);
  await expectNoSeriousA11yViolations(page);
  await sheet.getByRole('button', { name: 'Close' }).click();

  // Lab → Life → Siltworm: hovering open water previews every covered cell crossed out.
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('lab-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Whole dish' }).click();
  await page.getByTestId('lab-cat-life').click();
  await page.getByTestId('lab-item-life:P04').click();
  await expect(page.getByTestId('lab-diet')).toContainText('Crumbsmith only in sediment');
  await page.getByTestId('lab-use').click();
  const [wx, wy] = await at(page, 90, 64); // open water in the Garden
  await page.mouse.move(wx, wy);
  await page.mouse.move(wx + 2, wy + 1);
  await expect(page.getByTestId('brush-info')).toHaveText(/^0 cells · \d+ crossed out \(skipped\)$/);

  // Lab → Life → Pinphage: the dose line and the toast speak of units per cell.
  await page.getByTestId('lab-cat-life').click();
  await page.getByTestId('lab-item-life:V01').click();
  const details = page.getByTestId('lab-details');
  await expect(details).toContainText(/Adds 5 Pinphage units to every covered cell\./);
  await expect(page.getByTestId('lab-diet')).toHaveText('Infects Sprinter.');
  await expectReachable(page.getByTestId('lab-count-20'));
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('lab-use').click();
  await page.mouse.move(wx, wy);
  await expect(page.getByTestId('brush-info')).toHaveText(/^\d+ cells$/); // nothing crossed out in open water
  await page.mouse.click(wx, wy);
  await expect(page.locator('.toast')).toHaveText(/^Added 5 Pinphage units to each of \d+ cells\.$/);
});
