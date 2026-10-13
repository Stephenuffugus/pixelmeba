# WORKLOG — the live checklist

**Rule:** the first unchecked box is the current task. Tick a box only after the task's "Done
when" checks ran in this session and the commit is on `main`. Add the commit hash in the
brackets. Gate rows require the full ritual (directive Appendix A) and a tag.

Legend: `[ ]` todo · `[x] (abc1234)` done · `[~]` in progress (at most one at a time) ·
`[!]` blocked by environment (documented in DECISIONS.md and EXPANSION_RESPONSE.md §8; continue
with the next task).

## Phase 0 — Foundation
- [x] (b414441) P0.1 Repository and toolchain (docs baseline already committed as 9982e8d; add the toolchain on top)
- [x] (24f1c39) P0.2 Content schema and first packs (5 species, FIRST_DISH materials, WATER_GARDEN, FIRST_DISH_V1, loci, empty registry, validator)
- [x] (24f1c39) P0.3 Determinism primitives (det/detFloat, canonical serialization, stateHash, sha256)
- [x] (24f1c39) P0.4 World, fields, transport (stage 2), ledger
- [x] (24f1c39) P0.5 Entities SoA, genome table, phenotype pipeline, suitability, movement, spatial index
- [x] (24f1c39, bd77414) P0.6 Intake/allocation, conversions, maintenance, death, births with immutable proposals
- [x] (24f1c39) P0.7 Tick loop, commands (stage 1), publish (stage 10), paused transactions
- [x] (24f1c39) P0.8 Headless runner CLI and save skeleton
- [x] (bd77414, tag g0) G0 gate: neutral‑founders · conservation‑closed‑lid · determinism · no‑free‑growth · fair‑shared‑food · content‑validation → tag `g0`, EXPANSION_RESPONSE §1, §4

## Phase 1 — First Playable
- [x] (9990347) P1.1 Five organisms complete (B01, B04, B06 + E_STARCH stage 3, A01 photosynthesis, P01 predation)
- [x] (9990347) P1.2 Quantitative evolution (8 loci, mutation draws, feeding policy, genealogy, branch candidate records, presets in manifest)
- [x] (9ae3295, 577b176) P1.3 Worker and protocol (speeds, accumulator, effective speed, snapshots ≤ 10/s, error pause)
- [x] (03305ab, 9ae3295, d71276d) P1.4 Art pipeline + core sprites + world tiles + effects + SVG icons + asset previewer
- [x] (0e9fa97, 7d65c8f) P1.5 Renderer (PixiJS: layers, zoom presets, aggregation, overlays, selection, follow) — 60 fps not measurable without a GPU here (software WebGL); device measurement at P3.12, see EXPANSION_RESPONSE §7
- [x] (df43c74, 577b176) P1.6 UI shell and Explore view (Home, Play shelf, New Dish, Dish screen, input contract)
- [x] (577b176) P1.7 Inspector (Summary/Why/Details, reason‑code copy, shortcuts, cell inspector)
- [x] (df43c74) P1.8 Explore tools and undo (Add Life, Feed, Look, one‑gesture commands, time‑rewind undo)
- [x] (df43c74) P1.9 Persistence (IndexedDB adapter, slots, autosave, background pause, export/import .pixelmeba)
- [x] (df43c74, 9ae3295, 577b176) P1.10 Duplicate dish, event feed, history, charts
- [x] (778f3be) P1.11 Android spike (cap init/add; SDK detection; ANDROID_SETUP.md if blocked)
- [x] (e6f0457) P1.12 Development‑seed report (docs/reports/tune-g1.md)
- [x] (tag g1) G1 gate: deterministic‑state · blocked‑division‑proposal · finite‑feeding · enzyme‑source · inherited‑variation · predation · photosynthesis · e2e garden/place‑and‑undo/save‑reload · opening‑loop review → tag `g1`

## Phase 2 — Core Abilities, Comparison, What if?
- [x] (2761cbd) P2.1 Module framework + E01, E03, E05
- [x] (9708c29) P2.2 Founder modes + mutation presets UI + Advanced panel + prototype label
- [x] (d085a65, b17aa5b, 4804a91) P2.3 Branch discovery, naming/pinning, lineage panel, follow lineage, trait overlay, specimens, discovery card
- [x] (2761cbd) P2.4 Comparison engine + results + prediction note
- [x] (2761cbd, d085a65, b17aa5b, 4804a91) P2.5 Experiments framework + EXP_A/B/C + Food trail, Light and life, Cleaning crew, Predator balance
- [x] (2761cbd, d085a65, b17aa5b, 4804a91, 87204e7) P2.6 What if? R1 (RecipeVariant, R‑G0…R‑G3, Again, Another idea, preview, metadata)
- [x] (d085a65, b17aa5b, 4804a91) P2.7 Lab view (categories, trays, brushes, habitat paint, stone/wall/bead, overlays picker, charts)
- [x] (9708c29) P2.8 Regional trait graphs, checkpoint ring, journal
- [x] (9c087bc) P2.9 Second tuning report (Standard + Accelerated; docs/reports/tune-g2.md)
- [x] (tag g2) G2 gate: module‑accounting · registry‑imports · branch‑evidence · comparison · variants · experiments · e2e whatif/lab‑tools · view‑switch hash · comprehension self‑review → tag `g2`

## Phase 3 — Launch Ecology
- [x] (08768df) P3.1 Chemistry and environment materials (all D01 materials, pH/salinity/inhibitors, closed lid, shade)
- [x] (08768df) P3.2 Habitat presets (Water Garden, Gel Colony, Sediment Edge) and substrate rules
- [x] (1cfe848) P3.3 Wave A organisms: B02 + biofilm, B03, B05, Y01, F01 + branching
- [x] (1cfe848) P3.4 Wave B organisms: P02, P03, P04, X01, V01
- [x] (a792e07) P3.5 Tools: Sample (paused transaction), Transfer, Clean water, Erase structure, phage doses
- [x] (a792e07) P3.6 Wave E1 living chemistry: B07, B08, Y02, F02 + links; E_OIL/E_PROTEIN/broth/breaker; M01, M03–M05, M09, M10, M11; food objects; reaction ledger; food‑access overlay
- [x] (08768df, a792e07, 50c7c32) P3.7 Modules E04, E06, E07, E08, E09, E10, E12 + stage 8 reservation order
- [x] (8c8a65f) P3.8 Field Guide, journal, badges
- [x] (8c8a65f; EXP_104 needs a recipe revision before v1.0, D-0062) P3.9 Experiments (A hidden neighborhood, One compatible host, E201–E204, E212) + curated L301, L303, L304, L306
- [x] (8c8a65f) P3.10 Audio SoundKit + settings
- [x] (d3a3027) P3.11 Accessibility pass 1 (keyboard, ARIA, species list, reduced motion, 200 %, contrast report)
- [x] (d3a3027; tick < 10 ms and the memory criterion NOT met on the loaded 2-vCPU codespace — quiet re-measure at the gate, then P4.13; D-0066) P3.12 Performance pass 1 (docs/reports/perf-g3.md)
- [x] (7eca504, 35d12c3, 0527977, 1eb3025, gate commit; tag `g3`; e2e 258/258 at 1eb3025; D-0068, D-0069) G3 gate: host‑specificity · transport‑obstacles · conservation‑all‑pools · relationship matrix · module fixtures · experiments · e2e incl. keyboard · axe clean → tag `g3`

## Phase 4 — Wonder, Replay, Android → v1.0.0-rc1
- [x] (9b40210; D-0073, D-0075) P4.1 Favorite families
- [x] (c3f214e; D-0076, D-0077, D-0079) P4.2 Story cards (4 templates) + notification limits + notebook tab
- [x] (9b40210; D-0074; prompt progress per page session is an owner item) P4.3 Garden card, session memory, optional prompts
- [x] (c3f214e; D-0078) P4.4 Objective engine (5 types) + 3 goals
- [x] (52e6a27; D-0088) P4.5 Paired Garden variants (R2)
- [x] (ca8c184; D-0080, D-0083; strict build match for recipe files is an owner item) P4.6 Share (Picture 1080², Starting recipe, Living dish, recipe IDs, stripped export)
- [x] (ca8c184; D-0081, D-0082, D-0084; the Storage panel that empties the shelf ships with 6b in the same release) P4.7 Try my dish (R4)
- [x] (ca8c184 part a, 52e6a27 parts b–c; D-0085, D-0086, D-0087, D-0090; follow family = P2.3 + P4.1 favorites (D-0073), recipe card = the P4.6 Starting recipe (D-0080); transfer preview moves to Phase 5 with the gate structures, D-0082) P4.8 Observation tools (relationship map, region probes, follow family, bookmarks, recipe card, gallery, challenge editor, transfer preview)
- [x] (52e6a27; D-0089; hearing the phrases on a device is an owner item) P4.9 Narration (16 phrases), sound polish, reduced‑motion audit table
- [x] (ed374ba; D-0091, D-0092, D-0093, D-0095; debug APK and unsigned AAB built here, the interruption harness passes; no device: install, offline launch and the device smoke test are owner items, ANDROID_SETUP §10) P4.10 Android (Filesystem adapter, lifecycle, share/import, offline launch, debug build or documented blocker, ANDROID_SETUP.md signing)
- [x] (487a152; D-0097; offline from its own folder; the stamped arcade deploy plays online until the owner's embedding rules) P4.11 Web/arcade build (relative base, iframe‑safe, PWA offline, DEMO_MODE)
- [x] (487a152; D-0098; screenshots regenerated on the clean commit; owner items in PLAY_STORE_CHECKLIST §B) P4.12 Store readiness (icon, feature graphic, screenshots, listing text, PRIVACY_POLICY.md, data safety, checklist)
- [x] (ed374ba; D-0094, D-0095; measured under load: the 1× tick < 10 ms at 6,000 agents, the heap slope with a save in the window and the web worker heap at 4× NOT MET, quiet re-measure at P4.14; heat, frame rate and touch latency are owner device items) P4.13 Performance pass 2 + first‑minute polish (docs/reports/perf-rc1.md)
- [x] (c001a94, 1eb42c6, gate commit; tag `v1.0.0-rc1`; e2e 359/360 at 17ad62f, the one failure fixed by D-0099 and keyboard.spec 6/6 after it; check 216/2088 at 1eb42c6; D-0099, D-0100) P4.14 Release candidate: full suite, EXPANSION_RESPONSE complete, README updated → tag `v1.0.0-rc1`
- [x] (gate commit; EXPANSION_RESPONSE §4, §7, §8; perf-rc1.md quiet re-measure; tune-rc1.md; ANDROID_SETUP §9.3) v1.0 gate evidence recorded (all fixtures, full‑journey e2e, axe, perf, Android result, store assets, owner usability gates listed)

## Phase 5 — Expanded Ecology → v1.1.0
- [ ] P5.1 Climate: day/night, local warmth, moisture/drying, canopy, New Dish options (2026-10-13 wave 8b e25cd77: recipe overrides lid/lightMode/drying, the wetting-brush record; not enabled)
- [ ] P5.2 Structures S01–S12, edge barriers, transport classes, directed channel, resin, gate preview, regions (2026-10-13 wave 8a 60a4731: schema 5 stores and the CT §5.3 barrier table; wave 8b e25cd77: the S01–S12 records and habitat/recipe edges and devices; not enabled)
- [ ] P5.3 Wave E2 organisms B09, B10, B11, B13, A02, A03, A04, A05 + E02 + inhibitor category extension (2026-10-13 wave 8a 60a4731: schema 5 columns and 16 px sprites; not enabled)
- [ ] P5.4 Habitat recipes H04–H11 (Empty / Suggested Community) (2026-10-13 wave 8b e25cd77: edges/devices placement in habitats and recipes; not enabled)
- [ ] P5.5 Wave E3 organisms B12, F03, F04, P05, P06, P07, P08, P09, P10, X02, V02 + E11 + food‑web extensions (2026-10-13 wave 8a 60a4731: schema 5 columns and 16 px sprites for B12, F03, F04, X02, V02; wave 8b e25cd77: 32/48 px sprites P05–P10; not enabled)
- [ ] P5.6 Experiments E205–E211, E213–E218; L302, L305; play prompts; succession notebook
- [ ] P5.7 Art and audio for the expansion (2026-10-13 wave 8a 60a4731: 16 px organism art, dormant/trap poses, glow/mode/jacket marks; wave 8b e25cd77: 32/48 px art, handling and trap marks, atlas 1024×2048; not enabled)
- [ ] P5.8 Regression and D02 §25 acceptance → tag `v1.1.0`

## Phase 6 — Living Lab → v1.2.0
- [ ] P6.1 LL1 LAB01 reservoir + LABR01
- [ ] P6.2 LL2 LAB02 light lens + light formula + LABR02
- [ ] P6.3 LL3 controllers + manual override + audit + LABR03
- [ ] P6.4 LL4 cross‑dish atomic transfer (or documented limitation)
- [ ] P6.5 LL5 research records, stamps, question cards, portfolio
- [ ] P6.6 Playgrounds Slow Snack, A Light in the Dark; R‑L1, R‑L2
- [ ] P6.7 LL6 validation (D07 §16), migration, dense scene → tag `v1.2.0`

## Phase 7 — Advanced Living Worlds → v1.3.0
- [ ] P7.1 Behavior strategies, memory, night forager, overhead
- [ ] P7.2 E13 Settler, E14 Dispersing offspring
- [ ] P7.3 Body size and form, class rules, contact geometry
- [ ] P7.4 E15 Exchange junction, E16 Partner bond, colony roles, developmental mutation, native feature switches
- [ ] P7.5 E17 Food cache
- [ ] P7.6 Lineage portraits, follow story, ecosystem timeline
- [ ] P7.7 Fixtures D501–D506 + D05 §18 acceptance → tag `v1.3.0`

## Continuous
- [ ] Every rules/content change: fixture updated, version bumped, DECISIONS.md entry
- [ ] Every gate: EXPANSION_RESPONSE.md refreshed with real outputs
