# Wave 10 · barrier-transport · saves and determinism verification

Lens: saves and determinism only. I checked the uncommitted tree as it stands. I edited no tracked file except this report. Probes are under `tmp/verify-saves-g5-wave-10-0/` (`saves.probe.ts`, `ws5.probe.ts`, `vitest.config.ts`).

**Verdict: ok.** I found no BLOCKER or MAJOR, two MINOR problems and two NITs.

## Problems (most severe first)

1. **MINOR [barrier-transport]** `src/sim/barriers.ts:227` (edgeStoreProblem; the check belongs in `src/persistence/phase5State.ts`, which has `s.tick`)
   - **What is wrong:** the import accepts an S04 `nextOrganismTick` set any distance in the future. The simulation only ever writes `tick + CHANNEL_ORGANISM_TICKS`, so such a value is a state the simulation cannot reach, and it is hashed. A crafted file can switch off a channel's organism transfer for good and still load as valid.
   - **Fix:** refuse `nextOrganismTick > s.tick + CHANNEL_ORGANISM_TICKS` with "A one-way channel has an invalid organism wait." `barriers.ts` is read-only for the builder, so the lead applies this.
   - **Repro:** `saves.probe.ts` P5(b). I took a tick-300 save, set the first S04's `nextOrganismTick` to `1e12` and re-checksummed it. `parseSaveFile` accepts it.
2. **MINOR [lead]** `tests/sim/world-stores-5.test.ts:235` and `tests/sim/barrier-movement.test.ts:236`
   - **What is wrong:** the suite stays red until the builder's two patches land.
   - **In world-stores-5,** the 4× = 1× hash assertions pass. Only the fixed `TALLY` expectation fails, because the tallies now keep counting. That is correct behaviour, not a determinism break.
   - **The builder's world-stores-5 patch is verified:** I applied it to a scratch copy (`tmp/verify-saves-g5-wave-10-0/ws5.probe.ts`) and all 8 tests passed.
   - **Repro:** `npx vitest run tests/sim/world-stores-5.test.ts` gives 1 failed and 7 passed (`expected [ …(3) ] to deeply equal [ …(2) ]`).
3. **NIT [barrier-transport]** `src/sim/resin.ts:33` (`addBound`) and `src/sim/gateTally.ts:89` (`addFieldTally`)
   - **What is wrong:** the key order of these saved records is not canonical.
     - The import accepts a resin's `bound` keys in any order, and `addBound` then updates them in place in that order.
     - `gateTally[].fields` keys follow the order in which each field first showed flux.
   - **Impact:** the hash is unaffected (`canonicalJson` sorts keys, and `gateTally` is not hashed). Only the bytes of the save file differ between two equal worlds.
   - **Repro:** P5(a). An import with `{"inhFung":…, "inhBact":…}` loads with an equal stateHash, and the hash is still equal after 100 ticks. The re-saved JSON keeps the reversed order.
4. **NIT [lead]** `src/persistence/phase5State.ts:96` (gateTallyProblem)
   - **What is wrong:** the import accepts a tally record whose id names a device (an S08 resin) rather than an edge barrier.
   - **Impact:** none on the simulation. The tallies are observation only and never hashed.
   - **Repro:** P5(d) is accepted.

## VERIFIED OK

- **The fence is unchanged, and the new and import files pass.**
  - The run covered g2-replay, rc1-replay (the rc1 corpus, D-0101), trajectory-fence, conservation-closed-lid, determinism, the five new barrier-transport files, phase5-import and migration-schema5.
  - Result: Test Files 15 passed (15), Tests 163 passed (163), 1,064 s.
  - g2 and rc1 saves load and continue bit-identically.
- **Save at every tick:**
  - **The world:** the determinism dish plus 24 B01 crowded onto both channel sources.
  - **The check:** P1 serialized and deserialized at every tick from 0 to 80, then ran on to 160.
  - **What it covers:** the window holds ticks where a channel is waiting, where it becomes ready, and right after a transfer. More than 4 channel organism transfers happened.
  - **Result:** stateHash, the 'full' trajectoryDigest and gateTally were deep-equal to the uninterrupted run at every save tick, and the gateTally JSON was byte-equal.
- **Save files around the channel's ready tick:** P2 built a save file and loaded it at up to 12 ticks where a channel's `nextOrganismTick` was the tick itself, one tick later or one tick earlier. Each was hash-equal on load, and running on to tick 200 matched the uninterrupted run (hash and gateTally).
- **4× and interleaving:**
  - P3 compared 500 ticks run in one call with the same run in irregular chunks (1, 2, 3, 7, 9, 10, 11, 37, 120): stateHash and gateTally were equal.
  - P3 then stepped three worlds in turn, tick by tick:
    - the same dish;
    - a different seed with the same structures and the same geometryVersion;
    - a dish without structures.
  - Each matched its own uninterrupted run, so neither the per-world caches (`derived.transport`, the edgePassage cache) nor the module scratch (the gateTally before/after arrays guarded by `beforeWorld`, the channel's group and candidate heads reset after use) leak between worlds.
- **Resin saturation boundary:**
  - P4 dosed both resin cells with 200 units. Resin 121 (inhBact only) reached a bound sum of 4.999999999999916 at tick 1000.
  - Save files built and loaded at 999, 1000 and 1001, then run to 1050, were all hash-equal to the uninterrupted run.
  - An imported bound of 5 + 5e-10 (inside the 1e-9 tolerance) is accepted and inert, because `remaining <= 0`.
- **Import refusals:** `nextOrganismTick` 1.5, null and −3, and a tally with organisms −1, are each refused with their own sentence ending "Nothing was loaded."
- **Hashing:**
  - `world.edges` (with `nextOrganismTick`) and `world.devices` (with `bound`) are hashed through `canonicalJson`, and only when non-empty (`serialize.ts` 388–393).
  - `gateTally` is never hashed.
  - An absent `nextOrganismTick` or `bound` is hash-neutral until the first transfer or bind.
  - Stage writes (`nextOrganismTick`, `bound`, `gateTally`) do not bump geometryVersion, and no cache keys on them.
- **Cache key:** the transport cache rebuilds on geometryVersion, the edges array's identity or its length.
  - structure-commands' writers replace the edges array and bump once (`structureEdits.ts` 274, 309, 359, 412), so a shutter toggle cannot leave a stale coefficient in an uninterrupted run that a reload would not have.
- **A v1.0 world takes the old path.** With no edges, kRv/kDv are kR/kD, and channelStep, resinStep and the tallies return on their gates. The fence and the NEUTRAL tests confirm this. A v1.0 save keeps its recorded ruleset: every new step is gated on the world's own `worldHasSystem`.
- **No simulation randomness and no unordered iteration:** a grep of `channel.ts`, `resin.ts`, `gateTally.ts` and the `transport.ts` diff finds no `Math.random`, `Date`, `performance`, `Object.keys`, `Map`/`Set` or for-in. Resin iterates its validated, ordered `resinSelect`, and `bound` is summed in RESIN_TARGETS order.
- **Ledger:**
  - Channel moves go through `subtractPool` and add no ledger line. They cannot drive a pool negative (a source loses at most 0.8 % of its snapshot).
  - Resin activity is not a material.
  - The builder's closed-lid 10,000-tick conservation test is in the 15-file run above, and it passed.
- **fieldActive and reload:** a load sets every field active, while a running world keeps an all-zero field inactive. The channel skips inactive fields. These two are equivalent, because a field is marked inactive only when it is zero everywhere, so the snapshot reads 0 in either case.
