import { expect, test } from '@playwright/test';
import { startGarden, tapViewport } from './helpers';

test('one tap places one dose, and undo rewinds it', async ({ page }) => {
  await startGarden(page);
  await page.getByTestId('action-feed').click();
  await page.getByTestId('feed-choose').click();
  await tapViewport(page, 0.62, 0.3);
  await expect(page.getByRole('status').filter({ hasText: /Added sugar to \d+ cells/ })).toBeVisible();
  // Tap-to-place returns to Look.
  await expect(page.getByTestId('action-look')).toHaveAttribute('aria-pressed', 'true');
  const undo = page.getByRole('button', { name: 'Undo (rewinds time)' });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.getByRole('status').filter({ hasText: 'Undone' })).toBeVisible();
});

test('Add Life places organisms and reports the accepted count', async ({ page }) => {
  await startGarden(page);
  await page.getByTestId('action-addlife').click();
  await page.getByTestId('species-P01').click();
  await tapViewport(page, 0.5, 0.5);
  await expect(page.getByRole('status').filter({ hasText: /Added \d+ Amoeba/ })).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText(/6[01] alive/);
});

test('a two-finger gesture never paints, even with a paint tool selected', async ({ page }) => {
  await startGarden(page);
  await page.getByTestId('action-feed').click();
  await page.getByRole('button', { name: 'Paint' }).click();
  await page.getByTestId('feed-choose').click();
  const box = (await page.getByTestId('viewport').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.evaluate(
    ({ cx, cy }) => {
      const el = document.querySelector('[data-testid="viewport"] canvas')!;
      const ev = (type: string, id: number, x: number, y: number) =>
        el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', button: 0, isPrimary: id === 1 }));
      ev('pointerdown', 1, cx - 20, cy);
      ev('pointerdown', 2, cx + 20, cy);
      for (let k = 1; k <= 6; k++) {
        ev('pointermove', 1, cx - 20 - k * 8, cy);
        ev('pointermove', 2, cx + 20 + k * 8, cy);
      }
      ev('pointerup', 1, cx - 68, cy);
      ev('pointerup', 2, cx + 68, cy);
    },
    { cx, cy },
  );
  await page.waitForTimeout(600);
  await expect(page.getByRole('status').filter({ hasText: /Added sugar/ })).toHaveCount(0);
});
