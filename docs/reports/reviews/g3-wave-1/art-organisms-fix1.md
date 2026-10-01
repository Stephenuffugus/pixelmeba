# g3 wave 1: art-organisms fix 1

Nothing is committed. The work is in the working tree, as the assignment asked.

## Per problem

### MAJOR 1: F02's growing tip was drawn in the pulse colour — FIXED

**How:**
- `art/src/sprites/fungi.ts`: F02 `tip` is now `overlayTip(L, C)`. That draws a cordLight `#D69A5E` cap with a copper `#B87333` centre dot and a cordDeep `#7E4C1F` outline.
- The `cordThumb` thumbnail no longer paints the two `#F6D7B0` centre pixels. Its two free ends are now cordLight.
- `#F6D7B0` now appears only in `pulse/e/0…1`, which has no outline. The tip has a dark outline and is a mid-light copper, about 57 grey levels darker than the pulse.
- The doc comment in the file now records the rule.

**Test:** `tests/content/silhouettes.test.ts`, "F02 uses its transfer-pulse colour … only in the pulse frames". Every F02 frame outside `pulse` must have 0 pixels of the palette index whose colour is `P.cordPulse`, and every pulse frame must have more than 0.
- With the old `overlayTip(T, L)` restored, the test fails (1 failed / 122 passed).
- With the fix, it passes.

### MINOR 2: B01|B06 is exempt from the alpha rule — NOT FIXED (needs an owner ruling or a DECISIONS.md entry, which is outside my files)

The exemption cannot be avoided while the Phase 1 art stays byte-identical:
- B01|B06 measures alpha 7.0 % and luminance 31 %.
- UX §6.3 describes the two as "B01 compact rod with pale mid band · B06 short rod with three notches".

The test now requires every exempt pair to actually measure below 12 % alpha (see MINOR 3), so this exemption cannot shelter anything else. The comment in the test points to this report.

Proposed DECISIONS.md text for the lead:

> D-00xx (2026-10-01): The silhouette test (UX §6.1 "distinguishable by silhouette and pattern in grayscale") holds shipped B01 Sprinter / B06 Crumbsmith to the grayscale-pattern rule (luminance ≥ 12 % of shared pixels: 31 %) rather than the outline rule (alpha 7.0 %). Their Phase 1 art is kept byte-identical; both are "rod" in UX §6.3 and differ by band/notch pattern. Owner may ask for a B06 silhouette change in a polish task.

### MINOR 3: the F01|F02 exemption weakened the test — FIXED

**How:**
- `SAME_OUTLINE` is now `{B03|B07, B01|B06}`. F01|F02 measures 0.333 alpha, so it is held to the strict alpha rule.
- Each pair still listed must measure alpha below 12 %. The message on failure is "listed as a shared outline but differs in alpha; drop it from SAME_OUTLINE". An exemption can therefore only be taken where the outline really is shared.
- I did not follow the verifier's suggested fix (use the luminance rule whenever alpha is below 12 %). It would not kill the mutant: F02 with F01's tiles has alpha 0, and copper vs ivory still passes the luminance rule. So I removed the pair from the list instead.

**Test:**
- The F01|F02 pair test.
- The extended non-vacuity test, which builds "F02 animations := F01, F02 palette kept", asserts its alpha is below 12 %, and asserts F01|F02 is not in `SAME_OUTLINE`.

**Mutant check:** I temporarily changed F02 `mask` to `laceMasks`. Two tests failed ("F01|F02 differ by silhouette…" and "the measure is not vacuous…"); 121 passed. After restoring the file, all 123 pass.

### MINOR 4: checkAtlas did not require F02's pulse — FIXED

**How:**
- In `tools/content-validate.ts`, `SpriteSpec` gains `extra?: (FrameRequirement & { rule })[]`.
- `P3_SPRITES.F02` gets `extra: [{ anims: ['pulse'], frames: 1, rule: 'UX §6.3 "pulse on transfer"' }]`.
- checkAtlas checks the extras after the form's frame table, and the error names the rule.
- The minimum is 1 frame, because the docs give no count. The art ships 2, and `atlas.test.ts` still pins 2 for the committed atlas.

**Test:** `tests/content/atlas.test.ts`, "requires F02 Cordweaver's transfer pulse …". It deletes `f02_cordweaver.animations.pulse` and its frames, and expects exactly one issue at `sprites.f02_cordweaver.animations.pulse` with the message `F02 (f02_cordweaver): missing required animation "pulse" (1 frames × 1 heading(s), UX §6.3 "pulse on transfer")`.
- With the old F02 spec, the test fails.
- With the fix, it passes.

### MINOR 5: bodies wider than "8–12 px visible body" — FIXED for B03, B07, B08 and Y02; NOT A PROBLEM for V01

**How:**
- B03 and B07 `curvedRod` endpoints moved from 3.4/12.6 to 4.4/11.6.
- B08 `broth` rod moved from 4.6/11.4 to 5.6/10.4. The bands stay at x 5 and 10.
- Y02 `pear` was shortened: stroke 10.6→5.8, radius 3.4, bud at y 3.8.

Results:

| Sprite | Body | Box with outline | Margin |
|---|---|---|---|
| B03 | 12×6 | 14×8 | 1 px clear on every side |
| B07 | 12×6 | 14×8 | 1 px clear on every side |
| B08 | 12×6 | 14×8 | 1 px clear on every side |
| Y02 | 7×12 | 9×14 | 1 px clear on every side |

B07 keeps a 3-column amber head and B08 keeps both white bands. All 123 silhouette tests still pass with the new shapes.

**Test:** `silhouettes.test.ts`, "small body size (UX §6.2 …)". For every Phase 3 small organism (B02, B03, B05, B07, B08, X01, Y01, Y02), every loop frame must have a body (non-outline pixels) of 8–12 px on its long axis, and the outline must not touch the frame edge.
- With the old B03/B07/B08 coordinates, 3 tests fail.
- With the fix, they pass.

**V01 is not a problem:** UX §6.2 scopes the rule to "Small (bacteria, yeast, algae, parasites): 16×16 frames, 8–12 px visible body". For viruses it says separately "Viruses: inspection glyph + density overlay only". The V01 glyph is an inspection glyph, not an organism body.

**Shipped B04 (16×6) is left as it is:** Phase 1 art stays byte-identical, and the test excludes it with a comment.

**Fungi are excluded:** their tiles join edge to edge by design (ARCH §10.1 connection masks).

### MINOR 6: checkAtlas does not look at pixels — NOT FIXED (a note, by design)

The assignment asks that checkAtlas stay "independent of art/src". It is a completeness check. `tools/art-build.ts --check` guards pixel identity: it rebuilds the atlas and compares it byte for byte with the committed one. `atlas.test.ts` runs that check ("art:build is deterministic and the committed atlas is its output"), so swapped frame rects fail `npm run check`.

## Files changed in this fix

- `art/src/sprites/fungi.ts`: F02 tip, F02 thumbnail, doc comment.
- `art/src/sprites/phase3_small.ts`: B03/B07 `curvedRod`, B08 `broth`, Y02 `pear`.
- `public/atlas/organisms.png` and `public/atlas/manifest.json`: regenerated by `npm run art:build`.
- `tools/content-validate.ts`: `SpriteSpec.extra`, the F02 pulse requirement, and checkAtlas checking the extras.
- `tests/content/atlas.test.ts`: the F02 pulse requirement test.
- `tests/content/silhouettes.test.ts`: `SAME_OUTLINE` tightened, exemption-must-be-needed check, F01/F02 mutant in the non-vacuity test, small body-size suite, F02 pulse-colour suite.

## Commands and results

**Build and atlas:**
- `npm run art:build`, run twice: both runs gave "wrote atlas · 795 frames (32 feature-mark frames) · 1024×1024 · fad8795a60df", the same hash each time.
- `npx tsx tools/art-build.ts --check`: "atlas up to date · 795 frames … · fad8795a60df", exit 0.
- `node tmp/verify-art/compare.mjs` against the HEAD atlas (`tmp/verify-art/old.png` is identical to `git show HEAD:public/atlas/organisms.png`) gave `{oldFrames:221, same:221, diff:0, missing:0, metaDiff:0, newPadNonTransparent:0, overlapsWithin2px:0, spriteSame:true, featSame:true}`. The Phase 1 sprites and feature layers are still byte-identical.

**Tests and checks:**
- `npx vitest run tests/content tests/sim/module-visuals.test.ts`: 7 files, 169 tests passed. Before this fix it was 158; the new tests account for the difference.
- Mutant checks, each run with the file restored afterwards:

  | Mutant | Result |
  |---|---|
  | Old F02 tip | 1 failed |
  | F02 with F01's tiles | 2 failed |
  | Old B03/B07/B08 lengths | 3 failed |
  | Old F02 validator spec | 1 failed (atlas pulse test) |

- `npm run content:validate`: "content ok · … species 38 (enabled 5) · … atlas public/atlas/manifest.json complete for 5 enabled species and 3 enabled module marks (…; 795 frames)".
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint art/src tools/art-build.ts tools/art-preview.ts tools/asset-preview.ts tools/content-validate.ts tests/content/atlas.test.ts tests/content/silhouettes.test.ts`: clean.

**End-to-end:**
- `E2E_PORT=4214 E2E_OUTDIR=tmp/dist-art-organisms npx playwright test tests/e2e/garden.spec.ts --project=desktop`: 9 passed (5.2 min).
- The built `tmp/dist-art-organisms/atlas/manifest.json` has exportHash `fad8795a60df…`.
- Port 4214 was stopped before and after the run.

No species was enabled. `content/`, `src/sim` and the manifest were not touched.
