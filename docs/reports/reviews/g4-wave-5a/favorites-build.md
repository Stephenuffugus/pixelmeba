# g4 wave 5a — favorites (P4.1 Favorite families + the per-dish notebook record, D-0070)

Builder report, 2026-10-11. Nothing is committed (the lead commits). No world schema bump, no PROTOCOL_VERSION bump, no sim rule, no version field moved.

## Checklist: Build

1. **Notebook record**: DONE. It lives in `src/persistence/notebook.ts` and imports only `@sim/constants` and `@sim/hash`.
   - Format, version and checksum: `sealNotebook` :90 computes sha256 of `canonicalJson` of the record without `checksum`.
   - One validator per kind in `KIND_PROBLEMS` :159. A missing kind reads as `[]`. An unknown key is a problem.
   - `notebookProblem` :169 checks the envelope, the version, the worldId, every kind, the size and the checksum. It never throws.
   - Other functions: `readNotebook` :198, `notebookWithoutNicknames` :208, `notebookIsEmpty` :213 and `favoritesOnly` :227.
   - `cleanNickname` :96 uses `cleanName`'s rules. An empty nickname becomes null.
   - Favorite ids are `fav-<n>`, taken from `nextFavorite` and never reused.
   - Limits: 3 active and 20 unpinned. A 21st unpinned removes the oldest unpinned extinct record, else the oldest unpinned (`limitUnpinned`, src/worker/favorites.ts:490). The UI names the removed one in a toast (`removedText`).
   - No organism data is stored: only birth ids and birth ticks.
   - **Deviation:** `NOTEBOOK_MAX_BYTES` is 1 MB, not 256 KB (see Proposed decisions).
   - Proved by tests/persistence/notebook.test.ts and tests/ui/favorites.test.ts.
2. **In the save file**: DONE (src/persistence/saveFile.ts).
   - `SaveFile.notebook?` :152 sits beside `state`, outside its checksum.
   - `BuildSaveOptions` :205 adds `notebook` and `includeNicknames` (default false). `stripNames` always drops nicknames.
   - An empty notebook is not written, so files stay byte-identical to before.
   - `loadSaveFile` :568 returns `{ file, world, notebook, notebookDropped }` and never throws over a notebook. A problem gives an empty notebook plus the exact message.
   - `parseSaveFile`'s world checks are unchanged, so `SaveStore.load`'s verify never falls back to the predecessor because of a notebook (tested).
3. **Atomic with the world save**: DONE.
   - The notebook travels inside the same save text, so one commit writes both.
   - `SaveRequest` and `SlotInfo` carry `notebookChecksum` (src/persistence/store.ts:66 and :118), and `slotRecordFor` copies it (:158).
   - The host's `saveRequest` sets it.
   - `holdsExactly`, `exactCopies` and the Continue "saved" fast path also compare it (`sameNotebook`, host.ts:134). Without that, a Follow made after a slot save could be lost when Continue is kept.
   - `exportSave` replaces only the file's notebook, re-sealed without nicknames, unless the player opted in (`exportedSaveText`, host.ts:123). The state text and its checksum stay as stored.
4. **Worker state**: DONE (src/worker/host.ts).
   - `Dish.notebook` :271.
   - Every `buildSaveFile` call passes it: `saveSlot`, `autosave()`, `buildFor`/keep paths and `maybeCheckpoint` through `localSave` :1273, which keeps nicknames; `exportDish` passes the player's choice.
   - The notebook is read on `loadSlot` (:464), `importDish` (:510) and the transient Continue copy.
   - Undo (:743) and rollback (:2329) materialize the notebook before the world is replaced and keep it, like the journal.
   - `rebuildsExactly` returns false while the notebook is not empty (:1723).
   - `duplicateDish` (:1542) and an opened checkpoint branch copy the favorites only, under the new world id.
   - Comparison arms get an empty notebook and no watch (`watchOf` returns null for an arm or a transient copy).
5. **Protocol** (additive): DONE (src/worker/protocol.ts).
   - New requests: `notebookGet` (optional `inspect`, see Proposed decisions) and `favorite` with the six ops.
   - New replies: `notebook` (`refused?`, `removed?`, `inspected?`) and the unsolicited `notebookChanged` with its change union.
   - `loaded.notebookDropped?`. `exportDish.includeNicknames?` and `exportSave.includeNicknames?`.
   - `SnapshotMsg.favorites?: FavoriteMarks` is built in src/worker/favorites.ts and transferred like the lineage marks.
   - Additive slot fields: `representativeEntity`, `representativeHeld`, `next` and `depth`.
   - A favorite op never becomes a `CommandPayload`. The host test asserts `commands.nextSeq` and `stateHash` are unchanged.
6. **Membership tracker**: DONE (src/worker/favorites.ts `FavoriteTracker` :153, driven by `NotebookWatch` in src/worker/notebookWatch.ts).
   - Members: a living organism is a member if it was one, or if its recorded parent was a member at the previous tick. Every removal counts. Members carry their birth tick (-1 when the lineage record was compacted).
   - Follow next: the representative's living descendants, else all living members, sorted by birth tick then id (`candidates` :376).
   - Extinction record and the `favoriteExtinct` change (`afterTick` :274; `recordExtinction` :484).
   - `watches`/`rebind` rebuild from the saved members plus the root through lineage parents.
   - Highlighting: at most 200 per slot, then an aggregate of mean position and count (`marks` :423).
   - `stepDish` (host.ts:1217) builds one hook list (a running card's ArmObserver first, then the relationship watcher, then `NotebookWatch.hook`), calls `step` once, then `NotebookWatch.afterTick`.
   - The tracker also runs after an accepted command (host.ts:718), so a paused Sample Take or Discard is seen at once.
   - Members lifted into the held sample stay members (see Proposed decisions).
7. **UI**: DONE.
   - src/ui/favorites.ts holds the open dish's notebook (from `notebook` and `notebookChanged` packets) and the snapshot slot summaries.
   - **Follow button**: "Follow this family" in the Inspector (`data-testid="follow-family"`, Inspector.tsx:440/447). Once followed it reads "Following the {name} family" and opens the Family sheet.
   - **FavoriteFollow**: a nickname field (maxLength 60) with the exact privacy line, a fieldset of radio buttons (Circle, Triangle, Square, each with a shape glyph), and Follow. With three followed it shows the exact copy and offers Unpin for each.
   - **FavoriteSlots**: ≥ 48 px buttons with glyph, name and count. The aria-label is "Find the {name} family: {n} members". Tap = Find: select the representative and `zoomPreset('neighborhood', positionOf(entity))`. If the representative is gone, the Family sheet opens on Follow next; if it is held, a toast says so.
   - **FavoriteSheet**: name, species, "from {Species} #{root}", living members and generation depth (`slot.depth` = max generation over living members minus the root's). Confirmed inherited differences show as three separate items: Founder (`founderStartText`), Its own inheritance (`inheritedLead` on the representative's inspector payload) and Branch (the lineage answer's focus branch). Buttons: Find, Follow next, Rename, Change marker, Unpin / Pin again.
   - **Renderer**: `drawFavorites` (renderer.ts:1050) draws outline shapes with the 0x172c35 companion stroke from snapshot marks only, at most 200 per slot. The representative gets a second outline. Nothing is animated.
   - **FavoriteMarkers**: the "+{n}" aggregate as an HTML overlay.
   - **FavoriteExtinct**: the exact UX §5.8 copy plus "The last member, {Species} #{id}, was recorded at {m:ss}: {reason}." Look back sets `historyFocus` and opens the history sheet; Continue exploring closes the card; Start a new dish goes to the `newDish` route. No sound, no alarm styling.
   - **Notebook tab**: "Favorites" (NotebookFavorites.tsx), placed before Journal. It shows "Following", "Unpinned" or "No members remain since m:ss", offers Pin again, and has the no-dish copy.
   - **More**: an "Include family nicknames" checkbox, unchecked by default, that both export buttons read.
   - Every favorite change and every extinction calls `autosave()`.

## Checklist: Done when

- **tests/ui/favorites.test.ts** (8 tests): DONE.
  - A 4th Follow is refused with the exact copy; ids are not reused; following the same family again is refused.
  - Nickname cleaning, the 60-character limit, emoji counted by code point, and the default name `Sprinter #root`.
  - Membership equals `livingDescendants(root)` every 50 ticks over 2,500 ticks with births and deaths.
  - Sample Take: the organism leaves the living table with no death event and stays a member while held; Cancel brings it back; Discard ends the family with `REMOVED_SAMPLED`.
  - A rewind (world replaced the way the host's Undo does it) and a reload through `buildSaveFile`/`loadSaveFile` rebuild identical members; both then go on identically.
  - Follow next order is birth tick, then id. Giving the youngest candidate maximum energy, body and health does not reorder it.
  - Extinction by starvation records `lastBirthId`, `cause = DEATH_STARVATION` and the cell, frees the slot, emits one change, and uses the exact copy. Pin again is refused.
  - 250-member family: 200 highlighted (the first by birth tick, then id), one representative bit, the aggregate count 250 and the mean position; no aggregate at ≤ 200.
- **Never alters behaviour**: DONE.
  - tests/worker/favorites-host.test.ts follows three families on a host with a MemoryBackend store. The run is 4×, 3,200 ticks, one command, a second command plus Undo, then `saveSlot` → `loadSlot` in the middle. It gives equal `stateHash` and `trajectoryDigest(world, 'full')` to the same run without favorites, and asserts the marks really ran.
  - The world checksum is the same with and without a notebook (notebook.test.ts, round trip).
- **tests/persistence/notebook.test.ts** (13 tests): DONE.
  - Round trip.
  - `failNextCommit` keeps the previous world and notebook; a damaged current record falls back to the predecessor pair.
  - `holdsSave` is false after a notebook-only change.
  - Seven malformed cases each load the world with `notebookDropped` (exact text), an empty notebook and the same `stateHash` as the file without one, and the store opens the current record (no fallback).
  - The g2 save `first-dish-t3000` (its `hashAtLoad` from expected.json) and the schema 2 fixture load with an empty notebook and keep their hash. Re-saved with a notebook, the store keeps the original text byte for byte as the predecessor.
  - `exportDish` and `exportSave` carry nicknames only by opt-in; `stripNames` drops them always; the state and checksum are as stored.
  - Every record the tracker can write is valid (extinct, cell -1).
- **tests/worker/favorites-host.test.ts** (5 tests): DONE. Ops through DishHost; a tick-0 dish with a favorite is 'slot', not 'unchanged', is 'saved' after a save, and is 'slot' again after a rename; Duplicate copies favorites only; a comparison arm has no watch and no marks, and its op is refused.
- **tests/e2e/favorites.spec.ts**: DONE on desktop **and** phone-portrait. Garden at 4× until a Sprinter split; select a daughter; follow ("Mango", Triangle); the slot count and name are checked and the slot is ≥ 48 px. Find selects the representative. Save, reload, Continue brings the slot back. Export carries nickname null, or "Mango" with the box checked. The worker hash is unchanged by Follow, Find and the Family sheet. The axe check finds nothing serious or critical on the Follow panel, the Family sheet and the Favorites tab.

**Not covered by a browser test:** the extinction card's axe check. It needs an extinction in the browser; its copy and record are unit-tested.

## Files

**Created:**
- src/persistence/notebook.ts
- src/worker/favorites.ts
- src/worker/notebookWatch.ts
- src/ui/favorites.ts
- src/ui/strings/favorites.ts
- src/ui/panels/FavoriteFollow.tsx, FavoriteSlots.tsx, FavoriteSheet.tsx, FavoriteMarkers.tsx, FavoriteExtinct.tsx
- src/ui/views/NotebookFavorites.tsx
- tests/ui/favorites.test.ts
- tests/persistence/notebook.test.ts
- tests/worker/favorites-host.test.ts
- tests/e2e/favorites.spec.ts
- this report

**Changed (wave owner):**
- src/persistence/saveFile.ts
- src/persistence/store.ts
- src/worker/host.ts (also removed the now-unused `stepObserved` import)
- src/worker/protocol.ts
- src/worker/client.ts (`onNotebook`, `notebookGet`, `favorite`; export flags; `loaded.notebookDropped` → notice)
- src/render/renderer.ts
- src/ui/panels/Inspector.tsx

**Shared, additive only:**
- src/ui/state.ts: the Route tab 'favorites'; the sheet 'favorite'; `wireFavorites(client)` beside `onExperiment` (it calls `client.onNotebook` and adds the snapshot listener); `exportCurrent(strip, includeNicknames = false)`; one import.
- src/ui/views/DishScreen.tsx: four mounts and four imports.
- src/ui/views/Notebook.tsx: the tab, TABS entry, ref key, render branch and import.
- src/ui/panels/MoreSheet.tsx: the checkbox plus state.
- src/ui/styles.css: a block appended at the end.

## How each test was checked to fail without its mechanism

Mutation run (tmp/fav-mut.log). Each file was restored after its mutation, and the restore was confirmed.

| Mutation | Test | Result |
|---|---|---|
| M1: daughters do not join | divisions test | **FAILS** |
| M2: held-sample members dropped | Sample test | **FAILS** |
| M3: Follow next sorts youngest first | Follow next test | **FAILS** |
| M4: the watch nudges `E[0]` while a family is followed | never-alters host test | **FAILS** |
| M5: `notebookWithoutNicknames` returns the record unchanged | 2 nickname export tests | **FAIL** |

Without `notebookChecksum` in the index, the `holdsSave` test cannot pass: the world checksums are asserted equal in it. Without the `rebuildsExactly` guard, the keep-plan test returns 'unchanged'.

## Commands and results

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | clean, including the other agents' in-flight edits |
| `npx eslint` (every file listed above) | clean |
| `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/ui/favorites.test.ts tests/persistence/notebook.test.ts tests/worker/favorites-host.test.ts` | `Test Files  10 passed (10)` · `Tests  82 passed (82)` |
| Regression of the files my edits touch: `npx vitest run tests/worker/{keep-dish,keep-autosave,keep-continue-ui,host,host-requests,protocol,relationships,sample-transaction,whatif-ui}.test.ts tests/persistence/{persistence,migration,strip-names,checkpoints}.test.ts` | `Test Files  13 passed (13)` · `Tests  161 passed (161)` |
| `E2E_PORT=4271 E2E_OUTDIR=tmp/dist-favorites npx playwright test tests/e2e/favorites.spec.ts --project=desktop` | `1 passed (3.6m)` |
| same, `--project=phone-portrait` | `1 passed (2.0m)` |
| Re-run after the last validator change (extinct `cell` may be -1): `npx vitest run tests/persistence/notebook.test.ts` | `Tests  13 passed (13)` |

That last change only widens validation, so a record the tracker writes is never dropped. It came after the e2e and fence runs.

Port 4271 was stopped before and after each run. Timings were taken alongside other agents.

## FENCE

None. No fence value moved: g2-replay and the four trajectory-fence files pass unchanged.

## Bugs noticed elsewhere (not fixed)

- `DishHost.duplicateDish` spreads `...d`, so the copy shares the original's `relationships` watcher object. The copy's first step rebinds it to the copy's world, and the original's first-seen table is then fed by the copy. It predates P3.8. The fix would be `relationships: null` in the copy, a one-line change in host.ts. I left it for the lead because it changes D-0039 behaviour.

## PROPOSED DECISIONS

1. **Notebook size cap of 1 MB, not 256 KB.** A legal favorites record can exceed 256 KB: three nested active families of up to 6,000 living members at ≈ 17 bytes per pair is ≈ 306 KB, plus 20 unpinned records of 200 members. An oversized record would be dropped at the next load. The file limit is 25 MB; stage 2's kinds share the same budget.
2. **Duplicate and opened checkpoint branches copy the favorites only**, under the new world id. Story cards and goal attempts belong to the world they were recorded in (as assigned).
3. **Held-sample members stay members.** A member lifted into the held sample (Take) is alive and not in the dish. It stays a member without a place, comes back on Transfer or Cancel (same birthId), and leaves on Discard (`REMOVED_SAMPLED`). Treating Take as leaving would end a family that Cancel restores exactly.
4. **Extinction unpins.** A family with no members left is no longer followed: its slot is freed, the record stays with `extinct`, and Pin again is refused. This avoids empty slot buttons. The unpinned limit applies, and the removed record is named.
5. **An empty notebook is not written** to a file or the index. Old files and indexes stay byte-identical, and existing D-0033 store tests hold.
6. **Unpinned favorites are not tracked.**
   - On unpin, members are trimmed to the first 200 by birth tick then id.
   - Pin again rebuilds from the root plus the kept members through lineage parents. It is refused when no member is alive (no extinction time is invented).
   - Following an already-followed root is refused ("You already follow this family.").
7. **Additive protocol beyond the assignment.**
   - `notebookGet.inspect` returns the representative's read-only inspector payload for the sheet's inherited differences.
   - Slot fields `representativeEntity`, `representativeHeld`, `next` and `depth`.
   - `notebook.removed` and `notebookChanged.change.removed`.
   - `exportSave.includeNicknames`. The Keep flow's export never sets it, so its files carry no nicknames.
8. **The tracker also runs after an accepted command**, so a paused Sample Take or Discard updates membership and extinction at once. It is still read-only.
9. **Recorded values that may be unknown.** A member's birth tick is -1 when its lineage record was compacted; such members sort first, consistent with birth order, and the UI says "born before the kept records". The extinction `cell` is -1 when the last member was not seen in the dish since the last rebuild. `cause` is 0 when the record was not kept, and the card says "its last record was not kept".
