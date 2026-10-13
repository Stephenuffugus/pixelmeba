# Wave 8b lead-integration verify (adversarial; lead's edits only)

Verdict: ok = true. No BLOCKER. One MAJOR doc formula (an easy fix), two MINOR, three NIT. Scratch: tmp/verify-int-8b/ (probe.test.ts, vitest.config.ts). No tracked file was edited.

- MAJOR [docs] docs/DECISIONS.md:1590 (D-0112) and docs/agent/g5-plan.md:164: the handling_arc formula is wrong at the ends of its range. `frame = ceil(handlingProgress / handlingNeed × 4) − 1` gives −1 when progress = 0. Progress can be 0 during an attempt: SPEC §7.3 says "progress resets when contact breaks" while the target is kept. The art defines frame 0 as "up to a quarter done", which includes 0 (art/src/layers/modules.ts:327-329, frameNames :349). The formula also gives 4 if the progress overshoots the need on the last tick. A wave 13 org-ui builder who follows it would index frame −1 or 4. Fix: in both places, use `frame = min(3, max(0, ceil(4 × handlingProgress / handlingNeed) − 1))`.
- MINOR [test] tests/worker/whatif.test.ts:556 and src/worker/host.ts:2231-2232: the lightMode and drying clauses have no failing test, and nothing in the shipped build can reach them. The recipe-file validator refuses lightMode 'cycle' and drying true without 'climate' (src/persistence/recipeFile.ts:521, :523). All 18 shipped recipes record `lightMode: "fixed"` and `drying: false`. A mutant that drops only those two clauses therefore passes every test. The test title says "lid, light or drying", but it exercises only lid. Fix: rename the test to "lid", or add a registryWith(…'climate'…) case for lightMode 'cycle' and drying true.
- MINOR [docs] docs/agent/g5-plan.md:158-159 (new wave 10 structure-commands carry-over): the wording "a device on a non-open cell or an S04 off water" is looser than the import rules. deviceStoreProblem refuses any cell whose structure is not ST_NONE, which includes a bead (src/sim/devices.ts:69), and a bead cell IS transportOpen. The S04 rule needs water substrate AND no structure on both cells (src/sim/barriers.ts:209-210). So a stone or bead placed on an S04 endpoint also breaks the save, and "off water" does not say so. D-0111:1579 gives the right examples. Fix: "a device on a stone, wall or bead cell, or an S04 whose two cells are not both open water (water substrate, no stone/wall/bead)".
- NIT [docs] docs/DECISIONS.md:1589 (D-0112) and docs/ARCHITECTURE.md:524: P07 Dartfin is 32 px with 4 headings (public/atlas/manifest.json sprites.p07_dartfin.headings = 4). The text says only P08 and P10 have "4 headings" or are "four-heading", which reads as if P07 had one.
- NIT [docs] docs/DECISIONS.md:1604-1605 (D-0113 Scope): the ownership lists are incomplete compared with docs/agent/g5-wave-9.tasks.js.txt:45-55 and :186-188. They omit world.ts (doc comments or a Derived field), tests/helpers/trajectory.ts and tests/sim/chemistry.test.ts for climate-stage2, and barriers.ts (additive exports) and tests/helpers/world.ts for barrier-movement. Nothing in them contradicts the task file.
- NIT [docs] docs/DECISIONS.md:1583 (D-0111 Evidence): "the fence unchanged (20 files, 272 tests)". The 20 files are the fence plus the migration, persistence and import suites, the new tests and the worker tests (saves-verify-structure-content.md:44-45), so this overstates what "the fence" covers.

## Verified OK

- VERIFIED OK [isAuthoredRecipe] src/worker/host.ts:2214-2234: the `o === undefined` (v1.0 and pre-override saves) branch is untouched; the three clauses equal onlySeed's (src/persistence/recipeFile.ts:168-178). host.recipeProvenance (host.ts:2174-2184) never records lid, lightMode or drying, so Play → Start, New Dish and What if? starts are unaffected. All 18 shipped recipes set lid, lightMode and drying explicitly (grep content/recipes), so recipe.lid is never undefined, and the habitat-lid case cannot arise in shipped content. Garden variants return record.sourceId before isAuthoredRecipe runs (host.ts:2197). legacyAuthored (host.ts:617) applies only when o === undefined.
- VERIFIED OK [probe] `npx vitest run --config tmp/verify-int-8b/vitest.config.ts`: 2 passed. Results:
  - a file with overrides {seed, lid 'open', lightMode 'fixed', drying false} imports with whatIfSourceId FIRST_DISH_V1 (equal values stay authored);
  - lid 'closed' gives null;
  - Play → Start gives FIRST_DISH_V1, and New Dish with the authored seed and settings gives FIRST_DISH_V1;
  - the recipe file of a Play → Start dish round-trips to FIRST_DISH_V1;
  - all 18 recipes on Play → Start: FIRST_DISH_V1 for FIRST_DISH_V1, null elsewhere (no What if? choices).
- VERIFIED OK [mutant] same probe with the old isAuthoredRecipe (the three keys stripped before the call): the lid-closed import gets whatIfSourceId 'FIRST_DISH_V1'. This reproduces the lead's claim that the new test fails on the old code.
- VERIFIED OK [tests] `npx vitest run tests/worker/whatif.test.ts tests/worker/whatif-ui.test.ts tests/worker/try-dish-host.test.ts tests/worker/keep-dish.test.ts tests/sim/recipe-overrides-env.test.ts tests/ui/prompts.test.ts` (every file that asserts whatIfSourceId): Test Files 6 passed (6), Tests 136 passed (136).
- VERIFIED OK [D-0111] these match the code and the reports:
  - STRUCTURE_KINDS and STRUCTURE_SYSTEM_NEEDS (src/sim/content/structureRules.ts:20-57); IMPLEMENTED_STRUCTURES = [] (implemented.ts:18);
  - S01–S12 kinds, phase 5 and iconIds against CT §4 (CONTENT_TABLES.md:220-231);
  - WET_BRUSH name, phase, requiresSystem and dose; ToolSchema requiresSystem (schema.ts:159); the enabledToolIds signature and its callers (guideRules.ts:76, FieldGuideData.tsx:168);
  - Edge and Device placement schemas (schema.ts:213-251, 265-267, 362-363);
  - recipeStructures id order and sorting (recipes.ts:413-426); placement after applyHabitat, nextDeviceId, RecipeError, cycleStartTick 0 only in cycle mode, climate refusal (recipes.ts:505-538);
  - applyRecipeOverrides and hasRecipeChanges (recipes.ts:200-223); the recipeFile damaged keys (recipeFile.ts:517-523);
  - contentHash b8ddc0dd… → 67075b0e… (content/manifest.json diff); the 18-recipe neutrality and the determinism ticks 0, 1, 137, 399 (saves-verify-structure-content.md:41-52).
- VERIFIED OK [D-0112] these match public/atlas/manifest.json: 1678 frames, 136 feature-mark frames (15 layers × 4 headings × frames), 1024×2048, exportHash 695ad0f2554d…; organisms.png is 453,280 bytes (stat); HEAD has 1342 frames. Also matching: the sprite frame counts per heading and P08 dormant 3; EFFECT_MARKS (tools/content-validate.ts:226-229) and the art-build refusal (tools/art-build.ts:242); trap_loop tones #5C3F0E / #C9A25E against F03's #6B4A12 (art/src/palette.ts:154, 259-262); the wake audit (wave-verify.md:103-105).
- VERIFIED OK [D-0113] checked against g5-wave-9.tasks.js.txt items 1-10 (lines 149-159) and barrier items 1-7 (lines 186-200), and against tasks-writer.md proposed decisions 1-20. All of these match:
  - cycle 2400 and t = max(tick − 1, cycleStartTick);
  - canopy readers; the roof gated on S11 alone with a cache key; lightVersion = −1; the three-key lightFactors;
  - the warmth order (relax to settings.warmth, diffuse, own-cell devices, clamp) and which barriers pass warmth; allocation on an S09/S10 that is On;
  - moisture allocation (drying or ensureMoisture; a wick or roof alone allocates nothing; never freed); drying without an S11;
  - the wick: 0.8 at WICK_PER_SECOND 0.01 × DT 0.1 = 0.001 per tick, both directions, not additive, own cell not wetted, water not stone or wall; this agrees with CT §4 "0.01/s";
  - the repaint hook;
  - the corner rule needs both L-paths; a daughter is placed in her parent's class; the F04 carry-over is in g5-plan.md:151-153;
  - the shelter rule in canOccupy, Small and Fixed unaffected; the hunter-target cancel; cache keys; link severing in wave 10;
  - wave 10 = two stages of two (g5-plan.md:101).
  No statement contradicts the task file.
- VERIFIED OK [ARCH] ARCHITECTURE.md §4 block (lines 103-116) and §10.1 block (lines 523-529): every fact matches the code cited above (one NIT on P07's headings).
- VERIFIED OK [carry-overs] g5-plan.md:157-166. The wave 11 protocol-bump item matches wave-verify.md item 2. The tool-tray gate matches D-0111. The Phase 7 S07/E17 item is present. The wave 10 Lab item matches saves-verify item 1 (the wording MINOR above).

## Lead resolution (2026-10-13)

- MAJOR handling_arc formula: fixed in D-0112 and g5-plan.md. The formula is now frame = min(3, max(0, ceil(4 × handlingProgress / handlingNeed) − 1)), because progress can return to 0 mid-attempt (SPEC §7.3).
- MINOR lightMode/drying untested: fixed. tests/worker/whatif.test.ts has a new case, "in a build with climate, a recipe file that records a light cycle or drying is a custom dish too". It uses a registryWith with 'climate', since the shipped build refuses such files. Two mutants confirm each clause is tested: without the lightMode clause it fails with "cycle: expected 'FIRST_DISH_V1' to be null", and without the drying clause it fails with "drying: …". The lid case was renamed to say lid only. Whole file: 27/27. tsc and eslint are clean.
- MINOR Lab carry-over wording: fixed in g5-plan.md. It now reads: a device on a stone, wall or bead cell (devices.ts:69, ST_NONE), or an S04 whose two cells are not both open water (barriers.ts:209-210).
- NIT P07 headings: fixed in D-0112 and in the ARCH §10.1 block (P07 has 4 headings).
- NIT D-0113 lists: D-0113 now says the task file's header table is the full ownership list, and names the extra files.
- NIT D-0111 evidence wording: fixed. It now reads "the fence unchanged, run with the migration, persistence, import, new and worker suites (20 files, 272 tests)".
