/**
 * P2.8 (D-0028 follow-up): History records the dish's debris total (detritus carbon) with every
 * per-second sample, and it equals an independent recomputation from the detritus field at every
 * whole second; minute summaries keep the end-of-minute value. World schema 3 carries it (with the
 * trait samples and the dish's journal): a schema 2 save loads through the real import path, migrated
 * by copy, continues identically, and shows no debris value for the seconds it recorded before.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { CELL_COUNT } from '../../src/sim/constants';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { createHistory, interventionSeconds, pushSample, regionalTraitSeries, SECONDS_PER_SUMMARY, type HistorySample } from '../../src/sim/history';
import { traitRecordNote } from '../../src/ui/panels/TraitData';
import { realizeRecipe } from '../../src/sim/recipes';
import { migrateWorldState, serializeWorld, stateHash, type WorldState } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import { SCHEMA_VERSION } from '../../src/sim/world';
import { registry } from '../helpers/world';

const reg = registry();

/** Independent: detritus carbon over the circular dish (cells whose centres lie within radius 63.5 of 63.5, 63.5). */
function detritusOverDish(field: Float64Array): number {
  let sum = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    const x = i % 128;
    const y = Math.floor(i / 128);
    if ((x - 63.5) ** 2 + (y - 63.5) ** 2 <= 63.5 ** 2) sum += field[i]!;
  }
  return sum;
}

/** Rewrite a current save as schema 2: no trait samples, no journal, no debris on any sample. */
async function asSchema2(text: string): Promise<string> {
  const file = JSON.parse(text) as {
    schemaVersion: number;
    state: WorldState & { history: Record<string, unknown> };
    checksum: string;
  };
  const h = { ...file.state.history } as Record<string, unknown>;
  delete h.traits;
  delete h.journal;
  const strip = (list: unknown) =>
    (list as Record<string, unknown>[]).map(({ debrisTotal: _d, ...rest }) => rest);
  h.seconds = strip(h.seconds);
  h.minutes = strip(h.minutes);
  const state = { ...file.state, schemaVersion: 2, history: h };
  const checksum = `sha256:${await sha256Hex(canonicalJson(state))}`;
  return JSON.stringify({ ...file, schemaVersion: 2, state, checksum });
}

describe('debris in History (P2.8)', () => {
  it('every per-second sample records the detritus carbon over the dish, matching an independent sum', () => {
    const w = realizeRecipe(reg, 'CLEANING_CREW_V1', { worldId: 'debris', seed: 103 });
    const expected: Record<number, number> = {};
    for (let t = 0; t < 600; t++) {
      step(w);
      if (w.tick % 10 === 0) expected[w.tick / 10] = detritusOverDish(w.fields.detritus!);
    }
    const samples = w.history.seconds;
    expect(samples).toHaveLength(60);
    for (const s of samples) {
      expect(s.debrisTotal, `second ${s.second}`).toBeDefined();
      expect(s.debrisTotal!).toBeCloseTo(expected[s.second]!, 9);
    }
    // Not vacuous: the patch holds 10 C of debris and the Recyclers eat it down.
    expect(samples[0]!.debrisTotal!).toBeGreaterThan(9);
    expect(samples.at(-1)!.debrisTotal!).toBeLessThan(samples[0]!.debrisTotal!);
  });

  it('minute summaries keep the end-of-minute debris total; samples without one stay without', () => {
    const h = createHistory(1);
    const s = (second: number, debris: number | null): HistorySample => ({
      second,
      count: [1],
      biomass: [1],
      births: [0],
      deaths: [0],
      oxygenMean: 1,
      nutrientTotal: 1,
      sugarTotal: 0,
      capacityLimited: false,
      interventions: 0,
      ...(debris === null ? {} : { debrisTotal: debris }),
    });
    for (let k = 1; k <= 1800 + SECONDS_PER_SUMMARY; k++) pushSample(h, s(k, k <= 30 ? null : k * 0.5));
    expect(h.minutes).toHaveLength(1);
    expect(h.minutes[0]!.debrisTotal).toBe(30);
    const h2 = createHistory(1);
    for (let k = 1; k <= 1800 + SECONDS_PER_SUMMARY; k++) pushSample(h2, s(k, null));
    expect('debrisTotal' in h2.minutes[0]!).toBe(false);
  });

  it('a schema 2 save loads through the import path (migrated by copy), continues identically, and has no debris for its older seconds', async () => {
    expect(SCHEMA_VERSION).toBe(3);
    const w = realizeRecipe(reg, 'CLEANING_CREW_V1', { worldId: 'old-dish', seed: 103 });
    run(w, 300);
    const { text } = await buildSaveFile(w, {
      name: 'Old dish',
      savedAt: '2026-09-28T00:00:00Z',
      recipeId: 'CLEANING_CREW_V1',
    });
    const old = await asSchema2(text);
    const oldState = (JSON.parse(old) as { state: WorldState }).state;
    const before = JSON.stringify(oldState);
    const migrated = migrateWorldState(oldState);
    expect(JSON.stringify(oldState)).toBe(before); // by copy: the input is untouched
    expect(migrated.schemaVersion).toBe(3);
    // The trait record states where it starts: the migrated world's time (tick 300 = 0:30).
    expect(migrated.history.traits).toEqual({ recent: [], minutes: [], compacted: false, since: 30 });
    expect(migrated.history.journal).toEqual([]);

    const { file, world } = await loadSaveFile(old);
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(world.schemaVersion).toBe(SCHEMA_VERSION);
    expect(stateHash(world)).toBe(stateHash(w));
    expect(world.history.seconds).toHaveLength(30);
    expect(world.history.seconds.every((x) => x.debrisTotal === undefined)).toBe(true);
    expect(world.history.traits.recent).toEqual([]);
    expect(world.history.journal).toEqual([]);
    run(w, 200);
    run(world, 200);
    expect(stateHash(world)).toBe(stateHash(w));
    // From the load on, the dish records debris again; the older seconds keep none (no line drawn for them).
    const after = world.history.seconds.filter((x) => x.second > 30);
    expect(after).toHaveLength(20);
    for (const x of after)
      expect(x.debrisTotal).toBeCloseTo(
        w.history.seconds.find((y) => y.second === x.second)!.debrisTotal!,
        12,
      );
    expect(world.history.traits.recent.map((x) => x.second)).toEqual([40, 50]);
    // And a current save of it round-trips at schema 3.
    const again = await buildSaveFile(world, {
      name: 'Old dish',
      savedAt: '2026-09-28T00:01:00Z',
      recipeId: 'CLEANING_CREW_V1',
    });
    const re = await loadSaveFile(again.text);
    expect(re.file.schemaVersion).toBe(3);
    expect(re.world.history.seconds).toEqual(world.history.seconds);
    expect(serializeWorld(re.world).history).toEqual(serializeWorld(world).history);
  });

  it('a real world-schema-2 save written by the build before P2.8 loads, migrates by copy and continues exactly as that build did (fix round 1)', async () => {
    // Fixture provenance: written by the commit-0ac0477 build (world schema 2, before P2.8) with
    // realizeRecipe(CLEANING_CREW_V1, seed 103, worldId "fixture-schema2"), 600 ticks, a DEBRIS deposit
    // (applyNow, 0.5 at 64,64 r2), 1,300 more ticks, then buildSaveFile; gzip level 9. That build
    // recorded state hash baa42a29186c6c46 at the save and 5ce059e49121f688 after 300 more ticks.
    const text = gunzipSync(readFileSync('tests/persistence/fixtures/schema2-cleaning-crew-t1900.pixelmeba.gz')).toString('utf8');
    const raw = JSON.parse(text) as { schemaVersion: number; state: WorldState & { history: Record<string, unknown> } };
    expect(raw.schemaVersion).toBe(2);
    expect(raw.state.schemaVersion).toBe(2);
    expect(raw.state.history.traits).toBeUndefined();
    expect(raw.state.history.journal).toBeUndefined();
    const oldSeconds: readonly HistorySample[] = raw.state.history.seconds;
    expect(oldSeconds).toHaveLength(190);
    expect(oldSeconds.some((x) => 'debrisTotal' in x)).toBe(false);
    const before = JSON.stringify(raw.state);

    const { file, world } = await loadSaveFile(text);
    expect(JSON.stringify(raw.state)).toBe(before); // migration by copy never alters the input
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(world.schemaVersion).toBe(SCHEMA_VERSION);
    expect(world.tick).toBe(1900);
    expect(stateHash(world)).toBe('baa42a29186c6c46');
    // Explicit defaults for what schema 3 added: nothing recorded, starting at the migrated moment.
    expect(world.history.traits).toEqual({ recent: [], minutes: [], compacted: false, since: 190 });
    expect(world.history.journal).toEqual([]);
    expect(world.history.seconds.every((x) => x.debrisTotal === undefined)).toBe(true);
    expect(interventionSeconds(world.history).length).toBeGreaterThan(0); // its recorded change is still marked

    run(world, 300);
    expect(stateHash(world)).toBe('5ce059e49121f688');
    // From the load on it records debris (every second) and trait samples (every 10 s), and says where they start.
    expect(world.history.seconds.filter((x) => x.debrisTotal !== undefined).map((x) => x.second)[0]).toBe(191);
    expect(world.history.traits.recent.map((x) => x.second)).toEqual([200, 210, 220]);
    expect(traitRecordNote(regionalTraitSeries(world.history, 0, 0))).toMatch(/^Trait samples start after 3:10: this dish was saved by an older version/);
    // A re-save is a new schema-3 record that loads to the same state.
    const again = await buildSaveFile(world, { name: 'Schema 2 cleaning crew', savedAt: '2026-09-28T12:05:00Z', recipeId: 'CLEANING_CREW_V1' });
    expect(JSON.parse(again.text).schemaVersion).toBe(3);
    const re = await loadSaveFile(again.text);
    expect(stateHash(re.world)).toBe(stateHash(world));
    expect(re.world.history.traits.since).toBe(190);
  });

  it('a file whose recorded history holds a malformed value is refused with a clear message (fix round 1)', async () => {
    const w = realizeRecipe(reg, 'CLEANING_CREW_V1', { worldId: 'bad-history', seed: 103 });
    run(w, 120);
    const { text } = await buildSaveFile(w, { name: 'x', savedAt: '2026-09-28T00:00:00Z', recipeId: 'CLEANING_CREW_V1' });
    const edited = async (edit: (h: Record<string, unknown> & { seconds: Record<string, unknown>[]; traits: { recent: { rows: unknown[] }[] } }) => void) => {
      const f = JSON.parse(text) as { state: { history: never }; checksum: string };
      edit(f.state.history);
      f.checksum = `sha256:${await sha256Hex(canonicalJson(f.state))}`;
      return JSON.stringify(f);
    };
    const cases: [string, (h: Record<string, unknown> & { seconds: Record<string, unknown>[]; traits: { recent: { rows: unknown[] }[] } }) => void][] = [
      ['debrisTotal', (h) => (h.seconds[3]!.debrisTotal = 'x')],
      ['oxygenMean', (h) => (h.seconds[0]!.oxygenMean = null)],
      ['count', (h) => (h.seconds[5]!.count = ['a'])],
      ['capacity', (h) => (h.seconds[1]!.capacityLimited = 'no')],
      ['trait sample 1', (h) => (h.traits.recent[0]!.rows = [[0, 'x', 1, 1]])],
      ['pendingBirths', (h) => (h.pendingBirths = 'x')],
    ];
    for (const [what, edit] of cases) {
      const bad = await edited(edit);
      await expect(loadSaveFile(bad), what).rejects.toMatchObject({ kind: 'integrity' });
      await expect(loadSaveFile(bad), what).rejects.toThrow(new RegExp(`recorded history cannot be read \\(.*${what}`));
    }
    // The unedited file loads.
    expect(stateHash((await loadSaveFile(text)).world)).toBe(stateHash(w));
  });
});

