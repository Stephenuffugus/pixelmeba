/**
 * P3.6 part 1 journey (W3-10): Notebook → Experiments → Oil neighborhood (one dish) → run at 4× →
 * tap cells on the oil patch → the reaction ledger shows oil converted and metabolite made, and says
 * "Made here by Oilwick" only when an Oilwick in that cell or a four-neighbour released lipid enzyme in
 * the last tick (its snapshot SECRETING cue; otherwise "Enzyme present") → Lab → Observe → Food access with its legend. Text ≥ 16 px; axe clean.
 *
 * Organism positions come from the worker's own snapshots (an init script records them; the app has
 * no test hook), so each tap lands in a cell at a point no organism is close enough to be picked.
 */
import { expect, test, type Page } from '@playwright/test';
import { CUE_SECRETING, E_CUE, E_SPECIES, E_X, E_Y, ENT_STRIDE } from '../../src/worker/protocol';
import { expectNoSeriousA11yViolations, seedSettings, simSeconds } from './helpers';

interface Seen {
  speciesIds: string[];
  ents: number[];
  count: number;
}

async function watchSnapshots(page: Page): Promise<void> {
  await page.addInitScript(
    ({ stride }) => {
      const w = window as unknown as { Worker: typeof Worker; __pm: Seen };
      const Orig = w.Worker;
      w.__pm = { speciesIds: [], ents: [], count: 0 };
      w.Worker = class extends Orig {
        constructor(url: string | URL, opts?: WorkerOptions) {
          super(url, opts);
          this.addEventListener('message', (e: MessageEvent<{ type?: string; info?: { speciesIds: string[] }; ents?: Float32Array; count?: number }>) => {
            const d = e.data;
            if ((d?.type === 'ready' || d?.type === 'loaded') && d.info) w.__pm.speciesIds = [...d.info.speciesIds];
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

async function seen(page: Page): Promise<Seen> {
  return page.evaluate(() => (window as unknown as { __pm: Seen }).__pm);
}

/** Every visible text inside `selector` is at least 16 px (UX §9). */
async function expectTextAtLeast16px(page: Page, selector: string): Promise<void> {
  const small = await page.evaluate((sel) => {
    const out: string[] = [];
    for (const root of Array.from(document.querySelectorAll(sel))) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim() ?? '';
        const el = n.parentElement;
        if (!text || !el || el.closest('.sr-only')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 15.9) out.push(`${el.tagName.toLowerCase()}.${el.className}: ${fs}px “${text.slice(0, 40)}”`);
      }
    }
    return out;
  }, selector);
  expect(small).toEqual([]);
}

interface Tap {
  cell: [number, number];
  point: [number, number];
  oilwickNear: boolean;
}

/** Patch cells (r 6 around (64, 64)) with a point inside them more than 1.05 cells from every organism. */
function tappableCells(s: Seen): Tap[] {
  const pos: { x: number; y: number; sp: string; releasing: boolean }[] = [];
  for (let k = 0; k < s.count; k++) {
    const b = k * ENT_STRIDE;
    const releasing = (s.ents[b + E_CUE]! & CUE_SECRETING) !== 0;
    pos.push({ x: s.ents[b + E_X]!, y: s.ents[b + E_Y]!, sp: s.speciesIds[s.ents[b + E_SPECIES]!] ?? '?', releasing });
  }
  const out: Tap[] = [];
  for (let cy = 58; cy <= 70; cy++) {
    for (let cx = 58; cx <= 70; cx++) {
      if ((cx - 64) ** 2 + (cy - 64) ** 2 > 36) continue;
      let best: [number, number] | null = null;
      let bestD = 1.05;
      for (const fx of [0.15, 0.5, 0.85]) {
        for (const fy of [0.15, 0.5, 0.85]) {
          const px = cx + fx;
          const py = cy + fy;
          const d = Math.min(...pos.map((p) => Math.hypot(p.x - px, p.y - py)));
          if (d > bestD) {
            bestD = d;
            best = [px, py];
          }
        }
      }
      if (!best) continue;
      const oilwickNear = pos.some((p) => {
        // An Oilwick that released this tick (B07's only producer is the lipid enzyme).
        if (p.sp !== 'B07' || !p.releasing) return false;
        const dx = Math.floor(p.x) - cx;
        const dy = Math.floor(p.y) - cy;
        return Math.abs(dx) + Math.abs(dy) <= 1;
      });
      out.push({ cell: [cx, cy], point: best, oilwickNear });
    }
  }
  return out;
}

async function tapDish(page: Page, point: [number, number]): Promise<void> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  await page.mouse.click(box.x + box.width / 2 + (point[0] - 64) * zoom, box.y + box.height / 2 + (point[1] - 64) * zoom);
}

test('reactions: Oil neighborhood → reaction ledger with honest provenance → Food access overlay', async ({ page }) => {
  test.setTimeout(300_000);
  await seedSettings(page, { showPrompts: false });
  await watchSnapshots(page);
  await page.goto('/');
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-experiments').click();
  await page.getByTestId('experiment-card-EXP_202').click();
  await expect(page.getByTestId('experiment-card-completion')).toContainText('The world keeps running.');
  await page.getByTestId('experiment-start').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('40 alive');
  // The card's start prompt sits over the dish chrome; dismiss it.
  const prompt = page.locator('.prompt');
  if (await prompt.isVisible()) await prompt.getByRole('button', { name: 'Dismiss' }).click();
  await expect(prompt).toHaveCount(0);

  // Run at 4× for about 20 dish seconds, then pause.
  await page.getByTestId('run-toggle').click();
  await page.keyboard.press('4');
  await expect.poll(() => simSeconds(page), { timeout: 180_000, intervals: [1000] }).toBeGreaterThanOrEqual(20);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await page.getByRole('button', { name: 'Whole dish' }).click();
  // Let the paused snapshot arrive.
  await page.waitForTimeout(500);
  const taps = tappableCells(await seen(page));
  expect(taps.length).toBeGreaterThan(0);

  // Try cells with and without an Oilwick close by until each kind (that exists) was read with oil converted.
  const insp = page.getByTestId('inspector');
  const wanted = new Set(taps.map((t) => t.oilwickNear));
  const checked = new Set<boolean>();
  let reads = 0;
  for (const t of taps) {
    if (checked.has(t.oilwickNear)) continue;
    await page.getByRole('button', { name: 'Whole dish' }).click();
    await tapDish(page, t.point);
    await expect(insp).toBeVisible();
    await expect(insp.getByRole('heading', { level: 2 })).toHaveText(`Cell ${t.cell[0]}, ${t.cell[1]}`);
    const row = insp.getByTestId('reaction-oil');
    if ((await row.count()) === 0) continue;
    const last = await insp.getByTestId('reaction-oil-last').innerText();
    if (!/oil carbon became/.test(last)) continue;
    expect(last).toMatch(/^Last second here: [\d.e-]+ oil carbon became [\d.e-]+ metabolite;/);
    const source = insp.getByTestId('reaction-oil-source');
    if (t.oilwickNear) await expect(source).toContainText('Made here by Oilwick');
    else await expect(source).toContainText('Enzyme present');
    await expect(insp.getByTestId('reaction-oil-dish')).toContainText('since the dish began');
    if (reads === 0) {
      await expectTextAtLeast16px(page, '[data-testid="reaction-ledger"]');
      await expectNoSeriousA11yViolations(page);
    }
    checked.add(t.oilwickNear);
    reads++;
    if (checked.size === wanted.size) break;
  }
  expect(reads).toBeGreaterThan(0);
  expect([...checked].sort()).toEqual([...wanted].sort());
  await insp.getByRole('button', { name: 'Close' }).click();

  // Lab → Observe → Food access, with its legend; choosing None turns it off again.
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('lab-bar')).toBeVisible();
  await page.getByTestId('lab-cat-observe').click();
  const food = page.getByTestId('overlay-foodAccess');
  await food.scrollIntoViewIfNeeded();
  const box = await food.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(48);
  await food.click();
  await expect(food).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('lab-tray').getByRole('group', { name: 'Food access overlay legend' })).toBeVisible();
  await expect(page.getByTestId('overlay-legend')).toContainText('Food access');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('overlay-none').click();
  await expect(food).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('overlay-legend')).toBeHidden();
  await food.click();
  await expect(food).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('overlay-legend')).toBeVisible();
});
