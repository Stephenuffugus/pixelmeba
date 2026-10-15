# Wave 14 saves/determinism verify: habitat-communities (P5.4 part 2, Suggested Communities)

Lens: saves and determinism only. Probes in tmp/verify-saves-g5-wave-14-1/ (probe.test.ts + its vitest.config.ts; logs probe.log, probe.out, replay.log, builder.log). No tracked file edited; no git writes. Load average was below 4 throughout.

Verdict: ok. No BLOCKER and no MAJOR. Three NOTEs: crafted saves degrade safely, with no fix required.

## Problems (most severe first)

- NOTE [habitat-communities] src/persistence/saveFile.ts (provenance not shape-checked on import) / src/sim/recipes.ts:292 — A save whose provenance records `overrides.community: "yes"` still loads. recipeOverridesOf returns null for it, so the dish has no recorded start: no What if?, no recipe file, and auto-keep saves it rather than calling it unchanged. That is the same safe degradation as the other override keys. Repro: probe "crafted saves" → `tamper community yes: LOADED overrides=null`.
- NOTE [habitat-communities] src/sim/recipes.ts:230 — applyRecipeOverrides adds `community: true` even without `empty`. build() and recipeFileProblem both refuse that combination, so it can only come from a hand-made save. For such a save, freshStart would realize founders plus community. That never equals the save's state, so rebuildsExactly is false and the dish is kept. Safe; recorded for the owner only.
- NOTE [habitat-communities] src/worker/host.ts:2364 — A crafted save recording `community: true` on WATER_GARDEN (no habitatId) loads and recipeOverridesOf accepts it. freshStart's RecipeError ("has no Suggested Community") is caught by rebuildsExactly, and buildRecipeFile maps it to the no-start text. Nothing crashes and nothing is rebuilt wrongly. Repro: probe → `tamper community true, no habitat (WATER_GARDEN): LOADED overrides={"seed":104729,"empty":true,"community":true}`.

## VERIFIED OK

- VERIFIED OK — awkward-moment saves for all eight Suggested starts. I tested H04–H11, half of which (H04, H06, H07, H08) the builder's determinism file does not cover.
  - Saves taken at these points: buildSaveFile → loadSaveFile at tick 0, right after the community appears (canonical serializeWorld equal and stateHash equal); serialize → JSON → deserialize between odd chunks (1, 7, 29, 63, 200); and save files again at ticks 1 and 37.
  - Every one equals the uninterrupted run at tick 300, and checkLedger is ok.
  - Hashes at tick 300: H04 744dd0e8b5f8896d, H05 1375fcbb3e6e9b8c, H06 5215c2532ac84567, H07 3e4403f21063a33b, H08 0be6800301ebfdf1, H09 86a2c57c400251e2, H10 5db192ba9bf27521, H11 3adf3633fb329144.
  - Source: probe.log; 13/13 probe tests passed.
- VERIFIED OK — worker lockstep for H04 (food objects and furnishings), H06 (closed lid, light cycle) and H08.
  - Each DishHost dish was created from `{ empty, habitatId, community: true }`. At 1× and at 4× it was saved mid-run at tick 113 (host `save` → new host `{kind:'state'}`) and continued to tick 300.
  - 1× = 4× = the headless habitatStart run, for all three.
- VERIFIED OK — a loaded tick-0 community save still names its start: recipeStartOf gives `kind: 'recipe'`. Its recipe file exports and imports to the same stateHash (H04, H06, H08).
- VERIFIED OK — the builder's saves-relevant files re-run here: recipe-file-community, new-dish-habitats, habitats-p5-community-determinism, habitats-p5-fence-drafts, sim/recipe-overrides-env, persistence/share and worker/whatif. Result: 7 files, 78 tests passed (builder.log).
- VERIFIED OK — the g2 and rc1 corpora (D-0101) load and continue bit-identically, and v1.0 starts and saves are unchanged.
  - Files run: g2-replay, rc1-replay, habitats-p5-equivalence (the stage 1 golden, which covers the v1.0 New Dish habitat starts through the new withHabitatOverride), migration, migration-schema5 and phase5-import.
  - Result: 6 files, 79 tests passed (replay.log).
- VERIFIED OK — the provenance of a request without community is unchanged.
  - `community: false` is not recorded: `{"seed":104729,"empty":true,"habitatId":"GEL_COLONY"}` (probe).
  - recipeProvenance spreads `community` only when it is true (host.ts:2226). The builder's deep-equal test passes.
- VERIFIED OK — the new saved state is deliberate and canonical. It consists of `provenance.overrides.community` (only when true) and the habitat record's `suggestedCommunity` inside `world.content.habitat`.
  - The H01–H03 records are untouched: git shows only H04–H11 new, plus the manifest contentHash.
  - The save loader validates the habitat with HabitatSchema (saveFile.ts:385), and the save round-trip keeps `content.habitat` equal.
  - The community's patches and organisms are ledger inputs: `community:<hid>:patch<n>[:label]` and `introduce:community:<hid>`. checkLedger is ok after 300 ticks for all eight.
- VERIFIED OK — randomness. Only src/sim draws it: `STREAMS.communityPlace` is used solely at recipes.ts:723, with `detPermutation(eligible.length, world.seed, 'community.place', k)` keyed on the group index.
  - The eligible list is row-major diskCells, filtered by pure predicates. No Map, Set or object-key iteration feeds placement: `Object.fromEntries` serves only as the lookup table for communityOfferProblem.
  - Outside src/sim, the only randomness in the changed files is NewDish.tsx's pre-existing `randomSeed()`. That is a UI seed pick: the dish records the seed, and the simulation never reads the generator.
- VERIFIED OK — rebuild paths go through the one applier.
  - freshStart realizes through applyRecipeOverrides with the recorded overrides. hasRecipeChanges counts `community === true`, so a community dish's compare start or What if? rebuild is the same dish.
  - rebuildsExactly wraps freshStart in try/catch.
  - The recipe file import compares canonical recipe, habitat, source and stateHash, so a later build whose community record changed is refused as "needs a compatible build", never realized differently.
- VERIFIED OK — the recipe-file refusals.
  - `overrides.community` not a boolean, or true without `empty` → damaged('overrides.community').
  - A community not offered → the compatible-build result.
  - All are covered by recipe-file-community.test.ts and passed here.
