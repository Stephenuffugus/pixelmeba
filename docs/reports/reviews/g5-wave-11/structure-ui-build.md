# Wave 11 · structure-ui · build report

Phase 5 wave 11, stage 2 (D-0119). This task builds the P5.1 and P5.2 screens on top of stage 1's protocol 3 APIs. No stage 1 file was edited, no sim file was edited, and nothing is enabled. The FENCE is unchanged.

## Checklist

| # | Item | Status | Where / proving test |
|---|------|--------|----------------------|
| 1 | Build group (S01–S12 from DishInfo.structureIds in CT §4 order, then Remove; content names and rules; 24 px SVG icons; S03 Open/Closed, default Open; S04 flow, default 1) | DONE | LabTrayContent.tsx:158 `buildTools`, `buildRecord`; LabTray.tsx:149 `buildItems`, :910 `BuildGroup`, `itemCopy` build branch, `ToolOptions` S03/S04 (`BoolChoice` :471); LabTrayIcons.tsx (13 new icons, plus IconWet); LabView.tsx `BuildToolId`, `buildShutterOpen`, `buildFlow`. e2e: structures.spec "Build group …" lists all 13 names and checks that S03 starts Open; "climate per dish …" checks the Garden has no `lab-build` |
| 2 | Edge snapping, previews, one command per gesture, two fingers cancel | DONE | src/ui/edgeSnap.ts:41 `nearestEdge` (midpoint; ties go to the lower edgeKey), :90 `snapStroke` (≤ 0.25 sampling, dedupe, cap 512), :125 `pickRemoveTarget`, :143 `strokeRemoveIds`; LabView.tsx:456 `showStructurePreview` (setEdgePreview / setBrushPreview 'device' and 'wet' / setRemovePreview; counts and reasons in the brush line), `payloadFor` :356 (placeEdges with open/flow, placeDevice, removeStructures ascending, wetBrush), `clearPreview` clears all three previews (cancel, two fingers, view switch). Tests: tests/ui/edge-snap.test.ts (13); e2e S01 stroke |
| 3 | Outcome words for every new kind, skippedText device and barrier, missingText, CompareText | DONE | src/ui/strings/structures.ts:162 `structureOutcome`; lab.ts:524–525 skippedText, `missingText` new kinds, habitatEditOutcome default → structureOutcome; CompareText.tsx:76 content names. Test: tests/ui/structure-words.test.ts (10) |
| 4 | Device settings sheet (On/Off, resin targets and bound and fill, Move only while paused with the visible reason, Remove, undoable, announced) | DONE | src/ui/panels/DeviceSheet.tsx; LabView.tsx:128 `movingDevice`, :515 `deviceMoveTap` (one moveDevice; the sheet follows the device to its new cell), plus an effect that drops a waiting move on Run and on Escape; state.ts sheet 'device'. e2e: "a heater …" (On, Undo → Off, Move disabled while running with "Pause to move a device.", enabled when paused, the move tap → "Moved the heater to cell 64, 34.") |
| 5 | Gate inspector (table with caption from edgeFactor/edgePermits, rules, S04 line, measured totals, shutter Open/Close, tracer while open and paused, cleared on close, Run and dish change) | DONE | src/ui/panels/GateSheet.tsx; strings/structures.ts:292 `gateRows`, `channelLine`, :345 `gateTotalsText`. Tests: tests/ui/gate-table.test.ts (6); e2e "the gate inspector …" (50 % ×3, Small Passes, Medium Blocked, sugar totals, note `data-paused` yes → no on Run → yes; shutter opened, row flips to Passes, button reads "Close it") |
| 6 | Wetting brush (Habitat tray, per dish on 'climate'; content name and rules; radii 1/3/6; preview 'wet'; one wetBrush per stroke) | DONE | LabTrayContent.tsx:138 `dishHasClimate`, `habitatTools` adds 'wet'; LabTray `itemCopy('wet')` → toolItemCopy('WET_BRUSH'); radius options; LabView payloadFor/preview. e2e: present on the fixture, absent on the Garden |
| 7 | Light mode and drying toggles (LidToggle pattern, client.environmentOf, toast quoting CT §12.2) | DONE | LabTray.tsx:748 `EnvironmentToggles`; ENVIRONMENT_COPY in strings/structures.ts. e2e: cycle toast "Day and night: 90 s day, 30 s dusk, 90 s night, 30 s dawn.", drying toast, aria-pressed follows the snapshot; absent on the Garden |
| 8 | New Dish Environment group (build-manifest gate, defaults from the preview, only changed keys reach startCustom) | DONE | src/ui/environment.ts; NewDish.tsx:74 `ENVIRONMENT_OFFERED`, :300 `EnvironmentGroup`, summary line; state.ts:714 `customDishSource` (used by startCustom). Test: tests/ui/new-dish-environment.test.ts (5). e2e: structures-environment.spec (absence test passed; group test skipped until the flip) |
| 9 | Warmth and moisture overlays with legends and units | DONE | OverlayPicker.tsx:20 (per dish on DishInfo.systems 'climate'); lab.ts OVERLAYS entries (the legend unit lines). e2e: both offered on the fixture, absent on the Garden |
| 10 | Inspector climate lines, light factors (Lab product, Explore words), edge lines with "Show gate", device line with "Settings" | DONE | src/ui/inspector/CellStructureLines.tsx; Inspector.tsx:809, :832; strings/structures.ts:431 `lightFactorText`, `warmthText`, `edgeLineText`, `deviceLineText`. e2e: cell-warmth "0.50", cell-moisture "1.00", cell-light "= baseline … day and night"; edge and device lines |
| 11 | Life brush shelterBlocked | DONE | LabTrayContent.tsx:219 (speciesFreeClass 'medium' or 'large'). AddLifeSheet builds no LifeBrush, so it is unchanged |
| 12 | Accessibility (names, Tab order, table with caption, CellDescription names edges and device, ≥ 48 px, ≥ 16 px, no meaning by colour alone) | DONE | All controls are buttons, checkboxes or labelled groups. The gate table has a caption, `th scope`, and a wrapper for overflow. CellDescription.tsx:46. Refused previews keep the renderer's cross. styles.css section "P5.1/P5.2". e2e: axe clean on the tools tray, device sheet, gate sheet and habitat tray; `expectReachable` (48 px) on the Build item, Settings, Show gate and the drying toggle; no horizontal overflow on desktop or phone-portrait |
| 13 | Journeys through an imported fixture (no dev flag); the Environment journey written and skipped | DONE | tests/e2e/structureFixture.ts, structures.spec.ts (4 tests), structures-environment.spec.ts. **First-run import result: ACCEPTED** by the production build (no JOURNEY refusal) |

### Done when

- The four unit files pass. tests/ui/*.test.ts and tests/worker/{host,whatif-ui,new-dish-preview-grid}.test.ts pass: `Test Files 41 passed (41) · Tests 307 passed (307)`.
- `npx tsc -p tsconfig.json --noEmit` is clean for my files. One error appeared mid-session in another agent's in-flight tests/worker/probes-gates.test.ts (`pool` redeclared); it was gone at the final run.
- `npx eslint` on every changed and new file exits 0.
- Journeys pass on desktop and phone-portrait: `34 passed, 2 skipped (41.1m)`. The skipped pair is the Environment group test on each project; the absence test passed on both.
- FENCE unchanged: `Test Files 12 passed (12) · Tests 96 passed (96)` (the fence plus my four unit files).

## Every screen and control, with its gate

| Control | Gate |
|---|---|
| Build group (S01–S12, Remove) | Per dish: DishInfo.structureIds (the recorded manifest). A v1.0 dish shows no Build group |
| Wetting brush | Per dish: DishInfo.systems includes 'climate' (D-0111), never the build's tool filter |
| Light mode and Drying toggles | Per dish: 'climate' |
| Warmth and moisture overlays | Per dish: 'climate' |
| Inspector climate, light factor, edge and device lines | Per dish: only when the CellInspect key is present (absent on a v1.0 dish) |
| Device sheet, Gate sheet | Per dish: reached only from those inspector lines |
| Move (device sheet) | Per dish, while paused (meta.speed 0). Run drops a waiting move |
| Gate tracer | While the gate sheet is open and the dish is paused |
| New Dish Environment group | Per build: this build's content/manifest.json enables 'climate'. It is absent until the flip |
| Life brush shelterBlocked | Per dish: DishInfo.speciesFreeClass |

## Files

**New**
- src/ui/edgeSnap.ts
- src/ui/environment.ts
- src/ui/strings/structures.ts
- src/ui/inspector/CellStructureLines.tsx
- src/ui/panels/DeviceSheet.tsx
- src/ui/panels/GateSheet.tsx
- tests/ui/edge-snap.test.ts, new-dish-environment.test.ts, gate-table.test.ts, structure-words.test.ts
- tests/e2e/structureFixture.ts, structures.spec.ts, structures-environment.spec.ts

**Changed** (all owned)
- src/ui/panels/LabTray.tsx, LabTrayContent.tsx, LabTrayIcons.tsx, LabTrayNames.tsx (`structureNameById`, `structureRecordById`)
- Inspector.tsx, OverlayPicker.tsx, CompareText.tsx
- src/ui/views/NewDish.tsx, LabView.tsx, LabToolbar.tsx, DishScreen.tsx (the two sheets only)
- src/ui/state.ts: sheet 'device' | 'gate'; `inspectedSelection` also covers the two sheets so the live CellInspect keeps flowing; `customDishSource` with environment
- src/ui/a11y/CellDescription.tsx, src/ui/strings/lab.ts, src/ui/styles.css

Not touched: OverlayLegend.tsx (its unit line already carries the legend text) and AddLifeSheet.tsx (it builds no LifeBrush).

## What each test proves, and the mutant that fails it

Each mutant was applied, run, reverted, and the file checked with `cmp` against a backup.

- **edge-snap.test.ts** proves:
  - each edge snaps to its own edge at its midpoint;
  - ties at a cell centre and at a grid corner go to the lowest edgeKey;
  - the result is null outside the grid or for NaN, and no border edge is ever returned;
  - strokes snap in stroke order, with dedupe, a single tap, and the 512 cap;
  - a diagonal drag gives a connected staircase (every edge shares an end with the next), on three diagonals;
  - the Remove rule works for a tap at the centre, within 0.3, near an edge, without a barrier, and with nothing, and a drag collects ids in ascending order.

  Mutant: the tie rule flipped to the higher key. It fails 2 tests.
- **new-dish-environment.test.ts** proves:
  - only changed keys are returned, in a fixed order, including for a habitat whose default is the cycle;
  - the summary words;
  - the group shows exactly when the manifest has 'climate' (the shipped manifest has none, so it is hidden now);
  - `customDishSource` with an untouched group is byte-identical (`JSON.stringify`) to the source made without the group, and changed keys arrive as RecipeOverrides keys.

  Mutant: drop the "differs from default" check. It fails 1 test.
- **gate-table.test.ts** proves that every row for all 6 codes equals edgeFactor / edgePermits, the CT §5.3 literal values for S01, S02 and the shutters, the S04 line for both flows, and the totals sentence for null, zero and non-zero tallies (including "less than 0.01").

  Mutant: field rows always read the 'dissolved' class. It fails 2 tests.
- **structure-words.test.ts** checks the sentence for every kind: accepted, partial with each refusal reason, refused whole (not in this dish, malformed), exported resin (one and two targets), basket, severed (singular and plural), unchanged, the climate commands, and skippedText's device and barrier parts absent at 0. Every sentence is checked against `/\b[SE]\d\d\b/`, so no id leaks.

  Mutant: drop skippedText's device part. It fails 1 test.
- **structures.spec.ts / structures-environment.spec.ts** are the e2e journeys described in the checklist. No screenshot assertions are used. The tracer is asserted through its note's `data-paused` rule, because the renderer has no state hook.

## Commands and results

- `npx vitest run tests/ui tests/worker/host.test.ts tests/worker/whatif-ui.test.ts tests/worker/new-dish-preview-grid.test.ts` → `Test Files 41 passed (41) · Tests 307 passed (307)`
- `lsof -t -i :4273 | xargs -r kill; E2E_PORT=4273 E2E_OUTDIR=tmp/dist-structure-ui npx playwright test tests/e2e/structures.spec.ts tests/e2e/structures-environment.spec.ts tests/e2e/lab-tools.spec.ts tests/e2e/new-dish.spec.ts tests/e2e/inspector.spec.ts tests/e2e/compare.spec.ts --project=desktop --project=phone-portrait` → `2 skipped · 34 passed (41.1m)`. Port 4273 was stopped after.
  - The earlier iterations failed twice, both in my own spec and both fixed:
    - the S01 toast was read in three steps and expired on slow SwiftShader; it is now one regex, and the structure toasts last 7 s;
    - on phone, the cell inspector covered the dish centre after the gate sheet closed; the journey now closes the inspector.
- FENCE: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts <my 4>` → `Test Files 12 passed (12) · Tests 96 passed (96)`
- `npx tsc -p tsconfig.json --noEmit` is clean. `npx eslint <27 files>` exits 0.

## FENCE notes

Unchanged. I touched no src/sim, src/worker, src/render or art file and ran no fence-update.

## NEEDS (worked around in my own files)

- **NEEDS:** `src/render/renderer.ts` `setBrushPreview` needs a 'move' rule, or `src/render/structurePreviewModel.ts` needs a `deviceMovePreview` that excludes the device's own cell and skips the cap (deviceMoveOutcome). The Move preview uses rule 'device' (devicePlacementOutcome), so with 256 devices in the dish a valid move would be previewed as refused, and a basket moving onto an object is not previewed as refused. The command's own result stays authoritative and is worded correctly.
- **NEEDS:** `src/render/renderer.ts` has no read-only state hook for the gate tracer, so the journey checks the note's visibility rule instead (as the assignment allows).
- **NEEDS (minor):** the worker has no one-off cell inspect. The device and gate sheets read the live CellInspect because state.ts `inspectedSelection` now also covers sheets 'device' and 'gate' (an owned change).

## Anything I would change in other tasks' files

- `src/sim/structurePreview.ts` / edge snapping: the midpoint rule, which is the assignment's rule and is implemented as specified, snaps samples within ε of a perpendicular grid line to that line's edge. A slightly off-line horizontal drag therefore picks up stray perpendicular edges; the preview shows them before release. A vertex-path snap would give cleaner lines (snap each sample to the nearest grid vertex, then join consecutive vertices along axis-aligned edges). This is an owner/lead call. The sim's own `nearestEdge` (nearest line) has the same property.
- `content/structures/*.json` have no `where` / `doesNotChange` / `watchFor` fields, unlike content/tools records. The Build item details take "Suitable habitats", "Dose" and "Does not change" from UI chrome (BUILD_COPY). Moving those into the records would make them content.

## Bugs noticed elsewhere

- Mid-session, tsc failed in tests/worker/probes-gates.test.ts (another agent's in-flight file: `pool` redeclared). It was clean at my final tsc.

## Proposed decisions

- **PROPOSED DECISION:** the gate totals sentence says "Measured since this barrier was placed: …", not "since the dish began". Reason: world.gateTally starts when the gate exists, and the honest-labels rule applies. "Nothing has crossed yet." covers both a null and an all-zero record.
- **PROPOSED DECISION:** the device and gate sheets keep the cell selection live by extending `inspectedSelection` to the sheets 'device' and 'gate'. Reason: there is no cell-inspect request, and this adds no protocol change.
- **PROPOSED DECISION:** the Remove tool's tie handling. A tap takes the cell's device when it is within 0.3 of the centre, when the nearest edge holds no barrier, or when the centre is nearer than that edge's midpoint; otherwise it takes the edge. A drag takes every barrier edge it snaps to and every device cell it passes. Reason: this is D-0119's rule made total.
- **PROPOSED DECISION:** the New Dish Environment defaults come from a preview requested without the group's picks. The summary states the effective environment; the founders and ledger summary is unaffected by the environment. Reason: a pick never becomes its own default, so `environmentOverrides` can drop unchanged keys.
- **PROPOSED DECISION:** after a device move, the device sheet re-opens on the device's new cell, or stays on the old cell when the move was refused. Run and Escape cancel a waiting move with nothing sent.
- **PROPOSED DECISION:** structure outcome toasts last 7 s, longer than the 4 s used for habitat edits, because they carry per-reason skipped counts.
- The S03 Open default, S04 flow 1 and the 0.3 Remove radius are D-0119's rulings, implemented as stated.
