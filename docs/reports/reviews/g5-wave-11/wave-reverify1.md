# Wave 11 re-verification 1 (region-charts-gates fix round 1)

Adversarial re-verifier, 2026-10-14. The tree is f51e912 plus wave 11's uncommitted work and fix round 1.
Scratch is in tmp/reverify1-g5-wave-11/: the repro script, three load-time mutant copies under mut/, a mutant vitest config, and fence.log.
I edited no tracked file except this report.

Verdict: ok = true. Both problems are fixed, and nothing at BLOCKER or MAJOR remains. One new MINOR is listed below; it is the same kind of problem as the original MAJOR, but in a world that is not v1.0.

## Problems, most severe first

1. MINOR [region-charts-gates] src/worker/probes.ts:116 `listedDecayingFields` (names in src/ui/strings/observe.ts:199, :201)
   - **What is wrong:** fix 1 gates only the phage pools on their species: v01 needs V01 recorded and v02 needs V02. Two other pools are also named after unreleased content:
     - sGlow is shown as "Lantern signal". Lantern is B09, which is not in content/manifest.json.
     - rival is shown as "Rivalry extract", the name of material M08, which is also not in the manifest.
   - **When it shows:** a world that records 'barriers' plus 'signals' or 'rivalry', but not B09 or M08, lists those names. The fixer's own D-0119 fix 1 note says the inhibitors, enzymes, breaker and Pinphage will be listed after the systems flip. "Lantern signal" and "Rivalry extract" would be listed too.
   - **Where it does not show:** no shipped manifest records signals or rivalry today, so no v1.0 screen is affected.
   - **Repro:** the test world `wideRegistry()` in tests/worker/probes-gates.test.ts records signals and rivalry but not B09 or M08. Its reading lists sGlow and rival (the test asserts both, line 226).
   - **Fix:** either apply the same rule to these two pools (sGlow needs B09 recorded; rival needs M08 or the rivalry species), or give them names that do not refer to content. Both options tie into verifier NIT 11, which asks for one name per field across observe.ts, structures.ts and GateSheet.

## Verified OK

- **Original MAJOR (v1.0 dish lists decaying pools, Lacephage among them) is fixed.**
  - **Repro on the current tree:** tmp/reverify1-g5-wave-11/v1probe.ts is the verifier's script, run on FIRST_DISH_V1 with seed 104729. The non-absent rows are now:
    - Sugar, Broth and Salt: measured.
    - Starch, Debris, Oil and Protein: notMeasured.
    - Oxygen and CO2: notMeasured, why 'gas' (the lid is open).
    - Silicate: absent.
    - No inhibitor, enzyme, breaker, Pinphage or Lacephage row appears, and gates is [].
  - **The rule reads the world's recorded manifest, not a build constant.**
    - `listedDecayingFields` returns [] unless `worldHasSystem` finds 'barriers' or 'devices'.
    - `worldHasSystem` and `worldHasSpecies` read `world.content.manifest` (src/sim/gates.ts:18, :23), and so does the V01/V02 species check.
    - Field allocation backs this up: sGlow and quencher come only from the 'signals' system and rival only from 'rivalry' (src/sim/fields.ts:122–124). Having one of those fields therefore means the world recorded the system.
  - **The test is no longer relaxed.** tests/worker/probes-gates.test.ts "a v1.0 dish reads as before" deep-equals the whole boundary list: the HEAD golden plus `{salt, measured, 0}` and `{silicate, absent, 0}`. `rest` must equal the golden's other keys.
  - **Load-time mutant, old rule** (no system gate, no species check; probes-all.ts, aliased in by tmp/reverify1-g5-wave-11/vitest.mut.config.ts): 3 tests fail:
    - "salt and silicate are measured…"
    - "the phage pools are listed only where the dish records the phage"
    - "a v1.0 dish reads as before"
  - **Load-time mutant, the v02 species check removed** (probes-nophage.ts): 2 tests fail, "salt and silicate…" and "the phage pools…".
- **Original MINOR (gateSince "Since the dish began") is fixed.**
  - strings/observe.ts:159 now reads "Measured since each of these edges was placed: <list>".
  - The wording is accurate:
    - Edge ids come from the monotonic `counters.nextDeviceId` (src/sim/structureEdits.ts:297), so a re-placed edge starts a new tally.
    - WORLD_GATES and the sheet sum only the current edges (objectives.ts:142–163; `gateGroups`).
  - ProbeCharts.tsx renders this sentence under the per-kind heading with its edge count (line 161), which matches the gate sheet's "Measured since this barrier was placed".
  - **Load-time mutant, the old string** (observe-old.ts): tests/ui/probe-charts.test.ts "crossings and gates" fails with "expected 'Since the dish began: Sugar 3.00' to be 'Measured since each of these edges wa…'".
- **Unit suites:** I ran probes-gates, probes-crossings, gate-reading, probe-charts, probes, goals-host, challenge-host, relationship-map, sim/objectives and ui/observe together. Result: Test Files 10 passed (10), Tests 91 passed (91).
- **FENCE, run by me:**
  - Command: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts`
  - Result: Test Files 8 passed (8), Tests 62 passed (62), 491 s, exit 0.
- **Typecheck and lint:** `npx tsc -p tsconfig.json --noEmit` exits 0. `npx eslint` on the 6 files fix round 1 changed exits 0.
- **Ownership:** every file fix round 1 touched is in region-charts-gates' ownership: probes.ts, strings/observe.ts, ProbeCharts.tsx, probes-gates.test.ts, probe-charts.test.ts, region-charts.spec.ts and its own report. No stage 1 or structure-ui file was touched by the fix.
- **Not re-run by me:** the e2e journeys. The fix changes only one string and the list of decaying rows, and I suspected no UI problem that a browser was needed to prove. The fixer reports region-charts passing on desktop and phone-portrait, and observe and observe-tools passing on desktop. Observe and observe-tools were not re-run on phone-portrait in round 1.
- **Owner or lead follow-ups that remain open from wave-verify-2:**
  - MAJOR [lead] edgeSnap comb.
  - MINORs 3, 4, 5, 7 and 8.
  - NITs 9–13.
  - They are outside this round's two problems and were not re-checked here.
