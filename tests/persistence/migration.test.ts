/**
 * Save migration (SPEC §14.5, ARCH §11.3): a world written at schema 1 (Phase 1, before the dormancy
 * column existed) loads through the real import path, is migrated by copy, and continues exactly like
 * the same world saved today. Also: imports that the simulation could not run are refused up front.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { realizeRecipe } from '../../src/sim/recipes';
import { COLUMNS_ADDED_IN, migrateWorldState, serializeWorld, stateHash, type WorldState } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { SCHEMA_VERSION } from '../../src/sim/world';
import { registry } from '../helpers/world';

/** Rewrite a current save as schema 1: drop every column added later, restamp version and checksum. */
async function asSchema1(text: string): Promise<string> {
  const file = JSON.parse(text) as { schemaVersion: number; state: WorldState; checksum: string };
  const columns = { ...file.state.entities.columns };
  for (let v = 2; v <= SCHEMA_VERSION; v++) for (const name of COLUMNS_ADDED_IN[v] ?? []) delete columns[name];
  const state = { ...file.state, schemaVersion: 1, entities: { ...file.state.entities, columns } };
  const checksum = `sha256:${await sha256Hex(canonicalJson(state))}`;
  return JSON.stringify({ ...file, schemaVersion: 1, state, checksum });
}

async function resave(text: string, edit: (s: { entities: { columns: Record<string, { b64: string } | undefined> } }) => void): Promise<string> {
  const file = JSON.parse(text) as { state: WorldState; checksum: string };
  edit(file.state);
  file.checksum = `sha256:${await sha256Hex(canonicalJson(file.state))}`;
  return JSON.stringify(file);
}

describe('save migration', () => {
  it('a schema 1 save loads through the import path and continues identically', async () => {
    // Schema 3 (P2.8) added history records only; this test still exercises the schema 1 column path.
    expect(SCHEMA_VERSION).toBe(3);
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1');
    run(w, 300);
    const { text } = await buildSaveFile(w, { name: 'Old dish', savedAt: '2026-09-27T00:00:00Z', recipeId: 'FIRST_DISH_V1' });
    const old = await asSchema1(text);
    expect(JSON.parse(old).state.entities.columns.dryTimer).toBeUndefined();
    const { file, world } = await loadSaveFile(old);
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(world.schemaVersion).toBe(SCHEMA_VERSION);
    expect(stateHash(world)).toBe(stateHash(w));
    // SPEC §14.5: the migrated copy records where it came from; a save made today records nothing.
    expect(world.content.provenance.migratedFrom).toEqual([1]);
    expect(w.content.provenance.migratedFrom).toBeUndefined();
    run(w, 200);
    run(world, 200);
    expect(stateHash(world)).toBe(stateHash(w));
    // Saved again and reloaded, the tag stays (a current save is not migrated again).
    const again = await loadSaveFile((await buildSaveFile(world, { name: 'Old dish', savedAt: '2026-09-28T00:00:00Z', recipeId: 'FIRST_DISH_V1' })).text);
    expect(again.world.content.provenance.migratedFrom).toEqual([1]);
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
