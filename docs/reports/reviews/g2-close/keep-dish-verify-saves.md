# D-0033 keep-dish — adversarial verification, lens: saves and state

Verifier report, 2026-09-29. Scope: the builder's uncommitted D-0033 work (`keep-dish-build.md`). Nothing in
the repository was edited except this file. All scratch lives in `tmp/verify-keep-dish-saves/` (git-ignored).

**Verdict: not done — ok = false.** There is one MAJOR problem, in the builder's own PROPOSED DECISION 4
(Continue reopens a dish bound to a slot). In the built app it overwrites the player's newer save in that
slot with an older Continue state. Reproduced end to end. The rest of what the ruling asked for holds:
- the keep step on every entry point;
- "a changed dish is never skipped" for rule (b), including a mutation check;
- predecessors, the all-slots-used choice and Cancel;
- failed writes;
- What if?'s messages;
- the state hash.

## Problems (most severe first)

### 1. MAJOR — Continue→slot binding writes an older Continue over the player's newer save in that slot

**Where**
- `src/worker/host.ts:1450-1459` (`bindingOf`) binds a reopened autosave to its recorded `activeSlot` whenever
  that slot's index `worldId` equals the autosave's.
- It is applied at `host.ts:340/346` (`loadSlot`).
- `activeSlot` is recorded at `host.ts:299/311` (autosave) and `host.ts:1511/1523` (`writeBuilt`).
- The keep then targets that slot (`host.ts:1564`). Its only guard is the 'saved' checksum test
  (`host.ts:1546`), which correctly finds the dish different from the slot and so **writes the older state
  over the slot**.

**Why it is wrong.** "Same world id" does not mean "Continue is at least as new as the slot." Continue is often
older than the slot it names:
- `src/ui/state.ts:335` skips an autosave whenever the tick has not changed. A pause → change → More → Save
  to the dish's own slot therefore never reaches Continue. This covers saveToSlot's follow-up
  (`state.ts:354`), the pagehide/visibility autosaves (`main.tsx:13/22`) and the 30 s interval
  (`DishScreen.tsx:122`).
- The manual save's follow-up autosave can fail (`state.ts:355`).
- The keep's own Continue write can fail after its slot write (probe P5).
- The app can close between the two commits.

**Effect.** The player's explicit save becomes the slot's `previous`. No UI opens it (a load falls back to it
only when the current record is unreadable), and the next write to that slot deletes it. The toast reports
success: "Saved “Little Living Garden” to Slot 1 first." Before this change, a dish opened from Continue was
bound to no slot, so this could not happen.

**Repro in the real built app** (desktop, port 4201; `tmp/verify-keep-dish-saves/e2e/stale-continue.spec.ts`,
log `e2e-probe3.log`):
1. Play the Garden, run, pause, then More → Save → Slot 1.
2. Run on, pause at 0:19, then More → Save → Slot 1 → Replace. This autosave is written with `activeSlot` slot1.
3. Still paused at 0:19, Add Life → 5 Amoeba ("0:19 · 61 alive"), then More → Save → Slot 1 → Replace. Its
   autosave is skipped by the tick gate.
4. Reload (a new session), then Home → Continue. It opens "0:19 · 56 alive" (stale), bound to Slot 1.
5. Home → Play → Start. The toast says "Saved “Little Living Garden” to Slot 1 first."
6. Saved dishes → Slot 1 → Open gives **"0:19 · 56 alive"**. The 5 Amoeba the player saved in Slot 1 are gone.

Control run (`e2e-probe.log`): an interval autosave happened before the first save, so Continue carried no
`activeSlot`. The same stale Continue was then kept in Slot 2, and Slot 1 still opened "0:09 · 61 alive". The
binding alone decides whether the slot is overwritten.

**Worker-level repro:** probe P1 in `tmp/verify-keep-dish-saves/keep.probe.test.ts`, where a second
`DishHost` on the same backend stands for a new session.
- `keepPlan` says `{slot, slot1, own: true}`, so New Dish would say "will first be saved to Slot 1, where it
  was saved before".
- `kept` is `{slot, slot1, autosaved: true}`.
- `slot1.current` now holds the autosave's state, and the player's record is only `slot1.previous`.

**Fix options**
- Record the bound slot's current record id with the autosave (e.g. `activeRecord`). Bind on reopen only while
  `slot(activeSlot).current === activeRecord`, i.e. the slot has not been written since that Continue.
- Or drop the cross-session binding. The cost is a duplicate slot, which errs towards writing, as the
  builder's own 'saved' rule does.
- Separately, make saveToSlot always refresh Continue. The tick gate at `state.ts:335` is pre-existing, but
  with the binding it becomes a data-loss trigger.

**Tests.** The builder's binding test checks only a *different* world in the slot. Add the stale-same-world case.

### 2. MINOR — `npm run check` is red with this change: 2 failures in `tests/sim/view-switch.test.ts` (not the builder's file)
- Confirmed in my full vitest run (`expected 'dish-…' not to be 'dish-…'` at lines 403 and 425).
- The in-process host there has no store, so `importFile` over an open dish is now refused `save-unavailable`
  and the import never happens. This is correct D-0033 behaviour.
- The builder's two-line harness fix (`new SaveStore(new MemoryBackend())` as `DishHost`'s 4th argument), on a
  scratch copy (`tmp/verify-keep-dish-saves/view-switch-fixed.probe.test.ts`), gives **14/14 passed**.
- The lead must land it with this change ("keep the build green").

### 3. MINOR — Rule (a) skips a What if? dish that carries a journal note made at its start
- `rebuildsExactly` (`host.ts:1385-1390`) compares only the state hash, which never reads history. A What if?
  dish at 0:00 with a Notebook note (`journalPut`, stored in `history.journal`) is still 'unchanged'.
- Every replacing action therefore writes nothing (probe P9: plan `unchanged`, kept `unchanged`, store
  identical).
- The note survives in the device Notebook, but not with the dish, and a rebuilt dish has a new world id.
- The builder's "a journal note is never skipped" holds only for rule (b). This is What if?'s pre-existing
  D-0026 rule, now on every entry point.
- Suggest `rebuildsExactly` also requires an empty `history.journal`, or the lead accepts it explicitly.

### 4. MINOR — Untouched recipe dishes use a slot on every replacement (Done-when "unchanged recipe start → nothing written" is met only for What if? dishes)
- Rule (a) needs a variant record, so an untouched Play Garden or New Dish at tick 0 is written to a slot
  whenever it is replaced.
- The builder's own e2e journey 1 enshrines this: "Saved “My dish” to Slot 2 first." for a dish created a
  moment earlier and never run.
- Exploring New Dish seeds or restarting the Garden fills the ten slots and then raises the Keep sheet each time.
- This is consistent with D-0026 and with `tests/worker/whatif.test.ts:708-723` (an untouched Garden kept to
  slot1). The builder disclosed it as PROPOSED DECISION 7.
- The lead or owner should rule. The builder's (a) test uses only variant R-G2 on the five entry points.

### 5. MINOR — Opening the Continue row while the open dish is bound to Continue's `activeSlot` misplaces the dish and mislabels a slot
Same root as item 1; probe P7. `bindTo` becomes that slot (`host.ts:340`), and the open dish may not use its
own slot (`host.ts:1564`):
- **Some slots free:** its newest state goes to a new slot instead of its own.
- **All ten used:**
  - `keepRefused` says "“Mine” has nowhere to go" although Mine has its own Slot 4 (`exclude: "slot4"`).
  - The Keep sheet lists and disables Slot 4 as "(the save you are opening)" (`keep.ts:88`,
    `KeepChoice.tsx:131`). But the player is opening Continue, not Slot 4.
- This is an honest-labels issue.

### 6. MINOR — The experiment card still says "Your current dish is kept in Continue first." (`src/ui/views/ExperimentCard.tsx:125`, not the builder's file)
- It is false in the 'saved' and 'unchanged' cases: nothing is written, not even Continue (`host.ts:1546-1549`).
- It is incomplete otherwise: the dish now goes to a slot too, or the Keep sheet appears.
- The builder flagged it (action item 2). The lead must change it in the same commit.

### 7. MINOR — The app-side run-state restore on Cancel is untested
- In the app, `replaceOpenDish` pauses the dish before the request (`state.ts:607-609`), so the worker's own
  restore (`host.ts:1587`) restores 0.
- Only `resumeKept()` (`state.ts:592-595`, via `cancelKeep`) brings a running dish back.
- No test reaches it:
  - The worker test's "keeps running" exercises the worker restore without the UI pre-pause.
  - The e2e Cancel journey cancels over a paused dish.
  - The running-dish journey (More → Import) never hits the all-slots-used path.
- Deleting `resumeKept()` would keep every test green. By reading, the code is correct: it resumes only on the
  dish screen, where the one running case, More → Import, starts. Suggest one e2e: ten slots used, dish
  running, More → Import → Cancel → still running.

*Note (out of scope, already flagged by the builder):* Duplicate switches to the copy and leaves the original
unreachable in the worker (`state.ts:472-475`). The copy holds the same state, so nothing is lost.

## VERIFIED OK

- **The builder's worker tests pass.** `keep-dish` (31), `keep-strings` (3) and `whatif` (24 existing + 1 new):
  59/59 in my run.
- **Every entry point goes through the keep step.** Play (`startRecipe`), New Dish (`startCustom`), the
  experiment card (`startExperiment` → `startCard`), Saved dishes → Open (named slot, the autosave row, a
  checkpoint) and Import (Saved dishes and More) all call `replaceOpenDish` with `keepFrom`.
  - The only other `enterDish` paths are What if? (its own keep) and Duplicate.
  - Home → Continue opens the autosave only when no dish is open (`Home.tsx:10-52`), so it never replaces one.
- **The new dish is prepared before the keep**, and a refusal before the keep writes nothing:
  - build (`host.ts:381`), file check (`host.ts:366`), store load (`host.ts:327-332`) and arms
    (`prepareExperiment`), with ids re-checked after the keep;
  - broken import and unknown recipe (builder test).
- **A changed dish is never skipped (rule b).** The proof is SHA-256 over `canonicalJson(serializeWorld)`. That
  covers settings, commands (pending and log), branches, lineage and history including the journal. The name
  is compared separately, and every other meta field is derived from the world or fixed. Evidence:
  - builder tests: a tick, a deposit command, a journal note (state hash unchanged, file changed), the slot
    overwritten or deleted;
  - my probes: a branch rename through the lineage command at the same tick (P2), `setLid` at the same tick
    (P3);
  - a checkpoint branch, unchanged, is still written to the first empty slot (builder test).
- **Mutation check reproduced.** A scratch host (`tmp/verify-keep-dish-saves/host-mutant.ts`) with
  `return held.checksum === file.checksum` replaced by `return true` fails "a changed dish is never skipped" on
  the `command` case: plan `saved` instead of `slot`.
- **The predecessor is kept** on the own-slot path for all five actions (builder test). Probe P4: a failed
  write leaves `slot3 {current, previous}` exactly as they were, and the retry makes the old current the
  predecessor.
- **All ten used → the 'full' plan, a `slots-full` refusal, and a byte-identical store.** In the worker the dish
  resumes its prior speed (builder test).
  - The paired card opens no comparison.
  - The save being opened is excluded, and choosing it is refused `failed`.
  - Export then go ahead writes no named slot.
  - The New Dish form and What if?'s full step are untouched by Cancel (both keep their component state;
    What if?'s `cancelFullStep` is unchanged).
- **A failed write (`MemoryBackend.failNextCommit`) refuses and changes nothing:**
  - a readable per-action message;
  - the store is byte-identical;
  - no new dish opens, and the dish's hash and tick are unchanged (builder test and P4).
  - A failure of the Continue write only lets the replacement go ahead with "… Continue could not be
    updated." (P5), exactly as What if? always did.
- **No simulation state is touched.** The kept dish's state hash is identical before and after `keepPlan` and
  after a keep through the own slot, the first empty slot and 'saved' (builder test and P6).
- **What if? is unchanged.**
  - `NOT_DONE.whatIf` reproduces the old refusal texts byte for byte.
  - The slots-full and replace texts are untouched.
  - FullStepPanel keeps the same test ids, element ids, radio name, texts and heading focus.
  - `startedText` says nothing for 'saved'.
  - `whatif.test.ts` passes unchanged plus one additive case.
- **Opening its own slot while changed keeps the dish in the first empty slot**, and opening Continue writes no
  Continue first (builder tests). A dish opened from a slot and left untouched is 'saved' (builder test).
- **Additive store changes are safe.** `SlotInfo.worldId`/`activeSlot`, `SaveRequest.worldId`/`activeSlot` and
  `SaveStore.slot()` are stored as whole objects by `IdbBackend` and `MemoryBackend`, and older indexes
  without them bind nothing.
- **Type-check and lint.** `npx tsc -p tsconfig.json --noEmit` exits 0 for the whole repo. `npx eslint` on the
  20 touched files exits 0.

## Commands and results
- `npx vitest run tests/worker/keep-dish.test.ts tests/worker/keep-strings.test.ts tests/worker/whatif.test.ts`
  → `Test Files 3 passed (3) · Tests 59 passed (59)` (167 s).
- `npx vitest run --config tmp/verify-keep-dish-saves/vitest.config.ts` (probes P1–P8) → `8 passed`. P1
  asserts the overwrite. P9 run alone → passed, logging plan and kept `unchanged` and the store unchanged.
- Mutant: `npx vitest run --config tmp/verify-keep-dish-saves/vitest.config.ts tmp/verify-keep-dish-saves/keep-dish-mutant.probe.test.ts -t "never skipped"`
  → `1 failed` (AssertionError on `command`), as it should.
- `npx vitest run --config tmp/verify-keep-dish-saves/vitest.config.ts tmp/verify-keep-dish-saves/view-switch-fixed.probe.test.ts`
  → `14 passed (14)`.
- Full unit suite `npx vitest run --exclude 'tests/tools/**'` (tools excluded: another agent's tuner work in
  progress) → `Test Files 2 failed | 71 passed (73) · Tests 3 failed | 634 passed (637)`, 2,382 s at load 6–9.
  - The two view-switch failures are item 2.
  - The third is `tests/experiments/exp-b-grazer.test.ts` "replays identically…": `Test timed out in
    120000ms`. It is a sim-only test (no changed file imported) and a load artefact: re-run alone,
    `npx vitest run tests/experiments/exp-b-grazer.test.ts` → `5 passed (5)`.
- `npx tsc -p tsconfig.json --noEmit` → exit 0. `npx eslint <20 touched files>` → exit 0.
- e2e probe: `E2E_PORT=4201 E2E_OUTDIR=tmp/dist-keep-dish-10 npx playwright test --config tmp/verify-keep-dish-saves/playwright.config.ts --project=desktop`.
  - Run 1 (control, no `activeSlot`) passed: Slot 2 was used and Slot 1 was intact.
  - Run 2 failed in my probe's own toast recorder, which deduped repeated toasts; fixed.
  - Run 3 **failed at the final assertion exactly as item 1 predicts**: expected "0:19 · 61 alive", received
    "0:19 · 56 alive".
  - Port 4201 was stopped afterwards (`lsof -t -i :4201` is empty).
