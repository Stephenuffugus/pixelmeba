/**
 * P5.1 New Dish Environment group (UX §2.3 "Environment (lid, light mode, drying) — Phase 5"; D-0119). The
 * group is gated on THIS BUILD's manifest enabling 'climate', which happens at the systems flip (D-0104):
 * until then the first test proves New Dish has no Environment group, and the second (the group itself) is
 * skipped; the lead runs it unskipped at the flip.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../tools/lib/content-fs';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings } from './helpers';

const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'content', 'manifest.json'), 'utf8')) as { enabledSystems: string[] };
const buildManifestHasClimate = manifest.enabledSystems.includes('climate');

const SLOW = 300_000;

async function openNewDish(page: Page): Promise<void> {
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByTestId('home-new').click();
  await expect(page.getByRole('heading', { name: 'New dish', level: 1 })).toBeVisible();
  await expect(page.getByTestId('new-dish-summary')).toBeVisible();
}

test('New Dish matches the build manifest: no Environment group without climate', async ({ page }) => {
  test.setTimeout(SLOW);
  await openNewDish(page);
  if (buildManifestHasClimate) {
    await expect(page.getByTestId('new-dish-environment')).toBeVisible();
  } else {
    await expect(page.getByTestId('new-dish-environment')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Environment' })).toHaveCount(0);
    await expect(page.getByTestId('new-dish-environment-summary')).toHaveCount(0);
  }
  await expectNoHorizontalOverflow(page);
});

test('the Environment group: defaults, changes recorded in the dish, the summary in words', async ({ page }) => {
  test.skip(!buildManifestHasClimate, 'runs at the systems flip (D-0104)');
  test.setTimeout(SLOW);
  await openNewDish(page);
  const group = page.getByTestId('new-dish-environment');
  await expect(group).toBeVisible();
  // CT §8.1 defaults for the Garden: lid open, fixed light, drying off.
  await expect(page.getByTestId('new-dish-lid-open')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('new-dish-light-fixed')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('new-dish-drying-false')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('new-dish-environment-summary')).toHaveText('Lid open, fixed light, drying off.');
  await expectReachable(page.getByTestId('new-dish-light-cycle'));
  await page.getByTestId('new-dish-light-cycle').click();
  await page.getByTestId('new-dish-drying-true').click();
  await expect(page.getByTestId('new-dish-environment-summary')).toHaveText('Lid open, day-and-night light (a 240 s cycle), drying on.');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('new-dish-start').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await page.getByTestId('lab-cat-habitat').click();
  await expect(page.getByTestId('lab-light-cycle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lab-drying-on')).toHaveAttribute('aria-pressed', 'true');
});
