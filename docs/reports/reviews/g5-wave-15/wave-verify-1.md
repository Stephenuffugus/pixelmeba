# Wave 15 verifier 1: measures-overrides and cards-curated

This review is adversarial. It covers stage 1 (`measures-overrides`, P5.6 part 1) and stage 2 (`cards-curated`, P5.6 part 2) in the uncommitted tree. Scratch files are in `tmp/verify-g5-wave-15-0/`. I edited no tracked file except this report.

**Result: ok = false.** There are six MAJOR problems:
- Three are test failures that leave `npm run check` red.
- Two are E207 and E209 card claims that the measurements do not support.
- One is the release decision on E205 and E206.

## Problems, most severe first

### MAJOR

**MAJOR [lead] `tests/fixtures/habitats-p5-equivalence.test.ts:37,:44`: the fence fails on its key list.**
- The test walks every shipped recipe. The 15 new Phase 5 recipes are extra `recipe:` keys, so both comparisons fail before any value is read.
- Repro: the fence command reports "Test Files 1 failed | 10 passed (11); Tests 2 failed | 100 passed (102)".
- I checked the values independently with `tmp/verify-g5-wave-15-0/eq.test.ts`. It runs `realizeGoldenEntries` with the golden's recorded habitat list and compares only the golden's own keys. It passed: all 25 entries are present and none moved.
- So nothing old moved, but the build stays red until the lead's key-list fix lands. Neither builder may edit this file.

**MAJOR [cards-curated] `tests/content/recipe-structures.test.ts:279`: fails on `NIGHT_SHIFT_V1`.**
- The error is "NIGHT_SHIFT_V1: expected true to be false" on `'cycleStartTick' in w.settings`.
- Stage 1 re-pinned this test to "recipes that place no structure". Stage 2's NIGHT_SHIFT_V1 places none, but it runs `lightMode: 'cycle'`, so it records `cycleStartTick` (D-0106).
- The simulation is correct; the test is not. The filter should leave out cycle-light recipes, or check `cycleStartTick` only when `lightMode !== 'cycle'`.
- cards-curated did not run this file: it is not in its Done-when list. It is in stage 1's, and stage 1 ran it before NIGHT_SHIFT_V1 existed.
- Repro: `npx vitest run tests/content/recipe-structures.test.ts`.

**MAJOR [lead] `tests/sim/lab-commands.test.ts:904`: the narrowed-manifest validator case fails with six extra errors.**
- Five come from prompts-succession's objectives: `offerOnHabitats` names H04, H05, H08 and H11.
- The sixth is `SUSTAIN_THREE_SPECIES offerOn.0: unknown recipe "L305_THE_JACKET_GARDEN"`.
- Cause: measures-overrides added a local `withManifest` filter at `:891`. It drops `PHASE5_EXPERIMENT_RECORDS`, which now include cards-curated's L305, but not `PHASE5_OBJECTIVE_RECORDS`. So the objective that names L305 is left pointing at a dropped recipe.
- This crosses three tasks: measures-overrides, cards-curated and prompts-succession. Fix: the local filter also drops `PHASE5_OBJECTIVE_RECORDS`.
- Repro: `npx vitest run tests/sim/lab-commands.test.ts`.

**MAJOR [measures-overrides] `content/experiments/EXP_209.json` (gate) and `content/recipes/GATE_MEAL_V1.json` (texts): the gate passes with the mechanism deleted.**
- Scratch run `tmp/verify-g5-wave-15-0/e209.test.ts`, GATE_MEAL_V1 with the B06 founders removed:
  - `gateTransfer.S01.sugar` is 1.57e-6 at 1 s, so the gate still holds at 1 s;
  - `converted.starch` is 0;
  - more sugar crossed by 180 s without Crumbsmiths (1.983) than with them (1.339).
- The tally counts the H10 background sugar (`baseFields.sugar` 0.02) moving in either direction, not "sugar the Crumbsmiths make". The texts imply the opposite:
  - predictedTradeoff: "Sugar the Crumbsmiths make can feed Sprinters on the other side of the wall";
  - expectedObservationsText: "The Crumbsmiths' enzyme turns starch into sugar; sugar dissolves and diffuses…".
- The "no organism crossed" clauses read positions at the gate second (1 s), when they are true by construction. `gateCrossings.S01`, the direct measure, is not gated.
- The clauses were the assignment's, so this is partly the lead's.
- Suggested revision 2: `backgroundOverrides: { sugar: 0 }` (one number), so any sugar that crosses was made by conversion. Gate on `gateCrossings.S01 A eq 0` with `runSeconds A gte 180`.

**MAJOR [measures-overrides] `content/experiments/EXP_207.json` (predictedTradeoff) and `content/recipes/BRINE_CROSSING_V1.json` (expectedObservationsText): false claims about what a closed shutter does.**
- The texts say "a closed shutter keeps the pools apart but also stops anything else from crossing" and "a closed shutter blocks it".
- H05's base substrate is gel. Gel diffuses salt at 0.025 per tick (CT §13, "Diffusion/tick: water 0.10, gel 0.025"), and B01 and B10 both live on gel.
- Scratch run `tmp/verify-g5-wave-15-0/e207.test.ts`, 1800 ticks, with the shutter **closed from tick 0**:

  | Reading | Shutter closed | Shutter open |
  |---|---|---|
  | `mean.salt@FRESH_POOL` | 0.00591 | 0.00915 |
  | `limitSeconds.B01.SUIT_SALINITY` | 497.1 | 315.8 |
  | `gateTransfer.S03.salt` | 0 | — |
  | Sprinters at x > 70 | 36 | — |

- Salt and organisms bypass the shutter.
- The gate's second clause (`limitSeconds.B01.SUIT_SALINITY > 0`) does not depend on the shutter. Only `gateTransfer.S03.salt` does, and it correctly reads 0 when closed.
- This breaks the honest-labels rule: the texts state a mechanism the dish does not have. The wording needs fixing; say salt also seeps slowly through the gel and Sprinters walk across it.

**MAJOR [lead] E205 and E206 are shipped (phase 5, listed in the catalog) but can never be completed.**
- I re-ran the builder's pins:
  - `e205-e211.test.ts` passes, with highest sensed signal below 0.1 over 1200 ticks against a 0.30 on-threshold;
  - E206's `glowingStart.B09` is 0 on seed 206.
- An order-of-magnitude check agrees: the steady-state signal near a crowd of 30–60 emitters at 0.02/s, with normal diffusion and 1 %/s decay, is about 0.1.
- The builder's diagnosis holds; CT §12.6 and §13 as written are infeasible for this setup. An owner or D-entry decision is needed before release (defer the two cards, or revise the signal rule by decision).

### MINOR

**MINOR [cards-curated] `content/experiments/EXP_215.json`: the gate is reached at 2 s.**
- `births.X02 B eq 0` is trivially true at 2 s, yet the stamp label says "No Threadrider was born without hosts (copy B)".
- At the stop, copy B's births are indeed 0 (pinned in `e213-e218.test.ts`), so nothing false is recorded. But the clause proves nothing at the moment it is stamped.
- Add `runSeconds A gte 120`, as EXP_106, EXP_204 and EXP_208 do.
- EXP_216's `infections.B01.V02 eq 0` at 1 s has the same shape; EXP_105 is the precedent.

**MINOR [measures-overrides] `tests/helpers/registry.ts:118-210`: shared helper edit.**
- `patchedRawPacks` / `registryWith` now silently drop every `PHASE5_EXPERIMENT_RECORDS` entry for any narrowing patch, and `registryWith` accepts omit names from that list.
- That can hide a future validator regression in a narrowed build. The list also holds two curated dishes, L302 and L305, under the name "EXPERIMENT_RECORDS".
- The builder also edited several files outside its ownership: `tests/tools/listing.test.ts`, `tests/worker/new-dish-habitats.test.ts`, `tests/content/recipe-structures.test.ts`, `tests/sim/lab-commands.test.ts` and `tests/experiments/app-flow.test.ts`. Each was disclosed and each comment gives a reason, so the lead should review rather than revert them.

**MINOR [lead] L305 on seed 305 shows no "delayed capture" comparison.**
- Both Needlejaws starve at about 55 s after 52 handling attempts, every one broken on lost contact. The dish is empty by 300 s (cards-curated's report).
- The question "Is delayed capture worth the cost?" has nothing to compare in this run. It needs a tuning look before it ships as a curated start.

### NIT

**NIT [measures-overrides]**
- `src/sim/serialize.ts:263`: the comment "stateHash never reads provenance" is now stale, because stateHash reads `provenance.testOnlyOverrides`.
- `src/sim/world.ts:74`: the provenance type lacks `testOnlyOverrides`, so every reader casts.

**NIT [measures-overrides] `tests/experiments/test-overrides.test.ts:104-105`: one assertion is vacuous.** The "byte-identical" check realizes SHARED_LUNCH_V1 twice and compares the two. The real guard is the habitats golden and the fence.

**NIT [cards-curated] E214's override is not what reaches the gate on seed 214.**
- Without the overrides the gate is still reached; the builder disclosed this.
- The position-fixed assertion at `e213-e218.test.ts:154` is what catches a missing override.

## VERIFIED OK

**Fence**
- The fence command passes everything except habitats-p5-equivalence: g2-replay, rc1-replay, the four trajectory-fence files, conservation-closed-lid, determinism and determinism-g3 (100 of 102).
- `git diff --numstat tests/fixtures/fence.json` reads "135 0": the 15 added entries and nothing removed.

**Builders' tests**
- The 10 files ran here: 9 new or extended by the two builders plus `tests/recipes/curated.test.ts`. Result: "Test Files 10 passed; Tests 106 passed".
  - `tests/experiments/`: measures-p5, observer-neutral-p5, test-overrides, e205-e211, e213-e218, p5-recipes-determinism;
  - `tests/worker/`: experiment-steps-p5, test-overrides-host;
  - `tests/persistence/`: recipe-file-test-overrides.

**Wider suites**
- The first wide run had 19 files: 17 passed, and the 2 failures are listed above. It covered:
  - `tests/experiments/`: framework, journal-and-words, app-flow, e201-e204, exp-b, hidden-neighborhood-host, inspector-step;
  - `tests/content/`: validator, recipe-structures;
  - `tests/worker/`: host, whatif, new-dish-habitats, protocol3;
  - `tests/persistence/`: recipe-file-community, persistence, checkpoints, shelf;
  - `tests/tools/listing` and `tests/sim/lab-commands`.
- A second run of 11 files passed 175 tests:
  - `tests/content/`: structures-p5, habitats-p5, guide, validator-unimplemented, system-requirements, implemented-rules;
  - `tests/worker/protocol3-v1-equivalence`;
  - `tests/persistence/`: phase5-import, import-implemented, recipe-file-test-overrides;
  - `tests/fixtures/demo-scope`.

**Static checks**
- `npx tsc -p tsconfig.json --noEmit` reports nothing (exit 0).
- eslint is clean on the 24 changed or new source and test files.
- `npm run content:validate` reads "content ok · contentHash eb2fe49e… · recipes 33 · experiments 27 · suggested communities 8 realized".
- The `content/manifest.json` diff is the contentHash only.

**Determinism and observation**
- The new sim code has no `Math.random`, no `Date` and no Map/Set iteration. Override fields and keys are iterated in sorted order. No new random stream and no new event emission.
- Every observer read happens after a tick or at the stage 5 and 6 hooks, writes only its own scratch, and is allocated only when asked for.
- observer-neutral-p5 passes on 7 recipes, an H05 community dish, and FIRST_DISH_V1 in 4× chunks.

**Test-only overrides**
- `withTestOverrides` (`recipes.ts:134`) copies the species and merges provenance; it returns the same object when there are no overrides.
- The `stateHash` term is added only for a non-empty list (`serialize.ts:398`).
- rc1 saves still hash exactly as recorded (test-overrides, and rc1-replay passes).
- The worker refusal, the import refusal and `'no-start'` are tested, as are `DishInfo.testOverrides` and `SlotModes.testOnly`.

**Mutant: toggleShutter**
- A load-time mutant (`tmp/verify-g5-wave-15-0/mut/toggle.test.ts`, with `isCardShutterToggle` forced false) fails 2 tests in experiment-steps-p5. The card-keeps-running rule is not tested vacuously.

**Measures**
- `glowingStart` on a timed-commands card is read when the arms are duplicated (`experiments.ts:651`), not at tick 0.
- The gate measures read the start-relative tally. EXP_207 closed from the start reads `gateTransfer.S03.salt` = 0, so the tally does depend on the shutter.
- `secretionEnergy` is correctly not invented: `ledger.energy.secretion` is per dish only (`ledger.ts:42`).
- `RIVAL_EXPOSURE` is in `isSuitabilityReason` (`pairedRun.ts:228`).

**cards-curated's fix to stage 1 code**
- `firstCaptureAt` now reads `(record tick + 1) / 10` (`pairedRun.ts:846`). That is the dish clock after the tick, consistent with how a gate's second is read. It is an observation only and moves no hash.

**Content**
- L302 and L305 match CT 9.3 (counts, radii, amounts, seeds, question). L305's E11 sits on members 1, 3, 5, 7, 9 and 11 with origin 2, and every jacket is empty (`curated.test.ts`).
- E213's trap numbers match `constants.ts` 232–242. E217's confounds name the real RIVAL targets (B01, B10, B11). E216 has 113 S06 devices.
- E213 and E214 revision 2 (an inoculation at 0 s in the same cell) matches CT's "at center", and no rule changed; it is still an owner flag (D-0131).
