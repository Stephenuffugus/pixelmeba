import { expect, test, type Page } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  expectReachable,
  seedSettings,
  simSeconds,
  startGarden,
} from './helpers';

// P2.6 done-when (e2e whatif, gate G2): Garden → What if? → pick R-G3 → the preview shows the old
// patch as an outline and the new one solid → Details line → Start → a new dish opens paused →
// Again → Another idea; and the all-slots-used path (Cancel changes nothing; export or replace).

const title = (page: Page) => page.locator('.topbar .title strong');

async function runFor(page: Page, seconds: number): Promise<number> {
  await page.getByTestId('run-toggle').click();
  await expect.poll(() => simSeconds(page), { timeout: 20_000 }).toBeGreaterThanOrEqual(seconds);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  return simSeconds(page);
}

async function openFromMore(page: Page): Promise<void> {
  await page.getByTestId('more').click();
  await expectReachable(page.getByTestId('more-whatif'));
  await page.getByTestId('more-whatif').click();
  await expect(page.getByTestId('whatif-sheet')).toBeVisible();
  await expect(page.getByTestId('whatif-plan')).toBeVisible();
}

async function expectNewPausedDish(page: Page, name: string): Promise<void> {
  await expect(page.getByTestId('whatif-sheet')).toHaveCount(0);
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(title(page)).toHaveText(name);
  await expect(page.getByTestId('sim-time')).toHaveText(/^0:00 · 56 alive/);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
}

test('What if?: Garden → R-G3 preview and Details → Start a new paused dish → Again → Another idea', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByTestId('home-play').click();

  // UX §2.2: a secondary What if? link under Garden opens the sheet.
  await expectReachable(page.getByTestId('whatif-open'));
  await page.getByTestId('whatif-open').click();
  const sheet = page.getByTestId('whatif-sheet');
  await expect(sheet.getByRole('heading', { name: 'What if?' })).toBeFocused();
  await expect(page.getByTestId('whatif-plan')).toContainText('No dish is open');

  // At most three choices: icon + label + one sentence naming the single difference.
  await expect(sheet.getByRole('radio')).toHaveCount(3);
  await expect(page.getByTestId('whatif-choice-R-G1')).toContainText('A smaller meal');
  await expect(page.getByTestId('whatif-choice-R-G1')).toContainText(
    'The sugar patch starts with half as much sugar.',
  );
  await expect(page.getByTestId('whatif-choice-R-G2')).toContainText('A bigger meal');
  await expect(page.getByTestId('whatif-choice-R-G3')).toContainText(
    'The same sugar patch starts farther from where the Sprinters begin.',
  );

  // Selecting is not starting.
  await page.getByTestId('whatif-choice-R-G3').click();
  await expect(sheet.getByRole('radio', { name: /Dinner farther away/ })).toBeChecked();
  await expect(page.getByTestId('dish-screen')).toHaveCount(0);
  await expect(page.getByTestId('whatif-selected')).toContainText('Who reaches the food now?');

  // R-G3 preview: Before shows the patch; After shows an outline at the old place and a solid new patch.
  const preview = page.getByTestId('whatif-preview');
  await expect(
    preview.getByRole('img', { name: /^Before: the sugar patch where it usually starts/ }),
  ).toBeVisible();
  await expect(
    preview.getByRole('img', {
      name: /^After: the sugar patch starts in a new place; a dashed outline marks where it was/,
    }),
  ).toBeVisible();
  const before = (await preview.getByTestId('whatif-before-patch').boundingBox())!;
  const old = (await preview.getByTestId('whatif-old-patch').boundingBox())!;
  const moved = (await preview.getByTestId('whatif-new-patch').boundingBox())!;
  expect(await preview.getByTestId('whatif-old-patch').getAttribute('stroke-dasharray')).toBeTruthy();
  expect(await preview.getByTestId('whatif-old-patch').getAttribute('fill')).toBe('none');
  expect(Math.abs(before.width - moved.width)).toBeLessThan(1); // the same patch, the same size
  const mid = (b: { x: number; y: number; width: number; height: number }) =>
    [b.x + b.width / 2, b.y + b.height / 2] as const;
  const beforeSvg = (await preview.getByTestId('whatif-before').boundingBox())!;
  const afterSvg = (await preview.getByTestId('whatif-after').boundingBox())!;
  // The outline sits exactly where the Before panel draws the patch (the box includes its stroke) …
  expect(Math.abs(mid(before)[0] - beforeSvg.x - (mid(old)[0] - afterSvg.x))).toBeLessThan(1.5);
  expect(Math.abs(mid(before)[1] - beforeSvg.y - (mid(old)[1] - afterSvg.y))).toBeLessThan(1.5);
  // … and the new patch is farther down the dish, clear of the old place.
  expect(Math.abs(mid(moved)[0] - mid(old)[0])).toBeLessThan(1.5);
  expect(moved.y).toBeGreaterThan(old.y + old.height);
  await expect(preview).toContainText('Where it was before');
  await expect(preview).toContainText('Where the 24 Sprinters start');

  // Details: values, seed, versions and the identity line with Copy (text stays selectable either way).
  await page.getByTestId('whatif-choice-details').click();
  await expect(page.getByTestId('whatif-choice-identity')).toHaveText('R-G3 / rev 1 / seed 104729');
  await expect(page.getByTestId('whatif-selected')).toContainText(
    'moved from (48, 64) to (48, 82); still 0.40 sugar per cell, radius 6',
  );
  await expect(page.getByTestId('whatif-selected')).toContainText('Standard Evolution');
  await expect(page.getByTestId('whatif-selected')).toContainText(/simulation \d+ · evolution rules \d+/);
  await page.getByTestId('whatif-choice-copy').click();
  await expect(page.getByTestId('whatif-selected').getByRole('status')).toHaveText(
    /Copied\.|Copying is not available here/,
  );
  await expectReachable(page.getByTestId('whatif-start'));
  await expectNoSeriousA11yViolations(page);

  await page.getByTestId('whatif-start').click();
  await expectNewPausedDish(page, 'Dinner farther away');
  await page.waitForTimeout(500);
  expect(await simSeconds(page)).toBe(0); // opened paused, and stays paused

  // Let it run, then Again: the dish is kept in a slot and the same start is rebuilt.
  const ran = await runFor(page, 2);
  await openFromMore(page);
  const current = page.getByTestId('whatif-current');
  await expect(current).toContainText('This dish: Dinner farther away');
  await expect(page.getByTestId('whatif-plan')).toContainText('will first be saved to Slot 1');
  await expect(page.getByTestId('whatif-next')).toContainText('Next: “Garden”.');
  await page.getByTestId('whatif-current-details').click();
  await expect(page.getByTestId('whatif-current-identity')).toHaveText('R-G3 / rev 1 / seed 104729');
  await expect(current).toContainText(/Recipe checksum\s*sha256:[0-9a-f]{64}/);
  await expect(current).toContainText(/Idea checksum\s*sha256:[0-9a-f]{64}/);
  await expect(current).toContainText('Start state hash');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('whatif-again').click();
  await expect(page.getByRole('status').filter({ hasText: 'was saved to Slot 1' })).toContainText(
    'again from the same start',
  );
  await expectNewPausedDish(page, 'Dinner farther away');

  // Another idea: the next in catalog order after R-G3 is R-G0 (Garden). An untouched dish needs no save.
  await openFromMore(page);
  await expect(page.getByTestId('whatif-plan')).toContainText('has not changed since it started');
  await page.getByTestId('whatif-another').click();
  await expectNewPausedDish(page, 'Garden');
  await openFromMore(page);
  await expect(page.getByTestId('whatif-next')).toContainText('Next: “A smaller meal”.');
  await page.getByTestId('whatif-close').click();
  await expect(page.getByTestId('whatif-sheet')).toHaveCount(0);

  // The first dish is in Slot 1 exactly where it was left.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByText('Dinner farther away', { exact: true }) });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(`${ran} s simulated`);
});

test('What if? with all ten slots used: Cancel changes nothing; export, or deliberately replace a save', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await startGarden(page);
  // Fill all ten named slots (each save takes the first empty slot).
  for (let i = 0; i < 10; i++) {
    await page.getByTestId('more').click();
    await page.getByTestId('more-save').click();
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('save-confirm')).toHaveCount(0);
  }
  // A new Garden dish, not saved anywhere yet, that has run for a moment.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('home-play').click();
  await page.getByTestId('start-garden').click();
  await expect(page.getByTestId('sim-time')).toHaveText(/^0:00 · 56 alive/);
  const t = await runFor(page, 1);
  const alive = await page.getByTestId('sim-time').innerText();

  // Start → all slots used → Cancel: nothing written, the dish is exactly as it was.
  await openFromMore(page);
  await expect(page.getByTestId('whatif-plan')).toContainText('All ten save slots are used');
  await page.getByTestId('whatif-start').click();
  await expect(page.getByTestId('whatif-full')).toContainText('All ten save slots are used');
  await expect(page.getByTestId('whatif-full')).toContainText('Cancel changes nothing');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('whatif-cancel').click();
  await expect(page.getByTestId('whatif-notice')).toHaveText('Nothing was changed.');
  await page.getByTestId('whatif-close').click();
  await expect(title(page)).toHaveText('Little Living Garden');
  await expect(page.getByTestId('sim-time')).toHaveText(alive);
  expect(await simSeconds(page)).toBe(t);

  // Export it as a file, then start: no slot is written.
  await openFromMore(page);
  await page.getByTestId('whatif-start').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('whatif-export').click();
  expect((await download).suggestedFilename()).toBe('little-living-garden.pixelmeba');
  await expect(page.getByTestId('whatif-exported')).toContainText('Exported little-living-garden.pixelmeba.');
  await page.getByTestId('whatif-start-exported').click();
  await expect(page.getByRole('status').filter({ hasText: 'is in the file you exported' })).toBeVisible();
  await expectNewPausedDish(page, 'A smaller meal');

  // Run it, then Another idea → Replace a saved dish: a deliberate choice, confirmed, then started.
  await runFor(page, 1);
  await openFromMore(page);
  await page.getByTestId('whatif-another').click();
  await expect(page.getByTestId('whatif-full')).toBeVisible();
  await page.getByTestId('whatif-replace').click();
  await expect(page.getByTestId('whatif-replace-start')).toBeDisabled();
  await page.getByTestId('whatif-slot-slot3').click();
  await expect(page.getByTestId('whatif-replace-confirm')).toHaveText(
    '“Little Living Garden” in Slot 3 will be replaced by “A smaller meal”.',
  );
  await expectReachable(page.getByTestId('whatif-replace-start'));
  await page.getByTestId('whatif-replace-start').click();
  await expect(
    page.getByRole('status').filter({ hasText: 'replaced “Little Living Garden” in Slot 3' }),
  ).toBeVisible();
  await expectNewPausedDish(page, 'A bigger meal');

  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await expect(page.getByText('A smaller meal', { exact: true })).toHaveCount(1);
  await expect(page.getByText('Little Living Garden', { exact: true })).toHaveCount(9);
});

test('What if? at 200 % text: choices, preview, Details and Start reachable, nothing sideways, axe clean', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedSettings(page, { showPrompts: false, textScale: 2 });
  await page.goto('/');
  await page.getByTestId('home-play').click();
  await expectReachable(page.getByTestId('whatif-open'));
  await page.getByTestId('whatif-open').click();
  for (const id of ['R-G1', 'R-G2', 'R-G3']) await expectReachable(page.getByTestId(`whatif-choice-${id}`));
  await page.getByTestId('whatif-choice-R-G1').click();
  await expect(
    page
      .getByTestId('whatif-preview')
      .getByRole('img', { name: 'After: the sugar patch in the same place with less sugar.' }),
  ).toBeVisible();
  await expectReachable(page.getByTestId('whatif-choice-details'));
  await page.getByTestId('whatif-choice-details').click();
  await expect(page.getByTestId('whatif-choice-identity')).toHaveText('R-G1 / rev 1 / seed 104729');
  await expect(page.getByTestId('whatif-selected')).toContainText('0.40 → 0.20 sugar per cell');
  await expectReachable(page.getByTestId('whatif-choice-copy'));
  await expectReachable(page.getByTestId('whatif-start'));
  await expectReachable(page.getByTestId('whatif-close'));
  await expectNoHorizontalOverflow(page);
  const overflow = await page.getByTestId('whatif-sheet').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expectNoSeriousA11yViolations(page);
  // Escape closes without starting anything.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('whatif-sheet')).toHaveCount(0);
  await expect(page.getByTestId('whatif-open')).toBeFocused();

  // From a running dish's More sheet the dish pauses while the sheet is open and resumes on close.
  await page.getByTestId('start-garden').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await openFromMore(page);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const t = await simSeconds(page);
  await expectReachable(page.getByTestId('whatif-start'));
  await expectNoSeriousA11yViolations(page);
  await page.waitForTimeout(1200);
  expect(await simSeconds(page)).toBe(t);
  await page.getByTestId('whatif-close').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
});
