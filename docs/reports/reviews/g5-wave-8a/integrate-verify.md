# Wave 8a · adversarial verification of the lead's integration edits

Verifier: integrate-verify, 2026-10-13. I edited no tracked file and none of the lead's files. My scratch files are in tmp/verify-int-8a/ (probe.test.ts, vitest.config.ts, mutants.log, run.log, md5-before.txt).

**Verdict: ok = false.** There is one MAJOR problem: a wrong fact in a canonical doc (E14's phase). No save that the game writes is refused. Every new refusal has a test that fails without it. The fence and the corpora are untouched.

I had no copy of the builder's version to diff against. The wip/g5-wave-8a backups (f729e80, f1f8f4c) already contain the lead's edits. So for "the builder version" I used the verifier reports' quotes, together with file mtimes.

## Problems (most severe first)

- MAJOR [docs] docs/DECISIONS.md:1494 and docs/agent/g5-plan.md:150 — these say E14, the dispersal module, is "Phase 6" (D-0108: "E14 (CT D503, Phase 6)"; the carry-over is headed "Phase 6 (E14 dispersal)"). E14 is Phase 7.
  - Evidence: CONTENT_TABLES §7.1 row E14 is Phase 7 (docs/CONTENT_TABLES.md:350). D503 is in CT §10.4, "Living-behavior fixtures … Phase 7" (:501, :506). SPEC §7.13 says "(E13 Settler, E14 Dispersing offspring; Phase 7)" (docs/PIXELMEBA_IMPLEMENTATION_SPEC.md:497, :687). BUILD_DIRECTIVE has "P7.2 Life stages E13, E14" (:772), and WORKLOG has "P7.2" (:102).
  - Fix: write "Phase 7 (P7.2)" in both places.
- MINOR [docs] docs/agent/g5-plan.md:136-150 — the carry-overs route only the two state rules the lead added (glow while not Active, trap reserve). They do not route the other import invariants that waves 9-13 must keep, or their own saves are refused.
  - (a) The glow stage must never set glowState 1 on a non-Active organism. The carry-over only says to clear glow when an organism leaves Active (phase5State.ts:51).
  - (b) Waking must clear FLAG.restNewborn (phase5State.ts:70, "An active organism is marked as a resting newborn").
  - (c) Death, release and capture must keep both trap pairs mutual, and must clear trapBirthId and heldByBirthId together with their slots (phase5State.ts:63-64, :178-188).
  - (d) Climate values must stay inside [0, 1] (phase5State.ts:91).
  - (e) Leaving cycle mode must delete settings.cycleStartTick, not keep it (phase5State.ts:150).
  - (f) gateTally must stay sorted by id with ids below nextDeviceId (phase5State.ts:104-105).
  - The wave-11 line's "resting newborns" case cannot arise today: F04 cannot glow, and B09 has no RESTING_DAUGHTER.
  - Fix: add one general carry-over: "every wave that writes a schema 5 column, store or setting adds a saveFile round trip (buildSaveFile → loadSaveFile) at each state transition it writes (enter, exit, death, sample), and keeps phase5State.ts's invariants".
- MINOR [docs/code comment] docs/ARCHITECTURE.md:505 and tools/art-build.ts:42-43 (with :46 and :51) — these state as fact that 2048 px is "the WebGL limit on low-end Android". Nothing in the repo measures or sources that.
  - g5-plan.md:124 (Risks) says "Check the WebGL limit on low-end Android". The art-build comment cites "ARCH §10.1" as its source, and the only statement in §10.1 is the lead's new block, so the citation is circular.
  - Fix: say "the cap we assume (to be checked on a low-end device at art-large or perf, g5-plan Risks)" until it is measured.
- NIT [docs] docs/DECISIONS.md:1521 — "a crafted schema 4 state that carries Phase 5 keys loads with them dropped" is only true of the stores and the counter.
  - The 4 → 5 step (serialize.ts, `if (v === 5)`) overwrites edges, devices, climate, gateTally and nextDeviceId.
  - It keeps Phase 5 entity columns (`if (columns[name]) continue;`) and settings.cycleStartTick. phase5StateProblem then checks those, so they are refused if wrong, not dropped.
  - Fix: write "Phase 5 stores (edges, devices, climate, gateTally, nextDeviceId)".
- NIT [docs] docs/DECISIONS.md:1492 — the text names the edge-code arrays "edgeR, edgeD". The code names them `r` and `d` in `EdgeCodeArrays` (src/sim/barriers.ts:145-156). The ARCH §5 block has the right names.
- NIT [docs] docs/DECISIONS.md:1534 — "about 2 px outside a 12 px body" is not what the code draws. The halo is drawn at 6 ≤ r < 8 from the centre (art/src/layers/modules.ts:253-254), so it is a 2 px deep ring that starts at the 12 px body's edge.
- NIT [sentences] src/sim/devices.ts:75, :76, :99 — three device sentences still build "A ${kind} device …", which renders as "A S09 device is neither on nor off.", with the same article problem the lead fixed in :66.
  - D-0108 (:1512) says the sentences now read "of kind S01". That is true only of barriers.ts:194 and devices.ts:66.
  - No test pins the device sentence at devices.ts:66; only the edge sentence is tested (phase5-import.test.ts:212).

## Verified OK

- VERIFIED OK [saves] — no writer can produce a state that the new refusals reject.
  - Every path that builds a world state goes through serializeWorld:
    - buildSaveFile and withoutPlayerNames (saveFile.ts:183-245)
    - host.ts: autosave, keep and branch at :1002, :2113, :1450; undo and checkpoint at :783 and :924
    - comparison.ts:116 (What if? / compare)
    - variantPair.ts:154-155 (Garden variants)
    - experiments.ts:568
    - tryDish.ts:100 (Try my dish: the loaded state plus a worldId)
    - challenge.ts:234 (it replaces only the notebook; the state is untouched)
  - serializeWorld always writes edges, devices and gateTally as arrays, and climate as exactly {warmth, moisture} with each value an encoded array or null (serialize.ts serializeWorld).
  - createEmptyWorld sets nextDeviceId 1 and nextObjectId 1 (world.ts). The 4 → 5 migration adds the stores and nextDeviceId 1.
  - A grep of src/ and tools/ finds no other writer of climate, gateTally, nextDeviceId or nextObjectId.
  - No simulation code writes glowState, the trap columns or the reserve yet. The only non-test writers are the slot alloc/free paths, which write empty values.
- VERIFIED OK [saves] — the corpora and the migration chain still load.
  - Command: `npx vitest run tests/persistence/phase5-import.test.ts tests/persistence/migration-schema5.test.ts tests/persistence/migration.test.ts tests/tools/fence-update.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/g2-replay.test.ts`
  - Result: Test Files 6 passed (6), Tests 89 passed (89), 284.8 s.
- VERIFIED OK [tests] — each new refusal fails its test on its own. I ran 11 load-time mutants. Each one removes a single check through a vite `transform` in tmp/verify-int-8a/vitest.config.ts, which throws if its pattern is missing. The probe file is a copy of phase5-import.test.ts plus one `it` per sub-case of the store/counter test. Results (tmp/verify-int-8a/mutants.log):
  - glow → "glowing while not active" fails (1 test).
  - reserve → "a trap reserve (carbon)" and "(nutrient)" fail (2 tests).
  - self → "a trap holding itself" fails (1 test).
  - The store/counter test fails under each of the 8 null/shape mutants, and so does that mutant's own split probe:
    - devnull (also the probe on a dish with no structures, the real shape of the bug; 3 tests)
    - edgesnull, devicesnull, tallynull
    - climatenull, climatearray, climatekeys
    - objnull (the saveFile.ts nextObjectId mutant)
  - With no mutant, all 51 probe tests pass. Among them: absent stores and counters load, `climate: {}` loads, and a −0 trapReserveC loads.
- VERIFIED OK [order] — each case gets the intended sentence.
  - A reserve on a non-TRAP organism gets "cannot trap" first. A negative reserve gets "negative" before "does not count yet".
  - A glowing organism that cannot glow gets "cannot glow" before "not active".
  - A self-trap gets "A trap holds itself." before the pair checks. Without that check the pair checks pass, which the self mutant confirmed.
  - Every refusal goes through saveFile.ts:437 (phase5) or the phase3 path, as `fail('integrity', … + ' Nothing was loaded.')`. expectRefused asserts kind 'integrity' and the suffix for every case.
- VERIFIED OK [hash/fence] — the edits are import-only.
  - The tracked src/sim files (serialize, world, entities, gates, content/registry) all have mtimes 13:01-13:15. That is before wave-verify.md (13:53), so the lead did not touch them.
  - The lead's src/sim edits are barriers.ts:194 and devices.ts:66 (mtime 14:26), refusal strings only. The rest of each file matches what the verifier reports quote, but there was no builder copy to diff against.
  - The md5 of tests/fixtures/saves-rc1/expected.json, tests/fixtures/fence.json and tests/fixtures/saves/expected.json is the same before and after my runs (`md5sum -c` OK). `git status tests/fixtures` is clean.
- VERIFIED OK [fence-update] — the two new --rc1 success tests write only temp copies, and they exercise main()'s measuring path.
  - Setup: rc1ExpectedPath, fencePath and decisionsPath are mkdtemp copies (fence-update.test.ts:218-226). `--saves` defaults to the committed corpus, read only.
  - main() loads each save through measureRc1Save → loadSaveFile (tools/fence-update.ts:253-263) and writes only paths.expected.
  - The stale-value test replaces hashAtLoad with zeros. It passes only if the measured value equals the committed one, with changedBy naming that save. The unchanged-values test also asserts that RC1_EXPECTED_PATH and the fence copy are unchanged.
- VERIFIED OK [docs] — the facts I checked in D-0108, D-0109 and the three ARCH blocks match the code and reports. The exceptions are listed above.
  - Schema and columns: the 25-name COLUMNS_ADDED_IN[4] literal and the 12 schema 5 names; −1 empties; FLAG.restNewborn is bit 14.
  - Stores: both lists are sorted; `on` only on S09 and S10; devices only on ST_NONE.
  - classOf rules (a)-(f), and the E04 rule (anchor never sets FLAG.attached).
  - hashedSample uses Object.is.
  - NATIVE_ABILITY_FRAMES gives dormant and trap 3 frames each; NATIVE_MARKS maps SIGNAL_GLOW → glow_center and MIXOTROPHY → mode_half.
  - P08 natively has DORMANCY and has no sprite yet.
  - Colours: traplaceSlack #A88A5C and loop #6B4A12. jacket_rim reaches at most 130° from West, so the leading ±50° stays bare.
  - Evidence numbers match the reports: 1342 frames, 856 frames unchanged, contentHash b8ddc0dd…, 19 species enabled, 11 files / 531 tests, 16 files / 172 tests, 7 files / 58 tests.
  - suitability.ts:80 reads settings.warmth only. CELL_COUNT is 16384. gates.ts has worldHasSystem and worldHasStructure. src/sim/sample.ts REF_COLUMNS exists.
  - The ATLAS_W comment matches the current sheet (1024×1024, 13 small sprites, 3 marks).
- VERIFIED OK [lint] — `npx eslint` on the 7 lead-edited source and test files exits 0.

## Lead resolution (2026-10-13)

- MAJOR E14 phase: fixed. D-0108 and g5-plan.md now say Phase 7 (P7.2; CT §7.1).
- MINOR carry-overs: fixed. g5-plan.md "Carry-overs" opens with a general item: every wave that writes a schema 5 column or store adds a buildSaveFile → loadSaveFile round trip at each state transition it writes. It lists the six import invariants (a)–(f).
- MINOR 2048 px cap: fixed. ARCH §10.1, D-0109 and tools/art-build.ts (comment and error message; art-p5 pins updated) now call it an assumed safe WebGL texture height, not yet measured on a device.
- NIT "Phase 5 keys": fixed in D-0108 ("Phase 5 stores"; columns and cycleStartTick are kept and checked).
- NIT edgeR/edgeD: fixed in D-0108 (`edgeCodeArrays` → `r`, `d`).
- NIT halo: fixed in D-0109 (6 ≤ r < 8 px, a 2 px deep ring starting at the body's edge).
- NIT sentences: fixed. devices.ts says "A device of kind S09 …" and barriers.ts "An edge barrier of kind S01 …" everywhere. tests/sim/barriers-table.test.ts pins every one of these sentences in full, including devices.ts:66's.
