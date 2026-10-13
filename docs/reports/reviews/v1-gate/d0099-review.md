# D-0099 adversarial review (v1.0 gate)

Run `wf_d7cf7aeb-5d1` (one read-only reviewer, effort high), 2026-10-13 04:23–04:28 UTC, over the uncommitted D-0099 fix
(src/render/camera.ts, src/ui/views/DishScreen.tsx, tests, docs). Saved by the lead from the run's journal.

**Verdict: ok.** I found no BLOCKER or MAJOR, so the verdict is ok. The camera logic is correct. undoReveal moves the view only when the target is still exactly where the reveal left it and follow is off. Any pan, zoom, preset, Find or follow in between makes it a no-op. The record is cleared on every change away from the 'inspect' sheet while DishScreen is mounted, and a stale record cannot match after a real move. Reveals that are still easing, settle()/step() landing exactly on the target, reduced motion, the no-clock case, rotation at fit zoom (fit(true) changes the target, so there is no undo) and rotation at other zooms (the undo restores the old world centre) all behave. Nothing reaches the worker or the sim: neither src/sim nor src/worker imports the camera, and the DishScreen effect sends no commands. In my run, the 4 new unit tests and reduced-motion.test.ts passed (25/25). I re-ran the two mutants D-0099 names in a scratch copy and each fails one case, as the doc says; a third mutant that ignores follow also fails. The e2e assertion is sound where it runs: the Garden starts paused, the heading includes the #birthId, and the restored pose is exact, so the pick is the same. The defects are minor. (1) The DishScreen condition is broader than "a key closed the inspector". Any change away from 'inspect' while the last input was a key and the dish has focus undoes the reveal. That includes the automatic Try horizon card, which moves the camera with no player input, and Explore L/F, which contradicts D-0099's "opening another sheet keeps the view". (2) The phrase "the reticle is where Enter inspected" holds only for the first Enter of a run. (3) Only the phone-portrait e2e pins the keyboard/focus gating. I did not run Playwright, npm run check or any build, as instructed.

## Findings

### MINOR — src/ui/views/DishScreen.tsx:177

**Claim.** The undo fires on ANY change of the sheet from 'inspect' to something else while the last input was a key and the dish has focus. It is not limited to a key closing the inspector. Automatic sheet changes and key-opened sheets that do not take focus also trigger it. This contradicts D-0099's claims that 'a close that sends focus elsewhere, for example opening another sheet' keeps the view, and that the camera moves only when the player closes the inspector by a key (UX §7.1 'Camera never jumps on its own').

**Failure scenario.** (a) Try my dish turn running. A keyboard player presses Enter at the reticle; the inspector opens and keepSelectionVisible pans the view (phone portrait), and the dish keeps focus. The player stops typing. The worker's tryHorizon notice arrives: src/ui/tryDish.ts:345-357 calls showHorizon, and src/ui/tryDish.ts:206 sets sheet='tryHorizon'. TryHorizon takes no focus, so lastInputWasKeyboard() is still true and activeElement is still the dish, and Camera.undoReveal eases the view back. The camera moves with no input at that moment. (b) Explore, inspector open, dish focused: pressing L or F (src/ui/views/LabView.tsx:538-541) swaps in the Add life or Feed sheet. Neither sheet takes focus, so the reveal is undone rather than forgotten, which is the opposite of what D-0099's second bullet says.

**Suggested fix.** Mark an explicit key-driven close and undo only on that close. For example, set a flag in the Esc paths (DishScreen.tsx:234-237 and LabView.tsx:520-530), in a keyboard-activated inspector Close, and in an Enter that lands outside the dish, and consume it in the effect. Anything else would call forgetReveal. Alternatively, require the new sheet to be 'none'. At minimum, correct D-0099's 'opening another sheet' sentence and the §4.2 wording to describe the actual condition.

### NIT — docs/DECISIONS.md:1373

**Claim.** D-0099 and UX_SPEC §4.2 say the undo puts 'the centre reticle again where Enter inspected'. Because a run of reveals keeps the first 'before' (camera.ts:239), and a cell selection never reveals, this holds only for the first Enter of a run.

**Failure scenario.** Phone portrait: Enter inspects organism A, and the view is revealed. Enter again at the now-panned reticle selects organism B, which chains a reveal and keeps A's 'before', or it describes a cell, which does not reveal and leaves A's record in place. Esc then eases back to the view from before A. The reticle lands on A's original spot, not on B or the cell that Enter last inspected. The behaviour is defensible (it restores the player's own view), but the wording overstates it.

**Suggested fix.** Reword it as 'the view returns to where it was before the inspector's reveal pan(s), so the reticle is where the player left it'.

### NIT — tests/e2e/keyboard.spec.ts:221

**Claim.** The DishScreen gating (keyboard modality plus dish focus, undo vs forget) has no unit coverage. The new e2e assertion pins the fix only on phone-portrait: per D-0099, desktop and phone-landscape find open water first, so the branch never runs there. It also passes trivially whenever no reveal pan happened. A mutant that always calls undoReveal, or never calls forgetReveal, passes every test, so the 'pointer journeys are unchanged' guarantee is unpinned.

**Failure scenario.** Mutate DishScreen.tsx:179-180 to always call cam?.undoReveal(). camera-easing.test.ts and keyboard.spec.ts on all three projects still pass, yet a pointer close (tap the inspector's Close) would now pan the view back.

**Suggested fix.** Optional: add a small e2e or jsdom case. A pointer tap on an organism that triggers a reveal, then a click on the inspector's Close, should leave the camera pose unchanged.

### NIT — docs/DECISIONS.md:1271

**Claim.** The working-tree diff of DECISIONS.md also edits an unrelated earlier entry (the 'fallback' line now says platformStorage() in src/platform/capacitor.ts). D-0099's evidence and file list do not cover that edit, so committing it with this fix mixes two changes.

**Failure scenario.** A reviewer bisecting D-0099 finds an unrelated documentation correction in the same commit.

**Suggested fix.** Commit the platformStorage wording correction separately, or mention it in the commit message.

## What the reviewer checked

- src/render/camera.ts revealAt/undoReveal/forgetReveal: works with easing in flight, settle/step landing exactly on target (easePose returns `to` at t>=1), reduced motion, no clock, clampCenter, and samePose exact equality
- Chained reveals (organism change, collapse/expand via the Inspector.tsx:757-761 layout effect), favorites zoomPreset followed by a reveal (starts a new run), Find/centerOn, panBy, zoomAt, zoomBy, fit, follow (Inspector Follow button, renderer.ts:896-898, followLineage)
- Resize/rotation: renderer.ts:423-427 fit(true) at fit zoom changes the target, so there is no undo; at other zooms undo restores the old world centre
- Every path that closes the sheet: Esc in Explore (DishScreen.tsx:234-237), Esc in Lab (LabView.tsx:520-530), inspector Close buttons, L/F/I keys, More, Home/route (DishScreen unmounts, renderer destroyed), enterDish (state.ts:395-401), compare start, Try horizon (tryDish.ts:206,353), candidate list, Enter outside the dish (DishScreen.tsx onTap)
- Preact effect deps/ref: wasInspecting stays in sync because openSheet is in the deps; repeated renders from unbatched signal writes are harmless
- Focus/modality: focus.ts lastInputWasKeyboard capture listeners; .dish-focus has pointer-events:none so a pointer tap never focuses it; restoreFocus runs before the activeElement check
- Determinism: src/sim and src/worker do not import the camera; the DishScreen effect sends no command
- Ran npx vitest run tests/render/camera-easing.test.ts tests/render/reduced-motion.test.ts: 25/25 passed
- Mutants in a scratch copy (first-only before; undo ignoring later moves; undo ignoring follow): each fails exactly one D-0099 case
- e2e probe: the Garden starts paused (state.ts startRecipe), the heading includes #birthId, and the restored pose is exact, so the pick repeats
- Docs: D-0099 text, UX_SPEC §4.2 and the §7.4 camera-easing row (undoReveal symbol exists; reduced-motion test passes), ARCHITECTURE §9

## Lead disposition (2026-10-13)

- **MINOR (DishScreen condition): fixed.** The rule is now one pure function, `revealOnSheetChange` in
  src/ui/a11y/focus.ts. It returns 'undo' only for inspector → no sheet, with a key as the last input and the dish focused.
  Every other way out of the inspector returns 'forget': a pointer close, L/F/More opening another sheet, and the Try
  horizon card that opens by itself. Unit cases are in tests/ui/a11y-focus.test.ts "revealOnSheetChange (D-0099)". The
  mutant without the no-sheet condition fails one case. Every remaining inspector → no-sheet transition was
  traced to a player action (enterDish, compare start/run/discard, leave, followLineage, which also moves the camera so
  the undo is a no-op).
- **NIT (wording): applied.** D-0099, UX §4.2, ARCH §9 and the code comments now say the view returns to where the player
  left it, before the reveal pan(s). They no longer say "where Enter inspected".
- **NIT (gating coverage): addressed** by the pure function and its unit tests. A mutant that always undoes now fails.
- **NIT (D-0092 wording edit in the same file): noted** in the fix commit message. That correction came from the gate's
  report draft and is documentation only.
