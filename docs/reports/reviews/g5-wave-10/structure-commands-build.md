# Wave 10 · structure-commands · build report

Builder: structure-commands (port 4272). Nothing is enabled (D-0104). There is no schema bump, PROTOCOL_VERSION stays 2, no manifest or content edit was made, and implemented.ts is untouched. No git commands were run.

## Checklist: Build items

1. **Payloads: DONE.** `src/sim/structureEdits.ts:56-91` defines `StructureCommandPayload`, which has 8 flat kinds. It is added to the `CommandPayload` union at `src/sim/commands.ts:47-52`.
   - `invalidStructureCommand` (`structureEdits.ts:152`) refuses a malformed payload whole, with `{accepted 0, rejected 0, note}`. It checks:
     - unknown keys for the kind (the `KEYS` table, line 122);
     - an unknown structure;
     - `open` present for any edge but S03, or missing on an S03;
     - `flow` present for any edge but S04, or missing on an S04;
     - a cell that is not an integer, or not in [0, 16384);
     - a direction other than R or D;
     - a repeated edge or id;
     - 0 edges, or more than 512;
     - 0 ids, or more than 768;
     - a setDevice with anything other than exactly one of on, open or resinSelect;
     - a resinSelect that is unsorted, repeated or unknown;
     - a bad Lab stroke or radius. This reuses the new `structures.ts invalidLabStroke`, which was split out of `invalidHabitatEdit` with its checks in the same order.
   - `CommandResult` gains optional `ids`, `refused`, `exported` and `severed` (`commands.ts:63-74`). `HabitatSkips` gains optional `device` and `barrier` (`structures.ts:159-164`). Each key is present only when used, so v1.0 results are byte-identical.
   - Proof: `tests/sim/structure-commands.test.ts` "refuses a malformed payload whole: nothing changes" covers 24 payloads, with `serializeWorld` byte-equal afterwards.
2. **Availability: DONE.** `structureAvailable` (`structureEdits.ts:137`) requires `worldHasStructure` plus every system in `STRUCTURE_SYSTEM_NEEDS`.
   - Refusal notes:
     - a structure the dish lacks: "`<ID>` is not in this dish";
     - removeStructures, moveDevice or setDevice in a dish with no Phase 5 structure: "structures are not in this dish";
     - wetBrush, setLightMode and setDrying without 'climate': "climate is not in this dish".
   - An id that is not in the stores counts as `refused.missing`.
   - Proof:
     - "a dish under the shipped registry refuses every new kind" (structure-commands): serializeWorld is byte-identical, and the stateHash equals a twin given the same number of refused v1.0 commands.
     - `tests/worker/structure-commands-host.test.ts`.
3. **placeEdges: DONE** (`structureEdits.ts:284`; outcome rule `structurePreview.ts:38 edgePlacementOutcome`).
   - Each edge is checked in this order: rim, structure (stone or wall; a bead is allowed beside S01–S03), barrier, channel (S04 only), cap.
   - Ids come from nextDeviceId in edgeKey order. S03 carries `open` and S04 carries `flow`, with no `nextOrganismTick`. The store is re-sorted with `sortEdges`.
   - If nothing is placed, the note is 'nothing placed'.
   - Proof (structure-commands "placeEdges" ×4): each kind; refusals rim ×2, stone, wall, occupied, S04 beside gel and beside a bead; the 512 cap with a partial accept of 2 and 3 cap refusals.
4. **placeDevice: DONE** (`structureEdits.ts:318`; `structurePreview.ts:72 devicePlacementOutcome`).
   - Order: rim, structure (anything that is not ST_NONE), device, cap (256, shared).
   - Placed Off: S09 and S10 get `on: false`; S08 gets `resinSelect: []` and no bound; other kinds get neither key.
   - A live organism or a food object on the cell is allowed.
   - Proof: "placeDevice" ×3, including the shared cap: 200 S05 + 55 S09 pushed, then one S10 accepted, then an S10 and an S11 refused with cap.
5. **removeStructures: DONE** (`structureEdits.ts:333`).
   - Ids from both stores are removed.
   - An S08's `bound` is summed per target in RESIN_TARGETS order into `exported`.
   - A basket's object stays. Gate tallies are kept. Nothing is restored, because a structure never changed the substrate.
   - Unknown ids count as `refused.missing`.
   - Proof: "removeStructures …" checks exported `{inhBact 1.5, rival 0.25}`, the pellet unchanged, computeTotals equal, the tally kept, and a round trip.
6. **moveDevice: DONE** (`structureEdits.ts:368`; `structurePreview.ts:93 deviceMoveOutcome`; `objects.ts:99 relocateObject`).
   - Refusal order: rim, structure, device, then 'object' (a basket carrying an object onto another object).
   - Same cell: 'unchanged'. An edge id: refused whole ('an edge barrier cannot be moved').
   - The device keeps its id, kind, on, resinSelect and bound. A basket carries its object; the record is replaced in place, so id order holds. Other kinds leave objects where they are.
   - Proof: "moveDevice" ×2.
7. **setDevice: DONE** (`structureEdits.ts:398`).
   - Settable values: on (S09/S10), open (S03), resinSelect (S08; [] = Off, bound kept). The same value gives 'unchanged'.
   - The wrong kind for a key is refused whole (e.g. "S05 has no on setting").
   - Proof: "setDevice" ×2.
8. **geometryVersion: DONE.** Every accepted placeEdges, placeDevice, removeStructures, moveDevice or setDevice replaces the store array and calls `bump` once (`structureEdits.ts:273`). The climate commands and refused commands never bump.
   - Proof: the `geo()` helper in structure-commands wraps every command in that file.
   - End to end: "after a placeEdges of S01 by command, wave 9's movement refuses the crossing". edgeCodesOf sees the edge, and no P01 crosses x = 64 in 400 ticks.
9. **Severing: DONE** (`structureEdits.ts:462 severCrossedLinks`, `:512 crossed`).
   - It runs after placeEdges of S01, S02, S04 or a closed S03, and after setDevice `open: false`.
   - Links are visited in ascending slot order, partner > i, fungal links before adhesion links.
   - A link is cut when `pairPermitted(cell_i, cell_p, classOf(i), classOf(p))` is false. That check includes the corner rule. For cells more than one apart, both classes get `segmentPermitted`.
   - Each cut emits one 'linkBroken' event from i: `{kind, partner, cause:'barrier'}`, plus `link` for a fungal link.
   - A cut adhesion link also starts the E12 relink lockout on both ends (see PROPOSED DECISION 5).
   - No per-tick rule was added.
   - Proof: `tests/sim/structure-links.test.ts`, 7 tests.
10. **Climate commands: DONE** (`structureEdits.ts:238-250`, `:437 wetBrush`).
    - wetBrush goes through `climate.ts wetCells`. accepted = covered in-dish cells that are not water; rejected = the other covered cells. A stroke over water only changes nothing and allocates nothing ('nothing wetted'; see PROPOSED DECISION 6).
    - setLightMode goes through `climate.ts setLightMode`. setDrying sets `settings.drying`.
    - The same value gives accepted 0 'unchanged'.
    - Proof: `tests/sim/climate-commands.test.ts`, 9 tests.
11. **Lab edits: DONE** (`structures.ts:309-324`; rule `structurePreview.ts:137 labCellConflict`, plus `channelSides` at `:105`).
    - The rule applies only to cells that `brushCellOutcome` already accepted, so every older reason keeps its precedence and its counts.
    - place (stone, wall, bead): a device cell gives `device`; an S04 side gives `barrier`.
    - substrate: gel or sediment on an S04 side gives `barrier`. Water paint is allowed.
    - shade and erase are unaffected. Nothing is read when both stores are empty.
    - Proof: `tests/sim/structure-lab-edits.test.ts`, 10 tests.
12. **Life brush preview: DONE** (`grid.ts:355-398`).
    - `LifeBrush.shelterBlocked?` is added.
    - `lifeCellOutcome(…, extras?: LifeCellExtras {mesh?, shelter?})`: a shelter with shelterBlocked gives 'structure'; a mesh adds the 'mesh' surface on an ST_NONE cell. With extras omitted the result is unchanged.
    - Inoculating P01 into shelter cells only returns exactly `{ accepted: 0, rejected: 3, note: 'no compatible cells' }`, and B01 is accepted (structure-commands).
    - Proof: structure-determinism "the Life brush preview equals the inoculate filter". All 37 species with allowUnimplemented, viral ones skipped, × every in-dish cell, with 20 S05 + 20 S06 on gel, sediment and water. It also asserts that both extras change some outcome.
13. **Sample: DONE.**
    - `sample.ts:448`: the transferProblem destination check uses `canOccupy`.
    - `sample.ts:509-519`: a released block whose link straddles a refusing edge is severed. This is D-0116/D-0117's integration note, and it is cut, not refused. `result.severed` is present only when > 0.
    - Proof: structure-commands "Sample Transfer checks the destination with canOccupy". "Amoeba cannot live where it would land" in a shelter; B02 lands only on the mesh. A basket Take takes the pellet whole and never the basket. structure-links "severing on a sample release" ×2.
14. **Dispatch and shared switches: DONE.**
    - `commands.ts:172-181` dispatches the 8 kinds to `applyStructureCommand`.
    - `challenge.ts:101-112` maps the 6 build kinds plus wetBrush to habitat, and setLightMode and setDrying to lid. `countsAgainstBudget` (`challenge.ts:122-133`) also excludes setDevice, setLightMode and setDrying.
    - `CompareText.tsx:72-89` adds the plain sentences.
    - Proof: structure-commands-host "challenge groups and budgets" ×2.

## Checklist: Done-when

- **DONE: the six new test files pass.** 96 tests, run together at the end.
- **DONE except two failures from barrier-transport's in-flight code: the regression list.** This covers lab-commands, tools, world-stores-5, links, fungal-links, objectives, view-switch, attachment, food-objects, habitat-presets, transport-obstacles, phage, module-e12, fungal-transport, conservation-all-pools, the worker tests host, challenge-host, sample-transaction and whatif, phase5-import, migration-schema5, and wave 9's 9 files. lab-commands is also the only file with describeChange. 28 of 30 files passed (395 of 397 tests). The two failures:
  - `barrier-movement.test.ts` "S04 … is closed to ordinary movement in both directions": a B01 is found at x 64.02 at tick 255.
  - `world-stores-5.test.ts` "4× equals 1×": gateTally now holds accumulated co2, nutrient and oxygen.

  Both come from barrier-transport's in-flight `channel.ts` (S04 moving a Small organism) and `gateTally.ts` (tallies now accumulating). My diff touches neither path: no store write at stage time, and no file of theirs. Those tests pin wave 8a/9 expectations that barrier-transport's rules now change, so they need updating by barrier-transport or the lead.
- **DONE: tsc and eslint.** `npx tsc -p tsconfig.json --noEmit` is clean, and eslint on the 15 changed or created files is clean.
- **DONE: the fence is unchanged.** 8 files, 62 tests passed.
- **DONE: e2e on desktop and phone-portrait.** lab-tools and sample-transfer: 12 passed (11.9 m). Port 4272 was stopped before and after. I changed no screen, so the axe and target checks inside lab-tools ("Lab at 200 % text … axe clean") passed unchanged.

## Files

Created:
- `src/sim/structureEdits.ts`
- `src/sim/structurePreview.ts`
- `tests/sim/structure-commands.test.ts` (18 tests)
- `tests/sim/structure-lab-edits.test.ts` (10)
- `tests/sim/climate-commands.test.ts` (9)
- `tests/sim/structure-links.test.ts` (7)
- `tests/sim/structure-determinism.test.ts` (49)
- `tests/worker/structure-commands-host.test.ts` (3)
- this report

Changed:
- `src/sim/commands.ts`: union, result keys, dispatch.
- `src/sim/structures.ts`: `invalidLabStroke` split out unchanged; device/barrier skips; HabitatSkips keys.
- `src/sim/grid.ts`: `LifeBrush.shelterBlocked`, `LifeCellExtras`, `lifeCellOutcome` extras.
- `src/sim/objects.ts`: `relocateObject`.
- `src/sim/sample.ts`: canOccupy; severing on release.
- `src/worker/challenge.ts`: cases and budget exclusions.
- `src/ui/panels/CompareText.tsx`: cases.

`tests/helpers/world.ts` was not changed (no new helper was needed).

## What each test proves, and the mutants

The determinism file checks:
- paused and queued are equal (1,000 ticks), with every kind plus Lab edits at ticks 0, 50 and 300;
- 400 = 4 × 100 with queued commands;
- a save between two commands, then load and continue;
- for 22 kind cases (each edge kind, S03 open and closed, each device kind, remove, move shelter, move mesh, set shutter, heater and resin, wet, light, drying), both paused and queued: the reload equals the world right after the command, and both stay equal after 300 more ticks, starting from caches warmed for 60 ticks;
- host-style Undo restores the pre-command hash for every case;
- computeTotals is exactly equal before and after every case;
- closed lid on FIRST_DISH_V1 with all 12 kinds placed by command at tick 100, a heater on and a resin selected: checkLedger ok and relErr < 1e-5 in all 20 chunks of 500 ticks;
- the Life-brush preview equals canOccupy.

Each mutant was made by hand, the tests run, and the change reverted:

| Mutant | Failing tests |
|---|---|
| No geometryVersion bump in placeEdges | structure-commands: 3 placeEdges tests (the `geo()` check). The end-to-end movement test does not fail, because the new store array alone refreshes edgePassage's identity-keyed cache. |
| ids not in edgeKey order | structure-commands "places each kind with ids … in edgeKey order" |
| Stone on a device cell not refused (`deviceKinds` disabled) | structure-lab-edits: stone, wall and bead strokes; the whole-dish bead preview (cell 7720 device) |
| S04 side painted gel not refused | structure-lab-edits "gel and sediment paint skip an S04 side…" and the whole-dish gel preview |
| Transfer check back to habitatCompatible | structure-commands "Sample Transfer checks the destination with canOccupy" (P01 accepted into the shelter) |
| Severing removed | structure-links: 6 of 7 tests |
| lifeCellOutcome without the mesh extra | structure-determinism Life brush ("B02 5689: expected false to be true") |
| setLightMode('fixed') not deleting cycleStartTick | climate-commands "cycle … fixed deletes it". The same test pins the import refusal: "The dish records a light cycle start, but its light does not cycle. Nothing was loaded." |

D-0111 regression sentences, pinned in structure-lab-edits:
- "A device sits on a stone, wall or bead. Nothing was loaded."
- "A one-way channel does not join two open water cells. Nothing was loaded."

## Commands and results

- `npx vitest run` on the six new files: Test Files 6 passed (6); Tests 96 passed (96); 236 s.
- FENCE (`g2-replay`, `rc1-replay`, `trajectory-fence*`, `conservation-closed-lid`, `determinism`): Test Files 8 passed (8); Tests 62 passed (62).
- Regression list: Test Files 2 failed | 28 passed (30); Tests 2 failed | 395 passed (397). Both failures are barrier-transport's, as above.
- `E2E_PORT=4272 E2E_OUTDIR=tmp/dist-structure-commands npx playwright test tests/e2e/lab-tools.spec.ts tests/e2e/sample-transfer.spec.ts --project=desktop --project=phone-portrait`: 12 passed (11.9 m).
- `npx tsc -p tsconfig.json --noEmit`: clean. `npx eslint <15 files>`: clean.

## FENCE notes

No fence value moved. Every new path returns before touching state in a world without the systems. The Lab edit reads the stores only when one is non-empty. `canOccupy` equals `habitatCompatible` without devices. `severCrossedLinks` returns 0 without edges.

## Preview functions and the renderer

`src/sim/structurePreview.ts` is pure: grid codes, edge codes and device kinds in. It imports only constants, barriers, grid and devices. ARCH §3's ESLint boundary forbids only preact/UI and art imports in `src/render`, and `@sim/*` imports are already used there (`renderer.ts` imports `@sim/grid`), so **src/render may import it**.

Exports:
- `edgePlacementOutcome`
- `devicePlacementOutcome`
- `deviceMoveOutcome`
- `channelSides`
- `labCellConflict`
- `nearestEdge`: tap/drag snapping to the nearest grid edge; ties go to R.
- `sortStrokeEdges`

## What wave 11 must wire

- **GeometryMsg.** Send edges and devices. The host already resends geometry when geometryVersion moves, and every store command bumps it.
  - The renderer needs `edgeCodeArrays` (r and d) and per-cell device kinds to call `edgePlacementOutcome`, `devicePlacementOutcome`, `deviceMoveOutcome`, `labCellConflict` and `channelSides`, with the store counts for the caps.
- **Life brush.** Pass `extras {mesh, shelter}` per cell, and `LifeBrush.shelterBlocked` from `freeClassOfSpecies(def)` being medium or large.
- **The Lab result text (skippedText).** Add words for `skipped.device` and `skipped.barrier`. Word the new results: `refused` reasons, `exported` (the resin's activity) and `severed` ("N links cut by the barrier").
- **Notes ending in NOT_IN_DISH.** "S0x is not in this dish", "structures are not in this dish", "climate is not in this dish".
- **The Build group.** Edge barriers are a snapped stroke giving one placeEdges, with S03 requiring the open/closed choice and S04 the flow. Devices are one tap per device. Erase Structure sends removeStructures with the ids under the brush.
- **Move.** Offer it only while paused. The command itself is atomic on both paths.
- **The wetting brush.** Gate it on `worldHasSystem(dish, 'climate')` (D-0111).
- **The device sheet.** setDevice with exactly one key. 'unchanged' gives accepted 0, which is no undo point.
- **The light mode and drying.** setLightMode and setDrying in the Environment group.
- **PROTOCOL_VERSION.** The bump is wave 11's. The CommandPayload union the protocol carries has already widened.

## Things I would have changed in barrier-transport's files

None was needed. Two pinned tests (above) need updating for its channel and tallies. Predation claims (`preySlot`) that a newly placed barrier crosses need no command-time rule: movement.ts:498 cancels a target behind a refusing edge in the next stage 4 (wave 9), and contacts.ts:87 checks pairPermitted at capture.

## Bugs noticed elsewhere

- The two in-flight test pins above.
- Any command refused through stage 1 still takes a sequence number, and `nextSeq` is hashed. So a refused command changes stateHash in every world, v1.0 included. This is not new, but the brief's "does not change the dish (stateHash)" holds only against a twin given an equal number of refused commands, which is what the tests assert.

## PROPOSED DECISIONS

1. **Payload and result shapes** as in item 1.
   - Flat kinds; `edges` as `[cell, 'R'|'D']` pairs. `open` is required for S03 and refused elsewhere; `flow` likewise for S04.
   - Optional result keys: `ids` (placed, or removed, ascending), `refused`, `exported`, `severed`. `HabitatSkips.device` and `.barrier` are present only when > 0.
   - Reason: older command logs stay byte-identical, and the note-or-counts pattern matches the Lab edits.
2. **An edge is refused beside stone or wall** (reason 'structure'), not beside a bead. Reason: a sealed cell holds nothing and no organism, while a bead is porous and the import allows it. The Lab still lets a stone be placed beside an S01–S03 later, because the import accepts that. Only S04 sides are protected.
3. **A removed resin's bound activity is exported in the command result only, with no ledger line.** Reason: activity is not a conserved material, and the saved command log keeps the result (D-0117).
4. **The basket's contents are its object.** moveDevice carries it, refused with 'object' when the destination already holds one. Other kinds never move objects. moveDevice is atomic on both paths, and "paused" is the UI's offer.
5. **Severing, not refusal**, for barriers placed across links, closed shutters and released samples.
   - A cut adhesion link also starts E12's relink lockout and clock reset on both ends, as every other E12 break does (adhesion.ts "every severed survivor gets the lockout").
   - A fungal event names its link kind, as removeAllLinks does.
   - Host and parasite pairs never straddle, because a parasite rides at its host's position.
   - Reason: a membrane is a real cut through a mat, and refusing would make fungal dishes unbuildable.
6. **wetBrush over cells that are all water wets nothing and allocates nothing** (accepted 0, 'nothing wetted'). Reason: allocating the moisture array changes the hashed state, and an accepted-0 command is no undo point, so allocating would be a hidden change that Undo could not reverse.
7. **Lab refusal, not removal** (D-0111 option a): the skip reasons `device` and `barrier`. They apply only to cells the old rule already accepted, so every v1.0 count is unchanged.
8. **A shelter in the Life preview is 'structure'.** No new outcome value, so no UI switch changes.
9. **Notes for the climate commands and empty stores:** "climate is not in this dish" and "structures are not in this dish". Both end with NOT_IN_DISH, so wave 11 can word them from content.
10. **Challenges** (D-0117 as written):
    - structure commands and the wetting brush are 'habitat';
    - the light mode and drying are 'lid';
    - setDevice, setLightMode and setDrying use up no action.
11. **PROTOCOL_VERSION stays 2.** The union widens, and the host passes any payload to applyNow (D-0107).
