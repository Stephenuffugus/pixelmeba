# Wave 14 task writer: report

File: /workspaces/pixelmeba/docs/agent/g5-wave-14.tasks.js.txt (code read at HEAD 7098ae3; waves 12 and 13 and the organism flip were taken from their contracts and appear as placeholders).

## Parse check

```
node -e "...replace(/^export /gm,'')...WAVE_TASKS.map(t=>[t.key,t.port,t.stage,t.critical||false,t.prompt.length])"
habitat-geometry 4271 1 own 22246
region-pins 4272 1 false 8025
habitat-communities 4271 2 own 15801
new-dish-habitats 4272 2 false 9951
```

## Stages and file ownership (one owner per file per stage)

| Stage | Task (port) | Critical | Owns |
|---|---|---|---|
| 1 | habitat-geometry (4271) | 'own' (saves 4396) | NEW src/sim/content/habitatRules.ts (item 0 first), content/habitats/H04_LEAF_POOL … H11_GRAZING_MEADOW.json, tests/helpers/habitats.ts, tests/fixtures/habitats-p5/realize-golden.json (step 0, from HEAD code), tests/fixtures/habitats-p5{,-equivalence,-determinism,-conservation}.test.ts, tests/content/habitats-p5.test.ts. OWNER: content/schema.ts, recipes.ts, content/registry.ts, structureRules.ts (helpers: speciesSystemNeeds moves here), tests/helpers/world.ts (preFlipRegistry only), manifest contentHash only, re-pins in tests/content/{recipe-structures,structures-p5,validator}.test.ts |
| 1 | region-pins (4272) | no | NEW src/render/regionPins.ts, src/ui/panels/RegionLegend.tsx, src/ui/strings/regions.ts, tests/render/region-pins.test.ts, tests/ui/region-legend.test.ts, tests/worker/dishinfo-regions.test.ts, tests/e2e/regionPinsFixture.ts, region-pins.spec.ts. OWNER: renderer.ts (setRegionPins only), protocol.ts (DishInfo.regions only), host.ts (info() only), DishScreen.tsx (the effect only), ProbePanel.tsx (mounting the legend only) |
| 2 | habitat-communities (4271) | 'own' (saves 4397) | NEW tests/fixtures/habitats-p5-community{,-determinism,-conservation}.test.ts, tests/worker/new-dish-habitats.test.ts, tests/persistence/recipe-file-community.test.ts, three fence drafts under tests/fixtures/habitats-p5/fence-drafts/ and their test. OWNER: recipes.ts, rng.ts (STREAMS.communityPlace), schema.ts / habitatRules.ts / registry.ts (fixes only), the eight records (suggestedCommunity), manifest contentHash, recipeFile.ts, protocol.ts (RecipeOverrides.community, NewDishPreview additions), host.ts (build, recipeProvenance, isAuthoredRecipe, newDishPreview), tools/content-validate.ts (community realization check), tests/helpers/habitats.ts (append) |
| 2 | new-dish-habitats (4272) | no | NEW src/ui/newDishStarts.ts, src/ui/strings/newDish.ts, tests/ui/new-dish-starts.test.ts, tests/e2e/habitats-p5.spec.ts. OWNER: NewDish.tsx, state.ts (community pass-through), styles.css (New Dish rules only) |

Shared by symbol: stage 1, region-pins imports `HabitatRegion` and `regionAnchorCell` from habitatRules.ts (habitat-geometry's item 0). Stage 2: new-dish-habitats reads `RecipeOverrides.community`, `NewDishPreview.habitat.uses / habitat.regions / community / communityGroups`, which habitat-communities writes first (item 0). A name that is still missing is reported as a NEEDS line.
verifyGroups: [['habitat-geometry','habitat-communities'], ['region-pins','new-dish-habitats']]. Rules verifiers run on ports 4390 and 4391, saves verifiers on 4396 and 4397, and the re-verify on 4394. Port 4398 stays free, and nothing uses 4290.

## PROPOSED DECISIONs (each a point the canonical docs do not settle)

The lead's calls (accepted as given):

- **Scope.** P5.4a runs geometry in stage 1 and communities in stage 2. The two critical tasks are habitat-geometry and habitat-communities.
- **Habitat ids.** The ids are H04_LEAF_POOL, H05_BRINE_MOSAIC, H06_DUSK_MARSH, H07_GLASS_GARDEN, H08_NIGHT_LANTERNS, H09_DRYING_LACE, H10_GATE_LAB and H11_GRAZING_MEADOW. All match /^[A-Z][A-Z0-9_]*$/, and they keep the CT 8.2 numbers traceable. The briefs' example "LEAF_POOL" would also be valid, but the lead's form is used.
- **Nothing ships until THE HABITAT ENABLE.** Builders change only the contentHash. The fence must not move. The enable adds the fence dishes through --add-file.

Mine:

1. **Stage 1 gets a second builder, region-pins.**
   - D-0122 moved region pins into p5.4b. This file splits p5.4b: the pins go to stage 1, and the New Dish list stays in stage 2.
   - The pins need only the regions schema, which habitat-geometry creates first in item 0. They touch no file that stage 1's geometry task owns.
   - The split balances the stages. Stage 2's UI task is already the largest UI change, and adding the renderer would also have given it protocol.ts and host.ts, which habitat-communities needs in stage 2.
2. **Stage 1 writes the whole habitat schema.** That includes the Suggested Community shape and RecipeSchema.community. habitatRules.ts carries all of the offer rules.
   - This lets stage 2's two parallel tasks build on committed shapes.
   - Until stage 2 lands, realizeRecipe refuses `community: true` with a RecipeError.
3. **The schema additions follow D-0111's placement-array pattern, not GeometryOp variants.**
   - The briefs' touchpoint 244 proposes GeometryOp kinds. D-0111 instead built edges and devices as optional arrays.
   - HabitatSchema therefore gains `furnish` (S05, S06, S11 or S12 over a disk, a rect or a perimeter), `objects` (M10 or M11 at a cell), `regions` (at most 6; id, label, a disk or rect shape, an anchor) and `suggestedCommunity` ({ groups: { species, region, count 5, radius 10 }[], patches? }).
   - RecipeSchema gains `community`.
   - None of these fields has a default, so v1.0 records and saves stay byte-identical.
4. **"Perimeter" is pure geometry.** It means the disk's in-dish cells that have a 4-neighbour outside the disk. In H11 these are exactly D-0106's "disk cells with a water 4-neighbour", which gives 88 cells.
5. **Placed-structure ids run in this order:** habitat edges, habitat devices, habitat furnish areas (row-major), recipe edges, recipe devices. A habitat with no furnish areas gets exactly today's ids.
6. **Habitat objects are logged external inputs.** They are named `habitat:<id>:<material>` and placed right after initializeLedger. The rule follows SPEC 13.1 ("record every external input") and the tool's `tool:<material>` precedent. Both the Empty and the Suggested start include them, because CT puts the wafers in the geometry column.
7. **withHabitatOverride also drops the recipe's lid, lightMode, drying, baseLight, ops, removeStones, edges and devices.**
   - The reason: FIRST_DISH_V1 records lid open, fixed light and no drying explicitly. Without this change, H06's closed lid and cycle would be replaced, as would H08's and H11's.
   - The GEL_COLONY and SEDIMENT_EDGE starts stay byte-identical, because they have the same three values. The step 0 golden proves this.
8. **H09's wick belongs to the habitat geometry (D-0106). H10's starch belongs to the community.** CT 8.2 lists both in the community column. D-0106 already placed the wick under geometry. The starch is food for the community's B06, so it is a community patch: 0.50 per cell, r 6 at (55,64), E209's numbers.
9. **H10's wall follows D-0106.** It is 114 WALL cells. The six S01 edges are the R edges of (63,61)–(63,66), the west edges of the open cells. The open gap cells therefore belong to the right side.
10. **The region and community D-table** (the full table is in STATE). The community centres CT leaves open are explicit regions with anchors:
    - H04: B06 at the west wafer; B08 and Y02 at the east wafer; F02 and P01 in the mesh patch.
    - H07: A02 and B05 in the west bay; P05 and P09 in the east bay, so the grazers start apart from the algae.
    - H08: all three species in the r 14 patch.
    - H11: F02 in the meadow; P08, P09 and P10 in three water regions (north, south-west and south-east).
    - H06: A03 in the open water; B03, B04 and P04 on the marsh floor.
    - H09: F04 under the roof; B12 on the open gel.
    - H05: B01 in the fresh pool; B10 in the brine pool.
    - H10: B06 on the left at (55,64); B01 on the right at (72,64).
11. **Community placement rule.**
    - The eligible cells are the r 10 disk around the region anchor, intersected with the region shape, the dish and canOccupy, minus cells already used.
    - The five cells are the first five of detPermutation(n, worldSeed, 'community.place', groupIndex). STREAMS.communityPlace is a new stream used only here.
    - A group with fewer than five eligible cells is refused, never cropped or widened.
    - Identical, Varied and Diverse founder modes apply through introduceOrganism.
    - The input is named `introduce:community:<id>`.
12. **The community is a recorded New Dish override.**
    - It is stored as `community: true` in the provenance and in the recipe file's source overrides, and as `RecipeDef.community` once applied.
    - It requires `empty: true`.
    - The worker refuses it when the habitat's community is not offered.
    - What if?, compare starts and recipe files realize the same dish from the recorded choice.
13. **The offer rules live in one place, habitatRules.ts.**
    - habitatOfferProblem checks: phase ≤ buildPhase; the cell structures and placed structures are enabled; the structures' systems, the field systems, climate for a cycle or drying, and foodObjects for objects are enabled; the object materials are enabled.
    - communityOfferProblem checks that the species are enabled, with their system needs and the patch field systems.
    - The validator errors on shipped habitats. It also closes the phase check missing on enabledHabitats (g5-briefs H4).
14. **The community realization check runs in tools/content-validate.ts and in the tests, not in validateContent.** validateContent also runs at the worker's boot, and realizing eight worlds there would cost time for nothing. Eligible counts do not depend on the seed, so one realization proves every seed.
15. **habitatRules.ts imports neither registry.ts nor recipes.ts.** speciesSystemNeeds moves to structureRules.ts and is re-exported from registry.ts. Importing registry.ts would cycle and would pull the validator into the main-thread bundle.
16. **Region pins.**
    - Pins are numbered 1–6, because probes already use the letters A–F.
    - They are static and procedural, so the atlas does not change. They are drawn under the probes and selection and above the links.
    - Their source is DishInfo.regions, read from the world's own recorded habitat. Old dishes therefore get no pins.
    - The text legend sits in the region-probe panel.
    - Content regions do not count against the six probe masks.
17. **New Dish.**
    - The v1.0 presets keep their StartIds, test ids, labels and notes verbatim. The new habitats use `habitat:<ID>`, with the habitat name as the label and the guide summary as the note.
    - The list is ordered by phase, then id. DEMO_MODE is unchanged.
    - The community choice defaults to Empty and resets to Empty when the start changes.
    - D02 says the preview "lists enabling modules". This is read as the structures and objects the habitat places (habitat.uses), plus the lid, light and drying line, because habitats enable no ability modules.
18. **No world schema bump and no protocol bump.** Every addition is an optional field without a default: protocol additions follow the D-0120 and wave 13 precedent, and the habitat record already travels in every save.
19. **Numbers CT leaves open.** Each follows D02's "Unspecified conditions use Water Garden fields":
    - Sediment light and O2 in H06 and H11 use the Water Garden values. H06's explicit O2 of 0.15 is kept.
    - detritusN is 0.10 per detritus C (the DEBRIS ratio, SEDIMENT_EDGE's precedent).
    - H05's salt is set in the right disk only. Channel cells inside that disk keep 0.6.
    - H08's patch sets metabolite to 0.20; its nutrient is 0.10, the same as the base.
    - Every habitat keeps the Water Garden sugar of 0.02.
20. **Three fence drafts, added at the enable with --add-file.**
    - FENCE_H10_GATE_CYCLE covers edges and climate together.
    - FENCE_H09_DRYING_COMMUNITY covers drying, the roof, the wick and resting.
    - FENCE_H06_DUSK_COMMUNITY covers the closed lid, the cycle, sediment and P04.
    - --add cannot be used: it takes only a shipped recipe id, and no shipped recipe uses H04–H11 before wave 15.
21. **tests/tools/listing.test.ts** pins enabledHabitats at length 3 and the text "Three habitats". The lead re-pins it at the enable to count habitats of phase ≤ 4, which is what the v1.0 listing describes. p5.8b (wave 16) writes the v1.1 listing. The LATER list is p5.8b's.

## Placeholders left for the lead (all fill after wave 12, wave 13 and the organism flip are committed)

- STATE "WAVE 12 AS BUILT: <lead: wave 12 as built — …>" covers:
  - the commit and the D-number;
  - the gate-badge layer in renderer.ts and gateBadges.ts's exports;
  - IMPLEMENTED_NATIVE_ABILITIES.
- STATE "WAVE 13 AS BUILT: <lead: wave 13 as built — …>" covers:
  - the commit and the D-numbers;
  - org-ui's renderer.ts and protocol.ts changes;
  - any change to DishInfo.
- STATE "ORGANISM FLIP AS BUILT: <lead: organism flip as built — …>" covers:
  - the commit and the D-number, the lists, moduleRegistryVersion 3 and IMPLEMENTED_RULES, and the contentHash;
  - the fence re-record;
  - how preFlipRegistry and tests/worker/protocol3-v1-equivalence.test.ts survived;
  - the listing re-pin for species;
  - the guide warning count.
- STATE "This wave's calls: <lead: D-number>".
- STATE "Shipped manifest after the organism flip: <lead: organism flip as built — the lists as committed>".
- habitat-geometry item 9: "<lead: organism flip as built — whether preFlipRegistry already pins its lists and its contentHash …>".
- region-pins Read line: "<lead: wave 12 as built — the gate badge layer …>" and "<lead: wave 13 as built — org-ui's renderer.ts changes>". region-pins item 3: "<lead: wave 12 as built — the gate badge Graphics>".
- LEAD AFTER WAVE 14 item 2: "<lead: organism flip as built — any fence file the flip added>".
- THE HABITAT ENABLE item 3: "<lead: organism flip as built — the count after the flip>".

Check: `grep -n "<lead: " docs/agent/g5-wave-14.tasks.js.txt | grep -v "as built — …>"` must print nothing before launch.

## Contradictions with g5-plan.md, the briefs, BUILD_DIRECTIVE or the lead's assignment

1. **Wrong sections cited by the lead.**
   - The habitats are CT §8.2 (lines 383–397), not "CT §14". CT §14 holds the limits: devices 256, objects 128, edges 512, regions 6.
   - The content schema is ARCH §4, not "ARCH §2". ARCH §2 is the repository layout.
2. **The briefs' touchpoint 244 proposes GeometryOp kinds** for furnish, edge and object. As built (D-0111), edges and devices are optional placement arrays. This file extends the arrays instead (PROPOSED DECISION 3).
3. **A habitat start keeps FIRST_DISH_V1's environment today.** withHabitatOverride drops only backgroundOverrides, and FIRST_DISH_V1 records lid, light mode and drying explicitly. A New Dish start on H06, H08, H09 or H11 would therefore realize with an open lid, fixed light and no drying. Neither the plan nor the briefs mentions this. It is fixed in habitat-geometry item 4.
4. **"moves contentHash once" (lead).** contentHashInput hashes every habitat file, enabled or not. The contentHash therefore moves when the records land (stage 1), when the communities land (stage 2), and again at the enable. Each move is recorded old → new.
5. **Adding any content file moves the contentHash of every registryWith registry,** preFlipRegistry included. tests/worker/protocol3-v1-equivalence.test.ts pins a stateHash written under contentHash 67075b0e…. The organism flip's change to the manifest lists triggers the same problem. Wave 14 fixes it unless the flip already has (a placeholder, habitat-geometry item 9).
6. **Tests that the enable and the flip will break.**
   - tests/tools/listing.test.ts pins enabledHabitats at length 3 (the enable breaks it) and enabledSpecies at 19 (the organism flip breaks it). The wave 13 file's flip checklist does not mention the species pin.
   - tests/fixtures/trajectory-fence-files.test.ts pins the exact list of fence-recipe files. Fence drafts therefore live outside fence-recipes/ until the enable updates that test.
7. **CT 8.2 lists H09's wick and H10's starch in the Suggested-community column, while D-0106 lists the wick under habitat geometry.** This file follows D-0106 for the wick and CT for the starch (PROPOSED DECISION 8).
8. **D-0122 assigned region pins to p5.4b.** They are scheduled here as stage 1's region-pins task (PROPOSED DECISION 1).
9. **The briefs' p5.4b (306) says "e2e on desktop only".** The lead and the G3 lesson say desktop and phone-portrait. The prompts follow the lead.
10. **BUILD_DIRECTIVE P5.4 has a Build line but no "Done when" line.** As at D-0119 and D-0121, P5.4 is ticked at the enable, against that Build line.

## Builder-hours (2 shared cores)

| Task | Hours | Main costs |
|---|---|---|
| habitat-geometry | ~3.5 | step 0 golden; schema, realization and validator; eight records; 10,000-tick conservation; eight determinism runs |
| region-pins | ~1.5 | |
| habitat-communities | ~3.5 | realization, worker, recipe file, three fence drafts, determinism through DishHost, 10,000-tick conservation ×2 |
| new-dish-habitats | ~2.5 | UI plus unit tests; one journey on desktop and phone-portrait; four existing journeys on desktop |

Total: about 4 h per stage including verification, so roughly 7–8 h of wall time for the wave. The enable adds about 1.5 h, mostly `npm run check` and the journeys.
