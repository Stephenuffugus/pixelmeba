# g4 wave 6 task writer — final report

Saved by the lead from the run journal of `wf_f47d216e-763` (2026-10-11).

Task file written: `/workspaces/pixelmeba/docs/agent/g4-wave-6.tasks.js.txt`. It parses with the check you gave; I edited no other file and ran no tests, builds or git changes.

**Parse output**
```
share 4271 1 own 12947
try-my-dish 4272 1 own 11138
observation-map 4273 1 false 9939
observation-notebook 4274 2 own 9537
challenge-editor 4275 2 false 9641
variants-paired 4276 3 false 7435
narration 4277 3 false 8903
```
STATE is 14,484 characters. `critical: 'own'` gives each critical task its own saves verifier in the runner.

**Stages and ownership** (one owner per file per stage; everyone else adds only named lines)

| Stage | Task (port) | Owns, besides its new files |
|---|---|---|
| 1 | share (4271, critical) | `src/ui/state.ts`, `DishScreen`, `Play`, `Saves`, `MoreSheet`, `styles.css`, `saveFile.ts` |
| 1 | try-my-dish (4272, critical) | `src/worker/{host,protocol,client,notebookWatch}.ts`, `src/persistence/{store,notebook}.ts` |
| 1 | observation-map (4273) | `src/worker/relationships.ts`, `src/render/renderer.ts`, `LabTray`, `LabView`, `LabToolbar`, `strings/lab.ts` |
| 2 | observation-notebook (4274, critical) | worker host/protocol/client/notebookWatch, `store`, `notebook`, `shelf`, `src/render/picture.ts`, `state.ts`, `Notebook`, `Saves`, `DishScreen`, `Inspector`, `LabTray`, `MoreSheet`, `HistorySheet`, `styles.css` |
| 2 | challenge-editor (4275) | try-my-dish's `tryDish.ts`, `notebookTurns.ts`, `ui/tryDish.ts`, `TrySetup`/`TryHorizon`/`TryBadge` |
| 3 | variants-paired (4276) | worker host/protocol/client/`comparison.ts`, `state.ts`, `WhatIfSheet`/`WhatIfState`, `CompareResults`/`CompareSetup`, `CompareScreen`, `ExperimentRun` |
| 3 | narration (4277) | `src/audio/**`, render `renderer`/`features`/`camera`/`layers`, `SoundSettings`, `SimplePage`, `main.tsx`, `styles.css`, `docs/UX_SPEC.md` (§7.4 table only) |

The additive lines in shared files are listed by symbol in the file header. Nobody edits `src/sim/**`, `content/**`, `art/src` or `android/**`.

I recommend two run files: 6a for stage 1, then 6b for stages 2 and 3. Stage 2 builds on stage 1's shelf, turn session and picture renderer.

**Proposed decisions** (the docs were silent or unclear)
- **One "shelf" for stored snapshots:** a write-once record family `shelf-<kind>-<seq>-<writer>`, modelled on `CheckpointRing`, outside the ten named slots. It holds Try my dish baselines (at most 10 per device) and snapshot bookmarks (at most 20 per device).
- **observation-notebook is critical**, because it writes stored snapshots and two new notebook kinds.
- **Transfer preview is not built in v1.0.** D02 §20 needs "a selected gate", and no gate structure exists until Phase 5.
- **The recipe card is the Starting recipe file** (`pixelmeba-recipe`).
- **No separate prediction-note kind.** Comparisons already have one (P2.4); Try my dish turns store theirs in the turn record.
- **Picture layout:** 1080×1080 with the dish at 7 px per cell (896 px), a question band, the wordmark and identifier band, and a 48 px safe margin. "Strip metadata" removes the dish name, time and nicknames.
- **Recipe IDs:**
  - Import accepts both "rev" and "revision".
  - A variant ID needs its source's seed.
  - A bundled recipe ID takes any seed 0–4294967295.
- **Living dish:** opening the Share sheet pauses the dish and restores the prior speed on close.
- **Story card "Save picture":** shows the dish now, labelled "Dish at {m:ss}", never as the moment of the story.
- **Try my dish:**
  - Turn world IDs come from `branchWorldId`.
  - New notebook kind `turns` (one record per turn dish).
  - The horizon is enforced in `DishHost.pump` and the `step` case.
  - Finish leaves the turn open as an ordinary dish.
  - "Another turn" discards the prior turn only after the player confirms. It never goes through the D-0033 keep flow.
- **Relationship map:**
  - An "eats" arrow carries "seconds seen" plus the pool's total removed by feeding, because `IntakeSeen` stores only bits.
  - Other relationship kinds carry counts and carbon.
  - The map's per-second records and the probes are session-only: they are not saved and reset on reload or Undo.
- **Probe boundary transfer** is the change of the in-region total across stage 2, reported only for fields that stage moves without adding or removing.
- **Gallery entries** store a 16-cell crop as sprite rows, redrawn by `picture.ts`, which keeps 100 entries under the 1 MB notebook limit.
- **Challenges:**
  - Allowed tools come in seven groups mapped to command kinds.
  - The action budget is counted from the command log, so Undo gives an action back.
  - Regions are limited to the engine's regions (whole dish and quarters).
  - Export is the baseline save with the challenge in its notebook.
- **Paired variants:**
  - Fixed 180 s horizon.
  - Sequential mode when `navigator.deviceMemory <= 2`.
  - No `objectiveId` added to the variants.
- **Narration:**
  - A phrase does not repeat within 10 s.
  - No "say it" button.
  - "The feeder is empty" and "The light is on/off" are never spoken in v1.0, because feeders and lamps are Phase 6.

**Where the tree contradicts g4-plan.md or BUILD_DIRECTIVE**
1. P4.8 "transfer preview" and the gate objective need gates; `enabledStructures` is only BEAD, STONE, WALL.
2. g4-plan's suggested P4.8 split includes "follow family". It is already done (P4.1, D-0073, plus P2.3 Follow lineage). The comparison prediction note is also already done (P2.4).
3. Recipe identifier wording: SPEC §14.4 and D09 say "revision"; BUILD_DIRECTIVE, UX §3.4 and `variantIdentity` say "rev".
4. UX §7.4 says a division shows "a static split frame for 1 s" under reduced motion. `renderer.ts` `handleEvents` draws nothing then. narration is told to fix the code.
5. BUILD_DIRECTIVE says "five objectives"; SPEC says "one objective". I read it as one objective chosen from the five types.
6. The wave 5 task file says "P4.5 adds objectiveIds" to the variants. CT §9.4 lists none, so I left them unchanged.
7. D09 puts the Try my dish baseline "in an existing snapshot/save slot"; the shelf is a new record family.
8. g4-plan says two agents at a time; stage 1 runs three, as your brief allows.
9. `IntakeSeen` stores no amounts, so an "eats" arrow cannot show a per-species carbon total.

Every wave 5b fact is a `<lead: …>` placeholder in STATE and the prompts. The two new decision numbers appear as `<lead: D-number>` in STATE and the LEAD PRE-LAUNCH list.

**Builder-hour estimates**

| Task | Hours |
|---|---|
| share | 2.0 |
| try-my-dish | 2.0 |
| observation-map | 1.5 |
| observation-notebook | 1.75 |
| challenge-editor | 1.5 |
| variants-paired | 1.25 |
| narration | 1.5 |
| **Total** | **≈ 11.5** |

Wall time is about 5.25 h across the three stages, plus verification.
