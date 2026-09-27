/**
 * G1 fixture: enzyme source (P1.1; SPEC §5; CT §4, §10.2 EXP_A). Starch-enzyme conversion conserves
 * carbon and bound nutrient; no substrate ⇒ no conversion and no secretion cost; Crumbsmiths pay
 * 0.40 E/s for secretion; and the disclosed bootstrap sugar is separately attributable: in an
 * EXP_A-like dish the logged bootstrap input (a ledger entry of its own) and the enzyme-derived sugar
 * (conversion totals) are reported separately and reconcile exactly with the sugar and starch left.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeDef } from '../../src/sim/content/schema';
import { DT, ENZYME_EMIT_COST } from '../../src/sim/constants';
import { stageConversion } from '../../src/sim/conversion';
import { cellIndex, diskCells, inMask, maskCells } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { step, run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
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
    // The observation-only catalysis record (renderer dust) marks exactly this cell, with the amount.
    expect(w.catalysisCells[CELL]).toBeCloseTo(0.01, 6);
    let marked = 0;
    for (let i = 0; i < w.catalysisCells.length; i++) if (w.catalysisCells[i]! > 0) marked++;
    expect(marked).toBe(1);
    // It is not simulation state: clearing it changes nothing the hash sees.
    const h = stateHash(w);
    w.catalysisCells.fill(0);
    expect(stateHash(w)).toBe(h);
    // No enzyme activity next time ⇒ no dust left over from the previous tick.
    setField(w, 'eStarch', CELL, 0);
    stageConversion(w);
    expect(w.catalysisCells[CELL]).toBe(0);
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

  it("the producer's own energy pays the secretion: 0.40 × dt on every emitting tick, never otherwise", () => {
    const w = clearWater();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) setField(w, 'starch', cellIndex(64 + dx, 64 + dy), 0.6);
    const s = place(w, 'B06', 64.5, 64.5, { E: 60 });
    const e = w.ledger.energy;
    let emitting = 0;
    let idle = 0;
    for (let t = 0; t < 600 && w.ents.cols.alive[s] === 1; t++) {
      const before = { E: w.ents.cols.E[s]!, m: e.maintenance, mv: e.movement, sec: e.secretion, earned: e.earned, other: e.other, div: e.division };
      step(w);
      if (w.ents.cols.alive[s] !== 1) break;
      const dSec = e.secretion - before.sec;
      // One organism in the dish: every ledger delta is its own.
      const dE = w.ents.cols.E[s]! - before.E;
      const expected = e.earned - before.earned - (e.maintenance - before.m) - (e.movement - before.mv) - dSec - (e.other - before.other) - (e.division - before.div);
      expect(dE).toBeCloseTo(expected, 10);
      if (w.ents.cols.secretionCode[s] === R.SECRETING) {
        expect(dSec).toBeCloseTo(ENZYME_EMIT_COST * DT, 12);
        emitting++;
      } else {
        expect(dSec).toBe(0);
        idle++;
      }
    }
    // Both branches were exercised: it emitted while E > 35, then stopped once E fell to the threshold.
    expect(emitting).toBeGreaterThan(10);
    expect(idle).toBeGreaterThan(0);
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

// ------------------------------------------------------------ bootstrap sugar attribution (EXP_A)

const PATCH_CENTER: [number, number] = [64, 64];
const PATCH_R = 3;
const EXP_A_TICKS = 1800; // 180 s
const BOOTSTRAP_LABEL = 'Bootstrap sugar';
const STARCH_LABEL = 'Starch';

/**
 * CT §10.2 EXP_A: clear water (§9.1 environment, no stones, background sugar 0); 12 B06 within r 3
 * of (64,64); starch 0.60/cell and a disclosed 0.10 sugar bootstrap/cell in that patch (two patches,
 * so each is its own logged input); Fixed Traits; seed 104729. The duplicate omits the starch.
 */
function expA(withStarch: boolean): World {
  const patch = (add: RecipeDef['fieldPatches'][number]['add'], label: string): RecipeDef['fieldPatches'][number] => ({
    center: PATCH_CENTER,
    radius: PATCH_R,
    substrate: 'water',
    add,
    set: {},
    label,
  });
  return clearWater({
    id: withStarch ? 'TEST_EXP_A' : 'TEST_EXP_A_NO_STARCH',
    seed: 104729,
    mutationPreset: 'fixed',
    fieldPatches: [...(withStarch ? [patch({ starch: 0.6 }, STARCH_LABEL)] : []), patch({ sugar: 0.1 }, BOOTSTRAP_LABEL)],
    founders: [{ species: 'B06', count: 12, center: PATCH_CENTER, radius: PATCH_R, modules: [], moduleAssignment: 'all' }],
  });
}

function fieldTotal(w: World, id: 'sugar' | 'starch' | 'sugarN'): number {
  const arr = w.fields[id]!;
  let s = 0;
  for (const cell of maskCells()) s += arr[cell]!;
  return s;
}

interface ExpAReport {
  readonly bootstrapInput: number;
  readonly starchInput: number;
  readonly enzymeDerived: number;
  readonly consumed: number;
  readonly sugarLeft: number;
  readonly starchLeft: number;
  readonly births: number;
  readonly alive: number;
  readonly secretionEnergy: number;
}

function runExpA(withStarch: boolean): ExpAReport {
  const w = expA(withStarch);
  const cells = diskCells(PATCH_CENTER[0], PATCH_CENTER[1], PATCH_R).filter((i) => inMask(i % 128, Math.floor(i / 128)));
  const entry = (label: string) => w.ledger.entries.filter((e) => e.source.endsWith(`:${label}`));
  const boot = entry(BOOTSTRAP_LABEL);
  const starch = entry(STARCH_LABEL);
  // Each input is logged once, under its own source, for exactly what was placed.
  expect(boot).toHaveLength(1);
  expect(boot[0]!.c).toBeCloseTo(0.1 * cells.length, 12);
  expect(starch).toHaveLength(withStarch ? 1 : 0);
  if (withStarch) expect(starch[0]!.c).toBeCloseTo(0.6 * cells.length, 12);
  expect(fieldTotal(w, 'sugar')).toBeCloseTo(boot[0]!.c, 12);
  expect(aliveOf(w, 'B06')).toHaveLength(12);

  // Attribute every change of the sugar pool to the stage that made it.
  let fromEnzyme = 0;
  let tallySum = 0;
  let consumed = 0;
  let otherStages = 0;
  for (let t = 0; t < EXP_A_TICKS; t++) {
    let prev = fieldTotal(w, 'sugar');
    step(w, {
      afterStage: (stage, world) => {
        const now = fieldTotal(world, 'sugar');
        const d = now - prev;
        prev = now;
        if (stage === 3) {
          fromEnzyme += d;
          tallySum += world.conversionTally.starch;
          expect(d).toBeCloseTo(world.conversionTally.starch, 12);
        } else if (stage === 6) {
          consumed -= d;
          expect(d).toBeLessThanOrEqual(0); // only eaten here: no photosynthesizers in this dish
        } else otherStages += Math.abs(d);
      },
    });
    if (t % 300 === 299) expect(checkLedger(w).ok, `ledger at tick ${w.tick}`).toBe(true);
  }
  expect(otherStages).toBeLessThan(1e-9); // diffusion and every other stage conserve sugar
  expect(tallySum).toBeCloseTo(w.conversionTotals.starch, 10);
  expect(fromEnzyme).toBeCloseTo(w.conversionTotals.starch, 9);
  expect(checkLedger(w).ok).toBe(true);
  return {
    bootstrapInput: boot[0]!.c,
    starchInput: withStarch ? starch[0]!.c : 0,
    enzymeDerived: w.conversionTotals.starch,
    consumed,
    sugarLeft: fieldTotal(w, 'sugar'),
    starchLeft: fieldTotal(w, 'starch'),
    births: w.events.totals.birth ?? 0,
    alive: aliveOf(w, 'B06').length,
    secretionEnergy: w.ledger.energy.secretion,
  };
}

function describeReport(tag: string, r: ExpAReport): string {
  return (
    `${tag}: bootstrap ${r.bootstrapInput.toFixed(4)} C, enzyme-derived ${r.enzymeDerived.toFixed(4)} C, ` +
    `consumed ${r.consumed.toFixed(4)} C, sugar left ${r.sugarLeft.toFixed(4)}, starch ${r.starchInput.toFixed(4)} → ${r.starchLeft.toFixed(4)}, ` +
    `births ${r.births}, B06 alive ${r.alive} (12 founders), secretion ${r.secretionEnergy.toFixed(2)} E`
  );
}

describe('G1 enzyme source — bootstrap sugar separately attributable (EXP_A, 180 s)', () => {
  it('with starch: bootstrap input and enzyme-derived sugar are reported separately and reconcile exactly', () => {
    const r = runExpA(true);
    expect(r.enzymeDerived).toBeGreaterThan(0);
    expect(r.secretionEnergy).toBeGreaterThan(0);
    // Sugar balance: what is left = bootstrap + enzyme-derived − eaten.
    expect(r.sugarLeft).toBeCloseTo(r.bootstrapInput + r.enzymeDerived - r.consumed, 9);
    // Starch balance: every unit of enzyme-derived sugar came out of the logged starch input.
    expect(r.starchLeft).toBeCloseTo(r.starchInput - r.enzymeDerived, 9);
    expect(r.enzymeDerived).toBeLessThanOrEqual(r.starchInput);
    console.info(describeReport('EXP_A with starch', r));
  });

  it('with the starch omitted: the same logged bootstrap, and zero enzyme-derived sugar', () => {
    const r = runExpA(false);
    expect(r.enzymeDerived).toBe(0);
    expect(r.secretionEnergy).toBe(0);
    expect(r.starchInput).toBe(0);
    expect(r.starchLeft).toBe(0);
    expect(r.sugarLeft).toBeCloseTo(r.bootstrapInput - r.consumed, 9);
    expect(r.consumed).toBeLessThanOrEqual(r.bootstrapInput + 1e-12);
    console.info(describeReport('EXP_A starch omitted', r));
  });
});
