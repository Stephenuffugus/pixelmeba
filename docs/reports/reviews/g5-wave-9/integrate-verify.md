# Phase 5 wave 9: integration verification of the lead's edits

Verifier: adversarial integration verifier, 2026-10-13, on the lead's tree (builders' state = refs/lead/wave9-builders, 7980065; lead diff = tmp/lead/wave9-lead.diff).
The only file I changed in the repo is this report. I ran the probes and mutants in an out-of-tree copy (/tmp/claude-1000/iv9, with node_modules symlinked). I did not run `npm run check` or anything under tests/fixtures.

**Result:** the code edits are correct, I found no hash or save risk, and every new test catches its mutant. One MAJOR documentation error is left over from D-0114 in the wave 10 task file. There are several MINOR factual errors in the perf note, ARCH and comments.

## Findings

1. MAJOR [docs] docs/agent/g5-wave-10.tasks.js.txt:308 and :327 — The e3-resters prompt still contradicts D-0114 and D-0115.
   - :308 says "her placement uses her own class: pass it to the placement helpers in edgePassage.ts".
   - :327, the required fixture tests/fixtures/resting-daughter.test.ts, says "placement across an S02 (Small passes) is allowed".
   - D-0114 (DECISIONS.md:1636) states "g5-plan.md's carry-over and the wave 10 e3-resters prompt are corrected". Only :316 was corrected, so that statement is false.
   - tmp/lead/fill-wave10.py does not touch :308 or :327. It replaces only the `<lead:…>` placeholders and the :185 classOf summary.
   - Evidence: the code refuses this placement. fungi.ts:168 classes the parent with `classOf(world, i)`, which is 'fixed' for an Active F04 (barriers.ts rule (d)). pairPermitted(…, 'fixed', 'fixed') is refused by S02, because edgePermits allows only 'small' through S02 (barriers.ts:113).
   - So a builder following :327 writes a test that fails. They then either break D-0114 by passing the daughter's class, or report a false failure.
   - Fix:
     - :308: replace the parenthetical with "her placement stays under her parent's Fixed class (D-0114); waking re-checks attachability".
     - :327: "placement across any edge barrier (S02 included), a closed shutter or a channel never (20 seeds)".

2. MINOR [perf] docs/reports/perf-g5.md:42 — "512 edge barriers (nine vertical S01 lines …)" is wrong. The probe stops at 512 edges after five lines.
   - Evidence: I ran verticalLine over the probe's x list (tmp/barrier-perf/perf.ts:22-28) with `npx tsx`. Result: "total 512 x63:120/120 x40:110/110 x86:110/110 x30:100/100 x96:72/100".
   - That is four full lines plus 72 of the 100 edges at x = 96. The same error is in barrier-movement-build.md:42.
   - Fix: "five vertical lines (x = 63, 40, 86, 30 in full and 72 edges at x = 96), S02 on every fourth row".

3. MINOR [perf] docs/reports/perf-g5.md:56, docs/ARCHITECTURE.md:988, docs/DECISIONS.md:1688 — "about +0.3 to +0.5 ms per tick" in stage 4 understates the range.
   - Evidence: the four pairs in tmp/lead/perf-g5-wave9.txt give these stage 4 deltas:
     - 1.187 − 0.869 = 0.318
     - 1.154 − 0.784 = 0.370
     - 1.399 − 0.860 = **0.539**
     - 1.183 − 0.812 = 0.371
   - Fix: "+0.3 to +0.55 ms" (or "+0.3 to +0.54").
   - The stage 2 range is right: 0.936 − 0.690 = 0.246 and 0.911 − 0.808 = 0.103.

4. MINOR [perf] docs/reports/perf-g5.md:24, :26, :28; ARCHITECTURE.md:987; DECISIONS.md:1687 — "every climate rule live" overstates what probe (b) ran.
   - Probe (b) (tmp/climate-perf/perf.ts:42-56) has the cycle, drying, two S09 heaters On and four S11 roofs.
   - It has no S10 cooler and no S12 wick, so the wick loop never runs (climate.ts `worldHasStructure(world,'S12')`).
   - It has no CANOPY organism (only B01 and A01).
   - On clear water the drying pass changes no cell, because every water cell is skipped (climate.ts moistureStep).
   - Fix: "the cycle, drying (on clear water), two heaters and four roofs". Alternatively, add a wick, a cooler, gel cells and A05 to the probe.

5. MINOR [perf] docs/reports/perf-g5.md:33 — "Without the cycle, a living CANOPY organism or an S11, light stays on the v1.0 fast path" is inaccurate.
   - The fast path needs `lightNeutral` (climate.ts:215-217): no active cycle, no CANOPY species in world.species, and no S11 recorded in the manifest.
   - A world that records a CANOPY species with none alive, or records S11 with none placed, runs deriveClimateLight's keyed path instead. That path recomputes when geometryVersion or the roof cells change (climate.ts:240).
   - Fix: "Without the cycle, a recorded CANOPY species or a recorded S11, light stays on the v1.0 fast path. With a recorded CANOPY species but no living one, or a recorded S11, it is recomputed only when the geometry or the roof cells change."

6. MINOR [arch] docs/ARCHITECTURE.md:166-167 — "While the cycle runs or a CANOPY organism lives … leaving that state recomputes once on the fast path" is wrong for the canopy case.
   - When the last CANOPY organism dies, the world still records the CANOPY species. lightNeutral is therefore false, and the single recompute runs on deriveClimateLight's keyed path, not the v1.0 fast path.
   - The code comment says this correctly (climate.ts:222-223, "recomputes once on whichever path runs next").
   - Fix: "… recomputes once on the next path that runs (the fast path or the keyed path)".

7. MINOR [comment] src/sim/barriers.ts:33-34 (EdgeBarrier.open) — "edgePassage.ts and transport.ts cache per-cell edge codes on that version and the store's identity" names a cache that does not exist.
   - transport.ts holds no edge-code cache in wave 9. `transportCache()` keys kR/kD on geometryVersion alone and reads no edge. The only TransportCache field that depends on edges is climate's warmth coefficients, which compare the closed shutters by content (climate.ts:346-371).
   - Evidence: `grep -n "edges" src/sim/transport.ts` matches comments only.
   - The only edge-code cache keyed on version + identity + length is edgePassage.ts edgeCodesOf (:81-94).
   - Fix: "edgePassage.ts caches per-cell edge codes on that version and the store's identity and length (wave 10's barrier coefficients in transport.ts will too); climate.ts's caches compare content instead".

8. MINOR [claim of a check] docs/DECISIONS.md:1657 (D-0115 "the fence passes unchanged") and docs/reports/perf-g5.md:60-61 — No fence run on the integrated tree exists yet.
   - The fence runs in wave-verify.md, saves-verify-barrier-movement.md and saves-verify-climate-stage2.md were all on the builders' tree.
   - The lead's later edit changes `attachmentMask`, which every v1.0 world runs.
   - tmp/lead/check-9.log, started 22:18, still shows only "RUN v5.0.2" while I write this.
   - I believe the claim is true: with no devices the mask is `cellSurfaces` alone and the device loop is empty, byte for byte as before. It is still stated without evidence.
   - Fix: commit only once check-9 shows EXIT 0 (the fence is inside it), and cite that line. If the fence fails, this becomes a BLOCKER.

9. MINOR [plan] docs/agent/g5-plan.md:147 — "Done in wave 9 (D-0116): suitability reads the local warmth array when it exists" cites the wrong decision.
   - D-0116 says nothing about suitability's warmth. Its only mention of suitability is the shelter: "suitability uses habitatCompatible".
   - The fact is true (suitability.ts:80-82) and is recorded in ARCHITECTURE.md §5's new block (:160-161).
   - Fix: cite "ARCH §5 as built, wave 9", or add one line to D-0116.

10. MINOR [test comment] tests/sim/world-stores-5.test.ts:10 — The header still says "4× equals 1×: nothing reads the stores yet, so this proves only that they are carried."
    - That is now false: the climate stage reads warmth and the On heater, and canOccupy and edgePassage read the stores. The lead retitled the describe at :222 but not the header.
    - Fix: "4× equals 1× on a world whose warmth the climate stage evolves; the edge and device stores are carried unchanged".

11. MINOR [test comment] tests/sim/barriers-table.test.ts:4 — The header still says "rules (a)–(f) of classOf". The describe at :126 and barriers.ts now use (a)–(e). Fix: "(a)–(e)".

12. NOTE [test] tests/sim/barrier-placement.test.ts:194-216 (the P06/B02 shelter test) — Only the P06 assertion proves D-0115 here.
    - The B02 assertion `canOccupy(B02) === true` also passes under the wave 8a rule, where B02 was Small and Small passes a shelter.
    - B02's Fixed class is proven elsewhere: barriers-table :155 and the "over generations" placement test.
    - The test is not vacuous: mutants M1 and M6 below fail it through P06. No fix needed.

13. NOTE [code] src/sim/attachment.ts:86-87 — The v1.0 (no devices) early return now costs 4 comparisons instead of 2: the length test in the ternary, attachVersion, `attachMeshFrom === null` and `attachMeshLen === 0`. Before, it was version, then `devices.length === 0`.
    - It returns the same bytes: the device loop is empty, so the mask is cellSurfaces' alone.
    - The cost is negligible, but it is not "no more than two comparisons".

14. NOTE [comment] src/sim/attachment.ts:10-12 (file header) — It still says the mask "is rebuilt when that world's grid.geometryVersion moves". It is now also rebuilt when the device store's identity or length changes. The function doc (:74-80) and transport.ts:48-53 are correct.

15. NOTE [arch] docs/ARCHITECTURE.md:168 — "Climate's caches live on TransportCache" leaves out the CANOPY species flags. Those are a module WeakMap keyed on the world.species table (climate.ts:145-157; derived, never iterated, so they are harmless).

16. NOTE [decisions] docs/DECISIONS.md:1671 (D-0116) — The sentence "A writer that changes a device or a shutter in place without a bump cannot make a running dish diverge from its reload" holds only for the climate caches.
    - edgePassage.ts (edge codes, device kinds) and attachment.ts still need the bump. The same entry says so two bullets later.
    - Suggest "… cannot make the climate caches diverge".

17. NOTE [perf] docs/reports/perf-g5.md:30-32, :57-59 — Two explanations are reasoning, not measurement:
    - why (b) ends with fewer organisms ("about half the light");
    - "the cost is per mover … grows with the number of movers" (one population size, no profile).
    - The 0.55 average itself is right (see VERIFIED OK). Say "probably" or "not profiled".

18. NOTE [carry-over] saves-verify-barrier-movement.md problem 2 suggested "each command test should also check that the world still equals its reload after the command".
    - Wave 10 carries most of it:
      - structure-commands item 8, the geometryVersion bump;
      - structure-determinism's "save between two commands → load → continue equals uninterrupted";
      - the mutant "no geometryVersion bump in placeEdges".
    - What is missing is a per-kind reload-and-continue check for the in-place writers: moveDevice, setDevice/shutter toggle, removeStructures. Consider adding that to structure-determinism.

## VERIFIED OK

- **placementClassOf ≡ classOf for every parent.**
  - Placement runs only after `divisionBlocker` returns R.NONE (births.ts:144-147, then :187 for both findPlacement and fungalPlacement). divisionBlocker refuses any lifeState ≠ 0 (births.ts:75; LIFE_ACTIVE = 0, entities.ts:267). So rule (c), a resting newborn, can never apply to a parent.
  - Rule (a), the host class, never applies to an attachment species: hostSlot is set only on parasites, and X01 and X02 have `attachment: null`.
  - Every shipped record with transportClass 'fixed' has an attachment: B02, B13, F01–F04 and P06 (content/species/*.json). So the old category branch has no shipped case.
- **No other caller changes behaviour beyond D-0115's stated effects.** The callers are contacts.ts:76/87, parasites.ts:169/262/272, adhesion.ts:271/280, movement.ts:486, births.ts:108, fungi.ts:168, and shelterRefuses through canOccupy and crossing.ts:73.
  - B02, B13 and P06 all have speed 0, and movement skips them before classOf (movement.ts:471).
  - Small vs Fixed differs only at an S02. The only predators of B02 and B13 are P01 (Medium) and P04 (Large), which every barrier refuses anyway.
  - A born P06 as a predator was Medium and is now Fixed. Both are refused by every barrier and permitted by none or an open shutter.
  - No parasite hosts on them (X01 → A01, X02 → F02/F04).
  - E12 is not eligible for them (content/modules/E12.json eligibleAncestors).
  - V02 infection does not use classOf.
  - So contacts across S02 for a born B02 are unchanged for shipped content. The real changes are the ones D-0115 states: P06 is admitted to a shelter (B02 and B13 already were), and wave 10's S04 channel never carries a born colony member.
- **No hash path.**
  - Every classOf call is gated on `world.edges.length > 0` or edgesOn.
  - shelterRefuses is gated on `devices.length > 0` (movement.ts:69, crossing.ts:73).
  - freeClassOfSpecies is reached only through shelterRefuses (edgePassage.ts:239). A grep of src finds no other caller, and nothing in src/ui or src/worker.
  - `attachment` is a required, nullable schema field (schema.ts:87), and `SpeciesRT.attached = def.attachment !== null` (species.ts:81). So `def.attachment !== null` equals the old `.attached` test.
- **attachment.ts / transport.ts.**
  - TransportCache is built only by createCache (transport.ts:113-122, with the new fields initialised to null and 0).
  - A grep for attachVersion, attachMeshFrom and lightRoofStamp outside transport.ts, attachment.ts and climate.ts finds nothing.
  - world.derived is created per world (world.ts:240-244) and never spread or shared.
  - The new key is never staler than the old WeakMap. When the store is non-empty it compares the same identity and length. When it is empty it now also requires that the mask was built with no devices.
- **Comments on Device.cell.** edgePassage.ts deviceKindsOf (:96-114) and attachmentMask key on geometryVersion + identity + length. roofCells compares the S11 cells by content (climate.ts:187-209). `on` is read afresh in anyWarmthDeviceOn and warmthStep (climate.ts:333-335, :404-408), and no cache keys on it, so `on` needs no bump.
- **Mutants**, re-run by me in the out-of-tree copy (/tmp/claude-1000/iv9tools/mut.py), every one caught:
  - M1, the wave 8a rule in freeClassOfSpecies, run against barrier-placement, barriers-table, barrier-contacts and barrier-movement: "Tests 4 failed | 54 passed (58)". The failures are the generations test, the P06/B02 shelter test, the barriers-table (d) test and the freeClassOfSpecies test, which matches D-0115's "fails 4 tests".
  - M6, D-0114's rule (consumer Medium, else Fixed): "3 failed": the shelter test and the two barriers-table cases, as D-0115 says.
  - M5, the segmentPermitted corner rule removed: 1 failed ("expected true to be false"), on the first assertion, the edge off the Y-first walk.
  - M4, nearestHost's edge skip removed: 1 failed ("expected 0.0399… to be less than 0").
  - M3, the lightVersion reset removed: 1 failed ("expected 11304 to be +0").
  - M2, an emptied store returning the stale mask: 1 failed.
  - The tests are deterministic (fixed seeds, step/run only), so they are not flaky.
- **Changed test files pass** (copy of the lead's tree):
  - barriers-table: 23 passed
  - barrier-placement: 13 passed
  - barrier-contacts: 9 passed
  - climate-cycle: 8 passed
  - world-stores-5: 8 passed
- **Typecheck and lint.** `npx tsc -p tsconfig.json --noEmit` exits 0 (38 s). `npx eslint` exits 0 on each of the 12 changed src and test files.
- **perf-g5.md numbers.**
  - Every table cell, the load figures (0.84 before, 1.28 after) and "finished 22:15" match tmp/lead/perf-g5-wave9.txt (mtime 22:15:37).
  - The climate probe description is right: 400 founders, B01 and A01 alternating on a 20 × 20 grid 3 cells apart, sugar 0.05, 2,000 ticks, afterStage 1→2 timing.
  - The barrier probe description is right apart from finding 2: B01 with every tenth a P01, a 3-cell grid, sugar 0.3, seed 104729, 256 devices alternating S05/S06, order a, b, a, b, afterStage 3→4.
  - The builders' earlier numbers match their reports: climate-stage2-build.md:20-21 gives 1.204 and 1.594 ms, and barrier-movement-build.md:41-42 gives 0.92/1.53 and 1.98/2.55 ms.
- **The light average.** The cycle starts at tick 0 (setLightMode at realize), and stage 2 of tick T lights t = T for T = 0…1999:
  - day: 900 × 1;
  - dusk: Σ over p = 900…1199 of (1 − 0.95(p − 900)/300) = 157.975;
  - night: 800 × 0.05 = 40.
  - (900 + 157.975 + 40) / 2000 = 0.549, so "0.55 of day light" is right.
- **D-0115 facts.**
  - CT §5.3 rows (CONTENT_TABLES.md:286-289): Small lists "B02 disperser", Medium lists "P06 (free)", Fixed lists "attached P06".
  - D-0113 says "Small and Fixed organisms are unaffected" (the shelter bullet).
  - PREY_FREE treats every organism of an attached species as attached (movement.ts:159).
  - Wave 10's barrier-transport item 0 (tasks :204) is the same rule, placed after (c).
- **D-0116 builder rulings checked in code:**
  - setLightMode('cycle') is a no-op on a dish that already cycles;
  - moistureOnRepaint acts only when the substrate changes;
  - drying lowers only values above 0.1;
  - the wick is gated on S12;
  - the climate caches are content-keyed;
  - enterCell refuses a shelter to P04;
  - the corner over-block statement (barrier-movement-build.md:152).
- **ARCH §5 block, otherwise verified:**
  - lazy allocation (warmthStep, moistureStep, ensureMoisture);
  - readers never allocate;
  - suitability.ts:80-82;
  - the light-tick convention (transport.ts:376, :442; the updateDerived callers are commands, experiments, serialize, recipes and sample);
  - traceFraction's corner check (movement.ts:121);
  - the window marks (movement.ts:263, :307);
  - pairPermitted for claims, attachment, E12 and placement (births.ts:118, fungi.ts:181);
  - the classOf rule list.
- **Verifier items fixed or carried forward:**
  - wave-verify 1-6 and 9: fixed (fix1, reverify, D-0115).
  - wave-verify 7: carried at g5-plan:176.
  - wave-verify 8: carried at wave 10 item 13 and the new g5-plan carry-over.
  - wave-verify 11: in D-0116.
  - saves-verify-barrier 1: fixed by the mesh move.
  - saves-verify-barrier 2: the comments were added, and wave 10 item 8 carries the rest (see NOTE 18).
  - saves-verify-climate 1 and 2: fixed.
  - reverify 1: fixed (the M3 test).
  - reverify 2: fixed (world-stores-5).
  - reverify 3: the comments were added.
  - The builders' carry-overs (sample release, the founder chain, the inspector warmth) are in g5-plan.

## Lead resolution (2026-10-13)

- MAJOR wave 10 e3-resters prompt: fixed in docs/agent/g5-wave-10.tasks.js.txt. Its "Read" line now cites the carry-over as corrected by D-0114 and D-0115: her placement stays under her parent's Fixed class, and no edge barrier of any kind, S02 included, may stand between the parent's cell and hers. The resting-daughter fixture item now says placement never crosses any edge barrier, S02 included (20 seeds beside an S02 line, 20 beside an S01 line). D-0114's sentence "the wave 10 e3-resters prompt are corrected" is now true.
- MINOR perf-g5.md lines: the probe's 512 edges are S01 lines at x 63, 40, 86 and 30 in full plus the first 72 of x 96 (the lead recounted with verticalLine: 120 + 110 + 110 + 100 + 72). The builder's report keeps its own wording; perf-g5.md is the record.
- MINOR stage 4 range: now "+0.3 to +0.55 ms" in perf-g5.md, ARCH §13 and D-0116.
- MINOR "every climate rule live": now "the cycle, two heaters, four roofs and drying" everywhere. perf-g5.md says probe (b) has no cooler, wick or CANOPY organism, and that its drying pass changes no cell on clear water.
- MINOR fast-path wording (perf-g5.md): now "a recorded CANOPY species or a recorded S11".
- MINOR ARCH §5 "recomputes once on the fast path": now "on whichever path runs next (the keyed path while a CANOPY species or an S11 is recorded, else the fast path)".
- MINOR EdgeBarrier.open comment: now names edgePassage.ts only, and says climate's warmth coefficients compare the closed shutters' content.
- MINOR fence claim: npm run check on the integrated tree (tmp/lead/check-9.log) is the evidence; the commit message cites its EXIT line and the fence files.
- MINOR g5-plan.md:147 citation: D-0116 now has the bullet "Suitability reads the local warmth array when it exists, else settings.warmth".
- MINOR test headers: world-stores-5 says that since wave 9 warmth evolves, identically at 1× and 4×; barriers-table says rules (a)–(e).
- NOTEs: the shelter test's B02 line now says it passes under the wave 8a rule too, so P06 is D-0115's case. The attachment.ts header and ARCH §5 say that a replaced or emptied store rebuilds the mask. D-0116 says the content-keyed caches cannot diverge from a reload, while edgePassage.ts and the mesh still need the bump. Both perf explanations are marked as reasoning ("most likely … computed, not measured"; "expected to grow … not measured here"). The per-command reload test is added to wave 10's structure-determinism item: for each command kind, paused and queued, the world equals its reload and stays equal for 300 ticks.
