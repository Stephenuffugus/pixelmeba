# parasites-phage — round-1 fix report (g3 wave 2)

## Problems

1. MAJOR saveFile.ts:429: a non-zero infectedBy other than code 1 loaded, then lyse threw at 20 s. **FIXED.**
   - hostParasiteProblem now refuses any infectedBy that `virusIdOfCode` (src/sim/viruses.ts) does not know, or whose virus species is not in the dish.
   - Message: "An organism is infected by a virus this dish does not have. Nothing was loaded."
   - Test: tests/fixtures/phage.test.ts "the import refuses a virus code this build does not simulate". It tries codes 2, 7 and 255, each with timer 19.95. The same edit with code 1 loads and lyses within 2 ticks.
   - Mutation check: with the check removed, the test fails.
2. MINOR (duplicate of 1): the import accepted infectedBy codes 2..255 in a viruses world. **FIXED** by the same change and test.
3. MINOR: infectedBy=1 was accepted on a species V01 cannot infect (A01, X01). **FIXED.**
   - The import now refuses an infection of a species that is not in the virus's hostIds.
   - Message: "An organism is infected by Pinphage, which cannot infect it. Nothing was loaded."
   - Test: phage.test.ts "the import refuses an infection of a species V01 does not list in hostIds (Sunbead, Hitcher)".
4. MINOR: a non-zero infectionTimer was accepted while infectedBy=0. **FIXED.**
   - Message: "An infection timer is set on an organism that is not infected. Nothing was loaded."
   - Test: phage.test.ts "the import refuses an infection timer on an organism that is not infected". A fresh B01 with timer 5 is refused; the untouched save loads.
   - Mutation check: with the check removed, the test fails.
5. MINOR: a non-finite infectionTimer, or a stale host/parasite birthId, was refused by the generic check, and its message did not end "Nothing was loaded." **FIXED.**
   - In saveFile.ts, the generic messages now end "Nothing was loaded.":
     - "Entity column X has a non-finite value."
     - "A X link points at an organism that is not there."
   - Only those two message strings changed. No other test pins them; they also cover the prey link.
   - Tests:
     - phage.test.ts: Infinity and NaN timers, through expectRefused with the exact message ending.
     - parasite.test.ts import test: a stale hostBirthId gives "A host link points at an organism that is not there. Nothing was loaded."
6. MINOR Inspector.tsx:489 / parasites.ts parasiteInfo: "Hitcher draining 0.02 C/s." showed the record's drainRate. **FIXED.**
   - `parasiteInfo.rate` is now the parasite's `intakeLastSecond`: the carbon it drained in the last whole second. A parasite's only intake is its drain (commitHostDrains adds C to intakeAccum).
   - This value is measured after the free-nutrient limit L and the host-B cap.
   - The protocol field comment and the reasons.ts comment now say "measured".
   - Test: parasite.test.ts "the inspector reports the measured drain of the last second, not the record rate":
     - an unlimited host reads "Hitcher draining 0.02 C/s.";
     - a host with N 0, in a cell holding half the free N the drain binds, reads "Hitcher draining 0.01 C/s." while the record still says 0.02.
   - Mutation check: going back to drainRate makes the test fail (0.02 vs 0.01).
   - Note: the value is the last whole second, so it reads 0 during the first second after attachment.
7. MINOR Inspector.tsx:484/489: INFECTED and PARASITIZED always used the Lab wording. **FIXED** (this removes my earlier proposed decision).
   - Both lines now call `reasonText(code, dishView.value, …)`, using the existing `dishView` signal from src/ui/views/LabView.tsx. Inspector does not import into a cycle.
   - Explore shows UX §5.2's Explore wording: "It's infected and can't split." and "Something is attached to it."
   - Lab shows the Lab wording with the measured value.
   - Test: tests/e2e/phage.spec.ts now switches back to Explore after the Lab check and expects exactly "It's infected and can't split.". axe is clean in both views.
8. Lab body text is still ≥ 16 px; the e2e checks it.

## Files changed

- src/persistence/saveFile.ts (shared, additive):
  - import of `virusIdOfCode`;
  - three new checks in hostParasiteProblem (my function);
  - two generic messages extended with " Nothing was loaded."
- src/sim/parasites.ts: parasiteInfo returns the measured rate.
- src/worker/protocol.ts: comment only.
- src/ui/strings/reasons.ts: comment only.
- src/ui/panels/Inspector.tsx: import of dishView; my two lines use the current view.
- tests/fixtures/phage.test.ts, tests/fixtures/parasite.test.ts, tests/e2e/phage.spec.ts.

## Commands and results

- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint` on the 8 files above: clean.
- `npx vitest run` on the following: 14 files, **122 passed**.
  - tests/fixtures/g2-replay.test.ts
  - tests/fixtures/trajectory-fence (4 files)
  - tests/fixtures/conservation-closed-lid.test.ts
  - tests/fixtures/determinism.test.ts
  - tests/fixtures/host-specificity.test.ts, tests/fixtures/parasite.test.ts, tests/fixtures/phage.test.ts
  - tests/worker/protocol.test.ts
  - tests/ui/reasons.test.ts
  - tests/sim/world-stores.test.ts
  - tests/fixtures/registry-imports.test.ts
- Mutation checks, each restored afterwards:
  - parasiteInfo back to drainRate: 1 failed.
  - The unknown-code and timer-without-infection checks removed: 2 failed.
- `E2E_PORT=4223 E2E_OUTDIR=tmp/dist-pp npx playwright test tests/e2e/phage.spec.ts --project=desktop`: 1 passed (3.9 m). Port 4223 was stopped before and after.
- The fence was not changed.
