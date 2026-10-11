# g4 wave 5b integration: adversarial verify (round 1)

**Scope:** the integration changes, meaning the tree diff from d0c3c69 (wip/g4-wave-5b) to the current working tree. I built the comparison tree from a temporary index with `git add -A`; it is recorded in `tmp/integrate-verify-5b-1/tree`. I excluded docs/DECISIONS.md, docs/agent/** and docs/reports/**.

The changed files are:
- `src/persistence/notebookGoals.ts`, `src/sim/objectives.ts`, `src/ui/goals.ts`, `src/ui/stories.ts`
- `src/ui/strings/goals.ts`, `src/ui/strings/stories.ts`
- `src/worker/goals.ts`, `src/worker/host.ts`, `src/worker/notebookWatch.ts`
- the four test files and `tests/e2e/stories.spec.ts`

The integration does **not** touch `src/persistence/saveFile.ts` or `src/ui/views/Notebook.tsx`. I edited no repository file except this report and ran no git write. Scratch files are in `tmp/integrate-verify-5b-1/`.

**Result: ok.** No BLOCKER or MAJOR remains. Two parts of the assignments are not wired (both [lead], MINOR), and there is one test gap (MINOR) and one NIT.

## Problems (most severe first)

1. **MINOR [lead] src/persistence/saveFile.ts:578 — objectives item 4 is only half in effect: the file check still accepts a running goal the dish cannot run.**
   - **What is wrong:** `readNotebook` is still called with `{speciesIds, nextBirthId, tick}` only. It does not pass `goalWorldRefsOf(world)`, so `goalsWorldProblem` never runs `objectiveRefsProblem` or the saved-event-position check at load. The fixer reported this hunk as needed and the lead has not applied it.
   - **Effect on the player:** honest but not what the item asked for. The goal ends 'cannotResume' and one `{kind:'goal'}` change is posted at the first step, with the sentence "…this dish could not resume this goal…". The item asked for the notebook to be dropped whole with `NOTEBOOK_DROPPED_TEXT`. No false claim and no silent rewrite remain.
   - **The unit test misses it:** `tests/persistence/notebook.test.ts:521` passes the extras to `readNotebook` directly, so it never exercises the production path.
   - **Repro:** `tmp/integrate-verify-5b-1/probe/host.probe.ts`, "import validation edge cases". This is the saves verifier's repro, unskipped.
     - A running `fieldInRange {field:'v01'}` goal in g2 `first-dish-t3000` gives `loadDropped=null hostDropped=null after=[["ended","cannotResume",3000,"ended"]] changes=[{"kind":"goal","id":"goal-1","state":"ended"}]`.
     - A running `observeEvent {event:'command'}` goal with `lastEventId: 1e9` gives the same result.
   - **Fix:** apply `tmp/objectives-minors/saveFile-plumbing.diff`: import `goalWorldRefsOf`, then spread `...goalWorldRefsOf(world)` into the refs. Add a host-level import test for it, such as the fixer's `tmp/objectives-minors/import.patched.probe.ts`.

2. **MINOR [lead] src/ui/views/Notebook.tsx:65 (and src/ui/stories.ts:93) — stories item 1's "Back from the Notebook restores the speed" is not wired.**
   - **What is wrong:** the Notebook's Back still sets `route.value = { name: 'home' }`. `leaveNotebook()` exists and is unit-tested, but nothing in the app calls it, so it is dead code.
   - **What does work:** Spotlight restores the speed. Back leaves the dish paused, which is today's D-0028 behaviour and honest.
   - **Stale comment:** `Notebook.tsx:5` still says "Opening the Notebook never pauses or changes a dish". That is false: D-0028 pauses the dish.
   - **Repro:** on the Garden at 4×, wait for the story notice, press Open, then the Notebook's Back. Home shows and the dish stays paused. `grep -rn leaveNotebook src` lists only its definition in `stories.ts`.
   - **Fix:** wire Back as the fixer proposes (`if (!leaveNotebook()) route.value = { name: 'home' }`, with the label "Back to the dish" during a story visit), or rule in DECISIONS that Back keeps going Home. Then fix the comment.

3. **MINOR [objectives-minors] src/ui/goals.ts:135-136 — the notice sentence for the new end reasons has no test.**
   - **What is wrong:** `goalSentence` picks `GOAL_TEXT.failed` and `GOAL_TEXT.cannotResume`. The item 1 test (`goals-host.test.ts:395`) checks `GOAL_TEXT.failed(...)` and `lastGoalLine`, but never `goalSentence`.
   - **Why it matters:** the notice sentence is the one the item names ("the player reads…"). Without these branches, a 'failed' KEEP goal would fall through to the content `endedText`, "No Sprinters remain, so this attempt ended at {time}. The dish keeps going.", which states a cause that was not recorded.
   - **Repro:** mutant O8 deletes the `'failed'` line at `ui/goals.ts:135`. `npx vitest run tests/worker/goals-host.test.ts -t "error rollback"` then still gives 1 passed, exit 0. The file was restored and checked with cmp.
   - **Note:** the code is correct today. This is a coverage gap only.

4. **NIT [objectives-minors] src/sim/sample.ts:348 vs src/persistence/notebookGoals.ts (goalsWorldProblem) — a saved `lastEventId` assumes event ids never go backwards.**
   - **What is wrong:** `cancelSample` pops the take's `command` events and decrements `nextEventId`. If a ring goal's saved `lastEventId` had already passed such an id, the save check would refuse the record ("saw an event this dish never had"), and the resume would throw.
   - **Why it is not reachable now:**
     - A held sample keeps time paused (`host.ts` pump), and the runner evaluates only new ticks. The watch therefore never reads the take's event before a Cancel.
     - No shipped objective is an event-ring goal.
   - **When it matters:** a later phase (custom goals) should keep this invariant in mind. No action is needed now.

## Item by item

### objectives-minors
1. **Error rollback gets its own end reason ('failed') — DONE.**
   - `host.ts:767` passes 'undo' and `host.ts:2427` passes 'rollback'. `goals.ts` `goalsAfterRestore` / `endedRecord` set the reason.
   - The wording is honest. It reuses the error toast's terms (`state.ts:208` "Something went wrong and the dish was paused: …"). Both rollback callers (`handle` at :637 and `pump` at :2452) set `speed=0` and post `paused: true`, so "the dish was paused" is true. It drops "keeps going", which is right.
   - Mutant O1 (the rollback passes 'undo') fails the item 1 test. The coverage gap is problem 3 above.
2. **Restore reports every kind that changed — DONE.**
   - Changes are posted in the order favoritesRestored, storiesRestored, goal. Each carries the final record.
   - The UI listeners are unchanged in effect:
     - `favorites.ts` takes the record and toasts only on favoritesRestored.
     - `stories.ts` reads `notebook`.
     - `ui/goals.ts` autosaves on 'goal'.
   - Mutant O2 (the old "goal only when nothing else changed" rule) fails the goals-host test at :421.
3. **Saved event position — DONE.**
   - The verifier's repro now gives `command: uninterrupted 14, reloaded 14` and `introduce B01: uninterrupted 14, reloaded 14`. Before the fix the reloaded run gave null.
   - My added probe saves before or after the command at every tick from 10 to 13. All 8 runs complete at 14.
   - Mutant O3 (resume from `nextEventId - 1`) fails `objectives.test.ts` "each goal completes at the same tick".
4. **Goal support checked at import — the code is done, but it is not wired in saveFile** (problem 1).
   - The runner never rewrites a record silently: it ends the goal 'cannotResume' and announces it.
   - Mutant O4 (no support check) fails notebook.test :521. Mutant O5 (no announcement) fails goals-host :457.
5. **Canonical records — DONE.**
   - The inconsistent records from the saves verifier now drop the notebook with `NOTEBOOK_DROPPED_TEXT`, and the world loads with the same stateHash (asserted in my probe). They are:
     - completed with progress 'running';
     - completed with endTick < startTick;
     - holdSinceTick on observeEvent;
     - a value or shown:true on a running goal;
     - a hold that started before the goal.
   - My extra cases also drop: `lastEventId` on a birth goal, and continuedFreely with progress 'completed'.
   - Mutant O6 (`progressStateFits` always true) fails notebook.test :496. Mutant O7 (leave writes a non-canonical progress) fails goals-host :527.

### Wave 5b saves still load (checked with files the d0c3c69 build itself wrote)
- **Method:** I extracted d0c3c69 with `git archive` into `tmp/integrate-verify-5b-1/old/` and drove its own DishHost (`old/probe/gen.probe.ts`). It wrote two .pixelmeba files whose notebooks hold:
  - 1 favorite and 7 story cards;
  - goals in these states: completed (shown), continuedFreely 'left' with progress 'running', continuedFreely 'undone' with endTick 400 < startTick 470 and progress 'running', completed starch with a value, and running KEEP;
  - a separate ended 'undone' record with endTick 300 < startTick 400.
- **In the integrated tree:**
  - `loadSaveFile` returns `notebookDropped === null`.
  - The goals, favorites and stories deep-equal the old notebook.
  - A host import followed by 100 ticks at 4× posts no goal change, leaves the finished records untouched, and keeps the running goal running.
  - A re-export loads again.
  - Leaving the legacy ended 'undone' record writes `continuedFreely` / 'undone' with progress 'ended', and that record round-trips.

### stories-minors
1. **Spotlight restores the pre-Open speed — DONE. Back from the Notebook — NOT wired** (problem 2).
   - Unit mutants each fail tests/ui/stories.test.ts:
     - S1: Spotlight does not restore.
     - S2: the visit never ends.
     - S6: the speed is recorded on any route.
   - The e2e spec passes on desktop and asserts setSpeed 4, the Pause label, 4× and the tick advancing after Spotlight. A card opened from the list keeps the dish paused with the same hash.
2. **Family card uses the Lineage sheet's "Game rules" — DONE.**
   - No line is called a tradeoff. The captions are pinned for the real story-8 card and include no benefit claim.
   - Mutant S3 (the old "Tradeoff:" caption) fails the test.
3. **Article and plural — DONE.**
   - Every shipped species name works with the vowel-letter article rule and `plural`: no "Eu…" or "U…" names, and "-a" becomes "-ae".
   - Mutants S4 (no plural) and S5 (no article) each fail the tests.

### Determinism and the fence
`src/sim/objectives.ts` stays outside the tick ("where the engine lives" test). The fence, the g2 replay and the determinism fixtures pass unchanged.

## Commands (summary lines)
- **Tree diff (temporary index):**
  - Integration diff: `git diff --stat d0c3c69 $T` → 19 files, +1481/−115.
  - After all mutants, the src/tests/content diff against the recorded tree was empty.
- **Typecheck and lint:**
  - `npx tsc -p tsconfig.json --noEmit` → exit 0.
  - `npx eslint` on the 14 changed src and test files → exit 0.
- **Unit tests:** `npx vitest run tests/sim/objectives.test.ts tests/worker/goals-host.test.ts tests/persistence/notebook.test.ts tests/ui/stories.test.ts tests/worker/stories-host.test.ts tests/worker/favorites-host.test.ts tests/content/objectives.test.ts tests/ui/favorites.test.ts` → Test Files 8 passed (8), Tests 106 passed (106), exit 0.
- **Fixtures:** `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/determinism.test.ts` → Test Files 6 passed (6), Tests 55 passed (55), exit 0.
- **Old-tree generator:** `(old/probe) npx vitest run --config vitest.config.ts` → 2 passed. The first two attempts failed on probe setup: a missing tools/ directory, then `exportDish` being asynchronous.
- **Probes:** `(probe) npx vitest run --config vitest.config.ts --silent=false --reporter=verbose` → Test Files 2 passed (2), Tests 6 passed (6). One earlier run failed on a bug in my own probe: it resumed a goal that had already completed.
- **Mutants:**
  - `python3 tmp/integrate-verify-5b-1/mut/mutants.py S1 S2 S3 S4 S5 S6 O8`: S1–S6 each exit 1 (1–2 tests failed), all restored=True. O8 exits 0 (it survives: problem 3), restored=True.
  - `python3 tmp/integrate-verify-5b-1/mut/mutants.py O1 O2 O3 O4 O5 O6 O7`: each exit 1 with the targeted test failing, all restored=True. Each file was checked with `filecmp` byte for byte.
- **e2e:** `E2E_PORT=4391 E2E_OUTDIR=tmp/dist-integrate-verify-5b npx playwright test tests/e2e/stories.spec.ts tests/e2e/goals.spec.ts --project=desktop` → 2 passed (1.8m), exit 0. Port 4391 was stopped before and after, and is free.
