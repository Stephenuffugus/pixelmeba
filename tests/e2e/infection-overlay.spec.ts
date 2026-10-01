/**
 * P3.3/P3.4 Observe journey (wave 2 art-features; SPEC §10.8, UX §4.4): in a new dish the Lab's
 * Observe tray lists the Biofilm and Pinphage density overlays (one at a time, with their units), and a
 * separate "Infection markers" toggle — a labelled 48 px button with aria-pressed — that stays on
 * whatever overlay is chosen. Looking changes nothing: the worker's state hash (read through the
 * protocol's read-only 'hash' request, as tests/e2e/lab-tools.spec.ts does) is the same before and
 * after the toggle and the overlays. Text ≥ 16 px; axe clean; no page errors while the dish draws.
 */
import { expect, test, type Page } from '@playwright/test';
import { PROTOCOL_VERSION } from '../../src/worker/protocol';
import { expectNoSeriousA11yViolations, startGarden } from './helpers';

/** Record the app's worker and its current dish id (from 'ready'/'loaded' replies). */
async function watchWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { Worker: typeof Worker; __pm: { workers: Worker[]; dishId: string | null; next: number } };
    const Orig = w.Worker;
    w.__pm = { workers: [], dishId: null, next: 2_000_000_000 };
    w.Worker = class extends Orig {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        w.__pm.workers.push(this);
        this.addEventListener('message', (e: MessageEvent<{ type?: string; info?: { dishId: string } }>) => {
          if ((e.data?.type === 'ready' || e.data?.type === 'loaded') && e.data.info) w.__pm.dishId = e.data.info.dishId;
        });
      }
    };
  });
}

/** The active dish's state hash, asked of the worker with the protocol's read-only 'hash' request. */
async function workerHash(page: Page): Promise<string> {
  return page.evaluate(async (protocolVersion) => {
    const pm = (window as unknown as { __pm: { workers: Worker[]; dishId: string | null; next: number } }).__pm;
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

/** Every visible text inside `selector` is at least 16 px (UX §9). */
async function smallText(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
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
        if (fs < 15.9) out.push(`${el.tagName.toLowerCase()}: ${fs}px “${text.slice(0, 40)}”`);
      }
    }
    return out;
  }, selector);
}

test('observe: Biofilm and Pinphage overlays, and an Infection markers toggle that changes nothing', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await watchWorker(page);
  await startGarden(page);
  // The Garden opens paused (as tests/e2e/lab-tools.spec.ts relies on): looking must leave it exactly as it is.
  await expect(page.locator('.viewport canvas')).toBeVisible();
  const before = await workerHash(page);
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('lab-bar')).toBeVisible();

  await page.getByTestId('lab-cat-observe').click();
  const film = page.getByTestId('overlay-film');
  const phage = page.getByTestId('overlay-v01');
  await expect(film).toHaveText('Biofilm');
  await expect(phage).toHaveText('Pinphage');
  // One overlay at a time, each with its own unit.
  await phage.click();
  await expect(phage).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('overlay-legend')).toContainText('units per cell');
  await film.click();
  await expect(film).toHaveAttribute('aria-checked', 'true');
  await expect(phage).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('overlay-legend')).toContainText('C per cell');

  // The Infection markers toggle: a separate, labelled 48 px button with aria-pressed.
  const markers = page.getByRole('button', { name: 'Infection markers' });
  await expect(markers).toHaveAttribute('data-testid', 'infection-markers');
  await expect(markers).toHaveAttribute('aria-pressed', 'false');
  const box = await markers.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(48);
  expect(box!.height).toBeGreaterThanOrEqual(48);
  await markers.click();
  await expect(markers).toHaveAttribute('aria-pressed', 'true');
  // It does not take the overlay's place (SPEC §10.8 "separate toggles").
  await expect(film).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('overlay-none').click();
  await expect(markers).toHaveAttribute('aria-pressed', 'true');
  expect(await smallText(page, '[data-testid="lab-tray"]')).toEqual([]);
  await expectNoSeriousA11yViolations(page);
  await markers.click();
  await expect(markers).toHaveAttribute('aria-pressed', 'false');

  // Looking changed nothing in the world.
  expect(await workerHash(page)).toBe(before);
  expect(errors).toEqual([]);
});
