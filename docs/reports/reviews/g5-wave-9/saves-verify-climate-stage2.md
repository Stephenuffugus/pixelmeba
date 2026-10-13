# Wave 9: saves and determinism check of climate-stage2

- **Scope:** the saves/determinism lens, applied to the uncommitted climate-stage2 work in the shared tree.
- **Result:** ok = true. I found no BLOCKER or MAJOR problems. There are two MINOR problems, listed most severe first, then the parts I verified.
- **Constraints:** I edited no tracked file except this report. My scratch files are in `tmp/verify-saves-g5-wave-9-0/`: `probe.test.ts`, `diffs.test.ts`, `vitest.config.ts`, and the `*.log` / `*.out` files.

## Problems

1. MINOR [lead] tests/sim/world-stores-5.test.ts:233 — The assertion `expect(a.climate.warmth![cellIndex(74, 70)]).toBe(0.75)` now fails as intended: the world records 'climate', so the imported warmth relaxes toward 0.5 and its S09 heater acts. It fails with "expected 0.5079943373879735 to be 0.75". The 4× = 1× hash check in the same test still passes. Until the lead applies the builder's one-line fix, `npm run check` is red. That fix compares `a.climate.warmth` with `b.climate.warmth` and retitles the describe. — repro: `npx vitest run tests/sim/world-stores-5.test.ts`.

2. MINOR [climate-stage2] src/sim/climate.ts:180-190, :221, :328 — Three caches are keyed only on `grid.geometryVersion` plus array identity (`world.devices` or `world.edges`):
   - the roof cache (`roofCells`);
   - the keyed light path (`tc.lightDevices`);
   - the warmth coefficients (`tc.warmthEdges`).

   `Device.cell` is mutable (devices.ts:35). A writer that mutates `world.devices` in place without bumping geometryVersion leaves the running dish with a stale roof, while a reload rebuilds the cache. The two then diverge. In probe P3 (`tmp/verify-saves-g5-wave-9-0/probe.test.ts`), each of these mutations was followed by 200 ticks on both copies, and both cases give `DIVERGES`:
   - pushing an S11 in place;
   - moving an S11's `cell` in place.

   No writer like this exists today: realizeRecipe assigns a new array and the tests bump. This is therefore a latent contract for wave 10's structure-commands. Every device or edge writer must assign a new array or bump geometryVersion. The builder noted this, but nothing in devices.ts or barriers.ts enforces or documents it.
   - Suggested: say so in the Device and EdgeBarrier doc comments, and have wave 10's command tests include a reload-equality check after each device or edge command.

## VERIFIED OK

- VERIFIED OK — **FENCE unchanged.** `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts` gave "Test Files 8 passed (8), Tests 62 passed (62)", exit 0. So the g2 saves and the rc1 corpus (D-0101) load and continue bit-identically, and v1.0 saves keep their recorded ruleset.
- VERIFIED OK — **Builder suites rerun by me.**
  - Command: `npx vitest run` on the five climate files plus world-stores-5, phase5-import, migration-schema5 and chemistry.
  - Result: "Test Files 1 failed | 8 passed (9), Tests 1 failed | 112 passed (113)".
  - The only failure is problem 1. climate-determinism passes: 1× = 4×, the save at tick 1,234 continues to 3,000 with an equal hash and an equal 'full' digest, the allocation-moment reload matches, the 10k closed-lid ledger closes, and the NEUTRAL dish stays byte-identical to the shipped registry.
- VERIFIED OK — **Dense reload sweep** (probe P1). The world has the cycle, drying, a heater On, a cooler On, two S11 roofs, an S12 wick, an A05 colony and 10 A01 photosynthesizing under the canopy and roof.
  - It reloads through both paths, serializeWorld → deserializeWorld and buildSaveFile → loadSaveFile, at 21 awkward ticks: 0, 1, 2, 3, 450, 899, 900, 901, 1050, 1199, 1200, 1201, 1650, 2099, 2100, 2101, 2250, 2399, 2400, 2401 and 2402. These cover tick 0 and the first allocation stage 2, the day/dusk/night/dawn edges and the wrap at 2,400.
  - Each of the 42 copies has an equal stateHash at load and an equal stateHash after 47 more ticks.
  - Stepping one tick at a time for 2,449 ticks equals one `run(2449)` in both stateHash and trajectoryDigest 'full'.
- VERIFIED OK — **Paused transitions saved before stepping** (probe P2). Each case was run at ticks 777, 1100 and 2150, reloaded through both paths, and run 250 more ticks; every hash was equal:
  - `setLightMode('cycle')` on a Fixed dish;
  - `setLightMode('fixed')` mid-cycle (the lightVersion reset);
  - `wetCells` with drying off (it allocates);
  - `paintSubstrate` to water and to gel through `applyNow` (moistureOnRepaint);
  - a new S11 placed through a new devices array without a geometryVersion bump (the array-identity key catches it);
  - the heater toggled On in place with no bump (warmth reads `on` live);
  - the cooler toggled Off;
  - every A05 killed while paused (the last canopy organism lost).
- VERIFIED OK — **The light convention reaches no hash.**
  - Probe `diffs.test.ts`: after a reload at ticks 1, 900, 1050, 1200, 2100, 2250 and 2400, derived.light and derived.moisture are Object.is-equal on every cell when there is no canopy.
  - With an A05 colony, only the 12 cells of the canopy footprint differ, and only in derived.light. Outside stage 2, canopy reads the current biomass, which is the brief's accepted PROPOSED DECISION and is display only.
  - Nothing in the simulation reads derived.light or derived.moisture before stage 2 recomputes them. The readers are intake (stage 6), lightSeeker (stage 4), dormancy, suitability, crossing, fungi, and pairedRun after a tick. Stage 1 commands read neither. Probe P1, with A01 under the canopy, confirms the hash is unaffected.
- VERIFIED OK — **New saved state is canonical, validated, and either hash-neutral or deliberately hashed.**
  - Both climate arrays are fixed-index, cover every cell, and are hashed only when non-null (serialize.ts:392-393). `settings.cycleStartTick` is deleted, not set to undefined, so canonicalJson of the settings matches v1.0 when it is absent. Devices are kept sorted.
  - Import refusals (probe P4) all end with "Nothing was loaded.":
    - cycleStartTick greater than tick: "The dish's light cycle starts at an invalid time. Nothing was loaded."
    - warmth 1.0000001: "The dish's local warmth has an invalid value at cell 9022. Nothing was loaded."
    - moisture −0.1: "The dish's local moisture has an invalid value at cell 8232. Nothing was loaded."
  - Moisture 0.05, below the drying floor but inside [0, 1], loads and stays at 0.05. Drying never raises a value, as proposed decision 3 says.
- VERIFIED OK — **Ledger.** Heat and moisture move no material and add no ledger line. climate-determinism's 10,000-tick closed-lid check passes, and wetCells leaves every field and the ledger byte-equal (climate-moisture).
- VERIFIED OK — **No randomness and no unordered iteration.** `grep -nE "Math\.random|Date|rng|performance\.now|new Map|new Set|Object\.keys|for \(const \w+ in" src/sim/climate.ts` finds nothing, and the added lines in transport, chemistry, suitability and structures are clean too. The only module-level state is:
  - a WeakMap keyed on the species table, used for lookup only and rebuilt per world;
  - `wickMark`, which is reset after every use;
  - the shared diffusion scratch buffer, used sequentially.
- VERIFIED OK — **Observation never allocates or writes.** `lightFactors`, `climateLightAt`, `localWarmthAt` and `moistureAt` only read; climate-warmth's "observation never allocates" test passes. The worker (`snapshot.ts`) calls `lightFactors` but never `updateDerived`.
