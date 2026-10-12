# g4-wave-6b: adversarial re-verify, round 2

Scope: the challenge-editor fix round 2 (docs/reports/reviews/g4-wave-6b/challenge-editor-fix2.md) against the findings in wave-reverify1.md. Scratch files are in tmp/reverify2-g4-wave-6b/. No repository file was edited except this report.

Result: **ok = true**. No BLOCKER or MAJOR is left. Two MINOR items stay open. Neither is a code defect in the challenge-editor files: one is an owner decision and the other is copy in a file this task does not own.

## Open

MINOR [challenge-editor] src/worker/challenge.ts:100-102 (countsAgainstBudget) — owner decision, still open. Habitat edits and Clean water each use one action of the budget. D07 line 107 counts only "successful placements and external loads … Configure and inspect are free". The PROPOSED DECISION is in challenge-editor-fix2.md, but docs/DECISIONS.md has no entry for it (`grep -i challenge docs/DECISIONS.md` matches only D-0081's "Affects" line), and EXPANSION_RESPONSE §8 does not list it. Lead: record a DECISIONS entry and list it in §8. The owner alternative is a one-line change to countsAgainstBudget plus budgetHint. — repro: read countsAgainstBudget. A cleanWater command returns true there.

MINOR [observation-notebook] src/ui/strings/notebookTools.ts:72,81 (used by src/ui/storage.ts) — still open from reverify1. The Storage panel puts a challenge's starting point under "Try my dish starting points". Its remove confirmation says "Turns already played stay; Another turn will be unavailable." Removing it actually makes the challenge impossible to start or export on this device (CHALLENGE_REFUSALS.noBaseline). challenge-editor-fix2.md has suggested copy (for a `createdFor` starting with `ch-`). — repro: tmp/reverify1-g4-wave-6b/orig-finish.test.ts output, "shelf row baseline ch-1 -> Remove this starting point? …". The strings are unchanged in the current tree.

## Verified

VERIFIED OK — MAJOR "challenge goal keeps running after Finish" is fixed. I re-ran the reverify1 repro unchanged against the current tree (tmp/reverify2-g4-wave-6b/goal-after-finish.test.ts, `npx vitest run --config vitest.scratch.config.ts goal-after-finish --silent=false`, exit 0):
- Inside the challenge, Add Life is refused with the challenge copy.
- At tick 600 the turn is atHorizon and the goal is running.
- After tryFinish the turn is finished and the goal is `{state:'continuedFreely', endReason:'left', endTick:600, shown:true}`.
- Add Life B03 is then accepted (3 placed), and so is a feed (52).
- At tick 900 the goals are still exactly `[CHALLENGE_1 continuedFreely/left/600]`.
- No message containing "completed" was posted. Before the fix this was `state:'completed', endTick:601`.

VERIFIED OK — the host edit is additive and correct. src/worker/host.ts:1313-1316 ('tryFinish') changes two things:
- It calls `goals.leave(d.world)` only when the turn is not yet finished and `challengeGoalEndsOnFinish` holds, meaning the turn plays an active challenge and the running goal is that challenge's CHALLENGE_n.
- It announces the change through `notebookChanges` after the `tryTurn` answer.

The rest of the path is safe:
- watchOf binds the runner to `d.notebook` (get/set), so the leave writes the dish's record.
- goalsAfterRestore only rewrites running records, so Undo after Finish cannot reopen the goal.
- duplicateDish copies favoritesOnly, so the unrestricted copy has no goals and no turn.
- The transient Continue copy has no watch.
- The only other way past the horizon is Finish, because turnsProblem refuses a non-finished turn past its horizon.
- A content goal on the turn is left alone.

The UI copy for the left goal is "Goal: {title} — left at {time}." / GOAL_TEXT.lastLeft. Both are honest, and neither says "completed". The new TRY_TEXT.finishedChallenge toast matches the behaviour.

VERIFIED OK — the Try-again gate holds. turnChallengeGoal now requires challengeActive(turn). After Finish, `goalStart CHALLENGE_1` is refused with GOAL_REFUSALS.unknown (host test step 4).

VERIFIED OK — the new tests are not vacuous. I ran load-time mutants (tmp/reverify2-g4-wave-6b/vitest.mutant.config.ts, a transform plugin; no tracked file was edited):
- `MUTANT=hostline` replaces `challengeGoalEndsOnFinish(d.notebook) ?` with `false ?` in host.ts. The round-2 test fails (1 failed | 3 passed | 7 skipped).
- `MUTANT=tryagain` drops `challengeActive(t) &&` from turnChallengeGoal. The round-2 test fails (1 failed | 3 passed | 7 skipped).

The control test (the objective completes inside the challenge, and Try again is accepted there) passes on the real tree.

VERIFIED OK — nothing regressed:
- `npx vitest run tests/worker/challenge-host.test.ts`: 11 passed, exit 0.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence (4 files) tests/fixtures/conservation-closed-lid.test.ts tests/ui/challenge.test.ts tests/persistence/challenge-export.test.ts tests/worker/try-dish-host.test.ts tests/worker/goals-host.test.ts tests/ui/goal-sentence.test.ts`: 11 files, 91 tests passed, exit 0.
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint` on src/worker/challenge.ts, src/worker/host.ts, src/ui/strings/tryDish.ts and tests/worker/challenge-host.test.ts: exit 0.
- `git status` shows no change under src/sim/ or content/. The fix changes only the notebook and never the world. The "never alters behavior" fence in challenge-host is among the 11 passing tests.

VERIFIED OK — the rule matches the docs. SPEC §13.5 says "restrictions apply only inside that challenge". Under the fix, a result measured after the limits are lifted can no longer be recorded as the challenge's completion. This closes the Honest-labels gap.

Not run: browser tests. The only screen change is the Finish toast copy, and no UI problem was suspected.
