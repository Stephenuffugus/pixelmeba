import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations, selectOrganism, simSeconds, startGarden } from './helpers';

// P1.7 (SPEC §12.1, UX §5.1/§5.3): Summary, then each shortcut once.
test('tap an organism, read its Summary, and use each shortcut', async ({ page }) => {
  test.setTimeout(180_000);
  await startGarden(page);
  const id = await selectOrganism(page);
  const insp = page.getByTestId('inspector');
  await expect(insp.getByRole('heading', { level: 2 })).toContainText(`#${id}`);
  await expect(insp.getByTestId('constraint')).not.toBeEmpty();
  await expect(insp.getByRole('meter', { name: 'Energy' })).toBeVisible();
  await expect(insp.getByRole('meter', { name: 'Health' })).toBeVisible();

  // What does it eat? — its recorded diet and the measured intake.
  await insp.getByTestId('shortcut-eat').click();
  const answer = insp.getByTestId('shortcut-answer');
  await expect(answer).toContainText('What it eats');
  await expect(answer).toContainText(/It eats|makes its own food|catches other organisms/);
  await expect(answer).toContainText(/took in/);

  // Why did it stop? — jumps to "Happening now" and focuses the blockers.
  await insp.getByRole('tab', { name: 'Details' }).click();
  await insp.getByTestId('shortcut-why').click();
  await expect(insp.getByRole('tab', { name: 'Happening now' })).toHaveAttribute('aria-selected', 'true');
  const why = insp.getByTestId('why-stop');
  await expect(why).toBeFocused();
  await expect(why).toContainText("What's holding it back");
  await expect(why).toContainText(/split|slowing|food|room|energy|grow/i);

  // Where is its family? — a founder at 0:00 starts its own family.
  await insp.getByTestId('shortcut-family').click();
  await expect(answer).toContainText('Its family');
  await expect(answer).toContainText('It was added to the dish, so its family starts with it.');

  // What changed? — History opens at "What happened" for this kind of organism.
  await insp.getByTestId('shortcut-changed').click();
  const history = page.getByTestId('history');
  await expect(history).toBeVisible();
  await expect(history.getByRole('tab', { name: 'What happened' })).toHaveAttribute('aria-selected', 'true');
  await expect(history.getByTestId('history-organism')).toContainText(`#${id}`);
  await expect(history).toContainText(/Showing .+ events and events for the whole dish/);
  // P1.10: living biomass per species, as small multiples and in the table.
  await history.getByRole('tab', { name: 'Charts' }).click();
  await expect(history.getByRole('heading', { name: 'Living biomass' })).toBeVisible();
  await history.getByRole('tab', { name: 'Table' }).click();
  await expect(history.getByTestId('history-table').getByRole('columnheader', { name: 'Living biomass' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await history.getByRole('tab', { name: 'What happened' }).click();
  await expectNoSeriousA11yViolations(page);
  await history.getByTestId('history-back').click();
  await expect(insp).toBeVisible();
  await expect(insp.getByRole('heading', { level: 2 })).toContainText(`#${id}`);
  await expectNoSeriousA11yViolations(page);
});

test('after divisions, "Where is its family?" rings living relatives and can show one', async ({ page }) => {
  test.setTimeout(240_000); // runs the dish past the first divisions under software WebGL
  await startGarden(page);
  await page.getByTestId('run-toggle').click();
  await page.keyboard.press('4');
  // Sunbeads first split at about 29 s (docs/reports/tune-g1.md, seed 104729).
  await expect.poll(() => simSeconds(page), { timeout: 180_000, intervals: [1000] }).toBeGreaterThanOrEqual(34);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const id = await selectOrganism(page, [48.5, 48.5]); // the Sunbead patch
  const insp = page.getByTestId('inspector');
  await insp.getByTestId('shortcut-family').click();
  const answer = insp.getByTestId('shortcut-answer');
  await expect(answer).toContainText(/other living members? of its family|No other members of its family/);
  const members = answer.getByTestId('family-member');
  if ((await members.count()) === 0) test.skip(true, `#${id} has no living relatives in this run`);
  await expect(page.getByTestId('family-markers')).toBeAttached();
  // At least one ring is placed over a living relative (positions come from the renderer).
  await expect(page.locator('[data-testid="family-markers"] .family-marker:not([hidden])').first()).toBeVisible();
  const first = members.first();
  const label = await first.innerText();
  const other = /#(\d+)/.exec(label)![1]!;
  await first.click();
  await expect(insp.getByRole('heading', { level: 2 })).toContainText(`#${other}`);
  // The rings stay while looking at a relative; the new organism's answers start closed.
  await expect(page.getByTestId('family-markers')).toBeAttached();
  await expect(insp.getByTestId('shortcut-answer')).toHaveCount(0);
  // Hiding the rings closes the family answer instead of leaving it waiting.
  await insp.getByTestId('shortcut-family').click();
  await expect(insp.getByTestId('family-member').first()).toBeVisible();
  await insp.getByRole('button', { name: 'Hide family rings' }).click();
  await expect(page.getByTestId('family-markers')).toHaveCount(0);
  await expect(insp.getByTestId('shortcut-answer')).toHaveCount(0);
});
