# EXPANSION_RESPONSE — the single status and evidence report

Update at every gate (`g0` … `v1.3.0`). Replace placeholders with real, pasted outputs. Separate
**implemented**, **tested**, and **proposed/deferred**. Never claim a pass that did not run in
this session. Keep older gate evidence in `docs/reports/` and link it.

Last updated: 2026‑09‑27 · Gate: **G0 (foundation)** · Commit: see `git log` (tag `g0`)

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
| 0 | **Implemented, gate passed** | B01 B04 B06 A01 P01 (data); all 38 species authored and validated | none | core, enzymes (fields only) | Stage 3 (enzymes) and stage 5 (predation) are no‑ops until P1.1; mutation draws until P1.2; so B06 cannot yet convert starch and P01 cannot yet hunt. |
| 1–7 | Not started | | | | |

Content catalog authored now (all phases, validated, not enabled): 38 species, 17 modules,
32 materials. Every value was written against CONTENT_TABLES and then independently checked field
by field by a separate verifier; 10 text discrepancies were found and fixed, 1 rejected with cited
reasoning (B09 headings stay 4).

## 3. Resolved specification
- Canonical docs: BUILD_DIRECTIVE, PIXELMEBA_IMPLEMENTATION_SPEC, CONTENT_TABLES, ARCHITECTURE,
  UX_SPEC, CONFLICT_REGISTER (R01–R40 applied where relevant to Phase 0).
- Decisions this gate (docs/DECISIONS.md): D‑0001 decision cadence, D‑0002 birth placement order,
  D‑0003 sensing rounding, D‑0004 death‑cause attribution window, **D‑0005 FIRST_DISH_V1 Sunbead
  radius 4 → 5** (the documented center (48,48) lies inside the Water Garden stone disk, leaving
  10 cells for 12 founders; radius 5 is the smallest fix and selects the same nearest cells as any
  radius ≥ 4.5), D‑0006 attached species list water as habitat (surface check lands in P3.3),
  D‑0007 Siltworm habitat/water crossing, D‑0008 film halves total inhibitor exposure once.
- Remaining conflicts: none open.

## 4. Correctness evidence (G0)
```
npm run check            → typecheck ok · lint ok · 93 tests passed (10 files)
npm run content:validate → content ok · contentHash d795100f…920 · species 38 (enabled 5) · materials 32 · modules 17
```
| G0 fixture | File | Result |
|---|---|---|
| Neutral founders | tests/fixtures/neutral-founders.test.ts | pass — all 38 species' neutral profiles equal CT §1.2/§1.3 (parsed from the doc itself); inactive loci create no movement or sensing; active loci move in the documented direction with their costs |
| Conservation, closed lid | tests/fixtures/conservation-closed-lid.test.ts | pass — 10,000 ticks with B01 B04 B06 A01 P01: worst relative error **C 6.36e‑15, N 1.10e‑13** (limit 1e‑5); 466 births, 318 deaths; no exchange, no inputs after start; inactive fields verified zero |
| Determinism | tests/fixtures/determinism.test.ts | pass — two fresh runs identical at 6 checkpoints; chunked stepping with interleaved hashing/serialization equals straight stepping; save at 3000 → JSON → reload → 6000 equals uninterrupted (**endpoint 525193f459460549**, 756 alive); different seed diverges |
| No free growth | tests/fixtures/no-free-growth-and-fairness.test.ts, tests/sim/feeding.test.ts | pass — no food, no nutrient, no light, no CO2 ⇒ no biomass; energy falls by maintenance + movement exactly, then health −4/s at E = 0; division never creates material |
| Fair shared food | same file | pass — eight identical Sprinters on a scarce pool get equal shares in two insertion orders; the pool is shared out exactly |
| Content validation | tests/content/validator.test.ts | pass — shipped content valid; broken packs fail naming file and field (negative/non‑finite, reversed range, unknown prey/habitat, duplicate id, file/id mismatch, unimplemented ability, recipe outside manifest, native‑equivalent eligibility) |

Headless runner: `npm run sim:run -- --recipe FIRST_DISH_V1 --seed 104729 --ticks 6000 --perf`
→ endpoint `576350939f1d34b2`, ledger relErr C 1.1e‑14 N 1.0e‑13, 710 alive at 600 s.

## 5. Experience evidence
Not applicable at G0 (no playable). First observation from the headless run (FIRST_DISH_V1,
seed 104729, no interventions): first intake at tick 0; first division at 29.3 s (Sunbead),
Sprinter 36.5 s, Recycler 56.7 s, Crumbsmith 188.6 s. At 600 s: 210 Sprinter, 488 Sunbead,
12 Crumbsmith; Recyclers died out (their debris patch is small and 16 cells from the starch
patch, beyond their 2‑cell sensing). Crumbsmith cannot yet unlock starch (P1.1). Tuning is P1.12.

## 6. Design handoff
Not started (P1.4).

## 7. Performance and saves
- Headless tick cost, FIRST_DISH_V1, 6000 ticks, up to 710 agents: p50 1.28 ms, p95 2.61 ms,
  p99 4.62 ms. Stage breakdown per tick: environment 0.59 ms, sense/move 0.42 ms, intake 0.26 ms,
  maintenance 0.12 ms, births 0.05 ms. (Environment was 1.3 ms before the row‑major kernel and
  active‑field tracking.) Target‑population (6,000 agents) measurement is P3.12.
- Save skeleton: full world serializes to JSON (typed arrays base64) and reloads to an identical
  state hash. Storage adapters, slots and import validation are P1.9.
- Android: not started (P1.11). No Android SDK in this environment (JDK 25 present).

## 8. Changes and next gate
- Tuning revisions: none yet.
- Next gate G1: P1.1 enzymes + predation, P1.2 quantitative evolution, P1.3 worker, P1.4 art,
  P1.5 renderer, P1.6 UI shell, P1.7 inspector, P1.8 tools/undo, P1.9 persistence, P1.10 history,
  P1.11 Android spike, P1.12 seed report.
- **Owner decisions required** (none block current work):
  1. Play Store: price ($0.99 assumed), countries, Families program opt‑in, content rating answers.
  2. Privacy policy hosting URL.
  3. Signing keystore creation and Play App Signing enrollment (owner‑held).
  4. Minimum Android device for measured performance gates.
  5. Lucid Winds Arcade manifest/embedding format.
  6. Whether the web build is full or DEMO_MODE.
