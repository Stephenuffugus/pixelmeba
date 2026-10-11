/**
 * P4.8 Observe tools journey: run the Garden 20 s at 4×, then in Lab → Observe open the relationship
 * map (a Sprinter seen eating sugar; the 180 s window), and draw two overlapping regions (a rectangle
 * and a circle) whose readings and overlap warning show. The dish's state hash, asked of the worker
 * through the protocol's read-only 'hash' request (an init script records the page's Worker; the app
 * has no test hook), is unchanged by all of it: observation never changes the dish.
 */
import { expect, test, type Page } from '@playwright/test';
import { PROTOCOL_VERSION } from '../../src/worker/protocol';
import {
  chooseSpeed,
  expectNoSeriousA11yViolations,
  expectReachable,
  simSeconds,
  startGarden,
} from './helpers';

/** Record the app's worker and its current dish id (from 'ready'/'loaded' replies). */
async function watchWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      Worker: typeof Worker;
      __pm: { workers: Worker[]; dishId: string | null; next: number };
    };
    const Orig = w.Worker;
    w.__pm = { workers: [], dishId: null, next: 1_000_000_000 };
    w.Worker = class extends Orig {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        w.__pm.workers.push(this);
        this.addEventListener('message', (e: MessageEvent<{ type?: string; info?: { dishId: string } }>) => {
          if ((e.data?.type === 'ready' || e.data?.type === 'loaded') && e.data.info)
            w.__pm.dishId = e.data.info.dishId;
        });
      }
    };
  });
}

/** The active dish's state hash and tick, asked of the worker with the read-only 'hash' request. */
async function workerHash(page: Page): Promise<string> {
  return page.evaluate(async (protocolVersion) => {
    const pm = (window as unknown as { __pm: { workers: Worker[]; dishId: string | null; next: number } })
      .__pm;
    const worker = pm.workers[pm.workers.length - 1];
    if (!worker || !pm.dishId) throw new Error('no worker or dish yet');
    const requestId = pm.next++;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no hash reply')), 10_000);
      const on = (
        e: MessageEvent<{ type: string; requestId?: number; hash?: string; tick?: number; message?: string }>,
      ) => {
        if (e.data?.requestId !== requestId) return;
        worker.removeEventListener('message', on);
        clearTimeout(timer);
        if (e.data.type === 'hash' && e.data.hash) resolve(`${e.data.tick}:${e.data.hash}`);
        else reject(new Error(e.data.message ?? e.data.type));
      };
      worker.addEventListener('message', on);
      worker.postMessage({ type: 'hash', requestId, dishId: pm.dishId, protocolVersion });
    });
  }, PROTOCOL_VERSION);
}

/** One mouse drag across the dish at the whole-dish zoom, in cells. */
async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  const at = (cx: number, cy: number): [number, number] => [
    box.x + box.width / 2 + (cx - 64) * zoom,
    box.y + box.height / 2 + (cy - 64) * zoom,
  ];
  const a = at(...from);
  const b = at(...to);
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { steps: 6 });
  await page.mouse.move(b[0], b[1], { steps: 6 });
  await page.mouse.up();
}

/** Inside the panel: every text at least 16 CSS px (SVG labels by their drawn height) and every button or radio label a 48 px target. */
async function expectReadableTargets(page: Page, testid: string): Promise<void> {
  const bad = await page.evaluate((id) => {
    const root = document.querySelector(`[data-testid="${id}"]`);
    if (!root) return [`no ${id}`];
    const out: string[] = [];
    for (const el of Array.from(root.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || el.closest('.sr-only')) continue;
      const text = Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '',
      );
      if (text && el.closest('svg')) {
        if (r.height < 15) out.push(`svg text "${el.textContent}" ${r.height.toFixed(1)}px tall`);
      } else if (text && parseFloat(getComputedStyle(el).fontSize) < 15.9)
        out.push(`"${(el.textContent ?? '').slice(0, 30)}" ${getComputedStyle(el).fontSize}`);
      if (
        (el.tagName === 'BUTTON' || el.classList.contains('observe-radio')) &&
        Math.min(r.width, r.height) < 47.5
      )
        out.push(
          `target "${(el.textContent ?? '').slice(0, 30)}" ${r.width.toFixed(0)}×${r.height.toFixed(0)}`,
        );
    }
    return out;
  }, testid);
  expect(bad).toEqual([]);
}

async function openObserve(page: Page): Promise<void> {
  await page.getByTestId('lab-cat-observe').click();
  await expect(page.getByTestId('lab-tray')).toHaveAttribute('data-category', 'observe');
}

const SLOW = 420_000;

test('Observe: the relationship map and two overlapping regions; looking changes nothing', async ({
  page,
}) => {
  test.setTimeout(SLOW);
  await watchWorker(page);
  await startGarden(page);
  await expect(page.locator('.viewport canvas')).toBeVisible();

  // Run 20 dish seconds at 4×, then pause.
  await page.getByTestId('run-toggle').click();
  await chooseSpeed(page, 4);
  await expect
    .poll(() => simSeconds(page), { timeout: 240_000, intervals: [500] })
    .toBeGreaterThanOrEqual(20);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const h0 = await workerHash(page);

  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('lab-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Whole dish' }).click();

  // Relationship map: a table first; a Sprinter seen eating sugar; the window switches to 180 s.
  await openObserve(page);
  await expectReachable(page.getByTestId('lab-relmap'));
  await page.getByTestId('lab-relmap').click();
  const sheet = page.getByTestId('relmap-sheet');
  await expect(sheet).toBeVisible();
  const sprinter = sheet.locator('tr[data-edge="eats:B01:sugar"]');
  await expect(sprinter).toContainText('Sprinter');
  await expect(sprinter).toContainText('eats');
  await expect(sprinter).toContainText('sugar');
  await expect(sprinter).toContainText(/seen eating in \d+ of the last 60 s/);
  await expect(sheet.getByTestId('relmap-footnote')).toHaveText(
    "Only what this dish recorded is shown. A missing arrow means it wasn't seen in this window, not that it can't happen.",
  );
  await expect(sheet.locator('[data-testid="relmap-arrow"][data-edge="eats:B01:sugar"]')).toContainText(
    'eats',
  );
  await expect(page.getByTestId('relmap-window-60')).toBeChecked();
  await expectNoSeriousA11yViolations(page);
  await expectReadableTargets(page, 'relmap-sheet');
  await page.getByTestId('relmap-window-180').check();
  await expect(sheet.getByRole('columnheader', { name: 'Measured in the last 180 s' })).toBeVisible();
  await expect(sprinter).toContainText(/seen eating in \d+ of the last 180 s/);
  await page.getByTestId('relmap-close').click();
  await expect(sheet).toBeHidden();
  expect(await workerHash(page)).toBe(h0);

  // Regions: a rectangle, then a circle overlapping it; one drag = one region.
  await openObserve(page);
  await page.getByTestId('lab-regions').click();
  const session = page.getByTestId('probe-session');
  await expect(session).toBeVisible();
  await expect(page.getByTestId('probe-shape-rect')).toHaveAttribute('aria-pressed', 'true');
  await drag(page, [44, 86], [60, 104]);
  await expect(page.getByTestId('probe-count')).toHaveText('1 of 6 regions');
  await page.getByTestId('probe-shape-circle').click();
  await drag(page, [62, 100], [70, 100]);
  await expect(page.getByTestId('probe-count')).toHaveText('2 of 6 regions');
  await expectReadableTargets(page, 'probe-session');
  await page.getByTestId('probe-show').click();
  const probes = page.getByTestId('probe-sheet');
  await expect(probes).toBeVisible();
  await expect(probes.getByTestId('probe-region-A')).toContainText('Region A · rectangle');
  await expect(probes.getByTestId('probe-region-B')).toContainText('Region B · circle');
  await expect(probes.getByTestId('probe-living-A')).toContainText(/Living now|Nobody lives here now/);
  await expect(probes.getByTestId('probe-boundary-A')).toContainText('Sugar');
  await expect(probes.getByTestId('probe-overlap')).toHaveText(
    "Regions A and B overlap. Cells inside both are counted in each, so don't add their totals together.",
  );
  await expect(probes.getByTestId('probe-not-saved')).toHaveText('Regions are not saved with the dish.');
  await expectNoSeriousA11yViolations(page);
  await expectReadableTargets(page, 'probe-sheet');
  expect(await workerHash(page)).toBe(h0);

  // Keyboard-reachable Delete: region B goes, and the warning with it.
  const del = probes.getByTestId('probe-delete-B');
  await expectReachable(del);
  await del.focus();
  await page.keyboard.press('Enter');
  await expect(probes.getByTestId('probe-region-B')).toBeHidden();
  await expect(probes.getByTestId('probe-overlap')).toBeHidden();

  // Escape ends a drawing session.
  await probes.getByTestId('probe-draw').click();
  await expect(session).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(session).toBeHidden();
  expect(await workerHash(page)).toBe(h0);
});
