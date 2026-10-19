# Saves and determinism verification: measures-overrides + cards-curated (wave g5-wave-15)

Lens: saves and determinism only. Probes are in tmp/verify-saves-g5-wave-15-1/ (git-ignored). No tracked file was edited except this report.

**Result: ok = false.** One MAJOR, owned by the lead: the habitats-p5-equivalence key list fails, so `npm run check` is red. Neither task broke determinism or saves.

## Problems (most severe first)

- **MAJOR [lead] tests/fixtures/habitats-p5-equivalence.test.ts:37 and :44.** The test compares its key list before its values. `realizeGoldenEntries` walks every shipped recipe, so the 15 new Phase 5 recipes are extra `recipe:` keys and both tests fail. This leaves the lead's fence command and `npm run check` red.
  - Repro: `npx vitest run tests/fixtures/habitats-p5-equivalence.test.ts` gives "expected [ 'recipe:BRINE_CROSSING_V1', …(39) ] to deeply equal [ 'recipe:BROKEN_CATALYST_V1', …(24) ]". The full fence set gives "Tests 2 failed | 111 passed (113)".
  - No value moved. My probe (tmp/verify-saves-g5-wave-15-1/equiv.test.ts) filtered the run to the golden's own keys. All 25 entries equal the golden with the recorded habitat list, and every `stateHash300` is equal as shipped ("golden entries 25 extra 15"; passed).
  - Fix: compare only the golden's own keys, and assert that the extras are exactly the shipped phase-5 recipes.
- **MINOR [measures-overrides] src/persistence/saveFile.ts:390 (load path) and src/sim/serialize.ts:417.** `provenance.testOnlyOverrides` is new saved state, and the import never validates it.
  - Probe: tmp/verify-saves-g5-wave-15-1/forged.test.ts takes an EXP_214 save, edits it and recomputes the checksum. Every forged form loads:
    - `"x"`, `[1,null,{}]`, `{values:{speed:'fast'}}` and `{values:{maxB:1}}` all load. The junk lists still add the `testOnly` term with `[]`: hash bd31… against a171… with no list.
    - A claim that contradicts the copy (provenance says speed 0, the P10 copy holds 1.2) loads, and DishInfo then discloses an override "speed 1.2, normal 1.2".
    - With the key deleted, the speed-0 copies load with no disclosure and no hash term. That last hole is older than this wave: species copies are never hashed or checked against a record.
  - Determinism is not affected. The term is canonical, and a reversed list hashes the same (9d70e5bb9892).
  - Fix: when the key is present, require a list of `{ description: string, target: 'species:<ID>' of the world's species, values ⊂ TEST_OVERRIDE_FIELDS, each a number equal to the copy's }`. Otherwise refuse with a sentence that ends "Nothing was loaded."
- **NIT [measures-overrides] src/sim/serialize.ts:263.** The comment "stateHash never reads provenance" is now stale: stateHash reads `provenance.testOnlyOverrides` (:399). The migration's `migratedFrom` tag is still unhashed, so this is not a bug.
- **NIT [cards-curated] tests/experiments/observer-neutral-p5.test.ts:19.** The committed observer-neutral file covers only stage 1's seven recipes. Stage 2's eight are where the new tracked measures actually fire (the trap and handling events, intakePhoto/intakeSugar across a mode switch). My copy of the file with the eight (tmp/verify-saves-g5-wave-15-1/neutral2.test.ts) passes at 600 ticks for all eight, and at 1300 ticks for NIGHT_SHIFT_V1 (past modeSwitch at tick 1119) and L305. Suggest appending them.

## VERIFIED OK

- **rc1 corpus, g2 saves and override files.** Run together: `tests/fixtures/rc1-replay`, `g2-replay`, `tests/experiments/test-overrides`, `tests/worker/test-overrides-host`, `tests/persistence/recipe-file-test-overrides` and `trajectory-fence-current`. Result: 6 files, 71 tests passed. v1.0 saves load and continue bit-identically under their recorded ruleset.
- **Fence set and determinism files.** `trajectory-fence*`, `conservation-closed-lid`, `determinism`, `determinism-g3`, `p5-recipes-determinism` and `observer-neutral-p5`: 10 of 11 files pass. The only failure is the equivalence key list above.
- **fence.json diff.** One hunk, `@@ -291,0 +292,135 @@`, with 0 lines removed. The 15 added keys are exactly the 7 + 8 new recipes.
- **Saves at awkward moments** (tmp/verify-saves-g5-wave-15-1/awkward.test.ts):
  - Worlds: 19 in all, the 15 recipes plus arms EXP_208:B, EXP_215:B, EXP_217:B and EXP_214:A.
  - When: saves at ticks 0 and 1, and at t−1, t and t+1 of the first record of every event type.
  - Two paths each: `serializeWorld` → JSON → `deserializeWorld`, and `buildSaveFile` → `loadSaveFile`.
  - Each check: the canonical serialized world is equal after load, the stateHash is equal, and the continued run is equal at the end tick. Result: bad 0 everywhere.
  - Moments covered:
    - E213: trapArmed 1, trapHold 2, trapRelease 81.
    - E214: handlingStart 1, capture 40.
    - L305: capture 3, handlingStart 28, handlingBreak 30.
    - E210: rest 250, the scheduled deposits queued at tick 600 (checked at 599, 600 and 601), wake 750.
    - E218: modeSwitch 1119.
    - E215: linkFormed 1545.
  - Most worlds ran to H = 600; the second pass ran to H = 1800.
  - EXP_206:B starts at tick 1200 and was checked to 3000. Every save point at or after its start passed. The 12 "bad" lines in that run are a probe artifact: extra points 599–1121 fall before the arm's start tick.
- **4×.** Four `run(w, H/4)` give the same hash as the straight run for all 19 worlds.
- **E207 shutter toggle** (tmp/verify-saves-g5-wave-15-1/toggle.test.ts):
  - `setDevice` on the recipe's S03 (ids 1–4; nextDeviceId 5), closed at tick 300 and reopened at tick 900. Accepted 1 each time.
  - Saves at ticks 299, 300, 301, 899, 900 and 901, before and after the paused command, by both paths. Continued to tick 1500: identical.
- **The stateHash term is hash-neutral when empty.** It is written only for a non-empty list; an empty list hashes like an absent one (a171…). The rc1 assertion in test-overrides kills the "always written" mutant, as the builder reported.
- **Overrides change only the world's copy.** `withTestOverrides` replaces copies in a sliced array and never touches the registry. In the simulation, the only reader of `registry.species` is `worldContentFor`, which builds the copies; every other reader is a card view.
  - On load, the species table is compiled from the saved copies, so speed 0 survives a save: E214 continues identically from ticks 0, 1, 39, 40 and 41.
- **No new randomness or clock reads.** A grep of the new code in `src/sim`, `src/worker` and `src/persistence` finds no `Math.random`, `Date` or rng draw. Object-key iteration is sorted in the hash term.
- **Observers are never saved.** A reopened card dish ends 'closed' (`host.ts` 1757), and Undo ends 'undone' (`host.ts` ~1027). So the card's own shutter toggle, which does not end the card, cannot leave an observer bound to a replaced world.
- **SlotModes.testOnly always comes from the world.** Every host save path uses `slotMetaCopies(built.file)` (`host.ts` 1740, 2707, 2988, 3098, 3169, 3246), and `buildSaveFile` strips the caller's `testOverrides`.
- **RIVAL_EXPOSURE.** No committed golden reads `limitSeconds.*.RIVAL_EXPOSURE` (grep of `tests/` and `content/`). The only readers are this wave's tests and `EXP_217`.
- **Card and measure tests.** `e205-e211` (twice-identical runs), `e213-e218`, `measures-p5`, `experiment-steps-p5` and `tests/recipes/curated`: 5 files, 64 tests passed.
- **Recipe-file import refusal.** `loadRecipeFile` refuses a fixture recipe before anything is realized (`recipeFile.ts` 589–592). Experiment dishes still export `'no-start'`.
