# g3 wave 3 — food-objects build report (P3.6 part 3: finite food objects, M10 pellet, M11 wafer)

## Checklist

### Build
- DONE placeObject command: src/sim/commands.ts:41-42 (payload kind), :139-140 (case) → src/sim/objects.ts:226 placeFoodObject. Refuses on a cell that already holds an object, on any structure (stone, wall, bead), outside the rim or off the grid, at the cap with 'The dish holds up to 128 food objects' (OBJECT_REFUSAL, objects.ts:203), and in a world without the foodObjects system, the material or its target fields. Organisms never block. A refusal is {accepted 0, rejected 1, note} and changes nothing but nextSeq. Accepted: recordInput 'tool:M10'/'tool:M11' of the full inventory (objects.ts:243; CT §5.2 inventories in FOOD_OBJECT_RULES, objects.ts:191). Tests: food-objects.test.ts:56, :70, :81, :88, :124.
- DONE Stage 3 release before enzymes: conversion.ts:42 calls releaseFoodObjects (objects.ts:256) before the enzyme loop. Objects are released in id (store) order. objectReleasePlan (objects.ts:292) gives the pellet 0.002 C/tick with N = n × r / C remaining, and the wafer 0.0012 starch C + 0.0008 protein C per tick into starch/starchN and protein/proteinN, with N split by carbon (0.10 N per C, the wafer's own ratio). Release never exceeds the inventory. The last transfer moves the exact remainder of C and every remaining N. The object then leaves the store, and 'objectEmptied' is emitted once (objects.ts:263; detail cell, kind, id). The moves are internal. markField is called on the targets. e1-producers' recordReaction call in conversion.ts is kept. Tests: :167, :226, :265, :340.
- DONE Objects never move, diffuse or get eaten directly: nothing outside stage 3 and sampling reads the store. A world without objects runs bit-identically (releaseFoodObjects returns at once). The fence passes (below).
- DONE Structures never cover an object: structures.ts:275-281 (Lab part only). It counts HabitatSkips.object, an optional field that is present only when > 0, so older results keep their shape. grid.ts:279 adds a 'place' rule outcome 'object', and grid.ts:283 adds a new tap rule 'object'. Tests: :137 (stone, wall, bead, with brushCellOutcome agreeing cell by cell), :159.
- DONE Preview: renderer.ts:1262 setBrushPreview builds object cells from SnapshotMsg.objects for the 'place' and 'object' rules. grid.ts imports no sim modules (G7 kept).
- DONE events.ts:33 EventType 'objectEmptied'. snapshot.ts:393 visualEvents passes it through with its cell. snapshot.ts:619/624 objectLine adds the cell's object (id, kind, C per pool, N) to inspectCell. protocol.ts:749 adds the optional CellInspect.object. Inspector.tsx:138/718 shows "Leaf wafer: 5.400 starch C, 3.600 protein C and 0.900 N left."
- DONE CompareText.tsx:59 describeChange case 'placeObject'.
- DONE Lab Food tray: LabView.tsx:74 adds LabToolId `object:<id>`. LabView.tsx:262 payloadFor: one tap = one undoable placeObject. LabView.tsx:358 shows a one-cell hover preview with rule 'object'. sendLabCommand shows the objectOutcome toast. LabTray.tsx:148 lists the items after the brushed foods, :220 sets categoryOf, :334 builds itemCopy. lab.ts:60 FOOD_OBJECTS, OBJECT_COPY, :83 objectOutcome, :529 skippedText "held a food object". styles.css:1359 adds the .sw-m10/.sw-m11 swatches. The Explore FeedSheet FOODS list is unchanged.
- DONE manifest: enabledMaterials += M10, M11 and enabledSystems += foodObjects (one edit, sorted). `npx tsx tools/content-validate.ts --write` → contentHash cef0ea56…; content ok.
- DONE trajectory.ts: no registration needed. trajectoryDigest(world,'full') already hashes `objects` through the generic post-g2 world-store loop, because it differs from a fresh world's []. The save/reload test compares trajectoryDigest 'full'.

### Done when
- DONE food-objects.test.ts (16 tests, all pass):
  - Placement ledgered exactly (+10 C, +1 N), tests :56/:70.
  - Pellet: exactly 0.002 C per tick, N within 1e-15 of 0.0002. Stage 3 adds exactly the plan to the cell. 5,000 ticks. The last transfer is 0.0019999999999917983 C plus all remaining N. C and N reach exactly 0 and never go negative. Ledger roundoff is unchanged. Test :167.
  - Wafer: both pools at rate × dt to the last tick. N/C stays 0.10 (per-tick |nN − 0.1 c| < 1e-17, cell |N − 0.1 C| < 1e-12). It lasts 5,000 ticks. Test :226.
  - Released sugar is eaten in stage 6 of the same tick, test :265.
  - C and N close every tick for 6,000 ticks with B01 and B06 feeding (worst rel. error < 1e-9), test :276.
  - Cap, occupied, structure, outside and no-system refusals: state hash equal with nextSeq restored, and no ledger entry. Tests :88, :124.
  - Stone, wall and bead on an object cell are refused and brushCellOutcome agrees, test :137.
  - Save/reload mid-release gives the identical stateHash and trajectoryDigest, and 1× equals four quarter runs, test :312.
  - objectEmptied fires once per object (at tick 4999), with cell and kind, and reaches visualEvents, test :340.
  - Cell inspector line, test :362.
- DONE tests/e2e/food-objects.spec.ts (desktop; new Sediment Edge Lab dish). Steps: Food → Leaf wafer (details, 48 px item, text ≥ 16 px, axe) → tap → one wafer at the tapped cell, fill 1, read from the 'snapshot' messages through an init script that wraps Worker → second tap refused ("already holds a food object") → run at 4× until the drawn fill step falls from 3 to ≤ 2 (fill strictly falling across snapshots) → cell inspector "Leaf wafer: … starch C, … protein C and … N left", consistent with the snapshot fill → axe clean.
- DONE Non-vacuity, checked by mutation in this session and then restored:
  1. `t = r` instead of the remainder: "a pellet releases…" fails with `expected -8.2e-15 to be ≥ 0`, and "a wafer releases…" fails.
  2. Skipping recordInput: "placing a pellet…" fails with `expected +0 to be 10`, and "placing a wafer…" and "refusals…" (ledger closed) also fail.
  3. Dropping the 'place' object check in grid.ts: all three "a stone/wall/bead stroke over a pellet…" tests fail.
- DONE Fence unchanged (below).

## Files
- Created: tests/fixtures/food-objects.test.ts, tests/e2e/food-objects.spec.ts, this report.
- Changed (owned): src/sim/objects.ts, src/sim/conversion.ts, src/sim/grid.ts, src/render/renderer.ts.
- Changed (shared, additive): content/manifest.json, src/sim/commands.ts, src/sim/structures.ts (Lab part), src/sim/events.ts, src/worker/snapshot.ts, src/worker/protocol.ts, src/ui/panels/Inspector.tsx, src/ui/panels/CompareText.tsx, src/ui/views/LabView.tsx, src/ui/panels/LabTray.tsx, src/ui/strings/lab.ts, src/ui/styles.css.
- Changed OUTSIDE my list, one line each, needed for the tool to work and to tell the truth:
  - src/ui/panels/LabTrayContent.tsx toolAvailable: `object:<id>` is available when the dish records that object material. Without it, LabToolbar resets the tool to Inspect and the item cannot be selected; the first e2e run failed on exactly that.
  - src/ui/views/LabToolbar.tsx StripInfo: an object tool shows the tap hint, not "Drag on the dish to paint".

## Commands (this session)
- `npx tsc -p tsconfig.json --noEmit`: clean (last run after all edits).
- `npx eslint` on every changed file plus both tests: clean.
- `npx vitest run tests/fixtures/food-objects.test.ts`: Test Files 1 passed (1); Tests 16 passed (16).
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/food-objects.test.ts tests/content/atlas.test.ts tests/content/material-guide-text.test.ts tests/content/system-requirements.test.ts tests/sim/lab-commands.test.ts tests/sim/view-switch.test.ts tests/ui/feed-modules.test.ts tests/ui/inherited-differences.test.ts tests/worker/host.test.ts tests/worker/protocol.test.ts tests/helpers/trajectory.test.ts`: Test Files 18 passed (18); Tests 202 passed (202).
- `E2E_PORT=4233 E2E_OUTDIR=tmp/dist-food-objects npx playwright test tests/e2e/food-objects.spec.ts --project=desktop`: 1 passed (2.4m). The port was stopped before and after.

## FENCE
None. All four trajectory-fence files and g2-replay pass with the manifest change: foodObjects allocates no fields, and objects exist only after a placeObject command.

## Bugs or notes elsewhere
- tests/sim/view-switch.test.ts passed in my batch but now fails 3 tests. The Tools tray now lists sample/transfer items (tools-sample's in-flight edit); those tests pin the Tools tray list. This is not caused by this work.
- Inspector detail rows (.kv, --fs-small 14 px), including the new food-object line, are below UX §4.1's 16 px. This is the known deferral to P3.11 in DECISIONS.md. The e2e asserts that the new line matches the inspector's other rows.
- Recipes and experiment cards cannot schedule placeObject (the content schema's command union has no such kind). CT H04 Leaf Pool (Phase 5) needs wafers in baskets, so whoever builds that adds it.
- An imported object holding a pool its kind does not release (e.g. a pellet with starch) would never empty. The import accepts any pool. It could refuse pools outside FOOD_OBJECT_RULES[kind]; suggest this for saveFile/foodObjectProblem.

## Proposed decisions
- PROPOSED DECISION: if a full-rate transfer would leave a pool with less than OBJECT_DUST_C = 1e-9 C, the whole pool moves now. Repeated subtraction otherwise leaves the wafer's starch at 3.8e-13 C for a 5,001st tick of dust. The pellet's 5,000th-tick remainder (0.0019999999999918 C < 0.002) is unaffected. The transfer stays within inventory, and nothing is zeroed or logged as roundoff.
- PROPOSED DECISION: object nutrient release is proportional for both kinds: n × released C / remaining C, split across pools by carbon, with the last releasing pool taking the remainder. The emptying transfer moves exactly the remaining n. For the wafer (1 N / 10 C) this is SPEC §5.1's "0.10 N per C" without a second hard-coded ratio.
- PROPOSED DECISION: a structure stroke skips object cells and reports them as HabitatSkips.object, an optional field present only when > 0, so every pre-P3.6 result keeps its shape. The Lab toast says "N held a food object". The food-object tap uses its own brush rule 'object': any structure or an existing object refuses, and organisms never do.
