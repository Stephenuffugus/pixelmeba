# Wave 8b art-large: build report

Scope: BUILD_DIRECTIVE P5.7, the large half (P5.5 "48x48 frames for P08/P10"). I drew the sprites for P05–P07 and P09 (32×32) and P08 and P10 (48×48), P08's three dormant poses, the handling_arc and trap_loop marks, and audited the wake cue. Nothing is enabled (D-0104). I made no change under content/, src/sim, src/render or src/audio.

## Checklist

### Build
1. **Sprites: DONE.** `art/src/sprites/phase5_large.ts`:
   - P05 Shellglider (:133): a scalloped shell disk with a cream front lobe. The shell is in every frame because boundMineral is set from inoculation. `move` animates only the lobe.
   - P06 Bellstalk (:228): a bell on a stalk with a foot plate. `move` is a bell contraction, and the stalk pixels are identical in all 6 frames. In division the daughter swims away with no stalk.
   - P07 Dartfin (:299): a teardrop with exactly two tail pixels. `move` uses 60 ms frames, a whipping tail and a squash/bend, with no blur.
   - P09 Wheelgrazer (:361): a round body with toes and a crown disc on top. The wheel turns 10° per frame. Everything outside the crown is identical across `move`.
   - P08 Waterbear (:442, 48 px, 4 headings): eight stubby clawed legs in four pairs, which step in a wave while the trunk stays fixed in the frame. `dormant` (:457) has three still frames (loop false, frame = lifeState − 1): curling with legs half drawn in, a curled tun with no legs, then uncurling with stubs.
   - P10 Needlejaw (:543, 48 px, 4 headings): a long undulating body with a two-prong fork in front. `feed` shows a committed meal only: the fork closes, then a swallowed lump moves down the gut. In division the rear fragment grows new prongs.
   - Every sprite has 6 move, 4 feed, 4 reproduction, 2 stress and 4 death frames per heading.
2. **Marks: DONE.** `art/src/layers/modules.ts`: HANDLING_ARC (:351) and TRAP_LOOP (:374), appended to PHASE5_FEATURE_LAYERS (:396).
   - handling_arc has 4 frames: a ring with four fixed progress ticks, plus a clockwise arc covering quarters 1–4.
   - trap_loop has 2 frames: 'closing' is an open loop, 'holding' is a closed, tied loop around the waist.
   - Palette (append only): handlingArc/handlingTick and trapLoopHeld/trapLoopLight. These are deliberately not F03's #6B4A12, which art-p5.test.ts pins to F03's trap frames 0 and 1.
   - **Deviation 1: I did not extend FeatureLayerId.** I extended `Phase5FeatureLayerId` (:73) instead. Wave 8a's fix1 keeps FeatureLayerId equal to the renderer's FEATURE_LAYER_IDS (module-visuals.test.ts pins it), and org-ui moves the Phase 5 marks over in wave 13.
   - **Deviation 2: no FEATURE_FRAMES rows for these marks.** The frame counts are in a new table, `EFFECT_MARKS` in tools/content-validate.ts (:226): handling_arc 4 'handling quarters 1–4', trap_loop 2 'closing, holding', each with the ability that needs it and what it is drawn on. Reason: atlas.test.ts has a guard requiring every FEATURE_FRAMES row to be a content visualLayer or a NATIVE_MARKS value. NATIVE_MARKS is pinned to two entries by art-p5.test.ts, and these marks are neither.
   - To support the new table:
     - `checkAtlas` looks the count up in `FEATURE_FRAMES[layer] ?? EFFECT_MARKS[layer]` (:432).
     - `effectMarks(registry)` (:232) lists the marks an enabled species needs (HANDLING → handling_arc, TRAP → trap_loop). Nothing enabled needs one today, so the content:validate output is unchanged.
     - The content:validate CLI checks them (:529).
     - art-build refuses an atlas missing either mark (tools/art-build.ts:242).
   - The grit deposit glyph is not an atlas item; it stays procedural in src/render/layers.ts (org-ui, wave 13).
3. **Validator rows: DONE.** P5_SPRITES (tools/content-validate.ts:141–150): P05 {32,1}, P06 {32,1}, P07 {32,4}, P08 {48,4, extra dormant 3}, P09 {32,1}, P10 {48,4}, all `loop: 'move'`, with their sources (UX §6.2, P5.5, CT §1.3, SPEC §7.6, D-0106).
4. **Register and build: DONE.** Registered in art/src/index.ts (:11, :53–58) after stage 1's entries, by species id. npm run art:build: **1024×2048, 1678 frames** (1342 before), 136 of them feature-mark frames, 13 world-tile frames, exportHash 695ad0f2554d. organisms.png is **453,280 bytes** (286,334 before). Packed rows reach y = 1444.
   - **The 48 px four-heading sets forced the second 1024 rows.** Built without P08 and P10, the sheet packs to y = 960 (1024 high). Without all six it packs to 780. Without only the 32 px four it packs to 1264. The cap holds.
5. **Wake cue audit: DONE, no audio change; the existing cue covers native resters.**
   - src/sim/dormancy.ts:265 emits 'wake' on the Waking → Active transition of the generic `dormancyStep`.
   - That step runs for any profile with dormancy rules, and src/sim/phenotype.ts:399 gives native DORMANCY species (B12, F04, P08) the same NATIVE_DORMANCY rules. So native wakes, including F04 daughters that start Resting, reach the same event.
   - src/worker/snapshot.ts:421 passes it through. src/audio/cues.ts:141–154 counts wakes of any species into one `wake` play.
   - It stays a single cue: patches.ts gives 'wake' a 1000 ms coalescing gap and puts it in WORLD_CUES, which share the ≤ 4/s budget (rateLimiter).
   - UX §8.2 visible equivalent: the native rester's dormant 'Waking' pose, drawn by the renderer from wave 13 (org-ui). For E03 it is the resting_seam 'wake' frame.
6. **Preview: DONE.** `npm run art:preview -- p05_shellglider p06_bellstalk p07_dartfin p08_waterbear p09_wheelgrazer p10_needlejaw` writes docs/reports/art/<id>.png. I looked at every sheet. All are legible at 1×, and in grayscale they read by silhouette:
   - the scalloped disk with its lobe
   - the goblet bell on a stalk
   - the small teardrop with its dark tail pixels
   - the round body with its wheel on top
   - the legged barrel
   - the long rod with its pale fork
   No pose implies an action the body is not doing.
   - Fixes made after looking:
     - P06's mouth cilia redrawn in the deep tone (pale ticks vanished on water); its two-bell division frame redone on stalk branches.
     - P05's daughter shell joined by a cytoplasm bridge rather than overlapping the parent rim; its vacuole made 2×2.
     - P08 made plumper; its tun creases thinned.
     - P09's wheel spokes moved to an outer ring round a hub.

### Done when
- **`npm run art:build -- --check` passes: DONE.** Output: "atlas up to date · 1678 frames (136 feature-mark frames, 13 world-tile frames) · 1024×2048 · 695ad0f2554d".
- **Every older frame is byte-identical: DONE, two ways.**
  - (a) A probe under tmp/ compared the committed 60a4731 atlas (manifest sha256 1490f510… = `git show 60a4731:public/atlas/manifest.json`) with the new one, frame by frame by key: 1342 same, 0 different, 0 missing. That covers the Phase 1 and 3 frames, stage 1's Phase 5 frames and marks, and the tiles.
  - (b) tests/content/art-p5-large.test.ts "every frame packed before wave 8b is byte-identical…" pins digest 327490bd…, computed from the 60a4731 atlas, over those 1342 frames.
  - art-p5.test.ts's 856-frame rc1 digest also still passes.
- **tests/content/art-p5-large.test.ts (24 tests): DONE.**
  - Each sprite matches its record and its P5_SPRITES row.
  - Every large count is exact, plus P08 dormant 3 (still, all three different).
  - Each accent appears only in the part it names. No other sprite or mark uses it, and the bases are the UX §6.1 bases. Per sprite:
    - P05: every scallop pixel is within 2 px of the outline, in every living frame.
    - P06: stalk only below the bell, a foot plate at least 6 wide, the stalk identical in all move frames.
    - P07: exactly 2 tail pixels, adjacent and west of the body, in move, feed and stress; 2, 2, 4, 4 across reproduction.
    - P08: leg pixels form exactly 8 components, 4 above and 4 below, and the trunk is identical across move. Not vacuous: one injected leg pixel makes a ninth component. Dormant: the tun has no legs and is the smallest pose.
    - P09: wheel pixels only in the crown disc, and nothing outside the crown changes across move.
    - P10: fork pixels at x ≥ 38 except for the rear fragment's new prongs; the feed lump moves tailward.
  - handling_arc's frames strictly grow, each containing the last. The ticks are fixed, there are 4 of them, and only quarter 4 closes the ring.
  - trap_loop: 'closing' is open, 'holding' is closed (flood-fill test), and the two frames differ.
  - art-build refuses each of these with its exact message:
    - P08 with no dormant: 'p08_waterbear: native DORMANCY needs "dormant" (3 frames: Preparing, Resting, Waking)'
    - P08 with 2 dormant frames
    - P10 with 4 move frames
    - handling_arc or trap_loop dropped from the layers: 'effect mark "handling_arc" (4 frames: …) is missing from art/src/layers'
    - a 3-frame handling_arc (via checkAtlas)
  - The committed atlas is complete for the six records plus the effect marks, as if P10 and F03 were enabled.
  - **How I checked a test fails without its mechanism:** I disabled the EFFECT_MARKS presence check in art-build. The "dropping handling_arc" test failed, and I restored the file. The other negative cases are built into the test itself (the dropped and short sets above, and the injected leg pixel).
- **The listed test files pass: DONE.** tests/content/{silhouettes,atlas,art-p5}.test.ts, tests/render/*, tests/audio/*, plus validator and module-visuals: **20 files, 634 tests passed**. Re-run after the lint fixes: content 4 files, 518 passed.
- **npm run content:validate passes: DONE.** "content ok · contentHash 67075b0e… · atlas … complete … (1678 frames)". That contentHash comes from other agents' in-flight content edits; I changed nothing under content/.
- **FENCE passes: DONE.** g2-replay, rc1-replay, trajectory-fence ×4, conservation-closed-lid and determinism: **8 files, 62 tests passed**.
- **tsc and eslint clean: DONE.** `npx tsc -p tsconfig.json --noEmit` exit 0; `npx eslint` on every file I touched exit 0.
- **E2E: none.** Nothing is enabled. I did not run Playwright.

## Files
- **New:**
  - art/src/sprites/phase5_large.ts
  - tests/content/art-p5-large.test.ts
  - docs/reports/art/p05_shellglider.png, p06_bellstalk.png, p07_dartfin.png, p08_waterbear.png, p09_wheelgrazer.png, p10_needlejaw.png
  - this report
- **Changed (art owner):**
  - art/src/index.ts: import and 6 entries appended.
  - art/src/palette.ts: 18 shades plus 4 mark colours inserted; no existing entry touched.
  - art/src/layers/modules.ts: the type union extended, the two marks added, the PHASE5 array appended.
  - tools/content-validate.ts: P5_SPRITES rows, EFFECT_MARKS, effectMarks, a one-line lookup in checkAtlas, the CLI marks list.
  - tools/art-build.ts: import and one presence check.
  - public/atlas/manifest.json and organisms.png: regenerated by art:build.
  - tests/content/atlas.test.ts: mark-frame count `+ (4 + 2) * 4`.
  - tests/content/silhouettes.test.ts: P5_LARGE list; pair count 378 + 28 + 1. All new 32 px and 48 px pairs pass the ≥ 12 % alpha rule.
- **Changed outside my list: tests/content/art-p5.test.ts (stage 1's test), four positional pins only.** They pinned "the sprites and marks after stage 1 are exactly stage 1's", which no append can satisfy. No assertion is weakened:
  - `ids.slice(19)` → `slice(19, 19 + P5_IDS.length)`
  - the P5_SPRITES key list filtered to size 16
  - `PHASE5_FEATURE_LAYERS…slice(0, 3)`
  - `ATLAS_FEATURE_LAYERS.slice(FEATURE_LAYERS.length, +3)`

## FENCE notes
No fence value moved. I ran no fence-update. Art is not hashed and nothing reads it in src/sim.

## Bugs or risks noticed elsewhere
- The renderer loops `move` whenever a sprite has one (src/render/features.ts bodyAnimFor). P06 (speed 0) and P09 therefore animate in place; that is intended and the art keeps the stalk and body still. Org-ui (wave 13) must also hold P08's `dormant` frame by lifeState, as bodyFrameIndex does for B12, and draw handling_arc and trap_loop from handlingProgress/handlingNeed and heldBySlot.
- UX §6.2 says P08 and P10 are "readable at default zoom via selection magnification". The 48 px sprites will need that magnification path in the renderer (wave 13).
- The 2048 px sheet height is still "assumed safe" on low-end Android (ARCH §10.1 comment in art-build) and is not yet measured on a device. Phase 5 now needs it.

## Proposed decisions
- PROPOSED DECISION: handling_arc and trap_loop are atlas marks keyed to recorded columns (handlingProgress/handlingNeed quarters; heldBySlot ≥ 0), not procedural effects. This keeps "every visible feature maps to real state", and org-ui draws them like any mark. Their frame counts are in a separate EFFECT_MARKS table (by ability: HANDLING, TRAP), not in FEATURE_FRAMES, because those rows must be content visualLayers or native marks. trap_loop uses its own tones, not F03's #6B4A12.
- PROPOSED DECISION: the Phase 5 effect marks join `Phase5FeatureLayerId` and `PHASE5_FEATURE_LAYERS` (not FeatureLayerId) until org-ui moves the Phase 5 marks into the renderer vocabulary in wave 13, as D-0109's fix1 did for glow_center, jacket_rim and mode_half.
- PROPOSED DECISION: the grit deposit glyph stays procedural in src/render/layers.ts like the other deposit glyphs; no atlas item.
- PROPOSED DECISION: the Phase 5 atlas ships as one 1024×2048 sheet. The two 48 px four-heading sets are what need the second 1024 rows; without them it fits 1024×1024.
- PROPOSED DECISION (wake audit): no audio change. The one 'wake' cue, fed by the generic dormancy machine's event and coalesced at 1 s within the ≤ 4/s world budget, already covers the native resters B12, F04 and P08.
