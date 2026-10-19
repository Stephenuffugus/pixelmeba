/**
 * Phase 5 experiment cards in the Notebook (wave 15 p5-polish; BUILD_DIRECTIVE P5.6; SPEC §13.1 "test‑only overrides
 * disclosed in the setup panel and export"; UX §3.3 mode labels "wherever a world is described"; D-0131):
 *   - Notebook → Experiments lists the thirteen Phase 5 cards (stage 1's EXP_205 … EXP_211, stage 2's EXP_213 …
 *     EXP_218) with their titles;
 *   - EXP_207's card names the shutter and the habitat's regions (its measures read "Salt moved across shutter
 *     gates", "Mean salt in the Fresh pool" …); started, the dish's mode line carries no test-only label;
 *   - E214 discloses its test-only override (stage 2, cards-curated, un-skipped it: the setup panel's block, More's
 *     mode line ending "test‑only override", and the saved slot's label in Saved dishes).
 * Each screen: no serious or critical axe violation, no horizontal overflow, text ≥ 16 px. No screenshot assertion.
 */
import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings } from './helpers';
import { expectTextAtLeast16px, expectTouchTargets, openExperiments, phase5Cards, STAGE1_IDS, STAGE2_IDS, TEST_ONLY } from './experimentsP5Fixture';

test('Phase 5 cards: Notebook lists the thirteen (EXP_205 … EXP_211, EXP_213 … EXP_218); EXP_207 names the shutter and regions; its dish has no test-only label', async ({ page }) => {
  test.setTimeout(240_000);
  await seedSettings(page, { showPrompts: false });
  await openExperiments(page);

  const cards = phase5Cards();
  const ids: readonly string[] = [...STAGE1_IDS, ...STAGE2_IDS];
  expect(cards.map((c) => c.id)).toEqual([...ids].sort());
  for (const c of cards.filter((x) => ids.includes(x.id))) {
    const button = page.getByTestId(`experiment-card-${c.id}`);
    await expect(button).toHaveCount(1);
    await expect(page.getByRole('heading', { name: c.title, exact: true })).toBeVisible();
  }
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, '.nb-page');
  await expectNoSeriousA11yViolations(page);

  // EXP_207 in full: the shutter, the two pools of its habitat, and no test-only block (its recipe has none).
  await page.getByTestId('experiment-card-EXP_207').click();
  const card = page.getByTestId('experiment-card');
  await expect(card).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(cards.find((c) => c.id === 'EXP_207')!.title);
  await expect(card).toContainText('shutter');
  await expect(card.getByText('Salt moved across shutter gates', { exact: true })).toBeVisible();
  await expect(card.getByText('Mean salt in the Fresh pool', { exact: true })).toBeVisible();
  await expect(card.getByText('Mean salt in the Brine pool', { exact: true })).toBeVisible();
  await expect(card.getByText('Sprinters in the Fresh pool', { exact: true })).toBeVisible();
  await expect(card.getByText('Open or close the shutter: tap the shutter gate and switch it.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('experiment-test-override')).toHaveCount(0);
  await expectReachable(page.getByTestId('experiment-start'));
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, '[data-testid="experiment-card"]');
  await expectTouchTargets(page, '[data-testid="experiment-card"]');
  await expectNoSeriousA11yViolations(page);

  // Start it: a single-arm card opens its dish; More's mode line describes it without a test-only label.
  await page.getByTestId('experiment-start').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('more').click();
  const modes = page.getByTestId('more-world-label');
  // The card's recipe settings (CT 10.3 defaults: Standard, Identical); the shipped registry is partial, so Core
  // prototype follows (UX §3.3); nothing after it.
  await expect(modes).toHaveText(/^Standard Evolution · Identical founders · Core prototype — quantitative evolution$/);
  await expect(modes).not.toContainText(TEST_ONLY);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
});

test('E214 discloses its test-only override', async ({ page }) => {
  test.setTimeout(240_000);
  await seedSettings(page, { showPrompts: false });
  await openExperiments(page);
  await page.getByTestId('experiment-card-EXP_214').click();
  const block = page.getByTestId('experiment-test-override');
  await expect(block).toBeVisible();
  // Announced by its heading; the block comes before the setup lines (the Recipe heading).
  await expect(page.getByRole('region', { name: 'Test-only override' })).toBeVisible();
  await expect(block).toContainText('This card’s fixture changes the rules for this test only:');
  await expect(block).toContainText('(normally ');
  await expect(block).toContainText('It is never offered in an ordinary dish.');
  const order = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="experiment-test-override"]')!;
    const recipe = Array.from(document.querySelectorAll('[data-testid="experiment-card"] h2')).find((h) => h.textContent === 'Recipe')!;
    return b.compareDocumentPosition(recipe) & Node.DOCUMENT_POSITION_FOLLOWING;
  });
  expect(order).toBeTruthy();
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, '[data-testid="experiment-card"]');
  await expectNoSeriousA11yViolations(page);

  // Started, the dish is described with the label (UX §3.3) …
  await page.getByTestId('experiment-start').click();
  await expect(page.getByTestId('dish-screen').or(page.getByTestId('experiment-run-screen'))).toBeVisible({ timeout: 60_000 });
  if (await page.getByTestId('experiment-run-screen').isVisible()) {
    await expect(page.getByTestId('experiment-world-modes')).toContainText(TEST_ONLY);
    return; // a paired E214 describes its copies on the run screen; the save path below is the single-arm dish's
  }
  await page.getByTestId('more').click();
  await expect(page.getByTestId('more-world-label')).toHaveText(new RegExp(`· ${TEST_ONLY}$`));
  await expectNoSeriousA11yViolations(page);
  // … and so is its save, in Saved dishes (SlotModes.testOnly).
  await page.getByTestId('more-save').click();
  await page.getByTestId('save-confirm').click();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toBeVisible();
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await expect(page.getByTestId('slot-modes').first()).toContainText(TEST_ONLY);
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, 'main.page');
  await expectNoSeriousA11yViolations(page);
});
