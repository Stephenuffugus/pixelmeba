# region-charts-gates: fix round 1

Fixer: region-charts-gates round 1, 2026-10-14. The tree is wave 11's uncommitted work on top of f51e912.

## Problems

### 1. MAJOR: a v1.0 dish listed 9 decaying pools, including "Lacephage" (probes.ts:93, :724; strings/observe.ts:201). FIXED.

- **How it was fixed.** A new export in `src/worker/probes.ts`, `listedDecayingFields(world)`, now decides which decaying pools a reading lists.
  - It lists nothing unless the world's recorded manifest has the `'barriers'` system or the `'devices'` system. Both checks go through `@sim/gates` `worldHasSystem`.
  - When one of those systems is recorded, it lists each pool in `PROBE_DECAYING_FIELDS` that the world has a field for, with one exception.
  - The exception: v01 is listed only when `worldHasSpecies(world, 'V01')`, and v02 only when `worldHasSpecies(world, 'V02')`. The `'viruses'` system allocates both fields in every shipped dish, so having the field does not mean the dish uses the phage.
  - `readRegion` now loops over `listedDecayingFields(world)` instead of every field the world has.
  - As a result, a v1.0 dish's boundary list is exactly the 8 rows it had at HEAD, plus salt (measured) and silicate (absent).
- **Tests.**
  - `tests/worker/probes-gates.test.ts`, "a v1.0 dish reads as before":
    - It now deep-equals the whole boundary list against the HEAD golden plus the salt and silicate entries. This replaces the relaxed `slice(0, 8)` check.
    - It asserts that the world has the inhBact, eStarch, breaker, v01 and v02 fields, and that `listedDecayingFields(w)` returns `[]`.
  - New test, "the phage pools are listed only where the dish records the phage (fix 1)":
    - With `resterRegistry()`, which records V02, Lacephage is listed with the reason 'decays'.
    - With `barrierRegistry()`, which has the v02 field but does not record V02, v01 is listed and v02 is not.
  - The salt and silicate test now expects the full decaying list minus v02. Its `wideRegistry` does not record V02.
- **Mutant check.** I restored the old rule (list every decaying field the world has) and ran the file. The three tests above failed: "expected [ 'inhBact', … ] to deeply equal []", "… to not include 'v02'", and the list-length mismatch. I then reverted the mutant and confirmed the fix is back in place.

PROPOSED DECISION (D-0119 fix 1): the region sheet's 'notMeasured' rows for decaying pools are part of a Phase 5 feature.
- They appear only in a world whose recorded manifest has 'barriers' or 'devices' (D-0103: gate on the recorded manifest). A v1.0 dish therefore reads as it did before, as the assignment requires.
- Within such a world, a pool named after a species (v01 Pinphage, v02 Lacephage) is listed only when that species is recorded. This keeps unreleased content off a v1.0 screen (D-0104).
- After the systems flip, a new shipped dish will list the inhibitors, enzymes, breaker and Pinphage. It will not list Lacephage until the organism flip records V02.

### 2. MINOR: the region sheet said "Since the dish began" (strings/observe.ts:157 gateSince). FIXED.

- **What was wrong.** The region sheet's line sums the tallies of the current edges of one kind. Each edge's tally starts when that edge is placed, and a removed edge's share leaves the sum. So "since the dish began" was not what it measures.
- **How it was fixed.**
  - `gateSince` now reads `Measured since each of these edges was placed: <list>`. This matches the wording of structure-ui's gate sheet ("Measured since this barrier was placed").
  - I updated the header comment in `ProbeCharts.tsx` to say the same.
  - The journey assertion in `tests/e2e/region-charts.spec.ts` now expects the new sentence.
- **Test.** `tests/ui/probe-charts.test.ts` "crossings and gates" pins the new sentence and asserts it does not match /dish began/. It fails on the old string.

Not in this round's list, so not changed: verifier NIT 11 (naming). The rival field is called "Rivalry extract" and sGlow "Lantern signal" in strings/observe.ts, while structures.ts and GateSheet use other words. The lead should pick one name per field across both strings files. structures.ts belongs to structure-ui.

## Files changed

- src/worker/probes.ts
  - new export `listedDecayingFields`
  - import of `worldHasSpecies` and `worldHasSystem` from `@sim/gates`
  - `readRegion` uses `listedDecayingFields`
  - header and doc comments updated
- src/ui/strings/observe.ts (`gateSince`)
- src/ui/panels/ProbeCharts.tsx (header comment only)
- tests/worker/probes-gates.test.ts
- tests/ui/probe-charts.test.ts
- tests/e2e/region-charts.spec.ts (one assertion)
- docs/reports/reviews/g5-wave-11/region-charts-gates-fix1.md (this report)

No NEEDS lines. I edited no file outside my ownership.

## Commands and results

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npx eslint` on the 6 changed source and test files | exit 0 |
| `npx vitest run tests/worker/probes-gates.test.ts tests/ui/probe-charts.test.ts tests/worker/probes.test.ts tests/worker/probes-crossings.test.ts tests/sim/gate-reading.test.ts tests/ui/observe.test.ts` | 6 files, 37 tests passed, exit 0 |
| Mutant: the old listing rule, `npx vitest run tests/worker/probes-gates.test.ts -t "v1.0\|phage\|salt and silicate"` | 3 failed as expected; reverted |
| FENCE: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts` | 8 files, 62 tests passed, 792 s, exit 0 |
| e2e on desktop: `E2E_PORT=4274 E2E_OUTDIR=tmp/dist-region-charts-gates npx playwright test tests/e2e/region-charts.spec.ts tests/e2e/observe.spec.ts tests/e2e/observe-tools.spec.ts --project=desktop` | 6 passed (10.9 min) |
| e2e on phone-portrait: `tests/e2e/region-charts.spec.ts --project=phone-portrait` | 1 passed (1.5 min) |

Port 4274 was stopped before and after each run.
