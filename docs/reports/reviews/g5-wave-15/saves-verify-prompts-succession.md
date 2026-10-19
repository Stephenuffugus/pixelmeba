# Wave 15 · saves/determinism verify · prompts-succession

Verifier: saves and determinism lens only. No tracked file was edited except this report. All probes are under
`tmp/verify-saves-g5-wave-15-0/`: `probe-host.test.ts`, `probe-sim.test.ts` and `vitest.config.ts`. Run them with
`cd tmp/verify-saves-g5-wave-15-0 && npx vitest run --config vitest.config.ts <file>`.

Verdict: **ok = false** (two MAJOR findings).

## Problems (most severe first)

1. **MAJOR [prompts-succession] src/sim/objectives.ts:951 (used at 1186)**: a LIVING_BRIDGE external input is lost across save → load.
   - **What is wrong:** `endOn: ['externalInput']` compares the ledger inputs with `inputBase`. `inputBase` is not saved progress: a resumed watch rebuilds it from the loaded world's `ledger.inputs`. An Add Life (or any input) made between ticks is "seen at the next tick". If the dish is saved before that tick, the resumed goal takes the input as its base and never ends. The uninterrupted run ends at the next tick. A paused dish that gets an Add Life and is then backgrounded (autosave) or saved hits this path.
   - **Repro:** `probe-host.test.ts`, "probe A". A FUNGAL_SUPPLY_LINE_V1 DishHost dish; Start LIVING_BRIDGE; run to tick 50 at 4×; command `inoculate B01 ×2`; saveSlot → loadSlot; run to 60.
     - Uninterrupted: `ended` at 51.
     - Reloaded: `running`, endTick null. The stateHash is equal (`f59aa418c598d4e4`), so the world itself is unaffected.
   - **Possible fixes:** save the input base (c, n, m) as one more progress key for an `externalInput` goal, validated finite and ≤ the ledger. Or read the inputs the command log recorded since `lastTick`.

2. **MAJOR [prompts-succession] src/persistence/notebookGoals.ts:232 with src/sim/objectives.ts:735**: the whole notebook is dropped on load when a running cycle-window goal's dish was switched to fixed light.
   - **How it happens:**
     - `goalWorldRefsOf` now passes `cycle: lightMode === 'cycle'`.
     - `objectiveRefsProblem` refuses a `window: 'cycle'` goal on a dish that is not cycling.
     - `goalsWorldProblem` turns that into a notebook problem, and D-0073 then drops every kind: favorites, stories, goals, bookmarks, gallery, challenges and succession.
   - **Why this is a legitimate state:** `setLightMode fixed` is an ordinary player command. The running watch keeps running through it, counting nothing in fixed light, as designed (Proposed decision 4).
   - **Repro:** `probe-host.test.ts`, "probe B".
     1. Make an H08 New Dish (empty, `H08_NIGHT_LANTERNS`) and Add Life B09 and A01.
     2. Start NIGHT_GARDEN and run to 30.
     3. Send the command `{ kind: 'setLightMode', mode: 'fixed' }` and run to 40.
     4. saveSlot → loadSlot. The loaded message carries `notebookDropped: "This dish's notebook (favorites, story cards, goals, … succession …) could not be read, so it was left out."`, and the goals go from `[NIGHT_GARDEN running]` to `[]`.
   - **Possible fixes:**
     - Do not check `cycle` in the load-time refs: a running goal on a dish without a cycle resumes and counts nothing, as it did before the save.
     - Or let GoalRunner.bind end that one goal ('failed', with its endedText) rather than refusing the record.
     - Also consider ending the goal when the light is switched to fixed.

3. **MINOR [prompts-succession] src/persistence/notebookSuccession.ts:232**: `successionRefsProblem` checks less than the brief's item 4c asks.
   - **What it checks:** species ids, `toTick ≤ tick`, and event ids `< nextEventId`.
   - **What it does not check:**
     - whether a `history:<second>` id is a sample the dish holds;
     - whether a gain or loss `value` equals the held samples' difference;
     - whether an `event:<id>` lies in the entry's minute.
   - **Effect:** item 4c asks to refuse "a value the dish never had", but an imported file can carry invented gains or losses with valid-looking evidence.
   - **Repro:** take a sealed notebook whose `succession[0].lines[0]` is `{ kind: 'gain', species: 'B01', value: 999, evidence: ['history:1', 'history:60'] }`, on a dish at tick ≥ 600 that holds B01. It passes `readNotebook`, because no check reads `world.history`.
   - **Possible fix:** check the gain/loss values and the history seconds against `world.history.seconds` while the samples are held (the per-second horizon), and event ids against the ring's ticks while it holds them.

4. **MINOR [prompts-succession] src/persistence/notebookGoals.ts:136**: a saved `progress.cycle` is checked only as an integer ≥ 0, never against the dish's cycle index at its tick.
   - **Effect:** a forged or stale value (e.g. `cycle: 99` at tick 100) passes validation. The resumed watch then silently forgets its saved clauses and amounts at the first tick, because the index differs. A file the app wrote never has such a value.
   - **Repro:** edit the progress of a running NIGHT_GARDEN goal record to `cycle: 99` and re-seal it. It loads, and the saved `clauses` are reset at the next tick.
   - **Possible fix:** `goalsWorldProblem` could refuse a `cycle` value other than `floor((tick − 1 − cycleStartTick) / 2400)` (or that index ± 1 at a boundary tick).

## VERIFIED OK

- **VERIFIED OK: FOOD_RELAY resumes bit-exact at awkward moments.**
  - Setup: SHARED_LUNCH_V1 with Add Life B04 ×10.
  - Save points: progress → JSON → serializeWorld/deserializeWorld at ticks 1, 2, 3, 600, 1470, 1471, 1472, 1519 and 1520. These include right after a clause first appears (2, 1471) and right before the completion (1520).
  - Every resumed run completes at the uninterrupted tick (1521) with an equal stateHash. Evidence: `probe-sim.test.ts` "probe C", passed.
- **VERIFIED OK: LIVING_BRIDGE resumes exactly** (the transfer amount and `pendingFungalTransfer`).
  - Save ticks: 1, 9, 10, 11 (whole-second boundaries), 60, 100, 129, 130, 131 and 135 (one tick before completion).
  - Every run completes at 136 with an equal stateHash (`out-G.json`, "probe G").
- **VERIFIED OK (partial): NIGHT_GARDEN across a cycle boundary.**
  - The fixture glow never produced a glowOn record in my window, so neither run completed. The uninterrupted run forgot its cycle-0 clauses at tick 2401 (`clauses [null, 2401]`, `cycle 1`).
  - Resumes at 2396, 2398, 2399, 2400, 2401 and 2402 all gave equal state and stateHash (`out-D.json`, "probe D").
  - The builder's goals-p5-host and objectives-p5 tests cover the completing case (completion at 50 after a resume at 30).
- **VERIFIED OK: 1× vs 4× through DishHost.**
  - Setup: SHARED_LUNCH_V1 + B04 with FOOD_RELAY running, 1,800 ticks.
  - Equal: the stateHash, the succession entries (JSON) and the goal records (JSON). Evidence: `probe-host.test.ts` "probe E", passed.
- **VERIFIED OK: succession across saveSlot → loadSlot.**
  - A save at tick 600, right after minute 1's entry is written, gives minute 2's entry identical to the uninterrupted run.
  - A save at 599 gives minute 1 `watchedFromTick: 599` and minute 2 identical.
  - The stateHash is equal in all three runs ("probe F", passed). The "first seen" set is rebuilt from the saved entries, so no link repeats after a reload.
- **VERIFIED OK: the detector and the watch are read-only.**
  - `succession.ts`, `objectives.ts` measureStage, `relationships.ts` creditedConversions, `poolTotal`, `tookFromPool` and `isFieldActive` only read world state.
  - None of them uses Math.random, Date, performance.now or Map/Set order in an output. Object.keys is used only for validation messages, and producer and wake keys are sorted.
  - The rollback replay (`host.ts` rollback) steps with no hooks.
  - The builder's hash tests pass: succession-host and goals-p5-host, on vs off, 3,000 ticks at 4× with a mid-run save → load.
- **VERIFIED OK: no world hash change.**
  - Notebook kinds are outside the world checksum and stateHash. `notebookIsEmpty` counts the new kind.
  - `favoritesOnly` (Duplicate, a checkpoint branch) does not copy the kind.
  - The new progress keys are present only for predicates that use them (`progressKeysOf`), so a v1.0 goal record keeps exactly its keys.
- **VERIFIED OK: v1.0 saves.**
  - Run: `npx vitest run tests/fixtures/rc1-replay.test.ts tests/persistence/notebook-v1-compat.test.ts tests/persistence/notebook-succession.test.ts tests/persistence/bookmarks.test.ts tests/persistence/notebook.test.ts tests/worker/succession-host.test.ts tests/worker/goals-p5-host.test.ts`: 7 files, 60/60 passed (406.9 s).
  - The rc1 corpus and HEAD's notebook (`tests/fixtures/notebook-v1/head-notebook-t900.pixelmeba.gz`) load unchanged and re-seal byte-identically.
  - NOTEBOOK_VERSION stays 1 (D-0131).
- **VERIFIED OK: the new state is validated on load.**
  - The new goal keys (lengths, tick ranges, finite amounts ≥ 0) and the succession kind (shape, the evidence grammar, ≤ SUCCESSION_MAX = 40, ≤ 12 lines, ≤ 5 evidence ids, event ids < nextEventId, `toTick ≤ tick`) are validated.
  - A failure drops the notebook with NOTEBOOK_DROPPED_TEXT while the dish loads: this is the D-0073 notebook pattern, not a world refusal, so "Nothing was loaded." does not apply.
  - The challenge region `{ kind: 'habitat', id }` is checked against the baseline's recorded habitat regions (`challengesWorldProblem` with `regions`). Earlier challenge records validate unchanged (region injection only with a Phase 5 parameter).
- **VERIFIED OK: no simulation randomness outside src/sim.** Nothing in this task draws randomness: no rng import in the new worker or persistence files.
