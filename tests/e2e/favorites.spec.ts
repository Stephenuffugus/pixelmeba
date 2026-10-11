/**
 * P4.1 Favorite families (UX §5.8, SPEC §12.6; D-0070): the player's journey.
 * Garden → run until a Sprinter has split → select a daughter → Follow this family ("Mango", Triangle) →
 * the slot shows the count, tap = Find selects the representative → Save, reload, Continue: the slot and
 * nickname are back → "Export living dish file": no nickname unless "Include family nicknames" → the
 * worker's state hash is unchanged by Follow and Find → no serious axe violations on the Follow panel,
 * the Family sheet and the Notebook's Favorites tab.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { realizeRecipe } from '../../src/sim/recipes';
import { buildSaveFile } from '../../src/persistence/saveFile';
import { emptyNotebook, NOTEBOOK_DROPPED_TEXT } from '../../src/persistence/notebook';
import { loadRegistryFs, REPO_ROOT } from '../../tools/lib/content-fs';
import { ENT_STRIDE, E_SPECIES, E_X, E_Y, ID_STRIDE, PROTOCOL_VERSION } from '../../src/worker/protocol';
import { chooseSpeed, expectNoSeriousA11yViolations, expectReachable, seedSettings, startGarden } from './helpers';

interface Pm {
  workers: Worker[];
  dishId: string | null;
  next: number;
  speciesIds: string[];
  ents: number[];
  ids: number[];
  count: number;
}

/** Record the app's worker, its dish id, species and the latest snapshot's organisms (birth ids and positions). */
async function watchWorker(page: Page): Promise<void> {
  await page.addInitScript(
    ({ stride, idStride }) => {
      const w = window as unknown as { Worker: typeof Worker; __pm: Pm };
      const Orig = w.Worker;
      w.__pm = { workers: [], dishId: null, next: 1_500_000_000, speciesIds: [], ents: [], ids: [], count: 0 };
      w.Worker = class extends Orig {
        constructor(url: string | URL, opts?: WorkerOptions) {
          super(url, opts);
          w.__pm.workers.push(this);
          this.addEventListener(
            'message',
            (
              e: MessageEvent<{
                type?: string;
                info?: { dishId: string; speciesIds: string[] };
                ents?: Float32Array;
                ids?: Uint32Array;
                count?: number;
              }>,
            ) => {
              const d = e.data;
              if ((d?.type === 'ready' || d?.type === 'loaded') && d.info) {
                w.__pm.dishId = d.info.dishId;
                w.__pm.speciesIds = [...d.info.speciesIds];
              }
              if (d?.type === 'snapshot' && d.ents && d.ids && typeof d.count === 'number') {
                w.__pm.ents = Array.from(d.ents.subarray(0, d.count * stride));
                w.__pm.ids = Array.from(d.ids.subarray(0, d.count * idStride));
                w.__pm.count = d.count;
              }
            },
          );
        }
      };
    },
    { stride: ENT_STRIDE, idStride: ID_STRIDE },
  );
}

/** Ask the worker something with the protocol (read-only requests only). */
async function ask<T>(page: Page, msg: Record<string, unknown>): Promise<T> {
  return page.evaluate(
    async ({ msg, protocolVersion }) => {
      const pm = (window as unknown as { __pm: Pm }).__pm;
      const worker = pm.workers[pm.workers.length - 1];
      if (!worker || !pm.dishId) throw new Error('no worker or dish yet');
      const requestId = pm.next++;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no reply')), 10_000);
        const on = (e: MessageEvent<{ type: string; requestId?: number; message?: string }>) => {
          if (e.data?.requestId !== requestId) return;
          worker.removeEventListener('message', on);
          clearTimeout(timer);
          if (e.data.type === 'error') reject(new Error(e.data.message ?? 'error'));
          else resolve(e.data as T);
        };
        worker.addEventListener('message', on);
        worker.postMessage({ ...msg, requestId, dishId: pm.dishId, protocolVersion });
      });
    },
    { msg, protocolVersion: PROTOCOL_VERSION },
  );
}

async function workerHash(page: Page): Promise<string> {
  return (await ask<{ hash: string }>(page, { type: 'hash' })).hash;
}

/** Living Sprinters in the latest snapshot whose recorded parent is set (born here by a split). */
async function splitSprinters(page: Page): Promise<{ birthId: number; x: number; y: number }[]> {
  const pm = await page.evaluate(() => {
    const p = (window as unknown as { __pm: Pm }).__pm;
    return { ents: p.ents, ids: p.ids, count: p.count, speciesIds: p.speciesIds };
  });
  const sp = pm.speciesIds.indexOf('B01');
  const out: { birthId: number; x: number; y: number }[] = [];
  for (let k = 0; k < pm.count; k++) {
    if (pm.ents[k * ENT_STRIDE + E_SPECIES] !== sp) continue;
    // Founders are birth ids 1…56 in the Garden; any later Sprinter was born by a split.
    const b = pm.ids[k * ID_STRIDE]!;
    if (b > 56) out.push({ birthId: b, x: pm.ents[k * ENT_STRIDE + E_X]!, y: pm.ents[k * ENT_STRIDE + E_Y]! });
  }
  return out;
}

/** Tap the dish at a position (cells) at the whole-dish zoom and choose organism #birthId; true when it was selected. */
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

test('favorite family: follow, find, keep across save and reload, export by choice, never touches the dish', async ({ page }) => {
  test.setTimeout(240_000);
  await watchWorker(page);
  await startGarden(page);
  // Run until a Sprinter has split (the first Sprinter split is at 0:35 in the Garden), then pause.
  await page.getByTestId('run-toggle').click();
  await chooseSpeed(page, 4);
  await expect.poll(async () => (await splitSprinters(page)).length, { timeout: 120_000 }).toBeGreaterThan(0);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');

  let chosen: number | null = null;
  for (const s of await splitSprinters(page)) {
    if (await selectById(page, s.birthId, s.x, s.y)) {
      chosen = s.birthId;
      break;
    }
    if (await page.getByTestId('inspector').isVisible()) await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click();
  }
  expect(chosen).not.toBeNull();
  const before = await workerHash(page);

  // Follow this family: nickname "Mango", Triangle.
  const follow = page.getByTestId('follow-family');
  await follow.scrollIntoViewIfNeeded();
  await expectReachable(follow);
  await follow.click();
  const panel = page.getByTestId('favorite-follow');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Nicknames stay on this device unless you choose to share them.');
  await page.getByTestId('favorite-nickname').fill('Mango');
  await panel.getByRole('radio', { name: 'Triangle' }).check();
  await expect(panel.getByRole('radio', { name: 'Triangle' })).toBeChecked();
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('favorite-confirm').click();
  await expect(panel).toHaveCount(0);

  // The slot shows the family's living member count; its name is in the accessible name.
  const slot = page.getByTestId('favorite-slot-fav-1');
  await expect(slot).toBeVisible();
  await expect(slot).toHaveAccessibleName(/^Find the Mango family: \d+ members?$/);
  const count = Number(await slot.getByTestId('favorite-count').innerText());
  expect(count).toBeGreaterThanOrEqual(1);
  await expectReachable(slot);
  expect(await workerHash(page)).toBe(before);

  // Tap = Find: selects the representative (the organism followed).
  await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('inspector')).toHaveCount(0);
  await slot.click();
  await expect(page.getByTestId('inspector').getByRole('heading', { level: 2 })).toContainText(`#${chosen}`);
  expect(await workerHash(page)).toBe(before);

  // The Family sheet (from the inspector's "Following the Mango family").
  await page.getByTestId('follow-family').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('follow-family')).toHaveText('Following the Mango family');
  await page.getByTestId('follow-family').click();
  const sheet = page.getByTestId('favorite-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { level: 2 })).toContainText('Mango');
  await expect(sheet).toContainText('Confirmed inherited differences');
  await expect(sheet.getByText('Its own inheritance')).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await sheet.getByRole('button', { name: 'Close' }).click();
  expect(await workerHash(page)).toBe(before);

  // Save, reload, Continue: the slot and nickname are back.
  await page.getByTestId('more').click();
  await page.getByTestId('more-save').click();
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-confirm')).toHaveCount(0);
  await page.reload();
  await page.getByTestId('home-continue').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('favorite-slot-fav-1')).toHaveAccessibleName(/^Find the Mango family: \d+ members?$/);

  // Export living dish file: no nickname unless "Include family nicknames".
  const exported = async (withNicknames: boolean) => {
    if (!(await page.getByTestId('more-export').isVisible())) await page.getByTestId('more').click();
    const box = page.getByTestId('more-include-nicknames');
    if ((await box.isChecked()) !== withNicknames) await box.click();
    await expect(box).toBeChecked({ checked: withNicknames });
    const download = page.waitForEvent('download');
    await page.getByTestId('more-export').click();
    const file = JSON.parse(readFileSync((await (await download).path()), 'utf8')) as { notebook?: { favorites: { nickname: string | null }[] } };
    return file.notebook!.favorites[0]!.nickname;
  };
  expect(await exported(false)).toBeNull();
  expect(await exported(true)).toBe('Mango');
  await page.getByTestId('more').click();
  await expect(page.getByTestId('more-export')).toHaveCount(0);

  // Notebook → Favorites lists the followed family.
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-favorites').click();
  await expect(page.getByTestId('notebook-tab-favorites')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('favorites-list')).toContainText('Mango');
  await expect(page.getByTestId('favorite-state').first()).toHaveText('Following');
  await expectNoSeriousA11yViolations(page);
});

// Fix round 1: a damaged notebook is dropped with a message the player sees (D-0070 "dropped with a
// message"), even though the load answer arrives before the dish is open and the "Opened" toast follows.
test('a dish file whose notebook is damaged opens, and says the notebook was left out', async ({ page }) => {
  test.setTimeout(120_000);
  const reg = loadRegistryFs();
  const w = realizeRecipe(reg, 'FIRST_DISH_V1', { worldId: 'favorites-dropped-e2e' });
  const c = w.ents.cols;
  let b = 0;
  for (let i = 0; i < w.ents.highWater && b === 0; i++) if (c.alive[i] === 1) b = c.birthId[i]!;
  const notebook = { ...emptyNotebook(w.worldId), nextFavorite: 2, favorites: [{ id: 'fav-1', rootBirthId: b, speciesId: w.species[c.species[0]!]!.id, nickname: 'Mango', pattern: 'circle' as const, representative: b, active: true, createdTick: 0, members: [[b, 0] as const], historyIncomplete: false, extinct: null }] };
  const { text } = await buildSaveFile(w, { name: 'Damaged notebook', savedAt: '2026-10-11T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' }, { notebook, includeNicknames: true });
  const file = JSON.parse(text) as { notebook: { checksum: string } };
  file.notebook.checksum = `sha256:${'0'.repeat(64)}`;
  const dir = join(REPO_ROOT, 'tmp', 'e2e-favorites');
  const path = join(dir, `damaged-notebook-${process.pid}.pixelmeba`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(file));
  try {
    await seedSettings(page, { showPrompts: false });
    await page.goto('/');
    await page.getByRole('button', { name: 'Saved dishes' }).click();
    await page.locator('input[aria-label="Import a dish file"]').setInputFiles(path);
    await expect(page.getByTestId('dish-screen')).toBeVisible();
    await expect(page.locator('.toast')).toContainText(NOTEBOOK_DROPPED_TEXT);
    await expect(page.getByTestId('favorite-slot-fav-1')).toHaveCount(0);
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByTestId('home-notebook').click();
    await page.getByTestId('notebook-tab-favorites').click();
    await expect(page.getByTestId('favorites-dropped')).toHaveText(NOTEBOOK_DROPPED_TEXT);
    await expectNoSeriousA11yViolations(page);
  } finally {
    rmSync(path, { force: true });
  }
});
