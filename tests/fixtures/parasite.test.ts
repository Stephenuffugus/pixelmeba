/**
 * P3.4 X01 Hitcher fixtures (SPEC §6.5 host drains, §6.8, §7.4; CT §1.2, §1.3, §3.3, §12.5;
 * src/sim/parasites.ts):
 * - a free Hitcher cannot feed and pays 0.15 E/s; it seeks a Sunbead within sensing 3 at 0.4 cells/s;
 * - it attaches on contact (centres ≤ 0.5 cells) to an unparasitized A01 only; competing claims go to
 *   the highest det(seed, 'contact', tick, KIND_PARASITE, birthId);
 * - the drain is exactly 0.002 C per tick with proportional N, split 50/30/20, +30 E per C, no O2;
 * - the host dies below 0.25 × B0' with DEATH_PARASITE_DRAIN; the parasite is released alive on drain
 *   death, age death, capture by P01 and rest (rest through a TEST-ONLY registry where E03 is eligible
 *   for A01: shipped content cannot make a Sunbead rest, W2-21);
 * - division: the retained daughter keeps the pair with re-pointed birthIds; offspring start free;
 * - saves: equal hashes at 1× and 4× (chunked stepping) and across buildSaveFile → loadSaveFile with a
 *   Hitcher attached; the import refuses non-mutual pairs and a host outside the parasite's hostIds.
 * Stage-level tests drive single stages on a clear-water dish; "darkness" (derived light 0) is a
 * labelled test state that keeps the Sunbead from photosynthesizing so only the drain moves its body.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, parseSaveFile } from '../../src/persistence/saveFile';
import { introduceOrganism } from '../../src/sim/commands';
import { stageContacts } from '../../src/sim/contacts';
import { DT } from '../../src/sim/constants';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { ENTITY_COLUMNS, LIFE_ACTIVE, LIFE_PREPARING, LIFE_RESTING, type ColumnName } from '../../src/sim/entities';
import { stageBirths } from '../../src/sim/births';
import { cellIndex } from '../../src/sim/grid';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { stageIntake } from '../../src/sim/intake';
import { checkLedger } from '../../src/sim/ledger';
import { stageMaintenance } from '../../src/sim/maintenance';
import { stageSenseAndMove } from '../../src/sim/movement';
import { HOST_DEATH_FRACTION, KIND_PARASITE, parasiteInfo } from '../../src/sim/parasites';
import { stagePublish } from '../../src/sim/publish';
import { reasonText } from '../../src/ui/strings/reasons';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { det, STREAMS } from '../../src/sim/rng';
import { stateHash, type WorldState } from '../../src/sim/serialize';
import { rebuildIndex } from '../../src/sim/spatial';
import { run, step } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { aliveOf, clearWater, fillField, place, rebaseLedger, registry } from '../helpers/world';

const meta = { name: 'parasite', savedAt: '2026-10-01T00:00:00Z', recipeId: null };

/** Labelled test state: no light anywhere, so a Sunbead's body changes only through the drain. */
function dark(w: World): void {
  w.derived.light.fill(0);
}

function deathCause(w: World, birthId: number): number | undefined {
  return w.events.ring.find((e) => e.type === 'death' && e.birthId === birthId)?.cause;
}

/** A Sunbead with a Hitcher placed on it, attached through stage 5. */
function pair(w: World, x = 40.5, y = 64.5, hostState: Parameters<typeof place>[4] = {}): { host: number; par: number } {
  const host = place(w, 'A01', x, y, hostState);
  const par = place(w, 'X01', x + 0.2, y);
  stageContacts(w);
  const c = w.ents.cols;
  expect(c.hostSlot[par]).toBe(host);
  expect(c.parasiteSlot[host]).toBe(par);
  return { host, par };
}

describe('X01 Hitcher (SPEC §7.4)', () => {
  it('is enabled with its CT record', () => {
    const x = registry().species.X01!;
    expect(registry().manifest.enabledSpecies).toContain('X01');
    expect(registry().manifest.enabledSystems).toContain('parasites');
    expect([x.b0, x.intakeRate, x.maintenanceRate, x.drainRate, x.speed, x.sensingRadius, x.maxAge]).toEqual([0.2, 0, 0.15, 0.02, 0.4, 3, 300]);
    expect(x.hostIds).toEqual(['A01']);
  });

  it('a free Hitcher cannot feed and pays 0.15 E/s', () => {
    const w = clearWater();
    for (const f of ['sugar', 'detritus', 'metabolite'] as const) w.fields[f]!.fill(0.5);
    const p = place(w, 'X01', 40.5, 64.5);
    rebaseLedger(w);
    const c = w.ents.cols;
    const E0 = c.E[p]!;
    for (let t = 0; t < 10; t++) {
      stageIntake(w);
      stageMaintenance(w);
    }
    expect(c.intakeAccum[p]).toBe(0);
    expect(c.B[p]).toBe(0.2);
    expect(c.E[p]).toBeCloseTo(E0 - 0.15 * DT * 10, 12);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('attaches on contact (≤ 0.5 cells) to an unparasitized Sunbead only; competing claims go to the highest seeded priority', () => {
    const w = clearWater();
    const host = place(w, 'A01', 40.5, 64.5);
    const near = place(w, 'X01', 40.2, 64.5); // 0.3 cells
    const far = place(w, 'X01', 41.05, 64.5); // 0.55 cells: out of contact
    const rival = place(w, 'X01', 40.8, 64.5); // 0.3 cells: competes with `near`
    const c = w.ents.cols;
    const pri = (s: number) => det(w.seed, STREAMS.contact, w.tick, KIND_PARASITE, c.birthId[s]!);
    const winner = pri(near) > pri(rival) ? near : rival;
    const loser = winner === near ? rival : near;
    stageContacts(w);
    expect(c.hostSlot[winner]).toBe(host);
    expect(c.hostBirthId[winner]).toBe(c.birthId[host]);
    expect(c.parasiteSlot[host]).toBe(winner);
    expect(c.parasiteBirthId[host]).toBe(c.birthId[winner]);
    expect([c.hostSlot[loser], c.hostSlot[far]]).toEqual([-1, -1]);
    // One parasite per host: the loser stays free on later contacts too.
    w.tick++;
    stageContacts(w);
    expect(c.hostSlot[loser]).toBe(-1);
    expect(c.parasiteSlot[host]).toBe(winner);
  });

  it('a free Hitcher seeks a Sunbead within sensing 3 at 0.4 cells/s; attached, it takes its host position at no movement cost', () => {
    const w = clearWater();
    const host = place(w, 'A01', 40.5, 64.5);
    const p = place(w, 'X01', 43.3, 64.5); // 2.8 cells east, inside sensing radius 3
    const out = place(w, 'X01', 44.6, 70.5); // > 3 cells (Chebyshev) from the host: never pursues it
    const c = w.ents.cols;
    const d0 = c.x[p]! - c.x[host]!;
    stageSenseAndMove(w);
    expect(d0 - (c.x[p]! - c.x[host]!)).toBeCloseTo(0.4 * DT, 12);
    expect(c.y[p]).toBe(64.5);
    let ticks = 1;
    while (c.hostSlot[p] === -1 && ticks < 200) {
      stageContacts(w);
      if (c.hostSlot[p] !== -1) break;
      w.tick++;
      stageSenseAndMove(w);
      ticks++;
    }
    expect(c.hostSlot[p]).toBe(host);
    expect(c.hostSlot[out]).toBe(-1);
    // Attached: it rides along. A labelled test state moves the (immobile) Sunbead by hand.
    c.x[host] = 41.2;
    c.y[host] = 65.3;
    rebuildIndex(w);
    w.tick++;
    stageSenseAndMove(w);
    expect([c.x[p], c.y[p]]).toEqual([41.2, 65.3]);
    expect(c.movedThisTick[p]).toBe(0);
  });

  it('drains exactly 0.002 C per tick with proportional N: 50 % body, 30 % CO2, 20 % metabolite, +30 E per C, no oxygen', () => {
    const w = clearWater();
    dark(w);
    const { host, par } = pair(w);
    rebaseLedger(w);
    const c = w.ents.cols;
    const cell = cellIndex(40, 64);
    const f = w.fields;
    for (let t = 0; t < 25; t++) {
      const before = { hB: c.B[host]!, hN: c.N[host]!, pB: c.B[par]!, pN: c.N[par]!, pE: c.E[par]!, co2: f.co2![cell]!, met: f.metabolite![cell]!, nut: f.nutrient![cell]!, o2: f.oxygen![cell]! };
      stageIntake(w);
      const C = 0.02 * DT;
      const bound = (before.hN * C) / before.hB;
      expect(before.hB - c.B[host]!).toBeCloseTo(C, 15);
      expect(before.hN - c.N[host]!).toBeCloseTo(bound, 15);
      expect(c.B[par]! - before.pB).toBeCloseTo(0.5 * C, 15);
      expect(f.co2![cell]! - before.co2).toBeCloseTo(0.3 * C, 15);
      expect(f.metabolite![cell]! - before.met).toBeCloseTo(0.2 * C, 15);
      expect(c.N[par]! - before.pN).toBeCloseTo(0.05 * C, 15);
      // Unused bound N returns to the cell's free nutrient.
      expect(f.nutrient![cell]! - before.nut).toBeCloseTo(bound - 0.05 * C, 15);
      expect(c.E[par]! - before.pE).toBeCloseTo(30 * C, 12);
      expect(f.oxygen![cell]).toBe(before.o2);
      expect(checkLedger(w).ok).toBe(true);
    }
    expect(c.intakeAccum[par]).toBeCloseTo(25 * 0.002, 14);
  });

  it('the inspector reports the measured drain of the last second, not the record rate (fix1: honest labels)', () => {
    /** One second of stage 6 (stage 10 copies the second's intake into intakeLastSecond); `free` re-sets the host cell's free nutrient each tick. */
    const second = (w: World, host: number, free: number | null): void => {
      const cell = cellIndex(Math.floor(w.ents.cols.x[host]!), Math.floor(w.ents.cols.y[host]!));
      for (let t = 0; t < 10; t++) {
        w.tick = t;
        if (free !== null) w.fields.nutrient![cell] = free;
        stageIntake(w);
      }
      w.tick = 9;
      stagePublish(w);
    };
    // Unlimited: 10 × 0.002 = 0.02 C/s, the record rate.
    const a = clearWater();
    dark(a);
    const pa = pair(a);
    second(a, pa.host, null);
    expect(parasiteInfo(a, pa.host)!.rate).toBeCloseTo(0.02, 12);
    expect(reasonText(R.PARASITIZED, 'lab', { speciesName: 'Hitcher', value: parasiteInfo(a, pa.host)!.rate })).toBe('Hitcher draining 0.02 C/s.');
    // Nutrient-limited: a host with no bound N in a cell with half the free nutrient the drain binds
    // (0.05 N per C) drains at L = 0.5, so 0.01 C/s, while the record still says 0.02.
    const b = clearWater();
    dark(b);
    fillField(b, 'nutrient', 0);
    const pb = pair(b, 40.5, 64.5, { N: 0 });
    second(b, pb.host, 0.5 * 0.05 * 0.02 * DT);
    expect(b.species[b.ents.cols.species[pb.par]!]!.def.drainRate).toBe(0.02);
    expect(parasiteInfo(b, pb.host)!.rate).toBeCloseTo(0.01, 12);
    expect(reasonText(R.PARASITIZED, 'lab', { speciesName: 'Hitcher', value: parasiteInfo(b, pb.host)!.rate })).toBe('Hitcher draining 0.01 C/s.');
  });

  it(`a host below ${HOST_DEATH_FRACTION} × B0' dies of the drain (DEATH_PARASITE_DRAIN); the parasite is released alive`, () => {
    const w = clearWater();
    dark(w);
    const b0 = registry().species.A01!.b0;
    const { host, par } = pair(w, 40.5, 64.5, { B: HOST_DEATH_FRACTION * b0 + 0.003 });
    rebaseLedger(w);
    const c = w.ents.cols;
    const hostBirth = c.birthId[host]!;
    const parBirth = c.birthId[par]!;
    stageIntake(w);
    stageMaintenance(w);
    expect(c.alive[host]).toBe(1); // 0.3775 − 0.002 = 0.3755 ≥ 0.375
    w.tick++;
    stageIntake(w);
    stageMaintenance(w);
    expect(deathCause(w, hostBirth)).toBe(R.DEATH_PARASITE_DRAIN);
    expect(c.alive[par]).toBe(1);
    expect(c.birthId[par]).toBe(parBirth);
    expect(c.hostSlot[par]).toBe(-1);
    expect(c.hostBirthId[par]).toBe(0);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('without a parasite the same small Sunbead does not die of the drain rule', () => {
    const w = clearWater();
    dark(w);
    const b0 = registry().species.A01!.b0;
    const host = place(w, 'A01', 40.5, 64.5, { B: 0.2 * b0 });
    stageMaintenance(w);
    expect(w.ents.cols.alive[host]).toBe(1);
  });

  it('is released alive when its host dies of age', () => {
    const w = clearWater();
    const { host, par } = pair(w, 40.5, 64.5, { age: registry().species.A01!.maxAge - 0.05 });
    const c = w.ents.cols;
    const hostBirth = c.birthId[host]!;
    stageMaintenance(w);
    expect(deathCause(w, hostBirth)).toBe(R.DEATH_AGE);
    expect([c.alive[par], c.hostSlot[par]]).toEqual([1, -1]);
  });

  it('is released alive when an Amoeba captures its host', () => {
    const w = clearWater();
    const { host, par } = pair(w);
    const amoeba = place(w, 'P01', 40.5, 64.8);
    rebaseLedger(w);
    const c = w.ents.cols;
    const hostBirth = c.birthId[host]!;
    w.tick++;
    stageContacts(w);
    expect(deathCause(w, hostBirth)).toBe(R.DEATH_PREDATION);
    expect(c.mealC[amoeba]).toBeGreaterThan(0);
    expect([c.alive[par], c.hostSlot[par], c.hostBirthId[par]]).toEqual([1, -1, 0]);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('is released alive when its host starts resting (TEST-ONLY registry: E03 eligible for A01)', () => {
    const reg = registry();
    const e03 = reg.modules.E03!;
    const testReg: ContentRegistry = { ...reg, modules: { ...reg.modules, E03: { ...e03, eligibleAncestors: [...e03.eligibleAncestors, 'A01'] } } };
    const base = testReg.recipes.FIRST_DISH_V1!;
    const w = realizeRecipe(testReg, { ...base, id: 'TEST_REST', removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0 }, mutationPreset: 'fixed' }, { worldId: 'rest' });
    dark(w); // no usable intake: E03's 20 s rule starts preparing (SPEC §7.6)
    const host = introduceOrganism(w, speciesIndex(w, 'A01'), cellIndex(40, 64), 'test', { modules: ['E03'], exactCenter: true });
    const par = place(w, 'X01', 40.7, 64.5);
    const c = w.ents.cols;
    let preparedAt = -1;
    let releasedAt = -1;
    let attachedWhileActive = 0;
    for (let t = 0; t < 400 && releasedAt < 0; t++) {
      step(w, {
        afterStage: (stage, world) => {
          const cc = world.ents.cols;
          if (stage === 8 && preparedAt < 0 && cc.lifeState[host] === LIFE_PREPARING) preparedAt = world.tick;
          if (stage === 5 && preparedAt < 0 && cc.hostSlot[par] === host) attachedWhileActive++;
          if (stage === 5 && preparedAt >= 0 && cc.hostSlot[par] === -1) releasedAt = world.tick;
        },
      });
    }
    expect(attachedWhileActive).toBeGreaterThan(100); // it drained the Sunbead until the rest began
    expect(preparedAt).toBeGreaterThan(0);
    expect(releasedAt).toBe(preparedAt + 1); // released at the next stage 5
    expect(c.alive[par]).toBe(1);
    expect(c.parasiteSlot[host]).toBe(-1);
    expect([LIFE_PREPARING, LIFE_RESTING]).toContain(c.lifeState[host]);
    // A resting Sunbead is not a valid host: it is not re-attached while it rests.
    for (let t = 0; t < 30; t++) step(w);
    if (c.lifeState[host] !== LIFE_ACTIVE) expect(c.parasiteSlot[host]).toBe(-1);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('host division: the retained daughter keeps the Hitcher with re-pointed birthIds; the new daughter is free', () => {
    const w = clearWater();
    const { host, par } = pair(w, 40.5, 64.5, { B: 3.2, E: 100, age: 30 });
    const c = w.ents.cols;
    const before = c.birthId[host]!;
    stageBirths(w);
    expect(c.birthId[host]).not.toBe(before);
    const daughters = aliveOf(w, 'A01');
    expect(daughters.length).toBe(2);
    const other = daughters.find((s) => s !== host)!;
    expect(c.hostSlot[par]).toBe(host);
    expect(c.hostBirthId[par]).toBe(c.birthId[host]);
    expect(c.parasiteSlot[host]).toBe(par);
    expect(c.parasiteBirthId[host]).toBe(c.birthId[par]);
    expect([c.parasiteSlot[other], c.parasiteBirthId[other]]).toEqual([-1, 0]);
    expect(w.ents.refValid(c.hostSlot[par]!, c.hostBirthId[par]!)).toBe(true);
  });

  it('a dividing Hitcher keeps its host on the retained half; its offspring is free', () => {
    const w = clearWater();
    const { host, par } = pair(w);
    const c = w.ents.cols;
    c.B[par] = 0.5; // labelled test state (logged): ready to split
    w.ledger.inputs.c += 0.3;
    c.E[par] = 100;
    c.age[par] = 31;
    const before = c.birthId[par]!;
    stageBirths(w);
    expect(c.birthId[par]).not.toBe(before);
    const kids = aliveOf(w, 'X01');
    expect(kids.length).toBe(2);
    const offspring = kids.find((s) => s !== par)!;
    expect(c.hostSlot[par]).toBe(host);
    expect(c.parasiteSlot[host]).toBe(par);
    expect(c.parasiteBirthId[host]).toBe(c.birthId[par]);
    expect([c.hostSlot[offspring], c.hostBirthId[offspring]]).toEqual([-1, 0]);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('the ledger closes over a 1,500-tick dish of Sunbeads and Hitchers, with drains and releases', () => {
    const w = clearWater();
    for (let k = 0; k < 6; k++) {
      place(w, 'A01', 40.5 + k * 3, 60.5);
      place(w, 'X01', 41.5 + k * 3, 62.5);
    }
    rebaseLedger(w);
    let drainTicks = 0;
    for (let k = 0; k < 6; k++) {
      for (let t = 0; t < 250; t++) {
        step(w);
        if (aliveOf(w, 'X01').some((s) => w.ents.cols.hostSlot[s]! >= 0)) drainTicks++;
      }
      expect(checkLedger(w).ok, `tick ${w.tick}`).toBe(true);
    }
    expect(drainTicks).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------------- saves

function attachedWorld(): World {
  const w = clearWater();
  for (let k = 0; k < 4; k++) {
    place(w, 'A01', 40.5 + k * 4, 60.5);
    place(w, 'X01', 40.9 + k * 4, 60.5);
  }
  run(w, 20);
  expect(aliveOf(w, 'X01').filter((s) => w.ents.cols.hostSlot[s]! >= 0).length).toBeGreaterThan(0);
  return w;
}

async function editedSave(w: World, edit: (s: WorldState) => void): Promise<string> {
  const { text } = await buildSaveFile(w, meta);
  const f = JSON.parse(text) as { state: WorldState; checksum: string };
  edit(f.state);
  f.checksum = `sha256:${await sha256Hex(canonicalJson(f.state))}`;
  return JSON.stringify(f);
}

/** Overwrite one value of an entity column payload in a saved state (as tests/sim/world-stores.test.ts). */
function setColumn(s: WorldState, name: ColumnName, slot: number, value: number): void {
  const enc = s.entities.columns[name]!;
  const dtype = ENTITY_COLUMNS.find(([n]) => n === name)![1];
  const bytes = Uint8Array.from(atob(enc.b64), (ch) => ch.charCodeAt(0));
  const Ctor = { f64: Float64Array, f32: Float32Array, i32: Int32Array, u32: Uint32Array, u16: Uint16Array, u8: Uint8Array }[dtype];
  new Ctor(bytes.buffer, 0, enc.length)[slot] = value;
  (enc as { b64: string }).b64 = btoa(String.fromCharCode(...bytes));
}

async function expectRefused(text: string, message: RegExp): Promise<void> {
  await expect(parseSaveFile(text)).rejects.toMatchObject({ kind: 'integrity' });
  await expect(parseSaveFile(text)).rejects.toThrow(message);
  await expect(loadSaveFile(text)).rejects.toThrow(/Nothing was loaded/);
}

describe('X01 saves and imports', () => {
  it('stateHash is equal at 1× and 4× (chunked stepping) with Hitchers attached', () => {
    const a = attachedWorld();
    const b = attachedWorld();
    expect(stateHash(b)).toBe(stateHash(a));
    run(a, 400);
    for (let k = 0; k < 100; k++) {
      run(b, 4);
      stateHash(b); // observing never changes the outcome
    }
    expect(stateHash(b)).toBe(stateHash(a));
  });

  it('buildSaveFile → loadSaveFile with a Hitcher attached continues bit-identically', async () => {
    const a = attachedWorld();
    const { text } = await buildSaveFile(a, meta);
    const { world: b } = await loadSaveFile(text);
    expect(stateHash(b)).toBe(stateHash(a));
    run(a, 400);
    run(b, 400);
    expect(stateHash(b)).toBe(stateHash(a));
  }, 120_000);

  it('the import refuses a pair that is not mutual and a host outside the hostIds; nothing is loaded', async () => {
    const w = attachedWorld();
    const c = w.ents.cols;
    const par = aliveOf(w, 'X01').find((s) => c.hostSlot[s]! >= 0)!;
    const host = c.hostSlot[par]!;
    await expectRefused(
      await editedSave(w, (s) => {
        setColumn(s, 'parasiteSlot', host, -1);
        setColumn(s, 'parasiteBirthId', host, 0);
      }),
      /A parasite and its host do not refer to each other/,
    );
    await expectRefused(
      await editedSave(w, (s) => {
        setColumn(s, 'hostSlot', par, -1);
        setColumn(s, 'hostBirthId', par, 0);
      }),
      /A host and its parasite do not refer to each other/,
    );
    // A mutual pair with a Sprinter, which a Hitcher cannot live on.
    const b01 = place(w, 'B01', 70.5, 70.5);
    const free = place(w, 'X01', 70.5, 70.5);
    await expectRefused(
      await editedSave(w, (s) => {
        setColumn(s, 'hostSlot', free, b01);
        setColumn(s, 'hostBirthId', free, c.birthId[b01]!);
        setColumn(s, 'parasiteSlot', b01, free);
        setColumn(s, 'parasiteBirthId', b01, c.birthId[free]!);
      }),
      /A Hitcher is attached to an organism it cannot live on/,
    );
    // A stale birthId (the generic reference check) also ends "Nothing was loaded." (fix1).
    await expectRefused(
      await editedSave(w, (s) => setColumn(s, 'hostBirthId', par, c.hostBirthId[par]! + 100000)),
      /A host link points at an organism that is not there\. Nothing was loaded\.$/,
    );
    // The untouched save loads.
    await expect(loadSaveFile((await buildSaveFile(w, meta)).text)).resolves.toBeTruthy();
  });
});
