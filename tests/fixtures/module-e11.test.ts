/**
 * P5.5 (Phase 5 wave 13, e3-jacket): E11 Mineral jacket (SPEC §9 E11, §9.19, §3.2 rows 4 and 8, §6.8; CT §1.2,
 * §1.3, §7.1, §12.3, §12.5; D-0045; D-0108; src/sim/jacket.ts).
 *
 *  - a P01 (B0 4) with E11 on silicate binds exactly buildRate × B0' × dt = 0.002 mineral per tick, pays exactly
 *    10 E per mineral under 'construction', its cell loses exactly that silicate, it reaches its target 0.10 × B
 *    after 200 ticks and then requests nothing; a growing B raises the target;
 *  - one silicate snapshot shared per cell with proportional headroom: scaled requests, a scaled cell ends at
 *    exactly 0 with the dust in roundoff.m, energy charged on the accepted mineral only, equal shares whatever
 *    the slot order, per-cell scaling;
 *  - skips: E below 15 (15 builds), held, no silicate, a jacket at its target; a non-carrier never changes;
 *    resting is unreachable for the eligible species (no resting ability) and the table skips non-Active;
 *  - stage 4 speed × (1 − 0.20c) for a jacketed carrier, the old expression for everyone else;
 *  - division: the jacket splits; a daughter without E11 drops hers as grit in her own cell; none is created;
 *  - death sends a real jacket to grit; the module card's jacketBuiltNow follows accepted requests;
 *  - closed-lid conservation over 10,000 ticks with 30 carriers building, dying and dividing;
 *  - NEUTRAL: E11 and silicate recorded but no carrier → byte-identical entity columns over 2,000 ticks;
 *  - content: E11's numbers equal the constants wave 12's handling and coverage use.
 *
 * NOTHING is enabled (D-0104): E11 joins IMPLEMENTED_MODULES only at the organism flip, so the registry uses
 * allowUnimplemented (and enables P07, P10, F03 and 'silicate' for tests only).
 */
import { describe, expect, it } from 'vitest';
import { ActionContext, buildActionTable, runActions, STAGE8_ACTIONS } from '../../src/sim/actions';
import { applyNow } from '../../src/sim/commands';
import { DT, HANDLING_JACKET_BASE_SECONDS, HANDLING_JACKET_SECONDS_PER_COVERAGE, JACKET_COVERAGE_FRACTION } from '../../src/sim/constants';
import { LIFE_ACTIVE } from '../../src/sim/entities';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex } from '../../src/sim/grid';
import { jacketBuiltNow, jacketPass, jacketRequest, jacketView } from '../../src/sim/jacket';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { killEntity } from '../../src/sim/maintenance';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { entityCell, rebuildIndex } from '../../src/sim/spatial';
import { stageStructures } from '../../src/sim/structures';
import { run, step } from '../../src/sim/tick';
import { inactiveFieldsNonZero } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { aliveOf, clearWater, fillField, place, placeWith, preOrganismFlipRegistry, rebaseLedger, registry, setField } from '../helpers/world';

const shipped = registry().manifest;
const REG_J = registryWith(
  {
    enabledModules: [...shipped.enabledModules, 'E11'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'silicate'].sort() as SystemFlag[],
    enabledSpecies: [...shipped.enabledSpecies, 'F03', 'P07', 'P10'].sort(),
  },
  { allowUnimplemented: true }, // E11 (and F03's TRAP) join the implemented lists only at the integration / organism flip
);

/** P01's per-tick build ceiling, evaluated as jacket.ts does: buildRate × B0' × dt. */
const RATE_P01 = 0.005 * 4 * DT;
const EPM = 10;

function dish(seed?: number): World {
  return clearWater(seed === undefined ? {} : { seed }, REG_J);
}

/** One stage 8 call with the shipped table (no other stage moves anything). */
function stage8(w: World): void {
  stageStructures(w);
}

function carrier(w: World, sp: string, x: number, y: number, E = 80, B?: number): number {
  return placeWith(w, sp, x, y, ['E11'], B === undefined ? { E } : { E, B });
}

describe('E11: the carrier builds from local silicate (SPEC §9 E11)', () => {
  it('Profile.jacket holds the world\'s recorded E11 numbers; null without E11', () => {
    const w = dish();
    const s = carrier(w, 'P01', 64.5, 64.5);
    const p = place(w, 'P01', 70.5, 64.5);
    expect(profileOf(w, s).jacket).toEqual({ targetPerBody: 0.1, buildRate: 0.005, energyPerMineral: 10, speedPenalty: 0.2, minEnergy: 15 });
    expect(profileOf(w, p).jacket).toBeNull();
    expect(jacketView(w, p)).toBeNull(); // no E11 and no jacket
    expect(jacketView(w, s)).toEqual({ mineral: 0, target: 0.1 * 4, coverage: 0, speedFactor: 1 });
    expect(STAGE8_ACTIONS.filter((a) => a.applies(profileOf(w, s), w, s)).map((a) => a.key)).toEqual(['E11']);
    expect(STAGE8_ACTIONS.filter((a) => a.applies(profileOf(w, p), w, p)).map((a) => a.key)).toEqual([]);
  });

  it('binds exactly 0.002 per tick, pays exactly 0.02 E under construction, the cell loses exactly 0.002; target 0.4 after 200 ticks, then nothing', () => {
    const w = dish();
    fillField(w, 'silicate', 0.3);
    const s = carrier(w, 'P01', 64.5, 64.5, 90);
    const c = w.ents.cols;
    let before = { j: 0, E: 0, cons: 0, si: 0, cell: 0, B: 0 };
    let builtTicks = 0;
    let lastBuild = -1;
    const hooks = {
      afterStage: (st: number, world: World) => {
        if (st === 7) {
          const cell = entityCell(c.x[s]!, c.y[s]!);
          before = { j: c.jacketMineral[s]!, E: c.E[s]!, cons: world.ledger.energy.construction, si: world.fields.silicate![cell]!, cell, B: c.B[s]! };
        }
        if (st === 8) {
          const dj = c.jacketMineral[s]! - before.j;
          if (dj > 0) {
            builtTicks++;
            lastBuild = world.tick;
            const amount = Math.min(RATE_P01, 0.1 * before.B - before.j);
            expect(Object.is(c.jacketMineral[s], before.j + amount)).toBe(true);
            expect(Object.is(c.E[s], before.E - EPM * amount)).toBe(true);
            expect(Object.is(world.ledger.energy.construction, before.cons + EPM * amount)).toBe(true);
            expect(Object.is(world.fields.silicate![before.cell], before.si - amount)).toBe(true);
            if (builtTicks <= 199) {
              expect(Object.is(amount, RATE_P01)).toBe(true);
              expect(jacketBuiltNow(world, s)).toBe(true);
            }
          } else {
            expect(c.E[s]).toBe(before.E);
            expect(world.ledger.energy.construction).toBe(before.cons);
            expect(jacketBuiltNow(world, s)).toBe(false);
          }
        }
      },
    };
    for (let t = 0; t < 260; t++) step(w, hooks);
    expect(c.B[s]).toBe(4); // no food: the body (and so the target) stays 4
    expect(builtTicks).toBe(200);
    expect(lastBuild).toBe(199); // ticks 0..199
    expect(c.jacketMineral[s]).toBe(0.4); // 0.10 × B exactly (the last step closes the deficit)
    expect(jacketView(w, s)).toEqual({ mineral: 0.4, target: 0.1 * 4, coverage: 1, speedFactor: 1 - 0.2 * 1 });
    expect(checkLedger(w).ok).toBe(true);
  });

  it('the target follows the current body: a fed P01 grows and its jacket keeps building toward 0.10 × B', () => {
    const w = dish();
    fillField(w, 'silicate', 0.3);
    const s = carrier(w, 'P01', 64.5, 64.5, 90);
    const c = w.ents.cols;
    for (let t = 0; t < 200; t++) step(w);
    expect(c.jacketMineral[s]).toBe(0.4);
    // A meal (logged as an input) grows the body through ordinary intake.
    c.mealC[s] = 1.5;
    c.mealN[s] = 0.15;
    w.ledger.inputs.c += 1.5;
    w.ledger.inputs.n += 0.15;
    let snap = { j: 0, B: 0 };
    let grew = 0;
    for (let t = 0; t < 150; t++) {
      step(w, {
        afterStage: (st) => {
          if (st === 7) snap = { j: c.jacketMineral[s]!, B: c.B[s]! };
          if (st === 8) {
            const deficit = 0.1 * snap.B - snap.j;
            const want = deficit > 0 ? snap.j + Math.min(RATE_P01, deficit) : snap.j;
            expect(Object.is(c.jacketMineral[s], want)).toBe(true);
            if (deficit > 0) grew++;
          }
        },
      });
    }
    expect(c.B[s]).toBeGreaterThan(4.3);
    expect(grew).toBeGreaterThan(10);
    expect(c.jacketMineral[s]).toBeGreaterThan(0.43);
    expect(c.jacketMineral[s]).toBeLessThanOrEqual(0.1 * c.B[s]! + 1e-12);
    expect(checkLedger(w).ok).toBe(true);
  });
});

describe('E11: one shared mineral pass per stage 8 (SPEC §3.2 row 8, §9 E11 "shared, capped by deficit")', () => {
  it('two carriers in a cell with 0.003 silicate each requesting 0.002: each binds 0.0015, charged 0.015 E, the rest returned; the cell ends at 0', () => {
    for (const reverse of [false, true]) {
      const w = dish();
      const cell = cellIndex(64, 64);
      // Placed in either order: the shares are equal whatever the slots.
      const xs = reverse ? [64.8, 64.2] : [64.2, 64.8];
      const a = carrier(w, 'P01', xs[0]!, 64.5);
      const b = carrier(w, 'P01', xs[1]!, 64.5);
      setField(w, 'silicate', cell, 0.003);
      const c = w.ents.cols;
      const E0 = [c.E[a]!, c.E[b]!];
      const cons0 = w.ledger.energy.construction;
      const round0 = w.ledger.roundoff.m;
      stage8(w);
      const share = RATE_P01 * (0.003 / (RATE_P01 + RATE_P01));
      expect(share).toBeCloseTo(0.0015, 15);
      expect(Object.is(c.jacketMineral[a], share)).toBe(true);
      expect(Object.is(c.jacketMineral[b], share)).toBe(true);
      expect(Object.is(c.E[a], E0[0]! - EPM * share)).toBe(true);
      expect(Object.is(c.E[b], E0[1]! - EPM * share)).toBe(true);
      expect(c.E[a]).toBeCloseTo(80 - 0.015, 12);
      expect(Object.is(w.ledger.energy.construction, cons0 + EPM * share + EPM * share)).toBe(true);
      expect(w.fields.silicate![cell]).toBe(0);
      expect(0.003 - share - share).toBe(0); // here the scaled cell has no dust: roundoff.m does not move
      expect(w.ledger.roundoff.m - round0 === 0).toBe(true);
      expect(checkLedger(w).ok).toBe(true);
    }
  });

  it('a scaled cell with float dust ends at exactly 0 and the dust is in roundoff.m', () => {
    const w = dish();
    const cell = cellIndex(64, 64);
    const s = [carrier(w, 'P01', 64.2, 64.5), carrier(w, 'P01', 64.5, 64.5), carrier(w, 'P01', 64.8, 64.5)];
    setField(w, 'silicate', cell, 0.0011);
    const round0 = w.ledger.roundoff.m;
    stage8(w);
    const sum = RATE_P01 + RATE_P01 + RATE_P01;
    const share = RATE_P01 * (0.0011 / sum);
    for (const i of s) expect(Object.is(w.ents.cols.jacketMineral[i], share)).toBe(true);
    expect(w.fields.silicate![cell]).toBe(0);
    const dust = -(0.0011 - share - share - share);
    expect(Object.is(w.ledger.roundoff.m - round0, round0 + dust - round0)).toBe(true);
    expect(Math.abs(dust)).toBeLessThan(1e-12);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('three carriers in two cells: only the short cell scales', () => {
    const w = dish();
    const c1 = cellIndex(64, 64);
    const c2 = cellIndex(66, 64);
    const a = carrier(w, 'P01', 64.2, 64.5);
    const b = carrier(w, 'P01', 64.8, 64.5);
    const d = carrier(w, 'P01', 66.5, 64.5);
    setField(w, 'silicate', c1, 0.003);
    setField(w, 'silicate', c2, 0.003);
    stage8(w);
    const c = w.ents.cols;
    const share = RATE_P01 * (0.003 / (RATE_P01 + RATE_P01));
    expect(Object.is(c.jacketMineral[a], share)).toBe(true);
    expect(Object.is(c.jacketMineral[b], share)).toBe(true);
    expect(Object.is(c.jacketMineral[d], RATE_P01)).toBe(true);
    expect(w.fields.silicate![c1]).toBe(0);
    expect(Object.is(w.fields.silicate![c2], 0.003 - RATE_P01)).toBe(true);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('the pass returns the outcomes in canonical order and charges only what it accepted', () => {
    const w = dish();
    const cell = cellIndex(64, 64);
    const a = carrier(w, 'P01', 64.2, 64.5);
    const b = carrier(w, 'P01', 64.8, 64.5);
    setField(w, 'silicate', cell, 0.003);
    const ctx = new ActionContext(w);
    const table = buildActionTable(STAGE8_ACTIONS.filter((x) => x.key === 'E11'));
    for (const i of [b, a]) runActions(ctx, table, i, profileOf(w, i));
    expect(ctx.mineralRequests.map((r) => r.slot)).toEqual([b, a]);
    expect(ctx.reservedE).toBe(EPM * RATE_P01); // the context's last organism
    const out = jacketPass(w, ctx.mineralRequests);
    const share = RATE_P01 * (0.003 / (RATE_P01 + RATE_P01));
    expect(out.map((o) => o.slot)).toEqual([a, b].sort((x, y) => x - y));
    for (const o of out) {
      expect(o.accepted).toBe(share);
      expect(o.charged).toBe(EPM * share);
      expect(o.returned).toBe(EPM * RATE_P01 - EPM * share);
    }
    expect(jacketPass(w, [])).toEqual([]);
  });
});

describe('E11: the skip conditions (SPEC §9 E11 "skip while resting, held, E < 15 or dead")', () => {
  function oneTick(E: number) {
    const w = dish();
    const s = carrier(w, 'P01', 64.5, 64.5, E);
    setField(w, 'silicate', cellIndex(64, 64), 0.3);
    stage8(w);
    return { w, s };
  }

  it('E 14.99 → nothing (ENERGY_LOW); E 15 → builds (15 itself is a building energy)', () => {
    const low = oneTick(14.99);
    expect(low.w.ents.cols.jacketMineral[low.s]).toBe(0);
    expect(low.w.ents.cols.E[low.s]).toBe(14.99);
    expect(low.w.ledger.energy.construction).toBe(0);
    const at = oneTick(15);
    expect(at.w.ents.cols.jacketMineral[at.s]).toBe(RATE_P01);
    expect(Object.is(at.w.ents.cols.E[at.s], 15 - EPM * RATE_P01)).toBe(true);
    // The action's own refusal code.
    const w = dish();
    const s = carrier(w, 'P01', 64.5, 64.5, 14.99);
    const ctx = new ActionContext(w);
    ctx.begin(s, profileOf(w, s));
    expect(jacketRequest(ctx).outcome).toBe('energy');
    const e11 = STAGE8_ACTIONS.find((x) => x.key === 'E11')!;
    expect(e11.run(ctx)).toBe(R.ENERGY_LOW);
  });

  it('the energy ceiling: with 15.01 E remaining it requests 0.002 (0.02 E), never more energy than remains', () => {
    const w = dish();
    const s = carrier(w, 'P01', 64.5, 64.5, 15.01);
    const ctx = new ActionContext(w);
    ctx.begin(s, profileOf(w, s));
    const r = jacketRequest(ctx);
    expect(r).toMatchObject({ outcome: 'requested', amount: RATE_P01 });
    // A later action of the same organism sees the reservation.
    ctx.requestMineral(r.cell, r.amount, EPM);
    expect(ctx.remainingEnergy()).toBe(15.01 - EPM * RATE_P01);
    expect(() => ctx.requestMineral(r.cell, 100, EPM)).toThrow(/exceeds/);
    expect(() => ctx.requestMineral(r.cell, 0, EPM)).toThrow(/invalid mineral amount/);
    expect(() => ctx.requestMineral(r.cell, 0.001, -1)).toThrow(/invalid mineral energy rate/);
  });

  it('held (a hand-set F03 pair) → nothing', () => {
    const w = dish();
    const s = carrier(w, 'P01', 64.5, 64.5);
    const f = place(w, 'F03', 70.5, 64.5);
    setField(w, 'silicate', cellIndex(64, 64), 0.3);
    const c = w.ents.cols;
    c.trapSlot[f] = s;
    c.trapBirthId[f] = c.birthId[s]!;
    c.heldBySlot[s] = f;
    c.heldByBirthId[s] = c.birthId[f]!;
    const ctx = new ActionContext(w);
    ctx.begin(s, profileOf(w, s));
    expect(jacketRequest(ctx).outcome).toBe('held');
    // The table entry submits nothing for a held carrier.
    const table = buildActionTable(STAGE8_ACTIONS.filter((x) => x.key === 'E11'));
    const ctx2 = new ActionContext(w);
    runActions(ctx2, table, s, profileOf(w, s));
    expect(ctx2.mineralRequests).toEqual([]);
    expect(ctx2.reservedE).toBe(0);
  });

  it('no silicate in the cell → nothing bound, nothing charged; a jacket at its target → no request', () => {
    const w = dish();
    const s = carrier(w, 'P01', 64.5, 64.5);
    stage8(w);
    expect(w.ents.cols.jacketMineral[s]).toBe(0);
    expect(w.ents.cols.E[s]).toBe(80);
    expect(jacketBuiltNow(w, s)).toBe(false);
    const full = dish();
    const t = carrier(full, 'P01', 64.5, 64.5);
    full.ents.cols.jacketMineral[t] = 0.4;
    full.ledger.inputs.m += 0.4;
    setField(full, 'silicate', cellIndex(64, 64), 0.3);
    const ctx = new ActionContext(full);
    ctx.begin(t, profileOf(full, t));
    expect(jacketRequest(ctx).outcome).toBe('full');
    stage8(full);
    expect(full.ents.cols.jacketMineral[t]).toBe(0.4);
    expect(full.fields.silicate![cellIndex(64, 64)]).toBe(0.3);
  });

  it('resting is unreachable for P01, P02 and P07 (no resting ability; E03 is not eligible), and the table runs for Active only', () => {
    for (const id of ['P01', 'P02', 'P07']) {
      expect(REG_J.species[id]!.nativeAbilities).not.toContain('DORMANCY');
      expect(REG_J.modules.E03!.eligibleAncestors).not.toContain(id);
    }
    expect(REG_J.modules.E11!.eligibleAncestors).toEqual(['P01', 'P02', 'P07']);
    // A non-Active organism never reaches stage 8's table (stage8-order: "a non-Active organism runs no optional action").
    const w = dish();
    const s = carrier(w, 'P01', 64.5, 64.5);
    expect(w.ents.cols.lifeState[s]).toBe(LIFE_ACTIVE);
  });

  it('a non-carrier P01 on silicate never changes its jacket over 300 ticks', () => {
    const w = dish();
    fillField(w, 'silicate', 0.3);
    const s = place(w, 'P01', 64.5, 64.5, { E: 90 });
    for (let t = 0; t < 300; t++) step(w);
    expect(w.ents.cols.jacketMineral[s]).toBe(0);
    expect(w.ledger.energy.construction).toBe(0);
  });
});

describe('E11: speed × (1 − 0.20c) (stage 4)', () => {
  /** A P07 pursuing a pinned B01 straight east; returns each tick's x displacement. */
  function pursuit(jacket: number, B?: number): { dxs: number[]; x0s: number[]; w: World; s: number } {
    const w = dish();
    const s = jacket >= 0 ? carrier(w, 'P07', 60.5, 64.5, 40, B) : place(w, 'P07', 60.5, 64.5, { E: 40 });
    const prey = place(w, 'B01', 64.5, 64.5);
    const c = w.ents.cols;
    if (jacket > 0) {
      c.jacketMineral[s] = jacket;
      w.ledger.inputs.m += jacket;
    }
    c.decisionTimer[s] = 0;
    const dxs: number[] = [];
    const x0s: number[] = [];
    let x0 = 0;
    for (let t = 0; t < 6; t++) {
      step(w, {
        afterStage: (st) => {
          if (st === 3) {
            c.x[prey] = 64.5;
            c.y[prey] = 64.5;
            rebuildIndex(w);
            x0 = c.x[s]!;
          }
          if (st === 4) {
            x0s.push(x0);
            dxs.push(c.x[s]!);
          }
        },
      });
    }
    return { dxs, x0s, w, s };
  }

  it('a P07 (speed 3, B 2) at c 0.5 steps exactly 3 × 0.1 × 0.9; at c 1 exactly 3 × 0.1 × 0.8; without a jacket exactly 3 × 0.1', () => {
    const cases: Array<[jacket: number, factor: number | null, B?: number]> = [
      [0.1, 1 - 0.2 * 0.5], // c = 0.1 / (0.1 × 2) = 0.5
      [0.2, 1 - 0.2 * 1], // c 1
      [0.5, 1 - 0.2 * 1], // above the target: c is clamped to 1
      [0.125, 1 - 0.2 * 0.5, 2.5], // c from the CURRENT body: 0.125 / (0.1 × 2.5) = 0.5 (not 0.125 / (0.1 × B0') = 0.625)
      [0, null], // a carrier with no jacket
      [-1, null], // no E11 at all
    ];
    for (const [jacket, factor, B] of cases) {
      const r = pursuit(jacket, B);
      expect(r.w.ents.cols.y[r.s]).toBe(64.5);
      const want = factor === null ? 3 * DT : 3 * DT * factor;
      for (let k = 0; k < r.dxs.length; k++) expect(Object.is(r.dxs[k], r.x0s[k]! + want), `jacket ${jacket} tick ${k}`).toBe(true);
      expect(r.w.ents.cols.movedThisTick[r.s]).toBeCloseTo(want, 12);
    }
    expect(3 * DT * (1 - 0.2 * 0.5)).toBeCloseTo(0.27, 15);
    expect(3 * DT * (1 - 0.2 * 1)).toBeCloseTo(0.24, 15);
  });
});

describe('E11: division (SPEC §9.19)', () => {
  /** A carrier ready to divide whose two daughters get the given genomes (proposal set by hand). */
  function divider(daughterWithout: 0 | 1 | null, parentHasE11 = true) {
    const w = dish();
    const c = w.ents.cols;
    const plain = place(w, 'P01', 40.5, 64.5, { B: 4.5 });
    const withE11 = carrier(w, 'P01', 44.5, 64.5, 80, 4.5);
    const s = parentHasE11 ? carrier(w, 'P01', 64.5, 64.5, 100, 8.2) : place(w, 'P01', 64.5, 64.5, { E: 100, B: 8.2 });
    c.age[s] = 100;
    if (parentHasE11) {
      c.jacketMineral[s] = 0.6;
      w.ledger.inputs.m += 0.6;
    }
    const gWith = c.genome[withE11]!;
    const gPlain = c.genome[plain]!;
    c.propG0[s] = daughterWithout === 0 ? gPlain : parentHasE11 ? gWith : gPlain;
    c.propG1[s] = daughterWithout === 1 ? gPlain : gWith;
    return { w, s };
  }

  function divide(w: World, s: number): { slot: number; gritBefore: Float64Array; jacketAt8: number } {
    const c = w.ents.cols;
    let gritBefore = new Float64Array(0);
    let jacketAt8 = 0;
    const hw = w.ents.highWater;
    step(w, {
      afterStage: (st, world) => {
        if (st === 8) {
          gritBefore = world.fields.grit!.slice();
          jacketAt8 = c.jacketMineral[s]!;
        }
      },
    });
    expect(w.ents.highWater).toBe(hw + 1);
    return { slot: hw, gritBefore, jacketAt8 };
  }

  it('both daughters with E11: the jacket splits equally, no grit', () => {
    const { w, s } = divider(null);
    const { slot, gritBefore, jacketAt8 } = divide(w, s);
    const c = w.ents.cols;
    expect(c.jacketMineral[s]).toBe(jacketAt8 / 2);
    expect(c.jacketMineral[slot]).toBe(jacketAt8 / 2);
    expect(Array.from(w.fields.grit!)).toEqual(Array.from(gritBefore));
    expect(checkLedger(w).ok).toBe(true);
  });

  for (const lost of [1, 0] as const) {
    it(`the ${lost === 1 ? 'new' : 'retained'} daughter lost E11: she drops her half as grit in her own cell at the end of stage 9; her sister keeps hers`, () => {
      const { w, s } = divider(lost);
      const { slot, gritBefore, jacketAt8 } = divide(w, s);
      const c = w.ents.cols;
      const loser = lost === 1 ? slot : s;
      const keeper = lost === 1 ? s : slot;
      expect(profileOf(w, loser).jacket).toBeNull();
      expect(profileOf(w, keeper).jacket).not.toBeNull();
      expect(c.jacketMineral[loser]).toBe(0);
      expect(c.jacketMineral[keeper]).toBe(jacketAt8 / 2);
      const cell = entityCell(c.x[loser]!, c.y[loser]!);
      const grit = w.fields.grit!;
      expect(grit[cell]).toBe(gritBefore[cell]! + jacketAt8 / 2);
      for (let k = 0; k < grit.length; k++) if (k !== cell) expect(grit[k]).toBe(gritBefore[k]);
      expect(checkLedger(w).ok).toBe(true);
    });
  }

  it('no jacket is created by gaining E11: a parent without E11 or a jacket has daughters with E11 and 0 jacket', () => {
    const { w, s } = divider(0, false);
    const { slot } = divide(w, s);
    const c = w.ents.cols;
    expect(profileOf(w, slot).jacket).not.toBeNull();
    expect(c.jacketMineral[slot]).toBe(0);
    expect(c.jacketMineral[s]).toBe(0);
  });
});

describe('E11: death and the module card', () => {
  it('a death sends a real (built) jacket to grit in its cell', () => {
    const w = dish();
    fillField(w, 'silicate', 0.3);
    const s = carrier(w, 'P01', 64.5, 64.5);
    for (let t = 0; t < 50; t++) step(w);
    const c = w.ents.cols;
    const jacket = c.jacketMineral[s]!;
    expect(jacket).toBeGreaterThan(0.09);
    const cell = entityCell(c.x[s]!, c.y[s]!);
    const g0 = w.fields.grit![cell]!;
    killEntity(w, s, R.DEATH_AGE);
    expect(w.fields.grit![cell]).toBe(g0 + jacket);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('jacketBuiltNow follows accepted requests: on while silicate is bound, off with none left or energy below 15', () => {
    const w = dish();
    const cell = cellIndex(64, 64);
    const s = carrier(w, 'P01', 64.5, 64.5);
    setField(w, 'silicate', cell, 0.003);
    stage8(w);
    expect(jacketBuiltNow(w, s)).toBe(true);
    stage8(w); // the cell holds 0.001: still accepted
    expect(jacketBuiltNow(w, s)).toBe(true);
    stage8(w); // 0 left
    expect(jacketBuiltNow(w, s)).toBe(false);
    setField(w, 'silicate', cell, 0.3);
    w.ents.cols.E[s] = 10;
    stage8(w);
    expect(jacketBuiltNow(w, s)).toBe(false);
    w.ents.cols.E[s] = 50;
    stage8(w);
    expect(jacketBuiltNow(w, s)).toBe(true);
  });
});

describe('E11: closed-lid conservation', () => {
  it('30 carriers building, dying and dividing, grit dissolving: C, N and mineral within 1e-5 relative and 1e-8 absolute over 10,000 ticks', () => {
    const w = clearWater({ lid: 'closed', backgroundOverrides: { sugar: 0.2 } }, REG_J);
    const si = w.fields.silicate!;
    const grit = w.fields.grit!;
    for (let y = 50; y < 78; y++) {
      for (let x = 44; x < 84; x++) si[cellIndex(x, y)] = 0.04;
      for (let x = 60; x < 70; x++) grit[cellIndex(x, y)] = 0.2;
    }
    rebaseLedger(w);
    let n = 0;
    const inoc = (speciesId: string, x: number, y: number, count: number) => applyNow(w, `e11-${++n}`, { kind: 'inoculate', speciesId, x, y, radius: 5, count });
    inoc('B01', 54.5, 60.5, 30);
    inoc('B01', 74.5, 68.5, 30);
    for (let k = 0; k < 30; k++) {
      const sp = (['P01', 'P02', 'P07'] as const)[k % 3]!;
      carrier(w, sp, 48.5 + (k % 10) * 3.3, 54.5 + Math.floor(k / 10) * 8, 70);
    }
    const inputs0 = { ...w.ledger.inputs };
    const worst = { c: 0, n: 0, m: 0 };
    const worstAbs = { c: 0, n: 0, m: 0 };
    let maxJacket = 0;
    let carrierDeaths = 0;
    const carriers = (world: World) => aliveOf(world).filter((i) => profileOf(world, i).jacket !== null).length;
    let last = carriers(w);
    for (let chunk = 0; chunk < 20; chunk++) {
      run(w, 500, {
        afterStage: (st, world) => {
          if (st === 4 || st === 5 || st === 7) {
            const now = carriers(world);
            if (st !== 4 && now < last) carrierDeaths += last - now;
            last = now;
          }
          if (st === 9 && world.tick % 100 === 0) {
            const c = world.ents.cols;
            for (const i of aliveOf(world)) maxJacket = Math.max(maxJacket, c.jacketMineral[i]!);
            last = carriers(world);
          }
        },
      });
      const chk = checkLedger(w);
      for (const e of ['c', 'n', 'm'] as const) {
        worst[e] = Math.max(worst[e], chk.relErr[e]);
        worstAbs[e] = Math.max(worstAbs[e], Math.abs(chk.actual[e] - chk.expected[e]));
      }
      expect(chk.ok, `tick ${w.tick}: ${JSON.stringify(chk)}`).toBe(true);
      expect(inactiveFieldsNonZero(w)).toEqual([]);
    }
    expect(w.tick).toBe(10000);
    expect(w.ledger.inputs).toEqual(inputs0);
    expect(w.ledger.exchangeC).toBe(0);
    expect(maxJacket).toBeGreaterThan(0.05);
    expect(w.events.totals.birth ?? 0).toBeGreaterThan(0);
    expect(carrierDeaths).toBeGreaterThan(0);
    expect(w.ledger.energy.construction).toBeGreaterThan(0);
    for (const e of ['c', 'n', 'm'] as const) {
      expect(worst[e]).toBeLessThan(1e-5);
      expect(worstAbs[e]).toBeLessThan(1e-8);
    }
    const t = computeTotals(w);
    console.info(
      `module-e11 conservation: worst relative C ${worst.c.toExponential(3)}, N ${worst.n.toExponential(3)}, M ${worst.m.toExponential(3)}; ` +
        `worst absolute C ${worstAbs.c.toExponential(3)}, N ${worstAbs.n.toExponential(3)}, M ${worstAbs.m.toExponential(3)}; max jacket ${maxJacket.toFixed(4)}; ` +
        `carrier losses ${carrierDeaths}; births ${w.events.totals.birth ?? 0}; deaths ${w.events.totals.death ?? 0}; captures ${w.events.totals.capture ?? 0}; ` +
        `silicate ${t.breakdown.silicate!.toFixed(4)} grit ${t.breakdown.grit!.toFixed(4)} body mineral ${t.breakdown.bodyMineral!.toFixed(4)}; construction E ${w.ledger.energy.construction.toFixed(3)}`,
    );
  }, 900_000);
});

describe('E11: NEUTRAL and content', () => {
  it('E11 and silicate recorded with no carrier: entity columns stay byte-identical (Object.is) to the shipped registry over 2,000 ticks', () => {
    const make = (reg: typeof REG_J) => {
      const w = clearWater({ backgroundOverrides: { sugar: 0.3 } }, reg);
      let n = 0;
      for (const [sp, x, y, count] of [['B01', 54.5, 60.5, 25], ['B03', 74.5, 68.5, 20], ['P01', 64.5, 64.5, 4], ['P02', 60.5, 70.5, 4]] as const) {
        applyNow(w, `neutral-${++n}`, { kind: 'inoculate', speciesId: sp, x, y, radius: 5, count });
      }
      return w;
    };
    // Both sides from the pre-organism-flip lists (D-0127): the shipped manifest records the subject itself since the flip.
    const a = make(preOrganismFlipRegistry());
    const b = make(preOrganismFlipRegistry({ modules: ['E11'], systems: ['silicate'] }));
    expect(a.species.map((s) => s.id)).toEqual(b.species.map((s) => s.id));
    const cols = Object.keys(a.ents.cols) as (keyof typeof a.ents.cols)[];
    for (let chunk = 0; chunk < 20; chunk++) {
      run(a, 100);
      run(b, 100);
      expect(b.ents.highWater).toBe(a.ents.highWater);
      for (const col of cols) {
        const x = a.ents.cols[col] as ArrayLike<number>;
        const y = b.ents.cols[col] as ArrayLike<number>;
        for (let i = 0; i < a.ents.highWater; i++) if (!Object.is(x[i], y[i])) throw new Error(`column ${String(col)} slot ${i} differs at tick ${a.tick}`);
      }
    }
    expect(a.tick).toBe(2000);
    expect(a.events.totals.birth ?? 0).toBeGreaterThan(0);
    expect(b.ledger.energy.construction).toBe(a.ledger.energy.construction);
  }, 300_000);

  it('E11\'s recorded numbers equal the constants coverage and handling use (they cannot drift apart)', () => {
    const p = REG_J.modules.E11!.params;
    expect(p.targetPerBody).toBe(JACKET_COVERAGE_FRACTION);
    expect(p.handlingBaseSeconds).toBe(HANDLING_JACKET_BASE_SECONDS);
    expect(p.handlingPerCoverage).toBe(HANDLING_JACKET_SECONDS_PER_COVERAGE);
    expect(p).toMatchObject({ buildRate: 0.005, energyPerMineral: 10, speedPenalty: 0.2, minEnergy: 15 });
    expect(REG_J.modules.E11!.surchargePerSecond).toBe(0.02);
  });
});
