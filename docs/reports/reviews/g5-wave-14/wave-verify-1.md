# Wave 14 verify 1 (rules lens): habitat-geometry and habitat-communities

Verdict: **ok**. I found no BLOCKER and no MAJOR problem. Both assignments hold against their Build and "Done when" lists. There are three MINOR findings: two test gaps and one latent override rule. There are also three NITs. The verifier edited no tracked file; its scratch is in `tmp/verify-g5-wave-14-0/`.

## Problems (most severe first)

- MINOR [habitat-communities] src/sim/recipes.ts:229 (applyRecipeOverrides): `empty` and `withHabitatOverride` keep the recipe's own `community: true`.
  - With an authored recipe that has `community: true`, an Empty start still places the Suggested Community, and a start on another habitat places that habitat's community or throws. Nothing in the recorded choices says so. CT §8.2: "previewed and recorded; never silently". D02 292: "Never inoculate incompatible life silently".
  - Latent only: no shipped recipe has `community` yet, but the validator accepts `community: true` on recipes, and wave 15 may author one.
  - Repro: `npx tsx tmp/verify-g5-wave-14-0/probe.ts` prints `empty keeps community? true habitat switch keeps? true` for FIRST_DISH_V1 on H05 with `community: true` under `{ empty: true }` and under `{ empty: true, habitatId: 'H06_DUSK_MARSH' }`.
  - Fix: `o.empty` (and a habitat change in `withHabitatOverride`) should drop `community` unless `o.community === true`. Shipped dishes stay byte-identical, because none records it.
- MINOR [habitat-geometry] src/sim/recipes.ts:497 (recipeStructures): nothing tests the specified id order "habitat furnish areas BEFORE recipe edges and recipe devices".
  - Load-time mutant in a scratch copy: I moved `furnishOf` after the recipe's edges and devices.
  - All of these still passed (114 tests): habitats-p5, content/habitats-p5, habitats-p5-community, new-dish-habitats, content/recipe-structures and content/structures-p5.
  - No shipped recipe places structures on a furnished habitat, so the golden cannot see it either. Ids are saved state, so this order becomes save-relevant as soon as wave 15 authors such a recipe.
  - Fix: add one test with a test recipe that places an edge or a device on H04 or H09 and pins the id order.
- MINOR [habitat-communities] src/sim/recipes.ts:698 (placeCommunity): nothing tests the realize-level offer check against the world's recorded manifest (the builder's PROPOSED DECISION 4).
  - Mutant: I replaced the throw with `void offer`.
  - All of these still passed (67 tests): habitats-p5-community, new-dish-habitats, recipe-file-community and content/habitats-p5.
  - Today build() (registry manifest) and recipeFileProblem (communityOffered) guard the same thing, so this is defense in depth with no test behind it.
  - Fix: add a test that realizes a community start under a registry missing one group's species or system and expects a CommunityError.
- NIT [habitat-communities] tests/content/habitats-p5.test.ts: this stage changed two assertions in stage 1's file, which is outside its ownership list.
  - The builder disclosed it, and both assertions pinned the "no community yet" state that stage 2 changes by design.
  - The lead should note the ownership deviation.
- NIT [habitat-communities] src/sim/recipes.ts:724-727: a group naming a virus species (introduceOrganism throws a plain Error) or a fungus at the fungal cap (returns -1, reported as "agent capacity exceeded") gets a crash or a misleading message.
  - In `tools/content-validate.ts communityRealizationIssues`, a non-RecipeError is rethrown, so the CLI crashes instead of reporting.
  - No shipped community names a virus.
  - Fix: a shape check in habitatShapeProblems refusing virus-category group species.
- NIT [habitat-geometry] content/habitats/H07_GLASS_GARDEN.json guide.summary: "two strips of mesh down the middle of the dish" is loose. The strips are at x 40 and x 88, 24 cells either side of the centre. The rules text states the exact cells, so the claim is not false, only loose.

## Verified OK

- VERIFIED OK — step 0 golden is genuinely the HEAD code's output:
  - Extracted with `git archive HEAD` into scratch.
  - Recomputed independently with the HEAD sources, unmodified: 25 entries, `equal true` against `tests/fixtures/habitats-p5/realize-golden.json`.
  - `git diff 1c9d8a2 HEAD` touches only `src/ui` (2 files), so the stated base 1c9d8a2 is equivalent.
- VERIFIED OK — FENCE unchanged:
  - Command: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts tests/fixtures/habitats-p5-equivalence.test.ts`.
  - Result: Test Files 11 passed (11), Tests 79 passed (79), 1049 s. This includes the equivalence golden under the final code, after both stages.
- VERIFIED OK — the builders' new tests pass:
  - habitats-p5, content/habitats-p5, habitats-p5-community, new-dish-habitats, recipe-file-community and habitats-p5-determinism: 6 files, 108 tests passed.
  - habitats-p5-conservation, habitats-p5-community-determinism, habitats-p5-community-conservation and habitats-p5-fence-drafts: 4 files, 19 tests passed (488 s).
- VERIFIED OK — the "Done when" named tests pass (37 files, 857 tests):
  - tests/content (all), tests/recipes, and tests/worker/{whatif, host, new-dish-preview-grid, new-dish-environment, protocol3, protocol3-v1-equivalence};
  - tests/persistence/{share, phase5-import}, tests/sim/recipe-overrides-env and tests/ui/new-dish-environment;
  - tests/fixtures/{finite-feeding, food-objects, registry-imports, habitat-presets};
  - tests/helpers/registry, tests/tools/listing and tests/sim/rng-hash.
- VERIFIED OK — tsc and eslint:
  - `npx tsc -p tsconfig.json --noEmit` exits 0.
  - eslint exits 0 on every changed or new source and test file of both tasks.
- VERIFIED OK — content validation and hashes:
  - `npm run content:validate` (no --write) reports `content ok · contentHash af7e8117… · habitats 11 · suggested communities 8 realized`.
  - Recomputed: HEAD 2640a5f4… → stage 1 (suggestedCommunity stripped) d2da5239… → now af7e8117…. These match both reports, and they prove stage 2 changed only `suggestedCommunity` in the eight records (the guide text is unchanged).
  - content/manifest.json changes only its contentHash; enabledHabitats is still the three.
- VERIFIED OK — every v1.0 New Dish preview is unchanged:
  - 40 previews, under the shipped registry, produced by the HEAD host and by the working-tree host and serialized as JSON, are byte-equal.
  - Starts compared: FIRST_DISH_V1 with {}, Empty, Gel, Sediment, Environment overrides and evolution overrides, plus every shipped recipe both plain and Empty.
  - So the switch to `recipeGrid(…, transformed)` and the new optional keys move nothing for a v1.0 start.
- VERIFIED OK — D-table records: all eight records match STATE's D-table and CT §8.2. Checked: geometry, fields, environment, furnish, devices, edges, objects, regions and communities (H10's starch patch exact).
- VERIFIED OK — guide text:
  - No species names.
  - The numbers match the records.
  - S01 behaviour matches content/structures/S01.json.
  - H04's "about 500 seconds" matches CT M11 (6 / 0.012). The conservation test empties both wafers between ticks 4,500 and 5,500.
  - H09's moisture claim matches climate.ts (water 1, gel 0.8).
- VERIFIED OK — objects are logged inputs:
  - Mutant: `recordInput` removed from placeHabitatObject.
  - Both H04 conservation tests fail (relErr 0.0034 > 1e-5), stage 1's and stage 2's. The builder had not run this one.
- VERIFIED OK — determinism and stream rules:
  - Placement uses only `STREAMS.communityPlace`, keyed by the group index. introduceOrganism draws by birthId, never by species index.
  - Nothing iterates Map, Set or object keys unsorted in the src/sim additions.
  - No Math.random or Date.
  - The rules read the world's recorded manifest: placeHabitatObject uses worldHasSystem, and placeCommunity uses world.content.manifest.
- VERIFIED OK — validator (item 6):
  - The phase check is on the manifest.
  - The offer issue is reported on the habitat file, with no duplicates, and the community offer is checked.
  - `community: true` without a Suggested Community is an error.
  - The founder-chain refusal names both cells and the structure.
  - Regions, objects and furnished areas are checked, including the shared 256 cap. CT §14 limits apply: regions 6, objects 128.
- VERIFIED OK — host refusals: build() refuses before anything is built, and newDishPreview goes through the same build() checks.
  - recipeProvenance records `community` only when it is true.
  - isAuthoredRecipe excludes community dishes.
  - freshStart rebuilds a community dish byte-exactly (test).
- VERIFIED OK — recipe files: `community` is an allowed key, a malformed value is damaged, and a community this build does not offer gets the compatible-build refusal. v1.0 files contain no `community` key and load to the same start.
- VERIFIED OK — imports: habitatRules.ts imports only schema types, fields.ts, grid.ts and structureRules.ts, and has the exact names region-pins needs (HabitatRegion, regionAnchorCell).
- VERIFIED OK — ownership: no edits outside the two tasks' lists, except the disclosed NIT above. No tests/helpers/world.ts edit (item 9). No PROTOCOL_VERSION or world schema bump, which D-0128 allows.
- No browser test was needed: I suspected no UI problem in these two tasks, and port 4390 was never used.
