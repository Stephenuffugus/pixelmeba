/**
 * World schema 4 → 5 (Phase 5 foundation; D-0102, D-0101): every save the v1.0.0-rc1 build wrote
 * (tests/fixtures/saves-rc1/) loads through the real import path, is migrated by copy, hashes exactly
 * as the rc1 build hashed it, continues exactly as it did, and holds no Phase 5 state. A held Sample's
 * rows gain the Phase 5 columns at their empty values (decodeSample needs every column) and still hash
 * as before. A re-save is schema 5 and reloads to the same hash; a fresh save is schema 5, so a v1.0
 * build refuses it ("needs a newer version"); a state claiming schema 6 is refused the same way here.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, SaveFileError } from '../../src/persistence/saveFile';
import { emptyValueOf } from '../../src/sim/entities';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { realizeRecipe } from '../../src/sim/recipes';
import { decodeSample, type SavedSample } from '../../src/sim/sampleSlot';
import { COLUMNS_ADDED_IN, migrateWorldState, stateHash, type WorldState } from '../../src/sim/serialize';
import { SCHEMA_VERSION, type World } from '../../src/sim/world';
import { measureRc1Save, RC1_SAVE_FILES, readRc1Expected, readRc1SaveText } from '../helpers/rc1-saves';
import { registry } from '../helpers/world';

const expected = readRc1Expected();
const SCHEMA5 = COLUMNS_ADDED_IN[5]!;
const SAMPLE_FILE = 'first-dish-lab-food-sample-held-t1500.pixelmeba.gz';
const meta = { name: 'schema 5 re-save', savedAt: '2026-10-13T00:00:00.000Z', recipeId: null };

/** Every schema 5 column and store of a loaded world is empty. */
function expectNoPhase5State(w: World): void {
  const hw = w.ents.highWater;
  for (const name of SCHEMA5) {
    const arr = w.ents.cols[name] as ArrayLike<number>;
    for (let i = 0; i < hw; i++) if (!Object.is(arr[i], emptyValueOf(name))) throw new Error(`${name}[${i}] = ${arr[i]}`);
  }
  expect(w.edges).toEqual([]);
  expect(w.devices).toEqual([]);
  expect(w.climate).toEqual({ warmth: null, moisture: null });
  expect(w.gateTally).toEqual([]);
  expect(w.counters.nextDeviceId).toBe(1);
  expect(w.settings.cycleStartTick).toBeUndefined();
}

describe('rc1 saves migrate 4 → 5 by copy and keep their hashes (D-0102)', () => {
  for (const file of RC1_SAVE_FILES) {
    it(`${file}: schema 4 → 5, hash at load and +1,000 ticks equal the rc1 build's, no Phase 5 state`, { timeout: 600_000 }, async () => {
      const text = readRc1SaveText(file);
      const raw = JSON.parse(text) as { schemaVersion: number; state: WorldState };
      expect(raw.schemaVersion).toBe(4);
      expect(raw.state.schemaVersion).toBe(4);
      expect(raw.state.entities.columns.glowState).toBeUndefined();
      expect('edges' in raw.state).toBe(false);
      const before = JSON.stringify(raw.state);
      const migrated = migrateWorldState(raw.state);
      expect(JSON.stringify(raw.state)).toBe(before); // by copy
      expect(migrated.schemaVersion).toBe(5);
      expect(migrated.edges).toEqual([]);
      expect(migrated.devices).toEqual([]);
      expect(migrated.climate).toEqual({ warmth: null, moisture: null });
      expect(migrated.gateTally).toEqual([]);
      expect(migrated.counters.nextDeviceId).toBe(1);

      const { world: atLoad, file: f } = await loadSaveFile(text);
      expect(JSON.stringify(raw.state)).toBe(before);
      expect(f.schemaVersion).toBe(SCHEMA_VERSION);
      expect(atLoad.schemaVersion).toBe(5);
      expect(atLoad.content.provenance.migratedFrom).toEqual([4]);
      expect(stateHash(atLoad)).toBe(expected.saves[file]!.hashAtLoad);
      expectNoPhase5State(atLoad);

      const { expected: got, world } = await measureRc1Save(file, text);
      expect(got.hashAtLoad).toBe(expected.saves[file]!.hashAtLoad);
      expect(got.hashAfterResume).toBe(expected.saves[file]!.hashAfterResume);
      expect(got.hashPlus1000).toBe(expected.saves[file]!.hashPlus1000);
      expect(got.digestPlus1000).toBe(expected.saves[file]!.digestPlus1000);
      expectNoPhase5State(world);
    });
  }

  it('the held Sample: its rows gain the Phase 5 columns at their empty values, decode, and hash as the rc1 build hashed them', async () => {
    const text = readRc1SaveText(SAMPLE_FILE);
    const raw = JSON.parse(text) as { state: WorldState };
    const savedSample = raw.state.sample!;
    expect(savedSample.rows.count).toBeGreaterThan(0);
    for (const name of SCHEMA5) expect(savedSample.rows.columns[name], name).toBeUndefined();
    // Without the schema 5 step the v1.0 sample could not be read.
    expect(() => decodeSample(savedSample)).toThrow(/sample column glowState missing/);

    const migrated = migrateWorldState(raw.state).sample as SavedSample;
    expect(migrated).not.toBe(savedSample);
    for (const name of SCHEMA5) expect(migrated.rows.columns[name]!.length, name).toBe(savedSample.rows.count);
    const held = decodeSample(migrated);
    expect(held.rows.length).toBe(savedSample.rows.count);
    for (const r of held.rows) for (const name of SCHEMA5) expect(Object.is(r.cols[name], emptyValueOf(name)), name).toBe(true);
    expect(held.rows.every((r) => r.cols.trapSlot === -1 && r.cols.heldBySlot === -1)).toBe(true);

    const { world } = await loadSaveFile(text);
    expect(world.sample!.rows.length).toBe(savedSample.rows.count);
    expect(stateHash(world)).toBe(expected.saves[SAMPLE_FILE]!.hashAtLoad);
  });

  it('a re-save is schema 5 with every store written; it reloads to the same hash and keeps migratedFrom', async () => {
    for (const file of [SAMPLE_FILE, 'fungal-supply-line-t900.pixelmeba.gz']) {
      const { world } = await loadSaveFile(readRc1SaveText(file));
      const { text } = await buildSaveFile(world, meta);
      const json = JSON.parse(text) as { schemaVersion: number; state: WorldState };
      expect(json.schemaVersion).toBe(5);
      expect(json.state.schemaVersion).toBe(5);
      expect(json.state.edges).toEqual([]);
      expect(json.state.devices).toEqual([]);
      expect(json.state.climate).toEqual({ warmth: null, moisture: null });
      expect(json.state.gateTally).toEqual([]);
      expect(json.state.counters.nextDeviceId).toBe(1);
      for (const name of SCHEMA5) expect(json.state.entities.columns[name], name).toBeDefined();
      const again = await loadSaveFile(text);
      expect(stateHash(again.world)).toBe(stateHash(world));
      expect(stateHash(again.world)).toBe(expected.saves[file]!.hashAtLoad);
      expect(again.world.content.provenance.migratedFrom).toEqual([4]);
    }
  });

  it('a fresh save says schema 5; a state claiming schema 6 is refused with "needs a newer version"', async () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1');
    const { text } = await buildSaveFile(w, { name: 'fresh', savedAt: '2026-10-13T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' });
    const json = JSON.parse(text) as { schemaVersion: number; state: WorldState; checksum: string };
    // v1.0.0-rc1's parseSaveFile refuses any schemaVersion above its own 4 with kind 'version' and
    // "This dish needs a newer version of Pixelmeba (save schema 5)." (git show v1.0.0-rc1:src/persistence/saveFile.ts:280).
    expect(json.schemaVersion).toBe(5);
    expect(json.state.schemaVersion).toBe(5);
    expect(w.content.provenance.migratedFrom).toBeUndefined();

    const state = { ...json.state, schemaVersion: 6 };
    const six = JSON.stringify({ ...json, schemaVersion: 6, state, checksum: `sha256:${await sha256Hex(canonicalJson(state))}` });
    await expect(loadSaveFile(six)).rejects.toMatchObject({ kind: 'version' });
    await expect(loadSaveFile(six)).rejects.toThrow(/needs a newer version/);
    // The file header may say 5 while the state claims 6: still refused as a version problem, never built.
    const headerFive = JSON.stringify({ ...json, schemaVersion: 5, state, checksum: `sha256:${await sha256Hex(canonicalJson(state))}` });
    const err = await loadSaveFile(headerFive).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SaveFileError);
    expect(err).toMatchObject({ kind: 'version' });
  });
});
