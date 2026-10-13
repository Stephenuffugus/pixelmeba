# Wave 8b: saves and determinism check of structure-content

**Verdict: ok.** There are no BLOCKER or MAJOR problems. Two MINOR items need action before the systems flip (D-0104).

Scratch files are in tmp/verify-saves-g5-wave-8b-0/: probe.test.ts with its vitest.config.ts, neutral.ts, and a copy of HEAD under head/. No tracked file was edited.

## Problems

### 1. MINOR [lead]: Lab edits can make a save that will not load (src/sim/structures.ts applyHabitatEdit, about lines 292-339)
The Lab habitat edit does not know about world.edges or world.devices.

This wave adds realizeRecipe, the first thing outside tests that fills those stores. A player can then:
- place a stone on a cell that holds a furnishing or device, or
- paint gel under an S04 channel.

The world keeps running, but its save is refused on import. That breaks "saves are sacred".

**Repro** (tmp/verify-saves-g5-wave-8b-0/probe.test.ts, the "LATENT" test, using registryWith with every system, S01-S12 and allowUnimplemented):
1. `realizeRecipe` with FIRST_DISH_V1, the builder's EDGES and DEVICES, and no founders.
2. `applyNow(w, 'probe-1', { kind: 'placeStructure', structure: 'stone', points: [[70.5, 70.5]], radius: 1 })` is accepted for 5 cells.
3. `loadSaveFile(buildSaveFile(w))` throws "A device sits on a stone, wall or bead. Nothing was loaded."
4. `paintSubstrate gel` over the S04 cell is accepted, and the save is refused with "A one-way channel does not join two open water cells. Nothing was loaded."

**Impact today:** none in the shipped build, because nothing is enabled. It becomes a BLOCKER at the systems flip. The structure tools and Lab wave (structure-ui or barrier-movement) must do one of two things: refuse covered cells that hold a device or a channel endpoint (as a `skipped` reason), or remove the structure by the SPEC §2.4 removal rules. A test must then show that a save after such an edit loads.

### 2. MINOR [lead]: isAuthoredRecipe ignores the new choices (src/worker/host.ts about line 2224)
isAuthoredRecipe ignores lid, lightMode and drying. This file is outside structure-content's ownership; the builder reported it too.

Once wave 11 records these choices, a dish recorded with `lid: 'closed'` would count as the authored recipe. What if? would then offer ideas that are realized from the authored recipe and silently drop the closed lid. The idea would change two things, not one.

Nothing records these keys yet, so this is not reachable. **Fix**, as onlySeed already does:
```
&& (o.lid ?? recipe.lid) === recipe.lid
&& (o.lightMode ?? recipe.lightMode) === recipe.lightMode
&& (o.drying ?? recipe.drying) === recipe.drying
```
This belongs with the wave 11 protocol bump, together with recipeProvenance recording the keys exactly as build() applies them.

## Verified OK

- **Hash neutrality for shipped recipes.** I extracted HEAD with `git archive` into head/ and ran neutral.ts in both trees. It realized all 18 shipped recipes, digested canonicalJson(serializeWorld) at tick 0 and after `run(w, 300)` with contentHash blanked, and recorded edges, devices and nextDeviceId.
  - All 18 entries match: 36 digests, edges=0, devices=0, nextDeviceId 1.
  - Only contentHash differs: b8ddc0dd… becomes 67075b0e…, which D-0035 expects.
- **Fence and old saves.** These suites pass: g2-replay, rc1-replay, trajectory-fence (4 files), determinism, deterministic-state, conservation-closed-lid, persistence share, persistence, migration, migration-schema5 and phase5-import.
  - `Test Files 20 passed (20) · Tests 272 passed (272)`, which also covers the three new test files and worker whatif, keep-dish and try-dish-host.
  - tests/fixtures/fence.json and saves-rc1/ are unmodified.
  - The v1.0 load path is unchanged, apart from recipeOverridesOf now checking the three new keys' values.
- **Determinism with structures.** In probe.test.ts, a world with all 12 structure kinds, a light cycle, drying and a closed lid (7 edges, 8 devices, nextDeviceId 16):
  - two realizations give an equal stateHash;
  - `run(400)` equals four `run(100)` calls;
  - buildSaveFile → loadSaveFile through the real import validator (phase5StateProblem) at ticks 0, 1, 137 and 399, then continuing to 400, equals the uninterrupted run;
  - serialize → deserialize at the same ticks gives the same result.
  - h0 is bc57e340…, h400 is b817b19e….
- **New state is canonical and checked on import.**
  - realizeRecipe output passes edgeStoreProblem and deviceStoreProblem: sorted by edgeKey and by cell, one per edge and cell, S03 `open` and S09/S10 `on` always present, S08 `resinSelect` present, ids below nextDeviceId.
  - cycleStartTick is 0 exactly when the mode is cycle, matching phase5StateProblem's rules.
  - The import refusals end "Nothing was loaded." (phase5-import suite, and repro 1 above).
- **New state is hashed on purpose, and neutral while empty.**
  - Moving one device or closing one shutter changes stateHash.
  - `edges: [], devices: []` serializes byte-identically to a recipe without the keys, and nextDeviceId stays 1.
- **Recipe file round trip.** A registry recipe with EDGES and DEVICES and overrides `{ lid: 'closed', lightMode: 'cycle', drying: true }` goes realizeRecipeSource → buildRecipeFile → loadRecipeFile. It gives an equal stateHash, and is still equal after 150 more ticks on both.
  - With the shipped registry, `{ drying: false }` keeps the bundled identity. FIRST_DISH_V1 records `drying: false`, so onlySeed's comparison holds.
- **The one override applier.** build(), the What if? `changed`/transform and recipeWithOverrides all call applyRecipeOverrides and hasRecipeChanges, so existing keys behave as before (whatif, keep-dish and try-dish-host pass). A rebuild realization that fails is caught in rebuildsExactly (host.ts about line 2313), so the dish is kept.
- **No randomness or iteration-order hazards.** The added src lines contain no Math.random, Date, Map/Set iteration or Object.keys iteration in the sim path. recipeStructures and the placement checks are pure and draw no RNG. The climate check runs before applyHabitat and reads no stream.
