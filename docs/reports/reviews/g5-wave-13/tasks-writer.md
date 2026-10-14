# Wave 13 task writer: report

File: /workspaces/pixelmeba/docs/agent/g5-wave-13.tasks.js.txt (126 KB). It describes only what is committed at HEAD 9d22ec0. Wave 12 and the systems flip come from their contracts and are marked with `<lead: …>` placeholders.

## Parse check

`node -e "…replace(/^export /gm,'')… WAVE_TASKS.map(t=>[t.key,t.port,t.stage,t.critical||false,t.prompt.length])"`:

```
e3-traps 4271 1 own 28315
e3-jacket 4272 1 own 20255
org-ui 4273 2 false 17122
relmatrix 4274 2 false 7680
```

## Stages and ownership (one owner per file per stage)

| Stage | Task (port, critical) | New files | Owned files |
|---|---|---|---|
| 1 | e3-traps (4271, 'own') | src/sim/traps.ts (item 0 first), tests/fixtures/traps.test.ts, tests/sim/trap-saves.test.ts, tests/sim/trap-sample.test.ts, tests/sim/trap-determinism.test.ts, tests/persistence/trap-import.test.ts | contacts.ts (stageContacts, consumePrey), intake.ts (two drain calls and the broth skip), maintenance.ts (killEntity, DEATH_TRAP_DRAIN), ledger.ts (computeTotals), sample.ts, sampleSlot.ts, src/persistence/phase5State.ts, events.ts (3 types), constants.ts (TRAP_*), entities.ts (comment only), tests/persistence/phase5-import.test.ts (trap cases) |
| 1 | e3-jacket (4272, 'own') | src/sim/jacket.ts, tests/fixtures/module-e11.test.ts, tests/fixtures/e11-handling.test.ts, tests/sim/jacket-saves.test.ts, tests/sim/jacket-determinism.test.ts, tests/sim/trap-hooks.test.ts | actions.ts, structures.ts (stageStructures), movement.ts, births.ts, phenotype.ts (Profile.jacket), construction.ts (read only unless a helper is factored out), tests/sim/stage8-order.test.ts |
| 2 | org-ui (4273, not critical) | tests/worker/cue3-org.test.ts, tests/worker/inspect-p5.test.ts, tests/render/features-p5.test.ts, tests/ui/inspector-p5.test.ts, tests/e2e/organismFixture.ts, tests/e2e/organisms-p5.spec.ts | snapshot.ts, protocol.ts (additive), render/features.ts, layers.ts, renderer.ts (marks only), art/src/layers/modules.ts (move only), Inspector.tsx, src/ui/inspector/*, src/ui/strings/*, src/ui/observe.ts (names), src/sim/experiments.ts (secretion share), moduleView.ts / moduleNotes.ts (E11), and the re-pinned art, visuals, reduced-motion and protocol3 tests |
| 2 | relmatrix (4274, not critical) | tests/fixtures/relationship-matrix-p5.test.ts, docs/reports/relationships-g5-preflip.md (generated) | tools/relationship-matrix.ts, tests/helpers/tables.ts, tests/fixtures/relationship-matrix.test.ts |

- **Shared lines.** All of them sit in e3-jacket's files and call e3-traps' traps.ts API: TRAP_TARGETS, worldHasTraps, trapApplies, trapArmRun and trapStep. These are hooks T1–T5:
  - T1, births.ts: a held organism cannot divide;
  - T2, births.ts: the trap pair is re-keyed at the owner's division;
  - T3, movement.ts: a held organism does not move;
  - T4, actions.ts: the TRAP native entry, id 7;
  - T5, structures.ts: trapStep after the mineral pass.
- **Verifiers.**
  - `A.verifyGroups = [['e3-traps','e3-jacket'],['org-ui','relmatrix']]` (rules verifiers on 4390 and 4391).
  - Saves verifiers: 4396 (e3-traps) and 4397 (e3-jacket).
  - Re-verify: 4394. 4398 stays free; 4290 is never used.

## PROPOSED DECISIONs

1. **The file split (argued against the lead's call to give actions.ts to e3-traps).**
   - Code facts:
     - structures.ts stageStructures must take both tasks' stage 8 calls: the mineral pass and the trap step (SPEC §3.2 row 8). Neither task's list in the call had it.
     - movement.ts and births.ts need both tasks' lines: held no-move and the jacket speed in movement.ts; held no-divide, the trap re-key and the §9.19 grit in births.ts. movement.ts was in neither list.
   - The ruling:
     - actions.ts, structures.ts, movement.ts, births.ts and phenotype.ts go to e3-jacket, which writes hooks T1–T5 for e3-traps.
     - Every cross-task line then runs one way: from e3-jacket's files into traps.ts, which e3-traps creates first.
     - e3-traps keeps the heavier saved-state files.
     - The split the call proposed would have needed imports in both directions.
2. **Trap prey by ancestor id.** CT §3.3 "traps P04 only" becomes `TRAP_TARGETS = ['P04']` in traps.ts, following the rivalry.ts RIVAL_TARGETS precedent (D-0119). There is no content edit: F03.json's `prey` means predation and `hostIds` means HOST_DRAIN, and both are empty. This is also "the trap's prey data" that D-0108's import carry-over needs.
3. **Trap state.** The state is derived, as cue3Of derives it:
   - holding = a valid trapSlot;
   - cooldown = trapCooldown > 0;
   - armed = reserve > 0 with no target and no cooldown;
   - none = no reserve.

   One trap per owner is built once, and the reserve persists. Arm thresholds are inclusive. The 8 E arm cost and E11's 10 E per mineral are both ledgered as 'construction', so no new ledger key is added and no saved ledger changes shape.
4. **Capture.**
   - The target must be in the owner's own cell, by entityCell. Ties go to the nearest, then to the lower birthId.
   - Competing owners resolve by det priority with KIND_TRAP 5.
   - Capture runs after predation claims and before parasite attachment.
   - The target must be Active and not already held.
5. **Drain.** The drain follows the parasites.ts host-drain rules exactly (D02 392: "the same resource split as X02"), as separate functions in traps.ts. "Draining" means holding a valid target at the start of stage 6. A draining owner requests no broth, and its limitCode is NONE after the drain commits.
6. **Timeline.** The hold timer and the cooldown advance in stage 8 trapStep, with EPS 1e-9.
   - The trap releases at stage 8 of the 80th held tick (80 drains).
   - The cooldown takes 300 decrements.
   - The next capture can come on the 301st tick after release.
7. **Cooldown.** Every hold ends with the 30 s cooldown: the timer, the target's death or a removal. SPEC names only the timer release.
8. **Labels and death.**
   - HELD_IN_TRAP is derived by the inspector from heldBySlot and is never written into limitCode, following wave 12's CAPTURED_HANDLING pattern.
   - DEATH_TRAP_DRAIN applies when B is strictly below 0.25 × B0'. It is checked in stage 7, after the parasite drain-death check.
9. **Sample.**
   - The trap and its held prey are one ownership unit that travels intact through Take, Transfer, Cancel and Discard (SPEC §10.5; D-0108's REF_COLUMNS carry-over).
   - REF_COLUMNS gains both pairs. LINK_REFS excludes them, because a trap pair is not a link.
   - HELD_REFS gains both pairs.
   - Nothing is released at Take, Transfer or Discard. See contradiction 2.
10. **Import.**
    - New refusals:
      - the target is not trap prey;
      - trap state without a reserve;
      - an invalid hold time;
      - an invalid wait.
    - The "not counted yet" reserve refusal is dropped.
    - A held organism outside its owner's cell is NOT refused: an integer Transfer offset can round across a cell edge, as D-0118 found for the channel.
11. **consumePrey** releases a trap pair defensively (why 'removed'). No CT prey list can reach this today.
12. **Held organisms.**
    - T3: a held organism skips movement, right after the life-state override.
    - T1: a held organism's division blocker is DIV_BLOCK_STATE. org-ui words it "Can't split while caught in a trap."
13. **E11 building.**
    - E11 builds at E ≥ 15 (inclusive: "skip while E < 15").
    - The mineral pass lives in jacket.ts and uses construction.ts's pin pattern: a scaled cell ends at exactly 0 silicate, with the dust in roundoff.m.
    - ActionContext.requestMineral reserves energy only.
    - E11 is module action id 11.
14. **One coverage function.** Wave 12's handling.ts jacketCoverage is the only coverage function, used for the speed, handling and the CUE3 band. A content check pins E11's targetPerBody and its handling params to wave 12's constants.
15. **Jacket speed.** The factor (1 − 0.20c) applies only to the per-tick displacement, and only when jacket > 0 and E11 is present. Decisions are unchanged. The old expression is left untouched otherwise, with no ×1.
16. **§9.19 reconcile.** It runs in commitDivision's reconciliation loop, after placement. A daughter without E11 drops her jacket as grit in her own cell.
17. **org-ui, display rules.**
    - Two additive CUE3 bits (shift 13) carry the D-0112 handling quarter, with no stride or PROTOCOL_VERSION change.
    - EntityInspect gains optional fields.
    - trap_loop's "closing" frame shows for 1 s after a committed 'trapHold' visual event. Reduced motion uses frame 1 only.
    - Mark priority: live state, then glow, then mode and jacket.
    - One name per field: "rivalry chemical", "glow signal".
    - experiments.ts counts the starch secretion share by producer bit.
    - V02 glyph polish goes to P5.8.
18. **Lab wordings.** org-ui proposes the Lab wording for HELD_IN_TRAP, CAPTURED_HANDLING and PRED_HANDLING_IN_PROGRESS; UX §5.2 has no rows for them. The Explore copy already exists.
19. **relmatrix.**
    - phase5Registry() uses allowUnimplemented.
    - The CLI gets `--registry shipped|phase5`.
    - It writes a pre-flip report.
    - The shipped-registry rows stay byte-identical.
20. **Validator subject.** After wave 13 every NativeAbility is implemented. The "native ability is not implemented" validator case is rewritten with `vi.mock(implemented, importOriginal)` minus TRAP. A made-up id cannot work: it fails the z.enum first.
21. **Skipped journeys.** org-ui's trap and jacket journey cases are written with test.skip, because the import refuses those dishes until the build implements TRAP and E11. The lead un-skips TRAP at integration and E11 at the organism flip.
22. **New events.** 'trapArmed', 'trapHold' and 'trapRelease' (why 'timer' | 'targetDied' | 'ownerDied' | 'removed'). org-ui decides in stage 2 whether 'trapHold' enters visualEvents.
23. **entities.ts comment.** e3-traps corrects the trap columns' comment only.

## `<lead: …>` placeholders left (12)

- **STATE:**
  - systems flip as built;
  - wave 12 as built;
  - this wave's D-number;
  - the post-flip contentHash;
  - the post-flip systems list;
  - the post-flip structures list.
- **e3-traps Read:** wave 12's contacts.ts, intake.ts, events and import.
- **e3-jacket Read:** wave 12's handling.ts and constants, movement.ts, births.ts and phenotype.ts.
- **org-ui Read:** wave 12's exports and event shapes.
- **relmatrix Read:** wave 12's handling and radius rules.
- **LEAD AFTER, item 3:** the flip's fence dish test files.
- **ORGANISM FLIP, item 3:** the flip dishes' recorded manifests.

The working tree showed contentHash 67075b0e… → 84c41636… while the flip ran; the lead should confirm it.

## Contradictions in the tree vs g5-plan, the briefs and BUILD_DIRECTIVE

1. **The reserve.** The entities.ts comment on the trap columns says the reserve is "drained from the held organism". SPEC §7.17 and D02 392 say the reserve is the 0.20 C the F03 moves from its own body. The drain goes to the F03 through the host-drain split. The comment is fixed in this wave.
2. **The trap in a sample.** D-0106 (and g5-plan line 80) says "its held P04 is released alive at commit". SPEC §10.5 ("trap + held prey" is a whole ownership unit, and Transfer moves "ownership") and D-0108's carry-over (both pairs in REF_COLUMNS, with the sample closure) say the pair stays together. The writer followed SPEC; the lead should confirm in the D-entry.
3. **Missing file owners.** The lead's call lists no owner for structures.ts or movement.ts, though both tasks need them. Covered by PROPOSED DECISION 1.
4. **Trap prey data.** D-0108's carry-over refers to "the trap's prey data", but no content field holds it. Covered by PROPOSED DECISION 2.
5. **Handling arc frame.** The lead's call says "protocol 3 already carries the … handling … bits", but protocol 3 has only a HANDLING flag, and D-0112's frame needs handlingProgress / handlingNeed. Two additive CUE3 bits are proposed under protocol.ts's "refine without a bump" clause.
6. **Validator subject.** After wave 12's appends and TRAP, no unimplemented NativeAbility is left for the validator test's subject. Covered by PROPOSED DECISION 20.
7. **stage8-order.test.ts:144.** It builds a test table with testNative('TRAP'). That throws "duplicate action" once SHIPPED has TRAP. e3-jacket re-pins it to an ability with no stage 8 action.
8. **phase5-import.test.ts.** It accepts a holding pair with reserve 0 and a cooldown with no reserve. Both are unreachable under this wave's rules, so e3-traps re-pins them.
9. **The systems flip's import rule.** The rule (implemented, not enabled) blocks e2e fixture dishes that record TRAP or E11 until the lead appends them. Hence the skips in PROPOSED DECISION 21.
10. **Coverage at B ≤ 0.** cue3Of's jacket band gives coverage 1 at B ≤ 0; wave 12's jacketCoverage gives 0. This cannot happen for a living organism. org-ui unifies on jacketCoverage.
11. **Two sources for the jacket numbers.** E11.json carries handlingBaseSeconds, handlingPerCoverage and targetPerBody, while wave 12 uses constants for them. A content check pins them equal.
12. **The backup pid.** The lead's call says to kill tmp/lead/backup-12.pid, but RESUME.md shows the flip's loop at tmp/lead/backup-flip.pid. LEAD PRE-LAUNCH says to kill whichever loop runs.
13. **A flip risk the plan does not list.** Enabling signals, rivalry and silicate at the organism flip allocates sGlow, quencher, rival, silicate and grit in every new dish, so stage 2 diffuses and decays them every tick. Trajectory digests skip zero post-g2 fields, but FIRST_DISH's tick cost should be measured (flip item 5).

## Builder-hours estimate (2 shared cores)

| Task | Hours |
|---|---|
| e3-traps | 2.5–3 |
| e3-jacket | 1.5–2 |
| org-ui | 2–2.5 (including e2e on two projects) |
| relmatrix | 1.5–2 |

Wall clock: about 3 h for stage 1 and 2.5 h for stage 2, plus about 1 h of verify. Integration and the organism flip come on top: the flip's D-0059 proof, check and journeys take about 3–4 h.
