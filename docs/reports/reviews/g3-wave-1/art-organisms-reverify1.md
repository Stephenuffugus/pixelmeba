# g3 wave 1: art-organisms re-verify 1 (rules + player)

Verdict: **ok**. MAJOR 1 is fixed, and so are MINORs 3, 4 and 5. MINOR 2 still needs a DECISIONS.md entry or an owner ruling. MINOR 6 is a design note. I found no new BLOCKER or MAJOR.

I edited nothing tracked except this file. Scratch files are in `tmp/verify-art/`.

## Remaining problems

- **MINOR - B01|B06 is still exempt from the alpha rule, and nothing records the ruling.**
  - Where: `tests/content/silhouettes.test.ts:32` (`SAME_OUTLINE = {B03|B07, B01|B06}`).
  - `docs/DECISIONS.md` has no entry for it; the last entry is D-0045, and a grep for B01/B06 or silhouette finds nothing.
  - The exemption is now narrow. The test requires every exempt pair to measure alpha < 12 % (`silhouettes.test.ts:100`), and B01|B06 measures 7.0 % alpha and 31 % luminance.
  - The lead should add the proposed text from `art-organisms-fix1.md` as a DECISIONS.md entry, or list it as an owner question in EXPANSION_RESPONSE §8.
- **MINOR (note, unchanged) - `checkAtlas` only checks that frames exist; it never compares pixels.**
  - Repro: `npx tsx tmp/verify-art/drop.ts` swaps the rects of b03 and b05 `move/e` and `checkAtlas` reports 0 issues.
  - This is by design, because checkAtlas must stay independent of `art/src`. `atlas.test.ts:202` ("committed atlas is its output", i.e. `art:build --check`) catches it.

## Fixed problems

- **VERIFIED OK - MAJOR 1 (F02 growing tip drawn in the pulse colour).**
  - The fix is at `art/src/sprites/fungi.ts:176`: `tip: overlayTip(L, C)`, a cordLight `#D69A5E` cap with a copper dot and a cordDeep outline. The thumbnail end pixels are cordLight (`fungi.ts:147`).
  - `#F6D7B0` (palette index T) is now used only by `cordPulse` (`fungi.ts:151-159`).
  - The player can tell them apart:
    - In `tmp/verify-art/net-4x.png` and `net-2x.png`, my own F02 network shows tips on 3 free ends and pulses on 2 tiles, in colour, grayscale, deutan and tritan. The tips read as outlined light-copper end caps; the pulse is a pale, nearly white, outline-free square or dot.
    - The asset previewer shows the same: `tmp/verify-art/shots2/desktop-fungi.png` and `shots2/phone-card11.png`.
    - The grayscale values differ: tip 162 / 125, pulse 219.
  - The new test bites. I ran a copy of the test with a load-time mutant (`MUT=oldTip`: F02 tip := F01's `overlayTip(T, L)`, i.e. the old tip) and got 1 failed. `MUT=thumbPulse` (a pulse pixel in the thumbnail) also gave 1 failed. Command: `npx vitest run -c tmp/verify-art/vitest.mut2.config.ts`.
- **VERIFIED OK - MINOR 3 (the F01|F02 exemption weakened the test).**
  - F01|F02 is no longer in `SAME_OUTLINE` (`silhouettes.test.ts:32`), and the test asserts this at `:119`.
  - The mutant "F02 takes F01's tiles, keeps its copper palette" (`MUT=laceF02`) now gives 3 failed: the F01|F02 pair test, the non-vacuity test and the pulse-colour test. Before the fix, the previous verifier's run had 0 failing.
  - Other mutants also fail:
    - `copyY01toY02`: 1 failed.
    - `swapB03B05`: 3 failed.
    - `B07paletteB03`: 1 failed (non-vacuity).
- **VERIFIED OK - MINOR 4 (checkAtlas did not require F02's pulse).**
  - The spec is at `tools/content-validate.ts:113` (`extra: pulse ≥ 1 frame`), and checkAtlas applies it at `:259-264`.
  - Results from `npx tsx tmp/verify-art/drop2.ts`:
    - Deleting the F02 pulse animation and its frames gives 1 issue at `sprites.f02_cordweaver.animations.pulse`, with the message `missing required animation "pulse" (1 frames × 1 heading(s), UX §6.3 "pulse on transfer")`.
    - With `P3_SPRITES.F02.extra` removed at load time (the old spec), the same drop gives 0 issues. So `atlas.test.ts:289` (which expects exactly 1 issue) bites.
    - Declaring `pulse.frames: 0` also gives an error.
- **VERIFIED OK - MINOR 5 (bodies larger than "8–12 px visible body", UX §6.2).**
  - Pixel dumps (`npx tsx tmp/verify-art/dump.ts B03,B07,B08,Y02`) show the bodies:

    | Sprite | Body | Box with outline | Margin |
    |---|---|---|---|
    | B03 | 12×6 | 14×8 | 1 px clear |
    | B07 | 12×6 | 14×8 | 1 px clear |
    | B08 | 12×6 | 14×8 | 1 px clear |
    | Y02 | 7×12 | 9×14 | 1 px clear |

  - The silhouettes still hold. B07 keeps its amber head in all 4 headings; B08 keeps both white bands; Y02 is still a pear with its orange bud. I checked every animation and heading in `tmp/verify-art/fixA.png`.
  - The new test bites:
    - A load-time mutant that substitutes a copy of `phase3_small.ts` with the old endpoints (`curvedRod` 3.4/12.6, `broth` 4.6/11.4) gives `MUT=oldLengths`: 3 failed (B03, B07, B08).
    - `MUT=edgeY02` (outline at the frame edge) gives 1 failed.
  - V01 is left out of this test, correctly: UX §6.2 says "Viruses: inspection glyph + density overlay only".

## Rules checks (my own, this session)

- **Determinism:** I ran `buildAtlas()` twice into scratch files (`tmp/verify-art/build-to.ts r1/r2`). Both runs produced png `fad8795a60df56dc` and identical bytes, and the output is byte-equal to the committed `public/atlas/organisms.png`.
- **`npx tsx tools/art-build.ts --check`:** "atlas up to date · 795 frames (32 feature-mark frames) · 1024×1024 · fad8795a60df".
- **Shipped art is unchanged.** I wrote my own comparison (`node tmp/verify-art/cmp2.mjs`) against `git show HEAD:public/atlas/organisms.png` and `HEAD:public/atlas/manifest.json`.
  - All 221 HEAD frames have identical RGBA and the same w×h.
  - The sprite records for a01, b01, b04, b06 and p01 are unchanged, and so are the 3 feature layers (starch_notch, reserve_pocket, resting_seam).
- **Records match the atlas.** For all 19 Phase 1–3 species records, the atlas sprite's size and headings match the record's `frameSize` and `headings` for its `assetId`.
  - Frame counts per form: small 4/4/2/3, large 6/4/4/2/4, fungus 16 mask + 16 decaying + tip + bud + idle thumb (F02 adds pulse ×2), virus glyph + idle.
- **checkAtlas, every Phase 1–3 record:** 0 issues.
  - Dropping one frame of each kind gives exactly 1 precise issue each. I tried b05 death/w/2, p03 feed/n/3, p02 move/w/5, f01 mask/e/10, f02 tip, f02 pulse/0 and pulse/1, v01 glyph, v01 idle, x01 move/e/3 and y02 idle.
  - `tools/content-validate.ts` imports nothing from `art/src`.
- **`npm run content:validate`:** "content ok … species 38 (enabled 5) … atlas complete for 5 enabled species and 3 enabled module marks (795 frames)".
  - `content/manifest.json` `enabledSpecies` is still `[A01, B01, B04, B06, P01]`, the same as HEAD. The other manifest churn there (materials, chemistry) belongs to the environment builder.
- **Unit tests:** `npx vitest run tests/content tests/sim/module-visuals.test.ts` passed: 7 files, 169 tests.
- **Typecheck:** `npx tsc -p tsconfig.json --noEmit` exited 0.
- **Lint:** eslint on the art files is clean.

## Player checks

- **Asset previewer** (`npx vite --port 4289`, `/tools/asset-preview.html`, driven by `tmp/verify-art/shots.mjs` → `tmp/verify-art/shots2/`):
  - The status line reads "19 sprites · 3 module marks · 795 frames · export fad8795a60df", with 19 species cards. There were no console or page errors at phone (390×844) or desktop (1440×900) size.
  - In the game-scale dense views (colour, gray, deutan, tritan), every Phase 3 species reads clearly.
  - The F02 network shows tips and the transfer pulse as different cues.
- **App load:** `E2E_PORT=4289 E2E_OUTDIR=tmp/dist-verify-art npx playwright test tests/e2e/garden.spec.ts --project=desktop` passed 9/9 (3.4 min). The built atlas has exportHash `fad8795a60df…`. I stopped port 4289 before and after.

## Note (not a defect)

- F02's tip has modest contrast against the cord at 1–2× zoom: cordLight on copper, about 37 grey levels apart. It is a light cap with a dark outline. It is readable, and §6.1 gives F02 no tip colour, so I leave it to a polish task.
- The pulse-colour test matches the exact `#F6D7B0`, so a near-identical new colour would pass it. That is acceptable for now.
