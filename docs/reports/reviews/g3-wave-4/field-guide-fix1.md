# field-guide — round-1 fix report (P3.8)

## Per problem

1. **MAJOR — "a pool the species did not take is never recorded" was proven only by diet exclusion. FIXED.**
   - New test in `tests/worker/relationships.test.ts`: "a diet pool that is present in the dish but out of reach is never recorded (the record, not the diet, decides)". A Recycler (debris is in its diet) and a sessile Velvet (sugar is in its diet) stay alive for 100 ticks. A debris patch and a sugar patch lie far from both.
   - A Sprinter eats its own sugar patch, so the intake record is in use. This matters because the watcher returns early while `intakeSeen.bits` is null. A first version of the test without an active eater let the verifier's mutant pass for that reason.
   - The test measures, without using the watcher, that the debris total never falls across stage 6 and that the sugar within 4 cells of the Velvet never falls either. The dish's sugar total does fall. It then asserts there is no `eats:B04:detritus` and no `eats:B02:sugar`, and that the only "eats" entry is `eats:B01:sugar`.
   - Mutant check: I copied the verifier's mutant (`tookFromPool` replaced by diet membership) to `tmp/fix-guide/rel-diet.mut.test.ts`, on the current test file. Run with `npx vitest run --config vitest.mutant.config.ts -t "out of reach"`, it fails with `expected [ 'eats:B01:sugar', …(7) ] to not include 'eats:B04:detritus'`. The real implementation passes.

2. **MINOR — only species and materials had "Seen in your dishes". FIXED.**
   - In `src/ui/views/FieldGuide.tsx`, every entry now renders the Seen section.
   - Modules, structures, tools and habitats get a new line, `GUIDE_TEXT.seenNotNoted` in `src/ui/strings/guide.ts`: "Your dishes note who ate, caught, infected, rode or burst whom, and which enzymes turned food into something else. This entry is none of those, so nothing is noted for it."
   - They get no records because relationships are never noted about them. Crediting a module with its species' sightings would make a claim nothing was measured to support.
   - Test: `tests/e2e/field-guide.spec.ts` now asserts that the Sample and Stone entries both have `guide-seen`, and that Sample shows the not-noted line.

3. **MINOR — a tool's `guide.example` was never shown. FIXED.**
   - Tools now show the Example fact (testid `guide-example`).
   - Structures still don't show it separately, because their Watch for line *is* `guide.example` (the tray's mapping).
   - Test: the e2e checks Sample's example text, "Lift a few Sprinters from a crowded patch and move them beside fresh sugar."

4. **MINOR — the CT §3.2 'within 1 cell' qualifier was dropped. FIXED (test).**
   - In `tests/content/guide.test.ts`, `parsePrey` now strips "within N cell(s)" from the prey list. A new `reachOf(cell)` keeps it as the hunter's reach.
   - New test: "keeps 'within 1 cell': the hunter's reach equals its content sensing radius". Only P06 carries the qualifier, and `species.P06.sensingRadius` is 1, so it matches.
   - The guide UI shows nothing for this yet because P06 is not enabled. PROPOSED DECISION A below.

5. **MINOR — PROPOSED DECISION 1 limits the not-enabled-name error to phase > buildPhase. NOT FIXED (owner ruling).**
   - I measured both forms. A strict "not enabled → error" rule gives 0 summary/example findings today, for the shipped manifest and for `registryWith(G2_LISTS)` alike: all 47 shipped and 10 g2 name findings are in biology or rules text.
   - The narrower rule only matters for test registries built from a species subset (`registryWith({ enabledSpecies: subset })`). Across the suite, a strict rule would make those fail validation, and those tests are not mine.
   - The rule stays as built. The owner should rule on it (PROPOSED DECISION 1 in `field-guide-build.md`).

6. **MINOR — 47 validator warnings: rules or biology text names species not in this version. NOT FIXED (owner decision).**
   - The assignment allows them: "in rules text only a warning". They sit in many content records I don't own.
   - Rewording 47 player-facing lines is a content pass for the owner to choose, not a defect. It is listed for EXPANSION_RESPONSE §8.

## PROPOSED DECISIONS
- **A.** CT §3.2 "within N cell(s)" is the hunter's capture reach, carried in content as `sensingRadius`, not a requirement on the prey. When P06 is enabled, its guide entry should show "captures within 1 cell" beside its prey list. Until then the content test pins the qualifier to `sensingRadius`.
- **B.** Entries that relationships are never noted about (modules, structures, tools, habitats) show "Seen in your dishes" with a fixed sentence saying so, never sightings borrowed from related species.

## Files changed (this round)
- `tests/worker/relationships.test.ts`: new out-of-reach case.
- `src/ui/views/FieldGuide.tsx`: Seen section on every entry; tool example shown.
- `src/ui/strings/guide.ts`: `seenNotNoted`.
- `tests/content/guide.test.ts`: 'within 1 cell' kept and checked.
- `tests/e2e/field-guide.spec.ts`: Sample example, Seen on Sample and Stone.
- New: `tmp/fix-guide/` (scratch mutant and config; not for commit) and this report.

No content, manifest, sim or shared files were touched, so `content-validate --write` was not needed.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit` → exit 0.
- `npx eslint src/ui/views/FieldGuide.tsx src/ui/strings/guide.ts tests/worker/relationships.test.ts tests/content/guide.test.ts tests/e2e/field-guide.spec.ts` → exit 0.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/worker/relationships.test.ts tests/content/guide.test.ts tests/ui/badges.test.ts tests/content/material-guide-text.test.ts` → 11 files, 114 tests passed (793.8 s on the shared machine).
- Mutant (`tmp/fix-guide`, `vitest.mutant.config.ts`, `-t "out of reach"`) → 1 failed. The mutant is killed.
- `E2E_PORT=4251 E2E_OUTDIR=tmp/dist-guide npx playwright test tests/e2e/field-guide.spec.ts --project=desktop` → 3 passed (2.2 m). This includes axe, 16 px text and 200 % text. Port 4251 was stopped before and after.
- No fence value moved.
