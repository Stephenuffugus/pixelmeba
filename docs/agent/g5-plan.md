# Phase 5 plan (lead draft, 2026-10-13) — Expanded Ecology → `v1.1.0`

Inputs:
- BUILD_DIRECTIVE §Phase 5 (P5.1–P5.8);
- SPEC §2.4, §3.2, §4.1–§4.10, §5.2, §6–§9 (E2/E3 species, E02, E11), §10.4, §12–§14 (experiments, prompts, notebook);
- CT §4, §5.3, §8.2, §10.3, §12, §14;
- UX §2.3, §4, §5, §7.4, §8;
- ARCH §9–§12;
- docs/agent/fast-track.md (the working rules);
- docs/agent/g5-briefs.md, three read-only mapping briefs (run wf_314bb792-987). They carry the requirement lists with refs, the code touchpoints and per-task file lists that this plan schedules.

Phase 5 starts after tag `v1.0.0-rc1` (`b7f1245`). The waves keep the Phase 3–4 rules:
- one task-file writer per wave (effort high);
- builders edit disjoint files and never commit;
- one rules verifier per wave, plus a saves/determinism verifier for every task marked critical;
- fix rounds only for BLOCKER/MAJOR;
- the lead integrates once per wave: MINORs, D-numbers, `npm run check`, the touched journeys on desktop and phone-portrait (G3 lesson), commit, push, WORKLOG tick.

Builders run new or changed e2e journeys on desktop and phone-portrait only. The full three-project e2e runs once, at the gate.

## Lead calls made up front (record as D-0101… in the preflight commit)

1. **v1.0 saves are proven before any Phase 5 edit.** The preflight writes an rc1 save corpus with the v1.0.0-rc1 code:
   tools/make-rc1-saves.ts → tests/fixtures/saves-rc1/ with expected {hashAtLoad, hashPlus1000}, and a replay test like
   g2-replay. It covers FIRST_DISH with modules, film (L306), F02 links (E212), V01 and X01, food objects, a held
   Sample, and a notebook record with favorites, a story and a goal. Every wave must keep those hashes (old saves
   keep their recorded ruleset; CLAUDE.md "Saves are sacred"). Only g2 saves were fenced as files until now.
2. **One schema bump, unconditional; one protocol bump.**
   - World SCHEMA_VERSION 4 → 5 once (wave 8, task `schema5`) for every Phase 5 store and entity column. The stores
     are edges, devices, climate arrays (null = ambient), nextDeviceId and gateTally (saved, not hashed). The columns
     are glow, trap, metabolic mode, handling need and held state. The jacket, shell, handling progress and the
     dormancy machine reuse existing columns; wave 8's task file names the exact list.
   - Every new store or column is hash-neutral while empty (the D-0035 rule), and `COLUMNS_ADDED_IN[4]` is frozen
     before columns are appended.
   - Every world is written as schema 5, so a v1.0 build refuses a v1.1 dish ("needs a newer version") instead of
     running a Lantern without glow.
   - PROTOCOL_VERSION 2 → 3 once, by one owner. simulationVersion stays 3 (CR R03). evolutionRulesVersion and
     phenotypeMappingVersion stay. NOTEBOOK_VERSION 1 → 2 only for the succession kind.
3. **Every Phase 5 rule is gated on the world's recorded manifest** (`worldHasSystem` 'climate' | 'barriers' |
   'devices' | the signal/rivalry/silicate systems, `enabledStructures`, or the abilities of enabled species).
   - A world that records none of them behaves and hashes exactly as before. Only multiplications by exactly 1 stay
     on the hot paths, and diffusion's operation order never changes.
   - Before a flip, Phase 5 code runs only through test registries (`registryWith(...)`).
   - The fence (tests/fixtures/g2-replay.test.ts, the four trajectory-fence files, and from the preflight on the rc1
     corpus) must pass unchanged in every wave.
4. **Two flips, in this order, each a lead task with its own decision:**
   - the **systems flip** after the climate and structure waves: 'climate', 'barriers', 'devices' and S01–S12
     enabled. No fence digest may move, because shipped recipes use none of them. Then `fence-update --add` for one
     cycle dish and one barrier dish.
   - the **organism flip** after all E2 and E3 organisms, E02, E11 and their art: species, modules, materials and
     systems enabled, and moduleRegistryVersion 2 → 3. E02 joins the gain lists of B01–B08 and E11 those of P01–P02,
     so module draws move as at D-0059. The re-record is `fence-update --all --reason D-…`, after RELMATRIX lands so
     the relationship matrix covers multi-tick handling, traps, X02, V02 and RIVAL.
5. **Order change against WORKLOG: P5.4 habitats come after the organism flip.** H07, H09 and H11 use E3 species, and
   the validator refuses shipped recipes with disabled species. P5.3 and P5.5 are ticked at the organism flip.
   P5.4 and then P5.6 follow, and P5.8 closes the phase.
6. **`release/1.0` branch at v1.0.0-rc1, frozen**, for store-blocking hotfixes only (1.0.x, versionCode 10001–10099,
   no rule changes). A hotfix lands on main first and is cherry-picked. Main moves to buildPhase 5 in the preflight
   (contentVersion 2 → 3; Phase 5 content stays off by the manifest's explicit enable lists until the flips).
7. **Rulings on the mappers' open questions** (each logged in its wave's D-entry; owner flag where marked):
   - S04: the channel edge is closed to ordinary diffusion and movement; only the directed transfer crosses it
     (honestly one-way). Owner flag.
   - Contacts (predation claims, parasite attachment, links) and daughter or fungal placement never cross an edge
     that blocks either party's class (SPEC §4.9; E209 "no organisms cross").
   - Warmth: a closed shutter, walls and stone stop it; S01 and S02 pass it fully (SPEC §4.7 "passable edges").
   - New Dish light defaults to Fixed (CT §8.1). Cycle is a choice that recipes turn on. The phase is
     `settings.cycleStartTick`, present only in cycle mode.
   - Wick: the wick cell or one of its 4 neighbours is water, and it relaxes its 4-neighbour gel/sediment cells. Wicks
     do not chain.
   - Edge barriers are tapped or dragged, snapped to the nearest edge, with a refusal preview before commit.
   - Furnishings and devices share the one 256 cap, checked at content time.
   - H10's "impermeable edge wall" is WALL cells in column x = 64 except y 61–66, with S01 on those six edges. No new
     edge kind. H09's wick sits at the channel bank. H11's fungi are F02 ×5, and its perimeter is the disk cells with a
     water 4-neighbour. Suggested-community regions are authored per habitat in content, in one D-table.
   - F04 resting daughters: unattached, unlinked and Small while resting, with a new reason RESTING_NEWBORN (honest
     label). Attachability is part of waking.
   - A04: Photo mode scores light and Sugar mode scores sugar. A newborn takes its mode from local light (≥ 0.35 Photo,
     ≤ 0.25 Sugar, else the parent's).
   - Glow is off in any non-Active state. Its cost is charged in stage 8 under one ledger category, 'signal'.
   - Traps: the reserve travels with the F03 in a sample, and the held P04 is released alive at commit. A held P04
     may still make contact captures. P06 captures within a Euclidean centre distance ≤ 1.0, never across a
     prohibiting edge.
   - Play prompts extend the five SPEC §13.5 predicates with parameters (no new types). The six D02 prompts and
     "sustain three species" ship. "Branching around a barrier" and "rescue a stressed dish" are owner items (no
     measure).
   - No "converted copy" of v1.0 dishes in v1.1. v1.1 refuses v1.0 Starting-recipe files once versions move (SPEC §15).
     Both are owner items.

## Waves (two builders at a time on 2 cores; about 1–1.5 h per builder plus verify)

One owner per file per wave. When two tasks need the same file, the later wave takes it, or the earlier task splits
its edit into a helper file. These files are contended across tasks and must be assigned explicitly in every task
file: transport.ts, movement.ts, contacts.ts, births.ts, intake.ts, actions.ts, phenotype.ts, suitability.ts,
chemistry.ts, commands.ts, content/schema.ts, recipes.ts, protocol.ts, snapshot.ts and art/src/index.ts.

| Wave | Tasks (keys from g5-briefs.md) | Critical | Notes |
|---|---|---|---|
| Preflight (lead + 1) | rc1-corpus; release/1.0; buildPhase 5, contentVersion 3; D-0101… | rc1-corpus | Before any Phase 5 code. Full check. |
| 8 Foundation (D-0107: two stages, two run files 8a / 8b) | 8a: schema5 (all stores and columns, barriers.ts table, trajectory registrations, migration tests), art-small · 8b: structure-content, art-large | schema5 | art-small owns art/src/index.ts and sprite.ts in 8a; art-large appends in 8b. PROTOCOL_VERSION 3 moves to wave 11's structure-render-worker. |
| 9 Climate and barriers | climate-stage2, barrier-movement (one stage; docs/agent/g5-wave-9.tasks.js.txt) | climate, movement (each its own saves lens) | climate owns transport.ts, suitability.ts and chemistry.ts; movement owns movement.ts, births.ts, contacts.ts, fungi.ts, parasites.ts, adhesion.ts, attachment.ts and the new edgePassage.ts (crossing.ts is P04's Phase 3 water crossing). |
| 10 Transport and commands | stage 1: barrier-transport, structure-commands · stage 2: e2-shells, e3-resters | all four | transport.ts passes to barrier-transport, intake.ts to e2-shells, and births.ts to e3-resters. Two stages of two, so no stage runs a lone builder. |
| 11 Structures on screen; signals | structure-render-worker, structure-ui, e2-signals, region-charts-gates | e2-signals | Then the lead's **systems flip**. |
| 12 Algae and predation | e2-light-algae, e3-predation, structures-art-audio (P5.7b) | algae, predation | The task file splits movement.ts and phenotype.ts between the two sim tasks, or moves one of them to wave 13. |
| 13 Traps and jacket | e3-traps, e3-jacket, org-ui, relmatrix | traps, jacket | Then the lead's **organism flip** (moduleRegistryVersion 3, fence re-record). Ticks P5.3 and P5.5. |
| 14 Habitats | p5.4a habitat data (split: geometry, then communities), p5.4b New Dish habitats | p5.4a | Ticks P5.4. |
| 15 Experiments and prompts | p5.6a measures and overrides plus E205–E211, p5.6b E213–E218 and L302/L305, p5.6c prompts and succession | p5.6a, p5.6b | Gates may fail on the nominated content. Budget recipe revisions, never script the event. Ticks P5.6, P5.7. |
| 16 Regression and gate | p5.8a regression fixtures (conservation-p5, isolation, state machines, ownership, determinism-p5, host-disjoint), p5.8b perf and gate | both | The `g5` gate ritual, v1.1.0 (package.json 1.1.0, versionCode 10100), tags `g5` and `v1.1.0`. |

Estimate: about 3–4 h per wave including integration, so roughly four sessions. The task writer for each wave reads
this plan and the relevant slice of g5-briefs.md, not the whole spec.

## Risks to watch

- **Silent isolation leaks.** movement.ts's `windowClear` fast path must mark barrier edges, or decisions skip traces
  that should be blocked. A fixture traces through S01 with no blocked cells near.
- **Float identity.** Barrier factors multiply only barrier-edge coefficients, and `min(ki, kj)` keeps its order.
  Any refactor of diffuseField breaks the fence.
- **Lazy climate arrays** are allocated only by commands or settings, never by observation, and identically on
  replay, reload and 4×.
- **testOnlyOverrides is never applied** by realizeRecipe today. E214 must implement it, or the override silently
  does nothing.
- **Missing events.** Glow, mode, trap, handling and attach events do not exist yet. The organism tasks must emit
  them (SPEC §12.3), or the P5.6 gates cannot be written.
- **Atlas size.** Two 48 px four-heading sets push the atlas past 1024×1024 (to about 1024×2048). Check the WebGL
  limit on low-end Android and the PWA precache size.
- **Cap pressure.** H04 and H09 approach the 256 device cap.
- **Notebook size.** Succession entries plus favorites must stay under NOTEBOOK_MAX_BYTES.
- **Species indices.** Enabling Phase 5 species renumbers species indices in new dishes. Check that no RNG key or
  ordering uses the index.
- **Performance.** A per-tick light recompute when the cycle or canopy is on, and warmth diffusion. Keep the fast path
  when no factor changes, and measure at the flips.

## Carry-overs (task writers: put each into its wave's assignment)

- **Every wave that writes a schema 5 column or store (D-0108):** the import (src/persistence/phase5State.ts) refuses
  state the dish's rules could not have produced, so each writer must keep its invariants, or the game's own saves are
  refused. Add a buildSaveFile → loadSaveFile round trip at every state transition the wave writes. The invariants:
  - glowState 1 only while Active, never set on a non-Active organism, and cleared when it leaves Active;
  - FLAG.restNewborn only while not Active, so waking clears it;
  - trap pairs stay mutual through capture, release and death, each birthId cleared together with its slot;
  - climate values stay in [0, 1];
  - leaving cycle mode deletes settings.cycleStartTick;
  - gateTally stays sorted, with ids below nextDeviceId.

- **Wave 8b, art-large:** give P08 its `dormant` ×3 (native DORMANCY), or art-build refuses the P08 sprite (D-0109).
- **Wave 9, climate-stage2:** suitability reads `settings.warmth` only. The ambient (null) branch of `world.climate`
  must stay bit-identical (D-0108). Done in wave 9 (D-0116): suitability reads the local warmth array when it exists.
- **Wave 11, e2-signals (D-0108):** the import refuses glowState 1 on an organism that is not Active (D-0106), so the
  code that moves an organism out of Active (dormancy entry, resting newborns) must clear glowState in the same tick, or
  the game's own saves are refused. Add a test that saves and reloads a glowing organism right after it starts Preparing.
- **Wave 10, e3-resters (corrected by D-0114):** wave 9's placement rule puts a daughter in her parent's class at birth,
  which is D-0106's either-party rule. An F04 resting daughter is Small while resting, but her PLACEMENT stays bounded by
  the parent's Fixed class (no edge between parent and daughter cell); her Small class applies after birth (the S04
  channel). Waking re-checks attachability. `classOf` itself was fixed at wave 9's integration (D-0115): every species
  that lives attached is Fixed whatever FLAG.attached says, so barrier-transport's item 0 is done.
- **Wave 10, structure-commands and barrier-transport:** the list in docs/agent/g5-wave-9.tasks.js.txt "LEAD AFTER 6"
  (geometryVersion bumps on every edges/devices write, link severing, wet brush and setLightMode through climate.ts,
  the Life brush preview, the S04 channel's class helpers, gate tallies).
- **Wave 10, structure-commands (D-0111, saves verifier):** Lab edits (structures.ts applyHabitatEdit) must respect
  world.edges and world.devices. Refuse an edit that would leave a device on a stone, wall or bead cell (devices.ts:69
  wants ST_NONE), or an S04 whose two cells are not both open water (water substrate and ST_NONE, barriers.ts:209-210)
  (a skipped reason), or remove the structure by the SPEC §2.4 rules, with a save-loads test.
  Otherwise the game's own saves are refused once structures exist: a BLOCKER at the systems flip.
- **Wave 10, structure-commands (D-0116):** besides sample release through `canOccupy` (its item 13), a released
  block whose fungal or adhesion link, or host and parasite pair, would straddle a refusing edge at the destination
  follows the same rule as a barrier placed across a link (sever with a logged reason, or refuse).
- **Habitat and recipe content (wave 12 or the organism flip; D-0116):** a recipe founder chain (`links: 'chain'`,
  recipes.ts) is authored, not checked against edges. The content validator should refuse a chain whose consecutive
  founders straddle a refusing edge of the recipe's or habitat's own structures.
- **Wave 11, the protocol bump (D-0111):** when the protocol's RecipeOverrides gains lid, lightMode and drying, build()
  validates them and records them in recipeProvenance in the same change. The tool tray gates the wetting brush on
  `worldHasSystem(dish, 'climate')` (the Field Guide filters by the build's manifest only).
- **Wave 13, org-ui (D-0112):** handling_arc frame = min(3, max(0, ceil(4 × handlingProgress / handlingNeed) − 1)) (progress
  can return to 0 mid-attempt, SPEC §7.3); trap_loop frame 0 closing, 1 holding; move handling_arc and trap_loop with the other Phase 5 marks into FEATURE_LAYERS.
- **Phase 7 (E17):** S07's guide text "(a pellet or a wafer)" adds the E17 cache.
- **Wave 11, structure-render-worker:** the inspector's warmth line and suitability breakdown must read local warmth
  (src/worker/snapshot.ts reads settings.warmth today), and the cell inspector shows lightFactors' cycle, roof and canopy.
- **Wave 13, e3-traps (D-0108):**
  - Count trapReserveC/N in computeTotals and sampleTotals (a +0 term keeps older sums bit-identical) and drop the
    import's reserve refusal (src/persistence/phase5State.ts).
  - With the trap's prey data, refuse a held organism that is not the trap's prey (P04, CT §3.3).
  - Add both trap pairs (trapSlot/trapBirthId, heldBySlot/heldByBirthId) to src/sim/sample.ts REF_COLUMNS and
    replace the "held sample holds a trap" refusal with the sample closure.
- **Wave 13, org-ui (D-0109):** move glow_center, jacket_rim and mode_half (in this order) from art's
  `PHASE5_FEATURE_LAYERS` into `FEATURE_LAYERS` and the renderer's `FEATURE_LAYER_IDS`; module-visuals.test.ts:139
  guards the move. The grit glyph is procedural (src/render).
- **Phase 7 (P7.2, E14 dispersal):** CT §5.3's "fungal disperser" is Medium; `classOf` has no rule for it yet (D-0108).
- **Art polish:** V02's glyph reads as a spiked capsid more than UX §6.3's "lace glyph" (D-0109).
- **P5.8 polish (wave 15), the share picture's grit (D-0125):** src/render/picture.ts has no grit (deposit band 7)
  branch. In its deposit loop read `grit = deposits.length >= 8 * CELL_COUNT ? deposits[7 * CELL_COUNT + i]! : 0`, add
  it to the early `=== 0` skip, and paint layers.ts `paintGrit`'s specks scaled to px (gritPale #e9eef2, gritEdge
  #45525c; 1/2/3 specks at bands ≥ 1/85/170) from a cosmetic key distinct from 13/17/19/23; one picture test: a v1.0
  band set paints byte-identical pixels (docs/reports/reviews/g5-wave-13/org-ui-fix1.md item 4).
- **Every wave that ends a trap hold (D-0125, traps.ts `releaseTickByWorld`):** the release-tick scratch is unsaved and
  is correct only because every release happens inside `step()` before that tick's stage 8 (stages 5 and 7) and saves
  happen only between ticks. Any new path that ends a hold outside `step()` or after stage 8 (a remove tool, a lineage
  cull, an `applyNow` edit, a stage-9 death) must replace the scratch with saved state in the same change, with a
  save → load → step round trip at that release (repro: docs/reports/reviews/g5-wave-13/saves-verify-e3-traps.md).
- **Wave 13 leftovers (D-0125 integration, 2026-10-15).** (a) P5.8: tools/contrast-audit.ts gains grit rows (grit edge on
  water 6.28 and gel 6.15, pale face on sediment 3.70) with the picture.ts grit branch. (b) P5.8 or the next inspector owner:
  INHIBITOR_EXPOSURE is never shown when it is only the suitability reason (predates wave 13). (c) THE ORGANISM FLIP: write
  the matrix to `--out docs/reports/relationships-g5.md` (relationships-g3.md's manifest line is stale); drop or note the
  builders' now-redundant vi.mock appends of TRAP/E11 (jacket-saves, jacket-determinism, trap-hooks). (d) Optional import
  tightening with (c): trapReserveC exactly 0.2 when positive, and a holding pair needs trapTimer > 0 (verifier NITs).
  (e) G5 gate: fold the earlier owner items (D-0106, D-0111, D-0117 contradiction 2) into EXPANSION_RESPONSE §8.
- **Organism flip saves verifier (2026-10-15, docs/reports/reviews/g5-organism-flip/saves-verify.md; no BLOCKER/MAJOR).**
  (a) Commit a registry-2 (pre-organism-flip) save fixture with its expected load and +1,000 hashes (tmp/verify-flip/p2.ts
  MODE=make in a HEAD copy) — a saves-sacred guard; wave 14 or the G5 gate. (b) A test comparing the saved event ring across
  reload and 1× vs 4× (tmp/verify-flip/p5.ts MODE=reload). (c) NIT: preFlipRegistry() should throw, not overwrite, if the
  computed v1.0 contentHash ever differs from PRE_FLIP_CONTENT_HASH.
  **Lead rulings (D-0127):** (a) not needed: no released build wrote a registry-2 save with the systems flip's lists (the
  v1.0 release's registry-2 saves are the rc1 corpus, replayed by rc1-replay); a v1.1 corpus is recorded at the G5 gate,
  as rc1 was at the Phase 5 preflight. (b) **p5.8a (wave 16), determinism-p5**: the event ring joins the reload and
  1× vs 4× equality. (c) declined: preFlipRegistry() keeps setting PRE_FLIP_CONTENT_HASH by design (a v1.0 dish records
  that hash whatever the content files hash to; wave 14's habitat files move the recomputed value); the fence and the
  rc1 replay catch drift in the lists or rules.
- **THE HABITAT ENABLE's saves verifier (D-0130; docs/reports/reviews/g5-habitat-enable/saves-verify.md), for the G5 gate.**
  (a) NIT-4: stateHash includes the contentHash and the recipe-file import compares the start's stateHash, so ANY content
  change refuses older recipe files; when contentVersion did not move, the refusal ("needs a compatible build (simulation 3,
  rules 1, content 3)") names this build's own numbers. No released build is affected (v1.0 files carry content 2). p5.8b:
  every shipped content change after v1.1 bumps contentVersion, or the refusal says the file was made with a different set
  of content. (b) NIT-2: the demo's Field Guide lists the eleven habitats though the demo offers only the Water Garden
  (P4.11 filters only the Species tab): an owner line in EXPANSION_RESPONSE §8.
- **Full e2e sweep owed before the G5 gate (lead, 2026-10-15).** The flip's journeys beyond its checklist found a pin
  stale since the systems flip (chemistry-habitats' Lab light line, D-0121) and two phone layout faults (D-0127): wave
  journeys cover only touched features, so run every spec on desktop and phone-portrait once after THE HABITAT ENABLE
  (or at the latest in wave 16 before the gate run) and re-pin by cause.
  2026-10-18 (lead): moved to after wave 15's integration, on the integrated tree, so ONE sweep covers the enable
  (47f8399) and wave 15; running it beside wave 15's builders on 2 cores / 7 GB would slow their own journeys into
  timeouts. The wave 16 task writer (reading only) can run during it.
