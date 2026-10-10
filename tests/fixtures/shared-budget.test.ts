/**
 * Fixture C08 — shared budget (D04 §2 C08 and §9; SPEC §3.2 stage 8, §3.3; P3.7).
 *
 * Several simultaneous abilities can spend the same energy: every successful action reserves its
 * cost before another action can use the remainder. Two registered test actions, each needing
 * E > 35 and costing 0.04, on an organism with E = 35.03: the first fires (leaving 34.99) and the
 * second is refused; reversing their order refuses the other one. Σ energy spent in the tick equals
 * Σ of the ledger's energy categories, and no action ever sees energy another action reserved.
 * The same holds with a real action (native starch secretion, 0.40 E/s × 0.1 s) ahead of a test
 * module action.
 *
 * W4-17 with real modules (registryWith the shipped manifest plus E09 and E10; the lead enables them
 * after the wave): a B04 carrying E01 + E09 + E10 with starch and protein beside it, a body 0.003 C
 * above 1.2 B0' and its cell's film at 0.498. Energy entering stage 8 is set to 35.042 with step's
 * afterStage hook at stage 7 (labelled test state). In the shipped order E01, E09, E10: E01 releases
 * (35.002 left), E09 releases (34.962), E10 is refused with its energy reason (ENERGY_LOW) and builds
 * nothing. In a test-only order E10, E01, E09: E10 reserves 0.004 (35.038 left), E01 releases
 * (34.998), E09 is refused (SECRETION_ENERGY_LOW); the pass charges E10 2 E per accepted C. Nothing is
 * double-spent: Σ energy spent = Σ ledger categories, construction included.
 * Test-only state (energy, body, starch, protein, film) is set directly; material overrides are logged
 * as ledger inputs.
 */
import { describe, expect, it } from 'vitest';
import { buildActionTable, moduleAction, nativeAction, STAGE8_ACTIONS, type ActionContext, type Stage8Action } from '../../src/sim/actions';
import { introduceOrganism } from '../../src/sim/commands';
import { DT } from '../../src/sim/constants';
import { cellIndex } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { matrixBuiltNow } from '../../src/sim/matrixBuilder';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { PRODUCER_BIT } from '../../src/sim/secretion';
import { rebuildIndex } from '../../src/sim/spatial';
import { stageStructures } from '../../src/sim/structures';
import { step } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, registry, setField } from '../helpers/world';

type Energy = World['ledger']['energy'];

function placeAt(w: World, speciesId: string, E: number): number {
  const slot = introduceOrganism(w, speciesIndex(w, speciesId), cellIndex(64, 64), 'test', { exactCenter: true });
  if (slot < 0) throw new Error('capacity');
  w.ents.cols.x[slot] = 64.5;
  w.ents.cols.y[slot] = 64.5;
  w.ents.cols.E[slot] = E; // test-only state
  rebuildIndex(w);
  return slot;
}

/** Σ of every energy category the ledger records as spent or lost (everything but `earned`). */
function spentTotal(e: Energy): number {
  let s = 0;
  for (const k of Object.keys(e).sort() as (keyof Energy)[]) if (k !== 'earned') s += e[k];
  return s;
}

interface Attempt {
  readonly name: string;
  readonly seen: number;
  readonly outcome: number;
}

/** A test action: needs remaining E > 35, then spends 0.04 (ledger 'other'); ENERGY_LOW otherwise. */
function needs35(log: Attempt[], name: string): Stage8Action['run'] {
  return (ctx: ActionContext) => {
    const seen = ctx.remainingEnergy();
    const ok = seen > 35;
    if (ok) ctx.spend(0.04, 'other');
    log.push({ name, seen, outcome: ok ? R.NONE : R.ENERGY_LOW });
    return ok ? R.NONE : R.ENERGY_LOW;
  };
}

const always: Stage8Action['applies'] = () => true;

function runOnce(order: 'A first' | 'B first'): { w: World; slot: number; log: Attempt[]; E0: number; ledger0: Energy } {
  const w = clearWater();
  const slot = placeAt(w, 'B01', 35.03);
  const log: Attempt[] = [];
  // Two module-tier test actions; whichever has the lower module number runs first.
  const [idA, idB] = order === 'A first' ? ['E02', 'E04'] : ['E04', 'E02'];
  const table = buildActionTable([moduleAction(idA, always, needs35(log, 'A')), moduleAction(idB, always, needs35(log, 'B'))]);
  const ledger0 = { ...w.ledger.energy };
  const E0 = w.ents.cols.E[slot]!;
  stageStructures(w, table);
  return { w, slot, log, E0, ledger0 };
}

describe('C08 shared budget (D04 §2): one energy budget, reserved in order', () => {
  it('E = 35.03, two actions needing E > 35 at 0.04 each: the first fires (34.99 left), the second is refused', () => {
    const { w, slot, log, E0, ledger0 } = runOnce('A first');
    expect(log.map((a) => [a.name, a.outcome])).toEqual([
      ['A', R.NONE],
      ['B', R.ENERGY_LOW],
    ]);
    expect(log[0]!.seen).toBe(35.03);
    // The second saw exactly what the first left: never the energy the first took.
    expect(log[1]!.seen).toBe(35.03 - 0.04);
    expect(log[1]!.seen).toBeCloseTo(34.99, 12);
    expect(w.ents.cols.E[slot]).toBe(35.03 - 0.04);
    // Σ energy spent in the tick = Σ ledger energy categories.
    expect(E0 - w.ents.cols.E[slot]!).toBeCloseTo(spentTotal(w.ledger.energy) - spentTotal(ledger0), 13);
    expect(w.ledger.energy.other - ledger0.other).toBe(0.04);
  });

  it('reversing their order refuses the other one', () => {
    const { w, slot, log } = runOnce('B first');
    expect(log.map((a) => [a.name, a.outcome])).toEqual([
      ['B', R.NONE],
      ['A', R.ENERGY_LOW],
    ]);
    expect(log[1]!.seen).toBe(35.03 - 0.04);
    expect(w.ents.cols.E[slot]).toBe(35.03 - 0.04);
  });

  it('a real action first: native starch secretion (0.04 E) leaves a later module action needing E > 35 refused', () => {
    const w = clearWater();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) setField(w, 'starch', cellIndex(64 + dx, 64 + dy), 0.6);
    const slot = placeAt(w, 'B06', 35.03);
    const log: Attempt[] = [];
    const ledger0 = { ...w.ledger.energy };
    stageStructures(w, buildActionTable([...STAGE8_ACTIONS, moduleAction('E02', always, needs35(log, 'E02'))]));
    expect(w.ents.cols.secretionCode[slot]).toBe(R.SECRETING);
    expect(w.ledger.energy.secretion - ledger0.secretion).toBe(0.4 * DT);
    expect(log).toEqual([{ name: 'E02', seen: 35.03 - 0.4 * DT, outcome: R.ENERGY_LOW }]);
    expect(35.03 - w.ents.cols.E[slot]!).toBeCloseTo(spentTotal(w.ledger.energy) - spentTotal(ledger0), 13);
  });

  it('a native action runs before a module action registered ahead of it; the module is refused (no refund, no retry)', () => {
    const w = clearWater();
    const slot = placeAt(w, 'B01', 35.03);
    const log: Attempt[] = [];
    // The native runs first and spends; the module after it is refused; nothing is retried or refunded.
    stageStructures(w, buildActionTable([moduleAction('E02', always, needs35(log, 'module')), nativeAction('SIGNAL_GLOW', always, needs35(log, 'native'))]));
    expect(log.map((a) => [a.name, a.outcome])).toEqual([
      ['native', R.NONE],
      ['module', R.ENERGY_LOW],
    ]);
    expect(w.ents.cols.E[slot]).toBe(35.03 - 0.04);
  });
});

// ---- W4-17: the shared budget with real modules (E01, E09, E10) ---------------------------------

const REG_E09_E10 = registryWith({ enabledModules: [...registry().manifest.enabledModules, 'E09', 'E10'].sort() });
const E_AT_STAGE_8 = 35.042;
const X = 64;
const Y = 64;
const CELL = cellIndex(X, Y);

/** Clear water under the shipped manifest + E09/E10, a B04 carrying E01 + E09 + E10, starch and protein beside it. */
function c08World(): { w: World; s: number } {
  const base = REG_E09_E10.recipes.FIRST_DISH_V1!;
  const w = realizeRecipe(
    REG_E09_E10,
    { ...base, id: 'TEST_C08', removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0 }, mutationPreset: 'fixed' },
    { worldId: 'c08' },
  );
  // Substrate in the four neighbours only (labelled test state), so the carrier eats none of it before stage 8.
  setField(w, 'starch', cellIndex(X + 1, Y), 0.6);
  setField(w, 'protein', cellIndex(X - 1, Y), 0.6);
  setField(w, 'film', CELL, 0.498);
  const s = introduceOrganism(w, speciesIndex(w, 'B04'), CELL, 'test', { modules: ['E01', 'E09', 'E10'], exactCenter: true });
  if (s < 0) throw new Error('capacity');
  const c = w.ents.cols;
  c.x[s] = X + 0.5;
  c.y[s] = Y + 0.5;
  const B = 1.2 * profileOf(w, s).b0 + 0.003; // test-only: B > 1.2 B0' + 0.002
  w.ledger.inputs.c += B - c.B[s]!;
  c.B[s] = B;
  c.E[s] = 60;
  rebuildIndex(w);
  return { w, s };
}

interface RealAttempt {
  readonly key: string;
  readonly seen: number;
  readonly outcome: number;
}

/** The shipped actions with their runs wrapped to log the energy each saw and its outcome (same keys, IDs, rules). */
function logged(table: readonly Stage8Action[], log: RealAttempt[]): Stage8Action[] {
  return table.map((a) => ({ ...a, run: (ctx: ActionContext) => {
    const seen = ctx.remainingEnergy();
    const outcome = a.run(ctx);
    log.push({ key: a.key, seen, outcome });
    return outcome;
  } }));
}

function byKey(key: string): Stage8Action {
  const a = STAGE8_ACTIONS.find((x) => x.key === key);
  if (!a) throw new Error(`no shipped action ${key}`);
  return a;
}

describe('C08 shared budget with real modules (W4-17): a B04 carrying E01 + E09 + E10', () => {
  it('the carrier has all three rules from the recorded registry, and E01, E09, E10 ascend in the shipped table', () => {
    const { w, s } = c08World();
    const prof = profileOf(w, s);
    expect(prof.starch?.source).toBe('E01');
    expect(prof.protein?.source).toBe('E09');
    expect(prof.builder).toEqual({ source: 'E10', minEnergy: 35, ratePerSecond: 0.02, bodyFloor: 1.2, energyPerC: 2, filmCap: 0.5 });
    const keys = STAGE8_ACTIONS.filter((a) => a.tier === 'module').map((a) => a.key);
    expect(keys).toEqual(['E01', 'E09', 'E10']);
  });

  it('shipped order through step (energy set at stage 7): E01 releases, E09 releases, E10 is refused for energy and builds nothing', () => {
    const { w, s } = c08World();
    const c = w.ents.cols;
    let B7 = 0;
    let film7 = 0;
    let ledger7: Energy | null = null;
    step(w, {
      afterStage: (stage, world) => {
        if (stage !== 7) return;
        world.ents.cols.E[s] = E_AT_STAGE_8; // labelled test state: the energy entering stage 8
        B7 = world.ents.cols.B[s]!;
        film7 = world.fields.film![CELL]!;
        ledger7 = { ...world.ledger.energy };
      },
    });
    const L = ledger7 as unknown as Energy;
    expect(B7).toBeGreaterThan(1.2 * profileOf(w, s).b0 + 0.002);
    expect(film7).toBeLessThanOrEqual(0.498);
    // E01 then E09 each paid 0.40 E/s × 0.1 s; E10 was refused: no construction, no film, no body moved.
    expect(w.ledger.energy.secretion - L.secretion).toBeCloseTo(2 * 0.4 * DT, 14);
    expect(w.ledger.energy.construction - L.construction).toBe(0);
    expect(c.E[s]).toBeCloseTo(E_AT_STAGE_8 - 0.04 - 0.04, 12);
    expect(c.E[s]).toBeCloseTo(34.962, 12);
    expect(c.B[s]).toBe(B7);
    expect(w.fields.film![CELL]).toBe(film7);
    // Each producer set its own bit; E10 was not accepted.
    expect(c.secreting[s]).toBe(PRODUCER_BIT.starch | PRODUCER_BIT.protein);
    expect(c.secretionCode[s]).toBe(R.SECRETING);
    expect(matrixBuiltNow(w, s)).toBe(false);
    // Σ energy spent in stage 8 = Σ ledger categories (nothing double-spent).
    expect(E_AT_STAGE_8 - c.E[s]!).toBeCloseTo(spentTotal(w.ledger.energy) - spentTotal(L), 13);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('shipped order, each action logged: E01 sees 35.042, E09 sees 35.002, E10 sees 34.962 and returns ENERGY_LOW', () => {
    const { w, s } = c08World();
    w.ents.cols.E[s] = E_AT_STAGE_8; // labelled test state (stage 8 alone)
    const log: RealAttempt[] = [];
    const L = { ...w.ledger.energy };
    stageStructures(w, logged(STAGE8_ACTIONS, log));
    expect(log.map((a) => [a.key, a.outcome])).toEqual([
      ['E01', R.SECRETING],
      ['E09', R.SECRETING],
      ['E10', R.ENERGY_LOW],
    ]);
    expect(log[0]!.seen).toBe(E_AT_STAGE_8);
    expect(log[1]!.seen).toBeCloseTo(35.002, 12);
    expect(log[2]!.seen).toBeCloseTo(34.962, 12);
    expect(w.ledger.energy.construction - L.construction).toBe(0);
    expect(E_AT_STAGE_8 - w.ents.cols.E[s]).toBeCloseTo(spentTotal(w.ledger.energy) - spentTotal(L), 13);
  });

  it('test-only order E10, E01, E09: E10 reserves 0.004 (35.038 left), E01 releases (34.998), E09 is refused; E10 pays 2 E per accepted C', () => {
    const { w, s } = c08World();
    const c = w.ents.cols;
    c.E[s] = E_AT_STAGE_8; // labelled test state
    const B0 = c.B[s]!;
    const N0 = c.N[s]!;
    const film0 = w.fields.film![CELL]!;
    const log: RealAttempt[] = [];
    const L = { ...w.ledger.energy };
    // A raw array (not buildActionTable, which would sort it back): test-only order, never shipped.
    stageStructures(w, logged([byKey('E10'), byKey('E01'), byKey('E09')], log));
    expect(log.map((a) => [a.key, a.outcome])).toEqual([
      ['E10', R.NONE],
      ['E01', R.SECRETING],
      ['E09', R.SECRETION_ENERGY_LOW],
    ]);
    expect(log[0]!.seen).toBe(E_AT_STAGE_8);
    expect(log[1]!.seen).toBeCloseTo(35.038, 12); // E10's 0.004 is held, not available
    expect(log[2]!.seen).toBeCloseTo(34.998, 12);
    // The pass accepted the whole 0.002 C (headroom 0.002) and charged exactly 2 E × accepted.
    const accepted = B0 - c.B[s]!;
    expect(accepted).toBeCloseTo(0.002, 14);
    expect(w.fields.film![CELL]! - film0).toBeCloseTo(accepted, 14);
    expect(w.fields.film![CELL]).toBeLessThanOrEqual(0.5);
    expect(N0 - c.N[s]!).toBeCloseTo((N0 * accepted) / B0, 15);
    expect(w.ledger.energy.construction - L.construction).toBeCloseTo(2 * accepted, 14);
    expect(w.ledger.energy.secretion - L.secretion).toBeCloseTo(0.4 * DT, 14);
    expect(c.E[s]).toBeCloseTo(34.998, 12);
    expect(c.secreting[s]).toBe(PRODUCER_BIT.starch);
    expect(matrixBuiltNow(w, s)).toBe(true);
    expect(E_AT_STAGE_8 - c.E[s]).toBeCloseTo(spentTotal(w.ledger.energy) - spentTotal(L), 13);
    expect(checkLedger(w).ok).toBe(true);
  });
});
