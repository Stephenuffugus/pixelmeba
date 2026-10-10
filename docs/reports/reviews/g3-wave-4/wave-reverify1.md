# g3 wave 4 — adversarial re-verify, round 1 (field-guide, audio)

Result: ok = true. Both MAJOR findings are fixed and checked with load-time mutants. No BLOCKER or MAJOR is left. Some MINOR items remain: two new test or copy gaps, and the owner decisions carried over from the first review.

Scratch work is in `tmp/reverify1-g3-wave-4/`: mutants, configs, repro scripts and logs.

## Problems (most severe first)

- MINOR [audio] src/audio/cues.ts:35 — No test pins the wiring that fixes the division click track (`coalesceOf: coalesceMsOf` on the shipped limiter). The tests in `tests/audio/rate-limiter.test.ts` build their own limiter and pass `coalesceMsOf` themselves. If that option were dropped from cues.ts, the old click track would come back for every non-bacterial dish (algae, yeasts, consumers, fungi), and the whole audio suite would still pass.
  - Repro: in `tmp/reverify1-g3-wave-4`, run `MUT=1 npx vitest run --config vitest.audio.config.ts`. The setup file `nocoalesce.setup.ts` removes `coalesceOf` only from the performance.now instance in cues.ts.
  - Result: tests/audio 31/31 pass, while my probe `wiring.mut.test.ts` measures 34 division plays in 10 s for alga births every 100 ms. Without the mutant the probe passes (≤ 2 plays).
  - Fix: add a cues-level test that uses a fake SoundKit and AudioContext and drives `eventCues`, like my probe.
- MINOR [audio] BUILD_DIRECTIVE.md:553 / D01:85 "respects reduced‑motion" — reduced motion still has no audio effect. This is unchanged. The fixer explains it honestly as PROPOSED DECISION 4, and it remains an owner item.
- MINOR [field-guide] src/sim/content/guideRules.ts:84-93 — PROPOSED DECISION 1 is unchanged and needs an owner ruling.
  - The not-enabled-name error fires only when `phase > buildPhase`.
  - I checked the fixer's claim that this matches the strict rule today:
    - Shipped manifest: every phase ≤ 3 species is enabled (A01, B01–B08, F01, F02, P01–P04, V01, X01, Y01, Y02), so phase > buildPhase is the same as not enabled.
    - G2 lists: g2 validates, so its summary and example text names no phase 3 species.
- MINOR [field-guide] content — the 47 validator warnings are unchanged: player-facing biology and rules text names species not in this version (for example P02 names Lantern, Sleeper and Needlejaw). The assignment allows these as warnings; they are listed as an owner decision.
- MINOR [field-guide] src/ui/strings/guide.ts:38 `seenNotNoted` — the new fixed line says "This entry is none of those, so nothing is noted for it" on every module entry. For E01 Starch release and E09 Protein release it is misleading, because they are the mechanism behind noted "converts" relationships. E08 Debris feeder is the same for "eats detritus". Those notes are credited to the carrying species, not to the ability, so the sentence is technically true but reads as if the ability has nothing to do with them.
  - Suggested wording: "Notes are kept for species, not for abilities; see the species that carry it."
  - This is copy only. No false number is shown.
- MINOR [audio] src/ui/panels/SampleSession.tsx:166 — `transferTap` calls `placementCue` without the open-dish check that LabView.tsx:279 uses (`dishInfo.value?.dishId === info.dishId`). A Transfer reply that arrives after the player has left the dish would still sound. This is cosmetic.

## VERIFIED OK

- VERIFIED OK — [field-guide] MAJOR "a pool the species did not take is never recorded" — the new test "a diet pool that is present in the dish but out of reach…" (tests/worker/relationships.test.ts:157) catches three load-time mutants of `tookFromPool`, built from the current test file:
  - diet membership plus a living organism of the species (the verifier's mutant): fails with "to not include 'eats:B04:detritus'";
  - diet membership plus the pool present anywhere in the dish (a stronger mutant, mine): fails the same way;
  - a control that always returns false: fails with "expected [] to deeply equal ['eats:B01:sugar']", so the mock is active.
  - Command: `npx vitest run --config vitest.mutant.config.ts -t "out of reach"` in `tmp/reverify1-g3-wave-4` → 3 failed.
  - The real implementation passes. The test measures "not taken" without the watcher, from pool totals across stage 6.
- VERIFIED OK — [field-guide] the intake record is observation only:
  - `world.intakeSeen` is created only in createEmptyWorld and read only by src/worker/relationships.ts.
  - It is listed in POST_G2_DERIVED_KEYS.
  - The stateHash and full-digest test and the save test (`not.toMatch(/intakeSeen/)`) pass.
- VERIFIED OK — [field-guide] Every entry now has a "Seen in your dishes" section; tools show `guide.example` (FieldGuide.tsx:142-176). The e2e asserts both (field-guide.spec.ts:117-127).
- VERIFIED OK — [field-guide] The 'within 1 cell' qualifier is now kept as the hunter's reach. P06 `sensingRadius` = 1 is checked in tests/content/guide.test.ts:212, and the qualifier is stripped from the prey ids only.
- VERIFIED OK — [audio] MAJOR division click track and wake starvation:
  - Bacterial and viral births are silent (`divisionAudible`, using the species category from `DishInfo.speciesCategories`, filled in host.ts:2024).
  - Gaps are per cue: division 5 s, wake 1 s, discovery 250 ms.
  - My repro `tmp/reverify1-g3-wave-4/starve2.ts` runs the shipped `coalesceMsOf` for 60 s with births every 100 ms and a wake every 300 ms. It prints `{"divPlaysIn60s":12,"wakePlaysIn60s":50,"discoveryPlayed":true,"suppressed":0}`.
  - The same repro shows that bacterial and viral births count 0 and an unknown category counts 0.
  - The shipped cues.ts path gives ≤ 2 division plays in 10 s (my probe, without the mutant).
  - The category for an unknown species is silent. src/audio still imports nothing from src/sim (tests/audio/imports.test.ts passes).
- VERIFIED OK — [audio] The haptics note now says "The Android app does not vibrate yet." (SoundSettings.tsx:22), and the e2e asserts it.
- VERIFIED OK — [audio] Remount replay is fixed:
  - `playCueFor` is keyed on the discovery or results object.
  - DiscoveryCard's effect depends on the first row id; CompareResults' effect depends on the results object.
  - compareState updates outside the worker (main.tsx:40, state.ts:1197) spread the state, so the results reference survives.
- VERIFIED OK — [audio] Transfer now cues `placementCue(res.accepted)`. Its call-site test mocks `placementCue` and drives the real `transferTap`.
- VERIFIED OK — fence and builders' tests:
  - Command: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/worker/relationships.test.ts tests/content/guide.test.ts tests/ui/badges.test.ts tests/content/material-guide-text.test.ts tests/audio`
  - Result: 16 files, 145 tests passed (418.9 s), exit 0.
  - Also passing: `tests/content/validator.test.ts` (8/8; content hash) and `npx tsc -p tsconfig.json --noEmit` (exit 0).
  - `npx eslint` on every touched source and test file exits 0.
- VERIFIED OK — no determinism leaks: the round-1 diffs add no Math.random, Date, or Map/Set iteration in src/sim. The only sim edit (src/sim/intake.ts) writes bytes that nothing in the sim reads.

I did not run the browser tests. I suspected no UI problem that needed them, and the fixers' desktop runs cover the new assertions.
