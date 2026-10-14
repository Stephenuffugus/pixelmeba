# g5-wave-10 — adversarial re-verify, round 1 (e3-resters fix1)

Verdict: ok = true. All three round-1 problems are fixed. There is no BLOCKER and no MAJOR left. Each mutant I ran fails the new tests, and the fence is unchanged.

Scratch work is in tmp/reverify1-g5-wave-10/. The mutants are load-time `transform` hooks in `vitest.mutant.config.ts`. No tracked file was edited.

## Problems

None open.

NOTE [e3-resters] (for the lead, not a defect): the fixer edited four files outside e3-resters' list:
- src/ui/strings/modules.ts
- src/worker/protocol.ts
- src/ui/narration.ts
- src/ui/strings/narration.ts

The verifier had routed this fix "to the lead or wave 11". In every `git diff` hunk of those files, the lines are this fix's own. No other wave-10 task touched them, so nothing collides. The edits are additive: an optional `wake.attachable?` field, no protocol bump, and an added branch. Every organism that is not a resting newborn gets the same text as before. Record this at integration.

## Verified

VERIFIED OK — MAJOR (the dormancy sheet called a resting newborn's rest "food stayed scarce" and left the surface out of her wake line and checklist) — fixed:
- The original repro is now a test: `dormancyLines(dormancySummary(w, d)!, E)[0] === 'Resting since it formed.'` in the divided() world. It passes, and no line during her whole rest contains "food stayed scarce".
- Data path: `dormancySummary` returns `wakeConditions`, which carries `attachable` only when `isRestingNewborn` is true. worker/snapshot.ts:582 passes that object through whole, so the field reaches the UI.
- Mutant: loading HEAD's modules.ts at load time makes both newborn sheet tests fail.
  - Received "Resting because food stayed scarce."
  - Received "Food here: yes · Wet enough: yes · Conditions suitable: yes · held 0 of 10 s." with no surface item.
  - The adult-F04 control passes, as it should.
- Copy: it matches D-0106's reason copy (DECISIONS.md:1718, "Resting since it formed.") and the existing RESTING_* style.

VERIFIED OK — MINOR (the narrator gave a resting newborn no resting phrase) — fixed:
- narration.ts:108 now includes R.RESTING_NEWBORN, and the evidence string names it.
- Mutant: with HEAD's narration.ts, tests/ui/narration-evidence.test.ts "Resting: a RESTING_* reason leads" fails ("expected [] to deeply equal [ 'resting' ]").

VERIFIED OK — MINOR (round trips compared a reload of a reload) — fixed:
- `roundTrip(w)` in both files now checks the loaded save against the original `w`: stateHash and seven dormancy columns. It then runs the loaded world and a serialize/deserialize copy of `w`, comparing stateHash and trajectoryDigest('full').
- Mutant `drop-restNewborn` (loadSaveFile clears FLAG.restNewborn on every slot): resting-daughter "round trips at birth, mid-rest, mid-wake and right after waking" fails on the first stateHash (e834040972712513 expected, 568d687b0531044e received).
- Mutant `drop-restDry` (the same mutant for FLAG.restDry): dormancy-native "an E03 Sprinter ... rests dry" fails on stateHash.

VERIFIED OK — no regression in the touched code:
- `npx vitest run` passed 12 files and 141 tests, exit 0:
  - the five e3-resters files;
  - tests/ui/{narration-evidence,narration-wiring,reasons};
  - tests/sim/{module-visuals,dormancy};
  - tests/persistence/{phase5-import,migration-schema5}.
- The only test files that use dormancyLines, inspectedViewOf or DormancyInspect are module-visuals, narration-evidence and resting-daughter, and all three are in that run.

VERIFIED OK — fence:
- Command: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts`.
- Result: 8 files and 62 tests passed, exit 0, 353 s.

VERIFIED OK — typecheck and lint:
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint` on the seven changed files: exit 0.

VERIFIED OK — the sim is unchanged in this round. The fix touches only UI strings, the protocol type, narration and tests. The sim-side `restingCause` and `wakeConditions.attachable` come from the original build, which wave-verify-1 already reviewed.
