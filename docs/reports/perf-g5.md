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
