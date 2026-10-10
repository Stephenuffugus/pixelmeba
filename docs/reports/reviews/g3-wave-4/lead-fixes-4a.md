# G3 wave 4 stage 1 — lead fixes 4a

Date: 2026-10-10. The working tree is uncommitted, as expected. I made no git add, commit, stash, checkout, reset, restore or rm. Scratch files are in `tmp/leadfix4a/`: the measurement logs, the leak mutants, the e2e log and the final log.

For every mutant below, I made the break by hand, ran the test, restored the line and grepped that it was back.

## Items

1. **DONE: New Dish preview leaves out the recipe's own ops (MAJOR).**
   - Fix: `src/worker/host.ts:2079` now reads `const layout = recipeGrid(w.content.habitat, recipe);`. This is the grid `realizeRecipe` paints: habitat, stone removal and the recipe's own ops. Overrides never change a recipe's ops or `removeStones`, and a habitat override keeps them.
   - Cleanup: the unused `habitatGrid` import is gone.
   - Test: `tests/worker/new-dish-preview-grid.test.ts`.
     - The L306 preview shows `SUB_GEL` at (64,64).
     - Its substrate and structure equal `realizeRecipe(...).grid`.
     - FIRST_DISH_V1 has no ops. BROKEN_CATALYST_V1 has `removeStones: true` and no ops. Both still preview exactly.
   - Mutant: ops replaced with `[]`, which is the old behaviour. Result: "expected +0 to be 1" on the L306 test.

2. **DONE: EXP_104 player-facing text is now honest (MINOR).**
   - No recipe or mechanic changed. CT §10's question text is unchanged.
   - `content/experiments/EXP_104.json`, intervention: "…read what holds each one back. Look for one held back by too little oxygen and the other by too much; if the inspector names something else, note what holds them back instead."
   - `content/experiments/EXP_104.json`, predictedTradeoff: "…if the Sprinters use up enough oxygen, that may leave room for Dusks."
   - `src/ui/strings/experiments.ts` (`inspectOxygenLimits` step line): "Tap a Sprinter and a Dusk and read what holds each back. Look for one held back by too little oxygen and the other by too much; if none is, note what holds them back instead."
   - The pin in `tests/experiments/journal-and-words.test.ts` is updated to match.
   - `docs/reports/experiments-g3.md` (EXP_104 section) gains a one-line measured outcome:
     - The gate is not reached.
     - Sprinters' measured limiter is `FOOD_ACCESS_LOW`, never `OXYGEN_LIMITED`. The lowest O2 in a Sprinter's cell is 0.715.
     - Dusks' limiter is `SUIT_OXYGEN_HIGH` until they die out at 50 s.
     - The line also notes that the text was made conditional.
   - No e2e spec pins these texts.

3. **DONE: EXP_105 journal stamp.** The stamp now reads "Saw Pinphage infect Sprinters, and no Crossfeeder infected beside the same dose". No test pins it. `content-validate --write` was re-run: contentHash `8a004f51…`, content ok, with the 47 known warnings.

4. **DONE: test for the host's EXP_104 oxygen-step wiring.**
   - Test: `tests/experiments/hidden-neighborhood-host.test.ts`. It drives DishHost the way one-host.test.ts does, with a test-only copy of EXP_104 whose gate is `alive.B01 > 0 and alive.B03 > 0` (held at once).
   - Steps and results:
     1. The host posts `experimentWaiting` with missing `['inspectOxygenLimits']`.
     2. Viewing a Dusk (its real reading, `SUIT_OXYGEN_HIGH`) and then an oxygen-rich Sprinter posts no stamp.
     3. That Sprinter's `limitCode` is set to `OXYGEN_LIMITED` on the paused dish (labelled test state) and it is viewed again. Exactly one stamp is posted, with `experimentId` EXP_104.
   - Mutant: the `x.steps.noteOxygenLimit(...)` call at host.ts:1050 was deleted. Result: "expected [] to have a length of 1 but got +0".

5. **DONE: the shipped limiter's `coalesceOf` wiring is now tested.**
   - Test: `tests/audio/cues-coalesce.test.ts`. It uses a fake SoundKit and a mocked `performance.now`, and goes through the shipped `initAudio` / `eventCues` path in `cues.ts`.
   - Load: alga births in every 100 ms snapshot for 10 s.
   - Assertion: between 1 and ceil(10000 / 5000) = 2 division plays.
   - Mutant: `coalesceOf: coalesceMsOf` removed from `src/audio/cues.ts:35`. Result: "expected 34 to be less than or equal to 2".

6. **DONE: late Transfer reply makes no sound.**
   - Fix: `src/ui/panels/SampleSession.tsx:168` now reads `if (dishInfo.value?.dishId === info.dishId) placementCue(res.accepted);`.
   - Test, added to `tests/audio/call-sites.test.ts`: another dish opens while the transfer is in flight. The command runs, and `placementCue` is not called. `beforeEach` resets `dishInfo` to d1.
   - Mutant: the check removed. Result: "expected vi.fn() to not be called at all, but actually been called 1 times".

7. **DONE: the Field Guide line on ability (module) entries is now true per entry.**
   - New `src/sim/moduleNotes.ts`. For each enabled eligible ancestor it builds `deriveProfile` with and without the module (neutral genome, `buildModuleTable`). From the profile rules the relationship watcher depends on, it derives:
     - `converts <enzyme>`: producer rules `prof.starch` / `prof.oil` / `prof.protein` turned on by the module. These are what `producersNear` reads.
     - `eats detritus`: `prof.debrisFeeder` turned on, which is the `intake.ts` `ROUTE_DETRITUS` path. It does not count if the species already eats detritus.
   - Wiring:
     - `FieldGuideData.tsx`: `ModuleEntry.notes`.
     - `src/ui/strings/guide.ts:40` `GUIDE_TEXT.seenModule(notes)`.
     - `FieldGuide.tsx`: `Seen` takes a `notNoted` line, and module entries use `seenModule`.
     - Structures, tools and habitats keep `seenNotNoted` unchanged. The e2e pin on SAMPLE still holds.
   - What the entries now say:
     - E01: "Your dishes keep notes for species, not for abilities. A species carrying this ability can be noted for its enzyme turning starch into sugar: look for that note on the species that carry it."
     - E09 names protein into broth. E08 names eating debris.
     - Every other enabled ability: "Your dishes keep notes for species, not for abilities, and this ability adds nothing they note: whatever its carriers were seen doing is on their own species' entries."
   - Unit test `tests/content/module-notes.test.ts` checks:
     - E01 → converts starch; E09 → converts protein; E08 → eats detritus; every other enabled ability → none.
     - No enabled eligible ancestor → none.
     - The guide-model lines.
   - e2e: `tests/e2e/field-guide.spec.ts` now also searches `e01` and checks E01's "Seen in your dishes" line.
   - Mutants:
     - The debrisFeeder derivation disabled: 2 failures (the E08 notes and the E08 line).
     - `seenModule` forced to the none-line: 1 failure (the E01 line).

8. **DONE: absolute ledger-residual tripwire in both conservation fixtures.**
   - Measured worst absolute residual |actual − expected| at the checkpoints (the `--silent=false` run):

     | Fixture | C | N | M |
     |---|---|---|---|
     | closed-lid | 2.910e-11 | 1.176e-10 | 0 |
     | all-pools | 3.638e-11 | 8.117e-11 | 0 |

   - Bound: 1e-8 for each of C, N and M in both fixtures. That is 10× the worst measured value (1.18e-10), rounded up to a power of ten. It sits six orders below a 0.01 C leak.
   - The SPEC 1e-5 relative assertions are kept. The residuals are printed in each fixture's `console.info`.
   - Code: `tests/fixtures/conservation-closed-lid.test.ts:16` (`ABS_RESIDUAL_BOUND`) and `:53-55`; `tests/fixtures/conservation-all-pools.test.ts:244-246`.
   - Mutant: the wave-verify-2 `v-object-leak` mutant (+0.01 C of sugar once, at tick 3000, in `releaseFoodObjects`), in `tmp/leadfix4a/mutants/`:
     - closed-lid **fails at the new absolute bound**: "expected 0.010000000030231604 to be less than 1e-8". It passed the 1e-5 relative gate, since that assertion comes first.
     - all-pools fails at the existing 1e-9 relative tripwire, which comes first: "expected 0.0000016845… to be less than 1e-9". Its printed absolute residual is C 1.000e-2, so the new bound would fail as well.

## Files changed

- `src/worker/host.ts`
- `src/ui/panels/SampleSession.tsx`
- `src/ui/strings/experiments.ts`
- `src/ui/strings/guide.ts`
- `src/ui/views/FieldGuide.tsx`
- `src/ui/views/FieldGuideData.tsx`
- `src/sim/moduleNotes.ts` (new)
- `content/experiments/EXP_104.json`
- `content/experiments/EXP_105.json`
- `content/manifest.json` (contentHash, via `--write`)
- `docs/reports/experiments-g3.md`
- `tests/worker/new-dish-preview-grid.test.ts` (new)
- `tests/experiments/hidden-neighborhood-host.test.ts` (new)
- `tests/audio/cues-coalesce.test.ts` (new)
- `tests/content/module-notes.test.ts` (new)
- `tests/audio/call-sites.test.ts`
- `tests/experiments/journal-and-words.test.ts`
- `tests/e2e/field-guide.spec.ts`
- `tests/fixtures/conservation-closed-lid.test.ts`
- `tests/fixtures/conservation-all-pools.test.ts`

## Commands and results

- `npx tsx tools/content-validate.ts --write`: content ok, contentHash 8a004f512270aed1…, 47 known warnings.
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint <the 16 changed source and test files>`: exit 0.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/conservation-all-pools.test.ts tests/experiments tests/audio tests/content/guide.test.ts tests/worker/relationships.test.ts tests/worker/new-dish-preview-grid.test.ts tests/content/module-notes.test.ts`:
  - `Test Files 34 passed (34)`, `Tests 256 passed (256)`, `Duration 756.48s`, exit 0.
  - This includes g2-replay and all four trajectory-fence files, unchanged.
- `E2E_PORT=4291 E2E_OUTDIR=tmp/dist-leadfix4 npx playwright test tests/e2e/field-guide.spec.ts --project=desktop`:
  - 3 passed (1.2m).
  - Port 4291 was stopped before and after the run.
