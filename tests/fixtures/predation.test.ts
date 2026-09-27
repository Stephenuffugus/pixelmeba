/**
 * G1 fixture: predation (P1.1; SPEC §7.1; CT §3). One contact, one kill, one meal; the cooldown;
 * the 2 × B0 meal cap with overflow to detritus; hunt gating while well fed; contested prey;
 * prey specificity; and a hunting Amoeba that conserves everything.
 */
import { describe, expect, it } from 'vitest';
import { DT } from '../../src/sim/constants';
import { stageContacts } from '../../src/sim/contacts';
import { cellIndex } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { field } from '../../src/sim/lineage';
import { R } from '../../src/sim/reasons';
import { rebuildIndex } from '../../src/sim/spatial';
import { run } from '../../src/sim/tick';
import { aliveOf, clearWater, place } from '../helpers/world';

const CELL = cellIndex(64, 64);

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
