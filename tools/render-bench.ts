/**
 * Renderer performance bench (P1.5 done-when; results in docs/reports/render-perf-g1.md).
 *
 * Dev-only page: tools/render-bench.html, served by `npx vite`; headless runner:
 * `npx tsx tools/render-bench-run.ts`. Vite's production build only bundles index.html, so this
 * page never ships.
 *
 * It constructs the real DishRenderer with the real organism atlas and feeds it synthetic
 * snapshots in the worker's exact packed format (ENT_STRIDE float records, ID_STRIDE ids,
 * DEPOSIT_BANDS deposit bands) at 10 snapshots/s: 6,000 organisms of the five Phase 1 species,
 * moving smoothly, in mixed animation states, with a steady trickle of births and deaths so split
 * effects and death dissolves are exercised too.
 *
 * Nothing here is simulation: motion comes from a fixed-seed cosmetic PRNG so runs are comparable.
 * Instrumentation wraps (never replaces) the renderer's per-frame update and the Pixi render call.
 * Results land on window.__bench.
 *
 * Query options: count, warmup, measure, short (seconds), cpuSnapshots; `only=cpu` runs just the
 * GPU-free CPU phase; `manual=1` runs nothing and exposes window.__benchApi for profiling.
 */
import type { Application, Container, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js';
import { DishRenderer, type AtlasManifestLike } from '@render/renderer';
import { CELL_COUNT, GRID_W, MASK_CX, MASK_CY, MASK_R } from '@sim/constants';
import { FLAG } from '@sim/entities';
import {
  CUE_FEEDING,
  CUE_JUST_BORN,
  CUE_STRESSED,
  E_CUE,
  E_ENERGY,
  E_FLAGS,
  E_GROWTH,
  E_HEADING,
  E_HEALTH,
  E_LIFE,
  E_SIZE,
  E_SLOT,
  E_SPECIES,
  E_X,
  E_Y,
  ENT_STRIDE,
  ID_STRIDE,
  type GeometryMsg,
  type SnapshotMsg,
  type VisualEvent,
} from '@worker/protocol';
import { DEPOSIT_BANDS } from '@worker/snapshot';

// ---------------------------------------------------------------------------------------------
// Parameters (overridable by query string for quick local runs).
const q = new URLSearchParams(location.search);
const num = (k: string, d: number): number => {
  const v = Number(q.get(k));
  return Number.isFinite(v) && v > 0 ? v : d;
};
const COUNT = Math.floor(num('count', 6000));
const WARMUP_S = num('warmup', 2);
const MEASURE_S = num('measure', 10);
const SHORT_S = num('short', 5);
const CPU_SNAPSHOTS = Math.floor(num('cpuSnapshots', 60));
const SNAPSHOT_HZ = 10;
const BIRTHS_PER_SNAPSHOT = 3;
const DEATHS_PER_SNAPSHOT = 3;

/** The five Phase 1 species (CT §1), with a share of the population and a cosmetic cruise speed. */
const SPECIES: readonly { id: string; share: number; speed: number }[] = [
  { id: 'A01', share: 0.18, speed: 0.15 },
  { id: 'B01', share: 0.25, speed: 2.0 },
  { id: 'B04', share: 0.23, speed: 1.0 },
  { id: 'B06', share: 0.23, speed: 0.8 },
  { id: 'P01', share: 0.11, speed: 0.6 },
];

// ---------------------------------------------------------------------------------------------
// Private renderer members the bench reads (runtime access only; no behaviour is changed).
interface RendererInternals {
  frame: () => void;
  app: Application;
  particles: ParticleContainer;
  aggSprite: Sprite;
  aggCanvas: HTMLCanvasElement;
  effects: Container;
  frames: Record<string, Texture>;
}

const publish = (v: unknown): void => {
  (window as unknown as { __bench?: unknown }).__bench = v;
};

const status = document.getElementById('status')!;
const say = (s: string): void => {
  status.textContent = s;
};

// Cosmetic PRNG (mulberry32), fixed seed: comparable runs, no simulation randomness involved.
let prngState = 0x5eed1234;
function rnd(): number {
  prngState = (prngState + 0x6d2b79f5) >>> 0;
  let t = prngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const nextFrame = (): Promise<number> => new Promise((r) => requestAnimationFrame(r));

// ---------------------------------------------------------------------------------------------
// Synthetic dish.
const CX = MASK_CX + 0.5;
const CY = MASK_CY + 0.5;
const ROAM_R = MASK_R - 3;

function makeGeometry(): GeometryMsg {
  const substrate = new Uint8Array(CELL_COUNT);
  const structure = new Uint8Array(CELL_COUNT);
  const shade = new Float32Array(CELL_COUNT).fill(1);
  for (let i = 0; i < CELL_COUNT; i++) {
    const x = i % GRID_W;
    const y = Math.floor(i / GRID_W);
    const dx = x - MASK_CX;
    const dy = y - MASK_CY;
    if (dx * dx + dy * dy > MASK_R * MASK_R) {
      structure[i] = 4;
      continue;
    }
    if (y > 92)
      substrate[i] = 2; // sediment band along the bottom
    else if (x < 40 && y < 60) substrate[i] = 1; // gel pad
    if ((x - 86) ** 2 + (y - 40) ** 2 < 12) structure[i] = 1; // a stone
    if ((x - 30) ** 2 + (y - 80) ** 2 < 6) structure[i] = 1;
    if (x > 70 && y > 70 && y < 90) shade[i] = 0.6; // a shaded patch
  }
  return { version: 1, substrate, structure, shade };
}

function makeDeposits(): Uint8Array {
  const d = new Uint8Array(CELL_COUNT * DEPOSIT_BANDS);
  for (let i = 0; i < CELL_COUNT; i++) {
    const x = i % GRID_W;
    const y = Math.floor(i / GRID_W);
    const blob = (bx: number, by: number, r: number): number =>
      Math.max(0, 1 - Math.hypot(x - bx, y - by) / r);
    d[i] = Math.round(220 * blob(44, 52, 9)); // starch
    d[CELL_COUNT + i] = y > 92 ? Math.round(60 + 80 * rnd()) : 0; // detritus in the sediment
    d[2 * CELL_COUNT + i] = Math.round(200 * blob(80, 60, 5)); // oil
    d[3 * CELL_COUNT + i] = Math.round(180 * blob(60, 30, 4)); // protein
    d[4 * CELL_COUNT + i] = Math.round(120 * blob(64, 64, 30)); // sugar haze
  }
  return d;
}

/** Dense organism store; removal swaps with the last live record. */
class Population {
  readonly cap: number;
  n = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly sp: Uint8Array;
  readonly heading: Uint8Array;
  readonly mode: Uint8Array; // 0 moving, 1 feeding, 2 stressed, 3 resting
  readonly modeUntil: Float32Array;
  readonly bornAt: Float32Array;
  readonly birthId: Uint32Array;
  readonly entityId: Uint32Array;
  private nextId = 1;

  constructor(cap: number) {
    this.cap = cap;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.vx = new Float32Array(cap);
    this.vy = new Float32Array(cap);
    this.sp = new Uint8Array(cap);
    this.heading = new Uint8Array(cap);
    this.mode = new Uint8Array(cap);
    this.modeUntil = new Float32Array(cap);
    this.bornAt = new Float32Array(cap).fill(-1e9);
    this.birthId = new Uint32Array(cap);
    this.entityId = new Uint32Array(cap);
  }

  add(sp: number, x: number, y: number, t: number): number {
    const k = this.n++;
    this.sp[k] = sp;
    this.x[k] = x;
    this.y[k] = y;
    this.birthId[k] = this.nextId;
    this.entityId[k] = this.nextId + 100000;
    this.nextId++;
    this.bornAt[k] = t;
    this.pickMode(k, t);
    return k;
  }

  remove(k: number): void {
    const last = --this.n;
    if (k === last) return;
    for (const a of [
      this.x,
      this.y,
      this.vx,
      this.vy,
      this.sp,
      this.heading,
      this.mode,
      this.modeUntil,
      this.bornAt,
      this.birthId,
      this.entityId,
    ])
      a[k] = a[last]!;
  }

  pickMode(k: number, t: number): void {
    const r = rnd();
    const s = SPECIES[this.sp[k]!]!;
    const mode = r < 0.7 ? 0 : r < 0.85 ? 1 : r < 0.92 ? 2 : 3;
    this.mode[k] = mode;
    this.modeUntil[k] = t + 2 + 3 * rnd();
    const speed = mode === 0 ? s.speed * (0.7 + 0.6 * rnd()) : mode === 2 ? s.speed * 0.2 : 0;
    const a = rnd() * Math.PI * 2;
    this.vx[k] = Math.cos(a) * speed;
    this.vy[k] = Math.sin(a) * speed;
  }

  /** Advance one snapshot interval (seconds). Smooth straight runs, reflected at the rim. */
  step(dt: number, t: number): void {
    for (let k = 0; k < this.n; k++) {
      if (t >= this.modeUntil[k]!) this.pickMode(k, t);
      let nx = this.x[k]! + this.vx[k]! * dt;
      let ny = this.y[k]! + this.vy[k]! * dt;
      const dx = nx - CX;
      const dy = ny - CY;
      const d = Math.hypot(dx, dy);
      if (d > ROAM_R) {
        const ux = dx / d;
        const uy = dy / d;
        const dot = this.vx[k]! * ux + this.vy[k]! * uy;
        this.vx[k] = this.vx[k]! - 2 * dot * ux;
        this.vy[k] = this.vy[k]! - 2 * dot * uy;
        nx = CX + ux * ROAM_R;
        ny = CY + uy * ROAM_R;
      }
      const mx = nx - this.x[k]!;
      const my = ny - this.y[k]!;
      if (mx !== 0 || my !== 0)
        this.heading[k] = Math.abs(mx) >= Math.abs(my) ? (mx > 0 ? 0 : 2) : my > 0 ? 1 : 3;
      this.x[k] = nx;
      this.y[k] = ny;
    }
  }
}

function randomInDish(): [number, number] {
  const a = rnd() * Math.PI * 2;
  const r = Math.sqrt(rnd()) * ROAM_R;
  return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
}

const cellOf = (x: number, y: number): number => Math.floor(y) * GRID_W + Math.floor(x);

// ---------------------------------------------------------------------------------------------
// Snapshot feed in the worker's packed format (mirrors src/worker/snapshot.ts packEntities).
interface Feed {
  stop(): void;
  applyMs: number[];
  delivered: number;
}

/** Returns a function producing the next snapshot (one 0.1 s step of the synthetic dish each call). */
function snapshotSource(
  pop: Population,
  geometry: GeometryMsg,
  deposits: Uint8Array,
  speciesCount: number,
): () => SnapshotMsg {
  // Three pooled buffers, like the worker's transfer/release cycle: the renderer holds the current
  // snapshot (and reads the previous one while applying the next).
  const pool = [0, 1, 2].map(() => ({
    ents: new Float32Array((pop.cap + 64) * ENT_STRIDE),
    ids: new Uint32Array((pop.cap + 64) * ID_STRIDE),
  }));
  let tick = 0;
  let geometrySent = false;

  return (): SnapshotMsg => {
    const t = tick / SNAPSHOT_HZ;
    const events: VisualEvent[] = [];
    if (tick > 0) {
      for (let d = 0; d < DEATHS_PER_SNAPSHOT && pop.n > 1; d++) {
        const k = Math.floor(rnd() * pop.n);
        events.push({
          type: 'death',
          tick,
          species: pop.sp[k]!,
          cell: cellOf(pop.x[k]!, pop.y[k]!),
          birthId: pop.birthId[k]!,
          cause: 1,
        });
        pop.remove(k);
      }
      for (let b = 0; b < BIRTHS_PER_SNAPSHOT && pop.n < pop.cap; b++) {
        const parent = Math.floor(rnd() * pop.n);
        const k = pop.add(pop.sp[parent]!, pop.x[parent]! + 0.4, pop.y[parent]!, t);
        events.push({
          type: 'birth',
          tick,
          species: pop.sp[k]!,
          cell: cellOf(pop.x[k]!, pop.y[k]!),
          birthId: pop.birthId[k]!,
        });
      }
      pop.step(1 / SNAPSHOT_HZ, t);
    }
    const buf = pool[tick % pool.length]!;
    const { ents, ids } = buf;
    const speciesCounts = new Array<number>(speciesCount).fill(0);
    for (let k = 0; k < pop.n; k++) {
      const mode = pop.mode[k]!;
      let flags = 0;
      let cue = 0;
      if (mode === 0 || mode === 2) flags |= FLAG.moving;
      if (mode === 1) {
        flags |= FLAG.feeding;
        cue |= CUE_FEEDING;
      }
      if (mode === 2) {
        flags |= FLAG.stressed;
        cue |= CUE_STRESSED;
      }
      if (t - pop.bornAt[k]! < 0.15) {
        flags |= FLAG.justBorn;
        cue |= CUE_JUST_BORN;
      }
      const o = k * ENT_STRIDE;
      ents[o + E_SLOT] = k;
      ents[o + E_SPECIES] = pop.sp[k]!;
      ents[o + E_X] = pop.x[k]!;
      ents[o + E_Y] = pop.y[k]!;
      ents[o + E_HEADING] = pop.heading[k]!;
      ents[o + E_FLAGS] = flags;
      ents[o + E_GROWTH] = 0.5 + (0.5 * ((pop.birthId[k]! * 37) % 100)) / 100;
      ents[o + E_ENERGY] = 0.6;
      ents[o + E_HEALTH] = mode === 2 ? 0.7 : 1;
      ents[o + E_LIFE] = 0;
      ents[o + E_SIZE] = 1;
      ents[o + E_CUE] = cue;
      ids[k * ID_STRIDE] = pop.birthId[k]!;
      ids[k * ID_STRIDE + 1] = pop.entityId[k]!;
      speciesCounts[pop.sp[k]!]!++;
    }
    // A few deposit cells change each snapshot, as grazing does.
    for (let j = 0; j < 24; j++) {
      const c = Math.floor(rnd() * CELL_COUNT);
      if (deposits[c]! > 0) deposits[c] = deposits[c]! - 1;
    }
    const s: SnapshotMsg = {
      type: 'snapshot',
      dishId: 'bench',
      gen: 0,
      tick,
      speed: 1,
      effectiveSpeed: 1,
      count: pop.n,
      ents,
      ids,
      deposits,
      overlay: null,
      geometry: geometrySent ? null : geometry,
      events,
      selection: null,
      capacityReached: false,
      speciesCounts,
      undoAvailable: false,
    };
    geometrySent = true;
    tick++;
    return s;
  };
}

/** Deliver snapshots to the renderer at SNAPSHOT_HZ, timing each applySnapshot call. */
function startFeed(renderer: DishRenderer, next: () => SnapshotMsg): Feed {
  const applyMs: number[] = [];
  const feed: Feed = { stop: () => clearInterval(timer), applyMs, delivered: 0 };
  const deliver = (): void => {
    const s = next();
    const t0 = performance.now();
    renderer.applySnapshot(s);
    applyMs.push(performance.now() - t0);
    feed.delivered++;
  };
  deliver();
  const timer = setInterval(deliver, 1000 / SNAPSHOT_HZ);
  return feed;
}

// ---------------------------------------------------------------------------------------------
// Measurement.
interface Recorder {
  intervals: number[];
  frameJs: number[];
  renderJs: number[];
  active: boolean;
}

const rec: Recorder = { intervals: [], frameJs: [], renderJs: [], active: false };
let lastRaf = 0;
function rafLoop(ts: number): void {
  if (rec.active && lastRaf > 0) rec.intervals.push(ts - lastRaf);
  lastRaf = ts;
  requestAnimationFrame(rafLoop);
}

function pct(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}
const mean = (a: readonly number[]): number => (a.length === 0 ? 0 : a.reduce((s, v) => s + v, 0) / a.length);
const r2 = (v: number): number => Math.round(v * 100) / 100;

interface Stats {
  seconds: number;
  frames: number;
  fpsMean: number;
  frameMs: { p50: number; p95: number; p99: number; max: number; mean: number };
  over33ms: number;
  over50ms: number;
  rendererUpdateMs: { mean: number; p95: number };
  pixiRenderMs: { mean: number; p95: number };
  applySnapshotMs: { mean: number; p95: number; max: number; count: number };
}

async function measure(seconds: number, feed: Feed | null): Promise<Stats> {
  rec.intervals = [];
  rec.frameJs = [];
  rec.renderJs = [];
  lastRaf = 0;
  const applyStart = feed ? feed.applyMs.length : 0;
  rec.active = true;
  const t0 = performance.now();
  await wait(seconds * 1000);
  rec.active = false;
  const elapsed = (performance.now() - t0) / 1000;
  const iv = rec.intervals.slice().sort((a, b) => a - b);
  const fj = rec.frameJs.slice().sort((a, b) => a - b);
  const rj = rec.renderJs.slice().sort((a, b) => a - b);
  const ap = feed ? feed.applyMs.slice(applyStart).sort((a, b) => a - b) : [];
  const total = iv.reduce((s, v) => s + v, 0);
  return {
    seconds: r2(elapsed),
    frames: iv.length,
    fpsMean: r2(total > 0 ? (iv.length * 1000) / total : 0),
    frameMs: {
      p50: r2(pct(iv, 50)),
      p95: r2(pct(iv, 95)),
      p99: r2(pct(iv, 99)),
      max: r2(iv[iv.length - 1] ?? 0),
      mean: r2(mean(iv)),
    },
    over33ms: iv.filter((v) => v > 33.4).length,
    over50ms: iv.filter((v) => v > 50).length,
    rendererUpdateMs: { mean: r2(mean(fj)), p95: r2(pct(fj, 95)) },
    pixiRenderMs: { mean: r2(mean(rj)), p95: r2(pct(rj, 95)) },
    applySnapshotMs: {
      mean: r2(mean(ap)),
      p95: r2(pct(ap, 95)),
      max: r2(ap[ap.length - 1] ?? 0),
      count: ap.length,
    },
  };
}

function instrument(priv: RendererInternals): void {
  const frame = priv.frame.bind(priv);
  priv.frame = () => {
    const t = performance.now();
    frame();
    if (rec.active) rec.frameJs.push(performance.now() - t);
  };
  const pixi = priv.app.renderer;
  const render = pixi.render.bind(pixi);
  pixi.render = ((...args: Parameters<typeof render>) => {
    const t = performance.now();
    render(...args);
    if (rec.active) rec.renderJs.push(performance.now() - t);
  }) as typeof pixi.render;
}

function gpuInfo(priv: RendererInternals): {
  rendererName: string;
  webgl: boolean;
  gpuRenderer: string | null;
  gpuVendor: string | null;
  glVersion: string | null;
} {
  const r = priv.app.renderer as unknown as { name?: string; gl?: WebGLRenderingContext };
  const gl = r.gl;
  let gpuRenderer: string | null = null;
  let gpuVendor: string | null = null;
  let glVersion: string | null = null;
  if (gl) {
    glVersion = String(gl.getParameter(gl.VERSION));
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      gpuRenderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      gpuVendor = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL));
    }
  }
  const name = r.name ?? 'unknown';
  return { rendererName: name, webgl: name === 'webgl' && !!gl, gpuRenderer, gpuVendor, glVersion };
}

/** Organism positions on screen at the current camera (the ParticleContainer submits all of them). */
function onScreen(renderer: DishRenderer, pop: Population): number {
  const cam = renderer.camera;
  let n = 0;
  for (let k = 0; k < pop.n; k++) {
    const [sx, sy] = cam.worldToScreen(pop.x[k]!, pop.y[k]!);
    if (sx >= -16 && sy >= -16 && sx <= cam.viewW + 16 && sy <= cam.viewH + 16) n++;
  }
  return n;
}

/** Sample animation frames of organism particles: how many sit off their reduced-motion frame. */
function frameAudit(
  priv: RendererInternals,
  manifest: AtlasManifestLike,
  reverse: Map<Texture, string>,
): { particles: number; offReducedFrame: number; unknown: number } {
  let off = 0;
  let unknown = 0;
  const list = priv.particles.particleChildren as Particle[];
  for (const p of list) {
    const key = reverse.get(p.texture);
    if (!key) {
      unknown++;
      continue;
    }
    const [asset, anim, , idx] = key.split('/');
    const a = manifest.sprites[asset!]?.animations[anim!];
    if (!a) {
      unknown++;
      continue;
    }
    if (Number(idx) !== a.reducedMotionFrame) off++;
  }
  return { particles: list.length, offReducedFrame: off, unknown };
}

async function effectsWindow(
  renderer: DishRenderer,
  priv: RendererInternals,
  manifest: AtlasManifestLike,
  reverse: Map<Texture, string>,
  ms: number,
): Promise<{
  maxEffects: number;
  ringAdded: number;
  frames: number;
  maxOffReducedFrame: number;
  particlesSampled: number;
}> {
  const before = priv.effects.children.length;
  renderer.placementRing(CX, CY, 3);
  const ringAdded = priv.effects.children.length - before;
  let maxEffects = priv.effects.children.length;
  let maxOff = 0;
  let sampled = 0;
  let frames = 0;
  // Audit every frame, for at least `ms` and at least 8 frames (slow software GL can give < 1 frame
  // per 250 ms). This window is an assertion, not a timing measurement.
  const end = performance.now() + ms;
  while (performance.now() < end || frames < 8) {
    await nextFrame();
    frames++;
    maxEffects = Math.max(maxEffects, priv.effects.children.length);
    const a = frameAudit(priv, manifest, reverse);
    maxOff = Math.max(maxOff, a.offReducedFrame);
    sampled = Math.max(sampled, a.particles);
  }
  return { maxEffects, ringAdded, frames, maxOffReducedFrame: maxOff, particlesSampled: sampled };
}

/**
 * Renderer JS cost with the GPU out of the loop: the Pixi ticker is stopped (nothing is drawn or
 * uploaded) and each synthetic snapshot is applied, then the per-frame update is run six times,
 * as at 60 fps with 10 snapshots/s. This isolates the renderer's own CPU work from SwiftShader.
 */
async function cpuPhase(
  renderer: DishRenderer,
  priv: RendererInternals,
  next: () => SnapshotMsg,
  snapshots: number,
): Promise<{
  snapshots: number;
  applySnapshotMs: { mean: number; p50: number; p95: number };
  rendererUpdateMs: { mean: number; p50: number; p95: number };
  particlesSubmitted: number;
}> {
  priv.app.ticker.stop();
  const apply: number[] = [];
  const upd: number[] = [];
  try {
    for (let i = 0; i < snapshots; i++) {
      const s = next();
      let t = performance.now();
      renderer.applySnapshot(s);
      apply.push(performance.now() - t);
      for (let f = 0; f < 6; f++) {
        t = performance.now();
        priv.frame();
        upd.push(performance.now() - t);
      }
      await wait(0);
    }
  } finally {
    priv.app.ticker.start();
  }
  const sa = apply.slice(5).sort((a, b) => a - b); // skip JIT warm-up
  const su = upd.slice(30).sort((a, b) => a - b);
  return {
    snapshots,
    applySnapshotMs: { mean: r2(mean(sa)), p50: r2(pct(sa, 50)), p95: r2(pct(sa, 95)) },
    rendererUpdateMs: { mean: r2(mean(su)), p50: r2(pct(su, 50)), p95: r2(pct(su, 95)) },
    particlesSubmitted: priv.particles.particleChildren.length,
  };
}

// ---------------------------------------------------------------------------------------------
async function main(): Promise<void> {
  requestAnimationFrame(rafLoop);
  const env = {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    devicePixelRatio: globalThis.devicePixelRatio,
    viewport: { w: innerWidth, h: innerHeight },
    count: COUNT,
    snapshotHz: SNAPSHOT_HZ,
    warmupS: WARMUP_S,
    measureS: MEASURE_S,
  };

  say('baseline: empty page rAF');
  const baseline = await measure(2, null);

  const res = await fetch('/atlas/manifest.json');
  if (!res.ok) throw new Error(`atlas manifest ${res.status}`);
  const manifest = (await res.json()) as AtlasManifestLike;
  const assets = SPECIES.map((s) => {
    const hit = Object.entries(manifest.sprites).find(([, v]) => v.speciesId === s.id);
    if (!hit) throw new Error(`no sprite for ${s.id}`);
    return hit[0];
  });

  const host = document.getElementById('host')!;
  const renderer = await DishRenderer.create(host, '/atlas/organisms.png', manifest);
  const priv = renderer as unknown as RendererInternals;
  instrument(priv);
  renderer.setSpecies(
    SPECIES.map((s) => s.id),
    assets,
  );
  renderer.setOptions({ reducedMotion: false, overlayOpacity: 0.45 });
  const reverse = new Map<Texture, string>();
  for (const [k, t] of Object.entries(priv.frames)) reverse.set(t, k);

  const pop = new Population(COUNT + 16);
  let acc = 0;
  SPECIES.forEach((s, i) => {
    const target = i === SPECIES.length - 1 ? COUNT : Math.round(COUNT * (acc + s.share));
    acc += s.share;
    while (pop.n < target) {
      const [x, y] = randomInDish();
      pop.add(i, x, y, -10);
    }
  });
  if (q.has('manual')) {
    // Exploratory profiling: expose the pieces and run nothing (drive from DevTools/Playwright).
    const source = snapshotSource(pop, makeGeometry(), makeDeposits(), SPECIES.length);
    (window as unknown as { __benchApi?: unknown }).__benchApi = {
      renderer,
      priv,
      pop,
      gpu: gpuInfo(priv),
      startFeed: () => startFeed(renderer, source),
      measure: (seconds: number, feed: Feed | null) => measure(seconds, feed),
    };
    say('manual mode: window.__benchApi');
    return;
  }
  const source = snapshotSource(pop, makeGeometry(), makeDeposits(), SPECIES.length);
  const gpu = gpuInfo(priv);
  const canvas = {
    width: renderer.canvas.width,
    height: renderer.canvas.height,
    resolution: priv.app.renderer.resolution,
  };
  const cpu = async (): Promise<unknown> => {
    say('CPU-only renderer cost');
    renderer.setOptions({ reducedMotion: false });
    renderer.zoomPreset('neighborhood', [CX, CY]);
    const neighborhood = await cpuPhase(renderer, priv, source, CPU_SNAPSHOTS);
    renderer.zoomPreset('dish');
    const wholeDish = await cpuPhase(renderer, priv, source, CPU_SNAPSHOTS);
    return { neighborhood, wholeDish };
  };
  if (q.get('only') === 'cpu') {
    publish({ ok: true, env, gpu, canvas, cpu: await cpu() });
    say('done');
    return;
  }
  const feed = startFeed(renderer, source);

  // Neighborhood zoom, animated.
  renderer.zoomPreset('neighborhood', [CX, CY]);
  say(`neighborhood: warm-up ${WARMUP_S}s`);
  await wait(WARMUP_S * 1000);
  say(`neighborhood: measuring ${MEASURE_S}s`);
  const neighborhood = {
    zoom: renderer.camera.zoom,
    particlesSubmitted: priv.particles.particleChildren.length,
    organismsOnScreen: onScreen(renderer, pop),
    particlesVisible: priv.particles.visible,
    aggregationVisible: priv.aggSprite.visible,
    ...(await measure(MEASURE_S, feed)),
  };

  // Whole-dish zoom.
  renderer.zoomPreset('dish');
  say('whole dish');
  await wait(1000);
  const dishStats = await measure(SHORT_S, feed);
  const aggCtx = priv.aggCanvas.getContext('2d')!;
  const aggData = aggCtx.getImageData(0, 0, priv.aggCanvas.width, priv.aggCanvas.height).data;
  let aggPixels = 0;
  for (let i = 3; i < aggData.length; i += 4) if (aggData[i]! > 0) aggPixels++;
  const wholeDish = {
    zoom: r2(renderer.camera.zoom),
    fitZoom: r2(renderer.camera.fitZoom()),
    aggregationVisible: priv.aggSprite.visible,
    aggregationCellsPainted: aggPixels,
    particlesVisible: priv.particles.visible,
    particlesAlpha: r2(priv.particles.alpha),
    spritePixelScale: renderer.camera.spritePixelScale(),
    ...dishStats,
  };

  // Where aggregation takes over, across zoom levels.
  const sweep: {
    zoom: number;
    aggregationVisible: boolean;
    particlesVisible: boolean;
    particlesAlpha: number;
    spritePixelScale: number;
  }[] = [];
  for (const z of [2, 3, 3.5, 4, 4.5, 5, 6, 7, 8]) {
    renderer.camera.centerOn(CX, CY, z);
    await nextFrame();
    await nextFrame();
    sweep.push({
      zoom: r2(renderer.camera.zoom),
      aggregationVisible: priv.aggSprite.visible,
      particlesVisible: priv.particles.visible,
      particlesAlpha: r2(priv.particles.alpha),
      spritePixelScale: renderer.camera.spritePixelScale(),
    });
  }

  // Reduced motion: control (off) then on, at neighborhood zoom with births and deaths streaming.
  renderer.zoomPreset('neighborhood', [CX, CY]);
  say('reduced motion audit');
  await wait(500);
  const motionOn = await effectsWindow(renderer, priv, manifest, reverse, 2000);
  renderer.setOptions({ reducedMotion: true });
  await wait(700); // let in-flight effects (≤ 500 ms) expire…
  await nextFrame(); // …and be cleaned up by at least two renderer frames
  await nextFrame();
  const motionOff = await effectsWindow(renderer, priv, manifest, reverse, 2000);
  const reducedMotion = {
    control: motionOn,
    reduced: motionOff,
    pass:
      motionOn.particlesSampled > 0 &&
      motionOff.particlesSampled > 0 &&
      motionOn.maxEffects > 0 &&
      motionOn.maxOffReducedFrame > 0 &&
      motionOff.maxEffects === 0 &&
      motionOff.ringAdded === 0 &&
      motionOff.maxOffReducedFrame === 0,
    trailsImplemented: false,
  };
  say(`neighborhood, reduced motion: measuring ${SHORT_S}s`);
  const neighborhoodReduced = await measure(SHORT_S, feed);
  feed.stop();
  const cpuOnly = await cpu();

  publish({
    ok: true,
    env,
    gpu,
    canvas,
    baseline,
    neighborhood,
    wholeDish,
    sweep,
    reducedMotion,
    neighborhoodReduced,
    cpu: cpuOnly,
    snapshotsDelivered: feed.delivered,
  });
  say('done');
}

main().catch((e: unknown) => {
  publish({ ok: false, error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) });
  say(`error: ${String(e)}`);
});
