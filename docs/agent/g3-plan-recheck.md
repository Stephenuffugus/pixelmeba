# Phase 3 plan re-check: corrections to `docs/agent/g3-plan.md` after Phase 2 waves B and C

- **Date:** 2026-09-29.
- **HEAD at the time:** `3ebfdf5 docs(agent): read-only Phase 3 plan re-check workflow script`. Tags `g0` and `g1` only (no `g2` yet). The code equals wave C (`9708c29`) plus docs. `docs/DECISIONS.md` runs through D-0032; D-0033 is reserved for g2-close.
- **Working tree:** g2-close was editing it during the check: 17 modified tracked files (`src/persistence/store.ts`, `src/ui/state.ts`, `src/ui/panels/WhatIf{Sheet,State}.tsx`, `src/ui/strings/whatif.ts`, `src/ui/views/{Home,NewDish,Saves}.tsx`, `src/worker/{client,host,protocol}.ts`, `tests/e2e/{new-dish,observe}.spec.ts`, `tests/tools/sim-tune.test.ts`, `tests/worker/whatif.test.ts`, `tools/sim-{run,tune}.ts`) plus untracked Keep* files and `docs/reports/*`. None of it touches `src/sim/`, `content/`, `public/atlas/` or `PROTOCOL_VERSION`. Everything below is judged against the committed tree; G16 lists what to re-check after g2-close commits.
- **Plan checked:** `docs/agent/g3-plan.md` as committed in `ba5158c` (written at `6a35126`, Phase 2 at wave A). It has 888 lines (the last has no newline, so `wc -l` prints 887). "Line N" always means a plan line.
- **Method:** read-only checker + skeptic per plan section. The checker compared every claim with the committed tree (`git show HEAD:<path>`, `git ls-tree -r --name-only HEAD`, `git grep -n <pattern> HEAD -- <paths>`); the skeptic tried to refute each correction and fact. Only what survived is listed, with the skeptic's adjustments applied. Nothing was built, tested or simulated. While compiling this file I re-checked with `git show`/`grep`: every schema-version line in the plan (G1), the stage-8/Lab boundary in `src/sim/structures.ts` (G6), and every pinned test line in G4.
- **Severity:** BLOCKER = `npm run check` goes red, or a wave cannot finish as written. MAJOR = wrong ownership, a missing file, or a rule that would ship wrong behaviour or a false label. MINOR = stale status, path, number or wording.
- **How to apply:** make the four lead choices first (G2 old-save hashing, G3 who bumps buildPhase, G10 Sample Cancel, G11 relationship store), then apply the global corrections, then each section's rows. Every "Replace with" block is paste-ready: copy the fenced text verbatim. A note under a block says when it belongs to one option of a choice.
- **Row IDs:** `P-nn` = Preflight and plan §0–§3 (lines 1–174); `W1-nn` … `W6-nn` = the wave sections (Wave 6 also covers §5, §6 and the appendix). Rows are sorted by plan line. "MISSED" means the plan has no line for the item; the row names the line to insert it next to.

## Counts

| Section | Plan lines | BLOCKER | MAJOR | MINOR | Rows |
|---|---|---:|---:|---:|---:|
| Preflight (§0–§3) | 1–174 | 3 | 10 | 15 | 28 |
| Wave 1 | 175–279 | 4 | 9 | 14 | 27 |
| Wave 2 | 280–399 | 5 | 7 | 18 | 30 |
| Wave 3 | 400–517 | 2 | 10 | 13 | 25 |
| Wave 4 and the module flip | 518–611 | 1 | 9 | 14 | 24 |
| Wave 5 | 612–716 | 0 | 8 | 15 | 23 |
| Wave 6, §5, §6, appendix | 717–888 | 1 | 5 | 22 | 28 |
| **Total** | | **16** | **58** | **111** | **185** |

---

## Global corrections

These apply across waves. Each names the rows that carry its paste-ready text.

### G1. World schema: Phase 3's single bump is 3 → 4

- `SCHEMA_VERSION` is already 3 (`src/sim/world.ts:29`; 3 = P2.8 `history.traits`/`history.journal`, D-0031). `COLUMNS_ADDED_IN = {2: ['dryTimer']}` (`src/sim/serialize.ts:144`). `migrateWorldState` (`:154`) loops `v = schemaVersion + 1 … SCHEMA_VERSION` (`:158`), fills each added column with `new Ctor(highWater)`, i.e. zeros (`:163–164`), runs P2.8's `v === 3` history step (`:168`) and tags `provenance.migratedFrom` (`:171–174`, D-0029). Columns registered under `[3]` would never reach a g2 save, and `deserializeWorld` would throw `entity column … missing` (`:197`).
- The g2 saves the Preflight writes are real world-schema-3 files (they exercise 3 → 4). The committed fixture `tests/persistence/fixtures/schema2-cleaning-crew-t1900.pixelmeba.gz` exercises 2 → 4.
- Schema 4 contains:
  - the entity columns of plan line 190, plus link columns or link tables (empty = −1);
  - the stores `objects` (`[]`) and `sample` (`null`);
  - `COLUMNS_ADDED_IN[4]`, and a `v === 4` step after the `v === 3` history step;
  - a −1 fill for new NEG_ONE_DEFAULT columns. Export one `emptyValueOf(name)` from `src/sim/entities.ts` (NEG_ONE_DEFAULT is module-private at `:113`) and use it in the migration, and in stateHash under G2 Option A. A zero-filled link slot points at slot 0 with stored birthId 0, and birthIds start at 1, so every migrated organism would carry a dangling link and the import check would refuse every old save;
  - if the lead takes W4-07/W4-19 (the D-0019 usable-intake clock for E04/E12): one more f64 column (e.g. `noUsableIntakeSeconds`, default 0). Then plan line 190's last sentence ("'No intake for 10 s' is derived from the existing lastIntakeTick; do not add a column for it.") goes.
- The foundation must also own and update `tests/sim/history-debris.test.ts` (schema literal 3 at `:97`, `:110`, `:142`, `:183`; old-save stateHash literals at `:168`, `:176`, see G2) and `tests/persistence/migration.test.ts:35`.
- Every plan line with a schema number (grep-verified; lines 518–716 have none):

| Plan line | Says now | Row |
|---|---|---|
| 39 | "W1 foundation (schema 3: …)" | P-06 |
| 96 | "W1 foundation: schema 3" | P-12 |
| 177 | meta.description "(schema 3, links, …)" | W1-01 |
| 190 | "(1) Schema 3 (current + 1 if Phase 2 already bumped …)" | W1-05 |
| 196 | "COLUMNS_ADDED_IN[3]" | W1-07 |
| 201 | "the schema-2 g2 saves" | W1-10 |
| 202 | "schema 2 → 3 and 1 → 3" | W1-11 |
| 282 | STATE "schema 3 with links …" | W2-01 |
| 402 | STATE "…" (inherits line 282) | W3-01 |
| 809 | "`migration.test.ts` (2→3, 1→3)" | W6-20 |
| 885 | "serialize.ts: schema 3, links, stores, stateHash" | W6-27 |

### G2. Lead choice 1 (before the Preflight): how old saves hash after schema 4

- `stateHash` (`src/sim/serialize.ts:225`) hashes `highWater`, then the name and `[0, highWater)` values of every `ENTITY_COLUMNS` entry (`:237–241`). Appending columns, even all-default ones, changes the hash of every loaded g2 save; so does hashing a new store or counter unconditionally. Fields are already safe: only allocated fields are hashed, and an old save allocates from its own manifest. History, events, provenance, `ledger.energy` and the ledger breakdown are not hashed.
- Old-save hashes are pinned on purpose: g2-replay's `expected.json` (plan lines 125–126) and `tests/sim/history-debris.test.ts:168` (`'baa42a29186c6c46'`) and `:176` (`'5ce059e49121f688'`), the only stateHash literals in the tests. Plan line 96 ("new zero columns and stores enter stateHash") contradicts plan lines 126 and 201.
- **Option A, hash-neutral stateHash** (W1 and W6 checkers): hash a post-g2 column only when some slot in `[0, highWater)` differs from its empty value (0, or −1 for link slots); a store only when non-empty; a new counter or WorldSettings key only when non-default. A loaded world with no Phase 3 state then hashes exactly as the g2 build hashed it. Rows: P-12 (Option A text), W1-05, W1-06, W1-10, W1-11, W6-22. Plan line 126 stays as written.
- **Option B, digest-only** (Preflight checker): stateHash changes at W1; g2-replay and the fence compare `trajectoryDigest(world, 'g2')`; the foundation converts or re-records `history-debris.test.ts:168/:176` under its DECISIONS id. Rows: P-12 (Option B text), P-21, and in PRE line 146 "continue bit-identically" → "continue with identical trajectory digests"; adjust W1-05, W1-10 and W1-11 as their notes say.
- Both options: the −1 migration fill (G1); fresh worlds still change hash with every content edit (`contentHash`/`contentVersion` at `serialize.ts:229`); the trajectory digest needs a `'full'` mode (P-17).

### G3. Versions and manifest bumps; lead choice 2

- HEAD values: `content/manifest.json` simulationVersion 3, evolutionRulesVersion 1, moduleRegistryVersion 1, phenotypeMappingVersion 1, contentVersion 1, buildPhase 2; world `SCHEMA_VERSION` 3; `PROTOCOL_VERSION` 1 (`ENT_STRIDE` 12); atlas manifest `pixelmeba-atlas` version 1.
- `simulationVersion` is pinned: `ManifestSchema` has `z.literal(3)` (`src/sim/content/schema.ts:356`), and `loadSaveFile` refuses anything else (`src/persistence/saveFile.ts:266`). Never bump it. A decided rules change bumps `evolutionRulesVersion` (biology or evolution rules) or `moduleRegistryVersion` (the module registry), with a DECISIONS entry (P-23, W6-23).
- **Lead choice 2: who bumps buildPhase 2 → 3 and contentVersion 1 → 2.** All twelve materials the W1 environment builder enables are phase 3, and `validateContent` refuses them while buildPhase is 2 (`registry.ts:356`). Until the bump lands, `buildRegistry` throws for every agent (`registry.ts:445–448`, through the cached `loadRegistryFs`), and `content-validate --write` refuses to write the hash.
  - Option P (Preflight and wave-2 checkers; P-26, W2-02): the lead bumps in the Preflight commit, after writing `tests/fixtures/saves/*` at g2 values, together with the pinned-test fixes of G4 ("Preflight item 10"). Drop the bump from the foundation (lines 188, 199).
  - Option W (wave-1 checker; W1-02, W1-09, W1-13): the foundation makes the bump its FIRST edit and fixes the literals; the environment builder edits the manifest only after that.
  - Either way the bump breaks `tests/sim/modules.test.ts:48`, `tests/recipes/variants.test.ts:403` and `tests/sim/lab-commands.test.ts:903` (both say "(build phase 2)"), and the wave-A golden stamps (`contentVersion` 1). See G4.
- `moduleRegistryVersion` 1 → 2 at the W4 flip (lead; W4-20, W4-21).
- `PROTOCOL_VERSION` 1 → 2 once, by W2 art-features (`ENT_STRIDE` 12 → 14, `E_CUE2`, `E_LINKMASK`). ARCH §7 is headed "protocolVersion: 1": update it or record the bump in DECISIONS (cf. D-0018). g2-close does not bump it.

### G4. Tests pinned to the shipped registry

The wave-2 checker's "Preflight item 10" (W2-02) and the Preflight checker's "step 3b" (P-11) are the same step: one Preflight commit that makes every unit test reading the shipped manifest independent of it. `registryWith(G2_LISTS)` must carry the g2 `contentVersion` (1), because each gate stamp records `manifest.contentVersion` (`src/sim/experiments.ts:633`), and one registry must be shared by `runCard`, `runTwiceIdentical`, `expectReplayIdentical` and `untouchedRecipeHash` within a test. All lines below were re-checked at HEAD.

| Test (file:line) | Pins | Breaks at | Fix | Rows |
|---|---|---|---|---|
| `tests/sim/modules.test.ts:48` | buildPhase 2 | buildPhase bump | read it from `registryWith(G2_LISTS)` or drop it (47–57 change again at the W4 flip) | P-26, W1-09, W2-02 (e) |
| `tests/recipes/variants.test.ts:403` | "(build phase 2)" in a message | buildPhase bump | build the message from `reg.manifest.buildPhase` | W1-09 |
| `tests/sim/lab-commands.test.ts:903` | "(build phase 2)" in a message | buildPhase bump | same | W1-09, W1-13 |
| `tests/experiments/golden/wave-a-measurements.json` through `tests/experiments/golden.ts` `expectWaveANumbers` (tests/experiments/{cleaning-crew,exp-a-starch,exp-b-grazer,food-trail,light-and-life,predator-balance}.test.ts) and `expectWaveAComparison` (`tests/sim/comparison.test.ts:406–420`) | stamp.contentVersion 1 (6 cards); per-species and per-field catalog keys (extras fail: `golden.ts:77–81`, `:88–91`); comparison species lists | contentVersion bump; W2/W3 species and the film/viruses systems; W4 flip (module draws) | realize under `registryWith(G2_LISTS)` with contentVersion 1; never rewrite the golden file; record shipped-manifest changes in `docs/reports/experiments-g2.md`. Fallback (W1-09): compare the stamp without contentVersion, which fixes only the contentVersion break | P-11, W2-02 (f), W4-24 |
| `tests/worker/host.test.ts:30` | speciesIds = the five g2 species | first species enable (W2), again at W3 | `toEqual(registry().manifest.enabledSpecies)` | P-11, P-26, W2-02 (a), W3-05 |
| `tests/content/validator.test.ts:64–72` | enabling B02 errors naming BIOFILM | W2 (BIOFILM implemented, film enabled) | B09 (SIGNAL_GLOW) or B13 (RIVALRY), keeping buildPhase 7 | W2-02 (b) |
| `tests/content/validator.test.ts:74–81` | "\"B03\" is not enabled in this build" | W2 organisms | `'B10'` | W2-02 (b), W2-10 |
| `tests/experiments/framework.test.ts:111` | EXP_106 command species `'P02'` refused | W2 organisms | `'P05'` | W2-02 (c), W2-10 |
| `tests/recipes/variants.test.ts:419–420` | R-G1 needing 'viruses' refused | W2 parasites-phage | `'developmental'` (off until Phase 7; 'devices' arrives with P5.2) | W2-02 (d), W2-16 |
| `tests/sim/lab-commands.test.ts:1003` (`gardenInfo`) and `:1026–1043` | the Garden's five species; exact "Lives here" sentences | first species enable (W2) | build gardenInfo's DishHost on `registryWith(G2_LISTS)`, or derive the expected text from info | W2-02 (g), W2-03 |
| `tests/sim/lab-commands.test.ts:949–974` | Life-brush preview ≡ `canOccupy` for every shipped species, including flipped-attached variants | attached species enabled after W1's surface rule; V01 | G7 | P-08, W1-16, W2-03, W2-14 |
| `tests/e2e/experiments.spec.ts:47` | 7 shipped cards | cards ship (W3 EXP_201–204; W5 EXP_104/105/212) | update the count | P-11, P-26, W3-02 |
| `tests/experiments/framework.test.ts:34`, `tests/experiments/app-flow.test.ts:67`, `tests/experiments/journal-and-words.test.ts:141` | the seven Phase 2 cards (five paired) | W3 EXP_201–204 | extend (paired: EXP_203, EXP_204) | W3-02 |
| `tests/experiments/framework.test.ts:56` | card seed = recipe seed | EXP_204 (seed 204) on a seed-201 recipe | its own recipe BROKEN_CATALYST_V1 (seed 204) | W3-02 |
| `tests/experiments/journal-and-words.test.ts:102–116` | words the arms of every shipped card | the 'omitFounders' change kind | a `describeArms` case | W3-04 |
| `tests/sim/view-switch.test.ts:351`, `:406`, `:430` | Tools tray = the four structure tools; `[]` for an older dish | W3 Sample and Clean water items | extend or restate | W3-18 |
| `tests/sim/module-visuals.test.ts:127`, `:132`, `:153` (`toBe(32)`), `:187`, `:231–233` | the three Phase 2 marks; regexes over renderer source | W2 art layers | generalize; keep the matched renderer lines | W2-22 |
| `tests/content/atlas.test.ts:134–138`, `:142`, `:197` | enabled marks = E01/E03/E05; a FEATURE_FRAMES entry per mark; 3 marks | W4 flip (and any module enable) | the ten visualLayers; FEATURE_FRAMES rows (W2-29) | W4-20, W4-21 |
| `tests/sim/history-debris.test.ts:97`, `:110`, `:142`, `:183`; `:168`, `:176` | schema 3; old-save stateHash | W1 schema 4 | G1, G2 | W1-05 |
| `tests/persistence/migration.test.ts:35` | SCHEMA_VERSION 3 | W1 | 4 | W1-11 |
| W4 flip: `tests/sim/modules.test.ts:47, 51, 56–57, 62, 98–99, 117, 119, 122`; `tests/fixtures/module-accounting.test.ts:128–130`; `tests/fixtures/registry-imports.test.ts:196, 226, 228–231, 244–248, 265–269`; `tests/sim/founders.test.ts:188–192`; `tests/sim/founders-newdish.test.ts:90–95, 145–149`; `tests/e2e/new-dish.spec.ts:93, 134` | the g2 module registry | W4 flip | pin Phase 2 subjects to `registryWith(G2_LISTS)`, else the new values | P-16, W4-20 |
| Accelerated seed-101 FIRST_DISH_V1 tests (lineage-panel, lineage-host, branch-evidence, strip-names, e2e `lineage.spec`) | trajectories | W4 flip | full `npm run check` and Playwright before ticking P3.7 | W4-20 |
| `tests/content/validator.test.ts:32–34` | manifest contentHash = computed hash | every content edit | `npx tsx tools/content-validate.ts --write` | PRE line 148 |

### G5. Phase 2 paths (replace every "verify; find with git grep" hedge)

All exist at HEAD (P-01, W6-26):

- **Lab:** `src/ui/views/LabView.tsx` (keys `handleViewKey` `:402`, `labGestures` `:375`, `LabToolId`, `payloadFor`, `sendLabCommand` `:235`), `src/ui/views/LabToolbar.tsx`, `src/ui/panels/LabTray.tsx` (`trayItems` `:103`, `categoryOf`, `itemCopy`, `ToolsActions`), `src/ui/panels/LabTrayContent.tsx` (`lifeBrushFor` `:142`, `structureTools`, `habitatTools`), `src/ui/panels/LabTrayIcons.tsx`, `src/ui/panels/LabTrayNames.tsx`, `src/ui/strings/lab.ts` (`LabCategory` `:12`, `FOOD_MATERIALS`/`CHEMISTRY_MATERIALS` `:33–34`, `ERASE_STRUCTURE` `:108`, `MATERIAL_COPY` `:128`, `FALLBACK_MATERIAL_COPY` `:163`, `LIFE_COPY` `:171`, `OVERLAYS` `:244`).
- **Overlays:** `src/ui/panels/OverlayPicker.tsx` (`availableOverlays` `:19` filters `OVERLAYS` by `DishInfo.fieldIds`), `src/ui/panels/OverlayLegend.tsx`.
- **New Dish:** `src/ui/views/NewDish.tsx` (`RECIPE_ID = 'FIRST_DISH_V1'` `:30`; "Start with" ChoiceGroup `:202–218`, testId `new-dish-start-with`; no habitat picker), `src/ui/panels/AdvancedEvolution.tsx`, `src/ui/strings/modes.ts`.
- **Journal:** `src/ui/journal.ts`, `history.journal` in `src/sim/history.ts` (`:89`; `JOURNAL_KINDS` `:369`; `journalRecordProblem` `:464`; `putJournalEntry` `:490`), `src/ui/views/NotebookJournal.tsx`.
- **Notebook:** `src/ui/views/Notebook.tsx` (testids `notebook-tab-experiments`, `experiment-card-<ID>`).
- **Atlas feature marks:** `art/src/layers/modules.ts` (`FEATURE_LAYERS`), `src/render/features.ts` (`FEATURE_LAYER_IDS`, `featureLayers(cue, life, selected, out)`, `MAX_UNSELECTED_MARKS` 2), `tools/content-validate.ts` (`FEATURE_FRAMES` `:84–91`, `featureFrameKey` `:96` → `feature/<layer>/<heading>/<frame>`, `enabledMarks` `:101`).
- **Lab habitat edits and placement:** `src/sim/structures.ts` lines 96–387 (G6) and `src/sim/grid.ts` (`isStoneEdge` `:140`, `PLACEABLE_STRUCTURES` `:199`, `STRUCTURE_RECORD_IDS` `:216`, `PAINT_TARGETS`, `brushCellOutcome` `:255`, `LifeBrush`/`lifeCellOutcome` `:326–343`, `strokeFootprint`, `planSealing` `:381`, `openForFree`, `transportOpen`, `sealsCell`).
- **Lab brush preview:** `src/render/renderer.ts` `setBrushPreview` (~930–972).
- **Structure records:** `content/structures/{STONE,WALL,BEAD}.json` (since `b17aa5b`).

### G6. `src/sim/structures.ts` has two parts

- Lines 1–94: stage 8. `substrateNear`, `secrete`, `stageStructures` (`:73`; `dormancyStep` call `:82`; non-Active organisms `continue` at `:83`, before `secretionCode` is written at `:87`). Line 95 is blank.
- Lines 96–387: the P2.7 Lab habitat edits (header comment at 96, code from 117): `LabStroke` (`:117`), `HabitatEditPayload` (kinds paintSubstrate, paintShade {erase}, placeStructure, eraseStructure), `HABITAT_EDIT_KINDS` (`:141`), `HabitatSkips {rim, structure, organism, enclosed}` (`:149`), `occupiedCells` (`:200`), `invalidHabitatEdit` (`:212`; stroke bound `:227`), `paintMaterial` (`:237`), `shadeFactor` (`:245`), `structureEnabled` (`:252`), `applyHabitatEdit` (`:278`), `moveContents` (`:363`, iterates FIELD_IDS), `habitatEditRule`, `unavailableHabitatEdit`, `LAB_MAX_POINTS`, `LAB_MAX_STROKE_SAMPLES`. `commands.ts:23` imports it; `placeStructure` → `applyHabitatEdit` (`commands.ts:122–127`); `tests/sim/lab-commands.test.ts` and `deposit-bounds.test.ts` test it.
- Ownership: stage8 (W1) and mod-builders (W4) own only the stage-8 part; f02-links (W3) adds one hook line; food-objects (W3) makes one additive edit in `applyHabitatEdit` (object cells refused for 'place', after `invalidHabitatEdit`); nobody else touches the Lab part. Rows: P-09, W1-14, W1-20, W3-15, W4-15. Risk 28 (line 881) is correct as written.

### G7. The Life-brush preview must keep mirroring `canOccupy`

- `src/sim/grid.ts` `lifeCellOutcome(structure, substrate, LifeBrush{habitatMask, attached})` (`:326–343`) is "exactly the inoculate command's cell filter" (`canOccupy` → `habitatCompatible`: `movement.ts:44`, `suitability.ts:37`). `src/render/renderer.ts` `setBrushPreview` (~930–972) draws it, and draws the 'place' rule through `brushCellOutcome` (`grid.ts:255`) with an occupied mask built from snapshot entities. `tests/sim/lab-commands.test.ts:949–974` compares preview and `canOccupy` cell by cell for every species of the shipped world, including flipped-attached variants.
- `src/render` imports `@sim/constants` and `@sim/grid` (`layers.ts:6`, `renderer.ts:10`, `:31`), so `grid.ts` must stay free of simulation modules (never import `viruses.ts`).
- W1 environment (P-08, W1-13, W1-16): the surface check goes into `habitatCompatible`, so suitability, inoculation, births, recipe founders, specimens and movement all apply it. `LifeBrush`/`lifeCellOutcome` gain the surface list and a stone-edge input; `setBrushPreview` and `LabTrayContent.lifeBrushFor` pass them (`DishInfo.speciesAttachment`, `protocol.ts:248`); the parity test gains B02 built from its record.
- W2 organisms (W2-14): V01's viral preview (`LifeBrush.viral`, stated over grid codes only, equal to the phage command's cell filter that parasites-phage exports from `src/sim/viruses.ts`). If W1 did not make the preview surface-aware, organisms does it (W2-03), and `livesHereText` says attached species need a surface in open water.
- W3 food-objects (W3-15): object cells refused for 'place' in `applyHabitatEdit`/`brushCellOutcome` and in the renderer's preview.

### G8. Two death paths; divisions re-key stored references

- Two paths free a slot: `killEntity` (`src/sim/maintenance.ts:120`, free at `:153`) and the predation capture `consumePrey` in `src/sim/contacts.ts` (`:93–141`: `onDeath` at `:136`, `world.ents.free(prey)` at `:139`, no `killEntity`). Every removal hook must cover both: `removeAllLinks` (W1-03), parasite release (W2-18), E12 link removal (W4). Lysis (W2) and sampling (W3) call `removeAllLinks` too.
- `commitDivision` keeps the retained daughter in slot `i` with a NEW birthId `b0` (`births.ts:278`); the new daughter gets `b1` in a slot `allocate()` has just cleared (`:169`, `:279`). Every stored `(slot, birthId)` reference to the parent dangles unless re-pointed: fungal links (`rekeyLinks`, W1-04), X01's `hostBirthId`, and a dividing parasite's host `parasiteBirthId` (W2-18). W4 removes E12 links and resets E04 at division (mod-adhesion line 588, mod-anchor-light line 533).
- SPEC §6.8 death triggers are H ≤ 0, age ≥ maxAge, predation, lysis and sampling. There is no biomass floor, so the parasite-drain death needs an explicit trigger (W2-17).

### G9. Film never joins `sp.foods`

- Preference mutation draws over `n = sp.foods.length` (`src/sim/mutation.ts:129–139`: `detInt` over n and n − 1; initial weights 2/(n+1) and 1/(n+1)). `src/sim/species.ts:82` filters 'film' out of every food list. B04 (`foodPriority [detritus, protein, starch, oil]`, `digestsFilm` true) has n = 4.
- If film joined `sp.foods` in film-enabled worlds, every B04 preference mutation would change (Standard 2 %, Accelerated 4 % per daughter): FIRST_DISH_V1 (8 B04), CLEANING_CREW_V1 (10 B04), EXP_103, EXP_B. That is a silent W2 biology change, and probabilistic enough to slip past the fence window.
- Fix (P-15, W2-04): film is eaten "as detritus" (CT §3.5). It never joins `sp.foods`; intake adds a film request after the listed foods (ordered policy) or with the detritus weight (weighted policy), within K = 6 requests (`intake.ts:38`). Test: a B04 preference mutation draws the same with and without the film system. If the owner rules film a separate food, that is a forced change like the W4 flip (DECISIONS + `fence-update --reason`), and `species.ts:82` must change, which no prompt lists.
- `FILM_DIGESTION_IMPLEMENTED` (`implemented.ts:14`) only feeds the display flag `digestsFilm` (`snapshot.ts:272`, already ANDed with `world.fields.film !== undefined`). The W1 foundation replaces it with `worldHasSystem(world, 'film')` (P-05, P-14). That is harmless before W2 because no shipped world has film until then, so W2 must land film digestion and the film system together.

### G10. Lead choice 3 (before W3): Sample Cancel and the hashed `commands.nextSeq`

- `stateHash` hashes `world.commands.nextSeq` (`serialize.ts:256`); every `applyNow`/`queueCommand` takes a seq, accepted or refused (`commands.ts:60`); `nextSeq` keys inoculation order (`commands.ts:264`). A take command plus a return command advance it by 2, so a command-based Cancel can never give back the pre-begin hash. Plan line 490 (Cancel = command 'sampleReturn', hash must equal the pre-begin hash) contradicts line 833 (Cancel is host-level). SPEC §10.5, D07 §09 and BUILD_DIRECTIVE P3.5 say Cancel restores the checkpoint exactly.
- Both checkers agree: Begin is host-level (pause, record the pre-begin stateHash); Take ('sampleTake'), Transfer and Discard are commands; while a sample is held the host refuses Run, Step and every other dish-changing command before `applyNow`, so no seq is taken and the vacated slots and cells stay free; never remove `nextSeq` from stateHash.
- **Option W3** (W3-20, W3-23, W3-25): Cancel is host-level. It makes an exact inverse move into the original slots and cells, then restores the command state as Undo does (`host.ts:476–506`): drop the 'sampleTake' entry from `commands.log`, set `commands.nextSeq` back to that command's seq (recorded in `world.sample`), and reset the host's rollback checkpoint, replay list and undo slot. Exact pre-begin hash, also after a reload. The W3 skeptic judged this replay-safe, like Undo.
- **Option W6** (W6-21): while the host's one-level undo snapshot is still the Take's, Cancel restores it (exact). After a reload there is no snapshot, so Cancel is the command 'sampleReturn' (exact inverse move); the result equals the pre-begin world except `nextSeq` + 2, the tests assert exactly that, and the difference is logged in DECISIONS for the owner. The W6 checker judged a post-reload rewind of `nextSeq` and the log a replay gap.
- Rows either way: W3-19 (refusals), W3-21 (slot remapping), W3-24 (a refused transfer still takes a seq), W3-25 (e2e hash through the worker), and plan line 509's after-reload Cancel. Also decide whether Undo is refused or acts as Cancel while a sample is held (W3-19).

### G11. Lead choice 4 (before W5): where relationship observations live

- The P2.8 journal: `JOURNAL_KINDS = ['experimentStamp', 'observation']` (`src/sim/history.ts:369`, not exported); `journalRecordProblem` (`:464`) validates in the worker, on import and in the Notebook; 'observation' is the player's own note ("I saw X coincide with Y", `src/ui/journal.ts:96–118`). Entries for the open dish go through `setJournalSink` into that dish's `history.journal` (D-0031), which autosaves. The device list and the dish list each keep 200 and evict the oldest (`journal.ts:199–208`, `history.ts:490–497`).
- Plan line 634 ("stores it with the dish, sim time and event id") and line 872 ("in the local UI journal store (P2.8), not in saves") cannot both hold; change them together.
- **Option (b), a device store** (W5-07; W6-24 option b): a separate device-local store owned by `src/ui/badges.ts` (W5: `localStorage 'pixelmeba.seen'`; W6: e.g. `'pixelmeba.relationships'`), every read and write in try/catch, never through `setJournalSink` or the P2.8 validator.
- **Option (a), a journal kind** (W6-24 option a; the PROPOSED DECISION in W5-07): a new 'relationship' kind with its own validator, saved with the dish outside the state hash. Then field-guide's SHARED list gains `src/sim/history.ts` and `src/ui/views/NotebookJournal.tsx`, relationship entries must never push the player's notes and stamps out of the 200, and a `loadSaveFile` round-trip test is needed.
- Where the observations come from: W5-05 (events record captures and, after W3, lysis and parasite-drain deaths; an observation-only watcher in the worker records the rest).

### G12. Ports, servers, scratch, worker access in e2e, workflow template

- **Ports.** g2-close used 4191 (keep builder), 4201 and 4211 (verifiers at +10/+20), 4221 (re-verifier at +30) and 4195/4196/4197 (review, rerun, fix). 4211 and 4221 are the W1 foundation's and W2 film-fungi's builder ports, and `playwright.config.ts:24` has `reuseExistingServer: true`, so a leftover server would be reused silently with a stale build. Before the Preflight and before each wave run `for p in $(seq 4173 4299); do lsof -t -i :$p | xargs -r kill; done` (P-07). `tools/render-bench-run.ts` hard-codes PORT 4176 on the Vite dev server and ignores `E2E_PORT`/`E2E_OUTDIR` (W6-14).
- **Scratch.** Verifier scratch goes in `tmp/verify-${t.key}/` (git-ignored; tsx then resolves the repo's `node_modules` and `@sim/…` aliases) (P-27).
- **Worker access in e2e.** The app has no test hook. Journeys wrap `Worker` in an init script and speak the protocol ('hash', 'save'), as `tests/e2e/lab-tools.spec.ts` does (`watchWorker` `:17`, `workerHash` `:39`). Never add a hook to the app (W3-16, W3-25).
- **Template.** VERDICT stays as in `g2-wave-b.workflow.js.txt`; `pipeline(...)` follows `g2-close.workflow.js.txt` (build → verifier lenses → ≤ 2 fix rounds → re-verify; reports in `docs/reports/reviews/g3-wave-N/`). One verifier per task at builder port + 5; a second lens or a re-verifier needs a port outside every running wave's decade (P-28, W6-28).
- **PRE additions from g2-close:** run long commands with `run_in_background` and an until-loop (never a bare sleep); never run prettier on files you do not own; check 200 % text in both phone portrait and phone landscape.
- **CPU contention.** Timings taken while other agents run Playwright or `sim:tune` are inflated: take final perf numbers on a quiet machine or leave the command for the lead (W6-12). Preflight step 8 (line 135) repeats g2-close's TUNE measurement (`sim:run -- --recipe FIRST_DISH_V1 --seed 104729 --ticks 6000 --perf` for both presets, in `docs/reports/tune-g2.md`); cite those numbers instead of re-running.

### G13. Content validation mechanics every builder hits

- `validateContent(raw)` has one parameter (`src/sim/content/registry.ts:186`); add `opts?: { allowUnimplemented?: boolean }` with the current behaviour as default (P-19).
- Enabled lists must be sorted ascending (`registry.ts:313–319`): write `registryWith({ enabledModules: [...shipped, 'E0x'].sort() })` (W4-02).
- `loadRegistryFs()` is cached (`tools/lib/content-fs.ts:47–48`, `cached ??=`); `loadRawPacksFs()` re-reads the disk. Never mutate the cached registry; deep-copy raw packs before patching (`mutateRaw`, `tests/recipes/helpers.ts:89`).
- `registryWith` patches every manifest list (`enabledSpecies`, `enabledModules`, `enabledSystems`, `enabledMaterials`, `enabledHabitats`, `enabledStructures`), `developmentalEnabled`, `buildPhase` and the version fields; `simulationVersion` stays 3 (P-19).
- `checkAtlas` runs in `npm run content:validate`, `tools/art-build.ts:223` and `tests/content/atlas.test.ts` (part of `npm run check`), never inside `validateContent`/`registryWith`. Since D-0032 it refuses an enabled module without its 16×16, 4-heading feature-mark frames keyed `feature/<layer>/<heading>/<frame>`. The seven Phase 3 layers are all missing today: anchor_foot (E04), shade_patch (E06), light_trail (E07), debris_granule (E08), protein_notches (E09), matrix_edge (E10), adhesion_link (E12). `FEATURE_FRAMES` (`tools/content-validate.ts:84–91`) lists none of them (an unlisted layer needs ≥ 1 frame). W2 art-features adds the rows and tests every Phase 3 module record's mark (W2-29); the lead confirms them before the W4 flip (W4-21). W2 draws E12 as link pixels, but `adhesion_link` still needs an atlas entry.
- `content-validate --write` writes the contentHash only with zero errors (`content-validate.ts:310–318`); `tests/content/validator.test.ts:32–34` checks it; concurrent content editors rewrite it, which is not their bug (say so).
- The Lab offers only enabled materials that are on `FOOD_MATERIALS`/`CHEMISTRY_MATERIALS` (`src/ui/strings/lab.ts:33–34`), and each needs `MATERIAL_COPY` (P-02).
- "No additional modeled reaction.": at HEAD only SUGAR, NUTRIENT and DEBRIS lack it; keep one exceptions list (W1-15, W5-06).

### G14. FLAG bits and reason codes

- `FLAG` bits 0–11 are taken (`src/sim/entities.ts:136–151`, append only): attached 1, stressed 2, feeding 4, hunting 8, capacityBlocked 16, overCapacity 32, moving 64, secreting 128, justBorn 256, introduced 512, restDry 1024, usableIntake 2048. Reserve now: `1 << 12` `FLAG.secretingProtein` (W4 mod-builders, W4-16) and `1 << 13` `FLAG.detritusIntake` (W4 mod-feeding, W4-12); give each of those builders `src/sim/entities.ts` as SHARED for that one appended line.
- `E_CUE` is a Float32 slot, so bits 11–23 would still be exact; `E_CUE2` is the plan's choice, not a necessity.
- `REASONS` (`src/sim/reasons.ts`) is append-only (`:3`) and saved in entity columns. A builder without `src/sim/reasons.ts` and `src/ui/strings/reasons.ts` cannot add a code (W1-21). Existing codes include ENERGY_LOW (`:31`), ANCHORED (`:61`), LINKED (`:62`), SECRETING, SECRETION_NO_SUBSTRATE (`:72`), SECRETION_ENERGY_LOW (`:73`), SECRETION_SATURATED (`:74`), SUIT_OXYGEN_HIGH, OXYGEN_LIMITED, LIGHT_LIMITED, DIV_BLOCK_PLACEMENT, DIV_BLOCK_CAPACITY, DIV_BLOCK_INFECTED, REMOVED_SAMPLED, DEATH_LYSIS and DEATH_PARASITE_DRAIN (`:84–85`).

### G15. Already built by Phase 2: do not rebuild

- Lab habitat edits (P2.7): Erase structure (kind 'eraseStructure', Tools-tray item 'erase', copy `ERASE_STRUCTURE`), shade paint × the SHADE record's 0.1 with erase → 1.0 (`shadeFactor`), substrate paint, stone/wall/bead placement with sealing moves (P-04, W1-14, W3-17, W3-22, W4-01).
- Structures as content: `content/structures/{STONE,WALL,BEAD}.json`, `StructureSchema` (`schema.ts:127`), `enabledStructures`, loaders `tools/lib/content-fs.ts:38` and `src/sim/content/raw-vite.ts:35` (W5-01, W5-03).
- Chemistry in `src/sim/transport.ts`: gas exchange (0.02; × 0.1 in sediment; none with the lid closed), inhibitor decay 0.002 per tick, neutralization, pH clamp 2–12, moisture; tested in `tests/sim/transport.test.ts:59`, `:79`, `:88`. The `setLid` command exists (`commands.ts:32`, `:106`) (W1-14).
- Suitability: OXYGEN_SUPPRESSED (× clamp(1 − O2/0.4), SUIT_OXYGEN_HIGH) and inhibitor exposure with the film × 0.5 (`suitability.ts`).
- Prey requirements 'any', 'free' and 'inSediment' (`movement.ts` `preyAllowed` `:103–110`) (W2-12).
- Infected hosts cannot divide (DIV_BLOCK_INFECTED) or heal whenever `infectedBy ≠ 0` (`births.ts` `divisionBlocker`, `maintenance.ts`); the host/parasite/infection columns exist (W2-20).
- Oil and protein deposit bands and their sheen/mote glyphs (`DEPOSIT_BANDS` 6; `src/render/layers.ts` `paintDepositCell`) (W2-26); at most two unselected marks (`MAX_UNSELECTED_MARKS` 2).
- Enzyme and breaker decay (`transport.ts`), and oil → metabolite, protein → broth and breaker (`conversion.ts`).
- The measurement grammar `converted.starch|oil|protein`, `consumed.<pool>` and `intake.SP` (`src/sim/pairedRun.ts` `parseMeasure`) (W3-03).
- The Field Guide route, its Home and More buttons, and pause-on-leave (`state.ts:28`, `:547–556`) (W5-04).
- Most of the UX §4.2 keyboard map (`DishScreen.tsx:126–165`, `LabView.tsx:402`) and the global focus ring (`styles.css:61`) (W6-04, W6-05); polite status toasts for placement and save results (W6-07).

### G16. g2-close is still in flight

g2-close is editing `src/worker/{host,protocol,client}.ts`, `src/ui/state.ts`, `src/ui/views/{NewDish,Home,Saves}.tsx`, `src/ui/panels/WhatIf*`, `src/persistence/store.ts`, `tools/sim-{run,tune}.ts` (adding `--presets` and module-draw tallies) and `tests/e2e/{new-dish,observe}.spec.ts`, and adds `src/ui/panels/Keep{Choice,Sheet}.tsx`, `src/ui/strings/keep.ts` and tests. After it commits, and before writing the wave files: re-check file names and line numbers there (NewDish's start choices, `RecipeOverrides`, host `build()`/`recipeProvenance()`, `state.ts` line numbers), confirm `PROTOCOL_VERSION` is still 1, add the Keep sheet to W6's a11y-screens list, and take the next decision id after g2-close's D-0033.

### G17. Decisions to record (collected from all sections)

| # | Decision | Rows | When |
|---|---|---|---|
| 1 | Old-save hashing after schema 4: hash-neutral stateHash or digest-only | G2; P-12, P-21, W1-05, W1-06, W1-10, W1-11, W6-22 | lead, before the Preflight |
| 2 | Who bumps buildPhase 3 / contentVersion 2: the Preflight or the W1 foundation | G3; P-26, W1-02, W1-09, W1-13 | lead, before the Preflight |
| 3 | Sample Cancel: host-level rewind, or undo snapshot plus 'sampleReturn' after reload; Undo while a sample is held | G10; W3-19, W3-20, W3-23, W3-25, W6-21 | lead, before W3 |
| 4 | Relationship observations: device store or a 'relationship' journal kind | G11; W5-07, W6-24 | lead or owner, before W5 |
| 5 | Schema 4 layout: link columns or link tables; `emptyValueOf`; migration by copy | W1-05, W1-06, W1-07 | foundation proposes |
| 6 | E04/E12 "without intake": a D-0019 usable-intake seconds column, or `lastIntakeTick` with a deviation note | W4-07, W4-19 (and G1) | lead, before W1 (it is a schema-4 column) |
| 7 | Native action-ID order = the NativeAbility enum index | plan line 241, risk 1 | record after W1 |
| 8 | SEDIMENT_EDGE: 0.010 bound N per sediment cell | plan line 221 | record after W1 |
| 9 | Habitat-only New Dish starts, and whether they keep FIRST_DISH_V1's `backgroundOverrides {sugar: 0}` | W1-17 | environment proposes |
| 10 | F02 link re-key at division; E04/E12 resets at division | W1-04 | record after W1 |
| 11 | WORKLOG `[~]` exception: P3.7 stays `[~]` while W2 runs P3.3 and P3.4 in parallel (legend: at most one) | plan line 278 | lead |
| 12 | Film is eaten "as detritus" and never joins `sp.foods`; a separate food would be a forced change | G9; P-15, W2-04 | lead or owner, before W2 |
| 13 | Fungal daughters only on four-neighbour cells (supersedes D-0002 and SPEC §6.9 step 2 for fungi; flag for the owner) | W2-06 | record after W2 |
| 14 | The infecting unit's 0.01 C joins host B with no N (SPEC §7.5 already rules the 0.01 C transfer) | W2-19 | record after W2 |
| 15 | PROTOCOL_VERSION 2 vs ARCH §7 "protocolVersion: 1" | G3 | lead, after W2 |
| 16 | EXP_203: Y02 listed first and 'omitFounders' only for the last group; "protein 0.50 with N 0.05" read as proteinN 0.05 (0.10 N per C, no free nutrient) | W3-07 | record after W3 |
| 17 | F02: "otherwise the daughter is placed unlinked" (SPEC §7.7 only says degree ≤ 4) | plan line 439 | PROPOSED DECISION in f02-links |
| 18 | Sample modes: viral units belong to Life (already settled by D01 line 359), activities to Dissolved (SPEC §2.3): cite, no new decision | plan line 487 | none |
| 19 | Are Sample and Clean water offered on g2-recorded worlds (tools, not biology; R18)? This decides `view-switch.test.ts:430` | W3-18 | lead, before W3 |
| 20 | E04 support: does the dish rim (ST_OUTSIDE) count; does an anchored carrier stay 'free' for the CT §3.2 prey rules | W4-05, W4-06 | owner |
| 21 | E12's 2 E link cost: ledger category 'other' or 'construction' | W4 facts | mod-adhesion proposes |
| 22 | A 'tools' content pack (`content/tools` + ToolSchema; not in ARCH §2/§4); guide "biology" text for UNDO, SNAPSHOT and COMPARE; where modules and habitats appear in the guide tabs | W5-02; W5 facts | lead, before W5 |
| 23 | Recipe 'ops' (gel areas) and founder extensions (placement, cells, initial, links); a new 'founder.place' stream, or an existing stream with a KIND key ('placement', 'jitter' and 'inoculate' exist) | W5-11, W5-12, W5-13 | experiments-curated proposes |
| 24 | Curated dishes: mutationPreset 'standard'; recipe IDs (CT L301/L303/L304/L306 vs the plan's file names); EXP_104/105 stoppingSeconds and player steps | W5-14, W5-16 | record after W5 |
| 25 | Audio: quiet-audio numbers and default volumes; the cue-id mapping (ARCH placement_ok vs UX placement_error; gate_click deferred per P3.10); the VIBRATE permission or no Android haptics | W5-20, W5-21, W5-22 | record after W5 |
| 26 | Keyboard placement and selection: a reticle, and Enter sends a tap through DishScreen's gesture handler | W6-06, W6-25 | record after W6 |

---

## Preflight and plan §0–§3 (lines 1–174): 3 BLOCKER, 10 MAJOR, 15 MINOR

| ID | Line | Sev | Plan says | Actually | Replace with |
|---|---|---|---|---|---|
| P-01 | 3 | MINOR | "HEAD is `6a35126`, the working tree was clean, and Phase 2 is at wave A … 'verify; find with git grep if the path differs'" | HEAD `3ebfdf5`; P2.1–P2.8 committed; P2.9, the G2 gate and tag `g2` pending (g2-close running). Every hedged path exists (G5). `eraseStructure` is a payload kind, not a function; the Lab part of `structures.ts` starts at line 96 (code at 117). | P-01: new opening paragraph with exact paths |
| P-02 | 12 | MINOR | "implement the sim rule, add it to `src/sim/content/implemented.ts`, and insert the ID into `content/manifest.json`" | The Lab offers only enabled materials that are also on `FOOD_MATERIALS`/`CHEMISTRY_MATERIALS` (`lab.ts:33–34`, `LabTray.tsx:113–118`); without `MATERIAL_COPY` the tray shows fallback text with an empty dose unit. | P-02: two sub-bullets |
| P-03 | 13 | MINOR | "The validator refuses … an enabled species without atlas frames (`tools/content-validate.ts` `checkAtlas`)" | `validateContent` has no atlas check, so `registryWith()` never sees missing frames. `checkAtlas` runs in content:validate, art:build and `tests/content/atlas.test.ts`, and since D-0032 also refuses an enabled module without feature marks; none of the seven Phase 3 layers exists. | P-03: exact validator and atlas lists |
| P-04 | 21 | MINOR | "Not implemented: … the attachment-surface rule (D-0006), food objects, … stage 8 beyond starch secretion, and E04–E12" | E05 is implemented and E11 is Phase 5; stage 8 also runs E03 dormancy; P2.7 built erase, shade/habitat paint and stone/wall/bead placement; `isStoneEdge` exists but `canOccupy` = `habitatCompatible`; the host/parasite/infection columns exist. | P-04: "not implemented" and "already built" |
| P-05 | 25 | MINOR | "`FILM_DIGESTION_IMPLEMENTED` is exactly such a constant. It is used in `snapshot.ts`." | Its only use is the display flag `digestsFilm` (`snapshot.ts:272`, already ANDed with the film field); the simulation filters 'film' out of every food list (`species.ts:82`). A display-truth risk, not a rule leak. | P-05 |
| P-06 | 39 | MINOR | "W1 foundation (schema 3: links, …)" | Schema 3 is P2.8's (D-0031); the bump is 3 → 4. | P-06 |
| P-07 | 67 | MINOR | "Verifiers use builder port + 5, so every port stays within 4201–4299 and no two waves overlap." | True within the plan, but g2-close used 4191, 4195–4197, 4201, 4211 and 4221 (the W1 foundation's and W2 film-fungi's ports), and Playwright reuses an existing server silently. | P-07: reuse warning and kill loop |
| P-08 | 76 (MISSED, after the `suitability.ts` row) | MAJOR | No row for `src/sim/grid.ts` or the renderer's brush preview | The Life-brush preview copies `canOccupy` (`grid.ts` `lifeCellOutcome`, `renderer.ts` `setBrushPreview`), tied cell by cell by `lab-commands.test.ts:949–974`. W1 changes `canOccupy` without these files, so at W2 the test fails and the preview marks water 'ok' for B02. Same for W3 object cells and 'place'. | P-08: add a row; extend two SHARED lists |
| P-09 | 77 | MAJOR | Row "`src/sim/structures.ts` (stage 8)": stage8 in W1, mod-builders in W4; the W4 prompt says "You own: src/sim/structures.ts" | The file is stage 8 (lines 1–94) plus the P2.7 Lab habitat edits (96–387) that `commands.ts`, the Lab UI and the renderer depend on. Only the W1 prompt protects the Lab part. The W3 object-cell refusal belongs in `applyHabitatEdit`, not `commands.ts`. | P-09: split into two rows |
| P-10 | 78 | MAJOR | Row "`src/sim/movement.ts`": organisms in W2, mod-anchor-light in W4 | W3 e1-producers must "generalize the producer term" there (the §2 row 101 calls it a rewrite of B06 movement code) while `movement.ts` is only SHARED-additive for it; W1 environment also edits `canOccupy` there. | P-10 |
| P-11 | 95 | MAJOR | "Any `content/` edit … contentHash → stateHash … never pin stateHash literals" (no other pinned values listed) | Tests pin values Phase 3 moves without a biology change: the wave-A goldens, `modules.test.ts:48`, `host.test.ts:30`, `experiments.spec.ts:47` (G4). W1 chemistry adds no catalog keys (the inhibitor fields have material 'none'). | P-11: add a row |
| P-12 | 96 | BLOCKER | "W1 foundation: schema 3 \| new zero columns and stores enter stateHash \| no \| g2-replay, trajectory fence" | Schema 3 is taken, and `COLUMNS_ADDED_IN[3]` never migrates g2's schema-3 saves. Migration zero-fills link slots that need −1. New columns change every loaded old save's stateHash (breaking `history-debris.test.ts:168/:176` and g2-replay). | P-12: Option A or Option B (G2) |
| P-13 | 99 | MINOR | "species indices shift; film/fungi/virus/object fields allocated" | Only `film` (film, filmN) and `viruses` (v01, v02) allocate fields. | P-13 |
| P-14 | 100 | MINOR | "W2: `FILM_DIGESTION_IMPLEMENTED` → world gate" | The W1 foundation prompt does it (lines 188, 197); display flag only. | P-14 |
| P-15 | 100 (MISSED, new row) | MAJOR | "no (film pool is 0)"; risk 8: "The biology stays identical through W3" | If film joins `sp.foods` (W2: "one more food"), B04's n changes, and with it every B04 preference mutation in film-enabled worlds (G9). | P-15: add a row; change the W2 PROPOSED DECISION |
| P-16 | 102 | MINOR | "B01, B04, B06, A01, P01 gain eligible modules, so `mut.module` picks change \| yes \| …" | Also shifts module indices (lineage `mutModule`, `propModule0/1`) and Diverse `founder.module` picks; many tests pinned to the g2 registry break. | P-16 |
| P-17 | 110 | BLOCKER | "Throw if any other allocated field is non-zero … (assert they are empty)" | A throwing digest cannot register Phase 3 recipes (`fence-update --add` for ONE_HOST_V1, FUNGAL_SUPPLY_LINE_V1, L306) nor describe FIRST_DISH_V1 after the W4 flip; `--add`, the "every recipe has an entry" check and check (b) would throw. | P-17: step 2 with 'g2' and 'full' modes |
| P-18 | 111 | MAJOR | "Alive entities in slot order: species ID string, birthId, … dryTimer, and genomeKey. Lineage arrays …; counters; …" | Covers 19 of the 67 g2 columns; omits jacketMineral (a ledgered pool), flags, movement, attack and birth-proposal state; module indices are not mapped to IDs; "counters" would include `nextEventId`, which only observation events move. | P-18 |
| P-19 | 115 | MINOR | "Loads the raw packs, patches the manifest lists and `buildPhase`, and re-validates." | The manifest also has `enabledStructures`, `developmentalEnabled` and version fields; `validateContent(raw)` has one parameter; `loadRegistryFs()` is cached; patch helpers exist. | P-19 |
| P-20 | 121 | MAJOR | "STARCH_UNLOCK_V1 (E01 carriers) at t 900; RESERVE_COMPARE_V1 (E05) at t 600, if present at g2" | STARCH_UNLOCK_V1 has 12 native B06, and no g2 content seeds E01, so the W1 stage8 "E01 bit-identical" guard would be vacuous. RESERVE_COMPARE_V1 exists. No save exercises P01 predation and meals or the P2.7 Lab edits. | P-20: new save list |
| P-21 | 126 | BLOCKER | "`loadSaveFile` → stateHash equals `hashAtLoad`; run 1,000 ticks → hash and digest equal the expected values" | If schema-4 columns enter stateHash (line 96), these literals fail permanently while W1's done-when requires g2-replay to "pass unchanged"; it also contradicts PRE's "never hard-code stateHash literals". | P-21 (Option B); Option A keeps line 126 |
| P-22 | 128 | MAJOR | "Covers every g2 recipe and the R-G1…R-G3 variants … (≥ 1,200 for FIRST_DISH_V1; whole test under 60 s)" | From tick 0 the fence never exercises P01 predation (W2 rewrites it), the E01 path (W1 stage8) or shade (W1 environment); adding them breaks the 60 s budget. | P-22 |
| P-23 | 134 | MINOR | "`--recipe <id>\|--all --reason D-00xx` refuses to run without a reason and never touches `g2Digest`." | Nothing could ever re-record `g2Digest` or the saves' `expected.json`, although risk 9 allows a decided break (D-0023 did one in Phase 2). `simulationVersion` is pinned to 3. | P-23: add `--g2 --reason` |
| P-24 | 144 | MINOR | "read every title; D-0006, D-0007, D-0008 were written for Phase 3" | PRE omits the wave B/C rulings builders collide with (D-0024, D-0028 … D-0032). | P-24 |
| P-25 | 146 | MAJOR | "Gate every new rule on the WORLD's own recorded manifest (`src/sim/gates.ts` …)" | `gates.ts` does not exist; the W1 foundation creates it while the three other W1 builders must already use it. Equivalent gates exist. | P-25: the lead commits `gates.ts` in the Preflight |
| P-26 | 148 | MAJOR | "never change version fields unless your assignment says so … An enabled species needs its atlas frames." | All twelve W1 environment materials are phase 3; until buildPhase 3 lands, `buildRegistry` throws for all four W1 builders and `content-validate --write` refuses. Enabled modules also need feature marks. | P-26 (G3 Option P) |
| P-27 | 156 | MINOR | "Scratch scripts go in /tmp." | Since wave C verifiers use the git-ignored `tmp/verify-…/` in the repo, where tsx resolves the repo's aliases. | P-27 |
| P-28 | 169 | MINOR | "VERDICT and `pipeline(...)` stay exactly as in `g2-wave-b.workflow.js.txt`." | VERDICT is unchanged, but the later templates replaced wave B's pipeline (lenses, ≤ 2 fix rounds, a re-verifier, report files). | P-28 |

### Preflight replacement text

#### P-01 · line 3 · MINOR · status
- Evidence: `git log -1` → 3ebfdf5; `git tag -l` → g0, g1; `docs/WORKLOG.md:38–47` (P2.1–P2.8 ticked, P2.9 and G2 open); `git ls-tree HEAD` for every path; `structures.ts:96` (Lab header), `:117` LabStroke, `:141` HABITAT_EDIT_KINDS, `:278` applyHabitatEdit; `renderer.ts:930–972` setBrushPreview.
- Replace the paragraph at line 3 with:
```text
I re-checked the plan against the committed tree at HEAD `3ebfdf5` (the working tree holds g2-close's uncommitted edits). P2.1–P2.8 are committed (waves B/C: d085a65…f0a45de; decisions through D-0032). `g2-close` (P2.9, D-0033) and the G2 gate come first; tag `g2` is not set yet. The Phase 2 paths the prompts use are:
- Lab: `src/ui/views/{LabView,LabToolbar}.tsx`, `src/ui/panels/{LabTray,LabTrayContent,LabTrayIcons,LabTrayNames}.tsx`, `src/ui/strings/lab.ts` (tray allowlists `FOOD_MATERIALS`/`CHEMISTRY_MATERIALS`, per-material copy `MATERIAL_COPY`).
- Overlays: `src/ui/panels/{OverlayPicker,OverlayLegend}.tsx`.
- New Dish: `src/ui/views/NewDish.tsx` (`RECIPE_ID` fixed to FIRST_DISH_V1, no habitat picker), `src/ui/panels/AdvancedEvolution.tsx`, `src/ui/strings/modes.ts`.
- Journal: `src/ui/journal.ts`, plus `history.journal` in `src/sim/history.ts`.
- Notebook: `src/ui/views/{Notebook,NotebookJournal}.tsx`.
- Atlas feature marks: `art/src/layers/modules.ts`, `src/render/features.ts`, `tools/content-validate.ts` (`FEATURE_FRAMES`, `featureFrameKey` → `feature/<layer>/<heading>/<frame>`).
- Lab habitat edits and placement: `src/sim/structures.ts` lines 96–387 (`applyHabitatEdit`, `unavailableHabitatEdit`, `shadeFactor`, `structureEnabled`, `paintMaterial`, `occupiedCells`; payload kinds paintSubstrate/paintShade/placeStructure/eraseStructure) and `src/sim/grid.ts` (`isStoneEdge`, `PLACEABLE_STRUCTURES`, `STRUCTURE_RECORD_IDS`, `PAINT_TARGETS`, `brushCellOutcome`, `lifeCellOutcome`, `planSealing`).
- Lab brush preview: `src/render/renderer.ts` `setBrushPreview` (~930–972).
In §4, replace every 'verify; find with git grep' hedge with these paths.
```

#### P-02 · line 12 · MINOR · path
- Evidence: `LabTray.tsx:113–118` (`const allowed = category === 'food' ? FOOD_MATERIALS : CHEMISTRY_MATERIALS; return info.materials.filter((m) => allowed.includes(m.id))`), `:170` (`MATERIAL_COPY[mid] ?? FALLBACK_MATERIAL_COPY`); `lab.ts:33–34`, `:128`, `:163`; `LabToolbar.tsx:90` (`MATERIAL_COPY[mid]?.unit ?? ''`).
- Replace line 12 with:
```text
  - Phase 3 is therefore mostly three steps: implement the sim rule, add it to `src/sim/content/implemented.ts` (`IMPLEMENTED_NATIVE_ABILITIES` / `IMPLEMENTED_MODULES`), and insert the ID into `content/manifest.json`.
  - A material also needs:
    - its ID in `FOOD_MATERIALS` or `CHEMISTRY_MATERIALS` (`src/ui/strings/lab.ts`), because the Lab offers only enabled materials that are on those lists;
    - a `MATERIAL_COPY` entry, or the tray shows the generic fallback text with no dose unit.
```

#### P-03 · line 13 · MINOR · symbol
- Evidence: `registry.ts:327–376` (phase, `IMPLEMENTED_*`, `missingModuleParams`, `PAINT_TARGETS`, `STRUCTURE_RECORD_IDS`), `:381–406` (shipped recipes/variants), `experiments.ts:213` (shipped cards); `content-validate.ts:84` FEATURE_FRAMES, `:96` featureFrameKey, `:101` enabledMarks, `:216–242` marks check; `atlas.test.ts:49–52`, `:133–139`; `public/atlas/manifest.json` features = starch_notch, reserve_pocket, resting_seam.
- Replace line 13 with:
```text
  - `validateContent` (`src/sim/content/registry.ts`) refuses:
    - an enabled species whose native ability is not in `IMPLEMENTED_NATIVE_ABILITIES`;
    - an enabled module not in `IMPLEMENTED_MODULES`, or one missing its `MODULE_REQUIRED_PARAMS` (`src/sim/content/moduleRules.ts`);
    - an enabled species, module, material or structure with `phase > buildPhase` (currently 2);
    - a paint outside `PAINT_TARGETS` or a structure outside `STRUCTURE_RECORD_IDS`;
    - a shipped recipe, card or variant that uses content the manifest does not enable.
  - `checkAtlas` (`tools/content-validate.ts`) runs in `npm run content:validate`, in `npm run art:build`, and in `tests/content/atlas.test.ts` (part of `npm run check`). It also refuses:
    - an enabled species without its frames;
    - an enabled module without its 16×16, 4-heading feature-mark frames in the atlas `features` table, keyed `feature/<layer>/<heading>/<frame>` (D-0032). Before the W4 flip that means anchor_foot, shade_patch, light_trail, debris_granule, protein_notches, matrix_edge and adhesion_link.
```

#### P-04 · line 21 · MINOR · status
- Evidence: `implemented.ts:11` IMPLEMENTED_MODULES = ['E01','E03','E05']; `content/modules/E11.json` phase 5; `structures.ts:16` import and `:82` call of dormancyStep; `structures.ts:141–146` HABITAT_EDIT_KINDS; `:245` shadeFactor; `SHADE.json` doses [0.1, 0.1, 0.1]; `grid.ts:140` isStoneEdge; `movement.ts:44–45` canOccupy → habitatCompatible; `entities.ts:50–55` hostSlot … infectedBy; `serialize.ts:144` COLUMNS_ADDED_IN = {2: ['dryTimer']}.
- Replace line 21 with:
```text
- **Not implemented:**
  - host drain and lysis/infection (their entity columns already exist);
  - biofilm deposition, and film as a food;
  - branching placement, fungal links and transport;
  - P04 crossing;
  - the attachment-surface rule (D-0006: `grid.ts` `isStoneEdge` exists, but `canOccupy` = `habitatCompatible`);
  - food objects; sample, transfer and clean water;
  - stage 8 beyond dormancy and starch secretion;
  - modules E04, E06–E10 and E12 (E01, E03 and E05 are implemented; E11 is Phase 5).
- **Already built by P2.7:** Erase structure, shade paint (× the SHADE record's 0.1; erase restores 1.0), habitat paint, and stone/wall/bead placement (`src/sim/structures.ts` `applyHabitatEdit`).
```

#### P-05 · line 25 · MINOR · status
- Evidence: `git grep FILM_DIGESTION_IMPLEMENTED HEAD` → `implemented.ts:14`, `snapshot.ts:16` (import) and `:272` (`sp.def.digestsFilm && world.fields.film !== undefined && FILM_DIGESTION_IMPLEMENTED`); `species.ts:82` `foods: def.foodPriority.filter((f) => f !== 'film')`.
- Replace line 25 with:
```text
  - `FILM_DIGESTION_IMPLEMENTED` (`implemented.ts:14`) is such a constant.
    - Its only use is the display flag `digestsFilm` in `src/worker/snapshot.ts:272`, which is already ANDed with `world.fields.film !== undefined`.
    - The simulation filters 'film' out of every food list (`src/sim/species.ts:82`).
```

#### P-06 · line 39 · MINOR · version
- Evidence: `world.ts:24–29` (`3 = P2.8 adds history records`; `export const SCHEMA_VERSION = 3;`); `serialize.ts:168` (`if (v === 3) … historyForSchema3`).
- Replace line 39 with:
```text
W1 foundation (world schema 3 → 4: links, anchor/film/E12/P04 columns; food-object + sample stores; system-requirement validation; world gates only if gates.ts is not committed in the Preflight, see line 146)
```

#### P-07 · line 67 · MINOR · port
- Evidence: `docs/agent/g2-close.workflow.js.txt`: port 4191; `portNote(t, lens.key === 'player' ? 20 : 10)`; REVERIFY `portNote(t, 30)`; REVIEW_PORT 4195, `Port ${REVIEW_PORT + 1}`, 4197; `playwright.config.ts:24` `reuseExistingServer: true`; `RESUME.md:20` kill list 4173 4191 4195 4196 4197 4201 4211 4221.
- Replace line 67 with:
```text
- Verifiers use builder port + 5, so every port stays within 4201–4299 and no two waves overlap.
- Playwright reuses an existing server (`reuseExistingServer: true`). g2-close used 4191, 4195, 4196, 4197, 4201, 4211 and 4221, which include the W1 foundation (4211) and W2 film-fungi (4221) ports.
- Before the Preflight and before each wave, stop every listener: `for p in $(seq 4173 4299); do lsof -t -i :$p | xargs -r kill; done`.
```

#### P-08 · line 76 (MISSED) · MAJOR · ownership
- Evidence: `grid.ts:326–343` LifeBrush/lifeCellOutcome ("exactly the inoculate command's cell filter (canOccupy → habitatCompatible)"); `grid.ts:255` brushCellOutcome; `renderer.ts:930–972` setBrushPreview; `lab-commands.test.ts:949–974`; D-0006 (`DECISIONS.md:60–65`); canOccupy callers `births.ts:105`, `commands.ts:262`, `recipes.ts:273`, `specimens.ts:162`; plan lines 213 and 466.
- Insert after the `src/sim/suitability.ts` row (line 76):
```text
Add a row after it:
| `src/sim/grid.ts` (`LifeBrush`/`lifeCellOutcome`, `brushCellOutcome`) + `src/render/renderer.ts` `setBrushPreview` + tests/sim/lab-commands.test.ts:949–974 | environment (SHARED, additive: the preview mirrors the new canOccupy, including listed surfaces and stone edges) | – | food-objects (SHARED, additive: object cells refused for 'place' in the sim and the preview) | – |
Add the same files to the environment and food-objects SHARED lists.
```
- Note: W2 organisms also edits `grid.ts` (V01 viral preview, W2-14); add "organisms (SHARED, additive: viral LifeBrush)" to the W2 column.

#### P-09 · line 77 · MAJOR · ownership
- Evidence: `git show HEAD:src/sim/structures.ts`: `:73` stageStructures, `:96` Lab header, `:117` LabStroke, `:200` occupiedCells, `:212` invalidHabitatEdit (stroke bound `:227`), `:278` applyHabitatEdit, `:287` brushCellOutcome call; `commands.ts:23` imports applyHabitatEdit, LAB_MAX_POINTS, LAB_MAX_STROKE_SAMPLES; `commands.ts:122–127` placeStructure → applyHabitatEdit; `grid.ts:255`; plan lines 236, 437, 466, 570.
- Replace row 77 with:
```text
| `src/sim/structures.ts`, stage-8 part (`substrateNear`, `secrete`, `stageStructures`; lines 1–94) | stage8 | – | – (f02-links: one-line hook) | mod-builders |
| `src/sim/structures.ts`, Lab habitat-edit part (P2.7: `applyHabitatEdit`, `unavailableHabitatEdit`, `shadeFactor`, `structureEnabled`, `occupiedCells`, `moveContents`; lines 96–387) | – | – | food-objects (SHARED, additive: skip object cells in `applyHabitatEdit`, next to `occupiedCells`) | – |
- In the stage8 and mod-builders prompts, write: 'You own the stage-8 part of src/sim/structures.ts; the Lab habitat-edit part is SHARED.'
- In the food-objects prompt, move the refusal of structure placement onto an object cell from commands.ts to `applyHabitatEdit`, after `invalidHabitatEdit`.
```

#### P-10 · line 78 · MAJOR · ownership
- Evidence: plan line 411 (e1-producers SHARED list); §2 row 101 "B06 movement code rewritten"; `movement.ts:150–155` (`if (prof.starch !== null && energy > prof.starch.minEnergy && world.fields.starch) { const s = 0.5 * avail(...)`); plan line 213 "src/sim/movement.ts (canOccupy only)".
- Replace row 78 with:
```text
| `src/sim/movement.ts` | – (environment: `canOccupy` only) | organisms | e1-producers (producer term generalized; B06 bit-identical) | mod-anchor-light |
(and move `src/sim/movement.ts (producer term)` from e1-producers' SHARED list to its 'You own' list)
```

#### P-11 · line 95 · MAJOR · other
- Evidence: golden `.cards.*.stamp.contentVersion` 1 (×6); EXP_101 arm A keys alive.A01 … extinctAt.P01, field.broth … field.sugarN; golden comparisons.feed.a.species [{id:'A01',idx:0}, …]; `pairedRun.ts:644–656` catalogIds; `golden.ts:77–81`, `:88–91` (extra keys fail); `tests/experiments/helpers.ts:11–14` registry() = loadRegistryFs(); `experiments.ts:869` stamp contentVersion from the manifest, `:885–887` shipped cards = phase ≤ buildPhase; `modules.test.ts:48`; `host.test.ts:30`; `experiments.spec.ts:46–47`.
- Insert after row 95:
```text
Add a row after it:
| W1 `contentVersion` bump; W2/W3 species and the film/viruses systems; newly shipped cards; W4 flip | Pinned tests: (1) `tests/experiments/golden/wave-a-measurements.json` (stamp.contentVersion 1, per-species and per-field catalog keys, comparison species lists) through `expectWaveANumbers` (tests/experiments/{cleaning-crew,exp-a-starch,exp-b-grazer,food-trail,light-and-life,predator-balance}.test.ts) and `expectWaveAComparison` (tests/sim/comparison.test.ts:406–420); (2) tests/sim/modules.test.ts:48 (buildPhase); (3) tests/worker/host.test.ts:30 (speciesIds); (4) tests/e2e/experiments.spec.ts:47 (7 cards) | no (until W4) | Preflight step 3b: those six card tests and comparison.test.ts:406–420 realize everything under `registryWith(G2_LISTS)`, one registry per test (`expectReplayIdentical` re-realizes arms and compares stateHash), so they stay a permanent g2 check. The lead updates modules.test.ts:48 with the buildPhase bump. The builder whose edit moves host.test.ts:30 or experiments.spec.ts:47 updates it. |
```
- Note: "step 3b" is W2-02's Preflight item 10 (f); `G2_LISTS` must keep contentVersion 1 (G4). If the Preflight adopts item 10 (a), `host.test.ts:30` becomes relational once and drops out of the last cell.

#### P-12 · line 96 · BLOCKER · version
- Evidence: `world.ts:29` SCHEMA_VERSION = 3; `serialize.ts:158` (`for (let v = state.schemaVersion + 1; v <= SCHEMA_VERSION; v++)`), `:164` (`encodeArray(new Ctor(highWater))`, zeros), `:168` v === 3 history step, `:237–241` stateHash column loop; `saveFile.ts:256` migrate, then `:314` checkArray per column; `entities.ts:113–115` NEG_ONE_DEFAULT; `history-debris.test.ts:168` `'baa42a29186c6c46'`, `:176` `'5ce059e49121f688'`.
- Option B (digest-only; the Preflight checker's text). Replace row 96 with:
```text
| W1 foundation: world schema 3 → 4 | `SCHEMA_VERSION` 4, `COLUMNS_ADDED_IN[4]`, a `v === 4` step in `migrateWorldState` that adds the empty stores, and a −1 fill for new NEG_ONE_DEFAULT columns (today's migration only zero-fills). New columns and stores enter stateHash, so every stateHash changes, including loaded old saves | no | g2-replay and the fence compare trajectory digests, never stateHash literals. The foundation also owns and updates tests/sim/history-debris.test.ts (schema at :97/:110/:142/:183; the stateHash literals at :168/:176 become digest checks, or are re-recorded under the foundation's DECISIONS id) and tests/persistence/migration.test.ts:35 (3 → 4, 2 → 4 and 1 → 4 through loadSaveFile) |
```
- Option A (hash-neutral; merged from the text above, W1-06 and the W1 checker's "hash-neutral while empty"). Replace row 96 with:
```text
| W1 foundation: world schema 3 → 4 | `SCHEMA_VERSION` 4, `COLUMNS_ADDED_IN[4]`, a `v === 4` step in `migrateWorldState` that adds the empty stores, and a −1 fill for new NEG_ONE_DEFAULT columns (today's migration only zero-fills). New columns and stores are hash-neutral while empty: stateHash hashes a post-g2 column only when some slot differs from its empty value, a store only when non-empty and a new counter only when non-default, so a loaded g2 save hashes exactly as the g2 build hashed it | no | g2-replay (`hashAtLoad`, `hashPlus1000`, `digestPlus1000`) and the fence. The foundation also owns and updates tests/sim/history-debris.test.ts (schema at :97/:110/:142/:183; the stateHash literals at :168/:176 keep passing unchanged) and tests/persistence/migration.test.ts:35 (3 → 4, 2 → 4 and 1 → 4 through loadSaveFile) |
```

#### P-13 · line 99 · MINOR · status
- Evidence: `fields.ts:102–103` film/filmN system 'film'; `:116–117` v01/v02 system 'viruses'; no FIELD_DEFS entry has system 'fungi', 'parasites' or 'foodObjects'; `allocateFields` `fields.ts:140–144`.
- Replace row 99 with:
```text
| W2/W3: species and systems enabled | species indices shift; `film` (film, filmN) and `viruses` (v01, v02) fields are allocated (`fungi`, `parasites` and `foodObjects` allocate none) | no (RNG keys never use a species index; the digest maps index→ID) | fence |
```

#### P-14 · line 100 · MINOR · status
- Evidence: plan line 197 ("(4) World gates … Replace FILM_DIGESTION_IMPLEMENTED … with worldHasSystem(world,'film')", in the W1 foundation task); plan line 188 (snapshot.ts SHARED); `snapshot.ts:272`.
- Replace row 100 with:
```text
| W1 foundation: `FILM_DIGESTION_IMPLEMENTED` → `worldHasSystem(world,'film')` (snapshot display flag only) | B04 `digestsFilm` is already true | no (display only; the film pool is 0) | g2-replay (old saves have no film system) |
```

#### P-15 · line 100 (MISSED, new row) · MAJOR · other
- Evidence: `mutation.ts:37–39` (preference 0.02 / 0.04), `:129–139`; `species.ts:82`; `content/species/B04.json` foodPriority [detritus, protein, starch, oil], digestsFilm true; CT §3.5 "B04, F01 (as detritus)"; SPEC §6 film paragraph "edible as detritus by B04, F01"; plan W2 film-fungi "in the weighted policy it is one more food under the ordinary rules".
- Insert after row 100 (see G9):
```text
Add a row:
| W2 film-fungi: film becomes food for digestsFilm species | if film joins `sp.foods`, n changes for B04, so `mut.pref` picks and initial weights change | **must be no** | Implement film 'as detritus' (CT §3.5): B04 and F01 take film inside the detritus preference slot, so `sp.foods`, n and the weight vector stay unchanged. If the owner rules that film is a separate food, treat it as a forced change like the W4 flip (DECISIONS entry + `fence-update --reason`). Fence (b) under the shipped manifest, plus a test in which a B04 preference mutation gives the same draw with and without the film system. |
Change the W2 film-fungi PROPOSED DECISION to match.
```

#### P-16 · line 102 · MINOR · other
- Evidence: `mutation.ts:159` (`module = world.content.modules.findIndex((m) => m.id === id)`); `births.ts:152–153`, `:298`; `recipes.ts:40` (`modules: m.enabledModules.map(...)`); `founders.ts:68–69`; the test lines below (re-checked at HEAD).
- Replace row 102 with (test list merged with W4-20's):
```text
| **W4 module flip (lead)** | B01 (E04, E10, E12), B04 (E04, E09, E10, E12), B06 (E04, E10, E12), A01 (E06, E07) and P01 (E08) gain eligible modules, so `mut.module` picks (and Diverse `founder.module` picks) change; module indices in lineage `mutModule` and in `propModule0/1` shift | **yes, forced by rules** | moduleRegistryVersion 1→2 + DECISIONS entry. The lead updates the tests pinned to the g2 registry:
- tests/fixtures/module-accounting.test.ts:128–130;
- tests/sim/founders.test.ts:188–192;
- tests/sim/modules.test.ts:47, 51, 56–57, 62, 98–99, 117, 119, 122;
- tests/fixtures/registry-imports.test.ts:196, 226, 228–231, 244–248, 265–269;
- tests/sim/founders-newdish.test.ts:90–95, 145–149;
- tests/content/atlas.test.ts:134–138, 142, 197;
- tests/e2e/new-dish.spec.ts:93, 134.
Proof: under registryWith(pre-flip modules) the digest is unchanged, and under g2 lists it equals g2 |
```

#### P-17 · line 110 · BLOCKER · other
- Evidence: plan lines 131 ("every recipe in content/recipes has an entry"), 133, 146 ("you may run … --add <recipe>"), 646 (ONE_HOST_V1, FUNGAL_SUPPLY_LINE_V1), 661 (L306 "E10 on 20"); `fields.ts:102–103`, `:116–117`. W4-23 hits the same wall at the flip.
- Replace step 2 (lines 108–113) with:
```text
2. **`tests/helpers/trajectory.ts`: `trajectoryDigest(world, mode: 'g2' | 'full')`.**
   - Hash with `StateHasher` (src/sim/hash.ts: `.number/.string/.typed/.hex`):
     - seed and tick;
     - `canonicalJson(settings)`;
     - the grid arrays substrate/structure/lightBase/shade;
     - every field in `G2_FIELD_IDS` (the 24 core + enzymes fields a g2 world allocates).
   - 'g2' mode, used by g2-replay and fence check (a), throws if anything post-g2 holds a non-default value:
     - any allocated field outside `G2_FIELD_IDS`;
     - any column added after g2 (default 0, or −1 for NEG_ONE_DEFAULT);
     - any post-g2 store.
   - 'full' mode, used by fence check (b) and `fence-update --add`, also hashes each non-g2 field (by id), post-g2 column (by name) and post-g2 store (`canonicalJson`, with slot/species/module references mapped to birthId/ID).
     - It hashes these only when they hold a non-default value, so allocating a zero field or appending a default column never moves a digest.
   - Exclude contentHash, contentVersion, history and events.
```
- Note: P-18's entity list is the rest of this step.

#### P-18 · line 111 · MAJOR · symbol
- Evidence: `entities.ts:16–94` (67 columns, alive … dryTimer); `ledger.ts:131` (`mineral += cols.boundMineral[i]! + cols.jacketMineral[i]!`); `mutation.ts:159` (module index); `births.ts:152–153`; `serialize.ts:250–251` (stateHash hashes only nextEntityId/nextBirthId); `world.ts:81–83` counters.
- Replace lines 111–112 with:
```text
   - Alive entities, in ascending slot order, each with:
     - its slot index;
     - every column of `G2_ENTITY_COLUMNS` (the 67 `ENTITY_COLUMNS` names at g2, `alive` … `dryTimer`, frozen in the helper).
   - Map index-valued columns to IDs:
     - `species` → species ID;
     - `genome`, `refGenome`, `propG0`, `propG1` → `genomeKey` ('-' for −1);
     - `propModule0`, `propModule1` → module ID via `world.content.modules` ('-' for −1).
   - Lineage: `base` and its 13 arrays, with `species` → ID, `genome` → genomeKey and `mutModule` → module ID.
   - Counters `nextEntityId` and `nextBirthId` (not `nextEventId`).
   - Ledger `initial`/`inputs`/`exports`/`roundoff` (c, n, m) and `exchangeC`.
   - Pending commands, hashed as stateHash does, and `commands.nextSeq`.
   - Branch count plus root birthIds.
```

#### P-19 · line 115 · MINOR · symbol
- Evidence: `schema.ts:355–375` ManifestSchema (simulationVersion `z.literal(3)`, enabledStructures optional, developmentalEnabled); `registry.ts:186` `export function validateContent(raw: RawPacks)`; `tools/lib/content-fs.ts:30–50` loadRawPacksFs / loadRegistryFs (`cached ??=`); `tests/recipes/helpers.ts:82` cloneRaw, `:89` mutateRaw, `:99` addRaw.
- Replace lines 115–116 with:
```text
   - Load the raw packs with `loadRawPacksFs()` (tools/lib/content-fs.ts). If you cache them, deep-copy before patching (e.g. `mutateRaw` from tests/recipes/helpers.ts). Never mutate the cached `loadRegistryFs()`.
   - Patch every manifest list: `enabledSpecies`, `enabledModules`, `enabledSystems`, `enabledMaterials`, `enabledHabitats`, `enabledStructures`.
   - Also patch `developmentalEnabled`, `buildPhase` and the version fields `contentVersion`, `moduleRegistryVersion`, `evolutionRulesVersion`, `phenotypeMappingVersion`. `simulationVersion` stays the literal 3.
   - Re-validate. `validateContent(raw)` takes one parameter today: add `opts?: { allowUnimplemented?: boolean }`, whose default keeps current behaviour.
```

#### P-20 · line 121 · MAJOR · status
- Evidence: `content/recipes/STARCH_UNLOCK_V1.json` founders [{species: 'B06', count: 12}], mutationPreset fixed, patches sugar 0.1 + starch 0.6; `RESERVE_COMPARE_V1.json` [{B01, 24, ['E05'], 'alternate-odd'}], 5 scheduled; `git grep E01 HEAD -- content/recipes content/experiments content/variants` → none; EXP_106 change inoculates P01 ×5 at 0 s; EXP_B inoculates P01 ×2 at 120 s; `E01.json` nativeEquivalents ['B06', 'F02'].
- Replace the save list (lines 119–125) with:
```text
   - `g2-manifest.json` (every manifest field at g2);
   - FIRST_DISH_V1 at t 3000;
   - STARCH_UNLOCK_V1 (12 native B06, Fixed Traits) at t 900;
   - STARCH_UNLOCK_V1 with 12 B01 carrying E01 at t 900 (B06 cannot carry E01; no g2 content seeds E01): `transform: (r) => ({ ...r, founders: r.founders.map((f) => ({ ...f, species: 'B01', modules: ['E01'] })) })`;
   - RESERVE_COMPARE_V1 (24 B01, E05 on odd founders, 5 scheduled meals) at t 600;
   - FIRST_DISH_V1 transformed to `mutationPreset: 'accelerated', founderMode: 'varied'` at t 6000;
   - EXP_106 arm B (`realizeExperimentArms(registry, 'EXP_106').B`: PREDATOR_BALANCE_V1 + 5 P01) at t 600, with P01 hunting and holding meals;
   - FIRST_DISH_V1 with Lab edits applied through `applyNow` (paintSubstrate gel, paintShade and its erase, placeStructure stone/wall/bead, eraseStructure) at t 1200;
   - a hand-built world with E03 carriers mid-Preparing, Resting and Waking (LIFE_PREPARING 1, LIFE_RESTING 2, LIFE_WAKING 3);
   - `expected.json` (see step 5).
   Write every save with a fixed `savedAt` and gzip it, like tests/persistence/fixtures/schema2-cleaning-crew-t1900.pixelmeba.gz. Write the saves and g2-manifest.json before the Preflight's manifest bump.
```

#### P-21 · line 126 · BLOCKER · other
- Evidence: `serialize.ts:237–241`; plan line 96 ("new zero columns and stores enter stateHash"); plan line 201 ("g2-replay and trajectory-fence pass unchanged"); plan line 146 (PRE: "Never hard-code stateHash literals"; g2 saves "continue bit-identically").
- Option B only. Under Option A keep line 126 and `expected.json = {hashAtLoad, hashPlus1000, digestPlus1000}` as written (the relational checks below may still be added). Replace step 5 with:
```text
5. **`tests/fixtures/g2-replay.test.ts`.** For each save:
   - `loadSaveFile` → `trajectoryDigest(world, 'g2')` equals `digestAtLoad`;
   - run 1,000 ticks → the digest equals `digestPlus1000`.
   - Check stateHash only relationally: two independent loads, each run 1,000 ticks, give equal stateHash, and `buildSaveFile` → `loadSaveFile` round-trips it. Never compare stateHash against a g2 literal, because the schema-4 columns and stores enter stateHash.
   - `expected.json` holds `{digestAtLoad, digestPlus1000}` per save; `hashAtLoad` is kept for information only.
   (In PRE, line 146, say that g2 saves 'continue with identical trajectory digests' instead of 'bit-identically'.)
```

#### P-22 · line 128 · MAJOR · other
- Evidence: `content/recipes/*.json` founders; EXP_106/EXP_B change = P01 inoculation; EXP_102 change {kind: 'shade', factor: 0.1}; `realizeExperimentArms(registry, id)` at `experiments.ts:510`; `realizeVariant(registry, id)` async at `variants.ts:488`.
- Replace line 128 with:
```text
   - Cover:
     - the seven g2 recipes: CLEANING_CREW_V1, FIRST_DISH_V1, FOOD_TRAIL_V1, LIGHT_AND_LIFE_V1, PREDATOR_BALANCE_V1, RESERVE_COMPARE_V1, STARCH_UNLOCK_V1;
     - the R-G1…R-G3 variants (`realizeVariant(registry, id)`);
     - arm B of EXP_106 and of EXP_B (`realizeExperimentArms(registry, id)`; the only g2 sources of P01 predation);
     - arm B of EXP_102 (the shade change);
     - the E01-carrier transform of STARCH_UNLOCK_V1.
   - Each entry records `{ticks, g2Digest, currentDigest, changedBy}`, with ticks ≥ 1,200 for FIRST_DISH_V1 and ≥ 600 after an arm's P01 arrive.
   - Keep each test file under about 60 s; split into two files if needed.
```

#### P-23 · line 134 · MINOR · other
- Evidence: plan line 851 (risk 9: "A builder that must break it needs a rules version bump plus a DECISIONS entry"); D-0023 "all endpoint hashes change at this commit"; SPEC §15 "Replays require identical rules/content/registry versions"; `schema.ts:356` `z.literal(3)`; `saveFile.ts:266`.
- Replace line 134 with:
```text
   - `--recipe <id>|--all --reason D-00xx` refuses to run without a reason and never touches `g2Digest`.
   - `--g2 --reason D-00xx` (lead only) is the one path that re-records `g2Digest` and `tests/fixtures/saves/expected.json`. The named decision must say which rules or content version it bumps (`simulationVersion` is pinned to 3).
```

#### P-24 · line 144 · MINOR · doc-ref
- Evidence: `git show HEAD:docs/DECISIONS.md` headings D-0024 … D-0032 (lines 204, 250, 260, 276, 291, 303).
- Replace the DECISIONS clause of PRE (line 144) with:
```text
docs/DECISIONS.md holds rulings. Read every title. Most relevant:
- D-0006, D-0007 and D-0008 were written for Phase 3.
- D-0024/D-0028 cover Lab edits, structures as content, the sealing planner and the SHADE factor.
- D-0029 covers migration provenance (`migratedFrom`).
- D-0030 covers founder modes, the registry label, and import refusal of unimplemented modules.
- D-0031 covers world schema 3 (history.traits/journal).
- D-0032 covers module marks in the atlas (`feature/<layer>/<heading>/<frame>`).
```

#### P-25 · line 146 · MAJOR · path
- Evidence: `git ls-tree -r --name-only HEAD src/sim` → no gates.ts; `structures.ts:237` paintMaterial, `:245` shadeFactor, `:252` structureEnabled; `world.ts:152` (`modules: buildModuleTable(...)`), `:154` (`fields: allocateFields(opts.content.manifest.enabledSystems)`); plan line 187 (the foundation owns gates.ts).
- Replace the gating sentence of PRE (line 146) with:
```text
Gate every new rule on the world's own recorded manifest, through `src/sim/gates.ts` (`worldHasSystem`/`worldHasSpecies`/`worldHasModule`).
- The lead commits gates.ts in the Preflight: three pure functions reading `world.content.manifest`.
- Existing equivalents: `world.fields[id] !== undefined`, `world.modules[id] !== undefined`, and structures.ts `structureEnabled`/`paintMaterial`.
- Otherwise gate on the presence of the organisms a rule concerns. Never gate on a build constant.
(Remove gates.ts from the foundation's task.)
```

#### P-26 · line 148 · MAJOR · version
- Evidence: `content/materials/{ACID,…,SALT}.json` phase 3; `content/manifest.json` buildPhase 2; `registry.ts:356` (`if (mat.phase > m.buildPhase) err(…)`); `registry.ts:445–448` buildRegistry throws; `tools/lib/content-fs.ts:47–48`; `content-validate.ts:311` writes the hash only with 0 errors; plan lines 188/199 (foundation) vs 213 (environment).
- G3 Option P. Replace the version-field sentence of line 148 with:
```text
… never change version fields unless your assignment says so.
- The lead sets `buildPhase` 3 and `contentVersion` 2 in the Preflight commit, so wave 1 can enable phase-3 content. This happens after writing tests/fixtures/saves/* at the g2 values, together with step 3b and tests/sim/modules.test.ts:48. Drop the buildPhase/contentVersion edit from the foundation task, lines 188 and 199.
- An enabled species needs its atlas frames, and an enabled module needs its feature-mark frames.
- Update any test that pins a shipped list your edit moves: tests/worker/host.test.ts:30 (speciesIds) when you enable a species, and tests/e2e/experiments.spec.ts:47 (7 cards) when you ship a card.
```
- Note: the same Preflight commit must also fix `tests/recipes/variants.test.ts:403` and `tests/sim/lab-commands.test.ts:903` ("(build phase 2)", W1-09). If it adopts W2-02 item 10, `host.test.ts:30` is already relational and drops out of the last bullet.

#### P-27 · line 156 · MINOR · path
- Evidence: `docs/agent/g2-close.workflow.js.txt` VERIFY "Scratch goes in tmp/verify-${t.key}-${lens.key}/ (git-ignored)"; g2-wave-c-resume allows "/tmp or tmp/verify-…"; `.gitignore` "tmp/".
- Replace "Scratch scripts go in /tmp." with:
```text
Scratch goes in tmp/verify-${t.key}/ (git-ignored).
```

#### P-28 · line 169 · MINOR · doc-ref
- Evidence: `g2-wave-b.workflow.js.txt:55` (port + 10), `:68` VERDICT, `:74` `pipeline(`; `g2-close.workflow.js.txt:48–54` (VERDICT, serious, blocking, portNote), `:97–113` runTask with ≤ 2 fix rounds; `g2-wave-c-resume.workflow.js.txt:119` serious.
- Replace line 169 with:
```text
VERDICT stays as in `g2-wave-b.workflow.js.txt`. For `pipeline(...)`, use the fix-round pattern of `docs/agent/g2-close.workflow.js.txt`: verify, ≤ 2 fix rounds, reports in `docs/reports/reviews/g3-wave-N/`. Keep one verifier per task at builder port + 5. A second lens or a re-verifier needs a port outside every running wave's decade.
```

---

## Wave 1 (lines 175–279): 4 BLOCKER, 9 MAJOR, 14 MINOR

| ID | Line | Sev | Plan says | Actually | Replace with |
|---|---|---|---|---|---|
| W1-01 | 177 | MINOR | meta.description "world foundation (schema 3, links, food-object and sample stores, world gates)" | Schema 3 is P2.8's (D-0031); the bump is 3 → 4. | W1-01 |
| W1-02 | 188 | MINOR | foundation SHARED "content/manifest.json (you alone this wave: buildPhase 2 → 3 and contentVersion +1; no ID changes)" | The environment builder also edits the manifest in W1; "you alone" can only mean the version fields, and the order of the edits matters. | W1-02 (G3 Option W) |
| W1-03 | 188 | MAJOR | "src/sim/maintenance.ts (one call in the death path: removeAllLinks)" | There are two death paths: `killEntity` and the predation capture in `contacts.ts`, which frees the prey without `killEntity`. An eaten linked organism would leave dangling links, and the planned import check would refuse the save. | W1-03 (G8) |
| W1-04 | 188 | MAJOR | "src/sim/births.ts (daughters start with empty link slots)" | The retained daughter keeps the parent's slot with a new birthId, so partner rows dangle; emptying its links would sever F01/F02 networks at every division (SPEC §7.7, §9.19). The new daughter's slot is already empty. | W1-04: `rekeyLinks` (G8) |
| W1-05 | 190 | BLOCKER | "(1) Schema 3 (current + 1 if Phase 2 already bumped; update the header comment)" | The bump is 3 → 4, and `tests/sim/history-debris.test.ts` (not the foundation's file) pins schema 3 at lines 97, 110, 142 and 183. | W1-05 |
| W1-06 | 192 | BLOCKER | "(2) World stores: serialized in canonical order, included in stateHash, empty by default so every Phase 2 world is unchanged" | stateHash hashes every column name and array, so new columns, stores and counters change every migrated g2 save's hash (g2-replay's hashAtLoad; `history-debris.test.ts:168/:176`). | W1-06 (G2 Option A) |
| W1-07 | 196 | BLOCKER | "(3) Migration: COLUMNS_ADDED_IN[3]; migrateWorldState fills new columns and stores by copy with explicit defaults." | `[3]` never runs for schema-3 g2 saves (`deserializeWorld` throws "entity column … missing"); the `v === 3` step is P2.8's history step; the loop zero-fills link slots that need −1. | W1-07 |
| W1-08 | 198 | MINOR | "(5) Registry: … BIOFILM → film; … module E10 → film." | Incomplete: E_STARCH secretion, E01, E09 and broth diets also need 'enzymes'; there is no material → system check yet; `digestsFilm` must not require film (B04 ships without it). | W1-08 |
| W1-09 | 199 | BLOCKER | "(6) Manifest: buildPhase 3, contentVersion 2, nothing else." | Right values, but the bump breaks `modules.test.ts:48`, `variants.test.ts:403`, `lab-commands.test.ts:903` and the golden stamps, none owned by the foundation, and the environment's materials need it first. | W1-09 (G3 Option W) |
| W1-10 | 201 | MAJOR | "the schema-2 g2 saves migrate by copy and continue bit-identically. Prove the fence is live by temporarily changing one constant in stage 7 …" | The g2 saves are schema 3. Editing a stage-7 constant is a non-additive edit to files three other builders are testing against at the same moment. | W1-10 |
| W1-11 | 202 | MAJOR | "migration.test.ts covers schema 2 → 3 and 1 → 3 through loadSaveFile …" | The paths are 3 → 4, 2 → 4 and 1 → 4; a real schema-2 fixture exists; `asSchema1` must also drop the new stores. | W1-11 |
| W1-12 | 212 (MISSED) | MAJOR | "src/sim/attachment.ts (new: per-cell attachable-surface mask cached by grid.geometryVersion)" | `geometryVersion` is a per-world counter (every freshly realized world has 1), and one worker holds several worlds, so a module-level cache would hand one world another world's mask: a determinism leak. | W1-12 |
| W1-13 | 213 | MAJOR | environment SHARED list (manifest incl. "Phase 2 paints if still missing", movement, commands, recipes, worker, "Lab*.tsx / Tray*.tsx", NewDish, styles) | Phase-3 materials need buildPhase 3 first; GEL/SEDIMENT/SHADE/WATER are already enabled; inoculate already uses `canOccupy`; the overlay ids are FieldIds; the Lab file names differ; `grid.ts`, `renderer.ts`, `recipes.ts`, `state.ts` and `lab-commands.test.ts` are missing. | W1-13: the full SHARED list |
| W1-14 | 215 | MINOR | "Verify that P2.7's shade paint multiplies light by 0.1 and erase restores 1.0; add it if missing." | Implemented and tested, as are substrate paint, gas exchange, the closed lid, pH and neutralization; "add it" would send the builder into `structures.ts`, which stage8 owns. | W1-14 |
| W1-15 | 218 | MINOR | "Content test: every enabled material whose only effect is its own field says 'No additional modeled reaction.' … exceptions (foods, enzymes) explicit" | Every Phase 2–5 material record already has the sentence, foods and enzymes included; only NUTRIENT, SUGAR and DEBRIS lack it, and they are not the builder's files. | W1-15 |
| W1-16 | 222 | MAJOR | "An attached species … may occupy, be inoculated into, be born into or be transferred to a cell only if the cell offers one of its listed surfaces." | `canOccupy` only returns `habitatCompatible`, which suitability and the Life-brush preview also use; a `canOccupy`-only rule breaks the parity test and leaves suitability blind (P3.2: "suitability responds to habitat"). | W1-16 (G7) |
| W1-17 | 224 | MAJOR | "New Dish Basics gets a habitat picker (Water Garden, Gel Colony, Sediment Edge) with a small preview from habitatGrid() …" | NewDish already has "Start with"; FIRST_DISH_V1's A01 founders cannot be placed on Gel Colony or Sediment Edge (RecipeError); `habitatId` must pass through five places; the recipe's `sugar: 0` override would erase Gel Colony's sugar. | W1-17 |
| W1-18 | 227 | MINOR | "acid 0.30 + base 0.20 → 0.10 / 0 after one tick"; "each inhibitor × 0.998 per tick exactly" | Stage 2 diffuses before it neutralizes, so a single dosed cell loses some to neighbours; and 0.3 − 0.2 = 0.09999999999999998. | W1-18 |
| W1-19 | 230 | MINOR | "New Dish → Sediment Edge → Lab → Chemistry → Salt …" | Sediment Edge can only be a habitat-only start (W1-17). | W1-19 |
| W1-20 | 236 | MINOR | "If P2.7 put structure-placement helpers into structures.ts, leave them untouched." | It did: lines 96–387 are the Lab edits that `commands.ts`, the Lab UI and the renderer import. | W1-20 (G6) |
| W1-21 | 247 (MISSED) | MINOR | "an action refused because an earlier one reserved the energy reports its reason code" | No such code exists; `reasons.ts` and its strings are append-only and in neither of stage8's lists. | W1-21 |
| W1-22 | 248 | MAJOR | "… each needing E > 35 and costing 0.04, on an organism with E = 35.05: the first fires, the second is refused" | 35.05 − 0.04 = 35.01 > 35, so the second action fires too; E = 35.03 works. | W1-22 |
| W1-23 | 255 | MINOR | "ARCH §10.1 (fungi: …; viruses: inspection glyph + density overlay only)" | The virus clause is in UX §6.2, not ARCH §10.1. | W1-23 |
| W1-24 | 259 | MINOR | "Non-motile B02, Y01, Y02 and X01 loop 'idle'." | X01 swims at 0.4 cells/s while free. | W1-24 |
| W1-25 | 261 | MINOR | "… plus a small thumbnail for Add Life" | `drawFrame` looks up `<asset>/move/e/0`, else `<asset>/idle/e/0`; a 'thumb' frame is never found, so F01, F02 and V01 would show blank thumbnails. | W1-25 |
| W1-26 | 268 | MINOR | "the alpha masks of loop frame 0 differ in ≥ 12 % of the union pixels …" | UX §6.3 gives B03/B07 and F01/F02 the same outline; fungi and V01 have no loop frame; the pairs include the Phase 1 art. | W1-26 |
| W1-27 | 270 | MINOR | "content:validate still passes with no species enabled." | Five species are enabled; the intent is "no Phase 3 species". | W1-27 |

### Wave 1 replacement text

#### W1-01 · line 177 · MINOR · version
- Evidence: `world.ts:29` `export const SCHEMA_VERSION = 3;` (header comment "3 = P2.8 adds history records"); D-0031.
```text
**`meta.description`:** "Phase 3 wave 1: world foundation (schema 4, links, food-object and sample stores, world gates), chemistry and habitats (P3.1, P3.2), stage 8 reservation framework (P3.7 core), organism art for the 14 Phase 3 species."
```

#### W1-02 · line 188 · MINOR · ownership
- Evidence: plan line 213 ("SHARED (additive): content/manifest.json (enabledSystems += chemistry; enabledMaterials += …; enabledHabitats += GEL_COLONY, SEDIMENT_EDGE)").
- G3 Option W only; under Option P drop the manifest item from the foundation's SHARED list. Replace the manifest item of line 188 with:
```text
content/manifest.json: this is the only version-field change this wave, buildPhase 2 → 3 and contentVersion 1 → 2, and you make it first. No ID changes. The environment builder inserts IDs in the same file after you.
```

#### W1-03 · line 188 · MAJOR · path
- Evidence: `git grep -n '\.free(' HEAD -- src/sim` → `contacts.ts:139` `world.ents.free(prey);` (after `onDeath(world, prey)` at `:136`); `maintenance.ts:120` `export function killEntity`, `:153` `world.ents.free(i);`; SPEC §6.8 "Death when … or by predation, lysis, sampling. … remove incident links/bonds".
- Replace the maintenance.ts item of line 188 with:
```text
src/sim/maintenance.ts and src/sim/contacts.ts: one removeAllLinks(world, i) call on each of the two death paths, before world.ents.free. The paths are killEntity at maintenance.ts:120 and the predation capture at contacts.ts:136–139, which frees the prey without killEntity. Later removal paths (lysis in wave 2, sampling in wave 3) must call it too. links.test covers both paths.
```

#### W1-04 · line 188 · MAJOR · other
- Evidence: `births.ts:169` `const slot = e.allocate();` (clearSlot), `:278` `c.birthId[i] = b0;`, `:279` `c.birthId[slot] = b1;`; SPEC §7.7 "removing a segment breaks its links"; SPEC §9.19 "Colony links removed; both unlinked. E04 attachment resets. … F02 links follow branching rules"; plan lines 533, 588, 343.
- Replace the births.ts item of line 188 with:
```text
src/sim/births.ts: commitDivision keeps the retained daughter in the parent's slot with a new birthId b0 (births.ts:278), so every partner row still holds the parent's birthId. Right after that assignment, call a links.ts helper, rekeyLinks(world, i, parentBirthId), that rewrites the stored birthId on each partner row. links.test then proves linksValid holds across a division. Do not empty the retained daughter's fungal links: SPEC §7.7 breaks F02 links only when a segment is removed, and §9.19 says "F02 links follow branching rules". The new daughter's slot is already empty after allocate(). Wave 4 keeps two resets, as planned: removing E12 links at division (mod-adhesion, line 588) and resetting E04 (mod-anchor-light, line 533). X01's hostBirthId stays with parasites-phage (line 343).
```

#### W1-05 · line 190 · BLOCKER · version
- Evidence: `git grep -n 'toBe(3)' HEAD -- tests` → `history-debris.test.ts:97` `expect(SCHEMA_VERSION).toBe(3)`, `:110` `expect(migrated.schemaVersion).toBe(3)`, `:142` `expect(re.file.schemaVersion).toBe(3)`, `:183` `expect(JSON.parse(again.text).schemaVersion).toBe(3)`; `migration.test.ts:35` `expect(SCHEMA_VERSION).toBe(3)`.
- Replace the first sentence of item (1), "(1) Schema 3 (current + 1 if Phase 2 already bumped; update the header comment).", with the text below, keep the rest of item (1), and add `tests/sim/history-debris.test.ts` to the foundation's "You own" list (line 187):
```text
(1) Schema 4: SCHEMA_VERSION 3 → 4 in src/sim/world.ts:29 (3 is P2.8's history.traits/journal, D-0031). Add "4 = P3 foundation: link, anchor, film, E12 and P04 columns; food-object and sample stores" to its header comment. You also own tests/sim/history-debris.test.ts: line 97 `expect(SCHEMA_VERSION).toBe(3)` becomes toBe(4) (toBe(SCHEMA_VERSION) there would be vacuous), and lines 110, 142 and 183 become toBe(SCHEMA_VERSION). Its literal hashes at lines 168 and 176 must keep passing unchanged (see (2)).
```
- Note: the last sentence is G2 Option A. Under Option B write instead: "Its literal hashes at lines 168 and 176 become trajectory-digest checks, or are re-recorded under your DECISIONS id." If the lead takes W4-07/W4-19, also delete item (1)'s last sentence ("'No intake for 10 s' is derived from the existing lastIntakeTick; do not add a column for it.") and add the usable-intake seconds column (G1).

#### W1-06 · line 192 · BLOCKER · other
- Evidence: `serialize.ts:237–240` (`for (const [name] of ENTITY_COLUMNS) { … h.string(name); h.typed(arr.subarray(0, hw)); }`), `:229` (the world's own manifest contentHash + contentVersion); `history-debris.test.ts:168` `toBe('baa42a29186c6c46')`, `:176` `toBe('5ce059e49121f688')`; plan line 126.
- G2 Option A. (Under Option B keep line 192's "included in stateHash" and rely on P-12/P-21.) Replace the first line of item (2) with:
```text
(2) World stores: serialized in canonical order, empty by default, and hash-neutral. stateHash (src/sim/serialize.ts:225) hashes every ENTITY_COLUMNS name and array, so:
- hash each Phase 3 column only when some slot in [0, highWater) differs from its empty value (0, or -1 for the NEG_ONE_DEFAULT link-slot columns). Export one emptyValueOf(name) from entities.ts and use it both here and in the migration;
- hash each link table and store only when it is non-empty;
- hash any new counter only when it differs from its initial value.
A loaded world that holds no Phase 3 state must hash exactly as the g2 build hashed it. That keeps these unchanged: g2-replay's hashAtLoad and hashPlus1000, and tests/sim/history-debris.test.ts:168/176 ('baa42a29186c6c46', '5ce059e49121f688'). Newly realized recipes still change hash through the global manifest's contentHash/contentVersion (serialize.ts:229), as the plan's §2 table expects.
```

#### W1-07 · line 196 · BLOCKER · symbol
- Evidence: `serialize.ts:144` `COLUMNS_ADDED_IN … = { 2: ['dryTimer'] }`; `:158` loop from `state.schemaVersion + 1`; `:164` `columns[name] = encodeArray(new Ctor(s.entities.highWater))`; `:168` `if (v === 3) s = { ...s, history: historyForSchema3(…) }`; `:197` `throw new Error(`entity column ${name} missing`)`; `entities.ts:113` NEG_ONE_DEFAULT is module-private; `world.ts:172` `nextBirthId: 1`.
- Replace item (3) with:
```text
(3) Migration: COLUMNS_ADDED_IN[4] = [every column you add] (the table is {2: ['dryTimer']}; schema 3 added history only). The loop fills an added column with new Ctor(highWater), which is all zeros. Make it write each column's empty value (emptyValueOf, see (2)), so the i32 link-slot columns get -1. A zero-filled slot would point at slot 0 with stored birthId 0, and birthIds start at 1. That is a dangling link on every organism: the import check below would refuse every migrated save, and the hash would change. Add a `v === 4` step in migrateWorldState, after P2.8's `v === 3` history step. It adds, by copy, objects [] and sample null, plus the link tables filled with -1 if you chose tables. saveFile import refuses the following with a readable message and builds no world:
- more than 128 objects;
- an object outside the mask or on a structure;
- asymmetric or dangling links;
- fungal degree > 4;
- adhesion degree > 2;
- a sample row with an unknown species or genome.
```

#### W1-08 · line 198 · MINOR · other
- Evidence: `fields.ts`: eStarch/eOil/eProtein/breaker/broth `system: 'enzymes'`, inhBact/inhFung/inhPhoto `system: 'chemistry'`, film `system: 'film'`; `content/modules/E09.json` params {emitRate, minEnergy, emitCost, localCap}; B08/Y02/F03 foodPriority ['broth']; F02 nativeAbilities include E_STARCH_SECRETION; the manifest enables B04 (digestsFilm true) with systems [core, enzymes].
- Replace item (5) with:
```text
(5) Registry: an enabled species, material or module needs the systems it uses, and the error names both sides.
- Materials: derive the requirement from FIELD_DEFS[target].system for field, deposit, activity and viral targets (INH_* → chemistry; M01, M03–M05, M09 → enzymes; later M02, M06–M08 and M12 automatically). Kind 'object' (M10, M11) → foodObjects.
- Species: BIOFILM → film; BRANCHING/TRANSPORT_LINKS → fungi; HOST_DRAIN → parasites; LYSIS or category virus → viruses; E_STARCH/E_OIL/E_PROTEIN secretion and a broth diet (B08, Y02, F03) → enzymes. Never require film for digestsFilm (B04 ships without film).
- Modules: E01, E09 → enzymes; E10 → film.
```

#### W1-09 · line 199 · BLOCKER · version
- Evidence: `modules.test.ts:48` `expect(reg.manifest.buildPhase).toBe(2)`; `variants.test.ts:403` "…belongs to phase 5 (build phase 2)"; `lab-commands.test.ts:903` "\"STONE\" belongs to phase 5 (build phase 2)"; `golden.ts:72` `stamp: r.stamp`; the golden file has 6× `"contentVersion": 1`; `experiments.ts:633` `contentVersion: this.manifest.contentVersion`, `:822` `new GateWatch(def, recipe, registry.manifest)`.
- G3 Option W. (Under Option P this item moves to the Preflight, P-26; the golden.ts bullet is then unnecessary because the goldens run under `registryWith(G2_LISTS)` with contentVersion 1, G4.) Replace item (6) with:
```text
(6) Manifest: buildPhase 2 → 3 and contentVersion 1 → 2, nothing else, as your FIRST edit. The environment builder's Phase 3 materials fail validation while buildPhase is 2. These literals then fail and are yours to fix:
- tests/sim/modules.test.ts:48 (buildPhase toBe(2));
- tests/recipes/variants.test.ts:403 ('(build phase 2)'): build the message from reg.manifest.buildPhase;
- tests/experiments/golden.ts expectWaveANumbers, which compares stamp.contentVersion with wave A's recorded 1. Compare the stamp without contentVersion, as it already leaves out contentHash, and say so in its header.
tests/sim/lab-commands.test.ts:903 has the same '(build phase 2)' literal. That file is the environment builder's this wave, and that builder fixes it.
```

#### W1-10 · line 201 · MAJOR · status
- Evidence: `SCHEMA_VERSION = 3` (`world.ts:29`); PRE OWNERSHIP "SHARED files: additive edits only … never reformat/reorder/rename code you did not write"; the stage8 SHARED list (line 238) includes `src/sim/constants.ts`.
- G2 Option A wording. (Under Option B write "…migrate by copy to schema 4 and continue with identical trajectory digests (`trajectoryDigest(world, 'g2')` equals digestAtLoad and digestPlus1000)", and drop or re-record the history-debris sentence per W1-05's note.) Replace the first bullet of "Done when" (line 201) with:
```text
- g2-replay and trajectory-fence pass unchanged. The g2 saves (world schema 3, written by the g2 build) migrate by copy to schema 4, hash exactly hashAtLoad and continue bit-identically. The real schema-2 fixture in tests/sim/history-debris.test.ts still hashes 'baa42a29186c6c46' at load and '5ce059e49121f688' 300 ticks later. Prove the fence is live without editing shared files: in a throwaway test that you delete before finishing, perturb one organism of a loaded g2 world (E += 1e-9) and paste the failing digest comparison.
```

#### W1-11 · line 202 · MAJOR · version
- Evidence: `git ls-tree HEAD tests/persistence/fixtures` → `schema2-cleaning-crew-t1900.pixelmeba.gz` (hashes asserted in `history-debris.test.ts:168/176`); `migration.test.ts:19` (`for (let v = 2; v <= SCHEMA_VERSION; v++) for (const name of COLUMNS_ADDED_IN[v] ?? []) delete columns[name];`), `:35`; plan line 125.
- The 3 → 4 and 2 → 4 cases below are G2 Option A. (Under Option B the 3 → 4 case compares `trajectoryDigest(world, 'g2')` with `digestAtLoad`, and the 2 → 4 case checks the values re-recorded per W1-05's note; the 1 → 4 case holds under both options.) Replace line 202 with:
```text
- tests/persistence/migration.test.ts covers three paths through loadSaveFile. Each records provenance.migratedFrom and leaves the input untouched.
  - 3 → 4: a g2 save from tests/fixtures/saves/. stateHash at load equals its expected.json hashAtLoad.
  - 2 → 4: tests/persistence/fixtures/schema2-cleaning-crew-t1900.pixelmeba.gz. Its hashes at load and after +300 ticks are already asserted in tests/sim/history-debris.test.ts:168/176.
  - 1 → 4: asSchema1 of a current save. asSchema1 must also drop the schema-4 stores, because a real schema-1 file has none. stateHash equals the unmigrated world's at load and after +500 ticks.
  Update expect(SCHEMA_VERSION).toBe(3) at line 35 to 4.
```

#### W1-12 · line 212 (MISSED) · MAJOR · other
- Evidence: `grid.ts:121` `geometryVersion: 0`; `recipes.ts:128` `g.geometryVersion++` (applyHabitat); `structures.ts:339` and `experiments.ts:446` bump it; `host.ts:1458` builds the New Dish preview world in the same worker; `transport.ts:28` "Per-world transport cache", `:79–86` (`let tc = d.transport; … if (tc.version === world.grid.geometryVersion) return tc;`).
- Replace the attachment.ts item of the environment's "You own" list (line 212) with:
```text
src/sim/attachment.ts (new): the per-cell attachable-surface mask, cached per world and rebuilt when that world's grid.geometryVersion changes. Keep it on the world's TransportCache (transport.ts, yours; world.derived.transport), since world.ts is the foundation's this wave. Never use a module-level cache keyed by geometryVersion alone: every freshly realized world has geometryVersion 1, and one worker holds several worlds. tests/sim/attachment.test.ts also proves that two worlds with different habitats at the same geometryVersion get their own masks.
```

#### W1-13 · line 213 · MAJOR · ownership
- Evidence: `registry.ts:356` (`if (mat.phase > m.buildPhase) err(…)`); `tools/lib/content-fs.ts:48` (`cached ??= buildRegistry(loadRawPacksFs())`); HEAD manifest enabledMaterials [DEBRIS, GEL, NUTRIENT, SEDIMENT, SHADE, STARCH, SUGAR, WATER]; `commands.ts:262` (`brushCells(...).filter((cell) => canOccupy(world, sp, cell))`); `protocol.ts:31` `export type OverlayId = FieldId | 'light' | 'ph'`; `OverlayPicker.tsx:19–21` availableOverlays filters OVERLAYS by dishInfo.fieldIds; `NewDish.tsx:202–218` ChoiceGroup 'garden' / 'empty' with inline labels.
- Replace the environment's SHARED list (line 213) with the text below. Under G3 Option P drop the "Edit it only once … registryWith({…, buildPhase: 3})" sentences, and drop "and the '(build phase 2)' literal at line 903" from the last test item (the Preflight did both).
```text
SHARED (additive):
- content/manifest.json: enabledSystems += chemistry; enabledMaterials += ACID, BASE, BUFFER, CO2, INH_BACT, INH_FUNG, INH_PHOTO, METABOLITE, OIL, OXYGEN, PROTEIN, SALT; enabledHabitats += GEL_COLONY, SEDIMENT_EDGE. Edit it only once the foundation builder's buildPhase 3 is in the file. The validator refuses phase-3 materials under build phase 2, and registry() then throws for every agent. Until then, test through registryWith({…, buildPhase: 3}). GEL, SEDIMENT, SHADE and WATER are already enabled.
- src/sim/movement.ts: canOccupy only. No change is needed if the surface rule goes into habitatCompatible, which canOccupy returns.
- src/sim/grid.ts: LifeBrush and lifeCellOutcome only.
- src/render/renderer.ts: setBrushPreview's life rule only.
- src/sim/recipes.ts: RecipeOverridesRecord and recipeOverridesOf (habitatId) only.
- src/worker/{protocol,snapshot,host,client}.ts: CellInspect lines, RecipeOverrides.habitatId, and the NewDishPreview habitat grid.
- src/ui/state.ts: startCustom (habitatId). newDishPreview already forwards RecipeOverrides.
- src/ui/panels/Inspector.tsx: cell lines.
- The P2.7 Lab files: src/ui/views/LabView.tsx, src/ui/views/LabToolbar.tsx, src/ui/panels/LabTray.tsx, LabTrayContent.tsx, LabTrayIcons.tsx, LabTrayNames.tsx, OverlayPicker.tsx and OverlayLegend.tsx. Also src/ui/strings/lab.ts: CHEMISTRY_MATERIALS, FOOD_MATERIALS, MATERIAL_COPY, the Chemistry hint and OVERLAYS. The overlay ids 'salt', 'inhBact', 'inhFung' and 'inhPhoto' are FieldIds, so they need no protocol change.
- src/ui/views/NewDish.tsx: the 'Start with' choices (inline in its ChoiceGroup) and the summary. src/ui/strings/modes.ts only if the summary needs a habitat line.
- src/ui/styles.css: sw-<id> swatches.
- tests/sim/lab-commands.test.ts: the Life brush preview test near line 950 and the '(build phase 2)' literal at line 903.
src/sim/commands.ts needs no change: inoculate already filters by canOccupy, and setLid exists.
```

#### W1-14 · line 215 · MINOR · status
- Evidence: `structures.ts:245` shadeFactor, `:303–307` (`const factor = p.erase ? 1 : shadeFactor(world)!`); `lab-commands.test.ts:146` ("replaces water/gel/sediment on open cells only, and moves nothing"), `:234` ("multiplies light by 0.1 and erasing restores 1.0; nothing else changes"); `transport.test.ts:59` open lid, `:79` closed lid, `:88` pH + neutralization.
- Replace the last sentence of the Lab-trays bullet (line 215) with:
```text
Shade paint (× 0.1; erase → 1.0) and substrate paint are already implemented (src/sim/structures.ts applyHabitatEdit, shadeFactor). They are tested in tests/sim/lab-commands.test.ts:146 and :214–262. Gas exchange, the closed lid, pH and neutralization are tested in tests/sim/transport.test.ts:59, :79 and :88. Do not edit structures.ts, which stage8 owns this wave. Cite those tests instead of duplicating them.
```

#### W1-15 · line 218 · MINOR · other
- Evidence: `git show HEAD:content/materials/*.json` guide.rules → the sentence is present in every record except NUTRIENT, SUGAR and DEBRIS (SUGAR ends "…eaters also need mineral nutrients to grow."); BUILD_DIRECTIVE P3.1 "Guide text 'No additional modeled reaction' where relevant"; UX §5.7 "Materials say … where true".
- Replace line 218 with (W5-06 later replaces the explicit list with an import from `guideRules.ts`, so there is one list):
```text
- Content test: every enabled material's guide.rules contains "No additional modeled reaction." unless it is listed with a reason. At HEAD every Phase 2–3 material has it, foods and enzymes included; only the Phase 1 records NUTRIENT, SUGAR and DEBRIS lack it. Those files are not yours, so list the three explicitly. Alternatively, the lead adds their guide.rules to your ownership (P3.1: "where relevant") and you add the sentence.
```

#### W1-16 · line 222 · MAJOR · other
- Evidence: `movement.ts:44–46` (`return habitatCompatible(world, sp, cell)`); `suitability.ts:37` habitatCompatible, `:59` suitabilityAt calls it; `grid.ts:140` isStoneEdge, `:337` `lifeCellOutcome(structure, substrate, life: LifeBrush)`; `renderer.ts:968` uses lifeCellOutcome; `lab-commands.test.ts:950/963` (`{ ...sp, attached: !sp.attached }`); D-0006 "From Phase 3, canOccupy must require a listed attachment surface"; BUILD_DIRECTIVE P3.2 "Done when: … suitability responds to habitat"; `protocol.ts:248` DishInfo carries each species' attachment surfaces.
- Replace line 222 with:
```text
- Attachment surfaces (SPEC §2.2, D-0006): gel cells; sediment cells; passable cells four-adjacent to stone (reuse grid.ts isStoneEdge(g, i)); porous bead cells. Mesh arrives in Phase 5.
- Put the check in habitatCompatible (src/sim/suitability.ts:37, yours), keyed on the species record's surface list (sp.def.attachment); canOccupy (movement.ts:44) only returns it.
- Then inoculate (commands.ts:262, unchanged), births placement (births.ts:105), recipe founders (recipes.ts:273), specimen spawn (specimens.ts:162) and movement all apply it.
- suitabilityAt then gives an attached organism left in open water by habitat paint suitability 0, so it responds through ordinary suitability.
Keep the Life brush preview exact:
  - extend LifeBrush and lifeCellOutcome (src/sim/grid.ts) with the surface list and a stone-edge input;
  - pass them from src/render/renderer.ts setBrushPreview and from src/ui/panels/LabTrayContent.tsx lifeBrushFor (DishInfo.speciesAttachment already carries the surfaces);
  - extend the 'Life brush preview' test in tests/sim/lab-commands.test.ts (near line 950) with B02 built from its record.
Open water without a surface is refused, and inoculation reports the rejected count.
```

#### W1-17 · line 224 · MAJOR · other
- Evidence: `NewDish.tsx:30` `const RECIPE_ID = 'FIRST_DISH_V1'`, `:202–218` ChoiceGroup testId new-dish-start-with; `content/recipes/FIRST_DISH_V1.json` founders A01 ×12 center [48,48] r 5, backgroundOverrides {"sugar": 0}; `recipes.ts` realizeRecipe applies backgroundOverrides after applyHabitat and throws RecipeError at `:285` when eligible < count; `protocol.ts:37` RecipeOverrides {mutationPreset, founderMode, empty}; `host.ts:1121` build(), `:1149` recipeProvenance(); `recipes.ts:150` RecipeOverridesRecord; `state.ts:444` startCustom; CT §8.1 GEL_COLONY sugar 0.10, "no initial life". (g2-close is editing NewDish.tsx, protocol.ts, host.ts and state.ts: re-check these line numbers after it commits.)
- Replace line 224 with:
```text
- New Dish Basics: extend the existing 'Start with' choice with 'Empty Gel Colony' and 'Empty Sediment Edge'. The choice is in src/ui/views/NewDish.tsx (testId new-dish-start-with). Today it offers 'Little Living Garden' (FIRST_DISH_V1) and 'Empty Water Garden' (the same recipe with empty: true).
- The new choices are habitat-only starts (empty: true; CT §8.1 presets have no initial life). FIRST_DISH_V1's 12 A01 founders need water within r 5 of (48,48), and neither habitat has any there: Gel Colony has water only at x 59–68, and Sediment Edge's stone disk (r 13 at (45,43)) covers the area. realizeRecipe would throw RecipeError.
- Add habitatId to RecipeOverrides (src/worker/protocol.ts), to host.ts build() (the transform) and recipeProvenance(), to RecipeOverridesRecord and recipeOverridesOf (src/sim/recipes.ts), and to startCustom (src/ui/state.ts).
- The transform still applies FIRST_DISH_V1's backgroundOverrides {sugar: 0}. That override is why 'Empty Water Garden' has no sugar, and it would erase Gel Colony's sugar 0.10. Decide whether habitat starts drop it (the dish then equals CT §8.1, and its note must not say "no food") or keep it (and say so). Log the choice in DECISIONS.
- The worker computes the preview with habitatGrid() and returns it in NewDishPreview. The summary states exactly what is preloaded.
```

#### W1-18 · line 227 · MINOR · number
- Evidence: `transport.ts` stageEnvironment: diffuseField loop → gasExchange → decayActivity(inh*, 0.002) → neutralize(world); node: `0.3 - Math.min(0.3, 0.2)` → 0.09999999999999998; `1 - 0.002 === 0.998` → true; `tests/helpers/world.ts` fillField fills every mask cell.
- Replace the acid/base and inhibitor clauses of line 227 with:
```text
- tests/sim/chemistry.test.ts: acid 0.30 and base 0.20 filled over every playable cell with fillField, so stage 2 diffusion moves nothing. After one tick, acid is toBeCloseTo(0.10, 12) and base is exactly 0. Each inhibitor filled the same way is exactly v × (1 − 0.002) per tick. A single dosed cell also loses some to diffusion in that tick.
```

#### W1-19 · line 230 · MINOR · other
- Evidence: see W1-17 (A01 founders fall inside the Sediment Edge stone disk → RecipeError).
```text
- tests/e2e/chemistry-habitats.spec.ts: New Dish → Start with 'Empty Sediment Edge' → Create (Lab) → Chemistry → Salt (dose 0.50, radius 3) paints while paused → tapping the cell shows salinity 0.50 and pH 7 → Acidifier, then Buffer, change the pH line as the formula says → the lid toggles closed and back; axe clean at each step.
```

#### W1-20 · line 236 · MINOR · status
- Evidence: `git show HEAD:src/sim/structures.ts` → `:73` stageStructures; `:96–115` Lab edit header; exports habitatEditRule, occupiedCells, invalidHabitatEdit, paintMaterial, shadeFactor, structureEnabled, unavailableHabitatEdit, applyHabitatEdit, HABITAT_EDIT_KINDS, LAB_MAX_POINTS, LAB_MAX_STROKE_SAMPLES and the HabitatEdit* types; `commands.ts:23` imports applyHabitatEdit.
- Replace "the existing src/sim/structures.ts, dormancy.ts, phenotype.ts (StarchRules). If P2.7 put structure-placement helpers into structures.ts, leave them untouched." with:
```text
the existing src/sim/structures.ts. Lines 1–94 are stage 8 (substrateNear, secrete, stageStructures). Lines 96–387 are P2.7's Lab habitat edits, which commands.ts, the Lab UI and the renderer import; leave them untouched. They are applyHabitatEdit, invalidHabitatEdit, shadeFactor, paintMaterial, structureEnabled, unavailableHabitatEdit, occupiedCells, habitatEditRule, HABITAT_EDIT_KINDS, LAB_MAX_POINTS, LAB_MAX_STROKE_SAMPLES and the HabitatEdit* types. Also read dormancy.ts and phenotype.ts (StarchRules).
```

#### W1-21 · line 247 (MISSED) · MINOR · ownership
- Evidence: `reasons.ts:3` "append only, never renumber"; REASONS has ENERGY_LOW (`:31`) and SECRETION_ENERGY_LOW (`:73`), and no reserved-energy code; plan lines 237–238 name neither reasons file.
```text
- tests/sim/stage8-order.test.ts proves the order with synthetic, test-only action registrations (not shipped content): mandatory costs come before optional ones, natives before modules, and modules ascend. An action refused because an earlier one reserved the energy reports its own low-energy code: SECRETION_ENERGY_LOW for secretion, ENERGY_LOW otherwise. That is true because its conditions are checked against the energy remaining. Do not add a reason code, because src/sim/reasons.ts and src/ui/strings/reasons.ts are not yours. If a distinct code is needed, propose it in your report.
```

#### W1-22 · line 248 · MAJOR · number
- Evidence: node: 35.05 − 0.04 → 35.01 (> 35); 35.03 − 0.04 → 34.99 (not > 35); `structures.ts:60` `if (c.E[i]! <= rules.minEnergy) return R.SECRETION_ENERGY_LOW;` before `c.E[i]! -= cost` at `:66`.
```text
- tests/fixtures/shared-budget.test.ts (C08, D04 §2): two registered test actions, each needing E > 35 and costing 0.04, on an organism with E = 35.03. The first fires, leaving 34.99, and the second is refused. Reversing their order refuses the other one. Σ energy spent in the tick = Σ ledger energy categories, and no action ever sees energy another action reserved. Wave 4 extends this file with real modules.
```

#### W1-23 · line 255 · MINOR · doc-ref
- Evidence: `docs/ARCHITECTURE.md` §10.1 "fungi 16 connection‑mask tiles + tip/bud/decaying; film …" (no virus clause); `docs/UX_SPEC.md` §6.2 "Viruses: inspection glyph + density overlay only."
- Replace the ARCH §10.1 parenthesis with:
```text
ARCH §10.1 (fungi: 16 connection-mask tiles + tip/bud/decaying) and UX §6.2 (viruses: inspection glyph + density overlay only)
```

#### W1-24 · line 259 · MINOR · other
- Evidence: CT §1.3 "X01 | 0.4 (free) | 3 | — | water | attaches to A01"; `content/species/X01.json` speed 0.4, headings 1; `art/src/sprite.ts` SMALL_REQUIRED {move: 4, …}.
```text
Non-motile B02, Y01 and Y02 loop 'idle'. X01 swims at 0.4 cells/s while free (CT §1.3), so it gets a 4-frame 'move' loop. It has 1 heading, since a diamond needs no turning.
```

#### W1-25 · line 261 · MINOR · symbol
- Evidence: `src/ui/atlas.ts:31–32` (`const a = anim ?? (sprite.animations.move ? 'move' : 'idle'); … fr.key === `${assetId}/${a}/e/${index}``); callers without anim: `LabTray.tsx:90`, `AddLifeSheet.tsx:18`, `HistorySheet.tsx:112`. W2-24 is the alternative (a `drawFrame` fallback in W2).
```text
… tip, bud and decaying frames, plus a small thumbnail for Add Life. src/ui/atlas.ts drawFrame() draws `${assetId}/move/e/0`, else `${assetId}/idle/e/0`. It is used without an animation by LabTray.tsx Thumb, AddLifeSheet and HistorySheet. Pack the fungus and virus thumbnails where that lookup finds them, e.g. as a one-frame 'idle' animation, and make the checkAtlas 'fungus'/'virus' rules name it. Otherwise, state in your report that the wave that enables them must pass an explicit animation.
```

#### W1-26 · line 268 · MINOR · other
- Evidence: UX §6.3 "B03 curved rod … B07 curved rod with amber tip … F01 branching threads with dark outline and orange tips · F02 copper threads with pulse on transfer"; UX §6.1 "distinguishable by silhouette and pattern in grayscale"; plan line 261 (fungus frames = 16 masks + tip/bud/decaying).
```text
- tests/content/silhouettes.test.ts (UX §6.1, "distinguishable by silhouette and pattern in grayscale"): for every pair of same-size species (Phase 1 and Phase 3 art), compare one frame each. Use loop frame 0 facing E; for F01 and F02, their straight E+W connection tile (mask 10); for V01, its glyph. Their alpha pixels differ in ≥ 12 % of the union. The exception is the pairs UX §6.3 gives the same outline (B03 and B07 curved rods; F01 and F02 threads): their grayscale luminance patterns differ in ≥ 12 % of shared body pixels instead. Every pair's grayscale patterns differ.
```

#### W1-27 · line 270 · MINOR · other
- Evidence: `git show HEAD:content/manifest.json` → enabledSpecies [A01, B01, B04, B06, P01].
```text
- content:validate still passes with the shipped manifest: the five Phase 1 species, and no Phase 3 species enabled.
```

---

## Wave 2 (lines 280–399): 5 BLOCKER, 7 MAJOR, 18 MINOR

| ID | Line | Sev | Plan says | Actually | Replace with |
|---|---|---|---|---|---|
| W2-01 | 282 | MINOR | STATE "Preflight and wave 1 (schema 3 with links …)" | Schema 4 (G1). The only schema number in lines 280–399. | W2-01 |
| W2-02 | 291 | BLOCKER | film-fungi SHARED "content/manifest.json (enabledSpecies += B02, F01; enabledSystems += film, fungi)" | W2 is the first wave to enable species, and `worldContentFor()` copies the manifest into every new world, so unowned tests break (`host.test.ts:30`, `validator.test.ts:64–72`, the wave-A goldens). W1 already breaks the golden stamps and `modules.test.ts:48`. | W2-02: Preflight item 10 (G4) |
| W2-03 | 291 (MISSED) | BLOCKER | No W2 owner for `lab-commands.test.ts`, `grid.ts` or the Life-brush preview | `lab-commands.test.ts:1026–1043` pins the Garden's five species and sentences; the parity test (949–974) fails for B02/F01 once `canOccupy` needs a surface; `livesHereText` would tell players Velvet and Threadlace live in open water. | W2-03 (G7) |
| W2-04 | 297 | MINOR | "in the weighted policy it is one more food under the ordinary rules" | `genome.weights` is indexed by `sp.foods`, which filters film out; film has no weight slot (`w[k] ?? 0` gives 0); intake allows K = 6 requests. | W2-04 (G9) |
| W2-05 | 298 | MINOR | "never P02 (P02 requires 'free'; …)" | B02 is not in P02's prey list at all; 'free' applies to B06–B12; P01 and P04 list B02 as 'any'. | W2-05 |
| W2-06 | 301 | MINOR | "Never the parent cell and never a diagonal. PROPOSED DECISION: the 16 connection-mask tiles define a four-neighbor topology." | Departs from D-0002 and SPEC §6.9 step 2 ("parent cell or 8-neighborhood") without saying so; CLAUDE.md requires recording and flagging it. | W2-06 |
| W2-07 | 303 | MINOR | "At the subcap, births are blocked with DIV_BLOCK_CAPACITY …; nothing is killed." | Every introduction goes through `introduceOrganism`, which checks only AGENT_CAP, so F01 introductions past 2,000 are accepted; SPEC §2.5 blocks them too. | W2-07 |
| W2-08 | 305 | MINOR | "Population reports segments and connected components separately" (SHARED `history.ts`) | History samples are saved and validated on import; a new required field is a save-format change. | W2-08 |
| W2-09 | 307 | MINOR | "one B02 on gel with B 1.5 and E 60 … stops exactly at B = B0' and at film 0.50" | From B 1.5 and film 0 both limits are hit on the same tick, so one setup cannot show which rule stopped it. | W2-09 |
| W2-10 | 319 | BLOCKER | organisms SHARED "content/manifest.json (enabledSpecies += B03, B05, P02, P03, P04, Y01)" | `validator.test.ts:74–81` ('B03' not enabled) and `framework.test.ts:109–114` ('P02') break, and nobody in W2 owns them. | W2-10 |
| W2-11 | 319 | MAJOR | organisms SHARED list (no `suitability.ts` or `snapshot.ts`) for P04's "habitat-compatible while crossing" | `suitabilityAt` returns 0 (SUIT_HABITAT) before any other factor when `habitatCompatible` is false, and the inspector recomputes it; `canOccupy` must stay unchanged (parity test, inoculation, births). | W2-11 |
| W2-12 | 319 | MINOR | "src/sim/contacts.ts (only if a prey requirement is missing; parasites-phage owns it)" | 'any', 'free' and 'inSediment' already live in `movement.ts` `preyAllowed`, which organisms owns. | W2-12 |
| W2-13 | 328 | MAJOR | "Add Life: replace the hard-coded DIETS map with a diet line derived from each record" | `DishInfo` carries no diet data; it is built in `host.ts` `info()`, and organisms owns neither `protocol.ts` nor `host.ts`. Bundling content JSON in the UI would describe the build, not the dish. | W2-13 |
| W2-14 | 328 | MAJOR | "Show V01 as a phage tile whose count means units per cell (1/5/20)" (Explore Add Life only) | V01 also appears in the Lab Life tray (New Dish opens it): wrong dose copy, a preview that crosses out every cell, and a toast "Added N Pinphage". No W2 builder owns those files, and `grid.ts` cannot import `viruses.ts`. | W2-14 (G7) |
| W2-15 | 330 | MINOR | "for every predator enabled after this wave × every enabled species" | V01 is a viral field, never an entity. | W2-15 |
| W2-16 | 343 | BLOCKER | parasites-phage SHARED "content/manifest.json (enabledSpecies += V01, X01; enabledSystems += parasites, viruses)" | `variants.test.ts:419–420` expects 'viruses' to be refused; the same edit also breaks `host.test.ts:30`, `lab-commands.test.ts` and the goldens. | W2-16 |
| W2-17 | 348 (MISSED) | MINOR | "A host below 0.25 × B0' dies through the ordinary rules with cause DEATH_PARASITE_DRAIN." | The ordinary rules have no biomass floor (H ≤ 0, age, predation, lysis, sampling), and nothing feeds `dmgParasite`. | W2-17 |
| W2-18 | 349 | MINOR | "Host death or host rest releases the parasite … On host division the retained daughter keeps it." | Both daughters get new birthIds, so `hostBirthId`/`parasiteBirthId` must be re-pointed; capture frees the prey without `killEntity`. | W2-18 (G8) |
| W2-19 | 354 | MINOR | "PROPOSED DECISION: that unit's 0.01 C joins the host's biomass, with no N." | SPEC §7.5 already rules the 0.01 C transfer; only "into B, with no N" is open. | W2-19 |
| W2-20 | 355 | MINOR | "Infected hosts feed but cannot divide (DIV_BLOCK_INFECTED) or heal." (+ births.ts SHARED "DIV_BLOCK_INFECTED") | Already implemented whenever `infectedBy ≠ 0`; `infectedBy` and `infectionTimer` exist. | W2-20 |
| W2-21 | 360 | MAJOR | "released alive on host death and on host rest (use an E03 carrier)" | X01's only host is A01, and no A01 can carry E03 (algae are not eligible); `registryWith` patches manifests, not module records. | W2-21 |
| W2-22 | 369 | BLOCKER | art-features owns "art/src/**, …, tests/content/atlas.test.ts, tests/render/**, tests/worker/protocol.test.ts" | `tests/sim/module-visuals.test.ts` hard-codes the three marks (`toBe(32)`, the E01/E03/E05 loop, regexes over `renderer.ts`) and has no owner. | W2-22 |
| W2-23 | 370 | MAJOR | art-features packs "link tables → E_LINKMASK, infection/parasite columns → CUE2 bits, …"; film-fungi (291) and parasites-phage (343) also pack snapshot fields | Three builders would write the same `packEntities`/`packDeposits` code; the constants are only in art-features' prompt; every input already exists; DEPOSIT_BANDS 6 → 7 is not additive; buffers are pooled. | W2-23 |
| W2-24 | 370 | MINOR | art-features SHARED "src/ui/atlas.ts" (purpose unstated) | Fungus and virus sprites have no move/idle frame, so their tiles would be blank in AddLifeSheet, the LabTray Thumb and HistorySheet. | W2-24 (alternative to W1-25) |
| W2-25 | 375 | MINOR | "'stains' come from objectEmptied events" | No objectEmptied event exists yet; a `visualEvents()` pass-through is a TS2367 error until W3 adds it to `EventType`. | W2-25 |
| W2-26 | 376 | MINOR | "Deposit bands cover film, oil and protein." / line 382 "Oil-sheen and protein-mote deposit glyphs." | The oil and protein bands and glyphs already exist; only film is new. | W2-26 |
| W2-27 | 379 | MINOR | "with tip/bud/decaying frames (dying flag)" | There is no dying flag; deaths arrive as 'death' visual events. | W2-27 |
| W2-28 | 381 | MAJOR | "The infection glyph shows only on inspected hosts or with the infection overlay on." | UX §4.4 and SPEC §10.8 want a separate "Infection markers" toggle; `OVERLAYS` is hard-coded (no v01, no film), so the v01 overlay cannot be chosen; nobody owns `lab.ts`/`OverlayPicker.tsx` in W2. | W2-28 |
| W2-29 | 390 | MINOR | "atlas completeness covers the new frames with precise errors" | `FEATURE_FRAMES` has no Phase 3 layer, and marks are checked only for enabled modules (none until the W4 flip). | W2-29 (G13) |
| W2-30 | 391 | MAJOR | "grep proves src/render imports nothing from src/sim or art/src." (and line 368 "ARCH §3: … nothing else") | False at HEAD: `src/render` imports `@sim/constants` and `@sim/grid` (the P2.7 brush-preview helpers); only the art/src boundary is enforced (D-0032). | W2-30 |

### Wave 2 replacement text

#### W2-01 · line 282 · MINOR · version
- Evidence: `world.ts:29` `export const SCHEMA_VERSION = 3;`; `serialize.ts` `COLUMNS_ADDED_IN = { 2: ['dryTimer'] }`, `if (v === 3) s = { ...s, history: historyForSchema3(s.history, s.tick) }`.
```text
**STATE:** "Preflight and wave 1 (schema 4 with links and food-object/sample stores and world gates; chemistry + habitats + attachment surfaces; stage 8 reservation framework with construction and transport hooks; organism art for all 14 Phase 3 species) are committed on main."
```

#### W2-02 · line 291 · BLOCKER · ownership
- Evidence: `host.test.ts:30`; `validator.test.ts:64–72`; `pairedRun.ts:644–657`; `golden.ts:78–81`; `recipes.ts:35–46`; `experiments.ts:633` (`contentVersion: this.manifest.contentVersion`); golden stamps `"contentVersion": 1` ×6; `modules.test.ts:48`; plan line 199.
- Add to the Preflight (it is P-11's "step 3b" for part (f); see G4), and add the last sentence to the film-fungi prompt:
```text
Add preflight item 10 (lead, before wave 1, same commit): make every unit test that reads the shipped manifest independent of it. (a) tests/worker/host.test.ts:30 → toEqual(registry().manifest.enabledSpecies). (b) tests/content/validator.test.ts:64-72 → B09 (SIGNAL_GLOW) or B13 (RIVALRY), keeping buildPhase 7; :74-81 → 'B10'. (c) tests/experiments/framework.test.ts:111 → 'P05'. (d) tests/recipes/variants.test.ts:419-420 → 'developmental' (off until Phase 7; 'devices' arrives with P5.2), with the message updated to match. (e) tests/sim/modules.test.ts:48 → read buildPhase from registryWith(G2_LISTS) or drop it (lines 47-57 change again at the W4 module flip). (f) Wave A goldens: in tests/experiments/helpers.ts, runCard, runTwiceIdentical, expectReplayIdentical and untouchedRecipeHash share one registryWith(G2_LISTS) registry that also keeps the g2 contentVersion (1), because the gate stamp records manifest.contentVersion. The three expectWaveAComparison worlds in tests/sim/comparison.test.ts:406-420 are realized under registryWith(G2_LISTS). (g) tests/sim/lab-commands.test.ts:1003-1041 (see the MISSED Life-brush item). In the film-fungi prompt add: "If a test outside your files still fails only because of your manifest edit, report it; do not edit it."
```

#### W2-03 · line 291 (MISSED) · BLOCKER · ownership
- Evidence: `lab-commands.test.ts:949–973` and `:1003–1041`; `tests/helpers/host.ts:22–24` (`new DishHost(registry(), …)`); `grid.ts:326–342`; `content/species/B02.json` habitats [water, gel, sediment], attachment.surfaces [gel, sediment, stoneEdge, bead, mesh]; F01 surfaces [gel, sediment, bead, mesh]; plan line 222.
- If W1-16 lands, the preview is already surface-aware; W2 then keeps only the gardenInfo fix, the B02/F01 parity cases and the `livesHereText` sentence.
```text
Preflight item 10 (g): build gardenInfo()'s DishHost with registryWith(G2_LISTS), or derive the expected names and sentences from info. In wave 2, the builder that takes src/sim/grid.ts for V01 (organisms, per the line-328 correction) also makes the Life-brush preview surface-aware. LifeBrush gains the species' attachment surfaces (from DishInfo.speciesAttachment, in LabTrayContent.lifeBrushFor), and lifeCellOutcome gains a stoneEdge input (passable and four-adjacent to stone) so it equals wave 1's canOccupy. art-features' prompt names the one-line change in src/render/renderer.ts setBrushPreview that passes this input. Extend the parity test to B02 and F01 (open water refused; a stone-edge water cell and a bead accepted), and have livesHereText say that attached species need a surface in open water (D-0006).
```

#### W2-04 · line 297 · MINOR · symbol
- Evidence: `species.ts:82` (`foods: def.foodPriority.filter((f) => f !== 'film')`); B04 foodPriority [detritus, protein, starch, oil], digestsFilm true; F01 [detritus, starch, protein], digestsFilm true; `phenotype.ts:273–274`; `intake.ts:38` `const K = 6`; weighted branch `const wk = w[k] ?? 0`. G9 explains why film must stay out of `sp.foods`.
- Replace the PROPOSED DECISION of line 297 with:
```text
PROPOSED DECISION: in the ordered policy, film comes after the species' listed foods (CT §3.1 "(+film)"). In the weighted policy, film is requested with the species' detritus weight ("as detritus", CT §3.5; both digesters list detritus). genome.weights is indexed by sp.foods, which filters film out, so film has no weight of its own. Stay within intake's K = 6 requests per organism.
```

#### W2-05 · line 298 · MINOR · other
- Evidence: `content/species/P02.json` prey B01/B03/B04/B05 any, B06–B12 free, A01/A03/A04 any (no B02); `P01.json` and `P04.json` `{id: 'B02', requires: 'any'}`.
```text
- B02 is prey for P01 and P04 (requires 'any'), never for P02: B02 is not in P02's prey list (CT §3.2 "never attached B02"). P02 lands this wave, so test it via registryWith.
```

#### W2-06 · line 301 · MINOR · doc-ref
- Evidence: `DECISIONS.md:29–36` (D-0002); SPEC §6.9 step 2 (line 375); SPEC §7.7 "Links form … on four‑neighbor cells"; ARCH §10.1 (line 214) "fungi 16 connection‑mask tiles"; `births.ts:32–43` NEIGHBORS.
```text
...Never the parent cell and never a diagonal. PROPOSED DECISION (supersedes D-0002 and SPEC §6.9 step 2 "parent cell or 8‑neighborhood" for fungi only; write it in DECISIONS.md and flag it for the owner): ARCH §10.1's 16 connection-mask tiles and SPEC §7.7 "links … on four‑neighbor cells" define a four-neighbor topology, and the parent cell already holds the retained segment (SPEC §7.2 "free" cell). births.ts NEIGHBORS already begins E, S, W, N.
```

#### W2-07 · line 303 · MINOR · other
- Evidence: `commands.ts:296–316` (`introduceOrganism` → `e.allocate()`; no fungal check); `inoculate()` treats a −1 slot as capacity (`:276–279`); `constants.ts:14` `FUNGAL_CAP = 2000`.
```text
- Segments count against the 6,000 cap and the 2,000 fungal subcap (FUNGAL_CAP). At the subcap, births are blocked with DIV_BLOCK_CAPACITY and the capacity-limited flag. Fungal introductions are refused and reported in the accepted count (SPEC §2.5). Add src/sim/commands.ts to SHARED (additive: a fungal subcap check in introduceOrganism only; parasites-phage also edits commands.ts additively this wave). Nothing is killed.
```

#### W2-08 · line 305 · MINOR · other
- Evidence: `history.ts:515–527` (sampleProblem; `debrisTotal` is the optional-field precedent), `:543–573` (historyProblem).
```text
- Population reports segments (the species count) and connected components separately. Either compute components in the worker from the link table for the snapshot/History payload, or store them only as an optional per-sample field validated in history.ts sampleProblem (like debrisTotal). Do not change the required HistorySample fields.
```

#### W2-09 · line 307 · MINOR · number
- Evidence: `content/species/B02.json` b0 1; CT §12.6 "cap 0.50 C/cell; stop at B = B0'"; 1.5 − 1.0 = 0.50.
- Replace the first sentence of the film fixture (line 307) with:
```text
- tests/fixtures/film.test.ts: one B02 on gel with B 1.2 and E 60 deposits nothing for the first 100 ticks, then exactly 0.005 C per tick with N moved at N/B, and stops exactly at B = B0' (film 0.20). A second B02 at B 1.5 in a cell preloaded with film 0.40 stops exactly at film 0.50.
```

#### W2-10 · line 319 · BLOCKER · ownership
- Evidence: `validator.test.ts:74–81`; `framework.test.ts:109–114`.
```text
Covered by preflight item 10 (b) and (c): switch these cases to the phase-5 IDs B10 and P05. Otherwise add "tests/content/validator.test.ts (the B03 case only) and tests/experiments/framework.test.ts (the P02 case only)" to organisms' owned files.
```

#### W2-11 · line 319 · MAJOR · ownership
- Evidence: `suitability.ts:58–64`; `snapshot.ts:195`; `movement.ts:44–46` and `:280`; `commands.ts:262` and `births.ts:105` call canOccupy; `lab-commands.test.ts:949–973`.
- Add to the organisms SHARED list:
```text
SHARED (additive) += src/sim/suitability.ts (an entity-aware crossing check keyed on waterCrossed, e.g. crossingCompatible(world, slot, cell) or an optional habitat override for suitabilityAt, used by stage 4) and src/worker/snapshot.ts (inspectEntity uses the same call). Do not change habitatCompatible or canOccupy(world, sp, cell): the Life-brush parity test, inoculation and birth placement must keep refusing water for P04.
```

#### W2-12 · line 319 · MINOR · status
- Evidence: `movement.ts:103–110` (PREY_ANY/PREY_FREE/PREY_IN_SEDIMENT); `contacts.ts:19` `import { hungryPredator, preyAllowed } from './movement'`.
- Replace the contacts.ts item of the organisms SHARED list with:
```text
src/sim/contacts.ts: no edit needed; the prey requirements live in src/sim/movement.ts preyAllowed (yours).
```

#### W2-13 · line 328 · MAJOR · ownership
- Evidence: `AddLifeSheet.tsx:6–12` (DIETS); `protocol.ts:233–265` (DishInfo: speciesHabitats/Attachment/Summaries only); `host.ts:1396–1422` (`info()`). UX §4.3 asks for a diet symbol on Add Life tiles; do both the symbol and the short line.
- Replace the first sentence of the Add Life bullet (line 328) with:
```text
- Add Life: replace the DIETS map (AddLifeSheet.tsx:6-12) with a diet symbol and a short diet line built from the dish's own species records. SHARED (additive) += src/worker/protocol.ts (DishInfo.speciesDiets?: {metabolism, foods, prey, hosts, digestsFilm}[] in speciesIds order) and src/worker/host.ts (fill it in info() from w.species[].def; set digestsFilm only when the world has the film system, as the inspector does). Keep data-testid species-<ID> (tests/e2e/place-and-undo.spec.ts:21).
```

#### W2-14 · line 328 · MAJOR · ownership
- Evidence: `LabTray.tsx:107` case 'life', `:159` `dose: LIFE_COPY.dose(labCount.value)`; `lab.ts:171` LIFE_COPY; `LabTrayContent.tsx:142` lifeBrushFor; `grid.ts:326–342` LifeBrush/lifeCellOutcome and brushCellOutcome('material') (open cells and porous beads); `renderer.ts:31` imports lifeCellOutcome from `@sim/grid`; `state.ts:609`.
- Add to the organisms SHARED list:
```text
Add to organisms SHARED (additive): src/ui/panels/LabTray.tsx and src/ui/strings/lab.ts (phage dose copy: units per covered cell); src/ui/panels/LabTrayContent.tsx (lifeBrushFor marks V01 as viral from DishInfo.speciesDiets metabolism 'viral'); src/sim/grid.ts (LifeBrush gains viral. lifeCellOutcome for viral is stated over grid codes only, e.g. the material rule of open cells and porous beads, because src/render imports grid.ts. It must equal the phage command's cell filter, which parasites-phage exports from src/sim/viruses.ts); the Life-brush block of tests/sim/lab-commands.test.ts (lines 949-995; add a V01 case against that filter); and src/ui/state.ts reportCommand (a V01 dose toasts units per cell and cells dosed, not 'Added N Pinphage').
```

#### W2-15 · line 330 · MINOR · other
- Evidence: `content/species/V01.json` habitats [], category virus, transportClass viral, metabolism viral.
```text
- predation-matrix: for every predator enabled after this wave × every enabled species except V01 (a viral field, never an entity) ...
```

#### W2-16 · line 343 · BLOCKER · ownership
- Evidence: `variants.test.ts:419–420`; `variants.ts:208` checks `manifest.enabledSystems`; `fields.ts` v01/v02 material 'carbon', system 'viruses'.
```text
Covered by preflight item 10 (d): use 'developmental', which stays off until Phase 7 ('devices' arrives with P5.2). Otherwise add "tests/recipes/variants.test.ts (the 'viruses' refusal case only)" to parasites-phage's owned files.
```

#### W2-17 · line 348 (MISSED) · MINOR · status
- Evidence: SPEC §6.8 "Death when H ≤ 0 or age ≥ maxAge, or by predation, lysis, sampling"; SPEC §7.4 "Host below 0.25 × B0' dies normally"; `maintenance.ts` (`c.dmgParasite[i] = c.dmgParasite[i]! * DAMAGE_DECAY`; killEntity only when H ≤ 0 or age ≥ maxAge).
- Replace line 348 with:
```text
- In stage 7 (maintenance.ts, yours), a host with a live attached parasite and B < 0.25 × B0' is removed through killEntity(world, i, R.DEATH_PARASITE_DRAIN): ordinary recycling (remains → detritus, E → dissipated), with the parasite released alive. Add this as an explicit trigger; the ordinary rules (SPEC §6.8) have no biomass floor.
```

#### W2-18 · line 349 · MINOR · symbol
- Evidence: `births.ts:283–287` (`c.birthId[i] = b0; c.birthId[slot] = b1`); `entities.ts` header (a reference is valid only while the birthId matches); `contacts.ts:139` `world.ents.free(prey)`.
```text
- Host death (drain, age, capture in contacts.ts consumePrey, lysis) or host rest releases the parasite alive where it is. On host division the retained daughter keeps it: re-point the parasite's hostBirthId to the retained slot's new birthId in the same commit. A dividing parasite keeps its host on the retained half (re-point the host's parasiteBirthId) and releases its offspring free.
```

#### W2-19 · line 354 · MINOR · doc-ref
- Evidence: `docs/PIXELMEBA_IMPLEMENTATION_SPEC.md:430–439` (SPEC §7.5).
```text
- Infection needs ≥ 1 whole unit in that cell and consumes exactly 1 unit, whose 0.01 C transfers to the host (SPEC §7.5). PROPOSED DECISION: it joins the host's biomass B, with no N.
```

#### W2-20 · line 355 · MINOR · status
- Evidence: `births.ts:68/82` (`if (c.infectedBy[i] !== 0) … DIV_BLOCK_INFECTED`); `maintenance.ts` heal requires `!infected`; `entities.ts` ENTITY_COLUMNS infectionTimer f64, infectedBy u8.
```text
- One infection per host: set infectedBy = 1 (V01) and let infectionTimer count to 20 s; both columns exist. Division (DIV_BLOCK_INFECTED) and healing are already blocked whenever infectedBy ≠ 0 (births.ts divisionBlocker, maintenance.ts); do not add them again. Drop "DIV_BLOCK_INFECTED" from the births.ts SHARED item.
```

#### W2-21 · line 360 · MAJOR · other
- Evidence: `content/modules/E03.json` eligibleAncestors ['B01'…'B11', 'B13', 'Y01', 'Y02']; `content/species/X01.json` hostIds ['A01']; `commands.ts:303–308` (validateModuleSet → ModuleSetError).
```text
- parasite: ... the parasite is released alive on host death (drain, age and capture) and on host rest. No A01 can rest with shipped content (E03 is not eligible for algae). Exercise the rest path either with a test-only ContentRegistry in which E03 is eligible for A01 (as tests/fixtures/registry-imports.test.ts builds a changed registry) or by setting the host's lifeState directly as a labelled test state (the state the release keys on, Preparing or Resting). Say in the report that shipped content cannot reach this path yet ...
```

#### W2-22 · line 369 · BLOCKER · ownership
- Evidence: `git show HEAD:tests/sim/module-visuals.test.ts` → `:127` (`FEATURE_LAYERS.map` equals `FEATURE_LAYER_IDS`), `:132` ({size 16, headings 4, anchor [8,8]}), `:153` (`toBe(32)`), `:187` (E01/E03/E05 loop), `:231–233` (renderer regexes).
- Extend art-features' "You own" list (line 369):
```text
You own: … tests/render/**, tests/worker/protocol.test.ts, tests/sim/module-visuals.test.ts (its atlas-mark, mark-scale and renderer-boundary blocks: generalize the 32-frame count and the E01/E03/E05 loops to every layer). Keep featureLayers(cue, life, selected, out) callable with four arguments (add cue2 as an optional fifth), and keep the renderer.ts lines that the test regex-matches.
```

#### W2-23 · line 370 · MAJOR · ownership
- Evidence: `snapshot.ts:63` (pooled `outE`), `:107–133` (DEPOSIT_BANDS = 6), `:284–290` (inspectCell loops FIELD_IDS); `entities.ts` (hostSlot, hostBirthId, parasiteSlot, parasiteBirthId, infectionTimer, infectedBy); plan lines 308, 343, 372, 389.
```text
art-features is the only builder that edits packEntities/packDeposits this wave (you may change DEPOSIT_BANDS 6 → 7, with film appended after catalysis). E_CUE2 comes from the columns: infectedBy ≠ 0 → CUE2_INFECTED; a live parasiteSlot/parasiteBirthId pair → CUE2_PARASITIZED. E_LINKMASK comes from wave 1's links.ts. Write E_CUE2 and E_LINKMASK for every entity (0 when none; the buffers are pooled). Remove "film per cell; the E_LINKMASK value…" from film-fungi's snapshot item and "CUE2_INFECTED and CUE2_PARASITIZED per entity" from parasites-phage's. They keep only inspector fields (components; infection timer, parasite). Move "Connection masks equal the link table" from film-fungi's done-when (line 308) to art-features' protocol test (line 389 already decodes a linked F01 pair).
```

#### W2-24 · line 370 · MINOR · symbol
- Evidence: `src/ui/atlas.ts:28–42`; `git grep -n drawFrame HEAD -- src/ui` → `AddLifeSheet.tsx:18`, `HistorySheet.tsx:112`, `LabTray.tsx:90`; plan wave 1 "'fungus' = 16 masks + tip/bud/decaying + thumb, 'virus' = glyph + thumb".
- Not needed if W1-25 packs the thumbnails as a one-frame 'idle' animation. Otherwise replace the atlas.ts item with:
```text
src/ui/atlas.ts (drawFrame falls back to wave 1's thumb frame for fungus and virus sprites; AddLifeSheet, LabTray and HistorySheet use it).
```

#### W2-25 · line 375 · MINOR · symbol
- Evidence: `protocol.ts:223` (VisualEvent type = birth, death, introduce, capture, conversion, mutation, branchEstablished, branchExtinct); `events.ts:7–23` (EventType); `git grep objectEmptied HEAD -- src` → none; plan line 472.
```text
- 'stains' come from objectEmptied visual events (cosmetic and fading; never read by the sim). Add 'objectEmptied' to VisualEvent['type'] in protocol.ts, draw the stain from it, and test it with a hand-built snapshot. Do not touch visualEvents(): wave 3 food-objects adds 'objectEmptied' to src/sim/events.ts EventType (add that file to its SHARED list) and the visualEvents() pass-through when it emits the event.
```

#### W2-26 · line 376 · MINOR · status
- Evidence: `snapshot.ts:107–133` (starch, detritus, oil, protein, sugar haze, catalysis); `src/render/layers.ts:156–174` (oil sheen, protein motes).
```text
- Deposit bands: add film only (band 6, after catalysis); the oil and protein bands and their sheen/mote glyphs already exist (keep them). Line 382 becomes: "- Food objects with 4 fill steps and a fading stain."
```

#### W2-27 · line 379 · MINOR · symbol
- Evidence: `entities.ts` FLAG = {attached, stressed, feeding, hunting, capacityBlocked, overCapacity, moving, secreting, justBorn, introduced, restDry, usableIntake}; `snapshot.ts` `outE[o + E_FLAGS] = flags`.
```text
- Fungal tiles chosen by mask, with tip/bud frames from recorded state and decaying frames played from the segment's 'death' visual event (there is no dying flag).
```

#### W2-28 · line 381 · MAJOR · ownership
- Evidence: `lab.ts:244–253` (OVERLAYS: sugar, nutrient, oxygen, co2, light, starch, detritus, eStarch); `OverlayPicker.tsx` (availableOverlays filters OVERLAYS by DishInfo.fieldIds); UX §4.4 Observe tray "infection markers"; SPEC §10.8 "separate toggles for infection markers"; BUILD_DIRECTIVE P3.4 "infection overlay".
```text
- The infection glyph shows only on inspected hosts or while the Observe tray's "Infection markers" toggle is on (UX §4.4, SPEC §10.8; render-only, from CUE2_INFECTED). Pinphage units are an ordinary density overlay. SHARED (additive) += src/ui/strings/lab.ts (OVERLAYS += v01 "Pinphage", units per cell; film "Biofilm", C per cell) and src/ui/panels/OverlayPicker.tsx (the toggle). Lead after W2: tick P3.4 only when the overlay and the toggle work.
```

#### W2-29 · line 390 · MINOR · other
- Evidence: `tools/content-validate.ts:83–90` FEATURE_FRAMES, `:101–103` enabledMarks.
```text
- ...atlas completeness covers the new frames: add FEATURE_FRAMES rows for anchor_foot, shade_patch, light_trail, debris_granule, protein_notches, matrix_edge and adhesion_link. tests/content/atlas.test.ts calls checkAtlas(atlas, species, { marks }) with the visualLayer of every Phase 3 module record (E04, E06–E10, E12), whatever the manifest says.
```

#### W2-30 · line 391 · MAJOR · status
- Evidence: `git grep -n "from '@sim" HEAD -- src/render` → `layers.ts:6`, `renderer.ts:10`, `renderer.ts:31`; `eslint.config.js:94–110`; D-0032.
```text
- grep proves src/render imports nothing from art/src (ESLint and tests/sim/module-visuals.test.ts already enforce it) and adds no @sim import beyond the existing @sim/constants and @sim/grid brush-preview ones. At line 368 read: "(ARCH §3, D-0032: src/render reads snapshot types and the atlas manifest, never art/src)".
```

---

## Wave 3 (lines 400–517): 2 BLOCKER, 10 MAJOR, 13 MINOR

| ID | Line | Sev | Plan says | Actually | Replace with |
|---|---|---|---|---|---|
| W3-01 | 402 | MINOR | STATE "…and wave 2 (…; Phase 3 render layers and protocol v2) are committed on main." (the "…" inherits line 282's "schema 3") | Fix the source at line 282 (W2-01). "protocol v2" is right: PROTOCOL_VERSION is 1 at HEAD and W2 bumps it once. | W3-01 |
| W3-02 | 410 | MAJOR | e1-producers owns three recipes for four cards (EXP_204, seed 204, would reuse SHARED_LUNCH_V1, seed 201) | Every card with phase ≤ buildPhase ships; four committed tests pin the seven Phase 2 cards; `framework.test.ts:56` requires card seed = recipe seed. None of those tests is in the builder's lists. | W3-02 |
| W3-03 | 411 | MINOR | "grammar additions such as converted.oil, consumed.broth, intake.<species>.<food>" | `converted.*` and `consumed.<pool>` exist in `src/sim/pairedRun.ts` `parseMeasure` (`experiments.ts` only re-exports); `intake.SP` already measures each gate species' single food. | W3-03 |
| W3-04 | 411 | MAJOR | 'omitFounders' listed only under `schema.ts` and `experiments.ts` | `describeArms` is an exhaustive switch with no default, so tsc fails (TS2366) without a case; `ExperimentRun.tsx` `armTitles` falls back to a generic title; neither UI file is listed. | W3-04 |
| W3-05 | 411 (MISSED) | MINOR | Manifest effects: enabledSpecies += B07, B08, Y02 (and F02 at line 437) | `host.test.ts:30` pins FIRST_DISH_V1's speciesIds; each enable breaks it again unless W2 made it relational. | W3-05 |
| W3-06 | 418 | MAJOR | "Reaction ledger … per enzyme in the cell and the dish: activity, substrate present, converted in the last second, product made, bound N moved, …" | Stage 3 keeps only per-tick dish tallies, cumulative dish totals and all-enzyme per-cell catalysis (last tick, unsaved); nothing records per-cell per-enzyme conversion, bound N or a one-second window. The recorder belongs in `conversion.ts` (food-objects' file) with a home in `world.ts` (no owner). | W3-06 |
| W3-07 | 423 | MAJOR | "EXP_203 Protein chain: (64,64), 20 B08 + 10 Y02 … The paired arm omits the B08 founders" | Founder groups are placed in recipe order with one used-cell mask and sequential birthIds, so omitting the first group moves every Y02's cell and birthId: arm B would differ by more than the declared change. | W3-07 |
| W3-08 | 424 | MINOR | "EXP_204 Broken catalyst: E201 paired, arm B gets M09 = 4 per patch cell at 0 s. Compare starch converted at 120 s (B < A)." | D02 §21 and CT §10.3: completion is the measured comparison, not a prescribed ratio. It needs its own seed-204 recipe; a stroke equals the patch disk only when centred on the cell centre. | W3-08 |
| W3-09 | 427 (MISSED) | MINOR | "Each blocking condition (E ≤ 35, no substrate within the four-neighborhood, local activity ≥ 1.0, not Active) gives its reason code." | Only the first three write `secretionCode`; non-Active organisms are skipped before it is written (a hashed column; D-0029 tallies them under their state reason). | W3-09 |
| W3-10 | 429 | MAJOR | "open the Protein chain card … → tap a patch cell → the reaction ledger shows protein converted and broth made → the 'Food access' overlay toggles" | EXP_203 is paired: its run screen ignores taps and has no inspector or overlay picker. New Dish realizes only FIRST_DISH_V1. Overlays live in Lab → Observe. | W3-10 |
| W3-11 | 435 | MINOR | "docs/source/D04 §9 last two paragraphs (post-construction pools; adhesion links are not fungal links)" | That content is the F02 paragraph at D04 line 223; §9's last two paragraphs are the birth list and the death/sampling paragraph. | W3-11 |
| W3-12 | 437 | MAJOR | f02-links SHARED: snapshot bit 4, "src/sim/history.ts (per-second transfer totals; observation only)", Inspector line; line 447 "Events: link formed and link broken." | Needs observation-only per-world state in `world.ts`, the sample push in `publish.ts`, `EntityInspect` in `protocol.ts` and new `EventType` members in `events.ts`; none is listed, and an entity column would be a schema change. | W3-12 |
| W3-13 | 439 | MINOR | "Otherwise the daughter is placed unlinked, and its birth record says so." | Lineage arrays are hashed and saved; the 'birth' event's detail is neither. | W3-13 |
| W3-14 | 449 | MINOR | "a gel dish with four F02 at (60,64)…(63,64)" | GEL_COLONY's water channel (x 59–68, all y) covers those cells; `place()` does no habitat check, so a wrong substrate would not fail loudly. | W3-14 |
| W3-15 | 466 | MAJOR | food-objects SHARED: `commands.ts` "'placeObject' … plus a refusal of structure placement onto an object cell", worker files, "the Lab Food tray" | The refusal belongs in `structures.ts`/`grid.ts` and the renderer preview (G6, G7); `CompareText.tsx` (exhaustive `describeChange`), `events.ts`, `Inspector.tsx` and the three Lab files are missing. | W3-15 |
| W3-16 | 476 | MINOR | "the fill steps fall (read from the snapshot via the test hook, not pixels)" | The app has no test hook; journeys wrap `Worker` in an init script (G12). | W3-16 |
| W3-17 | 482 | MINOR | "the P2.7 Lab tools (Erase structure may exist already: verify, do not duplicate)" | It exists ('eraseStructure', Tools-tray item 'erase') and is tested. | W3-17 |
| W3-18 | 484 | MAJOR | tools-sample SHARED list | `CompareText.tsx` `describeChange` needs the five new kinds (TS2366); `view-switch.test.ts` pins the Tools tray (351, 406, 430); the Lab files are `LabView.tsx`, `LabTray.tsx`, `lab.ts`. | W3-18 |
| W3-19 | 489 | MINOR | "The source stays paused: Run is refused with 'A sample is held — …'" | The host also steps a paused dish and applies paused edits, which could take the slots Cancel needs; a command refused inside the simulation still takes a seq. | W3-19 (G10) |
| W3-20 | 490 | BLOCKER | "Cancel = command 'sampleReturn'. … The stateHash must equal the pre-begin hash." | stateHash hashes `commands.nextSeq` and every command takes a seq, so take + return can never restore the hash; the plan's own §6 item 5 (line 833) says Cancel is host-level. | W3-20 (G10 Option W3) |
| W3-21 | 492 | MINOR | "organisms keep … all state (…, host ownership, links). New slots are allocated lowest-free-first …" | References are `(slot, birthId)` pairs, so copied rows need their slot halves remapped; `allocate()` cannot allocate at a given slot. | W3-21 |
| W3-22 | 498 | MINOR | "Erase structure: use P2.7's if it exists, otherwise add it" | It exists and already behaves as SPEC §10.4 requires. | W3-22 |
| W3-23 | 502 | BLOCKER | "Take then return restores the exact pre-begin stateHash, also with a save/reload in between." | Impossible while Cancel is a command (`nextSeq` + 2). | W3-23 (G10) |
| W3-24 | 505 | MAJOR | "Transfer is atomic: one invalid destination means nothing moves, the slot is intact and the hash is unchanged." | A refused command still takes a seq, so the hash moves by `nextSeq` + 1. | W3-24 |
| W3-25 | 510 | MAJOR | "The Cancel path leaves the dish unchanged (hash via the test hook)." | There is no test hook, and the hash comparison holds only for a host-level Cancel that restores `nextSeq`. | W3-25 (G10) |

### Wave 3 replacement text

#### W3-01 · line 402 · MINOR · version
- Evidence: `world.ts:29`; `protocol.ts:17` `PROTOCOL_VERSION = 1`; `git diff HEAD -- src/worker/protocol.ts` has no PROTOCOL_VERSION/ENT_STRIDE line; plan line 282.
```text
Fix the source at line 282 ('schema 3 with links…' → 'schema 4 with links…'). Line 402's '…' then expands to: **STATE:** "Preflight and wave 1 (schema 4 with links and food-object/sample stores and world gates; chemistry + habitats + attachment surfaces; stage 8 reservation framework with construction and transport hooks; organism art for all 14 Phase 3 species) and wave 2 (B02 film, F01 branching, B03, B05, Y01, P02, P03, P04, X01, V01, phage doses; Phase 3 render layers and protocol v2) are committed on main."
```

#### W3-02 · line 410 · MAJOR · other
- Evidence: `experiments.ts:886–888` (filter `e.phase <= registry.manifest.buildPhase`) and `:516` (`seed: def.seed`); `framework.test.ts:56` (`expect(e.seed).toBe(reg.recipes[e.recipeId]!.seed)`); `app-flow.test.ts:67`; `journal-and-words.test.ts:141`; `experiments.spec.ts:47` (`toHaveCount(7)`).
- Replace e1-producers' "You own" list (line 410) with:
```text
You own: src/sim/secretion.ts, src/sim/reactions.ts (new: reaction ledger view), src/ui/panels/ReactionLedger*.tsx (new), src/ui/strings/reactions.ts (new), content/recipes/SHARED_LUNCH_V1.json (seed 201), OIL_NEIGHBORHOOD_V1.json (202), PROTEIN_CHAIN_V1.json (203) and BROKEN_CATALYST_V1.json (204: the SHARED_LUNCH_V1 setup under its own seed, because tests/experiments/framework.test.ts:56 requires card seed = recipe seed) (new), content/experiments/EXP_201.json … EXP_204.json (new), tests/fixtures/producers.test.ts (new), tests/experiments/e201-e204.test.ts (new), tests/e2e/reactions.spec.ts (new). SHARED (list edits only): tests/experiments/framework.test.ts:34, tests/experiments/app-flow.test.ts:67, tests/experiments/journal-and-words.test.ts:141 and tests/e2e/experiments.spec.ts:47 pin the seven Phase 2 cards; extend them with EXP_201–EXP_204 (paired: EXP_203, EXP_204). Run 'npx tsx tools/fence-update.ts --add <recipe>' for all four recipes.
```

#### W3-03 · line 411 · MINOR · symbol
- Evidence: `pairedRun.ts:96` ENZYMES = ['starch','oil','protein'], `:100` CONSUMABLE_POOLS, `:118` parseMeasure ('consumed' and 'converted' branches), header line 23 "intake.SP (carbon taken in, all routes)"; `conversion.ts` RULES eProtein protein → broth.
- Replace the schema.ts/experiments.ts item of line 411 with:
```text
src/sim/content/schema.ts and src/sim/experiments.ts (a new change kind 'omitFounders' {founderIndex} for E203's paired arm). Gates use the existing grammar in src/sim/pairedRun.ts parseMeasure: converted.starch / converted.oil / converted.protein (= broth made), intake.B01 / intake.B05 / intake.B07 / intake.Y02 (each eats one food, CT §3.1) and consumed.<pool>. Add a measurement family only if a gate cannot be expressed; put it in src/sim/pairedRun.ts and word it in src/ui/strings/experiments.ts measureLabel.
```

#### W3-04 · line 411 · MAJOR · path
- Evidence: `src/ui/strings/experiments.ts:213–241` (cases none/omitPatch/omitScheduled/shade/commands, no default); `tsconfig.json` `"strict": true`; `src/ui/views/ExperimentRun.tsx:42–54` armTitles; `ExperimentCardView.founders` carries the recipe founders.
```text
Add to SHARED (additive): src/ui/strings/experiments.ts (a describeArms case for 'omitFounders', e.g. 'The same, without the 20 Brothmaker founders') and src/ui/views/ExperimentRun.tsx (an armTitles case, e.g. 'B · without Brothmakers').
```

#### W3-05 · line 411 (MISSED) · MINOR · ownership
- Evidence: `host.test.ts:30`; `recipes.ts:35–46` worldContentFor (`species: m.enabledSpecies.map…`); `host.ts:1405` (`speciesIds: w.species.map((s) => s.id)`). Moot if the Preflight adopted W2-02 item 10 (a).
```text
SHARED for this wave's manifest editors (e1-producers, f02-links), unless wave 2 already made it relational: tests/worker/host.test.ts:30. Assert speciesIds equal to registry().manifest.enabledSpecies instead of the g2 list.
```

#### W3-06 · line 418 · MAJOR · ownership
- Evidence: `git show HEAD:src/sim/conversion.ts` (tally reset each tick; `seen[i] += converted` summed over RULES; nMoved never recorded; `world.conversionTotals[r.name] += total`); `world.ts:113–122` (conversionTally; catalysisCells "observation only … not hashed, not saved"; conversionTotals).
```text
Add to SHARED (additive): src/sim/conversion.ts (one recorder call per rule and cell into your src/sim/reactions.ts; food-objects owns the file this wave, so re-read it just before the edit) and src/sim/world.ts (one observation-only field for per-cell, per-enzyme carbon and N converted in the last second; like catalysisCells it is never read by the simulation, hashed or saved).
```

#### W3-07 · line 423 · MAJOR · other
- Evidence: `recipes.ts:266–300` ("Founders: distinct cells nearest the requested center"; one `used = new Uint8Array(128 * 128)` across groups); `commands.ts:314` (`const birthId = world.counters.nextBirthId++`).
```text
- EXP_203 Protein chain: (64,64), 10 Y02 + 20 B08 (PROTEIN_CHAIN_V1 lists Y02 first), protein 0.50 with N 0.05. Gate: broth made > 0 and Y02 broth intake > 0. The paired arm omits the B08 founder group. 'omitFounders' may omit only the last founder group (validate this in experimentProblems), so every Y02 keeps arm A's cell and birthId, and arm B shows zero broth.
```
- Note: "protein 0.50 with N 0.05" reads most naturally as proteinN 0.05 (0.10 N per C, no free nutrient in that patch); record the reading as a decision (G17 #16).

#### W3-08 · line 424 · MINOR · doc-ref
- Evidence: `docs/source/D02-mass-expansion-design-volume-2.md:669`; `docs/CONTENT_TABLES.md:485`; `grid.ts:164–189` (diskCells vs brushCells); `recipes.ts:135` validPatchCells uses diskCells; `commands.ts` deposit/invalidDepositStroke; EXP_102's gate pattern {runSeconds, arm A, gte 180}.
```text
- EXP_204 Broken catalyst: the E201 setup (BROKEN_CATALYST_V1, seed 204), paired. Arm B gets a 'commands' change at atSecond 0: deposit M09, dose 4, points [[45.5, 64.5]], radius 6 (this brush disk equals the recipe's patch disk). stoppingSeconds 120. Gate: runSeconds (arm A) ≥ 120 with converted.starch among the measurements; completion is the measured comparison, not a prescribed ratio (D02 §21). The fixture reports the measured B − A difference (expected B < A).
```

#### W3-09 · line 427 (MISSED) · MINOR · other
- Evidence: `structures.ts:83` (`if (c.lifeState[i] !== LIFE_ACTIVE) continue;`) before `:87` (`c.secretionCode[i] = outcome`); D-0029 ("a producer that is not Active under its state reason"), D-0032; `entities.ts` ENTITY_COLUMNS 'secretionCode' (hashed).
- Replace the "Each blocking condition …" sentence of line 427 with:
```text
Each blocking condition gives its reason: E ≤ 35 → SECRETION_ENERGY_LOW, no substrate in the cell or a four-neighbor → SECRETION_NO_SUBSTRATE, local activity ≥ 1.0 → SECRETION_SATURATED (all in secretionCode). Not Active gives the state reason (PREPARING, RESTING_FOOD_SCARCE/RESTING_DRY, WAKING), as D-0029 tallies it. secretionCode stays unwritten for non-Active organisms (hashed column; B06 bit-identical).
```

#### W3-10 · line 429 · MAJOR · other
- Evidence: `src/ui/views/ExperimentViewport.tsx:1–5` ("Nothing is placed here … gestures only move the camera") and `:35` (`onTap: () => undefined`); `state.ts:1081–1108` (a paired card routes to experimentRun); `NewDish.tsx:30`; `LabTray.tsx:460` OverlayPicker.
```text
- tests/e2e/reactions.spec.ts: open the Oil neighborhood card (EXP_202; single-arm, so it opens as an ordinary dish) from Notebook → Experiments → run at 4× → tap a patch cell → the reaction ledger shows oil converted and metabolite made, credited 'Made here by Oilwick' only when an Oilwick is in that cell or a four-neighbor → Lab → Observe → the 'Food access' overlay toggles with its legend; axe clean.
```

#### W3-11 · line 435 · MINOR · doc-ref
- Evidence: `git show HEAD:docs/source/D04-living-worlds-and-evolution-expansion.md | sed -n 206,236p` (lines 221, 223, 225, 232, 235).
- Replace "docs/source/D04 §9 last two paragraphs (post-construction pools; adhesion links are not fungal links)" with:
```text
docs/source/D04 §9: the paragraph 'Existing F02 fungal transfer remains its own budgeted simultaneous pass …' (line 223: post-construction body pools; adhesion links are not fungal links), plus the birth bullet 'F02 transport links follow their existing branching rules' (line 232)
```

#### W3-12 · line 437 · MAJOR · ownership
- Evidence: `world.ts:116–120` (catalysisCells "observation only: never read by the simulation, not hashed, not saved"); `publish.ts:46–60` (debrisTotal added to the sample there); `history.ts:131` (summarize keeps debrisTotal), `:515–527` sampleProblem; `events.ts:7–22` EventType (no link events); `protocol.ts:325` EntityInspect.
- Replace f02-links' SHARED list (line 437) with:
```text
SHARED (additive): content/manifest.json (enabledSpecies += F02); src/sim/content/implemented.ts (TRANSPORT_LINKS); src/sim/structures.ts (one line: call your pass in the existing hook); src/sim/world.ts (one observation-only field for per-slot transfer carbon over the last second and the last 10 s, cleared when a segment dies so a reused slot inherits nothing; never an entity column, never hashed or saved); src/sim/events.ts (EventType += 'linkFormed', 'linkBroken'); src/sim/publish.ts and src/sim/history.ts (an optional per-second fungal transfer total on samples, like debrisTotal: validated in sampleProblem, kept by summarize, no schema change); src/worker/protocol.ts and src/worker/snapshot.ts (E_LINKMASK bit 4 (= 16) when the segment sent or received this second, and an EntityInspect transfer line); src/ui/panels/Inspector.tsx (e.g. 'Sent 0.12 C to 2 neighbors in the last 10 s').
```

#### W3-13 · line 439 · MINOR · other
- Evidence: `serialize.ts:243–247` (stateHash iterates the lineage arrays); `events.ts` `SimEvent.detail: Readonly<Record<string, number | string>>`; stateHash never reads events.
```text
Otherwise the daughter is placed unlinked, and the 'birth' event's detail says so (e.g. {link: 'degree'}). Lineage records are unchanged.
```

#### W3-14 · line 449 · MINOR · other
- Evidence: `CONTENT_TABLES.md:379` ("GEL_COLONY | Gel Colony | gel; water channel x 59–68 (all y); no stones"); BUILD_DIRECTIVE P3.2 "Gel Colony (channel x 59–68)"; `tests/helpers/world.ts:20–45` (clearWater, place).
```text
- tests/fixtures/fungal-transport.test.ts (E212): an all-gel dish built by hand (tests/helpers/world.ts clearWater, then set every in-dish cell's substrate to gel and call updateDerived; not GEL_COLONY, whose water channel covers x 59–68) with four F02 at (60,64)…(63,64) chained with linkFungal; B = 4, 2, 2, 2; N = 0.10 B; E = 50; H = 100; no food; Fixed Traits.
```

#### W3-15 · line 466 · MAJOR · path
- Evidence: `structures.ts:200` occupiedCells, `:278` applyHabitatEdit, `:363` moveContents iterates FIELD_IDS; `grid.ts:255` brushCellOutcome; `renderer.ts:955–969` setBrushPreview (occupied from snapshot ents → brushCellOutcome); `commands.ts:122–126`; `src/ui/panels/CompareText.tsx:28–57`; `events.ts:7`.
- Replace food-objects' SHARED list (line 466) with:
```text
SHARED (additive): content/manifest.json (enabledMaterials += M10, M11; enabledSystems += foodObjects); src/sim/commands.ts (tools-sample owns it this wave: add only the kind 'placeObject' {materialId, x, y}); src/sim/structures.ts and src/sim/grid.ts (refuse stone/wall/bead placement on a cell holding an object: extend occupiedCells/brushCellOutcome for the 'place' rule and count it in HabitatSkips; f02-links adds one hook line to structures.ts this wave); src/render/renderer.ts setBrushPreview (mark the snapshot's object cells as refused for 'place', so the preview never promises what the command refuses); src/sim/events.ts (EventType += 'objectEmptied'); src/worker/{protocol,snapshot,host,client}.ts (visual event 'objectEmptied', and the object inventory in CellInspect); src/ui/panels/Inspector.tsx (cell line: remaining C and N per pool); src/ui/panels/CompareText.tsx (describeChange case 'placeObject'). The Lab Food tray: src/ui/views/LabView.tsx (a tap tool id such as `object:${materialId}` → placeObject), src/ui/panels/LabTray.tsx (trayItems 'food', itemCopy, categoryOf) and src/ui/strings/lab.ts (item copy, skippedText). The Explore Feed stays Sugar/Starch/Debris/Nutrient (src/ui/panels/FeedSheet.tsx FOODS; UX §4.3).
```
- Note: "refused on occupied cells" (line 468) means a cell already holding an object; organisms do not block objects (SPEC §2.2 lists the object as a per-cell slot).

#### W3-16 · line 476 · MINOR · other
- Evidence: `tests/e2e/lab-tools.spec.ts:3–4` ("(an init script records the page's Worker; the app has no test hook)"); `git grep 'window.__' HEAD -- src` → nothing.
- Replace "(read from the snapshot via the test hook, not pixels)" with:
```text
the fill steps fall (read each 'snapshot' message's objects list through an init script that wraps Worker, as tests/e2e/lab-tools.spec.ts watchWorker does; never pixels, and add no test hook to the app)
```

#### W3-17 · line 482 · MINOR · status
- Evidence: `structures.ts:97–117` (header), `:311–314` (eraseStructure case); `lab.ts:108` ERASE_STRUCTURE; `LabView.tsx:230`, `:243` (`command(…, payload, true)`); `lab-commands.test.ts:483–518`; `lab-tools.spec.ts:199`.
- Replace "the P2.7 Lab tools (Erase structure may exist already: verify, do not duplicate)" with:
```text
the P2.7 Lab tools (Erase structure already exists: 'eraseStructure' in src/sim/structures.ts applyHabitatEdit, Tools-tray item 'erase'; do not add another)
```

#### W3-18 · line 484 · MAJOR · ownership
- Evidence: `CompareText.tsx:28–57`; `view-switch.test.ts:351–356`, `:406`, `:430`; `LabView.tsx:50–58` LabToolId, `:203` payloadFor.
- Replace tools-sample's SHARED list (line 484) with (whether Sample and Clean water appear on g2-recorded worlds decides `:430`; G17 #19):
```text
SHARED (additive): src/worker/{protocol,host,client,snapshot}.ts (transaction state, preview, refusing Run and Step while a sample is held); src/persistence/saveFile.ts (a pending sample restores on load); src/ui/{state.ts,views/DishScreen.tsx,styles.css}; src/ui/panels/CompareText.tsx (describeChange cases for sampleTake, sampleReturn (if Cancel is a command), sampleDiscard, sampleTransfer and cleanWater); the Lab files src/ui/views/LabView.tsx (LabToolId, gesture → command), src/ui/panels/LabTray.tsx (trayItems 'tools', itemCopy, categoryOf, ToolsActions) and src/ui/strings/lab.ts; src/ui/panels/MoreSheet.tsx; tests/sim/view-switch.test.ts (:351 and :406 pin the Tools tray to the four structure tools and :430 to [] for an older dish; extend or restate them).
```

#### W3-19 · line 489 · MINOR · other
- Evidence: `host.ts:435–442` case 'setSpeed'; `:443–450` case 'step' → stepDish; `:451–474` case 'command' → applyNow; `commands.ts:60`.
- Replace the last sentence of line 489 ("The source stays paused: Run is refused with …") with:
```text
The source stays paused. The host refuses Run and Step with "A sample is held — transfer, cancel or discard it first". It also refuses every other command except the sample commands, before the command reaches applyNow, so no seq is taken and the original slots and cells stay free for Cancel. Decide whether Undo is refused or acts as Cancel.
```

#### W3-20 · line 490 · BLOCKER · symbol
- Evidence: `serialize.ts:256` (`h.number(world.commands.nextSeq);`); `commands.ts:60` (`seq: world.commands.nextSeq++`); `host.ts:476–506` (Undo restores the serialized pre-command state, log and nextSeq included, and resets checkpoint/replay); plan line 833; SPEC §10.5 "Cancel restores the checkpoint exactly"; BUILD_DIRECTIVE P3.5 "cancel restores exactly".
- G10 Option W3 (under Option W6 use W6-21's decision text and keep this block's last sentence for the after-reload case). Replace line 490 with:
```text
- Cancel is host-level, not a command (as §6 item 5 says), and restores the transaction checkpoint exactly (SPEC §10.5, D07 §09). PROPOSED DECISION: instead of storing a second world, rebuild it: an exact inverse move into the original slots and cells, then restore the command state as Undo does. That means dropping the 'sampleTake' entry from commands.log, setting commands.nextSeq back to that command's seq (recorded in world.sample), and resetting the host's rollback checkpoint, replay list and undo slot. The stateHash then equals the pre-begin hash, also after a reload. If a 'sampleReturn' command is used instead, the result can equal only the pre-begin world's stateHash with nextSeq advanced by 2; record that deviation from 'restores exactly' in DECISIONS for the owner.
```

#### W3-21 · line 492 · MINOR · other
- Evidence: `entities.ts:8–10` ("Cross-entity references store (slot, birthId); a reference is valid only while alive[slot] && birthId[slot] === storedBirthId"), columns preySlot … parasiteBirthId, `allocate()` and `refValid()`.
- Replace the end of the Transfer bullet from "organisms keep relative positions" on with:
```text
… organisms keep relative positions and all state (genome, energy, age, infection, host ownership, links). New slots are allocated lowest-free-first in ascending original-slot order. Every stored slot reference (hostSlot, parasiteSlot, preySlot, fungal and adhesion link slots) is remapped to the new slots, with birthIds unchanged. Document this. Cancel returns rows to their exact original slots.
```
- Note: returning rows to their exact original slots needs an allocate-at-slot helper; `EntityStore.allocate()` only takes the lowest free slot.

#### W3-22 · line 498 · MINOR · status
- Evidence: `structures.ts` header ("erase structure: removes stone/wall/bead only; the substrate underneath was never changed, so it is restored as it was").
```text
Erase structure is P2.7's 'eraseStructure' (restores the previous substrate, never removes resources): cite tests/sim/lab-commands.test.ts in the P3.5 evidence and add nothing. All four tools are one gesture = one command and are undoable with the existing one-level undo.
```

#### W3-23 · line 502 · BLOCKER · symbol
- Evidence: `serialize.ts:256`; `commands.ts:60`; plan line 833.
```text
  - Take then Cancel restores the pre-begin state exactly, also with a save/reload in between. The stateHash equals the pre-begin hash (Cancel is host-level and also restores commands.nextSeq and commands.log), and entity rows, slots, fields and objects are identical. If Cancel is a 'sampleReturn' command instead, assert the pre-begin world's stateHash with commands.nextSeq advanced by 2.
```

#### W3-24 · line 505 · MAJOR · symbol
- Evidence: `commands.ts:57–63` queueCommand; `lab-commands.test.ts:558–584` (refused edits are proven by comparing grid and fields, not hashes).
```text
  - Transfer is atomic: one invalid destination means nothing moves and the slot is intact. Every hashed part except commands.nextSeq is unchanged: compare fields, entity rows and world.sample directly, or compare stateHash against the pre-command world with nextSeq advanced by 1.
```

#### W3-25 · line 510 · MAJOR · other
- Evidence: `serialize.ts:256`; `tests/e2e/lab-tools.spec.ts:1–58`; `host.ts` case 'save' (posts json and hash).
```text
- tests/e2e/sample-transfer.spec.ts: Lab → Tools → Sample (Life, radius 3) → preview → Confirm → Run shows the refusal message → Transfer → the dish runs. The Cancel path leaves the dish unchanged: read the worker's 'hash' reply before Begin and after Cancel through an init script that wraps Worker, as tests/e2e/lab-tools.spec.ts watchWorker/workerHash do (the app has no test hook). The two hashes are equal when Cancel is host-level and restores commands.nextSeq; if Cancel is a command, compare the grid, fields and entities of the worker's 'save' reply instead. Clean water at 50 % on a salt patch halves its salinity. Axe clean.
```

---

## Wave 4 and the module flip (lines 518–611): 1 BLOCKER, 9 MAJOR, 14 MINOR

No line in 518–611 names a schema version. The section relies on W1's columns (anchorState, anchorSeconds, anchorLockout, adhPartner, adhSeconds, adhLockout) and the adhesion link table; W4-07/W4-19 add one more column to W1's list (G1).

| ID | Line | Sev | Plan says | Actually | Replace with |
|---|---|---|---|---|---|
| W4-01 | 520 | MINOR | STATE "… Sample/Transfer/Clean water/Erase" | Erase structure has existed since P2.7 (D-0024); the W3 prompt itself reuses it. | W4-01 |
| W4-02 | 524 | MINOR | "Test through registryWith({ enabledModules: [...shipped, 'E0x'] })." | Enabled lists must be sorted ascending; `[...E01, E03, E05, 'E04']` is refused (the other six IDs happen to sort after E05). | W4-02 |
| W4-03 | 533 | MAJOR | mod-anchor-light SHARED list (no lineage or protocol file) | An E07 branch's "Game rule" lines would print the distance cost it replaces and "senses food" (`lineage.ts:530`, `strings/lineage.ts:180/182`); E04's 0.10 E/s has no honest slot in `UpkeepInspect` ("chamber" = reserve chamber), and `protocol.ts` is in no W4 list. | W4-03 |
| W4-04 | 533 | MINOR | "phenotype.ts (one branch each in the modules loop …)", "maintenance.ts (… one-line calls for E04 upkeep and for E07's cost …)" | Several edits cannot be additive: speed and sensing are computed before the modules loop, `movement.ts:307` gates on `selfPropelled`, the distance cost is `maintenance.ts:45`, and `moduleView.ts:51` is one nested ternary all four builders must extend. | W4-04: name the sanctioned edits |
| W4-05 | 535 | MINOR | "PROPOSED DECISION: support = stone, wall or porous bead; mesh arrives in Phase 5." | BUILD_DIRECTIVE P3.7 already says "beside solid substrate/bead"; whether the rim (ST_OUTSIDE) counts is undecided; gel and sediment are attachment surfaces, not support. | W4-05 |
| W4-06 | 536 | MINOR | "Anchored: speed 0 (no self-propulsion and no movement cost); … feeding and predation as ordinary." | Setting FLAG.attached would also drop anchored B06–B12 from P02's 'free' prey (`movement.ts:108`), a predation change nobody decided. | W4-06 |
| W4-07 | 537 | MAJOR | "It detaches after 10 s without intake (tick − lastIntakeTick ≥ 100)" | `lastIntakeTick` is written on any intake > 0, including diffusion traces (D-0019 counts only 1 % of the ceiling); it is −1 for introduced organisms and 0 for new daughters, so a newborn anchored after 5 s would look 10 s unfed. | W4-07 (G1) |
| W4-08 | 539 | MINOR | "Non-motile carriers (Y01, Y02) … PROPOSED DECISION: this is the literal rule; flag it for the owner." | Not open: BUILD_DIRECTIVE P3.7 states "no movement effect for non‑motile carriers". | W4-08 |
| W4-09 | 544 | MAJOR | E07 "scores reachable candidate cells … by effective light … It stays put unless … ≥ 0.01. No crowd avoidance." | SPEC §6.4 keeps the ordinary 0.5·F + 0.4·S − 0.1·C with F = effective light; D04's "no hidden crowd avoidance" does not drop the −0.1·C term. The plan drops both S and C. | W4-09 |
| W4-10 | 547 | MINOR | "an A01 carrier in a light gradient (made with shade paint) … nothing when stationary, resting or anchored" | Shade paint only gives × 0.1 steps; no Phase 3 E07 carrier can rest, anchor or be held (A01 is not E03/E04-eligible; HANDLING and TRAP are Phase 5). | W4-10 |
| W4-11 | 556 | MINOR | "src/sim/contacts.ts (a capture this tick marks the predator so its detritus request is cancelled)" | Redundant: a capture fills `mealC` in stage 5, so stage 6 already takes the meal route on the capture tick (`intake.ts:134`). | W4-11 |
| W4-12 | 556 (MISSED) | MINOR | snapshot "CUE2_DETRITUS_INTAKE" with no source | No saved per-entity state says an intake came from detritus (`route[]` is scratch; FLAG.feeding is route-blind). | W4-12 (G14) |
| W4-13 | 558 (MISSED) | MINOR | E06 "lightResponse = min(1, light/0.35) and the intake ceiling × 0.70 …" (nothing on the light reason) | The leading-constraint code picks LIGHT_LIMITED from raw light, so an E06 carrier at light 0.5 (response 1) would still be labelled "Too dark to make food." | W4-13 |
| W4-14 | 559 | MINOR | "Its movement food score is max(prey score, detritus score), never the sum." | There is no numeric prey score: pursuit of a valid prey happens before `decide()`, and `foodScore` is 0 for P01–P03. | W4-14 |
| W4-15 | 570 | MINOR | mod-builders "You own: src/sim/structures.ts …" | The Lab habitat-edit part (from line 96) must stay untouched (G6). | W4-15 |
| W4-16 | 571 | MAJOR | snapshot "CUE2_RELEASING_PROTEIN"; `moduleView.ts` edited only for the E09 broth line | Secretion is recorded once per organism per tick, without the enzyme; `moduleView` would show E01 active when only E09 released; FLAG bits 0–11 are taken and `entities.ts` is in no W4 list. | W4-16 (G14) |
| W4-17 | 577 | MINOR | C08: "with E chosen just above 35, lets E01 fire, E09 fire on the remainder, and refuses E10 … A test-only permutation … refuses a different action." | E09 fires only above 35.04, and E10 costs at most 0.004 E; only E in (35.04, 35.044] satisfies both orders. | W4-17 |
| W4-18 | 588 | MAJOR | mod-adhesion SHARED "… moduleView.ts, strings/modules.ts, snapshot.ts (CUE2_MOD_E12, CUE2_LINKED; 'links' list kind 3)" | E12's +0.01 E/s per link needs a field in `UpkeepInspect` (`protocol.ts`), which no W4 builder may edit, so tsc fails. | W4-18 |
| W4-19 | 594 | MAJOR | E12 "A member severs its own links after 10 s without intake …" | The same clock problem as W4-07. | W4-19 |
| W4-20 | 605 | BLOCKER | Flip step 1, and steps 2–6 never touch the Phase 2 tests | Unit and e2e tests pin the shipped module list, registry version 1 and the enabled marks; `npm run check` goes red at the flip. | W4-20: step 1b (G4) |
| W4-21 | 605 | MAJOR | "… bump moduleRegistryVersion 1→2, and run content-validate --write" | An enabled module needs its feature-mark frames (D-0032), and none of the seven exists; W4 tests use `registryWith`, which never runs `checkAtlas`, so this surfaces only at the flip. | W4-21: new step 1 |
| W4-22 | 606 | MINOR | "Expect currentDigest mismatches only for … FIRST_DISH_V1 (Standard) and the Standard-preset P2 and E2xx recipes." | The fenced R-G1…R-G3 variants (FIRST_DISH_V1 patches under its Standard preset) can shift too. | W4-22/23: new step 2 |
| W4-23 | 606 (MISSED) | MAJOR | Step 2 assumes the digest can describe post-flip worlds | The Preflight digest throws on non-g2 fields and non-empty post-g2 columns; after the flip an E10 gain deposits film and E04/E12 gains fill the new columns, so check (b) and `fence-update --all` would throw. | W4-22/23: new step 2 |
| W4-24 | 609 | MAJOR | "5. Rerun the experiments and variants tests and record any gate changes in docs/reports/experiments-g2.md." | A module-gain draw likely changes Standard cards and the hunters/feed comparisons, failing the wave-A golden check on the shipped registry; the plan gives no rule to protect the golden. | W4-24 |

### Wave 4 replacement text

#### W4-01 · line 520 · MINOR · status
- Evidence: `commands.ts:125` case 'eraseStructure'; `structures.ts:138` HabitatEditPayload kind 'eraseStructure'; plan line 498.
```text
STATE: '…and wave 3 (B07, B08, Y02, F02 + transport pass, enzymes/broth/breaker materials, food objects, Sample/Transfer/Clean water; Erase structure exists since P2.7) are committed on main.'
```

#### W4-02 · line 524 · MINOR · symbol
- Evidence: `registry.ts:313–319` `sortedUnique(m.enabledModules, 'enabledModules')`.
```text
Test through registryWith({ enabledModules: [...shipped, 'E0x'].sort() }).
```

#### W4-03 · line 533 · MAJOR · path
- Evidence: `lineage.ts:527–531`; `strings/lineage.ts:180`, `:182`; `moduleView.ts:68` (`return { resting: false, maintenance: …, surcharge: …, chamber: prof.upkeep }`); `protocol.ts:415–424`; `strings/modules.ts:150` "reserve chamber upkeep".
```text
Add to mod-anchor-light's SHARED list:
- src/sim/lineage.ts and src/ui/strings/lineage.ts. For an E07 profile, the summary reports its per-second move cost 0.10 × (0.5 + g)² instead of moveCostPerCell. Its 'Game rule:' line says 'moving costs {v} energy per second', and its sensing line says 'senses light up to {v} cells away'.
- src/worker/protocol.ts: additive optional fields only; UpkeepInspect gains the anchored upkeep.
- src/sim/moduleView.ts upkeepNow and src/ui/strings/modules.ts upkeepText: include 0.10 E/s while anchored, labelled as anchor upkeep, not in 'chamber'.
```

#### W4-04 · line 533 · MINOR · ownership
- Evidence: `phenotype.ts:214–221`, `:240–248`; `maintenance.ts:43–45`; `movement.ts:307`; `species.ts:88`; `moduleView.ts:51`.
```text
Name the sanctioned edits:
- phenotype.ts: the E07 baselines replace def.speed / def.sensingRadius in the speed and sensing lines (phenotype.ts:214–221), plus one activeLoci line like E03's.
- maintenance.ts: replace line 45 with a call into lightSeeker.ts that returns the identical expression for non-E07 carriers. Add E04 upkeep inside the upkeep/maint terms on lines 43–44, through a call into anchor.ts.
- movement.ts:307: the gate reads the profile's speed (bit-identical for existing species).
- Lead, before launching W4: turn moduleView.ts:51 activeNow into a switch with default false, so each builder adds one case.
```

#### W4-05 · line 535 · MINOR · other
- Evidence: `BUILD_DIRECTIVE.md:527–528`; `grid.ts:31–35` (ST_NONE 0, ST_STONE 1, ST_WALL 2, ST_BEAD 3, ST_OUTSIDE 4); SPEC lines 35, 42–44, 639.
```text
- Support = a four-neighbour cell whose grid.structure is ST_STONE, ST_WALL or ST_BEAD (BUILD_DIRECTIVE P3.7 'beside solid substrate/bead'; mesh arrives in Phase 5). Gel and sediment substrate are not support.
- PROPOSED DECISION: the dish rim (ST_OUTSIDE; SPEC §2.1 'Outside the mask is solid') counts as support. Test one rim cell.
- After 5 continuous seconds it anchors. A gap in adjacency, or E ≤ 35, resets the clock.
```

#### W4-06 · line 536 · MINOR · symbol
- Evidence: `movement.ts:108` (`if (req === PREY_FREE) return (c.flags[preySlot]! & FLAG.attached) === 0 && …`); `movement.ts:307`; `commands.ts:334` (FLAG.attached is set only for natively attached species); CT §3.2 heading and P02 row.
```text
- Anchored: speed 0 (no self-propulsion and no movement cost); +0.10 E/s upkeep; feeding and predation as ordinary.
- Record anchoring in anchorState only, and make movement.ts skip anchored carriers through it. Never set FLAG.attached, because movement.ts:307 and the PREY_FREE check at movement.ts:108 read it.
- PROPOSED DECISION (owner): an anchored carrier stays 'free' for the CT §3.2 prey rules (SPEC §9 'feeding/predation ordinary').
```

#### W4-07 · line 537 · MAJOR · symbol
- Evidence: `intake.ts:318–322`; `commands.ts:336` (−1 for introduced organisms); `births.ts:216–244` (the new daughter's lastIntakeTick is never set) and `:246–259` (the retained daughter keeps the parent's value); D-0019 first bullet; `dormancy.ts:5–6`, `:208` (stateTimer reset by FLAG.usableIntake); CT §12.6 "detach 10 s no intake"; plan line 113 (the digest asserts post-g2 columns empty).
- The column belongs in the W1 foundation's schema-4 list (G1, W1-05 note).
```text
- It detaches after 10 s without usable intake, when its support disappears (e.g. an erased stone), or at E < 15; then a 10 s reattach lockout applies. 'Usable' follows D-0019: a tick counts only when intake reaches 1 % of its ceiling (FLAG.usableIntake).
- Clock: the schema-4 foundation adds one f64 column (e.g. noUsableIntakeSeconds, COLUMNS_ADDED_IN[4], default 0).
  - It is advanced by a single call per tick for each organism carrying E04 or E12: + dt without FLAG.usableIntake, reset to 0 with it.
  - It is zero at allocation, so newborns and migrated worlds start fresh.
  - It is never written for other organisms, so Phase 2 worlds keep it empty.
  - Detach at ≥ 10 s.
- If the lead keeps lastIntakeTick instead, record a PROPOSED DECISION ('any intake > 0 counts; deviates from D-0019') and define the newborn and introduced start values.
```

#### W4-08 · line 539 · MINOR · doc-ref
- Evidence: `BUILD_DIRECTIVE.md:527–528` ("E04 Surface anchor (B01, B03–B12, Y01, Y02; attach 5 s beside solid substrate/bead, +0.10 E/s, detach/lockout rules; no movement effect for non‑motile carriers)").
```text
- Non-motile carriers (Y01, Y02) anchor as a state and pay the upkeep, but their movement is unchanged (BUILD_DIRECTIVE P3.7).
```

#### W4-09 · line 544 · MAJOR · number
- Evidence: SPEC lines 287–290 ("Score = 0.5·F + 0.4·S − 0.1·C … E07 uses effective light"); SPEC line 652 (stay unless a candidate is ≥ 0.01 brighter); D04 §5 "E07 Light seeker" (lines 117–121); `movement.ts:167–226` decide() (SCORE_FOOD·F + SCORE_SUIT·S − SCORE_CROWD·C, tiebreak at `:208`).
```text
- When Active, unheld and unattached, at each 0.5 s decision it runs the ordinary solver (movement.ts decide(): same candidates, edge-checked trace, habitat rules).
- F = effective light (world.derived.light) in the ordinary score 0.5·F + 0.4·S − 0.1·C (SPEC §6.4). The highest score wins; ties go to det(seed,'tiebreak',tick,birthId).
- If no candidate is brighter than its current cell by ≥ 0.01, it stays and does not wander (SPEC §9, D04 §5).
- The module adds no crowd avoidance beyond the ordinary −0.1·C term.
- On module loss it stays where it is.
```

#### W4-10 · line 547 · MINOR · other
- Evidence: `structures.ts:102–103` ("paint shade: light × the recorded SHADE paint factor (CT §5.1: 0.1)"); `grid.ts:103–106`; `transport.ts:257`, `:273–281` (updateDerived); `content/modules/E03.json` and `E04.json` eligibleAncestors (no A01); A02/A03/A05 are phase 5; P10 HANDLING and F03 TRAP are phase 5.
```text
- module-e07: an A01 carrier in a light gradient moves toward brighter cells only when the gain is ≥ 0.01; a 0.009 step is ignored.
  - Test setup: set grid.lightBase per cell, bump grid.geometryVersion, then call updateDerived. Shade paint only gives ×0.1 steps.
- It pays exactly 0.10 × (0.5 + g)² × dt on moving ticks and nothing on stationary or trapped ticks. Resting, anchored and held cannot occur for any Phase 3 E07 carrier; if tested at all, use labelled forced states.
- It never crosses a wall.
- The motility and sensing loci are active for carriers in phenotype, mutation and branch qualification.
```

#### W4-11 · line 556 · MINOR · status
- Evidence: `contacts.ts:93–141` consumePrey; `movement.ts:97–100` hungryPredator; MEAL_CAP_MULTIPLE 2; `intake.ts:134` (`if (sp.isPredator && c.mealC[i]! > 0) { route[i] = ROUTE_MEAL; …`).
- Replace the contacts.ts item of mod-feeding's SHARED list with:
```text
src/sim/contacts.ts: verify only. A capture puts the prey into mealC in stage 5, so stage 6 already takes the meal route on the capture tick (intake.ts:134). Add a marker only if a capture can leave mealC = 0.
```

#### W4-12 · line 556 (MISSED) · MINOR · symbol
- Evidence: `intake.ts:43` (route[] is module scratch), `:116`, `:318–324`, `:331–355`; `entities.ts:135–151`; plan line 372 ("CUE2_DETRITUS_INTAKE=4096 (E08 recorded detritus intake this second)"); SPEC §9 E08 visual.
```text
Add to mod-feeding's SHARED list: 'src/sim/entities.ts (append FLAG.detritusIntake = 1 << 13 only; no column or schema change)'. mod-builders takes 1 << 12.
- intake.ts sets the flag on a detritus-route tick with Cs > 0, and clears it with FLAG.feeding at the start of stage 6.
- snapshot.ts sets CUE2_DETRITUS_INTAKE from it.
- If the cue must cover a whole second rather than the current tick, that needs a per-second column in the schema-4 foundation instead.
```

#### W4-13 · line 558 (MISSED) · MINOR · symbol
- Evidence: `intake.ts:141` (the request is linear in light), `:144`, `:346–349`; `strings/reasons.ts:32` "Too dark to make food.", `:114–115` "Photosynthesis at {v} light."; SPEC §6.5 "E06: min(1, light/0.35) with ceiling × 0.70".
- Replace the E06 bullet (line 558) with (keep the × 0.70 out of `Profile.q`, or the usable-intake threshold at `intake.ts:322` and the lineage intake line at `lineage.ts:531` would use the scaled ceiling):
```text
- E06: on the photosynthetic route only, lightResponse = min(1, light/0.35) and the intake ceiling × 0.70 (the feeding locus applies after); the other limits still apply.
- The leading-constraint check (intake.ts:346–349) compares the carrier's light response, not raw light, with the other supplied fractions. It still reports the measured light as the value, which the Lab line prints.
- Test: at light 0.50 an E06 carrier is not LIGHT_LIMITED; at light 0.10 it is, with value 0.10, when that response (0.2857) is the smallest fraction.
```

#### W4-14 · line 559 · MINOR · symbol
- Evidence: `movement.ts:140–157` foodScore; `:311–337` predator pursuit; `content/species/P01.json` foodPriority [].
- Replace the movement sentence of the E08 bullet with:
```text
Movement: for E08 carriers, foodScore returns max(existing F, avail(detritus)), never a sum. Pursuit of a valid prey keeps priority, which is how SPEC §6.4's 'max(prey, detritus)' applies here. Test both cases:
- with detritus in view and no prey, it moves to detritus
- with a prey in range, it still pursues
```

#### W4-15 · line 570 · MINOR · ownership
- Evidence: `structures.ts:73` stageStructures, `:96–97` ("// Lab habitat edits …"), `:278` applyHabitatEdit; `git grep sim/structures HEAD` → `lab-commands.test.ts`, `deposit-bounds.test.ts`; plan line 236. (Line 95 is blank; the stage-8 code ends at 94.)
```text
You own: src/sim/structures.ts, but only its stage 8 part (lines 1–95 at HEAD). Leave the P2.7 Lab habitat-edit section from line 96 untouched: applyHabitatEdit, sealing, LAB_MAX_* and shadeFactor. …
```

#### W4-16 · line 571 · MAJOR · symbol
- Evidence: `moduleView.ts:51` (`const activeNow = id === 'E01' ? c.secreting[i] === 1 : …`); `structures.ts:78–91`; `strings/modules.ts:115` "Releasing enzyme right now."; `entities.ts` FLAG … `usableIntake = 1 << 11`.
```text
Add to mod-builders' SHARED list: 'src/sim/entities.ts (append FLAG.secretingProtein = 1 << 12 only; no column or schema change)'. Fix the bit numbers now, together with mod-feeding's detritus bit (1 << 13), so the two builders do not collide.

Alternatively, make c.secreting a bit set (1 starch, 2 oil, 4 protein). Starch stays 1, so g2 hashes are unchanged.

Then set CUE2_RELEASING_PROTEIN from the protein bit, and make moduleView activeNow for E01 and E09 read their own bit.
```

#### W4-17 · line 577 · MINOR · number
- Evidence: E01/E09 emitCost 0.4, minEnergy 35; E10 rate 0.02, energyPerCarbon 2; `structures.ts:59–64` checks `c.E[i]! <= rules.minEnergy` before paying emitCost × DT; `module-accounting.test.ts:290` `step(w, { afterStage })`.
- Replace the C08 sentence of line 577 from "a B04 carrying E01 + E09 + E10" on with:
```text
… a B04 carrying E01 + E09 + E10, with starch and protein beside it, B > 1.2 B0' + 0.002 and film ≤ 0.498. Energy entering stage 8 is set with step's afterStage hook at stage 7 (labelled test state) to 35.042.
- Order E01, E09, E10: E01 fires (35.002 left), E09 fires (34.962), and E10 is refused with its energy reason.
- Test-only order E10, E01, E09: E10 reserves 0.004 (35.038), E01 fires (34.998), and E09 is refused.
Nothing is double-spent, and Σ energy spent = Σ ledger categories, including construction.
```

#### W4-18 · line 588 · MAJOR · path
- Evidence: `protocol.ts:396` (`readonly upkeep: UpkeepInspect`), `:415–424`; `moduleView.ts:64–68`; `strings/modules.ts:145–152`; `strings/reasons.ts:76` ("Linked to its colony.").
```text
SHARED (additive): …
- src/worker/protocol.ts: additive optional fields only. UpkeepInspect gains the link upkeep; add an EntityInspect link count only if a line needs it.
- src/sim/moduleView.ts: upkeepNow adds 0.01 E/s × incident links
- src/ui/strings/modules.ts: upkeepText and the E12 text
- src/worker/snapshot.ts: CUE2_MOD_E12, CUE2_LINKED; 'links' list kind 3
…
```

#### W4-19 · line 594 · MAJOR · symbol
- Evidence: `intake.ts:318–322`; `commands.ts:336`; `births.ts:216–244`; D-0019; CT §12.6 "sever 10 s no intake".
```text
- A member severs its own links after 10 s without usable intake. This uses the same D-0019 clock as E04 (one column, advanced once per tick for E04/E12 carriers).
- It also severs them at E < 15, on entering dormancy, when captured or held, on module loss, and on death, division, sampling, or forced separation > 0.75 cells.
- Severed survivors have a 10 s relink lockout.
```

#### W4-20 · line 605 · BLOCKER · status
- Evidence (re-checked at HEAD): `modules.test.ts:47` (`toEqual(['E01','E03','E05'])`), `:56` per-ancestor lists, `:62`, `:98–99`, `:117`/`:122` (edited registry → ['E03','E05']); `module-accounting.test.ts:128–130`; `registry-imports.test.ts:196` (the "changed build" uses moduleRegistryVersion 2), `:226`, `:228–231`, `:244–248`, `:265–269`; `founders.test.ts:188–192`; `founders-newdish.test.ts:90–95`, `:145–149`; `atlas.test.ts:45` (`marks = enabledMarks(reg)`), `:134–138`, `:142`, `:197`; `new-dish.spec.ts:93`, `:134`. (G4 has the merged list; g2-close edits `new-dish.spec.ts` only near 247–252.)
- Insert after flip step 1:
```text
1b. Update the Phase 2 tests that pin the shipped registry. All of them fail after the flip:
- tests/sim/modules.test.ts:47, 51, 56, 62, 98–99, 117, 119, 122
- tests/fixtures/module-accounting.test.ts:128–130
- tests/fixtures/registry-imports.test.ts:196 (make its 'changed build' version 3), 226, 229–231, 245–247, 265–269
- tests/sim/founders.test.ts:188–192
- tests/sim/founders-newdish.test.ts:90–95, 146–149
- tests/content/atlas.test.ts:134–138, 142, 197. The enabled marks become the ten visualLayers. Each needs a FEATURE_FRAMES entry, or line 142 must accept an unlisted layer's 1-frame minimum.
- tests/e2e/new-dish.spec.ts:93, 134

Where a test's subject is Phase 2 behaviour, pin it to registryWith(G2_LISTS). Otherwise update it to the new values:
- A01: E05 E06 E07
- B01: E01 E03 E04 E05 E10 E12
- B04: E01 E03 E04 E05 E09 E10 E12
- B06: E03 E04 E05 E10 E12
- P01: E05 E08
- registry version 2; '10 of 17 abilities'

The accelerated seed-101 FIRST_DISH_V1 tests (lineage-panel, lineage-host, branch-evidence, strip-names, e2e lineage.spec) now follow new trajectories. Run npm run check and the full Playwright suite before ticking P3.7.
```

#### W4-21 · line 605 · MAJOR · symbol
- Evidence: `tools/content-validate.ts:84–91` FEATURE_FRAMES, `:101–103` enabledMarks, `:216–225` ("enabled module … has no feature mark in the atlas (run npm run art:build)"), `:310–318` (hash written only if errors === 0); `public/atlas/manifest.json` features → starch_notch, reserve_pocket, resting_seam; the modules' visualLayer ids; plan line 380 ("Adhesion link pixels drawn between member positions").
- Replace flip step 1 with:
```text
1. First confirm that public/atlas/manifest.json `features` lists anchor_foot, shade_patch, light_trail, debris_granule, protein_notches, matrix_edge and adhesion_link. These are the modules' content visualLayer ids, delivered by W2 art-features. Per D-0032, checkAtlas, art:build and tests/content/atlas.test.ts refuse an enabled module without its mark. Then:
- add E04, E06, E07, E08, E09, E10 and E12 to `enabledModules`
- bump `moduleRegistryVersion` 1→2
- run `npx tsx tools/content-validate.ts --write`. It writes the contentHash only with zero errors.
- run `npm run art:build -- --check`
```

#### W4-22 and W4-23 · line 606 · MINOR + MAJOR · merged
- Evidence: `content/variants/R-G1`, `R-G2` (patchSet) and `R-G3` (patchMove), sourceId FIRST_DISH_V1; plan line 127; plan lines 109–113 (Preflight step 2); `fields.ts:102–103`; `content/modules/E10.json` eligibleAncestors B01, B04, B06 and params; plan line 190; `mutation.ts:37` (Standard module rate 0.002) and `:153–160`.
- Replace flip step 2 with (merged from both rows). If the Preflight already built P-17's `'full'` mode, drop the first paragraph: check (b) already uses `trajectoryDigest(world, 'full')`.
```text
2. Before running the fence, change trajectoryDigest (preflight step 2):
- Its emptiness assertions apply only in check (a) (registryWith(G2_LISTS)).
- In check (b) it also hashes post-g2 state: every allocated field including film/filmN, the anchor/adhesion/usable-intake columns, the link tables, objects and the sample slot.
Otherwise film from an E10 carrier, or anchor/link state from an E04/E12 carrier, makes check (b) and fence-update --all throw.

Then run the fence. Expect currentDigest mismatches only for recipes with module rate > 0 whose species gained options, and only where a module-gain draw fires within the fence horizon: FIRST_DISH_V1 (Standard), its R-G1…R-G3 variant entries, and the Standard-preset P2 and E2xx recipes. Fixed Traits recipes must be unchanged.
```

#### W4-24 · line 609 · MAJOR · status
- Evidence: `tests/experiments/helpers.ts:10–13` and runCard → `runExperiment(registry(), id)`; `tests/sim/comparison.test.ts:23` `REG = registry()`; `golden.ts:8–11` (EXP_101 E01 gain); `rng.ts:93–96` `detInt = Math.floor(detFloat × n)`; `mutation.ts:153–160`; golden cards EXP_101/102/103/106/A/B and comparisons feed, hunters (FIRST_DISH_V1) and starch (STARCH_UNLOCK_V1, Fixed). Moot if the Preflight already runs the goldens under `registryWith(G2_LISTS)` (G4).
```text
5. Rerun tests/experiments/* and tests/sim/comparison.test.ts.
- Keep the wave A proof: compute the results passed to expectWaveANumbers / expectWaveAComparison under registryWith(G2_LISTS), as fence check (a) does. Never rewrite golden/wave-a-measurements.json.
- Record the shipped-manifest gate and measurement changes in docs/reports/experiments-g2.md: EXP_101/102/103/106/B and the hunters and feed comparisons.
```

---

## Wave 5 (lines 612–716): 0 BLOCKER, 8 MAJOR, 15 MINOR

No line in 612–716 names a schema version.

| ID | Line | Sev | Plan says | Actually | Replace with |
|---|---|---|---|---|---|
| W5-01 | 622 | MAJOR | field-guide owns "content/structures/STONE.json, WALL.json, BEAD.json and content/tools/*.json (new …)" | The three structure records exist (`b17aa5b`, D-0024/D-0028); the Lab tray reads them and tests pin them. Only `content/tools/` is new. | W5-01 |
| W5-02 | 622 (MISSED) | MINOR | "content/tools/*.json (new …)" with a new ToolSchema | ARCH §2's content layout and ARCH §4's schema list have no tools pack; a new content type and contentHash input is not marked as a decision. | W5-02 |
| W5-03 | 623 | MAJOR | "src/sim/content/{schema,registry}.ts (StructureSchema and ToolSchema; …), tools/lib/content-fs.ts and src/sim/content/raw-vite.ts (load the new directories)" | StructureSchema, its registry checks and its loaders exist; a 'tools' collection is missing everywhere. Save import validates embedded species/modules/materials/habitat/manifest with the current schemas, so a required new field would make every older save fail to import. | W5-03 |
| W5-04 | 623 | MINOR | "src/ui/app/App.tsx (route 'guide'), src/ui/views/Home.tsx, src/ui/panels/MoreSheet.tsx" | The route, both buttons and pause-on-leave exist; App.tsx renders a placeholder; nothing restores the dish speed on the way back. | W5-04 |
| W5-05 | 623 | MAJOR | "a query returning the relationships observed in the current dish, derived from recorded events: consumption by food, predation pairs, infection, parasite attachment, conversion …, film digestion" | Events record captures and, after W3, lysis and drain deaths; nothing records intake by food, the moment of infection or attachment, or conversions ('conversion' is declared but never emitted); the ring keeps 500. Badges (line 638) and the e2e step (line 639) depend on the same data. | W5-05 |
| W5-06 | 632 | MINOR | "A material's guide.rules says 'No additional modeled reaction.' unless guideRules lists the reaction it takes part in." | Only SUGAR, NUTRIENT and DEBRIS lack the sentence; W1's content test keeps its own exceptions list; `registryWith(G2_LISTS)` re-validates with the new rule, so the g2 foods must pass it too. | W5-06 |
| W5-07 | 634 | MAJOR | "the local journal stores it with the dish, sim time and event id" | `JOURNAL_KINDS` allows only 'experimentStamp' and 'observation' (the player's own note); dish entries are saved with the dish (D-0031), autosave, and count against 200-entry caps that evict the oldest; this also conflicts with risk 22 ("not in saves"). | W5-07 (G11) |
| W5-08 | 637 | MAJOR | "Derived predator, prey and host lists equal CT §3.2–3.3 filtered to enabled species." | No oracle exists: `tests/helpers/tables.ts` parses only CT §1.2–1.3, cannot read "ID Name" rows, and belongs to g3-fixtures this wave. | W5-08 |
| W5-09 | 647 | MAJOR | "src/sim/experiments.ts (grammar additions such as infections.<species>, limitSeconds.<REASON>.<species>, transfer.fungal)" | The grammar and ArmObserver live in `src/sim/pairedRun.ts` (D-0027); `experimentProblems` rejects unknown ids; existing three-part ids put the species first (`deaths.SP.CAUSE`). | W5-09 |
| W5-10 | 647 | MINOR | experiments-curated SHARED list (recipes, schema, experiments, rng, NewDish, fence.json) | Missing: founder validation in `registry.ts`, `recipeGrid` in `variants.ts`, `host.ts` and `strings/experiments.ts` for player steps; no e2e spec for its New Dish edit. | W5-10 |
| W5-11 | 648 | MAJOR | founder extensions (placement, cells, initial, links); L306 "r 8 gel patch", EXP_212 "gel" | No recipe can paint gel: a patch's substrate only filters cells (a 'gel' patch on Water Garden covers 0 cells); scheduled paints run after the founders; What if? validation uses `habitatGrid()`. | W5-11: recipe 'ops' |
| W5-12 | 649 | MINOR | "'scatter' (… drawn with det(seed,'founder.place',founderIndex,k))" | Independent draws can pick one cell twice; STREAMS has no founder.place; `detPermutation` already exists. | W5-12 |
| W5-13 | 651 | MINOR | "An optional labelled 'initial' override {B, N, E}, shown as 'labelled setup'" | `RecipeSchema.testOnlyOverrides` exists but is unused, and SPEC §13.1 keeps test overrides out of play; `introduceOrganism` already logs B0 and 0.10·B0 N, so the difference needs its own input; energy is not a material. | W5-13 |
| W5-14 | 654 | MINOR | "Gate: B01 records OXYGEN_LIMITED and B03 records a different O2 limitation (SUIT_OXYGEN_HIGH)." | OXYGEN_LIMITED is stored in `limitCode`; SUIT_OXYGEN_HIGH is computed only by `suitabilityAt()`; CT §10.1's in-app evidence needs player steps the enum lacks. | W5-14 |
| W5-15 | 656 | MAJOR | "EXP_212 … gel; four linked F02 at (60–63,64) … no food; runs 10 s." | GEL_COLONY's water channel holds exactly those cells, and Water Garden has no gel, so attached F02 founders throw RecipeError; CT §10.3 says Water Garden without stones; its sugar 0.02 is F02 food. | W5-15 |
| W5-16 | 657 | MINOR | "Build the curated dishes (Water Garden defaults elsewhere, lid open, fixed light 0.8, scatter placement, …)"; NewDish "curated dishes in the Basics picker" | CT §9.3 gives no preset; NewDish uses a random seed and records overrides, so a curated dish would be recorded as a custom dish; its summary names seeded modules only for Diverse. | W5-16 |
| W5-17 | 664 | MINOR | "tests/recipes/curated.test.ts: … modules only on the labelled founders …" | L303 and L304 are Diverse (D-0030): unlabelled founders draw modules at creation by design. | W5-17 |
| W5-18 | 671 (MISSED) | MINOR | g3-fixtures: "tests/helpers/tables.ts (reads CT from the doc; use it as the oracle)" | It parses only §1.2–1.3; §3.1/§3.5 are prose, §3.2/§3.3 rows start "ID Name", §3.4 by field name, §7.1 by E-ID. | W5-18 |
| W5-19 | 692 | MINOR | "ESLint allows Math.random only in src/render and src/audio, for cosmetics." | ESLint's determinism rules apply only to `src/sim/**`; nothing lints `src/audio` imports. | W5-19 |
| W5-20 | 694 | MINOR | "one line at each cue call site: … wake transition → wake; placement accepted → drop; placement rejected → placement_error" | 'wake' never reaches snapshots; Lab edits go through `sendLabCommand`; `src/audio` cannot import the LIFE_* codes; ARCH and UX cue ids differ; "card open" is ambiguous. | W5-20 |
| W5-21 | 699 | MINOR | "quiet audio (effects −12 dB, ambient off)"; defaults 0.7 / 0.4 / 0.8 (line 694) | No canonical doc gives these numbers. | W5-21 |
| W5-22 | 701 (MISSED) | MINOR | "Haptics … via feature-detected navigator.vibrate, off by default. PROPOSED DECISION: no new dependency." | The Android WebView vibrates only with the VIBRATE permission; `AndroidManifest.xml` declares only INTERNET. | W5-22 |
| W5-23 | 709 | MINOR | "The Settings UI is keyboard accessible, axe clean, and works at 200 % text." | The audio builder owns no e2e spec to prove it. | W5-23 |

### Wave 5 replacement text

#### W5-01 · line 622 · MAJOR · status
- Evidence: `git ls-tree -r --name-only HEAD content/structures` → BEAD.json, STONE.json, WALL.json; `git log -- content/structures` → `b17aa5b` only; `LabTray.tsx:213–227` (place: purpose/changes/unchanged/watch); `view-switch.test.ts:351–363` (trayItems('tools') and itemCopy('place:wall') = WALL.guide.summary/rules/example); `lab-commands.test.ts:876–906` (structure-record validation).
```text
You own: … content/tools/*.json (new: SAMPLE, TRANSFER, CLEAN_WATER, ERASE_STRUCTURE, SNAPSHOT, DUPLICATE, COMPARE, UNDO, OVERLAYS, INSPECT — each with guide {summary, biology, rules, example} plus changes / doesNotChange / watchFor). content/structures/{STONE,WALL,BEAD}.json already exist (b17aa5b; Structure records per D-0024/D-0028). The Lab tray reads them and tests/sim/view-switch.test.ts and tests/sim/lab-commands.test.ts pin them. Treat them as SHARED: edit them additively only and never recreate them. For the guide's structure entries, use the tray's mapping so guide and tray agree: Changes = guide.rules, Does not change = BRUSH_COPY.place.sealedUnchanged / beadUnchanged (src/ui/strings/lab.ts), Watch for = guide.example.
```
- Note: W3 tools-sample creates `src/ui/strings/tools.ts` (Sample/Transfer/Clean water tray copy); the tool records should move that copy, not rewrite it.

#### W5-02 · line 622 (MISSED) · MINOR · doc-ref
- Evidence: `docs/ARCHITECTURE.md:27–30` (content/ layout), `:71–99` (schemas: Species, Material, Module, Habitat, Structure, Recipe, Experiment, Variant, Objective, Manifest); CLAUDE.md "Content is data".
```text
… content/tools/*.json (new). PROPOSED DECISION: a 'tools' content pack beside ARCH §2's structures/, validated by a new ToolSchema and included in contentHash, so tool texts are data. Report it for DECISIONS and for ARCH §2/§4 …
```
- Note: every tool record needs GuideSchema's "biology" text; for UNDO, SNAPSHOT and COMPARE decide between an honest real-lab analogue and a stated "game tool" line (G17 #22).

#### W5-03 · line 623 · MAJOR · symbol
- Evidence: `schema.ts:127` StructureSchema, `:60` GuideSchema, `:355–375` ManifestSchema (enabledStructures optional); `registry.ts:42–54` RawPacks, `:168` `structures: col(raw.structures)`, `:201` parseCollection(raw.structures…), `:368–376` enabledStructures checks; `tools/lib/content-fs.ts:38` and `src/sim/content/raw-vite.ts:35` load structures; `saveFile.ts:264–281` safeParse of c.manifest/species/modules/materials/habitat; `world.ts:44–58` WorldContent has no structures.
```text
SHARED (additive): src/sim/content/schema.ts gets a new ToolSchema: a Structure-style record plus changes/doesNotChange/watchFor. StructureSchema already exists, so give it optional new fields at most. src/sim/content/registry.ts gets a 'tools' collection in RawPacks, contentHashInput, validateContent and ContentRegistry. An enabled tool is one with phase ≤ buildPhase. Add no manifest list, or only an optional one like enabledStructures (D-0028). In tools/lib/content-fs.ts and src/sim/content/raw-vite.ts, add content/tools only; structures already load. Never add required fields to GuideSchema, SpeciesSchema, MaterialSchema, ModuleSchema, HabitatSchema or ManifestSchema, because src/persistence/saveFile.ts:264-281 validates every saved world's embedded content with them. Run content-validate --write, because tests/content/validator.test.ts checks contentHash.
```

#### W5-04 · line 623 · MINOR · status
- Evidence: `state.ts:28` (`| { readonly name: 'guide' }`); `App.tsx:48–49` (case 'guide' → `<SimplePage title="Field Guide" …/>`); `Home.tsx:72` and `MoreSheet.tsx:111` set route {name: 'guide'}; `state.ts:547–556` (setSpeed(dishId, 0) when the route is not 'dish'); `SimplePage.tsx:12` (Back → home); `AdvancedEvolution.tsx:35` newDishReturn {dishId, speed}.
```text
src/ui/app/App.tsx: replace the placeholder `case 'guide'` SimplePage with the FieldGuide view. The route {name:'guide'} (state.ts:28) and the Home (Home.tsx:72) and More (MoreSheet.tsx:111) buttons already exist, and leaving the dish already pauses it (state.ts:547-556). Add only the restore: when More opens the guide, record {dishId, speed} before changing the route (as newDishReturn does in src/ui/panels/AdvancedEvolution.tsx:35/242). The guide's Back then returns to the dish at that speed; opened from Home, Back returns Home.
```

#### W5-05 · line 623 · MAJOR · status
- Evidence: `git grep -n 'emit(world.events' HEAD -- src/sim` → births.ts:302,319; branches.ts:233,319,393,475; commands.ts:137,354; contacts.ts:117 (capture, detail {prey, preySpecies}),126; dormancy.ts:231,263; maintenance.ts:140 (death); `intake.ts:323` milestone 'firstIntake'; `conversion.ts:80` milestone `firstConversion:${name}`; `events.ts:7–24`; `reasons.ts:84–85`; `constants.ts:118` EVENT_RING_SIZE 500; plan lines 447, 472, 592, 411.
- Replace the relationships-query item of line 623 with the text below. It reuses "the per-food split W3 builds for intake.<species>.<food>"; if W3 follows W3-03 and builds no per-food family, the watcher computes the split itself.
```text
src/worker/{protocol,host,client}.ts: add a query returning the relationships seen in the current dish. Recorded events cover only part of this. Predation pairs are 'capture' events (detail.preySpecies, a species index). After W3, lysis and parasite-drain deaths are 'death' events with cause DEATH_LYSIS / DEATH_PARASITE_DRAIN. The ring keeps the last 500. Record the rest with an observation-only watcher on the open dish in src/worker/host.ts, built like ArmObserver/stepObserved in src/sim/pairedRun.ts: step(world, { afterStage }) plus an after-tick pass over new ring events. It notes: the first tick of each (species, food) intake, including film (reuse the per-food split W3 builds for intake.<species>.<food>, plan line 411); each new infection (infectedBy/infectionTimer); each parasite attachment (hostBirthId/parasiteBirthId); and each conversion (world.conversionTotals deltas, with W3's producer provenance). The first-seen table is worker state: it stays outside hashed state, is never saved, and the sim never reads it. Add new sim events only with lead approval. Events and nextEventId are outside stateHash, but check the trajectory digest's counters. Line 638 then reads: badges derive only from these recorded observations and never write to a world.
```

#### W5-06 · line 632 · MINOR · other
- Evidence: `git show HEAD:content/materials/{SUGAR,NUTRIENT,DEBRIS}.json` guide.rules lack the sentence (all 29 other material records have it); plan line 218; `lab-commands.test.ts:1014–1023` (NUTRIENT rules contain "Nutrient alone is not food: it adds no carbon or energy.", name no organism); `tests/content/debris-text.test.ts:47–59` (DEBRIS example only).
```text
- A material's guide.rules says 'No additional modeled reaction.' unless src/sim/content/guideRules.ts lists a reaction it takes part in. At HEAD only SUGAR, NUTRIENT and DEBRIS lack the sentence. Either list their reactions in guideRules.ts or append the sentence to their rules; otherwise the shipped registry and registryWith(G2_LISTS) fail. Appending is a guide-text defect edit the plan allows. The tests pin only NUTRIENT's 'Nutrient alone is not food: it adds no carbon or energy.' with no organism names (tests/sim/lab-commands.test.ts:1014-1023) and the DEBRIS example (tests/content/debris-text.test.ts). Replace the explicit exceptions list of W1's content test (plan line 218; W1 should name its file) with an import from guideRules.ts, so there is one list.
```

#### W5-07 · line 634 · MAJOR · status
- Evidence: `history.ts:369` (`const JOURNAL_KINDS = ['experimentStamp', 'observation'];`), `:464–481` journalRecordProblem, `:490–497` putJournalEntry (`[entry, ...list].slice(0, DISH_JOURNAL_MAX)`); `journal.ts:96–118` JournalObservationEntry ("an observed relationship, in the player's words"), `:199–208` addFirst evicts one, `:245`/`:326` sink; `state.ts:1206–1214` keepJournalWithDish → journalPut → autosave; D-0031 "recording one autosaves".
- G11 option (b); W6-24 must say the same.
```text
- Seen in your dishes: the first time a dish shows a relationship ('Recycler consumed debris', …), store {relationshipId, dishName, worldId, second, eventId?} in a separate device-local store owned by src/ui/badges.ts (for example localStorage 'pixelmeba.seen', with every read and write wrapped in try/catch). Do not store it as a Journal entry. JOURNAL_KINDS in src/sim/history.ts:369 allows only 'experimentStamp' and 'observation', 'observation' is the player's own note, and dish entries count against the 200-entry caps and trigger autosaves. The guide entry shows 'Seen in your dishes' from this store. PROPOSED DECISION: if the owner wants these in the Notebook Journal, list src/sim/history.ts (a new kind plus its validator) and src/ui/views/NotebookJournal.tsx as SHARED, and keep these entries out of saves and out of the 200-entry eviction.
```

#### W5-08 · line 637 · MAJOR · ownership
- Evidence: `git show HEAD:tests/helpers/tables.ts` → exports profileTable, movementTable; rows() filter `/^\|\s*[BYFAPXV][0-9]{2}\s*\|/`; `CONTENT_TABLES.md:175–197`; plan line 672 ("tests/helpers/tables.ts (additive parsers)", owned by g3-fixtures).
```text
Derived predator, prey and host lists equal CT §3.2–3.3 filtered to enabled species. Parse them from docs/CONTENT_TABLES.md inside tests/content/guide.test.ts. Do not edit tests/helpers/tables.ts: it has only profileTable/movementTable and belongs to g3-fixtures in this wave. Expand ranges such as 'B06–B12', 'B01–B05' and 'B06–B13'. Keep the 'free' and 'while in sediment' qualifiers. Ignore parenthetical notes such as '(never attached B02)'.
```

#### W5-09 · line 647 · MAJOR · path
- Evidence: `pairedRun.ts:19–40` ("Measurement ids (parseMeasure …)"), `:61–89` SCALAR_MEASURES/SPECIES_MEASURES, `:118` parseMeasure, `:222` ArmObserver, `:483` stepObserved; `experiments.ts:65–84` re-exports them from './pairedRun'; `:229–231` measureOk → parseMeasure → bad(path, ref); D-0027.
- Replace the experiments.ts item of line 647 with:
```text
src/sim/pairedRun.ts holds the measurement grammar and ArmObserver since D-0027; src/sim/experiments.ts only re-exports them. Add there: infections.SP; limitSeconds.SP.REASON (species first, like deaths.SP.CAUSE); transfer.fungal; and a whole-unit presence measure for EXP_105's non-vacuity clause. All of these are observation only. The comparison engine shares the observer, so compute the new tallies only when a card measures them.
```

#### W5-10 · line 647 · MINOR · ownership
- Evidence: `registry.ts:260–277` validates recipe founders (unknown species/modules, moduleSetProblem); `variants.ts:120–122` recipeGrid; `host.ts:796–818` notes player steps; `strings/experiments.ts:303` playerStepText; plan line 646 owns no tests/e2e file.
```text
Add to SHARED:
- src/sim/content/registry.ts: founder validation beside the recipe loop (:260-277). 'cells' must be inside the mask and distinct; links 'chain' only for four-adjacent F02; 'initial' finite and ≥ 0; recipe 'ops' rect bounds valid.
- src/sim/variants.ts: recipeGrid includes the recipe ops.
- src/worker/host.ts and src/ui/strings/experiments.ts: only for new player steps.
Add to owned files: tests/e2e/curated-dishes.spec.ts (new). It checks that New Dish → a curated dish shows its question and the 'Pre-seeded genomes' label, that the screen is axe clean, and that 200 % text works.
```

#### W5-11 · line 648 · MAJOR · other
- Evidence: `schema.ts:195–202` FieldPatchSchema {…, substrate: HabitatKind.default('water')}; `:229–251` RecipeSchema (no ops); `recipes.ts:100–129` applyHabitat (ops, then structure cells zeroed, geometryVersion++), `:135–139` validPatchCells keeps only cells of the patch substrate, `:229–264` patches, `:266–302` founders; `variants.ts:120–122` recipeGrid = habitatGrid(habitat, {removeStones}); `structures.ts:214` (invalid radius); D-0024 (brush radius 1, 3 or 6).
- Replace line 648 (the three "- placement …; - cells …; - initial …; - links …" items keep their lines 649–652 as corrected by W5-12 and W5-13):
```text
Build recipe and founder extensions (PROPOSED DECISIONS; the defaults keep every existing recipe bit-identical): - an optional recipe-level 'ops' list using the habitat GeometryOpSchema, default []. Apply it in the habitat step right after the habitat's own ops, under the same rules as applyHabitat: structure cells hold no inventory, and geometryVersion bumps once. This runs before background overrides, patches and founders. Also include it in habitatGrid()/recipeGrid() (src/sim/variants.ts:120), so What if? validation and previews see the same grid. Validate rect bounds in src/sim/content/registry.ts, as for habitats. L306 uses {op:'disk', center:[64,64], radius:8, substrate:'gel'} and gives its field patch substrate 'gel'; - placement …; - cells …; - initial …; - links …
```

#### W5-12 · line 649 · MINOR · other
- Evidence: `rng.ts:9–24` STREAMS (decide … inoculate; no founder.place), `:105–114` `detPermutation(n, seed, stream, ...keys)`; `recipes.ts:267–289` (the eligible list: diskCells row-major, inMask, canOccupy, used[], then the nearest-first sort).
- The W6 checker notes STREAMS already has 'placement', 'jitter' and 'inoculate', so a KIND key on an existing stream (PRE's preference) is an alternative to a new stream (G17 #23).
```text
'scatter' (D04 §8): take the realizer's eligible cells (inMask, canOccupy, unused; row-major, before the nearest-first sort) and use the first `count` of detPermutation(eligible.length, world.seed, STREAMS.founderPlace, founderIndex). Add `founderPlace: 'founder.place'` to STREAMS in src/sim/rng.ts (append only).
```

#### W5-13 · line 651 · MINOR · symbol
- Evidence: `schema.ts:246` testOnlyOverrides; `git grep testOnlyOverrides HEAD` → only `schema.ts:246`; `commands.ts:328–343` (B = b0, N = 0.1·b0, E = INITIAL_ENERGY, recordInput(`introduce:${source}`, b0, 0.1·b0, mineral)); `ledger.ts:70` recordInput(world, source, c, n, m); SPEC §13.1 "Test‑only overrides are disclosed … never available in ordinary sandbox".
- The W6 checker suggested `testOnlyOverrides` could carry this; the W5 checker rules that out for player dishes (SPEC §13.1). `FounderSchema.moduleAssignment` 'alternate-odd'/'alternate-even' already realizes L306's "E10 on 20, none on 20".
```text
- An optional labelled founder 'initial' {B, N, E}. This is not the unused RecipeSchema.testOnlyOverrides, which SPEC §13.1 keeps out of ordinary play. It is shown as 'labelled setup'. introduceOrganism already logs B0 and 0.10·B0 N as 'introduce:recipe:<id>'. Log the B and N difference from that start as a separate labelled input, e.g. recordInput(world, 'recipe:<id>:initial', ΔB, ΔN). Energy is not a material: record an E other than 50 in world.ledger.energy, not as an input.
```

#### W5-14 · line 654 · MINOR · other
- Evidence: `entities.ts:63` ['limitCode','u16']; `intake.ts:343` R.OXYGEN_LIMITED; `suitability.ts:58` suitabilityAt(), `:95` reason = R.SUIT_OXYGEN_HIGH; `schema.ts:294` playerSteps enum = inspectFoodUse / openResourceHistory / viewComparison / viewPreyHistory; `experiments.ts:175` PAIRED_STEPS, `:257` paired check, `:714` inspectShowsFoodUse; `host.ts:812–818` experimentSteps; `strings/experiments.ts:303–315` playerStepText; CT §10.1 rows 104/105. Neither CT nor the plan gives stoppingSeconds for EXP_104/105 (EXP_103 uses 180 s).
- Replace the EXP_104 gate sentence with:
```text
Gate: limitSeconds.B01.OXYGEN_LIMITED > 0 (read from the limitCode column) and limitSeconds.B03.SUIT_OXYGEN_HIGH > 0 (computed each tick with suitabilityAt(), since no column holds it). CT §10.1's in-app evidence ('both species inspected with different O2 limitations', 'B01 infection observed') needs player steps. Add each step to: ExperimentCompletionSchema.playerSteps (src/sim/content/schema.ts:294; single-arm steps stay out of PAIRED_STEPS, src/sim/experiments.ts:175); a read-only check beside inspectShowsFoodUse (src/sim/experiments.ts:714); the note call in experimentSteps (src/worker/host.ts:812-818, SHARED); and a case in playerStepText (src/ui/strings/experiments.ts:303, an exhaustive switch). Otherwise record in DECISIONS why these cards have no player steps.
```

#### W5-15 · line 656 · MAJOR · other
- Evidence: CT §8.1 "GEL_COLONY | Gel Colony | gel; water channel x 59–68 (all y)" and "WATER_GARDEN … sugar 0.02"; `content/species/F02.json` attachment.surfaces [gel, sediment, mesh, bead], foodPriority [sugar, detritus], b0 2; `recipes.ts:284–286` RecipeError ("only N valid cells"); CT §10.3 header and row E212; CT §9.1 FIRST_DISH_V1 "background sugar 0 (override)".
```text
- EXP_212 Fungal supply line (seed 212): WATER_GARDEN with removeStones true (CT §10.3) and backgroundOverrides {sugar: 0}, because Water Garden's background sugar 0.02 is F02 food and CT says 'no food'. Add a recipe 'ops' gel area around the chain, e.g. {op:'rect', x0:56, x1:67, y0:60, y1:68, substrate:'gel'}. Never use GEL_COLONY: its water channel x 59–68 holds exactly these cells. Place four F02 at explicit 'cells' [[60,64],[61,64],[62,64],[63,64]], with 'links': 'chain' and 'initial' B = 4, 2, 2, 2 (N = 0.10 B), E 50. No food; stoppingSeconds 10. Gate on the donor/receiver transfer ledger.
```

#### W5-16 · line 657 · MINOR · other
- Evidence: `NewDish.tsx:30` (`const RECIPE_ID = 'FIRST_DISH_V1'`), `:33–36` randomSeed(), `:62–73` ('present at creation' only when founderMode === 'diverse'); `state.ts:444–457` startCustom passes seed/mutationPreset/founderMode, `:465` startRecipe(recipeId, name); `host.ts:1149–1157` recipeProvenance, `:1198–1203` isAuthoredRecipe; CT §9.3 "Seed = recipe number (301…306)". (g2-close is editing NewDish.tsx, state.ts and host.ts; re-check lines.) CT §9.3's IDs are L301/L303/L304/L306, while the plan's file names become recipe ids: use the CT IDs or record the mapping (G17 #24).
- Replace the curated-dish settings line (657) with:
```text
Build the curated dishes with these settings:
- Water Garden defaults elsewhere, including its stones and background sugar 0.02.
- Lid open; fixed light 0.8.
- mutationPreset 'standard', because CT §9.3 is silent (logged in DECISIONS).
- Scatter placement.
- Each dish shows its question, and seeded modules are labelled 'present at creation'.
In New Dish, picking a curated dish sets the seed field to its recipe seed (301…306) and its preset and founder mode to the recipe's, so the dish is recorded as the authored recipe. Alternatively, start it with startRecipe(recipeId, name) (src/ui/state.ts:465). Randomize stays available and is recorded as an override. The Summary names recipe-assigned modules (L306's E10) as well as Diverse draws.
```

#### W5-17 · line 664 · MINOR · other
- Evidence: D-0030 ("Diverse … 10 % chance per eligible founder"); `founders.ts:60–70` diverseModuleFor (founder.module stream), `:101–102`; `content/modules/E01, E03, E04, E05, E09, E10, E12` eligibleAncestors; CT §7.1. B01 and Y02 are already eligible for E01/E03/E05 and B08 for E03/E05 at HEAD; the W4 flip adds E04 (B01, B08, Y02), E09 (Y02) and E10/E12 (B01).
- Replace "modules only on the labelled founders" with:
```text
… modules: L306 has E10 on exactly the 20 alternate-assigned founders and on no other; L301 has none; L303 and L304 (Diverse) have only the founder.module draws at creation (lineage origin 2, 'present at creation'), and these equal founderSummary() …
```

#### W5-18 · line 671 (MISSED) · MINOR · status
- Evidence: `git show HEAD:tests/helpers/tables.ts` (profileTable, movementTable; rows() regex `/^\|\s*[BYFAPXV][0-9]{2}\s*\|/`); `CONTENT_TABLES.md:167–211` (§3), `:334–358` (§7.1–7.2).
- Replace "tests/helpers/tables.ts (reads CT from the doc; use it as the oracle)" with:
```text
tests/helpers/tables.ts reads CT from the doc, but today only for §1.2 and §1.3. Add parsers (additive, your file) and use them as the oracle:
- §3.1: a prose 'ID foods · …' list.
- §3.2/§3.3: 'ID Name' first cell. Expand ranges like 'B06–B12'; keep the 'free', 'while in sediment' and 'within 1 cell' qualifiers; ignore parenthetical notes.
- §3.4: rows keyed by field name.
- §3.5: prose.
- §7.1: E-ID rows.
```

#### W5-19 · line 692 · MINOR · other
- Evidence: `eslint.config.js:6–30` SIM_DETERMINISM, applied only in the block `files: ['src/sim/**/*.ts']` (`:68–83`; src/sim may not import @audio/*); `NewDish.tsx:33–36` Math.random for the seed; `tsconfig.json:30` and `vite.config.ts:13` define the @audio alias.
```text
ESLint forbids Math.random, Date and performance only in src/sim/** (eslint.config.js SIM_DETERMINISM). Cosmetic Math.random in src/audio is allowed. Nothing lints src/audio's imports, so your test is the proof that it imports nothing from src/sim (use the @audio alias).
```

#### W5-20 · line 694 · MINOR · symbol
- Evidence: `protocol.ts:222–231` VisualEvent.type; `snapshot.ts:152–178` visualEvents(); `dormancy.ts:263` emits 'wake'; `state.ts:231` pushFeed(s.events), `:341` saveToSlot, `:496` select, `:595–618` sendCommand/reportCommand; `LabView.tsx:235–255` sendLabCommand; `entities.ts:154–157` LIFE_*; ARCH §10.3; UX §8.1; BUILD_DIRECTIVE P3.10. (`state.ts` line numbers may shift when g2-close commits.)
- Replace the cue call-site list of line 694 with:
```text
one line at each cue call site (HEAD):
- reportCommand (src/ui/state.ts:604, after sendCommand :595) and sendLabCommand (src/ui/views/LabView.tsx:235): accepted > 0 → drop, accepted 0 → placement_error.
- select (state.ts:496), player taps only → select.
- saveToSlot (state.ts:341) → save.
- onSnapshot events (state.ts:231; 'birth', coalesced) → division.
- DiscoveryPacer/DiscoveryCard → discovery.
- CompareResults → compare_result.
- Experiment card open (src/ui/views/ExperimentCard.tsx) → card_open.
- wake: add 'wake' to VisualEvent and visualEvents() in src/worker/{protocol,snapshot}.ts (additive SHARED) and cue it where 'birth' is cued. Do not derive it in src/audio from E_LIFE.
Log the cue-id mapping in DECISIONS: ARCH placement_ok vs UX placement_error, and gate_click deferred per P3.10.
```

#### W5-21 · line 699 · MINOR · number
- Evidence: `ARCHITECTURE.md:223–230` ("… slow detuned sine pad, −24 dB"); `UX_SPEC.md:351` ("… quiet audio …"); BUILD_DIRECTIVE P3.10.
```text
PROPOSED DECISION: quiet audio = effects −12 dB, ambient off; default volumes effects 0.7, music 0.4, voice 0.8 (not in the docs; report them for DECISIONS).
```

#### W5-22 · line 701 (MISSED) · MINOR · other
- Evidence: `git show HEAD:android/app/src/main/AndroidManifest.xml` → line 40 `android.permission.INTERNET` is the only uses-permission; `package.json` has no `@capacitor/haptics`.
```text
Haptics only on intentional tool actions, via feature-detected navigator.vibrate, off by default (PROPOSED DECISION: no new dependency). On Android the WebView vibrates only if the app declares <uses-permission android:name="android.permission.VIBRATE" />. Either add that one line to android/app/src/main/AndroidManifest.xml (SHARED) and list it in PLAY_STORE_CHECKLIST, or record in DECISIONS that the Android build has no haptics yet.
```

#### W5-23 · line 709 · MINOR · path
- Evidence: plan line 693 (owned files include no tests/e2e path); `git ls-tree HEAD tests/e2e` has no settings spec; `tests/e2e/helpers.ts:28` expectNoSeriousA11yViolations, `:5` seedSettings.
```text
Add to owned files: tests/e2e/sound-settings.spec.ts (new). It checks that the Settings sound controls are reachable by keyboard, that mute and volume change the stored settings, that the page is axe clean (expectNoSeriousA11yViolations), and that 200 % text works on all three projects.
```

---

## Wave 6, §5 checklist, §6 risks and appendix (lines 717–888): 1 BLOCKER, 5 MAJOR, 22 MINOR

| ID | Line | Sev | Plan says | Actually | Replace with |
|---|---|---|---|---|---|
| W6-01 | 726 | MINOR | a11y "Read UX §4.1–4.2 …; D-0014, D-0017." | The builder must also keep D-0026 (What if? is a blocking modal; no dish key acts behind it) and D-0029 (Space modality rule; choice groups own their keys). | W6-01 |
| W6-02 | 727 | MINOR | "tests/ui/a11y*.test.ts (new)" | Vitest runs in 'node' with no DOM library, and ARCH §16 limits `tests/ui` to pure functions. | W6-02 |
| W6-03 | 727 (MISSED) | MINOR | "DishSummary.tsx = accessible species list with name, count, biomass trend and extinct state" | Snapshots carry `speciesCounts` but no per-species biomass, and a11y owns nothing in `src/worker`; the existing history request already returns per-species biomass. | W6-03 |
| W6-04 | 730 | MINOR | "Semantic controls and a visible focus ring (#F2B84B) everywhere." | The ring exists (`styles.css:61`); #F2B84B is 1.63, 1.47 and 1.29:1 on the three light surfaces, below UX §4.1's 3:1 for essential graphics. | W6-04 |
| W6-05 | 731 | MINOR | "The full UX §4.2 keyboard map: arrows pan, +/− zoom, Space pause/run, …" | Mostly implemented and tested (incl. D-0029); only '/', Enter placement and keyboard selection are missing; a second window keydown listener would double-fire keys. | W6-05 |
| W6-06 | 732 | MINOR | "Keyboard placement. PROPOSED DECISION: … Enter commits one gesture there" (SHARED `src/ui/gestures.ts`) | The keyboard journey also needs keyboard selection ("Inspect (I) → Why?"); `gestures.ts` handles pointer and wheel only; taps go through the handler object DishScreen passes to `attachGestures`. | W6-06 |
| W6-07 | 734 | MINOR | "A live region announces one-line results (placement accepted with count, saved, card available)." | Polite status toasts already announce these, but mount only while shown; there are four toast hosts; a new region beside them would double-announce; `App.tsx` is outside SHARED. | W6-07 |
| W6-08 | 737 | MINOR | "Contrast audit … in art/src/palette.ts and styles.css" | Essential dish graphics also live in `src/render/layers.ts` (C, RAMPS), `src/render/speciesColors.ts` and `TRAIT_BAND_COLORS`. | W6-08 |
| W6-09 | 739 | MINOR | a11y-screens "visits every screen and sheet …" (list) | Misses the experiment card and its paired run, the More/Save/Evolution sheets, Add Life and Feed, the discovery card, the candidate list and the checkpoint list. | W6-09 |
| W6-10 | 752 | MINOR | "snapshot build time and bytes (entities, overlay, aggregation)" | Aggregation is computed by the renderer; the snapshot also carries ids, deposits (6 bands), geometry, lineage marks, events, the inspector and evolution state, assembled in `host.ts` (not perf's). | W6-10 |
| W6-11 | 756 | MINOR | P3.12 done-when (no device item) | WORKLOG P1.5, EXPANSION_RESPONSE §7 and D-0017 deferred device checks to P3.12, and D02 §25 asks for a 15-minute Android stress session; the codespace has only SwiftShader. | W6-11 |
| W6-12 | 756 (MISSED) | MINOR | "1× tick p95 < 10 ms at 6,000 agents on this machine (record the lscpu model …)" | Perf runs alongside a11y's Playwright and g3-evidence's `sim:tune` on the same 2 CPUs; contention inflates percentiles; no load record is asked for. | W6-12 |
| W6-13 | 760 | MINOR | "tests/perf/stress-shape.test.ts asserts the builder really creates 6,000 agents …" | It runs in every `npm run check` (vitest includes `tests/**`), and no cost bound is set. | W6-13 |
| W6-14 | 762 | MINOR | "Use E2E_PORT=4262 E2E_OUTDIR=tmp/dist-perf for render-bench." | `render-bench-run.ts` hard-codes 4176 on the Vite dev server, ignores both variables and throws if 4176 is busy. | W6-14 (G12) |
| W6-15 | 768 | MINOR | "docs/reports/opening-loop-g3.md (optional; screenshots via tools/review-opening-loop.mjs)" | The script targets 127.0.0.1:4173 and writes into `docs/reports/img/g1/`; with its default tags it overwrites the committed G1 images. | W6-15 |
| W6-16 | 768 | MINOR | "§4 G3 correctness evidence, one row per gate item" | BUILD_DIRECTIVE G3 wants the generated relationship table in the response doc itself. | W6-16 |
| W6-17 | 772 (MISSED) | MINOR | "launch-ecology.spec.ts: New Dish → Gel Colony → Lab → add Velvet on gel, …" | Create already opens the dish paused in the Lab with the Life tray (D-0030), so pressing the view toggle would switch to Explore; Gel Colony comes from W1's start choice. | W6-17 |
| W6-18 | 773 | MINOR | "Run npm run sim:tune (Standard, the six development seeds, 600 s, every registered recipe …) … including the D-0015 re-measurement." | Defaults run only FIRST_DISH_V1 and write no file; D-0015's candidates were measured in memory with `tuneSeed`, content unchanged. | W6-18 |
| W6-19 | 808 | MINOR | "Determinism (Appendix A) \| determinism.test.ts, determinism-g3.test.ts, g2-replay.test.ts, trajectory-fence.test.ts" | The committed 1×/4×/reload evidence through the host and the real save file is `deterministic-state.test.ts`. | W6-19 |
| W6-20 | 809 | MAJOR | "Saves \| `migration.test.ts` (2→3, 1→3), `world-stores.test.ts` \| W1" | The bump is 3 → 4; `history-debris.test.ts` holds the real schema-2 path, pins schema 3 in four places and two stateHash literals, and the foundation does not own it. | W6-20 (G1) |
| W6-21 | 833 | MAJOR | risk 5: "Begin and Cancel are host-level, and Cancel is an exact inverse move … This keeps the stateHash equal …" | `nextSeq` is hashed and every command increments it; W3's prompt makes Cancel a command (line 490) and still asks for the pre-begin hash (502); other commands could take the vacated slots. | W6-21 (G10 Option W6) |
| W6-22 | 846 | BLOCKER | risk 7: "Tests must never pin stateHash literals." (and line 96 "new zero columns and stores enter stateHash") | Old-save hashes are pinned on purpose (g2-replay; `history-debris.test.ts:168/:176`); a W1 built as planned turns g2-replay and history-debris red. | W6-22 (G2 Option A) |
| W6-23 | 851 | MAJOR | risk 9: "A builder that must break it needs a rules version bump plus a DECISIONS entry." | `simulationVersion` is pinned to `z.literal(3)` and `loadSaveFile` refuses other values; the other versions are labels. | W6-23 (G3) |
| W6-24 | 872 | MAJOR | risk 22: "stored in the local UI journal store (P2.8), not in saves" | P2.8 stores open-dish entries in the save (D-0031), refuses unknown kinds everywhere, uses 'observation' for the player's own note, and evicts the oldest at 200. | W6-24 (G11) |
| W6-25 | 873 (MISSED) | MINOR | risk 23: "Keyboard placement. Decision: a center reticle plus Enter commits one gesture." | Must match W6-06: selection too, through DishScreen's gesture handler, not `gestures.ts`. | W6-25 |
| W6-26 | 880 | MINOR | risk 27: "Phase 2 wave B/C file names may differ … The prompts say to verify with git grep." | Waves B and C are committed and every guessed path exists (G5). | W6-26 |
| W6-27 | 885 | MAJOR | "entities.ts (+ serialize.ts: schema 3, links, stores, stateHash)" | `SCHEMA_VERSION` lives in `world.ts` and is already 3; reusing 3 would skip the new columns for every P2.8 save ("entity column … missing"). | W6-27 (G1) |
| W6-28 | 888 (MISSED) | MINOR | "g2-wave-b.workflow.js.txt (the template every Phase 3 wave file copies)" | The lead's current template is `g2-close.workflow.js.txt` (two lenses, ≤ 2 fix rounds, reports, +10/+20/+30 ports). | W6-28 (G12) |

### Wave 6 replacement text

#### W6-01 · line 726 · MINOR · doc-ref
- Evidence: D-0029 ("Keyboard (UX §4.2 lists both 'Space pause/run' and 'Enter/Space activate')…"); D-0026 ("What if? is a modal blocking panel … the dish behind is inert and ignores keys"); `DishScreen.tsx:137` (`if (whatIfOpen.value !== null) return;`).
```text
Read UX §4.1–4.2 (sizes; input contract incl. the keyboard map), §5.4 (chart tables), §7.4 (reduced motion), §9; D-0014, D-0017, D-0026 (What if? is a blocking modal; no dish key acts behind it), D-0029 (Space modality rule; choice groups own their keys).
```

#### W6-02 · line 727 · MINOR · other
- Evidence: `vitest.config.ts` `environment: 'node'`; `package.json` devDependencies have no jsdom, happy-dom or @testing-library; ARCH §16 "UI (tests/ui): … (pure functions)".
```text
tests/ui/a11y*.test.ts (new; pure functions only, such as the DishSummary/CellDescription text builders and the contrast math, because vitest runs in 'node' with no DOM library; DOM behaviour is tested in Playwright)
```

#### W6-03 · line 727 (MISSED) · MINOR · symbol
- Evidence: `protocol.ts:270–295` (speciesCounts only), `:60` (`{ type: 'history', …, lastSeconds?: number }`); `client.ts:201` `async history(dishId, lastSeconds?)`; `history.ts:24–27` `HistorySample { count, biomass, … }`; plan line 728 (SHARED list has no src/worker).
```text
src/ui/a11y/** (new: DishSummary.tsx = accessible species list with name, count (SnapshotMsg.speciesCounts), biomass trend (from the existing history request, client.history(dishId, lastSeconds) → HistorySample.biomass per species; no protocol change) and extinct state (count 0 after members were seen); CellDescription.tsx; LiveRegion.tsx; focus utilities)
```

#### W6-04 · line 730 · MINOR · number
- Evidence: `styles.css:61–64` (`:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }`, `--focus #f2b84b` at `:11`); WCAG ratios computed from the UX §6.1 hex values (8.81:1 on #14252D).
```text
- Semantic controls and a visible focus indicator everywhere. Keep the existing global ring (src/ui/styles.css:61; 3 px #F2B84B per UX §6.1) and add a dark companion ring (e.g. box-shadow 0 0 0 5px #172C35), because #F2B84B alone is 1.3–1.6:1 on the light surfaces (UX §4.1 needs ≥ 3:1).
```

#### W6-05 · line 731 · MINOR · status
- Evidence: `DishScreen.tsx:126–165` (window keydown: Space, 1/2/4, '.', Escape, u/U, +/=/-, Arrow*; ignored while What if? is open); `LabView.tsx:402` handleViewKey (i, l, f, Escape); `tests/e2e/garden.spec.ts:19`, `:35`, `lab-tools.spec.ts:269`; no '/' or Enter handler in src/ui at HEAD.
```text
- The UX §4.2 keyboard map already exists: DishScreen.tsx:127-165 (Space with the D-0029 modality rule, 1/2/4, '.', Esc, U, +/=/−, arrows) and LabView.tsx:402 handleViewKey (I, L, F; Esc → Inspect in Lab). Verify it and add only what is missing: '/' focuses Field Guide search, Enter at the reticle, and keyboard selection. Extend these handlers; never add a second window keydown listener.
```

#### W6-06 · line 732 · MINOR · path
- Evidence: `gestures.ts:151–157` (pointer/wheel/contextmenu listeners only); `DishScreen.tsx:93` (`attachGestures(host.current, r, labGestures({ … onTap: (sx, sy, wx, wy) => onTap(r!, …) …}))`); `Inspector.tsx:273` 'shortcut-why'.
```text
- Keyboard placement and selection. PROPOSED DECISION: with the dish focused, a visible centre reticle (an HTML element over the viewport) marks the target cell. Enter sends one tap there through the same handler DishScreen passes to attachGestures (DishScreen.tsx:93). A placement tool therefore commits one gesture, and Look/Lab Inspect selects (candidate list when the tap is ambiguous). The arrows pan the dish under the reticle. The journey's 'Why?' is the 'Why did it stop?' button (data-testid shortcut-why).
```

#### W6-07 · line 734 · MINOR · status
- Evidence: `DishScreen.tsx:247–251`, `CompareScreen.tsx:140`, `ExperimentRun.tsx:167` (`{toast.value ? (<div class="toast" role="status" aria-live="polite">`); `App.tsx:21–28` PageToast; `LabView.tsx:461` sr-only role=status; `state.ts:604–617` reportCommand toasts ("Added {n} {name}.").
```text
…and the selected-cell description. One always-mounted polite live region announces one-line results (placement accepted with count, saved, card available). Build it from the existing toasts instead of adding a second announcer. The toast hosts (DishScreen.tsx:247, CompareScreen.tsx:140, ExperimentRun.tsx:167 and App.tsx PageToast :24) are mounted only while a toast shows, so mount one sr-only region in App.tsx that reads out toast.value, and drop role/aria-live from the visible toasts. Keep the sr-only statuses in LabView and DiscoveryCard. SHARED += src/ui/app/App.tsx (the region's mount point).
```

#### W6-08 · line 737 · MINOR · path
- Evidence: `src/render/layers.ts` const C (lines 11–34), `RAMPS` (`:185`), legendStops (`:240`); `src/render/speciesColors.ts` HEX; `renderer.ts:45` `TRAIT_BAND_COLORS = [0x2f6bc0, 0x8fbde8, 0xf2efe6, 0xf5b56a, 0xd4552a]`.
```text
- Contrast audit of every text/background and essential-graphic pair in art/src/palette.ts, src/ui/styles.css, src/render/layers.ts (dish and deposit colours C, overlay RAMPS), src/render/speciesColors.ts and TRAIT_BAND_COLORS (src/render/renderer.ts:45): text ≥ 4.5:1, essential graphics ≥ 3:1. Include organisms against water, gel and sediment, and the focus ring against every surface. Fixes outside your files go into the report as proposals.
```
- Note: a11y's SHARED render files are only `renderer.ts` and `layers.ts`; after W2 the art-features render files carry their own reduced-motion variants, so consider widening to `src/render/**` (reduced-motion and overlay-palette switches only).

#### W6-09 · line 739 · MINOR · path
- Evidence: `state.ts` Route union (lines 24–40; 'experiment', 'experimentRun', notebook tab 'journal' / 'experiments') and `:79` sheet signal ('addLife', 'feed', 'inspect', 'more', 'save', 'history', 'lineage', 'evolution'); `App.tsx` cases 'experiment'/'experimentRun'; `lab.ts:12` LabCategory; `HistorySheet.tsx:131–134` tabs; `NewDish.tsx:200–356` sections.
```text
- tests/e2e/a11y-screens.spec.ts visits every screen and sheet in all three projects with zero serious/critical axe violations: Home, Play, New Dish (Basics, Evolution with Advanced rates, Content, summary), Saves (named slots and checkpoints), Settings, About, each Field Guide tab, Dish Explore (Add Life and Feed sheets, candidate list), Dish Lab with each tray (inspect, life, food, chemistry, habitat, tools, observe), every Inspector depth (Summary, 'Why did it stop?', Happening now, Passed to offspring, Details, cell inspector), More, Save, Evolution settings (Advanced), History (Charts, Regions, Table, What happened), Lineage, the discovery card, Compare setup/results, What if?, each Notebook tab (Journal, Experiments), an experiment card and its paired run, Sample preview and the reaction ledger (and the Keep sheet once the g2-close work is committed).
```

#### W6-10 · line 752 · MINOR · symbol
- Evidence: `protocol.ts:270–295`; `snapshot.ts:109` `DEPOSIT_BANDS = 6` (the `protocol.ts:280` comment still says 5); `host.ts:1567–1614` (packEntities/packDeposits/packOverlay/visualEvents/packLineageMarks/buildInspector/evolutionState/creationFounders; SNAPSHOT_INTERVAL_MS = 100 at `:210`); packLineageMarks `lineage.ts:751`, evolutionState `mutation.ts:233`, creationFounders `founders.ts:198`; `renderer.ts:479` paintAggregation.
```text
snapshot build time and bytes per part: ents, ids, deposits (6 × 16,384 bytes), overlay, geometry (only when its version changed), lineage marks, events, the inspector payload and the evolution state. Measure them by calling packEntities/packDeposits/packOverlay/visualEvents/buildInspector (src/worker/snapshot.ts), packLineageMarks (src/sim/lineage.ts), evolutionState (src/sim/mutation.ts) and creationFounders (src/sim/founders.ts) in the same way as DishHost.sendSnapshot (src/worker/host.ts:1567, at most every 100 ms while running). Aggregation is computed by the renderer (src/render/renderer.ts:479), so measure it in render-bench. host.ts is not yours: propose snapshot-assembly changes in the report.
```

#### W6-11 · line 756 · MINOR · status
- Evidence: `WORKLOG.md:27` ("…device measurement at P3.12"); EXPANSION_RESPONSE §7 ("A GPU device measurement is required (P3.12)"); D-0017 ("Verify on a device at P3.12"); `docs/source/D02` ~line 761 ("Measure the same 15-minute Android stress session with the most expensive enabled modules.").
- Add to P3.12's "Done when":
```text
- The renderer numbers are SwiftShader lower bounds. List these owner items in docs/reports/perf-g3.md (g3-evidence copies them into EXPANSION_RESPONSE §8): the GPU/device frame-rate measurement (deferred to P3.12 by WORKLOG P1.5 and EXPANSION_RESPONSE §7), the 15-minute Android stress session (D02 §25), and D-0017's device check of sheet/canvas compositing.
```

#### W6-12 · line 756 (MISSED) · MINOR · other
- Evidence: plan lines 722–777 (three concurrent W6 builders), 773 (sim:tune over every recipe), 879 ("2 CPUs"); `tools/render-bench-run.ts:63` records loadavgBefore for this reason.
```text
- 1× tick p95 < 10 ms at 6,000 agents on this machine (record the lscpu model, core count, Node version and the load average before/after; also report p50 and p99). Take the final numbers with no other heavy job running (a11y's Playwright runs and g3-evidence's sim:tune share the 2 CPUs), or leave the command for the lead to rerun at integration.
```

#### W6-13 · line 760 · MINOR · other
- Evidence: `vitest.config.ts` `include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx']`; `package.json` `"check": "npm run typecheck && npm run lint && npm run test"`; AGENT_CAP 6000 / FUNGAL_CAP 2000 at `constants.ts:13–14`.
```text
- tests/perf/stress-shape.test.ts asserts that the builder really creates 6,000 agents with 2,000 fungal segments and every system active (non-vacuity). It runs in every npm run check, so keep it under about 20 s: build the world and run only until each mechanism has fired once.
```

#### W6-14 · line 762 · MINOR · port
- Evidence: `tools/render-bench-run.ts:20` `const PORT = 4176;`, `:59` (throws if the port is busy), `:68` (`spawn('npx', ['vite', '--port', String(PORT), '--strictPort', …])`).
```text
Use E2E_PORT=4262 E2E_OUTDIR=tmp/dist-perf for Playwright. render-bench: tools/render-bench-run.ts (npm run render:bench) hard-codes PORT 4176 on the Vite dev server (no build folder) and ignores E2E_PORT and E2E_OUTDIR. You own it: read the port from E2E_PORT (default 4176), run it with E2E_PORT=4262, and stop only that port. Each verifier passes its own E2E_PORT.
```

#### W6-15 · line 768 · MINOR · path
- Evidence: `tools/review-opening-loop.mjs:5` (`const OUT = new URL('../docs/reports/img/g1/', import.meta.url).pathname;`), `:6` (default TAG 'desktop'), `:14` (`await p.goto('http://127.0.0.1:4173/');`); `git ls-tree HEAD docs/reports/img/g1` lists 11 desktop and 11 phone PNGs; `.gitignore` ignores `tmp/`.
```text
docs/reports/opening-loop-g3.md (optional). Do not run tools/review-opening-loop.mjs as it is: it hard-codes 127.0.0.1:4173 and writes into docs/reports/img/g1/, overwriting committed G1 images. Copy it to tmp/review-opening-loop-g3.mjs, point it at port 4263 and at docs/reports/img/g3/ (yours), and list the images in the report.
```

#### W6-16 · line 768 · MINOR · doc-ref
- Evidence: `BUILD_DIRECTIVE.md:572–576` ("every catalog relationship fixture (generated table in the response doc)").
```text
§4 G3 correctness evidence: one row per gate item, plus the generated relationship table (copied from docs/reports/relationships-g3.md with its row counts; BUILD_DIRECTIVE G3: 'generated table in the response doc').
```

#### W6-17 · line 772 (MISSED) · MINOR · status
- Evidence: `NewDish.tsx` create() (`labShowsDish(info.dishId); openLabWith('life'); revealLifeTray();`), `:210`/`:215` start options; D-0030 ("New Dish enters paused in the Lab with the Life tray open (UX §2.3)"); plan line 211 (environment's habitat picker). Under W1-17 the picker is the "Start with" choice 'Empty Gel Colony'.
```text
- tests/e2e/launch-ecology.spec.ts: New Dish → Gel Colony (W1's habitat picker) → Create (the dish opens paused in the Lab with the Life tray open, D-0030; do not press the view toggle) → add Velvet on gel, Threadlace, Cordweaver, Brothmaker + protein, a pellet and a salt brush stroke → Sample → Transfer → Clean water → Field Guide lookup → run at 4× → the inspector shows film, links and the reaction ledger.
```

#### W6-18 · line 773 · MINOR · other
- Evidence: `tools/sim-tune.ts:1039` (`get('recipes') ?? get('recipe') ?? 'FIRST_DISH_V1'`), `:1049` preset default 'standard', `:1052` (`out: get('out') ?? null`), `:446` `export function tuneSeed(registry, opts)`; `docs/reports/tune-g1.md:249` ("Proposals only"), `:302–306` ("Candidate measurements … with tuneSeed from this tool; content/ was not changed"). g2-close is adding `--presets` (and keeps `--preset`); use whatever flag is committed.
```text
Run npm run sim:tune -- --recipes <every id in content/recipes, comma-separated> --seconds 600 --extend 1200 with the committed tool's Standard preset flag, plus --out docs/reports/tune-g3.md. Re-measure D-0015's three proposals (docs/reports/tune-g1.md, 'Proposals only' and 'Candidate measurements') in memory: call tuneSeed(registry, opts) from tools/sim-tune.ts on a patched registry and never edit content/ (WAVE 6 RULE).
```

#### W6-19 · line 808 · MINOR · path
- Evidence: `tests/fixtures/deterministic-state.test.ts:1–10` header; `tests/fixtures/determinism.test.ts:1–7` header ("The G1 command-log/host version of this fixture is deterministic-state.test.ts").
```text
| Determinism (Appendix A) | `determinism.test.ts` (G0 headless), `deterministic-state.test.ts` (G1: 4× through DishHost; save → loadSaveFile), `determinism-g3.test.ts`, `g2-replay.test.ts`, `trajectory-fence.test.ts` | pre/W6 |
```

#### W6-20 · line 809 · MAJOR · version
- Evidence: `world.ts:29`; `git grep -n 'toBe(3)' HEAD -- tests/` → `migration.test.ts:35`, `history-debris.test.ts:97`, `:110`, `:142`, `:183`; `history-debris.test.ts:152` reads the schema-2 fixture; `:168`/`:176` pinned hashes.
- "Its stateHash literals … must still hold" is G2 Option A (under B they are re-recorded). W1-05 writes toBe(4) only at :97 and toBe(SCHEMA_VERSION) at the other three; either is fine.
```text
| Saves | `tests/persistence/migration.test.ts` (3 → 4, 2 → 4, 1 → 4 through loadSaveFile; update `expect(SCHEMA_VERSION).toBe(3)` at :35), `tests/sim/history-debris.test.ts` (the real schema-2 fixture tests/persistence/fixtures/schema2-cleaning-crew-t1900.pixelmeba.gz migrating to 4 through loadSaveFile; its literal 3 at :97/:110/:142/:183 becomes 4; its stateHash literals at :168/:176 must still hold; add the file to W1 foundation's ownership), `g2-replay.test.ts` (the g2 saves are real schema-3 files, so it covers 3 → 4), `tests/sim/world-stores.test.ts` | W1 |
```

#### W6-21 · line 833 · MAJOR · other
- Evidence: `serialize.ts:256` (`h.number(world.commands.nextSeq)`); `commands.ts:60` (`seq: world.commands.nextSeq++`); `commands.ts:264` (`detPermutation(cells.length, world.seed, STREAMS.inoculate, cmd.seq)`); `host.ts:457–469` (the undo snapshot = serializeWorld before an undoable command) and `:476–505` (Undo restores it exactly); plan lines 490, 502, 509; SPEC §10.5.
- G10 Option W6 (Option W3 is W3-20). Replace risk 5 with:
```text
5. **Sample transactions** (tools-sample W3).
   - Decision: Begin is host-level: pause and record the pre-begin stateHash. Take ('sampleTake'), Transfer and Discard are commands (undoable). While a sample is held, the host refuses Run and every other command that changes the dish, so the vacated slots stay free.
   - Cancel: while the host's one-level undo snapshot is still the Take's, Cancel restores that snapshot (as Undo does). That gives the exact pre-begin stateHash (SPEC §10.5 'Cancel restores the checkpoint exactly'). After a reload there is no undo snapshot, so Cancel is the command 'sampleReturn': an exact inverse move into the original slots and cells. Its result equals the pre-begin world in every hashed value except commands.nextSeq (+2: the Take and the Return). The tests assert exactly that: the stateHash of a copy with nextSeq set back, plus the trajectory digest. Log this after-reload difference in DECISIONS for the owner. Never remove nextSeq from stateHash (it keys inoculation order, commands.ts:264).
   - Change W3 lines 490 and 502 (and the after-reload Cancel in 509) to match.
   - Ownership units are computed generically from W1's link tables, so E12 clusters are covered automatically in W4.
```

#### W6-22 · line 846 · BLOCKER · other
- Evidence: `serialize.ts:235–241` (`h.number(hw); for (const [name] of ENTITY_COLUMNS) { … h.string(name); h.typed(arr.subarray(0, hw)); }`), `:228` (`h.string(canonicalJson(world.settings))`); `world.ts:154` (`fields: allocateFields(opts.content.manifest.enabledSystems)`); `history-debris.test.ts:168` `toBe('baa42a29186c6c46')`, `:176` `toBe('5ce059e49121f688')` (the schema-2 fixture written by the `0ac0477` build); plan lines 96, 126, 201.
- G2 Option A. (Under Option B keep risk 7 and add: "Old saves are compared with the trajectory digest; history-debris.test.ts:168/:176 are re-recorded under the foundation's DECISIONS id.") Replace risk 7 with:
```text
7. **contentHash is inside stateHash.** Decision: keep it (it is the ruleset identity). Never pin stateHash literals for freshly realized worlds, because content edits move them; compare relationally or with the trajectory digest. Old saves are the exception: their hashes are pinned on purpose (g2-replay expected.json; tests/sim/history-debris.test.ts:168 and :176) and must keep holding. Decision (W1 foundation; also fix the W1 row of §2 and W1 item (2) 'included in stateHash'): stateHash stays bit-identical for any world that holds no Phase 3 state. Hash each entity column added at schema ≥ 4, and each new world store, link table, counter or WorldSettings key, only when it holds a non-default value (skip all-0/all-−1 columns, empty `objects`, null `sample`, zero counters, absent settings). Document this rule in serialize.ts next to stateHash. `EXPANSION_RESPONSE` records new endpoint hashes at G3.
```

#### W6-23 · line 851 · MAJOR · version
- Evidence: `schema.ts:356` `simulationVersion: z.literal(3)`; `saveFile.ts:266` (`if (man.data.simulationVersion !== 3) fail('version', 'Unsupported simulation version.')`); `content/manifest.json`; SPEC §14.1 "simulationVersion 3"; `variants.ts:545` (sameRules).
- Replace the last sentence of risk 9 with:
```text
A builder that must break it needs a DECISIONS entry and a bump of evolutionRulesVersion (biology or evolution rules) or moduleRegistryVersion (the module registry). Never bump simulationVersion: ManifestSchema pins it to z.literal(3) (src/sim/content/schema.ts:356), and loadSaveFile refuses any other value (src/persistence/saveFile.ts:266).
```

#### W6-24 · line 872 · MAJOR · status
- Evidence: `history.ts:369` (`const JOURNAL_KINDS = ['experimentStamp', 'observation'];`), `:464–468` journalRecordProblem; `journal.ts:1–22` header, `:242–245` and `:321–326` (validate, then `sink?.(entry)`); D-0031 "Journal with the dish"; SPEC §14.1 lists 'journal' as save content; plan line 623 (field-guide's SHARED list has no `src/sim/history.ts`).
- G11. Align "come only from committed sim events" with W5-05: events cover captures and (after W3) lysis/drain deaths, and W5-05 records the rest with an observation-only watcher. Replace risk 22 with:
```text
22. **Journal and badges.** Decision: relationship observations come only from committed sim events and never reuse the player-written 'observation' kind. Every journal entry passes journalRecordProblem (src/sim/history.ts:464; JOURNAL_KINDS :369), and the open dish's entries go through setJournalSink into its save's history.journal (D-0031). Choose one of two options. (a) Add a 'relationship' kind with its own validator to JOURNAL_KINDS/journalRecordProblem, so the observations are saved with the dish (outside the state hash). Then add src/sim/history.ts to field-guide's SHARED list (line 623), make sure relationship entries never push the player's notes and stamps out under JOURNAL_MAX 200, and add a loadSaveFile round-trip test. (b) Keep them in a separate device store (e.g. localStorage 'pixelmeba.relationships') that never passes through setJournalSink or the P2.8 validator. The builder records the choice in DECISIONS. Badges are cosmetic, stored on the device, with no timers or streaks.
```

#### W6-25 · line 873 (MISSED) · MINOR · other
- Evidence: plan lines 732, 740; `DishScreen.tsx:93`; `gestures.ts` (pointer events only).
```text
23. **Keyboard placement and selection.** Decision: a centre reticle over the focused dish; Enter sends one tap there through DishScreen's gesture handler (DishScreen.tsx:93), so a placement tool commits one gesture and Look/Inspect selects (candidate list when the tap is ambiguous).
```

#### W6-26 · line 880 · MINOR · path
- Evidence: `git ls-tree -r --name-only HEAD -- src/ui src/sim art/src src/render`; `git grep`: trayItems `LabTray.tsx:103`, PLACEABLE_STRUCTURES `grid.ts:199`, STRUCTURE_RECORD_IDS `:216`, planSealing `:381`, stageStructures `structures.ts:73`, the P2.7 section header `structures.ts:96`, applyHabitatEdit `:278`. G5 has the fuller list.
```text
27. Phase 2 wave B/C paths (verified at HEAD 3ebfdf5): Lab — src/ui/views/LabView.tsx (keys, labGestures, labTray), src/ui/views/LabToolbar.tsx, src/ui/panels/LabTray.tsx (trayItems), LabTrayContent.tsx, LabTrayIcons.tsx, LabTrayNames.tsx, src/ui/strings/lab.ts (LabCategory). Overlays — src/ui/panels/OverlayPicker.tsx, OverlayLegend.tsx. Journal — src/ui/journal.ts with src/sim/history.ts (journalRecordProblem, JOURNAL_KINDS) and src/ui/views/NotebookJournal.tsx. Notebook — src/ui/views/Notebook.tsx. New Dish — src/ui/views/NewDish.tsx, src/ui/panels/AdvancedEvolution.tsx, src/ui/strings/modes.ts. Atlas feature layers — art/src/layers/modules.ts, src/render/features.ts. Structure placement — src/sim/grid.ts (PLACEABLE_STRUCTURES, STRUCTURE_RECORD_IDS, planSealing) and the P2.7 section of src/sim/structures.ts:96-387 (applyHabitatEdit :278); stageStructures stays at :73.
```

#### W6-27 · line 885 · MAJOR · path
- Evidence: `world.ts:29`; `serialize.ts:144–146`, `:158` (`for (let v = state.schemaVersion + 1; v <= SCHEMA_VERSION; v++)`), `:168` (`if (v === 3) s = { ...s, history: historyForSchema3(s.history, s.tick) };`), `:195–197` (`if (!enc) throw new Error(`entity column ${name} missing`)`).
- "the hash-neutral stateHash extension from risk 7" is G2 Option A; under B drop that phrase.
```text
- /workspaces/pixelmeba/src/sim/entities.ts (+ /workspaces/pixelmeba/src/sim/world.ts: SCHEMA_VERSION 3 → 4; + /workspaces/pixelmeba/src/sim/serialize.ts: COLUMNS_ADDED_IN[4], a v === 4 step in migrateWorldState after the existing schema-3 history step, links, stores, and the hash-neutral stateHash extension from risk 7)
```

#### W6-28 · line 888 (MISSED) · MINOR · path
- Evidence: `git show HEAD:docs/agent/g2-wave-b.workflow.js.txt` (78 lines; ends with `pipeline(TASKS, build, verify)`); `g2-close.workflow.js.txt:7`, `:12` (`const R = 'docs/reports/reviews/g2-close'`), `:52` portNote, `:54` VERIFY(t, built, lens), `:67` FIX, `:81` REVERIFY, `:97–113` runTask; plan line 156 (`E2E_PORT=${t.port + 5}`). P-28 settles the port question (one verifier at +5; extra lenses outside every running wave's decade).
```text
- /workspaces/pixelmeba/docs/agent/g2-close.workflow.js.txt (the lead's current template: build → two-lens adversarial verify → fix and re-verify, at most 2 rounds, with reports under docs/reports/reviews/<wave>/, verifier ports port+10/+20 and re-verifier port port+30). g2-wave-b.workflow.js.txt is the older build → one-verify form that §3's VERIFY (port + 5) copies; decide which one the Phase 3 wave files follow.
```

---

## Facts builders need

Deduplicated: "All waves" holds what several waves use; each wave's list adds only what its builders need beyond that. Paths are at HEAD `3ebfdf5`; line numbers in files g2-close is editing (G16) may shift.

### All waves

**Content and manifest**
- `content/manifest.json`: simulationVersion 3, evolutionRulesVersion 1, moduleRegistryVersion 1, phenotypeMappingVersion 1, contentVersion 1, buildPhase 2; enabledSpecies A01, B01, B04, B06, P01; enabledModules E01, E03, E05; enabledSystems core, enzymes (the only list the validator does not require sorted; it requires 'core'); enabledMaterials DEBRIS, GEL, NUTRIENT, SEDIMENT, SHADE, STARCH, SUGAR, WATER; enabledHabitats WATER_GARDEN; enabledStructures BEAD, STONE, WALL (optional field); developmentalEnabled false. The manifest has no recipe or experiment lists.
- Phase-3 records at HEAD: species B02, B03, B05, B07, B08, F01, F02, P02, P03, P04, V01, X01, Y01, Y02; materials ACID, BASE, BUFFER, CO2, INH_BACT, INH_FUNG, INH_PHOTO, METABOLITE, OIL, OXYGEN, PROTEIN, SALT, M01, M03–M05, M09–M11; modules E04, E06–E10, E12. Phase ≤ 3 = 19 species and 10 modules. No phase-3 recipes, experiments, variants or habitats yet (`content/habitats/` holds only WATER_GARDEN.json), so bumping buildPhase alone changes no validation or shipped-card result.
- "Not enabled" examples that stay valid through Phase 3: B09, B10, B13, P05 (phase 5); E11 (phase 5); the 'developmental' system (Phase 7). 'devices' structures arrive with P5.2.
- Module visualLayer ids: E04 anchor_foot, E06 shade_patch, E07 light_trail, E08 debris_granule, E09 protein_notches, E10 matrix_edge, E12 adhesion_link.
- Eligible gains after the W4 flip: A01 E05, E06, E07; B01 E01, E03, E04, E05, E10, E12; B04 E01, E03, E04, E05, E09, E10, E12; B06 E03, E04, E05, E10, E12; P01 E05, E08.
- `src/sim/content/implemented.ts`: `IMPLEMENTED_NATIVE_ABILITIES = ['E_STARCH_SECRETION', 'PREDATION']` and `IMPLEMENTED_MODULES = ['E01', 'E03', 'E05']` (`:11`), each one line that several builders of a wave edit; `FILM_DIGESTION_IMPLEMENTED = false` (`:14`). `saveFile.ts` also uses `IMPLEMENTED_MODULES` for import checks.
- `src/sim/content/moduleRules.ts`: `MODULE_REQUIRED_PARAMS` (E01, E03, E05 only), `MODULE_NATIVE_ABILITY` (E01, E02, E03, E06 → LOW_LIGHT_CURVE, E09 → E_PROTEIN_SECRETION), `moduleSetProblem`, `missingModuleParams` (the registry refuses missing params, `registry.ts:341–342`).
- `NativeAbility` (zod enum, `src/sim/content/schema.ts:33–57`): E_STARCH_SECRETION 0, E_OIL_SECRETION 1, E_PROTEIN_SECRETION 2, BIOFILM 3, DORMANCY 4, SIGNAL_GLOW 5, RIVALRY 6, TRAP 7, TRANSPORT_LINKS 8, BRANCHING 9, … PREDATION 22; index with `NativeAbility.options.indexOf(id)`.

**World schema, saves and hashing**
- `SCHEMA_VERSION` 3 (`src/sim/world.ts:29`); a save file's schemaVersion = SCHEMA_VERSION (`saveFile.ts:200`); migration and stateHash details in G1 and G2.
- `deserializeWorld` throws `entity column X missing` (`serialize.ts:197`) and merges missing `ledger.energy` categories from `createLedger()` (`:206`). `saveFile.ts:256` migrates, then checks every column (`:314`).
- `parseSaveFile` (`saveFile.ts:237`) re-validates the embedded manifest, species, modules, materials and habitat with the current Zod schemas (`:264–281`), refuses `simulationVersion ≠ 3` (`:266`) and modules not in `IMPLEMENTED_MODULES` (`:273`, `:289`); `refPairs` checks prey/host/parasite links (`:359`).
- `buildSaveFile(world, {name, savedAt, recipeId, …}, {stripNames?})` async → `{text, checksum, file}` (`saveFile.ts:185`); `loadSaveFile(text)` async → `{file, world}` (`:395`).
- `StateHasher` (`src/sim/hash.ts:24`: word, number, string, typed, hex); `canonicalJson` (`:84`).
- Old-save fixture: `tests/persistence/fixtures/schema2-cleaning-crew-t1900.pixelmeba.gz` (270,404 bytes, gzip), read by `tests/sim/history-debris.test.ts:152`.

**Entities**
- `ENTITY_COLUMNS`: 67 columns, `alive` … `dryTimer` (`src/sim/entities.ts:16–94`). NEG_ONE_DEFAULT (`:113–115`, module-private): genome, preySlot, hostSlot, parasiteSlot, propG0, propG1, branchId, refGenome, propLocus0/1, propModule0/1.
- `EntityStore`: `allocate()` takes the lowest free slot (there is no allocate-at-slot); `allocate()` and `free()` call `clearSlot` (−1 or 0 per column); `free()` shrinks highWater; `refValid(slot, birthId)`; `recount()`. A stored `(slot, birthId)` is valid only while `alive[slot] && birthId[slot] === stored` (`entities.ts:8–10`). `counters.nextBirthId` starts at 1 (`world.ts:172`).
- Relation columns that exist: preySlot/preyBirthId, hostSlot (i32, −1)/hostBirthId (u32), parasiteSlot (i32, −1)/parasiteBirthId (u32), infectionTimer (f64), infectedBy (u8), dmgParasite (f64).
- `FLAG` bits: G14. `LIFE_ACTIVE` 0, `LIFE_PREPARING` 1, `LIFE_RESTING` 2, `LIFE_WAKING` 3 (`entities.ts:154–157`; duplicated in `src/render/features.ts` and `src/ui/strings/modules.ts`).
- Index-valued state: `species` (u16 → `world.species`, manifest order); `genome`/`refGenome`/`propG0`/`propG1` (genome table); `propModule0/1` (`births.ts:152–153`) and lineage `mutModule` (`births.ts:298`) index `world.content.modules`, which follows enabledModules order (`mutation.ts:159`, `recipes.ts:40`); `Branch.species` (`branches.ts:43`).
- Division: `stageBirths` allocates the new daughter (`births.ts:169`); `commitDivision` gives the retained daughter (slot i) birthId b0 (`:278`) and the new daughter b1 (`:279`); placement uses `canOccupy` (`:105`); `NEIGHBORS` order E, S, W, N, NE, SE, SW, NW, own (D-0002). The new daughter's flags = `FLAG.justBorn` only; the retained daughter keeps its flags plus justBorn. Death paths: G8.

**Loading, validation, test registries and helpers**
- `tools/lib/content-fs.ts`: `loadRawPacksFs(root?)` re-reads the disk on each call; `loadRegistryFs()` is cached. `src/sim/content/raw-vite.ts` `loadRawPacksVite()` feeds `src/worker/sim.worker.ts`.
- `src/sim/content/registry.ts`: `RawPacks` (`:42`: manifest, loci, species, materials, modules, habitats, structures, recipes, experiments, variants, objectives); `contentHashInput` (`:156`); `computeContentHash(raw)` (`:176`); `validateContent(raw)` (`:186`, one parameter); sorted lists (`:313–319`); `buildRegistry(raw)` throws `ContentError` (`:445–448`). `ManifestSchema` (`schema.ts:355–375`).
- Patch helpers: `tests/recipes/helpers.ts` `cloneRaw` (`:82`), `mutateRaw(raw, collection | 'manifest', file, fn)` (`:89`), `addRaw` (`:99`), `diffWorlds`, `cellOf`. `tests/experiments/helpers.ts`: `rawPacks()`, `mutate()`, `registry()` = `loadRegistryFs()` (shipped), `runCard`, `runTwiceIdentical`, `expectReplayIdentical`, `expectConserved`, `expectGateReached`, `expectEqualArms`, `speciesAt`, `untouchedRecipeHash`.
- `tests/helpers/world.ts`: `registry()` (cached shipped registry; throws on any validation error), `clearWater(overrides)` (Water Garden without stones, sugar 0, Fixed Traits; always the shipped registry), `place(world, id, x, y, state)` (introduceOrganism with no habitat check), `setField`, `fillField` (every mask cell), `rebaseLedger`, `aliveOf`. `tests/helpers/host.ts` `FakeClockHost` (a real DishHost with a fake clock; `create(dishId, DishSource)` accepts `{kind: 'state', state}`).
- `tests/e2e/helpers.ts`: `seedSettings` (`:5`), `startGarden`, `simSeconds`, `expectNoSeriousA11yViolations` (`:28`), `tapViewport`, `selectOrganism`, `expectNoHorizontalOverflow`, `expectReachable`. Worker access: `tests/e2e/lab-tools.spec.ts` `watchWorker` (`:17`), `workerHash` (`:39`).
- None of the Preflight's files exists at HEAD (`tests/fixtures/saves/*`, `tests/fixtures/{g2-replay,trajectory-fence}.test.ts`, `fence.json`, `tests/helpers/{registry,trajectory}.ts`, `tools/{make-g2-saves,fence-update}.ts`), and no file that any wave marks "(new)" exists at HEAD or in the working tree, so nothing gets clobbered.

**Realizing worlds and commands**
- `realizeRecipe(registry, recipeOrId, {worldId?, seed?, transform?, provenance?})` (`recipes.ts:188`); `worldContentFor(registry, habitat, provenance)` (`recipes.ts:35`) copies the registry manifest and its enabled species, modules and materials into every new world; `realizeVariant(registry, id, opts)` async (`variants.ts:488`); `realizeExperimentArms(registry, id)` (`experiments.ts:510`; realizes with `seed: def.seed`, `:516`); `runExperiment(registry, id)` (`:819`); `applyNow(world, id, payload)` (`commands.ts:80`).
- `introduceOrganism(world, spIdx, cell, source, {modules, exactCenter, origin, genome})` (`commands.ts:296`): B = b0, N = 0.10·b0, E = INITIAL_ENERGY 50, input 'introduce:<source>' of b0 and 0.1·b0 (`:328–343`); sets FLAG.attached for natively attached species (`:334`); lastIntakeTick −1 (`:336`); module sets through `validateModuleSet` → ModuleSetError (`:303–308`). `tests/fixtures/module-accounting.test.ts:38` `placeWith` shows `{modules, exactCenter: true}`.
- `queueCommand` gives every command a seq, accepted or refused (`commands.ts:57–63`). `inoculate` filters cells by `canOccupy` (`:262`), orders them with `detPermutation(…, STREAMS.inoculate, cmd.seq)` (`:264`) and treats a −1 slot as capacity (`:276–279`).
- `CommandPayload` kinds: paintSubstrate, paintShade {erase}, placeStructure, eraseStructure, inoculate, deposit, setLid, setMutationPreset, lineage. `setLid` is always accepted and counted as an intervention (`commands.ts:32`, `:106`); `ExperimentCommandSchema` allows inoculate, deposit, setLid, setMutationPreset (`schema.ts:269`).
- Host Undo (`host.ts:476–506`) restores the serialized pre-command state (log and nextSeq included) and resets checkpoint and replay; the snapshot is kept for undoable commands whose result is undefined or accepted > 0 (`:462–466`).
- `canOccupy(world, sp, cell)` = `habitatCompatible` (`movement.ts:44`); callers `births.ts:105`, `commands.ts:262`, `recipes.ts:273`, `specimens.ts:162`, `movement.ts:82`/`:188`. `habitatCompatible` (`suitability.ts:37`) allows ST_BEAD only for attached species; `suitabilityAt` (`:58`) returns 0 with SUIT_HABITAT first when it is false.

**RNG**
- `STREAMS` (`rng.ts:9–24`): decide, tiebreak, wander, contact, infect (unused so far), founder.init, founder.module, mut.quant, mut.pref, mut.module, mut.dev, placement (daughter jitter, `births.ts:231`), jitter, inoculate. `det`/`detFloat(seed, stream, ...keys: number[])` take numeric keys only; `detInt` = floor(detFloat × n) (`:93–96`); `detPermutation(n, seed, stream, ...keys)` (`:105–114`). `contacts.ts` `KIND_ATTACK = 1` (file-local) on `STREAMS.contact` with `(tick, KIND, birthId)`. No RNG key uses a species index.

**Fields and systems**
- `G2_FIELD_IDS` (24, FIELD_IDS order): sugar, sugarN, starch, starchN, oil, oilN, protein, proteinN, broth, brothN, detritus, detritusN, metabolite, nutrient, oxygen, co2, acid, base, buffer, salt, eStarch, eOil, eProtein, breaker.
- System → fields (`allocateFields`, `fields.ts:140–144`): core (includes acid, base, buffer, salt, oxygen, co2, oil, protein, metabolite); enzymes (broth, brothN, eStarch, eOil, eProtein, breaker); chemistry (inhBact, inhFung, inhPhoto; material 'none', so no experiment catalog keys); film (film, filmN; diffusion 'none'); viruses (v01, v02; 0.01 C per unit); silicate (silicate, grit); signals (sGlow, quencher); rivalry (rival). fungi, parasites, foodObjects, climate, barriers, devices, equipment and developmental allocate none.
- `world.derived.fieldActive` starts all 1 (`world.ts:160`, also after deserialize); 'none'-diffusion fields are skipped without clearing the flag (`transport.ts:294`), so `filmCoefficients` (`transport.ts:156`) scans the grid whenever 'film' is allocated.
- The experiment catalog lists `field.<id>` only for allocated fields whose material is not 'none' (`pairedRun.ts:651`), and per-species keys for every world species (`catalogIds`, `:644–656`).

**Ledger and constants**
- Energy categories (`ledger.ts:65`): earned, maintenance, movement, division, secretion, dissipated, other, surcharge, upkeep, dormancy (W1 adds 'construction'). No test pins the category set or the `computeTotals` breakdown keys (field ids plus bodyC, bodyN, mealC, mealN, bodyMineral). `recordInput`/`recordExport(world, source, c, n, m = 0)` (`ledger.ts:70`); `computeTotals`, `checkLedger`, `subtractPool`; mineral includes `jacketMineral` (`ledger.ts:131`).
- `src/sim/constants.ts`: AGENT_CAP 6000, FUNGAL_CAP 2000 (`:13–14`), FOOD_OBJECT_CAP 128 (`:16`), INITIAL_NUTRIENT_RATIO 0.1 (`:46`), INHIBITOR_DAMAGE 8 (`:54`, used at `maintenance.ts:72`), INITIAL_ENERGY 50 (`:58`), ENZYME_EMIT_RATE 0.02, ENZYME_EMIT_MIN_ENERGY 35, ENZYME_EMIT_COST 0.4, ENZYME_LOCAL_CAP 1 (`:82–85`), ENZYME_CONVERSION 0.1, EVENT_RING_SIZE 500 (`:118`), GAS_EXCHANGE_RATE 0.02, GAS_EXCHANGE_SEDIMENT_FACTOR 0.1, O2_ATMOSPHERE 0.8, CO2_ATMOSPHERE 0.5, CONTACT_DISTANCE 0.5, MEAL_CAP_MULTIPLE 2, HUNT_MAX_ENERGY 80, CELL_SOFT_CAPACITY 8, MOVE_COST_PER_CELL 0.2. There is no FILM_CAP.

**Events**
- `EventType` (`events.ts:7–24`): birth, death, introduce, mutation, capture (detail {prey, preySpecies = species index}), conversion, stressOnset, command, capacity, branchCandidate, branchEstablished, branchExtinct, secretionStart, firstIntake, rest, wake. conversion, stressOnset, capacity, secretionStart and firstIntake are declared but never emitted; 'firstIntake' (`intake.ts:323`) and `firstConversion:<enzyme>` (`conversion.ts:80`) are dish-level milestones. No objectEmptied, linkFormed or linkBroken yet. `SimEvent.detail` is `Record<string, number | string>`; events and `nextEventId` are outside stateHash.

**Worker protocol, snapshot, atlas, render**
- `PROTOCOL_VERSION` 1 (`protocol.ts:17`); `ENT_STRIDE` 12 (`:179`), E_SLOT 0 … E_CUE 11 (`:191`); new slots would be E_CUE2 = 12, E_LINKMASK = 13. E_CUE bits: FEEDING 1, STRESSED 2, HUNTING 4, SECRETING 8, JUST_BORN 16, CAPACITY_BLOCKED 32, CUE_MOD_E01 64, CUE_MOD_E03 128, CUE_MOD_E05 256, reserve band bits 9–10 (`CUE_RESERVE_BAND_MASK` = 3 << 9).
- `OverlayId = FieldId | 'light' | 'ph'` (`protocol.ts:31`), so 'salt', the inhibitors, 'v01' and 'film' are valid ids. `VisualEvent` types (`:222–231`): birth, death, introduce, capture, conversion, mutation, branchEstablished, branchExtinct. `DishInfo` (`:233–265`) has speciesIds, habitats, attachment surfaces (`:248`), summaries and fieldIds, and no diet fields; it is built in `host.ts` `info()` (~1396–1422). `CellInspect` (`:506`: cell, x, y, substrate, structure, non-zero fields, ph, effective light, residents, load; `snapshot.ts` `inspectCell` `:284`). `EntityInspect` (`:325`; `diet = {metabolism, prey, abilities, digestsFilm}`), `ModuleInspect {id, name, surchargePerSecond, params, activeNow}` (`:404`), `UpkeepInspect {resting, maintenance, surcharge, chamber}` (`:415–424`).
- `src/worker/snapshot.ts`: `packEntities` reuses pooled Float32Arrays (`:63`); `DEPOSIT_BANDS` 6 = starch, detritus, oil, protein, sugar haze, catalysis (`:107–133`); `packOverlay` handles 'light', 'ph' and any allocated field (`:136`); `visualEvents` filters by EventType literal (`:152`); module cues are one `if (mods.includes('E0x'))` line each (`:81–85`).
- Atlas `public/atlas/manifest.json`: format 'pixelmeba-atlas' version 1 (checkAtlas requires 1), 512×256; sprites a01_sunbead, b01_sprinter, b04_recycler, b06_crumbsmith, p01_amoeba; `features` keyed by layer: starch_notch (1 frame), reserve_pocket (4), resting_seam (3), each 16 px, 4 headings, anchor [8, 8]; 221 frames. Sprite key `${assetId}/${anim}/${e|s|w|n}/${i}`; feature key `feature/<layer>/<heading>/<frame>`.
- `tools/content-validate.ts`: `checkAtlas(atlas, species: AtlasSpeciesRef{id, assetId, frameSize, headings}[], {file?, png?, marks?})`; `requiredFrames(frameSize)` (SMALL_FRAMES or LARGE_FRAMES; P14_SPRITES pins the Phase 1 sizes); `FEATURE_FRAMES` (`:84–91`: starch_notch, reserve_pocket, resting_seam, glow_center, jacket_rim, cache_marker); `featureFrameKey` (`:96`); `enabledMarks(registry)` (`:101`). Species refs are built in content-validate's main, in `tools/art-build.ts` (from enabled species; it packs every sprite in SPRITES) and in `tests/content/atlas.test.ts`; fungus and virus rules need a category on `AtlasSpeciesRef`.
- `src/ui/atlas.ts` `drawFrame(canvas, atlas, assetId, anim?, index = 0)` (`:28`) looks up `${assetId}/${anim ?? (move ? 'move' : 'idle')}/e/${index}`; `LabTray.tsx:90`, `AddLifeSheet.tsx:18` and `HistorySheet.tsx:112` call it without an animation.
- `src/render`: `features.ts` `featureLayers(cue, life, selected, out)`, `FEATURE_LAYER_IDS` (3 layers), `MAX_UNSELECTED_MARKS` 2; `layers.ts` `paintDepositCell` already draws oil sheen and protein motes; `renderer.ts` imports `@sim/constants` (`:10`) and `@sim/grid` (`:31`), `layers.ts` imports `@sim/constants` (`:6`).
- `art/src`: `index.ts` (SPRITES = A01, B01, B04, B06, P01), `sprite.ts` (AnimName move / idle / feed / reproduction / stress / death; SMALL_REQUIRED, SMALL_STATIC_REQUIRED, LARGE_REQUIRED; `orient()` derives headings at build time), `palette.ts` (no Phase 3 colours yet), `px.ts`, `sprites/b01_sprinter.ts`, `sprites/core.ts`, `layers/modules.ts` (FEATURE_LAYERS, 3 layers). `tools/art-build.ts` uses ATLAS_W 512 and has `--check`; `tools/asset-preview.html` already has grayscale and protan/deutan/tritan views.

**UI**
- Lab strings (`src/ui/strings/lab.ts`): LabCategory (`:12`: inspect, life, food, chemistry, habitat, tools, observe); Chemistry hint "More chemistry arrives in a later update." (`:25`); `FOOD_MATERIALS`, `CHEMISTRY_MATERIALS` (`:33–34`); `RADII` [1, 3, 6]; `ERASE_STRUCTURE` (`:108`); `MATERIAL_COPY` (`:128`); `FALLBACK_MATERIAL_COPY` (`:163`); `LIFE_COPY` (`:171`); `OVERLAYS` (`:244`: sugar, nutrient, oxygen, co2, light, starch, detritus, eStarch); `BRUSH_COPY`; `LAB_TEXT.details`; `habitatList(habitats, attachment)`; `skippedText` (not exported); `habitatEditOutcome`. `LabView.tsx`: labRadius default 3, labDoseIndex default 1; structures and erase live in the Tools tray; `styles.css` has `sw-<id>` swatches. Phase 1–3 chemistry and food materials have doses [0.02, 0.1, 0.5], defaultDoseIndex 1.
- New Dish (G5; g2-close is editing these): `RecipeOverrides {mutationPreset, founderMode, empty}` (`protocol.ts:37`); `host.ts` `build()` (`:1121`) applies the transform, `recipeProvenance()` (`:1149`), `isAuthoredRecipe()` (`:1188`, false for empty starts); `recipes.ts` `RecipeOverridesRecord` (`:150`); `state.ts` `newDishPreview` (`:276`), `startCustom` (`:444`), `startRecipe(recipeId, name)` (`:465`). Create opens the dish paused in the Lab with the Life tray (D-0030).
- Journal: `src/ui/journal.ts` (JOURNAL_KEY 'pixelmeba.journal', JOURNAL_MAX 200, `setJournalSink`); `src/sim/history.ts` (`history.journal` `:89`, DISH_JOURNAL_MAX 200 `:357`, JOURNAL_KINDS `:369`, `journalRecordProblem` `:464`, `putJournalEntry` `:490`); `state.ts:1206` `keepJournalWithDish` (journalPut, then autosave).
- History samples are pushed in `src/sim/publish.ts` (stage 10); `history.ts` holds `HistorySample`, `sampleProblem` (`:515`, ignores unknown keys), `historyProblem` (`:543–573`) and minute compaction (`summarize` copies `debrisTotal` explicitly, `:131`).
- Settings (`state.ts:57`): reducedMotion, overlayOpacity (0.45), showPrompts, textScale (TEXT_SCALES [1, 1.25, 1.5, 2]), pauseOnDiscoveries?, checkpointRing?; localStorage 'pixelmeba.settings'; `updateSettings` (`:141`; loadSettings merges defaults with stored prefs); the Settings page is `SimplePage` with the settings prop (testids setting-reduced-motion, text-size-200).

**Tooling**
- Playwright: `E2E_PORT` (default 4173) and `E2E_OUTDIR` (default dist); projects phone-portrait 360×800, phone-landscape 800×360, desktop 1440×900; `reuseExistingServer: true`.
- Vitest: environment 'node', include `tests/**/*.test.ts(x)`, no DOM library; `npm run check` = typecheck + lint + test.
- ESLint determinism rules (SIM_DETERMINISM: Math.random, Date, performance, Map/Set) apply only to `src/sim/**`; `src/sim` may not import `@audio/*`.
- `tools/sim-run.ts --perf` prints tickMs p50/p95/p99/max and stageMsPerTick (the seed defaults to the recipe's). `tools/sim-tune.ts` defaults: `--recipes FIRST_DISH_V1`, `--seconds 600`, `--extend 1200`, `--preset standard`, no `--out`; it exports `tuneSeed(registry, opts)` (`:446`) and DEV_SEEDS [104729, 130363, 155921, 196613, 262147, 314159]. `tools/render-bench-run.ts` PORT 4176; `tools/review-opening-loop.mjs` targets 127.0.0.1:4173 and writes `docs/reports/img/g1/`.

### Preflight
- The seven g2 recipes: CLEANING_CREW_V1 (seed 103, 10 B04, Standard); FIRST_DISH_V1 (phase 1, seed 104729, 24 B01 + 12 B06 + 8 B04 + 12 A01, Standard, Identical, backgroundOverrides {sugar: 0}); FOOD_TRAIL_V1 (seed 101, 30 B01, 2 scheduled); LIGHT_AND_LIFE_V1 (seed 102, 30 A01); PREDATOR_BALANCE_V1 (seed 106, 100 B01); RESERVE_COMPARE_V1 (seed 104729, 24 B01 with E05 alternate-odd, Fixed, 5 scheduled); STARCH_UNLOCK_V1 (seed 104729, 12 native B06, Fixed, sugar 0.1 + starch 0.6 patches). Experiments EXP_101/102/103/106/A/B/C (all phase 2; no EXP_104/105 yet); variants R-G0 … R-G3 (R-G1/R-G2 patchSet, R-G3 patchMove, all on FIRST_DISH_V1).
- g2 sources: P01 only through EXP_106 arm B (5 at 0 s) and EXP_B arm B (2 at 120 s); shade only through EXP_102 arm B; no content seeds E01 (`E01.json` nativeEquivalents ['B06', 'F02']).
- Decisions: the last committed is D-0032; D-0033 is reserved (cited by D-0030) and is being implemented by g2-close.
- Preflight step 8 repeats g2-close's TUNE measurement (G12).
- `tests/tools/sim-tune.test.ts:165–182` gives RESERVE_COMPARE_V1's B01 founders E01 and adds a starch patch; the STARCH_UNLOCK_V1 E01 transform must also switch B06 → B01 (P-20).

### Wave 1
- **Foundation.** Link storage per ARCH §5 (links Int32Array(6000×4), adhesion Int32Array(6000×2)): columns or tables (line 190). CT §14 counts E17 caches (Phase 7) against the 128-object cap, so the objects kind union ('pellet' | 'wafer') needs 'cache' in a later schema step. Sample-slot rows kept as JSON numbers turn −0 into 0 while the hash reads raw bytes: encode held rows as typed payloads (encodeArray-style). ARCH §11.3 puts migrations in `src/persistence/migrations/<from>-to-<to>.ts`, but the code keeps them in `serialize.ts` `migrateWorldState` (D-0019 precedent); follow the code. Removing `FILM_DIGESTION_IMPLEMENTED` makes the inspector claim film digestion for B04 in a film-enabled world before W2's rule lands; harmless while no shipped world has film (G9). The stage8 done-when (g2-replay unchanged) holds only if the foundation's new columns are hash-neutral (G2 Option A); otherwise stage8 sees g2-replay fail because of the foundation, not its own work.
- **Environment.** `grid.ts`: `isStoneEdge(g, i)` = structure NONE and four-adjacent to ST_STONE; `lifeCellOutcome(structure, substrate, LifeBrush{habitatMask, attached})`; `habitatMaskOf`; ST_* and SUB_* codes; `planSealing`, `brushCellOutcome`, `strokeFootprint`. `Grid.geometryVersion` starts at 0; `applyHabitat` bumps it (a fresh world is at 1); `applyHabitatEdit` (on change) and `experiments.ts:446` bump it.
- `SpeciesRT` (`species.ts`): `attached` (def.attachment !== null), `habitatMask`, `inhibitorField` ('inhBact' bacteria, 'inhFung' yeasts and fungi, 'inhPhoto' algae, else null), `secretesStarch` (`:92`), `abilities`, `selfPropelled` = def.speed > 0 (`:88`); `buildSpeciesTable(defs: readonly Species[])`; `registry().species` holds every record regardless of the manifest.
- Chemistry in `transport.ts`: `gasExchange` returns when the lid is closed (rate 0.02, × 0.1 in sediment); `decayActivity(inh*, 0.002)` per tick (1 − 0.002 === 0.998); `neutralize`; `updateDerived` (pH clamp 2–12; moisture water 1, other 0.8). Stage 2 order: diffuse → gasExchange → decays → neutralize → updateDerived. `TransportCache` is per world (`world.derived.transport`; `transport.ts:28`, `:79–86`), rebuilt when geometryVersion changes. Existing tests: `transport.test.ts:59`, `:79`, `:88`; `lab-commands.test.ts:146`, `:214–262`.
- Habitats: `habitatGrid(h, {removeStones})` (`recipes.ts:82`) is pure; `applyHabitat` (`:100`) sets (not adds) baseFields and op fields, zeroes every field on stone and wall cells and bumps geometryVersion; `realizeRecipe` then applies backgroundOverrides to every transport-open cell. HabitatSchema ops: disk {center, radius} and rect {x0, x1, y0, y1}, each with optional substrate (water, gel, sediment, stone, wall, bead), fields and light; a habitat needs guide {summary, biology, rules, example} and phase; the validator checks neither habitat phases nor whether an enabled habitat is used.
- FIRST_DISH_V1 founders: B01×24 at (48,64) r 3, B06×12 at (66,64) r 2, B04×8 at (66,48) r 2, A01×12 at (48,48) r 5 (A01 lives in water only); its 'water' patch substrate is a filter, not a repaint; `realizeRecipe` throws RecipeError (`:285`) when a group has too few valid cells.
- CT §8.1: GEL_COLONY = gel, water channel x 59–68 (all y), no stones, light 0.5, warmth 0.5, O2 0.8, CO2 0.5, nutrient 0.10, sugar 0.10, no initial life. SEDIMENT_EDGE = water for y < 64, sediment for y ≥ 64, stone disk r 13 at (45,43), light 0.8 / 0.15, O2 0.8 / 0.2, CO2 0.5, nutrient 0.10, detritus 0.10 C per sediment cell. WATER_GARDEN = stones r 9 at (42,45) and (83,82), light 0.8, O2 0.8, CO2 0.5, nutrient 0.10, sugar 0.02.
- **Stage 8.** `stageStructures` resets `secreting` and FLAG.secreting, runs `dormancyStep`, skips non-Active organisms (their `secretionCode` keeps its old, hashed value), then `secrete(prof.starch, 'eStarch', 'starch')`: it checks `E <= minEnergy` (`:60`) before paying emitCost × DT (0.4 × 0.1 = 0.04000000000000001) into `ledger.energy.secretion` (`:66`). `Profile` (`phenotype.ts:80`) has `starch: StarchRules | null` {source 'native' | 'E01', emitRate, minEnergy, emitCost, localCap} and `dormancy`.
- Module params: E09 {emitRate 0.02, minEnergy 35, emitCost 0.4, localCap 1}; E10 {minEnergy 35, minBodyMultiple 1.2, filmCap 0.5, rate 0.02, energyPerCarbon 2}; E04 and E12: Wave 4 list below.
- **Art.** Phase 3 sprite records: 16×16 with 1 heading B02, Y01, Y02, X01, F01, F02, V01; 16×16 with 4 headings B03, B05, B07, B08; 32×32 with 4 headings P02, P03, P04. X01 speed 0.4 (motile); B02, Y01, Y02, F01, F02 and V01 speed 0. B02 surfaces gel, sediment, stoneEdge, bead, mesh; F01 and F02 {gel, sediment, bead, mesh} in different orders.
- **Lead.** The WORKLOG legend says "[~] in progress (at most one at a time)", while P3.7 stays `[~]` during W2's parallel P3.3/P3.4 (G17 #11).

### Wave 2
- W2 is the first wave to enable species; W1 enables only 'chemistry', which adds no catalog keys.
- Species: P02 prey B01/B03/B04/B05 'any', B06–B12 'free', A01/A03/A04 'any' (no B02); P04 prey B01–B05 'any', B06–B13 'inSediment'; P01 and P04 list B02 as 'any'; X01 hostIds ['A01'], drainRate 0.02, intakeRate 0, metabolism hostDrain, speed 0.4; V01 hostIds ['B01'], habitats [], transportClass viral, category virus, metabolism viral; B04 foodPriority [detritus, protein, starch, oil] and F01 [detritus, starch, protein], both digestsFilm. `E03.eligibleAncestors` = B01–B11, B13, Y01, Y02 (no algae).
- `movement.ts`: `preyAllowed` (`:103–110`; PREY_FREE reads FLAG.attached at `:108`); `hungryPredator(world, slot, prof)` (`:97–100`); stage 4 writes `c.suitability` via `suitabilityAt` (`:280`). `suitability.ts`: inhibitor exposure halves once if film > 0; OXYGEN_SUPPRESSED; the inspector recomputes suitability (`snapshot.ts:195`).
- `transport.ts`: `filmCoefficients` halves every edge of each film cell (kRf/kDf); `decayViral('v01' | 'v02')` moves decay to detritus C with no N; there is no film decay yet.
- `intake.ts`: K = 6 requests (`:38`); weighted branch `const wk = w[k] ?? 0`; acidPerCarbon, energyPerCarbon and the O2 debit (sp.aerobic) are data-driven; `prof.foods = sp.foods`.
- `births.ts` `divisionBlocker`/`allDivisionBlockers` return DIV_BLOCK_INFECTED when `infectedBy ≠ 0` (`:68`, `:82`); maintenance skips healing when infected; `killEntity` adds remaining E to `ledger.energy.dissipated`; `primaryDamageCause` maps dmgParasite → DEATH_PARASITE_DRAIN; nothing feeds dmgParasite yet.
- UI: `AddLifeSheet.tsx` DIETS map (5 species, `:6–12`), testid `species-<ID>` (`tests/e2e/place-and-undo.spec.ts:21`); the Lab Life tray = `LabTray.tsx` `trayItems('life')`/`itemCopy` with `LIFE_COPY`; its brush = `LabTrayContent.lifeBrushFor` → `grid.ts` LifeBrush; `state.ts:609` `reportCommand` toasts "Added {accepted} {name}." for every inoculate.
- SPEC §10.8 and UX §4.4 require a separate Observe toggle for infection markers; SPEC §7.5 "Infection glyphs show on inspected hosts or with the infection overlay".
- Lysis float trap: floor(0.40 × B / 0.01) gives 27 for B = 0.7 (0.4 × 0.7 / 0.01 = 27.999999999999996) and 13 for B = 0.35. Use `Math.floor(40 × B + 1e-9)` or document the choice, and test conservation (units × 0.01 + remainder = B), not only the formula.
- The 'eroding' film texture needs a state the snapshot reports (e.g. a film cell with no deposition in the last second); define it before drawing it.
- UX §4.3 asks for a diet symbol on Add Life tiles; the plan says diet line; do both.
- ARCH §7 is headed "protocolVersion: 1" (G3).
- g2-close is editing `src/worker/{protocol,host,client}.ts` and `src/ui/*`; W2 builders re-read those files after it commits (art-features owns `protocol.ts`; organisms gains SHARED `host.ts`/`protocol.ts` through W2-13).

### Wave 3
- `validateContent` checks an enabled material only for existence, phase and the paint rules; there is no implemented-materials list.
- Species: B07 [E_OIL_SECRETION], eats metabolite; B08 [E_PROTEIN_SECRETION], eats broth; Y02 no natives, eats broth, speed 0, water/gel; F02 [BRANCHING, TRANSPORT_LINKS, E_STARCH_SECRETION], eats sugar and detritus, b0 2, attachment gel/sediment/mesh/bead (not stone edge). The only native producer flag is `SpeciesRT.secretesStarch`.
- Materials: M01 field → broth (0.10 N per C); M03/M04/M05 activity → eStarch/eOil/eProtein; M09 activity → breaker (doses 0.1/0.5/1); M10/M11 kind 'object', targets 'pellet'/'wafer', doses [1, 1, 1]; all phase 3. The deposit command accepts any finite dose ≥ 0 and radius 0–6 (M09 dose 4 works). `FieldDef.kind` is dissolved, deposit, gas, activity, viral or index; oxygen has material 'none'; co2 is carbon; 'foodObjects' is a system flag with no field.
- `conversion.ts` RULES: eStarch starch → sugar (+sugarN); eOil oil → metabolite (bound N released to free nutrient); eProtein protein → broth (+brothN); effective activity a / (1 + breaker). It records `conversionTally` (per tick), `conversionTotals` (cumulative, saved) and `catalysisCells` (per cell, all enzymes, unsaved, unhashed), never nMoved per cell. `transport.ts` decays enzymes at 0.02·dt and breaker at 0.01·dt; enzymes diffuse 'half', breaker 'normal'.
- `movement.ts` `foodScore` (`:140`) includes 0.5·avail(starch) only when `prof.starch !== null` and E > `prof.starch.minEnergy` (`:152`), as a max over the food terms: the term to generalize bit-identically.
- Experiments: `ExperimentChangeSchema` kinds none, omitPatch {patchIndex}, omitScheduled {indexes}, shade {factor 0.1}, commands {atSecond ≥ 0, commands} (`schema.ts:280–286`); `experimentCatalog` (`experiments.ts:886`) returns cards with phase ≤ buildPhase in id order. Grammar in `pairedRun.ts` `parseMeasure` (`:118`): intake.SP, captures.SP, deaths.SP.CAUSE, consumed.{starch, oil, protein, broth, detritus, film, sugar, metabolite, co2}, converted.starch/oil/protein, field.F, patchInput.N. UI wording in `src/ui/strings/experiments.ts` (`measureLabel` `:42`, `describeCommand` `:185` with a default, `describeArms` `:213` without one, `playerStepText` `:303`).
- Placement: founders go nearest-first into distinct cells with one used-cell mask and birthIds in recipe order; patches use `validPatchCells` → `diskCells` (integer centre), strokes use `brushCells` (cell centre x + 0.5), so a stroke point (cx + 0.5, cy + 0.5) with radius r covers exactly the patch disk.
- UI: a computed 'foodAccess' overlay needs the `OverlayPicker` filter extended, an OVERLAYS entry and a `packOverlay` branch (it takes no selection today). The Explore Feed is `FeedSheet.tsx` FOODS = ['SUGAR', 'STARCH', 'DEBRIS', 'NUTRIENT']. Notebook → Experiments: a single-arm card opens as an ordinary dish; a paired card opens ExperimentRun/ExperimentViewport (camera-only), and its dish is reachable after closing the run. `renderer.ts` `setBrushPreview` builds its 'place' occupied mask from snapshot entities (`:969`).
- Settled or cited, not new decisions: D01 line 359 ("Life includes viral units and whole host–parasite pairs"); activities → Dissolved matches SPEC §2.3; plan §6 item 16 (line 863) already records the clean-water scope.
- Cautions: D04 §9 line 235 ("Sampling transfers all selected owned pools, never a second copy of the film beneath an organism unless the tool separately samples that field"). The "2 of 4 chained F02" sample test runs while f02-links enables F02: use `registryWith` with `allowUnimplemented` and say so, or an F01 chain (visual links are ownership links, D07 §09). Clean water's O2/CO2 baseline is per cell (the habitat's baseFields plus op fields, e.g. SEDIMENT_EDGE O2 0.2 in sediment), not O2_ATMOSPHERE/CO2_ATMOSPHERE. Pellet arithmetic leaves 0.0019999999999918 C after 4,999 ticks, so the remainder moves whole at tick 5,000; compare per-tick N with a tolerance. BUILD_DIRECTIVE P3.9 also lists E201–E204: W3 creates them and W5 must not recreate them.
- Concurrency: three builders edit `src/ui/strings/lab.ts` and `LabTray.tsx` `trayItems` (e1-producers, food-objects, tools-sample) and four edit `snapshot.ts`; the one-line arrays (FOOD_MATERIALS, IMPLEMENTED_NATIVE_ABILITIES) are same-line edits, guarded only by "re-read before each edit".

### Wave 4
- Module params (all phase 3, surcharge 0.02): E04 {attachSeconds 5, minEnergy 35, attachedUpkeep 0.1, detachNoIntakeSeconds 10, detachEnergy 15, lockoutSeconds 10}; E06 {lightHalf 0.35, ceilingFactor 0.7}; E07 {baseSpeed 0.15, lightSensing 2, moveCostFactor 0.1, brighterBy 0.01}; E08 {}; E09 and E10 as in Wave 1; E12 {linkDistance 0.5, linkSeconds 5, minEnergy 20, linkCost 2, maxLinks 2, maxComponent 8, perLinkUpkeep 0.01, severNoIntakeSeconds 10, severEnergy 15, severDistance 0.75, lockoutSeconds 10}. E04 and E12 exclude E13.
- `phenotype.ts`: `activeLoci(sp, genome)` (`:202–206`; E03 → L_DORMANCY is one line, `:204`); `deriveProfile(sp, genome, modules: readonly ModuleRT[] = [])` (`:208`); speed and sensing at `:214–221`, before the modules if/else-if loop (`:240–248`). Profiles are cached per genome index (`profiles.ts` `profileOfGenome`), so state-dependent costs (anchored, per link) belong in stage 7, not in `Profile.upkeep`.
- Locus indices: L_MOTILITY 0, L_FEEDING 1, L_SENSING 2, L_DIVISION 3, L_PH 4, L_SALINITY 5, L_WARMTH 6, L_DORMANCY 7; `activeLoci` is read by `mutation.ts:109`, `branches.ts:123–124`, `founders.ts:107/298`, `history.ts:211`, `lineage.ts:645/657/768`, `pairedRun.ts:801`.
- A01: speed 0, sensingRadius 0, headings 1, habitats [water], lociActive [F, T, F, T, T, T, T, F]; `movement.ts:307` skips `!sp.selfPropelled || prof.speed <= 0 || FLAG.attached`.
- `decide()` (`movement.ts:167–226`): candidates within max(1, prof.sensing), filtered by `canOccupy` and `traceFraction`; score SCORE_FOOD·F + SCORE_SUIT·S − SCORE_CROWD·C (0.5 / 0.4 / 0.1); all scores within 1e-9 → MOVE_WANDER; ties `det(seed, STREAMS.tiebreak, tick, birthId) % ties` (`:208`). Predator pursuit (`:311–337`) runs before `decide()`; `foodScore` (`:140–157`) is 0 for P01–P03 (foodPriority []).
- `maintenance.ts:42–45`: maint = (prof.m + prof.upkeep)·DT; move = MOVE_COST_PER_CELL × movedThisTick × motilityFactor; maintenance is paid first, then movement, and what was paid is split proportionally into maintenance, surcharge and upkeep.
- `intake.ts`: held-meal route `:134–137`; photosynthesis request min(co2, budget × light × avail(co2)), linear in light (`:141`); predators with no foods → PRED_NO_PREY (`:149`); `lastIntakeTick = tick` on any Cs > 0 (`:319`); FLAG.usableIntake when Cs ≥ 1 % of q·dt (`:322`); LIGHT_LIMITED chosen and valued by raw light (`:346–349`). P01–P03 are aerobic, 30 E per C, foodPriority [], predators.
- Ledger: `module-accounting.test.ts:60–62` `energyBalance` does not include 'construction'; E12's 2 E link cost needs a named category ('other' or 'construction') so Σ spent = Σ categories holds (G17 #21).
- Grid: ST_NONE 0, ST_STONE 1, ST_WALL 2, ST_BEAD 3, ST_OUTSIDE 4 (`grid.ts:31–35`); `grid.lightBase` and `grid.shade` are Float64Array; derived light is rebuilt in `updateDerived` when geometryVersion changes (`transport.ts:257`, `:273–281`). A stone cannot be placed on a cell holding a live organism.
- Reasons ANCHORED and LINKED exist (`reasons.ts:61–62`; UI text `strings/reasons.ts:75–76`: "Holding on to a surface.", "Linked to its colony.").
- Mutation: a module gain picks `options[detInt(…, options.length, …)]` and records `world.content.modules.findIndex(id)` (`mutation.ts:153–160`); after the flip E05's recorded index moves from 2 to 3.
- `lastIntakeTick` is −1 for introduced organisms and 0 for new daughters (never set in `births.ts`); dormancy's no-usable-intake clock is `stateTimer`, reset by FLAG.usableIntake (`dormancy.ts:208`).
- CT §3.2: prey lists are ancestor-ID based and "'free' excludes attached"; P02's list includes "free B06–B12". No Phase 3 species holds or traps prey (HANDLING P10 and TRAP F03 are Phase 5); A01 is not eligible for E03 or E04 and has no native DORMANCY.
- Doc texts: SPEC §6.4 (lines 287–290: Score = 0.5·F + 0.4·S − 0.1·C, "E07 uses effective light" for F); SPEC §9 (line 652: stay unless a candidate is ≥ 0.01 brighter); BUILD_DIRECTIVE P3.7 (lines 527–528).
- Recipes by preset: Standard CLEANING_CREW_V1, FIRST_DISH_V1, FOOD_TRAIL_V1, LIGHT_AND_LIFE_V1, PREDATOR_BALANCE_V1; Fixed RESERVE_COMPARE_V1, STARCH_UNLOCK_V1. The wave-A golden file holds cards EXP_101, 102, 103, 106, A, B and comparisons feed and hunters (FIRST_DISH_V1) and starch (STARCH_UNLOCK_V1, Fixed; cannot change).
- The WAVE 4 RULE (line 524) says every enabled module changes FIRST_DISH_V1's mutation options; not true for E08 (FIRST_DISH_V1 has no P01–P07 founders), which changes EXP_106 arm B and later predator dishes instead. The rule's conclusion still holds.
- E06: keep the × 0.70 out of `Profile.q`; the FLAG.usableIntake threshold (`intake.ts:322`) and the lineage intake line (`lineage.ts:531`) read `prof.q`.

### Wave 5
- Content: `StructureSchema` (`schema.ts:127`; kind cell / edge / furnishing / device, guide, iconId, phase); `GuideSchema` (`:60`) requires summary, biology, rules and example on every species, module, material and habitat record, enabled or not (ManifestSchema does not use it). `WorldContent` (`world.ts:44–58`) embeds manifest, species, modules, materials, loci, habitat and provenance, and no structure or tool records.
- Lab tray text: `LabTrayContent.tsx` (`structureRecord`, `paintRecord`; `import.meta.glob` of `content/structures` and `content/materials`); the tray maps purpose = guide.summary, Changes = guide.rules, Watch for = guide.example, and "Does not change" = `BRUSH_COPY.place.sealedUnchanged`/`beadUnchanged`. Tests pinning tray and guide text: `view-switch.test.ts:340–369`, `lab-commands.test.ts:1014–1023` and `:1059`, `tests/content/debris-text.test.ts` (DEBRIS example only).
- Guide text: no summary, biology or example of any record W5 enables (or of the g2 lists) names a species outside the enabled set. Rules-only mentions under the phase ≤ 3 lists: ACID, INH_BACT, INH_FUNG, INH_PHOTO, METABOLITE, OIL, PROTEIN, SALT, M01, E03, E06, B02, B08, F01, F02, P02, P03, P04, Y02; under the g2 lists: A01, B01, E01, E03. Texts use plural names ("Crumbsmiths").
- Diet wording helpers: `src/ui/strings/shortcuts.ts` `foodWord()`, `listWords()`, `dietAnswer()`; `src/ui/strings/lab.ts` `habitatList(habitats, attachment)`.
- Recipes: `applyHabitat` (`recipes.ts:100`), `validPatchCells(g, center, radius, substrate)` (`:135`), `habitatGrid()` (`:82`) behind What if? validation (`recipeGrid()`, `variants.ts:120`; `tests/recipes/variants.test.ts:182` checks it against realized dishes). `FounderSchema` (`schema.ts:205`): species, count, center, radius, modules, moduleAssignment 'all' / 'alternate-odd' / 'alternate-even' (the last two already realize L306's "E10 on 20, none on 20"), label. `RecipeSchema` (`:229`): question, labels, lid, removeStones, backgroundOverrides, founderMode identical / varied / diverse, mutationPreset standard / accelerated / fixed, testOnlyOverrides (`:246`, never realized); no geometry ops.
- Experiments: `experimentProblems` (`experiments.ts:210`) requires intervention, predictedTradeoff, confounds, a tick-aligned stoppingSeconds and ≥ 1 measurement; player steps must match paired/single (PAIRED_STEPS viewComparison, viewPreyHistory, `:175`); the playerSteps enum (`schema.ts:294`) is inspectFoodUse, openResourceHistory, viewComparison, viewPreyHistory; GATE_OPS gt, gte, lt, lte, eq, ne (`experiments.ts:92`). Foundation-card convention (D-0022; CLEANING_CREW_V1, FOOD_TRAIL_V1): WATER_GARDEN with stones, Standard, Identical, nearest-first at the patch centre, r 6. EXP_103 stops at 180 s; neither CT nor the plan gives stoppingSeconds for EXP_104/105.
- Viral patches: v01 is viral at 0.01 C per unit on system 'viruses'; the realizer logs viral patch carbon via carbonPerUnit. protein, oil and metabolite are core; broth is enzymes; film is film.
- New Dish: `startCustom({recipeId, name, seed, mutationPreset, founderMode, empty})` and `newDishPreview(recipeId, seed, overrides)` accept any recipe id; `startRecipe(recipeId, name)` (`state.ts:465`) starts an authored recipe with no overrides.
- Audio: `src/audio` does not exist yet; the `@audio` alias is in `tsconfig.json` and `vite.config.ts`; `main.tsx` handles visibilitychange and 'pixelmeba:pause'; there is no haptics package; `android/app/src/main/AndroidManifest.xml` declares only INTERNET (`:40`). ARCH §10.3 cue ids: drop, select, save, discovery, compare_result, division, placement_ok, card_open, gate_click, wake; UX §8.1 adds placement_error; BUILD_DIRECTIVE P3.10 says "gate click later"; narration is P4.9.
- Names and relations: B04 Recycler, P02 Ciliate, V01 Pinphage, B01 Sprinter, B06 Crumbsmith (unattached; water, gel, sediment), F02 Cordweaver (b0 2; gel, sediment, mesh, bead; sugar then detritus). Velvet (B02) predators among P01–P04: P01 and P04.
- Founder module eligibility at HEAD: B01 E01/E03/E05, Y02 E01/E03/E05, B08 E03/E05; after W4 add E04 (B01, B08, Y02), E09 (Y02; native for B08), E10 and E12 (B01).
- Concurrency: field-guide and experiments-curated both edit `content/`, so each rewrites the contentHash with `content-validate --write`.

### Wave 6
- Keyboard: `DishScreen.tsx:126–165` window keydown (Space with the D-0029 modality rule, 1/2/4, '.', Escape, U, +/=/−, arrows; ignored while What if? is open); `LabView.tsx:402` `handleViewKey` (I, L, F, Esc); no '/' or Enter handler. Gestures: `attachGestures` handles pointer, wheel, contextmenu and pointerleave only (`gestures.ts:151–157`); `DishScreen.tsx:93` passes `labGestures({paints, onTap, onStroke, …})` (`LabView.tsx:375`).
- Focus: `styles.css:61` `:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px }`, `--focus` #f2b84b; contrast 1.63:1 on #F5F4EF, 1.47:1 on #EBE9E1, 1.29:1 on #DEDBD0, 8.81:1 on #14252D.
- Colours: `src/render/layers.ts` C, RAMPS, colormapFor, legendStops (legend UI in `OverlayLegend.tsx`); `src/render/speciesColors.ts`; `TRAIT_BAND_COLORS` (`renderer.ts:45`).
- Live regions: polite status toasts mounted only while shown (`DishScreen.tsx:247`, `CompareScreen.tsx:140`, `ExperimentRun.tsx:167`, `App.tsx` PageToast `:24`); LabView's sr-only view announcement (`:461`); DiscoveryCard's sr-only status; the Inspector shortcut answer region (`:314`); HistorySheet (`:456`) and TraitGraphs (`:492`) sr-only text; role=status/alert paragraphs in WhatIfSheet, CompareSetup, NewDish, NotebookJournal, LabToolbar and the DishScreen prompts.
- Routes (`state.ts` Route): home, play, dish, guide (placeholder SimplePage), settings, about, saves, newDish, compare, notebook {journal, experiments}, experiment, experimentRun. Dish sheets: addLife, feed, inspect, more, save, history, lineage, evolution; What if? is a modal (WhatIfHost in DishScreen and Play). Inspector shortcuts: shortcut-eat, shortcut-why ("Why did it stop?", focuses why-stop), shortcut-family, shortcut-changed; tabs Happening now / Passed to offspring / Details. History tabs: Charts, Regions, Table, What happened.
- Snapshot: `DishHost.sendSnapshot` (`host.ts:1567`) runs at most every 100 ms while running (SNAPSHOT_INTERVAL_MS, `:210`) and after commands, steps, undo and view changes; it carries ents, ids, deposits (6 × 16,384 bytes; the `protocol.ts:280` comment still says 5), overlay, geometry (only when changed), lineage marks, events, the inspector, speciesCounts and evolution state, and no per-species biomass (that is in the 'history' reply: `HistorySample.biomass`) and no aggregation (`renderer.ts:479` `paintAggregation`).
- `docs/EXPANSION_RESPONSE.md` at HEAD is the G1 edition: §1 identity, §2 scope, §3 resolved spec, §4 G1 evidence, §4b G0, §5, §6, §7 (p50 1.28 / p95 2.61 / p99 4.62 ms at ≤ 710 agents), §8. D-0015's proposals are in `docs/reports/tune-g1.md` ("Proposals only" `:249`, "Candidate measurements" `:302`).
- determinism-g3: L303 alone exercises only enzymes, broth and Diverse seeding; prefer the hand-built mix with the FakeClockHost pattern of `tests/fixtures/deterministic-state.test.ts`. perf's `tools/perf-stress.ts` is written in the same wave and may not be ready.
- Concurrency: perf edits `src/sim` hot paths while g3-evidence runs `sim:tune` and determinism-g3; hash-neutral changes keep hashes equal, but a mid-edit tree can crash runs and timings differ, so regenerate tune-g3 timings after perf is integrated.
- The perf target "p95 < 10 ms" is stricter than SPEC §16 / P3.12 ("1× tick < 10 ms"), which is acceptable; the heap slope "< 1 %/min" is the plan's own reading of "no memory growth", not a doc number.

---

## Refuted by the skeptic

One line each, so the lead knows what NOT to write or change.

### Preflight
- Fact "the working tree has only `tools/sim-run.ts` modified": wrong; 17 tracked files are modified plus untracked g2-close files.
- Fact "ENTITY_COLUMNS spans `entities.ts:16–98`": it spans 16–94.
- Fact "tests the W4 flip moves" (short list): incomplete; use G4's list.
- Fact "g2-close ports" without 4196 and 4221: incomplete; the re-verifier used 4221 (W2 film-fungi's port) and the review rerun 4196.
- P-03 "the atlas check runs only in `npm run content:validate`": wrong; `art:build` and `tests/content/atlas.test.ts` (npm run check) run it too.
- P-09 "the object-cell refusal can only be implemented in `applyHabitatEdit`/`brushCellOutcome`": overstated; a `commands.ts` pre-check is possible but runs `strokeFootprint` before the stroke is bounded and bypasses the skips and the preview, so it "belongs in" `applyHabitatEdit`.
- P-10 "that is a rewrite": overstated; additive oil/protein blocks beside the starch block are possible. The row stands because the prompt says "generalize".
- P-18: the plan's list covers 19 of 67 columns (genome counted as genomeKey), not 18.
- P-20 "as `tests/tools/sim-tune.test.ts:178` does": inexact; that test gives RESERVE_COMPARE_V1's B01 E01 plus a starch patch, and the STARCH_UNLOCK_V1 transform must also switch B06 → B01.
- P-23 "the decision must record an evolutionRulesVersion bump": too narrow for a non-evolution fix; SPEC §15 speaks of rules, content and registry versions, and simulationVersion is pinned.
- P-16: its first module-accounting range was wrong (use 128–130) and its test list was incomplete (merged with W4-20).
- Plan line 213 "plus the Phase 2 paints if still missing": moot, GEL, SEDIMENT, SHADE and WATER are enabled (W1-13 drops it).

### Wave 1
- Fact "HEAD is f96da4f": HEAD is `3ebfdf5`, a docs-only commit on top; the code is the same.
- W1-04 "the E04/E12 division resets must land in W1": refuted; W4 already has `births.ts` SHARED for exactly those (lines 533, 588). W1 does only the re-key.
- W1-06 "newly realized Phase 2 recipes keep hashing as the g2 build did": wrong; fresh worlds move with contentHash/contentVersion (`serialize.ts:229`). Only worlds loaded from g2-era saves can stay identical.
- W1-05 "change line 97 to toBe(SCHEMA_VERSION)": vacuous there (line 97 asserts SCHEMA_VERSION itself); it becomes toBe(4).
- W1-07's first version omitted the −1 fill for link slots; the table text includes it.
- W1-13 "the New Dish start choices are in `src/ui/strings/modes.ts`": wrong; they are inline in NewDish.tsx's ChoiceGroup (`:202–218`).
- W1-22: the evidence line for the E ≤ minEnergy check is `structures.ts:60`, not `:59`.
- W1-26: downgraded MAJOR → MINOR; the 12 % rule is satisfiable, but it pushes B07 off B03's outline, and fungi and V01 have no loop frame.

### Wave 2
- Nothing refuted outright; every correction and fact held at HEAD.
- W2-02 "wave 2 is the first wave to enable systems": wrong; W1 enables 'chemistry'. W2 is the first to enable species.
- W2-02/W2-16 "'devices' stays off through Phase 5": wrong; its structures arrive with P5.2. Use 'developmental' (Phase 7).
- W2-14: `grid.ts` must not import `src/sim/viruses.ts` (`src/render` imports `grid.ts`); the V01 preview needs a viral marker from DishInfo and the toast in `state.ts` needs honest copy.
- W2-21: not fixed to LIFE_PREPARING; a test-only registry with E03 eligible for A01 is an equal alternative.
- W2-23: film-fungi's done-when "Connection masks equal the link table" moves to art-features; it is not dropped.
- W2-25: a `visualEvents()` pass-through for 'objectEmptied' in W2 is a TS2367 error until `EventType` has the member, so it belongs to W3.
- Dropped candidate: "film edge-halving is blocked by a missing markField call" is false (fieldActive starts at 1 and film never deactivates); add no markField call.

### Wave 3
- W3-20 "never rewind nextSeq; rewinding breaks command-log replay": refuted by the W3 skeptic; restoring `nextSeq` together with `commands.log` (as Undo does) is replay-safe. The W6 checker disagrees for the after-reload case; that is G10's lead choice.
- Fact "`src/sim/implemented.ts`": the path is `src/sim/content/implemented.ts`.
- Fact "the only untracked files are KeepChoice/KeepSheet/keep.ts": incomplete; `docs/reports/*` and three test files are untracked too (none collides with W3).
- W3-14's first text painted only the chain's cells while calling the dish "all-gel"; the table text sets every in-dish cell to gel.
- W3-15's first text missed `renderer.ts` `setBrushPreview`, which would otherwise promise placement on object cells.

### Wave 4
- W4-20 "`modules.test.ts:100–102` fail": refuted; loss options are the carried modules, so they pass. (It also missed `:117`, `:122` and the atlas lines, now added.)
- W4-24 "the golden file will fail": overstated to "likely"; EXP_101's recorded E01 gain stays E01 when f < 1/6.
- W4-03's E06 clause: refuted; if E06's × 0.70 is applied outside `Profile.q`, branch and ancestor intake match and no false "Game rule" line appears. Do not add E06 lineage edits.
- W4-18 "a link-count field is needed for the LINKED line": not needed; the text is "Linked to its colony." Only the upkeep split needs a protocol field.
- W4-07 "stamp the clock in `intake.ts` next to FLAG.usableIntake for every organism": rejected; it would fill a post-g2 column in Phase 2 worlds, W1 does not own `intake.ts`, and a stamp needs start values. Use a seconds counter advanced only for E04/E12 carriers.
- W4-17 "E = 35.06": fails when E10 goes first (it costs ≤ 0.004 E); use 35.042.
- Fact "E_CUE bits are exhausted": overstated; E_CUE is Float32 and bits 11–23 are exact. E_CUE2 is a choice.
- Fact "`deriveProfile(sp, genome, modules)`": the parameter is `modules: readonly ModuleRT[] = []`.
- Fact "`foodScore` adds the producer term": it takes the max.
- Fact "consumePrey spans `contacts.ts:95–140`": it spans 93–141.

### Wave 5
- None refuted outright; all 23 rows hold.
- W5-05 "only predation pairs can be derived from events": overstated; after W3, lysis and parasite-drain deaths are recorded 'death' events. The watcher is still needed for intake by food, infection and attachment moments, and conversions.
- W5-07 "'stores it with the dish, sim time and event id' means saving with the dish": the phrase may just list fields; the real conflict with line 872 is P2.8's sink, which saves and autosaves any entry with a worldId.
- W5-06 "do not edit the NUTRIENT or DEBRIS texts pinned by tests": overstated; the tests pin one NUTRIENT sentence plus the no-organism rule and the DEBRIS example only, so appending "No additional modeled reaction." is safe.
- W5-17 "B01, Y02 and B08 gain eligible modules only after the W4 flip": wrong; they have E01/E03/E05 (B08: E03/E05) at HEAD.
- W5-03 "ManifestSchema uses GuideSchema": wrong; only the species, module, material and habitat schemas do.
- W5-20's first choice "derive 'wake' in `src/audio` from E_LIFE": rejected; it needs LIFE_* from `src/sim/entities.ts`, which the plan's own test forbids. Add 'wake' to VisualEvent. It also missed `sendLabCommand`, now listed.
- W5-11's first version applied ops outside `applyHabitat` (skipping the structure-cell zeroing and the geometryVersion bump) and missed `habitatGrid()`/`recipeGrid()`.
- W5-15's first version missed Water Garden's background sugar 0.02 (F02 food).
- W5-14's first file list was wrong: the PlayerSteps class needs no change.
- Evidence lines corrected: `experiments.ts` re-exports are `:65–84`; the registry founder loop is `:260–277`; host player steps `:796–818`; structures load at `content-fs.ts:38` and `raw-vite.ts:35`; realizer founders `recipes.ts:266–302`.
- Fact "Sim events": incomplete; stressOnset, capacity and secretionStart are also declared but never emitted.
- Fact "introduceOrganism" constants: INITIAL_NUTRIENT_RATIO is `constants.ts:46`, INITIAL_ENERGY `:58` (they were swapped).

### Wave 6
- W6-15: downgraded MAJOR → MINOR; the step is optional, only the default tags overwrite the G1 images, and git can restore them.
- W6-21 "no inverse move can restore the pre-begin hash": overstated; a host-level rewind of nextSeq and the log could. The W6 checker calls that a replay gap, which the W3 skeptic disputes (G10).
- W6-27: the existing `v === 3` step is `serialize.ts:168`, not `:172`.
- W6-14: a 4176 collision needs a leftover server or parallel verifier lenses; builder and verifier run one after the other.
- W6-10: deposits are 6 bands × 16,384 bytes (not 5); the snapshot also carries geometry and evolution state; `packLineageMarks` is in `src/sim/lineage.ts`, not `snapshot.ts`.
- W6-07: two more toast hosts exist (`CompareScreen.tsx:140`, `ExperimentRun.tsx:167`).
- W6-26: the P2.7 section of `structures.ts` starts at `:96` (header); its code starts at `:117`.
- W6-24: the replacement was widened to cover the JOURNAL_MAX eviction and field-guide's missing `src/sim/history.ts` entry.
- Facts: `historyForSchema3` is called at `serialize.ts:168`; the atlas `features` table is keyed by layer name (only frame keys use `feature/<layer>/…`); stateHash hashes only nextEntityId/nextBirthId (not nextEventId), not `ledger.energy`, the log or events, and it hashes highWater; the live-region list was incomplete; snapshots are also sent after commands, steps, undo and view changes; the filmCoefficients skip is at `transport.ts:294`.

### Checked and correct as written (leave alone)
- NativeAbility order; `FILM_DIGESTION_IMPLEMENTED`'s location and use; `worldContentFor`/`allocateFields`; `manifestOverrides` is unimplemented; the `filmCoefficients` cost (risk 6); protocol v1/stride 12 → v2/14; the moduleRegistryVersion 1 → 2 flip; the 19-species scope and module list; the Garden start ("56 alive"); CT/SPEC numbers in risks 3, 4, 14 and 16; the UX §4.2 map and focus colour; D02 ~761; EXPANSION_RESPONSE §7's G1 numbers; CT §11 seeds and 600 s; risk 28 (`structures.ts` holds the P2.7 helpers).
- Line 102's eligibility claim (B01, B04, B06, A01, P01 gain options) holds; only its consequences were incomplete (P-16).
- §1's W3 stage owners (births.ts → f02-links, conversion.ts → food-objects, commands.ts → tools-sample) match the W3 prompts.
- W3 numbers match CT/SPEC: B07/B08/Y02/F02 profiles (CT §1.2–1.3); producer emission 0.02/s at E > 35, 0.40 E/s, cap 1.0 (SPEC §5.3, CT §12.6); M01, M03–M05, M09, M10, M11 doses and release rates (CT §5.2, SPEC §5.1); 128 objects (CT §14); F02 transport rules (SPEC §7.7, CT §12.6); E201–E203/E212 setups (CT §10.3); clean water 25/50/100 % (SPEC §10.6); radius 1/3/6 and capacity 8.
- W4 doc references: D04 §2 C06/C08, §5, §6, §9, §13 rows; CT §7.1 and §12.6 numbers; R17; SPEC §6.7 "never both".
- Ports within the plan: W1 4211–4214 (verifiers 4216–4219), W4 4241–4244 (4246–4249) and W6 4261–4263 (4266–4268) clash with nothing in the plan; only g2-close leftovers do (G12).
- Every file a wave marks "(new)" is absent at HEAD; files the prompts treat as existing (`tests/content/atlas.test.ts`, `tools/art-preview.ts`, `tools/asset-preview.ts`, `src/sim/moduleView.ts`, `dormancy.ts`) exist.
- The plan follows the code (not ARCH §11.3) for where migrations live; that is fine.

---

## Sections not verified

None. All seven sections (plan lines 1–888) had a checker and a skeptic, and every row above survived the skeptic. Two things were out of scope: g2-close's uncommitted edits (re-check the files in G16 after it commits), and runtime behaviour, because nothing was built, tested or simulated for this check.
