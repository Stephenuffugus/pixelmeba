# Wave 11 task-file writer report (run wf_eb1d828b-f0f, saved by the lead from the journal)

Parse check output:
```
structure-render-worker 4271 1 own 24833
e2-signals 4272 1 own 22144
structure-ui 4273 2 false 18568
region-charts-gates 4274 2 false 14093
```
File written: `/workspaces/pixelmeba/docs/agent/g5-wave-11.tasks.js.txt`. It is the only file I created or edited. I ran no tests, builds or git writes.

**Stages and file ownership** (one owner per file per stage; every path checked with git ls-files / git cat-file at HEAD 8298be5)

- **Stage 1, structure-render-worker** (port 4271, critical 'own').
  - New files: `src/render/{structureLayer,structurePreviewModel,gateTracer}.ts`, `art/src/tiles/structures.ts`, `tests/fixtures/protocol2-golden/`, `tests/worker/{protocol3,protocol3-v1-equivalence,structure-snapshot,new-dish-environment}.test.ts`, `tests/render/{structure-preview,gate-tracer,structure-layers}.test.ts`.
  - Owns: `src/worker/protocol.ts`, `snapshot.ts`, `host.ts` (build, recipeProvenance, info, newDishPreview, sendSnapshot only), `client.ts` (environmentOf and resinsOf).
  - Also owns: `src/render/{renderer,layers}.ts`, plus `world3.ts` and `picture.ts` where needed; `art/src/tiles/index.ts`, `art/src/palette.ts`, `public/atlas/*`.
  - `src/sim/structurePreview.ts`: additive `wetCellOutcome` only.
- **Stage 1, e2-signals** (port 4272, critical 'own').
  - New files: `src/sim/{signals,rivalry}.ts` and five test files.
  - Owns: `actions.ts`, `secretion.ts`, `suitability.ts`, `chemistry.ts`, `phenotype.ts`, `events.ts`, `dormancy.ts`, `births.ts`, `species.ts`, `ledger.ts`, `constants.ts`, `reasons.ts` (append only), `tests/sim/stage8-order.test.ts` (re-pin).
  - Shared, additive: two calls in `structures.ts` stageStructures.
- **Stage 2, structure-ui** (port 4273, not critical: it only sends commands).
  - Owns `LabTray*.tsx`, `Inspector.tsx`, `OverlayPicker.tsx`, `OverlayLegend.tsx`, `CompareText.tsx`, `AddLifeSheet.tsx` (one field), `NewDish.tsx`, `LabView.tsx`, `LabToolbar.tsx`, `DishScreen.tsx`, `state.ts`, `CellDescription.tsx`, `strings/*` except `observe.ts`, and `styles.css`.
  - New files: `edgeSnap.ts`, `environment.ts`, `DeviceSheet.tsx`, `GateSheet.tsx`, unit tests, e2e specs and the fixture helper.
- **Stage 2, region-charts-gates** (port 4274, not critical: read-only).
  - Owns `src/worker/probes.ts`, `goals.ts` (only if needed), `src/sim/objectives.ts` (WORLD_GATES and the default parameter only), `ProbePanel.tsx`, `ProbeSession.tsx`, `src/ui/observe.ts`, `strings/observe.ts`.
  - New files: `ProbeCharts.tsx`, `probeCharts.css`, tests and an e2e spec.
- **Contended files.**
  - Stage 1: protocol.ts and snapshot.ts go to structure-render-worker. births.ts, actions.ts, phenotype.ts, suitability.ts and chemistry.ts go to e2-signals. Nobody touches transport, movement, contacts, intake, commands, content/schema, recipes or art/src/index.
  - Stage 2: every contended file is read-only.
  - Stage 2 makes no edits to stage 1 files. It reports a missing API as `NEEDS: …` instead.
- Verifiers: `A.verifyGroups = [['e2-signals'], ['structure-render-worker','structure-ui','region-charts-gates']]` on ports 4390 and 4391. Saves verifiers on 4396 (structure-render-worker) and 4397 (e2-signals). 4398 stays free. Re-verify on 4394.

**PROPOSED DECISIONs**
- PROPOSED DECISION: the scope and ports as in the lead's calls. Neither stage 2 task is critical, because neither writes saved or hashed state.
- PROPOSED DECISION: the protocol 3 layout.
  - ENT_STRIDE goes to 15 with E_CUE3 = 14. The 13 bits are: glowing 1, E02 2, mode at shift 2, held 16, handling 32, trap at shift 6, jacket band at shift 8, jacketed 1024, E11 2048, shell 4096.
  - DEPOSIT_BANDS goes to 8, with the grit band at 7 (packed, not drawn yet).
  - GeometryMsg gets `edges {r, d, list} | null`, where an S04 flowing −1 carries the bit EDGE_FLOW_BACK = 8. It also gets `devices[]` without bound.
  - Resin saturation travels in each snapshot (`SnapshotMsg.resins`), not in the geometry. Bound changes every tick without a geometry bump, so geometry would go stale.
  - Also added: `SnapshotMsg.environment`, `DishInfo.systems` and `DishInfo.speciesFreeClass`, and optional CellInspect fields `climate`, `lightFactors`, `edges` (each with its gate tally), `device` and `exposure.rival`.
- PROPOSED DECISION: the gate inspector gets its measured totals through CellInspect. region-charts-gates needs no protocol line, because ProbeReadings is declared in probes.ts. So stage 2 makes no protocol edit and there is no second bump.
- PROPOSED DECISION: build() validates lid, lightMode and drying and records only the keys given. recipes.ts is not touched, because applyRecipeOverrides and recipeOverridesOf already handle the three keys. NewDishPreview gains `environment` and `climate`.
- PROPOSED DECISION: edge glyphs are drawn procedurally. Devices use one atlas tile, 'device', with 14 frames, appended last so no earlier frame moves. The roof is drawn as an outline only. The tray icons are inline SVG.
- PROPOSED DECISION: the gate tracer is a pure function of (edge code, token, milliseconds) using layers.ts `cosmetic`. The renderer draws nothing when snapshot speed ≠ 0.
- PROPOSED DECISION: glow thresholds read sensed values snapshotted at the start of stage 8. They are called from stageStructures right after dormancyStep, because mandatory table entries run after releaseInvalidLinks and that breaks SPEC §3.2's order.
- PROPOSED DECISION: the glow cost is charged in that threshold step under 'signal'. Glow never turns on while E < 15, which rules out a one-tick flicker. Emission is the native SIGNAL_GLOW action (id 5) or the E02 module action (id 2), charged under 'signal'.
- PROPOSED DECISION: RIVAL is charged under 'secretion'. Its trigger is the 5×5 Chebyshev window over a start-of-stage-8 mask of Active target cells, and it ignores edge barriers. RIVAL_EXPOSURE is the reason when the rival term is the larger part. `SpeciesRT.rivalTarget` is set by ancestor id.
- PROPOSED DECISION: at division both daughters start dim with dwell 0. One glowOff event (why 'division') fires if the retained slot was glowing. New event types 'glowOn' and 'glowOff' go to the event ring only. Emitter bits: rival 8, signal 16.
- PROPOSED DECISION: a new S03 is placed Open by default. S04 defaults to flow 1 with a direction choice. The Remove tool picks a cell's device when the tap is within 0.3 cell of the centre, otherwise the nearest edge. The wetting brush is gated on the dish's own systems, not on the build's tool filter.
- PROPOSED DECISION, journeys:
  - The Lab screens are reached now by importing a fixture dish built in Node, against the production build, with no dev flag.
  - The New Dish Environment journey is written now with `test.skip` until the build manifest has 'climate'.
- PROPOSED DECISION: probes measure salt and silicate. The inhibitors, enzymes, breaker, sGlow, quencher, rival, v01 and v02 report 'notMeasured' with why 'decays', or 'resin' where an S08 sits. Organism crossings are counted as region-membership changes between ticks, matched by slot and birthId.
- PROPOSED DECISION: WORLD_GATES becomes the default gates argument. The gate is a structure kind. The reading is the sum of `tally.fields[field]` over current edges of that kind. A resumed goal counts from the load.
- PROPOSED DECISION: region-charts-gates keeps its styles in its own CSS file. The two calls in structures.ts are the only shared edit.
- PROPOSED DECISION: E02 goes into IMPLEMENTED_MODULES at integration only if no test pins that list, because adding it also changes which dishes the import accepts.
- PROPOSED DECISION: P5.1 and P5.2 are ticked at the systems flip if every item of their Build lists is met and the D-0104 checks pass.

**`<lead: …>` placeholders left**
- STATE: "wave 10 as built — commit, D-numbers"; "D-number" for this wave.
- STATE: "helpers added to tests/helpers/world.ts".
- STATE: "CommandPayload kinds with exact fields; CommandResult keys".
- STATE: "edgePlacementOutcome, devicePlacementOutcome, labCellConflict signatures and outcome unions; whether src/render may import the file".
- STATE: lifeCellOutcome extras ("confirm").
- STATE: wetBrush's accepted/rejected cell rule.
- STATE: gateTally entry shape, the tick.ts crossing hooks and the channel tally.
- STATE: RESTING_NEWBORN's code.
- structure-render-worker prompt (2): structurePreview.ts signatures, lifeCellOutcome extras, wetBrush rule, gateTally shape; labCellConflict signature; the wetBrush rule again in item 11(d).
- e2-signals prompt (2): the dormancy.ts Active → Preparing line and the resting-newborn code; the location of the births.ts reconciliation loop.
- region-charts-gates prompt (1): gateTally shape, the tick.ts hooks and the channel tally.

**Where the tree contradicts the plan, briefs or BUILD_DIRECTIVE**
1. g5-briefs line 107 assumes activity boundary totals are valid except where a resin sits. In fact stage 2 decays every activity field, the inhibitors and both viruses (transport.ts decays), so the change-across-stage-2 measure is wrong for all of them, resin or not.
2. The import (saveFile.ts and phase5State.ts) checks only modules against the build. Systems, structures and native abilities are checked against the dish's own manifest. So before the flip, a crafted file can run Phase 5 rules in a production build. This is a pre-existing gap, and this wave's journeys depend on it. It needs an owner or lead decision.
3. BUILD_DIRECTIVE P5.1 and P5.2 have Build lists but no "Done when" line, yet g5-plan says to tick them only when their Done-when is met.
4. births.ts keeps the retained daughter's glowState. If she lost E02 by mutation, the game's own save would be refused. So e2-signals must touch births.ts.
5. SPEC stage 8 puts glow thresholds before the link release, but the table framework runs mandatory entries after releaseInvalidLinks.
6. The objectives header says resumed watches complete at the same tick as an uninterrupted run, but the gate branch counts from the load even though gateTally is saved. This is a P5.6 or notebook item.
7. Enzyme producers write inside the slot loop, against SPEC §3.3's stage-start snapshot rule. Glow and rival sensing use a stage-start snapshot; emission cap checks follow the enzyme precedent.

**Estimated builder-hours:** structure-render-worker 2–2.5 h, e2-signals 1.5–2 h, structure-ui 2–2.5 h, region-charts-gates 1–1.5 h. That is about 3.5–4 h wall time including verification, then the systems flip.
