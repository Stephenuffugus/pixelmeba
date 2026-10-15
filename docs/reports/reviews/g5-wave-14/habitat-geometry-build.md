# Wave 14 build report: habitat geometry (P5.4 part 1, habitat-geometry)

The habitat schema additions, how they are realized, the offer rules, the validator checks, the founder-chain edge check, the habitat start's environment and the eight records H04–H11 are all in place. Nothing is enabled: content/manifest.json changes only its contentHash. The FENCE passes unchanged, and every shipped dish realizes byte-identically to the step 0 golden. No commits were made (the lead commits).

## Checklist

### Build items

- **Item 0a: step 0 golden. DONE.** `tests/fixtures/habitats-p5/realize-golden.json` was written by the unmodified HEAD code (1c9d8a2) before any source edit. It has 25 entries: 18 recipes, 3 v1.0 New Dish starts and 4 variants. Each entry holds two digests:
  - the sha256 of `canonicalJson(serializeWorld)` at tick 0;
  - `stateHash` after `run(world, 300)`.
  
  Both digests blank `manifest.contentHash`. For a variant they also blank `provenance.variant.contentHash` and `initialStateHash`, because both of those record the contentHash. The file's `"how"` text describes this. The recipe is `tests/helpers/habitats.ts realizeGoldenEntries()`, and `REALIZE_GOLDEN_HOW` is pinned by the test.
- **Item 0b: `habitatRules.ts` created first. DONE.** It holds the exact names requested, and `speciesSystemNeeds` moved to `structureRules.ts:118`. `registry.ts:609` re-exports it, so its callers (`saveFile.ts`, the tests) are unchanged.
- **Item 1: schema. DONE.** All new fields are optional with no default (`schema.ts`):
  - `HabitatRegionSchema` (:260)
  - `FurnishAreaSchema` (:280)
  - `HabitatObjectSchema` (:297)
  - `CommunityGroupSchema` (:319)
  - `SuggestedCommunitySchema` (:329)
  - `HabitatSchema.furnish` / `objects` / `regions` (max 6) / `suggestedCommunity` (:353–359)
  - `RecipeSchema.community` (:450)
  
  `FieldPatchSchema` was moved above `HabitatSchema` unchanged, because the community schema needs it. Proof: tests/content/habitats-p5.test.ts "schema" and the golden.
- **Item 2: furnishings. DONE.**
  - `recipes.ts:447` `furnishCells` delegates to `habitatRules.furnishAreaCells`.
  - `recipes.ts:451` `furnishOf`, and `recipeStructures` (:463) gives ids in this order: habitat edges, habitat devices, habitat furnish (in area order, each area row-major), recipe edges, recipe devices.
  - A device problem that only the furnishings bring is reported on path `furnish` (:531).
  - `recipeTouchesStructures` counts furnish.
  
  Proof: the ids tests in habitats-p5.test.ts (H04's baskets are ids 1 and 2, the mesh starts at 3; H09's wick is id 1).
- **Item 3: objects. DONE.** `recipes.ts:603 placeHabitatObject`, called right after `initializeLedger` (:680). It refuses unless the world records `foodObjects` and an 'object' material, with a RecipeError that uses OBJECT_REFUSAL's words. It records `recordInput('habitat:<id>:<material>', C, N)`.
- **Item 4: `withHabitatOverride`. DONE.** `recipes.ts:240`. When the habitat changes, the recipe's lid, lightMode, drying, baseLight, edges and devices are dropped; ops become `[]` and removeStones becomes `false`. The order in `applyRecipeOverrides` is kept, so the Environment choices still apply on top.
- **Item 5: founder chains. DONE.** The validator check is in `recipeShapeProblems` (:359; new optional 4th parameter `structureNames`, which the registry passes as `structures.map`). The realization check is before `addFungalLink` (:771, `pairPermitted`).
- **Item 6: validator. DONE.**
  - Every habitat: `habitatShapeProblems` (`recipes.ts:544`, run at `registry.ts:306`). Placed structures, furnishings included, go through `structurePlacementProblems`.
  - Shipped habitats: the phase error is on the manifest (`registry.ts:488`). The offer rule is `habitatOfferIssue` (:479), reported only when the existing structure/climate checks added nothing, so no message is duplicated. The community offer rule is at :482.
  - Recipes: `community: true` without a Suggested Community is refused (:336), and a shipped recipe's community must be offered (:498).
- **Item 7: the eight records. DONE.** `content/habitats/H04_LEAF_POOL.json` … `H11_GRAZING_MEADOW.json`, all phase 5, following the D-table. They have no `suggestedCommunity`, and the guide summary and example name no species. contentHash `2640a5f4ea57ac78f865a397030ebf703d40cf5fcb9371263cea5f40230c3c62` → `d2da52398479f059f83c57c6bff5e80e4bbb17a76433baf794f8b35bef1dc002`. The manifest lists are unchanged.
- **Item 8: `tests/helpers/habitats.ts`. DONE.** It exports:
  - `HABITAT_IDS`
  - `HabitatId`
  - `habitatRegistry()` (cached)
  - `habitatStart(reg, habitatId, extra = {}, seed = 104729)`, which records the provenance the way host.ts `recipeProvenance` does
  - the golden helpers (`realizeGoldenEntries`, `REALIZE_GOLDEN_HOW`, `V1_NEW_DISH_STARTS`)
- **Item 9: nothing to edit.** `tests/helpers/world.ts` was not touched; `preFlipRegistry()` pins `PRE_FLIP_CONTENT_HASH`.
  - `git grep -lE "preFlipRegistry|registryWith\(G2_LISTS\)" tests` lists about 50 files.
  - I ran the ones that pin a realized stateHash or content: the whole fence, `tests/worker/protocol3-v1-equivalence.test.ts`, `tests/content/*` (guide, objectives and the rest), `tests/fixtures/registry-imports.test.ts`, `food-objects`, `habitat-presets`, `tests/persistence/phase5-import.test.ts` and `tests/helpers/registry.test.ts`. All pass.

### "Done when"

- **My tests pass. DONE.** Final run: 35 files, 813 tests passed. It covered the fence, my four fixture files, `tests/content` (all) and `tests/recipes`.
- **The named tests pass. DONE.** Separate batch: 35 files, 856 tests passed. It covered:
  - `tests/content/{validator, recipe-structures, structures-p5, guide, objectives}`
  - `tests/sim/recipe-overrides-env`
  - `tests/recipes/*`
  - `tests/worker/{whatif, new-dish-preview-grid, new-dish-environment, host, protocol3-v1-equivalence}`
  - `tests/persistence/share.test.ts` (the only `recipeFile` test in tests/persistence) and `phase5-import`
  - `tests/fixtures/{finite-feeding, food-objects, registry-imports, habitat-presets}`
  - `tests/tools/listing`
  - `tests/helpers/registry.test.ts`
  
  `tests/fixtures/objects.test.ts` does not exist; `conservation-closed-lid` ran with the fence. No re-pins were needed in recipe-structures, structures-p5 or validator.
- **tsc, eslint, content:validate. DONE.**
  - `npx tsc -p tsconfig.json --noEmit` is clean (whole project, including region-pins' files as of the final check).
  - eslint on every file I changed or created is clean.
  - `content ok · contentHash d2da5239…dc002`.
- **FENCE unchanged. DONE.** The first run had all source edits and the records in place: 10 files, 77 tests passed (898 s). The final run, after the lint fixes, passed again inside the 35-file run.
- **E2E: none.** There are no screen changes. Port 4271 was not used.

## Files

**Created:**
- `src/sim/content/habitatRules.ts`
- `content/habitats/H04_LEAF_POOL.json` … `H11_GRAZING_MEADOW.json` (8 files)
- `tests/helpers/habitats.ts`
- `tests/fixtures/habitats-p5/realize-golden.json`
- `tests/fixtures/habitats-p5-equivalence.test.ts`
- `tests/fixtures/habitats-p5.test.ts`
- `tests/fixtures/habitats-p5-determinism.test.ts`
- `tests/fixtures/habitats-p5-conservation.test.ts`
- `tests/content/habitats-p5.test.ts`
- this report

**Changed:**
- `src/sim/content/schema.ts`
- `src/sim/recipes.ts`
- `src/sim/content/registry.ts`
- `src/sim/content/structureRules.ts` (receives `speciesSystemNeeds`)
- `content/manifest.json` (contentHash only)

## `habitatRules.ts` exports as built

```ts
export type HabitatRegion = HabitatRegionDef            // = z.infer<typeof HabitatRegionSchema>
export function regionAnchorCell(r: HabitatRegion): number
export function regionContains(r: HabitatRegion, x: number, y: number): boolean
export function regionCells(r: HabitatRegion): number[]                   // row-major, in the dish
export function furnishAreaCells(area: FurnishArea['area']): number[]     // row-major, in the dish (recipes.ts furnishCells delegates)
export function furnishAreaOutsideCell(area: FurnishArea['area']): [number, number] | null
export interface HabitatUses { readonly structures: string[]; readonly systems: SystemFlag[]; readonly materials: string[] }
export function habitatUses(h: HabitatDef): HabitatUses
export type HabitatOfferManifest = Pick<Manifest, 'buildPhase' | 'enabledSystems' | 'enabledStructures' | 'enabledMaterials'>
export type CommunityOfferManifest = Pick<Manifest, 'enabledSpecies' | 'enabledSystems'>
export interface HabitatOfferIssue { readonly path: string; readonly message: string }
export function habitatOfferIssue(h: HabitatDef, m: HabitatOfferManifest): HabitatOfferIssue | null
export function habitatOfferProblem(h: HabitatDef, m: HabitatOfferManifest): string | null
export function habitatOffered(h: HabitatDef, m: HabitatOfferManifest): boolean
export function communityOfferProblem(h: HabitatDef, m: CommunityOfferManifest, species: Readonly<Record<string, Species>>): string | null
export function communityOffered(h: HabitatDef, m: CommunityOfferManifest, species: Readonly<Record<string, Species>>): boolean
```

- **Imports.** The file imports only `fields.ts`, `grid.ts`, schema types and `structureRules.ts`. `structureRules.ts` in turn imports `barriers.ts` and `devices.ts`, as it already did.
- **Offer messages.**
  - `It belongs to phase 5 (build phase 4).`
  - `It uses structure S01 (not enabled).`
  - `It needs the "silicate" system (not enabled).`
  - `It uses material M11 (not enabled).`
- **Community messages.**
  - `Its Suggested Community needs Y02 (not enabled).`
  - `Its Suggested Community's <sp> needs the "<sys>" system for <why> (not enabled).`
  - `Its Suggested Community's patch <k> needs the "<sys>" system (not enabled).`

## Schema additions (all optional, no default)

- **`HabitatRegionSchema`** (strict):
  - `id`: `/^[A-Z][A-Z0-9_]*$/`
  - `label`: string, 1–24 characters
  - `shape`: `{kind:'disk', center:[x,y], radius≥0}` or `{kind:'rect', x0,x1,y0,y1: 0..127}`
  - `anchor`: `[0..127, 0..127]`
- **`HabitatSchema` additions:**
  - `furnish?: {structure: 'S05'|'S06'|'S11'|'S12', area: disk | rect | {kind:'perimeter', center, radius}}[]`
  - `objects?: {material: 'M10'|'M11', at: [x,y]}[]`
  - `regions?: HabitatRegion[]` (max 6)
  - `suggestedCommunity?: {groups: {species, region, count: 5, radius: 10}[] (min 1), patches?: FieldPatch[]}`
- **`RecipeSchema` addition:** `community?: boolean`.

## Placed structures: id order and device count per habitat

**Id order:**
1. habitat edges
2. habitat devices
3. habitat furnish (area order, each area's cells row-major)
4. recipe edges
5. recipe devices

The stores are then sorted by cell or edge key, as before.

**Counts per habitat:**

| Habitat | Devices | Edges |
|---|---|---|
| H04 | 199 (2 × S07 + 197 × S06) | 0 |
| H05 | 0 | 0 |
| H06 | 0 | 0 |
| H07 | 112 | 0 |
| H08 | 0 | 0 |
| H09 | 198 (1 × S12 + 197 × S11) | 0 |
| H10 | 0 | 6 (S01) |
| H11 | 88 | 0 |

## What each test proves

- **`tests/fixtures/habitats-p5-equivalence.test.ts` (2 tests).** The new code reproduces both digests of all 25 golden entries.
  - Mutant "`withHabitatOverride` drops lid for its own habitat": survives the golden, because no shipped recipe's lid differs from its habitat's. The own-habitat test I added to habitats-p5.test.ts kills it (`expected [undefined,'fixed']`).
  - Mutant "furnish ids before devices": killed by habitats-p5.test.ts.
- **`tests/fixtures/habitats-p5.test.ts` (33 tests).** Every worked coordinate in the assignment, for each habitat. It also covers:
  - id ranges of 1..N
  - wafer pools, and the ledger input of C 20, N 2 with balanced totals at tick 0
  - H07's initial mineral equal to 0.3 × the open cells (relative error < 1e-12)
  - H10's 114 walls, every field 0 inside them, and its six S01 R edges
  - H11's 88 mesh cells, all sediment with a water neighbour
  - H06's closed lid, cycle and cycleStartTick 0, both through the New Dish route and through a bare recipe
  - `withHabitatOverride` keeping the environment on the recipe's own habitat and dropping it on another
  - the regions (ids, anchors, `regionContains`, open anchor cells)
  - `world.content.habitat` equal to the record
  - a save round trip of all 8 at tick 0 and after 50 ticks (accepted, equal stateHash)
- **`tests/fixtures/habitats-p5-determinism.test.ts` (8 tests).** For each habitat at tick 400, all four routes agree: one run of 400, four runs of 100, a save at 200 reloaded and continued, and the 4× chunked run. Compared relationally, with no hash literals.
- **`tests/fixtures/habitats-p5-conservation.test.ts` (2 tests).**
  - H04, lid closed, 10,000 ticks: C, N and M within 1e-5 relative; `checkLedger` ok; inputs `{c:20,n:2,m:0}`; `objectEmptied` twice, both between ticks 4,500 and 5,500; the deposits gained 20 C.
  - H07, lid closed, 2,000 ticks: mineral within 1e-9 of both the expected total and its starting value.
- **`tests/content/habitats-p5.test.ts` (23 tests).**
  - Validity: the records validate with the eight enabled; the shipped registry validates with them present; the shipped manifest's `enabledHabitats` is still the 3.
  - Offers: offered under the shipped manifest, with no community yet. The offer sentences are pinned.
  - Validator messages, one test each: the phase error; H10 without S01 (the existing placement message on `edges`); H07 without silicate (`baseFields`); H04 without M11 (`objects`); H06 without climate (the light-cycle message).
  - Regions: seven regions; a repeated region id; an anchor outside its shape.
  - Objects: one on a stone; two on one cell.
  - Furnishings: an area over an explicit device (`furnish`: "Two devices share one cell."); 257 devices hit the cap and 256 pass; an area reaching outside the dish.
  - Communities: an unknown group region; a community species that is not enabled.
  - Recipes: `community: true` without a community; a founder chain across H10's S01 edge (refused, naming both cells) and the same chain on WATER_GARDEN (accepted); `realizeRecipe` throws for the chain and for `community: true`.
  - `habitatUses` literal table, including WATER_GARDEN.

## Mutants (by hand, reverted; each file restored, checked by `git diff --stat`)

| Mutant | Result |
|---|---|
| Furnished disk r 8 → 196 cells | habitats-p5 (H04/H09): 2 failed |
| Perimeter as the whole disk | habitatRegistry() fails validation (805 mesh cells > 256 cap); habitats-p5.test.ts cannot load |
| Objects without the input entry | habitats-p5 H04 ledger test: 1 failed. I did not run the 10,000-tick conservation file for this mutant; it asserts `inputs = {c:20,…}` and the balance |
| `withHabitatOverride` keeping the recipe's lid | habitats-p5 H06: 1 failed |
| Phase check removed | content "build phase 4": 1 failed |
| Founder-chain check removed (validator) | content "founder chain": 1 failed |
| Founder-chain check removed (realize) | content "realizeRecipe refuses": 1 failed |
| `habitatOfferProblem` ignoring field systems | content "silicate": 1 failed |
| Furnish ids numbered before explicit devices | habitats-p5 (H04/H09): 2 failed |
| `withHabitatOverride` dropping lid for its own habitat too | survived the golden (no shipped recipe can show it); killed by the added own-habitat test |

## Commands and results

- `npx vitest run <fence> ` (first run, after all source edits): Test Files 10 passed (10), Tests 77 passed (77), Duration 898 s.
- Final run (fence, my 4 fixture files, `tests/content`, `tests/recipes`, `tests/sim/recipe-overrides-env`): Test Files 35 passed (35), Tests 813 passed (813).
- "Done when" batch: Test Files 35 passed (35), Tests 856 passed (856).
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint <my files>`: clean.
- `npx tsx tools/content-validate.ts --write`: `content ok · contentHash d2da52398479f059f83c57c6bff5e80e4bbb17a76433baf794f8b35bef1dc002`, habitats 11.

## FENCE notes

No FENCE value moves:
- g2-replay, rc1-replay, the four trajectory-fence files, conservation-closed-lid, determinism and determinism-g3 all pass.
- The step 0 golden is reproduced exactly.
- `fence-update.ts` was not run.

## Bugs noticed elsewhere / NEEDS

- **Ledger entries merge.** `ledger.ts pushEntry` merges consecutive entries with the same source and tick. The two wafers therefore show as one entry (`habitat:H04_LEAF_POOL:M11`, C 20, N 2), not two of C 10, N 1; the test pins the merged form. This is by design, not a bug, but stage 2 and the ledger panel should know.
- **Region-pins tsc errors (resolved).** During the wave, region-pins' in-progress files (`tests/e2e/regionPinsFixture.ts`, `tests/worker/dishinfo-regions.test.ts`) had tsc errors; they are gone in the final tsc run.
- No NEEDS lines in other tasks' files.

## Proposed decisions

1. **Placement arrays, not geometry ops.** Furnishings, objects and regions are optional arrays on `HabitatSchema`, following D-0111's pattern, rather than new GeometryOp variants. Older records then parse and re-serialize byte-identically, and geometry ops stay purely cell-painting.
2. **A habitat object is an external input.** It is recorded as `habitat:<habitatId>:<material>` (SPEC §13.1, the tool's `tool:<material>` precedent). Objects are created right after the ledger baseline, in Empty and Suggested starts alike.
3. **A habitat start drops the recipe's environment and geometry.** When the habitat differs, `withHabitatOverride` drops the recipe's lid, lightMode, drying, baseLight, ops, removeStones, edges and devices, so the start is the habitat as CT §8 defines it. Otherwise FIRST_DISH_V1's explicit open lid and fixed light would replace H06's and H08's. GEL_COLONY and SEDIMENT_EDGE are unchanged (proved by the golden).
4. **A furnished area must lie wholly inside the dish.** The validator refuses an area with any cell outside the dish rather than cropping it, consistent with "an area over a stone or a second device is a content error, never cropped". `furnishCells` still clips, so it is safe either way.
5. **No duplicate offer messages.** The offer rule (`habitatOfferIssue`) is reported on the shipped habitat's file only when the existing structure-need and climate checks reported nothing for it. Its path names the field concerned: `phase` / `edges` / `devices` / `furnish` / `ops` / `lightMode` / `drying` / `baseFields` / `ops.<i>.fields` / `objects`. `habitatOfferProblem` returns the same sentence, so there is still one rule.
6. **Separate messages for the chain at validation and at realization.** The realization refusal reads "founder group <g> members <k> and <k+1> are on two sides of an edge a link cannot cross". The validator message names the cells and the structure, as specified. `recipeShapeProblems` gained an optional 4th parameter (structure records) for that name.
7. **Moisture is not recorded in H09.** H09's guide states the CT §12.2 default moisture (water 1, gel 0.8); the record holds no moisture field.
