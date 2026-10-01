/**
 * Save migration (SPEC §14.5, ARCH §11.3): worlds written at older schemas load through the real
 * import path (loadSaveFile), are migrated by copy and continue exactly like the same world saved by
 * the build that wrote them. Three paths reach world schema 4 (Phase 3 foundation; D-0035):
 *   - 3 → 4: a real save written by the g2 build (tests/fixtures/saves/); its stateHash at load is the
 *     g2 build's (expected.json hashAtLoad), because the schema 4 state is hash-neutral while empty;
 *   - 2 → 4: the real schema 2 save in tests/persistence/fixtures/ (its hashes at load and +300 ticks
 *     are asserted in tests/sim/history-debris.test.ts);
 *   - 1 → 4: a current save rewritten as schema 1 (no later columns, no schema 4 stores).
 * Each records provenance.migratedFrom, leaves its input untouched, fills every link-slot column with
 * −1 (emptyValueOf: a 0 would point at slot 0), passes linksValid, and re-saves and re-loads to the
 * same stateHash. Also: imports that the simulation could not run are refused up front.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { emptyValueOf, ENTITY_COLUMNS, FIRST_HASH_NEUTRAL_COLUMN } from '../../src/sim/entities';
import { base64ToBytes, canonicalJson, sha256Hex } from '../../src/sim/hash';
import { FUNGAL_SLOT_COLUMNS, ADHESION_SLOT_COLUMNS, linksValid } from '../../src/sim/links';
import { realizeRecipe } from '../../src/sim/recipes';
import { COLUMNS_ADDED_IN, migrateWorldState, serializeWorld, stateHash, type WorldState } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { SCHEMA_VERSION, type World } from '../../src/sim/world';
import { readExpected, readG2SaveText } from '../helpers/g2-saves';
import { registry } from '../helpers/world';

const meta = (name: string) => ({ name, savedAt: '2026-10-01T00:00:00Z', recipeId: null });

/** Rewrite a current save as schema 1: drop every column and store added later, restamp version and checksum. */
async function asSchema1(text: string): Promise<string> {
  const file = JSON.parse(text) as { schemaVersion: number; state: WorldState; checksum: string };
  const columns = { ...file.state.entities.columns };
  for (let v = 2; v <= SCHEMA_VERSION; v++) for (const name of COLUMNS_ADDED_IN[v] ?? []) delete columns[name];
  const { objects: _o, sample: _s, ...rest } = file.state;
  const { nextObjectId: _n, ...counters } = file.state.counters;
  const state = { ...rest, schemaVersion: 1, counters, entities: { ...file.state.entities, columns } };
  const checksum = `sha256:${await sha256Hex(canonicalJson(state))}`;
  return JSON.stringify({ ...file, schemaVersion: 1, state, checksum });
}

async function resave(text: string, edit: (s: { entities: { columns: Record<string, { b64: string } | undefined> } }) => void): Promise<string> {
  const file = JSON.parse(text) as { state: WorldState; checksum: string };
  edit(file.state);
  file.checksum = `sha256:${await sha256Hex(canonicalJson(file.state))}`;
  return JSON.stringify(file);
}

/** The schema 4 columns of a migrated state hold exactly their empty values (decoded from the payload). */
function expectEmptyPhase3Columns(state: WorldState): void {
  const hw = state.entities.highWater;
  for (const [name, dtype] of ENTITY_COLUMNS.slice(FIRST_HASH_NEUTRAL_COLUMN)) {
    const enc = state.entities.columns[name]!;
    expect(enc.length, name).toBe(hw);
    const bytes = new Uint8Array(base64ToBytes(enc.b64));
    const Ctor = { f64: Float64Array, f32: Float32Array, i32: Int32Array, u32: Uint32Array, u16: Uint16Array, u8: Uint8Array }[dtype];
    const arr = new Ctor(bytes.buffer, 0, hw);
    expect(
      Array.from(arr).every((v) => v === emptyValueOf(name)),
      `${name} filled with ${emptyValueOf(name)}`,
    ).toBe(true);
  }
  expect(state.objects).toEqual([]);
  expect(state.sample).toBeNull();
}

/** Every link-slot column of a loaded world holds −1, and its links are valid. */
function expectNoLinks(world: World): void {
  const hw = world.ents.highWater;
  expect(hw).toBeGreaterThan(0);
  for (const name of [...FUNGAL_SLOT_COLUMNS, ...ADHESION_SLOT_COLUMNS]) {
    expect(emptyValueOf(name)).toBe(-1);
    expect(Array.from(world.ents.cols[name].subarray(0, hw)).every((v) => v === -1), name).toBe(true);
  }
  expect(linksValid(world)).toBe(true);
  expect(world.objects).toEqual([]);
  expect(world.sample).toBeNull();
}

async function expectResaveRoundTrip(world: World, migratedFrom: number[]): Promise<void> {
  const again = await loadSaveFile((await buildSaveFile(world, meta('again'))).text);
  expect(again.file.schemaVersion).toBe(SCHEMA_VERSION);
  expect(stateHash(again.world)).toBe(stateHash(world));
  // The tag stays (a current save is not migrated again).
  expect(again.world.content.provenance.migratedFrom).toEqual(migratedFrom);
}

describe('save migration', () => {
  it('world schema is 4 and schema 4 added exactly the Phase 3 columns', () => {
    expect(SCHEMA_VERSION).toBe(4);
    expect(COLUMNS_ADDED_IN[4]).toEqual(ENTITY_COLUMNS.slice(FIRST_HASH_NEUTRAL_COLUMN).map(([n]) => n));
    expect(COLUMNS_ADDED_IN[4]![0]).toBe('filmSeconds');
    expect(COLUMNS_ADDED_IN[4]).toContain('noUsableIntakeSeconds');
  });

  it('3 → 4: a save written by the g2 build migrates by copy and hashes exactly as the g2 build hashed it', async () => {
    const file = 'first-dish-t3000.pixelmeba.gz';
    const text = readG2SaveText(file);
    const raw = JSON.parse(text) as { schemaVersion: number; state: WorldState };
    expect(raw.schemaVersion).toBe(3);
    expect(raw.state.schemaVersion).toBe(3);
    expect(raw.state.entities.columns.fLink0).toBeUndefined();
    expect('objects' in raw.state).toBe(false);
    const before = JSON.stringify(raw.state);
    const migrated = migrateWorldState(raw.state);
    expect(JSON.stringify(raw.state)).toBe(before); // by copy: the input is untouched
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expectEmptyPhase3Columns(migrated);

    const { file: f, world } = await loadSaveFile(text);
    expect(JSON.stringify(raw.state)).toBe(before);
    expect(f.schemaVersion).toBe(SCHEMA_VERSION);
    expect(world.schemaVersion).toBe(SCHEMA_VERSION);
    expect(stateHash(world)).toBe(readExpected().saves[file]!.hashAtLoad);
    expect(world.content.provenance.migratedFrom).toEqual([3]);
    expectNoLinks(world);
    await expectResaveRoundTrip(world, [3]);
  });

  it('2 → 4: the real schema 2 save migrates by copy through both steps', async () => {
    const text = gunzipSync(readFileSync('tests/persistence/fixtures/schema2-cleaning-crew-t1900.pixelmeba.gz')).toString('utf8');
    const raw = JSON.parse(text) as { schemaVersion: number; state: WorldState };
    expect(raw.state.schemaVersion).toBe(2);
    const before = JSON.stringify(raw.state);
    const migrated = migrateWorldState(raw.state);
    expect(JSON.stringify(raw.state)).toBe(before);
    expectEmptyPhase3Columns(migrated);
    expect(migrated.history.journal).toEqual([]); // the schema 3 step ran too

    const { world } = await loadSaveFile(text);
    expect(JSON.stringify(raw.state)).toBe(before);
    expect(world.schemaVersion).toBe(SCHEMA_VERSION);
    expect(world.content.provenance.migratedFrom).toEqual([2]);
    expectNoLinks(world);
    // Its hashes at load and after +300 ticks are the schema 2 build's (asserted in tests/sim/history-debris.test.ts).
    await expectResaveRoundTrip(world, [2]);
  });

  it('1 → 4: a schema 1 save loads through the import path and continues identically', async () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1');
    run(w, 300);
    const { text } = await buildSaveFile(w, { name: 'Old dish', savedAt: '2026-09-27T00:00:00Z', recipeId: 'FIRST_DISH_V1' });
    const old = await asSchema1(text);
    const oldState = (JSON.parse(old) as { state: WorldState }).state;
    expect(oldState.entities.columns.dryTimer).toBeUndefined();
    expect(oldState.entities.columns.fLink0).toBeUndefined();
    expect('objects' in oldState).toBe(false);
    expect('sample' in oldState).toBe(false);
    const before = JSON.stringify(oldState);
    expectEmptyPhase3Columns(migrateWorldState(oldState));
    expect(JSON.stringify(oldState)).toBe(before);

    const { file, world } = await loadSaveFile(old);
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(world.schemaVersion).toBe(SCHEMA_VERSION);
    expect(stateHash(world)).toBe(stateHash(w));
    // SPEC §14.5: the migrated copy records where it came from; a save made today records nothing.
    expect(world.content.provenance.migratedFrom).toEqual([1]);
    expect(w.content.provenance.migratedFrom).toBeUndefined();
    expectNoLinks(world);
    run(w, 500);
    run(world, 500);
    expect(stateHash(world)).toBe(stateHash(w));
    await expectResaveRoundTrip(world, [1]);
  });

  it('migration is by copy and refuses a newer schema', () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1');
    const cur = migrateWorldState(JSON.parse(JSON.stringify(serializeWorld(w))) as WorldState);
    const v1 = { ...cur, schemaVersion: 1, entities: { ...cur.entities, columns: { ...cur.entities.columns } } } as WorldState;
    delete (v1.entities.columns as Record<string, unknown>).dryTimer;
    const before = JSON.stringify(v1);
    const up = migrateWorldState(v1);
    expect(JSON.stringify(v1)).toBe(before); // input untouched
    expect(up.schemaVersion).toBe(SCHEMA_VERSION);
    expect(up.entities.columns.dryTimer).toBeDefined();
    expect(() => migrateWorldState({ ...cur, schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/newer/);
  });

  it('refuses a resting organism that has no resting ability, before any world is built', async () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1');
    const { text } = await buildSaveFile(w, { name: 'x', savedAt: '2026-09-27T00:00:00Z', recipeId: 'FIRST_DISH_V1' });
    const bad = await resave(text, (s) => {
      // First organism: a Phase 1 species without E03 → lifeState 2 (Resting) is impossible.
      const col = s.entities.columns.lifeState!;
      const bytes = Uint8Array.from(atob(col.b64), (ch) => ch.charCodeAt(0));
      bytes[0] = 2;
      col.b64 = btoa(String.fromCharCode(...bytes));
    });
    await expect(loadSaveFile(bad)).rejects.toMatchObject({ kind: 'integrity' });
    await expect(loadSaveFile(bad)).rejects.toThrow(/resting/);
  });
});
