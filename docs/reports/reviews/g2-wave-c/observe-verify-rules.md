# G2 wave C — observe (P2.8) verification: rules, data and tests

Verifier: rules / data / tests lens. No repository file was edited except this report. No git state was changed.
Scratch files are in `tmp/verify-observe-rules/`. A real schema-2 writer, extracted from HEAD with `git archive`, is in the session scratchpad.

**Verdict: not done — 4 MAJOR, 0 BLOCKER.** The data recording, the ring and the save migration hold up. Three of the four MAJOR findings are on the journal path added by D-0027: a dish's journal now travels in files, so data from an untrusted file reaches device storage, and a "stripped" export carries it out. The fourth is a false label on the trait charts.

## Problems (most severe first)

### MAJOR 1 — An imported file can break Notebook → Journal permanently
- **Where:**
  - `src/sim/history.ts:350` `sanitizeJournalEntry` checks only id, kind, recordedAt and size.
  - `src/ui/journal.ts:112` `isStamp` checks only kind, id and a string `experimentId`.
  - `src/ui/state.ts:1186` `syncDishJournal` merges every opened or imported dish's entries into localStorage.
  - `src/ui/views/Notebook.tsx:176` `e.measures.some(...)` then throws.
- **Repro:** `tmp/verify-observe-rules/poison.vspec.ts` (Playwright desktop, port 4202, `--config tmp/verify-observe-rules/pw.config.ts`).
  - The test builds a normal save whose `state.history.journal` holds `{id:'evil-1', kind:'experimentStamp', experimentId:'EXP_A', recordedAt:'2026-09-28T00:00:00Z'}`. The checksum is recomputed, as anyone can do because it is a plain SHA-256.
  - Import it via Saved dishes. `pixelmeba.journal` in localStorage now holds the entry.
  - Home → Notebook → Journal raises the page error `Cannot read properties of undefined (reading 'some')`. The list renders nothing, which hides every legitimate stamp and note too (`poison-2.png`).
  - It happens again after a reload. The poisoned entry is only pushed out after 200 newer entries.
- **Rule:** SPEC §14.3 "Import checks … finite values … malformed ⇒ clear message and no change".
- **Why the builder's test misses it:** "a tampered entry is refused" only covers an edit made without a new checksum. It never covers a well-formed file that carries a malformed stamp.
- **Fix direction:** validate stamps fully (the gate, measures and labels arrays and every string or number field) before they enter the dish or the device list. Better still, validate once in `sanitizeJournalEntry` using the same rules as `isJournalEntry`.

### MAJOR 2 — "Export without names or notes" now exports the player's notes and the real dish name
- **Where:**
  - `src/persistence/saveFile.ts:142–155`: `stripNames` blanks only `meta.name` and `meta.note`, while `serializeWorld` copies all of `history.journal` into `state`.
  - `src/ui/panels/MoreSheet.tsx:89–90` is the button labelled "Export without names or notes".
- **Repro:** `npx tsx tmp/verify-observe-rules/strip.ts` prints:
  - `meta.name: Shared dish | meta.note: ""`
  - `stripped export contains the journal note text: true`
  - `… contains the real dish name: true` (through the entry's `dish.name`, and a stamp's `dishName` and `prediction`)
  - `… contains wall-clock recordedAt: true`
- **Rule:** the button's promise, and SPEC §14.4 "metadata-stripped export recomputes the hash; no nicknames unless opted in, no device metadata".
- **Why this is new:** D-0027 put the journal into the export, but the stripped variant was never adjusted, and no test covers `strip: true` with a journal.
- **Fix direction:** a stripped export writes `history.journal: []`, or strips entry text and names, and recomputes the checksum. Add a test.

### MAJOR 3 — Importing a dish can permanently delete the player's own Notebook entries
- **Where:** `src/ui/journal.ts:269–276`. `mergeJournal` sorts by `recordedAt` taken from the file, which can be any string of up to 40 characters, cuts the list to 200 and writes localStorage.
- **Repro:** `npx tsx tmp/verify-observe-rules/merge-evict.ts`.
  - The device holds 5 of the player's own notes.
  - It merges the 200 later-dated entries of an imported dish (a friend's shared file).
  - Output: `mergeJournal added 200 → device list 200 entries, own notes left: 0` and `own notes left in localStorage: 0`.
- **Why the loss is permanent:** notes that are not tied to a dish exist only on the device.
- **Rule:** CLAUDE.md "a failed import or write never touches the current world" and "Saves are sacred". An import should never silently delete the player's records.
- **Fix direction:** never let merged entries evict local ones (merge only while there is room, or keep local entries first), and reject non-ISO `recordedAt` values.

### MAJOR 4 — False label after 31 simulated minutes: "this dish recorded none before"
- **Where:** `src/ui/panels/TraitGraphs.tsx:400–401` shows `Trait samples start at ${clock(firstSecond)}; this dish recorded none before.` whenever `firstSecond > 10`.
- **Why it is wrong:**
  - Once the 10-second window compacts, `firstSecond` is the first kept minute sample (60 s), even though the dish did record samples at 10–50 s.
  - The same false sentence appears once the six-hour minute window drops old minutes (after about 6.5 h of dish time), and after `sanitizeHistoryRecords` cuts a loaded list.
  - It is true only for a dish migrated from schema 2.
- **Repro:** `npx tsx tmp/verify-observe-rules/first-second.ts` prints `points 181 firstSecond 60 compacted true` and `UI says "...recorded none before.": true`. Every dish past 31 minutes shows it.
- **Rules broken:**
  - CLAUDE.md "Honest labels".
  - SPEC §12.4 "Compacted history is labelled incomplete; never reconstruct".
- **Fix direction:** make the "recorded none before" line depend on a recorded fact, such as a stored first-trait-sample second or the migration, never on `firstSecond`. When `compacted` is set, say the older samples were thinned.

### MINOR 5 — Commands that changed nothing are marked as "changes made to the dish"
- **Where:** `src/sim/commands.ts:128` increments `pendingInterventions` for every applied command, including `accepted 0`.
- **Repro:** `npx tsx tmp/verify-observe-rules/refused-mark.ts`. A sugar deposit at cell (1, 1), outside the dish, returns `{accepted:0, rejected:0}`, and `interventionSeconds` then returns `[6]`.
- **Effect:** the new trait-chart marks, and the text "Vertical lines mark changes made to the dish (one, the latest at 0:06)", report a change that did not happen.
- **Background:** the counting predates P2.8, but P2.8 added the marks and the sentence. D-0028 already rules that a command which placed nothing is not an undo point.

### MINOR 6 — The new history field `debrisTotal` is not validated on load
- **Where:** `sanitizeHistoryRecords` (`src/sim/history.ts:394`) checks trait records and the journal only. `parseSaveFile` does not validate history samples.
- **Effect:** a file with `"debrisTotal": "x"` crashes the History table at `src/ui/panels/HistorySheet.tsx:359` (`.toFixed`), and the chart receives NaN.
- **Background:** the same gap already exists for the older sample fields. The new field adds one more.

### MINOR 7 — Compacted trait history is not labelled "incomplete"
- **Where:** `TraitGraphs.tsx:403` says only "Older minutes keep one sample each."
- **Rule:** SPEC §12.4 "Compacted history is labelled incomplete". The table's "(minute)" marker is fine.

### MINOR 8 — Migration evidence is weaker than the SPEC asks
- **What the SPEC asks:**
  - SPEC §14.5 "Version bumps ship with old-save fixtures … tags provenance".
  - ARCH §11.3 "each ships with an old-save fixture in `tests/persistence/fixtures/`".
- **What the build has:**
  - The schema-2 test (`history-debris.test.ts`, `asSchema2`) synthesizes a schema-2 file from the current writer.
  - No fixture is checked in.
  - No provenance tag is written. This follows the schema-1 precedent from D-0019.
- **What I checked instead:** a real schema-2 save written by HEAD loads and behaves correctly (see VERIFIED OK below). This finding is about documentation and evidence, not a functional defect.

### MINOR 9 — Checkpoint ring edge cases
1. **One ring for the whole device (proposed decision):** checkpoints of dish A are evicted by playing dish B. D4 §12 calls it "checkpoint history", which reads as per dish. This is for the owner to decide. The Settings text states the behaviour honestly.
2. **Two tabs:** two tabs with the ring on compute the same `checkpoint-<n>` id from their own `list()` (`checkpoints.ts:104`). One slot pointer then overwrites the other and orphans its record. Once the ring holds more than 10, it never shrinks back, because each write evicts only one.
3. **Header tick:** `buildSaveFile` reads `world.tick` for the file header after its first `await` (`saveFile.ts:154`). A checkpoint written while the dish keeps running can carry a header tick later than its state. The builder's comment says the tick is exact, which is true only for `state`. Nothing reads the header tick today.

## VERIFIED OK

- **Build numbers:** they match the canonical docs.
  - SPEC §10.7: "Optional automatic checkpoint ring: 10 snapshots at 60 s intervals, labelled automatic, rotating; pinned saves are never removed silently."
  - D4 §12: "ten snapshots at 60 simulated-second intervals … Before making a checkpoint, enforce the existing storage limits."
  - CT §12.10: "checkpoint ring 10 × 60 s".
  - Code: `CHECKPOINT_RING_SIZE = 10` and `CHECKPOINT_INTERVAL_TICKS = 600` (`checkpoints.ts:31,33`); written at `tick % 600 === 0` in `stepDish` (`host.ts:853–879`); never for comparison arms or failed dishes.
- **Ring default:** the ring is off by default. UX §1 lists "checkpoint ring" under Settings, and the SPEC says "Optional". Code: `state.ts` sends `setCheckpointRing(settings.checkpointRing === true)` when the client is created; the checkpoints test covers it ("off by default").
- **Ring atomicity and eviction:**
  - One `backend.commit` writes the new record and slot and deletes the evicted checkpoint's record and slot. The IndexedDB backend runs one readwrite transaction per commit (`idb.ts:53–64`).
  - Only `checkpoint-*` ids are ever deleted.
  - `SaveStore.save` refuses non-slot ids (`store.ts:90`).
  - Every consumer of the slot list (MoreSheet, WhatIfSheet, WhatIfState, Home) iterates only `slot1–10` or the autosave.
  - Reverting either guard (the eviction filter or the preflight) would fail `checkpoints.test.ts`.
- **Ring storage limits:**
  - A preflight needs room for the checkpoint plus one more save of the same size.
  - A QuotaExceededError is reported as `storage-full`, and every refusal leaves the store byte-identical.
  - The tests cover a failing commit, a full store, the platform estimate and a refusal at commit.
- **Opening a checkpoint:** it opens as a paused dish at the checkpoint tick with the recorded hash, bound to no slot (`host.ts:273–274`). The test checks this through the What if? plan `own:false`, which would fail if the `delete ownSlots` line were reverted.
- **Trait samples are observation only:**
  - They are recorded in stage 10 (`publish.ts:63`) and read only by the `traitHistory` handler (`host.ts:534`).
  - They are not in `stateHash` (`serialize.ts` hashes no history).
  - The diff of `src/sim/history.ts` has no `Math.random`, no `Date` and no Map/Set/object-key iteration; sorts are numeric.
  - No new det streams. No material moves, so the ledger is untouched.
  - Loci are integers 0–100 (`genome.ts:93`), which matches the fixed 0–100 axis.
- **Trait series test:** `history-traits.test.ts` recomputes independently (quarter from position against 64; loci from `lociActive` plus E03 → locus 7) at every 10-s sample, both in stage 10 and through the worker reply and table cells. It is not vacuous: more than 20 samples have a real range and at least 3 quarters are occupied.
- **Debris series:**
  - The series equals an independent circle-mask sum of detritus at every second.
  - Minute summaries keep the end-of-minute value.
  - Detritus is a core field, so every current dish records it.
  - The EXP_103, CLEANING_CREW_V1 and DEBRIS texts name "the Debris chart" in History and still name the overlay; the edits are text only.
  - `content-validate` reports `content ok · contentHash 684235af…`, which matches the manifest.
- **Schema 3 and migration:**
  - The migration copies and leaves the input untouched; there is a test for this.
  - **Real old save, checked independently:** I wrote a schema-2 save with the HEAD build (`CLEANING_CREW_V1`, seed 103, tick 1900) and loaded it with the current build.
    - It migrated to 3.
    - Its 190 old seconds have no debris value; the empty trait list and journal became `[]`.
    - After 300 more ticks the hash is `afb53c653b9ef093`, identical to HEAD continuing natively.
    - Debris is recorded from second 191 on and traits from 200.
    - A re-save and reload keeps the hash.
- **Journal in the dish save:** the entries are inside the checksummed state and outside the state hash, and they survive a slot save, reopening, export, import and Undo; rollback keeps them too (`host.ts` undo and rollback). Reverting the Undo line would fail `history-journal.test.ts`.
- **Honest journal wording:** the sentence is "I saw X coincide with Y."; the card adds "does not say that one caused the other"; the chart notes say "what happened together, not what caused it".
- **Measurements reproduced** (`tmp/verify-observe-rules/bench.ts`, FIRST_DISH_V1, seed 104729, 18,000 ticks):
  - 2,956 alive.
  - History JSON 832.2 KB, of which traits 236.3 KB, with 1,800 per-second samples and 180 trait samples.
  - One trait sample takes 3.68 ms median (5.92 ms max): 14 rows, 1,351 B.
  - These match the builder's §4 exactly.
- **Ownership:** every hunk tagged P2.8 is in an owned or shared file. The shared-file changes add code; the only replacement is `SCHEMA_VERSION` going from 2 to 3, as D-0019 requires. The `styles.css` hunk is appended at the end only (`@@ -2161,0 +2162,320`). The only touch outside the Journal tab is a one-line type narrowing in `Notebook.tsx` `stampedIds()`.
- **Commands I ran myself:**
  - vitest on the 7 P2.8 files: **29/29 passed**.
  - vitest on tests/worker, tests/persistence, tests/sim/{history, smoke, view-switch} and tests/fixtures/{determinism, deterministic-state, conservation-closed-lid}: **15 files, 110/110 passed**.
  - `tsc --noEmit`: exit 0.
  - eslint on the P2.8 files: exit 0.
  - Port 4202 is stopped.
