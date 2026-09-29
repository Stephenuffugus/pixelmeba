/**
 * "Export without names or notes" (D-0029): a player's branch names leave neither in the branch records,
 * nor in a saved specimen's label, nor in the command log; the stripped dish runs on exactly like the
 * original (names are labels the simulation never reads).
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { generatedBranchName } from '../../src/sim/branches';
import { applyNow } from '../../src/sim/commands';
import { realizeRecipe } from '../../src/sim/recipes';
import { serializeWorld } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { registry } from '../helpers/world';

describe('stripped export', () => {
  it('carries no player branch name and the dish runs on identically', async () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1', { seed: 101, worldId: 'strip', transform: (r) => ({ ...r, mutationPreset: 'accelerated' }) });
    run(w, 1500);
    expect(w.branches.established).toBeGreaterThanOrEqual(1);
    applyNow(w, 'rename', { kind: 'lineage', op: 'rename', branch: 0, name: 'Quiet savers' });
    applyNow(w, 'keep', { kind: 'lineage', op: 'saveSpecimen', from: 'branch', id: 0 });
    expect(w.branches.branches[0]!.name).toBe('Quiet savers');
    expect(w.branches.specimens![0]!.branchLabel).toContain('Quiet savers');

    const full = await buildSaveFile(w, { name: 'My dish', savedAt: '2026-09-29T00:00:00Z', recipeId: 'FIRST_DISH_V1' });
    expect(full.text).toContain('Quiet savers');
    const stripped = await buildSaveFile(w, { name: 'My dish', savedAt: '2026-09-29T00:00:00Z', recipeId: 'FIRST_DISH_V1' }, { stripNames: true });
    expect(stripped.text).not.toContain('Quiet savers');
    expect(stripped.text).not.toContain('My dish');

    const { world } = await loadSaveFile(stripped.text);
    expect(world.branches.branches[0]!.name).toBeNull();
    expect(world.branches.specimens![0]!.branchLabel).toBe(generatedBranchName(w, w.branches.branches[0]!));
    // The rename is still in the log (a record that one happened), without its text.
    expect(world.commands.log.some((c) => c.payload.kind === 'lineage' && c.payload.op === 'rename' && c.payload.name === null)).toBe(true);
    // The original is untouched, and both dishes run on identically (entities, fields, genomes).
    expect(w.branches.branches[0]!.name).toBe('Quiet savers');
    run(w, 300);
    run(world, 300);
    const a = serializeWorld(w);
    const b = serializeWorld(world);
    expect(b.entities).toEqual(a.entities);
    expect(b.fields).toEqual(a.fields);
    expect(b.genomes).toEqual(a.genomes);
  });
});
