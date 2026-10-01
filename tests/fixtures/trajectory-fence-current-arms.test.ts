/**
 * Phase 3 determinism fence, check (b), What if? variants and experiment arms (g3-plan lines 128–131;
 * g3-plan-recheck P-22): each variant and arm entry, realized under the SHIPPED manifest, digests in
 * 'full' mode to its recorded currentDigest. The recipe entries and the every-recipe check are
 * tests/fixtures/trajectory-fence-current.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { loadRegistryFs } from '../../tools/lib/content-fs';
import { describeEntry, fenceGroup, fenceWorld, readFence } from '../helpers/fence';
import { trajectoryDigest } from '../helpers/trajectory';

const shipped = loadRegistryFs();

describe('trajectory fence (b): every entry under the shipped manifest (variants and arms)', () => {
  for (const e of fenceGroup(readFence().entries, 'arms')) {
    it(`${e.id}: ${describeEntry(e)} digests to its currentDigest`, { timeout: 300_000 }, async () => {
      const w = await fenceWorld(shipped, e);
      expect(w.tick).toBe(e.ticks);
      expect(trajectoryDigest(w, 'full')).toBe(e.currentDigest);
    });
  }
});
