# g4-wave-6b challenge-editor: fix round 1

The fixes are for P4.8 part c, the custom challenge editor. The findings come from docs/reports/reviews/g4-wave-6b/wave-verify-1.md.

## Findings

### MAJOR: a finished challenge turn still refused commands. FIXED

**What changed**
- `src/worker/challenge.ts` adds `challengeActive(turn)`, which is true only while the turn has a challenge and `state !== 'finished'`.
- `challengeOf` now returns null for a finished turn. So `challengeRefusal` refuses nothing on a finished dish: neither the tool limits nor the action budget apply.
- Finish is one-way:
  - `turnAfterTime` never reopens a finished turn.
  - Undo keeps the turn finished; the test checks this.
  - The turn record keeps its `challenge` field as history.
- This matches what the player already sees after Finish:
  - SPEC §13.5: "restrictions apply only inside that challenge".
  - The existing toast: "The dish stays open, paused, as an ordinary dish."
  - TryBadge already hides on a finished turn.

**Copy changes**
- For a challenge turn, the Finish toast is now `TRY_TEXT.finishedChallenge`: "Turn {n} finished. The dish stays open, paused, as an ordinary dish: the challenge's limits no longer apply." (src/ui/strings/tryDish.ts, src/ui/tryDish.ts finishTurn)
- More → "Leave challenge…" now shows only while the challenge is active (`challengeActive(currentTurn)` in src/ui/panels/ChallengeStart.tsx). After Finish there is nothing to leave.

**Test:** tests/worker/challenge-host.test.ts, "fix round 1: Finish leaves the challenge…". It uses the real DishHost:
- Before Finish: the budget is used up and Add Life is refused.
- After `tryFinish`:
  - the record shows `state: 'finished'` and keeps the challenge;
  - Add Life, a third feed and the lid are all accepted;
  - after Undo the turn is still finished and a feed is still accepted;
  - no new `challengeBlocked` messages appear.
- Mutation check: with `challengeOf` reverted to the old code, this test fails.

**Supersedes:** the builder's PROPOSED DECISION "a challenge turn stays restricted after Finish". New PROPOSED DECISION: Finish leaves the challenge, and a finished turn is an ordinary dish with no limits. The unrestricted copy (Leave challenge…) is still the way to drop the limits *during* a turn.

### MINOR: the budget counted Lid, Evolution settings and an unchanged lid. FIXED

**Rule:** D07 line 107: "Challenge allowances count successful placements and external loads … Configure and inspect are free."

**What changed**
- `countsAgainstBudget` no longer counts `setLid` or `setMutationPreset`. Both are configuration.
- A challenge can still disallow them through its allowed tools; that refusal is unchanged.
- This also covers the verifier's case: setLid always returns accepted 1, so setting the lid to the state it is already in used to cost an action. It no longer does.
- Still counted:
  - habitat edits (paint, structures, erase), which are placements;
  - Clean water, which is a logged material export.

**Copy changes**
- Editor hint: "Leave empty for no limit. Each successful Add Life, Feed, Habitat, Sample or Clean water action counts once; Lid and Evolution settings never count."
- When a limit is set and Lid or Evolution is allowed, the summary adds "Changing the Lid [or Evolution settings] never uses an action." The pinned summaries for Feed-only and for all tools with no limit are unchanged.

**Tests**
- tests/worker/challenge-host.test.ts, "fix round 1: Lid and Evolution settings never use an action…". With budget 1 and Feed + Lid + Evolution allowed:
  - closing the lid twice and the evolution preset are all accepted;
  - one feed is accepted and the second is refused at the budget;
  - the lid is still accepted after that;
  - Add Life is still refused because it is not allowed.
- Mutation check: with the old `countsAgainstBudget`, this test fails.
- tests/ui/challenge.test.ts checks the new summary line and the hint.

**Proposed decision:** PROPOSED DECISION: the budget counts Add Life (including spawnSpecimen), Feed, Habitat, Sample Take and Clean water. Lid and Evolution settings are configuration: they can be disallowed but never use an action.

### MINOR: host edits went beyond the "one refusal line" allowance. NOT A PROBLEM

The assignment invited this explicitly: "a challenge needs its own small additive host entry point that passes its definition (say which)". The host edits are:
- `openTurn`'s optional challenge;
- `tryNext` passing the challenge on;
- `goalStart` resolving `CHALLENGE_n` through `turnChallengeGoal`;
- the `challengeBlocked` message.

They are additive, labelled P4.8c, and were disclosed in the build report. The verifier itself files this "for the lead's ownership audit, not as a defect". This round made no further host edits.

### Not mine, for the lead: MINOR [lead] Storage mislabels challenge starting points

src/ui/storage.ts and the `confirmBaseline` string belong to observation-notebook, so I left them alone. Suggested fix:
- When `createdFor` starts with `ch-`, use its own label: "Challenge starting point".
- Use its own confirmation: "Remove this challenge's starting point? Challenges already saved in dishes stay, but this device can no longer start or export them until the challenge file is imported again."

## Files changed this round
- src/worker/challenge.ts: `challengeActive`, `challengeOf` and `countsAgainstBudget`, plus comments.
- src/ui/strings/challenge.ts: `budgetHint` and the `restrictionsSummary` line about configuration.
- src/ui/strings/tryDish.ts: `finishedChallenge`.
- src/ui/tryDish.ts: `finishTurn` uses the challenge toast for a challenge turn.
- src/ui/panels/ChallengeStart.tsx: "Leave challenge…" only while the challenge is active.
- tests/worker/challenge-host.test.ts: two new tests.
- tests/ui/challenge.test.ts: one new test.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint` on the changed files: clean.
- `npx vitest run tests/worker/challenge-host.test.ts tests/ui/challenge.test.ts tests/persistence/challenge-export.test.ts tests/ui/try-dish.test.ts`: Test Files 4 passed (4), Tests 27 passed (27), exit 0.
- Mutation check, both fixes reverted at once (`npx vitest run tests/worker/challenge-host.test.ts -t "fix round 1"`): Tests 2 failed | 7 skipped. The fixes were then restored.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts`: Test Files 7 passed (7), Tests 56 passed (56), exit 0.
- `E2E_PORT=4275 E2E_OUTDIR=tmp/dist-challenge npx playwright test tests/e2e/challenge.spec.ts --project=desktop --project=phone-portrait`: 2 passed (5.1 m). The port was stopped before and after.
- No change under src/sim/ or content/, and no version or schema change.
