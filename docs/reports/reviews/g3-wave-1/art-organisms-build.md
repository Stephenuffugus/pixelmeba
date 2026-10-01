# g3 wave 1 — art-organisms build report

Organism art for all 14 Phase 3 species, packed into the atlas, with category-aware atlas checks. No species enabled, nothing under `content/` touched, no sim or UI code touched.

## Checklist

### Build
- **DONE: small 16×16 sprites** (4 move-or-idle, 4 reproduction, 2 stress, 3 death per heading). `art/src/sprites/phase3_small.ts`: B02 :57 (idle, 1 heading), B03 :105, B07 :145 (both curved rods, 4 headings), B05 :192 (comma, 4 headings), B08 :245 (capsule with two white bands, 4 headings), Y01 :296 (idle), Y02 :342 (idle), X01 :406 (4-frame `move`, 1 heading). The S/W/N headings are derived at build time with the lossless `orient()`. Nothing rotates at runtime. Proved by `tests/content/atlas.test.ts` "packs the UX §6.2 frame counts per heading for each Phase 3 form".
- **DONE: large 32×32 sprites**, 4 headings, 6 move / 4 feed / 4 reproduction / 2 stress / 4 death. `art/src/sprites/consumers.ts`: P02 :77, P03 :138, P04 :192. Same test.
- **DONE: fungi** `art/src/sprites/fungi.ts` (F01 :101, F02 :156). Each has:
  - `mask/e/0…15`: 16 connection-mask tiles, frame index = mask, bits **N=1, E=2, S=4, W=8** (constants `MASK_N…MASK_W` at `art/src/sprite.ts:88-91`).
  - `decaying/e/0…15`: the same 16 masks for a dying segment.
  - `tip/e/0` and `bud/e/0`: overlays drawn over the mask tile at its center.
  - `pulse/e/0…1`: F02 only, the transfer overlay.
  - `idle/e/0`: a one-frame thumbnail, so `src/ui/atlas.ts drawFrame` (move, else idle) finds it with no change to the UI.

  Arms run from the tile center to the edge midpoint, so tiles placed edge to edge at frame spacing join. The file header documents this.
- **DONE: V01** `art/src/sprites/virus.ts:43`. `glyph/e/0` is the inspection glyph and `idle/e/0` is the thumbnail, found by `drawFrame` the same way. The density overlay is a field render, not an atlas frame (header note).
- **DONE: checkAtlas requirement table, independent of art/src** (`tools/content-validate.ts`):
  - `AtlasSpeciesRef.category` :23 and `atlasSpeciesRef()` :27.
  - `FUNGUS_FRAMES` :63 (mask 16, decaying 16, tip 1, bud 1, idle 1) and `VIRUS_FRAMES` :71 (glyph 1, idle 1).
  - `requiredFrames(frameSize, category?)` :127, which selects by category, else by size.
  - `P3_SPRITES` :100: the independent size, heading and loop spec for the 14 species, reported with source "CT §1.3 / UX §6.2".
  - The P1.4 checks and messages are unchanged, and so are the D-0032 feature-mark checks.
- **DONE: palette.** UX §6.1 colours are named constants in `art/src/palette.ts` (velvetTeal … phageDeep). The five shipped sprites and three feature layers are **byte-identical**: a one-off script compared every old frame by key against the new atlas, giving `{ old: 221, same: 221, diff: 0, missing: 0, spriteMetaSame: true, featuresSame: true }`. Only packing positions moved.
- **DONE: deterministic output; atlas grown.** `tools/art-build.ts:38` sets `ATLAS_W` from 512 to **1024**, so the sheet is 1024×1024 (packed to y=558, height rounds up to the next power of two). `art-build` now also:
  - validates every sprite by form;
  - checks every sprite against its species record (assetId, size, headings, form vs category), enabled or not;
  - runs checkAtlas over every sprited species, not only the enabled ones.

### Done when
- **DONE: art:build twice gives the same hash; `--check` passes.** Both builds printed `wrote atlas · 795 frames (32 feature-mark frames) · 1024×1024 · bb424747d756`, then `atlas up to date · 795 frames (32 feature-mark frames) · 1024×1024 · bb424747d756`. The atlas.test "art:build is deterministic" test passes too.
- **DONE: atlas.test.ts** (new `describe('Phase 3 organism art')` at :217).
  - `checkAtlas(atlas, phase13, {png, marks})` returns `[]` for all 19 Phase 1–3 records, regardless of the manifest.
  - Removing one frame of each kind gives exactly one error naming sprite, animation, heading and frame. Kinds tested:
    - small, 4 headings: `b07_oilwick/stress/s/1`
    - small, idle loop: `y02_creambud/idle/e/3`
    - large: `p03_rotifer/feed/w/3`
    - fungus mask: `f01_threadlace/mask/e/10`
    - fungus overlay: `f02_cordweaver/tip/e/0`
    - virus: `v01_pinphage/glyph/e/0`
  - Other cases covered:
    - missing or short fungus/virus animations;
    - a fungus judged under a non-fungus category fails, which proves the category selects the rule;
    - a weakened P02 heading count and a missing X01 `move` fail.
  - The existing feature-mark tests still pass.
- **DONE: silhouettes.test.ts** (new): 111 same-size pairs (105 small, 6 large), each compared on one frame.
  - Frames used: loop frame 0 facing E; mask 10 for fungi; the glyph for V01.
  - Rules: alpha difference ≥ 12 % of the union; same-outline pairs instead need luminance (Δgray ≥ 32) to differ on ≥ 12 % of shared pixels; every pair's grayscale pattern must differ on ≥ 12 % of the union.
  - Same-outline pairs: B03|B07 (alpha 0.000, luma 0.613) and F01|F02 (luma 0.984).
  - **Exception: B01|B06** (shipped Phase 1 art) measures alpha 0.070, so it failed the alpha rule on the first run, which shows the test bites. That art must stay byte-identical, so the pair is held to the luminance rule (luma 0.313, pattern 0.360). See the proposed decision below.
  - A non-vacuity test asserts that identical frames score 0 and that B03/B07 really share their outline.
- **DONE: asset preview** (`tools/asset-preview.{html,ts}`). Every new frame appears in the species cards with grayscale and CVD views.
  - Fungus and virus frame sets get notes, e.g. "frame index = connection mask (N 1, E 2, S 4, W 8)".
  - A new "Fungal networks" section (`buildFungi`, :330) assembles each fungus's tiles into a network with tips, a bud, decaying segments and the F02 pulse.
  - Tiles and glyphs are kept out of the dense group (`isTileOrGlyph`, :58).
  - No page errors on load. Status line: "19 sprites · 3 module marks · 795 frames · every enabled species has a sprite · every enabled module has its mark".
  - Screenshots, read and checked, in `/workspaces/pixelmeba/tmp/art-organisms-shots/`:
    - phone portrait: `preview-phone-portrait-fungi.png`, `preview-phone-portrait-gray-p02.png`, `preview-phone-portrait-deutan-dense.png`, `preview-phone-portrait-b02.png`
    - desktop: `preview-desktop-fungi.png`, `preview-desktop-gray-p02.png`, `preview-desktop-deutan-dense.png`, `preview-desktop-b02.png`
- **DONE: content:validate passes with the shipped manifest**: `content ok · … species 38 (enabled 5) · … atlas public/atlas/manifest.json complete for 5 enabled species and 3 enabled module marks (…; 795 frames)`.
- **DONE: regression.**
  - `npx vitest run tests/content tests/sim/module-visuals.test.ts`: Test Files 7 passed, Tests 158 passed.
  - e2e garden.spec + place-and-undo.spec on phone-portrait and desktop: 24 passed (6.4m).
  - Same specs on phone-landscape: 12 passed (1.7m).
  - The built `tmp/dist-art-organisms/atlas/manifest.json` is 1024×1024 with 795 frames, so the rebuilt atlas loads and the five shipped species draw.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint art/src tools/art-build.ts tools/art-preview.ts tools/asset-preview.ts tools/content-validate.ts tests/content/atlas.test.ts tests/content/silhouettes.test.ts`: clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts`: Test Files 7 passed, Tests 45 passed.
- `npx vitest run tests/content/atlas.test.ts`: 19 passed.
- `npx vitest run tests/content/silhouettes.test.ts`: 113 passed.

## Files
- **New:**
  - `art/src/sprites/kit.ts`
  - `art/src/sprites/phase3_small.ts`
  - `art/src/sprites/fungi.ts`
  - `art/src/sprites/virus.ts`
  - `art/src/sprites/consumers.ts`
  - `tests/content/silhouettes.test.ts`
  - this report
- **Changed:**
  - `art/src/index.ts`: registration; Phase 1 order first, unchanged.
  - `art/src/palette.ts`: named Phase 3 colours.
  - `art/src/px.ts`: additive `fillStroke` and `line`.
  - `art/src/sprite.ts`: AnimName gains `mask|decaying|tip|bud|pulse|glyph`; adds `SpriteForm`, `form?`, `FUNGUS_REQUIRED`, `VIRUS_REQUIRED` and `MASK_*`.
  - `tools/art-build.ts`
  - `tools/content-validate.ts`: atlas section only.
  - `tools/asset-preview.{html,ts}`
  - `tests/content/atlas.test.ts`
  - `public/atlas/{organisms.png,manifest.json}`: via art:build.
- `sprites/core.ts` and `b01_sprinter.ts` are untouched.

## Notes for the wave that enables these species (wave 2 art-features)
- Fungal tiles are keyed `<assetId>/mask/e/<mask>`, with mask bits N=1, E=2, S=4, W=8, which matches the planned `E_LINKMASK` low 4 bits.
  - For a dying segment, draw `decaying/e/<mask>` in place of the mask tile.
  - Draw `tip/e/0` over degree ≤ 1 growth ends and `bud/e/0` over a bud.
  - Draw `pulse/e/{0,1}` (F02) only when bit 4 (transfer this second) is set.
  - Tiles join edge to edge at the 16 px frame spacing.
- Fungus and virus thumbnails are the one-frame `idle` animation, so LabTray Thumb, AddLifeSheet and HistorySheet need no explicit animation.
- The renderer's per-entity path (`renderer.ts` resolves move ?? idle) would draw that thumbnail as a body for fungi and viruses. Wave 2 must route fungi to the tile path and viruses to the density overlay, never to the body path.
- X01 has a 4-frame `move` and 1 heading. B02, Y01 and Y02 loop `idle`.

## FENCE notes
None. No sim, content or manifest change, and all four fence files pass.

## Bugs noticed elsewhere
- None in code.
- `tmp/art-organisms-shots/` already held older screenshots from an earlier session. I only added the `preview-*.png` files and deleted nothing.
- The repo is not prettier-clean at HEAD (e.g. `tools/content-validate.ts`, `art/src/sprites/core.ts`), and `npm run check` does not run prettier. I followed the existing long-line style and did not format.

## Proposed decisions
- **PROPOSED DECISION:** The atlas is 1024 px wide (1024×1024 for Phase 1–3 content) instead of 512×256. 512 wide would need a 512×2048 sheet. A square 1024 sheet stays inside every WebGL limit we target and leaves room for Phase 5.
- **PROPOSED DECISION:** Fungal `decaying` is mask-indexed (16 frames, `decaying/e/<mask>`), and checkAtlas requires all 16. `tip` and `bud` are centered overlays drawn over the mask tile, not replacement tiles. A dying segment then keeps its visible connections while its links exist, and one tip or bud frame fits every mask.
- **PROPOSED DECISION:** The UX §6.1 grayscale rule is measured as follows: alpha difference ≥ 12 % of the union, or for same-outline pairs, luminance difference (Δ ≥ 32/255) on ≥ 12 % of shared pixels. Same-outline pairs are B03/B07 and F01/F02 (UX §6.3), plus the shipped Phase 1 pair B01/B06. B01/B06 measures alpha 7.0 % and luminance 31 %, and its art stays byte-identical. If the owner wants B01/B06 held to the alpha rule, B06's art has to change, which changes the shipped atlas frames but no simulation state.
