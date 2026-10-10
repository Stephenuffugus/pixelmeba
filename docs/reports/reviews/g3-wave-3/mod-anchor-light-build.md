# mod-anchor-light build report (P3.7 E04 Surface anchor, E07 Light seeker, D-0035 usable-intake clock)

## Checklist

### Build: clock (D-0035)
- DONE: `src/sim/intakeClock.ts:30` `advanceIntakeClock(world, i, prof)`. It runs only for a genome carrying E04 or E12 (`readsIntakeClock`, :23). It adds DT when FLAG.usableIntake is clear and resets to 0 otherwise. It is called once per tick for every living organism from the release hook (`src/sim/actions.ts:186`), before `anchorStep` (:187). It never writes for anyone else. Test: module-e04 "the usable-intake clock: 0 for non-carriers, counts for carriers without usable intake, resets on usable intake".

### Build: E04 (`src/sim/anchor.ts`)
- DONE: Support is a four-neighbour stone, wall or bead, or the rim (ST_OUTSIDE or off-grid) (`isSupport` :41, `anchorSupported`). Gel and sediment do not count. Tests: the attach tests (stone) and "one rim cell supports".
- DONE: Attach rule: Active, out of lockout, E > minEnergy (35), adjacent to support. Each qualifying tick adds DT, and the carrier anchors when the count reaches attachSeconds (5 s). Any gap, E ≤ 35, lockout or a non-Active state resets the count (`anchorStep` :88–118). Tests: "anchors on exactly the 50th tick…", "a gap in adjacency resets…", "attaches only with E above 35…".
- DONE: Anchored behaviour:
  - movement.ts skips self-propulsion through `isAnchored` (`movement.ts:370`) and clears FLAG.moving/hunting. With no movement there is no movement cost.
  - Upkeep of +0.10 E/s goes through `anchorUpkeepPerSecond` (`anchor.ts:70`), which `maintenance.ts:48–50` adds inside the upkeep and maint terms (ledger 'upkeep').
  - FLAG.attached is never set.
  - Tests: "anchored: exactly 0.01 E upkeep per tick, zero movement…" (includes a control that moves once unanchored) and "an anchored B01 stays valid prey for P02, which captures it".
- DONE: Detach (`anchor.ts:97–106`) happens when any of these holds:
  - noUsableIntakeSeconds ≥ 10;
  - support is lost;
  - E < 15;
  - lifeState is Resting.
  
  Every detach sets anchorLockout = lockoutSeconds (10 s). The lockout counts down in every state. Tests: the "detaches …, then a 100-tick lockout" tests for all three causes, and "resting releases the anchor (E03 carrier, labelled forced Resting); once Active it reattaches".
- DONE: Division resets the retained daughter with `onAnchorDivision` (`anchor.ts:122`), hooked at `births.ts:309` right after `rekeyLinks`. The new slot is allocated already cleared. Test: "division: both daughters start unanchored with fresh clocks; the supported one reattaches".
- DONE: Non-motile Y01 carriers anchor as a state and pay the upkeep. Their speed is 0 and selfPropelled is false. Test: "a non-motile Y01 carrier anchors…". Transport class is unchanged. Reason ANCHORED already exists (`reasons.ts:61`).
- NOT DONE (not applicable yet): "Active anchored organisms cannot enter directed channels". Directed channels are Phase 5 and no channel code exists.

### Build: E07 (`src/sim/lightSeeker.ts`)
- DONE: Phenotype changes in `phenotype.ts`:
  - At :337–345, baseSpeed and lightSensing replace def.speed and def.sensingRadius.
  - At :325–326, `activeLoci` sets L_MOTILITY and L_SENSING (one line each).
  - New fields `Profile.selfPropelled` (:414), `anchor`, `lightSeeker`, and `AnchorRules`/`LightSeekerRules`.
  - The movement gate now reads `prof.selfPropelled` (`movement.ts:368`). This is bit-identical for every non-E07 profile.
- DONE: Movement cost. `movementCost` (`lightSeeker.ts:31`) charges moveCostFactor × (0.5+g)² × DT when moved > 0, and 0 otherwise. It replaces the per-cell term, which is still returned for every non-E07 profile, so the maintenance.ts movement line is bit-identical for them (`maintenance.ts:52`). Test: "pays exactly 0.10 × (0.5 + g)² × dt…" (g = 50 and 80).
- DONE: Decision changes in `decide()`:
  - F = effective light (`movement.ts:239`).
  - Only the organism's own cell and cells brighter by ≥ brighterBy are candidates (`brightEnough`, :237).
  - If no cell is brighter, it stays and does not wander (:253).
  - Ties use the ordinary det tiebreak, and there is no crowd term beyond −0.1·C.
  - FLAG.moving is cleared on ticks it did not move (:424), so the seeking cue is truthful.
  - Tests: "a 0.009 brighter neighbour is ignored", "a 0.01 brighter neighbour is reached, then it stays (no wander)", "climbs a 0.01-per-cell gradient", "never crosses a wall… (edge-checked trace); trapped ticks cost nothing", "never enters brighter gel (habitat rule)".
- DONE: On module loss it stays where it is. Test: "module loss: a carrier whose genome loses E07 stops where it is".

### Shared edits (additive)
- `implemented.ts`: IMPLEMENTED_MODULES now includes E04 and E07.
- `moduleRules.ts`: MODULE_REQUIRED_PARAMS entries for E04 and E07.
- `actions.ts releaseInvalidLinks`: two lines added; mod-adhesion adds its line after them.
- `maintenance.ts`: the anchor upkeep term and the `movementCost` call. The unused MOVE_COST_PER_CELL import was removed.
- `births.ts`: one hook line plus its import.
- `moduleView.ts`: `activeNow` E04 = anchored and E07 = FLAG.moving. It was already a switch. `upkeepNow` adds `anchor` (0.10) only while anchored, not under 'chamber'.
- `protocol.ts`: optional `UpkeepInspect.anchor`.
- `strings/modules.ts`:
  - `upkeepText` adds "… for holding on to a surface".
  - E04 and E07 module texts, built from the recorded numbers.
- `lineage.ts`:
  - LineageProfile gains optional `moveCostPerSecond` and `sensesLight`. For E07 profiles, moveCostPerCell is 0 and the per-second cost is reported instead.
  - `profileSummary` is now exported so the fixture can call it.
- `strings/lineage.ts`: "Game rule: moving costs {v} energy per second (ancestor: …)" and "it senses light up to {v} cells away (ancestor: …)". Non-E07 lines are unchanged.
- `snapshot.ts`: checked only, no edit. CUE2_MOD_E04/E07 come from genome modules, CUE2_ANCHORED from anchorState === 1, and CUE2_SEEKING_LIGHT from FLAG.moving on E07 carriers (`cue2Of`).
- `tests/fixtures/registry-imports.test.ts` (shared): its "module this build cannot simulate" example was E07, which is now implemented. I switched it to E02 Signal glow (Phase 5) on a B01 genome. Same assertions, new name and ID.

### Done when
- DONE: `tests/fixtures/module-e04.test.ts`, 15 tests, every listed item covered.
- DONE: `tests/fixtures/module-e07.test.ts`, 10 tests, every listed item covered (W4-10).
- DONE: `tests/fixtures/module-accounting.test.ts` passes. Both new fixtures also check that the energy change equals the sum of the ledger categories and that `checkLedger` is ok.
- DONE: Non-vacuity checks. I mutated the code temporarily, ran the tests, then restored it and confirmed with diff:
  - Removing the gap reset (`anchorSeconds = 0` in the not-qualifying branch) fails "a gap in adjacency resets the attach clock (gap reset)" and "attaches only with E above 35…".
  - Removing the lockout (detach sets 0) fails all 3 detach-cause tests and the resting test.
  - Removing the 0.01 rule (any brighter cell counts) fails "a 0.009 brighter neighbour is ignored…".
  - Charging the per-cell cost to seekers fails "pays exactly 0.10 × (0.5 + g)² × dt…".
  - Skipping the trace check for seekers fails "never crosses a wall… (edge-checked trace)…".
- DONE: Fence unchanged. g2-replay and all four trajectory-fence files pass.

## Files
- Created:
  - `src/sim/anchor.ts`
  - `src/sim/lightSeeker.ts`
  - `src/sim/intakeClock.ts`
  - `tests/fixtures/module-e04.test.ts`
  - `tests/fixtures/module-e07.test.ts`
  - this report
- Changed (owned): `src/sim/movement.ts`, `src/sim/phenotype.ts`.
- Changed (shared, additive):
  - `src/sim/content/implemented.ts`
  - `src/sim/content/moduleRules.ts`
  - `src/sim/actions.ts`
  - `src/sim/maintenance.ts`
  - `src/sim/births.ts`
  - `src/sim/moduleView.ts`
  - `src/sim/lineage.ts`
  - `src/ui/strings/modules.ts`
  - `src/ui/strings/lineage.ts`
  - `src/worker/protocol.ts`
  - `tests/fixtures/registry-imports.test.ts`
- I did not touch content/manifest.json or anything under content/, so no content:validate run was needed.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: clean. An earlier run showed one error in `tests/e2e/sample-transfer.spec.ts`, another builder's in-flight file; it has since gone.
- `npx eslint` on every file listed above: clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/module-accounting.test.ts tests/fixtures/module-e04.test.ts tests/fixtures/module-e07.test.ts tests/sim/module-visuals.test.ts tests/sim/modules.test.ts tests/sim/gates.test.ts tests/sim/stage8-order.test.ts tests/fixtures/registry-imports.test.ts tests/fixtures/shared-budget.test.ts tests/worker/protocol.test.ts tests/helpers/registry.test.ts`: `Test Files 1 failed | 17 passed (18)`, `Tests 1 failed | 141 passed (142)`. The one failure was registry-imports, which used E07 as its unimplemented example. After the fix, `npx vitest run tests/fixtures/registry-imports.test.ts` gave `Tests 5 passed (5)`.
- `npx vitest run tests/content tests/ui/lineage-host.test.ts tests/ui/lineage-panel.test.ts tests/ui/feed-modules.test.ts tests/sim/movement-births-tick.test.ts tests/sim/lab-commands.test.ts tests/helpers/trajectory.test.ts tests/worker/host.test.ts tests/fixtures/registry-imports.test.ts tests/fixtures/film.test.ts tests/fixtures/predation.test.ts tests/fixtures/photosynthesis.test.ts`: `Tests 2 failed | 267 passed (269)`. Both failures are in film.test.ts and are not mine (see Bugs elsewhere).
- E2E: none. E04 and E07 stay off in the shipped manifest until the lead's flip, so no app journey can reach them. My only UI changes are strings (module card, upkeep line, Game rule lines), and they are covered by unit fixtures.

## FENCE
- None. With E04/E07 absent from a world's registry, every new path is a no-op:
  - `prof.selfPropelled` equals `sp.selfPropelled`.
  - The per-cell movement expression is the same expression.
  - The anchor upkeep adds an exact 0.
  - anchor and clock columns are never written, so they stay hash-neutral.
- g2-replay and all four trajectory-fence files pass.

## Notes for the lead
- The lead's flip (enabling E04/E07, moduleRegistryVersion 2) changes Standard recipes' mutation options and the fence, as expected. E07 carriers also mutate their motility and sensing loci (`activeLoci`).
- The inspector action chip shows "Staying in place" for an anchored organism. EntityInspect has no anchor state; the cue bits and the module card's "Holding on to a surface right now." carry it. A follow-up could add an "Anchored" chip from CUE2_ANCHORED.
- E07 says "unheld". There is no hold mechanism in Phase 3 (the F03 trap is Phase 5); the E12 linked-member skip belongs to mod-adhesion.

## Bugs noticed elsewhere
- `tests/fixtures/film.test.ts`: "a world without the film system makes no film request…" and "a B04 preference mutation draws identically with and without the film system (D-0038)" now fail inside `registryWith`. The cause is the in-flight shipped manifest that enables F02 (f02-links): the test removes the 'fungi' system but keeps the shipped species list, and the validator then rejects F02 ("uses BRANCHING/TRANSPORT_LINKS, which needs the "fungi" system"). Fix: the test should also drop F01/F02 from enabledSpecies, or keep 'fungi'.

## Proposed decisions
- PROPOSED DECISION (owner): the dish rim (ST_OUTSIDE, or a neighbour off the grid) counts as E04 support (SPEC §2.1 rim is a solid edge). Gel and sediment are not support; mesh comes in Phase 5.
- PROPOSED DECISION (owner): an anchored carrier stays "free" for the CT §3.2 prey rules. FLAG.attached is never set, so P02/P05/P07 may take an anchored B06–B12.
- PROPOSED DECISION: every E04 detach starts the 10 s lockout, including the release on Resting. Release happens on Resting only, not Preparing. A carrier that is Preparing keeps its anchor (and pays its upkeep) until it rests.
- PROPOSED DECISION: division also clears the retained daughter's anchorLockout, so both daughters start identical. The assignment named only anchorState, anchorSeconds and noUsableIntakeSeconds.
- PROPOSED DECISION: attaching does not require recent usable intake. A carrier detached by the clock can reattach after its lockout and then detach again on the next tick while it is still unfed.
- PROPOSED DECISION: E07 candidates are restricted to the organism's own cell plus cells at least brighterBy (0.01, with 1e-12 float tolerance) brighter. Among those, the ordinary 0.5·F + 0.4·S − 0.1·C score picks the target, so the organism moves only to brighter cells.
