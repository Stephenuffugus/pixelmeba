# G2 wave C — observe (P2.8): re-verification of fix round 1

**Re-verifier:** adversarial, working on the tree as the fixer left it.
**Git and files:** no git state was changed, and no repository file was edited except this report. Scratch files are in `tmp/reverify-observe/`. Port 4222 was used and is stopped.

**Result: ok = false.** One MAJOR remains. It is a variant of the rules verifier's MAJOR 3. The merge no longer deletes the player's own notes, but after an import the very next note deletes one, with no warning. Every other finding is verified fixed or is a flagged owner/lead decision. Four new MINORs were found.

## Remaining and new problems

### MAJOR — importing a dish still leads to silent, permanent loss of the player's own Notebook notes

**Where**
- `src/ui/journal.ts:265-267`: `mergeJournal` fills all free room up to 200 and sorts the whole device list by `recordedAt`, a value taken from the file.
- `src/ui/journal.ts:240` (`addObservation`) and `:166` (`addJournalEntry`): these then add the new entry with `.slice(0, JOURNAL_MAX)`, which drops the oldest entry without a word.

**What happens**
- `mergeJournal` itself no longer removes anything.
- But one import of a friend's dish that carries 195 entries fills the Notebook from 5 entries to 200.
- The player's next note, or their next experiment stamp, then removes the oldest entry on the device. With the file's later `recordedAt`, that entry is one of the player's own.
- A note with `dish: null` exists only on the device. So do paired-run stamps without a `worldId`. They are lost for good.
- The only message is "Added to your Journal." The full-Notebook toast appears only when `notListed > 0`, which is 0 here.
- This is the verifier's original harm ("An import must never silently delete the player's records") one step later.
- A crafted file with far-future `recordedAt` values makes the player's own entries the first to go.

**Repro**
- Unit: `npx tsx tmp/reverify-observe/journal-loss.ts`, part A. It prints `merge {"added":195,"notListed":0}` and then `own dish-less notes left: 4 (was 5, +1 new = expected 6)`. localStorage also holds 4.
- Real UI (desktop): `cd tmp/reverify-observe && E2E_PORT=4222 E2E_OUTDIR=tmp/dist-reverify-observe npx playwright test evict.vspec.ts --config pw.config.ts --project=desktop`. Output (`tmp/reverify-observe/evict.log`):
  ```
  after import: own notes on device = 5
  toasts: ["Added to your Journal."]
  after adding one note: own dish-less notes on device = 4 (expected 5)
  Notebook lists "my own note 0" after reload: 0
  ```

**Test gap:** the fixer's test (`journal-observations.test.ts` "merging … never removes an entry of this device") stops right after the merge.

**Suggested fix, one of:**
- When the Notebook is full, evict only entries that are also kept with a dish save (those with a `worldId`, which can be recovered by opening the dish), never a device-only entry.
- Or refuse the add and tell the player.
- Or do not count imported entries against the device's 200. For example, list a dish's own entries from the dish instead of copying them.

### MINOR — a note or stamp the validator rejects is shown and stored this session, then silently disappears at the next reload

**Where**
- `src/ui/journal.ts:227-240` (`addObservation`) and `:160-166` (`addJournalEntry`) never run `journalRecordProblem` on the entry they build.
- `loadJournal` (`:127`) does run it, and so does the worker's `journalPut` (`src/worker/host.ts:573-578` → `putJournalEntry`).

**Realistic trigger:** nested checkpoint branches.
- `src/worker/host.ts:295` gives a branch the world id `${world.worldId}+${newDishId}`. A branch opened from its own branch's checkpoint therefore grows by about 19 characters each time.
- After 21 nested openings the id is 416 characters. The validator allows at most 400 (`src/sim/history.ts:463`).
- From then on, every note or stamp about that dish behaves the same way. It says "Added to your Journal.", is stored on the device, is refused by the dish (`journalPut` returns false, silently), and is gone from the Notebook after a reload. The next store then deletes it from localStorage.

**Repro:** `npx tsx tmp/reverify-observe/nested-branch.ts`. It prints `world id is 416 characters`, `stored on device = true`, `validator: its dish id is malformed`, `dish keeps it: false`, `Notebook after reload: 0 entries`.

**Fix:** validate in `addObservation` and `addJournalEntry` and refuse with a message. Also, either do not nest branch world ids (e.g. `<root>+<dishId>`), or lift the `worldId` bound.

### MINOR — the new "Open as a new branch" confirm in Saved dishes drops keyboard focus and is not announced

**Where:** `src/ui/views/Saves.tsx:175-196`.
- Pressing **Open** swaps the button for the confirm paragraph and two buttons. Focus falls to `<body>`, and the paragraph has no `role`, `aria-live` or focus target.
- **Cancel** also drops focus to `<body>`.
- This is the same kind of focus drop that the player verifier's MINOR 8 raised for the journal composer. It is introduced here by the fix's new confirm.

**Repro:** `tmp/reverify-observe/confirm-focus.vspec.ts` (desktop, same command as above) prints:
```
focus after Enter on Open: body …
confirm announced? {"role":null,"ariaLive":null,"inLive":false}
focus after Cancel: body …
```
(The next Tab happens to reach "Open as a new branch".)

**Fix:** move focus to the confirm text or to its first button, and return focus to **Open** on Cancel.

### MINOR — two small untruths in the checkpoint wording

1. **"The earlier ones are kept" when there are none.** `src/ui/views/SimplePage.tsx:53` always says "…; the earlier ones are kept." after a failed checkpoint, even when `kept` is 0 (for example, the very first checkpoint fails). The toast in `src/ui/state.ts` handles 0 correctly ("Nothing was removed").
2. **"Continue now follows this branch" is not persisted.**
   - The toast (`src/ui/state.ts:1189`) and the confirm say this, but `enterDish` sets `lastAutosaveTick = info.tick` (`src/ui/state.ts:318`). `autosave()` then skips while the branch has not moved.
   - So after opening a checkpoint, leaving and reloading, Continue still opens the original dish at 1:37, not the branch. Adding a journal note is the exception, because it autosaves.
   - This does no harm (data is kept longer), but the label is not exact. Either write Continue when the branch opens, or word it as "Continue follows this branch once it changes".

## Verified fixed

### Rules verifier findings

- **VERIFIED OK — MAJOR 1: a crafted file's malformed stamp broke Notebook → Journal.**
  - `journalRecordProblem` (`src/sim/history.ts:457`) is used by `journalPut`, by `parseSaveFile` (`src/persistence/saveFile.ts:350-355`) and by the UI's `isJournalEntry` / `loadJournal`. `EntryBoundary` guards rendering.
  - The builder's repro now fails at setup, because `putJournalEntry` refuses the minimal stamp.
  - `tests/sim/history-journal.test.ts` covers the verifier's file plus 10 single-field corruptions and the worker import (no dish added, hash unchanged).
  - The e2e "a shared file with a malformed journal entry changes nothing…" passed on all 3 projects in my run.
  - Legitimate stamps still pass the validator: the stamp shape at HEAD (`git show HEAD:src/ui/state.ts`) has the same fields, and `rawA`/`rawB` NaN cannot occur (`measureArm` guards every division).
- **VERIFIED OK — MAJOR 2: "Export without names or notes" carried the journal.**
  - `npx tsx tmp/verify-observe-rules/strip.ts` now prints `false / false / false` for note text, dish name and `recordedAt`, with `meta.name` "Shared dish".
  - The checksum is recomputed over the stripped state. The state hash does not read history (`stateHash`, `src/sim/serialize.ts:219-253`).
  - LEAD note, older than P2.8 (P2.3) and not held against this fix: a stripped export still carries player branch names in `world.branches` (hashed) and in `world.commands.log`, as the payloads of lineage `rename` commands. The log is not hashed but is saved. The fixer flagged only `branches`.
- **MAJOR 3: importing a dish deleted own notes.** The merge step is VERIFIED OK: `merge-evict.ts` gives `{added:195, notListed:5}` and 5 own notes kept. The harm still occurs one step later; see the remaining MAJOR above.
- **VERIFIED OK — MAJOR 4: false "recorded none before" after 31 minutes.**
  - `first-second.ts` prints `firstSecond undefined … message shown: false`.
  - `traitRecordNote` (`src/ui/panels/TraitData.ts:84-97`) now reads only the recorded `since` and `compacted`.
  - `grep "none before|recorded none|firstSecond" src` finds nothing.
  - Tests cover the 31-minute case, a fresh dish and a migrated dish (the fixture gives `since: 190`).
- **VERIFIED OK — MINOR 5: commands that changed nothing were marked.**
  - `refused-mark.ts` prints `intervention marks []`.
  - The `src/sim/commands.ts:133-136` guard cannot double-decrement after the P2.2 and lineage adjustments.
  - History is outside the state hash. The determinism fixtures pass (below).
- **VERIFIED OK — MINOR 6: `debrisTotal` was not validated.** `historyProblem` checks every sample field, the accumulators and the trait rows. I also checked that these fields have been stable since P0 (`git log -p src/sim/history.ts`), so older saves still pass. The schema-1 and schema-2 migration tests pass.
- **VERIFIED OK — MINOR 7: "incomplete" label.** Regions and History Charts both say "incomplete" when compacted.
- **VERIFIED OK (fixture) — MINOR 8: migration evidence.**
  - `tests/persistence/fixtures/schema2-cleaning-crew-t1900.pixelmeba.gz` is a real old-build save. The hashes `baa42a29…` and `5ce059e4…` match, and the test passes.
  - The provenance tag is deferred to the lead, as flagged.
- **MINOR 9: checkpoint ring edge cases.**
  - (1) One ring per device: an owner decision. Settings now states it ("up to the last 10 across all your dishes").
  - (2) VERIFIED OK: writer token plus trimming to 10. The test proves both writers picked the same sequence number and ended with distinct ids and no orphan records.
  - (3) VERIFIED OK: the header tick comes from the serialized state. The test steps the world during the checksum.

### Player verifier findings

- **VERIFIED OK — MAJOR 1 (stripped export):** same fix as rules MAJOR 2.
- **VERIFIED OK — MAJOR 2 ("none before"):** same fix as rules MAJOR 4.
- **VERIFIED OK — MAJOR 3: a checkpoint opened as "paused where you left it" and Continue switched silently.**
  - The checkpoint opens as a branch with its own world id and the name "… (from 1:00)", with no bound slot. The state hash is the checkpoint's, since `worldId` is neither hashed nor used by the RNG.
  - The toast is honest, and Open asks first when Continue holds a dish.
  - The e2e journey passed on all 3 projects.
  - New MINORs on the confirm's focus and the Continue wording are listed above.
- **VERIFIED OK — MINOR 4: sentence punctuation.** Unit test and e2e ("I saw Sprinters gathering in the top left coincide with the sugar patch getting smaller.").
- **VERIFIED OK — MINOR 5: tap readout.** `onPointerDown`; only a mouse leave resets the readout. The e2e taps on both phone projects and the readout stays at "0:10: " after 500 ms.
- **VERIFIED OK — MINOR 6: contrast.** Marks use #4F5F67 on #F5F4EF (6.02:1); band edges use #256E9E (5.01:1), both computed. Change times are also given in words and in the table's "Dish changed" column.
- **VERIFIED OK — MINOR 7: "now" readout.** Regions readouts and chart labels name the sample time. History's per-second sparklines still say "now:" for a sample at most 1 s old; that is acceptable.
- **VERIFIED OK — MINOR 8: composer focus and live region.** The e2e checks focus into the form and back to its opener, and checks the `trait-spoken` polite region.
- **VERIFIED OK — MINOR 9: History tabs.** The tabs have ids, `aria-controls`, a roving tabindex and arrow/Home/End keys. The toggle is renamed "Trait charts" / "Trait table", and the time header shows only on Charts and Table.
- **VERIFIED OK — MINOR 10: Saved dishes.** Checkpoints are in one card with one explanation, times use the clock format, and Open and Delete… name their checkpoint. (Named slot rows still show "N s simulated", which predates P2.8.)
- **VERIFIED OK — MINOR 11: wording.**
  - The EXP_103, CLEANING_CREW_V1 and DEBRIS texts name "More → History and what happened" and the "Debris (total)" chart.
  - `content-validate` reports ok with hash `e88b6298…`, which equals `content/manifest.json`.
  - `.setting-note` is 16 px (checked by the e2e 16 px walker).

## Commands and results

The machine was loaded throughout (load average 6–8 on 2 CPUs; another re-verifier's Playwright was running).

- **Original repros against the current tree:**
  - `npx tsx tmp/verify-observe-rules/{strip,first-second,merge-evict,refused-mark}.ts`: all four findings no longer reproduce (outputs quoted above).
- **Unit tests:**
  - `npx vitest run tests/sim/history-journal.test.ts tests/sim/history-traits.test.ts tests/sim/history-debris.test.ts tests/persistence/checkpoints.test.ts tests/persistence/migration.test.ts tests/ui/journal-observations.test.ts tests/content/debris-text.test.ts tests/sim/history.test.ts` → **8 files, 50/50 passed** (163 s).
  - `npx vitest run tests/fixtures/determinism.test.ts tests/fixtures/deterministic-state.test.ts tests/fixtures/conservation-closed-lid.test.ts tests/worker tests/ui/journal-observations.test.ts` → **10 files, 75/75 passed** (416 s).
- **Static checks:**
  - `npx tsc -p tsconfig.json --noEmit` → exit 0.
  - `npx eslint` on the 18 changed source files and 6 test/spec files → exit 0.
  - `npx tsx tools/content-validate.ts` → `content ok · contentHash e88b6298…`, equal to the manifest.
- **E2E, task spec:** `E2E_PORT=4222 E2E_OUTDIR=tmp/dist-reverify-observe npx playwright test tests/e2e/observe.spec.ts` → **9 passed (11.1 min)** on phone-portrait, phone-landscape and desktop.
- **E2E, regressions:** `… npx playwright test tests/e2e/{save-reload,experiments,whatif,inspector}.spec.ts --project=phone-portrait --project=desktop` → **26 passed (21.4 min)**.
- **E2E, re-verifier probes:**
  - `evict.vspec.ts` on desktop: the MAJOR reproduced (4 own notes of 5).
  - `confirm-focus.vspec.ts`: the focus MINOR reproduced.
- **Boundedness:** `npx tsx tmp/reverify-observe/bound.ts` gives `LOCUS_COUNT 8; after 7 h: recent 180, minutes 360; worst-case trait JSON 1899 KB` (every locus active for 5 species in 5 regions). History, trait samples, the journal (≤ 200) and the ring (≤ 10) stay bounded. I did not repeat the fixer's 30-minute timing, because the sampling code is unchanged by this round.
