# G2 wave C: rules, data and tests check of the module-mark, lockout and sim-tune work

Verdict: **ok = false**, because of one MAJOR item. The DORMANCY_LOCKOUT reason is computed but nothing outside the tests reads it. The builder reported this and could not fix it, since the files belong to other agents. Everything else holds up under independent re-runs. The art build is deterministic, the validator checks the new frames, the production renderer draws the marks from the atlas, the hashes are unchanged before and after, and E01 secretion is counted.

All my scratch files are in `tmp/verify-art-marks-rules/`. I changed no repository file except this one.

## Problems (most severe first)

1. **MAJOR: DORMANCY_LOCKOUT never reaches the UI.** Line: `src/sim/dormancy.ts:172`.
   - `dormancyReason()` has no caller in `src/` apart from a doc comment (`src/ui/strings/reasons.ts:12`). Running `grep -rn "dormancyReason" src` finds only the definition and that comment.
   - SPEC §12.2 is headed "Reason codes (engine → UI)", and the assignment asked to "set it for an E03 carrier". As delivered, the code exists only in tests.
   - The inspector's "just woke up" chip (`Inspector.tsx:225`) and the line "Just woke up: it cannot rest again for N s." (`strings/modules.ts:145`) still come from the measured `lockoutSeconds`. They are not tied to the reason code. The new `restHeld` wording ("it would start resting now, but…") never shows on screen.
   - This is not the builder's fault: the edits are in `src/sim/moduleView.ts`, `src/worker/protocol.ts`, `src/ui/strings/modules.ts` and `src/ui/panels/Inspector.tsx`, none of which they own. The builder listed the four small additions needed (report, decision 4).
   - The lead must make those four edits before this item counts as done.

2. **MINOR: the "no state change" test would pass even if the refactor changed results.** Line: `tests/sim/dormancy.test.ts:169`.
   - The test compares two worlds that both run the new code, one reading the reason and one not. That proves reading has no side effects. It does not prove the new `stateReason` / `foodTriggerMet` / `dryTriggerMet` code gives the same results as the old code.
   - The old-versus-new proof is only in the builder's report.
   - I checked it independently (see VERIFIED OK below) and the results are identical, so the claim holds. The test is just weaker than its title suggests.

3. **MINOR: the lab text shows "for 0 s" in the last 0.4 s of the lockout.** Lines: `src/ui/strings/reasons.ts:16` and `:130-134`.
   - `secs()` rounds to the nearest second, so a value of 0.1 prints "Just woke up: it would start resting now, but cannot rest again for 0 s." (reproduced with `tmp/verify-art-marks-rules/copy.ts`).
   - The PREPARING and WAKING countdowns already do the same, so this is consistent with existing text. Rounding countdowns up would read better.

4. **MINOR: ESLint does not enforce the rule that src/render must not import art/src.** Lines: `eslint.config.js:94-98`.
   - ARCH §3 says module boundaries are "enforced by ESLint import rules". The src/render rule blocks only preact and `@ui/*`.
   - The only guard is the regex in `tests/sim/module-visuals.test.ts:197`, `/from\s+['"](?:@art\/|(?:\.\.\/)+art\/)/`. It misses a side-effect `import '@art/…'` and a dynamic `import('@art/…')`.
   - The builder reported this; `eslint.config.js` isn't theirs to change. Adding `'@art/*'` to the src/render patterns would fix it.

5. **MINOR: other modules' marks get no frame-count check yet.** Line: `tools/content-validate.ts:81-85`.
   - `FEATURE_FRAMES` covers only the three marks in use now. Any other mark only needs one frame.
   - ARCH §10.1 also sets counts for the jacket (4 levels), the cache (4 fills), Lantern (dim/glow), the trap (open/holding/cooldown) and role marks (×5). When E11, E17 and others are turned on in later phases, a one-frame mark would pass the check.

6. **MINOR: a decision in DECISIONS.md is now out of date.** Line: `docs/DECISIONS.md:174`.
   - D-0019 still says "Module marks are built at runtime from art/src/layers for now; packing them into the atlas (ARCH §10.1) is a follow-up."
   - The builder's proposed decisions 1–3 (marks packed in the organism atlas, lockout computed and never stored, sim-tune counting by producer rules) need a dated entry from the lead. The builder doesn't own DECISIONS.md.

7. **MINOR: the renderer ignores the manifest's mark size.** Lines: `src/render/renderer.ts:654-655`.
   - Marks are scaled by `(scale * d.size) / 16`, a fixed 16. The manifest's `features[layer].size` is ignored, although the doc comment on `AtlasFeatureLike.size` says the renderer scales by it.
   - This is safe today because the validator requires size 16 (`FEATURE_SIZE`). The code and its comment disagree, though.

8. **MINOR: the builder's Playwright runs never drew a mark.**
   - The grep for E01/E03/dormancy/rest matched new-dish only through a comment: "pause it now so the rest of the journey reads a still dish" (`tests/e2e/new-dish.spec.ts:139`). The report doesn't say this was a false match.
   - The experiments spec opens the EXP_C dish at the whole-dish view, where sprites and marks are hidden (ARCH §9: below scale 1 only the aggregation layer draws).
   - So the "39 passed" is a general regression check, not evidence about the marks. The builder's own screenshot harness is the real evidence, and my throwaway spec below backs it up.

## Outside this assignment (for the lead)

- **`src/sim/experiments.ts:397` still counts secretion only for native producers.** It uses `sp.secretesStarch`, so E01 carriers are left out, and a resting producer shows an old secretion code. The builder already reported this. Nothing in `src/ui` reads those `secretion` shares (grep finds none), so no player sees it, but the recorded experiment data is incomplete.

## VERIFIED OK

- **The art build is deterministic.** I ran `buildAtlas()` twice in memory (`tmp/verify-art-marks-rules/det.ts`):
  - Both builds give png sha256 `5c232dad4319dc39…` and manifest sha256 `fcff92c28de17b5f…`, the same as the committed files.
  - `npx tsx tools/art-build.ts --check` prints "atlas up to date · 221 frames (32 feature-mark frames) · 512×256 · 5c232dad4319" and exits 0.
- **No sprite frame moved.** Of the 189 sprite frames at HEAD, none moved and no pixel changed. The `sprites` table is identical, the sheet is still 512×256, and no two of the 221 frame rectangles overlap, even counting the 2 px padding.
- **The manifest change is additive.** The keys at HEAD were format…sprites, frames. Now `features` is added and no other key changed.
- **content:validate checks the marks.** `npx tsx tools/content-validate.ts` exits 0 and prints "atlas … complete for 5 enabled species and 3 enabled module marks (starch_notch, resting_seam, reserve_pocket; 221 frames)".
  - Both tests for the missing-frame message pass: `E03 (resting_seam): missing frame "feature/resting_seam/n/2"`, and the CLI exits 1 and names `frames[feature/resting_seam/w/1]`.
  - These tests would fail on the old code, which had no `features` table.
- **Frame counts match ARCH §10.1.** Required frames are "dormancy prepare/rest/wake" (3) and "reserve 4 bands" (4). The seam frames are keyed prepare/rest/wake in that order and packed in all four headings. The heading order `e,s,w,n` is the same in `art/src/sprite.ts:10`, `tools/content-validate.ts:50` and `src/render/features.ts:66`.
- **The production renderer draws marks from the atlas.**
  - `grep -rnE "from ['\"](@art|[./]*art/src)" src/` finds nothing (exit 1).
  - A fresh `vite build` into `tmp/dist-verify-art-marks-rules` contains none of the palette colours that exist only in art (`#A9B46A`, `#4E5620`, `#E8C27A`).
  - I served that build on port 4203 and ran a throwaway Playwright spec (desktop). It opened the EXP_C dish, zoomed in four steps and took a screenshot (`tmp/verify-art-marks-rules/exp-c-zoom.png`). The screenshot shows reserve pockets on the E05 carriers, with no console errors. The manifest lists 3 mark layers with 32 frames. The only atlas requests were `manifest.json` and `organisms.png`.
  - The spec passed in 24.9 s. I then stopped port 4203 only.
- **Reading the lockout reason doesn't change results.** I copied the working tree twice and put HEAD's `src/sim/dormancy.ts` into one copy (`tmp/verify-art-marks-rules/hashcmp.ts`).
  - The test dishes were a clear-water dish with 8 E03 / E01+E03 carriers (starve, rest, sugar, wake, lockout, save/reload in the middle of the lockout, starve again), and FIRST_DISH_V1 seed 104729 with 30 carriers run for 4000 ticks.
  - Old and new code gave the same 157 sampled hashes (digest `57cc7079e497d10a`, last hash `f878f777b90c78ce`).
  - The run included 5100 organism-ticks in lockout, 950 preparing, 9884 resting and 850 waking. Saving and reloading during the lockout gave an equal hash.
- **Not storing the reason is right.** `stateHash` hashes every column in `ENTITY_COLUMNS` (`src/sim/serialize.ts:232-236`), including `limitCode` (`src/sim/entities.ts:63`). Writing the label there would change hashes, which the assignment forbids.
  - DORMANCY_LOCKOUT was already in `src/sim/reasons.ts:60`. That file has no diff, so nothing was renumbered.
- **The reason follows the rules.**
  - `restDue` uses the same helpers (`foodTriggerMet`, `dryTriggerMet`) and the same `entryMinEnergy` check as the entry test in `dormancyStep`.
  - This matches D-0019: "Rest triggers keep counting during the 30 s post-wake lockout; only entry waits."
  - The numbers match SPEC §7.6 ("Active; 30 s lockout before the next dormancy attempt"; trigger 20 s × (1.5 − g_dorm); E ≥ 15) and CT §12.7 ("lockout 30 s"). With neutral g = 0.5, the test's figures (rest due 200 ticks after waking, for 100 ticks, preparing at 300) agree.
  - The text follows the UX §5.2 pattern (Lab text adds the value inline). The Explore wording "Just woke up." was there before.
- **sim-tune counts E01 carriers.** It now counts every organism whose profile has producer rules (`profileOf(world, i).starch !== null`).
  - The new tests would fail on the old code, which used `sp.secretesStarch` and so gave `{}` for B01.
  - Counting a resting producer under its state reason matches `structures.ts:83`, which skips secretion for any organism that is not Active, and D-0019 ("Waking blocks feeding, movement and secretion").
- **Checks I re-ran:**
  - `npx vitest run` on the 5 touched test files plus `tests/render`: 6 files, 45 tests passed.
  - Neighbouring tests (`tests/content/validator`, `tests/sim/modules`, `tests/fixtures/{module-accounting,determinism,enzyme-source}`, `tests/ui/shortcuts`): 6 files, 38 tests passed.
  - `npx tsc -p tsconfig.json --noEmit`: exit 0.
  - `npx eslint` on the 14 changed files: exit 0.
- **Ownership.** Every file the builder changed is on their list. The `renderer.ts` change touches only mark-texture loading, plus an optional `features` field added to `AtlasManifestLike`. `reserveRim` was removed, and nothing else in the repository used it.
- **Determinism, conservation and saves.**
  - The changed sim code adds no random streams and uses no `Math.random`, `Date` or unordered iteration. `profileOf` only fills a cache that isn't hashed.
  - No material moves.
  - No saved field or column changed, so no schema bump or migration is needed.
  - The frame order in `art-build` is deterministic: a stable sort by size, with marks in `FEATURE_LAYERS` order.
