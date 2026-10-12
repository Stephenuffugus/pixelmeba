/**
 * P4.10 (BUILD_DIRECTIVE "storage/lifecycle tests run in a browser harness that simulates interruption";
 * D-0092): the web app built with VITE_FS_HARNESS=1 keeps its saves through the REAL worker ↔ main-thread
 * bridge and the REAL @capacitor/filesystem web implementation, the Android app's path. The harness's
 * `stopAfter(k)` makes the main thread stop answering file operations after k more (a killed process); a page
 * reload is the relaunch.
 *
 * - For every k up to the operation count of one save to Slot 1: the relaunch opens Slot 1 at exactly the
 *   moment it held before (when the cut came before the journal's rename to journal.json, the commit point)
 *   or exactly the new one (after it) — never an error, never a damaged save.
 * - A damaged current record: Slot 1 opens its previous copy and says so.
 * - Going to the background (visibilitychange hidden) pauses the dish, and Continue holds that moment after a
 *   reload.
 * - The normal build (tmp/dist-android, this run's E2E_OUTDIR) contains no "__fsHarness".
 */
import { expect, test, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fsIdOf, fsName } from '../../src/persistence/capacitorFs';
import { PROTOCOL_VERSION } from '../../src/worker/protocol';
import { expectNoSeriousA11yViolations, seedSettings, simSeconds } from './helpers';
import { serveStatic, type StaticServer } from './staticServer';

const ROOT = join(import.meta.dirname, '..', '..');
const HARNESS_DIR = 'tmp/dist-android-harness';
const HARNESS_PORT = 5281;
const COMMIT_POINT = 'rename pixelmeba/journal.tmp pixelmeba/journal.json';
const DAMAGED = 'The latest save was damaged, so the previous copy was opened.';

let server: StaticServer | null = null;

// The web Filesystem implementation stores in IndexedDB on the main thread; under SwiftShader each of its
// requests waits for a rendered frame, so one save takes many seconds here (on a phone it is native file I/O).
test.describe.configure({ mode: 'serial', timeout: 1_800_000 });
test.use({ baseURL: `http://127.0.0.1:${HARNESS_PORT}` });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  rmSync(join(ROOT, HARNESS_DIR), { recursive: true, force: true });
  const r = spawnSync('npx', ['vite', 'build', '--outDir', HARNESS_DIR, '--emptyOutDir'], { cwd: ROOT, env: { ...process.env, VITE_FS_HARNESS: '1' }, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`harness build failed: ${r.stderr}`);
  server = await serveStatic({ root: join(ROOT, HARNESS_DIR), mount: '/', port: HARNESS_PORT });
});

test.afterAll(async () => {
  await server?.close();
  server = null;
});

interface Pm {
  workers: Worker[];
  dishId: string | null;
  next: number;
}

/** Keep the app's worker and its open dish id reachable (the e2e app has no test hook). */
async function watchWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { Worker: typeof Worker; __pm: Pm };
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

/** Advance the paused open dish by `n` ticks through the protocol's 'step'. */
async function step(page: Page, n: number): Promise<void> {
  await page.evaluate(
    ({ n, protocolVersion }) => {
      const pm = (window as unknown as { __pm: Pm }).__pm;
      const worker = pm.workers[pm.workers.length - 1]!;
      for (let i = 0; i < n; i++) worker.postMessage({ type: 'step', dishId: pm.dishId, protocolVersion });
    },
    { n, protocolVersion: PROTOCOL_VERSION },
  );
}

/** Ask the worker to save the open dish to Slot 1 (resolves when it answers; never, once the host stopped). */
async function postSaveSlot1(page: Page, wait: boolean): Promise<void> {
  await page.evaluate(
    ({ wait, protocolVersion }) => {
      const pm = (window as unknown as { __pm: Pm }).__pm;
      const worker = pm.workers[pm.workers.length - 1]!;
      const requestId = pm.next++;
      const done = new Promise<void>((resolve, reject) => {
        const on = (e: MessageEvent<{ type: string; requestId?: number; message?: string }>) => {
          if (e.data?.requestId !== requestId) return;
          worker.removeEventListener('message', on);
          if (e.data.type === 'slotSaved') resolve();
          else reject(new Error(e.data.message ?? e.data.type));
        };
        worker.addEventListener('message', on);
      });
      worker.postMessage({ type: 'saveSlot', requestId, dishId: pm.dishId, slotId: 'slot1', name: 'Little Living Garden', protocolVersion });
      return wait ? done : undefined;
    },
    { wait, protocolVersion: PROTOCOL_VERSION },
  );
}

const harness = {
  ops: (page: Page) => page.evaluate(() => (window as unknown as { __fsHarness: { opsSoFar(): number } }).__fsHarness.opsSoFar()),
  log: (page: Page) => page.evaluate(() => (window as unknown as { __fsHarness: { log(): string[] } }).__fsHarness.log()),
  stopAfter: (page: Page, n: number) => page.evaluate((k) => (window as unknown as { __fsHarness: { stopAfter(n: number): void } }).__fsHarness.stopAfter(k), n),
  read: (page: Page, path: string) => page.evaluate((p) => (window as unknown as { __fsHarness: { read(p: string): Promise<string | null> } }).__fsHarness.read(p), path),
  corrupt: (page: Page, path: string) => page.evaluate((p) => (window as unknown as { __fsHarness: { corrupt(p: string): Promise<void> } }).__fsHarness.corrupt(p), path),
  idle: (page: Page) => page.evaluate(() => (window as unknown as { __fsHarness: { idle(): boolean } }).__fsHarness.idle()),
  files: (page: Page) => page.evaluate(() => (window as unknown as { __fsHarness: { files(): Promise<string[]> } }).__fsHarness.files()),
};

/**
 * Whether these answered operations include the commit point of a Slot 1 commit (an autosave may interleave:
 * the journal rename counts only after a record of slot 1 was written).
 */
function slot1Committed(answered: readonly string[]): boolean {
  let lastRecord: string | null = null;
  for (const l of answered) {
    const m = /^write pixelmeba\/records\/([a-z0-9_-]+)\.json\.tmp$/u.exec(l);
    if (m) lastRecord = fsIdOf(m[1]!);
    if (l === COMMIT_POINT && lastRecord?.startsWith('slot1:')) return true;
  }
  return false;
}

/** The dish screen's moment ("m:ss · N alive"). */
async function moment(page: Page): Promise<string> {
  return (await page.getByTestId('sim-time').innerText()).trim();
}

/** Step the paused dish until its shown moment changes; returns the new moment. */
async function newMoment(page: Page, from: string): Promise<string> {
  await step(page, 15);
  await expect.poll(() => moment(page), { timeout: 15_000 }).not.toBe(from);
  // The steps are all handled before the next request, so the moment shown settles here.
  await expect.poll(async () => {
    const a = await moment(page);
    await page.waitForTimeout(150);
    return a === (await moment(page));
  }).toBe(true);
  return moment(page);
}

/** Relaunch: reload the page, then Saved dishes → Slot 1 → Open. */
async function relaunchAndOpenSlot1(page: Page): Promise<string> {
  await page.reload();
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.locator('li[data-slot="slot1"]').getByRole('button', { name: 'Open' }).click({ timeout: 60_000 });
  await expect(page.getByTestId('dish-screen')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run'); // opened paused
  await expect.poll(() => page.evaluate(() => (window as unknown as { __pm: Pm }).__pm.dishId !== null)).toBe(true);
  return moment(page);
}

test('a save cut after any of its file operations relaunches to exactly the old or the new moment; a damaged record opens the previous copy; backgrounding pauses', async ({ page }) => {
  await watchWorker(page);
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByTestId('home-play').click();
  await page.getByTestId('start-garden').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('56 alive');
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __fsHarness?: unknown }).__fsHarness)).toBe('object');

  // Moment A: run a little, pause, save to Slot 1 through the UI.
  await page.getByTestId('run-toggle').click();
  await expect.poll(() => simSeconds(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const a = await moment(page);
  await page.getByTestId('more').click();
  await page.getByTestId('more-save').click();
  await page.getByTestId('save-confirm').click();
  await expect(page.getByRole('status').filter({ hasText: /Saved/ })).toBeVisible({ timeout: 120_000 });
  expect(await harness.files(page)).toContain('pixelmeba/slots/slot1.json');
  expect(await relaunchAndOpenSlot1(page)).toBe(a);

  // One uninterrupted save of a new moment: how many file operations it takes, and where its commit point is.
  const committed: string[] = [a];
  const m0 = await newMoment(page, a);
  await expect.poll(() => harness.idle(page), { timeout: 120_000 }).toBe(true);
  const before0 = await harness.ops(page);
  await postSaveSlot1(page, true);
  const one = (await harness.log(page)).slice(before0);
  const n = one.length;
  const commitAt = one.indexOf(COMMIT_POINT);
  expect(commitAt).toBeGreaterThan(0);
  expect(slot1Committed(one)).toBe(true);
  expect(n).toBeGreaterThan(commitAt);
  committed.push(m0);
  let held = m0;
  expect(await relaunchAndOpenSlot1(page)).toBe(held);

  // Every cut point of that save.
  const outcomes: string[] = [];
  for (let k = 0; k < n; k++) {
    const next = await newMoment(page, held);
    await expect.poll(() => harness.idle(page), { timeout: 120_000 }).toBe(true);
    const before = await harness.ops(page);
    await harness.stopAfter(page, k);
    await postSaveSlot1(page, false);
    await expect.poll(() => harness.ops(page), { timeout: 120_000 }).toBe(before + k);
    await page.waitForTimeout(1000); // nothing further runs: the process is "dead"
    expect(await harness.ops(page)).toBe(before + k);
    const answered = (await harness.log(page)).slice(before);
    const pastCommitPoint = slot1Committed(answered);
    // When nothing else wrote meanwhile, the cut lands exactly where the uninterrupted save put its commit point.
    if (answered.every((l, i) => l.replace(/records\/[a-z0-9_-]+/gu, 'R') === one[i]!.replace(/records\/[a-z0-9_-]+/gu, 'R'))) expect(pastCommitPoint).toBe(k > commitAt);
    const opened = await relaunchAndOpenSlot1(page);
    await expect(page.getByText(DAMAGED)).toHaveCount(0);
    const want = pastCommitPoint ? next : held;
    expect(opened, `cut after ${k} of ${n} operations`).toBe(want);
    outcomes.push(pastCommitPoint ? 'new' : 'old');
    if (pastCommitPoint) committed.push(next);
    held = want;
  }
  console.log(`android-storage: one save = ${n} file operations, commit point at operation ${commitAt}; cuts k=0..${n - 1} opened: ${outcomes.join(' ')}`);
  expect(outcomes.filter((o) => o === 'old').length).toBeGreaterThanOrEqual(commitAt);
  expect(outcomes).toContain('new');

  // A damaged current record: Slot 1 opens the previous copy and says so.
  const slot = JSON.parse((await harness.read(page, 'pixelmeba/slots/slot1.json'))!) as { current: string; previous: string | null };
  expect(slot.previous).not.toBeNull();
  await harness.corrupt(page, `pixelmeba/records/${fsName(slot.current)}.json`);
  const previous = committed[committed.length - 2]!;
  expect(await relaunchAndOpenSlot1(page)).toBe(previous);
  await expect(page.getByText(DAMAGED).first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Going to the background pauses the running dish and autosaves; Continue holds that moment after a reload.
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', /Pause/u);
  await page.waitForTimeout(1500);
  const opsBefore = await harness.ops(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const paused = await moment(page);
  await expect.poll(async () => (await harness.log(page)).slice(opsBefore).includes(COMMIT_POINT), { timeout: 120_000 }).toBe(true);
  await expect.poll(async () => (await harness.log(page)).slice(opsBefore).includes('remove pixelmeba/journal.json'), { timeout: 120_000 }).toBe(true);
  await page.waitForTimeout(500);
  expect(await moment(page)).toBe(paused); // no dish time passed while "away"
  await page.reload();
  await page.getByTestId('home-continue').click({ timeout: 60_000 });
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toHaveText(paused, { timeout: 60_000 });
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
});

test('the normal build contains no interruption harness', () => {
  const outdir = join(ROOT, process.env.E2E_OUTDIR ?? 'dist');
  const assets = join(outdir, 'assets');
  expect(existsSync(assets), `${assets} (built by the Playwright webServer)`).toBe(true);
  const js = readdirSync(assets).filter((f) => f.endsWith('.js'));
  expect(js.length).toBeGreaterThan(0);
  for (const f of js) expect(readFileSync(join(assets, f), 'utf8').includes('__fsHarness'), f).toBe(false);
  expect(readFileSync(join(outdir, 'index.html'), 'utf8').includes('__fsHarness')).toBe(false);
  // The harness build does contain it (so the check above can fail).
  const harnessJs = readdirSync(join(ROOT, HARNESS_DIR, 'assets')).filter((f) => f.endsWith('.js'));
  expect(harnessJs.some((f) => readFileSync(join(ROOT, HARNESS_DIR, 'assets', f), 'utf8').includes('__fsHarness'))).toBe(true);
});
