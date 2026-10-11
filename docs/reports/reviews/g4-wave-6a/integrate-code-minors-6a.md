# g4-wave-6a integration: code-minors-6a

Agent key: code-minors-6a. Date: 2026-10-11. Scope: five MINOR findings from wave-verify.md and wave-reverify1.md. Nothing under src/sim/** or content/** changed. docs/DECISIONS.md was not edited. No git write command was run. Scratch files are in tmp/code-minors-6a/.

How the "fails without the fix" proofs were run: every mutant is load-time only. No repository file was changed to make them.
- Unit mutants: tmp/code-minors-6a/mutant.config.ts. MUT=<name> rewrites one module's source as vitest loads it. Each rewrite must match exactly once, otherwise the run throws. Each run printed MUTANT_LOADED.
- E2E mutants: tmp/code-minors-6a/vite.mutant.config.ts. This is the real build with the same kind of transform, built to tmp/dist-code-minors-6a-mut-<name>, served on port 4282 and run with Playwright.

## Items

1. DONE [share] The Share sheet blocks every dish key.
   - Code: src/ui/share.ts:97 `shareSheetKey(key)`. While `sheet === 'share'` it takes every key. Esc runs `closeShare()`, which restores the prior run state once. It calls no preventDefault, so the sheet's own field, radios and Tab still work.
   - Wiring: src/ui/views/DishScreen.tsx:181 calls it right after the trySetup branch, the same way that branch is wired.
   - Unit test: tests/ui/share.test.ts:213. The test opens the sheet at 2×, which pauses the dish. Space, 1, 2, 4, '.', u, U, +, -, =, arrows, i, l, f, Enter and Tab are all taken, and setSpeed is never called. Esc closes the sheet and sends setSpeed(2) once.
   - E2E test: tests/e2e/share.spec.ts:339. This reads the worker's own snapshots (speed and tick). Space 1 2 4 . u U Space under the sheet leave the speed and tick unchanged. The question field still takes "1 2.4". Esc gives speed 2 and the dish runs.
   - Passed on desktop and on phone-portrait. On the phone the same keyboard path is used and the sheet still blocks.
   - Without the fix: unit MUT=shareKeys gives "1 failed" (`expected false to be true`). E2E MUT=shareKeysUi (DishScreen's line removed) gives "✘ … share.spec.ts:339 (desktop)" (`expect(received).toEqual(expected)`: the worker's run state changed).

2. DONE [share] A refused import shows exactly one toast, in the UX §5.11 form.
   - Text: src/ui/strings/share.ts:72 `importFailedText(reason)` gives "Import failed: {exact reason}. Nothing changed.".
   - The reason text is kept word for word. A version refusal keeps "This recipe needs a compatible build ({versions})." as its reason. The reason's own closing "Nothing was loaded." or "Nothing was changed." is dropped so it is not said twice.
   - Global toast: src/ui/state.ts:235 now skips the 'importDish' and 'recipeImport' requests. src/ui/state.ts:222 gives errorToastText the same words for both requests.
   - importFile: src/ui/state.ts:498 shows the one toast for every refusal, whether a save file or a recipe file, from Saved dishes or More. Play has no file import, only Import recipe ID, which has its own panel line. The live region reads the toast once.
   - Unit tests: tests/ui/share.test.ts:254 (texts). tests/ui/share.test.ts:276 runs the real importFile through the real SimClient: the worker's 'error' notice and the request rejection both arrive, and exactly one toast is shown for a save refusal and for a recipe refusal.
   - E2E test: tests/e2e/share.spec.ts:374 covers Saved dishes with no dish open and More on an open dish, each with a broken save and a broken recipe file. It checks the exact toast and that the live region read exactly one text. On the dish screen the worker hash is unchanged.
   - Updated assertions: tests/e2e/whatif.spec.ts:363-368 (exactly one refusal toast), tests/e2e/new-dish.spec.ts:196 and tests/e2e/observe.spec.ts:422.
   - Without the fix: unit MUT=importToasts (the old onError, errorToastText and importFile catch) gives "2 failed" (`expected 'Nothing was paused or changed: This i…' to be 'Import failed: This is not a Pixelmeb…'`). E2E MUT=importToastsUi gives "✘ … share.spec.ts:374 (desktop)".

3. DONE [observation-map] The map intro now says what the map shows.
   - Code: src/ui/strings/observe.ts:62-63. New text: "Arrows show only what this dish recorded: which species ate, caught, infected, attached to, burst or drained another, which turned one food into another, and which fed from a food pool. Nothing is drawn for what was not recorded."
   - No repository test pinned the old text (grep over src and tests). tests/ui/observe.test.ts is not mine to edit.
   - Scratch proof: tmp/code-minors-6a/map-intro.test.ts. It checks that the intro names every KIND_TEXT kind, conversions, food pools and "not recorded", and does not say "living things". It passes on the real tree. MUT=mapIntro (the old text) gives "1 failed" (`expected 'Arrows show what this dish recorded p…' to contain 'attached to'`).

4. DONE [share] tests/persistence/share.test.ts reads the versions instead of pinning numbers.
   - Lines 126-133: the file's versions are compared with `registry().manifest`.
   - Line 240 on: the two version-mismatch cases are built from the manifest (+1).
   - tests/e2e/share.spec.ts: the "Needs simulation …" line now reads content/manifest.json.
   - Proof with a legitimate bump. MUT=versionBump makes the registry manifest say rules 2 and content 3. The new test gives "10 passed (10)". The old test (from d5a0c32) gives "2 failed | 8 passed": the versions toMatchObject and the 'simulation version' text both fail.
   - simulationVersion is `z.literal(3)` in src/sim/content/schema.ts:438, so bumping it needs a schema change anyway. A first mutant that bumped it failed manifest validation in both the old and the new test, so that mutant was not used as the proof.

5. DONE [try-my-dish] A kept turn forgets its slot after any notebook or journal change.
   - The worker clears `kept` (turnUnkept) after:
     - a stored journalPut: src/worker/host.ts:954-956
     - a storyMark: :1016-1018
     - an accepted favorite op: :1031-1036
     - an accepted goalStart or goalLeave: :1051-1059
     - a goalShown that changed the record: :1068-1069
   - The helpers are keptTurnMark and turnEdited (:2463-2476). They compare the canonical notebook and journal before and after, so a no-op does not clear `kept`. Examples of no-ops: a story card marked seen again, a sentence dismissed again, a refused op.
   - Worker safety net: when tryNext is refused 'unsaved' while the record still names a slot, the record forgets it (:2595).
   - UI safety net: src/ui/tryDish.ts:287 clears the card's kept line when the refusal is 'unsaved'.
   - Host test: tests/worker/try-dish-host.test.ts:356. It covers each path, each followed by "atHorizon, kept: null, announced as tryTurn, no new horizon card". It also checks the no-op cases keep the slot, the overwritten-slot safety net, and that kept-again then Another turn starts without Discard.
   - UI test: tests/ui/try-dish.test.ts, "a kept turn asks the worker…", which now also asserts kept: null after 'unsaved'.
   - Without the fix, each path was removed on its own and each run gives "1 failed": MUT=hostJournal (journalPut), hostFavorite, hostGoalShown, hostStory, hostGoal (goalStart), hostTryNext ("tryNext unsaved"), and uiUnsaved (`expected { slotId: 'slot1' } to be null`).

## Proposed decisions

- PROPOSED DECISION: The Share sheet is a blocking panel for keys, like What if? and Try my dish setup. While it is open no dish key acts. Esc is Close and restores the prior run state. Keys still reach the sheet's own controls (nothing is prevented).
- PROPOSED DECISION: Every refused file import shows one toast: "Import failed: {exact reason}. Nothing changed." The reason's own closing "Nothing was loaded." or "Nothing was changed." is dropped from the toast only, so it is not said twice. The worker's texts are unchanged. Keep-step refusals (the open dish could not be kept: slots full or a failed save) keep their own sheet and wording. They are not file refusals, and their texts already say nothing changed.
- PROPOSED DECISION: A kept Try my dish turn forgets its slot after any accepted change to what the slot file holds: a journal note, a Follow or favorite op, a goal start or leave, a goal sentence dismissed, or a story card marked. A no-op does not count. A tryNext refused 'unsaved' also clears the record's kept slot (worker) and the card's kept line (UI). The card then offers Keep this result again.
- PROPOSED DECISION: The relationship map intro wording is the text quoted in item 3.

## Files changed

- src/ui/share.ts
- src/ui/views/DishScreen.tsx (the import and one line in the key handler)
- src/ui/state.ts (the import; errorToastText's import case; the global onError skip; importFile's catch)
- src/ui/strings/share.ts
- src/ui/strings/observe.ts
- src/worker/host.ts (the kept-clearing calls and their two helpers)
- src/ui/tryDish.ts
- tests/persistence/share.test.ts
- tests/ui/share.test.ts
- tests/ui/try-dish.test.ts
- tests/worker/try-dish-host.test.ts
- tests/e2e/share.spec.ts
- tests/e2e/whatif.spec.ts
- tests/e2e/new-dish.spec.ts
- tests/e2e/observe.spec.ts
- This report.

## Commands

- `npx tsc -p tsconfig.json --noEmit`: exit 0, no output.
- `npx eslint` on the 15 changed files listed above: exit 0. One earlier run flagged 7 problems in my new host test; I fixed them and the re-run was clean.
- `npx vitest run tests/persistence/share.test.ts tests/ui/share.test.ts tests/ui/try-dish.test.ts tests/worker/try-dish-host.test.ts tests/worker/whatif-ui.test.ts tests/ui/observe.test.ts tests/worker/keep-dish.test.ts`: Test Files 7 passed (7), Tests 117 passed (117).
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence`: Test Files 5 passed (5), Tests 51 passed (51).
- `E2E_PORT=4282 E2E_OUTDIR=tmp/dist-code-minors-6a npx playwright test tests/e2e/share.spec.ts tests/e2e/try-dish.spec.ts tests/e2e/whatif.spec.ts:286 tests/e2e/new-dish.spec.ts:58 tests/e2e/observe.spec.ts:384 --project desktop --project phone-portrait`: 20 passed (15.0m). Port 4282 was stopped before and after.
- `tmp/code-minors-6a/mutants.sh` (unit mutants): every mutant MUTANT_LOADED=1 and each failed as listed above. The real-tree control for map-intro gave "1 passed".
- versionBump re-run (rules and content): new test "10 passed (10)", old test "2 failed | 8 passed (10)".
- `tmp/code-minors-6a/e2e-mutants.sh` (desktop): shareKeysUi failed "✘ share.spec.ts:339"; importToastsUi failed "✘ share.spec.ts:374". Port 4282 was stopped afterwards (`lsof -i :4282` shows nothing).
