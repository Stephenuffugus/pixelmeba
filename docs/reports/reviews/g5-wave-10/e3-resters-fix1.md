# e3-resters, round-1 fix

## Per problem

**MAJOR: the dormancy sheet called a resting newborn's rest "food stayed scarce" and left the surface out of her wake line and checklist. FIXED.**
- `src/ui/strings/modules.ts` `dormancyLines`: a new `R.RESTING_NEWBORN` branch prints "Resting since it formed." When `d.wake.attachable` is present (only for a resting newborn), the wake sentence reads "... usable food, wet enough water, suitable conditions and a surface to hold, with at least 5 energy ..." and the checklist gains "Surface to hold: yes / not yet". For every other organism the strings are byte-identical to before.
- `src/worker/protocol.ts` `DormancyInspect`: `wake` gets an optional `attachable?: boolean` (additive, no protocol bump). The `cause` comment now names RESTING_NEWBORN. `dormancySummary` already sends `attachable`, so the worker needed no change.
- New tests in `tests/fixtures/resting-daughter.test.ts`, describe "the inspector's dormancy sheet names her real cause and her surface":
  1. A newborn's first line is "Resting since it formed.", and no line of her whole rest says "food stayed scarce".
  2. With no surface at her cell, the checklist is exactly "Food here: yes · Wet enough: yes · Conditions suitable: yes · Surface to hold: not yet · held 0 of 10 s."
  3. An adult F04 resting for food keeps the v1.0 sentences and has no surface item.
- Mutant check: with HEAD's `modules.ts`, tests 1 and 2 fail ("expected 'Resting because food stayed scarce.' to be 'Resting since it formed.'", and the checklist has no surface item). Test 3 passes there too, as it should.

**MINOR: the narrator gave a resting newborn no resting phrase. FIXED.** It was a one-line additive change.
- `src/ui/narration.ts` `inspectedViewOf`: `need = 'resting'` now also covers `R.RESTING_NEWBORN`. The phrase spoken is just "Resting", which is true for her.
- `src/ui/strings/narration.ts`: the evidence text now names RESTING_NEWBORN.
- `tests/ui/narration-evidence.test.ts`: one additive `expectSpoken(... R.RESTING_NEWBORN ..., 'resting')` line. It fails with HEAD's `narration.ts` (`expected [] to deeply equal ['resting']`).

**MINOR: round trips compared a reload of a reload, never the original. FIXED.**
- `roundTrip(w)` in `resting-daughter.test.ts` and `dormancy-native.test.ts` now checks the loaded save against the original `w` itself: stateHash, plus the alive / lifeState / flags / stateTimer / dryTimer / lockoutTimer / limitCode columns explicitly.
- It then runs the loaded world and an in-memory copy of `w` (`deserializeWorld(serializeWorld(w))`, checked equal to `w` first) for the given number of ticks and compares stateHash and `trajectoryDigest('full')`. `w` itself is not stepped.
- All eight call sites now pass `w` instead of `await reload(w)`.
- Mutant check: a scratch copy (deleted) whose `reload` drops FLAG.restNewborn after loading fails "round trips at birth, mid-rest, mid-wake and right after waking" on the first stateHash compare. The old pattern would have passed it.

## Files changed in this round
- `src/ui/strings/modules.ts`, `src/worker/protocol.ts`, `src/ui/narration.ts`, `src/ui/strings/narration.ts`, `tests/ui/narration-evidence.test.ts`: outside my ownership. Each edit is small and additive, and nothing changes for any organism that is not a resting newborn. The lead should know these were touched.
- `tests/fixtures/resting-daughter.test.ts`, `tests/fixtures/dormancy-native.test.ts`: mine.
- No sim file changed in this round.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint` on the 7 changed files: exit 0.
- `npx vitest run` on the fence (g2-replay, rc1-replay, trajectory-fence x4, conservation-closed-lid, determinism), my five files (dormancy-native, resting-daughter, phage-v02, parasite-x02, resters-determinism), and tests/ui/{narration-evidence,narration-wiring,reasons}, tests/sim/{module-visuals,dormancy}: 18 files, 156 tests passed, exit 0. Fence unchanged.
- E2E: none run. No shipped dish can show a resting newborn because F04 is not enabled (D-0104), and the text changes add no new controls.

## Notes for the lead
- The F04 flip still needs nothing more from these surfaces. The dormancy sheet, the narration and the protocol type now all handle RESTING_NEWBORN.
- No PROPOSED DECISION in this round.
