# g3 wave 2 — art-features build report

This change renders Phase 3 from snapshot data only: film, fungal networks, adhesion links, infection, parasites, food objects, the film deposit band, and the seven Phase 3 module feature layers. It also bumps the protocol from 1 to 2.

Two things to know first:
- **Nothing was checked by eye in a live dish.** The Phase 3 drawing (fungal tiles, film, food objects, links, the infection glyph) is proven by the pure-function tests and the asset preview. No browser run had a dish holding fungi, film, objects or infected hosts. The lead should look at one before ticking P3.4.
- **One test outside my files fails.** `tests/sim/view-switch.test.ts` fails because another builder enabled B02. Details are under "Bugs noticed elsewhere".

There is no sim rule change, no content change and no fence change.

## Checklist

### Protocol (W2-23)
- **DONE: version and stride.**
  - `PROTOCOL_VERSION = 2` (`src/worker/protocol.ts:21`).
  - `ENT_STRIDE` 12 → 14 (:207), with `E_CUE2 = 12` (:220) and `E_LINKMASK = 13` (:221).
- **DONE: `CUE2_*` bits.** All 14 are defined (:249–262): INFECTED 1, PARASITIZED 2, ANCHORED 4, LINKED 8, MOD_E04/E06/E07/E08/E09/E10/E12 = 16…1024, SEEKING_LIGHT 2048. DETRITUS_INTAKE 4096 and RELEASING_PROTEIN 8192 are constants only and are never packed.
- **DONE: link mask constants.** `LINKMASK_N/E/S/W/DIRS/TRANSFER` (:269–274).
- **DONE: packing.**
  - `src/worker/snapshot.ts` `cue2Of` (:144) and `linkMaskOf` (:181) are written for every entity, every pack. The value is 0 when nothing applies.
  - `linkMaskOf` reads only valid references (`refValid`) and takes each link's direction from the partner's cell. Bit 4 stays 0 until wave 3.
  - Proved by `tests/worker/protocol.test.ts` "a hand-built world decodes…" and "a pooled buffer that held set bits packs 0".
- **DONE: links and objects.**
  - `SnapshotMsg.links?` holds `[x1, y1, x2, y2, kind]` with `LINK_STRIDE 5` and `LINK_KIND_ADHESION 3`, each pair once. `SnapshotMsg.objects?` holds `SnapshotObject[]` (protocol :406–409).
  - Packed by `packLinks` (:200) and `packObjects` (:221). `OBJECT_FULL_C` is pellet 10 C and wafer 10 C (CT §5.2).
  - Wired in `src/worker/host.ts` `sendSnapshot`; `links.buffer` is transferred.
  - Both fields are optional so that `tools/render-bench.ts`, which I do not own, still typechecks. The host always sends them, and a test checks this.
- **DONE: film deposit band.**
  - `DEPOSIT_BANDS` 6 → 7 (snapshot :284). `DEPOSIT_FILM_BAND 6`, `FILM_LEVEL_MASK 127` and `FILM_ERODING 128` are in protocol :287–289.
  - `packFilmBand` (:256) uses worker-side scratch: a `WeakMap<World, …>` of the film at the last tick packed. Packing again at the same tick keeps the bits, and a tick going backwards (undo) clears them. Nothing goes into the sim.
- **DONE: `objectEmptied` event.** Added to `VisualEvent.type` (:314). `visualEvents()` is untouched.
- **DONE: ARCH.** §7 heading now reads "protocolVersion: 2", and the §8 field list is updated.

### Build
- **DONE: film textures.**
  - Atlas tiles `tile/film/0..3` (isolated, edge, center, eroding), authored in `art/src/tiles/index.ts`.
  - The tile is chosen from the four-neighbour film mask and the eroding bit (`src/render/world3.ts` `filmTile`). Opacity follows the film level (`filmAlpha`).
  - `renderer.ts` `applyFilm` (:605) uses one particle per film cell, rebuilt only when the band changes.
  - **Key scheme:** world tiles are `tile/<id>/<frame>`, with one heading and one cell per 16×16 frame. They are listed in a new manifest `tiles` table `{size, frames, frameNames}`; the manifest stays version 1 (additive, like `features` in D-0032).
  - Checked by `checkAtlas(…, { tiles })` with `TILE_FRAMES` (`tools/content-validate.ts:185`) and `enabledTiles` (:208): film with the film system, pellet with M10, wafer with M11, stain with either.
- **DONE: fungal segments.**
  - Drawn as `<assetId>/mask/e/<mask>` from `E_LINKMASK`, never through the body path (renderer :866). The single `d.move ?? d.idle` is reached only in the non-fungus branch.
  - Viruses are skipped (:847).
  - `tip/e/0` when the mask has ≤ 1 bit; `bud/e/0` when `E_GROWTH ≥ 1`.
  - F02 `pulse/e/0..1` only when bit 4 is set, 500 ms per frame (≤ 1 pulse/s). In reduced motion it is a static frame 0 (`world3.ts` `fungalPick`).
  - `decaying/e/<mask>` plays from the slot's 'death' event, using the previous snapshot's link mask (:735), and fades over 1.2 s.
  - Tests: `tests/render/phase3.test.ts` "fungal segments…".
- **DONE: adhesion links.** `renderer.ts` `drawLinks` (:1012) draws a one-sprite-pixel light line with a dark edge between member positions from `SnapshotMsg.links`. It is hidden at wide zoom.
- **DONE: infection glyph.**
  - `v01_pinphage/glyph/e/0` (the dish's virus sprite with a `glyph`) is drawn as a status mark only when `infectionGlyphShown(cue2, selected, markersOn)` (renderer :922; `world3.ts`).
  - The toggle is in `OverlayPicker.tsx` (:88), offered when the dish allocates `v01`.
  - `state.ts` has the `infectionMarkers` signal (:90) and `setInfectionMarkers` (:930), which calls `renderer.setInfectionMarkers`. `attachRenderer` replays it.
- **DONE: overlays.** Pinphage and Biofilm are ordinary density overlays: `OVERLAYS` gains `film` "Biofilm", C per cell, and `v01` "Pinphage", units per cell (`src/ui/strings/lab.ts:437–438`). A new 'viral' colormap is in `src/render/layers.ts`.
- **DONE: a parasite is drawn at its host.** `riderMarks` (`world3.ts`) marks any entity sitting exactly at the packed position of a `CUE2_PARASITIZED` host. The renderer draws riders in a second pass so they show over the host (renderer :594).
- **DONE: food objects.**
  - `tile/pellet/0..3` and `tile/wafer/0..3`: the outline shrinks with the fill step (`objectFrame`).
  - `tile/stain/0` fades over 6 s from an `objectEmptied` event (renderer :646, :713).
- **DONE: seven module feature layers** in `art/src/layers/modules.ts` (:138–226), each 16 px with 4 headings and anchor [8, 8]:
  - `anchor_foot` 1
  - `shade_patch` 1
  - `light_trail` 1
  - `debris_granule` 2 (granule, pulse)
  - `protein_notches` 2 (notches, pale release marks)
  - `matrix_edge` 4 (film band 0–3)
  - `adhesion_link` 1

  `FEATURE_FRAMES` has a row for each (content-validate :159–165). `src/render/features.ts` `featureLayers(cue, life, selected, out, cue2 = 0, ctx = {})` (:120) is still callable with four arguments. The bit→layer map is in `CUE2_LAYER` (:98).
- **DONE: at most two feature cues at normal zoom** (`MAX_UNSELECTED_MARKS`). Priority order:
  1. live state: seam cycle, foot, link, trail, granule pulse, protein release
  2. reserve pocket
  3. matrix edge
  4. carrier marks
- **DONE: reduced motion.**
  - No light trail.
  - The granule pulse becomes a static bright frame.
  - The F02 pulse becomes a static dot.
  - Decaying tiles do not fade.
  - Adhesion links are static anyway.
- **DONE: nothing drawn that the snapshot does not report.** Every Phase 3 drawing decision is a pure function in `features.ts` or `world3.ts` of `E_CUE2`, `E_LINKMASK`, `E_GROWTH`, deposits, `links`, `objects` and events.

### Done when
- **DONE: `tests/render/phase3.test.ts` (new, 11 tests).** Covers:
  - every `E_CUE2` bit maps to exactly one layer;
  - nothing shows when a bit is 0: no granule pulse without `DETRITUS_INTAKE`, no foot without `ANCHORED`, no glyph without infection unless inspected or toggled, no fungal pulse without bit 4, no rider without a parasitized host;
  - reduced-motion variants;
  - ≤ 2 cues over the cue-word sweep;
  - fungi never take the body path (manifest kinds plus `renderer.ts` source shape);
  - film tile rules;
  - object steps and stain fade;
  - tile keys equal the art-build and content-validate keys;
  - W2-30 import boundary.
- **DONE: `tests/worker/protocol.test.ts`.** Added:
  - version 2, stride 14, 7 bands;
  - a hand-built world built with `registryWith` and `allowUnimplemented`, holding film cells, a linked F01 trio via `linkFungal`, an infected B01, an X01 on an A01, E04/E10/E12 B01s with an adhesion link, an E06/E07 A01, and a pellet via `placeObject`. It decodes to link masks equal to the link table, the expected bits, the links and the objects;
  - the film eroding bit, including staying put while paused;
  - a pooled buffer that held set bits packs 0 for a plain entity;
  - the host's snapshot carries `links` and `objects`.
- **DONE: `tests/content/atlas.test.ts`.**
  - `checkAtlas(atlas, phase13, { png, marks: [...enabled, ...E04, E06–E10, E12 visualLayers], tiles: ALL_TILES })` returns `[]`, whatever the manifest says.
  - Removing one frame of each new kind (7 layers, 4 tiles) gives exactly one error naming it.
  - A short or missing tile set and a wrong tile size are refused by name.
  - The art:build determinism test now counts marks and tiles.
- **DONE: `tests/sim/module-visuals.test.ts`.**
  - The 32-frame count is generalized: 4 × the sum of frames = 80.
  - The E01/E03/E05 loop now sweeps cue2 too, and every frame of every layer is reachable.
  - Every module → visual layer mapping is checked, including E04, E06–E10 and E12.
  - The renderer lines its regexes match are unchanged.
- **DONE: art:build.**
  - Two builds both gave `wrote atlas · 856 frames (80 feature-mark frames, 13 world-tile frames) · 1024×1024 · 99ab54adef36`.
  - `--check` gave `atlas up to date · … 99ab54adef36`.
  - The asset preview's status line reads "19 sprites · 10 module marks · 4 world tiles · 856 frames · … every enabled module has its mark". There were no missing-frame badges and no page errors. A new "World tiles" section shows every tile frame plus a film patch drawn edge to edge.
  - Screenshots, read and checked, are in `tmp/art-features-shots/`.
- **DONE: grep boundary (W2-30).** `src/render` imports only relative modules, `pixi.js`, `@worker/protocol`, `@sim/constants` and `@sim/grid`. This is a test in `phase3.test.ts`, and the module-visuals art-import test still passes.
- **DONE: `tests/e2e/infection-overlay.spec.ts` (desktop).** The journey:
  1. Observe lists Biofilm and Pinphage in a new dish.
  2. One overlay at a time, each with its unit.
  3. Infection markers is a button named "Infection markers" with `aria-pressed`, 48×48 or larger, and stays pressed whatever overlay is chosen.
  4. Text in the tray is ≥ 16 px and axe is clean.
  5. The worker state hash is unchanged by looking, and there are no page errors.
- **DONE: fence unchanged.** No sim file was touched.

## Files
- **New:**
  - `art/src/tiles/index.ts`
  - `src/render/world3.ts`
  - `tests/render/phase3.test.ts`
  - `tests/e2e/infection-overlay.spec.ts`
  - this report
- **Changed:**
  - `src/worker/protocol.ts`
  - `src/worker/snapshot.ts` (packers only)
  - `src/worker/host.ts` (the snapshot's `links`/`objects` only)
  - `src/render/{renderer,features,layers}.ts`
  - `art/src/{palette.ts,layers/modules.ts}`
  - `public/atlas/{organisms.png,manifest.json}` (via art:build)
  - `tools/art-build.ts`
  - `tools/content-validate.ts` (atlas section)
  - `tools/asset-preview.{ts,html}`
  - `src/ui/panels/OverlayPicker.tsx`
  - `src/ui/state.ts` (signal and renderer call)
  - `src/ui/strings/lab.ts` (two OVERLAYS rows and two LAB_TEXT strings)
  - `tests/{worker/protocol,sim/module-visuals,content/atlas}.test.ts`
  - `docs/ARCHITECTURE.md` (§7 heading, §8 list)
- **Outside my list:** `src/ui/feed.ts` gained one additive `case 'objectEmptied'` ("A food object ran out."). It was required: adding the event type made `describe()`'s exhaustive switch fail `tsc`. Wave 3 may reword it.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint` over every file I changed: clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/render tests/worker/protocol.test.ts tests/sim/module-visuals.test.ts tests/content/atlas.test.ts tests/content/debris-text.test.ts`: **Test Files 13 passed (13), Tests 110 passed (110)**.
- After the mutation checks, `vitest run tests/render tests/worker/protocol.test.ts tests/worker/host.test.ts tests/ui/feed-modules.test.ts tests/sim/module-visuals.test.ts tests/content/atlas.test.ts tests/sim/view-switch.test.ts`: 88 passed, 1 failed. The failure is `view-switch`, which is not mine; see "Bugs noticed elsewhere".
- `npx tsx tools/content-validate.ts`: `content ok · … atlas … complete for 15 enabled species and 3 enabled module marks (…) and 1 world tiles (film; 856 frames)`.
- `E2E_PORT=4224 E2E_OUTDIR=tmp/dist-art-features npx playwright test tests/e2e/infection-overlay.spec.ts --project=desktop`: **1 passed (54.1s)**. Port 4224 was stopped before and after.
  - The first run failed: it pressed Space to "pause", but the Garden opens paused, so Space started it. I fixed the journey to hash the dish as it opens.

### How I checked the tests fail without the mechanism
I temporarily broke four things, then restored the files:
- `E_CUE2` packed as 0;
- the foot shown without `ANCHORED`;
- the tip on ≤ 2 links;
- the glyph shown on selection without infection.

Result: 4 tests failed across `protocol.test.ts` and `phase3.test.ts` (each mutation was caught). The pooled-buffer test fills the buffer with 65535, so a missing write cannot pass it.

## FENCE notes
None. The fence files pass; no simulation code was changed.

## Bugs noticed elsewhere
- **`tests/sim/view-switch.test.ts` fails** ("Life preview rule … exactly as the species table does"). `lifeBrushFor` now returns `surfaces` for B02 (enabled this wave), and the test pins `{habitatMask, attached}` only. This is caused by another builder's species enable and is not a rendering bug. The test needs the `surfaces` field.
- **The anchor foot rotates with the body.** It is a heading-derived mark (D-0032), so it faces the body's "down" for heading E/W and sideways for N/S. The snapshot does not say which side the support is on. Wave 4 could add a support-direction cue if the owner wants the foot to face the actual stone.
- **The infection glyph is the dish's first virus glyph.** That is correct for Phase 3 (V01 only). Phase 5 (V02) needs the virus identity in the snapshot, for example an E_CUE2 bit or a code.

## Proposed decisions
- **PROPOSED DECISION: film deposit band (band 6).** The low 7 bits are film C on a linear scale (0.50 C = 127; any film ≥ 1). Bit 7 is "eroding": the film is lower than at the last tick this packer saw. A cell that builders topped up at least as much as it lost is not eroding. The bits are kept while paused and cleared when the tick goes back. The scratch is worker-side (a `WeakMap` per world), never sim state.
- **PROPOSED DECISION: bud overlay.** It shows when `E_GROWTH ≥ 1`, i.e. B ≥ 2·B0 using the species' recorded B0, the same value as `E_GROWTH`.
- **PROPOSED DECISION: one cell per tile.** World tiles (film, objects, stain) and fungal segment tiles are drawn at one cell per 16 px frame, so a thread drawn from a segment reaches exactly its linked neighbour's cell. Organism bodies keep ARCH §9's 16 px = 2 cells at sprite scale 1. World tiles are keyed `tile/<id>/<frame>` in a manifest `tiles` table (manifest stays version 1, additive), and content:validate requires:
  - film when the film system is enabled;
  - pellet with M10;
  - wafer with M11;
  - stain with either.
- **PROPOSED DECISION: mark frame counts and states.**
  - `debris_granule` 2: carrier granule, and the pulse on detritus intake.
  - `protein_notches` 2: notches, and pale release marks while releasing.
  - `matrix_edge` 4: film band 0–3 of its cell, where 0 means no film there and 1–3 are thirds of the cap.
  - `anchor_foot`, `adhesion_link` and `light_trail` show only with their state bit and their module bit together.
  - `shade_patch` shows on every E06 carrier.
- **PROPOSED DECISION: two status bits with no feature layer.** `CUE2_PARASITIZED` maps to the rider order (the parasite is drawn after, and over, its host) rather than to a feature layer. `CUE2_INFECTED` maps to the status-mark glyph.
- **PROPOSED DECISION: the Infection markers toggle** appears in Observe only when the dish allocates a viral field (`v01`). It is a view setting in the UI and renderer, is never sent to the worker, and is not saved.
