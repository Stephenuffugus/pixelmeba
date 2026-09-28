# Wave B fix round 2: report (worker, UI state, experiments, What if?)

All items (1–7e) are fixed in the working tree, each with a test. I made no git changes. Typecheck is clean and eslint is clean on every file I touched. The touched unit tests pass (16 files, 134 tests), and the six e2e specs pass on all three projects (60/60).

To check the new tests against the old code, I copied them into a `git archive HEAD` snapshot. Each one fails there, for the reason the item describes.

## Per item

**1. FIXED: the Lab's structure tools follow the world's own manifest.**
- `protocol.ts`: `DishInfo` has a new field, `readonly structureIds?: readonly string[]`.
- `host.ts` `info()` sets it to `[...(m.enabledStructures ?? [])]`.
- `LabTrayContent.tsx` now reads only `info.structureIds`. When the field is missing it offers none. The build-manifest glob and the contentHash fallback are gone.
- Test (`tests/sim/view-switch.test.ts`, which I rewrote; round 1 had asserted the opposite): a Garden save re-hashed to another contentHash (`b2…`), with its manifest still listing BEAD/STONE/WALL, gets `structureIds` [BEAD, STONE, WALL] and all four tray tools, and the simulation accepts a wall. An old save without `enabledStructures` gets `structureIds` [] and no tools. On HEAD it fails with `expected undefined to deeply equal ['BEAD','STONE','WALL']`.

**2. FIXED: a refused command arms no Undo, and Undo cannot rewind a card's observer.**
- `command`: the undo point, checkpoint and undo labels are reset only when the command changed something (no result, or accepted > 0). A refused command leaves the previous undo point as it was.
- `undo`: this now calls `endExperiment(d, 'undone')`, which posts `experimentEnded` with the new reason `'undone'`. The toast text is `experimentEndedText('undone')`.
- Tests in `tests/experiments/app-flow.test.ts`:
  - The verifier's EXP_103 sequence: refused deposit, run to 10 s, Undo. The Undo answers "nothing to undo" and nothing rewinds. After History, the stamp equals the headless stamp at 12 s.
  - A refused command after a feed: Undo still goes back to before the feed.
  - An undoable notebook label, then a run, then Undo: the card ends with 'undone' and no stamp follows.
- All three fail on HEAD.

**3. FIXED: applied and reviewed `tmp/p25-item7-reopen-notice.patch`.**
- Its test "opened again" passes, and fails on HEAD (`expected [] to deeply equal [{… reason:'closed'}]`).
- To pass lint I changed that test's shape: fixed request ids instead of an unused `req` counter, and mapped fields instead of `expect.objectContaining`. The assertions are the same.

**4. FIXED: a change after the gate keeps the held stamp.** Once a single-arm card's gate has held, `endExperiment` keeps the held stamp while the gate moment is still in the dish's past. Only an Undo to before that moment ends the observation.
- Tests: the verifier's gate-then-feed repro, and the same with Undo back to tick 200. In both, feed accepted 29, nothing is ended, and after History there is one stamp equal to the headless one (12 s, gate-moment values).
- On HEAD the old code posted `experimentEnded 'changed'`.

**5. FIXED: the inspector step counts only while the inspector is open on that organism.**
- `state.ts` has a new `inspectedSelection()` (the selection, but only while `sheet === 'inspect'`).
- `syncView()` sends it to the worker, deduplicated, and is used by `select`, `setOverlay` and an `effect` on sheet, selection, overlay and dish. Closing the inspector (Look, More, History) clears the worker's selection; the dish highlight stays. History's "Back to …" sends the selection again.
- Test: new `tests/experiments/inspector-step.test.ts` (real UI state and in-process worker):
  - A Sprinter tapped at 0 s, then Look, then running to 15 s while it eats: no stamp.
  - The inspector reopened on it: one stamp.
- On HEAD the worker still held the selection. With that assertion removed, HEAD gave 1 stamp instead of 0.

**6. FIXED: the dish view shows which step the stamp is waiting for.**
- The worker posts a new packet, `experimentWaiting {dishId, cardId, reachedAtSecond, missing}`, when the gate holds and each time the list of missing steps changes.
- `state.experimentWaiting` holds it. It is cleared when the stamp arrives, when the observation ends, when another dish opens, or when the player dismisses it.
- `DishScreen` shows it in the prompt's place (`.prompt`, `data-testid="experiment-waiting"`, dismiss button labelled "Dismiss this notice"). Its text comes from `waitingStepsText`, e.g. "“Cleaning crew”: every part held at 12 s. The Journal stamp needs one more step: Open the dish’s history (More → History)…".
- Tests:
  - The worker test checks the packet.
  - `inspector-step.test.ts` checks the UI state and that it is cleared by the stamp.
  - The e2e Cleaning crew journey checks the text, text size ≥ 16 px, axe, a dismiss target ≥ 48 px, and that dismiss works, on all three projects.

**7a. FIXED: `registryLabel` is declared once.** It is now declared on `WhatIfAnswer`. A single `registryLabel(manifest)` helper in `host.ts` serves both `info()` and `whatIfAnswer()`. `WhatIfAnswerView` is removed and the tests use the typed field. An existing test pins the label equal to `manifestLabel`.

**7b. FIXED: one amount scale for all of a source's choices.**
- `amountScale(choices)` gives the largest per-cell amount per field; the sheet passes it to `WhatIfPreview`.
- A moved patch that adds exactly one field is drawn on the same ramp. Its legend swatch matches.
- Test (`whatif-ui.test.ts`): with a scale of {sugar 0.8}, the Garden patch (0.4) has the same fill in the Before panel of R-G1, R-G2 and R-G3, and in R-G3's new place. Every fill is ≥ 3:1.

**7c. FIXED: an Empty start of an old save no longer counts as the recipe.**
- The fallback for saves without recorded overrides now also requires `ledger.initial` and the tick-0 recipe inputs to equal a fresh realization of the authored recipe. The recipe inputs are the ledger entries whose source starts `recipe:…` or `introduce:recipe:…`; the realization is cached per recipe.
- Test: the old-save test gains an Empty case, which gets `whatIfSourceId` null. On HEAD it got FIRST_DISH_V1.

**7d. FIXED: error wording follows what really happened.**
- Error packets now carry `paused` (true only when the worker actually paused the dish) and `request` (the request type).
- `client.onError` passes a `WorkerErrorNotice`, and `errorToastText` words the toast by those two fields.
- `startRecipe` and `startCustom` now create the new dish before disposing the old one, so a failed start changes nothing.
- Tests:
  - `whatif.test.ts`: a failed create, a failed save (injected write failure) and a failed export do not pause and the dish keeps running; a throwing command pauses it.
  - `protocol.test.ts`: the client passes these fields on.
  - `whatif-ui.test.ts`: the wording. I changed one existing test here, because a dish id alone no longer means "paused".

**7e. FIXED: the Saved dishes list names the idea.**
- `SlotInfo` and `SaveRequest` have an optional `variant`. The host copies `meta.variant` into the slot on every slot write. `summary()` re-checks it with `saveMetaVariant` and drops a damaged copy.
- `SlotSummary.variant` carries it to the UI. `Saves.tsx` shows "What if? · Dinner farther away (R-G3 rev 1)" (`slot-variant`).
- Tests:
  - A worker test covers slot and autosave, a dish without an idea, and a damaged index copy.
  - The e2e What if? journey checks the line, text ≥ 16 px and axe.

## Proposed decisions
- PROPOSED DECISION: A command with accepted 0 is not an undo point, and the previous undo point stays exactly as it was.
- PROPOSED DECISION: Undo on a single-arm card's dish ends its observation ('undone'), because the observer cannot rewind. The exception is a held stamp whose gate moment is still in the dish's past: it stays.
- PROPOSED DECISION: Once a single-arm card's measured gate has held, a change or a failure does not discard the stamp. The stamp keeps its gate-moment values and waits for the listed steps.
- PROPOSED DECISION: The worker is told about a selection only while the inspector sheet shows it. The dish highlight is render-only and stays.
- PROPOSED DECISION: The What if? ramp uses one scale per field: the largest amount across the source's listed choices. A single-field moved patch is drawn on the same ramp.
- PROPOSED DECISION: An older save without recorded overrides counts as the authored recipe only if its `ledger.initial` and its tick-0 recipe ledger entries equal the recipe's. If the bounded entry list has lost them, it gets no ideas.
- PROPOSED DECISION: Error packets carry `paused` and `request`, and the UI words its toast from them.
- PROPOSED DECISION: The slot index keeps a validated display copy of `meta.variant`. This is not a world-schema change: the save file is unchanged and older index records simply lack the field. `PROTOCOL_VERSION` stays 1, because all protocol changes are additive.

## Outside my files, or not asked
- Duplicating a card's dish gives a copy with no observer, and nothing says so; the original is no longer active. A notice like 'closed' may be wanted there.
- Minor wording: the patch's paired stamp toast says "the copies run to their stopping point". With player steps, the copies have already stopped when the stamp arrives. I left it.

## Files changed
- `/workspaces/pixelmeba/src/worker/protocol.ts`
- `/workspaces/pixelmeba/src/worker/host.ts`
- `/workspaces/pixelmeba/src/worker/client.ts`
- `/workspaces/pixelmeba/src/ui/state.ts`
- `/workspaces/pixelmeba/src/persistence/store.ts`
- `/workspaces/pixelmeba/src/ui/views/Saves.tsx`
- `/workspaces/pixelmeba/src/ui/views/DishScreen.tsx`
- `/workspaces/pixelmeba/src/ui/panels/LabTrayContent.tsx`
- `/workspaces/pixelmeba/src/ui/panels/WhatIfState.tsx`
- `/workspaces/pixelmeba/src/ui/panels/WhatIfSheet.tsx`
- `/workspaces/pixelmeba/src/ui/panels/WhatIfPreview.tsx`
- `/workspaces/pixelmeba/src/ui/strings/whatif.ts`
- `/workspaces/pixelmeba/src/ui/strings/experiments.ts`
- `/workspaces/pixelmeba/tests/sim/view-switch.test.ts`
- `/workspaces/pixelmeba/tests/experiments/app-flow.test.ts`
- `/workspaces/pixelmeba/tests/experiments/inspector-step.test.ts` (new)
- `/workspaces/pixelmeba/tests/worker/whatif.test.ts`
- `/workspaces/pixelmeba/tests/worker/whatif-ui.test.ts`
- `/workspaces/pixelmeba/tests/worker/protocol.test.ts`
- `/workspaces/pixelmeba/tests/e2e/experiments.spec.ts`
- `/workspaces/pixelmeba/tests/e2e/whatif.spec.ts`

There were no content changes, so no content validation was needed.

## Commands and results
- `git apply tmp/p25-item7-reopen-notice.patch` → applied cleanly.
- `npx tsc -p tsconfig.json --noEmit` → clean. Mid-run it showed errors in the other fixer's `LineageState.tsx` and `discovery-pacer.test.ts`; those were gone by the final run.
- `npx eslint` on all 21 touched files → clean.
- `npx vitest run tests/worker tests/persistence tests/ui tests/experiments/app-flow.test.ts tests/experiments/inspector-step.test.ts tests/experiments/journal-and-words.test.ts tests/sim/view-switch.test.ts` → 16 files, 134 passed.
- HEAD snapshot with the new tests copied in:
  - `app-flow` (new tests): 6 of 6 fail.
  - `view-switch`: 2 fail.
  - `inspector-step`: 1 fails.
  - `whatif-ui`: 4 fail.
  - `whatif` (new tests): 3 of 3 fail.
  - `protocol` (new test): 1 of 1 fails.
  - The snapshot was removed afterwards.
- `E2E_PORT=4183 E2E_OUTDIR=tmp/dist-fix2w npx playwright test tests/e2e/experiments.spec.ts tests/e2e/whatif.spec.ts tests/e2e/save-reload.spec.ts tests/e2e/inspector.spec.ts tests/e2e/place-and-undo.spec.ts tests/e2e/lab-tools.spec.ts --project=phone-portrait --project=desktop --project=phone-landscape` → 60 passed (53.9 min), axe clean. No `saves*.spec` exists, so `save-reload.spec` stood in for it.
- Port 4183 is stopped (`lsof -t -i :4183` shows nothing) and `tmp/dist-fix2w` is removed.