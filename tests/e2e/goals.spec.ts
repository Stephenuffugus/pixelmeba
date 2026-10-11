/**
 * P4.4 journey (SPEC §13.5; D09 §6): Play → the Garden card's "Goal (optional)" has "No goal" checked by
 * default → choose "See a Sprinter split" → Start → Run at 4× → the one goal sentence appears while the
 * dish keeps running (speed and Run/Pause untouched) → Continue dismisses it → More shows the goal as
 * completed. No serious axe violations on the Play card with the goal choice nor on the goal sentence;
 * the choice rows are ≥ 48 px tall.
 */
import { expect, test } from '@playwright/test';
import { chooseSpeed, expectNoSeriousA11yViolations, expectSpeed, seedSettings, simSeconds } from './helpers';

test('an optional goal on the Garden: chosen on Play, completed while the dish runs, Continue, recorded in More', async ({ page }) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByTestId('home-play').click();

  // Off by default: "No goal" is checked; each Garden goal is offered with its summary.
  const choice = page.getByTestId('goal-choice');
  await expect(choice).toBeVisible();
  await expect(page.getByRole('group', { name: 'Goal (optional)' })).toBeVisible();
  const noGoal = page.getByRole('radio', { name: /^No goal/ });
  await expect(noGoal).toBeChecked();
  for (const title of ['Keep Sprinters going', 'See a Sprinter split', 'Watch starch become food']) await expect(page.getByRole('radio', { name: new RegExp(`^${title}`) })).not.toBeChecked();
  await expect(page.getByTestId('goal-choice-SEE_SPRINTER_SPLIT')).toContainText("Splits that are blocked or cancelled don't count.");
  for (const row of await page.locator('.goal-choice').all()) expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expectNoSeriousA11yViolations(page);

  await page.getByTestId('goal-choice-SEE_SPRINTER_SPLIT').click();
  await expect(page.getByRole('radio', { name: /^See a Sprinter split/ })).toBeChecked();
  await expect(noGoal).not.toBeChecked();
  await page.getByTestId('start-garden').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('56 alive');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run'); // the dish starts paused

  // The goal is running: More says so (and nothing was sent as a command: Undo stays unavailable).
  await page.getByTestId('more').click();
  await expect(page.getByTestId('goal-status')).toHaveText('Goal: See a Sprinter split — running since 0:00');
  await expect(page.getByTestId('goal-leave')).toBeVisible();
  await page.getByRole('region', { name: 'More' }).getByRole('button', { name: 'Close' }).click();

  await page.getByTestId('run-toggle').click();
  await chooseSpeed(page, 4);

  // The first committed Sprinter division (dish tick 350, shown at 0:35 on seed 104729): one sentence, the dish keeps running.
  const sentence = page.getByTestId('goal-sentence');
  await expect(sentence).toBeVisible({ timeout: 180_000 });
  await expect(sentence).toContainText('A Sprinter split at 0:35.');
  await expect(sentence).toHaveAttribute('role', 'status');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expectSpeed(page, 4);
  const t1 = await simSeconds(page);
  await expect.poll(() => simSeconds(page), { timeout: 30_000 }).toBeGreaterThan(t1);
  await expect(page.getByTestId('goal-continue')).toHaveText('Continue');
  await expectNoSeriousA11yViolations(page);

  await page.getByTestId('goal-continue').click();
  await expect(sentence).toHaveCount(0);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expectSpeed(page, 4);

  await page.getByTestId('more').click();
  await expect(page.getByTestId('goal-status')).toHaveText('Last goal: See a Sprinter split — completed at 0:35.');
  await expect(page.getByTestId('goal-try')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
