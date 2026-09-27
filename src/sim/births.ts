/**
 * Stage 9 — births through immutable proposals (SPEC §6.9, D05 A01).
 *
 * A parent that meets the division gates and global capacity gets one saved proposal whose daughter
 * genomes are drawn once. Placement is then attempted every tick; while blocked, nothing is charged
 * and the proposal is kept unchanged (also across save/reload). On success the cost is charged, all
 * owned pools are split equally, both daughters receive new birth identities, and they first act on
 * the next tick.
 */
import {
  AGENT_CAP,
  CELL_SOFT_CAPACITY,
  DIVISION_BIOMASS_MULTIPLE,
  DIVISION_MIN_ENERGY,
  DIVISION_MIN_HEALTH,
  GRID_W,
} from './constants';
import { emit, milestone } from './events';
import { FLAG } from './entities';
import { cellIndex, inBounds, inMask } from './grid';
import { recordBirth, recordDivisionEnd } from './lineage';
import { canOccupy, initialDecisionTimer } from './movement';
import { onDaughter, onParentEnds } from './branches';
import { proposeDaughters } from './mutation';
import { profileOf } from './profiles';
import { R } from './reasons';
import { detFloat, STREAMS } from './rng';
import { entityCell, rebuildIndex } from './spatial';
import type { World } from './world';

/** Neighbor order used after crowding (DECISIONS D-0002): E, S, W, N, NE, SE, SW, NW, own cell. */
const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [0, 0],
];

/** First failing division gate, or R.NONE when the organism may divide. */
export function divisionBlocker(world: World, i: number): number {
  const c = world.ents.cols;
  const prof = profileOf(world, i);
  if (c.lifeState[i] !== 0) return R.DIV_BLOCK_STATE;
  if (c.infectedBy[i] !== 0) return R.DIV_BLOCK_INFECTED;
  if (c.B[i]! < DIVISION_BIOMASS_MULTIPLE * prof.b0) return R.DIV_BLOCK_BIOMASS;
  if (c.E[i]! < Math.max(DIVISION_MIN_ENERGY, prof.divisionCost)) return R.DIV_BLOCK_ENERGY;
  if (c.H[i]! < DIVISION_MIN_HEALTH) return R.DIV_BLOCK_HEALTH;
  if (c.age[i]! < prof.minDivisionAge) return R.DIV_BLOCK_AGE;
  return R.NONE;
}

/** All failing gates (for the inspector's "show every blocker" rule). */
export function allDivisionBlockers(world: World, i: number): number[] {
  const c = world.ents.cols;
  const prof = profileOf(world, i);
  const out: number[] = [];
  if (c.lifeState[i] !== 0) out.push(R.DIV_BLOCK_STATE);
  if (c.infectedBy[i] !== 0) out.push(R.DIV_BLOCK_INFECTED);
  if (c.B[i]! < DIVISION_BIOMASS_MULTIPLE * prof.b0) out.push(R.DIV_BLOCK_BIOMASS);
  if (c.E[i]! < Math.max(DIVISION_MIN_ENERGY, prof.divisionCost)) out.push(R.DIV_BLOCK_ENERGY);
  if (c.H[i]! < DIVISION_MIN_HEALTH) out.push(R.DIV_BLOCK_HEALTH);
  if (c.age[i]! < prof.minDivisionAge) out.push(R.DIV_BLOCK_AGE);
  const code = c.divBlockCode[i]!;
  if (code === R.DIV_BLOCK_PLACEMENT || code === R.DIV_BLOCK_CROWDING || code === R.DIV_BLOCK_CAPACITY) out.push(code);
  return out;
}

function findPlacement(world: World, i: number, daughterLoad: number): number {
  const c = world.ents.cols;
  const sp = world.species[c.species[i]!]!;
  const cx = Math.floor(c.x[i]!);
  const cy = Math.floor(c.y[i]!);
  const load = world.derived.cellLoad;
  let best = -1;
  let bestLoad = Infinity;
  for (const [dx, dy] of NEIGHBORS) {
    const x = cx + dx;
    const y = cy + dy;
    if (!inBounds(x, y) || !inMask(x, y)) continue;
    const cell = cellIndex(x, y);
    if (!canOccupy(world, sp, cell)) continue;
    const l = load[cell]!;
    // The parent's own cell keeps the same load after a split (its biomass is only divided).
    const after = dx === 0 && dy === 0 ? l : l + daughterLoad;
    if (after > CELL_SOFT_CAPACITY) continue;
    if (l < bestLoad) {
      best = cell;
      bestLoad = l;
    }
  }
  return best;
}

export function stageBirths(world: World): void {
  // Crowding and placement must see this tick's deaths and growth: rebuild from live state.
  rebuildIndex(world);
  const e = world.ents;
  const c = e.cols;
  const load = world.derived.cellLoad;
  const limit = e.highWater; // newborns created this stage are not revisited
  let capacityHit = false;
  for (let i = 0; i < limit; i++) {
    if (c.alive[i] !== 1 || (c.flags[i]! & FLAG.justBorn) !== 0) continue;
    c.flags[i] = c.flags[i]! & ~FLAG.capacityBlocked;
    const blocker = divisionBlocker(world, i);
    if (blocker !== R.NONE) {
      c.divBlockCode[i] = blocker;
      continue;
    }
    if (e.count >= AGENT_CAP) {
      c.divBlockCode[i] = R.DIV_BLOCK_CAPACITY;
      c.flags[i] = c.flags[i]! | FLAG.capacityBlocked;
      capacityHit = true;
      continue;
    }

    if (c.propG0[i]! < 0) {
      const p = proposeDaughters(world, i);
      c.propG0[i] = p.genomes[0];
      c.propG1[i] = p.genomes[1];
      c.propTick[i] = world.tick;
      c.propFlags0[i] = p.draws[0].flags;
      c.propFlags1[i] = p.draws[1].flags;
      c.propLocus0[i] = p.draws[0].locus;
      c.propLocus1[i] = p.draws[1].locus;
      c.propDelta0[i] = p.draws[0].delta;
      c.propDelta1[i] = p.draws[1].delta;
      c.propModule0[i] = p.draws[0].module;
      c.propModule1[i] = p.draws[1].module;
    }

    const sp = world.species[c.species[i]!]!;
    const parentCell = entityCell(c.x[i]!, c.y[i]!);
    if (load[parentCell]! > CELL_SOFT_CAPACITY) {
      c.divBlockCode[i] = R.DIV_BLOCK_CROWDING;
      continue;
    }
    const halfB = c.B[i]! / 2;
    const daughterLoad = halfB / sp.def.b0;
    const target = findPlacement(world, i, daughterLoad);
    if (target < 0) {
      c.divBlockCode[i] = R.DIV_BLOCK_PLACEMENT;
      continue;
    }
    const slot = e.allocate();
    if (slot < 0) {
      c.divBlockCode[i] = R.DIV_BLOCK_CAPACITY;
      capacityHit = true;
      continue;
    }
    commitDivision(world, i, slot, target);
  }
  if (capacityHit) world.capacityHitThisTick = true;
  // Leave the index canonical at the tick boundary (daughters included), as a reload would.
  rebuildIndex(world);
  // Clear the just-born marker so daughters act from the next tick.
  for (let i = 0; i < e.highWater; i++) if (c.alive[i] === 1) c.flags[i] = c.flags[i]! & ~FLAG.justBorn;
}

function commitDivision(world: World, i: number, slot: number, targetCell: number): void {
  const c = world.ents.cols;
  const prof = profileOf(world, i);
  const sp = world.species[c.species[i]!]!;
  const load = world.derived.cellLoad;
  const parentBirth = c.birthId[i]!;
  const parentInfo = { refGenome: c.refGenome[i]!, branchId: c.branchId[i]!, candRoot: c.candRoot[i]!, generation: c.generation[i]! };
  const parentGenomeIdx = c.genome[i]!;
  const mut = [
    { flags: c.propFlags0[i]!, locus: c.propLocus0[i]!, delta: c.propDelta0[i]!, module: c.propModule0[i]! },
    { flags: c.propFlags1[i]!, locus: c.propLocus1[i]!, delta: c.propDelta1[i]!, module: c.propModule1[i]! },
  ] as const;
  onParentEnds(world, i);

  // Charge the actual cost, then split every owned pool equally.
  const cost = prof.divisionCost;
  c.E[i]! -= cost;
  world.ledger.energy.division += cost;
  const halfB = c.B[i]! / 2;
  const halfN = c.N[i]! / 2;
  const halfE = c.E[i]! / 2;
  const halfMealC = c.mealC[i]! / 2;
  const halfMealN = c.mealN[i]! / 2;
  const halfMineral = c.boundMineral[i]! / 2;
  const halfJacket = c.jacketMineral[i]! / 2;
  const g0 = c.propG0[i]!;
  const g1 = c.propG1[i]!;

  const parentCell = entityCell(c.x[i]!, c.y[i]!);
  load[parentCell]! -= halfB / sp.def.b0;
  load[targetCell]! += halfB / sp.def.b0;

  // New daughter slot.
  c.species[slot] = c.species[i]!;
  c.genome[slot] = g1;
  c.entityId[slot] = world.counters.nextEntityId++;
  c.B[slot] = halfB;
  c.N[slot] = halfN;
  c.E[slot] = halfE;
  c.H[slot] = c.H[i]!;
  c.age[slot] = 0;
  c.mealC[slot] = halfMealC;
  c.mealN[slot] = halfMealN;
  c.boundMineral[slot] = halfMineral;
  c.jacketMineral[slot] = halfJacket;
  c.heading[slot] = c.heading[i]!;
  c.lifeState[slot] = 0;
  const jx = detFloat(world.seed, STREAMS.placement, parentBirth, 1, 0);
  const jy = detFloat(world.seed, STREAMS.placement, parentBirth, 1, 1);
  const tx = targetCell % GRID_W;
  const ty = Math.floor(targetCell / GRID_W);
  if (targetCell === parentCell) {
    c.x[slot] = Math.min(tx + 0.98, Math.max(tx + 0.02, c.x[i]! + (jx - 0.5) * 0.4));
    c.y[slot] = Math.min(ty + 0.98, Math.max(ty + 0.02, c.y[i]! + (jy - 0.5) * 0.4));
  } else {
    c.x[slot] = tx + 0.2 + jx * 0.6;
    c.y[slot] = ty + 0.2 + jy * 0.6;
  }
  c.flags[slot] = FLAG.justBorn;
  c.propG0[slot] = -1;
  c.propG1[slot] = -1;

  // Retained daughter keeps the slot and entityId, not its identity.
  c.B[i] = halfB;
  c.N[i] = halfN;
  c.E[i] = halfE;
  c.age[i] = 0;
  c.mealC[i] = halfMealC;
  c.mealN[i] = halfMealN;
  c.boundMineral[i] = halfMineral;
  c.jacketMineral[i] = halfJacket;
  c.genome[i] = g0;
  c.propG0[i] = -1;
  c.propG1[i] = -1;
  c.divBlockCode[i] = R.NONE;
  c.flags[i] = (c.flags[i]! | FLAG.justBorn) & ~FLAG.capacityBlocked;

  const tick = world.tick;
  recordDivisionEnd(world.lineage, parentBirth, tick);
  const b0 = world.counters.nextBirthId++;
  const b1 = world.counters.nextBirthId++;
  c.birthId[i] = b0;
  c.birthId[slot] = b1;
  const spIdx = c.species[i]!;
  const gen = parentInfo.generation + 1;
  const births = [
    { slot: i, birthId: b0, genome: g0, m: mut[0] },
    { slot, birthId: b1, genome: g1, m: mut[1] },
  ];
  for (const d of births) {
    recordBirth(world.lineage, d.birthId, {
      parent: parentBirth,
      genome: d.genome,
      tick,
      generation: gen,
      species: spIdx,
      entityId: c.entityId[d.slot]!,
      origin: 0,
      mutFlags: d.m.flags,
      mutLocus: d.m.locus,
      mutDelta: d.m.delta,
      mutModule: d.m.module,
    });
    onDaughter(world, d.slot, parentInfo);
    if (d.genome !== parentGenomeIdx) {
      emit(world.events, world.counters, {
        tick,
        type: 'mutation',
        species: spIdx,
        birthId: d.birthId,
        cell: parentCell,
        detail: { parent: parentBirth, flags: d.m.flags, locus: d.m.locus, delta: d.m.delta, module: d.m.module },
      });
      milestone(world.events, 'firstMutation', tick);
    }
  }
  for (const col of ['propFlags0', 'propFlags1', 'propDelta0', 'propDelta1'] as const) c[col][i] = 0;
  for (const col of ['propLocus0', 'propLocus1', 'propModule0', 'propModule1'] as const) c[col][i] = -1;
  c.decisionTimer[i] = initialDecisionTimer(world, b0);
  c.decisionTimer[slot] = initialDecisionTimer(world, b1);

  const parentGenome = parentGenomeIdx;
  emit(world.events, world.counters, {
    tick,
    type: 'birth',
    species: spIdx,
    birthId: b0,
    cell: parentCell,
    detail: { parent: parentBirth, daughterA: b0, daughterB: b1, changedA: g0 !== parentGenome ? 1 : 0, changedB: g1 !== parentGenome ? 1 : 0 },
  });
  milestone(world.events, 'firstDivision', tick);
  milestone(world.events, `firstDivision:${world.species[spIdx]!.id}`, tick);
  world.history.pendingBirths[spIdx] = (world.history.pendingBirths[spIdx] ?? 0) + 1;
}
