import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function startGarden(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('pixelmeba.settings', JSON.stringify({ showPrompts: false })));
  await page.goto('/');
  await page.getByTestId('home-play').click();
  await page.getByTestId('start-garden').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('56 alive');
}

export async function simSeconds(page: Page): Promise<number> {
  const t = await page.getByTestId('sim-time').innerText();
  const m = /^(?:(\d+):)?(\d+):(\d+)/.exec(t.trim());
  if (!m) throw new Error(`unparsable time ${t}`);
  return (Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3]);
}

export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

/** Tap the viewport at a fraction of its size. */
export async function tapViewport(page: Page, fx = 0.5, fy = 0.5): Promise<void> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}
