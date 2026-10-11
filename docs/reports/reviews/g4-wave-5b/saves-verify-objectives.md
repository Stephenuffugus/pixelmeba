# Saves and determinism check: objectives (P4.4, wave 5b)

Scope: saves and determinism only. I checked the uncommitted objectives work in the tree: `src/sim/objectives.ts`, `src/worker/goals.ts`, `src/persistence/notebookGoals.ts`, and the goal lines in `notebook.ts`, `notebookWatch.ts` and `host.ts`. The probes are in `tmp/verify-saves-0/` (`sim.probe.ts`, `host.probe.ts` and their logs). I edited no tracked file except this report.

**Result:** ok. There is no BLOCKER or MAJOR: two MINOR problems and one NIT.

## Problems

1. **MINOR [objectives] `src/sim/objectives.ts:370`: a resumed event-ring goal misses a command's events.**
   - **What is wrong:**
     - A watch resumed after a load sets `lastEventId = world.counters.nextEventId - 1`.
     - A command can emit events between the last evaluated tick and the save, for example `command`, or `introduce` from an inoculate.
     - Those events are skipped after the load. An uninterrupted run counts them at the next tick.
     - So "exact because evaluation is per tick" does not hold for the ring path.
   - **Who is affected:** none of the three shipped goals.
     - The birth, conversion and keepAlive paths are exact (see VERIFIED OK below).
     - The validator does accept these event types, though, and wave 6 (the P4.8 custom challenge editor) may expose them.
   - **Repro:** `tmp/verify-saves-0/sim.probe.ts`, block "event-ring goals". The run was `cd tmp/verify-saves-0 && npx vitest run --config vitest.config.ts tmp/verify-saves-0/sim.probe.ts`.
     - Start an `observeEvent {event:'command'}` watch on FIRST_DISH_V1.
     - Step 13 ticks.
     - Apply `deposit` with `applyNow`.
     - Run `buildSaveFile`, then `loadSaveFile`, then resume.
     - Result: the uninterrupted run completes at 14 and the reloaded run never does (null). `{event:'introduce', species:'B01'}` with an inoculate behaves the same way.
   - **Fix:** either of these.
     - Save the id of the last event seen in the goal's progress (an additive field).
     - Or, on resume, start from the last event emitted by a tick rather than by a command.

2. **MINOR [objectives] `src/worker/goals.ts:133-141` and `src/persistence/notebookGoals.ts:378-386`: a record the dish cannot run is relabeled instead of refused.**
   - **What is wrong:**
     - A running goal record can pass import validation even when the loaded dish cannot run it. `goalsWorldProblem` checks only species and ticks, not the recorded manifest or fields.
     - At the first `bind`, `ObjectiveWatch` throws. The runner then silently rewrites the record to `ended` / `endReason 'undone'` at the load tick, and posts no `notebookChanged`.
     - The UI then says "Undo rewound the dish, so this attempt ended", which is false.
   - **Repro:** `tmp/verify-saves-0/host.probe.ts`, block "import validation edge cases".
     - Take g2 `first-dish-t3000` and add a notebook with a running `fieldInRange {field:'v01'}` goal. The g2 manifest has no viruses system.
     - Load it: `notebookDropped=null`, and after 4 ticks the record is `["ended","undone",3000]` with no changes posted.
   - **Fix:** run `objectiveSupportProblem` (or the manifest and fields part of it) against the loaded world inside the notebook's world-refs check, so that the notebook is dropped with `NOTEBOOK_DROPPED_TEXT`.

3. **NIT [objectives] `src/persistence/notebookGoals.ts:344-349` and `src/worker/goals.ts:97, 231-233`: progress fields are not canonical.**
   - **What is wrong:**
     - The runner leaves `progress.state: 'running'` in records that are `ended` ('undone') or `continuedFreely`.
     - The validator therefore has to accept, and does accept, internally inconsistent records:
       - `completed` with `progress.state 'running'`;
       - `completed` with `endTick < startTick`;
       - a `holdSinceTick` on an observeEvent goal;
       - `value` and `shown: true` on a running goal.
     - It has no effect on the simulation or the hashes.
   - **Repro:** same probe block. All four records load with `notebookDropped=null`.

## VERIFIED OK

- **The builder's tests:** `npx vitest run tests/sim/objectives.test.ts tests/worker/goals-host.test.ts tests/content/objectives.test.ts` gave `Test Files 3 passed (3)` and `Tests 30 passed (30)`.
- **Fence:** `npx vitest run tests/fixtures/trajectory-fence tests/fixtures/g2-replay.test.ts` gave `Test Files 5 passed (5)` and `Tests 51 passed (51)`.
- **Content:** `npx tsx tools/content-validate.ts` prints `content ok · contentHash d3fbd36c…`, which equals `content/manifest.json`.
- **Split goal, file round trip at every tick around the commit:** the first division's milestone is m = 350.
  - For every save tick from 338 to 350 (including the whole seconds 340 and 350), I ran `buildSaveFile` → `loadSaveFile` and resumed with the saved progress.
  - Each run completes at 351, the uninterrupted tick.
  - `stateHash` at load equals the source, and at 351 it equals the reference.
- **Keep goal:** save → load through the file at 0 (Start), 351 (mid-second, right after the first commit), 999 and 1799 (right before it ends). Each completes at 1800, as uninterrupted.
- **Starch goal:** save → load at 0 and at 1. Each completes at 2, as uninterrupted.
- **1× and 4× through DishHost:**
  - The split goal runs from Start 0 to 351, and the keep goal from Start 400 to 2200.
  - At both speeds the goal records match and `stateHash` is `6e04116aa331fbee`.
- **Host `saveSlot` → `loadSlot`:**
  - At tick 0 right after `goalStart` (paused), and at 349 and 350, the goal reloads as running.
  - It completes with the same `endTick` and `value` as the reference, and the final `stateHash` is equal.
- **g2 saves continue bit-identically with a goal running:**
  - All 8 g2 saves were imported through the host.
  - The catalog offers the three goals on the 3 FIRST_DISH saves and none on the others. I started KEEP_SPRINTERS_GOING where it was offered.
  - After 1000 ticks at 4×, `stateHash` equals `hashPlus1000` and `trajectoryDigest(w,'g2')` equals `digestPlus1000` for all 8.
- **Read-only:**
  - After 123 ticks, `serializeWorld` JSON is byte-identical before and after constructing the split, keep and starch watches and evaluating them.
  - The builder's tests cover 3,000 ticks with 7 watches (equal `stateHash` and full digest) and 3,200 ticks at 4× in the host with start, complete, leave and resume across a save.
- **Undo then save:**
  - Undo while KEEP runs gives `ended` / 'undone' with `endTick 300 < startTick 400`.
  - `saveSlot` → `loadSlot` keeps the notebook (no `notebookDropped`), and the records are equal.
- **Notebook validation:**
  - The builder's 11 malformed cases, plus a running record with `holdSinceTick < startTick` (my probe), drop the notebook with `NOTEBOOK_DROPPED_TEXT`, and the world loads with the same `stateHash`.
  - The ruling for this, D-0073, is "drop with a message, the world still loads". The file-level wording "Nothing was loaded." therefore does not apply to notebook kinds.
- **Hash-neutral:**
  - Goals live only in the notebook record. It is outside the world state, its checksum and `stateHash`, and it is sealed with sha256 over `canonicalJson`.
  - A notebook with no goals is still not written (`notebookIsEmpty` counts goals).
  - A stage 1 notebook with no `goals` key, and a g2 save, load with no goals (the builder's test).
- **No simulation randomness or writes outside src/sim:**
  - `src/sim/objectives.ts`, `src/worker/goals.ts`, `src/persistence/notebookGoals.ts`, `src/ui/goals.ts` and `GoalChoice.tsx` have no rng, `Math.random`, `Date`, `applyNow` or `step`.
  - No src/sim file outside `src/sim/content/**` imports the engine (grep, and the builder's test).
  - Only Undo (`host.ts:752`) and rollback (`host.ts:2422`) replace a played dish's world, and both call `restoreNotebook`, which ends a running goal.
- **Ledger:** goal records hold no carbon, nutrient or mineral. There is nothing to ledger.
