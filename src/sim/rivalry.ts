/**
 * Rivalry (Phase 5 wave 11, P5.3 E2-SIGNALS; SPEC §7.9, §4.3, §3.3; CT §3.4, §12.6; D-0119). B13 Rampart's
 * native RIVALRY: RIVAL secreted at 0.02/s into its cell when an Active B01, B10 or B11 lies within two cells,
 * E remaining > 50 and local RIVAL < 1.0, at 0.60 E/s under 'secretion' (an ordinary secretion; only signal
 * emission and glow use 'signal', D-0106). RIVAL diffuses at half rate and decays 2 %/s in stage 2
 * (transport.ts). Targets (by ancestor id, CT §3.4) add 0.25 × RIVAL to their inhibitor exposure
 * (suitability.ts inhibitorExposure; SPEC §4.3), halved once with the rest when the cell holds film. B13 gains
 * nothing from it: no bonus of any kind. M08 is the same field (a generic activity deposit).
 *
 * The trigger reads a stage-start snapshot (SPEC §3.3): `snapshotRivalTargets`, from signals.ts stage8Senses,
 * marks every cell holding a living, Active target before any organism acts, so no B13's result depends on slot
 * order or on a target's dormancy transition earlier in the same stage. The window is the 5 × 5 square
 * (Chebyshev distance ≤ 2) of grid cells around the B13 (PROPOSED DECISION D-0119); edge barriers are ignored
 * for this trigger because it is a sensing condition, not a contact (the chemical itself obeys the barrier
 * factors in transport). The mask is a WeakMap scratch keyed by the world object (never iterated, never saved).
 *
 * This file must not import species.ts (species.ts imports RIVAL_TARGETS from here).
 */
import { CELL_COUNT, DT, GRID_H, GRID_W, RIVAL_EXPOSURE_FACTOR } from './constants';
import { LIFE_ACTIVE } from './entities';
import type { ActionContext, Stage8Action } from './actions';
import type { RivalryRules } from './phenotype';
import { R } from './reasons';
import { EMITTER_BIT, recordEmission } from './secretion';
import { entityCell } from './spatial';
import { markField } from './transport';
import type { World } from './world';

/** RIVAL targets by ancestor id (CT §3.4: B01 Sprinter, B10 Brinecoil, B11 Sourbud). */
export const RIVAL_TARGETS = ['B01', 'B10', 'B11'] as const;

interface TargetScratch {
  tick: number;
  /** 1 on each cell holding a living, Active RIVAL target at the start of stage 8. */
  mask: Uint8Array;
  /** How many cells are set (0: no B13 can trigger this tick). */
  count: number;
}

// eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated (a WeakMap cannot be)
const targetsByWorld = new WeakMap<World, TargetScratch>();

/** Stage 8 start (signals.ts stage8Senses, in a world with the RIVAL field): mark the cells of Active targets. */
export function snapshotRivalTargets(world: World): void {
  let s = targetsByWorld.get(world);
  if (s === undefined) {
    s = { tick: -1, mask: new Uint8Array(CELL_COUNT), count: 0 };
    targetsByWorld.set(world, s);
  }
  const mask = s.mask;
  mask.fill(0);
  let count = 0;
  const c = world.ents.cols;
  const species = world.species;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1 || c.lifeState[i] !== LIFE_ACTIVE) continue;
    if (!species[c.species[i]!]!.rivalTarget) continue;
    const cell = entityCell(c.x[i]!, c.y[i]!);
    if (cell < 0 || cell >= CELL_COUNT || mask[cell] === 1) continue;
    mask[cell] = 1;
    count++;
  }
  s.tick = world.tick;
  s.count = count;
}

/** Whether a stage-start Active target lies within `radius` cells (Chebyshev) of `cell` (stage 8 only). */
export function rivalTargetNear(world: World, cell: number, radius: number): boolean {
  const s = targetsByWorld.get(world);
  if (s === undefined || s.tick !== world.tick) throw new Error('stage 8: the rivalry trigger read before stage8Senses ran this tick');
  if (s.count === 0) return false;
  const mask = s.mask;
  const cx = cell % GRID_W;
  const cy = (cell - cx) / GRID_W;
  const y1 = Math.min(GRID_H - 1, cy + radius);
  const x0 = Math.max(0, cx - radius);
  const x1 = Math.min(GRID_W - 1, cx + radius);
  for (let y = Math.max(0, cy - radius); y <= y1; y++) {
    const row = y * GRID_W;
    for (let x = x0; x <= x1; x++) if (mask[row + x] === 1) return true;
  }
  return false;
}

/** Applies to an organism with native RIVALRY. */
export const rivalryApplies: Stage8Action['applies'] = (prof) => prof.rivalry !== null;

/**
 * RIVAL secretion (stage 8 native action RIVALRY 6): no RIVAL field → SECRETION_NO_SUBSTRATE; E remaining ≤ 50
 * → SECRETION_ENERGY_LOW; no stage-start Active target within 2 cells → NONE (PROPOSED DECISION D-0119: nothing
 * to report; the starch-substrate wording would be false); local RIVAL ≥ 1.0 → SECRETION_SATURATED; else 0.60 ×
 * DT under 'secretion' and 0.02 × DT into its cell.
 */
export function rivalryRun(ctx: ActionContext): number {
  const rules = ctx.profile.rivalry;
  if (rules === null) throw new Error(`stage 8: organism slot ${ctx.i} has no rivalry rules`);
  return recordEmission(ctx, secreteRival(ctx, rules), EMITTER_BIT.rival);
}

function secreteRival(ctx: ActionContext, rules: RivalryRules): number {
  const world = ctx.world;
  const c = world.ents.cols;
  const rival = world.fields.rival;
  if (rival === undefined) return R.SECRETION_NO_SUBSTRATE;
  if (ctx.remainingEnergy() <= rules.minEnergy) return R.SECRETION_ENERGY_LOW;
  const cell = entityCell(c.x[ctx.i]!, c.y[ctx.i]!);
  if (!rivalTargetNear(world, cell, rules.radius)) return R.NONE;
  if (rival[cell]! >= rules.localCap) return R.SECRETION_SATURATED;
  const cost = rules.emitCost * DT;
  if (ctx.remainingEnergy() < cost) return R.SECRETION_ENERGY_LOW;
  ctx.spend(cost, 'secretion');
  rival[cell]! += rules.emitRate * DT;
  markField(world, 'rival');
  return R.SECRETING;
}

/** A cell's RIVAL reading (pure; the inspector): the amount, the exposure term 0.25 × amount before film, and whether film halves it. */
export interface RivalExposure {
  readonly amount: number;
  readonly term: number;
  readonly filmHalves: boolean;
}

/** The RIVAL a target in `cell` is exposed to (0 in a world without the RIVAL field). */
export function rivalExposure(world: World, cell: number): RivalExposure {
  const r = world.fields.rival;
  const amount = r === undefined ? 0 : r[cell]!;
  const film = world.fields.film;
  return { amount, term: RIVAL_EXPOSURE_FACTOR * amount, filmHalves: film !== undefined && film[cell]! > 0 };
}
