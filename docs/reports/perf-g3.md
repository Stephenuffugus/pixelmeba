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

Wave 6 (P3.12).
