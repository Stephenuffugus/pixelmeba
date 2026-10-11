# P4.7 Try my dish (R4): build report (wave 6a, try-my-dish)

Scope: BUILD_DIRECTIVE P4.7 under D-0081 ("Try my dish clones, never mutates"), D-0082 (the shelf) and D-0071 (goals are evaluated, never enforced). Rules: SPEC §13.6, §13.5, §14.1–§14.2, §14.5; CT §12.10 (turn horizons 60/180/600 s); D09 lines 135-139. No sim rule, no version bump, no world schema bump. No fence value moved.

## Checklist

### Build

1. **The shelf.** DONE.
   - `src/persistence/shelf.ts`: `Shelf` at :99, `check` at :139, `put` at :155, `get` at :194, `remove` at :209, `SHELF_LIMITS` at :31 (baseline 10, snapshot 20).
   - Slot ids are `shelf-<kind>-<seq 8 digits>-<writer>`. A record is the gzip save text with its checksum. Its index entry is a SlotInfo with `automatic: true`, `worldId`, `shelfKind` and `createdFor`.
   - `put` makes one `backend.commit` after the ring's preflight (room for this record plus one more save of the same size). It never deletes anything and never overwrites an id that is already held. Over the limit it refuses with a message.
   - `get` returns null for a missing or damaged record, a checksum mismatch, or a failed verifier. It never falls back to another record.
   - `store.ts` (additive): `SHELF_SLOT_PREFIX` / `isShelfSlot` at :107-111. `SaveStore.list()` filters shelf ids at :210 and `slot()` ignores them at :254. `freeSlot()` only looks at slot1–slot10. `SaveStore.save` already refuses any id that is not a named slot or the autosave. New optional `SlotInfo.shelfKind` / `createdFor`.
   - Host `listSlots` shows no shelf ids, because it goes through `store.list()` and `ring.list()`.
   - Proven by `tests/persistence/shelf.test.ts` (6 tests).

2. **The session model.** DONE.
   - `src/persistence/notebookTurns.ts`: `TurnRecord` exactly as assigned. `turnsProblem` at :104: at most one record; every field is checked, including horizon ∈ {600, 1800, 6000}, state ∈ {running, atHorizon, finished}, kept ∈ null | {slotId slot1..10}, `turnWorldId` = the notebook's world id, startTick = baseline.tick, and a cleaned prediction of at most 200 characters. `turnsWorldProblem` at :118: start ≤ the dish tick; an unfinished turn is never past its horizon.
   - `notebook.ts` (additive): `turns?` on `NotebookRecord`, `KIND_PROBLEMS.turns` at :251, the world-refs check, and `notebookIsEmpty` counts turns at :333, so a turn-only notebook is written.
   - `favoritesOnly` already copies favorites only (comment updated), so Duplicate and checkpoint branches never copy a turn.
   - The goal attempt lives in the existing 'goals' kind. `openTurn` (host.ts :2428) calls `GoalRunner.start(world, def, offered)` at the turn's start tick on a fresh notebook, so progress resets each turn.
   - Worker helpers: `src/worker/tryDish.ts`.

3. **Start.** DONE.
   - The More row "Try my dish…" (`data-testid="more-try"`, TryMoreRow in TrySetup.tsx) opens the TrySetup sheet. That sheet is a blocking panel: `openTrySetup` (src/ui/tryDish.ts :111) pauses the dish, and Cancel or Esc restores its run state.
   - Choices:
     - **Goal:** "Free observation" is checked by default, then the goals from `trySetup` → `tryGoalOptions`, which is `goalCatalog` plus the predicate's `durationSeconds`. A goal longer than the turn is filtered out (`offeredGoals`).
     - **Turn length:** 60/180/600 s, default 180.
     - **Prediction:** "What do you think will happen? (optional)".
   - Worker `tryStart` (host.ts :2456) checks, in order:
     - the new id is free;
     - the dish is not a comparison copy, holds no Sample, has not failed, and the device has a store;
     - the horizon and goal are allowed for this turn length;
     - the shelf has room (`check` with the gzip size).

     Then:
     - (a) it builds the baseline with `buildSaveFile(d.world, …, localSave(d))` at the paused tick;
     - (b) it calls `keepFirst` (D-0033, action 'tryDish');
     - (c) it calls `shelf.put('baseline')`;
     - (d) `openTurn` reads the record back with `shelf.get`, verifying the index checksum, `parseSaveFile` and the try's recorded checksum. `cloneTurn` (tryDish.ts :94) then runs `loadSaveFile(text)` → `deserializeWorld({...state, worldId: branchWorldId(...)})`. It never uses the open dish's world object.
     - It opens the turn paused with `favoritesOnly(...)` plus the TurnRecord, and starts the goal.
   - It answers `tryStarted { requestId, info, turn, kept? }`, or `tryRefused { code, message }` (nothing changed), or `keepRefused` (the shared Keep sheet).

4. **The horizon.** DONE.
   - `turnHorizon(d, announce)` (host.ts :2388) runs:
     - in pump, before each step (:2726) and right after each step (:2741);
     - in the 'step' case (:801), before and after;
     - in 'setSpeed' (:786): a run request at the horizon stays paused and offers the card again;
     - in 'undo' (:880) and `rollback` (:2709).
   - At startTick + horizonTicks it sets speed 0 and acc 0, marks the record 'atHorizon', and posts the unsolicited `tryHorizon { dishId, turn, elapsedTicks, goal }`. `goal` is the turn's goal record (`turnGoal`).
   - Undo or a rollback below the horizon sets the record back to 'running' and posts `tryTurn`.
   - A reload resumes from the saved record, because the clock is the world's tick.
   - Once Finished, the turn no longer holds time.

5. **At the horizon.** DONE.
   - **The card** (TryHorizon.tsx) shows:
     - "Turn {n} reached {m:ss} of dish time.";
     - "It ran for {m:ss} from the starting point at {m:ss}.";
     - the goal line from the record (`turnGoalLine`: completed / ended / left / not reached in this turn / "Free observation");
     - births and deaths since the turn started, from the read-only 'sessionSummary' query (never `client.history`);
     - "Your prediction" with the note, when there is one.

     There is no score.
   - **Keep this result:** `keepTurn` saves through `saveToSlot` to the first free named slot. When all ten are used, it opens the Save sheet to choose one to replace.
     - The worker's 'saveSlot' (host.ts :425) marks a turn at its horizon as kept = {slotId} before building, so the slot's file says so. A failed write takes the mark back.
     - It posts `tryTurn`.
   - **Another turn:**
     - **The UI** asks "Discard this turn? It has not been saved." (Discard turn / Cancel) unless the turn is kept.
     - **The worker** `tryNext` (host.ts :2508) works only at the horizon. It refuses with 'unsaved' unless `discard` is true or the kept slot still holds the turn exactly (`holdsExactly`); the UI then asks the question.
     - **The baseline** is verified before anything changes. A missing or changed baseline gives 'baseline-missing' with the assigned line, and the UI disables Another turn.
     - **The prior turn** is dropped from `dishes` without the keep flow.
   - **Finish:** 'tryFinish' marks the record 'finished' and leaves the dish open and paused. Nothing is deleted, and the baseline stays on the shelf.

6. **TryBadge.** DONE.
   - TryBadge.tsx sits in the top-strip title. It shows "Turn {n} · {m:ss} left", and "Turn {n} finished" at the horizon.
   - It is plain text (no role=status), 1 rem.
   - At the horizon, the More row becomes "Turn {n} result…" and reopens the card.

7. **Strings.** DONE. All texts are in `src/ui/strings/tryDish.ts`, with every number as dish time (`turnClock`). The worker's refusal texts are in `TRY_REFUSALS` (src/worker/tryDish.ts). The missing-baseline line is identical in both, and a test checks that.

### Done when

- **tests/persistence/shelf.test.ts:** DONE (6 tests, all pass).
  - round trip, with SaveStore.list/slot/freeSlot and the ring never showing shelf ids;
  - one atomic commit: `failNextCommit` writes nothing, and named slots, the autosave with its predecessor, and a checkpoint stay byte-identical; the commit spy proves one put and no delete;
  - the preflight refusal and the 10-baseline limit leave the store unchanged;
  - write-once (a forced id clash is refused, not replaced), and remove only by shelf id;
  - `SaveStore.save` refuses a shelf id;
  - a damaged record, a mismatched checksum, a refusing verifier and a missing record each give null.
- **tests/worker/try-dish-host.test.ts:** DONE (8 tests, FakeClock-style driver with a MemoryBackend store; all pass).
  - **Clones:** turn 1 is paused at tick 50 with the baseline's stateHash under a new world id. Turn 2 is the same. The same sugar command gives an equal stateHash at the horizon. The shelf slot JSON and record bytes are unchanged after both turns.
  - **The horizon:**
    - it stops at exactly 630 at 4× and after 400 frames;
    - Run and Step at the horizon do nothing and re-offer the card;
    - a step from 629 reaches 630 and pauses;
    - saveSlot → loadSlot at 333 resumes and stops at 630 with the uninterrupted hash.
  - **Another turn:** refused before the horizon. Without Discard it is refused 'unsaved', and the store snapshot is identical after a discarded turn. A kept turn is in slot1 with kept={slot1} in the file, and needs no Discard. A kept turn changed afterwards needs Discard again.
  - **Missing or changed baseline:** damaged bytes or a removed record refuse with the assigned line. The current turn's hash and notebook are unchanged and it stays active.
  - **Undo, goals and Finish:**
    - Undo from the horizon to 500 sets the turn back to running, and it stops again at 600;
    - a goal longer than the turn and a 90 s turn are refused with nothing written;
    - turn 2 has a fresh goal-1 at the start tick;
    - after Finish the dish runs past the horizon.
  - **Start refusals:** a comparison copy, a held sample, and an 11th baseline (shelf full) leave the store unchanged.
  - **Behaviour unchanged:** with and without the TurnRecord (turn vs Duplicate of it), the stateHash and `trajectoryDigest(world, 'full')` are equal after 3,200 ticks at 4×, with two commands and a saveSlot → loadSlot at 1,600.
  - **Save and import:**
    - export → load keeps the record;
    - a strip export blanks the prediction and the baseline name;
    - an import opens with `info.turn`;
    - eight malformed records each drop the notebook with `NOTEBOOK_DROPPED_TEXT` while the world loads with an equal hash, also through the host's importDish. The eight are: two records, a negative horizon, an unknown state, horizon 1200, another dish, a start after the dish time, a kept 'autosave', an unknown field;
    - a g2 save and a wave 5-shape save (goal, no 'turns' key) load with no turns;
    - favoritesOnly drops the turn;
    - a turn-only notebook is written.
- **tests/ui/try-dish.test.ts:** DONE (7 tests, all pass; state.ts is mocked as in tests/ui/favorites.test.ts).
  - **Setup:** the defaults are Free observation / 180 s / empty, and goals are filtered by turn length, with a chosen goal reset when it no longer fits.
  - **Horizon texts:** the goal lines for each state and "Free observation", plus the time, births/deaths, "Your prediction", the missing-baseline line (equal to the worker's) and no score words.
  - **The state machine** (fake port):
    - Another turn on an unkept turn sends nothing until Discard; Cancel sends nothing; Discard sends `discard: true`;
    - a kept turn asks without discard, and 'unsaved' brings up the question;
    - a missing baseline disables further requests.
- **tests/e2e/try-dish.spec.ts:** DONE. It passes on desktop (4.2 min) and phone-portrait (2.4 min). The journey:
  - Garden, run 5 s, pause, More → Try my dish… The setup defaults are checked, and so is the 180 s goal hidden at 60 s, plus axe and ≥ 48 px targets.
  - 60 s, prediction, Start. Turn 1 opens paused at the same dish time, the worker hash equals the source's, and the badge reads "Turn 1 · 1:00 left".
  - Run at 4× until the horizon card, at exactly t0 + 60, with the texts checked, axe and ≥ 48 px.
  - Keep this result shows "Kept in Slot n.".
  - Another turn opens turn 2 paused at t0 with the worker hash equal to turn 1's start.
  - At turn 2's horizon, Another turn asks the discard question (axe again), then Cancel.
  - Finish leaves the dish open and paused, with no badge.
  - Saved dishes lists "Little Living Garden (turn 1)", and there are no page errors.

## Files

Created:

- src/persistence/shelf.ts
- src/persistence/notebookTurns.ts
- src/worker/tryDish.ts
- src/ui/tryDish.ts
- src/ui/panels/TrySetup.tsx
- src/ui/panels/TryHorizon.tsx
- src/ui/panels/TryBadge.tsx
- src/ui/strings/tryDish.ts
- tests/persistence/shelf.test.ts
- tests/worker/try-dish-host.test.ts
- tests/ui/try-dish.test.ts
- tests/e2e/try-dish.spec.ts
- this report

Changed:

- **As this stage's owner:**
  - `src/persistence/store.ts`: shelf prefix and filters, SlotInfo fields.
  - `src/persistence/notebook.ts`: the 'turns' kind, world refs, notebookIsEmpty, favoritesOnly comment.
  - `src/worker/protocol.ts`: trySetup / tryStart / tryNext / tryFinish; trySetup / tryStarted / tryRefused / tryTurn / tryHorizon; `DishInfo.turn?`; `TryGoalOption`; `TryRefusalCode`.
  - `src/worker/client.ts`: `onTry`, `trySetup`, `tryStartKeeping`, `tryNext`, `tryFinish`, and routing of tryHorizon / tryTurn.
  - `src/worker/host.ts`: the shelf; KeepAction 'tryDish'; the saveSlot kept mark; loadSlot opens a shelf record as a branch; strip export without turn notes; trySetup / tryStart / tryNext / tryFinish; the horizon in pump / step / setSpeed / undo / rollback; `info.turn`.
- **Shared, additive:**
  - `src/ui/state.ts`: the sheet union gains 'trySetup' | 'tryHorizon'; `wireTry(client)` next to `wireGoals`; `replaceForTry` (the D-0033 keep flow with verb 'start').
  - `src/ui/views/DishScreen.tsx`: TryBadge in the title, the two sheet branches, and dish keys blocked behind the setup panel (Esc = Cancel).
  - `src/ui/panels/MoreSheet.tsx`: the TryMoreRow.
  - `src/ui/styles.css`: the "try my dish" block at the end.

## Commands and results

- `npx tsc -p tsconfig.json --noEmit`: clean. Mid-run it once reported `src/render/picture.ts(39,3) 'ID_STRIDE' is declared but never read`, from the share task's in-flight file. It was clean at the final run.
- `npx eslint <the 19 files above + the e2e spec>`: clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/persistence/shelf.test.ts tests/worker/try-dish-host.test.ts tests/ui/try-dish.test.ts tests/persistence/notebook.test.ts tests/persistence/checkpoints.test.ts tests/worker/host.test.ts tests/worker/keep-dish.test.ts tests/worker/goals-host.test.ts tests/worker/duplicate-sharing.test.ts tests/worker/favorites-host.test.ts`: `Test Files 17 passed (17)`, `Tests 208 passed (208)`, 1427 s under load.
- `E2E_PORT=4272 E2E_OUTDIR=tmp/dist-try-dish npx playwright test tests/e2e/try-dish.spec.ts --project=desktop`: `1 passed (4.3m)`.
- The same with `--project=phone-portrait`: `1 passed (2.6m)`. Port 4272 was stopped before and after.

### Mutation checks

Each mechanism was turned off, the targeted test run, and the file restored:

| Mechanism turned off | Test | Result |
|---|---|---|
| (a) `turnHoldsTime` always false (no horizon) | the horizon | 2 failed |
| (b) `turnsProblem` accepts 5 records | save/import | 1 failed |
| (c) `SaveStore.list` shows shelf ids | shelf round trip | 1 failed |
| (d) `notebookIsEmpty` ignores turns | save/import | 1 failed |
| (e) host `tryNext` without the discard check | Discard is needed | 1 failed |
| (f) `cloneTurn` keeps the baseline's world id | each turn clones | 1 failed |
| (g) UI `anotherTurn` skips the question | Discard | 2 failed |

## FENCE

None. g2-replay, the four trajectory-fence files, conservation-closed-lid and determinism all pass unchanged. Nothing in src/sim was touched.

## Bugs or notes elsewhere

- `NOTEBOOK_DROPPED_TEXT` (notebook.ts) still says "(favorites, story cards and goals)". A dropped turn record is covered by the same message. The text was left unchanged so pinned tests keep passing; the lead may want to name turns.
- `KeepVerb` lives in src/ui/strings/keep.ts, which is not mine. The Try my dish keep flow uses verb 'start', so the Keep sheet says "Waiting to start: “Turn 1 of “…””". A dedicated verb ("before the turn starts") needs one case in keep.ts.
- ARCH §7 ("As built") does not yet list the new messages: trySetup / tryStart / tryNext / tryFinish → trySetup / tryStarted / tryRefused / tryTurn / tryHorizon, and `DishInfo.turn`. The docs owner should add them.
- The e2e journey takes 2.5–4.5 min, because it runs two 60 s turns at 4× under SwiftShader with shared CPUs.

## Proposed decisions

- **PROPOSED DECISION: the shelf as built** (D-0082):
  - 10 baselines and 20 snapshots per device;
  - the preflight runs before the keep step, so a full shelf changes nothing;
  - the baseline is written after the open dish is kept, so a refused keep leaves no orphan baseline;
  - a shelf record opened through Saved dishes → Open (loadSlot) opens as a new branch, as a checkpoint does, and is never bound to or overwritten as a slot.
- **PROPOSED DECISION: a turn is kept by any save to a named slot made at its horizon.** "Keep this result" is one such save; the Save sheet is the other. The record's `kept` is written into that same file. A save made mid-turn does not mark it kept.
- **PROPOSED DECISION: Another turn needs no Discard only while the kept slot still holds the turn exactly.** "Exactly" is D-0033's `holdsExactly`. A kept turn changed afterwards is refused 'unsaved' by the worker and the UI asks "Discard this turn?". Another turn is offered only at the horizon.
- **PROPOSED DECISION: Finish ends the turn's horizon.** A finished turn is an ordinary dish and runs on past it. Undo or a rollback during a turn ends its goal attempt ('undone' / 'failed', D-0078), and the goal is not restarted within that turn. The turn's clock rewinds with the world.
- **PROPOSED DECISION: turn names and horizon wording.**
  - A turn dish is named "{baseline name} (turn n)", at most 60 characters.
  - The horizon card's "{m:ss}" is the dish clock at the horizon, and the next line states the elapsed turn time and the starting point.
  - The badge is plain text; the horizon card is reopened from More ("Turn n result…").
- **PROPOSED DECISION: "Export without names or notes" also blanks a turn's prediction note and the baseline's dish name** (host `exportDish`, `withoutTurnNotes`). An export with names keeps them.
- **PROPOSED DECISION: the setup sheet blocks dish keys.** Space, digits and the other dish keys do nothing while it is open; Esc is its Cancel and restores the run state, as UX §2 asks of blocking panels.
