/**
 * G1 fixture: finite feeding (SPEC §6.5, D02 A2, D04 C01/C02; BUILD_DIRECTIVE G1 gate). Many
 * competitors (Sprinters, Crumbsmiths and two hunting Amoebae) crowd a small, scarce sugar patch.
 * Every tick, audited between stages 5 and 6:
 *  - the carbon taken in each cell never exceeds what the pool held, and the pool falls by exactly
 *    what was taken (nothing produced, nothing lost);
 *  - a predator never digests more than its held meal;
 *  - free nutrient taken in each cell never exceeds the nutrient pool, and the pool changes by
 *    exactly −(free nutrient taken) + (surplus bound nutrient released from digested meals);
 *  - no organism exceeds its intake budget q × suitability × dt (halved over soft capacity);
 *  - no pool, body or meal is ever negative, and the ledger closes.
 * The G0 fair-shared-food fixture (equal shares, insertion order irrelevant) is fair-shared-food.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { CELL_COUNT, DT } from '../../src/sim/constants';
import { FLAG } from '../../src/sim/entities';
import { FIELD_IDS } from '../../src/sim/fields';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { entityCell } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { clearWater, fillField, place, setField } from '../helpers/world';


/** 3 × 3 sugar patch around (64,64); optionally scarce free nutrient over the whole dish. */
function crowdedPatch(sugarPerCell: number, dishNutrient: number | null): World {
  const w = clearWater();
  if (dishNutrient !== null) fillField(w, 'nutrient', dishNutrient);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) setField(w, 'sugar', cellIndex(64 + dx, 64 + dy), sugarPerCell);
  // 36 bacteria spread four to a cell, six more crowding the centre cell (over soft capacity),
  // and two hunting Amoebae among them.
  for (let k = 0; k < 36; k++) place(w, k % 3 === 2 ? 'B06' : 'B01', 63.1 + (k % 6) * 0.5, 63.1 + Math.floor(k / 6) * 0.5);
  for (let k = 0; k < 6; k++) place(w, 'B01', 64.1 + k * 0.15, 64.5);
  place(w, 'P01', 64.3, 64.7, { E: 50 });
  place(w, 'P01', 63.5, 65.5, { E: 50 });
  return w;
}

interface Audit {
  ticks: number;
  violations: string[];
  /** Cell-ticks where two or more eaters emptied the pool between them (scarcity engaged). */
  sharedExhaustion: number;
  /** Largest carbon taken / intake budget seen for any organism. */
  maxBudgetUse: number;
  mealTicks: number;
  totalTaken: number;
  overCapacityEaters: number;
  /** Organism-ticks whose intake was scaled down by the cell's free-nutrient share. */
  nutrientLimited: number;
}

function fail(a: Audit, msg: string): void {
  if (a.violations.length < 20) a.violations.push(msg);
}

/** Step once, auditing stage 6 against the pools exactly as they stood after stage 5. */
function auditedStep(w: World, a: Audit): void {
  const c = w.ents.cols;
  let sugar0: Float64Array | null = null;
  let nutrient0: Float64Array | null = null;
  let meal0: Float64Array | null = null;
  let mealN0: Float64Array | null = null;
  let body0: Float64Array | null = null;
  let accum0: Float64Array | null = null;
  step(w, {
    afterStage: (stage, world) => {
      if (stage === 5) {
        sugar0 = Float64Array.from(world.fields.sugar!);
        nutrient0 = Float64Array.from(world.fields.nutrient!);
        meal0 = Float64Array.from(c.mealC.subarray(0, world.ents.highWater));
        mealN0 = Float64Array.from(c.mealN.subarray(0, world.ents.highWater));
        body0 = Float64Array.from(c.N.subarray(0, world.ents.highWater));
        accum0 = Float64Array.from(c.intakeAccum.subarray(0, world.ents.highWater));
        return;
      }
      if (stage !== 6) return;
      const sugar = world.fields.sugar!;
      const nutrient = world.fields.nutrient!;
      const take = new Float64Array(CELL_COUNT);
      const eaters = new Uint8Array(CELL_COUNT);
      const freeN = new Float64Array(CELL_COUNT);
      const releasedN = new Float64Array(CELL_COUNT);
      for (let i = 0; i < accum0!.length; i++) {
        if (c.alive[i] !== 1) continue;
        const Cs = c.intakeAccum[i]! - accum0![i]!;
        if (Cs < 0) fail(a, `tick ${world.tick} slot ${i}: negative intake ${Cs}`);
        if (Cs <= 0) continue;
        const sp = world.species[c.species[i]!]!;
        // Nutrient: the body gains N; bound N comes from the digested meal (sugar here carries
        // none); the shortfall is free nutrient taken, any excess bound N is released free.
        const cell = entityCell(c.x[i]!, c.y[i]!);
        const gainN = c.N[i]! - body0![i]!;
        const boundUsed = sp.isPredator ? mealN0![i]! - c.mealN[i]! : 0;
        freeN[cell]! += Math.max(0, gainN - boundUsed);
        releasedN[cell]! += Math.max(0, boundUsed - gainN);
        const over = (c.flags[i]! & FLAG.overCapacity) !== 0;
        const budget = profileOf(world, i).q * c.suitability[i]! * DT * (over ? 0.5 : 1);
        if (Cs > budget * (1 + 1e-12)) fail(a, `tick ${world.tick} slot ${i}: took ${Cs} over budget ${budget}`);
        a.maxBudgetUse = Math.max(a.maxBudgetUse, Cs / budget);
        if (over) a.overCapacityEaters++;
        if (c.limitCode[i] === R.NUTRIENT_LIMITED) a.nutrientLimited++;
        a.totalTaken += Cs;
        if (sp.isPredator) {
          a.mealTicks++;
          if (Cs > meal0![i]! * (1 + 1e-12)) fail(a, `tick ${world.tick} slot ${i}: digested ${Cs} from a meal of ${meal0![i]}`);
          if (Math.abs(meal0![i]! - Cs - c.mealC[i]!) > 1e-12) fail(a, `tick ${world.tick} slot ${i}: meal did not fall by the amount digested`);
          continue;
        }
        take[cell]! += Cs;
        eaters[cell]!++;
      }
      let dropSum = 0;
      let takeSum = 0;
      for (const cell of maskCells()) {
        const before = sugar0![cell]!;
        const drop = before - sugar[cell]!;
        dropSum += drop;
        takeSum += take[cell]!;
        if (take[cell]! > before * (1 + 1e-12) + 1e-18) fail(a, `tick ${world.tick} cell ${cell}: took ${take[cell]} from a pool of ${before}`);
        if (Math.abs(drop - take[cell]!) > 1e-14) fail(a, `tick ${world.tick} cell ${cell}: pool fell ${drop} but ${take[cell]} was taken`);
        if (eaters[cell]! >= 2 && before > 0 && take[cell]! >= before * (1 - 1e-9)) a.sharedExhaustion++;
        const n0 = nutrient0![cell]!;
        if (freeN[cell]! > n0 * (1 + 1e-12) + 1e-18) fail(a, `tick ${world.tick} cell ${cell}: took ${freeN[cell]} free nutrient from ${n0}`);
        if (Math.abs(n0 - freeN[cell]! + releasedN[cell]! - nutrient[cell]!) > 1e-14) {
          fail(a, `tick ${world.tick} cell ${cell}: nutrient ${n0} → ${nutrient[cell]}, taken ${freeN[cell]}, released ${releasedN[cell]}`);
        }
      }
      if (Math.abs(dropSum - takeSum) > 1e-12) fail(a, `tick ${world.tick}: sugar fell ${dropSum}, taken ${takeSum}`);
    },
  });
  a.ticks++;
  // After the whole tick: no negative pool, body or meal anywhere, and the ledger closes.
  const cells = maskCells();
  for (const id of FIELD_IDS) {
    const arr = w.fields[id];
    if (!arr) continue;
    for (let k = 0; k < cells.length; k++) if (arr[cells[k]!]! < 0) fail(a, `tick ${w.tick}: field ${id} negative at ${cells[k]}`);
  }
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    for (const col of ['B', 'N', 'E', 'mealC', 'mealN'] as const) if (c[col][i]! < 0) fail(a, `tick ${w.tick} slot ${i}: ${col} negative`);
  }
  const check = checkLedger(w);
  if (!check.ok) fail(a, `tick ${w.tick}: ledger ${JSON.stringify(check.relErr)}`);
}

function audit(w: World, ticks: number): Audit {
  const a: Audit = { ticks: 0, violations: [], sharedExhaustion: 0, maxBudgetUse: 0, mealTicks: 0, totalTaken: 0, overCapacityEaters: 0, nutrientLimited: 0 };
  for (let t = 0; t < ticks; t++) auditedStep(w, a);
  return a;
}

describe('G1 finite feeding', () => {
  it('food-limited: 44 competitors on a scarce sugar patch never take more than the pools hold or their budgets allow', () => {
    const w = crowdedPatch(0.01, null);
    const a = audit(w, 200);
    expect(a.violations).toEqual([]);
    // The scenario really was competitive: shared pools were emptied, predators digested meals,
    // crowded organisms fed at half budget, and some organism fed at its full budget.
    expect(a.sharedExhaustion).toBeGreaterThan(0);
    expect(a.mealTicks).toBeGreaterThan(0);
    expect(a.overCapacityEaters).toBeGreaterThan(0);
    expect(a.maxBudgetUse).toBeLessThanOrEqual(1 + 1e-12);
    console.info(
      `finite-feeding (food-limited): ${a.ticks} ticks, carbon taken ${a.totalTaken.toFixed(6)}, shared pools emptied ${a.sharedExhaustion}×, ` +
        `meal digestion ticks ${a.mealTicks}, max budget use ${a.maxBudgetUse.toFixed(4)}, births ${w.events.totals.birth ?? 0}, captures ${w.events.totals.capture ?? 0}`,
    );
  });

  it('nutrient-limited: plentiful sugar but scarce free nutrient never overdraws either pool', () => {
    const w = crowdedPatch(0.5, 0.0004);
    const a = audit(w, 150);
    expect(a.violations).toEqual([]);
    expect(a.totalTaken).toBeGreaterThan(0);
    expect(a.nutrientLimited).toBeGreaterThan(0);
    expect(a.maxBudgetUse).toBeLessThanOrEqual(1 + 1e-12);
    console.info(
      `finite-feeding (nutrient-limited): ${a.ticks} ticks, carbon taken ${a.totalTaken.toFixed(6)}, nutrient-limited organism-ticks ${a.nutrientLimited}, ` +
        `max budget use ${a.maxBudgetUse.toFixed(4)}`,
    );
  });
});
