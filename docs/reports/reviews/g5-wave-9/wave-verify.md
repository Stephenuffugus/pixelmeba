# Wave g5-wave-9 verification (adversarial)

Verifier: wave verifier 0. Scope: climate-stage2 and barrier-movement, uncommitted in one working tree. I edited no tracked file. Mutants ran in an isolated copy (tmp/verify-g5-wave-9-0/mut, driven by tmp/verify-g5-wave-9-0/mutants.py) and were reverted after each run.

**Result: ok = false.** There are two MAJOR problems. Both are test-suite problems, not simulation-rule problems, and each is a one-line fix.

## Problems (most severe first)

1. **MAJOR [climate-stage2] tests/sim/climate-determinism.test.ts:139 — the closed-lid conservation test has no explicit timeout, and it runs past the 120 s default under normal suite load.**
   - Repro: `npx vitest run` with the 5 climate files, the 4 barrier files, barriers-table and world-stores-5 (11 files on 2 CPUs) → "Error: Test timed out in 120000ms" after 130,016 ms. Its own assertions passed: worst relative C error 1.556e-14, N 6.308e-14.
   - Run with only one other file, the same test took 85,166 ms. `npm run check` runs every unit file, so it will be red or flaky.
   - The house convention is an explicit limit: tests/fixtures/conservation-closed-lid.test.ts:61 uses `}, 600_000);` and barrier-determinism uses 300_000.
   - Fix: add `}, 600_000);` to this test. The 48.7 s save/reload test and the 30.7 s NEUTRAL test should get explicit limits too.

2. **MAJOR [lead] tests/sim/world-stores-5.test.ts:233 — this test now fails, so the build is not green until it is changed.**
   - It fails with `expected 0.5079943373879735 to be 0.75`. The world records 'climate' and holds an S09 that is On, so the warmth array must now relax and diffuse. The test's premise ("stores are carried, not read") no longer holds for climate.
   - Both builders reported it honestly. Neither owns the file, and both "Done when" lists said it must pass unchanged, so the assignment contradicted itself.
   - The 4× = 1× hash check in the same test still passes.
   - Fix (the builder's proposal, which I support): replace line 233 with a 1× vs 4× comparison of the two warmth arrays, and retitle the describe.

3. **MINOR [climate-stage2] tests/sim/climate-warmth.test.ts, climate-determinism.test.ts — no test checks the value the warmth array starts at.**
   - Mutant `warm_fill_half`: `new Float64Array(CELL_COUNT).fill(0.5)` in place of `.fill(world.settings.warmth)` (climate.ts:360) → both files pass (17/17).
   - In a dish whose ambient is not 0.5, turning a heater On would move every cell's suitability. Assignment item 4 requires the array to be filled with settings.warmth. The code does this; no test pins it.
   - Fix: a test that sets settings.warmth = 0.62, turns a heater On, steps once, and checks a far cell === 0.62.

4. **MINOR [climate-stage2] tests/sim/climate-moisture.test.ts — sediment drying is never exercised.**
   - Mutant `dry_gel_only` (drying skips every cell that is not gel, at climate.ts:420) → 11/11 pass.
   - GEL_COLONY holds no sediment, and SPEC §4.8 says "uncovered gel/sediment cells lose 0.001/s".
   - Fix: one sediment cell in the drying test.

5. **MINOR [barrier-movement] src/parasites.ts:177 (nearestHost edge skip) and src/sim/edgePassage.ts:226 (segmentPermitted corner rule) — neither is covered by any test.**
   - Mutant `nearest_host_no_seg` (the line removed) → barrier-contacts and barrier-movement pass, 20/20.
   - Mutant `seg_no_corner` (the corner rule removed from segmentPermitted) → 20/20 pass.
   - Assignment item 5 names nearestHost explicitly. The builder's mutant table covers prey acquisition and the target cancel, but not the parasite host search.
   - What still holds without the check: attachParasites still refuses the contact, so isolation does not leak. What is lost: a free X01 would press against a membrane forever.
   - Fix: a free X01 with its only host behind S01 never moves toward it, plus a diagonal-corner prey target.

6. **MINOR [barrier-movement] src/sim/edgePassage.ts:243 shelterRefuses — the per-species rule refuses P06, which is always Fixed when introduced (attached).**
   - P06 is consumer + transportClass 'fixed', so freeClassOfSpecies gives 'medium'. canOccupy therefore refuses P06 on a stone-edge water cell that holds an S05.
   - D-0113 says "Small and Fixed organisms are unaffected". CT §5.3 lists "attached P06" as Fixed.
   - The test "canOccupy … admits Small and Fixed ones in a shelter cell" (barrier-placement.test.ts:179) checks no Fixed species at all.
   - Lead call: accept and record it in D-0113's follow-up, or exempt attachment species in shelterRefuses.

7. **MINOR [lead] src/worker/snapshot.ts:538 — the inspector's suitability warmth factor still computes `response(world.settings.warmth, …)`, while suitabilityAt now reads local warmth.**
   - Once a heater allocates the array, the displayed factor no longer traces to the value the simulation used.
   - Nothing is enabled yet, so no player can see it. It must land with wave 11's inspector (localWarmthAt / moistureAt / lightFactors). The builder flagged it.

8. **MINOR [lead] src/sim/sample.ts:445 — sample release checks habitatCompatible, not canOccupy, and does not check edges.**
   - A released P01 can land in a shelter cell or across a membrane. The builder flagged it. It is outside barrier-movement's ownership, so it is wave 10 work.

9. **NOTE [lead] classOf and born B02/B13/P06.**
   - commitDivision never sets FLAG.attached, so these daughters get the wrong class. D-0114 already rules on it, and the fix is planned for wave 9 integration (barriers.ts plus the barriers-table pin).
   - placementClassOf (edgePassage.ts:123) works around it for placement only. Contacts still use classOf.

10. **NOTE [climate-stage2] mutant runs in the shared tree.**
    - The builder ran its mutants by editing suitability.ts and climate.ts in the shared tree, about 20:03–20:06 UTC, and reverted them. The assignment said "run each by hand, revert", so this was allowed.
    - I read the final climate.ts in full and the suitability.ts diff, and found no residue. barrier-movement used an isolated copy.

11. **NOTE [climate-stage2] repaint behaviour.** moistureOnRepaint acts only when the substrate actually changes. This deviates from the literal item 6, but it is a reasonable PROPOSED DECISION (painting cannot be used to re-wet for free) and is tested.

## Verified OK

- **FENCE:** `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts` → "Test Files 8 passed (8), Tests 62 passed (62)", in 670 s.
- **New tests:** the 5 climate and 4 barrier files, run with barriers-table and world-stores-5 → 108 passed, 2 failed. The failures are problems 1 and 2. In a verbose run of climate-determinism + barrier-determinism alone, all 10 tests pass. In a verbose run of barrier-movement, barrier-placement, barrier-contacts and climate-warmth, all 43 tests pass, and the slowest barrier test takes 12.9 s, well within its 60 s limit.
- **Unchanged suites:** both tasks' "pass unchanged" lists (12 sim files, 21 fixtures, phase5-import, migration-schema5 and helpers/registry) → "Test Files 36 passed (36), Tests 423 passed (423)".
- **tsc and eslint:** `npx tsc -p tsconfig.json --noEmit` exits 0. `npx eslint` on all 17 changed files and the 9 new test files exits 0.
- **Builders' mutants re-confirmed by me:**
  - `repaint_noop` → caught by the climate-moisture paintSubstrate test.
  - `lf_tick_now` (lightFactors at world.tick) → caught by climate-light "lightFactors(w, c).effective === derived.light[c]".
  - `host_only_para_cls` (attachParasites checks only the parasite's class) → caught by barrier-contacts "X01 next to A01 across S01 and across S02".
- **Numbers against the docs:**
  - CT §12.2 "cycle 240 s (90/30/90/30), night 0.05 · canopy 1/(1 + ΣA05 B/10) · warmth relax 1 %/tick to 0.50, diffuse 0.05, device ±0.01/s · moisture: water 1, gel/sediment 0.8, drying −0.001/s to 0.1, wetting 0.9, wick → 0.8 at 0.01/s" matches constants.ts:130–151 and the per-tick amounts (rate × DT) at climate.ts:68–70.
  - SPEC §4.4: effectiveLight (climate.ts:126) is clamp(clamp(base × cycle) × shade × roof × canopy).
  - CT §4: S11 is × 0.25 and stops drying.
- **Fast path:** a world that is lightNeutral keeps the v1.0 updateDerived fast path. The branch body is byte for byte the same (transport.ts diff). The NEUTRAL tests in both determinism files pass, with byte-identical entity columns, fields, derived light and moisture, and the 'full' digest.
- **Light convention:**
  - Stage 2 passes world.tick (transport.ts:436). Every other caller defaults to max(tick − 1, cycleStartTick) (climate.ts:116). world.tick is incremented only after stage 10 (tick.ts:45).
  - The only callers of updateDerived are commands.ts:102, sample.ts:352, recipes.ts:641, serialize.ts:342 and experiments.ts:460.
  - The readers of derived.light are intake.ts:180 (stage 6), lightSeeker.ts (stage 4), dormancy.ts:58 and snapshot.ts. derived.moisture is read by suitability.ts:96 and dormancy.ts:42. No stage 1 path reads light. Moisture is rebuilt exactly from the saved array, so a reload cannot change the hash.
- **Gating:**
  - The climate step checks worldHasSystem('climate'). The roof checks a recorded S11. Canopy needs a CANOPY species in world.species, which holds only the enabled species (recipes.ts:54).
  - Edge, shelter and mesh checks are gated on world.edges.length or world.devices.length.
  - The import refuses climate arrays, cycle mode and drying without 'climate' (phase5State.ts:139–145).
  - No rule is gated on a build constant.
- **Determinism hygiene:**
  - No Math.random, Date, Map/Set or object-key iteration in the new sim code. The WeakMaps are lookup only. The wick scratch is reset after each use.
  - No new saved state, no schema change, no hard-coded hash literals. No manifest, content or version-field edits (git status shows no content/ changes).
- **Ownership:**
  - climate-stage2 touched only its owned files.
  - barrier-movement touched only its owned files. Its barriers.ts change only extracts freeClassOfSpecies, with the same logic, and barriers-table passes. tests/helpers/world.ts gained helpers only.
- **Conservation:** climate conservation over 10,000 closed-lid ticks has relative error ≤ 6.3e-14 and absolute ≤ 1.1e-10. barrier-determinism conservation passes in 35.7 s. Heat and moisture move no material, and wetCells leaves every field and the ledger byte-equal (tested).
- **IMPLEMENTED_NATIVE_ABILITIES:** 'CANOPY' is appended in sorted order. The only test that pins the list (tests/helpers/registry.test.ts:19–29) uses a mock list, so it is not affected.
- **Window fast path (barrier-movement):** a straight trace between two cells of the decision window stays inside the rectangle they span. Marks on both cells of every refusing edge therefore force the full trace for any rectangle that contains such an edge. With no edges the prefix sums equal WIN_BLOCKED exactly (movement.ts:318). The leak fixture covers it.
- **Player-facing copy:** neither task changed UI code or strings. E2E was not needed, and port 4390 was not used.
