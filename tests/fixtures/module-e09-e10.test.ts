/**
 * P3.7 E09 Protein release and E10 Matrix builder (SPEC §5.3, §7.1, §9 E09/E10; CT §7.1, §12.6;
 * D04 §6 E09/E10, §9, §13 "Two matrix builders fill the same cell"; D-0045; src/sim/{secretion,
 * matrixBuilder,construction}.ts).
 *
 *  - E09 pays exactly 0.40 E/s × 0.1 s = 0.04 E per emitting tick into ledger.energy.secretion and
 *    emits 0.002 eProtein; each refusal code (SECRETION_ENERGY_LOW at E = 35, SECRETION_NO_SUBSTRATE,
 *    SECRETION_SATURATED at local activity 1.0) costs nothing.
 *  - A B04 + E09 never takes broth: its foods are B04's, and on a broth-only dish it never feeds.
 *  - D-0045 two-producer cases: an F02 (native starch) gaining E09, and a B04 with E01 + E09. The
 *    secreting column is a producer bit set (starch 1, protein 4): each bit is set by its own producer
 *    only, SECRETING shows if either released, and the ledger closes.
 *  - E10: two E10 builders and a B02 in one cell never push film above 0.50; the scaling is exactly
 *    proportional; each E10 builder is charged 2 E × accepted C (B02 0); the unused reservation is
 *    returned; N moves at N × accepted / B; the request never reserves more energy than remains.
 *  - Diverted body carbon delays division: the same carrier divides when its cell's film is full and
 *    does not when it builds.
 *  - The module card: E09 / E10 "active now" read the protein bit and an accepted request.
 *
 * Worlds: clear water (FIRST_DISH_V1 without stones, background sugar 0) under the shipped manifest
 * plus E09 and E10 (registryWith; the lead enables them after the wave). F02 is in the shipped manifest.
 * Test-only state (E, B, age, fields, film clocks, substrate) is set directly and labelled; material
 * overrides are logged as ledger inputs.
 */
import { describe, expect, it } from 'vitest';
import { ActionContext, STAGE8_ACTIONS } from '../../src/sim/actions';
import { introduceOrganism } from '../../src/sim/commands';
import { DT, FILM_CAP } from '../../src/sim/constants';
import { FLAG } from '../../src/sim/entities';
import { cellIndex, SUBSTRATE_CODES } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { matrixBuiltNow, matrixRequest } from '../../src/sim/matrixBuilder';
import { moduleSummaries } from '../../src/sim/moduleView';
import { profileOf } from '../../src/sim/profiles';
import { R, REASONS } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { PRODUCER_BIT } from '../../src/sim/secretion';
import { rebuildIndex } from '../../src/sim/spatial';
import { stageStructures } from '../../src/sim/structures';
import { step } from '../../src/sim/tick';
import { divisionBlocker } from '../../src/sim/births';
import { speciesIndex, type World } from '../../src/sim/world';
import { moduleText } from '../../src/ui/strings/modules';
import { registryWith } from '../helpers/registry';
import { aliveOf, registry, setField } from '../helpers/world';

const REG = registryWith({ enabledModules: [...registry().manifest.enabledModules, 'E09', 'E10'].sort() });

type State = Partial<Record<'B' | 'N' | 'E' | 'H' | 'age', number>>;

function dish(): World {
  const base = REG.recipes.FIRST_DISH_V1!;
  return realizeRecipe(
    REG,
    { ...base, id: 'TEST_E09_E10', removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0 }, mutationPreset: 'fixed' },
    { worldId: 'e09-e10' },
  );
}

/** Place one organism carrying `modules` at the centre of (x, y) (material overrides logged as inputs). */
function placeWith(w: World, speciesId: string, x: number, y: number, modules: readonly string[], state: State = {}): number {
  const slot = introduceOrganism(w, speciesIndex(w, speciesId), cellIndex(x, y), 'test', { modules, exactCenter: true });
  if (slot < 0) throw new Error('capacity');
  const c = w.ents.cols;
  c.x[slot] = x + 0.5;
  c.y[slot] = y + 0.5;
  for (const key of ['B', 'N', 'E', 'H', 'age'] as const) {
    const v = state[key];
    if (v === undefined) continue;
    if (key === 'B') w.ledger.inputs.c += v - c.B[slot]!;
    if (key === 'N') w.ledger.inputs.n += v - c.N[slot]!;
    c[key][slot] = v;
  }
  rebuildIndex(w);
  return slot;
}

const X = 64;
const Y = 64;
const CELL = cellIndex(X, Y);

describe('E09 Protein release', () => {
  it('an emitting tick costs exactly 0.04 E (secretion) and emits 0.002 eProtein; the ledger closes', () => {
    const w = dish();
    setField(w, 'protein', cellIndex(X + 1, Y), 0.5); // labelled: protein beside it
    const s = placeWith(w, 'B04', X, Y, ['E09'], { E: 50 });
    expect(profileOf(w, s).protein).toEqual({ source: 'E09', emitRate: 0.02, minEnergy: 35, emitCost: 0.4, localCap: 1 });
    const c = w.ents.cols;
    for (let t = 0; t < 5; t++) {
      const E0 = c.E[s]!;
      const sec0 = w.ledger.energy.secretion;
      const act0 = w.fields.eProtein![CELL]!;
      stageStructures(w);
      expect(c.secretionCode[s]).toBe(R.SECRETING);
      expect(c.secreting[s]).toBe(PRODUCER_BIT.protein);
      expect(E0 - c.E[s]!).toBeCloseTo(0.4 * DT, 13);
      expect(w.ledger.energy.secretion - sec0).toBeCloseTo(0.4 * DT, 14);
      expect(w.fields.eProtein![CELL]! - act0).toBeCloseTo(0.02 * DT, 15);
    }
    expect(checkLedger(w).ok).toBe(true);
  });

  const refusals: [string, (w: World, s: number) => void, number][] = [
    ['E = 35 exactly (needs E > 35)', (w, s) => (w.ents.cols.E[s] = 35), R.SECRETION_ENERGY_LOW],
    ['no protein in its cell or a four-neighbour', (w) => setField(w, 'protein', cellIndex(X + 1, Y), 0), R.SECRETION_NO_SUBSTRATE],
    ['protein only on a diagonal', (w) => (setField(w, 'protein', cellIndex(X + 1, Y), 0), setField(w, 'protein', cellIndex(X + 1, Y + 1), 0.5)), R.SECRETION_NO_SUBSTRATE],
    ['local protein enzyme at 1.0', (w) => setField(w, 'eProtein', CELL, 1), R.SECRETION_SATURATED],
  ];
  for (const [name, patch, code] of refusals) {
    it(`refused (${REASONS[code]}): ${name} — no cost, no emission, no bit`, () => {
      const w = dish();
      setField(w, 'protein', cellIndex(X + 1, Y), 0.5);
      const s = placeWith(w, 'B04', X, Y, ['E09'], { E: 50 });
      patch(w, s);
      const c = w.ents.cols;
      const E0 = c.E[s]!;
      const sec0 = w.ledger.energy.secretion;
      const act0 = w.fields.eProtein![CELL]!;
      stageStructures(w);
      expect(c.secretionCode[s]).toBe(code);
      expect(c.secreting[s]).toBe(0);
      expect(c.flags[s]! & FLAG.secreting).toBe(0);
      expect(c.E[s]).toBe(E0);
      expect(w.ledger.energy.secretion).toBe(sec0);
      expect(w.fields.eProtein![CELL]).toBe(act0);
    });
  }

  it('a B04 + E09 never takes broth: same foods as a plain B04, and it never feeds on a broth-only dish', () => {
    const w = dish();
    const plain = placeWith(w, 'B04', 30, 64, [], { E: 80 });
    const s = placeWith(w, 'B04', X, Y, ['E09'], { E: 80 });
    expect(profileOf(w, s).foods).toEqual(profileOf(w, plain).foods);
    expect(profileOf(w, s).foods).not.toContain('broth');
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) setField(w, 'broth', cellIndex(X + dx, Y + dy), 0.5);
    const c = w.ents.cols;
    const B0 = c.B[s]!;
    for (let t = 0; t < 100; t++) {
      step(w);
      expect(c.flags[s]! & FLAG.feeding).toBe(0);
    }
    expect(c.B[s]).toBe(B0);
    const card = moduleSummaries(w, s).find((m) => m.id === 'E09')!;
    expect(card.eatsBroth).toBe(false);
    expect(moduleText(card).does).toContain('Produces broth; cannot consume broth.');
    expect(checkLedger(w).ok).toBe(true);
  });

  it('the module card says the carrier already drinks broth when its kind does (Y02), never that E09 grants it', () => {
    const w = dish();
    const s = placeWith(w, 'Y02', X, Y, ['E09'], { E: 80 });
    const card = moduleSummaries(w, s).find((m) => m.id === 'E09')!;
    expect(card.eatsBroth).toBe(true);
    expect(moduleText(card).does).not.toContain('cannot consume broth');
    expect(moduleText(card).does).toContain('already drinks broth');
  });
});

describe('D-0045 two producers on one organism: secreting is a producer bit set', () => {
  /** Run stage 8 once with starch and/or protein beside the carrier; returns the recorded outcome. */
  function once(speciesId: string, modules: readonly string[], starch: boolean, protein: boolean) {
    const w = dish();
    if (starch) setField(w, 'starch', cellIndex(X + 1, Y), 0.5);
    if (protein) setField(w, 'protein', cellIndex(X - 1, Y), 0.5);
    const s = placeWith(w, speciesId, X, Y, modules, { E: 50 });
    const c = w.ents.cols;
    const sec0 = w.ledger.energy.secretion;
    const E0 = c.E[s]!;
    stageStructures(w);
    return {
      w,
      s,
      bits: c.secreting[s]!,
      code: c.secretionCode[s]!,
      flag: (c.flags[s]! & FLAG.secreting) !== 0,
      paid: w.ledger.energy.secretion - sec0,
      dE: E0 - c.E[s]!,
      starchAct: w.fields.eStarch![CELL]!,
      proteinAct: w.fields.eProtein![CELL]!,
    };
  }

  const cases: [string, string, readonly string[]][] = [
    ['an F02 (native starch) gaining E09', 'F02', ['E09']],
    ['a B04 with E01 + E09', 'B04', ['E01', 'E09']],
  ];
  for (const [name, sp, mods] of cases) {
    describe(name, () => {
      it('has both producers: starch (its own source) and protein from E09', () => {
        const w = dish();
        const s = placeWith(w, sp, X, Y, mods, { E: 50 });
        const prof = profileOf(w, s);
        expect(prof.starch?.source).toBe(sp === 'F02' ? 'native' : 'E01');
        expect(prof.protein?.source).toBe('E09');
        const keys = STAGE8_ACTIONS.filter((a) => a.applies(prof, w, s)).map((a) => a.key);
        expect(keys).toEqual(sp === 'F02' ? ['E_STARCH_SECRETION', 'E09'] : ['E01', 'E09']);
      });

      it('both release: bits 1 | 4, SECRETING, 0.08 E paid, both activities emitted; the ledger closes', () => {
        const r = once(sp, mods, true, true);
        expect(r.bits).toBe(PRODUCER_BIT.starch | PRODUCER_BIT.protein);
        expect(r.code).toBe(R.SECRETING);
        expect(r.flag).toBe(true);
        expect(r.paid).toBeCloseTo(2 * 0.4 * DT, 15);
        expect(r.dE).toBeCloseTo(r.paid, 13);
        expect(r.starchAct).toBeGreaterThan(0);
        expect(r.proteinAct).toBeGreaterThan(0);
        expect(checkLedger(r.w).ok).toBe(true);
      });

      it('only starch beside it: bit 1 only, SECRETING kept although E09 (later) was refused', () => {
        const r = once(sp, mods, true, false);
        expect(r.bits).toBe(PRODUCER_BIT.starch);
        expect(r.code).toBe(R.SECRETING);
        expect(r.flag).toBe(true);
        expect(r.paid).toBeCloseTo(0.4 * DT, 15);
        expect(r.proteinAct).toBe(0);
        const cards = moduleSummaries(r.w, r.s);
        expect(cards.find((m) => m.id === 'E09')!.activeNow).toBe(false);
        if (sp === 'B04') expect(cards.find((m) => m.id === 'E01')!.activeNow).toBe(true);
      });

      it('only protein beside it: bit 4 only, SECRETING; the starch producer set no bit', () => {
        const r = once(sp, mods, false, true);
        expect(r.bits).toBe(PRODUCER_BIT.protein);
        expect(r.code).toBe(R.SECRETING);
        expect(r.paid).toBeCloseTo(0.4 * DT, 15);
        expect(r.starchAct).toBe(0);
        const cards = moduleSummaries(r.w, r.s);
        expect(cards.find((m) => m.id === 'E09')!.activeNow).toBe(true);
        if (sp === 'B04') expect(cards.find((m) => m.id === 'E01')!.activeNow).toBe(false);
      });

      it('neither: no bits, no cost, the last producer\'s refusal (E09: SECRETION_NO_SUBSTRATE)', () => {
        const r = once(sp, mods, false, false);
        expect(r.bits).toBe(0);
        expect(r.flag).toBe(false);
        expect(r.code).toBe(R.SECRETION_NO_SUBSTRATE);
        expect(r.paid).toBe(0);
      });
    });
  }
});

describe('E10 Matrix builder: shared construction', () => {
  it('two E10 builders and a B02 in one cell: film ends at exactly 0.50, exact proportional shares, 2 E × accepted C each, the rest returned, N proportional', () => {
    const w = dish();
    w.grid.substrate[CELL] = SUBSTRATE_CODES.gel; // labelled: a gel cell so the B02 is on its own surface
    setField(w, 'film', CELL, 0.497); // headroom 0.003
    const a = placeWith(w, 'B04', X, Y, ['E10'], { E: 60, B: 1.5 });
    const b = placeWith(w, 'B01', X, Y, ['E10'], { E: 70, B: 1.9 });
    const f = placeWith(w, 'B02', X, Y, [], { E: 60, B: 1.5 });
    const c = w.ents.cols;
    c.filmSeconds[f] = 10; // labelled: attached for 10 s already
    const before = [a, b, f].map((s) => ({ s, B: c.B[s]!, N: c.N[s]!, E: c.E[s]! }));
    const req = [0.02 * DT, 0.02 * DT, Math.min(0.05 * DT, 1.5 - 1.0 * profileOf(w, f).b0)];
    const sum = req[0]! + req[1]! + req[2]!;
    const headroom = FILM_CAP - 0.497;
    expect(sum).toBeGreaterThan(headroom);
    const cons0 = w.ledger.energy.construction;
    stageStructures(w);
    expect(w.fields.film![CELL]).toBe(FILM_CAP);
    let charged = 0;
    before.forEach((o, k) => {
      const accepted = o.B - c.B[o.s]!;
      expect(accepted).toBeCloseTo((req[k]! * headroom) / sum, 15);
      // Equal scaling: every builder kept the same fraction of its request.
      expect(accepted / req[k]!).toBeCloseTo(headroom / sum, 12);
      expect(o.N - c.N[o.s]!).toBeCloseTo((o.N * accepted) / o.B, 15);
      const perC = k < 2 ? 2 : 0;
      // Charged 2 E per accepted C only: the unused part of the 2 × request reservation came back.
      expect(o.E - c.E[o.s]!).toBeCloseTo(perC * accepted, 13);
      expect(perC * req[k]! - (o.E - c.E[o.s]!)).toBeGreaterThan(0 - 1e-18);
      charged += perC * accepted;
    });
    expect(w.ledger.energy.construction - cons0).toBeCloseTo(charged, 15);
    expect(matrixBuiltNow(w, a)).toBe(true);
    expect(matrixBuiltNow(w, b)).toBe(true);
    expect(matrixBuiltNow(w, f)).toBe(false); // B02 is not an E10 carrier
    expect(checkLedger(w).ok).toBe(true);
  });

  it('over 60 ticks in one cell, two E10 builders and a B02 never push film above 0.50, and the ledger closes', () => {
    const w = dish();
    w.grid.substrate[CELL] = SUBSTRATE_CODES.gel;
    setField(w, 'film', CELL, 0.45);
    const a = placeWith(w, 'B04', X, Y, ['E10'], { E: 90, B: 1.9 });
    const b = placeWith(w, 'B01', X, Y, ['E10'], { E: 90, B: 1.9 });
    const f = placeWith(w, 'B02', X, Y, [], { E: 90, B: 1.9 });
    w.ents.cols.filmSeconds[f] = 10;
    for (let t = 0; t < 60; t++) {
      stageStructures(w);
      expect(w.fields.film![CELL]).toBeLessThanOrEqual(FILM_CAP);
    }
    expect(w.fields.film![CELL]).toBe(FILM_CAP);
    for (const s of [a, b]) expect(w.ents.cols.B[s]).toBeGreaterThan(1.2 * profileOf(w, s).b0);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('each refusal (E ≤ 35, B ≤ 1.2 B0\', film ≥ 0.50) requests nothing, costs nothing and moves nothing', () => {
    const cases: [string, State, number, string][] = [
      ['E = 35', { E: 35, B: 1.5 }, 0, 'energy'],
      ['B = 1.2 B0\'', { E: 60, B: 1.2 }, 0, 'body'],
      ['film at 0.50', { E: 60, B: 1.5 }, 0.5, 'filmFull'],
    ];
    for (const [, state, film, outcome] of cases) {
      const w = dish();
      setField(w, 'film', CELL, film);
      const s = placeWith(w, 'B04', X, Y, ['E10'], state);
      const ctx = new ActionContext(w);
      ctx.begin(s, profileOf(w, s));
      expect(matrixRequest(ctx).outcome).toBe(outcome);
      const E0 = w.ents.cols.E[s]!;
      const B0 = w.ents.cols.B[s]!;
      stageStructures(w);
      expect(w.ents.cols.E[s]).toBe(E0);
      expect(w.ents.cols.B[s]).toBe(B0);
      expect(matrixBuiltNow(w, s)).toBe(false);
    }
  });

  it('the request never reserves more energy than remains (rules with minEnergy 0, 0.001 E left → 0.0005 C)', () => {
    const w = dish();
    const s = placeWith(w, 'B04', X, Y, ['E10'], { E: 0.001, B: 1.5 });
    const prof = profileOf(w, s);
    const ctx = new ActionContext(w);
    // Test-only rules: the recorded E10 rules with minEnergy 0, so the energy cap is what binds.
    ctx.begin(s, { ...prof, builder: { ...prof.builder!, minEnergy: 0 } });
    const r = matrixRequest(ctx);
    expect(r.outcome).toBe('requested');
    expect(r.amount).toBeCloseTo(0.0005, 15);
    expect(2 * r.amount).toBeLessThanOrEqual(0.001);
    expect(() => ctx.requestConstruction(r.cell, r.amount, 2)).not.toThrow();
  });

  it('diverted body carbon delays division: at B = 2 B0\' + 0.001 the builder falls below the split size, the same carrier with a full cell splits', () => {
    const run = (film: number) => {
      const w = dish();
      const sp = 'B01';
      const s = placeWith(w, sp, X, Y, ['E10'], { E: 80 });
      const prof = profileOf(w, s);
      const c = w.ents.cols;
      w.ledger.inputs.c += 2 * prof.b0 + 0.001 - c.B[s]!;
      c.B[s] = 2 * prof.b0 + 0.001; // labelled: just above the split size (2 B0')
      c.age[s] = prof.minDivisionAge + 1;
      const before = c.B[s];
      let afterBuild = 0;
      step(w, {
        afterStage: (stage) => {
          // Labelled test state: the film in its cell entering stage 8 (stage 2 decay already ran).
          if (stage === 7) setField(w, 'film', cellIndex(Math.floor(c.x[s]!), Math.floor(c.y[s]!)), film);
          if (stage === 8) afterBuild = c.B[s]!;
        },
      });
      return { w, s, built: before - afterBuild, alive: aliveOf(w, sp).length, blocker: afterBuild < 2 * prof.b0 ? R.DIV_BLOCK_BIOMASS : R.NONE };
    };
    const builds = run(0);
    const full = run(FILM_CAP);
    expect(builds.built).toBeCloseTo(0.002, 15);
    expect(builds.blocker).toBe(R.DIV_BLOCK_BIOMASS);
    expect(builds.alive).toBe(1);
    expect(divisionBlocker(builds.w, builds.s)).toBe(R.DIV_BLOCK_BIOMASS);
    expect(full.built).toBe(0);
    expect(full.alive).toBe(2);
    expect(checkLedger(builds.w).ok).toBe(true);
  });

  it('the module card: E10 active now only when its request was accepted this tick; words from the recorded numbers', () => {
    const w = dish();
    const s = placeWith(w, 'B04', X, Y, ['E10'], { E: 60, B: 1.5 });
    stageStructures(w);
    let card = moduleSummaries(w, s).find((m) => m.id === 'E10')!;
    expect(card.activeNow).toBe(true);
    const text = moduleText(card);
    expect(text.now).toBe('Building film right now.');
    expect(text.does).toContain('0.02 body carbon per second');
    expect(text.does).toContain('1.2 times');
    expect(text.costs).toContain('2 energy for each carbon moved into film');
    setField(w, 'film', CELL, FILM_CAP);
    stageStructures(w);
    card = moduleSummaries(w, s).find((m) => m.id === 'E10')!;
    expect(card.activeNow).toBe(false);
    expect(moduleText(card).now).toBeNull();
  });
});
