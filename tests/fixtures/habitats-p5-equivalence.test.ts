/**
 * Wave 14 habitat geometry, step 0 equivalence (P5.4; D-0102, D-0103, D-0128): nothing in this wave changes
 * how an existing dish realizes or plays. tests/fixtures/habitats-p5/realize-golden.json was written by the
 * UNMODIFIED HEAD code (its "how" says exactly what it holds): for every shipped recipe, the three v1.0 New
 * Dish starts (Empty, Empty Gel Colony, Empty Sediment Edge) and every What if? variant, the sha256 of the
 * serialized world at tick 0 and the stateHash after 300 ticks, both with the contentHash blanked (the
 * eight habitat files move it; nothing else may move). The new code reproduces every entry exactly.
 * Mutant checked by hand: withHabitatOverride dropping the lid for the recipe's own habitat too, or
 * recipeStructures numbering furnished areas before a habitat's explicit devices, fails this file or
 * tests/fixtures/habitats-p5.test.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { realizeGoldenEntries, REALIZE_GOLDEN_HOW, type RealizeGoldenEntry } from '../helpers/habitats';
import { registry } from '../helpers/world';

const golden = JSON.parse(readFileSync(join(__dirname, 'habitats-p5', 'realize-golden.json'), 'utf8')) as { how: string; entries: RealizeGoldenEntry[] };

describe('habitat geometry leaves every shipped dish byte-identical (step 0 golden)', () => {
  it('the golden says how it was made, and covers recipes, the v1.0 starts and the variants', () => {
    expect(golden.how).toBe(REALIZE_GOLDEN_HOW);
    const keys = golden.entries.map((e) => e.key);
    expect(keys).toContain('recipe:FIRST_DISH_V1');
    expect(keys).toContain('newDish:empty:GEL_COLONY');
    expect(keys).toContain('newDish:empty:SEDIMENT_EDGE');
    expect(keys.some((k) => k.startsWith('variant:'))).toBe(true);
  });

  it('every entry realizes and runs 300 ticks exactly as before', async () => {
    const now = await realizeGoldenEntries(registry());
    expect(now.map((e) => e.key)).toEqual(golden.entries.map((e) => e.key));
    for (const [k, e] of now.entries()) expect(e, e.key).toEqual(golden.entries[k]);
  }, 300_000);
});
