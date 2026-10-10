/**
 * G3 journey "Launch Ecology" (W6-17; BUILD_DIRECTIVE "G3 gate — evidence"): New Dish → Start with
 * 'Empty Gel Colony' → Create (the dish opens paused in the Lab with the Life tray open, D-0030; the
 * view toggle is never pressed) → Life: Velvet on gel, Threadlace, Cordweaver, Brothmaker → Food: a
 * protein dose on the Brothmakers and a slow feeder pellet (M10) → Chemistry: one salt stroke →
 * Tools: Sample (All, radius 3) on the salt → Take → Transfer → Clean water (50 %) where it landed →
 * More → Field Guide → look up Cordweaver → Back (the dish, its view and its state are unchanged) →
 * run at 4× → the inspector shows the Velvet's biofilm, the Cordweaver's links and what they carried,
 * and a cell's reaction ledger for the protein enzyme. Axe clean at each step.
 *
 * The app has no test hook: an init script wraps Worker, records the dish id and the latest snapshot's
 * organism positions, and asks the worker read-only questions ('hash') through the protocol, as
 * tests/e2e/lab-tools.spec.ts (watchWorker, workerHash) and tests/e2e/reactions.spec.ts do.
 */
import { expect, test, type Page } from '@playwright/test';
import { E_SPECIES, E_X, E_Y, ENT_STRIDE, PROTOCOL_VERSION } from '../../src/worker/protocol';
import { expectNoSeriousA11yViolations, expectReachable, expectSpeed, seedSettings, simSeconds } from './helpers';

// Software-rendered WebGL on a shared 2-CPU machine: the whole journey took about 15 min at load 7.
const SLOW = 1_800_000;

/** Gel cells (Gel Colony's water channel is x 59–68). */
const VELVET: readonly [number, number] = [30, 40];
const BROTHMAKER: readonly [number, number] = [40, 46];
const THREADLACE: readonly [number, number] = [30, 90];
const CORDWEAVER: readonly [number, number] = [40, 90];
/** In the water channel. */
const PELLET: readonly [number, number] = [63, 46];
/** The salt stroke (gel), and where the sample of it is transferred to. */
const SALT_FROM: readonly [number, number] = [86, 64];
const SALT_TO: readonly [number, number] = [92, 64];
const SAMPLE_AT: readonly [number, number] = [89, 64];
const SAMPLE_TO: readonly [number, number] = [89, 80];

interface Pm {
  workers: Worker[];
  dishId: string | null;
  next: number;
  speciesIds: string[];
  ents: number[];
  count: number;
}

/** Record the app's worker, its dish id, species list and the latest snapshot's organisms. */
async function watchWorker(page: Page): Promise<void> {
  await page.addInitScript(
    ({ stride }) => {
      const w = window as unknown as { Worker: typeof Worker; __pm: Pm };
      const Orig = w.Worker;
      w.__pm = { workers: [], dishId: null, next: 1_000_000_000, speciesIds: [], ents: [], count: 0 };
      w.Worker = class extends Orig {
        constructor(url: string | URL, opts?: WorkerOptions) {
          super(url, opts);
          w.__pm.workers.push(this);
          this.addEventListener('message', (e: MessageEvent<{ type?: string; info?: { dishId: string; speciesIds: string[] }; ents?: Float32Array; count?: number }>) => {
            const d = e.data;
            if ((d?.type === 'ready' || d?.type === 'loaded') && d.info) {
              w.__pm.dishId = d.info.dishId;
              w.__pm.speciesIds = [...d.info.speciesIds];
            }
            if (d?.type === 'snapshot' && d.ents && typeof d.count === 'number') {
              w.__pm.ents = Array.from(d.ents.subarray(0, d.count * stride));
              w.__pm.count = d.count;
            }
          });
        }
      };
    },
    { stride: ENT_STRIDE },
  );
}

/** The active dish's state hash, asked of the worker with the protocol's read-only 'hash' request. */
async function workerHash(page: Page): Promise<string> {
  return page.evaluate(async (protocolVersion) => {
    const pm = (window as unknown as { __pm: Pm }).__pm;
    const worker = pm.workers[pm.workers.length - 1];
    if (!worker || !pm.dishId) throw new Error('no worker or dish yet');
    const requestId = pm.next++;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no hash reply')), 10_000);
      const on = (e: MessageEvent<{ type: string; requestId?: number; hash?: string; message?: string }>) => {
        if (e.data?.requestId !== requestId) return;
        worker.removeEventListener('message', on);
        clearTimeout(timer);
        if (e.data.type === 'hash' && e.data.hash) resolve(e.data.hash);
        else reject(new Error(e.data.message ?? e.data.type));
      };
      worker.addEventListener('message', on);
      worker.postMessage({ type: 'hash', requestId, dishId: pm.dishId, protocolVersion });
    });
  }, PROTOCOL_VERSION);
}

/** Organisms in the latest snapshot: species id and position. */
async function organisms(page: Page): Promise<{ sp: string; x: number; y: number }[]> {
  const pm = await page.evaluate(() => (window as unknown as { __pm: Pm }).__pm);
  const out: { sp: string; x: number; y: number }[] = [];
  for (let k = 0; k < pm.count; k++) {
    const b = k * ENT_STRIDE;
    out.push({ sp: pm.speciesIds[pm.ents[b + E_SPECIES]!] ?? '?', x: pm.ents[b + E_X]!, y: pm.ents[b + E_Y]! });
  }
  return out;
}

/** Screen point of a dish position (cells) at the whole-dish zoom. */
async function dishPoint(page: Page, x: number, y: number): Promise<[number, number]> {
  await page.getByRole('button', { name: 'Whole dish' }).click();
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  return [box.x + box.width / 2 + (x - 64) * zoom, box.y + box.height / 2 + (y - 64) * zoom];
}
const cellPoint = (page: Page, [x, y]: readonly [number, number]) => dishPoint(page, x + 0.5, y + 0.5);

async function tapCell(page: Page, cell: readonly [number, number]): Promise<void> {
  const [x, y] = await cellPoint(page, cell);
  await page.mouse.click(x, y);
}

async function strokeCells(page: Page, from: readonly [number, number], to: readonly [number, number]): Promise<void> {
  const a = await cellPoint(page, from);
  const b = await cellPoint(page, to);
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  await page.mouse.move(b[0], b[1], { steps: 8 });
  await page.mouse.up();
}

/** Open a Lab category's tray unless it is already open (a second click would close it). */
async function openTray(page: Page, category: string): Promise<void> {
  const tray = page.locator(`[data-testid="lab-tray"][data-category="${category}"]`);
  if (!(await tray.isVisible())) {
    const cat = page.getByTestId(`lab-cat-${category}`);
    await cat.scrollIntoViewIfNeeded();
    await cat.click();
  }
  await expect(tray).toBeVisible();
}

/** Pick a tray item (optionally its count and radius), then "Use on the dish". */
async function pick(page: Page, category: string, item: string, opts: { count?: number; radius?: number } = {}): Promise<void> {
  await openTray(page, category);
  const button = page.getByTestId(`lab-item-${item}`);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lab-details')).toBeVisible();
  if (opts.count !== undefined) await page.getByTestId(`lab-count-${opts.count}`).click();
  if (opts.radius !== undefined) await page.getByTestId(`lab-radius-${opts.radius}`).click();
  await page.getByTestId('lab-use').click();
  await expect(page.getByTestId('lab-tray')).toBeHidden();
}

/** Life → species placed with one tap; the alive count rises by `count`. */
async function addLife(page: Page, speciesId: string, cell: readonly [number, number], count: number, radius: number): Promise<void> {
  const alive = Number(/(\d+) alive/.exec(await page.getByTestId('sim-time').innerText())![1]);
  await pick(page, 'life', `life:${speciesId}`, { count, radius });
  await tapCell(page, cell);
  await expect(page.getByTestId('sim-time')).toContainText(`${alive + count} alive`);
}

/** Inspect tool, then tap a dish point; returns the inspector (choosing the first organism if asked). */
async function inspectAt(page: Page, x: number, y: number, chooseFirst = true) {
  const inspect = page.getByTestId('lab-cat-inspect');
  await inspect.scrollIntoViewIfNeeded();
  await inspect.click();
  const [sx, sy] = await dishPoint(page, x, y);
  await page.mouse.click(sx, sy);
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  const insp = page.getByTestId('inspector');
  await expect(list.or(insp)).toBeVisible();
  if (chooseFirst && (await list.isVisible())) await list.getByRole('option').first().click();
  await expect(insp).toBeVisible();
  return insp;
}

/**
 * Whole dish, then wheel-zoom about dish point (x, y) — the camera keeps the point under the cursor
 * (gestures.ts: zoomAt(cursor, exp(-deltaY * 0.0015))), each -462 px step doubling the zoom — until a
 * tap's pick radius (≥ 12 screen px, DishRenderer.pick) is at most one cell. Returns screen px per cell
 * and the screen point of any nearby dish position.
 */
async function zoomAbout(page: Page, x: number, y: number): Promise<{ zoom: number; at: (px: number, py: number) => [number, number] }> {
  const [sx, sy] = await dishPoint(page, x, y);
  const box = await page.getByTestId('viewport').boundingBox();
  let zoom = Math.min(box!.width, box!.height) / 124;
  await page.mouse.move(sx, sy);
  while (12 / zoom > 1) {
    await page.mouse.wheel(0, -462);
    zoom *= Math.exp(462 * 0.0015);
  }
  return { zoom, at: (px, py) => [sx + (px - x) * zoom, sy + (py - y) * zoom] };
}

async function closeInspector(page: Page): Promise<void> {
  await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('inspector')).toHaveCount(0);
}

test('Launch ecology: Gel Colony with film, fungi, a producer, food, salt, Sample → Transfer, Clean water, the Field Guide, then 4× and the inspector', async ({ page }) => {
  test.setTimeout(SLOW);
  await watchWorker(page);
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');

  // New Dish → Start with 'Empty Gel Colony' → Create: paused, in the Lab, Life tray open.
  await page.getByTestId('home-new').click();
  await expect(page.getByRole('heading', { name: 'New dish' })).toBeVisible();
  const choice = page.getByTestId('new-dish-start-with-gel');
  await expectReachable(choice);
  await expect(choice).toContainText('Empty Gel Colony');
  await choice.click();
  await expect(choice).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('new-dish-habitat')).toContainText('Gel Colony');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('new-dish-start').click();
  await expect(page.getByTestId('dish-screen')).toHaveAttribute('data-view', 'lab');
  await expect(page.getByTestId('sim-time')).toContainText('0 alive');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expect(page.locator('[data-testid="lab-tray"][data-category="life"]')).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  const h0 = await workerHash(page);

  // Life: Velvet on gel, Threadlace (five segments), Cordweaver, Brothmakers.
  await addLife(page, 'B02', VELVET, 1, 1);
  await addLife(page, 'F01', THREADLACE, 5, 1);
  await addLife(page, 'F02', CORDWEAVER, 1, 1);
  await addLife(page, 'B08', BROTHMAKER, 5, 1);
  const hLife = await workerHash(page);
  expect(hLife).not.toBe(h0);

  // Food: a protein dose on the Brothmakers; one slow feeder pellet in the channel.
  await pick(page, 'food', 'material:PROTEIN', { radius: 3 });
  await tapCell(page, BROTHMAKER);
  await expect.poll(() => workerHash(page)).not.toBe(hLife);
  const hProtein = await workerHash(page);
  await pick(page, 'food', 'object:M10');
  await tapCell(page, PELLET);
  await expect(page.locator('.toast')).toContainText(/Placed one/);
  await expect.poll(() => workerHash(page)).not.toBe(hProtein);
  const hPellet = await workerHash(page);

  // Chemistry: one salt stroke on gel.
  await pick(page, 'chemistry', 'material:SALT', { radius: 3 });
  await strokeCells(page, SALT_FROM, SALT_TO);
  await expect.poll(() => workerHash(page)).not.toBe(hPellet);
  await expectNoSeriousA11yViolations(page);

  // Tools → Sample (All, radius 3) on the salt → Take → Transfer to open gel.
  await openTray(page, 'tools');
  await page.getByTestId('lab-item-sample').click();
  await expect(page.getByTestId('lab-item-sample')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('sample-mode-all').click();
  await page.getByTestId('lab-radius-3').click();
  await page.getByTestId('lab-use').click();
  const panel = page.getByTestId('sample-panel');
  await expect(panel).toHaveAttribute('data-state', 'aim');
  await tapCell(page, SAMPLE_AT);
  await expect(panel).toHaveAttribute('data-state', 'preview');
  await expect(page.getByTestId('sample-take')).toBeEnabled();
  await expectNoSeriousA11yViolations(page);
  const hBefore = await workerHash(page);
  await page.getByTestId('sample-take').click();
  await expect(panel).toHaveAttribute('data-state', 'held');
  expect(await workerHash(page)).not.toBe(hBefore);
  await page.getByTestId('sample-transfer').click();
  await expect(panel).toHaveAttribute('data-state', 'transfer');
  await tapCell(page, SAMPLE_TO);
  await expect(page.locator('.toast')).toContainText('Sample moved.');
  await expect(panel).toBeHidden();
  const hMoved = await workerHash(page);

  // Tools → Clean water, 50 %, one stroke over where the sample landed.
  await openTray(page, 'tools');
  await page.getByTestId('lab-item-cleanWater').click();
  await page.getByTestId('clean-fraction-0.5').click();
  await expect(page.getByTestId('lab-details')).toContainText('Removes 50 %');
  await page.getByTestId('lab-use').click();
  await strokeCells(page, [SAMPLE_TO[0] - 2, SAMPLE_TO[1]], [SAMPLE_TO[0] + 2, SAMPLE_TO[1]]);
  await expect(page.locator('.toast')).toContainText(/Clean water: 50 % of the water replaced on \d+ cells/);
  const hClean = await workerHash(page);
  expect(hClean).not.toBe(hMoved);
  await expectNoSeriousA11yViolations(page);

  // More → Field Guide → look up Cordweaver → Back: the same dish, view and state.
  const t0 = await simSeconds(page);
  await page.getByTestId('more').click();
  await page.getByTestId('more-guide').click();
  await expect(page.getByTestId('field-guide')).toBeVisible();
  await page.getByTestId('guide-search').fill('cordweaver');
  await expect(page.getByTestId('guide-entry-F02')).toBeVisible();
  await expect(page.getByTestId('guide-entry-F02')).toContainText('Cordweaver');
  await expectNoSeriousA11yViolations(page);
  await expectReachable(page.getByTestId('guide-back'));
  await page.getByTestId('guide-back').click();
  await expect(page.getByTestId('dish-screen')).toHaveAttribute('data-view', 'lab');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  expect(await simSeconds(page)).toBe(t0);
  expect(await workerHash(page)).toBe(hClean);

  // Run at 4× for about 30 dish seconds, then pause.
  await page.getByTestId('run-toggle').click();
  await page.keyboard.press('4');
  await expectSpeed(page, 4);
  await expect.poll(() => simSeconds(page), { timeout: 600_000, intervals: [1000] }).toBeGreaterThanOrEqual(t0 + 30);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  expect(await workerHash(page)).not.toBe(hClean);

  // The Velvet: the biofilm it built in its cell.
  const ents = await organisms(page);
  const velvet = ents.find((o) => o.sp === 'B02');
  expect(velvet, 'a Velvet is alive').toBeDefined();
  let insp = await inspectAt(page, velvet!.x, velvet!.y);
  await expect(insp.getByRole('heading', { level: 2 })).toContainText('Velvet');
  const film = insp.getByTestId('film-here');
  await expect(film).toBeVisible();
  expect(Number(/^([\d.]+)/.exec(await film.innerText())![1])).toBeGreaterThan(0);
  await expectNoSeriousA11yViolations(page);
  await closeInspector(page);

  // The Cordweaver: its network (links) and what its links carried in the last 10 s.
  const cord = ents.find((o) => o.sp === 'F02');
  expect(cord, 'a Cordweaver segment is alive').toBeDefined();
  insp = await inspectAt(page, cord!.x, cord!.y);
  await expect(insp.getByRole('heading', { level: 2 })).toContainText('Cordweaver');
  await expect(insp.getByTestId('fungal-network')).toHaveText(/^Cordweaver: \d+ segments? in \d+ separate threads?; this one has \d+ segments?\.$/);
  await expect(insp.getByTestId('fungal-transfer')).toBeVisible();
  await closeInspector(page);

  // A cell on the protein dose, away from every organism: its reaction ledger names the protein enzyme.
  // A tap selects any organism within the renderer's pick radius (≥ 24 px across, renderer.ts pick), so
  // zoom in about the dose first (on a phone the whole-dish radius spans about four cells).
  const inspectCat = page.getByTestId('lab-cat-inspect');
  await inspectCat.scrollIntoViewIfNeeded();
  await inspectCat.click();
  const zoomed = await zoomAbout(page, BROTHMAKER[0] + 0.5, BROTHMAKER[1] + 0.5);
  const pickCells = Math.max(0.9, 12 / zoomed.zoom) + 0.25;
  const near = (x: number, y: number) => Math.min(...ents.map((o) => Math.hypot(o.x - x, o.y - y)));
  let spot: [number, number] | null = null;
  let best = pickCells;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy > 9) continue;
      for (const [fx, fy] of [[0.5, 0.5], [0.15, 0.15], [0.85, 0.85], [0.15, 0.85], [0.85, 0.15]] as const) {
        const px = BROTHMAKER[0] + dx + fx;
        const py = BROTHMAKER[1] + dy + fy;
        const d = near(px, py);
        if (d > best) {
          best = d;
          spot = [px, py];
        }
      }
    }
  }
  expect(spot, 'a cell on the protein dose with no organism close').not.toBeNull();
  const [tx, ty] = zoomed.at(spot![0], spot![1]);
  await page.mouse.click(tx, ty);
  insp = page.getByTestId('inspector');
  await expect(insp).toBeVisible();
  await expect(insp.getByRole('heading', { level: 2 })).toHaveText(/^Cell \d+, \d+$/);
  const ledger = insp.getByTestId('reaction-ledger');
  await expect(ledger).toBeVisible();
  await expect(insp.getByTestId('reaction-protein')).toBeVisible();
  await expect(insp.getByTestId('reaction-protein-dish')).toContainText('since the dish began');
  const size = await ledger.evaluate((el) => parseFloat(getComputedStyle(el.querySelector('p')!).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
  await expectNoSeriousA11yViolations(page);
});
