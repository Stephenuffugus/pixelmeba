/**
 * P2.7 Lab view journey: switch to Lab, paint gel, place and erase a wall, pick an overlay and change
 * its opacity, switch back. The state hash is read from the worker itself through the protocol's
 * read-only 'hash' request (an init script records the page's Worker; the app has no test hook), and
 * proves the view switches — including one made mid-stroke — change nothing, while each edit does.
 */
import { expect, test, type Page } from '@playwright/test';
import { PROTOCOL_VERSION } from '../../src/worker/protocol';
import {
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  expectReachable,
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

/** The active dish's state hash, asked of the worker with the protocol's read-only 'hash' request. */
async function workerHash(page: Page): Promise<string> {
  return page.evaluate(async (protocolVersion) => {
    const pm = (window as unknown as { __pm: { workers: Worker[]; dishId: string | null; next: number } })
      .__pm;
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

/** One mouse stroke across the dish; `during` runs while the button is still down. */
async function stroke(
  page: Page,
  from: [number, number],
  to: [number, number],
  during?: () => Promise<void>,
): Promise<void> {
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
  if (during) await during();
  await page.mouse.up();
}

async function openLab(page: Page): Promise<void> {
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('view-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lab-bar')).toBeVisible();
  await expect(page.getByTestId('action-look')).toBeHidden();
  await page.getByRole('button', { name: 'Whole dish' }).click();
}

/** Pick a tray item, see its details, and close the tray with "Use on the dish". */
async function pickTool(page: Page, category: string, item: string): Promise<void> {
  await page.getByTestId(`lab-cat-${category}`).click();
  const tray = page.getByTestId('lab-tray');
  await expect(tray).toHaveAttribute('data-category', category);
  const button = page.getByTestId(`lab-item-${item}`);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lab-details')).toBeVisible();
  await page.getByTestId('lab-use').click();
  await expect(tray).toBeHidden();
}

/**
 * Every Lab category and Undo is on screen without scrolling and is a 48 px target (one measurement,
 * so slow software-rendered runs stay quick; the 200 % text test scrolls to each one instead).
 */
async function expectCategoriesOnScreen(page: Page): Promise<void> {
  const ids = ['inspect', 'life', 'food', 'chemistry', 'habitat', 'tools', 'observe', 'undo'].map((c) =>
    c === 'undo' ? 'lab-undo' : `lab-cat-${c}`,
  );
  const boxes = await page.evaluate((list) => {
    return list.map((id) => {
      const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
      return {
        id,
        ok: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5,
        min: Math.min(r.width, r.height),
      };
    });
  }, ids);
  for (const b of boxes) {
    expect(b.ok, `${b.id} on screen`).toBe(true);
    expect(b.min, `${b.id} target size`).toBeGreaterThanOrEqual(47.5);
  }
}

// Generous timeouts: software-rendered WebGL (SwiftShader) on a shared machine can drop the page to a
// few frames per second, and every browser action waits for one; the journeys themselves are short.
const SLOW = 420_000;

test('Lab edits: paint gel, place and erase a wall, one stroke = one change; switches change no state', async ({
  page,
}) => {
  test.setTimeout(SLOW);
  await watchWorker(page);
  await startGarden(page);
  await expect(page.locator('.viewport canvas')).toBeVisible();
  const h0 = await workerHash(page);

  await openLab(page);
  expect(await workerHash(page)).toBe(h0);
  await expectCategoriesOnScreen(page);
  await expectNoHorizontalOverflow(page);

  // Habitat → Gel: the item explains itself before use.
  await page.getByTestId('lab-cat-habitat').click();
  await page.getByTestId('lab-item-paint:gel').click();
  const details = page.getByTestId('lab-details');
  for (const line of [
    'Purpose',
    'Suitable habitats',
    'Dose',
    'Radius',
    'Changes',
    'Does not change',
    'Watch for',
  ])
    await expect(details).toContainText(line);
  await expect(details).toContainText('0.025 per tick');
  await expect(details).toContainText('cannot live in gel'); // from this dish's recorded habitats
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('lab-use').click();
  await expect(page.getByTestId('lab-tool-name')).toHaveText('Gel');

  // Paint: the footprint is previewed before release; one stroke = one change.
  await stroke(page, [20, 64], [34, 64], async () => {
    await expect(page.getByTestId('brush-info')).toContainText(/\d+ cells/);
  });
  await expect(page.locator('.toast')).toContainText(/Painted gel on \d+ cells/);
  const h1 = await workerHash(page);
  expect(h1).not.toBe(h0);
  // The tool persists in Lab (unlike Explore).
  await expect(page.getByTestId('lab-tool-name')).toHaveText('Gel');

  // Tools → Wall.
  await pickTool(page, 'tools', 'place:wall');
  await stroke(page, [22, 92], [36, 92]);
  // The tray names the structure from its content record (CT §4 "Impermeable wall").
  await expect(page.locator('.toast')).toContainText(/Placed impermeable wall on \d+ cells/);
  const h2 = await workerHash(page);
  expect(h2).not.toBe(h1);

  // A stroke interrupted by a view switch commits nothing, and the Lab tool survives the round trip.
  await stroke(page, [40, 104], [52, 104], async () => {
    await expect(page.getByTestId('brush-info')).toBeVisible();
    await page.getByTestId('view-toggle').dispatchEvent('click');
    await expect(page.getByTestId('view-toggle')).toHaveAttribute('aria-pressed', 'false');
  });
  await expect(page.getByTestId('action-look')).toBeVisible();
  expect(await workerHash(page)).toBe(h2);
  await openLab(page);
  await expect(page.getByTestId('lab-tool-name')).toHaveText('Impermeable wall');
  expect(await workerHash(page)).toBe(h2);

  // Tools → Erase structure over the same line: the wall goes, what was underneath is back.
  await pickTool(page, 'tools', 'erase');
  await stroke(page, [22, 92], [36, 92]);
  await expect(page.locator('.toast')).toContainText(/Removed structures from \d+ cells/);
  const h3 = await workerHash(page);
  expect(h3).not.toBe(h2);
  // The ordinary Undo rewinds exactly one gesture (one level).
  await page.getByTestId('lab-undo').click();
  await expect(page.locator('.toast')).toContainText('Undone');
  expect(await workerHash(page)).toBe(h2);
  await expect(page.getByTestId('lab-undo')).toBeDisabled();

  // Back to Explore: nothing changed by the switch.
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('action-look')).toBeVisible();
  expect(await workerHash(page)).toBe(h2);
});

test('Lab observe: one overlay at a time with legend and opacity; Explore ⇄ Lab changes no state', async ({
  page,
}) => {
  test.setTimeout(SLOW);
  await watchWorker(page);
  await startGarden(page);
  await expect(page.locator('.viewport canvas')).toBeVisible();
  const h2 = await workerHash(page);
  await openLab(page);
  expect(await workerHash(page)).toBe(h2);

  // Observe → one overlay at a time, with a legend and adjustable opacity; looking changes nothing.
  await page.getByTestId('lab-cat-observe').click();
  await page.getByTestId('overlay-sugar').click();
  await expect(page.getByTestId('overlay-sugar')).toHaveAttribute('aria-checked', 'true');
  await expect(
    page.getByTestId('lab-tray').getByRole('group', { name: 'Sugar overlay legend' }),
  ).toBeVisible();
  await expect(page.getByTestId('overlay-legend')).toContainText('C per cell');
  await page.getByTestId('overlay-light').click();
  await expect(page.getByTestId('overlay-sugar')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('overlay-legend')).toContainText('Light');
  const slider = page.getByTestId('overlay-opacity');
  await slider.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('overlay-opacity-value')).toHaveText('45 %');
  await slider.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('overlay-opacity-value')).toHaveText('70 %');
  // Kept as the player's display setting (the same one Settings uses).
  expect(
    await page.evaluate(
      () =>
        (JSON.parse(localStorage.getItem('pixelmeba.settings') ?? '{}') as { overlayOpacity?: number })
          .overlayOpacity,
    ),
  ).toBeCloseTo(0.7, 6);
  await expectNoSeriousA11yViolations(page);
  expect(await workerHash(page)).toBe(h2);

  // Back to Explore: the overlay is hidden there, Explore's actions return, nothing changed.
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('action-look')).toBeVisible();
  await expect(page.getByTestId('lab-bar')).toBeHidden();
  await expect(page.getByTestId('overlay-legend')).toBeHidden();
  expect(await workerHash(page)).toBe(h2);
  // …and in Lab again the chosen overlay is restored.
  await openLab(page);
  await expect(page.getByTestId('overlay-legend')).toContainText('Light');
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('action-look')).toBeVisible();
  expect(await workerHash(page)).toBe(h2);
});

test('Lab keyboard: I inspect, L life, F food, Esc back to Inspect', async ({ page }) => {
  test.setTimeout(SLOW);
  await startGarden(page);
  await openLab(page);
  await page.keyboard.press('l');
  await expect(page.getByTestId('lab-tray')).toHaveAttribute('data-category', 'life');
  await page.keyboard.press('f');
  await expect(page.getByTestId('lab-tray')).toHaveAttribute('data-category', 'food');
  await page.getByTestId('lab-item-material:SUGAR').click();
  await expect(page.getByTestId('lab-tool-name')).toHaveText('Sugar');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lab-tray')).toBeHidden();
  await expect(page.getByTestId('lab-tool-name')).toHaveText('Inspect');
  await page.keyboard.press('h'); // not a Lab key: nothing opens
  await expect(page.getByTestId('lab-tray')).toBeHidden();
  await page.keyboard.press('i');
  await expect(page.getByTestId('lab-cat-inspect')).toHaveAttribute('aria-pressed', 'true');
});

test('Lab at 200 % text: no sideways scrolling, trays reachable, axe clean', async ({ page }) => {
  test.setTimeout(SLOW);
  await startGarden(page, { textScale: 2 });
  await openLab(page);
  await expectNoHorizontalOverflow(page);
  for (const c of ['inspect', 'life', 'food', 'chemistry', 'habitat', 'tools', 'observe'])
    await expectReachable(page.getByTestId(`lab-cat-${c}`));
  await page.getByTestId('lab-cat-habitat').click();
  await expectReachable(page.getByTestId('lab-item-shade:paint'));
  await page.getByTestId('lab-item-shade:paint').click();
  await expect(page.getByTestId('lab-details')).toContainText('Light × 0.1');
  await expectReachable(page.getByTestId('lab-radius-6'));
  await expectReachable(page.getByTestId('lab-use'));
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('lab-use').click();
  await page.getByTestId('lab-cat-observe').click();
  await expectReachable(page.getByTestId('overlay-oxygen'));
  await page.getByTestId('overlay-oxygen').click();
  await expectReachable(page.getByTestId('overlay-opacity'));
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('action-look')).toBeVisible();
});
