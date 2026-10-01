/**
 * P3.6 journey (F02 Cordweaver): New Dish → Start with 'Empty Gel Colony' → Create (Lab) → Life →
 * Cordweaver placed on gel → run at 4× until it branches (its first division, about 110 dish seconds
 * on Gel Colony's background sugar) → tap a segment: the inspector shows the network line (segments and
 * separate threads counted apart) and the transport line (carbon sent and received along its links in
 * the last 10 s, measured by the worker; "No carbon moved…" while both halves hold the same body).
 * Axe clean; the transport line's text is at least 16 px.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations, expectReachable, seedSettings, simSeconds } from './helpers';

const SLOW = 600_000;
/** A gel cell (Gel Colony's water channel is x 59–68). */
const CELL: readonly [number, number] = [30, 90];

async function newGelColony(page: Page): Promise<void> {
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByTestId('home-new').click();
  await expect(page.getByRole('heading', { name: 'New dish' })).toBeVisible();
  const choice = page.getByTestId('new-dish-start-with-gel');
  await expectReachable(choice);
  await choice.click();
  await expect(choice).toHaveAttribute('aria-checked', 'true');
  const start = page.getByTestId('new-dish-start');
  await expectReachable(start);
  await start.click();
  await expect(page.getByTestId('dish-screen')).toHaveAttribute('data-view', 'lab');
  await expect(page.getByTestId('sim-time')).toContainText('0 alive');
}

/** Screen point of a cell's center at the whole-dish zoom. */
async function cellPoint(page: Page, [x, y]: readonly [number, number]): Promise<[number, number]> {
  await page.getByRole('button', { name: 'Whole dish' }).click();
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  return [box.x + box.width / 2 + (x + 0.5 - 64) * zoom, box.y + box.height / 2 + (y + 0.5 - 64) * zoom];
}

/** Life → Cordweaver, one organism, radius 1. */
async function pickCordweaver(page: Page): Promise<void> {
  const tray = page.locator('[data-testid="lab-tray"][data-category="life"]');
  if (!(await tray.isVisible())) {
    const cat = page.getByTestId('lab-cat-life');
    await cat.scrollIntoViewIfNeeded();
    await cat.click();
  }
  await expect(tray).toBeVisible();
  const item = page.getByTestId('lab-item-life:F02');
  await item.scrollIntoViewIfNeeded();
  await expect(item).toContainText('Cordweaver');
  await item.click();
  await expect(item).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lab-details')).toBeVisible();
  await page.getByTestId('lab-count-1').click();
  await page.getByTestId('lab-radius-1').click();
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('lab-use').click();
  await expect(page.getByTestId('lab-tray')).toBeHidden();
}

test('Gel Colony: a Cordweaver branches, and a tap shows its network and what its links carried', async ({ page }) => {
  test.setTimeout(SLOW);
  await newGelColony(page);
  await expectNoSeriousA11yViolations(page);

  await pickCordweaver(page);
  const [cx, cy] = await cellPoint(page, CELL);
  await page.mouse.click(cx, cy);
  await expect(page.getByTestId('sim-time')).toContainText('1 alive');

  // Run at 4× until the first branch (a second segment), then pause.
  const t0 = await simSeconds(page);
  await page.getByTestId('run-toggle').click();
  await page.keyboard.press('4');
  await expect(page.getByTestId('sim-time')).toContainText('2 alive', { timeout: 480_000 });
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  expect(await simSeconds(page)).toBeGreaterThan(t0 + 35); // F02's minimum division age is 35 s

  // Tap the original segment (it stays in its cell; the daughter grew into a side cell).
  const inspect = page.getByTestId('lab-cat-inspect');
  await inspect.scrollIntoViewIfNeeded();
  await inspect.click();
  const [sx, sy] = await cellPoint(page, CELL);
  await page.mouse.click(sx, sy);
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  const insp = page.getByTestId('inspector');
  await expect(list.or(insp)).toBeVisible();
  if (await list.isVisible()) await list.getByRole('option').first().click();
  await expect(insp).toBeVisible();
  await expect(insp.getByRole('heading', { level: 2 })).toContainText('Cordweaver');
  await expect(insp.getByTestId('fungal-network')).toContainText('Cordweaver: 2 segments in 1 separate thread; this one has 2 segments.');
  const transfer = insp.getByTestId('fungal-transfer');
  await expect(transfer).toBeVisible();
  await expect(transfer).toHaveText(
    /^(No carbon moved along its links in the last 10 s\.|(Sent \d+\.\d{3} carbon to \d+ linked segments? in the last 10 s\.)? ?(Received \d+\.\d{3} carbon from \d+ linked segments? in the last 10 s\.)?)$/,
  );
  const size = await transfer.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
  await expectNoSeriousA11yViolations(page);
});
