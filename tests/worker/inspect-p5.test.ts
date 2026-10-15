/**
 * Wave 13 org-ui: the optional Phase 5 EntityInspect fields equal the columns and the simulation's own readers
 * (src/worker/snapshot.ts phase5Lines; D-0124), each for a state reached by stepping: a real trap hold, a real
 * P10 handling attempt (both ends), an A04 in each mode, an E11 carrier with a built jacket, a glowing B09, a
 * Phase 5 emitter's secretion and a RIVAL target in rivalry chemical. A v1.0 organism gains no key, and its
 * predation code and sugar sources read as before. CellInspect.exposure keeps its rival line when the dish has
 * no inhibitor line (D-0120 carry-over). The experiments' secretion share counts starch only by its producer bit.
 * Registry REG_O (as tests/worker/cue3-org.test.ts) with allowUnimplemented: TRAP is appended at the wave 13
 * integration, E11 and E02 at the organism flip.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { loadSaveFile } from '../../src/persistence/saveFile';
import { PRODUCER_BIT } from '../../src/sim/secretion';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex, maskCells, SUB_SEDIMENT } from '../../src/sim/grid';
import { jacketView } from '../../src/sim/jacket';
import { MODE_PHOTO, MODE_SUGAR } from '../../src/sim/mixotrophy';
import { profileOf } from '../../src/sim/profiles';
import { R, reasonName } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { sensedSignal } from '../../src/sim/signals';
import { entityCell, rebuildIndex } from '../../src/sim/spatial';
import { step, type StepHooks } from '../../src/sim/tick';
import { heldView, trapView } from '../../src/sim/traps';
import { markField } from '../../src/sim/transport';
import { sampleArm, starchSecretionCode } from '../../src/sim/experiments';
import { speciesIndex, type World } from '../../src/sim/world';
import type { EntityInspect } from '../../src/worker/protocol';
import { buildInspector, phase5Lines, sugarSourcesOf } from '../../src/worker/snapshot';
import { RC1_SAVE_FILES, readRc1SaveText, resumeRc1 } from '../helpers/rc1-saves';
import { registryWith } from '../helpers/registry';
import { clearWater, fillField, place, placeWith, preOrganismFlipRegistry, registry, setField } from '../helpers/world';
const shipped = registry().manifest;
// Wave 13: TRAP (F03) is appended at the integration, E11 at the organism flip (allowUnimplemented until then).
const REG_O = registryWith(
  {
    enabledSpecies: [...shipped.enabledSpecies, 'A04', 'B09', 'B13', 'F03', 'P07', 'P10'].sort(),
    enabledModules: [...shipped.enabledModules, 'E11'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'signals', 'rivalry', 'silicate'].sort() as SystemFlag[],
    enabledMaterials: [...shipped.enabledMaterials, 'M08'].sort(),
  },
  { allowUnimplemented: true },
);
const NEW_KEYS = ['trap', 'heldBy', 'handling', 'beingHandled', 'mode', 'jacket', 'signal', 'secretion', 'rival'] as const;

function inspect(w: World, slot: number): EntityInspect {
  const p = buildInspector(w, { kind: 'entity', birthId: w.ents.cols.birthId[slot]! });
  expect(p.kind).toBe('entity');
  return p.entity!;
}

function pinned(w: World, pins: readonly (readonly [number, number, number])[]): StepHooks {
  return {
    afterStage: (s) => {
      if (s !== 4) return;
      for (const [slot, x, y] of pins) {
        if (!w.ents.isAlive(slot)) continue;
        w.ents.cols.x[slot] = x;
        w.ents.cols.y[slot] = y;
      }
      rebuildIndex(w);
    },
  };
}

describe('trap and held (src/sim/traps.ts trapView / heldView)', () => {
  it('a real hold: the owner\'s trap and the held organism\'s heldBy equal the readers; HELD is derived, never the reason column', () => {
    const w = clearWater({}, REG_O);
    for (let y = 56; y < 72; y++) for (let x = 56; x < 72; x++) w.grid.substrate[cellIndex(x, y)] = SUB_SEDIMENT;
    w.grid.geometryVersion++;
    fillField(w, 'broth', 0);
    const f = place(w, 'F03', 64.5, 64.5, { B: 2.8, N: 0.28, E: 80 });
    const p = place(w, 'P04', 64.6, 64.5, { E: 100 });
    const hooks = pinned(w, [[p, 64.6, 64.5]]);
    const c = w.ents.cols;
    // Before the arm: state 'none'; after it, 'armed' with the 0.20 C store.
    expect(inspect(w, f).trap).toEqual({ ...trapView(w, f)!, holdSeconds: 8 });
    expect(inspect(w, f).trap!.state).toBe('none');
    let t = 0;
    while (c.heldBySlot[p]! < 0 && t++ < 50) {
      step(w, hooks);
      if (c.trapReserveC[f]! > 0 && c.heldBySlot[p]! < 0) expect(inspect(w, f).trap!.state).toBe('armed');
    }
    for (let k = 0; k < 31; k++) step(w, hooks); // 3.2 s into the hold
    const owner = inspect(w, f);
    const held = inspect(w, p);
    expect(owner.trap).toEqual({ ...trapView(w, f)!, holdSeconds: 8 });
    expect(owner.trap!.state).toBe('holding');
    expect(owner.trap!.target).toEqual({ birthId: c.birthId[p], speciesIdx: c.species[p] });
    expect(owner.trap!.heldSeconds).toBeCloseTo(3.2, 9);
    expect(held.heldBy).toEqual({ ...heldView(w, p)!, holdSeconds: 8 });
    expect(held.heldBy!.ownerBirthId).toBe(c.birthId[f]);
    expect(held.heldBy!.drained).toBe(c.intakeLastSecond[f]); // the measured drain, never F03's drainRate
    expect(held.heldBy!.drained).toBeGreaterThan(0);
    expect(c.limitCode[p]).not.toBe(R.HELD_IN_TRAP); // derived by the inspector only
    expect(held.divisionBlockers).toContain(R.DIV_BLOCK_STATE); // T1
    expect(owner.heldBy).toBeUndefined();
    expect(held.trap).toBeUndefined();
    // After the release: cooldown with its seconds left; the P04 holds nothing.
    for (let k = 0; k < 60; k++) step(w, hooks);
    expect(inspect(w, f).trap!.state).toBe('cooldown');
    expect(inspect(w, f).trap!.cooldownLeft).toBe(c.trapCooldown[f]);
    expect(inspect(w, p).heldBy).toBeUndefined();
  });
});

describe('handling, both ends (SPEC §7.3)', () => {
  it('the handler\'s handling equals its columns, its prey\'s beingHandled lists it; a stale preySlot (set by hand) lists nothing', () => {
    const w = clearWater({}, REG_O);
    const p10 = place(w, 'P10', 64.5, 64.5, { E: 50 });
    const prey = place(w, 'P01', 64.8, 64.5);
    const hooks = pinned(w, [
      [p10, 64.5, 64.5],
      [prey, 64.8, 64.5],
    ]);
    const c = w.ents.cols;
    expect(inspect(w, p10).handling).toBeUndefined();
    for (let k = 0; k < 4; k++) step(w, hooks);
    expect(c.handlingNeed[p10]).toBeGreaterThan(0);
    const h = inspect(w, p10);
    expect(h.handling).toEqual({ preyBirthId: c.birthId[prey], preySpeciesIdx: c.species[prey], progress: c.handlingProgress[p10], need: c.handlingNeed[p10] });
    expect(h.predation!.code).toBe(R.PRED_HANDLING_IN_PROGRESS);
    expect(h.limitCode).toBe(R.PRED_HANDLING_IN_PROGRESS); // H3 (intake.ts)
    const v = inspect(w, prey);
    expect(v.beingHandled).toEqual([{ predatorBirthId: c.birthId[p10], predatorSpeciesIdx: c.species[p10], progress: c.handlingProgress[p10], need: c.handlingNeed[p10] }]);
    expect(c.limitCode[prey]).not.toBe(R.CAPTURED_HANDLING); // never written by the simulation
    // Stale reference (set by hand): the handler's preyBirthId no longer matches → no beingHandled, no handling.
    const birth = c.preyBirthId[p10]!;
    c.preyBirthId[p10] = birth + 1000;
    expect(inspect(w, prey).beingHandled).toBeUndefined();
    expect(inspect(w, p10).handling).toBeUndefined();
    c.preyBirthId[p10] = birth;
  });
});

describe('mode (A04), jacket (E11), signal (B09)', () => {
  it('an A04 in each mode: mode and the light at its cell; mode 0 before its first step', () => {
    const w = clearWater({}, REG_O);
    for (const cell of maskCells()) w.grid.lightBase[cell] = 0.6;
    for (let y = 60; y < 70; y++) for (let x = 20; x < 30; x++) w.grid.lightBase[cellIndex(x, y)] = 0.1;
    w.grid.geometryVersion++;
    const lit = place(w, 'A04', 64.5, 64.5);
    const dark = place(w, 'A04', 24.5, 64.5);
    expect(inspect(w, lit).mode!.mode).toBe(0);
    step(w);
    const c = w.ents.cols;
    for (const [s, want] of [
      [lit, MODE_PHOTO],
      [dark, MODE_SUGAR],
    ] as const) {
      const e = inspect(w, s);
      expect(e.mode).toEqual({ mode: c.metabolicMode[s], light: w.derived.light[entityCell(c.x[s]!, c.y[s]!)] });
      expect(e.mode!.mode).toBe(want);
    }
    expect(inspect(w, lit).mode!.light).toBeGreaterThan(0.35);
    expect(inspect(w, dark).mode!.light).toBeLessThanOrEqual(0.25);
  });

  it('an E11 carrier with a jacket built in stage 8: jacket equals jacketView', () => {
    const w = clearWater({}, REG_O);
    fillField(w, 'silicate', 0.3);
    const s = placeWith(w, 'P01', 64.5, 64.5, ['E11'], { E: 90 });
    expect(inspect(w, s).jacket).toEqual({ mineral: 0, target: 0.4, coverage: 0, speedFactor: 1 });
    for (let k = 0; k < 100; k++) step(w);
    const j = inspect(w, s).jacket!;
    expect(j).toEqual(jacketView(w, s));
    expect(j.coverage).toBeGreaterThan(0.4);
    expect(j.speedFactor).toBe(1 - 0.2 * j.coverage);
    expect(inspect(w, s).modules.find((m) => m.id === 'E11')!.activeNow).toBe(true); // jacketBuiltNow
    expect(inspect(w, place(w, 'P01', 30.5, 64.5)).jacket).toBeUndefined();
  });

  it('a glowing B09: signal equals sensedSignal and its glow rules; its secretion names the signal', () => {
    const w = clearWater({}, REG_O);
    const b = place(w, 'B09', 40.5, 64.5);
    const cell = cellIndex(40, 64);
    for (let k = 0; k < 60; k++)
      step(w, {
        afterStage: (s, world) => {
          if (s !== 7) return;
          world.fields.sGlow![cell] = 0.5;
          markField(world, 'sGlow');
        },
      });
    const e = inspect(w, b);
    expect(e.signal).toEqual({ sensed: sensedSignal(w, cell), onThreshold: 0.3, offThreshold: 0.15, dwellSeconds: 5, glowing: true });
    expect(e.signal!.sensed).toBeGreaterThan(0.3);
    expect(e.secretion).toEqual({ code: w.ents.cols.secretionCode[b], bits: w.ents.cols.secreting[b], refusalOf: 'signal' });
  });
});

describe('Phase 5 emitters, RIVAL targets and the cell rival line', () => {
  const REG_S = registryWith(
    {
      enabledSpecies: [...shipped.enabledSpecies, 'B13'].sort(),
      enabledModules: [...shipped.enabledModules, 'E02'].sort(),
      enabledSystems: [...shipped.enabledSystems, 'signals', 'rivalry'].sort() as SystemFlag[],
      enabledMaterials: [...shipped.enabledMaterials, 'M08'].sort(),
    },
    { allowUnimplemented: true }, // E02 joins IMPLEMENTED_MODULES at the organism flip
  );

  it('an E02 B06 with no starch: its signal emission is not starch secretion (secretion share and the inspector)', () => {
    const w = clearWater({}, REG_S);
    const s = placeWith(w, 'B06', 64.5, 64.5, ['E02'], { E: 90 });
    step(w);
    const c = w.ents.cols;
    expect(c.secreting[s]! & PRODUCER_BIT.starch).toBe(0);
    expect(c.secretionCode[s]).toBe(R.SECRETING); // the signal succeeded
    expect(inspect(w, s).secretion).toEqual({ code: R.SECRETING, bits: 16, refusalOf: 'signal' });
    const b06 = sampleArm(w, { everPresent: new Uint8Array(w.species.length).fill(1) }).species.find((x) => x.id === 'B06')!;
    expect(b06.secretion).toEqual({ NONE: 1 });
    expect(reasonName(starchSecretionCode(PRODUCER_BIT.starch | 16, R.SECRETING))).toBe('SECRETING');
    expect(reasonName(starchSecretionCode(0, R.SECRETION_NO_SUBSTRATE))).toBe('SECRETION_NO_SUBSTRATE');
  });

  it('a B13 records rivalry: refusalOf rival; NONE with no target in reach', () => {
    const w = clearWater({}, REG_S);
    const s = place(w, 'B13', 64.5, 64.5, { E: 90 });
    step(w);
    const e = inspect(w, s);
    expect(e.secretion).toEqual({ code: R.NONE, bits: 0, refusalOf: 'rival' });
    expect(e.signal).toBeUndefined();
  });

  it('a B01 in rivalry chemical: rival equals the breakdown and its whole exposure; a non-target has none; the cell keeps the rival line without inhibitor lines', () => {
    const w = clearWater({}, REG_S);
    const b01 = place(w, 'B01', 64.5, 64.5);
    const p01 = place(w, 'P01', 30.5, 64.5);
    const cell = cellIndex(64, 64);
    setField(w, 'rival', cell, 0.4);
    setField(w, 'rival', cellIndex(30, 64), 0.4);
    const e = inspect(w, b01);
    expect(e.rival!.amount).toBe(0.4);
    expect(e.rival!.exposure).toBeCloseTo(0.1, 12);
    expect(e.rival!.totalExposure).toBeCloseTo(0.1, 12);
    expect(e.rival!.growthFactor).toBeCloseTo(1 / 1.1, 12);
    expect(e.rival!.damagePerSecond).toBeCloseTo(0.8, 12);
    expect(inspect(w, p01).rival).toBeUndefined();
    const withLines = buildInspector(w, { kind: 'cell', cell }).cell!;
    // The recorded targets: B10 and B11 are recorded too since the organism flip (D-0127).
    expect(withLines.exposure!.rival).toEqual({ amount: 0.4, exposure: 0.1, targets: ['B01', 'B10', 'B11'] });
    // No inhibitor line (the inhibitor fields removed by hand): the rival line is kept (it used to be dropped).
    const fields = w.fields as Record<string, Float64Array | undefined>;
    for (const id of ['inhBact', 'inhFung', 'inhPhoto']) fields[id] = undefined;
    const bare = buildInspector(w, { kind: 'cell', cell }).cell!;
    expect(bare.exposure).toEqual({ filmHalves: false, lines: [], rival: { amount: 0.4, exposure: 0.1, targets: ['B01', 'B10', 'B11'] } });
    // No rival here either: no exposure key at all.
    expect(buildInspector(w, { kind: 'cell', cell: cellIndex(90, 64) }).cell!.exposure).toBeUndefined();
  });

  it('sugarSourcesOf lists A04 as a maker in light', () => {
    const w = clearWater({}, REG_O);
    const a04 = speciesIndex(w, 'A04');
    const a01 = speciesIndex(w, 'A01');
    const src = sugarSourcesOf(w);
    expect(src.makers).toContain(a04);
    expect(src.makers).toContain(a01);
    expect(src.inLight).toEqual([a04]);
  });
});

describe('a v1.0 dish inspects as before', () => {
  it('FIRST_DISH_V1: no organism gains a Phase 5 key; sugar sources carry no inLight; predation codes are the v1.0 ones; phase5Lines is empty', () => {
    const reg = preOrganismFlipRegistry(); // the shipped lists before the organism flip (D-0127)
    const w = realizeRecipe(reg, 'FIRST_DISH_V1', { seed: 104729 });
    for (let t = 0; t < 400; t++) step(w);
    const c = w.ents.cols;
    let n = 0;
    for (let i = 0; i < w.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      const e = inspect(w, i);
      for (const k of NEW_KEYS) expect(Object.keys(e), k).not.toContain(k);
      expect(Object.keys(e.diet.sugarSources!)).toEqual(['makers', 'enzyme']);
      if (e.predation) expect([R.PRED_NO_PREY, R.PRED_OUT_OF_CONTACT, R.PRED_COOLDOWN, R.PRED_MEAL_FULL, R.PRED_ENERGY_HIGH]).toContain(e.predation.code);
      expect(phase5Lines(w, i, profileOf(w, i), entityCell(c.x[i]!, c.y[i]!))).toEqual({});
      n++;
    }
    expect(n).toBeGreaterThan(10);
    // The cell payload of a v1.0 dish: the exposure key exactly when an inhibitor line exists (no rival key).
    for (const cell of [cellIndex(64, 64), cellIndex(40, 40)]) {
      const ci = buildInspector(w, { kind: 'cell', cell }).cell!;
      if (ci.exposure) expect(Object.keys(ci.exposure)).toEqual(['filmHalves', 'lines']);
    }
  });
});

/**
 * Fix 1 (wave 13 verify MINOR): the HEAD-payload golden. tests/worker/inspect-p5-v1-golden.json was written by the
 * UNMODIFIED HEAD code (3daebb2, before wave 13; the generator is in docs/reports/reviews/g5-wave-13/org-ui-fix1.md):
 * every living organism's EntityInspect and five CellInspect payloads (JSON form) of FIRST_DISH_V1 at tick 400,
 * PREDATOR_BALANCE_V1 with five P01 at tick 300 (hunting codes) and three rc1 saves 100 ticks after load. The new
 * code reproduces each payload exactly: a v1.0 dish inspects as before, field for field.
 */
describe('a v1.0 dish inspects exactly as the HEAD code did (golden)', () => {
  interface GoldenDish {
    ticks: number;
    ids: number[];
    ents: unknown[];
    cells: number[];
    cellInspect: unknown[];
  }
  const raw = JSON.parse(readFileSync(join(__dirname, 'inspect-p5-v1-golden.json'), 'utf8')) as { deflated: string };
  const golden = JSON.parse(inflateRawSync(Buffer.from(raw.deflated, 'base64')).toString('utf8')) as Record<string, GoldenDish>;
  const asJson = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
  function check(name: string, w: World): void {
    const g = golden[name]!;
    for (let t = 0; t < g.ticks; t++) step(w);
    const c = w.ents.cols;
    const ids: number[] = [];
    for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1) ids.push(c.birthId[i]!);
    expect(ids).toEqual(g.ids);
    g.ids.forEach((birthId, k) => expect(asJson(buildInspector(w, { kind: 'entity', birthId })), `${name} birth ${birthId}`).toEqual(g.ents[k]));
    g.cells.forEach((cell, k) => expect(asJson(buildInspector(w, { kind: 'cell', cell })), `${name} cell ${cell}`).toEqual(g.cellInspect[k]));
  }
  it('FIRST_DISH_V1 and a predator dish (P01 hunting codes)', { timeout: 240_000 }, () => {
    expect(Object.keys(golden)).toHaveLength(5);
    // The golden was written under the shipped manifest before the organism flip (D-0127): preOrganismFlipRegistry().
    check('FIRST_DISH_V1', realizeRecipe(preOrganismFlipRegistry(), 'FIRST_DISH_V1', { seed: 104729 }));
    const pb = realizeRecipe(preOrganismFlipRegistry(), 'PREDATOR_BALANCE_V1', { seed: 104729 });
    for (let k = 0; k < 5; k++) place(pb, 'P01', 48.5 + k, 70.5);
    check('PREDATOR_BALANCE_V1+5xP01', pb);
    expect(golden['PREDATOR_BALANCE_V1+5xP01']!.ents.filter((e) => (e as { entity: EntityInspect }).entity.predation !== null).length).toBe(5);
  });
  it('three rc1 saves (shelter, fungi, phage and parasites) 100 ticks after load', { timeout: 240_000 }, async () => {
    for (const file of RC1_SAVE_FILES.filter((f) => !f.startsWith('first-dish'))) {
      const { world } = await loadSaveFile(readRc1SaveText(file));
      resumeRc1(file, world);
      check(file, world);
    }
  });
});
