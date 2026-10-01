/**
 * P3.4 journey (SPEC §7.5, §10.2; UX §5.2 INFECTED, Lab wording): Garden → Lab → Life → Pinphage, a
 * 20-unit dose over the Sprinters → run a few seconds (less than the 20 s to lysis) → tap Sprinters
 * until one is infected: its inspector reads "Infected by Pinphage; lysis in {t}s." from the worker's
 * recorded state. Axe clean; the line is at least 16 px.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations, startGarden } from './helpers';

const SLOW = 420_000;
/** FIRST_DISH_V1's Sprinters start within radius 3 of (48, 64). */
const SPRINTERS: readonly [number, number] = [48, 64];

/** Screen point of a cell's centre at the whole-dish zoom (press "Whole dish" first). */
async function cellPoint(page: Page, [x, y]: readonly [number, number]): Promise<[number, number]> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  return [box.x + box.width / 2 + (x + 0.5 - 64) * zoom, box.y + box.height / 2 + (y + 0.5 - 64) * zoom];
}

test('Lab: a Pinphage dose over Sprinters infects them; the inspector reads "Infected by Pinphage; lysis in …s."', async ({ page }) => {
  test.setTimeout(SLOW);
  await startGarden(page);
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('lab-bar')).toBeVisible();

  // Life → Pinphage, 20 units per cell, radius 3, over the Sprinters (the dish is paused).
  await page.getByTestId('lab-cat-life').click();
  const item = page.getByTestId('lab-item-life:V01');
  await item.scrollIntoViewIfNeeded();
  await item.click();
  await expect(item).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('lab-count-20').click();
  await page.getByTestId('lab-radius-3').click();
  await page.getByTestId('lab-use').click();
  await page.getByRole('button', { name: 'Whole dish' }).click();
  const [dx, dy] = await cellPoint(page, SPRINTERS);
  await page.mouse.click(dx, dy);
  await expect(page.locator('.toast')).toContainText(/Pinphage units/);
  await expect(page.getByTestId('sim-time')).toContainText('56 alive'); // a dose adds no organism

  // 30 single ticks (3 s, far less than the 20 s to lysis): each Sprinter in a 20-unit cell is
  // infected with p ≈ 0.095 per tick. Stepping never overshoots, whatever the machine's load.
  const stepBtn = page.getByRole('button', { name: 'Step one tick' });
  for (let t = 0; t < 30; t++) await stepBtn.click();
  await expect(page.getByTestId('sim-time')).toContainText('0:03');

  // Tap Sprinters until one reports its infection (lysis is 20 s after infection, so none has burst yet).
  const inspect = page.getByTestId('lab-cat-inspect');
  await inspect.scrollIntoViewIfNeeded();
  await inspect.click();
  const insp = page.getByTestId('inspector');
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  const infection = insp.getByTestId('infection');
  let found = false;
  for (let dy2 = -2; dy2 <= 2 && !found; dy2++) {
    for (let dx2 = -2; dx2 <= 2 && !found; dx2++) {
      const [sx, sy] = await cellPoint(page, [SPRINTERS[0] + dx2, SPRINTERS[1] + dy2]);
      await page.mouse.click(sx, sy);
      await page.waitForTimeout(150);
      if (await list.isVisible()) await list.getByRole('option').first().click();
      if (!(await insp.isVisible())) continue;
      const heading = await insp.getByRole('heading', { level: 2 }).innerText();
      if (heading.includes('Sprinter') && (await infection.count()) > 0) {
        found = true;
        break;
      }
      await insp.getByRole('button', { name: 'Close' }).click();
    }
  }
  expect(found, 'an infected Sprinter near the dose').toBe(true);
  await expect(infection).toHaveText(/^Infected by Pinphage; lysis in \d+s\.$/);
  const left = Number(/lysis in (\d+)s/.exec(await infection.innerText())![1]);
  expect(left).toBeGreaterThan(0);
  expect(left).toBeLessThanOrEqual(20);
  expect(await infection.evaluate((n) => parseFloat(getComputedStyle(n).fontSize))).toBeGreaterThanOrEqual(16);
  await expectNoSeriousA11yViolations(page);

  // Explore uses UX §5.2's Explore wording for the same recorded infection (fix1).
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('lab-bar')).toBeHidden();
  if (!(await insp.isVisible())) {
    const [sx, sy] = await cellPoint(page, SPRINTERS);
    await page.mouse.click(sx, sy);
  }
  await expect(infection).toHaveText("It's infected and can't split.");
  await expectNoSeriousA11yViolations(page);
});
