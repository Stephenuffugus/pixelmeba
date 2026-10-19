# Wave 15 stage 1: p5-polish build report

Task p5-polish, port 4272. Scope: the P5.8 polish carry-overs, the test-only override disclosure UI (P5.6), and the words for stage 1's measures and player steps.

I edited no simulation, worker, persistence or content file. Every change is in src/render, src/ui, art/src, public/atlas, tools/contrast-audit.ts, docs/reports/contrast.md and tests.

## Checklist

### Build items

1. **The share picture's grit: DONE.**
   - Where: src/render/picture.ts:228 (`hasGrit`), :282 (`grit` is now in the `=== 0` skip, and the specks are painted after the other deposits), :298 (`paintGritSpecks`).
   - Colours and counts: the specks use gritPale / gritEdge. A cell shows 1, 2 or 3 specks at grit ≥ 1, 85 or 170.
   - Speck size: one unit is one sprite pixel of the picture, ⌊px / 7⌋ and at least 1. So a speck is 1 px at the whole-dish 7 px per cell.
   - Placement:
     - Each speck starts where the cosmetic hash puts it. The keys are 29 / 31 per speck, the same keys the live dish uses, and distinct from 7, 13, 17, 19 and 23. No simulation randomness is involved.
     - If that spot covers or touches an earlier speck, the speck moves on in scan order to the first free spot. So three specks stay three from 5 px per cell up.
   - Test: tests/render/picture-grit.test.ts.
     - HEAD golden: the dish layer from a v1.0 band set (7 bands) hashes to the HEAD values. I wrote those sha256 values from the unmodified picture.ts before editing it: whole dish 9b58c25a…, 16-cell crop at 12 px e47198f8…. An 8-band set with grit 0 everywhere gives the same hashes.
     - Specks: grit 20 / 85 / 170 give exactly 1 / 2 / 3 two-tone specks at 7, 12 and 20 px per cell, all inside the cell.
     - Repeatability: painting twice gives the same pixels, and the input is never changed.
2. **Contrast audit grit rows: DONE.**
   - Where: tools/contrast-audit.ts:373-396.
   - Required rows, all pass:
     - "grit speck corner" on water 6.28:1 and on gel 6.14:1 (rounded down; org-ui measured 6.15).
     - "grit speck face" on sediment 3.69:1.
   - Informative rows: the face on water 1.09 and gel 1.11, the corner on sediment 1.85.
   - Result: `npx tsx tools/contrast-audit.ts` exits 0 with "392 pairs; 323 required, 287 pass, 36 justified failures, 0 unexplained". docs/reports/contrast.md was rewritten with `--write`.
3. **S01 / S02 glyphs below 3 px per cell: DONE.** The rule is described under "Rule chosen for S01 / S02" below.
   - Where: src/render/structureLayer.ts — the header comment (corrected), :64 `EDGE_PAIRED_BELOW` 3.5, :66 `RAIL_PX` 1.5, `edgeDetail` (now also returns 'whole'), `edgeMarks`, and :139 the paired rails.
   - Test: tests/render/edge-glyph-sweep.test.ts sweeps 123 zooms (1.5 to 32 in 0.25 steps) on an R and a D edge.
   - Re-pin: tests/render/structure-layers.test.ts `at(3)` goes from [1, 1, 1, 2] to [1, 2, 1, 2]. The reason is in the comment: below 3.5 px per cell S02 is now 2 rails.
4. **F04 outline and the aggregation identity tones: DONE.**
   - F04: art/src/sprites/phase5_fungi.ts:186. Palette index 1 (the outline) is now `P.sporeveilRing` #23272B. F04 on sediment goes from 2.30:1 to 3.48:1 and passes. art/src/palette.ts keeps `sporeveilOutline` with a note, and no frame uses it.
   - Aggregation painter: src/render/speciesColors.ts:72 `aggOutlineTexels` and :84 `paintAggregationInked`.
     - Resolution: `AGG_PX` is 2 texels per cell.
     - Ink: the ring uses `AGG_INK` #1E2A30, which is palette outlineDark, the sprites' outline colour.
     - Placement: the ring is painted in the empty cells beside a blob, on the sides facing it, so no organism's colour is covered.
     - Thickness: ⌈2 / zoom⌉ texels, so the ring is always at least one screen pixel.
   - Renderer wiring (aggregation drawing only): src/render/renderer.ts.
     - The canvas is now GRID_W × AGG_PX square and the sprite is scaled by 1 / AGG_PX.
     - Both painters, species and trait bands, call paintAggregationInked (:976, :1567).
     - A zoom that changes the ring's thickness repaints the layer.
   - Contrast audit:
     - Each organism identity row is now measured with its ring, the better of tone and ring counting. All 108 such rows pass; the lowest is 3.40:1 (the ink on sediment).
     - The Y01…X01 and Phase 5 identity justifications are replaced with "AS BUILT" comments, and so is the F04 silhouette justification.
     - V01 / V02 keep theirs: they draw no aggregation cell, so they are measured as legend swatches only.
     - Readability rests on luminance only, so it holds in grayscale. No colour coding was added.
   - Test: tests/render/p5-polish-art.test.ts covers the ring geometry, the thickness at every aggregation zoom, the ≥ 3:1 rule for all 36 organisms, and the F04 ink.
5. **V02's lace glyph: DONE.**
   - Where: art/src/sprites/phase5_small.ts:740 `laceGlyph`.
   - Design: an open lace net, made of a thin outlined thread rim and two crossing threads with four open holes. It has no spikes and no fill.
   - Frames: 16 px, same as before. glyph 1 frame, idle 1 frame.
   - Test: p5-polish-art checks that the inner disk is at least 20 % open, that nothing lies beyond the rim, and that V01 and V02 differ in silhouette by xor / union ≥ 0.3. The existing art-p5 alpha test (≥ 0.12) passes.
   - **Atlas:**
     - 1691 frames before and after, 1024×2048.
     - exportHash 08fb56e6b439… → **7e9928b96e10fb9fe3a4810e4fa1e216e0300d457865eeb5f703703d1d9050c8**.
     - Frame comparison against HEAD: 1668 frames identical and 23 differ (f04_sporeveil 21, v02_lacephage 2). None are missing or moved.
     - Two `npm run art:build` runs gave byte-identical organisms.png and manifest.json. `art:build -- --check` reports "atlas up to date".
6. **The open S03's Fixed pip: DONE.**
   - Where: src/render/gateBadges.ts.
     - `PipState` gains 'notApplicable'.
     - `worldPipsFor(code)` returns badgeFor, except that an OPEN S03's Fixed pip is 'notApplicable'.
     - Both kinds of world badge (run badges and the selected gate's) use it.
   - Drawing: renderer.ts:690 draws it as a dashed ring of four short arcs.
   - Gate sheet: unchanged. `badgeFor` still says 'pass' beside "Stays put" (see the proposed decision 4).
   - Test: tests/render/gate-badges.test.ts adds a "the open S03 Fixed pip" describe block with 2 tests. It covers the states; that the tracer never crosses Fixed; that the table says "Stays put"; and that run and selected badges both use the new pip.
7. **INHIBITOR_EXPOSURE as only the suitability reason: DONE.**
   - Where: src/ui/panels/Inspector.tsx:351 `inhibitorSuitLine` and :606 the line (`data-testid="inhibitor-line"`, just after the organism lines).
   - Explore wording: "Something here is hurting it."
   - Lab wording: "Something here is hurting it: conditions 42 % suitable here."
   - Never twice: the line is null when the limit is also INHIBITOR_EXPOSURE, because the lead constraint and "What's holding it back" already show it.
   - Test: tests/ui/inspector-inhibitor.test.ts. No inspector golden moved.
8. **Test-only override disclosure: DONE.**
   - a. **Setup panel:** src/ui/views/ExperimentCard.tsx:72.
     - The block is `<section aria-labelledby>` titled "Test-only override", so it is announced by its heading.
     - It sits before the Recipe heading (the setup lines).
     - The words come from strings/experiments.ts:545 `testOverrideLines`.
     - It wraps at 200 % text (`.xp-override p { overflow-wrap: anywhere }`).
   - b. **Mode labels:**
     - strings/modes.ts gains `TEST_ONLY_LABEL` = "test‑only override" with U+2011, as UX writes it.
     - It also gains `ModesLineFlags` and `modesFlags(registry, testOverrides)`.
     - `worldModesLine`'s third argument is now `ModesLineFlags | Pick<RegistryInfo, 'partial'>`, so RegistryInfo still works. It appends the label when testOnly is set.
     - `slotModesLine` reads `SlotModes.testOnly`.
     - Call sites: AdvancedEvolution, CompareSetup (×2), MoreSheet, Home (×2) and ExperimentRun pass `modesFlags(..., info.testOverrides)`. NewDish is unchanged, as assigned. Saves needs no edit (slotModesLine).
   - c. **ExperimentRun.tsx:**
     - The running screen shows the copies' mode line (`experiment-running-modes`).
     - The stamped line and the results' "gate reached" sentence add "Recorded with a test-only override." when the dish or the card records an override.
9. **Words for stage 1's measures and steps: DONE.** The full list is under "Measure and step labels" below.
   - Where: src/ui/strings/experiments.ts: `measureLabel` (with `regionMeasureLabel`, `eventWords`, `regionWords` and `GATE_WORDS`), `formatMeasure` / `formatDiff` units, the three steps in `playerStepText`, and `playerStepLabel`.
   - Test: tests/ui/measure-words-p5.test.ts.

### "Done when"

- **My test files pass: DONE.**
  - picture-grit 3, edge-glyph-sweep 4, p5-polish-art 7, test-override-disclosure 9, measure-words-p5 6 and inspector-inhibitor 4 all pass.
  - The 2 new tests in gate-badges pass.
- **tests/render/*.test.ts, tests/ui/*.test.ts and tests/content/{atlas,art-p5,art-p5-large}.test.ts: DONE except failures caused by measures-overrides' in-flight content.**
  - The run gave 68 files and 613 tests, with 10 failures. One of them was mine: art-p5-large's pinned wave-8a digest. I re-pinned it with the reason (below), and the three content files now pass (89 tests).
  - The other 9 failures come from measures-overrides' new stage-1 cards:
    - 8 throw "Content failed validation … EXP_205.json → "B09" is not enabled in this build" under older-manifest test registries. They are gate-badges "boundary 400 ticks", gate-tracer, structure-layers packOverlay, structure-preview (load) and diet-line ×5.
    - The 9th is journal-and-words' paired-card list, which gains EXP_206 / EXP_208.
  - None of these files or registries are mine. See "Bugs noticed elsewhere".
- **tsc, eslint, art:build --check, content:validate and the contrast audit: DONE.**
  - `npx tsc -p tsconfig.json --noEmit`: clean.
  - `npx eslint` on every changed file: clean.
  - `npm run art:build -- --check`: up to date, 1691 frames, 7e9928b96e10. Two builds were byte-identical.
  - `npm run content:validate`: "content ok · contentHash 0c5a10e0be8a… · … atlas public/atlas/manifest.json complete for 38 enabled species … (1691 frames)". I ran this at a moment when measures-overrides' content still validated.
  - `npx tsx tools/contrast-audit.ts`: exit 0, 0 unexplained.
- **The FENCE: no fence value moved because of my change.** See "FENCE" below.
- **E2E: DONE.** Results are under "Commands and results". My journey passes on desktop and phone-portrait, and tests/e2e/inspector.spec.ts passes on both. The port was stopped before and after each run.

## Rule chosen for S01 / S02

**From 3.5 px per cell up (`EDGE_PAIRED_BELOW`):**
- Both marks lie on the edge line.
- Every S02 slot is at least 1.5 × the S01 dot.
- Both marks are at least MIN_MARK_PX (1.5 screen px).
- The worst case is exactly 3.5 px per cell: the dot is 1.5 px and the slot is 3.5 − 1.25 = 2.25 px.

**Below 3.5 px per cell (the new detail band 'whole'):**
- A single edge is too short for both rules at once. A 1.5 px dot plus a 2.25 px slot with a visible gap needs 3.5 px.
- So S02 switches pattern to **paired rails**: two parallel rails along the whole edge, one on each side of it, RAIL_PX (1.5 screen px) off the line, forming a double line.
- S01 stays one mark on the line, and a closed S03 stays one bold bar (2.5 px).

**Why this works:**
- It holds at every zoom.
- Every barrier edge stays visible. Thinning marks to every other edge would let a lone edge vanish.
- It changes nothing from 3.5 px per cell up.
- `edgeDetail` returns 'whole', so the renderer's existing band comparison (renderer.ts:1100) redraws when the zoom crosses 3.5. No renderer edit was needed for that.
- The header comment now states the rule. Wave 12's claim failed below about 2.75 px per cell, where the slot was no longer than the dot.

**Residual:** in the 'whole' band, an S01 dot is a full edge long below 2 px per cell, so a run of S01 reads as one line. It is told from a closed S03 by stroke width only (1.5 vs 2.5 px) and by the gate sheet. This was not in my assignment.

## Atlas

1691 frames → 1691 frames. exportHash 08fb56e6b439223e… → 7e9928b96e10fb9f…. 23 frames changed (F04 outline colour 21, V02 glyph 2). The two builds were byte-identical.

## Disclosure words

- **Block title:** "Test-only override".
- **One override:** "This card’s fixture changes the rules for this test only: Needlejaw speed 0 (normally 0.6). It is never offered in an ordinary dish." Then the entry's description, verbatim, as a note.
- **Several overrides:** "This card’s fixture changes the rules for this test only:", then one line per entry ("Needlejaw speed 0 (normally 0.6)."), then "It is never offered in an ordinary dish.". Each description is shown once.
- **Mode label (UX §3.3):** "· test‑only override" with U+2011. Example: "Standard Evolution · Identical founders · test‑only override". With a partial registry: "… · Core prototype — quantitative evolution · test‑only override".
- **Stamp note:** "Recorded with a test-only override."

## Measure and step labels

Wording rules:
- Region forms use the card's `regionNames`. A label that starts with its own preposition reads as written, e.g. "under the roof".
- Gate kinds use the content's structure names in lower case: fine membranes, small gates, shutter gates, one-way channels.

| Id | Label |
|---|---|
| resting.SP | "Sleepers resting" |
| glowing.SP | "Lanterns glowing" |
| glowingStart.SP | "Lanterns glowing when the run began" |
| attached.SP | "Threadriders riding a host" |
| events.TYPE.SP | one label per type, in the next list |
| firstCaptureAt.SP | "When Needlejaws first caught prey" (a value of −1 shows "no capture yet") |
| intakePhoto.SP | "Carbon Turnleafs took in while in Photo mode" |
| intakeSugar.SP | "Carbon Turnleafs took in while in Sugar mode" |
| secretingSeconds.SP | "Time Lanterns spent releasing something (organism-seconds)" |
| gateTransfer.KIND.F | "Sugar moved across fine membranes", "Salt moved across shutter gates" |
| gateCrossings.KIND | "Organism crossings of small gates" |
| infections.SP.VIRUS | "Sprinters newly infected by Lacephage" |
| wholeUnitCells.SP.VIRUS | "Most cells at once holding a whole Lacephage unit and a living Sprinter" |
| alive.SP@R | "Sprinters in the Fresh pool" |
| resting.SP@R | "Sporeveils resting under the roof" |
| biomass.SP@R | "Sprinter biomass in the Left side" |
| mean.F@R | "Mean salt in the Brine pool" |
| moisture@R | "Mean moisture in the Open gel" |

The events.TYPE.SP labels:
- glowOn: "Glow switch-ons by Lanterns"
- glowOff: "Glow switch-offs by …"
- modeSwitch: "Mode-switch records of … (one per tick and new mode)". This is honest about D-0126's coalescing.
- rest: "Times … began resting"
- wake: "Times … woke up"
- trapArmed: "Traps set by …"
- trapHold: "Holds begun in … traps"
- trapRelease: "Holds ended in … traps"
- handlingStart: "Handling attempts begun by …"
- handlingBreak: "Handling attempts by … that ended without a catch"
- capture: "Capture records of …"
- linkFormed: "Links formed by …"
- linkBroken: "Links ended by …"

Value formats:
- The new counts are whole numbers.
- Mode intake is in C.
- secretingSeconds and firstCaptureAt are in s.
- mean and moisture show 3 decimals.

Step words:
- inspectGlow: "Inspect a Lantern’s glow: tap one and read whether it is glowing."
- toggleShutter: "Open or close the shutter: tap the shutter gate and switch it."
- inspectMoisture: "Inspect moisture in a marked region: tap a cell inside a numbered region and read its moisture."

No label contains "because", "superior", "advanced", "perfect", "adapted" or "immune". The test checks this, and it also checks that every phase 5 card in the tree (EXP_205 … EXP_211) is worded with no raw id.

## Files

**Created:**
- tests/render/picture-grit.test.ts
- tests/render/edge-glyph-sweep.test.ts
- tests/render/p5-polish-art.test.ts
- tests/ui/test-override-disclosure.test.ts
- tests/ui/measure-words-p5.test.ts
- tests/ui/inspector-inhibitor.test.ts
- tests/e2e/experimentsP5Fixture.ts
- tests/e2e/experiments-p5.spec.ts
- this report

**Changed:**
- src/render: picture.ts, structureLayer.ts, gateBadges.ts, speciesColors.ts, and renderer.ts (the aggregation drawing, plus one drawPip branch for item 6)
- art/src: palette.ts (comment only), sprites/phase5_fungi.ts (F04), sprites/phase5_small.ts (V02)
- public/atlas: manifest.json, organisms.png
- tools/contrast-audit.ts and docs/reports/contrast.md
- src/ui/panels: Inspector.tsx (the INHIBITOR line), AdvancedEvolution.tsx, CompareSetup.tsx, MoreSheet.tsx (each only the mode-label argument and import)
- src/ui/views: ExperimentCard.tsx, ExperimentRun.tsx, Home.tsx (Home only the mode-label argument and import)
- src/ui/strings: experiments.ts, modes.ts
- src/ui/styles.css (my own `.xp-override` rules)
- Re-pins:
  - tests/render/structure-layers.test.ts `at(3)`
  - tests/render/gate-badges.test.ts (2 tests added)
  - tests/content/art-p5-large.test.ts: the wave 8a digest. Its other 1302 frames are still pinned to the HEAD atlas, at 9e29ee80…. The full 1342-frame digest goes 327490bd… → 502c97c4…. This file was not in my named re-pin list, but it is in my "Done when" list.

## What each test proves, and how I checked it fails without the change

- **picture-grit:**
  - A v1.0 picture is byte-identical to HEAD.
  - A grit cell shows the exact number of two-tone specks.
  - Mutant: removing `grit` from the skip fails "3 two-tone specks".
- **edge-glyph-sweep:**
  - The slot ≥ 1.5 × dot rule, and both marks ≥ MIN_MARK_PX, from 3.5 px per cell up.
  - The paired rails below 3.5.
  - The band boundaries.
  - Mutants:
    - Drawing S02 as a slot at low zoom (0.75 px at 2 px per cell, shorter than the dot) fails both cases ("rail length at 1.5").
    - A 1.6 px gap fails "S02 slot ≥ 1.5 × S01 dot at 3.5".
- **test-override-disclosure:**
  - The exact strings for one and two overrides, worldModesLine with and without testOnly, modesFlags, and slotModesLine.
  - Mutant: worldModesLine ignoring testOnly fails 3 tests.
- **inspector-inhibitor:**
  - The line appears, and "never twice" holds.
  - Mutant: dropping the limitCode guard fails "never twice".
- **gate-badges (new):**
  - The open S03's Fixed pip is never 'pass' in the world badge.
  - The sheet's pip is unchanged.
- **p5-polish-art:**
  - The ring geometry and thickness, and the ≥ 3:1 rule by tone or ring for 36 species.
  - The F04 ink.
  - The V02 openness, and that V02 differs from V01.
- **measure-words-p5:**
  - Every P5_MEASURE_HEADS head, every event type, gate kind, region form and step is worded, with no banned word.
  - Every phase 5 card is worded in full.

All mutants were reverted. `git diff` showed the files back to my versions.

## Commands and results

- `npx vitest run tests/render/picture-grit.test.ts` → Tests 3 passed (3).
- `npx vitest run tests/render/edge-glyph-sweep.test.ts tests/render/structure-layers.test.ts` → the sweep 4/4. structure-layers 9/10: the failure is packOverlay's content validation, which is not mine.
- `npx vitest run tests/render/gate-badges.test.ts` → 13/14: the failure is "boundary 400 ticks", content validation, not mine.
- `npx vitest run tests/ui/test-override-disclosure.test.ts tests/ui/measure-words-p5.test.ts tests/sim/founders-words.test.ts` → 26 tests, 25 passed. The one failure was my own over-strict event-word check, fixed; measure-words-p5 then 6/6.
- `npx vitest run tests/ui/inspector-inhibitor.test.ts` → 4 passed.
- `npx vitest run tests/render/p5-polish-art.test.ts` → 7 passed.
- `npx vitest run tests/content/art-p5-large.test.ts tests/content/art-p5.test.ts tests/content/atlas.test.ts` → Test Files 3 passed, Tests 89 passed.
- `npx vitest run tests/render tests/ui tests/content/{atlas,art-p5,art-p5-large}.test.ts tests/sim/founders-words.test.ts tests/experiments/journal-and-words.test.ts` → before the art-p5-large re-pin: "Test Files 7 failed | 61 passed (68); Tests 10 failed | 603 passed (613)". After the re-pin, one of the 10 (art-p5-large) passes; the other 9 are listed above.
- `npm run art:build` ×2 → "wrote atlas · 1691 frames (136 feature-mark frames, 26 world-tile frames) · 1024×2048 · 7e9928b96e10", byte-identical. `npm run art:build -- --check` → "atlas up to date · 1691 frames …".
- `npm run content:validate` → "content ok · contentHash 0c5a10e0be8a… · species 38 (enabled 38) · … (1691 frames)".
- `npx tsx tools/contrast-audit.ts` → "392 pairs; 323 required, 287 pass, 36 justified failures, 0 unexplained" (exit 0).
- `E2E_PORT=4272 E2E_OUTDIR=tmp/dist-p5-polish npx playwright test tests/e2e/experiments-p5.spec.ts --project=desktop --project=phone-portrait` → "2 passed, 2 skipped". The skipped case is E214, with the reason "E214 lands in stage 2 (cards-curated un-skips it)".
  - The first run failed because I expected no "Core prototype". The shipped registry is partial, so the line correctly ends "· Core prototype — quantitative evolution", and the journey now pins that line exactly.
- `… npx playwright test tests/e2e/inspector.spec.ts --project=desktop --project=phone-portrait`:
  - phone-portrait: 4/4 passed.
  - desktop: the first run had a timeout in "taps around the dish edge" (3.1 min under load; the dish did not reach 3 s within the test's budget). That test does not reach my aggregation code, because desktop is not at aggregation zoom.
  - A rerun on desktop alone: "4 passed (8.1m)".
- `npx tsc -p tsconfig.json --noEmit` → clean. `npx eslint <my files>` → clean.

## FENCE

The command from STATE ran twice:
- **First run: 15 failures.** g2-replay and rc1-replay `hashAtLoad` mismatches, plus habitats-p5-equivalence. At that moment `tmp/mo-mutant.py src/sim/serialize.ts … h.string('testOnly') …` was running: measures-overrides was mutating stateHash. `npx vitest run tests/fixtures/g2-replay.test.ts` right afterwards passed 9/9.
- **Second run: "Test Files 1 failed | 10 passed (11); Tests 2 failed | 92 passed (94)".**
  - g2-replay, rc1-replay, the four trajectory-fence files, conservation-closed-lid, determinism and determinism-g3 all pass.
  - The 2 failures are habitats-p5-equivalence's **entry lists**. The received list gains measures-overrides' seven new stage-1 recipes (BRINE_CROSSING_V1, GATE_MEAL_V1, GLASS_BUDGET_V1, GLOW_THRESHOLD_V1, QUIET_NEIGHBORS_V1, SHELTERED_LACE_V1, SLEEPING_SHORTAGE_V1). No existing entry's value moved.
- I touch no simulation or content file. **FENCE: habitats-p5-equivalence entry list grows by the 7 stage-1 recipes of measures-overrides (not p5-polish).**

## NEEDS

- **src/ui/state.ts:1713 `stampToastText(...)`:** a single-arm card's stamp toast should end with `TEST_OVERRIDE_STAMP_NOTE` ("Recorded with a test-only override.") when the card has `testOverrides` or the dish has `dishInfo.testOverrides`. ExperimentRun carries it for paired runs; the toast is in state.ts, which is not my file. The journal entry recording the flag, if wanted, belongs to the notebook / persistence owner.
- **EntityInspect (src/worker/snapshot.ts):** an inhibitor exposure field (amount, growth factor, health per second, as `rival` has) would let the INHIBITOR line use UX §5.2's full Lab wording, "Inhibitor exposure {x}: growth ×{g}, −{d} health/s.". Until then the Lab line shows the measured suitability.
- **src/ui/panels/GateSheet.tsx GatePip and tests/e2e/structures-art.spec.ts:159:** only if the lead extends proposed decision 4 to the sheet. GatePip would need a dashed-circle case (`state === 'notApplicable'`), and the e2e line would expect 'notApplicable'.

## Bugs noticed elsewhere

- **Content validation under older test registries** (measures-overrides' in-flight content). Their new phase 5 experiments fail validation under the test registries that model an older build (registryWith with PRE_FLIP / G2-era lists): "EXP_205.json → measurements.0: "B09" is not enabled in this build", "field "quencher" needs system "signals" …". That breaks 9 render and UI tests I ran: gate-badges boundary, gate-tracer, structure-layers packOverlay, structure-preview, diet-line ×5. tests/experiments/journal-and-words.test.ts's paired-card list also gains EXP_206 / EXP_208. They likely need the D-0130 pattern: those registries state the v1.0 experiment list.
- **layers.ts `paintAggregation` is now unused** by the renderer, which uses speciesColors.ts `paintAggregationInked`. layers.ts is not mine, so I left it.
- **S01 vs closed S03 below 2 px per cell** are told apart by stroke width only (see the residual under the S01 / S02 rule).

## Proposed decisions

1. **PROPOSED DECISION:** The S01 / S02 rule is the one described above (the ratio rule from 3.5 px per cell, paired rails below; `edgeDetail` gains a 'whole' band). Reason: one edge below 3.5 px cannot hold a 1.5 px dot and a 2.25 px slot with a gap, and drawing on alternate edges would hide lone barriers.
2. **PROPOSED DECISION:** A picture grit speck is one picture sprite pixel, ⌊px / 7⌋, placed by the live dish's keys 29 / 31 and then moved to the first spot that neither covers nor touches an earlier speck. Reason: at the whole-dish 7 px per cell, a 2-px speck (round(7 / 4)) cannot fit three non-touching specks. The scan makes 1, 2 or 3 specks read as that many from 5 px per cell up, and positions stay cosmetic.
3. **PROPOSED DECISION:** The aggregation layer is AGG_PX = 2 texels per cell. The ink ring (palette outlineDark) sits outside occupied cells, ⌈2 / zoom⌉ texels deep (≥ 1 screen px), and the trait-band aggregation uses the same painter. Reasons:
   - No organism's colour is covered.
   - The texture grows from 128² to 256² (256 KB per upload, at most 10 Hz). The lead measures the cost; 3 texels per cell would mean 590 KB per upload.
4. **PROPOSED DECISION:** The open S03's 'notApplicable' Fixed pip applies to the world badge only (`worldPipsFor`). The gate sheet keeps badgeFor's 'pass' beside its words "Stays put". Reasons: the D-0123 verifier note was about the world badge, which has no words. tests/e2e/structures-art.spec.ts:159 pins the sheet's pip, and GateSheet.tsx is not mine. Extending it to the sheet is the NEEDS line above.
5. **PROPOSED DECISION:** The disclosure uses the app's curly apostrophe ("This card’s fixture …"), as the rest of the copy does ("parent’s"), and the layout for several entries described under "Disclosure words".
6. **PROPOSED DECISION:** The INHIBITOR line's Lab wording is "Something here is hurting it: conditions N % suitable here.", until EntityInspect carries the inhibitor exposure (NEEDS).
7. **PROPOSED DECISION:** ExperimentRun's mode line and stamp note take testOnly from DishInfo.testOverrides, else from the card's own testOverrides. Reason: the copies are made from that dish, so either record means the run had an override.
8. **PROPOSED DECISION:** The E214 journey case is an unconditional `test.skip(true, 'E214 lands in stage 2 (cards-curated un-skips it)')`. Reason: un-skipping it is cards-curated's deliberate hand-off. A conditional skip would start failing in their in-flight run.
9. **PROPOSED DECISION:** The palette keeps `sporeveilOutline` (#5F666D) named but unused, so the palette still lists the colour v1.1 replaced.
