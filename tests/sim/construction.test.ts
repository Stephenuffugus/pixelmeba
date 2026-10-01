/**
 * P3.7 shared construction (SPEC §3.2 stage 8, §3.3, §7.1, §9 E10; CT §12.6; D04 §2 C08 and §9;
 * construction.ts).
 *
 *  - Requests above a cell's headroom are scaled together: 0.30 + 0.30 into film 0.10 are each
 *    scaled by 0.40 / 0.60, film ends at exactly 0.50, N moves in proportion, each builder is charged
 *    only for accepted carbon and the unused reservation is returned; the ledger closes.
 *  - Below the headroom nothing is scaled; at or above the cap nothing moves and nothing is charged.
 *  - The result does not depend on the slot order of equal requests.
 *  - Through stage 8, a builder's reservation counts against its later actions and is returned
 *    after the pass (test-only builder registration; no shipped species builds yet).
 * No shipped world has the film system: the worlds here are realized under
 * registryWith({ enabledSystems: [...shipped, 'film'] }). Test-only state (B, N, E, film) is set
 * directly and logged as ledger inputs.
 */
import { describe, expect, it } from 'vitest';
import { buildActionTable, moduleAction, nativeAction, type ActionContext } from '../../src/sim/actions';
import { introduceOrganism } from '../../src/sim/commands';
import { constructionPass, type ConstructionRequest } from '../../src/sim/construction';
import { FILM_CAP } from '../../src/sim/constants';
import type { SystemFlag } from '../../src/sim/fields';
import type { RecipeDef } from '../../src/sim/content/schema';
import { cellIndex } from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { rebuildIndex } from '../../src/sim/spatial';
import { stageStructures } from '../../src/sim/structures';
import { speciesIndex, type World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, registry, setField } from '../helpers/world';

const CELL = cellIndex(64, 64);

/** A clear-water dish whose recorded manifest also enables the film system. */
function filmWorld(): World {
  const shipped = registry();
  const systems: SystemFlag[] = [...shipped.manifest.enabledSystems, 'film'];
  const reg = registryWith({ enabledSystems: systems.sort() });
  const base = reg.recipes.FIRST_DISH_V1!;
  const recipe: RecipeDef = {
    ...base,
    id: 'TEST_FILM_WATER',
    removeStones: true,
    fieldPatches: [],
    founders: [],
    scheduledCommands: [],
    backgroundOverrides: { sugar: 0 },
    mutationPreset: 'fixed',
  };
  const w = realizeRecipe(reg, recipe, { worldId: 'test-film' });
  expect(w.fields.film).toBeDefined();
  return w;
}

/** A B01 at the centre of cell (cx, cy) with test-only B, N and E (material changes logged as inputs). */
function builder(w: World, cx: number, cy: number, B: number, N: number, E: number): number {
  const slot = introduceOrganism(w, speciesIndex(w, 'B01'), cellIndex(cx, cy), 'test', { exactCenter: true });
  if (slot < 0) throw new Error('capacity');
  const c = w.ents.cols;
  c.x[slot] = cx + 0.5;
  c.y[slot] = cy + 0.5;
  w.ledger.inputs.c += B - c.B[slot]!;
  w.ledger.inputs.n += N - c.N[slot]!;
  c.B[slot] = B;
  c.N[slot] = N;
  c.E[slot] = E;
  rebuildIndex(w);
  return slot;
}

function req(slot: number, bodyC: number, energyPerC = 2, cell = CELL): ConstructionRequest {
  return { slot, cell, bodyC, energyReserved: energyPerC * bodyC, energyPerC };
}

describe('P3.7 shared construction: proportional headroom', () => {
  it('0.30 + 0.30 into film 0.10: both scaled by 0.40/0.60, film exactly 0.50, N in proportion, charged for accepted carbon only', () => {
    const w = filmWorld();
    setField(w, 'film', CELL, 0.1);
    setField(w, 'filmN', CELL, 0.01);
    const a = builder(w, 64, 64, 2.0, 0.2, 60);
    const b = builder(w, 64, 64, 1.6, 0.24, 50);
    const c = w.ents.cols;
    const total0 = computeTotals(w);
    const construction0 = w.ledger.energy.construction;
    const filmN0 = w.fields.filmN![CELL]!;
    const out = constructionPass(w, [req(a, 0.3), req(b, 0.3)]);

    const share = 0.3 * ((FILM_CAP - 0.1) / 0.6);
    expect(share).toBeCloseTo(0.2, 15);
    expect(out.map((o) => o.slot)).toEqual([a, b]);
    for (const o of out) expect(o.accepted).toBe(share);
    expect(w.fields.film![CELL]).toBe(0.5);
    // N moves with the carbon: N × accepted / B of each donor (snapshot values).
    const nA = (0.2 * share) / 2.0;
    const nB = (0.24 * share) / 1.6;
    expect(out[0]!.movedN).toBe(nA);
    expect(out[1]!.movedN).toBe(nB);
    expect(w.fields.filmN![CELL]).toBe(filmN0 + nA + nB);
    expect(c.B[a]).toBe(2.0 - share);
    expect(c.N[a]).toBe(0.2 - nA);
    expect(c.B[b]).toBe(1.6 - share);
    expect(c.N[b]).toBe(0.24 - nB);
    // Charged 2 E per accepted C; the rest of the 0.60 E reservation was returned (never deducted).
    for (const o of out) {
      expect(o.charged).toBe(2 * share);
      expect(o.returned).toBe(0.6 - 2 * share);
    }
    expect(c.E[a]).toBe(60 - 2 * share);
    expect(c.E[b]).toBe(50 - 2 * share);
    expect(w.ledger.energy.construction - construction0).toBe(4 * share);
    // An internal move: carbon and nutrient totals unchanged (up to the logged pin dust), ledger closes.
    const total1 = computeTotals(w);
    const bodyAndFilm = (t: typeof total0) => [t.breakdown.bodyC! + t.breakdown.film!, t.breakdown.bodyN! + t.breakdown.filmN!];
    expect(bodyAndFilm(total1)[0]).toBeCloseTo(bodyAndFilm(total0)[0]!, 14);
    expect(bodyAndFilm(total1)[1]).toBeCloseTo(bodyAndFilm(total0)[1]!, 14);
    expect(Math.abs(total1.c - total0.c) / total0.c).toBeLessThan(1e-15);
    expect(Math.abs(total1.n - total0.n) / total0.n).toBeLessThan(1e-15);
    expect(Math.abs(w.ledger.roundoff.c)).toBeLessThan(1e-12);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('below the headroom nothing is scaled; at the cap nothing moves and every reservation is returned', () => {
    const w = filmWorld();
    setField(w, 'film', CELL, 0.1);
    const a = builder(w, 64, 64, 2, 0.2, 60);
    const b = builder(w, 64, 64, 2, 0.2, 60);
    const out = constructionPass(w, [req(a, 0.1), req(b, 0.15)]);
    expect(out.map((o) => o.accepted)).toEqual([0.1, 0.15]);
    expect(w.fields.film![CELL]).toBe(0.1 + 0.1 + 0.15);
    expect(out.map((o) => o.returned)).toEqual([0, 0]);

    setField(w, 'film', CELL, FILM_CAP);
    const E = w.ents.cols.E[a]!;
    const B = w.ents.cols.B[a]!;
    const atCap = constructionPass(w, [req(a, 0.1)]);
    expect(atCap[0]).toMatchObject({ accepted: 0, movedN: 0, charged: 0, returned: 0.2 });
    expect(w.fields.film![CELL]).toBe(FILM_CAP);
    expect(w.ents.cols.E[a]).toBe(E);
    expect(w.ents.cols.B[a]).toBe(B);
    expect(checkLedger(w).ok).toBe(true);

    // Above the cap (an imported or patched value): nothing moves, nothing is charged, the tick goes on.
    setField(w, 'film', CELL, 0.6);
    const above = constructionPass(w, [req(a, 0.1), req(b, 0.05)]);
    expect(above.map((o) => o.accepted)).toEqual([0, 0]);
    expect(above.map((o) => o.charged)).toEqual([0, 0]);
    expect(w.fields.film![CELL]).toBe(0.6);
    expect(w.ents.cols.E[a]).toBe(E);
    expect(w.ents.cols.B[a]).toBe(B);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('cells resolve independently, in ascending cell order', () => {
    const w = filmWorld();
    const far = cellIndex(70, 64);
    setField(w, 'film', far, 0.45);
    const a = builder(w, 64, 64, 2, 0.2, 60);
    const b = builder(w, 70, 64, 2, 0.2, 60);
    const out = constructionPass(w, [req(b, 0.2, 2, far), req(a, 0.2)]);
    expect(out.map((o) => o.cell)).toEqual([CELL, far]);
    expect(out[0]!.accepted).toBe(0.2);
    expect(out[1]!.accepted).toBe(0.2 * ((FILM_CAP - 0.45) / 0.2));
    expect(w.fields.film![far]).toBe(FILM_CAP);
  });

  it('the result does not depend on the slot order of equal requests', () => {
    const outcome = (swap: boolean) => {
      const w = filmWorld();
      setField(w, 'film', CELL, 0.1);
      // Same two builders, placed in the opposite order (so their slots swap).
      const first = builder(w, 64, 64, swap ? 1.6 : 2.0, swap ? 0.24 : 0.2, 60);
      const second = builder(w, 64, 64, swap ? 2.0 : 1.6, swap ? 0.2 : 0.24, 60);
      const big = swap ? second : first;
      const small = swap ? first : second;
      const requests = swap ? [req(small, 0.3), req(big, 0.3)] : [req(big, 0.3), req(small, 0.3)];
      constructionPass(w, requests);
      const c = w.ents.cols;
      return { film: w.fields.film![CELL], filmN: w.fields.filmN![CELL], big: [c.B[big], c.N[big], c.E[big]], small: [c.B[small], c.N[small], c.E[small]] };
    };
    const x = outcome(false);
    const y = outcome(true);
    expect(y.film).toBe(x.film);
    expect(y.big).toEqual(x.big);
    expect(y.small).toEqual(x.small);
    expect(y.filmN).toBeCloseTo(x.filmN!, 15);
  });

  it('refuses malformed requests and a world without the film system; no requests is a no-op', () => {
    const plain = clearWater();
    expect(plain.fields.film).toBeUndefined();
    expect(constructionPass(plain, [])).toEqual([]);
    const s = builder(plain, 64, 64, 2, 0.2, 60);
    expect(() => constructionPass(plain, [req(s, 0.1)])).toThrow(/without the film system/);
    const w = filmWorld();
    const a = builder(w, 64, 64, 2, 0.2, 60);
    expect(() => constructionPass(w, [{ ...req(a, 0.1), energyReserved: 0.1 }])).toThrow(/reserves too little/);
    expect(() => constructionPass(w, [req(a, 0)])).toThrow(/invalid construction amount/);
  });
});

describe('P3.7 shared construction through stage 8', () => {
  it('a builder\'s reservation counts against its later actions and the unused part is returned after the pass', () => {
    const w = filmWorld();
    setField(w, 'film', CELL, 0.1);
    const a = builder(w, 64, 64, 2.0, 0.2, 60);
    const b = builder(w, 64, 64, 2.0, 0.2, 60);
    const seen: { slot: number; E: number; B: number }[] = [];
    // Test-only registrations: a native builder (BIOFILM's ID 3) offering 0.30 C at 2 E/C, and a
    // later module action that only records what it sees.
    const build = nativeAction('BIOFILM', () => true, (ctx: ActionContext) => {
      ctx.requestConstruction(CELL, 0.3, 2);
      return R.NONE;
    });
    const look = moduleAction('E10', () => true, (ctx: ActionContext) => {
      seen.push({ slot: ctx.i, E: ctx.remainingEnergy(), B: ctx.remainingBody() });
      return R.NONE;
    });
    const total0 = computeTotals(w);
    stageStructures(w, buildActionTable([look, build]));
    // The later action saw the full reservation held (0.60 E, 0.30 C) …
    expect(seen).toEqual([
      { slot: a, E: 60 - 0.6, B: 2.0 - 0.3 },
      { slot: b, E: 60 - 0.6, B: 2.0 - 0.3 },
    ]);
    // … but after the shared pass each paid only for the 0.20 C accepted.
    const share = 0.3 * ((FILM_CAP - 0.1) / 0.6);
    const c = w.ents.cols;
    expect(c.E[a]).toBe(60 - 2 * share);
    expect(c.E[b]).toBe(60 - 2 * share);
    expect(c.B[a]).toBe(2.0 - share);
    expect(w.fields.film![CELL]).toBe(FILM_CAP);
    expect(Math.abs(computeTotals(w).c - total0.c) / total0.c).toBeLessThan(1e-15);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('a builder cannot reserve more than the energy or body carbon it has left', () => {
    const w = filmWorld();
    builder(w, 64, 64, 2.0, 0.2, 0.5);
    const greedy = nativeAction('BIOFILM', () => true, (ctx: ActionContext) => {
      ctx.requestConstruction(CELL, 0.3, 2);
      return R.NONE;
    });
    expect(() => stageStructures(w, buildActionTable([greedy]))).toThrow(/reserve/);
  });
});
