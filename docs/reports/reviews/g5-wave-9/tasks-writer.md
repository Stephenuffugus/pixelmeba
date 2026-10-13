# Wave 9 task-file writer report (run wf_5b0fa7ad-dbf, 2026-10-13)

The wave 9 task file is written and parses. Nothing else in the repo was touched; the other changes in the working tree are wave 8b's, still in flight. A dry run of `tools/lead/build-run-file.py` into my scratchpad printed "parse ok".

**Parse output**
```
climate-stage2 4271 1 own 23257
barrier-movement 4272 1 own 18268
```

**Stage and ownership table** (one stage, both tasks `critical: 'own'`; rules verifier 4390, saves verifiers 4396 and 4397, re-verify 4394)

| Task | New files | Files it owns |
|---|---|---|
| climate-stage2 (4271) | `src/sim/climate.ts`; tests `climate-{cycle,warmth,moisture,light,determinism}.test.ts` | `transport.ts` (stage 2 order in `stageEnvironment`, `updateDerived`, new `TransportCache` fields; `diffuseField` is not touched); `suitability.ts` (the warmth line only); `chemistry.ts` (`lightFactors`); `constants.ts`; `world.ts` (comments, and a `Derived` field only if needed); `structures.ts` (one moisture-reset call in `paintSubstrate`); `implemented.ts` (append `'CANOPY'`); `tests/helpers/trajectory.ts` (registrations, none expected) |
| barrier-movement (4272) | `src/sim/edgePassage.ts`; tests `barrier-{movement,contacts,placement,determinism}.test.ts` | `movement.ts`; `crossing.ts` (shelter check in `enterCell`); `births.ts` (`findPlacement`); `fungi.ts` (`fungalPlacement`); `contacts.ts`; `parasites.ts`; `adhesion.ts`; `attachment.ts` (the mesh surface, `SURF_MESH`); `barriers.ts` (new exports only); `tests/helpers/world.ts` (new helpers only) |

- **Shared additive files:** none. Each task writes its own local test helpers, and neither adds a top-level World key.
- **Where things live:** `updateDerived` and the stage 2 order are in `transport.ts`. `tick.ts` is not edited. Light and shade are computed in `updateDerived` plus `chemistry.ts` `lightFactors`.
- **Untouched by both:** `serialize`, `entities`, `gates`, `fields`, `grid`, `tick`, `commands`, `devices`, `intake`, `recipes`, `src/persistence/**`, `src/worker/**`, `src/render`, `src/ui`, `content`, `art`, `tests/fixtures/**`.

**Proposed decisions** (the canonical docs are silent on each)
1. Wave 9 scope as you called it: two builders in one stage, both critical with their own saves verifier; e2-shells stays in wave 10; the ports above.
2. Cycle phase is `((t − cycleStartTick) mod 2400)`. Stage 2 of tick T uses t = T. Every other `updateDerived` caller uses t = max(tick − 1, cycleStartTick), meaning "the last completed stage 2". This is done through an optional `lightTick` parameter.
3. Canopy reads living CANOPY-ability biomass at the moment light is computed. That includes this tick's inoculations. After a reload, the displayed canopy can differ for one tick; the state hash cannot.
4. Canopy feeds into effective light, so every reader of light gets it: photosynthesis, E07 light seeking and dormancy.
5. The roof's light rule is gated on the recorded S11 alone, not on 'climate'. Roof-only light is recomputed when its cache key moves, not every tick.
6. After any per-tick light recompute, `tc.lightVersion` is set to −1. Leaving the cycle, or losing the last canopy organism, then recomputes once.
7. Warmth order each tick: relax toward `settings.warmth`, diffuse with the existing `diffuseField`, apply devices, clamp.
   - Heaters and coolers act on their own cell only; "overlapping neighbours add" is read as their gradients adding.
   - Warmth passes beads, S01, S02, an open S03 and S04. Stone, walls and a closed S03 stop it.
8. The warmth array is allocated in stage 2 when an S09 or S10 is On. The moisture array is allocated in stage 2 when drying is on, or by `ensureMoisture` for the wet brush. A wick or roof alone allocates nothing. Arrays are never freed.
9. Drying applies to every gel or sediment cell without an S11, whatever structure stands on it.
10. Wick behaviour:
    - It moves a cell linearly toward 0.8 at 0.001 per tick, in both directions.
    - A cell wetted by several wicks still moves at that one rate.
    - It does not wet its own cell.
    - "Touches water" means water substrate that is not stone or wall.
11. Repainting substrate resets that cell's moisture through one hook in `structures.ts`.
12. `lightFactors` returns exactly the old three keys unless the world records 'climate', an S11 or a CANOPY species.
13. `'CANOPY'` is appended to `IMPLEMENTED_NATIVE_ABILITIES`.
14. An exact diagonal corner crossing, and diagonal placement or contact, needs both L-shaped paths to permit the class.
15. A daughter is placed in her parent's class at the moment of birth.
16. The S05 shelter rule is per species and lives in `canOccupy`, so inoculation, founders, births and fungi inherit it. Small and Fixed organisms are not affected.
17. A hunter's target behind an edge that blocks the hunter's class is not acquired, and an existing one is cancelled at once. The check is edges-only.
18. E12 adhesion links are covered by D-0106's "links", so `adhesion.ts` goes to barrier-movement.
19. Per-world caches are keyed on `geometryVersion` plus the store array's identity. From wave 10 on, every writer of edges or devices must bump `geometryVersion`.
20. Existing links that cross a later barrier are severed (or the placement refused) in wave 10.

**Placeholders left** (search for `<lead:`)
- STATE: `<lead: D-number>`, `<lead: 8b contentHash>`, and the "WAVE 8b AS BUILT" line.
- climate-stage2: whether `realizeRecipe` sets `cycleStartTick` to 0 and bumps `geometryVersion` after placing devices (two places).
- barrier-movement: whether recipe placement bumps `geometryVersion` (two places); recipe devices and founder order (one place).
- The build command's `<description>` and `<owner context>`.

**Where the tree contradicts the plan, the briefs or BUILD_DIRECTIVE**
- `src/sim/crossing.ts` is not new. It is P04's water-crossing module from Phase 3 (1cfe848), so the organism edge helpers go in a new `edgePassage.ts`.
- Briefs line 34 puts the shelter rule in `habitatCompatible` (`suitability.ts`). That file belongs to climate this wave, so the rule moved to `canOccupy`.
- Briefs line 32 recomputes light every tick for a roof; the roof is static, so the file keys it instead.
- Briefs line 33 allocates moisture when a wick is placed; the file does not, because a wick alone changes nothing.
- The brief's C3 says "overlapping neighbours add", while D02 says a heater "changes its cell". The file takes own-cell.
- The lead's barrier-movement list omitted `adhesion.ts`, which E12 links need.
- `g5-plan.md`'s wave table row 10 says "all four" critical; your call makes wave 10 two stages of two, so the plan needs the same edit.
- CT §12.2 says warmth relaxes "to 0.50"; SPEC §4.7 says "toward ambient". The file uses `settings.warmth`.
- `src/worker/snapshot.ts` still shows `settings.warmth` in the inspector. It is harmless while nothing is enabled and is listed as a wave 11 carry-over.

**Estimate:** climate-stage2 about 2–2.5 builder-hours (five test files, the light convention, the perf probe). barrier-movement about 2 hours. Add about 1 hour for verification.

Files are in /workspaces/pixelmeba/docs/agent:
- g5-wave-9.tasks.js.txt
