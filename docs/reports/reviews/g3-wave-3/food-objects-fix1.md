# food-objects — round-1 fix report (P3.6 part 3)

## Problems

1. MAJOR (reported twice: wave-verify and saves-verify), objects.ts `foodObjectProblem` / `objectReleasePlan`: the import accepted pools that do not belong to the object's kind (a pellet holding starch, a wafer holding sugar). Release reads only the kind's own pools, so the object counted as empty and left the store with that carbon still inside, which broke the ledger.
   **FIXED.** `foodObjectProblem` (src/sim/objects.ts) now refuses any pool key that is not in `FOOD_OBJECT_RULES[kind].pools`, with the message `a <kind> cannot hold <pool>`. Three paths use this one check, so all three now refuse such an object:
   - `createObject`, which returns `{ ok: false, reason: 'invalid' }`;
   - the save import (`foodObjectsProblem` → `The dish's food objects cannot be loaded (a food object is invalid (a pellet cannot hold starch)).`), which builds nothing;
   - a held sample's objects (`savedSampleProblem`).
   I took the verifier's first suggested fix and refuse such pools rather than releasing them. CT §5.2 gives each kind fixed pools (pellet: sugar; wafer: starch + protein), so a record holding any other pool is corrupt.
   Tests (tests/fixtures/food-objects.test.ts, "an object holds only its kind's pools"): four cases, `pellet {sugar 0.004, starch 0.5}` (the verifier's repro), `pellet {starch 1}`, `wafer {starch, protein, sugar}` and `wafer {sugar 1}`. Each one checks that `createObject` refuses and changes nothing, that `foodObjectProblem` returns the exact message, and that an edited `.pixelmeba` file with a recomputed checksum is refused by `parseSaveFile` with that message, while `loadSaveFile` ends "Nothing was loaded". A fifth test checks that an object holding only its own pools still loads and empties with the ledger closed.

2. MINOR, conversion.ts:42: nothing tested that release runs in stage 3 before the enzymes.
   **FIXED** with a test only; the code was already correct. The new test "release runs in stage 3 before enzymes: a wafer's first starch is catalysed in the tick it is released" puts a wafer on a cell with eStarch activity 1 and steps once. After stage 3, `conversionTally.starch` must equal the wafer's first release (0.0012 C) and the cell's starch must be 0. If release ran after the enzyme loop, nothing would be catalysed that tick.

**Non-vacuity, checked by mutation this session.** I backed up both source files, then made two changes:
- dropped the new pool check;
- moved `releaseFoodObjects(world)` after the enzyme loop.

All 5 new refusal and ordering tests failed: `-t "before enzymes|cannot|only its kind"` gave 5 failed, 1 passed. I then restored both files byte-for-byte from the backups and confirmed with `diff`.

## A fixture outside my files

tests/sim/tools.test.ts (tools-sample owns it) built its `busyDish` with `placeObject(..., 'pellet', { starch: 0.5 }, 0.05)`. That is exactly the invalid object from problem 1, and the stricter check made 9 of its tests throw `placeObject: refused (invalid)`. I made a one-token correction to `{ sugar: 0.5 }`. No assertion in that file depends on the object's pool being starch; it now passes 36/36 together with sample-transaction, migration and render/phase3. The lead should know about this edit when committing.

## Files changed
- src/sim/objects.ts: the pool check in `foodObjectProblem` and its doc comment.
- tests/fixtures/food-objects.test.ts: 6 new tests and their imports.
- tests/sim/tools.test.ts: the one-token fixture correction (outside my files; see above).

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint src/sim/objects.ts src/sim/conversion.ts tests/fixtures/food-objects.test.ts tests/sim/tools.test.ts`: exit 0.
- `npx vitest run tests/fixtures/food-objects.test.ts`: 22/22 passed (16 old, 6 new).
- Mutation run, both changes: the 5 targeted tests failed as intended, and the source was restored.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/sim/world-stores.test.ts tests/worker/protocol.test.ts`: 9 files, 82/82 passed. The fence is unchanged.
- `npx vitest run tests/sim/tools.test.ts tests/worker/sample-transaction.test.ts tests/persistence/migration.test.ts tests/render/phase3.test.ts`: before the fixture correction 9 tools tests failed; after it, 4 files, 36/36 passed.
- `E2E_PORT=4233 E2E_OUTDIR=tmp/dist-food-objects npx playwright test tests/e2e/food-objects.spec.ts --project=desktop`: 1 passed in 1.7 min, including the axe check. Port 4233 was stopped before and after the run.

No fence change, no manifest change, no schema change.
