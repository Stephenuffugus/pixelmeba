# Integration report: docs-a11y-6a (Phase 4 wave 6a)

## Items

1. **DONE: docs/ARCHITECTURE.md §7 (worker protocol)**, the block "As built, Phase 4 wave 6a" at docs/ARCHITECTURE.md:233.
   - It is in the style of the wave 5a/5b blocks and was written from src/worker/protocol.ts, host.ts, client.ts and tryDish.ts.
   - Share messages:
     - `recipeExport` is answered by `recipeExported` (text, filename, name, question, identity, versions) or by `error` (request 'recipeExport', kind 'no-start').
     - `recipeImport` is answered by `loaded`, `keepRefused` or `error` (with the RecipeFileError kind).
     - `recipeIdStart` is answered by `ready`, `keepRefused` or `error` (readable text, no kind).
     - The Living dish is the unchanged `exportDish`, sent while the Share sheet holds the dish paused. `strip` also applies `withoutTurnNotes`.
   - Try my dish messages:
     - Requests: `trySetup`, `tryStart`, `tryNext` and `tryFinish`.
     - Answers and notices: `trySetup`, `tryStarted`, `tryRefused` (the six TryRefusalCodes), `tryTurn` and `tryHorizon`, plus `DishInfo.turn`.
     - It also covers the refusal order (keep before the shelf write) and the horizon hold in `setSpeed` and `step`.
   - Observation messages: `relationshipMap`, `probeSet` and `probeRead`, answered by `relationshipMap` and `probes` (with `refused?`).
   - PROTOCOL_VERSION stays 2 (protocol.ts:28).
   - §11.2 (save format) has its own "As built, Phase 4 wave 6a" block at docs/ARCHITECTURE.md:448:
     - **The shelf:** ids 'shelf-<kind>-<seq>-<writer>' with an 8-digit sequence and a per-page writer token. Kinds are baseline and snapshot, with limits of 10 and 20 per device. The preflight needs room for 2× the record. There is one atomic commit and no overwrite. `get` verifies the record. Shelf records are hidden from `SaveStore.list`, `slot` and `freeSlot`; `SaveStore.remove`/deleteSlot refuses them with SHELF_REMOVE_REFUSED; `loadSlot` opens them as a branch.
     - **The 'turns' notebook kind:** the full field list, its checks and `withoutTurnNotes`.
     - **The 'pixelmeba-recipe' file:** version 1, its fields, the checksum, `initialStateHash`, the export refusals, and the import checks with the strict build match.
   - Proof: none applies (documentation). I checked each statement against the code read in this session: protocol.ts, host.ts (lines 508–660, 966–990, 1195–1225, 2410–2575), shelf.ts, store.ts, notebookTurns.ts, notebook.ts, recipeFile.ts, recipeId.ts, tryDish.ts and probes.ts.

2. **DONE: tests/e2e/a11y-screens.spec.ts**, a new test at tests/e2e/a11y-screens.spec.ts:488. It also imports `chooseSpeed` (line 20).
   - It scans ten screens:
     - the Share sheet three times, once with each choice selected (Picture, Starting recipe, Living dish);
     - the Lab relationship map, after 20 s at 4×, with the Sprinter "eats sugar" row present;
     - the region drawing session with one region, and the probe panel with one region;
     - the Try my dish setup sheet;
     - the Try my dish horizon card, reached with the shortest turn (60 s) at 4×;
     - Import recipe ID on Play, with its refusal line showing;
     - Import recipe ID in Saved dishes.
   - Results:
     - desktop: 1 passed (5.3 min);
     - phone-portrait: 1 passed (3.2 min);
     - axe found no serious or critical issues on any of the ten screens.
   - How I showed it fails without the screens being scanned correctly (a load-time mutant):
     - I made a scratch copy `tests/e2e/zz-mutant-docs-a11y-6a.spec.ts`. Its init script uses a MutationObserver to prepend an `<img>` with no alt text to each wave 6a panel root: share-sheet, relmap-sheet, probe-session, probe-sheet, try-setup, try-horizon and recipe-id-import.
     - On desktop it gave 1 failed. `a.done` listed exactly 10 image-alt findings, one for each new screen name.
     - I then deleted the mutant copy. `cmp tests/e2e/a11y-screens.spec.ts tmp/docs-a11y-6a/a11y-screens.orig.ts` found the two files identical.

## Files changed
- docs/ARCHITECTURE.md (§7 and §11.2 only; +135 lines)
- tests/e2e/a11y-screens.spec.ts (+133 lines)
- docs/reports/reviews/g4-wave-6a/integrate-docs-a11y-6a.md (this report)

## Commands
| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | exit 0 (clean) |
| `npx eslint tests/e2e/a11y-screens.spec.ts` | exit 0 (clean) |
| `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence` | Test Files 5 passed (5); Tests 51 passed (51) |
| `E2E_PORT=4281 E2E_OUTDIR=tmp/dist-docs-a11y-6a npx playwright test tests/e2e/a11y-screens.spec.ts -g "wave 6a" --project=desktop` | 1 passed (5.7 min) |
| same command with `--project=phone-portrait` | 1 passed (3.5 min) |
| mutant: `… npx playwright test tests/e2e/zz-mutant-docs-a11y-6a.spec.ts -g "wave 6a" --project=desktop` | 1 failed: 10 image-alt findings, one per new screen (expected) |

Port 4281 was stopped before and after every Playwright run (`lsof -t -i :4281 | xargs -r kill`).

## Notes
- From the code: recipe-file import does not compare `versions.contentHash` field by field. A content change is still refused, because the realized start's stateHash covers the contentHash (serialize.ts:248) and must equal `initialStateHash`. D-0083 says the same, and §11.2 documents it that way.
- tests/e2e/share.spec.ts changed on disk during this run, by another agent. I did not touch it.
