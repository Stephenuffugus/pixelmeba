# G3 lead module flip — build report (D-0059 proposed)

Scope: the "LEAD MODULE FLIP" checklist (docs/agent/g3-wave-3.tasks.js.txt), steps 1–6, with the lead rulings. I made no commit, wrote nothing to DECISIONS.md and left the WORKLOG alone. One-off probes live under `tmp/flip/` and are not committed.

## Checklist

1. **DONE.** `public/atlas/manifest.json` features list anchor_foot, shade_patch, light_trail, debris_granule, protein_notches, matrix_edge and adhesion_link. `IMPLEMENTED_MODULES` = E01 E03 E04 E05 E06 E07 E08 E09 E10 E12. `content/manifest.json`: enabledModules E01 E03 E04 E05 E06 E07 E08 E09 E10 E12, and moduleRegistryVersion 1 → 2.
   - `npx tsx tools/content-validate.ts --write` → "wrote contentHash 81f8dbdeaef9…; content ok · … modules 17 · … atlas … complete for 19 enabled species and 10 enabled module marks … (856 frames)".
   - `npm run art:build -- --check` → "atlas up to date · 856 frames (80 feature-mark frames, 13 world-tile frames) · 1024×1024 · 99ab54adef36".
1b. **DONE.** I updated the pinned tests. Each file and the reason are listed below. The new values match the checklist: A01 E05 E06 E07; B01 E01 E03 E04 E05 E10 E12; B04 E01 E03 E04 E05 E09 E10 E12; B06 E03 E04 E05 E10 E12; P01 E05 E08; registry version 2; "10 of 17 abilities". I also pinned the Phase 3 species against CT §7.1.
2. **DONE.** Check (b) uses `trajectoryDigest(world, 'full')`. Probe `tmp/flip/probe.ts B` built one world holding all of the following:
   - film and filmN
   - filmSeconds, anchorState, anchorSeconds, anchorLockout, adhPartner, adhSeconds, adhLockout, waterCrossed and noUsableIntakeSeconds
   - fLink0, fLinkB0, fLinkKind0, aLink0 and aLinkB0
   - a pellet object and a held sample (sampleTake accepted 1)

   `postG2State` named every item, including the stores "world store objects", "world store sample" and "counter nextObjectId = 2". The digest hashed them without throwing and changed when the sample was taken (3aec79c7191314fc → 42005c6999b7bab0). g2-replay and the four fence files pass unchanged inside the green `npm run check` (step 6).
3. **DONE.** The probe is `npx tsx tmp/flip/probe.ts A`. It found that **no currentDigest moved**, and each old value is reproduced under `registryWith({ enabledModules: shipped minus the seven, moduleRegistryVersion: 1 })`. That registry's content hash equals the pre-flip manifest's (d26e5d2391a3). Every g2Digest is unchanged. See the table below and "Surprising".
4. **DONE (no-op).** `npx tsx tools/fence-update.ts --all --reason D-0059 --decisions tmp/flip/DECISIONS-proposed.md` printed "unchanged" for all 18 entries. The decisions file is a tmp copy of DECISIONS.md plus a placeholder D-0059 heading, because the tool refuses to run without the decision. `tests/fixtures/fence.json` is byte-identical and no changedBy was appended. The lead still records D-0059 (text below). A rerun against the real DECISIONS.md will also be a no-op.
5. **DONE.**
   - tests/experiments/* and tests/sim/comparison.test.ts pass inside the green check. The wave-A golden file is untouched, and expectWaveANumbers/expectWaveAComparison stay on registryWith(G2_LISTS).
   - I measured the shipped manifest against the pre-flip manifest with `tmp/flip/measure.ts` and recorded the results in `docs/reports/experiments-g2.md` under "After the Phase 3 module flip (D-0059)". Every gate is unchanged. Every card's reported measurements are unchanged. The only change in any catalog measurement is EXP_102 arm A: birth 426 (Sunbead, tick 1305) gains Light seeker instead of Reserve chamber, so reservePeak.A01 goes 12.62 → 0 and meanEnergy.A01 goes 63.865 → 63.831.
   - The hunters, feed and starch comparisons are identical except each arm's stateHash, which covers the content hash.
6. **DONE.**
   - `npm run check` → typecheck ok, lint ok, "Test Files 129 passed (129) · Tests 1355 passed (1355)" (1743 s).
   - e2e: `lsof -t -i :4271 | xargs -r kill; E2E_PORT=4271 E2E_OUTDIR=tmp/dist-flip npx playwright test tests/e2e/new-dish.spec.ts tests/e2e/lineage.spec.ts --project=desktop` → "5 passed (6.2m)". I stopped port 4271 afterwards.
   - A git grep of tests/e2e for the moved values (E05, Reserve chamber, "of 17", registry version) points only at new-dish.spec.ts.
   - The three-project suite and the WORKLOG ticks (P3.7) are left to the lead.

**Module naming (read, no UI added):**
- Inspector: `moduleSummaries` takes `name` from the world's recorded `def.name`. `moduleActiveNow` has a case for each of the ten modules. `src/ui/strings/modules.ts` `moduleText` has a case for every enabled id, and each case uses `m.name`. The `default` case ("A supplementary ability.") is reached only by ids that are not implemented.
- Lineage panel: rows and records use content names. `buildLineage`'s `mutModuleName` comes from `world.content.modules[i].name`, and `moduleChange` takes its name from content. The "Game rule:" lines quote `name (id)`. `MODULE_COST_KEYS` covers every cost parameter of E04/E07/E09/E10/E12 (attachedUpkeep, moveCostFactor, emitCost, energyPerCarbon, linkCost, perLinkUpkeep).
- Feed and New Dish: these use the dish's recorded names.
- Add Life: it lists species only and has no module chooser, so it never shows a module id.
- Tests now confirm the names: founders-newdish (ready info names all ten), feed-modules (seed 11 "gained Light seeker", seed 101 "gained Shade collector (E06)") and e2e new-dish ("Colony adhesion (E12)").

## Step 3 table

Columns: entry; old currentDigest (from `git show HEAD:tests/fixtures/fence.json`); the digest reproduced under the pre-flip module list; the new currentDigest under the shipped manifest. No digest moved, so every entry is "explained" trivially. Every g2Digest re-derived under registryWith(G2_LISTS) equals the recorded one.

| entry | old | reproduced (pre-flip list) | new (shipped) |
|---|---|---|---|
| CLEANING_CREW_V1 | fe6811d8b1d15c1e | fe6811d8b1d15c1e | fe6811d8b1d15c1e |
| FIRST_DISH_V1 | d239a74834432569 | d239a74834432569 | d239a74834432569 |
| FOOD_TRAIL_V1 | cdee38c8f99c59fb | cdee38c8f99c59fb | cdee38c8f99c59fb |
| LIGHT_AND_LIFE_V1 | 1baf2031c7ef9446 | 1baf2031c7ef9446 | 1baf2031c7ef9446 |
| PREDATOR_BALANCE_V1 | 2e948c7d70aff634 | 2e948c7d70aff634 | 2e948c7d70aff634 |
| RESERVE_COMPARE_V1 | 158effd1d6af2d0e | 158effd1d6af2d0e | 158effd1d6af2d0e |
| STARCH_UNLOCK_V1 | aea5ac258a76932b | aea5ac258a76932b | aea5ac258a76932b |
| STARCH_UNLOCK_V1+E01 | da6b2cdd897f3f35 | da6b2cdd897f3f35 | da6b2cdd897f3f35 |
| R-G1 | c81e848f7f7e473b | c81e848f7f7e473b | c81e848f7f7e473b |
| R-G2 | 6c848a77d1b2291a | 6c848a77d1b2291a | 6c848a77d1b2291a |
| R-G3 | dc005e7482cbe7ae | dc005e7482cbe7ae | dc005e7482cbe7ae |
| EXP_102:B | 71243b58a813fc60 | 71243b58a813fc60 | 71243b58a813fc60 |
| EXP_106:B | ff6ad77181041eea | ff6ad77181041eea | ff6ad77181041eea |
| EXP_B:B | 38baac85155444f5 | 38baac85155444f5 | 38baac85155444f5 |
| SHARED_LUNCH_V1 | 0c312485379ed15d | 0c312485379ed15d | 0c312485379ed15d |
| OIL_NEIGHBORHOOD_V1 | 4ce88e76450e4b03 | 4ce88e76450e4b03 | 4ce88e76450e4b03 |
| PROTEIN_CHAIN_V1 | 3754a631f383dd83 | 3754a631f383dd83 | 3754a631f383dd83 |
| BROKEN_CATALYST_V1 | 0143728607d74854 | 0143728607d74854 | 0143728607d74854 |

**Cause, proven by `tmp/flip/gains.ts` and `tmp/flip/foodtrail.ts`:**
- At the fence ticks, the lineages of all 18 entries hold exactly one module-change birth: FOOD_TRAIL_V1 birth 45, a B01 at tick 443, +E01.
- Under the pre-flip list that birth chose from E01/E03/E05. Under the shipped list it chose from E01/E03/E04/E05/E10/E12.
- `detInt(…, n, …)` gave index 0 both times, so the pick was E01 both times and the module index in content order (0) did not change either.
- The matching digests confirm that nothing else differs in these worlds.

## Test files changed and why

- `tests/helpers/world.ts`: `clearWater(overrides, reg = registry())` gains an optional registry, so a test can build a Phase 2 clear-water dish. The change is additive and the default is unchanged.
- `tests/sim/modules.test.ts` (P2.1 subject):
  - The manifest test now asserts the ten shipped modules and v2, and asserts that the g2 lists stay E01/E03/E05 and v1.
  - The core-roster eligibility, three-slot and uniform-draw tests run on `g2Water()` (`registryWith(G2_LISTS)`), unchanged.
  - New tests: shipped eligibility for all 19 enabled species (CT §7.1), and a uniform B01 draw over its six shipped options (5 sd).
  - The recorded-registry test uses the new values and also checks that a Phase 2 dish keeps E01/E03/E05.
- `tests/fixtures/module-accounting.test.ts`:
  - The B01/B04/B06 eligibility lines use the new values.
  - The E09/E10 surcharge test uses `registry()`; `[...shipped, 'E09','E10']` now fails validation for duplicates.
- `tests/fixtures/registry-imports.test.ts`:
  - The unknown-genome-module example changes from E09 to E13, because E09 is now enabled.
  - The "changed build" becomes version 3.
  - The recorded registry, the eligibility, the info registry and both export-meta pins become v2 with the ten modules.
- `tests/sim/founders.test.ts`:
  - The pooled B01+B04 Diverse test (3 options) is pinned to `registryWith(G2_LISTS)` and is unchanged.
  - New shipped test: each species is uniform over its own 6 or 7 legal gains (5 sd), and every pick equals the SPEC oracle.
- `tests/sim/founders-newdish.test.ts`: the preview registry is v2 with ten modules; the ready info names all ten from content.
- `tests/content/atlas.test.ts`: the enabled marks are the ten visualLayers, each with a FEATURE_FRAMES row; "an atlas without features" now fails once per mark (10).
- `tests/e2e/new-dish.spec.ts`: "Module registry version 2", plus "Colony adhesion (E12)"; "10 of 17 abilities".
- Module tests switched to `registry()` and the import of registryWith was dropped. The builder-era `registryWith({ enabledModules: [...shipped, 'E0x'] })` now fails validation ("must not contain duplicates"), and the shipped manifest is now exactly that registry. The headers now say "shipped manifest (… since D-0059)". Files:
  - `tests/fixtures/module-e04.test.ts`
  - `tests/fixtures/module-e06.test.ts`
  - `tests/fixtures/module-e07.test.ts`
  - `tests/fixtures/module-e08.test.ts`
  - `tests/fixtures/module-e09-e10.test.ts`
  - `tests/fixtures/module-e12.test.ts`
  - `tests/fixtures/shared-budget.test.ts`
  - `tests/persistence/adhesion-import.test.ts`
- `tests/fixtures/module-e12.test.ts` (also): "a world whose manifest lacks E12" uses the shipped manifest minus E12.
- `tests/persistence/adhesion-import.test.ts` (also): "in a dish without E12" uses a Phase 2 dish (`clearWater({}, registryWith(G2_LISTS))`).
- `tests/fixtures/film.test.ts`: the two "without the film system" registries also drop E10. E10 needs film (`MODULE_SYSTEM_NEEDS`), so validation refused them. Module draws use their own stream after the preference draw, so the compared B04 draws are unaffected.
- `tests/sim/links.test.ts`: the division re-key test runs in a Phase 2 dish. Its test-only adhesion link joins two non-carriers 34 cells apart, and the now-enabled E12 sever rules would cut it at once. The subject is the link table, not E12.
- `tests/experiments/framework.test.ts`: the "module this build does not enable" example changes from `founders.B01.E09` to `founders.B01.E13`.
- `tests/tools/sim-tune.test.ts`: two describes are pinned to `registryWith(G2_LISTS)`. The no-legal-gain cases need the Sunbead's single option, and the 130363 report test asserts that gain-eligible daughters are fewer than daughters, which holds only while a Sunbead carrier has nothing left to gain. Both are tune-g2 / Phase 2 subjects.
  - module draws counted exactly as drafted
  - the seed-130363 Accelerated report
- Seed-101 Accelerated tests follow the new trajectory, where the first branch is established at tick 1927 (1415 before). They now run to 2100 ticks:
  - `tests/sim/lineage-panel.test.ts` (1600 → 2100). Its motility-band pin now says a Sunbead is inactive for motility unless it carries E07: it asserts per Sunbead `motile === carries E07`, that at least one seeker and one still Sunbead exist, and `inactive` equals the still Sunbeads.
  - `tests/sim/lineage-host.test.ts` (1500 → 2100)
  - `tests/worker/keep-autosave.test.ts` (1500 → 2100)
  - `tests/persistence/strip-names.test.ts` (1500 → 2100)
  - `tests/fixtures/branch-evidence.test.ts` (1000+800 → 1000+1100; the fresh run goes to 2100)
- `tests/ui/feed-modules.test.ts`: seed 11's birth 72 at tick 305 now gains **Light seeker (E07)**, and the feed says "A Sunbead offspring gained Light seeker.". For seed 101 (2100 ticks), branch 0's root (birth 71) gained **Shade collector (E06)**, and its row reads "gained Shade collector (E06)".

No assertion was removed or loosened. Each moved value was either measured on the new trajectory or kept on the Phase 2 registry. No stateHash literal was added.

## PROPOSED D-0059

## D-0059 · 2026-10-10 · P3.7 · Phase 3 modules enabled (moduleRegistryVersion 1 → 2); recipe trajectories change only through mutation module options
Context: the lead module flip (docs/agent/g3-wave-3.tasks.js.txt "LEAD MODULE FLIP"; W4-20…W4-24; D-0036, D-0042); report docs/reports/reviews/g3-flip/flip-build.md.
Decision:
- `content/manifest.json` enables E04, E06, E07, E08, E09, E10 and E12 beside E01, E03 and E05 (all of IMPLEMENTED_MODULES), with moduleRegistryVersion 1 → 2. The contentHash is rewritten by content-validate --write. The atlas is unchanged: all ten marks have been present since wave 2, and art:build --check reports it up to date.
- A world changes only through what it records. New dishes record registry version 2 and the ten modules. Module-gain draws (mutation and Diverse founders) pick uniformly among CT §7.1's larger legal lists. Old saves and Phase 2 dishes keep their recorded registry (version 1; E01, E03, E05).
- Fence: no digest moved at its tick. In all 18 entries a single module draw fires by the fence tick (FOOD_TRAIL_V1 birth 45, tick 443), and it picks E01 under both lists. `registryWith({ enabledModules: shipped minus the seven, moduleRegistryVersion: 1 })` reproduces every recorded currentDigest. The g2Digests and the g2 saves' expected values are unchanged. `fence-update --all --reason D-0059` re-records nothing.
- Longer horizons do move:
  - Accelerated FIRST_DISH_V1 seed 101: birth 71 gains Shade collector (E06) instead of Reserve chamber (E05), and its first branch is established at tick 1927 (1415 before).
  - Seed 11: birth 72 gains Light seeker (E07).
  - EXP_102 arm A: birth 426 gains E07 instead of E05.

  Tests that follow those trajectories run 2100 ticks and name the new modules. Tests whose subject is Phase 2 content pin `registryWith(G2_LISTS)`. Measurement changes are recorded in docs/reports/experiments-g2.md, "After the Phase 3 module flip (D-0059)". The wave-A goldens are unchanged.
Reason: SPEC §9; CT §7.1; D-0036 (the flip ends P3.7 under a registry version bump); old saves keep their recorded ruleset.
Affects: content/manifest.json; tests/helpers/world.ts (clearWater registry argument); the test files listed in the report; docs/reports/experiments-g2.md.
Owner review: no

## Surprising

- **The fence did not move at all.** The checklist expected FIRST_DISH_V1, R-G1..R-G3, the Standard P2 recipes and EXP_201–204 to move. At 1200 ticks on Standard, only one module draw fires across all 18 entries, and its pick (E01, index 0) is the same under both lists. The fence still proves the cause (step 3), but it cannot see the flip. If the lead wants a fence entry that does see it, a candidate is an Accelerated FIRST_DISH_V1 seed 101 entry at about tick 400 (`--add` with a transform), because birth 71's gain at tick 305 differs (E05 → E06). I did not add one; that would be a new fence entry, which needs the lead's call.
- **Builder-era registries now fail validation.** Wave 3 module tests built `registryWith({ enabledModules: [...shipped, 'E0x'].sort() })`, which contains duplicates after the flip. Any later test written in that style must deduplicate.
- **E10 needs the film system, so it constrains no-film registries.** Any no-film registry built from the shipped lists must drop E10 too.
- **E12 changes link-table tests that use test-only adhesion links.** Its sever rules now run in every shipped dish, so the D-0043 link-table tests that place those links need a dish without E12. Only `links.test.ts`'s division test was affected.
- **E07 makes a Sunbead motile.** The lineage-panel motility-band test had pinned "no Sunbead is motile", which no longer holds in shipped dishes.
