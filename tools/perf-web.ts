/**
 * Web-build performance run (P4.13; BUILD_DIRECTIVE "Profile dense Garden + wave E1 on the web build …
 * heat/memory over 15 min"; SPEC §16; ARCH §13).
 *
 *   npx tsx tools/perf-web.ts [--out file.json] [--garden-minutes 15] [--stress-1x-minutes 5]
 *       [--stress-4x-minutes 2] [--taps 20] [--stress-save file.pixelmeba] [--viewport 360x800]
 *       [--skip-garden] [--skip-stress] [--skip-taps] [--no-build] [--gc]
 *
 * Builds the production web app into tmp/dist-perf, serves it with `vite preview` on PERF_WEB_PORT (5282),
 * and drives Playwright Chromium with the same SwiftShader flags as playwright.config.ts. Settings → "Show
 * performance numbers" is on, so every reading comes from the app's own diagnostics bar (data-testid
 * diag-*) and nothing is measured that the app does not show:
 *   (a) the dense Garden: FIRST_DISH_V1 at 4× for --garden-minutes real minutes, sampled every 10 s: tick
 *       p50/p95, effective speed, snapshot ms, fps, the main thread's heap (performance.memory), the
 *       worker's heap (CDP Runtime.getHeapUsage on the worker target, through a browser CDP session), and
 *       the browser processes' CPU time per minute (ps, the launched browser's process tree) as the heat
 *       proxy;
 *   (b) wave E1 dense: tools/perf-stress.ts --save-out (6,000 agents, 2,000 fungal) imported through
 *       Saved dishes → Import file, then --stress-1x-minutes at 1× and --stress-4x-minutes at 4×;
 *   (c) touch feedback: --taps Feed taps on the running Garden at 1×; latency = the first animation frame
 *       after the accepted result is shown (the toast "Added sugar to N cells.", written in the same call
 *       as the placement ring) minus the pointerdown event's timeStamp (SPEC §16 target p95 < 100 ms);
 *   (d) one JSON document with the machine (lscpu model, nproc, Node and Chromium versions, the WebGL
 *       renderer string) and the 1-minute load average before and after each part.
 * With --gc, each sample first asks both heaps to collect garbage (CDP HeapProfiler.collectGarbage on the
 * worker and on the page), so the heap series is the post-GC floor rather than a GC sawtooth; this adds a
 * collection every 10 s, so tick and fps readings from a --gc run are not used for timing.
 * The server is stopped by port afterwards. SwiftShader is software rendering: fps are lower bounds, and
 * on a shared machine every time includes waiting for a CPU (the load averages say how busy it was).
 */
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism, cpus, loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import { chromium, type CDPSession, type Page } from '@playwright/test';
import { REPO_ROOT } from './lib/content-fs';

const PORT = Number(process.env.PERF_WEB_PORT ?? 5282);
const OUTDIR = 'tmp/dist-perf';
const BASE = `http://127.0.0.1:${PORT}`;
const TAG = `--perf-web-tag=${process.pid}`;
const GPU_ARGS = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-precise-memory-info', TAG];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const GARDEN_MIN = Number(arg('garden-minutes') ?? '15');
const STRESS_1X_MIN = Number(arg('stress-1x-minutes') ?? '5');
const STRESS_4X_MIN = Number(arg('stress-4x-minutes') ?? '2');
const TAPS = Number(arg('taps') ?? '20');
const [VW, VH] = (arg('viewport') ?? '360x800').split('x').map(Number) as [number, number];
const STRESS_SAVE = arg('stress-save') ?? 'tmp/perf2/stress-600.pixelmeba';
const SAMPLE_MS = 10_000;
const GC = flag('gc');

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], cwd: REPO_ROOT }).trim();
  } catch {
    return '';
  }
}
const load1 = (): number => Math.round(loadavg()[0]! * 100) / 100;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const log = (s: string): void => void process.stderr.write(`[perf-web] ${s}\n`);

function stopServer(): void {
  sh(`lsof -t -i :${PORT} | xargs -r kill`);
}

async function waitForServer(timeoutMs: number): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error(`vite preview did not answer on ${BASE}`);
}

// ---- The browser's process tree and its CPU time (the heat proxy) -------------------------------

/** Total CPU seconds (user + system) of the launched browser and all its descendants (from ps). */
function browserCpuSeconds(): { seconds: number; processes: number } {
  const rows = sh('ps -eo pid=,ppid=,times=,args=')
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter((r) => r.length >= 4);
  const root = rows.find((r) => r.slice(3).join(' ').includes(TAG) && !r.slice(3).join(' ').includes('--type='));
  if (!root) return { seconds: Number.NaN, processes: 0 };
  const tree = new Set([root[0]!]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of rows)
      if (!tree.has(r[0]!) && tree.has(r[1]!)) {
        tree.add(r[0]!);
        changed = true;
      }
  }
  let s = 0;
  for (const r of rows) if (tree.has(r[0]!)) s += Number(r[2]);
  return { seconds: s, processes: tree.size };
}

// ---- The worker's heap through a browser CDP session --------------------------------------------

class WorkerHeap {
  private session: CDPSession | null = null;
  private targetSession: string | null = null;
  private seq = 1;
  private readonly pending = new Map<number, (v: unknown) => void>();
  note = '';

  /**
   * A CDP session of its own on the page, auto-attached (non-flattened) to the page's dedicated workers:
   * Target.attachedToTarget names the worker's session, and Runtime.getHeapUsage is sent to it with
   * Target.sendMessageToTarget (answers come back as Target.receivedMessageFromTarget).
   */
  async attach(page: Page): Promise<void> {
    try {
      const s = await page.context().newCDPSession(page);
      this.session = s;
      s.on('Target.receivedMessageFromTarget', (e: { sessionId: string; message: string }) => {
        const m = JSON.parse(e.message) as { id?: number; result?: unknown };
        if (m.id !== undefined) this.pending.get(m.id)?.(m.result ?? null);
      });
      const attached = new Promise<void>((resolve) => {
        s.on('Target.attachedToTarget', (e: { sessionId: string; targetInfo: { type: string; url: string } }) => {
          if (e.targetInfo.type !== 'worker' || this.targetSession !== null) return;
          this.targetSession = e.sessionId;
          this.note = `attached to ${e.targetInfo.url.replace(BASE, '')} (Target.setAutoAttach, flatten false)`;
          resolve();
        });
        setTimeout(resolve, 5000);
      });
      await s.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: false });
      await attached;
      if (this.targetSession === null) this.note = 'no worker target was attached';
    } catch (e) {
      this.note = `CDP attach failed: ${(e as Error).message}`;
    }
  }

  /** Send one CDP method to the worker and wait for its answer (null when unreachable or after 5 s). */
  private async call(method: string): Promise<unknown> {
    if (!this.session || !this.targetSession) return null;
    const id = this.seq++;
    const got = new Promise<unknown>((resolve) => {
      this.pending.set(id, resolve);
      setTimeout(() => resolve(null), 5000);
    });
    try {
      await this.session.send('Target.sendMessageToTarget', {
        sessionId: this.targetSession,
        message: JSON.stringify({ id, method }),
      });
    } catch (e) {
      this.note = `sendMessageToTarget failed: ${(e as Error).message}`;
      return null;
    }
    const r = await got;
    this.pending.delete(id);
    return r;
  }

  /** Used JS heap of the worker in MB (after a collection with --gc), or null when unreachable. */
  async usedMB(): Promise<number | null> {
    if (GC) await this.call('HeapProfiler.collectGarbage');
    const r = (await this.call('Runtime.getHeapUsage')) as { usedSize?: number } | null;
    return r && typeof r.usedSize === 'number' ? Math.round((r.usedSize / 1048576) * 100) / 100 : null;
  }

  /** --gc: collect the page's garbage before its heap is read. */
  async pageGc(): Promise<void> {
    if (GC && this.session) await this.session.send('HeapProfiler.collectGarbage').catch(() => undefined);
  }
}

// ---- App driving ---------------------------------------------------------------------------------

async function seed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('pixelmeba.settings', JSON.stringify({ showPerformance: true, showPrompts: false }));
  });
}

async function setSpeed(page: Page, speed: 1 | 2 | 4): Promise<void> {
  const cycle = page.getByRole('button', { name: /^Speed \d×, tap to change$/ });
  if (await cycle.isVisible()) {
    for (let i = 0; i < 3 && (await cycle.getAttribute('aria-label')) !== `Speed ${speed}×, tap to change`; i++) await cycle.click();
  } else await page.getByRole('group', { name: 'Speed' }).getByRole('button', { name: `${speed}×` }).click();
}

async function run(page: Page): Promise<void> {
  if ((await page.getByTestId('run-toggle').getAttribute('aria-label')) === 'Run') await page.getByTestId('run-toggle').click();
}

interface Sample {
  t: number;
  dishTime: string;
  alive: number | null;
  tick: string;
  speed: string;
  snapshot: string;
  fps: string;
  memory: string;
  level: string;
  mainHeapMB: number | null;
  workerHeapMB: number | null;
  load1: number;
  badge: boolean;
}

async function sample(page: Page, heap: WorkerHeap, t0: number): Promise<Sample> {
  const text = (id: string) => page.getByTestId(id).innerText();
  const [dishTime, tick, speed, snapshot, fps, memory, level] = await Promise.all(
    ['sim-time', 'diag-tick', 'diag-speed', 'diag-snapshot', 'diag-fps', 'diag-memory', 'diag-level'].map(text),
  );
  await heap.pageGc();
  const workerHeapMB = await heap.usedMB();
  const mainHeapMB = await page.evaluate(() => {
    const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return m ? Math.round((m.usedJSHeapSize / 1048576) * 100) / 100 : null;
  });
  return {
    t: Math.round((Date.now() - t0) / 1000),
    dishTime: dishTime!.split('·')[0]!.trim(),
    alive: num(/(\d+) alive/, dishTime!),
    tick: tick!,
    speed: speed!,
    snapshot: snapshot!,
    fps: fps!,
    memory: memory!,
    level: level!,
    mainHeapMB,
    workerHeapMB,
    load1: load1(),
    badge: (await page.getByTestId('speed-badge').count()) > 0,
  };
}

/** Run for `minutes`, sampling every 10 s, with per-minute browser CPU. */
async function soak(page: Page, minutes: number, label: string) {
  const heap = new WorkerHeap();
  await heap.attach(page);
  const t0 = Date.now();
  const samples: Sample[] = [];
  const cpu: { minute: number; cpuSeconds: number; shareOfOneCore: number; processes: number; load1: number }[] = [];
  let lastCpu = browserCpuSeconds();
  let lastCpuAt = Date.now();
  const loadBefore = loadavg().map((v) => Math.round(v * 100) / 100);
  while (Date.now() - t0 < minutes * 60_000) {
    samples.push(await sample(page, heap, t0));
    if (Date.now() - lastCpuAt >= 60_000) {
      const now = browserCpuSeconds();
      const dt = (Date.now() - lastCpuAt) / 1000;
      cpu.push({
        minute: cpu.length + 1,
        cpuSeconds: Math.round((now.seconds - lastCpu.seconds) * 100) / 100,
        shareOfOneCore: Math.round(((now.seconds - lastCpu.seconds) / dt) * 1000) / 1000,
        processes: now.processes,
        load1: load1(),
      });
      lastCpu = now;
      lastCpuAt = Date.now();
    }
    if (samples.length % 6 === 0) log(`${label} ${samples.at(-1)!.t}s: ${samples.at(-1)!.tick} · ${samples.at(-1)!.speed} · ${samples.at(-1)!.fps} · worker ${samples.at(-1)!.workerHeapMB} MB · load ${load1()}`);
    await sleep(SAMPLE_MS);
  }
  samples.push(await sample(page, heap, t0));
  return { label, minutes, workerHeapNote: heap.note, loadBefore, loadAfter: loadavg().map((v) => Math.round(v * 100) / 100), samples, cpuPerMinute: cpu, summary: summarize(samples) };
}

function num(re: RegExp, s: string): number | null {
  const m = re.exec(s);
  return m ? Number(m[1]) : null;
}

function pctl(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]!;
}

function slopePerMin(points: [number, number][]): number | null {
  if (points.length < 2) return null;
  const n = points.length;
  const mx = points.reduce((a, p) => a + p[0], 0) / n;
  const my = points.reduce((a, p) => a + p[1], 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of points) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function summarize(samples: Sample[]) {
  const tickP50 = samples.map((s) => num(/^Tick (\d+\.\d+)/, s.tick)).filter((v): v is number => v !== null);
  const tickP95 = samples.map((s) => num(/p95 (\d+\.\d+)/, s.tick)).filter((v): v is number => v !== null);
  const eff = samples.map((s) => num(/^Speed (\d+\.\d+)×/, s.speed)).filter((v): v is number => v !== null);
  const snap = samples.map((s) => num(/^Snapshot (\d+\.\d+)/, s.snapshot)).filter((v): v is number => v !== null);
  const fps = samples.map((s) => num(/^(\d+) fps/, s.fps)).filter((v): v is number => v !== null);
  const levels = samples.map((s) => num(/^Detail (\d)/, s.level)).filter((v): v is number => v !== null);
  const window = (pick: (s: Sample) => number | null): { mbPerMin: number | null; pctPerMin: number | null; at5: number | null } => {
    const pts = samples.filter((s) => s.t >= 300 && s.t <= 900 && pick(s) !== null).map((s) => [s.t / 60, pick(s)!] as [number, number]);
    const sl = slopePerMin(pts);
    const at5 = pts[0]?.[1] ?? null;
    return { mbPerMin: sl === null ? null : Math.round(sl * 1000) / 1000, pctPerMin: sl === null || !at5 ? null : Math.round(((100 * sl) / at5) * 1000) / 1000, at5 };
  };
  return {
    samples: samples.length,
    tickP50Ms: { median: pctl(tickP50, 0.5), max: pctl(tickP50, 1) },
    tickP95Ms: { median: pctl(tickP95, 0.5), max: pctl(tickP95, 1) },
    effectiveSpeed: { min: pctl(eff, 0), median: pctl(eff, 0.5) },
    snapshotMs: { median: pctl(snap, 0.5), p95: pctl(snap, 0.95) },
    fps: { min: pctl(fps, 0), median: pctl(fps, 0.5) },
    detailLevels: { max: levels.length ? Math.max(...levels) : null, seen: [...new Set(levels)].sort() },
    badgeShownSamples: samples.filter((s) => s.badge).length,
    mainHeapMinutes5to15: window((s) => s.mainHeapMB),
    workerHeapMinutes5to15: window((s) => s.workerHeapMB),
    mainHeapMB: { first: samples[0]?.mainHeapMB ?? null, last: samples.at(-1)?.mainHeapMB ?? null },
    workerHeapMB: { first: samples[0]?.workerHeapMB ?? null, last: samples.at(-1)?.workerHeapMB ?? null },
  };
}

async function openGarden(page: Page): Promise<void> {
  await page.goto(BASE);
  await page.getByTestId('home-play').click();
  await page.getByTestId('start-garden').click();
  await page.getByTestId('dish-screen').waitFor();
  await page.getByTestId('sim-time').filter({ hasText: '56 alive' }).waitFor();
}

async function touchLatency(page: Page, taps: number) {
  const out: { tap: number; latencyMs: number; text: string }[] = [];
  const box = (await page.getByTestId('viewport').boundingBox())!;
  for (let k = 0; k < taps; k++) {
    await page.locator('.toast').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
    await page.getByTestId('action-feed').click();
    await page.getByTestId('feed-choose').click();
    // A plain script string: tsx would wrap named functions in a helper the page does not have.
    await page.evaluate(`
      window.__lat = new Promise((resolve) => {
        let t0 = null;
        const down = (e) => {
          if (e.target && e.target.tagName === 'CANVAS') { t0 = e.timeStamp; document.removeEventListener('pointerdown', down, true); }
        };
        document.addEventListener('pointerdown', down, true);
        const obs = new MutationObserver(() => {
          const t = document.querySelector('.toast');
          if (t0 !== null && t && /^Added sugar to \\d+ cells\\.$/.test(t.textContent || '')) {
            obs.disconnect();
            const text = t.textContent || '';
            requestAnimationFrame((ts) => resolve({ latency: ts - t0, text }));
          }
        });
        obs.observe(document.body, { subtree: true, childList: true, characterData: true });
        setTimeout(() => { obs.disconnect(); resolve(null); }, 15000);
      });
      true; // the expression's value: evaluate must not wait for the promise here
    `);
    // Different open-water spots around the dish centre.
    const a = (k / taps) * Math.PI * 2;
    await page.mouse.click(box.x + box.width * (0.5 + 0.12 * Math.cos(a)), box.y + box.height * (0.5 + 0.12 * Math.sin(a)));
    const r = await page.evaluate(() => (window as unknown as { __lat: Promise<{ latency: number; text: string } | null> }).__lat);
    if (r) out.push({ tap: k + 1, latencyMs: Math.round(r.latency * 10) / 10, text: r.text });
    else log(`tap ${k + 1}: no accepted result seen`);
  }
  const lat = out.map((o) => o.latencyMs);
  return {
    method:
      'pointerdown event.timeStamp on the dish canvas → the first requestAnimationFrame after the toast "Added sugar to N cells." appears (reportCommand writes it in the same call that spawns the placement ring); Playwright mouse clicks, dish running at 1×',
    taps: out,
    p50: pctl(lat, 0.5),
    p95: pctl(lat, 0.95),
    max: pctl(lat, 1),
  };
}

async function main(): Promise<void> {
  const outFile = arg('out');
  if (sh(`lsof -t -i :${PORT}`) !== '') throw new Error(`port ${PORT} is busy; stop that process first`);
  const machine = {
    lscpu: sh("lscpu | grep 'Model name' | sed 's/.*: *//'"),
    nproc: Number(sh('nproc')) || availableParallelism(),
    cpuModel: cpus()[0]?.model ?? 'unknown',
    node: process.version,
    chromium: '',
    gpu: '',
    viewport: `${VW}x${VH}`,
    chromiumArgs: GPU_ARGS.filter((a) => a !== TAG),
    loadavgStart: loadavg().map((v) => Math.round(v * 100) / 100),
  };
  if (!flag('no-build')) {
    log(`building into ${OUTDIR} …`);
    execSync(`npx vite build --outDir ${OUTDIR} --emptyOutDir`, { cwd: REPO_ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  }
  if (!flag('skip-stress') && !existsSync(join(REPO_ROOT, STRESS_SAVE))) {
    log(`writing the stress save ${STRESS_SAVE} …`);
    mkdirSync(dirname(join(REPO_ROOT, STRESS_SAVE)), { recursive: true });
    execSync(`npx tsx tools/perf-stress.ts --save-out ${STRESS_SAVE} --save-out-tick 600`, { cwd: REPO_ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
  }
  const server: ChildProcess = spawn('npx', ['vite', 'preview', '--outDir', OUTDIR, '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
  });
  const parts: Record<string, unknown> = {};
  try {
    await waitForServer(120_000);
    const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
    machine.chromium = browser.version();
    try {
      const fresh = async () => {
        const context = await browser.newContext({ viewport: { width: VW, height: VH }, hasTouch: VW < 700 });
        const page = await context.newPage();
        await seed(page);
        return { context, page };
      };
      {
        const { context, page } = await fresh();
        await page.goto(BASE);
        machine.gpu = await page.evaluate(() => {
          const gl = document.createElement('canvas').getContext('webgl');
          const ext = gl?.getExtension('WEBGL_debug_renderer_info');
          return gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no WebGL';
        });
        await context.close();
      }
      if (!flag('skip-garden')) {
        const { context, page } = await fresh();
        await openGarden(page);
        await run(page);
        await setSpeed(page, 4);
        log(`Garden at 4× for ${GARDEN_MIN} min …`);
        parts.garden4x = await soak(page, GARDEN_MIN, 'garden 4×');
        await context.close();
      }
      if (!flag('skip-taps')) {
        const { context, page } = await fresh();
        await openGarden(page);
        await run(page);
        log(`${TAPS} Feed taps at 1× …`);
        const before = load1();
        parts.touch = { ...(await touchLatency(page, TAPS)), load1Before: before, load1After: load1() };
        await context.close();
      }
      if (!flag('skip-stress')) {
        const { context, page } = await fresh();
        await page.goto(BASE);
        await page.getByRole('button', { name: 'Saved dishes' }).click();
        const t0 = Date.now();
        await page.locator('input[type=file]').first().setInputFiles(join(REPO_ROOT, STRESS_SAVE));
        await page.getByTestId('dish-screen').waitFor({ timeout: 180_000 });
        await page.getByTestId('sim-time').filter({ hasText: /\d{3,} alive/ }).waitFor({ timeout: 180_000 });
        const importMs = Date.now() - t0;
        const alive = await page.getByTestId('sim-time').innerText();
        log(`stress save imported in ${importMs} ms (${alive}); 1× for ${STRESS_1X_MIN} min …`);
        await run(page);
        await setSpeed(page, 1);
        const at1 = await soak(page, STRESS_1X_MIN, 'stress 1×');
        await setSpeed(page, 4);
        log(`stress 4× for ${STRESS_4X_MIN} min …`);
        const at4 = await soak(page, STRESS_4X_MIN, 'stress 4×');
        parts.stress = { save: STRESS_SAVE, importMs, aliveAtImport: alive, at1x: at1, at4x: at4 };
        await context.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    stopServer();
    server.kill();
  }
  const out = {
    tool: 'tools/perf-web.ts',
    command: `npx tsx tools/perf-web.ts ${process.argv.slice(2).join(' ')}`.trim(),
    date: new Date().toISOString(),
    machine: { ...machine, loadavgEnd: loadavg().map((v) => Math.round(v * 100) / 100) },
    parts,
  };
  const text = JSON.stringify(out, null, 2);
  if (outFile) writeFileSync(join(REPO_ROOT, outFile), text + '\n');
  console.log(text);
}

main().catch((e: unknown) => {
  stopServer();
  console.error(e);
  process.exit(1);
});
