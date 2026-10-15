# Wave 14 build report: Suggested Communities (P5.4 part 2, habitat-communities)

Suggested Communities are now realized, recorded, refused where they are not offered, and previewed. All eight habitat records carry the D-table's communities. Nothing is enabled: content/manifest.json changes only its contentHash.

- The FENCE passes unchanged. Every fence file passed in the full run except determinism-g3, which timed out at 120 s while the load average was 16; it passed when re-run on its own.
- The stage 1 golden (habitats-p5-equivalence) is unchanged.
- No commits were made, and tools/fence-update.ts was not run.

## Checklist: Build

- **Item 0: protocol names. DONE.** All are optional, with no PROTOCOL_VERSION change.
  - `src/worker/protocol.ts:87`: `RecipeOverrides.community?: boolean`.
  - `NewDishPreview.habitat.uses?: readonly { id; name; count }[]` and `NewDishPreview.habitat.regions?: readonly { id; label; number }[]`, in the `habitat` object.
  - `NewDishPreview.community?: boolean` (:1835).
  - `NewDishPreview.communityGroups?: readonly { speciesId; name; count; regionLabel }[]` (:1840).
  - All of these are absent unless they apply. `community` is present only as `true`.
- **Item 1: records. DONE.** `content/habitats/H04…H11` gained `suggestedCommunity`, with groups in the D-table's order. H10's patch is `[{center:[55,64], radius:6, substrate:'water', add:{starch:0.5}, label:'Starch'}]`. Guide texts are unchanged. contentHash `d2da52398479f059f83c57c6bff5e80e4bbb17a76433baf794f8b35bef1dc002` → `af7e8117f24b55b8db118e2683b3c666bcf8ecb90748237808ab18b3d40cb63b`.
- **Item 2: stream. DONE.** `src/sim/rng.ts:30`: `STREAMS.communityPlace = 'community.place'`, keyed by the group index. It is used only by `placeCommunity`.
- **Item 3: realization. DONE.** `src/sim/recipes.ts`:
  - `realizeRecipe` refuses `community: true` on a habitat without one (:740): "recipe <id>: habitat <hid> has no Suggested Community".
  - `placeCommunity(world, habitat, used)` (:696) is called after the recipe's founders and before the scheduled commands (:859). It runs in this order:
    1. The offer rule, against the world's recorded manifest (`communityOfferProblem`).
    2. Each community patch, through the shared `applyFieldPatch` (:648). The recipe patch code was moved into it unchanged, and the golden is equal. Input: `community:<hid>:patch<n>[:label]`.
    3. Each group k:
       - Eligible cells: `diskCells(anchor, radius)` taken row-major, filtered by `inMask`, `regionContains`, `canOccupy` and the shared `used` array.
       - Fewer than `count` cells → `CommunityError` (a RecipeError subclass with `path`): "habitat <hid>: its Suggested Community has only <n> valid cells for <count> <species name> in <region label>".
       - Otherwise, the first `count` of `detPermutation(eligible.length, seed, STREAMS.communityPlace, k)`, each placed with `introduceOrganism(world, spIdx, cell, 'community:<hid>', { exactCenter: true, origin: 1 })`. The input is `introduce:community:<hid>`, and the founder mode applies through `introduceOrganism`.
  - Without `community: true`, the old code path runs.
- **Item 4: override. DONE.** In `recipes.ts`:
  - `RecipeOverridesRecord.community?` added.
  - `applyRecipeOverrides` adds `community: true` after `empty` and the habitat override (:230).
  - `hasRecipeChanges` counts it (:247).
  - `recipeOverridesOf` requires a boolean (:292).
- **Item 5: worker. DONE.** `src/worker/host.ts`:
  - `build()` refusals (:2181–2190), each raised before anything is built:
    - a habitat this build does not offer (`habitatOffered`) → `There is no habitat "<id>" in this version of Pixelmeba.`
    - community not a boolean → `Unknown community setting "<v>".`
    - community without `empty: true` → `A Suggested Community starts from an empty habitat.`
    - community not offered on `o.habitatId ?? recipe.habitatId` → `There is no Suggested Community for <habitat name> in this version of Pixelmeba.`
  - `recipeProvenance` records `community: true` only when given (:2226).
  - `isAuthoredRecipe` requires `o.community !== true` (:2271).
  - `freshStart` was not changed: it goes through `applyRecipeOverrides`, and a test proves it rebuilds the dish exactly.
  - `newDishPreview` (:3403–3450):
    - The grid now comes from `recipeGrid(habitat, TRANSFORMED recipe)`. It used the untransformed recipe before; for every v1.0 start the two are equal, and a test proves it.
    - `patches` = the transformed recipe's patch labels, then the community's patch labels.
    - `habitat.uses` comes from `habitatUsesOf` (:3459): edges by kind, then devices and furnishings by kind, then objects by material, each group sorted by id and counted in the world at tick 0.
    - `habitat.regions` comes from the world's habitat record.
    - `community` and `communityGroups` come from `communityGroupsOf` (:3481), which counts the generation-0 organisms placed for each group's species.
- **Item 6: recipe files. DONE.** `src/persistence/recipeFile.ts`:
  - `'community'` is an allowed override key (:510).
  - A non-boolean value → `damaged('overrides.community')` (:534). Community true without `empty` true → `damaged('overrides.community')` (:536). This last refusal is my addition (proposed decision 3).
  - Community true where this build does not offer it → the compatible-build result (:540–544).
  - `onlySeed` counts community (:178).
- **Item 7: content validator. DONE.** `tools/content-validate.ts`:
  - `export function communityRealizationIssues(registry, habitatFiles, recipeId = 'FIRST_DISH_V1')` (:509) is run from `main` (:560).
  - It realizes every habitat whose habitat and community are both offered, using the registry with that habitat added to `enabledHabitats`.
  - A RecipeError is reported as `ERROR <file> → suggestedCommunity.groups.<k>: <message>`. This uses the tool's existing `→` format.
  - The summary line now says `suggested communities 8 realized`.
  - A comment explains why one seed proves every seed.
- **Item 8: fence drafts. DONE.** The three files are in `tests/fixtures/habitats-p5/fence-drafts/`: `FENCE_H06_DUSK_COMMUNITY.json`, `FENCE_H09_DRYING_COMMUNITY.json` and `FENCE_H10_GATE_CYCLE.json` (the last has `lightMode: 'cycle'`).
  - Each has revision 1, seed 104729, `mutationPreset 'standard'`, `founderMode 'identical'`, `founders []`, `community: true` and phase 5.
  - None sets a lid, so the habitat's own lid and drying apply. Only H10's draft sets a light mode.

## Checklist: Done when

- **My test files pass. DONE.**
  - `habitats-p5-community` (28 tests)
  - `habitats-p5-community-determinism` (8)
  - `habitats-p5-community-conservation` (2)
  - `new-dish-habitats` (13)
  - `recipe-file-community` (3)
  - `habitats-p5-fence-drafts` (5)
- **The named tests pass. DONE, after two stage 1 assertions were updated.** The batch (stage 1's `habitats-p5{,-determinism,-conservation}`, `tests/content`, `tests/recipes`, worker `whatif`/`host`/`new-dish-preview-grid`/`new-dish-environment`/`protocol3`/`protocol3-v1-equivalence`, `persistence/share`, `sim/recipe-overrides-env`, `ui/new-dish-environment`, `tools/listing`, `sim/rng-hash`) first gave 810 passed and 2 failed.
  - Both failures were in `tests/content/habitats-p5.test.ts` (stage 1's file), and both pinned the stage 1 state this stage changes by design:
    - `communityOffered(...)` was expected to be `false` ("no community yet").
    - The old refusal "Suggested Communities are not realized by this build yet" was expected.
  - I changed exactly those two assertions: `communityOffered` is now expected to be `true`, and the refusal text is now "habitat WATER_GARDEN has no Suggested Community". Re-run: passes.
  - `tests/persistence/recipe-file*.test.ts`: only my file exists. The recipe-file tests of earlier waves live in `tests/sim/recipe-overrides-env.test.ts` and `tests/persistence/share.test.ts`, and both pass.
- **tsc, eslint, content:validate. DONE.**
  - `npx tsc -p tsconfig.json --noEmit` is clean.
  - eslint is clean on every changed or created `.ts` file.
  - `npm run content:validate` (via `npx tsx tools/content-validate.ts`): `content ok · contentHash af7e8117… · … suggested communities 8 realized`.
- **FENCE unchanged. DONE.**
  - The full fence command plus `habitats-p5-equivalence.test.ts`: 10 of 11 files passed, 78 of 79 tests.
  - The one failure, determinism-g3 ("replaying the host command log at 1×"), was `Test timed out in 120000ms` at a load average of about 16. Its own stdout shows `1× host replay hash d1da0e5c58e9ce7c == 4× d1da0e5c58e9ce7c`.
  - Re-run alone with four of my files: 5 files, 76 tests passed.
  - `habitats-p5-equivalence` (the stage 1 golden) passed unchanged.
- **E2E: none (not needed).** Port 4271 was not used.

## Per habitat: communities and eligible cells

Each group places 5. The counts below are the eligible cells when the group is placed, after the cells taken by earlier groups. The smallest is 192, so every margin is large.

| Habitat | Placed | Groups (species@region: eligible cells) |
|---|---|---|
| H04 | 25 | B06@WEST_WAFER 197; B08@EAST_WAFER 197; Y02@EAST_WAFER 192; F02@MESH 197; P01@MESH 192 |
| H05 | 10 | B01@FRESH_POOL 317; B10@BRINE_POOL 317 |
| H06 | 20 | A03@OPEN_WATER 317; B03@MARSH_FLOOR 317; B04 312; P04 307 |
| H07 | 20 | A02@WEST_BAY 317; B05 312; P05@EAST_BAY 317; P09 312 |
| H08 | 15 | B09@LANTERN_PATCH 317; A01 312; B04 307 |
| H09 | 10 | F04@ROOF 197; B12@OPEN_GEL 317 |
| H10 | 10 | B06@LEFT_SIDE 307; B01@RIGHT_SIDE 294 (plus the Starch patch) |
| H11 | 20 | F02@MEADOW 317; P08@NORTH_WATER 317; P09@SOUTHWEST_WATER 317; P10@SOUTHEAST_WATER 317 |

Indicative realize times per Suggested start (ms; `tmp/habitat-communities/realize.ts`, measured while other agents were running): H04 62, H05 35, H06 49, H07 20, H08 18, H09 21, H10 29, H11 30.

## Fence drafts: trajectoryDigest('full') at tick 1200 under habitatRegistry()

| Draft | Digest | Alive at tick 1200 |
|---|---|---|
| FENCE_H06_DUSK_COMMUNITY | `593ab3a0df1affb2` | 39 |
| FENCE_H09_DRYING_COMMUNITY | `76ec7a6cd72ebe1f` | 10 |
| FENCE_H10_GATE_CYCLE | `58376f6ebe021e3d` | 10 |

These come from `tmp/habitat-communities/drafts.ts`. The test compares relationally and pins no literal.

## What each test proves (and the mutant that kills it)

- **`tests/fixtures/habitats-p5-community.test.ts`.** For all eight habitats at seeds 104729 and 1:
  - 5 per group, with the totals 25/10/20/20/15/10/10/20; distinct cells; inside the region; within r 10 of the anchor; `canOccupy`; placed at the cell centre; one `introduce` event per organism with `detail.source = community:<id>`.
  - The class rules: water-only species on water, P04 on sediment at y ≥ 60, F02 on mesh in H04 and on sediment in H11, F04 on gel, B10 on salt 0.6.
  - H10's sides, and H11's grazers each in its own region and outside the meadow.
  - The `introduce:community:<id>` input equals the founders' total B, N and bound mineral; H07's shells are included.
  - H10's starch input equals 0.5 × its valid r 6 cells.
  - An independent recomputation of the cells from `detPermutation(…, 'community.place', k)`.
  - Two seeds give the same counts in different cells.
  - The Empty and Suggested starts are equal outside the life and the patches.
  - `recipeOverridesOf` rejects a non-boolean community.
  - Refusals: a 2×2 region gives exactly "only 4 valid cells for 5 Siltworm in Tiny bank" with path `suggestedCommunity.groups.3`; P04 in open water has 0 cells; `communityRealizationIssues` reports the tiny region and passes the shipped content; WATER_GARDEN with a community is refused.
  - Mutants:
    - placement on `founderPlace`: the recomputation test fails.
    - region filter dropped: 7 tests fail, including H04 and H10.
    - `canOccupy` dropped: "P04 in open water" fails. No placement test can show this one, because every group's eligible cells in the real data are occupiable anyway.
    - refusal removed (crop): 3 refusal tests fail.
    - `recipeOverridesOf` accepting a string: its test fails.
- **`habitats-p5-community-determinism.test.ts`.** For H05, H09, H10 and H11 Suggested:
  - one run of 400 ticks equals four runs of 100;
  - a save at tick 200, loaded and continued to 1,000, equals the uninterrupted run (the import accepts the community);
  - DishHost at 1× and at 4× reaches the same tick-600 hash, equal to the headless run with the same provenance.
- **`habitats-p5-community-conservation.test.ts`.** H06 Suggested (its own closed lid and cycle) and H04 Suggested with the lid closed, each for 10,000 ticks: C, N and M within 1e-5 relative; `checkLedger` ok; inputs unchanged after tick 0.
- **`tests/worker/new-dish-habitats.test.ts`.**
  - Every `build()` refusal returns its sentence and builds nothing. This includes a registry without Y02 (community not offered) and buildPhase 4 (habitat not offered).
  - Provenance with and without community. The four v1.0 requests record exactly the provenance they recorded before.
  - The host's dish equals `habitatStart`.
  - No What if? ideas for a community dish, nor for a state whose recorded choices say only `community: true`. The control, the authored dish, has ideas.
  - `freshStart` is byte-equal for H04, H09 and H10.
  - Previews:
    - H04 Empty: `uses` S06 197, S07 2, M11 2; regions 1–3; no community keys; founders `[]`; added C 20 / N 2.
    - H04 Suggested: 5 groups × 5 with labels.
    - H06: closed lid and cycle.
    - H10: `patches ['Starch']`, `uses` S01 6.
    - H09: S11 197, S12 1, and the realized grid.
    - Every v1.0 start (FIRST_DISH_V1's four starts, plus every recipe of phase ≤ 5): grid and patches equal the pre-wave formula, and the `habitat` keys are exactly `grid, name, rules, summary`.
  - Mutants: provenance without community (3 fail); `isAuthoredRecipe` ignoring community (1 fails).
- **`tests/persistence/recipe-file-community.test.ts`.**
  - H05 Suggested: export, then import, gives the same stateHash.
  - `'yes'`, `1` and `empty: false` → `damaged('overrides.community')`.
  - WATER_GARDEN or GEL_COLONY with a community, a build without B10, and a build without the habitat → compatible-build.
  - v1.0 starts: the file text contains no "community", validates and loads to the same start.
  - Mutant: the offer check removed: 1 fails.
- **`tests/fixtures/habitats-p5-fence-drafts.test.ts`.**
  - The three drafts are on disk, outside `fence-recipes/` and `content/`, with the agreed fields.
  - Habitat, life (20 / 10 / 10), community input, edges and devices (0/0, 0/198, 6/0) and settings are all present.
  - 1× and the 4× analogue with a save → load at tick 600 agree at tick 1200 (stateHash and trajectoryDigest 'full').

Every mutant was reverted by copying the file back from `tmp/habitat-communities/bak/`, and `cmp` confirmed the restore.

## Commands and results

| Command | Result |
|---|---|
| `npx vitest run tests/fixtures/habitats-p5-community.test.ts` | Tests 28 passed |
| `…community-determinism` | 8 passed (361 s) |
| `…community-conservation` + `…fence-drafts` | Test Files 2 passed, Tests 9 passed (757 s) |
| `new-dish-habitats` | 13 passed |
| `recipe-file-community` | 3 passed |
| Done-when batch (34 files) | 810 passed, 2 failed (the stage 1 assertions above), then fixed: `tests/content/habitats-p5.test.ts` passes |
| Fence (11 files) | 78 passed, 1 timeout (determinism-g3, load) |
| Re-run: `determinism-g3` + my 3 fast files + `content/habitats-p5` | Test Files 5 passed, Tests 76 passed |
| `npx tsc -p tsconfig.json --noEmit` | clean |
| eslint | clean |
| content-validate | ok, `af7e8117…` |

## Files

- **Created:**
  - `tests/fixtures/habitats-p5-community.test.ts`
  - `tests/fixtures/habitats-p5-community-determinism.test.ts`
  - `tests/fixtures/habitats-p5-community-conservation.test.ts`
  - `tests/worker/new-dish-habitats.test.ts`
  - `tests/persistence/recipe-file-community.test.ts`
  - `tests/fixtures/habitats-p5-fence-drafts.test.ts`
  - `tests/fixtures/habitats-p5/fence-drafts/{FENCE_H06_DUSK_COMMUNITY,FENCE_H09_DRYING_COMMUNITY,FENCE_H10_GATE_CYCLE}.json`
  - this report
  - scratch scripts in `tmp/habitat-communities/`
- **Changed:**
  - `src/sim/recipes.ts`
  - `src/sim/rng.ts`
  - `src/worker/protocol.ts`
  - `src/worker/host.ts`
  - `src/persistence/recipeFile.ts`
  - `tools/content-validate.ts`
  - `content/habitats/H04…H11` (`suggestedCommunity` only)
  - `content/manifest.json` (contentHash only)
  - `tests/content/habitats-p5.test.ts` (the two stage 1 assertions above)
- **Not changed:** `schema.ts`, `habitatRules.ts`, `registry.ts` and `tests/helpers/habitats.ts` needed no fixes.

## FENCE notes

No fence value moves.
- A recipe without `community: true` runs the old path. The only change on that path is that the patch loop moved into `applyFieldPatch`, with identical code.
- The golden, g2-replay, rc1-replay, the trajectory-fence files, closed-lid conservation and determinism all pass.

## Notes for others

- **new-dish-habitats.** `NewDishPreview.founders` now also lists the community's organisms for a Suggested start, because `founderSummary` counts every generation-0 organism. The screen should not show them twice next to `communityGroups`.
- **Preview `community` key.** `community` is absent, never `false`, when there is no community.
- **The habitat enable.** The lead adds the drafts with `tools/fence-update.ts --add-file`. `trajectory-fence-files.test.ts` pins `fence-recipes/`, so the drafts either move there or the entries point at `tests/fixtures/habitats-p5/fence-drafts/`. That is the lead's choice.

## PROPOSED DECISIONS

1. **The community check runs in the CLI and the tests, not in validateContent.** It realizes eight worlds, which would cost time for nothing at the worker's boot. One realization proves every seed: the eligible counts do not depend on the seed; only the permutation does.
2. **CommunityError.** It is a RecipeError subclass that carries the record path, so the validator can name `suggestedCommunity.groups.<k>` (or `.patches.<n>`). Every other caller still sees a RecipeError.
3. **A recipe file with `community: true` and no `empty: true` is "damaged".** `build()` never records that combination, and it is better refused at validation than realized.
4. **`realizeRecipe` gates the community on the world's recorded manifest.** It runs `communityOfferProblem` against the recorded species and systems, so a hand-made recipe file or content can never place life the dish's rules do not include.
5. **`habitat.uses` counts the realized world**, with each category sorted by id: edges, then devices and furnishings, then objects. This matches the H04 example (S06 before S07). It is absent when the realized start places nothing.
6. **Community patch labels in the preview.** An unlabeled community patch is listed as "Community patch <n>".

No NEEDS lines.
