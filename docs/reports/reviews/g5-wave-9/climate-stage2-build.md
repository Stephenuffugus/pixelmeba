# Wave 9 — climate-stage2 build report

Builder: climate-stage2 (port 4271, unused: no screen changes). Date: 2026-10-13.

## Checklist

### Build
1. DONE: constants. src/sim/constants.ts:130–151: CYCLE_*, ROOF_SHADE, CANOPY_BIOMASS_SCALE, WARMTH_*, MOISTURE_*, DRYING_PER_SECOND, WETTING_MOISTURE, WICK_*, with CT references. Per-tick amounts are computed once at climate.ts:68–70.
2. DONE: cycle. climate.ts:82 cycleActive (needs 'climate' and lightMode 'cycle'), :87 cyclePhaseTick, :93 cycleFactor (one expression built from the named constants), :104 cyclePhaseName, :116 lastStageLightTick = max(tick − 1, cycleStartTick ?? 0). transport.ts:370 is `updateDerived(world, lightTick?)`: stage 2 passes world.tick (transport.ts:436) and every other caller keeps its call unchanged. Proved by climate-cycle "cycleFactor", "every tick of one full period" and "the light convention".
3. DONE: light. climate.ts:126 effectiveLight is the one function; :139 canopyAt (own, E, S, W, N); :167 accumulateCanopy (living CANOPY-ability organisms in slot order); :180 roofCells (gated on a recorded S11, cached on geometryVersion plus the devices array identity); :197 lightNeutral; :207 deriveClimateLight (recomputes every tick while the cycle is active or a CANOPY organism is alive, then sets tc.lightVersion = −1; otherwise recomputes when the key moves). transport.ts:387 keeps the neutral fast path byte for byte. Proved by climate-light (roof, canopy, A01 photosynthesis, full formula) and climate-cycle (lightVersion reset).
4. DONE: warmth. climate.ts:356 warmthStep: allocate once an S09/S10 is On, then relax, diffuseField (unmodified) with the :325 warmthCoefficients cache (geometryVersion plus the edges array identity; stone and wall stop warmth, as does EDGE_SHUTTER_CLOSED), the device's own cell, clamp. Proved by climate-warmth.
5. DONE: moisture. climate.ts:408 moistureStep (allocates when drying is on; drying skips water and S11 cells; wicks are active by substrate only, move each marked cell once, linearly and in both directions), :448 ensureMoisture, :457 wetCells. Proved by climate-moisture.
6. DONE: repaint reset. One call in structures.ts:306, moistureOnRepaint(world, cell, code) (climate.ts:471). It runs before the existing write and acts only when the substrate changes (PROPOSED DECISION 2). Proved by climate-moisture "paintSubstrate gel → water → gel".
7. DONE: stage 2 order. transport.ts:407 climateStep(world, tc) runs first. Then transport, gas exchange, decays, film and neutralize run unchanged, then updateDerived(world, world.tick). Comment placeholders mark the wave 10 S04 channel (after diffusion) and resin (after decays). climateStep returns at its single 'climate' check (climate.ts:308).
8. DONE: suitability. suitability.ts:81–82 `const wa = world.climate.warmth; const warmth = wa === null ? world.settings.warmth : wa[cell]!;`. Proved by climate-warmth "SUIT_WARMTH" and "bit-identical for 50 pairs".
9. DONE: lightFactors. chemistry.ts:127. A world without 'climate', S11 or a CANOPY species returns exactly the old three keys (tests/sim/chemistry.test.ts unchanged and passing). Otherwise it adds cycle (cycle mode only), roof and canopy, with effective from climate.ts:274 climateLightAt. localWarmthAt (:498) and moistureAt (:504) are read-only. Proved by climate-light "lightFactors(w, c).effective === derived.light[c]".
10. DONE: state transitions. setLightMode (:482), ensureMoisture, wetCells, moistureOnRepaint, each round-tripped through buildSaveFile → loadSaveFile (climate-cycle, climate-moisture).
11. DONE: implemented.ts has 'CANOPY' in sorted order. `git grep IMPLEMENTED_NATIVE_ABILITIES` finds no test that pins its real contents (tests/helpers/registry.test.ts mocks the module). REG_A05 validates without allowUnimplemented.
12. DONE (measured under contention; final numbers are for the lead): tmp/climate-perf/perf.ts (not committed), 2,000 ticks, 400 B01/A01 placed in a 20×20 grid with background sugar 0.05:
    - (a) shipped registry: alive 3672 at the end; tick mean 6.310 ms, p95 13.203 ms; stage 2 mean 1.204 ms, p95 2.954 ms; stage 2 share 19.1 %.
    - (b) climate registry with the cycle on, drying on, 2 heaters On and 4 roofs: alive 2564; tick mean 5.894 ms, p95 10.989 ms; stage 2 mean 1.594 ms, p95 3.332 ms; stage 2 share 27.0 %.
    - Stage 2 costs about +0.4 ms per tick with every climate rule live: per-tick light over the dish, warmth relax, diffusion and clamp, and the drying pass.

### Done when
- DONE: the five climate test files pass.
- PARTLY DONE: of the "pass unchanged" list, tests/sim/{chemistry, transport, dormancy, attachment, lab-commands, tools}, tests/fixtures/{photosynthesis, dusk-suitability, habitat-presets, producers, film, module-e06, module-e07, transport-obstacles}, tests/persistence/phase5-import, tests/persistence/migration-schema5 and tests/helpers/registry pass. **tests/sim/world-stores-5.test.ts fails one assertion by design.**
  - Its test "the stores are carried, not read, by the simulation" builds a world that records 'climate' and holds an S09 with `on: true` at (74,70). It runs 400 ticks and expects `a.climate.warmth[(74,70)]` to still be 0.75 (line 233). The climate stage now reads that heater, as it must.
  - The 4× = 1× hash equality in the same test still passes.
  - I do not own that file. Proposed fix for the lead: replace line 233 with `expect(Array.from(a.climate.warmth!)).toEqual(Array.from(b.climate.warmth!));` and retitle the describe to "the stores are carried, and 4× equals 1×", because wave 9's climate stage now reads warmth and devices.
- DONE: `npx tsc -p tsconfig.json --noEmit` is clean. `npx eslint` is clean on every changed file and on the five test files.
- DONE: the FENCE is unchanged (see Commands).

## Files
- Created: src/sim/climate.ts; tests/sim/climate-cycle.test.ts, climate-warmth.test.ts, climate-moisture.test.ts, climate-light.test.ts, climate-determinism.test.ts; this report.
- Changed:
  - src/sim/transport.ts: imports; TransportCache climate cache fields and their createCache init; updateDerived(world, lightTick?); stageEnvironment order plus two wave 10 placeholder comments. diffuseField and filmCoefficients are untouched.
  - src/sim/suitability.ts: the warmth line.
  - src/sim/chemistry.ts: LightFactors, lightFactors and the header comment.
  - src/sim/constants.ts: appended constants.
  - src/sim/world.ts: doc comments only.
  - src/sim/structures.ts: one import and one call.
  - src/sim/content/implemented.ts: 'CANOPY'.
- Not changed: tests/helpers/trajectory.ts needed no registration. trajectoryDigest 'full' already hashes a non-null `climate` store as a world store, and the derived caches live on derived.transport.

## What each test proves (mutants run by hand, each reverted: tmp/climate-stage2/mut/run.py)
- climate-cycle:
  - the factor table and wrap;
  - cycleStartTick offsets;
  - stage 2 light = lightBase × cycleFactor(T) at every one of 2,400 ticks, with exactly 300 + 299 changes, all at dusk and dawn;
  - THE CONVENTION at ticks 1, 950, 1100 and 2200: reload and a paused deposit give Object.is-equal light on every dish cell;
  - leaving the cycle at night gives clamp(lightBase × shade) after one step;
  - setLightMode round trips; it is refused without 'climate'.
- climate-warmth:
  - an Off heater over 1,000 ticks, with lightFactors, localWarmthAt and updateDerived calls, allocates nothing;
  - an On heater allocates at the next stage 2, the same after a paused-point reload;
  - the relax recurrence;
  - the 4-neighbour coefficient 0.05, diagonals untouched;
  - a WALL line and a closed S03 line leave every cell beyond at exactly ambient;
  - S01, S02, an open S03 and S04 give exactly the free-water value;
  - the sealed heater and cooler closed-form recurrences;
  - additivity;
  - the clamp at exactly 1 and 0;
  - [0, 1] over 5,000 ticks;
  - round trips (allocation, mid-gradient, clamp);
  - SUIT_WARMTH = response(localWarmth, …);
  - 50 (species, cell) pairs bit-identical to the shipped registry.
- climate-moisture:
  - allocation at the first stage 2;
  - nothing allocated by a wick or roof alone;
  - the drying recurrence to exactly 0.1;
  - a roof keeps 0.8;
  - water stays 1;
  - wick: the 4 sides, not the diagonals or its own cell;
  - no chaining;
  - two wicks do not add;
  - wick lowers 0.9 to 0.8;
  - wetCells leaves fields and ledger byte-equal and is refused without 'climate';
  - drying on vs off: every field byte-identical after 3,000 ticks;
  - repaint resets, and gel over gel is a no-op;
  - derived.moisture and moistureSuitability follow the array;
  - round trips.
- climate-light:
  - the roof is exactly × 0.25 with and without 'climate', and the neighbours are unchanged;
  - a new devices array is seen without a geometryVersion bump;
  - canopy is 0.5 on the cell and its 4 neighbours and 1 on the diagonals;
  - 5 + 5 sums to 0.5;
  - a dead A05 counts nothing, and light is back to the fast-path value;
  - an A01 under canopy 0.5 gains half (ratio within 1e-6);
  - the full formula is checked at every stage 2 for 1,100 ticks (199 of them at dusk);
  - lightFactors equals derived.light on every dish cell between steps, after a reload and after a paused command;
  - the shipped world keeps the three old keys.
- climate-determinism:
  - 1× = 4×;
  - a save at 1,234 (dusk) and run to 3,000 equals the uninterrupted run (stateHash and trajectoryDigest 'full'); [0, 1] at every 500-tick checkpoint;
  - a heater switched On by a paused change and saved before stepping equals the uninterrupted run, including the allocation moment;
  - closed lid, 10,000 ticks: ledger relative < 1e-5, absolute < 1e-8;
  - NEUTRAL: FIRST_DISH_V1 recording 'climate' keeps null arrays for 2,000 ticks, and its serialized entities, every field, derived light and moisture, and the 'full' digest are byte-identical to the shipped registry.
- Mutants (8 of 8 caught):
  - M1, suitability reads settings.warmth while an array exists → climate-warmth "SUIT_WARMTH" fails.
  - M2, warmth diffuses across a closed shutter → "a WALL line and a closed S03 line" fails.
  - M3, device input on the 4-neighbours → "relax + device recurrence" fails.
  - M4, drying under a roof → "a roofed gel cell keeps 0.8" fails.
  - M5, wick chaining through a wetted cell → "wicks do not chain" fails.
  - M6, updateDerived outside stage 2 uses world.tick → climate-cycle "the light convention" fails.
  - M7, an Off heater allocates → "an Off heater allocates nothing" fails.
  - M8, the lightVersion reset removed → "leaving the cycle at night" fails.

## Commands and results
- Fence, after the main code: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts` → "Test Files 8 passed (8), Tests 62 passed (62)".
- Final, after the last edit, fence plus the five climate files in one run → "Test Files 13 passed (13), Tests 106 passed (106)" (872 s under contention).
- Done-when list (18 files) → "Test Files 1 failed | 17 passed (18), Tests 1 failed | 223 passed (224)". The one failure is world-stores-5:233, explained above.
- Re-run after the repaint change: climate-moisture + lab-commands → "Test Files 2 passed (2), Tests 53 passed (53)".
- Durations under load: climate-determinism ≈ 290 s and climate-warmth ≈ 60 s.
- `npx tsc -p tsconfig.json --noEmit` → clean. `npx eslint <changed files> tests/sim/climate-*.test.ts` → clean.

## FENCE
Unchanged. No fence value moved, and fence-update was not run.

## The light convention
- Stage 2 of tick T computes light for t = T: transport.ts:436 `updateDerived(world, world.tick)`.
- Every other caller uses t = lastStageLightTick = max(tick − 1, cycleStartTick) (climate.ts:116), through updateDerived's default (transport.ts:370 → climate.ts:207). Those callers are recipes.ts realize, serialize.ts deserializeWorld, commands.ts applyNow, sample.ts, experiments.ts and test helpers.
- lightFactors uses the same tick, and reads the canopy sums of the last light computation (TransportCache.canopy), so it equals derived.light.

## Allocation triggers (every one)
- Warmth: only climate.ts warmthStep, in stage 2, when the world records 'climate', the array is null, and some S09 or S10 has `on === true`. The fill is settings.warmth.
- Moisture:
  - climate.ts moistureStep, in stage 2, when the world records 'climate', the array is null and settings.drying is true;
  - climate.ts ensureMoisture / wetCells, for wave 10's wet brush (refused without 'climate').
  - The fill is water 1, otherwise 0.8, on every cell.
- Never: lightFactors, localWarmthAt, moistureAt, updateDerived, deriveClimate*, moistureOnRepaint, a wick or a roof alone. An allocated array is never freed.

## Readers of derived.light / derived.moisture checked (none runs before stage 2)
- derived.light:
  - intake.ts:180 (photosynthesis, stage 6);
  - lightSeeker.ts:47, 53 (E07, via movement stage 4);
  - dormancy.ts:58 usableFoodHere (dormancyStep, in structures.ts stage 8);
  - snapshot.ts:349, 641, 740 (observation).
- derived.moisture:
  - suitability.ts (movement stage 4, fungi.ts stage 9, crossing.ts);
  - dormancy.ts:42 (stage 8).
- Stage 1 (commands.ts) reads neither. So a reload or paused-command canopy difference cannot reach the hash.

## PROPOSED DECISIONS
D-0113 already records the task file's proposed items: the light convention, the roof gated on a recorded S11, canopy read at light time, allocation only from settings and devices, never freed, warmth passing S01/S02/open S03/S04, devices acting on their own cell, a wick or roof alone not allocating, drying ignoring beads and stones, and the linear, non-adding wick. They were built as specified. New ones:
1. PROPOSED DECISION: setLightMode('cycle') on a dish that already cycles changes nothing and keeps cycleStartTick. Reason: choosing the current mode again must not jump the light, and the existing setMutationPreset rule says "choosing the current one changes nothing".
2. PROPOSED DECISION: the repaint reset acts only on cells whose substrate actually changes. Painting gel over a dried gel cell keeps its moisture. Reason: otherwise substrate paint would be a free re-wetting tool beside the wet brush, and a no-op paint would change hashed state.
3. PROPOSED DECISION: drying lowers only cells above the 0.1 floor, so it never raises a value. Only an imported file can hold a value below 0.1, and the import accepts any value in [0, 1].
4. PROPOSED DECISION: lightFactors' canopy is the canopy of the last light computation (TransportCache.canopy and canopyLive), not a recount of the current biomass. Then `effective` is bit-identical to derived.light between steps, and the inspector shows what organisms actually received. A fresh count is made only when no cached sums exist.
5. PROPOSED DECISION: the wick loop runs only when the world records S12 (an early exit; behaviour is identical).

## Notes for other tasks (nothing changed in barrier-movement's files)
- world-stores-5.test.ts:233 needs the lead's one-line update above.
- Wave 10 (structure-commands):
  - A queued (running) wetCells or substrate paint in stage 1 updates derived.moisture at the end of that tick's stage 2, while a paused applyNow updates it at once. This matches today's substrate paint, and no stage 1 code reads moisture.
  - Every device and edge writer must bump geometryVersion or assign a new array (the roof, light and warmth caches key on both).
  - setLightMode is the command's whole state transition; the command adds only the 'not in this dish' refusal (false).
- Wave 10 (barrier-transport): if a future CANOPY species were Small, an S04 move inside stage 2 would happen before updateDerived, so canopy would read the moved position. This is consistent within the tick. A05 is Medium, so this does not arise today.
- Wave 11: snapshot.ts still shows settings.warmth. Use localWarmthAt / moistureAt / lightFactors.
- During my mutant runs (about 20:03–20:06 UTC), src/sim/suitability.ts and climate.ts were briefly mutated in the shared tree, then restored. If barrier-movement saw an odd warmth or suitability failure in that window, a re-run clears it.

## Bugs noticed elsewhere
None.
