# Wave 8b — structure-content build report

Builder: structure-content (P5.2 content half, P5.1 data half). Base: 7d07bdb (8a as built 60a4731). Nothing enabled; no shipped dish, screen or hash moved, apart from contentHash (D-0035, expected).

## Checklist

### Build
1. **DONE: twelve records.** content/structures/S01.json … S12.json. Each has StructureSchema fields, phase 5, iconId structure_s01 … structure_s12, and CT §4 names and kinds. Guide text is in the voice of BEAD and WALL. Each rules text states its CT §4/§5.3/§12.2/§14 numbers and limits:
   - S01: 25 %; warmth passes.
   - S02: 50 %; Small passes.
   - S03: Open is no barrier; Closed blocks everything, warmth included.
   - S04: open water on both sides; 2 % per second plus one Small organism; "Nothing else crosses that edge" (D-0106).
   - S05, S06 (Velvet, Rampart, fungi, Bellstalk; no protection), S07 (whole sample only; removal leaves the object).
   - S08: 0.05, 5 units, starts Off, logged export.
   - S09/S10: ±0.01, start Off.
   - S11: 0.25.
   - S12: 0.8 at 0.01; four neighbours; wicks do not chain.
   - Every edge: "at most 512 … two barriers on one edge are refused". Every cell piece: "One furnishing or device per cell, and at most 256".
   - S11 and S12 carry the exact drying sentence.

   The S04 text says nothing about warmth: D-0106 does not rule on it, and climate-stage2 decides. Proved by tests/content/structures-p5.test.ts (first two tests).
2. **DONE: wetting brush.** content/tools/WET_BRUSH.json ("Wetting brush", phase 5, `"requiresSystem": "climate"`, dose "Sets moisture to 0.9."). Its doesNotChange is "Adds no water and dilutes nothing: every amount in the cell stays the same." followed by the drying sentence, and its rules carry the drying sentence too.
   - ToolSchema gains `requiresSystem?: SystemFlag` (src/sim/content/schema.ts:159).
   - `enabledToolIds(tools, ids, buildPhase, enabledSystems)` (src/sim/content/guideRules.ts:76) drops a tool whose system is missing. Both call sites pass it: guideProblems, and src/ui/views/FieldGuideData.tsx:168 (the one-line change).
   - Proved by structures-p5 "the wetting brush appears only where the dish has climate" (3 tests).
3. **DONE: structureRules.ts.** src/sim/content/structureRules.ts holds:
   - STRUCTURE_KINDS (:20) and STRUCTURE_SYSTEM_NEEDS (:41): S01–S04 barriers; S05–S08 and S11 devices; S09, S10 and S12 devices + climate.
   - expectedStructureKind, rulesOfManifest and placedStructureNeedProblem (:92); climateNeedProblem (:107).

   implemented.ts:18 has `IMPLEMENTED_STRUCTURES = []` with the "lead adds S01–S12 at the systems flip (D-0104)" comment.

   registry.ts:
   - Every structure record's kind must match expectedStructureKind (:296-297), enabled or not. Example: "S05 is a furnishing in the simulation (CT §4), not an edge barrier".
   - An enabled structure must be a cell structure or in IMPLEMENTED_STRUCTURES (:431); allowUnimplemented skips only this check.
   - An enabled structure needs every one of its systems (:433), with an error naming both sides: `enabled structure "S01" (Fine membrane) needs the "barriers" system (not in enabledSystems)`.
   - The shipped manifest enables none of them.
4. **DONE: habitat and recipe structures.**
   - schema.ts adds EdgePlacementSchema (:213: inclusive rectangle, strict; `open` S03 only; `flow` required on S04 and only there) and DevicePlacementSchema (:239: `at`, `on` S09/S10 only, `resinSelect` S08 only).
   - HabitatSchema (:265) and RecipeSchema (:362) gain optional `edges` and `devices` with no default, so existing parsed records and exported files are byte-identical.
   - recipes.ts:
     - `recipeStructures(habitat, recipe)` (:413) is pure. Ids run habitat edges, then habitat devices, then recipe edges, then recipe devices, each rectangle row-major; the stores are then sorted with sortEdges/sortDevices. S03 defaults to `open: false`, S09/S10 to `on: false` and S08 to `resinSelect: []`.
     - `placedStructureProblem` (:435): the needs check, then edgeStoreProblem/deviceStoreProblem verbatim.
     - realizeRecipe places the stores after applyHabitat and before background overrides (:528-538). It sets nextDeviceId to 1 + the count. It throws `RecipeError("recipe <id>: <sentence>")`, gated on the world's recorded manifest through gates.worldHasStructure/worldHasSystem.
   - registry.ts:
     - Every habitat and every recipe that touches structures gets a geometry check on its own grid (habitatGrid, recipeGrid).
     - Shipped habitats (enabled, phase ≤ buildPhase) and shipped recipes (phase ≤ buildPhase) also get the needs and climate checks (:438-466).
     - A habitat's own problems are reported on the habitat, once (deduplicated).
     - A recipe is checked for placements when it places its own or repaints under its habitat's (`recipeTouchesStructures`, recipes.ts:483), and for climate only on its own lightMode/drying.
     - Records above the build phase are skipped for needs, as the recipe checks do; geometry is checked for every record, like recipeShapeProblems.
   - Experiments and variants realize their recipe, so the recipe checks cover them.
5. **DONE: environment overrides.**
   - RecipeOverridesRecord gains lid, lightMode and drying. recipeOverridesOf validates their values (recipes.ts:257-259).
   - `applyRecipeOverrides` (:200) is the one applier; `hasRecipeChanges` (:213) is true for anything but the seed, with an empty start counting only when true.
   - recipeFile.ts: `recipeWithOverrides` delegates (:164). onlySeed counts the three keys (:174-176). The validator accepts `drying`, `lid` and `lightMode` with value checks. It refuses cycle or drying true without 'climate' as `damaged('overrides.lightMode' | 'overrides.drying')` (:518-523).
   - host.ts: build() calls applyRecipeOverrides (:2165), and the What if? rebuild's `changed` calls hasRecipeChanges (:2345) with its transform calling applyRecipeOverrides (:2349).
   - realizeRecipe sets `settings.cycleStartTick = 0` only in cycle mode (:516) and throws for cycle or drying without climate (:522).
   - recipeProvenance and the New Dish message are unchanged.
6. **DONE (not written, as assigned): guide copy for the cycle, local warmth and canopy** belongs to structure-ui (wave 11). PROPOSED DECISION below.
7. **DONE: content hash.** `npm run content:validate -- --write` moved only contentHash, b8ddc0dd… → 67075b0e4e53e3adaee23cf9d4c65f3045b007881b789351357311ed7f0e5311. No recipe, experiment, variant, objective or enable list changed.
   - One-off proof that no shipped recipe changed: HEAD's code (git archive into the scratchpad) and the current code, both on the current content folder, realized all 18 shipped recipes. canonicalJson(serializeWorld) and stateHash were byte-identical for every recipe (`diff` → IDENTICAL).
   - The fence's trajectory digests did not move.

### Done when
- **DONE: tests/content/structures-p5.test.ts**, 8 tests:
  - parse, kinds, phase 5, unique iconIds;
  - the CT kind table agrees with EDGE_KINDS, FURNISHING_KINDS and MACHINE_KINDS, and the placement schemas accept RESIN_TARGETS;
  - the numbers in every rules text, and the drying sentence exactly in S11, S12 and WET_BRUSH;
  - the shipped manifest enables none and validates;
  - enabling S01 without barriers, S09 without climate, or any S-structure without allowUnimplemented each fail with the exact message; with all systems and allowUnimplemented it validates;
  - a wrong kind is refused (S05 → edge; WALL → device);
  - enabledToolIds and guideModel list WET_BRUSH only with climate;
  - blank tool text is an error only once climate is on.
- **DONE: tests/content/recipe-structures.test.ts**, 9 tests:
  - every edge and device kind is realized with exact ids, canonical order and nextDeviceId 16, and equals recipeStructures; habitat structures come first (ids 1–3, recipe 4–7, nextDeviceId 8);
  - exact refusals: S04 on gel, S04 on the channel bank, two barriers on one edge, a rim edge, an edge outside the dish, a device on stone, two devices on one cell, 256 accepted and 257 refused, 512 accepted and 513 refused;
  - refusals without 'barriers', without 'climate' (S12), for a structure not recorded (S05), and in the shipped build (S01);
  - content-time refusals for invalid placements, a missing flow, a cycle or drying without climate, and a habitat's own problems; phase 6 skips the needs check;
  - determinism: two realizations are equal, save → load keeps the hash, 400 ticks = 4 × 100;
  - every shipped recipe under the shipped registry and under the all-structures registry: empty stores, nextDeviceId 1, no cycleStartTick, and serializeWorld and trajectoryDigest 'full' identical to the same recipe listing `edges: []` and `devices: []`. The HEAD comparison above pins it against the pre-change code.
- **DONE: tests/sim/recipe-overrides-env.test.ts**, 10 tests:
  - each key alone and together; drying false is kept;
  - equality with the replaced inline transform for every earlier key (and recipeWithOverrides);
  - hasRecipeChanges;
  - recipeOverridesOf accepts 7 records and refuses 7;
  - cycleStartTick 0 exactly in cycle mode, and it hashes; RecipeError without climate;
  - recipe file round trip with lid 'closed' (identity null; lid 'open' keeps it) and with cycle under a climate registry;
  - validator refusals: lid, lightMode, drying, unknown key, and cycle or drying without climate;
  - the What if? rebuild with lid 'closed' equals the original (stateHash). Through a real DishHost, keepPlan says 'unchanged'. The authored Garden whose provenance merely says lid 'closed' is not unchanged.
- **DONE: existing suites unchanged**, except for three updated pins (moved lists, as the assignment allows):
  - tests/content/guide.test.ts: toolIds gains WET_BRUSH, and the equipment list uses enabledToolIds;
  - tests/sim/lab-commands.test.ts: the cell structures are the phase ≤ 2 records; the S01 test uses the real record and now also expects the "barriers" error; the unused `withStructure`/RawFile import was removed.
- **DONE: tsc and eslint clean** on every changed file. During the run, the only tsc errors were in art-large's in-flight art/src/sprites/phase5_large.ts, and at the end tsc reports 0 errors.
- **DONE: e2e.** field-guide.spec.ts passes 6/6 on desktop and phone-portrait (port 4273, stopped before and after). The Field Guide is unchanged because WET_BRUSH stays hidden without climate.

## How each mechanism was shown to be needed
I temporarily reverted `changed` to the old predicate in host.ts and dropped the requiresSystem filter in enabledToolIds. 4 tests failed: the What if? 'unchanged' test, and enabledToolIds, the guide model and blank-text in structures-p5. Both files were then restored from the scratchpad backups.

The placement refusals and ids are pinned to exact sentences and arrays, so removing the placement or the checks makes recipe-structures fail.

## Files
- New: content/structures/S01–S12.json, content/tools/WET_BRUSH.json, src/sim/content/structureRules.ts, tests/content/structures-p5.test.ts, tests/content/recipe-structures.test.ts, tests/sim/recipe-overrides-env.test.ts, this report.
- Changed: src/sim/content/schema.ts, registry.ts, guideRules.ts, implemented.ts (one appended list), src/sim/recipes.ts, src/persistence/recipeFile.ts, src/worker/host.ts (two transforms and `changed` only), src/ui/views/FieldGuideData.tsx (one call), content/manifest.json (contentHash only), tests/content/guide.test.ts and tests/sim/lab-commands.test.ts (pins).

## Commands and results
- `npx vitest run tests/content tests/recipes tests/persistence/{share,persistence,migration,migration-schema5,phase5-import}.test.ts tests/worker/{whatif,whatif-ui,try-dish-host,keep-dish,new-dish-preview-grid,demo-host,challenge-host,host}.test.ts tests/ui/challenge.test.ts tests/ui/*guide*.test.ts tests/sim/view-switch.test.ts tests/sim/lab-commands.test.ts tests/fixtures/habitat-presets.test.ts tests/sim/recipe-overrides-env.test.ts` → `Test Files 33 passed (33) · Tests 941 passed (941)`
- FENCE: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts` → `Test Files 8 passed (8) · Tests 62 passed (62)`
- `npm run content:validate` → `content ok · contentHash 67075b0e… · structures 15 · …` (warnings only, as before)
- `E2E_PORT=4273 E2E_OUTDIR=tmp/dist-structure-content npx playwright test tests/e2e/field-guide.spec.ts --project=desktop --project=phone-portrait` → `6 passed (1.9m)`
- `npx tsc -p tsconfig.json --noEmit` → 0 errors; `npx eslint <14 changed files>` → clean.

## FENCE
No value moved, and fence-update was not run. contentHash moved because of the new files: it is recorded in a fresh world's manifest, so a fresh shipped recipe's stateHash moves (D-0035, expected). Trajectory digests and the g2/rc1 corpora are unchanged.

## Bugs and notes for other owners
1. **host.ts isAuthoredRecipe (~:2224)** (not mine: the lead or wave 11). It compares only empty, habitatId, seed, mutationPreset and founderMode. Once New Dish sends lid, lightMode or drying, a dish started with lid 'closed' would count as the authored recipe, and What if? would offer to remix a custom dish. Add `(o.lid ?? recipe.lid) === recipe.lid && (o.lightMode ?? recipe.lightMode) === recipe.lightMode && (o.drying ?? recipe.drying) === recipe.drying`, as recipeFile.ts onlySeed does. Harmless today because nothing records these keys yet.
2. **host.ts build() and recipeProvenance** neither validate nor record lid, lightMode or drying. The protocol's RecipeOverrides lacks them, so this is wave 11's protocol bump. They must be recorded exactly as applied, or the What if? rebuild and recipe export will disagree with the dish.
3. **src/sim/variants.ts:186** throws "recipes do not declare devices yet" for a `deviceState` patch. Recipes now can (`devices[deviceIndex]`). Whoever ships a device variant must apply it to `recipe.devices` and validate the index.
4. **withHabitatOverride** keeps a recipe's `edges` and `devices`, as it keeps its `ops`. So an "Empty Gel Colony" start of a future recipe with an S04 channel would refuse with RecipeError rather than drop the channel. No shipped recipe places structures.
5. The placement schemas list the S-ids and resin targets as literals. Importing barriers.ts or devices.ts into schema.ts would pull entities into the content schema. structures-p5 checks that the literals agree with EDGE_KINDS, DEVICE_KINDS and RESIN_TARGETS.

## PROPOSED DECISIONS
- **Tool `requiresSystem`.** ToolSchema gains `requiresSystem?: SystemFlag`, and enabledToolIds drops a tool whose system the manifest lacks. Otherwise the Field Guide would list the wetting brush in every buildPhase 5 dish that cannot use it (honest labels).
- **STRUCTURE_SYSTEM_NEEDS.** Edges (S01–S04) need 'barriers'. Furnishings and devices (S05–S08, S11) need 'devices'. The heater, cooler and wick (S09, S10, S12) need 'devices' and 'climate'. The roof needs only 'devices', because its stop on drying matters only where Drying (which needs climate) is on.
- **Placement as optional `edges` and `devices` arrays on HabitatSchema and RecipeSchema**, not new GeometryOp variants:
  - no default, so older records and files stay byte-identical;
  - placed after all cell geometry, so S04's water check sees the final grid;
  - edges as inclusive rectangles of R or D edges, devices one per `at`;
  - ids run habitat edges, habitat devices, recipe edges, recipe devices.
- **Content checks.** Geometry is checked for every habitat and for every recipe that touches structures. Needs and climate are checked for shipped records only, with a habitat's problems reported on the habitat. A recipe is held to its own lightMode and drying.
- **A recipe file with lightMode 'cycle' or drying true in a build without 'climate'** is refused as `damaged('overrides.lightMode' | 'overrides.drying')`, as assigned. Arguably it should read "needs a compatible build"; owner/lead may prefer that wording.
- **Climate guide copy.** The New Dish Environment group and the inspector climate lines (cycle, local warmth, canopy) are written by structure-ui (wave 11), which owns those screens and strings. This task wrote only the record texts.
