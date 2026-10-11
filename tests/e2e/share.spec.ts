/**
 * P4.6 Share (SPEC §14.4; UX §5.10, §2; D09 lines 140-160; D-0080). The share sheet opens with three
 * labelled choices (BUILD_DIRECTIVE P4.6), the picture is a 1080 × 1080 PNG, a Living dish file imports
 * back as the same world (worker hash), the Garden's Starting recipe names its offline identifier, Import
 * recipe ID starts a bundled What if? idea paused, a bad identifier changes nothing, and opening and
 * cancelling the sheet never changes the world. Runs on desktop and phone-portrait.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PROTOCOL_VERSION } from '../../src/worker/protocol';
import {
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  expectReachable,
  seedSettings,
  simSeconds,
  startGarden,
} from './helpers';

/** Wrap Worker so the test can speak the protocol (tests/e2e/lab-tools.spec.ts). */
async function watchWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      Worker: typeof Worker;
      __pm: { workers: Worker[]; dishId: string | null; next: number; speed: number; tick: number };
    };
    const Orig = w.Worker;
    w.__pm = { workers: [], dishId: null, next: 1_000_000_000, speed: -1, tick: -1 };
    w.Worker = class extends Orig {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        w.__pm.workers.push(this);
        this.addEventListener(
          'message',
          (e: MessageEvent<{ type?: string; info?: { dishId: string }; dishId?: string; speed?: number; tick?: number }>) => {
            if ((e.data?.type === 'ready' || e.data?.type === 'loaded') && e.data.info)
              w.__pm.dishId = e.data.info.dishId;
            // The worker's own run state (its snapshots), not the UI's.
            if (e.data?.type === 'snapshot' && e.data.dishId === w.__pm.dishId) {
              if (typeof e.data.speed === 'number') w.__pm.speed = e.data.speed;
              if (typeof e.data.tick === 'number') w.__pm.tick = e.data.tick;
            }
          },
        );
      }
    };
  });
}

/** The active dish's state hash, by the protocol's read-only 'hash' request. */
async function workerHash(page: Page): Promise<{ hash: string; dishId: string }> {
  return page.evaluate(async (protocolVersion) => {
    const pm = (window as unknown as { __pm: { workers: Worker[]; dishId: string | null; next: number } })
      .__pm;
    const worker = pm.workers[pm.workers.length - 1];
    const dishId = pm.dishId;
    if (!worker || !dishId) throw new Error('no worker or dish yet');
    const requestId = pm.next++;
    return new Promise<{ hash: string; dishId: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no hash reply')), 10_000);
      const on = (e: MessageEvent<{ type: string; requestId?: number; hash?: string; message?: string }>) => {
        if (e.data?.requestId !== requestId) return;
        worker.removeEventListener('message', on);
        clearTimeout(timer);
        if (e.data.type === 'hash' && e.data.hash) resolve({ hash: e.data.hash, dishId });
        else reject(new Error(e.data.message ?? e.data.type));
      };
      worker.addEventListener('message', on);
      worker.postMessage({ type: 'hash', requestId, dishId, protocolVersion });
    });
  }, PROTOCOL_VERSION);
}

/** The open dish's speed and tick as the worker's latest snapshot gives them. */
async function workerRun(page: Page): Promise<{ speed: number; tick: number }> {
  return page.evaluate(() => {
    const pm = (window as unknown as { __pm: { speed: number; tick: number } }).__pm;
    return { speed: pm.speed, tick: pm.tick };
  });
}

/** Every text the always-mounted live region reads from now on (each change once). */
async function watchLiveRegion(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __live: string[]; __liveObs?: MutationObserver };
    w.__liveObs?.disconnect();
    w.__live = [];
    const region = document.querySelector('[data-testid="live-region"]')!;
    w.__liveObs = new MutationObserver(() => {
      const t = region.textContent ?? '';
      if (t !== '' && w.__live[w.__live.length - 1] !== t) w.__live.push(t);
    });
    w.__liveObs.observe(region, { subtree: true, childList: true, characterData: true });
  });
}

async function liveTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __live: string[] }).__live);
}

async function openShareSheet(page: Page): Promise<void> {
  await page.getByTestId('more').click();
  await page.getByTestId('more-share').click();
  await expect(page.getByTestId('share-sheet')).toBeVisible();
}

async function runFor(page: Page, seconds: number): Promise<void> {
  await page.getByTestId('run-toggle').click();
  await expect.poll(() => simSeconds(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(seconds);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
}

/** A PNG's width and height from its IHDR chunk, and its chunk types in order. */
function readPng(path: string): { width: number; height: number; chunks: string[] } {
  const b = readFileSync(path);
  expect([...b.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks: string[] = [];
  for (let o = 8; o < b.length;) {
    const len = b.readUInt32BE(o);
    chunks.push(b.subarray(o + 4, o + 8).toString('latin1'));
    o += 12 + len;
  }
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), chunks };
}

test('More → Share: three labelled choices; opening and cancelling changes nothing; Picture saves a 1080 × 1080 PNG', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await watchWorker(page);
  await startGarden(page);
  // A running dish is paused while the sheet is open, and runs again when it closes.
  await page.getByTestId('run-toggle').click();
  await expect.poll(() => simSeconds(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await openShareSheet(page);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const sheet = page.getByTestId('share-sheet');
  await expect(sheet.getByRole('radio')).toHaveCount(3);
  for (const [name, line] of [
    ['Picture', 'a snapshot image; does not contain the living dish'],
    ['Starting recipe', 'the setup and seed; others can start the same dish'],
    ['Living dish', 'the full save; continue this exact world on a compatible build'],
  ]) {
    await expect(sheet.getByRole('radio', { name: new RegExp(`^${name}`) })).toHaveAccessibleName(
      `${name} ${line}`,
    );
  }
  // Each choice is one ≥ 48 px target (UX §4.1), and the first is reachable on screen.
  await expectReachable(page.getByTestId('share-choice-picture'));
  const heights = await page.evaluate(() =>
    [...document.querySelectorAll('.share-choice')].map((el) => el.getBoundingClientRect().height),
  );
  expect(heights).toHaveLength(3);
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(48);
  await expect(sheet.getByRole('radio', { name: /^Picture/ })).toBeChecked();
  await expect(page.getByTestId('share-strip-metadata')).toBeChecked();
  await expect(page.getByTestId('share-picture-nicknames')).not.toBeChecked();
  await expect(page.getByTestId('share-question')).toHaveValue('Who finds something to eat?');
  await expect(page.getByTestId('share-picture-preview')).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('share-close').click();
  await expect(page.getByTestId('share-sheet')).toHaveCount(0);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');

  // Opening and cancelling the sheet (and choosing options) never changes the world.
  const h0 = await workerHash(page);
  await openShareSheet(page);
  await sheet.getByRole('radio', { name: /^Living dish/ }).check();
  await expect(page.getByTestId('share-living-line')).toContainText('Little Living Garden');
  await sheet.getByRole('radio', { name: /^Starting recipe/ }).check();
  await expect(page.getByTestId('share-recipe-identity')).toHaveText(
    'FIRST_DISH_V1 / revision 1 / seed 104729',
  );
  await page.getByTestId('share-close').click();
  expect(await workerHash(page)).toEqual(h0);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');

  // Picture → Share: the browser has no file share here, so the PNG is saved.
  await openShareSheet(page);
  await page.getByTestId('share-hide-labels').check();
  await page.getByTestId('share-hide-labels').uncheck();
  const download = page.waitForEvent('download');
  await page.getByTestId('share-go').click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('pixelmeba-picture.png');
  const png = readPng(await d.path());
  expect([png.width, png.height]).toEqual([1080, 1080]);
  // No text chunks and no device metadata.
  expect(png.chunks.filter((c) => ['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME'].includes(c))).toEqual([]);
  await expect(page.getByTestId('share-status')).toHaveText('Saved pixelmeba-picture.png.');
  expect(await workerHash(page)).toEqual(h0);
});

test('Starting recipe and Living dish files: the living dish imports back as the same world, the recipe as its start', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await watchWorker(page);
  await startGarden(page);
  await runFor(page, 2);
  await openShareSheet(page);
  const sheet = page.getByTestId('share-sheet');

  // Starting recipe: the Garden's offline identifier and the versions it needs.
  await sheet.getByRole('radio', { name: /^Starting recipe/ }).check();
  await expect(page.getByTestId('share-recipe-identity')).toHaveText(
    'FIRST_DISH_V1 / revision 1 / seed 104729',
  );
  // The build's own versions (read from the manifest, so a legitimate version bump needs no edit here).
  const v = JSON.parse(readFileSync('content/manifest.json', 'utf8')) as {
    simulationVersion: number;
    evolutionRulesVersion: number;
    contentVersion: number;
  };
  await expect(page.getByTestId('share-recipe-versions')).toHaveText(
    `Needs simulation ${v.simulationVersion}, rules ${v.evolutionRulesVersion}, content ${v.contentVersion}.`,
  );
  await expectReachable(page.getByTestId('share-copy-recipe'));
  await expectNoSeriousA11yViolations(page);
  let download = page.waitForEvent('download');
  await page.getByTestId('share-go').click();
  let d = await download;
  expect(d.suggestedFilename()).toBe('little-living-garden-recipe.pixelmeba');
  const recipePath = await d.path();
  const recipe = JSON.parse(readFileSync(recipePath, 'utf8')) as {
    format: string;
    initialStateHash: string;
    source: { recipeId: string; seed: number };
  };
  expect(recipe.format).toBe('pixelmeba-recipe');
  expect(recipe.source).toMatchObject({ recipeId: 'FIRST_DISH_V1', seed: 104729 });

  // Living dish: the full save at this paused tick.
  await sheet.getByRole('radio', { name: /^Living dish/ }).check();
  await expect(sheet.getByText('The file includes world names and notes.')).toBeVisible();
  await expect(page.getByTestId('share-strip-names')).not.toBeChecked();
  await expect(page.getByTestId('share-living-line')).toContainText(
    /^“Little Living Garden” at \d+:\d\d dish time · [\d.]+ (KB|MB)$/,
  );
  await expectNoSeriousA11yViolations(page);
  const before = await workerHash(page);
  download = page.waitForEvent('download');
  await page.getByTestId('share-go').click();
  d = await download;
  expect(d.suggestedFilename()).toBe('little-living-garden.pixelmeba');
  const livingPath = await d.path();
  expect(await workerHash(page)).toEqual(before);
  await page.getByTestId('share-close').click();

  // Import it back (Saved dishes → Choose a file…): the same world, a new dish.
  await page.getByTestId('more').click();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.locator('input[aria-label="Import a dish file"]').setInputFiles(livingPath);
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Imported “Little Living Garden” — paused.');
  const after = await workerHash(page);
  expect(after.dishId).not.toBe(before.dishId);
  expect(after.hash).toBe(before.hash);

  // The recipe file opens as its start (tick 0), realized by this build.
  await page.getByTestId('more').click();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.locator('input[aria-label="Import a dish file"]').setInputFiles(recipePath);
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('0:00 · 56 alive');
  const start = await workerHash(page);
  expect(start.dishId).not.toBe(after.dishId);
  expect(start.hash).toBe(recipe.initialStateHash);
});

test('Import recipe ID on Play: a bad ID refuses and changes nothing; R-G3 starts Dinner farther away, paused', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await watchWorker(page);
  await startGarden(page);
  await runFor(page, 1);
  const open = await workerHash(page);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('home-play').click();
  const panel = page.getByTestId('recipe-id-import');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Import recipe ID' })).toBeVisible();
  await expectReachable(page.getByTestId('recipe-id-input'));
  await expectReachable(page.getByTestId('recipe-id-start'));

  // A revision this build does not have: refused with the identifier, nothing opened or changed.
  await page.getByTestId('recipe-id-input').fill('R-G3 / revision 2 / seed 104729');
  await page.getByTestId('recipe-id-start').click();
  await expect(page.getByTestId('recipe-id-message')).toHaveText(
    'This recipe needs a compatible build (R-G3 / revision 2 / seed 104729).',
  );
  await expect(page.getByTestId('dish-screen')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('recipe-id-input').fill('R-G3 / revision 1 / seed 5');
  await page.getByTestId('recipe-id-start').click();
  await expect(page.getByTestId('recipe-id-message')).toHaveText('R-G3 revision 1 starts from seed 104729.');
  expect(await workerHash(page)).toEqual(open);
  await expectNoHorizontalOverflow(page);

  // The bundled What if? idea: a new dish, paused at its start.
  await page.getByTestId('recipe-id-input').fill('R‑G3 / rev 1 / seed 104729');
  await page.getByTestId('recipe-id-start').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.locator('.topbar .title strong')).toHaveText('Dinner farther away');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expect(page.getByTestId('sim-time')).toContainText('0:00');
  const started = await workerHash(page);
  expect(started.dishId).not.toBe(open.dishId);

  // The same entry in Saved dishes.
  await page.getByTestId('more').click();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await expect(page.getByTestId('recipe-id-import')).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('Import recipe ID in Saved dishes with no dish open: unparseable text is refused; the Garden ID starts the Garden', async ({
  page,
}) => {
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.getByTestId('recipe-id-input').fill('nonsense');
  await page.getByTestId('recipe-id-start').click();
  await expect(page.getByTestId('recipe-id-message')).toHaveText(
    'That is not a recipe ID. A recipe ID looks like “R-G3 / revision 1 / seed 104729”.',
  );
  await page.getByTestId('recipe-id-input').fill('FIRST_DISH_V1 / revision 1 / seed 104729');
  await page.getByTestId('recipe-id-start').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('0:00 · 56 alive');
});

test('The Share sheet blocks every dish key behind it (Space, 1/2/4, ".", U); Esc closes it and the prior speed returns', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await watchWorker(page);
  await startGarden(page);
  // Running at 2× (a key) before the sheet opens.
  await page.getByTestId('run-toggle').click();
  await page.keyboard.press('2');
  await expect.poll(async () => (await workerRun(page)).speed, { timeout: 30_000 }).toBe(2);
  await openShareSheet(page);
  await expect.poll(async () => (await workerRun(page)).speed, { timeout: 30_000 }).toBe(0);
  await expect(page.getByRole('heading', { name: 'Share' })).toBeFocused();
  const paused = await workerRun(page);
  const shown = await simSeconds(page);
  for (const key of [' ', '1', '2', '4', '.', 'u', 'U', ' ']) await page.keyboard.press(key === ' ' ? 'Space' : key);
  await page.waitForTimeout(1500);
  expect(await workerRun(page)).toEqual(paused); // the worker never ran, stepped or changed speed
  expect(await simSeconds(page)).toBe(shown);
  await expect(page.getByTestId('share-sheet')).toBeVisible();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  // The sheet's own field still takes those keys (nothing is prevented there).
  await page.getByTestId('share-question').fill('');
  await page.getByTestId('share-question').pressSequentially('1 2.4');
  await expect(page.getByTestId('share-question')).toHaveValue('1 2.4');
  await page.waitForTimeout(500);
  expect(await workerRun(page)).toEqual(paused);
  // Esc = Close: the dish runs again at its prior speed (2×).
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('share-sheet')).toHaveCount(0);
  await expect.poll(async () => (await workerRun(page)).speed, { timeout: 30_000 }).toBe(2);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expect.poll(async () => (await workerRun(page)).tick, { timeout: 30_000 }).toBeGreaterThan(paused.tick);
});

test('A refused import (a save file or a recipe file, from Saved dishes or More) is one toast: "Import failed: {reason}. Nothing changed."', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await watchWorker(page);
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  const input = page.locator('input[aria-label="Import a dish file"]');
  const broken = { name: 'broken.pixelmeba', mimeType: 'application/json', buffer: Buffer.from('not a dish') };
  const badRecipe = {
    name: 'bad-recipe.pixelmeba',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"pixelmeba-recipe","checksum":"sha256:00"}'),
  };
  const SAVE = 'Import failed: This is not a Pixelmeba file (it is not valid JSON). Nothing changed.';
  const RECIPE = 'Import failed: This recipe file is damaged or incomplete (file version). Nothing changed.';

  // Saved dishes with no dish open (the page toast).
  await watchLiveRegion(page);
  await input.setInputFiles(broken);
  await expect(page.getByTestId('page-toast')).toHaveText(SAVE);
  await page.waitForTimeout(1000);
  expect(await liveTexts(page)).toEqual([SAVE]); // read once; no second toast
  await watchLiveRegion(page);
  await input.setInputFiles(badRecipe);
  await expect(page.getByTestId('page-toast')).toHaveText(RECIPE);
  await page.waitForTimeout(1000);
  expect(await liveTexts(page)).toEqual([RECIPE]);
  await expect(page.getByRole('heading', { name: 'Saved dishes' })).toBeVisible();

  // More on the open dish (the dish screen's toast): the dish stays, unchanged.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByTestId('home-play').click();
  await page.getByTestId('start-garden').click();
  await expect(page.getByTestId('sim-time')).toContainText('56 alive');
  const before = await workerHash(page);
  for (const [file, expected] of [
    [broken, SAVE],
    [badRecipe, RECIPE],
  ] as const) {
    await watchLiveRegion(page);
    await page.getByTestId('more').click();
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.locator('.dish-screen .toast')).toHaveText(expected);
    await page.waitForTimeout(1000);
    expect(await liveTexts(page)).toEqual([expected]); // read once; no second toast
    expect(await workerHash(page)).toEqual(before);
    if (await page.locator('section[aria-labelledby="more-title"]').count()) await page.keyboard.press('Escape');
    await expect(page.locator('section[aria-labelledby="more-title"]')).toHaveCount(0);
  }
});
