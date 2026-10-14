# Wave 12 saves/determinism verify: e2-light-algae

Lens: saves and determinism only, for e2-light-algae (uncommitted tree, with e3-predation's and structures-art-audio's work also in flight). No tracked file was edited. The probes are in `tmp/verify-saves-g5-wave-12-0/`: `probe.test.ts`, `vitest.config.ts`, `stats.txt` and the logs.

Verdict: **ok**. No BLOCKER or MAJOR was found.

## Problems (most severe first)

- **MINOR [e2-light-algae] src/sim/species.ts:97 vs src/persistence/phase5State.ts:53-54.** Two different keys decide who has a mode:
  - The simulation writes `metabolicMode` for every species whose recorded *metabolism* is `'mixotroph'`. It uses `sp.mixotroph` in `hasMixotroph`, `updateMode`, the intake route and the births newborn rule.
  - The import accepts a non-zero mode only for a species with the *ability* `'MIXOTROPHY'`.
  - The content validator does not tie the two together.

  Today only A04 is a mixotroph, and it records both, so nothing real is affected. But if a later content record or variant had metabolism `'mixotroph'` without `MIXOTROPHY`, its saves would be refused with "An organism has a feeding mode although it cannot switch modes. Nothing was loaded." That breaks "saves are sacred". The reverse case (the ability without the metabolism) would leave a dead ability.

  Repro: copy A04 into a test registry with `nativeAbilities: []` (allowUnimplemented), run one step, then buildSaveFile → loadSaveFile is refused. Fix: key the simulation gate on the ability, or add a validator rule "metabolism mixotroph ⇔ MIXOTROPHY".
- **NIT [lead] src/sim/climate.ts:20-28.** The light-convention header still lists the derived.light readers as "intake stage 6, E07 stage 4, dormancy stage 7". This wave adds two more:
  - stage 4: `mixotrophy.ts updateMode`;
  - stage 9: `births.ts commitDivision` newborn mode.

  Both run after stage 2, so the invariant still holds (the probe proves it). Only the comment is out of date. climate.ts is read-only for e2.
- **NIT [lead] integration.** `tests/sim/mode-saves.test.ts` and `tests/sim/algae-determinism.test.ts` pass only because they `vi.mock` `IMPLEMENTED_NATIVE_ABILITIES` with `LOW_LIGHT_CURVE` and `MIXOTROPHY` appended. Without the mock the import refuses these dishes as "cannot simulate". After the lead appends both abilities, these mocks should be removed (or left as no-ops) and both files re-run.

## VERIFIED OK

- **VERIFIED OK — the seven new test files plus the schema 5 import tests.** Command: `npx vitest run` on low-light, mixotrophy, canopy-a05, mode-saves, algae-determinism, predation-hooks, cue3-mode, `tests/persistence/phase5-import`, `tests/persistence/migration-schema5`. Result: `Test Files 9 passed (9); Tests 106 passed (106)`, 429.6 s.
- **VERIFIED OK — the fence is unchanged.** Command: `npx vitest run` on `g2-replay`, `rc1-replay`, `trajectory-fence*` (5 files), `conservation-closed-lid`, `determinism`, `determinism-g3`. Result: `Test Files 10 passed (10); Tests 77 passed (77)`, 417.9 s. g2 saves and the rc1 corpus load and continue bit-identically, and every recorded ruleset is kept.
- **VERIFIED OK — reloads at arbitrary ticks, including the D-0113 trap.** The probe dish is the hardest case:
  - 6 growing A05 canopy colonies (B 4), 16 A04 (a quarter of them E06 carriers), A03 and A01;
  - a sugar patch, the cycle on, and a per-cell baseline of 0.45–0.55, so dusk crosses the 0.25–0.35 band at different ticks;
  - 33 A04 inoculations queued at tick 0 as pending commands for ticks 3, 92, … next to the canopy.

  One run was uninterrupted to tick 3,000. A second was reloaded with serializeWorld → JSON → deserializeWorld every 7 ticks and on every command tick: 457 reloads. At those reloads the recomputed derived.light differed from the live world's in 12,319 cell-reloads, so the canopy-recompute hazard was really exercised. The run also had 344 mode switches and 1,174 births (A04 437 alive at the end).

  Result: equal stateHash and equal `trajectoryDigest('full')` at 3,000. A stage-5 hook counted Active A04s with mode 0 at intake: **0**.
- **VERIFIED OK — real save files at switch ticks and command ticks.** A third run reloaded through buildSaveFile → loadSaveFile (the real import with checksum) 24 times. The reload ticks were the first 12 switch ticks and every third command tick, so in those cases the inoculation runs in the first stage 1 after the load. Every import was accepted with an equal hash, and the run ended equal in hash and full digest to the uninterrupted run. checkLedger ok.
- **VERIFIED OK — a paused inoculation (applyNow) followed by a save.** At tick 950 (dusk), two A04s were inoculated while paused. Mode 0 was saved and accepted, and the run equals the never-reloaded world after 300 ticks (hash and full digest).
- **VERIFIED OK — metabolicMode is hashed.** Flipping one A04's mode changes stateHash. While every slot holds 0 the column stays hash-neutral (D-0035 `FIRST_HASH_NEUTRAL_COLUMN`; serialize.ts:357-361), so tick-0 founders and every world without A04 hash as before. The fence and the builder's NEUTRAL test agree.
- **VERIFIED OK — the initialization proof and its mutant.**
  - mode-saves "THE initialization proof" passes: uninterrupted light ≥ 0.35 against reloaded light < 0.35 at the target cell, then equal hash and full digest at T+300.
  - The builder's commands.ts mutant log (`tmp/e2-light-algae/mut1.txt`) shows the mutant failing at mode-saves.test.ts:229, `expected 2 to be 1`. That is a genuine divergence, not a harness artefact.
  - `git diff src/sim/commands.ts` is empty.
- **VERIFIED OK — the stage 4 update covers every living A04.** `updateMode` (movement.ts:450) runs before any `continue` in the stage 4 loop, so held, non-Active and non-self-propelled A04s are updated too. The newborn mode (births.ts:320, 333) reads the parent's mode before either write and the stage 2 light of the same tick. allocate clears the new slot.
- **VERIFIED OK — the import validates the new state.**
  - phase5State.ts refuses an unknown mode ("An organism has an unknown feeding mode.").
  - It refuses a mode on a non-MIXOTROPHY organism, and does the same for held-sample rows. Each refusal ends " Nothing was loaded." (phase5-import tests 289-290, 411, all passing).
  - Mode 0 on an A04 is accepted, as a tick-0 game save needs.
  - No schema or protocol change was made, and COLUMNS_ADDED_IN[5] is unchanged by e2.
- **VERIFIED OK — the ledger is unaffected.** Mode is not material. Route products (sugar and O2 on the photo route, O2 use on the field route) go through the existing commit paths. The builder's closed-lid 10,000-tick conservation tests pass (algae-determinism, canopy-a05), and the probe's checkLedger is ok.
- **VERIFIED OK — no stray randomness and no order dependence.** mixotrophy.ts, the intake.ts, movement.ts and births.ts diffs, and species.ts draw no randomness. They use no Date and iterate no Map, Set or object keys. The only collection is a lookup-only WeakMap keyed on the immutable `world.species` array. `world.species` is `readonly` and never mutated (the only `species.push` is experiments.ts:423, a report array). A reloaded world rebuilds the cache.
- **VERIFIED OK — event shapes are hash-safe.** `'modeSwitch'` carries only numbers (`detail.light`, a Float64 that round-trips through JSON exactly). The event ring and nextEventId are saved but not hashed. Equal full digests across all reloads show the ring is reproduced.
