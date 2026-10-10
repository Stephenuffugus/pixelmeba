/**
 * P3.7 E12 import checks (D-0058; saves verifier MINORs 2 and 3, lead fix).
 *
 *  - Colony pairing state the simulation cannot leave is refused, ending "Nothing was loaded.": a
 *    relink wait below 0 or above the recorded lockoutSeconds, a pairing clock below 0 or past its
 *    slack above linkSeconds, a partner birthId never issued, pairing state on an empty slot, on an
 *    organism without E12, or in a dish whose rules have no E12.
 *  - States the game itself saves load and continue exactly: mid-pairing (a clock and a partner set),
 *    during a relink lockout, and a partner that died after this tick's pairing check (its birthId was
 *    issued; the clock is re-checked at the next pairing check, like D-0050's prey links).
 *  - A recorded module with a missing parameter is refused by name ("E12: recorded parameter
 *    linkDistance is missing. Nothing was loaded."), and the open dish is untouched.
 *
 * Every tampered file is re-stamped with a fresh checksum, so only the edit can refuse it.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, SaveFileError, type SaveFile } from '../../src/persistence/saveFile';
import { introduceOrganism } from '../../src/sim/commands';
import { cellIndex } from '../../src/sim/grid';
import { base64ToBytes, bytesToBase64, canonicalJson, sha256Hex } from '../../src/sim/hash';
import { adhesionNeighbors } from '../../src/sim/links';
import { realizeRecipe } from '../../src/sim/recipes';
import { killEntity } from '../../src/sim/maintenance';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { rebuildIndex } from '../../src/sim/spatial';
import { run, step } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { FromWorker } from '../../src/worker/protocol';
import { registryWith } from '../helpers/registry';
import { clearWater, place, registry, setField } from '../helpers/world';

const SHIPPED_MODULES = registry().manifest.enabledModules;
const REG = registryWith({ enabledModules: [...SHIPPED_MODULES, 'E12'].sort() });
const meta = { name: 'colony', savedAt: '2026-10-10T00:00:00Z', recipeId: null };

type Pos = readonly [number, number];
const A: Pos = [64.3, 64.5];
const B: Pos = [64.7, 64.5];
const PULLED: Pos = [65.1, 64.5]; // 0.8 from A (> severDistance 0.75)
const ELSEWHERE: Pos = [40.5, 64.5];

function dish(): World {
  const base = REG.recipes.FIRST_DISH_V1!;
  return realizeRecipe(
    REG,
    { ...base, id: 'TEST_E12_IMPORT', removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0 }, mutationPreset: 'fixed' },
    { worldId: 'e12-import' },
  );
}

function placeWith(w: World, [x, y]: Pos, modules: readonly string[] = ['E12'], age?: number): number {
  const slot = introduceOrganism(w, speciesIndex(w, 'B01'), cellIndex(Math.floor(x), Math.floor(y)), 'test', { modules, exactCenter: true });
  if (slot < 0) throw new Error('capacity');
  w.ents.cols.x[slot] = x;
  w.ents.cols.y[slot] = y;
  if (age !== undefined) w.ents.cols.age[slot] = age;
  rebuildIndex(w);
  return slot;
}

/** One fed tick with the pair held at fixed points (test device, as in module-e12.test.ts). */
function stepHeld(w: World, held: ReadonlyArray<readonly [number, Pos]>): void {
  for (const [, p] of held) setField(w, 'sugar', cellIndex(Math.floor(p[0]), Math.floor(p[1])), 0.02);
  step(w, {
    afterStage: (stage) => {
      if (stage !== 4) return;
      for (const [s, [x, y]] of held) {
        if (w.ents.cols.alive[s] !== 1) continue;
        w.ents.cols.x[s] = x;
        w.ents.cols.y[s] = y;
      }
      rebuildIndex(w);
    },
  });
}

/** Two E12 Sprinters 0.4 apart, timed for 20 held ticks: both clocks run, each names the other. */
function midPairing(): { w: World; a: number; b: number } {
  const w = dish();
  const a = placeWith(w, A);
  const b = placeWith(w, B);
  for (let k = 0; k < 20; k++) stepHeld(w, [[a, A], [b, B]]);
  const c = w.ents.cols;
  expect(c.adhSeconds[a]).toBeCloseTo(2, 9);
  expect(c.adhPartner[a]).toBe(c.birthId[b]);
  expect(c.adhPartner[b]).toBe(c.birthId[a]);
  return { w, a, b };
}

/** Save, load, compare hashes; then both copies run 50 ticks and still agree. */
async function roundTrip(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  const loaded = (await loadSaveFile(text)).world;
  expect(stateHash(loaded)).toBe(stateHash(w));
  run(w, 50);
  run(loaded, 50);
  expect(stateHash(loaded)).toBe(stateHash(w));
  return loaded;
}

type Ctor = Float64Array | Uint32Array;

/** A re-stamped copy of `text` with entity column `name` at `slot` set to `value`. */
async function tamper(text: string, name: 'adhLockout' | 'adhSeconds' | 'adhPartner', slot: number, value: number): Promise<string> {
  const file = JSON.parse(text) as { state: { entities: { columns: Record<string, { b64: string }> } }; checksum: string };
  const bytes = base64ToBytes(file.state.entities.columns[name]!.b64).slice();
  const col: Ctor = name === 'adhPartner' ? new Uint32Array(bytes.buffer) : new Float64Array(bytes.buffer);
  col[slot] = value;
  file.state.entities.columns[name]!.b64 = bytesToBase64(new Uint8Array(col.buffer));
  file.checksum = `sha256:${await sha256Hex(canonicalJson(file.state))}`;
  return JSON.stringify(file);
}

async function expectRefused(text: string, message: string): Promise<void> {
  const err = await loadSaveFile(text).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(SaveFileError);
  expect((err as Error).message).toBe(`${message} Nothing was loaded.`);
}

describe('E12 pairing state on import (D-0058)', () => {
  it('a save taken mid-pairing loads and continues exactly', async () => {
    const { w, a, b } = midPairing();
    const before = { s: w.ents.cols.adhSeconds[a], p: w.ents.cols.adhPartner[a] };
    const { text } = await buildSaveFile(w, meta);
    const loaded = (await loadSaveFile(text)).world;
    expect(loaded.ents.cols.adhSeconds[a]).toBe(before.s);
    expect(loaded.ents.cols.adhPartner[a]).toBe(before.p);
    expect(loaded.ents.cols.adhPartner[b]).toBe(w.ents.cols.birthId[a]);
    await roundTrip(w);
  });

  it('a save taken during a relink lockout loads and continues exactly', async () => {
    const w = dish();
    const a = placeWith(w, A);
    const b = placeWith(w, B);
    for (let k = 0; k < 60 && !adhesionNeighbors(w, a).includes(b); k++) stepHeld(w, [[a, A], [b, B]]);
    expect(adhesionNeighbors(w, a)).toContain(b);
    stepHeld(w, [[a, A], [b, PULLED]]); // pulled 0.8 apart: the link breaks in stage 8
    expect(adhesionNeighbors(w, a)).not.toContain(b);
    for (let k = 0; k < 7; k++) stepHeld(w, [[a, A], [b, B]]);
    const c = w.ents.cols;
    expect(c.adhLockout[a]).toBeCloseTo(9.3, 9);
    expect(c.adhLockout[b]).toBeCloseTo(9.3, 9);
    await roundTrip(w);
  });

  it('a partner that died after the pairing check (an issued birthId, no longer alive) loads', async () => {
    const w = dish();
    const a = placeWith(w, A);
    const b = placeWith(w, B, ['E12'], 599.05); // dies of age after a few ticks of timing
    const bBirth = w.ents.cols.birthId[b]!;
    const c = w.ents.cols;
    for (let k = 0; k < 40 && c.alive[b] === 1; k++) stepHeld(w, [[a, A], [b, B]]);
    expect(c.alive[b]).toBe(0);
    expect(c.adhPartner[a]).toBe(bBirth);
    expect(c.adhSeconds[a]).toBeGreaterThan(0);
    await roundTrip(w);
  });

  it('refuses a relink wait, a pairing clock or a partner the simulation cannot produce', async () => {
    const { w, a } = midPairing();
    const { text } = await buildSaveFile(w, meta);
    const next = w.counters.nextBirthId;
    await expectRefused(await tamper(text, 'adhLockout', a, -0.1), "An organism's colony relink wait is out of range.");
    await expectRefused(await tamper(text, 'adhLockout', a, 10.5), "An organism's colony relink wait is out of range.");
    await expectRefused(await tamper(text, 'adhSeconds', a, -0.1), "An organism's colony pairing time is out of range.");
    await expectRefused(await tamper(text, 'adhSeconds', a, 6), "An organism's colony pairing time is out of range.");
    await expectRefused(await tamper(text, 'adhPartner', a, next), 'An organism is pairing with an organism that never existed.');
    await expectRefused(await tamper(text, 'adhPartner', a, 0xffffffff), 'An organism is pairing with an organism that never existed.');
    // The edges still load: the full lockout, and the last issued birthId.
    await expect(loadSaveFile(await tamper(text, 'adhLockout', a, 10))).resolves.toBeDefined();
    await expect(loadSaveFile(await tamper(text, 'adhPartner', a, next - 1))).resolves.toBeDefined();
  });

  it('refuses pairing state on an empty slot, on an organism without E12, and in a dish without E12', async () => {
    const { w, a } = midPairing();
    const plain = placeWith(w, ELSEWHERE, []);
    killEntity(w, a, R.DEATH_STARVATION); // test-only: slot a (below highWater) is now empty
    expect(w.ents.cols.alive[a]).toBe(0);
    expect(w.ents.highWater).toBeGreaterThan(a);
    const { text } = await buildSaveFile(w, meta);
    await expectRefused(await tamper(text, 'adhLockout', a, 1), 'An empty place in the dish holds colony pairing state.');
    await expectRefused(await tamper(text, 'adhLockout', plain, 1), 'An organism has colony pairing state but cannot link into colonies.');
    await expectRefused(await tamper(text, 'adhSeconds', plain, 0.1), 'An organism has colony pairing state but cannot link into colonies.');
    await expectRefused(await tamper(text, 'adhPartner', plain, 1), 'An organism has colony pairing state but cannot link into colonies.');

    const shipped = clearWater();
    expect(shipped.modules.E12).toBeUndefined();
    const s = place(shipped, 'B01', 40.5, 64.5);
    const t2 = (await buildSaveFile(shipped, meta)).text;
    await expect(loadSaveFile(t2)).resolves.toBeDefined();
    await expectRefused(await tamper(t2, 'adhLockout', s, 1), "An organism has colony pairing state, but this dish's rules have no colony adhesion.");
  });
});

/** Wait for the reply to an asynchronous request (import runs through handleAsync). */
async function reply(out: FromWorker[], requestId: number): Promise<FromWorker> {
  for (let k = 0; k < 200; k++) {
    const m = out.find((x) => 'requestId' in x && x.requestId === requestId);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`no reply to request ${requestId}`);
}

describe('incomplete recorded modules on import (D-0058)', () => {
  it('a recorded E12 without linkDistance is refused by name; the open dish is untouched', async () => {
    const w = dish();
    placeWith(w, A);
    run(w, 5);
    const { text } = await buildSaveFile(w, meta);
    await expect(loadSaveFile(text)).resolves.toBeDefined();
    const file = JSON.parse(text) as SaveFile;
    const mods = (file.state as unknown as { content: { modules: { id: string; params: Record<string, number> }[] } }).content.modules;
    const e12 = mods.find((m) => m.id === 'E12')!;
    expect(e12.params.linkDistance).toBe(0.5);
    delete e12.params.linkDistance;
    const bad = JSON.stringify({ ...file, checksum: `sha256:${await sha256Hex(canonicalJson(file.state))}` });
    const message = 'E12: recorded parameter linkDistance is missing. Nothing was loaded.';
    const err = await loadSaveFile(bad).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SaveFileError);
    expect(err).toMatchObject({ kind: 'content', message });

    // Through the worker's import path: an error reply, no dish, the open dish untouched.
    const out: FromWorker[] = [];
    const host = new DishHost(REG, (m) => out.push(m), { now: () => 0 });
    host.handle({ type: 'create', requestId: 1, dishId: 'open', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
    const before = stateHash(host.world('open')!);
    host.handle({ type: 'importDish', requestId: 2, text: bad, newDishId: 'imported' });
    const r = await reply(out, 2);
    expect(r).toMatchObject({ type: 'error', request: 'importDish' });
    expect(r.type === 'error' ? r.message : '').toContain(message);
    expect(host.world('imported')).toBeNull();
    expect(stateHash(host.world('open')!)).toBe(before);
    expect(host.activeDishId).toBe('open');
  });
});
