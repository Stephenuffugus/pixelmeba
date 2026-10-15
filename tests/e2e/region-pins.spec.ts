/**
 * Phase 5 wave 14 region pins journey (P5.7; UX §9 text equivalent; D-0128). The two-region fixture dish
 * (tests/e2e/regionPinsFixture.ts: a FIRST_DISH_V1 world whose recorded habitat has "Fresh pool" and "Channel") is
 * imported through Saved dishes. Explore and Lab open with no page error (the renderer draws the pins from
 * DishInfo.regions); Lab → Observe → Regions → Show readings opens the Regions sheet, whose legend lists "1 Fresh
 * pool" and "2 Channel" with 16 px text. The Garden (a v1.0 dish) shows no legend. No screenshot assertions; axe and
 * no sideways overflow.
 */
import { expect, test, type Page } from '@playwright/test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../tools/lib/content-fs';
import { writeRegionPinsFixture } from './regionPinsFixture';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, seedSettings, startGarden } from './helpers';

const FIXTURE = join(REPO_ROOT, 'tmp', 'e2e-region-pins', `two-regions-${process.pid}.pixelmeba`);

test.beforeAll(async () => {
  test.setTimeout(120_000);
  await writeRegionPinsFixture(FIXTURE);
});

test.afterAll(() => rmSync(FIXTURE, { force: true }));

/** Explore → Lab → Observe → Regions → Show readings: the Regions sheet. */
async function openRegionsSheet(page: Page) {
  await page.getByTestId('view-toggle').click();
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
