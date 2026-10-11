# P4.7 Try my dish: round-1 fix report (wave 6a, try-my-dish)

## Problems

1. **MAJOR: a kept turn that is rewound still says "Kept in Slot n."** FIXED.
   - `src/worker/tryDish.ts`: `turnAfterTime` now clears `kept` when a turn leaves 'atHorizon' (Undo or a rollback below the horizon). A new helper, `turnAfterChange`, returns the record without `kept` when one is set.
   - `src/worker/host.ts`: a new private method, `turnUnkept(d)`, sets `kept: null` and posts the record as 'tryTurn'. It does not post 'tryHorizon', so it raises no card. The 'command' case calls it after any changed command, so a command made at the horizon counts. The 'undo' case calls it after `turnHorizon`, which covers an Undo that stays at the horizon tick.
   - The UI's existing `onTryNotice` 'tryTurn' branch puts the new record on the open card. The card then shows no "Kept in Slot n." line, and Keep this result is enabled again.
   - Test: in `tests/worker/try-dish-host.test.ts`, "fix round 1: a kept turn that is rewound or changed is no longer kept". It covers three cases, each after a keep: Undo below the horizon and a run back to it, a command at the horizon, and Undo at the horizon. In each case the record and the last announcement have `kept: null`, and an unconfirmed tryNext is refused with 'unsaved'.
   - Mutation check: with both clearing paths turned off (the old behaviour), the test fails (`Tests 1 failed`). With the fix it passes.

2. **MINOR: 'deleteSlot' can delete a shelf record.** FIXED.
   - `src/persistence/store.ts`: `SaveStore.remove` now throws `SHELF_REMOVE_REFUSED` for any id where `isShelfSlot` is true, and changes nothing. Shelf records can be removed only through `Shelf.remove`. The host's 'deleteSlot' calls `SaveStore.remove`, so it reports that message as an 'error'. Named slots, the autosave and checkpoints delete as before.
   - Tests:
     - `tests/persistence/shelf.test.ts` "fix round 1: SaveStore.remove refuses a shelf id": the call is rejected and the backend is byte-identical afterwards. `get` still returns the text, a named slot still deletes, and `Shelf.remove` still works.
     - `tests/worker/try-dish-host.test.ts` "fix round 1: deleting a saved dish never reaches a shelf record": 'deleteSlot' with a shelf id returns an 'error', the store is unchanged, and the next tryNext still starts.
   - Under the old code the record was deleted and the host answered 'done', so both tests would fail.

3. **MINOR: after Discard, Continue still holds the discarded turn.** FIXED.
   - `src/ui/tryDish.ts`: `TryPort` has a new member, `autosave()`. The default port calls state.ts `autosave`.
   - `nextTurn` calls `port.autosave()` right after the new turn is entered, so Continue is rewritten with the new turn at once.
   - Test: in `tests/ui/try-dish.test.ts`, the Discard test now expects `port.autosaves === 1` after the new turn opens. The missing-baseline test expects `0`. Under the old code the count was 0, so the Discard test would fail.

## Files changed

- src/worker/tryDish.ts (owned)
- src/ui/tryDish.ts (owned)
- src/worker/host.ts (stage owner): import, one line in 'command', one line in 'undo', the `turnUnkept` method
- src/persistence/store.ts (stage owner): `SHELF_REMOVE_REFUSED` and the guard in `remove`
- tests/worker/try-dish-host.test.ts, tests/persistence/shelf.test.ts, tests/ui/try-dish.test.ts (owned)

## Commands and results

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npx eslint` on the 7 files above | exit 0 |
| `npx vitest run tests/persistence/shelf.test.ts tests/worker/try-dish-host.test.ts tests/ui/try-dish.test.ts` | Test Files 3 passed (3), Tests 24 passed (24) |
| Mutation check (old kept behaviour): `npx vitest run tests/worker/try-dish-host.test.ts -t "fix round 1"` | 1 failed, 1 passed; the file was restored afterwards |
| `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts` | Test Files 7 passed (7), Tests 56 passed (56) |
| `E2E_PORT=4272 E2E_OUTDIR=tmp/dist-try-dish npx playwright test tests/e2e/try-dish.spec.ts --project=desktop` | 1 passed (3.3m) |

No fence value changed, no world schema changed and no simulation rule was added. The stateHash is unaffected because a turn's `kept` is notebook state.
