/**
 * npm run sim:tune -- [--recipes FIRST_DISH_V1[,…]] [--seeds 104729,130363,…] [--seconds 600]
 *   [--extend 1200] [--preset standard|accelerated] [--out docs/reports/tune-g1.md]
 *
 * Development-seed tuning report (BUILD_DIRECTIVE P1.12; CONTENT_TABLES §11; D06 §18).
 *
 * Protocol: realize each recipe at each development seed, no interventions, and step to --seconds.
 * If no inherited difference exists by then (events.totals.mutation === 0) the run continues to
 * --extend while keeping the first checkpoint's numbers. Everything here only READS world state
 * between ticks (plus a read-only afterStage hook), so the endpoint hash is the same as a plain run.
 *
 * Censoring: a milestone that has not happened by the stopping time is reported as censored and is
 * never treated as an event at the stopping time. The median ranks censored values above every
 * observed value (valid because all seeds share the checkpoint time).
 *
 * If the --out file already exists, any text between `<!-- analysis:start -->` and
 * `<!-- analysis:end -->` is carried over, so hand-written observations survive a regenerated table.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { ContentRegistry } from '../src/sim/content/registry';
import { TICKS_PER_SECOND } from '../src/sim/constants';
import { FLAG, LIFE_ACTIVE } from '../src/sim/entities';
import { diskCells, inMask, maskCells } from '../src/sim/grid';
import { FIELD_DEFS, isFieldId } from '../src/sim/fields';
import { checkLedger } from '../src/sim/ledger';
import {
  MUT_MODULE_GAIN,
  MUT_MODULE_LOSS,
  MUT_PREF,
  MUT_QUANT,
  MUT_QUANT_NEUTRAL,
} from '../src/sim/mutation';
import { profileOf } from '../src/sim/profiles';
import { realizeRecipe } from '../src/sim/recipes';
import { reasonName } from '../src/sim/reasons';
import { stateHash } from '../src/sim/serialize';
import { entityCell } from '../src/sim/spatial';
import { step } from '../src/sim/tick';
import type { HistorySample } from '../src/sim/history';
import type { World } from '../src/sim/world';
import { loadRegistryFs, REPO_ROOT } from './lib/content-fs';

export type Preset = 'standard' | 'accelerated';
export const DEV_SEEDS: readonly number[] = [104729, 130363, 155921, 196613, 262147, 314159];
/** D06 §18 pacing targets (proposed recipe targets, never engine exceptions). */
export const TARGET_INTAKE_SECONDS = 15;
export const TARGET_DIVISION_SECONDS = 120;
export const TARGET_SEEDS_REQUIRED = 5;
const DEFAULT_SAMPLE_SECONDS: readonly number[] = [15, 60, 120, 300, 600, 900, 1200];
export const ANALYSIS_START = '<!-- analysis:start -->';
export const ANALYSIS_END = '<!-- analysis:end -->';

export interface TuneSeedOptions {
  readonly recipe: string;
  readonly seed: number;
  readonly preset: Preset;
  /** First checkpoint (simulated seconds). */
  readonly seconds: number;
  /** Continue to this time when no inherited difference exists at the first checkpoint. */
  readonly extendSeconds: number;
  /** Seconds at which living organisms' recorded reason codes are sampled. */
  readonly sampleSeconds?: readonly number[];
}

export type Tally = Record<string, number>;

export interface SpeciesSample {
  alive: number;
  meanE: number;
  meanBOverB0: number;
  meanH: number;
  stressedFraction: number;
  /** Mean free nutrient / oxygen / sugar in the organisms' cells. */
  meanCellNutrient: number;
  meanCellOxygen: number;
  meanCellSugar: number;
  /** Mean carbon taken in the last completed second (intakeLastSecond). */
  meanIntakePerSecond: number;
  /** Mean position (cell units). */
  meanX: number;
  meanY: number;
  /** Histograms of recorded reason codes (names from src/sim/reasons.ts). */
  limit: Tally;
  /** Sum of the measured value recorded with each limit code (limitValue), for per-code means. */
  limitValueSum: Tally;
  divBlock: Tally;
  /**
   * Starch-enzyme outcomes (secretionCode) of every organism whose profile has producer rules —
   * native producers and E01 carriers alike. The secretion stage writes a code only for Active
   * organisms, so a producer that is Preparing, Resting or Waking is tallied under its recorded
   * state reason (limitCode) instead of a stale secretion outcome.
   */
  secretion: Tally;
}

export interface ReasonSample {
  readonly second: number;
  readonly species: Record<string, SpeciesSample>;
  /** Carbon still present, in each recipe field patch's disk, of the carbon fields that patch added. */
  readonly patches: readonly { label: string; carbon: number }[];
}

interface PatchProbe {
  readonly label: string;
  readonly fields: readonly string[];
  readonly cells: readonly number[];
}

function patchProbes(world: World, registry: ContentRegistry, recipe: string): PatchProbe[] {
  const def = registry.recipes[recipe]!;
  return def.fieldPatches.map((p, n) => ({
    label: `${p.label ?? `patch ${n}`} (${p.center[0]},${p.center[1]}) r${p.radius}`,
    fields: Object.keys(p.add)
      .filter((k) => isFieldId(k) && FIELD_DEFS[k].material === 'carbon' && world.fields[k] !== undefined)
      .sort(),
    cells: diskCells(p.center[0], p.center[1], p.radius).filter((i) => inMask(i % 128, Math.floor(i / 128))),
  }));
}

function patchCarbon(world: World, probes: readonly PatchProbe[]): { label: string; carbon: number }[] {
  return probes.map((p) => {
    let carbon = 0;
    for (const f of p.fields) {
      const arr = world.fields[f as keyof typeof world.fields]!;
      for (const i of p.cells) carbon += arr[i]!;
    }
    return { label: `${p.label}: ${p.fields.join('+')}`, carbon };
  });
}

export interface FoodTotals {
  sugar: number;
  starch: number;
  detritus: number;
  total: number;
}

export interface Checkpoint {
  tick: number;
  seconds: number;
  /** Milestone ticks (tick index during which the event happened) or null when censored. */
  firstIntakeTick: number | null;
  firstIntakeBySpecies: Record<string, number | null>;
  firstDivisionTick: number | null;
  firstDivisionBySpecies: Record<string, number | null>;
  firstMutationTick: number | null;
  /** Committed divisions (one birth event per division; each makes two daughters). */
  births: number;
  deaths: number;
  birthsBySpecies: Tally;
  deathsBySpecies: Tally;
  /** Death causes tallied from retained lineage records (world.lineage.deathCause). */
  deathsByCause: Tally;
  deathsBySpeciesCause: Record<string, Tally>;
  deathCauseCoverage: { tallied: number; total: number; compactedRecords: number };
  counts: Tally;
  biomass: Tally;
  food: FoodTotals;
  nutrientFree: number;
  oxygenMean: number;
  /** Net carbon exchanged with the air through the open lid (ledger), and starch converted by enzyme. */
  carbonFromAir: number;
  starchConverted: number;
  mutations: number;
  /** Mutation descriptor kinds over retained birth records (daughters). */
  mutationKinds: {
    quantitative: number;
    neutralDraws: number;
    preference: number;
    moduleGain: number;
    moduleLoss: number;
  };
  branchCandidateEvents: number;
  branchCandidatesLive: number;
  branchesEstablished: number;
  branchesAlive: number;
  /** Founding species with no living organism at this time. */
  extinct: string[];
  /** Per-second history: first second of the final run of zero counts, per extinct species. */
  extinctionSecond: Record<string, number>;
  peak: Record<string, { count: number; second: number }>;
  ledger: { ok: boolean; relErrC: number; relErrN: number; relErrM: number };
  hash: string;
  wall: { ticks: number; totalMs: number; meanMs: number; p95Ms: number; effectiveSpeed: number };
}

export interface SeedRun {
  recipe: string;
  recipeRevision: number | null;
  seed: number;
  preset: Preset;
  contentHash: string;
  simulationVersion: number;
  founders: Tally;
  species: string[];
  initialFood: FoodTotals;
  initialPatches: { label: string; carbon: number }[];
  initialHash: string;
  checkpoint: Checkpoint;
  /** Same object as checkpoint when the run was not extended. */
  final: Checkpoint;
  extended: boolean;
  /** Counts per species every 60 s (from the per-second history). */
  countSeries: { second: number; counts: Tally }[];
  samples: ReasonSample[];
}

// ---------------------------------------------------------------------------- measurement

function foodTotals(world: World): FoodTotals {
  const cells = maskCells();
  const f = world.fields;
  let sugar = 0;
  let starch = 0;
  let detritus = 0;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    sugar += f.sugar?.[i] ?? 0;
    starch += f.starch?.[i] ?? 0;
    detritus += f.detritus?.[i] ?? 0;
  }
  return { sugar, starch, detritus, total: sugar + starch + detritus };
}

function inc(t: Tally, key: string, by: number): void {
  t[key] = (t[key] ?? 0) + by;
}

function allHistory(world: World): HistorySample[] {
  return [...world.history.minutes, ...world.history.seconds];
}

export function sampleReasons(
  world: World,
  second: number,
  probes: readonly PatchProbe[] = [],
): ReasonSample {
  const c = world.ents.cols;
  const nutrient = world.fields.nutrient;
  const oxygen = world.fields.oxygen;
  const sugar = world.fields.sugar;
  const acc: Record<string, SpeciesSample> = {};
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const sp = world.species[c.species[i]!]!;
    const s = (acc[sp.id] ??= {
      alive: 0,
      meanE: 0,
      meanBOverB0: 0,
      meanH: 0,
      stressedFraction: 0,
      meanCellNutrient: 0,
      meanCellOxygen: 0,
      meanCellSugar: 0,
      meanIntakePerSecond: 0,
      meanX: 0,
      meanY: 0,
      limit: {},
      limitValueSum: {},
      divBlock: {},
      secretion: {},
    });
    const cell = entityCell(c.x[i]!, c.y[i]!);
    s.alive++;
    s.meanE += c.E[i]!;
    s.meanBOverB0 += c.B[i]! / sp.def.b0;
    s.meanH += c.H[i]!;
    if ((c.flags[i]! & FLAG.stressed) !== 0) s.stressedFraction++;
    s.meanCellNutrient += nutrient?.[cell] ?? 0;
    s.meanCellOxygen += oxygen?.[cell] ?? 0;
    s.meanCellSugar += sugar?.[cell] ?? 0;
    s.meanIntakePerSecond += c.intakeLastSecond[i]!;
    s.meanX += c.x[i]!;
    s.meanY += c.y[i]!;
    const limitName = reasonName(c.limitCode[i]!);
    inc(s.limit, limitName, 1);
    inc(s.limitValueSum, limitName, c.limitValue[i]!);
    inc(s.divBlock, reasonName(c.divBlockCode[i]!), 1);
    // Producer rules come from the organism's profile (native producer or E01 carrier), never the
    // species alone.
    if (profileOf(world, i).starch !== null) {
      const code = c.lifeState[i] === LIFE_ACTIVE ? c.secretionCode[i]! : c.limitCode[i]!;
      inc(s.secretion, reasonName(code), 1);
    }
  }
  for (const id of Object.keys(acc)) {
    const s = acc[id]!;
    const n = s.alive;
    s.meanE /= n;
    s.meanBOverB0 /= n;
    s.meanH /= n;
    s.stressedFraction /= n;
    s.meanCellNutrient /= n;
    s.meanCellOxygen /= n;
    s.meanCellSugar /= n;
    s.meanIntakePerSecond /= n;
    s.meanX /= n;
    s.meanY /= n;
  }
  return { second, species: acc, patches: patchCarbon(world, probes) };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

function takeCheckpoint(
  world: World,
  speciesIds: readonly string[],
  firstIntakeBySpecies: Record<string, number | null>,
  tickMs: readonly number[],
): Checkpoint {
  const ev = world.events;
  const m = ev.milestones;
  const ms = (name: string): number | null => (m[name] === undefined ? null : m[name]);
  const c = world.ents.cols;

  const counts: Tally = {};
  const biomass: Tally = {};
  for (const id of speciesIds) {
    counts[id] = 0;
    biomass[id] = 0;
  }
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const id = world.species[c.species[i]!]!.id;
    inc(counts, id, 1);
    biomass[id] = (biomass[id] ?? 0) + c.B[i]!;
  }

  // Deaths by cause from retained lineage records (the event ring keeps only the last 500 events).
  const L = world.lineage;
  const deathsByCause: Tally = {};
  const deathsBySpeciesCause: Record<string, Tally> = {};
  let tallied = 0;
  const mutationKinds = { quantitative: 0, neutralDraws: 0, preference: 0, moduleGain: 0, moduleLoss: 0 };
  for (let k = 0; k < L.parent.length; k++) {
    const flags = L.mutFlags[k]!;
    if (flags & MUT_QUANT) mutationKinds.quantitative++;
    if (flags & MUT_QUANT_NEUTRAL) mutationKinds.neutralDraws++;
    if (flags & MUT_PREF) mutationKinds.preference++;
    if (flags & MUT_MODULE_GAIN) mutationKinds.moduleGain++;
    if (flags & MUT_MODULE_LOSS) mutationKinds.moduleLoss++;
    const cause = L.deathCause[k]!;
    if (L.deathTick[k]! < 0 || cause <= 0) continue; // alive (0) or ended by division (-1)
    const name = reasonName(cause);
    const sp = world.species[L.species[k]!]!.id;
    inc(deathsByCause, name, 1);
    inc((deathsBySpeciesCause[sp] ??= {}), name, 1);
    tallied++;
  }

  // Per-species births/deaths, extinction and peaks from the per-second history.
  const hist = allHistory(world);
  const birthsBySpecies: Tally = {};
  const deathsBySpecies: Tally = {};
  const peak: Record<string, { count: number; second: number }> = {};
  const extinctionSecond: Record<string, number> = {};
  world.species.forEach((sp, j) => {
    if (!speciesIds.includes(sp.id)) return;
    let b = 0;
    let d = 0;
    let best = { count: -1, second: 0 };
    let lastAlive = -1;
    for (const s of hist) {
      b += s.births[j] ?? 0;
      d += s.deaths[j] ?? 0;
      const n = s.count[j] ?? 0;
      if (n > best.count) best = { count: n, second: s.second };
      if (n > 0) lastAlive = s.second;
    }
    birthsBySpecies[sp.id] = b;
    deathsBySpecies[sp.id] = d;
    peak[sp.id] = best;
    const last = hist.at(-1);
    if (last && (last.count[j] ?? 0) === 0 && lastAlive >= 0) {
      const after = hist.find((s) => s.second > lastAlive);
      if (after) extinctionSecond[sp.id] = after.second;
    }
  });

  const firstDivisionBySpecies: Record<string, number | null> = {};
  for (const id of speciesIds) firstDivisionBySpecies[id] = ms(`firstDivision:${id}`);

  const cells = maskCells();
  let nutrientFree = 0;
  let oxygenSum = 0;
  for (let k = 0; k < cells.length; k++) {
    nutrientFree += world.fields.nutrient?.[cells[k]!] ?? 0;
    oxygenSum += world.fields.oxygen?.[cells[k]!] ?? 0;
  }

  const ledger = checkLedger(world);
  const sorted = [...tickMs].sort((a, b) => a - b);
  const totalMs = tickMs.reduce((a, b) => a + b, 0);
  const meanMs = tickMs.length > 0 ? totalMs / tickMs.length : 0;
  const tickSeconds = 1000 / TICKS_PER_SECOND;
  return {
    tick: world.tick,
    seconds: world.tick / TICKS_PER_SECOND,
    firstIntakeTick: ms('firstIntake'),
    firstIntakeBySpecies: { ...firstIntakeBySpecies },
    firstDivisionTick: ms('firstDivision'),
    firstDivisionBySpecies,
    firstMutationTick: ms('firstMutation'),
    births: ev.totals.birth ?? 0,
    deaths: ev.totals.death ?? 0,
    birthsBySpecies,
    deathsBySpecies,
    deathsByCause,
    deathsBySpeciesCause,
    deathCauseCoverage: { tallied, total: ev.totals.death ?? 0, compactedRecords: L.compacted },
    counts,
    biomass,
    food: foodTotals(world),
    nutrientFree,
    oxygenMean: oxygenSum / cells.length,
    carbonFromAir: world.ledger.exchangeC,
    starchConverted: world.conversionTotals.starch,
    mutations: ev.totals.mutation ?? 0,
    mutationKinds,
    branchCandidateEvents: ev.totals.branchCandidate ?? 0,
    branchCandidatesLive: Object.keys(world.branches.candidates).length,
    branchesEstablished: world.branches.established,
    branchesAlive: world.branches.branches.filter((b) => b.alive > 0).length,
    extinct: speciesIds.filter((id) => counts[id] === 0),
    extinctionSecond,
    peak,
    ledger: { ok: ledger.ok, relErrC: ledger.relErr.c, relErrN: ledger.relErr.n, relErrM: ledger.relErr.m },
    hash: stateHash(world),
    wall: {
      ticks: tickMs.length,
      totalMs,
      meanMs,
      p95Ms: percentile(sorted, 0.95),
      effectiveSpeed: meanMs > 0 ? tickSeconds / meanMs : 0,
    },
  };
}

/** Run one recipe at one seed under the §11 protocol. Observation only: never alters the world. */
export function tuneSeed(registry: ContentRegistry, opts: TuneSeedOptions): SeedRun {
  const preset = opts.preset;
  const world = realizeRecipe(registry, opts.recipe, {
    seed: opts.seed,
    transform: (r) => ({ ...r, mutationPreset: preset }),
  });
  const recipeDef = registry.recipes[opts.recipe]!;
  const founders: Tally = {};
  for (const f of recipeDef.founders) inc(founders, f.species, f.count);
  const speciesIds = Object.keys(founders);
  for (const sp of world.species) if (!speciesIds.includes(sp.id)) speciesIds.push(sp.id);

  const firstIntakeBySpecies: Record<string, number | null> = {};
  for (const id of speciesIds) firstIntakeBySpecies[id] = null;
  let pendingIntake = speciesIds.length;
  // Read-only observer after stage 6: the feeding flag is set exactly when an organism took carbon.
  const hooks = {
    afterStage: (stage: number, w: World) => {
      if (stage !== 6 || pendingIntake === 0) return;
      const c = w.ents.cols;
      for (let i = 0; i < w.ents.highWater; i++) {
        if (c.alive[i] !== 1 || (c.flags[i]! & FLAG.feeding) === 0) continue;
        const id = w.species[c.species[i]!]!.id;
        if (firstIntakeBySpecies[id] === null) {
          firstIntakeBySpecies[id] = w.tick;
          pendingIntake--;
        }
      }
    },
  };

  const probes = patchProbes(world, registry, opts.recipe);
  const initialPatches = patchCarbon(world, probes);
  const initialFood = foodTotals(world);
  const initialHash = stateHash(world);
  const checkTick = Math.round(opts.seconds * TICKS_PER_SECOND);
  const extendTick = Math.max(checkTick, Math.round(opts.extendSeconds * TICKS_PER_SECOND));
  const sampleTicks = (opts.sampleSeconds ?? DEFAULT_SAMPLE_SECONDS).map((s) =>
    Math.round(s * TICKS_PER_SECOND),
  );
  const samples: ReasonSample[] = [];
  const tickMs: number[] = [];

  const runTo = (target: number) => {
    while (world.tick < target) {
      const t0 = performance.now();
      step(world, hooks);
      tickMs.push(performance.now() - t0);
      if (sampleTicks.includes(world.tick))
        samples.push(sampleReasons(world, world.tick / TICKS_PER_SECOND, probes));
    }
  };

  runTo(checkTick);
  const checkpoint = takeCheckpoint(world, speciesIds, firstIntakeBySpecies, tickMs);
  const extended = checkpoint.mutations === 0 && extendTick > checkTick;
  let final = checkpoint;
  if (extended) {
    runTo(extendTick);
    final = takeCheckpoint(world, speciesIds, firstIntakeBySpecies, tickMs);
  }

  const countSeries: { second: number; counts: Tally }[] = [];
  for (const s of allHistory(world)) {
    if (s.second % 60 !== 0) continue;
    const counts: Tally = {};
    world.species.forEach((sp, j) => {
      if (speciesIds.includes(sp.id)) counts[sp.id] = s.count[j] ?? 0;
    });
    countSeries.push({ second: s.second, counts });
  }

  return {
    recipe: opts.recipe,
    recipeRevision: world.content.provenance.recipeRevision,
    seed: world.seed,
    preset,
    contentHash: world.content.manifest.contentHash,
    simulationVersion: world.content.manifest.simulationVersion,
    founders,
    species: speciesIds,
    initialFood,
    initialPatches,
    initialHash,
    checkpoint,
    final,
    extended,
    countSeries,
    samples: samples.filter((s) => s.second <= final.seconds),
  };
}

// ---------------------------------------------------------------------------- statistics

export interface CensoredStats {
  n: number;
  events: number;
  censored: number;
  /** Seconds, or a lower bound when the median rank falls on censored values. */
  median: { value: number; lowerBound: boolean } | null;
  min: number | null;
  max: number | null;
}

/**
 * Median/range over seeds where some values may be censored at a common time T (seconds).
 * Censored values rank above every observed value; they are never treated as events at T.
 */
export function censoredStats(
  valuesSeconds: readonly (number | null)[],
  censorSeconds: number,
): CensoredStats {
  const obs = valuesSeconds.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const n = valuesSeconds.length;
  const events = obs.length;
  const at = (k: number): number | null => (k < events ? obs[k]! : null);
  let median: CensoredStats['median'] = null;
  if (n > 0) {
    if (n % 2 === 1) {
      const v = at((n - 1) / 2);
      median = v === null ? { value: censorSeconds, lowerBound: true } : { value: v, lowerBound: false };
    } else {
      const lo = at(n / 2 - 1);
      const hi = at(n / 2);
      if (lo !== null && hi !== null) median = { value: (lo + hi) / 2, lowerBound: false };
      else if (lo !== null) median = { value: (lo + censorSeconds) / 2, lowerBound: true };
      else median = { value: censorSeconds, lowerBound: true };
    }
  }
  return {
    n,
    events,
    censored: n - events,
    median,
    min: events > 0 ? obs[0]! : null,
    max: events > 0 ? obs[events - 1]! : null,
  };
}

// ---------------------------------------------------------------------------- report

const sec = (tick: number | null): number | null => (tick === null ? null : tick / TICKS_PER_SECOND);
const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);
const sci = (v: number) => (v === 0 ? '0' : v.toExponential(1));

/**
 * Whether a milestone happened inside a target window. A milestone censored at a stopping time shorter
 * than the window is unknown, never a miss: the event may still have happened inside the window.
 */
export function withinTarget(
  tick: number | null,
  targetSeconds: number,
  stopSeconds: number,
): 'yes' | 'no' | 'unknown' {
  if (tick !== null) return tick < targetSeconds * TICKS_PER_SECOND ? 'yes' : 'no';
  return stopSeconds < targetSeconds ? 'unknown' : 'no';
}

function tickCell(tick: number | null, censorAt: number): string {
  return tick === null ? `none by ${censorAt} s` : `${f1(tick / TICKS_PER_SECOND)} s (t${tick})`;
}

function statsLine(label: string, s: CensoredStats, T: number): string {
  const median =
    s.median === null
      ? '—'
      : s.median.lowerBound
        ? `≥ ${f1(s.median.value)} s (not estimable)`
        : `${f1(s.median.value)} s`;
  const range = s.min === null ? '—' : `${f1(s.min)}–${f1(s.max!)} s`;
  return `| ${label} | ${s.events}/${s.n} | ${median} | ${range} | ${s.censored} (no event by ${T} s) |`;
}

function tallyText(t: Tally, total?: number): string {
  const keys = Object.keys(t).sort((a, b) => t[b]! - t[a]! || (a < b ? -1 : 1));
  if (keys.length === 0) return '—';
  const sum = total ?? keys.reduce((a, k) => a + t[k]!, 0);
  return keys.map((k) => `${k} ${t[k]}${sum > 0 ? ` (${Math.round((100 * t[k]!) / sum)}%)` : ''}`).join(', ');
}

function limitText(t: Tally, valueSum: Tally): string {
  const keys = Object.keys(t).sort((a, b) => t[b]! - t[a]! || (a < b ? -1 : 1));
  if (keys.length === 0) return '—';
  const sum = keys.reduce((a, k) => a + t[k]!, 0);
  return keys
    .map((k) => `${k} ${Math.round((100 * t[k]!) / sum)}% (${((valueSum[k] ?? 0) / t[k]!).toFixed(2)})`)
    .join(', ');
}

export interface ReportMeta {
  readonly command: string;
  readonly seconds: number;
  readonly extendSeconds: number;
  readonly preset: Preset;
  readonly machine: string;
  readonly generatedAt: string;
  readonly wallSeconds: number;
  /** 1-minute load averages at start and end (wall-time numbers are only comparable on a quiet machine). */
  readonly loadAverage?: readonly [number, number];
}

export function renderReport(runs: readonly SeedRun[], meta: ReportMeta, analysis: string | null): string {
  const out: string[] = [];
  const recipes = [...new Set(runs.map((r) => r.recipe))];
  const T = meta.seconds;
  out.push(`# Development-seed tuning report — ${recipes.join(', ')} (${meta.preset})`);
  out.push('');
  out.push(`Generated by \`${meta.command}\` (tools/sim-tune.ts, task P1.12; CONTENT_TABLES §11; D06 §18).`);
  out.push('');
  const r0 = runs[0];
  if (r0) {
    out.push(
      `- Content hash \`${r0.contentHash}\`, simulation version ${r0.simulationVersion}, mutation preset **${meta.preset}**, no interventions.`,
    );
  }
  out.push(
    `- Stopping rule: run to ${T} s; if no inherited difference (zero mutation events) by then, continue to ${meta.extendSeconds} s, keeping the ${T} s checkpoint.`,
  );
  out.push(
    `- Machine: ${meta.machine}. Generated ${meta.generatedAt}. Total wall time ${f1(meta.wallSeconds)} s (headless Node, single thread; not the browser worker)${meta.loadAverage ? `; 1-min load average ${f2(meta.loadAverage[0])} at start, ${f2(meta.loadAverage[1])} at end` : ''}.`,
  );
  out.push(
    '- Time convention: a milestone at tick *t* happened while simulating tick *t* (seconds shown = t / 10). "Within 15 s" means t < 150; "within 120 s" means t < 1200.',
  );
  out.push(
    '- Censoring: "none by T s" means no event before the stopping time. It is never counted as an event at T. Medians rank censored seeds above every observed value; when the median rank lands on a censored seed only a lower bound is given.',
  );
  out.push(
    '- Deaths by cause are tallied from `world.lineage.deathCause` over retained birth records (the event ring keeps only the last 500 events). The coverage column compares that tally with the total death-event counter; they differ only if lineage records were compacted.',
  );
  out.push(
    '- First intake per species is observed read-only after stage 6 each tick from the feeding flag (set exactly when an organism took carbon that tick); the world milestone `firstIntake` covers any species, photosynthesis included.',
  );
  out.push('');

  for (const recipe of recipes) {
    const rs = runs.filter((r) => r.recipe === recipe);
    const species = rs[0]!.species.filter((id) => (rs[0]!.founders[id] ?? 0) > 0);
    const spHead = species.join(' / ');
    out.push(`## ${recipe} (revision ${rs[0]!.recipeRevision ?? '?'})`);
    out.push('');
    out.push(
      `Founders: ${species.map((id) => `${rs[0]!.founders[id]} ${id}`).join(', ')}. Initial food (sum over dish cells, C): sugar ${f2(rs[0]!.initialFood.sugar)}, starch ${f2(rs[0]!.initialFood.starch)}, detritus ${f2(rs[0]!.initialFood.detritus)}.`,
    );
    out.push('');

    // Table 1 — pacing
    out.push(`### Pacing at the ${T} s checkpoint`);
    out.push('');
    out.push(
      `| Seed | First intake (any) | First intake ${spHead} | First division (any) | First division ${spHead} | Intake < ${TARGET_INTAKE_SECONDS} s | Division < ${TARGET_DIVISION_SECONDS} s |`,
    );
    out.push('|---|---|---|---|---|---|---|');
    for (const r of rs) {
      const cp = r.checkpoint;
      const intakeSp = species.map((id) => tickCell(cp.firstIntakeBySpecies[id] ?? null, T)).join(' / ');
      const divSp = species.map((id) => tickCell(cp.firstDivisionBySpecies[id] ?? null, T)).join(' / ');
      const okI = withinTarget(cp.firstIntakeTick, TARGET_INTAKE_SECONDS, T);
      const okD = withinTarget(cp.firstDivisionTick, TARGET_DIVISION_SECONDS, T);
      out.push(
        `| ${r.seed} | ${tickCell(cp.firstIntakeTick, T)} | ${intakeSp} | ${tickCell(cp.firstDivisionTick, T)} | ${divSp} | ${okI} | ${okD} |`,
      );
    }
    out.push('');

    // Table 2 — population
    out.push(`### Population at the ${T} s checkpoint`);
    out.push('');
    out.push(
      `| Seed | Divisions (births) ${spHead} | Deaths ${spHead} | Deaths by cause (lineage) | Cause coverage | Alive ${spHead} | Biomass ${spHead} | Peak ${spHead} (at s) | Extinct (s) |`,
    );
    out.push('|---|---|---|---|---|---|---|---|---|');
    for (const r of rs) {
      const cp = r.checkpoint;
      const cov = cp.deathCauseCoverage;
      const extinct = cp.extinct
        .filter((id) => species.includes(id))
        .map((id) => `${id}${cp.extinctionSecond[id] !== undefined ? ` (${cp.extinctionSecond[id]})` : ''}`);
      out.push(
        `| ${r.seed} | ${cp.births}: ${species.map((id) => cp.birthsBySpecies[id] ?? 0).join(' / ')} | ${cp.deaths}: ${species.map((id) => cp.deathsBySpecies[id] ?? 0).join(' / ')} | ${tallyText(cp.deathsByCause)} | ${cov.tallied}/${cov.total}${cov.compactedRecords > 0 ? ` (${cov.compactedRecords} records compacted)` : ''} | ${species.map((id) => cp.counts[id] ?? 0).join(' / ')} | ${species.map((id) => f1(cp.biomass[id] ?? 0)).join(' / ')} | ${species.map((id) => `${cp.peak[id]?.count ?? 0} (${cp.peak[id]?.second ?? 0})`).join(' / ')} | ${extinct.length > 0 ? extinct.join(', ') : 'none'} |`,
      );
    }
    out.push('');

    // Table 3 — food and inheritance
    out.push(`### Food and inherited variation at the ${T} s checkpoint`);
    out.push('');
    out.push(
      '| Seed | Sugar | Starch | Detritus | Food total | Starch converted | C from air (net) | Free nutrient | O2 mean | Mutation events | Kinds (quant / neutral draws / pref / module ±) | First mutation | Candidates (emitted / live) | Established (alive) |',
    );
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rs) {
      const cp = r.checkpoint;
      const k = cp.mutationKinds;
      out.push(
        `| ${r.seed} | ${f2(cp.food.sugar)} | ${f2(cp.food.starch)} | ${f2(cp.food.detritus)} | ${f2(cp.food.total)} | ${f2(cp.starchConverted)} | ${f1(cp.carbonFromAir)} | ${f2(cp.nutrientFree)} | ${cp.oxygenMean.toFixed(3)} | ${cp.mutations} | ${k.quantitative} / ${k.neutralDraws} / ${k.preference} / ${k.moduleGain + k.moduleLoss} | ${tickCell(cp.firstMutationTick, T)} | ${cp.branchCandidateEvents} / ${cp.branchCandidatesLive} | ${cp.branchesEstablished} (${cp.branchesAlive}) |`,
      );
    }
    out.push('');

    // Table 4 — integrity and speed
    out.push('### Integrity and speed');
    out.push('');
    out.push(
      `| Seed | Stopped at | Extended | Wall ms/tick mean (p95) | Effective speed | Ledger relErr C / N (${T} s) | Ledger ok | Hash at ${T} s | Endpoint hash |`,
    );
    out.push('|---|---|---|---|---|---|---|---|---|');
    for (const r of rs) {
      const cp = r.checkpoint;
      const fin = r.final;
      out.push(
        `| ${r.seed} | ${fin.seconds} s | ${r.extended ? `yes (no mutation by ${T} s)` : 'no'} | ${fin.wall.meanMs.toFixed(3)} (${fin.wall.p95Ms.toFixed(3)}) | ${f1(fin.wall.effectiveSpeed)}× | ${sci(cp.ledger.relErrC)} / ${sci(cp.ledger.relErrN)} | ${cp.ledger.ok && fin.ledger.ok ? 'yes' : 'NO'} | \`${cp.hash}\` | \`${fin.hash}\` |`,
      );
    }
    out.push('');
    out.push(
      'Effective speed = 0.1 s of simulated time ÷ mean wall time per tick (how many times faster than real time this machine could step the dish, with no rendering).',
    );
    out.push('');

    const ext = rs.filter((r) => r.extended);
    if (ext.length > 0) {
      out.push(`### Extended runs (to ${meta.extendSeconds} s)`);
      out.push('');
      out.push(
        '| Seed | First division (any) | Divisions | Deaths | Alive ' +
          spHead +
          ' | Mutation events | Candidates | Established | Food total | Extinct |',
      );
      out.push('|---|---|---|---|---|---|---|---|---|---|');
      for (const r of ext) {
        const f = r.final;
        out.push(
          `| ${r.seed} | ${tickCell(f.firstDivisionTick, f.seconds)} | ${f.births} | ${f.deaths} | ${species.map((id) => f.counts[id] ?? 0).join(' / ')} | ${f.mutations} | ${f.branchCandidateEvents} | ${f.branchesEstablished} | ${f2(f.food.total)} | ${f.extinct.filter((id) => species.includes(id)).join(', ') || 'none'} |`,
        );
      }
      out.push('');
    }

    // Summary statistics
    out.push(`### Summary over ${rs.length} seeds (censored at ${T} s)`);
    out.push('');
    out.push('| Milestone | Events | Median | Range (observed) | Censored |');
    out.push('|---|---|---|---|---|');
    const cps = rs.map((r) => r.checkpoint);
    out.push(
      statsLine(
        'First intake (any species)',
        censoredStats(
          cps.map((c) => sec(c.firstIntakeTick)),
          T,
        ),
        T,
      ),
    );
    for (const id of species)
      out.push(
        statsLine(
          `First intake ${id}`,
          censoredStats(
            cps.map((c) => sec(c.firstIntakeBySpecies[id] ?? null)),
            T,
          ),
          T,
        ),
      );
    out.push(
      statsLine(
        'First division (any species)',
        censoredStats(
          cps.map((c) => sec(c.firstDivisionTick)),
          T,
        ),
        T,
      ),
    );
    for (const id of species)
      out.push(
        statsLine(
          `First division ${id}`,
          censoredStats(
            cps.map((c) => sec(c.firstDivisionBySpecies[id] ?? null)),
            T,
          ),
          T,
        ),
      );
    out.push(
      statsLine(
        'First inherited difference (mutation)',
        censoredStats(
          cps.map((c) => sec(c.firstMutationTick)),
          T,
        ),
        T,
      ),
    );
    out.push('');
    const intakeW = cps.map((c) => withinTarget(c.firstIntakeTick, TARGET_INTAKE_SECONDS, T));
    const divW = cps.map((c) => withinTarget(c.firstDivisionTick, TARGET_DIVISION_SECONDS, T));
    const intakeOk = intakeW.filter((w) => w === 'yes').length;
    const divOk = divW.filter((w) => w === 'yes').length;
    const bothOk = cps.filter((_, k) => intakeW[k] === 'yes' && divW[k] === 'yes').length;
    const unknown = cps.filter((_, k) => intakeW[k] === 'unknown' || divW[k] === 'unknown').length;
    const b01Div = species.includes('B01')
      ? cps.filter(
          (c) => withinTarget(c.firstDivisionBySpecies.B01 ?? null, TARGET_DIVISION_SECONDS, T) === 'yes',
        ).length
      : null;
    const noVariation = rs.filter((r) => r.final.mutations === 0).length;
    out.push(
      `**D06 targets** (≥ ${TARGET_SEEDS_REQUIRED} of the 6 development seeds; targets to check, not to force):`,
    );
    out.push('');
    const unk = (w: readonly string[]) => {
      const u = w.filter((x) => x === 'unknown').length;
      return u > 0 ? ` (${u} unknown: stopped before the window closed)` : '';
    };
    out.push(`- Intake within ${TARGET_INTAKE_SECONDS} s: **${intakeOk}/${rs.length}**${unk(intakeW)}.`);
    out.push(`- First division within ${TARGET_DIVISION_SECONDS} s: **${divOk}/${rs.length}**${unk(divW)}.`);
    const devSet = rs.length === DEV_SEEDS.length && DEV_SEEDS.every((d) => rs.some((r) => r.seed === d));
    const verdict = !devSet
      ? 'not assessable: the verdict is defined only for the 6 development seeds'
      : bothOk >= TARGET_SEEDS_REQUIRED
        ? 'met'
        : bothOk + unknown < TARGET_SEEDS_REQUIRED
          ? 'NOT met'
          : `not assessable: ${unknown} seed(s) stopped before a target window closed`;
    out.push(`- Both: **${bothOk}/${rs.length}** — target ${verdict}.`);
    if (b01Div !== null)
      out.push(
        `- (Supplementary) a Sprinter (B01) division within ${TARGET_DIVISION_SECONDS} s: ${b01Div}/${rs.length}.`,
      );
    out.push(`- Seeds with no inherited difference by their stopping time: ${noVariation}/${rs.length}.`);
    out.push('');

    // Count series
    out.push('### Living count every 60 s (' + spHead + ')');
    out.push('');
    const seconds = [...new Set(rs.flatMap((r) => r.countSeries.map((s) => s.second)))].sort((a, b) => a - b);
    out.push(`| Seed | ${seconds.map((s) => `${s} s`).join(' | ')} |`);
    out.push(`|---|${seconds.map(() => '---').join('|')}|`);
    for (const r of rs) {
      const cells = seconds.map((s) => {
        const row = r.countSeries.find((x) => x.second === s);
        return row ? species.map((id) => row.counts[id] ?? 0).join('/') : '';
      });
      out.push(`| ${r.seed} | ${cells.join(' | ')} |`);
    }
    out.push('');

    // Death causes pooled per species
    out.push(`### Deaths by species and cause, pooled over seeds (${T} s checkpoint, lineage tally)`);
    out.push('');
    out.push('| Species | Deaths | Causes |');
    out.push('|---|---|---|');
    for (const id of species) {
      const pooled: Tally = {};
      for (const c of cps)
        for (const [k, v] of Object.entries(c.deathsBySpeciesCause[id] ?? {})) inc(pooled, k, v);
      const n = Object.values(pooled).reduce((a, b) => a + b, 0);
      out.push(`| ${id} | ${n} | ${tallyText(pooled)} |`);
    }
    out.push('');

    // Recipe patches: carbon left in each patch disk
    const patchLabels = rs[0]!.initialPatches.map((p) => p.label);
    if (patchLabels.length > 0) {
      out.push('### Carbon left in each recipe patch (mean over seeds, min–max)');
      out.push('');
      out.push(
        'Sum over the patch disk of the carbon fields that patch added. It includes carbon arriving later (diffusion, exudate, dead bodies), so it can rise.',
      );
      out.push('');
      out.push(`| t (s) | ${patchLabels.join(' | ')} |`);
      out.push(`|---|${patchLabels.map(() => '---').join('|')}|`);
      out.push(`| 0 | ${rs[0]!.initialPatches.map((p) => f2(p.carbon)).join(' | ')} |`);
      const times = [...new Set(rs.flatMap((r) => r.samples.map((s) => s.second)))].sort((a, b) => a - b);
      for (const t of times) {
        const cells = patchLabels.map((_, j) => {
          const vals = rs.flatMap((r) => {
            const smp = r.samples.find((x) => x.second === t);
            return smp ? [smp.patches[j]!.carbon] : [];
          });
          if (vals.length === 0) return '';
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          return `${f2(mean)} (${f2(Math.min(...vals))}–${f2(Math.max(...vals))})`;
        });
        out.push(`| ${t} | ${cells.join(' | ')} |`);
      }
      out.push('');
    }

    // Reason samples pooled
    out.push('### Recorded reasons of living organisms, pooled over seeds');
    out.push('');
    out.push(
      "Sampled at the end of the listed ticks. `limit` = leading intake constraint (limitCode), `division` = first failing division gate or placement block (divBlockCode), `secretion` = starch-enzyme outcome (secretionCode) of every organism with producer rules, native or gained through E01 (a producer that is preparing, resting or waking is counted under its state reason). Means are per organism; cell values are the free field in the organism's cell.",
    );
    out.push('');
    out.push(
      '| t (s) | Species | Alive (seeds) | Mean position | Mean E | Mean B/b0 | Mean H | Stressed | Intake C/s | Cell nutrient | Cell O2 | Cell sugar | limit (share, mean value) | division | secretion |',
    );
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    const sampleSeconds = [...new Set(rs.flatMap((r) => r.samples.map((s) => s.second)))].sort(
      (a, b) => a - b,
    );
    for (const t of sampleSeconds) {
      for (const id of species) {
        let alive = 0;
        let seedsWith = 0;
        let e = 0;
        let b = 0;
        let h = 0;
        let st = 0;
        let cn = 0;
        let co = 0;
        let cs = 0;
        let ci = 0;
        let px = 0;
        let py = 0;
        const limit: Tally = {};
        const limitV: Tally = {};
        const div: Tally = {};
        const secr: Tally = {};
        let seedsSampled = 0;
        for (const r of rs) {
          const s = r.samples.find((x) => x.second === t);
          if (!s) continue;
          seedsSampled++;
          const sp = s.species[id];
          if (!sp) continue;
          seedsWith++;
          alive += sp.alive;
          e += sp.meanE * sp.alive;
          b += sp.meanBOverB0 * sp.alive;
          h += sp.meanH * sp.alive;
          st += sp.stressedFraction * sp.alive;
          cn += sp.meanCellNutrient * sp.alive;
          co += sp.meanCellOxygen * sp.alive;
          cs += sp.meanCellSugar * sp.alive;
          ci += sp.meanIntakePerSecond * sp.alive;
          px += sp.meanX * sp.alive;
          py += sp.meanY * sp.alive;
          for (const [k, v] of Object.entries(sp.limit)) inc(limit, k, v);
          for (const [k, v] of Object.entries(sp.limitValueSum)) inc(limitV, k, v);
          for (const [k, v] of Object.entries(sp.divBlock)) inc(div, k, v);
          for (const [k, v] of Object.entries(sp.secretion)) inc(secr, k, v);
        }
        if (alive === 0) {
          out.push(`| ${t} | ${id} | 0 (0/${seedsSampled}) | | | | | | | | | | | | |`);
          continue;
        }
        out.push(
          `| ${t} | ${id} | ${alive} (${seedsWith}/${seedsSampled}) | (${f1(px / alive)}, ${f1(py / alive)}) | ${f1(e / alive)} | ${f2(b / alive)} | ${f1(h / alive)} | ${Math.round((100 * st) / alive)}% | ${(ci / alive).toFixed(4)} | ${(cn / alive).toFixed(3)} | ${(co / alive).toFixed(3)} | ${(cs / alive).toFixed(3)} | ${limitText(limit, limitV)} | ${tallyText(div)} | ${Object.keys(secr).length > 0 ? tallyText(secr) : '—'} |`,
        );
      }
    }
    out.push('');
  }

  // Written back byte-for-byte so regenerating the tables never alters the hand-written analysis.
  out.push(
    `${ANALYSIS_START}${analysis ?? '\n## Observations\n\n_Not written yet._\n\n## Proposed recipe revisions\n\n_Not written yet._\n'}${ANALYSIS_END}`,
  );
  out.push('');
  return out.join('\n');
}

export function extractAnalysis(text: string): string | null {
  const a = text.indexOf(ANALYSIS_START);
  const b = text.indexOf(ANALYSIS_END);
  if (a < 0 || b < a) return null;
  return text.slice(a + ANALYSIS_START.length, b);
}

// ---------------------------------------------------------------------------- CLI

interface Args {
  recipes: string[];
  seeds: number[];
  seconds: number;
  extend: number;
  preset: Preset;
  out: string | null;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const recipes = (get('recipes') ?? get('recipe') ?? 'FIRST_DISH_V1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const seeds = (get('seeds') ?? DEV_SEEDS.join(',')).split(',').map((s) => Number(s.trim()));
  if (seeds.some((s) => !Number.isInteger(s) || s < 0))
    throw new Error('--seeds must be a comma-separated list of non-negative integers');
  const seconds = Number(get('seconds') ?? '600');
  const extend = Number(get('extend') ?? '1200');
  if (!(seconds > 0) || !(extend >= 0)) throw new Error('--seconds must be > 0 and --extend ≥ 0');
  const preset = get('preset') ?? 'standard';
  if (preset !== 'standard' && preset !== 'accelerated')
    throw new Error('--preset must be standard or accelerated');
  return { recipes, seeds, seconds, extend, preset, out: get('out') ?? null };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const registry = loadRegistryFs();
  for (const r of args.recipes) if (!registry.recipes[r]) throw new Error(`unknown recipe ${r}`);
  const runs: SeedRun[] = [];
  const wall0 = performance.now();
  const load0 = loadavg()[0]!;
  for (const recipe of args.recipes) {
    for (const seed of args.seeds) {
      const t0 = performance.now();
      const run = tuneSeed(registry, {
        recipe,
        seed,
        preset: args.preset,
        seconds: args.seconds,
        extendSeconds: args.extend,
      });
      runs.push(run);
      const cp = run.checkpoint;
      console.error(
        `${recipe} seed ${seed}: ${run.final.seconds} s${run.extended ? ' (extended)' : ''} · intake t${cp.firstIntakeTick ?? '-'} · division t${cp.firstDivisionTick ?? '-'} · births ${cp.births} · deaths ${cp.deaths} · mutations ${cp.mutations} · hash ${run.final.hash} · ${((performance.now() - t0) / 1000).toFixed(1)} s wall`,
      );
    }
  }
  const outPath = args.out === null ? null : isAbsolute(args.out) ? args.out : join(process.cwd(), args.out);
  const previous =
    outPath !== null && existsSync(outPath) ? extractAnalysis(readFileSync(outPath, 'utf8')) : null;
  const report = renderReport(
    runs,
    {
      command: `npx tsx tools/sim-tune.ts ${process.argv.slice(2).join(' ')}`.trim(),
      seconds: args.seconds,
      extendSeconds: args.extend,
      preset: args.preset,
      machine: `${process.platform} ${process.arch} node ${process.version}, ${cpus().length} CPU(s)`,
      generatedAt: new Date().toISOString(),
      wallSeconds: (performance.now() - wall0) / 1000,
      loadAverage: [load0, loadavg()[0]!],
    },
    previous,
  );
  if (outPath !== null) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, report);
    console.error(`wrote ${outPath.startsWith(REPO_ROOT) ? outPath.slice(REPO_ROOT.length + 1) : outPath}`);
  }
  console.log(report);
  if (runs.some((r) => !r.checkpoint.ledger.ok || !r.final.ledger.ok)) process.exit(2);
}

if (process.argv[1]?.endsWith('sim-tune.ts')) main();
