# P3.12 Performance pass 1: perf builder report (wave 4 stage 2, resumed run)

**Result:** the inherited hot-path edits are hash-neutral, and they halve the 1× tick at 6,000 agents.
Two targets are still not met on this loaded 2-vCPU machine:
- Tick time: CPU p95 is 23.9 ms against a 10 ms target.
- Heap slope: it is under 1 %/min over minutes 5–15 only when no save happens inside that window.

The full write-up is in `docs/reports/perf-g3.md`. Nothing is committed: the lead commits.

## Audit of the inherited work, then completion

I resumed from the previous builder's uncommitted tree and kept all of it. My first step, before
changing anything, was the fence on the inherited tree:
`npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/determinism.test.ts`
gave **Test Files 6 passed (6), Tests 55 passed (55)**. I also reviewed each sim edit line by line for
float-order changes and found none (details in perf-g3.md, "What changed").

## Checklist

### Build

- **DONE: stress builder.**
  - Where: `tools/perf-stress.ts:115` (stressRecipe) and `:304` (buildStressWorld).
  - What it builds: 6,000 agents (= AGENT_CAP) with 2,000 fungal segments (= FUNGAL_CAP). F01 has 990
    visual links and F02 has 989 transport links.
  - Also in the dish: B02 + E10 film builders, X01 on A01, V01 dosed on a B01 colony, B06/B07/B08 on
    deposits, an M09 breaker, 31 M10/M11 objects, walls/beads/gel/sediment, P01–P04, and E04/E07/E12
    carriers.
  - Proved by `tests/perf/stress-shape.test.ts` (passes; 24.1 s at load ~5).
- **DONE: 15-minute run at 1× headless.**
  - Where: `tools/perf-stress.ts:700` main.
  - It records tick p50/p95/p99/max (wall and process CPU), the per-stage breakdown (`:881`), heap
    after GC every simulated minute (`:666`), save build/parse (`:610`), and per-part snapshot cost and
    bytes (`:544`) from the same functions DishHost.sendSnapshot calls.
  - I added a post-minute-31 heap slope at `:907`.
  - Ran: `node --expose-gc --import tsx tools/perf-stress.ts --ticks 9000 --out …` on the current tree
    and on a `git archive HEAD` copy (the before numbers).
- **DONE: renderer budget with aggregation at 6,000 sprites, including fungal tiles and links.**
  - The Phase 3 scene is in `tools/render-bench.ts:89,91,726`. `--phase1` replays G1.
  - W6-14: `tools/render-bench-run.ts:23` reads `E2E_PORT` (default 4176) and stops only that port.
  - Ran: `E2E_PORT=4262 npx tsx tools/render-bench-run.ts` → EXIT 0. On all three viewports the
    `aggregationRule`, `wholeDishAggregates` and `reducedMotion` gates are true, and
    `fps60AtNeighborhood` is false (SwiftShader).
  - I stopped port 4262 before and after the run.
- **DONE: optimizations without changing any float operation or its order** (all inherited; I
  re-reviewed each one).
  - `src/sim/entities.ts:264` and `src/sim/fields.ts:148`: one-step `Object.fromEntries`, which ends
    V8 dictionary mode. This is the main gain.
  - `src/sim/movement.ts`:
    - `:190` prepareFoodScore/foodScoreAt.
    - `:244` blocked-window prefix sums, which skip traces that provably return 1.
    - `:88` `hypot` computed only where it is used.
    - The known-habitat argument to suitabilityAt.
  - `src/sim/intake.ts:96`: index tables.
  - `src/sim/transport.ts:199`: film is marked inactive when it is all-zero. That is the known
    filmCoefficients cost.
  - `src/sim/fungi.ts:209`: direct link-column reads (inspector).
  - `src/sim/founders.ts:202`: creationFounders memo, which is derived and keyed on `lineage.base`.
  - `src/worker/snapshot.ts:201,208`: link columns resolved once, and an early return when an
    organism has no links.
  - I made no new simulation edits. A CPU profile showed the remaining time is random cell access in
    intake/decide and dense diffusion. The exact zero-row diffusion skip measured < 10 % potential (15
    fields, non-zero across the dish by tick 300–3,000), so I did not add it.
- **DONE: hash-neutrality proof.**
  - Stress stateHash, HEAD sim vs current, at tick 0 `3f7d911d9248adfc`, 600 `c072e2c9e4167cea`, 1,500
    `7d122e1d11c2192b` and 3,000 `095952d6d6af35cf`: identical.
  - Snapshot digests: identical.
  - The 15-minute endpoint (tick 9,000) is `cbfe7805f738d85b` in both runs and in the 41-minute run.
  - Ledger, event totals and genome counts are identical.
  - The fence passes on the current tree (above).
  - Fence entries: the fence tests compare against fence.json, which was recorded on the committed
    simulation, so they are the before values.
- **DONE: machine and load records.**
  - Machine: `lscpu` AMD EPYC 7763, 2 vCPUs = 1 core × 2 SMT threads. Node v24.21.0.
  - The load average before and after every measurement is in perf-g3.md (1-minute load 2.8–6.2).
  - The exact commands are in perf-g3.md.

### Done when

- **NOT DONE: 1× tick p95 < 10 ms.**
  - Measured CPU: p50 18.81, p95 23.89, p99 42.59 ms (wall 19.98 / 37.62 / 57.95).
  - Before this pass: CPU 38.45 / 45.21 / 62.53.
  - Limiting stages (mean wall ms per tick): sense/move 7.31, intake 4.81, environment 2.73,
    structures 2.67. Remaining gap at p95: about 14 ms CPU on this loaded SMT machine.
  - The remaining large gains change results, so they are proposals (below). The lead re-measures on
    a quiet machine.
- **PARTIAL: no unbounded memory growth, slope over minutes 5–15 < 1 %/min.**
  - 41-minute run with no save in the window: 0.97 %/min over minutes 5–15, and 0.27 %/min after
    minute 31.
  - 15-minute run with the save and reload at tick 3,000: 1.73 %/min, which includes a +1.27 MB step
    right after the save.
  - The full series is in perf-g3.md. Growth over minutes 5–15 is mostly the per-second history, which
    by design fills a 30-minute window.
  - The residual growth is the genome table and its profile cache. Nothing compacts them: genome.ts
    promises compaction "P1.2", but it does not exist. See proposal 1.
- **DONE: snapshot size and cost per part.**
  - Whole snapshot: mean 4.59 ms, p95 9.30 (before: 11.80 / 22.9).
  - Per part (bytes): ents + ids 383,570, deposits 114,688, overlays 65,536, geometry 98,304 (once),
    lineage marks 5,993, events 2,714 (max 38,010), inspector 1,831 / 935, evolution 544.
- **PARTIAL: docs/reports/perf-g3.md.**
  - Present: before/after tables, the machine and load records, the hash proof, and the owner items
    (SwiftShader lower bounds; GPU/device fps per WORKLOG P1.5 and EXPANSION_RESPONSE §7; the
    15-minute Android stress session per D02 §25; D-0017's compositing check).
  - The two failing criteria are reported as measured, not as met.
- **DONE: tests/perf/stress-shape.test.ts.**
  - It asserts 6,000 agents, 2,000 fungal segments, both link kinds, every shipped system, E04, E07,
    E10 and E12 carriers, habitat parts, phage, breaker and objects.
  - It then steps until every early mechanism has acted. All had acted by tick 201.
  - It took 24.1 s at load 4.5–5.6. A quiet machine should be about half that.
  - **Non-vacuity check, run this session with `tmp/perf-diag/nonvacuity.ts`:**
    - With `phage` omitted, the run reaches tick 600 with `infection` and `lysis` missing.
    - With `objects` omitted, `objectRelease` is missing.
    - With `links` omitted, `fungalTransfer` is missing.
    - With nothing omitted, nothing is missing at tick 201.
    - With `breaker` omitted, nothing is reported missing: no mechanism watches the breaker's effect.
      The breaker field is still asserted to be non-zero at build.
- **DONE: the fences still pass.** g2-replay, the four trajectory-fence files and determinism: 6 files,
  55 passed. conservation-all-pools, deterministic-state, conservation-closed-lid and stress-shape:
  **Test Files 4 passed (4), Tests 10 passed (10)**.

## Files

- **Created by this assignment (both runs):** `tools/perf-stress.ts`, `tests/perf/stress-shape.test.ts`,
  this file. Scratch scripts are in `tmp/perf-diag/` (gitignored).
- **Changed:**
  - `tools/render-bench.ts`, `tools/render-bench-run.ts` (previous run).
  - `tools/perf-stress.ts` heap slope after minute 31 (this run).
  - `docs/reports/perf-g3.md` (this run).
  - Simulation hot paths, all from the previous run: `src/sim/{entities,fields,founders,fungi,intake,movement,transport}.ts`
    and `src/worker/snapshot.ts`.
- **Not changed:** `tools/sim-run.ts` and `tools/render-bench.html`, because no item needed it. I made
  no `content/`, `src/render` or `src/ui` edits.

## Commands and results

- `npx tsc -p tsconfig.json --noEmit` reports one error, in `tests/fixtures/determinism-g3.test.ts:421`
  (`recipeId` missing in SaveMeta). That is the g3-evidence builder's untracked, in-flight file, not
  mine. My files typecheck.
- `npx eslint` on every file I own or changed: clean.
- Vitest:
  - Fence set: 6 files / 55 passed.
  - Conservation, deterministic-state and stress-shape set: 4 files / 10 passed.
- `E2E_PORT=4262 npx tsx tools/render-bench-run.ts`: EXIT 0.
- `npx tsx tools/perf-stress.ts --hashes --stress-only` on HEAD and on the current tree: identical
  output.
- I added no Playwright journeys and edited no screens, so the axe, touch-target and text-size checks
  do not apply.

## FENCE

None. No fence value moved, and the fence was not updated.

## Bugs noticed elsewhere

- `tests/fixtures/determinism-g3.test.ts:421`: the buildSaveFile meta is missing `recipeId`. It
  breaks `npm run typecheck` (g3-evidence, in flight).
- `src/sim/genome.ts:3` documents genome-table compaction ("P1.2"), but nothing in `src/` implements
  it. The table grows without bound over a long session: about 100 genomes per minute in a dense
  dish, plus the matching `profiles` cache.

## Proposed decisions

- PROPOSED DECISION: implement genome-table compaction (rebuild from referenced genomes at a recorded
  boundary). It changes saved genome ids and the hash, so the owner must approve it and it needs a
  rules-version entry. A hash-neutral first step is to evict `world.profiles` entries (derived, never
  saved or hashed) for genomes with no living carrier.
- PROPOSED DECISION: to reach < 10 ms, accept one result-changing diffusion change under an
  evolutionRulesVersion bump:
  - a roundoff cutoff (values < ~1e-12 zeroed and booked to the ledger), or
  - enzyme/inhibitor diffusion at half rate in time.
  Separately, consider cell-ordered intake/decide passes. Each one needs owner approval.
- PROPOSED DECISION (host, not my file): in `DishHost.sendSnapshot`, send `ids` only when the
  population changed and `deposits` only for changed bands. This is hash-neutral and cuts about
  0.15 MB per snapshot.
- PROPOSED DECISION: the P3.12 memory criterion should be measured without a save inside the window,
  or over minutes 31+ once the 30-minute history window is full. The 5–15 window mostly measures
  history filling up by design.
