/**
 * P3.7 stage 8 reservation order (SPEC §3.2 stage 8, §3.3; D04 §2 C08 and §9; actions.ts).
 *
 *  - The shipped table is fixed: natives by NativeAbility index, then E01, E09, E10; test tables are
 *    built from copies and never change it.
 *  - Mandatory costs come before optional ones, natives before modules, modules ascend — proved with
 *    synthetic, test-only actions passed to stageStructures (never shipped content).
 *  - An action refused because an earlier one took the energy reports its own low-energy code
 *    (SECRETION_ENERGY_LOW for secretion, ENERGY_LOW otherwise): conditions are checked against the
 *    energy remaining.
 *  - A non-Active organism runs no optional action and keeps its last secretionCode.
 *  - The generic producer action is bit-identical to the Phase 2 starch-only code: two g2 saves
 *    (native B06; E01 carriers) stepped 200 ticks with today's stage 8 and with a verbatim copy of the
 *    g2 stage 8 agree exactly on eStarch, E, secretionCode and ledger.energy.secretion every tick.
 * Test-only state (energy, starch) is set directly; material overrides are logged as ledger inputs.
 */
import { describe, expect, it } from 'vitest';
import { loadSaveFile } from '../../src/persistence/saveFile';
import {
  buildActionTable,
  mandatoryAction,
  moduleAction,
  nativeAction,
  STAGE8_ACTIONS,
  type ActionContext,
  type Stage8Action,
} from '../../src/sim/actions';
import { stageBirths } from '../../src/sim/births';
import { introduceOrganism, stageCommands } from '../../src/sim/commands';
import { NativeAbility } from '../../src/sim/content/schema';
import { DT, GRID_W } from '../../src/sim/constants';
import { stageContacts } from '../../src/sim/contacts';
import { stageConversion } from '../../src/sim/conversion';
import { dormancyStep } from '../../src/sim/dormancy';
import { FLAG, LIFE_ACTIVE, LIFE_RESTING } from '../../src/sim/entities';
import type { FieldId } from '../../src/sim/fields';
import { cellIndex } from '../../src/sim/grid';
import { stageIntake } from '../../src/sim/intake';
import { stageMaintenance } from '../../src/sim/maintenance';
import { stageSenseAndMove } from '../../src/sim/movement';
import type { StarchRules } from '../../src/sim/phenotype';
import { profileOf } from '../../src/sim/profiles';
import { realizeRecipe } from '../../src/sim/recipes';
import { stagePublish } from '../../src/sim/publish';
import { R } from '../../src/sim/reasons';
import { serializeWorld, stateHash } from '../../src/sim/serialize';
import { entityCell, rebuildIndex } from '../../src/sim/spatial';
import { stageStructures } from '../../src/sim/structures';
import { markField, stageEnvironment } from '../../src/sim/transport';
import { speciesIndex, type World } from '../../src/sim/world';
import { FENCE_TRANSFORMS } from '../helpers/fence';
import { readG2SaveText } from '../helpers/g2-saves';
import { G2_LISTS, registryWith } from '../helpers/registry';
import { clearWater, setField } from '../helpers/world';

/** Place one organism (optionally carrying modules) at a cell centre; energy override is test-only state. */
function placeAt(w: World, speciesId: string, cx: number, cy: number, E: number, modules: readonly string[] = []): number {
  const slot = introduceOrganism(w, speciesIndex(w, speciesId), cellIndex(cx, cy), 'test', { modules, exactCenter: true });
  if (slot < 0) throw new Error('capacity');
  w.ents.cols.x[slot] = cx + 0.5;
  w.ents.cols.y[slot] = cy + 0.5;
  w.ents.cols.E[slot] = E;
  rebuildIndex(w);
  return slot;
}

function starchAround(w: World, cx: number, cy: number): void {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) setField(w, 'starch', cellIndex(cx + dx, cy + dy), 0.6);
}

interface LogRow {
  readonly key: string;
  readonly slot: number;
  /** Energy remaining when the action started (after earlier actions' commits and reservations). */
  readonly seen: number;
  readonly outcome: number;
}

/**
 * A test-only action: needs remaining E > `min`, then spends `cost` into ledger.energy.other.
 * Refused with ENERGY_LOW otherwise. Every attempt is logged.
 */
function costly(log: LogRow[], min: number, cost: number): Stage8Action['run'] {
  return (ctx: ActionContext) => {
    const seen = ctx.remainingEnergy();
    let outcome: number = R.ENERGY_LOW;
    if (seen > min && seen >= cost) {
      ctx.spend(cost, 'other');
      outcome = R.NONE;
    }
    log.push({ key: '', slot: ctx.i, seen, outcome });
    return outcome;
  };
}

const always: Stage8Action['applies'] = () => true;

function tag(log: LogRow[], key: string, run: Stage8Action['run']): Stage8Action['run'] {
  return (ctx) => {
    const n = log.length;
    const out = run(ctx);
    for (let k = n; k < log.length; k++) log[k] = { ...log[k]!, key };
    return out;
  };
}

function testNative(log: LogRow[], key: (typeof NativeAbility.options)[number], min = 0, cost = 1): Stage8Action {
  return nativeAction(key, always, tag(log, key, costly(log, min, cost)));
}
function testModule(log: LogRow[], key: string, min = 0, cost = 1): Stage8Action {
  return moduleAction(key, always, tag(log, key, costly(log, min, cost)));
}
function testMandatory(log: LogRow[], key: string, id: number, min = 0, cost = 1): Stage8Action {
  return mandatoryAction(key, id, always, tag(log, key, costly(log, min, cost)));
}

describe('P3.7 stage 8: the action table', () => {
  it('native action IDs are the NativeAbility enum index (E_STARCH 0 < E_OIL 1 < E_PROTEIN 2 < BIOFILM 3)', () => {
    expect(NativeAbility.options.slice(0, 4)).toEqual(['E_STARCH_SECRETION', 'E_OIL_SECRETION', 'E_PROTEIN_SECRETION', 'BIOFILM']);
    expect(nativeAction('BIOFILM', always, () => R.NONE).id).toBe(3);
    expect(moduleAction('E10', always, () => R.NONE).id).toBe(10);
    expect(() => moduleAction('X01', always, () => R.NONE)).toThrow(/not a module id/);
  });

  it('the shipped table: native starch, oil, protein producers, biofilm (wave 2), then E01, E09, E10 — frozen and untouched by test tables', () => {
    const shape = (t: readonly Stage8Action[]) => t.map((a) => `${a.tier}:${a.key}:${a.id}`);
    const before = shape(STAGE8_ACTIONS);
    expect(before).toEqual(['native:E_STARCH_SECRETION:0', 'native:E_OIL_SECRETION:1', 'native:E_PROTEIN_SECRETION:2', 'native:BIOFILM:3', 'module:E01:1', 'module:E09:9', 'module:E10:10']);
    expect(Object.isFrozen(STAGE8_ACTIONS)).toBe(true);
    const log: LogRow[] = [];
    const t = buildActionTable([testModule(log, 'E04'), ...STAGE8_ACTIONS, testNative(log, 'SIGNAL_GLOW'), testMandatory(log, 'M', 0)]);
    expect(shape(t)).toEqual(['mandatory:M:0', ...before.slice(0, 4), 'native:SIGNAL_GLOW:5', 'module:E01:1', 'module:E04:4', 'module:E09:9', 'module:E10:10']);
    expect(shape(STAGE8_ACTIONS)).toEqual(before);
    expect(() => buildActionTable([testModule(log, 'E04'), testModule(log, 'E04')])).toThrow(/duplicate/);
  });
});

describe('P3.7 stage 8: reservation order', () => {
  it('mandatory → natives by ID → modules ascending, whatever order they were registered in; each sees only what is left', () => {
    const w = clearWater();
    const s = placeAt(w, 'B01', 64, 64, 60);
    const log: LogRow[] = [];
    const table = buildActionTable([
      testModule(log, 'E04'),
      testNative(log, 'RIVALRY'),
      testModule(log, 'E02'),
      testMandatory(log, 'M1', 1),
      testNative(log, 'SIGNAL_GLOW'),
      testMandatory(log, 'M0', 0),
    ]);
    const other0 = w.ledger.energy.other;
    stageStructures(w, table);
    expect(log.map((r) => r.key)).toEqual(['M0', 'M1', 'SIGNAL_GLOW', 'RIVALRY', 'E02', 'E04']);
    // Each action saw exactly the energy the earlier ones left: 60, 59, 58, …
    expect(log.map((r) => r.seen)).toEqual([60, 59, 58, 57, 56, 55]);
    expect(w.ents.cols.E[s]).toBe(54);
    expect(w.ledger.energy.other - other0).toBe(6);
  });

  it('mandatory costs come before optional ones: a mandatory cost leaves a native B06 too little to secrete (SECRETION_ENERGY_LOW)', () => {
    const run = (withMandatory: boolean) => {
      const w = clearWater();
      starchAround(w, 64, 64);
      const s = placeAt(w, 'B06', 64, 64, 35.03);
      const log: LogRow[] = [];
      const extra = withMandatory ? [testMandatory(log, 'M', 0, 35, 0.04)] : [];
      stageStructures(w, buildActionTable([...STAGE8_ACTIONS, ...extra]));
      return { w, s, log };
    };
    const control = run(false);
    expect(control.w.ents.cols.secretionCode[control.s]).toBe(R.SECRETING);
    const t = run(true);
    expect(t.log.map((r) => [r.key, r.outcome])).toEqual([['M', R.NONE]]);
    expect(t.w.ents.cols.E[t.s]).toBeCloseTo(34.99, 12);
    expect(t.w.ents.cols.secretionCode[t.s]).toBe(R.SECRETION_ENERGY_LOW);
    expect(t.w.ents.cols.secreting[t.s]).toBe(0);
    expect(t.w.ledger.energy.secretion).toBe(0);
  });

  it('natives come before modules: a native cost refuses an E01 carrier\'s secretion; a later module is refused with ENERGY_LOW', () => {
    const run = (extra: (log: LogRow[]) => Stage8Action[]) => {
      const w = clearWater();
      starchAround(w, 64, 64);
      const s = placeAt(w, 'B01', 64, 64, 35.03, ['E01']);
      expect(profileOf(w, s).starch?.source).toBe('E01');
      const log: LogRow[] = [];
      stageStructures(w, buildActionTable([...STAGE8_ACTIONS, ...extra(log)]));
      return { w, s, log };
    };
    // A native test action (SIGNAL_GLOW, ID 5) runs before the E01 module action and takes 0.04.
    const a = run((log) => [testNative(log, 'SIGNAL_GLOW', 35, 0.04)]);
    expect(a.log.map((r) => [r.key, r.outcome])).toEqual([['SIGNAL_GLOW', R.NONE]]);
    expect(a.w.ents.cols.secretionCode[a.s]).toBe(R.SECRETION_ENERGY_LOW);
    expect(a.w.ledger.energy.secretion).toBe(0);
    // A module test action after E01 (E02) is the one refused, with its own code ENERGY_LOW.
    const b = run((log) => [testModule(log, 'E02', 35, 0.04)]);
    expect(b.w.ents.cols.secretionCode[b.s]).toBe(R.SECRETING);
    expect(b.log.map((r) => [r.key, r.outcome])).toEqual([['E02', R.ENERGY_LOW]]);
    expect(b.log[0]!.seen).toBe(35.03 - 0.4 * DT);
  });

  it('modules ascend: E02 before E04 whichever is registered first; the later one is refused with ENERGY_LOW', () => {
    for (const order of [['E02', 'E04'], ['E04', 'E02']]) {
      const w = clearWater();
      const s = placeAt(w, 'B01', 64, 64, 35.03);
      const log: LogRow[] = [];
      stageStructures(w, buildActionTable(order.map((k) => testModule(log, k, 35, 0.04))));
      expect(log.map((r) => [r.key, r.outcome])).toEqual([
        ['E02', R.NONE],
        ['E04', R.ENERGY_LOW],
      ]);
      expect(w.ents.cols.E[s]).toBe(35.03 - 0.04);
    }
  });

  it('a non-Active organism runs no optional action and keeps its last secretionCode', () => {
    const w = clearWater();
    starchAround(w, 64, 64);
    const s = placeAt(w, 'B06', 64, 64, 60, ['E03']);
    const c = w.ents.cols;
    c.lifeState[s] = LIFE_RESTING; // test-only state
    c.secretionCode[s] = R.SECRETION_SATURATED;
    c.secreting[s] = 1;
    c.flags[s] = c.flags[s]! | FLAG.secreting;
    const log: LogRow[] = [];
    stageStructures(w, buildActionTable([...STAGE8_ACTIONS, testMandatory(log, 'M', 0), testModule(log, 'E02')]));
    expect(log).toEqual([]);
    expect(c.secretionCode[s]).toBe(R.SECRETION_SATURATED);
    expect(c.secreting[s]).toBe(0);
    expect(c.flags[s] & FLAG.secreting).toBe(0);
    expect(w.ledger.energy.secretion).toBe(0);
  });

  it('an action can never spend energy an earlier action took or reserved', () => {
    const w = clearWater();
    placeAt(w, 'B01', 64, 64, 1);
    const greedy = moduleAction('E02', always, (ctx) => {
      ctx.spend(ctx.remainingEnergy() + 1e-9, 'other');
      return R.NONE;
    });
    expect(() => stageStructures(w, buildActionTable([greedy]))).toThrow(/exceeds/);
  });
});

// ---------------------------------------------------------------------------------------------
// The g2 stage 8, verbatim (structures.ts at f6a7dc2), for the bit-identity check below.

function g2SubstrateNear(sub: Float64Array, cell: number): boolean {
  if (sub[cell]! > 0) return true;
  const x = cell % GRID_W;
  if (x + 1 < GRID_W && sub[cell + 1]! > 0) return true;
  if (x > 0 && sub[cell - 1]! > 0) return true;
  if (cell + GRID_W < sub.length && sub[cell + GRID_W]! > 0) return true;
  if (cell - GRID_W >= 0 && sub[cell - GRID_W]! > 0) return true;
  return false;
}

function g2Secrete(world: World, i: number, rules: StarchRules, activity: FieldId, substrate: FieldId): number {
  const c = world.ents.cols;
  const act = world.fields[activity];
  const sub = world.fields[substrate];
  if (!act || !sub) return R.SECRETION_NO_SUBSTRATE;
  if (c.E[i]! <= rules.minEnergy) return R.SECRETION_ENERGY_LOW;
  const cell = entityCell(c.x[i]!, c.y[i]!);
  if (!g2SubstrateNear(sub, cell)) return R.SECRETION_NO_SUBSTRATE;
  if (act[cell]! >= rules.localCap) return R.SECRETION_SATURATED;
  const cost = rules.emitCost * DT;
  if (c.E[i]! < cost) return R.SECRETION_ENERGY_LOW;
  c.E[i]! -= cost;
  world.ledger.energy.secretion += cost;
  act[cell]! += rules.emitRate * DT;
  markField(world, activity);
  return R.SECRETING;
}

function g2StageStructures(world: World): void {
  const e = world.ents;
  const c = e.cols;
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    c.secreting[i] = 0;
    c.flags[i] = c.flags[i]! & ~FLAG.secreting;
    const prof = profileOf(world, i);
    dormancyStep(world, i, prof);
    if (c.lifeState[i] !== LIFE_ACTIVE) continue;
    if (prof.starch !== null) {
      const outcome = g2Secrete(world, i, prof.starch, 'eStarch', 'starch');
      c.secretionCode[i] = outcome;
      if (outcome === R.SECRETING) {
        c.secreting[i] = 1;
        c.flags[i] = c.flags[i]! | FLAG.secreting;
      }
    }
  }
}

/** One tick in the canonical order (tick.ts), with stage 8 either today's or the g2 copy. */
function stepWith(world: World, stage8: (w: World) => void): void {
  stageCommands(world);
  stageEnvironment(world);
  stageConversion(world);
  stageSenseAndMove(world);
  stageContacts(world);
  stageIntake(world);
  stageMaintenance(world);
  stage8(world);
  stageBirths(world);
  stagePublish(world);
  world.tick++;
}

function same(a: ArrayLike<number>, b: ArrayLike<number>, n: number): boolean {
  for (let k = 0; k < n; k++) if (!Object.is(a[k], b[k])) return false;
  return true;
}

interface Pair {
  readonly now: World;
  readonly g2: World;
}

/** Compare today's stage 8 with the g2 copy for `ticks` ticks; returns producer/secretion counts for `source`. */
function compareRun({ now, g2 }: Pair, ticks: number, source: 'native' | 'E01'): { producers: number; secreted: number; paid: number } {
  let producers = 0;
  let secreted = 0;
  const paid0 = now.ledger.energy.secretion;
  for (let t = 0; t < ticks; t++) {
    stepWith(now, (w) => stageStructures(w));
    stepWith(g2, g2StageStructures);
    const a = now.ents.cols;
    const b = g2.ents.cols;
    expect(now.ents.highWater).toBe(g2.ents.highWater);
    const n = now.ents.highWater;
    expect(same(now.fields.eStarch!, g2.fields.eStarch!, now.fields.eStarch!.length), `eStarch at tick ${now.tick}`).toBe(true);
    expect(same(a.E, b.E, n), `E at tick ${now.tick}`).toBe(true);
    expect(same(a.secretionCode, b.secretionCode, n), `secretionCode at tick ${now.tick}`).toBe(true);
    expect(same(a.secreting, b.secreting, n), `secreting at tick ${now.tick}`).toBe(true);
    expect(same(a.flags, b.flags, n), `flags at tick ${now.tick}`).toBe(true);
    expect(Object.is(now.ledger.energy.secretion, g2.ledger.energy.secretion), `ledger secretion at tick ${now.tick}`).toBe(true);
    for (let i = 0; i < n; i++) {
      if (a.alive[i] !== 1 || profileOf(now, i).starch?.source !== source) continue;
      producers++;
      if (a.secreting[i] === 1) secreted++;
    }
  }
  // The world states agree whole, not only in the compared columns.
  expect(stateHash(now)).toBe(stateHash(g2));
  expect(JSON.stringify(serializeWorld(now))).toBe(JSON.stringify(serializeWorld(g2)));
  return { producers, secreted, paid: now.ledger.energy.secretion - paid0 };
}

/** STARCH_UNLOCK_V1 from tick 0 under the g2 content lists, as tools/make-g2-saves.ts built the two saves. */
function fresh(e01: boolean): World {
  const reg = registryWith(G2_LISTS);
  return e01
    ? realizeRecipe(reg, 'STARCH_UNLOCK_V1', { worldId: 'g2-starch-unlock-e01', transform: FENCE_TRANSFORMS.e01Carriers, provenance: { recipeId: null, recipeRevision: null, createdFrom: 'test' } })
    : realizeRecipe(reg, 'STARCH_UNLOCK_V1', { worldId: 'g2-starch-unlock' });
}

describe('P3.7 stage 8: the generic producer action is bit-identical to the g2 starch code', () => {
  for (const [file, source] of [
    ['starch-unlock-t900.pixelmeba.gz', 'native'],
    ['starch-unlock-e01-carriers-t900.pixelmeba.gz', 'E01'],
  ] as const) {
    it(`${file}: 200 ticks after loading, eStarch, E, secretionCode and ledger secretion equal every tick (${source} producers)`, { timeout: 300_000 }, async () => {
      const text = readG2SaveText(file);
      const r = compareRun({ now: (await loadSaveFile(text)).world, g2: (await loadSaveFile(text)).world }, 200, source);
      // At t900 these producers are alive but too low on energy to secrete (the refusal path).
      expect(r.producers).toBeGreaterThan(0);
    });

    it(`the same dish from tick 0 (g2 content lists), 400 ticks while the ${source} producers secrete`, { timeout: 300_000 }, () => {
      const e01 = source === 'E01';
      const r = compareRun({ now: fresh(e01), g2: fresh(e01) }, 400, source);
      expect(r.producers).toBeGreaterThan(0);
      expect(r.secreted).toBeGreaterThan(100);
      expect(r.paid).toBeGreaterThan(0);
    });
  }
});
