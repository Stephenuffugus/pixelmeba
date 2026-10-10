/**
 * Phase 3 performance stress (BUILD_DIRECTIVE P3.12; ARCH §13; SPEC §2.5, §16; CT §14).
 *
 *   node --expose-gc --import tsx tools/perf-stress.ts [--ticks 9000] [--seed 6000] [--hash-at 3000]
 *       [--save-at 3000] [--snapshot-every 10] [--no-stages] [--out file.json]
 *   npx tsx tools/perf-stress.ts --hashes [--stress-only]     (the hash-neutrality probe, see hashes())
 *
 * Builds the target population IN MEMORY (not a content recipe; nothing under content/ changes): a
 * Water Garden variant with 6,000 live agents, 2,000 of them fungal segments (1,000 F01 Threadlace on a
 * gel pad with visual links, 1,000 F02 Cordweaver on a sediment band with transport links), and every
 * Phase 3 system acting: film (B02 Velvet and E10 Matrix-building Sprinters), fungal transport, X01
 * Hitchers beside A01 Sunbeads, V01 phage dosed onto Sprinters, the enzyme producers B06/B07/B08 on
 * starch/oil/protein deposits with an M09 breaker patch, M10 pellets and M11 wafers, walls, beads, stones,
 * gel and sediment, the consumers P01–P04 and E04/E07/E12 carriers. (No stones: the Water Garden's two
 * are removed so the gel pad has room; walls and beads are the structures.) The founders go through the ordinary
 * recipe realization (distinct cells, logged inputs); the fungal links, the phage dose, the breaker and
 * the food objects are added afterwards through the link store and the Lab commands, then the ledger is
 * re-based so the dish starts closed on its own books (sim-run's ledger check stays meaningful).
 *
 * Then runs `--ticks` ticks at 1× headless (step(), as DishHost.stepDish does) and prints one JSON
 * document: per-tick wall and process-CPU percentiles, the per-stage breakdown, agent counts, heap
 * every simulated minute (after a forced GC when --expose-gc is given), the stateHash at `--hash-at`
 * (the hash-neutrality proof), save build/parse time and size (buildSaveFile / loadSaveFile), and the
 * snapshot cost and bytes per part, measured by calling the functions DishHost.sendSnapshot calls
 * (packEntities, packDeposits, packLinks, packObjects, packOverlay, visualEvents, packLineageMarks,
 * buildInspector, evolutionState + creationFounders, heldSummary) every `--snapshot-every` ticks,
 * outside the tick timing. Snapshot work reads world state only, so measuring it changes nothing.
 *
 * Wall time on a shared machine counts waiting for a CPU: the record carries the load average before and
 * after, the CPU model, core count and Node version.
 */
import { writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { performance } from 'node:perf_hooks';
import { applyNow, type CommandPayload } from '../src/sim/commands';
import type { ContentRegistry } from '../src/sim/content/registry';
import type { RecipeDef } from '../src/sim/content/schema';
import { AGENT_CAP, FUNGAL_CAP, GRID_W } from '../src/sim/constants';
import { creationFounders } from '../src/sim/founders';
import { checkLedger, initializeLedger } from '../src/sim/ledger';
import { packLineageMarks } from '../src/sim/lineage';
import { addFungalLink, LINK_TRANSPORT, LINK_VISUAL } from '../src/sim/links';
import { evolutionState, isMutationPreset } from '../src/sim/mutation';
import type { MutationPreset } from '../src/sim/world';
import { realizeRecipe } from '../src/sim/recipes';
import { heldSummary } from '../src/sim/sample';
import { stateHash } from '../src/sim/serialize';
import { step, type StepHooks } from '../src/sim/tick';
import { isAnchored } from '../src/sim/anchor';
import { profileOf } from '../src/sim/profiles';
import { R } from '../src/sim/reasons';
import type { World } from '../src/sim/world';
import {
  buildInspector,
  lociOfBirth,
  packDeposits,
  packEntities,
  packLinks,
  packObjects,
  packOverlay,
  visualEvents,
} from '../src/worker/snapshot';
import { buildSaveFile, loadSaveFile } from '../src/persistence/saveFile';
import { loadRegistryFs } from './lib/content-fs';

export const STRESS_SEED = 6000;
export const STRESS_AGENTS = AGENT_CAP;
export const STRESS_FUNGAL = FUNGAL_CAP;

/** Where the habitat pieces sit (also read by tests/perf/stress-shape.test.ts). */
export const STRESS_LAYOUT = {
  gel: { center: [34, 46] as const, radius: 21 },
  sediment: { y0: 94, y1: 127 },
  wall: { x0: 58, x1: 82, y: 72 },
  beads: [
    [104, 60, 2],
    [46, 82, 2],
  ] as const,
  /** The dim pool the E07 light seekers start in. */
  dim: { center: [98, 44] as const, radius: 6 },
  /** The Sunbead / Hitcher neighbourhood. */
  sunbeads: { center: [94, 70] as const, radius: 20 },
  /** The phage dose (a dense Sprinter colony around it). */
  phage: { center: [70, 50] as const, radius: 3 },
  starch: { center: [56, 60] as const, radius: 4 },
  oil: { center: [80, 54] as const, radius: 4 },
  protein: { center: [70, 84] as const, radius: 4 },
} as const;

type Founder = RecipeDef['founders'][number];

function founder(
  species: string,
  count: number,
  center: readonly [number, number],
  radius: number,
  extra: Partial<Founder> = {},
): Founder {
  return {
    species,
    count,
    center: [center[0], center[1]],
    radius,
    modules: [],
    moduleAssignment: 'all',
    placement: 'scatter',
    ...extra,
  };
}

/**
 * The stress recipe: built from FIRST_DISH_V1's record (so every required field is valid), never
 * registered as content. Founder groups are realized in order; fungi first, so they get their pads.
 */
export function stressRecipe(reg: ContentRegistry): RecipeDef {
  const base = reg.recipes.FIRST_DISH_V1!;
  const L = STRESS_LAYOUT;
  const whole = [64, 64] as const;
  // F02: every third segment starts as a donor (B 3.2 > B0 2) so transport acts from the first second.
  const f02Initial = Array.from({ length: 1000 }, (_, k) => (k % 3 === 0 ? { B: 3.2, N: 0.32 } : {}));
  return {
    ...base,
    id: 'PERF_STRESS_6000',
    name: 'Performance stress (6,000 agents)',
    seed: STRESS_SEED,
    lid: 'open',
    // The Water Garden's two stones are removed (removeStones also drops any stone op a recipe adds);
    // the structures here are the wall line and the beads.
    removeStones: true,
    mutationPreset: 'standard',
    founderMode: 'identical',
    // Food for a dense dish to stay dense for 15 simulated minutes (nothing is added after setup): a
    // first trial with 0.08 sugar collapsed to ~700 agents by minute 9 (the fungal pads starved in
    // minutes 2–4), which would have measured an easy dish. Fungal segments never move and eat only their
    // own cell, so the pads carry 15 minutes of food (trials with 8 and 30 detritus per gel cell lost every
    // Threadlace to starvation by minutes 9 and 10). Buffer 4 damps the Bubbles' acid near the pads.
    backgroundOverrides: { sugar: 1.5, nutrient: 0.6, buffer: 4 },
    ops: [
      { op: 'disk', center: [L.gel.center[0], L.gel.center[1]], radius: L.gel.radius, substrate: 'gel' },
      { op: 'rect', x0: 0, x1: 127, y0: L.sediment.y0, y1: L.sediment.y1, substrate: 'sediment' },
      { op: 'rect', x0: L.wall.x0, x1: L.wall.x1, y0: L.wall.y, y1: L.wall.y, substrate: 'wall' },
      ...L.beads.map(([x, y, r]) => ({
        op: 'disk' as const,
        center: [x, y] as [number, number],
        radius: r,
        substrate: 'bead' as const,
      })),
      // A dim pool (light 0.3 in bright 0.8 water) for the E07 Sunbeads to climb out of.
      { op: 'disk', center: [L.dim.center[0], L.dim.center[1]], radius: L.dim.radius, light: 0.3 },
    ],
    fieldPatches: [
      {
        center: [L.gel.center[0], L.gel.center[1]],
        radius: L.gel.radius,
        substrate: 'gel',
        add: { detritus: 70, detritusN: 7, sugar: 2 },
        set: {},
        label: 'Debris on the gel pad',
      },
      {
        center: [64, 112],
        radius: 33,
        substrate: 'sediment',
        add: { sugar: 20, detritus: 50, detritusN: 5 },
        set: {},
        label: 'Food on the sediment band',
      },
      {
        center: [64, 122],
        radius: 6,
        substrate: 'sediment',
        add: {},
        set: { oxygen: 0.05 },
        label: 'Low-oxygen sediment',
      },
      {
        center: [L.starch.center[0], L.starch.center[1]],
        radius: L.starch.radius + 2,
        substrate: 'water',
        add: { starch: 3, starchN: 0.3 },
        set: {},
        label: 'Starch',
      },
      {
        center: [L.oil.center[0], L.oil.center[1]],
        radius: L.oil.radius + 2,
        substrate: 'water',
        add: { oil: 3, oilN: 0.3 },
        set: {},
        label: 'Oil',
      },
      {
        center: [L.protein.center[0], L.protein.center[1]],
        radius: L.protein.radius + 2,
        substrate: 'water',
        add: { protein: 3, proteinN: 0.3 },
        set: {},
        label: 'Protein',
      },
      {
        center: [70, 50],
        radius: 8,
        substrate: 'water',
        add: { sugar: 2 },
        set: {},
        label: 'Sugar under the phage colony',
      },
      {
        center: [40, 76],
        radius: 6,
        substrate: 'water',
        add: { sugar: 2 },
        set: {},
        label: 'Sugar for the film builders',
      },
    ],
    founders: [
      // 2,000 fungal segments: nearest-first, so each species makes one compact pad.
      founder('F01', 1000, L.gel.center, L.gel.radius, { placement: 'nearest' }),
      founder('F02', 1000, [64, 112], 33, { placement: 'nearest', initial: f02Initial }),
      // Module carriers and clustered neighbourhoods (nearest-first so they touch).
      founder('B01', 80, L.phage.center, 8, { placement: 'nearest' }),
      founder('B01', 40, [40, 76], 5, { placement: 'nearest', modules: ['E10'] }),
      founder('B01', 30, [60, 40], 6, { placement: 'nearest', modules: ['E12'] }),
      // E04 Sprinters in open water (no support there, so they stay free and swim; the cost of carrying
      // the module is still paid every tick).
      founder('B01', 12, [88, 38], 6, { placement: 'nearest', modules: ['E04'] }),
      founder('B01', 12, [64, 26], 5, { placement: 'nearest', modules: ['E04'] }),
      founder('A01', 500, L.sunbeads.center, L.sunbeads.radius),
      founder('A01', 60, L.dim.center, L.dim.radius, { modules: ['E07'] }),
      // Non-motile E04 carriers right under the wall anchor as a state (anchor.ts); the Sprinter carriers
      // above may swim off before their 5 s attach clock completes.
      founder('Y02', 12, [70, 73], 3, { placement: 'nearest', modules: ['E04'] }),
      founder('X01', 150, L.sunbeads.center, L.sunbeads.radius),
      founder('B06', 40, L.starch.center, L.starch.radius + 3, { placement: 'nearest' }),
      founder('B07', 40, L.oil.center, L.oil.radius + 3, { placement: 'nearest' }),
      founder('B08', 40, L.protein.center, L.protein.radius + 3, { placement: 'nearest' }),
      founder('P04', 60, [64, 104], 30),
      founder('B03', 150, [64, 112], 30),
      // The rest scattered across the whole dish.
      founder('B01', 766, whole, 60),
      founder('B02', 300, whole, 60),
      founder('B04', 300, whole, 60),
      founder('B05', 200, whole, 60),
      founder('B06', 160, whole, 60),
      founder('B07', 160, whole, 60),
      founder('B08', 160, whole, 60),
      founder('A01', 140, whole, 60),
      founder('Y01', 150, whole, 60),
      founder('Y02', 138, whole, 60),
      founder('P01', 120, whole, 60),
      founder('P02', 120, whole, 60),
      founder('P03', 60, whole, 60),
    ],
    scheduledCommands: [],
    testOnlyOverrides: [],
  };
}

export interface StressBuild {
  readonly world: World;
  /** Fungal links added: visual (F01) and transport (F02). */
  readonly links: { readonly visual: number; readonly transport: number };
  readonly setupMs: number;
}

let cmdSeq = 0;
function cmd(w: World, payload: CommandPayload): void {
  const res = applyNow(w, `stress-${++cmdSeq}`, payload).result!;
  if (res.accepted <= 0)
    throw new Error(`stress setup command refused: ${JSON.stringify(payload)} → ${JSON.stringify(res)}`);
}

/**
 * Link one fungal species' segments into trees (as branching grows them): along each row run every
 * segment links to its west neighbour, and the leftmost segment of a run links to the segment north of
 * it when there is one. Each run adds at most one edge to what is already built, so there are no cycles.
 */
function linkPads(w: World, speciesId: string, kind: typeof LINK_VISUAL | typeof LINK_TRANSPORT): number {
  const c = w.ents.cols;
  const spIdx = w.species.findIndex((s) => s.id === speciesId);
  const at = new Int32Array(128 * 128).fill(-1);
  for (let i = 0; i < w.ents.highWater; i++)
    if (c.alive[i] === 1 && c.species[i] === spIdx)
      at[Math.floor(c.y[i]!) * GRID_W + Math.floor(c.x[i]!)] = i;
  let n = 0;
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const s = at[y * GRID_W + x]!;
      if (s < 0) continue;
      const west = x > 0 ? at[y * GRID_W + x - 1]! : -1;
      if (west >= 0) {
        if (addFungalLink(w, west, s, kind)) n++;
      } else if (y > 0 && at[(y - 1) * GRID_W + x]! >= 0) {
        if (addFungalLink(w, at[(y - 1) * GRID_W + x]!, s, kind)) n++;
      }
    }
  return n;
}

/** Setup steps a non-vacuity check may leave out (the stress run itself never omits anything). */
export type StressPart = 'links' | 'phage' | 'breaker' | 'objects';

export function buildStressWorld(
  reg: ContentRegistry = loadRegistryFs(),
  seed = STRESS_SEED,
  omit: readonly StressPart[] = [],
  /** Diagnostic only (--mutation): another preset than the stress dish's 'standard'. */
  mutationPreset?: MutationPreset,
): StressBuild {
  const t0 = performance.now();
  const recipe = stressRecipe(reg);
  const w = realizeRecipe(reg, mutationPreset ? { ...recipe, mutationPreset } : recipe, { seed, worldId: 'perf-stress' });
  const visual = omit.includes('links') ? 0 : linkPads(w, 'F01', LINK_VISUAL);
  const transport = omit.includes('links') ? 0 : linkPads(w, 'F02', LINK_TRANSPORT);
  const L = STRESS_LAYOUT;
  if (!omit.includes('phage'))
    cmd(w, {
      kind: 'inoculate',
      speciesId: 'V01',
      x: L.phage.center[0],
      y: L.phage.center[1],
      radius: L.phage.radius,
      count: 20,
    });
  if (!omit.includes('breaker'))
    cmd(w, {
      kind: 'deposit',
      materialId: 'M09',
      points: [[L.oil.center[0], L.oil.center[1]]],
      radius: 2,
      dose: 0.5,
    });
  // Food objects: 16 pellets and 16 wafers on a ring through open water.
  for (let k = 0; k < (omit.includes('objects') ? 0 : 32); k++) {
    const a = (2 * Math.PI * k) / 32;
    const x = Math.floor(64 + 30 * Math.cos(a)) + 0.5;
    const y = Math.floor(60 + 26 * Math.sin(a)) + 0.5;
    const payload: CommandPayload = { kind: 'placeObject', materialId: k % 2 === 0 ? 'M10' : 'M11', x, y };
    const res = applyNow(w, `stress-obj-${k}`, payload).result!;
    if (res.accepted <= 0) continue; // a structure or full cell: skip, the count is reported
  }
  // The dish starts on its own books: initial := current totals (setup inputs folded in).
  initializeLedger(w);
  w.ledger.inputs = { c: 0, n: 0, m: 0 };
  w.ledger.exports = { c: 0, n: 0, m: 0 };
  w.ledger.exchangeC = 0;
  return { world: w, links: { visual, transport }, setupMs: performance.now() - t0 };
}

/** Living agents, fungal segments and per-species counts (observation only). */
export function census(w: World): { alive: number; fungal: number; species: Record<string, number> } {
  const c = w.ents.cols;
  const species: Record<string, number> = {};
  let fungal = 0;
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const sp = w.species[c.species[i]!]!;
    species[sp.id] = (species[sp.id] ?? 0) + 1;
    if (sp.fungal) fungal++;
  }
  return { alive: w.ents.count, fungal, species };
}

// ---- Non-vacuity: when each mechanism first acted ------------------------------------------------

/**
 * The mechanisms the stress dish exercises. tests/perf/stress-shape.test.ts asserts each one of
 * EARLY_MECHANISMS fires; 'fungalCapBlocked' (a segment ready to branch refused by the 2,000 cap) needs
 * a segment 35 s old and is reported by the 15-minute run only.
 */
export const MECHANISMS = [
  'birth',
  'death',
  'capture',
  'film',
  'fungalTransfer',
  'fungalCapBlocked',
  'infection',
  'lysis',
  'parasiteAttached',
  'parasiteDrain',
  'starchConversion',
  'oilConversion',
  'proteinConversion',
  'objectRelease',
  'adhesionLink',
  'anchored',
  'lightSeekerMoved',
  'acidRelease',
] as const;
export type Mechanism = (typeof MECHANISMS)[number];
export const EARLY_MECHANISMS: readonly Mechanism[] = MECHANISMS.filter((m) => m !== 'fungalCapBlocked');

/**
 * Observes a stress world tick by tick (reads only; never writes world state) and records the first
 * tick each mechanism acted. `hooks` go to step(); call `afterTick` after every step.
 */
export class MechanismWatch {
  readonly first: Record<Mechanism, number | null>;
  private lastEvent: number;
  private readonly objects0: Map<number, number>;
  private readonly x01: number;
  readonly hooks: StepHooks;

  constructor(world: World) {
    this.first = Object.fromEntries(MECHANISMS.map((m) => [m, null])) as Record<Mechanism, number | null>;
    this.lastEvent = world.counters.nextEventId - 1;
    this.objects0 = new Map(world.objects.map((o) => [o.id, objectCarbon(o)]));
    this.x01 = world.species.findIndex((sp) => sp.id === 'X01');
    this.hooks = {
      afterStage: (stage, w) => {
        const c = w.ents.cols;
        if (stage === 6 && this.first.parasiteDrain === null) {
          for (let i = 0; i < w.ents.highWater; i++)
            if (
              c.alive[i] === 1 &&
              c.species[i] === this.x01 &&
              c.hostSlot[i]! >= 0 &&
              c.lastIntakeTick[i] === w.tick
            ) {
              this.mark('parasiteDrain', w.tick);
              break;
            }
        } else if (stage === 8 && (w.history.pendingFungalTransfer ?? 0) > 0)
          this.mark('fungalTransfer', w.tick);
      },
    };
  }

  private mark(m: Mechanism, tick: number): void {
    if (this.first[m] === null) this.first[m] = tick;
  }

  /** Mechanisms that have not acted yet. */
  missing(): Mechanism[] {
    return MECHANISMS.filter((m) => this.first[m] === null);
  }

  afterTick(w: World): void {
    const t = w.tick;
    for (const e of w.events.ring) {
      if (e.id <= this.lastEvent) continue;
      if (e.type === 'birth') {
        this.mark('birth', t);
      } else if (e.type === 'death') {
        this.mark('death', t);
        if (e.cause === R.DEATH_LYSIS) this.mark('lysis', t);
      } else if (e.type === 'capture') this.mark('capture', t);
      else if (e.type === 'linkFormed' && e.detail?.kind === 'adhesion') this.mark('adhesionLink', t);
    }
    this.lastEvent = w.counters.nextEventId - 1;
    const film = w.fields.film;
    if (this.first.film === null && film)
      for (let k = 0; k < film.length; k++)
        if (film[k]! > 0) {
          this.mark('film', t);
          break;
        }
    const acid = w.fields.acid;
    if (this.first.acidRelease === null && acid)
      for (let k = 0; k < acid.length; k++)
        if (acid[k]! > 0) {
          this.mark('acidRelease', t);
          break;
        }
    if (w.conversionTotals.starch > 0) this.mark('starchConversion', t);
    if (w.conversionTotals.oil > 0) this.mark('oilConversion', t);
    if (w.conversionTotals.protein > 0) this.mark('proteinConversion', t);
    for (const o of w.objects)
      if (objectCarbon(o) < (this.objects0.get(o.id) ?? 0)) this.mark('objectRelease', t);
    if (w.objects.length < this.objects0.size) this.mark('objectRelease', t);
    const c = w.ents.cols;
    for (let i = 0; i < w.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      if (c.infectedBy[i] !== 0) this.mark('infection', t);
      // The pad starts at the 2,000-segment cap (SPEC §2.5), so a segment ready to branch is refused for capacity.
      if (c.divBlockCode[i] === R.DIV_BLOCK_CAPACITY && w.species[c.species[i]!]!.fungal)
        this.mark('fungalCapBlocked', t);
      if (c.species[i] === this.x01 && c.hostSlot[i]! >= 0) this.mark('parasiteAttached', t);
      if (isAnchored(w, i)) this.mark('anchored', t);
      if (c.movedThisTick[i]! > 0 && profileOf(w, i).lightSeeker !== null) this.mark('lightSeekerMoved', t);
    }
  }
}

const REASON_NAMES: ReadonlyMap<number, string> = new Map<number, string>(
  Object.entries(R).map(([k, v]) => [v, k]),
);
function reasonName(code: number): string {
  return REASON_NAMES.get(code) ?? String(code);
}

function objectCarbon(o: World['objects'][number]): number {
  return (o.pools.sugar ?? 0) + (o.pools.starch ?? 0) + (o.pools.protein ?? 0);
}

// ---- Measurement --------------------------------------------------------------------------------

function pct(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
function dist(values: readonly number[]): {
  n: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
} {
  const s = [...values].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  return {
    n: s.length,
    mean: r3(mean),
    p50: r3(pct(s, 0.5)),
    p95: r3(pct(s, 0.95)),
    p99: r3(pct(s, 0.99)),
    max: r3(s.at(-1) ?? 0),
  };
}

const STAGE_NAMES = [
  'commands',
  'environment',
  'conversion',
  'senseMove',
  'contacts',
  'intake',
  'maintenance',
  'structures',
  'births',
  'publish',
] as const;

interface SnapPart {
  ms: number[];
  bytes: number[];
}

/** One snapshot, as DishHost.sendSnapshot builds it (selection, overlay and lineage view all on: the worst case). */
function measureSnapshot(
  w: World,
  parts: Record<string, SnapPart>,
  st: { lastEventId: number; lastGeometry: number; selected: number },
): void {
  const t = (name: string, f: () => number): void => {
    const t0 = performance.now();
    const bytes = f();
    const p = (parts[name] ??= { ms: [], bytes: [] });
    p.ms.push(performance.now() - t0);
    p.bytes.push(bytes);
  };
  const json = (v: unknown): number => JSON.stringify(v).length;
  let count = 0;
  t('ents+ids', () => {
    const p = packEntities(w, null, null);
    count = p.count;
    return p.ents.byteLength + p.ids.byteLength;
  });
  t('deposits', () => packDeposits(w, null).byteLength);
  t('links', () => packLinks(w).byteLength);
  t('objects', () => json(packObjects(w)));
  t('overlay(sugar)', () => packOverlay(w, 'sugar', null, null)?.data.byteLength ?? 0);
  t('overlay(foodAccess)', () => packOverlay(w, 'foodAccess', null, null)?.data.byteLength ?? 0);
  t('events', () => {
    const ev = visualEvents(w.events.ring, st.lastEventId, w.content.modules, lociOfBirth(w));
    st.lastEventId = w.counters.nextEventId - 1;
    return json(ev);
  });
  t('lineageMarks', () => packLineageMarks(w, 0, null).marks.byteLength);
  t('geometry', () => {
    if (st.lastGeometry === w.grid.geometryVersion) return 0;
    st.lastGeometry = w.grid.geometryVersion;
    return (
      new Uint8Array(w.grid.substrate).byteLength +
      new Uint8Array(w.grid.structure).byteLength +
      new Float32Array(w.grid.shade).byteLength
    );
  });
  // The inspector follows one F02 segment (its network summary is the costliest entity payload), and a
  // cell selection on the sediment band (reactions, provenance, object line).
  const c = w.ents.cols;
  if (st.selected < 0 || c.alive[st.selected] !== 1) {
    st.selected = -1;
    for (let i = 0; i < w.ents.highWater; i++)
      if (c.alive[i] === 1 && w.species[c.species[i]!]!.id === 'F02') {
        st.selected = i;
        break;
      }
  }
  if (st.selected >= 0) {
    const birthId = c.birthId[st.selected]!;
    t('inspector(entity F02)', () => json(buildInspector(w, { kind: 'entity', birthId })));
  }
  t('inspector(cell)', () => json(buildInspector(w, { kind: 'cell', cell: 112 * GRID_W + 64 })));
  t('evolution', () => json({ ...evolutionState(w), creation: creationFounders(w) }));
  t('sample', () => json(heldSummary(w)));
  void count;
}

/**
 * Save build and load, timed (buildSaveFile / loadSaveFile, as the host's save and import do). In its own
 * async function so the loaded copy is released on return: an async function keeps every local that lived
 * across an await reachable until it returns (a first version held the reloaded 6,000-agent world for the
 * rest of the run, a ~15 MB step in the heap series).
 */
async function measureSave(
  w: World,
): Promise<{
  tick: number;
  buildSaveFileMs: number;
  loadSaveFileMs: number;
  textBytes: number;
  reloadHashMatches: boolean;
}> {
  const s0 = performance.now();
  const built = await buildSaveFile(w, {
    name: 'Perf stress',
    savedAt: '2026-10-10T00:00:00.000Z',
    recipeId: 'FIRST_DISH_V1',
  });
  const s1 = performance.now();
  const loaded = await loadSaveFile(built.text);
  const s2 = performance.now();
  return {
    tick: w.tick,
    buildSaveFileMs: r3(s1 - s0),
    loadSaveFileMs: r3(s2 - s1),
    textBytes: built.text.length,
    reloadHashMatches: stateHash(loaded.world) === stateHash(w),
  };
}

interface Args {
  ticks: number;
  seed: number;
  hashAt: number;
  snapshotEvery: number;
  stages: boolean;
  out?: string;
  saveAt: number;
  mutation?: MutationPreset;
}

function parseArgs(argv: string[]): Args {
  const get = (n: string): string | undefined => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const ticks = Number(get('ticks') ?? '9000');
  return {
    ticks,
    seed: Number(get('seed') ?? STRESS_SEED),
    hashAt: Number(get('hash-at') ?? '3000'),
    snapshotEvery: Number(get('snapshot-every') ?? '10'),
    stages: !argv.includes('--no-stages'),
    saveAt: Number(get('save-at') ?? String(Math.min(ticks, 3000))),
    ...(get('out') !== undefined ? { out: get('out')! } : {}),
    ...(isMutationPreset(get('mutation') ?? '') ? { mutation: get('mutation') as MutationPreset } : {}),
  };
}

function heapNow(): {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
  arrayBuffersMB: number;
} {
  const g = (globalThis as { gc?: () => void }).gc;
  if (g) g();
  const m = process.memoryUsage();
  const mb = (v: number): number => Math.round((v / 1048576) * 100) / 100;
  return {
    heapUsedMB: mb(m.heapUsed),
    heapTotalMB: mb(m.heapTotal),
    rssMB: mb(m.rss),
    externalMB: mb(m.external),
    arrayBuffersMB: mb(m.arrayBuffers),
  };
}

/** Least-squares slope of y over x. */
function slope(xs: readonly number[], ys: readonly number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let k = 0; k < n; k++) {
    num += (xs[k]! - mx) * (ys[k]! - my);
    den += (xs[k]! - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const machine = {
    cpuModel: cpus()[0]?.model ?? 'unknown',
    cores: cpus().length,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    exposeGc: typeof (globalThis as { gc?: unknown }).gc === 'function',
  };
  const loadBefore = loadavg().map((v) => Math.round(v * 100) / 100);
  const reg = loadRegistryFs();
  const build = buildStressWorld(reg, args.seed, [], args.mutation);
  const w = build.world;
  const start = census(w);
  process.stderr.write(
    `[perf-stress] built in ${build.setupMs.toFixed(0)} ms: ${start.alive} agents, ${start.fungal} fungal, links ${JSON.stringify(build.links)}, objects ${w.objects.length}\n`,
  );

  const wall: number[] = [];
  const cpu: number[] = [];
  const stageMs = new Array<number>(11).fill(0);
  const stageMax = new Array<number>(11).fill(0);
  let last = 0;
  const watch = new MechanismWatch(w);
  let watching = true;
  const hooks = args.stages
    ? {
        afterStage: (s: number, world: World) => {
          const now = performance.now();
          const d = now - last;
          stageMs[s]! += d;
          if (d > stageMax[s]!) stageMax[s] = d;
          // The watch reads state between stages; its time is kept out of the stage timings.
          if (watching) watch.hooks.afterStage!(s, world);
          last = performance.now();
        },
      }
    : {
        afterStage: (s: number, world: World) => {
          if (watching) watch.hooks.afterStage!(s, world);
        },
      };
  const heapSeries: ({
    minute: number;
    tick: number;
    agents: number;
    fungal: number;
    genomes: number;
    lineageRecords: number;
  } & ReturnType<typeof heapNow>)[] = [];
  const recordHeap = (): void => {
    const cs = census(w);
    heapSeries.push({
      minute: w.tick / 600,
      tick: w.tick,
      agents: cs.alive,
      fungal: cs.fungal,
      genomes: w.genomes.size,
      lineageRecords: w.lineage.parent.length,
      ...heapNow(),
    });
  };
  recordHeap();
  const parts: Record<string, SnapPart> = {};
  const snapState = { lastEventId: w.counters.nextEventId - 1, lastGeometry: -1, selected: -1 };
  measureSnapshot(w, parts, snapState); // the first snapshot carries geometry
  let hashAt: string | null = null;
  let save: unknown = null;
  let agentsMin = w.ents.count;
  let agentsMax = w.ents.count;
  let agentsSum = 0;
  let fungalMin = start.fungal;
  const deaths: Record<string, number> = {};
  let deathSeen = w.counters.nextEventId - 1;
  const cpuLoop0 = process.cpuUsage();
  const wall0 = performance.now();
  for (let t = 0; t < args.ticks; t++) {
    const c0 = process.cpuUsage();
    const t0 = performance.now();
    last = t0;
    step(w, hooks);
    const t1 = performance.now();
    const c1 = process.cpuUsage(c0);
    wall.push(t1 - t0);
    cpu.push((c1.user + c1.system) / 1000);
    // Deaths by species and cause (reads the event ring; observation only).
    for (const ev of w.events.ring) {
      if (ev.id <= deathSeen) continue;
      if (ev.type === 'death') {
        const key = `${w.species[ev.species ?? 0]?.id ?? '?'}:${reasonName(ev.cause ?? 0)}`;
        deaths[key] = (deaths[key] ?? 0) + 1;
      }
    }
    deathSeen = w.counters.nextEventId - 1;
    if (watching) {
      watch.afterTick(w);
      if (watch.missing().length === 0) watching = false;
    }
    agentsSum += w.ents.count;
    if (w.ents.count < agentsMin) agentsMin = w.ents.count;
    if (w.ents.count > agentsMax) agentsMax = w.ents.count;
    if (w.tick === args.hashAt) hashAt = stateHash(w);
    if (args.snapshotEvery > 0 && w.tick % args.snapshotEvery === 0) measureSnapshot(w, parts, snapState);
    if (w.tick % 600 === 0) {
      recordHeap();
      const h = heapSeries.at(-1)!;
      fungalMin = Math.min(fungalMin, h.fungal);
      process.stderr.write(
        `[perf-stress] minute ${h.minute}: ${h.agents} agents (${h.fungal} fungal), heap ${h.heapUsedMB} MB, load ${loadavg()[0]!.toFixed(2)}\n`,
      );
    }
    if (w.tick === args.saveAt) save = await measureSave(w);
  }
  const wallMs = performance.now() - wall0;
  const cpuLoop = process.cpuUsage(cpuLoop0);
  const loadAfter = loadavg().map((v) => Math.round(v * 100) / 100);
  const end = census(w);
  const ledger = checkLedger(w);
  // Heap slope over minutes 5–15 (or the available tail), % of the minute-5 value per minute.
  const tail = heapSeries.filter((h) => h.minute >= 5);
  const heapSlope =
    tail.length >= 2
      ? slope(
          tail.map((h) => h.minute),
          tail.map((h) => h.heapUsedMB),
        )
      : null;
  const snapshot = Object.fromEntries(
    Object.entries(parts).map(([k, p]) => {
      const nonZero = p.bytes.filter((b) => b > 0);
      return [
        k,
        {
          ms: dist(p.ms),
          bytes: {
            mean: Math.round(nonZero.reduce((a, b) => a + b, 0) / Math.max(1, nonZero.length)),
            max: Math.max(0, ...p.bytes),
            sentIn: nonZero.length,
            of: p.bytes.length,
          },
        },
      ];
    }),
  );
  const perSnapshotMs: number[] = [];
  const n = parts['ents+ids']?.ms.length ?? 0;
  for (let k = 0; k < n; k++) {
    let s = 0;
    for (const p of Object.values(parts)) s += p.ms[k] ?? 0;
    perSnapshotMs.push(s);
  }
  const out = {
    tool: 'tools/perf-stress.ts',
    command: `node ${process.execArgv.join(' ')} tools/perf-stress.ts ${process.argv.slice(2).join(' ')}`
      .replace(/\s+/g, ' ')
      .trim(),
    machine,
    loadAverage: { before: loadBefore, after: loadAfter },
    seed: args.seed,
    ticks: w.tick,
    setup: { ms: r3(build.setupMs), links: build.links, objects: w.objects.length, start },
    agents: {
      start: start.alive,
      end: end.alive,
      min: agentsMin,
      max: agentsMax,
      mean: Math.round((agentsSum / Math.max(1, args.ticks)) * 10) / 10,
      fungalStart: start.fungal,
      fungalEnd: end.fungal,
      fungalMin,
    },
    endSpecies: end.species,
    mechanismsFirstTick: watch.first,
    deathsBySpeciesAndCause: Object.fromEntries(Object.entries(deaths).sort(([a], [b]) => (a < b ? -1 : 1))),
    tick: {
      wallMs: dist(wall),
      cpuMs: dist(cpu),
      loopWallMs: r3(wallMs),
      loopCpuMs: r3((cpuLoop.user + cpuLoop.system) / 1000),
      cpuShareOfWall: r3((cpuLoop.user + cpuLoop.system) / 1000 / wallMs),
    },
    stagesMsPerTick: args.stages
      ? Object.fromEntries(
          STAGE_NAMES.map((name, k) => [
            `${k + 1}.${name}`,
            { mean: r3(stageMs[k + 1]! / Math.max(1, args.ticks)), max: r3(stageMax[k + 1]!) },
          ]),
        )
      : null,
    hash: { at: args.hashAt, stateHash: hashAt, endpoint: stateHash(w) },
    ledger: { ok: ledger.ok, relErrC: ledger.relErr.c, relErrN: ledger.relErr.n },
    heap: {
      series: heapSeries,
      slopeMinutes5to15MBPerMin: heapSlope === null ? null : r3(heapSlope),
      slopePctPerMin:
        heapSlope === null || tail.length === 0 ? null : r3((100 * heapSlope) / tail[0]!.heapUsedMB),
      // The per-second history keeps the last 30 simulated minutes (CT §12.10; history.ts HISTORY_SECONDS)
      // and 10-second trait samples likewise, so it grows until minute 30 by design. A run past minute 31
      // also reports the slope after that window filled, which is what remains for a long session.
      ...(() => {
        const late = heapSeries.filter((h) => h.minute >= 31);
        if (late.length < 3) return {};
        const s = slope(
          late.map((h) => h.minute),
          late.map((h) => h.heapUsedMB),
        );
        return {
          slopeAfterMinute31MBPerMin: r3(s),
          slopeAfterMinute31PctPerMin: r3((100 * s) / late[0]!.heapUsedMB),
        };
      })(),
    },
    save,
    snapshot: { every: args.snapshotEvery, perSnapshotMs: dist(perSnapshotMs), parts: snapshot },
    events: w.events.totals,
    capacityLimitedTicks: w.capacityLimitedTicks,
    genomes: w.genomes.size,
  };
  const text = JSON.stringify(out, null, 2);
  if (args.out) writeFileSync(args.out, text + '\n');
  console.log(text);
}

/**
 * `--hashes`: the hash-neutrality probe (P3.12). Every fence entry (tests/fixtures/fence.json) realized
 * and run as the fence tests do, under the shipped manifest (stateHash and trajectoryDigest 'full') and,
 * for entries with a g2 digest, under registryWith(G2_LISTS) (stateHash and 'g2' digest); then the
 * stress world's stateHash at ticks 0, 600, 1,500 and 3,000. Run it before and after an optimization:
 * the two outputs must be identical.
 */
async function hashes(): Promise<void> {
  const { readFence, fenceWorld } = await import('../tests/helpers/fence');
  const { registryWith, G2_LISTS } = await import('../tests/helpers/registry');
  const { trajectoryDigest } = await import('../tests/helpers/trajectory');
  const out: Record<string, unknown> = {};
  if (!process.argv.includes('--stress-only')) {
    const shipped = loadRegistryFs();
    const g2 = registryWith(G2_LISTS);
    for (const e of readFence().entries) {
      const w = await fenceWorld(shipped, e);
      const r: Record<string, string> = { shippedHash: stateHash(w), full: trajectoryDigest(w, 'full') };
      if (e.g2Digest !== null) {
        const w2 = await fenceWorld(g2, e);
        r.g2Hash = stateHash(w2);
        r.g2 = trajectoryDigest(w2, 'g2');
      }
      out[e.id] = r;
      process.stderr.write(`${e.id} ${JSON.stringify(r)}\n`);
    }
  }
  const w = buildStressWorld().world;
  const marks: Record<number, string> = { 0: stateHash(w) };
  // The snapshot parts too (worker-side, never hashed by stateHash): a digest of what the host would send.
  const snaps: Record<number, string> = {};
  const { createHash } = await import('node:crypto');
  const digestSnapshot = (): string => {
    const h = createHash('sha256');
    const add = (v: ArrayBufferView | string): void =>
      void h.update(typeof v === 'string' ? v : new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    const p = packEntities(w, null, null);
    add(p.ents.subarray(0, p.count * 14));
    add(p.ids.subarray(0, p.count * 2));
    add(JSON.stringify(p.speciesCounts));
    add(packDeposits(w, null));
    add(packLinks(w));
    add(JSON.stringify(packObjects(w)));
    add(packOverlay(w, 'sugar', null, null)?.data ?? '');
    add(packOverlay(w, 'foodAccess', null, null)?.data ?? '');
    add(packLineageMarks(w, 0, null).marks);
    const c = w.ents.cols;
    for (let i = 0; i < w.ents.highWater; i++)
      if (c.alive[i] === 1 && w.species[c.species[i]!]!.fungal) {
        add(JSON.stringify(buildInspector(w, { kind: 'entity', birthId: c.birthId[i]! })));
        break;
      }
    add(JSON.stringify(buildInspector(w, { kind: 'cell', cell: 112 * GRID_W + 64 })));
    add(JSON.stringify({ ...evolutionState(w), creation: creationFounders(w) }));
    return h.digest('hex').slice(0, 16);
  };
  snaps[0] = digestSnapshot();
  while (w.tick < 3000) {
    step(w);
    if (w.tick === 600 || w.tick === 1500 || w.tick === 3000) {
      marks[w.tick] = stateHash(w);
      snaps[w.tick] = digestSnapshot();
    }
  }
  out.stress = marks;
  out.snapshotDigests = snaps;
  console.log(JSON.stringify(out, null, 1));
}

if (process.argv[1] && /perf-stress\.(ts|mjs)$/.test(process.argv[1])) {
  (process.argv.includes('--hashes') ? hashes() : main()).catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
