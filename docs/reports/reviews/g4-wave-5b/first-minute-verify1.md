# Wave 5b first-minute follow-up: adversarial verification 1

Verdict: **ok, with 0 BLOCKER and 0 MAJOR findings.** I could not refute the change. Every way a dish's story watch starts goes through one place: `StoryDetector.bind`, called from `NotebookWatch`, which `DishHost.watchOf` creates lazily at the first step of a played dish. That one place now starts the pacer closed at `world.tick` (src/worker/stories.ts:331).

## What I checked

### Every start path
Every start path reaches `new NotebookWatch(d.world)` at host.ts:1310, at the dish's current tick:
- create;
- open, Load and Continue (`loadSlot`, including the autosave slot);
- import;
- duplicate;
- checkpoint branch, What if? start and experiment-card start (all new dishes built by `makeDish`).

Because the watch is lazy, it is created at the first step after the dish appears, which is the same tick, since the dish is paused until then.

Undo (host.ts:752 to :767) and the error-path rollback (host.ts:2406 to :2427) rebind on a new World object, which gives a full window from that moment, as the rule says.

Comparison arms and the transient Continue copy have no watch, as before.

`favorite` calls `nw.rebind(d.world)` on the same world. `StoryDetector.rebind` returns early in that case (stories.ts:310 to :311), so following or unfollowing a family does not restart the window.

### Delay for a reloaded dish
A reloaded dish is not delayed beyond the rule. The pacer is set once per bind, and `next()` opens at `lastNotify + 600`. No other path resets `lastNotify`.

### No card lost
- Cards found in the window are still recorded, and offers are still queued; only `next()` is gated.
- The fresh-dish tests assert that more than one quiet card exists before tick 600, and that the tick-600 notification is `pickStory(beforeFirst)`.
- Cards that were waiting at save time are not announced after a load. That is unchanged from before: the pacer is not saved.

### Never alters behaviour
`tests/worker/stories-host.test.ts` "story cards never alter behaviour" passes: stateHash and the full trajectory digest are equal with the detector on and off over 3,000 ticks. The change is worker-only. Nothing under src/sim or content changed.

### Nothing else changed
Files modified after the wave 5b integration (find -newer src/ui/goals.ts):
- src/worker/stories.ts
- tests/ui/stories.test.ts
- tests/worker/stories-host.test.ts
- tests/e2e/{helpers,garden-home.spec,stories.spec}.ts
- the lead's docs/agent and tools/lead files

Against the fixer's .orig copies, the stories.ts diff is the one line plus comments.

### Mutants
I ran them in full scratch copies of the repo, so no repository file was touched:
- tmp/first-minute-verify1/repo-orig: the original rule, `cards.some(notified) ? world.tick : null`.
- tmp/first-minute-verify1/repo-half: a load-time mutant `new StoryPacer(world.tick - STORY_WINDOW_TICKS / 2)`, a half window.

Both fail all 5 new tests (5 failed, 25 skipped, exit 1). The half-window mutant fails with, for example, "expected 1000 to be greater than or equal to 1300", so the `>=` assertions catch a partial delay, not only an immediate one.

## Findings

- MINOR [first-minute] tests/e2e/stories.spec.ts:88-94: the e2e proves only that there is no story notice at about tick 300, and the `tick >= 600` read is taken after the notice is visible, so it holds trivially. A notice between tick 300 and 599 would pass the e2e. Repro: run the spec against repo-half's build; it would very likely still pass. The unit and host tests (exact tick 600, and T+600) are the real proof, so this is not a defect in what ships.
- MINOR [first-minute] tests/e2e/garden-home.spec.ts:149-154: after Pause, `dismissStoryNotice` runs once, and the test then expects FEED_PROMPT in `.prompt`. If the worker pumped a tick that posted a story notification after the UI flipped to "Run" but before setSpeed 0 arrived, the notice could land after the dismiss, and the test would flake. Repro: theoretical. It needs a story window to open in the roughly 50 ms race at 4×, with at most one notification per 15 s of real time. I did not observe it (passed on desktop).
- NIT [first-minute] src/worker/stories.ts:331: Undo or rollback before any notification now waits a full window, where before it was open at once. This is intended by the lead's decision and disclosed in the fixer's report and in the PROPOSED DECISION; I note it only so the D-0079 amendment wording keeps it.
- NIT [first-minute] tests/worker/stories-host.test.ts:256-300: the host tests cover create, Load, Continue (autosave) and duplicate, but not a checkpoint branch, What if? or an experiment-card start. Those go through the same lazy `watchOf` → `bind` path (verified by reading host.ts:1307-1311), so the risk is low.

## Commands

| Command | Result |
|---|---|
| Copied src, tests, content, art, public, tools and the configs into tmp/first-minute-verify1/repo-{orig,half}; symlinked node_modules; sed-applied the original rule and the half-window mutant at stories.ts:331 | diff -r shows only line 331 differing |
| (repo-orig) `npx vitest run tests/ui/stories.test.ts tests/worker/stories-host.test.ts -t "first minute"` | Tests 5 failed, 25 skipped, exit 1 (e.g. "expected 710 to be greater than or equal to 1300") |
| (repo-half) the same | Tests 5 failed, 25 skipped, exit 1 (e.g. "expected 1000 to be greater than or equal to 1300") |
| `npx vitest run tests/ui/stories.test.ts tests/worker/stories-host.test.ts tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence` | Test Files 7 passed (7), Tests 81 passed (81), 328 s, exit 0 (includes never-alters-behaviour) |
| `lsof -t -i :4391 \| xargs -r kill; E2E_PORT=4391 E2E_OUTDIR=tmp/dist-first-minute-verify npx playwright test tests/e2e/stories.spec.ts tests/e2e/garden-home.spec.ts:54 tests/e2e/keep-dish.spec.ts:553 --project=desktop` | 3 passed (4.1 m): garden-home 2.3 m, keep-dish 39.1 s, stories 1.0 m. Port stopped afterwards (0 listeners) |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npx eslint` on the six changed source and test files | exit 0 |
