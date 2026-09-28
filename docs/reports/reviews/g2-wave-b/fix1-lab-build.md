All eight Lab items are fixed. Every new test fails on the old code and passes now. `tsc`, `eslint` and the content validator are clean, and `lab-tools.spec.ts` passes on all three screen setups. I did not edit `host.ts` or `protocol.ts`; item 2 has one optional follow-up there (see "Changes needed in files I don't own").

## Items

**1. Sealing cost (MAJOR): FIXED.**
- `src/sim/grid.ts` now has `planSealing`, which replaces `displacementTargets`. It does one search outward from all the open cells at once, so each sealed cell learns its distance to the nearest open cell. A cell next to open water sends to its open neighbours. A cell further in sends to the combined targets of its sealed neighbours one step closer. That gives exactly the open cells at the least distance, never across an existing structure. Scratch memory is allocated once per command, not per cell.
- The rule is unchanged. Equal shares go to the nearest open cells on the same side, the last target takes the exact remainder, and a region with no open neighbour is refused whole.
- Test: `tests/sim/lab-commands.test.ts` keeps the old per-cell search as a reference and compares every field bit for bit on six strokes. These include a walled pocket that must be refused, and a diamond with many equally near targets.
- A timing test requires under 1.5 s for three radius-6 wall scribbles.

Timings with the verifier's probe (`perf2.ts`):

| Case | Before | After |
|---|---|---|
| Garden, line across | 63 ms | 28 ms |
| Garden, half-dish scribble | 370 ms | 54 ms |
| Garden, whole-dish scribble | 1,362 ms | 42 ms |
| Clear water, 40×40 block | 43 ms | 9 ms |
| Clear water, half dish | 514 ms | 24 ms |
| Clear water, whole dish (refused: 11,304 cells enclosed) | 8,346 ms | 21 ms |

Inside vitest while another e2e run was going: 111, 137 and 141 ms. A deliberately bad case with 385k cell-to-target pairs takes 40 ms to plan and 57 ms for the whole command.

**2. Content is data: FIXED**, with the host caveat below.
- **Manifest:**
  - WATER, GEL, SEDIMENT and SHADE are now in `enabledMaterials`.
  - A new optional `enabledStructures` lists BEAD, STONE and WALL.
  - The contentHash was rewritten.
- **Structure record:** added to `schema.ts` with `id`, `name`, `kind`, `guide`, `iconId` and `phase`. Behaviour is keyed by ID, the way modules are.
- **Structure files:** `content/structures/{STONE,WALL,BEAD}.json`, with the CT §4 names: Stone, Impermeable wall, Porous bead.
- **Validation** (`registry.ts`):
  - Unknown IDs, wrong order, and a phase later than the build are errors.
  - An enabled record the simulation doesn't implement is an error.
  - Enabled materials now get a phase check.
  - Paint materials must target something implemented.
  - Shade paint needs one factor in (0, 1], the same at every dose.
- **Simulation** (`structures.ts`): paints only with the world's recorded paint materials, and places structures only when the world's manifest enables them. Otherwise the edit is refused whole with a "not in this dish" note. The shade factor is read from the world's SHADE record; `PAINTED_SHADE` is removed.
- **Tray:** the new file `src/ui/panels/LabTrayContent.tsx` supplies names, purpose (summary), Changes (rules) and Watch for (example) from content. `lab.ts` keeps only the per-brush chrome plus the Remove shade and Erase structure tools. Tools that aren't available fall back to Inspect.
- **Content edits:** I changed the SEDIMENT and SHADE examples, which told players to add Siltworms and Turnleafs; neither is in this build.
- **Tests:**
  - The shade tie test now reads the factor from the world, and a world recording 0.25 paints 0.25.
  - A validator test covers the new errors.
  - An older save without these IDs goes through `loadSaveFile`: it loads, every habitat edit is refused, and it keeps running with a clean ledger.
  - In `view-switch.test.ts`, the same older save imported through the worker offers no paint or structure tools.

**3. Brush radius: FIXED.** Habitat edits must carry exactly 1, 3 or 6 (`isLabRadius`). The malformed-command test adds 0.5, 2, 4, 3.0000001 and "3". Every test that used 0.5 was rewritten for radius 1, with exact share checks for the stone-over-debris case.

**4. Mineral nutrients copy: FIXED** in `lab.ts`.
- **Changes:** new body needs nutrient as well as food, so where minerals are the limit it can let growth go on.
- **Does not change:** it is not food; it adds no carbon or energy.
- **Watch for:** where the inspector says growth is limited by minerals, whether growth goes on nearby.

**5. Life preview: FIXED.**
- `lifeCellOutcome` in `grid.ts` states the inoculate command's cell filter. The renderer uses it with the substrate and the species' recorded habitats and attachment (`lifeBrushFor`).
- Tests:
  - It matches `canOccupy` on every cell, for every species and its attached variant.
  - A Sunbead over painted gel shows the gel cells crossed out, and all 20 placed land on preview-OK water cells.
  - The UI's per-species rule equals the simulation's species table.

**6. Overlays and shade on beads: FIXED** (`layers.ts`). The overlay now draws on bead cells; stone, wall and outside stay clear. Painted shade now shows on any shaded cell, including beads. Tests are in `view-switch.test.ts`.

**7. Specimen tap vs Lab tool: FIXED** (`LabView.tsx`). While a specimen waits, `labTap` hands the tap to the dish screen, so it places the specimen whatever tool is selected. A drag pans instead of painting and the hover preview is hidden. Test: with the wall tool selected, the tap sends exactly one `lineage`/`spawnSpecimen` command. With no specimen waiting, the same tap places a wall, as the positive control. No change was needed in `DishScreen` or `LineageState`.

**8. Text sizes: FIXED.** `.actions .btn` and `.sheet .sub` now use `--fs-body` (16 px). I removed the 0.85rem inline size on the Play Garden sentence in `Play.tsx`. That is the owning component the item allowed; it is also a shared file for the What if? fixer, and the edit is one line. No `explore*.spec.ts` exists, so I ran `garden.spec.ts` and `place-and-undo.spec.ts` on phone-portrait, and they pass.

## Changes needed in files I don't own
- **Optional, `host.ts` / `protocol.ts`:** the world does not send its enabled structure list to the page yet. For now the tray treats it as known only when the dish's contentHash matches this build's. That is exact, because the hash covers the whole manifest. A dish saved under different content is offered no structure tools; the simulation refuses them there only if its manifest lacks the IDs, so such a dish could lose tools it actually has. To fix it, add `readonly structureIds?: readonly string[]` to `DishInfo` and `structureIds: w.content.manifest.enabledStructures ?? [],` in `DishHost.info()`. The tray already reads that field when present, and a test covers it.
- **`content/materials/NUTRIENT.json`:** the rules sentence "Adding nutrient alone creates no growth" can be read the same contradictory way as item 4. Suggested wording: "Nutrient alone is not food: it adds no carbon or energy."

## Proposed decisions
- PROPOSED DECISION: Sealing is planned by one outward search from the open cells. Each sealed cell's contents go in equal shares to every open cell at its least distance through cells sealed in the same edit, ascending, with the remainder to the last. This is the D-0024 rule, bit-identical to the old per-cell search, which a test keeps as the reference.
- PROPOSED DECISION: Structure records are keyed by ID to simulation behaviour, like modules. A record has `id`, `name`, `kind`, `guide`, `iconId` and `phase`, and no rule flags, because the grid implements stone, wall and bead. `Manifest.enabledStructures` is optional, and absent means none. This needs no world schema bump: nothing existing changes meaning, and older worlds keep their recorded ruleset, which a `loadSaveFile` test covers.
- PROPOSED DECISION: A world paints only with the paint materials its recorded content has. It places a structure only when its manifest enables it, and Erase structure needs at least one enabled structure. Otherwise the edit is refused whole with a "not in this dish" note.
- PROPOSED DECISION: The shade factor is the world's SHADE record dose. Content must give one factor in (0, 1] at all three doses, and a world recording another value paints that value.
- PROPOSED DECISION: In the Lab tray, Changes is the item's content rules text and Watch for is its content example. `lab.ts` keeps only brush chrome.
- PROPOSED DECISION: While a specimen waits for placement, the Lab gives up taps and drags to the dish screen.
- PROPOSED DECISION: Painted shade is drawn on every shaded cell inside the rim, and overlays are drawn on porous beads.

## Not in scope (report only)
- No keyboard-only painting (P3.11).
- New Dish still doesn't open the Life tray; it needs `openLabWith('life')` in `NewDish.tsx`, which wave C owns.
- For the owner, from the verifier: under the nearest-open-cells rule, a whole-Garden scribble packs about 5,458 C into roughly 56 open cells. Material is conserved, but local concentrations become extreme.

## Files changed
- **Owned:**
  - `src/sim/grid.ts`
  - `src/sim/structures.ts`
  - `src/ui/views/LabView.tsx`
  - `src/ui/views/LabToolbar.tsx`
  - `src/ui/panels/LabTray.tsx`
  - `src/ui/panels/LabTrayContent.tsx` (new)
  - `src/ui/strings/lab.ts`
  - `src/render/layers.ts`
  - `tests/sim/lab-commands.test.ts`
  - `tests/sim/view-switch.test.ts`
  - `tests/e2e/lab-tools.spec.ts` (the wall's name is now "Impermeable wall")
  - `content/structures/STONE.json` (new)
  - `content/structures/WALL.json` (new)
  - `content/structures/BEAD.json` (new)
  - `content/materials/SEDIMENT.json`
  - `content/materials/SHADE.json`
- **Shared, minimal edits:**
  - `src/render/renderer.ts` (brush preview only)
  - `src/sim/content/schema.ts`
  - `src/sim/content/registry.ts`
  - `tools/content-validate.ts` (adds a structures count to the output line)
  - `content/manifest.json` (IDs inserted, arrays sorted, hash rewritten)
  - `src/ui/styles.css` (two font sizes)
  - `src/ui/views/Play.tsx` (one inline style removed)

## Commands and results
- `npx tsx tools/content-validate.ts --write`: content ok, contentHash `efd5d6de…`, 3 structures.
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint` on every touched file: clean.
- `npx vitest run tests/sim/lab-commands.test.ts tests/sim/view-switch.test.ts`: 43 passed (29 + 14).
- Other vitest runs, to check nothing else broke:
  - `tests/content`, `tests/persistence`, `tests/recipes`, `tests/ui`, `tests/experiments/framework.test.ts`: 95 passed.
  - Worker `protocol`, `host-requests`, `host` and `compare-client` tests, plus `tests/experiments/light-and-life.test.ts`: 25 passed.
  - `tests/sim/modules.test.ts`, fixtures `determinism` and `conservation-closed-lid`, and `tests/tools`: 18 passed.
- `E2E_PORT=4182 E2E_OUTDIR=tmp/dist-lab npx playwright test tests/e2e/lab-tools.spec.ts --project=phone-portrait --project=desktop --project=phone-landscape`: 12 passed in 17.8 min. The spec's axe checks found no serious or critical violations, and its 200 % text and 48 px target checks pass.
- After a final small refactor of `LabTrayContent.tsx` (behaviour unchanged when the host sends no structure list), I re-ran `lab-tools`, `garden` and `place-and-undo` on phone-portrait only: 13 passed in 6.3 min.
- Port 4182 is stopped.