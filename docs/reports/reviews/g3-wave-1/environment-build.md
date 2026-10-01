# g3 wave 1 — environment builder (P3.1 Chemistry and environment materials, P3.2 Habitat presets and substrate rules)

Result: everything in the assignment is DONE. Nothing is committed (the lead commits). No FENCE change.

## Checklist

### Build P3.1
- DONE — Manifest: `enabledSystems += chemistry`; `enabledMaterials += ACID, BASE, BUFFER, CO2, INH_BACT, INH_FUNG, INH_PHOTO, METABOLITE, OIL, OXYGEN, PROTEIN, SALT`; `enabledHabitats += GEL_COLONY, SEDIMENT_EDGE` (content/manifest.json; lists sorted, nothing removed, no version field changed). `content-validate --write` → contentHash `59d708d2…eab93`. INH_* and `chemistry` went in the same edit.
- DONE — Chemistry tray: every enabled chemistry material in CT §5.1 order (nutrient, oxygen, CO2, acidifier, alkalizer, buffer, salt, three inhibitors). `CHEMISTRY_MATERIALS` is at src/ui/strings/lab.ts:38. The tray keeps that order (src/ui/panels/LabTray.tsx:118 `allowed.flatMap`) and lists only what the dish records. Doses 0.02/0.10/0.50 come from the records; the default is index 1 (0.10). Radius is 1/3/6, default 3. Proved by tests/e2e/chemistry-habitats.spec.ts.
- DONE — The Chemistry hint now reads "Change the water: minerals, gases, pH, salt and inhibitors. Each item says what it changes and what it leaves alone." (lab.ts:25). The e2e test asserts that "later update" no longer appears.
- DONE — The Food tray adds oil, protein and metabolite (`FOOD_MATERIALS` lab.ts:37). Every tray material has a `MATERIAL_COPY` entry with a unit (OIL … INH_PHOTO). The inhibitors share `inhibitorCopy()`.
- DONE — Habitat tray lid toggle: `LidToggle` (LabTray.tsx:414) has Open/Closed buttons with aria-pressed and sends `setLid`, an undoable command recorded in the log (commands.ts is unchanged). The state shown comes from the worker: `SnapshotMsg.lid` (host.ts:2129, protocol `SnapshotMsg.lid?`), cached per dish in `SimClient.lidOf` (client.ts:93), so a toggle mounted late still knows the lid. It is not a tray item, so `trayItems('habitat')` and the view-switch pins are unchanged. The e2e test covers closed → open → Undo → closed → open, with the buttons following the worker.
- DONE (cited, not duplicated) — Shade paint × 0.1 / erase → 1.0 and substrate paint: tests/sim/lab-commands.test.ts 'paint substrate (P2.7)' and 'shade (P2.7)'. Gas exchange, closed lid and pH/neutralization next to diffusion: tests/sim/transport.test.ts. src/sim/structures.ts was not edited.
- DONE — Rules verified in tests/sim/chemistry.test.ts. Every rule was already implemented in src/sim/transport.ts and suitability.ts/maintenance.ts; the stage 2 order is unchanged:
  - deposits never diffuse
  - DEBRIS adds 0.10 N/C as detritusN
  - oxygen is display-only (material 'none', no ledger entry); CO2 is ledgered carbon
  - neutralization
  - the pH formula, unclamped storage
  - salt diffuses and never decays
  - inhibitors decay 0.2 % per tick and act only on their category
  - film halves exposure once
  - growth × 1/(1+e) and damage 8e per second
  - lid, and sediment exchange × 0.1
- DONE — Enabling `chemistry` allocates inhBact/inhFung/inhPhoto at zero with material 'none'. The G2_LISTS world allocates none. Fence (b) is unchanged (trajectory-fence passes).
- DONE — Cell inspector lines (snapshot.ts:383 `chemistryLines`; protocol `CellInspect` optional `salinity`, `oxygen`, `lightBase`, `shade`, `exposure`; Inspector.tsx). It shows: substrate (Ground), pools, pH (now 2 decimals), Salinity, Oxygen, "Light 0.80 (habitat 0.80 × shade 1.00)", and "Inhibitor exposure" by category with growth factor, health per second and film halving. The readings come from the new src/sim/chemistry.ts: `phDisplay`, `cellPh`, `salinityIndex`, `INHIBITORS`, `inhibitorCategoryOf`, `exposureBreakdown`, `lightFactors`.
- DONE — Overlays added: oil, protein, metabolite, salt, inhBact, inhFung, inhPhoto (lab.ts:354–360). Each is listed only when the dish allocates the field.
- DONE — Swatches `sw-oil … sw-inh_photo` (styles.css). Each has its own colour and pattern.
- DONE — tests/content/material-guide-text.test.ts. Exceptions: NUTRIENT, SUGAR and DEBRIS (Phase 1 records; each has a reason). It also checks that every Phase 2–3 record contains the sentence.

### Build P3.2
- DONE — content/habitats/GEL_COLONY.json: gel, a rect water channel x 59–68 for every y, light 0.5, O2 0.8, CO2 0.5, nutrient 0.10, sugar 0.10, phase 3, guide.
- DONE — content/habitats/SEDIMENT_EDGE.json: water; a rect y 64–127 of sediment with light 0.15, O2 0.2, detritus 0.10 and detritusN 0.010; a stone disk of r 13 at (45,43); guide. The bound N value is a PROPOSED DECISION (below).
- DONE — Attachment surfaces: src/sim/attachment.ts (new). Surface bits are gel, sediment, stone edge (the same rule as grid.ts `isStoneEdge`), bead, and mesh (no cell offers mesh yet). The mask is cached on this world's `TransportCache` (`attach`, `attachVersion`; transport.ts `transportCacheObject` creates the cache without rebuilding coefficients). It is rebuilt when `grid.geometryVersion` moves, and there is no module-level cache. The bits of a species record are memoized in a WeakMap used only for lookup.
- DONE — The check sits in `habitatCompatible` (suitability.ts:46) and keys on `sp.def.attachment`. `canOccupy` is unchanged, so inoculate, births, recipe founders, specimen spawn and movement all apply it, and `suitabilityAt` gives 0 (SUIT_HABITAT) to an attached organism left in open water. On a bead an attached species needs 'bead' in its list, so B13 cannot use beads, as CT §1.3 lists.
- DONE — Life brush preview stays exact. `LifeBrush.surfaces?` and a 4th `stoneEdge` parameter for `lifeCellOutcome` (grid.ts:334/344). renderer.ts `setBrushPreview` passes `stoneEdgeAt(cell)` (renderer.ts:993, computed from its structure array). LabTrayContent `lifeBrushFor` sets `surfaces` only for attached species, so the view-switch `toEqual` pin is unchanged.
- DONE — The rule touches only species with attachment ≠ null. None of the five enabled species has one, so g2 worlds are unaffected (fence passes).
- DONE — Habitat paint keeps life, deposits and fields; the organism reacts only through suitability (habitat-presets 'habitat paint keeps life…', through `applyNow`).
- DONE — New Dish 'Start with' adds 'Empty Gel Colony' and 'Empty Sediment Edge' (NewDish.tsx:291/296; `START_HABITAT` :40).
  - Both are habitat-only starts (`empty: true` plus `habitatId`).
  - The summary states the habitat's rules text (what every cell holds) and "No life until you add it." (`new-dish-habitat`).
  - A preview map is drawn from the worker's `habitatGrid()` with the dish's own `paintDish` colours (role img, labelled).
- DONE — `habitatId` threads through:
  - `RecipeOverrides` (protocol)
  - host `build()`: validated as an enabled habitat, applied via the new recipes.ts `withHabitatOverride` (recipes.ts:169)
  - `recipeProvenance()`
  - `isAuthoredRecipe`: a different habitat is never the authored recipe
  - the authored-start re-realization path (host.ts:1499–1506)
  - `RecipeOverridesRecord` / `recipeOverridesOf` (recipes.ts:159, validated)
  - `startCustom` (state.ts:560)
- DONE — The preview returns `NewDishPreview.habitat.grid` (habitatGrid) and `habitat.rules`.

### Done when
- DONE — tests/sim/chemistry.test.ts (14 tests):
  - Acid 0.30 / base 0.20 filled everywhere, after one tick: acid `toBeCloseTo(0.10, 12)`, base exactly 0.
  - Each inhibitor is exactly v × (1 − 0.002) per tick (5 ticks, every cell, `toBe`).
  - A single dosed cell loses some to diffusion while the dish total is 0.499.
  - pH (0,0,0)=7, (0,3,0)=10, (0,6,0)=12 with base still stored as 6 (also kept through a full tick), (2,0,1)=6.
  - Salt Σ constant to 1e-12 over 1,000 ticks; a uniform dish stays exactly 0.5.
  - The exact CT §3.4 targets across all 38 records.
  - Film halves once (0.4 → 0.2, not 0.1).
  - Growth 1/(1+e); dmgInhib = 8 × e × dt; algae untouched.
  - Closed lid over 100 ticks: exchangeC/exchangeO2 = 0 and the fields are bit-identical.
  - Sediment exchange 0.002 vs water 0.02.
  - Shade × 0.1 changes only light, and lightFactors match it.
  - Each of the 16 field/deposit materials is ledgered by its own amount plus companion N; checkLedger holds through 50 ticks.
  - Deposits never move.
- DONE — tests/fixtures/habitat-presets.test.ts (7 tests):
  - Each preset is checked cell by cell against values written from CT §8.1: substrate, structure, lightBase, shade, effective light, pH 7, moisture 1.0/0.8, and every allocated field.
  - Class counts: WG water 10,798 / stone 506; GC channel 1,200 / gel 10,104; SE water 5,123 / sediment 5,652 / stone 529.
  - Initial ledger = totals = the per-cell preload sums; inputs 0.
  - Deterministic: stateHash and digest equal, also after a step.
  - Host New Dish starts equal the presets (digest), record `habitatId` in provenance, and the preview grid and rules equal the world.
  - An unshipped habitat is refused; Empty Water Garden keeps sugar 0.
  - A01 gets 0 / SUIT_HABITAT on gel. B02, built from its record, is refused in open water and accepted on gel, sediment, a stone-edge water cell and a bead; B01 is refused on the bead.
- DONE — tests/sim/attachment.test.ts (3 tests):
  - The mask equals an independent SPEC §2.2 computation before and after placing and erasing a stone, and after gel, sediment and bead paint.
  - Gel Colony, Sediment Edge and clear water, all at geometryVersion 1, each get their own exact mask (interleaved reads).
  - B02 inoculation in open water returns `{accepted 0, rejected 5}`; on sediment `{5, 0}`; at the stone rim every placed organism stands on a surface.
- DONE — tests/sim/lab-commands.test.ts 'Life brush preview' (3 tests):
  - Preview equals canOccupy cell by cell for every shipped species and their flipped-attached variants.
  - The same for B02 built from its record (and its flip) in Water Garden, Gel Colony and Sediment Edge with mixed paint, beads, a new stone and a wall.
  - Open water is 'habitat' for B02.
  - The Sunbead test is kept.
- DONE — tests/content/material-guide-text.test.ts (2 tests).
- DONE — tests/e2e/chemistry-habitats.spec.ts (2 tests), passing on phone-portrait, phone-landscape and desktop. The journey: New Dish → Empty Sediment Edge (summary and map) → Create (Lab, paused) → Chemistry → Salt dose 0.50, r 3, one tap while paused.
  - Inspector: salinity 0.50, pH 7.00, oxygen 0.80, light "0.80 (habitat 0.80 × shade 1.00)", exposure "None here."
  - Acidifier 0.50 → pH 6.50. Buffer 0.50 → 6.67 (7 − 0.5/1.5).
  - Lid closed/open/Undo/open. Time stays 0:00.
  - Axe is clean at each step.
  - The 200 % text test covers New Dish, the Chemistry tray (items, dose, radius, Use) and the cell inspector lines: no sideways overflow, 48 px targets (`expectReachable`), axe clean.
- DONE — content:validate --write passes.
- DONE — Unit regression: transport, lab-commands, view-switch, deposit-bounds, founders-newdish, tests/recipes/*, tests/worker/*, tests/content/*, tests/experiments/framework.test.ts.
- DONE — e2e regression (three projects): lab-tools, new-dish, inspector, whatif: 42 passed.

## Files
Created:
- src/sim/attachment.ts
- src/sim/chemistry.ts
- content/habitats/GEL_COLONY.json
- content/habitats/SEDIMENT_EDGE.json
- tests/sim/chemistry.test.ts
- tests/sim/attachment.test.ts
- tests/fixtures/habitat-presets.test.ts
- tests/content/material-guide-text.test.ts
- tests/e2e/chemistry-habitats.spec.ts
- this report

Changed (owned): src/sim/transport.ts (cache fields `attach`/`attachVersion`, `transportCacheObject`), src/sim/suitability.ts (`habitatCompatible`).

Changed (shared, additive):
- content/manifest.json
- src/sim/grid.ts (LifeBrush, lifeCellOutcome)
- src/sim/recipes.ts (RecipeOverridesRecord.habitatId, recipeOverridesOf, new `withHabitatOverride`)
- src/render/renderer.ts (setBrushPreview life rule plus private `stoneEdgeAt`)
- src/worker/protocol.ts (RecipeOverrides.habitatId, NewDishPreview.habitat.rules/grid, CellInspect chemistry fields, SnapshotMsg.lid)
- src/worker/host.ts (build, recipeProvenance, isAuthoredRecipe, authored-start transform, newDishPreview, snapshot `lid`)
- src/worker/snapshot.ts (`chemistryLines`)
- src/worker/client.ts (`lidOf`)
- src/ui/state.ts (startCustom)
- src/ui/panels/Inspector.tsx
- src/ui/panels/LabTray.tsx
- src/ui/panels/LabTrayContent.tsx
- src/ui/strings/lab.ts
- src/ui/views/NewDish.tsx
- src/ui/styles.css
- tests/sim/lab-commands.test.ts (Life brush describe only)
- tests/sim/founders-newdish.test.ts: one pinned line. `toEqual` on `p.habitat` became `toMatchObject` plus rules and grid checks, because the preview habitat gained `rules`/`grid`. This file was not on my list, but the assignment required the change.

Out-of-list touches to flag:
- `SnapshotMsg.lid` and `SimClient.lidOf`, needed so the lid toggle shows the world's real setting. state.ts was off limits, so I did not add lid to `meta`.
- NewDish's map imports `paintDish`/`DISH_TEX` from `@render/layers`. OverlayLegend already imports from there.

## How each test fails without its mechanism (checked)
I ran mutants through a temporary vitest config in tmp/ (deleted afterwards) that `vi.mock`s one module and imports the real test files.
- `onAttachmentSurface → true`: attachment 'inoculating … refuses open water' fails (`{accepted 5, rejected 0}`), and habitat-presets 'Velvet is refused in open water' fails.
- `lifeCellOutcome` ignoring `surfaces`: the 'Velvet (B02 …) preview' test fails with 10,141 mismatches in Water Garden.
- `GAS_EXCHANGE_SEDIMENT_FACTOR = 1`: the sediment test fails. `INHIBITOR_DAMAGE = 1`: the growth/damage test fails. `phDisplay` without clamp or buffer: the pH test fails (13 ≠ 12).
- Inhibitor targeting, neutralization and decay are exact-value assertions on existing code (`toBe` on v × 0.998, acid toBeCloseTo 0.1 and base 0). The fence/manifest test checks that the g2 lists allocate no inhibitor fields.

## Commands
- `npx tsx tools/content-validate.ts --write` → `content ok · contentHash 59d708d2f08b69ca874de91742ff9d84c27592669a49fac3ef8822b6095eab93 · … habitats 3 …`
- `npx tsc -p tsconfig.json --noEmit` → clean. Earlier runs showed errors in other builders' in-flight files (sampleSlot.ts, migration.test.ts, world-stores.test.ts); none were in mine, and the final run is clean.
- `npx eslint <my 24 files>` → clean. `prettier --check`: my new files and NewDish.tsx / founders-newdish.test.ts (clean at HEAD) are clean. The other shared files were already prettier-dirty at HEAD and were not reformatted.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence` → `Test Files 5 passed (5) · Tests 40 passed (40)` (with the new manifest).
- Final gate: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/sim/chemistry.test.ts tests/sim/attachment.test.ts tests/fixtures/habitat-presets.test.ts tests/content tests/sim/transport.test.ts tests/sim/lab-commands.test.ts tests/sim/view-switch.test.ts tests/sim/deposit-bounds.test.ts tests/sim/founders-newdish.test.ts` → `Test Files 20 passed (20) · Tests 165 passed (165)`
- `npx vitest run tests/worker tests/recipes tests/experiments/framework.test.ts` → `Test Files 12 passed (12) · Tests 193 passed (193)`
- e2e (port 4212, tmp/dist-env):
  - Run 1, chemistry-habitats on phone-portrait and desktop: 3 passed, 1 failed. The desktop lid step timed out clicking 'Open' on a very slow, software-rendered run.
  - Run 2, after adding `expectReachable(open)` only, on phone-landscape and desktop: 3 passed, 1 failed. Desktop failed on `.toast` "Lid closed", a 4 s toast that had gone before the assertion ran.
  - I then removed the toast dependency; the test now asserts the worker-driven aria-pressed state, Undo enabled, and an Undo round trip.
  - Final: `-g "lid toggles"` on all three projects → 3 passed. The 200 % test passed on all three projects in the earlier runs.
  - Regression: `lab-tools, new-dish, inspector, whatif` × 3 projects → `42 passed (45.6m)`.

## FENCE
None. Enabling `chemistry` adds all-zero post-g2 fields only, and the four fence files plus g2-replay pass unchanged.

## Bugs or gaps noticed elsewhere (not fixed)
- `livesHereText` (the habitat paint "Lives here in this dish" line) reads only recorded habitats. Once B02 or the fungi ship (wave 2), it will say Velvet lives in water. It should apply the attachment surfaces (open water: "needs a surface"). This belongs to whoever enables B02.
- The ACID guide text says Bubble and Sourbud release acid per carbon. That holds only once Y01/B11 and acid emission ship, which is not this wave's concern, but it is worth checking when they land.
- The cell inspector shows pH with 2 decimals now (previously 1). No test pinned the 1-decimal form.

## PROPOSED DECISIONS
1. PROPOSED DECISION: SEDIMENT_EDGE preloads 0.010 bound nutrient (detritusN) per sediment cell, 0.10 N per C. That is the DEBRIS material's ratio and FIRST_DISH_V1's debris patch ratio (0.25 C / 0.025 N). CT §8.1 gives only "detritus 0.10", and debris anywhere else in the game carries companion N, so carbon-only debris would be the odd case.
2. PROPOSED DECISION: Habitat starts on another preset drop the recipe's backgroundOverrides, so FIRST_DISH_V1's `sugar: 0` does not apply (recipes.ts `withHabitatOverride`).
   - The dish then equals CT §8.1 exactly: Gel Colony keeps sugar 0.10 per cell.
   - Its New Dish note and summary do not say "no food". The summary quotes the habitat's rules text, which names the sugar.
   - 'Empty Water Garden' (the recipe's own habitat, no `habitatId` sent) is unchanged and keeps its "no food" wording and sugar 0.
3. PROPOSED DECISION: On a porous bead cell, an attached species needs 'bead' in its own surface list. The bead cell offers only the 'bead' surface, not its substrate's gel or sediment. So B13 (gel, sediment, mesh, stone edge) cannot use beads, which matches CT §1.3's per-species lists. Free-living species still cannot enter beads.
4. PROPOSED DECISION: The lid toggle reads the world's lid from snapshots (`SnapshotMsg.lid`, cached in `SimClient.lidOf`). It is an additive optional reply field, so PROTOCOL_VERSION stays 1.
