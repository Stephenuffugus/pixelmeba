/**
 * P3.11 accessibility pass 1 (BUILD_DIRECTIVE "Done when: axe (Playwright) has zero serious/critical
 * issues on all screens"; UX §4.1, §9; W6-09). Every screen and sheet is visited and scanned with axe
 * (serious and critical impacts fail). Each test collects every finding with the screen it came from
 * and fails once at the end, so one run lists everything. A last test checks 200 % text at the three
 * acceptance sizes (360×800, 800×360, 1440×900): primary controls reachable as 48 px targets and no
 * sideways scrolling.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSaveFile } from '../../src/persistence/saveFile';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, type WorldState } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import { loadRegistryFs, REPO_ROOT } from '../../tools/lib/content-fs';
import { E_X, E_Y, ENT_STRIDE } from '../../src/worker/protocol';
import {
  expectNoHorizontalOverflow,
  expectReachable,
  seedSettings,
  simSeconds,
  startGarden,
} from './helpers';

/** axe findings (serious/critical) per screen, collected over one test. */
class Audit {
  readonly found: string[] = [];
  readonly visited: string[] = [];
  constructor(private readonly page: Page) {}
  async scan(screen: string): Promise<void> {
    const results = await new AxeBuilder({ page: this.page }).analyze();
    this.visited.push(screen);
    for (const v of results.violations) {
      if (v.impact !== 'serious' && v.impact !== 'critical') continue;
      this.found.push(
        `${screen} — ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
      );
    }
  }
  done(expected: readonly string[]): void {
    expect(this.visited).toEqual(expected);
    expect(this.found).toEqual([]);
  }
}

/** Screen point of dish cell centre (cx, cy) with the whole dish in view. */
async function at(page: Page, cx: number, cy: number, testId = 'viewport'): Promise<[number, number]> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`no ${testId}`);
  const zoom = Math.min(box.width, box.height) / 124;
  return [box.x + box.width / 2 + (cx - 64) * zoom, box.y + box.height / 2 + (cy - 64) * zoom];
}

async function tapDish(page: Page, cx: number, cy: number): Promise<void> {
  const [x, y] = await at(page, cx, cy);
  await page.mouse.click(x, y);
}

async function pause(page: Page): Promise<void> {
  const run = page.getByTestId('run-toggle');
  if ((await run.getAttribute('aria-label')) === 'Pause') await run.click();
  await expect(run).toHaveAttribute('aria-label', 'Run');
}

/** Record organism positions from the worker's snapshots (the app has no test hook; an init script wraps Worker). */
async function watchPositions(page: Page): Promise<void> {
  await page.addInitScript(
    ({ stride, ex, ey }) => {
      const w = window as unknown as { Worker: typeof Worker; __pos: [number, number][] };
      const Orig = w.Worker;
      w.__pos = [];
      w.Worker = class extends Orig {
        constructor(url: string | URL, opts?: WorkerOptions) {
          super(url, opts);
          this.addEventListener(
            'message',
            (e: MessageEvent<{ type?: string; ents?: Float32Array; count?: number }>) => {
              const d = e.data;
              if (d?.type !== 'snapshot' || !d.ents || typeof d.count !== 'number') return;
              const out: [number, number][] = [];
              for (let k = 0; k < d.count; k++)
                out.push([d.ents[k * stride + ex]!, d.ents[k * stride + ey]!]);
              w.__pos = out;
            },
          );
        }
      };
    },
    { stride: ENT_STRIDE, ex: E_X, ey: E_Y },
  );
}

/**
 * Dish points from the recorded positions: midpoints of the closest pairs of organisms (two equally
 * near organisms make a tap ambiguous, so the candidate list opens), and open points at least 3 cells
 * from every organism inside the dish (a tap there describes the cell).
 */
async function dishPoints(page: Page): Promise<{ ambiguous: [number, number][]; open: [number, number][] }> {
  const pos = await page.evaluate(() => (window as unknown as { __pos: [number, number][] }).__pos);
  const pairs: { d: number; m: [number, number] }[] = [];
  for (let i = 0; i < pos.length; i++)
    for (let j = i + 1; j < pos.length; j++) {
      const [ax, ay] = pos[i]!;
      const [bx, by] = pos[j]!;
      const d = Math.hypot(ax - bx, ay - by);
      if (d > 0.2 && d < 2.5) pairs.push({ d, m: [(ax + bx) / 2, (ay + by) / 2] });
    }
  pairs.sort((a, b) => a.d - b.d);
  const open: [number, number][] = [];
  for (let y = 20.5; y <= 108.5 && open.length < 5; y += 8)
    for (let x = 20.5; x <= 108.5 && open.length < 5; x += 8) {
      if (Math.hypot(x - 64, y - 64) > 50) continue;
      if (pos.every(([px, py]) => Math.hypot(px - x, py - y) >= 3)) open.push([x, y]);
    }
  return { ambiguous: pairs.slice(0, 8).map((p) => p.m), open };
}

const closeSheet = (page: Page, testId: string) =>
  page.getByTestId(testId).getByRole('button', { name: 'Close' }).first().click();

// ------------------------------------------------------------------------------------ pages

test('pages: Home, Play, What if?, Settings, About, Saved dishes, Field Guide tabs, Notebook tabs, an experiment card, New Dish', async ({
  page,
}) => {
  test.setTimeout(360_000);
  const a = new Audit(page);
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await expect(page.getByTestId('home-play')).toBeVisible();
  await a.scan('Home');

  await page.getByTestId('home-play').click();
  await expect(page.getByTestId('start-garden')).toBeVisible();
  await a.scan('Play');
  await page.getByTestId('whatif-open').click();
  await expect(page.getByTestId('whatif-sheet')).toBeVisible();
  await a.scan('What if? (from Play)');
  await page.getByTestId('whatif-close').click();
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByTestId('sound-settings')).toBeVisible();
  await expect(page.getByTestId('setting-simplified-overlay')).not.toBeChecked();
  await a.scan('Settings (with sound settings)');
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: 'About' }).click();
  await expect(page.getByTestId('about-versions')).toBeVisible();
  await a.scan('About');
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await expect(page.getByRole('heading', { name: 'Saved dishes' })).toBeVisible();
  await a.scan('Saved dishes (empty)');
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: 'Field Guide' }).click();
  await expect(page.getByTestId('field-guide')).toBeVisible();
  for (const tab of ['species', 'materials', 'tools', 'glossary']) {
    await page.getByTestId(`guide-tab-${tab}`).click();
    await expect(page.getByTestId(`guide-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
    await a.scan(`Field Guide: ${tab}`);
  }
  await page.getByTestId('guide-back').click();

  await page.getByTestId('home-notebook').click();
  await expect(page.getByTestId('notebook')).toBeVisible();
  for (const tab of ['journal', 'experiments']) {
    await page.getByTestId(`notebook-tab-${tab}`).click();
    await expect(page.getByTestId(`notebook-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
    await a.scan(`Notebook: ${tab}`);
  }
  await page.getByTestId('experiment-card-EXP_A').click();
  await expect(page.getByTestId('experiment-card')).toBeVisible();
  await a.scan('Experiment card');

  await page.goto('/');
  await page.getByTestId('home-new').click();
  await expect(page.getByTestId('new-dish-summary')).toBeVisible();
  await a.scan('New Dish: basics');
  const curated = page.getByTestId('new-dish-start-with-curated:L306_BORROWED_SHELTER');
  await curated.click();
  await expect(curated).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('new-dish-question')).toBeVisible();
  await a.scan('New Dish: a curated dish');
  await page.getByTestId('new-dish-advanced').click();
  await expect(page.getByTestId('new-dish-rates-panel')).toBeVisible();
  await a.scan('New Dish: Evolution with Advanced rates');
  await page.getByTestId('new-dish-content').click();
  await expect(page.getByTestId('new-dish-registry')).toBeVisible();
  await page.getByTestId('new-dish-summary').scrollIntoViewIfNeeded();
  await a.scan('New Dish: Content and summary');

  a.done([
    'Home',
    'Play',
    'What if? (from Play)',
    'Settings (with sound settings)',
    'About',
    'Saved dishes (empty)',
    'Field Guide: species',
    'Field Guide: materials',
    'Field Guide: tools',
    'Field Guide: glossary',
    'Notebook: journal',
    'Notebook: experiments',
    'Experiment card',
    'New Dish: basics',
    'New Dish: a curated dish',
    'New Dish: Evolution with Advanced rates',
    'New Dish: Content and summary',
  ]);
});

// ------------------------------------------------------------------------------------ the dish

test('dish: Explore sheets, candidate list, every inspector depth, the cell inspector with its reaction ledger, More, Save, Evolution, History tabs, What if?, Lab trays, Lineage, Sample session, Saved dishes with slots and checkpoints', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const a = new Audit(page);
  await watchPositions(page);
  await startGarden(page, { checkpointRing: true });
  await a.scan('Dish (Explore)');

  await page.getByTestId('action-addlife').click();
  await expect(page.locator('section.sheet[aria-labelledby="addlife-title"]')).toBeVisible();
  await a.scan('Add Life sheet');
  await page
    .locator('section.sheet[aria-labelledby="addlife-title"]')
    .getByRole('button', { name: 'Close' })
    .click();
  await page.getByTestId('action-feed').click();
  await expect(page.getByTestId('feed-choose')).toBeVisible();
  await a.scan('Feed sheet');
  await page.getByTestId('action-look').click();

  // The candidate list: tap midway between two close organisms (equally near: an ambiguous tap).
  await page.getByRole('button', { name: 'Whole dish' }).click();
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  const insp = page.getByTestId('inspector');
  const points = await dishPoints(page);
  let shown = false;
  for (const [cx, cy] of points.ambiguous) {
    await tapDish(page, cx, cy);
    await expect(list.or(insp)).toBeVisible();
    if (await list.isVisible()) {
      shown = true;
      break;
    }
    await insp.getByRole('button', { name: 'Close' }).first().click();
  }
  expect(shown, 'a tap in a crowded patch opens the candidate list').toBe(true);
  await a.scan('Candidate list');
  await list.getByRole('option').first().click();
  await expect(insp.getByRole('heading', { level: 2 })).toContainText(/#\d+/);
  await a.scan('Inspector: Summary');
  for (const tab of ['Happening now', 'Passed to offspring', 'Details']) {
    await insp.getByRole('tab', { name: tab }).click();
    await expect(insp.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    await a.scan(`Inspector: ${tab}`);
  }
  await insp.getByTestId('shortcut-why').click();
  await expect(insp.getByTestId('why-stop')).toBeFocused();
  await a.scan('Inspector: Why did it stop?');
  await insp.getByRole('button', { name: 'Close' }).first().click();

  // The cell inspector with its reaction ledger (the Garden records enzymes: Crumbsmiths make one).
  for (const [cx, cy] of points.open) {
    await tapDish(page, cx, cy);
    await expect(list.or(insp)).toBeVisible();
    if (await list.isVisible()) await page.getByRole('button', { name: 'Cancel' }).click();
    else if (/^Cell /.test(await insp.getByRole('heading', { level: 2 }).innerText())) break;
    else await insp.getByRole('button', { name: 'Close' }).first().click();
  }
  await expect(insp.getByRole('heading', { level: 2 })).toHaveText(/^Cell \d+, \d+$/);
  await expect(insp.getByTestId('reaction-ledger')).toBeVisible();
  await expect(page.getByTestId('cell-description')).toHaveText(/^Selected cell \d+, \d+: /);
  await a.scan('Cell inspector with the reaction ledger');
  await insp.getByRole('button', { name: 'Close' }).first().click();

  // More and what it opens.
  await page.getByTestId('more').click();
  await expect(page.getByTestId('more-save')).toBeVisible();
  await a.scan('More');
  await page.getByTestId('more-save').click();
  await expect(page.getByTestId('save-confirm')).toBeVisible();
  await a.scan('Save');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-confirm')).toHaveCount(0);
  await page.getByTestId('more').click();
  await page.getByTestId('more-evolution').click();
  await expect(page.getByTestId('evolution-sheet')).toBeVisible();
  await a.scan('Evolution settings (Advanced)');
  await closeSheet(page, 'evolution-sheet');
  await page.getByTestId('more').click();
  await page.getByTestId('more-history').click();
  const history = page.getByTestId('history');
  await expect(history).toBeVisible();
  for (const tab of ['charts', 'regions', 'table', 'events']) {
    await history.getByTestId(`history-tab-${tab}`).click();
    await expect(history.getByTestId(`history-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
    await a.scan(`History: ${tab}`);
  }
  // D-0014: every chart has its table alternative.
  await history.getByTestId('history-tab-table').click();
  await expect(history.getByTestId('history-table').getByRole('columnheader').first()).toBeVisible();
  await history.getByRole('button', { name: 'Close' }).first().click();
  await page.getByTestId('more').click();
  await page.getByTestId('more-whatif').click();
  await expect(page.getByTestId('whatif-sheet')).toBeVisible();
  await a.scan('What if? (from the dish)');
  await page.getByTestId('whatif-close').click();

  // Lab: every tray, the lineage panel and the Sample session.
  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('dish-screen')).toHaveAttribute('data-view', 'lab');
  // Inspect is the Lab's tool (no tray); the other categories open their trays.
  await page.getByTestId('lab-cat-inspect').click();
  await expect(page.getByTestId('lab-cat-inspect')).toHaveAttribute('aria-pressed', 'true');
  await a.scan('Lab: Inspect');
  for (const cat of ['life', 'food', 'chemistry', 'habitat', 'tools', 'observe']) {
    const button = page.getByTestId(`lab-cat-${cat}`);
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
    await expect(page.locator(`[data-testid="lab-tray"][data-category="${cat}"]`)).toBeVisible();
    await a.scan(`Lab tray: ${cat}`);
  }
  await page.getByTestId('lab-lineage').click();
  await expect(page.getByTestId('lineage')).toBeVisible();
  await a.scan('Lineage');
  await page.getByTestId('lineage-close').click();
  await page.getByTestId('lab-cat-tools').click();
  await page.getByTestId('lab-item-sample').click();
  await page.getByTestId('sample-mode-life').click();
  await page.getByTestId('lab-radius-3').click();
  await page.getByTestId('lab-use').click();
  await expect(page.getByTestId('sample-panel')).toHaveAttribute('data-state', 'aim');
  await a.scan('Sample session: aim');
  await page.getByRole('button', { name: 'Whole dish' }).click();
  await tapDish(page, 48, 64);
  await expect(page.getByTestId('sample-panel')).toHaveAttribute('data-state', 'preview');
  await a.scan('Sample session: preview');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sample-panel')).toBeHidden();
  await page.getByTestId('view-toggle').click();

  // Run at 4× past one minute of dish time: the checkpoint ring keeps an automatic copy.
  await page.getByTestId('run-toggle').click();
  await page.keyboard.press('4');
  await expect
    .poll(() => simSeconds(page), { timeout: 240_000, intervals: [1000] })
    .toBeGreaterThanOrEqual(62);
  await pause(page);
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await expect(page.locator('li[data-slot="slot1"]')).toBeVisible();
  await expect(page.getByTestId('checkpoint-row').first()).toBeVisible({ timeout: 30_000 });
  await a.scan('Saved dishes (a named slot and checkpoints)');

  a.done([
    'Dish (Explore)',
    'Add Life sheet',
    'Feed sheet',
    'Candidate list',
    'Inspector: Summary',
    'Inspector: Happening now',
    'Inspector: Passed to offspring',
    'Inspector: Details',
    'Inspector: Why did it stop?',
    'Cell inspector with the reaction ledger',
    'More',
    'Save',
    'Evolution settings (Advanced)',
    'History: charts',
    'History: regions',
    'History: table',
    'History: events',
    'What if? (from the dish)',
    'Lab: Inspect',
    'Lab tray: life',
    'Lab tray: food',
    'Lab tray: chemistry',
    'Lab tray: habitat',
    'Lab tray: tools',
    'Lab tray: observe',
    'Lineage',
    'Sample session: aim',
    'Sample session: preview',
    'Saved dishes (a named slot and checkpoints)',
  ]);
});

// ------------------------------------------------------------------------------------ comparison and cards

test('Compare setup and results; an experiment paired run', async ({ page }) => {
  test.setTimeout(600_000);
  const a = new Audit(page);
  await startGarden(page);
  await page.getByTestId('more').click();
  await page.getByTestId('action-compare').click();
  await expect(page.getByTestId('compare-screen')).toHaveAttribute('data-status', 'setup');
  await a.scan('Compare setup');
  await page.getByTestId('compare-feed').click();
  await page.getByTestId('feed-choose').click();
  const box = (await page.getByTestId('compare-canvas-B').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.5);
  await expect(page.getByTestId('compare-change')).toContainText('Queued on B');
  await page.getByTestId('compare-horizon-60').click();
  await page.getByTestId('compare-run').click();
  const fast = page.getByTestId('compare-speed-max');
  if (await fast.isVisible()) await fast.click();
  await expect(page.getByTestId('compare-results-title')).toBeVisible({ timeout: 180_000 });
  await a.scan('Compare results');
  await page.getByTestId('compare-close').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();

  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('home-notebook').click();
  await page.getByTestId('notebook-tab-experiments').click();
  await page.getByTestId('experiment-card-EXP_A').click();
  await page.getByTestId('experiment-start').click();
  const screen = page.getByTestId('experiment-run-screen');
  await expect(screen).toHaveAttribute('data-status', 'setup');
  await a.scan('Paired run: setup');
  await page.getByTestId('experiment-prediction').fill('Copy A will feed more.');
  await page.getByTestId('experiment-run').click();
  await expect(screen).toHaveAttribute('data-status', /running|complete/);
  await a.scan('Paired run: running');
  a.done(['Compare setup', 'Compare results', 'Paired run: setup', 'Paired run: running']);
});

test('the Keep sheet (all ten slots used)', async ({ page }) => {
  test.setTimeout(480_000);
  const a = new Audit(page);
  await startGarden(page);
  for (let i = 0; i < 10; i++) {
    await page.getByTestId('more').click();
    await page.getByTestId('more-save').click();
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('save-confirm')).toHaveCount(0);
  }
  // A fresh Garden (the saved one rebuilds exactly, so nothing is written) that has run: it has no slot.
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('home-play').click();
  await page.getByTestId('start-garden').click();
  await expect(page.getByTestId('sim-time')).toHaveText(/^0:00 · 56 alive/);
  await page.getByTestId('run-toggle').click();
  await expect.poll(() => simSeconds(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  await pause(page);
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByTestId('home-play').click();
  await page.getByTestId('start-garden').click();
  await expect(page.getByTestId('keep-sheet')).toBeVisible();
  await a.scan('Keep sheet');
  await page.getByTestId('keep-cancel').click();
  a.done(['Keep sheet']);
});

// ------------------------------------------------------------------------------------ the discovery card

const DIR = join(REPO_ROOT, 'tmp', 'e2e-a11y');
const FIXTURE = join(DIR, `discovery-fixture-${process.pid}.pixelmeba`);

test.describe('discovery card', () => {
  // The same real dish as tests/e2e/lineage.spec.ts: FIRST_DISH_V1, Accelerated Evolution, seed 101,
  // saved 1.5 simulated seconds before its first branch is established (no fake UI state).
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    const reg = loadRegistryFs();
    const w = realizeRecipe(reg, 'FIRST_DISH_V1', {
      seed: 101,
      worldId: 'a11y-e2e',
      transform: (r) => ({ ...r, mutationPreset: 'accelerated' }),
    });
    const kept: WorldState[] = [];
    while (w.branches.established === 0) {
      if (w.tick % 5 === 0) {
        kept.push(serializeWorld(w));
        if (kept.length > 8) kept.shift();
      }
      step(w);
      if (w.tick > 12_000) throw new Error('no branch established by 20 min on seed 101');
    }
    const state = [...kept].reverse().find((s) => s.tick <= w.tick - 15);
    if (!state) throw new Error('no state kept before the establishment');
    const { text } = await buildSaveFile(deserializeWorld(state), {
      name: 'Discovery fixture',
      savedAt: '2026-10-10T00:00:00.000Z',
      recipeId: 'FIRST_DISH_V1',
    });
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FIXTURE, text);
  });
  test.afterAll(() => rmSync(FIXTURE, { force: true }));

  test('the discovery card', async ({ page }) => {
    test.setTimeout(180_000);
    const a = new Audit(page);
    await seedSettings(page, { showPrompts: false });
    await page.goto('/');
    await page.getByRole('button', { name: 'Saved dishes' }).click();
    await page.locator('input[aria-label="Import a dish file"]').setInputFiles(FIXTURE);
    await expect(page.getByTestId('dish-screen')).toBeVisible();
    await page.getByTestId('run-toggle').click();
    await expect(page.getByTestId('discovery-card')).toBeVisible({ timeout: 90_000 });
    await a.scan('Discovery card');
    a.done(['Discovery card']);
  });
});

// ------------------------------------------------------------------------------------ 200 % text

test('200 % text at 360×800, 800×360 and 1440×900: primary controls reachable, nothing scrolls sideways', async ({
  page,
}) => {
  test.setTimeout(600_000);
  await seedSettings(page, { showPrompts: false, textScale: 2 });
  for (const size of [
    { width: 360, height: 800 },
    { width: 800, height: 360 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-text-scale', '2');
    for (const id of ['home-play', 'home-new', 'home-notebook']) await expectReachable(page.getByTestId(id));
    await expectNoHorizontalOverflow(page);
    await page.getByTestId('home-play').click();
    await expectReachable(page.getByTestId('start-garden'));
    await expectNoHorizontalOverflow(page);
    await page.getByTestId('start-garden').click();
    await expect(page.getByTestId('sim-time')).toContainText('56 alive');
    // Explore: the top strip and the bottom actions.
    for (const id of ['run-toggle', 'more', 'view-toggle', 'action-addlife', 'action-feed', 'action-look'])
      await expectReachable(page.getByTestId(id));
    await expectReachable(page.getByRole('button', { name: 'Undo (rewinds time)' }));
    await expectNoHorizontalOverflow(page);
    // A sheet keeps its close control and its first choice reachable.
    await page.getByTestId('action-addlife').click();
    const sheet = page.locator('section.sheet[aria-labelledby="addlife-title"]');
    await expectReachable(sheet.getByRole('button', { name: 'Close' }));
    await expectReachable(page.getByTestId('species-B01'));
    await sheet.getByRole('button', { name: 'Close' }).click();
    // Lab: every tray category.
    await page.getByTestId('view-toggle').click();
    for (const cat of ['inspect', 'life', 'food', 'chemistry', 'habitat', 'tools', 'observe'])
      await expectReachable(page.getByTestId(`lab-cat-${cat}`));
    await expectNoHorizontalOverflow(page);
    // The keyboard stop and its reticle fit inside the dish view.
    await page.getByTestId('view-toggle').click();
    await page.keyboard.press('Shift'); // keyboard modality: programmatic focus then shows :focus-visible
    await page.getByTestId('dish-focus').focus();
    await expect(page.getByTestId('reticle')).toBeInViewport();
  }
});
