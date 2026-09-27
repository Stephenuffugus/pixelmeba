/**
 * Stage 4 — sense and move (SPEC §6.3–6.4). Decisions every 0.5 s; movement every tick with
 * edge-checked tracing so nothing tunnels through walls or leaves compatible habitat.
 */
import {
  AVAIL_K,
  CELL_SOFT_CAPACITY,
  CONTACT_DISTANCE,
  DECISION_INTERVAL_TICKS,
  DT,
  GRID_H,
  GRID_W,
  HUNT_MAX_ENERGY,
  HUNT_MAX_MEAL_MULTIPLE,
  SCORE_CROWD,
  SCORE_FOOD,
  SCORE_SUIT,
  STRESS_DISPLAY_SECONDS,
  STRESS_THRESHOLD,
  WANDER_HOLD_TICKS,
} from './constants';
import { FLAG, MOVE_NONE, MOVE_PURSUE, MOVE_TARGET, MOVE_WANDER } from './entities';
import { cellIndex, inBounds, inMask } from './grid';
import { profileOf } from './profiles';
import type { Profile } from './phenotype';
import { det, detFloat, STREAMS } from './rng';
import { entityCell, forEachInCell, rebuildIndex } from './spatial';
import { habitatCompatible, suitabilityAt } from './suitability';
import { PREY_ANY, PREY_FREE, PREY_IN_SEDIMENT, PREY_NONE, type SpeciesRT } from './species';
import { SUB_SEDIMENT } from './grid';
import { R } from './reasons';
import type { World } from './world';

const HEADING_E = 0;
const HEADING_S = 1;
const HEADING_W = 2;
const HEADING_N = 3;

export function avail(a: number): number {
  return a <= 0 ? 0 : a / (a + AVAIL_K);
}

/** Can a (non-attached) organism of this species occupy the cell? */
export function canOccupy(world: World, sp: SpeciesRT, cell: number): boolean {
  return habitatCompatible(world, sp, cell);
}

const EPS = 1e-6;

/**
 * Fraction of the segment (x0,y0)→(x1,y1) that can be travelled before entering a cell the species
 * cannot occupy. Grid DDA over every crossed cell.
 */
export function traceFraction(world: World, sp: SpeciesRT, x0: number, y0: number, x1: number, y1: number): number {
  let cx = Math.floor(x0);
  let cy = Math.floor(y0);
  const ex = Math.floor(x1);
  const ey = Math.floor(y1);
  if (cx === ex && cy === ey) return 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 1;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = stepX > 0 ? (cx + 1 - x0) / dx : stepX < 0 ? (x0 - cx) / -dx : Infinity;
  let tMaxY = stepY > 0 ? (cy + 1 - y0) / dy : stepY < 0 ? (y0 - cy) / -dy : Infinity;
  for (let guard = 0; guard < 64; guard++) {
    let t: number;
    if (tMaxX < tMaxY) {
      t = tMaxX;
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      t = tMaxY;
      cy += stepY;
      tMaxY += tDeltaY;
    }
    if (t > 1) return 1;
    if (!inBounds(cx, cy) || !inMask(cx, cy) || !canOccupy(world, sp, cellIndex(cx, cy))) {
      return Math.max(0, t - EPS / len);
    }
    if (cx === ex && cy === ey) return 1;
  }
  return 1;
}

function headingFor(dx: number, dy: number, current: number): number {
  if (dx === 0 && dy === 0) return current;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? HEADING_E : HEADING_W;
  return dy > 0 ? HEADING_S : HEADING_N;
}

/** Hungry predators hunt: E < 80 and meal < 0.5 B0 (SPEC §7.3). */
export function hungryPredator(world: World, slot: number, prof: Profile): boolean {
  const c = world.ents.cols;
  return c.E[slot]! < HUNT_MAX_ENERGY && c.mealC[slot]! < HUNT_MAX_MEAL_MULTIPLE * prof.b0;
}

/** Whether predator species `pred` may take this prey slot right now. */
export function preyAllowed(world: World, pred: SpeciesRT, preySlot: number): boolean {
  const c = world.ents.cols;
  const req = pred.prey[c.species[preySlot]!]!;
  if (req === PREY_NONE) return false;
  if (req === PREY_ANY) return true;
  if (req === PREY_FREE) return (c.flags[preySlot]! & FLAG.attached) === 0 && !world.species[c.species[preySlot]!]!.attached;
  if (req === PREY_IN_SEDIMENT) return world.grid.substrate[entityCell(c.x[preySlot]!, c.y[preySlot]!)] === SUB_SEDIMENT;
  return false;
}

function acquirePrey(world: World, slot: number, sp: SpeciesRT, radius: number): number {
  const c = world.ents.cols;
  const px = c.x[slot]!;
  const py = c.y[slot]!;
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  let best = -1;
  let bestD = Infinity;
  let bestBirth = Infinity;
  for (let y = Math.max(0, cy - radius); y <= Math.min(GRID_H - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(GRID_W - 1, cx + radius); x++) {
      forEachInCell(world, cellIndex(x, y), (s) => {
        if (s === slot || c.alive[s] !== 1) return;
        if (!preyAllowed(world, sp, s)) return;
        const d = (startX[s]! - px) ** 2 + (startY[s]! - py) ** 2;
        const b = c.birthId[s]!;
        if (d < bestD || (d === bestD && b < bestBirth)) {
          best = s;
          bestD = d;
          bestBirth = b;
        }
      });
    }
  }
  return best;
}

function foodScore(world: World, sp: SpeciesRT, prof: Profile, cell: number, energy: number): number {
  let best = 0;
  const foods = prof.foods;
  for (let k = 0; k < foods.length; k++) {
    if (prof.weights !== null && prof.weights[k] === 0) continue;
    const f = world.fields[foods[k]!];
    if (!f) continue;
    const s = avail(f[cell]!);
    if (s > best) best = s;
  }
  // Producers also seek convertible substrate while they can afford secretion (SPEC §6.4).
  if (sp.secretesStarch && energy > 35 && world.fields.starch) {
    const s = 0.5 * avail(world.fields.starch[cell]!);
    if (s > best) best = s;
  }
  return best;
}

/** Scores within this tolerance are equal (SPEC §6.4: all equal within 1e-9 ⇒ wander). */
const SCORE_EPS = 1e-9;
const SCORE_SCRATCH = new Float64Array(13 * 13);
/** Start-of-stage positions: targets and prey distances read these so slot order cannot matter. */
const startX = new Float64Array(6000);
const startY = new Float64Array(6000);
const CELL_SCRATCH = new Int32Array(13 * 13);

function decide(world: World, slot: number, sp: SpeciesRT, prof: Profile): void {
  const c = world.ents.cols;
  const px = c.x[slot]!;
  const py = c.y[slot]!;
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  const own = cellIndex(cx, cy);
  const r = Math.max(1, prof.sensing);
  const load = world.derived.cellLoad;
  const selfLoad = c.B[slot]! / sp.def.b0;
  let bestScore = -Infinity;
  let minScore = Infinity;
  let ties = 0;
  let count = 0;
  // Two passes: find max/min, then pick among ties deterministically.
  const scores = SCORE_SCRATCH;
  const cells = CELL_SCRATCH;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inBounds(x, y) || !inMask(x, y)) continue;
      const cell = cellIndex(x, y);
      if (!canOccupy(world, sp, cell)) continue;
      if (cell !== own && traceFraction(world, sp, px, py, x + 0.5, y + 0.5) < 1) continue;
      const F = foodScore(world, sp, prof, cell, c.E[slot]!);
      const S = suitabilityAt(world, sp, prof, cell).value;
      const others = load[cell]! - (cell === own ? selfLoad : 0);
      const C = Math.min(1, Math.max(0, others) / CELL_SOFT_CAPACITY);
      const score = SCORE_FOOD * F + SCORE_SUIT * S - SCORE_CROWD * C;
      scores[count] = score;
      cells[count] = cell;
      count++;
      if (score > bestScore) bestScore = score;
      if (score < minScore) minScore = score;
    }
  }
  if (count === 0 || bestScore - minScore < SCORE_EPS) {
    c.moveMode[slot] = MOVE_WANDER;
    return;
  }
  for (let k = 0; k < count; k++) if (bestScore - scores[k]! < SCORE_EPS) ties++;
  let pick = 0;
  if (ties > 1) pick = det(world.seed, STREAMS.tiebreak, world.tick, c.birthId[slot]!) % ties;
  let chosen = own;
  for (let k = 0, seen = 0; k < count; k++) {
    if (bestScore - scores[k]! < SCORE_EPS) {
      if (seen === pick) {
        chosen = cells[k]!;
        break;
      }
      seen++;
    }
  }
  if (chosen === own) {
    c.moveMode[slot] = MOVE_NONE;
    return;
  }
  c.moveMode[slot] = MOVE_TARGET;
  c.targetX[slot] = (chosen % GRID_W) + 0.5;
  c.targetY[slot] = Math.floor(chosen / GRID_W) + 0.5;
}

function moveToward(world: World, slot: number, sp: SpeciesRT, tx: number, ty: number, maxStep: number, stopWithin: number): void {
  const c = world.ents.cols;
  const x0 = c.x[slot]!;
  const y0 = c.y[slot]!;
  const dx = tx - x0;
  const dy = ty - y0;
  const dist = Math.hypot(dx, dy);
  if (dist <= stopWithin) {
    c.flags[slot] = c.flags[slot]! & ~FLAG.moving;
    return;
  }
  const step = Math.min(maxStep, dist - stopWithin);
  const x1 = x0 + (dx / dist) * step;
  const y1 = y0 + (dy / dist) * step;
  applyStep(world, slot, sp, x0, y0, x1, y1);
}

function applyStep(world: World, slot: number, sp: SpeciesRT, x0: number, y0: number, x1: number, y1: number): void {
  const c = world.ents.cols;
  const t = traceFraction(world, sp, x0, y0, x1, y1);
  let nx = x0 + (x1 - x0) * t;
  let ny = y0 + (y1 - y0) * t;
  // Stay strictly inside the last valid cell.
  const cx = Math.floor(x0 + (x1 - x0) * Math.max(0, t - 1e-9));
  const cy = Math.floor(y0 + (y1 - y0) * Math.max(0, t - 1e-9));
  if (t < 1) {
    nx = Math.min(cx + 1 - EPS, Math.max(cx + EPS, nx));
    ny = Math.min(cy + 1 - EPS, Math.max(cy + EPS, ny));
  }
  const moved = Math.hypot(nx - x0, ny - y0);
  c.x[slot] = nx;
  c.y[slot] = ny;
  c.movedThisTick[slot] = moved;
  c.heading[slot] = headingFor(nx - x0, ny - y0, c.heading[slot]!);
  if (moved > 0) c.flags[slot] = c.flags[slot]! | FLAG.moving;
  else c.flags[slot] = c.flags[slot]! & ~FLAG.moving;
}

export function stageSenseAndMove(world: World): void {
  rebuildIndex(world);
  const e = world.ents;
  const c = e.cols;
  startX.set(c.x.subarray(0, e.highWater));
  startY.set(c.y.subarray(0, e.highWater));
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const sp = world.species[c.species[i]!]!;
    const prof = profileOf(world, i);
    c.movedThisTick[i] = 0;

    // Suitability at the current cell (also drives stress display state).
    const cell = entityCell(c.x[i]!, c.y[i]!);
    const suit = suitabilityAt(world, sp, prof, cell);
    c.suitability[i] = suit.value;
    // Stressed shows after 3 continuous seconds below threshold and clears after 3 continuous
    // seconds recovered (D01 §4).
    const stressed = (c.flags[i]! & FLAG.stressed) !== 0;
    if (suit.value < STRESS_THRESHOLD) {
      c.recoverSeconds[i] = 0;
      if (!stressed) {
        c.stressSeconds[i]! += DT;
        if (c.stressSeconds[i]! >= STRESS_DISPLAY_SECONDS - 1e-9) c.flags[i] = c.flags[i]! | FLAG.stressed;
      }
    } else {
      c.stressSeconds[i] = 0;
      if (stressed) {
        c.recoverSeconds[i]! += DT;
        if (c.recoverSeconds[i]! >= STRESS_DISPLAY_SECONDS - 1e-9) {
          c.flags[i] = c.flags[i]! & ~FLAG.stressed;
          c.recoverSeconds[i] = 0;
        }
      }
    }

    if (!sp.selfPropelled || prof.speed <= 0 || (c.flags[i]! & FLAG.attached) !== 0) continue;

    const step = prof.speed * DT;

    // Predators pursue a valid target every tick; decisions re-acquire on schedule.
    if (sp.isPredator) {
      const hungry = hungryPredator(world, i, prof);
      let target = c.preySlot[i]!;
      if (target >= 0 && (!hungry || !e.refValid(target, c.preyBirthId[i]!) || !preyAllowed(world, sp, target))) {
        target = -1;
        c.preySlot[i] = -1;
        c.preyBirthId[i] = 0;
      }
      if (c.decisionTimer[i] === 0 && hungry) {
        const found = acquirePrey(world, i, sp, Math.max(1, prof.sensing));
        if (found >= 0) {
          target = found;
          c.preySlot[i] = found;
          c.preyBirthId[i] = c.birthId[found]!;
        }
      }
      if (target >= 0) {
        c.flags[i] = c.flags[i]! | FLAG.hunting;
        c.moveMode[i] = MOVE_PURSUE;
        c.limitCode[i] = R.PRED_OUT_OF_CONTACT;
        moveToward(world, i, sp, startX[target]!, startY[target]!, step, CONTACT_DISTANCE * 0.5);
        c.decisionTimer[i] = c.decisionTimer[i] === 0 ? DECISION_INTERVAL_TICKS - 1 : c.decisionTimer[i]! - 1;
        continue;
      }
      c.flags[i] = c.flags[i]! & ~FLAG.hunting;
    }

    if (c.decisionTimer[i] === 0) {
      decide(world, i, sp, prof);
      c.decisionTimer[i] = DECISION_INTERVAL_TICKS - 1;
    } else {
      c.decisionTimer[i] = c.decisionTimer[i]! - 1;
    }

    const mode = c.moveMode[i]!;
    if (mode === MOVE_TARGET) {
      moveToward(world, i, sp, c.targetX[i]!, c.targetY[i]!, step, 0.02);
    } else if (mode === MOVE_WANDER) {
      const angle = detFloat(world.seed, STREAMS.wander, Math.floor(world.tick / WANDER_HOLD_TICKS), c.birthId[i]!) * Math.PI * 2;
      const x0 = c.x[i]!;
      const y0 = c.y[i]!;
      applyStep(world, i, sp, x0, y0, x0 + Math.cos(angle) * step, y0 + Math.sin(angle) * step);
    }
  }
  rebuildIndex(world);
}

/** Fresh decision offset for a newborn or introduced organism (avoids lockstep decisions). */
export function initialDecisionTimer(world: World, birthId: number): number {
  return det(world.seed, STREAMS.decide, birthId) % DECISION_INTERVAL_TICKS;
}
