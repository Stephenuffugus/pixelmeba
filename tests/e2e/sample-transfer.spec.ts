/**
 * P3.5 Sample, Transfer and Clean water journey (W3-25; SPEC §10.5–10.6; D-0037), desktop:
 * Lab → Tools → Sample (Life, radius 3) → preview → Take → Run is refused while the sample is held →
 * Transfer → the dish runs. Cancel path: the worker's own 'hash' reply before Begin equals the one after
 * Cancel. Clean water at 50 % on a salt patch halves its salinity (read from the worker's own 'save'
 * reply). Axe clean with the tray and the sample panel open. The app has no test hook: an init script
 * records the page's Worker and speaks the protocol (read-only requests only), as lab-tools.spec.ts does.
 */
import { expect, test, type Page } from '@playwright/test';
import { PROTOCOL_VERSION } from '../../src/worker/protocol';
import { expectNoSeriousA11yViolations, simSeconds, startGarden } from './helpers';

async function watchWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { Worker: typeof Worker; __pm: { workers: Worker[]; dishId: string | null; next: number } };
    const Orig = w.Worker;
    w.__pm = { workers: [], dishId: null, next: 1_000_000_000 };
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

/** Ask the worker a read-only question ('hash' or 'save') about the active dish. */
async function ask(page: Page, type: 'hash' | 'save'): Promise<{ hash: string; json?: string | undefined }> {
  return page.evaluate(
    async ({ protocolVersion, type }) => {
      const pm = (window as unknown as { __pm: { workers: Worker[]; dishId: string | null; next: number } }).__pm;
      const worker = pm.workers[pm.workers.length - 1];
      if (!worker || !pm.dishId) throw new Error('no worker or dish yet');
      const requestId = pm.next++;
      return new Promise<{ hash: string; json?: string | undefined }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no ${type} reply`)), 10_000);
        const on = (e: MessageEvent<{ type: string; requestId?: number; hash?: string; json?: string; message?: string }>) => {
          if (e.data?.requestId !== requestId) return;
          worker.removeEventListener('message', on);
          clearTimeout(timer);
          if ((e.data.type === 'hash' || e.data.type === 'saved') && e.data.hash) resolve({ hash: e.data.hash, json: e.data.json });
          else reject(new Error(e.data.message ?? e.data.type));
        };
        worker.addEventListener('message', on);
        worker.postMessage({ type, requestId, dishId: pm.dishId, protocolVersion });
      });
    },
    { protocolVersion: PROTOCOL_VERSION, type },
  );
}
const workerHash = async (page: Page) => (await ask(page, 'hash')).hash;

/** One field's value in one cell, decoded from the worker's own save of the dish. */
async function fieldAt(page: Page, field: string, x: number, y: number): Promise<number> {
  const { json } = await ask(page, 'save');
  return page.evaluate(
    ({ json, field, cell }) => {
      const state = JSON.parse(json!) as { fields: Record<string, { b64: string; length: number }> };
      const enc = state.fields[field]!;
      const bin = atob(enc.b64);
      const bytes = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
      return new Float64Array(bytes.buffer, 0, enc.length)[cell]!;
    },
    { json, field, cell: y * 128 + x },
  );
}

/** Screen point of dish cell centre (cx, cy) with the whole dish in view. */
async function at(page: Page, cx: number, cy: number): Promise<[number, number]> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  return [box.x + box.width / 2 + (cx - 64) * zoom, box.y + box.height / 2 + (cy - 64) * zoom];
}
async function tapDish(page: Page, cx: number, cy: number): Promise<void> {
  const [x, y] = await at(page, cx, cy);
  await page.mouse.click(x, y);
}
async function strokeDish(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const a = await at(page, ...from);
  const b = await at(page, ...to);
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  await page.mouse.move(b[0], b[1], { steps: 8 });
  await page.mouse.up();
}

async function openLab(page: Page): Promise<void> {
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('lab-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Whole dish' }).click();
}

async function pause(page: Page): Promise<void> {
  const run = page.getByTestId('run-toggle');
  if ((await run.getAttribute('aria-label')) === 'Pause') await run.click();
  await expect(run).toHaveAttribute('aria-label', 'Run');
}

/** Tools → Sample (Begin pauses the dish), mode and radius, then Use. */
async function beginSample(page: Page, mode: string): Promise<void> {
  await page.getByTestId('lab-cat-tools').click();
  await page.getByTestId('lab-item-sample').click();
  await expect(page.getByTestId('lab-item-sample')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await page.getByTestId(`sample-mode-${mode}`).click();
  await page.getByTestId('lab-radius-3').click();
  await expect(page.getByTestId('lab-details')).toContainText('Partners are never split');
  await page.getByTestId('lab-use').click();
  await expect(page.getByTestId('sample-panel')).toHaveAttribute('data-state', 'aim');
}

const SLOW = 420_000;

test('Sample (Life, r 3) → Take → Run refused while held → Transfer → the dish runs; Cancel restores the pre-begin hash', async ({ page }) => {
  test.setTimeout(SLOW);
  await watchWorker(page);
  await startGarden(page);
  await openLab(page);

  // Tools → Sample on the Busy Bloomers' sugar patch (48, 64).
  await beginSample(page, 'life');
  await expectNoSeriousA11yViolations(page);
  await tapDish(page, 48, 64);
  const panel = page.getByTestId('sample-panel');
  await expect(panel).toHaveAttribute('data-state', 'preview');
  await expect(page.getByTestId('sample-preview-line')).toContainText(/[1-9]\d* organisms?/);
  await expect(page.getByTestId('sample-take')).toBeEnabled();
  await expectNoSeriousA11yViolations(page);
  const held0 = await workerHash(page);
  await page.getByTestId('sample-take').click();
  await expect(panel).toHaveAttribute('data-state', 'held');
  await expect(page.getByTestId('sample-held-line')).toContainText(/organisms?/);
  expect(await workerHash(page)).not.toBe(held0);

  // Run is refused while the sample is held; time does not move.
  const t0 = await simSeconds(page);
  await page.getByTestId('run-toggle').click();
  await expect(page.locator('.toast')).toContainText('A sample is held — transfer, cancel or discard it first');
  await page.waitForTimeout(1200);
  expect(await simSeconds(page)).toBe(t0);
  await expectNoSeriousA11yViolations(page);

  // Transfer: tap where the sample's centre should go.
  await page.getByTestId('sample-transfer').click();
  await expect(panel).toHaveAttribute('data-state', 'transfer');
  await tapDish(page, 64, 100);
  await expect(page.locator('.toast')).toContainText('Sample moved.');
  await expect(page.getByTestId('sample-panel')).toBeHidden();

  // The dish runs again.
  await page.getByTestId('run-toggle').click();
  await expect.poll(async () => simSeconds(page), { timeout: 60_000 }).toBeGreaterThan(t0);
  await pause(page);

  // Cancel path: the hash before Begin equals the hash after Cancel.
  const before = await workerHash(page);
  await beginSample(page, 'all');
  await tapDish(page, 64, 100);
  await expect(panel).toHaveAttribute('data-state', 'preview');
  await page.getByTestId('sample-take').click();
  await expect(panel).toHaveAttribute('data-state', 'held');
  expect(await workerHash(page)).not.toBe(before);
  await page.getByTestId('sample-cancel').click();
  await expect(page.locator('.toast')).toContainText('Sample cancelled');
  await expect(page.getByTestId('sample-panel')).toBeHidden();
  expect(await workerHash(page)).toBe(before);
});

test('Clean water at 50 % on a salt patch halves its salinity', async ({ page }) => {
  test.setTimeout(SLOW);
  await watchWorker(page);
  await startGarden(page);
  await openLab(page);
  await pause(page);

  // Chemistry → Salt, one stroke.
  await page.getByTestId('lab-cat-chemistry').click();
  await page.getByTestId('lab-item-material:SALT').click();
  await page.getByTestId('lab-use').click();
  await strokeDish(page, [94, 56], [98, 56]);
  await expect.poll(async () => fieldAt(page, 'salt', 96, 56)).toBeGreaterThan(0);
  const salt = await fieldAt(page, 'salt', 96, 56);

  // Tools → Clean water, 50 %, the same stroke.
  await page.getByTestId('lab-cat-tools').click();
  await page.getByTestId('lab-item-cleanWater').click();
  await page.getByTestId('clean-fraction-0.5').click();
  await expect(page.getByTestId('lab-details')).toContainText('Removes 50 %');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('lab-use').click();
  await strokeDish(page, [94, 56], [98, 56]);
  await expect(page.locator('.toast')).toContainText(/Clean water: 50 % of the water replaced on \d+ cells/);
  expect(await fieldAt(page, 'salt', 96, 56)).toBe(salt / 2);
});
