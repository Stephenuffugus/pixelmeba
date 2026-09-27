import { expect, test } from '@playwright/test';
import { simSeconds, startGarden } from './helpers';

test('save to a slot, reload the page, and open the same dish paused at the same moment', async ({ page }) => {
  await startGarden(page);
  await page.getByTestId('run-toggle').click();
  await expect.poll(() => simSeconds(page), { timeout: 15000 }).toBeGreaterThanOrEqual(3);
  await page.getByTestId('run-toggle').click();
  const t = await simSeconds(page);
  const alive = await page.getByTestId('sim-time').innerText();
  await page.getByTestId('more').click();
  await page.getByTestId('more-save').click();
  await page.getByTestId('save-confirm').click();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.getByRole('button', { name: 'Open' }).first().click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  expect(await simSeconds(page)).toBe(t);
  await expect(page.getByTestId('sim-time')).toHaveText(alive);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
});
