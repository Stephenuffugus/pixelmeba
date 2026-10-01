/**
 * Stage 8 — state and structures (SPEC §3.2, §3.3, §5.3; D04 §2 C08 and §9; P3.7). Per living
 * organism, in ascending slot order:
 *   1. mandatory transitions: dormancy (SPEC §7.6, every living organism), then the release of
 *      invalid links/anchors (actions.ts releaseInvalidLinks; a no-op until wave 4);
 *   2. Active organisms only: the action table (actions.ts STAGE8_ACTIONS) — mandatory table entries,
 *      native optional actions by action ID (the NativeAbility enum index), then modules E01…E17
 *      ascending. Each checks the energy and body carbon remaining after earlier reservations,
 *      reserves its full cost and either commits at once (secretion.ts) or submits a shared
 *      construction request. Nothing is retried; no later action is refunded.
 * After the per-organism pass: shared construction (construction.ts: proportional film headroom,
 * one snapshot, one commit, unused reservations returned), then the F02 transport pass
 * (`fungalTransportPass`), then births in stage 9.
 *
 * secreting and FLAG.secreting are reset for every living organism before dormancy; a non-Active
 * organism is skipped before any producer writes secretionCode, so it keeps its last value.
 */
import { CELL_COUNT, GRID_H, GRID_W } from './constants';
import { FLAG, LIFE_ACTIVE } from './entities';
import { FIELD_DEFS, FIELD_IDS } from './fields';
import { dormancyStep } from './dormancy';
import { ActionContext, releaseInvalidLinks, runActions, STAGE8_ACTIONS, type Stage8Action } from './actions';
import { constructionPass } from './construction';
import type { MaterialDef } from './content/schema';
import {
  brushCellOutcome,
  isLabRadius,
  LAB_MAX_RADIUS,
  NOT_IN_DISH,
  PLACEABLE_STRUCTURES,
  planSealing,
  sealsCell,
  strokeFootprint,
  strokeSampleCount,
  STRUCTURE_CODES,
  STRUCTURE_RECORD_IDS,
  ST_NONE,
  SUBSTRATE_CODES,
  type LabBrushRule,
  type PaintTarget,
  type PlaceableStructure,
  type SubstrateName,
} from './grid';
import { profileOf } from './profiles';
import { entityCell } from './spatial';
import { markField } from './transport';
import type { World } from './world';

/**
 * The F02 fungal transport pass (SPEC §7.7; D04 §9): one simultaneous pass after shared construction
 * and before births, reading post-construction body pools. A no-op until wave 3 implements it.
 */
export function fungalTransportPass(_world: World): void {
  // Intentionally empty in this wave (no shipped world has fungal transport links yet).
}

/**
 * Run stage 8. `actions` defaults to the shipped table; tests pass their own table built with
 * actions.ts buildActionTable (test-only registrations never reach a shipped world).
 */
export function stageStructures(world: World, actions: readonly Stage8Action[] = STAGE8_ACTIONS): void {
  const e = world.ents;
  const c = e.cols;
  const ctx = new ActionContext(world);
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    c.secreting[i] = 0;
    c.flags[i] = c.flags[i]! & ~FLAG.secreting;
    const prof = profileOf(world, i);
    // 1. Mandatory transitions.
    dormancyStep(world, i, prof);
    releaseInvalidLinks(world, i, prof);
    if (c.lifeState[i] !== LIFE_ACTIVE) continue;
    // 2–3. Mandatory table entries, native optional actions by ID, modules ascending.
    runActions(ctx, actions, i, prof);
  }
  // Shared construction, then F02 transport, both before births.
  constructionPass(world, ctx.requests);
  fungalTransportPass(world);
}

// ---------------------------------------------------------------------------------------------
// Lab habitat edits (SPEC §2.2, §2.4, §10.4; CT §4 structures, §5.1 habitat paint; P2.7). One
// completed stroke = one command over the stroke's footprint (strokeFootprint: distance-sampled, each
// cell once, ascending). No edit creates or destroys material:
// - paint substrate: replaces water/gel/sediment on open cells; life, deposits and dissolved amounts
//   stay exactly where they are; cells under a structure keep their substrate (skipped);
// - paint shade: light × the recorded SHADE paint factor (CT §5.1: 0.1) on covered cells, or back to
//   1.0 when erasing; moves nothing;
// - place stone/wall/bead: only on empty in-dish cells (no structure, no live organism, never past
//   the rim). Stone and wall hold no solutes (the invariant applyHabitat establishes), so whatever a
//   newly sealed cell held is moved, whole and exactly, into the nearest open cells on the same side
//   (planSealing); a sealed region with no open neighbor is refused. Porous beads pass solutes, so
//   nothing moves;
// - erase structure: removes stone/wall/bead only; the substrate underneath was never changed, so it
//   is restored as it was; the freed cell starts empty and fills by ordinary transport.
// Totals are unchanged by every edit (moves are internal); the amount moved aside is recorded in the
// command's result, which the saved command log keeps. No randomness is used.
// Content is data (CLAUDE.md; D-0024): a world paints only with the paint materials its recorded
// content has (kind 'paint', by target) and places only the structures its recorded manifest enables
// (enabledStructures, by content ID); an older world without them refuses these edits whole.

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
/**
 * Most brush disks one stroke may sample (strokeSampleCount: about its length in cells, plus one per
 * segment). Measured in the app (wave B fix 2, Playwright, 800×360 phone, whole-dish zoom 2.41 px
 * per cell, the densest view): a scribble sweeping the whole dish at a fast 1,500 px/s for 4.1 s sent
 * 243 points and sampled 2,663 disks, 0.43 per pixel of finger travel. A 20-second scribble at that
 * speed is ≈ 13,000; at the smallest zoom (0.9 × whole dish) ≈ 14,400; a full minute ≈ 43,000.
 * 100,000 is over two minutes of non-stop fast scribbling, so no finger stroke reaches it; a crafted,
 * damaged or replayed stroke beyond it is refused whole in time proportional to its point count. At
 * the bound a radius-6 footprint costs about 0.4 s, once.
 */
export const LAB_MAX_STROKE_SAMPLES = 100_000;
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
  // CT §5.1: the Lab brush radius is 1, 3 or 6, nothing in between.
  if (!isLabRadius(p.radius)) return 'invalid radius';
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
  // The footprint walks every sampled cell of the path: bound the path, not only the point count.
  if (strokeSampleCount(p.points, LAB_MAX_STROKE_SAMPLES) > LAB_MAX_STROKE_SAMPLES) return 'stroke too long';
  if (p.kind === 'paintSubstrate' && !Object.prototype.hasOwnProperty.call(SUBSTRATE_CODES, p.substrate))
    return `unknown substrate ${String(p.substrate)}`;
  if (p.kind === 'paintShade' && typeof p.erase !== 'boolean') return 'invalid shade mode';
  if (p.kind === 'placeStructure' && !Object.prototype.hasOwnProperty.call(STRUCTURE_CODES, p.structure))
    return `unknown structure ${String(p.structure)}`;
  return null;
}

/** The world's recorded paint material with this target (CT §5.1), or null when it has none. */
export function paintMaterial(world: World, target: PaintTarget): MaterialDef | null {
  return world.content.materials.find((m) => m.kind === 'paint' && m.target === target) ?? null;
}

/**
 * The light factor this world's shade paint applies (its recorded dose; CT §5.1: 0.1), or null when
 * the world has no usable shade paint.
 */
export function shadeFactor(world: World): number | null {
  const mat = paintMaterial(world, 'shade');
  const f = mat ? mat.doses[mat.defaultDoseIndex] : undefined;
  return typeof f === 'number' && f > 0 && f <= 1 ? f : null;
}

/** Whether this world's recorded manifest enables a structure (by its content ID). */
export function structureEnabled(world: World, s: PlaceableStructure): boolean {
  const ids = world.content.manifest.enabledStructures;
  return Array.isArray(ids) && ids.includes(STRUCTURE_RECORD_IDS[s]);
}

/**
 * Why this world cannot make this edit (its recorded content lacks it), or null when it can. The note
 * is a log record naming the paint target or the Structure record ID (content IDs, not grid codes).
 */
export function unavailableHabitatEdit(world: World, p: HabitatEditPayload): string | null {
  switch (p.kind) {
    case 'paintSubstrate':
      return paintMaterial(world, p.substrate) ? null : `${p.substrate} paint is ${NOT_IN_DISH}`;
    case 'paintShade':
      return shadeFactor(world) !== null ? null : `shade paint is ${NOT_IN_DISH}`;
    case 'placeStructure':
      return structureEnabled(world, p.structure) ? null : `${STRUCTURE_RECORD_IDS[p.structure]} is ${NOT_IN_DISH}`;
    case 'eraseStructure':
      return PLACEABLE_STRUCTURES.some((s) => structureEnabled(world, s)) ? null : `structures are ${NOT_IN_DISH}`;
  }
}

/**
 * Apply one habitat edit (stage 1, as a command). Returns accepted/rejected cell counts; `skipped`
 * says why cells were refused and `moved` how much material a new stone or wall pushed aside.
 */
export function applyHabitatEdit(world: World, p: HabitatEditPayload): HabitatEditResult {
  const invalid = invalidHabitatEdit(p) ?? unavailableHabitatEdit(world, p);
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
      const factor = p.erase ? 1 : shadeFactor(world)!;
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
      const plan = planSealing(g, ok);
      skipped.enclosed += plan.enclosed;
      // A region with no open neighbor is refused whole; its cells stay open, and they are never
      // targets of another region (touching cells belong to the same region). Targets are open cells,
      // never cells being sealed, so each sealed cell's contents are read before anything reaches it.
      moved = { c: 0, n: 0, m: 0 };
      for (let k = 0; k < plan.sealed.length; k++) {
        const cell = plan.sealed[k]!;
        moveContents(world, cell, plan.targets, plan.start[cell]!, plan.count[cell]!, moved);
        g.structure[cell] = code;
      }
      applied = plan.sealed.length;
      changed = applied > 0;
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
 * Move everything a cell holds (every allocated field, in canonical order) into its `k` targets
 * (`targets[from…from+k)`, ascending) in equal shares; the last target takes the exact remainder.
 * Tallies the conserved material moved (carbon, nutrient, mineral) into `moved`.
 */
function moveContents(
  world: World,
  cell: number,
  targets: Int32Array,
  from: number,
  k: number,
  moved: { c: number; n: number; m: number },
): void {
  for (const id of FIELD_IDS) {
    const arr = world.fields[id];
    if (!arr) continue;
    const v = arr[cell]!;
    if (v === 0) continue;
    const share = v / k;
    for (let j = 0; j < k - 1; j++) arr[targets[from + j]!]! += share;
    arr[targets[from + k - 1]!]! += v - share * (k - 1);
    arr[cell] = 0;
    markField(world, id);
    const def = FIELD_DEFS[id];
    const amount = v * (def.carbonPerUnit ?? 1);
    if (def.material === 'carbon') moved.c += amount;
    else if (def.material === 'nutrient') moved.n += amount;
    else if (def.material === 'mineral') moved.m += amount;
  }
}
