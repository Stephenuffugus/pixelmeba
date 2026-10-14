/**
 * Region probes (P4.8; SPEC §12.8 "region probes (≤ 6 rectangle/circle masks; population, biomass, food
 * and gas means, boundary transfer totals; overlap warning)"; D02 §20; CONFLICT_REGISTER R34; D-0082).
 * Phase 5 wave 11 (region-charts-gates; SPEC §12.4, §13.5; CT §10.3 E207/E209; D-0108, D-0117, D-0119):
 * salt and silicate boundary totals, honest statuses for the pools stage 2 decays, organism crossings per
 * species, per-gate totals and per-second series.
 *
 * A mask is a rectangle or a circle in cell coordinates, cells named by their integer index as content
 * geometry does (grid.ts; SPEC §13.1: a circle holds the cells whose centre squared distance ≤ r²). Its
 * cells are the playable cells (the dish mask) inside it.
 *
 * Readings are measured from the world, read only:
 * - population per species and total: living organisms whose cell (floor of the position) is inside;
 * - biomass: their carbon (B);
 * - means per cell of sugar, starch, detritus, oil, protein, broth, oxygen and CO2 (null where the world
 *   has no such field);
 * - boundary transfer totals over the window: for each pool stage 2 only moves inside the dish, the
 *   change of the in-mask total across stage 2 (after stage 1 → after stage 2), signed "into the
 *   region". Stage 2 (transport.ts stageEnvironment) moves sugar, broth, salt and silicate by diffusion
 *   and the S04 channel and nothing else (grit dissolves into silicate in stage 3, not 2); it moves oxygen
 *   and CO2 likewise and, with the lid open, also exchanges them with the air, so they are measured only
 *   for seconds with the lid closed (else why 'gas'); it never moves starch, oil or protein (deposits) and
 *   it adds to detritus (film and viral decay): those are "not measured here".
 *   The inhibitors, enzymes, breaker, sGlow, quencher, rival, v01 and v02 (PROBE_DECAYING_FIELDS) also
 *   decay in stage 2, so a change across it is not transport: listed only in a world that records
 *   'barriers' or 'devices' and uses the pool (listedDecayingFields; a v1.0 dish lists none), always
 *   'notMeasured', why 'decays', or 'resin' when an S08 resin selecting the field sits on a region cell
 *   (the resin removes it in stage 2 too; D-0119).
 * - organism crossings per species over the window: each living organism's region membership is compared
 *   with its membership after the previous tick, matched by slot and birthId (an organism a Sample
 *   Transfer or Cancel put in another slot is matched by its birthId), once after stage 4 and once after
 *   the tick (so an organism that crossed and then divided or died in the same tick still counts once). A
 *   birth, an introduction or a death is never a crossing; a move by stage 4, the S04 channel or a
 *   Transfer is.
 * - gates (D-0108, D-0117): every edge barrier of world.edges with the regions on whose boundary it sits,
 *   world.gateTally's cumulative record ("since start", saved) and its change over the window (from
 *   per-second samples kept here; null until a full second is recorded).
 * - series: per recorded second of the window, the population total and biomass at the second's end and
 *   the boundary amount of each measured pool (the sheet's charts).
 *
 * Probes are worker session state for the open dish (never saved, hashed or read by the simulation;
 * they reset on reload). The stage hook and afterTick read fields, entity columns and the stores only;
 * nothing here sends a command, draws randomness, writes the world or allocates a field. After Undo or a
 * rollback the seconds later than the restored tick are dropped (SecondRecord's rule).
 */
import { AGENT_CAP, GRID_H, GRID_W, CELL_COUNT, TICKS_PER_SECOND } from '@sim/constants';
import { edgeNeighbour, type EdgeDir, type EdgeKind } from '@sim/barriers';
import { FIELD_IDS, type FieldId } from '@sim/fields';
import { worldHasSpecies, worldHasSystem } from '@sim/gates';
import { inMask } from '@sim/grid';
import type { GateTally, World } from '@sim/world';
import { isMapWindow, MAP_RETAIN_SECONDS, SecondRecord, type MapWindow } from './relationshipMap';

export const PROBE_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type ProbeId = (typeof PROBE_IDS)[number];
/** CT §12.8 / SPEC §12.8: at most six masks. */
export const PROBES_MAX = 6;
/** Largest circle radius in cells (the dish's own radius is 64). */
export const PROBE_MAX_RADIUS = 64;

export type ProbeMask =
  | {
      readonly id: ProbeId;
      readonly shape: 'rect';
      readonly x0: number;
      readonly y0: number;
      readonly x1: number;
      readonly y1: number;
    }
  | {
      readonly id: ProbeId;
      readonly shape: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
    };

/** Fields whose per-cell mean a reading reports (in this order). */
export const PROBE_MEAN_FIELDS = [
  'sugar',
  'starch',
  'detritus',
  'oil',
  'protein',
  'broth',
  'oxygen',
  'co2',
] as const satisfies readonly FieldId[];
/** Pools whose boundary transfer a reading reports (in this order; always listed, 'absent' when missing). */
export const PROBE_BOUNDARY_FIELDS = [...PROBE_MEAN_FIELDS, 'salt', 'silicate'] as const satisfies readonly FieldId[];
/**
 * Pools stage 2 decays (transport.ts stageEnvironment: decayActivity, decayViral), listed after the
 * boundary pools as listedDecayingFields says, always 'notMeasured' (why 'decays' or 'resin').
 */
export const PROBE_DECAYING_FIELDS = [
  'inhBact',
  'inhFung',
  'inhPhoto',
  'eStarch',
  'eOil',
  'eProtein',
  'breaker',
  'sGlow',
  'quencher',
  'rival',
  'v01',
  'v02',
] as const satisfies readonly FieldId[];
/**
 * The decaying pools a reading lists (D-0119 fix 1, D-0103, D-0104): none unless the world records the
 * 'barriers' or the 'devices' system (the Phase 5 boundary exchange and resins these statuses are about),
 * so a v1.0 dish reads exactly as before; then each pool the world has a field for, except that the
 * phage pools v01 and v02 are listed only when the world records V01 or V02 (they are named after the
 * species, and a field the 'viruses' system allocates is not content the dish uses).
 */
export function listedDecayingFields(world: World): readonly FieldId[] {
  if (!worldHasSystem(world, 'barriers') && !worldHasSystem(world, 'devices')) return [];
  return PROBE_DECAYING_FIELDS.filter((f) => {
    if (world.fields[f] === undefined) return false;
    if (f === 'v01') return worldHasSpecies(world, 'V01');
    if (f === 'v02') return worldHasSpecies(world, 'V02');
    return true;
  });
}
/** Pools stage 2 only moves inside the dish (diffusion and the S04 channel), whatever the lid. */
const MOVED_ONLY: readonly FieldId[] = ['sugar', 'broth', 'salt', 'silicate'];
/** Pools stage 2 moves inside the dish and, with the lid open, exchanges with the air. */
const GASES: readonly FieldId[] = ['oxygen', 'co2'];

export type BoundaryStatus = 'measured' | 'notMeasured' | 'absent';
/**
 * Why a pool is not measured: 'gas' (the lid was open in some second of the window: the air exchanges it),
 * 'decays' (stage 2 decays it), 'resin' (an S08 resin in the region removes it in stage 2).
 */
export type NotMeasuredWhy = 'gas' | 'decays' | 'resin';

export interface ProbeBoundary {
  readonly field: string;
  readonly status: BoundaryStatus;
  /** Net amount that crossed into the region in the window (negative: out of it); 0 unless measured. */
  readonly into: number;
  /** Only on some 'notMeasured' entries (a deposit or debris has none: the sheet's general line covers it). */
  readonly why?: NotMeasuredWhy;
}

/** Organisms of one species that entered or left the region in the window. */
export interface ProbeCrossing {
  readonly species: string;
  readonly entered: number;
  readonly left: number;
}

/** Per recorded second of the window (ascending): the charts' data. null where that second has no value. */
export interface ProbeSeries {
  readonly seconds: readonly number[];
  /** Living organisms in the region at the second's end. */
  readonly total: readonly (number | null)[];
  /** Their biomass (C) at the second's end. */
  readonly biomass: readonly (number | null)[];
  /** The boundary amount into the region in each second, for every pool the reading reports 'measured'. */
  readonly pools: readonly { readonly field: string; readonly into: readonly (number | null)[] }[];
}

export interface ProbeReading {
  readonly id: ProbeId;
  readonly shape: 'rect' | 'circle';
  readonly cellCount: number;
  /** Living organisms per species (species ids, in the world's order; species with none are left out). */
  readonly population: readonly { readonly species: string; readonly count: number }[];
  readonly total: number;
  readonly biomass: number;
  readonly means: readonly { readonly field: string; readonly mean: number | null }[];
  readonly boundary: readonly ProbeBoundary[];
  /** When this region's boundary record starts after the window's start: that second. */
  readonly recordedSinceSecond: number | null;
  /** Organisms that entered or left in the window, per species (world order; species with none left out). */
  readonly crossings: readonly ProbeCrossing[];
  readonly series: ProbeSeries;
}

/** A gate's amounts: per field (FIELD_IDS order, only fields with an amount) and organism crossings. */
export interface GateAmounts {
  readonly fields: readonly { readonly field: string; readonly amount: number }[];
  readonly organisms: number;
}

export interface ProbeGate {
  readonly id: number;
  readonly kind: EdgeKind;
  readonly cell: number;
  readonly dir: EdgeDir;
  /** Regions with exactly one of the edge's two cells inside (the gate is on their boundary), in region order. */
  readonly regions: readonly ProbeId[];
  /** world.gateTally's cumulative record (saved with the dish): |flux| in either direction, field units. */
  readonly sinceStart: GateAmounts;
  /**
   * The change of the cumulative record over the window, from per-second samples kept in this session;
   * null until a full second is recorded. recordedSinceSecond: when the samples start after the window's start.
   */
  readonly window: (GateAmounts & { readonly recordedSinceSecond: number | null }) | null;
}

export interface ProbeReadings {
  readonly tick: number;
  readonly windowSeconds: MapWindow;
  readonly masks: readonly ProbeReading[];
  /** Pairs of regions that share at least one cell (ids in order). */
  readonly overlaps: readonly (readonly [ProbeId, ProbeId])[];
  /** Every edge barrier, world.edges order ([] when the world has none). */
  readonly gates: readonly ProbeGate[];
}

const isInt = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Why `m` is not a valid mask (null when it is). */
export function probeMaskProblem(m: unknown): string | null {
  if (typeof m !== 'object' || m === null) return 'not a region';
  const r = m as Record<string, unknown>;
  if (!(PROBE_IDS as readonly unknown[]).includes(r.id)) return 'a region is named A to F';
  if (r.shape === 'rect') {
    for (const k of ['x0', 'x1'] as const)
      if (!isInt(r[k], 0, GRID_W - 1)) return `${k} is not a cell column`;
    for (const k of ['y0', 'y1'] as const) if (!isInt(r[k], 0, GRID_H - 1)) return `${k} is not a cell row`;
  } else if (r.shape === 'circle') {
    if (!isInt(r.cx, 0, GRID_W - 1) || !isInt(r.cy, 0, GRID_H - 1)) return 'the centre is not a cell';
    if (!isInt(r.r, 0, PROBE_MAX_RADIUS)) return 'the radius is not 0–64 cells';
  } else return 'a region is a rectangle or a circle';
  return maskCellList(m as ProbeMask).length === 0 ? 'That region has no cells inside the dish.' : null;
}

/** Why the list is not a valid probe set (null when it is). */
export function probeSetProblem(list: unknown): string | null {
  if (!Array.isArray(list)) return 'not a list of regions';
  if (list.length > PROBES_MAX) return 'Six regions is the most. Delete one to draw another.';
  const ids = new Set<unknown>();
  for (const m of list) {
    const p = probeMaskProblem(m);
    if (p !== null) return p;
    const id = (m as ProbeMask).id;
    if (ids.has(id)) return `two regions are named ${id}`;
    ids.add(id);
  }
  return null;
}

/** The playable cells inside a mask, row-major. Pure. */
export function maskCellList(m: ProbeMask): Int32Array {
  const out: number[] = [];
  if (m.shape === 'rect') {
    const xa = Math.min(m.x0, m.x1);
    const xb = Math.max(m.x0, m.x1);
    const ya = Math.min(m.y0, m.y1);
    const yb = Math.max(m.y0, m.y1);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) if (inMask(x, y)) out.push(y * GRID_W + x);
  } else {
    const r2 = m.r * m.r;
    for (let y = Math.max(0, m.cy - m.r); y <= Math.min(GRID_H - 1, m.cy + m.r); y++) {
      for (let x = Math.max(0, m.cx - m.r); x <= Math.min(GRID_W - 1, m.cx + m.r); x++) {
        const dx = x - m.cx;
        const dy = y - m.cy;
        if (dx * dx + dy * dy <= r2 && inMask(x, y)) out.push(y * GRID_W + x);
      }
    }
  }
  return Int32Array.from(out);
}

/** Pairs of masks that share a cell. Pure. */
export function overlapsOf(masks: readonly ProbeMask[]): [ProbeId, ProbeId][] {
  const lists = masks.map((m) => {
    const inside = new Uint8Array(CELL_COUNT);
    for (const c of maskCellList(m)) inside[c] = 1;
    return inside;
  });
  const out: [ProbeId, ProbeId][] = [];
  for (let a = 0; a < masks.length; a++) {
    for (let b = a + 1; b < masks.length; b++) {
      const la = lists[a]!;
      const lb = lists[b]!;
      let shared = false;
      for (let c = 0; c < CELL_COUNT && !shared; c++) if (la[c] === 1 && lb[c] === 1) shared = true;
      if (shared) {
        const [x, y] = [masks[a]!.id, masks[b]!.id];
        out.push(x < y ? [x, y] : [y, x]);
      }
    }
  }
  return out.sort((p, q) => (p[0] + p[1] < q[0] + q[1] ? -1 : 1));
}

/** Whether stage 2 only moves `field` inside the dish in `world` as it is now. */
export function boundaryMeasurable(world: World, field: FieldId): boolean {
  if (world.fields[field] === undefined) return false;
  if (MOVED_ONLY.includes(field)) return true;
  if (GASES.includes(field)) return world.settings.lid === 'closed';
  return false;
}

function sameMask(a: ProbeMask, b: ProbeMask): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface RegionBucket {
  /** The dish second this bucket holds (set when the bucket is first used). */
  second: number;
  /** Net change across stage 2 per PROBE_BOUNDARY_FIELDS entry. */
  readonly into: Float64Array;
  /** 1 while every tick of the second was measurable for that field. */
  readonly measured: Uint8Array;
  /** Organisms that entered / left, per species index (allocated at the first crossing). */
  entered: Int32Array | null;
  left: Int32Array | null;
  /** Population total and biomass after the latest tick of the second (sampled: at least one tick seen). */
  total: number;
  biomass: number;
  sampled: boolean;
}

interface Region {
  readonly mask: ProbeMask;
  readonly cells: Int32Array;
  readonly record: SecondRecord<RegionBucket>;
  readonly pre: Float64Array;
}

/** world.gateTally copied at a whole dish second (the start of second `second`). */
interface GateSample {
  second: number;
  tallies: GateTally[];
}

function sumOver(arr: Float64Array, cells: Int32Array): number {
  let s = 0;
  for (let k = 0; k < cells.length; k++) s += arr[cells[k]!]!;
  return s;
}

function newBucket(): RegionBucket {
  return {
    second: -1,
    into: new Float64Array(PROBE_BOUNDARY_FIELDS.length),
    measured: new Uint8Array(PROBE_BOUNDARY_FIELDS.length).fill(1),
    entered: null,
    left: null,
    total: 0,
    biomass: 0,
    sampled: false,
  };
}

/** The tally record of structure `id` in a list sorted by id (read only; null when it has none). */
function findTally(list: readonly GateTally[], id: number): GateTally | null {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid]!.id < id) lo = mid + 1;
    else hi = mid;
  }
  const t = list[lo];
  return t !== undefined && t.id === id ? t : null;
}

function copyTallies(list: readonly GateTally[]): GateTally[] {
  return list.map((t) => ({ id: t.id, fields: { ...t.fields }, organisms: t.organisms }));
}

/** Amounts of `now` minus `base` (base null: none), fields in FIELD_IDS order, only fields `now` holds with an amount. */
function gateAmounts(now: GateTally | null, base: GateTally | null): GateAmounts {
  if (now === null) return { fields: [], organisms: 0 };
  const fields: { field: string; amount: number }[] = [];
  for (const f of FIELD_IDS) {
    const v = now.fields[f];
    if (v === undefined || !(v > 0)) continue;
    fields.push({ field: f, amount: v - (base?.fields[f] ?? 0) });
  }
  return { fields, organisms: now.organisms - (base?.organisms ?? 0) };
}

/** The open dish's regions and their records. */
export class ProbeSet {
  private regions: Region[] = [];
  private world: World;
  /** Bit k set on a cell inside regions[k] (rebuilt by set()). */
  private cellBits = new Uint8Array(CELL_COUNT);
  // Membership after the previous tick, per slot (crossings). Allocated with the first region.
  private prevAlive: Uint8Array | null = null;
  private prevBirth: Float64Array | null = null;
  private prevBits: Uint8Array | null = null;
  private prevHW = 0;
  private snapValid = false;
  /** Membership of organisms that left their slots into a held sample (birthId → bits), until it is released. */
  private held = new Map<number, number>();
  private readonly regionTotals = new Float64Array(PROBES_MAX);
  private readonly regionBiomass = new Float64Array(PROBES_MAX);
  /** Gate tallies copied at whole seconds (retain one more than the longest window: its start is a boundary). */
  private gateSamples = new SecondRecord<GateSample>(0, () => ({ second: -1, tallies: [] }), MAP_RETAIN_SECONDS + 1);
  /** Stage hook for step(); reads only. */
  readonly hook: (stage: number, world: World) => void;

  constructor(world: World) {
    this.world = world;
    this.gateSamples.startTick = world.tick;
    this.hook = (stage, w) => {
      if (this.regions.length === 0) return;
      if (w !== this.world) this.rebind(w); // Undo or a rollback replaced the world: before its first tick runs
      if (stage === 1) this.beforeEnvironment(w);
      else if (stage === 2) this.afterEnvironment(w);
      else if (stage === 4) this.crossings(w, Math.floor(w.tick / TICKS_PER_SECOND), false);
    };
  }

  get masks(): ProbeMask[] {
    return this.regions.map((r) => r.mask);
  }

  get size(): number {
    return this.regions.length;
  }

  /** Whether this set is bound to `world`. */
  watches(world: World): boolean {
    return this.world === world;
  }

  /** The dish's world was replaced (Undo, a rollback): bind to it and drop later seconds. */
  rebind(world: World): void {
    if (world === this.world) return;
    this.world = world;
    for (const r of this.regions) r.record.restoreTo(world.tick);
    this.gateSamples.restoreTo(world.tick);
    this.held.clear();
    this.snapValid = false;
    if (this.regions.length > 0) this.snapshot(world);
    this.sampleGates(world);
  }

  /**
   * Replace the masks (validated by the caller with probeSetProblem). A mask kept unchanged keeps its
   * records; a new or changed one starts recording at the dish's current tick.
   */
  set(masks: readonly ProbeMask[], world: World): void {
    this.rebind(world);
    const old = this.regions;
    this.regions = masks.map((m) => {
      const kept = old.find((r) => sameMask(r.mask, m));
      if (kept) return kept;
      return {
        mask: m,
        cells: maskCellList(m),
        record: new SecondRecord<RegionBucket>(world.tick, newBucket),
        pre: new Float64Array(PROBE_BOUNDARY_FIELDS.length),
      };
    });
    const remap = this.regions.map((r) => old.indexOf(r));
    this.cellBits.fill(0);
    this.regions.forEach((r, k) => {
      for (const c of r.cells) this.cellBits[c]! |= 1 << k;
    });
    if (this.regions.length === 0) {
      this.snapValid = false;
      this.held.clear();
      return;
    }
    if (!this.snapValid) {
      this.snapshot(world);
      return;
    }
    // Kept regions keep each organism's previous membership; a new region starts from where it is now.
    const remapBits = (bits: number): number => {
      let out = 0;
      remap.forEach((o, k) => {
        if (o >= 0 && (bits & (1 << o)) !== 0) out |= 1 << k;
      });
      return out;
    };
    const fresh = remap.reduce((acc, o, k) => (o < 0 ? acc | (1 << k) : acc), 0);
    const c = world.ents.cols;
    const alive = this.prevAlive!;
    const birth = this.prevBirth!;
    const bits = this.prevBits!;
    for (let i = 0; i < this.prevHW; i++) {
      if (alive[i] !== 1) continue;
      let next = remapBits(bits[i]!);
      if (i < world.ents.highWater && c.alive[i] === 1 && c.birthId[i] === birth[i]) next |= this.bitsAt(world, i) & fresh;
      bits[i] = next;
    }
    for (const [b, v] of [...this.held]) this.held.set(b, remapBits(v));
  }

  /** The region bits of the cell under slot i (0 outside the grid). */
  private bitsAt(world: World, i: number): number {
    const c = world.ents.cols;
    const x = Math.floor(c.x[i]!);
    const y = Math.floor(c.y[i]!);
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return 0;
    return this.cellBits[y * GRID_W + x]!;
  }

  /** Every slot's membership now (the baseline for the next tick's crossings). */
  private snapshot(world: World): void {
    this.prevAlive ??= new Uint8Array(AGENT_CAP);
    this.prevBirth ??= new Float64Array(AGENT_CAP);
    this.prevBits ??= new Uint8Array(AGENT_CAP);
    const c = world.ents.cols;
    const hw = world.ents.highWater;
    this.prevAlive.fill(0, 0, Math.max(hw, this.prevHW));
    for (let i = 0; i < hw; i++) {
      if (c.alive[i] !== 1) continue;
      this.prevAlive[i] = 1;
      this.prevBirth[i] = c.birthId[i]!;
      this.prevBits[i] = this.bitsAt(world, i);
    }
    this.prevHW = hw;
    this.snapValid = true;
  }

  /** After stage 1: each region's in-mask totals before the environment stage. */
  private beforeEnvironment(world: World): void {
    for (const r of this.regions) {
      for (let k = 0; k < PROBE_BOUNDARY_FIELDS.length; k++) {
        const f = PROBE_BOUNDARY_FIELDS[k]!;
        const arr = world.fields[f];
        r.pre[k] = arr !== undefined && boundaryMeasurable(world, f) ? sumOver(arr, r.cells) : NaN;
      }
    }
  }

  /** After stage 2: the change of each in-mask total across it, into this second's bucket. */
  private afterEnvironment(world: World): void {
    const second = Math.floor(world.tick / TICKS_PER_SECOND);
    for (const r of this.regions) {
      const b = r.record.at(second);
      b.second = second;
      for (let k = 0; k < PROBE_BOUNDARY_FIELDS.length; k++) {
        const before = r.pre[k]!;
        const arr = world.fields[PROBE_BOUNDARY_FIELDS[k]!];
        if (Number.isNaN(before) || arr === undefined) b.measured[k] = 0;
        else b.into[k]! += sumOver(arr, r.cells) - before;
        r.pre[k] = NaN;
      }
    }
  }

  /** Call once after every step of the watched world (a restored world is rebound first). */
  afterTick(world: World): void {
    this.rebind(world);
    if (this.regions.length > 0 && world.tick > 0) this.crossings(world, Math.floor((world.tick - 1) / TICKS_PER_SECOND), true);
    this.sampleGates(world);
  }

  /** At a whole dish second: copy the gate tallies (only while the world has edge barriers). */
  private sampleGates(world: World): void {
    if (world.edges.length === 0 || world.tick % TICKS_PER_SECOND !== 0) return;
    const second = world.tick / TICKS_PER_SECOND;
    const s = this.gateSamples.at(second);
    s.second = second;
    s.tallies = copyTallies(world.gateTally);
  }

  /**
   * Membership now against the last baseline: entries and leaves into `second`'s buckets, then the
   * baseline moves to now. Called after stage 4 (from the previous tick's end: commands, the S04 channel
   * and movement, before a division gives the dividing slot new birthIds in stage 9 or a death in stages
   * 5–7 removes an organism that crossed) and after the tick (later moves; `atEnd` also samples the
   * population total and biomass at the second's end).
   */
  private crossings(world: World, second: number, atEnd: boolean): void {
    if (!this.snapValid) {
      this.snapshot(world);
      if (!atEnd) return;
    }
    const nRegions = this.regions.length;
    const buckets = this.regions.map((r) => {
      const b = r.record.at(second);
      b.second = second;
      return b;
    });
    const nSpecies = world.species.length;
    const totals = this.regionTotals.fill(0);
    const biomass = this.regionBiomass.fill(0);
    const alive = this.prevAlive!;
    const birth = this.prevBirth!;
    const bits = this.prevBits!;
    const c = world.ents.cols;
    const xs = c.x;
    const ys = c.y;
    const cellBits = this.cellBits;
    const hw = world.ents.highWater;
    const n = Math.max(hw, this.prevHW);
    const count = (sp: number, before: number, now: number): void => {
      const diff = before ^ now;
      if (diff === 0) return;
      for (let k = 0; k < nRegions; k++) {
        const bit = 1 << k;
        if ((diff & bit) === 0) continue;
        const b = buckets[k]!;
        if ((now & bit) !== 0) (b.entered ??= new Int32Array(nSpecies))[sp]!++;
        else (b.left ??= new Int32Array(nSpecies))[sp]!++;
      }
    };
    // Organisms that left their slot (a death, a sample taken) and slots with a new occupant (a birth, an
    // introduction, a sample released into other slots): matched by birthId after the scan.
    let gone: Map<number, number> | null = null;
    let fresh: number[] | null = null;
    for (let i = 0; i < n; i++) {
      const isAlive = i < hw && c.alive[i] === 1;
      const was = alive[i] === 1;
      const id = isAlive ? c.birthId[i]! : 0;
      if (was && (!isAlive || id !== birth[i])) (gone ??= new Map()).set(birth[i]!, bits[i]!);
      if (!isAlive) {
        alive[i] = 0;
        continue;
      }
      const x = Math.floor(xs[i]!);
      const y = Math.floor(ys[i]!);
      const now = x < 0 || y < 0 || x >= GRID_W || y >= GRID_H ? 0 : cellBits[y * GRID_W + x]!;
      if (atEnd && now !== 0) {
        const B = c.B[i]!;
        for (let k = 0; k < nRegions; k++) {
          if ((now & (1 << k)) === 0) continue;
          totals[k]!++;
          biomass[k]! += B;
        }
      }
      if (was && id === birth[i]) {
        if (bits[i] !== now) count(c.species[i]!, bits[i]!, now);
      } else (fresh ??= []).push(i);
      alive[i] = 1;
      birth[i] = id;
      bits[i] = now;
    }
    if (fresh !== null) {
      for (const i of fresh) {
        const id = birth[i]!;
        const before = gone?.get(id) ?? this.held.get(id);
        if (before === undefined) continue; // born or introduced: not a crossing
        gone?.delete(id);
        this.held.delete(id);
        count(c.species[i]!, before, bits[i]!);
      }
    }
    // Organisms now held in a sample keep their membership until it is released (or discarded).
    const sample = world.sample;
    if (sample === null) this.held.clear();
    else if (gone !== null) for (const row of sample.rows) {
      const before = gone.get(row.cols.birthId);
      if (before !== undefined) this.held.set(row.cols.birthId, before);
    }
    this.prevHW = hw;
    if (!atEnd) return;
    for (let k = 0; k < nRegions; k++) {
      const b = buckets[k]!;
      b.total = totals[k]!;
      b.biomass = biomass[k]!;
      b.sampled = true;
    }
  }

  /** Readings of every region at the world's current tick, totals over the last `windowSeconds`. Pure read. */
  read(world: World, windowSeconds: MapWindow): ProbeReadings {
    this.rebind(world);
    const w: MapWindow = isMapWindow(windowSeconds) ? windowSeconds : 60;
    const masks = this.regions.map((r, k) => readRegion(world, r, k, this.cellBits, w));
    return { tick: world.tick, windowSeconds: w, masks, overlaps: overlapsOf(this.masks), gates: this.readGates(world, w) };
  }

  private readGates(world: World, w: MapWindow): ProbeGate[] {
    if (world.edges.length === 0) return [];
    const to = world.tick > 0 ? Math.floor((world.tick - 1) / TICKS_PER_SECOND) : -1;
    const from = Math.max(0, to - w + 1);
    // The sample at the window's start, or the first one after it (the record started later).
    const base = this.gateSamples.range(from, Number.MAX_SAFE_INTEGER)[0];
    const full = base !== undefined && world.tick - base.second * TICKS_PER_SECOND >= TICKS_PER_SECOND;
    return world.edges.map((e): ProbeGate => {
      const other = edgeNeighbour(e.cell, e.dir);
      const cross = this.cellBits[e.cell]! ^ (other >= 0 ? this.cellBits[other]! : 0);
      const regions = this.regions.flatMap((r, k) => ((cross & (1 << k)) !== 0 ? [r.mask.id] : []));
      const now = findTally(world.gateTally, e.id);
      return {
        id: e.id,
        kind: e.kind,
        cell: e.cell,
        dir: e.dir,
        regions,
        sinceStart: gateAmounts(now, null),
        window: full
          ? {
              ...gateAmounts(now, findTally(base.tallies, e.id)),
              recordedSinceSecond: base.second > from ? base.second : null,
            }
          : null,
      };
    });
  }
}

/** Fields an S08 resin with a selection removes on a cell of region bit `bit`. */
function resinFieldsIn(world: World, cellBits: Uint8Array, bit: number): Set<string> {
  const out = new Set<string>();
  for (const d of world.devices) {
    if (d.kind !== 'S08' || !d.resinSelect || d.resinSelect.length === 0) continue;
    if ((cellBits[d.cell]! & bit) === 0) continue;
    for (const t of d.resinSelect) out.add(t);
  }
  return out;
}

function readRegion(world: World, r: Region, index: number, cellBits: Uint8Array, w: MapWindow): ProbeReading {
  const inside = new Uint8Array(CELL_COUNT);
  for (const c of r.cells) inside[c] = 1;
  const counts = new Array<number>(world.species.length).fill(0);
  let biomass = 0;
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const x = Math.floor(c.x[i]!);
    const y = Math.floor(c.y[i]!);
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H || inside[y * GRID_W + x] !== 1) continue;
    counts[c.species[i]!]!++;
    biomass += c.B[i]!;
  }
  const population = counts.flatMap((n, s) => (n > 0 ? [{ species: world.species[s]!.id, count: n }] : []));
  const means = PROBE_MEAN_FIELDS.map((f) => {
    const arr = world.fields[f];
    return { field: f, mean: arr === undefined ? null : sumOver(arr, r.cells) / r.cells.length };
  });
  const win = r.record.window(world.tick, w);
  const buckets = r.record.range(win.from, win.to);
  const boundary: ProbeBoundary[] = PROBE_BOUNDARY_FIELDS.map((f, k): ProbeBoundary => {
    if (world.fields[f] === undefined) return { field: f, status: 'absent', into: 0 };
    const ok =
      (MOVED_ONLY.includes(f) || GASES.includes(f)) &&
      buckets.every((b) => b.measured[k] === 1) &&
      (buckets.length > 0 || boundaryMeasurable(world, f));
    if (!ok) return GASES.includes(f) ? { field: f, status: 'notMeasured', into: 0, why: 'gas' } : { field: f, status: 'notMeasured', into: 0 };
    let into = 0;
    for (const b of buckets) into += b.into[k]!;
    return { field: f, status: 'measured', into };
  });
  const resin = world.devices.length > 0 ? resinFieldsIn(world, cellBits, 1 << index) : null;
  for (const f of listedDecayingFields(world)) {
    boundary.push({ field: f, status: 'notMeasured', into: 0, why: resin?.has(f) ? 'resin' : 'decays' });
  }
  // Organism crossings over the window.
  const entered = new Array<number>(world.species.length).fill(0);
  const left = new Array<number>(world.species.length).fill(0);
  for (const b of buckets) {
    if (b.entered) for (let s = 0; s < b.entered.length; s++) entered[s]! += b.entered[s]!;
    if (b.left) for (let s = 0; s < b.left.length; s++) left[s]! += b.left[s]!;
  }
  const crossings = world.species.flatMap((sp, s) =>
    entered[s]! > 0 || left[s]! > 0 ? [{ species: sp.id, entered: entered[s]!, left: left[s]! }] : [],
  );
  const series: ProbeSeries = {
    seconds: buckets.map((b) => b.second),
    total: buckets.map((b) => (b.sampled ? b.total : null)),
    biomass: buckets.map((b) => (b.sampled ? b.biomass : null)),
    pools: PROBE_BOUNDARY_FIELDS.flatMap((f, k) =>
      boundary[k]!.status === 'measured'
        ? [{ field: f, into: buckets.map((b) => (b.measured[k] === 1 ? b.into[k]! : null)) }]
        : [],
    ),
  };
  return {
    id: r.mask.id,
    shape: r.mask.shape,
    cellCount: r.cells.length,
    population,
    total: counts.reduce((a, b) => a + b, 0),
    biomass,
    means,
    boundary,
    recordedSinceSecond: win.since,
    crossings,
    series,
  };
}
