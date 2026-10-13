# Wave 9 barrier-movement build report

Organisms, edge barriers and the S05/S06 furnishings, as simulation code (P5.2, organism half; SPEC §2.4, §4.9, §6.4; CT §1.1, §4, §5.3; D-0106, D-0108). Nothing is enabled (D-0104). Every new rule runs only when `world.edges.length > 0` or `world.devices.length > 0`. A world can hold those stores only when its recorded manifest enables 'barriers' or 'devices' (import and content checks), so v1.0 worlds take exactly the old code paths. The FENCE passes unchanged.

## Checklist

### Build
1. **DONE: src/sim/edgePassage.ts (new).**
   - `edgeCodesOf` (:82) and `deviceKindsOf` (:97) cache per world object in a WeakMap. They rebuild when geometryVersion, the array identity or the length moves, and return null for an empty store.
   - `placementClassOf` (:123), `cornerPermits` (:136), `pairPermitted` (:166; asserts the cells are neighbours and throws otherwise), `segmentPermitted` (:193), `shelterRefuses` (:243) and `markRefusedEdges` (:260).
   - `freeClassOfSpecies` is in barriers.ts:146. ownClass now calls it (:137), so the rule exists in one place. tests/sim/barriers-table.test.ts passes unchanged.
2. **DONE: canOccupy** (movement.ts:68) is `habitatCompatible && (devices.length === 0 || !shelterRefuses)`.
   - **Shelter refusal in crossing.ts enterCell** (:73), gated on devices.
   - Proven by barrier-placement "canOccupy refuses Medium and Large…", "inoculating P01…", "a recipe founder…" and "P04 never enters a shelter…", and by barrier-movement "P01 never enters a shelter cell…" and "B01 enters a shelter".
3. **DONE: traceFraction(…, cross, cls)** (movement.ts:89). The edge check covers every DDA step (:128) in both the crossing and the habitat branch. The exact-corner rule runs before the Y step (:121). A refused edge returns `Math.max(0, t - EPS / Math.hypot(dx, dy))`. With `cls` null or no edges, no extra float operation runs. applyStep and decide pass `classOf(world, i)`, computed once per organism per stage (:486) and only when edges exist (:428).
4. **DONE: the decide window marks** (movement.ts:306–318). WIN_MARK is built by markRefusedEdges and folded into the prefix sums only. WIN_BLOCKED and candidate selection are unchanged. With no edges the prefix sums are exactly as before. Proven by THE LEAK FIXTURE (mutant 0 below).
5. **DONE: targets** (a PROPOSED DECISION).
   - acquirePrey skips prey whose straight segment is refused for the hunter's class (movement.ts:179).
   - An existing target is cancelled at once (:498).
   - nearestHost skips such hosts (parasites.ts:177).
   - The only check is segmentPermitted (edges only). Reason codes are unchanged.
   - Proven by barrier-contacts "a predator whose prey is behind S01 drops the target…".
6. **DONE: contacts.** All three checks run before the distance comparison:
   - predationContacts (contacts.ts:87)
   - attachParasites (parasites.ts:272)
   - the formAdhesionLinks pairing search (adhesion.ts:280)
   - Proven by the barrier-contacts predation, parasite and E12 tests, and by "claim ordering among permitted prey is unchanged".
7. **DONE: placement.** findPlacement (births.ts:117) and fungalPlacement (fungi.ts:180) use `pairPermitted(own, cell, cls, cls)` with `cls = placementClassOf(parent)`. No new links are made across a barrier: joinBranch links only the parent and its placed daughter. Proven by barrier-placement "inside a cell whose four edges are S01…" (20 seeds), "S01 on the east edge only…" (20 seeds), "an attached B02 (Fixed)… over generations", "a ready F01…" and "F02 networks… never… a link across".
8. **DONE: host and parasite as one unit.** barrier-movement "an A01 carrying an X01 never ends across an S02…":
   - The X01's x and y equal the host's on every tick (0 mismatches).
   - maxX < 63 with the S02, and ≥ 63 in the control without it.
   - "a free X01 (Small) crosses the same S02 to its host and attaches".
   - Positions are never within 1e-9 of a cell boundary in the S01-line, S02 and P04 tests.
   - The A01 is given E07 with `placeWith(w, 'A01', …, ['E07'])`, with brighter light across the gate.
9. **DONE: S04** is never crossed by ordinary movement in either direction. barrier-movement "is closed to ordinary movement in both directions" includes an open-dish control where both organisms do cross.
10. **DONE: SURF_MESH** (attachment.ts:84–110). attachmentMask ORs SURF_MESH into each S06 cell when devices exist, keyed on attachVersion = geometryVersion. While devices exist it also checks the device-store identity and length through the WeakMap `meshBuiltFrom`, so a store replaced without a bump is still seen. With no devices the mask is cellSurfaces byte for byte. Proven by barrier-placement "without devices the mask is cellSurfaces byte for byte…" and "B02 cannot live on an open water cell, and can … with an S06".
11. **DONE: perf.** Scratch script tmp/barrier-perf/perf.ts (not committed). 400 organisms (P01 every 10th, the rest B01), 2,000 ticks. The machine was shared, so the numbers are inflated and noisy (two runs each, in order a, b, a, b):

    | Run | Mean tick (ms) | p95 tick (ms) | Stage 4 share | Stage 4 mean (ms) |
    |---|---|---|---|---|
    | (a) no edges, no devices | 2.40 / 3.79 | 4.43 / 7.62 | 38.2 % / 40.5 % | 0.92 / 1.53 |
    | (b) 512 edges (9 S01 lines, S02 every 4th edge) + 256 devices (S05 and S06 alternating) | 3.92 / 4.98 | 8.67 / 10.38 | 50.4 % / 51.2 % | 1.98 / 2.55 |

    Stage 4 costs about 1 ms more per tick with the structures. I have not optimised this; the lead measures at the flip.

### Done when
- **The four new test files pass.**
  - barrier-movement: 13 tests
  - barrier-contacts: 7 tests
  - barrier-placement: 11 tests
  - barrier-determinism: 5 tests
- **The listed existing suites pass unchanged, except one test that is not mine:**
  - 26 files were run in one invocation: `Test Files 1 failed | 25 passed (26); Tests 1 failed | 310 passed (311)`. tests/content/recipe-structures.test.ts was included as well.
  - The one failure is tests/sim/world-stores-5.test.ts "4× equals 1×…" at `expect(a.climate.warmth![cellIndex(74, 70)]).toBe(0.75)`, which received 0.5079…. That is climate-stage2's in-flight climate.ts relaxing warmth: the "stores are carried, not read" premise no longer holds for climate. The edges and devices assertions just before it passed. **climate-stage2 or the lead must update that test.**
- **tsc and eslint are clean.**
  - `npx tsc -p tsconfig.json --noEmit` exits 0.
  - `npx eslint` exits 0 on every changed file and every new file.
- **The FENCE is unchanged.** The final run covered the fence, barriers-table and my four files: `Test Files 13 passed (13); Tests 120 passed (120); Duration 814.45s`. The earlier fence-only run gave `Test Files 9 passed (9); Tests 84 passed (84)`.

## Files
**New:**
- src/sim/edgePassage.ts
- tests/sim/barrier-movement.test.ts
- tests/sim/barrier-contacts.test.ts
- tests/sim/barrier-placement.test.ts
- tests/sim/barrier-determinism.test.ts
- this report

**Changed:**
- src/sim/movement.ts
- src/sim/crossing.ts (enterCell only)
- src/sim/births.ts (findPlacement only)
- src/sim/fungi.ts (fungalPlacement only)
- src/sim/contacts.ts (predation claims only)
- src/sim/parasites.ts (nearestHost and attachParasites only)
- src/sim/adhesion.ts (the formAdhesionLinks pairing search only)
- src/sim/attachment.ts (SURF_MESH)
- src/sim/barriers.ts (additive freeClassOfSpecies; ownClass delegates to it with identical results)
- tests/helpers/world.ts (new helpers only: PHASE5_STRUCTURE_IDS, pushEdges, verticalLine, pushDevices, barrierRegistry, barrierDish)

## Every place that now checks edges, devices or classes, with its gate
| Place | Check | Gate |
|---|---|---|
| movement.ts canOccupy | S05 shelter | `world.devices.length === 0` short-circuits |
| movement.ts traceFraction | edges every step, plus the corner rule | `cls !== null` and `edgeCodesOf` non-null |
| movement.ts decide | window marks; trace with cls | `cls` non-null only when edges exist |
| movement.ts acquirePrey | segmentPermitted | `cls` non-null |
| movement.ts predator block | target cancel | `cls` non-null |
| movement.ts stageSenseAndMove | `classOf(world, i)` | `edgesOn` |
| crossing.ts enterCell | shelter | `devices.length > 0` |
| births.ts findPlacement | pairPermitted | `edges.length > 0` |
| fungi.ts fungalPlacement | pairPermitted | `edges.length > 0` |
| contacts.ts predationContacts | pairPermitted | `edgesOn` |
| parasites.ts nearestHost | segmentPermitted | `edges.length > 0` |
| parasites.ts attachParasites | pairPermitted | `edgesOn` |
| adhesion.ts formAdhesionLinks | pairPermitted | `edgesOn` |
| attachment.ts attachmentMask | SURF_MESH from S06 | `devices.length > 0` |

## canOccupy callers that inherit the shelter rule
`git grep -n "canOccupy(" src`:
- births.ts findPlacement
- commands.ts:292 (inoculate)
- fungi.ts fungalPlacement
- movement.ts traceFraction, the decide window and decide candidates
- recipes.ts:349 and :355 (founders)
- specimens.ts:162

Not inheriting it:
- sample.ts:445 (Sample release uses `habitatCompatible`)
- grid.ts lifeCellOutcome (the Life brush preview)

## What each test proves, and the mutants
I ran each mutant in an isolated copy of src/ and tests/ (under tmp/, since deleted) so other agents never saw mutated code. Each was reverted afterwards. Every mutant fails at least one test:

| # | Mutant | Failing test(s) |
|---|---|---|
| 0 | No window trace marks | THE LEAK FIXTURE |
| 1 | Corner rule removed from traceFraction | "a diagonal trace through an exact corner is refused…" |
| 2 | Corner rule removed from pairPermitted | contacts "across a diagonal corner…"; placement "inside a cell whose four edges are S01…" |
| 3 | Edge check only on the destination cell's edge | THE LEAK FIXTURE (the held-at-63.5 case: target x 65 across the 63/64 edge) |
| 4 | Shelter check removed from canOccupy | 5 tests: canOccupy, inoculation, the recipe founder, P04 shelter, P01 shelter |
| 5 | Shelter check removed from enterCell | "P04 never enters a shelter…" |
| 6 | Predation contact check removed | 4 contacts tests (S01, S02/shutters, corner, claim ordering) |
| 7 | Parasite attach check removed | "X01 next to A01 across S01 and across S02…" |
| 8 | E12 pairing check removed | "two Small E12 carriers…" |
| 9 | Daughter placement without the edge check | 3 placement tests |
| 10 | Fungal placement without the edge check | "a ready F01…" (the F02 network run alone did not catch it) |
| 11 | placementClassOf without the attached-species override | "an attached B02 (Fixed)… over generations" |
| 12 | Target cancel removed | "a predator whose prey is behind S01 drops the target…" |
| 13 | Prey acquisition check removed | the same test |
| 14 | SURF_MESH not set | both mesh tests |
| 15 | applyStep trace without cls | "a full S01 line…" and "P01 (Medium)… P04 (Large)…" |

## Commands and results
- `npx vitest run tests/sim/barrier-movement.test.ts`: Tests 13 passed (13)
- `npx vitest run tests/sim/barrier-contacts.test.ts`: Tests 7 passed (7)
- `npx vitest run tests/sim/barrier-placement.test.ts`: Tests 11 passed (11)
- `npx vitest run tests/sim/barrier-determinism.test.ts`: Tests 5 passed (5) (146.8 s)
- The fence, barriers-table and the four files together: Test Files 13 passed (13), Tests 120 passed (120)
- The "Done when" suites: Tests 1 failed | 310 passed (311). The failure is climate-stage2's world-stores-5 warmth assertion, described above.
- tsc and eslint: clean
- E2E: none. No screen changed, and port 4272 was not used.

## FENCE notes
No fence value moved. NEUTRAL (barrier-determinism) shows two runs are byte-identical after 2,000 ticks:
- a dish under the Phase 5 registry with no edges and no devices, and
- the same dish under the shipped registry.

The comparison covers the entity columns and every shipped field.

## Proposed decisions
- **PROPOSED DECISION:** an exact diagonal never squeezes past a barrier end. A diagonal pair, a diagonal trace corner or a diagonal placement needs both L-paths clear for both classes. For any closed boundary each L-path crosses it anyway, so this never weakens isolation. It only over-blocks at an open barrier end (tested: one L-path blocked is refused).
- **PROPOSED DECISION:** the S05 rule is species-level (freeClassOfSpecies). Medium and Large free classes are refused; Small and Fixed are unaffected. A shelter is not an attachment surface. The rule lives in canOccupy, so every placement path inherits it. An organism already standing in a shelter cell is not harmed (suitability still uses habitatCompatible): it may leave but not come back.
- **PROPOSED DECISION:** a predator's prey target and a free parasite's host target are refused when the straight segment from the hunter crosses an edge that refuses the hunter's class. The check uses start-of-stage positions and edges only. Such a target is not acquired, and an existing one is cancelled at once (SPEC §6.4). The existing search order and reason codes are kept.
- **PROPOSED DECISION:** a daughter or new segment is placed in its parent's class at birth (placementClassOf). A parent of an attachment species (record `attachment` ≠ null) is Fixed even without FLAG.attached. The reason: births.ts commitDivision never sets FLAG.attached on daughters (only introduction does), so classOf (D-0108 rule e) calls every born B02 "Small". Without the override, a B02 granddaughter places across an S02 (mutant 11).
- **PROPOSED DECISION:** the corner test in the assignment used (10.5, 10.5) → (11.5, 11.5). Cell (10, 10) lies outside the dish disk, so I used (60, 60).

## Bugs noticed elsewhere / for the lead
- **classOf misclassifies born attachment-species organisms.** A B02, B13, F-segment or P06 daughter never carries FLAG.attached, so classOf rule (e) calls a born B02 or B13 Small and a born P06 Medium. This matters for contacts across S02, and later for the S04 channel's "one Small organism" transfer (wave 10 must not move a born B02 through a channel). Two possible fixes: set FLAG.attached in commitDivision for `sp.attached` species, or make classOf treat `sp.attached` as Fixed. Either is a classOf/births change that needs a lead call. Fungi are unaffected (fungus → Fixed).
- **world-stores-5 "4× equals 1×"** now fails on the climate warmth assertion (climate-stage2 in flight). This is not mine.
- **Sample release** (sample.ts:445) uses habitatCompatible, not canOccupy, so a released P01 can land in a shelter cell. Moving a sample block across an edge is also unchecked. Both belong to wave 10 (sample.ts).

## What wave 10 must do
- **Bump grid.geometryVersion on every write to world.edges or world.devices** (place, erase, move, toggle a shutter). edgeCodesOf, deviceKindsOf and attachmentMask key on geometryVersion plus the store identity and length. A device moved in place (same array, same length, `cell` mutated) or a shutter toggled is seen only through the bump.
- **Link severing:** existing fungal and E12 links and attached host/parasite pairs across a barrier placed later. I added no per-tick sever rule, as instructed.
- **The Life brush preview** (grid.ts lifeCellOutcome) must learn the mesh and the shelter. cellSurfaces stays grid-only.
- **The S04 channel's directed one-Small-organism transfer.** Ordinary movement never crosses a channel edge.
- **Sample release** should use canOccupy and should not release across a refusing edge.
- **recipes.ts:631 founder chain links** (`links: 'chain'`) are authored, not checked against edges. Content validation could refuse a chain across a barrier.

## Anything for climate-stage2's files
Nothing was required. habitatCompatible, transport.ts, suitability.ts, chemistry.ts, constants.ts, world.ts, structures.ts and implemented.ts are untouched. My per-world caches live in edgePassage.ts and attachment.ts WeakMaps, never in TransportCache.
