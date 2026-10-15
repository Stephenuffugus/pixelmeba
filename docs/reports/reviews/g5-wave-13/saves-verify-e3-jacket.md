# Saves and determinism verification: e3-jacket (g5-wave-13, P5.5 E11 mineral jacket and trap hooks T1–T5)

Verifier: adversarial saves/determinism lens, run 2026-10-15 on the uncommitted wave 13 tree (shared with e3-traps, org-ui, relmatrix work). No tracked file edited except this report. Scratch: `tmp/verify-saves-g5-wave-13-1/` (probe.test.ts, vitest.config.ts, logs, probeA.json).

Verdict: **ok = true** (no BLOCKER, no MAJOR).

## Problems (most severe first)

- MINOR [lead] src/persistence/phase5State.ts:86-92 — the jacket import rule and its comment predate E11. The comment says "jacketMineral has no writer yet (E11 is not implemented …) module loss at division may one day leave a jacket on a daughter without E11". Both statements are now false: e3-jacket writes the column (jacket.ts jacketPass), and the §9.19 reconcile (births.ts:346-351) drops the jacket of a daughter without E11. So no reachable state holds `jacketMineral > 0` on a genome without E11, yet the import still accepts one (D-0118: "requires the dish's silicate system, not E11 in the genome"). Such a crafted file loads and runs as follows: handling.ts gives the organism the 1 + 3c P10 penalty, movement.ts gives it no speed penalty (the `prof.jacket !== null` guard), and it never drops the jacket because it never divides into the reconcile with it. That is deterministic, but the state is non-canonical. Repro: take any jacket-saves dish, set `jacketMineral[s] = 0.1` on a plain P01 (with `inputs.m` rebased), then buildSaveFile → loadSaveFile. It is accepted. Options: the lead either tightens the rule to "requires E11 in the genome, or the silicate system and …" or re-affirms D-0118, and the comment needs refreshing either way. The file belongs to e3-traps this wave, so it is not e3-jacket's to change.
- NIT [lead] src/sim/handling.ts:45 and src/sim/jacket.ts:100 — two sources for one number:
  - the coverage denominator reads the code constant `JACKET_COVERAGE_FRACTION`;
  - the build target reads the world's recorded `E11.targetPerBody`;
  - the handling seconds read constants, not the recorded E11 params.

  They agree for today's content, and module-e11's content test pins that. But a world whose recorded E11 numbers differ (future content, or a crafted registry) would build to one target and measure coverage against another. No current save can reach this. Recorded as PROPOSED DECISION 3 by the builder; it is the lead's to accept.

## VERIFIED OK

- VERIFIED OK — the builder's saves/determinism files pass on the current tree. `npx vitest run tests/sim/jacket-saves.test.ts tests/sim/jacket-determinism.test.ts tests/sim/trap-hooks.test.ts` gave Test Files 3 passed, Tests 16 passed (77 s). They cover:
  - jacket-saves: the first build tick, a scaled shared tick, target reached, a dropped jacket at division, death with a jacket, P10 mid-attempt on a built jacket, and the rc1 corpus re-saved;
  - jacket-determinism: run(400) = 4 × run(100) with the 'full' digest, a save at 777 → 3,000, and DishHost 1× = 4× = headless;
  - trap-hooks: the T2 import round trip.
- VERIFIED OK — a round trip at every tick boundary is transparent, including at the awkward moments. Probe A (`tmp/verify-saves-g5-wave-13-1/probe.test.ts`) builds a jacket dish:
  - 36 E11 carriers among 48 P01/P02/P07, two per cell;
  - thin 0.004 silicate, so cells are scaled and pinned;
  - grit dissolving, 4 P10, B01 prey;
  - forced E11 losses at division: proposeDaughters is mocked to return a real-shaped MUT_MODULE_LOSS draw.

  World W was serialize → JSON → deserialize'd at every one of 1,380 tick boundaries. At 120 more it went through **buildSaveFile → loadSaveFile** (the real import, with validation), chosen at every tick with an event (birth, capture, handlingStart/Break, death) or a roundoff.m change (a pinned cell), plus every 100 ticks. W's stateHash equalled the uninterrupted reference at every 25th tick and at 1,500 (firstMismatch −1). Each loaded state also hashed equal to its source. The run reached:
  - 442 pinned-cell ticks;
  - 159 handling starts, 152 breaks and 52 captures;
  - 15 births, including a daughter that dropped her jacket to grit at stage 9;
  - up to 41 jacketed organisms at once;
  - 161.7 E charged under construction;
  - roundoff.m = 1.1e-18.

  The import accepted every state the run produced (probeA.json).
- VERIFIED OK — observation is hash-neutral. Probe B called packEntities (snapshot), `jacketView`, `jacketBuiltNow` and `profileOf` on every live slot every tick for 600 ticks. Its stateHash equals the same dish run without those reads. `builtNow` is a module-level WeakMap; `world.profiles` is never saved or hashed (profiles.ts header).
- VERIFIED OK — quarter runs and a mid-run reload match. Probe C: run(900) equals nine run(100) with a buildSaveFile → loadSaveFile after the fifth.
- VERIFIED OK — the g2 and rc1 corpora load and continue bit-identically, and the import tests pass. `npx vitest run tests/fixtures/rc1-replay.test.ts tests/fixtures/g2-replay.test.ts tests/persistence/phase5-import.test.ts tests/persistence/migration-schema5.test.ts tests/persistence/handling-import.test.ts` gave Test Files 5 passed, Tests 82 passed. A v1.0 world is untouched on four counts:
  - T1 and T3 read `heldBySlot`, which is −1 in every old world;
  - the speed expression short-circuits on `prof.jacket !== null`, leaving the old `prof.speed * DT` bit-identical;
  - the reconcile reads an always-0 column;
  - jacketPass returns at once with no requests.
- VERIFIED OK — no new saved state:
  - no schema, protocol, ledger-key or RNG-stream change;
  - `jacketMineral` is the pre-existing, always-hashed column (D-0108), and serialize writes it with every column;
  - grit and silicate are allocated fields and are hashed;
  - `roundoff.m` (the pin dust) is saved and hashed (serialize.ts:377-378);
  - `ledger.energy.construction` is saved (`clone(world.ledger)`) but is not a hash input, as with every energy category;
  - the ActionContext `mineralRequests` live only inside stage 8 and never cross a tick boundary.
- VERIFIED OK — the pass is canonical. Requests are sorted by (cell, slot, submission index) with a total comparator. Sums and commits run in that order from one snapshot. Slots are preserved by serialize, so post-load order is identical. The pin rule is bounded:
  - a scaled cell's headroom is below the sum of per-tick requests, which is at most a few hundredths of a unit, so |dust| stays far below PIN_DUST_MAX (1e-12);
  - the dust is ledgered, so closed-lid accounting holds.

  Grit written at birth is unmarked, as killEntity and consumePrey are. That cannot diverge across reload: grit's diffusion class is 'none', so it is never deactivated, and conversion.ts scans every cell (D-0117). `fieldActive` is rebuilt as all-1 on load, which is equivalent because the invariant "inactive ⇒ all zero" holds.
- VERIFIED OK — the import enforces jacket integrity:
  - non-negativity and finiteness (saveFile.ts:451; sampleSlot.ts:265 for sample rows);
  - the silicate-system rule (phase5State.ts:92), which guarantees the grit field that births.ts:348, killEntity and consumePrey need.

  A held E11 carrier is refused ("A trap holds an organism it cannot catch"). That is correct: F03 traps P04 only, and E11 is eligible for P01/P02/P07 only.
- VERIFIED OK — T2 ordering: the trap re-key runs after `c.birthId[i] = b0` (births.ts:357 then :366-370), so the held P04 names the retained daughter's new birthId. trap-hooks T2 round-trips through the import.
- VERIFIED OK — no randomness outside src/sim. jacket.ts draws none, and its header says so. e3-jacket changed no file outside src/sim and tests.

## Commands run (this session)

| Command | Result |
|---|---|
| `npx vitest run tests/sim/jacket-saves.test.ts tests/sim/jacket-determinism.test.ts tests/sim/trap-hooks.test.ts` | 3 files, 16 tests passed (76.9 s) |
| `npx vitest run tests/fixtures/rc1-replay.test.ts tests/fixtures/g2-replay.test.ts tests/persistence/{phase5-import,migration-schema5,handling-import}.test.ts` | 5 files, 82 tests passed |
| `npx vitest run --config tmp/verify-saves-g5-wave-13-1/vitest.config.ts tmp/verify-saves-g5-wave-13-1/probe.test.ts` | 3 tests passed (237 s) |
| same, `-t "A. chain"` (stats to probeA.json) | 1 passed; firstMismatch −1, 120 save files and 1,380 serial round trips, 442 pins, 52 captures, 1 jacket drop |
