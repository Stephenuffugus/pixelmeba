# Wave 12: saves and determinism verification of e3-predation

**Verdict:** ok. There are no BLOCKER or MAJOR findings, one MINOR finding and one NOTE.

**Scope:** saves and determinism only. I edited no tracked file. My probes are in tmp/verify-saves-g5-wave-12-1/: `lockstep.test.ts`, `crafted.test.ts`, their own `vitest.config.ts`, and the logs. The probes mock IMPLEMENTED_NATIVE_ABILITIES with DETRITUS_FALLBACK, HANDLING and RADIUS_CAPTURE appended, as the builder's tests do.

## Problems

### MINOR [e3-predation] src/sim/handling.ts:23 and src/persistence/phase5State.ts:76

**What is wrong:** handling.ts's header and the build report both say the tick-boundary invariant (need > 0 ⇒ 0 < progress < need and preySlot ≥ 0) is "refused by the import otherwise". The import refuses only part of it. It accepts all of these:

- handlingNeed > 0 with handlingProgress 0
- handlingNeed > 0 with preySlot −1 and preyBirthId 0
- an unbounded need, for example 1e6 s (the largest the simulation can write is 4 s)

None of these states can be reached by the simulation, and each loads and runs deterministically:

- a progress of 0 adds one extra contact tick
- a preySlot of −1 ends the attempt as 'target' on the next tick
- a huge need never completes while contact holds

So nothing breaks. The only problem is that the comment claims more than the import enforces.

**Repro:** run `crafted.test.ts`. It builds a mid-attempt P10/P01 duel (need 1, progress 0.5) and edits the columns before `buildSaveFile` and `parseSaveFile`. Results:

- `needPosProg0`: ACCEPTED
- `needPosNoPrey`: ACCEPTED
- `hugeNeed`: ACCEPTED

**Fix:** pick one.

- Reword the header to "the import refuses progress without an attempt or at or past its need".
- Or add the rule `need > 0 && progress <= 0` with the sentence "An organism's handling has not started.", plus an upper bound on need (4 s). Do not add a preySlot rule: the task says not to require a valid prey reference.

## Notes

### NOTE [e3-predation] The 'rest' break cannot happen in this wave

P10 (the only HANDLING species) has no dormancy. The import refuses a resting or preparing P10 with "An organism is resting although it has no resting ability." (`crafted.test.ts` `preparingWithAttempt`). So the case in the builder's proposed decision 6, where an attempt is still open across one tick boundary on a non-Active handler, cannot occur in any save of this wave. Nothing needs to change.

## VERIFIED OK

- **VERIFIED OK: save and reload at every tick of a mixed predation dish.** The probe is `lockstep.test.ts`. The dish has:
  - 11 P06 along a stone edge among 80 B01
  - 12 P10 among 40 P01, 15 P05 and 10 P07, with silicate
  - 6 P09 with A02, Y02 and detritus

  The probe runs world A uninterrupted. World B is stepped and then replaced by `loadSaveFile(buildSaveFile(B))` after every tick, 400 times in a row, so every import check runs on every reachable state. World D does the same through `deserializeWorld(JSON(serializeWorld(D)))`. Results:
  - The stateHash of A, B and D was equal after every one of the 400 ticks (firstMismatch −1 for both paths). The final hash was 5a27bc95c93becc5 in all three.
  - The import refused nothing.
  - 201 ticks had an open attempt.
  - The run produced 34 handlingStart, 32 handled captures, 2 'taken' breaks and 14 P06 radius captures. Every one of them crossed a save and reload with no divergence.
- **VERIFIED OK: the tick-boundary invariant holds at every tick of that run, including on dead slots.**
  - On every living slot, need > 0 ⇒ 0 < progress < need and preySlot ≥ 0, and need 0 ⇒ progress 0.
  - Every dead slot has need 0 and progress 0. `free` clears the slot, so a handler eaten mid-commit after it completed leaves no progress ≥ need behind. This matters because the import's "An empty place in the dish holds organism state" check would otherwise refuse a real save.
- **VERIFIED OK: reload at every tick of a pinned P10/P01 duel.** The probe is `crafted.test.ts` `everyTickDuel`. The duel covers the start tick, ticks 2–9 of the attempt, the completion on tick 10, and ticks 11–16 after it. After each tick the world was reloaded through `buildSaveFile`/`loadSaveFile` and stepped on. The hash was equal to the uninterrupted run at every one of the 16 ticks.
- **VERIFIED OK: the builder's tests for save points, run splitting, 1× vs 4×, conservation and import refusals.** I re-ran `tests/sim/handling-saves.test.ts`, `tests/persistence/handling-import.test.ts` and `tests/sim/predation-determinism.test.ts` in this session: **Test Files 3 passed (3); Tests 26 passed (26); 333 s.** They cover:
  - the 9 required save points, including a P05 at 39 of 40, a jacketed need, the H2 division tick, and a held sample with handler and prey, committed and cancelled
  - run(400) equal to 4 × run(100), on both the stateHash and the 'full' trajectory digest
  - save at tick 777, reload, run to 3,000
  - 1× and 4× through DishHost
  - a closed lid for 10,000 ticks: C, N and mineral relErr below 1e-5
  - NEUTRAL: entity columns `Object.is`-equal over 2,000 ticks
  - each of the four refusals on a living slot, on a held sample row and through the host's import path
- **VERIFIED OK: the rc1 and g2 corpora load and continue bit-identically, and v1.0 saves keep their recorded rules.** I ran rc1-replay, g2-replay, stale-prey and phase5-import: **Test Files 4 passed (4); Tests 67 passed (67); 194 s.**
  - `git grep handlingProgress` at tags g2 and v1.0.0-rc1 and at HEAD finds no writer outside the column definition, and none in v1.0 code.
  - All five rc1 saves record 19 species and no P10. `handlingSpecies` and `radiusCaptureSpecies` return null for them and for a fresh shipped world. So the builder's claim holds: v1.0 and shipped worlds run the old claim loop, with no new column read in stage 5.
- **VERIFIED OK: the new saved state is canonical, hashed deliberately and holds no material.**
  - No new column, store or schema was added.
  - The attempt lives in existing f64 columns. handlingNeed is a schema 5 column, so it is hash-neutral while every slot holds 0 (the D-0035 rule). handlingProgress is a v1.0 column that has always been hashed and was always 0 in v1.0.
  - Both columns are per slot, so their order does not depend on anything else, and f64 values survive JSON exactly (the lockstep probe shows this).
  - An attempt holds no material, so the ledger has nothing to count. Material moves only in consumePrey; the builder's byte-equality test and the 10,000-tick conservation test cover this.
  - The handlingStart and handlingBreak events and `detail.handled` go only to the event ring, which is saved but not hashed. They load back cleanly.
- **VERIFIED OK: no new randomness.** The only det call that completing claims use is the existing `det(seed, 'contact', tick, KIND_ATTACK, birthId)`, and they share one pool with instant claims (`claim()` in contacts.ts). There is no new stream or KIND, and handling.ts draws nothing. The two WeakMap tables are pure functions of `world.species`, so a loaded world rebuilds identical tables.
- **VERIFIED OK: a sample transfer keeps an attempt's stale prey link as it was** (sample.ts:505). After a later-stage death, the transferred handler loads, its import check passes, and on the next tick it ends the attempt with 'target'. The builder covers a held sample committed and cancelled.
