P2.7 Lab view is built and every check you asked for passes. The last full run of each test file came after my final code change. Nothing is committed and I did not edit docs.

## What each test proves
**`tests/sim/lab-commands.test.ts`** (21 tests, all pass):
- The brush footprint used for the on-screen preview is exactly the one the command uses.
- Painting water, gel or sediment changes only open cells. It leaves cells under a structure alone, skips cells outside the rim, moves no life, deposits or dissolved amounts, writes nothing to the ledger, and switches diffusion to gel's 0.025.
- Shade multiplies light by 0.1, painting twice does not darken further, and erasing sets it back to 1.0. A test ties the 0.1 to the SHADE entry in content.
- A wall seals empty cells and moves their contents exactly into the nearest open cells. Totals stay within 1e-12, no ledger input or export is written, the ledger check passes, and it still passes after a 300-tick closed-lid run.
- A stone placed on starch moves the starch and its nutrient aside exactly.
- Stone, wall and bead all skip cells holding a live organism (resting ones too), cells already holding a structure, and cells past the rim.
- Moved contents never cross an existing wall. A pocket with no open neighbour cannot be sealed, but a bead can go there.
- A bead moves nothing, lets solutes through and blocks swimmers.
- Erasing restores the substrate underneath (gel, or the recipe's water under its stones) and never removes the rim. A bead keeps what it held.
- Malformed commands are refused whole.
- Twin worlds and a save/reload give identical hashes. A command queued while running gives the same world as the same edit made paused, for every kind of edit.
- Through the real worker, each edit is one command, and Undo restores the exact hash.
- The preview rule and the command agree cell by cell.

**`tests/sim/view-switch.test.ts`** (7 tests, all pass). It runs the real UI state and Lab code against the real worker:
- Switching views many times sends no command and leaves the hash identical.
- The overlay is hidden in Explore and restored in Lab using view requests only.
- The Lab tool persists across switches; Explore goes back to Look.
- A stroke or tap interrupted by a switch commits nothing, and the input layer's half-finished stroke is cancelled.
- A dropped Lab stroke never turns into an Explore stroke.
- Switching while the dish runs gives the same hash as an unswitched copy at the same tick.
- Control case: a finished stroke sends exactly one undoable command, and Undo restores the hash.

**`tests/e2e/lab-tools.spec.ts`**, 4 tests on each of the 3 screen setups, 12 of 12 pass. The state hash is read from the worker itself; the app has no test hook.
- **Edits:** paint gel with the preview visible before release, place a wall, then erase it. A switch in the middle of a stroke commits nothing and the tool survives. Undo goes back exactly one step.
- **Observe:** one overlay at a time, legend shown, opacity 45 % → 70 % and saved as the setting. Switching back and forth leaves the hash unchanged.
- **Keyboard:** I, L, F and Esc.
- **200 % text:** no sideways scrolling, every control reachable at 48 px.
- Axe finds no serious or critical issues on these screens.

## Commands run
- `npx tsc -p tsconfig.json --noEmit`: exit 0, clean.
- `npx eslint` on every file I touched: clean.
- `npx vitest run tests/sim/lab-commands.test.ts tests/sim/view-switch.test.ts`: 28 passed.
- Also passing: `tests/worker/protocol.test.ts`, `host-requests.test.ts`, `host.test.ts`, `compare-client.test.ts` and all of `tests/ui` (35 tests).
- `E2E_PORT=4182 E2E_OUTDIR=tmp/dist-lab npx playwright test tests/e2e/lab-tools.spec.ts --project=phone-portrait --project=desktop --project=phone-landscape`: 12 passed in 13.5 min. Port 4182 is stopped.
- Worst-case timing: a radius-6 wall stroke across the whole dish takes about 170 ms, other edits 10–45 ms, and the ledger check still passes.

## Not done, and why
- **No keyboard-only way to paint.** You still need a pointer to paint a stroke.
- **Not wired into other screens.** UX §2.3 says New Dish opens in Lab with the Life tray open, but `NewDish.tsx` isn't mine. It needs one line calling `openLabWith('life')` from LabView. The Play shelf may also want to force Explore; the Lab view currently stays on until switched off.
- **Desktop e2e is slow on this machine.** Software rendering under load drops the page to about 5 fps, so a desktop test takes up to 2.9 min. I split the journey in two and gave each test a 7-minute timeout.

## Files
**Created:**
- `src/ui/views/LabView.tsx`: view state, input wrapper, keyboard, view toggle.
- `src/ui/views/LabToolbar.tsx`
- `src/ui/panels/LabTray.tsx`
- `src/ui/panels/LabTrayIcons.tsx`
- `src/ui/panels/OverlayPicker.tsx`
- `src/ui/panels/OverlayLegend.tsx`
- `src/ui/strings/lab.ts`
- `tests/sim/lab-commands.test.ts`
- `tests/sim/view-switch.test.ts`
- `tests/e2e/lab-tools.spec.ts`

**Changed, files I own:**
- `src/sim/grid.ts`: brush rules, footprint, where sealed contents go.
- `src/sim/structures.ts`: the four habitat edits.

**Changed, shared files (additions only):**
- `src/sim/commands.ts`: new command kinds, plus `skipped`/`moved` on the result.
- `src/worker/protocol.ts` and `src/worker/host.ts`: optional dish-info fields for the trays (species habitats, attachment surfaces, summaries, material summaries, which fields the dish has).
- `src/render/renderer.ts`: the brush preview, and resizing when the dish area changes size.
- `src/ui/gestures.ts`: optional stroke-start, stroke-move, cancel and hover hooks. One existing line gained braces.
- `src/ui/views/DishScreen.tsx`: input wrapper, key hook, toggle button, Lab toolbar, tray, legend.
- `src/ui/styles.css`: Lab styles appended.

**One file outside my list:** `src/ui/panels/CompareText.tsx` gained 4 new cases in `describeChange`. Adding command kinds breaks that exhaustive switch otherwise.

## Problems found elsewhere
- **Lineage specimen tap vs Lab tool:** The lineage agent's `placeSpecimenTap` sits inside the dish screen's tap handler. In Lab with any tool other than Inspect, the Lab tool takes the tap first. Specimen placement should call `selectLabTool('inspect')`.
- **Explore labels are too small:** Explore's action labels use 14 px, below the 16 px rule.
- **Overlay hidden on beads:** The overlay drawing hides every structure cell, beads included, even though beads hold dissolved material.

## Proposed decisions
- PROPOSED DECISION: Sealing a cell with stone or wall moves everything in it into the nearest open cells on the same side, in equal shares. It never moves across an existing structure. If there is no open neighbour, that part of the stroke is refused. This keeps the existing rule that stone and wall cells hold nothing, and nothing is created or destroyed. The amount moved is recorded in the command's result (kept in the save's command log) and shown to the player, not written as a ledger input or export. Beads move nothing.
- PROPOSED DECISION: For stone, wall and bead, "skips occupied cells" means a cell holding a live organism (any life state) or an existing structure. "Wall cannot cross the rim" means the stroke is clipped to the dish, with the cut-off cells reported as outside the rim.
- PROPOSED DECISION: Painting never changes the substrate under a structure, so erasing restores it. Shade can be painted on any cell inside the dish.
- PROPOSED DECISION: The Lab tool persists across view switches, and Explore returns to Look. A stroke in progress at a switch is dropped. The chosen Lab overlay is hidden in Explore and restored in Lab.
- PROPOSED DECISION: On phones, the brush cell count appears as a chip over the dish, so the toolbar never changes height (and the dish never resizes) under a finger.
- PROPOSED DECISION: Commands accept a radius above 0 and up to 6 (the UI only sends 1, 3 or 6). Malformed commands are refused whole: non-finite points, more than 20,000 points, or points far outside the grid.
- PROPOSED DECISION: The water, gel, sediment and shade paint materials exist in content (phase 2) but are not in `enabledMaterials`. The Lab uses the grid's own substrate and structure names plus the 0.1 shade constant, which a test ties to the SHADE entry. For the owner: either enable those materials in the manifest, or add stone, wall and bead records under `content/structures/` (currently empty) for the Field Guide.