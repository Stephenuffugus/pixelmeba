# Wave 8a · schema5: saves and determinism check

**Result: ok.** There are no BLOCKER or MAJOR problems. I found two MINOR problems and three NITs; none of them moves a hash or breaks any old save.

I checked the uncommitted tree as it stood on 2026-10-13. I did not edit any tracked file. My probe tests are in `tmp/verify-saves-0/schema5/`: `probe.test.ts` and its own `vitest.config.ts`.

## Problems

### MINOR [schema5] src/persistence/phase5State.ts:156 — a null `counters.nextDeviceId` is accepted

- **What is wrong:** The check reads `(s.counters).nextDeviceId ?? 1`, so a file holding `nextDeviceId: null` passes as if it held 1. Then `deserializeWorld` copies the counters over with `Object.assign` (`serialize.ts:325`), so the loaded world holds `null`.
- **What that causes:**
  - `stateHash` sees `null !== 1` and hashes the counter. The world gets a different hash from the same dish holding 1, although both have the same future.
  - When a later wave places its first structure, `nextDeviceId++` hands out id 0. `edgeStoreProblem` and `deviceStoreProblem` refuse id 0, so the game would then write a save that its own import refuses.
- **Repro** (probe P1): take a fresh FIRST_DISH_V1 save, set `state.counters.nextDeviceId = null`, recompute the checksum, then `loadSaveFile`. Result: `LOADED nextDeviceId=null hashEq=false`. The values `"1"` and `0` are refused correctly ("The structure counter is invalid. Nothing was loaded.").
- **Fix:** default to 1 only when the key is absent (`=== undefined`), not when it is null. The same `?? 1` pattern was already in `saveFile.ts:554` for `nextObjectId` before this wave; that one is a [lead] item, fixed the same way.

### MINOR [schema5] src/persistence/phase5State.ts:61 — the trap reserve is not in the ledger, but the import accepts it

- **What is wrong:** `trapReserveC` and `trapReserveN` are carbon and nutrient held in the world. The import accepts non-zero values on any TRAP species. A dish recording F03 loads through `parseSaveFile`, as the `phase5-import` test shows.
- **The ledger misses it:** `computeTotals` (`src/sim/ledger.ts` ~129–157) and `sampleTotals` count only B, N, mealC, mealN and minerals, never the reserve. So that carbon sits outside the conservation totals.
- **When it bites:** once e3-traps moves the reserve back into an organism, a dish loaded this way gains carbon the ledger never recorded ("No free biomass, ever"). The assignment leaves ledgering to e3-traps, but the import accepts the state now.
- **Repro:** I worked this out from the code and did not run it as a probe. `organismProblem` refuses trap columns only when the species lacks TRAP, and only negative values. `computeTotals` reads no trap column. So a dish recording F03 (built as `phase5-import.test.ts` builds its dish) with `trapReserveC = 5` on the F03 slot would load, and its ledger totals would not include the 5.
- **Fix:** until e3-traps lands, refuse a non-zero `trapReserveC`/`trapReserveN` the same way held sample rows with a trap are refused. Or e3-traps must add the reserve to both `computeTotals` and `sampleTotals` in the same change. Adding a +0 term keeps every older sum bit-identical.

### NIT [schema5] src/persistence/phase5State.ts:133 — odd climate shapes load and are silently dropped

`climate` with an extra key (`{ warmth: null, moisture: null, heat: 3 }`), `climate: []`, `climate: null` and `edges: null` all load as empty or ambient (probe P2: each `LOADED hashEq=true`). A re-save then drops them. This is harmless, because the stored values are not carried and the hash does not change. But it is not the strict import that edges and devices get, which refuse any unknown key.

### NIT [schema5] src/sim/serialize.ts:251 — a schema 4 state carrying `edges` has them replaced with `[]`

The 4 → 5 step sets `edges`, `devices` and the other new stores unconditionally. So a crafted schema 4 file carrying `edges` loads with `[]` instead of being refused (probe P3: `[]`). No real schema 4 save can hold these stores, so this only matters for hand-edited files.

### NIT [schema5] src/sim/sample.ts:397 — the sample's slot remap table does not include the trap columns yet

`REF_COLUMNS` does not list `trapSlot`/`trapBirthId` or `heldBySlot`/`heldByBirthId`. That is safe today, because nothing writes those columns and the import refuses held rows that hold them. But when e3-traps adds the sample closure, it must also add these pairs to `REF_COLUMNS`. Otherwise a transferred trap pair keeps slot numbers that point at the wrong organisms.

## What holds

- **VERIFIED OK — rc1 corpus continues bit-identically.** Through `loadSaveFile`, all five saves migrate 4 → 5. Each one's hash at load, hash after resume, hash after +1,000 ticks and digest at +1,000 equal `expected.json`. Each has `migratedFrom [4]`, and its input state is unchanged. Evidence: `tests/persistence/migration-schema5.test.ts` and `tests/fixtures/rc1-replay.test.ts`, both passing in my run below.
- **VERIFIED OK — awkward moments.** The rc1 held-sample save, re-saved as schema 5, reloaded and only then cancelled, gives exactly the recorded `hashAfterResume`. So does the same save after a raw serialize → deserialize. Then running 4 × 250 ticks with a save-file build → load between each quarter equals 1 × 1,000 ticks and the recorded `hashPlus1000` `7f77c7c1dbe56a75` (probe P5).
- **VERIFIED OK — non-empty schema 5 values survive save and reload, and 1× equals 4×.** I tried `glowDwell` 0.5 and a −0 `trapReserveC` on a held row, and `handlingNeed` 3 on a living organism. Each changes the hash, and each comes back bit-exact after serialize → deserialize (the −0 is kept). Cancel gives equal hashes on both copies, and `run(400)` equals four `run(100)` (probe P6).
- **VERIFIED OK — a held sample hashes exactly as v1.0 did.** `hashedSample` leaves out every schema 5 column that is empty in all held rows. If any row is non-empty, that column is hashed by name; I checked this in `world-stores-5`, and the rc1 held-sample hash at load matches.
- **VERIFIED OK — a v1.0 save keeps its recorded rules.** For all five rc1 saves, the content manifest, species, modules and settings are byte-equal after migration. After a re-save, the header still says contentVersion 2 / buildPhase 4, with the same contentHash (probe P4).
- **VERIFIED OK — the hash does not depend on how a record was built.** An edge record written with its keys in a different order, or with an `undefined` key, hashes the same (probe P7). The import enforces the order of edges (by edgeKey), devices (by cell) and gate tallies (by id), so arrays are always in their canonical order.
- **VERIFIED OK — hash-neutral while empty, and deliberately hashed once set.**
  - Each store, `nextDeviceId`, `cycleStartTick` and all 12 columns change the hash when set and give it back when cleared.
  - `gateTally` never moves the hash, and the simulation never reads it.
  - The g2 corpus (`g2-replay`) and the four trajectory-fence files pass unchanged.
- **VERIFIED OK — saves are refused properly.** Every refusal is a `SaveFileError` and ends "Nothing was loaded.". Checked: a schema 5 save whose held rows lack a schema 5 column (probe P3: "The held sample cannot be loaded (… glowState missing)."), a cycle start without a light cycle (P2), and all 33 refusals in `phase5-import`.
  - A state claiming schema 6 is refused with kind 'version' ("needs a newer version").
  - v1.0.0-rc1 refuses schema 5. From `git show v1.0.0-rc1:src/persistence/saveFile.ts`, line 280: ``fail('version', `This dish needs a newer version of Pixelmeba (save schema ${String(f.schemaVersion)}).`);``
- **VERIFIED OK — the 12-column count.** The assignment's list has 12 names, though it says "11". The 12-name list is what is implemented and what the tests pin, and `COLUMNS_ADDED_IN[4]` is the frozen 25-name literal.
- **VERIFIED OK — no randomness and no stage reads.** `barriers.ts`, `devices.ts` and `phase5State.ts` import no RNG and no stage 2–12 module; `barriers.ts` imports only constants, entities, fields types, grid and the World type. Entity slots are allocated and freed column by column, using each column's empty value (`entities.ts:295`, `:350`), so a newborn holds `trapSlot` and `heldBySlot` at −1.

## Commands run (this session)

- `npx vitest run --config tmp/verify-saves-0/schema5/vitest.config.ts --silent=false --reporter=verbose` (probes P1–P7): 7 passed (7). The P1 and P2 output above is from this run.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/persistence/migration-schema5.test.ts tests/sim/world-stores-5.test.ts tests/persistence/phase5-import.test.ts tests/sim/barriers-table.test.ts tests/persistence/migration.test.ts tests/helpers/trajectory.test.ts tests/sim/gates.test.ts tests/content/system-requirements.test.ts tests/sim/history-debris.test.ts tests/fixtures/determinism.test.ts`: **Test Files 16 passed (16), Tests 172 passed (172)**, 466.09 s.

**Note on scratch files:** `tmp/verify-saves-0/` already held an earlier verifier's files. My first probe run overwrote that verifier's `probe.test.ts`, `probe.log` and `vitest.config.ts`. Its glob also picked up the copied `head/` test tree, so I stopped that run. All of my scratch work is now in `tmp/verify-saves-0/schema5/`.
