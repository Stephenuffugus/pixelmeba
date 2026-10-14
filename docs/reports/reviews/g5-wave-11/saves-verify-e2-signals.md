# Wave 11 e2-signals: saves and determinism verification

Verifier: saves/determinism lens (adversarial). Run on 2026-10-14 against the uncommitted tree, which also holds the other wave 11 builders' work. I edited no tracked file except this report. The probes are in tmp/verify-saves-g5-wave-11-1/ (probe.test.ts, vitest.config.ts, *.log).

**Result: ok.** There is no BLOCKER and no MAJOR. There are two MINOR findings.

## Problems (most severe first)

### MINOR 1: the 'rest' glowOff event depends on slot order

- **Where:** [e2-signals] src/sim/signals.ts:126 (clearGlow), called from src/sim/dormancy.ts:252.
- **What is wrong:**
  - A glowOff with why 'rest' takes its `detail.sensed` from the *live* S_GLOW field in the middle of the stage 8 slot loop.
  - Emitters in lower slots have already added to that field in the same stage.
  - So the recorded value depends on slot order. The stage-start value is already in the scratch at that moment, because stage8Senses ran before the loop.
  - The glow state itself is not affected. The value is not hashed, and it saves and reloads identically, so this is not a determinism break.
  - It is still an observable record that later readers will use (the event feed, the P5.6 measures). It goes against the stage-start rule of SPEC §3.3, which the builder applied everywhere else.
- **Repro (probe D):**
  - Setup: a B09 kept in the same cell as an E02+E03 B01. Before stage 8 each tick, a hook moves the B09 onto the B01, sets the B09's E to 90, and holds S_GLOW at 0.31 in the B01's cell.
  - The B01 enters Preparing at tick 199 in both runs.
  - B09 in the lower slot (B09 slot 0, B01 slot 1): the glowOff ('rest') records sensed 0.312.
  - B09 in the higher slot (B01 slot 0, B09 slot 1): it records sensed 0.31.
- **Fix:** dormancy.ts passes the stage-start sensed value, or clearGlow defaults to the scratch value when the scratch is stamped with this tick. Births (stage 9) may keep the live read, because stage 8 is complete by then.

### MINOR 2: proposed decision 9 misdescribes dead slots

- **Where:** [e2-signals] docs/reports/reviews/g5-wave-11/e2-signals-build.md, "Proposed decisions" 9.
- **What is wrong:**
  - The report says "A dead slot keeps its last glow state until reuse".
  - In the code, `EntityStore.free` clears every column (src/sim/entities.ts:338–343 clearSlot).
  - The import refuses a dead slot that holds glow state, with "An empty place in the dish holds organism state. Nothing was loaded." (probe C).
  - The code is right and only the wording is wrong. If D-0119 copies this sentence, it would mislead the later readers.
- **Repro:** probe C, case `deadSlotGlow`.

## Verified OK

### FENCE and the builder's save tests

VERIFIED OK — FENCE and saves — I ran these 7 files in one go with `--maxWorkers=1`:

- tests/sim/glow-saves.test.ts
- tests/sim/signals-determinism.test.ts
- tests/fixtures/rc1-replay.test.ts
- tests/fixtures/g2-replay.test.ts
- tests/fixtures/determinism.test.ts
- tests/persistence/phase5-import.test.ts
- tests/persistence/migration-schema5.test.ts

Result: 7 files and 87 tests passed in 360 s (tmp/verify-saves-g5-wave-11-1/fence.log). So:

- the g2 saves and the rc1 corpus (D-0101) still load and continue bit-identically;
- the builder's 1× and 4× DishHost test passes;
- run(400) equals four run(100);
- the save at tick 777 reloads and runs on to 3,000 identically;
- the closed-lid conservation test over 10,000 ticks passes.

### Probe A: save and reload around every transition

VERIFIED OK — saves at awkward moments (probe A, 179 s).

- **The dish:** 12 B09, 6 E02 carriers (3 of them with E03) on a sugar patch that runs out, 4 B13 on gel with 8 B01/B10/B11 targets, S_GLOW, quencher, RIVAL and film patches. It runs for 1,300 ticks.
- **Transitions the run reached:**

  | Transition | Tick |
  |---|---|
  | glowOn | 50 |
  | glowOff 'rest' (a glowing carrier enters Preparing) | 378 |
  | rest | 428 |
  | death | 489 |
  | glowOff 'energy' | 522 |
  | mid-dwell | 1 and 483 |

- **Checkpoints:** the tick before, the tick of and the tick after each transition, plus the two mid-dwell ticks. That is 18 checkpoints.
- **At every checkpoint:** I saved through serializeWorld, JSON and deserializeWorld, and ran on to 1,300.
- **At the 6 transition ticks themselves:** I also saved through the real buildSaveFile and loadSaveFile, which runs the D-0108 import checks.
- **Results:**
  - Every reload had the same stateHash at load.
  - Every reload matched the uninterrupted run at 1,300 on stateHash, the 'full' trajectory digest, the whole energy ledger, the event ring, event totals and nextEventId.
  - The energy ledger matters here because it is not hashed. `energy.signal` was 373.7 at 1,300 and survived every reload exactly.
- **Invariant checked every tick:** no organism was glowing while not Active, at any tick boundary.

### Probe B: a held sample of glowing organisms

VERIFIED OK — a held sample containing glowing organisms (probe B).

- After 60 ticks, two organisms glow (a B09 and an E02 B01). A sampleTake ('all', radius 1) takes 7 items, and 2 of the held rows have glowState 1.
- buildSaveFile, then loadSaveFile: the import accepts it and the stateHash is equal.
- Both worlds then do sampleTransfer (dx 20) or cancelSample, and run 300 ticks. They stay identical on hash, digest, energy ledger and events.

### Probe C: crafted bad glow states

VERIFIED OK — the import refuses each crafted bad glow state. Every message ends "Nothing was loaded." (probe C).

| Case | Message |
|---|---|
| glowState 1 on a B01 without E02 | "An organism is glowing although it cannot glow. Nothing was loaded." |
| glowDwell 0.1 on a non-glower | "An organism is glowing although it cannot glow. Nothing was loaded." |
| glowState 1 while Preparing | "An organism is glowing although it is not active. Nothing was loaded." |
| glowState 2 | "An organism has an unknown glow state. Nothing was loaded." |
| glowDwell −0.1 | "An organism's glow timer is negative. Nothing was loaded." |
| glow left on a freed slot | "An empty place in the dish holds organism state. Nothing was loaded." |

A valid glowing B09 with dwell 2.5 is accepted.

### Code checks (no probe needed)

- **No new saved state.** VERIFIED OK.
  - glowState and glowDwell are existing schema 5 columns (serialize.ts:204). They are hash-neutral while empty under the D-0035 rule (entities.ts:216–219, serialize.ts stateHash) and hashed by name once used.
  - The two scratches are WeakMaps keyed by the world: `sensed` in signals.ts and the target mask in rivalry.ts. Both are stamped with the tick, rewritten on every stage8Senses call, never saved and never iterated.
  - stageStartSensed and rivalTargetNear throw if they are read on a tick their scratch was not built for. A reloaded world rebuilds both from the same state, and probe A confirms the result is identical.
- **Every non-Active state comes through dormancy.ts.** VERIFIED OK.
  - The only writers of lifeState are dormancy.ts (lines 250, 262, 285, 293, 319, 338), births.ts:271 and commands.ts:393.
  - The only Active → non-Active step is dormancy.ts:250, which clears glow in the same branch.
  - glowThresholds clears it again for any non-Active glower.
  - births.ts:310 resets both daughters, and allocate and free clear every column.
- **v1.0 worlds keep their ruleset.** VERIFIED OK.
  - stage8Senses returns at once unless the world records 'signals' or 'rivalry'.
  - No v1.0 profile has glow or rivalry rules.
  - The RIVAL term in inhibitorExposure needs `sp.rivalTarget` and the RIVAL field. The field is allocated only by the 'rivalry' system, which no v1.0 world records.
  - The rc1 and g2 replays pass. The builder's glow-saves rc1 test shows that `energy.signal` is filled with 0 and the hash is unchanged.
- **Ledger.** VERIFIED OK.
  - Emission and glow are charged to `energy.signal`, and RIVAL to `secretion`.
  - Neither moves C, N or mineral; the builder's closed-lid test over 10,000 ticks passes in my run.
  - The energy ledger is saved whole and survives reload exactly (probe A).
- **No simulation randomness.** VERIFIED OK.
  - signals.ts, rivalry.ts and the changed lines in secretion.ts, suitability.ts, chemistry.ts, phenotype.ts, species.ts, births.ts and dormancy.ts draw no randomness at all.
  - None of them uses Math.random, Date, performance.now, or iterates a Map, Set or object keys.
- **The `secreting` column.** VERIFIED OK.
  - The emitter bits 8 and 16 fit its u8 type.
  - It is hashed as before, and no import rule restricts its value.
  - It is written only in stage 8, and only for organisms with glow or rivalry rules.
- **Events.** VERIFIED OK.
  - glowOn and glowOff go into the saved event ring, which is not hashed.
  - The import does not check event types, so older builds' rings and new rings both load.
  - The ring, totals and nextEventId survive reload exactly (probe A).
- **Mutant 4 sentence.** VERIFIED OK. The builder quotes "An organism is glowing although it is not active." Probe C reproduces the same refusal from a crafted Preparing glower: "An organism is glowing although it is not active. Nothing was loaded."

## Not covered by my probes

The builder's glow-saves tests cover these, and they pass in my run:

- the off-dwell 'signal' glowOff;
- the 'division' glowOff, which did not occur in probe A's dish within 1,300 ticks.
