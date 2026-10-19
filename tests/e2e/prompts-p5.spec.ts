/**
 * P5.6 part 3 journey (CT §10.6; D02 §23; SPEC §13.5; D-0071, D-0074, D-0079, D-0131): the play prompts on habitat
 * dishes, reached by importing fixture dishes built in Node (tests/e2e/promptsP5Fixture.ts).
 *
 * - An H05 Brine Mosaic dish: More → "Try a goal…" offers "Two neighborhoods" with its summary; Start shows it
 *   running in More; Leave goal continues freely. The challenge editor offers "Start from: Recover a
 *   neighborhood", which fills in the template (3 actions, every tool, 180 s) and lists the dish's own regions by
 *   label (no whole-dish choice while a starting limit is set); a Recover challenge on the empty channel saves.
 * - A dish whose Two neighborhoods hold has run since 0:00: Run → the one notice slot shows its sentence at 3:00 and
 *   the dish keeps running; Continue dismisses it.
 * No screenshot assertions; axe and no sideways overflow on each screen; controls ≥ 48 px and text ≥ 16 px.
 */
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { REPO_ROOT } from '../../tools/lib/content-fs';
import { writeBrineCommunityFixture, writeNearlyHeldFixture } from './promptsP5Fixture';
import { chooseSpeed, expectNoHorizontalOverflow, expectNoSeriousA11yViolations, seedSettings } from './helpers';

const DIR = join(REPO_ROOT, 'tmp', 'e2e-prompts-p5');
const BRINE = join(DIR, `brine-community-${process.pid}.pixelmeba`);
const NEARLY = join(DIR, `nearly-held-${process.pid}.pixelmeba`);

test.beforeAll(async () => {
  test.setTimeout(240_000);
  await writeBrineCommunityFixture(BRINE);
  await writeNearlyHeldFixture(NEARLY);
});

test.afterAll(() => {
  rmSync(BRINE, { force: true });
  rmSync(NEARLY, { force: true });
});

async function importDish(page: Page, file: string): Promise<void> {
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.locator('input[aria-label="Import a dish file"]').setInputFiles(file);
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
}

/** No visible text under 16 CSS px inside `root`. */
async function expectText16(page: Page, testId: string): Promise<void> {
  const small = await page.getByTestId(testId).evaluate((root) =>
    Array.from(root.querySelectorAll('*'))
      .filter((el) => (el as HTMLElement).offsetParent !== null && Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== ''))
      .map((el) => `${parseFloat(getComputedStyle(el).fontSize)} ${(el.textContent ?? '').slice(0, 30)}`)
      .filter((s) => parseFloat(s) < 15.9),
  );
  expect(small).toEqual([]);
}

async function expectTargets(page: Page, selector: string): Promise<void> {
  for (const el of await page.locator(selector).all()) {
    if (!(await el.isVisible())) continue;
    expect((await el.boundingBox())!.height, await el.innerText()).toBeGreaterThanOrEqual(48);
  }
}

test('an H05 dish offers Two neighborhoods; Start shows it running; Leave; the editor starts from Recover a neighborhood with the dish’s regions', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await importDish(page, BRINE);
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);

  await page.getByTestId('more').click();
  await page.getByTestId('goal-try').click();
  const offer = page.getByTestId('goal-start-TWO_NEIGHBORHOODS');
  await expect(offer).toHaveText('Two neighborhoods');
  await expect(page.locator('#goal-offers')).toContainText('more than 5 Sprinters in the fresh pool and more than 5 Brinecoils in the brine pool');
  // Recover is a challenge starting point, never a goal.
  await expect(page.getByTestId('goal-start-RECOVER_A_NEIGHBORHOOD')).toHaveCount(0);
  await expectTargets(page, '#goal-offers .btn');
  await expectNoSeriousA11yViolations(page);
  await offer.click();
  await page.getByTestId('more').click();
  await expect(page.getByTestId('goal-status')).toHaveText(/^Goal: Two neighborhoods — running since 0:02$/);
  await page.getByTestId('goal-leave').click();
  await expect(page.getByTestId('goal-status')).toHaveText(/^Last goal: Two neighborhoods — left at 0:02\. Continued freely\.$/);
  await expectNoSeriousA11yViolations(page);

  // More → Make a challenge…: Start from: Recover a neighborhood.
  await page.getByRole('button', { name: 'Make a challenge…' }).click();
  const editor = page.getByTestId('challenge-editor');
  await expect(editor).toBeVisible();
  const from = page.getByTestId('ch-start-from');
  await expect(from.locator('option')).toHaveText(['A blank challenge', 'Recover a neighborhood']);
  await from.selectOption('RECOVER_A_NEIGHBORHOOD');
  await expect(page.getByTestId('ch-name')).toHaveValue('Recover a neighborhood');
  await expect(page.getByRole('radio', { name: /^Reach a biomass/ })).toBeChecked();
  await expect(page.getByTestId('ch-measure')).toHaveValue('activeCount');
  await expect(page.getByTestId('ch-threshold')).toHaveValue('20');
  await expect(page.getByTestId('ch-from-below')).toHaveValue('5');
  await expect(page.getByTestId('ch-budget')).toHaveValue('3');
  await expect(page.getByTestId('ch-length-180').locator('input')).toBeChecked();
  // The dish's own regions by label (quarters stay; no whole dish while a starting limit is set).
  await expect(page.getByTestId('ch-region').locator('option')).toHaveText([
    'Top-left quarter',
    'Top-right quarter',
    'Bottom-left quarter',
    'Bottom-right quarter',
    'Fresh pool (a region of this dish)',
    'Brine pool (a region of this dish)',
    'Channel (a region of this dish)',
  ]);
  await expect(page.getByTestId('ch-region')).toHaveValue('habitat:FRESH_POOL');
  await expect(page.getByTestId('ch-summary')).toContainText('Bring the region “Fresh pool” from fewer than 5 to at least 20 active organisms.');
  await expect(page.getByTestId('ch-restrictions')).toContainText('Up to 3 actions.');
  await expectText16(page, 'challenge-editor');
  await expectTargets(page, '[data-testid="challenge-editor"] .btn, [data-testid="challenge-editor"] select');
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  // The fresh pool already has 5 Sprinters: nothing to recover there. The empty channel saves.
  await page.getByTestId('ch-save').click();
  await expect(page.getByTestId('ch-message')).toContainText('This region already has 5 or more active organisms, so there is nothing to recover.');
  await page.getByTestId('ch-region').selectOption('habitat:CHANNEL');
  await page.getByTestId('ch-save').click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Challenge “Recover a neighborhood” saved.');
  // Fix round 1: the start sheet names the region by its label, not its id.
  if (!(await page.getByTestId('more-challenge-start').isVisible())) await page.getByTestId('more').click();
  await page.getByTestId('more-challenge-start').click();
  await expect(page.getByTestId('ch-start-goal')).toContainText('the region “Channel”');
  await expect(page.getByTestId('ch-start-goal')).not.toContainText('CHANNEL');
  await expectNoSeriousA11yViolations(page);
  expect(errors).toEqual([]);
});

test('a hold measured since 0:00 completes one second after Run: the one notice slot shows its sentence, the dish keeps running', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await importDish(page, NEARLY);
  await page.getByTestId('more').click();
  await expect(page.getByTestId('goal-status')).toHaveText('Goal: Two neighborhoods — running since 0:00');
  await page.getByRole('region', { name: 'More' }).getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('run-toggle').click();
  await chooseSpeed(page, 1);
  const sentence = page.getByTestId('goal-sentence');
  await expect(sentence).toBeVisible({ timeout: 60_000 });
  await expect(sentence).toContainText('Both neighborhoods held more than 5 for 180 seconds, measured in this attempt at 3:00.');
  await expect(sentence).toHaveAttribute('role', 'status');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('goal-continue').click();
  await expect(sentence).toHaveCount(0);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  expect(errors).toEqual([]);
});
