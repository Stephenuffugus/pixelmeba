# Wave g5-wave-9: re-verification, round 1 (adversarial)

Re-verifier 1 checked the climate-stage2 fixes from `climate-stage2-fix1.md` against the four problems in `wave-verify.md` that were assigned to the fixer.

- I edited no tracked file.
- Mutants ran in an isolated copy, `tmp/reverify1-g5-wave-9/mut`, driven by `tmp/reverify1-g5-wave-9/mutants.py`. Each one was reverted after its run. `diff -r mut/src src` shows no differences.
- Probes are in `tmp/reverify1-g5-wave-9/probe/`.
- No E2E run was needed (no screen changed). Port 4394 was not used.

**Result: ok = true.** All four problems are fixed, and I could not refute any of the fixes. One new MINOR problem: a mutant the assignment requires to be caught survives. Two NOTEs are carried over for the lead.

## Problems (most severe first)

1. **MINOR [climate-stage2] tests/sim/climate-cycle.test.ts:137–154 — no test catches the removal of the lightVersion reset.** The assignment lists this mutant as one that must be caught.
   - Mutant `no_lightversion_reset`: in `deriveClimateLight`, `if (perTick) tc.lightVersion = -1;` becomes `if (perTick) { }`. Result: climate-cycle passes 8/8.
   - Why the test misses it: the test bumps `grid.geometryVersion` at line 141, after the fast path already cached the light. The fast path then recomputes on leaving the cycle whether or not the reset exists.
   - The mechanism itself is real. My probe, `tmp/reverify1-g5-wave-9/mut/tests/sim/zz-reset-probe.test.ts`, has no geometryVersion bump. It goes fixed, steps, switches to cycle, runs 1,500 ticks, switches back to fixed, and runs 1 tick.
     - With the mutant: `expected 0.04000000000000001 to be 0.8`. Light is stuck at the night value, and a reload would compute it fresh.
     - With the real code: the probe passes.
   - The build report (`climate-stage2-build.md:106`, "M8 … → 'leaving the cycle at night' fails") does not reproduce against the current tree.
   - Fix: in that test, call `run(w, 1)` after the shade bump and before `setLightMode(w, 'cycle')`, with no geometryVersion bump after that point. Alternatively, add the probe's sequence as its own test.

2. **NOTE [lead] tests/sim/world-stores-5.test.ts:233 still fails, as already known.**
   - The failure: `AssertionError: expected 0.5079943373879735 to be 0.75`, in my 11-file run.
   - This is wave-verify problem 2, already assigned to the lead and not to the fixers. The fixer's proposed replacement is in `climate-stage2-fix1.md`, under "Needs the lead".
   - `npm run check` stays red until the lead applies it at integration.

3. **NOTE [lead] the geometryVersion contract for in-place writers remains for the barrier caches.**
   - The climate caches no longer depend on it (problem 4 below).
   - `edgePassage.ts:86/101` and `attachment.ts:90` still key on `geometryVersion`. For edges they also use array identity and length. Their comments state the contract at `edgePassage.ts:8–9` and `attachment.ts:82`.
   - The suggested comments on `Device.cell` and `EdgeBarrier.open` were not added, because those files are not climate-stage2's.
   - Wave 10's structure-command tests should check that each command's result equals its reload.

## The four problems from wave-verify

- **VERIFIED OK — MAJOR [climate-stage2] explicit timeouts (climate-determinism.test.ts).**
  - Limits now in the file:
    - the conservation test ends `}, 600_000);` (:163);
    - the 1× = 4× test ends `}, 300_000);` (:91);
    - the save/reload test ends `}, 300_000);` (:109);
    - the paused-heater test ends `}, 300_000);` (:137);
    - the NEUTRAL test ends `}, 300_000);` (:192).
  - I re-ran the original repro: the 5 climate files, the 4 barrier files, barriers-table and world-stores-5, verbose, on 2 CPUs.
    - Every climate-determinism test passed. Conservation took 40.6 s, save/reload 23.9 s, paused heater 13.1 s and NEUTRAL 14.6 s.
    - The only failure was world-stores-5:233 (NOTE 2).
    - Totals: 113 passed, 1 failed, in 275 s.
  - The slowest climate test without an explicit limit is the moisture 7,000-tick test, at 12.8 s. That is well inside the 120 s default.

- **VERIFIED OK — MINOR [climate-stage2] the warmth array's starting value.**
  - New test: climate-warmth.test.ts:142, "the new array starts at settings.warmth (0.62 here)".
  - Load-time mutant `warm_fill_half` (`.fill(0.5)`): this test fails with `expected 0.5012 to be 0.62`. The other 13 tests pass.

- **VERIFIED OK — MINOR [climate-stage2] sediment drying.**
  - New test: climate-moisture.test.ts:131, on SEDIMENT_EDGE. It asserts that cells (64,100), (70,100) and (80,64) are sediment, so the test cannot pass on gel by accident.
  - Mutant `dry_gel_only` fails with `expected 0.8 to be 0.7700000000000033`.
  - A second mutant, `dry_skip_sediment_only` (drying skips sediment only), fails with the same message.

- **VERIFIED OK — MINOR [climate-stage2] stale caches after an in-place device or edge write.** The fix goes beyond documentation: the caches are now keyed on what the stores contain.
  - `roofCells` (climate.ts:181–205) compares the S11 cells, in device order, with `tc.roofKey` on every call.
  - `deriveClimateLight` recomputes on `tc.lightRoofStamp !== tc.roofStamp`.
  - `warmthCoefficients` compares the closed-shutter edge keys through `sameClosedShutters`.
  - Mutants:
    - `roof_old_key` (the exact old key, geometryVersion plus the devices array's identity): the in-place roof test fails, `expected 0.8 to be 0.2`.
    - `light_no_roofstamp`: 2 climate-light tests fail.
    - `warmth_no_shutter_key`: the in-place shutter test fails, `expected 0.5 to be greater than 0.5`.
  - I re-ran the original P3 repro on the current tree, plus five variants, using `deserializeWorld(serializeWorld(w))` and 200 more ticks. The cases:
    - an S11 pushed in place;
    - a roof's cell moved in place;
    - a roof spliced out;
    - the heater moved;
    - the wick moved;
    - a roof moved in place with the cycle on;
    - a closed S03 line added in place.
  - Every case gave the same light as the reload at every cell, 0 lightFactors mismatches, and the same stateHash after 200 ticks. The P3 cases had given DIVERGES before the fix.
  - Each comparison costs O(devices) or O(edges) per call, and it runs only when 'climate' or S11 is recorded.

## Other checks

- **VERIFIED OK — the fence is unchanged.**
  - Command: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts`.
  - Result: 8 files and 62 tests passed, in 341 s.

- **VERIFIED OK — the suites that must pass unchanged.**
  - Files:
    - tests/sim/{chemistry,transport,dormancy,attachment,lab-commands,tools};
    - tests/fixtures/{photosynthesis,dusk-suitability,habitat-presets,producers,film,module-e06,module-e07,transport-obstacles};
    - tests/persistence/{phase5-import,migration-schema5};
    - tests/helpers/registry.
  - Result: 17 files and 216 tests passed, in 202 s.

- **VERIFIED OK — tsc and eslint.**
  - `npx tsc -p tsconfig.json --noEmit` exits 0.
  - `npx eslint` on the 8 climate-owned source files and the 5 climate test files exits 0.

- **VERIFIED OK — core mutants from the assignment are still caught.**
  - `suit_settings_warmth` (suitability reads `settings.warmth` even when a warmth array exists): the SUIT_WARMTH test fails, `expected +0 to be 14`.
  - The exception is the lightVersion reset (problem 1).

- **VERIFIED OK — ownership.**
  - In this round the fixer changed only `src/sim/climate.ts`, `src/sim/transport.ts` (the TransportCache fields and their doc), the four climate test files and its own report. File modification times (21:24–21:29) match.
  - The git status shows the same set of files as at the start of the wave. No content, manifest or version-field edits.

- **VERIFIED OK — determinism hygiene in the new cache code.**
  - No `Math.random`, `Date`, or Map/Set/object-key iteration in climate.ts.
  - The keys are plain arrays walked in store order.
  - No hash literals appear in the tests.
  - Nothing new is saved or hashed: the cache fields live on TransportCache, which is derived.
