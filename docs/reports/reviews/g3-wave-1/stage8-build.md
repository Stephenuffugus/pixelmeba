# Wave 1 — stage8 builder report (P3.7 reservation framework)

Status: all Build and "Done when" items are DONE. Players see no change. No fence value moved. I made no commits.

## Checklist

**Build**
- (1) Mandatory transitions, then a hook that releases invalid links and anchors — DONE. `src/sim/structures.ts:61` `stageStructures`: reset `secreting`/`FLAG.secreting`, then `dormancyStep`, then `releaseInvalidLinks` (`src/sim/actions.ts:181`, does nothing until wave 4; runs for every living organism, because a resting organism releases its anchors), then skip non-Active organisms. Mandatory table entries (`mandatoryAction`, actions.ts:71) run before the optional ones. None ship yet; Phase 7 life-stage transitions belong there. Proven by stage8-order "mandatory costs come before optional ones" and "a non-Active organism runs no optional action…".
- (2) Optional actions from a fixed, documented array — DONE. `src/sim/actions.ts`:
  - The order is mandatory, then native by ID, then module by number (`buildActionTable` :84; duplicates throw; the result is frozen).
  - The shipped table `SHIPPED` (:98) is written in canonical order, and a check at load (:106) enforces it. `STAGE8_ACTIONS` (:105) is the native starch, oil and protein producers, then E01.
  - Native ID = `NativeAbility.options.indexOf(id)` (:57). Module ID = module number (:64).
  - `ActionContext` (:114): `remainingEnergy()`/`remainingBody()` read E/B minus what this organism has reserved this tick. `spend()` commits at once and throws if asked for more than remains. `requestConstruction()` holds body C and its full energy cost.
  - Nothing is retried or refunded.
  - Test tables go in as `stageStructures(world, table)`. The default is `STAGE8_ACTIONS`, and `tick.ts` is unchanged.
- (3) Shared construction — DONE. `src/sim/construction.ts:65` `constructionPass`:
  - Requests are sorted by (cell, slot, submission order). A read phase works from the snapshot (film, B, N); a commit phase applies everything together.
  - headroom = max(0, FILM_CAP − film). If Σ > headroom, every request in the cell is scaled by headroom/Σ.
  - Body N moves in proportion: N×accepted/B. The builder is charged energyPerC×accepted into `ledger.energy.construction`; the rest of the reservation is returned (it was never deducted).
  - A scaled cell is pinned to exactly 0.50. The pin dust (a few ulps) is logged in `ledger.roundoff.c` and throws if it exceeds 1e-12.
  - It throws if a world without the film system gets a request, and does nothing when there are no requests.
  - Material ledger: an internal move only.
- (4) Transport hook — DONE. `fungalTransportPass(world)` (structures.ts:53, does nothing until wave 3) is called after `constructionPass` and before stage 9 (structures.ts:78–79).
- (5) secretion.ts generic producer — DONE. `src/sim/secretion.ts`:
  - `PRODUCER_FIELDS` maps starch→eStarch, oil→eOil and protein→eProtein.
  - `secrete` (:45) makes the same comparisons in the same order with the same float operations: `remainingEnergy() <= minEnergy`, then `< cost`, then `E -= cost`, then `ledger.energy.secretion += cost`. With nothing reserved, remainingEnergy is E − 0 = E, bit for bit.
  - `producerApplies(slot, source)` is native-only or module-only, so a native B06 runs only the native action and an E01 carrier only the E01 action.
  - `producerRun` writes secretionCode. With two producers, SECRETING wins: a later refusal never overwrites an earlier success.
- Shared, additive edits:
  - `src/sim/phenotype.ts`: `ProducerRules` (:66), `BuilderRules` (:79), and Profile `oil`/`protein`/`builder` (:144–148), all `null` (:315–317). Native B07/B08 and E09/E10 mapping is left to P3.6 and wave 4.
  - `src/sim/constants.ts:91`: `FILM_CAP = 0.5`.
  - `moduleView.ts` needed no change.
- `ledger.energy.construction` — present. The foundation's in-flight `src/sim/ledger.ts` already has it; I did not edit ledger.ts.
- No reason code was added.

**Done when**
- g2-replay and the trajectory fence pass unchanged — DONE (see the run below). This was with the foundation's schema-4 edit in the working tree (serialize.ts, entities.ts, ledger.ts modified).
- `tests/sim/stage8-order.test.ts` — DONE (12 tests). It proves that:
  - the shipped table is fixed and frozen, and test tables never change it;
  - order is mandatory, then natives by ID, then modules ascending, whatever order actions are registered in, and each action sees exactly the energy that earlier actions left;
  - a mandatory 0.04 cost makes a native B06 report SECRETION_ENERGY_LOW;
  - a native test action makes an E01 carrier report SECRETION_ENERGY_LOW, and a module after E01 reports ENERGY_LOW;
  - E02 runs before E04 whichever is registered first;
  - a non-Active organism keeps its secretionCode and runs nothing;
  - an action that over-spends throws.
- `tests/fixtures/shared-budget.test.ts` (C08) — DONE (4 tests). At E = 35.03, two test actions each need E > 35 and cost 0.04:
  - the first fires (the second sees 35.03 − 0.04 ≈ 34.99) and the second gets ENERGY_LOW; reversing the order refuses the other one;
  - ΔE = Δ Σ of the ledger's energy categories (except `earned`);
  - real native starch secretion ahead of a test module action gives the same result;
  - a native action runs before a module action registered ahead of it.
- `tests/sim/construction.test.ts` — DONE (7 tests). Covered:
  - 0.30 + 0.30 into film 0.10 → each accepts 0.3×(0.4/0.6), film ends at exactly 0.5, N moves in proportion;
  - each builder is charged 2×accepted, and the returned part is 0.6 − charged;
  - body+film C and N are conserved and checkLedger is ok;
  - below headroom nothing is scaled; at the cap nothing moves;
  - cells resolve in ascending order;
  - swapping slots gives the same result;
  - malformed requests and worlds without film throw;
  - through stage 8, a later action sees E − 0.6 and B − 0.3, and after the pass only the accepted amount is charged.
  - The film world is `registryWith({ enabledSystems: [...shipped, 'film'] })`.
- Generic secretion = g2 code — DONE (in stage8-order.test.ts, "bit-identical" describe). A verbatim copy of the g2 stage 8 runs next to the new one in the canonical stage order:
  - (a) both g2 saves, loaded twice, 200 ticks;
  - (b) the same dishes from tick 0 under `registryWith(G2_LISTS)` (STARCH_UNLOCK_V1, and the e01Carriers transform as in tools/make-g2-saves.ts), 400 ticks, with more than 100 secreting organism-ticks required.
  - Every tick, eStarch, E, secretionCode, secreting, flags and ledger secretion must be exactly equal; at the end, stateHash and the serialized world must be equal.
  - No hash literals.
- Regression list — DONE, all pass (run below).

## Files
- Created: src/sim/actions.ts, src/sim/construction.ts, src/sim/secretion.ts, tests/sim/stage8-order.test.ts, tests/sim/construction.test.ts, tests/fixtures/shared-budget.test.ts, this report.
- Changed: src/sim/structures.ts (the stage-8 part only, above the "Lab habitat edits" block; I also removed the imports that became unused — DT, FieldId, R, StarchRules), src/sim/phenotype.ts (additive), src/sim/constants.ts (additive).
- Not touched: tick.ts, ledger.ts, reasons.ts, content/, trajectory.ts, the Lab part of structures.ts.

## Mutation checks (each test fails without its mechanism)
I ran these in a scratch copy of the repo, so the shared tree never held a mutant.
- secretion cost `emitCost / 10` instead of `* DT` → the from-tick-0 bit-identity tests fail ("ledger secretion at tick 1"). The two g2-save tests do NOT catch it; see the FENCE note.
- `remainingEnergy()` ignores reservations → construction "reservation counts against its later actions" fails (sees 60 instead of 59.4).
- construction never scales → 4 construction tests fail.
- module tier ranked before native (load check disabled) → 4 order/budget tests fail.
- `spend` does not deduct → all 4 shared-budget tests fail.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit` → no errors.
- `npx eslint` on my 9 files → no problems.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/shared-budget.test.ts tests/sim/construction.test.ts tests/sim/stage8-order.test.ts tests/fixtures/enzyme-source.test.ts tests/fixtures/module-accounting.test.ts tests/sim/dormancy.test.ts tests/sim/modules.test.ts tests/sim/movement-births-tick.test.ts tests/sim/lab-commands.test.ts tests/sim/deposit-bounds.test.ts`
  → `Test Files 17 passed (17) · Tests 152 passed (152) · Duration 1085.35s` (other agents were running at the same time).
- E2E: not run. There is no UI change.

## FENCE notes
- No fence value changed.
- **The bit-identity guard in the g2 saves is weaker than the assignment assumes.** At t900, every starch producer in `starch-unlock-t900` (12 native B06) and in `starch-unlock-e01-carriers-t900` (12 E01 carriers) is already at SECRETION_ENERGY_LOW. Over the next 1,000 ticks none of them secretes: the ledger's secretion stays 151.8 and 129.2, and the producers die or go to zero E. So g2-replay only checks the refusal path; a change to the secreting branch (cost, emit rate, cap) would pass it. The from-tick-0 comparisons in stage8-order.test.ts cover the secreting branch. The lead may want a save taken while producers secrete (around t100–t400) the next time the g2 fixtures are re-recorded.

## Bugs noticed elsewhere
- None blocking.
- `tests/fixtures/module-accounting.test.ts` `energyBalance` lists the energy categories by hand. It will miss `construction` once builders exist (it is 0 today).

## PROPOSED DECISIONS
- PROPOSED DECISION: native stage-8 action IDs = the NativeAbility enum index (`NativeAbility.options.indexOf(id)`): E_STARCH 0 < E_OIL 1 < E_PROTEIN 2 < BIOFILM 3 < … The enum becomes append-only for that reason. Module action IDs = module number (E01 = 1 … E17 = 17). Order: mandatory, then native, then module.
- PROPOSED DECISION: a scaled construction cell is pinned to exactly FILM_CAP. The float dust (< 1e-12, else a defect) is logged in `ledger.roundoff.c`, so `film < 0.50` tests never see 0.5000000000000001 or 0.49999999999999994.
- PROPOSED DECISION: with two producers on one organism (e.g. a native starch producer that gains E09), `secretionCode` shows SECRETING if any producer secreted this tick, otherwise the last producer's refusal. `secreting` is the OR of all producers.
- PROPOSED DECISION: mandatory table entries run only for Active organisms, after dormancy and link release. Dormancy stays the hard-wired first step for every living organism, because it must also run for Preparing, Resting and Waking organisms.
- No new reason code is needed.
