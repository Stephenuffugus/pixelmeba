# Phase 6 plan (lead draft, 2026-10-14) — Living Lab → `v1.2.0`

Inputs:
- BUILD_DIRECTIVE §Phase 6 (P6.1–P6.7, lines 732–770);
- SPEC §2.4, §3.2–§3.4, §4.4, §5.1, §10.4, §10.9, §11.1–§11.4, §12.3, §12.5, §14.1, §14.5, §15 (Phase 6 tests);
- CT §4 (LAB01, LAB02), §9.4–§9.6 (LABR01–LABR03), §12.9, §14;
- UX (Lab trays, panels, notebook, stamps, accessibility), ARCH §7–§11 (protocol, persistence), CR R19 (the light formula);
- docs/source/D07 (Living Lab), D08 (playgrounds), D09 (R-L1, R-L2) where the canonical docs are silent;
- docs/agent/g6-briefs.md, three read-only mapping briefs (run wf_4d2c3a93-612), with the requirement lists, code
  touchpoints and per-task file lists this plan schedules;
- docs/agent/fast-track.md and docs/agent/g5-plan.md (the working rules carried over).

Phase 6 starts after tags `g5` and `v1.1.0`. The waves keep the Phase 5 rules: one task-file writer per wave (effort
high, started while the previous wave builds); builders edit disjoint files and never commit; one rules verifier per
wave plus a saves/determinism verifier per critical task; fix rounds only for BLOCKER/MAJOR; the lead integrates once
per wave (MINORs, D-numbers, the full check, the touched journeys on desktop and phone-portrait, commit, push, WORKLOG
notes); a flip enables the phase's content after its code is verified (D-0104).

## Lead calls made up front (record as D-numbers in the Phase 6 preflight commit)

1. **v1.1 saves are proven before any Phase 6 edit.** On the v1.1.0 code: tools/make-v11-saves.ts →
   tests/fixtures/saves-v11/ with expected {hashAtLoad, hashPlus1000} and tests/fixtures/v11-replay.test.ts
   (the D-0101 pattern), covering a cycle dish, barriers and devices with a heater On, a resin, a channel, a glowing
   Lantern, an A04 in each mode, a P10 mid-handling, a holding F03 trap, a jacketed P01, a held Sample and gate tallies.
   `fence-update --v11 --reason D-…` is its only writer. Every Phase 6 wave keeps g2-replay, rc1-replay, v11-replay and
   the trajectory fence unchanged. `release/1.1` is cut at v1.1.0 and frozen for store-blocking hotfixes (1.1.x).
2. **One schema bump, one protocol bump.** World SCHEMA_VERSION 5 → 6 once (wave 17, task `schema6`), written
   unconditionally (D-0102 rule), carrying every Phase 6 store: the automation store (controllers with their masks by
   value, queued actions, holds, nextRuleId, the audit ring), the LAB01/LAB02 keys on Device records, `sample.cross`
   and `appliedTx`. Each store is hash-neutral while empty (D-0035). PROTOCOL_VERSION 3 → 4 once, by one owner
   (`equip-worker`), with a protocol-3 equivalence test for a v1.1 dish (the wave 11 pattern). simulationVersion stays
   3 (CR R03); evolutionRulesVersion, phenotypeMappingVersion and moduleRegistryVersion stay. contentVersion 3 → 4 and
   buildPhase 6 move at the preflight; the optional manifest `livingLabVersion` is 1 on new dishes after the flip.
3. **Every Phase 6 rule is gated on the world's recorded manifest:** reservoirs on a recorded LAB01, the lamp path on
   LAB02 (lightNeutral and the lightFactors fast path both gain the check, so the inspector and photosynthesis never
   diverge), controllers on a non-empty automation store. A world without equipment hashes exactly as before; hot paths
   gain only exact identities (+ 0 in the source light, + 0 reservoir totals in computeTotals).
4. **One equipment flip** (lead task after the UI wave): 'equipment', LAB01, LAB02 and livingLabVersion 1 enabled;
   IMPLEMENTED_SYSTEMS gains 'equipment', IMPLEMENTED_STRUCTURES LAB01/LAB02. No fence digest may move (no shipped
   recipe uses equipment). Then `fence-update --add` for LABR01 (both arms) and LABR03, and LABR01/LABR02 at the six
   development seeds (D07 §16 tuning).
5. **Rulings on the mappers' open questions** (each logged in its wave's D-entry; owner flag where marked):
   - **Ledger:** loading a reservoir is the external INPUT; the stage 3 release is an internal field transfer; emptying
     or removing the device EXPORTS the exact remainder. (Ledgering the release would double-count LABR01's 6 C.)
   - **Device kinds** LAB01 and LAB02 are appended after S12, so edgePassage's KIND_SHELTER/KIND_MESH and the preview
     model's codes never move.
   - **Controller regions** are stored by value in the controller record (saved and hashed); the mask code moves from
     src/worker/probes.ts into src/sim/regions.ts. Probes stay session state; the UI offers to update a rule when its
     probe is edited, and refuses to delete a region a rule uses.
   - **Hold** is elapsed qualifying time: the first qualifying sample has elapsed 0, so LABR03 fires at the tick-59
     sample and its Off applies at tick 60 (D07 §07).
   - **The lamp path** crosses transportOpen dish cells; stone and wall block; among edges only a closed S03 blocks (S01,
     S02, an open S03 and S04 transmit; D07: "do not infer optical properties from transport class"). Owner flag.
   - **Metric means** are over transportOpen dish cells of the mask.
   - **Scheduled actuator actions** are recognised by command kind, with no schema change; controller firings are
     excluded from pendingInterventions, challenge budgets and story change counts.
   - **The release-all command** is setup-only (experiments and recipes); the host refuses it from UI messages.
   - **Research stamps, presets and portfolio cards** are device-local stores (localStorage, validated on read,
     badges.ts precedent); an imported dish or notebook never awards a stamp; a blocked store says so and never blocks
     play.
   - **The Equipment category** replaces Tools → Build for every dish in the v1.2 build (presentation only); it lists
     exactly the dish's recorded enabledStructures, so LAB items appear only where recorded.
   - **Playgrounds** use D08's title, question and first action and start R-L1/R-L2 (Fixed Traits visible in Details);
     the What if? sheet keeps D09's copy. Compare from a playground starts the LABR01/LABR02 experiment as a new world
     after the save flow.
   - **Question cards** Q01 (LABR01 steady), Q02 (H10) and Q03 (H11 + LAB02) ship; Q04 stays hidden until a thermal
     baseline recipe exists. Owner flag.
   - **Sound:** no new cue; equipment toggles reuse gate_click; controller firings play nothing (D07 §14).
   - **Cross-dish transfer (P6.4)** is enabled with the platform's tested two-slot commit (both-old or both-new at every
     enumerated crash point); a power cut during an unsynced Filesystem write is the stated limit (ARCH §11.1 already
     accepts it for single saves). Owner flag. A compatible destination is one where every carried genome keeps its
     meaning (its species and modules are recorded there). The import payload lives in the destination's command log
     (check it against the 25 MB import cap at radius 6). BirthIds are re-issued and every *BirthId column remapped;
     absolute-tick columns are rebased; a destination held only in memory is refused. Transferred lineage reads
     "arrived from <dish>" and claims nothing the destination did not simulate.
   - **The Living Lab copy** (SPEC §10.9/§14.5) of an older dish is offered (the original is kept). Owner flag.

## Waves (two builders at a time on 2 cores; more if the machine allows)

One owner per file per wave. Contended across Phase 6: commands.ts, content/schema.ts, recipes.ts, devices.ts,
structureEdits.ts, climate.ts, protocol.ts, snapshot.ts, host.ts, state.ts, LabTray.tsx, LabView.tsx, DeviceSheet.tsx,
GateSheet.tsx, strings/structures.ts and art/src/tiles/index.ts.

| Wave | Tasks | Critical | Notes |
|---|---|---|---|
| Preflight | v11-corpus (one builder) + lead (release/1.1, buildPhase 6, contentVersion 4, D-numbers) | v11-corpus | On the v1.1.0 code, before any Phase 6 edit. |
| 17 Foundation | schema6 (world, serialize, phase6State import checks, regions.ts, command union members and dispatch stubs, every content schema field), cross-store (SaveStore.savePair with expectSlots, IDB and Filesystem preconditions, the predecessor-fallback guard, crash-point enumeration), equip-art (the 'equip' atlas tile: LAB01 14 frames, LAB02 4, controller badges 6; appended last) | schema6, cross-store | schema6 may split 17a (world + saves) / 17b (commands + content schema). |
| 18 Equipment sim | reservoir (LAB01, stage 3, ledger, LABR01), lamp (LAB02, LABA02 in climate.ts, the cache, LABR02), cross-sim (sampleCross.ts: compatibility, payload, remaps, txId ledger, appliedTx idempotency, exact inverse) | all three | cross-sim may split payload+compat / apply+inverse. |
| 19 Automation | controllers (core: controllers.ts, tick.ts hook, controllerEdits.ts; override: the stage 1 pre-pass, events, history markers, LABR03), equip-worker (protocol 4: geometry, snapshot reservoirs and lamps, lightFactors.lamp, controller and audit messages, the paused lamp preview, refusals, the equivalence test) | controllers | controllers owns commands.ts; equip-worker owns protocol/snapshot/host/client. |
| 20 Lab screens | equip-tray (+ the Build group move and its e2e selector updates), reservoir-lamp-panels, controller-editor + audit-chart, cross-host-ui (host requests, the hidden paused destination, SampleSession UI, one journey) | cross-host-ui | Then the lead's **equipment flip**. Ticks P6.1–P6.4. |
| 21 Research and play | research-stamps (+ presets), portfolio-questions (CompareCard v2, question cards), playgrounds (Play shelf, R-L1/R-L2) | none | Ticks P6.5, P6.6. |
| 22 Regression and gate | p6.7a regression fixtures (reservoir-conservation, light-formula, controller-timing, manual-precedence, determinism-p6, sample-transaction-cross, migration-v12, research-evidence), p6.7b perf (perf-stress --living-lab, 256 devices + 8 controllers) and gate | p6.7a | The `g6` ritual, package.json 1.2.0 / versionCode 10200, a v1.1.0-worktree refusal check, tags `g6` and `v1.2.0`. |

Estimate on 2 cores: about 8 h per wave including integration, so roughly 55–60 h. On an 8-core machine (4–6 agents
at once, a 10–15 min check) the waves can merge pairwise (17+18, 19+20) for roughly half that.

## Risks to watch

- **The predecessor fallback can break both-or-neither:** a slot whose current record belongs to a committed txId never
  falls back silently; the player gets "restore both to before the transfer".
- **Cross-world references:** birthIds collide across worlds; every *BirthId column (trap/heldBy, prey, host/parasite,
  fungal and adhesion pairs) is remapped from ENTITY_COLUMNS, never from memory; phase5State's mutual-pair checks are the
  net.
- **Replay seq divergence:** a controller takes its seq at stage 10; the manual-override pre-pass makes same-tick
  actuator conflicts order-independent; fixtures replay through the host path; applyNow's due set is checked too.
- **Float identity:** the lamp sum accumulates in device (cell) order into one array, then adds once to baseline×cycle.
- **Lamp cache staleness:** key the cache on content (on/intensity/cell/barrier/terrain/shade), not geometryVersion alone.
- **Broth needs the enzymes fields:** a broth load in a world without that system is refused at stage 1 and at import.
- **Atlas headroom:** about 580 free rows at 1024 wide before waves 12–13; re-measure before equip-art, pack at 16×16.
- **Two tabs on the web:** pair commits carry an expectSlots precondition.
- **Dense-scene cost:** 8 controllers × 10 s cooldown toggling shutters and lamps invalidate caches; reduce cosmetics
  only (SPEC §16).
- **e2e time:** LABR01 runs 300 s; journeys use 4× or assert early-tick states.

## Carry-overs (task writers: put each into its wave's assignment)

- From Phase 5: IMPLEMENTED_SYSTEMS (D-0119/D-0121) must ship in v1.1.0 without 'equipment', so a v1.1 build refuses
  a crafted schema-5 file naming it.
- Every wave that writes a schema 6 store: a buildSaveFile → loadSaveFile round trip at every state shape, and the import
  (phase6State.ts) refuses what the dish's rules could not produce.
- The relationship matrix, region probes and the gate tracer must ignore LAB devices unless a rule says otherwise
  (furnishings are ignored by the lamp path; LAB devices hold no organisms).
