# g5-wave-13 wave verifier 1: e3-traps and e3-jacket

**Lens:** rules, determinism, conservation, tests and player-facing truth.

**Tree:** the uncommitted working tree on main at 3daebb2, read 2026-10-15. I edited no tracked file. My scratch files are in tmp/verify-g5-wave-13-0/.

**Verdict: ok.** I found no BLOCKER and no MAJOR. Four MINOR and four NIT items follow, then the parts I verified.

## Problems (most severe first)

1. **MINOR [e3-jacket]** tests/fixtures/shared-budget.test.ts:209 is edited outside e3-jacket's ownership.
   - The test pins the shipped module tier. It now includes `E11`, which is a required re-pin, and the edit carries a reason comment.
   - The builder reported it ("Other tasks' files"), but no assignment granted this file.
   - Repro: `git diff tests/fixtures/shared-budget.test.ts`.
   - The lead should accept the re-pin at integration.

2. **MINOR [e3-jacket]** tests/sim/jacket-saves.test.ts has no round trip at the "held carrier's skipped tick" point that the assignment lists.
   - The builder checks the skip in the simulation only. A held E11 carrier cannot occur, because F03 traps only P04 (CT §3.3) and E11 is eligible only for P01, P02 and P07 (CT §7.1). The new import refuses such a dish ("A trap holds an organism it cannot catch.").
   - The builder's report explains this (decision 8). The point is unreachable, not missing coverage of a reachable state.
   - Repro: `grep -n "held" tests/sim/jacket-saves.test.ts`.

3. **MINOR [e3-traps]** src/sim/traps.ts:166-181 adds `releaseTickByWorld`, a per-world WeakMap scratch that is not saved, yet decides whether a cooldown counts down this tick.
   - It is correct today. Every release happens in stage 5 (consumePrey, the predation commit) or stage 7 (killEntity). `grep -rn killEntity src` finds no other caller, and sample Take and Discard free rows directly. A release only matters within its own tick's stage 8, and saves happen only between ticks.
   - I checked a reload every 3 ticks over ticks 100-700 of a 10-F03, 40-P04 dish. Each reload equals the uninterrupted run, both at load and 3 ticks later.
   - It is unsaved state that changes an outcome, and D-0124 does not rule on it (it is builder proposed decision 2). **The lead should rule on it or log it in DECISIONS.**

4. **MINOR [e3-traps]** e3-traps did not run the "T2 missing" mutant itself, because births.ts is e3-jacket's file. It covered the case with a hand-set state that the import refuses.
   - e3-jacket did run "T2 removed": trap-hooks T2 fails, and that test includes the import round trip.
   - Together the two cover the mutant. No single report shows "the round trip at the owner's division fails" with the T2 line itself removed.

5. **NIT [e3-traps]** src/persistence/phase5State.ts:69-72 accepts two states the simulation never writes at a tick boundary:
   - any positive `trapReserveC` (the arm writes exactly 0.2, and division never splits the reserve);
   - a holding pair with `trapTimer` 0 (stage 8 always adds 0.1 to it in the same tick as the capture).

   The assignment did not ask for either rule, and both states load and run consistently. I list this for completeness only.

6. **NIT [e3-jacket]** src/sim/births.ts:92-93: `allDivisionBlockers` can push `DIV_BLOCK_STATE` twice, for a non-Active organism that is also held.
   - This cannot happen. P04, the only trap target, has no DORMANCY ability, and E05 is the only module eligible for it, so P04 is always Active.

7. **NIT [e3-traps]** The 'trapRelease' `detail.seconds` is the hold time rounded to the tick.
   - A target that dies in stage 7 of the tick it was caught reports 0 s.
   - The builder documented this (decision 3). It is honest, but the inspector wording belongs to org-ui.

8. **NIT [lead]** Once TRAP is appended to IMPLEMENTED_NATIVE_ABILITIES at integration, these tests must move to a mock without TRAP, as D-0124 says:
   - tests/persistence/import-implemented.test.ts (its unimplemented-ability subject is F03's TRAP);
   - tests/content/validator.test.ts.

   After the TRAP and E11 flips, the `vi.mock` overrides in the trap and jacket tests become redundant.

## VERIFIED OK

### Checks I ran

| Check | Result |
|---|---|
| **The fence:** `npx vitest run` on tests/fixtures/g2-replay.test.ts, tests/fixtures/rc1-replay.test.ts, tests/fixtures/trajectory-fence, tests/fixtures/conservation-closed-lid.test.ts, tests/fixtures/determinism.test.ts and tests/fixtures/determinism-g3.test.ts | 10 files, 77 of 77 passed, 1146 s, EXIT 0. Fence unchanged. |
| **The trap tests:** tests/fixtures/traps.test.ts, tests/sim/trap-saves, trap-sample, trap-determinism and trap-hooks, tests/persistence/trap-import, tests/sim/stage8-order and tests/persistence/phase5-import | 8 files, 116 of 116 passed |
| **The jacket tests:** tests/fixtures/module-e11, tests/fixtures/e11-handling, tests/sim/jacket-saves, tests/sim/jacket-determinism and tests/fixtures/shared-budget | 5 files, 46 of 46 passed |
| `npx tsc -p tsconfig.json --noEmit` | EXIT 0 |
| `npx eslint` on all 30 changed or new files of both tasks | EXIT 0 |
| **My probe of natural play:** tmp/verify-g5-wave-13-0/probe.test.ts with tmp/verify-g5-wave-13-0/vitest.config.ts. A 48×48 sediment square, 10 F03, 40 P04 roaming without pinned positions, 200 B01 and broth, 2,500 ticks, invariants checked every tick | Results below |
| **My save probe:** a reload every 3 ticks over ticks 100-700 | Equal at load and 3 ticks later, with real releases in the window |

Results of the natural-play probe:
- 40 traps armed (daughters from branching armed their own) and 9 holds.
- 9 releases: 8 on the timer and 1 because the target died.
- 648 held organism-ticks.
- Every hold was mutual, and the held P04 stayed in its owner's cell on every tick.
- The timer stayed above 0 while holding, the cooldown stayed at or below 30 and was 0 while holding.
- The ledger check passed, with relative error 5e-15 for C and 6e-14 for N.

### e3-traps: rules against the docs

- **Arm** (SPEC §7.17; CT §12.5 "E >= 50, B >= 1.3 B0', 0.20 C + 8 E"): traps.ts:252-280.
  - All three checks are inclusive and use `prof.b0`: E ≥ 50, B ≥ 1.3 × B0' and B − 0.2 ≥ B0'.
  - It moves exactly 0.2 C and N × 0.2 / B, and spends 8 E under 'construction' through `ctx.spend`, which deducts immediately and is never scaled as maintenance (§8.2).
  - It runs once per owner: it applies only while `trapReserveC === 0`.
  - The constants are at constants.ts:229-244, each citing its CT line. The drain rate is F03.json's `drainRate` 0.03, not a constant.
- **Capture** (§3.2 row 5): contacts.ts:70.
  - It runs after predationContacts and before attachParasites.
  - The target must be in the owner's own cell, by the index cell and by the target's own centre cell.
  - The nearest target wins, ties to the lower birthId.
  - Competing owners are resolved by `det(seed, STREAMS.contact, tick, KIND_TRAP 5, owner birthId)`. No new stream is added and nothing is keyed by species index.
  - It has its own claim pool. A hold removes nothing, so it cannot collide with the predation award.
- **Drain** (§6.5; CT §12.3; D02 392): traps.ts:378-468 is line for line the same as parasites.ts reserveHostDrains and commitHostDrains:
  - the same nutrient-shortage scaling;
  - the split 50 % to the owner's body, 30 % CO2, 20 % metabolite;
  - E += energyPerCarbon × C (30), capped, with the excess recorded as dissipated;
  - no oxygen debit, and surplus bound N returned to the cell.
  - The calls are at intake.ts:211 and :549. traps.test checks every one of the 80 drains with Object.is against the closed form.
- **Broth skip:** intake.ts:276-277 covers both the ordered and the weighted paths. It is gated on `trapSpeciesOf`, so other species never read a trap column.
- **Drain death:** maintenance.ts:105-106 kills a held target strictly below 0.25 × B0', after the parasite drain death. It is gated once per stage.
- **Release on removal** (SPEC §6.8, §7.17): killEntity calls releaseTrapOnRemoval at maintenance.ts:174, before `free`, so the reserve still exists and goes to detritus. consumePrey calls it at contacts.ts:287. I grepped every entity free path: only killEntity, consumePrey and sample Take and Discard free a slot, and sample keeps the pair together.
- **Timer and cooldown:** trapStep.
  - The timeline is: armed at A, held at A + 1, 80 drains, released at A + 80, cooldown 0 at A + 380, caught again at A + 381. traps.test asserts it, and it matches D-0124 ("the next capture can come 301 ticks after release").
- **Ledger:**
  - computeTotals (ledger.ts:134-156) adds the reserve as a +0 term, and sampleTotals (sampleSlot.ts:210-211) does the same.
  - The rc1 saves stay Object.is-equal to the old formula (traps.test).
  - The fence and rc1-replay pass.
- **Sample** (SPEC §10.5 "trap + held prey"):
  - partnersOf includes both directions.
  - REF_COLUMNS gains the two trap pairs after the adhesion pairs.
  - LINK_REFS is now an explicit list of the fungal and adhesion pairs only.
  - HELD_REFS checks that each trap pair is mutual, birthIds included, from both rows.
  - Discard frees rows without killEntity, so there is no 'trapRelease' and the reserve is exported through sampleTotals.
- **Import** (D-0108, D-0124): phase5State.ts:64-72 and :220, :238-246 hold the four new refusals, each with its sentence.
  - "does not count yet" is dropped.
  - A held organism outside its owner's cell is not refused, as required.
  - The re-pinned phase5-import cases carry reason comments.
- **Determinism:**
  - No Math.random, Date, Map/Set or object-key iteration was added under src/sim. I grepped the + lines of the diff and both new files.
  - The gates are WeakMaps keyed on world.species (from the world's recorded species, not a build constant).
  - NEUTRAL with F03 recorded but not placed is byte-identical over 2,000 ticks (traps.test).
- **Tests are not vacuous:** the builder's tmp/e3-traps/mutants.log shows 15 mutants, each with its failing test: M1-M8, M10, M11, M12a-e and M13. I re-read the mechanisms these tests depend on, as listed above.

### e3-jacket: rules against the docs

- **Profile.jacket** (phenotype.ts:224-240, :408, :550) reads the world's recorded E11 params. E11.json matches SPEC §9 E11 and CT §7.1: 0.1, 0.005, 10, 0.2, 15, 1 and 3.
- **Request:** jacket.ts:87-112 checks, in order: noSilicate, held, energy (remaining ≥ 15, inclusive, per D-0124) and full (target 0.10 × current B). The amount is ≤ 0.005 × B0' × dt and is capped by the deficit and by the energy left. The 'held' skip is defensive, since E11 carriers and trap targets do not overlap.
- **requestMineral** (actions.ts:217-224) reserves energy only.
- **Mineral pass** (jacket.ts:137-218):
  - It reads one silicate snapshot and processes cells, then slots, in canonical order.
  - Each cell is scaled proportionally to its own headroom.
  - It charges 10 E per accepted mineral under 'construction' and returns the rest of each reservation.
  - A cell it pins to 0 records its dust in `roundoff.m`. The sign matches construction.ts's FILM_CAP pin and the ledger's `explained = … + roundoff` (ledger.ts:193-195).
- **Speed** (movement.ts:501-506): × (1 − 0.2c) only when the organism has E11 and a jacket, with c from handling.ts jacketCoverage. Every other organism keeps the old expression. NEUTRAL and the fence pass.
- **SPEC §9.19 reconcile** (births.ts:336-352): in the per-daughter loop after placement, a daughter without E11 drops her jacket as grit in her own cell. Nothing creates a jacket at birth.
- **The trap hooks:**
  - T1 is at births.ts:78 and :93.
  - T2 is at births.ts:366-370. It runs after `c.birthId[i] = b0`, so the held P04 names the retained daughter's new birthId.
  - The new daughter's slot gets only the columns written explicitly at births.ts:260-288, so she has no trap and no reserve, and the reserve is never duplicated.
  - T3 is at movement.ts:477-482. It is the only place a held organism could move. The other position writers do not move one: channel.ts eligibility excludes held organisms (line 153), parasites.ts:202 moves only riders, and commands, births and sample move only placements, newborns and transfers.
  - T4 is at actions.ts:131. T5 is at structures.ts:108-109.
- **Content check:** the build target and the coverage denominator are pinned equal to JACKET_COVERAGE_FRACTION, and the handling params to wave 12's constants (module-e11).

### Player-facing truth (these two tasks)

- Neither task changed a screen.
- The three events go only to the event ring; snapshot.ts was not touched by these tasks.
- "Caught in a trap." is never written to `limitCode`. org-ui derives it from `heldView`.
- trapView and heldView read only committed columns. `heldView.drained` is the owner's `intakeLastSecond`, which is the carbon actually drained.

### Manifest and versions

- No manifest, `implemented.ts`, schema, protocol, ledger-key or RNG-stream change in either task.
- The lead appends TRAP at integration. E11 waits for the organism flip.
