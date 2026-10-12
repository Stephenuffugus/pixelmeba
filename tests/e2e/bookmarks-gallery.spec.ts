/**
 * P4.8b bookmarks, the specimen gallery and the storage panel: the player's journey (SPEC §12.8; UX §2;
 * CT §12.10; D02 §20 "Practical storage"; D-0082, D-0084).
 *
 * Garden → run 10 s → More → Bookmark this moment with a snapshot (the dish's worker hash recorded) → select a
 * Sprinter → Save to gallery (the hash unchanged) → Notebook: Bookmarks shows the entry, Gallery the picture and
 * the inspector lines → Open the snapshot bookmark: a branch opens at the bookmarked time with the hash recorded
 * at bookmarking → Saved dishes → Storage lists the snapshot and removes it after its confirmation → the
 * original dish (kept first into Slot 1) shows its bookmark as "Text only — not replayable". No serious axe
 * violations on both Notebook tabs and the Storage panel.
 */
import { expect, test, type Page } from '@playwright/test';
import { ENT_STRIDE, E_SPECIES, E_X, E_Y, ID_STRIDE, PROTOCOL_VERSION } from '../../src/worker/protocol';
import { chooseSpeed, expectNoSeriousA11yViolations, expectReachable, simSeconds, startGarden } from './helpers';

interface Pm {
  workers: Worker[];
  dishId: string | null;
  next: number;
  speciesIds: string[];
  ents: number[];
  ids: number[];
  count: number;
}

/** Record the app's worker, its open dish id, species and the latest snapshot's organisms. */
async function watchWorker(page: Page): Promise<void> {
  await page.addInitScript(
    ({ stride, idStride }) => {
      const w = window as unknown as { Worker: typeof Worker; __pm: Pm };
      const Orig = w.Worker;
      w.__pm = { workers: [], dishId: null, next: 1_700_000_000, speciesIds: [], ents: [], ids: [], count: 0 };
      w.Worker = class extends Orig {
        constructor(url: string | URL, opts?: WorkerOptions) {
          super(url, opts);
          w.__pm.workers.push(this);
          this.addEventListener('message', (e: MessageEvent<{ type?: string; dishId?: string; info?: { dishId: string; speciesIds: string[] }; ents?: Float32Array; ids?: Uint32Array; count?: number }>) => {
            const d = e.data;
            if ((d?.type === 'ready' || d?.type === 'loaded' || d?.type === 'tryStarted') && d.info) {
              w.__pm.dishId = d.info.dishId;
              w.__pm.speciesIds = [...d.info.speciesIds];
            }
            if (d?.type === 'snapshot' && d.dishId === w.__pm.dishId && d.ents && d.ids && typeof d.count === 'number') {
              w.__pm.ents = Array.from(d.ents.subarray(0, d.count * stride));
              w.__pm.ids = Array.from(d.ids.subarray(0, d.count * idStride));
              w.__pm.count = d.count;
            }
          });
        }
      };
    },
    { stride: ENT_STRIDE, idStride: ID_STRIDE },
  );
}

/** The open dish's state hash (the protocol's read-only 'hash' request). */
async function workerHash(page: Page): Promise<{ hash: string; tick: number }> {
  return page.evaluate(async (protocolVersion) => {
    const pm = (window as unknown as { __pm: Pm }).__pm;
    const worker = pm.workers[pm.workers.length - 1];
    if (!worker || !pm.dishId) throw new Error('no worker or dish yet');
    const requestId = pm.next++;
    return new Promise<{ hash: string; tick: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no hash reply')), 10_000);
      const on = (e: MessageEvent<{ type: string; requestId?: number; hash?: string; tick?: number; message?: string }>) => {
        if (e.data?.requestId !== requestId) return;
        worker.removeEventListener('message', on);
        clearTimeout(timer);
        if (e.data.type === 'hash' && e.data.hash) resolve({ hash: e.data.hash, tick: e.data.tick ?? -1 });
        else reject(new Error(e.data.message ?? e.data.type));
      };
      worker.addEventListener('message', on);
      worker.postMessage({ type: 'hash', requestId, dishId: pm.dishId, protocolVersion });
    });
  }, PROTOCOL_VERSION);
}

/** Living Sprinters in the latest snapshot. */
async function sprinters(page: Page): Promise<{ birthId: number; x: number; y: number }[]> {
  const pm = await page.evaluate(() => {
    const p = (window as unknown as { __pm: Pm }).__pm;
    return { ents: p.ents, ids: p.ids, count: p.count, speciesIds: p.speciesIds };
  });
  const sp = pm.speciesIds.indexOf('B01');
  const out: { birthId: number; x: number; y: number }[] = [];
  for (let k = 0; k < pm.count; k++) if (pm.ents[k * ENT_STRIDE + E_SPECIES] === sp) out.push({ birthId: pm.ids[k * ID_STRIDE]!, x: pm.ents[k * ENT_STRIDE + E_X]!, y: pm.ents[k * ENT_STRIDE + E_Y]! });
  return out;
}

/** Tap the dish at a position (cells) at the whole-dish zoom and choose organism #birthId; true when selected. */
async function selectById(page: Page, birthId: number, x: number, y: number): Promise<boolean> {
  await page.getByRole('button', { name: 'Whole dish' }).click();
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  await page.mouse.click(box.x + box.width / 2 + (x - 64) * zoom, box.y + box.height / 2 + (y - 64) * zoom);
  const heading = page.getByTestId('inspector').getByRole('heading', { level: 2 });
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  await expect(list.or(heading)).toBeVisible();
  if (await list.isVisible()) {
    const opt = list.getByRole('option', { name: new RegExp(`#${birthId}$`) });
    if ((await opt.count()) === 0) {
      await page.getByRole('button', { name: 'Cancel' }).click();
      return false;
    }
    await opt.click();
  }
  await expect(heading).toBeVisible();
  return (await heading.innerText()).includes(`#${birthId}`);
}

async function goHome(page: Page): Promise<void> {
  if (await page.getByTestId('dish-screen').isVisible()) await page.getByRole('button', { name: 'Home' }).click();
  else await page.getByRole('button', { name: /^Back/ }).first().click();
  await expect(page.getByTestId('home-play')).toBeVisible();
}

test('bookmarks and the gallery: bookmark with a snapshot, save a specimen, open the moment as a branch, remove the snapshot in Storage', async ({ page }) => {
  test.setTimeout(300_000);
  await watchWorker(page);
  await startGarden(page);

  // Run 10 dish seconds, then pause.
  await page.getByTestId('run-toggle').click();
  await chooseSpeed(page, 2);
  await expect.poll(() => simSeconds(page), { timeout: 60_000 }).toBeGreaterThanOrEqual(10);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const at = await workerHash(page);
  const atTime = (await page.getByTestId('sim-time').innerText()).split(' · ')[0]!;

  // More → Bookmark this moment, with a snapshot.
  await page.getByTestId('more').click();
  await page.getByTestId('bookmark-now').click();
  const sheet = page.getByTestId('bookmark-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('bookmark-title')).toHaveValue(`Little Living Garden at ${atTime}`);
  await expect(page.getByTestId('bookmark-snapshot')).not.toBeChecked();
  await page.getByTestId('bookmark-snapshot').check();
  await expectReachable(page.getByTestId('bookmark-save'));
  await page.getByTestId('bookmark-save').click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Bookmarked with a snapshot.');
  expect(await workerHash(page)).toEqual(at);

  // Select a Sprinter → Save to gallery.
  let chosen: number | null = null;
  for (const s of await sprinters(page)) {
    if (await selectById(page, s.birthId, s.x, s.y)) {
      chosen = s.birthId;
      break;
    }
    if (await page.getByTestId('inspector').isVisible()) await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click();
  }
  expect(chosen).not.toBeNull();
  const save = page.getByTestId('gallery-save');
  await save.scrollIntoViewIfNeeded();
  await expectReachable(save);
  await save.click();
  await expect(page.locator('.toast')).toContainText('Saved to the gallery.');
  expect(await workerHash(page)).toEqual(at); // nothing changed in the dish

  // Notebook → Bookmarks and Gallery.
  await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click();
  await goHome(page);
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-bookmarks').click();
  const row = page.getByTestId('bookmark-row');
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('heading', { level: 2 })).toHaveText(`Little Living Garden at ${atTime}`);
  await expect(row.getByTestId('bookmark-summary')).toContainText(`At ${atTime}: `);
  await expect(row.getByTestId('bookmark-snapshot')).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('notebook-tab-gallery').click();
  const entry = page.getByTestId('gallery-entry');
  await expect(entry).toHaveCount(1);
  await expect(entry.getByRole('heading', { level: 2 })).toContainText(`Sprinter #${chosen}`);
  await expect(entry.getByTestId('gallery-summary')).toContainText(`Sprinter #${chosen}`);
  await expect(entry.getByTestId('gallery-picture')).toBeVisible();
  // The picture was drawn (not a blank canvas).
  await expect
    .poll(() => entry.getByTestId('gallery-picture').evaluate((c: HTMLCanvasElement) => c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 !== 3 && v > 40)))
    .toBe(true);
  await expectNoSeriousA11yViolations(page);

  // Open the snapshot bookmark: a new branch at the bookmarked time, the same state hash.
  await page.getByTestId('notebook-tab-bookmarks').click();
  await page.getByTestId('bookmark-open').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Opened the bookmark as a new branch');
  await expect(page.getByTestId('sim-time')).toContainText(atTime);
  expect(await workerHash(page)).toEqual(at);

  // Saved dishes → Storage: the snapshot is listed and removed after its confirmation.
  await goHome(page);
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.getByTestId('saves-storage').click();
  const panel = page.getByTestId('storage-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('storage-usage')).toBeVisible();
  const snap = panel.locator('[data-testid="storage-row"][data-kind="snapshot"]');
  await expect(snap).toHaveCount(1);
  await expect(panel.locator('[data-testid="storage-row"][data-kind="slot"]').first()).toBeVisible(); // the original, kept first
  await expect(panel.locator('[data-testid="storage-row"][data-kind="slot"] [data-testid="storage-remove"]')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  await snap.getByTestId('storage-remove').click();
  await expect(snap.getByTestId('storage-confirm-text')).toHaveText('Remove this snapshot? The bookmark text stays in its dish.');
  await expect(panel.locator('[data-testid="storage-row"][data-kind="snapshot"]')).toHaveCount(1); // asking removed nothing
  await expectReachable(snap.getByTestId('storage-remove-confirm'));
  await snap.getByTestId('storage-remove-confirm').click();
  await expect(panel.locator('[data-testid="storage-row"][data-kind="snapshot"]')).toHaveCount(0);
  await expect(panel.getByTestId('storage-message')).toHaveText('Removed. Nothing else changed.');
  await expectNoSeriousA11yViolations(page);

  // The original dish (kept first into Slot 1): its bookmark is now text only.
  const slot1 = page.locator('li[data-slot="slot1"]:not([data-testid="storage-row"])');
  await expect(slot1).toContainText('Little Living Garden');
  await slot1.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await goHome(page);
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-bookmarks').click();
  await expect(page.getByTestId('bookmark-row')).toHaveCount(1);
  await expect(page.getByTestId('bookmark-text-only')).toHaveText('Text only — not replayable');
  await expect(page.getByTestId('bookmark-row')).toContainText('Its snapshot was removed or could not be read. The bookmark text is kept.');
  await expect(page.getByTestId('bookmark-open')).toHaveCount(0);
});
