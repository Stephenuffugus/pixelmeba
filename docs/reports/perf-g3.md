# Phase 3 performance report

Phase 3's tick-cost record (BUILD_DIRECTIVE P3.12; ARCH perf budgets; SPEC §16). Wave 6 adds the Phase 3
measurements below the baseline. Take them on a quiet machine, or say how loaded it was: on the shared
2-CPU container, wall time is mostly load (g3-plan-recheck G12, W6-12).

## Baseline at g2

Not re-measured in the Phase 3 preflight (g3-plan step 8 as corrected by g3-plan-recheck G12): g2-close
(P2.9, commit `9c087bc`) already measured the g2 build with the same command, and its numbers are quoted
here from `docs/reports/tune-g2.md` ("Fast enough", lines 997–1009):

> - **Tick cost** (`npm run sim:run -- --recipe FIRST_DISH_V1 --seed 104729 --ticks 6000 --perf`, plus
>   `--preset accelerated`, and the `g1` tag's `sim:run` for Standard): seven interleaved rounds of
>   G1 / G2 Standard / G2 Accelerated on this 2-CPU machine (node 24.21), 1-minute load average 4.8–6.9
>   throughout from other agents' work:
>
> | Build, preset | Runs | Wall ms per tick: p50 median (range) | p95 median | p99 median (range) | Tick-loop CPU ms per tick | Process CPU s, user + system | Agents start / mean / peak / end | Endpoint hash |
> |---|---|---|---|---|---|---|---|---|
> | `g1` tag, Standard | 7 | 4.21 (3.08–4.34) | 10.42 | 14.83 (11.36–16.18) | not recorded by G1's sim-run | 15.7–17.8 (3 runs) | — | `fc8085219c7ed466` |
> | G2, Standard | 7 | 4.14 (2.01–4.61) | 10.23 | 15.15 (9.99–15.47) | 2.35–2.80 (3 runs) | 14.8–17.7 (3 runs) | 56 / 404.9 / 718 / 716 | `b0c7767ea3241baa` |
> | G2, Accelerated | 7 | 4.25 (2.96–4.62) | 10.64 | 15.54 (10.59–16.20) | 2.75–2.83 (3 runs) | 17.3–17.8 (3 runs) | 56 / 403.3 / 715 / 715 | `1a9af2a5c2bd5697` |
>
>   Heaviest stages (G2 Standard, ms per tick, median of seven): environment 2.04, sense/move 1.13,
>   intake 0.74, maintenance 0.36, births 0.32, conversion 0.15.

Reading it:

- The comparable baseline is the **tick-loop CPU time per tick**: 2.35–2.80 ms (Standard) and 2.75–2.83 ms
  (Accelerated) for FIRST_DISH_V1, seed 104729, 6,000 ticks, peaking at about 720 agents. The wall-clock
  percentiles were taken at load 4.8–6.9 on 2 CPUs and mostly measure waiting for a CPU.
- None of these numbers tests the SPEC §16 budget (1× tick < 10 ms at 6,000 agents on the nominated
  device); that is P3.12's measurement.
- The endpoint hashes are stateHash values and cover the manifest's contentHash and contentVersion. The
  Phase 3 preflight bumped contentVersion 1 → 2 (D-0036), so the same command on a Phase 3 build ends on
  a different stateHash even while the biology is unchanged. Compare biology across builds with the
  trajectory digest (tests/helpers/trajectory.ts; the fence in tests/fixtures/fence.json), never with
  these hashes.

## Phase 3 measurements

Wave 4 stage 2 (BUILD_DIRECTIVE P3.12, "Performance pass 1"). Measured 2026-10-10, 13:45–14:50 UTC.

### Verdict

| Criterion (P3.12 / SPEC §16) | Result on this machine | Status |
|---|---|---|
| 1× tick < 10 ms at 6,000 agents (2,000 fungal) | Tick-loop **CPU** per tick: p50 **18.8 ms**, p95 **23.9 ms**, p99 **42.6 ms** (wall: p50 20.0, p95 37.6, p99 58.0). Before this pass: CPU p50 38.5, p95 45.2, p99 62.5. | **Not met.** The pass halves the tick (2.05× at p50). Remaining gap at p95: about 14 ms of CPU. The limiting stage is sense/move (7.3 ms), then intake (4.8), environment/diffusion (2.7) and structures (2.7). See "Remaining gap". |
| No unbounded memory growth: heap slope over minutes 5–15 < 1 %/min | With no save inside the window (41-minute run): **0.97 %/min** over minutes 5–15 and **0.27 %/min** after minute 31. In the 15-minute run that saves and reloads at tick 3,000: 1.73 %/min (one +1.27 MB step at minute 6, right after the save measurement). | **Met only without a save in the window.** The 5–15 growth comes mostly from the per-second history, which by design fills a 30-minute window (CT §12.10). After minute 31, what remains is the genome table (see "Memory"). |
| Snapshot size and cost per part | Recorded below, per part, for 901 snapshots. | **Done.** |
| Renderer budget with aggregation at 6,000 sprites incl. fungal tiles and links | Recorded below. SwiftShader software WebGL, so these are lower bounds. | **Recorded.** 60 fps is an owner item on a GPU device. |
| Hash neutrality | The stress world's stateHash at ticks 0, 600, 1,500, 3,000 and 9,000 is identical before and after. The snapshot digests are identical too. The fence tests pass. | **Proven** (below). |

### Machine and load

- `lscpu`: AMD EPYC 7763 64-Core Processor, **2 vCPUs = 1 core × 2 SMT threads** (Microsoft
  hypervisor). Node v24.21.0, linux x64.
- Shared machine. During these runs the a11y builder's Playwright and the g3-evidence builder's runs used
  the same two threads. The two vCPUs are SMT siblings of one core, so a busy sibling also inflates
  **CPU time**, not only wall time. The 1-minute load average was recorded before and after every
  measurement:

| Measurement | Load before (1/5/15 min) | Load after |
|---|---|---|
| 15-min stress, after (current tree) | 2.83 / 4.41 / 4.99 | 2.82 / 3.65 / 4.57 |
| 15-min stress, before (HEAD sim) | 2.82 / 3.65 / 4.57 | 3.53 / 3.70 / 4.21 |
| 41-min heap run (current tree) | 3.21 / 3.71 / 4.13 | 3.83 / 4.55 / 4.60 |
| render bench (port 4262) | 5.03 / 4.28 / 4.30 | 6.20 / 5.12 / 4.62 |

The lead re-measures the final table on a quiet machine at the gate (W6-12). Use the same commands.

### Commands

```
# 15-minute stress, current tree (writes one JSON document)
node --expose-gc --import tsx tools/perf-stress.ts --ticks 9000 --out <file>.json
# the same on the HEAD simulation: a `git archive HEAD` copy with tools/perf-stress.ts added
(cd <head-copy> && node --expose-gc --import tsx tools/perf-stress.ts --ticks 9000 --out <file>.json)
# hash-neutrality probe (stress world stateHash at 0/600/1500/3000 + snapshot digests); --stress-only skips the fence entries
npx tsx tools/perf-stress.ts --hashes --stress-only
# long heap run: no snapshot measurement, no stage hooks, no save
node --expose-gc --import tsx tools/perf-stress.ts --ticks 24600 --snapshot-every 0 --no-stages --save-at -1 --hash-at 9000 --out <file>.json
# renderer bench, Phase 3 scene (own port; only that port is stopped)
E2E_PORT=4262 npx tsx tools/render-bench-run.ts
```

`tools/perf-stress.ts` builds the population in memory. It is not content, and nothing under
`content/` changes. The dish is a Water Garden variant (seed 6000). It has:
- 6,000 live agents, 2,000 of them fungal segments: 1,000 F01 on a gel pad with 990 visual links, and
  1,000 F02 on a sediment band with 989 transport links.
- Film builders: B02 and E10 Sprinters.
- X01 next to A01, and V01 dosed onto a dense B01 colony.
- B06/B07/B08 on starch/oil/protein patches, and an M09 breaker patch.
- 31 M10/M11 food objects (one ring position was refused).
- Walls, beads, gel and sediment.
- P01–P04, and E04/E07/E12 carriers.

Each mechanism first acts at these ticks: birth 121, death 3, capture 3, film 23, fungal transfer 0,
fungal cap refusal 300, infection 1, lysis 201, parasite attach 13, host drain 12, starch/oil/protein
conversion 2, object release 1, adhesion link 110, anchored 50, light seeker moved 1, acid release 1.

The dish stays at the agent cap the whole run: mean 5,993.6 agents, minimum 5,396, and
`capacityLimitedTicks` 8,827 of 9,000. The fungal count holds at 2,000 through minute 7, sits at
1,750–1,880 in minutes 8–14 and is 1,030 at minute 15. By minute 15 the mix has shifted: B01, B03,
B08, X01, Y01 and Y02 have no survivors, mostly through predation, lysis and starvation. Every
mechanism had acted by tick 300.

### Tick cost, before and after (6,000 agents, 9,000 ticks, 1×, headless `step()`)

The "before" run uses the committed simulation (HEAD `cbdddf3`). The "after" run uses this pass's
hot-path edits. The world, seed and command are the same in both.

| ms per tick | before: wall | before: CPU | after: wall | after: CPU |
|---|---|---|---|---|
| mean | 56.80 | 39.58 | 21.10 | 18.79 |
| p50 | 46.66 | 38.45 | 19.98 | **18.81** |
| p95 | 98.44 | 45.21 | 37.62 | **23.89** |
| p99 | 136.65 | 62.53 | 57.95 | **42.59** |
| max | 344.08 | 411.59 | 384.98 | 348.54 |
| loop total (s) | — | 365.9 | 196.5 | 174.9 |

Per-stage wall ms per tick (mean). Timed with `performance.now()` between stage hooks, so these
include waiting for a CPU:

| Stage | before | after | after: max |
|---|---|---|---|
| 1 commands | 0.003 | 0.002 | 1.9 |
| 2 environment (diffusion, gas, decays, film) | 3.625 | 2.725 | 57.2 |
| 3 conversion | 0.419 | 0.280 | 10.2 |
| 4 sense / move | 20.931 | **7.313** | 85.6 |
| 5 contacts | 3.801 | 1.025 | 56.2 |
| 6 intake | 12.855 | **4.814** | 100.5 |
| 7 maintenance | 5.153 | 1.185 | 36.7 |
| 8 structures (actions, links, transport, construction) | 5.348 | 2.666 | 36.4 |
| 9 births | 4.430 | 0.968 | 69.7 |
| 10 publish | 0.225 | 0.119 | 30.5 |

What changed: all hot-path edits are internal, with no float operation changed or reordered.

1. `src/sim/entities.ts` EntityStore and `src/sim/fields.ts` allocateFields build their column/field
   objects with one `Object.fromEntries`. Adding ~90 properties one keyed store at a time had pushed
   both objects into V8 dictionary mode, which made every `cols.x` and `fields.sugar` read in every
   stage a hash lookup. This is the largest single gain: it is why contacts, maintenance and births
   fell 3–5× without any change of their own.
2. `src/sim/movement.ts` decide:
   - The food arrays are resolved once per decision (prepareFoodScore / foodScoreAt) instead of once
     per window cell. The per-cell arithmetic is the same and in the same order.
   - Non-crossers get a blocked-cell window with 2-D prefix sums. A straight trace that stays inside a
     rectangle with no blocked cell returns exactly 1, so it is skipped. Every DDA step with t ≤ 1
     stays inside that rectangle, and the first step past the end returns 1.
   - suitabilityAt is told the habitat is compatible, because canOccupy is habitatCompatible.
   - traceFraction computes `Math.hypot` only on the paths that return early. It is 0 exactly when
     dx and dy are both ±0.
3. `src/sim/intake.ts` resolves the field arrays and the companion and carbon facts by FIELD_IDS
   index, once per stage, instead of once per request by name.
4. `src/sim/transport.ts` filmCoefficients marks 'film' inactive when every dish cell holds exactly 0.
   It stays correct because inactive fields are exactly zero, and every film writer marks the field
   again (construction.ts).
5. `src/sim/fungi.ts` fungalNetwork reads the link columns directly instead of building a new
   neighbour array per segment. This is inspector only.
6. `src/sim/founders.ts` memoizes creationFounders per world once the dish has left 0:00, keyed on
   `lineage.base`. It is derived and never saved. A reload is a new world object.
7. `src/worker/snapshot.ts`:
   - packEntities resolves the fungal link columns once per pack.
   - linkMaskOf returns 0 at once for organisms with no fungal link. That matches the old result:
     with no link the mask is 0 and the transfer bit needs mask ≠ 0.
   - packLinks has no per-organism array literals.

### Hash-neutrality proof

| Check | Before (HEAD sim) | After (this tree) |
|---|---|---|
| stress world stateHash, tick 0 | `3f7d911d9248adfc` | `3f7d911d9248adfc` |
| tick 600 | `c072e2c9e4167cea` | `c072e2c9e4167cea` |
| tick 1,500 | `7d122e1d11c2192b` | `7d122e1d11c2192b` |
| tick 3,000 | `095952d6d6af35cf` | `095952d6d6af35cf` |
| tick 9,000 (15-min endpoint) | `cbfe7805f738d85b` | `cbfe7805f738d85b` (also in the 41-min run) |
| snapshot digest, ticks 0 / 600 / 1,500 / 3,000 (sha256 over packed ents, ids, deposits, links, objects, both overlays, lineage marks, a fungal entity inspector, a cell inspector, evolution + creation founders) | `f1e9f78e…` / `31332f0e…` / `e4396326…` / `c1bfb16f…` | identical |
| ledger at 9,000 ticks | ok, rel. err C 5.2e-16, N 5.1e-14 | ok, identical values |
| save at tick 3,000, reload hash equal | true | true |

The fence on this tree (the recorded fence.json digests are the before values):
`npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/determinism.test.ts`
gave **6 files, 55 tests passed**. `tests/fixtures/conservation-all-pools`, `deterministic-state`,
`conservation-closed-lid` and `tests/perf/stress-shape` gave **4 files, 10 tests passed**. No fence
value moved, and the fence was not updated.

### Snapshot cost and size per part (after; 901 snapshots, one every 10 ticks, 6,000 agents)

Measured by calling what DishHost.sendSnapshot calls, outside the tick timing, with a selection, both
overlays and the lineage view all on (the worst case). Whole snapshot: mean **4.59 ms**, p50 3.84,
p95 9.30, p99 17.5 (before: mean 11.80, p50 8.47, p95 22.9).

| Part | p50 ms | p95 ms | bytes (mean) | sent | before: p50 / p95 ms |
|---|---|---|---|---|---|
| ents + ids (ENT_STRIDE 14 × f32 + ID_STRIDE 2 × u32) | 1.277 | 3.741 | 383,570 | every snapshot | 4.134 / 11.886 |
| deposits (DEPOSIT_BANDS 7 × 16,384) | 1.485 | 3.508 | 114,688 | every snapshot | 1.511 / 4.793 |
| links (E12 adhesion, LINK_STRIDE floats) | 0.078 | 0.105 | 243 (max 520) | 157 / 901 | 0.379 / 2.396 |
| objects (JSON) | 0.044 | 0.077 | 1,196 | every snapshot | 0.065 / 0.091 |
| overlay sugar (u8) | 0.047 | 0.099 | 65,536 | when an overlay is on | 0.051 / 0.087 |
| overlay foodAccess (u8) | 0.170 | 0.240 | 65,536 | when an overlay is on | 0.182 / 0.248 |
| visual events (JSON) | 0.057 | 0.162 | 2,714 (max 38,010) | every snapshot | 0.057 / 0.188 |
| lineage marks | 0.269 | 0.552 | 5,993 | lineage view on | 0.561 / 2.515 |
| geometry (substrate + structure + shade) | — | — | 98,304 | 1 / 901 (version change only) | — |
| inspector, F02 segment (network summary) | 0.222 | 0.372 | 1,831 | when selected | 0.792 / 3.331 |
| inspector, sediment cell | 0.035 | 0.061 | 935 | when selected | 0.038 / 0.072 |
| evolution state + creation founders | 0.010 | 0.024 | 544 | every snapshot | 0.017 / 1.503 |
| held sample | 0.002 | 0.005 | 4 | every snapshot | 0.002 / 0.005 |

At 10 snapshots/s a dense dish moves about 5–6 MB/s to the main thread (ents + ids + deposits ≈ 0.5 MB
each time). Transfer is by pooled ArrayBuffers, not copies.

### Save at 6,000 agents (tick 3,000)

`buildSaveFile` 427 ms, `loadSaveFile` 590 ms (before: 463 / 745 ms). Text 10,674,305 bytes (10.2 MiB,
within the 25 MB import limit). The reloaded world's stateHash equals the running world's.

### Memory

Heap after a forced GC (`--expose-gc`) at every simulated minute, from the 15-minute run (with snapshot
measurement and the save at tick 3,000):

| minute | agents | fungal | genomes | lineage records | heapUsed MB | RSS MB |
|---|---|---|---|---|---|---|
| 0 | 6000 | 2000 | 23 | 6000 | 18.85 | 122.65 |
| 1 | 6000 | 2000 | 136 | 9206 | 22.5 | 160.52 |
| 2 | 6000 | 2000 | 196 | 11228 | 23.6 | 186.93 |
| 3 | 6000 | 2000 | 264 | 11086 | 24.11 | 187.38 |
| 4 | 6000 | 2000 | 315 | 10378 | 24.37 | 187.38 |
| 5 | 6000 | 2000 | 387 | 11470 | 24.37 | 190.72 |
| 6 | 6000 | 2000 | 442 | 10586 | 25.64 | 350.26 |
| 7 | 6000 | 2000 | 500 | 11788 | 25.91 | 348 |
| 8 | 6000 | 1779 | 623 | 11190 | 26.5 | 348.5 |
| 9 | 6000 | 1753 | 714 | 10774 | 26.87 | 348.63 |
| 10 | 6000 | 1792 | 789 | 10348 | 27.22 | 348.75 |
| 11 | 6000 | 1832 | 865 | 11598 | 27.54 | 348.88 |
| 12 | 6000 | 1854 | 927 | 10708 | 27.92 | 349 |
| 13 | 6000 | 1865 | 993 | 11644 | 28.3 | 349.5 |
| 14 | 6000 | 1876 | 1076 | 10590 | 28.59 | 349.63 |
| 15 | 6000 | 1030 | 1353 | 11264 | 29.16 | 349.88 |

Slope over minutes 5–15: 0.422 MB/min = **1.73 %/min** of the minute-5 value. RSS jumps at minute 6
because the save at tick 3,000 builds and parses a 10 MB text, and RSS is not given back. The heap
also steps +1.27 MB there and keeps it (likely compiled save/load code; not proven).

41-minute run, without the save or the snapshot measurement (heapUsed MB per minute):
19.09, 22.46, 23.49, 23.93, 24.15, **24.53 (min 5)**, 24.89, 25.2, 25.75, 26.07, 26.39, 26.71, 27.09,
27.35, 27.63, **27.4 (min 15)**, 28.33, 28.78, 29.02, 29.29, 29.56, 29.78, 30.08, 30.31, 30.78, 30.99,
31.28, 31.44, 31.71, 31.92, 32.14, **32.12 (min 31)**, 32.2, 32.27, 32.15, 32.28, 32.32, 32.42, 32.65,
32.77, 32.82, 33.01 (min 41). Slope over minutes 5–15: 0.238 MB/min = **0.97 %/min**. Slope after
minute 31: 0.087 MB/min = **0.27 %/min**. Genomes went from 2,701 to 3,946 over that time. CPU per
tick over the run: p50 23.5, p95 27.2 (load 3.2–4.6).

What grows (sizes of world parts, measured at ticks 0/1,800/…/9,000 by walking the world object):
- `history` 1 → 4,025 KB. It holds 1 s samples for 30 minutes and 10 s trait samples for 30 minutes
  (CT §12.10; history.ts HISTORY_SECONDS, TRAIT_RECENT_SAMPLES), so it stops growing at minute 30.
- `genomes` 16 → 1,022 KB and `profiles` 0 → 764 KB. This is the genome table and its per-genome
  profile cache. It grows with every new genome (about 100 per minute in this dense dish), and nothing
  compacts it. src/sim/genome.ts says "compaction (P1.2) rebuilds it from referenced genomes", but no
  such compaction exists in src/. This is the remaining long-session growth (see proposals).
- Bounded: `lineage` (about 11k records, compacted), the event ring, `reactionCells` and `fungalFlow`.
  Those last two are fixed-size once allocated.

### Renderer (render bench, Phase 3 scene, SwiftShader)

`E2E_PORT=4262 npx tsx tools/render-bench-run.ts`: real DishRenderer and atlas, synthetic snapshots
at 10/s in protocol 2. The scene has 6,000 organisms, of which 2,000 are fungal segments drawn as
connection-mask tiles (a third of F02 flagged transferring), 300 E12 adhesion pairs sent as links,
Phase 3 cue bits, a film band and 32 food objects. GL is ANGLE/SwiftShader (software). The renderer
code in the tree includes the a11y builder's in-flight `src/render` edits.

| Viewport | Neighborhood zoom fps (frame p50 ms) | Whole dish fps | Aggregation at whole dish | rendererUpdate ms mean / p95 | Pixi render (CPU submit) ms mean / p95 | applySnapshot ms mean / p95 (GPU-free CPU phase) |
|---|---|---|---|---|---|---|
| 1440×900 @1 | 1.61 (633) | 1.79 | no: 7.26 px/cell, sprites at scale 1, per ARCH §9 / D-0016 | 4.57 / 13.0 (CPU phase 2.91 / 5.3) | 6.58 / 15.7 | 5.48 / 9.4 |
| 360×800 @1 | 4.85 (200) | 7.57 | **yes**: 4,637 cells painted, sprites hidden | 2.52 / 7.5 (CPU phase 1.96 / 4.6) | 4.19 / 9.1 | 4.65 / 8.1 |
| 360×800 @2 | 1.39 (750) | 2.21 | **yes**: 4,619 cells | 4.17 / 15.5 (CPU phase 1.91 / 4.8) | 6.81 / 20.9 | 5.13 / 10.8 |

Gates: `aggregationRule` true, `wholeDishAggregates` true and `reducedMotion` true on all three
viewports (reduced motion: 0 effects and 0 frames off `reducedMotionFrame`; the control run had 4–7
effects). `fps60AtNeighborhood` is false, as at G1: an empty page reaches 60 fps here, and software
rasterization is the limit. On one shared core the renderer's own JS costs about 2–5 ms per frame plus
about 5 ms per snapshot. Compare G1's Phase 1 scene: about 0.5 ms per frame and 1.3 ms per snapshot
(render-perf-g1.md). `--phase1` replays that scene for a like-for-like comparison.

### Remaining gap and what limits it

At p95 the tick is 23.9 ms CPU against a 10 ms target. A busy SMT sibling inflates that number, so on
a quiet machine expect it lower, but the stage shares say a 2× gap remains, not noise:
- **Sense/move (39 %).** decide runs every DECISION_INTERVAL_TICKS for each motile organism over its
  sensing window. The costs are suitabilityAt per window cell and the food reads (random access into
  ~12k-cell fields), then rebuildIndex twice per tick.
- **Intake (26 %).** Per-request random access into the cell pools: request, demand, allocate, commit.
  A CPU profile puts the time on the `f[cell]` reads and the per-cell demand accumulators (cache
  misses), not on arithmetic.
- **Environment (14 %).** 15 fields diffuse every tick, and in a dense dish every one of them is
  non-zero across the dish within minutes. Even the enzymes cover 7.5k–9.8k of the ~11.3k dish cells
  by tick 3,000, so skipping zero rows saves under 10 %.
- **Structures (14 %).** Actions, adhesion link forming/release, fungal transport and construction.

Every remaining large gain changes results or the order of float accumulation, so this pass did not make
them (see proposals).

### Proposals (not made: each would change results or is outside this pass's files)

1. **Genome-table compaction.** genome.ts promises it ("P1.2"), but it was never implemented. It would
   rebuild `world.genomes` from the genomes that live organisms, retained lineage records and pinned
   branches still reference, at a recorded tick boundary. Genome ids are in saved state and in the
   hash, so this needs a DECISIONS entry and a rules-version decision by the owner. As a hash-neutral
   first step, the derived per-genome `profiles` cache could drop entries for genomes with no living
   carrier. It is neither saved nor hashed (world.ts:110; serialize.ts never writes it), and profileOf
   rebuilds an entry on demand.
2. **Diffusion work.** A per-field zero-row skip is exact but saves < 10 % in a dense dish. The real
   gains change results, which needs an owner-approved evolutionRulesVersion bump:
   - A per-cell cutoff that zeroes values below about 1e-12 and books them to the ledger as roundoff.
   - Diffusing enzymes and inhibitors every second tick at twice the coefficient.
3. **Entity-order locality.** Sorting the intake and decide passes by cell would turn random cell
   access into streaming. The order of `+=` into shared cell accumulators would change, so the results
   would too.
4. **Snapshot (src/worker/host.ts, not this pass's file).**
   - Send `ids` only when the population changed.
   - Send `deposits` only for bands whose content changed. Both are hash-neutral host changes.
   - Ents dominate at 384 KB per snapshot. Under load, SPEC §16 already allows lowering the snapshot
     frequency first.
5. **Renderer (src/render, not this pass's files).** The renderer's per-frame JS is 2–5 ms with fungal
   tiles and links, against about 0.5 ms for the Phase 1 scene. Profile `renderer.ts` on a GPU device
   before optimizing, because SwiftShader hides the real split.

### Owner items (W6-11)

- The renderer numbers above are **SwiftShader lower bounds**. The 60 fps desktop / 30 fps midrange
  Android check at 6,000 agents needs a GPU or device measurement (WORKLOG P1.5, EXPANSION_RESPONSE §7).
- The **15-minute Android stress session** (D02 §25: thermal and memory on the nominated midrange
  device) is an owner item.
- **D-0017's device check** of sheet/canvas compositing is an owner item.
- Re-measure the tick table on a quiet machine, or on the nominated device in a WebView worker
  (W6-12), with the commands above.
