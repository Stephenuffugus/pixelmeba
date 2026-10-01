# mod-builders: build report (P3.7 E09, E10, final stage 8 order, C08 with real modules)

## Checklist

### Build
- DONE: moduleView `activeNow` is a switch with `default: false` (another builder had already converted it). E01 now reads bit 1 (`src/sim/moduleView.ts:66`), E09 reads bit 4 (`:80`), E10 reads `matrixBuiltNow` (`:82`). E03/E05 are unchanged.
- DONE: PROPOSED DECISION W4-16 alternative. `secreting` is now a producer bit set, `PRODUCER_BIT` {starch 1, oil 2, protein 4} (`src/sim/secretion.ts:40`). `producerRun` ORs in its own bit (`:102`). The refusal code is kept only while no bit is set (`:104`). FLAG.secreting is still the OR, and starch is still 1. Proof: module-e09-e10 "D-0045 two producers" tests and shared-budget "shipped order through step".
- DONE: E09 is `moduleAction('E09', producerApplies('protein','E09'), producerRun('protein'))`, placed after E01 (`src/sim/actions.ts:110`). `Profile.protein` comes from the world's recorded E09 params (`src/sim/phenotype.ts:274`, `:415`, `:456`). It grants no broth feeding: the foods list is unchanged. The card says "Produces broth; cannot consume broth." when the species cannot eat broth (`src/ui/strings/modules.ts:162-170`). `eatsBroth` comes from `src/sim/moduleView.ts:58` and an optional `ModuleInspect.eatsBroth` (`src/worker/protocol.ts:615`).
- DONE: E10 lives in `src/sim/matrixBuilder.ts` (new), as `moduleAction('E10', matrixApplies, matrixRun)` after E09 (`actions.ts:111`). `matrixRequest` (`matrixBuilder.ts:47`) runs when film is in the world's recorded manifest, remaining E > 35 (`:58`), B_remaining > 1.2 B0' and film < the recorded filmCap. It asks for min(0.02·dt, B − 1.2 B0', filmCap − film), capped by remainingE / 2 (`:66-68`), through `requestConstruction(cell, amount, 2)`. The existing construction.ts pass handles the snapshot, proportional headroom, the 2 E charge per accepted C, the return of the unused reservation and proportional N. `Profile.builder` comes from the record (`phenotype.ts:279`): {source 'E10', minEnergy 35, ratePerSecond 0.02, bodyFloor 1.2, energyPerC 2, filmCap 0.5}. `BuilderRules.filmCap` is a new optional field. Film rules are unchanged and there is no extra protection.
- DONE: E10 "active now" is observation only. `recordMatrixBuilt` (`matrixBuilder.ts:97`, hooked at `structures.ts:93`) keeps a per-world `WeakMap` of slot→birthId for accepted E10 requests. It is never on the World object, never hashed or saved, and empty after a reload until the next tick. This needed no edit to world.ts, serialize or trajectory.ts.
- DONE: the final stage 8 table is documented in the `structures.ts` header (`:1-33`), covering mandatory → natives (E_STARCH 0, E_OIL 1, E_PROTEIN 2, BIOFILM 3) → E01, E09, E10. It also lists where the other modules act: the intake clock, E04 and E12 severance in the release hook; E04/E07 in movement and stage 7; E06/E08 in intake; E12 links in stage 5 with upkeep in stage 7. actions.ts SHIPPED comment is updated.
- DONE: the SHIPPED pin is updated (`tests/sim/stage8-order.test.ts:125-133`).
- DONE (shared, additive):
  - IMPLEMENTED_MODULES += E09, E10 (`src/sim/content/implemented.ts:11`)
  - MODULE_REQUIRED_PARAMS gains E09 and E10 (`src/sim/content/moduleRules.ts:44-45`)
  - `cue2Of` packs CUE2_RELEASING_PROTEIN from bit 4 (`src/worker/snapshot.ts:160`), and its doc comment is fixed
  - sim-tune reads `!== 0` (`tools/sim-tune.ts:433`)

### Done when
- DONE: C08 / W4-17 in `tests/fixtures/shared-budget.test.ts:201-310`. The world is registryWith(shipped + E09, E10). A B04 carries E01+E09+E10, with starch and protein in four-neighbours, B = 1.2 B0' + 0.003 and film 0.498.
  - Through `step` with afterStage(7) setting E = 35.042: E01 and E09 each fire (0.08 secretion), E ends at 34.962 and secreting = 5. E10 builds nothing: construction +0, B and film unchanged, matrixBuiltNow false. Σ spent = Σ ledger categories and checkLedger passes.
  - Logged shipped order: E01 sees 35.042 (SECRETING), E09 sees 35.002 (SECRETING), E10 sees 34.962 and returns ENERGY_LOW.
  - Test-only raw order E10, E01, E09: E10 reserves 0.004 (E01 sees 35.038), E01 fires, E09 sees 34.998 and gets SECRETION_ENERGY_LOW. The pass accepts 0.002 C and charges 0.004 (construction). N moves at N·a/B. Σ spent = Σ ledger, construction included.
- DONE: `tests/fixtures/module-e09-e10.test.ts` (new, 23 tests):
  - E09 pays exactly 0.04 E and emits 0.002 per tick, and the ledger closes.
  - Four refusals, each with no cost, no emission and no bit: SECRETION_ENERGY_LOW at E = 35, NO_SUBSTRATE with no protein and with protein only on a diagonal, SATURATED at 1.0.
  - B04+E09 has the same foods as B04 and never feeds on a broth-only dish (100 ticks); its card wording is checked. Y02+E09 card says it "already drinks broth".
  - D-0045 two-producer cases: an F02 (native starch; F02 is in the shipped manifest, no allowUnimplemented) gaining E09, and a B04 with E01 + E09. Each case covers both (bits 5, 0.08 E, ledger closes), starch only (bit 1, SECRETING kept after E09's refusal), protein only (bit 4) and neither (E09's refusal). The cards' activeNow follows each bit.
  - Two E10 builders (B04, B01) and a B02 in one gel cell with film 0.497: film is exactly 0.50, shares are exactly proportional, each E10 pays 2 E per accepted C and B02 pays 0, the rest is returned and N is proportional. Over 60 ticks film is ≤ 0.50 every tick.
  - E10 refusals: energy, body, filmFull.
  - The energy cap: 0.001 E with minEnergy 0 gives a 0.0005 C request.
  - Diverted B delays division: at B = 2 B0' + 0.001 the builder drops below and does not split; the same carrier with a full film cell splits.
  - E10 card activeNow and wording.
- DONE: `tests/fixtures/module-accounting.test.ts:344`: E09+E10 add exactly 2 × 0.02 × dt per tick over 150 ticks, with no secretion or construction.
- DONE: the stage8-order "bit-identical" tests pass (the g2 saves are starch-only, and starch is still 1).
- DONE: non-vacuity. Each mutant was applied through a Vite transform plugin in a throwaway config (gitignored `tmp/`, now deleted), so the working tree was never edited:
  - `plainSecreting` (secreting = 1, `!== 1` guard): 6 tests fail: module-e09-e10 "an emitting tick…", "both release…" ×2, "only protein…" ×2, and shared-budget "shipped order through step…".
  - `noEnergyGate` (E > 35 check removed from E10): 3 tests fail: "each refusal…", "shipped order through step…" (construction 0.004), and "shipped order, each action logged…".
  - `noEnergyCap` (remainingE / 2 cap removed): 1 test fails: "the request never reserves more energy than remains…" (0.002 vs 0.0005).
- DONE: the fence is unchanged under the shipped manifest; all four trajectory-fence files pass. See the FENCE notes.

## Files
- Created: `src/sim/matrixBuilder.ts`, `tests/fixtures/module-e09-e10.test.ts`, this report.
- Changed (owned): `src/sim/secretion.ts`, `src/sim/actions.ts` (import, SHIPPED, comment), `src/sim/structures.ts` (header, import, hook line; nothing in the Lab section), `src/sim/moduleView.ts`, `src/ui/strings/modules.ts`, `tests/fixtures/shared-budget.test.ts`, `tests/fixtures/module-accounting.test.ts`, `tests/sim/stage8-order.test.ts`.
- Changed (shared, additive): `src/sim/phenotype.ts`, `src/sim/content/implemented.ts`, `src/sim/content/moduleRules.ts`, `src/worker/snapshot.ts`, `src/worker/protocol.ts` (optional `ModuleInspect.eatsBroth`), `tools/sim-tune.ts`.
- Untouched: `content/manifest.json`, `construction.ts` (no change needed), `film.ts`, art.

## Commands
- `npx tsc -p tsconfig.json --noEmit` → clean.
- `npx eslint <the 16 files above>` → clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/shared-budget.test.ts tests/fixtures/module-accounting.test.ts tests/sim/stage8-order.test.ts tests/fixtures/module-e09-e10.test.ts` → `Test Files 11 passed (11)`, `Tests 99 passed (99)`.
- Neighbours: `npx vitest run tests/experiments/secretion-sample.test.ts tests/fixtures/film.test.ts tests/helpers/registry.test.ts tests/render/phase3.test.ts tests/sim/module-visuals.test.ts tests/sim/modules.test.ts tests/tools/sim-tune.test.ts tests/worker/protocol.test.ts tests/worker/host.test.ts tests/fixtures/producers.test.ts tests/content tests/ui/diet-line.test.ts tests/fixtures/registry-imports.test.ts` → `Test Files 2 failed | 16 passed (18)`, `Tests 3 failed | 285 passed (288)`. None of the three failures is mine (see "Bugs noticed elsewhere").
- `npx tsx tools/content-validate.ts` → `content ok · contentHash cef0ea56… · atlas … complete` (no content edits, no --write needed).
- Mutant runs → as listed under non-vacuity.
- E2E: none run. The only UI change is the module-card text for E09/E10, and the shipped manifest does not enable those modules, so no shipped screen can show it. There is no styling change. The lead's three-project run after the flip covers it.

## FENCE notes
- No fence value moved. e1-producers expected OIL_NEIGHBORHOOD_V1 and PROTEIN_CHAIN_V1 to move once secreting became a bit set (B07 → 2, B08 → 4), but they did not. The fence digests the world at tick 1200, and a check run on the four new recipes found no living organism secreting at that tick (secreting tally {"0": 40} / {"0": 30} / {"0": 40} / {"0": 40}). Mid-run stateHashes of B07/B08 dishes do differ from before, but those were recorded only this wave and nothing pins them.
- Existing g2 saves and B06/E01 dishes are unchanged, because starch is still 1.

## Bugs noticed elsewhere (not mine)
- `tests/fixtures/film.test.ts`, two tests: "a world without the film system…" and "a B04 preference mutation draws identically…". Both fail with `enabled species "F02" uses BRANCHING/TRANSPORT_LINKS, which needs the "fungi" system`. The no-film world removes systems but keeps F02, which f02-links now ships. The fix is for those tests to also drop F02 from enabledSpecies (or keep `fungi`).
- `tests/ui/diet-line.test.ts`: its species list is missing the newly enabled species (F02 etc.), as e1-producers already reported.

## Proposed decisions
- PROPOSED DECISION: (W4-16 alternative, as assigned) `secreting` is a producer bit set: starch 1, oil 2, protein 4, each producer ORing its own bit, with FLAG.secreting as the OR. Starch is still 1, so B06, E01 and the g2 hashes are unchanged. CUE2_RELEASING_PROTEIN is bit 4 (it is also set for native B08; the renderer draws the protein marks only together with CUE2_MOD_E09). FLAG 1 << 12 is still unused.
- PROPOSED DECISION: E10's request is also capped at remainingEnergy / energyPerCarbon, so it can never reserve energy that is not there. With minEnergy 35 this cap never binds. A refused E10 returns `R.ENERGY_LOW` for energy and `R.NONE` otherwise; builders have no saved refusal column, and the detailed outcome is in `matrixRequest`.
- PROPOSED DECISION: E10 "active now" is an observation-only per-world WeakMap (slot → birthId), checked against birthId and rebuilt every stage 8. It is empty after a reload until the next tick, like fungalFlow.
- PROPOSED DECISION: the E09 card for a species that already drinks broth (Y02) reads "Its kind already drinks broth; this ability does not change that." instead of "cannot consume broth".
