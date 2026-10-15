# e3-traps build report (Phase 5 wave 13, P5.5): F03 Traplace's trap

Nothing is enabled (D-0104). F03 is reached only through test registries (`registryWith(..., { allowUnimplemented: true })`). **The lead appends `TRAP` to IMPLEMENTED_NATIVE_ABILITIES at integration.** No content edit, no schema bump, no protocol bump, no contentHash change. The FENCE passes unchanged.

## Checklist

### Build
- **0. DONE.** `src/sim/traps.ts` was created first with the exact signatures. The constants are at constants.ts:229-244 (TRAP_ARM_MIN_ENERGY 50, TRAP_ARM_MIN_BODY_MULTIPLE 1.3, TRAP_RESERVE_C 0.2, TRAP_ARM_ENERGY 8, TRAP_HOLD_SECONDS 8, TRAP_COOLDOWN_SECONDS 30, TRAP_TARGET_DEATH_FRACTION 0.25, each with its CT reference). The drain rate is read from F03.json's drainRate. events.ts:64-82 adds 'trapArmed', 'trapHold' and 'trapRelease' with doc comments. snapshot.ts is untouched.
- **1. DONE.** traps.ts:86 `trapSpeciesOf` and :97 `trapTargetsOf` are WeakMaps on world.species, null when no species has the ability. :108 `worldHasTraps`. The state is derived from existing columns (file header). The entities.ts:143 comment is corrected: the reserve is carbon and nutrient taken from the owner's own body.
- **2. DONE.** Arm: traps.ts:240 `trapApplies` (TRAP species and reserve 0) and :252 `trapArmRun`. All checks are inclusive: E ≥ 50, B ≥ 1.3·B0', B − 0.2 ≥ B0'. The move is 0.2 C plus N·0.2/B, the spend is 8 E under 'construction', and one 'trapArmed' is emitted. The run returns ENERGY_LOW or NONE. Proved by traps.test "E213: moves exactly…", "refuses at E 49.99…" and "never below B0'".
- **3. DONE.** Capture: traps.ts:300 `trapCaptures`, called at contacts.ts:70 right after predationContacts. Each owner takes the nearest target in its own cell, ties to the lower birthId. Competing owners resolve by det(seed, 'contact', tick, KIND_TRAP 5, owner birthId), then the lower birthId. Trap claims keep their own pool. Commits run in ascending owner slot and emit one 'trapHold'. Proved by traps.test "who is caught" (4 tests, including "a held P04 still captures a B01").
- **4. DONE.** Drain: traps.ts:378 `reserveTrapDrains` and :420 `commitTrapDrains`, called at intake.ts:211 and :549, each beside its host-drain counterpart. The broth skip is at intake.ts:277, gated on trapSpeciesOf, and applies to the ordered loop and both weighted loops. Proved by traps.test "holds at A + 1, drains 80 times by the closed form…" (Object.is on every tick) and "a holding F03 requests no broth…".
- **5a. DONE.** The drain death is maintenance.ts:105-106, after the parasite drain death, gated by `worldHasTraps` once per stage. Proved by traps.test "drain death…".
- **5b. DONE.** traps.ts:208 `releaseTrapOnRemoval`, called from killEntity (maintenance.ts:174, before releaseHostPair) and from consumePrey (contacts.ts:287). Proved by traps.test "the owner's death (age)…" and "consumePrey of a held P04 or of a holding F03…".
- **5c. DONE.** traps.ts:482 `trapStep`, called by e3-jacket's T5 at structures.ts:109. The E213 timeline is asserted tick by tick.
- **5d. DONE.** The invariants are in `expectTrapInvariants` (traps.test). It is asserted at every tick of the timeline and at every conservation chunk. The import enforces the same invariants (item 8).
- **6. DONE.** ledger.ts:136-157 adds trapC and trapN as +0 terms and the breakdown keys `trapC` and `trapN`. sampleSlot.ts:210-211 does the same for sample rows. No test pinned the breakdown keys (checked with git grep). The import's "does not count yet" refusal is dropped.
- **7. DONE.** sample.ts:136-144: partnersOf covers both directions. sample.ts:417-418: REF_COLUMNS gains both trap pairs after the adhesion pairs. sample.ts:421: LINK_REFS is now an explicit list of the fungal and adhesion pairs. sampleSlot.ts HELD_REFS gains both triples, with the message "a held trap and its target do not refer to each other". Proved by trap-sample.test.ts (7 tests).
- **8. DONE.** phase5State.ts:64-72 holds the reserve, hold-time and wait rules. :220 refuses a trap holding something it cannot catch on a living slot, and :238-246 does the same for held rows, replacing the old "held sample holds a trap" refusal. `Phase5CheckContext.species` gains `id`. A held organism outside its owner's cell is not refused. phase5-import.test.ts's trap cases are re-pinned, with a reason comment on each.
- **9. DONE (report only).** Pure readers for org-ui: `trapView` (traps.ts:524) and `heldView` (:551). HELD_IN_TRAP is never written to limitCode.

### Done when
- **DONE.** My 6 files: 99/99 pass. Regression set: 38 files, 369/369 pass (list under Commands).
- **DONE.** tsc and eslint are clean.
- **DONE.** FENCE: 10 files, 77/77 pass, unchanged.
- **DONE.** E2E: none (no screen changes).

## traps.ts exports (as committed)
- `TRAP_TARGETS: readonly string[] = ['P04']`
- `KIND_TRAP = 5`
- `type TrapReleaseWhy = 'timer'|'targetDied'|'ownerDied'|'removed'`
- `trapSpeciesOf(world: Pick<World,'species'>): Uint8Array|null`
- `trapTargetsOf(world: Pick<World,'species'>): Uint8Array|null`
- `worldHasTraps(world: Pick<World,'species'>): boolean`
- `trapTargetOf(world, i): number`
- `trapHolderOf(world, i): number`
- `trapHoldsTarget(world, i): boolean`
- `releaseTrapOnRemoval(world, i, removed: boolean): void`
- `trapApplies: Stage8Action['applies']`
- `trapArmRun: Stage8Action['run']`
- `trapCaptures(world): void`
- `reserveTrapDrains(world): void`
- `commitTrapDrains(world): void`
- `trapDrainDeathDue(world, i): boolean`
- `trapStep(world: World): void`
- `type TrapState`
- `interface TrapView`, `trapView(world, i): TrapView|null` (fields: state, reserveC, reserveN, target {birthId, speciesIdx}|null, heldSeconds, cooldownLeft)
- `interface HeldView`, `heldView(world, i): HeldView|null` (fields: ownerBirthId, ownerSpeciesIdx, heldSeconds, drained = the owner's intakeLastSecond)

## State machine
| From → to | Stage | Function | Columns written | Event |
|---|---|---|---|---|
| none → armed | 8, Active only (T4 action id 7) | trapArmRun | B, N, E, trapReserveC/N, ledger.energy.construction | trapArmed (amount 0.2, reserveN, energy 8) |
| armed → holding | 5 | trapCaptures | owner trapSlot/trapBirthId/trapTimer=0; target heldBySlot/heldByBirthId | trapHold (cause HELD_IN_TRAP, target, targetSpecies) |
| holding (drain) | 6 | reserve/commitTrapDrains | target B, N; owner B, N, E, lastIntakeTick, intakeAccum, flags, limitCode NONE/1; cell co2, metabolite, nutrient | none |
| holding (timer) | 8 | trapStep | trapTimer += DT | none |
| holding → cooldown, timer | 8 | trapStep/endHold | pair cleared both sides, trapTimer 0, trapCooldown 30 | trapRelease why 'timer', seconds 8 |
| holding → cooldown, target died | 7 (drain death, or any death of the target) | killEntity → releaseTrapOnRemoval | same as the timer row | trapRelease 'targetDied' |
| holding → cooldown, target captured | 5 | consumePrey → releaseTrapOnRemoval | same as the timer row | trapRelease 'removed' |
| owner dies or is captured | 7 / 5 | releaseTrapOnRemoval | target's held refs cleared (alive in place); reserve → detritus/detritusN in the owner's cell | trapRelease 'ownerDied' / 'removed' (only if holding) |
| cooldown → armed | 8 | trapStep | trapCooldown −= DT, snapped to 0 at ≤ 1e-9 | none |
| owner divides (T2) | 9 | births.ts:370 (e3-jacket) | target heldByBirthId = the retained daughter's new birthId | none |

The cooldown first counts down at the tick after the release, whatever stage released it. A per-world WeakMap scratch of release ticks does this; it is never saved or iterated. Timeline: armed A, held A+1, 80 drains A+1…A+80, released at stage 8 of A+80, cooldown 0 at A+380, caught again at A+381.

## Drain arithmetic per tick
- C = min(drainRate·DT, B_t), which is 0.003 here.
- bound = N_t·C/B_t. A free-nutrient need of max(0, 0.05C − bound) scales the whole drain; it is 0 for P04.
- Target: B −= C, N −= bound.
- Owner: B += 0.5C (0.0015), N += 0.05C, E += 30C (0.09), capped with the excess dissipated.
- Cell: CO2 += 0.3C (0.0009), metabolite += 0.2C (0.0006), nutrient += bound + free − 0.05C. O2 is unchanged.
- All of the above is checked with Object.is on every one of the 80 ticks.

## Import rules (each sentence is followed by " Nothing was loaded.")
- "A trap acts without a reserve." Raised by trapSlot ≥ 0, a timer, a cooldown or reserve N while reserve C = 0.
- "A trap's hold time is invalid." Raised by a timer ≠ 0 without a target, or a timer ≥ 8.
- "A trap's wait is invalid." Raised by a cooldown > 30, or a cooldown > 0 while holding.
- "A trap holds an organism it cannot catch." on a living slot. On a held row it reads "The held sample cannot be loaded. A trap holds an organism it cannot catch."
- Held rows: "The held sample cannot be loaded. <rule>" via organismProblem.
- Mutuality on held rows: "The held sample cannot be loaded (a held trap and its target do not refer to each other)." or "(a sample row is linked to an organism the sample does not hold)."
- Earlier rules are kept (self-hold, pairs, negatives).
- Tested on living slots, on held rows and through the host's importDish with the open dish untouched (trap-import.test.ts, 19 tests).

## Tests and what each proves
- **tests/fixtures/traps.test.ts (18 tests).**
  - Arm values; inclusive refusals; the b0-0.5 guard.
  - The full timeline: closed form, T3 no movement, release, 300 ticks without capture, recapture.
  - The P04 moves again after release; the broth skip.
  - Nearer target wins; the two-trap det duel with slots reversed and a seed for each winner.
  - The neighbour-cell refusal; a held P04 still captures.
  - Drain death; owner death; T2 division; T1 no division; consumePrey on either end.
  - Closed-lid conservation over 10,000 ticks: worst relative error C 1.0e-14, N 8.1e-14; absolute C 6.0e-11, N 9.3e-11; 12 arms, 8 holds, 8 releases.
  - NEUTRAL: shipped vs REG_T byte-identical over 2,000 ticks; computeTotals Object.is-equal to HEAD's on all rc1 saves.
- **tests/sim/trap-saves.test.ts (5 tests).** Round trips at all 12 required points, each with an accepted import, an equal hash and an equal hash 300 ticks later.
- **tests/sim/trap-sample.test.ts (7 tests).** Take / save / Cancel; Transfer (5,0) and (0,−7) with remap and an on-time release; a transfer that rounds across a cell edge is accepted; Discard exports with the reserve and emits no release; a one-end footprint is refused; a non-mutual held pair is refused.
- **tests/sim/trap-determinism.test.ts (3 tests).** 400 vs 4×100 ticks (stateHash and the 'full' digest); save at 777 (seed 11: 1 holding, 3 cooling) → 3,000 ticks; DishHost 1× = 4×.
- **tests/persistence/trap-import.test.ts (19 tests).**
- **Mutants (each applied by hand, then reverted; tmp/e3-traps/mutate.py).** Every one made its test fail:
  - drain credited to the reserve → timeline
  - no broth skip → broth test
  - release at 7.9 s → timeline
  - no cooldown → timeline
  - capture from the ±1 cell → neighbour test
  - reserve left out of computeTotals → arm test (ledger)
  - REF_COLUMNS without the trap pairs → both Transfer tests
  - LINK_REFS with the trap pairs → the rounding-transfer test
  - no release at owner death → owner-death test
  - KIND 1 → det duel
  - each import refusal removed → its trap-import cases (6/4/4/1/1)
  - HELD_REFS without the trap pairs → the not-mutual test
  - T2 missing: not mutated in births.ts (e3-jacket's file). The state it would leave was set by hand after a real division; the import refuses it ("A trap and the organism it holds do not refer to each other.", scratch tmp/e3-traps/t2mutant.test.ts). The trap-saves division round trip therefore depends on T2.

## Commands
- `npx tsc -p tsconfig.json --noEmit` → clean.
- `npx eslint` on all 17 changed or new files → clean.
- FENCE (`npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts`) → Test Files 10 passed (10), Tests 77 passed (77), 1715 s.
- Mine (`traps`, `trap-saves`, `trap-sample`, `trap-determinism`, `trap-import`, `phase5-import`) → Test Files 6 passed (6), Tests 99 passed (99).
- Regression → Test Files 38 passed (38), Tests 369 passed (369). The set:
  - fixtures: predation, predation-matrix, conservation-all-pools, conservation-mineral, relationship-matrix, relationships-w2, host-specificity, finite-feeding, fair-shared-food, handling, radius-capture, detritus-fallback, module-e12, shells-silicate, transport-obstacles
  - sim: handling-saves, predation-hooks, movement-births-tick, feeding, stage8-order, capture-roundoff, barrier-contacts, mode-saves, structure-commands, structure-links, tools
  - persistence: phase5-import, migration-schema5, stale-prey, adhesion-import, handling-import, import-implemented
  - worker: sample-transaction, protocol3, favorites-host, probes-crossings, try-dish-host
  - ui: favorites
- Indicative timings (scratch tmp/e3-traps/perf.test.ts, 300 ticks, shared and loaded 2-CPU machine, so noise dominates), mean / p95 in ms, two runs each:

| Dish | Stage 5 | Stage 6 | Stage 8 |
|---|---|---|---|
| Without F03 (40 P04, ~190 alive), run 1 | 0.37 / 2.12 | 0.43 / 2.36 | 0.42 / 2.21 |
| Without F03, run 2 | 0.17 / 0.40 | 0.22 / 0.31 | 0.32 / 1.46 |
| 40 F03 holding P04 (277 alive), run 1 | 0.31 / 1.24 | 0.48 / 2.29 | 0.39 / 1.24 |
| 40 F03 holding P04, run 2 | 0.37 / 1.80 | 0.39 / 2.22 | 0.43 / 2.03 |

  No measurable trap cost above the noise. The lead should re-measure.

## FENCE notes
Unchanged. A world without a TRAP species reads no trap column in any stage:
- stage 5, 6, 8: gated by trapSpeciesOf;
- stage 7: one worldHasTraps per stage;
- killEntity and consumePrey: a WeakMap lookup only.

computeTotals adds exact +0 terms (Object.is checked on the rc1 saves). Not a stage, but these do read trap columns: computeTotals, sampleTotals and sample partnersOf. Each reads them in every world, and every one of those reads yields the old result while the columns are empty.

## NEEDS
None. All e3-jacket hooks are present:
- T1: births.ts:78 and :93
- T2: births.ts:370
- T3: movement.ts:478
- T4: actions.ts:131
- T5: structures.ts:109

## Bugs noticed elsewhere
None. A tsc error in e3-jacket's tests/sim/trap-hooks.test.ts:168 was seen mid-wave and was gone at my final tsc.

## Proposed decisions
1. PROPOSED DECISION (D-0124 already rules these): TRAP_TARGETS needs no content edit; the arm cost goes under 'construction'; "draining" means holding a valid target at the start of stage 6; every end of a hold sets a 30 s cooldown; HELD_IN_TRAP is derived by the inspector; SPEC §10.5 supersedes D-0106 (nothing is released at Take, Transfer or Discard).
2. PROPOSED DECISION: a cooldown started in a tick first counts down at the next tick's stage 8, whichever stage ended the hold, so every release is followed by exactly 300 capture-free ticks. Reason: a stage 7 death or a stage 5 removal would otherwise give 299. Mechanism: a WeakMap release-tick scratch, never saved; a save is only taken between ticks, so reloads are exact (the round trips prove it).
3. PROPOSED DECISION: 'trapRelease' detail.seconds is the hold time rounded to the tick (Math.round(timer/DT)·DT). A target that dies in stage 7 of its capture tick reports 0, because the timer advances in stage 8.
4. PROPOSED DECISION: the owner's reserve goes to detritus on any removal (death or capture), held or not (SPEC §6.8). consumePrey reports 'removed' for either end.
5. PROPOSED DECISION: capture also checks the target's own centre cell, not just the spatial-index cell.
6. PROPOSED DECISION: trapStep ends a stale or non-mutual hold defensively as 'targetDied'. It is unreachable, since every removal passes releaseTrapOnRemoval.
7. PROPOSED DECISION: the drain products land in the target's cell (host-drain parity).
8. Ability for the lead to append: **TRAP**.
