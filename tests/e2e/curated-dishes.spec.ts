/**
 * P3.9 journey (BUILD_DIRECTIVE P3.9; CT §9.3; UX §2.3): New Dish → a curated dish shows its question
 * and, for Borrowed Shelter, its pre-seeded genomes ("present at creation"); picking it takes the
 * recipe's own seed and settings (the authored dish), Randomize makes it the player's own version;
 * Create opens it paused in the Lab. Also: no serious axe violations, 48 px targets, 16 px text and
 * 200 % text. P5.6 (wave 15 cards-curated): Under the Canopy and The Jacket Garden join the list from their
 * records; The Jacket Garden's six jacketed Dartfins read "present at creation" in New Dish and the Evolution sheet.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings } from './helpers';

/** Every visible text inside `selector` is at least 16 px (UX §4.1/§9). */
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

async function openNewDish(page: Page, settings: Record<string, unknown> = {}): Promise<void> {
  await seedSettings(page, { showPrompts: false, ...settings });
  await page.goto('/');
  await page.getByTestId('home-new').click();
  await expect(page.getByRole('heading', { name: 'New dish' })).toBeVisible();
  await expect(page.getByTestId('new-dish-summary')).toBeVisible();
}

test('New Dish → Borrowed Shelter: question, pre-seeded genomes, authored seed, Randomize, Create', async ({ page }) => {
  test.setTimeout(180_000);
  await openNewDish(page);
  const choice = page.getByTestId('new-dish-start-with-curated:L306_BORROWED_SHELTER');
  await expectReachable(choice);
  await expect(choice).toContainText('Who pays for the film, who benefits?');
  await choice.click();
  await expect(choice).toHaveAttribute('aria-checked', 'true');

  // The recipe's own seed and settings: Create makes the dish as written.
  await expect(page.getByTestId('new-dish-seed')).toHaveValue('306');
  await expect(page.getByTestId('new-dish-name')).toHaveValue('Borrowed Shelter');
  await expect(page.getByTestId('new-dish-preset-standard')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('new-dish-founders-identical')).toHaveAttribute('aria-checked', 'true');
  const summary = page.getByTestId('new-dish-summary');
  await expect(page.getByTestId('new-dish-question')).toHaveText('Borrowed Shelter asks: Who pays for the film, who benefits?');
  await expect(page.getByTestId('new-dish-labels')).toHaveText('Pre-seeded genomes');
  await expect(page.getByTestId('new-dish-preseeded')).toContainText('present at creation');
  await expect(page.getByTestId('new-dish-preseeded')).toContainText('20 of the 40 Crumbsmiths start with Matrix builder; 20 start without');
  await expect(page.getByTestId('new-dish-authored')).toHaveText('This is Borrowed Shelter as written, with its own seed 306.');
  await expect(summary).toContainText('40 Crumbsmiths');
  await expect(summary).toContainText('Seed 306');
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, 'main.page');

  // Randomize stays available; the dish then says it is the player's own version.
  await expectReachable(page.getByTestId('new-dish-randomize'));
  await page.getByTestId('new-dish-randomize').click();
  await expect(page.getByTestId('new-dish-authored')).toContainText('Your own version of Borrowed Shelter: seed');
  await expect(page.getByTestId('new-dish-authored')).toContainText('instead of 306');
  // Choosing the dish again takes its own seed back.
  await page.getByTestId('new-dish-start-with-garden').click();
  await expect(page.getByTestId('new-dish-name')).toHaveValue('My dish');
  await choice.click();
  await expect(page.getByTestId('new-dish-seed')).toHaveValue('306');
  await expect(page.getByTestId('new-dish-authored')).toHaveText('This is Borrowed Shelter as written, with its own seed 306.');

  // Create: paused, in the Lab, with the forty Crumbsmiths.
  await expectReachable(page.getByTestId('new-dish-start'));
  await page.getByTestId('new-dish-start').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('dish-screen')).toHaveAttribute('data-view', 'lab');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expect(page.getByTestId('sim-time')).toContainText('0:00 · 40 alive');
  await expectNoSeriousA11yViolations(page);
});

test('New Dish → Public Kitchen (Diverse) at 200 % text: question and abilities present at creation', async ({ page }) => {
  test.setTimeout(180_000);
  await openNewDish(page, { textScale: 2 });
  const choice = page.getByTestId('new-dish-start-with-curated:L303_PUBLIC_KITCHEN');
  await expectReachable(choice);
  await choice.click();
  await expect(page.getByTestId('new-dish-seed')).toHaveValue('303');
  await expect(page.getByTestId('new-dish-founders-diverse')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('new-dish-question')).toHaveText('Public Kitchen asks: Who benefits from accessible food?');
  await expect(page.getByTestId('new-dish-diverse')).toContainText('present at creation');
  await expect(page.getByTestId('new-dish-summary')).toContainText('20 Brothmakers and 20 Creambuds');
  for (const id of ['new-dish-randomize', 'new-dish-start', 'new-dish-start-with-curated:L301_TWO_LUNCHES']) await expectReachable(page.getByTestId(id));
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, 'main.page');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('new-dish-start').click();
  await expect(page.getByTestId('dish-screen')).toHaveAttribute('data-view', 'lab');
  await expect(page.getByTestId('sim-time')).toContainText('0:00 · 40 alive');
});

/** More → Evolution: the sheet's "what the founders carried" line (UX §3.3; strings/modes.ts creationFoundersText). */
async function openEvolutionSheet(page: Page): Promise<void> {
  await page.getByTestId('more').click();
  await expectReachable(page.getByTestId('more-evolution'));
  await page.getByTestId('more-evolution').click();
  await expect(page.getByTestId('evolution-sheet')).toBeVisible();
}

test('New Dish → The Jacket Garden (P5.6): question, six jacketed Dartfins present at creation, and the Evolution sheet says so', async ({ page }) => {
  test.setTimeout(180_000);
  await openNewDish(page);
  const choice = page.getByTestId('new-dish-start-with-curated:L305_THE_JACKET_GARDEN');
  await expectReachable(choice);
  await expect(choice).toContainText('Is delayed capture worth the cost?');
  await choice.click();
  await expect(choice).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('new-dish-seed')).toHaveValue('305');
  await expect(page.getByTestId('new-dish-name')).toHaveValue('The Jacket Garden');
  await expect(page.getByTestId('new-dish-founders-identical')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('new-dish-question')).toHaveText('The Jacket Garden asks: Is delayed capture worth the cost?');
  await expect(page.getByTestId('new-dish-labels')).toHaveText('Pre-seeded genomes');
  await expect(page.getByTestId('new-dish-preseeded')).toContainText('present at creation');
  await expect(page.getByTestId('new-dish-preseeded')).toContainText('6 of the 12 Dartfins start with Mineral jacket; 6 start without');
  await expect(page.getByTestId('new-dish-authored')).toHaveText('This is The Jacket Garden as written, with its own seed 305.');
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, 'main.page');

  await expectReachable(page.getByTestId('new-dish-start'));
  await page.getByTestId('new-dish-start').click();
  await expect(page.getByTestId('dish-screen')).toHaveAttribute('data-view', 'lab');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expect(page.getByTestId('sim-time')).toContainText('0:00 · 114 alive');
  await openEvolutionSheet(page);
  await expect(page.getByTestId('evolution-creation')).toHaveText('Present at creation: 6 of 12 Dartfins carried Mineral jacket.');
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, '[data-testid="evolution-sheet"]');
  await expectNoSeriousA11yViolations(page);
});

test('New Dish → Under the Canopy (P5.6, Diverse): question, authored seed, Create', async ({ page }) => {
  test.setTimeout(180_000);
  await openNewDish(page);
  const choice = page.getByTestId('new-dish-start-with-curated:L302_UNDER_THE_CANOPY');
  await expectReachable(choice);
  await expect(choice).toContainText('Who persists in the shade they create?');
  await choice.click();
  await expect(page.getByTestId('new-dish-seed')).toHaveValue('302');
  await expect(page.getByTestId('new-dish-founders-diverse')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('new-dish-question')).toHaveText('Under the Canopy asks: Who persists in the shade they create?');
  await expect(page.getByTestId('new-dish-labels')).toHaveCount(0);
  await expect(page.getByTestId('new-dish-diverse')).toContainText('present at creation');
  await expect(page.getByTestId('new-dish-summary')).toContainText('30 Sunbeads');
  await expect(page.getByTestId('new-dish-summary')).toContainText('20 Raftballs');
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, 'main.page');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('new-dish-start').click();
  await expect(page.getByTestId('dish-screen')).toHaveAttribute('data-view', 'lab');
  await expect(page.getByTestId('sim-time')).toContainText('0:00 · 50 alive');
  await openEvolutionSheet(page);
  await expect(page.getByTestId('evolution-creation')).toHaveText(/^Present at creation: .+\.$/);
  await expectNoSeriousA11yViolations(page);
});
