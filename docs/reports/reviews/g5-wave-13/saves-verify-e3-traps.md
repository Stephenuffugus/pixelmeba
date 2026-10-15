# Saves/determinism verify: e3-traps (g5-wave-13)

Lens: saves and determinism only. Work under review is uncommitted in the tree (traps.ts, contacts.ts, intake.ts, maintenance.ts, ledger.ts, sample.ts, sampleSlot.ts, phase5State.ts, events.ts, constants.ts, entities.ts, plus e3-jacket's hooks T1-T5). Probes in tmp/verify-saves-g5-wave-13-0/ (probe.test.ts, probe2.test.ts, logs probe.log, probe2.log). No tracked file edited except this report.

Verdict: ok = true. No BLOCKER or MAJOR. One MINOR.

## Problems

- MINOR [e3-traps] src/sim/traps.ts:162-183 (releaseTickByWorld / markReleased / releasedThisTick) — The per-world release-tick scratch is never saved, but it changes outcomes: it makes trapStep skip the cooldown countdown in the tick a hold ended. That is safe only while every release happens inside step(). Today that holds: killEntity and consumePrey run only in stages 5 and 7, no command or host path kills an organism, and Take, Transfer and Discard release nothing. But any future between-ticks removal (a remove tool, a lineage cull, a paused edit through applyNow) would make save → load diverge from the uninterrupted run. — Repro: tmp/verify-saves-g5-wave-13-0/probe2.test.ts, "direct consumePrey between ticks". The trap holds a P04; call consumePrey(w, pred, p) between ticks, then buildSaveFile → loadSaveFile. The hash is equal at load. One step later the uninterrupted cooldown is 30 and the reloaded one is 29.9, and the hashes differ. This is a test-only path today. Suggested fix: when a release is not in stage 8, write it into saved state instead of a WeakMap. Alternatively, add a lead-level rule (a DECISIONS entry or an assertion) that releaseTrapOnRemoval is only ever reached inside step().

## Verified OK

- VERIFIED OK — the 1x and 4x host give the same hash on a busy trap dish — probe.test.ts "host 1x vs 4x": 30 F03, 60 P04 and 300 B01 through FakeClockHost to tick 600. maxTicksPerPump is 4, there are 34 holds, and the hashes are equal. The builder's trap-determinism.test.ts (run(400) = 4 × run(100) with the full trajectory digest; save at 777 → load → 3,000; host 1x = 4x) passes in this session.
- VERIFIED OK — saves at every trap transition continue bit-identically — probe.test.ts, a 2,400-tick busy dish with no position pinning:
  - Activity: 63 arms, 70 holds, 70 releases (40 'timer', 6 'targetDied' among the sampled ticks), 1 division of a holding owner (T2), and queued sampleTake of a holding pair plus a sampleTransfer by (1, 0).
  - 39 buildSaveFile → loadSaveFile points: arm, hold start, release by timer, release by target death (stage 7 cooldown start), division while holding, sample held (5 consecutive ticks), the ticks after a command, and every 200 ticks.
  - Every point was accepted, with an equal stateHash at load and 300 ticks later.
  - A serializeWorld → deserializeWorld round trip every 10 ticks (240 checks) matched every time.
- VERIFIED OK — awkward moments, with a save at every tick and a 300-tick continuation compared — probe2.test.ts:
  - **Owner dies of age while holding:** 12 consecutive save ticks around the 'ownerDied' release. The reserve goes to detritus and the P04 is freed alive.
  - **Target dies of the drain in stage 7:** 8 save ticks. The cooldown starts the next tick: the unsaved scratch does not matter across a tick-boundary save.
  - **Queued Take and Transfer:** 10 save ticks. The Take of a holding pair is queued, and a Transfer by (8, 0) moves the held P04, placed within 2^-47 of a cell edge, across that edge. The import accepts the out-of-cell hold (D-0118 respected), and the hold releases on time at tick 83 ('timer', 8 s).
- VERIFIED OK — the import accepts every state the simulation writes — per-tick tick-boundary invariants on the busy dish held for all 2,400 ticks:
  - holding ⇒ 0 < timer < 8, cooldown 0, and the pair is mutual with both birthIds;
  - not holding ⇒ timer 0 and trapBirthId 0;
  - 0 ≤ cooldown ≤ 30;
  - any trap state ⇒ reserveC > 0;
  - no trap state on a non-F03 organism.

  These mirror phase5State.ts:64-72. Every one of the 51 probe loads was accepted. entities.ts free() clears every column through clearSlot, so dead slots stay empty, and the import's "An empty place in the dish holds organism state." rule cannot fire on a dead trap owner.
- VERIFIED OK — new refusals end "Nothing was loaded." and leave the current world untouched — tests/persistence/trap-import.test.ts (19 tests, including the host-level pattern) and phase5-import.test.ts pass in this session.
- VERIFIED OK — the saved shape is canonical and hash-neutral while empty —
  - **No new saved shape:** no new column, store, stream, ledger key or schema/protocol bump.
  - **Hashed only when in use:** the trap columns are hashed only while non-empty (serialize.ts:363 FIRST_HASH_NEUTRAL_COLUMN). Held sample rows drop the empty schema 5 columns from the hash (hashedSample, serialize.ts:404-411).
  - **No −0 in a trap column:** the writers only ever set literal 0 or −1 (the cooldown snaps to +0).
  - **Order-independent capture:** nearest first, ties to the lower birthId, priority det(seed, 'contact', tick, KIND_TRAP 5, owner birthId) and then the lower birthId. No species index keys a stream.
  - **Randomness:** none is drawn outside src/sim (traps.ts uses rng.det only).
- VERIFIED OK — the reserve is counted in the ledger —
  - computeTotals (ledger.ts:134-156) and sampleTotals (sampleSlot.ts:210-211) add trapC/N as +0 terms.
  - On the busy dish, the worst checkLedger relative error over 240 checks was 1.1e-13.
  - Discard exports the reserve through sampleTotals and calls no killEntity, so the reserve is not counted twice (sample.ts sampleDiscard).
- VERIFIED OK — sample remap — REF_COLUMNS gains both trap pairs after the adhesion pairs, and LINK_REFS is now the fungal and adhesion pairs only. Transfer remaps both references with birthIds unchanged; Cancel uses writeRow with every column. HELD_REFS checks mutuality: the slot both ways, and each birthId from its own row. trap-sample.test.ts (7) passes.
- VERIFIED OK — the g2 saves and the rc1 corpus still load and continue — tests/fixtures/rc1-replay.test.ts 6/6 (43 s) and tests/fixtures/g2-replay.test.ts 9/9 (69 s), run in this session against the current tree. I did not rerun the rest of the fence (the builder reports 77/77). A v1.0 save records no TRAP species, so it reads no trap column, and computeTotals is Object.is-equal (the builder's neutrality test passes).
- VERIFIED OK — the builder's six files pass in this session — traps, trap-saves, trap-sample, trap-determinism, trap-import and phase5-import: 6 files, 99/99 tests, 201 s.
- VERIFIED OK — the WeakMap gates are stable — world.species is built once in createWorld (world.ts:228) and never mutated, so trapSpeciesOf and trapTargetsOf cannot go stale between an uninterrupted world and a reloaded one. AGENT_CAP-sized module scratch is only used inside one call; `drained` is reset at the start of every reserveTrapDrains, and intakeBody has no early return between reserve and commit.

## Notes for the lead
- At integration, append TRAP to IMPLEMENTED_NATIVE_ABILITIES. The saves tests mock it today; after the append, remove the mocks or keep them as no-ops.
