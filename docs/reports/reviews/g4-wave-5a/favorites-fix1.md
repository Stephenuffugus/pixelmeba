# P4.1 favorites — fix round 1 (2026-10-11)

## Per problem

1. **MAJOR: Undo/rollback keep a notebook that no longer matches the restored dish** (verifier (a) undo-extinct, (b) undo-intro, and the saves verifier's Discard→Undo probe A). **FIXED.**
   - New `reconcileFavorites(world, record)` in src/worker/favorites.ts. It is called through `notebookAfterRestore` in src/worker/notebookWatch.ts, the single place stage 2 extends.
   - DishHost calls it via `restoreNotebook(d)` right after the world swap in the `undo` case and at the end of `rollback()`. The watch is then rebound, and an unsolicited `notebookChanged { kind: 'favoritesRestored', removed, unpinnedRemoved? }` is posted.
   - What it does against the restored world:
     - A favorite whose root birth id is ≥ `counters.nextBirthId` is removed and named. This is the Add Life case: the id will be reused, so the new organism is never treated as that family.
     - Member, representative and last-member ids from after the restore point are dropped. A dropped representative becomes the first living member by birth tick, then id.
     - A family recorded as extinct whose members are back (living or held in the sample) has its extinction cleared. It is followed again if a place is free, else unpinned.
     - An extinction recorded after the restored time with no members present is withdrawn.
     - A followed family with no members present is unpinned.
     - The 20-unpinned limit is applied afterwards.
   - `cancelHeldSample` now also runs the watch's read-only `afterTick`, so members back from the sample are in place again at once.
   - UI (src/ui/favorites.ts): on `favoritesRestored`, the record updates, an extinction card whose family is back closes, and removed families are named in a toast.
   - Tests in tests/worker/favorites-host.test.ts, "fix round 1: Undo and rollback…": Discard→Undo→Cancel→save→load; starve-to-extinction→Undo; Add Life→Follow→Undo→reused birth id. Run against the old behaviour (restoreNotebook patched to only rebind), all 3 failed. All 3 pass now. tests/ui/favorites.test.ts covers the UI side.

2. **MAJOR: the "notebook dropped" message never reaches the player.** **FIXED.**
   - src/ui/favorites.ts keeps a dropped message for a dish that is not open yet (`pendingDropped`) and shows it when that dish opens (`followOpenDish`).
   - For 9 s after that, any toast that would replace it (the "Opened …" or "Imported …" toast) carries the message too (`keepDroppedInToast` effect).
   - Notebook → Favorites also shows the message for that dish (`notebookDroppedFor`, data-testid `favorites-dropped`).
   - Tests: tests/ui/favorites.test.ts "a dropped notebook's message waits for its dish to open…". New e2e journey "a dish file whose notebook is damaged opens, and says the notebook was left out" (toast plus Favorites tab plus axe).

3. **MINOR: after Unpin the Family sheet says "Living members: 0".** **FIXED.**
   - An unpinned family now shows "Living members are counted while the family is followed. Pin again to count them."
   - An extinct family shows 0. A followed family shows the live count.

4. **MINOR (PLAUSIBLE): Follow next → Find runs before the new snapshot.** **FIXED.**
   - `findFavoriteAfterChange(id)` defers the Find to the first snapshot after the change. FavoriteSheet uses it only when the op was not refused.
   - Test: tests/ui/favorites.test.ts "Find after Follow next runs on the snapshot sent after the change".

5. **MINOR: only the first Follow next candidate is offered.** **FIXED.**
   - `FavoriteSlotMark.candidates` (additive) carries the first `FAVORITE_CANDIDATES_SHOWN` = 6 candidates `[birthId, birthTick, speciesIdx]`, in birth tick then id order.
   - FavoriteSheet lists the others under "Or choose another surviving member, by birth time, then ID:" as ≥ 48 px buttons.
   - The existing host test now pins `candidates: []` while the representative is alive.

6. **MINOR: favoriteOf misses members beyond the 200 highlighted.** **FIXED.**
   - `FavoriteMarks.member` (additive, transferred with the marks) is a per-entity membership bit for every member.
   - favoriteOf reads it and no longer falls back to the stale record for an organism the snapshot carries.
   - Tests: the cap test now checks that all 250 members carry the bit, and a UI test checks favoriteOf for a non-highlighted later-born member.

7. **MINOR: `k in KIND_PROBLEMS` accepts prototype keys, and `favorites: null` is accepted.** **FIXED.**
   - The check now uses `Object.prototype.hasOwnProperty.call`.
   - Only an absent kind reads as [].
   - Tests: tests/persistence/notebook.test.ts malformed cases `constructor`, `toString`, `hasOwnProperty`, `favorites: null`. Each is dropped with the message and the world hash is unchanged.

8. **MINOR: favorite references are not checked against the world.** **FIXED.**
   - `notebookProblem` / `readNotebook` take optional `NotebookWorldRefs { speciesIds, nextBirthId, tick }`, plain values, so notebook.ts still imports nothing from src/sim/world.
   - `loadSaveFile` passes them.
   - An unknown species, a birth id ≥ nextBirthId (root, representative, member or last member), or an extinction after world.tick is a problem.
   - `createdTick` is deliberately not checked: after Undo a Follow made later in dish time is still a true player action.
   - The new reconcile (problem 1) keeps every record the host writes valid under these checks.
   - Tests: four new malformed cases.

9. **MINOR: the keep flow's "Export it as a file" loses nicknames.** **FIXED.**
   - In src/ui/state.ts (shared; a default-parameter change only), `exportDishFile(dishId, includeNicknames = true)` and `exportContinueFile(includeNicknames = true)`.
   - The D-0033 keep flow and the What-if keep flow (WhatIfState.tsx) export the player's own copy with nicknames. More → Export keeps its checkbox, off by default.
   - PROPOSED DECISION: a kept file (the keep flow's export, used when all slots are full) is a local keep like a named slot, so it keeps family nicknames. Only More → Export, the sharing path, leaves them out unless "Include family nicknames" is checked.
   - Not covered by a new automated test. A keep-flow e2e would need all ten slots filled.

## Files changed (this round)

src/worker/favorites.ts, src/worker/notebookWatch.ts, src/worker/host.ts (restoreNotebook, plus hooks in undo, rollback and cancelHeldSample, and the member buffer transfer), src/worker/protocol.ts (`FavoriteMarks.member`, `FavoriteSlotMark.candidates`, `NotebookChange` 'favoritesRestored'), src/persistence/notebook.ts, src/persistence/saveFile.ts (one line in loadSaveFile), src/ui/favorites.ts, src/ui/strings/favorites.ts, src/ui/panels/FavoriteSheet.tsx, src/ui/views/NotebookFavorites.tsx, src/ui/state.ts (two default parameters), src/ui/styles.css (`.fav-candidates` block), tests/ui/favorites.test.ts, tests/worker/favorites-host.test.ts, tests/persistence/notebook.test.ts, tests/e2e/favorites.spec.ts.

Prettier was run on my own files only (notebook.ts, favorites.ts, notebookWatch.ts, ui/favorites.ts, strings/favorites.ts, FavoriteSheet.tsx, NotebookFavorites.tsx and the three unit-test files). It was not run on host.ts, protocol.ts, state.ts or saveFile.ts; those already fail prettier --check before this round.

## Commands and results

- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint` on every file above: clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/ui/favorites.test.ts tests/persistence/notebook.test.ts tests/worker/favorites-host.test.ts tests/persistence/persistence.test.ts tests/persistence/strip-names.test.ts tests/persistence/migration.test.ts`: 13 files, 114 tests passed.
- Old-behaviour check: the new host tests, with `DishHost.prototype.restoreNotebook` patched to only rebind, gave 3 failed (expected).
- `E2E_PORT=4271 E2E_OUTDIR=tmp/dist-favorites npx playwright test tests/e2e/favorites.spec.ts --project=desktop --project=phone-portrait`: 4 passed (4.6 min).
  - An earlier run under heavy machine load had two desktop failures: the main journey hit its 240 s timeout during an axe scan, and the toast check missed the 9 s toast. The damaged-notebook test then passed alone, and the full re-run passed all 4.
  - The toast check depends on timing under load. The Favorites-tab check of the same message does not.
- No fence value changed. No sim rule was added. No schema or protocol version was bumped (all protocol changes are additive optional fields or members).
