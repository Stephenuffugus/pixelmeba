# measures-overrides (P5.6 part 1) build report: wave 15, stage 1

The measurement grammar, the test-only overrides, the card extensions, the seven recipes with cards E205–E211, their tests, the fence entries and the content hash are all built. Five cards reach their gates. **E205 and E206 do not, and are reported as not release-ready.** Every old fence value is unchanged. One fence test fails on its key list because seven recipes were added; no old value in it moved. Nothing is committed (the lead commits).

## Checklist

### Build

- **0. Names, written first. DONE**
  - (a) `schema.ts:530`: the `playerSteps` enum gains `'inspectGlow'`, `'toggleShutter'` and `'inspectMoisture'`.
  - (b) `experiments.ts:1124`: `export interface TestOverrideView { description; speciesId; speciesName; field; value; normal }`.
  - (b) `ExperimentCardView` gains `testOverrides?: readonly TestOverrideView[]` (`:1168`) and `regionNames?: Readonly<Record<string, string>>` (`:1170`).
  - (c) `protocol.ts:739`: `DishInfo.testOverrides?: readonly TestOverrideView[]`.
  - (c) `protocol.ts:427`: `SlotModes.testOnly?: true`.
  - (d) `pairedRun.ts`: the `MeasureRef` members are `state`, `glowingStart`, `firstCaptureAt`, `events`, `intakeMode`, `secretingSeconds`, `gateTransfer`, `gateCrossings`, `region`, `regionMean` and `regionMoisture`. `infections` and `wholeUnitCells` gain an optional `virus` field.
  - (d) `export const P5_MEASURE_HEADS` (`:183`) = `resting`, `glowing`, `glowingStart`, `attached`, `events`, `firstCaptureAt`, `intakePhoto`, `intakeSugar`, `secretingSeconds`, `gateTransfer`, `gateCrossings`, `mean`, `moisture`.
  - Also exported: `EVENT_MEASURE_TYPES` (`:154`), `GATE_KINDS`, `STATE_MEASURES` and `REGION_SPECIES_MEASURES`.
- **1. Measurement grammar. DONE** (`pairedRun.ts`; the header grammar list is updated).
  - (a) `resting.SP`, `glowing.SP`, `glowingStart.SP`, `attached.SP` are plain reads.
  - (b) `events.TYPE.SP` is tracked; `firstCaptureAt.SP` is a plain read taken from the same ring pass.
  - (c) `intakePhoto.SP` and `intakeSugar.SP` are tracked. They read a per-slot scratch at the stage 5 and stage 6 hooks, and are allocated only when asked for.
  - (d) `infections.SP.VIRUS` and `wholeUnitCells.SP.VIRUS` are tracked. The two-part ids behave exactly as before.
  - (e) `secretingSeconds.SP` is tracked.
  - (f) `gateTransfer.KIND.F` and `gateCrossings.KIND` are tracked. Each is the reading now minus the reading at the start (`gateReading`, `:498`). A dish without that gate is a `MeasureError` when the observer is created (`trackedOf`, `:413`).
  - (g) `@REGION` on `alive`, `resting` and `biomass`, plus `mean.F@REGION` and `moisture@REGION`, are tracked. They are read from `world.content.habitat.regions` through `regionCells`. A region the habitat does not record is a `MeasureError` at observer creation.
  - (h) `isSuitabilityReason` now includes `RIVAL_EXPOSURE` (`:228`). A grep found no committed golden or content that reads `limitSeconds.*.RIVAL_EXPOSURE`; only the wave 15 task texts mention it.
  - `catalogIds` is unchanged: the new ids appear only when the observer was asked for them (tested).
  - **`secretionEnergy.SP` is NOT built.** The energy ledger records secretion energy per dish only (`ledger.energy.secretion`), not per organism or species, so I did not invent it. E217 can read the cost through `secretingSeconds.B13` and the B13 energy.
  - Gate tallies: `transport.ts:546` tallies every diffusing field. Salt and sugar both have `'normal'` diffusion, so salt across S03 and sugar across S01 are recorded; no tally was added.
- **2. Test-only overrides. DONE**
  - (a) `TEST_OVERRIDE_FIELDS = ['speed']` (`recipes.ts:68`). `testOverrideProblems` (`:103`) is run for every recipe (`registry.ts:342`).
  - (a) The validator also refuses a curated (`L3xx`) recipe with overrides (`registry.ts:343`) and a What if? variant whose source recipe has them (`registry.ts:368`).
  - (b) `withTestOverrides` (`recipes.ts:134`) runs inside `realizeRecipe` right after `worldContentFor` and before `createEmptyWorld` builds the species table. It writes copies of the species records and merges a canonical list into the provenance. With no overrides it returns the same content object.
  - (c) `serialize.ts:399` appends `h.string('testOnly').string(canonicalJson(testOverrideFieldValues(world)))` only when the provenance list is non-empty. Values come from the species copies, sorted by species then field.
  - (d) Refusal sentence (`testOverrideRefusalText`): **"<recipe name> is an experiment fixture with a test-only override; it opens only from its experiment card."** It is used by `host.ts:2200` (`build()`) and `recipeFile.ts:592` (import). Experiment dishes still export `'no-start'`.
  - (e) Save meta: `meta.testOverrides: true` (`saveFile.ts:266`).
    - A slot index keeps only its evolution and registry copies, so `slotMetaCopies` (`host.ts:276`) folds the flag into the evolution copy.
    - `slotModes` reads it back as `SlotModes.testOnly` and strips the copy's own key (`host.ts:268`).
    - `info()` gets `DishInfo.testOverrides` from `worldOverrideViews` (`experiments.ts:1239`, `host.ts:3397`).
  - (e) **Load-time species check.** The import runs, on each species copy:
    - `SpeciesSchema`, where `speed` is non-negative, so 0 passes;
    - `speciesSystemNeeds`, `nativeAbilityPairingProblem` and `unimplementedRulesProblem`.

    There is **no** motility-locus check at load. The content validator's rule "motility locus cannot be active without native speed" (`registry.ts:259`) runs only on the registry's own records, and P10 and P05 both have `lociActive[0]` true. At speed 0 that locus has no effect: `phenotype.ts:503` gives profile speed 0, and `species.ts:99` sets `selfPropelled = def.speed > 0`, which is false, so `movement.ts:485` skips them. The test shows the organisms never move.
- **3. Cards. DONE**
  - (a) `omittableFounderGroup` (`experiments.ts:382`). Refusal message: "only the last founder group, or a group whose later groups all list their cells, can be omitted".
  - (b) `RecipeSchema.furnish` (`schema.ts:457`) is placed by `recipeStructures` after the recipe's devices (`recipes.ts:610`).
    - It is validated like a habitat's furnish areas (shape checks in `recipeShapeProblems`, device store rules on realization).
    - `withHabitatOverride` drops it, and `recipeTouchesStructures` counts it.
  - (c) The steps are noted by `inspectShowsGlow`, `inspectShowsMoisture` and `isCardShutterToggle` (`experiments.ts:887`–`928`) and wired into the host at `host.ts:968` and `:1588`.
    - The card's own shutter toggle does not end the card. Every other accepted command still ends it.
    - The validator requires the matching content for each step (a placed S03, a followed species with glow rules, a moisture measure).
  - (d) `ExperimentValidationContext.habitats` (`experiments.ts:223`). The validator now checks:
    - a region measure names a region of the recipe's habitat;
    - a gate measure names a gate kind the recipe or its habitat places;
    - the field system of `mean.F` and `gateTransfer.*.F` is enabled;
    - a shipped card's habitat is enabled and offered (`habitatOfferProblem`).

    `experimentCardView` fills `regionNames` and `testOverrides`.
- **4. The seven recipes and cards. DONE** (`content/recipes/*.json` and `content/experiments/EXP_205`–`EXP_211.json`, all phase 5 and revision 1).
- **5. Headless runs. DONE.** Results are in the table below. **E205 and E206 are not release-ready.**
- **6. Fence. DONE.** Seven entries were added with `--add`; nothing else was touched. The FENCE section below has the details.
- **7. Content hash. DONE.** `0c5a10e0be8a…98551a1` → `efeb7ad364d9d5ebaf53ccdacda156717f81ad2f20ac2fd723f522653e710e7a`. The manifest's lists are unchanged.

### Done when

| Check | Status |
|---|---|
| My 8 test files | DONE, all pass |
| `tests/experiments/*` + `tests/recipes/*` | 24 files, 205 tests passed (after re-pins) |
| `tests/content`, `tests/tools`, `tests/ui/measure-words-p5`, `tests/sim/lab-commands`, `tests/fixtures/predation-matrix`, `tests/fixtures/film` | 31 files, 787 tests (after 2 re-pins) |
| The 9 files that failed on narrowed manifests | 173 passed |
| `tests/worker/{host,whatif,new-dish-habitats,protocol3,protocol3-v1-equivalence,keep-dish}` + `tests/persistence/*` | Passed after the helper fix and re-pins. `tests/worker/comparison.test.ts` and `tests/persistence/save*.test.ts` do not exist; I ran all of `tests/persistence/` instead. |
| `npx tsc -p tsconfig.json --noEmit` | clean |
| `eslint` on every file I changed | clean |
| `content:validate` | clean, contentHash written |
| Fence | Every value unchanged. `habitats-p5-equivalence` fails on its key list only: FENCE below. |
| E2E | none, as assigned |

## Measure ids (one line each)

- `resting.SP`: living SP in a life state other than Active now (Preparing, Resting or Waking).
- `glowing.SP`: living SP with glowState 1 now.
- `glowingStart.SP`: that count when the observer started.
- `attached.SP`: living SP with hostBirthId ≠ 0 now.
- `events.TYPE.SP`: event records of TYPE that name species SP since the run started. It counts records, not organisms; one `modeSwitch` record covers every switch of that species to that mode in one tick (D-0126). TYPE is one of `glowOn`, `glowOff`, `modeSwitch`, `rest`, `wake`, `trapArmed`, `trapHold`, `trapRelease`, `handlingStart`, `handlingBreak`, `capture`, `linkFormed`, `linkBroken`.
- `firstCaptureAt.SP`: tick / 10 of SP's first `capture` record in the run, −1 if none.
- `intakePhoto.SP` / `intakeSugar.SP`: carbon SP took in between the stage 5 and stage 6 hooks while its mode column read Photo or Sugar at stage 6. It is 0 for species without a mode.
- `infections.SP.VIRUS` / `wholeUnitCells.SP.VIRUS`: as the two-part ids, restricted to that virus's infectedBy code and its own unit field (`v01` or `v02`).
- `secretingSeconds.SP`: organism-seconds of living SP whose `secreting` bits are set at the end of the tick (it released an enzyme, RIVAL or the glow signal this tick; the inspector's SECRETING). Counts 0.1 s per organism per tick.
- `gateTransfer.KIND.F`: the amount of field F moved across the dish's KIND edges (S01–S04) since the start, as `WORLD_GATES.transferred` reads it (|flux| in either direction).
- `gateCrossings.KIND`: organism crossings of those edges since the start.
- `alive.SP@R`, `resting.SP@R`, `biomass.SP@R`: the same reads limited to organisms whose cell (`entityCell`) lies in region R of the world's recorded habitat.
- `mean.F@R`: the mean of field F over R's cells.
- `moisture@R`: the mean of the derived moisture over R's cells.
- `limitSeconds.SP.RIVAL_EXPOSURE`: now reads the suitability reason the inspector shows.

## Per card (revision 1 of every recipe; shipped registry)

| Card | Gate second | Clause values | Alive at the stop |
|---|---|---|---|
| E205 | **not reached** | `glowOn` 0 | B09 60 |
| E206 | **not reached** | `glowingStart` 0; `runSeconds` 30; `interventionAccepted` B 113 | A 60, B 60 |
| E207 | 46 | 2.995644 salt; 0.4 s | B01 179 (0 in the fresh pool: they moved onto the gel), B10 160 |
| E208 | 180 | 180; 113; 4497 | A 0, B A02 136 |
| E209 | 1 | 5.81e-5; 0; 0 (1.339 sugar crossed, 0 crossings by 180 s) | B06 30 left, B01 17 right |
| E210 | 75 | `rest` 20; `wake` 20 | B12 26 |
| E211 | 600 | 600 (moisture 0.80 under the roof, 0.20 on open gel) | F04 10 + 10, all resting |

**What limits E205 and E206.** Glow turns on only after a Lantern senses a signal of at least 0.30 for 5 s.

- With the CT setup (30 founders within r 4), no Lantern sensed more than 0.073 at any point in 120 s. Water diffusion spreads the 0.02/s emission too fast.
- Two headless trials (not committed): 49 founders gave 0.100, and 120 founders within r 7 gave 0.189. Neither had a glow-on.
- No one-number recipe revision can reach 0.30, so both recipes stay at revision 1 and nothing is scripted. The lead decides; a rule-level change would be a CT §12.6 / D-entry matter.
- Seed 206 never has a glowing Lantern within 120 s, so EXP_206's `atSecond` is 120 (E205's horizon) and its stop is 150 s.
- `tests/experiments/e205-e211.test.ts` pins these measured values, so a later change that makes Lanterns glow will fail it and force a re-revision.

Full write-up: `docs/reports/experiments-g5.md` § E205–E211.

## FENCE

- New entries (`tools/fence-update.ts --add`, 1200 ticks):

  | Recipe | Digest |
  |---|---|
  | GLOW_THRESHOLD_V1 | 79801e16a2dbfe8a |
  | QUIET_NEIGHBORS_V1 | 48dc6a955d0dc3e0 |
  | BRINE_CROSSING_V1 | c1437b199aa09552 |
  | GLASS_BUDGET_V1 | 57e7e79d2e4c2b93 |
  | GATE_MEAL_V1 | 257af252138e2870 |
  | SLEEPING_SHORTAGE_V1 | f7c93ed9f366c3ab |
  | SHELTERED_LACE_V1 | 34d06949946765e2 |

  `git diff tests/fixtures/fence.json` shows only these 63 added lines.
- Last full fence command: 11 files, 92 passed, 2 failed: "Test Files 1 failed | 10 passed (11); Tests 2 failed | 92 passed (94)". g2-replay, rc1-replay, the four trajectory-fence files, conservation and both determinism files all pass.
- **FENCE: `habitats-p5-equivalence.test.ts` checks its key list before it checks values: the 7 new recipes are extra `recipe:` keys.** It walks every shipped recipe, and seven new ones now ship.
  - The test's own values were not checked because the key comparison fails first. A scratch run of `realizeGoldenEntries` against the golden gave: "old keys 25 moved 0 extra keys [the seven]". All 25 golden entries are identical with the recorded habitat list, and as shipped (`stateHash300` equal, `serialized` different, as D-0130 expects).
  - Suggested fix for the lead: compare only the golden's own keys (`now.filter((e) => golden keys include e.key)`), or limit the recipe walk to phase ≤ 4.
- After adding the entries, `trajectory-fence-current` passes with every old entry unchanged.

## Tests and the mutant each one kills (each mutant was applied by hand, run, then reverted)

| Test file | What it proves | Mutant it kills |
|---|---|---|
| `measures-p5.test.ts` (13) | Parse and refusal messages; every measure equals a direct count. | `RIVAL_EXPOSURE` removed from `isSuitabilityReason`: 2 failures. |
| `observer-neutral-p5.test.ts` (9) | Tracking every Phase 5 measure leaves `stateHash` and the `'full'` digest unchanged, on 7 recipes, an H05 community dish, and FIRST_DISH at 4×. | An observer writing 1e-12 to sugar: 9/9 fail. |
| `test-overrides.test.ts` (10) | The fixture's species copies change, the registry's records do not; save/load; the validator refusals; rc1 saves still hash exactly as the rc1 build recorded. | `Object.assign` on the registry record: fails. `testOnly` term always written: the rc1 hash test fails here and rc1-replay fails 3 saves. (The trajectory digests do not read `stateHash`, so the trajectory fence alone missed it; I added the rc1 assertion for that reason.) |
| `test-overrides-host.test.ts` (3) | Worker refusal; `DishInfo` and `SlotModes` disclosure. | `build()` accepting the fixture: fails. |
| `recipe-file-test-overrides.test.ts` (3) | Import refusal; open dish untouched; `'no-start'` export. | — |
| `experiment-steps-p5.test.ts` (5) | The three new steps. | The toggle ending the card: fails. |
| `e205-e211.test.ts` (18) | Validity, gates or limiting factors, twice-identical runs, generalized `omitFounders`, region/gate/step validation, furnish ids and validation. | `omitFounders` always accepted: the refusal case fails. |
| `p5-recipes-determinism.test.ts` (7) | 1×, 4× chunks, and save at tick 0 and tick 300 give identical hashes. | — |

## Files

- **Created:**
  - 7 recipe files and 7 card files under `content/`
  - 8 test files: the 5 in `tests/experiments/`, `tests/worker/experiment-steps-p5.test.ts`, `tests/worker/test-overrides-host.test.ts`, `tests/persistence/recipe-file-test-overrides.test.ts`
  - `docs/reports/experiments-g5.md`
  - this report
- **Changed (owned):**
  - `src/sim/pairedRun.ts`, `experiments.ts`, `recipes.ts`, `content/schema.ts`, `content/registry.ts`, `serialize.ts`
  - `src/worker/host.ts`, `protocol.ts`
  - `src/persistence/saveFile.ts`, `recipeFile.ts`
  - `content/manifest.json` (contentHash only), `tests/fixtures/fence.json` (`--add` only)
- **Re-pinned, each with a reason comment (shipped lists my cards moved):**
  - `tests/experiments/{framework,journal-and-words,app-flow}.test.ts` (card lists)
  - `tests/tools/listing.test.ts` (counts cards with phase ≤ build phase, as it already did for the curated dishes)
  - `tests/worker/new-dish-habitats.test.ts` ("every v1.0 start" = phase ≤ 4)
  - `tests/content/recipe-structures.test.ts` (only recipes that place no structure)
  - `tests/sim/lab-commands.test.ts` (narrowed manifest drops the Phase 5 records)
- **Shared helper edit (please review):** `tests/helpers/registry.ts` adds `PHASE5_EXPERIMENT_RECORDS` and `narrowsShipped`.
  - `patchedRawPacks`, which `registryWith` also uses, now leaves those records out when a patch narrows the shipped manifest (a shipped id missing from a list, or a lower build phase).
  - Without this, every `preFlipRegistry`, `preOrganismFlip*` and v1.0-list registry fails validation now that phase 5 cards ship. Those registries caused 19 failures across 9 files.
  - cards-curated must add its records to this list.

## Proposed decisions

1. `TEST_OVERRIDE_FIELDS = ['speed']`: the one profile field CT names (E214).
2. The "recipe export" disclosure is the import refusal plus the resolved recipe body, which carries `testOnlyOverrides` verbatim. Experiment dishes stay `'no-start'`.
3. `omitFounders` accepts a group whose later groups all list their cells. Birth ids shift; every measure is by species or region.
4. No new `ExperimentCommand` kind is needed: E207 is single-arm and the player toggles the shutter.
5. E205 founders are placed by `'nearest'` within r 4 (r 3 holds only 29 cells).
6. Stopping points: E205 120 s, E207 180 s, E210 180 s.
7. E206 `atSecond` is 120 s, stop 150 s, because seed 206 has no glowing second.
8. E208 needs no silicate background override: the Water Garden holds 0 silicate (tested).
9. A slot index carries `meta.testOverrides` inside its evolution copy (`store.ts`, `checkpoints.ts` and `shelf.ts` copy only `evolution` and `registry`).
10. The validator checks regions and gates against the recipe's own habitat.
11. A narrowed test manifest omits the shipped Phase 5 experiment records (the test helper change above).

## NEEDS and things noticed

- **NEEDS (lead):** E205 and E206 are not release-ready; decide whether to defer them or change the glow rules in a decision.
- **NEEDS (lead):** apply the `habitats-p5-equivalence` key-list fix and review the `tests/helpers/registry.ts` change.
- Mid-run, `tsc` errors came from p5-polish's in-flight files (`src/ui/strings/experiments.ts` missing the new step cases, an unused import in `src/render/renderer.ts`). Both were gone by the final `tsc`.
- E217's card spec (stage 2) reads `limitSeconds.B04.RIVAL_EXPOSURE`, but B04 is not a RIVAL target (only B01, B10, B11 are), so it will always read 0.
- E207: the Sprinters leave the fresh pool for the surrounding gel by 180 s; the card's confounds say so.
