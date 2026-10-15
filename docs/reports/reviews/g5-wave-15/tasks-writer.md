# Wave 15 task writer report: "Experiments and prompts"

I wrote one file: `docs/agent/g5-wave-15.tasks.js.txt`. It describes HEAD 1c9d8a2. Wave 14 is in the working tree and was not read as built; everything that depends on it, or on THE HABITAT ENABLE, is a `<lead: …>` placeholder.

## Parse check

```
$ node -e "const s=require('fs').readFileSync('docs/agent/g5-wave-15.tasks.js.txt','utf8').replace(/^export /gm,''); new Function(s+'; return WAVE_TASKS.map(t=>[t.key,t.port,t.stage,t.critical||false,t.prompt.length])')().forEach(r=>console.log(r.join(' ')))"
measures-overrides 4271 1 true 28406
p5-polish 4272 1 false 11699
cards-curated 4271 2 true 14068
prompts-succession 4272 2 own 23954
```

I also ran a dry run of `python3 tools/lead/build-run-file.py … measures-overrides,p5-polish,cards-curated,prompts-succession <scratchpad>/run15.js.txt docs/agent/g5-runner-ft.workflow.js.txt`. It printed "parse ok". The output went to the scratchpad, not the repo.

## Stages and file ownership (one owner per file per stage)

| Stage | Task (port, critical) | New files | Owned shared files |
|---|---|---|---|
| 1 | measures-overrides (4271, `true`) | 7 recipes (GLOW_THRESHOLD, QUIET_NEIGHBORS, BRINE_CROSSING, GLASS_BUDGET, GATE_MEAL, SLEEPING_SHORTAGE, SHELTERED_LACE); EXP_205–211; tests/experiments/{measures-p5, observer-neutral-p5, test-overrides, e205-e211, p5-recipes-determinism}; tests/worker/{experiment-steps-p5, test-overrides-host}; tests/persistence/recipe-file-test-overrides; docs/reports/experiments-g5.md | pairedRun.ts, experiments.ts, recipes.ts, schema.ts (recipe and experiment sections), registry.ts (recipe and experiment checks), serialize.ts (one hash term), host.ts, protocol.ts, saveFile.ts (meta copy), recipeFile.ts (import refusal), manifest contentHash, fence.json (only through `--add`) |
| 1 | p5-polish (4272, not critical) | tests/render/{picture-grit, edge-glyph-sweep}; tests/ui/{test-override-disclosure, measure-words-p5}; tests/e2e/experiments-p5.spec.ts and its fixture | picture.ts, structureLayer.ts, gateBadges.ts, renderer.ts (aggregation tones only), speciesColors.ts, art palette and the F04 and V02 sprites, public/atlas, contrast-audit.ts, Inspector.tsx (the INHIBITOR line), ExperimentCard.tsx, ExperimentRun.tsx, strings/{experiments, modes}.ts, the mode-label argument at the worldModesLine call sites |
| 2 | cards-curated (4271, `true`) | 6 recipes (TEMPORARY_TRAP, SHELL_HANDLING, FUNGAL_HITCHHIKER, DIFFERENT_HOST, RIVAL_NO_WINNER, NIGHT_SHIFT); L302; L305; EXP_213–218; tests/experiments/e213-e218 | p5-recipes-determinism (append), curated.test.ts, experiments-p5.spec.ts and its fixture, curated-dishes.spec.ts, the New Dish curated list file (placeholder), sim-tune.ts (only if needed), fixes to pairedRun.ts, experiments.ts and recipes.ts, manifest contentHash, fence.json (`--add`) |
| 2 | prompts-succession (4272, `'own'`) | succession.ts, notebookSuccession.ts, NotebookSuccession.tsx, strings/succession.ts, 7 objectives, 9 test files, 2 journeys and their fixture | objectives.ts, schema.ts and registry.ts (objective sections only), goals.ts, challenge.ts, notebookWatch.ts, relationships.ts (exports one helper), host.ts, protocol.ts, notebook.ts, notebookGoals.ts, notebookChallenges.ts, Notebook.tsx, GoalChoice.tsx, ChallengeEditor.tsx, ui/{goals, challenge}.ts and their strings, bookmarks.test.ts (the size tripwire), manifest contentHash |

- **verifyGroups:** [['measures-overrides', 'cards-curated'], ['p5-polish', 'prompts-succession']], on ports 4390 and 4391.
- **Saves verifiers:** prompts-succession on 4396; one shared verifier for measures-overrides and cards-curated on 4397.
- **Other ports:** re-verify uses 4394. 4398 stays free, and 4290 is never used.

## PROPOSED DECISIONs

1. **Stage layout.** I kept the lead's default of two stages with two tasks each, and did not split prompts-succession. The files would be disjoint enough to split. But on 2 cores the critical path stays about 6.5–7.5 builder-hours either way, because stage 2's length is set by its longest task. A split would also add a third saves verifier, and the runner would put it on 4398, which must stay free.
2. **Critical flags (argued against the lead's "cards-curated critical 'own'").** The runner numbers saves verifiers 4396 + i. The `'own'` tasks come first, in TASKS order, and one shared verifier follows them for all `critical: true` tasks. Three `'own'` tasks would therefore use 4398. My choice:
   - prompts-succession is `'own'` (4396). Its persisted notebook state (goal-progress keys, a challenge region kind and the succession kind) needs its own verifier.
   - measures-overrides and cards-curated are `critical: true` and share 4397. Both are recipe realization and determinism work, and stage 2 builds directly on stage 1.
3. **Disclosure UI goes to p5-polish.** The setup panel, the "test‑only override" mode labels and the words for the new measures and steps all go to p5-polish. measures-overrides writes the protocol and sim names first, in its item 0. Without this move, stage 1 would be one task of about 5 h next to one of about 1.5 h. With it, both are about 3 h, and the simulation task touches no UI file.
4. **Test-only override rule.**
   - `TEST_OVERRIDE_FIELDS = ['speed']`, the one field CT names (E214). The target is `species:<ID>`, which must be a species the recipe uses.
   - realizeRecipe always applies a recipe's overrides to the world's recorded species copy and records them in `provenance.testOnlyOverrides`. The recipe is the fixture: the fence, the headless runner and the app all realize the same dish.
   - The ordinary sandbox refuses such a recipe: build() (New Dish, What if?, compare and Try starts) and the recipe-file import. The validator refuses a variant or a curated start built on one.
5. **Hash term.** stateHash hashes the overridden fields only when a world records overrides (the D-0035 rule). Without it, an overridden dish and a plain dish hash the same at tick 0, because species copies and provenance are not hashed.
6. **Recipe export.** Experiment dishes keep the 'no-start' export refusal, so no Starting recipe file of an overridden dish is ever written. "Disclosed in the export" means three things:
   - The save export carries the provenance and the species copy, plus a meta copy that feeds SlotModes.testOnly.
   - The recipe-file import refuses a file whose source names a recipe with overrides.
   - The resolved recipe body would carry testOnlyOverrides verbatim if a file ever held one.
7. **Measurement grammar.** New measures: `resting.SP`, `glowing.SP`, `glowingStart.SP`, `attached.SP`, `events.TYPE.SP`, `firstCaptureAt.SP`, `intakePhoto.SP` / `intakeSugar.SP`, `infections.SP.VIRUS`, `wholeUnitCells.SP.VIRUS`, `secretingSeconds.SP` (secretionEnergy only if the energy is recorded), `gateTransfer.KIND.F`, `gateCrossings.KIND`, and `@REGION` forms of alive / resting / biomass / `mean.F` / `moisture`. Regions are read from the world's recorded habitat, never from the registry.
8. **isSuitabilityReason gains RIVAL_EXPOSURE.** suitability.ts:128 writes it as the suitability reason, so `limitSeconds.SP.RIVAL_EXPOSURE` always reads 0 today.
9. **Player steps.** Only 'inspectGlow' (E205), 'toggleShutter' (E207) and 'inspectMoisture' (E211) are added.
   - E206 and E217 are paired, and PAIRED_STEPS lets a paired card list only viewComparison and viewPreyHistory. Their "inspected" items are therefore measured clauses plus viewComparison.
   - No new ExperimentCommand kind: E207 is single-arm and the player toggles the shutter, so the briefs' setBarrier is not needed.
   - The host must not end E207 as 'changed' on the toggle its step names.
10. **omitFounders generalization (briefs E215).** Any group may be omitted if every later group lists its cells. The later groups' birth ids then shift, which is harmless because every measure is by species or region.
11. **`RecipeSchema.furnish`** is optional. Its ids come after the recipe's devices. It serves E216's mesh, an S06 disk of radius 6 at (64,64) (briefs E216).
12. **E205 founders.** I placed 30 B09 by 'nearest' within radius 4. CT's radius 3 holds only 29 cells, and founders need distinct cells.
13. **E206 timing.** atSecond T is the first whole second of seed 206 with a glowing B09, found by a headless run and pinned by a test. The stopping point is T + 30 s. A clause `glowingStart.B09 ≥ 1` proves the copies came from a glowing dish.
14. **E214 contact geometry is measured first.** If no placement in distinct cells gives continuous contact at P10's reach, the builder reports the distances as the limiting factor. The fix is the smallest honest setup change, never a rule change.
15. **Stopping points where CT names none:** 180 s for E207, E208, E210 and E216; 120 s for E205 and E215; 10 s for E214. CT's own numbers are kept: E206 30 s after the split, E211 600 s, E213 12 s, E217 180 s, E218 240 s.
16. **Founder placement and detritus.** Founders are placed by 'scatter' within radius 6 (D02 §21), except listed cells and E205. Detritus patches carry detritusN at 0.10 per carbon (CLEANING_CREW_V1's precedent).
17. **L305 founder mode is Identical.** This follows L306's precedent and keeps the split exact: 6 Dartfins with E11 by alternate-odd, 6 without. CT names no founder mode. L302 is Diverse, as CT says.
18. **Predicate parameters (D-0106: no new types).**
    - keepSpeciesAlive gains a species list, minCount, region / regions, and minSpecies.
    - biomassThreshold gains measure (biomass, count or activeCount), region and fromBelow.
    - observeEvent gains `all` clauses, `window: 'cycle'` and `endOn` (linkBroken, externalInput). It also gains the measured pseudo-events intake, consumption and transfer.
    - OBJECTIVE_EVENTS gains every Phase 5 event type.
19. **Goal progress gains optional `clauses`, `amounts` and `cycle`.** A resumed all-of goal then completes at the same tick as an uninterrupted run (D-0078's standard). Single-event goals keep today's keys.
20. **Objective offers and the Recover template.**
    - `ObjectiveSchema.offerOnHabitats` matches the world's recorded habitat id. Today a New Dish habitat start is FIRST_DISH_V1, so goals keyed by recipe cannot reach it.
    - `challengeTemplate` makes RECOVER_A_NEIGHBORHOOD a starting point in the challenge editor. ChallengeRegion gains `{ kind: 'habitat', id }`.
21. **The seven prompts and where they are offered:**
    - TWO_NEIGHBORHOODS: B01 and B10, at least 6 each in their pools for 180 s; on H05.
    - NIGHT_GARDEN: B09 glowOn plus A01 intake in one cycle; on H08.
    - FOOD_RELAY: on SHARED_LUNCH_V1 and H04.
    - LIVING_BRIDGE: 0.5 C of fungal transfer, ending on linkBroken or an external input; on FUNGAL_SUPPLY_LINE_V1 and H11.
    - LEAVE_A_REFUGE: P08 and F02 for 180 s; on H11. D02 names no grazer–prey pair.
    - SUSTAIN_THREE_SPECIES: on the habitats whose communities have at least three species, and on L305.
    - RECOVER_A_NEIGHBORHOOD: activeCount from below 5 to 20, a budget of 3, all tools allowed, 180 s.
22. **Succession notebook.**
    - A worker detector writes one entry per simulated minute. Entries are structured data (line kinds, values, evidence ids); the sentences are rendered from strings.
    - Gains and losses come from the saved per-second history, so they are exact across a reload. A minute that began before a load or an Undo carries `watchedFromTick`.
    - A producer is named only with producersNear credit; otherwise the D02 fallback wording is used.
    - There are no notifications.
    - SUCCESSION_MAX starts at 360 and is lowered until the D-0090 tripwire holds (under 70 % with the generator's texts).
    - The view is a "Succession" Notebook tab. UX is silent on it.
23. **NOTEBOOK_VERSION stays 1** (argued against g5-plan call 2, and left as a lead placeholder).
    - Six kinds were added as optional keys without a bump since P4.2 (notebook.ts KIND_PROBLEMS).
    - A v1.0 build refuses a schema 5 save at parse time (saveFile.ts:279 at v1.0.0-rc1) before it reads the notebook (line 583).
    - A bump would therefore buy nothing and would re-pin every test that checks notebookVersion.
    - The v1 compatibility test is required either way.
24. **Fence entries.** Builders run `fence-update --add` for the recipes they create, once each recipe is final. The tool's header allows this, and trajectory-fence-current requires an entry for every recipe. A recipe revised after its entry was added has its own uncommitted entry deleted and added again.

## `<lead: …>` placeholders left

- **Wave 14 as built (STATE):** the commit, its D-number and the contentHash. habitatRules.ts's exports and their signatures. Every habitat's region ids and labels, and the HabitatRegion field names. FurnishAreaSchema's export, the id order with furnish, and furnishCells.
- **Wave 14 as built (prompts):**
  - regionContains and regionCells signatures (measures-overrides and prompts-succession).
  - habitatOfferProblem's signature.
  - FurnishAreaSchema's export and shape.
  - H05's, H09's and H10's region ids (E207, E209, E211, TWO_NEIGHBORHOODS).
  - Which habitats' communities have at least three species (SUSTAIN_THREE_SPECIES).
  - Confirmation that all eight records carry suggestedCommunity.
  - The New Dish curated-list file, its entry shape and its test ids (header table, cards-curated, three places).
- **Habitat enable as built:** the commit, D-number, enabledHabitats list, contentHash and fence entries (STATE). The shipped enabledHabitats list (STATE). Whether P5.7 was ticked or left open (LEAD AFTER item 7).
- **D-numbers:** this wave's calls (STATE), and the NOTEBOOK_VERSION ruling (STATE "Versions" and prompts-succession item 4e).

## Contradictions between the tree, the plan, the briefs and the BUILD_DIRECTIVE

1. **Notebook size cap.** The briefs (risk 322) and the lead's task text cite D-0073's 1 MB. NOTEBOOK_MAX_BYTES has been 2 MiB since D-0090, with a 70 % tripwire in tests/persistence/bookmarks.test.ts. The file uses 2 MiB.
2. **NOTEBOOK_VERSION.** g5-plan call 2 and the briefs (281) want 1 → 2 for the succession kind, but the six kinds since P4.2 needed no bump. See decision 23.
3. **No attach event.** g5-plan risk 122 and the briefs' events list include an "attach" event, and SPEC 12.3 lists "attachment" among the events to record. HEAD emits none. Attachment is read from the columns, as relationships.ts does, so E215 uses `attached.X02`.
4. **E205 cannot be built as written.** CT 10.3 asks for 30 B09 within radius 3, but that disk holds 29 cells and founders need distinct cells (SPEC 13.1). See decision 12.
5. **E214 cannot be built as written.** CT and D02 put P10 and P05 both at (64,64), which the distinct-cell rule forbids. Contact at P10's 0.5 reach between adjacent cell centres (1.0 apart) may never happen. See decision 14.
6. **Two briefs items are not needed.** p5.6b's "remaining Suggested Communities" do not exist, because wave 14 authors all eight. The briefs' "ExperimentCommand setBarrier" is not needed either (decision 9).
7. **Shutter toggle ends the card today.** host.ts (~946) ends a single-arm card as 'changed' on any accepted command, so E207's shutter toggle would end its own card. measures-overrides item 3c makes that one command an exception.
8. **Paired cards and player steps.** CT says E206's and E217's readings are "inspected", but PAIRED_STEPS forbids dish inspection steps on paired cards. These become measured clauses plus viewComparison.
9. **RIVAL_EXPOSURE.** isSuitabilityReason misses it, so the measure the briefs list for E217 reads 0 at HEAD.
10. **Fence ownership.** The plan's fence rule ("never run fence-update") held in earlier waves. This wave adds 15 recipes, and trajectory-fence-current requires an entry for each. Builders use `--add`, which the tool's own header allows for recipes they create.
11. **Goals cannot reach habitat dishes.** goalCatalog matches on the recipe only, and a New Dish habitat start is FIRST_DISH_V1, so the briefs' "offerOn … H05 / H08 / H04" cannot work without offerOnHabitats (decision 20).
12. **P5.6 has no "Done when".** BUILD_DIRECTIVE P5.6 only has a Build line, so P5.6 is ticked against that line item by item (LEAD AFTER item 7).

## Estimated builder-hours

| Task | Estimate | Notes |
|---|---|---|
| measures-overrides | 3–3.5 h | Plus up to 1 h if two or more of E205–E211 need revisions. E207 (salt reaching Sprinters) and E210 (rest timing) are the likely ones. |
| p5-polish | 2.5–3 h | The atlas rebuild and the S01/S02 sweep take the most time. |
| cards-curated | 3 h | Plus up to 1.5 h of revisions. E213's capture timing and E214's contact geometry are the main risks. |
| prompts-succession | 4 h | The largest task. The succession size tripwire and the save/load completion-tick tests take the most time. |
| Wave total | 7.5–9 h of builder time | Plus about 1–1.5 h of verifiers and the lead's integration. The lead's sim-tune run of the 15 new recipes adds about 1 h in the background. |
