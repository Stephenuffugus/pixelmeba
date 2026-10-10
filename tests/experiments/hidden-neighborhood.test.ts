/**
 * EXP_104 "A hidden neighborhood" (CT §10.1 seed 104; P3.9). HIDDEN_NEIGHBORHOOD_V1: closed Water
 * Garden (defaults: stones, background sugar 0.02); 20 Sprinters (B01) + 20 Dusks (B03) nearest-first
 * at (50,70) r 6; sugar 0.50 and nutrient 0.20 per patch cell; 180 s.
 *
 * Gate: limitSeconds.B01.OXYGEN_LIMITED > 0 and limitSeconds.B03.SUIT_OXYGEN_HIGH > 0 (organism-seconds
 * whose inspector reading was that reason; src/sim/pairedRun.ts). The in-app half of CT's evidence
 * ("both species inspected with different O2 limitations") is the player step 'inspectOxygenLimits'.
 *
 * Revision 2 (D-0068; docs/reports/exp104-revision-probe.md): the dish starts at oxygen 0.03 (revision 1's
 * 0.8 never let a Sprinter run short and killed every Dusk by about 50 s; D-0062). Measured on the shipped
 * content (docs/reports/experiments-g3.md): the gate is reached at 1 s. The founders' feast empties the
 * patch's oxygen, so Sprinters read OXYGEN_LIMITED from tick 8 to tick 126 (≈ the first 10 s); after that
 * FOOD_ACCESS_LOW leads and oxygen diffuses back. Dusks read SUIT_OXYGEN_HIGH (suitability 1 − O2/0.4) and
 * all twenty live. Nothing was tuned to reach the gate beyond the recorded starting oxygen (SPEC §13.2).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { entitySuitabilityAt } from '../../src/sim/crossing';
import { inspectedOxygenReading, PlayerSteps, realizeExperimentArms, runExperiment, type ExperimentResult } from '../../src/sim/experiments';
import { ArmObserver, measureArm, stepObserved } from '../../src/sim/pairedRun';
import { profileOf } from '../../src/sim/profiles';
import { realizeRecipe } from '../../src/sim/recipes';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { entityCell } from '../../src/sim/spatial';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registry } from './helpers';

let result: ExperimentResult;
beforeAll(() => {
  result = runExperiment(registry(), 'EXP_104');
}, 300_000);

/** Organisms of `sp` whose reading is `reason` now (the inspector's: limit code, or suitability reason for SUIT_*). */
function countReading(w: World, sp: string, reason: number, suitability: boolean): number {
  const c = w.ents.cols;
  let n = 0;
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1 || w.species[c.species[i]!]!.id !== sp) continue;
    const code = suitability ? entitySuitabilityAt(w, i, w.species[c.species[i]!]!, profileOf(w, i), entityCell(c.x[i]!, c.y[i]!)).reason : c.limitCode[i];
    if (code === reason) n++;
  }
  return n;
}

function firstLiving(w: World, sp: string): number {
  const c = w.ents.cols;
  for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && w.species[c.species[i]!]!.id === sp) return c.birthId[i]!;
  return -1;
}

describe('EXP_104 A hidden neighborhood (HIDDEN_NEIGHBORHOOD_V1, seed 104, 180 s)', () => {
  it('realizes the CT §10.1 setup: closed lid, 20 B01 + 20 B03 nearest-first at (50,70), sugar 0.50 + nutrient 0.20 per patch cell', () => {
    const { A } = realizeExperimentArms(registry(), 'EXP_104');
    expect(A.seed).toBe(104);
    expect(A.settings.lid).toBe('closed');
    const c = A.ents.cols;
    const counts: Record<string, number> = {};
    for (let i = 0; i < A.ents.highWater; i++) if (c.alive[i] === 1) counts[A.species[c.species[i]!]!.id] = (counts[A.species[c.species[i]!]!.id] ?? 0) + 1;
    expect(counts).toEqual({ B01: 20, B03: 20 });
    const patch = A.ledger.entries.find((e) => e.source.startsWith('recipe:patch0'))!;
    expect(patch.c).toBeCloseTo(0.5 * 113, 9);
    expect(patch.n).toBeCloseTo(0.2 * 113, 9);
  });

  it('reaches its gate at 1 s on revision 2: Sprinters short of oxygen while the patch is busiest, Dusks held back by it and alive', () => {
    const r = result;
    expect(registry().recipes.HIDDEN_NEIGHBORHOOD_V1!.revision).toBe(2);
    expect(r.gate.reached).toBe(true);
    expect(r.gate.reachedAtSecond).toBe(1);
    expect(r.stamp).toEqual(expect.objectContaining({ experimentId: 'EXP_104', recipeRevision: 2, reachedAtSecond: 1 }));
    const A = r.A.reported;
    expect(A['limitSeconds.B01.OXYGEN_LIMITED']).toBeCloseTo(131.1, 6);
    expect(A['limitSeconds.B03.SUIT_OXYGEN_HIGH']).toBeCloseTo(3496.7, 6);
    expect(A['oxygenMean']).toBeCloseTo(0.0269, 4);
    expect(A['alive.B01']).toBe(28);
    expect(A['alive.B03']).toBe(20);
    expect(A['births.B01']).toBe(9);
    expect(A['deaths.B01']).toBe(1);
    expect(A['deaths.B03']).toBe(0);
    expect(r.A.ledger.everyCheckOk).toBe(true);
    expect(r.endTick).toBe(1800);
  });

  it('the mechanism: Sprinters are oxygen-limited only in the first seconds; afterwards their cells recover', () => {
    const arms = realizeExperimentArms(registry(), 'EXP_104');
    const w = arms.A;
    let first = -1;
    let last = -1;
    let lowestLate = Infinity;
    for (let t = 0; t < 1800; t++) {
      stepObserved(w, arms.obsA);
      const c = w.ents.cols;
      for (let i = 0; i < w.ents.highWater; i++) {
        if (c.alive[i] !== 1 || w.species[c.species[i]!]!.id !== 'B01') continue;
        if (w.tick > 200) lowestLate = Math.min(lowestLate, w.fields.oxygen![entityCell(c.x[i]!, c.y[i]!)]!);
        if (c.limitCode[i] === R.OXYGEN_LIMITED) {
          if (first < 0) first = w.tick;
          last = w.tick;
        }
      }
    }
    expect(first).toBe(8);
    expect(last).toBe(126);
    expect(lowestLate).toBeGreaterThan(0.003);
  });

  it('limitSeconds counts organism-seconds of the inspector’s reading, tick by tick (suitability and intake limits)', () => {
    const reg = registry();
    const w = realizeRecipe(reg, 'HIDDEN_NEIGHBORHOOD_V1');
    const ids = ['limitSeconds.B01.OXYGEN_LIMITED', 'limitSeconds.B03.SUIT_OXYGEN_HIGH', 'limitSeconds.B01.FOOD_ACCESS_LOW'];
    const obs = new ArmObserver(w, { observe: ids });
    const expected = [0, 0, 0];
    for (let t = 0; t < 300; t++) {
      stepObserved(w, obs);
      expected[0]! += countReading(w, 'B01', R.OXYGEN_LIMITED, false) / 10;
      expected[1]! += countReading(w, 'B03', R.SUIT_OXYGEN_HIGH, true) / 10;
      expected[2]! += countReading(w, 'B01', R.FOOD_ACCESS_LOW, false) / 10;
    }
    const m = measureArm(w, obs, ids);
    ids.forEach((id, k) => expect(m[id]).toBeCloseTo(expected[k]!, 9));
    expect(m['limitSeconds.B01.OXYGEN_LIMITED']).toBeGreaterThan(0);
    // An untracked id is refused rather than read as 0.
    expect(() => measureArm(w, obs, ['limitSeconds.B03.OXYGEN_LIMITED'])).toThrow(/not tracked/);
  });

  it('player step: the inspector readings of a Sprinter and a Dusk complete it only when they differ', () => {
    const reg = registry();
    const def = reg.experiments.EXP_104!;
    expect(def.completion.playerSteps).toEqual(['inspectOxygenLimits']);
    const w = realizeExperimentArms(reg, 'EXP_104').A;
    run(w, 20);
    const dusk = firstLiving(w, 'B03');
    const sprinter = firstLiving(w, 'B01');
    expect(inspectedOxygenReading(w, dusk, ['B01', 'B03'])).toEqual({ species: 'B03', reason: 'SUIT_OXYGEN_HIGH' });
    // At 2 s the feast has emptied the patch's oxygen: the Sprinter shows too little.
    expect(inspectedOxygenReading(w, sprinter, ['B01', 'B03'])).toEqual({ species: 'B01', reason: 'OXYGEN_LIMITED' });
    // Not a species the card follows: no reading.
    expect(inspectedOxygenReading(w, sprinter, ['B03'])).toBeNull();
    // Once the patch is eaten down (after ≈ 13 s), a Sprinter with enough oxygen has no oxygen reading to show.
    run(w, 280);
    expect(inspectedOxygenReading(w, firstLiving(w, 'B01'), ['B01', 'B03'])).toBeNull();
    const steps = new PlayerSteps(def);
    expect(steps.noteOxygenLimit('B03', 'SUIT_OXYGEN_HIGH', ['B01', 'B03'])).toBe(false);
    expect(steps.noteOxygenLimit('B03', 'SUIT_OXYGEN_HIGH', ['B01', 'B03'])).toBe(false);
    expect(steps.complete).toBe(false);
    // The same reading for both species is not "different O2 limitations".
    const same = new PlayerSteps(def);
    same.noteOxygenLimit('B01', 'SUIT_OXYGEN_HIGH', ['B01', 'B03']);
    expect(same.noteOxygenLimit('B03', 'SUIT_OXYGEN_HIGH', ['B01', 'B03'])).toBe(false);
    expect(steps.noteOxygenLimit('B01', 'OXYGEN_LIMITED', ['B01', 'B03'])).toBe(true);
    expect(steps.complete).toBe(true);
  });

  it('measuring is observation: the observed run ends at the same state hash as a plain run', () => {
    const reg = registry();
    const arms = realizeExperimentArms(reg, 'EXP_104');
    const plain = realizeRecipe(reg, 'HIDDEN_NEIGHBORHOOD_V1', { seed: 104 });
    for (let t = 0; t < 300; t++) stepObserved(arms.A, arms.obsA);
    run(plain, 300);
    expect(stateHash(arms.A)).toBe(stateHash(plain));
  });
});
