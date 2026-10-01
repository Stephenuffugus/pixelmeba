/**
 * P3.7 E08 Debris feeder (SPEC §6.4, §6.5, §9 E08; CT §3.1, §7.1; D04 §5 "E08 Debris feeder", §13
 * "Detritus feeder captures live prey"; BUILD_DIRECTIVE P3.7, W4-11, W4-12, W4-14; src/sim/debrisFeeder.ts).
 *
 *  - Detritus intake only with an empty meal: a carrier with mealC = 0 on detritus eats it in stage 6
 *    (min(P, budget × avail(P)), ordinary ceiling × suitability); with a held meal it digests the meal and
 *    leaves the detritus; a plain Amoeba never eats detritus.
 *  - A capture in stage 5 fills the meal, so stage 6 takes the meal route on that tick: the detritus is
 *    untouched and no detritus flag is set.
 *  - Bound N moves with detritus carbon exactly (ΔdetritusN = Cs × detritusN / detritus), N + 0.05 Cs to
 *    the body, surplus bound N to the free pool; aerobic conversion (B 0.50, CO2 0.30, metabolite 0.20,
 *    O2 −0.30 per C, 30 E per C).
 *  - No new prey: the carrier may take exactly the species a plain Amoeba may, and a non-prey in contact
 *    is never captured.
 *  - Movement: with detritus in view and no prey it goes to the detritus (a plain Amoeba does not); with
 *    a prey in range it still pursues. The score is the max of F and the detritus score, never the sum.
 *  - FLAG.detritusIntake is set exactly on ticks whose stage 6 ate detritus (and drives "active now").
 *  - The ledger closes and Σ energy earned = 30 × Σ detritus eaten.
 *
 * Worlds: clear water (FIRST_DISH_V1 without stones, background sugar 0) under the shipped manifest plus
 * E06 and E08 (registryWith; the lead enables them after the wave).
 */
import { describe, expect, it } from 'vitest';
import { introduceOrganism } from '../../src/sim/commands';
import { DT } from '../../src/sim/constants';
import { debrisScore, withDebrisScore } from '../../src/sim/debrisFeeder';
import { FLAG, MOVE_PURSUE } from '../../src/sim/entities';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { moduleSummaries } from '../../src/sim/moduleView';
import { preyAllowed } from '../../src/sim/movement';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { rebuildIndex } from '../../src/sim/spatial';
import { run, step } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { fillField, registry, setField } from '../helpers/world';

const SHIPPED_MODULES = registry().manifest.enabledModules;
const REG = registryWith({ enabledModules: [...SHIPPED_MODULES, 'E06', 'E08'].sort() });

const X = 60.5;
const Y = 64.5;

function dish(): World {
  const base = REG.recipes.FIRST_DISH_V1!;
  const w = realizeRecipe(
    REG,
    { ...base, id: 'TEST_E08', removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0 }, mutationPreset: 'fixed' },
    { worldId: 'e08' },
  );
  w.settings.lid = 'closed';
  fillField(w, 'oxygen', 5);
  fillField(w, 'nutrient', 1);
  return w;
}

/** One organism at (x, y) carrying `modules`; E and a held meal are test state (the meal logged as input). */
function put(w: World, speciesId: string, x: number, y: number, modules: readonly string[] = [], state: { E?: number; mealC?: number; mealN?: number } = {}): number {
  const slot = introduceOrganism(w, speciesIndex(w, speciesId), cellIndex(Math.floor(x), Math.floor(y)), 'test', { modules, exactCenter: true });
  if (slot < 0) throw new Error('capacity');
  const c = w.ents.cols;
  c.x[slot] = x;
  c.y[slot] = y;
  if (state.E !== undefined) c.E[slot] = state.E; // test state (energy is not a material)
  if (state.mealC !== undefined) {
    c.mealC[slot] = state.mealC;
    w.ledger.inputs.c += state.mealC;
  }
  if (state.mealN !== undefined) {
    c.mealN[slot] = state.mealN;
    w.ledger.inputs.n += state.mealN;
  }
  rebuildIndex(w);
  return slot;
}

/** Detritus (and its bound N at `ratio` per C) on a square of cells around (cx, cy). */
function detritus(w: World, cx: number, cy: number, half: number, amount: number, ratio: number): void {
  for (let y = cy - half; y <= cy + half; y++) {
    for (let x = cx - half; x <= cx + half; x++) {
      setField(w, 'detritus', cellIndex(x, y), amount);
      setField(w, 'detritusN', cellIndex(x, y), amount * ratio);
    }
  }
}

function total(w: World, id: 'detritus' | 'detritusN' | 'nutrient' | 'co2' | 'metabolite' | 'oxygen'): number {
  const a = w.fields[id]!;
  let s = 0;
  for (const k of maskCells()) s += a[k]!;
  return s;
}

interface StageSix {
  readonly detBefore: number;
  readonly detAfter: number;
  readonly detNBefore: number;
  readonly detNAfter: number;
  readonly mealAfter5: number;
  readonly cell: number;
}

/** One tick, recording the stage 6 change of detritus and the carrier's meal after stage 5. */
function tickWatching(w: World, s: number): StageSix {
  let detBefore = 0;
  let detNBefore = 0;
  let mealAfter5 = 0;
  let detAfter = 0;
  let detNAfter = 0;
  let cell = -1;
  const c = w.ents.cols;
  step(w, {
    afterStage: (stage) => {
      if (stage === 5) {
        detBefore = total(w, 'detritus');
        detNBefore = total(w, 'detritusN');
        mealAfter5 = c.mealC[s]!;
        cell = cellIndex(Math.floor(c.x[s]!), Math.floor(c.y[s]!));
      }
      if (stage === 6) {
        detAfter = total(w, 'detritus');
        detNAfter = total(w, 'detritusN');
      }
    },
  });
  return { detBefore, detAfter, detNBefore, detNAfter, mealAfter5, cell };
}

describe('P3.7 E08 Debris feeder', () => {
  it('eats local detritus only with an empty meal, under the ordinary budget; a plain Amoeba never does', () => {
    const w = dish();
    detritus(w, 60, 64, 2, 2, 0.05);
    const s = put(w, 'P01', X, Y, ['E08'], { E: 50 });
    const c = w.ents.cols;
    const E0 = c.E[s]!;
    const B0 = c.B[s]!;
    const earned0 = w.ledger.energy.earned;
    const t = tickWatching(w, s);
    const Cs = t.detBefore - t.detAfter;
    expect(t.mealAfter5).toBe(0);
    expect(Cs).toBeGreaterThan(0);
    // The request is min(P, budget × avail(P)) with budget = q × suitability × dt (nutrient and O2 ample).
    const P = 2;
    const budget = profileOf(w, s).q * c.suitability[s]! * DT;
    expect(Cs).toBeCloseTo(Math.min(P, budget * (P / (P + 0.1))), 12);
    expect(c.B[s]! - B0).toBeCloseTo(0.5 * Cs, 12);
    expect(w.ledger.energy.earned - earned0).toBeCloseTo(30 * Cs, 9);
    expect(c.E[s]!).toBeLessThan(E0 + 30 * Cs + 1e-9); // stage 7 then charges upkeep
    expect(c.flags[s]! & FLAG.detritusIntake).not.toBe(0);
    expect(c.flags[s]! & FLAG.feeding).not.toBe(0);

    // A held meal has exclusive priority: the meal shrinks, the detritus stays.
    const m = dish();
    detritus(m, 60, 64, 2, 2, 0.05);
    const ms = put(m, 'P01', X, Y, ['E08'], { E: 90, mealC: 1, mealN: 0.05 });
    const tm = tickWatching(m, ms);
    expect(tm.detAfter).toBe(tm.detBefore);
    expect(tm.detNAfter).toBe(tm.detNBefore);
    expect(m.ents.cols.mealC[ms]!).toBeLessThan(1);
    expect(m.ents.cols.flags[ms]! & FLAG.detritusIntake).toBe(0);
    expect(m.ents.cols.limitCode[ms]).toBe(R.MEAL_DIGESTING);

    // A plain Amoeba (no E08) leaves detritus alone and has no prey here.
    const p = dish();
    detritus(p, 60, 64, 2, 2, 0.05);
    const ps = put(p, 'P01', X, Y, [], { E: 50 });
    const tp = tickWatching(p, ps);
    expect(tp.detAfter).toBe(tp.detBefore);
    expect(p.ents.cols.limitCode[ps]).toBe(R.PRED_NO_PREY);
  });

  it('a capture in stage 5 takes the meal route on the same tick: detritus untouched, no detritus flag', () => {
    const w = dish();
    detritus(w, 60, 64, 2, 2, 0.05);
    const s = put(w, 'P01', X, Y, ['E08'], { E: 50 });
    const prey = put(w, 'B01', X + 0.1, Y);
    const birth = w.ents.cols.birthId[prey]!;
    const t = tickWatching(w, s);
    const c = w.ents.cols;
    expect(w.ents.refValid(prey, birth)).toBe(false); // captured
    expect(t.mealAfter5).toBeGreaterThan(0); // stage 5 filled the meal
    expect(t.detAfter).toBe(t.detBefore); // no second ration from detritus
    expect(t.detNAfter).toBe(t.detNBefore);
    expect(c.flags[s]! & FLAG.detritusIntake).toBe(0);
    expect(c.flags[s]! & FLAG.feeding).not.toBe(0);
    expect(c.limitCode[s]).toBe(R.MEAL_DIGESTING);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('bound N moves with detritus carbon exactly; surplus bound N goes to the free pool; aerobic conversion', () => {
    const ratio = 0.15; // above the 0.05 per C the body keeps
    const w = dish();
    detritus(w, 60, 64, 2, 2, ratio);
    const s = put(w, 'P01', X, Y, ['E08'], { E: 50 });
    const c = w.ents.cols;
    const N0 = c.N[s]!;
    let nut5 = 0;
    let co25 = 0;
    let met5 = 0;
    let o25 = 0;
    let det5 = 0;
    let detN5 = 0;
    let out = { nut: 0, co2: 0, met: 0, o2: 0, det: 0, detN: 0 };
    step(w, {
      afterStage: (stage) => {
        if (stage === 5) {
          nut5 = total(w, 'nutrient');
          co25 = total(w, 'co2');
          met5 = total(w, 'metabolite');
          o25 = total(w, 'oxygen');
          det5 = total(w, 'detritus');
          detN5 = total(w, 'detritusN');
        }
        if (stage === 6) out = { nut: total(w, 'nutrient'), co2: total(w, 'co2'), met: total(w, 'metabolite'), o2: total(w, 'oxygen'), det: total(w, 'detritus'), detN: total(w, 'detritusN') };
      },
    });
    const Cs = det5 - out.det;
    expect(Cs).toBeGreaterThan(0);
    expect(detN5 - out.detN).toBeCloseTo(Cs * ratio, 12);
    expect(c.N[s]! - N0).toBeCloseTo(0.05 * Cs, 12);
    expect(out.nut - nut5).toBeCloseTo((ratio - 0.05) * Cs, 10); // sums over every dish cell
    expect(out.co2 - co25).toBeCloseTo(0.3 * Cs, 10); // sums over every dish cell
    expect(out.met - met5).toBeCloseTo(0.2 * Cs, 10); // sums over every dish cell
    expect(o25 - out.o2).toBeCloseTo(0.3 * Cs, 10); // sums over every dish cell
    expect(checkLedger(w).ok).toBe(true);
  });

  it('grants digestion, never new prey', () => {
    const w = dish();
    const carrier = put(w, 'P01', X, Y, ['E08'], { E: 50 });
    const plain = put(w, 'P01', X + 10, Y, [], { E: 50 });
    const sp = w.species[w.ents.cols.species[carrier]!]!;
    // Same prey decision as a plain Amoeba against one organism of every enabled species.
    const others: number[] = [];
    let k = 0;
    for (const id of REG.manifest.enabledSpecies) {
      if (id === 'V01') continue; // a field virus, never an organism
      const slot = put(w, id, 30.5 + (k % 10) * 3, 40.5 + Math.floor(k / 10) * 3);
      others.push(slot);
      k++;
    }
    for (const o of others) expect(preyAllowed(w, sp, o)).toBe(preyAllowed(w, w.species[w.ents.cols.species[plain]!]!, o));
    // A non-prey in contact (another Amoeba) is never captured.
    const q = dish();
    const qs = put(q, 'P01', X, Y, ['E08'], { E: 50 });
    const other = put(q, 'P02', X + 0.1, Y, [], { E: 50 });
    const ob = q.ents.cols.birthId[other]!;
    run(q, 20);
    expect(q.ents.refValid(other, ob)).toBe(true);
    expect(q.ents.cols.mealC[qs]).toBe(0);
  });

  it('movement: with detritus in view and no prey it goes to the detritus; a plain Amoeba does not', () => {
    const go = (mods: readonly string[]): number => {
      const w = dish();
      detritus(w, 63, 64, 0, 2, 0.05);
      const s = put(w, 'P01', X, Y, mods, { E: 90 });
      const c = w.ents.cols;
      let reached = -1;
      for (let t = 0; t < 120 && reached < 0; t++) {
        step(w);
        if (Math.floor(c.x[s]!) === 63 && Math.floor(c.y[s]!) === 64) reached = t;
      }
      return reached;
    };
    expect(go(['E08'])).toBeGreaterThanOrEqual(0);
    expect(go([])).toBe(-1);
  });

  it('movement: with a prey in range it still pursues the prey, not the detritus', () => {
    const w = dish();
    detritus(w, 63, 64, 0, 2, 0.05); // detritus 3 cells east
    const s = put(w, 'P01', X, Y, ['E08'], { E: 50 });
    const prey = put(w, 'B01', X - 3, Y); // prey 3 cells west, within sensing 3
    const c = w.ents.cols;
    let pursued = false;
    for (let t = 0; t < 10; t++) {
      step(w);
      if (c.moveMode[s] === MOVE_PURSUE && c.preySlot[s] === prey) pursued = true;
    }
    expect(pursued).toBe(true);
    expect(c.x[s]!).toBeLessThan(X);
  });

  it('the food score is the max of F and the detritus score, never the sum', () => {
    const w = dish();
    const cell = cellIndex(70, 64);
    setField(w, 'detritus', cell, 0.1); // avail = 0.1 / (0.1 + 0.1) = 0.5
    const carrier = profileOf(w, put(w, 'P01', X, Y, ['E08']));
    const plain = profileOf(w, put(w, 'P01', X + 5, Y));
    expect(debrisScore(w, carrier, cell)).toBeCloseTo(0.5, 15);
    expect(debrisScore(w, plain, cell)).toBe(0);
    expect(withDebrisScore(w, carrier, cell, 0.6)).toBe(0.6); // not 1.1
    expect(withDebrisScore(w, carrier, cell, 0.2)).toBeCloseTo(0.5, 15); // not 0.7
    expect(withDebrisScore(w, carrier, cell, 0)).toBeCloseTo(0.5, 15);
    expect(withDebrisScore(w, plain, cell, 0.2)).toBe(0.2);
  });

  it('FLAG.detritusIntake is set exactly on detritus ticks; the ledger closes and Σ earned = 30 E per C', () => {
    const w = dish();
    // A thin patch that runs out, so the run has both detritus ticks and empty ticks.
    detritus(w, 60, 64, 0, 0.03, 0.05);
    const s = put(w, 'P01', X, Y, ['E08'], { E: 50 });
    const c = w.ents.cols;
    const earned0 = w.ledger.energy.earned;
    let eaten = 0;
    let on = 0;
    let off = 0;
    for (let t = 0; t < 200; t++) {
      const r = tickWatching(w, s);
      const ate = r.detBefore - r.detAfter;
      eaten += ate;
      const flag = (c.flags[s]! & FLAG.detritusIntake) !== 0;
      expect(flag).toBe(ate > 0);
      expect(moduleSummaries(w, s).find((m) => m.id === 'E08')!.activeNow).toBe(flag);
      if (flag) on++;
      else off++;
    }
    expect(on).toBeGreaterThan(0);
    expect(off).toBeGreaterThan(0);
    expect(w.ledger.energy.earned - earned0).toBeCloseTo(30 * eaten, 9);
    expect(checkLedger(w).ok).toBe(true);
  });
});
