# G2 wave C: module marks in the atlas, DORMANCY_LOCKOUT, sim-tune E01 secretion

Date: 2026-09-28. Scope: three follow-ups from wave A (D-0019). Nothing was committed; the lead commits.

## Audit checklist

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1a | Feature-mark frames packed into the atlas build | DONE | `tools/art-build.ts` packs the starch notch (1 frame), reserve pocket bands 0–3 (4 frames) and resting seam prepare/rest/wake (3 frames), each in all 4 headings (32 frames). They go into `public/atlas/organisms.png` as `feature/<layer>/<heading>/<frame>`, and the manifest gets a new `features` table (size, headings, anchor, frames, frameNames). Sprite frames did not move: 0 of 189 changed position, and the `sprites` table is byte-identical. The sheet is still 512×256. |
| 1b | `npm run art:build` twice gives the same hash; `--check` passes | DONE | Two runs both wrote png sha256 `5c232dad4319dc39…` and manifest sha256 `fcff92c28de17b5f…`. `--check` prints `atlas up to date · 221 frames (32 feature-mark frames) · 512×256 · 5c232dad4319`. A test also builds the atlas twice in memory and compares the result with the committed files. |
| 1c | Renderer draws marks from the atlas; no runtime texture building; src/render imports nothing from art/src | DONE | `DishRenderer.buildFeatureLayers(atlas)` takes the textures it already made from `manifest.frames`, using keys from `featureFrameKeys(manifest.features)`. `featureParticles` now uses the organism atlas texture. `buildLayerAtlas`, the canvas and the `ImageData` are gone. `grep -rnE "from ['\"](@art\|[./]*art/src)" src/` finds nothing (exit 1). A test checks this for every file in src/render. |
| 1d | `featureLayers()` mapping and its tests kept | DONE | The function body is unchanged. The existing test "marks map only from cue bits and life state; two at most unless selected" passes as it was. |
| 1e | `--check` and content:validate atlas completeness cover the marks | DONE | `checkAtlas(…, { marks })` requires every enabled module's content `visualLayer` in `features`, at 16×16, in 4 headings, with at least the required frames (ARCH §10.1: seam 3, pocket 4, notch 1), and every declared frame packed. The CLI now prints `atlas … complete for 5 enabled species and 3 enabled module marks (starch_notch, resting_seam, reserve_pocket; 221 frames)`. |
| 1f | A missing mark frame fails with a precise message (test) | DONE | Unit test: `frames[feature/resting_seam/n/2]` → `E03 (resting_seam): missing frame "feature/resting_seam/n/2"`. CLI test: exit 1 and stderr contains `→ frames[feature/resting_seam/w/1]: E03 (resting_seam): missing frame "feature/resting_seam/w/1"`. |
| 1g | Asset preview shows the marks | DONE | `tools/asset-preview.{html,ts}` has a new "Module marks" section. For each layer and frame (with its name), in 4 headings, it shows the mark alone, then over a 16 px body in the same heading, then over the 32 px body scaled ×2 as the dish scales it. It also shows badges for the modules that use the mark, and a status line: `5 sprites · 3 module marks · 221 frames · … · every enabled module has its mark`. axe finds no serious or critical issues at desktop or phone width, and there is no sideways overflow. |
| 1h | Remove `P.reserveRim` if unused | DONE | Nothing referenced it; removed from `art/src/palette.ts`. |
| 1i | Headless screenshot of a dish at 4× with E03 carriers resting and E01 carriers | DONE (checked by eye) | `tmp/art-marks/marks-dish.png` (enlarged: `tmp/art-marks/marks-zoom.png`). It uses the real DishRenderer, the real atlas and a real world packed by the worker's `packEntities`. At tick 260, 6 of 6 E03 carriers are Resting (dim tint, full seam with fold tucks, turned with each body's heading). The 4 E01 carriers show three notches with pale rims. The 4 E05 carriers have a full reserve and show the amber band-3 pocket. A selected E01+E03+E05 carrier shows all three marks (idle seam frame 0, pale band-0 pocket, notch). Sprite scale is 4×. |
| 2a | DORMANCY_LOCKOUT reason code | DONE (engine and copy) | `src/sim/dormancy.ts` `dormancyReason(world, i)` → `{ code, value, restHeld }`. Throughout the post-wake lockout the code is DORMANCY_LOCKOUT, with value = lockout seconds left. `restHeld` is true exactly when a rest is due now (trigger held and entry energy) and only the lockout is holding it back. The code already existed in `src/sim/reasons.ts` (index 53); nothing was appended or renumbered. |
| 2b | Explore/Lab copy per UX §5.2 style | DONE | Explore: "Just woke up." Lab: "Just woke up: it cannot rest again for {t} s." With `restHeld`: "Just woke up: it would start resting now, but cannot rest again for {t} s." With an unknown value: "…cannot rest again yet." |
| 2c | Does not change outcomes or hashes, shown by a before/after hash comparison on dishes with E03 carriers | DONE | Before and after are identical in both scenarios (table below). The label is never written to an entity column. Evidence that this matters: a variant that writes it into `limitCode` changes the hash at t = 67 s even though outcomes are the same. |
| 2d | Inspector shows it | NOT WIRED (outside my files) | Showing it needs a few lines in `src/sim/moduleView.ts`, `src/worker/protocol.ts`, `src/ui/panels/Inspector.tsx` and `src/ui/strings/modules.ts`. None of these are mine, and three are being edited by other agents. Exact wiring is under Proposed decisions. |
| 3 | sim-tune counts E01 secretion from the profile producer rules | DONE | `sampleReasons()` counts every organism with `profileOf(world, i).starch !== null` (native producer or E01 carrier). A producer that is Preparing, Resting or Waking is counted under its recorded state reason instead of a stale `secretionCode`. `sampleReasons` is now exported. The report caption was updated to match. |

### Before/after hash comparison (item 2)

Script: `scratchpad/hashcmp.mts`. Three copies of `src/sim`, `tools/lib` and `content` were taken at the same moment and differ only in `src/sim/dormancy.ts`: HEAD's version, the new version, and a variant that also writes DORMANCY_LOCKOUT into `limitCode`.

- **Scenario 1:** clear water, 24 B01 carriers (E03, E01+E03, E03+E05). They rest, wake on sugar, then all food is removed and E is set to 60 as labelled test state. At t = 67 s all 24 are in the lockout with the 20 s trigger met (noIntake 25.0 s, lockout 4.0 s left), and they rest again. The state hash is taken every 50 ticks (19 hashes).
- **Scenario 2:** FIRST_DISH_V1, seed 104729, plus 20 E03 and 10 E01+E03 Sprinters, run for 3,000 ticks. Up to 17 carriers were in the lockout at once. Hash every 250 ticks.

| Tree | s1 @670 (lockout, trigger met) | s1 @970 | s1 19-hash digest | s2 @3000 | s2 digest |
|------|------|------|------|------|------|
| before (HEAD dormancy.ts) | ff7d8a84db8e9e31 | 2c9ec54170edcbda | 11c63b07c48c7b2a | 88bbab796c09a948 | 78881d7a0f2f0c02 |
| after (this change) | ff7d8a84db8e9e31 | 2c9ec54170edcbda | 11c63b07c48c7b2a | 88bbab796c09a948 | 78881d7a0f2f0c02 |
| variant that writes limitCode | **bd3e8d56a4a76d52** | 2c9ec54170edcbda | **2ad9dd08e80177c5** | 88bbab796c09a948 | 78881d7a0f2f0c02 |

## Files changed

- `art/src/layers/modules.ts`: `frameNames` per layer; comment now says the frames are packed into the atlas.
- `art/src/palette.ts`: removed the unused `reserveRim`.
- `art/src/sprite.ts`: `paletteRgba(palette, frame, owner)`, which `frameRgba` now uses. Marks share it.
- `tools/art-build.ts`: packs the mark frames (stable shelf packing, sprites first), writes `features` to the manifest, validates the layer definitions and that every enabled module has a mark, and `--check` passes the marks to `checkAtlas`.
- `tools/content-validate.ts`: `AtlasMarkRef`, `FEATURE_FRAMES`, `FEATURE_SIZE`, `FEATURE_HEADINGS`, `featureFrameKey`, `enabledMarks`; the `checkAtlas` option `marks`; the CLI checks and reports the marks.
- `public/atlas/organisms.png` and `manifest.json`: regenerated by `npm run art:build`.
- `src/render/features.ts`: `FeatureLayerId` and `FEATURE_LAYER_IDS` (the renderer's own vocabulary), `AtlasFeatureLike`, `featureFrameKey`, `featureFrameKeys`. `featureLayers()` is unchanged; `buildLayerAtlas`, `layerKey` and the art/src imports were removed.
- `src/render/renderer.ts` (feature-layer loading only): import line; optional `features` field on `AtlasManifestLike`; `buildFeatureLayers(atlas)` resolves atlas textures.
- `tools/asset-preview.{html,ts}`: Module marks section and status line. Also fixed axe issues that were already there: `--muted` is now #56656d (small labels were 3.97–4.38:1), and the sideways-scrolling strips can take keyboard focus.
- `src/sim/dormancy.ts`: `restDue`, `DormancyReason`, `dormancyReason`. `stateReason` and the entry test now share the same trigger helpers (same comparisons, same clocks).
- `src/ui/strings/reasons.ts`: `ReasonContext.restHeld`; Lab copy for DORMANCY_LOCKOUT.
- `tools/sim-tune.ts`: producer rules come from the profile; resting producers are counted under their state reason; `sampleReasons` exported.
- Tests: `tests/sim/module-visuals.test.ts`, `tests/content/atlas.test.ts`, `tests/sim/dormancy.test.ts`, `tests/ui/reasons.test.ts`, `tests/tools/sim-tune.test.ts`.
- Scratch, gitignored, mine: `tmp/art-marks/` (harness, screenshot scripts and the PNGs). Report: this file.

## What each new test proves

- **module-visuals: "the marks are atlas frames…"** Each of the 32 mark frames in `organisms.png` is pixel-for-pixel identical to `orient(frame, h)` through the layer palette, and has pixels. The manifest `features` entries match art/src. The renderer's layer list matches art/src in the same order.
- **module-visuals: "every mark the renderer can pick is an atlas frame…"** Every (cue bits × band × life state) pick of `featureLayers()` resolves to a key present in the manifest. The renderer's key is identical to the key the validator and build use. E01, E03 and E05 draw the layer their content `visualLayer` names. A manifest without `features` draws no marks instead of crashing.
- **module-visuals: "src/render builds no textures from art/src…"** No file in src/render imports `@art/` or `../art/`. I checked that the regex matches the old imports.
- **atlas: mark tests.** The committed atlas passes with the enabled marks. One missing frame gives exactly one error with the exact path and message. Other cases each give a precise message: a missing table entry, a short frame count (with the ARCH §10.1 state names), wrong size or headings, a wrong frame rect, and an old atlas with no `features` (3 errors). Callers that check only species behave as before.
- **atlas: art:build determinism.** `buildAtlas()` twice gives identical PNG bytes and manifest, equal to the committed files. The 32 mark frames come after all sprite frames.
- **atlas: CLI mark test.** `content-validate --atlas` with a mark frame removed exits 1 and names the frame.
- **dormancy: "DORMANCY_LOCKOUT: read from the saved clocks…"** During Resting and Waking, the derived reason equals the recorded `limitCode`/`limitValue`. Right after waking it reads `{DORMANCY_LOCKOUT, 30, restHeld false}`. `restHeld` turns true exactly 200 ticks after waking (the 20 s trigger) and stays true for exactly 100 ticks; on the next tick the carrier starts Preparing (300 ticks after waking, as in the existing lockout test). A carrier with E = 12 gets the lockout reason but never `restHeld`, and gets NONE after the lockout. The label never appears in `limitCode`. A carrier that cannot rest reads NONE.
- **dormancy: "reading DORMANCY_LOCKOUT changes no state…"** Two identical worlds run through rest, wake, lockout and rest again. One reads `dormancyReason` for every carrier every tick; the other does not. All 16 sampled state hashes are equal, and the reads did see the lockout and the held-rest case.
- **reasons: DORMANCY_LOCKOUT copy.** Explore and Lab strings, the `restHeld` variant, and unknown or NaN values. The existing test that covers every code also covers it.
- **sim-tune.** E01 carriers are counted (`{SECRETING: 2, SECRETION_NO_SUBSTRATE: 1}`), plain Sprinters are not, and native B06 is still counted. A resting E01+E03 carrier is counted as `RESTING_FOOD_SCARCE`. `tuneSeed` on a recipe whose alternate founders carry E01 counts exactly the 12 carriers among 24 Sprinters. The old code would give `{}` for B01.

## Commands and results

- `npm run art:build` (×2): `wrote atlas · 221 frames (32 feature-mark frames) · 512×256 · 5c232dad4319` both times, same sha256.
- `npx tsx tools/art-build.ts --check`: `atlas up to date · 221 frames (32 feature-mark frames) · 512×256 · 5c232dad4319`.
- `npx tsx tools/content-validate.ts`: `content ok · … atlas public/atlas/manifest.json complete for 5 enabled species and 3 enabled module marks (starch_notch, resting_seam, reserve_pocket; 221 frames)`. No content/ file changed, so `--write` was not needed.
- `npx vitest run tests/sim/module-visuals.test.ts tests/content/atlas.test.ts tests/tools/sim-tune.test.ts tests/sim/dormancy.test.ts tests/ui/reasons.test.ts tests/render tests/sim/modules.test.ts tests/fixtures/module-accounting.test.ts`: `Test Files 8 passed (8) · Tests 58 passed (58)`.
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint <all files above>`: exit 0.
- `E2E_PORT=4193 E2E_OUTDIR=tmp/dist-art-marks npx playwright test tests/e2e/experiments.spec.ts tests/e2e/new-dish.spec.ts tests/e2e/garden.spec.ts` (phone-portrait, phone-landscape, desktop): `39 passed (19.9m)`. new-dish is the only spec the E01/E03/dormancy/rest grep matched. experiments opens EXP_C (E05 carriers). garden is a smoke test for the changed renderer init. Port 4193 was stopped afterwards.
- Asset preview (Vite dev on 4193, then stopped), desktop 1280×900 and phone 360×800: 3 mark cards, 40 canvases, no missing-frame badges, 0 px sideways overflow, axe serious/critical: none.
- Before/after hash comparison: see the table above.
- `prettier --write` was run only on the owned files that were prettier-clean at HEAD (`art/src/layers/modules.ts`, `tools/sim-tune.ts`, `tests/tools/sim-tune.test.ts`, `tests/ui/reasons.test.ts`). Every other owned file was already not prettier-clean at HEAD and was left as it was, so no code I did not write was reformatted.

## Not done, and why

- **DORMANCY_LOCKOUT is not yet shown in the inspector.** The payload and panels live in `src/sim/moduleView.ts`, `src/worker/protocol.ts`, `src/ui/panels/Inspector.tsx` and `src/ui/strings/modules.ts`. None are mine, and worker and panels are being edited right now. The wiring is a few additive lines; see Proposed decisions. Until then the engine function, the copy and the tests exist, and the existing "just woke up" chip and line still come from the measured `lockoutSeconds`.
- **The 200 % text and 48 px target checks** do not apply to anything I changed in the app. No app view or panel changed, and the new Lab copy is not rendered until the wiring above is done. The asset preview is a development tool. Its existing 14 px text and 32 px controls are unchanged; its contrast and focus issues are fixed.
- **`tools/art-preview.ts` is unchanged.** It writes `docs/reports/art/*.png`, which I may not create. The asset preview and `tmp/art-marks/marks-crop.png` cover review of the marks.

## Bugs noticed elsewhere (not fixed; not my files)

1. **`src/sim/experiments.ts:397` has the same problem sim-tune had.** Experiment observations count secretion only when `sp.secretesStarch`, so E01 carriers are left out. It also reads `secretionCode`, which is stale for Preparing, Resting and Waking producers, because `stageStructures` skips non-Active organisms before writing it. The fix mirrors `tools/sim-tune.ts`: use `profileOf(world, i).starch !== null`, and use `limitCode` when the organism is not Active.
2. **`eslint.config.js` does not enforce ARCH §3 for src/render.** The render block forbids only Preact and `@ui/*`. Adding `'@art/*'` (and `'../../art/*'`) would make the rule a lint error instead of only a test.
3. **The palette colour `P.muted` (#6B7B84)** is 3.97:1 on `P.surface` (#F5F4EF). The app's styles.css does not use that hex, so this is only a note for any future small text in that colour.

## Proposed decisions

- **PROPOSED DECISION: module marks are atlas frames in the organism atlas.** Keys are `feature/<layer>/<heading>/<frame>`, listed in a new `features` table (size 16, 4 headings, anchor 8,8, frames, frameNames), packed after the sprites so no sprite frame moves. It is one sheet, one texture and one draw batch. The manifest stays `version: 1` because the section is added only. content:validate takes the required marks from each enabled module's content `visualLayer`, and the frame counts from ARCH §10.1 (seam 3, pocket 4, notch 1; an unlisted layer needs at least 1). Like the sprite requirements, these counts are kept independent of art/src. Tools do not import src/render (ARCH §3). The key format is defined in the validator and in the renderer, and a test proves the two are the same.
- **PROPOSED DECISION: DORMANCY_LOCKOUT is an observation, not a saved value.** `dormancyReason()` reads it from the saved clocks, and it is never written to `limitCode`. Every entity column is part of `stateHash`, so writing a label changes hashes (see the evidence table). The code is the organism's state reason for the whole 30 s lockout, following SPEC §12.2 "States", so the existing "just woke up" chip and line can cite it. `restHeld` marks the narrower case "rest would otherwise have started", and the Lab copy then says so. My recommendation is that it should **not** replace the measured intake reason as the one-sentence constraint: while rest is held, the organism really is starving, and that measured fact is the stronger constraint.
- **Wiring for the lead (additive):**
  1. `src/worker/protocol.ts` `DormancyInspect`: add `readonly reason: { readonly code: number; readonly value: number; readonly restHeld: boolean };`.
  2. `src/sim/moduleView.ts` `dormancySummary`: import `dormancyReason` from `./dormancy` (the file already imports `wakeConditions` from there) and add `reason: dormancyReason(world, i, prof)`.
  3. `src/ui/strings/modules.ts` `dormancyLines`, default branch: replace the lockout line with `if (d.reason.code === R.DORMANCY_LOCKOUT) lines.push(reasonText(R.DORMANCY_LOCKOUT, 'lab', { value: d.reason.value, restHeld: d.reason.restHeld }));`. The text for `restHeld: false` is identical to today's line.
  4. `src/ui/panels/Inspector.tsx` chip: show it when `e.dormancy?.reason.code === R.DORMANCY_LOCKOUT`, with the text `reasonText(R.DORMANCY_LOCKOUT, 'explore')`.
- **PROPOSED DECISION: sim-tune counts secretion by producer rules, not species.** A producer that is not Active is counted under its recorded state reason (for example `RESTING_FOOD_SCARCE`), because the secretion stage records no outcome for it. Apply the same rule to experiment observations (bug 1).
