/**
 * P4.5 gate evidence "variants-paired" (BUILD_DIRECTIVE P4.5; SPEC §13.3–§13.4; CT §9.4; D09 line 115):
 * each Garden idea (R-G1, R-G2, R-G3) run against the unchanged Garden (R-G0) for the fixed 180-s
 * horizon, headless, through the worker's own pair model (src/worker/variantPair.ts).
 *
 * - Both arms are realized from content at tick 0 and run exactly 1800 ticks each.
 * - A's final state hash equals an R-G0 dish run alone for 1800 ticks; B's equals the idea run alone
 *   (measuring is observation: the pair changes nothing in either world).
 * - Sequential mode ("sequentially if memory requires") gives results deep-equal to paired mode.
 * - The starting sugar differs exactly as the idea's patch says: R-G1 half the patch, R-G2 double,
 *   R-G3 the same total in another place.
 * - Stop ends both arms at the same tick in both modes, with equal results.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { poolTotal } from '../../src/sim/pairedRun';
import { stateHash } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import { realizeVariant, variantPreview } from '../../src/sim/variants';
import {
  prepareVariantPair,
  runVariantPair,
  VARIANT_PAIR_BASE,
  VARIANT_PAIR_TICKS,
  variantChangeStatement,
  variantPairRefusal,
  VariantPairRun,
} from '../../src/worker/variantPair';
import { registry } from '../helpers/world';

const REG: ContentRegistry = registry();
const IDEAS = ['R-G1', 'R-G2', 'R-G3'] as const;

/** A dish realized from a variant and run alone with the plain step (no observer, no pair). */
async function runAlone(variantId: string, ticks: number): Promise<string> {
  const w = await realizeVariant(REG, variantId, { worldId: `${variantId}-alone` });
  for (let t = 0; t < ticks; t++) step(w);
  expect(w.tick).toBe(ticks);
  return stateHash(w);
}

let gardenAlone = '';

beforeAll(async () => {
  gardenAlone = await runAlone(VARIANT_PAIR_BASE, VARIANT_PAIR_TICKS);
}, 600_000);

describe('P4.5 paired Garden variants: each idea against the unchanged Garden for 180 s', () => {
  it('the horizon is the existing 180-second comparison (1800 ticks)', () => {
    expect(VARIANT_PAIR_TICKS).toBe(1800);
  });

  for (const id of IDEAS) {
    it(
      `${id} vs ${VARIANT_PAIR_BASE}: equal ticks, each arm as run alone, sequential = paired`,
      async () => {
        const paired = await runVariantPair(REG, id, false);
        const seq = await runVariantPair(REG, id, true);
        const r = paired.run.results();
        // Both arms realized at tick 0 from content, and both advanced exactly 1800 ticks.
        expect(r.baselineTick).toBe(0);
        expect(r.ticks).toBe(VARIANT_PAIR_TICKS);
        expect(r.a.tick).toBe(VARIANT_PAIR_TICKS);
        expect(r.b.tick).toBe(VARIANT_PAIR_TICKS);
        expect(r.stoppedEarly).toBe(false);
        expect(r.interventions).toEqual([]);
        expect(r.label).toBe('this paired run');
        // A is the Garden run alone; B is the idea run alone.
        expect(r.a.hash).toBe(gardenAlone);
        expect(r.b.hash).toBe(await runAlone(id, VARIANT_PAIR_TICKS));
        expect(r.a.hash).not.toBe(r.b.hash);
        // Sequential mode composes exactly the same results (and the same sugar left).
        expect(seq.run.results()).toEqual(r);
        expect(seq.run.sugarEnd()).toEqual(paired.run.sugarEnd());
        expect(paired.run.sugarEnd().a).toBeCloseTo(poolTotal(paired.run.a!, 'sugar'), 12);
        expect(seq.run.a).toBeNull(); // sequential let A's world go before B ran
        // No command reached either arm.
        expect(paired.run.a!.commands.log).toEqual([]);
        expect(paired.run.b!.commands.log).toEqual([]);
        expect(seq.run.b!.commands.log).toEqual([]);
      },
      600_000,
    );
  }

  it('the starting sugar differs exactly as each idea’s patch says', async () => {
    const out: Record<string, { a: number; b: number; cells: number; before: number; after: number }> = {};
    for (const id of IDEAS) {
      const p = await prepareVariantPair(REG, id, { dish: `${id}-d`, a: `${id}-a`, b: `${id}-b` });
      const change = variantPreview(REG, id).change;
      const cells = change.kind === 'amount' ? change.cells.length : change.kind === 'moved' ? change.newCells.length : 0;
      const before = change.kind === 'amount' ? change.before : 0.4;
      const after = change.kind === 'amount' ? change.after : 0.4;
      out[id] = { a: p.facts.sugarStart.a, b: p.facts.sugarStart.b, cells, before, after };
      // The starts recorded for A and B are the worlds measured.
      expect(p.startA.tick).toBe(0);
      expect(p.startB.tick).toBe(0);
    }
    const g1 = out['R-G1']!;
    const g2 = out['R-G2']!;
    const g3 = out['R-G3']!;
    expect(g1.cells).toBeGreaterThan(100);
    // The Garden's own patch sugar = A − background; the idea's = B − background.
    const background = g1.a - g1.before * g1.cells;
    expect(background).toBeGreaterThanOrEqual(-1e-9); // none in the Garden (float roundoff only)
    // R-G1: the patch holds half (0.40 → 0.20 C per cell).
    expect(g1.after / g1.before).toBe(0.5);
    expect(g1.b - background).toBeCloseTo((g1.a - background) / 2, 6);
    // R-G2: double (0.40 → 0.80).
    expect(g2.after / g2.before).toBe(2);
    expect(g2.b - background).toBeCloseTo((g2.a - background) * 2, 6);
    // R-G3: the same total, in another place (equal cell counts).
    expect(g3.cells).toBe(g1.cells);
    expect(g3.b).toBeCloseTo(g3.a, 6);
    // The same Garden A each time.
    expect(g2.a).toBe(g1.a);
    expect(g3.a).toBe(g1.a);
  });

  it('the plain statements of the changed input (D09 line 115)', () => {
    expect(variantChangeStatement(variantPreview(REG, 'R-G1').change)).toBe("B's sugar patch held 0.20 C per cell instead of 0.40.");
    expect(variantChangeStatement(variantPreview(REG, 'R-G2').change)).toBe("B's sugar patch held 0.80 C per cell instead of 0.40.");
    expect(variantChangeStatement(variantPreview(REG, 'R-G3').change)).toBe("B's sugar patch was moved from (48, 64) to (48, 82).");
  });

  it('only the Garden’s ideas can be compared with it; R-G0 and unknown ids are refused', () => {
    expect(variantPairRefusal(REG, 'R-G1')).toBeNull();
    expect(variantPairRefusal(REG, 'R-G0')).toMatch(/compared with/);
    expect(variantPairRefusal(REG, 'R-G9')).toMatch(/no What if\? idea "R-G9"/);
  });

  it('Stop ends both arms at the same tick; sequential and paired stop give equal results', async () => {
    const p = await prepareVariantPair(REG, 'R-G3', { dish: 'd', a: 'a', b: 'b' });
    const paired = new VariantPairRun(p.startA, p.startB, false);
    const seq = new VariantPairRun(p.startA, p.startB, true);
    for (let k = 0; k < 75; k++) paired.step();
    for (let k = 0; k < 75; k++) seq.step();
    expect(paired.stop()).toBe('done');
    expect(seq.stop()).toBe('aDone'); // A ends here; B still runs exactly 75 ticks
    expect(seq.done).toBe(false);
    expect(seq.targetTicks).toBe(75);
    let guard = 0;
    while (!seq.done && guard++ < 1000) seq.step();
    expect(seq.done).toBe(true);
    const r = paired.results();
    expect(r.ticks).toBe(75);
    expect(r.stoppedEarly).toBe(true);
    expect(r.a.tick).toBe(75);
    expect(r.b.tick).toBe(75);
    expect(seq.results()).toEqual(r);
  }, 120_000);

  it('sequential B cannot be stopped early (the two dishes would get unequal time)', async () => {
    const p = await prepareVariantPair(REG, 'R-G1', { dish: 'd', a: 'a', b: 'b' });
    const seq = new VariantPairRun(p.startA, p.startB, true);
    for (let k = 0; k < 5; k++) seq.step();
    expect(seq.stop()).toBe('aDone');
    seq.step(); // B starts
    expect(seq.phase).toBe('B');
    expect(() => seq.stop()).toThrow(/same time/);
  }, 60_000);
});
