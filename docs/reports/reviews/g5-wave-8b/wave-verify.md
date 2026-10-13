# Wave g5-wave-8b: adversarial verification (verifier 0)

Verdict: **ok = true**. There are no BLOCKER or MAJOR problems. Five MINOR problems and five NOTEs follow; two of the MINOR ones are carry-overs for the lead. Scratch files and probes are in tmp/verify-g5-wave-8b-0/ (git-ignored). No tracked file was edited except this report.

## Problems (most severe first)

1. **MINOR [lead] src/worker/host.ts:2224 (isAuthoredRecipe): it ignores the recorded lid, lightMode and drying, and an import can now reach this.**
   - This wave's recipe-file validator (src/persistence/recipeFile.ts:517-523) accepts `overrides.lid` in the shipped build. A file that records `lid: 'closed'` therefore imports as a closed-lid FIRST_DISH_V1 world.
   - whatIfInfo still names FIRST_DISH_V1 as that dish's What if? source. A custom dish is offered the authored recipe's remixes (D09 §4: "In a custom dish, offer Duplicate dish").
   - Repro (tmp/verify-g5-wave-8b-0/probe.test.ts, PROBE2): realizeRecipeSource(REG, {FIRST_DISH_V1, overrides {seed, lid:'closed'}}) → buildRecipeFile → loadRecipeFile → `host.whatIfInfo(world)`. The probe printed `lid closed authored lid open whatIfSourceId FIRST_DISH_V1`.
   - Only a crafted file reaches this today, because this build never writes such a file. The builder reported it (bug 1).
   - Fix: three clauses, `(o.lid ?? recipe.lid) === recipe.lid` and the same for lightMode and drying, as onlySeed already does. Applying it in the merge commit is cheap.

2. **MINOR [lead] src/worker/host.ts:2152-2183 (build() / recipeProvenance): build() now applies lid, lightMode and drying through applyRecipeOverrides, but it neither validates them nor records them in provenance.**
   - The comment "record exactly what was applied above" is true today only because the protocol's RecipeOverrides type lacks the three keys.
   - Wave 11 (structure-ui) must add validation and provenance in the same change that adds the keys to the protocol. Otherwise a closed-lid New Dish would claim to be the authored recipe. The builder reported it (bug 2).

3. **MINOR [structure-content] tests/content/recipe-structures.test.ts:262-281: the "realizes byte-identically to the same recipe before this change" test is a weaker proxy.**
   - It compares two worlds built by the new code (`edges: []` versus undefined). It never compares against pre-change behaviour, so it could not catch a change that alters every world alike.
   - The guarantee holds anyway:
     - The FENCE passes.
     - My probe realized all 18 shipped recipes with HEAD's src/sim/recipes.ts and with the current one. canonicalJson(serializeWorld) and stateHash were identical for all 18 (PROBE1).

4. **MINOR [art-large] tests/content/art-p5.test.ts:64-65, 212, 221: the builder edited stage 1's test file, which the assignment did not list as theirs.**
   - The edit bounds four "nothing after stage 1" pins to stage 1's entries.
   - It was disclosed and it was necessary. tests/content/art-p5-large.test.ts compensates: `SPRITES…slice(32)` equals the six large sprites, and the P5_SPRITES rows are checked per id. Nothing is lost in total.

5. **MINOR [structure-content] tests/content/guide.test.ts:64, 273 and tests/sim/lab-commands.test.ts:868-905: the builder edited test files the assignment did not list as theirs.**
   - These are pin updates forced by the new records: the tool list, the equipment list, and the structure list and S01 refusal.
   - They were disclosed and no assertion was weakened. lab-commands' synthetic phase-2 "membrane" case is now the real S01, which also asserts the new system-need error.

6. **NOTE [structure-content] src/ui/views/FieldGuideData.tsx:168: requiresSystem filters on the build's manifest, not the dish's recorded one.**
   - After the systems flip, a v1.0 dish without 'climate' will still list the wetting brush in the Field Guide.
   - That is consistent with the Field Guide being build-level. However, the proposed decision's wording ("never lists a tool the dish cannot use") claims more than it does. The tool tray must gate on worldHasSystem (wave 11).

7. **NOTE [art-large] art/src/layers/modules.ts:337-346 (handling_arc): frame 0 already shows a full quarter arc at the first tick of handling.**
   - That is a ceiling mapping ("up to a quarter done"), which the frame names state.
   - org-ui (wave 13) must use the same ceil(progress/need × 4) − 1 mapping, so a full ring never shows before 75 %.

8. **NOTE [art-large]: deviations from the assignment, each justified.**
   - The marks join Phase5FeatureLayerId, not FeatureLayerId; extending FeatureLayerId broke `npm run check` in wave 8a (D-0109 fix1).
   - Their frame counts live in EFFECT_MARKS, not FEATURE_FRAMES; atlas.test.ts requires every FEATURE_FRAMES row to be a module layer or a native mark.
   - Both are recorded as proposed decisions.

9. **NOTE [art-large] public/atlas: the shipped atlas grew from 1024×1024 to 1024×2048, and organisms.png from 286,334 to 453,280 bytes.**
   - src/render has no atlas-size constant (`git grep 1024|2048 src/render` finds only GHOSTS_MAX).
   - The 2048 px texture is not yet measured on a low-end Android device. That is an owner or device item, already listed by the builder.

10. **NOTE [structure-content] content/structures/S07.json: "(a pellet or a wafer)" leaves out the E17 cache.** SPEC §2.4 lists M10, M11 and E17 as finite food objects. The text is correct for Phase 5 but must be revised when E17 ships in Phase 7.

## Verified OK

### Shared checks
- **FENCE:** I ran g2-replay, rc1-replay, the four tests/fixtures/trajectory-fence files and conservation-closed-lid, together with the four new test files. Result: `Test Files 11 passed (11) · Tests 109 passed (109)`.
- **Existing suites:**
  - Files: tests/content (all), tests/recipes, persistence share/persistence/migration, worker whatif/whatif-ui/try-dish-host/keep-dish/new-dish-preview-grid/demo-host/challenge-host, sim lab-commands and module-visuals, tests/render, tests/audio, and every test that imports FieldGuideData.
  - Result: `Test Files 41 passed (41) · Tests 960 passed (960)`.
- **tsc and eslint:** `npx tsc -p tsconfig.json --noEmit` exits 0. eslint on all 24 changed or new .ts/.tsx files exits 0.
- **content:validate:** `content ok · contentHash 67075b0e… · structures 15 · recipes 18 … 1678 frames`. No warning names an S record or WET_BRUSH.
- **art:build --check:** `atlas up to date · 1678 frames (136 feature-mark frames, 13 world-tile frames) · 1024×2048 · 695ad0f2554d`.

### structure-content
- **CT §4 names, kinds and numbers:** checked against CONTENT_TABLES.md 213-235, §5.3, §12.2 and §14, SPEC §2.4/§4.6-§4.9/§10.4, D-0106, and D02 §9-§10.
  - S01: 25 %; warmth passes (D-0106).
  - S02: 50 %; Small free organisms pass.
  - S03: closed stops warmth (D-0106).
  - S04: 2 %, one Small organism per second, no other crossing (D-0106), no multi-hop.
  - S05 and S06: S06 lists B02 Velvet, B13 Rampart, fungi and P06 Bellstalk (the names match the records).
  - S07: removing the basket leaves the object.
  - S08: 0.05, 5, and a logged export.
  - S09 and S10: ±0.01; they start Off.
  - S11: 0.25.
  - S12: 0.8 at 0.01, the 4-neighbour rule, wicks do not chain.
  - Caps: 256 and 512, and two barriers on one edge are refused.
  - The SPEC §4.8 drying sentence is in S11, S12 and WET_BRUSH.
  - No ranking words.
- **Wetting brush:** it needs 'climate'; enabledToolIds and guideProblems both pass enabledSystems. Its dose is 0.9 (CT §12.2 "wetting 0.9").
- **Gating:** realizeRecipe checks structures, systems and climate against the world's recorded manifest (worldHasStructure and worldHasSystem on the created world). The registry uses the manifest it validates. The recipe-file validator uses the build manifest, as assigned.
- **Determinism:** the src/sim diff adds no Math.random, Date, Map/Set or object-key iteration. Ids are positional, and the stores are sorted with sortEdges/sortDevices. Two realizations hash equal; save → load keeps the hash; run(400) equals 4 × run(100).
- **Unchanged shipped worlds:**
  - Recipes without edges or devices leave world.edges and world.devices [], nextDeviceId 1, and no cycleStartTick.
  - My HEAD-versus-now probe found all 18 shipped recipes byte-identical (PROBE1).
  - Optional schema fields with no default, so existing parsed records and exported recipe files are unchanged.
- **The one applier:** applyRecipeOverrides equals the old inline transform for every earlier key (the test compares against a copy of it). hasRecipeChanges equals the old `changed` predicate for the old keys. host.ts changes only the two transforms and `changed`.
- **Recipe file:** the validator accepts lid, lightMode and drying with value checks, and refuses cycle or drying without 'climate'. onlySeed counts the three keys.
- **Not vacuous:** the tests pin refusal sentences and id arrays exactly, so deleting the placement or its checks fails them. The builder's mutant (old `changed`, no requiresSystem filter) failed 4 tests.
- **Manifest:** only contentHash moved; no enable list was edited. The shipped manifest enables no S structure and no barriers/devices/climate system.
- **Placement errors in content:** experiment recipes are covered by the all-recipes loop. Variants cannot set climate, and a deviceState patch still throws (variants.ts:186).

### art-large
- **Old frames byte-identical:** my own probe compared HEAD's atlas (the same as 60a4731's, since later commits are docs only) with the new one frame by frame: `old 1342 new 1678 same 1342 diff 0 missing 0`. Every old sprites-manifest entry is unchanged; only height, exportHash and the six new sprite entries differ.
- **Counts and sizes:**
  - Every species gets 6 move, 4 feed, 4 reproduction, 2 stress and 4 death frames.
  - P05, P06, P07 and P09 are 32 px; P08 and P10 are 48 px. Headings: P05, P06 and P09 one; P07, P08 and P10 four. All match the records and P5_SPRITES.
  - P08 has dormant ×3 with distinct frames, loop false.
  - Missing P08 dormant, a short P10 move, or a missing or short handling_arc or trap_loop fails art-build with exact messages.
- **Looked at the sheets:**
  - p06_bellstalk.png: the stalk is still while the bell contracts; the daughter has no stalk.
  - p08_waterbear.png: eight legs in four visible pairs; the dormant tun has no legs.
  - p09_wheelgrazer.png: only the crown changes.
  - p10_needlejaw.png: the forked front in four headings; feed shows a closing fork and then a lump in the gut.
  - All are legible, distinct in grayscale, and no pose implies an action the body is not doing.
- **Wake cue audit holds:**
  - Native DORMANCY uses the same NATIVE_DORMANCY rules (phenotype.ts:399) and the generic step that emits 'wake' (dormancy.ts:265).
  - cues.ts:141-154 coalesces wakes into one cue. No audio change was made.
- **Effect marks:** EFFECT_MARKS maps handling_arc to HANDLING (P10) and trap_loop to TRAP (F03). effectMarks() returns [] for today's manifest, so content:validate's output is unchanged.
