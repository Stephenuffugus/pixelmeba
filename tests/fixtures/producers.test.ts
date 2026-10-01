/**
 * P3.6 part 1 fixture: the oil and protein producers (B07 Oilwick, B08 Brothmaker; SPEC §5.3, §6.4,
 * §12.1; CT §1 B07/B08/Y02, §3.2, §12.6). Exact costs, refusal reasons (D-0029), conservation of each
 * enzyme's conversion, the breaker, decay and diffusion rates, producer movement scoring, the reaction
 * ledger's provenance rule, and the CT §3.2 prey rows for the three new species.
 */
import { describe, expect, it } from 'vitest';
import { DIFFUSION_WATER, DT, ENZYME_EMIT_COST, ENZYME_EMIT_RATE } from '../../src/sim/constants';
import { stageConversion } from '../../src/sim/conversion';
import { FLAG, LIFE_ACTIVE, LIFE_RESTING, MOVE_TARGET } from '../../src/sim/entities';
import type { FieldId } from '../../src/sim/fields';
import { cellIndex, SUB_SEDIMENT } from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { preyAllowed, stageSenseAndMove } from '../../src/sim/movement';
import { profileOf } from '../../src/sim/profiles';
import { reactionInCell, reactionInDish } from '../../src/sim/reactions';
import { R } from '../../src/sim/reasons';
import { rebuildIndex } from '../../src/sim/spatial';
import { stageStructures } from '../../src/sim/structures';
import { run, step } from '../../src/sim/tick';
import { stageEnvironment } from '../../src/sim/transport';
import { speciesIndex, type World } from '../../src/sim/world';
import { introduceOrganism } from '../../src/sim/commands';
import { buildInspector, packOverlay } from '../../src/worker/snapshot';
import { stateHash } from '../../src/sim/serialize';
import { clearWater, place, rebaseLedger, setField } from '../helpers/world';

const CELL = cellIndex(64, 64);

interface Producer {
  readonly id: 'B07' | 'B08';
  readonly substrate: FieldId;
  readonly substrateN: FieldId;
  readonly activity: FieldId;
  readonly product: FieldId;
  readonly productN: FieldId | 'nutrient';
}
const PRODUCERS: readonly Producer[] = [
  { id: 'B07', substrate: 'oil', substrateN: 'oilN', activity: 'eOil', product: 'metabolite', productN: 'nutrient' },
  { id: 'B08', substrate: 'protein', substrateN: 'proteinN', activity: 'eProtein', product: 'broth', productN: 'brothN' },
];

function patch(w: World, id: FieldId, amount: number): void {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) setField(w, id, cellIndex(64 + dx, 64 + dy), amount);
}

function total(w: World, id: FieldId): number {
  const a = w.fields[id]!;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]!;
  return s;
}

describe('P3.6 producers: B07 Oilwick and B08 Brothmaker', () => {
  for (const p of PRODUCERS) {
    it(`${p.id} has native ${p.activity} producer rules with the CT §12.6 numbers, and Y02 none`, () => {
      const w = clearWater();
      const s = place(w, p.id, 64.5, 64.5, { E: 60 });
      const prof = profileOf(w, s);
      const rules = p.id === 'B07' ? prof.oil : prof.protein;
      expect(rules).toEqual({ source: 'native', emitRate: 0.02, minEnergy: 35, emitCost: 0.4, localCap: 1 });
      expect(p.id === 'B07' ? prof.protein : prof.oil).toBeNull();
      expect(prof.starch).toBeNull();
      const y = place(w, 'Y02', 60.5, 64.5);
      const yp = profileOf(w, y);
      expect([yp.starch, yp.oil, yp.protein]).toEqual([null, null, null]);
      expect(yp.foods).toEqual(['broth']);
    });

    it(`${p.id} pays exactly 0.40 × dt on every emitting tick and nothing otherwise`, () => {
      const w = clearWater();
      patch(w, p.substrate, 0.6);
      const s = place(w, p.id, 64.5, 64.5, { E: 60 });
      const e = w.ledger.energy;
      let emitting = 0;
      let idle = 0;
      for (let t = 0; t < 600 && w.ents.cols.alive[s] === 1; t++) {
        const before = { E: w.ents.cols.E[s]!, m: e.maintenance, mv: e.movement, sec: e.secretion, earned: e.earned, other: e.other, div: e.division, act: total(w, p.activity) };
        step(w);
        if (w.ents.cols.alive[s] !== 1) break;
        const dSec = e.secretion - before.sec;
        // One organism in the dish: every ledger delta is its own.
        const dE = w.ents.cols.E[s]! - before.E;
        const expected = e.earned - before.earned - (e.maintenance - before.m) - (e.movement - before.mv) - dSec - (e.other - before.other) - (e.division - before.div);
        expect(dE).toBeCloseTo(expected, 10);
        if ((w.ents.cols.flags[s]! & FLAG.secreting) !== 0) {
          expect(w.ents.cols.secretionCode[s]).toBe(R.SECRETING);
          expect(dSec).toBeCloseTo(ENZYME_EMIT_COST * DT, 12);
          emitting++;
        } else {
          expect(w.ents.cols.secretionCode[s]).not.toBe(R.SECRETING);
          expect(dSec).toBe(0);
          idle++;
        }
      }
      expect(emitting).toBeGreaterThan(10);
      expect(idle).toBeGreaterThan(0);
      expect(w.ledger.energy.secretion).toBeGreaterThan(0);
    });

    it(`${p.id} refusals: energy ≤ 35, no substrate, saturated; a non-Active organism keeps its code`, () => {
      // E ≤ 35 with substrate in the cell.
      let w = clearWater();
      patch(w, p.substrate, 0.6);
      let s = place(w, p.id, 64.5, 64.5, { E: 35 });
      stageStructures(w);
      expect(w.ents.cols.secretionCode[s]).toBe(R.SECRETION_ENERGY_LOW);
      expect(w.ents.cols.flags[s]! & FLAG.secreting).toBe(0);
      expect(w.ledger.energy.secretion).toBe(0);
      // No substrate in the cell or a four-neighbour (a diagonal deposit does not count).
      w = clearWater();
      setField(w, p.substrate, cellIndex(65, 65), 0.6);
      s = place(w, p.id, 64.5, 64.5, { E: 60 });
      stageStructures(w);
      expect(w.ents.cols.secretionCode[s]).toBe(R.SECRETION_NO_SUBSTRATE);
      expect(w.ledger.energy.secretion).toBe(0);
      // A four-neighbour deposit is enough.
      setField(w, p.substrate, cellIndex(65, 64), 0.6);
      stageStructures(w);
      expect(w.ents.cols.secretionCode[s]).toBe(R.SECRETING);
      expect(w.fields[p.activity]![CELL]).toBeCloseTo(ENZYME_EMIT_RATE * DT, 15);
      // Local activity at the 1.0 cap.
      w = clearWater();
      patch(w, p.substrate, 0.6);
      w.fields[p.activity]![CELL] = 1;
      s = place(w, p.id, 64.5, 64.5, { E: 60 });
      stageStructures(w);
      expect(w.ents.cols.secretionCode[s]).toBe(R.SECRETION_SATURATED);
      expect(w.fields[p.activity]![CELL]).toBe(1);
      expect(w.ledger.energy.secretion).toBe(0);
      // Not Active (resting, through E03): stage 8 skips it, so secretionCode keeps its last value.
      w = clearWater();
      patch(w, p.substrate, 0.6);
      s = introduceOrganism(w, speciesIndex(w, p.id), CELL, 'test', { modules: ['E03'], exactCenter: true });
      rebaseLedger(w);
      w.ents.cols.E[s] = 60;
      w.ents.cols.secretionCode[s] = R.SECRETION_SATURATED;
      w.ents.cols.lifeState[s] = LIFE_RESTING;
      stageStructures(w);
      expect(w.ents.cols.lifeState[s]).not.toBe(LIFE_ACTIVE);
      expect(w.ents.cols.secretionCode[s]).toBe(R.SECRETION_SATURATED);
      expect(w.ents.cols.flags[s]! & FLAG.secreting).toBe(0);
      expect(w.fields[p.activity]![CELL]).toBe(0);
    });

    it(`${p.activity} converts ${p.substrate} into ${p.product}, carbon and bound nutrient exact to 1e-12; the ledger balances`, () => {
      const w = clearWater();
      setField(w, p.substrate, CELL, 0.8);
      setField(w, p.substrateN, CELL, 0.08);
      setField(w, p.activity, CELL, 0.7);
      const before = { sub: total(w, p.substrate), subN: total(w, p.substrateN), prod: total(w, p.product), prodN: total(w, p.productN) };
      const t0 = computeTotals(w);
      stageConversion(w);
      const converted = 0.1 * 0.7 * DT;
      const nMoved = (0.08 * converted) / 0.8;
      expect(before.sub - total(w, p.substrate)).toBeCloseTo(converted, 12);
      expect(total(w, p.product) - before.prod).toBeCloseTo(converted, 12);
      expect(before.subN - total(w, p.substrateN)).toBeCloseTo(nMoved, 12);
      // Oil → metabolite has no companion nutrient: the bound nutrient is released as free nutrient.
      expect(total(w, p.productN) - before.prodN).toBeCloseTo(nMoved, 12);
      const t1 = computeTotals(w);
      expect(Math.abs(t1.c - t0.c)).toBeLessThan(1e-12);
      expect(Math.abs(t1.n - t0.n)).toBeLessThan(1e-12);
      expect(w.conversionTotals[p.substrate as 'oil' | 'protein']).toBeCloseTo(converted, 15);
      expect(checkLedger(w).ok).toBe(true);
    });

    it(`breaker 1.0 halves ${p.substrate} conversion`, () => {
      const w = clearWater();
      setField(w, p.substrate, CELL, 1);
      setField(w, p.activity, CELL, 1);
      setField(w, 'breaker', CELL, 1);
      stageConversion(w);
      expect(w.fields[p.product]![CELL]).toBeCloseTo(0.1 * 0.5 * DT, 15);
    });
  }

  it('enzymes spread at half the coefficient and lose 2 %/s; the breaker spreads normally and loses 1 %/s', () => {
    const w = clearWater();
    for (const id of ['eOil', 'eProtein', 'eStarch', 'breaker'] as const) setField(w, id, CELL, 1);
    stageEnvironment(w);
    for (const id of ['eOil', 'eProtein', 'eStarch'] as const) {
      expect(total(w, id)).toBeCloseTo(1 - 0.02 * DT, 12);
      expect(w.fields[id]![CELL + 1]).toBeCloseTo(DIFFUSION_WATER * 0.5 * (1 - 0.02 * DT), 12);
    }
    expect(total(w, 'breaker')).toBeCloseTo(1 - 0.01 * DT, 12);
    expect(w.fields.breaker![CELL + 1]).toBeCloseTo(DIFFUSION_WATER * (1 - 0.01 * DT), 12);
  });

  it('a closed dish of B07 on oil and B08 on protein conserves carbon and nutrient over 60 s', () => {
    const w = clearWater();
    w.settings.lid = 'closed';
    patch(w, 'oil', 0.6);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      setField(w, 'protein', cellIndex(80 + dx, 64 + dy), 0.6);
      setField(w, 'proteinN', cellIndex(80 + dx, 64 + dy), 0.06);
    }
    for (let k = 0; k < 4; k++) {
      place(w, 'B07', 64.2 + k * 0.2, 64.5, { E: 60 });
      place(w, 'B08', 80.2 + k * 0.2, 64.5, { E: 60 });
    }
    place(w, 'Y02', 81.5, 64.5);
    for (let t = 0; t < 600; t++) {
      step(w);
      if (t % 100 === 99) expect(checkLedger(w).ok, `ledger at tick ${w.tick}`).toBe(true);
    }
    expect(w.conversionTotals.oil).toBeGreaterThan(0);
    expect(w.conversionTotals.protein).toBeGreaterThan(0);
  });

  it('the reaction record holds the last whole second, cell by cell and for the dish (observation only)', () => {
    const w = clearWater();
    setField(w, 'oil', CELL, 1);
    setField(w, 'eOil', CELL, 1);
    let tally = 0;
    for (let t = 0; t < 10; t++) {
      step(w);
      tally += w.conversionTally.oil;
    }
    expect(w.tick).toBe(10);
    expect(reactionInCell(w, 'oil', CELL).c).toBeCloseTo(tally, 14);
    expect(reactionInDish(w, 'oil').c).toBeCloseTo(tally, 14);
    expect(reactionInCell(w, 'protein', CELL).c).toBe(0);
    // Half way through the next second the last complete second is still the one shown.
    for (let t = 0; t < 5; t++) step(w);
    expect(reactionInCell(w, 'oil', CELL).c).toBeCloseTo(tally, 14);
  });

  it('foodScore: a producer weighs 0.5 × avail(convertible substrate) only while E > 35', () => {
    // Oil 0.5 two cells east scores 0.5 × 0.5/0.6 = 0.4167; metabolite two cells west scores m/(m + 0.1).
    const target = (E: number, metabolite: number): number => {
      const w = clearWater();
      setField(w, 'oil', cellIndex(64, 64), 0.5);
      setField(w, 'metabolite', cellIndex(60, 64), metabolite);
      const s = place(w, 'B07', 62.5, 64.5, { E });
      w.ents.cols.decisionTimer[s] = 0;
      stageSenseAndMove(w);
      expect(w.ents.cols.moveMode[s]).toBe(MOVE_TARGET);
      return w.ents.cols.targetX[s]!;
    };
    expect(target(60, 0.0667)).toBe(64.5); // avail 0.400 < 0.4167: the oil wins
    expect(target(60, 0.0754)).toBe(60.5); // avail 0.430 > 0.4167: the metabolite wins
    expect(target(35, 0.0667)).toBe(60.5); // at E = 35 the oil term is off
    expect(target(36, 0.0667)).toBe(64.5);
    // B08 and protein, the same rule.
    const w = clearWater();
    setField(w, 'protein', cellIndex(64, 64), 0.5);
    setField(w, 'broth', cellIndex(60, 64), 0.0667);
    const s = place(w, 'B08', 62.5, 64.5, { E: 60 });
    w.ents.cols.decisionTimer[s] = 0;
    stageSenseAndMove(w);
    expect(w.ents.cols.targetX[s]).toBe(64.5);
  });

  it("the reaction ledger credits a producer only in the cell or a four-neighbour, only when it released this enzyme, and follows it as it moves", () => {
    const w = clearWater();
    setField(w, 'oil', CELL, 0.5);
    setField(w, 'eOil', CELL, 0.5);
    const s = place(w, 'B07', 66.5, 64.5, { E: 60 }); // two cells east
    const madeBy = (): readonly string[] => {
      rebuildIndex(w);
      stageStructures(w); // stage 8: the producer releases (or not) and records it in its secreting bit set
      const p = buildInspector(w, { kind: 'cell', cell: CELL });
      const row = p.cell!.reactions!.find((r) => r.enzyme === 'oil')!;
      return row.madeBy;
    };
    const released = (): boolean => (w.ents.cols.flags[s]! & FLAG.secreting) !== 0;
    expect(madeBy()).toEqual([]);
    expect(released()).toBe(false); // no oil in its cell or a four-neighbour
    w.ents.cols.x[s] = 65.5; // east neighbour
    expect(madeBy()).toEqual(['B07']);
    expect(released()).toBe(true);
    // Nearby but not releasing (E ≤ 35: SECRETION_ENERGY_LOW): "Enzyme present", not "Made here by".
    w.ents.cols.E[s] = 35;
    expect(madeBy()).toEqual([]);
    expect(w.ents.cols.secretionCode[s]).toBe(R.SECRETION_ENERGY_LOW);
    // Nearby with energy but the activity there is saturated (≥ 1.0): not credited either.
    w.ents.cols.E[s] = 60;
    setField(w, 'eOil', cellIndex(65, 64), 1.0);
    expect(madeBy()).toEqual([]);
    expect(w.ents.cols.secretionCode[s]).toBe(R.SECRETION_SATURATED);
    setField(w, 'eOil', cellIndex(65, 64), 0);
    w.ents.cols.x[s] = 65.5;
    w.ents.cols.y[s] = 65.5; // diagonal: outside the four-neighbourhood (and no oil next to it, so it does not release)
    expect(madeBy()).toEqual([]);
    w.ents.cols.x[s] = 64.5;
    w.ents.cols.y[s] = 64.5; // in the cell
    expect(madeBy()).toEqual(['B07']);
    // Another producer's enzyme is not credited to it, and a B06 is credited for starch only.
    const b06 = place(w, 'B06', 64.5, 63.5);
    rebuildIndex(w);
    setField(w, 'eOil', CELL, 0.5); // undo the releases above, for the measured-value checks below
    const rows = buildInspector(w, { kind: 'cell', cell: CELL }).cell!.reactions!;
    expect(rows.map((r) => r.enzyme)).toEqual(['oil']);
    expect(w.ents.cols.alive[b06]).toBe(1);
    // The ledger row's measured values.
    const row = rows[0]!;
    expect(row.activity).toBe(0.5);
    expect(row.effectiveActivity).toBe(0.5);
    expect(row.substrate).toBe(0.5);
    expect(row.product).toBe('metabolite');
  });

  it('CT §3.2 prey rows: P01 eats B07/B08/Y02, P02 free B07/B08, P03 Y02, P04 B07/B08 only in sediment', () => {
    const w = clearWater();
    const sp = (id: string) => w.species[speciesIndex(w, id)]!;
    const b07 = place(w, 'B07', 40.5, 64.5);
    const b08 = place(w, 'B08', 42.5, 64.5);
    const y02 = place(w, 'Y02', 44.5, 64.5);
    for (const prey of [b07, b08, y02]) expect(preyAllowed(w, sp('P01'), prey)).toBe(true);
    expect(preyAllowed(w, sp('P02'), b07)).toBe(true);
    expect(preyAllowed(w, sp('P02'), b08)).toBe(true);
    expect(preyAllowed(w, sp('P02'), y02)).toBe(false);
    w.ents.cols.flags[b07] = w.ents.cols.flags[b07]! | FLAG.attached;
    expect(preyAllowed(w, sp('P02'), b07)).toBe(false); // "free" excludes attached
    w.ents.cols.flags[b07] = w.ents.cols.flags[b07] & ~FLAG.attached;
    expect(preyAllowed(w, sp('P03'), y02)).toBe(true);
    expect(preyAllowed(w, sp('P03'), b07)).toBe(false);
    expect(preyAllowed(w, sp('P03'), b08)).toBe(false);
    expect(preyAllowed(w, sp('P04'), b07)).toBe(false);
    expect(preyAllowed(w, sp('P04'), b08)).toBe(false);
    expect(preyAllowed(w, sp('P04'), y02)).toBe(false);
    w.grid.substrate[cellIndex(40, 64)] = SUB_SEDIMENT;
    w.grid.substrate[cellIndex(42, 64)] = SUB_SEDIMENT;
    expect(preyAllowed(w, sp('P04'), b07)).toBe(true);
    expect(preyAllowed(w, sp('P04'), b08)).toBe(true);
  });
});

describe('P3.6 producers in a running dish', () => {
  it('B07 next to oil releases enzyme that makes metabolite; it eats it', () => {
    const w = clearWater();
    patch(w, 'oil', 0.6);
    const s = place(w, 'B07', 64.5, 64.5, { E: 60 });
    run(w, 300);
    expect(w.conversionTotals.oil).toBeGreaterThan(0);
    expect(w.ents.cols.alive[s]).toBe(1);
    expect(w.ledger.energy.earned).toBeGreaterThan(0);
  });
});

describe('P3.6 food-access overlay (observation only; SPEC §10.8)', () => {
  it('with an organism selected: the carbon of the pools it can eat; with none: carbon enzymes made last second', () => {
    const w = clearWater();
    setField(w, 'metabolite', cellIndex(60, 64), 0.3);
    setField(w, 'broth', cellIndex(61, 64), 0.2);
    setField(w, 'oil', CELL, 1);
    setField(w, 'eOil', CELL, 1);
    const s = place(w, 'B07', 64.5, 64.5, { E: 60 });
    run(w, 10);
    const h = stateHash(w);
    const sel = packOverlay(w, 'foodAccess', null, { kind: 'entity', birthId: w.ents.cols.birthId[s]! })!;
    // Oilwick eats metabolite only: the broth cell reads 0, the metabolite cell what is there now.
    expect(sel.data[cellIndex(60, 64)]).toBeCloseTo(w.fields.metabolite![cellIndex(60, 64)]!, 6);
    expect(sel.data[cellIndex(61, 64)]).toBeCloseTo(w.fields.metabolite![cellIndex(61, 64)]!, 6);
    expect(w.fields.broth![cellIndex(61, 64)]).toBeGreaterThan(0.001); // broth is there (it spreads), but an Oilwick cannot eat it
    const none = packOverlay(w, 'foodAccess', null, null)!;
    expect(none.data[CELL]).toBeCloseTo(reactionInCell(w, 'oil', CELL).c, 6);
    expect(none.data[cellIndex(60, 64)]).toBe(0);
    expect(none.max).toBeCloseTo(reactionInCell(w, 'oil', CELL).c, 6);
    // A cell selection counts as no organism.
    expect(packOverlay(w, 'foodAccess', null, { kind: 'cell', cell: CELL })!.data[CELL]).toBe(none.data[CELL]);
    // Looking never changes the dish.
    expect(stateHash(w)).toBe(h);
  });
});
