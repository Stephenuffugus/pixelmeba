# g3 wave 3: verification 2 (mod-anchor-light, mod-feeding, mod-builders, mod-adhesion)

Verifier: adversarial wave verifier 2, 2026-10-01. Lens: rules, determinism, conservation, tests and player-facing truth.

**Result:** ok = true. I found no BLOCKER and no MAJOR in these four tasks. There are four MINOR items and one NIT.

**How I checked**
- I ran the gate tests myself.
- I tried 20 load-time mutants (`tmp/verify-g3-wave-3-1/mutant.config.ts` with `mutants.mjs`). No tracked file was edited. The tests caught 19 of them; the one survivor is MINOR 2 below.
- I reproduced one runtime problem with a scratch test (`tmp/verify-g3-wave-3-1/stale-moving.test.ts`).

## Problems (most severe first)

1. **MINOR [mod-anchor-light]** src/sim/movement.ts:371 (with :432): the inspector can say "Moving" for an organism that cannot move.
   - **What is wrong:** an organism that loses E07 keeps a stale FLAG.moving. The stage 4 gate `!prof.selfPropelled → continue` now skips it before anything clears the flag. E07's own clear (:432) only runs for carriers. The retained daughter keeps the parent's flags at division (births.ts `c.flags[i] = (c.flags[i] | justBorn) & ~capacityBlocked`). So a daughter that lost E07, on a tick when the parent moved, carries FLAG.moving forever. When it is not feeding (dark), `actionLabel` shows the chip "Moving" for a stationary Sunbead. This goes against the "every visible feature maps to real state" non-negotiable.
   - **Repro:** `tmp/verify-g3-wave-3-1/stale-moving.test.ts`. An A01 + E07 climbs a gradient until it moves; then its genome is swapped to one without E07 (as in the fixture's module-loss test) and it runs 100 ticks. Result: `moved 0, x unchanged, FLAG.moving true, chip "Moving"`.
   - **Fix:** clear FLAG.moving and FLAG.hunting at the selfPropelled gate (or at module loss in birth reconciliation). Add the flag check to the e07 "module loss" test.

2. **MINOR [mod-anchor-light]** tests/fixtures/module-e07.test.ts: no test proves that the light term drives E07's choice.
   - **What is wrong:** "F = effective light in 0.5·F + 0.4·S − 0.1·C" is never tested. Only the brighter-by filter is.
   - **Mutant:** replace `const F = seeker ? lightScore(world, cell) : foodScore(...)` with `foodScore` (movement.ts:242). For A01, F is then 0 for every candidate and the carrier picks a brighter cell by tiebreak. **All 10 e07 tests still pass** (`Tests 10 passed (10)`).
   - **Fix:** add a case with two brighter candidates (for example +0.01 and +0.05) where the carrier must go to the brighter one.

3. **MINOR [lead]** E04 and E12 count the same "10 s lockout" one tick apart.
   - **E04** (src/sim/anchor.ts:92–96) counts the lockout down at the start of `anchorStep`, then lets the attach clock count on the same tick. Counting is blocked on ticks 1–99 only, the clock starts on tick 100 and it reattaches on tick 149. The test helper `expectLockoutThenReattach` pins exactly this.
   - **E12** (src/sim/adhesion.ts step 4) counts down after the pairing check. That blocks 100 ticks and relinks on tick 150.
   - Both readings fit "10 s reattach lockout" (SPEC §9 E04, E12), but the two modules disagree. Pick one convention, log it in DECISIONS, and align the other module and its test.

4. **MINOR [lead]** (already in g2, not this wave; mod-feeding found it) src/sim/intake.ts:384–409: a plain photosynthesizer is never labelled LIGHT_LIMITED while light is above 0.
   - **Why:** its access is `C/budget = light × avail(CO2) < light`, so FOOD_ACCESS_LOW or a smaller fraction always wins. A dim Sunbead without E06 is told "not enough food here" rather than "too dark".
   - E06 carriers now get the right label through mod-feeding's PROPOSED decision 1, which leaves plain Sunbeads unchanged.
   - Fixing this for every photosynthesizer moves limitCode in the fence digest. That needs an owner decision in a change that updates the fence.

5. **NIT [mod-feeding]** src/sim/entities.ts:224: the comment still says "1 << 12 and 1 << 13 are reserved for … E04/E12". Bit 13 is now `detritusIntake` and bit 12 is unused (mod-builders' PROPOSED decision). The comment should say that.

## Out of scope, seen while checking (not graded here; owners are verified elsewhere)

`npx vitest run tests/fixtures/film.test.ts tests/ui/comprehension-labels.test.ts tests/ui/diet-line.test.ts tests/fixtures/registry-imports.test.ts` gives `Tests 4 failed | 29 passed (33)`:
- film.test.ts, 2 tests: its no-film world keeps F02 (f02-links).
- comprehension-labels M5: pins the old sugar-source sentence; F02 is now listed (f02-links or e1-producers).
- diet-line: the species list is missing the newly enabled species (e1-producers).

registry-imports passes after mod-anchor-light's E07 → E02 example change. These failures leave `npm run check` red until someone fixes them. They come from the manifest flips by other tasks, not from these four.

## VERIFIED OK

**Gates and checks**
- **Gate tests:** `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/module-e04.test.ts tests/fixtures/module-e07.test.ts tests/fixtures/module-e06.test.ts tests/fixtures/module-e08.test.ts tests/fixtures/module-e09-e10.test.ts tests/fixtures/module-e12.test.ts tests/fixtures/shared-budget.test.ts tests/fixtures/module-accounting.test.ts tests/sim/stage8-order.test.ts` gives `Test Files 15 passed (15)`, `Tests 157 passed (157)` (515 s on the shared CPUs). The g2 replay and all four trajectory-fence files pass, so the fence is unchanged.
- **Typecheck and lint:** `npx tsc -p tsconfig.json --noEmit` exits 0. `npx eslint` on the 27 source and test files of these four tasks exits 0.
- **Determinism scan:** no Math.random, Date, Map, Set or object-key iteration in anchor.ts, intakeClock.ts, lightSeeker.ts, adhesion.ts, debrisFeeder.ts, matrixBuilder.ts or the added lines of the shared files.
  - matrixBuilder's `WeakMap` is lookup only and observation only: never iterated, hashed or saved.
  - E12 resolves pairs with a numeric sort on (lower birthId, higher birthId) and draws no randomness. Contact kind 4 is documented as reserved.
- **Bit-identical paths for non-carriers:**
  - The `maintenance.ts` sums add exact zeros (`prof.upkeep + 0`, `(prof.m + prof.upkeep) + 0`).
  - `movementCost` returns the identical `MOVE_COST_PER_CELL * moved * motilityFactor` expression for non-E07 profiles.
  - The movement gate `prof.selfPropelled = sp.selfPropelled || lightSeeker !== null` equals the old gate for everyone else.
  - The E06 request keeps the old expression when `prof.shade === null`.
  - `secreting` keeps starch at 1.
- **Gated on the world's manifest, never a build constant:**
  - E12 through `world.modules.E12` (adhesion.ts `adhesionRules`).
  - E10 through `worldHasSystem(world, 'film')` and the allocated film field.
  - E04, E06, E07, E08 and E09 through the profile, which is derived from the world's recorded ModuleRT.
  - No manifest or version fields were edited by these four tasks. The `content/manifest.json` diff (B07, B08, F02, Y02) belongs to other tasks.
- **Save shape:** no schema bump was needed. The E04 and E12 columns (anchorState, anchorSeconds, anchorLockout, noUsableIntakeSeconds, adhPartner, adhSeconds, adhLockout, aLink*) already exist in schema 4 (D-0035, D-0043). `FLAG.detritusIntake` is a new bit in an existing column. No hard-coded stateHash literals were added.

**mod-anchor-light**
- **D-0035 clock:** `advanceIntakeClock` runs only for E04/E12 carriers, from `releaseInvalidLinks` before the E04 and E12 checks. Mutant "never resets" fails "the usable-intake clock…".
- **E04 rules match SPEC §9 E04:**
  - attach after 5 s at E > 35;
  - +0.10 E/s as 'upkeep';
  - detach at 10 s without usable intake, on lost support or at E < 15;
  - 10 s lockout, and Resting releases;
  - FLAG.attached is never set.
- **E04 mutants, each caught by a test:**
  - no Resting release: fails "resting releases…";
  - no support-loss detach: fails "detaches when its stone is erased…";
  - no rim support: fails "one rim cell supports";
  - zero upkeep: fails 3 tests;
  - no division reset: fails "division: both daughters…".
  - The builder's own mutants (gap reset, lockout, the 0.01 rule) also failed named tests.
- **E07:**
  - cost always charged: 4 tests fail;
  - per-cell cost kept for seekers: the cost test fails;
  - loci activated in phenotype, mutation and branch qualification: tested;
  - lineage lines: "moving costs {v} energy per second" and "senses light up to {v} cells away".
- **Shared edits are additive:** births.ts hook placement after rekeyLinks; moduleView E04/E07 cases; `UpkeepInspect.anchor`; snapshot cue bits (CUE2_ANCHORED from anchorState, CUE2_SEEKING_LIGHT from FLAG.moving on carriers). The renderer draws anchor_foot and light_trail only behind those state bits (render/features.ts:137,140).

**mod-feeding**
- **E06:** request `budget × 0.70 × min(1, light/0.35) × avail(CO2)` on the photosynthetic route only. The 0.70 stays out of Profile.q. Mutant without the ceiling factor fails 3 e06 tests.
- **E06 leading constraint:** compares the light response and reports the measured light (`limitValue = light` when LIGHT_LIMITED).
- **E08:**
  - the detritus route runs only after the held-meal check;
  - aerobic O2 comes from the shared `oNeed` path (`route !== PHOTO && aerobic`);
  - flag cleared with feeding at the start of stage 6;
  - cue packed only for carriers; the renderer pulses the granule only on CUE2_DETRITUS_INTAKE.
- **E08 mutants:** flag not cleared fails "FLAG.detritusIntake is set exactly on detritus ticks…"; request without avail() fails "eats local detritus only with an empty meal…".
- **Capture tick:** consumePrey puts `min(prey B, room) > 0` into mealC in stage 5, so stage 6 takes the meal route. The test checks that detritus and detritusN are unchanged.
- **Module card and chip:** text and the "Eating detritus" chip read recorded flags only.

**mod-builders**
- **Producer bit set:** starch 1, oil 2, protein 4; FLAG.secreting is the OR; persistence never validates `secreting`, and sim-tune counts `!== 0`. Mutant that writes protein as bit 1 fails 5 tests (the E09 cost test and the two-producer tests).
- **E09:** charges exactly 0.04 E per emitting tick.
- **E10:** request capped by `filmCap − film`; mutant without the film-cap check fails "each refusal…".
- **C08 numbers reproduce in shared-budget.test.ts:** 35.042 → 35.002 → 34.962, then E10 is refused. In the test-only order, E10 reserves 0.004 → 35.038 → 34.998, then E09 is refused.
- **Stage 8 table:** the SHIPPED pin is `[…natives…, module:E01:1, module:E09:9, module:E10:10]`. The structures.ts header documents where every other module acts.
- **E10 "active now":** observation only, empty after a reload, never on World.

**mod-adhesion**
- **Pairing (stage 5, after infection):** same species, Active, not attached and not anchored, E ≥ 20, out of lockout, degree < 2. Links on the 50th tick. Pairs resolve by sorted birthIds. 2 E each as 'other'; refusals cost nothing and emit 'linkRefused'.
- **Severance (release hook):** module loss, not Active, no usable intake for 10 s, E < 15, or more than 0.75 cells apart. Death and capture run `severOnRemoval` before `removeAllLinks`; division calls `onAdhesionDivision` after rekeyLinks.
- **E12 mutants, each caught by a test:**
  - no lockout: fails all 5 severance tests;
  - no E ≥ 20 gate: fails the E test;
  - no degree check at resolution: fails "degree cap…";
  - no death sever: fails the death and capture tests;
  - zero upkeep: fails 3 tests;
  - linked members still swim: fails 3 tests.
  - The builder's mutants (separation reset, component cap, division hook) also failed named tests.
- **Saves and determinism:** the 2,000-tick save round-trip, the save mid-pairing, the four-quarter run and the half-colony sample refusal all pass.
- **Module text:** says links share no food or energy (R17).
- **Scratch buffer:** the `canPair` buffer is sized to AGENT_CAP (6000).
