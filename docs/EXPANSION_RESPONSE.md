# EXPANSION_RESPONSE — the single status and evidence report

Update at every gate (`g0` … `v1.3.0`). Replace placeholders with real, pasted outputs. Separate
**implemented**, **tested**, and **proposed/deferred**. Never claim a pass that did not run in
this session. Keep older gate evidence in `docs/reports/` and link it.

Last updated: 2026‑10‑01 · Gate: **G2 (core abilities, comparison, What if?)** · Commit: tag `g2` (G1 and G0 evidence kept below)

---

## 1. Build identity
- Repository: `github.com/Stephenuffugus/pixelmeba`, branch `main`.
- Runtime: Node 24.21.0 (`.nvmrc` 24), npm 12.1.0, linux x64 (Codespace, 2 vCPU, 7 GB).
- Pinned dependencies unchanged since G1 (exact, `package-lock.json` committed): vite 8.3.1, pixi.js 8.21.0,
  preact 10.29.8, @preact/signals 2.11.2, zod 4.6.5, typescript 6.0.3, vitest 5.0.2,
  @playwright/test 1.63.0, @axe-core/playwright 4.13.0, eslint 10.11.0, typescript-eslint 8.70.1,
  prettier 3.9.9, tsx 4.23.15, @capacitor/{core,cli,android} 8.5.2, @capacitor/app 8.1.1,
  filesystem 8.1.3, share 8.0.2, preferences 8.0.1, splash-screen 8.0.2, status-bar 8.0.3,
  vite-plugin-pwa 1.3.0, pngjs 7.0.0.
- Versions: `simulationVersion` 3 · `evolutionRulesVersion` 1 · `moduleRegistryVersion` 1 ·
  `phenotypeMappingVersion` 1 · `contentVersion` 1 · `buildPhase` 2 · world `schemaVersion` 3
  (2 = P2.1 `dryTimer`; 3 = P2.8 `history.traits`/`history.journal`) · `PROTOCOL_VERSION` 1 ·
  atlas manifest version 1.
- `contentHash` e88b629838a74fa5013ebde92659f067287db9562d957ef8ba0721e017964ca5.
- Measurement machine for all numbers below: the Codespace above (not a phone).

## 2. Implemented scope
| Phase | Status | Species enabled | Modules enabled | Systems enabled | Missing / known limitations |
|-------|--------|-----------------|-----------------|-----------------|-----------------------------|
| 0 | **Implemented, gate passed** (`g0`) | B01 B04 B06 A01 P01 (data); all 38 species authored and validated | none | core, enzymes | — |
| 1 | **Implemented, gate passed** (`g1`) | B01 B04 B06 A01 P01 | none | core, enzymes | 60 fps not measurable here (software WebGL); device measurement P3.12. Android install on a device not verified (no device). |
| 2 | **Implemented, gate passed** (`g2`) | B01 B04 B06 A01 P01 | E01 Starch enzyme, E03 Resting stage, E05 Reserve chamber | core, enzymes | The five-tester comprehension session (D06 §18) is an owner item; the build agent's self-review is in §5. Owner questions D‑0022, D‑0027, D‑0031, D‑0038 (§8). |
| 3–7 | Not started (Phase 3 lead choices D‑0035…D‑0039 recorded) | | | | |

Phase 2 in the browser, on top of Phase 1:
- **Abilities (P2.1):** the module framework with E01 (starch enzyme), E03 (resting stage: preparing,
  resting, waking, a 30 s post-wake lockout with its own reason) and E05 (reserve chamber), drawn as
  atlas marks; module gains and losses are inherited, recorded per daughter and shown in the
  inspector, lineage and History.
- **Founders and presets (P2.2):** Identical / Varied / Diverse founders; Standard / Accelerated /
  Fixed mutation presets with an Advanced panel that shows the per-birth chances; changing the preset
  is a timed, undoable intervention; the "Core prototype — quantitative evolution" label while the
  registry is partial.
- **Branches and lineage (P2.3):** branch discovery from recorded evidence, naming and pinning, the
  lineage panel, follow lineage, a trait overlay, specimens and the discovery card.
- **Comparison (P2.4):** a deterministic paired-run engine, results with honest wording and a
  prediction note.
- **Experiments (P2.5):** the experiments framework, EXP_A/B/C, and the Food trail, Light and life,
  Cleaning crew and Predator balance cards in Notebook → Experiments, with stamps in the Journal.
- **What if? (P2.6):** recipe variants R‑G0…R‑G3, Again, Another idea, a preview and recorded
  metadata; every action that replaces the open dish keeps it first (D‑0033).
- **Lab view (P2.7):** categories and trays, brushes, habitat paint (substrate, shade), stone, wall and
  bead placement with a sealing planner, the overlays picker and charts.
- **Observation (P2.8):** regional trait graphs (whole dish and quarters), an automatic checkpoint ring,
  and a journal saved with the dish.
- **Tuning (P2.9):** the second development-seed report (Standard and Accelerated, `docs/reports/tune-g2.md`).

Content catalog (all phases, validated): 38 species (5 enabled), 17 modules (3 enabled), 32 materials,
1 habitat, 3 structures, 7 recipes, 7 experiment cards, 4 variants.

## 3. Resolved specification
- Canonical docs: BUILD_DIRECTIVE, PIXELMEBA_IMPLEMENTATION_SPEC, CONTENT_TABLES, ARCHITECTURE,
  UX_SPEC, CONFLICT_REGISTER (R01–R40 applied where relevant).
- G0 decisions D‑0001…D‑0010; G1 decisions D‑0011…D‑0018 (see the G1 list in git history of this file).
- G2 decisions:
  - D‑0019 module framework and the resting stage (world schema 2, `dryTimer`); D‑0023 energy held at death is ledgered;
  - D‑0020 comparison engine; D‑0021 What if? variants; D‑0022 experiments framework (owner question on EXP_A);
  - D‑0024 Lab view; D‑0025 branches, lineage panel and specimens; D‑0026 What if? sheet;
  - D‑0027 one paired-run model, Experiment C and the cards (owner question on RESERVE_COMPARE);
  - D‑0028 wave B fix rounds; D‑0029 wave C lead pass (keys, stripped export, migration provenance, the action chip);
  - D‑0030 founder modes and presets; D‑0031 regional trait graphs, checkpoint ring and journal (world schema 3; owner question: one ring per device);
  - D‑0032 module marks in the atlas, DORMANCY_LOCKOUT, sim-tune producers;
  - D‑0033 keep the open dish first on every replacement (closes D‑0030's owner note); D‑0040 its fix round 3 (Continue written by exact record, one dish clock per save, curly quotes, 16 px toasts, named module gains);
  - D‑0034 second tuning report: FIRST_DISH_V1 kept; a supplementary 1,200 s horizon;
  - D‑0041 comprehension self-review fixes (taps outside the dish, saved result cards in the Journal, inherited differences named from birth records, honest comparison and food lines);
- Phase 3 lead choices recorded before the gate: D‑0035 (world schema 4 keeps old saves' hashes; a
  usable-intake seconds column), D‑0036 (the Preflight bumps buildPhase 3 / contentVersion 2),
  D‑0037 (Sample Cancel is host-level and exact), D‑0038 (film is eaten as detritus), D‑0039 (tool texts
  as content; relationship observations per device).
- Remaining conflicts: none open.

## 4. Correctness evidence (G2)
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

## 4b. Correctness evidence (G1, kept)
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

## 4c. Correctness evidence (G0, kept)
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
Comprehension self-review (docs/reports/comprehension-g2.md, `tools/review-g2.mjs`): the five D06 §18
tester tasks — make a change, show why something changed and keep a second version; a food source; a
cause of population change; an inherited trait against a temporary state; a difference between two
dishes — were each done from a cold start using only what the screen offers, within ten minutes, at
1440×900 and 360×800 (one task also at 800×360 and at 200 % text). Scripted times from Home, slowest
layout plus 10 s per action: T1 ≈ 7:50, T2 ≈ 6:05, T3 ≈ 6:35, T4 ≈ 4:05, T5 ≈ 5:20. Finding a creature
that actually differs from its parent took luck in one run of four (M2); that is now stated in the
inspector and the event lines from birth records (D‑0041). This is the build agent's self-review; the
five-tester session remains an owner item (§8).

Seed report (docs/reports/tune-g2.md, D‑0034): the D06 targets hold on 6/6 seeds at Standard and
Accelerated (first intake at tick 0, first division 29.3 s). Accelerated shows a module gain on 6/6
seeds (median 88.9 s) and a confirmed branch on 6/6 (median 312.1 s) within ten minutes at 1×;
Standard shows gains on 6/6 (median 255.9 s) and a confirmed branch on 1/6 by 600 s (4/6 by
1,200 s), which D06 §9 allows. Every draw count lies inside its preset's 95 % range, every committed
daughter reproduces its recorded draw, and the ledger is exact.

## 6. Design handoff
- Art is code (`art/src/`), compiled by `npm run art:build` to `public/atlas/organisms.png` +
  `manifest.json`: 221 frames including the module marks (starch notch, resting seam ×3,
  reserve pocket ×4, four headings each), keyed `feature/<layer>/<heading>/<frame>` (D‑0032);
  deterministic (`--check`).
- Charts stay small multiples in one validated ink (D‑0014), now also for regional trait graphs.
- Not yet: launcher icon, splash, store art (Phase 4), sound (Phase 3 P3.10 / Phase 4).

## 7. Performance and saves
- Headless tick cost (docs/reports/tune-g2.md, seven interleaved rounds under load 4.8–6.9 on this
  2-CPU machine): FIRST_DISH_V1 seed 104729, 6,000 ticks, up to ≈ 720 agents — G2 Standard wall p50
  4.14 ms (range 2.01–4.61), p95 10.23 ms, p99 15.15 ms; Accelerated p50 4.25 ms; the `g1` tag 4.21 ms
  on the same rounds: no difference visible at this machine's ±10 % resolution. Heaviest stages
  (Standard, ms per tick): environment 2.04, sense/move 1.13, intake 0.74, maintenance 0.36,
  births 0.32, conversion 0.15. These do not test the SPEC §16 device budget (P3.12).
- Renderer: unchanged from G1's measurement (docs/reports/render-perf-g1.md); module marks are atlas
  frames in the same texture and draw batch.
- Saves: world schema 3 with migration by copy from schemas 1 and 2 (`provenance.migratedFrom`);
  the checkpoint ring (10 per device, whole dish-minutes) on the same atomic, checksummed,
  predecessor-keeping store; the journal travels with the dish; every replacing action keeps the open
  dish first (D‑0033); an unchanged dish is never rewritten: each autosave builds and compares the file (171–504 ms at 10 dish-minutes on this loaded machine, D‑0040).
- Android: unchanged since G1 (debug APK and unsigned AAB build; install/launch unverified, no device).

## 8. Changes and next gate
- Tuning revisions: none (FIRST_DISH_V1 kept at G1 and G2: D‑0015, D‑0034).
- Next gate G3 (Launch Ecology): Preflight (determinism fence) then six waves — P3.1 chemistry and
  environment, P3.2 habitats, P3.3/P3.4 organism waves A and B, P3.5 Sample/Transfer/Clean water,
  P3.6 living chemistry and food objects, P3.7 modules E04–E12, P3.8 Field Guide, P3.9 experiments
  and curated dishes, P3.10 audio, P3.11 accessibility, P3.12 performance.
- Environment limits (documented, not blocking): no GPU (frame rates are software-rendered lower
  bounds), no Android device or emulator (install/launch unverified).
- **Owner decisions required** (none block current work):
  1. Play Store: price ($0.99 assumed), countries, Families program opt‑in, content rating answers.
  2. Privacy policy hosting URL.
  3. Signing keystore creation and Play App Signing enrollment (owner‑held).
  4. Minimum Android device for measured performance gates.
  5. Lucid Winds Arcade manifest/embedding format (a deploy tool for the arcade's In Development
     shelf now exists: `tools/deploy-arcade.mjs`).
  6. Whether the web build is full or DEMO_MODE.
  7. D‑0022: Experiment A — all 12 Crumbsmiths starve by ≈ 150 s in both copies; revise to bootstrap
     0.50 (keeps them alive but no longer separates the copies)? Rectangle patch shape for recipes?
  8. D‑0027: RESERVE_COMPARE_V2 with a 2.0 meal dose so the gate can be reached?
  9. D‑0031: one checkpoint ring per device (chosen; bounded storage) or one per dish?
  10. D‑0038: film eaten as detritus (chosen) or as a separate food (a forced rules change)?
  11. D06 §18 five-tester comprehension session: recruit five testers unfamiliar with the design and
      run the ten-minute task (the self-review in §5 is not a substitute).
