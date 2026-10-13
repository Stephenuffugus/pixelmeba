# climate-stage2: round-1 fix report (g5 wave 9)

## The four problems

1. **MAJOR: the 10,000-tick conservation test had no explicit timeout. FIXED.**
   - tests/sim/climate-determinism.test.ts: the closed-lid conservation test now ends with `}, 600_000);`, as conservation-closed-lid.test.ts does.
   - The save/reload test, the paused-heater test, the NEUTRAL test and the 1× = 4× test now each end with `}, 300_000);`.
   - Evidence: in a loaded 18-file run (the determinism file plus the 17 "pass unchanged" files), climate-determinism passed every test.

2. **MINOR: no test checked the starting value of a newly allocated warmth array. FIXED.**
   - New test in tests/sim/climate-warmth.test.ts: "the new array starts at settings.warmth (0.62 here), not at the 0.5 default: a far cell reads exactly 0.62".
     - It sets settings.warmth = 0.62 and turns on a heater at (60,64).
     - After one tick, the far cell (90,64) is exactly 0.62, every cell other than the heater's is 0.62, and the heater's cell is 0.62 + 0.001.
     - After 50 more ticks the far cell is still 0.62, and localWarmthAt agrees.
     - The world then passes a buildSaveFile → loadSaveFile round trip.
   - Mutant `.fill(0.5)` in warmthStep → this test fails. Reverted.

3. **MINOR: no test ran drying on sediment. FIXED.**
   - New test in tests/sim/climate-moisture.test.ts: "sediment dries like gel (SPEC §4.8 'uncovered gel/sediment cells lose 0.001/s'): a roof stops it, a wick from water holds 0.8".
     - It uses the SEDIMENT_EDGE habitat with drying on, plus one S11 roof and one S12 wick on water.
     - After 300 ticks:
       - the uncovered sediment cell equals the hand-iterated 0.8 − 300 × 0.0001 = 0.77, and derived.moisture equals it;
       - the roofed sediment cell is 0.8;
       - the sediment cell next to the wick is 0.8 (it dries 0.0001 and is wicked back each tick);
       - water is 1.
     - Every value is in [0, 1], and the world passes a round trip.
   - Mutant "drying skips every cell that is not gel" (`g.substrate[i] !== 1`) → this test fails ("expected 0.8 to be 0.7700000000000033"). Reverted.

4. **MINOR: the roof and warmth caches were keyed on geometryVersion plus array identity, so an in-place device or edge write left them stale. FIXED in code, not only documented.** The three climate caches are now keyed on content, so they no longer depend on wave 10's writers bumping geometryVersion. The roof key covers the Device.cell mutation the verifier named. The warmth key covers EdgeBarrier.open, the only mutable edge field that warmth reads.
   - **Roof** (src/sim/climate.ts roofCells):
     - Every call compares the S11 cells, in world.devices order, with tc.roofKey (the list from the last build). Devices are few, so this costs O(devices).
     - It rebuilds the roof on any difference and bumps tc.roofStamp.
     - The geometryVersion and array-identity checks are gone; the roof never depended on geometry.
   - **Keyed light path** (deriveClimateLight): it recomputes when `tc.lightVersion !== gv || tc.lightRoofStamp !== tc.roofStamp`. This replaces the devices-array identity check.
   - **Warmth coefficients** (warmthCoefficients): the cache key is geometryVersion plus the closed S03 shutters' edge keys in world.edges order (tc.warmthShutters, compared every call, O(edges)). A shutter toggled in place stops or passes warmth on the next tick.
   - **TransportCache** (src/sim/transport.ts): lightDevices, roofVersion, roofDevices and warmthEdges are replaced by lightRoofStamp, roofKey, roofStamp and warmthShutters, and the doc comment is updated. The now-unused type imports of Device and EdgeBarrier were removed.
   - The other climate readers of devices already read world.devices directly every tick: heater and cooler input, warmth allocation, and the wicks. Canopy is recomputed every tick.
   - New tests:
     - tests/sim/climate-light.test.ts: "a roof pushed or moved IN PLACE (same array, no geometryVersion bump) is seen at once, and the dish equals its reload".
       - The test pushes an S11 into the same array, then moves another roof's cell in place. geometryVersion does not change.
       - After each change, light is right immediately and lightFactors agrees at every cell.
       - The reload's derived.light is equal at every cell (Object.is).
       - After 200 ticks with A01 on the roof cells, stateHash equals the reload's.
     - tests/sim/climate-warmth.test.ts: "a shutter line toggled IN PLACE (EdgeBarrier.open, no geometryVersion bump) stops or passes warmth at once, and the dish equals its reload".
       - The line is closed, then opened in place: warmth crosses, and stateHash equals the reload's after 100 ticks.
       - The line is closed again in place: stateHash equals the reload's, and the near side keeps warming.
   - Mutants:
     - roofCells returning the cached roof whenever one exists → the in-place roof test fails.
     - The warmth key without the shutter comparison → the in-place shutter test fails.
     - Both reverted; climate.ts is byte-equal to its backup after every mutant.
   - The contract for barrier-movement's caches is not mine. src/sim/edgePassage.ts:8-9 and attachment.ts:82 key on geometryVersion and say "Every writer of an edge or a device must also bump grid.geometryVersion (wave 10's contract)". The verifier's suggested Device/EdgeBarrier doc comments are in devices.ts and barriers.ts, which I do not own, so they are left for the lead (below).

## Other notes

- **tests/sim/world-stores-5.test.ts:233 still fails, as both build reports and both verifiers expected.** It asserts `expect(a.climate.warmth![cellIndex(74, 70)]).toBe(0.75)` and receives 0.5079943373879735.
  - The cause: the world records 'climate', so stage 2 now relaxes the imported warmth and the store's S09 heater acts. The premise "the stores are carried, not read" no longer holds for climate.
  - The 4× = 1× hash check in the same test passes.
  - Wave-verify assigned this to the lead ("MAJOR [lead]"), and the file is not in my ownership. Proposed one-line change:
    - Replace line 233 with `expect(Array.from(a.climate.warmth!)).toEqual(Array.from(b.climate.warmth!));`.
    - Retitle the describe to "the stores survive 4× = 1× (climate now evolves them deterministically)".
- **Proposed doc comments for the lead** (src/sim/devices.ts Device.cell, src/sim/barriers.ts EdgeBarrier.open, owned by others or in flight): "A writer that changes this in place must bump grid.geometryVersion (edgePassage.ts and attachment.ts caches key on it; climate.ts caches key on content). Wave 10's command tests should check reload equality after each structure command."
- **PROPOSED DECISION:** climate.ts caches derived from world.devices and world.edges are keyed on their content and compared every call (devices and edges are few), never on geometryVersion or array identity alone. A writer that forgets the geometryVersion bump therefore cannot make a running dish diverge from its reload.

## Files changed in this round

- src/sim/climate.ts: roofCells content key; keyed light path on roofStamp; sameClosedShutters and the warmth coefficient key; imports edgeCodeOf and edgeKey.
- src/sim/transport.ts: TransportCache climate fields and doc comment; removed the unused type imports.
- tests/sim/climate-determinism.test.ts: explicit timeouts.
- tests/sim/climate-warmth.test.ts: the 0.62 initial-value test and the in-place shutter test.
- tests/sim/climate-moisture.test.ts: the sediment drying test; gelWorld takes an optional habitatId; imports SUB_SEDIMENT.
- tests/sim/climate-light.test.ts: the in-place roof test.
- docs/reports/reviews/g5-wave-9/climate-stage2-fix1.md (this report).

## Commands and results

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | clean |
| `npx eslint src/sim/climate.ts src/sim/transport.ts tests/sim/climate-*.test.ts` | clean (exit 0) |
| `npx vitest run` on climate-light, climate-moisture, climate-warmth and climate-cycle | Test Files 4 passed (4), Tests 43 passed (43) |
| climate-determinism plus the 17 "pass unchanged" files: tests/sim/{chemistry, transport, dormancy, world-stores-5, attachment, lab-commands, tools}, tests/fixtures/{photosynthesis, dusk-suitability, habitat-presets, producers, film, module-e06, module-e07, transport-obstacles}, tests/persistence/{phase5-import, migration-schema5} | Test Files 1 failed, 17 passed (18); Tests 1 failed, 224 passed (225); Duration 299.80 s. The one failure is world-stores-5:233 (above). climate-determinism passed every test. |
| FENCE: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts` | Test Files 8 passed (8), Tests 62 passed (62), 311.00 s. Unchanged. |

Mutants, each run by hand and then reverted:

| Mutant | Result |
|---|---|
| `.fill(0.5)` | warmth initial-value test fails |
| drying gel-only | sediment test fails |
| stale roof | in-place roof test fails |
| warmth key without shutters | in-place shutter test fails |

- E2E: none (no screen changes).
