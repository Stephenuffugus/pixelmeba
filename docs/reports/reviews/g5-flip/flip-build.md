# The Phase 5 systems flip (D-0121): build report

Builder: the systems-flip subagent, 2026-10-14, on main = 9d22ec0 (wave 11). Nothing committed; the lead commits.
Sources: docs/agent/g5-wave-11.tasks.js.txt "THE SYSTEMS FLIP" items 1–9, docs/agent/g5-systems-flip-plan.md "Code"
1–7 and "Checks", and the lead's rulings 1–10 in the assignment. The plan's Code item 8 (the saves verifier) is the
lead's and was not run here.

## Code items

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Manifest: enabledSystems + barriers, climate, devices; enabledStructures + S01–S12 (sorted); nothing else | DONE | content/manifest.json (contentHash rewritten by the validator) |
| 2 | IMPLEMENTED_STRUCTURES = S01–S12; new sorted IMPLEMENTED_SYSTEMS | DONE | src/sim/content/implemented.ts |
| 3 | Import refuses an unimplemented system, structure or native ability, by name, before the schemas | DONE | src/persistence/saveFile.ts `unimplementedRulesProblem` (called before ManifestSchema) |
| 4 | registryWith dedupes repeated ids; barrierRegistry / resterRegistry checked | DONE | tests/helpers/registry.ts `withoutRepeats` (patch lists and cache key); tests/helpers/world.ts (both drop allowUnimplemented, now unneeded) |
| 5 | Tests that save dishes recording a still-unimplemented ability | DONE | tests/persistence/phase5-import.test.ts mocks IMPLEMENTED_NATIVE_ABILITIES + HANDLING, MIXOTROPHY, TRAP ("until waves 12/13"); no other save/load test records A03, A04, F03, P06, P09 or P10 (searched every file that saves or loads). DishHost `{kind: 'state'}` takes only states that went through loadSaveFile or were made by this build, so it needs no check. |
| 6 | content-validate: device tile in TILE_FRAMES, ALL_TILES, enabledTiles (with 'devices') | DONE | tools/content-validate.ts; tests/render/phase3.test.ts and tests/content/atlas.test.ts re-pinned |
| 7 | New tests tests/persistence/import-implemented.test.ts | DONE | 11 tests: 'equipment', an unknown future system ('weather'), a made-up structure (S99), a P10 (HANDLING) dish, an unknown ability (TELEPORT), every unimplemented schema ability; host path with the open dish untouched; a new dish, a silicate/signals/rivalry dish, both corpora, the wave 10/11 fixture dishes load |

Refusal sentences (kind 'content', the module refusal's family):
- `This dish uses the "equipment" system, which this version of Pixelmeba cannot simulate. Nothing was loaded.`
- `This dish uses the structure "S99", which this version of Pixelmeba cannot simulate. Nothing was loaded.`
- `This dish's P10 uses the native ability "HANDLING", which this version of Pixelmeba cannot simulate. Nothing was loaded.`

## Checks (in the order run)

| Check | Status | Command → summary |
|---|---|---|
| Targeted tests while working | DONE | e.g. `npx vitest run tests/fixtures/trajectory-fence-files.test.ts tests/tools/fence-update.test.ts tests/content tests/render/phase3.test.ts tests/render/structure-layers.test.ts tests/persistence/import-implemented.test.ts tests/persistence/phase5-import.test.ts --maxWorkers=2`; a first full pass found 23 tests in 18 files the flip moved, all re-pinned by cause (below), then re-run: 18 files, 220 tests passed (after one more re-pin, lab-commands 42/42) |
| content:validate --write, then content:validate | DONE | `wrote contentHash 84c41636…`; then `content ok · contentHash 84c41636fd7774852a3dbdbc3d32715f9cfe52a19d48ad605e50dd37d524c357 · … 5 world tiles (film, pellet, wafer, stain, device; 1691 frames)` |
| art:build -- --check | DONE | `atlas up to date · 1691 frames (136 feature-mark frames, 26 world-tile frames) · 1024×2048 · 393e81b629bc` |
| The fence | DONE, unchanged | see "Fence" |
| Full check | DONE, green | `npm run typecheck && npm run lint && npx vitest run --maxWorkers=2` → `Test Files 278 passed (278) · Tests 3108 passed (3108)`, vitest 3964.8 s, whole command 4061 s (67.7 min). No file failed, so no single-worker re-run was needed. |
| Journeys, desktop + phone-portrait | DONE | `E2E_PORT=4271 E2E_OUTDIR=tmp/dist-flip npx playwright test tests/e2e/structures-environment.spec.ts tests/e2e/structures.spec.ts tests/e2e/region-charts.spec.ts tests/e2e/new-dish.spec.ts tests/e2e/lab-tools.spec.ts tests/e2e/field-guide.spec.ts tests/e2e/a11y-screens.spec.ts --project=desktop --project=phone-portrait` → `52 passed (50.1m)`: desktop 26/26, phone-portrait 26/26, 0 skipped; port 4271 stopped before and after |
| D-0104 checks | DONE | automated: e2e structures.spec "climate per dish …" (a new Garden shows the wetting brush, light and drying controls, the Build group and the warmth overlay; an imported rc1 save, fungal-supply-line-t900, shows none of them); e2e field-guide.spec (S01–S12 by name and the wetting brush); structures-environment.spec (the Environment group, unskipped); a11y-screens.spec (axe on "New Dish: Environment" and on the Lab habitat and tools trays with the controls and Build group asserted visible); unit: structures-p5 guide model, import-implemented corpora |
| Perf | DONE | `npx tsx tmp/flip/perf.ts` (and `AGENTS=6000 TICKS=600`) → appended to docs/reports/perf-g5.md "Systems flip (D-0121)": tick p95 with 512 edges + 256 devices + cycle + drying 5.4–5.6 ms at ~350 organisms (3.9–4.1 without), 22.0–22.8 ms at ~5,800 (16.5–20.7 without) |
| ARCH note | DONE | docs/ARCHITECTURE.md §11.3, "As built, Phase 5 systems flip" after the wave 10 import note |

## Fence

`npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts --maxWorkers=2`

- Right after the manifest and implemented-list edits, before any fence addition: `Test Files 9 passed (9) · Tests 71
  passed (71)` (766.6 s).
- Final, with the two additions: `Test Files 10 passed (10) · Tests 77 passed (77)` (363.7 s): the same 71 plus the
  two new entries' current-digest tests and the four tests of trajectory-fence-files.test.ts.
- Every recorded digest, hashAtLoad and hashPlus1000 is unchanged: `git diff tests/fixtures/fence.json` shows only the
  two appended entries; tests/fixtures/saves/expected.json, saves-rc1/expected.json and protocol2-golden/ are
  untouched. No leak: a new dish records the systems and allocates nothing (climate arrays null, stores empty).

## The two new fence entries

Option used: **(a) test-only recipe files plus a documented tool path**. A new entry kind `recipeFile`
(tests/helpers/fence.ts) names a RecipeDef under tests/fixtures/fence-recipes/, parsed with RecipeSchema and realized
by realizeRecipe exactly as a content recipe (its scheduledCommands are queued as the recipe's commands). It is never in
content/, so nothing appears in the game; its id must not be a content recipe's. The tool path is
`npx tsx tools/fence-update.ts --add-file <tests/fixtures/fence-recipes/ID.json> [--ticks N]` (no --reason, like
--add; only files under that folder; --recipe/--all re-record it like any entry). Why: --add takes only shipped recipes
with no command schedule, and a shipped recipe would be player-visible; recipes already carry structures, devices and
environment overrides (D-0111), and scheduledCommands give "placed by command at tick 0" with the commands in the
hashed command log.

| Entry | File | Ticks | currentDigest | What it is |
|---|---|---|---|---|
| FENCE_CYCLE_HEATER | tests/fixtures/fence-recipes/FENCE_CYCLE_HEATER.json | 1500 (day, dusk and into night) | 11e6eeb6695ec849 | FIRST_DISH_V1's habitat, patches and founders with lightMode 'cycle'; an S09 heater placed at (52, 60) by a placeDevice command at 0 s and switched on by setDevice at 0 s |
| FENCE_BARRIER_LINE | tests/fixtures/fence-recipes/FENCE_BARRIER_LINE.json | 1200 | 56e40d203f44e18f | Water Garden without stones; sugar west of x 60, inhBact by the resin; B01, B04, A01, P01; by command at 0 s: an S01 line on the R edges of x 60, y 40–88 (42 edges), S02 gates at y 62–66, a closed S03 shutter at y 70, an S04 channel (flow +1) at y 58, an S08 resin at (72, 64) set to inhBact |

Both replay identically at 1× (trajectory-fence-current: one `run`) and at the 4× analogue with a save → load through
the import at the midpoint (trajectory-fence-files.test.ts: four steps per chunk, stateHash observed between chunks,
buildSaveFile/loadSaveFile at ≥ ticks/2, final digest = currentDigest). tests/tools/fence-update.test.ts covers the
new mode's refusals and re-creates FENCE_BARRIER_LINE through `--add-file` with the recorded digest.

## Test files changed, and why

New:
- tests/persistence/import-implemented.test.ts: the D-0121 import rule (Code 7).
- tests/content/structures-implemented-check.test.ts: keeps the validator's "not implemented" structure refusal
  covered now that every shipped structure is implemented (mocks IMPLEMENTED_STRUCTURES without S12).
- tests/fixtures/trajectory-fence-files.test.ts and tests/fixtures/fence-recipes/*.json: the two fence entries.

Helpers:
- tests/helpers/registry.ts: `withoutRepeats`; registryWith dedupes every list (and its cache key).
- tests/helpers/world.ts: `FLIP_SYSTEMS`, `preFlipRegistry()` (the shipped manifest without barriers/climate/devices
  and S01–S12: what a v1.0 dish records; its contentHash is the pre-flip 67075b0e…, so the protocol 2 golden still
  matches); barrierRegistry/resterRegistry without allowUnimplemented.
- tests/helpers/fence.ts: kind 'recipeFile', `readFenceRecipe`, `fenceStart`; fenceGroup puts it in 'recipes'.

Re-pinned by cause (no assertion weakened; where a test meant "a v1.0 dish" it now builds one with preFlipRegistry, and
where it meant "this build" it now expects the flipped lists):
- Shipped lists / implemented list: tests/content/structures-p5.test.ts (IMPLEMENTED_STRUCTURES = S01–S12; the shipped
  manifest enables all twelve plus the three systems and no other Phase 5 system; system-need errors against the v1.0
  systems; the brush is listed by the build), tests/content/objectives.test.ts (gate refusals under the pre-flip
  manifest; S02 now validates; buildPhase 4 case without phase 5 structures), tests/content/recipe-structures.test.ts
  (PRE_FLIP for the "needs" refusals; the shipped build now accepts S01), tests/content/system-requirements.test.ts
  (patches enabledStructures to the cell structures, as it patches every other list), tests/sim/lab-commands.test.ts
  (enabledStructures lists; S01 needs barriers; STONE's index), tests/sim/gates.test.ts, tests/sim/view-switch.test.ts
  (DishInfo.structureIds lists S01–S12; the habitat tray has the wetting brush; the "older dish" helper also drops the
  three flip systems), tests/recipes/variants.test.ts (the "not enabled" capability is now 'equipment').
- "A v1.0 dish" built under preFlipRegistry: tests/sim/barrier-transport, chemistry, climate-commands, climate-cycle,
  climate-determinism (NEUTRAL now compares with a pre-flip dish), climate-light, climate-moisture,
  recipe-overrides-env, structure-commands; tests/worker/new-dish-environment, probes-gates, protocol3-v1-equivalence
  (golden unchanged and matching), structure-commands-host, structure-snapshot. Each also asserts the flipped side
  where it is cheap (e.g. the shipped registry now accepts a cycle; a new dish lists roof and canopy factors).
- contentHash / atlas: tests/render/phase3.test.ts (device compared like every tile), tests/content/atlas.test.ts
  (device frame refusal; enabledTiles with 'devices').
- Saves of unimplemented abilities: tests/persistence/phase5-import.test.ts (mock; also dedupes its structure list).
- Fence tool: tests/tools/fence-update.test.ts (--add-file).
- Journeys: tests/e2e/structures-environment.spec.ts (unskipped; the group is shown), structures.spec.ts (new dish
  shows the controls; rc1 save shows none), field-guide.spec.ts (S01–S12 and the brush), a11y-screens.spec.ts (New
  Dish Environment scan; trays assert the controls and Build group), structureFixture.ts (header comment).
- The Field Guide count: the guide's equipment now lists S01–S12 and WET_BRUSH (tests/content/guide.test.ts already
  computes it from the manifest and passed unchanged).

Non-test files: content/manifest.json, src/sim/content/implemented.ts, src/persistence/saveFile.ts,
tools/content-validate.ts, tools/fence-update.ts, docs/ARCHITECTURE.md, docs/reports/perf-g5.md.

## P5.1 and P5.2 Build lists (BUILD_DIRECTIVE 683–695)

| Item | Verdict | Evidence |
|---|---|---|
| **P5.1** day/night cycle (240 s; factors; inspector phase) | MET | src/sim/climate.ts; tests/sim/climate-cycle.test.ts; tests/worker/structure-snapshot.test.ts (CellInspect cycle phase); e2e structures.spec (cell-light "day and night") |
| local warmth (relax 1 %/tick to 0.5, diffuse 0.05, heater/cooler ±0.01/s, clamp) | MET | tests/sim/climate-warmth.test.ts |
| moisture index (water 1; gel/sediment 0.8; drying −0.001/s to 0.1; wetting 0.9; roof; wick) | MET | tests/sim/climate-moisture.test.ts, climate-commands.test.ts |
| moisture suitability shoulder 0.2 | MET | src/sim/suitability.ts (responseBelowOnly, SHOULDER_MOISTURE); tests/sim/climate-moisture.test.ts "derived.moisture follows the array … shoulder 0.2" |
| canopy factor from A05 biomass | MET (lead ruling: keyed on CANOPY; A05 itself ships at the organism flip) | tests/sim/climate-light.test.ts "A05 with B = 10 gives 0.5 …" (A05 enabled through registryWith) |
| New Dish options | MET | tests/worker/new-dish-environment.test.ts, tests/ui/new-dish-environment.test.ts, e2e structures-environment.spec (unskipped, both projects) |
| recipes override | MET | tests/sim/recipe-overrides-env.test.ts; tests/content/recipe-structures.test.ts |
| **P5.2** S01 fine membrane, S02 small gate, S03 shutter | MET | tests/sim/barriers-table.test.ts (permission matrix), barrier-movement.test.ts, barrier-transport.test.ts, gates.test.ts; e2e structures.spec (S01 stroke, shutter opened) |
| S04 one-way channel (2 %/s pools; one Small organism/s) | MET | tests/sim/channel.test.ts ("S04 organisms") |
| S05 porous shelter, S06 attachment mesh, S07 nutrient basket | MET | tests/sim/barrier-placement.test.ts (shelter refuses Medium/Large; mesh), structure-commands.test.ts (basket carries its object; mesh transfer), tests/fixtures/resting-daughter.test.ts (S06 surface) |
| S08 adsorption resin (0.05/s, cap 5) | MET | tests/sim/resin.test.ts |
| S09 heater, S10 cooler | MET | tests/sim/climate-warmth.test.ts; e2e structures.spec (heater sheet On/Off, Undo) |
| S11 shade roof, S12 moisture wick | MET | tests/sim/climate-light.test.ts (roof 0.25), climate-moisture.test.ts (roof stops drying; wick) |
| edge barriers ≤ 512, devices ≤ 256 | MET | tests/content/recipe-structures.test.ts (512/513, 256/257), tests/sim/structure-commands.test.ts |
| permission matrix | MET | tests/sim/barriers-table.test.ts |
| path checks every crossed edge | MET | tests/sim/barrier-movement.test.ts "a diagonal trace through an exact corner is refused when either L-path crosses a refusing edge" |
| host + parasite as one unit | MET | tests/sim/barrier-movement.test.ts "an A01 carrying an X01 never ends across an S02 …" |
| gate preview tracer (paused, no sim) | MET | tests/render/gate-tracer.test.ts; e2e structures.spec (tracer note while paused) |
| region charts with exchange totals | MET | tests/worker/probes-gates.test.ts, probes-crossings.test.ts, tests/ui/probe-charts.test.ts; e2e region-charts.spec (both projects) |
| D-0104 checks (rc1 save shows none; new dish shows them; guide lists S01–S12) | MET | e2e structures.spec, field-guide.spec (both projects) |

Every item is MET with this flip; the lead may tick P5.1 and P5.2 (D-0119 "Ticking").

## PROPOSED D-0121

PROPOSED D-0121 · 2026-10-14 · Phase 5 systems flip · Barriers, climate, devices and S01–S12 enabled; the import
refuses rules the build does not implement
Context: g5-plan lead call 4, D-0104, D-0119 (contradiction 2, "Ticking"), D-0120 (carried to the flip: the device
tile, the import gap). Builder report docs/reports/reviews/g5-flip/flip-build.md.
Decision:
- **Manifest.** enabledSystems gains 'barriers', 'climate' and 'devices'; enabledStructures gains S01–S12 (BEAD,
  S01…S12, STONE, WALL). No species, module, material, signals, rivalry or silicate. contentHash
  67075b0e4e53e3adaee23cf9d4c65f3045b007881b789351357311ed7f0e5311 → 84c41636fd7774852a3dbdbc3d32715f9cfe52a19d48ad605e50dd37d524c357
  (the manifest lists are the only change). The Field Guide now lists S01–S12 and the wetting brush. The device tile
  (13 frames) is required with 'devices' (content-validate TILE_FRAMES, ALL_TILES, enabledTiles).
- **Implemented lists.** IMPLEMENTED_STRUCTURES = S01–S12. New IMPLEMENTED_SYSTEMS = barriers, chemistry, climate,
  core, devices, enzymes, film, foodObjects, fungi, parasites, rivalry, signals, silicate, viruses (the v1.0 systems,
  the flip's three, silicate from wave 10 and signals and rivalry from wave 11); not equipment or developmental.
- **The import rule.** parseSaveFile refuses, with kind 'content' and the module refusal's sentence ("This dish uses
  the "<id>" system | the structure "<id>", which this version of Pixelmeba cannot simulate. Nothing was loaded.";
  "This dish's <species> uses the native ability "<id>", …"), a dish whose recorded enabledSystems entry is not in
  IMPLEMENTED_SYSTEMS, whose enabledStructures entry is neither a cell structure nor in IMPLEMENTED_STRUCTURES, or whose
  recorded species names a native ability not in IMPLEMENTED_NATIVE_ABILITIES. It reads the raw records before the
  manifest and species schemas, so an unknown future id is named, not reported as "Manifest: invalid". The current
  world is untouched. The line is "implemented", not "enabled": a dish keeps its recorded ruleset (an rc1 save records
  no climate and shows none of its controls; a dish recording silicate, signals or rivalry loads).
- **The fence did not move.** g2-replay, rc1-replay, trajectory-fence ×4, conservation-closed-lid, determinism and
  determinism-g3: 9 files, 71 tests passed after the manifest edit; every digest, hashAtLoad and hashPlus1000 unchanged.
- **Two fence entries, as test-only recipe files** (new entry kind 'recipeFile'; tests/fixtures/fence-recipes/; added
  with the new `tools/fence-update.ts --add-file <path> [--ticks N]`, never in content/ so nothing ships):
  FENCE_CYCLE_HEATER (FIRST_DISH_V1 with the light cycle and an S09 placed and switched on by command at tick 0; tick
  1500; 11e6eeb6695ec849) and FENCE_BARRIER_LINE (an S01 line with S02 gates, a closed S03, an S04 and an S08 set to
  inhBact, placed by command at tick 0; tick 1200; 56e40d203f44e18f). Each replays identically at 1× and at the 4×
  analogue with a mid-run save → load (tests/fixtures/trajectory-fence-files.test.ts).
- **Tests.** registryWith drops repeated ids; tests meaning "a v1.0 dish" use preFlipRegistry() (the pre-flip manifest,
  contentHash 67075b0e…); tests saving A04/P10/F03 dishes mock IMPLEMENTED_NATIVE_ABILITIES until waves 12/13.
- **Ticking.** Every item of BUILD_DIRECTIVE P5.1 and P5.2 is met and the D-0104 checks pass (automated in
  tests/e2e/structures.spec.ts, field-guide.spec.ts, structures-environment.spec.ts): P5.1 and P5.2 are ticked.
Reason: the flip is the one point where shipped dishes gain the climate and structure systems; none of the shipped
recipes uses them, so the fence holds, and the import now refuses exactly what this build cannot run.
Evidence: full check 278 files / 3108 tests passed; journeys 52 passed (desktop 26, phone-portrait 26); perf
docs/reports/perf-g5.md "Systems flip (D-0121)".
Owner review: no.

## Proposed WORKLOG text (for the lead)

- P5.1 [x] "Climate systems: day/night cycle, warmth, moisture, suitability shoulder, canopy factor (A05 at the
  organism flip), New Dish Environment, recipe overrides; enabled at the systems flip <sha> (D-0121)."
- P5.2 [x] "Structures S01–S12, transport classes, caps, permission matrix, path checks, host+parasite, gate tracer,
  region charts with exchange totals; enabled at the systems flip <sha> (D-0121)."

## Surprising, or for the lead

1. **S06's Field Guide text names two unreleased species.** content:validate's warnings grew from 47 to 49 (compared
   against a git archive of 9d22ec0): `content/structures/S06.json → guide.rules: names Rampart (B13)` and `Bellstalk
   (P06), which is not enabled`. S06 is now player-visible in the Field Guide, so its rules text mentions organisms the
   player cannot have until the organism flip. Left as is (a content edit moves contentHash again); the lead may
   reword S06 now or accept it until the organism flip.
2. **A new dish now looks different in three readings**, all as the wave 11 code intended for a dish recording the
   systems: the cell inspector's light line lists roof and canopy factors (1 and 1); a region reading lists the eight
   decaying pools as notMeasured ("decays"); DishInfo.structureIds carries S01–S12. v1.0 saves read as before.
3. **Perf at 4× with a full dish.** A ~5,800-organism dish with the maximum stores reaches a tick p95 of about 22–23 ms
   on this codespace, about 90 % of the 25 ms per-tick budget at 4× (66–83 % without structures). Not a regression
   on any shipped dish; worth a look on a device.
4. `tests/fixtures/fence.json`'s about text still describes only recipe/variant/arm entries; the new kind is documented
   in tests/helpers/fence.ts and tools/fence-update.ts.
5. The first full vitest pass (before re-pinning) took 69.5 min with 2 workers; the final one 66 min (4061 s
   including typecheck and lint).
