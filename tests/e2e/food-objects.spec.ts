/**
 * P3.6 journey: finite food objects (SPEC §5.1; CT §5.2 M11; UX §4.4, §6.5). In an empty Sediment
 * Edge Lab dish: Food → Leaf wafer → tap one open cell → the object is in the dish → run at 4× → its
 * fill steps fall → the cell inspector lists what the wafer still holds. The object's fill is read
 * from each 'snapshot' message the worker posts (an init script wraps Worker; the app has no test
 * hook; never pixels), so the journey checks the authoritative state the renderer draws.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  expectReachable,
  seedSettings,
  simSeconds,
} from './helpers';

/** Generous: software-rendered WebGL on a shared 2-CPU machine. */
const SLOW = 600_000;
/** An open water cell of Sediment Edge, away from the stone (r 13 at (45,43)) and the sediment (y ≥ 64). */
const CELL: readonly [number, number] = [90, 30];

interface SeenObject {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly kind: string;
  readonly fill: number;
}

/** Record every snapshot's food objects (protocol 2 SnapshotMsg.objects) as the worker posts them. */
async function watchObjects(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { Worker: typeof Worker; __fo: { last: unknown[] | null; fills: number[]; snapshots: number } };
    const Orig = w.Worker;
    w.__fo = { last: null, fills: [], snapshots: 0 };
    w.Worker = class extends Orig {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        this.addEventListener('message', (e: MessageEvent<{ type?: string; objects?: { fill: number }[] }>) => {
          if (e.data?.type !== 'snapshot') return;
          w.__fo.snapshots++;
          const objs = e.data.objects ?? [];
          w.__fo.last = objs;
          if (objs.length === 1) {
            const f = objs[0]!.fill;
            if (w.__fo.fills.length === 0 || w.__fo.fills[w.__fo.fills.length - 1] !== f) w.__fo.fills.push(f);
          }
        });
      }
    };
  });
}

async function lastObjects(page: Page): Promise<SeenObject[] | null> {
  return page.evaluate(() => (window as unknown as { __fo: { last: SeenObject[] | null } }).__fo.last);
}

async function fills(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as unknown as { __fo: { fills: number[] } }).__fo.fills.slice());
}

/** Fill step (0–3) of a food object, as src/render/world3.ts objectFrame draws it. */
const step = (fill: number) => (fill > 0.75 ? 3 : fill > 0.5 ? 2 : fill > 0.25 ? 1 : 0);

async function cellPoint(page: Page, [x, y]: readonly [number, number]): Promise<[number, number]> {
  await page.getByRole('button', { name: 'Whole dish' }).click();
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  return [box.x + box.width / 2 + (x + 0.5 - 64) * zoom, box.y + box.height / 2 + (y + 0.5 - 64) * zoom];
}

test('Lab Food → Leaf wafer: one tap places one object; at 4× its fill steps fall; the cell inspector shows what it still holds', async ({
  page,
}) => {
  test.setTimeout(SLOW);
  await watchObjects(page);
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByTestId('home-new').click();
  const choice = page.getByTestId('new-dish-start-with-sediment');
  await expectReachable(choice);
  await choice.click();
  const start = page.getByTestId('new-dish-start');
  await expectReachable(start);
  await start.click();
  await expect(page.getByTestId('dish-screen')).toHaveAttribute('data-view', 'lab');
  await expect(page.getByTestId('sim-time')).toContainText('0 alive');
  await expectNoHorizontalOverflow(page);

  // Food → Leaf wafer: the item explains itself before use (one per tap, not a brush).
  const cat = page.getByTestId('lab-cat-food');
  await cat.click();
  const tray = page.getByTestId('lab-tray');
  await expect(tray).toHaveAttribute('data-category', 'food');
  await expect(tray.getByTestId('lab-item-object:M10')).toBeVisible();
  const item = tray.getByTestId('lab-item-object:M11');
  await item.scrollIntoViewIfNeeded();
  await item.click();
  await expect(item).toHaveAttribute('aria-pressed', 'true');
  const details = page.getByTestId('lab-details');
  await expect(details).toContainText('Leaf wafer');
  await expect(details).toContainText('6 starch carbon, 4 protein carbon and 1 bound nutrient');
  await expect(details).toContainText('Not a brush.');
  expect(await details.locator('dd').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  expect(await item.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  const box = await item.boundingBox();
  expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(47.5);
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('lab-use').click();
  await expect(tray).toBeHidden();
  await expect(page.getByTestId('lab-tool-name')).toHaveText('Leaf wafer');

  // One tap = one object, in the tapped cell, full.
  expect(await lastObjects(page)).toEqual([]);
  const [sx, sy] = await cellPoint(page, CELL);
  await page.mouse.click(sx, sy);
  await expect(page.locator('.toast')).toContainText('Placed one leaf wafer.');
  await expect.poll(async () => (await lastObjects(page))?.length ?? 0).toBe(1);
  const [placed] = (await lastObjects(page))!;
  expect(placed).toMatchObject({ kind: 'wafer', x: CELL[0] + 0.5, y: CELL[1] + 0.5, fill: 1 });
  // A second tap on the same cell is refused by the simulation and says why; still one object.
  await page.mouse.click(sx, sy);
  await expect(page.locator('.toast')).toContainText('this cell already holds a food object');
  expect((await lastObjects(page))!.length).toBe(1);

  // Run at 4×: the wafer lets its inventory out, and its drawn fill step falls (3 → 2 after 125 s).
  const t0 = await simSeconds(page);
  await page.getByTestId('run-toggle').click();
  await page.keyboard.press('4');
  await expect
    .poll(async () => {
      const objs = await lastObjects(page);
      return objs && objs.length === 1 ? step(objs[0]!.fill) : -1;
    }, { timeout: 420_000, intervals: [2000] })
    .toBeLessThanOrEqual(2);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  expect(await simSeconds(page)).toBeGreaterThan(t0 + 120);
  const seen = await fills(page);
  expect(seen.length).toBeGreaterThan(2);
  for (let k = 1; k < seen.length; k++) expect(seen[k]!).toBeLessThan(seen[k - 1]!);
  expect(step(seen[0]!)).toBe(3);
  expect(step(seen[seen.length - 1]!)).toBeLessThanOrEqual(2);
  const fillNow = (await lastObjects(page))![0]!.fill;

  // The cell inspector lists the wafer and exactly what it still holds (remaining C = fill × 10).
  await page.getByTestId('lab-cat-inspect').click();
  await page.mouse.click(sx, sy);
  const insp = page.getByTestId('inspector');
  await expect(insp.getByRole('heading', { level: 2 })).toHaveText(`Cell ${CELL[0]}, ${CELL[1]}`);
  const line = insp.getByTestId('cell-object');
  await expect(line).toContainText('Leaf wafer:');
  const text = await line.innerText();
  const m = /([\d.]+) starch C, ([\d.]+) protein C and ([\d.]+) N left/.exec(text);
  expect(m, text).not.toBeNull();
  const [starch, protein, n] = [Number(m![1]), Number(m![2]), Number(m![3])];
  expect(starch).toBeGreaterThan(0);
  expect(starch).toBeLessThan(6 * 0.75 + 0.001);
  expect(protein / starch).toBeCloseTo(4 / 6, 2);
  expect(n).toBeCloseTo((starch + protein) / 10, 2);
  expect((starch + protein) / 10).toBeCloseTo(fillNow, 2);
  // Text sizes (UX §4.1: ≥ 16 px). The inspector's detail rows share its 14 px .kv style, a known
  // deferral to P3.11 (docs/DECISIONS.md, "inspector detail rows … at 14 px"): the new line matches its rows.
  const size = (el: typeof line) => el.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(await size(insp.getByRole('heading', { level: 2 }))).toBeGreaterThanOrEqual(16);
  expect(await size(line)).toBe(await size(insp.getByTestId('cell-ph')));
  await expectNoSeriousA11yViolations(page);
});
