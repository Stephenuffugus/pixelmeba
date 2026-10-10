# Module flip (D-0059): fix round 1

Fixer, 2026-10-10. Tree: HEAD 0a29004 plus the uncommitted flip plus this round. Input: flip-verify.md (1 MAJOR, 1 MINOR, 2 NITs, all `[lead]`, all predating the flip). Nothing was committed or staged.

## Per problem

### MAJOR — a whole-prey capture can write a save the game refuses to open: FIXED (on the load side; the simulation is unchanged)

- **Cause, confirmed.** In `consumePrey` (src/sim/contacts.ts), when `take === B`, `takeN = N*B/B` can round one ulp above N. The overflow `N - takeN` is then about −1.39e-17, and on an empty cell `detritusN` stays a few ulps below zero. `parseSaveFile` refused any negative field. The held-sample check (`sampleSlot.ts`, "a sample cell has an invalid …") did the same, so a Deposits sample over that cell was also unloadable. The verifier did not list this second site.
- **First attempt, rejected with evidence.** I first guarded the split in the simulation: when the cell would go negative, take the roundoff back from the meal and leave the cell at 0. Everything else stayed bit-identical. The fence (4 files) and g2-replay still passed, but `tests/experiments/exp-b-grazer.test.ts` failed against the wave-A golden:
  - `.B.measurements.intake.B01: expected 429.6394608498148, got 429.6394608498147`
  - `.B.measurements.intake.B06: expected 34.900590001349315, got 34.90059000134932`
  
  EXP_B's copy B (two Amoebae in FIRST_DISH_V1) runs through this exact case. Any simulation-side fix therefore changes an already-recorded trajectory, which conflicts with:
  - CLAUDE.md: "Old saves keep their recorded ruleset; new rules never rewrite an old world."
  - the lead rule: "never rewrite tests/experiments/golden/wave-a-measurements.json".
  
  I reverted it. src/sim/contacts.ts is byte-identical to HEAD (`git diff --stat -- src/sim/contacts.ts` is empty).
- **Fix.** The game itself saves a cell that is negative only by float roundoff. The import now accepts that value bit for bit, so the loaded world continues exactly.
  - New `src/sim/fieldValue.ts` has `FIELD_ROUNDOFF = 1e-12` and `isStorableFieldValue(v)`, which is true when v is finite and `v >= -FIELD_ROUNDOFF`.
  - It is used in both refusal sites: `parseSaveFile` for world fields, and `savedSampleProblem` in `sampleSlot.ts` for sample cells.
  - A truly negative pool is still refused with the same message.
  - The UI never shows such a value: the cell inspector lists only fields above 1e-6 (src/ui/panels/Inspector.tsx:746).
- **Test.** New file `tests/sim/capture-roundoff.test.ts` with 4 tests:
  1. A labelled test state: `consumePrey` takes a whole B01 prey (B 0.3, N 0.11, where `(N*B)/B > N` is asserted) on an empty debris cell. The cell ends in [−1e-12, 0). Save, load, equal hash, then both copies run +50 ticks to an equal hash.
  2. The same state, then a Deposits `sampleTake` over the cell. The cell keeps +0 and the sample holds the negative value. The save round trip and continuation are equal.
  3. The verifier's repro: FIRST_DISH_V1 seed 104729, run 20 ticks, inoculate one P01 at (46.5, 64.5) r1, run 40 ticks. At least one roundoff-negative cell is asserted, then the round trip and continuation are equal.
  4. Guard: a save with detritusN −1e-9 is still refused with "Field detritusN has an invalid value at cell 8232.".
- **Proof that the tests fail on the old behaviour.** I temporarily set `isStorableFieldValue` to `v >= 0`, which is the old refusal, ran `npx vitest run tests/sim/capture-roundoff.test.ts`, and restored it. Result: "Tests 3 failed | 1 passed (4)".
  - "Field detritusN has an invalid value at cell 8232."
  - "The held sample cannot be loaded (a sample cell has an invalid detritusN). Nothing was loaded."
  - "Field detritusN has an invalid value at cell 8237." This is the verifier's exact cell.
  - Test 4 passes either way, as intended.
  
  With the fix: "Tests 4 passed (4)".

### MINOR — two refusal messages lack "Nothing was loaded.": NOT FIXED

- It is outside the flip's files. src/persistence/saveFile.ts was not touched by the flip.
- It is not a rule the rest of the file follows: 42 of the 53 `fail(...)` messages in saveFile.ts lack the ending (`git grep -n "fail('" src/persistence/saveFile.ts | grep -vc "Nothing was loaded"` → 42). DECISIONS requires the ending only for the refusals D-0045, D-0049 and D-0058 added.
- The behaviour is correct, and the toast already prefixes "Nothing was paused or changed:".
- Changing two messages in isolation would add one more inconsistency. A single wording pass over every import refusal is the lead's call. Changing these two would also mean re-pinning tests/fixtures/registry-imports.test.ts:160 and :167.

### NIT — Again on a pre-flip What-if dish starts under registry v2: NOT A PROBLEM (no change)

This is behaviour as designed. The verifier itself says "this follows D09 §4", and the old dish is untouched. Owner awareness only.

### NIT — the E10 "accepted request" marker reads false for one tick after a load: NOT A PROBLEM (no change)

The marker is documented as observation-only and never saved (src/sim/matrixBuilder.ts). The verifier showed that the hash at load and the continued hash are equal.

## Files changed this round

- `src/sim/fieldValue.ts` (new): `FIELD_ROUNDOFF`, `isStorableFieldValue`. I put them in a new module because a read of src/sim/fields.ts was refused by the session's permission classifier.
- `src/persistence/saveFile.ts`: the field check uses `isStorableFieldValue`, plus the header comment.
- `src/sim/sampleSlot.ts`: the held-sample cell check uses `isStorableFieldValue`.
- `tests/sim/capture-roundoff.test.ts` (new): the 4 tests above.
- `docs/reports/reviews/g3-flip/flip-fix1.md`: this report.
- Unchanged: src/sim/contacts.ts (the simulation), tests/fixtures/fence.json, tests/fixtures/saves/*, tests/experiments/golden/*.

## Commands and results

- `npx vitest run tests/sim/capture-roundoff.test.ts` with the strict (old) check: Tests 3 failed | 1 passed (4). With the fix: Tests 4 passed (4).
- `npx tsc --noEmit -p . && npx eslint src/sim/fieldValue.ts src/sim/sampleSlot.ts src/persistence/saveFile.ts tests/sim/capture-roundoff.test.ts`: OK. Re-run after the final comment edit: OK.
- `npx vitest run` on the following → **Test Files 15 passed (15), Tests 115 passed (115)**:
  - tests/sim/capture-roundoff.test.ts
  - tests/persistence (all)
  - tests/sim/tools.test.ts
  - tests/worker/sample-transaction.test.ts
  - tests/fixtures/g2-replay.test.ts
  - the four trajectory-fence files: trajectory-fence, trajectory-fence-arms, trajectory-fence-current, trajectory-fence-current-arms
  - tests/experiments/exp-b-grazer.test.ts (the wave-A golden is green again)
- Verifier probes, re-run unchanged:
  - `npx tsx tmp/verify-flip/negdet.ts shipped` → "save written; load: OK". Before the fix: REFUSED.
  - `npx tsx tmp/verify-flip/negdet.ts pre` → "save written; load: OK".
  - `npx tsx tmp/verify-flip/negrecipe.ts` → PREDATOR_BALANCE_V1 seeds 104729/101/11 at t600/1200/2400: 0 negative cells, all load.
- **Not run:** the full `npm run check`. Only the touched and dependent files above were run. The lead's gate run covers the rest.

## Proposed decision (for the lead to number)

**PROPOSED D-0060: a field cell may sit within float roundoff below zero in a save.**

- **Context:** flip verifier MAJOR. A whole-body capture (`consumePrey`, takeN = N*B/B) can leave an empty debris cell at about −1.4e-17. The game saved this, then refused to load it, and a Deposits sample over that cell was refused too.
- **Decision:** the import (world fields in `parseSaveFile`, held-sample cells in `savedSampleProblem`) accepts a finite field value ≥ −1e-12 (`src/sim/fieldValue.ts` `FIELD_ROUNDOFF`) and keeps it bit for bit. Anything lower is refused as before. The simulation is not changed.
- **Reason:** saves are sacred, and an autosave must load. Changing the split in the simulation moves recorded trajectories: the wave-A EXP_B golden moves by one ulp (intake.B01, intake.B06). That would break "old saves keep their recorded ruleset". A simulation-side clamp could only come with a rules-version bump (D-0036) and is left to the owner.
- **Affects:** src/sim/fieldValue.ts, src/persistence/saveFile.ts, src/sim/sampleSlot.ts, tests/sim/capture-roundoff.test.ts.
- **Owner review:** optional (whether a future ruleset should also clamp in the simulation).

## Surprising

- The sample site was a second instance of the MAJOR. The verifier did not list it, but test 2 shows it refused on the old check.
- Any simulation-side fix moves the wave-A golden, because EXP_B hits this exact roundoff. That is why the fix is on the import side.
