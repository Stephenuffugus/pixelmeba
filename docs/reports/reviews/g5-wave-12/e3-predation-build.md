# Wave 12 e3-predation: build report (P5.5, the predation half)

**Status:** everything in Build and "Done when" is done. The FENCE is unchanged. There are no NEEDS lines. e2-light-algae's item 0 (the constants and the event types) and its hooks H1, H2 and H3 were all present at compile time and are used as written.

**Lead action at integration:** append `DETRITUS_FALLBACK`, `HANDLING` and `RADIUS_CAPTURE` to `IMPLEMENTED_NATIVE_ABILITIES` in src/sim/content/implemented.ts. After that, the vi.mock blocks in my three save and import test files (each marked "Wave 12 (e3-predation)") become no-ops and can be removed.

## Checklist

### Build

1. **DONE: src/sim/handling.ts (new).**
   - `jacketCoverage` (handling.ts:42) and `handlingNeedOf` (:51): 1 + 3c for a jacketed prey, otherwise the prey's contactSeconds.
   - `handlingSpecies` and `radiusCaptureSpecies` (:74, :79): WeakMap tables keyed on `world.species`. Each is null when no predator in the world has the ability.
   - `startAttempt` (:87) and `endAttempt` (:109). `HANDLING_EPS` is 1e-9 (:36).
   - Proved by tests/fixtures/handling.test.ts.

2. **DONE: the claim loop in contacts.ts `predationContacts` (:69).** See "The claim loop as built" below.
   - 2a. Radius capture uses `reach2` (:100). Proved by tests/fixtures/radius-capture.test.ts.
   - 2b. The rest, hunger and continue steps are at :89, :96 and :103; `continueAttempt` is at :194; the start step is at :141–147. Proved by handling.test.ts.
   - 2c. Resolution goes through one pool, `claim` (:177). Commits are at :156–168. `endTakenAttempts` (:223) closes the losers. Proved by handling.test.ts "two P10 completing …" and the invariant helper.
   - 2d. A handled capture's event gets `detail.handled` (consumePrey :233, :266). Every other capture event is byte-identical. Proved by handling.test.ts "captures a P01 on exactly the 10th …" (`toEqual` on the detail).
   - 2e. The cooldown is set only in `consumePrey` (:254). Proved by handling.test.ts "a break resets …" (cooldown 0 after the break, 6 at the capture) and the "rest" test.

3. **DONE (no code): a held predator still captures.** Proved by handling.test.ts "a held P04 (the trap pair set by hand) still captures a B01 in contact (D-0106)", under a registry enabling F03 with allowUnimplemented.

4. **DONE (tests only): P07.** Proved by tests/fixtures/predators-p5.test.ts.

5. **DONE: P09's fallback.**
   - The only behavioural change is in phenotype.ts:563: `debrisFeeder: debrisFeeder || sp.abilities.includes('DETRITUS_FALLBACK')`. The Profile doc comment at :217 was updated too.
   - debrisFeeder.ts got a new header naming P09's native fallback and explaining why it is never presented as E08.
   - Proved by tests/fixtures/detritus-fallback.test.ts.
   - moduleNotes.ts only tries E08's eligible ancestors, and P09 is not among them. moduleView.ts only covers carried modules. The debris granule needs `CUE2_MOD_E08` and `CUE2_DETRITUS_INTAKE` (render/features.ts:145). So none of them describes P09's intake as E08. The inspector chip now says "Eating detritus" for P09, which is honest.

6. **DONE: the import rules.** phase5State.ts organismProblem :69–76. See "Import rules" below. Proved by tests/persistence/handling-import.test.ts.

7. **DONE: the events.** `handlingStart` and `handlingBreak` (events.ts, from e2-light-algae) stay in the ring only. snapshot.ts visualEvents is a whitelist and was not touched.

### Done when

- **DONE: my seven test files pass.**
  - radius-capture: 9 tests
  - handling: 14 tests
  - detritus-fallback: 6 tests
  - predators-p5: 6 tests
  - handling-saves: 9 tests
  - predation-determinism: 5 tests
  - handling-import: 12 tests
- **DONE: the regression list passes.** Run together with six of my files (27 files, 230 tests):
  - tests/fixtures: predation, predation-matrix, module-e08, relationship-matrix, relationships-w2, host-specificity, shells-silicate, conservation-mineral, finite-feeding, fair-shared-food
  - tests/sim: barrier-contacts, capture-roundoff, movement-births-tick, feeding, lineage-host
  - tests/persistence: phase5-import, stale-prey, migration-schema5, adhesion-import
  - tests/worker: sample-transaction, protocol3
- **DONE: `npx tsc -p tsconfig.json --noEmit`** gives 0 errors on the final tree.
- **DONE: `npx eslint`** is clean on every file I changed or created.
- **DONE: the FENCE is unchanged:** 10 files, 77 tests passed (details below).
- **DONE: the stage 5 timings** are below.
- **N/A: E2E.** This task changes no screen, so no journeys ran and port 4272 was not used.

## Files

**Created:**
- src/sim/handling.ts
- tests/fixtures/radius-capture.test.ts
- tests/fixtures/handling.test.ts
- tests/fixtures/detritus-fallback.test.ts
- tests/fixtures/predators-p5.test.ts
- tests/sim/handling-saves.test.ts
- tests/sim/predation-determinism.test.ts
- tests/persistence/handling-import.test.ts
- this report
- scratch under tmp/e3-predation/: stage5-timing.ts, mutant.sh and the logs

**Changed:**
- src/sim/contacts.ts: `predationContacts`, the new `claim`, `continueAttempt` and `endTakenAttempts`, consumePrey's optional `handled` parameter, and the header.
- src/sim/phenotype.ts: the debrisFeeder line and its doc comment.
- src/sim/debrisFeeder.ts: header and comments only.
- src/persistence/phase5State.ts: organismProblem, the handling-progress lines only.

I did not edit movement.ts, intake.ts, births.ts, species.ts, events.ts, constants.ts or implemented.ts.

## The claim loop as built (contacts.ts predationContacts)

**Gates.**
- `handlers = handlingSpecies(world)` and `radius = radiusCaptureSpecies(world)` are WeakMap lookups on `world.species`, built once per species table. Each is null unless the world's recorded species include a predator with HANDLING or RADIUS_CAPTURE.
- When both are null (every v1.0 and shipped world), each check below short-circuits on a local null test. The loop reads exactly the columns HEAD read, in the same order, with the same float expressions:
  - `reach2` equals `contact2`, which is `CONTACT_DISTANCE²`.
  - `claim()` is HEAD's priority code moved into a function.
  - The commit calls `consumePrey(world, i, prey)` with `handled = 0`, which gives the same detail object, keys in the same order.
- No new column is read and no float operation is added. The NEUTRAL test and the unchanged FENCE prove this.

**Per slot, in ascending slot order:**

1. `alive` is checked. Then, only if `handlers !== null`: a non-Active handler with `handlingNeed > 0` calls `endAttempt('rest')`. Then the HEAD check `lifeState !== 0 → continue`.
2. `isPredator` and `profileOf`, then `hungryPredator`. A handler that is not hungry calls `endAttempt('hunger')`; this is a no-op without an attempt.
3. `reach2` is `RADIUS_CAPTURE_DISTANCE²` (1.0) for a RADIUS_CAPTURE predator and `CONTACT_DISTANCE²` for every other predator.
4. A handler with an open attempt goes to `continueAttempt`, which checks only its own target `t = preySlot`, in this order:
   - (a) `t < 0`, `!refValid(t, preyBirthId)` or `!preyAllowed`: `'target'`.
   - (b) Centre distance² on positions after stage 4 `> reach2`: `'contact'`.
   - (c) With edges, `!pairPermitted(own cell, t's cell, classOf(i), classOf(t))`: `'target'`. Within reach, the cells are always neighbours.
   - Otherwise `handlingProgress += DT`. If `progress ≥ need − 1e-9` it returns true and the predator enters `claim()` as a completing claim with the ordinary priority `det(seed, 'contact', tick, KIND_ATTACK, birthId)`.
   - A false return means no further selection for this predator this tick, so no new attempt starts on a break tick.
   - The cooldown is not checked for an open attempt. An attempt can only be open while the cooldown is 0, because the cooldown is set only at a capture, which ends the attempt.
5. Otherwise HEAD's path runs: cooldown, then the ±1 cell scan with `preyAllowed`, `pairPermitted` for both classes, distance² `≤ reach2`, nearest first, ties to the lower birthId. For a handler, the chosen prey's `need = handlingNeedOf`:
   - `need ≤ 0` is an instant `claim`.
   - `need > 0` calls `startAttempt` (progress = DT). It claims this tick only if `DT ≥ need − EPS`.
6. If nothing claimed, the function returns, after `endTakenAttempts` when any attempt exists.
7. The commit runs in ascending predator slot order. Only the winner per prey (`bestClaimant`) commits, and only while both are alive.
   - A handler with need > 0 calls `consumePrey(…, handled = need)` and then `endAttempt('capture')`, which emits no event.
   - Every other predator calls `consumePrey` as before.
8. `endTakenAttempts` (only when there was an attempt): every living handler still holding an attempt whose target reference is no longer valid, or whose progress is at or past its need, ends with `'taken'`. The loser of a simultaneous completion keeps no progress and gets no cooldown.

**Tick-boundary invariant** (asserted in handling.test.ts with `expectInvariant`; refused otherwise by the import):
- `handlingNeed > 0` implies `0 < handlingProgress < handlingNeed` and `preySlot ≥ 0` (the reference may be stale).
- `handlingNeed === 0` implies `handlingProgress === 0`.

## The attempt state machine

| From | Event / condition | To | Event emitted |
|---|---|---|---|
| no attempt | Active, hungry, cooldown 0, nearest prey in reach with need > 0 | open (need sampled once; progress 0.1; preySlot = prey) | `handlingStart` (cause PRED_HANDLING_IN_PROGRESS; detail prey, preySpecies, need) |
| no attempt | same, but need ≤ 0, or need ≤ one tick | instant claim (capture if it wins) | `capture` |
| open | target valid and in reach | progress += 0.1 | none |
| open | progress ≥ need − 1e-9 and wins the pool | captured; need = progress = 0; cooldown from consumePrey | `capture` with detail.handled = need, plus the prey's `death` |
| open | progress ≥ need − 1e-9 but another claimant won | need = progress = 0 | `handlingBreak` why 'taken' |
| open | target taken this stage by another claimant | need = progress = 0 | `handlingBreak` why 'taken' |
| open | target slot −1, stale, not allowed, or behind a refusing edge | need = progress = 0 | `handlingBreak` why 'target' |
| open | target valid but out of reach | need = progress = 0 | `handlingBreak` why 'contact' |
| open | not hungry (E ≥ 80 or meal ≥ 0.5 B0) | need = progress = 0 | `handlingBreak` why 'hunger' |
| open | not Active (seen at its next stage 5) | need = progress = 0 | `handlingBreak` why 'rest' |
| open | divides in stage 9 (H2, births.ts, e2-light-algae) | need = progress = 0 on the retained slot; preySlot kept | `handlingBreak` why 'division' |

Every break keeps preySlot, so the predator keeps pursuing. Movement cancels an invalid target at its next stage 4, and H1 stops re-acquisition only while an attempt is open. A break never starts a cooldown.

## Import rules (phase5State.ts organismProblem, after the handlingNeed lines)

| Condition | Sentence (the caller appends " Nothing was loaded.") |
|---|---|
| `handlingProgress < 0` | "An organism's handling progress is negative." (new; saveFile.ts's nonnegative list did not cover this column) |
| `handlingProgress ≠ 0` without HANDLING | "An organism is handling prey although it has no handling ability." (the existing sentence) |
| `handlingNeed === 0` and `handlingProgress ≠ 0` | "An organism's handling has no attempt." |
| `handlingNeed > 0` and `handlingProgress ≥ handlingNeed` | "An organism's handling is already complete." |

- Held sample rows pass through the same function and get the prefix "The held sample cannot be loaded. ".
- A stale prey reference with need > 0 still loads.
- `git grep handlingProgress` at HEAD finds no writer in v1.0 code, so the rc1 and g2 corpora are unaffected. rc1-replay and g2-replay pass.

## What each test proves (each was checked by a hand mutant, then reverted)

### Mutant → failing tests

| Mutant | Failing tests |
|---|---|
| P06 radius 0.5 | radius-capture: 6 failing ("0.9 … 1.0 …", "diagonal … corner", "S01 …", …) |
| radius capture for every predator | radius-capture "radius capture belongs to RADIUS_CAPTURE only: a P07 (and a P01) at 0.9 does not capture" |
| a radius claim across an edge (pairPermitted skipped for reach 1) | radius-capture "never captures across an S01 edge …" |
| completion on the 9th tick | handling: 8 failing (10th tick, P05 40th, jacket 25th/40th/14th, …) |
| no reset on a break (out of contact does not end the attempt) | handling "a break resets …" and "raising the jacket mid-attempt …" |
| c resampled every tick | handling "raising the jacket mid-attempt keeps the need …" |
| a cooldown after a break | handling: 4 failing ("a break resets …", "rest …", "jacket …", …) |
| the loser keeps its progress (endTakenAttempts no-op) | handling "two P10 completing on one P01 together …" |
| completions committed outside the claim pool (a completing handler overrides bestClaimant) | handling "two P10 completing …" (the winner differs from the det priority) |
| P09 without the flag (phenotype line removed) | detritus-fallback "requests exactly …" and "the amount equals the pre-wave-12 field route …" (the cue differs) |
| each of the four import refusals removed | handling-import: its living-slot case and its held-row case (2, or 4 for "already complete") |

**Not run: "P09 taking both routes in one tick".** The meal-first order and the single route live in intake.ts, which e2-light-algae owns and was editing at the time. A backup-and-restore mutant there could have overwritten their in-flight edits. The tests that would catch it are "with a held meal it digests the meal only: the detritus is untouched", "on a capture tick the meal route wins …" and "never more than one budget".

### Per file

**radius-capture:**
- Captures at 0.9 and at exactly 1.0; not at 1.0001.
- A diagonal neighbour at 0.99 is captured. A P06 at a cell corner, and at (64.999, 64.999), captures at exactly 1.0 along ±x and ±y, plus a 24-angle ring at 0.999.
- B02 and B13 are never captured.
- No capture across an S01 or an S02; captured without the edge.
- The corner rule for every one of the four L-path edges, with a control edge elsewhere.
- Cooldown: 31 stage-5 calls, i.e. 30 decrements.
- Never moves in 600 ticks.
- Meal cap 6 with 0.4 to detritus and the ledger exact; no hunting at meal 1.5.
- P06 against P01 over 12 seeds × both slot orders: the winner always equals the det priority's choice, and both P06 and P01 win at least once.
- P07 and P01 at 0.9 never capture.

**handling:**
- The 10th tick and not the 9th; the event fields; progress 0.1 at the start; the capture detail `{prey, preySpecies, handled: 1}`.
- P05 on the 40th tick. Jacket on the 25th, 40th and 14th ticks, plus jacket 0.8 clamped to c = 1 (40th tick), with the ledger exact for mineral.
- Raising the jacket mid-attempt keeps 2.5; after a break the new attempt is 4.
- A break at 0.6 ('contact'); the renewed attempt starts at 0.1 and needs 10 more ticks; cooldown 0 after the break and 6 at the capture.
- The prey moved every tick of the attempt.
- H1: the target is kept while a nearer P02 sits there through decision ticks.
- Death of age gives 'target'. Slipping across an S02 gives 'target'.
- E 85 gives 'hunger' with progress 0.4. Leaving Active gives 'rest'.
- Two P10 completing together (6 seeds × 2 slot orders): one winner equal to the det priority; the loser ends 'taken' with progress 0 and cooldown 0; the winner's cooldown is 6; each slot wins at least once.
- No material moves before the capture: fields, B, N, meal and mineral are byte-equal to a same-cells dish 0.7 apart, and totals are equal. At the capture the meal equals the prey's B and the totals are preserved.
- The CUE3 handling bit is set on ticks 1–9 and cleared after the capture.
- A held P04 captures.

**detritus-fallback:**
- The exact closed form `min(0.5, 0.85 × suit × 0.1 × avail)` and ≤ one budget, with conversion: bound N 0.15 per C carried, 0.05 kept, 0.10 freed; B 0.5; CO2 0.3; metabolite 0.2; O2 −0.3; 30 E per C.
- Over 5 ticks at 3 detritus amounts against a "HEAD" dish (P09's runtime record without DETRITUS_FALLBACK, i.e. the old field route): every field byte-equal, and B, N, E, x and y equal (`Object.is`). Only FLAG.detritusIntake differs. This proves the amount and the movement are unchanged.
- A held meal leaves the detritus untouched. On a capture tick the meal route wins. With no detritus there is no intake (FOOD_NONE_COMPATIBLE).
- P09's prey are exactly A02, A03, A04 and Y02.

**predators-p5:**
- prey and preyContact for P05–P10 equal CT §3.2; P10's contact seconds are 1/1/4/1; A05 appears only in P08's list.
- P07: speed 3, sensing 5, cooldown 2, Small class.
- P07 pursues at 0.3 per tick; it acquires a B01 at 4.9 cells and not at 7.
- 21 calls for the 2 s cooldown.
- Every listed prey is caught even with FLAG.attached set.
- P07 crosses an S02 and captures; P01 does neither.

**handling-saves:** at each of the 9 required points (the sample case covers commit and cancel), the import accepts, the stateHash is equal, and the stateHash is still equal after 300 more ticks with the same pin hook. The division case also checks that `handlingBreak` 'division' has progress 0.4 and that no slot keeps an attempt.

**predation-determinism:**
- `run(400)` equals 4 × `run(100)` (hash and the 'full' digest), with and without A03/A04. Handling starts and P06 captures happen.
- Save at 777, then run to 3,000: equal, with breaks happening.
- 1× and 4× through DishHost are equal at tick 420, and equal the headless run.
- Closed lid, 10,000 ticks: relErr below 1e-5 for C, N and m; absolute residual below 1e-8; handled captures happen.
- NEUTRAL: P01–P04 with B01–B08 under the shipped registry and under REG_ALGAE (all Phase 5 predators recorded, none placed): every entity column `Object.is`-equal over 2,000 ticks, and no `handlingStart`.

**handling-import:** each of the 4 refusals on a living slot (also through DishHost importDish: error reply, no new dish, the open dish's tick and hash unchanged) and on a held sample row (the control loads first). A mid-attempt dish loads with an equal hash. A stale prey reference loads, and the next tick gives 'target' in both copies.

## Commands and results (this session)

- `npx vitest run tests/fixtures/radius-capture.test.ts …handling.test.ts …detritus-fallback.test.ts …predators-p5.test.ts tests/persistence/handling-import.test.ts` (after the mutants were reverted): **Test Files 5 passed (5); Tests 47 passed (47)**
- `npx vitest run tests/sim/predation-determinism.test.ts`: **Test Files 1 passed (1); Tests 5 passed (5); Duration 162.10s**
- `npx vitest run tests/sim/handling-saves.test.ts`: **Tests 9 passed (9)**
- The regression list plus 6 of my files: **Test Files 27 passed (27); Tests 230 passed (230); Duration 338.29s**
- FENCE (`npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts`, in the background with an until-loop): **Test Files 10 passed (10); Tests 77 passed (77); Duration 882.25s**
- `npx tsc -p tsconfig.json --noEmit`: 0 errors. An earlier run showed TS2739 errors in e2-light-algae's in-flight mixotrophy.test.ts and mode-saves.test.ts; they were gone by the final run.
- `npx eslint` on my 12 files: clean.

## FENCE notes

No fence value moved. I did not run tools/fence-update.ts and created no recipe.

## Stage 5 timings (indicative)

Measured with tmp/e3-predation/stage5-timing.ts: stage 5 alone, from afterStage 4 to afterStage 5, 20 warm-up ticks, then 300 ticks. Other agents and a fence run were using the 2 CPUs at the time, so the numbers are inflated.

| Dish | Mean | p95 | Activity in 300 ticks |
|---|---|---|---|
| 60 P06 among 400 B01 (REG_P) | 0.258 ms | 2.10 ms | 54 captures |
| 20 P10 among 80 prey (P01, P02, P05, P07) and 200 B01 (REG_P) | 0.195 ms | 0.331 ms | 204 captures, 104 starts, 74 breaks |
| v1.0 predator dish: 60 P01/P02 among 400 B01 (shipped registry) | 0.204 ms | 1.12 ms | 177 captures |

## Proposed decisions

1. **PROPOSED DECISION: a P06 captures without FLAG.attached.** A born P06 lacks the flag (D-0115). Radius capture is the species' rule (CT §6.2), so contacts never reads the flag. classOf already treats every P06 as Fixed, and speed 0 means it never pursues.
2. **PROPOSED DECISION: at most one attempt event per predator per tick.** A break ends the predator's stage 5 turn, so a new attempt can start the next tick at the earliest. This is D-0122's "no new attempt that tick", made explicit for every break reason.
3. **PROPOSED DECISION: the start tick counts as the first contact tick.** A need of N seconds completes on contact tick round(N / 0.1), with EPS 1e-9: 10, 40, 25 and 14 ticks for 1 s, 4 s, c 0.5 and c 0.125. Already accepted by D-0122; recorded here as built.
4. **PROPOSED DECISION: an attempt that completes but does not capture ends as 'taken'.** The usual case is a loser of the det priority. The other case: the winner was itself eaten before its commit, so the prey survives. The handler keeps no progress and gets no cooldown, which keeps the invariant progress < need at every tick boundary.
5. **PROPOSED DECISION: a continuing attempt checks contact with the predator's own capture reach** (D02 381 "within the relevant capture radius"): 0.5 for P10, and 1.0 only for a species that had both RADIUS_CAPTURE and HANDLING, which none does.
6. **PROPOSED DECISION: a handler that left Active ends its attempt ('rest') at its next stage 5,** not in stage 8 where dormancy.ts changes its state. dormancy.ts is not this task's file. The attempt record therefore crosses one tick boundary on a non-Active handler. The invariant still holds and the import accepts it. Glow, by contrast, ends inside dormancy.ts. If the lead prefers symmetry, a one-line `endAttempt(world, i, 'rest')` hook in dormancy.ts's Active → Preparing branch would do it; it should come with that file's owner.
7. **PROPOSED DECISION: the import refuses negative handlingProgress** ("An organism's handling progress is negative."). saveFile.ts's nonnegative list does not include it. Progress inside (need − 1e-9, need) is accepted: the simulation would complete it on its next tick, and only a crafted file can hold it.
8. **PROPOSED DECISION: P09's detritus route ignores genome weights,** as E08's does. The only behavioural difference from the pre-wave-12 field route would be a weighted-policy P09 genome that gives detritus weight 0, which then still eats detritus as a fallback. The ability is "meal, else detritus", so this is the honest reading.

## Notes for the lead (other tasks' files, and bugs noticed)

- **No NEEDS line.**
  - H1 is in movement.ts: no re-acquire while `handlingNeed > 0`.
  - H2 is in births.ts: an inline 'division' break that zeroes need and progress and keeps preySlot.
  - H3 is in intake.ts: a meal-less handler's limitCode is PRED_HANDLING_IN_PROGRESS.
  - Item 0 (constants and the event types) was in place before my code compiled.
- **An observation, not a bug.** H1 (movement, on decision ticks) and H3 (intake, for a predator with no foods) read `handlingNeed[i]` for every predator, v1.0 predators included. The column is hash-neutral and always 0 there, so results are identical: the NEUTRAL test and the FENCE pass. It is one extra column read per predator, which the wave's "no extra column read in a hot loop for existing species" line would otherwise forbid. The reads could be gated on `handlingSpecies(world) !== null` from handling.ts if the lead wants that rule held strictly.
- **For wave 13's org-ui and relmatrix:** a handled capture's event carries `detail.handled` (seconds). `handlingStart` carries `need`; `handlingBreak` carries `why` and `progress`. CUE3_HANDLING already follows the columns (proved in handling.test.ts).
- **For wave 13's e3-traps (KIND 5):** contacts.ts now has `claim()` and `endTakenAttempts()`. Trap claims should keep their own kind and not use the `claimOf` / `bestClaimant` pool, or the "no prey claimed twice" rule must be extended to cover them.
