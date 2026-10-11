/**
 * Region probes (P4.8; SPEC §12.8 "region probes (≤ 6 rectangle/circle masks; population, biomass, food
 * and gas means, boundary transfer totals; overlap warning)"; D02 §20; CONFLICT_REGISTER R34; D-0082).
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
 *   region". Stage 2 (transport.ts stageEnvironment) moves sugar and broth by diffusion and nothing
 *   else; it moves oxygen and CO2 by diffusion and, with the lid open, also exchanges them with the air,
 *   so they are measured only for seconds with the lid closed; it never moves starch, oil or protein
 *   (deposits) and it adds to detritus (film and viral decay): those are "not measured here".
 *
 * Probes are worker session state for the open dish (never saved, hashed or read by the simulation;
 * they reset on reload). The stage hook reads fields only; nothing here sends a command or draws
 * randomness. After Undo or a rollback the boundary seconds later than the restored tick are dropped
 * (SecondRecord's rule).
 */
import { GRID_H, GRID_W, CELL_COUNT, TICKS_PER_SECOND } from '@sim/constants';
import type { FieldId } from '@sim/fields';
import { inMask } from '@sim/grid';
import type { World } from '@sim/world';
import { isMapWindow, SecondRecord, type MapWindow } from './relationshipMap';

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
/** Pools whose boundary transfer a reading reports (in this order). */
export const PROBE_BOUNDARY_FIELDS = PROBE_MEAN_FIELDS;
/** Pools stage 2 only moves inside the dish (diffusion), whatever the lid. */
const MOVED_ONLY: readonly FieldId[] = ['sugar', 'broth'];
/** Pools stage 2 moves inside the dish and, with the lid open, exchanges with the air. */
const GASES: readonly FieldId[] = ['oxygen', 'co2'];

export type BoundaryStatus = 'measured' | 'notMeasured' | 'absent';

export interface ProbeBoundary {
  readonly field: string;
  readonly status: BoundaryStatus;
  /** Net amount that crossed into the region in the window (negative: out of it); 0 unless measured. */
  readonly into: number;
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
}

export interface ProbeReadings {
  readonly tick: number;
  readonly windowSeconds: MapWindow;
  readonly masks: readonly ProbeReading[];
  /** Pairs of regions that share at least one cell (ids in order). */
  readonly overlaps: readonly (readonly [ProbeId, ProbeId])[];
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

interface BoundaryBucket {
  /** Net change across stage 2 per PROBE_BOUNDARY_FIELDS entry. */
  readonly into: Float64Array;
  /** 1 while every tick of the second was measurable for that field. */
  readonly measured: Uint8Array;
}

interface Region {
  readonly mask: ProbeMask;
  readonly cells: Int32Array;
  readonly record: SecondRecord<BoundaryBucket>;
  readonly pre: Float64Array;
}

function sumOver(arr: Float64Array, cells: Int32Array): number {
  let s = 0;
  for (let k = 0; k < cells.length; k++) s += arr[cells[k]!]!;
  return s;
}

/** The open dish's regions and their boundary records. */
export class ProbeSet {
  private regions: Region[] = [];
  private world: World;
  /** Stage hook for step(); reads only. */
  readonly hook: (stage: number, world: World) => void;

  constructor(world: World) {
    this.world = world;
    this.hook = (stage, w) => {
      if (this.regions.length === 0) return;
      if (w !== this.world) this.rebind(w); // Undo or a rollback replaced the world: before its first tick runs
      if (stage === 1) this.beforeEnvironment(w);
      else if (stage === 2) this.afterEnvironment(w);
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

  /** The dish's world was replaced (Undo, a rollback): bind to it and drop later boundary seconds. */
  rebind(world: World): void {
    if (world === this.world) return;
    this.world = world;
    for (const r of this.regions) r.record.restoreTo(world.tick);
  }

  /**
   * Replace the masks (validated by the caller with probeSetProblem). A mask kept unchanged keeps its
   * boundary record; a new or changed one starts recording at the dish's current tick.
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
        record: new SecondRecord<BoundaryBucket>(world.tick, () => ({
          into: new Float64Array(PROBE_BOUNDARY_FIELDS.length),
          measured: new Uint8Array(PROBE_BOUNDARY_FIELDS.length).fill(1),
        })),
        pre: new Float64Array(PROBE_BOUNDARY_FIELDS.length),
      };
    });
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
  }

  /** Readings of every region at the world's current tick, boundary totals over the last `windowSeconds`. Pure read. */
  read(world: World, windowSeconds: MapWindow): ProbeReadings {
    this.rebind(world);
    const w: MapWindow = isMapWindow(windowSeconds) ? windowSeconds : 60;
    const masks = this.regions.map((r) => readRegion(world, r, w));
    return { tick: world.tick, windowSeconds: w, masks, overlaps: overlapsOf(this.masks) };
  }
}

function readRegion(world: World, r: Region, w: MapWindow): ProbeReading {
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
  const boundary = PROBE_BOUNDARY_FIELDS.map((f, k): ProbeBoundary => {
    if (world.fields[f] === undefined) return { field: f, status: 'absent', into: 0 };
    const ok =
      (MOVED_ONLY.includes(f) || GASES.includes(f)) &&
      buckets.every((b) => b.measured[k] === 1) &&
      (buckets.length > 0 || boundaryMeasurable(world, f));
    if (!ok) return { field: f, status: 'notMeasured', into: 0 };
    let into = 0;
    for (const b of buckets) into += b.into[k]!;
    return { field: f, status: 'measured', into };
  });
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
  };
}
