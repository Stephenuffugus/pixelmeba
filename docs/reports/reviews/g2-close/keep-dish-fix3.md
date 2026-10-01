# Fix round 3 for D-0033 "keep the open dish first"

All five carry-overs are fixed and tested. Nothing is committed. I did not write `docs/reports/reviews/g2-close/keep-dish-fix3.md` because my harness forbids report files, so the report is this message. Scratch files are in `tmp/fix3-keep/` (git-ignored). Port 4191 is stopped.

## Per carry-over

### 1. A change made while paused reaches Continue at the next autosave — FIXED

**How it works now**
- **Worker** (`src/worker/host.ts`, new `autosave`): at every autosave event it builds the dish's file. It writes Continue unless Continue already holds exactly that file, and the reply says whether it wrote (`slotSaved.wrote`, new in `protocol.ts`; `client.autosave()` returns `{slot, wrote}`).
- **Autosaves run one at a time** in the worker. So "going to the background" and "leaving the page" firing together write once.
- **What "exactly" means** (new `holdsSave` in `src/persistence/store.ts`, documented at the code): Continue's current index record equals, field by field, the record this write would make. Only the write time and the storage bookkeeping (record ids, compressed size) are ignored. That covers:
  - the checksum (SHA-256 over the canonical serialized world, with the tick, world id and journal inside it);
  - the name;
  - the binding (`activeSlot`, `activeRecord`);
  - the index copies (tick, recipe, world id, variant, evolution, registry).
- `save()` now builds its record with the same new function (`slotRecordFor`), so the comparison can never miss a field a write sets. A save writes exactly what it did before.
- **UI** (`src/ui/state.ts`): the tick-based skip is gone (`lastAutosaveTick`, `NOT_AUTOSAVED`, `enterDish(…, continueHolds)`, `autosave(force)`). The only pre-check left is "no dish open".
- **Consequence of comparing the binding:** if only the binding changed, Continue is written once. Example: a dish kept back into its own slot under a new record, then reopened from Continue. After that one write it is not written again. There is a test for this.

**Tests**
- New file `tests/worker/keep-autosave.test.ts`, 14 tests. It drives the app's state module against the real host.
  - Each of these, made while paused, reaches Continue at the next `autosave()`: Add Life, an evolution-setting change, a branch rename, a pin, and a journal note whose own autosave failed.
  - Repeated autosaves of an unchanged dish leave the store byte-identical (every record's bytes compared).
  - Run then pause writes once. Three autosaves asked together write once.
  - A dish opened from Continue is not written until it changes.
  - A manual save always rewrites Continue (the slot's new record is a new binding).
  - Unit tests of `holdsSave` and of the `wrote` reply.
- `tests/worker/keep-continue-ui.test.ts`: two "nothing new to write" checks now read the store bytes instead of counting requests, since the UI now always asks the worker.

**Showing the tests fail on the old code** (`tmp/fix3-keep/vitest.old.config.ts`; files swapped at load time, tracked files never touched):
- **HEAD's code swapped in** (state, host, client, protocol, store and the other changed modules): 13 of 14 fail. The four paused-change tests fail at the "Continue holds the change" assertions (keep-autosave.test.ts:163, :177, :198, :237).
- **UI that skips when the tick did not move** (new worker): the same four fail at the same lines.
- **Worker that always writes:** the write-nothing tests fail on store byte identity (10 failures across the two files).
- **Binding ignored in "exactly":** 3 failures.

**Measured cost** (FIRST_DISH_V1, seed 104729, 6,000 ticks = 10 dish-minutes, 716 alive, 5.3 MB file; this machine had a load average of 8–10 on 2 CPUs; script `tmp/fix3-keep/measure-autosave.ts`):

| | median | minimum |
|---|---|---|
| One build + checksum (the check every event now does) | 277 ms / 504 ms (two runs) | 171 ms / 207 ms |
| gzip of the file (a write only) | 312 ms / 418 ms | — |
| Autosave of an unchanged dish (build + compare, nothing written) | 528 ms | 302 ms |
| Autosave that writes, before this round | 597 ms | — |

- The page-leave autosave is posted without waiting.
- An unchanged dish has nothing to write. A changed dish costs the same as before.
- A paused dish now costs about 0.2–0.5 s of worker time every 30 s.

### 2. One time format per save — FIXED
- **What changed:**
  - All Saved dishes rows (Continue, Slot 1–10) and the checkpoint rows now read "at 0:05 dish time · date" (new `atDishTime`).
  - Home's Continue card reads "Little Living Garden — at 0:05 dish time. Opens paused." (new `continueCardText`).
  - The Keep and What if? sheets are unchanged ("· 0:05").
  - I also changed the Continue row on Saved dishes, not only the named rows: the `backgroundAutosave` helper reads that row, and it is a save too.
- **Assertion edits:**
  - `whatif.spec.ts:158`
  - `observe.spec.ts:209`
  - `keep-dish.spec.ts`:
    - new `atClock` helper;
    - `backgroundAutosave` regex (line 98);
    - lines 190, 219, 244, 338–339, 386, 406, 480, 494 and 514;
    - journey 12 at lines 617 and 626, journey 13 at lines 662–663;
    - a new 16 px check at line 192.
- **Tests:** `tests/ui/keep-words.test.ts`.
- **Fails on old code:**
  - with HEAD's code swapped in, the new functions do not exist;
  - against a build of HEAD (`tmp/fix3-keep/dist-head`), journey 1 fails at "at 0:05 dish time" (it received "5 s simulated").

### 3. Curly quotes around dish names — FIXED
- **What changed:**
  - `state.ts`: the manual-save toast `Saved “X”.` and its failure variant (both now built by `savedToastText`), and `checkpointOpenedText`.
  - `host.ts`: the two keep refusals, `All ten save slots are used, so “X”…` and `“X” could not be saved…`. What if? shares these; `whatif.test.ts:458` matches without quotes and is unaffected.
- **Assertion edits:**
  - `checkpoints.test.ts:437`, `:440`
  - `observe.spec.ts:202`
  - `keep-dish.spec.ts:77`
  - `keep-dish.test.ts:200`, `:222`, `:942`, `:1017`
- **New guard test** in `keep-words.test.ts`: no straight quotes around an interpolated value anywhere in `src/ui` (attribute selectors and comments excepted), and none around the dish name in `host.ts`.
- **Fails on old code:**
  - with HEAD's code swapped in, the wording tests fail;
  - the same pattern run over HEAD's files flags `state.ts:374`, `:375`, `:1561` and `host.ts:1819`, `:1825`;
  - against the HEAD build, the toast journey and `observe.spec.ts:204` fail on the quotes.

### 4. Toasts at body size — FIXED
The one-line font change alone was not enough. At 200 % text it made toasts cover and block the zoom buttons, and in phone landscape the longest keep line was cut off at the bottom of the dish view. So the toast rules in `styles.css` now also:
- use a px frame and line height 1.3, so at large text the room goes to the words;
- take no presses (`pointer-events: none`), so a control under a toast always works;
- stay inside their area (maximum width and height);
- in the dish view, keep clear of the zoom-button column;
- in a short window at 200 % text (≤ 480 px tall, i.e. phone landscape), use the full width of the dish view so no word is cut off. The toast then lies over the zoom buttons, which still work.

**Measured with the longest keep line** ("Saved “…” to Slot 2 first. Opened “…” — paused where you left it."):

| | phone portrait | phone landscape | desktop |
|---|---|---|---|
| 200 % text | fits, clear of zoom | fits, over zoom (presses pass) | fits, clear of zoom |
| 150 % and 100 % text | fits, clear of zoom | fits, clear of zoom | fits, clear of zoom |

At 200 % the toast is 32 px. Before this round it was 28 px and blocked all three zoom buttons in every layout.

**Test:** new journey 15 in `keep-dish.spec.ts`. It measures the toast the moment it appears and checks: body size, wholly inside the dish view, not clipped, clear of the bars, no control blocked, clear of the zoom buttons except in phone landscape at 200 %.
- **Fails on old code:** with HEAD's stylesheet it fails at the font size (28 instead of 32). With only the one-line font change it fails because "Zoom in" and "Zoom out" are blocked, and in landscape because the toast leaves the dish view.

**Remaining limit:** in 800×360 at 200 % a toast shows about 5 lines (roughly 115 characters). Longer toasts are cut off at the dish view's bottom edge in that layout only. Examples: the checkpoint-opened toast (about 150 characters), the same with a kept line (about 200), and some journal and error toasts. The live region still reads them whole. See PROPOSED DECISION E.

### 5. Name the ability in module gain and loss lines — FIXED
- **Feed** (`feed.ts`): "A Sunbead offspring gained Reserve chamber." / "lost Reserve chamber."
  - When the same birth had another inherited change, it adds "… and inherited a different trait."
  - A burst coalesces as before, one line per gained or lost module.
  - Quantitative changes keep their existing line.
- **Birth record row** (`strings/lineage.ts`): "gained Reserve chamber (E05)".
- **Where the names come from:** the dish's own recorded module list (`DishInfo.registry`) and the birth's recorded mutation descriptor, which `visualEvents` now carries on each mutation event. Nothing is hard-coded.
- **Tests:** `tests/ui/feed-modules.test.ts`, 7 tests.
  - On seed 11 at Accelerated, every module event's descriptor is checked against its birth record. Birth 72 at tick 305 produces exactly "A Sunbead offspring gained Reserve chamber."
  - On seed 101 at Accelerated, the first branch's founder row reads "gained Reserve chamber (E05)".
  - All 7 fail with HEAD's code swapped in.
- `lineage.spec.ts` passes 3/3 on each project.

## Round-2 defects
- The UI half of round 2's fix (c), marking an opened dish as already autosaved and skipping by tick, is what dropped paused changes. It is replaced by the worker-side check above.
- I found no other round-2 defect.

## Files changed
- **Mine:**
  - `src/worker/host.ts`, `src/worker/protocol.ts`, `src/worker/client.ts`
  - `src/persistence/store.ts` (additive: `slotRecordFor`, `holdsSave`)
  - `src/ui/state.ts`, `src/ui/feed.ts`, `src/ui/strings/lineage.ts`
  - `src/ui/views/Saves.tsx`, `src/ui/views/Home.tsx`
  - `src/ui/styles.css` (toast rules only)
  - Tests:
    - new: `tests/worker/keep-autosave.test.ts`, `tests/ui/keep-words.test.ts`, `tests/ui/feed-modules.test.ts`;
    - edited: `tests/worker/keep-continue-ui.test.ts`, `tests/worker/keep-dish.test.ts` (quote assertions only), `tests/persistence/checkpoints.test.ts` (quote assertions only), `tests/e2e/keep-dish.spec.ts`.
- **Outside my list (smallest edits):**
  - `src/worker/snapshot.ts`: `visualEvents` takes the module list and carries the recorded mutation descriptor.
  - `src/sim/lineage.ts`: an optional `mutModuleName` field on the lineage record row, read-only query output, neither hashed nor saved.
  - `tests/e2e/whatif.spec.ts:158` and `tests/e2e/observe.spec.ts:202`, `:209`, as the carry-overs named.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit` → exit 0. `npx eslint <the 20 touched files>` → exit 0.
- Unit: the three new files 27/27. Every unit file importing state, host, feed, store, snapshot or the host helper: 35 files, **394/394 passed** (log `tmp/fix3-keep/unit-related.log`).
- Old-code and mutant runs: logs `tmp/fix3-keep/mode-*.log`, results as listed under each carry-over.
- e2e (keep-dish, whatif, observe, garden and lineage specs, all three projects; log `tmp/fix3-keep/e2e-full.log`):
  - phone-portrait 33/33, phone-landscape 33/33.
  - desktop 29/33 in that run (load average ~10 on 2 CPUs):
    - the new toast journey failed at first because my own helper measured the toast after it had gone; I fixed the helper;
    - `lineage.spec.ts:196` and `observe.spec.ts:53` ran out of their 240 s and 360 s budgets (traces show 5–10 s per step);
    - `whatif.spec.ts:286` was cut by my 2-hour cap.
  - Rerun: the fixed toast journey 3/3 on all projects; those three desktop tests 3/3 (logs `tmp/fix3-keep/e2e-rerun-*.log`).
  - All 99 tests have a passing run on the final code.
- Axe has no serious or critical violations on Saved dishes or on Home with the Continue card (100 % and 200 %). The moment line and the Continue card text are at least 16 px.

## Proposed decisions
- **PROPOSED DECISION L (D-0033 "Continue", as built):** every autosave event reaches the worker, which writes Continue unless `holdsSave` holds. "Exactly" covers the checksum, name, binding and index copies. Autosaves are handled one at a time, and the reply carries `wrote`. A binding-only change is written once. Measured costs are above.
- **PROPOSED DECISION E (toasts):** body size, px frame, no presses taken, clear of the zoom buttons, full width only in short windows at 200 %. In 800×360 at 200 %, toasts over about 115 characters are cut off. Proposed follow-up: in that layout, send long messages to the dish's notice box (the prompt) or split them.
- **PROPOSED DECISION J:** the Continue row on Saved dishes also uses the dish clock (one format per save).
- **PROPOSED DECISION K2:** What if? idea titles are still straight-quoted, at `host.ts:1741` and `src/sim/variants.ts:537`, `:542`, `:547`. Changing them needs `whatif.test.ts:438` edited, and I may only add to that file.
- **PROPOSED DECISION M:** a birth that gained or lost a module and also inherited another change reads "… gained Reserve chamber and inherited a different trait." A module name the world's content does not record shows its id.

## Note for the lead
The top strip's dish clock ("0:02 · 56 alive", `.topbar .time`) is 14 px at 100 %. It is outside my rules; UX §4.1's 16 px minimum may apply to it.
