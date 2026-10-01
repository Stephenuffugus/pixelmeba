# tools-sample — round-1 fix report (P3.5)

## Problems

1. MAJOR — import did not check where a held sample sits or whether it clashes with the world (sampleSlot.ts savedSampleProblem): FIXED.
   - New `heldPlacementProblem` in src/sim/sampleSlot.ts, run by `savedSampleProblem` when the context carries the new optional `world` block. It refuses:
     - (a) an origin off the grid; a held cell off the grid, outside the mask, on a stone or wall, or two held cells on the same cell;
     - (b, c) held food objects that fail, together with the world's own objects, the same `foodObjectsProblem` check world objects get: unique ascending ids below `nextObjectId`, one object per cell, in the dish, not on a structure;
     - (d) `sample.seq > commands.nextSeq`, and any logged command with seq >= sample.seq that is not the take itself (kind `sampleTake` at exactly that seq) or a `sampleTransfer` attempt. Without this, seq 1 would make Cancel drop earlier log entries;
     - (e) a radius outside {1, 3, 6} (`isLabRadius`), a held row whose centre lies outside the dish, and a birthId at or above `nextBirthId`.
   - Wired in src/persistence/saveFile.ts `phase3StateProblem` (shared; one additive context block passing structure, objects, nextObjectId, commands.nextSeq, counters.nextBirthId and commands.log). Messages keep the existing "The held sample cannot be loaded (…). Nothing was loaded." form.
   - Test: tests/sim/tools.test.ts "where Cancel would put it back: off-grid or walled cells, clashing objects, a stale seq, radius, birthId (fix 1)". It covers 12 refusals, including every verifier probe case, and checks that the untouched file still loads. The test fails with the check disabled (mutant run below).
   - tests/sim/world-stores.test.ts, which builds samples by hand with seq = nextSeq, still passes: the rule is seq <= nextSeq.

2. MINOR — Transfer's habitatCompatible and soft-capacity-8 destination checks were untested: FIXED (tests only).
   - "habitatCompatible: a water-only A01 is refused onto sediment, accepted one cell further". The refused move is stateHash-equal to the pre-command world with nextSeq + 1.
   - "soft capacity 8: a destination cell already near 8 refuses the arrival; one organism fewer accepts it". It asserts the computed load + incoming is > 8 in the refused case and <= 8 in the accepted case.
   - Mutant run: disabling either check in src/sim/sample.ts transferProblem, plus the placement check, fails exactly these 3 tests (3 failed, 14 passed). The originals were then restored.

3. MINOR — Cancel's saved bytes are not exact once the 500-event ring or the 10,000-entry commands.log cap is full: NOT FIXED (documented).
   - D-0037 defines exactness by the hash: "The stateHash equals the pre-begin hash, also after a save and reload in between."
   - The event ring and commands.log are not hashed (serialize.ts stateHash hashes only `commands.pending` and `nextSeq`), and they are capped observation records. The verifier's probe confirms "hash equal true".
   - Bringing back the pushed-out entries would mean carrying the evicted events and log entries in `world.sample`, which changes the saved sample format, plus a hook in events.ts emit (not mine). That is not cheap in this wave.
   - The limitation is now documented on `cancelSample` in src/sim/sample.ts.
   - PROPOSED DECISION: Cancel is stateHash-exact. When the take or a refused transfer pushes the oldest entry out of the capped, unhashed event ring (500) or commands.log (10,000), that entry is not restored.

## Files changed
- src/sim/sampleSlot.ts: `heldPlacementProblem`, the `SampleCheckContext.world` block, the `LoggedCommand` type, and `isLabRadius` for the radius.
- src/persistence/saveFile.ts (shared, additive): passes the `world` context to `savedSampleProblem`.
- src/sim/sample.ts: a doc comment on `cancelSample` only.
- tests/sim/tools.test.ts: 3 new tests.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint src/sim/sampleSlot.ts src/sim/sample.ts tests/sim/tools.test.ts src/persistence/saveFile.ts`: clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/sim/tools.test.ts tests/worker/sample-transaction.test.ts tests/sim/world-stores.test.ts tests/persistence/migration.test.ts`: 11 files, 91 tests passed.
- After a type-only lint refactor: `npx vitest run tests/sim/tools.test.ts tests/sim/world-stores.test.ts tests/worker/sample-transaction.test.ts tests/fixtures/g2-replay.test.ts`: 4 files, 45 passed.
- Mutant (placement check, habitat check and capacity check disabled): `npx vitest run tests/sim/tools.test.ts` gave 3 failed, 14 passed. The mutants were reverted.
- `E2E_PORT=4234 E2E_OUTDIR=tmp/dist-tools-sample npx playwright test tests/e2e/sample-transfer.spec.ts --project=desktop`: 2 passed (2.7 m). The port was stopped before and after.
- Fence: unchanged. No fence values moved, no content edits, no schema bump.
