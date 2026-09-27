import { expect, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** Store initial settings before the app loads (kept across reloads once the player changes them). */
export async function seedSettings(page: Page, settings: Record<string, unknown>): Promise<void> {
  await page.addInitScript((s) => {
    if (localStorage.getItem('pixelmeba.settings') === null) localStorage.setItem('pixelmeba.settings', JSON.stringify(s));
  }, settings);
}

/** Open the Garden from Home → Play. `settings` are stored as the player's explicit choices. */
export async function startGarden(page: Page, settings: Record<string, unknown> = {}): Promise<void> {
  await seedSettings(page, { showPrompts: false, ...settings });
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
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

/** Tap the viewport at a fraction of its size. */
export async function tapViewport(page: Page, fx = 0.5, fy = 0.5): Promise<void> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

/** Camera fit used by the renderer's "Whole dish" preset (src/render/camera.ts). */
const DISH_CENTER = 64;
const DISH_RADIUS_VIEW = 62;

/**
 * Tap an organism near a dish position (cells) at the whole-dish zoom, choosing the first candidate
 * when the tap is ambiguous. Returns the selected organism's birth id.
 */
export async function selectOrganism(page: Page, near: readonly [number, number] = [48.5, 64.5]): Promise<number> {
  await page.getByRole('button', { name: 'Whole dish' }).click();
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / (DISH_RADIUS_VIEW * 2);
  const heading = page.getByTestId('inspector').getByRole('heading', { level: 2 });
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [2, 1],
  ] as const) {
    await page.mouse.click(box.x + box.width / 2 + (near[0] + dx - DISH_CENTER) * zoom, box.y + box.height / 2 + (near[1] + dy - DISH_CENTER) * zoom);
    await expect(list.or(heading)).toBeVisible();
    if (await list.isVisible()) await list.getByRole('option').first().click();
    await expect(heading).toBeVisible();
    const m = /#(\d+)/.exec(await heading.innerText());
    if (m) return Number(m[1]);
    await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click();
  }
  throw new Error('no organism found near the tap');
}

/** No sideways page scrolling: the document and the dish chrome fit the window width. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: Record<string, number> = { doc: document.documentElement.scrollWidth - vw, body: document.body.scrollWidth - vw };
    for (const sel of ['.topbar', '.bottombar', '.home-grid']) {
      const el = document.querySelector(sel);
      if (el) out[sel] = el.scrollWidth - el.clientWidth;
    }
    return out;
  });
  for (const [k, v] of Object.entries(widths)) expect(v, `${k} overflows sideways by ${v}px`).toBeLessThanOrEqual(1);
}

/** Visible, inside the window once scrolled to (panels may scroll), and a 48 px touch target (UX §4.1). */
export async function expectReachable(el: Locator): Promise<void> {
  await expect(el).toBeVisible();
  await el.scrollIntoViewIfNeeded();
  await expect(el).toBeInViewport({ ratio: 0.9 });
  const box = await el.boundingBox();
  expect(box && Math.min(box.width, box.height)).toBeGreaterThanOrEqual(47.5);
}
