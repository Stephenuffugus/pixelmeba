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
- [ ] P2.1 Module framework + E01, E03, E05
- [ ] P2.2 Founder modes + mutation presets UI + Advanced panel + prototype label
- [ ] P2.3 Branch discovery, naming/pinning, lineage panel, follow lineage, trait overlay, specimens, discovery card
- [ ] P2.4 Comparison engine + results + prediction note
- [ ] P2.5 Experiments framework + EXP_A/B/C + Food trail, Light and life, Cleaning crew, Predator balance
- [ ] P2.6 What if? R1 (RecipeVariant, R‑G0…R‑G3, Again, Another idea, preview, metadata)
- [ ] P2.7 Lab view (categories, trays, brushes, habitat paint, stone/wall/bead, overlays picker, charts)
- [ ] P2.8 Regional trait graphs, checkpoint ring, journal
- [ ] P2.9 Second tuning report (Standard + Accelerated; docs/reports/tune-g2.md)
- [ ] G2 gate: module‑accounting · registry‑imports · branch‑evidence · comparison · variants · experiments · e2e whatif/lab‑tools · view‑switch hash · comprehension self‑review → tag `g2`

## Phase 3 — Launch Ecology
- [ ] P3.1 Chemistry and environment materials (all D01 materials, pH/salinity/inhibitors, closed lid, shade)
- [ ] P3.2 Habitat presets (Water Garden, Gel Colony, Sediment Edge) and substrate rules
- [ ] P3.3 Wave A organisms: B02 + biofilm, B03, B05, Y01, F01 + branching
- [ ] P3.4 Wave B organisms: P02, P03, P04, X01, V01
- [ ] P3.5 Tools: Sample (paused transaction), Transfer, Clean water, Erase structure, phage doses
- [ ] P3.6 Wave E1 living chemistry: B07, B08, Y02, F02 + links; E_OIL/E_PROTEIN/broth/breaker; M01, M03–M05, M09, M10, M11; food objects; reaction ledger; food‑access overlay
- [ ] P3.7 Modules E04, E06, E07, E08, E09, E10, E12 + stage 8 reservation order
- [ ] P3.8 Field Guide, journal, badges
- [ ] P3.9 Experiments (A hidden neighborhood, One compatible host, E201–E204, E212) + curated L301, L303, L304, L306
- [ ] P3.10 Audio SoundKit + settings
- [ ] P3.11 Accessibility pass 1 (keyboard, ARIA, species list, reduced motion, 200 %, contrast report)
- [ ] P3.12 Performance pass 1 (docs/reports/perf-g3.md)
- [ ] G3 gate: host‑specificity · transport‑obstacles · conservation‑all‑pools · relationship matrix · module fixtures · experiments · e2e incl. keyboard · axe clean → tag `g3`

## Phase 4 — Wonder, Replay, Android → v1.0.0-rc1
- [ ] P4.1 Favorite families
- [ ] P4.2 Story cards (4 templates) + notification limits + notebook tab
- [ ] P4.3 Garden card, session memory, optional prompts
- [ ] P4.4 Objective engine (5 types) + 3 goals
- [ ] P4.5 Paired Garden variants (R2)
- [ ] P4.6 Share (Picture 1080², Starting recipe, Living dish, recipe IDs, stripped export)
- [ ] P4.7 Try my dish (R4)
- [ ] P4.8 Observation tools (relationship map, region probes, follow family, bookmarks, recipe card, gallery, challenge editor, transfer preview)
- [ ] P4.9 Narration (16 phrases), sound polish, reduced‑motion audit table
- [ ] P4.10 Android (Filesystem adapter, lifecycle, share/import, offline launch, debug build or documented blocker, ANDROID_SETUP.md signing)
- [ ] P4.11 Web/arcade build (relative base, iframe‑safe, PWA offline, DEMO_MODE)
- [ ] P4.12 Store readiness (icon, feature graphic, screenshots, listing text, PRIVACY_POLICY.md, data safety, checklist)
- [ ] P4.13 Performance pass 2 + first‑minute polish (docs/reports/perf-rc1.md)
- [ ] P4.14 Release candidate: full suite, EXPANSION_RESPONSE complete, README updated → tag `v1.0.0-rc1`
- [ ] v1.0 gate evidence recorded (all fixtures, full‑journey e2e, axe, perf, Android result, store assets, owner usability gates listed)

## Phase 5 — Expanded Ecology → v1.1.0
- [ ] P5.1 Climate: day/night, local warmth, moisture/drying, canopy, New Dish options
- [ ] P5.2 Structures S01–S12, edge barriers, transport classes, directed channel, resin, gate preview, regions
- [ ] P5.3 Wave E2 organisms B09, B10, B11, B13, A02, A03, A04, A05 + E02 + inhibitor category extension
- [ ] P5.4 Habitat recipes H04–H11 (Empty / Suggested Community)
- [ ] P5.5 Wave E3 organisms B12, F03, F04, P05, P06, P07, P08, P09, P10, X02, V02 + E11 + food‑web extensions
- [ ] P5.6 Experiments E205–E211, E213–E218; L302, L305; play prompts; succession notebook
- [ ] P5.7 Art and audio for the expansion
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
