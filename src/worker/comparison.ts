/**
 * Comparison engine (SPEC §13.4, UX §5.6, BUILD_DIRECTIVE P2.4).
 *
 * A comparison captures the current dish once as an immutable baseline (a serialized world state),
 * realizes two identical copies from it — A, the untouched baseline arm, and B, which receives the
 * player's intervention through the ordinary command path — and advances both by exactly the same
 * number of ticks. The pair is always stepped together (A one tick, then B one tick), so at every
 * moment the two arms are at the same simulated time; wall-clock time only paces how many pairs run
 * per frame and never decides how many ticks either arm receives.
 *
 * Everything here is observation: measuring reads world state and the event ring and never draws
 * simulation randomness or writes to a world, so A and B each stay exactly as deterministic as any
 * other dish (A's hash equals an untouched duplicate run for the same ticks). Comparison records are
 * worker/UI state, never simulation state: nothing about a comparison is stored inside a world.
 *
 * Results always describe "this paired run": one baseline, one change, one horizon.
 */
import { activeLoci } from '@sim/phenotype';
import { applyNow, type CommandPayload, type CommandResult } from '@sim/commands';
import { maskCells } from '@sim/grid';
import { REASONS } from '@sim/reasons';
import { deserializeWorld, serializeWorld, stateHash, type WorldState } from '@sim/serialize';
import { step } from '@sim/tick';
import type { World } from '@sim/world';
import type { Speed } from './protocol';

/** Horizons offered to the player in simulated seconds (CT §12.10); `null` runs until Stop. */
export const COMPARE_HORIZONS_S = [60, 180, 600] as const;

/** Pacing only: 0 pauses, 1/2/4 are the usual speeds, 'max' runs as many pairs as the frame budget allows. */
export type CompareSpeed = 0 | 1 | 2 | 4 | 'max';

export type CompareStatus = 'setup' | 'running' | 'complete' | 'failed';

/** Every result carries this label; results are never generalised beyond the run they describe. */
export const PAIRED_RUN_LABEL = 'this paired run';

export interface Intervention {
  readonly commandId: string;
  readonly payload: CommandPayload;
  readonly result: CommandResult | null;
}

export interface SpeciesMeasure {
  readonly idx: number;
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly biomass: number;
  readonly births: number;
  readonly deaths: number;
}

/** Distribution of one quantitative locus among the living members of one species. */
export interface TraitDistribution {
  readonly species: number;
  readonly locus: number;
  readonly locusName: string;
  readonly n: number;
  readonly median: number;
  readonly min: number;
  readonly max: number;
}

/** How many living members of a species carry a supplementary module (genome modules only). */
export interface ModuleFrequency {
  readonly species: number;
  readonly moduleId: string;
  /** Player-facing name from the world's recorded module registry. */
  readonly name: string;
  readonly count: number;
  /** count / living members of that species. */
  readonly share: number;
}

export interface DeathCause {
  /** Reason code (DEATH_*), see src/sim/reasons.ts. */
  readonly cause: number;
  readonly name: string;
  readonly count: number;
}

export interface ArmMeasures {
  readonly tick: number;
  readonly hash: string;
  readonly alive: number;
  readonly biomass: number;
  readonly species: readonly SpeciesMeasure[];
  /** Diversity: kinds of organism with at least one living member. */
  readonly speciesAlive: number;
  /**
   * Diversity index: Shannon H = −Σ pᵢ ln pᵢ with pᵢ = living count of species i / all living
   * organisms (natural log; 0 when one kind or none is alive, ln k when k kinds are equally common).
   */
  readonly shannon: number;
  /** Mean dissolved oxygen over the dish's playable cells (the same measure as History). */
  readonly oxygenMean: number;
  readonly births: number;
  readonly deaths: number;
  readonly deathsByCause: readonly DeathCause[];
  /** Deaths whose detailed event record was not kept (the event ring overflowed within a tick). */
  readonly deathsUnattributed: number;
  readonly traits: readonly TraitDistribution[];
  readonly modules: readonly ModuleFrequency[];
  /** Ticks during this paired run in which the simulation's agent cap blocked a birth or placement. */
  readonly capacityLimitedTicks: number;
  /** Inclusive tick ranges [from, to] (absolute simulation ticks) that were capacity-limited. */
  readonly capacityIntervals: readonly (readonly [number, number])[];
  /** Carbon externally added to this arm since the baseline was captured (interventions, schedules). */
  readonly carbonAdded: number;
}

export interface MeasureRow {
  readonly key: 'alive' | 'biomass' | 'speciesAlive' | 'shannon' | 'oxygenMean' | 'births' | 'deaths' | 'capacitySeconds' | 'carbonAdded' | 'speciesCount' | 'speciesBiomass';
  /** Species index for per-species rows. */
  readonly species?: number;
  readonly a: number;
  readonly b: number;
  /** Absolute difference in game units, B − A (never a percentage). */
  readonly diff: number;
}

export interface ComparisonResults {
  readonly label: typeof PAIRED_RUN_LABEL;
  readonly baselineTick: number;
  /** Ticks each arm advanced during the paired run (always equal). */
  readonly ticks: number;
  readonly horizonTicks: number | null;
  readonly stoppedEarly: boolean;
  readonly interventions: readonly Intervention[];
  readonly a: ArmMeasures;
  readonly b: ArmMeasures;
  readonly rows: readonly MeasureRow[];
}

/** What the worker tells the UI about a comparison (no world data beyond the results). */
export interface ComparisonState {
  readonly compareId: string;
  readonly sourceDishId: string;
  readonly aDishId: string;
  readonly bDishId: string;
  readonly baselineTick: number;
  readonly status: CompareStatus;
  readonly horizonTicks: number | null;
  readonly ticksRun: number;
  readonly speed: CompareSpeed;
  /** The source dish's speed when the comparison opened (restored when it closes). */
  readonly priorSpeed: Speed;
  readonly interventions: readonly Intervention[];
  readonly results: ComparisonResults | null;
  readonly error: string | null;
}

/** A fresh world from the stored baseline under its own world id (the baseline itself is never touched). */
export function realizeArm(baseline: WorldState, worldId: string): World {
  return deserializeWorld({ ...baseline, worldId });
}

/** Capture a dish once as an immutable baseline. */
export function captureBaseline(world: World): WorldState {
  return serializeWorld(world);
}

/**
 * Per-arm observer: reads what each tick recorded (history accumulators, the event ring, the
 * capacity counter) after the tick completes. Read-only; never touches the world.
 */
export class ArmObserver {
  private lastEventId: number;
  private lastSecond: number;
  private pendingBirths: number[];
  private pendingDeaths: number[];
  private lastCapacityTicks: number;
  readonly births: number[];
  readonly deaths: number[];
  /** Indexed by reason code. */
  readonly byCause: number[];
  capacityTicks = 0;
  readonly intervals: [number, number][] = [];

  constructor(world: World) {
    const h = world.history;
    this.lastEventId = world.counters.nextEventId - 1;
    this.lastSecond = h.seconds.at(-1)?.second ?? -1;
    this.pendingBirths = h.pendingBirths.slice();
    this.pendingDeaths = h.pendingDeaths.slice();
    this.lastCapacityTicks = world.capacityLimitedTicks;
    this.births = new Array<number>(world.species.length).fill(0);
    this.deaths = new Array<number>(world.species.length).fill(0);
    this.byCause = new Array<number>(REASONS.length).fill(0);
  }

  /** Call once after every step of this arm's world. */
  after(world: World): void {
    const h = world.history;
    const last = h.seconds.at(-1);
    const pushed = last !== undefined && last.second !== this.lastSecond ? last : null;
    if (last) this.lastSecond = last.second;
    // Deaths/births this tick = (sample closed this tick ? its count : 0) + pending now − pending before.
    for (let s = 0; s < this.births.length; s++) {
      this.births[s]! += (pushed ? pushed.births[s]! : 0) + h.pendingBirths[s]! - this.pendingBirths[s]!;
      this.deaths[s]! += (pushed ? pushed.deaths[s]! : 0) + h.pendingDeaths[s]! - this.pendingDeaths[s]!;
    }
    this.pendingBirths = h.pendingBirths.slice();
    this.pendingDeaths = h.pendingDeaths.slice();
    // Causes come from the detailed event records emitted since the previous tick.
    const ring = world.events.ring;
    let k = ring.length;
    while (k > 0 && ring[k - 1]!.id > this.lastEventId) k--;
    for (; k < ring.length; k++) {
      const ev = ring[k]!;
      if (ev.type === 'death' && ev.cause !== undefined && ev.cause >= 0 && ev.cause < this.byCause.length) this.byCause[ev.cause]!++;
    }
    this.lastEventId = world.counters.nextEventId - 1;
    // The tick that just ran is world.tick − 1.
    if (world.capacityLimitedTicks > this.lastCapacityTicks) {
      const t = world.tick - 1;
      this.capacityTicks += world.capacityLimitedTicks - this.lastCapacityTicks;
      const tail = this.intervals.at(-1);
      if (tail && tail[1] === t - 1) tail[1] = t;
      else this.intervals.push([t, t]);
    }
    this.lastCapacityTicks = world.capacityLimitedTicks;
  }
}

function median(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const m = n >> 1;
  return n % 2 === 1 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
}

/** Shannon H over living counts (natural log). */
export function shannonIndex(counts: readonly number[]): number {
  let total = 0;
  for (const c of counts) total += c;
  if (total <= 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return h === 0 ? 0 : h;
}

/** Measure one arm at the end of the paired run. Pure read of world state plus the observer. */
export function measureArm(world: World, obs: ArmObserver, baseline: WorldState): ArmMeasures {
  const e = world.ents;
  const c = e.cols;
  const nSp = world.species.length;
  const count = new Array<number>(nSp).fill(0);
  const biomass = new Array<number>(nSp).fill(0);
  const loci: number[][][] = Array.from({ length: nSp }, () => [] as number[][]);
  const moduleCounts: { id: string; count: number }[][] = Array.from({ length: nSp }, () => []);
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const s = c.species[i]!;
    count[s]!++;
    biomass[s]! += c.B[i]!;
    const g = world.genomes.get(c.genome[i]!);
    const perLocus = loci[s]!;
    // Per organism: E03 makes the dormancy locus active for its carrier (SPEC §8.2, phenotype.ts).
    const act = activeLoci(world.species[s]!, g);
    for (let l = 0; l < g.loci.length; l++) if (act[l]) (perLocus[l] ??= []).push(g.loci[l]!);
    const mods = moduleCounts[s]!;
    for (const id of g.modules) {
      const found = mods.find((m) => m.id === id);
      if (found) found.count++;
      else mods.push({ id, count: 1 });
    }
  }
  const species: SpeciesMeasure[] = world.species.map((sp, idx) => ({
    idx,
    id: sp.id,
    name: sp.def.name,
    count: count[idx]!,
    biomass: biomass[idx]!,
    births: obs.births[idx]!,
    deaths: obs.deaths[idx]!,
  }));
  const traits: TraitDistribution[] = [];
  for (let s = 0; s < nSp; s++) {
    const perLocus = loci[s]!;
    for (let l = 0; l < perLocus.length; l++) {
      const vals = (perLocus[l] ?? []).slice().sort((x, y) => x - y);
      if (vals.length === 0) continue;
      traits.push({
        species: s,
        locus: l,
        locusName: world.content.loci.find((d) => d.index === l)?.name ?? `locus ${l}`,
        n: vals.length,
        median: median(vals),
        min: vals[0]!,
        max: vals[vals.length - 1]!,
      });
    }
  }
  const modules: ModuleFrequency[] = [];
  for (let s = 0; s < nSp; s++) {
    const mods = moduleCounts[s]!.slice().sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    for (const m of mods) modules.push({ species: s, moduleId: m.id, name: world.content.modules.find((d) => d.id === m.id)?.name ?? m.id, count: m.count, share: count[s]! > 0 ? m.count / count[s]! : 0 });
  }
  const cells = maskCells();
  const o2 = world.fields.oxygen;
  let o2Sum = 0;
  if (o2) for (let k = 0; k < cells.length; k++) o2Sum += o2[cells[k]!]!;
  const deathsByCause: DeathCause[] = [];
  let attributed = 0;
  obs.byCause.forEach((n, cause) => {
    if (n <= 0) return;
    attributed += n;
    deathsByCause.push({ cause, name: REASONS[cause] ?? 'NONE', count: n });
  });
  const deaths = obs.deaths.reduce((a, b) => a + b, 0);
  let alive = 0;
  let totalB = 0;
  for (let s = 0; s < nSp; s++) {
    alive += count[s]!;
    totalB += biomass[s]!;
  }
  return {
    tick: world.tick,
    hash: stateHash(world),
    alive,
    biomass: totalB,
    species,
    speciesAlive: count.filter((n) => n > 0).length,
    shannon: shannonIndex(count),
    oxygenMean: o2 ? o2Sum / cells.length : 0,
    births: obs.births.reduce((a, b) => a + b, 0),
    deaths,
    deathsByCause,
    deathsUnattributed: Math.max(0, deaths - attributed),
    traits,
    modules,
    capacityLimitedTicks: obs.capacityTicks,
    capacityIntervals: obs.intervals.map(([a, b]) => [a, b] as const),
    carbonAdded: world.ledger.inputs.c - baseline.ledger.inputs.c,
  };
}

/** The measures table: every row is A, B and the absolute difference B − A in game units. */
export function measureRows(a: ArmMeasures, b: ArmMeasures): MeasureRow[] {
  const row = (key: MeasureRow['key'], va: number, vb: number, species?: number): MeasureRow => ({ key, ...(species !== undefined ? { species } : {}), a: va, b: vb, diff: vb - va });
  const rows: MeasureRow[] = [
    row('alive', a.alive, b.alive),
    row('biomass', a.biomass, b.biomass),
    row('speciesAlive', a.speciesAlive, b.speciesAlive),
    row('shannon', a.shannon, b.shannon),
    row('oxygenMean', a.oxygenMean, b.oxygenMean),
    row('births', a.births, b.births),
    row('deaths', a.deaths, b.deaths),
    row('capacitySeconds', a.capacityLimitedTicks / 10, b.capacityLimitedTicks / 10),
    row('carbonAdded', a.carbonAdded, b.carbonAdded),
  ];
  for (let s = 0; s < a.species.length; s++) {
    const sa = a.species[s]!;
    const sb = b.species[s]!;
    if (sa.count === 0 && sb.count === 0 && sa.deaths === 0 && sb.deaths === 0) continue;
    rows.push(row('speciesCount', sa.count, sb.count, s));
    rows.push(row('speciesBiomass', sa.biomass, sb.biomass, s));
  }
  return rows;
}

/**
 * The paired run: A and B advance together, one tick each per pair, so their tick counts are equal
 * after every pair. `horizonTicks === null` runs until the player stops.
 */
export class PairedRun {
  readonly startTick: number;
  ticksRun = 0;
  readonly obsA: ArmObserver;
  readonly obsB: ArmObserver;

  constructor(
    readonly baseline: WorldState,
    readonly a: World,
    readonly b: World,
    readonly horizonTicks: number | null,
  ) {
    if (a.tick !== b.tick || a.tick !== baseline.tick) throw new Error(`comparison arms must start at the baseline tick ${baseline.tick} (A ${a.tick}, B ${b.tick})`);
    if (horizonTicks !== null && (!Number.isInteger(horizonTicks) || horizonTicks <= 0)) throw new Error(`invalid comparison horizon ${horizonTicks}`);
    this.startTick = a.tick;
    this.obsA = new ArmObserver(a);
    this.obsB = new ArmObserver(b);
  }

  get done(): boolean {
    return this.horizonTicks !== null && this.ticksRun >= this.horizonTicks;
  }

  /** Advance A by one tick, then B by one tick. */
  stepPair(): void {
    if (this.done) return;
    step(this.a);
    this.obsA.after(this.a);
    step(this.b);
    this.obsB.after(this.b);
    this.ticksRun++;
    if (this.a.tick !== this.b.tick) throw new Error(`comparison arms diverged in time (A ${this.a.tick}, B ${this.b.tick})`);
  }

  results(interventions: readonly Intervention[]): ComparisonResults {
    const a = measureArm(this.a, this.obsA, this.baseline);
    const b = measureArm(this.b, this.obsB, this.baseline);
    return {
      label: PAIRED_RUN_LABEL,
      baselineTick: this.startTick,
      ticks: this.ticksRun,
      horizonTicks: this.horizonTicks,
      stoppedEarly: this.horizonTicks !== null && this.ticksRun < this.horizonTicks,
      interventions,
      a,
      b,
      rows: measureRows(a, b),
    };
  }
}

/**
 * Headless comparison (ARCH §7 `compare {baseline, interventionCommands[], ticks}`): realize A and B
 * from the baseline, apply the interventions to B only as paused edits at the baseline tick, and run
 * both for `ticks`. Used by fixtures and experiments; the worker runs the same PairedRun live.
 */
export function runPairedComparison(
  baseline: WorldState,
  interventions: readonly { readonly commandId: string; readonly payload: CommandPayload }[],
  ticks: number,
): { readonly a: World; readonly b: World; readonly results: ComparisonResults } {
  const a = realizeArm(baseline, `${baseline.worldId}+A`);
  const b = realizeArm(baseline, `${baseline.worldId}+B`);
  const applied: Intervention[] = interventions.map((iv) => ({ commandId: iv.commandId, payload: iv.payload, result: applyNow(b, iv.commandId, iv.payload).result ?? null }));
  const run = new PairedRun(baseline, a, b, ticks);
  while (!run.done) run.stepPair();
  return { a, b, results: run.results(applied) };
}
