import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings, simSeconds, startGarden } from './helpers';

/** Experiment ids of the stamps the Journal holds on this device. */
async function journalIds(page: Page): Promise<string[]> {
  return page.evaluate(() => (JSON.parse(localStorage.getItem('pixelmeba.journal') ?? '[]') as { experimentId: string }[]).map((e) => e.experimentId));
}

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
  // A paired card's copies run to their stopping point; the player's dish is unchanged (not "the world keeps running").
  await expect(page.getByTestId('experiment-card-completion')).toContainText('Both copies run to their stopping point');
  await expect(page.getByTestId('experiment-card-completion')).toContainText('your dish is unchanged');
  await expect(page.getByTestId('experiment-card-completion')).not.toContainText('keeps running');
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
    // UX §4.1: the A/B toggle over the viewport is a 48 × 48 px target too.
    await expectReachable(page.getByTestId('experiment-show-A'));
    await expectReachable(page.getByTestId('experiment-show-B'));
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
  // The card's one player step (the results of both copies) is marked as taken.
  await expect(page.getByTestId('experiment-steps').locator('li[data-step="viewComparison"]')).toHaveAttribute('data-pass', 'true');
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

// P2.5 fix wave (item 4): the A/B toggle on the Compare screen (wave A) is a 48 px target on phones.
test('compare: the phone A/B toggle is at least 48 × 48 px', async ({ page }) => {
  await startGarden(page);
  await page.getByTestId('more').click();
  await page.getByTestId('action-compare').click();
  await expect(page.getByTestId('compare-screen')).toHaveAttribute('data-status', 'setup');
  if (await page.getByTestId('compare-show-A').isVisible()) {
    await expectReachable(page.getByTestId('compare-show-A'));
    await expectReachable(page.getByTestId('compare-show-B'));
  } else {
    // Wide layouts show A and B side by side; there is no toggle.
    await expect(page.getByTestId('compare-view-A')).toBeVisible();
  }
});

// P2.5 fix wave (item 8): a one-dish card's stamp needs its measured gate AND the step the card lists.
test('experiments: Cleaning crew stamps only after the measured gate and the History being opened', async ({ page }) => {
  test.setTimeout(180_000);
  await seedSettings(page, { showPrompts: false });
  await openExperiments(page);
  await page.getByTestId('experiment-card-EXP_103').click();
  await expect(page.getByTestId('experiment-card-steps')).toContainText('More → History');
  await expect(page.getByTestId('experiment-card-completion')).toContainText('The world keeps running.');
  await page.getByTestId('experiment-start').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await page.getByTestId('run-toggle').click();
  // The measured gate holds at 12 s of dish time.
  await expect.poll(() => simSeconds(page), { timeout: 90_000 }).toBeGreaterThanOrEqual(16);
  await page.getByTestId('run-toggle').click();
  expect(await journalIds(page)).toEqual([]);
  // Fix round 2 (item 6): one small, dismissible notice in the dish view names the missing step.
  const notice = page.getByTestId('experiment-waiting');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('“Cleaning crew”: every part held at 12 s.');
  await expect(notice).toContainText('More → History');
  await expect(page.getByTestId('experiment-waiting')).toHaveCount(1);
  await expectTextAtLeast16px(page, '[data-testid="experiment-waiting"]');
  await expectNoSeriousA11yViolations(page);
  const dismiss = notice.getByRole('button', { name: 'Dismiss this notice' });
  await expectReachable(dismiss);
  await dismiss.click();
  await expect(notice).toHaveCount(0);
  await page.getByTestId('more').click();
  await page.getByTestId('more-history').click();
  await expect(page.getByTestId('history')).toBeVisible();
  await expect.poll(() => journalIds(page), { timeout: 15_000 }).toEqual(['EXP_103']);
  await expectNoSeriousA11yViolations(page);
});

// P2.5 fix wave (item 8): Predator balance also needs the prey history read on the results.
test('experiments: Predator balance stamps after the population history of both copies is opened', async ({ page }) => {
  test.setTimeout(300_000);
  await seedSettings(page, { showPrompts: false });
  await openExperiments(page);
  await page.getByTestId('experiment-card-EXP_106').click();
  await expect(page.getByTestId('experiment-card-steps')).toContainText('population history');
  await page.getByTestId('experiment-start').click();
  const screen = page.getByTestId('experiment-run-screen');
  await expect(screen).toHaveAttribute('data-status', 'setup');
  await page.getByTestId('experiment-run').click();
  const fast = page.getByTestId('experiment-speed-max');
  if (await fast.isVisible()) await fast.click();
  await expect(screen).toHaveAttribute('data-status', 'complete', { timeout: 240_000 });
  // The measured gate held at 3:00, but the stamp waits for the prey history.
  const result = page.getByTestId('experiment-gate-result');
  await expect(result).toHaveAttribute('data-reached', 'true');
  await expect(result).toContainText('No stamp yet');
  await expect(page.getByTestId('experiment-steps').locator('li[data-step="viewPreyHistory"]')).toHaveAttribute('data-pass', 'false');
  expect(await journalIds(page)).toEqual([]);
  const history = page.getByTestId('experiment-history');
  await history.locator('summary').click();
  await expect(page.getByTestId('experiment-history-table')).toBeVisible();
  await expect(page.getByTestId('experiment-history-table').getByRole('row', { name: /^3:00/ })).toBeVisible();
  await expect(result).toContainText('Your Journal has a stamp: “Compared Sprinters with and without grazers”');
  await expect(page.getByTestId('experiment-steps').locator('li[data-step="viewPreyHistory"]')).toHaveAttribute('data-pass', 'true');
  await expect.poll(() => journalIds(page)).toEqual(['EXP_106']);
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, '.xp-panel');
  await expectNoSeriousA11yViolations(page);
});
