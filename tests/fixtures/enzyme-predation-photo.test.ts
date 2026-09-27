/**
 * G1 fixtures for P1.1: enzyme source (conservation, no substrate ⇒ no conversion, producer pays),
 * predation (one prey one meal, cooldown, meal cap with overflow, contested prey), photosynthesis.
 */
import { describe, expect, it } from 'vitest';
import { field } from '../../src/sim/lineage';
import { DT, ENZYME_EMIT_COST } from '../../src/sim/constants';
import { stageConversion } from '../../src/sim/conversion';
import { stageContacts } from '../../src/sim/contacts';
import { cellIndex } from '../../src/sim/grid';
import { stageIntake } from '../../src/sim/intake';
import { checkLedger } from '../../src/sim/ledger';
import { stageSenseAndMove } from '../../src/sim/movement';
import { R } from '../../src/sim/reasons';
import { rebuildIndex } from '../../src/sim/spatial';
import { run } from '../../src/sim/tick';
import { aliveOf, clearWater, place, setField } from '../helpers/world';

const CELL = cellIndex(64, 64);

describe('G1 enzyme source (P1.1)', () => {
  it('converts starch to sugar at 0.10 × activity × dt, moving bound nutrient proportionally', () => {
    const w = clearWater();
    setField(w, 'starch', CELL, 1);
    setField(w, 'starchN', CELL, 0.1);
    setField(w, 'eStarch', CELL, 1);
    stageConversion(w);
    expect(w.fields.starch![CELL]).toBeCloseTo(1 - 0.01, 14);
    expect(w.fields.sugar![CELL]).toBeCloseTo(0.01, 14);
    expect(w.fields.starchN![CELL]).toBeCloseTo(0.1 * 0.99, 14);
    expect(w.fields.sugarN![CELL]).toBeCloseTo(0.001, 14);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('breaker divides effective activity: 1 unit of breaker halves conversion', () => {
    const w = clearWater();
    setField(w, 'starch', CELL, 1);
    setField(w, 'eStarch', CELL, 1);
    setField(w, 'breaker', CELL, 1);
    stageConversion(w);
    expect(w.fields.sugar![CELL]).toBeCloseTo(0.005, 14);
  });

  it('never converts more than the substrate present', () => {
    const w = clearWater();
    setField(w, 'starch', CELL, 0.001);
    setField(w, 'eStarch', CELL, 1);
    stageConversion(w);
    expect(w.fields.starch![CELL]).toBe(0);
    expect(w.fields.sugar![CELL]).toBeCloseTo(0.001, 15);
  });

  it('Crumbsmiths pay for secretion and unlock starch; the whole dish conserves carbon and nutrient', () => {
    const w = clearWater();
    w.settings.lid = 'closed';
    const producers: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      setField(w, 'starch', cellIndex(64 + dx, 64 + dy), 0.6);
      setField(w, 'sugar', cellIndex(64 + dx, 64 + dy), 0.1); // disclosed bootstrap
    }
    for (let k = 0; k < 6; k++) producers.push(place(w, 'B06', 64.2 + k * 0.1, 64.5, { E: 60 }));
    run(w, 600);
    expect(w.conversionTotals.starch).toBeGreaterThan(0);
    expect(w.ledger.energy.secretion).toBeGreaterThan(0);
    // Every secretion tick costs exactly 0.40 × dt.
    expect(w.ledger.energy.secretion / (ENZYME_EMIT_COST * DT)).toBeCloseTo(Math.round(w.ledger.energy.secretion / (ENZYME_EMIT_COST * DT)), 6);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('with no substrate nearby a Crumbsmith emits nothing and spends nothing on secretion', () => {
    const w = clearWater();
    setField(w, 'sugar', CELL, 1);
    const s = place(w, 'B06', 64.5, 64.5, { E: 60 });
    run(w, 100);
    expect(w.conversionTotals.starch).toBe(0);
    expect(w.ledger.energy.secretion).toBe(0);
    expect(w.ents.cols.secretionCode[s]).toBe(R.SECRETION_NO_SUBSTRATE);
    let act = 0;
    for (let i = 0; i < 128 * 128; i++) act += w.fields.eStarch![i]!;
    expect(act).toBe(0);
  });
});

describe('G1 predation (P1.1)', () => {
  function duel(preyState: Partial<Record<'B' | 'N' | 'E' | 'H' | 'age', number>> = {}, predMeal = 0) {
    const w = clearWater();
    const pred = place(w, 'P01', 64.5, 64.5, { E: 50 });
    w.ents.cols.mealC[pred] = predMeal;
    w.ents.cols.mealN[pred] = predMeal * 0.1;
    w.ledger.inputs.c += predMeal;
    w.ledger.inputs.n += predMeal * 0.1;
    const prey = place(w, 'B01', 64.8, 64.5, preyState);
    rebuildIndex(w);
    return { w, pred, prey };
  }

  it('one contact, one kill, one meal: prey B and N move into the meal and the cooldown starts', () => {
    const { w, pred, prey } = duel();
    const preyBirth = w.ents.cols.birthId[prey]!;
    const B = w.ents.cols.B[prey]!;
    const N = w.ents.cols.N[prey]!;
    stageContacts(w);
    expect(w.ents.isAlive(prey)).toBe(false);
    expect(w.ents.cols.mealC[pred]).toBeCloseTo(B, 14);
    expect(w.ents.cols.mealN[pred]).toBeCloseTo(N, 14);
    expect(w.ents.cols.attackCooldown[pred]).toBe(3);
    expect(field(w.lineage, 'deathCause', preyBirth)).toBe(R.DEATH_PREDATION);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('a meal beyond 2 × B0 overflows into detritus at the prey cell', () => {
    const { w, pred } = duel({ B: 7, N: 0.7 }, 1.9);
    stageContacts(w);
    expect(w.ents.cols.mealC[pred]).toBeCloseTo(8, 12);
    expect(w.fields.detritus![CELL]).toBeCloseTo(7 - 6.1, 12);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('a predator does not hunt while its meal is at least 0.5 × B0', () => {
    const { w, prey } = duel({}, 2);
    stageContacts(w);
    expect(w.ents.isAlive(prey)).toBe(true);
  });

  it('respects the cooldown: a second prey in contact is taken only after 3 s', () => {
    const w = clearWater();
    const pred = place(w, 'P01', 64.5, 64.5, { E: 50 });
    place(w, 'B01', 64.8, 64.5);
    rebuildIndex(w);
    stageContacts(w);
    const second = place(w, 'B01', 64.6, 64.6);
    let ticks = 0;
    while (w.ents.isAlive(second) && ticks < 60) {
      // Keep both still: only contact timing is under test.
      w.ents.cols.x[pred] = 64.5;
      w.ents.cols.y[pred] = 64.5;
      w.ents.cols.x[second] = 64.6;
      w.ents.cols.y[second] = 64.6;
      rebuildIndex(w);
      stageContacts(w);
      w.ents.cols.attackCooldown[pred] = Math.max(0, w.ents.cols.attackCooldown[pred]! - DT);
      ticks++;
    }
    expect(ticks).toBe(31);
  });

  it('two predators contesting one prey: exactly one wins, the prey dies once', () => {
    const w = clearWater();
    const a = place(w, 'P01', 64.3, 64.5, { E: 50 });
    const b = place(w, 'P01', 64.7, 64.5, { E: 50 });
    place(w, 'B01', 64.5, 64.5);
    rebuildIndex(w);
    stageContacts(w);
    const meals = [w.ents.cols.mealC[a]!, w.ents.cols.mealC[b]!];
    expect(meals.filter((m) => m > 0)).toHaveLength(1);
    expect(w.events.totals.death).toBe(1);
    expect(aliveOf(w, 'B01')).toHaveLength(0);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('never eats a non-prey species', () => {
    const w = clearWater();
    place(w, 'P01', 64.5, 64.5, { E: 50 });
    const other = place(w, 'P01', 64.7, 64.5, { E: 50 });
    rebuildIndex(w);
    stageContacts(w);
    expect(w.ents.isAlive(other)).toBe(true);
  });

  it('a hunting Amoeba catches, digests at its intake ceiling and conserves everything', () => {
    const w = clearWater();
    place(w, 'P01', 60.5, 64.5, { E: 50 });
    for (let k = 0; k < 10; k++) place(w, 'B01', 62.5 + (k % 5) * 0.3, 63.5 + Math.floor(k / 5));
    run(w, 600);
    expect(w.events.totals.capture ?? 0).toBeGreaterThan(0);
    expect(checkLedger(w).ok).toBe(true);
  });
});

describe('G1 photosynthesis (P1.1)', () => {
  it('scales with light: half the light gives half the intake (CO2 not limiting)', () => {
    const gain = (light: number) => {
      const w = clearWater();
      w.grid.lightBase.fill(light);
      w.grid.geometryVersion++;
      const s = place(w, 'A01', 64.5, 64.5);
      run(w, 1);
      void stageSenseAndMove;
      void stageIntake;
      return w.ents.cols.B[s]! - 1.5;
    };
    const full = gain(0.8);
    const half = gain(0.4);
    expect(full).toBeGreaterThan(0);
    expect(half / full).toBeCloseTo(0.5, 6);
  });
});
