# g4-wave-6b challenge-editor: fix round 2

The fixes are for P4.8 part c, the custom challenge editor. The findings come from docs/reports/reviews/g4-wave-6b/wave-reverify1.md.

## MAJOR: the challenge goal kept running after Finish. FIXED

**Problem.** Finish lifts a challenge's limits. The goal it started (CHALLENGE_n, titled with the challenge name) kept running anyway. A tool the challenge had refused could then complete it, and the notebook said "{name}: completed at {time}."

**Fix**

- `src/worker/challenge.ts` adds `challengeGoalEndsOnFinish(record)`. It is true only when both hold:
  - the turn is an active challenge (`challengeActive`: it has a challenge and is not finished);
  - the running goal is that challenge's goal (`objectiveId === challengeObjectiveId(ch.id)`).
- A content goal running on the turn is left alone.
- `src/worker/host.ts` 'tryFinish' gets one additive line, run before the turn becomes 'finished'. The line calls GoalRunner's own leave path through `this.watchOf(d)?.goals.leave(d.world)`. The goal record becomes `state: 'continuedFreely'`, `endReason: 'left'`, `endTick` = the Finish tick, `shown: true`. The change is announced with `notebookChanges(d, left)` after the `tryTurn` answer.
  - goalsAfterRestore only touches 'running' records, so Undo never reopens it.
  - The UI raises no notice for a continuedFreely goal. Its Goal row reads "left at {time}" (`lastGoalLine`).
- `turnChallengeGoal` (Try again on a challenge goal, used by the host's 'goalStart') now also requires `challengeActive(turn)`. After Finish, `goalStart CHALLENGE_n` is refused with `GOAL_REFUSALS.unknown` ("That goal is not available for this dish."). Without this a pending "ended" sentence's Try again could restart the goal with the limits off. This second path reaches the same dishonest "completed" line.
- The Finish toast for a challenge turn (`TRY_TEXT.finishedChallenge`, src/ui/strings/tryDish.ts) now says: "Turn {n} finished. The dish stays open, paused, as an ordinary dish: the challenge's limits no longer apply, and nothing after this counts for the challenge."

**Tests** (tests/worker/challenge-host.test.ts, against the real DishHost)

"fix round 2: Finish leaves the challenge goal too…" covers the following steps:
1. Garden at tick 30. Save a challenge: biomassThreshold B03 0.5, Feed only, budget 2. B03 is not in the Garden.
2. Start it. The goal is running, and Add Life B03 is refused.
3. Run to tick 40, then Finish. The goal is `continuedFreely`, `left`, `endTick: 40`, and a notebookChanged 'goal' continuedFreely is posted.
4. Add Life B03 is now accepted. Run to tick 100. The goals are still exactly `['continuedFreely']`, never 'completed'.
5. `goalStart CHALLENGE_1` is refused with GOAL_REFUSALS.unknown.
6. A second Finish adds nothing.

"fix round 2: control…" checks the same objective inside the challenge, with Add Life allowed:
- it completes by tick 40;
- Try again (`goalStart CHALLENGE_1`) is still accepted.

So the gate only bites after Finish.

**Mutation checks** (temporary edits, restored and verified with grep):
- The host line disabled (`&& false &&`): the round 2 test fails ("expected { id: 'goal-1', … } to match object { objectiveId: 'CHALLENGE_1', … }"), 1 failed | 1 passed.
- The `challengeActive(t)` gate removed from turnChallengeGoal: the round 2 test fails ("expected undefined to be 'That goal is not available for this d…'"), 1 failed | 1 passed.

## MINOR: what the budget counts (Habitat and Clean water use an action). NOT FIXED: owner decision

This is not a code defect. The canonical docs do not settle it, and docs/DECISIONS.md is the lead's file (decision numbers are assigned at integration).

D07 line 107 says: "Challenge allowances count successful placements and external loads … Configure and inspect are free."

The current reading:
- Habitat paint, structures and erase are counted as placements.
- Clean water is counted as an external load, because it is a logged material export, the counterpart of a deposit.
- Lid and Evolution settings count as configuration. They are free, although a challenge can still disallow them (fix round 1).

For the lead to record and to list in EXPANSION_RESPONSE §8:

PROPOSED DECISION: the challenge budget counts accepted Add Life (inoculate and lineage spawnSpecimen), Feed (deposit, placeObject), Habitat (paintSubstrate, paintShade, placeStructure, eraseStructure), Sample Take and Clean water. Sample Transfer and Discard finish a Take and do not count again. Lid and Evolution settings are configuration and never count, but a challenge can disallow them. Owner alternative: count only inoculate, deposit and placeObject, which is the narrowest reading of "placements and external loads". If the owner picks that, the change is one line in `countsAgainstBudget` plus the editor hint (src/ui/strings/challenge.ts budgetHint).

PROPOSED DECISION (from this round): Finish of a challenge turn leaves the challenge's running goal ('continuedFreely', 'left'). After Finish, the challenge goal cannot be started again on that dish. To play the challenge again, use Another turn or Start challenge from the baseline.

## Not mine, still open for the lead: MINOR [observation-notebook] the Storage row mislabels a challenge's starting point

This is unchanged from fix round 1. src/ui/storage.ts and `confirmBaseline` are observation-notebook's files. Suggested change:
- When the shelf record's `createdFor` starts with `ch-`, label it "Challenge starting point".
- Confirm with "Remove this challenge's starting point? Challenges already saved in dishes stay, but this device can no longer start or export them until the challenge file is imported again."

## Side note for the lead (no change made)

The existing 'tryFinish' path changes the notebook (the turn becomes 'finished', and now also a goal left) without the P4.7 `keptTurnMark` / `turnEdited` check. This round's goal leave follows the existing Finish behaviour and does not add one. A kept slot's notebook already differs once the turn is finished. If the lead wants Finish on a kept turn to clear `kept`, wrap the whole 'tryFinish' case in `keptTurnMark`/`turnEdited`. That is stage 1's code path, not this finding's.

## Files changed this round
- src/worker/challenge.ts (owned): `challengeGoalEndsOnFinish`; `turnChallengeGoal` gated on `challengeActive`; the `goalsOf` import; header comment.
- src/worker/host.ts (shared, additive): one line in 'tryFinish' (leave the challenge goal), one `notebookChanges(d, left)` call, and `challengeGoalEndsOnFinish` added to the existing `./challenge` import.
- src/ui/strings/tryDish.ts (owned this stage): `finishedChallenge` copy.
- tests/worker/challenge-host.test.ts (owned): two new tests, and the `GOAL_REFUSALS` import.

Nothing changed under src/sim/ or content/. No version, schema or protocol change.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint src/worker/challenge.ts src/ui/strings/tryDish.ts tests/worker/challenge-host.test.ts src/worker/host.ts`: exit 0.
- `npx vitest run tests/worker/challenge-host.test.ts -t "fix round"`: 4 passed | 7 skipped.
- The two mutation runs above: each 1 failed | 1 passed. Both were restored.
- `npx vitest run tests/worker/challenge-host.test.ts tests/ui/challenge.test.ts tests/persistence/challenge-export.test.ts tests/ui/try-dish.test.ts tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts`: Test Files 11 passed (11), Tests 85 passed (85), EXIT 0.
- `npx vitest run tests/worker/goals-host.test.ts tests/worker/try-dish-host.test.ts tests/ui/goal-sentence.test.ts`: Test Files 3 passed (3), Tests 28 passed (28), EXIT 0.
- `E2E_PORT=4275 E2E_OUTDIR=tmp/dist-challenge npx playwright test tests/e2e/challenge.spec.ts --project=desktop`: 1 passed (3.8 m). The port was stopped before and after. The journey's screens and copy are unchanged apart from the Finish toast, which the journey does not reach. phone-portrait was not re-run this round.
