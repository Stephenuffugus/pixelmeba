/**
 * Phase 3 determinism fence, part 1 (g3-plan line 126; D-0035 Option A): saves written by the g2 build
 * (tests/fixtures/saves/, tools/make-g2-saves.ts) load through the import path and continue
 * bit-identically. For each save: loadSaveFile → stateHash equals the g2 build's hashAtLoad; 1,000
 * ticks later stateHash equals hashPlus1000 and trajectoryDigest(world, 'g2') equals digestPlus1000
 * (so no Phase 3 state appears in a g2 world). Relational checks on top: a second, independent load
 * hashes the same, and buildSaveFile → loadSaveFile round-trips the continued world (hash and digest).
 * Only tools/fence-update.ts --g2 --reason D-00xx may re-record expected.json.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { SCHEMA_VERSION } from '../../src/sim/world';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { G2_SAVE_FILES, readExpected, readG2SaveText, REPLAY_TICKS } from '../helpers/g2-saves';
import { g2Manifest } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';

const expected = readExpected();
const meta = { name: 'g2 replay round trip', savedAt: '2026-10-01T00:00:00.000Z', recipeId: null };

describe('g2 saves continue bit-identically (Phase 3 fence, D-0035)', () => {
  it('expected.json has exactly one entry per g2 save, recorded over 1,000 ticks', () => {
    expect(Object.keys(expected.saves)).toEqual([...G2_SAVE_FILES]);
    expect(expected.replayTicks).toBe(REPLAY_TICKS);
    expect(REPLAY_TICKS).toBe(1000);
  });

  for (const file of G2_SAVE_FILES) {
    it(`${file}: hash at load, then +1,000 ticks hash and g2 digest equal the g2 build's`, { timeout: 300_000 }, async () => {
      const text = readG2SaveText(file);
      const exp = expected.saves[file]!;
      // Written by the g2 build: its manifest, at a world schema this build migrates by copy.
      const raw = JSON.parse(text) as { state: { schemaVersion: number; content: { manifest: { contentHash: string; buildPhase: number } } } };
      expect(raw.state.content.manifest.contentHash).toBe(g2Manifest().contentHash);
      expect(raw.state.content.manifest.buildPhase).toBe(2);
      expect(raw.state.schemaVersion).toBeLessThanOrEqual(SCHEMA_VERSION);

      const { world } = await loadSaveFile(text);
      expect(stateHash(world)).toBe(exp.hashAtLoad);
      // A second, independent load of the same text agrees.
      expect(stateHash((await loadSaveFile(text)).world)).toBe(exp.hashAtLoad);
      run(world, REPLAY_TICKS);
      expect(stateHash(world)).toBe(exp.hashPlus1000);
      expect(trajectoryDigest(world, 'g2')).toBe(exp.digestPlus1000);

      // The continued world round-trips through a save.
      const re = (await loadSaveFile((await buildSaveFile(world, meta)).text)).world;
      expect(stateHash(re)).toBe(exp.hashPlus1000);
      expect(trajectoryDigest(re, 'g2')).toBe(exp.digestPlus1000);
    });
  }
});
