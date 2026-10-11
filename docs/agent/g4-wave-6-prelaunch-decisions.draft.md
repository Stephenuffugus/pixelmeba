
## D-<A> · 2026-10-11 · Phase 4 wave 6 · The share picture is drawn from a snapshot, not from the live stage
Context: docs/agent/g4-plan.md "Lead calls made up front", call 3; SPEC §14.4; UX §5.10; CT §12.10 "picture 1080×1080"; docs/agent/g4-wave-6.tasks.js.txt (share).
Decision:
- The Picture is a 1080 × 1080 PNG rendered offscreen from the latest published snapshot (SnapshotMsg), with the shipped atlas at an integer scale and nearest-neighbour sampling (src/render/picture.ts).
  - No cosmetic path reads or consumes sim state, and drawing the picture never sends a command.
  - It has no text chunks and no device metadata, and carries nicknames only by opt-in.
- "Living dish" is a full save at a paused tick, written through the existing saveFile path (atomic, checksummed).
- A metadata-stripped export recomputes the hash.
Reason: CLAUDE.md "The renderer never owns biological state … Nothing cosmetic can consume simulation randomness or alter outcomes"; SPEC §14.4.
Affects: the wave 6 share task (src/render/picture.ts, src/persistence/recipeFile.ts, src/ui/share.ts, ShareSheet).
Owner review: no.

## D-<B> · 2026-10-11 · Phase 4 wave 6 · Try my dish clones, never mutates
Context: docs/agent/g4-plan.md call 4; SPEC §13.6; docs/source/D09 lines 132-139; the wave 6 try-my-dish task.
Decision:
- Each turn is a new world id (branchWorldId) made from the immutable baseline by the existing load path. A turn starts paused, and the baseline is never written again.
- At the horizon the dish pauses and offers Keep this result, Another turn and Finish.
- Only the prior unsaved turn is replaced, and only after the player confirms "Discard turn". It never goes through the D-0033 keep flow.
- A kept result uses a normal named slot.
- The saves keep the baseline reference, the goal state, the start tick and the horizon.
- A missing or changed baseline disables Another turn.
Reason: SPEC §13.6; saves are sacred (nothing the player kept is ever overwritten by a turn).
Affects: the wave 6 try-my-dish and challenge-editor tasks.
Owner review: no.

## D-<C> · 2026-10-11 · Phase 4 wave 6 · Scope calls for wave 6 (the writer's proposals, accepted)
Context: docs/reports/reviews/g4-wave-6/writer.md; docs/agent/g4-wave-6.tasks.js.txt header "LEAD PRE-LAUNCH 3".
Decision:
- **The shelf.**
  - Reading of SPEC §13.6 "capture an immutable baseline into a slot" and D09 "in an existing snapshot/save slot": the shelf is a write-once SaveStore record, `shelf-<kind>-<seq>-<writer>`.
    - It sits outside the ten named slots, so a baseline never takes a slot the player uses or can overwrite.
    - It is modelled on the checkpoint ring (D-0031): one atomic commit, a preflight, and a list that ignores shelf ids.
  - Kinds:
    - 'baseline': Try my dish starting points, at most 10 per device;
    - 'snapshot': snapshot bookmarks, at most 20 per device (CT §12.10 "bookmarks 50 text / 20 snapshot"; D02 "Snapshot bookmarks count against storage limits").
  - The Storage panel removes records with a confirmation that names what goes and what stays.
- **observation-notebook is a critical task.** It writes stored snapshots and two notebook kinds.
- **Transfer preview (SPEC §12.8, P4.8) is not built in v1.0.**
  - D02 §20 defines it over "a selected gate", and no gate structure exists before Phase 5 (enabledStructures BEAD, STONE, WALL).
  - It lands with the Phase 5 gates, and WORKLOG P4.8 says so.
- **The recipe card is the Starting recipe file** ('pixelmeba-recipe'). It carries the starting world, seed, modules, command schedule, versions and expected observations: everything §12.8 lists.
- **No separate prediction-note kind.**
  - Comparisons keep theirs (P2.4: CompareSetup, CompareResults, the journal stamp).
  - Try my dish turns keep theirs in the turn record.
- **Session state, not saved:** the region probes and the relationship map's 60/180/600 s windows. They reset on reload or Undo; nothing about them is saved or claimed after a reload.
Reason: SPEC §12.8, §13.6, §14.4; CT §12.10; D-0070 (notebook state is not world state); D-0072 (no new sim rules: gates are Phase 5).
Affects: every wave 6 task.
Owner review: yes. Two items:
- the shelf as the Try my dish "slot" (the alternative is one of the ten named slots, which the player can overwrite);
- the transfer-preview deferral to Phase 5.
