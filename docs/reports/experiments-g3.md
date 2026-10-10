# Phase 3 experiments and curated dishes (P3.9)

Task BUILD_DIRECTIVE P3.9 (CT §9.3, §10.1, §10.3; SPEC §7.7, §13.1–13.2; D04 §8; D-0005, D-0022,
D-0027, D-0030, D-0051, D-0052). Wave 4, stage 1 builder `experiments-curated`.

- Content hash at the time of these runs: `299ad78a…5d20ea` (content version 2, simulation version 3,
  build phase 3, module registry version 2). Other wave 4 builders edit content in the same tree, so the
  committed hash may differ; no number below depends on their records.
- Every number comes from `runExperiment` / `realizeRecipe` (src/sim) in this session, headless Node
  through `npx tsx`, on the shared 2-CPU machine (load 4.2–4.7). Run times are not performance numbers.
- Each result is **this run** on one seed, not a general effect. "Coincided with" wherever the record
  holds no mechanism.

## What was built

**Recipe extensions** (all optional; every earlier recipe realizes bit-identically: the fence passed
with every recorded digest unchanged before the new entries were added):

| Field | Meaning |
|---|---|
| `ops` (recipe) | Geometry ops painted right after the habitat's own ops, under the same rules (structure cells hold no inventory; one `geometryVersion` bump), before background overrides, patches and founders. `recipeGrid(habitat, recipe)` (src/sim/recipes.ts) includes them; What if? validation (variants.ts) and the registry use it. |
| `placement: 'scatter'` (founder) | The group's eligible cells (its disk, row-major: inside the dish, occupiable, not taken by an earlier group) permuted by `detPermutation(n, seed, 'founder.place', groupIndex)`; the first `count` are used. Absent = `'nearest'` (the Phase 2 order). New stream `founder.place` appended to STREAMS. |
| `cells` (founder) | One listed cell per member, in member order; inside the dish and the group's disk, distinct, occupiable, else `RecipeError` (and a registry error for everything checkable without a world). |
| `initial` (founder) | Per member `{B?, N?, E?}`: a **labelled setup**, not a test-only override. The B and N difference is logged as `recordInput('recipe:<id>:initial', ΔB, ΔN)`; an E other than 50 goes to the energy ledger (gain → `energy.earned`, loss → `energy.other`), never to the material inputs. |
| `links: 'chain'` (founder) | Each listed member linked to the next with `addFungalLink(…, LINK_TRANSPORT)`; only for a TRANSPORT_LINKS species with listed four-neighbour cells. |

**Tracked measures** (src/sim/pairedRun.ts; observation only; recorded only when an observer is
asked for them, because the comparison engine shares `ArmObserver`):

| Measure | Definition |
|---|---|
| `infections.SP` | Organisms of SP newly infected during the run (after stage 5: `infectedBy ≠ 0` with the timer still 0). |
| `limitSeconds.SP.REASON` | Organism-seconds of living SP whose inspector reading was REASON at the end of a tick (0.1 s per organism per tick): the intake limit code for intake reasons; for `SUIT_*` / `INHIBITOR_EXPOSURE` the suitability reason the inspector shows (`entitySuitabilityAt`). |
| `transfer.fungal` | Carbon moved along F02 transport links during the run (fungalTransport's edges, as the history sums them). |
| `wholeUnitCells.SP` | The most cells, at the end of any tick, holding ≥ 1 whole Pinphage unit and a living SP. |

**Player steps** (CT §10.1 in-app evidence; single-arm): `inspectOxygenLimits` ("both species
inspected with different O2 limitations": every followed species seen in the inspector with an oxygen
reading — `OXYGEN_LIMITED` or `SUIT_OXYGEN_HIGH` — and the readings differ) and `observeInfection`
("B01 infection observed": an infected organism the card follows shown by the inspector). Read-only
checks `inspectedOxygenReading` and `inspectShowsInfection` (src/sim/experiments.ts), noted by the
host's `experimentSteps`.

## The three cards

| Card | Recipe (seed) | Setup | Stop | Gate |
|---|---|---|---|---|
| EXP_104 A hidden neighborhood | HIDDEN_NEIGHBORHOOD_V1 (104) | Water Garden defaults, lid closed; 20 B01 + 20 B03 nearest-first at (50,70) r 6; sugar 0.50 + nutrient 0.20 per patch cell (113 cells) | 180 s | `limitSeconds.B01.OXYGEN_LIMITED > 0` and `limitSeconds.B03.SUIT_OXYGEN_HIGH > 0`; step `inspectOxygenLimits` |
| EXP_105 One compatible host | ONE_HOST_V1 (105) | 30 B01 at (35,64) r 6 with sugar 0.50; 30 B05 at (90,64) r 6 with metabolite 0.50; nutrient 0.20 on both; V01 5 units per patch cell on both (four labelled patches) | 180 s | `infections.B01 ≥ 1`, `infections.B05 = 0`, `wholeUnitCells.B05 ≥ 1`; step `observeInfection` |
| EXP_212 Fungal supply line | FUNGAL_SUPPLY_LINE_V1 (212) | Water Garden, no stones, background sugar 0; recipe op gel rect x 56–67, y 60–68; one F02 group at (60…63,64), `links: 'chain'`, `initial` [{B 4, N 0.4}, {}, {}, {}], E 50 | 10 s | `transfer.fungal > 0` (the exact ledger is the fixture's oracle) |

## Results (end of run)

### EXP_212 — gate reached at 1 s; the exact ledger holds

- `transfer.fungal` 0.358 C over 10 s; bodies at 10 s: B 3.800 / 2.088 / 2.066 / 2.046 (sum 10 exactly);
  N stays 0.10 × B in every segment; energy equal in all four (no energy moves).
- `tests/experiments/fungal-supply-line.test.ts` compares every segment's B and N after **every one of
  the 100 ticks** with an oracle written only from SPEC §7.7 and D-0052 (no simulation import), to
  1e-12, and `transfer.fungal` with the oracle's running total. Carbon and nutrient: sum B = 10 and
  sum N = 1 every tick; ledger relative error 0 for C and N.
- Link 0–1 moves from tick 1; link 1–2 and link 2–3 start later (received carbon relays only on later
  ticks, as SPEC §7.7 says).
- Measured without the mechanism (scratch, not shipped): the same recipe without `links` moves 0 C;
  without `initial` (all four at b0) moves 0 C.

### EXP_105 — gate reached at 1 s

- `infections.B01` 30 (every Sprinter), `infections.B05` 0, `wholeUnitCells.B05` 30 (from the first
  tick: a whole unit sat in the cell of every Crossfeeder), `deaths.B01.DEATH_LYSIS` 30; Sprinters
  extinct by 60 s; Crossfeeders 22 alive at 180 s (16 births); `field.v01` 6.69 C at 180 s.
- Ledger relative error C 1.6e-14, N 9.9e-14.
- Non-vacuity: `wholeUnitCells.B05 ≥ 1` is a gate clause, so "zero B05 infections" is never read off
  a Crossfeeder that met no virus. The risk named in the assignment (water diffusion dropping cells
  below one unit) did not bite: 30 Crossfeeder cells held ≥ 1 unit at the end of tick 1.
- In the app (worker test): the stamp waits for `observeInfection`; tapping healthy Sprinters or any
  Crossfeeder does not take it; tapping an infected Sprinter posts the stamp recorded at the gate
  moment, equal to the headless one.

### EXP_104 — revision 2 reaches its gate at 1 s (D-0068)

Revision 2 of HIDDEN_NEIGHBORHOOD_V1 starts the dish at oxygen 0.03 (`backgroundOverrides.oxygen`); founders,
patch, seed, lid and stopping time are CT's. Probe across starting levels: docs/reports/exp104-revision-probe.md.

| Measure (seed 104, 180 s) | Revision 2 | Revision 1 (O2 0.8) |
|---|---|---|
| `limitSeconds.B01.OXYGEN_LIMITED` (gate > 0) | **131.1** org·s (holds) | 0 (failed) |
| `limitSeconds.B03.SUIT_OXYGEN_HIGH` (gate > 0) | **3496.7** org·s (holds) | 998 |
| gate reached | at 1 s | never |
| oxygen mean | 0.027 | 0.761 |
| intake B01 / B03 | 65.8 / 46.8 | 111.7 / 0 |
| alive B01 / B03 | 28 / 20 | — / 0 |
| births B01 / B03 | 9 / 0 | — |
| deaths B01 / B03 | 1 / 0 | — / 20 (stress, by 50 s) |

- **Mechanism**: the founders land on a rich sugar patch and feast; each Sprinter's oxygen demand scales
  with its intake (`fracO = min(1, O2 / demandO2)`, src/sim/intake.ts). The feast empties the patch's
  oxygen, so Sprinters read `OXYGEN_LIMITED` from tick 8 to tick 126 (all 20 at 2 s). Once the sugar
  is eaten down `FOOD_ACCESS_LOW` leads, demand falls and oxygen diffuses back; after 20 s the lowest
  oxygen in any Sprinter's cell stays above 0.003, and no Sprinter is oxygen-limited again.
- **Dusks** live the whole run: at 0.03 their suitability `1 − O2/0.4` is about 0.93, a mild
  `SUIT_OXYGEN_HIGH` reading that holds about 97 % of organism-seconds.
- **Player texts**: the oxygen-limited reading appears only in about the first ten seconds, so the
  recipe text, the intervention, the predicted trade-off and the `inspectOxygenLimits` step line say the
  dish starts low in oxygen and to pause in the first seconds while the patch is busiest. The step line
  stays conditional. In the app (worker test) the real card's stamp waits until a Dusk
  (`SUIT_OXYGEN_HIGH`) and an oxygen-limited Sprinter have both been tapped.
- Fixture: tests/experiments/hidden-neighborhood.test.ts pins these values and the tick-8-to-126 window;
  the fence entry was re-recorded with reason D-0068. Owner review: the gate moment is short; the
  alternative is to keep EXP_104 out of the v1.0 card list.

## Curated dishes (CT §9.3)

Water Garden defaults elsewhere (stones, background sugar 0.02), lid open, fixed light 0.8,
Standard evolution, founders scattered among the valid cells of their patch with the recipe seed
(= the recipe number). Recipe ids keep the file names (L301 → `L301_TWO_LUNCHES`, L303 →
`L303_PUBLIC_KITCHEN`, L304 → `L304_EMPTY_AFTER_THE_FEAST`, L306 → `L306_BORROWED_SHELTER`).

| Dish | Founders (mode) | Patch | Abilities at creation (seed = id) |
|---|---|---|---|
| L301 Two Lunches | 30 B01 at (40,64) r 8 + 30 B01 at (88,64) r 8 (Varied) | 2 × 197 cells, sugar 0.5 + nutrient 0.2 | none |
| L303 Public Kitchen | 20 Y02 + 20 B08 at (64,64) r 8 (Diverse) | 197 cells, protein 0.5 C with proteinN 0.05; nutrient **set** to 0.1 | 1 Brothmaker Resting stage (E03), 1 Creambud Surface anchor (E04) |
| L304 Empty After the Feast | 60 B01 at (64,64) r 10 (Diverse) | 317 cells, sugar 0.8 + nutrient 0.2 | 6 Sprinters: 2 Resting stage (E03), 4 Colony adhesion (E12) |
| L306 Borrowed Shelter | 40 B06 at (64,64) r 8 on a gel disk from the recipe's own op (Identical) | 197 gel cells, sugar 0.6 + nutrient 0.2 | Matrix builder (E10) on the 20 odd founders; label "Pre-seeded genomes" |

What happens (one run each, seed = recipe number, 600 s, Standard; reported, never tuned):

- **L301**: 120 alive at 60 s (60 births, then none); every Sprinter starved by 339 s
  (120 `DEATH_STARVATION`); intake 350.8 C.
- **L303**: no births. Brothmakers are at mean 0 E by 120 s and extinct at 146 s; Creambuds extinct
  at 197 s; all 40 `DEATH_STARVATION`. 19.25 protein C converted to broth; Creambuds took in 10.0 C,
  Brothmakers 7.6 C. As D-0051 measured for EXP_203, the Brothmakers' enzyme cost and upkeep exceed
  what the broth returns under CT's numbers; the Creambuds outlive them by about 50 s.
- **L304**: 133 at 120 s (73 births), then starvation; extinct at 412 s.
- **L306**: 60 at 120 s; all 20 births came from the founders **without** Matrix builder; the
  Matrix-builder family kept a higher mean energy (87 E vs 45 E at 60 s) and coincided with no
  divisions; the Matrix-builder family died out at 507 s, the other at 551 s; 67.2 E spent on
  construction; film 20.3 C at 600 s.

## Setup readings (proposed decisions)

1. EXP_104 and EXP_105 stop at 180 s (CT gives none; as EXP_103). Nearest-first founders and Water
   Garden defaults (D-0022 foundation-card conventions).
2. EXP_105's phage is four labelled recipe patches (two food patches, two 5-unit phage patches), so
   `patchInput.N` names each dose separately.
3. EXP_212 has no player step: CT §10.3's evidence is the exact ledger, which the fixture checks; the
   card's intervention points at the inspector's "Sent … / Received …" line.
4. Curated dishes: mutationPreset `standard` (CT silent); scatter placement (D04 §8); L306 founder
   mode Identical (CT names only the seeded module); L303 "free nutrient 0.1" as nutrient set to 0.1 in
   the patch (equal to the Water Garden's own value, so no input is logged for it); `baseLight` 0.8
   written explicitly (the Water Garden's own value).
5. `limitSeconds` is organism-seconds (count × 0.1 s per tick), not dish seconds.
6. New Dish lists curated dishes (recipe ids `L\d{3}_…`, phase ≤ build phase) as "Start with" choices,
   read from the bundled recipe records like the Lab tray reads tool texts; picking one sets the seed,
   setting and founder mode to the recipe's own, so the worker records the authored recipe.

## Not done / follow-ups

- EXP_104 ships on recipe revision 2 (D-0068, above); owner review of the short gate moment.
- The New Dish map is drawn by the host's `newDishPreview` from `habitatGrid(habitat, {removeStones})`,
  which does not include a recipe's own ops, so L306's gel disk is missing from the picture (the words
  say "Gel bed"). One-line fix in src/worker/host.ts (field-guide's file this wave):
  `const layout = recipeGrid(w.content.habitat, recipe);` (import `recipeGrid` from `@sim/recipes`).
- The Play shelf is unchanged until Phase 4, as assigned.
