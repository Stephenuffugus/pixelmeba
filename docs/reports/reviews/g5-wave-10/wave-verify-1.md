# Wave 10 · verifier 1 · barrier-transport and structure-commands

Lens: rules, determinism, conservation, tests and player-facing truth. I edited no tracked file and ran no git write commands. Scratch files are in `tmp/verify-g5-wave-10-0/`. Mutants were applied at load time through a vitest transform plugin (`vitest.mutant.config.ts`, `mut.sh`), so no tracked file was touched.

**Overall: ok = false.** There is one MAJOR, owned by the lead: two wave 9 tests are red in the working tree. Both builders' patches for them are verified below. Neither task has a BLOCKER or MAJOR of its own.

## Problems (most severe first)

1. **MAJOR [lead]** `tests/sim/barrier-movement.test.ts:236` and `tests/sim/world-stores-5.test.ts:235` fail in the working tree, so `npm run check` is red until they are updated.
   - **Repro:** the regression run of both tasks' lists gave **Test Files 2 failed | 35 passed (37); Tests 2 failed | 485 passed (487)**. The two failures:
     - "S04 one-way channel edge (D-0106) > is closed to ordinary movement in both directions";
     - "4× equals 1×: run(400) and four run(100) …".
   - **Cause:** both are correct new behaviour, not regressions.
     - In the first test, the left B01 enters the channel's source column (x = 63, flow 1), and `channel.ts` correctly moves it to x = 64.
     - In the second, the world records 'barriers', so the gate tallies keep counting beyond the pinned `TALLY`.
   - **Fix:** apply barrier-transport's two patches (report §"Two wave 9 tests to update"). I applied each one at load time and both pass:
     - barrier-movement with `nextOrganismTick: 1_000_000_000`: 1 passed;
     - world-stores-5 with the monotone tally assertion plus `b.gateTally` equal to `a.gateTally`: 8 passed.
   - The import accepts `nextOrganismTick: 1e9`: `edgeStoreProblem` requires only an integer ≥ 0.
2. **MINOR [barrier-transport]** `src/sim/channel.ts:159-171`: four channel eligibility rules are implemented but no test pins them. Each mutant below survives, with `tests/sim/channel.test.ts` still 16/16 passed:
   - the E04 anchor rule is removed (`anchorState !== 0` dropped). SPEC l.642 says "Active anchored organisms cannot enter directed channels";
   - the held-by-trap rule is removed (`heldBySlot >= 0` dropped);
   - the fungal-link rule is removed (`fungalDegree === 0` dropped);
   - `destinationAccepts` always returns true, so the resting-newborn exemption and any refused destination are unpinned.

   The fungal and held mutants may be close to equivalent with shipped content: no Small organism carries a fungal link, and traps are not built yet. The anchor rule is reachable today, through a B01 carrying E04 that has anchored. Suggested test: an anchored E04 B01 at the source is never moved; once it rests (and so detaches) it is moved.
3. **MINOR [barrier-transport]** `src/sim/transport.ts` stageEnvironment: no test pins the tally's coefficient pair.
   - **Mutant:** `tallyFieldFlux(world, tc.gateEdges, id, arr, tc.kR, tc.kD, false)`, which ignores the viral pair, film and the half rate. It survives: `gate-tally.test.ts` + `barrier-transport-determinism.test.ts` gave 15/15 passed.
   - The only exact tally test uses sugar without film. The assignment asks for "the coefficient k the kernel will use (film-adjusted, the field's pair, × 0.5 when half)". The code does this, but nothing checks it.
   - **Suggested test:** v01 through an S02 line, eStarch through an S01 line, and sugar beside film. In each case the far side's gain equals the tally (relative 1e-12).
4. **NOTE [barrier-transport]** `src/sim/channel.ts:222 shifted`: the in-cell position is kept bit-for-bit only within one binade.
   - At a binade crossing, the sum is rounded by up to 1 ulp: x from 0.x→1.x, 1→2, 3→4, 7→8, 15→16, 31→32 or 63→64, and the same for y. Example: 63.7 + 1 = 64.7.
   - It is deterministic and hash-safe. The code comment says so, and PROPOSED DECISION 8 implies it.
   - The channel test uses X = 60→61, so it never meets this case. The lead may want to state it in the decision text, because the SPEC says "exact state retained".
5. **NOTE [lead]** PROPOSED DECISION 3 (barrier-transport): a host carrying a parasite is not eligible for the channel. SPEC §4.9 also says "A host and attached parasite move as one unit in the host's class". A reader could take that to make a Small host and its parasite one eligible Small unit.
   - No shipped host is Small (the channel test notes it), so this has no effect today.
   - Record the ruling in DECISIONS when the PROPOSED DECISIONs are adopted.
6. **NOTE [structure-commands]** `structureEdits.ts:360`: `removeStructures` returns the ids actually removed (ascending) in `ids`. The assignment said "ids given, ascending".
   - Ids that were not found are counted in `refused.missing`, so returning the removed ids is the more truthful choice and the docstring says so.
   - Wave 11 must read `ids` as "removed".
7. **NOTE [barrier-transport]** `gateTally.ts countCrossings`: the organism tally traces the straight segment from the start to the clamped end point. `movement.ts applyStep` clamps the end point to within EPS of the last valid cell.
   - Near an exact corner, that straight line can differ from the traced path by one edge. This touches only the tally (observation, never hashed).
   - Over 3,000 ticks, no S01 crossing appeared (test).

## VERIFIED OK

**Fence, test runs and code checks**
- **Fence unchanged:**
  - The command was `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts` together with all 11 new test files of both tasks.
  - Result: **Test Files 19 passed (19), Tests 212 passed (212)**, EXIT 0.
- **Regression lists of both tasks** (37 files): every file passes except the two in MAJOR 1. These all pass:
  - transport, barriers-table, chemistry, movement-births-tick, lab-commands, tools, links, fungal-links, objectives, view-switch and attachment;
  - all nine wave 9 files apart from barrier-movement's one test;
  - the fixtures: transport-obstacles, film, phage, conservation-all-pools, fungal-transport, producers, photosynthesis, food-objects, habitat-presets and module-e12;
  - the worker tests: host, challenge-host, sample-transaction and whatif;
  - the persistence tests: phase5-import and migration-schema5.
- **tsc and eslint:** `npx tsc -p tsconfig.json --noEmit` exit 0. `npx eslint` on all 26 changed or created source and test files of the two tasks: exit 0.
- **No determinism leaks or hash literals:**
  - There is no Math.random, Date, Map, Set or for-in in `channel.ts`, `resin.ts`, `gateTally.ts`, `structureEdits.ts` or `structurePreview.ts`.
  - No new test has a hard-coded hash literal.
  - The resin's `bound` and the export are summed in RESIN_TARGETS order, never in key order.

**barrier-transport**
- **Coefficients** (`transport.ts:184-254`):
  - The v1.0 loop and `Math.min(ki, kj)` are unchanged. Factors are applied only when `edges.length > 0`, and only on stored edges. An open S03 is skipped.
  - The viral pair is the same array as kR/kD unless an S01 exists.
  - The cache key is geometryVersion, plus the edges array's identity and length.
  - The film pair is computed after the factor. `diffuseField` is untouched.
  - The pair is chosen through `FIELD_DEFS[id].barrier === 'viral'`.
  - CT §5.3 factors (25 % / 50 % / blocked) match `edgeFactor` as used. CT §12.2 "channel 2 %/s pools, 1 Small/s · resin 0.05/s, cap 5" matches the constants.
- **Stage 2 order** matches SPEC §3.2 row 2: climate → diffusion (barrier-aware) → channel → gas → decays → film → resin → neutralize → derived.
- **v1.0 worlds stay inert:**
  - `channelStep` and `resinStep` return on an empty store or an unrecorded system, and the tallies need edges plus 'barriers'. The fence proves the bits are unchanged.
- **Channel:**
  - One snapshot is taken before any move. Requests are summed per (source cell, field). `subtractPool` is used for material fields (no ledger line unless roundoff). Viral fields carry `carbonPerUnit`, so moving them changes no total.
  - No multi-hop for pools or organisms: candidates are fixed before any move, and each candidate's current cell is rechecked.
  - The lowest birthId goes first.
  - `nextOrganismTick` is set only when an organism moves. It is saved and hashed (`serialize.ts:390` canonicalJson of edges), never bumps geometry, and is accepted by the import.
- **Resin:**
  - The budget is min(0.005, remaining). Removal is proportional, and the last target takes the exact remainder. The field never goes below 0.
  - `bound` keys are kept in RESIN_TARGETS order, and the sum stays within the 1e-9 tolerance. There is no ledger line, and activity is not a conserved material.
- **Gate tallies:**
  - They are never hashed (`serialize.ts:388`).
  - Records are inserted in id order and created lazily. Field tallies use the kernel's expression `k × s × (a − b)` on pre-step values.
  - Organisms are matched by birthId around stage 4. birthId starts at 1, so the 0 sentinel is safe. The Y step goes first at an exact corner, matching `movement.ts traceFraction`.
  - The scratch lives within one step.
- **Builder-reported mutants (sample re-checked):** I did not rerun the builder's own mutant list. My independent mutants found the gaps above.

**structure-commands**
- **Payloads and availability:**
  - Malformed payloads are refused whole, and the availability gate reads the dish's recorded manifest and systems, not a build constant.
  - The climate commands are gated on 'climate'.
  - The new optional result keys appear only when used.
- **placeEdges and placeDevice match CT §4** ("Caps: devices 256; edge barriers 512; one furnishing/device per cell; two barriers per edge invalid"):
  - Every accepted placement also satisfies `edgeStoreProblem` and `deviceStoreProblem`: an S04 needs both sides open water, and a device needs ST_NONE.
  - Devices start Off (SPEC §10.4).
- **geometryVersion:** every accepted write to edges or devices replaces the array and bumps the version once (`structureEdits.ts:273`).
  - Mutant: no bump in `removeStructures`, killed by structure-commands.test "removes edges and devices by id…". Result: 1 failed | 66 passed.
- **Severing:**
  - Mutant: `setDevice` closing a shutter does not sever, killed by structure-links "closing a shutter cuts the link; opening it again does not restore it". Result: 1 failed | 6 passed.
  - A cut adhesion link starts the same relink lockout as `adhesion.ts breakLink`, through the same column writes as `resetClock`.
- **Lab edits:**
  - The `device` and `barrier` skips apply only after the old rule accepted the cell.
  - Only `structures.ts` (and recipes at creation) write the substrate or structure grids, so no other path can break the S04 water-side invariant.
- **Sample:**
  - `transferProblem` uses `canOccupy`.
  - A released link straddling a refusing edge is cut, and structure-links "severing on a sample release" covers it.
- **Preview purity:** `structurePreview.ts` imports only constants, barriers and grid. The ESLint render block (`eslint.config` l.113-127) forbids only preact, @ui and art, so `src/render` may import it.
- **Shared files are additive only:**
  - `challenge.ts`: cases plus three budget exclusions.
  - `CompareText.tsx`: plain sentences that follow the existing setLid / setMutationPreset pattern, with no internal codes.
- **Nothing enabled:** neither task touched the manifest, `implemented.ts`, PROTOCOL_VERSION or the schema. The only change in `tests/helpers/world.ts` is e3-resters' (`resterRegistry`, `paintRect`), not structure-commands'.

## Mutant table (this verifier)

| mutant | result |
|---|---|
| channel: anchorState rule dropped | SURVIVES (channel.test 16/16) |
| channel: heldBySlot rule dropped | SURVIVES |
| channel: fungalDegree rule dropped | SURVIVES |
| channel: destinationAccepts → true | SURVIVES |
| tally: wrong pair (kR/kD, no film, no half) | SURVIVES (gate-tally + determinism 15/15) |
| removeStructures without bump | killed: structure-commands "removes edges and devices by id…" |
| setDevice close without sever | killed: structure-links "closing a shutter cuts the link…" |
| barrier-transport patch to barrier-movement (verification, not a mutant) | passes, 1/1 |
| barrier-transport patch to world-stores-5 (verification, not a mutant) | passes, 8/8 |
