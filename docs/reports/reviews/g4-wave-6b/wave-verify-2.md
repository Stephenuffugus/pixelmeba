# Wave g4-wave-6b verify 2: variants-paired (P4.5), narration (P4.9)

Verifier: adversarial wave verifier 2, 2026-10-12. Result: **ok = true**. There are no BLOCKER or MAJOR findings; there are 4 MINOR and 4 NIT findings.

## Commands run in this session
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/variants-paired.test.ts tests/worker/variants-paired-host.test.ts tests/audio tests/ui/narration-evidence.test.ts tests/render/reduced-motion.test.ts`
  - Result: **Test Files 17 passed (17), Tests 147 passed (147)**.
  - This covers the four trajectory-fence files, the replay and closed-lid conservation fixtures, and both builders' new unit tests.
- `npx tsc -p tsconfig.json --noEmit`: exit 0, with 0 errors across the whole tree. The narration builder's report of host.ts errors is stale.
- `npx eslint` on all 26 files of both tasks: clean.
- Load-time mutant, run from `tmp/verify-g4-wave-6b-1/` (no tracked file edited):
  - The change: in sequential mode, B's carbon-added base was set to A's start (`startA.ledger.inputs.c`).
  - The R-G1 fixture **fails**: sequential results are no longer deep-equal to paired results. The sequential = paired proof is not vacuous.
- I did not run any browser test. Nothing I found needed browser evidence.

## Problems (most severe first)

MINOR [variants-paired] src/ui/state.ts:1155-1156 (pre-existing autosave on comparison completion) and src/ui/strings/variantPair.ts `closeNote`
- **What is wrong:**
  - When a Garden pair completes, Continue (the autosave) is rewritten with the idea's dish at 0:00.
  - The assignment's item 5 says "Nothing touches any save slot".
  - The setup line says "Your saves are not changed."
  - The builder disclosed this as note 2. The open dish was kept first (keepFirst), so nothing is lost; still, Continue changes, which contradicts the item and the copy.
- **Repro:** start any pair → Run → wait for results → Continue now opens the idea paused at 0:00.
- **Fix:** skip the completion autosave when `compareState.variantPair` is set, or reword the copy and record a decision.

MINOR [lead] src/ui/views/CompareViewport.tsx:54,57 (not in either builder's ownership)
- **What is wrong:**
  - In a Garden pair the B viewport is titled "B · with your change", with the aria label "Dish B: the copy that gets your change".
  - The player made no change; the one difference is the content idea's patch. That breaks the honest-labels rule.
  - The toggle above it does read "A · Garden" and "B · {idea}".
- **Repro:** What if? → A smaller meal → Compare with Garden → read the B view's heading.

MINOR [lead] src/ui/views/LabView.tsx `sendLabCommand`
- **What is wrong:** an accepted Lab food object (`placeObject`) never reaches the `onDishCommand` listeners. The assignment's "Add food: an accepted deposit or placeObject" is therefore not spoken for food objects.
  - The rule itself is right and is unit-tested (narration-evidence "Add food" covers placeObject); the gap is in the wiring.
  - The builder disclosed it, and the fix is outside the narration builder's ownership.
  - The P4.3 prompt machine misses this path too.
- **Repro:** Lab → place a food object with narration on → nothing is spoken.

MINOR [narration] src/ui/strings/narration.ts `NARRATION_TEXT.note` ("… The same words are always shown on screen.")
- **What is wrong:** this player-facing claim is not literally true.
  - For "Pause", what shows is the Run button (play icon, aria-label "Run").
  - For "Look closely", it is the pressed Look/Inspect button.
  - For "Eating sugar", it is the inspector's "Ate last second" line.
  - For "Follow this family", it is the prompt "Follow this family?".
- UX §8.3 asks for "text always shown" (an equivalent), not the same words.
- **Fix:** reword, e.g. "What it says is always shown on screen too."

NIT [narration] src/ui/narration.ts `splitRecordOf` / `RULES.cellSplit`
- The rule fires on a null → birthId transition of the inspected organism's gone record.
- Closing the inspector and reopening it on the same selection, once that organism has divided (more than 10 s after the last time), speaks "A cell split" again for a division that happened earlier.
- The words stay true (past tense), but the evidence is old. Consider keying it on the record's death tick.

NIT [narration] src/ui/narration.ts `wireNarration` keydown listener
- Space on the dish route marks a Pause request even when the key is typed into a text field.
- If the app then pauses the dish within 3 s (for example a Try my dish horizon), "Pause" is spoken for a pause the player did not make. This is a rare edge case.

NIT [variants-paired] src/worker/host.ts `variantPairStart` (sequential setup)
- The B arm's dish and the new idea dish hold the same `World` object (`ideaWorld`) until B is realized.
- This is harmless today: arms refuse every command, and the source dish is never stepped while the comparison is open. It is still a shared mutable world between two dish entries; a `realizePairArm(startB)` copy, or a comment pinning the invariant, would be safer.

NIT [lead] docs/ARCHITECTURE.md §7
- There is no "As built" entry yet for `variantPairStart`, `variantPairStarted` or `ComparisonState.variantPair`. The builder may not edit ARCH and flagged it.
- tests/audio/settings.test.ts (the defaults pin, `narration: false`) was edited outside narration's listed ownership. It is a one-line, necessary pin update, so it is acceptable.

## Verified OK

**variants-paired (P4.5)**
- VERIFIED OK — No change under src/sim or content/, and no edit to manifest or version fields. Evidence: `git status`; only worker, ui and test files changed. PairedRun, measureSummary and PAIRED_RUN_LABEL are used as they are.
- VERIFIED OK — Fixed 1800-tick horizon. Evidence:
  - `host.ts` `variantPairRun` throws for any other horizon.
  - The host test refuses 600, 6000, null and 1799, and both arms stay at tick 0 afterwards.
- VERIFIED OK — Equal simulated time. Evidence:
  - Paired mode goes through `PairedRun.stepPair` (which throws if the arms diverge).
  - Sequential B runs to exactly A's target, and Stop is refused during B (`VariantPairRun.stop`). Host test and fixture both pass.
- VERIFIED OK — Each arm equals the same dish run alone. Evidence: the fixture checks A's hash against R-G0 run alone for 1800 ticks, and B's against each idea run alone with plain `step` (no observer). It passed in my run.
- VERIFIED OK — Sequential results are deep-equal to paired results for R-G1, R-G2 and R-G3. Evidence: the fixture passes, and my mutant shows the check would catch a real divergence.
- VERIFIED OK — Starting sugar differs exactly as CT §9.4 says. Evidence: the fixture checks R-G1 at half, R-G2 at double, and R-G3 at the same total over equal cell counts.
- VERIFIED OK — No commands reach either arm, and the change cannot be cleared. Evidence:
  - `armCommand` refuses with `VARIANT_PAIR_TEXT.noChange`, and `compareReset` refuses.
  - The arms' command logs are empty (host test and fixture).
- VERIFIED OK — Arms are realized before the keep, and a refusal changes nothing. Evidence:
  - `prepareVariantPair` runs before `keepFirst`, and the problem check runs again after the keep's awaits.
  - The refusal test compares the store byte-equal and the open dish's hash.
  - The keep test checks that slot1's hash equals the open dish.
- VERIFIED OK — Close opens the idea's dish at tick 0. Evidence:
  - `closeCompare` activates `sourceDishId`, which is the new idea dish.
  - The host test checks tick 0 and `variantRecordOf(idea).initialStateHash`.
  - The e2e test expects "0:00 · 56 alive", paused.
- VERIFIED OK — Results follow D09 line 115 and SPEC §13.4. Evidence: `CompareResults.tsx` `PairHead` shows, in order:
  - the title "{idea} vs Garden", the question and the change statement;
  - "this paired run" and the caveat "One paired run is an illustration, not a general rule.";
  - the counts table (each kind alive in A and B, B − A), then "Sugar left in the dish" (`poolTotal` of sugar, measured at the end);
  - then the existing measures, the existing PredictionNote and the existing conclusion picker.
- VERIFIED OK — Every number on screen comes from measured worker values. Evidence: sugarStart and sugarEnd come from `poolTotal` on the live worlds; counts come from `measureSummary`. Nothing is labelled better or worse.
- VERIFIED OK — The pair action is offered only for Garden ideas. Evidence: `pairOffered` excludes R-G0, and the worker's `variantPairRefusal` also refuses a non-Garden source or a `none` patch.
- VERIFIED OK — Sequential trigger. Evidence:
  - `pairRunsSequentially` returns true only for a numeric deviceMemory ≤ 2, and is unit-tested.
  - The setup line matches the assignment word for word, and the e2e test fakes deviceMemory = 1.
- VERIFIED OK — The UI copies of the constants match the worker's. Evidence: the host test asserts `UI_SECONDS*10 === VARIANT_PAIR_TICKS` and that both base ids are R-G0.

**narration (P4.9)**
- VERIFIED OK — The 16 phrases are exactly UX §8.3, in order, and only a phrase id can reach SpeechSynthesis. Evidence: `PHRASES`, plus `isPhraseId` in `Narrator.refusal`. The narration test feeds free text, names and numbers and all are refused.
- VERIFIED OK — Off by default, and older settings load with it off. Evidence: `AUDIO_DEFAULTS.narration = false`, and `audioPrefsOf` uses `s.narration === true`.
- VERIFIED OK — Volume, gesture, hold, availability and repeat rules. Evidence:
  - Volume comes from the voice bus; mute or volume 0 means nothing is spoken.
  - Nothing is spoken before `initAudio`, or while `suspendAudio` holds; the hold cancels speech and drops the queue.
  - A missing speechSynthesis is silent and raises no error.
  - The 10 s repeat rule holds.
  - All of this is unit-tested and passed.
- VERIFIED OK — One evidence rule per phrase. Evidence: `src/ui/narration.ts` `RULES`, with 16 tests, each with the evidence present and absent. The three equipment phrases are hard false, and the test exercises every pair of transitions.
- VERIFIED OK — Each rule's reason codes match UX §5.2 and §8.3. Evidence:
  - FOOD_ACCESS_LOW and FOOD_NONE_COMPATIBLE give "Needs more food".
  - DIV_BLOCK_PLACEMENT and DIV_BLOCK_CROWDING give "Needs room".
  - RESTING_FOOD_SCARCE and RESTING_DRY give "Resting"; these are the only RESTING_* codes in src/sim/reasons.ts.
  - The visible equivalents exist: "Ate last second" (Inspector.tsx:630), "It split in two" (:834), PLAY_PROMPT, and the reason strings.
- VERIFIED OK — The cues are distinct. Evidence:
  - drop (placement), division and discovery are distinct by source, pitch and length.
  - `discovery` is the cue for an opened discovery card (DiscoveryCard.tsx:27).
  - The 4/s world-cue limiter and division coalescing are tested.
- VERIFIED OK — Reduced-motion code matches the UX §7.4 alternatives, and each choice is a pure function in `features.ts` that `renderer.ts` calls. Evidence:
  - A birth now draws a static split frame for 1 s; before, it drew nothing.
  - The placement ring is a still ring for 1 s.
  - The stain is held still.
  - Pulses use frame 0, and E07 trails are not drawn.
- VERIFIED OK — The UX §7.4 table and CSS are correct. Evidence:
  - Every "As built" symbol I spot-checked exists (camera `fit`/`zoomAt`/`centerOn`, `drawFavorites`/`drawProbes`/`drawLinks`/`drawLineage`, `composePicture`, `drawFrame`).
  - The CSS has exactly one keyframe animation (`show-me-pulse`) and no transitions.
  - Both reduced-motion rules now cover `::before` and `::after`.
- VERIFIED OK — Ownership. Evidence: the only state.ts edit is one optional `Settings.narration` field, as allowed; UX_SPEC changed only in §7.4; no sim or worker edit.
