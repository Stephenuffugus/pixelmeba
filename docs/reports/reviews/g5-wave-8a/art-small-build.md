# Wave 8a · art-small · build report (P5.7, 16 px half)

Result: **all owned work is done and green, with one cross-owner blocker.** `tests/sim/module-visuals.test.ts` (not mine) pins "the renderer's vocabulary is exactly the authored layers". The three new marks therefore fail its line 139 at runtime, and its line 149 fails `tsc`. The fix is a test-only patch (below) that I verified in a scratch copy of the tree. The lead must apply it, or apply the src/render alternative, before `npm run check` is green. Nothing is enabled. No `src/**` or `content/**` file was touched, and no fence value moved.

## Checklist

### Build
1. **DONE: names and requirements.** `AnimName` gains `'dormant' | 'trap'`, documented in the AnimName comment (art/src/sprite.ts:13-26). `NATIVE_ABILITY_FRAMES` maps DORMANCY → dormant 3 (Preparing, Resting, Waking) and TRAP → trap 3 (Open, Holding, Cooldown) (art/src/sprite.ts:101). Proved by art-p5 "every required frame count…".
2. **DONE: palette.** Every UX §6.1 Phase 5 colour for the 13 small and 6 large species, plus local deep/light/outline shades and the Phase 5 layer tones (glowDim, glowHalo, jacketRim, jacketRimDeep, turnleafPale) (art/src/palette.ts:126-208, 234-238). P.glowCenter (#C6F04D, pre-existing, unused) equals lanternLime.
3. **DONE: sprites.** art/src/sprites/phase5_small.ts: B09 :101, B10 :159, B11 :227, B12 :307 (with `dormant`), B13 :346, A02 :446, A03 :526, A04 :600, A05 :642, X02 :702, V02 :763. art/src/sprites/phase5_fungi.ts: F03 :151 (with `trap`) and F04 :250 (with `dormant`). Loops and headings follow the records: move for B09–B12, A04 and X02; idle for B13, A02, A03 and A05; 4 headings for B09–B12, A03 and A04.
   - B09: the dim `lanternCore` waist is in every body frame. Lime is never in a body.
   - B12 dormant: the seam closes and nicks the outline (Preparing), then the body folds tall and narrow with the full seam and tucks (Resting), then it half-unfolds with the seam fading (Waking).
   - A02: an octagon with facet lines inside a `glasswheelRim` clear rim, in every frame.
   - A04: a split spindle in one tone on both halves. It carries no amber.
   - F03: amber 2-px threads, each arm with a side loop of thread. The `trap` frames are Open (a C-loop), Holding (a closed double ring) and Cooldown (a slack, broken loop in `traplaceSlack`). `traplaceLoop` appears only in Open and Holding.
   - F04: a 1-px silver web with webbing between neighbouring arms and a dark-ringed speck at each node. Its `dormant` frames are a lone ringed spore: ring open at top, then thick and closed, then open to the East.
   - X02: a filled diamond.
   - V02: a round lattice head with six fibres and no tail.
4. **DONE: feature layers** (art/src/layers/modules.ts). The header documents each layer and the recorded fact it maps to.
   - glow_center (:249): 'dim' is a 2×2 pale center. 'glow' is a lime 2×2 + cross with a dotted halo at radius 6–8, which is 2 px outside a 12 px body.
   - jacket_rim (:273): levels 0–3 add plates from the West side to ±40/72/102/130°. The East ±50° soft-body gap is always empty.
   - mode_half (:304): 'photo' puts light greens on A04's East half (x ≥ 9, body pixels only). 'sugar' puts turnleafAmber and amberLight on the West half (x ≤ 7).
   - FeatureLayerId is extended (:64-67).
5. **DONE: validators.**
   - tools/content-validate.ts: `P5_SPRITES` (:127) is wired into spriteSpec. `FEATURE_FRAMES.mode_half` is 2 (:197). `NATIVE_MARKS` = { SIGNAL_GLOW: glow_center, MIXOTROPHY: mode_half } (:205). `nativeMarks(registry)` (:223) is checked like enabledMarks in main() (:497). AtlasMarkRef gains an optional `kind`, so the message reads "enabled species B09 SIGNAL_GLOW (glow_center) has no feature mark…".
   - tools/art-build.ts: `validateNative` (:191, called for every sprite, enabled or not, :232) enforces three rules:
     - a NATIVE_MARKS ability needs its layer;
     - DORMANCY or TRAP needs `dormant` or `trap` with exactly 3 frames;
     - a sprite may not carry `dormant` or `trap` without the ability (a pose no recorded state can show).
   - Cap: `ATLAS_MAX_H` 2048 (:44) and `atlasSizeError` (:47) give the exact message "atlas would be <w>x<h>; the cap is 1024x2048 (WebGL texture limit on low-end Android, ARCH §10.1)" (pushed at :275). The ATLAS_W comment is updated (:36-42).
   - `buildAtlas(sources?)` now takes optional sprites/layers/tiles so tests can pass edited copies. The defaults are the real art, and the CLI behaviour is unchanged.
6. **DONE: registration and rebuild.** art/src/index.ts registers the 13 sprites after Y02, by species id, and the Phase 1/3 order is unchanged. `npm run art:build` result:
   - 1342 frames (was 856), with 112 feature-mark frames (was 80) and 13 tile frames.
   - The sheet is still 1024×1024 (it stays under the cap; art-large will likely push it to 1024×2048).
   - organisms.png is 286,334 bytes (was 198,586), far under the 8 MB precache limit. manifest.json is 288,402 bytes.
   - Previews were written to docs/reports/art/{a02_glasswheel,a03_shadeleaf,a04_turnleaf,a05_raftball,b09_lantern,b10_brinecoil,b11_sourbud,b12_sleeper,b13_rampart,f03_traplace,f04_sporeveil,v02_lacephage,x02_threadrider}.png. I looked at B09, B12, B10, A05 and F03. After that look I fixed B10 (it read as a crown, so it is now a 1.5-period coil) and A05's growth frames (they were boxy). Every other sprite and layer was reviewed frame by frame as ASCII through a probe. No pose implies locomotion for idle species. Dormant and trap sets are still (loop: false).
   - The layers have no previewer (tools/art-preview.ts renders sprites only and I don't own it). I reviewed them as ASCII.

### Done when
- **DONE: `art:build --check` passes,** and every shipped frame is byte-identical. I proved it two ways:
  - a one-off probe, tmp/art-small/baseline.ts: all 856 Phase 1/3 sprite, Phase 2–3 mark and tile frames, RGBA from the definitions, before vs after → 0 changed;
  - tmp/art-small/pngdigest.ts on the packed PNG: HEAD atlas = new atlas = `2a0a089e…` over the same 856 keys. art-p5 pins that digest, and `git diff v1.0.0-rc1 HEAD -- public/atlas` is empty, so it equals rc1.
- **DONE: tests/content/art-p5.test.ts** (41 tests) covers:
  - records and P5_SPRITES;
  - the 8–12 px body and 1 px margin, in loop and dormant frames;
  - frame counts, including dormant and trap, and that only DORMANCY/TRAP species have them;
  - the colour rules: lime only in `mark glow_center/1`, traplaceLoop only in `f03_traplace/trap/0,1`, amber only in `mark mode_half/1`, and the A04 halves using the same tones;
  - glow halo distances, jacket monotonic levels with the gap, and the mode halves on A04 body pixels;
  - validator failures, with exact messages, for a short B12 dormant, a missing F03 trap, a stray B10 dormant, a missing glow_center or mode_half, and a sheet over the cap;
  - checkAtlas on the committed atlas as if flipped: a missing `b12_sleeper/dormant/n/2`, the dormant table removed, and glow_center removed for B09 and E02.
- **DONE: silhouettes.** Now 378 + 6 pairs, every one passes, and there is no new SAME_OUTLINE exception.
- **DONE: atlas test edits.** markFrames is 80 + 32. The "listed layer is a content visualLayer" check now also accepts NATIVE_MARKS. The one-frame later-mark helper replaces the now-real glow and jacket frames.
- **DONE: the other atlas and content commands.** tests/content/atlas.test.ts, tests/render/*.test.ts and tests/ui/gallery.test.ts pass. `npm run content:validate` is ok, with the contentHash unchanged and nothing enabled. `npx eslint art tools/art-build.ts tools/content-validate.ts tests/content/{art-p5,atlas,silhouettes}.test.ts` is clean.
- **PARTLY DONE: `npx tsc --noEmit`.**
  - Clean for my files.
  - It fails at tests/sim/module-visuals.test.ts:149 (see Blocker).
  - It also fails at tests/persistence/phase5-import.test.ts, which is schema5's in-flight file, not mine.
- **DONE: FENCE.** It passes. g2-replay, rc1-replay, the 4 trajectory-fence files, conservation-closed-lid and determinism all passed in the 27-file run. No sim file is mine. Note that the schema5 agent's uncommitted sim edits were in the tree during that run.

## Blocker: tests/sim/module-visuals.test.ts (not owned)
It asserts `FEATURE_LAYERS ids == src/render FEATURE_LAYER_IDS` and "80 mark frames", and it types `def.id` as the render FeatureLayerId. Adding the assigned layers breaks it. Proposed fix (test-only; the renderer learns the names in wave 13): filter the not-yet-rendered marks out. The patch is saved as tmp/art-small/module-visuals.patch:
```diff
-import { FEATURE_LAYERS } from '../../art/src/layers/modules';
+import { FEATURE_LAYERS as ALL_FEATURE_LAYERS, type FeatureLayerDef } from '../../art/src/layers/modules';
 …after the last import:
+/** Phase 5 marks packed by wave 8a art-small (glow_center, jacket_rim, mode_half) that the renderer
+ * learns in wave 13 (org-ui): until then they are not in FEATURE_LAYER_IDS and no cue picks them.
+ * Org-ui empties this list when it adds them to src/render/features.ts. */
+const AWAITING_RENDER: readonly string[] = ['glow_center', 'jacket_rim', 'mode_half'];
+const FEATURE_LAYERS = ALL_FEATURE_LAYERS.filter((l) => !AWAITING_RENDER.includes(l.id)) as (FeatureLayerDef & { readonly id: FeatureLayerId })[];
```
I verified it in a scratch copy of the tree: tsc had no errors except phase5-import, eslint was clean, and module-visuals passed 8/8.

The alternative is to add the three ids to src/render/features.ts FeatureLayerId and FEATURE_LAYER_IDS. That still fails the test's "every frame is reachable from a cue" check, and the "80" count, until org-ui wires the cues, so the test patch is the right one for now.

## Commands (results)
- `npx tsx tools/art-build.ts --check` → `atlas up to date · 1342 frames (112 feature-mark frames, 13 world-tile frames) · 1024×1024 · 24f1768f34a0`
- `npx tsx tools/content-validate.ts` → `content ok · contentHash b8ddc0dd… · species 38 (enabled 19) … 10 enabled module and native marks … 1342 frames`
- `npx vitest run tests/content/art-p5.test.ts tests/content/silhouettes.test.ts tests/content/atlas.test.ts` → 3 files, 470/470 passed (before the last two art tweaks; the 27-file run below re-covers them)
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/content tests/render tests/ui/gallery.test.ts tests/sim/module-visuals.test.ts` → `Test Files 1 failed | 26 passed (27) · Tests 1 failed | 666 passed (667)`. The only failure is module-visuals.test.ts:139 (the blocker).
- Mutation checks on art-p5, each run then restored (I checked by byte compare):
  - lime in the B09 body, validateNative removed and the jacket reaching East together gave 4 failures (lime, jacket gap, B12 dormant, glow_center removal);
  - the cap push removed and the B12 P5_SPRITES extra removed together gave 2 failures (the cap test and the committed-atlas test).
- E2E: not run. Nothing is enabled, no screen changed and the sheet stays 1024×1024.

## Files
- New: art/src/sprites/phase5_small.ts, art/src/sprites/phase5_fungi.ts, tests/content/art-p5.test.ts, docs/reports/art/<13 asset ids>.png, this report.
- Changed: art/src/{index,sprite,palette}.ts, art/src/layers/modules.ts, tools/art-build.ts, tools/content-validate.ts, public/atlas/{organisms.png,manifest.json} (via art:build only), tests/content/{atlas,silhouettes}.test.ts.

## Notes for others
- art-large (8b) must add `dormant` ×3 to P08 (native DORMANCY). Otherwise art-build's validateNative refuses the P08 sprite as soon as it is registered.
- The briefs mention a "grit glyph", but the assignment does not, and deposit glyphs are procedural (src/render/layers.ts). I did not draw it.
- tests/persistence/phase5-import.test.ts currently has tsc errors (schema5, in flight).

## Proposed decisions
- PROPOSED DECISION: two state-indexed names, `dormant` (Preparing/Resting/Waking = lifeState − 1) and `trap` (Open/Holding/Cooldown), instead of six per-state names. Each is one recorded state machine, held as a still frame.
- PROPOSED DECISION: native abilities that a mark draws (`NATIVE_MARKS`: SIGNAL_GLOW → glow_center, MIXOTROPHY → mode_half) are required like module visualLayers: by content:validate for enabled species, and by art-build for every sprite. A `dormant`/`trap` set on a species without the ability is an error.
- PROPOSED DECISION: the jacket_rim levels are coverage quarters, with plates growing from the back (West) and the leading ±50° always bare (the "soft-body gap"). The glow halo is a dotted ring at radius 6–8 around the mark center, so it sits about 2 px outside a 12 px body.
- PROPOSED DECISION: Traplace Cooldown uses its own dim `traplaceSlack` tone (#A88A5C), so the loop colour #6B4A12 means "a trap is set or holding".
