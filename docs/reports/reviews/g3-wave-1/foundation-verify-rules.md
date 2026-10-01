# Phase 3 wave 1 — foundation verify (lens: rules, determinism, conservation, tests)

Verdict: **ok = true**. There are no BLOCKER or MAJOR findings and 4 MINOR findings. Every Build and "Done when" item holds against the code, the canonical docs and test runs made in this session. Nothing in the repository was edited except this report. The scratch work is in tmp/verify-foundation-rules/, which git ignores.

## Problems (most severe first)

### MINOR 1 — The import does not check held sample rows for negative pools or identity collisions
- Where: src/sim/sampleSlot.ts:427–444 (`savedSampleProblem`).
- What it checks: a held row must be finite, alive, of a known species, with genomes that are known and carried.
- What it does not check:
  - that B, N, E, H, mealC, mealN, boundMineral and jacketMineral are not negative;
  - that `lifeState` is valid;
  - that the row's `slot` and `birthId` do not collide with a living organism or with another held row.
- The rule: SPEC §14.3 says "Import checks … finite values, nonnegative pools, reference integrity …"
- Repro: tmp/verify-foundation-rules/sample-import.test.ts.
  - It builds a save whose held row has B = −5 and also reuses a living organism's slot and birthId, then recomputes the checksum.
  - Result: `loadSaveFile` loads it (`{"loaded":true}`). computeTotals then counts a negative carbon pool through `sampleTotals`.
- Impact now: low, because nothing in the game creates a sample before wave 3. The assignment's list only asked for "unknown species or genome".
- For wave 3 (P3.5 Cancel restores rows into their original slots):
  - reuse the world-entity checks in saveFile.ts:331–345 (non-negative pools, life state, birthId uniqueness);
  - refuse a held row whose slot is alive in the world, or whose birthId is held by a living organism.

### MINOR 2 — The system requirements cover Phase 3 content only
- Where: src/sim/content/registry.ts:476–494.
- Materials get their system automatically from `FIELD_DEFS[target].system`, but species and modules use fixed lists.
- Later content would validate without its system:
  - species abilities SHELL (A02, P05 → silicate), SIGNAL_GLOW (B09 → signals) and RIVALRY (B13 → rivalry);
  - modules E02 (→ signals), E11 (→ silicate) and E17 (→ foodObjects, per CT §14 "finite food objects 128 (caches included)").
- The assignment enumerated only the Phase 3 mapping, so this is not a wave 1 defect. The Phase 5 and Phase 7 builders must extend `speciesSystemNeeds` and `MODULE_SYSTEM_NEEDS`.

### MINOR 3 — The sample's digest mapping drops each held row's original slot
- Where: tests/helpers/trajectory.ts, `canonSample`.
- Rows are keyed by birthId, and `r.slot` is not hashed.
- Cancel (D-0037) puts a row back exactly in that slot, and the g2 part of the digest treats the slot as significant (`h.number(i)` per living organism).
- So two held samples that differ only in their original slots give the same 'full' digest. stateHash still tells them apart, through `encodeSample` → `rows.slots`.
- This follows the assignment's "slots → birthIds". Wave 3 may want to hash `slot` too.

### MINOR 4 — The 1 → 4 test keeps `counters.nextObjectId`
- Where: tests/persistence/migration.test.ts:31–38.
- `asSchema1` removes `objects` and `sample` but leaves `counters.nextObjectId` in the schema 1 state, so this path never loads a counters record that lacks it.
- The 3 → 4 path covers the missing key: a real g2 save has no `nextObjectId`, and the round trip and hashAtLoad checks pass. Coverage is therefore complete overall, but the 1 → 4 fixture is not a faithful schema 1 file.

## VERIFIED OK

### Fixtures, tests and checks I ran myself
- **Required fixtures:** `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence.test.ts tests/fixtures/conservation-closed-lid.test.ts` → `Test Files 3 passed (3) · Tests 19 passed (19)` (200 s).
- **Rest of the fence** (D-0042 names four files): `tests/fixtures/trajectory-fence-{arms,current,current-arms}.test.ts` → `3 passed · 22 passed`.
- **The builder's tests and the full unit regression list:**
  - Files: links, world-stores, system-requirements, history-debris, tests/persistence/, registry-imports, predation, deterministic-state, movement-births-tick, rng-hash, trajectory.test, registry.test, make-g2-saves, validator, host.test.
  - Result: `Test Files 18 passed (18) · Tests 132 passed (132)` (232 s).
- **Typecheck and lint:** `npx tsc -p tsconfig.json --noEmit` → exit 0. `npx eslint` on all 21 files the builder created or touched → exit 0.
- **e2e spot check:** `E2E_PORT=4216 E2E_OUTDIR=tmp/dist-verify-foundation-rules npx playwright test tests/e2e/save-reload.spec.ts --project=desktop` → `3 passed (1.8m)`. Port 4216 was free before and after. I did not re-run phone-portrait or phone-landscape.

### The fence is live
- I reproduced it independently (tmp/verify-foundation-rules/probe.test.ts): first-dish-t3000, `E[1] += 1e-9`, then 1,000 ticks.
- Result: atLoad `b06671068ec74638` (expected `c7435142acec100f`), digest `5f45f96f8dcd81db` (expected `5730917ce3ec53f6`), plus1000 `b9d4ff53ce246471` (expected `69102ffe9ccaa0c3`).
- These are exactly the values the builder reported, so the evidence is honest.

### Mutants (load-time `vi.mock` copies of the builder's tests under tmp/; no tracked file edited)
- `removeAllLinks` as a no-op: the killEntity test fails (`expected 1 to be -1`), and so does the consumePrey test (`expected +0 to be -1`).
- `rekeyLinks` as a no-op: the division test fails (`expected 1 to be 4`).
- `sampleTotals` returning zeros: the sample ledger tests and the round-trip ledger check fail (3 tests).
- So these tests are not vacuous.

### Links under real simulation
- I loaded g2 first-dish-t3000 (427 alive), added 426 fungal links plus adhesion links, and ran 600 ticks one at a time.
- `linkProblem` was null after every tick, through 240 birthIds (120 divisions) and the deaths in those ticks. 388 organisms were still linked at the end.
- Run 300 ticks, save and reload, then run 300 more: the result hashes the same as 600 straight ticks. The ledger is ok, and a serialize round trip gives the same hash.

### (1) Schema 4
- `SCHEMA_VERSION = 4`, and the header comment carries the line the assignment asked for (world.ts:28–33).
- The columns are appended after `dryTimer` with the specified types (entities.ts:93–132): filmSeconds f64, anchorState u8, anchorSeconds/anchorLockout f64, adhPartner u32, adhSeconds/adhLockout f64, waterCrossed u8, noUsableIntakeSeconds f64, fLink0..3 i32, fLinkB0..3 u32, fLinkKind0..3 u8, aLink0..1 i32, aLinkB0..1 u32.
- The link-slot columns are in NEG_ONE_DEFAULT, and `emptyValueOf` is exported.
- The `noUsableIntakeSeconds` comment says wave 4 writes it and wave 1 never does; `git grep` finds no writer.
- No FLAG bit was added; 1 << 12 and 1 << 13 are reserved in a comment.
- history-debris.test.ts: line 97 is `toBe(4)`, lines 110/142/183 are `toBe(SCHEMA_VERSION)`, and the literals at 168/176 are unchanged and pass.

### links.ts follows the specified rules
- The 5th fungal and 3rd adhesion link are refused.
- A reference counts only through `refValid` (alive and birthId match).
- Component walks are breadth-first in ascending slot order, with members sorted.
- `linkProblem` checks symmetry, liveness, birthId, kind and duplicates.

### (2) Hash-neutral stores
- `stateHash` skips a column from `filmSeconds` on only while every slot in [0, highWater) holds its empty value (Object.is, so −0 counts as state).
- `objects`, `sample` and `nextObjectId` are hashed only when non-empty or moved from their start value (serialize.ts:256–282).
- `ledger.energy` (including the new `construction` category) and the breakdown are not hashed.
- The g2 hashAtLoad and hashPlus1000 values and the two literals hold. world-stores tests that non-empty state does change the hash.

### Ledger
- computeTotals adds objects (C, N) and sample (C, N, M) under the breakdown keys objectsC, objectsN, sampleC, sampleN and sampleM.
- `sampleTotals` uses the same per-field material and carbonPerUnit rules as computeTotals.
- Moves balance, and deletion without an export breaks the ledger (tested, and confirmed by mutant).

### Determinism
- No `Math.random`, `Date` or Map/Set iteration was added in src/sim. The NEG_ONE_DEFAULT Set is used for lookups only.
- Object keys are sorted wherever they reach a sum or the hash.
- No RNG streams were added or reused, and the float order of existing totals is unchanged (only zeros are added).

### (3) Migration
- `COLUMNS_ADDED_IN[4]` lists every column from `filmSeconds` on.
- The fill uses `emptyValueOf`, so link-slot columns get −1.
- The `v === 4` step comes after `v === 3`. It adds `objects: []` and `sample: null` by copy, and the tests check the input is untouched.
- Three paths go through `loadSaveFile`: 3 → 4 (hashAtLoad), 2 → 4 and 1 → 4 (equal hash at load and after +500 ticks). Each records `migratedFrom`, has every link-slot column at −1, passes `linksValid` and survives a re-save.

### Import refusals
- `phase3StateProblem` (saveFile.ts:401–424) refuses each case in (3) with a message ending "Nothing was loaded.". It runs inside `parseSaveFile`, before `deserializeWorld`.
- Each case is tested by its message.

### (4) World gates
- `git grep FILM_DIGESTION_IMPLEMENTED -- src tests tools` finds nothing.
- snapshot.ts:321 reads `worldHasSystem(world, 'film')` together with `world.fields.film !== undefined`.
- The remaining `IMPLEMENTED_*` uses are validation lists.
- species.ts still filters film out of food lists (D-0038).

### (5) Registry
- The species, material and module requirements match the assignment. Each error names both sides, for example `enabled species "B02" uses BIOFILM, which needs the "film" system`.
- digestsFilm never requires film.
- The `validateContent(raw, opts)` signature is unchanged.
- The shipped manifest validates, with B04 and without film.

### (6) Trajectory registrations
- `POST_G2_STORE_CANON.sample` is registered.
- The new columns hold no species, genome or module index, so `POST_G2_COLUMN_KINDS` correctly stays empty.
- g2-replay's 'g2' digest raises no PostG2StateError.

### Ownership and additivity
- The shared edits are additive:
  - one import plus one `removeAllLinks` call in each of maintenance.ts:154 and contacts.ts:140;
  - `rekeyLinks` immediately after `c.birthId[i] = b0` in births.ts:280;
  - the system block in registry.ts;
  - the digestsFilm line in snapshot.ts;
  - helpers only in tests/helpers/world.ts;
  - only the canon entry in trajectory.ts.
- The `FILM_DIGESTION_IMPLEMENTED` removal in implemented.ts was allowed.
- The builder did not touch the manifest or any version field (the chemistry and material additions in the manifest belong to the environment builder), and did not create gates.ts.

### Rulings match the docs
- SPEC §6.8 "remove incident links/bonds" holds on both death paths.
- SPEC §2.5 / CT §14 cap finite food objects at 128.
- SPEC §5.1 pellet and wafer pools fit the `{sugar?, starch?, protein?}` + n shape.
- ARCH §5 allows links as 6000×4 and adhesion as 6000×2. Storing them as columns, plus birthIds, is consistent with it.
- SPEC §9.19 "Colony links removed" at division is deferred to wave 4 as the assignment planned. No adhesion links can exist before then.

### Proposed decisions
- Links as columns, and `emptyValueOf` as the single source of a column's empty value, are sound and consistent with D-0035.
