# g4-wave-6b re-verify, round 1 (challenge-editor fixes)

Date: 2026-10-12. Re-verifier: adversarial, read-only except this file. Scratch: tmp/reverify1-g4-wave-6b/.

## Verdict

ok = false. The two behaviour findings are fixed and the new tests catch them. But the Finish fix opened a new
honesty gap, graded MAJOR below: a finished challenge turn keeps the challenge's goal running, so the goal can now
"complete" by using a tool the challenge did not allow.

## Problems (most severe first)

MAJOR [challenge-editor] src/worker/host.ts:1309-1315 ('tryFinish') + src/worker/challenge.ts:122-131 (challengeOf) + src/worker/challenge.ts:149-159 (challengeDef completedText) — the fix lifts a challenge's limits at Finish, but the challenge's goal (title = the challenge name, objectiveId CHALLENGE_n) keeps running. The goal can therefore be completed with tools the challenge refused, and the notebook then says "{challenge name}: completed at {time}." Nothing in the record shows that the limits were off when it completed. This contradicts SPEC §13.5 ("restrictions apply only inside that challenge") read together with Honest labels (CLAUDE.md: "Everything the inspector says traces to a reason code and a measured value"). The completion is attributed to the challenge, but it was measured outside it. Before this fix it could not happen, because Add Life stayed refused after Finish.
- Repro (scratch test against the real DishHost: tmp/reverify1-g4-wave-6b/goal-after-finish.test.ts, run with `npx vitest run --config vitest.scratch.config.ts goal-after-finish`):
  1. In a Garden at tick 0, save a challenge: biomassThreshold B03 0.5, allowed Feed only, budget 2, 60 s.
  2. Start it. Add Life (B03) is refused with "This challenge doesn't allow Add Life…".
  3. Run to the horizon (tick 600). The goal is still `running` (not met).
  4. tryFinish. Then Add Life B03 is accepted (3 placed).
  5. At tick 601 the goal record is `{ objectiveId: 'CHALLENGE_1', title: 'See it split', state: 'completed', endTick: 601, shown: false }`.
- Suggested fix: on Finish of a challenge turn, end the running challenge goal as GoalRunner's leave path does (`state: 'continuedFreely'`, `endReason: 'left'`, src/worker/goals.ts:255-268). Also add a host test: after Finish, a disallowed tool that would meet the goal does not produce `completed`.

MINOR [observation-notebook] src/ui/storage.ts (removeQuestion / confirmBaseline) — the Storage row still labels a challenge's starting point as a Try my dish starting point. Its confirmation also gives the Try-my-dish consequence. Repro (tmp/reverify1-g4-wave-6b/orig-finish.test.ts output): `shelf row baseline ch-1 -> Remove this starting point? Turns already played stay; Another turn will be unavailable.` Removing it actually means the challenge can no longer be started or exported on this device (CHALLENGE_REFUSALS.noBaseline). The challenge-editor fixer flagged this for the lead with suggested copy, but it is not in their files. It is still open.

MINOR [challenge-editor] src/worker/challenge.ts:96-103 (countsAgainstBudget) — owner decision, still open. Lid and Evolution settings are now free, as D07 line 107 requires ("Configure and inspect are free"). Habitat edits and Clean water still use an action, but D07 counts only "successful placements and external loads". The fixer recorded this as a PROPOSED DECISION ("Habitat … placements; Clean water … a logged material export"). That is a reasonable reading, but it is not settled by the canonical docs and is not yet in docs/DECISIONS.md. The lead should list it for the owner (EXPANSION_RESPONSE §8).

## Verified OK

VERIFIED OK — MAJOR "finished challenge turn still restricted" is fixed (except for the goal issue above). The original verifier's scratch repro, re-run against the current tree (tmp/reverify1-g4-wave-6b/orig-finish.test.ts), now prints:
- "Add Life on finished challenge turn -> accepted"
- "3rd feed on finished turn -> accepted"

Finish is one-way:
- turnAfterTime returns null for 'finished' (src/worker/tryDish.ts:122-124).
- Undo leaves the notebook turn 'finished'; the host test checks this.

The More row "Leave challenge…" is gated on challengeActive (ChallengeStart.tsx:143). The toast is TRY_TEXT.finishedChallenge, chosen when card.turn.challenge is set.

VERIFIED OK — MINOR "Lid / Evolution use an action" is fixed. countsAgainstBudget excludes setLid and setMutationPreset, but those tools can still be disallowed. The fix-round-1 host test checks:
- lid ×2 with the lid already closed: free;
- the evolution preset: free;
- feed 1 is accepted and feed 2 is refused at budget 1;
- the lid is still accepted after that;
- Add Life is still refused.

The summary adds "Changing the Lid … never uses an action." only when a limit is set. tests/ui/challenge.test.ts pins this, and the Feed-only and all-tools summaries are unchanged.

VERIFIED OK — the new tests are not vacuous. Load-time mutants were applied by a Vite transform (tmp/reverify1-g4-wave-6b/vitest.mutant.config.ts), with no tracked file edited. Each was run with `-t "fix round 1"`:
- MUTANT=finished (challengeActive ignores 'finished'): the Finish test fails, 1 failed | 1 passed.
- MUTANT=budget (old countsAgainstBudget): the Lid/Evolution test fails with "expected undefined to be 1", 1 failed | 1 passed.

VERIFIED OK — MINOR "host edits beyond one refusal line" needs no change. The assignment invites "its own small additive host entry point that passes its definition". The host edits are additive and labelled P4.8c: openTurn challenge, tryNext, goalStart resolving CHALLENGE_n, and challengeBlocked. The refusal is one line at host.ts:872. The fixer's file list shows no host edit this round. This is recorded for the lead's ownership audit.

VERIFIED OK — the unrestricted copy carries no challenge goal. duplicateDish copies `favoritesOnly(...)` (host.ts:2054), so neither 'turns' nor 'goals' reach the copy, and it cannot complete the challenge's goal.

VERIFIED OK — the fence and the touched tests pass. Ran `npx vitest run tests/worker/challenge-host.test.ts tests/ui/challenge.test.ts tests/persistence/challenge-export.test.ts tests/ui/try-dish.test.ts tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts`:
- Test Files 10 passed (10); Tests 79 passed (79); EXIT 0.
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint` on the 7 changed files: exit 0.

VERIFIED OK — no determinism or save-shape risk this round:
- Nothing changed under src/sim/ or content/.
- No version or schema field changed.
- challengeOf and countsAgainstBudget are host-side read-only checks: a refusal answers before applyNow, and an accepted command reaches the world unchanged.
