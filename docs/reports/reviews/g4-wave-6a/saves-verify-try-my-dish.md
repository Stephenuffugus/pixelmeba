# Saves and determinism check: try-my-dish (wave g4-wave-6a)

**Result: ok = true.** I found no BLOCKER or MAJOR problems, and three MINOR ones.

**How I checked.** I read the uncommitted tree: shelf.ts, notebookTurns.ts, worker/tryDish.ts, the host.ts diff, the store.ts and notebook.ts diffs, and the UI keep, discard and autosave code in ui/tryDish.ts. I wrote probes in `tmp/verify-saves-1/probe.test.ts`, which copies the builder's Driver over a MemoryBackend store, and ran them with `npx vitest run -c tmp/verify-saves-1/vitest.config.ts --reporter=verbose`. Result: `Tests 4 passed (4)`. No tracked file was edited.

## Problems (most severe first)

1. **MINOR [try-my-dish] src/worker/host.ts:508-509.** The host's `'deleteSlot'` passes any slot id straight to `SaveStore.remove`, and neither checks for shelf ids (store.ts:246). A Try my dish baseline can therefore be deleted through the ordinary slot-delete message. That skips `Shelf.remove`, which is the only path meant to remove shelf records, and only when the player explicitly asks.
   - **Today:** the UI cannot do this, because `listSlots` never shows shelf ids.
   - **Stage 2:** the storage panel will be the first UI to handle shelf ids. Either make `deleteSlot` refuse ids where `isShelfSlot` is true, or route them to `shelf.remove`.
   - **Repro:** `handleAsync({ type: 'deleteSlot', requestId, slotId: 'shelf-baseline-00000001-<writer>' })`. The record is gone, and the next `tryNext` gets `baseline-missing`.

2. **MINOR [try-my-dish] src/ui/tryDish.ts:340 with host.ts `tryNext`.** After the player chooses "Discard turn", Continue (the autosave) can still hold the discarded turn.
   - **Why:** the horizon notice autosaves the turn at its horizon (line 340). The new turn is not autosaved until the next autosave event: the 30 s interval or going to the background.
   - **Effect:** if the app is killed in that window, Continue reopens the turn the player just discarded. D09 line 137 says discarded turns are replaced only by the player's choice.
   - **What holds:** the worker writes nothing for the discarded turn (verified below), so this is only a gap in when Continue is refreshed.
   - **Suggested fix:** autosave right after `tryStarted` from Another turn.
   - **Repro:** a turn reaches its horizon (Continue is now turn 1 at the horizon). Choose Another turn, then Discard, and close the tab within 30 s. Reopen and press Continue: turn 1 opens, at its horizon.

3. **MINOR [lead] src/persistence/shelf.ts:142 (SHELF_LIMITS.baseline = 10).** This stage has no UI to remove shelf records; that is stage 2's storage panel.
   - **Effect:** after 10 tries on one device, every Try my dish start is refused with "Remove one you no longer need…", and the player has no way to do that.
   - **Action:** stage 2's removal UI must ship in the same release as P4.7, or the limit text needs to change.
   - **Repro:** 11 `tryStart` calls give `tryRefused` with code `'shelf'`. The builder's test already shows the refusal.

## VERIFIED OK

- **A turn continues exactly as the original dish would.** Probe A compared a turn with the same dish continued without any save or load, at three moments:
  - tick 37, with a command issued while paused, so still pending in the baseline;
  - tick 600, the checkpoint-interval boundary, with the checkpoint ring on;
  - tick 294, right after the first birth.

  For each moment the turn ran 600 ticks at 1× and at 4×, with a mid-turn command at +300. In all 6 cases:
  - the turn's start hash equals the source dish's hash;
  - the turn stops at exactly start + 600;
  - its end stateHash equals the uninterrupted dish's end hash, under a different world id.

  Log: `at=37/600/294 speed=1/4 startEq=true turnTick=start+600 endEq=true`.
- **The turn is cloned from the save text, never from the open world.** `cloneTurn` (worker/tryDish.ts:94) takes the shelf text through `loadSaveFile` and then runs `deserializeWorld` with a new world id from `branchWorldId`. `loadSaveFile` returns the migrated state (saveFile.ts:445), so an older-schema baseline would also clone correctly.
- **The baseline is verified on every turn.** `shelf.get` checks the index checksum against the record's. The host's verifier then requires `slot.shelfKind === 'baseline'`, `slot.checksum === turn.baseline.checksum` and `parseSaveFile(text).checksum`, which is recomputed over the canonical state (saveFile.ts:443-444). The builder's test shows the stored slot and record bytes are unchanged after two turns.
- **The horizon stops exactly and the clock never restarts.** These pass in a rerun of tests/worker/try-dish-host.test.ts: the stop at 4×, Step at horizon−1, and save → load at 333 resuming to the uninterrupted hash at 630.
  - Probe C added one more case: an autosave made at the horizon reloads as `atHorizon` with `kept: null`. Run at 4× does not move the tick (625), and Another turn without Discard is refused `unsaved`.
- **A kept turn is recognised after reopening.** Probe B kept a turn at its horizon in slot4. The file carries `kept: {slotId: 'slot4'}`. Reopened from slot4, Another turn needs no Discard (`holdsExactly` holds), and turn 2 opens at the baseline tick 25.
- **The notebook 'turns' kind is canonical, validated, and outside the stateHash.**
  - **Canonical:** it is sealed by `sealNotebook` through `canonicalJson`, which sorts keys.
  - **Validated:** `turnsProblem` checks every field and allows at most one record. `turnsWorldProblem` checks the record's ticks against the file's dish. Any problem drops the notebook and the world still loads.
  - **Outside the stateHash:** nothing in src/sim reads it (`git status --short src/sim` is empty).
  - **Same behaviour with and without the record:** the builder's trajectory test reran green.
  - **Unusual text survives:** probe D tried a lone surrogate, an emoji, combining marks, a 250-character note (cut to 200) and U+2028. Each survives slot save → load and export → import with `notebookDropped = null`.
- **Notebooks with no turn are unchanged.** Records without a turn omit the key, and `notebookIsEmpty` counts turns. A g2 save and a wave 5 save load with no turns, as covered by the try-dish-host test.
- **Edge cases load cleanly (probes E, F and G).**
  - **E:** a new try started from a turn that is still running gives try-2, with its start and baseline at tick 115. The source turn's record is not copied.
  - **F:** a Finished turn run past its horizon to tick 900 saves and loads as `finished` with nothing dropped.
  - **G:** "Export without names or notes" imports with a valid notebook. Its prediction is `''` and its baseline name is "Shared dish".
- **The shelf stays outside the named slots.**
  - `SaveStore.list`, `slot` and `freeSlot` ignore shelf ids, and `SaveStore.save` refuses them.
  - `put` writes in one commit with no deletes, and a failed commit or a storage preflight refusal changes nothing (shelf.test.ts).
  - `loadSlot` of a shelf id opens a branch with favorites only.
- **No simulation randomness outside src/sim.** The only new randomness is `writerToken` (shelf.ts:85), which uses `crypto.getRandomValues` and falls back to `Math.random`. It only names slot ids, exactly as the checkpoint ring's writer token does, and never reaches a world. The horizon checks in pump, step, setSpeed, undo and rollback only read the tick and the notebook, and set speed and acc. They never skip or change a tick.
- **Ledger.** Not applicable: Try my dish creates no biomass, and every turn is a full clone of a ledgered world state.
- **Reruns of the builder's suites and the fence fixtures:**
  - `npx vitest run tests/persistence/shelf.test.ts tests/worker/try-dish-host.test.ts tests/ui/try-dish.test.ts tests/persistence/notebook.test.ts tests/persistence/checkpoints.test.ts`: `Test Files 5 passed (5)`, `Tests 58 passed (58)`.
  - `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/determinism.test.ts`: `Test Files 2 passed (2)`, `Tests 13 passed (13)`.
