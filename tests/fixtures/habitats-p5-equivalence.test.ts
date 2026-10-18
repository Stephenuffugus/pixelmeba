/**
 * Wave 14 habitat geometry, step 0 equivalence (P5.4; D-0102, D-0103, D-0128): nothing in this wave changes
 * how an existing dish realizes or plays. tests/fixtures/habitats-p5/realize-golden.json was written by the
 * UNMODIFIED HEAD code (its "how" says exactly what it holds): for every shipped recipe, the three v1.0 New
 * Dish starts (Empty, Empty Gel Colony, Empty Sediment Edge) and every What if? variant, the sha256 of the
 * serialized world at tick 0 and the stateHash after 300 ticks, both with the contentHash blanked (the
 * eight habitat files move it; nothing else may move). The new code reproduces every entry exactly. Since
 * THE HABITAT ENABLE (D-0130) a new world records the eleven shipped habitats, so the first comparison
 * writes the golden's recorded list (the v1.0 three) into each world; the second runs the worlds as
 * shipped and proves the list is the only difference (stateHash300 unchanged, the serialized world not).
 * Mutant checked by hand: withHabitatOverride dropping the lid for the recipe's own habitat too, or
 * recipeStructures numbering furnished areas before a habitat's explicit devices, fails this file or
 * tests/fixtures/habitats-p5.test.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HABITAT_IDS, realizeGoldenEntries, REALIZE_GOLDEN_HOW, type RealizeGoldenEntry } from '../helpers/habitats';
import { registry } from '../helpers/world';

const golden = JSON.parse(readFileSync(join(__dirname, 'habitats-p5', 'realize-golden.json'), 'utf8')) as { how: string; entries: RealizeGoldenEntry[] };
/** The habitat list every golden world recorded: the shipped list at 1c9d8a2, before THE HABITAT ENABLE (D-0130). */
const GOLDEN_HABITATS = ['GEL_COLONY', 'SEDIMENT_EDGE', 'WATER_GARDEN'];

describe('habitat geometry leaves every shipped dish byte-identical (step 0 golden)', () => {
  it('the golden says how it was made, and covers recipes, the v1.0 starts and the variants', () => {
    expect(golden.how).toBe(REALIZE_GOLDEN_HOW);
    const keys = golden.entries.map((e) => e.key);
    expect(keys).toContain('recipe:FIRST_DISH_V1');
    expect(keys).toContain('newDish:empty:GEL_COLONY');
    expect(keys).toContain('newDish:empty:SEDIMENT_EDGE');
    expect(keys.some((k) => k.startsWith('variant:'))).toBe(true);
  });

  it('every entry realizes and runs 300 ticks exactly as before (with the habitat list the golden recorded)', async () => {
    const now = await realizeGoldenEntries(registry(), { recordedHabitats: GOLDEN_HABITATS });
    expect(now.map((e) => e.key)).toEqual(golden.entries.map((e) => e.key));
    for (const [k, e] of now.entries()) expect(e, e.key).toEqual(golden.entries[k]);
  }, 300_000);

  it('since THE HABITAT ENABLE (D-0130) a new world records the eleven habitats, and that is all: the run as shipped is the same', async () => {
    expect(registry().manifest.enabledHabitats).toEqual([...GOLDEN_HABITATS, ...HABITAT_IDS].sort());
    const now = await realizeGoldenEntries(registry());
    expect(now.map((e) => e.key)).toEqual(golden.entries.map((e) => e.key));
    for (const [k, e] of now.entries()) {
      expect(e.stateHash300, e.key).toBe(golden.entries[k]!.stateHash300);
      expect(e.serialized, e.key).not.toBe(golden.entries[k]!.serialized);
    }
  }, 300_000);
});
