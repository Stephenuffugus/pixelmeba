/**
 * P3.3/P3.4 per-relationship fixtures for the wave 2 organisms (SPEC §4.3, §6.5, §7.3; CT §1.2,
 * §3.1, §3.2, §12.3; src/sim/intake.ts, src/sim/contacts.ts):
 * - B05 Crossfeeder grows only from metabolite;
 * - Y01 Bubble adds exactly 0.20 acid per consumed carbon and pH follows
 *   clamp(7 + (base − acid)/(1 + buffer), 2, 12);
 * - B03 Dusk and Y01 Bubble earn 18 energy per carbon and consume no oxygen (same carbon split as
 *   aerobic feeders), against a Sprinter control (30 E per C, 0.30 O2 per C);
 * - P03 Rotifer eats Y01 Bubble; P04 Siltworm eats B05 Crossfeeder.
 * Intake is exercised directly (stage 6 only) so no transport or movement blurs the per-cell numbers.
 */
import { describe, expect, it } from 'vitest';
import { stageContacts } from '../../src/sim/contacts';
import { cellIndex, maskCells, SUB_SEDIMENT } from '../../src/sim/grid';
import { stageIntake } from '../../src/sim/intake';
import { checkLedger } from '../../src/sim/ledger';
import { rebuildIndex } from '../../src/sim/spatial';
import { updateDerived } from '../../src/sim/transport';
import type { FieldId } from '../../src/sim/fields';
import { speciesIndex, type World } from '../../src/sim/world';
import { clearWater, place, rebaseLedger, registry } from '../helpers/world';

const FOODS: readonly FieldId[] = ['sugar', 'starch', 'oil', 'protein', 'detritus', 'metabolite'];

/** Clear every food field (and the companion nutrient) so each test sets exactly what it needs. */
function bare(): World {
  const w = clearWater();
  for (const id of [...FOODS, 'detritusN', 'proteinN'] as FieldId[]) w.fields[id]?.fill(0);
  w.fields.nutrient!.fill(0);
  for (const c of maskCells()) w.fields.nutrient![c] = 0.5;
  updateDerived(w);
  rebaseLedger(w);
  return w;
}

function at(x: number, y: number): number {
  return cellIndex(x, y);
}

describe('Wave 2 organism relationships (P3.3/P3.4)', () => {
  it('the six organisms are enabled with their CT records', () => {
    const reg = registry();
    for (const id of ['B03', 'B05', 'P02', 'P03', 'P04', 'Y01']) expect(reg.manifest.enabledSpecies).toContain(id);
    expect(reg.species.B03!.metabolism).toBe('anaerobic');
    expect(reg.species.B03!.energyPerCarbon).toBe(18);
    expect(reg.species.Y01!.metabolism).toBe('anaerobic');
    expect(reg.species.Y01!.energyPerCarbon).toBe(18);
    expect(reg.species.Y01!.acidPerCarbon).toBe(0.2);
    expect(reg.species.Y01!.speed).toBe(0);
    expect(reg.species.Y01!.habitats).toEqual(['water', 'gel']);
    expect(reg.species.B05!.foodPriority).toEqual(['metabolite']);
  });

  it('B05 Crossfeeder grows only from metabolite', () => {
    const w = bare();
    const onMetabolite = place(w, 'B05', 40.5, 64.5);
    const onEverythingElse = place(w, 'B05', 80.5, 64.5);
    w.fields.metabolite![at(40, 64)] = 0.5;
    for (const f of FOODS) if (f !== 'metabolite') w.fields[f]![at(80, 64)] = 0.5;
    w.fields.detritusN![at(80, 64)] = 0.05;
    w.fields.proteinN![at(80, 64)] = 0.05;
    rebaseLedger(w);
    const c = w.ents.cols;
    const B0 = [c.B[onMetabolite]!, c.B[onEverythingElse]!];
    const other = FOODS.filter((f) => f !== 'metabolite').map((f) => w.fields[f]![at(80, 64)]!);
    for (let t = 0; t < 20; t++) stageIntake(w);
    expect(c.intakeAccum[onMetabolite]).toBeGreaterThan(0);
    expect(c.B[onMetabolite]).toBeGreaterThan(B0[0]!);
    expect(c.intakeAccum[onEverythingElse]).toBe(0);
    expect(c.B[onEverythingElse]).toBe(B0[1]);
    expect(FOODS.filter((f) => f !== 'metabolite').map((f) => w.fields[f]![at(80, 64)]!)).toEqual(other);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('Y01 Bubble adds exactly 0.20 acid per consumed carbon and pH follows clamp(7 + (base − acid)/(1 + buffer), 2, 12)', () => {
    const w = bare();
    const y = place(w, 'Y01', 50.5, 64.5);
    const cell = at(50, 64);
    w.fields.sugar![cell] = 0.5;
    w.fields.base![cell] = 0.01;
    w.fields.buffer![cell] = 0.5;
    w.fields.acid![cell] = 0;
    rebaseLedger(w);
    const c = w.ents.cols;
    let consumed = 0;
    for (let t = 0; t < 5; t++) {
      const before = c.intakeAccum[y]!;
      const acid0 = w.fields.acid![cell];
      stageIntake(w);
      const C = c.intakeAccum[y]! - before;
      expect(C).toBeGreaterThan(0);
      expect(w.fields.acid![cell] - acid0).toBeCloseTo(0.2 * C, 15);
      consumed += C;
    }
    expect(w.fields.acid![cell]).toBeCloseTo(0.2 * consumed, 14);
    updateDerived(w);
    const { acid, base, buffer } = { acid: w.fields.acid![cell], base: w.fields.base![cell], buffer: w.fields.buffer![cell] };
    expect(acid).toBeGreaterThan(base); // the Bubble has turned this cell acidic
    expect(w.derived.ph[cell]).toBeCloseTo(Math.min(12, Math.max(2, 7 + (base - acid) / (1 + buffer))), 12);
    expect(w.derived.ph[cell]).toBeLessThan(7);
    // Nothing but Y01 emits acid: a Sprinter eating the same sugar adds none.
    const w2 = bare();
    const s = place(w2, 'B01', 50.5, 64.5);
    w2.fields.sugar![cell] = 0.5;
    stageIntake(w2);
    expect(w2.ents.cols.intakeAccum[s]).toBeGreaterThan(0);
    expect(w2.fields.acid![cell]).toBe(0);
  });

  it('B03 Dusk and Y01 Bubble earn 18 E per carbon and consume no oxygen; a Sprinter earns 30 and breathes 0.30 per carbon', () => {
    const w = bare();
    const cells = { B03: at(30, 64), Y01: at(50, 64), B01: at(70, 64) };
    const slots = { B03: place(w, 'B03', 30.5, 64.5), Y01: place(w, 'Y01', 50.5, 64.5), B01: place(w, 'B01', 70.5, 64.5) };
    for (const cell of Object.values(cells)) w.fields.sugar![cell] = 0.5;
    w.fields.oxygen![cells.B03] = 0; // Dusk's best case (suitability 1); nothing to consume anyway
    w.fields.oxygen![cells.Y01] = 0.5; // oxygen present: Bubble must leave it alone
    rebaseLedger(w);
    const c = w.ents.cols;
    const ids = ['B03', 'Y01', 'B01'] as const;
    const before = Object.fromEntries(
      ids.map((id) => {
        const slot = slots[id];
        const cell = cells[id];
        return [id, { E: c.E[slot]!, B: c.B[slot]!, acc: c.intakeAccum[slot]!, o2: w.fields.oxygen![cell]!, co2: w.fields.co2![cell]!, met: w.fields.metabolite![cell]! }];
      }),
    );
    const earned0 = w.ledger.energy.earned;
    stageIntake(w); // one stage 6 pass; the three cells are far apart
    let earned = 0;
    for (const id of ids) {
      const slot = slots[id];
      const cell = cells[id];
      const b = before[id]!;
      const C = c.intakeAccum[slot]! - b.acc;
      expect(C, id).toBeGreaterThan(0);
      const perC = id === 'B01' ? 30 : 18;
      earned += perC * C;
      expect(c.E[slot]! - b.E, id).toBeCloseTo(perC * C, 12);
      expect(c.B[slot]! - b.B, id).toBeCloseTo(0.5 * C, 14);
      expect(w.fields.co2![cell]! - b.co2, id).toBeCloseTo(0.3 * C, 14);
      expect(w.fields.metabolite![cell]! - b.met, id).toBeCloseTo(0.2 * C, 14);
      if (id === 'B01') expect(b.o2 - w.fields.oxygen![cell]!).toBeCloseTo(0.3 * C, 14);
      else expect(w.fields.oxygen![cell], id).toBe(b.o2);
    }
    expect(w.ledger.energy.earned - earned0).toBeCloseTo(earned, 12);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('P03 Rotifer eats Y01 Bubble; P04 Siltworm eats B05 Crossfeeder (a hand-built contact)', () => {
    const w = bare();
    for (const cell of maskCells()) if (cell % 128 >= 70) w.grid.substrate[cell] = SUB_SEDIMENT;
    w.grid.geometryVersion++;
    updateDerived(w);
    const rot = place(w, 'P03', 40.5, 64.5, { E: 50 });
    const bubble = place(w, 'Y01', 40.8, 64.5);
    const worm = place(w, 'P04', 90.5, 64.5, { E: 50 });
    const cross = place(w, 'B05', 90.8, 64.5);
    const c = w.ents.cols;
    const meals = { bubble: [c.B[bubble]!, c.N[bubble]!], cross: [c.B[cross]!, c.N[cross]!] };
    rebuildIndex(w);
    stageContacts(w);
    expect(w.ents.isAlive(bubble)).toBe(false);
    expect(w.ents.isAlive(cross)).toBe(false);
    expect(c.mealC[rot]).toBeCloseTo(meals.bubble[0]!, 14);
    expect(c.mealN[rot]).toBeCloseTo(meals.bubble[1]!, 14);
    expect(c.mealC[worm]).toBeCloseTo(meals.cross[0]!, 14);
    expect(c.attackCooldown[rot]).toBe(4);
    expect(c.attackCooldown[worm]).toBe(3);
    expect(w.species[speciesIndex(w, 'P04')]!.def.habitats).toEqual(['sediment']);
    expect(checkLedger(w).ok).toBe(true);
  });
});
