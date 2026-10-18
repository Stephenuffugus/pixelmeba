# THE HABITAT ENABLE (P5.4, D-0130): saves / determinism verification

**Verdict: PASS. No BLOCKER and no MAJOR.** The enable changes nothing a save, a replay or an old dish depends on.
The recorded `enabledHabitats` list is the only difference in every shipped world (checked independently, all 25
golden entries). Old g2 and rc1 saves behave identically under a pre-enable registry and under the shipped one. New
habitat dishes save, re-import and continue bit-identically. The demo still offers only the Water Garden. There
are two MINOR findings (test intent lost or thinned) and four NITs.

Verified on 2026-10-18 against the uncommitted working tree on base 1aa00c2. I edited no tracked file. My scratch
scripts are in `tmp/verify-enable/` (equiv.ts, saves.ts, digests.ts, long-saves.ts, oldrecipe.ts, vitest.log).

## Evidence

| # | What | Command | Result |
|---|------|---------|--------|
| E1 | Registry and manifest identity | `npx tsx tmp/verify-enable/equiv.ts` | `registryWith({enabledHabitats: v1 three})` has contentHash **4a034051…**, the exact pre-enable hash, so nothing else in content/ moved. Outside `manifest`, the v1 registry and the shipped registry are canonical-JSON equal. Only the manifest keys `contentHash` and `enabledHabitats` differ. `habitatRegistry()`: 11 habitats (registryWith dedupes through `withoutRepeats`, tests/helpers/registry.ts:111-114,124,139), the manifest is canonical-equal to the shipped one, and the contentHash is equal (0c5a10e0…). |
| E2 | Independent golden diff | same script: 25 entries (every recipe at phase ≤ 5, the 3 v1.0 New Dish starts, every variant), serializeWorld canonical diff with the contentHash and the variant contentHash/initialStateHash blanked | In all 25 entries every differing path is under `.content.manifest.enabledHabitats`. `unexpected: 0`. stateHash after 300 ticks (contentHash blanked) is equal in all 25. This confirms the lead's claim. |
| E3 | Old saves through the real DishHost (`importDish`), v1-list host vs shipped host | `npx tsx tmp/verify-enable/saves.ts` (part 1) | All 8 g2 saves and 5 rc1 saves: `loaded`. `info.regions` is absent and the world's habitat has no regions. Info, stateHash at load, `recipeExport` reply, `keepPlan` reply and stateHash after 300 more ticks are **identical** across the two hosts. Each world keeps its own recorded list (g2: `WATER_GARDEN`; rc1: the v1 three). |
| E4 | H05 Suggested Community under the **shipped** registry: save at 200 → load → 1,000 vs uninterrupted | saves.ts (part 2) | equal |
| E5 | All 8 habitats, Empty and Suggested Community, via the shipped DishHost | saves.ts (part 3) | create → run 150 → `recipeExport` → `recipeImport` in a fresh host gives the start's stateHash and byte-identical serialized world (world id aside). `exportDish` → `importDish` is accepted with the hash kept, and both continue 300 ticks equal. Region counts in DishInfo: H04 3, H05 3, H06 2, H07 2, H08 1, H09 3, H10 3, H11 4. A v1-list build refuses each recipe file with "This recipe needs a compatible build…" and creates nothing. |
| E6 | Long save chains (to catch later-tick Phase 5 state the import might refuse) | `npx tsx tmp/verify-enable/long-saves.ts` | Each of the 8 communities saved and re-imported every 400 ticks to 2,000. Every import accepted, the hash was kept, and the chain equals the uninterrupted run (H07 148 alive / 112 devices, H08 114 alive, H10 6 edges, etc.). `problems 0`. |
| E7 | The three new fence digests | `DIG=1 npx tsx tmp/verify-enable/digests.ts` | 1× under the shipped registry: 58376f6ebe021e3d / 76ec7a6cd72ebe1f / 593ab3a0df1affb2, equal to fence.json. Realized from the **HEAD (pre-move) draft texts** they give the same digests, so the rewording of `question`/`expectedObservationsText` moves nothing. |
| E8 | v1.0 New Dish previews | digests.ts | `newDishPreview` for Empty / Empty Gel / Empty Sediment / the Garden: 4 real previews, identical under the v1-list and shipped hosts |
| E9 | Demo | saves.ts (part 4) | `demoScope(shipped).habitats` = `['WATER_GARDEN']`. A demo DishHost refuses H10 community and H04 Empty: "this dish needs the full version of Pixelmeba (it uses Gate Lab / Leaf Pool)". The New Dish list filters to `WATER_GARDEN` under demo (src/ui/newDishStarts.ts:51). |
| E10 | Six targeted files | `npx vitest run --no-file-parallelism tests/fixtures/trajectory-fence-files.test.ts tests/content/habitats-p5.test.ts tests/ui/new-dish-starts.test.ts tests/worker/new-dish-habitats.test.ts tests/fixtures/rc1-replay.test.ts tests/worker/demo-host.test.ts` | **6 files, 75 tests passed**, 182 s, exit 0 |
| E11 | Pre-enable recipe file into the shipped build | `npx tsx tmp/verify-enable/oldrecipe.ts` | A Garden file built under contentHash 4a03… is refused by this build ("needs a compatible build (simulation 3, rules 1, content 3)") and accepted by its own build. See NIT-4. |

Source reading (old-dish paths). The habitat list never reaches the simulation: `enabledHabitats` appears in src/ only in
validation (sim/content/registry.ts:393-495, guideRules.ts:137), the New Dish offer (ui/newDishStarts.ts:50,
worker/host.ts:2177), the recipe-file import check (persistence/recipeFile.ts:529) and the Field Guide
(ui/views/FieldGuideData.tsx:181). `stateHash` (sim/serialize.ts:348-352) and the sim's gates (sim/gates.ts) do not
read it. Region pins and the legend come from the world's **own** `content.habitat.regions` (worker/host.ts:3355-3359,
3407). The save import is registry-free (`loadSaveFile`), and deserialize uses the recorded content (serialize.ts:296).
Keep / fresh start / What if? (`rebuildsExactly`, `freshStart`, `recordMatchesBuild`, host.ts:2357-2416) rebuild from
this build's registry. They already refuse to call an old dish "unchanged" because its contentHash differs, so the
enable does not change their result (E3: keepPlan identical). Compare, Try my dish and challenges read the dish's
recorded manifest (worker/challenge.ts:208). release/1.0 is a separate frozen branch that the diff does not touch.

## Findings

### MINOR-1: tests/content/habitats-p5.test.ts:45-52 and :133-200 no longer test "present but not enabled"
- The original test asserted that "the shipped registry (eight present, not enabled) still validates". Its record-rule cases (seven regions, a repeated region id, an anchor outside its shape, an object on stone, furnish over a device, the 256 cap, a furnished area outside the dish, an unknown community region) ran with H04/H07 *not enabled*.
- After the re-pin every one of them runs with all habitats enabled. Nothing in the suite now validates a habitat record that is present but disabled.
- The validator checks shapes for every record today (registry.ts:297-306, the `habitats.ids` loop), so the product is correct.
- Failure scenario: a refactor moves `habitatShapeProblems` into the `m.enabledHabitats` loop (registry.ts:470). Every test still passes, and a drafted, disabled Phase 6 habitat with a malformed region ships unchecked until the day it is enabled.
- Fix (one line, keeps the original intent): add `expect(validate({ enabledHabitats: V1_HABITATS })).toEqual([])`. Optionally run one shape case under the same patch.

### MINOR-2: removing tests/fixtures/habitats-p5-fence-drafts.test.ts drops a few explicit pins
Most of what it proved is still covered:
- 1× (trajectory-fence-current) and 4× with save → load (trajectory-fence-files) are both compared to the same recorded digest, which is transitively the old relational check.
- `trajectoryDigest('full')` hashes every non-derived world store (tests/helpers/trajectory.ts:352-368), so edges, devices, climate, objects and the sample are covered.

What is lost:
- (a) `stateHash(4×+save) === stateHash(1×)`. The digest excludes history, events and provenance, so 4× drift in the history or journal of these three dishes would no longer fail here.
- (b) The structure-count pins `H09 edges = 0` and `H10 devices = 0`. The new "really there" test (trajectory-fence-files.test.ts:70-107) checks the gate's edges and the lace's devices but not these two.
- (c) The draft-field pins: revision 1, seed 104729, mutationPreset `standard`, founderMode `identical`, founders `[]`, community `true`, phase 5. Seed, preset and founders are pinned through the digest. Revision and phase are not pinned anywhere.

Failure scenario: someone edits a fence recipe file's `revision`/`phase`, or introduces a history-only 4× divergence. Nothing in these files catches it. Low risk. Suggested fix: add `expect(lace.edges).toHaveLength(0)`, `expect(gate.devices).toHaveLength(0)` and a `stateHash` comparison in the 4× loop for the recipeFile entries.

### NIT-1: tests/helpers/habitats.ts:97-100, `habitatRegistry()` comment is stale
It says "the shipped registry with the eight habitats enabled". It now builds `[...11 shipped, ...8].sort()` and depends on registryWith's dedupe to equal the shipped registry. That equality is pinned at habitats-p5.test.ts:51, and I confirmed it in E1. Suggest rewording the comment, or making it `return loadRegistryFs()`, so the community determinism tests visibly run "as shipped".

### NIT-2: the demo Field Guide now lists all 11 habitats
src/ui/views/FieldGuideData.tsx:181 maps `m.enabledHabitats`. Under DEMO_MODE, src/ui/views/FieldGuide.tsx:127-129 filters only the Species tab. The arcade demo's equipment tab therefore describes 8 more habitats the demo cannot start (E9: they are refused). This follows the existing P4.11 ruling ("other entries are unchanged"; Gel Colony, Sediment Edge and S01–S12 were already listed). It is still worth an owner line in EXPANSION_RESPONSE §8: the demo now advertises ten habitats it cannot open.

### NIT-3: tests/ui/new-dish-starts.test.ts:56-60, the shipped-manifest case checks ids only
For the shipped manifest it pins only the eight new ids' order (and the first three via `pick`). That is fine for this test's intent. Labels, notes and community flags of the new eight are covered elsewhere (wave 14 tests). I report it only because the old test was an exact equality on the shipped list.

### NIT-4 (pre-existing, not caused by the enable): recipe files do not survive a contentHash move, and the refusal quotes identical versions
`stateHash` covers `manifest.contentHash` (sim/serialize.ts:352), and `loadRecipeFile` compares `initialStateHash` (persistence/recipeFile.ts:605). A Starting recipe file written by the pre-enable build (4a03…) is therefore refused by this build with "This recipe needs a compatible build (simulation 3, rules 1, content 3)". Those are the importing build's own numbers (E11). The same already happened at wave 14 and at every content edit. Only unreleased dev builds share contentVersion 3, and v1.0 files differ by contentVersion 2, so no player is affected today. Any future same-contentVersion content patch (e.g. a v1.1.1 tuning fix) would hit it with confusing copy. Owner/lead item, not this enable's.

## Not found (checked)
- Any path where the build's `enabledHabitats` alters an old dish's state, replay, pins, keep plan, export or What if? answer: none (E3 and the source reading above).
- Any shipped world whose state differs beyond the recorded list: none (E2).
- Any habitat save the import refuses, early or late (to tick 2,000): none (E5, E6).
- Any fence digest that depends on the moved or reworded draft text: none (E7).

## Summary
1. Verdict PASS. No BLOCKER and no MAJOR. The recorded `enabledHabitats` is the only serialized difference in all 25 golden worlds, and 300-tick stateHashes are equal (E1, E2).
2. The 13 g2/rc1 saves load, export, plan and run identically under pre-enable and shipped hosts, with no regions or legend. Pins come from the world's own habitat (host.ts:3355).
3. All 8 habitats (Empty and Community): the save import accepts them, and save → load chains to tick 2,000 equal the uninterrupted runs. Recipe files round-trip to the same start. The H05 save at 200 → 1,000 is equal under the shipped registry. `habitatRegistry()` equals the shipped registry, contentHash included.
4. Demo still offers and opens only the Water Garden. release/1.0 is untouched. The 3 new fence digests reproduce at 1× and from the pre-move draft texts. 6 targeted test files, 75 tests passed.
5. Follow-ups: MINOR-1 (add the "present but not enabled" validation case back) and MINOR-2 (re-add `edges` / `devices` = 0 and a stateHash check for the habitat fence files). NITs: stale helper comment, the demo Field Guide lists 11 habitats, the shipped New Dish case pins ids only, and the pre-existing recipe-file and contentHash copy issue.
