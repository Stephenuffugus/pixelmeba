# art-small fix round 1 (wave 8a)

## MAJOR: tests/sim/module-visuals.test.ts:139/:149 (npm run check failed): FIXED

Cause: the build added glow_center, jacket_rim and mode_half to art's `FEATURE_LAYERS` and `FeatureLayerId`, but module-visuals pins `FEATURE_LAYERS` to the renderer's `FEATURE_LAYER_IDS` (src/render/features.ts), in type (:149) and at runtime (:139). The renderer learns the Phase 5 marks only in wave 13 (org-ui).

How: I fixed it in my own files, so no change outside my ownership is needed and the test-side patch (tmp/art-small/module-visuals.patch) is no longer needed. The lead should not apply it.
- art/src/layers/modules.ts: `FeatureLayerId` and `FEATURE_LAYERS` are again exactly the renderer's 10 layers. New exports:
  - `Phase5FeatureLayerId = 'glow_center' | 'jacket_rim' | 'mode_half'`
  - `AtlasFeatureLayerId = FeatureLayerId | Phase5FeatureLayerId`
  - `FeatureLayerDef<Id extends AtlasFeatureLayerId = FeatureLayerId>` (generic, and the default keeps the old meaning)
  - `PHASE5_FEATURE_LAYERS`
  - `ATLAS_FEATURE_LAYERS = [...FEATURE_LAYERS, ...PHASE5_FEATURE_LAYERS]`

  The doc comment says org-ui (wave 13) appends the three to `FeatureLayerId`/`FEATURE_LAYERS` in this order, so the atlas does not move.
- tools/art-build.ts packs and validates `ATLAS_FEATURE_LAYERS` through a local alias `type FeatureLayerDef = AnyLayerDef<AtlasFeatureLayerId>`. Packing order is unchanged, so organisms.png and manifest.json are byte-identical before and after this fix (md5 6cb79bfa… and b3d70f1f…; `art:build -- --check` reports "atlas up to date").
- Test: tests/content/art-p5.test.ts has a new case, "FEATURE_LAYERS stays the renderer vocabulary; the Phase 5 marks are packed after it until wave 13 (fix1)". It asserts:
  - `FEATURE_LAYERS` ids equal `FEATURE_LAYER_IDS`, and no Phase 5 id is in `FEATURE_LAYER_IDS`.
  - `ATLAS_FEATURE_LAYERS` = `FEATURE_LAYERS` followed by `PHASE5_FEATURE_LAYERS`.
  - The manifest's feature keys equal the atlas list in order.

  Under the old code it fails (13 ids against 10, and `PHASE5_FEATURE_LAYERS` did not exist). The existing lookups in the file now use `ATLAS_FEATURE_LAYERS`.

Note for wave 13 (org-ui): when the renderer adds the three ids to `FEATURE_LAYER_IDS`, it must move them into art's `FeatureLayerId`/`FEATURE_LAYERS` and empty `PHASE5_FEATURE_LAYERS`. Otherwise module-visuals.test.ts:139 fails, and that is intended.

## Files changed (this round)
- art/src/layers/modules.ts
- tools/art-build.ts
- tests/content/art-p5.test.ts
- docs/reports/reviews/g5-wave-8a/art-small-fix1.md (this report)

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: exit 0 (the TS2345 at module-visuals.test.ts:149 is gone)
- `npx eslint art tools/art-build.ts tools/content-validate.ts tests/content/art-p5.test.ts`: exit 0
- `npm run art:build -- --check`: "atlas up to date · 1342 frames (112 feature-mark frames, 13 world-tile frames) · 1024×1024 · 24f1768f34a0"; the md5 of organisms.png and manifest.json is the same before and after
- `npx vitest run tests/sim/module-visuals.test.ts tests/content/art-p5.test.ts tests/content/atlas.test.ts tests/content/silhouettes.test.ts tests/render`: 11 files, 531 tests passed
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts`: 8 files, 62 tests passed (FENCE unchanged)
- `npm run content:validate`: exit 0, "content ok · contentHash b8ddc0dd…". Nothing new is enabled: 19 species and 10 marks.
- E2E: none. No screen changed, and the atlas bytes did not change in this round.
