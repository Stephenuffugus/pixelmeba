# EXPANSION_RESPONSE — the single status and evidence report

Update at every gate (`g0` … `v1.3.0`). Replace placeholders with real, pasted outputs. Separate
**implemented**, **tested**, and **proposed/deferred**. Never claim a pass that did not run in
this session. Keep older gate evidence in `docs/reports/` and link it.

Last updated: 2026‑10‑10 · Gate: **G3 (Launch Ecology)** · Commit: `<lead>` (tag `g3`) · **DRAFT** by the
wave 4 stage 2 g3-evidence builder. Items marked `<lead>` are for the lead to fill in at the gate. G2, G1 and G0
evidence is kept below as §4b–§4d.

---

## 1. Build identity
- Repository: `github.com/Stephenuffugus/pixelmeba`, branch `main`. Commit to be tagged `g3`: `<lead>`.
  This draft was written against HEAD `cbdddf3` with wave 4 stage 2 uncommitted in the tree: a11y,
  perf (hash-neutral src/sim hot-path edits in flight), and this evidence.
- Runtime: Node 24.21.0 (`.nvmrc` 24), npm 12.1.0, linux x64 (Codespace, 2 vCPU, 7 GB).
- Dependencies: unchanged since G2 (`git diff g2 HEAD -- package.json` is empty; exact pins, `package-lock.json`
  committed). See the §1 list of the G2 edition (git history of this file).
- Versions (content/manifest.json): `simulationVersion` 3 · `evolutionRulesVersion` 1 ·
  `moduleRegistryVersion` **2** (D‑0059) · `phenotypeMappingVersion` 1 · `contentVersion` **2** ·
  `buildPhase` **3** (D‑0036) · `developmentalEnabled` false.
  - World `SCHEMA_VERSION` **4** (src/sim/world.ts:36; D‑0035, D‑0043). Its stateHash is unchanged for old saves.
  - `PROTOCOL_VERSION` **2** (src/worker/protocol.ts:23; ENT_STRIDE 14; D‑0050).
  - Atlas manifest version 1, with 856 frames on a 1024×1024 sheet.
- `contentHash` 8a004f512270aed1ce13985d193a6814069cc0c70ec58dc30f78878153a8b6cb (content/manifest.json;
  written by `content-validate --write` in the wave 4 lead fixes). `<lead>`: re-run `npm run content:validate`
  at the gate. If the EXP_104 revision changes content, paste the new hash here and regenerate
  docs/reports/relationships-g3.md (D‑0063).
- Measurement machine for all numbers below: the Codespace above (not a phone), shared with the other
  stage 2 agents while this draft's numbers were taken (1-minute load 1.8–7.4).

## 2. Implemented scope
| Phase | Status | Species enabled | Modules enabled | Systems enabled | Missing / known limitations |
|-------|--------|-----------------|-----------------|-----------------|-----------------------------|
| 0 | **Implemented, gate passed** (`g0`) | B01 B04 B06 A01 P01 (data); all 38 species authored and validated | none | core, enzymes | — |
| 1 | **Implemented, gate passed** (`g1`) | B01 B04 B06 A01 P01 | none | core, enzymes | 60 fps not measurable here (software WebGL). Android install on a device not verified (no device). |
| 2 | **Implemented, gate passed** (`g2`) | B01 B04 B06 A01 P01 | E01, E03, E05 | core, enzymes | Five-tester comprehension session is an owner item. |
| 3 | **Implemented; gate evidence assembled (this draft); tag `g3` pending** `<lead>` | 19: A01 Sunbead, B01 Sprinter, B02 Velvet, B03 Dusk, B04 Recycler, B05 Crossfeeder, B06 Crumbsmith, B07 Oilwick, B08 Brothmaker, F01 Threadlace, F02 Cordweaver, P01 Amoeba, P02 Ciliate, P03 Rotifer, P04 Siltworm, V01 Pinphage, X01 Hitcher, Y01 Bubble, Y02 Creambud | 10: E01 Starch release, E03 Resting stage, E04 Surface anchor, E05 Reserve chamber, E06 Shade collector, E07 Light seeker, E08 Debris feeder, E09 Protein release, E10 Matrix builder, E12 Colony adhesion | chemistry, core, enzymes, film, foodObjects, fungi, parasites, viruses | See the limitations list below this table. |
| 4–7 | Not started (Phase 4 runner edition prepared: docs/agent) | | | | |

Phase 3 limitations (the last column of the Phase 3 row):
- EXP_104 does not reach its gate on CT's recipe (D‑0062). The lead's revision is pending, otherwise the card is kept out of v1.0.
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
  docs/reports/reviews/g3-wave-4b/a11y-build.md). `<lead>`: decision number when committed.
- **Performance pass 1 (P3.12):** hash-neutral hot-path edits halve the 6,000-agent tick (CPU p50 38.5 → 18.8 ms). The < 10 ms gate is not met on
  this machine (§7). A stress tool (`tools/perf-stress.ts`), a render bench for the Phase 3 scene and docs/reports/perf-g3.md were added.
  `<lead>`: decision number and integration.

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
  - `<lead>`: the a11y, perf and G3-evidence decisions of wave 4 stage 2, and the EXP_104 revision.
- Remaining conflicts: none open in CONFLICT_REGISTER. Owner questions: §8.

## 4. Correctness evidence (G3)

Every row below was run by the g3-evidence builder in this session as targeted vitest batches (or a single
desktop Playwright journey) on the shared 2-CPU machine. Wall times are inflated by the other stage 2
agents: the 1-minute load was 2.5–7.4 throughout. The lead runs `npm run check`, all three e2e projects and
`content:validate` at the gate.

`<lead>`, gate-wide commands:
```
npm run check            → <lead>
npx playwright test      → <lead> (all three projects; incl. launch-ecology, lab-tools, keyboard, a11y-screens)
npm run content:validate → <lead> (contentHash, atlas complete)
npm run art:build --check → <lead>
```

**Appendix A gate message, draft** (the lead replaces each `<lead>` with the gate-time result):
```
gate: g3
check: npm run check → <lead>
e2e: npm run test:e2e → <lead> (this draft: launch-ecology desktop 1 passed)
content: npm run content:validate → <lead> (contentHash 8a004f512270… at draft time)
tune: npm run sim:tune -- --recipes <all 18> --seconds 600 --extend 1200 --presets standard → docs/reports/tune-g3.md
perf: tick CPU p50 18.8 / p95 23.9 ms @ 6,000 agents (2,000 fungal) on AMD EPYC 7763 2 vCPU, shared (provisional; <lead> quiet re-measure)
determinism: d76ceab90c3cf733 (1x) == d76ceab90c3cf733 (4x) == d76ceab90c3cf733 (reload)   [determinism-g3, this draft's tree]
conservation: C err 6.1e-13 %, N err 7.1e-12 % (all pools, 10,000 ticks); closed lid C 5.2e-13 %, N 1.1e-11 %
open owner decisions: <lead> (27 items in §8 at draft time) (see EXPANSION_RESPONSE §8)
```

**Batches run for this draft** (each line is the vitest summary for the files named in the table below):
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
| relationship matrix (every catalog relationship) | tests/fixtures/relationship-matrix.test.ts; tools/relationship-matrix.ts | **pass**, 15 tests (b2). **711 of 711 rows** in 33.1 s, with 232 positive relationships (table below). Regenerated in this session under contentHash 8a004f51… into tmp/ev/relationships-g3.md: rows identical to docs/reports/relationships-g3.md except its header hash (`<lead>`: regenerate the committed file, D‑0063). |
| module fixtures | module-accounting, shared-budget, module-e04, module-e06, module-e07, module-e08, module-e09-e10, module-e12 (tests/fixtures), tests/sim/stage8-order.test.ts | **pass**, 9 files, 113 tests, 141 s (b3). Per file: accounting 7, shared-budget 8 (C08: two actions never spend the same energy), E04 15, E06 5, E07 11, E08 8, E09/E10 23, E12 24, stage 8 order 12. |
| experiments | tests/experiments/*.test.ts (17 files incl. e201-e204, hidden-neighborhood, hidden-neighborhood-host, one-host, fungal-supply-line), tests/recipes/curated.test.ts | **pass**, 18 files, 124 tests, 772 s (b4). Write-ups: docs/reports/experiments-g2.md and experiments-g3.md. EXP_212 gate at 1 s with the exact transfer ledger. EXP_105 gate at 1 s. **EXP_104 gate not reached** (D‑0062; its test asserts the measured limiter; revision `<lead>`). |
| P3.1 chemistry | tests/sim/chemistry.test.ts | **pass**, 14 tests (b5) |
| P3.2 habitats, attachment | tests/fixtures/habitat-presets.test.ts, tests/sim/attachment.test.ts | **pass**, 7 + 3 tests (b5) |
| P3.3 film, fungi, Dusk | tests/fixtures/film.test.ts, fungal-branching, dusk-suitability, relationships-film, relationships-w2 | **pass**, 15 + 13 + 2 + 5 + 5 tests (b5; film 160 s) |
| P3.4 hosts, hunters, parasites, phage, Siltworm | tests/fixtures/host-specificity, predation-matrix, parasite, phage; tests/sim/siltworm-crossing.test.ts | **pass**, 3 + 5 + 17 + 14 + 6 tests (b5; phage 62.5 s) |
| P3.5 Sample / Transfer / Clean water | tests/sim/tools.test.ts, tests/worker/sample-transaction.test.ts | **pass**, 17 + 5 tests (b5) |
| P3.6 living chemistry | tests/fixtures/fungal-transport, food-objects, producers; e201-e204 (row "experiments") | **pass**, 14 + 22 + 18 tests (b5; food-objects 276 s) |
| P3.8 Field Guide, badges, relationships seen | tests/content/guide.test.ts, tests/ui/badges.test.ts, tests/worker/relationships.test.ts | **pass**, 41 + 6 + 9 tests (b5) |
| P3.10 audio | tests/audio/*.test.ts (6 files) | **pass**, 33 tests, incl. the rate limiter's 12 (b5). The manual listen is an owner item (§8). |
| P3.11 accessibility | docs/reports/contrast.md; tests/ui/a11y-*.test.ts and the e2e a11y-screens and keyboard specs | Contrast audit: 246 pairs, 208 required, 129 pass, 79 fail with a justification, 0 unexplained. The a11y specs: `<lead>` (full e2e run; a11y builder report docs/reports/reviews/g3-wave-4b/a11y-build.md). |
| P3.12 performance | docs/reports/perf-g3.md, tests/perf/stress-shape.test.ts | stress-shape **pass**, 1 test, 8.9 s (b5; perf's in-flight test). perf-g3.md: 6,000 agents with 2,000 fungal, CPU per tick p50 18.8 / p95 23.9 ms. **< 10 ms not met**; provisional (§7). Hash neutrality is proven in perf-g3.md and holds in b1/b6/b7 here. |
| determinism | tests/fixtures/determinism.test.ts (G0 headless), deterministic-state.test.ts (G1 host + save), **determinism-g3.test.ts (new)**, g2-replay.test.ts, trajectory-fence.test.ts, trajectory-fence-arms, trajectory-fence-current, trajectory-fence-current-arms | **pass**. determinism-g3: 9 tests, 102 s (standalone run), then again in b6. The rest are in b1 (13 files with the saves rows, 98 tests, 959 s). The fence moved no digest. |
| saves | tests/persistence/migration.test.ts, tests/sim/history-debris.test.ts, g2-replay, tests/sim/world-stores.test.ts, tests/persistence/adhesion-import.test.ts, tests/persistence/stale-prey.test.ts | **pass** (b1, together with the determinism files). |
| e2e Launch ecology (W6‑17) | tests/e2e/launch-ecology.spec.ts (new) | **pass**, desktop: `1 passed (12.2m)` on port 4263, build tmp/dist-evidence. Phone projects: `<lead>`. |
| e2e Lab tools, keyboard, a11y screens | tests/e2e/lab-tools.spec.ts, keyboard.spec.ts, a11y-screens.spec.ts | `<lead>`: the full three-project run at the gate. Not run by this builder (assignment: own journeys only). |

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
  `<lead>`: the phone projects at the gate.
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
  Cordweaver (§8 item 27). Phone layouts: `<lead>` if wanted.
- Comprehension self-review (G2, kept): docs/reports/comprehension-g2.md. The five tasks took 5/5 within ten minutes;
  the five-tester session remains an owner item.

## 6. Design handoff
- Art is code (`art/src/`), compiled by `npm run art:build` to `public/atlas/organisms.png` +
  `manifest.json`: 856 frames on 1024×1024. It covers the 19 enabled species (all 14 Phase 3 species since wave 1, D‑0046) and the ten
  module marks (D‑0032). It is deterministic (`--check`): `<lead>` paste at the gate.
- Contrast audit: docs/reports/contrast.md has 246 pairs, of which 208 are required. 129 pass and 79 fail, each with a printed justification; none is unexplained.
  Fixes in art/src and the render colours are proposals for the art owner (a11y build report).
- Sound: synthesized patches (src/audio/patches.ts). Owner manual listen: §8.
- Not yet: launcher icon, splash, store art (Phase 4).

## 7. Performance and saves
**Provisional: the lead re-measures on a quiet machine after perf is integrated** (W6‑12). The numbers below are
from docs/reports/perf-g3.md "Phase 3 measurements" as the perf builder wrote it on 2026‑10‑10, 13:45–14:50 UTC,
before integration. The machine is an AMD EPYC 7763 with 2 vCPUs (one core, two SMT threads) and Node 24.21.0. The
1-minute load was 2.8–6.2, and the other stage 2 agents ran on the sibling thread, so CPU time is inflated too.
- **Tick cost, SPEC §16 / P3.12**: `node --expose-gc --import tsx tools/perf-stress.ts --ticks 9000`. The dish holds 6,000
  agents, 2,000 of them fungal segments, with every Phase 3 mechanism acting by tick 300, at 1× headless.

  | Build | CPU per tick p50 | CPU p95 | CPU p99 |
  |---|---|---|---|
  | Committed sim (HEAD `cbdddf3`) | 38.5 ms | 45.2 ms | 62.5 ms |
  | Perf's hot-path edits | **18.8 ms** | **23.9 ms** | **42.6 ms** |

  - The pass is 2.05× faster at p50. **The < 10 ms gate is not met on this machine.** The p95 gap is about 14 ms
    of CPU, led by sense/move (7.3 ms), intake (4.8), environment (2.7) and structures (2.7).
  - perf-g3.md "Remaining gap" says each remaining large gain changes results, so it would need an owner rules decision (§8).
  - `<lead>`: a quiet-machine re-measure, and the nominated device.
- **Hash neutrality of perf's edits**: the stress world's stateHash is identical before and after at ticks
  0, 600, 1,500, 3,000 and 9,000, and so are the snapshot digests. The fence passes (perf-g3.md). In this session it also
  passed with those edits in the tree: b1, b6 and b7 in §4, and the tune's FIRST_DISH_V1 hashes equal an independent run.
- **Memory**:
  - Heap slope over minutes 5–15 is 0.97 %/min with no save in the window (41-minute run), and 0.27 %/min after minute 31.
  - With a save and reload at tick 3,000 it is 1.73 %/min, from a one-off +1.27 MB step.
  - Remaining growth is the genome table, which is never compacted (perf-g3.md proposal 1).
- **Snapshot**:
  - Whole snapshot at 6,000 agents with every view on: mean 4.59 ms (p95 9.30). Before the pass it was 11.80 ms (p95 22.9).
  - About 0.5 MB per snapshot (ents + ids + deposits), sent as pooled ArrayBuffers.
- **Save at 6,000 agents**: `buildSaveFile` 427 ms, `loadSaveFile` 590 ms. The file is 10.2 MiB, inside the 25 MB import limit,
  and the reload hash is equal.
- **Renderer** (SwiftShader software WebGL, so lower bounds; `E2E_PORT=4262 npx tsx tools/render-bench-run.ts`):
  - At 6,000 organisms, 1440×900 runs at 1.6 fps zoomed to a neighbourhood and 1.8 fps for the whole dish.
  - At 360×800, aggregation engages at whole-dish zoom (7.6 fps).
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
- Android: unchanged since G1 (debug APK and unsigned AAB build; install and launch unverified, no device). No
  haptics on Android until P4.10 adds the VIBRATE permission (D‑0064).

## 8. Changes and owner decisions
- **Tuning revisions:** none. FIRST_DISH_V1 is kept at G1, G2 and G3 (D‑0015 re-measured in tune-g3.md; the PROPOSED DECISION is in docs/reports/reviews/g3-wave-4b/g3-evidence-build.md).
  EXP_104 / HIDDEN_NEIGHBORHOOD: a lead revision is pending (D‑0062; docs/reports/exp104-revision-probe.md).
- **Environment limits** (documented, not blocking):
  - no GPU, so frame rates are software-rendered lower bounds;
  - no Android device or emulator, so install and launch are unverified;
  - a shared 2-CPU machine, so wall times are inflated.
- **Owner decisions required** (none block current work). Items 1–6 and 11 are carried from G2. Items 7–10 are G2 owner questions; their status is `<lead>`.
  1. Play Store: price ($0.99 assumed), countries, Families program opt‑in, content rating answers.
  2. Privacy policy hosting URL.
  3. Signing keystore creation and Play App Signing enrollment (owner‑held).
  4. Minimum Android device for measured performance gates. Device items from perf-g3.md (provisional):
     - The SPEC §16 1× tick < 10 ms at 6,000 agents is **not met** on this 2-vCPU container: p95 23.9 ms CPU after perf's pass.
       Measure it on the nominated device.
     - 60 fps at neighbourhood zoom needs a GPU device; software WebGL here gives 1.6–4.9 fps at 6,000 organisms.
     - Owner rules decisions that would close the **tick** gap. Each one changes results, so each needs a recorded ruleset
       bump: a diffusion cutoff or half-rate enzyme and inhibitor diffusion; entity-order locality for intake and decide.
     - Owner rules decision for the **memory** criterion: genome-table compaction (D-0066). The table and the derived
       `profiles` cache grow with every new genome; the compaction the genome.ts header describes was never implemented.
       Compaction changes saved genome ids and the hash, so it needs a ruleset entry. It does not change tick cost.
     - Hash-neutral follow-ups, scheduled for P4.13:
       - drop `profiles` cache entries with no living carrier (memory);
       - send `ids` and `deposits` only on change (src/worker/host.ts; snapshot size).
  5. Lucid Winds Arcade manifest and embedding format (`tools/deploy-arcade.mjs` exists).
  6. Whether the web build is full or DEMO_MODE.
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
  20. **D‑0062** EXP_104 needs a recipe revision (lower starting oxygen; probe: 0.03–0.05 reaches the gate), or it stays out of v1.0.
  21. **D‑0064 (1) audio manual listen:** `npm run dev`, then open `/tools/audio-preview.html` and listen to every cue
      (drop, placement_error, select, save, discovery, compare_result, division, card_open, wake) and the ambient loop.
  22. **D‑0064 (2)** should reduced motion also quiet audio? Built: no. Quiet audio is the separate comfort setting (audio PROPOSED DECISION 4).
  23. **No Android haptics until P4.10** adds `android.permission.VIBRATE` (PLAY_STORE_CHECKLIST; audio PROPOSED DECISION 3).
      Web haptics are feature-detected, off by default, and fire only on accepted placements.
  24. **Curated dishes that end empty** (tune-g3.md, this draft). L301 Two Lunches asks "Do separate neighborhoods stay
      different?", but both neighborhoods are empty by 540 s on 6/6 seeds. L306 is empty at 600 s. L303 is item 12.
      Choose between making the dish text say the food is finite, or a new revision with one renewable source.
  25. Open PROPOSED DECISIONs in docs/reports/reviews/g3-wave-4/ not yet folded into a D‑entry:
      - field-guide-fix1 **A**: when P06 is enabled, its guide entry shows "captures within 1 cell" (CT §3.2 reach = sensingRadius).
      - field-guide-fix1 **B**: entries that relationships are never noted about (modules, structures, tools, habitats) show a fixed "Seen in your dishes" sentence.
      - wave-verify-2 item 6: accept conservation-all-pools reporting its wall time (≈ 80–120 s) instead of asserting ≤ 60 s.
        D‑0063 records this as decided; it is listed here for the owner's visibility only.
      - All the others in that folder (audio 1–3, experiments-curated, field-guide 2–6, g3-fixtures) are recorded in D‑0061…D‑0064.
  26. Wave 4 stage 2 proposals (a11y, perf, g3-evidence build reports in docs/reports/reviews/g3-wave-4b/): `<lead>`.
  27. (Lead, copy; MINOR) The inspector's "Sugar here can come from …" line names every species of the world's recorded list.
      It is built by `sugarSourcesOf`, src/worker/snapshot.ts:611. So every Phase 3 dish names Cordweavers' enzyme even with no Cordweaver present, and
      it never names an E01 carrier. Choose between naming only living kinds, or wording it as "in this kind of dish"
      (docs/reports/opening-loop-g3.md).
- **Next gate:** Phase 4, Wonder, Replay, Android → `v1.0.0-rc1` (docs/agent Phase 4 runner edition).
