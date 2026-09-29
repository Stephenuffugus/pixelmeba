# D-0033 keep-dish — re-verification, round 1

Re-verifier report, 2026-09-29. Scope: the fix round 1 of D-0033 "keep the open dish first"
(`keep-dish-fix1.md`), against the findings in `keep-dish-verify-saves.md` and `keep-dish-verify-player.md`.
Read-only: no repository file was changed except this one. Scratch work is in `tmp/reverify-keep-dish/`
(git-ignored). The e2e runs used `E2E_PORT=4221 E2E_OUTDIR=tmp/dist-keep-dish-30`; port 4221 was stopped
afterwards.

**Verdict: not done — ok = false.** One MAJOR problem remains. It is new in fix round 1, and it comes
from the fixer's own proposed decision C ("the dish Continue holds is kept first; Continue itself is
never rewritten"). After a relaunch the dish Continue holds is kept again, into a new slot each time, so
identical copies fill the ten slots. Reproduced in the built app and in the worker.

The two verifiers raised 16 findings, which are 14 distinct problems:
- 11 are fixed (VERIFIED OK below).
- 3 are partly fixed and leave a MINOR open each (problems 2–4 below):
  - dish-screen toasts are still 14 px (the CSS is outside the fixer's files);
  - one save still shows two time formats;
  - one toast still mixes quote styles.

Two new MINORs are listed as well (problems 5 and 6).

## Remaining and new problems (most severe first)

### 1. MAJOR (new in fix round 1) — the dish Continue holds is kept again after every relaunch, into a new slot each time

**Where**
- **Continue is never rebound.** `src/worker/host.ts:1799`: the keep step writes no Continue for the
  transient dish Continue holds (`!d.transient`). `keepSourceDish` (`host.ts:1665`) then drops its
  binding. So after "Saved “X” from Continue to Slot N first.", Continue's index still:
  - names no slot, or
  - names a slot that is excluded, or
  - names a record that was since replaced.
- **The new dish is never autosaved while it stays unrun.** `src/ui/state.ts:324`: `enterDish` sets
  `lastAutosaveTick = info.tick`. `autosave()` then skips an unchanged tick (`state.ts:339`). This
  covers:
  - the 30 s interval (`DishScreen.tsx:122`);
  - the background and page-close autosaves (`main.tsx:13/22`).

  So Continue keeps holding X until the new dish's tick changes.
- **The next launch keeps X again.** `continueToKeep` (`host.ts:1581-1599`) finds X unbound (or bound
  only to the slot being opened). Its quick 'saved' check looks only at the bound slot. X is therefore
  written again, to the first empty slot.

**Repro in the built app** (desktop, port 4221; `tmp/reverify-keep-dish/e2e/relaunch-dup.spec.ts`, log
`e2e-probe2.log`):

*R1, via Play → Start:*
1. Garden, run to 0:05, background autosave (only Continue holds it).
2. Reload, then Play → Start. The line says "Saved “Little Living Garden” from Continue to Slot 1 first."
3. Leave the new Garden at 0:00: background, wait 32 s, background again.
4. Reload. Home still offers "Continue — Little Living Garden — 5 s simulated. Opens paused." That is
   the dish already in Slot 1, not the Garden opened last.
5. Play → Start. The line says "Saved “Little Living Garden” from Continue to Slot 2 first."
6. Saved dishes lists Slot 1 and Slot 2, both "5 s simulated": identical copies.

*R2, via Saved dishes → Open:*
1. Garden, run 1 s, then Save → Slot 1.
2. Run to 0:08, background autosave.
3. Reload, then Saved dishes → Open Slot 1. The line says "Saved “Little Living Garden” from Continue to
   Slot 2 first. Opened “Little Living Garden” — paused where you left it."
4. Look without running, background.
5. Reload, then Open Slot 1 again. The line says "… from Continue to Slot 3 first. …"
6. Saved dishes lists Slot 1 (4 s), then Slot 2 and Slot 3, both "8 s simulated": identical copies.

**Worker repro** (`tmp/reverify-keep-dish/keep.reverify.probe.test.ts`, a second `DishHost` on the same
backend per launch):
- **Q2:** three launches write slot1, slot2 and slot3. All three hold X's state hash.
- **Q2b:** Continue is bound to slot5. Launch 1 writes slot5. Launch 2 plans
  `{"kind":"slot","slotId":"slot1","own":false,"fromContinue":true}` and writes slot1.
- **Q2c (control):** the same flow with the dish open in-session writes nothing on the next launch. That
  keep binds Continue to the record it wrote, so the plan is 'saved'.

**Effect**
- **Common triggers.** Any launch in which the player opens or starts something and leaves it unrun
  spends another of the ten slots on an identical copy. Examples:
  - opening a save just to look at it;
  - a New Dish set up while paused;
  - an import;
  - What if? from Play.
- **Where it ends.** Once the slots are full, every such action raises "All ten save slots are used" for
  a dish that is already saved several times.
- **Same symptom as round 1.** Identical copies filling the slots is the symptom of round 1's untouched-start
  MAJOR. It also compounds the stale Home card, where Continue offers a dish left two launches ago.
- **The fixer's tests miss it.** They check one launch only. They also assert that Continue's index is
  unchanged after the keep: `keep-dish.test.ts:787/794` (the `continueBefore` check).

**Fix options (any one)**
- (a) When the keep of the dish Continue holds writes a slot, rebind Continue to that record. The file is
  the same `built`, so this means writing the autosave with `activeSlot`/`activeRecord` of the record
  just written. The next quick check is then 'saved'.
- (b) In `continueToKeep`, answer 'saved' when any named slot's index has Continue's checksum and name.
  This reads the index only; nothing is loaded.
- (c) Force an autosave of the dish a replacing action opens, as opening a checkpoint already does
  ("Continue now follows this branch"). This also stops Home offering a dish the player left launches
  ago.

Whichever is chosen, add a worker test (launch, keep from Continue, launch, keep again: nothing written)
and an e2e journey (R1 or R2).

### 2. MINOR (remaining, player 4) — the kept line is still a 14 px toast on the dish screen

- `src/ui/styles.css:489`: `.toast { font-size: var(--fs-small) }`. This file is outside the fixer's list.
- Measured 14 px in R1 (desktop, prompts off) for "Saved “Little Living Garden” from Continue to Slot 1
  first." It applies to every dish-screen toast:
  - the kept line with prompts off;
  - Open, Import and Duplicate;
  - "Nothing was changed."
- The fixer's one-line fix still has to land: `font-size: var(--fs-body)` (UX §4.1, D-0030).
- Where a prompt exists, the line now leads it at 16 px (verified below).

### 3. MINOR (remaining, player 6) — one save shows two time formats

- The Keep sheet and the replacement confirmation say "Slot 3: Little Living Garden · 0:05" and
  "… at 0:00 in Slot 3 …".
- Saved dishes says "5 s simulated" (`src/ui/views/Saves.tsx:94`).
- The new slot numbers link the two screens, so the save can be found. The fixer left the formats
  unchanged on purpose: What if?'s texts are byte-for-byte, and other specs assert "N s simulated".
- Lead's call.

### 4. MINOR (remaining, player 8) — one toast mixes quote styles

- Opening an automatic checkpoint over a changed dish gives "Saved “X” to Slot 1 first. Opened the
  automatic checkpoint of "X" at 1:02 as a new branch, "X (1:02)", paused. …"
  - The kept line uses curly quotes (`src/ui/strings/keep.ts`).
  - `checkpointOpenedText` uses straight quotes (`src/ui/state.ts:1543`).
- `Saved "X".` (`state.ts:360`) is pre-existing.
- The fixer kept both because `observe.spec.ts` and others assert them. This needs a ruling on changing
  those assertions.

### 5. MINOR (new, test coverage) — the paired card's kept line has no test

- The fix-round claim: a paired card shows the line in the run's setup panel, not as a toast over the A/B
  switch. The code is `experimentKeptLine` (`src/ui/state.ts:1394/1433/1469`) and
  `data-testid="experiment-kept"` (`src/ui/views/ExperimentRun.tsx:216-220`).
- Nothing in `tests/` reaches it. The fixer's journey 11 covers only the single-arm card EXP_101.
- My probe R3 (`tmp/reverify-keep-dish/e2e/paired-kept.spec.ts`, phone-portrait and desktop, 2/2
  passed) shows the feature works:
  - EXP_102's card says "“Little Living Garden” will first be saved to Slot 1 (empty now) and to
    Continue.";
  - after Start, the setup panel shows "Saved “Little Living Garden” to Slot 1 first." at 16 px;
  - no toast carries the line;
  - Saved dishes has it in Slot 1.
- Suggest adding R3 to `tests/e2e/keep-dish.spec.ts`.

### 6. MINOR (new, docs and report accuracy) — "an older save without recorded choices is always kept" is not what the code does

- **The claim.**
  - The `rebuildsExactly` doc comment (`src/worker/host.ts:1452-1453`) says a start this build cannot
    name exactly, such as "an older save without recorded choices", is never called unchanged.
  - The fix report says the same: "it cannot be named exactly, so it is always kept".
- **The code.** `freshStart` (`host.ts:1486-1488`) rejects only malformed overrides (`o === null`). With
  no overrides recorded it realizes the recipe's default start and compares.
- **Probe Q5.** A tick-0 Garden whose provenance has no `overrides` plans
  `{"kind":"unchanged","name":"Old garden","seed":104729}`.
- **Impact.** The behaviour is safe: the whole serialized world, content manifest included, must match,
  so it really is the Play shelf start. Only the comment, the report and proposed decision B misstate
  the rule. Correct them before the DECISIONS entry is written.

### Needs a lead ruling (not defects; disclosed by the fixer)

- **B generalizes D-0026's rule (a)** from What if? variants to recipe, New Dish and card starts.
  - Consequence: What if? over an untouched Garden no longer writes a slot.
  - One existing What if? unit test needed a setup step (`h.steps('g', 1)`,
    `tests/worker/whatif.test.ts:711`); its assertions are unchanged.
  - D-0026's text must change with it.
- **C: the dish Continue holds is kept when no dish is open.** Keep it, but fix problem 1.
- **D: Duplicate is now a replacing action.** It writes a slot, or with all ten used raises the Keep
  sheet, on every Duplicate of a changed dish, Lab Tools included.
- **E, F and G** are UX choices already covered above.
- **D-0027** is superseded.
- **Files outside the fixer's list:** `ExperimentCard.tsx` and `view-switch.test.ts` were both required
  by the findings.

## Round-1 findings

- **VERIFIED OK — MAJOR (saves): a stale Continue was written over the player's newer save in its bound
  slot.**
  - **The fix.** `bindingOf` (`host.ts:1640-1649`) binds Continue only while
    `slot.current === auto.activeRecord`, with the same world id. The binding is recorded as the
    autosave's state is taken (`host.ts:324-339`), and by the keep's own Continue write
    (`written?.current ?? ownRecord`, `host.ts:1799-1803`). `saveToSlot` forces the autosave
    (`state.ts:360`).
  - **The verifier's original e2e repro now passes** (`stale-continue.spec.ts` copied unchanged, desktop,
    port 4221). Slot 1 still opens "0:08 · 61 alive", the save with the added Amoeba. After Start the
    toasts are `[]`, so nothing was written.
  - **Worker probe Q1** (P1's flow, no Continue refresh): the plan is `slot2, own:false`, and Slot 1's
    record and hash are untouched.
  - **Worker probe Q1b** (the UI's flow, forced autosave): the plan is `saved`, and the store is
    byte-identical.
  - **Mutation check.** I reran the fixer's M1 (binding by world id only) against the new tests: 3
    failed, as reported.
  - **Every writer of the autosave checked.** The autosave handler and `keepDish`, including the
    'exported' path. A race between the two can only unbind, never bind stale.
- **VERIFIED OK — MINOR: `npm run check` red in `view-switch.test.ts`.**
  - `view-switch.test.ts` 14/14 pass.
  - `npm run typecheck`, `npm run lint` (whole repo) and the full `npx vitest run` (74 files, 689 tests)
    all pass.
- **VERIFIED OK — MINOR (saves): rule (a) skipped a What if? dish with a journal note made at its
  start.**
  - `rebuildsExactly` compares `canonicalJson(serializeWorld(…))` of the dish and of a fresh realization
    (`host.ts:1455-1465`).
  - The verifier's P9 flow (Q3): the plan is Slot 1, and the file written contains the note's id.
  - The fixer's test covers it, and so does their M2.
- **VERIFIED OK — MAJOR (player) / MINOR (saves): an untouched recipe start used a slot on every
  replacement.**
  - Q4: the Garden restarted three times writes nothing (`kept: unchanged`, no slot used). A paired card
    at 0:00 (EXP_102) plans `unchanged`, seed 102.
  - The fixer's "a change at 0:00 is never skipped" covers a tick, a command, a journal note and an
    evolution setting.
  - e2e journey 2 passes on phone-landscape (my run).
  - The rule change itself needs the lead (B above).
- **VERIFIED OK — MINOR (saves P7): opening the Continue row while the open dish owns the slot Continue
  names.**
  - `excludedBy` (`host.ts:94-96`) excludes only a named slot being opened.
  - The opened Continue is bound after the keep (`host.ts:368-375`).
  - The fixer's test covers it, and M3 fails it.
- **VERIFIED OK — MAJOR (player 2) / MINOR (saves 6): the experiment card still promised "kept in
  Continue first".**
  - The sentence is gone. `<KeepPlanLine verb="experiment">` shows the worker's plan
    (`ExperimentCard.tsx:125-129`).
  - Journey 11 passes, and R3 shows the exact plan line on EXP_102.
- **VERIFIED OK — MINOR (saves 7): no test covered restoring a running dish after Cancel.**
  - Journey 10 passes on phone-landscape (my run).
  - I rebuilt the app myself with the fixer's mutant config: `resumeKept()` removed, bundle hash
    `index-BTcWLGCx.js` against `index-BUEkDfM4.js`.
  - The journey fails on that build: "Expected: "Pause" Received: "Run"".
- **VERIFIED OK, with problem 1 above — MAJOR (player 3): after a relaunch, replacing actions dropped the
  dish on Home's Continue card.**
  - It is now kept on every entry point. The fixer's 10 worker tests pass, and M4 fails 10 of them.
  - Journey 8 passes on phone-landscape.
  - R1 and R2 show the first keep happening.
  - The repeat on the next launch is problem 1.
- **Partly fixed — MINOR (player 4): the line is 14 px.** Where there is a prompt it now leads it at
  16 px. The toast CSS is problem 2.
- **VERIFIED OK — MINOR (player 5): the line covered the start prompt.**
  - Play Start and a single-arm card merge the line into the prompt (`state.ts:570-571`, `1441-1443`).
  - `setSpeed` still clears it (`endsWith(PLAY_PROMPT)`, `state.ts:787`).
  - A paired card shows it in the setup panel: R3, 16 px, no toast, on phone-portrait and desktop.
  - Journey 11 passes.
- **VERIFIED OK, apart from problem 3 — MINOR (player 6): "Slot N" could not be found on Saved dishes.**
  - Rows carry "Continue" and "Slot 1" … "Slot 10", in numeric order (`Saves.tsx:11-14`, `78-80`).
  - R1 and R2 show "slot1: Slot 1 …", "slot2: Slot 2 …", and so on.
- **VERIFIED OK — MINOR (player 7): what a screen reader hears in the Keep sheet.**
  - The dialog has `aria-describedby="keep-full-text"` (`KeepSheet.tsx:122-126`).
  - The consequence line sits in a polite live region, and Replace is described by it
    (`KeepChoice.tsx:143-156`).
  - Journey 3 asserts the accessible name and both descriptions, and passes.
- **Partly fixed — MINOR (player 8): wording nits.**
  - "Opened “X”" and "Imported “X”" now use curly quotes.
  - A replaced save is named with its moment.
  - The two wordings for one event are accepted: What if?'s texts stay byte-for-byte.
  - The checkpoint mix is problem 4.
- **VERIFIED OK — MINOR (player 9): Duplicate said the original was unchanged, then lost it.**
  - `duplicateCurrent` goes through the keep step, then disposes the original
    (`state.ts:491-512`, `host.ts:440-453`).
  - The fixer's 2 worker tests pass, and M5 fails both.
  - Journey 9 passes on phone-landscape.
  - The rule itself needs the lead (D above).

## Commands and results (this session)

- **Relevant unit tests.** `npx vitest run tests/worker/keep-dish.test.ts tests/worker/keep-strings.test.ts
  tests/worker/whatif.test.ts tests/sim/view-switch.test.ts` → `Test Files 4 passed (4) · Tests 99 passed
  (99)`.
- **Worker probes.** `npx vitest run --config tmp/reverify-keep-dish/vitest.config.ts` → `Tests 2 failed |
  7 passed (9)`.
  - Q2 and Q2b fail: they assert the absence of problem 1.
  - Q1, Q1b, Q2c, Q3, Q4, Q5 and Q8 pass. Q8: a broken import with no dish open keeps nothing.
  - Logs: `probes1.log`, and `probes1b.log` (verbose).
- **Mutation M1 rerun.** `npx vitest run --config tmp/fix1-keep/vitest.config.ts
  tmp/fix1-keep/m1-binding/keep-dish.probe.test.ts -t "Continue older"` → `Tests 3 failed | 1 passed`.
- **Checks.**
  - `npm run typecheck` → exit 0.
  - `npm run lint` → exit 0.
  - `npx vitest run` (whole suite) → `Test Files 74 passed (74) · Tests 689 passed (689)`, 1,216 s.
- **e2e, all with `E2E_PORT=4221 E2E_OUTDIR=tmp/dist-keep-dish-30`:**
  - `npx playwright test --config tmp/reverify-keep-dish/playwright.config.ts --project=desktop`:
    - the verifier's `stale-continue.spec.ts` passed;
    - R1 and R2 failed on their duplicate assertions (problem 1).
    - Logs: `e2e-probe1.log`, and `e2e-probe2.log` after a helper fix.
  - `… --project=desktop --project=phone-portrait paired-kept` → `2 passed` (R3).
  - `npx playwright test tests/e2e/keep-dish.spec.ts --project=phone-landscape` → `11 passed (5.6m)`.
  - The resumeKept mutant:
    - built with `npx vite build --config tmp/fix1-keep/vite.mutant.config.ts --outDir
      tmp/dist-reverify-mutant`;
    - served with `vite preview` on port 4221;
    - `npx playwright test tests/e2e/keep-dish.spec.ts -g "Cancel lets it run on" --project=phone-portrait`
      → `1 failed` ("Expected: "Pause" Received: "Run""), as intended.
  - Port 4221 was stopped after each run (`lsof -t -i :4221` is empty).
- **Not rerun by me:** the whole e2e suite on three projects. The fixer's `tmp/fix1-keep/e2e-full.log`
  shows `150 passed (1.4h)`. It was built at 09:16, after the last change to `src/` (08:24) and `tests/`
  (08:44).
