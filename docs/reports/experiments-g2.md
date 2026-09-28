# Experiments framework and first cards (P2.5)

Task BUILD_DIRECTIVE P2.5 (SPEC §13.2; CONTENT_TABLES §10.1–10.2; D06 §8; D01 §15). Wave A built
the simulation/content framework, six cards and their headless fixtures (the sections below up to
"Not done / follow‑ups"). Wave B (the last section, **Wave B: one paired‑run model, Experiment C, cards
in the app**) merged the two measurement observers into one paired‑run model, added Experiment C
(RESERVE_COMPARE_V1, a Seeded traits demonstration) and put the seven cards, their runs and the journal
stamp in the app. Wave A's numbers below are unchanged by wave B; a test proves it.

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

---

# Wave B: one paired‑run model, Experiment C, cards in the app

- Content hash `86bd7cde1dc471ef886c8481530da0770c0c9a1cf7fefbd1cd32dd760719fe49` after adding
  RESERVE_COMPARE_V1 and EXP_C (content version 1, simulation version 3, build phase 2; recipes 7,
  experiments 7). Another agent's in‑flight content edits can move the hash; the fixtures read it
  from the manifest.
- Numbers come from `runExperiment` and `DishHost` in this session: `npx tsx` scratch probes and the
  vitest fixtures, on the shared 2‑CPU machine (1‑min load 5–10 during this wave). Times are not
  performance measurements.

## 1. One paired‑run measurement model

Wave A had two observers: `experiments.ts` (named measurement ids, stage‑hook intake, pools,
captures, extinction) and `worker/comparison.ts` (births, deaths, deaths by cause, capacity‑limited
intervals, the comparison panel's summary). SPEC §13.4 describes one comparison model, so both now
use **`src/sim/pairedRun.ts`**:

- `ArmObserver`: one read‑only observer with every accumulator both sides had, plus founder groups
  and the reserve peak (below). It never draws randomness and never writes to a world.
- `PairedRun` / `stepObserved`: A one tick, then B one tick, each with its observer's stage hook.
  The comparison engine and paired cards step through this same class; single‑arm cards step one
  arm the same way.
- Two read‑outs of the same observer: `measureArm` (the named grammar, for cards and gates) and
  `measureSummary` (the comparison panel: counts, biomass, Shannon H, oxygen, deaths by cause,
  trait distributions, module frequencies, capacity intervals, carbon added).
- `comparison.ts` and `experiments.ts` re‑export what their callers used, so no caller changed
  except the host's paired‑card wiring.

**Proof of no behaviour change.**

1. Before touching the code, a scratch script recorded every number wave A produces: the six cards
   through `runExperiment` (gate, stamp, every catalog measurement, reported measurements, ledger,
   unattributed deaths, a SHA‑256 of each timeline, start and end state hashes) and three
   comparisons through `runPairedComparison` (FIRST_DISH_V1 +5 Amoebae at 120 ticks for 450 ticks;
   FIRST_DISH_V1 + a Feed at 57 ticks for 600 ticks; STARCH_UNLOCK_V1 + a starch deposit for 300
   ticks) — on a clean `git archive HEAD` copy.
2. The same script ran on that clean copy with **only** the refactored files copied in
   (`pairedRun.ts`, `experiments.ts`, `comparison.ts`, the additive schema line): **2,771 of 2,771
   recorded values identical, state hashes included; 164 new keys, all new measurement families in
   the catalogs.** A same‑process benchmark showed no measurable cost (EXP_106 8.3–9.1 s unified vs
   9.1–9.3 s before; EXP_102 6.4–6.8 s vs 6.4–7.0 s).
3. The recording (hashes and content hash left out, because they cover the content hash and other
   agents' in‑flight systems) is `tests/experiments/golden/wave-a-measurements.json`. Each card
   fixture now ends with `expectWaveANumbers(r)` and `tests/sim/comparison.test.ts` checks the three
   comparisons with `expectWaveAComparison`: every recorded number must be identical (`===`), and
   the only extra keys allowed are the new measurement families.
4. The existing comparison tests (equal ticks under any wall clock, baseline preserved, deleting a
   comparison keeps saves) and `tests/worker/compare-client.test.ts` pass unchanged.

## 2. Experiment C — Why variation can matter (a Seeded traits demonstration)

**Recipe `RESERVE_COMPARE_V1`** (CT §9.2, D06 §11), exactly: clear water (Water Garden without
stones), §9.1 environment with background sugar 0, lid open, Fixed Traits, Identical founders, seed
104729. 24 B01 in the distinct cells nearest (64,64) within r 3; founder ordinals 1, 3, 5 … carry E05
(`moduleAssignment: alternate-odd`, lineage origin 2 = "present at creation"), 2, 4, 6 … none; all at
50 E, same body and neutral loci; E05 raises the cap to 140 and changes nothing else. One meal: 0.50
sugar C per water cell within r 6 (113 cells, 56.5 C logged as `recipe:patch0:First meal`). The
stable‑food schedule is five recipe scheduled deposits (0.50 per cell at (64.5,64.5) r 6, at 60,
120, 180, 240 and 300 s); a fixture checks each covers exactly the 113 meal cells. Labels
`["Seeded traits demonstration", "Experiment C"]`.

**Card `EXP_C`**, paired, 600 s:

- **Arms** (D06 §8: "a control with stable food and an intervention with a finite initial food
  pulse"): A = the recipe as written (stable food); B = the finite pulse, realized with the new change
  kind **`omitScheduled {indexes: [0,1,2,3,4]}`** — B is the same recipe and seed without those
  scheduled commands. A fixture proves the arms have identical entities, fields, ledger and lineage
  and differ only in the pending queue.
- **Measurements** (CT §9.2 "energy distributions, food consumed, births, deaths by cause, live
  descendants per founder group, extinction times"): `founders`, `descendants`, `groupEnergy`,
  `groupEnergyMedian`, `groupEnergyMin`, `groupEnergyMax` (the energy distribution of each founder
  group; added in the fix wave, see §6), `groupExtinctAt` for `B01.E05` and `B01.none`;
  `reservePeak.B01`, `meanEnergy.B01`, `intake.B01`,
  `consumed.sugar`, `field.sugar`, `inputCarbon`, `births.B01`, `deaths.B01`,
  `deaths.B01.DEATH_STARVATION`, `alive.B01`, `extinctAt.B01`.
- **New measurement families** (grammar in `pairedRun.ts`). A *founder group* is the organisms alive
  when the run starts, grouped by species and supplementary module set; every birth joins its parent's
  group (lineage parent link); an organism introduced during the run joins none.
  `descendants.SP.GROUP` counts living members (a founder that has not divided counts as its own
  line). A fixture checks it against an independent walk of lineage parent links to each living
  organism's generation‑0 ancestor after 90 s (with births). `reserveHeld.SP` is the energy living SP
  hold above the normal 100 E cap, summed over all living members of SP (a population total, not one
  organism's amount; only a reserve chamber allows any); `reservePeak.SP` the largest such total at
  the end of any tick (checked with a labelled test state: one carrier set to 130 E).
- **Gate** (a proposed decision): both copies ran 600 s **and** in copy B a reserve chamber held
  energy above the normal cap (`B reservePeak.B01 > 0`). D06 §11 states the card's question as
  "whether storing surplus changes outcomes when food stops"; a chamber that never holds surplus
  cannot answer it, and D06 names that exact outcome a tuning finding. The gate does not ask for a
  winner.

### Result on V1 (seed 104729): the gate is not reached — measured limiting factor

| | A (stable food) | B (first meal only) |
|---|---|---|
| Gate clauses | runSeconds 600 ✓ | reservePeak.B01 **0** ✗ |
| Sugar added during the run (`inputCarbon`) | 282.50 C (5 × 0.5 × 113) | 0 |
| Sugar eaten (`consumed.sugar` = `intake.B01`) | 320.01 C | 52.04 C |
| Sugar left | 18.99 C | 4.46 C |
| Births / deaths (all starvation) | 52 / 76 | 10 / 34 |
| Most energy held above the normal cap at one moment, all Sprinters together | 0 | 0 |
| Founder family with a Reserve chamber: died out at | 473 s | 216 s |
| Founder family with no extra ability: died out at | 488 s | 230 s |
| Living descendants at 600 s (E05 / none) | 0 / 0 | 0 / 0 |

Every ledger check passed in both copies (22 per arm; worst relative error C 3.0e‑13, N 6.7e‑14,
mineral exact); no death lacked a cause; both copies replay identically from scratch and copy A is
the untouched recipe.

**Limiting factor: no Sprinter ever holds more energy than the normal cap, so the chamber's extra
room is never used.**

1. Mean energy peaks at 80.6 E at the 30 s sample (both copies are identical until 60 s); the
   highest single organism measured in a 30 s‑step probe was 87.1 E, below the 100 E cap.
   `reservePeak.B01` is 0 at the end of every tick in both copies.
2. The leading intake limit of every living Sprinter at every sample from 30 s is
   `FOOD_ACCESS_LOW` (fixture‑checked). The meal spreads by diffusion faster than 24 Sprinters eat
   it: 18.2 of 56.5 C are left at 30 s, but at low concentration per cell.
3. Energy goes to division before it can pile up: the first divisions come at 30–60 s (24 → 30
   alive at 60 s) and division halves energy between daughters.
4. From 150 s the division gate is increasingly `DIV_BLOCK_ENERGY`; everyone starves: copy B is
   extinct at 230 s, copy A (whose last meal is at 300 s) at 488 s.

In this paired run the family with a reserve chamber died out 15 s (A) and 14 s (B) before the family
without one. That **coincided with** the chamber's recorded running cost (0.02 E/s surcharge + 0.03
E/s upkeep) while its extra room held nothing; no measurement here attributes deaths to it.

No mechanic, constant or recipe number was changed. Per SPEC §13.2 the card is not release‑ready
until a new recipe revision reaches its gate; D06 §11 says to "adjust a new version's food pulse or
duration before changing the module's mechanics".

### Content‑only candidates for RESERVE_COMPARE_V2 (measured in memory; no content changed)

Each candidate changes one recipe number (CT §11) in a would‑be RESERVE_COMPARE_V2, with every
other value, the card and the gate unchanged. "Meal dose" is the one number used by the first meal and
the five stable meals ("the same meal again"). All runs are 600 s, and every ledger check passed.

Seed 104729, one candidate at a time:

| Candidate (V2) | Gate | Most energy held above the cap, all Sprinters together (A = B, identical before 60 s) | Families died out in A (E05 / none) | Families died out in B (E05 / none) | Births A / B | Food eaten A / B |
|---|---|---|---|---|---|---|
| V1 as is (dose 0.50, r 6) | not reached | 0 | 473 / 488 s | 216 / 230 s | 52 / 10 | 320.0 / 52.0 C |
| meal r 3 (same dose) | not reached | 0 | 457 / 501 s | 141 / 150 s | 3 / 0 | 65.2 / 13.7 C |
| dose 1.0 per cell | reached | 1.1 E | 462 / 459 s | 181 / 205 s | 124 / 24 | 658.1 / 104.7 C |
| dose 2.0 per cell | reached | 29.2 E | 460 / 473 s | 213 / 232 s | 321 / 66 | 1336.4 / 213.9 C |
| dose 4.0 per cell | reached | 63.6 E | 454 / 476 s | 241 / 258 s | 725 / 124 | 2691.6 / 434.8 C |

Dose 2.0 on the six CT §11 development seeds:

- **The gate is reached on 6 / 6 seeds**; the most energy held above the cap, summed over all
  living Sprinters at one moment, is 26.6–29.6 E.
- Both families still die out in both copies on every seed (B at 207–233 s, A at 445–479 s).
- In copy B the reserve‑chamber family died out first on 5 / 6 seeds (8–19 s earlier) and at the same
  second on 1 (seed 196613).
- In copy A it died out first on 5 / 6 seeds; on seed 262147 it died out 1 s later.

**Proposal (owner decision): no revision is applied.**

- The smallest one‑number revision that reaches the gate on every seed is dose 2.0
  (RESERVE_COMPARE_V2).
- It makes the chamber hold surplus, so the card can ask its question. The answer measured on this
  content is that in this paired run the family with a chamber did not outlast the family without
  one.
- That is an honest, explainable outcome, which D06 allows ("without promising the reserve carrier
  will win").
- A longer famine alone (duration) cannot help while nothing is stored. Dose 1.0 reaches the gate
  with only 1.1 E stored in total, too close to the threshold to rely on.

## 3. Cards in the app

**Worker** (`src/worker/host.ts`, protocol and client, additive):

- `experimentCatalog` returns every shipped card as recorded content (`experimentCardView`:
  question, recipe, intervention, tradeoff, measurements, stopping point, confounds, gate, change,
  patches, schedule, founders, names).
- `experimentStart {cardId, newDishId, compare}` realizes the card with **the same
  `realizeExperimentArms` as the headless runner**. Nothing the UI sends can set a seed, recipe or
  change.
- A single‑arm card opens as a new paused dish whose steps carry the card's observer and `GateWatch`.
- A paired card also opens its paired run through the comparison engine: the new dish holds the
  card's start (A's start state; for EXP_B the recipe run to 120 s), A and B are the card's arms, and
  the card's change is on B before the player sees it (commands listed as interventions).
- The card's change is B's only change: other commands on B and Clear change are refused. The run's
  horizon is the card's stopping point whatever the UI asks.
- After every pair (or single‑arm tick) the same `GateWatch` as the headless runner evaluates the gate
  at whole seconds; on reaching it the worker records the stamp (the stamp plus the card's
  measurements at that moment) and posts `experimentStamp` once the card's player steps are also
  taken (fix wave, §6); the run goes on. `compareState.experiment` carries the gate clauses as
  measured so far, the steps, the stamp once posted and the card's measurements at the end.
- A player command on a single‑arm card's dish (a lineage note excepted) ends that card's
  observation (`experimentEnded`): the measurements would no longer describe the card. A command
  that placed nothing (accepted 0) changed nothing and does not end it (fix wave). The dish goes on;
  nothing is stamped.

`tests/experiments/app-flow.test.ts` drives the real host: Experiment A in the app gives **the same
stamp, gate and card measurements (`toEqual`) and the same end hashes as `runExperiment`**; EXP_B's
arms and interventions equal the headless ones; the Cleaning crew stamp equals the headless stamp and
the dish, still running past the gate, equals the untouched recipe; a change ends a single‑arm
observation; refusals create nothing.

**UI** (Home → Notebook):

- **Notebook** (`Notebook.tsx`): tabs Journal · Experiments. Arrow keys, Home and End move between
  tabs. The other UX §1 tabs arrive in later phases.
- **Experiments** lists the seven cards: title, question, paired or one dish, stopping point, recipe
  labels ("Seeded traits demonstration" on Experiment C), and "Stamped in Journal" once stamped.
- **Card detail** (`ExperimentCard.tsx`) shows question, recipe, suggested intervention (with what A
  and B each get), predicted tradeoff, measurements in words, stopping point, confounds, observation
  gate and completion; **Start this experiment** keeps the current dish in Continue (autosave; a
  failed write starts nothing) and opens the new paused dish.
- **Paired run** (`ExperimentRun.tsx`, route `experimentRun`): phone A/B toggle with synced cameras,
  large screens side by side (the comparison layout). Setup shows both copies in words, what was
  already applied to B, the tradeoff, measurements, gate and confounds, and the prediction note. Run
  reads "Accept the schedule and run both for 10 min" for Experiment C. Running shows the pace
  buttons and the gate clauses with their measured values (✓ / ○ and words, not colour).
- **Results** show "Results · this paired run", the gate outcome (reached at m:ss with the stamp
  text, or not reached with the clause values), the card's measurements A / B / B − A, whole‑dish
  measures, the prediction and a conclusion picker; the conclusion is written onto the stamp.
- **Journal** (`src/ui/journal.ts`, localStorage `pixelmeba.journal`, newest first, at most 200;
  session‑only when storage is unavailable) lists each stamp: stamp text, card, "this paired run" /
  "this run", dish time reached, wall‑clock time, labels, the gate clauses with values, the
  prediction, the conclusion, and the card's measurements labelled when recorded.
- **Single‑arm cards** open the dish with a prompt; the stamp arrives as a toast and in the Journal.
- Text on these screens is at least 16 px; controls are at least 48 px; the layout reflows at 200 %
  text (e2e‑checked).

## 4. Tests and commands (wave B, this session)

What each test proves:

- `tests/experiments/{food-trail,light-and-life,cleaning-crew,predator-balance,exp-a-starch,exp-b-grazer}.test.ts`:
  wave A's checks as before, plus `expectWaveANumbers` (every recorded wave A number is identical
  under the unified model).
- `tests/sim/comparison.test.ts`: wave A's engine checks, plus the three recorded comparisons
  identical.
- `tests/experiments/exp-c-reserve.test.ts`:
  - RESERVE_COMPARE_V1 realizes CT §9.2 exactly: placement, alternating E05, origin "present at
    creation", 50 E, cap 140 vs 100, 113 meal cells, and five scheduled meals on exactly those cells;
  - the arms differ only in the pending queue;
  - every view carries "Seeded traits demonstration" and no ranking words;
  - founder groups equal an independent lineage walk;
  - reserveHeld and reservePeak read correctly;
  - the 600 s card conserves and replays; the gate is not reached, and the limiting factor is
    asserted (peak 0 in both copies, FOOD_ACCESS_LOW, mean E below the cap, both families starve).
- `tests/experiments/framework.test.ts`: the seven cards; honest‑label words (adds adapted/immune);
  `omitScheduled` and founder‑group validation name file and field; the grammar for the new families.
- `tests/experiments/app-flow.test.ts`: the in‑app flow equals the headless runner (see §3).
- `tests/experiments/journal-and-words.test.ts`:
  - the journal store is newest first, holds at most 200, survives a reload, records the conclusion,
    and works session‑only without storage;
  - every card's measurements, gate and change are worded without raw ids.
- `tests/e2e/experiments.spec.ts` covers the P2.5 done‑when path: Home → Notebook → Experiments →
  Experiment A card → Start → paired run with "without the “Starch” deposit" on B → Fast → "Results ·
  this paired run", gate reached at 3:00 → Journal shows the stamp (after a reload too). It also checks:
  - axe (no serious or critical violations) on the list, card, setup, results and Journal;
  - no text below 16 px and no sideways overflow;
  - 48 px targets and 200 % text on Experiment C's card and setup (schedule shown, "Accept the schedule
    and run both for 10 min").

Commands (this session):

- `npx tsx tools/content-validate.ts --write`: `content ok`, recipes 7, experiments 7.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint` on every file changed or created: clean.
- `npx vitest run` on the seven card fixtures: 7 files, 38 tests passed (430 s).
- `npx vitest run` on `tests/sim/comparison.test.ts`, `tests/worker/{compare-client,host-requests,host,protocol,whatif}.test.ts`,
  `tests/fixtures/deterministic-state.test.ts`, `tests/ui/family.test.ts`,
  `tests/experiments/{app-flow,journal-and-words,framework}.test.ts`: 11 files, 85 tests passed.
- `npx vitest run tests/content tests/recipes`: 3 files, 45 tests passed.
- `E2E_PORT=4184 E2E_OUTDIR=tmp/dist-experiments npx playwright test tests/e2e/experiments.spec.ts
  tests/e2e/compare.spec.ts --project=phone-portrait --project=desktop --project=phone-landscape`:
  12 passed (8.5 min). The comparison flow is unchanged under the shared model and the host's
  experiment wiring.
- Scratch probes via `npx tsx` (not committed): the wave A recording before and after the refactor,
  the same‑process benchmark, the EXP_C timeline, and the V2 candidates (one seed each, then dose 2.0
  on six seeds).

## 5. Not done / follow‑ups (wave B)

- EXP_C does not reach its gate on V1. Choosing a V2 revision is an owner decision (above).
- The in‑app observation of a single‑arm card is worker state. Saving and reloading that dish does
  not resume the gate, and neither does an experiment dish opened from Continue.
- `completion.playerSteps` ("inspect food use", "open resource history", "view prey history") is
  not yet checked in the app. The stamp records the measured gate only.
- The inspector does not yet say "present at creation" for Experiment C's seeded founders (lineage
  origin 2). The lineage strings already do.

## 6. Wave B fix wave (adversarial verification: `docs/reports/reviews/g2-wave-b/experiments-verify.md`)

- **Completion copy per card kind.** The card detail says what completing it does
  (`completionText`): one dish — "The world keeps running."; a paired card — both copies run to their
  stopping point and then stop; they are copies, so the player's dish is unchanged and closing the run
  discards them. The steps the stamp also needs are listed on the card.
- **Energy distributions (CT §9.2).** New founder‑group measurements `groupEnergyMedian`,
  `groupEnergyMin` and `groupEnergyMax` (`.SP.GROUP`), reported by EXP_C for both groups. The headless
  result also carries `groupTimeline` beside `timeline`, sampled at the same seconds: per group, the
  living count and the mean, median, lowest and highest energy (`null` when none is alive). The wave
  A timeline samples are unchanged (their hashes are pinned by the golden file), and every wave A
  number is identical (additions only). Checked against an independent walk of lineage parent links
  after 90 s, and on the 600 s run (min ≤ median ≤ max, mean inside, spread present, empty at the end).
- **Empty groups.** An energy over nobody (a group's mean, median, lowest or highest; a species'
  `meanEnergy`) is still recorded as 0 (wave A's convention, pinned by the golden file) but is shown
  as "none alive", and its B − A as "—". Content validation now requires a card that reports such an
  energy to also report its living count (`alive.SP` / `descendants.SP.GROUP`), so the UI can always
  tell. The Journal re‑reads stamps from their raw numbers, so stamps recorded before the rule read
  correctly too.
- **Population totals.** `reserveHeld`/`reservePeak` are labelled "…, all Sprinters together": they
  are sums over living members, not one organism's amount (this report's numbers above say so too).
- **Refused commands** (accepted 0) no longer end a single‑arm card's observation.
- **Player steps (CT §10.1, `completion.playerSteps`).** A stamp needs the measured gate **and** every
  listed step. The worker notes steps from UI events only (never simulation state; never saved):
  "inspector identifies food use" = the inspector's organism is of the species the gate follows and
  took in food in the last second; "resource history opened" = the dish's History was requested;
  "view the comparison" = the paired run's results are on its screen; "read the prey history" = the
  results' "Population history, A and B" was opened (it reads both copies' own history). The stamp
  keeps the values of the moment the measured gate held; steps may come before or after it. A step on
  a paired card needs a paired card and vice versa (content validation). The run screen marks each
  step ✓ / ○.
- **Present at creation.** The inspector's chip for a seeded founder (lineage origin 2, e.g. Experiment
  C's reserve‑chamber founders) reads "present at creation" (UX §3.3).
- **A/B toggle** (`.compare-toggle`, also wave A's Compare screen): 48 × 48 px on phones.
- **Recipe text.** RESERVE_COMPARE_V1 now says "24 Sprinters with the same neutral traits … only the
  reserve chamber differs" (content revision unchanged: wording only; contentHash rewritten).

### Journal storage

The journal is a device store today: `localStorage` key `pixelmeba.journal` (`src/ui/journal.ts`), a
JSON list of stamp entries, newest first, at most 200, readable after a reload and session‑only when
storage is unavailable. Each entry keeps the card, the moment (dish second and wall‑clock time), the
recipe and content versions, the gate values, the card's measurements (formatted when recorded plus the
raw numbers), the prediction and the conclusion. It is **not** part of any world save: not in the
checksummed save file, not in a `.pixelmeba` export, not restored with a slot, and nothing in it is
read by a world. SPEC §14.1 lists "journal" as save content; D‑0027 records the plan (from P2.8,
entries that belong to a dish are also written with that dish's save, outside the state hash, and
exported with it; the device list stays the Notebook's index). The lead records that decision; this
wave does not move the store because P2.8 extends it next.

### Not done in the fix wave

- A dish made from a card and opened again from a save or a file does not yet say that the card's
  observation ended when it was closed: the notice needs a new `experimentEnded` reason in
  `src/worker/protocol.ts` and its toast in `src/ui/state.ts`, outside this wave's files. The worker
  and string halves are in place (`experimentOf`, `experimentEndedText`); a ready patch
  (`tmp/p25-item7-reopen-notice.patch`) was checked in a scratch copy (typecheck clean, host test
  passes).
- A single‑arm card whose measured gate held but whose step is still missing says so only on the card
  detail (the dish view has no experiment panel yet).
- The History sheet charts sugar, nutrient and oxygen totals but not debris, although EXP_103, its
  recipe text and the Debris material say to open it "to see the debris total".
