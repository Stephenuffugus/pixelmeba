/**
 * Phase 5 E2-SHELLS (P5.3 shell half; SPEC §6.5, §6.8, §6.9, §7.11; CT §1.1, §12.3; D-0117).
 *
 * A02 Glasswheel and P05 Shellglider bind 0.10 silicate per unit of new biomass. The silicate need
 * (0.10 × 0.50·C) is allocated per cell with nutrient and oxygen from the stage 6 snapshot, and a shell
 * builder's limiting fraction is L = min(fracN, fracO, fracSi); every other organism keeps min(fracN,
 * fracO) and never reads silicate. Inoculation adds 0.10 B0' bound mineral as a mineral input, division
 * splits it, death and predation send all of it to the cell's grit, a sample carries it.
 *
 * NOTHING is enabled (D-0104): A02, P05, M02, M12 and the silicate system are reached only through
 * the test registry REG below. SHELL is not yet in IMPLEMENTED_NATIVE_ABILITIES (the lead appends it
 * at integration), so REG uses allowUnimplemented for A02 and P05.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import { BIOMASS_FRACTION, SHELL_MINERAL_PER_BIOMASS } from '../../src/sim/constants';
import { ENTITY_COLUMNS } from '../../src/sim/entities';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex } from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { killEntity } from '../../src/sim/maintenance';
import { R } from '../../src/sim/reasons';
import { sampleTotals } from '../../src/sim/sampleSlot';
import { stateHash } from '../../src/sim/serialize';
import { rebuildIndex } from '../../src/sim/spatial';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { aliveOf, clearWater, fillField, place, registry } from '../helpers/world';

const SHIPPED = registry().manifest;
/** Shipped manifest + A02, P05, M02, M12 and 'silicate' (allowUnimplemented: SHELL is appended by the lead). */
const REG = registryWith(
  {
    enabledSpecies: [...SHIPPED.enabledSpecies, 'A02', 'P05'].sort(),
    enabledSystems: [...SHIPPED.enabledSystems, 'silicate'].sort() as SystemFlag[],
    enabledMaterials: [...SHIPPED.enabledMaterials, 'M02', 'M12'].sort(),
  },
  { allowUnimplemented: true },
);
const meta = { name: 'shells', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
const X = 64.5;
const Y = 64.5;
const CELL = cellIndex(64, 64);

let seq = 0;
function cmd(w: World, payload: CommandPayload) {
  return applyNow(w, `shell-${++seq}`, payload).result!;
}

/** Closed-lid clear water under REG, uniform light, silicate filled uniformly (ledger re-based). */
function dish(silicate: number, light = 1, overrides: Parameters<typeof clearWater>[0] = {}): World {
  const w = clearWater({ lid: 'closed', ...overrides }, REG);
  w.grid.lightBase.fill(light);
  w.grid.geometryVersion++;
  fillField(w, 'silicate', silicate);
  return w;
}

/** Stage 5 → stage 6 deltas of one tick for the listed slots, and the silicate of their cell. */
function stepMeasured(w: World, slots: readonly number[], cell = CELL) {
  const c = w.ents.cols;
  let B5: number[] = [];
  let M5: number[] = [];
  let si5 = 0;
  let B6: number[] = [];
  let M6: number[] = [];
  let si6 = 0;
  let meal5: number[] = [];
  let meal6: number[] = [];
  step(w, {
    afterStage: (stage) => {
      if (stage === 5) {
        B5 = slots.map((s) => c.B[s]!);
        M5 = slots.map((s) => c.boundMineral[s]!);
        meal5 = slots.map((s) => c.mealC[s]!);
        si5 = w.fields.silicate![cell]!;
      } else if (stage === 6) {
        B6 = slots.map((s) => c.B[s]!);
        M6 = slots.map((s) => c.boundMineral[s]!);
        meal6 = slots.map((s) => c.mealC[s]!);
        si6 = w.fields.silicate![cell]!;
      }
    },
  });
  return {
    dB: slots.map((_, k) => B6[k]! - B5[k]!),
    dM: slots.map((_, k) => M6[k]! - M5[k]!),
    dMeal: slots.map((_, k) => meal6[k]! - meal5[k]!),
    dSi: si6 - si5,
  };
}

async function roundTrip(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  const loaded = (await loadSaveFile(text)).world;
  expect(stateHash(loaded)).toBe(stateHash(w));
  return loaded;
}

/** Round trip, then both copies run 50 ticks and still agree. */
async function roundTripAndContinue(w: World): Promise<void> {
  const loaded = await roundTrip(w);
  run(w, 50);
  run(loaded, 50);
  expect(stateHash(loaded)).toBe(stateHash(w));
}

describe('E2-SHELLS: silicate binding in stage 6', () => {
  it('an A02 photosynthesizing with ample silicate binds exactly 0.10 × the biomass gained, taken from its cell', async () => {
    const w = dish(0.5);
    const a = place(w, 'A02', X, Y);
    expect(w.ents.cols.boundMineral[a]).toBeCloseTo(0.1 * 2, 15); // inoculation input (commands.ts)
    let grew = 0;
    for (let t = 0; t < 30; t++) {
      const m = stepMeasured(w, [a]);
      expect(m.dB[0]!).toBeGreaterThan(0);
      grew++;
      expect(Math.abs(m.dM[0]! / m.dB[0]! - SHELL_MINERAL_PER_BIOMASS) / SHELL_MINERAL_PER_BIOMASS).toBeLessThan(1e-12);
      expect(Math.abs(-m.dSi - m.dM[0]!) / m.dM[0]!).toBeLessThan(1e-12);
      expect(w.ents.cols.limitCode[a]).not.toBe(R.SILICATE_LIMITED);
    }
    expect(grew).toBe(30);
    expect(checkLedger(w).ok).toBe(true);
    await roundTripAndContinue(w); // after binding
  });

  it('a shell builder in a world without the silicate field is refused loudly in stage 6, never fed as if silicate were free', () => {
    // The registry refuses SHELL without 'silicate' and the import refuses such a dish (saveFile.ts), so
    // this state is constructed: a REG world whose silicate field is then removed.
    const w = dish(0.5);
    place(w, 'A02', X, Y);
    run(w, 2);
    delete (w.fields as Partial<Record<string, Float64Array>>).silicate;
    expect(() => step(w)).toThrow(/^stageIntake: shell builder A02 in a world without the silicate system$/);
  });

  it('with silicate 0 an A02 does not grow at all and reports SILICATE_LIMITED with value 0', async () => {
    const w = dish(0);
    const a = place(w, 'A02', X, Y);
    const c = w.ents.cols;
    const co2Before = computeTotals(w).breakdown.co2!;
    run(w, 40);
    expect(c.B[a]).toBe(2);
    expect(c.boundMineral[a]).toBe(0.1 * 2);
    expect(c.lastIntakeTick[a]).toBe(-1);
    expect(c.limitCode[a]).toBe(R.SILICATE_LIMITED);
    expect(c.limitValue[a]).toBe(0);
    expect(computeTotals(w).breakdown.co2).toBe(co2Before); // no carbon fixed
    expect(checkLedger(w).ok).toBe(true);
    await roundTripAndContinue(w); // after a limited tick
  });

  it('with silicate at half the need growth is halved and the value is 0.5; two A02 in one cell share proportionally', () => {
    // Twin dishes: the carbon request C does not depend on silicate, so the ample twin gives the need.
    const build = (si: number) => {
      const w = dish(si);
      const slots = [place(w, 'A02', 64.3, 64.3), place(w, 'A02', 64.7, 64.7)];
      return { w, slots };
    };
    const ample = build(1);
    const mA = stepMeasured(ample.w, ample.slots);
    const need = mA.dM[0]! + mA.dM[1]!; // each binds its whole need when fracSi = 1
    expect(need).toBeGreaterThan(0);
    const half = build(need / 2); // a uniform field: diffusion leaves the cell at need/2 until stage 6
    const mH = stepMeasured(half.w, half.slots);
    const c = half.w.ents.cols;
    for (let k = 0; k < 2; k++) {
      expect(mH.dB[k]! / mA.dB[k]!).toBeCloseTo(0.5, 12);
      expect(mH.dM[k]! / mA.dM[k]!).toBeCloseTo(0.5, 12);
      expect(c.limitCode[half.slots[k]!]).toBe(R.SILICATE_LIMITED);
      expect(c.limitValue[half.slots[k]!]).toBeCloseTo(0.5, 12);
    }
    // The cell's silicate is used up exactly (to roundoff).
    expect(half.w.fields.silicate![CELL]).toBeLessThan(1e-15);
    expect(checkLedger(half.w).ok).toBe(true);
  });

  it('a P05 eating a meal binds silicate the same way on the meal route', () => {
    const w = dish(0.5);
    const p = place(w, 'P05', X, Y);
    place(w, 'B01', X, Y); // P05's record lists B01 as prey (any)
    const c = w.ents.cols;
    let t = 0;
    while (c.mealC[p]! <= 0 && t++ < 300) step(w);
    expect(c.mealC[p]!).toBeGreaterThan(0);
    expect(w.events.totals.capture ?? 0).toBeGreaterThan(0);
    let measured = 0;
    for (let k = 0; k < 10 && c.mealC[p]! > 0; k++) {
      const m = stepMeasured(w, [p], cellIndex(Math.floor(c.x[p]!), Math.floor(c.y[p]!)));
      if (m.dB[0]! <= 0) continue;
      expect(m.dMeal[0]!).toBeLessThan(0); // the meal route fed it
      expect(Math.abs(m.dM[0]! / m.dB[0]! - SHELL_MINERAL_PER_BIOMASS) / SHELL_MINERAL_PER_BIOMASS).toBeLessThan(1e-12);
      measured++;
    }
    expect(measured).toBeGreaterThan(0);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('a P05 holding a meal with silicate 0 does not grow and reports SILICATE_LIMITED', () => {
    const w = dish(0);
    const p = place(w, 'P05', X, Y);
    const c = w.ents.cols;
    // Test-only meal, logged as an input.
    c.mealC[p] = 2;
    c.mealN[p] = 0.2;
    w.ledger.inputs.c += 2;
    w.ledger.inputs.n += 0.2;
    step(w);
    expect(c.B[p]).toBe(4);
    expect(c.mealC[p]).toBe(2);
    expect(c.limitCode[p]).toBe(R.SILICATE_LIMITED);
    expect(c.limitValue[p]).toBe(0);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('a B01 in the same cell as a silicate-starved A02 still feeds: only shell builders are limited by silicate', () => {
    const w = dish(0, 1, { backgroundOverrides: { sugar: 0.5 } });
    const a = place(w, 'A02', 64.3, 64.3);
    const b = place(w, 'B01', 64.7, 64.7);
    const c = w.ents.cols;
    const m = stepMeasured(w, [a, b]);
    expect(c.limitCode[a]).toBe(R.SILICATE_LIMITED);
    expect(c.limitValue[a]).toBe(0);
    expect(m.dB[0]).toBe(0);
    expect(m.dB[1]!).toBeGreaterThan(0);
    expect(c.limitCode[b]).not.toBe(R.SILICATE_LIMITED);
    expect(c.boundMineral[b]).toBe(0);
  });

  it("a B01's limiting fraction never reads silicate: silicate 0 and 1 give identical entity columns", () => {
    const build = (si: number) => {
      const w = dish(si, 1, { backgroundOverrides: { sugar: 0.5 } });
      for (let k = 0; k < 12; k++) place(w, 'B01', 50.5 + k * 2, 60.5 + (k % 3));
      return w;
    };
    const w0 = build(0);
    const w1 = build(1);
    run(w0, 300);
    run(w1, 300);
    expect(w1.ents.highWater).toBe(w0.ents.highWater);
    expect(w0.events.totals.birth ?? 0).toBeGreaterThan(0);
    expect(w1.events.totals.birth).toBe(w0.events.totals.birth);
    for (const [name] of ENTITY_COLUMNS) {
      const a = w0.ents.cols[name];
      const b = w1.ents.cols[name];
      for (let i = 0; i < w0.ents.highWater; i++) {
        if (!Object.is(a[i], b[i])) throw new Error(`column ${name} slot ${i}: ${a[i]} vs ${b[i]}`);
      }
    }
  });
});

describe('E2-SHELLS: shell mineral through inoculation, division, death, predation and Sample', () => {
  it('inoculation of A02 adds 0.10 B0\' bound mineral each as a mineral input', () => {
    const w = dish(0);
    const before = w.ledger.inputs.m;
    const res = cmd(w, { kind: 'inoculate', speciesId: 'A02', x: X, y: Y, radius: 3, count: 4 });
    expect(res.accepted).toBe(4);
    const a02 = aliveOf(w, 'A02');
    expect(a02).toHaveLength(4);
    const b0 = REG.species.A02!.b0;
    for (const s of a02) expect(w.ents.cols.boundMineral[s]).toBe(0.1 * b0);
    expect(w.ledger.inputs.m - before).toBeCloseTo(4 * 0.1 * b0, 14);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('division splits boundMineral equally', async () => {
    const w = dish(0); // no binding this tick: the split is exact
    const a = place(w, 'A02', X, Y, { B: 4.2, E: 95, age: 200 });
    const c = w.ents.cols;
    c.boundMineral[a] = 0.37;
    w.ledger.inputs.m += 0.37 - 0.2;
    let births = 0;
    for (let t = 0; t < 20 && births === 0; t++) {
      step(w);
      births = w.events.totals.birth ?? 0;
    }
    expect(births).toBe(1);
    const both = aliveOf(w, 'A02');
    expect(both).toHaveLength(2);
    expect(c.boundMineral[both[0]!]).toBe(0.37 / 2);
    expect(c.boundMineral[both[1]!]).toBe(0.37 / 2);
    expect(checkLedger(w).ok).toBe(true);
    await roundTripAndContinue(w); // after division
  });

  it('death of an A02 puts its whole boundMineral into its cell as grit', async () => {
    const w = dish(0);
    const a = place(w, 'A02', X, Y);
    const c = w.ents.cols;
    c.age[a] = REG.species.A02!.maxAge - 0.05; // dies of age in this tick's stage 7
    const mineral = c.boundMineral[a]!;
    let gritAfter7 = -1;
    step(w, { afterStage: (s) => (s === 7 ? (gritAfter7 = w.fields.grit![CELL]!) : undefined) });
    expect(c.alive[a]).toBe(0);
    expect(gritAfter7).toBe(mineral);
    expect(checkLedger(w).ok).toBe(true);
    await roundTripAndContinue(w); // after a death to grit
  });

  it('killEntity sends the whole shell mineral to grit (direct)', () => {
    const w = dish(0);
    const a = place(w, 'A02', X, Y);
    const m = w.ents.cols.boundMineral[a]!;
    killEntity(w, a, R.DEATH_STARVATION);
    expect(w.fields.grit![CELL]).toBe(m);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('predation of an A02 puts its whole boundMineral into the prey cell as grit', () => {
    const w = dish(0);
    const a = place(w, 'A02', X, Y);
    place(w, 'P01', X, Y); // P01's record lists A02 as prey (any)
    const c = w.ents.cols;
    const aBirth = c.birthId[a]!;
    let mineralAt4 = 0;
    let cellAt4 = CELL;
    let gritAt4 = 0;
    let gritAt5 = 0;
    let captured = false;
    for (let t = 0; t < 300 && !captured; t++) {
      step(w, {
        afterStage: (s) => {
          if (s === 4 && c.alive[a] === 1 && c.birthId[a] === aBirth) {
            mineralAt4 = c.boundMineral[a]!;
            cellAt4 = cellIndex(Math.floor(c.x[a]!), Math.floor(c.y[a]!));
            gritAt4 = w.fields.grit![cellAt4]!;
          } else if (s === 5) {
            gritAt5 = w.fields.grit![cellAt4]!;
            captured = c.alive[a] !== 1 || c.birthId[a] !== aBirth;
          }
        },
      });
    }
    expect(captured).toBe(true);
    expect(w.events.totals.capture ?? 0).toBe(1);
    expect(mineralAt4).toBe(0.2);
    expect(gritAt5 - gritAt4).toBe(mineralAt4);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('a sample of an A02 carries its boundMineral and Transfer keeps it', () => {
    const w = dish(0);
    const a = place(w, 'A02', X, Y);
    const c = w.ents.cols;
    c.boundMineral[a] = 0.31;
    w.ledger.inputs.m += 0.31 - 0.2;
    const mBefore = computeTotals(w).m;
    expect(cmd(w, { kind: 'sampleTake', x: X, y: Y, radius: 1, mode: 'life' }).accepted).toBeGreaterThan(0);
    expect(aliveOf(w, 'A02')).toHaveLength(0);
    expect(sampleTotals(w.sample).m).toBe(0.31);
    expect(computeTotals(w).m).toBeCloseTo(mBefore, 14);
    expect(cmd(w, { kind: 'sampleTransfer', dx: 10, dy: 0 }).accepted).toBeGreaterThan(0);
    rebuildIndex(w);
    const moved = aliveOf(w, 'A02');
    expect(moved).toHaveLength(1);
    expect(c.boundMineral[moved[0]!]).toBe(0.31);
    expect(Math.floor(c.x[moved[0]!]!)).toBe(74);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('BIOMASS_FRACTION is the 0.50 of needSi = 0.10 × 0.50·C', () => {
    expect(BIOMASS_FRACTION).toBe(0.5);
    expect(SHELL_MINERAL_PER_BIOMASS).toBe(0.1);
  });
});
