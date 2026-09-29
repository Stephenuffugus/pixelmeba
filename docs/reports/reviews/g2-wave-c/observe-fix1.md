# G2 wave C — observe (P2.8) fix round 1

Round-1 fixer for BUILD_DIRECTIVE P2.8 (regional trait graphs, checkpoint ring, journal), working on
the builder's tree (not restarted). Inputs: `observe-verify-rules.md` and `observe-verify-player.md`.
No git state was changed (no add/commit/stash/checkout/reset/rm/restore). Port 4192 is stopped.

**Result: every MAJOR (4 rules + 3 player; two are the same stripped-export finding) is FIXED with
a test that fails on the old behaviour. Every MINOR is FIXED except two parts that are owner/lead
decisions (one ring per device; a general migration provenance tag), stated below.**

## 1. Per problem

### Rules verifier

**MAJOR 1 — a crafted file's malformed stamp broke Notebook → Journal permanently. FIXED.**
- One validator for every journal entry, `journalRecordProblem` (`src/sim/history.ts`). It checks every
  field the Notebook reads: version, id, kind, ISO `recordedAt`, `worldId`; for stamps the text fields,
  the numbers, `labels`, `gate` and each `measures` cell (a measured NaN stored as JSON `null` is
  accepted); for notes both parts, `dish` and `link`; and the 16 KB bound. Lengths count code points,
  so an emoji note of 120 characters (240 UTF-16 units) is still valid.
- The worker's `journalPut` and `sanitizeJournalEntry` use it. The UI's `isJournalEntry`
  (`src/ui/journal.ts`) delegates to the same function, so what a dish keeps is exactly what the
  Notebook can list.
- `parseSaveFile` refuses a file whose journal holds a malformed entry, or more than 200 entries. Kind
  `integrity`, message: *"The dish's journal has an entry this version of Pixelmeba cannot read (entry
  1: its title is not text). Nothing was loaded."* This follows SPEC §14.3 "malformed ⇒ clear message
  and no change". The import toast shows the message; no dish opens and nothing reaches localStorage.
- Device storage that an older build already poisoned heals itself: `loadJournal` filters with the same
  validator.
- Last guard: every Journal list item renders inside `EntryBoundary` (`Notebook.tsx`), so a render
  error in one entry shows "This Journal entry could not be shown." and never hides the others.
- Tests:
  - `tests/sim/history-journal.test.ts` "an imported file whose journal holds a malformed stamp…": the
    verifier's exact file plus 10 single-field corruptions. Each is refused by `loadSaveFile`. The
    worker import posts an error, adds no dish and leaves the open dish's hash unchanged, and
    `journalPut` refuses the entry.
  - `tests/ui/journal-observations.test.ts` "entries a Notebook cannot show are ignored…".
  - e2e `observe.spec.ts` "a shared file with a malformed journal entry changes nothing…" (all three
    projects). It seeds a poisoned stamp in device storage next to a real note: the note lists and no
    page error occurs. Importing the verifier's file shows the refusal toast, opens no dish and puts
    nothing in localStorage, and the result survives a reload.

**MAJOR 2 (= player MAJOR 1) — "Export without names or notes" exported journal notes, dish names and
times. FIXED.**
- `buildSaveFile` with `stripNames` writes `history.journal: []` and computes the checksum over what it
  writes (SPEC §14.4 "Metadata-stripped export recomputes the hash"). The state hash never reads history,
  so it is unchanged.
- Test: `history-journal.test.ts` "Export without names or notes carries none of the journal…". The
  stripped text contains none of the note, the dish name, the prediction or either `recordedAt`. Its
  checksum is valid, it loads with the same state hash, and the ordinary export still carries the
  journal.

**MAJOR 3 — importing a dish could permanently delete the player's own notes. FIXED.**
- `mergeJournal` (`src/ui/journal.ts`) never removes a device entry. Merged entries only fill the free
  room below 200, newest first. It returns `{ added, notListed }`.
- `syncDishJournal` (`state.ts`) tells the player when entries were not listed: they stay with the
  dish's save, and nothing on the device was removed.
- A non-ISO `recordedAt` is rejected, because it is part of the validator.
- Test: `journal-observations.test.ts` "merging a dish's entries never removes an entry of this device".
  This is the verifier's case: 5 own notes plus 200 later imported ones. All 5 remain in memory and in
  localStorage, and `{added: 195, notListed: 5}`. A full Notebook takes none.

**MAJOR 4 (= player MAJOR 2) — "this dish recorded none before" after 31 simulated minutes. FIXED.**
- The claim now rests only on recorded facts:
  - `TraitHistory.since` is the dish second from which trait samples are recorded. It is 0 for a new
    dish. For a migrated dish it is the migration moment, set by `historyForSchema3(h, tick)`.
  - The `compacted` flag.
- `RegionalTraitSeries.firstSecond` (derived from the kept points) is removed. `traitRecordNote`
  (`TraitData.ts`) says either:
  - *"Trait samples start after 3:10: this dish was saved by an older version of Pixelmeba before then,
    which recorded no trait samples."* (only when `since > 0`), or
  - *"This trait history is incomplete: for times older than the last 30 simulated minutes it keeps one
    sample per minute, and none older than six hours."*
- A record written before `since` existed claims nothing about its start.
- Tests:
  - `tests/sim/history-traits.test.ts` "the charts state only recorded facts…": the verifier's 31-minute
    case, a fresh dish and a dish migrated at 2:03.
  - `tests/sim/history-debris.test.ts`: the migrated dish says "start after 3:10".

**MINOR 5 — commands that changed nothing were marked as changes. FIXED.**
- `src/sim/commands.ts` `applyCommand`: two additive lines. When `accepted === 0` and the count was not
  already taken back, the intervention count is taken back. This matches D-0028: such a command is no
  undo point either.
- History is outside the state hash, so determinism is unaffected.
- Test: `history-traits.test.ts` "a command that placed nothing is not marked…". A deposit at cell (1,1)
  gives no mark; a real feed is marked at its second.

**MINOR 6 — `debrisTotal` (and the older sample fields) not validated on load. FIXED.**
- `historyProblem` (`history.ts`) checks every value the History charts and tables read:
  - per-second samples and minute summaries, including `debrisTotal`;
  - the current-second accumulators;
  - trait samples and `since`.
- `parseSaveFile` refuses a malformed history with *"The dish's recorded history cannot be read
  (per-second sample 4 has a non-numeric debrisTotal). Nothing was loaded."*
- Test: `history-debris.test.ts` "a file whose recorded history holds a malformed value is refused": six
  corruptions, and the unedited file still loads. The real schema-2 fixture below passes the same checks.

**MINOR 7 — compacted trait history not labelled "incomplete". FIXED.**
- Regions: see MAJOR 4.
- History Charts now says *"Older history is incomplete: past the last 30 simulated minutes it keeps
  one-minute summaries."*

**MINOR 8 — migration evidence. FIXED (fixture); provenance tag NOT FIXED (proposed decision).**
- `tests/persistence/fixtures/schema2-cleaning-crew-t1900.pixelmeba.gz` (270 KB) is a real world-schema-2
  save written by the commit-0ac0477 build. I extracted it with `git archive` into the scratchpad, and the
  recipe is recorded in the test comment.
- The new test in `history-debris.test.ts` shows:
  - the file is schema 2 and loading does not change the input;
  - the migrated world has hash `baa42a29186c6c46`, as the old build recorded;
  - the explicit defaults are `since: 190`, an empty journal and no debris on old seconds;
  - after 300 ticks the hash is `5ce059e49121f688`, the same as the old build continuing natively;
  - a re-save is schema 3 and reloads to the same state.
- A general provenance tag (SPEC §14.5 "tags provenance") would touch `content.provenance`, which What
  if? reads, and every migration step. That is outside this assignment; see §3.

**MINOR 9 — checkpoint ring edge cases.**
- (1) **One ring per device: NOT FIXED (owner decision).** The Settings note now says so plainly: "up to
  the last 10 across all your dishes".
- (2) **Two tabs: FIXED.**
  - Slot ids are now `checkpoint-<seq>-<writer token>`, so concurrent writers never collide.
  - Each write removes every checkpoint beyond the newest nine, so a ring that ever held more than ten
    shrinks back to ten with no orphan records.
  - Test: `tests/persistence/checkpoints.test.ts` "two tabs writing to one store…". It first proves that
    both writers chose the same sequence number (the old id), then checks 2 distinct slots, no orphan
    records, shrinking to 10, and a byte-identical player store.
- (3) **Header tick: FIXED.**
  - `buildSaveFile` writes `tick: state.tick`, the serialized tick.
  - Test "a save file's header tick is the serialized state's tick…" runs the world 7 ticks during the
    checksum await.
  - The same race remains for P2.2's `meta.evolution` (see §3).

### Player verifier

**MAJOR 3 — opening a checkpoint said "paused where you left it", and Continue silently became the
rewound copy. FIXED.**
- A checkpoint opens as a **new branch** (SPEC §10.7 "Rewinding opens a new branch from a stored
  state"), in `host.ts` `loadSlot`:
  - it gets its own dish identity (`<worldId>+<dishId>`, as Duplicate does; `worldId` is not in the
    state hash, so the hash is exactly the checkpoint's);
  - its name says its moment, e.g. "Little Living Garden (from 1:00)" (`branchName`, ≤ 60 characters,
    never stacked);
  - it is bound to no slot.
- Its own checkpoints carry that name, so they can be told apart from the original's.
- The toast: *"Opened the automatic checkpoint of "Little Living Garden" at 1:00 as a new branch,
  "Little Living Garden (from 1:00)", paused. Continue now follows this branch."*
- In Saved dishes, when Continue holds a dish, Open asks first: *"Continue now holds "…" at 1:12.
  Opening this checkpoint starts a new branch, and Continue will follow it instead. To keep "…" as it
  is, save it to a slot first."* The buttons are "Open as a new branch" and "Cancel".
- Tests:
  - `checkpoints.test.ts`: the `branch` reply, the name, the new world id, the recorded hash, and a
    named slot opening as before.
  - "a branch's own checkpoints carry the branch's name".
  - e2e journey: the confirm text, the toast text, and the note listed as "Little Living Garden (from
    1:00) at 1:00 dish time".

**MINOR 4 — punctuation broke the sentence. FIXED.**
- Trailing `.!?…,;:` and a repeated leading "I saw" / "coincide(d) with" / "with" are left out. This
  happens when a note is written, and when it is shown, so older notes read correctly too.
- Tests: the sentence test in `journal-observations.test.ts` (the verifier's three outputs, plus "I saw"
  alone, which is refused), and the e2e types "…top left." and reads one sentence.

**MINOR 5 — a tap did not move the crosshair; the readout reset on lift. FIXED.**
- `pointerdown` sets the readout, and only a *mouse* leaving the chart resets it. This applies to Regions
  and to History's sparklines.
- Test: the e2e taps the whole-dish panel on both phone projects (hovers on desktop). The readout shows
  0:10 and still shows it 500 ms after the tap.

**MINOR 6 — change marks and the range band were below 3:1. FIXED.**
- Change marks are dashed in the muted ink #4F5F67 (6.0:1), apart from the solid crosshair. This applies
  to Regions and to History's sparklines.
- The range band keeps a pale grouping fill, and its minimum and maximum edges are 1 px lines in the ink
  #256E9E (5.0:1).
- Change times are also listed in words:
  - up to five times listed ("at 0:15, 0:40 and 1:02:05");
  - more as a count and span;
  - the trait table has a "Dish changed" column.
- Test: "changes to the dish are listed in words and in the table" (`history-traits.test.ts`).

**MINOR 7 — the readout said "now" for a sample up to 10 s old. FIXED.**
- Every readout and chart image label names the sample time ("0:20: 12 alive").
- Test: the e2e checks the readout format.

**MINOR 8 — focus dropped; the crosshair was silent to screen readers. FIXED.**
- The composer focuses its first field when it opens, in the Notebook and in History. Closing it
  (submit or Cancel) returns focus to the button that opened it.
- The arrow-key crosshair announces its sample through a polite live region (`trait-spoken`), and Escape
  announces "Back to the latest sample."
- Tests: the e2e checks focus on open and return after submit, and the live-region text after an arrow
  key.

**MINOR 9 — History's tabs were not a tabs widget; two "Table" controls; misleading header. FIXED.**
- History's tabs now have ids, `aria-controls`, a roving `tabIndex`, Left/Right/Home/End keys and
  labelled tabpanels.
- The Regions toggle is now "Trait charts" / "Trait table".
- The "Last N simulated seconds…" header appears only on the Charts and Table tabs; Regions states its
  own time span.
- Test: the e2e (axe clean on every touched screen; `inspector.spec.ts` still selects the Charts and
  Table tabs by name).

**MINOR 10 — the Saved dishes list with checkpoints was long and unclear. FIXED.**
- Checkpoints are listed in their own card, "Automatic checkpoints", with one explanation.
- Rows give times in clock format ("at 1:00 dish time").
- Open and Delete… name their checkpoint ("Open Little Living Garden (automatic checkpoint) at 1:00").
- Test: the e2e checks one explanation, the clock text, the named button, 16 px text and axe.

**MINOR 11 — small wording and format issues. FIXED.**
- The trait pickers wrap to a full row each, so the selected trait is not cut off.
- Settings "Latest: at …" uses h:mm:ss past an hour (`dishClock`).
- The ring note says "(not the copies of a comparison), up to the last 10 across all your dishes" and
  that each checkpoint opens as a new branch.
- EXP_103 now reads "open the resource history (More → History and what happened)… its "Debris (total)"
  chart". The recipe and material texts also name "Debris (total)". `content-validate --write` was run.
- `.setting-note` is 16 px.
- Test: `tests/content/debris-text.test.ts` now also checks that "History and what happened" and
  `title="Debris (total)"` exist in the UI source.

## 2. Files changed

- **Owned:**
  - src/sim/history.ts
  - src/ui/panels/HistorySheet.tsx
  - src/ui/panels/TraitGraphs.tsx
  - src/ui/panels/TraitData.ts
  - src/persistence/checkpoints.ts
  - src/ui/journal.ts (existing API kept; `mergeJournal` now returns `{added, notListed}`)
  - src/ui/views/Notebook.tsx (Journal tab only)
  - src/ui/views/NotebookJournal.tsx
  - content/experiments/EXP_103.json
  - content/recipes/CLEANING_CREW_V1.json
  - content/materials/DEBRIS.json (text), with content/manifest.json hash from `--write`
  - tests/sim/history-journal.test.ts
  - tests/sim/history-traits.test.ts
  - tests/sim/history-debris.test.ts
  - tests/persistence/checkpoints.test.ts
  - tests/ui/journal-observations.test.ts
  - tests/content/debris-text.test.ts
  - tests/e2e/observe.spec.ts
- **New:** tests/persistence/fixtures/schema2-cleaning-crew-t1900.pixelmeba.gz.
- **Shared, small edits:**
  - src/sim/serialize.ts: the schema-3 step passes the tick.
  - src/persistence/saveFile.ts:
    - the stripped journal;
    - `tick: state.tick`, a one-token change to a pre-existing line;
    - the history and journal checks in `parseSaveFile`.
  - src/worker/host.ts: a checkpoint opens as a branch.
  - src/worker/protocol.ts: optional `loaded.branch`.
  - src/worker/client.ts: passes `branch` through.
  - src/ui/state.ts:
    - the checkpoint toast;
    - the full-Notebook notice;
    - `dishClock` exported, now h:mm:ss;
    - `loadSlot` destructures `branch`.
  - src/ui/views/Saves.tsx: the checkpoint card; the named list filters out automatic rows.
  - src/ui/views/SimplePage.tsx: the note and the clock.
  - src/ui/styles.css: appended at the end only.
- **Outside ownership, small and additive:** src/sim/commands.ts, two lines (MINOR 5).

## 3. For the lead / owner

- PROPOSED DECISION: A dish's journal entries are validated field by field with one shared rule
  (`journalRecordProblem`), in the worker, at import and in the device Notebook.
  - A file with a malformed entry is refused with a clear message and no change, not silently trimmed.
  - The device list ignores what it cannot show.
- PROPOSED DECISION: "Export without names or notes" writes no journal entries and recomputes the
  checksum.
- PROPOSED DECISION: Merging a dish's journal into the Notebook never removes a device entry. It only
  fills free room up to 200 and tells the player how many were not listed.
- PROPOSED DECISION: Trait records carry `since`, the dish second trait recording began (0 for new dishes,
  the migration moment for older ones).
  - This is an optional field inside the not-yet-released world schema 3, so it needs no further bump.
  - The charts claim "no samples before" only from it, and label a compacted record "incomplete".
- PROPOSED DECISION: A loaded file's recorded history (every value the History charts and tables read) is
  checked like the rest of the state; a malformed value refuses the file.
- PROPOSED DECISION: A command with `accepted 0` is not an intervention in history (no chart mark), in
  line with D-0028's undo rule.
- PROPOSED DECISION: Opening an automatic checkpoint makes a new branch:
  - world id `<worldId>+<dishId>`, as Duplicate does;
  - named "<dish> (from m:ss)";
  - bound to no slot;
  - Saved dishes asks first when Continue holds a dish.
- PROPOSED DECISION: Checkpoint slot ids carry a per-page writer token. A write removes every checkpoint
  beyond the newest nine.
- OWNER: one ring for the whole device (10 checkpoints across dishes, bounded storage) versus one per
  dish (D4 §12 "checkpoint history" can be read either way). It is kept device-wide and stated in
  Settings.
- LEAD: a general migration provenance tag (SPEC §14.5) is not written by any migration (D-0019 did not
  either). Suggested: `content.provenance.migratedFrom: number[]`, added by `migrateWorldState` at the
  next schema bump, after checking What if?'s provenance comparisons.
- LEAD (P2.2 code in `saveFile.ts`): `meta.evolution` still reads `world.settings` after the checksum
  await. A setting changed in that window would label a checkpoint or autosave with the later setting.
  It is display-only meta; the fix is to read it before the await, or from `state.settings`.
- LEAD (P2.3, hashed state): player-chosen branch names live in `world.branches`, which the state hash
  covers. A stripped export therefore still carries them. Removing them would change the dish's hash,
  so this needs a ruling.

## 4. Commands and results (this session)

All of these ran after the final code edits unless noted. The machine was shared and loaded (load
average about 5.5 on 2 CPUs).

- `npx tsc -p tsconfig.json --noEmit` → exit 0. This was the last run, after every edit.
- `npx eslint` on the 18 changed source files and 7 test files listed in §2 → exit 0.
- `npx tsx tools/content-validate.ts --write` → `content ok · contentHash e88b6298…`. A re-check without
  `--write` matches the manifest.
- Targeted vitest while fixing:
  - `tests/sim/history-journal.test.ts`: 6/6
  - `tests/ui/journal-observations.test.ts`: 7/7
  - `tests/sim/history-traits.test.ts`: 9/9
  - `tests/sim/history-debris.test.ts`: 5/5
  - `tests/persistence/checkpoints.test.ts`: 11/11
- Regression vitest (after all sim, persistence and worker edits; later edits were UI-only):
  - Command: `npx vitest run tests/worker tests/persistence tests/sim/history.test.ts tests/sim/history-traits.test.ts tests/sim/history-debris.test.ts tests/sim/history-journal.test.ts tests/content tests/ui tests/experiments/journal-and-words.test.ts tests/experiments/app-flow.test.ts tests/experiments/cleaning-crew.test.ts tests/fixtures/determinism.test.ts tests/fixtures/deterministic-state.test.ts tests/sim/comparison.test.ts tests/sim/founders-presets.test.ts tests/sim/dormancy.test.ts`
  - Result: **Test Files 29 passed (29) · Tests 232 passed (232)**.
- `E2E_PORT=4192 E2E_OUTDIR=tmp/dist-observe npx playwright test tests/e2e/observe.spec.ts`:
  - Run 1: 6 passed, 3 failed. My new tap/hover check targeted the region glyph's `<svg>` instead of the
    chart; fixed the selector.
  - Run 2 (main journey only): 2 passed, 1 failed. Desktop paused at 1:12, not "1:0x"; the confirm text
    is now matched by pattern.
  - Run 3: 8 passed, 1 failed. On phone-landscape the "4" key arrived before the reopened dish screen
    listened, so the dish stayed at 0:25; the journey now presses again until the run toggle says
    Pause.
  - Final: **9 passed (8.8 m)**, three tests × phone-portrait, phone-landscape and desktop:
    - the journey;
    - 200 % text;
    - the malformed-journal file and the malformed device entry.
- `E2E_PORT=4192 E2E_OUTDIR=tmp/dist-observe npx playwright test tests/e2e/save-reload.spec.ts tests/e2e/experiments.spec.ts tests/e2e/whatif.spec.ts tests/e2e/inspector.spec.ts tests/e2e/lineage.spec.ts tests/e2e/new-dish.spec.ts`
  (every other spec that opens History, Saved dishes or the Notebook) → **54 passed (1.1 h)** on all three
  projects.
- Port 4192 stopped (`lsof -t -i :4192` is empty).

### Measurements (dense dish, 30 simulated minutes)

`FIRST_DISH_V1`, seed 104729, 18,000 ticks, headless (`npx tsx <scratchpad>/bench.ts`, the verifier's
script plus load checks). The machine was loaded (mean tick 17.5 ms, against 5–10 ms in the builder's
runs), so the absolute times are about 2–3× theirs; the sizes are exact.

| | Value |
|---|---|
| Alive at 30 min | 2,956 |
| History JSON | 832.2 KB (1,800 per-second samples; unchanged by this round) |
| Trait samples | 236.3 KB (180 samples, `since: 0`) |
| One regional trait sample, median / max of 15 | 8.15 / 25.93 ms → 0.082 ms per tick amortized (one per 100 ticks), about 0.5 % of a tick |
| New load checks (`historyProblem` + `journalProblem`) on this history | 3.95 ms median |
| Upper bound at 6 h (synthetic: 330 minute summaries, 330 trait minutes, 200 full-length notes) | history 1,466 KB, of which the journal is 102 KB; load checks 9.4 ms |

History and the ring stay bounded:
- 30 minutes per second, then minute summaries up to 6 h.
- Trait samples at most 185 + 360.
- The journal at most 200 × 16 KB, in practice under about 0.5 KB per note.
- The ring at most 10 checkpoints; a write now also removes any excess beyond ten.
