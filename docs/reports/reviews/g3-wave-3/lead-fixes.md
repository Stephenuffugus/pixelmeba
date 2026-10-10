# g3 wave 3 — lead integration fixes

Result: every item is DONE. The fence, replay and conservation tests pass unchanged.

## Items

1. **DONE: stale FLAG.moving / FLAG.hunting.** `src/sim/movement.ts:373`. An organism that is not self-propelled now has `FLAG.moving | FLAG.hunting` cleared at the stage 4 gate before `continue`. `speed <= 0` and attached organisms keep the old gate.
   - Fence: unchanged. In a world without modules, only `applyStep` and `moveToward` set these flags, and both run only for self-propelled organisms. The birth-reconciliation alternative was not needed.
   - Test: the "module loss" test in `tests/fixtures/module-e07.test.ts:316`. It swaps the genome on a tick the carrier moved and asserts the flag is set first. It then darkens the dish so no feeding chip can hide the flag. After 100 ticks it asserts the moving and hunting flags are 0 and `actionLabel(...)` is not "Moving".
   - Proof: with the fix line removed (temporary edit, then restored and grepped), the test fails: `expected 64 to be +0` (64 is FLAG.moving).

2. **DONE: E07 light term.** New test `tests/fixtures/module-e07.test.ts:128`: "the light term picks the brighter of two brighter cells (+0.05 over +0.01), on either side".
   - Setup: five carriers ten rows apart. Each sits between a +0.01 cell and a +0.05 cell, and the bright side alternates.
   - Assertions: no carrier ever enters its dimmer cell, and each one ends in its bright cell.
   - Proof: the mutant `const F = foodScore(...)` (temporary edit, restored) fails with `expected 30 to be 31`.

3. **DONE: one lockout convention.** `src/sim/anchor.ts:97`. `lockedOut` is read before the countdown and used in the attach gate. A 10 s lockout now blocks ticks 1–100 after any detach. The attach clock counts from tick 101, and the carrier reattaches on tick 150, as E12 does. This holds for every detach path, because they all set `anchorLockout` in `detach()` from inside `anchorStep` after the countdown. The header comment of anchor.ts is updated.
   - Tests: `expectLockoutThenReattach` (`tests/fixtures/module-e04.test.ts:127`) now pins ticks 1–100 as blocked. It asserts `anchorSeconds` is 0 on tick 100 and about 0.1 on tick 101, and that the reattach happens on tick 150. The Resting test now expects `70 + 50`, which was `69 + 50`.
   - Proof: the old gate (`c.anchorLockout[i]! > 0`, temporary edit, restored) fails 4 tests: the clock, stone and energy cases with `expected 0.1 to be +0`, and the Resting case with `expected 119 to be 120`.

4. **DONE: E12 pairing state on import.** `src/persistence/saveFile.ts:479` (`adhesionStateProblem`), called at `:410`. Each refusal ends "Nothing was loaded.". The import refuses:
   - non-zero pairing state on a dead slot;
   - any pairing state in a dish with no recorded E12;
   - pairing state on an organism whose genome lacks E12;
   - an `adhLockout` outside [0, lockoutSeconds + 1e-9];
   - an `adhSeconds` below 0, or above linkSeconds + maxLinks × dt + 1e-9;
   - an `adhPartner` that is non-integer or at or above `counters.nextBirthId`. The column is u32, so a negative value cannot be stored at all.
   - A partner whose birthId was issued but who is now dead is accepted.

   Tests are in the new file `tests/persistence/adhesion-import.test.ts` (6 tests):
   - every tamper case gets the exact refusal message;
   - the edge values still load: a lockout of exactly 10 and a partner of nextBirthId − 1;
   - three untampered saves load and match the original world's stateHash after 50 more ticks: one mid-pairing, one during a lockout, and one whose partner died of age after the pairing check.
   - Proof: with the `fail` call disabled (temporary edit, restored), the two refusal tests fail, because the load succeeds.

   **What the sim can leave (checked in adhesion.ts, births.ts, maintenance.ts, contacts.ts, sample.ts and entities.ts):**
   - Dead slots are always clear. `ents.free` → `clearSlot` empties every column, and every removal path goes through `free` (killEntity, consumePrey, sample take and discard).
   - Organisms without E12 always hold 0. Only `pairable` (which requires the module) and the break paths write these columns. The ends of a link always carry E12. A genome changes only at division, and `onAdhesionDivision` clears the retained daughter. The new daughter's slot starts cleared, and births.ts copies no adh* column into it.
   - **The clock can go past linkSeconds.** In `formAdhesionLinks` step 3, a proposed pair is skipped with `continue`, and **no clock reset**, when an earlier link in the same pass spent one end's energy below minEnergy. The spent end was already reset by its own link, but the other end keeps a clock of linkSeconds. If the pair is proposed again next tick and skipped again, the clock reaches linkSeconds + dt. This repeats at most once per link the spent end can still gain. So I did **not** use a plain `> linkSeconds` refusal. The bound is linkSeconds + maxLinks × dt (5.2 s for the shipped numbers), which is one dt above what I derived, as a margin.
   - Suggested follow-up, not done because it changes sim behaviour: reset both ends' clocks on that skip as well. A strict `≤ linkSeconds` check would then be safe.
   - A partner birthId that was issued but is no longer alive is real save state. Example: the partner dies in stage 7 or 8 after the stage 5 check. The test covers it.
   - Not added (not asked): the same adh* checks on held-sample rows (`savedSampleProblem`).

5. **DONE: incomplete module records.** `src/persistence/saveFile.ts:288`. After the ModuleSchema pass, `missingModuleParams` runs for every recorded module. A missing parameter is refused with `"<id>: recorded parameter <name> is missing. Nothing was loaded."` (kind `content`).
   - Test: the last test in `tests/persistence/adhesion-import.test.ts`. It deletes `E12.params.linkDistance` and re-stamps the checksum. `loadSaveFile` must throw that exact message. Through `DishHost` `importDish`, it checks for an error reply, no imported dish, an unchanged stateHash for the open dish, and that the active dish is still `open`.
   - Proof: without the check, the file loaded (`expected {file, world} to be an instance of SaveFileError`).

6. **NITs: DONE.**
   - a. `src/sim/publish.ts:50`: comment only.
   - b. `src/ui/panels/Inspector.tsx:129`: `transferText` prints "less than 0.001" for any amount that `toFixed(3)` would show as "0.000". `tests/e2e/cordweaver.spec.ts` pinned the number format, so its regex now also accepts "less than 0.001". The sentence lives in Inspector.tsx, not in a strings file.
   - c. `src/ui/strings/tools.ts:62` now reads: "Discard the held sample? Its material and organisms leave the dish (logged as removed). Undo brings the sample back." No spec pins this string.
   - d. `src/sim/sampleSlot.ts:301,387,403`: all three `6000` became `AGENT_CAP`.
   - e. `src/sim/entities.ts:224`: comment only.

## Files changed
- src/sim/movement.ts
- src/sim/anchor.ts
- src/persistence/saveFile.ts
- src/sim/publish.ts
- src/ui/panels/Inspector.tsx
- src/ui/strings/tools.ts
- src/sim/sampleSlot.ts
- src/sim/entities.ts
- tests/fixtures/module-e07.test.ts
- tests/fixtures/module-e04.test.ts
- tests/persistence/adhesion-import.test.ts (new)
- tests/e2e/cordweaver.spec.ts

## Commands
- `npx tsc -p tsconfig.json --noEmit` → exit 0.
- `npx eslint <the 12 files above>` → exit 0.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/module-e04.test.ts tests/fixtures/module-e07.test.ts tests/fixtures/module-e12.test.ts tests/persistence` → `Test Files 15 passed (15)`, `Tests 135 passed (135)`, 330 s. This covers the new adhesion-import test.
- `E2E_PORT=4241 E2E_OUTDIR=tmp/dist-leadfix npx playwright test tests/e2e/cordweaver.spec.ts --project=desktop` → 1 passed (1.8 m). Port 4241 was stopped before and after.
- Mutant runs, each a temporary edit that was restored and grepped back:
  - item 1 → 1 failed;
  - item 2 → 1 failed;
  - item 3 → 4 failed;
  - items 4 and 5 → 3 failed.

## Surprising
- Item 4: E12's pairing clock can be saved above linkSeconds (see above). The D-0058 wording "a clock outside [0, linkSeconds]" should read "[0, linkSeconds + maxLinks × dt]", or the sim should reset the clock on that skip.
- Item 5: before this fix, a save with an incomplete E12 record loaded successfully, and its first tick would throw.
