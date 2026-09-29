# D-0033 "keep the open dish first": fix round 1

Fixer report for the lead, 2026-09-29. It answers the findings in `keep-dish-verify-saves.md` and
`keep-dish-verify-player.md`. Nothing is committed; the lead commits.

Scratch files are in `tmp/fix1-keep/` (git-ignored): logs, mutation probes and the mutant build config.

## Per problem

### MAJOR (saves): a stale Continue overwrote the player's newer save in its bound slot — FIXED

- **The binding now needs the recorded record.** The autosave index now records `activeRecord`: the
  bound slot's current record id at the moment Continue's state is taken.
  - It is read before the file is serialized (`host.ts`, saveSlot/autosave handler).
  - The keep step's own Continue write records the record it has just written (`keepDish` →
    `writeBuilt(…, written?.current ?? ownRecord)`).
  - `bindingOf(AUTOSAVE)` binds only while `slot.current === activeRecord`, and the world id still
    matches. Continue is then that save, or a later moment of the same dish.
  - A save written after Continue unbinds it, so a replacement can never write the older Continue
    over the newer save.
  - Older indexes have no `activeRecord` and bind nothing. That errs towards writing a new slot, as the
    builder's 'saved' rule does.
  - `store.ts` changes are additive only: `SlotInfo.activeRecord?` and `SaveRequest.activeRecord?`.
- **Opening Continue decides its binding after the keep.** A keep can write the very slot Continue
  names, so the order matters (this also fixes P7 below).
- **A manual save always refreshes Continue.** `saveToSlot` now calls `autosave(true)`, which writes
  even at an unchanged tick. After More → Save, Continue is that exact save, including a change made
  while paused. The verifier's reproduction therefore now ends with the player's save intact, and
  nothing is written at all.
- **Tests:**
  - `tests/worker/keep-dish.test.ts` → "Fix round 1: a Continue older than the slot it names…" has
    four tests:
    - probe P1 in a second session on the same backend: the reopened stale Continue goes to Slot 2,
      and Slot 1's record and hash are untouched;
    - a keep binds Continue to the record it wrote;
    - an older index binds nothing;
    - P7.
  - e2e `keep-dish.spec.ts` "a manual save always refreshes Continue…" is the verifier's repro, on all
    three projects: Add Life at the same tick, Save over Slot 1, reload, and Continue opens exactly
    that save. Starting anew then writes nothing, and Slot 1 still opens with the added life.
  - Mutation M1 restored the builder's binding (same world id only). Three of these tests fail, the
    first one with the plan `slot1` instead of `slot2`.

### MINOR: `npm run check` red — 2 failures in `tests/sim/view-switch.test.ts` — FIXED (file outside my list, see "Files outside the list")

- This is the builder's proposed harness fix: the in-process `DishHost` now gets
  `new SaveStore(new MemoryBackend())`, as the real app has. It is two lines plus a comment.
- What the test proves is unchanged: the import over the open dish now keeps that dish first, as
  D-0033 requires.
- `view-switch.test.ts` passes in the related-suite run below (20 files, 240 tests).

### MINOR (saves): rule (a) skipped a What if? dish with a journal note made at its start — FIXED

- **The check.** `rebuildsExactly` no longer compares only the state hash. It compares the whole
  serialized world with what this build realizes from the dish's recorded start under the same world
  id: `canonicalJson(serializeWorld(dish)) === canonicalJson(serializeWorld(fresh))`.
- **What that covers.** It is everything the save file's checksum covers: history with the journal,
  the command log, lineage, branches (names, pins) and provenance. A note, a rename or a pin is
  therefore a change.
- **What if? stays as strict as before.** For a variant dish, the same D-0026 identity checks still
  gate it first (`recordMatchesBuild`: revision, checksums, content hash, rule versions).
- **Test:** "a What if? dish with a journal note made at its start is kept with the note". The plan is
  Slot 1, the kept file contains the note's id, and the state hash is unchanged by the note.
- **Mutation M2** (the old rule) fails it.

### MAJOR (player) / MINOR (saves): an untouched recipe start used a slot on every replacement — FIXED (PROPOSED DECISION B)

- **The rule.** Rule (a) ("unchanged, rebuilds exactly") now also covers a tick-0 dish whose whole
  serialized world equals a fresh realization of its recorded start (`host.ts freshStart`). That
  includes:
  - a Play shelf recipe;
  - a New Dish with its recorded seed and choices (including Empty);
  - a single-arm experiment card, or a paired card without a timed change.
- **What is written.** Nothing: not a slot, not Continue.
- **What is said.** The plan names the seed, e.g. "“Little Living Garden” has not changed since it
  started (seed 104729), so it is not saved first: the same start rebuilds it exactly." The kept line
  says nothing, as for What if?.
- **What is never 'unchanged'.**
  - An older save without recorded choices: it cannot be named exactly, so it is always kept.
  - A card with a timed change: it starts after a pre-run.
  - Any tick, command, journal note or setting change.
- **Tests:**
  - "an untouched start rebuilds exactly…": four starts × all five actions give plan `unchanged`
    with the seed, kept `unchanged`, and a byte-identical store.
  - "a change at 0:00 is never skipped": a tick, a command, a journal note and an evolution setting
    each go to Slot 1 with the exact hash.
  - e2e journey 2 now restarts an untouched Garden twice: no line, and Saved dishes still has three rows.
- **Mutation M2** fails six tests.
- **Cost measured.** The rebuild-and-compare at tick 0 takes 168–327 ms (5 runs, loaded machine,
  `tmp/fix1-keep/perf`). It runs only at tick 0.
- **One existing test edited (setup only).** In `tests/worker/whatif.test.ts` → "slot and autosave
  summaries carry the idea…", the Garden was kept only because it had never run. The test now steps it
  once (`h.steps('g', 1)`) before the What if? start. Its assertions are unchanged.

### MINOR (saves P7): opening the Continue row while the open dish owns the slot Continue names — FIXED

- **Fix.** The keep's excluded slot is now only the named slot being opened (`excludedBy(slotId)`).
  Opening the autosave or a checkpoint excludes nothing.
- **Effect.** The open dish goes to its own slot. The Keep sheet no longer labels any slot "the save
  you are opening" when Continue is being opened. The opened Continue is bound after the keep; if the
  keep wrote that slot, it is bound to nothing.
- **Test:** "opening Continue while the open dish owns the slot Continue names…" uses all ten slots.
  - Old code: refused `slots-full` with `exclude: slot4`.
  - Now: kept to Slot 4 with the exact hash, and the opened Continue plans `full` (bound to nothing).
- **Mutation M3** (exclusion decided by the pre-keep binding) fails it with the old message.

### MAJOR (player 2) / MINOR (saves 6): the experiment card still promised D-0027 — FIXED (file outside my list)

- In `src/ui/views/ExperimentCard.tsx`, the sentence "Your current dish is kept in Continue first." is
  removed. The card now shows the worker's plan in the new shared `<KeepPlanLine verb="experiment">`
  (`src/ui/panels/KeepPlanLine.tsx`, mine), which New Dish also uses. For example: "“Little Living
  Garden” will first be saved to Slot 2 (empty now) and to Continue."
- The edit is one import plus two lines.
- **e2e:** the card has no "kept in Continue" and shows that exact plan line (16 px, axe clean).
  After Start, the dish's prompt begins with "Saved “Little Living Garden” to Slot 2 first. Food
  trail: …", and Saved dishes has Slot 2.

### MINOR (saves 7): no test covered the app-side restore after Cancel — FIXED

- **New e2e journey:** "ten slots used: Import over a running dish waits in the Keep sheet with the
  dish paused; Cancel lets it run on". It asserts:
  - the dish is paused while the sheet waits (the clock is frozen for 1.5 s);
  - "Nothing was changed.";
  - after Cancel the Pause label is back and the clock moves.
- **Mutation.** I built the app with `resumeKept()` removed from Cancel
  (`tmp/fix1-keep/vite.mutant.config.ts`, applied at load time; the tree was not touched) and served
  it on my port. The journey fails: "Expected: "Pause" Received: "Run"" (`tmp/fix1-keep/e2e-mutant.log`).

### MAJOR (player 3): after a relaunch, replacing actions dropped the dish Home offers as Continue — FIXED (PROPOSED DECISION C)

- **The rule.** With no dish open, every replacing action keeps the dish Continue holds first, by the
  same rules as an open dish: Play Start, New Dish, an experiment card, Saved dishes → Open of a named
  slot or checkpoint, Import, and What if? from Play.
  - The UI sends `keepFrom: { dishId: null }`.
  - The worker loads Continue as a transient dish that is never registered or run
    (`continueToKeep` / `keepSource`).
- **Nothing is written when:**
  - Continue is empty or unreadable;
  - the action opens Continue itself;
  - its bound slot already holds the same file (index checksum and name, checked without loading);
  - it is an untouched start.
- **Otherwise:**
  - It goes to its bound slot (predecessor kept) or to the first empty slot.
  - Continue itself is never rewritten.
  - With all ten slots used, the Keep sheet names it "“X”, the dish Continue holds". Export writes the
    stored file exactly (new `exportSave` request).
  - A failed write refuses the action, and nothing changes.
- **What the player reads.** The line says "Saved “X” from Continue to Slot 1 first." and never
  "Continue could not be updated". New Dish, the checkpoint question and the card say it beforehand:
  "Continue holds “X”, which will first be saved to Slot 1 (empty now)."
- **Tests.** The worker block "with no dish open, the dish Continue holds is kept first" has 10 tests:
  - each of the five actions;
  - opening Continue itself;
  - already saved or untouched;
  - bound and changed (predecessor kept);
  - all ten used, then export or replace;
  - failed write;
  - What if?.

  The e2e journey "after a relaunch…": background autosave, reload, the New Dish plan line, Play →
  Start, the line, then Slot 1 opens at the moment left.
- **Mutation M4** (no Continue keep) fails 10 tests.

### MINOR (player 4): the "what happened" line is 14 px on the dish screen — PARTLY FIXED; the CSS is NOT FIXED (outside my files)

- **Fixed for the line.** When the new dish shows a start prompt, the kept line now leads the prompt
  instead of being a toast; the prompt is 16 px. A paired card shows it in its setup panel, where
  `xp-note` is 16 px. See the next item.
- **Still 14 px.** `.toast { font-size: var(--fs-small) }` in `src/ui/styles.css` is outside my
  assignment and applies to every dish-screen toast since P1. It still covers these cases:
  - the kept line with prompts off;
  - the Open, Import and Duplicate lines;
  - "Nothing was changed."
- **Proposed one-line fix** for the lead or the review fixer (who owns `src/ui/**`): in
  `src/ui/styles.css:489`, `font-size: var(--fs-small);` → `font-size: var(--fs-body);`.

### MINOR (player 5): the kept line covered the start prompt — FIXED

- **Play Start** (`startDish`): the line joins the prompt, and no toast is shown. The prompt reads
  "Saved “…” to Slot 1 first. Press play and look closely." and still clears on Run (`setSpeed` checks
  `endsWith(PLAY_PROMPT)`).
- **A single-arm card:** the line leads the card prompt.
- **A paired card:** the line is shown in the run's setup panel (`experimentKeptLine`,
  `data-testid="experiment-kept"`), not over the A/B switch.
- **e2e journey with prompts on** checks all three projects:
  - the exact prompt text;
  - no toast carrying the line;
  - 16 px text;
  - Run clears the prompt;
  - the card prompt.

### MINOR (player 6): the "Slot N" in the line cannot be found on Saved dishes — FIXED (numbers and order); time format NOT FIXED

- **Numbers.** Each row now shows its slot (`data-testid="slot-number"`): "Continue" for the autosave,
  "Slot 1" … "Slot 10" for the named slots.
- **Order.** Rows are sorted numerically: Continue, then Slot 1 … Slot 10. Slot 10 no longer comes
  before Slot 2.
- **e2e:** journey 1 checks "Slot 1", "Slot 2" and "Continue" first.
- **Time format not changed.** The time stays "N s simulated" on Saved dishes and "· 0:02" in the
  sheets:
  - What if?'s sheet uses the same slot texts and must stay byte-for-byte.
  - Several specs owned by others assert "N s simulated".
  - The slot number now links the two screens.

### MINOR (player 7): what a screen reader hears in the Keep sheet — FIXED

- **The dialog.** It has `aria-describedby="keep-full-text"`, the panel's first sentence.
  - e2e: `toHaveAccessibleName('Keep your dish first')` and the exact `toHaveAccessibleDescription`.
- **The consequence line.** It now sits in an always-present `aria-live="polite"` region. The
  Replace button is described by it.
  - e2e: `keep-replace-start` has the exact accessible description.
- **What if?'s sheet.** It gains the same live region and description on its Replace button. Its texts
  are unchanged.

### MINOR (player 8): wording nits

- **Mixed quote styles — FIXED for Open and Import.** "Opened “X” — paused where you left it." and
  "Imported “X” — paused." now use curly quotes. Only `keep-dish.spec.ts` (mine) asserted them.
  - Not changed: the checkpoint message ("Opened the automatic checkpoint of "X" …"). `observe.spec.ts`
    asserts it and it is not part of the specified behaviour, so a toast combining a kept line with a
    checkpoint open still mixes styles.
- **Two wordings — NOT A PROBLEM.**
  - The assignment: "keep What if?'s behaviour and messages byte-for-byte where they already exist".
    What if? keeps "“X” was saved to Slot 2."
  - Every other action uses the ruling's own example: "e.g. "Saved “Little Living Garden” to slot 2
    first.""
- **Same-name replacement — FIXED.** The line and the Keep sheet's confirmation now name the replaced
  save's moment:
  - "…to Slot 3 first, in place of “Little Living Garden” (0:00)."
  - "“Little Living Garden” at 0:00 in Slot 3 will be replaced by …"
  - This adds `WhatIfKept.replacedTick`. What if?'s confirmation text is unchanged.

### MINOR (player 9): Duplicate said "the original is unchanged" and then lost it — FIXED (PROPOSED DECISION D)

- **The rule.** Duplicate is a replacing action: the copy takes the dish's place.
  - The original is kept first by the same step (verb 'duplicate').
  - The copy of that same moment is then made, and the original is disposed.
- **The toast says where the original is:**
  - "Duplicated. You are now in the copy; the original was saved to Slot 1."
  - "…the original is in Slot 2, exactly as it was." when it was already saved;
  - "…had not changed since it started, so it was not saved." when it was untouched.
- **All ten used:** the Keep sheet ("Open the copy"). A failed write: "…so the copy was not made."
- **Tests:**
  - worker: a changed dish gives slot and Continue, and the copy has the same hash; saved, untouched,
    full and failed each checked.
  - e2e "Duplicate keeps the original first…": the line; then Slot 1 opens the original at its moment,
    and the copy is kept to Slot 2 first.
- **Mutation M5** fails both worker tests.

## Files changed in this round

**Mine**
- `src/worker/host.ts`:
  - `excludedBy`, `fileBase`, `Dish.transient`;
  - `KeepOptions.exclude` (was `bindTo`);
  - the loadSlot keep, then the binding;
  - new requests `exportSave` and keep-aware `duplicate`, via `duplicateDish`;
  - `rebuildsExactly` with `freshStart`, `unchangedPlan`, `planFor`, `continueToKeep`, `keepSource`,
    `keepSourceDish`;
  - `bindingOf` with `activeRecord`;
  - `keepDish` pauses first, records `ownRecord`/`replacedTick`, and writes no Continue for the
    Continue dish;
  - `whatIfStart` and `whatIfAnswer` cover the Continue dish.
- `src/worker/protocol.ts`:
  - `KeepFrom.dishId: string | null`;
  - `duplicate.keepFrom?`, `exportSave`;
  - `keepRefused.name` and `fromContinue?`;
  - `WhatIfPlan`: `fromContinue?`, `unchanged.seed?`;
  - `WhatIfKept`: `fromContinue?`, `replacedTick?`.
- `src/worker/client.ts`: `exportSave`, `duplicateKeeping`, and `KeepRefused.name`/`fromContinue`.
- `src/persistence/store.ts` (additive): `activeRecord` on `SlotInfo` and `SaveRequest` (autosave only).
- `src/ui/state.ts`:
  - `autosave(force)`, and `saveToSlot` forces it;
  - the Continue keep flow: `KeepFlow.dishId` nullable, `exportContinueFile`, `keepPlanNow` with no
    dish open;
  - the prompt-merged line, `PLAY_PROMPT`, `experimentKeptLine`;
  - `duplicateCurrent` through the keep flow;
  - curly quotes.
- `src/ui/strings/keep.ts`:
  - `keepPlanText(plan, verb, options)`;
  - the Continue and seed texts;
  - `replacedTick`, `duplicatedText`, `keepChoiceText(…, fromContinue)`, the 'duplicate' verb.
- `src/ui/strings/whatif.ts`: `planText` and `startedText` for the Continue dish and seeded
  'unchanged'. Existing sentences are byte-identical.
- `src/ui/panels/KeepChoice.tsx`: the described body, a live region for the consequence line, and the
  replaced moment.
- `src/ui/panels/KeepSheet.tsx`: `aria-describedby`, and texts for the Continue dish.
- `src/ui/panels/KeepPlanLine.tsx` (new): `useKeepPlan`, `useKeepPlanText`, `KeepPlanLine`.
- `src/ui/panels/WhatIfState.tsx`: export of the Continue dish in What if?'s full step.
- `src/ui/views/NewDish.tsx`: the shared plan line, shown with no dish open too.
- `src/ui/views/Saves.tsx`: slot numbers, numeric order, and the checkpoint question from the plan
  (also with no dish open).
- `src/ui/views/ExperimentRun.tsx`: the paired-run kept line in its setup panel.
- `tests/worker/keep-dish.test.ts`: the harness can reopen a backend, plus 23 tests in five
  "Fix round 1" blocks.
- `tests/worker/keep-strings.test.ts`: 6 tests, rewritten for the new texts.
- `tests/worker/whatif.test.ts`: one line of setup in one existing test (see above).
- `tests/e2e/keep-dish.spec.ts`:
  - the toast recorder now counts repeats;
  - journeys 1–6 updated for the new behaviour (the untouched My dish, curly quotes, the replaced
    moment, slot numbers, accessibility);
  - five new journeys (7–11).

**Files outside the list (why)**
- `src/ui/views/ExperimentCard.tsx`: the MAJOR above requires it. The verifiers said the lead must
  change it in the same commit, and no concurrent agent owns it (the review fixer runs after
  keep-dish). The edit is one import plus two lines.
- `tests/sim/view-switch.test.ts`: needed to keep `npm run check` green (CLAUDE.md). This is the
  builder's proposed harness fix, verified by both verifiers.

**Existing e2e specs**
- I edited none besides my own `keep-dish.spec.ts`. The builder's single-assertion edits to
  `new-dish.spec.ts` and `observe.spec.ts` still hold: those dishes ran or were changed, so their plan
  text is unchanged.
- `whatif.spec.ts` is unchanged.

## Commands and results (this session)

- `npx tsc -p tsconfig.json --noEmit` → exit 0.
- `npx eslint` on the 22 touched files, including `ExperimentCard.tsx`, `view-switch.test.ts` and
  `keep-dish.spec.ts` → exit 0.
- Unit tests:
  - `npx vitest run tests/worker/keep-strings.test.ts` → `Tests 6 passed (6)`.
  - `npx vitest run tests/worker/keep-dish.test.ts -t "Fix round 1"` →
    `Tests 23 passed | 31 skipped (54)`.
  - The first run of `keep-dish.test.ts` + `whatif.test.ts` after the change had one failure: the
    What if? slot-index test, explained above and fixed with the one-line setup.
  - Related suite, 20 files. Every unit test importing the host, UI state or store: app-flow,
    inspector-step, registry-imports, checkpoints, persistence, comparison, founders-newdish,
    history-journal, lab-commands, lineage-host, view-switch, family, compare-client, host-requests,
    host, keep-dish, keep-strings, protocol, whatif-ui, whatif.
    Result: **`Test Files 20 passed (20) · Tests 240 passed (240)`** (327 s).
- Mutation probes (`tmp/fix1-keep/m*/`, scratch config `tmp/fix1-keep/vitest.config.ts`; log
  `tmp/fix1-keep/mutants.log`). Each mutant fails the new tests:

  | Mutant | Change | Tests that fail |
  |---|---|---|
  | M1 | binding by world id only | 3 |
  | M2 | old rule (a) | 6 |
  | M3 | pre-keep binding as the excluded slot | 1 |
  | M4 | no Continue keep | 10 |
  | M5 | Duplicate without keep | 2 |

- e2e, `E2E_PORT=4191 E2E_OUTDIR=tmp/dist-keep npx playwright test tests/e2e/keep-dish.spec.ts`
  (phone-portrait, desktop, phone-landscape):
  - Run 1: `30 passed, 3 failed (34.9m)`. The three failures were journey 2 on each project, stuck on
    a Home button after my new lines had left the page on Saved dishes. That was a navigation bug in
    the test, not in the app; the test was fixed.
  - Rerun of journey 2 (`-g "Play shelf Start keeps a changed dish first"`) → `3 passed (1.9m)`.
  - Together: **33/33**.
- resumeKept mutant e2e (phone-portrait, the mutant bundle served on 4191) → `1 failed`, as intended
  ("Expected: "Pause" Received: "Run"").
- **Whole e2e suite:** `E2E_PORT=4191 E2E_OUTDIR=tmp/dist-keep npx playwright test --project=phone-portrait --project=desktop --project=phone-landscape`
  (150 tests: the 135 the builder ran, plus my five new journeys × 3) → **`150 passed (1.4h)`, exit 0**.
  - It was built at 09:16, after the last change to `src/` or `tests/`.
  - It includes keep-dish 33/33 with the fixed journey 2, and `whatif.spec.ts` (unchanged),
    `new-dish.spec.ts` and `observe.spec.ts` green on all three projects.
  - Log: `tmp/fix1-keep/e2e-full.log`.
- Port 4191 was stopped after each run (`lsof -t -i :4191` empty).

## PROPOSED DECISIONS (for D-0033)

- **A. Continue binding.** Every autosave records the bound slot's current record id (`activeRecord`),
  read before the state is serialized; the keep's own Continue write records the record it wrote.
  - Continue is bound to that slot only while the slot's current record is still that one (and the
    world id matches). An older index binds nothing.
  - The binding of an opened Continue is decided after the keep.
  - A manual save always writes Continue, even at an unchanged tick.
  - Remaining pre-existing limitation: the 30 s, pagehide and visibility autosaves still skip an
    unchanged tick. A change made while paused therefore reaches Continue at the next manual save,
    keep or tick. With A it can no longer cause an overwrite.
- **B. Rule (a) generalized.** "Unchanged, rebuilds exactly" means a tick-0 dish whose whole
  serialized world (everything the save checksum covers, the journal included) equals what this build
  realizes from its recorded start under the same world id. That start may be:
  - a What if? idea, only while D-0026's identity checks hold;
  - a recipe or New Dish start with its recorded seed and choices;
  - an experiment card start without a timed change.

  Nothing is written. The plan names the seed for non-variant starts. This replaces D-0026's
  state-hash test, which missed the journal and pins. Consequence: What if? over an untouched Garden
  no longer writes a slot.
- **C. The dish Continue holds is kept when no dish is open.** Every replacing action, What if? from
  Play included, keeps it first by the same rules.
  - Nothing is written when Continue is empty, unreadable, being opened, already in its bound slot
    (same index checksum and name), or an untouched start.
  - Continue itself is never rewritten.
  - The Keep sheet exports the stored file (`exportSave`).
  - A Continue read from its predecessor (the latest record damaged) is bound to nothing.
  - Owner-visible: after a relaunch, Play → Start on a played dish now uses a slot, as the same action
    did before the relaunch.
- **D. Duplicate is a replacing action.** The original is kept first, the copy of the same moment
  opens, and the original is disposed. The line says where the original is.
- **E. The kept line never covers a prompt.** It leads the new dish's start prompt when there is one;
  a paired card shows it in the setup panel; otherwise it is a toast. Proposed CSS for the lead or the
  review fixer: `.toast { font-size: var(--fs-body) }` (UX §4.1: body text ≥ 16 px).
- **F. Saved dishes numbers its rows**: Continue, then Slot 1 … Slot 10, in that order.
- **G. The replaced save's moment** is named in the kept line and in the Keep sheet's confirmation.
  What if?'s own texts are unchanged.
- **For the lead's DECISIONS entry:**
  - D-0027's "autosave to Continue without writing a named slot" is superseded.
  - D-0026's rule (a) is generalized (B).
  - D-0030's owner-review note points to D-0033.
