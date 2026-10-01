/**
 * P3.3 journey: New Dish → Start with 'Empty Gel Colony' → Create (Lab) → Life → Velvet: the brush
 * preview crosses out every cell of the water channel and accepts gel; one Velvet placed on gel,
 * about 30 s run, then a tap on its cell shows the biofilm it built there (a tap on an occupied cell
 * selects the organism, whose panel reads the cell's film). Then Threadlace placed on gel, run, and a
 * tap on a segment shows the network line (segments and separate threads counted apart). Axe clean
 * at each step.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations, expectReachable, seedSettings, simSeconds } from './helpers';

const SLOW = 600_000;
/** Gel cells (the water channel is x 59–68). */
const VELVET: readonly [number, number] = [30, 40];
const THREADLACE: readonly [number, number] = [30, 90];
/** The middle of the water channel. */
const CHANNEL: readonly [number, number] = [63, 40];

async function newGelColony(page: Page): Promise<void> {
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByTestId('home-new').click();
  await expect(page.getByRole('heading', { name: 'New dish' })).toBeVisible();
  const choice = page.getByTestId('new-dish-start-with-gel');
  await expectReachable(choice);
  await choice.click();
  await expect(choice).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('new-dish-habitat')).toContainText('Gel Colony');
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

/** Life → species, with the given count and radius; the tray closes and the tool stays selected. */
async function pickLife(page: Page, speciesId: string, count: number, radius: number): Promise<void> {
  const tray = page.locator('[data-testid="lab-tray"][data-category="life"]');
  // A new dish opens with the Life tray already open (UX §2.3); a second click would close it.
  if (!(await tray.isVisible())) {
    const cat = page.getByTestId('lab-cat-life');
    await cat.scrollIntoViewIfNeeded();
    await cat.click();
  }
  await expect(tray).toBeVisible();
  const item = page.getByTestId(`lab-item-life:${speciesId}`);
  await item.scrollIntoViewIfNeeded();
  await item.click();
  await expect(item).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lab-details')).toBeVisible();
  await page.getByTestId(`lab-count-${count}`).click();
  await page.getByTestId(`lab-radius-${radius}`).click();
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('lab-use').click();
  await expect(page.getByTestId('lab-tray')).toBeHidden();
}

/** Run at 4× until the dish clock passes `seconds` more, then pause. */
async function runFor(page: Page, seconds: number): Promise<void> {
  const t0 = await simSeconds(page);
  await page.getByTestId('run-toggle').click();
  await page.keyboard.press('4');
  await expect
    .poll(() => simSeconds(page), { timeout: 300_000, intervals: [1000] })
    .toBeGreaterThanOrEqual(t0 + seconds);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
}

/** Inspect tool, then tap the centre of a cell; returns the inspector (choosing the first organism if asked). */
async function tapToInspect(page: Page, cell: readonly [number, number]) {
  const inspect = page.getByTestId('lab-cat-inspect');
  await inspect.scrollIntoViewIfNeeded();
  await inspect.click();
  const [sx, sy] = await cellPoint(page, cell);
  await page.mouse.click(sx, sy);
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  const insp = page.getByTestId('inspector');
  await expect(list.or(insp)).toBeVisible();
  if (await list.isVisible()) await list.getByRole('option').first().click();
  await expect(insp).toBeVisible();
  return insp;
}

test('Gel Colony: Velvet is refused open water, builds biofilm on gel; Threadlace reports its threads', async ({
  page,
}) => {
  test.setTimeout(SLOW);
  await newGelColony(page);
  await expectNoSeriousA11yViolations(page);

  // Life → Velvet: the preview refuses every cell of the water channel and accepts gel.
  await pickLife(page, 'B02', 1, 3);
  const [wx, wy] = await cellPoint(page, CHANNEL);
  await page.mouse.move(wx, wy);
  const info = page.getByTestId('brush-info');
  await expect(info).toContainText(/^0 cells · \d+ crossed out \(skipped\)$/);
  const [gx, gy] = await cellPoint(page, VELVET);
  await page.mouse.move(gx, gy);
  await expect(info).toContainText(/^\d+ cells$/);
  await expect(info).not.toContainText('crossed out');

  // One Velvet on gel (radius 1): placed while paused.
  await pickLife(page, 'B02', 1, 1);
  await page.mouse.click(gx, gy);
  await expect(page.getByTestId('sim-time')).toContainText('1 alive');

  // About 30 s: after 10 s attached with energy above 40 it moves body into its cell's film.
  await runFor(page, 30);
  let insp = await tapToInspect(page, VELVET);
  await expect(insp.getByRole('heading', { level: 2 })).toContainText('Velvet');
  const film = insp.getByTestId('film-here');
  await expect(film).toBeVisible();
  const amount = Number(/^([\d.]+)/.exec(await film.innerText())![1]);
  expect(amount).toBeGreaterThan(0);
  expect(amount).toBeLessThanOrEqual(0.5);
  await expectNoSeriousA11yViolations(page);
  await insp.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('inspector')).toHaveCount(0);

  // Threadlace on gel: five segments in five cells, run a little, then tap one.
  await pickLife(page, 'F01', 5, 1);
  const [tx, ty] = await cellPoint(page, THREADLACE);
  await page.mouse.click(tx, ty);
  await expect(page.getByTestId('sim-time')).toContainText('6 alive');
  await runFor(page, 3);
  insp = await tapToInspect(page, THREADLACE);
  await expect(insp.getByRole('heading', { level: 2 })).toContainText('Threadlace');
  await expect(insp.getByTestId('fungal-network')).toHaveText(
    /^Threadlace: \d+ segments? in \d+ separate threads?; this one has \d+ segments?\.$/,
  );
  await expect(insp.getByTestId('fungal-network')).toContainText(
    '5 segments in 5 separate threads; this one has 1 segment.',
  );
  await expectNoSeriousA11yViolations(page);
});
