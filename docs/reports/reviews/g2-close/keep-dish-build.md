# D-0033 "keep the open dish first" — build report (g2-close, keep-dish)

Builder report for the lead. Nothing committed (the lead commits). Date 2026-09-29.

## Summary

Every action that replaces the open dish now keeps it first through ONE worker keep step (the What if?
one, generalized): Play shelf Start, New Dish Create, an experiment card's Start (paired and single-arm;
supersedes D-0027's "autosave to Continue without writing a named slot"), Saved dishes → Open (a named
slot, the autosave row, an automatic checkpoint), Import (Saved dishes and More), and What if? as before.
The new dish is always prepared first (built / read and checked / realized), then the open dish is kept,
then the new dish opens; a keep that cannot be done answers `keepRefused` and nothing is opened.

- Keeping = What if?'s rule: its own slot (the store keeps the previous copy), else the first empty slot,
  and Continue follows. All ten used → the shared all-slots-used choice (export then go ahead, a
  confirmed replacement, or Cancel = nothing changes, run state restored).
- Nothing is written when keeping is unnecessary: (a) What if?'s rebuild-exactly rule ('unchanged'), or
  (b) NEW plan/kept kind 'saved': the dish's own slot already holds it exactly — proved by checksum (see
  PROPOSED DECISION 2). A changed dish is never skipped (tested, incl. a mutation check).
- One short line afterwards ("Saved “Little Living Garden” to Slot 2 first."); nothing when nothing was
  written. New Dish and the Saved dishes checkpoint confirmation say beforehand what will happen (from
  the worker's plan); New Dish's "Creating a new dish closes …" warning is replaced.
- What if?'s own behaviour and messages are unchanged where they existed (whatif.spec.ts unchanged).

## Files changed (all within the assignment)

| File | Change |
|---|---|
| `src/worker/protocol.ts` | `KeepFrom` (dishId + WhatIfKeep); optional `keepFrom` on `create`, `loadSlot`, `importDish`, `experimentStart`; new request `keepPlan` (aboutDishId, opening); new replies `keepPlan`, `keepRefused` (code slots-full / save-failed / save-unavailable / failed, readable message, `exclude`); optional `kept` on `ready`, `loaded`, `experimentStarted`; `WhatIfPlan` + `WhatIfKept` gain kind `'saved'`. Requests without `keepFrom` behave exactly as before (tests and sync paths unchanged). |
| `src/worker/host.ts` | One keep step: `keepDish(d, keep, {action, bindTo, opening})` (What if? calls it with its defaults; its messages byte-for-byte), `keepPlan(d, bindTo)`, `keepFirst()` (posts `keepRefused`), `holdsExactly()` (the 'saved' proof; a different index tick or name is a change without building anything), `bindingOf()` (active slot of the dish being opened), `writeBuilt()` (one built file written to the slot and Continue). `loadSlot` / `importDish` / `create`+keepFrom / `experimentStart`+keepFrom: prepare → keep → open. `experimentStart` split into prepare/open (the no-keep path stays synchronous). Slot writes record `worldId`; autosave writes record `activeSlot`. |
| `src/worker/client.ts` | `createKeeping`, `loadSlotKeeping`, `importDishKeeping`, `experimentStartKeeping` (→ `KeptOr<…>`: opened + `kept`, or `KeepRefused`), `keepPlan`. Old methods untouched. |
| `src/persistence/store.ts` (additive) | `SlotInfo.activeSlot?` (autosave only), `worldId?` now also on named slots/autosave, `SaveRequest.worldId?/activeSlot?`, `SaveStore.slot(slotId)` (index read). |
| `src/ui/state.ts` | Shared flow: `replaceOpenDish()` (pause a running dish, try with `auto`, open the Keep sheet on slots-full/unavailable, restore run state on refusal/Cancel), `continueKeep`, `cancelKeep`, `exportBeforeKeep`, `chooseKeepReplacement`, `pickKeepReplacement`, `keepFlow/keepBusy/keepNotice` signals, `keepReturnTarget`, `keepPlanNow`. Keep-aware `startRecipe`, `startCustom(opts, onStarted)`, `loadSlot(slotId, label)`, `importFile`, `startExperiment`. Shared helpers `saveTextFile`, `exportDishFile`, `namedSlots` (also used by What if?). |
| `src/ui/panels/KeepChoice.tsx` (new) | The shared all-slots-used panel (`KeepChoicePanel`, `KeepStep`), extracted from WhatIfSheet's FullStepPanel/ReplaceStep, parametrized by id prefix ('whatif' / 'keep'), words and callbacks; an excluded slot (the save being opened) is listed but disabled. `inertOutside` moved here (shared by both modals). |
| `src/ui/panels/KeepSheet.tsx` (new) | The Keep sheet: a blocking modal (inert page, key guard, Escape/Close = Cancel, focus trap, focus back to the opener on Cancel) rendered into its own `#keep-root` on `<body>`, mounted on first use, so it can stand over pages other agents own (experiment card, the dish screen's More → Import). |
| `src/ui/panels/WhatIfSheet.tsx`, `WhatIfState.tsx` | FullStepPanel now renders `KeepChoicePanel ids="whatif"` with What if?'s own words; `FullStep = KeepStep & { pick }`; export/list use the shared helpers. Same ids, classes, focus and texts. |
| `src/ui/strings/keep.ts` (new), `src/ui/strings/whatif.ts` | Keep words: `keepChoiceText(verb, waiting)`, `keepPlanText(plan, verb, continueNote)`, `keptLine`, `withKeptLine`. What if? `planText` gains the 'saved' sentence. |
| `src/ui/views/NewDish.tsx` | Plan line (`new-dish-replaces`, from `keepPlanNow`) replaces "Creating a new dish closes …"; post-start Lab setup moved into the `onStarted` callback (also runs after the all-slots-used choice); a keep refusal shows in the page's alert. |
| `src/ui/views/Saves.tsx` | Open passes the save's name; the checkpoint confirmation asks the worker for the plan first and states it (no dish open: the old sentence stays — nothing is being replaced then). |
| `src/ui/views/Home.tsx` | Continue passes the autosave's name (comment: it only opens the autosave while no dish is open). |
| `tests/worker/keep-dish.test.ts` (new), `tests/worker/keep-strings.test.ts` (new), `tests/worker/whatif.test.ts` (additive) | See below. |
| `tests/e2e/keep-dish.spec.ts` (new) | See below. |
| `tests/e2e/new-dish.spec.ts`, `tests/e2e/observe.spec.ts` | Edited only where D-0033 changes what they see (below). |

`Play.tsx`, `Notebook.tsx`, `ExperimentRun.tsx` needed no change (their actions go through state.ts).

### Existing e2e specs edited, and why
- `tests/e2e/new-dish.spec.ts` (1 assertion): New Dish no longer says "Creating a new dish closes …"; it
  now states the plan: `“My dish” will first be saved to Slot 1 (empty now) and to Continue.`
- `tests/e2e/observe.spec.ts` (1 assertion): the checkpoint confirmation no longer tells the player to
  "save it to a slot first" (the dish is kept automatically); it states `“Little Living Garden” will first
  be saved to Slot 1 (empty now).` The first sentence, the accessible description and the post-open
  toast assertion are unchanged (the toast now starts with the keep line; the test's substring still matches).
- `tests/e2e/whatif.spec.ts`: NOT edited.

## What each test proves

`tests/worker/keep-dish.test.ts` (31 tests, real DishHost + in-memory store, requests sent through
`host.handle` exactly as sim.worker.ts does), for each of the five entry points (Play create, New Dish
create with overrides, experiment card EXP_103, import, Saved dishes → Open slot 9):
- changed dish, no own slot → first empty slot (slot1) and Continue, both holding the dish's exact state hash; the kept dish itself unchanged; the new dish is active;
- all ten used → `keepPlan` says `full`; the action is refused `slots-full` with the What if? sentence; the store is byte-identical; no new dish; the dish's tick and hash unchanged; it resumes running (Cancel = refusal keeps the run state);
- failed write (`failNextCommit`) → `save-failed`, readable per-action message, store byte-identical, no new dish, hash unchanged; the same action then succeeds;
- refusal wording per action (new dish / experiment / file / saved dish);
- no dish open → nothing kept, nothing written.
Plus: (a) an untouched What if? dish (R-G2) → `unchanged`, store identical, for every action;
(b) a dish saved to its own slot → plan `saved`, kept `saved`, store identical (not even Continue), for
every action; a dish opened from a slot and untouched → `saved`; **a changed dish is never skipped**: a
tick, a command, a journal note (invisible to the state hash — asserted — but in the save file), its slot
overwritten by another dish, its slot deleted → plan `slot` own and the slot rewritten with the exact
hash (mutation check: dropping the checksum comparison makes this test fail, first on the same-tick
command); for every action, the own-slot rewrite keeps the previous record as `previous` with the old
state and Continue gets the kept state; opening its own slot while changed → kept in the first
empty slot, the slot opens as saved and the opened dish is bound to it; `keepRefused.exclude` names the
save being opened and replacing it is refused (`failed`), replacing another works; exported → no named
slot written, Continue updated; paired EXP_A refused → no comparison, then replace → started; broken
import / unknown recipe → error, nothing kept; a device that cannot save → `unavailable` / `save-unavailable`,
then exported works; Continue rebinds to its active slot only while that slot holds the same world;
opening Continue writes no Continue first; a checkpoint branch is bound to no slot and is kept like any
changed dish.

`tests/worker/keep-strings.test.ts` (3): the keep line (slot / in place of / exported / Continue note /
nothing for none-unchanged-saved), the plan sentences for every plan kind and the checkpoint variant,
the Keep sheet's words per action, and What if?'s sentences unchanged plus the new 'saved' one.

`tests/worker/whatif.test.ts` (+1, additive): What if? over a dish its own slot holds exactly → plan
`saved`, kept `saved`, nothing written; after a change it is kept in its own slot again.

`tests/e2e/keep-dish.spec.ts` (6 journeys × phone-portrait, phone-landscape, desktop):
1. Garden → run → New Dish shows the plan line → Create → "Saved “Little Living Garden” to Slot 1 first." → Saved dishes lists it at the moment left → Open it (keeps "My dish" to Slot 2 first) → exact time and count. Axe, 16 px.
2. Play shelf: a dish already saved exactly → nothing written, no line; a changed dish → Slot 2 and the line; three rows.
3. (200 % text) ten slots filled → Play Start → Keep sheet (blocking, focus on its heading, page inert, 48 px targets, 16 px, no sideways scroll, axe) → Cancel → "Nothing was changed.", focus back on Start, the dish exactly as it was and paused → Escape cancels too → Replace a saved dish… → Slot 3 confirmed in words → the new dish starts; Slot 3 holds the kept dish.
4. (100 % text) ten slots filled → Open its own slot 10 while changed → Keep sheet; slot 10 listed as "(the save you are opening)" and disabled; Export → real download → "Open the saved dish" → slot 10 opens; ten saves unchanged.
5. Saved dishes → Open another save keeps the changed open dish in Slot 2 first, then opens the save as it was.
6. Import from More over a RUNNING dish: paused, kept to Slot 1, the file opens paused, one line.

## Commands and results

All run in this session on the shared 2-CPU machine (load average 6–8 from other agents' runs).

- `npx tsc -p tsconfig.json --noEmit`: clean for the whole repo at the final check. Midway, another
  agent's in-progress `tools/sim-tune.ts` (`reserveBand`) was red; that has since been fixed.
- `npx eslint <my 20 files: src + tests>`: clean. One `require-await` issue in my new test was fixed.
- `npx vitest run tests/worker/keep-dish.test.ts`: **31 passed**. After the last host change: the 15 tests
  covering (b), Continue, own slot and predecessor ran again, 15/15 passed. Mutation check: replacing the
  checksum comparison in `holdsExactly` fails "a changed dish is never skipped" (first on the
  same-tick `command` case). The original code was restored and passes.
- `npx vitest run tests/worker/keep-strings.test.ts tests/worker/whatif.test.ts tests/worker/keep-dish.test.ts`:
  `Test Files 3 passed (3) · Tests 59 passed (59)`. The existing What if? worker tests pass unchanged (24 + 1 new).
- Related suites, run after the refactor (11 files: app-flow, checkpoints, history-journal, comparison,
  view-switch, protocol, host, host-requests, persistence, whatif-ui, compare-client): 99 of 101 passed.
  The 2 failures are in `tests/sim/view-switch.test.ts` (action item 1; with the two-line harness fix, a
  patched copy passes 14/14).
  inspector-step, lab-commands, family, founders-newdish, registry-imports, lineage-host:
  `Test Files 6 passed (6) · Tests 54 passed (54)`.
- `E2E_PORT=4191 E2E_OUTDIR=tmp/dist-keep npx playwright test tests/e2e/keep-dish.spec.ts` (phone-portrait,
  desktop, phone-landscape): **`18 passed (17.2m)`**.
  - Run 1 had 13 passed and 2 failed, both desktop, both racing a 5-second toast on the slow desktop
    project.
  - Run 2 exposed a bug in my first toast recorder: it observed `documentElement`, which does not exist
    yet in an init script.
  - The spec now records every toast by observing `document`, and run 3 was all green.
- Final vitest batch, 20 files: keep-dish, keep-strings, whatif, whatif-ui, host-requests, host, protocol,
  compare-client, app-flow, inspector-step, checkpoints, persistence, history-journal, comparison,
  lab-commands, founders-newdish, registry-imports, lineage-host, family, view-switch.
  Result: `Test Files 1 failed | 19 passed (20) · Tests 2 failed | 212 passed (214)`. The 2 failures are
  the view-switch harness cases (action item 1).
- **Whole e2e suite**: `E2E_PORT=4191 E2E_OUTDIR=tmp/dist-keep npx playwright test --project=phone-portrait
  --project=desktop --project=phone-landscape` (all 12 specs), built from the final code.
  Result: **`135 passed (1.6h)`, exit 0**. Portrait 45/45, landscape 45/45, desktop 45/45.
  - `whatif.spec.ts` passes unchanged: 4 journeys × 3 projects.
  - The edited `new-dish.spec.ts` and `observe.spec.ts` pass on all three projects.
  - My port was stopped afterwards (`lsof -t -i :4191` is empty).
- Final re-run after the last code change (the tick/name pre-check in `holdsExactly`):
  `tests/worker/keep-dish.test.ts tests/worker/keep-strings.test.ts tests/worker/whatif.test.ts`
  gave `Test Files 3 passed (3) · Tests 59 passed (59)`. `npx eslint` on all 20 touched files: exit 0.
- Performance: `buildSaveFile` of a Garden at 1, 10 and 20 simulated minutes (83 / 716 / 2,598 alive;
  4.5 / 5.2 / 6.9 MB files) took 216–408 ms per build here.
  - The keep step writes that same build, so the 'saved' proof costs nothing extra when a write follows.
  - Plan displays skip the build unless the slot's index tick and name already match the dish.

## Not done, and why

- **Home → Continue**: no behavioural change was needed. Home opens the autosave only while no dish is
  open (with a dish open, Continue returns to it), so Continue never replaces an open dish. It goes
  through the same keep-aware `loadSlot` anyway (PROPOSED DECISION 6).
- **No plan line before Play shelf Start or a named-slot Open**: neither shows a confirmation or sheet,
  and the ruling asks for the plan only where one exists (New Dish, What if?, checkpoint question). The
  line afterwards says what happened.
- **No new CSS** (styles.css is not mine): the Keep sheet reuses the What if? modal classes.
- **`tests/sim/view-switch.test.ts`** (not mine) needs a two-line harness fix; see the action items.
- **ExperimentCard.tsx** copy (not mine) needs one sentence updated; see the action items.

## Bugs noticed elsewhere / lead action items

1. `tests/sim/view-switch.test.ts`: 2 tests fail with D-0033 ("the structure tools follow the world's own
   manifest…", "an older dish without paints or structures still opens…"). Its in-process `DishHost` has
   no save store, so an import over the open dish is now refused with `save-unavailable` (export it first),
   which is the specified behaviour on a device that cannot save. Fix (verified on a copy: 14/14 pass):
   ```diff
   +import { MemoryBackend, SaveStore } from '../../src/persistence/store';
   ...
        host = new DishHost(registry(), (m) => queueMicrotask(() => this.onmessage?.({ data: m })), {
          now: () => clock,
   -    });
   +    }, new SaveStore(new MemoryBackend()));
   ```
2. `src/ui/views/ExperimentCard.tsx` still says "Your current dish is kept in Continue first." That is now
   incomplete. Suggested: "Your current dish is saved first (to its own save slot, else the first empty
   one, and to Continue)."
3. Duplicate dish (More, and Lab Tools → Duplicate) switches the screen to the copy and leaves the
   original in worker memory, unreachable once another dish opens, while the toast says "the original is
   unchanged". Duplicate is not on D-0033's list; it arguably replaces the open dish too (see PROPOSED
   DECISION 10).
4. (Resolved during the session) `tools/sim-tune.ts` briefly did not typecheck (another agent's work in
   progress); the final `npx tsc` is clean.
5. DECISIONS.md: D-0027's "Starting a card replaces the open dish … after an autosave to Continue, without
   writing a named slot" is superseded by D-0033, and D-0030's owner-review note points to D-0033.
6. Fixed on the way (my files): `saveSlot`/`autosave` and the keep step wrote the slot index's `tick` from
   the live world after the save file's await, so an autosave of a running dish could list a later time
   than its file holds (Saved dishes, Continue). The index now takes the file's own serialized tick.

## PROPOSED DECISIONS

- PROPOSED DECISION 1 (D-0033 as built): one keep step for every replacement. The host's What if? keep
  step (`keepDish`) takes `{action, bindTo, opening}`. Every replacing request carries an optional
  `keepFrom` (the open dish and a WhatIfKeep). The new dish is prepared first (built, read and checked,
  parsed, or its arms realized), then the open dish is kept, then the new dish opens. A keep that cannot be
  done answers a `keepRefused` packet: codes slots-full / save-failed / save-unavailable / failed, a
  readable message, and `exclude`. It is not an error packet, so no error toast fires and nothing is
  paused. The wording follows the action ("…so the saved dish was not opened"). What if?'s messages are
  unchanged. Requests without `keepFrom` behave exactly as before.
- PROPOSED DECISION 2 ("unchanged since saved", proved exactly): a dish is exactly what its own slot holds
  when the slot's current index record has the checksum of the file a save would write now and the same
  name. The checksum is the SHA-256 of the canonical serialized world: state, history including the
  journal, command log, ledger entries, lineage, provenance. Only the write time differs. Then nothing is
  written, not even Continue, and the plan and kept kind are 'saved'. A dirty flag was rejected: any future
  mutation path that forgot to set it would silently skip a changed dish; the checksum cannot miss one
  (tested: a tick, a command, a journal note invisible to the state hash, a slot overwritten or deleted;
  and a mutation check).
  - Measured cost: one save-file build takes 0.2–0.4 s for a Garden file of 4.5–7 MB (1, 10 and 20
    simulated minutes, this loaded machine).
  - In the keep step this is the same build that is then written, so it costs nothing extra.
  - Plan displays (What if?, New Dish, the checkpoint question) pay one build only when the dish has a
    slot of its own whose index tick and name match it. A different tick or name is already a change,
    since the tick is part of the checksummed state; the index can only err towards writing.
- PROPOSED DECISION 3: the save being opened is never the keep target. A changed dish that opens its own
  slot S is kept in the first empty slot; S then opens as it was saved and the opened dish is bound to S.
  In the all-slots-used choice S is listed "(the save you are opening)" and disabled, and a replacement
  naming it is refused. Otherwise the keep would overwrite the very save being opened, leaving a slot
  newer than the dish bound to it.
- PROPOSED DECISION 4: the active slot survives Continue (additive index fields; the world and its schema
  are unchanged).
  - Every slot and autosave write records the dish's world id.
  - The autosave also records the named slot its dish is bound to (`activeSlot`).
  - Opening the autosave binds the dish to that slot again only while the slot still holds the same world
    id. It never guesses: older indexes without world ids bind nothing.
  - Without this, every session that starts with Continue would write a duplicate of the same dish into a
    new slot at its first replacement. D-0026 already defines the active slot as "opened from or last
    saved to"; this remembers it across sessions.
- PROPOSED DECISION 5: opening Continue (the autosave row in Saved dishes) writes no Continue first. The
  dish being left still goes to its slot, and the line then says nothing about Continue.
- PROPOSED DECISION 6: Home → Continue opens the autosave only while no dish is open, so it never
  replaces an open dish and needs no keep. This closes the ruling's Home → Continue item.
- PROPOSED DECISION 7 (for the lead or owner): (a) stays exactly What if?'s rebuild-exactly rule, which
  covers variant dishes only (R-G0 "Garden" included). An untouched Garden started from Play (tick 0,
  never saved) is kept like any other dish: it is saved to the first empty slot, as What if? already did
  (tests/worker/whatif.test.ts expects that).
  - Option: extend (a) to the authored recipe itself at tick 0 when this build rebuilds it exactly: same
    recipe revision and seed, no overrides, the state hash of a fresh realization, and an empty command
    log and journal. Untouched Gardens would then not use slots.
  - Cost: it changes What if?'s behaviour and one existing assertion.
- PROPOSED DECISION 8: the Keep sheet is a modal root on `<body>` (`#keep-root`, mounted on first use).
  Two entry points live in files other agents own (ExperimentCard.tsx, the dish screen's More → Import).
  It uses the What if? modal classes and the same blocking-modal rules as D-0026: the page is inert, keys
  never reach the dish, and Escape or Close cancels.
- PROPOSED DECISION 9: a refused replacement (a failed write) is a toast on the page the action came from.
  New Dish shows it in its alert, and inside the Keep sheet it shows in the sheet's notice with the choice
  left open. A replacing action over a running dish (More → Import) pauses it first and restores its speed
  when nothing is replaced.
- PROPOSED DECISION 10 (for the lead): Duplicate dish should keep the original first too, like the D-0033
  list, or say plainly that the original is closed. Today it stays in memory and becomes unreachable.
