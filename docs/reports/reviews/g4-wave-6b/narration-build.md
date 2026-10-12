# P4.9 Narration, sound polish, motion audit: build report (wave 6b, stage 3)

## Checklist

### Build
1. Narrator: DONE. `src/audio/narration.ts`.
   - `PHRASES` (:25) holds the 16 UX §8.3 phrases with stable ids, in spec order.
   - `Narrator.speak(id)` (:138) accepts phrase ids only; anything else is refused as 'unknown'.
   - It feature-detects `speechSynthesis` / `SpeechSynthesisUtterance` (:157). Without them it is silent and nothing throws.
   - Volume = `narrationVolume` (:86), which is the voice bus from `busGains`: 0 when muted, and at 0 nothing is spoken.
   - One utterance at a time: a new phrase never cancels and waits; at most 2 wait. A 5 s fallback timer covers a device that never fires `onend`.
   - The same phrase is not repeated within 10 s (`NARRATION_REPEAT_MS`, :53).
   - Nothing is spoken before the first gesture (`gesture()`, :115). `hold()` (:120) cancels the current phrase and drops the queue.
   - Wired through `src/audio/cues.ts`:
     - `initAudio` → `narrator.gesture()` (:40), even without Web Audio;
     - `setAudioPrefs` → `narrator.setPrefs` (:67);
     - `suspendAudio` / `resumeAudio` → `hold`.
   - Hidden page and arcade pause therefore hold narration with no `main.tsx` change.
   - Proof: `tests/audio/narration.test.ts`.
2. Setting: DONE.
   - `AudioPrefs.narration` (`src/audio/mix.ts`:21): default false (:34); `audioPrefsOf` reads an optional field (:59), so older prefs load with it off.
   - Checkbox "Narration (speak short phrases)" with its note (`src/ui/panels/SoundSettings.tsx`:113-127). When the device has no voice, the note says so.
   - Voice-volume note: "For narration, when it is on." It used to say narration did not exist.
   - One optional Settings field, `narration?: boolean`, added to `src/ui/state.ts`:95. It is needed for `updateSettings({ narration })` to type-check, and is the only `state.ts` edit.
   - No "on request" button (proposed decision below).
3. Evidence: DONE. `src/ui/narration.ts`.
   - Data and rules:
     - `NarrationView` is the UI's state;
     - `RULES` (:144) has one pure rule per phrase over prev → next;
     - `phrasesFor` (:164);
     - each phrase's evidence and visible text are listed in `src/ui/strings/narration.ts` `NARRATION_EVIDENCE`.
   - `wireNarration()` (:184) is called once from `src/ui/main.tsx`:11. It uses:
     - one `effect` over route, dishInfo, meta speed, selection, sheet, inspector, currentNotice, toast and settings;
     - `onDishCommand` (command answers) and `onDishSnapshot` (`familyBirthIn`: a committed birth of a followed family member, by the snapshot's own `favorites.member`);
     - capture-phase click/keydown listeners for the player's own Pause (`run-toggle` labelled Pause, or Space on a running dish) and Look (`action-look` / `lab-cat-inspect` with aria-pressed=false). They never stop or change an event (the NoticeHost Follow-button pattern).
   - Rules as built:
     - Press play: a new `dish-prompt:` notice whose text ends with `PLAY_PROMPT`, with speed 0.
     - Pause: speed > 0 → 0 on the same dish, with a player Pause gesture in the last 3 s. App pauses (Home, background, horizon, arcade) say nothing.
     - Add life: a new inoculate answer with accepted > 0. Add food: a deposit or placeObject answer with accepted > 0. A refused placement says nothing.
     - Look closely: the player pressed Look or Inspect while another tool was chosen.
     - Eating sugar: the inspected organism's recorded foods are exactly ['sugar'], it does not make its own food, hunt or digest film, and `intakeLastSecond` > 0. Intake is carbon from every food, so the claim is only true for a sugar-only eater.
     - Needs more food / Needs room / Resting: the inspector's `leadConstraint` code, which is the reason line actually shown:
       - FOOD_ACCESS_LOW (not for an organism that makes its own food, whose line is "making less food") or FOOD_NONE_COMPATIBLE;
       - DIV_BLOCK_PLACEMENT or DIV_BLOCK_CROWDING;
       - RESTING_FOOD_SCARCE or RESTING_DRY.
     - A cell split: the inspector's gone record with `divided` for the selected organism (heading "It split in two"), or a followed family member's 'birth' event.
     - Follow this family: the `guide:<dish>:follow` notice appears.
     - Equipment phrases: always false.
     - Saved: a new toast matching `savedToastText`. Undo: the exact undo toast; the test pins the literal in `state.ts`.
   - The 10 s rule applies to every phrase. Proof: `tests/ui/narration-evidence.test.ts`.
4. Sound polish: DONE, no retune. Drop, division and discovery are pairwise distinct:
   - by source or contour: sine glide / noise click / two-note sine chime;
   - by start pitch: ≥ 3 semitones apart (520 / 1800 / 659 Hz);
   - by length: ≥ 1.5× apart (0.144 / 0.041 / 1.23 s).

   World cues are capped at 4/s, division coalesces for 5 s, and UI cues bypass the cap. Every cue id has a line in the cues.ts "Silence must preserve meaning" list. Proof: `tests/audio/narration.test.ts` "sound polish".
5. Reduced-motion audit: DONE.
   - The pure functions are in `src/render/features.ts` (reduced-motion section, :204-303):
     - `effectForEvent`, `placementEffect`, `effectLook`;
     - `bodyFrameIndex`, `newbornAlpha`;
     - `ghostDurationMs`, `ghostFrameIndex`, `decayTileAlpha`;
     - `featurePulseOn`, `stainAlphaAt`.
   - `src/render/renderer.ts` calls them: `handleEvents` :751, `placementRing` :791, the effects loop, body frames, ghosts, stains and pulses.
   - Code fixed to match UX §7.4:
     - (a) In reduced motion a committed birth used to draw nothing. It now draws a still ring with a dark-edged bar across it (the static split frame) for 1 s (`SPLIT_STATIC_MS`).
     - (b) In reduced motion the placement ring used to be skipped. It is now a still ring at full radius for 1 s.
     - (c) The food-object stain faded even in reduced motion. It is now held still and removed after the same 6 s.
     - (d) `styles.css`: the reduced-motion rules now also cover `::before` / `::after` and `scroll-behavior`.
   - Unchanged, already compliant: the F02 pulse (world3 `fungalPick` frame 0), E07 trail (none), E08 granule (static), death dissolve (still frame 0.6 s), newborn fade (none), body frames (`reducedMotionFrame`), camera (no easing exists), favorites / probes / selection / lineage / links (static), the share picture (reduced-motion frames), tray icons (single frame).
   - The UX §7.4 table (docs/UX_SPEC.md :316) has 25 rows with columns Effect | Reduced-motion alternative | As built (file: symbol). Handling arc, trap loop, glow halo and P07 trails are "not in v1.0 (Phase 5 species)".

### Done when
- `tests/audio/narration.test.ts`: DONE, 15 tests. Covers: only phrase ids reach a fake SpeechSynthesis; off by default; muted → volume 0 and nothing spoken; voice 0.5 → utterance volume 0.5; nothing before the gesture or while held (hold cancels and drops the queue); one at a time; the 10 s rule (9,999 ms refused, 10,000 ms spoken); no speechSynthesis / no page / a throwing speak → silent with no error; the app narrator follows cues.ts.
- `tests/ui/narration-evidence.test.ts`: DONE, 17 tests. One per phrase (16) with evidence present (spoken exactly once through a real Narrator and a fake device) and absent. Also: narration off → nothing reaches the device; the three equipment phrases are never chosen over a 10×10 grid of transitions; no spoken text contains a digit or a dish/family name when the views hold "Bob 42 the Sprinter" and counts.
- `tests/render/reduced-motion.test.ts`: DONE, 16 tests. One assertion block per existing table row, with reduced on and off, including the 1 s static split frame. Static effects are source-checked to read no clock. The renderer uses every function. CSS covers `*` / `::before` / `::after`, and the only `@keyframes` is show-me-pulse. Every "As built" cell's file exists and holds its symbols.
- Existing `tests/audio` still pass; `settings.test.ts`'s `AUDIO_DEFAULTS` pin gains `narration: false`. The cue-distinctness test is in `narration.test.ts`. DONE.
- docs/UX_SPEC.md §7.4 filled in; only that section changed. DONE.
- `tests/e2e/narration.spec.ts`, desktop AND phone-portrait: DONE, 6/6.
  - Narration off: pause, add food and save speak nothing.
  - Settings → Sound → Narration on: speaks exactly ['Pause', 'Add food', 'Saved'] with each visible text (Run control, "Added sugar…" toast, "Saved “…”" toast). Axe clean and a 48 px target on Sound settings.
  - Reduced motion (the device setting, followed): Show me first shows `show-me-pulse` with motion on; with reduced motion the highlighted control, notice and sheet compute `animation-name: none`, nothing under dish-screen (pseudo-elements included) has an animation or transition, and `document.getAnimations()` is empty.

## Files
- New:
  - src/audio/narration.ts
  - src/ui/narration.ts
  - src/ui/strings/narration.ts
  - tests/audio/narration.test.ts
  - tests/ui/narration-evidence.test.ts
  - tests/render/reduced-motion.test.ts
  - tests/e2e/narration.spec.ts
  - this report
- Changed (owned):
  - src/audio/mix.ts
  - src/audio/cues.ts
  - src/ui/panels/SoundSettings.tsx
  - src/ui/main.tsx
  - src/render/features.ts
  - src/render/renderer.ts
  - src/ui/styles.css (only the reduced-motion block)
  - docs/UX_SPEC.md (§7.4 only)
  - tests/audio/settings.test.ts (the defaults pin)
- Shared: src/ui/state.ts has one optional `Settings.narration` field.
- Not touched: camera.ts, layers.ts, SimplePage.tsx (it already renders SoundSettings).

## How the tests were checked to fail without the mechanism
- `effectForEvent(…, reduced=true)` made to return null → "division flash → static split frame for 1 s" fails.
- The 10 s repeat check deleted from `Narrator.refusal` → "the same phrase is not spoken again within 10 s" fails.
- `b.pauseRequested` dropped from the Pause rule → "Pause: the player paused a running dish" fails (app pauses would have spoken).
- `.reduced-motion *::after` changed → the CSS test fails.
- The e2e reduced-motion check first asserts `show-me-pulse` with motion on, so a measurement that always read "none" fails.
- Every mutation was restored, and the suites pass again (48/48, then 16/16).

## Commands and results
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/audio tests/ui/narration-evidence.test.ts tests/render tests/ui/prompts.test.ts tests/ui/notices.test.ts` → Test Files 21 passed (21), Tests 183 passed (183).
- After lint fixes: `npx vitest run tests/audio tests/ui/narration-evidence.test.ts tests/render/reduced-motion.test.ts` → Test Files 9 passed (9), Tests 81 passed (81).
- `E2E_PORT=4277 E2E_OUTDIR=tmp/dist-narration npx playwright test tests/e2e/narration.spec.ts --project=desktop --project=phone-portrait` → 6 passed (3.8m).
- The same for tests/e2e/sound-settings.spec.ts (the screen I changed) → 6 passed (1.4m).
- `npx tsc -p tsconfig.json --noEmit` → clean for my files. The only errors are in src/worker/host.ts (`variantPair*` members missing, unused imports), which is another builder's in-flight variants-paired edit, not mine.
- `npx eslint` on every file I touched → clean.

## FENCE
None. No sim, worker or content change; the fence and the replay tests pass.

## Notes, bugs and gaps elsewhere
- "Add food" for a Lab food object (placeObject): the rule handles it, but `src/ui/views/LabView.tsx` `sendLabCommand` answers placeObject without calling the `onDishCommand` listeners. So only deposits and inoculates (`sendCommand`) reach narration, and the P4.3 prompt machine misses them too.
  - Fix: one line in `sendLabCommand` after a result, `for (const fn of dishCommandListeners) fn(...)`, through a small exported `state.ts` helper (e.g. `reportDishCommand(dishId, payload, res)`).
  - The owner of state.ts / LabView should add it.
- The light cycle: no recorded light-cycle phase reaches the UI. The cell inspector has static `light` / `lightBase` / `shade` only, and NIGHT_QUIET is a reason code without a UI light state. So "The light is on/off" have no evidence and are never spoken (not inferred).
- Phrase rules key on two UI strings: the undo toast literal (pinned by a test reading state.ts) and the `savedToastText` format (tested through the exported function). Rewording either toast needs the matching update in `src/ui/narration.ts`.

## PROPOSED DECISIONS
1. The same phrase is not spoken again within 10 s (`NARRATION_REPEAT_MS`). At most 2 phrases wait behind the one speaking; more are dropped, never queued.
2. No "on request" narration button in v1.0. Narration is the Settings toggle only, off by default (D08 allows either).
3. The equipment phrases (The feeder is empty, The light is on, The light is off) have no evidence in v1.0, because feeders, lamps and light cycles are Phase 6. They are never spoken; their rules are constant false until the Phase 6 equipment records state the UI can read.
4. "Look closely" = the player chose Look (Explore) or Inspect (Lab) while another tool was chosen. There is no close-zoom preset button, so zoom is not used. Visible text: the pressed Look / Inspect button.
5. "Pause" is spoken only for a player's Pause (button or Space) followed by a paused snapshot within 3 s. Pauses the app makes (leaving the dish, backgrounding, a Try my dish horizon, an arcade pause, pause on discoveries) are not narrated.
6. "Eating sugar" only for an organism whose recorded diet is sugar alone and that does not make its own food, hunt or digest film. Intake is carbon from all foods, so a mixed eater is never said to be eating sugar.
7. "A cell split" = the inspected organism's own committed division (its gone record says divided) or a followed family member's committed birth. Other births are not narrated.
8. Reduced motion:
   - the placement ring becomes a still ring for 1 s, not nothing;
   - the static split frame is a still ring with a bar for 1 s;
   - the food-object stain is held still for its 6 s, not faded.
9. Narration speaks with `lang 'en'` at rate 1, and only after the device reports the end of the previous phrase or after a 5 s fallback.
