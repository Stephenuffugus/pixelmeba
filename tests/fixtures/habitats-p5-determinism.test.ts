/**
 * Determinism of the eight Phase 5 habitats (P5.4; CLAUDE.md "Determinism"; D-0128). For each Empty start
 * (habitatStart under habitatRegistry()): one run of 400 ticks equals four runs of 100; a save at tick 200
 * (buildSaveFile -> loadSaveFile) continued to 400 equals the uninterrupted run; and the 4× analogue (steps
 * in chunks of four with stateHash observed between chunks, as tests/fixtures/trajectory-fence-files does)
 * equals the 1× run at tick 400. Compared relationally: no hash literal.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { stateHash } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import { HABITAT_IDS, habitatRegistry, habitatStart } from '../helpers/habitats';

const reg = habitatRegistry();

describe('Phase 5 habitats are deterministic', () => {
  it.each(HABITAT_IDS)('%s: 1x, chunks, save/reload and 4x agree at tick 400', async (id) => {
    const once = habitatStart(reg, id);
    run(once, 400);
    const ref = stateHash(once);

    const chunks = habitatStart(reg, id);
    for (let k = 0; k < 4; k++) run(chunks, 100);
    expect(stateHash(chunks)).toBe(ref);

    const saved = habitatStart(reg, id);
    run(saved, 200);
    const built = await buildSaveFile(saved, { name: id, savedAt: '2026-10-15T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' });
    const loaded = (await loadSaveFile(built.text)).world;
    expect(stateHash(loaded)).toBe(stateHash(saved));
    run(loaded, 200);
    expect(stateHash(loaded)).toBe(ref);

    const fast = habitatStart(reg, id);
    const seen: string[] = [];
    while (fast.tick < 400) {
      for (let k = 0; k < 4 && fast.tick < 400; k++) step(fast);
      seen.push(stateHash(fast));
    }
    expect(seen.length).toBe(100);
    expect(seen[seen.length - 1]).toBe(ref);
  }, 300_000);
});
