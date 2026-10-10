# g3 wave 4 — audio (P3.10) fix round 1

## Per problem

- **MAJOR division click track / wake starved — FIXED.**
  - The division cue no longer follows bacterial births at all. UX §8.1 says "No sound per bacterial division burst" and D01 says "No sound per bacterial division". `src/audio/cues.ts` `worldCueCounts(events, audible)` counts a birth only when `divisionAudible(categories)(species)` is true. `SILENT_DIVISION_CATEGORIES` in `src/audio/patches.ts` holds `bacterium` and `virus` (virus births are burst releases). An unknown category is silent.
  - `src/ui/state.ts` onSnapshot passes `divisionAudible(dishInfo.value.speciesCategories)`.
  - The categories come from a new optional `DishInfo.speciesCategories` (`src/worker/protocol.ts`), filled by one additive line in `src/worker/host.ts` (`w.species.map((s) => s.def.category)`), so they are the world's recorded records. The worker sends this with the dish info, not the snapshot, so there is no protocol bump and no sim state change. src/audio still imports nothing from src/sim.
  - Each world cue now has its own coalescing gap (`WORLD_CUE_COALESCE_MS`: division 5000 ms, matching CT §12.10 "events … coalesce 5 s"; wake 1000 ms; discovery 250 ms). The new `coalesceOf` option is in `src/audio/rateLimiter.ts`. `lastOf` no longer expires with the 1 s window. The "budget spent → join" path still only joins a play inside the window.
  - Result: in any second, division takes at most one of the four slots, and in practice one per 5 s. The verifier's repro (tmp/verify-g3-wave-4-0/starve.ts with the shipped gaps) now prints `{"divPlaysIn5s":1,"discoveryPlayed":true,"wakePlayed":true,"suppressed":0}`. Before the fix it printed 17 plays and wake suppressed.
  - Tests in `tests/audio/rate-limiter.test.ts`:
    - "births in every 100 ms snapshot for 60 s: at most one division click per 5 s, every birth counted" gives 12 plays, each ≥ 5 s apart. The old code gave about 200.
    - "a growing dish does not crowd out discovery or wake" is the starve repro.
    - "births every snapshot leave wake and discovery exactly as they play in a quiet dish".
    - The shared-budget and UI-bypass tests were rewritten for the per-cue gaps. They still prove that different world cues share the 4/s budget and that UI cues bypass it. One more test covers the default single-gap mechanics.
  - Tests in `tests/audio/wake-event.test.ts`:
    - "bacterial and viral births never count toward division".
    - "the dish info carries each species category" (DishHost FIRST_DISH_V1: B01 silent, A01 audible).
  - The old code fails all of these: worldCueCounts had no predicate, and the 250 ms gap gives 17 plays in 5 s.
- **MINOR reduced motion has no audio effect — NOT FIXED (owner decision).** BUILD_DIRECTIVE:553 says "respects reduced‑motion/quiet‑audio settings" and D01 says "respect mute and reduced-motion settings". UX §9 lists "Reduced motion, quiet audio" as separate settings, and quiet audio is the audio comfort control. Tying sound to reduced motion would be a new rule the docs do not define. It stays as PROPOSED DECISION 4 for the owner, as the verifier also concluded.
- **MINOR haptics note promises a buzz Android cannot give — FIXED.** The note in `src/ui/panels/SoundSettings.tsx` now reads "A short buzz when the dish accepts something you placed, in a web browser that can vibrate. The Android app does not vibrate yet." (W5-22). Test: `tests/e2e/sound-settings.spec.ts` asserts the sentence is visible.
- **MINOR discovery / compare cue replays on remount — FIXED.** The new `playCueFor(id, key)` in `src/audio/cues.ts` plays once per event identity: the discovery object, or the `results` object. It records the key even before audio is ready, so a later gesture does not replay an old event. `DiscoveryCard.tsx` and `CompareResults.tsx` now use it. Test: `tests/audio/call-sites.test.ts` "keyed cues play once per event, not on remount" (same object → false; a new object → true; keys are kept per cue id).
- **MINOR Transfer plays no drop/placement_error/haptic — FIXED.** One line in `src/ui/panels/SampleSession.tsx` transferTap: `placementCue(res.accepted)` after a reply. This gives drop plus haptics when accepted and placement_error when refused. Test: `tests/audio/call-sites.test.ts` "Transfer is a placement" (accepted → placementCue(5), refused → placementCue(0), no reply → no cue). The test fails with the line commented out (checked: 2 failed).

## Files changed
- `src/audio/rateLimiter.ts`: per-cue `coalesceOf`; lastOf is kept per cue.
- `src/audio/patches.ts`: `WORLD_CUE_COALESCE_MS`, `coalesceMsOf`, `SILENT_DIVISION_CATEGORIES`, header.
- `src/audio/cues.ts`: `divisionAudible`, `worldCueCounts`/`eventCues` predicate, `playCueFor`, limiter gaps, header.
- `src/ui/state.ts`: passes `divisionAudible(...)` to eventCues.
- `src/ui/panels/SoundSettings.tsx`: haptics note.
- `tools/audio-preview.html`: limiter uses the game's gaps; copy.
- Shared, additive one-liners:
  - `src/worker/protocol.ts`: `DishInfo.speciesCategories?`.
  - `src/worker/host.ts`: fills it.
  - `src/ui/panels/DiscoveryCard.tsx`, `src/ui/panels/CompareResults.tsx`: playCueFor.
  - `src/ui/panels/SampleSession.tsx`: import and placementCue line.
- Tests:
  - `tests/audio/rate-limiter.test.ts`, `tests/audio/wake-event.test.ts` (updated).
  - `tests/audio/call-sites.test.ts` (new).
  - `tests/e2e/sound-settings.spec.ts` (one assertion).

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint src/audio src/ui/panels/SoundSettings.tsx src/ui/panels/DiscoveryCard.tsx src/ui/panels/CompareResults.tsx src/ui/panels/SampleSession.tsx src/ui/state.ts tests/audio src/worker/protocol.ts src/worker/host.ts tests/e2e/sound-settings.spec.ts`: clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/audio tests/worker/host.test.ts tests/worker/protocol.test.ts`: Test Files 14 passed (14), Tests 111 passed (111). No fence value moved.
- `E2E_PORT=4254 E2E_OUTDIR=tmp/dist-audio npx playwright test tests/e2e/sound-settings.spec.ts --project=desktop`: 3 passed (1.1 m). Port 4254 was stopped before and after.

## Proposed decisions
- PROPOSED DECISION (amends W5-20 coalescing): division sounds only for non-bacterial, non-viral births (by the world's recorded species category) and coalesces for 5 s (CT §12.10 "coalesce 5 s"). Wake coalesces for 1 s and discovery for 250 ms. All share the 4/s budget. A bacteria-only dish makes no division sound; its visible equivalents (the population count, the feed line) remain.
- PROPOSED DECISION 4 (unchanged, owner): reduced motion has no audio effect; quiet audio is the audio comfort setting.

## Owner items
- Manual listen: `tools/audio-preview.html` (unchanged item).
- Decide PROPOSED DECISION 4.
