/**
 * P2.2 journey (BUILD_DIRECTIVE "Done when"): New Dish → Varied + Accelerated → the UX §3.3 labels
 * are visible → Advanced shows the per-offspring rates → the dish opens paused in the Lab with the
 * Life tray open (UX §2.3) → change the evolution setting during play → History shows the change,
 * and Undo rewinds it. Also: no serious axe violations, 48 px targets, and 200 % text.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  expectReachable,
  seedSettings,
  simSeconds,
} from './helpers';

const ACCELERATED = 'Accelerated Evolution (game setting, not realism)';
const CORE = 'Core prototype — quantitative evolution';

/** Every visible text inside `selector` is at least 16 px (UX §4.1/§9; it scales with the Settings text size). */
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
        if (fs < 15.9)
          out.push(`${el.tagName.toLowerCase()}.${el.className}: ${fs}px “${text.slice(0, 40)}”`);
      }
    }
    return out;
  }, selector);
  expect(small).toEqual([]);
}

/** UX §2.3: the new dish enters with the Life tray open, its items on screen and focus in the tray. */
async function expectLifeTrayShown(page: Page): Promise<void> {
  await expect(page.getByTestId('lab-cat-life')).toHaveAttribute('aria-expanded', 'true');
  const first = page.locator('[data-testid="lab-tray"][data-category="life"] .lab-item').first();
  await expect(first).toBeInViewport({ ratio: 0.5 });
  await expect(first).toBeFocused();
}

async function openNewDish(page: Page, settings: Record<string, unknown> = {}): Promise<void> {
  await seedSettings(page, { showPrompts: false, ...settings });
  await page.goto('/');
  await page.getByTestId('home-new').click();
  await expect(page.getByRole('heading', { name: 'New dish' })).toBeVisible();
  // The summary comes from the worker building the dish the choices describe.
  await expect(page.getByTestId('new-dish-summary')).toBeVisible();
}

test('New Dish → Varied + Accelerated → labels → rates → change during play → History', async ({ page }) => {
  // A running dish on a loaded machine: generous time (the steps themselves wait on real state).
  test.setTimeout(300_000);
  await openNewDish(page);
  await page.getByTestId('new-dish-seed').fill('104729');
  await page.getByTestId('new-dish-founders-varied').click();
  await page.getByTestId('new-dish-preset-accelerated').click();
  await expect(page.getByTestId('new-dish-preset-accelerated')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('new-dish-founders-varied')).toHaveAttribute('aria-checked', 'true');

  // UX §3.3 labels wherever the world is described.
  const modes = page.getByTestId('new-dish-modes');
  await expect(modes).toContainText(ACCELERATED);
  await expect(modes).toContainText('Varied founders');
  await expect(modes).toContainText(CORE);
  await expect(page.getByTestId('new-dish-summary')).toContainText('24 Sprinter');
  await expect(page.getByTestId('new-dish-summary')).toContainText('Seed 104729');
  await expect(page.getByTestId('new-dish-ledger')).toContainText('carbon');

  // Advanced shows the per-offspring rates of the chosen preset (CT §12.8).
  const advanced = page.getByTestId('new-dish-advanced');
  await expectReachable(advanced);
  await advanced.click();
  const rates = page.getByTestId('new-dish-rates');
  await expect(rates.locator('[data-rate="quantitative"] td')).toHaveText('16 %');
  await expect(rates.locator('[data-rate="preference"] td')).toHaveText('4 %');
  await expect(rates.locator('[data-rate="module"] td')).toHaveText('1 %');
  await page.getByTestId('new-dish-preset-standard').click();
  await expect(rates.locator('[data-rate="quantitative"] td')).toHaveText('8 %');
  await expect(rates.locator('[data-rate="module"] td')).toHaveText('0.2 %');
  await page.getByTestId('new-dish-preset-accelerated').click();
  await expect(rates.locator('[data-rate="quantitative"] td')).toHaveText('16 %');

  // Content: the recorded registry, read-only.
  await page.getByTestId('new-dish-content').click();
  await expect(page.getByTestId('new-dish-registry')).toContainText('Module registry version 1');
  await expect(page.getByTestId('new-dish-registry')).toContainText('(E05)');

  for (const id of [
    'new-dish-founders-diverse',
    'new-dish-preset-fixed',
    'new-dish-randomize',
    'new-dish-start',
  ])
    await expectReachable(page.getByTestId(id));
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, 'main.page');

  // Create: paused, in the Lab, with the Life tray open (UX §2.3).
  await page.getByTestId('new-dish-start').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('dish-screen')).toHaveAttribute('data-view', 'lab');
  await expectLifeTrayShown(page);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expect(page.getByTestId('sim-time')).toContainText('0:00 · 56 alive');

  // Play, then change the evolution setting while the dish runs.
  await page.getByTestId('run-toggle').click();
  await expect.poll(() => simSeconds(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await page.getByTestId('more').click();
  await expect(page.getByTestId('more-world-label')).toHaveText(`${ACCELERATED} · Varied founders · ${CORE}`);
  await page.getByTestId('more-evolution').click();
  const sheet = page.getByTestId('evolution-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.locator('#evolution-title')).toBeFocused(); // focus moves into the sheet
  await expect(page.getByTestId('evolution-world-label')).toContainText(ACCELERATED);
  // What this dish's founders carried, from its records (FIRST_DISH_V1 gives none an ability).
  await expect(page.getByTestId('evolution-creation')).toHaveText(
    'None of the founders placed at 0:00 carried an extra ability.',
  );
  await expect(page.getByTestId('evolution-rates').locator('[data-rate="quantitative"] td')).toHaveText(
    '16 %',
  );
  await expect(page.getByTestId('evolution-changes-none')).toBeVisible();
  await expect(page.getByTestId('evolution-founders')).toContainText('Varied founders');
  await expect(page.getByTestId('evolution-registry')).toContainText('3 of 17 abilities');
  await expectReachable(page.getByTestId('evolution-preset-standard'));
  await expectNoSeriousA11yViolations(page);
  await expectTextAtLeast16px(page, '[data-testid="evolution-sheet"]');
  const before = await simSeconds(page);
  await page.getByTestId('evolution-preset-standard').click();
  await expect(page.getByTestId('evolution-preset-standard')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('evolution-rates').locator('[data-rate="quantitative"] td')).toHaveText(
    '8 %',
  );
  const changes = page.getByTestId('evolution-changes');
  await expect(changes).toContainText(`Evolution changed from ${ACCELERATED} to Standard Evolution.`);
  await expectTextAtLeast16px(page, '[data-testid="evolution-sheet"]');
  // Timestamped: the recorded time is the dish's time when the change was made (it kept running).
  const stamp = /(\d+):(\d\d)/.exec(await changes.locator('.change-time').first().innerText());
  expect(stamp).not.toBeNull();
  expect(Number(stamp![1]) * 60 + Number(stamp![2])).toBeGreaterThanOrEqual(before);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  // The change was made while the dish ran; pause it now so the rest of the journey reads a still dish.
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');

  // History shows the intervention.
  await page.getByTestId('more').click();
  await page.getByTestId('more-history').click();
  await page.getByRole('tab', { name: 'What happened' }).click();
  await expect(page.getByTestId('history-events')).toContainText(
    `Evolution changed from ${ACCELERATED} to Standard Evolution.`,
  );

  // Undo rewinds it like any other change: the setting and History go back.
  await page.getByTestId('lab-undo').click();
  await expect(page.getByTestId('history-events')).not.toContainText('Evolution changed from');
  await page.getByTestId('more').click();
  await expect(page.getByTestId('more-world-label')).toContainText(ACCELERATED);

  // UX §3.3 "wherever a world is described": the saved dish on Home and in Saved dishes.
  const LINE = `${ACCELERATED} · Varied founders · ${CORE}`;
  await page.getByTestId('more-save').click();
  await page.getByTestId('save-confirm').click();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toBeVisible();
  // The Save sheet's slot now names the saved world's modes too.
  await page.getByTestId('more').click();
  await page.getByTestId('more-save').click();
  await expect(page.locator('.slot-modes').first()).toHaveText(LINE);
  await expectTextAtLeast16px(page, '.slot-modes');
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.getByTestId('home-continue-modes')).toHaveText(LINE); // the open dish
  await page.reload();
  await expect(page.getByTestId('home-continue-modes')).toHaveText(LINE); // its autosave
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await expect(page.getByTestId('slot-modes').first()).toHaveText(LINE);
  await expect(page.getByTestId('slot-modes')).toHaveCount(2); // the slot and the autosave
  await expectTextAtLeast16px(page, 'main.page');
  // A refused import says so on this page too (a toast host for pages without a dish).
  await page.locator('input[type="file"]').setInputFiles({
    name: 'broken.pixelmeba',
    mimeType: 'application/json',
    buffer: Buffer.from('not a dish'),
  });
  await expect(page.getByTestId('page-toast')).toContainText('Nothing was changed');
  await expect(page.getByRole('heading', { name: 'Saved dishes' })).toBeVisible();
});

test('New Dish and the evolution sheet work at 200 % text', async ({ page }) => {
  test.setTimeout(180_000);
  await openNewDish(page, { textScale: 2 });
  await page.getByTestId('new-dish-founders-diverse').click();
  await expect(page.getByTestId('new-dish-modes')).toContainText('Diverse founders');
  await expect(page.getByTestId('new-dish-diverse')).toContainText('present at creation');
  await page.getByTestId('new-dish-advanced').click();
  await expect(page.getByTestId('new-dish-rates').locator('[data-rate="quantitative"] td')).toHaveText('8 %');
  for (const id of [
    'new-dish-preset-accelerated',
    'new-dish-founders-varied',
    'new-dish-advanced',
    'new-dish-start',
  ])
    await expectReachable(page.getByTestId(id));
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, 'main.page');
  await page.getByTestId('new-dish-start').click();
  // Paused, in the Lab, with the Life tray open (UX §2.3), at 200 % text too.
  await expect(page.getByTestId('dish-screen')).toHaveAttribute('data-view', 'lab');
  await expectLifeTrayShown(page);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await page.getByTestId('more').click();
  await expectReachable(page.getByTestId('more-evolution'));
  await page.getByTestId('more-evolution').click();
  await expect(page.getByTestId('evolution-sheet')).toBeVisible();
  await expectReachable(page.getByTestId('evolution-preset-accelerated'));
  await expect(page.getByTestId('evolution-world-label')).toContainText('Diverse founders');
  await expect(page.getByTestId('evolution-creation')).toHaveText(
    /^(Present at creation: .+|None of the founders placed at 0:00 carried an extra ability\.)$/,
  );
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  await expectTextAtLeast16px(page, '[data-testid="evolution-sheet"]');

  // Keyboard (UX §4.2): arrows move between the options without choosing; Space chooses the focused
  // one and never runs the dish behind the sheet.
  await page.getByTestId('evolution-preset-accelerated').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('evolution-preset-fixed')).toBeFocused();
  await expect(page.getByTestId('evolution-preset-fixed')).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('evolution-preset-fixed')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('evolution-changes')).toContainText(
    'Evolution changed from Standard Evolution to Fixed Traits.',
  );
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');

  // "New dish…" from the sheet: New Dish says the open dish would close; Back returns to it running.
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.getByTestId('evolution-new-dish').click();
  await expect(page.getByRole('heading', { name: 'New dish' })).toBeVisible();
  await expect(page.getByTestId('new-dish-replaces')).toContainText('Creating a new dish closes');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
});
