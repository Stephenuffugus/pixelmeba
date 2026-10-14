# Wave 11 verification 2 (structure-render-worker, structure-ui, region-charts-gates)

Adversarial verifier, 2026-10-14, tree at f51e912 plus the wave 11 working-tree changes (uncommitted).
Scratch: tmp/verify-g5-wave-11-1/ (HEAD extracted with `git archive`, a mutant copy of the tree, scripts, logs).
No tracked file was edited except this report.

Verdict: ok = false. There are two MAJOR findings: one belongs to region-charts-gates and one to the lead. All builds, tests, the fence and the atlas checks pass.

## Problems, most severe first

1. MAJOR [region-charts-gates] src/worker/probes.ts:93 and :724 (also src/ui/strings/observe.ts:201)
   - **What is wrong:** every v1.0 dish's region reading now lists the stage 2 decaying pools the world allocates, and the probe sheet shows each one as a row. Among them is "Lacephage" (v02). V02 is a Phase 5 species that is not in a v1.0 dish's recorded content.
   - **Why it matters:** this puts unreleased content's name on a v1.0 screen, which goes against D-0104 (nothing enabled). It also contradicts the assignment's test requirement: "a v1.0 dish's readings deep-equal today's except gates: [] (and the appended salt/silicate entries …)". The builder's v1.0 test was relaxed to compare only the first 8 boundary entries.
   - **Repro:** run `npx tsx tmp/verify-g5-wave-11-1/scripts/v1probe.ts` (FIRST_DISH_V1, seed 104729, one region, 30 ticks).
     - The boundary rows include: Bacterial inhibitor, Fungal inhibitor, Photosynthetic inhibitor, Starch enzyme, Oil enzyme, Protein enzyme, Enzyme breaker, Pinphage and Lacephage, each "notMeasured decays".
     - At HEAD the same dish had 8 rows.
   - **Fix:** list a decaying pool only when the dish's own content uses it. For v01/v02 that means the species is in world.species; for the rest, the owning system or module is recorded. Alternatively, keep the v1.0 reading equal as the assignment specified.

2. MAJOR [lead] src/ui/edgeSnap.ts:40 `nearestEdge` (the nearest-midpoint rule in the structure-ui assignment and D-0106)
   - **What is wrong:** a drag that runs slightly off a grid line snaps a perpendicular edge at almost every grid vertex. A membrane line therefore becomes a comb, and the extra perpendicular S01/S02 edges change simulated transport along the line and use up the 512 cap.
   - **Repro:** run `npx tsx tmp/verify-g5-wave-11-1/scripts/snap.ts`. Each stroke is a 20-cell vertical drag.

     | Drag position | Edges | R (intended) | D (stray) |
     |---|---|---|---|
     | x = 64.0 | 21 | 21 | 0 |
     | x = 64.05 | 30 | 21 | 9 |
     | x = 64.1 | 38 | 20 | 18 |
     | x = 64.2 | 41 | 20 | 21 |
     | x = 63.85 | 41 | 21 | 20 |

     A finger cannot hold within 0.05 cell.
   - The builder implemented the rule as given and flagged it. The preview shows the stubs before release, but the player has no way to draw a clean line.
   - **Fix:** a rule change, for example snapping the stroke to grid vertices and joining consecutive vertices, or locking a drag to its dominant axis. Log the change in DECISIONS.

3. MINOR [structure-ui] src/ui/panels/LabTrayContent.tsx:219
   - **What is wrong:** `lifeBrushFor` sets shelterBlocked from DishInfo.speciesFreeClass (Build item 11), but no unit test or journey covers it.
   - **Mutant:** I changed the condition to `cls === 'never'` in the scratch copy. tests/ui/diet-line, tests/sim/lab-commands and tests/sim/view-switch still passed (3 files, 61 tests).
   - **Fix:** add a case where a Medium species and a shelter cell give the brush shelterBlocked: true and the preview refuses the cell.

4. MINOR [structure-render-worker] src/render/gateTracer.ts:52, `tracerCrosses` → `edgePermits`
   - **What is wrong:** on an open shutter, and on an edge with no barrier, the Fixed token (and Medium and Large) is animated crossing the edge. Fixed things (attached colonies, deposits, film, food objects) never move, and the barriers.ts comment says "Fixed never crosses a barrier".
   - This is a mark with no state behind it. Either show Fixed as staying put on every edge, or label it "not blocked, does not move".

5. MINOR [structure-ui] src/ui/strings/structures.ts:290 `gateRows`
   - **What is wrong:** for an open shutter the table reads "Fixed: Passes", next to examples that include deposits, film and food objects. CT §5.3 has no open-shutter column and nothing Fixed ever crosses.
   - **Fix:** word the Fixed row as "Does not move" whatever the code, or "Not blocked (does not move)".

6. MINOR [region-charts-gates] src/ui/strings/observe.ts:157 `gateSince`
   - **What is wrong:** the region sheet's gate totals say "Since the dish began". structure-ui's gate sheet says "Measured since this barrier was placed", following its PROPOSED DECISION.
   - The region sheet sums every current gate of a kind. That sum includes gates placed later and leaves out gates that were removed, so "since the dish began" is not what it measures. The two screens word the same tally differently.

7. MINOR [lead] The Move preview does not equal the moveDevice command (structure-ui's NEEDS line).
   - The renderer has no 'move' rule, so the Move preview uses the 'device' placement rule. At the 256 cap it shows a valid move as refused, and it never refuses a basket moving onto a food object.
   - `deviceMoveOutcome` already exists in src/sim/structurePreview.ts:93. A `deviceMovePreview` in structurePreviewModel.ts plus a renderer rule would close the gap.

8. MINOR [lead] src/persistence/saveFile.ts:304–333 (wave 10 design that the structure-ui and region-charts journeys rely on)
   - **What is wrong:** an imported dish is refused when it uses a module this build cannot simulate (IMPLEMENTED_MODULES), but nothing on import checks IMPLEMENTED_STRUCTURES or the Phase 5 systems.
   - As a result the shipped build opens a dish whose manifest enables S01–S12 together with barriers, climate and devices, all still unimplemented in this build's registry. The journeys depend on this route.
   - It is a deliberate PROPOSED DECISION, but it is inconsistent with the module policy. It needs an explicit owner ruling before v1.1.

9. NIT [structure-render-worker] src/worker/snapshot.ts:978
   - `chemistryLines` includes `exposure` only when `bd.lines.length > 0`. In a world that has the rival field but no inhibitor fields, `exposure.rival` is dropped.
   - No shipped manifest has that shape today.

10. NIT [structure-ui] src/ui/edgeSnap.ts:40
    - It duplicates wave 10's `nearestEdge` (src/sim/structurePreview.ts:148) with a different tie rule: lower edgeKey here, 'R' there.

11. NIT [structure-ui] / [region-charts-gates] naming
    - The same field has different names on different screens:
      - The rival field is "rivalry chemical" (strings/structures.ts:57), "Rivalry extract" (strings/observe.ts:199, which is the M08 content name) and "rivalry chemical" in the gate sheet.
      - sGlow is "glow signal" (GateSheet.tsx) and "Lantern signal" (strings/observe.ts).

12. NIT [region-charts-gates] tests/worker/probes.test.ts:160
    - This file is outside the task's ownership. The one-line edit is justified (salt is now measured in every shipped world), and no assertion was weakened.

13. NIT [lead] D-0119 says the 'device' tile has 14 frames. The assignment lists 13 and 13 were built.

## Verified OK

- **FENCE**, run by me:
  - Command: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts`
  - Result: Test Files 8 passed (8), Tests 62 passed (62), 798 s, exit 0.
- **The 15 new unit test files of the three tasks:** Test Files 15 passed (15), Tests 110 passed (110), exit 0.
- **The Done-when suites:** tests/worker/{protocol, host, host-requests, whatif, whatif-ui, new-dish-preview-grid, thumbnail, probes, sample-transaction, challenge-host, goals-host, relationship-map}, tests/sim/objectives, tests/render, tests/ui, tests/content and tests/persistence/phase5-import. Result: Test Files 76 passed (76), Tests 1172 passed (1172), exit 0.
- **Typecheck, lint and atlas:**
  - `npx tsc -p tsconfig.json --noEmit` exits 0.
  - `npx eslint` on all 66 changed or new files of the three tasks exits 0.
  - `npm run art:build -- --check` reports "atlas up to date · 1691 frames … 1024×2048 · 393e81b629bc".
- **Golden written first, from HEAD** (structure-render-worker item 0):
  - I extracted HEAD with `git archive` into scratch and re-ran tmp/structure-render-worker/write-golden.ts there.
  - Both tests/fixtures/protocol2-golden/*.json files came out byte-identical (`cmp`). Hashes: f8dafb6603eb42ee at t300 and 5c053789a57db48a at t1600.
- **Atlas** (item 9):
  - All 1678 HEAD frame records are unchanged.
  - Comparing the PNG pixel by pixel against HEAD, 0 pixels differ outside the 13 new `tile/device/*` rectangles, and 1394 differ inside them.
  - An enlarged crop shows 13 readable frames: the S08 quartiles darken, S09 and S10 have accents in the On frames, and S11 is an outline only.
- **Protocol 3 layout:** PROTOCOL_VERSION 3, ENT_STRIDE 15, E_CUE3 14, and every CUE3 value and mask, DEPOSIT_GRIT_BAND 7, DEPOSIT_BANDS 8 and EDGE_FLOW_BACK 8 match the assignment (protocol.ts:37, :422–:508, :539).
  - cue3Of reads only entity columns.
  - The jacket band formula gives bands 0, 0, 1, 3 for coverage 0.1, 0.25, 0.5 and 1.0.
- **Geometry, resins and environment:** geometry is built only when geometryVersion moves. Resins and environment go into every snapshot. The r/d buffers are transferred (host.ts:3537–3586), and client.ts keeps environmentOf and resinsOf the same way as lidOf.
- **New Dish overrides:**
  - build() validates lid, lightMode and drying, and refuses a cycle or drying without the build's 'climate' before anything is built.
  - recipeProvenance records only the keys given.
  - My round trip under the shipped registry with `{lid: 'closed', lightMode: 'fixed', drying: false}` created the dish, recorded exactly those keys, and loadSaveFile reloaded it with an equal stateHash (scripts/roundtrip.ts).
- **Inspector light line:** the Lab light-factor product equals CellInspect.light across the day, dusk and night boundaries (scripts/light.ts at ticks 5, 895–1205; all equal to 4 decimals).
- **Mutants** (applied in tmp/verify-g5-wave-11-1/mut, never in the tree):
  - labCellPreview without labCellConflict is caught: structure-preview.test.ts has 5 tests failing.
  - probes without the stage-4 crossing pass is caught: probes-gates "a small gate in the line" fails.
  - lifeBrushFor without shelterBlocked survives (problem 3).
- **Ownership:**
  - structure-render-worker's src/sim edit is limited to the additive `wetCellOutcome`.
  - region-charts-gates' objectives.ts edit is limited to WORLD_GATES, the optional `organisms?` and the two defaults.
  - structure-ui edited no stage 1, worker, render, art or sim file.
  - The pinned-test edits (protocol, thumbnail, phase3, art-p5, art-p5-large) carry reason comments and keep their digests.
- **Determinism:**
  - No new src/sim code iterates a Map, Set or object keys, or uses Math.random or Date.
  - The tracer's source uses no rng, det, Math.random, Date or performance.now (checked by test).
  - Probes, packing and the tracer leave stateHash and the full trajectory digest unchanged (equivalence, gate-tracer and probes-gates read-only tests pass).
- **Not re-run by me:** the e2e journeys (structures, region-charts, inspector, lab-tools, new-dish and the others). I found no UI problem that needed a browser to prove; problem 1 is shown in Node.
