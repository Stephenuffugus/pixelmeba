# Wave 4 stage 1: audio (P3.10) build report

Builder: audio. Date: 2026-10-10. Nothing committed (the lead commits).

## Checklist

### Build
- DONE: **SoundKit** (`src/audio/SoundKit.ts:23`). Web Audio synthesis of each stable cue id from a patch `{cueId, source oscillator|noise, envelope, pitch, filter, gainDb}` (`src/audio/patches.ts:86` PATCHES). There are separate effects, music and voice buses under one master, plus `suspend()`/`resume()`. Cue ids: drop, placement_error, select, save, discovery, compare_result, division, card_open, wake. `placement_ok` is ARCH's name for `drop`. `gate_click` is deferred. See PROPOSED DECISION 1. Proof: `tools/audio-preview.html` plays all 9 (headless check below) and the e2e "a player select plays a cue" test.
- DONE: **Call sites** (W5-20). No call site is in the renderer, and src/audio does not import src/sim.
  - `src/ui/state.ts:965` reportCommand (sendCommand and the compare-B queue): inoculate/deposit → `placementCue(accepted)`, which plays drop when accepted > 0 and placement_error when accepted = 0.
  - `src/ui/views/LabView.tsx:279` sendLabCommand: the same, for paint/place/erase/placeObject/cleanWater. Deposit/inoculate already go through sendCommand, so they are not counted twice.
  - `state.ts:856` select: plays select only on a non-null selection. Every non-null `select()` caller is a player tap or choice (DishScreen tap/candidate list, Inspector family list, showOrganism from the Inspector or Lineage buttons).
  - `state.ts:398` saveToSlot → save, after the "Saved" toast.
  - `state.ts:261` onSnapshot (next to pushFeed, open dish only, never comparison arms) → `eventCues`: births → one coalesced division, wakes → wake.
  - `src/ui/panels/DiscoveryCard.tsx:18` → discovery (a world cue), keyed on the card's first branch id.
  - `src/ui/panels/CompareResults.tsx:28` → compare_result when the results appear.
  - `src/ui/views/ExperimentCard.tsx:23` → card_open when the card is shown.
- DONE: **'wake' VisualEvent.** It was added to `VisualEvent.type` (`src/worker/protocol.ts:346`) and to the `visualEvents()` filter (`src/worker/snapshot.ts:402`). PROTOCOL_VERSION was not bumped. The feed ignores it: `src/ui/feed.ts:158` skips it, and there is a `describe` case at :137 so the switch stays exhaustive. `renderer.handleEvents` uses if-chains on birth, objectEmptied and death, so a wake falls through and does nothing (no edit needed). `LineageState` filters only branchExtinct. Proof: `tests/audio/wake-event.test.ts`.
- DONE: **Rate limiter** (`src/audio/rateLimiter.ts:43`). World cues (division, wake, discovery) get at most 4 plays per rolling 1 s, and that budget is shared. A repeat within 250 ms of its cue's last play joins that play (count grows). When the budget is spent, a request joins its cue's latest play inside the window, or else is counted in `suppressed`. UI cues bypass the limiter. Proof: `tests/audio/rate-limiter.test.ts`.
- DONE: **Ambient loop** (`src/audio/ambient.ts:23`). Low-passed noise (420 Hz) plus a slow detuned sine pad (110 Hz ±6 cents, 164.81 Hz, 0.05 Hz swell), at −24 dB on the music bus (`mix.ts` AMBIENT_DB). It starts and stops from the settings (`SoundKit.setPrefs`).
- DONE: **Gains, mute, quiet audio** (`src/audio/mix.ts:68` busGains, `audioPrefsOf`). These are pure functions. Effects, music and voice gains are separate. Mute sets everything to 0. Quiet audio means effects −12 dB and no ambient. See PROPOSED DECISION 2 (W5-21). `Settings` (`src/ui/state.ts:80`) has optional `effectsVolume`, `musicVolume`, `voiceVolume`, `muted`, `quietAudio` and `haptics`. Missing fields take AUDIO_DEFAULTS, so prefs stored by older builds load. `applyDisplaySettings` pushes `setAudioPrefs(audioPrefsOf(s))` (`state.ts:154`). Proof: `tests/audio/settings.test.ts`, and the e2e "muted" test.
- DONE: **Autoplay, lazy init, suspend** (`src/ui/main.tsx`). The audio graph is created on the first pointerdown, keydown or touchend (capture, passive) through `initAudio()` (`src/audio/cues.ts:37`). Before that every cue is a no-op. Audio suspends on `visibilitychange` hidden and resumes when visible. It also suspends on `'pixelmeba:pause'`; after that it stays silent until the player's next gesture here, because the host sends no resume message. Proof: the e2e asserts 0 AudioContexts after load and exactly 1 after the first key press.
- DONE: **Haptics** (`src/audio/haptics.ts:20`). They fire only from `placementCue` when accepted > 0, so only for a player's Lab or Add Life/Add food placement. They are off by default and use a feature-detected `navigator.vibrate(12)`. No dependency was added and android/ was not edited. See PROPOSED DECISION 3 (W5-22). Proof: `tests/audio/settings.test.ts` "haptics".
- DONE: **Visible equivalents.** The pairs are listed in the `src/audio/cues.ts` header (lines 6–18). For example: drop = the accepted toast and the new organisms or food; wake = the resting mark leaving.
- DONE: **Settings UI** (`src/ui/panels/SoundSettings.tsx:66`, mounted at `src/ui/views/SimplePage.tsx:55`). It has mute, effects/music/voice sliders with % labels and aria-valuetext, quiet audio, haptics, and a note that sound starts after the first gesture and that everything audible is also shown. Every control has a label, a target of at least 48 px and text of at least 16 px, and works by keyboard. The CSS block is appended at the end of `src/ui/styles.css` (`.sound-settings`, `.sound-check`, `.sound-volume`, `.sound-note`).
- NOT DONE: reduced motion has no audio effect. BUILD_DIRECTIVE says "respects reduced‑motion/quiet‑audio settings". Quiet audio is respected; reduced motion has no audible counterpart. See PROPOSED DECISION 4.
- NOT DONE: narration (SpeechSynthesis, 16 phrases) is not part of P3.10's build line, so it was not built. The voice slider sets the voice bus and is labelled "For spoken narration, which this version does not have yet."

### Done when
- DONE: `tests/audio/rate-limiter.test.ts`, 7 tests with a fake clock:
  - 10 division cues spread over 1 s give at most 4 plays whose counts sum to 10, with 0 suppressed.
  - A one-burst stream gives 1 play with count 10.
  - Different world cues share the 4/s budget.
  - Over a 600-request mixed stream, no 1 s window ever holds more than 4 plays.
  - UI cues are unlimited and do not touch the world budget.
- DONE: `tests/audio/settings.test.ts`, 6 tests: defaults, volumes per bus with clamping, mute, quiet audio −12 dB with ambient off, ambient at −24 dB and off at music 0, and haptics.
- DONE: `tests/audio/imports.test.ts`, 3 tests. No file under src/audio imports `@sim/*`, `@worker/*` or a relative path into src/sim or src/worker. The checker is itself tested on all five forbidden forms.
- DONE: `tools/audio-preview.html` plays every cue, a 10-division burst and a mixed world burst through the real limiter, with mute, quiet, effects and music controls and a gains log. It is dev only: `npm run dev`, then open `/tools/audio-preview.html`. **OWNER ITEM: manual listen.**
- DONE: `tests/e2e/sound-settings.spec.ts`, 3 journeys, passing on desktop:
  - Keyboard reachability and operation. Mute and volume changes are stored in `pixelmeba.settings` and survive a reload. 48 px targets, text of at least 16 px, axe clean, and the same again at 200 % text with no sideways overflow. No AudioContext before the first gesture.
  - A player's select plays the 880 Hz select voice.
  - Muted: no voice at all, and no ambient.

## Files
- **Created:**
  - `src/audio/{SoundKit,patches,rateLimiter,ambient,haptics,cues,mix}.ts`
  - `src/ui/panels/SoundSettings.tsx`
  - `tests/audio/{rate-limiter,settings,imports,wake-event}.test.ts`
  - `tests/e2e/sound-settings.spec.ts`
  - `tools/audio-preview.html`
  - this report
- **Changed (owned this wave):** `src/ui/state.ts`, `src/ui/main.tsx`, `src/ui/views/SimplePage.tsx`.
- **Changed (shared, additive):**
  - `src/worker/protocol.ts` (one union member and a comment)
  - `src/worker/snapshot.ts` (one filter line)
  - `src/ui/feed.ts` (skip wake, plus a describe case)
  - `src/ui/views/LabView.tsx`, `src/ui/panels/DiscoveryCard.tsx`, `src/ui/panels/CompareResults.tsx`, `src/ui/views/ExperimentCard.tsx` (one import and one cue line or effect each)
  - `src/ui/styles.css` (appended block)
- Nothing under content/, art/src or android/ was touched. There was no world schema bump and no PROTOCOL_VERSION bump.

## What each test proves, and how I checked it fails without the mechanism
- **rate-limiter.** I disabled coalescing (`if (false && last …)`): the "one burst = 1 play, count 10" and "several births counted" tests failed (2 failed). I disabled the budget (`if (true || recent.length < max)`): the "never more than 4 per rolling second" and "shared budget" tests failed (2 failed). After restoring: 7/7 pass.
- **imports.** I temporarily added `src/audio/zz-probe.ts` with `import type { World } from '@sim/world'`. The test failed and listed `src/audio/zz-probe.ts → @sim/world`. I then removed the file.
- **settings.** These are pure numeric assertions on dB ratios and zero gains. A mapping that ignored mute or quiet audio would fail the equality checks.
- **wake-event.** Without the snapshot filter line, `visualEvents` drops the wake, so the first test (expects `['wake','birth']`) fails. Without the feed skip, the "feed ignores wakes" test gets a "woke" line. This was reasoned from the code, not run, because snapshot.ts is a shared file and I did not want to toggle it while others edit.
- **e2e "a player select plays a cue".** I commented out `playCue('select')` in `state.ts` and rebuilt: the test failed (`✘ 1 failed`). After restoring, it passes.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit` is clean. An earlier run showed two errors in another builder's in-flight files (`src/sim/experiments.ts` isSuitabilityReason unused; `src/ui/strings/experiments.ts:309` missing return). Both were gone on the final run.
- `npx eslint` on every file I created or changed (src/audio, main/state/SimplePage/SoundSettings/LabView/DiscoveryCard/CompareResults/ExperimentCard/feed, snapshot/protocol, tests/audio, the e2e spec) is clean.
- `npx prettier --check` on my own new files is clean. I did not run prettier on shared files.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/audio tests/ui`:
  - `Test Files 1 failed | 22 passed (23)`, `Tests 1 failed | 150 passed (151)`.
  - The one failure is `trajectory-fence-current.test.ts`: "fence entry for FUNGAL_SUPPLY_LINE_V1: expected false to be true". That is a new recipe from another stage 1 builder with no fence entry yet, not something I changed (see FENCE).
- `npx vitest run tests/worker/host.test.ts tests/worker/protocol.test.ts tests/fixtures/food-objects.test.ts tests/audio tests/ui/feed-modules.test.ts`: `Test Files 8 passed (8)`, `Tests 72 passed (72)`.
- `npx vitest run tests/audio` (after the prettier pass): `Tests 19 passed (19)`.
- `E2E_PORT=4254 E2E_OUTDIR=tmp/dist-audio npx playwright test tests/e2e/sound-settings.spec.ts --project=desktop`: 3 passed (1.0m). The first two journeys include axe, 48 px and 16 px checks at 100 % and 200 % text. Port 4254 was stopped before and after.
- Preview page headless check (vite dev on 4254, then stopped): 9 cue buttons, every cue clicked, 0 page or console errors. The log shows the limiter coalescing a 10-division burst.

## FENCE
- My change moves no fence value. Audio is UI only, and the snapshot's visual events are not in stateHash or trajectoryDigest. g2-replay, the trajectory-fence g2 files, conservation-closed-lid and determinism pass.
- **FENCE: FUNGAL_SUPPLY_LINE_V1** has no fence entry, so `trajectory-fence-current` fails. This belongs to another wave 4 builder's new recipe: they or the lead need `npx tsx tools/fence-update.ts --add FUNGAL_SUPPLY_LINE_V1`.

## Bugs or notes elsewhere
- `select(null)` callers never cue (closing is silent). `showOrganism` (Inspector family row, Lineage member) does cue select, which is correct since it is a player choice.
- The compare-B placement in setup (`queueOnB` → `reportCommand`) also plays drop or placement_error. It is a player placement on B, so this seemed right.
- The arcade host protocol has only `pixelmeba:pause`. After it, audio stays suspended until the player's next gesture (there is no `pixelmeba:resume`).

## Proposed decisions
- **PROPOSED DECISION 1 (W5-20), cue id mapping.**
  - The stable cue ids are drop, placement_error, select, save, discovery, compare_result, division, card_open, wake. ARCH's `placement_ok` is `drop`. `gate_click` is deferred until a gate control exists (P3.10 "gate click later").
  - World cues (rate-limited, shared 4/s budget): division, wake, discovery. UI cues (unlimited, one per player action): the rest.
  - Coalescing: a repeat within 250 ms of its cue's last play joins it. When the budget is spent, a request joins its cue's latest play within the second, or is dropped and counted as suppressed. The visible equivalent always remains.
- **PROPOSED DECISION 2 (W5-21), audio settings.**
  - Quiet audio = effects −12 dB and the ambient loop off.
  - Defaults: effectsVolume 0.7, musicVolume 0.4, voiceVolume 0.8, muted false, quietAudio false, haptics false.
  - They are stored as optional Settings fields, so older stored prefs load with these defaults.
  - The ambient loop runs at −24 dB on the music bus whenever audio is active, not muted, not quiet, and music > 0.
- **PROPOSED DECISION 3 (W5-22), haptics on Android.** The Android build has no haptics until P4.10 adds `android.permission.VIBRATE` (PLAY_STORE_CHECKLIST). The web build uses a feature-detected `navigator.vibrate`, only for accepted player placements, and is off by default.
- **PROPOSED DECISION 4, reduced motion and audio.** Reduced motion has no audio effect: it governs visual motion, and quiet audio is the separate audio comfort setting (UX §9 lists both). Haptics stay independent of reduced motion.

## Owner items
- Manual listen: run `npm run dev`, open `/tools/audio-preview.html`, and play every cue, the bursts and the mix controls.
