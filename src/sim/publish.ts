/**
 * Stage 10 — record and publish (SPEC §3.2, §12.4). Per-second history samples and intake windows.
 * Rendering snapshots are built by the worker from world state after this stage.
 */
import { TICKS_PER_SECOND } from './constants';
import { maskCells } from './grid';
import { debrisTotal, pushSample, recordTraitSample } from './history';
import { worldHasTransport } from './fungalTransport';
import type { World } from './world';
import { compactLineage } from './lineage';

export function stagePublish(world: World): void {
  compactLineage(world.lineage);
  if (world.capacityHitThisTick) {
    world.capacityLimitedTicks++;
    world.history.pendingCapacity = true;
    world.capacityHitThisTick = false;
  }
  const nextTick = world.tick + 1;
  if (nextTick % TICKS_PER_SECOND !== 0) return;
  const e = world.ents;
  const c = e.cols;
  const n = world.species.length;
  const count = new Array<number>(n).fill(0);
  const biomass = new Array<number>(n).fill(0);
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const s = c.species[i]!;
    count[s]!++;
    biomass[s]! += c.B[i]!;
    c.intakeLastSecond[i] = c.intakeAccum[i]!;
    c.intakeAccum[i] = 0;
  }
  const cells = maskCells();
  const o2 = world.fields.oxygen!;
  const nut = world.fields.nutrient!;
  const sugar = world.fields.sugar!;
  let o2Sum = 0;
  let nutSum = 0;
  let sugarSum = 0;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    o2Sum += o2[i]!;
    nutSum += nut[i]!;
    sugarSum += sugar[i]!;
  }
  const h = world.history;
  // P2.8: the dish's debris total (detritus carbon), recorded with every sample from schema 3 on.
  const debris = debrisTotal(world);
  // P3.6: carbon moved along F02 transport links this second, only in a dish whose species form them.
  const transfer = worldHasTransport(world) ? (h.pendingFungalTransfer ?? 0) : undefined;
  pushSample(h, {
    second: nextTick / TICKS_PER_SECOND,
    count,
    biomass,
    births: h.pendingBirths.slice(),
    deaths: h.pendingDeaths.slice(),
    oxygenMean: o2Sum / cells.length,
    nutrientTotal: nutSum,
    sugarTotal: sugarSum,
    capacityLimited: h.pendingCapacity,
    interventions: h.pendingInterventions,
    ...(debris !== undefined ? { debrisTotal: debris } : {}),
    ...(transfer !== undefined ? { fungalTransfer: transfer } : {}),
  });
  delete h.pendingFungalTransfer;
  // P2.8: regional trait sample every 10 simulated seconds (observation only).
  recordTraitSample(world, nextTick);
  h.pendingBirths.fill(0);
  h.pendingDeaths.fill(0);
  h.pendingInterventions = 0;
  h.pendingCapacity = false;
}
