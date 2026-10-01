# g3 wave 2: parasites-phage, saves and determinism check

Lens: saves and determinism only. I did not edit any tracked file except this report. My test scripts are in `tmp/verify-parasites-phage-saves/`, which git ignores:
- `probe.test.ts`
- `import.test.ts`
- `divdrain.test.ts`
- `replay.test.ts`
- `preystale.test.ts`
- `vitest.config.ts`

Run any of them with `npx vitest run --config tmp/verify-parasites-phage-saves/vitest.config.ts <file>`.

**Verdict: ok = false.** There are two MAJOR problems. One belongs to this task: a save with an unknown virus code is accepted on import and then crashes the simulation. The other is a pre-existing bug owned by the lead, which lysis now also triggers.

## Problems (most severe first)

1. **MAJOR [parasites-phage] src/persistence/saveFile.ts:429 (hostParasiteProblem), with the crash at src/sim/viruses.ts:205 (lyse).**
   - **Problem:** the import accepts any non-zero `infectedBy` value as long as the dish's rules have the viruses system. Only code 1 (V01) exists. With any other code, the dish loads, runs until the infection timer reaches 20 s, and then `lyse` throws `lyse: slot N is infected by unknown virus code K`. The worker marks the dish failed.
   - **Repro:** run `tmp/verify-parasites-phage-saves/import.test.ts`. Set `infectedBy` = 2 or 255 on a B01 and recompute the checksum. The result is "LOADED, then sim threw: lyse: slot 0 is infected by unknown virus code 2".
   - **Fix:** refuse `virusIdOfCode(code) === null` on import, with a message ending "Nothing was loaded."

2. **MAJOR [lead] src/persistence/saveFile.ts:369-374, the generic reference check.**
   - **Problem:** a predator's `preySlot` can still point at a prey that died this tick. This is pre-existing and the builder reported it as bug 1. **Lysis is a new way to trigger it:** a B01 that P01 is pursuing lyses in stage 7, the next save keeps the stale reference, and the import refuses that save. Autosaves and checkpoints can therefore be unloadable.
   - **Repro:** run `tmp/verify-parasites-phage-saves/preystale.test.ts`. Set up a B01 with infectedBy 1 and infectionTimer 20 (a labelled test state), and a P01 2 cells away with decisionTimer 0. One `step`, then `buildSaveFile` → `parseSaveFile`, gives "A prey link points at an organism that is not there."
   - **Note:** this needs the lead's ruling. Options are a stale-target-tolerant import, or clearing `preySlot` in killEntity/consumePrey, which would change hashes under the FENCE.
   - **Scope:** host/parasite references do not have this problem. Every place an entity is freed (maintenance.ts:165 and contacts.ts:155) calls `releaseHostPair` first. A free X01 never stores a target. A parse of the save after every one of 900 mixed-dish ticks never failed on a host or parasite reference.

3. **MINOR [parasites-phage] src/persistence/saveFile.ts:429.** The import accepts `infectedBy = 1` on a species V01 cannot infect (A01, X01). The world loads, the organism's division is blocked, and it lyses 20 s later. The task did not ask for this refusal. A one-line check against V01's `hostIds` would close it.
   - **Repro:** `import.test.ts`, "infectedBy=1 on A01" and "infectedBy=1 on X01" both load and run 210 ticks.

4. **MINOR [parasites-phage] src/persistence/saveFile.ts:430.** The import accepts a non-zero `infectionTimer` on an organism with `infectedBy` 0. This is a non-canonical value in a hashed column, and the simulation never reads it. It is harmless, but two saves of the same dish could differ in this value.
   - **Repro:** `import.test.ts`, "infectionTimer=5 with infectedBy=0" loads.

5. **MINOR [parasites-phage] src/persistence/saveFile.ts:329.** A non-finite `infectionTimer` is refused by the older generic column check, whose message is "Entity column infectionTimer has a non-finite value." It does not end "Nothing was loaded.", although the assignment asks for that ending on this refusal. A stale host or parasite reference has the same gap ("A host link points at an organism that is not there."). The builder disclosed the first case.

## VERIFIED OK
- **Mid-run save/load at awkward moments.** Mixed dish: 8 A01, 8 X01, 16 B01, 2 P01, and a dose of 20 units over radius 3, run for 900 ticks. `stateHash` was recorded every tick, and every tick's `buildSaveFile` output passed `parseSaveFile` (0 failures).
  - 33 snapshots were taken at awkward ticks:
    - the tick of an infection;
    - timer at 0;
    - timer at 19.9 s and 20 s, the ticks just before lysis;
    - lysis ticks, 12 lyses in all;
    - the ticks where the attached count changed: 0→8, 8→10, 10→11, 11→12, 12→14 and 15→16.
  - Each snapshot went through both `serializeWorld` → `deserializeWorld` and `buildSaveFile` → `loadSaveFile`. Each was equal at once and stayed equal at every tick for up to 220 more ticks: 0 divergences.
- **Save on a division tick.** A host dividing with its Hitcher attached, and a Hitcher dividing on its host, were each saved on the division tick, with birthIds re-pointed. Both continued bit-identically for 300 ticks (`divdrain.test.ts`).
- **Drain death.** Saves taken one tick before a DEATH_PARASITE_DRAIN death (tick 7) and on that tick both continued bit-identically for 200 ticks. Darkness was applied to both worlds through the same labelled hook.
- **Host resting with the pair still attached.** I used a test-only registry where E03 is eligible for A01. A save was taken after stage 8 set the host to Preparing, before the next stage 5 releases the pair. It loads, its hash is equal, and it continues equal for 100 ticks. The pair is then released.
- **1× vs 4× with an interleaved world.** `run(a, 600)` was compared with 150 × `run(b, 4)`. Between chunks, a second world advanced 3 ticks, `packEntities` ran, `buildInspector` ran for every live organism, and `stateHash` was called. The final hashes were equal. Module-level scratch arrays (`drained`, `claimOf`, `candidates`, …) are reset on each call, and the inspector reads (`infectionInfo`, `parasiteInfo`, `hostInfo`) change no state.
- **Dose: queued replay vs paused `applyNow`.** These are equal for the V01 dose and for a control B01 inoculation, checked at +1, +2, +5 and +20 ticks (fields and ledger compared too). A save taken while the dose command is still pending, then loaded, gives the same hash as the uninterrupted run and as the `applyNow` path, and still does 401 ticks later.
- **g2 saves and the fence.** I ran g2-replay, trajectory-fence (4 files), conservation-closed-lid, determinism, deterministic-state, tests/fixtures/saves and the builder's parasite, phage and host-specificity fixtures: 11 files, 82/82 passed, 1013 s.
  - Every new rule is gated, either on `worldHasParasites` (a HOST_DRAIN species in the world's recorded species) or on `worldHasSystem('viruses')` plus the `v01` field.
  - The host, parasite and infection columns are schema-1 columns at their empty values in a g2 world, so g2 hashes are unchanged.
- **Canonical saved state.** No new saved structure was added. The pair and infection state lives in existing, always-hashed SoA columns, which `free()` zeroes completely. The dose is ledgered through `recordInput` (an array entry, not iterated keys).
  - Infection order is sorted with integer `det` priorities, then birthId; it does not depend on iteration order.
  - Nearest-host and attachment ties go to distance and then birthId, so the result does not depend on the spatial index's bucket order. That order can differ after a load.
- **Randomness only in src/sim.** `det` and `detFloat` are used only in parasites.ts (contact stream, kind 2) and viruses.ts (infect stream; contact stream, kind 3). These keys are distinct from predation's (contact stream, kind 1). `grep` found no `det(`, `detFloat` or `STREAMS` in src/worker, src/ui, src/render or src/persistence.
- **Ledger and conservation.** Lysis units leave B through `subtractPool`. The drain is reserved and committed inside one `stageIntake`; `reserveHostDrains` resets `drained` first, so a thrown stage cannot leak into the next tick. The closed-lid phage test passes (in the 82 above).
- **The new import refusals work.**
  - These end "Nothing was loaded.": a non-mutual pair in either direction, a host outside hostIds (a self-pair is caught too), infectedBy without the viruses system, and a negative timer.
  - These are refused by older checks: NaN or Infinity timers and a stale host birthId (generic checks), and an entity forged as V01 (the genome-species check).
