# e3-jacket build report (Phase 5 wave 13, P5.5 E11 Mineral jacket + trap hooks T1-T5)

Nothing is enabled (D-0104). E11 is reached only through test registries (`registryWith(..., { allowUnimplemented: true })`). The manifest, `implemented.ts`, the schema (5), the protocol (3), the ledger keys and the RNG streams are unchanged. No content was edited, so the contentHash is unchanged.

## Checklist: Build

| # | Item | Status | Where | Proving test |
|---|------|--------|-------|--------------|
| 1 | Profile.jacket from the world's recorded E11 numbers (null without E11) | DONE | src/sim/phenotype.ts:224 (field), :231 `JacketRules`, :408 `jacketFrom`, :550 (module loop), :598 | module-e11 "Profile.jacket holds the world's recorded E11 numbers" |
| 2 | ActionContext.mineralRequests + requestMineral; the E11 table entry after E10; header and SHIPPED comment; stage8-order re-pinned (TRAP 7, E11 11, synthetic native now CANOPY) | DONE | src/sim/actions.ts:153, :217-224, :136; tests/sim/stage8-order.test.ts:126-150, :203-206 | stage8-order (whole), module-e11 "the energy ceiling" (reserve, throws) |
| 3 | E11 action: jacketApplies / jacketRequest / jacketRun | DONE | src/sim/jacket.ts:81, :87, :116 | module-e11 "skip conditions", "binds exactly 0.002 per tick" |
| 4 | Shared mineral pass (one silicate snapshot, per-cell proportional headroom, 10 E per accepted mineral under 'construction', rest returned, pin to 0 with dust in roundoff.m); recordJacketBuilt / jacketBuiltNow; jacketView | DONE | src/sim/jacket.ts:137 `jacketPass`, :224, :240, :262; src/sim/structures.ts:108 | module-e11 "one shared mineral pass" (4 tests), "jacketBuiltNow follows accepted requests" |
| 5 | Coverage c = handling.ts jacketCoverage everywhere; stage 4 speed × (1 − 0.20c) only when prof.jacket !== null and jacketMineral > 0 | DONE | src/sim/movement.ts:501-506 | module-e11 "speed" (exact positions, 6 cases); NEUTRAL |
| 6 | Division: split (exists) + SPEC §9.19 reconcile (a daughter without E11 drops her jacket as grit in her own cell) | DONE | src/sim/births.ts:336-352 (reconciliation loop, after placement) | module-e11 "division" (4 tests); jacket-saves "a division whose new daughter lost E11" |
| T1 | held → DIV_BLOCK_STATE in divisionBlocker and allDivisionBlockers | DONE | src/sim/births.ts:78, :93 | trap-hooks T1 |
| T2 | the trap stays with the retained parent: held organism's heldByBirthId re-keyed after onParasiteDivision | DONE | src/sim/births.ts:366-370 | trap-hooks T2 (with an import round trip) |
| T3 | a held organism does not move; decision timer frozen; suitability (and wave 12's mode update) still run | DONE | src/sim/movement.ts:477-482 | trap-hooks T3 |
| T4 | nativeAction('TRAP', trapApplies, trapArmRun) after RIVALRY | DONE | src/sim/actions.ts:131 | trap-hooks T4, stage8-order |
| T5 | trapStep(world) after jacketPass, before fungalTransportPass | DONE | src/sim/structures.ts:109 | trap-hooks T5 (passes wrapped by vi.mock, order observed) |

## Checklist: Done when

- DONE: all six of my test files pass: module-e11 (23), e11-handling (4), jacket-saves (8), jacket-determinism (3), trap-hooks (5), and stage8-order (changed).
- DONE: the listed regression files pass, in one run of 27 files and 300 tests. The run covered module-e09-e10 (the repo has no module-e10 file), shells-silicate, conservation-mineral, conservation-all-pools, predation, predation-matrix, relationship-matrix, handling, radius-capture, shared-budget, film, handling-saves, predation-hooks, mode-saves, stage8-order, movement-births-tick, modules, founders, barrier-movement, lineage-host, glow-saves, phase5-import, migration-schema5, protocol3, module-e11, e11-handling and trap-hooks.
- DONE: `npx tsc -p tsconfig.json --noEmit` and `npx eslint` on every file I changed are clean.
- DONE: the fence is unchanged (see FENCE).
- E2E: none. No screen changed.

## Code as built

- **Profile.jacket**: `JacketRules | null`, holding `{ targetPerBody, buildRate, energyPerMineral, speedPenalty, minEnergy }` read with `param(mod, ...)` from the recorded E11 (`mod.id === 'E11'`).
- **ActionContext.requestMineral(cell, mineral, energyPerMineral)**: it checks mineral > 0 and finite, and energyPerMineral ≥ 0 and finite. It reserves `energyPerMineral × mineral` into `reservedE` and throws if that is more than `remainingEnergy()`. It never touches `reservedB`. It pushes `{ slot, cell, mineral, energyReserved, energyPerMineral }` to `mineralRequests`.
- **jacket.ts exports**:
  - Types: `MineralRequest`, `MineralOutcome`, `JacketOutcome`, `JacketView`.
  - Functions: `jacketApplies`, `jacketRequest`, `jacketRun`, `jacketPass`, `recordJacketBuilt`, `jacketBuiltNow`, `jacketView`.
- **jacketRequest order**:
  1. 'noSilicate': no silicate field, or `!worldHasSystem('silicate')`.
  2. 'held': `heldBySlot ≥ 0`.
  3. 'energy': `!(remE ≥ 15)`.
  4. 'full': `!(deficit > 0)`, where `deficit = targetPerBody × B − jacket`.
  5. Otherwise the amount is `min(buildRate × prof.b0 × DT, deficit)`, cut to `remE / energyPerMineral` if the energy cannot pay. This uses matrixRequest's one-rounding-step-down guard.

  `jacketRun` returns R.ENERGY_LOW for 'energy' and R.NONE otherwise.
- **The pass's arithmetic and the pin rule**:
  - Requests are sorted in canonical order (cell, then slot, then submission).
  - Read phase: per cell, `headroom = max(0, silicate[cell])` from the snapshot. When `scaled = Σ mineral > headroom`, every request is scaled by `headroom / Σ`.
  - Commit phase: `jacket += a`, `silicate[cell] −= a`, `E −= energyPerMineral × a`, `ledger.energy.construction += energyPerMineral × a`. `returned = energyReserved − charged`; nothing else was ever deducted.
  - A cell scaled from a positive headroom is pinned. So is a cell that a float subtraction left below 0, which is defensive. Pinning sets `dust = −silicate[cell]` and throws if `|dust| > 1e-12`. It then sets `silicate[cell] = 0` and adds the dust to `ledger.roundoff.m` (construction.ts's FILM_CAP pattern).
  - Then `markField('silicate')`. With no requests the pass returns `[]` at once and touches nothing.
- **Speed expression and the old path**: the old path is
  `const step = prof.jacket !== null && c.jacketMineral[i]! > 0 ? prof.speed * DT * (1 - prof.jacket.speedPenalty * jacketCoverage(c.jacketMineral[i]!, c.B[i]!)) : prof.speed * DT;`
  - Every organism without E11 short-circuits on `prof.jacket !== null`. It reads no column and evaluates the old expression `prof.speed * DT` exactly.
  - Proofs: the speed test's "no E11" and "carrier with no jacket" cases are bit-exact on positions. NEUTRAL keeps entity columns byte-identical over 2,000 ticks. The fence passes.
  - The factor scales every self-propelled move that uses `step` (pursuit, targets, wander). Decisions and scores are unchanged, and the movement cost follows `movedThisTick`.
- **The 9.19 reconcile's place**:
  - It sits in commitDivision's per-daughter reconciliation loop `for (const d of [i, slot])`, after both daughters are placed. It comes after resetDormancy, the glow reset, the A04 newborn mode and the energy cap, and before startRestingNewborn and the birthId rewrite.
  - It reads `profileOf(world, d)` once; this is the same profile the energy cap used, now held in `dProf`.
  - When `jacketMineral[d] > 0 && dProf.jacket === null`, it adds the jacket to `grit[cell of d]` (and throws if there is no grit field), then sets `jacketMineral[d] = 0`.
  - The grit is not marked, as with killEntity and consumePrey: conversion.ts scans every cell (D-0117). Stage 9 reads no grit, so the grit is usable next tick.
  - In a world without jackets this costs one read of an always-0 column per daughter.

## What each test proves (and the mutant that fails it)

| Mutant (applied by hand, then reverted; tools at tmp/e3-jacket/mutant.py) | Failing test(s) |
|---|---|
| slot-order allocation instead of proportional scaling | module-e11: 4 "shared mineral pass" tests |
| energy charged on the requested mineral | module-e11: "two carriers … charged 0.015 E", "charges only what it accepted" |
| E < 15 made inclusive (`remE > 15`) | module-e11: "E 14.99 → nothing; E 15 → builds" |
| c from B0' instead of current B (speed) | module-e11: "speed" (the B 2.5 case) |
| target from B0' instead of current B (deficit) | module-e11: "the target follows the current body" |
| dropped jacket kept on a daughter without E11 | module-e11: both "lost E11" division tests |
| T1 removed (divisionBlocker / allDivisionBlockers) | trap-hooks T1 (each removal separately) |
| T2 removed | trap-hooks T2 |
| T3 removed | trap-hooks T3 |
| TRAP placed after the modules | trap-hooks T4 (TRAP removed); with TRAP appended after E11, actions.ts's load-time canonical check throws ("not written in canonical order") and every importing file fails |
| speed factor applied to every organism | No test fails, and none can: an equivalent mutant. Without a jacket c = 0, the factor is exactly 1.0, and IEEE `x × 1 === x`, so NEUTRAL and the fence cannot see it. The guard spares the multiplication and column read for old species (D-0103's "no extra float operation"). |

Other proofs:

- **Rate, cost and cell loss**: the jacket, E, ledger.construction and the cell's silicate are checked with Object.is against the closed form every tick. The target 0.4 is reached exactly after 200 builds, and nothing is requested after that.
- **Shares**: equal shares hold with the slots in reverse order. In a scaled cell with float dust, the dust lands in roundoff.m, compared with Object.is. With 3 carriers in 2 cells, only the short cell scales.
- **Skips**: held (a hand-set F03 pair), no silicate, and full all skip. A non-carrier keeps its jacket at 0 over 300 ticks. Resting is unreachable: no eligible species can rest, and E03 is not eligible for P01, P02 or P07 (asserted).
- **Speed**: positions are exact (`x0 + 3 × 0.1 × (1 − 0.2c)`) at c 0.5 and c 1 (and clamped above 1), and at c 0.5 with B 2.5. A carrier with no jacket and a non-carrier both move exactly `x0 + 0.3`.
- **Division**: the jacket splits equally. The new daughter or the retained daughter loses E11 and drops her half into her own cell, and no other grit cell changes. No jacket is created by gaining E11.
- **Death and the module card**: a death sends a built jacket to grit. jacketBuiltNow follows accepted requests.
- **Conservation**: closed lid, 30 carriers, 10,000 ticks in 20 chunks. relErr stays under 1e-5 and the absolute residual under 1e-8 for C, N and mineral. The test also requires births > 0, carrier losses > 0 and some construction energy.
- **NEUTRAL**: shipped registry vs E11 + silicate recorded, with species tables equal. Entity columns are Object.is-identical over 2,000 ticks, and the construction energy is equal.
- **Content**: E11.targetPerBody === JACKET_COVERAGE_FRACTION, handlingBaseSeconds === HANDLING_JACKET_BASE_SECONDS, and handlingPerCoverage === HANDLING_JACKET_SECONDS_PER_COVERAGE.
- **e11-handling**: real jackets only (built in stage 8, never set by hand).
  - c 0.5: the need equals `1 + 3·jacketCoverage(jacket, B)` at the attempt start (Object.is). Capture comes on exactly k = 25 = ticksFor(need), not k − 1. The jacket grows during the attempt and the need does not change.
  - A break followed by a new attempt samples a larger c.
  - An unjacketed P07 is captured on the 10th tick; c 1 on the 40th, with no growth.
  - The capture puts the jacket to grit, and detail.handled carries the need.
- **jacket-saves**: accepted import, equal hash, and equal hash 300 ticks later at each of these points:
  - the first building tick;
  - a scaled shared tick;
  - the target tick;
  - a division with a dropped jacket;
  - a death of age with a jacket;
  - a P10 mid-attempt on a P07 that built its jacket;
  - rc1 saves loaded and saved again with the hash unchanged.

  The held carrier's skipped tick is asserted in the simulation, and the import refuses that dish ("A trap holds an organism it cannot catch"). The state is unreachable; see the proposed decisions.
- **jacket-determinism**: run(400) equals 4 × run(100), on both hash and 'full' digest, with jackets built and P10 handling. A save at 777 and a load run to 3,000 match the uninterrupted run. DishHost at 1× and at 4× reaches the same hash at the same tick as a headless run.
- **trap-hooks**: T1-T5 as in the table above. The T2 result passes the import (TRAP mocked as implemented) and the 300-tick round trip.

## Commands and results

- Fence, first run (tree with all my src edits): `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts` gave `Test Files 10 passed (10) / Tests 77 passed (77)` in 1896 s. My mutant runs overlapped this run, so the fence was run again on the final tree; see FENCE.
- Regression set: 27 files gave `Test Files 27 passed (27) / Tests 300 passed (300)`.
- `npx vitest run tests/sim/jacket-determinism.test.ts tests/sim/jacket-saves.test.ts` gave `Test Files 2 passed / Tests 11 passed`.
- `npx vitest run tests/fixtures/module-e11.test.ts` gave `Tests 23 passed (23)` in 281 s. The Profile test later gained the jacketView lines; re-run, that test passed (`1 passed`).
- `npx vitest run tests/fixtures/e11-handling.test.ts` gave `Tests 4 passed (4)`.
- `npx vitest run tests/sim/trap-hooks.test.ts` gave `Tests 5 passed (5)`.
- `npx tsc -p tsconfig.json --noEmit` and `npx eslint <13 files>` were clean.

## Indicative timings (tmp/e3-jacket/timing.ts)

The scratch script measured 300 ticks after a 30-tick warm-up, with 100 P01 on silicate 0.5. The machine's load average was 7-10 on 2 CPUs, so these numbers are noisy; the lead should measure on a quiet machine.

| Run | Stage 4 mean / p95 | Stage 8 mean / p95 |
|---|---|---|
| Plain P01, rep 0 | 1090 µs / 5754 µs | 255 µs / 1739 µs |
| Plain P01, rep 1 | 728 µs / 3833 µs | 153 µs / 83 µs |
| 100 E11 carriers, rep 0 | 941 µs / 4385 µs | 415 µs / 2359 µs |
| 100 E11 carriers, rep 1 | 1115 µs / 5388 µs | 328 µs / 2273 µs |

The carriers reach their 0.4 target at tick 200 of their life, so they request for about 170 of the 300 measured ticks.

## FENCE

- The final re-run on the finished tree passed: `Test Files 10 passed (10) / Tests 77 passed (77)` (tmp/e3-jacket/fence2.log).
- No fence value moved. I did not run tools/fence-update.ts.
- e3-traps edited shared files in parallel during both runs, so a fence run reflects the tree as both tasks left it at that moment.

## Proposed decisions

1. **15 E itself builds.** PROPOSED DECISION: SPEC's "skip while E < 15" reads as remaining energy ≥ 15 builds, inclusive, unlike E10's "> 35". It is checked against the energy remaining this tick after earlier actions.
2. **Jacket building is construction.** PROPOSED DECISION: jacket energy is recorded under ledger.energy.construction, as E10's film is. No new ledger key.
3. **One coverage function.** PROPOSED DECISION: c is handling.ts `jacketCoverage(jacketMineral, B)` everywhere: stage 4 speed, P10 handling and jacketView. A content test pins E11.targetPerBody === JACKET_COVERAGE_FRACTION and the two handling params to wave 12's constants, so the build target and the coverage denominator cannot drift apart.
4. **Speed is displacement.** PROPOSED DECISION: "speed × (1 − 0.20c)" scales the per-tick displacement only. The 0.5 s decision schedule and the scores are not speed. The movement cost follows the shorter distance (stage 7 reads movedThisTick).
5. **Target and rate use different bodies.** PROPOSED DECISION: the target uses the current B (SPEC "0.10 per current B"). The rate ceiling uses B0' (`prof.b0`; SPEC "0.005·B0'").
6. **No new reason code for held.** PROPOSED DECISION: a held organism is DIV_BLOCK_STATE. org-ui adds a "held" wording to the "Can't split while …" row.
7. **Pin an unscaled cell left below 0.** PROPOSED DECISION: jacketPass pins to 0 not only a scaled cell but also an unscaled cell that a float subtraction left a few ulps below 0. The dust goes to roundoff.m, and anything above 1e-12 throws. This means silicate is never negative after the pass.
8. **Unreachable skips stay defensive.** PROPOSED DECISION: three skip states have no path in a valid dish, so their checks stay in the code as defensive guards:
   - A held E11 carrier: F03 traps P04 only (CT §3.3) and E11 is eligible for P01, P02 and P07 only (CT §7.1). jacket.ts's 'held' skip and T3 still cover it, and e3-traps' import refuses such a pair.
   - A resting carrier: no E11-eligible species can rest.
   - 'noSilicate': E11 requires the silicate system (MODULE_SYSTEM_NEEDS).
9. **jacketView for a jacket without E11.** PROPOSED DECISION: jacketView returns null only when there is no E11 and no jacket. A jacket on an organism without E11 (reachable only by import) shows target 0 and speedFactor 1, because the speed rule needs prof.jacket.

## The module the lead adds at the organism flip

- E11 goes into IMPLEMENTED_MODULES, with moduleRegistryVersion 3 and the manifest change, as D-0059 did. tests/sim/modules.test.ts pins that list.
- TRAP is appended to IMPLEMENTED_NATIVE_ABILITIES at the wave 13 integration (e3-traps).
- When those land, drop the vi.mock lists in jacket-saves, jacket-determinism and trap-hooks.

## Changes I would make in another task's files (no NEEDS)

- **src/persistence/phase5State.ts (the jacket import rule, D-0118).** No reachable state now leaves a jacket on an organism without E11: the 9.19 reconcile drops it at birth. The import could therefore refuse `jacketMineral > 0` on a genome without E11. Today such a jacket loads, and an inconsistency follows: handling.ts `handlingNeedOf` gives it 1 + 3c, while movement applies no speed factor (prof.jacket is null). This should go to the lead or the next phase5State owner.
- **tests/fixtures/shared-budget.test.ts:208.** It pins the shipped module tier. I extended it additively to `['E01','E02','E09','E10','E11']`; this file is not mine, so the edit is reported here.
- traps.ts and its symbols were present, so no NEEDS line.

## Files

- **Created**:
  - src/sim/jacket.ts
  - tests/fixtures/module-e11.test.ts
  - tests/fixtures/e11-handling.test.ts
  - tests/sim/jacket-saves.test.ts
  - tests/sim/jacket-determinism.test.ts
  - tests/sim/trap-hooks.test.ts
  - docs/reports/reviews/g5-wave-13/e3-jacket-build.md
  - scratch only: tmp/e3-jacket/{timing.ts, mutant.py, *.log}
- **Changed**:
  - src/sim/phenotype.ts: Profile.jacket only.
  - src/sim/actions.ts: header, imports, SHIPPED comment, TRAP and E11 entries, mineralRequests, requestMineral.
  - src/sim/structures.ts: header comment, imports, jacketPass and trapStep calls.
  - src/sim/movement.ts: import, T3, the speed factor.
  - src/sim/births.ts: T1 ×2, T2, and the 9.19 reconcile with its `dProf` read.
  - tests/sim/stage8-order.test.ts: re-pin; CANOPY replaces the synthetic TRAP.
  - tests/fixtures/shared-budget.test.ts: E11 added to the pinned module tier.

## Bugs noticed elsewhere

- None blocking.
- The phase5State note above: a jacket without E11 is accepted on import and gets the handling penalty but no speed penalty.
- tests' console.info output is not shown by the vitest config, so module-e11's conservation summary line (worst errors, births, losses) is not visible in the logs. The assertions still hold.
