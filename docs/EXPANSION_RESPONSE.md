# EXPANSION_RESPONSE — the single status and evidence report

Update at every gate (`g0` … `v1.3.0`). Replace placeholders with real, pasted outputs. Separate
**implemented**, **tested**, and **proposed/deferred**. Never claim a pass that did not run in
this session. Keep older gate evidence in `docs/reports/` and link it.

Last updated: 2026‑09‑27 · Gate: **G1 (first playable)** · Commit: see `git log` (tag `g1`; G0 evidence kept below)

---

## 1. Build identity
- Repository: `github.com/Stephenuffugus/pixelmeba`, branch `main`.
- Runtime: Node 24.21.0 (`.nvmrc` 24), npm 12.1.0, linux x64 (Codespace, 2 vCPU, 7 GB).
- Pinned dependencies (exact, `package-lock.json` committed): vite 8.3.1, pixi.js 8.21.0,
  preact 10.29.8, @preact/signals 2.11.2, zod 4.6.5, typescript 6.0.3, vitest 5.0.2,
  @playwright/test 1.63.0, @axe-core/playwright 4.13.0, eslint 10.11.0, typescript-eslint 8.70.1,
  prettier 3.9.9, tsx 4.23.15, @capacitor/{core,cli,android} 8.5.2, @capacitor/app 8.1.1,
  filesystem 8.1.3, share 8.0.2, preferences 8.0.1, splash-screen 8.0.2, status-bar 8.0.3,
  vite-plugin-pwa 1.3.0, pngjs 7.0.0.
  - TypeScript 7.0.2 exists but is outside typescript-eslint's peer range (< 6.1), so 6.0.3 is pinned.
  - npm 12 gates install scripts: esbuild's postinstall is explicitly approved in `allowScripts`.
- Versions: `simulationVersion` 3 · `evolutionRulesVersion` 1 · `moduleRegistryVersion` 1 ·
  `phenotypeMappingVersion` 1 · `contentVersion` 1 · world `schemaVersion` 1.
- `contentHash` d795100f14bcd09b82c36e84620dc1e20598c81d5b8bb539632190c125e91920.
- Measurement machine for all numbers below: the Codespace above (not a phone).

## 2. Implemented scope
| Phase | Status | Species enabled | Modules enabled | Systems enabled | Missing / known limitations |
|-------|--------|-----------------|-----------------|-----------------|-----------------------------|
| 0 | **Implemented, gate passed** (`g0`) | B01 B04 B06 A01 P01 (data); all 38 species authored and validated | none | core, enzymes | — |
| 1 | **Implemented, gate passed** (`g1`) | B01 B04 B06 A01 P01 | none (draws recorded, registry empty until P2.1) | core, enzymes | 60 fps not measurable here (software WebGL); device measurement P3.12. Overlay picker arrives with the Lab Observe tray (P2.7). Android install on a device not verified (no device). |
| 2–7 | Not started | | | | |

Phase 1 in the browser: Home, Play shelf, New Dish, the Garden in Explore view (Add Life, Feed,
Look, undo that rewinds time), inspector with Summary/Why/Details and four shortcut questions,
cell inspector, family rings, event feed, History charts (small multiples) and table, ten save
slots plus autosave, `.pixelmeba` export/import with full validation, duplicate, Settings (text
size to 200 %, reduced motion), worker-owned simulation with protocol versioning and rollback on
error, PixiJS renderer with whole-dish aggregation and catalysis dust.

Content catalog authored now (all phases, validated, not enabled): 38 species, 17 modules,
32 materials. Every value was written against CONTENT_TABLES and then independently checked field
by field by a separate verifier; 10 text discrepancies were found and fixed, 1 rejected with cited
reasoning (B09 headings stay 4).

## 3. Resolved specification
- Canonical docs: BUILD_DIRECTIVE, PIXELMEBA_IMPLEMENTATION_SPEC, CONTENT_TABLES, ARCHITECTURE,
  UX_SPEC, CONFLICT_REGISTER (R01–R40 applied where relevant).
- G0 decisions: D‑0001 … D‑0010 (see DECISIONS.md; D‑0005 FIRST_DISH_V1 Sunbead radius 4 → 5).
- G1 decisions:
  - D‑0011 sugar shown as a faint haze in Explore; D‑0012 determinism-review follow-ups;
  - D‑0013 saves in IndexedDB from the worker (atomic transaction, predecessor kept) on web and
    Android;
  - D‑0014 charts as small multiples in one validated ink (species hues fail CVD checks);
  - D‑0015 FIRST_DISH_V1 kept (targets met; candidates measured, none clearly better);
  - D‑0016 aggregation exactly when the snapped sprite scale is below 1;
  - D‑0017 sheets scroll inside; the inspector keeps its organism in view and can collapse;
  - D‑0018 the worker stamps seq/targetTick; protocolVersion on every packet.
- Remaining conflicts: none open.

## 4. Correctness evidence (G1)
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

## 4b. Correctness evidence (G0, kept)
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
Opening loop (docs/reports/opening-loop-g1.md), FIRST_DISH_V1 seed 104729, headless Chromium:
- Food → growth: 56 → 77 alive by 50 s; Sunbeads split first (29 s), Sprinters from 35 s.
- Starch → sugar: catalysis dust on the starch patch; a Crumbsmith's "What does it eat?" explains
  the enzyme and reports its measured intake; "Why did it stop?" lists every division blocker with
  its value ("Body 1.23 of 2.00 needed. Energy 31 of 60 needed.").
- Intervene and inspect: Feed adds sugar to 32 cells; 15 s later a generation‑1 Sprinter there is
  eating (0.015 C in the last second).
- Inherited differences appear in History ("2 Sunbead offspring inherited different traits.").
- Save → reload → Continue returns to the same moment, paused; Duplicate makes an independent copy.

Seed report (docs/reports/tune-g1.md): D06 targets met on 6/6 development seeds (first intake at
tick 0, first division 29.3 s). Crumbsmiths stall after about 60 s (energy below the 35 emit
threshold); Recyclers empty their patch by about 120 s and die out on 3/6 seeds by 600 s. Recipe
candidates were measured and none adopted (D‑0015).

## 6. Design handoff
- Art is code: palette‑indexed pixel matrices in `art/src/`, compiled by `npm run art:build` to
  `public/atlas/organisms.png` + `manifest.json` (189 frames, hash 0da0be41a127, deterministic).
- `tools/asset-preview.html` (Vite dev server) shows every species × animation × heading,
  a grayscale toggle and a dense group of 60; `npm run art:preview` renders the same to a PNG.
- Sprites follow UX §6–§7: B01/B04/B06 16×16 with 4 headings; A01 16×16 one heading; P01 32×32.
- Charts use one validated ink (#256E9E) as small multiples (D‑0014).
- Not yet: launcher icon, splash, store art (Phase 4), sound (Phase 4).

## 7. Performance and saves
- Headless tick cost, FIRST_DISH_V1, 6000 ticks, up to 710 agents: p50 1.28 ms, p95 2.61 ms,
  p99 4.62 ms. Stage breakdown per tick: environment 0.59 ms, sense/move 0.42 ms, intake 0.26 ms,
  maintenance 0.12 ms, births 0.05 ms. Target‑population (6,000 agents) measurement is P3.12.
- Renderer (docs/reports/render-perf-g1.md): 6,000 sprites at neighborhood zoom. **60 fps was not
  reached in this environment**: 3.1–3.3 fps at 1440×900 and about 10 fps at 360×800 under
  SwiftShader software WebGL on a shared 2‑CPU machine, where an empty WebGL page runs at 60 fps
  and one full‑screen textured quad alone drops to about 23 fps. The renderer's own JavaScript
  costs about 1.1–1.6 ms per frame plus 3.5–4.6 ms per snapshot (10 per second) under load. A GPU
  device measurement is required (P3.12). Aggregation and reduced‑motion rules are checked by the
  bench on every run.
- Saves: serialize 18 ms and deserialize 26 ms at 718 organisms (was 230 ms before table‑driven
  base64). IndexedDB single‑transaction commit with the predecessor retained; gzip on disk.
  Autosave every 30 s of real time while running, on backgrounding, on leaving the page and on a
  manual save. Rollback checkpoint every 30 simulated seconds.
- Android spike (P1.11): Capacitor 8.5.2 project `com.lucidwinds.pixelmeba`, minSdk 24,
  compileSdk and targetSdk 36 (Play requires API 36 from 2026‑08‑31). With JDK 21 and a
  command‑line SDK, `assembleDebug` built a 6.0 MB debug APK and `bundleRelease` built a 4.3 MB
  unsigned AAB; a signed build with a throwaway keystore outside the repo verified and was deleted.
  JDK 25 (the Codespace default) cannot run Gradle 8.14.3. **Not verified:** install and launch on
  a device or emulator (none here). Open: the template's `INTERNET` permission (ARCH §12 wants
  none; remove only after a device test), launcher icon and splash (Phase 4). Steps are in
  `docs/ANDROID_SETUP.md`.

## 8. Changes and next gate
- Tuning revisions: none (FIRST_DISH_V1 kept, D‑0015).
- Next gate G2: P2.1 module framework (E01, E03, E05), P2.2 founder modes and presets, P2.3 branch
  discovery and lineage, P2.4 comparison engine, P2.5 experiments, P2.6 What if?, P2.7 Lab view,
  P2.8 regional graphs, checkpoint ring and journal, P2.9 second tuning report.
- Environment limits (documented, not blocking): no GPU (frame rates are software‑rendered lower
  bounds), no Android device or emulator (install/launch unverified).
- **Owner decisions required** (none block current work):
  1. Play Store: price ($0.99 assumed), countries, Families program opt‑in, content rating answers.
  2. Privacy policy hosting URL.
  3. Signing keystore creation and Play App Signing enrollment (owner‑held).
  4. Minimum Android device for measured performance gates.
  5. Lucid Winds Arcade manifest/embedding format.
  6. Whether the web build is full or DEMO_MODE.
