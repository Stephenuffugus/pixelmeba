/**
 * Phase 3 determinism fence, check (a), recipe entries (g3-plan lines 128–131; g3-plan-recheck P-17,
 * P-22): Phase 2 content, realized under registryWith(G2_LISTS) (the g2 manifest: its lists,
 * buildPhase 2 and contentVersion 1), still runs exactly as the g2 build ran it. Each fence entry's
 * world digests in 'g2' mode (which also refuses any post-g2 state) to the g2Digest recorded at g2.
 * Permanent: it proves no later rule leaks into Phase 2 content. The variant and experiment-arm
 * entries are tests/fixtures/trajectory-fence-arms.test.ts; check (b), the shipped manifest, is
 * tests/fixtures/trajectory-fence-current*.test.ts. Only tools/fence-update.ts --g2 --reason D-00xx
 * re-records a g2Digest.
 */
import { describe, expect, it } from 'vitest';
import { describeEntry, fenceGroup, fenceWorld, readFence } from '../helpers/fence';
import { G2_LISTS, registryWith } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';

const fence = readFence();
const G2 = registryWith(G2_LISTS);
const g2Entries = fence.entries.filter((e) => e.g2Digest !== null);

/** The fence entries recorded at g2 (P-22). Entries are never removed. */
const G2_ENTRY_IDS = [
  'CLEANING_CREW_V1',
  'FIRST_DISH_V1',
  'FOOD_TRAIL_V1',
  'LIGHT_AND_LIFE_V1',
  'PREDATOR_BALANCE_V1',
  'RESERVE_COMPARE_V1',
  'STARCH_UNLOCK_V1',
  'STARCH_UNLOCK_V1+E01',
  'R-G1',
  'R-G2',
  'R-G3',
  'EXP_102:B',
  'EXP_106:B',
  'EXP_B:B',
];

describe('trajectory fence (a): Phase 2 content under the g2 lists runs as at g2 (recipes)', () => {
  it('covers the seven g2 recipes, R-G1…R-G3, arm B of EXP_102, EXP_106 and EXP_B, and the E01-carrier transform', () => {
    expect(g2Entries.map((e) => e.id)).toEqual(G2_ENTRY_IDS);
    for (const e of g2Entries) expect(e.g2Digest, e.id).toMatch(/^[0-9a-f]{16}$/);
    // Every recipe the g2 build shipped has a plain entry.
    const shippedAtG2 = G2.recipeIds.filter((id) => G2.recipes[id]!.phase <= G2.manifest.buildPhase);
    expect(shippedAtG2).toHaveLength(7);
    for (const id of shippedAtG2) expect(g2Entries.some((e) => e.kind === 'recipe' && e.recipe === id && e.transform === undefined), id).toBe(true);
    // Ticks (P-22): ≥ 1,200 for FIRST_DISH_V1, and ≥ 600 after an arm's Amoebae (P01) arrive.
    expect(g2Entries.find((e) => e.id === 'FIRST_DISH_V1')!.ticks).toBeGreaterThanOrEqual(1200);
    for (const e of g2Entries) {
      if (e.kind !== 'experimentArm') continue;
      const ch = G2.experiments[e.experiment]!.change;
      const p01 = ch.kind === 'commands' && ch.commands.some((c) => c.kind === 'inoculate' && c.speciesId === 'P01');
      if (p01) expect(e.ticks, e.id).toBeGreaterThanOrEqual(Math.round(ch.atSecond * 10) + 600);
    }
  });

  for (const e of fenceGroup(g2Entries, 'recipes')) {
    it(`${e.id}: ${describeEntry(e)} digests to its g2Digest`, { timeout: 300_000 }, async () => {
      const w = await fenceWorld(G2, e);
      expect(w.tick).toBe(e.ticks);
      expect(trajectoryDigest(w, 'g2')).toBe(e.g2Digest);
    });
  }
});
