# cards-curated (P5.6 part 2) build report: wave 15, stage 2

I built the six cards E213–E218 with their recipes and the two curated dishes L302 and L305. Each one is tested, fenced and listed in the game.

All six cards reach their gates headless under the shipped registry. E213 and E214 needed a revision 2: one placement change each, made after measuring the limiting factor. I made one fix to stage 1's code (`firstCaptureAt`). Every old fence value is unchanged.

Nothing is committed (the lead commits).

## Checklist

### Build

1. **The six recipes and cards. DONE.** All are phase 5 and use the CT 10.3 defaults unless noted.
   - Recipes: `content/recipes/{TEMPORARY_TRAP_V1, SHELL_HANDLING_V1, FUNGAL_HITCHHIKER_V1, DIFFERENT_HOST_V1, RIVAL_NO_WINNER_V1, NIGHT_SHIFT_V1}.json`.
   - Cards: `content/experiments/EXP_213` … `EXP_218.json`.
   - Proof: `tests/experiments/e213-e218.test.ts:55` checks that every card validates as shipped, is phase 5, and uses its number as the seed of both card and recipe.
2. **The curated dishes. DONE.**
   - Files: `content/recipes/L302_UNDER_THE_CANOPY.json` and `L305_THE_JACKET_GARDEN.json`.
   - Both appear in the New Dish curated list through `NewDish.tsx`'s glob, with no UI edit.
   - Unit proof: `tests/recipes/curated.test.ts:252` (the list is L301 … L306 in id order).
   - Browser proof: `tests/e2e/curated-dishes.spec.ts:117` and `:149`.
3. **Headless runs. DONE.** The table below has every result. The curated dishes' 600 s runs are reported below it.
4. **Fence. DONE.** I added eight entries with `--add`. Every other entry is unchanged (FENCE section).
5. **sim-tune smoke. DONE.** No change to the tool was needed.
   - The given command accepted SHELL_HANDLING_V1 (an override recipe; its own revision 2) and L305 (a curated dish):
     - SHELL_HANDLING_V1: "60 s · intake t39 · … deaths 1 · … mismatches 0 · hash 408168721994eee1"
     - L305: "60 s · intake t0 · division t131 · births 100 · deaths 96 · … reproduced 200/200 · mismatches 0 · hash a349d5831e10cf14"
   - I also ran BRINE_CROSSING_V1, a habitat recipe on H05: "… mismatches 0 · hash f518cbda5e01f144".
6. **`content:validate --write` as the last step. DONE.**
   - contentHash `efeb7ad364d9…0e7a` (stage 1's) → `c0bce2a82875f13ca5ff6138c807cb1932bc861a41a04949e8b6ae3b5ecc0f2e`.
   - That hash includes prompts-succession's objective files. My own write after my content was `b574100fa444…212f`.
   - The manifest's lists are unchanged.

### Tests to write

| Item | Status | Where |
|---|---|---|
| e213-e218 | DONE, 17 tests | `tests/experiments/e213-e218.test.ts` |
| p5-recipes-determinism | DONE, 17 tests (stage 1's 7, my 8, 2 mid-state saves) | `tests/experiments/p5-recipes-determinism.test.ts:24`, `:87` |
| curated | DONE, 11 tests (L302 and L305 in every generic case, plus 2 new) | `tests/recipes/curated.test.ts:226`, `:252`, `:264` |
| Mutants by hand | DONE | see below |

What the e213-e218 tests cover:
- validity;
- revision pins;
- twice-identical runs;
- ledgers;
- each card's gate second and clause values;
- the revision 1 limiting factors;
- E214's provenance, species copies and fixed contact;
- E215's arms and the omit refusal;
- E216's 113 S06 cells;
- E217's arm B;
- E218's cycle.

### Done when

- **My test files pass. DONE.**
  - `e213-e218` 17/17 passed (rerun after the E215 refusal case was added).
  - `p5-recipes-determinism` 17/17 passed (221 s).
  - `curated` 11/11 passed.
- **`tests/experiments/*`, `tests/recipes/*`, `tests/content/{validator,guide,habitats-p5}`, `tests/worker/{host,new-dish-habitats}`. DONE after re-pins.**
  - First run: "Test Files 6 failed | 24 passed (30); Tests 8 failed | 323 passed (331)".
  - 3 failures were card lists my cards move. I re-pinned them, each with a reason comment:
    - `framework.test.ts`
    - `app-flow.test.ts`
    - `journal-and-words.test.ts`

    Rerun: 3 files, 46 passed.
  - 5 failures were prompts-succession's new objectives in narrowed test manifests. They cleared once its own `tests/helpers/registry.ts` `PHASE5_OBJECTIVE_RECORDS` edit landed. Rerun: guide, habitats-p5, new-dish-habitats and validator, 4 files, 87 passed.
- **`tsc --noEmit` and eslint. DONE.**
  - `npx tsc -p tsconfig.json --noEmit` is clean; it was run last, after every edit.
  - eslint on every file I changed is clean.
- **`npm run content:validate`. DONE.** "content ok · contentHash c0bce2a8…f2e".
- **Fence. DONE.** All values are unchanged; my 8 entries were added (FENCE section).
- **E2E. DONE.**
  - Command: `E2E_PORT=4271 E2E_OUTDIR=tmp/dist-cards-curated npx playwright test tests/e2e/experiments-p5.spec.ts tests/e2e/curated-dishes.spec.ts --project=desktop --project=phone-portrait`.
  - Result: **12 passed (5.5m)**: 6 journeys on desktop and the same 6 on phone-portrait.
  - The E214 disclosure case is un-skipped and passes.
  - Each screen also checks axe, overflow, 16 px text and 48 px targets.
  - The port was stopped before and after the run.

## Per card (shipped registry)

| Card | Rev | Gate second | Clause values at the gate | At the stop |
|---|---|---|---|---|
| E213 A temporary trap | 2 | 9 | trapArmed 1; trapHold 1; trapRelease 1; intake.F03 0.24 | P04 alive 1 (biomass 7.76) |
| E214 Shell handling | 2 | 4 | handlingStart 1; firstCaptureAt 4.0; captures 1 | handlingBreak 0; P05 0 |
| E215 Fungal hitchhiker | 1 | 2 | attached.X02 A 5; intake.X02 A 0.03; births.X02 B 0 | A: 9 attached, births 5; B: no intake |
| E216 A different host | 1 | 1 | infections.B02.V02 4; infections.B01.V02 0; wholeUnitCells.B01.V02 20 | B02 infections 20, B01 0; B02 0 alive, B01 38 |
| E217 Rival without a winner | 1 | 180 | runSeconds 180; limitSeconds.B01.RIVAL_EXPOSURE 5564.8; secretingSeconds.B13 602.5 | A B01/B04/B13 34/32/15; B 34/26/0 |
| E218 Night shift | 1 | 112 | modeSwitch 1; intakePhoto 372.40; intakeSugar 1.79 | 2 records; photo 666.8, sugar 611.0; A04 314, A01 234 |

### E213: the measured limiting factor, then revision 2

Revision 1 placed the P04 by 'nearest' at (64,63), the nearest cell a founder may take (founders need distinct cells).

- The trap was built on tick 1 (trapArmed 1).
- In 12 s the Siltworm wandered in y 62.2–63.8 and never entered the Traplace's cell. Capture is same-cell (D-0124).
- So trapHold, trapRelease and intake were all 0.

Revision 2 adds the P04 as a scheduled inoculation at 0 s at (64.5, 64.5), radius 0, inside the Traplace's cell. This follows CT's "one P04 at center". The trap rule is unchanged.

Pinned at `e213-e218.test.ts:91` (revision 1) and `:112` (revision 2).

### E214: contact geometry as measured, then revision 2

Founders sit at exact cell centres.

- Revision 1 put P05 in (65,64), next to P10 at (64,64). The centre distance was exactly 1.0 at every one of 100 ticks.
- The contact reach is CONTACT_DISTANCE 0.5 (D-0123). No attempt and no capture.
- No distinct-cell placement can do better: a 4-neighbour is 1.0 away and a diagonal 1.41.

Revision 2 adds the P05 as a scheduled inoculation at 0 s at (64.5, 64.5), radius 0, inside P10's own cell. This follows CT's "P10 and P05 at (64,64)".

- The inoculation's jitter keeps P05 within 0.30 of the centre on each axis, so at most 0.42 from P10, which is within reach.
- Both stay fixed (speed 0) until the meal.
- The attempt starts on the first tick, and the capture is the 40th contact tick.

Pinned at `:128`, `:144` and `:154`.

## Fix to stage 1's code (one)

**`src/sim/pairedRun.ts:57` (header) and the capture branch in `afterTick`.**
- `firstCaptureAt.SP` read `ev.tick / 10`. A record's tick is the tick that ran, so a capture on the 40th contact tick read 3.9, and E214's gate clause `firstCaptureAt ≥ 4` failed. I saw 3.9 before the fix.
- It now reads `(ev.tick + 1) / 10`. That is the dish clock once that tick has run, the same clock `seconds`, `extinctAt` and a gate's second use.
- The start tick counts as the first contact tick (D-0123), so 40 ticks means 4.0 s.
- No other test pinned a positive value: `measures-p5` pins only −1, and `measure-words-p5` only formats values.
- Measuring is observation, so no hash moves.

## Curated dishes, 600 s on their own seeds (this run; nothing promised)

**L302 (seed 302).**

| Time | A05 | A01 | Shaded cells (canopy factor < 1) |
|---|---|---|---|
| 60 s | 20 | 79 | 94 |
| 120 s | 39 | 233 | 142 |
| 240 s | 53 | 783 | 166 |
| 300 s | 39 | 952 | — |
| 420 s | 6 | 966 | 23 |
| 480 s | 0 | 947 | 0 |
| 600 s | 0 | 969 | 0 |

The canopy was recorded: up to 166 shaded cells at 240 s, and effective light down to 0.197 at 300 s. In this run the Raftballs died out by 480 s.

**L305 (seed 305).**
- Jackets were recorded: E11 carriers had jacketMineral > 0 from tick 1 (11 jacketed at 60 s, largest 0.41; 23 at 120 s).
- P10 never captured a P07. Both Needlejaws made 52 handling attempts, every one broken on 'contact', and both died of DEATH_STARVATION at 55.5 s and 55.6 s.
- The Dartfins made 191 captures, all of Sprinters.

| Time | B01 | P07 |
|---|---|---|
| 60 s | 82 | 23 |
| 120 s | 12 | 51 |
| 180 s | 0 | 7 |
| 300 s | 0 | 0 (nothing alive) |

Details are in `docs/reports/experiments-g5.md` § E213–E218, L302, L305.

## FENCE

- Added with `npx tsx tools/fence-update.ts --add` (1200 ticks):

  | Recipe | Digest |
  |---|---|
  | TEMPORARY_TRAP_V1 | 5f397c53b60510e5 |
  | SHELL_HANDLING_V1 | ab9e517d4714f62b |
  | FUNGAL_HITCHHIKER_V1 | 541b8ac345ead08a |
  | DIFFERENT_HOST_V1 | a949762c26f6d108 |
  | RIVAL_NO_WINNER_V1 | 24da801ffaa33390 |
  | NIGHT_SHIFT_V1 | 36c23b7a8b5275ab |
  | L302_UNDER_THE_CANOPY | facc10e3dc344926 |
  | L305_THE_JACKET_GARDEN | 5adf21ea083420aa |

  - A diff against my pre-add copy shows 72 added lines and 0 removed.
  - `git diff --stat tests/fixtures/fence.json`: 135 insertions = stage 1's 63 + my 72.
- Full fence command: "Test Files 1 failed | 10 passed (11); Tests 2 failed | 100 passed (102)".
  - g2-replay, rc1-replay, the four trajectory-fence files, conservation and both determinism files pass.
- **FENCE: `habitats-p5-equivalence.test.ts` fails on its key list only (stage 1's report already names this).** It walks every shipped recipe, and 15 phase 5 recipes are now extra `recipe:` keys.
  - A scratch run of `realizeGoldenEntries` restricted to the golden's 25 keys gave: "old keys 25 same order true moved(recorded list) 0 moved stateHash300(as shipped) 0".
  - So every old value is identical.
  - The fix (compare the golden's own keys) is the lead's.

## Mutant checks (by hand, reverted)

- **E214 without its overrides:** the gate is still reached on seed 214 (4.0 s, one capture, no break). The pair neither separated nor lost contact.
  - The P10 followed the slow P05 and stayed within 0.5 for 40 ticks. Both moved (probe positions changed every 5 ticks).
  - So seed 214 does not show that the override is necessary. The override is what guarantees the contact by rule.
  - The test at `:154` asserts that both positions stay fixed until the meal. Without the override they move, so that assertion fails.
- **E215's omitFounders on a group whose later group has no listed cells:** refused with "only the last founder group, or a group whose later groups all list their cells, can be omitted". This is now a permanent test at `:193`.
- **L305 with moduleAssignment 'all':** `curated.test.ts` fails with "Dartfin 2: expected [ 'E11' ] to deeply equal []" (1 failed | 10 passed).
- **firstCaptureAt before the fix:** E214's gate read 3.9, so the gate was not reached.

## Files

- **Created:**
  - 8 recipes and 6 cards (listed above);
  - `tests/experiments/e213-e218.test.ts`;
  - this report.
- **Changed (owned):**
  - `src/sim/pairedRun.ts` (the fix);
  - `tests/experiments/p5-recipes-determinism.test.ts`;
  - `tests/recipes/curated.test.ts`;
  - `tests/e2e/experiments-p5.spec.ts` (all 13 cards checked; E214 un-skipped);
  - `tests/e2e/experimentsP5Fixture.ts` (STAGE2_IDS);
  - `tests/e2e/curated-dishes.spec.ts` (L305 and L302 journeys);
  - `content/manifest.json` (contentHash only);
  - `tests/fixtures/fence.json` (`--add` only);
  - `docs/reports/experiments-g5.md` (appended section).
- **Shared, additive:** `tests/helpers/registry.ts` PHASE5_EXPERIMENT_RECORDS gains my 14 records (stage 1 asked for this). prompts-succession added PHASE5_OBJECTIVE_RECORDS beside them.
- **Re-pinned (shipped card lists my cards move):**
  - `tests/experiments/framework.test.ts`
  - `tests/experiments/app-flow.test.ts`
  - `tests/experiments/journal-and-words.test.ts`

## Proposed decisions

1. **PROPOSED DECISION:** E213 revision 2 adds the P04 as a scheduled inoculation at 0 s in the F03's cell. The reason: founders need distinct cells, revision 1's adjacent Siltworm never entered the trap's cell in 12 s, and CT says "one P04 at center".
2. **PROPOSED DECISION (owner flag per D-0131):** E214 revision 2 adds the P05 as a scheduled inoculation at 0 s in the P10's cell. The reason: distinct cell centres are 1.0 apart, beyond the 0.5 reach, and CT and D02 put both at (64,64). No rule change.
3. **PROPOSED DECISION:** `firstCaptureAt.SP` reads (record tick + 1) / 10, the dish clock after the capture tick.
4. **PROPOSED DECISION:** stopping points, all CT numbers or task-given:
   - E214 10 s.
   - E215 120 s, because a hostless parasite has no feeding route, so 120 s shows the zero as well as 180 s would.
   - E213 12 s, E216 180 s, E217 180 s and E218 240 s are CT.
5. **PROPOSED DECISION:** L305 founderMode 'identical', because CT names none, and Identical keeps the 6/6 split exact.
6. **PROPOSED DECISION:** E216's film patch carries filmN 0.02 (0.10 per C, the detritusN precedent), so the film has its bound nutrient as built film does.
7. **PROPOSED DECISION:** E215's F02 cells and X02 cells:
   - F02: (60,62), (63,62), (66,62), (60,66), (63,66), (66,66), (62,59), (65,59), (62,69), (65,69).
   - X02: each the east 4-neighbour of one of the first five F02 cells.
8. **PROPOSED DECISION:** E216 keeps CT's playerStep 'observeInfection'; E213, E214 and E218 list none.

## NEEDS and things noticed

- **NEEDS (lead):** the `habitats-p5-equivalence` key-list fix. My 8 recipes add to stage 1's 7 extra keys; no value moved.
- **NEEDS (lead/owner):** L305 on seed 305 has no Needlejaw capture. Both starve at about 55 s after 52 broken attempts, and the dish is empty by 300 s. So this run gives no "delayed capture" comparison. It is honest as a curated dish, but it may deserve a tuning look (`sim-tune` with more seeds).
- E214's override is not what makes seed 214 reach its gate (see the mutant check above). The override is still the documented guarantee.
- E217 reads `limitSeconds.B04.RIVAL_EXPOSURE` as instructed. It is always 0 (B04 is not a target), and the confounds say so.
- E216: every Velvet was infected and lysed by 180 s (alive.B02 0).
