import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, simSeconds, startGarden } from './helpers';

/** Click inside one arm's canvas at a fraction of its box. */
async function tapArm(page: Page, arm: 'A' | 'B', fx = 0.5, fy = 0.5): Promise<void> {
  const box = await page.getByTestId(`compare-canvas-${arm}`).boundingBox();
  if (!box) throw new Error(`no canvas for ${arm}`);
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

// P2.4 done-when (e2e): start a comparison from the Garden, queue a Feed on B, run 60 s, see results
// with the prediction note and pick a conclusion. Runs on phone-portrait (A/B toggle) and desktop (side by side).
test('compare: Feed on B, run 60 s, read results beside the prediction, pick a conclusion', async ({ page }) => {
  test.setTimeout(180_000);
  await startGarden(page);
  expect(await simSeconds(page)).toBe(0);

  // UX §2.4: Compare lives in More.
  await page.getByTestId('more').click();
  await expectReachable(page.getByTestId('action-compare'));
  await page.getByTestId('action-compare').click();
  await expect(page.getByTestId('compare-screen')).toHaveAttribute('data-status', 'setup');
  await expect(page.getByTestId('compare-baseline')).toContainText('exact copies of “Little Living Garden” at 0:00');
  await expect(page.getByTestId('compare-label-A')).toContainText('56 alive');
  await expect(page.getByTestId('compare-label-B')).toContainText('56 alive');
  await expect(page.getByTestId('compare-run')).toBeDisabled();

  const phone = await page.getByTestId('compare-show-A').isVisible();
  if (phone) {
    // One view at a time; B (where the change goes) is shown first.
    await expect(page.getByTestId('compare-view-B')).toBeVisible();
    await expect(page.getByTestId('compare-view-A')).toBeHidden();
  } else {
    // Large screens: both views side by side.
    const a = (await page.getByTestId('compare-view-A').boundingBox())!;
    const b = (await page.getByTestId('compare-view-B').boundingBox())!;
    await expect(page.getByTestId('compare-view-A')).toBeVisible();
    await expect(page.getByTestId('compare-view-B')).toBeVisible();
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.width - 1);
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  }

  // Queue a Feed on B through the ordinary Feed tool.
  await page.getByTestId('compare-feed').click();
  await page.getByTestId('feed-choose').click();
  await expect(page.getByText('Now tap dish B to place it.')).toBeVisible();
  await tapArm(page, 'B', 0.42, 0.5);
  await expect(page.getByTestId('compare-change')).toContainText(/Queued on B:.*Sugar, 0\.1 per cell on \d+ cells/);
  await expect(page.getByTestId('compare-feed')).toHaveCount(0); // one change per comparison

  if (phone) {
    await page.getByTestId('compare-show-A').click();
    await expect(page.getByTestId('compare-show-A')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('compare-view-A')).toBeVisible();
    await expect(page.getByTestId('compare-view-B')).toBeHidden();
    await page.getByTestId('compare-show-B').click();
    await expect(page.getByTestId('compare-view-B')).toBeVisible();
  }

  const prediction = 'B will have more Sprinters than A.';
  await page.getByTestId('compare-prediction').fill(prediction);
  await page.getByTestId('compare-horizon-60').click();
  await expect(page.getByTestId('compare-horizon-60')).toHaveAttribute('aria-checked', 'true');
  await expectNoSeriousA11yViolations(page);
  await expect(page.getByTestId('compare-run')).toHaveText('Run A and B for 60 s');
  await page.getByTestId('compare-run').click();
  await expect(page.getByTestId('compare-screen')).toHaveAttribute('data-status', /running|complete/);
  const fast = page.getByTestId('compare-speed-max');
  if (await fast.isVisible()) await fast.click();

  await expect(page.getByTestId('compare-results-title')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('compare-results-title')).toHaveText('Results · this paired run');
  // G2 comprehension M4: no row is presented as a direct effect of the change.
  await expect(page.getByTestId('compare-knock-on')).toHaveText(
    'Every difference below traces back to your change, directly or through knock-on effects; this table does not show which.',
  );
  await expect(page.getByTestId('compare-summary')).toContainText('each ran 1:00 from 0:00');
  await expect(page.getByTestId('compare-time')).toContainText('both ran 1:00');
  // Both arms stand at the same moment.
  await expect(page.getByTestId('compare-label-A')).toContainText('+1:00');
  await expect(page.getByTestId('compare-label-B')).toContainText('+1:00');
  // The prediction is shown beside the results.
  await expect(page.getByTestId('compare-prediction-shown')).toHaveText(prediction);
  const table = page.getByTestId('compare-table');
  await expect(table.getByRole('columnheader')).toHaveText(['Measure', 'A', 'B', 'B − A']);
  await expect(table.getByRole('rowheader', { name: 'Carbon added since the start' })).toBeVisible();
  const carbonRow = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Carbon added since the start' }) });
  await expect(carbonRow.getByRole('cell').nth(0)).toHaveText('0.00'); // A never received the change

  // Pick a conclusion label and save the result card.
  const supports = page.getByTestId('compare-conclusion-supports');
  await supports.scrollIntoViewIfNeeded();
  await supports.click();
  await expect(supports).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('compare-conclusion-contradicts')).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('compare-save-card').click();
  await expect(page.getByTestId('compare-save-card')).toHaveText('Result card saved');
  // G2 comprehension M1: the toast says where the card is kept, and Done says how to keep a changed dish.
  await expect(page.getByText('Result card saved on this device. Notebook → Journal lists it.')).toBeVisible();
  await expect(page.getByTestId('compare-done-note')).toContainText('To keep a changed version as its own dish, use More → Duplicate dish and change the copy.');
  const cards = await page.evaluate(() => JSON.parse(localStorage.getItem('pixelmeba.compareCards') ?? '[]') as { prediction: string; conclusion: string; label: string; ticks: number }[]);
  expect(cards[0]).toMatchObject({ prediction, conclusion: 'supports', label: 'this paired run', ticks: 600 });
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);

  // Done discards the copies; the Garden is exactly where it was (still 0:00, 56 alive, paused).
  await page.getByTestId('compare-done').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('0:00 · 56 alive');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');

  // M1: the saved card is listed in Notebook → Journal, one line from what it recorded, opening to its table.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-journal').click();
  const result = page.getByTestId('journal-result');
  await expect(result).toHaveCount(1);
  await expect(result.getByRole('heading', { level: 3 })).toHaveText(
    /^“Little Living Garden” at 0:00 · B: Sugar, 0\.1 per cell on \d+ cells · both ran 1:00 · Organisms alive: A \d+, B \d+ \((?:[+−]\d+|0)\) · Your conclusion: Supports my prediction$/,
  );
  await expect(result.getByText(prediction)).toBeVisible();
  await result.getByText('Measured at the end of that paired run').click();
  await expect(result.getByRole('rowheader', { name: 'Carbon added since the start' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
});

test('compare: A refuses the change, Clear change resets B, and closing from setup leaves the dish as it was', async ({ page }) => {
  test.setTimeout(120_000);
  await startGarden(page);
  await page.getByTestId('run-toggle').click();
  await expect.poll(() => simSeconds(page), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  await page.getByTestId('more').click();
  await page.getByTestId('action-compare').click();
  await expect(page.getByTestId('compare-screen')).toHaveAttribute('data-status', 'setup');
  const baseline = await page.getByTestId('compare-baseline').innerText();
  const at = /at (\d+:\d\d)/.exec(baseline)![1]!;

  await page.getByTestId('compare-feed').click();
  await page.getByTestId('feed-choose').click();
  if (await page.getByTestId('compare-show-A').isVisible()) await page.getByTestId('compare-show-A').click();
  await tapArm(page, 'A', 0.42, 0.5);
  await expect(page.getByText('A is the baseline and stays unchanged. Place your change on B.')).toBeVisible();
  await expect(page.getByTestId('compare-change')).toHaveCount(0);

  await page.getByTestId('compare-feed').click();
  await page.getByTestId('feed-choose').click();
  if (await page.getByTestId('compare-show-B').isVisible()) await page.getByTestId('compare-show-B').click();
  // m4: a refused placement says why and keeps the chosen food for the next tap.
  await tapArm(page, 'B', 0.01, 0.01);
  await expect(page.getByText("That can't go there: food can't go onto stone, a wall or beyond the rim. Tap open water.")).toBeVisible();
  await expect(page.getByText('Now tap dish B to place it.')).toBeVisible();
  await expect(page.getByTestId('compare-change')).toHaveCount(0);
  await tapArm(page, 'B', 0.42, 0.5);
  await expect(page.getByTestId('compare-change')).toBeVisible();
  await page.getByTestId('compare-clear').click();
  await expect(page.getByTestId('compare-change')).toHaveCount(0);
  await expect(page.getByTestId('compare-run')).toBeDisabled();

  // Closing restores the dish's prior run state (it was running) from the same moment.
  await page.getByTestId('compare-close').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  const [m, s] = at.split(':').map(Number);
  expect(await simSeconds(page)).toBeGreaterThanOrEqual(m! * 60 + s!);
});
