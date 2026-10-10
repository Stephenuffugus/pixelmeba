# Phase 4 plan (lead draft, 2026-10-10) — Wonder, Replay, Android → `v1.0.0-rc1`

Inputs:
- BUILD_DIRECTIVE §Phase 4 (P4.1–P4.14 and the v1.0 gate);
- SPEC §12.6–12.8, §13.5–13.6, §14.4;
- UX §3, §5.8–5.10, §7.4, §8.3;
- ARCH §12–§14;
- docs/agent/fast-track.md.

Phase 4 starts only after tag `g3`, per CLAUDE.md "finish the phase, in order". The waves use the same rules as
Phase 3:
- runner: `docs/agent/g3-runner-ft.workflow.js.txt`;
- one task-file writer per wave (effort high);
- builders edit the tree and never commit;
- one rules verifier per wave;
- a saves/determinism verifier only for tasks marked critical;
- fix rounds only for BLOCKER/MAJOR;
- the lead integrates once per wave: MINORs, D-numbers, `npm run check`, the touched journeys on desktop,
  commit, push, WORKLOG tick.

## Lead calls made up front (record as D-numbers when the wave 5 task file is written)

1. **Notebook state is not world state.** Favorites, nicknames, story cards, bookmarks, gallery entries,
   prediction notes and goal progress live in a per-dish notebook record next to the world save:
   - they are never in `stateHash`, and nothing in src/sim reads them;
   - each kind gets a hash test that it never alters behavior (SPEC §12.6 "Favorites never alter behavior");
   - the record has its own schema version, checksum and import validation: an unknown or malformed record
     is dropped with a message and the world still loads;
   - nicknames go into an export only when the player opts in (SPEC §12.6, §14.4).
2. **Objectives are evaluated, never enforced in the sim.** The objective engine (P4.4) reads the same
   observation surface as experiments:
   - the measurement grammar and `ArmObserver` in src/sim/pairedRun.ts;
   - the experiments' `GateWatch` pattern.
   It runs in the worker after each published tick. It never changes a pause state or a speed, and never
   counts a blocked or cancelled proposal (SPEC §13.5). A goal's state is saved in the notebook record;
   Try my dish turns also keep a baseline reference, start tick and horizon (SPEC §13.6).
3. **The share picture is drawn from a snapshot, not from the live stage.** It is a 1080 × 1080 offscreen
   render from the published snapshot with the shipped atlas at an integer scale (nearest-neighbor), so no
   cosmetic path can read or consume sim state. "Living dish" is a full save at a paused tick, through the
   existing saveFile path (atomic, checksummed). Metadata stripping recomputes the hash (SPEC §14.4).
4. **Try my dish clones, never mutates.** Each turn is a new world ID made from the immutable baseline slot
   by the existing realize/load path. Only the prior unsaved turn is replaced, and only after an explicit
   discard (SPEC §13.6).
5. **Android = debug build + documented steps.**
   - P4.10 builds a debug APK with the SDK in this codespace (reference memory: JDK 21 + SDK present) and
     records the exact result.
   - Release signing stays an owner item: a keystore script is provided and no keystore is committed.
   - The Capacitor Filesystem adapter gets the same temp-write-verify-rename contract and predecessor as IDB.
     A browser harness that simulates interruption tests it.
6. **No new sim rules in Phase 4.** `simulationVersion`, `evolutionRulesVersion` and `moduleRegistryVersion`
   do not move. If a task seems to need one, it stops and the lead decides. The fence (g2-replay plus the
   four trajectory-fence files) must pass unchanged in every wave.

## Waves (two agents at a time on 2 cores; about 1–1.5 h per builder plus verify)

| Wave | Tasks (key: WORKLOG) | Critical (saves lens) | Notes |
|---|---|---|---|
| 5 "Wonder" | favorites (P4.1), stories (P4.2), garden-home (P4.3), objectives (P4.4) | favorites, objectives (notebook record + goal state in saves) | The notebook record lands here. favorites owns its module; stories owns the Notebook tab; garden-home owns Home.tsx and the session memory. |
| 6 "Replay & share" | variants-paired (P4.5), share (P4.6), try-my-dish (P4.7), observation-tools (P4.8), narration (P4.9) | share, try-my-dish | observation-tools is the largest; split it in the task file (relationship map + probes + follow family / bookmarks + gallery + recipe card / challenge editor + transfer preview + storage display) if one builder cannot finish it in ≈ 1.5 h. |
| 7 "Ship" | android (P4.10), web-arcade (P4.11), store (P4.12), perf2-polish (P4.13) | android (storage adapter) | Then the lead's P4.14: full suite (three-project e2e once), EXPANSION_RESPONSE §1–§8, README, tag `v1.0.0-rc1`. |

The fast-track "faster still" option stays the owner's call: moving P4.5, P4.7, P4.8 and P4.9 to v1.1 saves
about half a session. Nothing is cut unless the owner says so.

## Before wave 5 (carried from Phase 3)

- EXP_104: ship recipe revision 2 or keep the card out of v1.0. See docs/reports/exp104-revision-probe.md;
  starting oxygen 0.03–0.05 reaches the gate.
- Owner items from every "Owner review: yes" decision go to EXPANSION_RESPONSE §8 at the G3 gate.

## Risks to watch

- **Share picture and favorite markers.** These are the first UI features that render organisms outside the
  live stage. Keep them on snapshot data only.
- **Saves.** The notebook record is a second persisted record per dish. Autosave, export, import, migration
  and the "a failed import or write never touches the current world" rule all need tests in wave 5, not
  later.
- **Narration.** It must speak only when its evidence condition is true (UX §8.3): give each of the 16
  phrases a test.
