import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings } from './helpers';

// P4.5 done-when (e2e variants-paired; BUILD_DIRECTIVE P4.5, D09 line 115): Play → What if? → A smaller
// meal → Compare with Garden (180 s) → prediction note → run at the fastest pacing → the results show
// both counts, "Sugar left in the dish", "this paired run" and the caveat → pick a conclusion → Done:
// the idea's own dish is open and paused at 0:00.

/**
 * expectReachable, retried: the Play card can still grow (its thumbnail and goal offers load) after the
 * first scroll on a phone, which moved the link out of view once under load.
 */
async function reachableAfterLayout(el: Locator): Promise<void> {
  await expect(async () => {
    await el.scrollIntoViewIfNeeded();
    await expect(el).toBeInViewport({ ratio: 0.9, timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expectReachable(el);
}

async function openPairSetup(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('home-play').click();
  await reachableAfterLayout(page.getByTestId('whatif-open'));
  await page.getByTestId('whatif-open').click();
  await expect(page.getByTestId('whatif-sheet')).toBeVisible();
  await page.getByTestId('whatif-choice-R-G1').click();
  const pair = page.getByTestId('whatif-pair');
  await expectReachable(pair);
  await expect(pair).toHaveText('Compare with Garden (180 s)');
  await expect(page.getByTestId('whatif-selected')).toContainText(
    'Runs this idea and the unchanged Garden side by side for 180 seconds of dish time.',
  );
  await pair.click();
  await expect(page.getByTestId('whatif-sheet')).toHaveCount(0);
  await expect(page.getByTestId('compare-screen')).toHaveAttribute('data-status', 'setup');
  await expect(page.getByTestId('pair-setup')).toBeVisible();
}

test('Paired Garden variant: A smaller meal vs Garden for 180 s → results → the idea opens paused at 0:00', async ({ page }) => {
  test.setTimeout(600_000);
  await seedSettings(page, { showPrompts: false });
  await openPairSetup(page);

  // Setup: the idea, its question, the plain changed input, the fixed horizon; no change to queue.
  await expect(page.getByRole('heading', { name: 'A smaller meal vs Garden' })).toBeVisible();
  await expect(page.getByTestId('pair-change')).toHaveText("B's sugar patch held 0.20 C per cell instead of 0.40.");
  await expect(page.getByTestId('pair-horizon')).toHaveText('Both run for exactly 180 seconds of dish time.');
  await expect(page.getByTestId('pair-identity')).toHaveText('A: R-G0 / revision 1 / seed 104729 · B: R-G1 / revision 1 / seed 104729');
  await expect(page.getByTestId('pair-sequential')).toHaveCount(0);
  await expect(page.getByTestId('compare-horizon-60')).toHaveCount(0);
  await expect(page.getByTestId('compare-feed')).toHaveCount(0);
  await expect(page.getByTestId('compare-show-A')).toHaveText('A · Garden');
  await expect(page.getByTestId('compare-show-B')).toHaveText('B · A smaller meal');
  // The views use the toggle's words: the player queued no change, so neither says "your change".
  await expect(page.getByTestId('compare-label-A').locator('strong')).toHaveText('A · Garden');
  await expect(page.getByTestId('compare-label-B').locator('strong')).toHaveText('B · A smaller meal');
  await expect(page.getByTestId('compare-view-A')).toHaveAttribute('aria-label', 'Dish A: the unchanged Garden');
  await expect(page.getByTestId('compare-view-B')).toHaveAttribute('aria-label', 'Dish B: A smaller meal, the Garden with this idea’s one change');
  for (const arm of ['A', 'B']) await expect(page.getByTestId(`compare-view-${arm}`)).not.toContainText(/your change|baseline/);
  // The close note makes no claim about saves (the completion autosaves Continue, SPEC §14.2).
  await expect(page.getByTestId('pair-setup')).toContainText('Closing discards the two copies and opens “A smaller meal” paused at 0:00, as it starts.');
  await expect(page.getByTestId('pair-setup')).not.toContainText('saves are not changed');
  const prediction = 'B will have fewer Sprinters than A.';
  await page.getByTestId('compare-prediction').fill(prediction);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);

  const runBtn = page.getByTestId('compare-run');
  await expect(runBtn).toHaveText('Run A and B for 180 s');
  await expectReachable(runBtn);
  await runBtn.click();
  await expect(page.getByTestId('compare-screen')).toHaveAttribute('data-status', /running|complete/);
  const fast = page.getByTestId('compare-speed-max');
  if (await fast.isVisible()) await fast.click();

  // Results (D09: both counts and food remaining, the changed input, "this paired run", the caveat).
  await expect(page.getByTestId('compare-results-title')).toBeVisible({ timeout: 480_000 });
  await expect(page.getByTestId('compare-results-title')).toHaveText('A smaller meal vs Garden');
  await expect(page.getByTestId('pair-question')).toHaveText('What changes with less food?');
  await expect(page.getByTestId('pair-change')).toHaveText("B's sugar patch held 0.20 C per cell instead of 0.40.");
  await expect(page.getByTestId('pair-label')).toHaveText('this paired run');
  await expect(page.getByTestId('compare-summary')).toContainText('each ran 3:00 from the first moment');
  await expect(page.getByTestId('pair-caveat')).toHaveText('One paired run is an illustration, not a general rule.');
  await expect(page.getByTestId('compare-time')).toContainText('both ran 3:00');
  const counts = page.getByTestId('pair-counts');
  await expect(counts.getByRole('columnheader')).toHaveText(['Both counts and the food left', 'A', 'B', 'B − A']);
  await expect(counts.getByRole('rowheader', { name: /alive$/ }).first()).toBeVisible();
  await expect(counts.getByRole('rowheader', { name: 'Sugar left in the dish' })).toBeVisible();
  const sugarCells = page.getByTestId('pair-sugar').getByRole('cell');
  await expect(sugarCells.nth(0)).toHaveText(/^\d+\.\d\d$/);
  await expect(sugarCells.nth(1)).toHaveText(/^\d+\.\d\d$/);
  // The existing measures follow; the prediction is shown beside them.
  await expect(page.getByTestId('compare-table')).toBeVisible();
  await expect(page.getByTestId('compare-prediction-shown')).toHaveText(prediction);

  const cantTell = page.getByTestId('compare-conclusion-cantTell');
  await cantTell.scrollIntoViewIfNeeded();
  await cantTell.click();
  await expect(cantTell).toHaveAttribute('aria-checked', 'true');
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);

  // Done: the copies go; the idea's own dish opens paused at its first moment (it never ran).
  const done = page.getByTestId('compare-done');
  await expect(done).toHaveText('Done — open “A smaller meal”');
  await done.click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.locator('.topbar .title strong')).toHaveText('A smaller meal');
  await expect(page.getByTestId('sim-time')).toHaveText(/^0:00 · 56 alive/);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
});

test('Paired Garden variant on a low-memory device: the dishes run one after the other', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => 1 });
  });
  await seedSettings(page, { showPrompts: false });
  await openPairSetup(page);
  await expect(page.getByTestId('pair-sequential')).toHaveText('This device runs the two dishes one after the other. Both get exactly 180 seconds.');
  // Closing at setup opens the idea paused at 0:00; nothing ran.
  await page.getByTestId('compare-close').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.locator('.topbar .title strong')).toHaveText('A smaller meal');
  await expect(page.getByTestId('sim-time')).toHaveText(/^0:00 · 56 alive/);
});
