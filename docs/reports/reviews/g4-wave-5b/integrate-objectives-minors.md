# g4 wave 5b integration: objectives minors (key objectives-minors)

Date: 2026-10-11. Nothing was committed. No git write was run. docs/DECISIONS.md was not edited.

**Result:** items 1, 2, 3 and 5 are DONE. Item 4 is DONE in my files except for one plumbing line in `src/persistence/saveFile.ts`. That file is not on my list, so I did not edit it. The hunk is below, and it is proven in a scratch copy.

The fence (g2-replay plus trajectory-fence) passes unchanged. No sim rule was added (D-0072): nothing in the tick imports `src/sim/objectives.ts`.

## Items

### 1. DONE: an error rollback has its own end reason, 'failed'

**The change:**
- `src/worker/host.ts`:
  - `restoreNotebook(d, cause)` is at :1321.
  - Undo passes `'undo'` (:767).
  - `rollback()` passes `'rollback'` (:2427). This covers both callers: the pump's step error and `handle`'s throwing request.
- `src/worker/goals.ts:95-121`: `goalsAfterRestore(world, record, cause)` writes `'undone'` for Undo and `'failed'` for a rollback.
- `src/persistence/notebookGoals.ts:39`: `GOAL_END_REASONS` gains `'failed'`. The validator accepts it, and older records still load (tested).

**The wording** reuses the error toast's own terms (`state.ts errorToastText`: "Something went wrong and the dish was paused: …"):
- `src/ui/strings/goals.ts:35`: "{title}: Something went wrong and the dish was paused, so this attempt ended."
- `src/ui/strings/goals.ts:42`: "Last goal: {title} — ended when something went wrong and the dish was paused."
- The sentence leaves out "The dish keeps going", because a dish stopped by an error stays paused (`d.failed`).
- `src/ui/goals.ts:135` and `lastGoalLine` (`strings/goals.ts:64-73`) choose these texts. Undo keeps 'undone' and its wording.

**Proving test:** `tests/worker/goals-host.test.ts:378`, "an error rollback while a goal runs ends it "failed" …". It covers:
- a step that throws (oxygen field removed, pump → rollback);
- a command that throws (`handle` → rollback);
- Undo, which still gives 'undone'.

**Shown failing without the fix:** mutant M1 (rollback passes `'undo'`) makes the test fail (`exit 1, 1 failed`). The file was restored, and `cmp` reported it identical.

### 2. DONE: a restore reports every kind that changed

**The change:**
- `src/worker/notebookWatch.ts:101-120`: `notebookAfterRestore(world, record, cause)` returns `{ record, changes: NotebookChange[] }`. The changes are in this order:
  1. `favoritesRestored`;
  2. `storiesRestored`;
  3. one `{ kind: 'goal' }` per ended goal.
- `host.ts restoreNotebook` sets `d.notebook` to the final record and posts each change as its own `notebookChanged`. Each one carries that same final record (`notebookChanges`).

**The favorites and stories UI is unchanged:**
- `favorites.ts onNotebookNotice` handles only `favoritesRestored` (the queue prune and the toast). For other kinds it only takes the record, which is the same record each time.
- `stories.ts` reads the record only.
- `goals.ts onGoalNotice` now receives its `'goal'` change and autosaves.
- One difference from before: when favorites and stories both changed, a `storiesRestored` change is now posted too. No UI listener acts on it beyond taking the record.

**Proving test:** `tests/worker/goals-host.test.ts:421`. The setup is Undo while KEEP runs, with a story card and a followed family from the undone time. The test checks:
- the posted kinds are exactly `['favoritesRestored','storiesRestored','goal']`;
- all three carry the same record;
- the goal is ended/'undone';
- the cards from the undone time are gone.

**Shown failing without the fix:** mutant M2 posts the goal change only when nothing else changed, as the old code did. The test fails, and the file was restored and checked with `cmp`.

### 3. DONE: the saved event position

**The change:**
- `src/sim/objectives.ts:104-111`: `ObjectiveProgress.lastEventId?` is the id of the last event-ring record the watch has seen.
  - Only event-ring goals carry it (`usesEventRing`, :158): observeEvent goals other than 'birth' and 'conversion'.
  - It is written by `progress()` (:451).
- On resume the watch starts from it (:411-421). A position that is not an integer from 0 up to `nextEventId - 1` throws `ObjectiveError`.
- A wave 5b record without the field resumes as before, from the load moment.
- The runner writes the position into the record whenever it changes (`src/worker/goals.ts:191`).
- The validator accepts it only on event-ring goals, as an integer ≥ 0 (`notebookGoals.ts:122`). The world check requires it below the dish's `nextEventId` (`:208`, which needs the item 4 plumbing).
- Birth and conversion goals keep a fresh observer at load. Commands never commit births or convert carbon, and the test below shows those goals are exact too.

**Proving tests:**
- `tests/sim/objectives.test.ts:473`. Every OBJECTIVE_EVENTS type (any species and B01, plus starch conversion: 39 watches) runs on FIRST_DISH_V1 for 400 ticks with a deposit at tick 13 and an inoculate at tick 27. Saving right after either command and reloading through JSON gives the same end tick for every goal as the uninterrupted run:
  - command at 14;
  - introduce:B01 at 28;
  - births and other records later.
- `tests/sim/objectives.test.ts:492`: a position the dish never reached is refused, and an old record without one resumes.
- `tests/worker/goals-host.test.ts:481` runs the same check through the runner and a real file (`buildSaveFile` → `loadSaveFile`):
  - the record keeps the last id seen at tick 13;
  - the record survives validation unchanged;
  - the goal completes at 14 after the load, as uninterrupted.

**Shown failing without the fix:**
- M14 (resume at `nextEventId - 1`, the old line) fails the sim test: `command` completes at 28 instead of 14.
- M13 (the same mutant) fails the runner test.
- M12 (the runner does not write the position) fails the runner test.
- All three files were restored and checked with `cmp`.
- **Note on M12:** a stale (older) position cannot change a completion tick. Any matching record before it would already have completed the goal. So M12 is caught by the assertion on the saved value, not by the completion tick.

### 4. DONE in my files; the import drop needs one line in saveFile.ts (not owned)

**World-refs check:**
- `src/persistence/notebookGoals.ts:173-212`: `goalsWorldProblem(raw, refs: GoalWorldRefs)` now checks each running goal against:
  - what the dish can run: `objectiveRefsProblem` (`src/sim/objectives.ts:322`), the same rule `objectiveSupportProblem` now uses, applied to the recorded manifest, species and allocated fields;
  - the saved event position.
- `GoalWorldRefs` is `NotebookWorldRefs` plus optional `{ manifest, fieldIds, nextEventId }`, which `goalWorldRefsOf(world)` (:185) provides.
- A finished record is not checked against what the dish can run (it never runs again).

**Runner fallback:** `GoalRunner.bind` no longer rewrites silently (`src/worker/goals.ts:154-170`). If a resume still fails, the attempt ends with the new reason `'cannotResume'`, with canonical progress. The change is queued and returned by the next `afterTick`, so the host posts it. The wording:
- "{title}: this dish could not resume this goal, so this attempt ended. The dish keeps going."
- "Last goal: {title} — ended: this dish could not resume it."

**The missing plumbing:** `notebook.ts worldRefsProblem` already passes `refs` through. `loadSaveFile` builds the refs with three fields only, so the new checks have no effect on a real file until this hunk lands (`tmp/objectives-minors/saveFile-plumbing.diff`):
```diff
 import { notebookIsEmpty, notebookWithoutNicknames, readNotebook, sealNotebook, type NotebookRecord } from './notebook';
+import { goalWorldRefsOf } from './notebookGoals';
@@ loadSaveFile
-  const { record, dropped } = await readNotebook(raw, world.worldId, { speciesIds: world.species.map((s) => s.id), nextBirthId: world.counters.nextBirthId, tick: world.tick });
+  const { record, dropped } = await readNotebook(raw, world.worldId, { speciesIds: world.species.map((s) => s.id), nextBirthId: world.counters.nextBirthId, tick: world.tick, ...goalWorldRefsOf(world) });
```

**Proving tests:**
- `tests/persistence/notebook.test.ts:521`, using `readNotebook`/`notebookProblem` with full refs:
  - The verifier's repro is a g2 `first-dish-t3000` dish with a running fieldInRange v01 goal (the g2 manifest has no viruses). It is refused with "a running goal cannot run in this dish (this dish has no v01)" and dropped with `NOTEBOOK_DROPPED_TEXT`.
  - A finished record of that goal is kept.
  - A position equal to `nextEventId` is refused.
- `tests/worker/goals-host.test.ts:457`: on the same dish the runner ends the goal 'cannotResume'. The record passes `goalsProblem`, and `afterTick` announces the change exactly once.

**Scratch proof of the hunk** (the real file is untouched): `tmp/objectives-minors/saveFile.patched.ts` is swapped in for `@persist/saveFile` by alias (`tmp/objectives-minors/vitest.patched.config.ts`). Results through `loadSaveFile` and the host's importDish:
- the repro and a future event position are each dropped with `NOTEBOOK_DROPPED_TEXT`;
- the world loads with an equal stateHash;
- no goal is left, and no goal change is posted;
- a position in the past still loads and runs.

`tsc` on the patched copy (`tmp/objectives-minors/tsconfig.patched.json`) is clean.

**Without the hunk (current tree):** `tmp/objectives-minors/repro.probe.ts` shows the notebook loads, the goal ends `cannotResume` at the first step, and one `{kind:'goal'}` change is posted. It is no longer relabelled 'undone', and the change is no longer silent.

**Shown failing without the fix:**
- M10 (no support check) and M11 (no event-position check) each fail notebook.test.ts:521.
- M3 (the old fallback: 'undone' and no change) fails goals-host:457.
- All files were restored and checked with `cmp`.

### 5. DONE: canonical records and a stricter validator

**Runner** (`src/worker/goals.ts`):
- `progress.state` is 'running' only while the attempt runs, 'completed' when it completed, and 'ended' otherwise. This covers:
  - `endedRecord` (:98) for undone, failed and cannotResume;
  - Leave of a running goal (:262);
  - Continue freely on an ended attempt.
- A value is written only for a completion or the zero that ended a keep goal.

**Validator** (`src/persistence/notebookGoals.ts:106-157`) now refuses:
- a progress state that does not fit the record (`progressStateFits`, :139), for example completed with progress 'running';
- an end tick before the start, unless the reason is undone, failed or cannotResume;
- a `holdSinceTick` on a goal type that takes no duration;
- a value on a running goal, or on any record other than a completion or a zero end;
- `shown: true` on a running goal;
- `lastEventId` on a goal that is not an event-ring goal.

**Legacy records:** what the wave 5b build wrote in its normal flows is accepted as written. That build left progress 'running' after Undo ('undone') and after Leave ('left'), and kept it when such an attempt was continued freely.

**Proving tests:**
- `tests/persistence/notebook.test.ts:470` loads every wave 5b normal-flow shape:
  - running keep and running split;
  - completed split and completed keep;
  - ended zero, including no Sprinters at Start;
  - continued freely after zero;
  - Undo before the start, with legacy progress;
  - continued freely after Undo;
  - left while running, with legacy progress.

  It also loads this build's new shapes.
- `:496` refuses 13 inconsistent records, including the verifier's four. Each is dropped with `NOTEBOOK_DROPPED_TEXT`.
- `tests/worker/goals-host.test.ts:527` runs left, completed, undone then continued freely, and running. The test checks:
  - the progress states are `ended`, `completed`, `ended` and `running`;
  - `goalsProblem` is null;
  - after save → load the notebook is not dropped and the records are equal.

**Shown failing without the fix:**
- M4 (Leave keeps progress 'running') and M5 (restore keeps progress 'running') fail goals-host:527.
- M6 (no state/progress check), M7 (hold on any type), M8 (shown on running) and M9 (no end-before-start check) each fail notebook.test.ts:496.
- All files were restored and checked with `cmp`.

## PROPOSED DECISIONS
- **PROPOSED DECISION:** an error rollback while a goal runs ends it with endReason `'failed'` (Undo keeps `'undone'`), in the error toast's own words:
  - "{title}: Something went wrong and the dish was paused, so this attempt ended."
  - More: "Last goal: {title} — ended when something went wrong and the dish was paused."

  There is no "keeps going", because a failed dish stays paused. The name matches the experiments' `'failed'` for the same moment.
- **PROPOSED DECISION:** a running goal that a reopened dish cannot resume ends with `'cannotResume'`, never relabelled as Undo, and its change is announced at the next tick. The file check refuses such a record first, once the saveFile hunk lands.
- **PROPOSED DECISION:** `notebookAfterRestore` returns a list of changes in the order favoritesRestored, storiesRestored, goal…. The host posts each as its own `notebookChanged` carrying the final record. A restore that changes both favorites and stories now also posts `storiesRestored`; before, only `favoritesRestored` was posted.
- **PROPOSED DECISION:** event-ring goals save `progress.lastEventId`, the last ring record the watch has seen.
  - It is written whenever it changes and validated as an integer ≥ 0, and for a running goal as below the dish's `nextEventId`.
  - A resumed watch counts the records after it, so a save → load at any moment completes at the uninterrupted tick for every accepted event type.
  - Records without it resume from the load moment.
- **PROPOSED DECISION:** goal records are canonical. Progress state is 'running', 'completed' or 'ended' after the record, and a value appears only with a result. The validator refuses inconsistent records but accepts the wave 5b legacy shapes: progress 'running' after 'undone' or 'left'.
- **FOR THE LEAD:** apply the saveFile.ts hunk above (one import and `...goalWorldRefsOf(world)`). Then consider moving `tmp/objectives-minors/import.patched.probe.ts` into `tests/worker/goals-host.test.ts` as the host-level drop test.

## Files changed
- `src/sim/objectives.ts`
- `src/persistence/notebookGoals.ts`
- `src/worker/goals.ts`
- `src/worker/notebookWatch.ts`: `notebookAfterRestore` and its import only.
- `src/worker/host.ts`: `restoreNotebook` and its two callers only.
- `src/ui/goals.ts`
- `src/ui/strings/goals.ts`
- `tests/sim/objectives.test.ts`
- `tests/worker/goals-host.test.ts`
- `tests/persistence/notebook.test.ts`: additive (one describe, plus imports and header lines).
- This report.

Not changed:
- `src/worker/protocol.ts`: no change shape changed, because the change list is internal and each element is an existing `NotebookChange`.
- `tests/e2e/goals.spec.ts`: its texts are unchanged.

Scratch is in `tmp/objectives-minors/`:
- `orig/`: copies of the owned files before my edits;
- `mutants.py`;
- the patched saveFile and its configs;
- the probes;
- `logs/`.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: exit 0, run after the last edit.
- `npx eslint` on the 10 changed files: exit 0. An earlier run found 6 errors, all of them unnecessary assertions or a stringification; I fixed them.
- `npx vitest run tests/sim/objectives.test.ts -t "every event type"`:
  - first run failed on my own over-tight assumption: the birth goal completes at 244 with the commands, not 351;
  - after relaxing that assertion: "Tests 2 passed | 17 skipped".
- `npx vitest run tests/persistence/notebook.test.ts -t "goal records"`: "Tests 3 passed | 21 skipped".
- `npx vitest run tests/worker/goals-host.test.ts -t "integrate"`:
  - first run had 2 failed tests, both test errors: a posted record compared with a materialized `notebookGet`, and a slot id 's' instead of 'slot1';
  - after fixing them: "Tests 4 passed"; later "1 passed" for the event-ring test.
- **Final set:** `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/sim/objectives.test.ts tests/worker/goals-host.test.ts tests/persistence/notebook.test.ts tests/content/objectives.test.ts tests/worker/favorites-host.test.ts tests/worker/stories-host.test.ts tests/worker/protocol.test.ts` gave **"Test Files 12 passed (12), Tests 146 passed (146)"**, exit 0, in 484 s.
- `python3 tmp/objectives-minors/mutants.py`:
  - M1–M11, M13 and M14 each exit 1 (the targeted test fails);
  - M12 survived its first two test versions; once the test asserted the saved id, it exits 1;
  - every run reported `restored=True` (cmp).
- `npx vitest run --config tmp/objectives-minors/vitest.patched.config.ts` (the patched saveFile probe): "Tests 1 passed (1)".
- `npx vitest run --config tmp/objectives-minors/vitest.config.ts repro.probe.ts` (current tree): "Tests 1 passed". The output shows `cannotResume` plus one posted change.
- `npx tsc -p tmp/objectives-minors/tsconfig.patched.json --noEmit`: exit 0.
- **e2e:** `E2E_PORT=4282 E2E_OUTDIR=tmp/dist-objectives-minors npx playwright test tests/e2e/goals.spec.ts --project=desktop --project=phone-portrait` gave "2 passed (1.4m)". Port 4282 was stopped before and after with `lsof -t -i :4282 | xargs -r kill`.
