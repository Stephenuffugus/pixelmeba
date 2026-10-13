# Wave 8a · adversarial re-verification, round 1 (schema5, art-small)

Re-verifier: reverify1, 2026-10-13. I edited no tracked file. My scratch work is in tmp/reverify1-g5-wave-8a/.

**Verdict: ok = true.** The one MAJOR from wave-verify.md is fixed. I tried to refute the fix and could not, and nothing regressed.

## Problems (most severe first)

There are no BLOCKER or MAJOR problems.

The MINOR and NIT items in wave-verify.md were not part of this fix round. They are unchanged and stay open, for the lead to route:
- the schema5 trap-pair and glowState import checks;
- the barriers.ts fungal disperser rule and the refusal-sentence articles;
- V02's glyph reading as a capsid rather than a lace;
- the ATLAS_W comment's forward-looking "1024×2048".

## Verified OK

- VERIFIED OK [art-small] — MAJOR tests/sim/module-visuals.test.ts:139/:149 is fixed.
  - Typecheck: `npx tsc -p tsconfig.json --noEmit` exits 0, so the TS2345 at :149 is gone.
  - The test: `npx vitest run tests/sim/module-visuals.test.ts …` passes. tests/sim/module-visuals.test.ts itself is unmodified (it is not in `git status`), so the fix does not depend on the builder's earlier test patch. The lead must NOT apply tmp/art-small/module-visuals.patch.
  - How the fix works: art's `FeatureLayerId` and `FEATURE_LAYERS` are back to exactly the renderer's 10 layers. The three Phase 5 marks live in `PHASE5_FEATURE_LAYERS`, and tools/art-build.ts packs `ATLAS_FEATURE_LAYERS = [...FEATURE_LAYERS, ...PHASE5_FEATURE_LAYERS]`.
- VERIFIED OK [art-small] — the guards fail on the old behaviour. I ran two load-time mutants through a scratch vitest config (tmp/reverify1-g5-wave-8a/vitest.mutant.config.ts, a resolveId redirect of art/src/layers/modules). Neither touches a tracked file.
  - Mutant A puts the Phase 5 marks back in `FEATURE_LAYERS`, which is the pre-fix shape. Two tests fail: module-visuals "the marks are atlas frames" (:139) and the new art-p5 case "FEATURE_LAYERS stays the renderer vocabulary… (fix1)". Both report `expected [ 'starch_notch', …(12) ] to deeply equal [ 'starch_notch', …(9) ]`.
  - Mutant B stops packing the Phase 5 marks (`ATLAS_FEATURE_LAYERS = FEATURE_LAYERS`). Eight art-p5 tests fail, among them the lime and amber colour rules, the fix1 case, the three-marks case and "the real art builds with no errors".
- VERIFIED OK [art-small] — the atlas bytes did not change.
  - Checksums: md5 is 6cb79bfa… for organisms.png and b3d70f1f… for manifest.json, both before and after my run, matching the fixer's report.
  - `npm run art:build -- --check` reports "atlas up to date · 1342 frames (112 feature-mark frames, 13 world-tile frames) · 1024×1024 · 24f1768f34a0".
  - The manifest's feature keys equal the `ATLAS_FEATURE_LAYERS` order, which the art-p5 fix1 case pins. The renderer reads only the `FEATURE_LAYER_IDS` keys (src/render/features.ts `featureFrameKeys`), so the extra packed marks stay inert until wave 13.
- VERIFIED OK [art-small] — the fix stayed inside the owner's files.
  - After wave-verify.md (13:53), only art/src/layers/modules.ts, tools/art-build.ts and tests/content/art-p5.test.ts changed (14:06), plus the fix report. All three are art-small's own files.
  - No other module imports the layer lists: a grep of src, tests and tools for `layers/modules` and `art-build` finds only art-build, module-visuals and the content tests.
- VERIFIED OK — typecheck and lint across the whole repository, the same as `npm run check`'s first two steps.
  - `npx tsc -p tsconfig.json --noEmit` exits 0.
  - `npx eslint .` exits 0.
- VERIFIED OK — the unit tests that touch the art pass.
  - `npx vitest run tests/sim/module-visuals.test.ts tests/content/art-p5.test.ts tests/content/atlas.test.ts tests/content/silhouettes.test.ts tests/render`: Test Files 11 passed (11), Tests 531 passed (531).
  - `npx vitest run tests/tools/android-icons.test.ts tests/tools/store-assets.test.ts tests/content`: Test Files 12 passed (12), Tests 556 passed (556).
- VERIFIED OK — content validates and nothing new is enabled. `npm run content:validate` gives "content ok · contentHash b8ddc0dd… · species 38 (enabled 19) … 10 enabled module and native marks". The two E06 guide-rules warnings come from src/sim/content/guideRules.ts, which this wave does not touch.
- VERIFIED OK — the fence and conservation are unchanged. `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts` gave Test Files 7 passed (7), Tests 58 passed (58), EXIT 0, in 419 s.

Not run this round: the full `vitest run`, the third step of `npm run check`. Only the three art files changed, and every test that imports them passed above. Per CLAUDE.md, the lead still runs `npm run check` before the commit. No E2E was run, because the fix changed no screen and no atlas byte.
