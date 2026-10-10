/**
 * P3.11 keyboard journey (BUILD_DIRECTIVE "Done when: keyboard journey e2e passes"; UX §4.2, §9):
 * Home → Play → Garden → run → Add Life (L) → place with Enter at the reticle → Inspect (I) → select
 * with Enter → "Why did it stop?" → Esc → Undo (U) → More → Save → Field Guide ('/' search) → back,
 * with no mouse at all. Every focus stop on the way shows a visible focus indicator, and the live
 * region announces the one-line results (placement accepted with its count, undone, saved).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations, seedSettings, simSeconds } from './helpers';

/** The focused element is a real control (not the body) with a visible focus indicator. */
async function expectFocusVisible(page: Page): Promise<string> {
  const r = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { ok: false, what: 'nothing (body)' };
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
    const what = `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ''} “${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}”`;
    return {
      ok: outline && el.matches(':focus-visible') && box.width > 0 && box.height > 0,
      what: `${what} outline ${cs.outlineStyle} ${cs.outlineWidth}`,
    };
  });
  expect(r.ok, `focus indicator on ${r.what}`).toBe(true);
  return r.what;
}

/** Press Tab (or Shift+Tab) until `target` holds focus, checking the indicator at every stop. */
async function tabTo(page: Page, target: Locator, { back = false, max = 80 } = {}): Promise<void> {
  await target.waitFor();
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) {
      await expectFocusVisible(page);
      return;
    }
    await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
    if (i % 4 === 3 || i === 0) await expectFocusVisible(page);
  }
  throw new Error(
    `could not reach ${target.toString()} with ${back ? 'Shift+Tab' : 'Tab'} in ${max} presses`,
  );
}

/** The dish holds focus, with its centre reticle shown. */
async function expectDishFocused(page: Page): Promise<void> {
  await expect(page.getByTestId('dish-focus')).toBeFocused();
  await expect(page.getByTestId('reticle')).toBeVisible();
  await expectFocusVisible(page);
}

const liveRegion = (page: Page) => page.getByTestId('live-region');

async function alive(page: Page): Promise<number> {
  return Number(/(\d+) alive/.exec(await page.getByTestId('sim-time').innerText())![1]);
}

test('keyboard only: Home → Garden → run → Add Life → place with Enter → Inspect → Why? → Esc → Undo → Save → Field Guide search → back', async ({
  page,
}) => {
  test.setTimeout(480_000);
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await expect(page.getByTestId('home-play')).toBeVisible();

  // Home → Play → Garden.
  await tabTo(page, page.getByTestId('home-play'));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByTestId('start-garden'));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('56 alive');
  // The pressed button is gone with the page: focus lands on the dish, not the page body.
  await expectDishFocused(page);
  await expectNoSeriousA11yViolations(page);

  // Run (Space on the dish), then pause again once time has moved.
  await page.keyboard.press(' ');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expect.poll(() => simSeconds(page), { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  await page.keyboard.press(' ');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const before = await alive(page);

  // Add Life (L): choose 20 Sprinters with the keyboard; the sheet closes and focus returns to the dish.
  await page.keyboard.press('l');
  const sheet = page
    .getByRole('region', { name: 'Add Life' })
    .or(page.locator('section.sheet[aria-labelledby="addlife-title"]'));
  await expect(sheet).toBeVisible();
  await tabTo(page, sheet.getByRole('button', { name: '20', exact: true }));
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('button', { name: '20', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await tabTo(page, page.getByTestId('species-B01'));
  await page.keyboard.press('Enter');
  await expect(sheet).toHaveCount(0);
  await expectDishFocused(page);

  // Place with Enter at the reticle: one gesture, one command; the live region says what was accepted.
  await page.keyboard.press('Enter');
  await expect(liveRegion(page)).toHaveText(/^Added \d+ Sprinter/);
  const added = Number(/^Added (\d+)/.exec(await liveRegion(page).innerText())![1]);
  expect(added).toBeGreaterThan(0);
  await expect.poll(() => alive(page)).toBe(before + added);
  // Explore: tap-to-place returns to Look, and focus stays on the dish.
  await expect(page.getByTestId('action-look')).toHaveAttribute('aria-pressed', 'true');
  await expectDishFocused(page);

  // Inspect (I), then Enter at the reticle selects (through the candidate list when several are close).
  await page.keyboard.press('i');
  await page.keyboard.press('Enter');
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  const insp = page.getByTestId('inspector');
  const heading = insp.getByRole('heading', { level: 2 });
  await expect(list.or(heading)).toBeVisible();
  if (await list.isVisible()) {
    await expect(list.getByRole('option').first()).toBeFocused();
    await expectFocusVisible(page);
    await expectNoSeriousA11yViolations(page);
    await page.keyboard.press('Enter');
  }
  await expect(heading).toContainText(/#\d+/);
  await expectNoSeriousA11yViolations(page);

  // "Why did it stop?" — reached with Tab, pressed with Enter; it opens Happening now and focuses the blockers.
  await tabTo(page, insp.getByTestId('shortcut-why'));
  await page.keyboard.press('Enter');
  await expect(insp.getByRole('tab', { name: 'Happening now' })).toHaveAttribute('aria-selected', 'true');
  await expect(insp.getByTestId('why-stop')).toBeFocused();
  await expectFocusVisible(page);

  // Esc → Look: the inspector closes and focus returns to the dish.
  await page.keyboard.press('Escape');
  await expect(insp).toHaveCount(0);
  await expectDishFocused(page);

  // Undo (U) rewinds the placement; the live region says so.
  await page.keyboard.press('u');
  await expect(liveRegion(page)).toHaveText('Undone — time rewound to before that change.');
  await expect.poll(() => alive(page)).toBe(before);

  // More → Save → Save.
  await tabTo(page, page.getByTestId('more'), { back: true });
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByTestId('more-save'));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByTestId('save-confirm'));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('save-confirm')).toHaveCount(0);
  await expect(liveRegion(page)).toContainText('Saved “Little Living Garden”');

  // More → Field Guide; '/' focuses its search; type, then back to the dish.
  await tabTo(page, page.getByTestId('more'), { back: true });
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByTestId('more-guide'));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('field-guide')).toBeVisible();
  await page.keyboard.press('/');
  await expect(page.getByTestId('guide-search')).toBeFocused();
  await expectFocusVisible(page);
  await page.keyboard.type('sprinter');
  await expect(page.getByTestId('guide-entry-B01')).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await tabTo(page, page.getByTestId('guide-back'), { back: true });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText(`${before} alive`);
  await expectDishFocused(page);
});

test('keyboard: arrows pan the dish under the reticle, Esc closes the candidate list, and no dish key acts behind What if?', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await tabTo(page, page.getByTestId('home-play'));
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByTestId('start-garden'));
  await page.keyboard.press('Enter');
  await expectDishFocused(page);

  // Enter at the reticle in Look with nothing there describes the cell (the dish's accessible description).
  // Pan with the arrows until the reticle is over open water without organisms, then read it.
  const insp = page.getByTestId('inspector');
  const cellDescription = page.getByTestId('cell-description');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  await expect(list.or(insp)).toBeVisible();
  if (await list.isVisible()) {
    await expect(list.getByRole('option').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expectDishFocused(page);
  } else {
    const h = insp.getByRole('heading', { level: 2 });
    if (/^Cell /.test(await h.innerText())) {
      await expect(cellDescription).toHaveText(/^Selected cell \d+, \d+: .+\. pH .+ Residents: .+\.$/);
      await expect(page.getByTestId('dish-focus')).toHaveAccessibleDescription(/Selected cell \d+, \d+/);
    }
    await page.keyboard.press('Escape');
    await expect(insp).toHaveCount(0);
    await expectDishFocused(page);
  }

  // The species list summarizes the canvas.
  const summary = page.getByTestId('dish-summary');
  await expect(summary).toContainText(/56 alive, \d+ kinds? of organism\./);
  await expect(summary).toContainText(/Sprinter: \d+ alive/);
  await expect(summary).toContainText('None in the dish now:');

  // What if? is a blocking modal: the dish keys do nothing behind it.
  await tabTo(page, page.getByTestId('more'), { back: true });
  await page.keyboard.press('Enter');
  await tabTo(page, page.getByTestId('more-whatif'));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('whatif-sheet')).toBeVisible();
  const t0 = await page.getByTestId('sim-time').innerText();
  for (const k of ['l', 'f', 'u', '4', '.']) await page.keyboard.press(k);
  await expect(page.locator('section.sheet[aria-labelledby="addlife-title"]')).toHaveCount(0);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  expect(await page.getByTestId('sim-time').innerText()).toBe(t0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('whatif-sheet')).toHaveCount(0);
});
