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

test('after a manual save, Continue on Home opens that same moment', async ({ page }) => {
  await startGarden(page);
  await page.getByTestId('run-toggle').click();
  await expect.poll(() => simSeconds(page), { timeout: 15000 }).toBeGreaterThanOrEqual(3);
  await page.getByTestId('run-toggle').click();
  const alive = await page.getByTestId('sim-time').innerText();
  await page.getByTestId('more').click();
  await page.getByTestId('more-save').click();
  await page.getByTestId('save-confirm').click();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toBeVisible();
  await page.reload();
  await page.getByTestId('home-continue').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toHaveText(alive);
});

// Saved dishes: focus follows the delete confirmation and never drops to <body> (UX §4.2 keyboard).
test('deleting a saved dish keeps keyboard focus: Keep, Delete…, then the page heading', async ({ page }) => {
  await startGarden(page);
  await page.getByTestId('more').click();
  await page.getByTestId('more-save').click();
  await page.getByTestId('save-confirm').click();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  const slotId = await page.locator('li[data-slot]').filter({ has: page.getByTestId('slot-delete') }).first().getAttribute('data-slot');
  const row = page.locator(`li[data-slot="${slotId}"]`);
  await row.getByTestId('slot-delete').click();
  await expect(row.getByTestId('slot-keep')).toBeFocused();
  await page.keyboard.press('Enter'); // Keep
  await expect(row.getByTestId('slot-delete')).toBeFocused();
  await page.keyboard.press('Enter'); // Delete…
  await expect(row.getByTestId('slot-keep')).toBeFocused();
  await row.getByTestId('slot-delete-confirm').click();
  await expect(page.getByRole('status').filter({ hasText: 'Deleted.' })).toBeVisible();
  await expect(page.locator('#saves-title')).toBeFocused();
});
