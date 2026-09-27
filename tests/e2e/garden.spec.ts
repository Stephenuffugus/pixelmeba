import { expect, test } from '@playwright/test';
import { expectNoSeriousA11yViolations, simSeconds, startGarden } from './helpers';

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
