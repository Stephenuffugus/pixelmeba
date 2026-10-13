# Wave 8a · schema5 (Phase 5 foundation) build report

Builder: schema5 (g5-plan lead call 2; D-0102, D-0103, D-0106). The lead commits. I ran no git write commands, did not touch src/worker/**, src/sim/constants.ts, src/sim/transport.ts, content/**, art/**, tools/** or tests/fixtures/**, and did not run fence-update.

## Summary

- World SCHEMA_VERSION is now 5, bumped once.
- COLUMNS_ADDED_IN[4] is frozen as a literal list.
- 12 hash-neutral entity columns are added, plus FLAG.restNewborn (bit 14).
- New stores: edges, devices, climate {warmth, moisture}, and gateTally (saved but never hashed). There is a new counter, nextDeviceId, and a new setting, settings.cycleStartTick.
- Migration 4 → 5 works by copy. It also extends a held sample's rows.
- stateHash stays neutral while the new state is empty, including for a held sample.
- New pure modules: barriers.ts and devices.ts. New import checks: phase5State.ts.
- The registry gains the system needs from D-0043, the gates gain worldHasStructure, and the trajectory helper registers the new state.

FENCE: unchanged. g2-replay, rc1-replay and all four trajectory-fence files pass, and no value moved.

## Checklist

### Build

1. **DONE: COLUMNS_ADDED_IN[4] is frozen.** src/sim/serialize.ts:173 holds the literal list of 25 names, `filmSeconds` … `aLinkB1`. tests/persistence/migration.test.ts pins it both as a literal and as `ENTITY_COLUMNS.slice(FIRST_HASH_NEUTRAL_COLUMN, FIRST_SCHEMA5_COLUMN)`.

2. **DONE: entity columns.** src/sim/entities.ts:139 and on, under the comment block "Phase 5 foundation (world schema 5; D-0102)".
   - The columns are glowState u8, glowDwell f64, metabolicMode u8, trapReserveC f64, trapReserveN f64, trapSlot i32 (−1), trapBirthId u32, trapTimer f64, trapCooldown f64, heldBySlot i32 (−1), heldByBirthId u32 and handlingNeed f64.
   - NEG_ONE_DEFAULT gains trapSlot and heldBySlot (entities.ts:199).
   - FIRST_SCHEMA5_COLUMN is exported (entities.ts:219).
   - FLAG.restNewborn = 1 << 14 (entities.ts:263). Bit 12 stays unused, with a comment saying "never reuse it".
   - **Count note:** the assignment says "11 names" but lists 12, and so does the brief. COLUMNS_ADDED_IN[5] has all 12. Every test pins the 12-name literal.

3. **DONE: stores and types.**
   - src/sim/barriers.ts defines EdgeKind, EdgeDir, EdgeBarrier, edgeKey and edgeNeighbour.
   - src/sim/devices.ts defines DEVICE_KINDS, FURNISHING_KINDS, MACHINE_KINDS, TOGGLED_KINDS, RESIN_TARGETS, RESIN_CAPACITY = 5, Device and sortDevices.
   - src/sim/world.ts:
     - SCHEMA_VERSION = 5 (line 43), with the doc comment extended.
     - `WorldSettings.cycleStartTick?` (line 61).
     - `Counters.nextDeviceId` (line 110).
     - The `Climate` and `GateTally` interfaces (line 128).
     - World gains edges, devices, climate and gateTally (line 197).
     - createEmptyWorld initializes them, with nextDeviceId 1.

4. **DONE: serialize.ts.**
   - WorldState gains the optional stores. serializeWorld always writes them as deep copies, and the climate arrays go through encodeArray (line 158).
   - deserializeWorld makes deep copies. It decodes each climate payload into a new Float64Array(CELL_COUNT) and throws "climate warmth has wrong length" for a payload of the wrong length (decodeClimate, line 285).
   - The `v === 5` migration step (line 251) sets edges [], devices [], climate nulls, gateTally [] and nextDeviceId 1. When a sample is held, sampleWithColumns (line 272) adds every COLUMNS_ADDED_IN[5] column to `sample.rows.columns` at its empty value, by copy.
   - The migrateWorldState doc comment is updated.
   - stateHash, after the schema 4 lines (line 390), hashes edges, devices, climate.warmth, climate.moisture and nextDeviceId, each only while it is non-empty, non-null or not 1. gateTally is never hashed.
   - The sample term hashes `hashedSample(world.sample)` (exported, line 404). That is encodeSample minus every schema 5 column that is empty in all held rows.
   - The rc1 replay test does not pin a re-saved schemaVersion, so there is no FENCE note.

5. **DONE: barriers.ts and devices.ts pure tables.**
   - The tables: TransportClass, edge codes 0–5, edgeCodeOf, edgeFactor (line 91), edgePermits (line 105), classOf rules (a)–(f) (line 123), edgeCodeArrays and edgeCodeBetween (lines 151 and 159, symmetric, throw for cells that are not 4-adjacent), sortEdges, and edgeStoreProblem (line 184) with every refusal in the assignment.
   - deviceStoreProblem is at devices.ts:56.
   - Neither module imports anything from stages 2–12, and neither draws randomness. barriers.ts imports constants, entities, grid and types. devices.ts imports constants, grid and barriers' `cellInDish`.

6. **DONE: import.**
   - src/persistence/phase5State.ts:120 exports `phase5StateProblem(s, cols, hw, { species, genomes, modules, systems, enabledStructures })`.
   - parseSaveFile calls it right after phase3StateProblem (saveFile.ts:436), with `fail('integrity', \`${problem} Nothing was loaded.\`)`. That is one hook, plus its import line. The order of the existing checks is unchanged.
   - Every refusal in Build 6 is implemented. Three are additions I made to stay consistent with the rest:
     - glowDwell ≠ 0 on an organism without the glow ability is refused.
     - A trapBirthId or heldByBirthId without its slot is refused.
     - A sample-row sentence is prefixed "The held sample cannot be loaded."

7. **DONE: gates and registry.**
   - `worldHasStructure` is at gates.ts:33.
   - In registry.ts, speciesSystemNeeds adds SIGNAL_GLOW → signals, RIVALRY → rivalry and SHELL → silicate (line 539). A comment says V02's film gate needs no entry.
   - MODULE_SYSTEM_NEEDS adds E02 → signals and E11 → silicate (line 520).

8. **DONE: tests/helpers/trajectory.ts.**
   - POST_G2_DERIVED_KEYS gains 'gateTally', and its doc now reads "observation-only stores".
   - SAMPLE_SLOT_COLUMNS gains trapSlot and heldBySlot.
   - canonSample skips a schema 5 column for a row while that row holds the empty value (lines 225 and 236).
   - Comments explain why POST_G2_COLUMN_KINDS and POST_G2_SETTINGS_DEFAULTS get nothing.
   - The fresh-world comparison covers edges, devices, climate and nextDeviceId. trajectory.test.ts proves that mode 'g2' throws for each of them.

9. **DONE: protocol.** No protocol change; PROTOCOL_VERSION stays 2.

### Done when

- **DONE: migration.test.ts re-pinned.**
  - "world schema is 5; COLUMNS_ADDED_IN[4] is the frozen literal; COLUMNS_ADDED_IN[5] is exactly the Phase 5 columns."
  - The 3 → 5, 2 → 5 and 1 → 5 paths now also check that every schema 5 column is empty, that edges, devices and gateTally are [], that climate is null, that nextDeviceId is 1 and that cycleStartTick is absent. migratedFrom stays [3], [2] and [1].
  - asSchema1 drops the schema 5 stores and nextDeviceId.
  - tests/worker/keep-dish.test.ts's asSchema1 needed no change: the v === 5 step overwrites the stores, and the file passes unchanged.

- **DONE: migration-schema5.test.ts.** Every rc1 file goes through loadSaveFile and measureRc1Save:
  - hashAtLoad, hashAfterResume, hashPlus1000 and digestPlus1000 all equal expected.json;
  - migratedFrom is [4], the input is untouched, and every schema 5 column and store is empty.
  - For the held sample: decodeSample of the raw v1.0 sample throws "sample column glowState missing", while the migrated rows carry 12 empty columns, decode, and hash as the rc1 corpus records.
  - A re-save is schema 5 with all four stores. It reloads to an equal hash, which is also the corpus hashAtLoad, and keeps migratedFrom [4].
  - A fresh FIRST_DISH_V1 save is schema 5. A state claiming schema 6 is refused with kind 'version' and "needs a newer version".
  - The v1.0.0-rc1 refusal, from `git show v1.0.0-rc1:src/persistence/saveFile.ts`, line 280:
    `fail('version', \`This dish needs a newer version of Pixelmeba (save schema ${String(f.schemaVersion)}).\`);`
    rc1's SCHEMA_VERSION is 4, so it refuses every v1.1 save.

- **DONE: world-stores-5.test.ts.**
  - Round trips through serialize/deserialize and through buildSaveFile/loadSaveFile (which runs the import checks) give an equal stateHash. The world holds every edge kind, every device kind (a resin with bound activity), both climate arrays, a gateTally and cycleStartTick.
  - Each store, the counter, cycleStartTick and all 12 columns change stateHash when set and restore it when cleared.
  - gateTally never changes stateHash.
  - For a held sample, `canonicalJson(hashedSample) === canonicalJson(encodeSample minus the 12 columns)`, and a held row with trapReserveC 0.5 changes the hash.
  - 4× equals 1×: run(400) against four run(100).

- **DONE: barriers-table.test.ts.**
  - The full CT §5.3 matrix as a literal table: 7 classes plus deposits, × {S01, S02, closed, open, channel, none}.
  - edgeCodeArrays and edgeCodeBetween are symmetric and throw for diagonal cells, the same cell, cells two apart, and consecutive indices on different rows.
  - edgeNeighbour returns −1 at the grid edge.
  - classOf rules (a)–(f) on real records from `registryWith({enabledSpecies: shipped + F04, P06}, { allowUnimplemented: true })`: B01 small; B02 attached fixed and disperser small; P06 attached fixed and free medium; F04 segment fixed, resting newborn small, and fixed again once Active; X01 on an A01 host medium; P04 large; plus a synthetic fixed alga that stays fixed.
  - Every edgeStoreProblem and deviceStoreProblem refusal is covered, and an accepted store of each kind.

- **DONE: phase5-import.test.ts.** It has 33 tests, covering every refusal in Build 6 through parseSaveFile:
  - store refusals use the resave pattern on a re-checksummed file;
  - column refusals use in-memory edits written by buildSaveFile;
  - each refusal is checked for kind 'integrity', its own sentence and a closing "Nothing was loaded."
  - A dish that records the systems, with valid stores, a glowing B09, an A04 in mode 1, a P10 handlingNeed, a resting F04 newborn and a mutual F03 → P04 trap pair with its reserve, loads and round-trips to an equal hash.

- **DONE: gates.test.ts, system-requirements.test.ts and trajectory.test.ts.**
  - gates.test.ts covers worldHasStructure.
  - system-requirements.test.ts: B09, B13, A02, P05, E02 and E11 without their systems are each refused with both sides named, at buildPhase 5; with the system they are accepted. The requirement table pins B09, B13, A02, P05 and V02.
  - trajectory.test.ts: each new store, counter, setting and column, when set to a non-default value, makes 'g2' throw naming it and makes 'full' differ; cleared, both modes equal the world's own digest. gateTally is never in the digest. A held row digests a schema 5 column only while it is non-empty, and never digests the slot columns.

- **DONE: hash neutrality proof.** All listed suites pass; the commands and results are below.

- **E2E:** none. No screens changed.

## Files

Created:
- src/sim/barriers.ts
- src/sim/devices.ts
- src/persistence/phase5State.ts
- tests/sim/barriers-table.test.ts
- tests/sim/world-stores-5.test.ts
- tests/persistence/migration-schema5.test.ts
- tests/persistence/phase5-import.test.ts
- docs/reports/reviews/g5-wave-8a/schema5-build.md

Changed:
- src/sim/world.ts
- src/sim/serialize.ts
- src/sim/entities.ts
- src/sim/gates.ts
- src/sim/content/registry.ts: speciesSystemNeeds and MODULE_SYSTEM_NEEDS only
- src/persistence/saveFile.ts: one import and the hook
- tests/helpers/trajectory.ts
- tests/helpers/trajectory.test.ts
- tests/persistence/migration.test.ts
- tests/sim/gates.test.ts
- tests/content/system-requirements.test.ts
- tests/sim/history-debris.test.ts: the SCHEMA_VERSION pin only, 4 → 5

## Checking that the tests fail without the mechanism

I made each mutation to my own files, ran the test, and then restored the file. serialize.ts was restored from a byte copy.

- **hashedSample stops deleting the empty schema 5 columns.** The migration-schema5 held-sample test fails: `expected '7823db7c4965f58e' to be '71aff808da3b445d'`. In other words, the rc1 held-sample hash would move.
- **The v === 5 step stops extending the sample.** The same test fails because the sample is not migrated, so decodeSample would throw at load.
- **Without the frozen literal,** a slice to the end would include the 12 new columns, and the migration.test.ts literal pin would fail.
- **Without the hook,** every phase5-import refusal test expects a rejection and would get a load. The test asserts the rejection and the exact sentence.

## Commands and results

```
npx tsc -p tsconfig.json --noEmit
  → only tests/sim/module-visuals.test.ts(149,39) "glow_center" is not assignable to FeatureLayerId
    (art-small's in-flight FEATURE_LAYERS edit in art/src/layers/modules.ts vs src/render/features.ts; not my files)
npx eslint <all 19 files I created or changed>   → clean (no output)

npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence   (first run, mid-build)
  Test Files  6 passed (6)   Tests  57 passed (57)

npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence \
  tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts tests/fixtures/conservation-closed-lid.test.ts \
  tests/fixtures/deterministic-state.test.ts tests/sim/world-stores.test.ts tests/sim/history-debris.test.ts \
  tests/sim/history-journal.test.ts tests/persistence/ tests/worker/keep-dish.test.ts tests/worker/sample-transaction.test.ts \
  tests/worker/whatif.test.ts tests/worker/try-dish-host.test.ts tests/content/validator.test.ts \
  tests/content/system-requirements.test.ts tests/sim/barriers-table.test.ts tests/sim/world-stores-5.test.ts \
  tests/sim/gates.test.ts tests/helpers/trajectory.test.ts   (final tree)
  Test Files  37 passed (37)   Tests  466 passed (466)   Duration 1187.77s
```

The 37 files include tests/persistence/migration-schema5.test.ts and tests/persistence/phase5-import.test.ts. Earlier targeted runs of my own files:
- barriers-table: 22/22
- phase5-import: 33/33
- world-stores-5 + migration: 14/14
- trajectory, gates, system-requirements and world-stores-5: 37/37

## FENCE notes

None. Nothing moved. g2-replay, rc1-replay (including the held-sample save's hashAtLoad and hashAfterResume) and the four trajectory-fence files pass unchanged. The rc1 replay test does not pin a re-saved schemaVersion; it asserts `≤ SCHEMA_VERSION`.

## Bugs and notes elsewhere

- **tsc error from art-small (not mine):** the error above comes from the art-small builder's in-flight `glow_center` feature layer. src/render/features.ts `FeatureLayerId` needs the new ids, or tests/sim/module-visuals.test.ts:149 needs adjusting. That is the lead's or art-small's call.
- **Assignment count:** "COLUMNS_ADDED_IN[5] = those 11 names" lists 12 (glowState … handlingNeed). I implemented 12.
- **world.climate.warmth for a later wave:** suitability currently reads settings.warmth only. The climate wave must keep the null branch bit-identical (brief item 5).

## Proposed decisions

- **PROPOSED DECISION (column list):** no new columns for the jacket, the shell, the handling target or native dormancy.
  - The jacket uses `jacketMineral` and the shell uses `boundMineral`.
  - The handling target is `preySlot`/`preyBirthId` plus `handlingProgress`; only `handlingNeed` is new.
  - B12, F04 and P08 run the existing lifeState/stateTimer/lockoutTimer/dryTimer machine (SPEC §7.6, brief R9).
  - "Held" is heldBySlot ≥ 0 and "glowing" is glowState = 1, so no FLAG bit duplicates a column. The only new bit is restNewborn (bit 14), because "began Resting at birth" is not derivable from lifeState. Bit 12 stays retired.
  - Reasons: one source of truth per fact, fewer columns to migrate and hash-neutralize, and no flag and column that can disagree on import.
- **PROPOSED DECISION (classOf rule (e)):** a species whose record says Fixed but which is not attached is classed by its category: a consumer is Medium (CT §5.3 "P06 (free)"), a bacterium is Small ("B02 disperser"), and anything else stays Fixed.
  - A fungus is Fixed by rule (d), except a resting F04 newborn, which is Small by rule (c).
  - An E04-anchored organism keeps its record class, because anchor.ts never sets FLAG.attached and says the organism "keeps its transport class".
  - A parasite on a host takes its host's class, without recursing.
- **PROPOSED DECISION (edge-code arrays):** two Uint8 arrays per cell (R and D) instead of ARCH §5's "4 per cell". A cell's left and up edges are its neighbours' R and D edges, so every edge is stored once and the arrays cannot disagree.
- **PROPOSED DECISION (devices):**
  - `on` is stored only where CT §4 says "toggle" (S09 heater, S10 cooler); it is false at placement.
  - The resin's Off is an empty `resinSelect`.
  - A furnishing or device may not sit on a stone, wall or bead cell; it sits on open water, gel or sediment.
  - The basket stores no object reference, because objects.ts allows one object per cell.
  - Edge barriers and devices share one id space, `nextDeviceId`, so a GateReading names one structure.
- **PROPOSED DECISION (protocol):** PROTOCOL_VERSION stays 2 in wave 8. The single 2 → 3 bump (E_CUE3 with ENT_STRIDE 15, the grit deposit band, GeometryMsg edges/devices) belongs to wave 11's structure-render-worker, which owns protocol.ts and snapshot.ts and fills the stride in the same change. A stride change without its packer is dead layout, and protocol.ts is contended. This matches D-0107.
- **PROPOSED DECISION (import, beyond the list):**
  - A glow timer that is not 0 on an organism without SIGNAL_GLOW or E02 is refused (nothing could have written it).
  - A trap or held-by birthId without its slot is refused.
  - A held sample row holding a trap or a trapped organism is refused until e3-traps lands the sample closure, which replaces that rule.
  - An absent schema 5 store in a schema 5 state is treated as empty, as deserializeWorld does.
- **PROPOSED DECISION (hashing a held sample):** `hashedSample` drops a schema 5 column only when every held row holds its empty value, compared with Object.is so a −0 counts as state, as in D-0035. One non-empty row hashes the whole column by name.
