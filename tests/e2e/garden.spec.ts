import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings, simSeconds, startGarden } from './helpers';

test('Home → Play → Garden: runs, pauses and changes speed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Pixelmeba' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await startGarden(page);
  expect(await simSeconds(page)).toBe(0);
  await page.getByTestId('run-toggle').click();
  await expect.poll(() => simSeconds(page), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  await page.getByTestId('run-toggle').click(); // pause
  const paused = await simSeconds(page);
  await page.waitForTimeout(1500);
  expect(await simSeconds(page)).toBe(paused);
  await expectNoSeriousA11yViolations(page);
});

test('keyboard: Space runs and pauses, Escape returns to Look', async ({ page }) => {
  await startGarden(page);
  await page.keyboard.press('Space');
  await expect.poll(() => simSeconds(page), { timeout: 15000 }).toBeGreaterThanOrEqual(1);
  await page.keyboard.press('Space');
  const t = await simSeconds(page);
  await page.waitForTimeout(1200);
  expect(await simSeconds(page)).toBe(t);
  await page.getByTestId('action-feed').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('action-look')).toHaveAttribute('aria-pressed', 'true');
});

/** Change speed with whichever control this layout shows (phone: one cycling button; wider: 1×/2×/4×). */
async function changeSpeedTo2x(page: Page): Promise<void> {
  const cycle = page.getByRole('button', { name: /^Speed 1×/ });
  if (await cycle.isVisible()) {
    await expectReachable(cycle);
    await cycle.click();
    await expect(page.getByRole('button', { name: /^Speed 2×/ })).toBeVisible();
  } else {
    const two = page.getByRole('group', { name: 'Speed' }).getByRole('button', { name: '2×' });
    await expectReachable(two);
    await two.click();
    await expect(two).toHaveAttribute('aria-pressed', 'true');
  }
}

// UX §4.1 / BUILD_DIRECTIVE P1.6: each layout also at 200 % text, using the app's own Text size setting.
test('at 200 % text the Garden journey still works: no sideways scrolling, controls reachable, axe clean', async ({ page }) => {
  test.setTimeout(180_000); // several axe passes over a live WebGL page on a shared CPU
  await startGarden(page, { textScale: 2 });
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', '2');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
  await expectNoHorizontalOverflow(page);
  for (const id of ['run-toggle', 'more', 'action-addlife', 'action-feed', 'action-look']) await expectReachable(page.getByTestId(id));
  await expectReachable(page.getByRole('button', { name: 'Undo (rewinds time)' }));
  await expectReachable(page.getByRole('button', { name: 'Step one tick' }));
  await expectNoSeriousA11yViolations(page);

  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expect.poll(() => simSeconds(page), { timeout: 15000 }).toBeGreaterThanOrEqual(1);
  await changeSpeedTo2x(page);
  await expectNoHorizontalOverflow(page);
  await expectReachable(page.getByTestId('run-toggle'));
  await page.getByTestId('run-toggle').click(); // pause
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const paused = await simSeconds(page);
  await page.waitForTimeout(1200);
  expect(await simSeconds(page)).toBe(paused);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
});

test('text size is a Settings choice that reaches the whole app', async ({ page }) => {
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByTestId('text-size-200').click();
  await expect(page.getByTestId('text-size-200')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  await page.reload();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
});

test.describe('reduced motion from the device', () => {
  test.use({ reducedMotion: 'reduce' });

  test('prefers-reduced-motion turns the setting on for the dish and in Settings; Settings can override it', async ({ page }) => {
    await startGarden(page);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-reduced-motion', 'true');
    await expect(html).toHaveClass(/reduced-motion/);
    await page.getByRole('button', { name: 'Home' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    const box = page.getByTestId('setting-reduced-motion');
    await expect(box).toBeChecked();
    await expect(page.getByText('Follows your device setting until you change it here.')).toBeVisible();
    await box.uncheck();
    await expect(html).toHaveAttribute('data-reduced-motion', 'false');
    // The explicit choice now wins over the device setting.
    await page.reload();
    await expect(html).toHaveAttribute('data-reduced-motion', 'false');
  });
});

test('without a device preference reduced motion is off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await startGarden(page);
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');
});
