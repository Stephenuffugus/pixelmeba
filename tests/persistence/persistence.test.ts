/**
 * P1.9 persistence: save-file round trip, import validation (malformed input never builds a world),
 * atomic slot writes with a retained predecessor, and fallback to the predecessor on corruption.
 */
import { describe, expect, it } from 'vitest';
import type { SaveFileError } from '../../src/persistence/saveFile';
import { buildSaveFile, cleanName, loadSaveFile, parseSaveFile } from '../../src/persistence/saveFile';
import { AUTOSAVE_SLOT, MemoryBackend, SaveStore } from '../../src/persistence/store';
import { gunzipText } from '../../src/persistence/compress';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { registry } from '../helpers/world';

async function sampleSave(ticks = 300) {
  const w = realizeRecipe(registry(), 'FIRST_DISH_V1');
  run(w, ticks);
  const built = await buildSaveFile(w, { name: 'Test dish', savedAt: '2026-09-27T00:00:00Z', recipeId: 'FIRST_DISH_V1' });
  return { w, ...built };
}

async function expectRejected(text: string, kind: SaveFileError['kind']) {
  await expect(loadSaveFile(text)).rejects.toMatchObject({ kind });
}

describe('save file (P1.9)', () => {
  it('export → import rebuilds an identical world (same state hash) that continues identically', async () => {
    const { w, text } = await sampleSave();
    const { world } = await loadSaveFile(text);
    expect(stateHash(world)).toBe(stateHash(w));
    run(w, 200);
    run(world, 200);
    expect(stateHash(world)).toBe(stateHash(w));
  });

  it('rejects malformed input with a clear error and builds nothing', async () => {
    await expectRejected('not json', 'json');
    await expectRejected(JSON.stringify({ hello: 1 }), 'format');
    const { text } = await sampleSave(50);
    const f = JSON.parse(text) as Record<string, unknown>;
    await expectRejected(JSON.stringify({ ...f, schemaVersion: 99 }), 'version');
    // Tampering with any state value breaks the checksum.
    const tampered = JSON.parse(text) as { state: { seed: number } };
    tampered.state.seed += 1;
    await expectRejected(JSON.stringify(tampered), 'checksum');
  });

  it('rejects integrity violations even with a recomputed checksum', async () => {
    const { text } = await sampleSave(50);
    const f = JSON.parse(text) as { state: { entities: { highWater: number } } };
    f.state.entities.highWater = 99999;
    await expectRejected(JSON.stringify(f), 'integrity');
    const g = JSON.parse(text) as { state: { fields: Record<string, { b64: string }> } };
    g.state.fields.sugar!.b64 = g.state.fields.sugar!.b64.slice(4);
    await expectRejected(JSON.stringify(g), 'integrity');
    const h = JSON.parse(text) as { state: { genomes: { ancestor: string }[] } };
    h.state.genomes[0]!.ancestor = 'Z99';
    await expectRejected(JSON.stringify(h), 'integrity');
  });

  it('rejects files over 25 MB before parsing', async () => {
    await expectRejected('x'.repeat(25 * 1024 * 1024 + 1), 'size');
  });

  it('cleans display names to plain text of at most 60 characters', () => {
    expect(cleanName('  <b>Hi</b>\n\u0007')).toBe('<b>Hi</b>');
    expect(cleanName('a'.repeat(100))).toHaveLength(60);
    expect(cleanName('   ')).toBe('Untitled dish');
  });

  it('a stripped export removes names and notes but keeps the simulation state', async () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1');
    const built = await buildSaveFile(w, { name: 'My secret', savedAt: 'x', recipeId: null, note: 'private' }, { stripNames: true });
    expect(built.file.meta.name).toBe('Shared dish');
    const { world } = await loadSaveFile(built.text);
    expect(stateHash(world)).toBe(stateHash(w));
  });
});

describe('save slots (P1.9)', () => {
  it('keeps the previous save when a write fails', async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend);
    const first = await sampleSave(100);
    await store.save({ slotId: 'slot1', text: first.text, checksum: first.checksum, name: 'A', tick: 100, savedAt: 't1', recipeId: null });
    const second = await sampleSave(200);
    backend.failNextCommit = true;
    await expect(store.save({ slotId: 'slot1', text: second.text, checksum: second.checksum, name: 'A', tick: 200, savedAt: 't2', recipeId: null })).rejects.toThrow();
    const loaded = await store.load('slot1', async (t) => (await parseSaveFile(t)) !== null);
    expect(loaded!.usedPredecessor).toBe(false);
    expect(JSON.parse(loaded!.text).tick).toBe(100);
  });

  it('retains exactly one predecessor per slot and falls back to it when the current record is corrupt', async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend);
    const saves = [await sampleSave(50), await sampleSave(60), await sampleSave(70)];
    for (const [k, s] of saves.entries()) {
      await store.save({ slotId: AUTOSAVE_SLOT, text: s.text, checksum: s.checksum, name: 'Auto', tick: 50 + k * 10, savedAt: `t${k}`, recipeId: null });
    }
    expect(Object.keys(backend.records)).toHaveLength(2);
    const slot = backend.slots[AUTOSAVE_SLOT]!;
    // Corrupt the current record.
    backend.records[slot.current] = { ...backend.records[slot.current]!, data: new Uint8Array([1, 2, 3]) };
    const loaded = await store.load(AUTOSAVE_SLOT, async (t) => {
      await parseSaveFile(t);
      return true;
    });
    expect(loaded!.usedPredecessor).toBe(true);
    expect(JSON.parse(loaded!.text).tick).toBe(60);
  });

  it('reports the first free slot and none when all ten are used', async () => {
    const store = new SaveStore(new MemoryBackend());
    const s = await sampleSave(10);
    for (let i = 1; i <= 10; i++) {
      expect(await store.freeSlot()).toBe(`slot${i}`);
      await store.save({ slotId: `slot${i}`, text: s.text, checksum: s.checksum, name: `D${i}`, tick: 10, savedAt: `t${i}`, recipeId: null });
    }
    expect(await store.freeSlot()).toBeNull();
  });

  it('stores compressed records that decompress to the exact save text', async () => {
    const backend = new MemoryBackend();
    const store = new SaveStore(backend);
    const s = await sampleSave(100);
    const info = await store.save({ slotId: 'slot3', text: s.text, checksum: s.checksum, name: 'C', tick: 100, savedAt: 't', recipeId: null });
    expect(info.bytes).toBeLessThan(s.text.length / 3);
    expect(await gunzipText(backend.records[info.current]!.data)).toBe(s.text);
  });
});
