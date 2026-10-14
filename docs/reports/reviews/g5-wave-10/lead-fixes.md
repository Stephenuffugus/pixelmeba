# Wave 10 — lead fixes (integration fixer)

Date 2026-10-14. Nothing enabled: manifest and content untouched, contentHash unchanged
(67075b0e…5311). No schema or protocol bump. FENCE untouched (tools/fence-update.ts never run) and green.
Nothing staged, committed, stashed or reset. Every mutant was applied by hand to the uncommitted working
file, run, then restored from a scratch copy; `cmp` and md5 confirmed each source byte-identical afterwards.

## Items

### A1 channel eligibility — FIXED (tests only)
tests/sim/channel.test.ts:273–330, four unit checks, each of the form "held in A for 25 stage-2 ticks with
nextOrganismTick absent, then moved once the condition is lifted":
- `an E04-anchored B01 is never moved …; released, it is` kills **anchorState check dropped**.
- `a held B01 (heldBySlot ≥ 0) is never moved; let go, it is` kills **heldBySlot check dropped**.
- `a fungally linked Small organism (constructed link …) is never moved; unlinked, it is` kills **fungalDegree check dropped**.
- `a destination the organism cannot occupy (a stone at B) refuses it; cleared, it is moved` kills **destinationAccepts → true**.
Each mutant failed only its own test (1 failed / 5 passed of the filtered set). The anchored, held and
fungal states are labelled constructed test state: stage 2 alone never runs the anchor or trap machines,
and no shipped rule links a Small organism by a fungal link.

### A2 gate tally coefficient pair — FIXED (tests only)
tests/sim/gate-tally.test.ts:108–150. Each is one stage 2 from a field held only left of the line, so the
far side's gain is exactly the gate flux; a uniform decay in the same stage is divided out. All are relative 1e-12.
- `v01 through an S02 line in a dish that also holds an S01 (the viral pair)`: the dish also holds S01, so kRv ≠ kR. It also checks that no S01 gate tallies v01.
- `eStarch (half rate) through an S01 line`.
- `sugar through an S02 line beside film (the film-halved pair) … over 50 stages`.
Mutants:
- The named mutant `tallyFieldFlux(…, tc.kR, tc.kD, false)` fails all 3.
- `kR, kD, half` (viral pair lost) fails only the v01 test.
- `r, d, false` (half scale lost) fails only the eStarch test.
- `viral ? tc.kRv : tc.kR, … , half` (film halving lost) fails only the sugar-film test.

### A3 intake.ts throw — FIXED (test only)
tests/fixtures/shells-silicate.test.ts:129 `a shell builder in a world without the silicate field is refused loudly in stage 6 …`.
- Setup: a REG world with an A02 that has run 2 ticks; then its silicate field is deleted (constructed state). The registry and, now, the import both refuse it.
- `step` must throw exactly `/^stageIntake: shell builder A02 in a world without the silicate system$/`.
- Mutant m4 (the throw line removed) fails it: the step then dies with a TypeError at `silicate![cell]`, not the honest message.

### A4 grit vacuous half — FIXED (real assertion)
tests/fixtures/grit-dissolution.test.ts:157–201. The registry-vs-same-registry comparison is gone. A comment names the FENCE as the proof that a world without silicate plays as before. The new test:
- Runs a shipped-manifest world for 300 ticks with 5 killEntity deaths.
- After every tick: no grit or silicate field, and boundMineral and jacketMineral are 0 in every slot.
- At the end: computeTotals m === 0, and `dissolveGrit` leaves canonicalJson(serializeWorld) and fieldActive byte-identical.
- Control: the same comparison detects one dissolution in a grit dish (grit 1 − K, worked out by hand).

Mutants:
- dissolveGrit creating its fields lazily (`??= new Float64Array`) fails the test.
- killEntity's mineral branch taken at `mineral >= 0` fails the test.
- `markField('silicate')` in the gate's return survived. It is equivalent: fieldActive starts at 1 for every field, absent ones included (world.ts:245).

### A5 structure-determinism per-kind cases — FIXED (tests only)
tests/sim/structure-determinism.test.ts:200–296 (`linkedBase`, `LINKED_CASES`, `describe('severing, a basket move and a resin removal …')`). These are the verifier probe's six cases, written in the file's style:
- the S01 severs the fungal pair;
- the S01 severs an adhesion pair;
- closing the shutter severs the pair across it;
- moving the basket carries its pellet;
- removing the resin with bound activity, and the basket;
- removing the shutter.

Each case runs on both the paused and the queued path and checks:
- the effect itself (`linkBroken` event, object at the new cell, `exported` present);
- `linksValid`;
- totals unchanged, and Undo giving the pre-command hash;
- reload equal, and a second-generation reload equal;
- +300 equal;
- paused + 301 equals queued + 300.

Mutants:
- `severCrossedLinks` returning 0 fails the 3 severing cases.
- relocateObject skipped in moveDevice fails the basket case.
- `exported` never filled fails the resin case.

Note: removing the `geometryVersion++` in `bump()` **survives** both these cases and the probe. The caches also key on the store array's identity (`edgesRef`), and every command replaces the array, so a missing bump has no visible effect today. That is not a defect, but it means these tests do not guard the bump on their own.

### B6 channel organism wait bound — FIXED
src/persistence/phase5State.ts:165–169. After edgeStoreProblem, any S04 with `nextOrganismTick > s.tick + CHANNEL_ORGANISM_TICKS` is refused with "A one-way channel has an invalid organism wait." (parseSaveFile then adds " Nothing was loaded.").

Every writer of `nextOrganismTick`:
1. src/sim/channel.ts moveOrganisms: `e.nextOrganismTick = world.tick + CHANNEL_ORGANISM_TICKS`, in stage 2 of tick T. tick.ts:48 then advances the world to T + 1, so a saved wait is at most saved tick + 9.
2. deserializeWorld: copies an already-validated save.
3. No other src writer. `git grep nextOrganismTick -- src` finds only channel.ts and barriers.ts (type and import check). Commands never touch an S04 except to remove it (setDevice spreads only S03 shutters). Habitat content has no such key.

The bound is +10, one above the latest real value, so it can never refuse a real save.

Tests that set large waits:
- tests/sim/barrier-movement.test.ts:237 (1_000_000_000) never saves.
- tests/sim/world-stores-5.test.ts:52 (5) loads; it passed.
- tests/sim/barriers-table.test.ts calls edgeStoreProblem directly, so this rule does not apply to it.

Test: tests/persistence/phase5-import.test.ts:222 `a channel's organism wait more than CHANNEL_ORGANISM_TICKS past the saved tick is refused; the boundary loads`.
- At tick 500, waits 0, 509 and 510 load with equal hashes; 511 and 1e12 are refused.
- Mutant "bound removed" fails it, and so does mutant "`<` for `<=`" (510 refused).

### B7 recorded species/modules vs systems — FIXED
src/persistence/saveFile.ts:332–348, in the content section right after the implemented-module check. The import refuses (kind 'content'):
- every recorded species whose speciesSystemNeeds system is missing from the dish's manifest;
- every recorded module whose MODULE_SYSTEM_NEEDS system is missing;
- every species failing the new RESTING_DAUGHTER→DORMANCY pairing (item 10's helper).

Messages read "This dish's rules are inconsistent: A02 uses SHELL, which needs the silicate system, and the dish's rules do not include it. Nothing was loaded.". The module form is "… the extra ability "<name>" (E10) needs the film system …".

The verifier's probe-h.ts and probe-import.ts (h) now print REFUSED with that sentence.

Tests: tests/persistence/phase5-import.test.ts:433–487. Each has a loading control.
- A02 without silicate.
- X01 without parasites; F01 without fungi.
- E10 without film, with the film-using species removed so that only the module rule can fire.
- F04 without DORMANCY.

Mutants: removing the species check fails A02 and X01/F01; removing the module check fails E10; removing the pairing check fails F04.

The v1.0/rc1 corpus still loads: tests/persistence/ passed in full, and so did rc1-replay and g2-replay in the FENCE.

### B8 shell / jacket mineral on organisms — FIXED (jacket rule narrowed)
src/persistence/phase5State.ts:68–75, in organismProblem, which covers both living slots and held sample rows.
- `boundMineral > 0` requires the species' native SHELL: "An organism carries shell mineral although it cannot build a shell."
- `jacketMineral > 0` requires the dish to record the **silicate system**: "An organism carries jacket mineral although the dish's rules have no silicate."

Every writer of boundMineral:
- commands.ts:400 introduceOrganism, only `if (sp.abilities.includes('SHELL'))`;
- intake.ts:443, only when `shell` (shellSpecies = native SHELL);
- births.ts:267/293, halving the parent's (the daughter's species is the parent's, births.ts:257);
- sample.ts:225/299, a verbatim row copy that keeps the species;
- deserializeWorld.

No writer changes a living slot's species (births.ts:257 and commands.ts:382 are the only species writers).

Every writer of jacketMineral:
- births.ts:268/294 (halving);
- sample.ts verbatim copy;
- deserializeWorld.

Nothing creates jacket mineral: E11 is not in IMPLEMENTED_MODULES.

Why the jacket rule is narrowed:
- Today "requires E11" would be provably unreachable too.
- But once E11 lands, module loss at division can leave a jacket on a daughter without E11, and the rule would then refuse real saves.
- The silicate-system rule is unreachable both now and after E11 lands, because E11 needs silicate (MODULE_SYSTEM_NEEDS) and B7 enforces that.
- It is also exactly the condition that prevents the crashes: killEntity maintenance.ts:147 and contacts.ts:138 need the grit field, which exists if and only if silicate is recorded.

The verifier probes (a), (a2) and (b) now print REFUSED.

Tests: tests/persistence/phase5-import.test.ts:489–528.
- B01 with shell mineral, in a shipped dish and in a silicate dish: refused.
- A02 control: loads and round-trips.
- Jacket mineral: refused without silicate, loads with it.
- Held sample row with shell mineral and no ability: refused (the plain held row loads).

Mutants: disabling the bound rule fails the B01 and sample tests. Disabling the jacket rule fails the jacket test, and so does tightening it to "any jacket refused".

### C9 resting newborn habitat — FIXED
src/sim/crossing.ts:109–131.
- `restingNewbornHabitat` checks structure and substrate exactly as habitatCompatible does, without attachmentBits.
- entitySuitabilityAt uses it when `FLAG.restNewborn` is set and the organism is not Active.
- Every other organism takes the old path unchanged.
- Stage 4 (movement.ts:439), the inspector (snapshot.ts:486), experiments.ts:787 and pairedRun.ts:441 all go through this function. The wake condition `attachable` is untouched.

Tests in tests/fixtures/resting-daughter.test.ts:
- :315 `over 3,000 ticks she takes no habitat stress (health unchanged) and never wakes there`.
- :331 `the inspector's suitability reason for her is not SUIT_HABITAT; an adult F04 off any surface still gets SUIT_HABITAT` (the control).
- :348 `a save mid-rest on plain water loads equal and both continue equal`.
- :228 the existing `her surface removed …` test **changed by the ruling**. Before, she died of DEATH_STRESS after 100 s. Now her health stays at 20, her suitability stays 1, she stays Resting with wake conditions {food, moisture, environment true; attachable false}, and she dies of **DEATH_AGE** at tick 17,990–18,000 with energy left.

The header bullets were updated to match.

Mutants:
- Branch removed: fails :228, :315 and :331.
- Branch applied to every F04 regardless of the flag: fails the control :331.
- A per-world unsaved counter (the first 5 calls give SUIT_HABITAT): fails the round trip :348.

### C10 RESTING_DAUGHTER needs DORMANCY — FIXED
- src/sim/content/registry.ts:586–596 adds the exported `nativeAbilityPairingProblem`.
- It is called in the per-species record checks (registry.ts:261), and the error is on the species file, path `nativeAbilities`, naming both abilities.
- The import also uses it (B7).
- Test: tests/content/validator.test.ts:44. The shipped packs give no such error; F04 without DORMANCY gives exactly one error on content/species/F04.json.
- Mutant "check removed" fails it.
- `npm run content:validate` is clean and the hash is unchanged.

### C11 literal 0.1 — FIXED
- src/sim/constants.ts:170 has `SHELL_MINERAL_PER_BIOMASS = 0.1`, the same literal, so the same bits.
- src/sim/commands.ts:400 now reads `SHELL_MINERAL_PER_BIOMASS * b0` (import at line 9).
- markField(world, 'grit') was not added, as ruled.

## Checks run (this session)
- `npx tsc -p tsconfig.json --noEmit`: exit 0, no output.
- `npx eslint` on the 13 changed files (5 src, 8 tests): exit 0, no output.
- `npx vitest run tests/sim/channel.test.ts tests/sim/gate-tally.test.ts tests/fixtures/shells-silicate.test.ts tests/fixtures/grit-dissolution.test.ts tests/sim/structure-determinism.test.ts tests/fixtures/resting-daughter.test.ts tests/persistence/ tests/content/`: Test Files 33 passed (33), Tests 938 passed (938).
- Extra (the wave's neighbours): `npx vitest run tests/sim/dormancy.test.ts tests/fixtures/dormancy-native.test.ts tests/fixtures/parasite-x02.test.ts tests/fixtures/phage-v02.test.ts tests/fixtures/conservation-mineral.test.ts tests/sim/barrier-transport.test.ts tests/sim/barrier-transport-determinism.test.ts tests/sim/world-stores-5.test.ts tests/sim/barrier-movement.test.ts tests/sim/resin.test.ts tests/sim/climate-commands.test.ts`: 11 passed (11), Tests 100 passed (100).
- Extra: `npx vitest run tests/sim/siltworm-crossing.test.ts tests/sim/comparison.test.ts`: 2 passed, Tests 15 passed.
- FENCE: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts`: Test Files 8 passed (8), Tests 62 passed (62), 341.68 s.
- `npm run content:validate`: "content ok · contentHash 67075b0e4e53e3adaee23cf9d4c65f3045b007881b789351357311ed7f0e5311" (only the existing guide warnings).

The resting-daughter edit to the header comment came after the batch run. It is comment-only, and eslint was re-run on it.

## Files changed
- src: sim/commands.ts, sim/crossing.ts, sim/content/registry.ts, persistence/phase5State.ts, persistence/saveFile.ts.
- tests: sim/channel.test.ts, sim/gate-tally.test.ts, sim/structure-determinism.test.ts, fixtures/shells-silicate.test.ts, fixtures/grit-dissolution.test.ts, fixtures/resting-daughter.test.ts, persistence/phase5-import.test.ts, content/validator.test.ts.

## What I would have changed outside this list (not done)
- src/sim/channel.ts destinationAccepts repeats the resting-newborn habitat rule from crossing.ts (structure + habitatMask). One shared helper, e.g. in suitability.ts, would keep the two from drifting apart.
- src/ui/strings/modules.ts:234: e3-resters' proposal that the wake line show "Surface to hold". Since C9, a surfaceless resting daughter on water now reads ✓ environment, so that line matters more.

## PROPOSED DECISIONS
1. **Jacket mineral import rule = silicate system, not E11 in the genome** (B8). E11 is unimplemented and module loss at division will one day leave a jacket on a daughter without E11. The system rule is unreachable now and stays so, and it is the exact crash condition.
2. **Import refuses a dish whose own rules are internally inconsistent** (B7), with kind 'content' and the validator's rules: species and module system needs, and RESTING_DAUGHTER→DORMANCY. Material system needs were not added: the deposit command already refuses a missing field (commands.ts:276), so there is no crash.
3. **C9 consequence:** a resting daughter stranded on plain water with no surface now dies of age, not stress. The F04 test fixture records DEATH_AGE at about 1,800 s. The cause stays honest (D-0106).
4. **Structure caches keyed on array identity:** the reload-and-continue checks cannot detect a missing geometryVersion bump while every writer replaces the store array. A unit test asserting the bump per command kind would be needed to guard it, if the lead wants one.
