import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings } from './helpers';

/** Every visible text on these screens is at least 16 px (UX §9; scales with Settings text size). */
async function expectTextAtLeast16px(page: Page, selector: string): Promise<void> {
  const small = await page.evaluate((sel) => {
    const out: string[] = [];
    for (const root of Array.from(document.querySelectorAll(sel))) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim() ?? '';
        const el = n.parentElement;
        if (!text || !el || el.closest('.sr-only')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 15.9) out.push(`${el.tagName.toLowerCase()}.${el.className}: ${fs}px “${text.slice(0, 40)}”`);
      }
    }
    return out;
  }, selector);
  expect(small).toEqual([]);
}

async function openExperiments(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('home-notebook').click();
  await expect(page.getByTestId('notebook')).toBeVisible();
  await page.getByTestId('notebook-tab-experiments').click();
  await expect(page.getByTestId('notebook-tab-experiments')).toHaveAttribute('aria-selected', 'true');
}

// P2.5 done-when (e2e): Home → Notebook → Experiments → Experiment A card → start it → the paired run
// with the card's change on B → gate reached → the Journal shows the stamp.
test('experiments: Notebook → Experiment A → paired run with the change on B → gate → Journal stamp', async ({ page }) => {
  test.setTimeout(300_000);
  await seedSettings(page, { showPrompts: false });
  await openExperiments(page);

  // The seven cards, each with its question; Experiment C carries its label.
  const cards = page.locator('[data-testid^="experiment-card-EXP_"]');
  await expect(cards).toHaveCount(7);
  await expect(page.getByRole('heading', { name: 'Why variation can matter' })).toBeVisible();
  const expC = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Why variation can matter' }) });
  await expect(expC.getByTestId('experiment-label')).toHaveText('Seeded traits demonstration');
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, '.nb-page');
  await expectNoSeriousA11yViolations(page);

  // The card in full: every part SPEC §13.2 names.
  await page.getByTestId('experiment-card-EXP_A').click();
  await expect(page.getByTestId('experiment-card')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What unlocks starch');
  for (const part of ['Question', 'Recipe', 'Suggested intervention', 'Predicted tradeoff', 'Measurements', 'Stopping point', 'Confounds', 'Observation gate']) {
    await expect(page.getByRole('heading', { level: 2, name: part, exact: true })).toBeVisible();
  }
  await expect(page.getByTestId('experiment-card-arms')).toContainText('without the “Starch” deposit');
  await expect(page.getByText('Sugar made from starch', { exact: true })).toBeVisible();
  await expectReachable(page.getByTestId('experiment-start'));
  await expectTextAtLeast16px(page, '[data-testid="experiment-card"]');
  await expectNoSeriousA11yViolations(page);

  // Start: a new paused dish, and the paired run in setup with the card's change already on B.
  await page.getByTestId('experiment-start').click();
  const screen = page.getByTestId('experiment-run-screen');
  await expect(screen).toHaveAttribute('data-status', 'setup');
  await expect(page.getByTestId('experiment-time')).toContainText('Paused at 0:00');
  await expect(page.getByTestId('experiment-change-B')).toContainText('without the “Starch” deposit (0.6 starch per cell within r 3 of (64, 64))');
  await expect(page.getByTestId('experiment-label-A')).toContainText('A · as written');
  await expect(page.getByTestId('experiment-label-B')).toContainText('B · without Starch');
  await expect(page.getByTestId('experiment-label-A')).toContainText('12 alive');
  await expect(page.getByTestId('experiment-label-B')).toContainText('12 alive');
  const phone = await page.getByTestId('experiment-show-A').isVisible();
  if (phone) {
    await expect(page.getByTestId('experiment-view-B')).toBeVisible();
    await page.getByTestId('experiment-show-A').click();
    await expect(page.getByTestId('experiment-view-A')).toBeVisible();
    await expect(page.getByTestId('experiment-view-B')).toBeHidden();
    await page.getByTestId('experiment-show-B').click();
  } else {
    await expect(page.getByTestId('experiment-view-A')).toBeVisible();
    await expect(page.getByTestId('experiment-view-B')).toBeVisible();
  }
  const prediction = 'Copy A will feed more, but the enzyme may cost more than it gives.';
  await page.getByTestId('experiment-prediction').fill(prediction);
  await expectReachable(page.getByTestId('experiment-run'));
  await expect(page.getByTestId('experiment-run')).toHaveText('Run A and B for 3 min');
  await expectTextAtLeast16px(page, '.xp-panel');
  await expectNoSeriousA11yViolations(page);

  // Run at the fastest pace; the gate is watched as it runs and reached at 3:00.
  await page.getByTestId('experiment-run').click();
  await expect(screen).toHaveAttribute('data-status', /running|complete/);
  const fast = page.getByTestId('experiment-speed-max');
  if (await fast.isVisible()) {
    await expect(page.getByTestId('experiment-gate')).toBeVisible();
    await expect(page.getByTestId('experiment-prediction-shown')).toHaveText(prediction);
    await fast.click();
  }
  await expect(screen).toHaveAttribute('data-status', 'complete', { timeout: 200_000 });
  await expect(page.getByTestId('experiment-results-title')).toHaveText('Results · this paired run');
  await expect(page.getByTestId('experiment-gate-result')).toHaveAttribute('data-reached', 'true');
  await expect(page.getByTestId('experiment-gate-result')).toContainText('reached at 3:00');
  await expect(page.getByTestId('experiment-gate-result')).toContainText('Measured sugar made from starch');
  await expect(page.getByTestId('experiment-label-A')).toContainText('+3:00');
  await expect(page.getByTestId('experiment-label-B')).toContainText('+3:00');
  const table = page.getByTestId('experiment-table');
  const row = table.getByRole('row', { name: /^Sugar made from starch/ });
  await expect(row.getByRole('cell').nth(1)).toHaveText('0.00 C'); // copy B has no starch to convert
  await expect(row.getByRole('cell').nth(0)).not.toHaveText('0.00 C');
  await expectTextAtLeast16px(page, '.xp-panel');
  await expectNoSeriousA11yViolations(page);

  // The Journal shows the stamp: card, moment, label, measured values, the prediction.
  await page.getByTestId('experiment-open-journal').click();
  await expect(page.getByTestId('notebook-tab-journal')).toHaveAttribute('aria-selected', 'true');
  const stamp = page.getByTestId('journal-entry-EXP_A');
  await expect(stamp).toHaveCount(1);
  await expect(stamp.getByRole('heading', { level: 2 })).toHaveText('Measured sugar made from starch');
  await expect(stamp).toContainText('What unlocks starch · this paired run · reached at 3:00 dish time');
  await expect(stamp).toContainText('Sugar was made from starch in copy A');
  await expect(stamp).toContainText(prediction);
  await stamp.getByText('Measured when the stamp was recorded').click();
  await expect(stamp.getByRole('row', { name: /^Sugar made from starch/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, '.nb-page');
  await expectNoSeriousA11yViolations(page);

  // The stamp is kept on this device: it is still there after a reload.
  await page.reload();
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-journal').click();
  await expect(page.getByTestId('journal-entry-EXP_A')).toHaveCount(1);
});

test('experiments: cards and the run setup reflow at 200 % text with 48 px targets', async ({ page }) => {
  test.setTimeout(180_000);
  await seedSettings(page, { showPrompts: false, textScale: 2 });
  await openExperiments(page);
  await expectNoHorizontalOverflow(page);
  await expectReachable(page.getByTestId('experiment-card-EXP_C'));
  await expectReachable(page.getByTestId('notebook-tab-journal'));
  await page.getByTestId('experiment-card-EXP_C').click();
  await expect(page.getByTestId('experiment-label')).toHaveText('Seeded traits demonstration');
  await expectNoHorizontalOverflow(page);
  await expectReachable(page.getByTestId('experiment-start'));
  await page.getByTestId('experiment-start').click();
  await expect(page.getByTestId('experiment-run-screen')).toHaveAttribute('data-status', 'setup');
  // Experiment C: the stable-food schedule is shown and accepted before the run.
  await expect(page.getByTestId('experiment-label').first()).toHaveText('Seeded traits demonstration');
  await expect(page.getByTestId('experiment-change-B')).toContainText('without those later additions');
  await expect(page.getByTestId('experiment-label-B')).toContainText('B · without the later additions');
  await expect(page.locator('.xp-arms')).toContainText('Sugar, 0.5 per cell within r 6 of (64, 64), at 60, 120, 180, 240 and 300 s');
  await expectReachable(page.getByTestId('experiment-run'));
  await expect(page.getByTestId('experiment-run')).toHaveText('Accept the schedule and run both for 10 min');
  await expectReachable(page.getByTestId('experiment-close'));
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('experiment-close').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
});
