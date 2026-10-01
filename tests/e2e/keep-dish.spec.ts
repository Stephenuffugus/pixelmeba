import { writeFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { buildSaveFile } from '../../src/persistence/saveFile';
import { realizeRecipe } from '../../src/sim/recipes';
import { run } from '../../src/sim/tick';
import { registry } from '../helpers/world';
import {
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  expectReachable,
  seedSettings,
  simSeconds,
  startGarden,
  tapViewport,
} from './helpers';

// D-0033 "keep the open dish first": every action that replaces the open dish keeps it first, as What
// if? does — its own slot, else the first empty one — and says so in one short line (nothing when
// nothing was written). With all ten slots used the Keep sheet offers export, a deliberate replacement
// or Cancel (nothing changes).

const title = (page: Page) => page.locator('.topbar .title strong');

/**
 * Record every toast the page shows, in order (a toast lasts a few seconds; on a slow project the next
 * step can outlast it). Installed before the app loads.
 */
async function recordToasts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __toasts: string[] }).__toasts = seen;
    // Every appearance counts, also the same text shown again after it went away (fix round 1).
    let shown: string[] = [];
    // The document node itself: an init script runs before <html> exists.
    new MutationObserver(() => {
      const now = Array.from(document.querySelectorAll('.toast'))
        .map((el) => el.textContent ?? '')
        .filter(Boolean);
      for (const t of now) if (!shown.includes(t)) seen.push(t);
      shown = now;
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

const toasts = (page: Page) => page.evaluate(() => [...(window as unknown as { __toasts: string[] }).__toasts]);

/** A toast with exactly this text was shown since the `from`-th recorded toast. */
async function expectToast(page: Page, text: string, from = 0): Promise<void> {
  await expect.poll(async () => (await toasts(page)).slice(from), { timeout: 30_000 }).toContain(text);
}

async function runFor(page: Page, seconds: number): Promise<number> {
  await page.getByTestId('run-toggle').click();
  await expect.poll(() => simSeconds(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(seconds);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  return simSeconds(page);
}

/** More → Save → Save: the first empty slot (the Save sheet's default). */
async function saveToFirstEmpty(page: Page): Promise<void> {
  await page.getByTestId('more').click();
  await page.getByTestId('more-save').click();
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-confirm')).toHaveCount(0);
}

/** More → Save → Slot 1 → Save → Replace (the Save sheet names the slots by number). */
async function saveOverSlot1(page: Page): Promise<void> {
  const mark = (await toasts(page)).length;
  await page.getByTestId('more').click();
  await page.getByTestId('more-save').click();
  await page.getByRole('button', { name: /^Slot 1(?!\d)/ }).click();
  await page.getByTestId('save-confirm').click();
  await page.getByRole('button', { name: 'Replace' }).click();
  await expect(page.getByTestId('save-confirm')).toHaveCount(0);
  await expectToast(page, 'Saved “Little Living Garden”.', mark);
}

/** A save's moment as Saved dishes and Home name it: the dish clock (D-0033 J; fix round 3). */
function atClock(seconds: number): string {
  return `at ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} dish time`;
}

/**
 * The app going to the background autosaves (src/ui/main.tsx): the page reports itself hidden once.
 * Resolves when Saved dishes lists Continue at that moment (no named slot is written). The moment is
 * matched whole ("at 0:00 dish time" is not "at 10:00 dish time"; fix round 2).
 */
async function backgroundAutosave(page: Page, seconds: number): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    delete (document as unknown as { visibilityState?: unknown }).visibilityState;
  });
  await openSavedDishes(page);
  const row = page.locator('li[data-slot="autosave"]');
  const moment = new RegExp(`(?:^|[^0-9])${atClock(seconds)}`);
  await expect
    .poll(
      async () => {
        const text = (await row.count()) > 0 ? await row.innerText() : '';
        if (!moment.test(text)) {
          await page.getByRole('button', { name: 'Back' }).click();
          await page.getByRole('button', { name: 'Saved dishes' }).click();
        }
        return text;
      },
      { timeout: 30_000 },
    )
    .toMatch(moment);
}

/** A small valid .pixelmeba file of another dish, written to the test's output folder. */
async function friendFile(testInfo: TestInfo, name: string): Promise<string> {
  const w = realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: `friend-${name}`, seed: 104729 });
  run(w, 20);
  const { text } = await buildSaveFile(w, { name: 'Friend dish', savedAt: '2026-09-29T11:00:00.000Z', recipeId: 'FIRST_DISH_V1' });
  const file = testInfo.outputPath(`${name}.pixelmeba`);
  writeFileSync(file, text);
  return file;
}

async function startGardenFromPlay(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('home-play').click();
  await page.getByTestId('start-garden').click();
}

async function expectNewGarden(page: Page): Promise<void> {
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toHaveText(/^0:00 · 56 alive/);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
}

async function openSavedDishes(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await expect(page.getByRole('heading', { name: 'Saved dishes' })).toBeVisible();
}

/** Every visible text inside `selector` is at least 16 px (UX §9; scales with Settings text size). */
async function expectTextAtLeast16px(page: Page, selector: string): Promise<void> {
  const small = await page.evaluate((sel) => {
    const out: string[] = [];
    const roots = Array.from(document.querySelectorAll(sel));
    if (roots.length === 0) out.push(`nothing matches ${sel}`);
    for (const root of roots) {
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

test('New Dish → Create keeps the changed Garden in a slot first and says so; Saved dishes lists it at the moment it was left', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await recordToasts(page);
  await startGarden(page);
  const t = await runFor(page, 2);
  const alive = await page.getByTestId('sim-time').innerText();

  // New Dish says, before Create, exactly what will happen to the open dish.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('home-new').click();
  const plan = page.getByTestId('new-dish-replaces');
  await expect(plan).toHaveText('“Little Living Garden” will first be saved to Slot 1 (empty now) and to Continue.');
  await expectTextAtLeast16px(page, '[data-testid="new-dish-replaces"]');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('new-dish-start').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('0:00 · 56 alive');
  await expectToast(page, 'Saved “Little Living Garden” to Slot 1 first.');

  // Saved dishes lists it, at the moment it was left, under the slot number the line named (fix round 1).
  await openSavedDishes(page);
  const row = page.locator('li[data-slot="slot1"]');
  await expect(row).toContainText('Little Living Garden');
  await expect(row).toContainText(atClock(t));
  await expect(row.getByTestId('slot-number')).toHaveText('Slot 1');
  await expectTextAtLeast16px(page, '[data-testid="slot-moment"]'); // fix round 3 (D-0033 J): the dish clock, body size
  await expectNoSeriousA11yViolations(page);

  // "My dish" has not run: it rebuilds exactly, so opening the save writes nothing and says nothing
  // about it (fix round 1) …
  const quiet = (await toasts(page)).length;
  await row.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(title(page)).toHaveText('Little Living Garden');
  await expect(page.getByTestId('sim-time')).toHaveText(alive);
  await expectToast(page, 'Opened “Little Living Garden” — paused where you left it.', quiet);
  expect((await toasts(page)).slice(quiet).filter((x) => x.includes('first'))).toEqual([]);

  // … while a dish that ran is kept first (it has no slot of its own, so the next empty one), and the
  // save opens exactly as it was left.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('home-new').click();
  await page.getByTestId('new-dish-start').click();
  await expect(title(page)).toHaveText('My dish');
  const mine = await runFor(page, 1);
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot]')).toHaveCount(2); // Continue, Slot 1: nothing else was written
  await expect(page.locator('li[data-slot]').first().getByTestId('slot-number')).toHaveText('Continue');
  await page.locator('li[data-slot="slot1"]').getByRole('button', { name: 'Open' }).click();
  await expect(page.getByTestId('sim-time')).toHaveText(alive);
  await expectToast(page, 'Saved “My dish” to Slot 2 first. Opened “Little Living Garden” — paused where you left it.');
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot="slot2"]')).toContainText(atClock(mine));
  await expect(page.locator('li[data-slot="slot2"]').getByTestId('slot-number')).toHaveText('Slot 2');
});

test('Play shelf Start keeps a changed dish first; a dish already saved exactly as it is writes nothing and says nothing', async ({ page }) => {
  test.setTimeout(300_000);
  await recordToasts(page);
  await startGarden(page);
  await runFor(page, 1);
  await saveToFirstEmpty(page); // slot 1: the dish's own slot now

  // Unchanged since it was saved: nothing is written, and no line about keeping it.
  const before = (await toasts(page)).length;
  await startGardenFromPlay(page);
  await expectNewGarden(page);
  await page.waitForTimeout(1000);
  expect((await toasts(page)).slice(before).filter((x) => x.includes('first.'))).toEqual([]);

  // A changed dish with no slot of its own goes to the first empty slot, and the line says so.
  const t = await runFor(page, 1);
  const mark = (await toasts(page)).length;
  await startGardenFromPlay(page);
  await expectNewGarden(page);
  await expectToast(page, 'Saved “Little Living Garden” to Slot 2 first.', mark);
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot="slot2"]')).toContainText(atClock(t));
  await expect(page.locator('li[data-slot]').filter({ has: page.getByTestId('slot-delete') })).toHaveCount(3); // slot 1, slot 2, autosave

  // Fix round 1 (player verifier MAJOR 1): an untouched Garden rebuilds exactly, so restarting it again
  // and again writes nothing and says nothing; the slots stay free.
  await page.getByRole('button', { name: 'Back' }).click(); // Saved dishes → Home (the Garden is still open)
  for (let i = 0; i < 2; i++) {
    const before = (await toasts(page)).length;
    if (i > 0) await page.getByRole('button', { name: 'Home' }).click();
    await page.getByTestId('home-play').click();
    await page.getByTestId('start-garden').click();
    await expectNewGarden(page);
    await page.waitForTimeout(1000);
    expect((await toasts(page)).slice(before).filter((x) => x.includes('first'))).toEqual([]);
  }
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot]')).toHaveCount(3);
});

test('all ten slots used: starting shows the Keep sheet; Cancel keeps the dish open and unchanged; Replace keeps it and starts (200 % text)', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await recordToasts(page);
  await startGarden(page, { textScale: 2 });
  for (let i = 0; i < 10; i++) await saveToFirstEmpty(page);
  // The filled dish is exactly what slot 10 holds: starting from Play writes nothing.
  await startGardenFromPlay(page);
  await expectNewGarden(page);
  const t = await runFor(page, 1);
  const alive = await page.getByTestId('sim-time').innerText();

  // Start → all slots used → the Keep sheet (a blocking modal) → Cancel: nothing changes.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('home-play').click();
  const start = page.getByTestId('start-garden');
  await expectReachable(start);
  await start.click();
  const sheet = page.getByTestId('keep-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('keep-full')).toContainText('All ten save slots are used');
  await expect(page.getByTestId('keep-full')).toContainText(
    'Keep “Little Living Garden” before the new dish opens: export it as a file, or choose a saved dish to replace. Cancel changes nothing.',
  );
  await expect(page.getByTestId('keep-full')).toContainText('Waiting to start: “Little Living Garden”.');
  await expect(page.getByTestId('keep-full').getByRole('heading', { level: 3 })).toBeFocused();
  // Its name and what it is about are both announced (fix round 1: aria-describedby).
  await expect(sheet).toHaveAccessibleName('Keep your dish first');
  await expect(sheet).toHaveAccessibleDescription(
    'Keep “Little Living Garden” before the new dish opens: export it as a file, or choose a saved dish to replace. Cancel changes nothing.',
  );
  // Behind the modal the page is inert.
  expect(await start.evaluate((el) => el.closest('[inert]') !== null)).toBe(true);
  for (const id of ['keep-export', 'keep-replace', 'keep-cancel', 'keep-close']) await expectReachable(page.getByTestId(id));
  await expectTextAtLeast16px(page, '[data-testid="keep-sheet"]');
  await expectNoHorizontalOverflow(page);
  expect(await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await expectNoSeriousA11yViolations(page);
  const beforeCancel = (await toasts(page)).length;
  await page.getByTestId('keep-cancel').click();
  await expect(sheet).toHaveCount(0);
  await expectToast(page, 'Nothing was changed.', beforeCancel);
  await expect(start).toBeFocused();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(title(page)).toHaveText('Little Living Garden');
  await expect(page.getByTestId('sim-time')).toHaveText(alive);
  expect(await simSeconds(page)).toBe(t);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');

  // Again, and Escape cancels as well.
  await startGardenFromPlay(page);
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  // Replace a saved dish…: a deliberate choice, confirmed in words, then the new dish starts.
  await page.getByTestId('start-garden').click();
  await expect(sheet).toBeVisible();
  await page.getByTestId('keep-replace').click();
  await expect(page.getByTestId('keep-replace-start')).toBeDisabled();
  await expectReachable(page.getByTestId('keep-slot-slot3'));
  await page.getByTestId('keep-slot-slot3').click();
  await expect(page.getByTestId('keep-replace-confirm')).toHaveText('“Little Living Garden” at 0:00 in Slot 3 will be replaced by “Little Living Garden”.');
  // The Replace button is described by that sentence, which is a polite live region (fix round 1).
  await expect(page.getByTestId('keep-replace-start')).toHaveAccessibleDescription('“Little Living Garden” at 0:00 in Slot 3 will be replaced by “Little Living Garden”.');
  await expectReachable(page.getByTestId('keep-replace-start'));
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('keep-replace-start').click();
  await expectNewGarden(page);
  await expectToast(page, 'Saved “Little Living Garden” to Slot 3 first, in place of “Little Living Garden” (0:00).');
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot="slot3"]')).toContainText(atClock(t));
  await expect(page.locator('li[data-slot="slot4"]')).toContainText(atClock(0));
});

test('all ten slots used, Saved dishes → Open its own save: that save cannot be replaced; export, then it opens (100 % text)', async ({ page }) => {
  test.setTimeout(600_000);
  await recordToasts(page);
  await startGarden(page);
  for (let i = 0; i < 10; i++) await saveToFirstEmpty(page); // its own slot is slot 10 now
  await runFor(page, 1); // changed since slot 10 was written

  await openSavedDishes(page);
  const openTen = () => page.locator('li[data-slot="slot10"]').getByRole('button', { name: 'Open' }).click();
  await openTen();
  const sheet = page.getByTestId('keep-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('keep-full')).toContainText(
    'Keep “Little Living Garden” before the saved dish opens: export it as a file, or choose a saved dish to replace. Cancel changes nothing.',
  );
  await expect(page.getByTestId('keep-full')).toContainText('Waiting to open: “Little Living Garden”.');
  for (const id of ['keep-export', 'keep-replace', 'keep-cancel', 'keep-close']) await expectReachable(page.getByTestId(id));
  await expectTextAtLeast16px(page, '[data-testid="keep-sheet"]');
  await expectNoSeriousA11yViolations(page);
  // The save being opened is listed but cannot be chosen.
  await page.getByTestId('keep-replace').click();
  await expect(page.getByTestId('keep-slot-slot10')).toContainText('(the save you are opening)');
  await expect(page.getByTestId('keep-slot-slot10').locator('input')).toBeDisabled();
  await expectReachable(page.getByTestId('keep-slot-slot9'));
  await expectTextAtLeast16px(page, '[data-testid="keep-sheet"]');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('keep-close').click();
  await expect(sheet).toHaveCount(0);

  // Export it, then open the save: no slot is written for the dish that was open.
  await openTen();
  await expect(sheet).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByTestId('keep-export').click();
  expect((await download).suggestedFilename()).toBe('little-living-garden.pixelmeba');
  await expect(page.getByTestId('keep-exported')).toContainText('Exported little-living-garden.pixelmeba.');
  await expectReachable(page.getByTestId('keep-start-exported'));
  await expect(page.getByTestId('keep-start-exported')).toHaveText('Open the saved dish');
  await page.getByTestId('keep-start-exported').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toHaveText(/^0:00 · 56 alive/);
  await expectToast(page, '“Little Living Garden” is in the file you exported. Opened “Little Living Garden” — paused where you left it.');
  await openSavedDishes(page);
  // All ten saves are as they were (0:00): no named slot was written for the dish that was open.
  await expect(page.locator('li[data-slot^="slot"]').filter({ hasText: atClock(0) })).toHaveCount(10);
});

test('Saved dishes → Open another save keeps the changed open dish first, then opens the save as it was', async ({ page }) => {
  test.setTimeout(300_000);
  await recordToasts(page);
  await startGarden(page);
  await runFor(page, 1);
  const saved = await page.getByTestId('sim-time').innerText();
  await saveToFirstEmpty(page); // slot 1
  await startGardenFromPlay(page); // unchanged since saved: nothing written
  await expectNewGarden(page);
  const t = await runFor(page, 2);

  await openSavedDishes(page);
  await page.locator('li[data-slot="slot1"]').getByRole('button', { name: 'Open' }).click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toHaveText(saved);
  await expectToast(page, 'Saved “Little Living Garden” to Slot 2 first. Opened “Little Living Garden” — paused where you left it.');
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot="slot2"]')).toContainText(atClock(t));
});

test('Import over a running dish pauses it, keeps it first, then opens the file', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const w = realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'friend-keep', seed: 104729 });
  run(w, 20);
  const { text } = await buildSaveFile(w, { name: 'Friend dish', savedAt: '2026-09-29T11:00:00.000Z', recipeId: 'FIRST_DISH_V1' });
  const file = testInfo.outputPath('friend-keep.pixelmeba');
  writeFileSync(file, text);

  await recordToasts(page);
  await startGarden(page);
  await page.getByTestId('run-toggle').click();
  await expect.poll(() => simSeconds(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await page.getByTestId('more').click();
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(title(page)).toHaveText('Friend dish');
  await expect(page.getByTestId('sim-time')).toContainText('0:02');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expectToast(page, 'Saved “Little Living Garden” to Slot 1 first. Imported “Friend dish” — paused.');
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot="slot1"]')).toContainText('Little Living Garden');
});

// ---------------------------------------------------------------------------------------------
// Fix round 1 (docs/reports/reviews/g2-close/keep-dish-verify-*.md).

test('a manual save always refreshes Continue: after a reload Continue is that save, and starting anew writes nothing over it', async ({ page }) => {
  // Saves verifier MAJOR: a change made while paused kept the tick, so Continue lagged the slot it named
  // and a later replacement wrote the older Continue over the player's newer save in that slot.
  test.setTimeout(420_000);
  await recordToasts(page);
  await startGarden(page);
  await runFor(page, 1);
  await saveToFirstEmpty(page); // Slot 1
  await runFor(page, 2);
  await saveOverSlot1(page);
  // Still paused, the same moment: add life, then save over Slot 1 again.
  const before = await page.getByTestId('sim-time').innerText();
  await page.getByTestId('action-addlife').click();
  await page.getByTestId('species-P01').click();
  await tapViewport(page, 0.5, 0.5);
  await expect(page.getByRole('status').filter({ hasText: /Added \d+ Amoeba/ })).toBeVisible();
  await expect(page.getByTestId('sim-time')).not.toHaveText(before);
  const added = await page.getByTestId('sim-time').innerText();
  await saveOverSlot1(page);

  // A new session: Continue opens exactly what the player saved.
  await page.reload();
  await page.getByTestId('home-continue').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toHaveText(added);
  // It is exactly Slot 1: starting anew writes nothing and says nothing about it.
  const mark = (await toasts(page)).length;
  await startGardenFromPlay(page);
  await expectNewGarden(page);
  await page.waitForTimeout(1000);
  expect((await toasts(page)).slice(mark).filter((x) => x.includes('first'))).toEqual([]);
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot]')).toHaveCount(2); // Continue and Slot 1
  await page.locator('li[data-slot="slot1"]').getByRole('button', { name: 'Open' }).click();
  await expect(page.getByTestId('sim-time')).toHaveText(added);
});

test('after a relaunch, starting a dish keeps the dish Continue holds first; New Dish says so beforehand', async ({ page }) => {
  // Player verifier MAJOR 3: with no dish open, every replacing action used to drop Home's Continue dish.
  test.setTimeout(300_000);
  await recordToasts(page);
  await startGarden(page);
  const t = await runFor(page, 2);
  const alive = await page.getByTestId('sim-time').innerText();
  await backgroundAutosave(page, t); // only Continue holds it; no named slot
  await page.reload();
  await expect(page.getByRole('region', { name: 'Continue' })).toContainText(`Little Living Garden — ${atClock(t)}. Opens paused.`);

  await page.getByTestId('home-new').click();
  const plan = page.getByTestId('new-dish-replaces');
  await expect(plan).toHaveText('Continue holds “Little Living Garden”, which will first be saved to Slot 1 (empty now).');
  await expectTextAtLeast16px(page, '[data-testid="new-dish-replaces"]');
  await expectNoSeriousA11yViolations(page);
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByTestId('home-play').click();
  await page.getByTestId('start-garden').click();
  await expectNewGarden(page);
  await expectToast(page, 'Saved “Little Living Garden” from Continue to Slot 1 first.');
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot="slot1"]')).toContainText(atClock(t));
  // The new Garden has not run: opening Slot 1 writes nothing for it, and the dish is as it was left.
  await page.locator('li[data-slot="slot1"]').getByRole('button', { name: 'Open' }).click();
  await expect(page.getByTestId('sim-time')).toHaveText(alive);
});

test('Duplicate keeps the original first, says where it is, and the original opens again from there', async ({ page }) => {
  // Player verifier MINOR 9: "the original is unchanged" and then the original was unreachable.
  test.setTimeout(240_000);
  await recordToasts(page);
  await startGarden(page);
  const t = await runFor(page, 1);
  const alive = await page.getByTestId('sim-time').innerText();
  await page.getByTestId('more').click();
  await page.getByRole('button', { name: 'Duplicate dish' }).click();
  await expect(title(page)).toHaveText('Little Living Garden (copy)');
  await expect(page.getByTestId('sim-time')).toHaveText(alive); // the copy holds the same moment
  await expectToast(page, 'Duplicated. You are now in the copy; the original was saved to Slot 1.');
  await runFor(page, 1);
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot="slot1"]')).toContainText(atClock(t));
  await page.locator('li[data-slot="slot1"]').getByRole('button', { name: 'Open' }).click();
  await expect(title(page)).toHaveText('Little Living Garden');
  await expect(page.getByTestId('sim-time')).toHaveText(alive);
  await expectToast(page, 'Saved “Little Living Garden (copy)” to Slot 2 first. Opened “Little Living Garden” — paused where you left it.');
});

test('ten slots used: Import over a running dish waits in the Keep sheet with the dish paused; Cancel lets it run on', async ({ page }, testInfo) => {
  // Saves verifier MINOR 7: only the app resumes a running dish after Cancel (the worker sees it paused).
  test.setTimeout(600_000);
  const file = await friendFile(testInfo, 'keep-cancel');
  await recordToasts(page);
  await startGarden(page);
  for (let i = 0; i < 10; i++) await saveToFirstEmpty(page);
  await startGardenFromPlay(page); // the filled dish is exactly Slot 10: nothing is written
  await expectNewGarden(page);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expect.poll(() => simSeconds(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);

  await page.getByTestId('more').click();
  await page.locator('input[type="file"]').setInputFiles(file);
  const sheet = page.getByTestId('keep-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('keep-full')).toContainText('Waiting to open: “keep-cancel.pixelmeba”.');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const t = await simSeconds(page);
  await page.waitForTimeout(1500);
  expect(await simSeconds(page)).toBe(t); // paused while the choice waits
  const mark = (await toasts(page)).length;
  await page.getByTestId('keep-cancel').click();
  await expect(sheet).toHaveCount(0);
  await expectToast(page, 'Nothing was changed.', mark);
  await expect(title(page)).toHaveText('Little Living Garden');
  // Nothing was replaced: it runs on in the run state it had.
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expect.poll(() => simSeconds(page), { timeout: 30_000 }).toBeGreaterThan(t);
});

test('with prompts on, the kept line leads the new dish prompt (no toast over it); an experiment card says beforehand what happens first', async ({ page }) => {
  // Player verifier MAJOR 2 and MINOR 5.
  test.setTimeout(300_000);
  await recordToasts(page);
  await seedSettings(page, { showPrompts: true });
  await page.goto('/');
  await page.getByTestId('home-play').click();
  await page.getByTestId('start-garden').click();
  await expect(page.locator('.prompt p')).toHaveText('Press play and look closely.');
  await runFor(page, 1); // Run clears the prompt
  await expect(page.locator('.prompt')).toHaveCount(0);

  const mark = (await toasts(page)).length;
  await startGardenFromPlay(page);
  await expect(page.locator('.prompt p')).toHaveText('Saved “Little Living Garden” to Slot 1 first. Press play and look closely.');
  await page.waitForTimeout(1000);
  expect((await toasts(page)).slice(mark).filter((x) => x.includes('first'))).toEqual([]); // not a toast as well
  await expectTextAtLeast16px(page, '.prompt');
  await runFor(page, 1);
  await expect(page.locator('.prompt')).toHaveCount(0);

  // The experiment card: what happens first, from the worker's plan (D-0027's "kept in Continue" is gone).
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-experiments').click();
  await page.getByTestId('experiment-card-EXP_101').click();
  await expect(page.getByTestId('experiment-card')).toBeVisible();
  await expect(page.getByTestId('experiment-card')).not.toContainText('kept in Continue');
  await expect(page.getByTestId('experiment-card-keep')).toHaveText('“Little Living Garden” will first be saved to Slot 2 (empty now) and to Continue.');
  await expectTextAtLeast16px(page, '[data-testid="experiment-card-keep"]');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('experiment-start').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.locator('.prompt p')).toHaveText(/^Saved “Little Living Garden” to Slot 2 first\. Food trail: press play and watch\./);
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot="slot2"]')).toContainText('Little Living Garden');
});

// ---------------------------------------------------------------------------------------------
// Fix round 2 (docs/reports/reviews/g2-close/keep-dish-reverify1.md).

test('after a relaunch the dish Continue holds is kept once: the new Garden, left unrun, becomes Continue, and the next launch writes nothing', async ({
  page,
}) => {
  // Re-verifier MAJOR (probe R1): Continue was not rebound after the keep and the unrun new dish was never
  // autosaved, so every later launch kept the same dish again, into a new slot each time.
  test.setTimeout(420_000);
  await recordToasts(page);
  await startGarden(page);
  const t = await runFor(page, 2);
  await backgroundAutosave(page, t); // only Continue holds it

  // Launch 2: Play → Start keeps it from Continue.
  await page.reload();
  let mark = (await toasts(page)).length;
  await page.getByTestId('home-play').click();
  await page.getByTestId('start-garden').click();
  await expectNewGarden(page);
  await expectToast(page, 'Saved “Little Living Garden” from Continue to Slot 1 first.', mark);
  // The new Garden is only looked at; going to the background writes it to Continue (the last dish).
  await backgroundAutosave(page, 0);

  // Launch 3: Home offers the Garden opened last; starting anew writes nothing and says nothing.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Continue' })).toContainText(`Little Living Garden — ${atClock(0)}. Opens paused.`);
  mark = (await toasts(page)).length;
  await page.getByTestId('home-play').click();
  await page.getByTestId('start-garden').click();
  await expectNewGarden(page);
  await page.waitForTimeout(1000);
  expect((await toasts(page)).slice(mark).filter((x) => x.includes('first'))).toEqual([]);
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot^="slot"]')).toHaveCount(1); // Slot 1 only: no second copy
  await expect(page.locator('li[data-slot="slot1"]')).toContainText(atClock(t));
});

test('Saved dishes → Open the same save on two launches: the later Continue is kept once, and the save opens as it was both times', async ({
  page,
}) => {
  // Re-verifier MAJOR (probe R2).
  test.setTimeout(420_000);
  await recordToasts(page);
  await startGarden(page);
  const s1 = await runFor(page, 1);
  const saved = await page.getByTestId('sim-time').innerText();
  await saveToFirstEmpty(page); // Slot 1
  const t = await runFor(page, s1 + 2);
  await backgroundAutosave(page, t); // Continue: later than Slot 1

  // Launch 2: opening Slot 1 keeps the later Continue first (never into the save being opened).
  await page.reload();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  let mark = (await toasts(page)).length;
  await page.locator('li[data-slot="slot1"]').getByRole('button', { name: 'Open' }).click();
  await expect(page.getByTestId('sim-time')).toHaveText(saved);
  await expectToast(page, 'Saved “Little Living Garden” from Continue to Slot 2 first. Opened “Little Living Garden” — paused where you left it.', mark);
  // Only looked at, then the app goes to the background: Continue now holds that save.
  await backgroundAutosave(page, s1);

  // Launch 3: opening Slot 1 again writes nothing and says nothing about keeping.
  await page.reload();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  mark = (await toasts(page)).length;
  await page.locator('li[data-slot="slot1"]').getByRole('button', { name: 'Open' }).click();
  await expect(page.getByTestId('sim-time')).toHaveText(saved);
  await expectToast(page, 'Opened “Little Living Garden” — paused where you left it.', mark);
  expect((await toasts(page)).slice(mark).filter((x) => x.includes('first'))).toEqual([]);
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot^="slot"]')).toHaveCount(2); // Slot 1 and Slot 2: no copy
  await expect(page.locator('li[data-slot="slot1"]')).toContainText(atClock(s1));
  await expect(page.locator('li[data-slot="slot2"]')).toContainText(atClock(t));
});

test('a paired card started over a changed dish: the kept line is in the run setup panel (16 px), never a toast; Saved dishes lists the dish', async ({ page }) => {
  // Re-verifier MINOR (test coverage; probe R3): experimentKeptLine had no test.
  test.setTimeout(300_000);
  await recordToasts(page);
  await startGarden(page);
  await runFor(page, 1);
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-experiments').click();
  await page.getByTestId('experiment-card-EXP_102').click();
  await expect(page.getByTestId('experiment-card')).toBeVisible();
  await expect(page.getByTestId('experiment-card-keep')).toHaveText('“Little Living Garden” will first be saved to Slot 1 (empty now) and to Continue.');
  const mark = (await toasts(page)).length;
  await page.getByTestId('experiment-start').click();
  await expect(page.getByTestId('experiment-run-screen')).toHaveAttribute('data-status', 'setup');
  const kept = page.getByTestId('experiment-kept');
  await expect(kept).toHaveText('Saved “Little Living Garden” to Slot 1 first.');
  await expectTextAtLeast16px(page, '[data-testid="experiment-kept"]');
  await expectReachable(page.getByTestId('experiment-close'));
  await expectNoSeriousA11yViolations(page);
  await page.waitForTimeout(1500);
  expect((await toasts(page)).slice(mark).filter((x) => x.includes('first'))).toEqual([]); // not a toast as well
  await page.getByTestId('experiment-close').click();
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot="slot1"]')).toContainText('Little Living Garden');
  await expect(page.locator('li[data-slot^="slot"]')).toHaveCount(1);
});

// ---------------------------------------------------------------------------------------------
// Fix round 3 (lead rulings on D-0033: E, J, K).

/** What expectToastFits measures, taken the moment the toast appears (see watchToast). */
interface ToastFit {
  readonly zoom: boolean;
  readonly shortAt200: boolean;
  readonly fontSize: number;
  readonly body: number;
  readonly inside: boolean;
  readonly clipped: boolean;
  readonly bars: string[];
  readonly blocked: string[];
}

/**
 * Measure the dish screen's toast with exactly `text` the moment it appears (a MutationObserver, armed
 * before the action that shows it): a toast lasts a few seconds, and a slow project can outlast it.
 */
async function watchToast(page: Page, text: string): Promise<void> {
  await page.evaluate((want) => {
    const w = window as unknown as { __toastFit: unknown };
    w.__toastFit = null;
    const measure = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const vp = el.closest('[data-testid="viewport"]')!.getBoundingClientRect();
      const overlaps = (b: DOMRect) => r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
      const blocked: string[] = [];
      for (const c of Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], a[href], input, select, textarea'))) {
        const b = c.getBoundingClientRect();
        if (b.width === 0 || b.height === 0 || c.closest('[inert]') || !overlaps(b)) continue;
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        if (hit && el.contains(hit)) blocked.push(c.getAttribute('aria-label') ?? c.textContent?.trim() ?? c.tagName);
      }
      const zoom = document.querySelector('.zoom-buttons');
      return {
        zoom: zoom !== null && overlaps(zoom.getBoundingClientRect()),
        shortAt200: window.innerHeight <= 480 && document.documentElement.dataset.textScale === '2',
        fontSize: parseFloat(getComputedStyle(el).fontSize),
        body: parseFloat(getComputedStyle(document.documentElement).fontSize),
        inside: r.top >= vp.top - 0.5 && r.bottom <= vp.bottom + 0.5 && r.left >= vp.left - 0.5 && r.right <= vp.right + 0.5,
        clipped: el.scrollHeight - el.clientHeight > 1 || el.scrollWidth - el.clientWidth > 1,
        bars: ['.topbar', '.bottombar'].filter((sel) => {
          const bar = document.querySelector(sel);
          return bar !== null && overlaps(bar.getBoundingClientRect());
        }),
        blocked,
      };
    };
    const obs = new MutationObserver(() => {
      const el = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="viewport"] .toast')).find((e) => e.textContent === want);
      if (!el || w.__toastFit) return;
      w.__toastFit = measure(el);
      obs.disconnect();
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
  }, text);
}

/**
 * The toast watchToast measured: body size (UX §4.1: at least 16 px; D-0033 E), wholly inside the dish
 * view (no line clipped), clear of the top and bottom bars, and no control under it loses its press (the
 * toast never takes a pointer that a visible control would get). It also keeps clear of the zoom buttons,
 * except in a short window at 200 % text (a phone held sideways), where it uses the whole width of the
 * dish view so that no word is cut off (the zoom buttons still take their presses).
 */
async function expectToastFits(page: Page): Promise<void> {
  let m: ToastFit | null = null;
  await expect
    .poll(
      async () => {
        m = await page.evaluate(() => (window as unknown as { __toastFit: ToastFit | null }).__toastFit);
        return m !== null;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const fit = m as unknown as ToastFit;
  expect(fit.fontSize).toBeGreaterThanOrEqual(16);
  expect(fit.fontSize).toBe(fit.body); // var(--fs-body): 1rem, which follows the text size setting
  expect({ inside: fit.inside, clipped: fit.clipped, bars: fit.bars, blocked: fit.blocked }).toEqual({ inside: true, clipped: false, bars: [], blocked: [] });
  if (!fit.shortAt200) expect(fit.zoom).toBe(false);
}

test('dish-screen toasts are body size and fit at 200 % text without covering a control; Saved dishes and Home name a save on the dish clock', async ({
  page,
}) => {
  test.setTimeout(420_000);
  await recordToasts(page);
  await startGarden(page, { textScale: 2 });
  const s1 = await runFor(page, 1);
  // A manual save: the short toast, with curly quotes (D-0033 K).
  const mark = (await toasts(page)).length;
  await saveToFirstEmpty(page);
  await expectToast(page, 'Saved “Little Living Garden”.', mark);
  const t = await runFor(page, s1 + 1);
  // Open Slot 1 over the changed dish: the longest keep line, as one toast.
  await openSavedDishes(page);
  await expect(page.locator('li[data-slot="slot1"]').getByTestId('slot-moment')).toContainText(atClock(s1));
  await expect(page.locator('li[data-slot="autosave"]').getByTestId('slot-moment')).toContainText(/^at \d+:\d\d dish time · /);
  await expectTextAtLeast16px(page, 'li[data-slot]');
  await watchToast(page, 'Saved “Little Living Garden” to Slot 2 first. Opened “Little Living Garden” — paused where you left it.');
  await page.locator('li[data-slot="slot1"]').getByRole('button', { name: 'Open' }).click();
  await expectToastFits(page);
  await expectNoHorizontalOverflow(page);
  // Home's Continue card names the dish Continue holds on the dish clock (after a relaunch, no dish open).
  await backgroundAutosave(page, s1);
  await page.reload();
  await expect(page.getByTestId('home-continue-text')).toHaveText(`Little Living Garden — ${atClock(s1)}. Opens paused.`);
  await expectTextAtLeast16px(page, '[data-testid="home-continue-text"]');
  await expectReachable(page.getByTestId('home-continue'));
  await expectNoSeriousA11yViolations(page);
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await expect(page.locator('li[data-slot="slot2"]').getByTestId('slot-moment')).toContainText(atClock(t));
  await expectNoSeriousA11yViolations(page);
});
