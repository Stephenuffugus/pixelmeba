# Wave 14 fix-minors (2026-10-15)

I fixed all seven items. Each new test fails without its fix. I checked that with scratch mutants, using the script `/tmp/claude-1000/-workspaces-pixelmeba/a546fd4e-3f38-4676-afc9-7d7608ba566b/scratchpad/mutants.py`: it copies the file to a backup, applies one mutation, runs the targeted test file, restores the file and confirms the restore byte for byte. Every mutant run exited 1 with the failures listed below, and every file was restored afterwards. Nothing is committed and nothing is enabled.

## Items

1. **DONE (region pins, MINOR).**
   - **Fix:**
     - New function `drawRegionPinsInto(g, regions, zoom): number` at `src/render/regionPins.ts:141`. It clears the layer, draws each pin (outline stroke, light fill, then the digit dots filled dark) and returns the number of pins drawn. It draws on a structural `RegionPinSurface` (`regionPins.ts:128`; a PixiJS Graphics satisfies it), so the file still has no PixiJS import.
     - `src/render/renderer.ts:1639` `drawRegionPins` now only calls `drawRegionPinsInto(this.regionPinsG, this.regionPins, z)` and stores the count.
     - New getter `regionPinsDrawn` (`renderer.ts:1635`, field at `:316`) returns how many pins the last redraw drew.
   - **Tests:** four new cases under `tests/render/region-pins.test.ts:156` "a pin is drawn (fix-minors item 1)":
     - A recorder surface counts the calls: 3 pins, the outlines equal to the model, the stroke and fill colours, one rect per glyph dot. An empty list only clears the layer and returns 0.
     - A source check that `drawRegionPins` draws through `drawRegionPinsInto` into `regionPinsG` and that the getter exists.
     - A source check that `DishScreen.tsx` passes `dishInfo.value?.regions ?? []` to `setRegionPins` inside a `useEffect` with deps `[ready, info?.dishId, regionKey]`, and clears the pins on unmount.
   - **Fails without the fix:**
     - 1a: delete the `drawRegionPinsInto` call in the renderer → 1 failed.
     - 1b: make `drawRegionPinsInto` draw nothing (`pins.slice(0, 0)`) → 1 failed.
     - 1c: delete the DishScreen `setRegionPins(dishInfo…)` line → 1 failed.

2. **DONE (habitat-communities, MINOR).**
   - **Fix:**
     - `src/sim/recipes.ts:228` `applyRecipeOverrides`: `community` is now `o.community === true ? true : o.empty === true ? undefined : own`.
     - `recipes.ts:273` `withHabitatOverride` now also drops the recipe's own `community` when the habitat changes.
     - Result: a recipe's own community applies only on its own habitat and only when the start is not Empty. A habitat start gets a community only from `overrides.community`.
   - **Tests:** `tests/sim/habitat-recipe-rules.test.ts:49`, using a test-only recipe on H05 with `community: true` under `habitatRegistry()`:
     - Control: H05, not Empty → 10 founders of H05's species.
     - Empty → none.
     - Switch to H07 → none, and switching to WATER_GARDEN is no longer refused.
     - `{ empty, habitatId: H07, community: true }` → H07's 20.
   - **Fails without the fix:**
     - 2a: restore the old `own`-kept rule on Empty → 1 failed.
     - 2b: restore `withHabitatOverride` keeping `community` → 1 failed.
   - The fence and `habitats-p5-equivalence` were not touched, and both pass.

3. **DONE (habitat-geometry, MINOR).**
   - **Test:** `tests/sim/habitat-recipe-rules.test.ts:78`.
     - A test-only WATER_GARDEN with two S06 furnish areas, and a recipe with an S01 edge run and two devices. Furnish ids come first (1–5, in area order, cells row-major), then the recipe's edges (6–7), then its devices (8–9). `realizeRecipe` gives the same stores, with `nextDeviceId` 10.
     - A second case adds the habitat's own edges and device, and pins the full order: habitat edges, habitat devices, furnish, recipe edges, recipe devices.
   - **Fails without the fix:**
     - 3: swap `furnishOf` after the recipe's `edgesOf` (`recipes.ts:505`) → 2 failed.
   - No source change: the order was already right, it was just untested.

4. **DONE (habitat-communities, MINOR).**
   - **Test:** `tests/sim/habitat-recipe-rules.test.ts:138`.
     - A registry whose manifest drops B05 but still holds B05's definition and H07's group.
     - The H07 Suggested start is refused at realization with a `CommunityError` (also a `RecipeError`) at path `suggestedCommunity`, message "…Its Suggested Community needs B05 (not enabled)."
     - Control: under the full manifest the same start places 5 B05.
   - **Fails without the fix:**
     - 4: delete the `communityOfferProblem` throw (`recipes.ts:744`) → 1 failed.
   - No source change: the check was already there, it was just untested.

5. **DONE (saves, MINOR).**
   - **Fix:**
     - New shared registry-free checks in `src/sim/recipes.ts`:
       - `habitatRegionProblems(h, grid?)` (`:577`): region ids unique, rect bounds in order, each anchor inside the dish, inside its shape and on a cell the habitat's own geometry leaves open.
       - `communityGroupRegionProblem(h, i)` (`:597`).
       - `habitatRecordProblems(h)` (`:608`), which runs both.
     - `habitatShapeProblems` now calls the first two. Its issues and their order are unchanged, and `validator.test` passes.
     - `src/persistence/saveFile.ts:390` runs `habitatRecordProblems(c.habitat)` after `HabitatSchema` and refuses with the existing "The habitat definition is invalid."
   - **Tests:** new file `tests/persistence/habitat-import.test.ts`, on an H07 Suggested save edited as JSON and re-checksummed:
     - Control: the unedited save loads.
     - Each of these is refused through `parseSaveFile` (kind `content`) and through the worker's `importDish`, with no new dish and the open dish's tick and stateHash unchanged:
       - duplicate region ids (the groups were renamed too, so nothing else is wrong);
       - anchor `[0,0]`;
       - a group naming region `NOWHERE`.
   - **Fails without the fix:**
     - 5: delete the `saveFile.ts:390` line → 3 failed.
   - The rc1 and g2 corpora still load: `rc1-replay` and `g2-replay` pass (below).

6. **DONE (habitat-communities, NIT).**
   - **Fix:** `src/sim/recipes.ts:759` `placeCommunity` now throws `CommunityError` at `suggestedCommunity.groups.<k>.species` for a field virus (`isFieldVirus`; V01/V02), before `introduceOrganism` can throw its plain Error.
   - **Tests:** `tests/sim/habitat-recipe-rules.test.ts:160`, an H07 with a V01 group prepended:
     - `realizeRecipe` refuses with that `CommunityError` and path.
     - `communityRealizationIssues` returns exactly one error issue on `content/habitats/H07_GLASS_GARDEN.json` at `suggestedCommunity.groups.0.species`.
   - **Fails without the fix:**
     - 6: disable the check → 2 failed. The validator function throws the plain Error.

7. **DONE (habitat-geometry, NIT).**
   - **Fix:** `content/habitats/H07_GLASS_GARDEN.json:29` `guide.summary` now reads "Clear water rich in silicate, with two upright strips of mesh, one each side of the centre." It names no species.
   - **contentHash:** I ran `npm run content:validate -- --write` (content ok, 8 suggested communities realized).
     - Working tree before: `af7e8117f24b55b8db118e2683b3c666bcf8ecb90748237808ab18b3d40cb63b`
     - Now: `4a0340516c7cd46645872d4a87b741ec8f9b4f62609b54b8bcba66d6b3b24ff4`
     - HEAD's committed value was `2640a5f4…`.

## Files changed

- `src/render/regionPins.ts`, `src/render/renderer.ts` (region pin layer only)
- `src/sim/recipes.ts`
- `src/persistence/saveFile.ts`
- `content/habitats/H07_GLASS_GARDEN.json`
- `content/manifest.json` (contentHash only)
- `tests/render/region-pins.test.ts`
- New: `tests/sim/habitat-recipe-rules.test.ts`
- New: `tests/persistence/habitat-import.test.ts`

## Commands

- `npx tsc -p tsconfig.json --noEmit` → exit 0
- `npx eslint` on the seven changed or new .ts files → exit 0
- `npx vitest run` on the new and changed tests, the wave's own files and the related override, recipe-file and structure tests. That covers `tests/render/region-pins.test.ts`, `tests/sim/habitat-recipe-rules.test.ts`, `tests/persistence/habitat-import.test.ts`, `tests/fixtures/habitats-p5*.test.ts` (8 files), `tests/content/habitats-p5.test.ts`, `tests/persistence/phase5-import.test.ts`, `tests/content/validator.test.ts`, `tests/sim/recipe-overrides-env.test.ts`, `tests/persistence/recipe-file-community.test.ts` and `tests/content/recipe-structures.test.ts`.
  → `Test Files  17 passed (17)` / `Tests  217 passed (217)` / Duration 723.81s
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts tests/fixtures/habitats-p5-equivalence.test.ts`
  → `Test Files  11 passed (11)` / `Tests  79 passed (79)` / Duration 492.03s
