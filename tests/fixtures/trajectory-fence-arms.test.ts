/**
 * Phase 3 determinism fence, check (a), What if? variants and experiment arms (g3-plan lines 128–131;
 * g3-plan-recheck P-22): R-G1…R-G3 and arm B of EXP_102 (whole-dish shade), EXP_106 and EXP_B (the only
 * g2 sources of Amoeba predation), realized under registryWith(G2_LISTS), digest in 'g2' mode to the
 * g2Digest recorded at g2. The recipe entries and the coverage check are
 * tests/fixtures/trajectory-fence.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { describeEntry, fenceGroup, fenceWorld, readFence } from '../helpers/fence';
import { G2_LISTS, registryWith } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';

const G2 = registryWith(G2_LISTS);
const entries = fenceGroup(
  readFence().entries.filter((e) => e.g2Digest !== null),
  'arms',
);

describe('trajectory fence (a): Phase 2 content under the g2 lists runs as at g2 (variants and arms)', () => {
  it('has the six g2 variant and arm entries', () => {
    expect(entries.map((e) => e.id)).toEqual(['R-G1', 'R-G2', 'R-G3', 'EXP_102:B', 'EXP_106:B', 'EXP_B:B']);
  });

  for (const e of entries) {
    it(`${e.id}: ${describeEntry(e)} digests to its g2Digest`, { timeout: 300_000 }, async () => {
      const w = await fenceWorld(G2, e);
      expect(w.tick).toBe(e.ticks);
      expect(trajectoryDigest(w, 'g2')).toBe(e.g2Digest);
    });
  }
});
