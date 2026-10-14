# Wave 10 stage 2 — e3-resters build report

Builder: e3-resters (port 4274, not used: no screen changes). Date 2026-10-14. Nothing is enabled (D-0104). B12, F04, P08, X02 and V02 are reached only through `resterRegistry()` (tests/helpers/world.ts). It uses allowUnimplemented because DORMANCY and RESTING_DAUGHTER are not in IMPLEMENTED_NATIVE_ABILITIES; the lead appends them at integration (D-0117). No schema, protocol or version change. No manifest or content edit.

## Checklist

### Build

1. **Native resters (B12, P08, F04): DONE, no new mechanism needed.** phenotype.ts gives every species with DORMANCY the NATIVE_DORMANCY rules, and dormancyStep runs them. Proven in tests/fixtures/dormancy-native.test.ts:
   - B12 timeline: Preparing at tick 200 (10 E), Resting 50 ticks later, 0.01 E/s, Waking 100 ticks after food returns (5 E), Active 50 ticks later with lockout 30.
   - Inhibitor damage while resting is × 0.10 (checked per tick against INHIBITOR_DAMAGE × exposure × dt × 0.1).
   - A resting B12 is captured by P01.
   - P08 follows the same timeline, with prey in reach as its food.
   - Round trips pass in Preparing, Resting, Waking and the lockout.

   No code fix was needed. The moisture observation is under "Observations for the owner".
2. **F04 resting daughter: DONE.**
   - Placement: fungi.ts is unchanged. fungalPlacement keeps wave 9's edge check in the PARENT's class (D-0114). Proof: resting-daughter.test.ts "20 seeds beside an S02 line" and "… S01 line" (food across the line, and a variant where the only attachable neighbour is across the line, which blocks the birth with DIV_BLOCK_PLACEMENT).
   - Commit (src/sim/births.ts):
     - `commitDivision` (line 315) calls `startRestingNewborn` (src/sim/dormancy.ts:330) after the reconciliation loop, so she gets LIFE_RESTING, zeroed state/dry/lockout timers, FLAG.restNewborn set, FLAG.restDry and FLAG.attached clear, halted motion, and limitCode RESTING_NEWBORN with value 0 written at once.
     - She keeps her post-cost half of every pool (no gift). The function throws if her profile has no resting rules, like dormancyStep does.
     - `stageBirths` (births.ts:202-206) skips `joinBranch` for her, so she is never linked, and gives the birth event the detail `{ resting: 1 }` (no `link` key). No rest event fires at birth.
   - Reason: dormancy.ts `restingCause` (line 164) returns RESTING_NEWBORN while the flag is set. readReason (line 177) and moduleView.ts dormancySummary's cause (line 154) both use it.
   - Waking: `WakeConditions.attachable` (dormancy.ts:100) is present only for a resting newborn (FLAG.restNewborn and not Active). It equals `canOccupy(world, sp, cell)` (line 122). The Resting clock requires `w.attachable !== false` (line 277).
   - Waking → Active clears FLAG.restNewborn in the same tick (line 295), with the usual 30 s lockout.
   - An adult F04 that rests through the ordinary trigger never gets the flag (test "an adult F04 entering rest …").
3. **Reason copy: DONE.**
   - `RESTING_NEWBORN` is appended at the END of REASONS (src/sim/reasons.ts:95).
   - Explore copy: "Resting since it formed." (src/ui/strings/reasons.ts:106).
   - Lab copy (line 144): "Resting since it formed; wakes after 10 s of food, moisture and a surface to hold, with energy ≥ 5 ({secs} s so far)."
   - SILICATE_LIMITED Lab copy (line 115): "Shell growth limited by silicate: {pct}." It uses the existing `pct` helper, so it reads "50 %", the same style as NUTRIENT_LIMITED.
   - tests/ui/reasons.test.ts passes.
4. **V02: DONE** (src/sim/viruses.ts).
   - `V02_FILM_MIN = 0.1` (line 55). VIRUSES gains `{ id: 'V02', field: 'v02', code: 2, filmMin }` (line 63).
   - `infectWith` (line 158) has an optional `filmMin`:
     - Without the film field it returns before any candidate.
     - It skips a host whose cell's film is below the minimum after the units check and before the draw. The draw is a pure hash, so no stream moves.
     - V01 passes no filmMin, so `film` is null and its loop is byte-identical.
   - Pass order is V01 first, then V02 (VIRUSES order).
   - `virusIdOfCode(2)` is 'V02', so saveFile.ts accepts an infected B02 exactly when V02 is in the dish. No persistence edit.
   - `isFieldVirus('V02')` is now true, so the inoculate command doses V02 units through `dosePhage` (proven).
5. **X02: DONE, parasites.ts unchanged.** tests/fixtures/parasite-x02.test.ts proves every listed behaviour with the generic code. X02 needed nothing.
6. **Not added:** glow clearing, A04 newborn modes, E11 jackets, held organisms and traps.

### Done when

- My five test files pass:
  - dormancy-native: 9 tests;
  - resting-daughter: 10;
  - phage-v02: 12;
  - parasite-x02: 9;
  - resters-determinism: 4.
- **The required existing suites: DONE, with one exception that is not mine.** The run covered:
  - tests/sim: dormancy, movement-births-tick, links, fungal-links, world-stores-5, modules, barrier-placement;
  - tests/fixtures: phage, parasite, fungal-branching, fungal-transport, film, host-specificity, relationships-film, relationship-matrix, blocked-division-proposal, module-e04, module-e12;
  - tests/ui/reasons;
  - tests/persistence/phase5-import and migration-schema5.

  The run gave 26 files and 303 tests; **1 failed**: tests/sim/world-stores-5.test.ts "4× equals 1× … on a world holding every store". It compares `world.gateTally`, which now gains entries and values during the run (stage 1 barrier-transport's gate tallies, src/sim/gateTally.ts). It **fails identically with my source files reverted to HEAD**: a scratch copy of the current tree with births/dormancy/viruses/moduleView/reasons/ui-reasons at HEAD gives "1 failed | 7 passed (8)". So it is not caused by this task; it is for barrier-transport or the lead.
- Also run and passing: tests/ui/narration-evidence, tests/sim/module-visuals, tests/fixtures/module-e09-e10, tests/fixtures/module-accounting, tests/sim/barriers-table, tests/sim/channel (6 files, 96 tests).
- `npx tsc -p tsconfig.json --noEmit` is clean. `npx eslint` is clean on every file I changed or created.
- **FENCE unchanged:** `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts` gives "Test Files 8 passed (8) / Tests 62 passed (62)". It ran on a tree that also held the stage 1 and e2-shells work in flight.

## Every state a resting daughter passes through

| State | lifeState | Flags | classOf | limitCode / reason | Wake conditions |
| --- | --- | --- | --- | --- | --- |
| Birth tick (stage 9) | RESTING (2) | justBorn, restNewborn (no attached, no restDry) | small | RESTING_NEWBORN, value 0 | attachable present |
| Resting | RESTING | restNewborn | small | RESTING_NEWBORN, value = seconds held | food, moisture, environment, **attachable** |
| Waking (5 s) | WAKING (3) | restNewborn | small | WAKING, seconds left | — |
| Active (from the tick the 5 s end) | ACTIVE (0) | restNewborn **cleared in that tick** | fixed (rule d) | DORMANCY_LOCKOUT (30 s) via dormancyReason | `attachable` absent |

Other properties throughout:
- She is never FLAG.attached and never linked: fungal degree 0, no linkFormed event, and the birth event's detail carries `resting: 1`.
- X02 cannot take her until she is Active, because validHost requires Active (proven).
- If her surface is removed, she stays RESTING with RESTING_NEWBORN, never gains energy, and dies. Her cell is not habitatCompatible for F04, so her suitability is 0 (SUIT_HABITAT) and stress damage at × 0.10 kills her: **DEATH_STRESS**, after 500 s from full health (100 s from the test's H 20). She does not starve. A resting daughter on a cell with a surface but no food would die of age before starving: F04 maxAge is 1800 s, and her about 30 E at 0.01 E/s would last about 3000 s.

## What each test proves, and the mutant that fails it

Mutants ran in a scratch copy of the tree (no edits to the shared tree), and each was reverted:

| Mutant | Failing tests |
| --- | --- |
| Daughter placed in her own (Small) class | resting-daughter "20 seeds beside an S02 line …" |
| FLAG.restNewborn not cleared on waking | resting-daughter: the waking test, the X02 test and "round trips at birth, mid-rest, mid-wake and right after waking" (the import refuses with "An active organism is marked as a resting newborn.") |
| Waking without the attachable check | resting-daughter "attachable is required on its own" |
| The daughter linked (joinBranch not skipped) | resting-daughter "Resting with FLAG.restNewborn, unattached, unlinked …" |
| V02 without the film gate | phage-v02: "film 0.10 … infects; just below never", "film 0.09 … never infected", "without the film field V02 never infects" |
| RESTING_NEWBORN inserted after RESTING_DRY instead of appended | all 6 g2-replay saves, all 5 rc1-replay saves, and tests/sim/dormancy.test.ts "the lockout reason refactor changes no outcome" |

The third row needs a note. With F04's content, `attachable` false always coincides with environment false: canOccupy for F04 is habitatCompatible, and suitability is 0 without it. So that test holds suitability at 1 and steps the state machine directly, which proves the condition is required on its own.

The other tests prove:

- **dormancy-native:** the machine's numbers for B12 and P08 (timeline and costs to the tick, rest upkeep, × 0.10 inhibitor damage, still prey), the moisture observation, and save round trips in every state.
- **phage-v02:**
  - the record and table entry;
  - the exact film threshold (0.1 infects; 0.09999999, 0.09 and 0 do not), over one pass and over 600 ticks;
  - lysis 200 ticks after infection into 28 v02 units from B 0.7, with the rest and all N going to detritus;
  - disjoint pools (each host takes a unit only from its own field, even with film on the B01 cell);
  - v02's neighbour gain is exactly 0.5 × v01's after one tick;
  - inoculate doses V02;
  - closed-lid conservation over 10,000 ticks with both viruses: worst relative error C 1.110e-14, N 6.463e-14, with 31 B01 and 12 B02 lyses;
  - an infected B02 round-trips through its lysis;
  - the import refuses infectedBy 2 in a shipped dish: "An organism is infected by a virus this dish does not have."
- **parasite-x02:**
  - hosts are Active F02/F04 only (not F01, not a resting F04);
  - X02 is released alive one tick after its host enters Preparing, and on host death;
  - the exact 0.0015 C per tick drain with the 50/30/20 split, +30 E per C and no O2;
  - X02 keeps its host's position along a linked F02 line while carbon moves along it;
  - its habitat is gel or sediment only (water gives suitability 0 with SUIT_HABITAT);
  - a host below 0.25 B0' dies with DEATH_PARASITE_DRAIN;
  - an attached pair round-trips.
- **resters-determinism:**
  - run(400) equals 4 × run(100) (stateHash and the 'full' digest);
  - saved at tick 121 (first-batch daughters Waking, second batch Resting), loaded and run to 3,000, it equals the uninterrupted run;
  - closed lid over 10,000 ticks: worst relative error C 6.052e-15, N 6.695e-14; absolute C 3.638e-11, N 7.617e-11;
  - NEUTRAL: invariants on a shipped dish of B01, B02, F01, F02, X01 and V01, with 1× = 4×.

**NEUTRAL, byte-level, done by hand:** a scratch copy of the current tree with my six source files at HEAD, against the current tree, running the same B01/B02/F01/F02/X01/V01 dish for 2,000 ticks. stateHash, trajectoryDigest 'full' and the sha256 of the serialized entity columns plus fields are identical at ticks 500, 1000, 1500 and 2000 (for example, tick 2000: `5b4c69f7617753e5`, entities+fields `ccc6e246…0f0df7e3`, 384 births).

## Observations for the owner

- **Moisture (D-0117 contradiction 2, numbers from CT):**
  - B12, F04 and P08 have moisture minimum 0.2. With the shoulder 0.2, moisture suitability is 1 − (0.2 − m)/0.2 for m < 0.2. At drying's floor 0.1 that is **0.5**, above DORMANCY_DRY_SUITABILITY 0.20. So drying alone never makes them rest dry. The test holds m = 0.1 for 400 ticks: dryTimer stays 0.
  - The dry trigger does fire for an E03 B01 (minimum 0.4): suitability falls below 0.2 once m < 0.4 − 0.8 × 0.2 = **0.24**. On drying gel set to 0.25, m crossed 0.24, Preparing followed 99 ticks later (10 s counted from the first dry tick), then RESTING_DRY.
  - The guide text of B12, F04 and P08 says each rests after "10 seconds too dry", which this rule set cannot produce. This is an owner flag.
- **No species lists P08 as prey (CT §3.2).** "Still prey while resting" is shown on a resting B12 captured by P01.
- **A resting daughter without a surface dies of stress** (SUIT_HABITAT at × 0.10), not of starvation, because her suitability counts the attachment surface.

## Proposed decisions

- **PROPOSED DECISION:** while a resting newborn is Resting or Waking, her suitability's habitat factor should be her habitat only (substrate and structure), not her attachment surface. Attachability would then be judged only by the wake condition (D-0106 "attachability is part of waking").
  - Reason: today a daughter the S04 channel moves onto plain water takes SUIT_HABITAT stress and dies after 500 s. That makes the channel's "a resting newborn needs only her habitat" (channel.ts destinationAccepts) a death sentence rather than a drift, and makes `attachable` redundant with `environment` for F04.
  - It touches suitability.ts / crossing.ts entitySuitabilityAt. These are not my files and are not changed. Owner or lead call.
- **PROPOSED DECISION:** content validation should require DORMANCY whenever RESTING_DAUGHTER is listed. `startRestingNewborn` throws without resting rules, the same as dormancyStep does for a non-Active organism without them.
- **PROPOSED DECISION:** the inspector's wake line (src/ui/strings/modules.ts:234, not mine) should show "Surface to hold" when `d.wake.attachable` is defined. Today a surfaceless resting daughter reads ✓ ✓ ✓ with "held 0 of 10 s". I would add this in wave 11 org-ui / structure-ui.

## Files

Changed:
- src/sim/dormancy.ts: WakeConditions.attachable, restsAtBirth, isRestingNewborn, restingCause, startRestingNewborn, and the flag cleared on waking.
- src/sim/births.ts: the resting daughter's commit, no link, the birth detail.
- src/sim/viruses.ts: V02, V02_FILM_MIN, the film gate.
- src/sim/moduleView.ts: cause and the wake type only.
- src/sim/reasons.ts: RESTING_NEWBORN appended.
- src/ui/strings/reasons.ts: RESTING_NEWBORN Explore and Lab copy, SILICATE_LIMITED Lab copy.
- tests/helpers/world.ts: new `resterRegistry()` and `paintRect()` only.

Created:
- tests/fixtures/dormancy-native.test.ts
- tests/fixtures/resting-daughter.test.ts
- tests/fixtures/phage-v02.test.ts
- tests/fixtures/parasite-x02.test.ts
- tests/sim/resters-determinism.test.ts
- this report

Not changed: fungi.ts, parasites.ts, edgePassage.ts, implemented.ts, the manifest and content.

## Bugs noticed elsewhere

- tests/sim/world-stores-5.test.ts "4× equals 1×" fails on the current tree independent of this task. The gate tallies now evolve during the run, and the test's gateTally expectation is the stored literal. This is for barrier-transport or the lead: the test's expectation needs the same 1× = 4× comparison the lead applied to warmth in D-0116.
- In this environment `grep` from the shell resolves to a wrapper that fails ("claude native binary not installed"). `/usr/bin/grep` works.
