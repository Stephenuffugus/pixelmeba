# G2 wave C — observe (P2.8) fix round 2

Round-2 fixer for BUILD_DIRECTIVE P2.8 (regional trait graphs, checkpoint ring, journal), working on the tree as round 1 left it. Input: `observe-reverify1.md` (1 MAJOR, 3 MINOR).
No git state was changed (no add/commit/stash/checkout/reset/rm/restore). Port 4192 is stopped. Scratch files are in `tmp/observe-fix2/` (gitignored).

**Result: the MAJOR and all three MINORs are FIXED.** Each has a test that fails on the round-1 code and passes now. I proved the "fails on the old code" part by running the new tests against reconstructed round-1 copies of `journal.ts` and `host.ts` (see Commands).

## 1. Per problem

### MAJOR — after an import, the player's next note silently deleted one of their own device-only notes. FIXED.

**What was wrong**
- `mergeJournal` filled the Notebook up to 200 with the imported entries.
- `addObservation` and `addJournalEntry` then made room with `.slice(0, 200)`. That dropped the oldest entry, which was the player's own.

**What the Notebook does now (`src/ui/journal.ts`)**
- Merged entries are marked as **copies from a dish**. The marks are kept in a second device key, `pixelmeba.journal.fromDishes`. It holds only ids, is pruned to listed entries, and survives a reload.
- When the Notebook is full, a new entry (a note or an experiment stamp) removes **exactly one** entry, in this order:
  1. the oldest copy from a dish, which that dish's save or file still holds;
  2. only when no copy is left, the oldest entry.
- An import can therefore never lead to the loss of an entry that exists only on this device, whatever `recordedAt` a crafted file claims.
- The removal is never silent. `addObservation` and `addJournalEntry` return `removed: { entry, fromDish }`. `journalRemovedText` words it, and it is appended to the toast:
  - composer (`NotebookJournal.tsx`): *"Added to your Journal. Your Notebook lists up to 200 entries, so it no longer lists the oldest entry that came with “Friend dish” (a copy from that dish's save or file)."*
  - stamp toast (`state.ts`), for the player's own oldest entry: *"… so its oldest entry was removed: “I saw … coincide with ….”, recorded …."*
- Merging is unchanged: it never removes anything, and it reports `notListed`.
- The D-0027 bound (≤ 200 listed) and the existing stamp test (`tests/experiments/journal-and-words.test.ts`, 205 stamps → 200, newest first) still hold.

**Tests**
- `tests/ui/journal-observations.test.ts:191` "after an import fills the Notebook, new entries take the place of copies…". It uses the re-verifier's case: 5 own notes, then 195 imported notes recorded later.
  - The next note removes `observation:friend:0`, and the toast text is checked.
  - The player keeps 6 own notes, both in memory and in localStorage.
  - After a reload the copies are still marked, and a stamp also takes a copy's place.
  - Only after all 195 copies are gone does the oldest own note go, with the "its oldest entry was removed" text.
  - Against the round-1 `journal.ts`, this test fails.
- e2e `tests/e2e/observe.spec.ts:307`, the re-verifier's real-UI journey (all three projects):
  - Import a 195-entry dish, add a note, and check the toast.
  - Check that `observation:friend:0` is gone and all 5 own notes remain.
  - After a reload, all 5 own notes and the new note are listed.
- `npx tsx tmp/reverify-observe/journal-loss.ts` part A now prints `own dish-less notes left: 5` and `own notes in localStorage: 5`. Its "expected 6" label also counts the new note, which is not a "my own" note, so 5 is the correct result.

### MINOR — a note or stamp the validator refuses was shown and stored, then vanished at the next reload. FIXED.

**Root cause removed:** checkpoint branches no longer nest their world id.
- `branchWorldId(worldId, newDishId)` (`src/persistence/checkpoints.ts`) returns `<first part of the id>+<newDishId>`.
- `src/worker/host.ts:295` uses it (the import line is extended).
- The world id is neither hashed nor read by the simulation's randomness. The state hash of an opened checkpoint is unchanged, and the existing hash assertion still passes.

**Headroom for other nesting:** the journal's world-id bound is now `JOURNAL_WORLD_ID_MAX = 4000` (`src/sim/history.ts`, was 400).
- Duplicate and comparison copies still nest, by about 20 characters each (outside my files; see §3).
- 4000 leaves room for about 200 nested copies.
- The 16 KB per-entry bound is unchanged.

**Validation when an entry is added:**
- `addObservation` builds the entry exactly as it will be stored and runs `journalRecordProblem` on it. A failing note is refused with a message and is never listed, stored or sent to the dish:
  - for the dish id: *"This note cannot be kept with this dish (its dish id is too long). Untick “About …” to add it to your Notebook only."*;
  - otherwise: *"This note could not be added: <reason>. Nothing was changed."*
- `addJournalEntry` does the same. It stores the stamp in its JSON form, so a measured NaN is `null`, exactly as it reads back and as the dish's `journalPut` checks it. It returns `problem`, and `state.ts` then shows *"Journal stamp: …. It could not be added to your Journal (<reason>)."* and does not count it as new.

**Link text is bounded:** a linked comparison card's `change` (the re-verifier's part B: 14 queued changes = 460 characters) and the other link texts are shortened to the validator's 400 characters with "…".

**Tests**
- `tests/ui/journal-observations.test.ts:256`:
  - The re-verifier's 417-character nested id is accepted and kept by the dish (`putJournalEntry` true).
  - A 4001-character id is refused with the message; nothing is listed, stored or sent.
  - A stamp with a 5000-character prediction is refused with `problem`.
  - The 460-character link is kept, shortened.
  - A NaN measure is stored as `null`, and the dish keeps that stamp.
  - Everything listed still lists after a reload.
  - Against the round-1 `journal.ts`, this test fails.
- `tests/persistence/checkpoints.test.ts:387`: five nested openings through the real host (each branch runs a minute and its own checkpoint becomes the next branch).
  - Every world id is `d+<id>`, and a note about the deepest branch is kept with it.
  - Against the round-1 host line, it fails with `expected 'd+dish-mf3a1b2c-1+dish-mf3a1b2c-2' to be 'd+dish-mf3a1b2c-2'`.
- `npx tsx tmp/reverify-observe/nested-branch.ts` now prints `validator: null`, `dish keeps it: true`, `Notebook after reload: 1 entries`.

### MINOR — the "Open as a new branch" confirm dropped focus to `<body>` and was not announced. FIXED (`src/ui/views/Saves.tsx`, `CheckpointList` only).

**Open**
- Pressing Open moves focus to the confirm text (`tabIndex=-1`), so the question is read out.
- "Open as a new branch" has `aria-describedby` pointing at that text.
- Cancel returns focus to that row's Open.

**Delete… (same list, same kind of drop)**
- Delete… moves focus to Keep, the safe choice. Keep returns focus to Delete….
- After a deletion, focus goes to the list's heading, or to the page's heading (`h1`, now `tabIndex=-1`) when the last checkpoint is gone.
- The buttons name their checkpoint ("Delete for good: … at 1:00", "Keep … at 1:00"). The names start with the visible text.

**Test:** e2e `observe.spec.ts:168-201` and `:248-261`, keyboard only, all three projects:
- Delete… → Keep is focused → Enter → Delete… is focused.
- Open → the confirm text is focused, and the confirm button's accessible description is the question (axe clean with the confirm shown).
- Tab → "Open as a new branch", Tab → Cancel, Enter → Open is focused.
- Open again → Tab → Enter opens the branch.
- At the end: Delete… → Shift+Tab → "Delete for good" → Enter → the list is gone and `#saves-title` is focused.
- On the round-1 code, the re-verifier's probe printed `body` at each of these steps.

### MINOR — two untruths in the checkpoint wording. FIXED.

**(1) "the earlier ones are kept" when none exist**
- Settings now uses `checkpointSettingText` (`src/ui/state.ts`, used by `SimplePage.tsx`):
  - `kept` 0 → "nothing was removed";
  - 1 → "the earlier one is kept";
  - n → "the n earlier ones are kept".
- This matches the toast.
- Test: `tests/persistence/checkpoints.test.ts:426` (every case). The function did not exist in round 1.

**(2) "Continue now follows this branch" was not true until the branch ran**
- `loadSlot` (`state.ts`) now writes Continue for the branch as soon as it opens (`c.autosave(info.dishId)`).
- This is what the confirm already promised ("Continue will follow it instead. To keep "…" as it is, save it to a slot first.").
- If that write fails, the toast says *"Continue could not be updated, so it still opens the dish it held before."* (`checkpointOpenedText(…, followed)`).
- Tests:
  - the wording test above;
  - the e2e journey reloads right after opening. Home's Continue then reads "Little Living Garden (from 1:00) — 60 s simulated. Opens paused." and opens the branch at 1:00. On the round-1 code it named the original dish.

## 2. Files changed (this round)
- Owned:
  - `src/ui/journal.ts` (copy marks, `addFirst`, `journalRemovedText`, `isFromDish`, validation on add, bounded links, JSON-form stamps);
  - `src/sim/history.ts` (`JOURNAL_WORLD_ID_MAX`);
  - `src/persistence/checkpoints.ts` (`branchWorldId`);
  - `src/ui/views/NotebookJournal.tsx` (removal named in the toast);
  - `tests/ui/journal-observations.test.ts`, `tests/persistence/checkpoints.test.ts`, `tests/e2e/observe.spec.ts`.
- Shared, small edits to code this assignment wrote:
  - `src/worker/host.ts`: the import line and the branch world id in `loadSlot`.
  - `src/ui/state.ts`:
    - an extra import line;
    - `loadSlot` writes Continue for a branch;
    - the stamp path handles `problem` and `removed`;
    - `checkpointOpenedText` has a `followed` parameter;
    - new `checkpointSettingText`.
  - `src/ui/views/SimplePage.tsx`: the note uses `checkpointSettingText`.
  - `src/ui/views/Saves.tsx`: focus handling in `CheckpointList`, and `tabIndex={-1}` on the page `h1`.
- No content, schema or save-shape change. Nothing in the state hash is touched.

## 3. For the lead
- **Nesting elsewhere (not changed; outside my files):**
  - `src/worker/host.ts:524` (Duplicate) still builds `${d.world.worldId}+${msg.newDishId}`.
  - `:976` and `src/worker/comparison.ts:127` still nest comparison copies.
  - With the 4000 bound, this only matters after about 200 nested copies, and a note is then refused with a message, not lost. Using `branchWorldId` in Duplicate would remove the growth there too.
- **Same focus drop in the named-slot list:** the named save slots' "Delete…" → "Delete for good" / "Keep" (`Saves.tsx:67-92`, older than P2.8) drops focus the same way. The `CheckpointList` pattern can be copied: focus Keep, Keep → Delete…, after a deletion → `#saves-title`.

## 4. Proposed decisions
- PROPOSED DECISION: **Notebook capacity (refines D-0027).**
  - The device Notebook lists at most 200 entries.
  - Entries listed from a dish's save or a shared file are marked as copies (`pixelmeba.journal.fromDishes`).
  - A new entry in a full Notebook removes exactly one entry: the oldest copy, or the oldest entry only when no copy is left.
  - The player is always told which entry.
  - Merging never removes anything.
- PROPOSED DECISION: **Checkpoint branch identity.**
  - A checkpoint opens as a branch with world id `<first part of the dish's id>+<new dish id>`, which does not nest.
  - A journal entry's world id may be up to 4000 characters.
  - Opening a checkpoint writes Continue for the branch at once. The confirm asks first when Continue holds a dish.

## 5. Commands and results
- **Unit tests:**
  - `npx vitest run tests/ui/journal-observations.test.ts tests/experiments/journal-and-words.test.ts` → 2 files, 18/18 passed.
  - `npx vitest run tests/persistence/checkpoints.test.ts` → 13/13 passed (36.7 s).
  - `npx vitest run tests/sim/history.test.ts tests/sim/history-journal.test.ts tests/sim/history-traits.test.ts tests/sim/history-debris.test.ts tests/persistence/migration.test.ts tests/content/debris-text.test.ts` → 6 files, 32/32 passed.
  - `npx vitest run tests/worker tests/experiments/inspector-step.test.ts tests/sim/view-switch.test.ts tests/sim/lab-commands.test.ts tests/experiments/journal-and-words.test.ts` → 10 files, 116/116 passed (these import `state.ts` or the host).
- **Old-code proofs:**
  - `npx vitest run --config tmp/observe-fix2/vitest.config.ts`, with the new journal tests pointed at the reconstructed round-1 `journal.ts` → both new tests fail (×2), and the 7 older ones pass.
  - The nested-branch test pointed at the round-1 host line → fails as quoted above.
- **Verifier repros:**
  - `npx tsx tmp/reverify-observe/journal-loss.ts` → A: 5 own notes kept (was 4); B: `validator says: null`, and 1 entry after reload (was 0).
  - `nested-branch.ts` → kept, and 1 entry after reload (was 0).
- **Static checks:**
  - `npx tsc -p tsconfig.json --noEmit` → exit 0.
  - `npx eslint` on the 11 changed files → exit 0.
- **E2E, task spec:** `E2E_PORT=4192 E2E_OUTDIR=tmp/dist-observe-fix2 npx playwright test tests/e2e/observe.spec.ts` → **12 passed (6.2 min)** on phone-portrait, phone-landscape and desktop. This was the final run, including the delete-focus step. An earlier run without that step also passed, 12/12 in 6.3 min.
- **E2E, regressions:** `… npx playwright test tests/e2e/{save-reload,experiments,whatif,inspector,lineage,new-dish}.spec.ts` → **54 passed (34.0 min)**, all three projects. These are every spec that opens History, Saved dishes, Continue or the Journal.
- **Checks on touched screens:** axe found no serious or critical violations, controls are ≥ 48 px and text is ≥ 16 px (e2e walkers). The 200 % text test passed on both phone projects. The new buttons use the existing `.btn` styles.
- **Measurements:** `npx tsx tmp/observe-fix2/bench.ts`, with `FIRST_DISH_V1` at seed 104729 run for 18,000 ticks (30 simulated minutes); load average ≈ 3–4:

| | Value |
|---|---|
| Alive at 30 min | 2,956 |
| Mean tick | 4.94 ms (18,000 ticks in 89.0 s) |
| History JSON | 832.2 KB (1,800 per-second samples, 0 minute summaries yet) |
| Trait samples | 236.3 KB (180 recent, 0 minute samples) |
| One regional trait sample (median / max of 15) | 3.60 / 6.18 ms → 0.036 ms per tick amortized (one per 100 ticks), 0.73 % of a mean tick |
| Load checks (parse + `historyProblem` + `journalProblem`) | 11.6 ms median |
| New device key `pixelmeba.journal.fromDishes`, worst case (200 marks) | 8.3 KB |

**Everything stays bounded:**
- per-second history covers 30 minutes, then minute summaries up to 6 h;
- at most 185 + 360 trait samples;
- a dish journal of at most 200 entries × 16 KB;
- a device Notebook of at most 200 entries plus at most 200 copy marks;
- a checkpoint ring of at most 10.
