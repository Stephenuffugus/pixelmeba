# Phase 5 organism flip — builder report (D-0126, D-0127)

Builder for the lead task "THE ORGANISM FLIP" (docs/agent/g5-wave-13.tasks.js.txt items 1–12). Base: HEAD ed0bf52 (wave 13,
1504640). Nothing committed, pushed or branched (the lead commits after the saves verifier). No full `npm run check`
and no Playwright run (the lead's). Scratch probes are under tmp/flip/ (not for commit): proof.ts, proof2.ts,
census.ts, perf-firstdish.ts, perf-dense.ts, fixture-check.ts, and their logs.

## 1. What changed

### Source and content
| File | Change |
|---|---|
| content/manifest.json | enabledSpecies +19 (A02, A03, A04, A05, B09, B10, B11, B12, B13, F03, F04, P05, P06, P07, P08, P09, P10, V02, X02; 38), enabledModules +E02, E11 (12), enabledMaterials +M02, M06, M07, M08, M12 (32), enabledSystems +rivalry, signals, silicate (14), moduleRegistryVersion 2 → 3; contentHash 84c41636fd7774852a3dbdbc3d32715f9cfe52a19d48ad605e50dd37d524c357 → 2640a5f4ea57ac78f865a397030ebf703d40cf5fcb9371263cea5f40230c3c62 |
| src/sim/content/implemented.ts | IMPLEMENTED_MODULES + E02, E11 (sorted, 12); IMPLEMENTED_RULES.moduleRegistryVersion 2 → 3 |
| src/sim/mixotrophy.ts, src/sim/events.ts | D-0126: 'modeSwitch' coalesced per tick, species and new mode (detail.count; totals count switches) |
| src/sim/content/registry.ts | validator: metabolism 'mixotroph' ⇔ native MIXOTROPHY, both ways (D-0123 MINOR 6) |
| src/ui/strings/lab.ts | CHEMISTRY_MATERIALS + M02, M12, M06, M07, M08 (none is food: FOOD_MATERIALS unchanged); MATERIAL_COPY for the five, from each record's rules line |
| src/persistence/phase5State.ts | jacket rule tightened (D-0125 amends D-0118): jacketMineral > 0 without E11 in the genome is refused; comment refreshed. Optional NITs (g5-plan "Wave 13 leftovers" (d)): a positive trapReserveC other than exactly 0.20 is refused ("A trap's reserve is invalid."), and a holding trap with trapTimer 0 ("A trap's hold time is invalid.") |
| tools/relationship-matrix.ts | phase5Registry() comment only |
| docs/DECISIONS.md | D-0126, D-0127 |
| docs/reports/relationships-g5.md | new: the shipped matrix (2265 rows, all pass) |
| docs/reports/perf-g5.md | "Organism flip (D-0127)" section |
| tests/fixtures/fence.json | L303_PUBLIC_KITCHEN and L304_EMPTY_AFTER_THE_FEAST re-recorded (changedBy D-0127) |

### Test helpers
- tests/helpers/world.ts: **preFlipRegistry()** pins the v1.0 lists explicitly (`PRE_FLIP_LISTS` = 9d22ec0's manifest lists
  = rc1-manifest.json's lists) and sets `manifest.contentHash = PRE_FLIP_CONTENT_HASH` (67075b0e…; cached). New
  **PRE_ORGANISM_FLIP_LISTS**, **preOrganismFlipRegistry(extras, opts)** and **preOrganismFlipPatch(extras)**: the
  systems-flip lists at registry version 2 (contentHash recomputes to 84c41636…), plus optional extras. **barrierRegistry()**
  and **resterRegistry()** now build on preOrganismFlipRegistry (the dish their tests were written for; identical lists to
  what they returned before the flip).

### Tests re-pinned or extended (each by cause)
- New tests: mixotrophy.test (burst: 600 A04 → one event count 600, previous tick's events kept, next tick a new event;
  a split tick → two events 5 and 3), validator.test (mixotroph ⇔ MIXOTROPHY both ways), material-swatches.test (every
  enabled tray material is in a tray list with copy; the five Phase 5 materials in Chemistry), phase5-import.test (plain
  P01 jacket refused via parseSaveFile and via DishHost with the open dish untouched; P01+E11 loads, equal stateHash),
  trap-import.test (two new CASES, each on a living slot and a held sample row).
- Shipped lists moved: modules.test (twelve modules, version 3, the 38-species eligibility table; the old table kept under
  preFlipRegistry; Sprinter uniformity over 7), module-accounting, founders (B01/B04 with E02), founders-newdish (ready info
  lists 12 modules, version 3), curated (legal lists with E02), registry-imports (unimplemented example E02 → E16 Partner
  bond; the "old save" is a version 2 dish built with preFlipRegistry; export meta version 3, 12 modules), atlas (12
  module marks), art-p5 / art-p5-large (sprites enabled; effectMarks of the shipped registry = trap_loop, handling_arc),
  structures-p5 (signals/rivalry/silicate on; PRE_FLIP = PRE_FLIP_LISTS), guide (hunters P01–P10; agents V01, V02, X01,
  X02 — traps are not hosts; B06's predators gain Shellglider, Bellstalk, Dartfin; "not enabled" cases on the
  pre-organism-flip packs; the buildPhase 4 case on the v1.0 lists), chemistry (M02 and M12 ledgered as mineral inputs),
  recipe-overrides-env (the no-climate build keeps registry version 3), relationship-matrix (v1.0 rows under
  preFlipRegistry: 711 rows, digest 4060fbf3… = SHIPPED_V1 exactly) and relationship-matrix-p5 (shipped lists = P5_LISTS;
  shipped digest 914a3bf6…, 2265 rows).
- "A dish without X" now built explicitly: grit-dissolution, rivalry (no rivalry field), probes-gates (wideRegistry and
  the open-lid dish), protocol3 (no grit), sim/objectives (no B10), phage (infectedWorld: no V02), phage-v02, film (the two
  no-film registries on the pre-organism-flip patch), host-specificity (the wave 2 dish; Phase 5 hosts are the matrix's),
  barrier-placement (pre-organism-flip + P06), barrier-determinism and barrier-transport-determinism (b is a v1.0 dish),
  climate-determinism NEUTRAL, the NEUTRAL comparisons in low-light, module-e11, traps, predation-determinism,
  signals-determinism, shells-determinism (both sides from preOrganismFlipRegistry, with and without the subject),
  resters-determinism, diet-line (v1.0 diet lines), inspect-p5 (the v1.0 golden and "no Phase 5 key" on the
  pre-organism-flip registry; the RIVAL targets of a shipped dish are now B01, B10, B11), content objectives (PRE_FLIP =
  PRE_FLIP_LISTS), experiments/framework (the species rule on the pre-organism-flip packs), goals-host (unknown species
  B99: every content species is recorded now).
- Loops over "every enabled species" skip both field viruses (detritus-fallback, module-e08). handling-saves' jacketed
  prey now carries E11 (the new import rule refused the crafted jacket without it). comprehension-labels: the Sprinter's
  and Crumbsmith's sugar-source sentence now lists Glasswheels, Shadeleafs, Raftballs and "Turnleafs in light" (wave 13
  org-ui's inLight list; the dish records them).
- v1.0 release text: listing.test and reduced-motion.test read tests/fixtures/saves-rc1/rc1-manifest.json (the store
  listing still says 19 species; a v1.1 listing is an owner item).
- E2E: tests/e2e/organisms-p5.spec.ts jacket case un-skipped (fixture comments updated). Not run (the lead's); its fixture
  dish was built and loaded through loadSaveFile under this build (tmp/flip/fixture-check.ts: E11 genome, registry 3).

### Leftovers (c)
- The matrix is written to docs/reports/relationships-g5.md.
- The builders' vi.mock appends are **noted, not dropped** (15 files; each is a Set union with the real list, so a
  harmless superset): glow-saves, signals-determinism, jacket-saves, jacket-determinism, trap-hooks, trap-saves,
  trap-sample, trap-determinism, mode-saves, algae-determinism, handling-saves, predation-determinism, handling-import,
  phase5-import, trap-import. (structures-implemented-check, validator-unimplemented and helpers/registry.test mock on
  purpose.)

## 2. The D-0059-style proof (item 3), done before the re-record

Pre-flip registry = HEAD ed0bf52's manifest lists at registry version 2; its contentHash recomputes to 84c41636… (the
recorded pre-flip hash), so it is the pre-flip registry exactly.

**All 27 fence entries reproduce their recorded currentDigest under the pre-flip registry.** Under the shipped registry
25 are unchanged and 2 move:

| Entry | Recorded = pre-flip | Post-flip | Explaining draws (birth, tick, module) |
|---|---|---|---|
| L303_PUBLIC_KITCHEN t1200 | acd60b6d2fb0790a | 4acbc084dbf004c2 | Diverse founder birth 23 (B08), tick 0: [E03,E04,E05] → [E02,E03,E04,E05], pick #0: E03 → **E02** |
| L304_EMPTY_AFTER_THE_FEAST t1200 | 5d57285882e64af0 | 1f3573a7477f933b | Diverse founders (B01), tick 0, list [E01,E03,E04,E05,E10,E12] → +E02: birth 9 #1 E03 → **E02**; birth 15 #5 E12 → E10; birth 45 #1 E03 → **E02**; then mutation gain birth 153 (parent 29), tick 150: E10 → E05 |

Counterfactual (tmp/flip/proof2.ts, log tmp/flip/proof2.log): give the post-flip world exactly those founders' pre-flip
genomes (module plus the Varied loci the module activates: E03 makes the dormancy locus active, so those founders
also drew locus 7) and, for L304, birth 153's pre-flip genome when it appears: the tick-0 digest equals the pre-flip one
and both runs reproduce the **recorded** digest at tick 1200. So nothing else moved them: no leak through species
indices, fields or ordering. **No unexplained move.** No draw landed on E11 (no fence dish draws for P01/P02/P07).

Census of every module draw by each fence tick (tmp/flip/census.ts, tmp/flip/census.log): FOOD_TRAIL_V1's one gain
(birth 45, t443, B01) picks E01 under both lists (as at D-0059); L304's founders 10, 16, 35 pick E12 under both; L303's
founder 16 (Y02, E04) has an unchanged list; every other entry makes no module draw (RESERVE_COMPARE, STARCH_UNLOCK+E01
and L306 founders carry declared modules, not draws).

`npx tsx tools/fence-update.ts --all --reason D-0127`: CHANGED exactly L303 and L304; the other 25 "unchanged" (g2Digest =
currentDigest for the 14 g2 entries). g2 and rc1 corpora and the systems flip's two recipe files unchanged.

## 3. Species indices (item 4)
- `git grep -nE "det(Float|Int)?\(" src/sim | grep -v birthId` → 24 lines: births.ts:275-276 (placement, keyed by
  parentBirth), mutation.ts (keyed by pb = parent birthId, daughter ordinal and constants), rng.ts definitions, two comments
  (contacts.ts:181, parasites.ts:237). detPermutation callers key on cmd.seq (commands.ts:321) and the founder group
  index (recipes.ts:361). No species index.
- `git grep -nE "sort\(" src/sim` → 64 hits; none compares c.species (comparators on ids, cells, birthIds, slots, edge
  keys, tiers, distances).
- `git grep -n "pendingDeaths\|speciesCounts" src/sim src/worker`: per-world observation arrays sized from the world's
  own species table (history.ts, publish.ts, pairedRun.ts, snapshot.ts packEntities). Saves store species ids.
- The fence proof is the empirical check (25 unchanged entries at a renumbered species table; the 2 moved ones fully
  accounted for by draws).

## 4. Perf (items 5 and 8; docs/reports/perf-g5.md)
Shared machine, load 7–8 throughout (another agent's e2e). FIRST_DISH_V1 seed 104729, 6,000 ticks, interleaved:
pre p50 4.01 / 3.38 ms, p95 9.59 / 8.52; post p50 3.46 / 4.03, p95 8.69 / 9.01 (fields 31 → 36; stage 2 mean 2.09–2.34
vs 2.12–2.24 ms) — no measurable change. Dense Phase 5 scene (1,980 → 3,162 organisms, 1,200 ticks): wall p50 23–26 ms,
p95 46–54 ms; process CPU p50 13–15, p95 17–29 ms; stage 4 ~9–10 ms, stage 2 ~6 ms; snapshot pack p50 3.9–4.5 ms,
412 KiB (v1.0 FIRST_DISH: CPU p50 1.6 ms, snapshot 1.0 ms, 204 KiB). Nothing reduced.

## 5. Checks run in this session
- `npm run content:validate -- --write` → contentHash 2640a5f4…; `npm run content:validate` → "content ok … 38 enabled
  species … atlas complete (16 marks, 5 tiles, 1691 frames)".
- `npm run art:build -- --check` → "atlas up to date · 1691 frames … 08fb56e6b439".
- `npx tsx tools/relationship-matrix.ts --out docs/reports/relationships-g5.md` → 2265 rows, 2265 pass, digest 914a3bf6…
  (= the phase5 registry's run); the v1.0 rows under preFlipRegistry: 711, digest 4060fbf3… (= SHIPPED_V1).
- The fence: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts --maxWorkers=2`
  → **10 files, 77 tests passed** (14 min, after the re-record).
- Targeted run 1 (76 files: every edited test, the D-0126 four, import/ceiling/validator tests, preFlipRegistry users,
  FIRST_DISH trajectory followers lineage-panel / lineage-host / keep-autosave / strip-names / branch-evidence /
  comparison / feed-modules / sim-tune): 65 passed, 11 failed (19 tests), all by cause (Phase 5 now enabled); fixed.
- Rerun of the 11 plus relationship-matrix-p5: **12 files, 175 tests passed**.
- Sweep (tests/ui, content, worker, persistence, tools, render, experiments, audio, recipes, helpers not yet run; 131
  files): 125 passed, 6 failed (9 tests: objectives content, framework, comprehension-labels, goals-host, inspect-p5,
  protocol3), all by cause; fixed; rerun **6 files, 64 tests** (+ inspect-p5 again, 12 tests) passed.
- The rest (tests/sim, fixtures, perf, platform not yet run; 97 files): 86 passed, 11 failed (14 tests: detritus-fallback,
  film, host-specificity, module-e08, phage, phage-v02, barrier-determinism, barrier-placement,
  barrier-transport-determinism, handling-saves, objectives), all by cause; fixed; rerun **11 files, 108 tests** passed.
- After barrierRegistry()/resterRegistry() moved onto preOrganismFlipRegistry, the 13 earlier-run files that use them
  were rerun: **13 files, 119 tests** passed.
- So every vitest file ran in this session (10 + 76 + 131 + 97 + relationship-matrix-p5 = 315), in batches, and every
  failure was fixed and its file rerun green. This is not one `npm run check`; the lead's full check stands.
- `npx tsc --noEmit -p .` → 0; `npx eslint` on every changed .ts → 0 problems.

## 6. BUILD_DIRECTIVE evidence (item 9; WORKLOG not ticked)

### P5.3 Wave E2 organisms (lines 697–702)
| Build item | Test files | Commit |
|---|---|---|
| B09 Lantern (S_GLOW field; hysteresis glow) | tests/fixtures/signal-glow.test.ts, tests/sim/signals-determinism.test.ts, tests/sim/glow-saves.test.ts | 9d22ec0 |
| M06 signal, M07 quencher | signal-glow.test.ts (doses, sensed / (1 + quencher)), relationship-matrix-p5 materials rows, ui/material-swatches.test.ts (tray lists, this flip) | 9d22ec0, 1504640, flip |
| B10 Brinecoil | relationship-matrix-p5 (diets, prey, inhibitors, RIVAL target), fixtures/rivalry.test.ts, fixtures/inhibitor-targets.test.ts | 9d22ec0, 1504640 |
| B11 Sourbud | same as B10 | 9d22ec0, 1504640 |
| B13 Rampart (RIVAL; M08) | fixtures/rivalry.test.ts, relationship-matrix-p5 (RIVAL × 36, B13 trigger rows) | 9d22ec0, 1504640 |
| A02 Glasswheel (silicate M02; shell grit M12; bound mineral) | fixtures/shells-silicate.test.ts, grit-dissolution.test.ts, conservation-mineral.test.ts, sim/shells-determinism.test.ts, sim/chemistry.test.ts (M02/M12 ledgered, this flip) | bdf7f7c, flip |
| A03 Shadeleaf | fixtures/low-light.test.ts | ecf058b |
| A04 Turnleaf (saved mode; thresholds) | fixtures/mixotrophy.test.ts (+ D-0126 burst), sim/mode-saves.test.ts, sim/algae-determinism.test.ts, worker/cue3-mode.test.ts, content/validator.test.ts (mixotroph ⇔ MIXOTROPHY) | ecf058b, flip |
| A05 Raftball (canopy) | fixtures/canopy-a05.test.ts, sim/climate-light.test.ts | ecf058b |
| E02 Signal glow (eligible B01–B08, B10–B13) enabled with S_GLOW | fixtures/signal-glow.test.ts (carriers), content/system-requirements.test.ts (E02 needs signals), sim/modules.test.ts (shipped eligibility table: E02 for B01–B08, B10–B13, not B09), the manifest | 9d22ec0, flip |
| Inhibitor category targets extended (A6) | fixtures/inhibitor-targets.test.ts | 9d22ec0 |
| Art for each | content/art-p5.test.ts, content/atlas.test.ts, content:validate atlas check | 60a4731, e25cd77 |

### P5.5 Wave E3 organisms and E11 (lines 708–715)
| Build item | Test files | Commit |
|---|---|---|
| B12 Sleeper (native dormancy) | fixtures/dormancy-native.test.ts, sim/resters-determinism.test.ts | bdf7f7c |
| F03 Traplace (reserve; P04 hold 8 s; drain; release; cooldown) | fixtures/traps.test.ts, sim/trap-determinism, trap-saves, trap-sample, trap-hooks, persistence/trap-import.test.ts (+2 cases, flip) | 1504640, flip |
| F04 Sporeveil (resting daughter placement; Small class) | fixtures/resting-daughter.test.ts, sim/barriers-table.test.ts | bdf7f7c |
| P05 Shellglider (silicate; 4 s handling) | fixtures/shells-silicate.test.ts, fixtures/handling.test.ts | bdf7f7c, ecf058b |
| P06 Bellstalk (radius-1 capture, attached) | fixtures/radius-capture.test.ts, sim/predation-determinism.test.ts | ecf058b |
| P07 Dartfin | fixtures/predators-p5.test.ts | ecf058b |
| P08 Waterbear (dormancy; moisture) | fixtures/dormancy-native.test.ts (P08 and the moisture describe) | bdf7f7c |
| P09 Wheelgrazer (meal-else-detritus) | fixtures/detritus-fallback.test.ts | ecf058b |
| P10 Needlejaw (continuous-contact 1 s / 4 s; sampled coverage) | fixtures/handling.test.ts, fixtures/e11-handling.test.ts, sim/handling-saves.test.ts, persistence/handling-import.test.ts | ecf058b, 1504640 |
| X02 Threadrider (F02/F04 hosts) | fixtures/parasite-x02.test.ts | bdf7f7c |
| V02 Lacephage (B02 where film ≥ 0.10; half diffusion) | fixtures/phage-v02.test.ts | bdf7f7c |
| E11 Mineral jacket (P01, P02, P07) | fixtures/module-e11.test.ts, e11-handling.test.ts, sim/jacket-saves, jacket-determinism, sim/modules.test.ts (E11 for P01, P02, P07), persistence/phase5-import.test.ts (D-0125 rule, flip) | 1504640, flip |
| Food web extensions for P01–P04 (D2 §16) | fixtures/predation-matrix.test.ts, relationship-matrix-p5 prey family (P01–P04 × every organism; 771 rows pass), content/guide.test.ts (prey of every enabled hunter = CT §3.2) | 1504640, flip |
| 48×48 frames for P08/P10 | content/art-p5-large.test.ts | e25cd77 |

Verdict: every Build-list item of P5.3 and P5.5 names its tests; with the flip commit (the manifest enables them) the
items are met. The lead's ticks wait on its full check and the journeys (item 7). P5.7 stays open (region pins, wave 14).

## 7. Not done / for the lead
- The saves verifier (item 10), `npm run check`, the journeys (item 7) incl. the fresh-dish smokes and the un-skipped
  jacket case, the WORKLOG ticks (item 9) and the commit.
- The vi.mock appends are noted rather than dropped.
- Owner item: the store listing (store/listing.md) still describes v1.0 (19 species); the listing test now reads the rc1
  manifest. A v1.1 listing is for the owner.
- Perf numbers are from a loaded shared machine; device measurement is P5.8's.
