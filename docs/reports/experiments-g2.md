# Experiments framework and first cards (P2.5)

Task BUILD_DIRECTIVE P2.5 (SPEC §13.2; CONTENT_TABLES §10.1–10.2; D06 §8; D01 §15). This wave covers
the simulation/content framework and the headless fixtures. The card UI, the journal stamp display
and the in-app flow come next wave. Experiment C (RESERVE_COMPARE_V1, needs E05) is not in this wave.

- Content hash `ec279b0636c4761a75a307f9e92e5bc774ec26fe0efb0e126cbca530e1803732` (content version 1,
  simulation version 3, build phase 2).
- Every number below comes from `runExperiment` (src/sim/experiments.ts) in this session, headless
  Node through `npx tsx`, on the shared 2‑CPU machine (1‑min load 2.5–2.7). Run times are not
  performance measurements.
- "Coincided with" is used wherever the record holds no mechanism. Each result is **this paired run**
  (or **this run**) on one seed, not a general effect.

## What was built

**A card** (`content/experiments/*.json`, `ExperimentSchema`) holds:
- the question and recipe;
- the suggested intervention as text, plus its applied form `change`;
- the predicted tradeoff, measurements, stopping point and confounds;
- the observation `gate` and the completion behavior (`completion.journalStamp`; `worldKeepsRunning: true`).

`change` is the **one declared difference** between the two copies of a paired card:
- **Arm A** is the recipe as written. **Arm B** receives the change.
- `omitPatch` and `shade` are part of B's setup before tick 0.
- `commands` run the recipe to `atSecond`, copy it (serialize → two worlds), and apply ordinary
  command payloads to B through `applyNow`, which is the same path a player's gesture takes.

**The gate** is a `custom` predicate. Every clause must hold:

`{measure, arm: A|B|diff|absDiff, op, value}`

- It is evaluated after every simulated second.
- Reaching it records a `JournalStamp` (card, seed, recipe and revision, content hash, second, clause
  values). The run continues to the stopping point, because completion never stops a world.
- A gate that is not reached reports every clause value at the end, and no stamp.

**Measurements** use a fixed grammar (`parseMeasure`; listed in the module header), e.g.
`intake.B06`, `consumed.detritus`, `converted.starch`, `deaths.B01.DEATH_PREDATION`, `patchInput.0`.
- A read‑only observer (stage hooks 5→6, history accumulators, the event ring) computes them. It
  never draws randomness and never writes to a world.
- The fixtures prove this: arm A's end hash equals the recipe run with plain `run()` and no
  experiment code.

**Validation** (`experimentProblems`, called from the registry) checks:
- gate clauses and measurement ids;
- species and materials, and for shipped cards that they are enabled in the manifest;
- that paired ⇔ change;
- patch indexes, tick alignment, and atSecond < stop;
- that every part SPEC §13.2 names is non‑empty;
- the recipe's scheduled command payloads.

Each error names the file and field.

## The six cards

| Card | Recipe (rev) | Seed | Arms / change | Stop | Gate (source evidence → predicate) | Result |
|---|---|---|---|---|---|---|
| EXP_A What unlocks starch | STARCH_UNLOCK_V1 (1) | 104729 | paired; B omits the starch patch | 180 s | CT §10.2 report "enzyme‑derived sugar vs bootstrap" → runSeconds ≥ 180 and A converted.starch > 0 | **reached at 180 s** (converted 6.771 C) |
| EXP_B What changes when a grazer arrives | FIRST_DISH_V1 (1) | 104729 | paired at 120 s; B +2 P01 at (48,64), (48,63) | 300 s | "+180 s" with the grazer recorded → runSeconds ≥ 180 and B interventionAccepted ≥ 2 | **reached at 300 s** |
| EXP_101 Food trail | FOOD_TRAIL_V1 (1) | 101 | single | 180 s | "followed group biomass +25 %; food use" → biomassRatio.B01 ≥ 1.25 and intake.B01 > 0 | **reached at 7 s** (ratio 1.2515) |
| EXP_102 Light and life | LIGHT_AND_LIFE_V1 (1) | 102 | paired; B shade paint over the whole dish (light × 0.1) | 180 s | "compare 180 s; different photosynthetic totals" → runSeconds ≥ 180 and absDiff intake.A01 > 0 | **reached at 180 s** (|Δ| 1451.6 C) |
| EXP_103 Cleaning crew | CLEANING_CREW_V1 (1) | 103 | single | 180 s | "≥ 2 detritus C consumed" → consumed.detritus ≥ 2 | **reached at 12 s** (2.118 C) |
| EXP_106 Predator balance | PREDATOR_BALANCE_V1 (1) | 106 | paired at 0 s; B +5 P01 (brush r 6 at (50,70)) | 180 s | "compare 180 s; read consumption and prey history" → runSeconds ≥ 180, B interventionAccepted ≥ 5, B captures.P01 ≥ 1 | **reached at 180 s** (17 captures) |

The in‑app half of each D01 completion lives in `completion.playerSteps`. It is checked by the card
UI next wave, not by these fixtures. The steps are: inspect food use, open resource history, view the
comparison, view prey history.

## Results per card (end of run)

**EXP_A What unlocks starch.** Bootstrap sugar (`patchInput.0`) is 2.900 C in both copies.

| | A (starch 17.4 C) | B (starch omitted) |
|---|---|---|
| Enzyme‑made sugar (`converted.starch`) | 6.771 C | 0 |
| Starch left | 10.629 C (= 17.4 − 6.771) | 0 |
| Sugar eaten by Crumbsmiths | 7.881 C | 2.492 C |
| Sugar left | 1.790 C (= 2.9 + 6.771 − 7.881) | 0.408 C |
| Births / deaths / alive | 0 / 12 / 0 | 0 / 12 / 0 |
| Extinct at | 153 s | 151 s |

- All deaths are `DEATH_STARVATION`.
- Copy A took in 3.2× the carbon of copy B, but both copies died out. See the limiting‑factor
  section below.

**EXP_B What changes when a grazer arrives** (120 → 300 s).

| | A (control) | B (+2 Amoebae) |
|---|---|---|
| B01 deaths (predation / starvation) | 1 (0 / 1) | 12 (6 / 6) |
| B01 births | 57 | 67 |
| B01 biomass | 327.16 | 305.24 |
| Biomass of Amoeba prey (`preyBiomass.P01`) | 982.70 | 956.38 |
| Captures (captured C) | 0 | 12 (23.34 C) |
| Sugar left | 50.69 C | 52.45 C |
| Amoebae alive | 0 | 3 |
| Logged Amoeba carbon (`inputCarbon`) | 0 | 8 C |

- In B, the Amoebae also caught 6 Sunbeads (`deaths.A01.DEATH_PREDATION` 6).
- The placement command results were accepted 1 / 1.

**EXP_101 Food trail.**
- Sprinter biomass: 30 → 37.5 (the gate) at 7 s, and 110.78 at 180 s (ratio 3.69).
- Intake 166.68 C (equal to `consumed.sugar`), 27 births, 2 starvation deaths, 55 alive.
- The trail strokes logged 157.5 C of sugar and 63 of nutrient. Background sugar 0.02 per cell is
  also food (disclosed as a confound).

**EXP_102 Light and life.**

| | A (light 0.8) | B (shade, light 0.08) |
|---|---|---|
| Carbon fixed by Sunbeads (`intake.A01`) | 1508.79 C | 57.17 C |
| Sunbeads alive / births | 367 / 337 | 30 / 0 |
| Mean O2 | 0.767 | 0.764 |

No deaths in either copy.

**EXP_103 Cleaning crew.**
- Detritus eaten: 2.118 C at the gate (12 s) and 12.297 C by 180 s. This equals Recycler intake.
- It exceeds the 10 C input because two dead Recyclers added their bodies to the debris.
- At 180 s: 0 births, 2 starvation deaths, 8 alive, detritus left 0.185 C.

**EXP_106 Predator balance.**

| | A | B (+5 Amoebae at 0 s) |
|---|---|---|
| Captures (captured C) | 0 | 17 (20.19 C) |
| B01 deaths | 40 (starvation) | 37 (17 predation, 20 starvation) |
| B01 births | 0 | 0 |
| B01 alive | 60 | 63 |
| B01 biomass | 110.10 | 117.99 |
| Sugar left | 130.22 C | 134.15 C |
| Amoebae alive | — | 2 (3 starved) |

- In this paired run, the grazers coincided with three more surviving Sprinters and 3.9 C more sugar
  left. Food limits both copies: 100 Sprinters share 56.5 C in 113 cells.

## EXP_A: measured limiting factor for Crumbsmith survival

The gate is reached, because conversion is positive in copy A. The G1 risk is confirmed, though:
**all 12 Crumbsmiths starve before 180 s, with no births, in both copies, on every development
seed.** No mechanic or constant was changed.

- D06 §8 anticipates this outcome: "its energy cost may outweigh the gain". The card reports it
  rather than hiding it.
- The inspection is the same kind P1.12 used: leading limit, secretion code, division gate,
  position, the energy ledger and local concentrations.

**Crumbsmiths in copy A (10 s samples, seed 104729):**

| s | Alive | Mean E | Mean H | Secretion code | Sugar in their cells (availability) | Sugar within r 3 / dish | Enzyme activity within r 3 |
|---|---|---|---|---|---|---|---|
| 10 | 12 | 46.8 | 100 | SECRETING 100 % | 0.0054 (0.051) | 0.231 / 1.509 C | 1.167 |
| 30 | 12 | 35.8 | 100 | SECRETING 100 % | 0.0073 (0.068) | 0.325 / 2.127 C | 1.616 |
| 40 | 12 | 33.4 | 100 | SECRETION_ENERGY_LOW 100 % | 0.0042 (0.040) | 0.181 / 2.287 C | 0.869 |
| 60 | 12 | 27.2 | 100 | SECRETION_ENERGY_LOW 100 % | 0.0019 (0.019) | 0.079 / 2.245 C | 0.319 |
| 90 | 12 | 15.4 | 100 | SECRETION_ENERGY_LOW 100 % | 0.0008 (0.008) | 0.034 / 2.094 C | 0.105 |
| 120 | 12 | 2.9 | 100 | SECRETION_ENERGY_LOW 100 % | 0.0006 (0.006) | 0.022 / 1.923 C | 0.041 |
| 140 | 12 | 0.0 | 47 | SECRETION_ENERGY_LOW 100 % | — | — | — |
| 160 | 0 | — | — | — | — | — | — |

- The leading intake limit is `FOOD_ACCESS_LOW` for 100 % of living Crumbsmiths at every sample from
  10 s, in both copies.
- The limit was never `NUTRIENT_LIMITED`, `OXYGEN_LIMITED` or `CROWDING_INTAKE_HALVED`.
- The division gate is `DIV_BLOCK_BIOMASS` at every sample. Mean body peaks at 1.33 of the 2.00
  needed.
- The group stays on the patch (centroid within 1.1 cells of (64.5, 64.5) until 150 s).

**Energy ledger, 12 Crumbsmiths combined (E per 30 s window):**

| Window | Copy | Earned | Maintenance | Movement | Secretion |
|---|---|---|---|---|---|
| 0–30 s | A | 130.7 | 144.0 | 13.1 | 144.0 |
| 30–60 s | A | 65.5 | 144.0 | 17.3 | 7.8 |
| 60–90 s | A | 21.5 | 144.0 | 18.0 | 0 |
| 90–120 s | A | 11.2 | 144.0 | 18.0 | 0 |
| 0–30 s | B | 64.0 | 144.0 | 17.7 | 0 |
| 30–60 s | B | 5.5 | 144.0 | 18.0 | 0 |
| 60–90 s | B | 2.6 | 144.0 | 18.0 | 0 |
| 90–120 s | B | 1.6 | 144.0 | 18.0 | 0 |

**Limiting factor: food access at the Crumbsmiths' own cells.** The numbers above show a chain:

1. **Secretion doubles the energy spend.** Secreting costs 0.4 E/s on top of 0.4 E/s maintenance.
   Over the first 30 s, each Crumbsmith earns 0.36 E/s against about 0.84 E/s spent.
2. **Energy falls below the emit threshold.** Mean E drops below the 35 E threshold at about
   35–40 s, and secretion stops (`SECRETION_ENERGY_LOW`).
3. **The enzyme decays and conversion slows.** Activity within r 3 falls from 1.62 to 0.04 by
   120 s. Conversion goes from 17.40 → 13.82 C of starch in 30 s to only 3.19 C in the next 150 s.
4. **The sugar that is made does not stay where they are.** At 10–30 s only about 15 % of the dish's
   sugar is within r 3 of the patch, and 1.1 % by 120 s. Water diffusion (0.10) carries it away, and
   in‑cell sugar stays below 0.0073 (availability below 0.07).
5. **Intake falls below costs.** From 60 s, intake is at most 0.06 E/s per Crumbsmith against
   0.45 E/s of maintenance and movement.
6. **They starve.** E reaches 0 at about 125–130 s. Health then falls by 4 per second of starvation.
   All 12 die of `DEATH_STARVATION` at 150–153 s.

Copy B follows the same path 2 s earlier: extinct at 151 s, with one third of the intake.

**The enzyme's net effect in this paired run:**
- Copy A earned 236.4 E (7.881 C × 30). Copy B earned 74.8 E. The difference is 161.6 E.
- Copy A spent 151.8 E on secretion.
- The enzyme's extra food therefore repaid its cost by about +9.8 E across 12 organisms, about 0.8 E
  each. This coincided with copy A outliving copy B by 2 s.

**Seed robustness** (in memory, content untouched; same card on the six CT §11 seeds):
- Copy A goes extinct at 153–154 s and copy B at 151 s on all six seeds.
- Converted sugar is 6.64–6.77 C.
- There are 0 births in both copies on every seed.

### Content‑only candidates (measured in memory; no content was changed)

Each candidate changes one recipe number (CT §11) in a would‑be new revision STARCH_UNLOCK_V2. All
were run on the six development seeds, 180 s. Every gate was reached and every ledger was exact.

| Candidate (V2) | A converted C | A intake C | A alive at 180 s | B intake C | B alive at 180 s | Births A / B |
|---|---|---|---|---|---|---|
| V1 as is (bootstrap 0.10) | 6.64–6.77 | 7.76–7.89 | 0 (extinct 153–154 s) | 2.48–2.49 | 0 (extinct 151 s) | 0 / 0 |
| bootstrap 0.30 per cell | 10.70–10.95 | 15.60–15.80 | 0–3 | 7.26–7.29 | 0 (extinct 179 s) | 0 / 0 |
| bootstrap 0.50 per cell | 14.89–15.08 | 23.00–23.16 | 12 on 6/6 seeds | 11.78–11.84 | 12 on 6/6 seeds | 0 / 0 |

A second shape was checked on seed 104729 only. With both patches at r 6 instead of r 3 (two
numbers), copy A converted 28.38 C and took in 28.62 C, and 12 were alive in each copy.

**Proposal: no revision is clearly justified. This is an owner decision (listed below).**
- V1 reaches its gate and shows exactly what D06 asks: enzyme‑made sugar measured separately from
  the bootstrap.
- Extinction is a valid, explainable outcome.
- A bootstrap of 0.50 is the only measured one‑number revision that keeps Crumbsmiths alive to 180 s.
  But it also keeps the **no‑starch** copy alive. The copies would then differ only in intake (about
  2.0×) and conversion, not in survival.
- Neither candidate produces a birth within 180 s.

## Integrity

- **Conservation.** Every ledger check passed in every arm of every card: 8 checks per arm (every
  30 s and at the end). Worst relative error was C 2.7e‑14 and N 1.1e‑13; mineral was exact.
  Deaths without a recorded cause: 0.
- **Determinism.** Two separate processes gave identical end hashes for all 10 arms (listed below).
  - Within the fixtures, each arm is rebuilt from scratch and replayed with plain `run()`. Its start
    and end hashes match the experiment's.
  - `framework.test.ts` also runs EXP_103 twice and compares the whole results as canonical JSON.
- **Observation only.** Arm A of every card equals the recipe run with no experiment code. This
  includes EXP_B's control, which equals FIRST_DISH_V1 run straight to 300 s.
- **Paired arms differ only in the declared variable** (`framework.test.ts`):
  - EXP_A: only `starch` differs (0.60 in each of 29 patch cells); inputs differ by exactly 17.4 C.
  - EXP_102: only `grid.shade` differs (0.1 on every dish cell; derived light 0.08).
  - EXP_B and EXP_106: A equals the shared baseline. B's log gains exactly the card's commands, and
    replaying them on another copy reproduces B's hash.

End hashes (seed per card, 16‑hex `stateHash`):

| Card | A start → end | B start → end |
|---|---|---|
| EXP_A | 2149467337d1946a → c3538e589673bacd | b62ff04d44709a96 → 5535358f5efc4f94 |
| EXP_B | 3b1c07bdd373e21c (baseline, t1200) → 75465405b4ec0dc2 | 2dbbc5b6317a16be → ab609120fa985ec1 |
| EXP_101 | 8339c23a89d989bf → 4cb0698347842f54 | — |
| EXP_102 | da9afb3ef50c1e37 → 4f58af666c813d72 | df313d87d2b0d6e8 → 321993269ddb2206 |
| EXP_103 | f343db65b9ba9050 → 32359f97ab2f1a7a | — |
| EXP_106 | 8cd073a8ffb1a729 (baseline) → c223c582218cbe85 | 7b2f20a373785aa9 → b68f04e24b885ca9 |

## Setup interpretations (proposed decisions)

1. **Arm naming.** A is the recipe as written, and B receives the declared change. For EXP_A, B is
   "the duplicate where the initial starch deposit is omitted" (D06 wording). A patch removal is not
   a player command, so the omission is part of B's setup.
2. **Light and life.** "B shaded to 0.1" is read as shade paint (CT §6 SHADE, light × 0.1) over
   the whole dish in copy B, for effective light 0.08.
   - Whole dish, so that Sunbead daughters cannot leave the shade.
   - This is a setup change because no shade command exists until P2.7. It can move to that command
     in a later card revision.
3. **Food trail.** The trail is a rectangle, but recipe field patches are disks. So the trail is two
   tick‑0 scheduled deposit strokes (SUGAR 0.50, NUTRIENT 0.20). Their serpentine polyline at brush
   radius 0 covers exactly the 315 cells with x 36–80 and y 61–67.
   - Logged inputs are `tool:SUGAR` 157.5 C and `tool:NUTRIENT` 63.
   - A `rect` patch shape for recipes would be cleaner later.
4. **Cleaning crew.** "10 detritus C with 1 bound N across the patch" becomes 10/113 C and 1/113 N per
   cell over the 113 cells of the r 6 disk. The logged input is 10.000 C / 1.000 N.
5. **D01 foundation cards** use the Water Garden defaults (stones, background sugar 0.02), the
   Standard preset and Identical founders.
   - Founders use SPEC §13.1 nearest‑first placement, which is canonical over D01's "scatter
     uniformly".
   - The five Amoebae in EXP_106 are added with the ordinary inoculate brush (r 6 at (50,70)). That
     brush does scatter them over the patch, using the deterministic inoculate stream.
6. **EXP_B placement.** "Nearest valid cells to (48,64)" was resolved at authoring time into two
   radius‑0 inoculations at (48,64) and (48,63). A fixture checks that these are the two nearest
   Amoeba‑valid cells in distance, then y, then x order.
7. **Gate choices.**
   - EXP_A gates on positive conversion, not survival, because D06 warns the cost may exceed the gain.
   - EXP_B gates on the grazer arriving; "what changes" may be nothing.
   - EXP_106 requires at least one capture, so that there is consumption to read.
   - EXP_102 requires a difference in either direction.
8. **Card seed.** The card seed equals the recipe seed, which the framework test enforces. The runner
   realizes with the card seed.

## Commands run (this session)

- `npx tsx tools/content-validate.ts --write` wrote contentHash `ec279b06…`. The second run printed
  `content ok` (recipes 6, experiments 6, variants 4).
- `npx vitest run tests/experiments tests/content`: 9 files, 53 tests passed (final run).
- `npx vitest run tests/content tests/recipes`: 3 files, 43 tests passed.
- `npx tsc -p tsconfig.json --noEmit` was clean. `npx eslint` on every file I touched was clean.
- Scratch probes via `npx tsx` (not committed):
  - all six cards in one process, about 18–45 s depending on load;
  - the EXP_A timeline, energy ledger and local sugar;
  - EXP_A candidates on six seeds, about 2.5–6 s per paired card.

## Not done / follow‑ups

- The card UI, journal stamp display and in‑app checks of `playerSteps` are next wave.
- Experiment C (RESERVE_COMPARE_V1) is next wave. The framework already supports it:
  - `commands` changes can carry scheduled deposits;
  - founder `moduleAssignment` alternate‑odd seeds E05;
  - measurements already cover energy, births, deaths by cause and extinction times.
  - It still needs per‑founder‑group descendant counts: a new measurement id, `descendants.<group>`.
- Vitest runs the simulation about 3–5× slower than `tsx`. The same 1,800 ticks of
  CLEANING_CREW_V1 take 1.1 s under tsx and 3.8 s inside vitest. The fixtures were trimmed to
  one run per card plus an arm replay for this reason. `tests/experiments` took 150 s and, with
  `tests/content`, 383 s under heavier shared load.
