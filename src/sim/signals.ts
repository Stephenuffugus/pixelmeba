/**
 * Signals and glow (Phase 5 wave 11, P5.3 E2-SIGNALS; SPEC §7.8, §9 E02, §3.2 stage 8, §3.3, §4.4, §12.3;
 * CT §12.6; D-0106, D-0108, D-0119). Native SIGNAL_GLOW (B09) and the E02 module share every rule here; the
 * numbers come from the organism's profile (phenotype.ts GlowRules: the CT constants, or the world's recorded
 * E02 parameters).
 *
 * Stage 8, per tick (structures.ts stageStructures):
 *   1. `stage8Senses` once before the slot loop: the stage-start snapshot (SPEC §3.3) of what every glower
 *      senses, sensed = S_GLOW / (1 + quencher), and (rivalry.ts) the cells holding an Active RIVAL target.
 *      It returns at once in a world that records neither 'signals' nor 'rivalry', so a v1.0 dish pays one
 *      manifest check per tick and nothing else.
 *   2. per living organism, right after dormancyStep and before releaseInvalidLinks (SPEC §3.2 stage 8:
 *      "dormancy transitions; life-stage transitions; signal/glow thresholds; release invalid links"):
 *      `glowThresholds` — the hysteresis, read from the stage-start value, so no organism's result depends on
 *      slot order — then the glow cost, 0.30 E/s under 'signal', while glowing.
 *   3. per Active organism, in the action table: emission (native action SIGNAL_GLOW 5, module action E02 2),
 *      0.02/s into its cell while E remaining > 35 and local S_GLOW < 1.0 (existing excess is kept), 0.20 E/s
 *      under 'signal'.
 * Glow is cosmetic: it writes no field and no light (SPEC §4.4: glow adds zero light). It is off in every
 * non-Active state (D-0106): dormancy.ts clears it in the same branch that starts Preparing and the thresholds
 * clear it again for any non-Active glower, so every state the import checks between ticks is clean (D-0108).
 * It is a temporary state, never inherited: births.ts starts both daughters dim with dwell 0.
 *
 * The scratch (a WeakMap keyed by the world object, never iterated) is rewritten whole by every
 * stage8Senses call, never saved and never read outside stage 8: a reloaded world recomputes it from
 * identical state.
 */
import { CELL_COUNT, DT } from './constants';
import { LIFE_ACTIVE } from './entities';
import { emit } from './events';
import { worldHasSystem } from './gates';
import type { ActionContext, Stage8Action } from './actions';
import type { GlowRules, Profile } from './phenotype';
import { profileOf } from './profiles';
import { R } from './reasons';
import { snapshotRivalTargets } from './rivalry';
import { EMITTER_BIT, recordEmission } from './secretion';
import { entityCell } from './spatial';
import { markField } from './transport';
import type { World } from './world';

/** Timer comparisons tolerate float accumulation of dt (0.1 is not exact in binary); the dormancy.ts EPS. */
const EPS = 1e-9;

/** Why a glow switched off ('glowOff' detail.why). */
export type GlowOffWhy = 'signal' | 'energy' | 'rest' | 'division';

interface SenseScratch {
  /** The tick these values were taken at (stage 8 of that tick). */
  tick: number;
  /** Stage-start sensed signal by slot (0 for every slot that is not a living glower). */
  sensed: Float64Array;
}

// eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated (a WeakMap cannot be)
const scratchByWorld = new WeakMap<World, SenseScratch>();

/**
 * The signal an organism in `cell` senses (SPEC §7.8): S_GLOW / (1 + quencher). 0 in a world without the
 * S_GLOW field; a missing quencher field counts as 0. Pure (the inspector's "Neighbors detected" line).
 */
export function sensedSignal(world: World, cell: number): number {
  const g = world.fields.sGlow;
  if (g === undefined) return 0;
  const q = world.fields.quencher;
  return q === undefined ? g[cell]! : g[cell]! / (1 + q[cell]!);
}

/**
 * Stage 8 start (structures.ts, once before the slot loop): snapshot what every living glower senses and
 * (rivalry.ts) which cells hold an Active RIVAL target. Returns at once unless the world records 'signals' or
 * 'rivalry'.
 */
export function stage8Senses(world: World): void {
  if (!worldHasSystem(world, 'signals') && !worldHasSystem(world, 'rivalry')) return;
  if (world.fields.sGlow !== undefined) {
    let s = scratchByWorld.get(world);
    if (s === undefined || s.sensed.length !== world.ents.capacity) {
      s = { tick: -1, sensed: new Float64Array(world.ents.capacity) };
      scratchByWorld.set(world, s);
    }
    const sensed = s.sensed;
    sensed.fill(0);
    const c = world.ents.cols;
    for (let i = 0; i < world.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      if (profileOf(world, i).glow === null) continue;
      const cell = entityCell(c.x[i]!, c.y[i]!);
      if (cell >= 0 && cell < CELL_COUNT) sensed[i] = sensedSignal(world, cell);
    }
    s.tick = world.tick;
  }
  if (world.fields.rival !== undefined) snapshotRivalTargets(world);
}

/** The stage-start sensed value of organism `i` (stage 8 only; 0 in a world without the S_GLOW field). */
function stageStartSensed(world: World, i: number): number {
  if (world.fields.sGlow === undefined) return 0;
  const s = scratchByWorld.get(world);
  if (s === undefined || s.tick !== world.tick) throw new Error('stage 8: glow thresholds read before stage8Senses ran this tick');
  return s.sensed[i]!;
}

function glowEvent(world: World, i: number, on: boolean, sensed: number, why?: GlowOffWhy): void {
  const c = world.ents.cols;
  emit(world.events, world.counters, {
    tick: world.tick,
    type: on ? 'glowOn' : 'glowOff',
    species: c.species[i]!,
    birthId: c.birthId[i]!,
    cell: entityCell(c.x[i]!, c.y[i]!),
    cause: on ? R.GLOW_ON : R.GLOW_OFF,
    detail: why === undefined ? { sensed } : { sensed, why },
  });
}

/**
 * What a 'rest' glowOff records (D-0120): stage 8's stage-start value when the snapshot was taken this tick
 * (SPEC §3.3; mid-loop, the live field already holds lower slots' emission), else the live reading of its cell.
 */
function restSensed(world: World, i: number): number {
  const s = scratchByWorld.get(world);
  if (world.fields.sGlow !== undefined && s !== undefined && s.tick === world.tick && i < s.sensed.length) return s.sensed[i]!;
  const c = world.ents.cols;
  return sensedSignal(world, entityCell(c.x[i]!, c.y[i]!));
}

/**
 * Switch organism `i` dim: a glowing organism goes dim with one 'glowOff' event (detail.why = `why`,
 * detail.sensed = `sensed`; when omitted, the stage-start value for 'rest' (restSensed) and the live reading
 * of its cell otherwise); glowDwell = 0 either way. Called by dormancy.ts (Active → Preparing, why 'rest'),
 * births.ts (why 'division') and glowThresholds.
 */
export function clearGlow(world: World, i: number, why: GlowOffWhy, sensed?: number): void {
  const c = world.ents.cols;
  if (c.glowState[i] === 1) {
    c.glowState[i] = 0;
    const read = sensed ?? (why === 'rest' ? restSensed(world, i) : sensedSignal(world, entityCell(c.x[i]!, c.y[i]!)));
    glowEvent(world, i, false, read, why);
  }
  c.glowDwell[i] = 0;
}

/**
 * Glow thresholds and glow cost for one living organism (stage 8, right after dormancyStep). Returns at once
 * when it cannot glow. Not Active: dim ('rest'). Active, with s = its stage-start sensed signal:
 *   dim     — the dwell counts while s ≥ onThreshold (else it restarts at 0); glow turns on when the dwell
 *             reaches dwellSeconds and E ≥ glowOffEnergy (PROPOSED DECISION D-0119: never on below the off
 *             energy, so it cannot flicker on and off; the dwell keeps its count meanwhile, capped at
 *             dwellSeconds);
 *   glowing — E < glowOffEnergy turns it off at once ('energy'); else the dwell counts while s ≤
 *             offThreshold (else 0) and it turns off when the dwell reaches dwellSeconds ('signal').
 * Every switch resets the dwell to 0. Then, while glowing, glowCost × DT is charged under 'signal'. Glow
 * writes no field and no light.
 */
export function glowThresholds(world: World, i: number, prof: Profile): void {
  const rules = prof.glow;
  if (rules === null) return;
  const c = world.ents.cols;
  if (c.lifeState[i] !== LIFE_ACTIVE) {
    clearGlow(world, i, 'rest');
    return;
  }
  const s = stageStartSensed(world, i);
  if (c.glowState[i] === 0) {
    const dwell = s >= rules.onThreshold ? Math.min(rules.dwellSeconds, c.glowDwell[i]! + DT) : 0;
    if (dwell >= rules.dwellSeconds - EPS && c.E[i]! >= rules.glowOffEnergy) {
      c.glowState[i] = 1;
      c.glowDwell[i] = 0;
      glowEvent(world, i, true, s);
    } else {
      c.glowDwell[i] = dwell;
    }
  } else if (c.E[i]! < rules.glowOffEnergy) {
    clearGlow(world, i, 'energy', s);
  } else {
    const dwell = s <= rules.offThreshold ? Math.min(rules.dwellSeconds, c.glowDwell[i]! + DT) : 0;
    if (dwell >= rules.dwellSeconds - EPS) clearGlow(world, i, 'signal', s);
    else c.glowDwell[i] = dwell;
  }
  if (c.glowState[i] === 1) chargeGlow(world, i, rules);
}

function chargeGlow(world: World, i: number, rules: GlowRules): void {
  const c = world.ents.cols;
  const cost = rules.glowCost * DT;
  // E ≥ glowOffEnergy (15) here, so 0.03 is always affordable; a profile that broke that would be a bug.
  if (!(cost <= c.E[i]!)) throw new Error(`stage 8: glow cost ${cost} E exceeds the ${c.E[i]!} E of organism ${c.birthId[i]!}`);
  c.E[i]! -= cost;
  world.ledger.energy.signal += cost;
}

/** Applies when the organism's glow rules come from `source` (native SIGNAL_GLOW, or E02). */
export function signalApplies(source: GlowRules['source']): Stage8Action['applies'] {
  return (prof) => prof.glow !== null && prof.glow.source === source;
}

/**
 * S_GLOW emission (stage 8 action; mirrors secretion.ts secrete): no S_GLOW field → SECRETION_NO_SUBSTRATE;
 * E remaining ≤ minEnergy → SECRETION_ENERGY_LOW; local S_GLOW ≥ localCap → SECRETION_SATURATED (existing
 * excess is kept: nothing is clamped or removed); else emitCost × DT under 'signal' and emitRate × DT into
 * its cell.
 */
export function signalRun(ctx: ActionContext): number {
  const rules = ctx.profile.glow;
  if (rules === null) throw new Error(`stage 8: organism slot ${ctx.i} has no glow rules`);
  return recordEmission(ctx, emitSignal(ctx, rules), EMITTER_BIT.signal);
}

function emitSignal(ctx: ActionContext, rules: GlowRules): number {
  const world = ctx.world;
  const c = world.ents.cols;
  const g = world.fields.sGlow;
  if (g === undefined) return R.SECRETION_NO_SUBSTRATE;
  if (ctx.remainingEnergy() <= rules.minEnergy) return R.SECRETION_ENERGY_LOW;
  const cell = entityCell(c.x[ctx.i]!, c.y[ctx.i]!);
  if (g[cell]! >= rules.localCap) return R.SECRETION_SATURATED;
  const cost = rules.emitCost * DT;
  if (ctx.remainingEnergy() < cost) return R.SECRETION_ENERGY_LOW;
  ctx.spend(cost, 'signal');
  g[cell]! += rules.emitRate * DT;
  markField(world, 'sGlow');
  return R.SECRETING;
}
