# mod-feeding build report — P3.7 E06 Shade collector, E08 Debris feeder (wave 3)

## Checklist

### Build E06
- DONE: registered. `src/sim/content/implemented.ts:11` IMPLEMENTED_MODULES += E06, E08. `src/sim/content/moduleRules.ts` MODULE_REQUIRED_PARAMS E06: lightHalf, ceilingFactor (E08 has none).
- DONE: Profile. `src/sim/phenotype.ts:160-163`: `shade: ShadeRules | null` and `debrisFeeder: boolean`. One branch each in the modules loop at `:417-418`. The × 0.70 stays out of Profile.q (proved in module-e06 test 1, `shade.q === plain.q`).
- DONE: photosynthetic route only. `src/sim/intake.ts:185`: request = `budget × photoCeilingShare × avail(CO2)`, where `photoCeilingShare = 0.70 × min(1, light/0.35)` (`:63`). The feeding locus is already in q, so it scales the reduced ceiling (test 3). Non-carriers keep the original expression literally, so they stay bit-identical. CO2 and nutrient limits apply as before.
- DONE: leading constraint. `intake.ts:406-408` compares `photoLightResponse` (`:53`; this is raw light without E06) with the other fractions. `:415` reports the measured light as limitValue. For a carrier only, food access on the photosynthetic route is measured against its light-shaped ceiling (`:384-387`). Without this, access (≤ 0.20 × avail) is always below the response (0.2857) and LIGHT_LIMITED could never be chosen. See PROPOSED DECISION 1.

### Build E08
- DONE: detritus route. `src/sim/debrisFeeder.ts` `debrisRequest` gives `min(P, budget × avail(P))` when mealC = 0 and detritus > 0. `intake.ts:173-181` adds ROUTE_DETRITUS after the meal check, so a held meal has exclusive priority. Allocation and commit are the generic field path: the bound detritusN companion moves proportionally, surplus bound N goes to the free pool, and the aerobic conversion is O2 0.30/C, CO2 0.30, metabolite 0.20, B 0.50, 30 E/C (P01/P02/P03/P05/P07 energyPerCarbon = 30).
- DONE (verify only): capture. `contacts.ts consumePrey` puts `min(prey B, room)` into mealC in stage 5. room > 0 for any hunting predator (meal < 0.5 B0' < cap 2 B0'), and a living prey has B > 0. So stage 6 takes the meal route on the capture tick. No marker added.
- DONE: grants digestion only. preyAllowed is species-based and untouched.
- DONE: FLAG.detritusIntake = 1 << 13 (`entities.ts:226`). Cleared with feeding at the start of stage 6 (`intake.ts:150`). Set on a detritus-route tick with Cs > 0 (`:376`).
- DONE: snapshot. `src/worker/snapshot.ts:169-172` sets CUE2_DETRITUS_INTAKE from the flag (E08 carriers only).
- DONE: movement. `src/sim/movement.ts:196`: `return withDebrisScore(world, prof, cell, best)`, which is `max(F, avail(detritus))` for carriers and F otherwise (`debrisFeeder.ts`). Pursuit still runs before decide().
- DONE: moduleView activeNow. `src/sim/moduleView.ts`: E06 uses `photosynthesizedThisTick` (intake.ts:69: FLAG.feeding on the photosynthetic route) and E08 uses FLAG.detritusIntake. It was already a switch.
- DONE: strings. `src/ui/strings/modules.ts:146,154` adds the E06 and E08 module texts from the recorded params. Action chip (`:57`): on a detritus tick it says "Eating detritus" or "Finding only traces of detritus" instead of "Digesting".
- DONE: no carrier exists in shipped worlds, and the fence passes (below).

### Done when
- DONE, module-e06 tests 1-2 (`tests/fixtures/module-e06.test.ts:85,105`): at light 0.10 the share is 0.20 (plain 0.10); at 1.0 it is 0.70 (plain 1.0). On a real tick the carrier/plain intake ratio is 2.0 at light 0.10 and 0.70 at light 1.0.
- DONE, module-e06 test 4 (`:130`): at light 0.50 the code is NONE, not LIGHT_LIMITED. At light 0.10 it is LIGHT_LIMITED with value 0.10.
- DONE, module-e06 test 5 (`:146`): the ledger closes after 300 ticks, and activeNow follows real photosynthesis.
- DONE, module-e08 test 1 (`:133`): detritus is eaten only with an empty meal, and exactly `min(P, budget·avail(P))`. With a held meal the detritus is unchanged and the code is MEAL_DIGESTING. A plain P01 never eats detritus (PRED_NO_PREY).
- DONE, module-e08 test 2 (`:175`): on a capture tick, mealC > 0 after stage 5, detritus and detritusN are unchanged by stage 6, there is no detritus flag, and the code is MEAL_DIGESTING.
- DONE, module-e08 test 3 (`:193`): ΔdetritusN = Cs × 0.15 exactly; body N +0.05 Cs; free N +0.10 Cs; CO2 +0.30, metabolite +0.20, O2 −0.30 per C.
- DONE, module-e08 test 4 (`:231`): the carrier's prey decisions match a plain P01's for every enabled species, and a P02 in contact is never captured.
- DONE, module-e08 tests 5-6 (`:256,273`): with detritus 3 cells east and no prey, the carrier reaches it and a plain P01 does not. With a B01 3 cells west, the carrier is in MOVE_PURSUE on that prey and moves west.
- DONE, module-e08 test 7 (`:288`): F 0.6 with detritus score 0.5 gives 0.6 (not 1.1); F 0.2 gives 0.5 (not 0.7).
- DONE, module-e08 test 8 (`:302`): the flag equals "stage 6 ate detritus" on every one of 200 ticks (both cases occur), and so does activeNow. Σ earned = 30 × Σ eaten, and the ledger closes.
- DONE, non-vacuity. Mutation runs, each reverted, with the failing test named:
  - raw light in the leading-constraint check: e06 "leading constraint …" fails;
  - access against the plain budget: the same test fails;
  - summing the scores: e08 "the food score is the max …" fails;
  - no detritus term in movement: e08 "movement: with detritus in view …" and "max" fail;
  - detritus route before the meal check: e08 "eats local detritus only with an empty meal …" and "a capture in stage 5 …" fail;
  - flag never set: e08 tests 1 and 8 fail.
- DONE: module-accounting.test.ts passes. Fence unchanged.

## Files
- Created: `src/sim/debrisFeeder.ts`, `tests/fixtures/module-e06.test.ts`, `tests/fixtures/module-e08.test.ts`, this report.
- Changed (owned): `src/sim/intake.ts`.
- Changed (shared, additive): `src/sim/content/implemented.ts`, `src/sim/content/moduleRules.ts`, `src/sim/phenotype.ts`, `src/sim/movement.ts` (import plus the return line of foodScore), `src/sim/entities.ts` (one FLAG line), `src/worker/snapshot.ts` (import plus the E08 cue), `src/sim/moduleView.ts` (import plus two cases), `src/ui/strings/modules.ts` (E06/E08 texts, one FLAG constant, one action-chip line). contacts.ts was verified, not changed. content/manifest.json was not touched.

## Commands
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint` on the 12 files above: clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/module-e06.test.ts tests/fixtures/module-e08.test.ts tests/fixtures/module-accounting.test.ts tests/fixtures/photosynthesis.test.ts tests/ui/comprehension-labels.test.ts tests/ui/action-label.test.ts tests/render/phase3.test.ts tests/helpers/registry.test.ts tests/sim/module-visuals.test.ts tests/sim/modules.test.ts tests/worker/protocol.test.ts`: "Test Files 1 failed | 17 passed (18); Tests 1 failed | 130 passed (131)". The g2 replay, all four trajectory fences, closed-lid conservation, determinism, module-e06 (5), module-e08 (8) and module-accounting pass. The one failure (M5 in comprehension-labels) is not mine; see below.
- `npx tsx tools/content-validate.ts`: "content ok … modules 17 … 3 enabled module marks". No content was changed, so I did not run --write.
- e2e: no journeys were added or changed. No carrier exists in a shipped world, so no screen changes for a player until the lead enables the modules. Axe and touch-target checks are not applicable to this change.

## FENCE
None. Every new rule is gated on the carrier's profile (`prof.shade`, `prof.debrisFeeder`), and those come from the genome's modules. Non-carrier expressions are unchanged.

## Bugs noticed elsewhere
- `tests/ui/comprehension-labels.test.ts:60` (M5) fails on the current tree. `sugarSourcesOf` (snapshot.ts) now lists F02 Cordweaver: it has native E_STARCH_SECRETION and was enabled this wave (f02-links). The line now reads "Crumbsmiths' and Cordweavers' enzyme". The test pins the old sentence, so the test needs updating; the label itself is correct.
- `src/sim/entities.ts:224`: the comment "1 << 12 and 1 << 13 are reserved for … (E04/E12)" is stale. 13 is now detritusIntake, and 12 is mod-builders'. I left it alone because it is a shared line.
- On the plain (non-E06) photosynthetic route, LIGHT_LIMITED is unreachable for light > 0. Access is C/budget = light × avail(CO2) × scale, which is always below light, so a dim Sunbead is labelled FOOD_ACCESS_LOW ("not enough food here") instead of "too dark". Fixing it changes limitCode in shipped trajectories (in the fence digest), so I did not touch it. See PROPOSED DECISION 1.
- No lineage or Field Guide "diet" line yet says an E08 carrier eats detritus when it holds no meal. The Add Life and lineage diet lines are not in my files.

## PROPOSED DECISIONS
1. PROPOSED DECISION: for an E06 carrier, food access on the photosynthetic route is the CO2 supplied against its light-shaped ceiling (budget × 0.70 × min(1, light/0.35)). Its light response is then compared with that access and with N and O2 on equal terms, and LIGHT_LIMITED reports the measured light. Non-carriers keep the g2 access (C/budget) to hold the fence. The lead may apply the same decomposition to every photosynthesizer in a fence-updating change, which would fix the unreachable LIGHT_LIMITED above.
2. PROPOSED DECISION: an E08 carrier takes the detritus route only where its cell has detritus > 0. Otherwise it keeps the predator's PRED_NO_PREY reason. It eats the detritus field only, not film (D-0038 keeps film for digestsFilm species).
3. PROPOSED DECISION: on a recorded detritus tick the inspector's action chip says "Eating detritus" (or "Finding only traces of detritus" below usable intake), not "Digesting", because no meal is being digested.
4. PROPOSED DECISION: E06 "active now" means FLAG.feeding on the photosynthetic route (`intake.ts photosynthesizedThisTick`). When A04 mixotrophy lands, its per-tick mode must feed this helper.
