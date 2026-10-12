/**
 * P4.12: the browser half of npm run store:assets (tools/store-assets.ts). Playwright Chromium drives the
 * PRODUCTION build (served from tmp/dist-store) through real play and captures:
 *
 * - the feature graphic: the Garden run at 4× to ≥ 2:00, paused, Share → Picture (labels hidden) — the D-0080
 *   picture of a real snapshot — composed 1 : 1 (no resampling) with the wordmark and the promise line on the
 *   surround colour, 1024 × 500, 24-bit (no alpha);
 * - six screenshots per device class (UX §10; D09 §11): 01 living dish, 02 simple actions, 03 What if?,
 *   04 inspection, 05 a real inherited change (a branch established in a recorded run: the saved run
 *   tests/fixtures/saves/first-dish-accelerated-varied-t6000, imported through the ordinary Import path),
 *   06 an experiment (Experiment A's results after its paired run).
 *
 * The tick and state hash of each capture are read from the simulation worker (the app's own worker, observed
 * through a wrapper as the e2e journeys do; the read-only 'hash' request never changes a world). Settings:
 * gentle prompts off (no coaching bubble over the picture), performance numbers off; service workers blocked so
 * every run loads this build.
 */
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { PNG } from 'pngjs';
import { loadSaveFile } from '../../src/persistence/saveFile';
import { PICTURE_CELL_PX, PICTURE_DISH_X, PICTURE_DISH_Y, PICTURE_PX } from '../../src/render/picture';
import { ENT_STRIDE, E_LIFE, E_X, E_Y, PROTOCOL_VERSION } from '../../src/worker/protocol';
import { P } from '../../art/src/palette';
import { serveStatic } from '../../tests/e2e/staticServer';
import { sha256, toOpaqueRgbPng, type FeatureRecord, type ShotRecord } from '../store-assets';

// ---------------------------------------------------------------------------------------------------------
// What is captured

export interface DeviceClass {
  readonly id: 'phone' | 'tablet7' | 'tablet10';
  readonly viewport: { readonly width: number; readonly height: number };
  readonly deviceScaleFactor: number;
}

/**
 * Phone 1080 × 1920 (Play: 9:16 portrait, at least 1080 × 1920 for games' large-format eligibility). Tablets in
 * 9:16 portrait as Play's large-screen guidance asks ("Use a 16:9 aspect ratio for landscape and a 9:16 aspect
 * ratio for portrait", "between 1,080 and 7,680px"; PROPOSED DECISION in the P4.12 report): 7-inch 1152 × 2048
 * (576 × 1024 CSS px at 2×), 10-inch 1440 × 2560 (720 × 1280 at 2×).
 */
export const DEVICE_CLASSES: readonly DeviceClass[] = [
  { id: 'phone', viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 },
  { id: 'tablet7', viewport: { width: 576, height: 1024 }, deviceScaleFactor: 2 },
  { id: 'tablet10', viewport: { width: 720, height: 1280 }, deviceScaleFactor: 2 },
];

export const TOPICS = [
  { n: '01', id: 'living-dish', shows: 'The Little Living Garden after about 1:30 of dish time at 4×, paused, the whole dish in view (Look).' },
  { n: '02', id: 'simple-actions', shows: 'The Feed tray open over the running Garden: choose a food, a dose, then tap the dish.' },
  { n: '03', id: 'what-if', shows: 'What if? with “Dinner farther away” (R-G3) chosen: one change, shown before and after.' },
  { n: '04', id: 'inspection', shows: 'An organism’s inspector: what it is doing and what limits it right now (the constraint line).' },
  { n: '05', id: 'inherited-change', shows: 'The family tree on a branch established in a recorded run, compared with its ancestor.' },
  { n: '06', id: 'experiment', shows: 'Experiment A (What unlocks starch): the results of its paired run.' },
] as const;

export const FEATURE_FILE = 'store/feature-1024x500.png';
export const FEATURE_PICTURE_FILE = 'store/feature-source-picture.png';
/** The wordmark and the promise line (UX §10), one sentence per line. */
export const FEATURE_TEXT = ['Pixelmeba', 'Grow a tiny living world.', 'Change one thing.', 'See what happens.'] as const;
/** The saved run topic 05 opens (written by the g2 build; tools/make-g2-saves.ts). */
export const INHERITED_SAVE = 'tests/fixtures/saves/first-dish-accelerated-varied-t6000.pixelmeba.gz';
/** Its branch shown: the one whose root GAINED an ability (a module in the genome), the plainest inherited change. */
export const INHERITED_BRANCH_TRAIT = 'module';
/** The name the screenshot's dish is saved under (the fixture's own name starts "g2 …"). */
const SAVE_NAME = 'Accelerated Garden';

const GARDEN = { recipe: 'FIRST_DISH_V1', name: 'Little Living Garden' };
const EXP = { id: 'EXP_A', recipe: 'STARCH_UNLOCK_V1' };

export interface SessionOptions {
  readonly root: string;
  readonly dist: string;
  readonly port: number;
  readonly commit: string;
  readonly feature: boolean;
  readonly screenshots: boolean;
  readonly classes: readonly string[] | null;
  readonly topics: readonly string[] | null;
  readonly write: (rel: string, bytes: Buffer | string) => void;
  readonly log: (s: string) => void;
}

// ---------------------------------------------------------------------------------------------------------
// Small waits (no test runner here)

async function until<T>(what: string, fn: () => Promise<T>, ok: (v: T) => boolean, timeout = 30_000): Promise<T> {
  const end = Date.now() + timeout;
  let last: T | undefined;
  for (;;) {
    try {
      last = await fn();
      if (ok(last)) return last;
    } catch {
      // try again
    }
    if (Date.now() > end) throw new Error(`timed out waiting for ${what} (last: ${String(last)})`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function shown(loc: Locator, timeout = 30_000): Promise<Locator> {
  await loc.first().waitFor({ state: 'visible', timeout });
  return loc.first();
}

async function simSeconds(page: Page): Promise<number> {
  const t = await page.getByTestId('sim-time').innerText();
  const m = /^(?:(\d+):)?(\d+):(\d+)/.exec(t.trim());
  if (!m) throw new Error(`unparsable time ${t}`);
  return (Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3]);
}

function recipeSeed(root: string, id: string): number {
  return (JSON.parse(readFileSync(join(root, 'content', 'recipes', `${id}.json`), 'utf8')) as { seed: number }).seed;
}

// ---------------------------------------------------------------------------------------------------------
// The worker, observed (as tests/e2e/lab-tools.spec.ts watchWorker does)

interface WorkerWatch {
  workers: Worker[];
  dishId: string | null;
  next: number;
  last: { dishId: string; tick: number } | null;
  ticks: Record<string, number>;
  ents: number[];
}

async function watchWorker(ctx: BrowserContext): Promise<void> {
  await ctx.addInitScript((stride: number) => {
    const w = window as unknown as { Worker: typeof Worker; __pm: WorkerWatch };
    const Orig = w.Worker;
    w.__pm = { workers: [], dishId: null, next: 2_000_000_000, last: null, ticks: {}, ents: [] };
    w.Worker = class extends Orig {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        w.__pm.workers.push(this);
        this.addEventListener('message', (e: MessageEvent<{ type?: string; info?: { dishId: string }; dishId?: string; tick?: number; ents?: ArrayLike<number>; count?: number }>) => {
          const d = e.data;
          if ((d?.type === 'ready' || d?.type === 'loaded') && d.info) w.__pm.dishId = d.info.dishId;
          if (d?.type === 'snapshot' && typeof d.dishId === 'string' && typeof d.tick === 'number') {
            w.__pm.last = { dishId: d.dishId, tick: d.tick };
            w.__pm.ticks[d.dishId] = d.tick;
            if (d.dishId === w.__pm.dishId && d.ents && typeof d.count === 'number') w.__pm.ents = Array.from(d.ents).slice(0, d.count * stride);
          }
        });
      }
    };
  }, ENT_STRIDE);
}

/** The active dish's tick (its latest snapshot) and state hash (the protocol's read-only 'hash' request). */
async function dishState(page: Page): Promise<{ dishId: string; tick: number; hash: string }> {
  return page.evaluate(async (protocolVersion) => {
    const pm = (window as unknown as { __pm: WorkerWatch }).__pm;
    const worker = pm.workers[pm.workers.length - 1];
    const dishId = pm.dishId;
    if (!worker || !dishId) throw new Error('no worker or dish yet');
    const requestId = pm.next++;
    const hash = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no hash reply')), 15_000);
      const on = (e: MessageEvent<{ type: string; requestId?: number; hash?: string; message?: string }>) => {
        if (e.data?.requestId !== requestId) return;
        worker.removeEventListener('message', on);
        clearTimeout(timer);
        if (e.data.type === 'hash' && e.data.hash) resolve(e.data.hash);
        else reject(new Error(e.data.message ?? e.data.type));
      };
      worker.addEventListener('message', on);
      worker.postMessage({ type: 'hash', requestId, dishId, protocolVersion });
    });
    return { dishId, tick: pm.ticks[dishId] ?? -1, hash };
  }, PROTOCOL_VERSION);
}

// ---------------------------------------------------------------------------------------------------------
// Real play

async function newContext(browser: Browser, dc: { viewport: { width: number; height: number }; deviceScaleFactor: number; hasTouch: boolean }, downloads = false): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: dc.viewport,
    deviceScaleFactor: dc.deviceScaleFactor,
    hasTouch: dc.hasTouch,
    serviceWorkers: 'block',
    acceptDownloads: downloads,
    reducedMotion: 'no-preference',
    colorScheme: 'light',
  });
  // tsx (esbuild keepNames) wraps named functions in the callbacks below with __name(); define it in the page.
  await ctx.addInitScript('globalThis.__name = globalThis.__name || ((f) => f);');
  await ctx.addInitScript(() => {
    if (localStorage.getItem('pixelmeba.settings') === null) localStorage.setItem('pixelmeba.settings', JSON.stringify({ showPrompts: false, showPerformance: false }));
  });
  await watchWorker(ctx);
  return ctx;
}

async function startGarden(page: Page, url: string, steps: string[]): Promise<void> {
  await page.goto(url);
  await (await shown(page.getByTestId('home-play'))).click();
  await (await shown(page.getByTestId('start-garden'))).click();
  await shown(page.getByTestId('dish-screen'));
  await until('56 alive', () => page.getByTestId('sim-time').innerText(), (t) => t.includes('56 alive'));
  steps.push(`Home → Play → ${GARDEN.name} (${GARDEN.recipe}); 0:00 · 56 alive`);
}

async function chooseSpeed(page: Page, speed: 1 | 2 | 4): Promise<void> {
  const cycle = page.getByRole('button', { name: /^Speed \d×, tap to change$/ });
  if (await cycle.isVisible()) {
    for (let i = 0; i < 3 && (await cycle.getAttribute('aria-label')) !== `Speed ${speed}×, tap to change`; i++) await cycle.click();
    await until(`speed ${speed}`, () => cycle.getAttribute('aria-label'), (l) => l === `Speed ${speed}×, tap to change`);
  } else {
    const b = page.getByRole('group', { name: 'Speed' }).getByRole('button', { name: `${speed}×` });
    await b.click();
    await until(`speed ${speed}`, () => b.getAttribute('aria-pressed'), (v) => v === 'true');
  }
}

async function setRunning(page: Page, running: boolean): Promise<void> {
  const t = page.getByTestId('run-toggle');
  const want = running ? 'Pause' : 'Run';
  if ((await t.getAttribute('aria-label')) !== want) await t.click();
  await until(`run toggle ${want}`, () => t.getAttribute('aria-label'), (l) => l === want);
}

/** Close what may take the notice place on its own (a story notice after 60 s, a discovery card). */
async function clearNotices(page: Page, steps: string[]): Promise<void> {
  const story = await page.evaluate(() => {
    const n = document.querySelector('[data-testid="story-notice"]');
    if (!n) return null;
    const t = n.querySelector('p')?.textContent ?? '';
    n.querySelector<HTMLButtonElement>('button[aria-label="Dismiss this notice"]')?.click();
    return t;
  });
  if (story !== null) steps.push(`dismissed the story notice “${story}”`);
  const disc = page.getByTestId('discovery-dismiss');
  if (await disc.isVisible()) {
    await disc.click();
    steps.push('dismissed a discovery card');
  }
}

async function wholeDish(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Whole dish' }).first().click();
}

/** The screen point of dish position `cell` at the whole-dish zoom (src/render/camera.ts fit: radius 62 cells about 64, 64). */
async function screenAtWholeDish(page: Page, cell: readonly [number, number]): Promise<{ x: number; y: number }> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  return { x: box.x + box.width / 2 + (cell[0] - 64) * zoom, y: box.y + box.height / 2 + (cell[1] - 64) * zoom };
}

/** Drag the dish (Look: a drag pans) so that the point under `pt` moves to the viewport's centre. Returns the centre. */
async function centreOn(page: Page, pt: { x: number; y: number }): Promise<{ x: number; y: number }> {
  const vb = await page.getByTestId('viewport').boundingBox();
  if (!vb) throw new Error('no viewport');
  const c = { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 };
  // One move event: src/ui/gestures.ts pans by each event's delta only once the pointer has left the tap slop,
  // so a move split into small steps would lose its first few pixels.
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.move(c.x, c.y, { steps: 1 });
  await page.mouse.up();
  await settle(page);
  return c;
}

/** The player's Zoom in button, `n` times (×1.6 each about the viewport's centre; 220 ms easing each). */
async function zoomIn(page: Page, n: number): Promise<number> {
  for (let i = 0; i < n; i++) {
    await page.getByRole('button', { name: 'Zoom in' }).first().click();
    await page.waitForTimeout(350);
  }
  await settle(page);
  return 1.6 ** n;
}

/**
 * When `pt` lies under `cover` (a sheet or the inspector), drag the dish (Look: a drag pans) so that `pt` sits in
 * the middle of the dish area left above the cover. Returns the new point.
 */
async function panOutFrom(page: Page, pt: { x: number; y: number }, cb: { x: number; y: number; width: number; height: number } | null): Promise<{ x: number; y: number }> {
  const vb = await page.getByTestId('viewport').boundingBox();
  if (!vb || !cb) return pt;
  const covered = pt.x >= cb.x && pt.x <= cb.x + cb.width && pt.y >= cb.y && pt.y <= cb.y + cb.height;
  if (!covered || cb.y <= vb.y + 40) return pt;
  const target = { x: vb.x + vb.width / 2, y: vb.y + (cb.y - vb.y) / 2 };
  // Start the drag in the open part of the dish and move by the needed offset in small steps.
  const start = { x: target.x, y: Math.max(vb.y + 8, cb.y - 12) };
  const dx = target.x - pt.x;
  const dy = target.y - pt.y;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 1 });
  await page.mouse.up();
  await settle(page);
  return target;
}

/** Let the renderer draw a few frames of what is on screen. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r())))));
  await page.waitForTimeout(400);
}

async function capture(page: Page, dc: DeviceClass, rel: string, write: SessionOptions['write']): Promise<{ size: [number, number]; sha: string }> {
  await settle(page);
  const raw = await page.screenshot({ type: 'png', animations: 'allow', caret: 'hide', scale: 'device' });
  const { bytes, w, h } = toOpaqueRgbPng(raw, rel);
  const want = [dc.viewport.width * dc.deviceScaleFactor, dc.viewport.height * dc.deviceScaleFactor];
  if (w !== want[0] || h !== want[1]) throw new Error(`${rel}: ${w}x${h}, expected ${want[0]}x${want[1]}`);
  write(rel, bytes);
  return { size: [w, h], sha: sha256(bytes) };
}

/** An active organism (not resting) to inspect: of those within 40 cells of the centre, the one farthest from its nearest neighbour (one tap selects it). */
async function loneOrganism(page: Page): Promise<[number, number]> {
  const ents = await page.evaluate(() => (window as unknown as { __pm: WorkerWatch }).__pm.ents);
  const pts: [number, number][] = [];
  for (let i = 0; i + ENT_STRIDE <= ents.length; i += ENT_STRIDE) if (ents[i + E_LIFE] === 0) pts.push([ents[i + E_X]!, ents[i + E_Y]!]);
  let best: [number, number] | null = null;
  let bestGap = -1;
  for (const p of pts) {
    if (Math.hypot(p[0] - 64, p[1] - 64) > 40) continue;
    let gap = Infinity;
    for (const q of pts) if (q !== p) gap = Math.min(gap, Math.hypot(p[0] - q[0], p[1] - q[1]));
    if (gap > bestGap) {
      bestGap = gap;
      best = p;
    }
  }
  if (!best) throw new Error('no organism within 40 cells of the centre');
  return best;
}

/** Tap the organism at screen point `pt` (Look); picks the first candidate if the tap is ambiguous. Returns the inspector's heading. */
async function inspectAt(page: Page, pt: { x: number; y: number }): Promise<string> {
  const heading = page.getByTestId('inspector').getByRole('heading', { level: 2 });
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  for (const [dx, dy] of [
    [0, 0],
    [3, 0],
    [-3, 0],
    [0, 3],
    [0, -3],
  ] as const) {
    await page.mouse.click(pt.x + dx, pt.y + dy);
    await until('the inspector or a choice', async () => (await list.isVisible()) || (await heading.isVisible()), (v) => v, 10_000);
    if (await list.isVisible()) await list.getByRole('option').first().click();
    await shown(heading);
    const text = await heading.innerText();
    if (/#\d+/.test(text)) return text;
    await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click();
  }
  throw new Error(`no organism at ${pt.x}, ${pt.y}`);
}

function record(dc: DeviceClass, topic: (typeof TOPICS)[number], file: string, shot: { size: [number, number]; sha: string }, commit: string, src: Pick<ShotRecord, 'recipe' | 'saveFile' | 'seed' | 'tick' | 'stateHash'>, steps: readonly string[]): ShotRecord {
  return {
    topic: `${topic.n} ${topic.id}`,
    file,
    size: shot.size,
    viewport: dc.viewport,
    deviceScaleFactor: dc.deviceScaleFactor,
    deviceClass: dc.id,
    buildCommit: commit,
    ...src,
    shows: topic.shows,
    steps: [...steps],
    sha256: shot.sha,
  };
}

const want = (o: SessionOptions, n: string): boolean => o.topics === null || o.topics.includes(n);

/** 01 living dish, 02 simple actions, 04 inspection, 03 What if? — one Garden, played in that order. */
async function gardenTopics(browser: Browser, url: string, dc: DeviceClass, o: SessionOptions): Promise<ShotRecord[]> {
  const out: ShotRecord[] = [];
  const seed = recipeSeed(o.root, GARDEN.recipe);
  const ctx = await newContext(browser, { ...dc, hasTouch: true });
  try {
    const page = await ctx.newPage();
    const steps: string[] = [];
    await startGarden(page, url, steps);
    await setRunning(page, true);
    await chooseSpeed(page, 4); // the speed control shows while the dish runs
    await until('1:30 of dish time', () => simSeconds(page), (s) => s >= 90, 300_000);
    await setRunning(page, false);
    await clearNotices(page, steps);
    const look = page.getByTestId('action-look');
    if ((await look.getAttribute('aria-pressed')) !== 'true') await look.click();
    await wholeDish(page);
    await settle(page);
    let st = await dishState(page);
    // Centre the busiest 16-cell square (a drag) and press Zoom in twice, so the organisms read at phone size.
    const busy = busiestPoint(await page.evaluate(() => (window as unknown as { __pm: WorkerWatch }).__pm.ents));
    const busyPt = await centreOn(page, await screenAtWholeDish(page, busy));
    const z1 = await zoomIn(page, 2);
    steps.push(`speed 4×, Run until the clock passed 1:30, Pause (tick ${st.tick}); Look; Whole dish; dragged the busiest 16-cell square (cell ${busy[0].toFixed(1)}, ${busy[1].toFixed(1)}) to the centre; Zoom in twice (×${z1.toFixed(2)})`);
    const garden = { recipe: GARDEN.recipe, saveFile: null, seed };
    const dir = `store/screenshots/${dc.id}`;
    if (want(o, '01')) {
      const f = `${dir}/01-living-dish.png`;
      out.push(record(dc, TOPICS[0], f, await capture(page, dc, f, o.write), o.commit, { ...garden, tick: st.tick, stateHash: st.hash }, steps));
      o.log(`  ${f} (tick ${st.tick})`);
    }

    // 02: the Feed tray open while the dish runs at 4× (the capture's tick is the snapshot on screen).
    if (want(o, '02')) {
      // Where the tray will cover the dish: open it once, and drag the busy part of the dish above it.
      await page.getByTestId('action-feed').click();
      const tray = page.locator('section.sheet', { has: page.getByTestId('feed-choose') });
      await shown(tray);
      const trayBox = await tray.boundingBox();
      await page.getByTestId('action-feed').click();
      await tray.waitFor({ state: 'detached' });
      await panOutFrom(page, busyPt, trayBox);
      await setRunning(page, true);
      await chooseSpeed(page, 4);
      await page.getByTestId('action-feed').click();
      await shown(tray);
      const f = `${dir}/02-simple-actions.png`;
      const shot = await capture(page, dc, f, o.write);
      const running = await dishState(page);
      await page.getByTestId('action-feed').click();
      await setRunning(page, false);
      st = await dishState(page);
      out.push(
        record(dc, TOPICS[1], f, shot, o.commit, { ...garden, tick: running.tick, stateHash: null }, [
          ...steps,
          `Run at 4×, Feed: the tray opened over the running dish; captured while running (the snapshot on screen at about tick ${running.tick}; a running dish has no single hash)`,
          `Feed again to close the tray; Pause (tick ${st.tick})`,
        ]),
      );
      steps.push(`Run at 4×, Feed (tray opened and closed), Pause (tick ${st.tick})`);
      o.log(`  ${f} (running, ≈ tick ${running.tick})`);
    }

    // 04: inspect one organism (paused), then zoom ×3 about it (and drag it out from under the inspector).
    if (want(o, '04')) {
      await clearNotices(page, steps);
      const at = await loneOrganism(page);
      await wholeDish(page);
      await settle(page);
      const centre = await centreOn(page, await screenAtWholeDish(page, at));
      const z4 = await zoomIn(page, 2);
      const name = await inspectAt(page, centre);
      const insp = page.getByTestId('inspector');
      await until('the constraint line', () => insp.getByTestId('constraint').innerText(), (t) => t.trim() !== '');
      await settle(page);
      // The heading at the top of the inspector; when the constraint line is then below the fold (a phone), the
      // player's Collapse leaves exactly the heading and the constraint line (UX §4.1).
      await insp.getByRole('heading', { level: 2 }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
      const constraintShown = await insp.evaluate((sheet) => {
        const c = sheet.querySelector('[data-testid="constraint"]')!.getBoundingClientRect();
        const s = sheet.getBoundingClientRect();
        return c.top >= s.top && c.bottom <= Math.min(s.bottom, window.innerHeight);
      });
      let collapsedNote = '';
      if (!constraintShown) {
        await insp.getByTestId('inspector-collapse').click();
        await settle(page);
        collapsedNote = '; Collapse inspector (the heading and the constraint line)';
      }
      st = await dishState(page);
      const f = `${dir}/04-inspection.png`;
      out.push(
        record(dc, TOPICS[3], f, await capture(page, dc, f, o.write), o.commit, { ...garden, tick: st.tick, stateHash: st.hash }, [
          ...steps,
          `Whole dish; dragged the active organism farthest from its neighbours within 40 cells of the centre, at (${at[0].toFixed(1)}, ${at[1].toFixed(1)}), to the centre; Zoom in twice (×${z4.toFixed(2)}); tapped it: “${name}” (the inspector keeps it in view above itself)${collapsedNote}; its constraint line shown`,
        ]),
      );
      o.log(`  ${f} (${name})`);
      await insp.getByRole('button', { name: 'Close' }).click();
    }

    // 03: What if? from the dish, R-G3 chosen (choosing is not starting; the dish is unchanged).
    if (want(o, '03')) {
      await page.getByTestId('more').click();
      const item = await shown(page.getByTestId('more-whatif'));
      await item.scrollIntoViewIfNeeded();
      await item.click();
      await shown(page.getByTestId('whatif-sheet'));
      await page.getByTestId('whatif-choice-R-G3').click();
      await shown(page.getByTestId('whatif-preview'));
      // A tall screen shows the whole chosen card above its preview; a phone starts at the chosen idea's question.
      const tall = dc.viewport.height >= 1000;
      await page.getByTestId(tall ? 'whatif-choice-R-G3' : 'whatif-selected').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      st = await dishState(page);
      const f = `${dir}/03-what-if.png`;
      out.push(
        record(dc, TOPICS[2], f, await capture(page, dc, f, o.write), o.commit, { ...garden, tick: st.tick, stateHash: st.hash }, [
          ...steps,
          'More → What if? → “Dinner farther away” (R-G3) chosen (not started); its before/after preview',
        ]),
      );
      o.log(`  ${f}`);
      await page.getByTestId('whatif-close').click();
    }
  } finally {
    await ctx.close();
  }
  return out;
}

/**
 * The branch topic 05 shows, checked in the saved run itself: established (≥ 5 qualifying members alive, ≥ 3
 * generations beyond its root), not extinct, its trait a gained ability; and one living member to tap (of its
 * members, the one farthest from any other organism, so one tap reaches it).
 */
export async function inheritedBranch(root: string): Promise<{
  id: number;
  shortId: string;
  seed: number;
  tick: number;
  establishedTick: number;
  trait: string;
  membersAtEstablish: number | null;
  depthAtEstablish: number | null;
  alive: number;
  member: { birthId: number; x: number; y: number };
  memberIds: number[];
}> {
  const text = gunzipSync(readFileSync(join(root, INHERITED_SAVE))).toString('utf8');
  const { world } = await loadSaveFile(text);
  const br = world.branches.branches.find((b) => b.extinctTick < 0 && b.establishedTick >= 0 && b.trait?.kind === INHERITED_BRANCH_TRAIT);
  if (!br) throw new Error(`${INHERITED_SAVE}: no living established branch whose trait is a ${INHERITED_BRANCH_TRAIT}`);
  const c = world.ents.cols;
  const all: { slot: number; x: number; y: number }[] = [];
  for (let slot = 0; slot < world.ents.capacity; slot++) if (c.alive[slot]) all.push({ slot, x: c.x[slot]!, y: c.y[slot]! });
  let member: { birthId: number; x: number; y: number } | null = null;
  let bestGap = -1;
  const memberIds: number[] = [];
  for (const e of all) {
    if (c.branchId[e.slot] !== br.id) continue;
    memberIds.push(c.birthId[e.slot]!);
    let gap = Infinity;
    for (const q of all) if (q.slot !== e.slot) gap = Math.min(gap, Math.hypot(e.x - q.x, e.y - q.y));
    if (gap > bestGap) {
      bestGap = gap;
      member = { birthId: c.birthId[e.slot]!, x: e.x, y: e.y };
    }
  }
  if (!member) throw new Error(`branch ${br.shortId} has no living member in the save`);
  return {
    id: br.id,
    shortId: br.shortId,
    seed: world.seed,
    tick: world.tick,
    establishedTick: br.establishedTick,
    trait: JSON.stringify(br.trait),
    membersAtEstablish: br.membersAtEstablish ?? null,
    depthAtEstablish: br.depthAtEstablish ?? null,
    alive: br.alive,
    member,
    memberIds,
  };
}

/**
 * 05: the saved run imported; a member of the branch tapped (zoomed in first so the tap is exact) → its
 * inspector → Family → Family tree, which opens on its branch → Compare with ancestor.
 */
async function inheritedTopic(browser: Browser, url: string, dc: DeviceClass, o: SessionOptions): Promise<ShotRecord> {
  const br = await inheritedBranch(o.root);
  const tmpDir = join(o.root, 'tmp', 'store-shots');
  mkdirSync(tmpDir, { recursive: true });
  const file = join(tmpDir, 'first-dish-accelerated-varied-t6000.pixelmeba');
  writeFileSync(file, gunzipSync(readFileSync(join(o.root, INHERITED_SAVE))));
  const ctx = await newContext(browser, { ...dc, hasTouch: true });
  try {
    const page = await ctx.newPage();
    const steps: string[] = [
      `the saved run ${INHERITED_SAVE} (FIRST_DISH_V1, Accelerated evolution, varied founders, seed ${br.seed}, tick ${br.tick}); branch ${br.shortId} established at tick ${br.establishedTick} (${br.membersAtEstablish ?? '?'} qualifying members alive, ${br.depthAtEstablish ?? '?'} generations beyond its root), trait ${br.trait}, ${br.alive} alive in the save`,
    ];
    await page.goto(url);
    await (await shown(page.getByRole('button', { name: 'Saved dishes' }))).click();
    await page.locator('input[aria-label="Import a dish file"]').setInputFiles(file);
    await shown(page.getByTestId('dish-screen'), 120_000);
    await until('paused', () => page.getByTestId('run-toggle').getAttribute('aria-label'), (l) => l === 'Run');
    const st = await dishState(page);
    if (st.tick !== br.tick) throw new Error(`the imported dish is at tick ${st.tick}, the save at ${br.tick}`);
    steps.push('Home → Saved dishes → Import a dish file (the save, un-gzipped): the dish opens paused');
    // The save's own name is the test fixture's ("g2 Little Living Garden …"); name it as a player would, by
    // saving it to a slot under a new name (a slot pointer, never the world: the hash is checked below).
    await page.getByTestId('more').click();
    await (await shown(page.getByTestId('more-save'))).click();
    await page.getByRole('textbox', { name: 'Name' }).fill(SAVE_NAME);
    const confirm = await shown(page.getByTestId('save-confirm'));
    await until('a free slot', () => confirm.isEnabled(), (v) => v);
    await confirm.click();
    await until('the new name', () => page.locator('.topbar .title strong').innerText(), (t) => t.trim() === SAVE_NAME, 60_000);
    steps.push(`More → Save… → Name “${SAVE_NAME}” → Slot 1 → Save`);
    await wholeDish(page);
    await settle(page);
    const pt = await centreOn(page, await screenAtWholeDish(page, [br.member.x, br.member.y]));
    const z5 = await zoomIn(page, 3);
    // Tap it; when the tap is ambiguous choose a member of the branch; when another organism answers, close it and
    // tap a little to the side.
    const heading = page.getByTestId('inspector').getByRole('heading', { level: 2 });
    const list = page.getByRole('listbox', { name: 'Choose an organism' });
    const isMember = (t: string): boolean => br.memberIds.includes(Number(/#(\d+)/.exec(t)?.[1] ?? -1));
    let found = false;
    for (const [dx, dy] of [
      [0, 0],
      [4, 0],
      [-4, 0],
      [0, 4],
      [0, -4],
      [8, 0],
      [-8, 0],
    ] as const) {
      await page.mouse.click(pt.x + dx, pt.y + dy);
      await until('the inspector or a choice', async () => (await list.isVisible()) || (await heading.isVisible()), (v) => v, 15_000);
      o.log(`    tap (${dx}, ${dy}): ${(await list.isVisible()) ? `choice of ${(await list.getByRole('option').allInnerTexts()).join(', ')}` : await heading.innerText()}`);
      if (await list.isVisible()) {
        const options = await list.getByRole('option').allInnerTexts();
        const pick = options.findIndex(isMember);
        await list.getByRole('option').nth(pick >= 0 ? pick : 0).click();
      }
      await shown(heading);
      if (isMember(await heading.innerText())) {
        found = true;
        break;
      }
      await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click();
    }
    if (!found) {
      await page.screenshot({ path: join(tmpDir, `fail-05-${dc.id}.png`) });
      throw new Error(`no member of ${br.shortId} answered a tap near (${br.member.x}, ${br.member.y}); see tmp/store-shots/fail-05-${dc.id}.png`);
    }
    const who = await heading.innerText();
    await (await shown(page.getByTestId('shortcut-family'))).click();
    const open = await shown(page.getByTestId('open-lineage'), 60_000);
    await open.scrollIntoViewIfNeeded();
    await open.click();
    await shown(page.getByTestId('lineage'));
    await until('the branch', () => page.getByTestId('lineage-name').innerText(), (t) => t.includes(br.shortId), 180_000);
    const state = await page.getByTestId('lineage-state').innerText();
    if (state.trim() !== 'Branch established') throw new Error(`branch ${br.shortId} shows “${state}”`);
    const cmp = page.getByTestId('lineage-compare');
    if ((await cmp.getAttribute('aria-expanded')) !== 'true') await cmp.click();
    await shown(page.getByTestId('lineage-compare-table'));
    await page.getByTestId('lineage-name').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    const name = await page.getByTestId('lineage-name').innerText();
    steps.push(`Whole dish; dragged a member of ${br.shortId}, at (${br.member.x.toFixed(1)}, ${br.member.y.toFixed(1)}), to the centre; Zoom in three times (×${z5.toFixed(2)}); tapped it: “${who}”; Family → Family tree (opens on its branch “${name}”, Branch established) → Compare with ancestor`);
    const after = await dishState(page);
    if (after.hash !== st.hash) throw new Error('looking changed the world');
    const f = `store/screenshots/${dc.id}/05-inherited-change.png`;
    const shot = await capture(page, dc, f, o.write);
    o.log(`  ${f} (${name})`);
    return record(dc, TOPICS[4], f, shot, o.commit, { recipe: GARDEN.recipe, saveFile: INHERITED_SAVE, seed: br.seed, tick: st.tick, stateHash: st.hash }, steps);
  } finally {
    await ctx.close();
  }
}

/** 06: Notebook → Experiments → Experiment A → Start → Run A and B at the fastest pace → the results. */
async function experimentTopic(browser: Browser, url: string, dc: DeviceClass, o: SessionOptions): Promise<ShotRecord> {
  const ctx = await newContext(browser, { ...dc, hasTouch: true });
  try {
    const page = await ctx.newPage();
    const steps: string[] = [];
    await page.goto(url);
    await (await shown(page.getByTestId('home-notebook'))).click();
    await (await shown(page.getByTestId('notebook-tab-experiments'))).click();
    const card = await shown(page.getByTestId(`experiment-card-${EXP.id}`));
    await card.scrollIntoViewIfNeeded();
    await card.click();
    const start = await shown(page.getByTestId('experiment-start'));
    await start.scrollIntoViewIfNeeded();
    await start.click();
    const screen = page.getByTestId('experiment-run-screen');
    await until('the paired run setup', () => screen.getAttribute('data-status'), (s) => s === 'setup');
    const run = await shown(page.getByTestId('experiment-run'));
    const runLabel = await run.innerText();
    await run.scrollIntoViewIfNeeded();
    await run.click();
    steps.push(`Home → Notebook → Experiments → ${EXP.id} “What unlocks starch” → Start → “${runLabel}” (no prediction written)`);
    const fast = page.getByTestId('experiment-speed-max');
    if (await fast.isVisible()) {
      await fast.click();
      steps.push('the fastest pace');
    }
    await until('the results', () => screen.getAttribute('data-status'), (s) => s === 'complete', 600_000);
    // A phone shows one copy at a time: show A, the copy as written (B is the one without the starch).
    const showA = page.getByTestId('experiment-show-A');
    if (await showA.isVisible()) {
      await showA.click();
      steps.push('A (the copy as written) shown');
    }
    const title = await shown(page.getByTestId('experiment-results-title'));
    await title.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    // One idea per shot (D09 §11): let the journal-stamp toast clear before the capture.
    await page.locator('.toast').first().waitFor({ state: 'hidden', timeout: 30_000 });
    const ticks = await page.evaluate(() => (window as unknown as { __pm: WorkerWatch }).__pm.ticks);
    const runTicks = Object.values(ticks);
    const tick = runTicks.length > 0 ? Math.max(...runTicks) : null;
    steps.push(`both copies ran to their stopping point (snapshot ticks by dish: ${JSON.stringify(ticks)}); the results scrolled into view`);
    const f = `store/screenshots/${dc.id}/06-experiment.png`;
    const shot = await capture(page, dc, f, o.write);
    o.log(`  ${f} (tick ${tick})`);
    return record(dc, TOPICS[5], f, shot, o.commit, { recipe: EXP.recipe, saveFile: null, seed: recipeSeed(o.root, EXP.recipe), tick, stateHash: null }, steps);
  } finally {
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------------------------------------
// The feature graphic

/** The integer scale the picture's pixels are drawn at on the graphic (7 px per cell → 14). */
export const FEATURE_SCALE = 2;

/**
 * Where the organisms are: the 16-cell square holding the most living organisms (ties: the first in row order),
 * then the mean position of the organisms within 16 cells of its centre (cells).
 */
export function busiestPoint(ents: readonly number[]): [number, number] {
  const pts: [number, number][] = [];
  for (let i = 0; i + ENT_STRIDE <= ents.length; i += ENT_STRIDE) pts.push([ents[i + E_X]!, ents[i + E_Y]!]);
  if (pts.length === 0) throw new Error('no organisms in the snapshot');
  const counts = new Map<number, number>();
  for (const [x, y] of pts) {
    const k = Math.floor(y / 16) * 8 + Math.floor(x / 16);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = -1;
  let bestN = -1;
  for (let k = 0; k < 64; k++) if ((counts.get(k) ?? 0) > bestN) [best, bestN] = [k, counts.get(k) ?? 0];
  const c: [number, number] = [(best % 8) * 16 + 8, Math.floor(best / 8) * 16 + 8];
  const near = pts.filter(([x, y]) => Math.hypot(x - c[0], y - c[1]) <= 16);
  return [near.reduce((a, p) => a + p[0], 0) / near.length, near.reduce((a, p) => a + p[1], 0) / near.length];
}

/** The picture's source rectangle (drawn at FEATURE_SCALE) centred on `at` (cells), and where it lands on the 1024 × 500 graphic. */
export function featureLayout(centre: readonly [number, number]): { crop: { x: number; y: number; w: number; h: number }; at: { x: number; y: number }; scale: number } {
  const outW = 560;
  const outH = 500;
  const w = outW / FEATURE_SCALE;
  const h = outH / FEATURE_SCALE;
  const px = PICTURE_DISH_X + centre[0] * PICTURE_CELL_PX;
  const py = PICTURE_DISH_Y + centre[1] * PICTURE_CELL_PX;
  const x = Math.min(PICTURE_PX - w, Math.max(0, Math.round(px - w / 2)));
  const y = Math.min(PICTURE_PX - h, Math.max(0, Math.round(py - h / 2)));
  return { crop: { x, y, w, h }, at: { x: 1024 - outW, y: 0 }, scale: FEATURE_SCALE };
}

async function featureGraphic(browser: Browser, url: string, o: SessionOptions): Promise<FeatureRecord> {
  const seed = recipeSeed(o.root, GARDEN.recipe);
  const ctx = await newContext(browser, { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: false }, true);
  try {
    const page = await ctx.newPage();
    const steps: string[] = [];
    await startGarden(page, url, steps);
    await setRunning(page, true);
    await chooseSpeed(page, 4); // the speed control shows while the dish runs
    await until('2:00 of dish time', () => simSeconds(page), (s) => s >= 120, 300_000);
    await setRunning(page, false);
    await clearNotices(page, steps);
    const st = await dishState(page);
    const centre = busiestPoint(await page.evaluate(() => (window as unknown as { __pm: WorkerWatch }).__pm.ents));
    steps.push(`speed 4×, Run until the clock passed 2:00, Pause (tick ${st.tick})`);
    await page.getByTestId('more').click();
    await (await shown(page.getByTestId('more-share'))).click();
    await shown(page.getByTestId('share-sheet'));
    await page.getByTestId('share-hide-labels').check();
    const download = page.waitForEvent('download');
    await page.getByTestId('share-go').click();
    const d = await download;
    const path = await d.path();
    const picture = readFileSync(path);
    const after = await dishState(page);
    if (after.hash !== st.hash) throw new Error('the share changed the world');
    steps.push(`More → Share… → Picture, Hide labels → Share: saved ${d.suggestedFilename()} (the D-0080 picture of this snapshot)`);
    const pic = PNG.sync.read(picture);
    o.write(FEATURE_PICTURE_FILE, picture);
    const { crop, at, scale } = featureLayout(centre);

    const comp = await ctx.newPage();
    await comp.setViewportSize({ width: 1024, height: 500 });
    await comp.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><canvas id="c" width="1024" height="500"></canvas></body>');
    const dataUrl = await comp.evaluate(
      async ({ src, crop, at, scale, text, colours }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.getElementById('c') as HTMLCanvasElement;
        const g = c.getContext('2d')!;
        g.imageSmoothingEnabled = false;
        g.fillStyle = colours.outside;
        g.fillRect(0, 0, 1024, 500);
        // The real picture at an integer scale, nearest neighbour (no smoothing, no resampling between pixels).
        g.drawImage(img, crop.x, crop.y, crop.w, crop.h, at.x, at.y, crop.w * scale, crop.h * scale);
        g.fillStyle = colours.rim;
        g.fillRect(at.x - 6, 0, 6, 500);
        const font = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
        g.textBaseline = 'alphabetic';
        g.fillStyle = colours.word;
        g.font = `700 66px ${font}`;
        g.fillText(text[0], 48, 196, at.x - 80);
        g.fillStyle = colours.accent;
        g.fillRect(52, 222, 64, 6);
        g.fillStyle = colours.line;
        g.font = `500 30px ${font}`;
        for (let i = 1; i < text.length; i++) g.fillText(text[i]!, 48, 236 + 46 * i, at.x - 80);
        return c.toDataURL('image/png');
      },
      { src: `data:image/png;base64,${picture.toString('base64')}`, crop, at, scale, text: FEATURE_TEXT, colours: { outside: P.outside, word: P.surface, line: P.waterLight, accent: P.sunbeadGold, rim: P.rim } },
    );
    await comp.close();
    const { bytes, w, h } = toOpaqueRgbPng(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'), FEATURE_FILE);
    if (w !== 1024 || h !== 500) throw new Error(`feature graphic ${w}x${h}`);
    o.write(FEATURE_FILE, bytes);
    o.log(`  ${FEATURE_FILE} (tick ${st.tick})`);
    return {
      file: FEATURE_FILE,
      size: [w, h],
      buildCommit: o.commit,
      recipe: GARDEN.recipe,
      seed,
      tick: st.tick,
      stateHash: st.hash,
      picture: { file: FEATURE_PICTURE_FILE, size: [pic.width, pic.height], sha256: sha256(picture), crop, scale },
      text: [...FEATURE_TEXT],
      steps: [...steps, `composed: the surround ${P.outside}; the picture's pixels (${crop.x}, ${crop.y}) ${crop.w} × ${crop.h}, centred on the busiest 16-cell square's organisms (cell ${centre[0].toFixed(1)}, ${centre[1].toFixed(1)}), drawn at ×${scale} (nearest neighbour) at (${at.x}, ${at.y}); a ${P.rim} edge; the wordmark and the promise line`],
      sha256: sha256(bytes),
    };
  } finally {
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------------------------------------

export async function runStoreSession(o: SessionOptions): Promise<{ feature: FeatureRecord | null; shots: ShotRecord[] }> {
  const server = await serveStatic({ root: o.dist, port: o.port });
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const shots: ShotRecord[] = [];
  let feature: FeatureRecord | null = null;
  try {
    const url = `${server.url.replace(/\/?$/u, '/')}`;
    if (o.feature) {
      o.log('feature graphic …');
      feature = await featureGraphic(browser, url, o);
    }
    if (o.screenshots) {
      for (const dc of DEVICE_CLASSES) {
        if (o.classes !== null && !o.classes.includes(dc.id)) continue;
        o.log(`screenshots: ${dc.id} (${dc.viewport.width} × ${dc.viewport.height} at ${dc.deviceScaleFactor}×) …`);
        if (['01', '02', '03', '04'].some((n) => want(o, n))) shots.push(...(await gardenTopics(browser, url, dc, o)));
        if (want(o, '05')) shots.push(await inheritedTopic(browser, url, dc, o));
        if (want(o, '06')) shots.push(await experimentTopic(browser, url, dc, o));
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return { feature, shots };
}
