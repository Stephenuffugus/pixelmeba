/**
 * Phase 3 determinism fence, check (b), recipe entries (g3-plan lines 128–131; g3-plan-recheck P-17,
 * P-22): every fence entry, realized under the SHIPPED manifest, digests in 'full' mode to its recorded
 * currentDigest, and every recipe in content/recipes has an entry. A change that moves a currentDigest
 * is a biology change: only the lead re-records it, under a DECISIONS id
 * (tools/fence-update.ts --recipe <id>|--all --reason D-00xx); builders run
 * `npx tsx tools/fence-update.ts --add <recipe>` for recipes they create. The variant and arm entries
 * are tests/fixtures/trajectory-fence-current-arms.test.ts; check (a), the permanent g2 check, is
 * tests/fixtures/trajectory-fence{,-arms}.test.ts.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTENT_DIR, loadRegistryFs } from '../../tools/lib/content-fs';
import { describeEntry, fenceGroup, fenceWorld, readFence } from '../helpers/fence';
import { trajectoryDigest } from '../helpers/trajectory';

const fence = readFence();
const shipped = loadRegistryFs();

describe('trajectory fence (b): every entry under the shipped manifest (recipes)', () => {
  it('every recipe in content/recipes has a plain entry; ids are unique; every entry has a current digest', () => {
    const recipes = readdirSync(join(CONTENT_DIR, 'recipes'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -'.json'.length))
      .sort();
    expect(recipes.length).toBeGreaterThanOrEqual(7);
    for (const id of recipes) expect(fence.entries.some((e) => e.kind === 'recipe' && e.recipe === id && e.transform === undefined), `fence entry for ${id}`).toBe(true);
    const ids = fence.entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of fence.entries) expect(e.currentDigest, e.id).toMatch(/^[0-9a-f]{16}$/);
  });

  for (const e of fenceGroup(fence.entries, 'recipes')) {
    it(`${e.id}: ${describeEntry(e)} digests to its currentDigest`, { timeout: 300_000 }, async () => {
      const w = await fenceWorld(shipped, e);
      expect(w.tick).toBe(e.ticks);
      expect(trajectoryDigest(w, 'full')).toBe(e.currentDigest);
    });
  }
});
