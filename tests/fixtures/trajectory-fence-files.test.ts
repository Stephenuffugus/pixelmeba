/**
 * The fence's test-only recipe files (kind 'recipeFile'; D-0121, the systems flip): FENCE_CYCLE_HEATER
 * (FIRST_DISH_V1 under the light cycle with a heater placed and switched on by command at tick 0) and
 * FENCE_BARRIER_LINE (an S01 line with S02 gates, a closed S03 shutter, an S04 channel and an S08 resin,
 * placed by command at tick 0). No shipped recipe uses the cycle, edges or devices, so these entries are
 * what fences them. tests/fixtures/trajectory-fence-current.test.ts digests each at 1× (one run); this file
 * proves the same digest at the 4× analogue (four steps per chunk, observed between chunks) and across a
 * save → load through the import at the midpoint, and that the structures and the cycle are really there.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { stateHash } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { CONTENT_DIR, loadRegistryFs, REPO_ROOT } from '../../tools/lib/content-fs';
import { fenceStart, readFence, readFenceRecipe, type FenceEntry } from '../helpers/fence';
import { trajectoryDigest } from '../helpers/trajectory';

const shipped = loadRegistryFs();
const files = readFence().entries.filter((e): e is FenceEntry & { kind: 'recipeFile' } => e.kind === 'recipeFile');
const meta = { name: 'fence', savedAt: '2026-10-14T00:00:00Z', recipeId: null };

describe('trajectory fence: test-only recipe files (D-0121)', () => {
  it('the two flip entries exist, each file is under tests/fixtures/fence-recipes, its id is the entry id and no content recipe has it', () => {
    expect(files.map((e) => e.id)).toEqual(['FENCE_CYCLE_HEATER', 'FENCE_BARRIER_LINE']);
    const onDisk = readdirSync(join(REPO_ROOT, 'tests', 'fixtures', 'fence-recipes')).sort();
    expect(onDisk).toEqual(['FENCE_BARRIER_LINE.json', 'FENCE_CYCLE_HEATER.json']);
    const content = readdirSync(join(CONTENT_DIR, 'recipes')).map((f) => f.replace('.json', ''));
    for (const e of files) {
      expect(e.file).toBe(`tests/fixtures/fence-recipes/${e.id}.json`);
      expect(readFenceRecipe(e.file, shipped).id).toBe(e.id);
      expect(content).not.toContain(e.id);
      expect(e.g2Digest).toBeNull();
    }
  });

  it('the cycle dish runs the light cycle with a heater on; the barrier dish has its line, gates, shutter, channel and resin', () => {
    const cycle = fenceStart(shipped, files[0]!);
    step(cycle);
    expect(cycle.settings.lightMode).toBe('cycle');
    expect(cycle.devices).toEqual([expect.objectContaining({ kind: 'S09', on: true })]);
    const barrier = fenceStart(shipped, files[1]!);
    step(barrier);
    const kinds: Record<string, number> = {};
    for (const e of barrier.edges) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    expect(kinds).toEqual({ S01: 42, S02: 5, S03: 1, S04: 1 });
    expect(barrier.edges.find((e) => e.kind === 'S03')!.open).toBe(false);
    expect(barrier.edges.find((e) => e.kind === 'S04')!.flow).toBe(1);
    expect(barrier.devices).toEqual([expect.objectContaining({ kind: 'S08', resinSelect: ['inhBact'] })]);
  });

  for (const e of files) {
    it(`${e.id}: the 4× analogue with a save → load near the midpoint digests to the recorded currentDigest`, { timeout: 300_000 }, async () => {
      let w: World = fenceStart(shipped, e);
      let saved = false;
      while (w.tick < e.ticks) {
        for (let k = 0; k < 4 && w.tick < e.ticks; k++) step(w);
        stateHash(w); // observing must not perturb
        if (!saved && w.tick >= e.ticks / 2) {
          saved = true;
          const before = stateHash(w);
          const { text } = await buildSaveFile(w, meta);
          w = (await loadSaveFile(text)).world;
          expect(stateHash(w)).toBe(before);
        }
      }
      expect(w.tick).toBe(e.ticks);
      expect(trajectoryDigest(w, 'full')).toBe(e.currentDigest);
    });
  }
});
