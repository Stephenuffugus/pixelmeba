# G2 wave C — observe builder (P2.8): regional trait graphs, checkpoint ring, journal

Resumed after the machine restart. The earlier builder's uncommitted work was in the tree and I kept
it. I audited it against every Build and Done-when item, fixed what was partial or wrong, and
re-ran every test listed below in this session. I did not run git add, commit, stash, checkout,
reset, rm or restore.

## 1. Audit checklist

"Found" is the state of the tree when I resumed. "Now" is the final state, with the evidence
re-run in this session.

| # | Item | Found | Now | Evidence |
|---|---|---|---|---|
| B1a | Regional trait data from recorded history: a sample every 10 simulated s; per region (whole dish + 4 quarters) × species: count, locus mask, then n/median/min/max for each active locus | DONE | DONE | `src/sim/history.ts:160` (cadence), `:174` (regions), `:189` buildTraitSample, `:244` recordTraitSample, called from stage 10 `src/sim/publish.ts:63`. Test: `tests/sim/history-traits.test.ts` "stage 10 records…" compares every region/species/locus at every sample tick with an independent recomputation from world state. |
| B1b | Bounded and compacted like the rest of history (documented) | DONE | DONE | `history.ts:231` pushTraitSample: 10-s samples for the last 30 min, then the whole-minute sample per minute up to 6 h. Test "compaction keeps the last 30 minutes…". Measured on a dense dish (§4). |
| B1c | Never from the renderer | DONE | DONE | The worker `traitHistory` request (`src/worker/host.ts:534`) reads `world.history` only. The UI only formats the reply (`src/ui/panels/TraitData.ts`). |
| B1d | Small multiples in the one validated ink (D-0014), crosshair readout, text summary, table view | DONE, with defects | DONE | `src/ui/panels/TraitGraphs.tsx`. Population and trait-median/range panels for 5 regions, ink #256E9E. The shared crosshair snaps to recorded samples (pointer and ←/→ keys). Text summary and table included. **Fixed:** repeated `clipPath` ids in each region glyph (duplicate DOM ids) are replaced by id-free sector paths. The chart note wrongly said "median over the living X" for loci only carriers have; now it says "…that carry this trait". **Added:** marks for changes to the dish (SPEC §12.4 "Interventions marked on the timeline"), read from recorded history (`history.ts:320` interventionSeconds, `host.ts:545`) and also stated in words. |
| B1e | Selected trait picker (organism + locus) | DONE | DONE | Pickers offer only loci with records (`traitAvailability`); e2e picks a trait. |
| B2a | Checkpoint ring: Settings toggle, off by default (SPEC §10.7 "Optional") | DONE | DONE | `src/ui/views/SimplePage.tsx:45`, `state.ts:149/199`. Test "off by default: playing past a minute writes no checkpoint"; e2e asserts the toggle starts unchecked. **Added:** `aria-describedby` to its explanation. The note was 14 px and is now 16 px. |
| B2b | 10 checkpoints at 60 simulated s, labelled automatic | DONE | DONE | `src/persistence/checkpoints.ts:31/33`; `host.ts:852` maybeCheckpoint writes at whole minutes of dish time, never for comparison copies. Worker tests "one checkpoint per 60 simulated seconds…" and "eleven minutes of play keep ten…". |
| B2c | Same atomic, checksummed, predecessor-safe path as slots | DONE | DONE | One `backend.commit` puts the record and slot entry and deletes the evicted checkpoint, all together or none. The record is a full checksummed save file, verified on load by `SaveStore.load`. The test loads every checkpoint through `store.load` + `parseSaveFile`. |
| B2d | Evicts only the oldest automatic checkpoint, never a named save, the autosave or a predecessor | DONE | DONE | Test "keeps ten…; the eleventh removes only the oldest automatic one": a byte-for-byte snapshot of every non-checkpoint slot and record is unchanged, and `store.save` refuses a checkpoint id. |
| B2e | Storage limits: when the store refuses, keep the older checkpoints and say so | DONE | DONE | Preflight (`checkpoints.ts:98`): room for this checkpoint **and** one more save of the same size, else `storage-full`. Tests cover a failing commit, a full store (preflight), the platform estimate, and a store that refuses at commit (QuotaExceededError): nothing changes and `kept` is reported. A toast in `state.ts:1147` shows once per reason, and Settings shows the latest outcome. |
| B2f | Openable from Saved dishes; not one of the ten slots | DONE, labelling thin | DONE | Listed after the named slots as "… (automatic checkpoint)". **Added** a line in `src/ui/views/Saves.tsx:52`: "Automatic checkpoint, not one of your ten save slots…". A checkpoint opens bound to no slot (`host.ts:274`), so What if? keeps it in the first free slot, not "its own" (test). I checked every consumer of the slot list: SaveSheet and What if? "Replace a saved dish" use only slot1–slot10, `freeSlot()` checks only named ids, and Home reads only `autosave`. No checkpoint is counted as a player slot or offered as one. |
| B3a | Journal: "I saw X coincide with Y" with time, dish and an optional link to a stamp or a comparison result card | DONE | DONE | `src/ui/journal.ts:239` addObservation, `src/ui/views/NotebookJournal.tsx` (form + card). The form appears in Notebook → Journal and in History. **Fixed:** the form's heading was h2 inside History's h2 and is now h3 there. |
| B3b | Shown in Notebook → Journal with experiment stamps; honest wording | DONE | DONE | `src/ui/views/Notebook.tsx:145`. The sentence always reads "I saw … coincide with …". The card says "This note does not say that one caused the other." |
| D1 | Charts update from history; the regional series and the table match an independent recomputation at the sample ticks | DONE | DONE | `history-traits.test.ts`: stage 10 path, and the worker path (`traitHistory` reply + `traitTableRows` cells vs recomputation at ticks 100…900). The change marks equal [1, 51] for commands at ticks 0 and 500. |
| D2 | Ring respects storage limits and never evicts named saves (MemoryBackend, failing commit, full store) | DONE | DONE | `tests/persistence/checkpoints.test.ts` (7 tests). |
| D3 | Journal entries persist and list | DONE | DONE | `tests/ui/journal-observations.test.ts` (4 tests); e2e reloads and sees the note. |
| D4 | e2e observe: pick a trait → regional charts → table → ring on → checkpoint after the interval at 4× → open it → journal entry → Notebook | DONE | DONE | `tests/e2e/observe.spec.ts`, 6/6 on all three projects. **Added:** text ≥ 16 px checks on History, Regions (charts and table), the ring note, the Saved dishes checkpoint line, the journal form and the Notebook; axe on Settings; the Debris chart is shown; Settings at 200 %. |
| D5 | Journal in the dish's save (D-0027): outside the state hash, checksummed with the file, exported and imported with it; old saves load; test save → export → import | PARTIAL (export → import only) | DONE | `history.journal` (≤ 200 entries, ≤ 16 KB each; `history.ts:356`). The state hash does not read history. **Added** the test "save to a slot → open the slot → export → import" in `tests/sim/history-journal.test.ts`. It uses the real host with a MemoryBackend store; the entries survive every step and the state hash is unchanged. Another test shows that editing a saved entry without a new checksum is refused. Old saves: schema 2 → 3 path below. |
| D6 | Debris total as a recorded History series (D-0028 follow-up); D-0019 path; old saves load and show no debris line; texts point at History and the overlay | DONE | DONE | `publish.ts:48/60` records `debrisTotal` each second. History "Debris (total)" chart is in `HistorySheet.tsx:265`. World schema 3 (`world.ts:29`) migrates by copy (`serialize.ts:168`). `history-debris.test.ts` checks the series against an independent sum over the dish at every second, and loads a schema 2 save through `loadSaveFile`: it continues with the same hash and has no debris for its older seconds. Content text is covered by `tests/content/debris-text.test.ts`, and `content-validate` is ok. **Fixed:** the note for missing debris now says why ("recorded by an older version of Pixelmeba"). A partial-range note was added. |
| A11y | 48 px targets, text ≥ 16 px, 200 % in portrait and landscape, axe | WRONG (text) | DONE | Several texts were below 16 px: trait panel captions 13.6 px, axis/time notes and trait table 12.8 px, picker labels 14 px, ring note 14 px, History spark captions 13.6 px, History table 12.8 px, event lines 14 px, chart headings 15.2 px. All are now `var(--fs-body)` in my files and my CSS section. The e2e checks them on all three projects. The first e2e run after my 16 px assertion failed on "Organism"/"Trait" at 14 px, and that is fixed. |
| Robustness | A loaded file cannot carry an unbounded trait history | MISSING | DONE | `sanitizeHistoryRecords` caps loaded trait samples at the window sizes (185 + 360), drops malformed ones and marks the history compacted when it cut any (`history.ts:383`). Test "a loaded world never holds more trait samples than the windows allow". |

## 2. Files changed (mine / additive shared)

Owned: `src/sim/history.ts`, `src/ui/panels/HistorySheet.tsx`, `src/ui/panels/TraitGraphs.tsx`,
`src/ui/panels/TraitData.ts`, `src/persistence/store.ts`, `src/persistence/checkpoints.ts`,
`src/ui/journal.ts` (existing API kept: `addJournalEntry`, `updateJournalEntry`, `journal`,
`journalUnseen` unchanged), `src/ui/views/Notebook.tsx` (Journal tab, plus the `stampedIds`
type guard the union needs), `src/ui/views/NotebookJournal.tsx`, `content/experiments/EXP_103.json`,
`content/recipes/CLEANING_CREW_V1.json`, `content/materials/DEBRIS.json` (text only) plus
`content/manifest.json` (hash written by `content-validate --write`), `tests/sim/history-traits.test.ts`,
`tests/sim/history-debris.test.ts`, `tests/sim/history-journal.test.ts`,
`tests/persistence/checkpoints.test.ts`, `tests/persistence/migration.test.ts` (one assertion now
expects schema 3), `tests/content/debris-text.test.ts`, `tests/ui/journal-observations.test.ts`,
`tests/e2e/observe.spec.ts`.

Shared, additive only: `src/sim/serialize.ts` (schema-3 migration step; sanitize after load),
`src/sim/world.ts` (SCHEMA_VERSION 3), `src/sim/publish.ts` (debris + trait sample in stage 10),
`src/worker/protocol.ts` (traitHistory / journalPut / journalGet / checkpointRing / checkpoint
packets, SlotSummary.automatic, `interventions` in the reply), `src/worker/host.ts` (handlers, ring,
journal kept through Undo and rollback), `src/worker/client.ts`, `src/worker/sim.worker.ts` (storage
estimate), `src/ui/state.ts` (ring setting, checkpoint notices, journal sink and merge),
`src/ui/views/SimplePage.tsx` (toggle + note), `src/ui/views/Saves.tsx` (checkpoint line),
`src/ui/styles.css` (P2.8 section at the end only). The other hunks in `saveFile.ts`, `host.ts`,
`protocol.ts`, `client.ts`, `snapshot.ts`, `state.ts`, `MoreSheet.tsx` and `styles.css` belong to the
founders builder (P2.2).

Scratch: `tmp/observe-bench.ts` (ignored folder) was used for the measurements and has been deleted.
The build folder `tmp/dist-observe` (ignored) is still there. Port 4192 is stopped.

## 3. What each test proves

- `tests/sim/history-traits.test.ts` (6 tests):
  - Stage 10 records every region, species and locus exactly as an independent recomputation finds them at each 10-s tick. The data is not trivial: more than 20 samples have a real range, and 3 or more quarters are occupied.
  - Through the worker, the reply, the table cells and the text summary match the recomputation. The change marks equal [1, 51].
  - Trait records do not affect the state hash. They survive save and reload, and continuing gives the same hashes.
  - A loaded file is capped to the window sizes.
  - Change marks: per-second samples are marked at their second, compacted minutes at the end of the minute.
  - Compaction bounds: 30 min of 10-s samples, then whole-minute samples up to 6 h.
- `tests/sim/history-debris.test.ts` (3 tests):
  - The debris total equals an independent sum over the dish at every second.
  - Minute summaries keep the end-of-minute value; samples without one stay without.
  - Schema 2 → 3 migration by copy through `loadSaveFile`: the input is untouched, the hash is identical, the continuation is identical, the older seconds have no debris, and a re-save is at schema 3.
- `tests/sim/history-journal.test.ts` (4 tests):
  - journalPut → export → import keeps the entries. The state hash ignores them and the checksum covers them; a tampered entry is refused.
  - **new:** slot save → open → export → import keeps the entries.
  - Undo keeps the journal.
  - Malformed or oversized entries are refused without pausing the dish; at most 200 are kept.
- `tests/persistence/checkpoints.test.ts` (7 tests):
  - Rotation and a player store that stays byte-identical.
  - A failing commit changes nothing.
  - Preflight refusal and the platform estimate.
  - The store refusing at commit is reported as storage-full.
  - The worker ring: off by default. When on, it writes at 600 and 1200 ticks, lists after the named slots as automatic, opens paused at exactly tick 600 with the recorded hash, and is bound to no slot. 11 minutes of play leave 10 checkpoints and no orphan records.
- `tests/ui/journal-observations.test.ts` (4 tests): observations persist and list with stamps, newest first, and survive a reload. Cleaning and limits hold. Entries go to the dish sink. Merging is idempotent and malformed entries are dropped.
- `tests/content/debris-text.test.ts`: every text that sends players to History for debris names the Debris chart, and the overlay is still named.
- `tests/e2e/observe.spec.ts` (2 tests × 3 projects):
  - The whole journey above, plus a 16 px check on each touched screen, axe on each screen, the Debris chart, and the "no changes" sentence.
  - The 200 % version: Regions, the table, the Journal form and Settings, with no sideways scrolling and 48 px targets.

## 4. Measurements (dense dish, 30 simulated minutes)

`FIRST_DISH_V1`, seed 104729, Standard, headless (`tsx`, same code as the worker). The machine was
shared with other agents, so the absolute tick times vary between runs. I report both runs.

| | Run 1 (quieter) | Run 2 (loaded) |
|---|---|---|
| Alive at 30 min | 2,956 | 2,956 |
| Mean tick | 5.02 ms | 10.44 ms |
| One regional trait sample (`buildTraitSample`), median / p90 of 51 | 3.73 / 6.24 ms | 3.64 / 5.41 ms |
| Amortized per tick (one sample per 100 ticks) | 0.037 ms (≈ 0.7 % of a tick) | 0.036 ms |
| Trait sample size | 1,354 bytes JSON (14 rows) | same |
| History JSON at 30 min | 832.2 KB (gzip 184.0 KB) | same |
| … per-second samples / trait samples / journal | 595.7 / 236.3 / 0.0 KB | same |
| Full world state JSON / gzip (≈ one checkpoint record) | 7,515 KB / 1,013 KB | same |
| Synchronous part of a checkpoint (serialize + canonical JSON, same as each autosave) | — | median 82.9 ms (78.6–148.8) |

Boundedness, from a 40-minute run: history went from 832.2 KB to 855.5 KB. The per-second window
stayed at 1,800 samples, with 10 minute summaries. Trait samples stayed at 180 recent plus 10 minute
samples. Upper bound at 6 h for this dish: the per-second window is ≈ 596 KB, 360 minute summaries
add ≈ 122 KB, recent trait samples (≤ 185 × 1.35 KB) add ≈ 250 KB, and 360 trait minute samples add
≈ 486 KB. That makes about 1.45 MB of history JSON (≈ 0.3 MB gzip). The ring holds at most
10 records, ≈ 10 MB for a dish this dense. The preflight also demands room for one more save of the
same size.

## 5. Commands and results (this session)

- `npx vitest run tests/sim/history-traits.test.ts tests/sim/history-debris.test.ts tests/sim/history-journal.test.ts tests/persistence/checkpoints.test.ts tests/ui/journal-observations.test.ts tests/content/debris-text.test.ts tests/persistence/migration.test.ts` (the audit re-run, before my additions) → `Test Files 7 passed (7) · Tests 26 passed (26)`.
- Regression: `npx vitest run tests/worker tests/persistence tests/sim/history.test.ts tests/sim/history-traits.test.ts tests/sim/history-debris.test.ts tests/sim/history-journal.test.ts tests/content tests/ui tests/experiments/journal-and-words.test.ts tests/experiments/app-flow.test.ts tests/fixtures/determinism.test.ts tests/sim/comparison.test.ts tests/sim/dormancy.test.ts` → `Test Files 26 passed (26) · Tests 189 passed (189)`.
- `npx vitest run tests/sim/view-switch.test.ts tests/sim/smoke.test.ts tests/sim/history-traits.test.ts tests/sim/history-journal.test.ts` → `4 passed · 24 passed`.
- After the change-marks addition: `npx vitest run tests/sim/history-traits.test.ts` → `6 passed`. `npx vitest run tests/worker/protocol.test.ts tests/sim/history-journal.test.ts` → `2 files, 19 passed`.
- Final unit run: `npx vitest run tests/sim/history-traits.test.ts tests/sim/history-debris.test.ts tests/sim/history-journal.test.ts tests/persistence/checkpoints.test.ts tests/ui/journal-observations.test.ts tests/content/debris-text.test.ts tests/persistence/migration.test.ts tests/worker/protocol.test.ts` → `Test Files 8 passed (8) · Tests 44 passed (44)`.
- `npx tsx tools/content-validate.ts` → `content ok · contentHash 684235af…` (manifest matches).
- `npx tsc -p tsconfig.json --noEmit` → exit 0 (last run after every edit).
- `npx eslint <all 27 files listed in §2 and the tests>` → exit 0.
- `E2E_PORT=4192 E2E_OUTDIR=tmp/dist-observe npx playwright test tests/e2e/observe.spec.ts`:
  - First run: 3 failed, 3 passed. My new 16 px check caught "Organism"/"Trait" at 14 px on every project.
  - After the fix: `6 passed (9.9m)`.
  - After adding the Settings checks: `6 passed (5.9m)`.
  - Final run (after the change marks): see the last line of this section.
- `E2E_PORT=4192 E2E_OUTDIR=tmp/dist-observe npx playwright test tests/e2e/save-reload.spec.ts tests/e2e/experiments.spec.ts tests/e2e/whatif.spec.ts tests/e2e/inspector.spec.ts tests/e2e/lineage.spec.ts tests/e2e/new-dish.spec.ts tests/e2e/garden.spec.ts` (every spec that opens History, Saved dishes, the Journal or Settings) → `71 passed, 1 failed (1.2h)`. The one failure is `[phone-portrait] new-dish.spec.ts:153` "`.home-grid` overflows sideways by 8px" on the **New Dish** page at 200 %. That is the founders builder's in-progress `NewDish.tsx`; none of my CSS classes are used there, and the same test passes on phone-landscape and desktop.
- Final, after the change marks and the Settings checks: `E2E_PORT=4192 E2E_OUTDIR=tmp/dist-observe npx playwright test tests/e2e/observe.spec.ts tests/e2e/inspector.spec.ts` → `12 passed (10.8m)` (observe 6/6 and inspector 6/6 on phone-portrait, phone-landscape and desktop).

## 6. Not done, and why

- Real player regions (P4.8) are out of scope. Regions are the whole dish plus four quarters split at cell 64, as assigned.
- The checkpoint's synchronous serialize (≈ 83 ms at 2,956 alive, the same as every autosave) still runs in the worker's tick loop. Making it cheaper is a cross-cutting change to the autosave path, so I did not make it here (see §7).

## 7. Bugs noticed elsewhere (not mine to fix)

- `new-dish.spec.ts:153` fails on phone-portrait: the New Dish page overflows 8 px sideways at 200 % (founders builder, P2.2).
- `.setting-note` (Settings "Follows your device setting…") is 14 px, below the 16 px rule. My ring note overrides it only for its own line.
- `.tabs .btn { min-height: 40px }` gives the **Inspector** tabs 40 px targets. I raised only History's tabs to 48 px.
- `.chart-group` is 15.2 px globally. Only History uses it, and I overrode it inside History.
- Recipe-scheduled commands (FOOD_TRAIL_V1, RESERVE_COMPARE_V1 meals) count as "interventions" in history, the same as the player's changes. The History intro used to say "Vertical lines mark your changes"; it now says "changes made to the dish", and the regional charts say the same.
- Autosave and checkpoint serialization cost ≈ 83 ms synchronous at ~3,000 organisms: a periodic hitch, every 15 s real time at 4× while the ring is on.

## 8. Proposed decisions

- PROPOSED DECISION: Regional trait samples are recorded in stage 10 every 10 simulated seconds.
  - Row format: [region, species, count, locusMask, (n, median, min, max) per set bit].
  - A locus counts as active per `phenotype.activeLoci`: the template's loci, plus dormancy for E03 carriers.
  - Regions are the whole dish plus quarters split at cell 64 (x/y < 64 = left/top) until P4.8.
  - Compaction keeps 10-s samples for the last 30 min, then one sample per minute (the sample at the whole minute, not an average: a mean of medians would be an invented number) up to 6 h.
  - The trait axis is fixed at 0–100 so panels compare directly. Quarter population panels share one scale; the whole dish has its own.
  - Change marks come from recorded history: per-second samples at their second, minute summaries at the end of the minute.
- PROPOSED DECISION: World schema 3 (P2.8) adds `history.traits` and `history.journal`, and an optional `debrisTotal` on samples. Older saves migrate by copy with an empty trait record and an empty journal. Their older samples keep no debris value and show no debris line. A loaded file's trait lists are capped to the window sizes and malformed records are dropped, never fatal.
- PROPOSED DECISION: Checkpoint ring rules.
  - One ring for the device: 10 checkpoints in total, across dishes.
  - A checkpoint is written at every whole minute of dish time (tick % 600 = 0) of the dish being played. Comparison copies are never checkpointed.
  - Slot ids are `checkpoint-NNNNNNNN`. Checkpoints are never among the ten named slots; `store.list()` and `freeSlot()` exclude them.
  - Preflight: the write needs room for the checkpoint **and** one more save of the same size (navigator.storage.estimate on web, `backend.usage()` otherwise). A refused write, or a store that refuses the commit, keeps everything. The player is told once per reason, and Settings shows the latest outcome.
  - A write still in flight at the next minute skips that minute ('busy').
  - Opening a checkpoint loads a dish bound to no slot. Checkpoints can be deleted from Saved dishes like any save.
- PROPOSED DECISION: Journal with the dish (completes D-0027).
  - Entries whose `worldId` equals the open dish's are also stored in `history.journal` (≤ 200 entries, ≤ 16 KB each, kinds experimentStamp/observation). They are checksummed with the file and are not in the state hash.
  - Undo and error rollback keep them, because they are notes and not part of the undone change.
  - Recording or changing such an entry autosaves the open dish so Continue carries it.
  - Opening or importing a dish merges its entries into the device Notebook by id. Malformed entries are ignored on both sides.
- PROPOSED DECISION: All text in History (charts, Regions, tables, event lines, chart headings), the Journal form and cards, the Settings ring note and the Saved dishes checkpoint line is at least 16 px (`--fs-body`). `observe.spec.ts` enforces this on all three projects.
