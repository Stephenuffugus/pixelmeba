# Phase 5 performance notes (g5)

Running notes on the tick cost of Phase 5 systems as each wave lands (ARCH §13: measure, don't guess). Every
number here is **indicative**: a headless probe on the shared 2-vCPU codespace, run through the test registries
(nothing in Phase 5 is enabled yet, D-0104). The systems flip (after wave 11) measures again on the
SPEC §16 workloads (6,000 agents, the web build) before anything is enabled.

## Wave 9: climate stage 2 and movement through edge barriers (2026-10-13)

Measured by the lead (finished 22:15 UTC), after wave 9's integration edits, with nothing else running (1-minute
load 0.84 before, 1.28 after). Each probe ran twice; both runs are shown. The probes are scratch scripts
(`tmp/climate-perf/perf.ts`, `tmp/barrier-perf/perf.ts`; `npx tsx <file>`, not committed), each timing 2,000
ticks of `step()` with `afterStage` hooks for the stage split.

### Climate (stage 2)

400 founders (B01 and A01 alternating, a 20 × 20 grid 3 cells apart) on clear water with background sugar
0.05. (a) the shipped registry; (b) a registry that records 'climate' with the light cycle on, drying on, two
heaters On and four shade roofs. Probe (b) has no S10 cooler, no S12 wick and no CANOPY organism, and on clear
water the drying pass changes no cell (water stays 1).

| Run | Alive at end | Tick mean / p95 (ms) | Stage 2 mean / p95 (ms) | Stage 2 share |
|---|---|---|---|---|
| (a) shipped, run 1 | 3,672 | 3.533 / 6.967 | 0.690 / 0.996 | 19.5 % |
| (b) cycle, drying, heaters, roofs, run 1 | 2,564 | 3.297 / 5.998 | 0.936 / 1.372 | 28.4 % |
| (a) shipped, run 2 | 3,672 | 3.622 / 6.907 | 0.808 / 1.189 | 22.3 % |
| (b) cycle, drying, heaters, roofs, run 2 | 2,564 | 3.345 / 6.379 | 0.911 / 1.343 | 27.2 % |

- Stage 2 costs about **+0.1 to +0.25 ms per tick** with the cycle, two heaters, four roofs and drying on: light
  over every dish cell each tick (the cycle), warmth relax + diffusion + clamp, and the drying pass over the dish.
  A cooler, a wick and a CANOPY organism were not measured.
- The whole-tick means are not comparable between (a) and (b): (b) ends with fewer organisms and cheaper organism
  stages, most likely because over these 2,000 ticks the cycle's dusk and night give about half the light (0.55
  of day light on average; computed from cycleFactor, not measured).
- Without the cycle, a recorded CANOPY species or a recorded S11, light stays on the v1.0 fast path (recomputed
  only when the geometry moves); a world that does not record 'climate' runs `climateStep`'s single check and
  nothing else.
- The builder's earlier run, under contention from the other wave 9 builder, measured stage 2 at 1.204 ms
  (shipped) and 1.594 ms (every rule).

### Edge barriers and furnishings (stage 4)

About 400 founders (B01, with a P01 every tenth) on a 3-cell grid with sugar 0.3 everywhere, `barrierDish` (a
registry recording 'barriers', 'climate' and 'devices'). (a) no edges and no devices; (b) 512 edge barriers
(vertical S01 lines at x 63, 40, 86 and 30 in full and the first 72 edges of one at x 96, with an S02 on every
fourth row) and 256 devices (S05 shelters and S06 meshes alternating). Each process runs a, b, a, b.

| Run | Organisms at end | Tick mean / p95 (ms) | Stage 4 mean (ms) | Stage 4 share |
|---|---|---|---|---|
| (a) none, run 1 | 531 | 2.323 / 4.482 | 0.869 | 37.4 % |
| (b) 512 edges + 256 devices, run 1 | 536 | 2.434 / 3.976 | 1.187 | 48.7 % |
| (a) again | 531 | 1.991 / 3.245 | 0.784 | 39.4 % |
| (b) again | 536 | 2.362 / 3.818 | 1.154 | 48.8 % |
| (a) none, run 2 | 531 | 2.310 / 4.339 | 0.860 | 37.2 % |
| (b) 512 edges + 256 devices, run 2 | 536 | 2.842 / 5.508 | 1.399 | 49.2 % |
| (a) again | 531 | 2.058 / 3.336 | 0.812 | 39.5 % |
| (b) again | 536 | 2.414 / 4.045 | 1.183 | 49.0 % |

- Stage 4 (sense and move) costs about **+0.3 to +0.55 ms per tick** at about 530 organisms with the maximum
  edge store and the maximum device store. The added work is per mover: class lookups once per organism per
  stage, the window marks of `decide`, and edge checks on every crossed edge of a trace. So it is expected to
  grow with the number of movers (not measured here); the systems flip measures it at 6,000 agents.
- With no edges and no devices no extra work runs (the gates are a length check), and the fence passes
  unchanged.
- The builder's earlier run, under contention, measured stage 4 at 0.92–1.53 ms (none) and 1.98–2.55 ms
  (structures).

Nothing was optimised in wave 9; nothing here is a regression on any shipped dish.

## Wave 10: barrier transport, the channel, resin and gate tallies; shells and grit (2026-10-14)

### Edge barriers, channels and resins (stage 2)

Measured by the lead (06:33 UTC) after wave 10's integration edits, with nothing else running (1-minute load 0.75
before, 1.70 after). The probe is barrier-transport's scratch script (`tmp/barrier-transport-perf/perf.ts`;
`npx tsx <file>`, not committed): 2,000 ticks of `step()` with an `afterStage` hook for the stage 2 split, on
`barrierDish` (a registry recording 'barriers', 'climate' and 'devices') with 400 B01 founders (about 350 alive at
the end), uniform sugar 0.2 and inhBact 0.05 on every seventh cell. (a) no edges and no devices; (b) 512 edges (an
S01 line at x 40, an S02 line at x 60, alternating open and closed shutters at x 80, eight S04 channels at x 100
with alternating flow, and S02 D edges on rows 20, 100, 50 and 76 up to the cap) plus eight S08 resins selecting
inhBact. Each process runs a, b, a, b; the probe ran twice.

| Run | Organisms at end | Tick mean / p95 (ms) | Stage 2 mean (ms) | Stage 2 share | Gate tallies |
|---|---|---|---|---|---|
| (a) none, run 1 | 350 | 2.747 / 5.082 | 0.975 | 35.5 % | 0 |
| (b) 512 edges + 8 resins, run 1 | 346 | 3.366 / 5.248 | 1.370 | 40.7 % | 455 |
| (a) again | 350 | 2.484 / 4.149 | 0.899 | 36.2 % | 0 |
| (b) again | 346 | 3.275 / 5.322 | 1.313 | 40.1 % | 455 |
| (a) none, run 2 | 350 | 2.660 / 4.491 | 0.956 | 35.9 % | 0 |
| (b) 512 edges + 8 resins, run 2 | 346 | 3.435 / 5.759 | 1.387 | 40.4 % | 455 |
| (a) again | 350 | 2.470 / 4.044 | 0.894 | 36.2 % | 0 |
| (b) again | 346 | 3.333 / 5.224 | 1.374 | 41.2 % | 455 |

- Stage 2 costs about **+0.4 to +0.45 ms per tick** with the maximum edge store, eight channels and eight resins.
  Most of it is the field tallies: about 455 gate edges × each active diffusing field, each with a lookup into
  `gateTally`. If it ever matters, caching each gate edge's tally record index on the gate edge list would cut it.
- The whole tick costs about +0.6 to +0.85 ms; the rest is wave 9's stage 4 edge checks and the organism-crossing
  scan around stage 4.
- The builder's run under contention measured stage 2 at 1.42–1.48 ms (none) and 2.00–2.21 ms (structures).
- With no edges and no devices no extra work runs (the gates are a length check), and the fence passes unchanged.

### The grit scan (stage 3) and shells (stage 6)

The builder's probe (`tmp/e2-shells-perf/perf.ts`, under contention, not repeated by the lead): 2,000 ticks with
100 A02, 50 P05 and 150 B01 and grit 0.5 in every cell, against a shipped twin with 100 A01, 50 P01 and 150 B01
(both end at about 1,700 to 1,800 alive).

| Run | Dish | Tick mean / p95 (ms) | Stage 3 (ms) | Stage 6 (ms) |
|---|---|---|---|---|
| 1 | shipped | 4.356 / 9.98 | 0.016 | 0.676 |
| 1 | silicate | 3.790 / 7.64 | 0.072 | 0.539 |
| 2 (heavier load) | shipped | 8.342 / 20.3 | 0.025 | 1.514 |
| 2 (heavier load) | silicate | 8.343 / 18.1 | 0.196 | 1.420 |

- The grit scan adds about **0.06 to 0.17 ms per tick** in a world that records silicate (it scans every cell
  while the grit and silicate fields exist; D-0117). Stage 6's shell work is lost in the noise.

### Closed-lid residuals of the new conservation tests

All pass relErr < 1e-5 for C, N and mineral; measured worst values where the test prints them:

| Test | Run | Worst relative error | Worst absolute |
|---|---|---|---|
| conservation-mineral (shells, grit, silicate) | 10,000 ticks, 486 shell builders lost | C 1.9e-14, N 6.3e-14, M 8.0e-15 | C 1.5e-10, N 7.2e-11, M 9.5e-13 |
| phage-v02 (V01 and V02 lysis) | 10,000 ticks, 31 B01 and 12 B02 lyses | C 1.110e-14, N 6.463e-14 | — |
| resters-determinism (B12, F04 daughters, P08) | 10,000 ticks | C 6.052e-15, N 6.695e-14 | C 3.638e-11, N 7.617e-11 |
| barrier-transport-determinism (barriers, channels, resin) | 10,000 ticks | < 1e-5 (asserted) | < 1e-8 (asserted) |
| channel (three channels) | 2,000 ticks | < 1e-5 at every 500-tick check | — |
| structure-determinism (all 12 kinds by command, a heater on, a resin selected) | 20 × 500 ticks | < 1e-5 in every chunk | — |

The resin binds activity, which is not a conserved material, so it has no ledger line; the channel moves material
between cells only. Nothing was optimised in wave 10; nothing here is a regression on any shipped dish. The systems
flip measures again on the SPEC §16 workloads.

## Wave 11: snapshot packing (protocol 3), region probes and the stage 8 signal pass (2026-10-14)

All three were measured on the contended 2-core codespace (builders in parallel, or the lead's `npm run check`
running), so every figure is an upper bound; nothing here is a regression on a shipped dish, whose stage 8 gains
two manifest checks and three always-false `applies` closures per Active organism.

### Snapshot packing (structure-render-worker's probe)

One pack = packEntities + packDeposits + packGeometry + packResins + packEnvironment + one cell inspector, 300 packs
after 30 warm-up packs (`tmp/structure-render-worker/perf.ts`, not committed). The host rebuilds the geometry only
when `geometryVersion` moves, so a real snapshot costs less than this.

| Dish | Mean (ms) | p95 (ms) |
|---|---|---|
| v1.0 FIRST_DISH_V1 t200 (56 organisms) | 2.58 | 7.76 |
| the same, second run | 1.98 | 5.05 |
| 400 organisms, 512 edges, 256 devices, 8 resins | 2.84 | 9.28 |

An earlier, less contended run gave 1.44–1.69 ms for v1.0 and 1.38 ms for the Phase 5 dish (then 266 organisms).

### Region probes with gates and organism crossings (region-charts-gates' probe)

Six regions (one of them the whole dish), 500 Sprinters (527 alive at the end), 1,000 measured ticks after 200
warm-up (`tmp/region-charts-gates/perf.test.ts`, not committed):

- organism crossings, the stage 4 pass and the after-tick pass together: mean 0.245 ms, p95 0.572 ms per tick
  (the after-tick pass alone 0.117 / 0.173);
- the stage 1 + 2 boundary sums (P4.8 code, now 10 pools): mean 1.65 ms, p95 6.0 ms per tick, dominated by the
  whole-dish region; the two new pools add about a quarter. Only while regions exist. If it matters: sum only the
  active fields (`derived.fieldActive`), since an inactive field is exactly zero.

### The stage 8 signal pass (lead)

`tmp/lead/perf-w11.ts` (`npx tsx`, not committed), run while `npm run check` was running: 400 ticks after 100
warm-up; stage 8 (stageStructures) timed from the end of stage 7 to the end of stage 8. With signals: 30 B09, 10
B01 carrying E02 and 10 B13 on gel with 10 B01 targets beside them, sGlow 0.4 over the B09 patch, a registry
recording 'signals' and 'rivalry'. Without: the same positions with B01, plain B01 and B02 under the shipped
registry (60 alive in both).

| Run | Stage 8 without signals, mean / p95 (ms) | With 30 B09, 10 E02, 10 B13, mean / p95 (ms) |
|---|---|---|
| 1 | 0.056 / 0.065 | 0.139 / 0.120 |
| 2 | 0.044 / 0.050 | 0.064 / 0.062 |

- The stage-start senses, the glow thresholds and both emissions cost about **+0.02 to +0.08 ms per tick** for 50
  emitters (the senses scan every living slot once while the world records 'signals' or 'rivalry').


## Systems flip (D-0121) (2026-10-14)

Measured by the systems-flip builder with no test run going (1-minute load 2.4 after the runs, the probe's own), after the flip's manifest edit: a NEW dish under the
shipped (post-flip) registry, which records 'barriers', 'climate' and 'devices' and S01–S12. The probe is
`tmp/flip/perf.ts` (`npx tsx`, not committed; adapted from wave 10's `tmp/barrier-transport-perf/perf.ts`): clear water
(`clearWater` under `registry()`), uniform sugar 0.2 and inhBact 0.05 on every seventh cell, B01 founders, `step()`
timed per tick. (a) no edges and no devices, fixed light, drying off (climate arrays stay null); (b) the maximum stores:
512 edges (an S01 line at x 40, an S02 line at x 60, alternating open and closed S03 shutters at x 80, eight S04
channels at x 100 with alternating flow, and S02 D edges on rows 20, 100, 50 and 76 up to the cap) and 256 devices
(S05–S12 in turn on a 5 × 6 cell grid, heaters and coolers on, resins selecting inhBact), with the light cycle and
drying on. Each process runs a, b, a, b.

| Run | Agents placed / alive at end | Ticks | Tick mean / p95 / max (ms) |
|---|---|---|---|
| (a) none | 400 / 350 | 2,000 | 2.455 / 4.061 / 78.1 (first-run warm-up) |
| (b) 512 edges + 256 devices, cycle, drying | 400 / 343 | 2,000 | 3.360 / 5.567 / 42.9 |
| (a) again | 400 / 350 | 2,000 | 2.281 / 3.873 / 8.9 |
| (b) again | 400 / 343 | 2,000 | 3.260 / 5.413 / 14.5 |
| (a) none | 6,000 / 5,822 | 600 | 12.167 / 20.675 / 132.8 (first-run warm-up) |
| (b) 512 edges + 256 devices, cycle, drying | 6,000 / 5,825 | 600 | 14.359 / 22.823 / 104.6 |
| (a) again | 6,000 / 5,822 | 600 | 10.689 / 16.494 / 24.1 |
| (b) again | 6,000 / 5,825 | 600 | 13.955 / 21.999 / 37.4 |

- **Tick p95 with 512 edges and 256 devices: about 5.4–5.6 ms at ~350 organisms and about 22–23 ms at ~5,800
  organisms** (the 6,000-agent check wave 9 deferred to the flip), against 3.9–4.1 ms and 16.5–20.7 ms without
  structures. The structures, the light cycle and drying add about +0.9–1.0 ms per tick at ~350 organisms and about
  +2.2–3.3 ms at ~5,800 (the per-mover edge checks of wave 9 grow with the movers, as expected).
- At 1× (one 0.10 s tick per 100 ms) the worst p95 above uses about 23 % of the budget. At 4× (25 ms per tick) the
  ~350-organism dish uses about 22 % and the ~5,800-organism dish with the maximum stores about 90 % of the budget at
  p95 on this 2-vCPU codespace (Node, not a device); a full dish at 4× was already near its budget without
  structures (66–83 %). Nothing was optimised for the flip, and no tick was skipped or timestep changed.
- A new dish with no structures records the systems but allocates nothing (climate arrays null, stores empty): its
  cost is the v1.0 cost, and the fence passes unchanged.

## Wave 12: A04 modes and Phase 5 predation (2026-10-14)

Indicative, from the builders' probes on the shared 2-vCPU codespace while other agents and a fence run were using it
(so the numbers are inflated). The lead's quiet-machine run is still to do and is recorded here when it runs.

### Stage 4 with mixotrophs (e2-light-algae, tmp/e2-light-algae/timing.ts)

300 placed, mean and p95 over 300 ticks; half the dish lit 0.2 and half 0.6, sugar 0.5.

| Dish | Stage 4 mean | Stage 4 p95 | Stage 6 mean | Stage 6 p95 |
|---|---|---|---|---|
| A01 ×300, run 1 | 0.097 ms | 0.096 ms | 0.237 ms | 1.048 ms |
| A01 ×300, run 2 | 0.093 ms | 0.097 ms | 0.134 ms | 0.165 ms |
| A04 ×300 (423 alive), run 1 | 0.712 ms | 2.494 ms | 0.323 ms | 1.356 ms |
| A04 ×300 (423 alive), run 2 | 0.539 ms | 0.712 ms | 0.176 ms | 0.197 ms |

A04's stage 4 cost is mostly its ordinary swimming decisions (A01 is stationary); the mode update itself is one
comparison per organism.

### Stage 5 with radius capture and handling (e3-predation, tmp/e3-predation/stage5-timing.ts)

Stage 5 alone (after stage 4 to after stage 5), 20 warm-up ticks, then 300 ticks.

| Dish | Mean | p95 | Activity in 300 ticks |
|---|---|---|---|
| 60 P06 among 400 B01 | 0.258 ms | 2.10 ms | 54 captures |
| 20 P10 among 80 prey (P01, P02, P05, P07) and 200 B01 | 0.195 ms | 0.331 ms | 204 captures, 104 starts, 74 breaks |
| v1.0 predator dish: 60 P01/P02 among 400 B01 (shipped registry) | 0.204 ms | 1.12 ms | 177 captures |

A world without HANDLING or RADIUS_CAPTURE runs the v1.0 claim loop (the tables are null): no new column read and no
added float operation in stage 5.

## Wave 13: traps, the mineral jacket, Phase 5 marks and the Phase 5 relationship matrix (2026-10-15)

Indicative only: the builders' scratch probes on the shared 2-vCPU codespace, with load averages of about 3.6–10 from
other agents, fence runs and Playwright, so noise dominates and p95 values are inflated. **The lead's quiet-machine run
is still owed** and is recorded here when it runs (LEAD AFTER WAVE 13 item 4). Nothing is enabled; a world without F03
or E11 reads no trap or jacket column in any stage, so v1.0 dishes take the old paths (the fence is unchanged).

### Stages 5, 6 and 8 with traps (e3-traps, tmp/e3-traps/perf.test.ts)

300 ticks, mean / p95 in ms, two runs each.

| Dish | Stage 5 | Stage 6 | Stage 8 |
|---|---|---|---|
| Without F03 (40 P04, ~190 alive), run 1 | 0.37 / 2.12 | 0.43 / 2.36 | 0.42 / 2.21 |
| Without F03, run 2 | 0.17 / 0.40 | 0.22 / 0.31 | 0.32 / 1.46 |
| 40 F03 holding P04 (277 alive), run 1 | 0.31 / 1.24 | 0.48 / 2.29 | 0.39 / 1.24 |
| 40 F03 holding P04, run 2 | 0.37 / 1.80 | 0.39 / 2.22 | 0.43 / 2.03 |

No trap cost is measurable above the noise.

### Stages 4 and 8 with E11 carriers (e3-jacket, tmp/e3-jacket/timing.ts)

300 ticks after a 30-tick warm-up, 100 P01 on silicate 0.5 (load average 7–10 on 2 CPUs). The carriers reach their
0.4 target at tick 200 of their life, so they request for about 170 of the 300 measured ticks.

| Run | Stage 4 mean / p95 | Stage 8 mean / p95 |
|---|---|---|
| Plain P01, rep 0 | 1090 µs / 5754 µs | 255 µs / 1739 µs |
| Plain P01, rep 1 | 728 µs / 3833 µs | 153 µs / 83 µs |
| 100 E11 carriers, rep 0 | 941 µs / 4385 µs | 415 µs / 2359 µs |
| 100 E11 carriers, rep 1 | 1115 µs / 5388 µs | 328 µs / 2273 µs |

Stage 4's speed factor is one multiplication per carrier and is lost in the noise; stage 8 gains roughly 0.1–0.2 ms
mean for 100 carriers building (the shared mineral pass), within the noise of this machine.

### Snapshot pack with Phase 5 marks (org-ui)

Not measured by the builder: org-ui's report gives no timing for the snapshot pack on 2,000 organisms with Phase 5
marks. What it proves instead: the E_CUE3 additions are computed in the existing `cue3Of` pass (no stride or band
change), and a v1.0 dish packs E_CUE3 0 for every organism. The pack timing is part of the lead's quiet-machine run.

### The relationship matrix (relmatrix)

| Run | Rows | Wall time |
|---|---|---|
| Shipped registry, CLI | 711 | 6.8–12.1 s |
| Phase 5 registry, CLI | 2265 | 30.4–38.4 s |
| Shipped registry, inside vitest (load ≈ 7) | 711 | 51 s |
| Phase 5 registry, inside vitest (load ≈ 7) | 2265 | 179–184 s |

The Phase 5 matrix test asserts a 300 s ceiling (a runaway check, not a budget).

## Organism flip (D-0127) (2026-10-15)

Measured by the organism-flip builder on the shared 2-vCPU codespace while other agents' end-to-end runs were going
(1-minute load 7–8 throughout, so wall times carry about 1.8× of CPU waiting; process CPU is given beside them).
Probes `tmp/flip/perf-firstdish.ts` and `tmp/flip/perf-dense.ts` (`npx tsx`, not committed).

### FIRST_DISH_V1 before and after (item 5: five more zero fields)

A new dish under the shipped registry now allocates sGlow, quencher, rival, silicate and grit (31 → 36 fields), all zero
in this recipe; stage 2 diffuses and decays the three activity fields every tick. Seed 104729, 6,000 ticks, runs
interleaved pre, post, pre, post in one process (pre = HEAD ed0bf52's manifest lists, registry version 2):

| Run | Alive at 6,000 | Tick mean / p50 / p95 / max (ms) | Stage 2 mean / p95 (ms) |
|---|---|---|---|
| pre-flip | 716 | 4.51 / 4.01 / 9.59 / 67.8 (warm-up) | 2.34 / 5.54 |
| post-flip | 716 | 4.17 / 3.46 / 8.69 / 62.5 | 2.12 / 5.18 |
| pre-flip again | 716 | 3.97 / 3.38 / 8.52 / 33.3 | 2.09 / 5.07 |
| post-flip again | 716 | 4.43 / 4.03 / 9.01 / 30.2 | 2.24 / 5.16 |

The difference is inside the run-to-run noise at this load. (`sim:run --perf` on the same seed before the edit: p50
3.73 / 3.84 ms, p95 8.90 / 9.26 ms.)

### A dense mixed Phase 5 scene (item 8)

Shipped registry, closed lid: 1,980 organisms placed on their own ground (gel block, sediment band, a stone row):
20 F03 each with a P04 in its cell (all 20 holding within a few ticks), 20 P10 each touching a hungry-range P01
(up to 15 attempts open at once), 60 P06 on the stone row's edges, four B09 clusters of 50 in signal 0.5 (57 glowing at
the peak), 20 each of P01, P02 and P07 carrying E11 in silicate 0.3 (207 jacketed at the end, daughters included),
100 each of A02, A03 and A04, 40 A05 (canopy), B10, B11, B12, B13, F02, F04, X02, P05, P08, P09, a V02 dose on B02,
and v1.0 fill (300 B01, 200 A01, 100 B04, 50 Y01); the light cycle on; 512 S01/S02 edges. 1,200 ticks; the snapshot
parts DishHost sends (entities, deposits, links, objects, a sugar overlay, events, lineage marks, a P10 inspector)
every 10 ticks outside the tick timing. FIRST_DISH_V1 under the pre-flip registry is the v1.0 reference.

| Run | Alive start / end | Tick wall p50 / p95 / max (ms) | Process CPU p50 / p95 (ms) | Snapshot p50 / p95 (ms), size |
|---|---|---|---|---|
| v1.0 FIRST_DISH_V1 | 56 / 172 | 1.99 / 8.16 / 89.6 | 1.68 / 4.94 | 1.07 / 5.96, 204 KiB |
| dense Phase 5 | 1,980 / 3,162 | 25.90 / 53.50 / 196.3 | 14.60 / 28.69 | 4.45 / 14.57, 412 KiB |
| v1.0 FIRST_DISH_V1 again | 56 / 172 | 1.73 / 6.59 / 21.8 | 1.57 / 2.44 | 1.02 / 3.11, 204 KiB |
| dense Phase 5 again | 1,980 / 3,162 | 23.26 / 45.93 / 83.5 | 13.14 / 16.83 | 3.86 / 7.56, 412 KiB |

Per-stage wall time per tick in the dense scene: stage 4 (sense and move, with 512 edges and ~3,000 movers) 9.3–10.3 ms,
stage 2 (fields, the cycle and canopy light) 5.8–6.5 ms, stage 6 3.4–4.1 ms, stage 8 2.8–3.3 ms, stage 5 1.4–1.5 ms,
stage 7 1.0–1.4 ms, stage 9 0.8–0.9 ms. An earlier run of the same scene (P10 not yet hungry) gave wall p50 25.6–28.7,
p95 52.2–55.3 ms.

- At 1× (100 ms per tick) the dense scene uses about a quarter of the budget at p50 even with the CPU contention; at 4×
  (25 ms) its process-CPU p50 (13–15 ms) fits and its p95 (17–29 ms) is near the budget, as the systems flip's
  5,800-organism dish with the maximum stores was (D-0121). Nothing was reduced and no tick skipped; the next measure is
  on a device (P5.8), where stage 4's per-mover edge checks are the first candidate.

## Wave 14: habitats H04–H11 (2026-10-15)

Indicative: `tmp/lead/perf-w14.ts` (`npx tsx`, not committed) under the habitat test registry (`habitatRegistry()`:
H04–H11 enabled), seed 104729, on the shared 2-vCPU codespace with no test run going (load 0.5 before, 0.7 after).

**Realize time** (the New Dish preview realizes a dish per preview): median of 5 after one warm-up, in ms; Empty /
Suggested Community, with the organisms alive at tick 0 of the Suggested start. FIRST_DISH_V1 for reference: 15.3.

| Habitat | Empty | Suggested | Alive (Suggested) |
|---|---|---|---|
| H04 Leaf Pool | 17.1 | 27.4 | 25 |
| H05 Brine Mosaic | 14.1 | 19.8 | 10 |
| H06 Dusk Marsh | 17.2 | 13.0 | 20 |
| H07 Glass Garden | 12.5 | 17.5 | 20 |
| H08 Night Lanterns | 13.0 | 9.7 | 15 |
| H09 Drying Lace | 10.6 | 15.8 | 10 |
| H10 Gate Lab | 14.3 | 20.6 | 10 |
| H11 Grazing Meadow | 6.9 | 10.6 | 20 |

**Tick cost** over 600 ticks (`step()` wall time, ms), interleaved twice in one process (first round / second round):

| Dish | Devices | Alive at 600 | p50 | p95 | mean |
|---|---|---|---|---|---|
| FIRST_DISH_V1 | 0 | 83 | 1.92 / 1.32 | 6.05 / 1.91 | 2.40 / 1.29 |
| H04 Suggested | 199 | 23 | 1.19 / 0.81 | 1.96 / 1.41 | 1.38 / 0.94 |
| H09 Suggested | 198 | 10 | 0.81 / 0.67 | 1.46 / 1.23 | 0.99 / 0.80 |
| H11 Suggested | 88 | 15 | 0.78 / 0.68 | 2.21 / 1.17 | 1.12 / 0.77 |

The furnishings cost little per tick at these counts; the Suggested dishes are cheaper than the First Dish because they
hold fewer organisms. A New Dish preview stays under 30 ms. Nothing was reduced; P5.8 measures on a device.
