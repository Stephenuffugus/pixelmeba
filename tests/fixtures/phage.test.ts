/**
 * P3.4 V01 Pinphage fixtures (SPEC §3.2 row 5, §6.8, §7.5, §10.2; CT §1.2, §3.3, §12.5, §13;
 * src/sim/viruses.ts):
 * - every infection draw matches u = detFloat(seed, 'infect', tick, birthId) < 1 − exp(−0.05 × units × dt)
 *   over 1,000 host-ticks; an infection consumes exactly one unit whose 0.01 C joins the host's body;
 * - when more hosts pass than whole units remain, units go in descending
 *   det(seed, 'contact', tick, KIND_INFECT, birthId) order (PROPOSED DECISION);
 * - lysis exactly 200 ticks after infection: floor(0.40 × B / 0.01) units (B 0.7 → 28) and the remainder
 *   of B, all N and the meal to detritus; units × 0.01 + remainder = B;
 * - doses: 1/5/20 units per accepted cell (the material brush rule, the Life brush preview agrees),
 *   an external input of count × 0.01 C per dosed cell, no entities; refused without the viruses system;
 * - a closed-lid 10,000-tick Sprinter + Pinphage dish conserves to < 1e-5 with at least one lysis;
 * - saves: equal hashes at 1× and 4× and across buildSaveFile → loadSaveFile mid-infection; the
 *   import refuses an infection in a world without viruses and a negative or non-finite timer.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, parseSaveFile } from '../../src/persistence/saveFile';
import { applyNow } from '../../src/sim/commands';
import { stageContacts } from '../../src/sim/contacts';
import { DT } from '../../src/sim/constants';
import { ENTITY_COLUMNS, type ColumnName } from '../../src/sim/entities';
import { cellIndex, lifeCellOutcome, brushCells, maskCells, ST_STONE } from '../../src/sim/grid';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { det, detFloat, STREAMS } from '../../src/sim/rng';
import { stateHash, type WorldState } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import { inactiveFieldsNonZero, markField } from '../../src/sim/transport';
import { KIND_INFECT, phageCellAccepts } from '../../src/sim/viruses';
import type { World } from '../../src/sim/world';
import { G2_LISTS, registryWith } from '../helpers/registry';
import { aliveOf, clearWater, fillField, place, rebaseLedger, registry } from '../helpers/world';

const meta = { name: 'phage', savedAt: '2026-10-01T00:00:00Z', recipeId: null };

function p(units: number): number {
  return 1 - Math.exp(-0.05 * units * DT);
}

/** Test setup: put `units` into one cell, re-based later by the caller. */
function setUnits(w: World, cell: number, units: number): void {
  w.fields.v01![cell] = units;
  markField(w, 'v01');
}

describe('V01 Pinphage infection (SPEC §7.5)', () => {
  it('is enabled with its CT record: infects B01 only, 0.01 C per unit', () => {
    const reg = registry();
    expect(reg.manifest.enabledSpecies).toContain('V01');
    expect(reg.manifest.enabledSystems).toContain('viruses');
    expect(reg.species.V01!.hostIds).toEqual(['B01']);
    expect(reg.species.V01!.metabolism).toBe('viral');
  });

  it('for a fixed seed every draw and threshold matches the formula over 1,000 host-ticks', () => {
    const w = clearWater();
    const UNITS = [1, 1.5, 2, 3, 5, 8, 13, 40, 120, 400];
    const hosts = UNITS.map((_, k) => place(w, 'B01', 20.5 + k * 9, 64.5));
    const c = w.ents.cols;
    let yes = 0;
    let no = 0;
    for (let t = 0; t < 100; t++) {
      // Fresh susceptible hosts and fixed units every tick (test state), so each host-tick is one draw.
      hosts.forEach((s, k) => {
        c.infectedBy[s] = 0;
        c.infectionTimer[s] = 0;
        c.B[s] = 1;
        setUnits(w, cellIndex(20 + k * 9, 64), UNITS[k]!);
      });
      stageContacts(w);
      hosts.forEach((s, k) => {
        const u = detFloat(w.seed, STREAMS.infect, w.tick, c.birthId[s]!);
        const expected = u < p(UNITS[k]!);
        const cell = cellIndex(20 + k * 9, 64);
        expect(c.infectedBy[s] !== 0, `tick ${w.tick} host ${k}: u ${u} p ${p(UNITS[k]!)}`).toBe(expected);
        if (expected) {
          yes++;
          expect(w.fields.v01![cell]).toBe(UNITS[k]! - 1); // exactly one whole unit
          expect(c.B[s]).toBeCloseTo(1.01, 15); // its 0.01 C joined the body
          expect(c.infectionTimer[s]).toBe(0);
        } else {
          no++;
          expect(w.fields.v01![cell]).toBe(UNITS[k]);
          expect(c.B[s]).toBe(1);
        }
      });
      w.tick++;
    }
    expect(yes + no).toBe(1000);
    expect(yes).toBeGreaterThan(50);
    expect(no).toBeGreaterThan(50);
  });

  it('when more hosts pass than whole units remain, units go in descending det(contact, KIND_INFECT) order', () => {
    const w = clearWater();
    const hosts = Array.from({ length: 20 }, (_, k) => place(w, 'B01', 50.1 + (k % 5) * 0.2, 64.1 + Math.floor(k / 5) * 0.2));
    const c = w.ents.cols;
    const cell = cellIndex(50, 64);
    const UNITS = 2.5;
    // Find a tick (pure function of the seed) at which at least three hosts pass their draw.
    let tick = -1;
    for (let t = 0; t < 2_000_000 && tick < 0; t++) {
      const passing = hosts.filter((s) => detFloat(w.seed, STREAMS.infect, t, c.birthId[s]!) < p(UNITS));
      if (passing.length >= 3) tick = t;
    }
    expect(tick).toBeGreaterThanOrEqual(0);
    w.tick = tick;
    setUnits(w, cell, UNITS);
    const passing = hosts.filter((s) => detFloat(w.seed, STREAMS.infect, tick, c.birthId[s]!) < p(UNITS));
    const ranked = [...passing].sort(
      (a, b) => det(w.seed, STREAMS.contact, tick, KIND_INFECT, c.birthId[b]!) - det(w.seed, STREAMS.contact, tick, KIND_INFECT, c.birthId[a]!),
    );
    stageContacts(w);
    const infected = hosts.filter((s) => c.infectedBy[s] !== 0);
    expect(infected.sort((a, b) => a - b)).toEqual(ranked.slice(0, 2).sort((a, b) => a - b));
    expect(w.fields.v01![cell]).toBeCloseTo(0.5, 15); // two whole units used; half a unit cannot infect
  });

  it('fewer than one unit never infects', () => {
    const w = clearWater();
    for (let k = 0; k < 20; k++) place(w, 'B01', 30.5 + (k % 10) * 6, 50.5 + Math.floor(k / 10) * 20);
    const c = w.ents.cols;
    let infections = 0;
    for (let t = 0; t < 600; t++) {
      // Every cell holds 0.999 units at the start of stage 5 (test state, reset each tick).
      for (const cell of maskCells()) w.fields.v01![cell] = 0.999;
      markField(w, 'v01');
      stageContacts(w);
      for (const s of aliveOf(w, 'B01')) if (c.infectedBy[s] !== 0) infections++;
      w.tick++;
    }
    expect(infections).toBe(0);
  });

  it('lysis comes exactly 200 ticks after infection: 28 units from B 0.7, the remainder and all N to detritus', () => {
    const w = clearWater(); // no sugar: the Sprinter neither grows nor divides, so B stays 0.69 + 0.01
    const host = place(w, 'B01', 60.5, 64.5, { B: 0.69, N: 0.069 });
    const cell = cellIndex(60, 64);
    setUnits(w, cell, 2000); // p ≈ 1 − e^−10: infected on the first tick
    rebaseLedger(w);
    const c = w.ents.cols;
    const birth = c.birthId[host]!;
    let infectedAt = -1;
    let before: { B: number; N: number; cell: number; units: number; det: number; detN: number } | null = null;
    let after: { units: number; det: number; detN: number } | null = null;
    let lysedAt = -1;
    for (let t = 0; t < 400 && lysedAt < 0; t++) {
      step(w, {
        afterStage: (stage, world) => {
          const cc = world.ents.cols;
          if (stage === 5 && infectedAt < 0 && cc.alive[host] === 1 && cc.infectedBy[host] !== 0) infectedAt = world.tick;
          if (stage === 6 && cc.alive[host] === 1 && cc.birthId[host] === birth) {
            const hc = cellIndex(Math.floor(cc.x[host]!), Math.floor(cc.y[host]!));
            before = { B: cc.B[host]!, N: cc.N[host]!, cell: hc, units: world.fields.v01![hc]!, det: world.fields.detritus![hc]!, detN: world.fields.detritusN![hc]! };
          }
          if (stage === 7 && (cc.alive[host] !== 1 || cc.birthId[host] !== birth) && lysedAt < 0) {
            lysedAt = world.tick;
            const hc = before!.cell;
            after = { units: world.fields.v01![hc]!, det: world.fields.detritus![hc]!, detN: world.fields.detritusN![hc]! };
          }
        },
      });
    }
    expect(infectedAt).toBeGreaterThanOrEqual(0);
    expect(lysedAt - infectedAt).toBe(200);
    expect(w.events.ring.find((e) => e.type === 'death' && e.birthId === birth)?.cause).toBe(R.DEATH_LYSIS);
    const b = before!;
    const a = after!;
    expect(b.B).toBeCloseTo(0.7, 15);
    const units = a.units - b.units;
    expect(units).toBe(28);
    const remainder = a.det - b.det;
    expect(units * 0.01 + remainder).toBeCloseTo(b.B, 14);
    expect(remainder).toBeCloseTo(0.42, 14);
    expect(a.detN - b.detN).toBeCloseTo(b.N, 15); // all bound N
    expect(checkLedger(w).ok).toBe(true);
  });
});

describe('Phage doses (SPEC §10.2)', () => {
  it('adds count units to each footprint cell the material brush accepts, logs count × 0.01 C per cell and creates no organism', () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1'); // has stones
    const stone = maskCells().find((k) => w.grid.structure[k] === ST_STONE)!;
    const sx = (stone % 128) + 0.5;
    const sy = Math.floor(stone / 128) + 0.5;
    for (const count of [1, 5, 20]) {
      const entities = w.ents.count;
      const inputs = w.ledger.inputs.c;
      const inputsN = w.ledger.inputs.n;
      const before = Float64Array.from(w.fields.v01!);
      const foot = brushCells(sx, sy, 3);
      const ok = foot.filter((k) => phageCellAccepts(w, k));
      expect(ok.length).toBeGreaterThan(0);
      expect(ok.length).toBeLessThan(foot.length); // the stone (and its neighbours) are refused
      const cmd = applyNow(w, `dose-${count}`, { kind: 'inoculate', speciesId: 'V01', x: sx, y: sy, radius: 3, count });
      expect(cmd.result).toEqual({ accepted: ok.length, rejected: foot.length - ok.length });
      for (const k of foot) expect(w.fields.v01![k]! - before[k]!).toBe(phageCellAccepts(w, k) ? count : 0);
      expect(w.ledger.inputs.c - inputs).toBeCloseTo(ok.length * count * 0.01, 12);
      expect(w.ledger.inputs.n).toBe(inputsN); // units carry no nutrient
      expect(w.ents.count).toBe(entities);
      // The Life brush preview states the same rule cell by cell (grid.ts lifeCellOutcome, viral).
      for (const k of foot) {
        const preview = lifeCellOutcome(w.grid.structure[k]!, w.grid.substrate[k]!, { habitatMask: 0, attached: false, viral: true }, false);
        expect(preview === 'ok').toBe(phageCellAccepts(w, k));
      }
    }
    expect(checkLedger(w).ok).toBe(true);
  });

  it('refuses malformed doses and worlds without the viruses system, changing nothing', () => {
    const w = clearWater();
    const totals = computeTotals(w).c;
    for (const count of [0, 21, 2.5, -5]) {
      const cmd = applyNow(w, `bad-${count}`, { kind: 'inoculate', speciesId: 'V01', x: 60.5, y: 64.5, radius: 3, count });
      expect(cmd.result?.accepted).toBe(0);
    }
    expect(computeTotals(w).c).toBe(totals);
    const g2 = realizeRecipe(registryWith(G2_LISTS), 'FIRST_DISH_V1');
    const before = { ...g2.ledger.inputs };
    const ents = g2.ents.count;
    const cmd = applyNow(g2, 'dose', { kind: 'inoculate', speciesId: 'V01', x: 60.5, y: 64.5, radius: 3, count: 5 });
    expect(cmd.result?.accepted).toBe(0);
    expect(g2.ledger.inputs).toEqual(before);
    expect(g2.ents.count).toBe(ents);
    expect(g2.fields.v01).toBeUndefined();
  });
});

describe('V01 conservation, closed lid', () => {
  it('a closed-lid 10,000-tick Sprinter + Pinphage dish conserves to < 1e-5 with at least one lysis', () => {
    const w = clearWater({ lid: 'closed' });
    for (const cell of brushCells(64, 64, 10)) w.fields.sugar![cell] = 0.5;
    markField(w, 'sugar');
    for (let k = 0; k < 30; k++) place(w, 'B01', 56.5 + (k % 6) * 3, 56.5 + Math.floor(k / 6) * 3);
    applyNow(w, 'phage', { kind: 'inoculate', speciesId: 'V01', x: 64, y: 64, radius: 6, count: 5 });
    rebaseLedger(w);
    let lyses = 0;
    let seen = w.counters.nextEventId;
    let worstC = 0;
    let worstN = 0;
    for (let chunk = 0; chunk < 20; chunk++) {
      for (let t = 0; t < 500; t++) {
        step(w);
        for (const e of w.events.ring) {
          if (e.id < seen) continue;
          if (e.type === 'death' && e.cause === R.DEATH_LYSIS) lyses++;
        }
        seen = w.counters.nextEventId;
      }
      const check = checkLedger(w);
      worstC = Math.max(worstC, check.relErr.c);
      worstN = Math.max(worstN, check.relErr.n);
      expect(check.ok, `tick ${w.tick}: ${JSON.stringify(check)}`).toBe(true);
      expect(inactiveFieldsNonZero(w)).toEqual([]);
    }
    expect(w.tick).toBe(10000);
    expect(w.ledger.exchangeC).toBe(0);
    expect(worstC).toBeLessThan(1e-5);
    expect(worstN).toBeLessThan(1e-5);
    expect(lyses).toBeGreaterThanOrEqual(1);
    console.info(`phage closed lid: worst relative error C ${worstC.toExponential(3)}, N ${worstN.toExponential(3)}; lyses ${lyses}; Sprinters alive ${aliveOf(w, 'B01').length}`);
  }, 600_000);
});

// ---------------------------------------------------------------------------------- saves

function infectedWorld(): World {
  const w = clearWater();
  fillField(w, 'sugar', 0.2);
  for (let k = 0; k < 12; k++) place(w, 'B01', 50.5 + (k % 4), 60.5 + Math.floor(k / 4));
  applyNow(w, 'phage', { kind: 'inoculate', speciesId: 'V01', x: 52, y: 62, radius: 3, count: 20 });
  run(w, 60);
  const c = w.ents.cols;
  expect(aliveOf(w, 'B01').filter((s) => c.infectedBy[s] !== 0).length).toBeGreaterThan(0);
  return w;
}

async function editedSave(w: World, edit: (s: WorldState) => void): Promise<string> {
  const { text } = await buildSaveFile(w, meta);
  const f = JSON.parse(text) as { state: WorldState; checksum: string };
  edit(f.state);
  f.checksum = `sha256:${await sha256Hex(canonicalJson(f.state))}`;
  return JSON.stringify(f);
}

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

describe('V01 saves and imports', () => {
  it('stateHash is equal at 1× and 4× (chunked stepping) mid-infection', () => {
    const a = infectedWorld();
    const b = infectedWorld();
    expect(stateHash(b)).toBe(stateHash(a));
    run(a, 400);
    for (let k = 0; k < 100; k++) {
      run(b, 4);
      stateHash(b);
    }
    expect(stateHash(b)).toBe(stateHash(a));
  }, 120_000);

  it('buildSaveFile → loadSaveFile mid-infection continues bit-identically (through lysis)', async () => {
    const a = infectedWorld();
    const { text } = await buildSaveFile(a, meta);
    const { world: b } = await loadSaveFile(text);
    expect(stateHash(b)).toBe(stateHash(a));
    let lyses = 0;
    const seen = a.counters.nextEventId;
    run(a, 400);
    run(b, 400);
    for (const e of a.events.ring) if (e.id >= seen && e.type === 'death' && e.cause === R.DEATH_LYSIS) lyses++;
    expect(lyses).toBeGreaterThan(0);
    expect(stateHash(b)).toBe(stateHash(a));
  }, 120_000);

  it('the import refuses an infection in a world without viruses and a negative or non-finite infection timer', async () => {
    const w = infectedWorld();
    const c = w.ents.cols;
    const sick = aliveOf(w, 'B01').find((s) => c.infectedBy[s] !== 0)!;
    await expectRefused(await editedSave(w, (s) => setColumn(s, 'infectionTimer', sick, -0.1)), /An infection timer is invalid/);
    // A non-finite timer is caught by the generic column check first; its message also ends "Nothing was loaded.".
    await expectRefused(await editedSave(w, (s) => setColumn(s, 'infectionTimer', sick, Infinity)), /infectionTimer has a non-finite value\. Nothing was loaded\.$/);
    await expectRefused(await editedSave(w, (s) => setColumn(s, 'infectionTimer', sick, NaN)), /infectionTimer has a non-finite value\. Nothing was loaded\.$/);
    const g2 = realizeRecipe(registryWith(G2_LISTS), 'FIRST_DISH_V1');
    const b01 = aliveOf(g2, 'B01')[0]!;
    await expectRefused(await editedSave(g2, (s) => setColumn(s, 'infectedBy', b01, 1)), /An organism is infected, but this dish's rules have no viruses/);
    await expect(loadSaveFile((await buildSaveFile(w, meta)).text)).resolves.toBeTruthy();
  });

  it('the import refuses a virus code this build does not simulate (fix1: it used to load, then lysis threw)', async () => {
    const w = infectedWorld();
    const c = w.ents.cols;
    const sick = aliveOf(w, 'B01').find((s) => c.infectedBy[s] !== 0)!;
    for (const code of [2, 7, 255]) {
      const text = await editedSave(w, (s) => {
        setColumn(s, 'infectedBy', sick, code);
        setColumn(s, 'infectionTimer', sick, 19.95);
      });
      await expectRefused(text, /An organism is infected by a virus this dish does not have\. Nothing was loaded\.$/);
    }
    // The same edit with the real code (1) loads and lyses within one tick: the refusal is about the code.
    const ok = await editedSave(w, (s) => setColumn(s, 'infectionTimer', sick, 19.95));
    const { world: b } = await loadSaveFile(ok);
    const id = b.ents.cols.birthId[sick]!;
    run(b, 2);
    expect(b.events.ring.some((e) => e.type === 'death' && e.birthId === id && e.cause === R.DEATH_LYSIS)).toBe(true);
  });

  it('the import refuses an infection of a species V01 does not list in hostIds (Sunbead, Hitcher)', async () => {
    const w = infectedWorld();
    const a01 = place(w, 'A01', 70.5, 70.5);
    const x01 = place(w, 'X01', 72.5, 70.5);
    for (const slot of [a01, x01]) {
      await expectRefused(
        await editedSave(w, (s) => setColumn(s, 'infectedBy', slot, 1)),
        /An organism is infected by Pinphage, which cannot infect it\. Nothing was loaded\.$/,
      );
    }
    await expect(loadSaveFile((await buildSaveFile(w, meta)).text)).resolves.toBeTruthy();
  });

  it('the import refuses an infection timer on an organism that is not infected', async () => {
    const w = infectedWorld();
    const c = w.ents.cols;
    const well = place(w, 'B01', 80.5, 70.5);
    expect(c.infectedBy[well]).toBe(0);
    expect(c.infectionTimer[well]).toBe(0);
    await expect(loadSaveFile((await buildSaveFile(w, meta)).text)).resolves.toBeTruthy();
    await expectRefused(
      await editedSave(w, (s) => setColumn(s, 'infectionTimer', well, 5)),
      /An infection timer is set on an organism that is not infected\. Nothing was loaded\.$/,
    );
  });
});
