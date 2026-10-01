/**
 * Fixture C08 — shared budget (D04 §2 C08 and §9; SPEC §3.2 stage 8, §3.3; P3.7).
 *
 * Several simultaneous abilities can spend the same energy: every successful action reserves its
 * cost before another action can use the remainder. Two registered test actions, each needing
 * E > 35 and costing 0.04, on an organism with E = 35.03: the first fires (leaving 34.99) and the
 * second is refused; reversing their order refuses the other one. Σ energy spent in the tick equals
 * Σ of the ledger's energy categories, and no action ever sees energy another action reserved.
 * The same holds with a real action (native starch secretion, 0.40 E/s × 0.1 s) ahead of a test
 * module action. Wave 4 extends this file with real modules.
 * Test-only state (energy, starch) is set directly; material overrides are logged as ledger inputs.
 */
import { describe, expect, it } from 'vitest';
import { buildActionTable, moduleAction, nativeAction, STAGE8_ACTIONS, type ActionContext, type Stage8Action } from '../../src/sim/actions';
import { introduceOrganism } from '../../src/sim/commands';
import { DT } from '../../src/sim/constants';
import { cellIndex } from '../../src/sim/grid';
import { R } from '../../src/sim/reasons';
import { rebuildIndex } from '../../src/sim/spatial';
import { stageStructures } from '../../src/sim/structures';
import { speciesIndex, type World } from '../../src/sim/world';
import { clearWater, setField } from '../helpers/world';

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
