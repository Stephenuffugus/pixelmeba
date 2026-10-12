# Wave 6b — custom challenge editor build (P4.8 part c)

Builder: challenge-editor. Date 2026-10-11. Nothing committed (the lead commits).

## Where the code differs from the assignment (the code wins)

- **The budget counts from a sequence number, not a tick.** The assignment says "accepted commands … with tick >= the turn's start tick". A command applied while the dish was paused at the baseline tick has `targetTick` equal to the start tick, so a feed made just before the challenge was saved would have been counted. The turn's challenge therefore records `startSeq` (the cloned world's `commands.nextSeq`), and the budget counts accepted, counted commands with `seq >= startSeq`. It is still read from the world's own log, so Undo gives an action back. The host test feeds the source dish just before saving, so it fails if `startSeq` is ignored.
- **The turn's `challenge` field has two extra fields:** `startSeq` (above) and `predicate`. With `predicate`, Another turn starts the same goal without reading the source dish.
- **One shelf baseline per paused moment.** A shelf holds at most 10 baselines per device, while a dish holds up to 20 challenges. Challenges saved at the same paused moment share one shelf record, matched by state checksum.
- **Host edits beyond "one refusal line".** They are small and labelled P4.8c:
  - `openTurn` takes an optional `challenge`. Its goal is the challenge's own `ObjectiveDef`, built by `turnChallengeDef`.
  - `tryNext` passes `t.challenge` on, and the next turn's notebook gets the challenge records. Without this, Another turn would have reopened the dish with no limits.
  - The `goalStart` case also resolves the open challenge turn's own goal id (`CHALLENGE_<n>`). Without it, the goal notice's "Try again" on a challenge turn was refused.
  - New cases and private methods: `challengeSave`, `challengeExport`, `challengeStart` and `challengeBlocked`.
- **The challenge is started through new host methods.** It does not use 'goalStart': `challengeStart` → `openTurn(…, { challenge })`, then `GoalRunner.start(world, turnChallengeDef(…), true)`.
- **notebook.ts has two more additive lines.** `worldRefsProblem` calls `challengesWorldProblem`, so an unknown species is caught at import against the dish's recorded manifest. `notebookIsEmpty` counts challenges; without that, a dish holding only challenges would not write its notebook.
- **Protocol.** There is one extra unsolicited message, `challengeBlocked { dishId, message }`, posted with the refused command's ack. The UI's command paths ignore `ack.error`, and this is how every path (Explore, Lab, Sample, lineage) gets the player's toast. `challengeStart { check: true }` is answered by `challengeChecked`. It is read-only, and the Start sheet uses it to show "This dish has changed…" before Start.
- **Dish keys.** DishScreen got one more line, `challengeSheetKey`, so the editor/start sheet blocks dish keys and Esc acts as Cancel. This works like the Share and Try my dish sheets.

## Checklist

### Build
1. **ChallengeRecord, kind 'challenges' — DONE.**
   - `src/persistence/notebookChallenges.ts`: `ChallengeRecord` at :65, `challengeInputProblem` :138, `challengeProblem` :174, `challengesProblem` :188 (≤ 20), `challengesWorldProblem` :207.
   - The objective goes through `typedPredicate`, the engine's predicate check: the five types only, never 'custom'; numbers finite and above 0; known fields, regions, events and enzymes. Params must be numbers, or ids matching `^[A-Za-z][A-Za-z0-9_]{0,63}$`. A duration longer than the turn is refused. Regions are dish or a quarter only.
   - Wired in at `src/persistence/notebook.ts`:21, :89-90, :252-253, :267 and :349.
   - Proved by tests/persistence/challenge-export.test.ts ("malformed challenges…").
   - ToolGroup and its command-kind mapping are in `src/worker/challenge.ts` `toolGroupOf` :72.
   - transferAcrossGate:
     - the editor disables it with "This dish has no gate to measure." (`gateAvailable` in src/ui/challenge.ts);
     - the worker refuses it (`objectiveSupportProblem`);
     - the file check drops it.
2. **Editor — DONE.** `src/ui/panels/ChallengeEditor.tsx`, sheet 'challenge', view 'edit'.
   - Opening it pauses the dish, and Cancel/Esc restores the speed.
   - Fields: name; five type radios; species/threshold/field/min/max/duration/event/enzyme/region fields; tool checkboxes (all on); budget; 60/180/600 (180 default); a live restrictions summary.
   - Save: `challengeSave` (host :2705) stores the paused dish as a shelf baseline (or reuses that moment's record), and records `baseline = { worldId, tick, checksum: built.checksum }`.
   - `draftToInput` (src/ui/challenge.ts) emits typed values only.
3. **Start — DONE.** `src/ui/panels/ChallengeStart.tsx` StartView: the goal line, restrictions and turn line come first, then Start.
   - `challengeStart` (host :2761) keeps the open dish first (D-0033) and opens a Try my dish turn.
   - `TurnRecord.challenge` is in `src/persistence/notebookTurns.ts` (`TurnChallenge`), validated by `turnChallengeProblem`.
   - The baseline is the shelf record holding the checksum. Otherwise it is the open dish while its state checksum equals the baseline's; that dish is written to the shelf after the keep.
4. **Restrictions in the host — DONE.** The single line is host.ts:855, calling `challengeRefusal` (src/worker/challenge.ts :129).
   - Refusal texts:
     - "This challenge doesn't allow {tool}. The limit applies only inside this challenge."
     - "This challenge's {n} actions are used."
   - The budget counts accepted counted commands in the log since `startSeq`.
   - The refusal comes before `applyNow`, so the command takes no seq and leaves no state change.
   - Proved by tests/worker/challenge-host.test.ts.
5. **Leave challenge — DONE.** LeaveView, "Open an unrestricted copy", uses `client.duplicateKeeping` through the shared keep flow. The toast says "This copy has no challenge limits. The challenge turn is unchanged." `favoritesOnly` copies no turn and no challenges.
6. **Export / import — DONE.**
   - `challengeExport` (host :2743) takes the shelf baseline text, or the dish while its checksum still matches. It writes `challengeExportText`: the notebook holds this challenge only and the state is untouched. The file goes out through `saveTextFile`.
   - Import is the ordinary Import file. "Start challenge: {name}" is offered, and while the dish still matches (or the shelf holds the baseline) the check is null. Otherwise the refusal reads "This dish has changed since the challenge was made. Import the challenge file again to start it."

### Done when
- **tests/worker/challenge-host.test.ts — DONE (7 tests).** It covers:
  - a disallowed command (Add Life, Lid, Evolution) is refused, the hash and `nextSeq` are unchanged, and `challengeBlocked` is posted;
  - a deposit that placed nothing (accepted 0) is free;
  - two feeds pass and the third is refused with the hash unchanged;
  - lineage rename/pin and read-only queries are free;
  - Undo gives one action back;
  - outside a challenge everything is accepted, the unrestricted copy accepts everything, and the turn stays restricted;
  - Another turn keeps the limits with a fresh budget;
  - save refusals;
  - the objective completes at the same tick and value as SEE_SPRINTER_SPLIT from content;
  - never alters behaviour (below).
- **Never alters behaviour — DONE.** Same commands, 4×, 3,000 ticks, with a save → load at 1,500:
  - a dish with three challenges vs none: equal stateHash and `trajectoryDigest(world, 'full')`;
  - a challenge turn vs a plain copy of it: equal stateHash and digest.
- **tests/persistence/challenge-export.test.ts — DONE (5 tests).** It covers:
  - the round trip keeps the id `ch-1`, region topRight and the numbers;
  - the file checksum equals `baseline.checksum`, and the file's notebook holds only `challenges` and `favorites: []`;
  - a second device (empty shelf) can start, writing one shelf record after Start; a check writes nothing;
  - a third device whose dish ran on is refused with `changed`;
  - malformed records drop the notebook with `notebookDropped`, and the world hash and file checksum are unchanged. Cases: an unknown species, 'custom', budget 0/100/2.5, an unknown tool, a region on a non-range goal, an unknown region, a free mask, a script field, a string number, a gate goal, a duration longer than the turn, a bad checksum, a duplicate id, 21 records, and 1e999;
  - strip export names it "Shared challenge";
  - a failed import never touches the open dish.
- **tests/ui/challenge.test.ts — DONE (5 tests).** It covers the summary text word for word, the gate goal unavailable or refused without a gate, the defaults, typed-only output (16 refused drafts, and a name with markup kept out of the objective), and the goal line.
- **tests/e2e/challenge.spec.ts — DONE, desktop and phone-portrait.** The full journey as specified, plus:
  - expectNoSeriousA11yViolations on the editor and on the Start sheet;
  - ≥ 48 px checks;
  - the export file's checksum equals `baseline.checksum`;
  - the import offers "Start challenge" with Start enabled.

## How each test was checked against a broken mechanism
I ran three mutations on `src/worker/challenge.ts`, ran the tests against each, then restored the file:
- **`challengeRefusal` always returns null:** 3 host tests fail (refuses, outside/copy, Another turn).
- **The `accepted > 0` filter is removed:** "refuses a tool…" fails.
- **The `seq >= startSeq` filter is removed:** "refuses", "outside" and "Another turn" fail (after the test was strengthened with a feed just before the save).

## Commands and results
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/ui/challenge.test.ts tests/persistence/challenge-export.test.ts tests/worker/challenge-host.test.ts tests/persistence/notebook.test.ts tests/persistence/shelf.test.ts tests/ui/try-dish.test.ts tests/ui/goal-sentence.test.ts tests/worker/try-dish-host.test.ts` → `Test Files 15 passed (15)`, `Tests 124 passed (124)`.
- `E2E_PORT=4275 E2E_OUTDIR=tmp/dist-challenge npx playwright test tests/e2e/challenge.spec.ts --project=desktop --project=phone-portrait` → `2 passed (5.4m)` (phone-portrait 1.4m, desktop 3.9m).
- `npx tsc -p tsconfig.json --noEmit` → clean.
- `npx eslint` on every file I created or touched → clean.

## FENCE
None. No sim rule, no manifest or content change, no version change. The fence files pass.

## Bugs and notes for the lead
- **Undo ends a challenge's goal attempt** ('undone', D-0078: the observer cannot rewind). The player sees the sentence and can Try again, which now works on a challenge turn because of the goalStart line. The budget itself rewinds correctly. The owner may want a challenge goal to survive Undo; that would need a rewindable observer (out of scope).
- **The shelf's "full" text names Try my dish only.** `SHELF_TEXT.full` in src/persistence/shelf.ts reads "Try my dish starting points" even when a challenge save hits the 10-baseline limit. A wording fix belongs to the shelf owner.
- **Budget accounting depends on a capped log.** The command log is capped at 10,000 entries (commands.ts). After more than 10,000 free commands (renames) in one turn, old counted entries could fall off and the budget would refill. This is very unlikely; it is noted, not fixed.
- **Finish does not lift the limits.** A finished challenge turn stays restricted, because the restrictions follow the turn record. Leave challenge → Open an unrestricted copy is the way out (D07).
- **An e2e lesson:** on the 1440 px layout a stone sits under the viewport point (0.62, 0.62). A feed there is accepted 0 with the "can't go there" toast, so the journey taps open water at (0.7, 0.4).

## Files
- Created:
  - src/persistence/notebookChallenges.ts
  - src/worker/challenge.ts
  - src/ui/challenge.ts
  - src/ui/panels/ChallengeEditor.tsx
  - src/ui/panels/ChallengeStart.tsx
  - src/ui/strings/challenge.ts
  - tests/worker/challenge-host.test.ts
  - tests/ui/challenge.test.ts
  - tests/persistence/challenge-export.test.ts
  - tests/e2e/challenge.spec.ts
  - this report
- Changed, owned this stage:
  - src/persistence/notebookTurns.ts: TurnChallenge, validation, and `withoutTurnNotes` strips challenge names;
  - src/worker/tryDish.ts: `turnRecordFor` takes `challenge`, and the `cloneTurn` callback receives the world;
  - src/ui/panels/TryBadge.tsx: "Challenge · Turn 1 · 3:00 left".
- Changed, shared and additive:
  - src/worker/{protocol,host,client}.ts
  - src/persistence/notebook.ts
  - src/ui/state.ts: the sheet id and `wireChallenge`
  - src/ui/panels/MoreSheet.tsx: `<ChallengeMoreRows />`
  - src/ui/views/DishScreen.tsx: the render line and the key line
  - src/ui/styles.css: the `.ch-*` block

## Proposed decisions
- PROPOSED DECISION: tool groups are addLife (inoculate and lineage spawnSpecimen), feed (deposit, placeObject), habitat (paintSubstrate, paintShade, placeStructure, eraseStructure), sample, cleanWater, lid and evolution. Every other lineage op and every read-only request is free. spawnSpecimen counts as Add Life because it introduces organisms (D07 "successful placements").
- PROPOSED DECISION: the budget counts successful (accepted > 0) commands of the counted groups since the turn's start sequence number. A Sample counts once at Take; Transfer and Discard finish it and are not counted again.
- PROPOSED DECISION: no free region masks until the engine measures them. A challenge region is the dish or one of the four quarters, and only a field-range goal uses a quarter.
- PROPOSED DECISION: challenges saved at one paused moment share one shelf baseline. The challenge turn's notebook carries the challenge records, so Start and Export work from the turn. Duplicate never copies them.
- PROPOSED DECISION: a challenge's goal title is the challenge name. "Export without names or notes" writes "Shared challenge" instead.
- PROPOSED DECISION: a challenge turn stays restricted after Finish. Only an unrestricted copy lifts the limits.
