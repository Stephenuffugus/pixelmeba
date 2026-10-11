# garden-home: fix round 1 (P4.3)

## Per problem

**MAJOR: "Nothing has split yet — tap one to see what's stopping it." could be false (src/ui/prompts.ts, src/ui/views/NoticeHost.tsx). FIXED.**
- The line says something about the dish's whole life. Only a machine that has watched the dish from tick 0 has seen every Sprinter birth, so now only that machine may say it. That means a Garden started, or made from a What if? idea, in this page session. `PromptContext.startTick` is the dish tick when the machine first sees the dish (NoticeHost `machineFor`: `info.tick`, now commented).
- The new `noSplitSayable(s)` needs `ctx.startTick === 0` and a Sprinter alive in the latest snapshot. The new `PromptState.sprinterAlive` comes from snapshot entity records, so "tap one" always has a Sprinter to tap.
- The 120 s count is dish time since tick 0, as the assignment says ("since the dish started").
- On a loaded or continued dish, or with no Sprinter alive, the step is skipped silently once 120 s of watched dish time pass. Feed still follows. Nothing is guessed (UX §3.2: "If no event occurs, suggest inspecting a constraint or adding life — never fabricate").
- A live Sprinter birth is still announced on any Garden dish ("A cell split."), because it is an event seen now.
- Tests in tests/ui/prompts.test.ts:
  - "a loaded or continued Garden dish never says …": a save at tick 18,000, and a dish opened at tick 600. The old machine showed the line at startTick + 1200; the new one never does, and Feed and "A cell split." still follow.
  - "\"tap one\" needs a Sprinter to tap": skipped silently when no Sprinter is alive.
  - The existing 120 s tests (fresh dish, startTick 0) still pass.
- The related remark, "the whole first-minutes sequence starts again on every load", is NOT CHANGED. Every other step stays truthful on a loaded dish, because each needs live evidence (a selection, Run, a feeding cue in a snapshot, a birth event, an accepted deposit). Resolved steps are kept per dish for the page session. Keeping them across loads would mean saving prompt progress, which is notebook state and outside this assignment. See the proposed decision below.

**MINOR: sessionSummaryOf counted births from up to 0.9 s before the opening when the opening tick is not a whole second (src/worker/host.ts). FIXED.**
- How the sim records it: the step that starts at world tick T records into the sample with second ⌊T/10⌋ + 1 (publish.ts records `second: (T+1)/10`, and tick.ts increments `world.tick` after stage 10).
- A record (a per-second sample, or a minute summary covering `span` seconds) now counts only when every step it covers starts at or after the opening: `(second − span)·10 ≥ fromTick`.
- A record that straddles the opening is left out and flagged `compacted`, so the line becomes "At least N births were recorded since you opened it." This is the existing lower-bound wording.
- The `fromSecond` fraction is gone.
- Tests in tests/worker/session-summary.test.ts:
  - New: opened at 105. Second 11 (steps 100…109) is left out and flagged; the old rule counted it (9 instead of 5).
  - New: opened at 110 and 100 (exact), and at 129 (nothing whole is left, so no line).
  - New: a real-run test showing that a birth event in the step starting at T lands in sample ⌊T/10⌋ + 1.
  - Changed: the existing births test now uses the tick-exact filter.

**MINOR (second half): "a branch with establishedTick == the opening tick also counts". NOT A PROBLEM.**
- branches.ts stamps `establishedTick: world.tick` during the step that starts at that tick, and `world.tick++` runs after stage 10 (src/sim/tick.ts).
- A dish opened at world tick T has not yet run step T. A branch with establishedTick T was therefore established in the first step after opening, and counting it is correct.
- New test: a branch at the opening tick counts; one stamped a tick earlier does not.

**E2E race found while re-running (tests/e2e/garden-home.spec.ts). FIXED.**
- The dismiss loop read the line, then clicked ✕ in a separate step. When "A cell split." gave way to the Feed prompt in between, it could dismiss the Feed prompt. The first desktop run ended with an empty notice.
- The loop now reads the line and presses its ✕ in one page task, so ✕ can only dismiss the line it read.
- Some intermediate failures were my own overlapping runs on port 4273 (stale wait loops). The final single run is clean.

## PROPOSED DECISION
- "Nothing has split yet" is said only by a prompt machine that watched the dish from tick 0, with a Sprinter alive. On a loaded or continued Garden dish the step is skipped silently after 120 watched seconds.
- Prompt progress is page-session UI state and is not saved. If the owner wants it kept across loads, it belongs in the per-dish notebook record (g4-plan call 1) in a later task.

## Files changed
- src/ui/prompts.ts
- src/ui/views/NoticeHost.tsx (comment only)
- src/ui/strings/home.ts (comment)
- src/worker/host.ts (`sessionSummaryOf` only)
- tests/ui/prompts.test.ts
- tests/worker/session-summary.test.ts
- tests/e2e/garden-home.spec.ts

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint` on the seven files above: clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/ui/prompts.test.ts tests/ui/notices.test.ts tests/worker/thumbnail.test.ts tests/worker/session-summary.test.ts`: 11 files, 91 tests passed (456 s).
- Re-run after the e2e cleanup, `npx vitest run tests/ui/prompts.test.ts tests/worker/session-summary.test.ts tests/ui/notices.test.ts`: 27 passed.
- `E2E_PORT=4273 E2E_OUTDIR=tmp/dist-garden-home npx playwright test tests/e2e/garden-home.spec.ts --project=desktop`: 1 passed (3.5 m). Port 4273 was free before and after.
