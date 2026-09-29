# G2 wave C — observe (P2.8): re-verification of fix round 2

**Re-verifier:** adversarial, working on the tree as the round-2 fixer left it.

**Git and files:**
- No git state was changed.
- No repository file was edited except this report.
- Scratch files are in `tmp/reverify2-observe/`, which git ignores. The round-1 probes in `tmp/reverify-observe/` were reused unchanged.
- Port 4222 was used and is stopped. After each run, `ss` showed it free.

**Result: ok = true.**
- The MAJOR and all three MINORs from `observe-reverify1.md` are fixed.
- Each fix was checked against the original repro, and each new test fails on the round-1 code.
- No regression was found. No new BLOCKER, MAJOR or MINOR was found.
- The notes at the end are for the lead. None of them is a defect in this fix.

## Per problem

### VERIFIED OK — MAJOR: after an import, the player's next note silently deleted one of their own device-only notes

**Original repros, current tree:**
- `npx tsx tmp/reverify-observe/journal-loss.ts`, part A:
  - The merge gives `{"added":195,"notListed":0}`.
  - After one more note, `own dish-less notes left: 5`, and localStorage also holds 5.
  - Round 1 gave 4. The script's label "expected 6" also counts the new note, which is not a "my own" note, so 5 is correct.
- Real UI, desktop: `cd tmp/reverify-observe && E2E_PORT=4222 E2E_OUTDIR=tmp/dist-reverify-observe npx playwright test evict.vspec.ts --config pw.config.ts --project=desktop` passes. It prints:
  - `after adding one note: own dish-less notes on device = 5 (expected 5)`
  - `Notebook lists "my own note 0" after reload: 1` (round 1: 0)
  - The toast: *"Added to your Journal. Your Notebook lists up to 200 entries, so it no longer lists the oldest entry that came with “Friend dish” (a copy from that dish's save or file)."*

**Diff read** (`src/ui/journal.ts:146-208`, `:346-357`, `:363-373`):
- `mergeJournal` marks only the entries it actually lists as copies. It skips ids already listed, so an existing device entry is never re-marked.
- `addFirst` removes exactly one entry, only when the list is full: the last-positioned copy, else the last entry. It returns `removed`.
- Every caller shows `journalRemovedText`:
  - the composer (`NotebookJournal.tsx:98-105`);
  - the stamp path (`state.ts:1054-1057`).
- The marks are written before the list (`journal.ts:180-181`), and at load only marks whose ids are listed are kept (`:147-156`). A failed write can therefore never leave a device entry marked as a copy.

**Paths I tried to break, all held:**
- A crafted file with far-future or far-past `recordedAt`: eviction goes by the copy mark, not by position.
- Reload between the import and the next note: the marks persist, and a stamp also removes a copy.
- A full Notebook before the import: the merge lists 0 and marks 0.
- Opening the player's own checkpoint: its entries are already listed, so none are marked.
- A device-only note (`dish: null`) can reach a dish's journal only through a crafted file. If its id is already listed, the merge skips it.

**The new test fails on the old code:**
- `npx vitest run --config tmp/observe-fix2/vitest.config.ts tmp/observe-fix2/journal-round1.test.ts` → 2 failed and 7 passed.
- The two failures are exactly the two new round-2 tests.
- The file differs from `tests/ui/journal-observations.test.ts` only in import paths and one `own()` filter (checked with `diff`).

### VERIFIED OK — MINOR: a note or stamp the validator refused was shown and stored, then vanished at the next reload

**Original repro:** `npx tsx tmp/reverify-observe/nested-branch.ts` → `validator: null`, `dish keeps it (worker journalPut): true`, `Notebook after reload (loadJournal): 1 entries`. Round 1 gave malformed / false / 0.

**Diff read:**
- **Branch ids no longer nest.** `src/worker/host.ts:295` now uses `branchWorldId` (`src/persistence/checkpoints.ts:125-127`). Nothing parses world ids (grep for `split('+')` and `worldId` + `startsWith`/`includes`: none). The world id is not in `stateHash` and is not read by the simulation's randomness.
- **Notes are checked when added.** `addObservation` validates the exact stored object (`journal.ts:321-324`) and refuses with a message shown in `role="alert"` (`NotebookJournal.tsx:176-180`).
- **Stamps are checked when added.** `addJournalEntry` JSON-round-trips the stamp and then validates it (`journal.ts:239-243`). `state.ts:1047-1051` shows the reason and does not count or list the stamp.
- **Link texts are shortened.** `boundedLink` clips the link texts to the validator's 400 characters. `savedAt` is not clipped, but an ISO time is 24 characters against a limit of 40.
- **Device and dish agree.** `loadJournal`, `mergeJournal`, the worker's `putJournalEntry` and `parseSaveFile` all run the same `journalRecordProblem`. Raising `JOURNAL_WORLD_ID_MAX` to 4000 only loosens the check, so older saves and older device lists still load. `JOURNAL_MAX`, the per-entry 16 KB limit and the dish's 200-entry limit are unchanged.

**The new tests fail on the old code:**
- The journal test fails on round-1 `journal.ts` (above).
- The nested-branch test in `checkpoints.test.ts` fails against the round-1 host: `npx vitest run --config tmp/observe-fix2/vitest.config.ts tmp/observe-fix2/checkpoints-round1.test.ts -t "does not grow the dish id"` → `expected 'd+dish-mf3a1b2c-1+dish-mf3a1b2c-2' to be 'd+dish-mf3a1b2c-2'`.
- `diff` shows that test file differs only in two import lines.

### VERIFIED OK — MINOR: the "Open as a new branch" confirm dropped keyboard focus and was not announced

**Original probe:** `cd tmp/reverify-observe && E2E_PORT=4222 E2E_OUTDIR=tmp/dist-reverify-observe npx playwright test confirm-focus.vspec.ts --config pw.config.ts --project=desktop` now prints:
- `focus after Enter on Open: p[checkpoint-confirm] "Continue now holds “Little Living Garden…"`
- `next Tab lands on: button "Open as a new branch"`
- `focus after Cancel: button "Open"`

Round 1 printed `body` at both focus steps.
- The paragraph still has no `role` or `aria-live`, but it is focused (`tabIndex=-1`), so a screen reader reads it.
- "Open as a new branch" is `aria-describedby` that paragraph.

**Diff read** (`src/ui/views/Saves.tsx:162-201`):
- Open moves focus to the question, and Cancel returns it to Open.
- Delete… moves focus to Keep, and Keep returns it to Delete….
- After a deletion, focus goes to `#checkpoints-title`, or to `#saves-title` once the list has unmounted.
- Accessible names begin with the visible text ("Open …", "Delete …", "Delete for good: …", "Keep …").

**E2E:** the keyboard path in `tests/e2e/observe.spec.ts:168-201` and `:248-261` passed on all three projects in my run, including axe with the confirm shown.

### VERIFIED OK — MINOR: two untruths in the checkpoint wording

1. **Settings.** `SimplePage.tsx:50` now uses `checkpointSettingText` (`state.ts:1172-1178`): 0 → "nothing was removed", 1 → "the earlier one is kept", n → "the n earlier ones are kept". This matches the toast at `state.ts:1190`. The unit test at `tests/persistence/checkpoints.test.ts:426` covers every case.
2. **"Continue now follows this branch."**
   - `loadSlot` writes Continue for the branch at once (`state.ts:366-374`).
   - If that write fails, the toast says Continue still opens the dish it held before.
   - The e2e reloads right after opening. Continue then reads "Little Living Garden (from 1:00) — 60 s simulated. Opens paused." and opens at 1:00. This passed on all three projects.
   - The confirm is honest about the effect: "Continue will follow it instead. To keep “…” as it is, save it to a slot first."
   - Its "Continue now holds “X” at <time>" uses the open dish's time. That is correct, because while a dish is open, Home's Continue resumes that in-memory dish (`Home.tsx:27-35`).

## Other checks

- **Determinism and conservation:** no simulation file changed except the constant `JOURNAL_WORLD_ID_MAX` in `src/sim/history.ts`, which is outside the state hash. `tests/fixtures/determinism.test.ts` and `tests/worker` → 7 files, 60/60 passed.
- **Honest labels:**
  - The removal texts name the removed entry, and say whether it was a copy or the player's own.
  - Observations still read "coincided with".
  - A refused note or stamp says why and that nothing changed.
- **Ownership:** round 2 touched only owned files (`journal.ts`, `history.ts`, `checkpoints.ts`, `NotebookJournal.tsx`, the three tests) and the listed shared files (`host.ts`, `state.ts`, `SimplePage.tsx`, `Saves.tsx`).
- **Save shape:** no content change, schema change or save-shape change. The new device key `pixelmeba.journal.fromDishes` is device-only UI state.

## Notes for the lead (not defects in this fix)

- **Report accuracy, not product.** The fixer's "worst case 8.3 KB" for `pixelmeba.journal.fromDishes` is measured with realistic ids of about 40 characters. With the validator's 200-character ids, the true worst case is 39.6 KB (`node -e …` in this session). That is still small and bounded.
- **Copy wording edge case.**
  - The removal text says the copy is kept by "that dish's save or file". This stops being true if the player later deletes the only save holding that dish, or the file.
  - The fix itself never marks a device-recorded entry as a copy. The only ways an entry of the player's own can become a copy are both rare edge cases:
    - it is merged back after being removed. That needs free room, and a full Notebook has none, because the Notebook has no delete.
    - a failed device write.
  - Low risk. Worth a line in the proposed capacity decision.
- **Already flagged by the fixer, and still true:**
  - Duplicate still nests world ids (`src/worker/host.ts:524`). At the 4000 limit this matters only after about 200 nested copies, and a note is then refused with a message, not lost.
  - The named-slot Delete… in `Saves.tsx:67-92` still drops focus. It predates P2.8; `git show HEAD:src/ui/views/Saves.tsx` has the same code.
- **Proposed decisions** for `docs/DECISIONS.md`: Notebook capacity (refines D-0027) and checkpoint branch identity. The fixer proposed both; neither is recorded yet.

## Commands and results (this session)

| Command | Result |
|---|---|
| `npx tsx tmp/reverify-observe/journal-loss.ts` | A: 5 own notes kept (was 4); B: 1 entry after reload |
| `npx tsx tmp/reverify-observe/nested-branch.ts` | 413-character id accepted; dish keeps it; 1 entry after reload |
| `npx vitest run tests/ui/journal-observations.test.ts tests/experiments/journal-and-words.test.ts` | 18/18 |
| `npx vitest run --config tmp/observe-fix2/vitest.config.ts tmp/observe-fix2/journal-round1.test.ts` | 2 failed (the two new tests), 7 passed: the new tests fail on round-1 code |
| `npx vitest run … checkpoints-round1.test.ts -t "does not grow the dish id"` | fails on the round-1 host line, as quoted |
| `npx vitest run tests/persistence/checkpoints.test.ts tests/sim/history*.test.ts tests/persistence/migration.test.ts tests/content/debris-text.test.ts tests/ui/journal-observations.test.ts tests/experiments/journal-and-words.test.ts` | 9 files, 63/63 (69 s) |
| `npx vitest run tests/worker tests/fixtures/determinism.test.ts` | 7 files, 60/60 (104 s) |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npx eslint` on the 8 changed source files and 3 test/spec files | exit 0 |
| `E2E_PORT=4222 E2E_OUTDIR=tmp/dist-reverify-observe npx playwright test tests/e2e/observe.spec.ts` | 12 passed (6.2 min): phone-portrait, phone-landscape, desktop |
| `… npx playwright test tests/e2e/save-reload.spec.ts tests/e2e/experiments.spec.ts --project=phone-portrait --project=desktop` | 14 passed (6.6 min) |
| Round-1 probes `evict.vspec.ts` and `confirm-focus.vspec.ts` (desktop) | 2 passed; outputs quoted above |
