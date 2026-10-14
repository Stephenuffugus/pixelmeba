# Wave 11 · structure-render-worker · saves and determinism verification

Lens: saves and determinism only. Verifier probes are in `tmp/verify-saves-g5-wave-11-0/` (not committed). I edited no tracked file except this report, and I ran no git command that changes state.

**Verdict: ok.** There are no BLOCKER, MAJOR or MINOR problems for structure-render-worker. One INFO entry belongs to another task.

## Problems

- INFO [e2-signals] src/sim/ledger.ts — a v1.0 world now serializes with one extra key, `ledger.energy.signal: 0`. The stateHash does not change, but the canonical bytes do differ from HEAD. This explains why `canonicalJson(serializeWorld(...))` of FIRST_DISH_V1 differs between the HEAD tree and the working tree, with every stateHash equal. It does not come from structure-render-worker: a key-by-key diff of the two serializations shows this single line. It is additive and hash-neutral while 0, and every rc1 save still loads and replays. I record it so nobody blames the protocol bump for the byte change. Repro: `tmp/verify-saves-g5-wave-11-0/xver/dump.ts` in both trees, then `diff dump-head.txt dump-cur.txt`.

## VERIFIED OK

- **The golden really comes from HEAD.** I extracted `git archive HEAD` into `tmp/verify-saves-g5-wave-11-0/head` and re-ran the builder's `write-golden.ts` there. Both `tests/fixtures/protocol2-golden/*.json` files came out byte-identical (`cmp` SAME). The v1.0 equivalence test therefore compares against true protocol 2 output.
- **Fence and the builder's determinism tests pass.** Run: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/worker/protocol3-v1-equivalence.test.ts tests/worker/new-dish-environment.test.ts tests/worker/structure-snapshot.test.ts tests/render/gate-tracer.test.ts`. Result: 12 files, 89 tests passed (500 s).
- **Packing only reads, even on a Phase 5 world** (probe1). The world was host-built with `{lid:'closed', lightMode:'cycle', drying:true}` and had every edge kind, every device kind, an S09 heater on and an S08 with bound set. On every tick for 1200 ticks, crossing the day-to-dusk boundary at 900, the probe ran packEntities, packDeposits, packGeometry, packResins, packEnvironment and speciesFreeClasses, the light, sugar, warmth, moisture, ph and foodAccess overlays, 19 cell inspections (including edge and device cells) and 6 entity inspections. The stateHash, `trajectoryDigest 'full'` and the climate-array allocation pattern all equal the plain run's.
- **1× vs 4×.** `run(1200)` equals 4 × `run(300)` equals 1200 single steps (probe1). After the probe2 command log, `run(400)` equals 4 × `run(100)`.
- **Serialize round trips.** Serialize → deserialize every 150 ticks gives the reference hash (probe1).
- **Save round trips at awkward moments, then continuing:**
  - probe1, with buildSaveFile → loadSaveFile: tick 0 right after creation with overrides, and ticks 899, 900 and 901 around the cycle phase change. In each case the hash and bytes are equal on load, the provenance overrides are kept, and the run continues to the reference hash.
  - probe2, saving with a command handled but not yet stepped: at placeDevice (20, 21), setDevice on and resinSelect (40, 41), the backward S04 placeEdges (61), setLightMode cycle (120, 121), wetBrush (200), and the setDrying re-issued after an Undo (306). The dish is reopened in a fresh DishHost and the rest of the command log is replayed. All end bit-identical to the uninterrupted host.
- **The host path does not change the outcome.** Each probe compares a run driven through `DishHost`, which sends a snapshot every step, against the same run without the protocol 3 views:
  - probe1: 1200 host steps with `view` overlays (warmth, then moisture) and cell selections on an S04 cell and the resin cell equal a plain `run`, in both stateHash and digest.
  - probe2: a host with views and inspector reads on every tick, against a host with no view, under a command log of devices, edges, the light cycle, wetting, drying and an Undo. stateHash, digest and canonical bytes are all equal. 8 geometry messages were sent, and no command errors occurred.
  - Before the heater turned on, the warmth overlay and the climate inspector lines never allocated `climate.warmth`.
- **rc1 corpus (D-0101) through the protocol 3 host** (probe3). Every one of the 5 saves:
  - opens with bytes equal to `loadSaveFile`;
  - reports `DishInfo.systems` equal to the world's recorded `enabledSystems` (the v1.0 ruleset is kept, not the build's);
  - steps 300 times with the warmth, moisture, light and sugar overlays and cell selections, bit-identically to a plain run (the held-sample save refuses to step, as before);
  - sends no `resins` or `environment` key in any snapshot, has E_CUE3 = 0 for every organism of every snapshot, and gets geometry with `edges: null` and `devices: []`;
  - re-saves to the same hash, with bytes equal to the plain run's.
- **Byte identity with HEAD for builds without the new keys** (xver/build-bytes.ts, run in both trees). The cases were none, `{}`, seed, seed 7, mutationPreset, founderMode, empty, habitatId, and all 19 recipes. stateHash at tick 0 and tick 50 is equal for every one. The provenance is unchanged except where lid, lightMode or drying is given, and then only by exactly that key. The only byte difference is the e2-signals INFO entry above.
- **Recorded overrides re-run exactly** (probe4). The cases were lid closed, the explicit default environment, cycle, drying, and all of them together under the climate registry. In each, recipeStartOf → realizeRecipeSource rebuilds the world byte-equal at tick 0 and hash-equal at tick 400. The explicit defaults keep the recipe identity, and a real change gets identity null.
- **Validated on import.** No new saved state comes from this task: there is no schema change, and GeometryMsg, resins, environment and CellInspect are views only. The three provenance keys are validated by `recipeOverridesOf` (src/sim/recipes.ts:246; malformed gives null, which What if? and freshStart handle) and by recipe-file import (src/persistence/recipeFile.ts:508-521). Both of these predate this task.
- **Nothing outside src/sim draws simulation randomness.**
  - gateTracer.ts uses `cosmetic()` from layers.ts, a stateless integer hash.
  - Nothing in src/render imports rng.ts.
  - `edgeCodeArrays` returns fresh arrays, so `packEdges` ORing in EDGE_FLOW_BACK never touches world or cache state.
  - `climateLightAt` and `localWarmthAt` only read; the canopy WeakMap is a pure memo keyed per species table.
  - Persisted pictures (gallery sprites as tuples, and `dishThumb` from columns) do not depend on the stride, so the move to ENT_STRIDE 15 cannot corrupt saved shelf or gallery data.
