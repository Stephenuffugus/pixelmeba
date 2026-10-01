/**
 * P2.8 journey: pick a trait → regional charts show → table view → turn on the checkpoint ring → a
 * checkpoint appears after the interval (run at 4×) → open it → add a journal entry and see it in the
 * Notebook. Plus the same screens at 200 % text (no sideways scrolling, 48 px controls, axe clean).
 */
import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { buildSaveFile } from '../../src/persistence/saveFile';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { putJournalEntry } from '../../src/sim/history';
import { realizeRecipe } from '../../src/sim/recipes';
import { run } from '../../src/sim/tick';
import { registry } from '../helpers/world';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings, simSeconds, startGarden } from './helpers';

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

async function openRegions(page: Page): Promise<void> {
  await page.getByTestId('more').click();
  await page.getByTestId('more-history').click();
  const history = page.getByTestId('history');
  await expect(history).toBeVisible();
  await history.getByTestId('history-tab-regions').click();
  await expect(history.getByTestId('history-tab-regions')).toHaveAttribute('aria-selected', 'true');
  await expect(history.getByTestId('trait-graphs')).toBeVisible();
}

async function runUntil(page: Page, seconds: number, timeout = 120_000): Promise<void> {
  await expect.poll(() => simSeconds(page), { timeout, intervals: [500] }).toBeGreaterThanOrEqual(seconds);
}

test('observe: regional trait graphs and table, automatic checkpoint at 4×, open it, journal note in the Notebook', async ({ page }, testInfo) => {
  test.setTimeout(360_000);
  await startGarden(page);
  await page.keyboard.press('4'); // run at 4×
  await runUntil(page, 25);
  await page.keyboard.press(' '); // pause while reading the charts

  // Pick a trait: the second recorded trait of the chosen organism.
  await openRegions(page);
  const history = page.getByTestId('history');
  // The Charts tab records the dish's debris total with the other resources (D-0028 follow-up).
  await history.getByTestId('history-tab-charts').click();
  await expect(history.locator('figcaption', { hasText: 'Debris (total)' })).toBeVisible();
  await expect(history.getByTestId('history-no-debris')).toHaveCount(0);
  await expectTextAtLeast16px(page, '[data-testid="history"]');
  await history.getByTestId('history-tab-regions').click();
  const species = history.getByTestId('trait-species');
  const locus = history.getByTestId('trait-locus');
  await expectReachable(species);
  await expect(locus.locator('option')).not.toHaveCount(0);
  const options = await locus.locator('option').allInnerTexts();
  const pick = options[1] ?? options[0]!;
  await locus.selectOption({ label: pick });
  await expect(history.getByTestId('trait-summary')).toContainText(pick);
  await expect(history.getByTestId('trait-summary')).toContainText('Whole dish:');
  // Regional charts: whole dish and four quarters, for population and for the trait.
  const charts = history.getByTestId('trait-charts');
  await expect(charts).toBeVisible();
  for (const region of ['Whole dish', 'Top left', 'Top right', 'Bottom left', 'Bottom right']) {
    await expect(charts.locator('figcaption', { hasText: region })).toHaveCount(2);
  }
  await expect(charts.getByRole('img', { name: /^Whole dish:/ }).first()).toBeVisible();
  // Changes to the dish are marked from recorded history; this run made none.
  await expect(charts.locator('.trait-time')).toContainText('No changes were made to the dish in this time.');
  // Every readout names the recorded sample it shows, the latest one too (fix round 1: it said "now").
  const readout = charts.locator('.trait-readout').first();
  await expect(readout).toContainText(/^\d+:\d\d: /);
  const latest = await readout.innerText();
  // Touch: a tap reads an earlier sample and keeps it after the finger lifts; a mouse reads it on hover.
  const dishPanel = charts.locator('figure[data-region="0"] > svg[role="img"]').first();
  const box = await dishPanel.boundingBox();
  if (!box) throw new Error('no chart');
  const at = { x: Math.max(2, box.width * 0.05), y: box.height / 2 };
  if (testInfo.project.use.hasTouch) await dishPanel.tap({ position: at });
  else await dishPanel.hover({ position: at });
  await expect(readout).not.toHaveText(latest);
  await expect(readout).toContainText(/^0:10: /);
  if (testInfo.project.use.hasTouch) {
    await page.waitForTimeout(500);
    await expect(readout).toContainText(/^0:10: /); // still there after the tap ended
  }
  // Keyboard crosshair: the readout moves between recorded samples and is announced (a polite live region).
  await charts.focus();
  await page.keyboard.press('ArrowRight');
  await expect(charts.getByTestId('trait-spoken')).toContainText(/^\d+:\d\d\. Whole dish: /);
  await page.keyboard.press('ArrowLeft');
  await expect(readout).toContainText(/^\d+:\d\d: /);
  await expectTextAtLeast16px(page, '[data-testid="trait-graphs"]');
  await expectNoSeriousA11yViolations(page);

  // Table view: every recorded sample, newest first, five regions.
  await expectReachable(history.getByTestId('trait-view-table'));
  await history.getByTestId('trait-view-table').click();
  const table = history.getByTestId('trait-table');
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Bottom right' })).toBeVisible();
  // The newest row is the last whole 10 simulated seconds of the paused dish.
  const t = await simSeconds(page);
  const newest = Math.floor(t / 10) * 10;
  await expect(table.locator('tbody tr').first().locator('th')).toHaveText(`${Math.floor(newest / 60)}:${String(newest % 60).padStart(2, '0')}`);
  await expect(table.locator('tbody tr').last().locator('th')).toHaveText('0:10');
  await expectTextAtLeast16px(page, '[data-testid="trait-graphs"]');
  await expectNoSeriousA11yViolations(page);
  await history.getByRole('button', { name: 'Close' }).click();

  // Turn on the checkpoint ring in Settings (leaving the dish pauses it), then come back.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const ring = page.getByTestId('setting-checkpoint-ring');
  await expect(ring).not.toBeChecked(); // off unless chosen
  await expectReachable(ring.locator('xpath=..'));
  await ring.check();
  await expect(page.getByText(/up to the last 10/)).toBeVisible();
  await expect(ring).toHaveAccessibleDescription(/up to the last 10/);
  await expectTextAtLeast16px(page, '#checkpoint-ring-note');
  await expectNoSeriousA11yViolations(page);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();

  // Run at 4× past the next whole simulated minute: the ring writes a checkpoint there. (On a loaded
  // machine the key can arrive before the reopened dish screen listens; press again until it runs.)
  await expect(async () => {
    await page.keyboard.press('4');
    await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause', { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await runUntil(page, 64, 180_000);
  await page.keyboard.press(' ');
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  // Automatic checkpoints are listed apart from the ten save slots and explained once (fix round 1).
  const checkpoints = page.getByTestId('checkpoints');
  const row = checkpoints.getByTestId('checkpoint-row');
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  await expect(row).toContainText('Little Living Garden (automatic checkpoint)');
  await expect(row).toContainText('at 1:00 dish time');
  await expect(checkpoints.getByTestId('slot-automatic')).toHaveCount(1);
  await expect(checkpoints.getByTestId('slot-automatic')).toContainText('Not among your ten save slots');
  await expect(checkpoints.getByTestId('slot-automatic')).toContainText('starts a new branch');
  await expectTextAtLeast16px(page, '[data-testid="checkpoints"]');
  await expectNoSeriousA11yViolations(page);

  // Open it: Continue holds the dish (paused past 1:04), so Open asks first; then a paused new branch at exactly 1:00.
  const open = row.getByRole('button', { name: 'Open Little Living Garden (automatic checkpoint) at 1:00' });
  await expectReachable(open);
  // By keyboard, focus never falls to the page (fix round 2). Delete… asks with focus on Keep (the safe
  // choice), and Keep returns focus to Delete….
  await row.getByTestId('checkpoint-delete').focus();
  await page.keyboard.press('Enter');
  await expect(row.getByTestId('checkpoint-keep')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(row.getByTestId('checkpoint-delete')).toBeFocused();
  // Open moves focus to the question, so it is read out; the confirm button is described by it; Cancel
  // returns focus to Open.
  await open.focus();
  await page.keyboard.press('Enter');
  const confirm = row.getByTestId('checkpoint-confirm');
  await expect(confirm).toBeFocused();
  await expect(confirm).toContainText(/^Continue now holds “Little Living Garden” at 1:\d\d\. /);
  // D-0033: the open dish is kept first, and the question says how.
  await expect(confirm).toContainText('“Little Living Garden” will first be saved to Slot 1 (empty now).');
  await expect(row.getByTestId('checkpoint-open-confirm')).toHaveAccessibleDescription(/^Continue now holds “Little Living Garden”/);
  await expectNoSeriousA11yViolations(page);
  await page.keyboard.press('Tab');
  await expect(row.getByTestId('checkpoint-open-confirm')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(row.getByTestId('checkpoint-open-cancel')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(confirm).toHaveCount(0);
  await expect(open).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter'); // Open as a new branch
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('1:00');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expect(
    page.getByRole('status').filter({
      hasText: 'Opened the automatic checkpoint of “Little Living Garden” at 1:00 as a new branch, “Little Living Garden (from 1:00)”, paused. Continue now follows this branch.',
    }),
  ).toBeVisible();
  // It does, at once (fix round 2: Continue used to keep the old dish until the branch ran): after a
  // reload, Continue opens the branch at 1:00.
  await page.reload();
  const continueCard = page.getByRole('region', { name: 'Continue' });
  await expect(continueCard).toContainText('Little Living Garden (from 1:00) — at 1:00 dish time. Opens paused.');
  await page.getByTestId('home-continue').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('1:00');

  // Add a journal entry from History: "I saw … coincide with …", about this dish at 1:00.
  await page.getByTestId('more').click();
  await page.getByTestId('more-history').click();
  await page.getByTestId('history-record').click();
  const form = page.getByTestId('history-journal-compose');
  // Opening the form moves focus into its first field (fix round 1: focus dropped to the page).
  await expect(form.getByTestId('journal-saw')).toBeFocused();
  await form.getByTestId('journal-saw').fill('Sprinters gathering in the top left.');
  await form.getByTestId('journal-with').fill('the sugar patch getting smaller');
  await expect(form.getByTestId('journal-about-dish')).toBeChecked();
  await expectTextAtLeast16px(page, '[data-testid="history-journal-compose"]');
  await expectReachable(form.getByTestId('journal-add'));
  await form.getByTestId('journal-add').click();
  await expect(page.getByRole('status').filter({ hasText: 'Added to your Journal' })).toBeVisible();
  // Closing the form returns focus to the button that opened it.
  await expect(page.getByTestId('history-record')).toBeFocused();
  await page.getByTestId('history').getByRole('button', { name: 'Close' }).click();

  // See it in the Notebook → Journal.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-journal').click();
  const note = page.getByTestId('journal-observation').first();
  // One sentence, whatever punctuation was typed (fix round 1).
  await expect(note).toContainText('I saw Sprinters gathering in the top left coincide with the sugar patch getting smaller.');
  await expect(note).toContainText('Little Living Garden (from 1:00) at 1:00 dish time');
  await expect(note).toContainText('does not say that one caused the other');
  await expectTextAtLeast16px(page, '[data-testid="notebook"]');
  await expectNoSeriousA11yViolations(page);
  // The note survives a reload (device Notebook).
  await page.reload();
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-journal').click();
  await expect(page.getByTestId('journal-observation').first()).toContainText('Sprinters gathering in the top left');

  // Deleting the only checkpoint by keyboard: focus goes to the page's heading once its list is gone (fix round 2).
  await page.getByRole('button', { name: 'Back to Home' }).click();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  const last = page.getByTestId('checkpoint-row');
  await expect(last).toHaveCount(1);
  await last.getByTestId('checkpoint-delete').focus();
  await page.keyboard.press('Enter');
  await expect(last.getByTestId('checkpoint-keep')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(last.getByRole('button', { name: 'Delete for good: Little Living Garden (automatic checkpoint) at 1:00' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Deleted.' })).toBeVisible();
  await expect(page.getByTestId('checkpoints')).toHaveCount(0);
  await expect(page.locator('#saves-title')).toBeFocused();
});

test('observe at 200 % text: Regions, its table and the Journal form reflow without sideways scrolling', async ({ page }) => {
  test.setTimeout(240_000);
  await startGarden(page, { textScale: 2 });
  await page.keyboard.press('4');
  await runUntil(page, 22);
  await page.keyboard.press(' ');
  await openRegions(page);
  const history = page.getByTestId('history');
  await expectReachable(history.getByTestId('history-tab-regions'));
  await expectReachable(history.getByTestId('trait-species'));
  await expectReachable(history.getByTestId('trait-locus'));
  await expect(history.getByTestId('trait-charts')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await history.getByTestId('trait-view-table').click();
  await expect(history.getByTestId('trait-table')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  await history.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-journal').click();
  await expectReachable(page.getByTestId('journal-record'));
  await page.getByTestId('journal-record').click();
  const form = page.getByTestId('journal-compose');
  await expectReachable(form.getByTestId('journal-saw'));
  await expectReachable(form.getByTestId('journal-with'));
  await expectReachable(form.getByTestId('journal-link'));
  await expectReachable(form.getByTestId('journal-add'));
  // Both parts are required; the refusal is announced.
  await form.getByTestId('journal-add').click();
  await expect(form.getByRole('alert')).toHaveText('Write what you saw.');
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  // Settings → Automatic checkpoints at 200 %: the toggle is reachable and its explanation reflows.
  await page.getByRole('button', { name: 'Back to Home' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const ring = page.getByTestId('setting-checkpoint-ring');
  await expectReachable(ring.locator('xpath=..'));
  await expect(page.locator('#checkpoint-ring-note')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
});

test("importing a dish whose journal fills the Notebook: the next own note takes the place of a copy from that dish, never of the player's own (fix round 2)", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  // The re-verifier's case: a friend's dish that carries 195 journal entries.
  const w = realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'friend-world', seed: 104729 });
  run(w, 20);
  for (let k = 0; k < 195; k++) {
    const ok = putJournalEntry(w.history, {
      version: 1,
      kind: 'observation',
      id: `observation:friend:${k}`,
      saw: `friend note ${k}`,
      coincidedWith: 'the light',
      recordedAt: `2026-09-29T10:${String(Math.floor(k / 60)).padStart(2, '0')}:${String(k % 60).padStart(2, '0')}.000Z`,
      dish: { name: 'Friend dish', second: 2, recipeId: 'FIRST_DISH_V1', seed: 104729 },
      link: null,
      worldId: 'friend-world',
    });
    if (!ok) throw new Error('refused');
  }
  const { text } = await buildSaveFile(w, { name: 'Friend dish', savedAt: '2026-09-29T11:00:00.000Z', recipeId: 'FIRST_DISH_V1' });
  const file = testInfo.outputPath('friend195.pixelmeba');
  writeFileSync(file, text);

  await seedSettings(page, { showPrompts: false });
  // Five notes of the player's own, tied to no dish: they exist only on this device.
  await page.addInitScript(() => {
    if (localStorage.getItem('pixelmeba.journal') !== null) return;
    const mine = Array.from({ length: 5 }, (_, k) => ({
      version: 1,
      kind: 'observation',
      id: `observation:mine:${k}`,
      saw: `my own note ${k}`,
      coincidedWith: 'the light going down',
      recordedAt: `2026-09-27T10:0${k}:00.000Z`,
      dish: null,
      link: null,
    }));
    localStorage.setItem('pixelmeba.journal', JSON.stringify(mine.reverse()));
  });
  const stored = () =>
    page.evaluate(() => (JSON.parse(localStorage.getItem('pixelmeba.journal') ?? '[]') as { id: string }[]).map((e) => e.id));
  const own = async () => (await stored()).filter((id) => id.startsWith('observation:mine:')).length;
  await page.goto('/');
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.locator('input[aria-label="Import a dish file"]').setInputFiles(file);
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect.poll(async () => (await stored()).length, { timeout: 30_000 }).toBe(200);
  expect(await own()).toBe(5);

  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-journal').click();
  await page.getByTestId('journal-record').click();
  const form = page.getByTestId('journal-compose');
  await form.getByTestId('journal-saw').fill('the films thicken');
  await form.getByTestId('journal-with').fill('the lid closing');
  await form.getByTestId('journal-add').click();
  // The player is told which entry made room: the oldest copy that came with the friend's dish.
  await expect(
    page.getByRole('status').filter({
      hasText: "Added to your Journal. Your Notebook lists up to 200 entries, so it no longer lists the oldest entry that came with “Friend dish” (a copy from that dish's save or file).",
    }),
  ).toBeVisible();
  const ids = await stored();
  expect(ids).toHaveLength(200);
  expect(ids).not.toContain('observation:friend:0');
  expect(await own()).toBe(5); // and the new note makes 6 of the player's own
  // After a reload every note of the player's own is still listed.
  await page.reload();
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-journal').click();
  for (let k = 0; k < 5; k++)
    await expect(page.getByTestId('journal-observation').filter({ hasText: `I saw my own note ${k} coincide with the light going down.` })).toHaveCount(1);
  await expect(page.getByTestId('journal-observation').filter({ hasText: 'I saw the films thicken coincide with the lid closing.' })).toHaveCount(1);
});

test('a shared file with a malformed journal entry changes nothing, and a malformed entry already on this device hides nothing (fix round 1)', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  // The verifier's file: a normal save whose journal holds a minimal stamp, with a recomputed checksum.
  const w = realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'poison', seed: 104729 });
  run(w, 20);
  const { text } = await buildSaveFile(w, { name: 'Shared dish', savedAt: '2026-09-28T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' });
  const f = JSON.parse(text) as { state: { history: { journal: unknown[] } }; checksum: string };
  f.state.history.journal = [{ version: 1, id: 'evil-import', kind: 'experimentStamp', experimentId: 'EXP_A', recordedAt: '2026-09-28T00:00:00Z' }];
  f.checksum = `sha256:${await sha256Hex(canonicalJson(f.state))}`;
  const file = testInfo.outputPath('poison.pixelmeba');
  writeFileSync(file, JSON.stringify(f));

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedSettings(page, { showPrompts: false });
  // A malformed entry already in device storage (merged by an older build), next to the player's own note.
  await page.addInitScript(() => {
    if (localStorage.getItem('pixelmeba.journal') !== null) return;
    localStorage.setItem(
      'pixelmeba.journal',
      JSON.stringify([
        { version: 1, id: 'evil-stored', kind: 'experimentStamp', experimentId: 'EXP_A', recordedAt: '2026-09-28T00:00:00Z' },
        { version: 1, kind: 'observation', id: 'observation:mine', saw: 'films on the stones', coincidedWith: 'the light going down', recordedAt: '2026-09-27T10:00:00.000Z', dish: null, link: null },
      ]),
    );
  });
  await page.goto('/');
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-journal').click();
  await expect(page.getByTestId('journal-observation')).toHaveCount(1);
  await expect(page.getByTestId('journal-observation')).toContainText('I saw films on the stones coincide with the light going down.');
  expect(errors).toEqual([]);

  // Importing the crafted file: refused with a clear message; nothing opens and nothing reaches the Notebook.
  await page.getByRole('button', { name: 'Back to Home' }).click();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.locator('input[aria-label="Import a dish file"]').setInputFiles(file);
  await expect(
    page.getByRole('status').filter({ hasText: "Nothing was changed: The dish's journal has an entry this version of Pixelmeba cannot read (entry 1: its title is not text)." }),
  ).toBeVisible();
  await expect(page.getByTestId('dish-screen')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('pixelmeba.journal') ?? '')).not.toContain('evil-import');
  await page.reload();
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-journal').click();
  await expect(page.getByTestId('journal-observation')).toHaveCount(1);
  expect(errors).toEqual([]);
});
