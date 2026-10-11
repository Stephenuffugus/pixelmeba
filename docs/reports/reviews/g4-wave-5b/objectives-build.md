# P4.4 Objective engine and goals: build report (wave 5b, objectives)

Builder: objectives (stage 2). Date 2026-10-11. Nothing committed (the lead commits).

## Where the assignment and the code differ (the code wins)

- `goalCatalog` is `{ requestId, targetDishId: string | null, recipeId }`, not `dishId: string | null`. DishHost.handle and sim.worker.ts index dishes by any message's `dishId` on their error paths (`'dishId' in msg ? this.dishes[msg.dishId]`), so a nullable `dishId` does not typecheck there. The reply is `{ type: 'goalCatalog', requestId, goals: GoalOffer[] }`, where `GoalOffer = { id, title, summary, completedText, endedText | null }`.
- `goalStart` and `goalLeave` are answered by the existing `'notebook'` reply (record + `refused?`). `goalShown` has no answer.
- NotebookWatch: besides the constructor line and the afterTick line, it has a `readonly goals: GoalRunner` field, a `this.goals.bind(world)` line in `rebind`, and three lines in `notebookAfterRestore`. Those three lines run `goalsAfterRestore` first, and they post a `{ kind: 'goal' }` change only when neither favorites nor stories changed. When favorites or stories did change, the record is still updated and the UI derives the goal sentence from the record.
- No stage hook was added. None of the five predicates reads a measure that needs ArmObserver's stage hook (intake, consumed and infections do; births, converted, alive and biomass do not). `ObjectiveWatch` calls only `obs.afterTick`. `NotebookWatch.hook` is untouched.
- Registry phase filter: `registry.objectives`/`objectiveIds` still hold every parsed record, as experiments do. Shipped goals come from `objectiveCatalog(registry)` (phase ≤ buildPhase). The validator checks a later-phase objective's shape (types, numbers, 'custom', offerOn) but skips its references and enabled-ness.
- `ObjectiveSchema`: `summary` and `completedText` are required, `endedText` is optional (the validator requires it for keepSpeciesAlive), and `offerOn` defaults to []. content/objectives was empty, so requiring the two fields breaks nothing.
- Completion and end ticks are `world.tick` after the step that showed them. A birth that commits while tick m runs (its event tick and milestone are m) is recorded at m + 1. On the Garden, seed 104729: milestone 350, completed at 351, shown as 0:35.

## Checklist

### Build
1. Content
   - DONE: ObjectiveSchema gains summary, completedText, endedText?, offerOn (src/sim/content/schema.ts, ObjectiveSchema).
   - DONE: `objectivePredicateProblem(def, ctx)` (src/sim/objectives.ts), called from validateContent (src/sim/content/registry.ts, the "Objectives (P4.4)" loop). It refuses unknown species, fields, regions, enzymes and event types; a non-finite or ≤ 0 duration or threshold; 'custom'; an unknown param key; durationSeconds on a type that takes none; a species on a conversion goal ("names no producer"); keepSpeciesAlive without endedText; an unknown offerOn recipe; and transferAcrossGate without an enabled `kind: 'edge'` structure. Proven by tests/content/objectives.test.ts "refuses …".
   - DONE: a phase > buildPhase objective is skipped, not an error. tests/content/objectives.test.ts "a phase 5 objective is skipped" and "registryWith(G2_LISTS)".
   - DONE: content/objectives/{SEE_SPRINTER_SPLIT,KEEP_SPRINTERS_GOING,WATCH_STARCH_BECOME_FOOD}.json, phase 4, with the copy from the assignment. `npx tsx tools/content-validate.ts --write` printed "content ok · contentHash d3fbd36c…", and content/manifest.json contentHash changed. No other manifest field changed.
2. Engine (src/sim/objectives.ts)
   - DONE: `ObjectiveWatch(pred, world, resume?, gates?)` has its own ArmObserver and is evaluated after every tick.
     - It skips a call with no new tick (a command between ticks is seen at the next tick).
     - Start checks state predicates at once (no Sprinters at Start ends the attempt; a range already held starts its hold).
   - DONE: the five types. Each passes, waits and ends in tests/sim/objectives.test.ts.
     - keepSpeciesAlive is latched.
     - biomassThreshold reads a species or all biomass.
     - transferAcrossGate goes through `GateReading` (null means not supported, so the goal is never offered).
     - observeEvent: birth via the observer's births (pendingBirths); conversion via `obs.converted`; other types via the event ring.
     - fieldInRange uses `regionMean` over TRAIT_REGIONS cells (quarterOf); leaving the range resets the hold.
   - DONE: `ObjectiveProgress { startTick, holdSinceTick, state }`. A resumed watch uses saved progress and a fresh observer at the load tick.
   - DONE: `objectiveManifestProblem` / `objectiveSupportProblem` gate on the world's recorded manifest plus world.species and world.fields.
3. Goal state
   - DONE: GoalRecord, goalsProblem, goalsWorldProblem and GOALS_MAX 20 (src/persistence/notebookGoals.ts).
     - `KIND_PROBLEMS.goals` and the optional `goals?` key are in notebook.ts.
     - `notebookIsEmpty` counts goals.
     - The world check refuses a predicate species the dish lacks and a running goal that starts after the dish time. A finished record may carry ticks later than an Undo-restored dish, as journal entries do.
   - DONE: GoalRunner (src/worker/goals.ts):
     - start: refused while another goal runs or when the dish does not offer the goal; it copies title and predicate; the 21st record removes the oldest record that is not running.
     - afterTick writes the hold progress into the record and settles the goal → `{ kind: 'goal', id, state }`.
     - leave: running → continuedFreely, endReason 'left'; the latest ended record → continuedFreely, keeping its end tick and reason.
     - shown and bind (resume).
     - `goalsAfterRestore`: running → ended 'undone'.
   - DONE: Undo and error rollback end a running goal 'undone'; a completed goal stays completed. Proven by goals-host "Leave goal → … Undo".
   - DONE: a reload resumes a running goal. Proven by goals-host "round-trip".
4. Catalog: DONE.
   - `goalCatalog(registry, { world } | { recipeId, manifest })` takes the recipe from the variant's sourceId, else from provenance.recipeId when the dish was created from a recipe.
   - Host case 'goalCatalog'; a comparison arm gets [].
5. UI
   - DONE: GoalChoice (src/ui/panels/GoalChoice.tsx) is mounted under Start in Play.tsx. "No goal" is checked by default. Start calls `startRecipe('FIRST_DISH_V1', …, playGoalChoice.value)`, which runs `goalStart` through startDish's onStarted, at tick 0 with the dish paused.
   - DONE: GoalRow is in MoreSheet. While a goal runs it shows "Goal: {title} — running since {m:ss}" and Leave goal. Otherwise it shows the last record's line and "Try a goal…", which lists the offers.
   - DONE: the goal sentence (src/ui/goals.ts) is `requestNotice({ kind: 'goal' })`:
     - Continue when completed; Try again and Continue freely when ended. ✕ and Continue mark it shown via `goalShown`.
     - No call to setSpeed anywhere.
     - Goal changes autosave.
   - Strings are in src/ui/strings/goals.ts; the goal texts come from content through goalCatalog.

### Done when
- tests/sim/objectives.test.ts: DONE, 17 tests.
  - Every predicate type passes, waits and ends; the gate type uses a fake reader.
  - The three goals on FIRST_DISH_V1 complete at split 351 (= milestone + 1), starch 2 (the first tick with conversionTotals.starch > 0) and keep 1800.
  - Blocked or cancelled proposals:
    - Crowding fixture: five ready B01 in one stone-ringed cell. The asserts confirm each drew its proposal (propG0 ≥ 0) and is blocked with DIV_BLOCK_CROWDING. Killing one parent that holds a drawn proposal still gives no birth. Killing a second makes the next tick commit, and the goal completes at milestone + 1.
    - Agent-cap fixture: a ready B01 plus Sunbeads up to AGENT_CAP. capacityBlocked and DIV_BLOCK_CAPACITY are asserted and the goal keeps running; freeing one slot completes it at that tick.
  - The starch goal: enzyme painted around Crumbsmiths with no starch gives 0 conversion over 300 ticks and the goal keeps running; with starch it completes.
  - keepAlive ends at the first zero tick, and a later inoculate does not revive it.
  - Save → load at ticks 349 and 347 (split goal), 351 (keep, right after the first commit, mid-second) and 1 (starch) completes at the same ticks as the uninterrupted run.
  - Read-only: 3,000 ticks with seven watches (all five types) give equal stateHash and trajectoryDigest(full).
  - Import rule: no src/sim file outside src/sim/content imports the engine.
- tests/worker/goals-host.test.ts: DONE, 9 tests.
  - Nothing runs without goalStart.
  - Catalog.
  - Completion never changes speed: running stays at 4× and keeps advancing; a paused dish advanced by step stays paused.
  - leave → continuedFreely; undo → ended 'undone'.
  - Save → load round trip; a resumed goal completes at the uninterrupted tick (1820).
  - 11 malformed records each drop the notebook with notebookDropped, and the world loads with the same stateHash (also through importDish).
  - A stage 1 notebook and a g2 save load with no goals, and nothing runs.
  - At 4× for 3,200 ticks, goals started, completed, left, shown and resumed across a save → load give equal stateHash and full digest.
- tests/content/objectives.test.ts: DONE, 4 tests.
- tests/e2e/goals.spec.ts: DONE on desktop and phone-portrait.
  - No goal is checked by default, then See a Sprinter split → Start → More shows it running → Run, 4×.
  - "A Sprinter split at 0:35." appears with role=status while the dish runs at 4× and time advances.
  - Continue dismisses it; More shows "Last goal: See a Sprinter split — completed at 0:35."
  - Axe passes on the Play card with the goal choice and on the sentence; the choice rows are ≥ 48 px.

## Files
- New:
  - src/sim/objectives.ts, src/worker/goals.ts, src/persistence/notebookGoals.ts
  - content/objectives/*.json (3)
  - src/ui/goals.ts, src/ui/panels/GoalChoice.tsx, src/ui/strings/goals.ts
  - tests/sim/objectives.test.ts, tests/worker/goals-host.test.ts, tests/content/objectives.test.ts, tests/e2e/goals.spec.ts
- Owned edits: src/sim/content/schema.ts (ObjectiveSchema), src/sim/content/registry.ts (import plus the objectives loop).
- Shared additive edits:
  - src/persistence/notebook.ts: import, `goals?` key, KIND_PROBLEMS.goals, worldRefsProblem line, notebookIsEmpty.
  - src/worker/notebookWatch.ts (see above).
  - src/worker/protocol.ts: 4 ToWorker messages, the goalCatalog reply, GoalOffer, NotebookChange 'goal'.
  - src/worker/host.ts: import plus the goalStart/goalLeave/goalShown/goalCatalog cases.
  - src/worker/client.ts: 4 methods.
  - src/ui/views/Play.tsx, src/ui/panels/MoreSheet.tsx, src/ui/styles.css (goals block).
  - src/ui/state.ts: import, wireGoals line, startRecipe's optional goal.
  - content/manifest.json: contentHash only.

## How the tests were checked against the mechanism
- Whole-second cadence mutation (`if (world.tick % 10 !== 0) return false` in ObjectiveWatch.afterTick): "three goals" failed (split 360, expected 351) and "save → load" failed (380 against 360). The mutation was reverted, and grep confirms no MUTATION line is left.
- The command-between-ticks guard is pinned by `expect(watch.afterTick(w)).toBe(false)` after a kill between ticks.
- The blocked fixtures assert the precondition (drawn proposal plus crowding or capacity block code) on the same ticks where the goal must stay running, so an engine that counted proposals or block states would fail there. That mutation was not run.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint <all files above>`: clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/sim/objectives.test.ts tests/worker/goals-host.test.ts tests/content/objectives.test.ts tests/persistence/notebook.test.ts tests/content/validator.test.ts`: "Test Files 12 passed (12) / Tests 115 passed (115)", 965 s on a shared machine.
- `E2E_PORT=4274 E2E_OUTDIR=tmp/dist-objectives npx playwright test tests/e2e/goals.spec.ts --project=desktop --project=phone-portrait`: "2 passed (2.1m)". Port 4274 was stopped before and after.
- `npx tsx tools/content-validate.ts --write`: content ok, contentHash d3fbd36c4a5e03468389b02508f2a3ecc1ce8d04b25cba5dd5e5be18f184a8bf. If stories adds content after this, the hash must be rewritten again.

## FENCE
None. g2-replay and the four trajectory-fence files pass unchanged; the change adds no sim rule (D-0072).

## Bugs and notes elsewhere
- The stories builder's src/worker/stories.ts briefly failed tsc (Uint8Array<ArrayBufferLike>) mid-wave. It was clean on my last run.
- NotebookChange from notebookAfterRestore is a single value. When favorites or stories and a goal all change on one Undo, the `{ kind: 'goal' }` change is not posted (the record still carries it). The UI reads goals from the record, so nothing is lost. A list return type would be cleaner (lead's call).

## PROPOSED DECISIONS
1. Where the engine lives: the evaluator is src/sim/objectives.ts. It is pure and read-only like GateWatch, reads entity columns, fields, the event ring and its own ArmObserver, and nothing in the tick imports it (a test checks this). The per-dish runner and the goal state are src/worker/goals.ts and notebook kind 'goals' (D-0070, D-0071).
2. Objectives use only the five named predicate types; 'custom' is refused (it stays for experiment gates, and PredicateSchema is unchanged).
3. Undo or an error rollback while a goal runs ends the attempt with endReason 'undone' at the restored tick (the observer cannot rewind, as for experiment cards, D-0027). A completed record stays completed even when Undo rewinds the dish before its ticks.
4. Evaluation is per tick, and the completion tick is the dish tick after the step that showed it (a birth committed during tick m completes at m + 1). Start evaluates state predicates at once: no Sprinters at Start ends the attempt, and a threshold already met completes it.
5. Continue freely on an ended attempt turns it into 'continuedFreely' and keeps its end tick and reason. Try again is a new attempt from the current tick. Leave on a running goal records endReason 'left'.
6. The sentence's "shown" flag is saved in the record (`goalShown`), so a dismissed sentence never returns after a reload, and an unseen completion is shown when the dish reopens.
7. Goal records copy the title and predicate at Start. The sentences' texts come from the current content by objective id, with fallback strings for a goal this build does not ship.
8. A gate is any enabled structure of kind 'edge'. A transfer goal counts from Start, or from the load tick for a resumed watch, because a fresh reader cannot know the amount moved before the load. Phase 5 revisits this when gates exist.
