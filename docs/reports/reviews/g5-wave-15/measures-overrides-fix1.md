# measures-overrides — fix round 1 (wave 15)

## Per problem

**MAJOR: EXP_209 / GATE_MEAL_V1, the gate passes with the mechanism deleted. FIXED.**
- Recipe revision 2 changes one number: `backgroundOverrides.sugar` goes from 0.02 (H10's base) to 0. The only sugar left in the dish is what the Crumbsmiths' enzyme makes from the starch. No photosynthesizer is present, and `gateTransfer.S01.starch` stays 0.
- New card gate:
  - `runSeconds A ≥ 180`
  - `gateTransfer.S01.sugar A > 0`
  - `gateCrossings.S01 A = 0` (the direct "no organism crossed" measure over the whole run)
- The two position counts (`alive.B06@RIGHT_SIDE`, `alive.B01@LEFT_SIDE`) are still measurements but no longer gate clauses.
- Rewritten texts: predictedTradeoff, confounds and the recipe's expectedObservationsText. None of them promises that the sugar feeds or keeps anything alive.
- Measured on seed 209:
  - The gate is reached at 180 s with clause values 180, 0.7647136653 and 0.
  - Converted starch is 28.69 and B01 intake is 0.7187.
  - Both founding groups starve within the run (B01 by 127 s, B06 by 173 s). The dish is empty at the stop; the texts claim no survival.
- Tests (tests/experiments/e205-e211.test.ts):
  - The E209 pins are rewritten for revision 2.
  - New test: with B06 removed, the dish holds no sugar at tick 0, and after 1800 ticks transfer, conversion and crossings are all 0, so the gate cannot pass. The same check passed at 1.57e-6 under revision 1.
  - New check that the gate's measures are exactly those three.
- PROPOSED DECISION: E209's gate is `runSeconds ≥ 180`, `gateTransfer.S01.sugar > 0`, `gateCrossings.S01 = 0`, on GATE_MEAL_V1 revision 2 with background sugar 0. Reason: under revision 1 the sugar tally counted the habitat's background sugar, and the position clauses were true by construction at 1 s. This changes the assignment's E209 clauses and adds a CT 10.3 number (sugar 0, the "Starch and nutrient" setup), so it is for the lead's D-entry.

**MAJOR: EXP_207 / BRINE_CROSSING_V1 texts claim a closed shutter blocks salt. FIXED (texts only; no recipe number changed).**
- The verifier is right. H05 is gel outside its pools, and CT §13 gives "Diffusion/tick: water 0.10, gel 0.025".
- With the shutter closed from tick 0 for 180 s:
  - The shutter tally reads 0.
  - `mean.salt@FRESH_POOL` is 0.005912 (0.00915 with the shutter open).
  - `limitSeconds.B01.SUIT_SALINITY` is 497.1 (315.8 open).
  - `alive.B01@BRINE_POOL` is 0 at 180 s, so the Sprinters meet salt in the gel around the brine pool, not inside it. The new texts say exactly that.
- Rewritten texts:
  - The predictedTradeoff says a closed shutter stops the flow across its four edges, but salt still seeps through the gel around it and Sprinters crawl over that gel, so it does not keep the pools apart.
  - The confounds say the tally counts only the shutter's share, and that the suitability time counts every Sprinter, wherever it met the salt.
  - The recipe's expectedObservationsText now says salt still seeps through the gel when the shutter is closed.
- The gate is unchanged. It is the assignment's "salt transport and suitability observed", and E207 still reaches it at 46 s with 2.9956 and 0.4.
- Test: a new E207 test closes the shutter from tick 0. It pins tally 0, fresh-pool salt 0.005912 and suitability 497.1, and asserts that none of the three texts says "blocks it", "stops anything else" or "keeps the pools apart but".

**MINOR: tests/helpers/registry.ts silently drops PHASE5_EXPERIMENT_RECORDS. FIXED (cheap guard).**
- New `phase5RecordsChecked(raw)` runs whenever a narrowing patch filters records. It throws unless every id in PHASE5_EXPERIMENT_RECORDS names a recipe or experiment on disk with phase 5, and every id in PHASE5_OBJECTIVE_RECORDS names an objective with phase 5.
- So the drop list can never remove an earlier phase's record or a missing one.
- The comment now says the list also holds the Phase 5 curated dishes L302 and L305. The list was not renamed: lab-commands imports it.
- Test (e205-e211.test.ts): the guard passes on the shipped packs, and throws when a listed record's phase is set to 3.
- The out-of-ownership edits disclosed in round 0 are still for the lead's review.

**MINOR: provenance.testOnlyOverrides is never validated on import. FIXED.**
- New `recordedTestOverridesProblem(content)` in src/sim/recipes.ts, hooked by one line into loadSaveFile (src/persistence/saveFile.ts, right after the species-schema check).
- When the key is present it requires:
  - a non-empty list of records with only description, target and values;
  - a non-blank description;
  - target `species:<ID>` naming a species copy of the world, one entry per species;
  - values a non-empty object whose keys are in TEST_OVERRIDE_FIELDS, each a finite number equal to the copy's own field.
- Anything else is refused with: "This dish's test-only override record is invalid (<reason>). Nothing was loaded." The reasons never echo a forged key.
- Test (tests/experiments/test-overrides.test.ts): re-sealed forged saves are each refused. The forms are "x", [], [1,null,{}], speed 'fast', maxB 1, target 'stone', two entries for one species, a blank description, and a claim the copy contradicts (provenance says speed 0, the copy holds 1.2). The genuine record still loads in either list order with the same stateHash.
- Mutant check: the hook disabled makes this test fail; restored.
- The older hole is NOT FIXED: a save with the key deleted still loads its speed-0 copies with no disclosure. Species copies are never hashed or checked against a record, and that predates this wave; closing it would need a species-copy check against the build, which a dish's recorded ruleset forbids.

**NIT (saves-verify): src/sim/serialize.ts:263 comment "stateHash never reads provenance" was stale. FIXED.**

**Also fixed (wave-verify-1 MAJOR [lead], in my own round-0 lines):** tests/sim/lab-commands.test.ts. The local `withManifest` now also drops PHASE5_OBJECTIVE_RECORDS, so the narrowed-manifest case no longer reports the six objective errors. It passes.

## Files changed in this round
- content/recipes/GATE_MEAL_V1.json (revision 2, background sugar 0, texts)
- content/experiments/EXP_209.json (gate, predictedTradeoff, confounds)
- content/experiments/EXP_207.json (predictedTradeoff, confounds)
- content/recipes/BRINE_CROSSING_V1.json (expectedObservationsText)
- content/manifest.json (contentHash only)
- src/sim/recipes.ts (`recordedTestOverridesProblem`)
- src/persistence/saveFile.ts (import plus the one-line load hook)
- src/sim/serialize.ts (comment)
- tests/helpers/registry.ts (`phase5RecordsChecked`, comment)
- tests/sim/lab-commands.test.ts (objectives filter)
- tests/experiments/e205-e211.test.ts and tests/experiments/test-overrides.test.ts
- tests/fixtures/fence.json (my GATE_MEAL_V1 entry removed and re-added)
- docs/reports/experiments-g5.md (E209 row and a "Fix round 1" section)

## contentHash
- 48fdb0a8a985… was this round's first write.
- Another builder then edited content in the tree (b119a0b7fd80…, stale on disk).
- Re-written to b1194d5decaf855ce01422693413e007651c8bd88a98e5e20fb0da7302111acd. `npm run content:validate` is clean, and the manifest lists are unchanged.

## Fence
- GATE_MEAL_V1's digest moves, because revision 2 realizes differently. It is my own uncommitted entry, so I deleted it and re-added it with `npx tsx tools/fence-update.ts --add GATE_MEAL_V1`: 257af252138e2870 -> **80b5c90f1c5c7327** (1200 ticks).
- `git diff tests/fixtures/fence.json` removes no lines. It adds only the 15 wave-15 recipe entries.
- No other entry moved. BRINE_CROSSING_V1 (c1437b199aa09552) is unchanged, since only its text changed.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: exit 0. `npx eslint` on every changed TS file: exit 0.
- `npx vitest run tests/experiments/e205-e211.test.ts`: 21 passed.
- `npx vitest run tests/experiments/test-overrides.test.ts`: 11 passed. With the hook mutant: 1 failed, as intended.
- Fence (`g2-replay`, `rc1-replay`, `trajectory-fence*`, `conservation-closed-lid`, `determinism`, `determinism-g3`, `habitats-p5-equivalence`): 100 passed, 2 failed.
  - Both failures are in habitats-p5-equivalence, on its key list: the 15 new recipes appear as extra `recipe:` keys.
  - This is the lead's MAJOR in saves-verify. The verifier showed no value moved.
  - Not fixed here: the test is not mine.
- Wide run (tests/experiments/, tests/recipes/, the content, worker and persistence files the assignment names, plus lab-commands, objectives-p5, goals-p5-host and probes-gates): 742 passed, 6 failed in 63 files.
  - Four failures were the content hash, rewritten meanwhile by another builder (validator, habitats-p5) and by lab-commands.
  - Three were in notebook-succession, prompts-succession's file, in flux while it was being edited.
- Re-run after the content write and the lab-commands fix (validator, habitats-p5, lab-commands, notebook-succession): 4 files, 83 passed.
- E2E: I have no journeys of my own, and no UI file changed in this round.

## NEEDS
- Lead: habitats-p5-equivalence should compare only the golden's own keys (saves-verify MAJOR).
- Lead: a D-entry for the E209 revision 2 PROPOSED DECISION above.
