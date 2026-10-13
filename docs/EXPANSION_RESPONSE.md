# EXPANSION_RESPONSE — the single status and evidence report

Update at every gate (`g0` … `v1.3.0`). Replace placeholders with real, pasted outputs. Separate
**implemented**, **tested**, and **proposed/deferred**. Never claim a pass that did not run in
this session. Keep older gate evidence in `docs/reports/` and link it.

Last updated: 2026‑10‑13 · Gate: **v1.0 (Release candidate, `v1.0.0-rc1`), passed** · Commit: the gate commit tagged
`v1.0.0-rc1`. The code is as at `1eb42c6`: wave 7b `487a152`, the WORKLOG tick `17ad62f`, and the gate's two fixes,
D‑0099 (`c001a94`, the keyboard reticle) and D‑0100 (`1eb42c6`, no source maps in a release bundle). On top of that, the gate commit adds this file, README, WORKLOG, ANDROID_SETUP §9.3, perf-rc1.md's quiet
numbers, docs/reports/tune-rc1.md and the `store/` images regenerated at `17ad62f`. A lead-launched agent drafted it
read-only while the gate ran; the lead completed it from the gate's logs (tmp/gate4/, tmp/gate4b/, tmp/perf-gate4/).
G3 evidence is kept below as §4a, and G2, G1 and G0 evidence as §4b–§4d.

---

## 1. Build identity
- Repository: `github.com/Stephenuffugus/pixelmeba`, branch `main`. Tag **`v1.0.0-rc1`**: the gate commit, on top of
  `1eb42c6` (D‑0100), `c001a94` (D‑0099) and `17ad62f`. Phase 4 landed in 37 commits since `g3` (`git log --oneline g3..17ad62f`); the code commits are
  `9b40210` (wave 5a), `c3f214e` (5b), `ca8c184` (6a), `52e6a27` (6b), `06a25e9` + `ed374ba` (7a) and `487a152` (7b).
- App version: **1.0.0** (`package.json` "version", the one source, D‑0098; `APP_VERSION` '1.0.0' in
  src/persistence/appVersion.ts:7, equal by a test). Android `versionName` 1.0.0, `versionCode` 10000
  (major·10000 + minor·100 + patch, read from package.json by android/app/build.gradle). The RC is only the git tag.
- Runtime: Node 24.21.0 (`.nvmrc` 24), npm 12.1.0, linux x64 (Codespace, 2 vCPU, 7 GB). JDK 21 for Gradle
  (`/usr/local/sdkman/candidates/java/21.0.12+1-ms`), Android SDK at `~/android-sdk` (ANDROID_SETUP §9).
- Dependencies (`git diff g3 HEAD -- package.json`): **no dependency added, removed or re-pinned.** The diff is
  `"version"` 0.0.0 → 1.0.0 and five scripts: `build:demo` (tools/build-demo.ts), `android:build:debug`,
  `android:build:release` (tools/android-build.ts), `android:keystore` (tools/android-keystore.sh) and
  `android:icons` (tools/android-icons.ts). The Capacitor 8 plugins (app, core, filesystem, preferences, share,
  splash-screen, status-bar; android/cli 8.5.2) and `vite-plugin-pwa` 1.3.0 were already pinned before g3; Phase 4
  started using filesystem, share, app and the PWA plugin. Exact pins, `package-lock.json` committed.
- Versions (content/manifest.json): `simulationVersion` 3 · `evolutionRulesVersion` 1 ·
  `moduleRegistryVersion` 2 · `phenotypeMappingVersion` 1 · `contentVersion` 2 · `buildPhase` **4** (D‑0072) ·
  `developmentalEnabled` false. No rules version moved in Phase 4 (D‑0072); the fence (g2-replay and the four
  trajectory-fence files) passed unchanged in every wave.
  - World `SCHEMA_VERSION` **4** (src/sim/world.ts:36; unchanged since G3). Phase 4's player state is the per-dish
    notebook record, a sibling of "state" outside the checksum with its own version and sha256 (D‑0070, D‑0073).
  - `PROTOCOL_VERSION` **2** (src/worker/protocol.ts:31; ENT_STRIDE 14 at :403). Phase 4 added requests and
    messages but no snapshot layout change.
  - Atlas manifest version 1, 856 frames on a 1024×1024 sheet (unchanged since G3). App icons are separate
    (art/src/icons/appIcon.ts → 29 PNGs by `npm run android:icons`; store icons by `npm run store:assets`).
- `contentHash` d3fbd36c4a5e03468389b02508f2a3ecc1ce8d04b25cba5dd5e5be18f184a8bf (content/manifest.json; rewritten by
  `content-validate --write` for buildPhase 3 → 4 and the three phase-4 objectives, D‑0072, D‑0078).
  `npm run content:validate` at the gate (2026‑10‑12 21:55 UTC, at `17ad62f`): `content ok · contentHash d3fbd36c… · species 38
  (enabled 19) · materials 32 · modules 17 · habitats 3 · structures 3 · recipes 18 · experiments 14 · variants 4 · atlas
  public/atlas/manifest.json complete for 19 enabled species and 10 enabled module marks and 4 world tiles (856 frames)`,
  with 47 guide warnings, each a Field Guide rule that names a species not enabled before Phase 5–7.
- Measurement machine for every number below: the Codespace above (AMD EPYC 7763, 2 vCPU = one core with two SMT
  threads; Chromium 153 with SwiftShader software WebGL). **Not a phone.** No Android device or emulator exists here.
  The §7 v1.0 perf numbers are the lead's quiet re-measure (2026‑10‑12 21:57–22:45 UTC at `17ad62f`, alone on the
  machine; 1-minute load 1.7–2.3 for the headless runs and 2.2–6.0 during the web runs, which is the browser's own load).

## 2. Implemented scope
| Phase | Status | Species enabled | Modules enabled | Systems enabled | Missing / known limitations |
|-------|--------|-----------------|-----------------|-----------------|-----------------------------|
| 0 | **Implemented, gate passed** (`g0`) | B01 B04 B06 A01 P01 (data); all 38 species authored and validated | none | core, enzymes | — |
| 1 | **Implemented, gate passed** (`g1`) | B01 B04 B06 A01 P01 | none | core, enzymes | 60 fps not measurable here (software WebGL). Android install on a device not verified (no device). |
| 2 | **Implemented, gate passed** (`g2`) | B01 B04 B06 A01 P01 | E01, E03, E05 | core, enzymes | Five-tester comprehension session is an owner item. |
| 3 | **Implemented, gate passed** (`g3`) | 19: A01 Sunbead, B01 Sprinter, B02 Velvet, B03 Dusk, B04 Recycler, B05 Crossfeeder, B06 Crumbsmith, B07 Oilwick, B08 Brothmaker, F01 Threadlace, F02 Cordweaver, P01 Amoeba, P02 Ciliate, P03 Rotifer, P04 Siltworm, V01 Pinphage, X01 Hitcher, Y01 Bubble, Y02 Creambud | 10: E01 Starch release, E03 Resting stage, E04 Surface anchor, E05 Reserve chamber, E06 Shade collector, E07 Light seeker, E08 Debris feeder, E09 Protein release, E10 Matrix builder, E12 Colony adhesion | chemistry, core, enzymes, film, foodObjects, fungi, parasites, viruses | See the limitations list below this table. |
| 4 | **Implemented, gate passed** (`v1.0.0-rc1`) | the same 19 (no new biology, D‑0072) | the same 10 | the same 8; `buildPhase` 4 enables the three goals | See the Phase 4 limitations below this table. |
| 5–7 | Not started. Later content stays off by `phase > buildPhase` in the manifest; they ship as flag-gated content updates v1.1.0, v1.2.0 and v1.3.0. Transfer preview (P4.8) moved to Phase 5 with the gate structures (D‑0082). | | | | |

Phase 4 as built (P4.1–P4.13; each row's decisions hold the details):
- **P4.1 Favorite families** (`9b40210`; D‑0070, D‑0073, D‑0075): the per-dish notebook record (outside the checksum,
  own version and sha256, dropped whole with a message if bad, 2 MiB cap since D‑0090); 3 followed families,
  outline glyphs, nicknames ≤ 60 characters that leave the device only by opt-in; extinction unpins.
- **P4.2 Story cards** (`c3f214e`; D‑0076, D‑0077, D‑0079): four templates (a first split, an enzyme at work, a family
  changed, a place changed) found by a read-only worker detector; at most one story notice per 600 dish ticks, none in
  a dish's first 600 ticks; one visible notice across all sources; the Notebook tab "Something happened".
- **P4.3 Garden card, session memory, prompts** (`9b40210`; D‑0074): Home's Continue card with a 32×32 thumbnail of
  the saved moment, "Saved for later" lines that never claim births before the visit, one optional prompt at a time.
- **P4.4 Objective engine + 3 goals** (`c3f214e`; D‑0071, D‑0078): five predicate types, evaluated after each tick,
  never steering; off by default; one running goal; the three CT §10.5 goals.
- **P4.5 Paired Garden variants** (`52e6a27`; D‑0088): What if? → "Compare with Garden (180 s)", fixed 1,800-tick
  horizon, sequential on low-memory devices with deep-equal results.
- **P4.6 Share** (`ca8c184`; D‑0080, D‑0083): Picture (1080 × 1080 PNG from a snapshot, no text chunks), Starting
  recipe file (also the P4.8 recipe card; strict build match), Living dish, recipe IDs ("R-G3 / revision 1 / seed
  104729"), "Export without names or notes".
- **P4.7 Try my dish** (`ca8c184`; D‑0081, D‑0082, D‑0084): turns are new dishes cloned from a write-once shelf
  baseline; Keep this result / Another turn / Finish; nothing kept is ever overwritten.
- **P4.8 Observation tools** (`ca8c184`, `52e6a27`; D‑0085, D‑0086, D‑0087, D‑0090): relationship map (session state,
  pool sums armed on first open since D‑0094), region probes A–F, bookmarks (text and snapshot), the specimen gallery,
  the Storage panel, the custom challenge editor. Follow family = P2.3 + P4.1; recipe card = the P4.6 Starting recipe.
- **P4.9 Narration and sound polish** (`52e6a27`; D‑0089): 16 phrase ids through SpeechSynthesis, off by default, each
  with one evidence rule; the UX §7.4 reduced-motion table filled.
- **P4.10 Android** (`06a25e9`, `ed374ba`; D‑0091, D‑0092, D‑0093, D‑0095, D‑0096): a Capacitor Filesystem save store
  with a commit journal on the app (IndexedDB stays the web store); App pause/resume lifecycle; native share sheet for
  every export; icons and splash; build and keystore scripts; a browser interruption harness.
- **P4.11 Web and arcade build** (`487a152`; D‑0097): relative base, iframe-safe host hooks (`pixelmeba:pause` /
  `pixelmeba:resume`), PWA precache with background updates, `DEMO_MODE` (`npm run build:demo`) enforced in the worker.
- **P4.12 Store readiness** (`487a152`; D‑0098): store icon, feature graphic, 18 real-play screenshots, listing text,
  PRIVACY_POLICY.md and its hostable page, data safety and content-rating answers, smoke-test script, version 1.0.0.
- **P4.13 Performance pass 2 and first-minute polish** (`06a25e9`; D‑0094): profile eviction (hash-neutral), the
  relationship map's cost removed until first open, renderer budgets and a degrade ladder, the effective-speed
  badge, opt-in diagnostics, placement ring, first feeding pulse and camera easing. docs/reports/perf-rc1.md.

Phase 4 limitations (the last column of the Phase 4 row):
- **Not measured on a device.** No phone or emulator exists here: install, offline launch, lifecycle, share/import,
  heat, battery, frame rate and touch latency are owner items (§7, §8; PLAY_STORE_CHECKLIST §B6).
- **Performance criteria open on this machine** (§7): 1× tick < 10 ms at 6,000 agents; the heap slope with a save in
  the window; the web worker heap at 4×; touch p95 < 100 ms (SwiftShader). Every remaining large tick gain changes
  results (D‑0066 owner options).
- **Release signing** is owner-only: the AAB built here is unsigned (D‑0091).
- **The arcade deploy plays online** until the owner sends the arcade's manifest/embedding rules; `dist/` served from
  its own folder plays offline after the first load (D‑0097).
- **Transfer preview** is not in v1.0 (no gate structure before Phase 5; D‑0082).
- **Session-only state:** prompt progress (D‑0074), the relationship map's windows and region probes (D‑0082, D‑0085)
  reset on reload.
- The Phase 3 limitations below are unchanged (no rules change in Phase 4).

Phase 4 in the browser (and the app), on top of Phase 3:
- **Home** shows the Continue card with a thumbnail of the saved moment and "Saved for later" (P4.3).
- **The Garden's first minute** is quiet: one arrival line, then optional prompts one at a time; no story notice
  before 600 dish ticks (D‑0079 amendment). An accepted placement draws a growing ring, the first feeding pulse
  starts on its cue, and preset camera moves ease over 220 ms (P4.13).
- **Favorites** (inspector → Follow family): up to three families with outline glyphs and nicknames (P4.1).
- **Notebook**: Something happened (story cards), Favorites, Journal, Bookmarks, Gallery, Experiments (P4.2, P4.8).
- **Goals** (from More): See a Sprinter split, Keep Sprinters going, Watch starch become food; off by default, one sentence when settled (P4.4).
- **What if?** adds "Compare with Garden (180 s)" (P4.5).
- **Share** (More → Share): Picture, Starting recipe, Living dish; recipe IDs on Saved dishes (P4.6).
- **Try my dish** and **challenges**: turns with a horizon, a custom challenge with limits and a budget (P4.7, P4.8).
- **Observe**: relationship map, region probes A–F, snapshot and text bookmarks, specimen gallery (P4.8).
- **Saved dishes → Storage**: sizes and removal of checkpoints and shelf records (P4.8).
- **Settings**: Narration (off by default), "Show performance numbers" (off by default) (P4.9, P4.13).
- **Effective-speed badge** "· running at {x.x}×" when the device cannot keep up; no dish time is skipped (P4.13).
- **Android app**: saves in the app's private files through a commit journal; Home → return says "Paused while
  Pixelmeba was in the background. No dish time passed."; exports through the system share sheet (P4.10).
- **Web**: plays offline after the first load from its own folder; pauses when hidden or when the host frame says so;
  the demo build offers the Garden, its variants, the five Phase 1 organisms and Explore (P4.11).
- **About**: accessibility statement and the privacy line "Saves stay on this device (your phone's own backup may copy
  them)." (P4.12).

Phase 3 limitations (the last column of the Phase 3 row):
- EXP_104 reaches its gate at 1 s on HIDDEN_NEIGHBORHOOD_V1 revision 2 (starting oxygen 0.03, D‑0068; revision 1 never did, D‑0062). Owner review: the oxygen-limited moment lasts only the first ~10 s.
- Producers starve in the enzyme dishes. This is the open owner question of D‑0022 and D‑0051, and it is new in curated L303.
- Device performance is unmeasured (§7).
- Owner items are listed in §8.

Phase 3 content in the shipped manifest (beyond Phase 2):
- **Materials (27 enabled):** ACID, BASE, BUFFER, CO2, DEBRIS, GEL, INH_BACT, INH_FUNG, INH_PHOTO, M01 broth, M03–M05 enzymes,
  M09 breaker, M10 slow feeder pellet, M11 leaf wafer, METABOLITE, NUTRIENT, OIL, OXYGEN, PROTEIN, SALT, SEDIMENT, SHADE,
  STARCH, SUGAR, WATER.
- **Habitats (3):** Water Garden, Gel Colony, Sediment Edge.
- **Structures (3):** stone, wall, bead.
- **Tools (10 records, enabled by `phase ≤ buildPhase`, D‑0061):** Inspect, Overlays, Snapshot and Undo (phase 1);
  Compare, Duplicate dish and Erase structure (phase 2); **Sample, Transfer and Clean water** (phase 3).
- **Recipes (18):** the 7 of G2, plus
  - SHARED_LUNCH, OIL_NEIGHBORHOOD, PROTEIN_CHAIN and BROKEN_CATALYST (EXP_201–204);
  - HIDDEN_NEIGHBORHOOD, ONE_HOST and FUNGAL_SUPPLY_LINE (EXP_104, EXP_105, EXP_212);
  - the curated L301 Two Lunches, L303 Public Kitchen, L304 Empty After the Feast and L306 Borrowed Shelter.
- **Experiment cards (14):** EXP_A/B/C, EXP_101–106, EXP_201–204 and EXP_212.
- **Variants:** R‑G0…R‑G3 (4).

Phase 3 in the browser, on top of Phase 2:
- **Chemistry and environment (P3.1):** pH, salt, oxygen, CO2 exchange, inhibitors and shade, with the chemistry tray
  and overlays (D‑0044).
- **Habitats (P3.2):** Gel Colony and Sediment Edge presets; attachment; New Dish start choices (D‑0044, D‑0030).
- **Organism waves A and B (P3.3/P3.4):**
  - Velvet biofilm and Threadlace branching (D‑0047);
  - Dusk, Crossfeeder, Bubble, the hunters P02–P04 and the Siltworm crossing (D‑0048);
  - Hitcher drain and Pinphage doses with lysis (D‑0049);
  - truthful rendering of all of it (protocol 2, D‑0050).
- **Sample / Transfer / Clean water (P3.5):** a held, exact, undoable transaction; Cancel restores the hash (D‑0037, D‑0054).
- **Living chemistry (P3.6):**
  - Crumbsmith, Oilwick and Brothmaker enzymes;
  - the reaction ledger with "Made here by", and the food-access overlay (D‑0051);
  - Cordweaver transport links (D‑0052);
  - pellets and wafers as finite food objects (D‑0053).
- **Modules (P3.7):** E04, E06–E10 and E12 with the final stage 8 order (D‑0055…D‑0058), enabled under
  moduleRegistryVersion 2. Old saves keep registry 1 (D‑0059).
- **Field Guide, relationships seen, badges (P3.8):** D‑0061.
- **Experiments and curated dishes (P3.9):** D‑0062, docs/reports/experiments-g3.md.
- **Audio (P3.10):** synthesized SoundKit, rate-limited world cues, ambient loop, settings and optional web haptics (D‑0064).
- **Accessibility pass 1 (P3.11):** keyboard map and dish reticle, visible focus, live region, canvas summary,
  simplified overlay palette, 200 % reflow, and the contrast audit (docs/reports/contrast.md;
  docs/reports/reviews/g3-wave-4b/a11y-build.md). D‑0065; its three open MINORs were fixed before the gate (`35d12c3`).
- **Performance pass 1 (P3.12):** hash-neutral hot-path edits halve the 6,000-agent tick (CPU p50 38.5 → 18.8 ms on the shared
  machine; 12.0 ms in the quiet gate re-measure). The < 10 ms gate is not met on this machine (§7). A stress tool
  (`tools/perf-stress.ts`), a render bench for the Phase 3 scene and docs/reports/perf-g3.md were added. D‑0066; committed in `d3a3027`.

Content catalog (all phases, validated):

| Collection | Total | Enabled |
|---|---:|---:|
| Species | 38 | 19 |
| Modules | 17 | 10 |
| Materials | 32 | 27 |
| Habitats | 3 | 3 |
| Structures | 3 | 3 |
| Tools | 10 | 10 |
| Recipes | 18 | — |
| Experiment cards | 14 | — |
| Variants | 4 | — |
| Objectives (goals, new in Phase 4) | 3 | 3 (phase 4) |

## 3. Resolved specification
- Canonical docs: BUILD_DIRECTIVE, PIXELMEBA_IMPLEMENTATION_SPEC, CONTENT_TABLES, ARCHITECTURE,
  UX_SPEC, CONFLICT_REGISTER (R01–R40 applied where relevant).
- G0 decisions: D‑0001…D‑0010.
- G1 decisions: D‑0011…D‑0018.
- G2 decisions: D‑0019…D‑0034, D‑0040 and D‑0041 (listed in the G2 edition of this file, git history).
- G3 decisions:
  - D‑0035 world schema 4 keeps old saves' hashes; D‑0036 buildPhase 3 / contentVersion 2;
  - D‑0037 Sample Cancel is host-level and exact; D‑0038 film is eaten as detritus; D‑0039 tool texts as content;
  - D‑0042 the determinism fence (gates.ts, trajectory digest, g2 saves, g2-replay, trajectory fence);
  - D‑0043 links as entity columns (schema 4 as built); D‑0044 chemistry and habitats; D‑0045 the stage 8 reservation framework;
  - D‑0046 organism art for the 14 Phase 3 species;
  - D‑0047…D‑0050 organism waves A/B, Hitcher and Pinphage, truthful Phase 3 rendering, stale prey links in saves;
  - D‑0051 enzymes, reaction ledger, food access and EXP_201–204; D‑0052 Cordweaver transport; D‑0053 food objects;
  - D‑0054 Sample/Transfer/Discard/Clean water;
  - D‑0055 E04 and E07; D‑0056 E06 and E08; D‑0057 E09, E10 and the final stage 8 order; D‑0058 E12 and stricter module import checks;
  - D‑0059 the module flip (moduleRegistryVersion 2); D‑0060 roundoff-negative field cells load;
  - D‑0061 Field Guide, tools pack, relationships seen and badges; D‑0062 EXP_104/105/212 and curated dishes;
  - D‑0063 gate fixtures; D‑0064 audio;
  - D‑0065 accessibility pass 1; D‑0066 performance pass 1 (criteria open); D‑0067 gate evidence choices;
  - D‑0068 EXP_104 on HIDDEN_NEIGHBORHOOD_V1 revision 2 (starting oxygen 0.03); D‑0069 fixes from the gate's e2e run.
- v1.0 (Phase 4) decisions:
  - lead calls before wave 5: D‑0070 notebook state is not world state; D‑0071 objectives are evaluated, never
    enforced; D‑0072 no new sim rules in Phase 4, buildPhase 3 → 4;
  - wave 5: D‑0073 favorites and the notebook record; D‑0074 Garden card, session memory, prompts; D‑0075 a duplicated
    dish shares no worker state; D‑0076 the two cards in the notice place; D‑0077 story cards; D‑0078 the objective
    engine and goals; D‑0079 notification pacing per source, one visible notice (amended: the quiet first minute);
  - wave 6: D‑0080 the share picture from a snapshot; D‑0081 Try my dish clones, never mutates; D‑0082 wave 6 scope
    (the shelf, transfer preview to Phase 5); D‑0083 Share; D‑0084 Try my dish; D‑0085 relationship map and region
    probes; D‑0086 bookmarks, gallery, Storage; D‑0087 the challenge editor; D‑0088 paired Garden variants; D‑0089
    narration, sound polish, reduced-motion audit; D‑0090 notebook cap 2 MiB, challenge-owned starting points;
  - wave 7: D‑0091 Android is a debug build with documented steps; D‑0092 Filesystem saves on the native app
    (supersedes D‑0013 there; IndexedDB stays the web store); D‑0093 Android as built; D‑0094 performance pass 2 and
    first-minute polish; D‑0095 and D‑0096 wave 7a integration (a full phone, a damaged slot file, a frozen app, a
    cancelled export is not an export); D‑0097 web and arcade build; D‑0098 store readiness;
  - at the gate: D‑0099 a key that closes the inspector undoes its reveal pan, so the keyboard reticle stays on the
    dish (the gate's one e2e failure, phone-portrait); D‑0100 a release bundle carries no source maps (they were 39 %
    of the AAB; the debug build and dist/ keep them).
- Remaining conflicts: none open in CONFLICT_REGISTER. D‑0092 departs from D‑0013 for the native app only, as the
  canonical rule (BUILD_DIRECTIVE P4.10, ARCH §11.1/§12, R27) asks. D‑0098's 9:16 tablet screenshots depart from
  ARCH §15's sizes, following Play's current guidance (owner flag, §8). Owner questions: §8.

## 4. Correctness evidence (v1.0)

The lead ran the gate on a quiet machine after the last Phase 4 commit (`17ad62f` tree, 2026‑10‑12 21:33 – 10‑13
02:59 UTC; tools in tmp/lead/gate4.sh, logs in tmp/gate4/). The order was store:assets on the clean commit,
content:validate, the fixture batch, the quiet perf re-measure, then the full three-project e2e. That run's one e2e
failure was a keyboard defect, fixed as D‑0099 in `c001a94`. The lead then ran `npm run check`, keyboard.spec.ts on
the three projects, the art check, both web builds, both Android builds and `npm run sim:tune` on that commit (logs
in tmp/gate4b/). The release AAB turned out to be 39 % source maps. D‑0100 (`1eb42c6`) drops them from release builds;
`npm run check` ran again on that commit, and the AAB was rebuilt. Each result cell below names the commit it ran at.

Gate-wide commands (lead, 2026‑10‑12 21:33 UTC – 2026‑10‑13 10:36 UTC):
```
npm run check            → typecheck ok · lint ok · 216 files, 2088/2088 tests passed (vitest 4566 s under load; 05:45–07:04 UTC;
                           tree of 1eb42c6). Before D-0100: 215 files, 2086/2086 (vitest 3192 s; 04:31–05:26 UTC; tree of c001a94)
npx playwright test      → 359 passed, 1 failed (4.2 h) at 17ad62f: phone-portrait 119/120, phone-landscape 120/120,
                           desktop 120/120; 0 flaky. The failure (keyboard.spec.ts:174, phone-portrait) fixed by D-0099
                           (c001a94) → npx playwright test tests/e2e/keyboard.spec.ts: 6 passed (10.4 min), all three projects
npm run content:validate → ok · contentHash d3fbd36c… · atlas complete (856 frames) · guide warnings 47 (at 17ad62f)
npm run art:build --check → atlas up to date · 856 frames (80 feature-mark, 13 world-tile) · 1024×1024 · 99ab54adef36 (at c001a94)
npm run build            → dist/ at c001a94: 28 files, 2,810,194 bytes without source maps (45 files, 12,262,633 bytes
                           with them); PWA v1.3.0 precache 26 entries (2726.93 KiB)
npm run build:demo       → dist-demo/ at c001a94 (typecheck, then vite build): 28 files, 2,807,802 bytes without source maps;
                           PWA precache 26 entries (2724.60 KiB)
npm run store:assets     → EXIT 0 at 17ad62f (21:33–21:55 UTC); store/screenshots/manifest.json buildCommit "17ad62f" on all 19 entries
```

Latest runs before the gate (commit messages; not gate evidence): `487a152` npm run check 215 files / 2,079 tests
passed (3,249 s), desktop e2e 29/29 (full-journey, about, first-minute, save-reload, whatif, lab-tools, experiments,
share, keyboard, garden-home; 34.3 min), web-arcade (c) desktop + phone-portrait 2/2; `ed374ba` check 208 files /
2,027 tests, desktop e2e batch 2 52/53 with the one failure (whatif:237 off screen under load) rerun green,
android-storage phone-portrait 2/2.

| v1.0 gate row | Files | Result |
|---|---|---|
| `npm run check` (typecheck + lint + every vitest file) | tsconfig.json, eslint.config.js, tests/**/*.test.ts | **Passed** at the gate: typecheck ok · lint ok · **216 files, 2,088/2,088 tests** (vitest 4,566 s under the tune and store-asset runs' load; 2026‑10‑13 05:45–07:04 UTC, on the tree committed as `1eb42c6`). Before D‑0100: 215 files, 2,086/2,086 (04:31–05:26 UTC, tree of `c001a94`). The per-file counts in the rows below are from the `c001a94` run; the second run differs only by tests/tools/android-build.test.ts (2). |
| Full e2e on three projects (phone 360×800, phone 800×360, desktop 1440×900) | tests/e2e/*.spec.ts (43 spec files); playwright.config.ts projects phone-portrait, phone-landscape, desktop | **359 passed, 1 failed of 360** at `17ad62f` (4.2 h; 2026‑10‑12 22:45 – 10‑13 02:59 UTC): phone-portrait 119/120, phone-landscape 120/120, desktop 120/120; 0 flaky. The failure, keyboard.spec.ts:174 on phone-portrait (3/3 on rerun), was a keyboard defect: D‑0099, fixed in `c001a94`; then **keyboard.spec.ts 6/6** on the three projects with the final code (10.4 min). The fix changes only what happens when a key closes the inspector; no other spec opens the inspector and presses Escape, so the other results stand. |
| `npm run content:validate` | tools/content-validate; tests/content/validator.test.ts, objectives.test.ts | **ok** at `17ad62f` (§1 line: contentHash d3fbd36c…, 856 frames, 47 guide warnings); content/ is unchanged in `c001a94`. validator.test.ts 8 and objectives.test.ts 4 passed in the gate check. |
| All prior fixtures (G0–G3) | tests/fixtures/*.test.ts (46 files: neutral-founders, conservation-closed-lid, determinism, no-free-growth, fair-shared-food, deterministic-state, blocked-division-proposal, finite-feeding, enzyme-source, inherited-variation, predation, photosynthesis, module-accounting, registry-imports, branch-evidence, host-specificity, transport-obstacles, conservation-all-pools, relationship-matrix, module-e04…e12, shared-budget, …); tests/experiments/*.test.ts; tests/recipes/*.test.ts | **Passed** in the gate check: tests/fixtures 46 files / 467 tests, tests/experiments 17 / 115, tests/recipes 2 / 38. The lead's batch at `17ad62f` (deterministic-state, conservation-closed-lid, determinism, demo-scope): 4 files, 22 tests passed (128 s). |
| Determinism 1× / 4× / reload | tests/fixtures/determinism.test.ts (G0 headless), deterministic-state.test.ts (G1 host + save), determinism-g3.test.ts (4× host, 1× replay, headless 1- and 4-tick, reload with a sample held), g2-replay.test.ts, trajectory-fence{,-arms,-current,-current-arms}.test.ts | **Passed** (8 files, 71 tests: determinism 4, deterministic-state 7, determinism-g3 9, g2-replay 9, trajectory-fence 9, -arms 7, -current 20, -current-arms 6). determinism-g3: `450c846c6503adf2` at 1× (host replay) == 4× host == headless 1-tick and 4-tick chunks == reload with a sample held at tick 402. G0 determinism: save at 3,000 → reload → 6,000 equals the uninterrupted run (`4d07ff042ff1e984`, 659 alive); deterministic-state 4× → tick 320 `c591328f2733fddc`. The fence (g2-replay and the four trajectory-fence files) passed with no digest moved. |
| Conservation | tests/fixtures/conservation-closed-lid.test.ts (10,000 ticks, closed lid), conservation-all-pools.test.ts (every Phase 3 pool acting) | **Passed** (2 files, 1 test each). All pools, closed lid, 10,000 ticks: worst relative error C 6.13e‑15, N 7.05e‑14, M 0 (every mechanism acting: film, fungi, parasites, phage, enzymes, objects, modules). Closed lid with B01, B04, B06, A01, P01: C 5.220e‑15, N 1.080e‑13, M 0. Both equal to G3's. |
| Favorites never alter behaviour | tests/worker/favorites-host.test.ts; tests/persistence/notebook.test.ts; tests/ui/favorites.test.ts; e2e favorites.spec.ts | **Passed**: favorites-host 8, notebook 24, favorites (ui) 12; e2e favorites.spec.ts 2/2 on each of phone-portrait, phone-landscape and desktop. |
| Stories | tests/worker/stories-host.test.ts (detector on/off equal hash and trajectory digest); tests/ui/stories.test.ts, notices.test.ts, notice-cards.test.ts, discovery-pacer.test.ts; e2e stories.spec.ts | **Passed**: stories-host 10, stories 20, notices 12, notice-cards 12, discovery-pacer 14; e2e stories.spec.ts 1/1 on each of phone-portrait, phone-landscape and desktop. |
| Objectives | tests/sim/objectives.test.ts; tests/worker/goals-host.test.ts (equal hash with a running goal; blocked proposals never count); tests/content/objectives.test.ts; tests/ui/goal-sentence.test.ts; e2e goals.spec.ts | **Passed**: objectives (sim) 19, goals-host 15, objectives (content) 4, goal-sentence 2; e2e goals.spec.ts 1/1 on each of phone-portrait, phone-landscape and desktop. |
| Share | tests/persistence/share.test.ts, strip-names.test.ts; tests/render/picture.test.ts; tests/ui/share.test.ts; tests/platform/native-share.test.ts; e2e share.spec.ts | **Passed**: share 10, strip-names 1, picture 7, share (ui) 9, native-share 6; e2e share.spec.ts 6/6 on each of phone-portrait, phone-landscape and desktop. |
| Variants paired | tests/fixtures/variants-paired.test.ts (sequential == paired for R-G1…R-G3); tests/worker/variants-paired-host.test.ts; tests/recipes/variants.test.ts; e2e variants-paired.spec.ts | **Passed**: variants-paired 9, variants-paired-host 5, variants 29; e2e variants-paired.spec.ts 2/2 on each of phone-portrait, phone-landscape and desktop. |
| View switch | tests/sim/view-switch.test.ts (switches send no command; equal hash while running; an interrupted stroke commits nothing) | **Passed**: view-switch 14. |
| One-gesture accounting | tests/sim/view-switch.test.ts "a completed Lab stroke is exactly one command"; tests/sim/lab-commands.test.ts ("one gesture = one command"); tests/fixtures/deterministic-state.test.ts; e2e place-and-undo.spec.ts ("one tap places one dose", "a two-finger gesture never paints"), lab-tools.spec.ts (Undo rewinds one gesture) | **Passed**: view-switch 14, lab-commands 42, deterministic-state 7; e2e place-and-undo.spec.ts 3/3 and lab-tools.spec.ts 4/4 on each of phone-portrait, phone-landscape and desktop. |
| Try my dish, challenges, observation tools | tests/persistence/shelf.test.ts, bookmarks.test.ts, challenge-export.test.ts; tests/worker/try-dish-host.test.ts, challenge-host.test.ts, bookmarks-host.test.ts, relationship-map.test.ts, relationship-map-cost.test.ts, probes.test.ts, duplicate-sharing.test.ts; tests/ui/try-dish.test.ts, challenge.test.ts, gallery.test.ts, storage.test.ts, observe.test.ts; e2e try-dish, challenge, bookmarks-gallery, observe-tools | **Passed**: 15 files, 108 tests; e2e try-dish, challenge, bookmarks-gallery and observe-tools 1/1 each on each of phone-portrait, phone-landscape and desktop. |
| Narration and reduced motion | tests/audio/narration.test.ts; tests/ui/narration-evidence.test.ts, narration-wiring.test.ts; tests/render/reduced-motion.test.ts; e2e narration.spec.ts | **Passed**: narration 15, narration-evidence 19, narration-wiring 3, reduced-motion 16; e2e narration.spec.ts 3/3 on each of phone-portrait, phone-landscape and desktop. |
| Demo scope | tests/fixtures/demo-scope.test.ts; tests/worker/demo-host.test.ts (out-of-scope Add Life and compareStart refused); e2e web-arcade.spec.ts (c) | **Passed**: demo-scope 10 (also in the lead's batch at `17ad62f`), demo-host 12; e2e web-arcade.spec.ts (c) on each of phone-portrait, phone-landscape and desktop. |
| Web and arcade build | tests/platform/sw-register.test.ts, iframe-safe.test.ts; e2e web-arcade.spec.ts (a) subpath offline after first load, (b) iframe pause/resume, (d) deploy-arcade preconditions | **Passed**: sw-register 11, iframe-safe 4; e2e web-arcade.spec.ts 4/4 on each of phone-portrait, phone-landscape and desktop. `npm run build` and `npm run build:demo` at `c001a94`: the gate-wide commands above. |
| Full journey (Home → Garden → feed → inspect → pause → undo → save → reload → What if? → compare → share) | tests/e2e/full-journey.spec.ts (equal worker hash after Undo and after reload; axe at six checkpoints) | **Passed** 1/1 on phone-portrait, phone-landscape and desktop at `17ad62f`. |
| axe clean | tests/e2e/a11y-screens.spec.ts (incl. the "wave 7a" screens) and the axe checks inside full-journey, favorites, goals, bookmarks-gallery, challenge, try-dish, narration, about, whatif, garden and others (27 e2e spec files use axe) | **No serious or critical violation**: a11y-screens.spec.ts 10/10 on each project, and every other spec with an axe check passed on all three at `17ad62f`. |
| Performance report | docs/reports/perf-rc1.md; tests/perf/stress-shape.test.ts, tests/sim/profile-eviction.test.ts, tests/worker/perf-counters.test.ts, tests/render/budgets.test.ts, camera-easing.test.ts, feeding-pulse.test.ts; tests/ui/speed-badge.test.ts, diagnostics.test.ts | §7. Quiet re-measure done at `17ad62f` (perf-rc1.md "Gate re-measure, quiet"); 8 files, 32 tests passed (stress-shape 1, profile-eviction 3, perf-counters 4, budgets 4, camera-easing 9, feeding-pulse 3, speed-badge 5, diagnostics 3). |
| Saves and the Android store | tests/persistence/capacitor-fs.test.ts (crash-point enumeration), persistence.test.ts, migration.test.ts, checkpoints.test.ts; tests/platform/fs-bridge.test.ts, lifecycle.test.ts; e2e android-storage.spec.ts (browser interruption harness, desktop + phone-portrait) | **Passed**: capacitor-fs 46, persistence 11, migration 6, checkpoints 13, fs-bridge 5, lifecycle 7. e2e android-storage.spec.ts 2/2 on each project: one save = 12 file operations on the phones and 13 on desktop, commit point at operation 7; cuts k = 0…7 opened the old moment and every later cut the new one. |
| Android build | `npm run android:build:debug`, `npm run android:build:release`; tests/tools/version-scheme.test.ts, android-icons.test.ts, android-keystore.test.ts | Debug APK built twice: ANDROID_SETUP §9.1 (7a, before integration: 8,568,278 bytes, versionCode 1) and §9.2 (2026‑10‑12 18:26 UTC, 7b tree: **8,246,560 bytes**, sha256 `67c00bf4…0ff0dd`, `versionCode='10000' versionName='1.0.0'`, targetSdk 36, permissions INTERNET, VIBRATE). Unsigned AAB: §9.1 (6,233,377 bytes, versionCode 1). **At the gate (ANDROID_SETUP §9.3):** at `c001a94`, the debug APK was **9,828,992 bytes** (`versionCode='10000' versionName='1.0.0'`, targetSdk 36, INTERNET, VIBRATE) and the unsigned AAB 6,260,412 bytes, 39 % of it the web build's source maps. D‑0100 drops them from release builds; the AAB rebuilt at `1eb42c6` is **3,808,774 bytes** with 0 maps, `jar is unsigned.`, and `bundletool dump manifest` reads versionCode 10000, versionName 1.0.0, minSdk 24, targetSdk 36. tests/tools/android-build.test.ts 2, version-scheme 3, android-icons 5, android-keystore 3 passed in the gate check. **Device items (install, offline launch, lifecycle, share/import, smoke test) are owner items: no device here.** |
| Store assets | store/: icon-512.png, icon-foreground-512.png, icon-background-512.png, feature-1024x500.png (+ feature-source-picture.png), screenshots/{phone,tablet7,tablet10}/01-living-dish … 06-experiment.png (18), screenshots/manifest.json, listing.md, release-notes-1.0.0.md, privacy-policy.html, data-safety.md, content-rating.md, smoke-test.md; PRIVACY_POLICY.md; tests/tools/store-assets.test.ts, listing.test.ts; e2e about.spec.ts | Present at `17ad62f`. The manifest.json committed at 7b names `buildCommit` "33a2a62+dirty" on all 19 entries (generated 2026‑10‑12 19:07 UTC), so the gate regenerated them on the clean commit. `npm run store:assets` at `17ad62f` (2026‑10‑12 21:33–21:55 UTC): EXIT 0. It wrote the icons, the feature graphic (tick 1,318, stateHash `45c220766dca33b3`) and the 18 screenshots; manifest.json now names `buildCommit` **"17ad62f"** on all 19 entries. store-assets 8 and listing 4 tests passed in the gate check; e2e about.spec.ts 2/2 on each project. A second run at `c001a94`, from a clean worktree under the check's load (2026‑10‑13 05:58–06:28 UTC, EXIT 0), reproduced the three 05 shots' stateHash `ee073c6c27155294` at tick 6,000 exactly. Its other captures paused later because the pause follows the clock under load (feature graphic at tick 1,359 instead of 1,318). The quiet `17ad62f` set ships; the app code differs only by D‑0099 and D‑0100, which no capture exercises. |
| D9 §12 usability gates | PLAY_STORE_CHECKLIST §B9 | **Owner tasks, not run** (§8). Gate 5 (technical integrity) is the test suite above. |

**Determinism (Appendix A line):** `450c846c6503adf2` (1×, host replay) == `450c846c6503adf2` (4× host) ==
`450c846c6503adf2` (reload with a sample held at tick 402) == headless 1-tick and 4-tick chunks (determinism-g3 in the
gate check); deterministic-state 4× → tick 320 `c591328f2733fddc`; G0 save/reload at 3,000 → 6,000 `4d07ff042ff1e984`. The G3
values in §4a were taken under contentHash f276b113…; the stateHash covers the contentHash and buildPhase, so the
numbers move with D‑0072's manifest bump while the fence digests (biology) do not.

**Conservation (Appendix A line):** all pools, 10,000 ticks: C 6.13e‑15 (6.1e‑13 %), N 7.05e‑14 (7.1e‑12 %), M 0; closed lid
C 5.220e‑15 (5.2e‑13 %), N 1.080e‑13 (1.1e‑11 %), M 0 (equal to G3).

**Appendix A gate message** (as committed with tag `v1.0.0-rc1`):
```
gate(v1.0): Phase 4 — wonder, replay, Android — release candidate evidence and tag v1.0.0-rc1

gate: v1.0 (v1.0.0-rc1)
check: npm run check → typecheck ok · lint ok · 216 test files, 2088/2088 passed (vitest 4566 s under load; tree of 1eb42c6)
e2e: npx playwright test → 359 passed, 1 failed (4.2 h; phone 360×800 119/120, phone 800×360 120/120, desktop 1440×900 120/120; 0 flaky) at 17ad62f; the failure (keyboard.spec.ts:174, phone-portrait) fixed by D-0099 in c001a94 → keyboard.spec.ts 6/6 on all three projects
content: npm run content:validate → ok (contentHash d3fbd36c4a5e03468389b02508f2a3ecc1ce8d04b25cba5dd5e5be18f184a8bf; atlas complete, 856 frames; 47 guide warnings, all naming species enabled after Phase 4)
tune: npm run sim:tune → docs/reports/tune-rc1.md (18 recipes × 6 seeds at c001a94; every table equals tune-g3.md's with hashes and wall-clock columns masked: no simulated outcome changed in Phase 4, D-0072)
perf: tick CPU p50 11.10 / p95 20.30 / p99 39.38 ms @ 6,000 agents (2,000 fungal) on the 2-vCPU Codespace, quiet (tools/perf-stress.ts, 9,000 ticks; docs/reports/perf-rc1.md "Gate re-measure"); < 10 ms not met (D-0066, D-0094, owner item 37)
determinism: 450c846c6503adf2 (1x) == 450c846c6503adf2 (4x) == 450c846c6503adf2 (reload, sample held at tick 402) == headless 1-tick and 4-tick chunks
conservation: C err 6.1e-13 %, N err 7.1e-12 %, M 0 (all pools, 10,000 ticks); closed lid C 5.2e-13 %, N 1.1e-11 %
open owner decisions: 41 (see EXPANSION_RESPONSE §8)

v1.0 gate rows (BUILD_DIRECTIVE): every prior fixture (tests/fixtures 46 files / 467 tests, experiments 17 / 115,
recipes 2 / 38) and favorites, stories, objectives, share, variants-paired, view-switch, one-gesture accounting and
demo scope inside npm run check; the full journey e2e 1/1 on each project; axe clean (a11y-screens 10/10 per project
and every axe step elsewhere); perf report (quiet re-measure, perf-rc1.md); Android: the debug APK (versionCode
10000) and the unsigned release AAB built here, the AAB without source maps after D-0100 (3,808,774 bytes at
1eb42c6; ANDROID_SETUP §9.3), no device (owner items); store assets regenerated on the clean commit 17ad62f
(manifest buildCommit "17ad62f" × 19; a rerun at c001a94 reproduced the tick-6,000 stateHash). D9 §12 usability
gates are owner tasks (EXPANSION_RESPONSE §8, PLAY_STORE_CHECKLIST §B9).

Builds: art:build --check up to date (856 frames, 99ab54adef36); npm run build → dist/ 28 files, 2.81 MB without
source maps, precache 26 entries; npm run build:demo → dist-demo/ 28 files, precache 26 entries (both at c001a94).

Path to the gate this session: the gate run (tmp/lead/gate4.sh, 2026-10-12 21:33 – 10-13 02:59 UTC, alone on the
machine) → one phone-portrait keyboard failure → D-0099 (c001a94; reviewed by wf_d7cf7aeb-5d1, ok, its MINOR fixed)
→ npm run check → builds, Android, sim:tune at c001a94 → the release AAB carried 39 % source maps → D-0100 (1eb42c6)
→ npm run check → AAB rebuilt → this commit: EXPANSION_RESPONSE §1–§8 filled from the logs, README, WORKLOG P4.14,
ANDROID_SETUP §9.3, perf-rc1.md, tune-rc1.md and the store/ images, plus checklist wording.
```

## 4a. Correctness evidence (G3, kept)

Every row below was run by the g3-evidence builder in this session as targeted vitest batches (or a single
desktop Playwright journey) on the shared 2-CPU machine. Wall times are inflated by the other stage 2
agents: the 1-minute load was 2.5–7.4 throughout. The lead runs `npm run check`, all three e2e projects and
`content:validate` at the gate.

Gate-wide commands (lead, 2026‑10‑10):
```
npm run check            → typecheck ok · lint ok · 154 files, 1542 tests passed (1818 s; tree of 0527977 = code of 1eb3025)
npx playwright test      → 258 passed (3.0 h) at 1eb3025, alone on the machine: phone-portrait 86, phone-landscape 86,
                           desktop 86; 0 failed, 0 flaky (incl. launch-ecology, lab-tools, keyboard, a11y-screens)
npm run content:validate → ok · contentHash f276b113… · atlas complete for 19 species, 10 module marks, 4 world tiles (856 frames)
npm run art:build --check → atlas up to date · 856 frames (80 feature-mark, 13 world-tile) · 1024×1024 · 99ab54adef36
```

The first full run (16:51 UTC, at 35d12c3) ran pre-fix test code and was stopped at 125 of 258: 115 passed, 9 failed,
1 interrupted. Every spec added since g2 had run on desktop only. All nine failures were phone layouts or desktop-only test
assumptions; D‑0069 records the five product fixes (Field Guide reflow at 200 %, the sample panel on phones in portrait and
landscape, tap timing by event timestamps, viral species out of the dish summary) and the six spec fixes. Each fixed spec
re-ran green on phone-portrait before the clean run above.

**Appendix A gate message** (as committed with tag `g3`):
```
gate: g3
check: npm run check → typecheck ok · lint ok · 154 test files, 1542/1542 passed (1818 s)
e2e: npx playwright test → 258 passed (3.0 h; phone 360×800, phone 800×360, desktop 1440×900; 86 each) at 1eb3025
content: npm run content:validate → ok (contentHash f276b113906cc8db696f162ce43496df826b3a05cc5867b918d0b8515678dc24; atlas complete, 856 frames; 47 guide warnings, §8 item 19)
tune: npm run sim:tune -- --recipes <all 18> --seconds 600 --extend 1200 --presets standard → docs/reports/tune-g3.md (regenerated at 35d12c3; FIRST_DISH_V1 kept, D-0067; EXP_104 rev 2, D-0068)
perf: tick CPU p50 12.0 / p95 20.8 / p99 39.8 ms @ 6,000 agents (2,000 fungal) on AMD EPYC 7763 2 vCPU, quiet (perf-stress 9,000 ticks); < 10 ms not met (D-0066)
determinism: 6148ff0d080999c4 (1x) == 6148ff0d080999c4 (4x) == 6148ff0d080999c4 (reload, sample held at tick 402) == headless 1-tick and 4-tick chunks   [determinism-g3 at the gate tree]
conservation: C err 6.1e-13 %, N err 7.1e-12 %, M 0 (all pools, 10,000 ticks); closed lid C 5.2e-13 %, N 1.1e-11 %
open owner decisions: 28 (see EXPANSION_RESPONSE §8)
```

**Batches run by the g3-evidence builder for the draft** (each line is the vitest summary for the files named in the table below):
```
# b1 determinism, fence, saves (13 files)
npx vitest run tests/fixtures/determinism.test.ts tests/fixtures/deterministic-state.test.ts tests/fixtures/g2-replay.test.ts \
  tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/persistence/migration.test.ts \
  tests/sim/history-debris.test.ts tests/sim/world-stores.test.ts tests/persistence/adhesion-import.test.ts tests/persistence/stale-prey.test.ts
  → Test Files 13 passed (13) · Tests 98 passed (98) · 959 s
# b2 G3 gate fixtures
npx vitest run tests/fixtures/{host-specificity,transport-obstacles,conservation-all-pools,relationship-matrix}.test.ts
  → 4 files · 28 tests passed, 0 failed · 207 s
# b3 module fixtures
npx vitest run tests/fixtures/{module-accounting,shared-budget,module-e04,module-e06,module-e07,module-e08,module-e09-e10,module-e12}.test.ts tests/sim/stage8-order.test.ts
  → 9 files · 113 tests passed, 0 failed · 141 s
# b4 experiments and curated dishes
npx vitest run tests/experiments tests/recipes/curated.test.ts
  → 18 files · 124 tests passed, 0 failed · 772 s
# b5 P3.1–P3.12 task tests (28 files; list in the rows below)
  → 28 files · 275 tests passed, 0 failed · 599 s
# b6 verbose re-run for the Appendix A values (after perf's in-flight edits)
npx vitest run tests/fixtures/determinism-g3.test.ts tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts
  → 3 files · 14 tests passed, 0 failed · 295 s
# determinism-g3 alone (first run of this session)
npx vitest run tests/fixtures/determinism-g3.test.ts → Test Files 1 passed (1) · Tests 9 passed (9) · 102 s
# e2e, desktop only (own journey)
E2E_PORT=4263 E2E_OUTDIR=tmp/dist-evidence npx playwright test tests/e2e/launch-ecology.spec.ts --project=desktop
  → 1 passed (12.2m)
# relationship table
npx tsx tools/relationship-matrix.ts --out tmp/ev/relationships-g3.md → 711 rows, 711 pass, 0 fail (21.8 s)
# lint and types (owned files)
npx eslint tests/fixtures/determinism-g3.test.ts tests/e2e/launch-ecology.spec.ts → exit 0
npx tsc -p tsconfig.json --noEmit → exit 0 (16.7 s), after fixing one error in this builder's own determinism-g3.test.ts
  (buildSaveFile meta lacked `recipeId: null`); determinism-g3 re-run after that fix → 9 passed (55 s)
```

| G3 gate row | Files | Result |
|---|---|---|
| host-specificity | tests/fixtures/host-specificity.test.ts | **pass**, 3 tests, 12.9 s (b2). Tests: a dense dish of every enabled species with 5 Pinphage units per cell infects only Sprinters over 600 ticks. A Hitcher touching every other species attaches only to a Sunbead. With no host, units only decay (1 %/s into detritus) and the ledger closes. |
| transport-obstacles | tests/fixtures/transport-obstacles.test.ts | **pass**, 9 tests, 42.5 s (b2). Tests: sugar pulse: the sum stays constant to 1e‑12, the maximum never rises, and nothing goes negative. Wall and stone rings isolate the dissolved, activity and viral fields and every organism for 1,000 ticks (1,599 moves, 32 births, 6 infections inside). A porous bead ring passes the fields but no swimmer. The film flux out of a film cell and into it is exactly half. Sampling reconciliation: take and transfer are internal moves; discard exports exactly the held totals. Clean water at 25, 50 and 100 % exports exactly the removed C and N. |
| conservation-all-pools | tests/fixtures/conservation-all-pools.test.ts | **pass**, 1 test, 111.5 s (b2). Closed lid, 10,000 ticks. Worst relative error C 6.13e‑15, N 7.05e‑14, M 0. Worst absolute residual C 3.6e‑11, N 8.1e‑11. Film, fungal transfer, phage lysis, Hitcher drain, captures, adhesion links, all three enzymes and both food objects acted (details below this table). |
| relationship matrix (every catalog relationship) | tests/fixtures/relationship-matrix.test.ts; tools/relationship-matrix.ts | **pass**, 15 tests (b2). **711 of 711 rows** in 33.1 s, with 232 positive relationships (table below). Regenerated in this session under contentHash 8a004f51… into tmp/ev/relationships-g3.md: rows identical to docs/reports/relationships-g3.md except its header hash. At the gate the lead regenerated the committed file under f276b113…: 711 of 711 pass in 6.6 s, rows unchanged. |
| module fixtures | module-accounting, shared-budget, module-e04, module-e06, module-e07, module-e08, module-e09-e10, module-e12 (tests/fixtures), tests/sim/stage8-order.test.ts | **pass**, 9 files, 113 tests, 141 s (b3). Per file: accounting 7, shared-budget 8 (C08: two actions never spend the same energy), E04 15, E06 5, E07 11, E08 8, E09/E10 23, E12 24, stage 8 order 12. |
| experiments | tests/experiments/*.test.ts (17 files incl. e201-e204, hidden-neighborhood, hidden-neighborhood-host, one-host, fungal-supply-line), tests/recipes/curated.test.ts | **pass**, 18 files, 124 tests, 772 s (b4). Write-ups: docs/reports/experiments-g2.md and experiments-g3.md. EXP_212 gate at 1 s with the exact transfer ledger. EXP_105 gate at 1 s. EXP_104 gate at 1 s on revision 2 (D‑0068; re-pinned 2026-10-10, tests/experiments 17 files 115 tests pass). |
| P3.1 chemistry | tests/sim/chemistry.test.ts | **pass**, 14 tests (b5) |
| P3.2 habitats, attachment | tests/fixtures/habitat-presets.test.ts, tests/sim/attachment.test.ts | **pass**, 7 + 3 tests (b5) |
| P3.3 film, fungi, Dusk | tests/fixtures/film.test.ts, fungal-branching, dusk-suitability, relationships-film, relationships-w2 | **pass**, 15 + 13 + 2 + 5 + 5 tests (b5; film 160 s) |
| P3.4 hosts, hunters, parasites, phage, Siltworm | tests/fixtures/host-specificity, predation-matrix, parasite, phage; tests/sim/siltworm-crossing.test.ts | **pass**, 3 + 5 + 17 + 14 + 6 tests (b5; phage 62.5 s) |
| P3.5 Sample / Transfer / Clean water | tests/sim/tools.test.ts, tests/worker/sample-transaction.test.ts | **pass**, 17 + 5 tests (b5) |
| P3.6 living chemistry | tests/fixtures/fungal-transport, food-objects, producers; e201-e204 (row "experiments") | **pass**, 14 + 22 + 18 tests (b5; food-objects 276 s) |
| P3.8 Field Guide, badges, relationships seen | tests/content/guide.test.ts, tests/ui/badges.test.ts, tests/worker/relationships.test.ts | **pass**, 41 + 6 + 9 tests (b5) |
| P3.10 audio | tests/audio/*.test.ts (6 files) | **pass**, 33 tests, incl. the rate limiter's 12 (b5). The manual listen is an owner item (§8). |
| P3.11 accessibility | docs/reports/contrast.md; tests/ui/a11y-*.test.ts and the e2e a11y-screens and keyboard specs | Contrast audit: 246 pairs, 208 required, 129 pass, 79 fail with a justification, 0 unexplained. The a11y specs: a11y-screens (6 tests) and keyboard (2 tests) **pass on all three projects** in the gate's full run (258 passed); a11y builder report docs/reports/reviews/g3-wave-4b/a11y-build.md. |
| P3.12 performance | docs/reports/perf-g3.md, tests/perf/stress-shape.test.ts | stress-shape **pass**, 1 test, 8.9 s (b5; perf's in-flight test). perf-g3.md: 6,000 agents with 2,000 fungal, CPU per tick p50 18.8 / p95 23.9 ms. **< 10 ms not met**; provisional (§7). Hash neutrality is proven in perf-g3.md and holds in b1/b6/b7 here. |
| determinism | tests/fixtures/determinism.test.ts (G0 headless), deterministic-state.test.ts (G1 host + save), **determinism-g3.test.ts (new)**, g2-replay.test.ts, trajectory-fence.test.ts, trajectory-fence-arms, trajectory-fence-current, trajectory-fence-current-arms | **pass**. determinism-g3: 9 tests, 102 s (standalone run), then again in b6. The rest are in b1 (13 files with the saves rows, 98 tests, 959 s). The fence moved no digest. |
| saves | tests/persistence/migration.test.ts, tests/sim/history-debris.test.ts, g2-replay, tests/sim/world-stores.test.ts, tests/persistence/adhesion-import.test.ts, tests/persistence/stale-prey.test.ts | **pass** (b1, together with the determinism files). |
| e2e Launch ecology (W6‑17) | tests/e2e/launch-ecology.spec.ts (new) | **pass**, desktop: `1 passed (12.2m)` on port 4263, build tmp/dist-evidence. Phone projects: **pass** in the gate's full run (phone-portrait and phone-landscape, after the D‑0069 fixes). |
| e2e Lab tools, keyboard, a11y screens | tests/e2e/lab-tools.spec.ts, keyboard.spec.ts, a11y-screens.spec.ts | **pass** on all three projects in the gate's full run (258 passed, 3.0 h, at 1eb3025). |

**Determinism (Appendix A line):**
- `determinism-g3` builds a Phase‑3‑heavy dish by hand. It contains:
  - film from Velvet on gel and from E10 Sprinters;
  - Threadlace, and a 4-segment Cordweaver chain with transport links;
  - Pinphage on a Sprinter colony, and Hitchers beside Sunbeads;
  - Crumbsmith, Oilwick and Brothmaker on their deposits, with breaker;
  - a wafer, and a pellet placed in play;
  - E04, E07 and E12 carriers.
- It then plays a player session through the real worker host at 4× with irregular frames:
  a protein dose, a pellet, a salt stroke, an inoculation, Clean water, a Sample taken and transferred at the midpoint, a gel stroke and a sugar dose.
- Results:
  - 4× host hash == 1× host replay == headless 1-tick and 4-tick replays;
  - == a save file taken with the sample **held**, loaded by `loadSaveFile`, then Transfer and continue;
  - == the host's own save opened as a new dish, then Transfer and 4× continue.
  - Hashes compared relationally; no literal is pinned. This session (b6): `d76ceab90c3cf733` (4×, tick 801) == `d76ceab90c3cf733` (1× host) == `d76ceab90c3cf733` (headless 1-tick and 4-tick) == `d76ceab90c3cf733` (reload at tick 402, sample held). The hash covers contentHash, so the lead's gate run re-reads it; the test itself pins no literal
- Non-vacuity: every listed mechanism is observed acting in the replay (b6: film max 5.43 C; fungal transfer 0.04 C/s; 4,461 infected organism-ticks; 3,805 Hitcher drain ticks; starch 2.52, oil 2.35 and protein 1.35 C converted; 2.47 C released from objects; an anchored E04 carrier; 5 adhesion links; 320 moving E07 Sunbead-ticks; 22 lyses).
- Negative controls: moving the Transfer by one cell, moving Clean water one tick later, or dropping the held sample from the save each ends in a different state.

**Conservation (Appendix A line):**
- Closed lid, G0 core: tests/fixtures/conservation-closed-lid.test.ts (b6): worst relative error C 5.220e‑15, N 1.080e‑13; worst absolute residual C 2.910e‑11, N 1.176e‑10, M 0; 731 births, 320 deaths over 10,000 ticks (the same as G2). G0 determinism (b6): endpoint `9ad8c74f0e0f828a` at tick 6,000, 659 alive; save at 3,000 → reload equals uninterrupted.
- All pools, 10,000 ticks with film, fungi, parasites, phage, enzymes, food objects, transport and modules all acting:
  - worst relative error C 6.13e‑15, N 7.05e‑14, M 0;
  - worst absolute residual C 3.638e‑11, N 8.117e‑11, M 0.
  - What acted: 308 births, 406 deaths; film max 54.75 C; fungal transfer up to 0.04 C/s; 21 infections and 17 lyses;
    295 captures; 5 adhesion links; starch 1.41, oil 2.60 and protein 2.31 C converted; pellet and wafer each released 10 C and emptied.

**Relationship table** (W6‑16; BUILD_DIRECTIVE wants it here). It is generated by `npx tsx tools/relationship-matrix.ts`,
the same rows as tests/fixtures/relationship-matrix.test.ts, with expectations read from CT §1.1, §3.1–§3.5, §5 and §7.1 and SPEC §5.3 (D‑0063).
The full 711-row table with every expected and observed value is docs/reports/relationships-g3.md. The summary and
every positive relationship, under the shipped manifest (19 species, 27 materials, 10 modules):

| Family | Rows | Pass | Positive relationships |
|--------|-----:|-----:|-----------------------:|
| diets | 189 | 189 | 25 |
| prey | 184 | 184 | 91 |
| hosts | 36 | 36 | 2 |
| inhibitors | 54 | 54 | 13 |
| enzymes | 12 | 12 | 6 |
| producers | 18 | 18 | 6 |
| modules | 190 | 190 | 61 |
| materials | 28 | 28 | 28 |
| **all** | **711** | **711** | **232** |

Positive relationships (each one a passing row; the absences are rows too, in the report):

| Family | Actor | Positive with (row context in parentheses) |
|---|---|---|
| diets | A01 | photosynthesis |
| diets | B01 | sugar |
| diets | B02 | sugar, protein |
| diets | B03 | sugar |
| diets | B04 | starch, oil, protein, detritus, film |
| diets | B05 | metabolite |
| diets | B06 | sugar |
| diets | B07 | metabolite |
| diets | B08 | broth |
| diets | F01 | starch, protein, detritus, film |
| diets | F02 | sugar, detritus |
| diets | Y01 | sugar |
| diets | Y02 | broth |
| diets | P01+E08 | detritus |
| diets | P02+E08 | detritus |
| diets | P03+E08 | detritus |
| prey | P01 | A01 (water); B01 (water, sediment, E04-anchored, attached flag); B02 (gel, sediment); B03 (water, sediment, E04-anchored, attached flag); B04 (water, sediment, E04-anchored, attached flag); B05 (water, sediment, E04-anchored, attached flag); B06 (water, sediment, E04-anchored, attached flag); B07 (water, sediment, E04-anchored, attached flag); B08 (water, sediment, E04-anchored, attached flag); Y01 (water, E04-anchored, attached flag); Y02 (water, E04-anchored, attached flag) |
| prey | P02 | A01 (water); B01 (water, sediment, E04-anchored, attached flag); B03 (water, sediment, E04-anchored, attached flag); B04 (water, sediment, E04-anchored, attached flag); B05 (water, sediment, E04-anchored, attached flag); B06 (water, sediment, E04-anchored); B07 (water, sediment, E04-anchored); B08 (water, sediment, E04-anchored) |
| prey | P03 | A01 (water); Y01 (water, E04-anchored, attached flag); Y02 (water, E04-anchored, attached flag) |
| prey | P04 | B01 (water, sediment, E04-anchored, attached flag); B02 (gel, sediment); B03 (water, sediment, E04-anchored, attached flag); B04 (water, sediment, E04-anchored, attached flag); B05 (water, sediment, E04-anchored, attached flag); B06 (sediment); B07 (sediment); B08 (sediment) |
| hosts | X01 | A01 |
| hosts | V01 | B01 |
| inhibitors | INH_BACT | B01, B02, B03, B04, B05, B06, B07, B08 |
| inhibitors | INH_FUNG | F01, F02, Y01, Y02 |
| inhibitors | INH_PHOTO | A01 |
| enzymes | M03 | starch: starch→sugar 0.005000 C |
| enzymes | M03 + M09 (breaker 1) | starch: starch→sugar 0.002500 C |
| enzymes | M04 | oil: oil→metabolite 0.005000 C |
| enzymes | M04 + M09 (breaker 1) | oil: oil→metabolite 0.002500 C |
| enzymes | M05 | protein: protein→broth 0.005000 C |
| enzymes | M05 + M09 (breaker 1) | protein: protein→broth 0.002500 C |
| producers | B06 | starch deposit |
| producers | F02 | starch deposit |
| producers | B07 | oil deposit |
| producers | B08 | protein deposit |
| producers | B01+E01 | starch deposit |
| producers | B04+E09 | protein deposit |
| modules | E01 | B01, B02, B04, B05, Y01, Y02 |
| modules | E03 | B01, B02, B03, B04, B05, B06, B07, B08, Y01, Y02 |
| modules | E04 | B01, B03, B04, B05, B06, B07, B08, Y01, Y02 |
| modules | E05 | A01, B01, B02, B03, B04, B05, B06, B07, B08, F01, F02, P01, P02, P03, P04, Y01, Y02 |
| modules | E06 | A01 |
| modules | E07 | A01 |
| modules | E08 | P01, P02, P03 |
| modules | E09 | B04, B05, F01, F02, Y01, Y02 |
| modules | E10 | B01, B04, B06, F02, Y01 |
| modules | E12 | B01, B04, B06 |
| materials | all 28 | ACID acid, BASE base, BUFFER buffer, CO2 co2, DEBRIS detritus + detritusN (0.1 N/C), GEL substrate gel, INH_BACT inhBact, INH_FUNG inhFung, INH_PHOTO inhPhoto, M01 B08, Y02, F03 eat broth, M01 broth + brothN (0.1 N/C), M03 eStarch, M04 eOil, M05 eProtein, M09 breaker, M10 object {"sugar":10,"n":1}; releases {"sugar":0.002} per tick with 0.10 N/C, M11 object {"starch":6,"protein":4,"n":1}; releases {"starch":0.0012,"protein":0.0008} per tick with 0.10 N/C, METABOLITE metabolite, NUTRIENT nutrient, OIL oil, OXYGEN oxygen, PROTEIN protein, SALT salt, SEDIMENT substrate sediment, SHADE shade 0.1, STARCH starch, SUGAR sugar, WATER substrate water |

## 4b. Correctness evidence (G2, kept)
```
npm run check            → typecheck ok · lint ok · 81 test files, 755 tests passed (15.5 min)
npx playwright test      → 174 passed (1.9 h) on phone 360×800, phone 800×360 and desktop 1440×900
npm run content:validate → content ok · contentHash e88b6298…64ca5 · species 38 (enabled 5) · modules 17 (enabled 3) · atlas complete (221 frames incl. 3 module marks)
determinism fixtures     → 4× session hash 0815aebd62ed9173 at tick 320 == its 1× replay == after a save/reload; 6,000-tick endpoint df89c6854737adb1 (save/reload at 3,000 equals straight)
conservation, closed lid → worst relative error C 5.220e-15, N 1.080e-13 over 10,000 ticks (731 births, 320 deaths)
```
| G2 gate row | File | Result |
|---|---|---|
| module-accounting | tests/fixtures/module-accounting.test.ts | pass — E05 grants capacity only (+40 cap, 0.05 E/s carrying cost, never energy); E01 never duplicates a native ability and gives producer behaviour with its costs; E03 pays entry 10 E, rest 0.01 E/s and wake 5 E; a module loss frees no material and excess energy dissipates ledgered; the 0.02 E/s per-module surcharge is charged exactly once per tick |
| registry-imports | tests/fixtures/registry-imports.test.ts | pass — a save that references a module this build lacks is refused by id before anything is built; a changed build registry never changes an old save's registry, genomes, candidates or branches |
| branch-evidence | tests/fixtures/branch-evidence.test.ts | pass — a branch is established only when the threshold, the count (five living qualifying descendants) and the depth (three generations, held by a living descendant) all hold; each condition missing records no branch |
| comparison | tests/sim/comparison.test.ts | pass — paired runs are deterministic and identical but for the change; wave-A comparisons match their recorded numbers |
| variants | tests/recipes/variants.test.ts | pass — R‑G0…R‑G3 registered with the CT titles; each variant changes only its declared data (R‑G0 equals the source recipe's state hash; R‑G3 moves the sugar patch with the same count and mass) |
| experiments | tests/experiments/*.test.ts | pass — EXP_A/B/C, the four cards, framework, app flow, journal and words; wave-A golden measurements reproduce |
| e2e whatif, lab-tools | tests/e2e/whatif.spec.ts, tests/e2e/lab-tools.spec.ts | pass — in the 174/174 run on three layouts |
| view-switch hash | tests/sim/view-switch.test.ts | pass — Explore ⇄ Lab switches send no command and keep the hash identical, also while running; an interrupted stroke commits nothing; a completed stroke is one command and Undo restores the hash |
| keep the open dish first | tests/worker/keep-*.test.ts, tests/e2e/keep-dish.spec.ts | pass — every replacing action keeps the open dish or proves it unchanged; re-verified with mutants (docs/reports/reviews/g2-close/) |
| comprehension self-review | docs/reports/comprehension-g2.md | done — five tester tasks 5/5 within ten minutes from a cold start (self-review, not the five-tester session); the blocker and five majors it found are fixed (D‑0041) |

## 4c. Correctness evidence (G1, kept)
```
npm run check            → typecheck ok · lint ok · 29 test files, 205 tests passed (3 m 52 s)
npm run content:validate → content ok · contentHash d795100f…920 · atlas complete for 5 enabled species (189 frames)
npm run art:build --check → atlas up to date · 189 frames · 512×256 · 0da0be41a127 (deterministic)
npx playwright test      → 39 passed (9.6 m): garden 7, inspector 2, place‑and‑undo 3, save‑reload 2 (incl. Continue after a manual save) × phone 360×800, phone 800×360, desktop 1440×900
npm run sim:tune         → D06 targets met 6/6; all six 600 s endpoint hashes identical to docs/reports/tune-g1.md after this gate's changes
```
| G1 gate row | File | Result |
|---|---|---|
| deterministic‑state | tests/fixtures/deterministic-state.test.ts | pass — a FIRST_DISH_V1 session through the real worker host at 4× with 4 placements and 3 Feed doses (hash `3a41cdf2db34863e` at tick 320) equals: a 1× host replay, headless replays in 1‑ and 4‑tick steps, paused‑edit replay, a host save → new dish → continue, and a save file taken with 3 commands still queued. Moving one dose by one tick changes the hash. |
| blocked‑division‑proposal | tests/fixtures/blocked-division-proposal.test.ts | pass — all 11 proposal columns and both candidate genomes identical on ticks 0–58 while blocked; no division energy charged, no birth ids spent; commits once at tick 59; a save/reload at tick 29 gives the same commit and the same hash every tick (`e30634c9b8c33f54`). |
| finite‑feeding | tests/fixtures/finite-feeding.test.ts | pass — 44 competitors incl. 2 Amoebae audited every tick: per‑cell carbon taken ≤ pool, pools fall by exactly what was taken, no budget exceeded, nothing negative, ledger closes (pools emptied by ≥ 2 eaters 52 times; 904 nutrient‑limited organism‑ticks). |
| enzyme‑source | tests/fixtures/enzyme-source.test.ts | pass — conversion 0.10 × activity × dt, conserves C and N; no substrate ⇒ no conversion and no cost; the producer's own energy drops by 0.40 × dt on every emitting tick; EXP_A‑like run: bootstrap 2.90 C and enzyme‑derived 6.77 C reported separately and balance. |
| inherited‑variation | tests/fixtures/inherited-variation.test.ts | pass — parentage and deltas stored; Fixed ⇒ none; same outcomes at 1× and 4×; recorded draws reproduce. |
| predation | tests/fixtures/predation.test.ts | pass — one contact one kill one meal; cooldown; 2 × B0 meal cap with overflow to detritus; contested prey resolved once. |
| photosynthesis | tests/fixtures/photosynthesis.test.ts | pass — light 0 ⇒ no intake; closed lid: biomass, sugar and O2 are fixed fractions of CO2 taken up, ledger closes; half light ⇒ half intake. |
| e2e garden, place‑and‑undo, save‑reload (+ inspector) | tests/e2e/*.spec.ts | pass — 39/39 on three layouts, including 200 % text with axe (no serious violations), reduced motion, pinch never paints, one gesture one dose, undo restores the pre‑gesture hash, save → reload → same moment |
| Opening loop review | docs/reports/opening-loop-g1.md | done — every step performed in the built app at 1440×900 and 360×800 with screenshots; five problems found and fixed (Continue after a manual save, missing catalysis dust, biased deposit noise, "0.0000" trace values, inspector covering the selection). |

Also new at G1: worker protocol tests (stale snapshots, command order, version stamping and
mismatch rejection, rollback of a failing request or tick to the exact last valid hash),
persistence tests (interrupted write keeps the predecessor, malformed or tampered imports change
nothing, export → import hash equality, slot exhaustion), history compaction, reason copy for every
code, atlas completeness, renderer deposit repaint equality.

## 4d. Correctness evidence (G0, kept)
```
npm run check            → typecheck ok · lint ok · 93 tests passed (10 files)
npm run content:validate → content ok · contentHash d795100f…920 · species 38 (enabled 5) · materials 32 · modules 17
```
| G0 fixture | File | Result |
|---|---|---|
| Neutral founders | tests/fixtures/neutral-founders.test.ts | pass — all 38 species' neutral profiles equal CT §1.2/§1.3 (parsed from the doc itself); inactive loci create no movement or sensing; active loci move in the documented direction with their costs |
| Conservation, closed lid | tests/fixtures/conservation-closed-lid.test.ts | pass — 10,000 ticks with B01 B04 B06 A01 P01: worst relative error **C 6.36e‑15, N 1.10e‑13** (limit 1e‑5); 466 births, 318 deaths; no exchange, no inputs after start; inactive fields verified zero |
| Determinism | tests/fixtures/determinism.test.ts | pass — two fresh runs identical at 6 checkpoints; chunked stepping with interleaved hashing/serialization equals straight stepping; save at 3000 → JSON → reload → 6000 equals uninterrupted (**endpoint 525193f459460549**, 756 alive); different seed diverges |
| No free growth | tests/fixtures/no-free-growth.test.ts (was no-free-growth-and-fairness), tests/sim/feeding.test.ts | pass — no food, no nutrient, no light, no CO2 ⇒ no biomass; energy falls by maintenance + movement exactly, then health −4/s at E = 0; division never creates material |
| Fair shared food | tests/fixtures/fair-shared-food.test.ts (split out at G1) | pass — eight identical Sprinters on a scarce pool get equal shares in two insertion orders; the pool is shared out exactly |
| Content validation | tests/content/validator.test.ts | pass — shipped content valid; broken packs fail naming file and field (negative/non‑finite, reversed range, unknown prey/habitat, duplicate id, file/id mismatch, unimplemented ability, recipe outside manifest, native‑equivalent eligibility) |

Headless runner: `npm run sim:run -- --recipe FIRST_DISH_V1 --seed 104729 --ticks 6000 --perf`
→ endpoint `576350939f1d34b2`, ledger relErr C 1.1e‑14 N 1.0e‑13, 710 alive at 600 s.

## 5. Experience evidence
Phase 4 (v1.0). Each line names what was built and where it was checked; the e2e results at the gate are in §4.
- **The v1.0 full journey** (tests/e2e/full-journey.spec.ts, P4.11): Home → Play → Garden (paused) → Run → Pause →
  Feed one dose → inspect an organism → Run → Pause → Undo (the worker hash equals the pre-feed moment's) → Save to a
  slot → reload → Saved dishes → Open (the same moment, paused, equal hash) → What if? R‑G3 "Dinner farther away" →
  Compare with Garden (180 s) → the results ("this paired run" and its caveat) → a conclusion → Done → More → Share:
  three labelled choices; Picture saves a 1080 × 1080 PNG; Close leaves the dish paused and unchanged. Axe at Home,
  the dish, the inspector, What if?, the results and Share. Passed on desktop in `487a152`'s evidence (29/29 batch);
  the builder ran it on desktop and phone-portrait. Gate: passed on phone-portrait, phone-landscape and desktop (1/1
  each) in the full e2e at `17ad62f`.
- **First minute** (tests/e2e/first-minute.spec.ts; D‑0079 amendment, D‑0094): the Garden opens paused with one
  arrival line; prompts come one at a time and only with Show prompts on; no story notice in the dish's first 600
  ticks (the lead's desktop e2e had shown "Something happened: An enzyme at work" taking the place of "Tap a
  Sprinter." right after Run; docs/reports/reviews/g4-wave-5b/integrate-first-minute.md, first-minute-verify1.md).
  The placement ring grows over 300 ms only for an accepted placement; the first feeding pulse starts on its cue;
  preset camera moves ease 220 ms. Passed on desktop and phone-portrait (perf-rc1.md); at the gate 1/1 on all three
  projects (`17ad62f`).
- **Garden card and session memory** (tests/e2e/garden-home.spec.ts; tests/worker/thumbnail.test.ts,
  session-summary.test.ts; D‑0074): Continue shows the saved moment's thumbnail; "Saved for later" never claims births
  from before the visit ("At least N births…").
- **Story cards** (tests/e2e/stories.spec.ts; D‑0077): "Something happened: {title}" with Open and ✕, no sound; the
  card shows up to 3 panels with the badge "Memory, not replay"; a place-changed card says "Other recorded changes in
  between: {k}" and claims no cause.
- **Favorites** (tests/e2e/favorites.spec.ts; D‑0073): follow up to 3 families, glyph outlines capped at 200 members
  then "+n", extinction card and Look back.
- **Goals** (tests/e2e/goals.spec.ts; D‑0078): off by default; one dismissible sentence when a goal settles; every end
  names what was recorded (Undo, a rollback, a dish that cannot resume).
- **Share** (tests/e2e/share.spec.ts; D‑0083): Picture, Starting recipe and Living dish; a cancelled share is "Not
  shared. Nothing changed." in the sheet; every refused import is one toast "Import failed: {reason}. Nothing changed."
- **What if? paired** (tests/e2e/variants-paired.spec.ts; D‑0088): the results open with "this paired run" and "One
  paired run is an illustration, not a general rule."
- **Try my dish, challenges, observation tools** (tests/e2e/try-dish, challenge, bookmarks-gallery, observe-tools
  specs; D‑0084–D‑0087).
- **Narration** (tests/e2e/narration.spec.ts; D‑0089): 16 phrases, off by default, each with an evidence rule, text
  always on screen. Hearing them on a device is an owner item (§8).
- **Android lifecycle and saves** in a browser harness (tests/e2e/android-storage.spec.ts; ANDROID_SETUP §9.1): a save
  cut after any of its file operations relaunches to the old or the new moment, never an error; a damaged current
  record opens the previous copy with "The latest save was damaged, so the previous copy was opened."
- **Web and arcade** (tests/e2e/web-arcade.spec.ts; D‑0097): served from /arcade/pixelmeba/, the page works offline
  after the first load (Home, the Garden runs, a save reopens); in an iframe `pixelmeba:pause` pauses and
  `pixelmeba:resume` leaves the dish paused with Run; the demo refuses a full save with one toast and keeps the open
  dish's hash.
- **About and store copy** (tests/e2e/about.spec.ts, tests/tools/listing.test.ts; D‑0098): the listing claims only what
  1.0.0 has (no later-update features, no forbidden claims), and the About privacy line names the phone's own backup.
- **Not done by the agent:** the D9 §12 usability gates (PLAY_STORE_CHECKLIST §B9) and the D06 §18 five-tester
  comprehension session are owner tasks (§8).
- **Seed report at v1.0** (docs/reports/tune-rc1.md; `npm run sim:tune`, 18 recipes × 6 seeds, Standard,
  `--seconds 600 --extend 1200`, at `c001a94`, 1,207 s): every table equals tune-g3.md's once the state hashes (the
  contentHash moved with D‑0072) and the two wall-clock columns are masked. Births, deaths, populations, food,
  conversions, division times, mutation and module draws, branches and ledger errors are identical on all 108 runs,
  so no simulated outcome changed in Phase 4. The G3 seed findings below stand.

Earlier gates (kept):
- **G3 journey (W6‑17)**, tests/e2e/launch-ecology.spec.ts, desktop 1440×900, 1 passed in 12.2 min. The steps:
  1. New Dish → "Empty Gel Colony" → Create. The dish opens paused in the Lab with the Life tray open; the view toggle is never pressed.
  2. Velvet on gel, Threadlace ×5, Cordweaver, Brothmaker ×5.
  3. A protein dose on the Brothmakers, an M10 pellet in the water channel, and a salt stroke on gel.
  4. Sample (All, radius 3) on the salt → Take (the hash changes) → Transfer → "Sample moved.".
  5. Clean water 50 % over the landing site.
  6. More → Field Guide → search "cordweaver" → entry F02 → Back. The same view stays paused, with the same sim time and the same worker hash.
  7. Run at 4× for ≥ 30 dish seconds, then pause.
  8. The inspector shows the Velvet's biofilm in its cell (> 0), the Cordweaver's network line and its
     "carried in the last 10 s" row, and a cell's reaction ledger naming the protein enzyme, in 16 px text.

  Axe has no serious or critical findings at the 8 checkpoints. Touch targets are checked with `expectReachable` (≥ 48 px).
  The worker is reached only through the Worker wrapper (watchWorker / workerHash, read-only 'hash' requests).
  Phone projects: pass in the gate's full run (after the D‑0069 fixes).
- **Seed report** (docs/reports/tune-g3.md, Standard, 18 recipes × 6 seeds, `--seconds 600 --extend 1200`):
  - FIRST_DISH_V1 meets the D06 targets on 6/6 seeds (first intake at tick 0, first division 29.3 s).
  - Its 600 s ecology equals G2's on 5/6 seeds. The flip shows only through module draws: 9 gains, now E07 ×4, E05 ×3, E06 ×1
    and E01 ×1, and the 155921 branch is "Sunbead · Light seeker".
  - LIGHT_AND_LIFE_V1 gains modules on 6/6 seeds and confirms 3 branches.
  - Every other recipe ends empty by 600–1,200 s. The experiment cards stop at 120–180 s.
  - The producers starve within 120–180 s in every enzyme dish (D‑0022 and D‑0051 owner item).
  - The curated dishes L301, L303 and L306 are empty by 540–600 s on every seed (§8).
  - D‑0015's proposals were re-measured in memory, and proposal 2 was measured for the first time. Keep FIRST_DISH_V1 (proposed).
- **Opening loop on the G3 build** (W6‑15): docs/reports/opening-loop-g3.md, with 11 desktop screenshots in docs/reports/img/g3/.
  It is the G1 Garden loop run with a copy of the script at port 4263 (the committed G1 images are untouched). Every step completed;
  save → reload → Continue kept 1:12 · 114 alive. One MINOR copy finding: "Sugar here can come from … Cordweavers’ enzyme" appears in a Garden with no
  Cordweaver (§8 item 27). Phone layouts were not re-shot at G3; the full three-project e2e run covers the phone projects.
- Comprehension self-review (G2, kept): docs/reports/comprehension-g2.md. The five tasks took 5/5 within ten minutes;
  the five-tester session remains an owner item.

## 6. Design handoff
- Art is code (`art/src/`), compiled by `npm run art:build` to `public/atlas/organisms.png` +
  `manifest.json`: 856 frames on 1024×1024. It covers the 19 enabled species (all 14 Phase 3 species since wave 1, D‑0046) and the ten
  module marks (D‑0032). It is deterministic: `npm run art:build -- --check` → "atlas up to date · 856 frames (80 feature-mark
  frames, 13 world-tile frames) · 1024×1024 · 99ab54adef36" at the gate.
- Contrast audit: docs/reports/contrast.md has 246 pairs, of which 208 are required. 129 pass and 79 fail, each with a printed justification; none is unexplained.
  Fixes in art/src and the render colours are proposals for the art owner (a11y build report).
- Sound: synthesized patches (src/audio/patches.ts). P4.9 polish: drop, division and discovery differ by source,
  pitch and length; world cues capped at 4 per second; divisions coalesce for 5 s; nothing retuned (D‑0089).
  Narration: 16 UX §8.3 phrase ids through SpeechSynthesis, off by default. Owner manual listen: §8.
- Reduced motion: the UX §7.4 table has an "As built" column (D‑0089, D‑0094): still placement ring 1 s, static split
  frame 1 s, held food stain, instant camera.
- App icon and splash (P4.10, D‑0093): art/src/icons/appIcon.ts, the dish with one bright colony and no text; adaptive
  foreground 54 × 54 cells inside the safe circle on #14252D; legacy icons on a 24-cell grid; `npm run android:icons`
  (and `--check`) writes the 15 launcher PNGs, 11 splash PNGs and the PWA's icon-192, icon-512 and maskable-512.
- Store art (P4.12, D‑0098), all made by `npm run store:assets` from the production build:
  - store/icon-512.png (32-bit RGBA, every pixel opaque, the dish ×12 at 75 % of the square) and the two adaptive layers;
  - store/feature-1024x500.png, a real Share → Picture of the Garden at ×2, cropped (source kept as
    feature-source-picture.png);
  - six screenshots each for phone (1080 × 1920), 7-inch tablet (1152 × 2048) and 10-inch tablet (1440 × 2560), all
    9:16: 01 living dish, 02 simple actions, 03 What if?, 04 inspection, 05 a real inherited change (branch 29A of the
    g2 fixture save, gained E05), 06 an experiment. Real play only, framed by player actions; provenance (commit,
    recipe or save, seed, tick, stateHash, steps) in store/screenshots/manifest.json.
- Store text: store/listing.md (short description = the promise line, 61 characters), store/release-notes-1.0.0.md,
  PRIVACY_POLICY.md and store/privacy-policy.html, store/data-safety.md, store/content-rating.md (expected Everyone /
  PEGI 3), store/smoke-test.md (16 steps).

## 7. Performance and saves

### 7.1 v1.0 (P4.13, docs/reports/perf-rc1.md, and the gate re-measure)
perf-rc1.md was measured 2026‑10‑12 08:22–11:10 UTC on the shared machine while Gradle and Playwright ran, so every
number in it is "under load" with the load average beside it. The lead re-measured quietly at the gate with the
commands at the end of perf-rc1.md. Nothing below is reported as met that was not measured as met.

| Criterion | perf-rc1.md (under load) | Gate, quiet (`17ad62f`, 2026‑10‑12 21:57–22:45 UTC; load in perf-rc1.md "Gate re-measure") | Status |
|---|---|---|---|
| SPEC §16 / P3.12: 1× tick < 10 ms at 6,000 agents (2,000 fungal), headless, `tools/perf-stress.ts --ticks 9000` | CPU p50 12.78 / p95 21.34 / p99 39.84 ms (load 2.13 → 2.49); same simulation 11.95–18.24 ms p50 across three runs | CPU p50 **11.10** / p95 **20.30** / p99 39.38 ms (load 2.22 → 1.71); stateHash at 9,000 `8564b87b9251fd32`, equal to perf-rc1's | **NOT MET** in perf-rc1 (G3 quiet: 12.0 / 20.8 / 39.8). **Not met at the gate.** No hot-path edit was made in P4.13; every larger gain changes float order or rules (D‑0066 owner options, §8 item 4). |
| The same in the web build's worker (imported stress dish, 360×800, SwiftShader) | worker tick p50 32.3 / p95 51.5 ms at 1×; keeps 1×; at 4× runs at 2.0× and the badge says so | re-measured: worker tick p50 32.2 / p95 50.5 ms at 1× (keeps 1×); at 4× effective 2.1× (median) and the badge shows | **NOT MET** here (the worker shares 2 threads with software rasterization). |
| P3.12: heap slope, minutes 5–15, < 1 %/min (headless, forced GC) | 0.83 %/min with no save in the window (41-minute run); 0.09 %/min after minute 31; **1.74 %/min** with a save and reload at tick 3,000 inside the window | **0.825 %/min** with no save in the window (0.089 %/min after minute 31); **1.721 %/min** with the save at 3,000 | **MET without a save; NOT MET with one** (a single +1.3 MB step after building and parsing a 10 MB save). The remaining lever is genome-table compaction, a rules change (owner). |
| P4.13: web build, Garden at 4× for 15 real minutes (heat and memory) | worker heap **2.20 %/min** (1.1 %/min after minute 10), main thread 0.70 %/min; browser CPU 1.65–1.72 of 2 cores; tick p50 13.6 ms median | worker **1.84 %/min** (0.65 %/min over minutes 10–15), main thread **0.47 %/min**; browser CPU 1.70–1.74 of 2 cores; tick p50 14.1 ms median | Main thread **MET**; worker **NOT MET** at 4× (four dish minutes per real minute). Heat: **OWNER DEVICE ITEM**. |
| SPEC §16: touch feedback p95 < 100 ms | 20 Feed taps at 1×: p50 67.4, **p95 146.7**, max 173.9 ms (SwiftShader ~14 fps) | re-measured: p50 109.1, **p95 127.6**, max 166.9 ms (load 5.96 → 4.67) | **NOT MET here; OWNER DEVICE ITEM.** |
| SPEC §16: 60 fps desktop / 30 fps mid-range phone at 6,000 agents | SwiftShader lower bounds: 360×800 9.7 fps neighbourhood, 15.9 whole dish; 1440×900 3.2 / 3.5 | — | **OWNER DEVICE ITEM** (GPU / phone). |
| D‑0085: the relationship map's cost | watcher 0.06–0.07 ms per tick with the map never opened (0.23–0.30 with pool sums always on) | — | **Done** (pool sums armed on first open, D‑0094). |
| Effective-speed indicator, diagnostics overlay, renderer degrade ladder | as built; ladder reached level 3 in every SwiftShader run | — | **Done** (renderer only; never the worker or the simulation). |
| Hash neutrality of P4.13 | stress-world stateHash and snapshot digests at ticks 0/600/1,500/3,000/9,000 byte-identical before and after; fence, determinism and conservation pass | the fence (g2-replay, four trajectory-fence files), determinism (8 files, 71 tests) and conservation pass in the gate check; the stress world's tick 3,000 / 9,000 / 24,600 hashes at the gate equal perf-rc1's | **Proven.** |

Device items the owner measures (perf-rc1.md "OWNER DEVICE steps"; PLAY_STORE_CHECKLIST §B6.3): on the nominated
mid-range Android phone, `dumpsys battery` and `dumpsys thermalservice` before and after 15 minutes of the Garden at
4× with "Show performance numbers" on, the bar's readings at minutes 5, 10 and 15, then the same at 1× with the
6,000-organism stress dish; touch feedback p95; frame rate. Record the phone (maker, model, Android version, RAM)
here. Measured device: <owner: phone and readings>.

**Saves at v1.0:**
- **Web:** IndexedDB, unchanged in format since G3 (world schema 4). The service worker never touches saves (D‑0097).
- **Android app:** a Capacitor Filesystem store in the app's private data directory (D‑0092, D‑0093): records, slot
  pointers and a `journal.json` commit point; each file written as tmp, read back, compared and renamed; the journal
  is re-applied on open. Crash-point enumeration (tests/persistence/capacitor-fs.test.ts, under an atomic rename and
  under Android's remove-then-rename) and the browser interruption harness (tests/e2e/android-storage.spec.ts: a save
  of 12–13 file operations with the commit point at operation 7; a cut after 0…7 opens the old moment, after 8…11/12
  the new one) prove the old or new save always opens. D‑0095: a full phone never hides the saves, a damaged slot file
  keeps its records, a refused commit leaves no files, a frozen app is not a dead storage. D‑0096: a cancelled export
  is never reported as one. Not tested: a power cut (writeFile does not fsync) (D‑0096).
- **Notebook record** beside the world state (favorites, stories, goals, turns, bookmarks, gallery, challenges):
  outside the checksum, own version and sha256, 2 MiB cap with the app's worst case under 70 % of it (D‑0090); a bad
  record is dropped whole with a message and the world loads.
- **Shelf** (write-once baseline and snapshot records outside the ten named slots; 10 baselines and 20 snapshots per
  device), emptied only through Saved dishes → Storage (D‑0082, D‑0084, D‑0086).
- Old saves: g2, wave 5 and stage 1 saves load with every newer notebook kind empty; g2-replay continues
  bit-identically.
- Backgrounding pauses with no offline growth on both platforms: App 'pause' and page hidden pause a running dish
  (and a running comparison, D‑0096) and autosave once per absence.

**Android build:** debug APK and unsigned AAB built here (§4 "Android build" row; ANDROID_SETUP §9.1, §9.2). targetSdk
36 (Play: API 36 required for new apps since 2026‑08‑31, read 2026‑10‑12). VIBRATE added for haptics (D‑0093). Never
installed or launched: no device or emulator (owner items, §8). Rebuilt at the gate (ANDROID_SETUP §9.3): the debug APK
at `c001a94`, and the release AAB at `1eb42c6` without source maps (D‑0100), 3,808,774 bytes, versionCode 10000.

**Usability gates (D9 §12):** owner tasks, not run (PLAY_STORE_CHECKLIST §B9; §8). Record each session's date, build
commit, counts and notes here: <owner: usability sessions>.

### 7.2 G3 (kept)
**Quiet-machine gate re-measure by the lead** (W6‑12; docs/reports/perf-g3.md "Gate re-measure on a quiet machine"),
2026‑10‑10 16:42–16:58 UTC at commit `35d12c3`, with no agent or other job running. The machine is an AMD EPYC 7763 with
2 vCPUs (one core, two SMT threads) and Node 24.21.0. Not a phone.
- **Tick cost, SPEC §16 / P3.12**: `node --expose-gc --import tsx tools/perf-stress.ts --ticks 9000`. The dish holds 6,000
  agents, 2,000 of them fungal segments, with every Phase 3 mechanism acting by tick 300, at 1× headless.

  | Build | CPU per tick p50 | CPU p95 | CPU p99 |
  |---|---|---|---|
  | Committed sim before the pass (HEAD `cbdddf3`; shared machine) | 38.5 ms | 45.2 ms | 62.5 ms |
  | Perf's edits, shared machine (perf builder, 13:45–14:50 UTC) | 18.8 ms | 23.9 ms | 42.6 ms |
  | **Gate, quiet machine (`35d12c3`)** | **12.0 ms** | **20.8 ms** | **39.8 ms** |

  - **The < 10 ms gate is not met on this machine**: about 2 ms over at p50 and 11 ms at p95. Stage means (wall ms per
    tick): sense/move 5.0, intake 3.1, environment 1.9, structures 1.8, everything else 3.1.
  - perf-g3.md "Remaining gap" says each remaining large gain changes results, so it would need an owner rules decision (§8).
  - Whether < 10 ms is judged on this codespace or on a phone-class target device is an owner item (D‑0066, §8).
- **Hash neutrality of perf's edits**: the stress world's stateHash is identical before and after at ticks
  0, 600, 1,500, 3,000 and 9,000, and so are the snapshot digests. The fence passes (perf-g3.md). In this session it also
  passed with those edits in the tree: b1, b6 and b7 in §4, and the tune's FIRST_DISH_V1 hashes equal an independent run.
- **Memory**:
  - Heap slope over minutes 5–15 is 0.97 %/min with no save in the window (41-minute run), and 0.27 %/min after minute 31.
  - With a save and reload at tick 3,000 it is 1.73 %/min, from a one-off +1.27 MB step (quiet re-measure: 1.82 %/min).
  - Remaining growth is the genome table, which is never compacted (perf-g3.md proposal 1).
- **Snapshot**:
  - Whole snapshot at 6,000 agents with every view on: mean 3.42 ms (p95 5.52) quiet; 4.59 ms (p95 9.30) on the shared
    machine. Before the pass it was 11.80 ms (p95 22.9).
  - About 0.5 MB per snapshot (ents + ids + deposits), sent as pooled ArrayBuffers.
- **Save at 6,000 agents**: `buildSaveFile` 259 ms, `loadSaveFile` 336 ms quiet (427 / 590 ms shared). The file is 10.2 MiB,
  inside the 25 MB import limit, and the reload hash is equal.
- **Renderer** (SwiftShader software WebGL, so lower bounds; `E2E_PORT=4262 npx tsx tools/render-bench-run.ts`, quiet):
  - At 6,000 organisms, 1440×900 runs at 3.2 fps zoomed to a neighbourhood and 3.3 fps for the whole dish.
  - At 360×800, 10.0 fps at neighbourhood zoom; aggregation engages at whole-dish zoom (16.0 fps, 4,599 cells painted).
  - Aggregation and reduced-motion gates pass. 60 fps at neighbourhood zoom is false, as at G1, because software
    rasterization is the limit. 60 fps on a GPU device is an owner item (§8).
- Headless effective speed from the seed report (not a performance measurement; load 1.8–7.4): 19.6–137× real
  time over 108 runs. FIRST_DISH_V1 averages 2.4–3.7 ms per tick (p95 4.6–7.2) with up to about 720 agents. LIGHT_AND_LIFE_V1 averages
  3.1–5.1 ms (p95 6.8–10.6) with up to about 900 Sunbeads.
- Baseline: G2's tick-loop CPU 2.35–2.80 ms per tick for FIRST_DISH_V1 (perf-g3.md "Baseline at g2").
- Saves:
  - World schema 4. Migration by copy from 1–3; old saves keep their recorded ruleset (registry v1) and their hash (D‑0035, D‑0059).
  - The g2 saves load and continue bit-identically (g2-replay).
  - Held samples, links, food objects and adhesion state are saved and validated on import (D‑0054, D‑0058).
  - Roundoff-negative field cells load (D‑0060).
  - A save taken with a sample held reloads and continues to the same hash (determinism-g3).
- Android at G3: unchanged since G1 (debug APK and unsigned AAB build; install and launch unverified, no device). No
  haptics on Android until P4.10 adds the VIBRATE permission (D‑0064); P4.10 added it (D‑0093).

## 8. Changes and owner decisions
- **Tuning and rules revisions in Phase 4:** none. No rules version moved (D‑0072); FIRST_DISH_V1 is kept at G1–G3 and
  v1.0. The only manifest change is `buildPhase` 3 → 4 with the three phase-4 objectives (new contentHash d3fbd36c…).
  EXP_104 ships on HIDDEN_NEIGHBORHOOD_V1 revision 2 (D‑0068).
- **Environment limits** (documented, not blocking):
  - no GPU, so frame rates are software-rendered lower bounds;
  - no Android device or emulator, so install, launch and every on-device check are unverified;
  - a shared 2-CPU machine, so wall times are inflated (the gate's perf numbers are a quiet re-measure).
- **Owner decisions required** (none block the release candidate; the behaviour as built stands until a ruling). At
  v1.0 there are **41 open owner decisions**: items 1–28 carried from G3 (with items 1–6 and 23
  updated below), and items 29–41, one per Phase 4 decision marked "Owner review: yes" (plus D‑0086 and D‑0089, listed
  for visibility). No owner ruling has been recorded on any item since G3. The store submission steps and the
  usability gates follow as owner **tasks** (not decisions).
  1. Play Store: price ($0.99 assumed), countries, Families program opt‑in, content rating answers. The answers are
     drafted in store/content-rating.md and store/data-safety.md; the console steps are PLAY_STORE_CHECKLIST §B1–§B4.
  2. Privacy policy hosting URL: host store/privacy-policy.html (from PRIVACY_POLICY.md) and paste the URL (§B3).
  3. Signing keystore creation and Play App Signing enrollment (owner‑held): `npm run android:keystore -- --out
     <path outside the repo>`, then `android/keystore.properties` (ANDROID_SETUP §5–§6; checklist §B5; D‑0091).
  4. Minimum Android device for measured performance gates. v1.0 status: §7.1 (perf-rc1.md and the gate re-measure;
     D‑0094). Device items from perf-g3.md (G3 quiet gate re-measure, kept):
     - The SPEC §16 1× tick < 10 ms at 6,000 agents is **not met** on this 2-vCPU container: CPU p50 12.0 ms, p95 20.8 ms
       after perf's pass. Measure it on the nominated device, and rule whether the criterion is judged there or here (D‑0066).
     - 60 fps at neighbourhood zoom needs a GPU device; software WebGL here gives 2.8–10 fps at 6,000 organisms.
     - Owner rules decisions that would close the **tick** gap. Each one changes results, so each needs a recorded ruleset
       bump: a diffusion cutoff or half-rate enzyme and inhibitor diffusion; entity-order locality for intake and decide.
     - Owner rules decision for the **memory** criterion: genome-table compaction (D-0066). The table and the derived
       `profiles` cache grow with every new genome; the compaction the genome.ts header describes was never implemented.
       Compaction changes saved genome ids and the hash, so it needs a ruleset entry. It does not change tick cost.
     - Hash-neutral follow-ups, scheduled for P4.13:
       - drop `profiles` cache entries with no living carrier (memory): **done** (`evictProfiles`, D‑0094);
       - send `ids` and `deposits` only on change (src/worker/host.ts; snapshot size): **not done** (bandwidth only;
         the snapshot stays inside its budget, perf-rc1.md).
  5. Lucid Winds Arcade manifest and embedding format (`tools/deploy-arcade.mjs` exists). Until then the stamped arcade
     deploy plays online only; `dist/` from its own folder plays offline (D‑0097; item 38; checklist §B10.4, §C).
  6. Whether the arcade gets the full web build or the DEMO_MODE build (`npm run build:demo`), and, for the demo, its
     link to the Play listing (D‑0097; item 38; checklist §B10.1–§B10.2).
  7. D‑0022: Experiment A. All 12 Crumbsmiths starve by ≈ 150 s. G3 re-measure: dead by 180 s on 6/6 seeds (tune-g3.md).
  8. D‑0027: RESERVE_COMPARE_V2 with a 2.0 meal dose.
  9. D‑0031: one checkpoint ring per device, or one per dish.
  10. D‑0038: film eaten as detritus (chosen), or as a separate food.
  11. D06 §18 five-tester comprehension session.
  12. **D‑0051 (1)** balance. Every Oilwick and Brothmaker starves in EXP_202 and EXP_203 under CT's producer numbers.
      G3 re-measure: dead by 180 s on 6/6 seeds. **New:** the same holds in curated **L303 Public Kitchen** (Brothmakers dead by 180 s,
      the last Creambud by 1,200 s). A fix is content tuning; per CT §11, record first whether a recipe change can meet the goal.
  13. **D‑0051 (2)** EXP_201's CT §10.3 gate (intake.B01 ≥ 0.5) is reached from background sugar alone (8 s). Should the attribution gate be stricter?
  14. **D‑0055** the dish rim counts as E04 support. An anchored carrier is still prey for the free-prey hunters.
  15. **D‑0056** a plain photosynthesizer is never labelled LIGHT_LIMITED while light > 0 (g2 behaviour, a hashed column).
      Proposed: the E06 decomposition for every photosynthesizer in new worlds only, under a recorded ruleset bump.
  16. **D‑0058** E12's "free" excludes anchored carriers, and the 2 E link cost is ledgered as 'other'.
  17. **D‑0060** should a future ruleset bump also clamp the capture split in the simulation?
  18. **D‑0061 (1)** the not-enabled-name rule: an error only for later-phase species (field-guide PROPOSED DECISION 1).
  19. **D‑0061 (2)** 47 guide warnings: biology and rules text names species not in v1.0. Reword for launch, or keep as written per CT?
  20. **D‑0068** EXP_104 now ships on HIDDEN_NEIGHBORHOOD_V1 revision 2 (starting oxygen 0.03; gate at 1 s). Sprinters are
      oxygen-limited only from tick 8 to tick 126, so the card says to pause in the first seconds. Keep it, or keep EXP_104
      out of the v1.0 card list?
  21. **D‑0064 (1) audio manual listen:** `npm run dev`, then open `/tools/audio-preview.html` and listen to every cue
      (drop, placement_error, select, save, discovery, compare_result, division, card_open, wake) and the ambient loop.
  22. **D‑0064 (2)** should reduced motion also quiet audio? Built: no. Quiet audio is the separate comfort setting (audio PROPOSED DECISION 4).
  23. **Android haptics:** P4.10 added `android.permission.VIBRATE` (D‑0093). Still open: feel the buzz on a device
      (ANDROID_SETUP §10 item 8.10). Web haptics are feature-detected, off by default, and fire only on accepted placements.
  24. **Curated dishes that end empty** (tune-g3.md). L301 Two Lunches asks "Do separate neighborhoods stay
      different?", but both neighborhoods are empty by 540 s on 6/6 seeds. L306 is empty at 600 s. L303 is item 12.
      Choose between making the dish text say the food is finite, or a new revision with one renewable source.
  25. Open PROPOSED DECISIONs in docs/reports/reviews/g3-wave-4/ not yet folded into a D‑entry:
      - field-guide-fix1 **A**: when P06 is enabled, its guide entry shows "captures within 1 cell" (CT §3.2 reach = sensingRadius).
      - field-guide-fix1 **B**: entries that relationships are never noted about (modules, structures, tools, habitats) show a fixed "Seen in your dishes" sentence.
      - wave-verify-2 item 6: accept conservation-all-pools reporting its wall time (≈ 80–120 s) instead of asserting ≤ 60 s.
        D‑0063 records this as decided; it is listed here for the owner's visibility only.
      - All the others in that folder (audio 1–3, experiments-curated, field-guide 2–6, g3-fixtures) are recorded in D‑0061…D‑0064.
  26. Wave 4 stage 2 proposals (a11y, perf, g3-evidence build reports in docs/reports/reviews/g3-wave-4b/) are folded into
      D‑0065 (a11y), D‑0066 (perf) and D‑0067 (evidence). Their owner questions:
      - **D‑0065 (1)** UX §6.1's danger colour moves from #B3473F to #AD4239 (4.5:1 on --surface-2).
      - **D‑0065 (2)** the dish summary's trend is the living count, not biomass, unless a read-only History request
        flag is added (a protocol change).
      - **D‑0066** the < 10 ms criterion here or on a phone-class device; genome-table compaction under a ruleset entry
        (item 4); the two rule-changing tick options (item 4).
      - **D‑0067** curated dishes that empty (item 24).
  27. (Lead, copy; MINOR) The inspector's "Sugar here can come from …" line names every species of the world's recorded list.
      It is built by `sugarSourcesOf`, src/worker/snapshot.ts:611. So every Phase 3 dish names Cordweavers' enzyme even with no Cordweaver present, and
      it never names an E01 carrier. Choose between naming only living kinds, or wording it as "in this kind of dish"
      (docs/reports/opening-loop-g3.md).
  28. (Lead, MINOR, carried to P4.13; **not done in P4.13**) On a phone in portrait, tapping an organism lifts the dish
      to the camera's limit (62 cells) while the inspector sheet is open, and the dish stays lifted after Close until
      the player taps Whole dish (seen in the G3 phage e2e trace; cosmetic camera state only, no outcome changes).
      Decide whether Close should restore the camera. **Update at the v1.0 gate (D‑0099):** for the keyboard this
      was a defect. The lifted view left the centre reticle below the rim, so every later Enter said "Outside the
      dish." (the gate's one e2e failure). A key that closes the inspector with the dish focused now eases the view
      back. A touch or mouse Close still keeps the lifted view, as built. Restoring it there too is a one-line call
      of `Camera.undoReveal` and the owner's choice.

  Phase 4 decisions marked "Owner review: yes" (one line each; details in docs/DECISIONS.md):
  29. **D‑0074** Prompt progress is page-session state: a loaded Garden dish starts the prompts over at step 1. Keep it in the notebook record instead?
  30. **D‑0079** Should one cross-source clock limit all unsolicited notices to one per wall-clock minute (built: per-source pacing, one visible notice)? Is the quiet first minute (no story notice in a dish's first 600 ticks) right?
  31. **D‑0082** The shelf (write-once records outside the ten named slots) as Try my dish's "slot", rather than a named slot the player can overwrite; and the transfer preview deferred to Phase 5 with the gate structures (also D‑0085).
  32. **D‑0083** Recipe files: exact build match (strict, as built; a content update stops old recipe files importing) or the looser What if? "Again" rule (ignore contentHash when the recipe checksums match)? Also accept the Share picture layout (1080 × 1080, 7 px per cell, question band, wordmark band).
  33. **D‑0087** What a challenge's budget counts (built: Add Life, Feed, Habitat, Sample Take, Clean water; narrowest D07 reading: inoculate, deposit, placeObject only), and whether a challenge goal should survive Undo (built: Undo ends it, as for every goal).
  34. **D‑0091** Release signing (owner keystore, Play App Signing) and the on-device checks (install, process death and restore, share and import, offline first launch).
  35. **D‑0092** After the device test (ANDROID_SETUP §10 items 8.4–8.5), keep the Filesystem save store on the app or flip back to IndexedDB (one line, `platformStorage()` in src/platform/capacitor.ts).
  36. **D‑0093** Keep `android:allowBackup="true"`; settings in WebView localStorage instead of Preferences; INTERNET kept until a device test without it passes (ANDROID_SETUP §10 item 6); the icon art, including the legacy icon's simpler colony; the device smoke test (§10 item 8).
  37. **D‑0094** The open performance criteria (1× tick < 10 ms at 6,000 agents; heap slope with a save; web worker heap at 4×) and their D‑0066 rule-changing options (diffusion cutoff, half-rate enzyme/inhibitor diffusion, entity-order locality, genome-table compaction); the device steps (heat, battery, frame rate, touch p95).
  38. **D‑0097** The arcade's manifest/embedding and offline rules; full or demo build for the arcade; the demo's store link (checklist §B10, §C).
  39. **D‑0098** Tablet screenshots in 9:16 (1152 × 2048, 1440 × 2560) instead of ARCH §15's 1600 × 2560; the store icon framing (dish at 75 % of the square); the listing text; the privacy wording that names the phone's own backup.
  40. **D‑0089** (visibility; "Owner review: no") Listen to the 16 narration phrases on a device (Settings → Sound → Narration): SpeechSynthesis voices vary.
  41. **D‑0086** (visibility; "Owner review: no") Snapshot bookmarks are limited per device (20 across all dishes), bookmarks per dish (50).

- **Owner tasks: the D9 §12 usability gates** (formative, not required for submission; protocol, counts and pass
  marks in PLAY_STORE_CHECKLIST §B9; record results in §7.1 "Usability gates"; a parent or guardian present for every
  child, no accounts, trackers or analytics):
  - U1 **Appeal in ten seconds**: 8 adult viewers see a 10-second clip of real play; pass ≥ 6 of 8 describe changing a dish and watching living consequences.
  - U2 **Accessible first experiment**: 5 supervised children (and 2 adult novices, recorded separately) start the Garden, feed, find a response and pause with ≤ 1 verbal prompt; pass ≥ 4 of 5 children.
  - U3 **Replay invitation**: 8 novices finish one Garden session; pass ≥ 5 of 8 choose a second setup voluntarily.
  - U4 **Share clarity**: 5 testers pick Picture, Starting recipe and Living dish for the three tasks; pass ≥ 4 of 5.
  - U5 **Technical integrity** is the automated suite (§4); nothing to run by hand.
  - The D06 §18 five-tester comprehension session (item 11) is separate and still open.
- **Owner tasks: store and devices** (PLAY_STORE_CHECKLIST §B, in order):
  - §B1 Play Console account and identity; §B2 create the app (Pixelmeba, Game, Paid, USD 0.99, countries);
  - §B3 host the privacy policy and paste the URL; §B4 the App content declarations (ads: none, app access, content rating, target audience, data safety, the other declarations);
  - §B5 signing and the release bundle (keystore, Play App Signing, a signed `bundleRelease`; re-check the target API);
  - §B6 device tests on a named phone: store/smoke-test.md, the perf-rc1.md device readings, ANDROID_SETUP §10 item 8 (8.1–8.13), the INTERNET removal test, the launcher icon on real launchers, then item 35;
  - §B7 Internal testing upload of `app-release.aab` as `1.0.0 (10000)`, then the Pre-launch report;
  - §B8 store listing upload (listing.md blocks, icon, feature graphic, the 18 screenshots regenerated on the final tree, category Games › Simulation, support email `<owner: support email>`);
  - §B9 the usability gates above; §B10 the arcade build (item 38); §B11 promote and launch, then watch Play vitals.
- **Next:** after `v1.0.0-rc1`, Phase 5 (Expanded Ecology) → `v1.1.0`, flag-gated content (BUILD_DIRECTIVE Phase 5).
