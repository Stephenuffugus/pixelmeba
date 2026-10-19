# cards-curated fix round 1 (P5.6 part 2, wave 15)

I fixed all three problems: the MAJOR, the EXP_215 MINOR, and EXP_216, which the verifier noted under that MINOR. No simulation code changed, and no fence entry of mine moved.

## Per problem

**MAJOR: `tests/content/recipe-structures.test.ts:279` fails with "NIGHT_SHIFT_V1: expected true to be false".** FIXED.
- The cause is in stage 1's re-pin (the `placesNone` list). NIGHT_SHIFT_V1 uses `lightMode 'cycle'`, and `src/sim/recipes.ts` `realizeRecipe` correctly records `cycleStartTick: 0` in cycle mode (D-0106: "present only in cycle mode"). The test still assumed no recipe records a cycle tick.
- The fix tightens the assertion instead of leaving the recipe out:
  - A recipe whose light mode is `'cycle'` (`recipe.lightMode ?? habitat.lightMode`) must record `w.settings.cycleStartTick === 0`.
  - Every fixed-light recipe must still record no `cycleStartTick`.
- NIGHT_SHIFT_V1 still goes through the byte-identity and digest checks.
- Test: the same file. It failed before the fix (the verifier's repro) and passes now.
- This file is outside my ownership. The edit is small and additive (a five-line conditional replacing one line), and the comment names the reason.

**MINOR: EXP_215's gate is reached at 2 s, where `births.X02 B eq 0` is trivially true.** FIXED.
- I added `{"measure": "runSeconds", "arm": "A", "op": "gte", "value": 120, "label": "Both copies ran 120 s"}` as the first clause, as EXP_204 does.
- Measured on seed 215, shipped registry: the gate is reached at **120 s**. Clauses: runSeconds 120; attached.X02 A 9; intake.X02 A 13.506; births.X02 B 0.
- Copy A at the stop: X02 births 5, alive X02 10, alive F02 10, F02 biomass 26.53. Copy B: no intake, alive X02 5, no F02.
- Test: `tests/experiments/e213-e218.test.ts` "E215 … over the whole 120 s".
  - It pins the clause measure list (with `runSeconds` first), `reachedAtSecond` 120 and the four values.
  - The old card (gate at 2 s, three clauses) fails it.

**MINOR, same shape: EXP_216's `infections.B01.V02 eq 0` is stamped at 1 s.** FIXED. It was cheap and in my file.
- I added `{"measure": "runSeconds", "arm": "A", "op": "gte", "value": 180, "label": "The dish ran 180 s"}`.
- Measured on seed 216: the gate is reached at **180 s**. Clauses: runSeconds 180; infections.B02.V02 20; infections.B01.V02 0; wholeUnitCells.B01.V02 20.
- So the Sprinters' zero now holds over the whole run, against 20 whole-unit cells.
- EXP_105 keeps its older shape. I did not touch it (not my file).
- Test: `tests/experiments/e213-e218.test.ts` "E216 … over 180 s". It pins the clause list, the reach second 180 and `[180, 20, 0, 20]`; the old card fails it.
- Neither card's stoppingSeconds changes, and no CT number changes.

## Files changed
- tests/content/recipe-structures.test.ts (shared, additive: the cycle-tick assertion)
- content/experiments/EXP_215.json, content/experiments/EXP_216.json (a runSeconds clause in each)
- tests/experiments/e213-e218.test.ts (E215 and E216 pins)
- docs/reports/experiments-g5.md (the EXP_215 and EXP_216 rows)
- content/manifest.json (contentHash only, through `npm run content:validate -- --write`)

## Commands and results
- `npx vitest run tests/content/recipe-structures.test.ts tests/experiments/e213-e218.test.ts tests/experiments/framework.test.ts`: all pass.
- `npx vitest run tests/experiments/ tests/content/recipe-structures.test.ts`: **24 files, 212 tests passed**.
- `npx tsc -p tsconfig.json --noEmit`: clean. `npx eslint` on both changed test files: clean.
- Fence: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts tests/fixtures/habitats-p5-equivalence.test.ts` (in the background) gave **99 passed, 3 failed**. None of the three is mine:
  - `habitats-p5-equivalence` (2): the known key-list failure. The 15 Phase 5 recipes are extra `recipe:` keys, and no value moved. It is listed as MAJOR [lead] in saves-verify-measures-overrides+cards-curated.md.
  - `trajectory-fence-current` GATE_MEAL_V1: got `80b5c90f1c5c7327`, expected `257af252138e2870`.
    - This is stage 1's recipe, not mine. During my run another agent was editing `content/recipes/GATE_MEAL_V1.json`, BRINE_CROSSING_V1.json, EXP_207.json and EXP_209.json: those files were newer than my edits.
    - **FENCE: GATE_MEAL_V1, caused by measures-overrides' in-flight revision, not by cards-curated.**
  - All eight of my entries and every older entry passed.
- `E2E_PORT=4271 E2E_OUTDIR=tmp/dist-cards-curated npx playwright test tests/e2e/experiments-p5.spec.ts tests/e2e/curated-dishes.spec.ts --project=desktop`: **6 passed** (3.4 min). The port was stopped before and after.
- contentHash:
  - Mine: `eb2fe49eb3d9…` -> `accbf3aba371…` (my two card edits).
  - Stale again after the other agent's edits: `48fdb0a8a985…`.
  - My last step, `npm run content:validate -- --write`: `b119a0b7fd80e68c38867286b3cdb82409a53e4d007f0af2ac341dd76353d153`. Content ok; `tests/content/validator.test.ts` 9/9 passed.

No new PROPOSED DECISION and no NEEDS line beyond the lead's existing habitats-p5-equivalence key-list fix.
