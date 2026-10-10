# Wave g3-wave-4 verify 2: g3-fixtures and experiments-curated

Verifier: adversarial wave verifier 2 (2026-10-10). Scope: the uncommitted working tree for tasks
`g3-fixtures` and `experiments-curated`. Scratch work is in `tmp/verify-g3-wave-4-1/` (git-ignored). No
repository file was edited except this report.

**Result: ok = false.** There is one MAJOR problem. It is cross-task, so it is graded `[lead]`.

## Problems (most severe first)

### 1. MAJOR [lead] src/worker/host.ts:2077 — the New Dish map for Borrowed Shelter leaves out its gel disk

- **What is wrong:** `newDishPreview` builds the preview map with `habitatGrid(w.content.habitat, { removeStones: recipe.removeStones })`. That call leaves out a recipe's own `ops`.
- **Effect:** Borrowed Shelter's preview map shows water where the dish is a gel bed. The map does not match the dish that Create builds, which breaks "every visible feature maps to real state".
- **Why this is a lead item:**
  - The assignment says previews must see the same grid as the dish ("Include it in habitatGrid()/recipeGrid() … so What if? validation and previews see the same grid").
  - experiments-curated could not make the fix, because host.ts belongs to field-guide this wave. It reported the problem correctly.
- **Fix (one line):** `const layout = recipeGrid(w.content.habitat, recipe);` and import `recipeGrid` from `@sim/recipes`.
- **Repro:**
  - The real dish: `realizeRecipe(reg,'L306_BORROWED_SHELTER').grid.substrate[cellIndex(64,64)] === SUB_GEL`.
  - The preview: `habitatGrid(reg.habitats.WATER_GARDEN,{removeStones:false}).substrate[cellIndex(64,64)] === SUB_WATER`.
  - In the app: New Dish → Borrowed Shelter shows an all-water map.

### 2. MINOR [lead] tests/fixtures/conservation-closed-lid.test.ts (and SPEC §3.4's 1e-5 tolerance) — the gate tolerance cannot catch a one-unit leak

- **What is wrong:** Most of the dish's carbon is dissolved CO2, so a relative tolerance of 1e-5 hides a leak of 0.01 C.
- **How I checked:** my load-time mutant `tmp/verify-g3-wave-4-1/mutants/v-object-leak.test.ts` creates 0.01 C of sugar once, at tick 3000, inside `releaseFoodObjects`.
  - Worst relative error: 1.68e-6. That passes the 1e-5 gate criterion.
  - The mutant was killed only by g3-fixtures' extra 1e-9 tripwire ("expected 0.0000016845… to be less than 1e-9").
- **Recommendation:** add the same tripwire to the G0 closed-lid fixture.

### 3. MINOR [experiments-curated] content/experiments/EXP_104.json — the shipped card cannot complete, but its step text says what the inspector will show

- **What is wrong:** EXP_104 is enabled in Phase 3, but its gate is never reached on the shipped recipe.
  - The test locks this in: `limitSeconds.B01.OXYGEN_LIMITED` is 0, and the lowest O2 in any Sprinter's cell stays above 0.7.
  - The player-step text still promises "the inspector shows one held back by too little oxygen and the other by too much". That never happens in this dish.
- **What the assignment allowed:** recording the limiter is permitted, and the builder recorded it honestly.
- **Owner decision needed:** hide the card or revise the recipe (for example, a lower starting oxygen) before release.
- **Repro:** `npx vitest run tests/experiments/hidden-neighborhood.test.ts`. The test "does not reach its gate" passes.

### 4. MINOR [experiments-curated] content/experiments/EXP_105.json `completion.journalStamp` — the stamp contradicts the gate's own non-vacuity clause

- **What is wrong:** the stamp reads "Saw Pinphage infect Sprinters, and no Crossfeeder beside the same dose".
  - Read literally, it says no Crossfeeder sat beside the dose.
  - The gate measured the opposite: `wholeUnitCells.B05` = 30.
- **Suggested wording:** "…and no Crossfeeder infected beside the same dose" (D-0051: the stamp says only what the gate measured).

### 5. MINOR [experiments-curated] src/worker/host.ts:1048-1050 — no test covers the inspectOxygenLimits note call

- **What is wrong:** only EXP_105's `observeInfection` wiring is tested through DishHost (one-host.test.ts).
  - If the `inspectedOxygenReading` / `noteOxygenLimit` lines in `experimentSteps` were deleted, no test would fail.
  - `grep -rn EXP_104 tests/worker tests/e2e` finds nothing.

### 6. MINOR [g3-fixtures] tests/fixtures/conservation-all-pools.test.ts — runtime is over the assignment's ≤ 60 s

- **Measured:**
  - 121.5 s alone under vitest, at load about 5 (other verifiers running).
  - 77.5 s inside my mutant run.
- **What changed:** the builder removed the wall-time assertion and now only reports the time. This was disclosed.
- **Lead decision:** accept the reported-only wall time (the builder's PROPOSED DECISION), or shrink the dish.

### 7. MINOR [g3-fixtures] docs/reports/relationships-g3.md:5 — stale contentHash in the generated report

- The header says contentHash `e5bf702e827b3508…`.
- The current manifest, which `content-validate` confirms, is `299ad78af55b4129…`.
- Regenerate after the commit (the builder disclosed this). The rows themselves still hold: 711/711 against the current tree.

### 8. NIT [g3-fixtures] tests/fixtures/relationship-matrix.test.ts:36 — `KNOWN_BUGS` removes failing rows without asserting them

- The assignment asked for an `it.fails` per bug. As written, a known-bug row is filtered out of `mismatches`, so a fixed bug would pass silently.
- The list is empty today, so nothing is affected yet.

### 9. NIT [experiments-curated] src/ui/views/NewDish.tsx:191-217 — recipe-given abilities lose their label under Diverse

- **What happens:** pick Borrowed Shelter, then switch to Diverse.
  - The `new-dish-preseeded` line disappears.
  - The Diverse line then counts the recipe's 20 Matrix-builder founders among "founders that … start with one", without saying the recipe gave them.
- **What still holds:** the labels line still says "Pre-seeded genomes".

### 10. NIT [experiments-curated] src/ui/views/NewDish.tsx:62-77 — the curated list does not come from the validated registry

- The list is read from the raw `content/recipes/L*.json` glob, filtered by an id regex and `manifest.buildPhase`.
- The worker validates its own copy, so this is display only.

### 11. NIT [experiments-curated] src/sim/experiments.ts:714 `noteOxygenLimit` — a species keeps its first reading

- **What is wrong:** each species' first oxygen reading is kept for good ("first seen"). If both species were first seen with the same reading, a later different reading never completes the step.
- **Impact:** practically unreachable today, since B01 never shows SUIT_OXYGEN_HIGH and B03 never shows OXYGEN_LIMITED.

## Verified OK

- **Fence, replay and G0 conservation unchanged:**
  - Command: `npx vitest run --maxWorkers=2 tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts`.
  - Result: Test Files 6 passed (6), Tests 52 passed (52), 437.6 s.
  - The fence.json diff only adds the seven new recipe entries.
- **Builders' new and extended tests:**
  - Command: `npx vitest run --maxWorkers=2` on relationship-matrix, transport-obstacles, hidden-neighborhood, one-host, fungal-supply-line, recipes/curated, framework, app-flow and journal-and-words.
  - Result: Test Files 9 passed (9), Tests 94 passed (94), 217.5 s.
- **conservation-all-pools:** `npx vitest run tests/fixtures/conservation-all-pools.test.ts` gave 1 passed in 121.5 s.
- **Relationship matrix:**
  - `runMatrix()` under tsx gives 711 rows, 0 fail, 13.7 s.
  - I made seven in-memory content mutants (`tmp/verify-g3-wave-4-1/matrix-mutants.ts`). Every one was killed:

    | Mutant | Rows that failed |
    |---|---|
    | V01 also infects B05 | `V01 × B05` |
    | X01 also attaches to B01 | `X01 × B01` |
    | P02 also eats attached B02 | 2 rows |
    | P04 eats B06 outside sediment | 3 rows, including the E04-anchored and attached-flag variants |
    | B01 also eats metabolite | 1 diet row |
    | F01 loses digestsFilm | `F01 × film` |
    | E04 eligible for A01 | `E04 × A01` |

  - The oracles really come from the docs: `tests/helpers/tables.ts` parses CT and SPEC, not the content JSON.
- **conservation-all-pools catches a leak:** my object-leak mutant was killed (see problem 2). The builder's lysis-leak and no-transfer mutants exist under `tmp/fx/mutants`.
- **transport-obstacles is not vacuous:**
  - The film test asserts exact 0.5× flux against an open-water control, so a no-op film fails it.
  - Each ring test asserts exact zeros on the far side, and also that fields, organisms and infections were active.
  - The discard test asserts `exports` delta == `sampleTotals` exactly.
  - Clean water is checked at 25, 50 and 100 % to 1e-12.
- **Typecheck and lint:** `npx tsc -p tsconfig.json --noEmit` is clean, and `npx eslint` on the 17 files these tasks touched is clean.
- **Content:** `npx tsx tools/content-validate.ts` says content ok, with contentHash 299ad78a…. That equals the manifest, so the manifest edit is only the `--write` hash.
- **Shared-file discipline:**
  - Diffs to `tests/helpers/tables.ts` and `tests/helpers/world.ts` are purely additive (0 lines removed).
  - `src/sim/rng.ts` only appends `founderPlace: 'founder.place'`.
  - experiments-curated's `registry.ts` change is one import plus the hook line (:304-305).
  - Its `host.ts` change is the import plus the two step-note calls.
  - `variants.ts` only routes `recipeGrid` to the shared one.
- **Determinism:**
  - Scatter uses `detPermutation(eligible.length, world.seed, STREAMS.founderPlace, groupIndex)` over row-major eligible cells.
  - There is no Map, Set or object-key iteration in the new src/sim code.
  - Tracked measures use arrays and a scratch `cellMark` that is reset after each use.
  - The "measuring is observation" tests compare stateHash against a plain run, for EXP_104 and EXP_105.
- **The infections measure is correct:** `infectionDue` advances every living organism's timer in stage 7 (maintenance.ts:37-71). So `infectedBy ≠ 0` with the timer at 0 after stage 5 means the organism was infected that tick. Resting organisms are not double-counted.
- **The EXP_212 oracle matches the spec:** it follows SPEC §7.7 as written ("donor B > B0' … receiver B < 1.5 B0' and at least 0.01 B0' less … min(0.02 × dt, half the difference); cap total outgoing … cap total incoming … proportional N; no energy … relays only on later ticks"). It is checked every tick to 1e-12, and the fixture passes.
- **Setups match CT:**
  - EXP_104 and EXP_105 match CT §10.1.
  - EXP_212 matches CT §10.3 E212: no stones, fixed light 0.8, open lid, gel, B 4/2/2/2 with matching N, E 50, no food (background sugar overridden to 0).
  - L301, L303, L304 and L306 match CT §9.3 (seed = recipe number, open lid, light 0.8; L306 has E10 on 20 of 40 and the "Pre-seeded genomes" label).
  - L303's text agrees with CT §3.1: B08 and Y02 both drink broth, and neither eats protein.
- **Ledger rules:** `initial` is logged as `recipe:<id>:initial` (ΔB, ΔN). An E other than 50 goes to `ledger.energy` (earned/other), never to material inputs, as tested in curated.test.ts. Recipe `ops` bump `geometryVersion` once, and the realized grid equals `recipeGrid()`.
- **Honest reporting:** experiments-curated recorded the EXP_104 limiter without tuning anything, and reported all four curated dishes going extinct by 600 s.
