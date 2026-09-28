/**
 * Stage 8 — state and structures (SPEC §3.2, §5.3). Reservation order per organism: mandatory state
 * transitions (dormancy, SPEC §7.6) → native optional actions in stable action-ID order →
 * supplementary modules E01…E17. Every action reserves its energy before another can use the
 * remainder; costs are paid only for work actually done.
 *
 * E_STARCH secretion (native B06/F02, or gained through E01 — never both, SPEC §9): a producer
 * emits its activity rate into its own cell while Active, E > its threshold after maintenance, a
 * compatible deposited substrate lies in its cell or a four-neighbor cell, and local activity is
 * below the cap; it pays the emit cost per second. The numbers come from the producer's profile:
 * CT constants for a native producer, the world's recorded E01 parameters for a carrier.
 */
import { CELL_COUNT, DT, GRID_H, GRID_W } from './constants';
import { FLAG, LIFE_ACTIVE } from './entities';
import { FIELD_DEFS, FIELD_IDS, type FieldId } from './fields';
import { dormancyStep } from './dormancy';
import {
  brushCellOutcome,
  displacementTargets,
  LAB_MAX_RADIUS,
  PAINTED_SHADE,
  sealsCell,
  strokeFootprint,
  STRUCTURE_CODES,
  ST_NONE,
  SUBSTRATE_CODES,
  type LabBrushRule,
  type PlaceableStructure,
  type SubstrateName,
} from './grid';
import type { StarchRules } from './phenotype';
import { profileOf } from './profiles';
import { R } from './reasons';
import { entityCell } from './spatial';
import { markField } from './transport';
import type { World } from './world';

function substrateNear(sub: Float64Array, cell: number): boolean {
  if (sub[cell]! > 0) return true;
  const x = cell % GRID_W;
  if (x + 1 < GRID_W && sub[cell + 1]! > 0) return true;
  if (x > 0 && sub[cell - 1]! > 0) return true;
  if (cell + GRID_W < sub.length && sub[cell + GRID_W]! > 0) return true;
  if (cell - GRID_W >= 0 && sub[cell - GRID_W]! > 0) return true;
  return false;
}

/** Try one secretion action; returns a reason code describing the outcome. */
function secrete(world: World, i: number, rules: StarchRules, activity: FieldId, substrate: FieldId): number {
  const c = world.ents.cols;
  const act = world.fields[activity];
  const sub = world.fields[substrate];
  if (!act || !sub) return R.SECRETION_NO_SUBSTRATE;
  if (c.E[i]! <= rules.minEnergy) return R.SECRETION_ENERGY_LOW;
  const cell = entityCell(c.x[i]!, c.y[i]!);
  if (!substrateNear(sub, cell)) return R.SECRETION_NO_SUBSTRATE;
  if (act[cell]! >= rules.localCap) return R.SECRETION_SATURATED;
  const cost = rules.emitCost * DT;
  if (c.E[i]! < cost) return R.SECRETION_ENERGY_LOW;
  c.E[i]! -= cost;
  world.ledger.energy.secretion += cost;
  act[cell]! += rules.emitRate * DT;
  markField(world, activity);
  return R.SECRETING;
}

export function stageStructures(world: World): void {
  const e = world.ents;
  const c = e.cols;
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    c.secreting[i] = 0;
    c.flags[i] = c.flags[i]! & ~FLAG.secreting;
    const prof = profileOf(world, i);
    // 1. Mandatory transitions.
    dormancyStep(world, i, prof);
    if (c.lifeState[i] !== LIFE_ACTIVE) continue;
    // 2–3. Optional actions: E_STARCH secretion (native action, or the E01 module's).
    if (prof.starch !== null) {
      const outcome = secrete(world, i, prof.starch, 'eStarch', 'starch');
      c.secretionCode[i] = outcome;
      if (outcome === R.SECRETING) {
        c.secreting[i] = 1;
        c.flags[i] = c.flags[i]! | FLAG.secreting;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Lab habitat edits (SPEC §2.2, §2.4, §10.4; CT §4 structures, §5.1 habitat paint; P2.7). One
// completed stroke = one command over the stroke's footprint (strokeFootprint: distance-sampled, each
// cell once, ascending). No edit creates or destroys material:
// - paint substrate: replaces water/gel/sediment on open cells; life, deposits and dissolved amounts
//   stay exactly where they are; cells under a structure keep their substrate (skipped);
// - paint shade: light × 0.1 on covered cells, or back to 1.0 when erasing; moves nothing;
// - place stone/wall/bead: only on empty in-dish cells (no structure, no live organism, never past
//   the rim). Stone and wall hold no solutes (the invariant applyHabitat establishes), so whatever a
//   newly sealed cell held is moved, whole and exactly, into the nearest open cells on the same side
//   (displacementTargets); a sealed region with no open neighbor is refused. Porous beads pass
//   solutes, so nothing moves;
// - erase structure: removes stone/wall/bead only; the substrate underneath was never changed, so it
//   is restored as it was; the freed cell starts empty and fills by ordinary transport.
// Totals are unchanged by every edit (moves are internal); the amount moved aside is recorded in the
// command's result, which the saved command log keeps. No randomness is used.

export type LabStroke = ReadonlyArray<readonly [number, number]>;

export type HabitatEditPayload =
  | {
      readonly kind: 'paintSubstrate';
      readonly substrate: SubstrateName;
      readonly points: LabStroke;
      readonly radius: number;
    }
  | {
      readonly kind: 'paintShade';
      readonly erase: boolean;
      readonly points: LabStroke;
      readonly radius: number;
    }
  | {
      readonly kind: 'placeStructure';
      readonly structure: PlaceableStructure;
      readonly points: LabStroke;
      readonly radius: number;
    }
  | { readonly kind: 'eraseStructure'; readonly points: LabStroke; readonly radius: number };

export type HabitatEditKind = HabitatEditPayload['kind'];
export const HABITAT_EDIT_KINDS: readonly HabitatEditKind[] = [
  'paintSubstrate',
  'paintShade',
  'placeStructure',
  'eraseStructure',
];

/** Why covered cells were refused. */
export interface HabitatSkips {
  readonly rim: number;
  readonly structure: number;
  readonly organism: number;
  /** Cells a stone or wall would seal with no open neighbor to take their contents. */
  readonly enclosed: number;
}

/** Conserved material a new stone or wall moved into neighboring open cells (totals unchanged). */
export interface HabitatMoved {
  readonly c: number;
  readonly n: number;
  readonly m: number;
}

export interface HabitatEditResult {
  readonly accepted: number;
  readonly rejected: number;
  readonly note?: string;
  readonly skipped?: HabitatSkips;
  readonly moved?: HabitatMoved;
}

/** Most points one stroke may carry (a long finger stroke is a few hundred; points are ≥ 0.5 cells apart). */
export const LAB_MAX_POINTS = 20000;
/** Points must lie on or near the grid: a stroke far outside it is malformed, not a long stroke. */
const POINT_MARGIN = LAB_MAX_RADIUS + 2;

/** Which brush rule a habitat edit follows (shared with the renderer's preview). */
export function habitatEditRule(kind: HabitatEditKind): LabBrushRule {
  return kind === 'paintSubstrate'
    ? 'substrate'
    : kind === 'paintShade'
      ? 'shade'
      : kind === 'placeStructure'
        ? 'place'
        : 'erase';
}

/** Cells holding a live organism (any life state), for "never overlap a live organism". */
export function occupiedCells(world: World): Uint8Array {
  const out = new Uint8Array(CELL_COUNT);
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const cell = entityCell(c.x[i]!, c.y[i]!);
    if (cell >= 0 && cell < CELL_COUNT) out[cell] = 1;
  }
  return out;
}

/** A malformed payload (from a damaged file or a bug) is refused whole: reason, or null when valid. */
export function invalidHabitatEdit(p: HabitatEditPayload): string | null {
  if (
    typeof p.radius !== 'number' ||
    !Number.isFinite(p.radius) ||
    p.radius <= 0 ||
    p.radius > LAB_MAX_RADIUS
  )
    return 'invalid radius';
  if (!Array.isArray(p.points) || p.points.length === 0) return 'empty stroke';
  if (p.points.length > LAB_MAX_POINTS) return 'stroke too long';
  for (const pt of p.points as readonly unknown[]) {
    if (!Array.isArray(pt) || pt.length !== 2) return 'invalid point';
    const x: unknown = pt[0];
    const y: unknown = pt[1];
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y))
      return 'invalid point';
    if (x < -POINT_MARGIN || y < -POINT_MARGIN || x > GRID_W + POINT_MARGIN || y > GRID_H + POINT_MARGIN)
      return 'point outside the dish area';
  }
  if (p.kind === 'paintSubstrate' && !Object.prototype.hasOwnProperty.call(SUBSTRATE_CODES, p.substrate))
    return `unknown substrate ${String(p.substrate)}`;
  if (p.kind === 'paintShade' && typeof p.erase !== 'boolean') return 'invalid shade mode';
  if (p.kind === 'placeStructure' && !Object.prototype.hasOwnProperty.call(STRUCTURE_CODES, p.structure))
    return `unknown structure ${String(p.structure)}`;
  return null;
}

/**
 * Apply one habitat edit (stage 1, as a command). Returns accepted/rejected cell counts; `skipped`
 * says why cells were refused and `moved` how much material a new stone or wall pushed aside.
 */
export function applyHabitatEdit(world: World, p: HabitatEditPayload): HabitatEditResult {
  const invalid = invalidHabitatEdit(p);
  if (invalid) return { accepted: 0, rejected: 0, note: invalid };
  const g = world.grid;
  const rule = habitatEditRule(p.kind);
  const occupied = rule === 'place' ? occupiedCells(world) : null;
  const skipped = { rim: 0, structure: 0, organism: 0, enclosed: 0 };
  const ok: number[] = [];
  for (const cell of strokeFootprint(p.points, p.radius)) {
    const o = brushCellOutcome(rule, g.structure[cell]!, occupied !== null && occupied[cell] === 1);
    if (o === 'ok') ok.push(cell);
    else if (o !== 'noop') skipped[o]++;
  }
  let changed = false;
  let moved: { c: number; n: number; m: number } | null = null;
  let applied = ok.length;
  switch (p.kind) {
    case 'paintSubstrate': {
      const code = SUBSTRATE_CODES[p.substrate];
      for (const cell of ok) {
        if (g.substrate[cell] !== code) changed = true;
        g.substrate[cell] = code;
      }
      break;
    }
    case 'paintShade': {
      const factor = p.erase ? 1 : PAINTED_SHADE;
      for (const cell of ok) {
        if (g.shade[cell] !== factor) changed = true;
        g.shade[cell] = factor;
      }
      break;
    }
    case 'eraseStructure':
      for (const cell of ok) g.structure[cell] = ST_NONE;
      changed = ok.length > 0;
      break;
    case 'placeStructure': {
      const code = STRUCTURE_CODES[p.structure];
      if (!sealsCell(code)) {
        for (const cell of ok) g.structure[cell] = code;
        changed = ok.length > 0;
        break;
      }
      // Plan every move before changing anything (a refused region stays exactly as it was).
      const sealing = new Uint8Array(CELL_COUNT);
      for (const cell of ok) sealing[cell] = 1;
      const mark = new Int32Array(CELL_COUNT);
      const plan: { cell: number; targets: number[] }[] = [];
      let stamp = 0;
      for (const cell of ok) {
        const targets = displacementTargets(g, cell, sealing, mark, ++stamp);
        if (targets.length === 0) skipped.enclosed++;
        else plan.push({ cell, targets });
      }
      // A region with no open neighbor is refused whole; its cells stay open, and they are never
      // targets of another region (touching cells belong to the same region).
      moved = { c: 0, n: 0, m: 0 };
      for (const { cell, targets } of plan) {
        moveContents(world, cell, targets, moved);
        g.structure[cell] = code;
      }
      applied = plan.length;
      changed = plan.length > 0;
      break;
    }
  }
  if (changed) g.geometryVersion++;
  const rejected = skipped.rim + skipped.structure + skipped.organism + skipped.enclosed;
  const note =
    applied > 0
      ? null
      : p.kind === 'eraseStructure'
        ? 'nothing to erase'
        : p.kind === 'placeStructure'
          ? 'nothing placed'
          : 'nothing painted';
  return {
    accepted: applied,
    rejected,
    ...(note ? { note } : {}),
    ...(rejected > 0 ? { skipped } : {}),
    ...(moved && (moved.c > 0 || moved.n > 0 || moved.m > 0) ? { moved } : {}),
  };
}

/**
 * Move everything a cell holds (every allocated field, in canonical order) into `targets` in equal
 * shares; the last target takes the exact remainder. Tallies the conserved material moved (carbon,
 * nutrient, mineral) into `moved`.
 */
function moveContents(
  world: World,
  cell: number,
  targets: readonly number[],
  moved: { c: number; n: number; m: number },
): void {
  const k = targets.length;
  for (const id of FIELD_IDS) {
    const arr = world.fields[id];
    if (!arr) continue;
    const v = arr[cell]!;
    if (v === 0) continue;
    const share = v / k;
    for (let j = 0; j < k - 1; j++) arr[targets[j]!]! += share;
    arr[targets[k - 1]!]! += v - share * (k - 1);
    arr[cell] = 0;
    markField(world, id);
    const def = FIELD_DEFS[id];
    const amount = v * (def.carbonPerUnit ?? 1);
    if (def.material === 'carbon') moved.c += amount;
    else if (def.material === 'nutrient') moved.n += amount;
    else if (def.material === 'mineral') moved.m += amount;
  }
}
