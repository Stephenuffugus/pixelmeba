# Wave 10 task-file writer report (run wf_3eee27c3-2a4, 2026-10-13)

The wave 10 task file is written at `/workspaces/pixelmeba/docs/agent/g5-wave-10.tasks.js.txt`, and it parses. I also dry-ran `tools/lead/build-run-file.py` with the output going to my scratchpad, so the repo is unchanged; it printed "parse ok". No other repo file was touched. One thing to check before launch: a B02 daughter is classed Small instead of Fixed at HEAD (contradiction 1 below).

Parse output:
```
barrier-transport 4271 1 own 20399
structure-commands 4272 1 own 21603
e2-shells 4273 2 true 10698
e3-resters 4274 2 true 14088
```

**Stages and file ownership** (one owner per file per stage)

Stage 1:
- **barrier-transport** (4271, critical 'own')
  - New: `src/sim/channel.ts`, `src/sim/resin.ts`, `src/sim/gateTally.ts`.
  - Tests: `tests/sim/{barrier-transport,channel,resin,gate-tally,barrier-transport-determinism}.test.ts`.
  - Owns: `transport.ts` (but not `diffuseField`), `constants.ts` (additive), `tick.ts` (two hook calls around stage 4), `edgePassage.ts` (additive exports).
  - Also `barriers.ts`, but only for the `classOf` fix, and only if wave 9 left the bug.
- **structure-commands** (4272, critical 'own')
  - New: `src/sim/structureEdits.ts`, `src/sim/structurePreview.ts`.
  - Tests: `tests/sim/{structure-commands,structure-lab-edits,climate-commands,structure-links,structure-determinism}.test.ts`, `tests/worker/structure-commands-host.test.ts`.
  - Owns: `structures.ts`, `commands.ts`, `grid.ts` (`lifeCellOutcome` optional parameters only), `objects.ts` (`relocateObject`), `sample.ts` (transfer check only), `tests/helpers/world.ts` (new helpers only).
  - Additive cases only: `src/worker/challenge.ts` and `src/ui/panels/CompareText.tsx`. TypeScript forces these, because both switch exhaustively over the command kinds.

Stage 2:
- **e2-shells** (4273, critical true)
  - Tests: `tests/fixtures/{shells-silicate,grit-dissolution,conservation-mineral}.test.ts`, `tests/sim/shells-determinism.test.ts`.
  - Owns: `intake.ts`, `conversion.ts`, `constants.ts` (additive).
- **e3-resters** (4274, critical true)
  - Tests: `tests/fixtures/{dormancy-native,resting-daughter,phage-v02,parasite-x02}.test.ts`, `tests/sim/resters-determinism.test.ts`.
  - Owns: `dormancy.ts`, `births.ts`, `fungi.ts`, `viruses.ts`, `parasites.ts` (only for a gap a test proves), `moduleView.ts` (the cause and wake lines).
  - Also `reasons.ts` (append `RESTING_NEWBORN` at the end), `src/ui/strings/reasons.ts` (its copy plus the `SILICATE_LIMITED` Lab line on e2-shells' behalf), and additive edits to `edgePassage.ts` and `tests/helpers/world.ts`.

The only stage 2 edits to stage 1 files are `constants.ts` (e2-shells) and `edgePassage.ts` / `tests/helpers/world.ts` (e3-resters).

Nobody owns these this wave: `movement.ts`, `contacts.ts`, `actions.ts`, `phenotype.ts`, `suitability.ts`, `chemistry.ts`, `content/schema.ts`, `recipes.ts`, `protocol.ts`, `snapshot.ts`, `art/src/index.ts`, `implemented.ts`, `src/persistence/**`.

**Proposed decisions**

Lead calls:
- PROPOSED DECISION: two stages of two. Stage 1 is barrier-transport and structure-commands, each critical 'own'. Stage 2 is e2-shells and e3-resters, critical true, sharing one saves verifier.
- PROPOSED DECISION: `A.verifyGroups` = [[barrier-transport, structure-commands], [e2-shells, e3-resters]]. Rules verifiers on 4390/4391, saves verifiers on 4396/4397/4398, re-verify on 4394, never 4290.
- PROPOSED DECISION: nothing is enabled, no schema bump, and `PROTOCOL_VERSION` stays 2 even though the `CommandPayload` union the protocol carries gets wider.
- PROPOSED DECISION: builders do not edit `implemented.ts`. The lead appends DORMANCY, RESTING_DAUGHTER and SHELL at integration. This goes against the runner's "add what you implement" and wave 9's CANOPY precedent, but matches the briefs.

Barrier transport:
- PROPOSED DECISION: if wave 9 has not fixed it, `classOf` treats an organism of an attached species as Fixed unless it is a resting newborn (contradiction 1). The `barriers-table` pin is re-pinned.
- PROPOSED DECISION: dissolved and activity fields share one barrier-adjusted coefficient pair. The viral pair is the same array unless an S01 exists. The cache rebuilds on `geometryVersion` or a change in the `world.edges` array identity. Film halves the coefficient after the barrier factor is applied.
- PROPOSED DECISION: gate tallies add |flux| per field, in field units, using the kernel's own expression on pre-step values. S04 is excluded from diffusion tallies; channel moves are tallied.
- PROPOSED DECISION: organism crossings are counted by tracing each organism's straight path from the start to the end of stage 4, inside `tick.ts`. An attached parasite counts as its own crossing.
- PROPOSED DECISION: the channel moves dissolved and viral pools only, never activity fields.
- PROPOSED DECISION: a channel moves one organism only if it is Small and free: not attached, not a host or an attached parasite, not linked, not anchored, not held. Any life state qualifies. The lowest birthId goes first. The destination must pass `canOccupy`, except that a resting newborn only needs her habitat. She moves by an exact integer offset, and `nextOrganismTick` is set to tick + 10 only after a move.
- PROPOSED DECISION: in resin, the last selected target takes the exact remainder; `bound` is created lazily; there is no ledger line.
- PROPOSED DECISION: every command write to edges or devices bumps `geometryVersion` exactly once. Stage writes (`nextOrganismTick`, resin `bound`) do not bump it, and no cache may key on them.

Structure commands:
- PROPOSED DECISION: eight new command kinds, added flat like the habitat edits: `placeEdges`, `placeDevice`, `removeStructures`, `moveDevice`, `setDevice`, `wetBrush`, `setLightMode`, `setDrying`.
- PROPOSED DECISION: new optional result keys `ids`, `refused`, `exported` and `severed`, plus optional `device` and `barrier` skip counts, so older command logs stay byte-identical.
- PROPOSED DECISION: an S03 is placed with its open state in the payload, and an S04 with its flow.
- PROPOSED DECISION: an edge is refused on the rim, next to a stone or wall, on an edge that already has one, for an S04 that does not join two open water cells, and at the cap.
- PROPOSED DECISION: a removed resin's bound activity is exported in the command result only, since activity is not a conserved material.
- PROPOSED DECISION: moving a basket moves its food object too. "Prevents partial sampling" already holds because objects always sample whole.
- PROPOSED DECISION: `moveDevice` is atomic on both the paused and queued paths; "paused only" is the UI's offer in wave 11.
- PROPOSED DECISION: a barrier placed across a link, or a shutter closed across one, cuts the link with a `linkBroken` event (cause 'barrier'). It is not refused.
- PROPOSED DECISION: Lab edits skip device cells and S04 sides (new skip reasons `device` / `barrier`) rather than removing the structure.
- PROPOSED DECISION: in the Life brush preview a shelter cell returns 'structure', and the new mesh/shelter inputs are optional so today's results are unchanged.
- PROPOSED DECISION: challenge groups: structure commands and the wetting brush count as 'habitat'; light mode and drying count as 'lid'. `setDevice`, `setLightMode` and `setDrying` do not use up a challenge's actions.
- PROPOSED DECISION: sample Transfer checks the destination with `canOccupy`, so the shelter rule applies.

Shells and resters:
- PROPOSED DECISION: grit dissolution scans every cell while the grit field exists, because the code that writes grit never marks the field active. No threshold zeroing.
- PROPOSED DECISION: the F04 resting daughter is placed by her own Small class, so she can be placed across an S02 (owner flag; see contradiction 3). Her candidate cells stay attachable ones. She is unlinked, her birth event detail gets `resting: 1`, and no rest event fires at birth. `RESTING_NEWBORN` is appended to the reasons. Being able to attach is an optional wake condition, and the newborn flag clears in the tick she becomes Active.
- PROPOSED DECISION: V02's film minimum is a constant in `viruses.ts`, and a host is skipped before its draw.
- PROPOSED DECISION: copy for `RESTING_NEWBORN` is "Resting since it formed." and the Lab line names the wake conditions.

**Placeholders left** (search "<lead:")
- STATE: "<lead: D-number>", the classOf line "<lead: wave 9 as built — fixed or not>", and the whole "WAVE 9 AS BUILT" line.
- barrier-transport: in Read (wave 9 signatures, `TransportCache` fields and stage order, test helpers), item 3 (the class helper name), Done-when (wave 9 test names).
- structure-commands: in Read (the `climate.ts` and `edgePassage.ts` functions it calls), item 10 (what `wetCells` returns), Done-when (wave 9 test names).
- e3-resters: in Read (how placement gets its class), item 2 (how to pass the daughter's class), Done-when (wave 9 barrier-placement test name).
- The header's run-file description and owner context are for you to fill.

**Contradictions in the tree**
1. Births never set the attached flag on a new daughter, so `classOf` classes a B02 daughter as Small. CT §5.3 says attached colonies are Fixed, and this affects wave 9's placement checks and channel eligibility.
2. The brief's "dry-trigger fixture uses P5.1 moisture" can't work for B12, F04 or P08. With CT's numbers (minimum 0.2, shoulder 0.2, drying floor 0.1) their moisture suitability never drops below 0.5, so they never rest from dryness. The e3-resters prompt proves the dry trigger with an E03 carrier (B01) instead and flags this for the owner.
3. D-0106 says "either party's class" for placement, while the g5-plan carry-over says the daughter's "own class". I followed the carry-over.
4. Your line refs 184 and 186 are ART-SMALL and E3-PREDATION. E2-SHELLS is at g5-briefs.md line 182 and E3-RESTERS at 185.
5. V02's half-speed diffusion already exists at HEAD (`viralHalf`), so e3-resters only tests it.
6. Code that writes grit never marks the field active (`maintenance.ts`, `contacts.ts`).
7. `sample.ts` Transfer uses `habitatCompatible`, which bypasses wave 9's shelter rule in `canOccupy`.
8. The runner tells builders to update `implemented.ts`, while the briefs say the lead does it at the flip.
9. CT §4's "basket prevents partial sampling" is already true for every food object.

**Builder-hour estimates**
| Task | Estimate |
|---|---|
| barrier-transport | 2–2.5 h |
| structure-commands | 2.5–3 h |
| e2-shells | 1–1.25 h |
| e3-resters | 1.5–2 h |

That is about 3 h for stage 1 and 2 h for stage 2, plus about 1 h of verification.

## Lead notes (2026-10-13)

- Contradiction 1 (B02 daughters classed Small): ruled in D-0114; the lead fixes classOf at wave 9 integration.
- Contradiction 3 (either party vs own class): ruled in D-0114 for D-0106 (the parent's class bounds placement); the e3-resters prompt and the g5-plan carry-over are corrected.
- The other proposed decisions and contradictions 2 and 4–9 are recorded as a D-number at wave 10 pre-launch. Contradiction 2 (the native dry trigger cannot fire with the CT numbers) is an owner flag.
