# Phase 7 plan (lead draft, 2026-10-14) — Advanced Living Worlds → `v1.3.0`

Inputs:
- BUILD_DIRECTIVE §Phase 7 (P7.1–P7.7);
- SPEC §6.1–§6.5, §7.12–§7.19, §9 (E13–E17 bullets), §9.19, §12.1–§12.3, CT §5.3, §6.3, §7.1–§7.2, §10.4 (D501–D506),
  §12.8, UX §5–§7, CR R32;
- docs/source/D05 (living behaviors, life cycles, colonies; §04–§18, D501–D506) where the canonical docs are silent;
- docs/agent/g7-briefs.md, three read-only mapping briefs (run wf_e03526d5-2ca; mapped at wave 11, so every code
  touchpoint is re-checked by symbol when Phase 7 starts, after Phases 5 and 6 land);
- docs/agent/g5-plan.md and docs/agent/g6-plan.md (the working rules carried over).

Phase 7 starts after tags `g6` and `v1.2.0`, with the Phase 5–6 rules: one task-file writer per wave (started while
the previous wave builds), disjoint builders that never commit, one rules verifier per wave plus a saves/determinism
verifier per critical task, fix rounds only for BLOCKER/MAJOR, one lead integration per wave, a flip that enables the
phase's content after its code is verified (D-0104).

## Lead calls made up front (record as D-numbers in the Phase 7 preflight commit)

1. **v1.2 saves are proven before any Phase 7 edit.** On the v1.2.0 code: tools/make-v12-saves.ts →
   tests/fixtures/saves-v12/ with {hashAtLoad, hashPlus1000} and v12-replay.test.ts (a reservoir mid-release, a lamp on,
   controllers with holds and queued actions, an applied cross-dish transfer, compacted lineage, favorites and stories,
   a Phase 5 cycle/barrier dish). `fence-update --v12 --reason D-…` is its only writer. `release/1.2` is cut at
   v1.2.0. buildPhase 7 and contentVersion 5 move at the preflight.
2. **Versions, each moved once, in one place:**
   - World SCHEMA_VERSION 6 → 7 once (task `schema7`; COLUMNS_ADDED_IN[6] frozen first), written unconditionally:
     behavior state and timers, decisionInput/decisionValue, a separate `lifeStage` column with its timers and support
     cell (never inside lifeState, so every "lifeState ≠ 0 = not Active" test and E14's stage across Resting survive),
     partner columns, turnHold, the cache object kind with its release tick, and the unhashed timeline store. Every new
     column is hash-neutral at its neutral value (D-0035).
   - PROTOCOL_VERSION 4 → 5 once, by one owner (the Phase 7 worker/render task), with a protocol-4 equivalence test
     for a v1.2 dish.
   - evolutionRulesVersion 1 → 2 (the developmental draw at 1 %/2 %/0, strategy/size/form/role/native operations, the
     A09 branch criteria) and phenotypeMappingVersion 1 → 2 (size, form, native switches, role and stage factors), both
     at the flip; moduleRegistryVersion 3 → 4 at the flip (E13 joins the gain lists of B01, B04–B06, B09–B11, P02, P07;
     E14 those of B02, F01, F02). simulationVersion stays 3 (CR R03).
3. **Every Phase 7 rule is gated on the world's recorded manifest** (deriveProfile applies dev fields only when
   phenotypeMappingVersion ≥ 2; the dev draw rate is 0 unless developmental is recorded; branch criteria only when
   evolutionRulesVersion ≥ 2; E13–E17 only when recorded). Second guard: neutral dev values are exact float identities
   (s = 1 → pow, sqrt and ×1 exact; contact 0.5; class thresholds compared on the integer locus ≥ 90 / ≤ 10, keeping
   0.75 + 0.005 × locus literally). The ancestral score expression and decide()'s loop stay textually the same.
4. **One developmental switch, read through one helper:** the manifest keeps `developmentalEnabled` and the
   'developmental' system flag; the validator and the import require them to agree; code reads worldHasDevelopmental().
5. **One Phase 7 flip** (lead task after the UI wave): E13–E17, 'developmental' with developmentalEnabled, and the three
   version moves together, with one D-number and one fence re-record proven by realizing every moved recipe under the
   pre-flip versions (registryWith) and reproducing its old digest (the D-0059 method); then `fence-update --add` for
   the D501–D506 test recipes. The import's IMPLEMENTED ceilings move in the same commit.
6. **Rulings on the mappers' open questions** (logged in each wave's D-entry; owner flag where marked):
   - An E13 Adult is Fixed (CT §5.3 "attached", D-0115); Juvenile and Settling keep the record class. A B02 disperser is
     Small and a fungal disperser Medium while Dispersing, Settling or Stranded (closes the D-0108 carry-over).
   - Night forager's quiet phase stops voluntary movement and ordinary feeding, not digestion of a held meal; contact
     vulnerability continues. The quiet/active state is a column, never re-read from light by the inspector.
   - A strategy operation is eligible only for a self-propelled parent profile (template speed > 0 or E07), whatever its
     stage; night_forager only for the CT §6.3 list; the threshold operation only while the strategy is night_forager.
   - "Moving toward…" reads the stored decisionInput/decisionValue written at the decision (honest labels).
   - E13 support: anchorSupported (stone, wall, bead, rim, 4-neighbour) or an S06 mesh in or beside the cell, stored in
     settleCell; E14 valid support: the species' own attachment surfaces with usableFood ≥ 0.10; the E14 controller's
     sensing radius is 1.
   - Strategy weights, size eligibility, roles and the native whitelist are content (content/developmental.json),
     versioned with evolutionRulesVersion.
   - E15/E16 rate caps use the derived b0'; an introduced sized organism enters at b0' as a recorded external input;
     role and size scale ordinary maintenance only, never module surcharges; a bonded organism forms or keeps no E12
     link and the E15 pass skips it; sampling breaks a bond (partners are not colony members); one object per cell (a
     cache deposit on an occupied cell is refused at no cost; a basket may hold a cache).
   - Stage 8 order: construction → cache commit → traps → F02 → E15 → E16 (SPEC §3.2 + D05 §17).
   - Dev operations in saved proposals reuse propLocus (8 + field index) and propDelta; the Streamlined turn hold
     belongs to the movement owner.
   - Canonical over D05 where they differ: E15 requires E12 and E17 requires E08 (CT §7.2); D05's "survives as
     inactive" is logged as a conflict, not implemented.
   - The timeline is an unhashed, saved store capped at 300 cards (the oldest merge into one "N earlier cards
     compacted, incomplete" card), with "because" only where a recorded mechanism supports it.
   - D501–D506 are test-only recipes (they carry transfer-only overrides D05 §16 keeps out of production).
   - The lineage portrait's founder defaults to the line founder with a "nearest named ancestor" toggle; compacted
     lineage falls back to Branch.ancestorGenome, labelled. Portraits derive profiles from a detached genome and never
     intern one (the genome table is hashed).
   - Follow (D05: suspend and resume, no jump on extinction) and favorites keep separate rules.
   - A "Living Behaviors copy" of an older dish is offered (the original is kept). Owner flag.

## Waves (two builders at a time on 2 cores; more if the machine allows)

Contended across Phase 7: movement.ts, intake.ts, births.ts, phenotype.ts, profiles.ts, contacts.ts, barriers.ts
(classOf), mutation.ts, maintenance.ts, structures.ts (stage 8), ledger.ts, protocol.ts, snapshot.ts, Inspector.tsx.

| Wave | Tasks | Critical | Notes |
|---|---|---|---|
| Preflight | v12-corpus (one builder) + lead (release/1.2, buildPhase 7, contentVersion 5, D-numbers) | v12-corpus | On the v1.2.0 code. |
| 23 Foundation | schema7 (23a world + saves, 23b import checks and IMPLEMENTED ceilings), dev-content (developmental.json, schema, validator, E15–E17 params, D505/D506 records, S07 text) | schema7 | |
| 24 Behavior and form | strategies (movement, intake quiet, maintenance overhead, Streamlined turn hold), phenotype-v2 (size/form/native switches, sized classOf, the per-pair contact helper, births' min energy and placement), dev-mutation (draw 4, eligible-op list, branch criteria) | all three | One owner each for movement.ts, phenotype.ts/profiles.ts, mutation.ts. |
| 25 Stages and colonies | e13-settler (lifeStage.ts framework), colony-exchange (E15 + roles), partner-bond (E16), food-cache (E17) | all four | Two stages of two if births.ts or structures.ts force it. |
| 26 Dispersal and data | e14-dispersal, timeline-sim, portrait-data, organism-ui part 1 (protocol 5 owner: cue bits, inspector fields) | e14, timeline | |
| 27 Screens and art | behavior-ui, organism-ui part 2 (Field Guide, colony panel), stage and organism art, portrait-follow-ui, timeline-ui | none | Then the lead's **Phase 7 flip**. Ticks P7.1–P7.6. |
| 28 Fixtures and gate | p7.7a D501–D506, p7.7b regression (conservation-p7, state-integrity-p7, determinism-p7, viewing-neutral, migration-v13), p7.7c perf (6,000 agents, E15 colonies, E16 bonds, 128 caches) and gate | p7.7a, p7.7b | The `g7` ritual, package.json 1.3.0 / versionCode 10300, a v1.2.0-worktree refusal check, tags `g7` and `v1.3.0`. |

Estimate on 2 cores: about 8–9 h per wave including integration, so roughly 60 h. On an 8-core machine about half.

## Risks to watch

- Stage factors outside profileOf would let the inspector and the simulation diverge: the profile cache is keyed on
  (genome, expression key: role, stage); one owner for phenotype.ts and profiles.ts per wave.
- Refactoring crowding to prof.b0 would erase occupancy: four sites keep the ancestral b0 (BS2).
- births.ts reads DIVISION_MIN_ENERGY, not the profile: a sized organism would divide below 60 × s.
- The contact refactor must give handling continuity (Phase 5 wave 12), parasite attach and pursuit stop one helper.
- A moving fungal disperser breaks fungi.ts's assumptions (occupied, placement, network, transport, the connection-mask
  renderer): exclude it everywhere; the F02 parent reference goes stale on the parent's next division and must be
  cleared by Sample and cross-dish transfer.
- The prey "free" rule reads species.attached: dispersing B02 would be uncatchable and E13 adults catchable as free prey
  unless it reads the stage.
- E15 cycles: snapshot-only pass, donors receive none, both scalings; ledger donor −x, receiver +0.9x, dissipated 0.1x.
- Adding sizeLocus to qualifies() moves old worlds' branches unless every A09 criterion is gated on the recorded
  evolutionRulesVersion.
- D501's dwell cadence (threshold timers on the 0.5 s schedule land the switch in 15.0–15.5 s) and D506's release from
  tick 1 need stated windows and tolerances.
- The timeline store's size against the 25 MB import cap.

## Carry-overs (task writers: put each into its wave's assignment)

- **To the Phase 5 systems flip (done there, not in Phase 7):** the import refuses a dish whose recorded
  evolutionRulesVersion, phenotypeMappingVersion or moduleRegistryVersion exceeds what the build implements, or that
  records developmentalEnabled true, with the D-0119 "needs a newer version" refusal (the mapper found the import checks
  only simulationVersion).
- S07's guide text "(a pellet or a wafer)" adds the E17 cache (g5-plan carry-over).
- CT §5.3's "fungal disperser" is Medium (D-0108 carry-over) — closed by call 6.
