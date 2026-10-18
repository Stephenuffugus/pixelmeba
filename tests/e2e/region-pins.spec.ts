/**
 * Phase 5 wave 14 region pins journey (P5.7; UX §9 text equivalent; D-0128). The two-region fixture dish
 * (tests/e2e/regionPinsFixture.ts: a FIRST_DISH_V1 world whose recorded habitat has "Fresh pool" and "Channel") is
 * imported through Saved dishes. Explore and Lab open with no page error (the renderer draws the pins from
 * DishInfo.regions); Lab → Observe → Regions → Show readings opens the Regions sheet, whose legend lists "1 Fresh
 * pool" and "2 Channel" with 16 px text. The Garden (a v1.0 dish) shows no legend. No screenshot assertions; axe and
 * no sideways overflow. THE HABITAT ENABLE (D-0130) adds the two D-0104-style checks: a new Brine Mosaic dish made
 * in New Dish numbers its three regions, and an rc1 save file (tests/fixtures/saves-rc1, written by v1.0.0-rc1)
 * imports with no legend.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { REPO_ROOT } from '../../tools/lib/content-fs';
import { writeRegionPinsFixture } from './regionPinsFixture';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings, startGarden } from './helpers';

const FIXTURE = join(REPO_ROOT, 'tmp', 'e2e-region-pins', `two-regions-${process.pid}.pixelmeba`);
const RC1 = join(REPO_ROOT, 'tmp', 'e2e-region-pins', `rc1-fungal-supply-line-${process.pid}.pixelmeba`);
const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'content', 'manifest.json'), 'utf8')) as { enabledHabitats: string[] };

test.beforeAll(async () => {
  test.setTimeout(120_000);
  await writeRegionPinsFixture(FIXTURE);
  mkdirSync(join(REPO_ROOT, 'tmp', 'e2e-region-pins'), { recursive: true });
  writeFileSync(RC1, gunzipSync(readFileSync(join(REPO_ROOT, 'tests', 'fixtures', 'saves-rc1', 'fungal-supply-line-t900.pixelmeba.gz'))));
});

test.afterAll(() => {
  rmSync(FIXTURE, { force: true });
  rmSync(RC1, { force: true });
});

/** Explore → Lab → Observe → Regions → Show readings: the Regions sheet (`inLab`: New Dish's Create opens the Lab). */
async function openRegionsSheet(page: Page, inLab = false) {
  if (!inLab) await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('lab-bar')).toBeVisible();
  await page.getByTestId('lab-cat-observe').click();
  await expect(page.getByTestId('lab-tray')).toHaveAttribute('data-category', 'observe');
  await page.getByTestId('lab-regions').click();
  await expect(page.getByTestId('probe-session')).toBeVisible();
  await page.getByTestId('probe-show').click();
  const sheet = page.getByTestId('probe-sheet');
  await expect(sheet).toBeVisible();
  return sheet;
}

test('a dish whose habitat records regions: the Regions sheet lists its numbered pins', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.locator('input[aria-label="Import a dish file"]').setInputFiles(FIXTURE);
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);

  const sheet = await openRegionsSheet(page);
  const legend = sheet.getByTestId('region-legend');
  await expect(legend).toBeVisible();
  await expect(legend.getByRole('heading', { name: 'Habitat regions' })).toBeVisible();
  const list = legend.getByRole('list', { name: 'Habitat regions, numbered as their pins on the dish' });
  await expect(list.getByRole('listitem')).toHaveText(['1 Fresh pool', '2 Channel']);
  await expect(sheet.getByTestId('region-legend-1')).toHaveText('1 Fresh pool');
  await expect(sheet.getByTestId('region-legend-2')).toHaveText('2 Channel');
  // Text at least 16 CSS px.
  const small = await legend.evaluate((root) =>
    Array.from(root.querySelectorAll('*'))
      .filter((el) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== ''))
      .map((el) => parseFloat(getComputedStyle(el).fontSize))
      .filter((px) => px < 15.9),
  );
  expect(small).toEqual([]);
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);

  // Back to Explore: still no error (the pins stay drawn in both views).
  await page.getByTestId('probe-close').click();
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('lab-bar')).toBeHidden();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the Garden (a v1.0 dish) shows no region legend', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startGarden(page);
  const sheet = await openRegionsSheet(page);
  await expect(sheet.getByTestId('probe-none')).toBeVisible();
  await expect(sheet.getByTestId('region-legend')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test('an rc1 save file (v1.0.0-rc1) imports with no region legend (D-0130)', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.locator('input[aria-label="Import a dish file"]').setInputFiles(RC1);
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  const sheet = await openRegionsSheet(page);
  await expect(sheet.getByTestId('probe-none')).toBeVisible();
  await expect(sheet.getByTestId('region-legend')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test('a new Brine Mosaic dish numbers its three regions on the dish and in the legend (D-0130)', async ({ page }) => {
  test.skip(!manifest.enabledHabitats.includes('H05_BRINE_MOSAIC'), 'until THE HABITAT ENABLE (H05_BRINE_MOSAIC not in the build manifest)');
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByTestId('home-new').click();
  await expect(page.getByRole('heading', { name: 'New dish', level: 1 })).toBeVisible();
  const option = page.getByTestId('new-dish-start-with-habitat:H05_BRINE_MOSAIC');
  await expectReachable(option);
  await option.click();
  await expect(option).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('new-dish-regions')).toHaveText('Regions: 1 Fresh pool, 2 Brine pool, 3 Channel.');
  await page.getByTestId('new-dish-start').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const sheet = await openRegionsSheet(page, true);
  await expect(sheet.getByTestId('region-legend-list').getByRole('listitem')).toHaveText(['1 Fresh pool', '2 Brine pool', '3 Channel']);
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});
