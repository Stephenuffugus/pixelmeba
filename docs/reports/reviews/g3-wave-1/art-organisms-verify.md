# g3 wave 1: art-organisms verification (rules + player lenses)

Verdict: **ok = false**. There is one MAJOR finding, a truthfulness problem in the F02 art. Everything else in the Build and "Done when" lists holds. The rest of the findings are MINOR.

Scratch files and evidence are in `tmp/verify-art/`: `compare.mjs`, `build-to.ts`, `drop.ts`, `pairs.ts`, the mutant harness under `mut/`, the sheets under `sheets/`, `ov16.png`, `ov32.png`, `large-e.png`, the preview screenshots under `shots/`, and the logs `e2e.log` and `e2e2.log`.

## Problems (most severe first)

### MAJOR 1: F02's growing tip is drawn in the transfer-pulse colour

**Where:**
- `art/src/sprites/fungi.ts:171`: `tip: anim([overlayTip(T, L)] …)`
- `art/src/sprites/fungi.ts:124`: in `cordPalette`, index `T` = `P.cordPulse` `#F6D7B0`
- `art/src/sprites/fungi.ts:142`: the thumbnail centre is also painted `T`

**The rule it breaks:** UX §6.1 names `#F6D7B0` as F02's pulse colour ("F02 copper `#B87333` / pulse `#F6D7B0`"). UX §6.3 says "F02 copper threads with pulse on transfer". CLAUDE.md requires "Every visible feature maps to real state".

**What a player sees:** every F02 growing end (the `tip/e/0` overlay) is a pale `#F6D7B0` square with a lighter dot. That is almost identical to `pulse/e/1`, a pale `#F6D7B0` 4×4 square with a lighter centre. In the asset previewer's "Fungal networks" section, F02's four tips and its one mid-thread pulse cannot be told apart. An F02 network that has never transferred anything would look as if it were pulsing at every tip.

**Repro:**
1. Run `npx vite --port 4289`.
2. Open `/tools/asset-preview.html` and go to "Fungal networks" → "F02 Cordweaver network". See `tmp/verify-art/shots/desktop-fungi.png`.
3. Compare the F02 card's "tip" and "pulse" strips (`tmp/verify-art/shots/phone-card11.png`), or rows 4 and 6 of `tmp/verify-art/sheets/f02_cordweaver-color.png`.

**Fix:** draw F02's tip in the copper or light-copper tones (for example a `cordLight` cap with a `cordDeep` outline), and keep `#F6D7B0` for `pulse` only. Optionally also drop the pulse pixels from the thumbnail.

### MINOR 2: B01|B06 is exempted from the silhouette rule, which goes beyond the assignment's exception list

**Where:** `tests/content/silhouettes.test.ts:27`, `SAME_OUTLINE = new Set(['B03|B07', 'F01|F02', 'B01|B06'])`.

The "Done when" list names only "B03 and B07 curved rods; F01 and F02 threads" as exceptions. B01|B06 measures alpha 0.070 (recomputed: `npx tsx tmp/verify-art/pairs.ts`), so it fails the alpha rule. The conflict cannot be avoided, because the shipped art must stay byte-identical. It is disclosed as a PROPOSED DECISION, so this is MINOR. The owner should rule on it, or the lead should log it in `docs/DECISIONS.md`.

### MINOR 3: the F01|F02 same-outline exemption makes the silhouette test weaker than the art needs

**Where:** `tests/content/silhouettes.test.ts:27`.

F01 and F02's mask-10 tiles actually differ in alpha by 0.333 (`tmp/verify-art/pairs.ts`), so they would pass the strict alpha rule. Because the pair is held only to the luminance rule, the test does not notice when F02 takes F01's tile shape.

**Repro:** in mutant `F02paletteF01` (`MUT=F02paletteF01 npx vitest run -c tmp/verify-art/vitest.verify.config.ts tmp/verify-art/mut/tests/sil-mut.test.ts`), F02's animations are replaced with F01's while F02 keeps its copper palette. All 113 tests pass.

The assignment itself listed this pair, so the builder followed it. The suggestion is to hold same-outline pairs to the luminance rule only when their alpha difference is actually below 12 %.

### MINOR 4: checkAtlas does not require F02's `pulse`

**Where:** `tools/content-validate.ts:63` (`FUNGUS_FRAMES`) and `:110` (`F02` spec). The F02 spec has no extra-animation requirement.

UX §6.3 makes "pulse on transfer" part of F02's identity.

**Repro:** in `tmp/verify-art/drop.ts`, deleting `f02_cordweaver.animations.pulse` and its frames gives `checkAtlas(...)` = 0 issues.

Only `atlas.test.ts` (`per('f02_cordweaver','pulse') === 2`) catches it, against the committed atlas. `content:validate` would accept an atlas with no pulse once wave 2 enables F02.

### MINOR 5: B03, B07 and B08 bodies are 14 px long, filling the frame edge to edge

**The rule:** UX §6.2 says "Small (bacteria, yeast, algae, parasites): 16×16 frames, 8–12 px visible body".

**Measured** (`node tmp/verify-art/bbox.mjs`, frame 0 facing E, including the 1-px outline):

| Sprite | Bounding box |
|---|---|
| B03 | 16×8 |
| B07 | 16×8 |
| B08 | 16×8 |
| Y02 | 9×15 |
| V01 glyph | 12×16 |

That is about 14 px of body inside the outline.

Shipped B04 already measures 16×6, so there is precedent, and the shapes stay readable. The outline still touches the frame edge, though, so neighbours in dense groups butt together.

### MINOR 6: the completeness check does not see pixels

**Repro:** in `tmp/verify-art/drop.ts`, swapping the atlas rects of `b03_dusk/move/e/*` and `b05_crossfeeder/move/e/*` gives `checkAtlas` = 0 issues.

`art-build --check` guards the shipped atlas, so this is only a note: species identity in the atlas is protected by `--check`, not by `content:validate`.

## VERIFIED OK

- **VERIFIED OK: deterministic build.**
  - `tmp/verify-art/build-to.ts` ran `buildAtlas()` in two separate processes. Both gave PNG sha `bb424747d756d844` with 0 errors.
  - `cmp` showed b1 = b2 = the committed `public/atlas/{organisms.png,manifest.json}`.
  - `npx tsx tools/art-build.ts --check` printed "atlas up to date · 795 frames (32 feature-mark frames) · 1024×1024 · bb424747d756" and exited 0.
- **VERIFIED OK: Phase 1 art and feature layers are byte-identical.** `node tmp/verify-art/compare.mjs` was run against `git show HEAD:public/atlas/{organisms.png,manifest.json}`:
  - It gave `{oldFrames:221, same:221, diff:0, missing:0, metaDiff:0, spriteSame:true, featSame:true}`, i.e. 221 old frames in total: the five shipped sprites plus the three feature layers.
  - Every one of the 795 frames has a transparent 2-px padding ring (`newPadNonTransparent:0`), and no rects overlap within 2 px.
  - PNG and manifest are both 1024×1024.
  - `sprites/core.ts`, `b01_sprinter.ts` and `layers/modules.ts` are unchanged against HEAD.
- **VERIFIED OK: frame sizes, headings and counts match the docs and the species records.**
  - The records in `content/species/*.json` match P3_SPRITES and the atlas:
    - B02, Y01, Y02, X01, F01, F02 and V01: 16×16 with 1 heading.
    - B03, B05, B07 and B08: 16×16 with 4 headings.
    - P02, P03 and P04: 32×32 with 4 headings.
  - All assetIds match.
  - Counts per heading:
    - Small: 4/4/2/3.
    - Large: 6/4/4/2/4 in every heading.
    - Fungi: 16 mask + 16 decaying + tip + bud + idle (F02 also has 2 pulse frames).
    - V01: glyph + idle.
  - X01 has a 4-frame `move` with 1 heading. B02, Y01 and Y02 loop `idle`. The other headings are derived by `orient()` at build time; nothing rotates at runtime.
- **VERIFIED OK: palette.** Every UX §6.1 hex listed in the assignment is a named constant in `art/src/palette.ts` with the exact value: velvetTeal `#32A89A` / `#BFE9E1`, duskViolet `#8B82C6` / `#D9D4F2`, … phageBlue `#3E7BC4`. B08's bands and P02's cilia are `#FFFFFF`. The colours were also confirmed by pixel counts of frame 0 (`tmp/verify-art/bbox.mjs`).
- **VERIFIED OK: the fungal mask bit order matches N=1, E=2, S=4, W=8.** All 16 tiles were checked visually in `sheets/f01_threadlace-color.png` (for example: 1 = up, 2 = right, 3 = up+right, 6 = right+down, 9 = up+left, 12 = left+down, 15 = cross). Arms reach the edge midpoints, and tiles join edge to edge in the preview's network.
- **VERIFIED OK: the new tests bite** (load-time mutants in `tmp/verify-art/mut/`; no tracked file was edited).
  - **Dropping a frame** (`drop.ts`, 10 frames dropped one at a time: b03 move/n/2, p04 death/e/3, p02 move/s/5, f02 decaying/e/7, f01 bud, f01 idle, v01 idle, x01 move/e/0, b02 death/e/2, f02 mask/e/15). Each gives exactly 1 issue naming sprite, animation, heading and frame.
  - **Weakened thresholds in a copy of `content-validate.ts`.** All 12 mutants are killed by `atlas-mut.test.ts`:
    - fungus mask 16→8
    - no `decaying`
    - no virus `glyph`
    - category ignored
    - P03 headings 4→1
    - X01 loop `idle`
    - X01 with no loop
    - a heading loop that checks only 1 heading
    - large move 6→4
    - small death 3→2
    - no P3 spec
    - B02 loop `move`
  - **Swapped or copied frames in SPRITES** (via `vi.mock`). These mutants are killed:
    - B05 := B03 (B03|B05 and B05|B07 fail)
    - B03 and B05 swapped
    - B07 with B03's palette (killed by the non-vacuity test)
    - Y02 := Y01
    - P03 := P02

    The survivor is MINOR 3.
- **VERIFIED OK: checkAtlas stays independent of art/src.** The only imports in `tools/content-validate.ts` are node built-ins, `../src/sim/content/registry` and `./lib/content-fs`.
- **VERIFIED OK: content:validate passes with the shipped manifest.** Output: "content ok · … species 38 (enabled 5) · … atlas public/atlas/manifest.json complete for 5 enabled species and 3 enabled module marks (…; 795 frames)". `enabledSpecies` is still A01, B01, B04, B06, P01.
- **VERIFIED OK: the builder touched nothing outside its files.**
  - The diff in `content/manifest.json` comes from the environment builder (chemistry systems, materials, habitats). It does not touch `enabledSpecies`.
  - The diff in `src/render/renderer.ts` comes from the environment builder (`stoneEdgeAt`).
  - None of the art files touches `src/sim` or `content/`.
- **VERIFIED OK: the regression tests pass.**
  - `npx vitest run tests/content tests/sim/module-visuals.test.ts`: 7 files, 158 tests passed.
  - `eslint` on all of the art builder's files: clean.
  - `tsc --noEmit`: clean.
- **VERIFIED OK: the rebuilt atlas loads in the app.**
  - `E2E_PORT=4289 E2E_OUTDIR=tmp/dist-verify-art npx playwright test tests/e2e/garden.spec.ts --project=desktop`: 8/9 passed. The failure was in the 200 %-text test, a 180 s timeout on `run-toggle` click "waiting for stable" while my vitest mutant runs were loading both CPUs.
  - Rerun alone (`-g "200 % text"`): 1 passed (3.0 m). That makes 9/9.
  - `tmp/dist-verify-art/atlas/manifest.json` is 1024×1024 with 795 frames, hash bb424747d756.
- **VERIFIED OK: the asset previewer works at both sizes.**
  - It loads with no page or console errors at 390×844 and 1440×900. Status line: "19 sprites · 3 module marks · 795 frames · … every enabled species has a sprite".
  - It shows 19 species cards with every animation and heading, plus grayscale, protan/deutan/tritan views and the fungal networks.
  - Screenshots, all Read: `tmp/verify-art/shots/{phone,desktop}-{top,dense,dense16,dense-gray,dense-deutan,dense-tritan,fungi,fungi-gray}.png` and `phone-card{5,11,15}.png`.
- **VERIFIED OK: silhouettes match UX §6.3** (`sheets/*-color.png`, `large-e.png`):

  | Species | What the art shows |
  |---|---|
  | B02 | Paired teal dots with a stipple |
  | B03 | Violet curved rod |
  | B05 | Blue comma with a near-white tip |
  | B07 | Navy curved rod with an amber tip |
  | B08 | Rose capsule with two white bands |
  | Y01 | Cream oval with a burgundy bud |
  | Y02 | Ivory pear with an orange bud |
  | F01 | Pale threads with a dark outline and orange tips |
  | F02 | Copper twisted cord |
  | P02 | Slender cyan lens with white cilia pixels |
  | P03 | Peach body with a crown |
  | P04 | Segmented brown worm with a pale head |
  | X01 | Hollow gold diamond |
  | V01 | Blue head-and-tail glyph |

  The N, S and W headings point the heads correctly (P03 crown and P04 head checked in `large-e.png`).
- **VERIFIED OK: every species stays distinguishable without colour.**
  - In `ov16.png` and `ov32.png` (rows: colour, gray, protan, deutan, tritan) every species stays distinct.
  - B03 and B07 separate by value, and B07's tip stays light in gray.
  - No species carries a mark that duplicates a feature layer, apart from the F02 tip in MAJOR 1. (B02's stipple is its UX §6.3 "textured colonies".)
- **VERIFIED OK: drawFrame thumbnails exist.** `idle/e/0` exists for F01, F02 and V01, and `move/e/0` or `idle/e/0` for every Phase 1–3 species (atlas.test), so `src/ui/atlas.ts` needs no change.
