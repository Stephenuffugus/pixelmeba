# Performance pass 2 (P4.13) — release-candidate report

BUILD_DIRECTIVE P4.13: "Profile dense Garden + wave E1 on the web build; particle/label/overlay budgets;
effective-speed indicator; heat/memory over 15 min; polish first-minute feel (deposit ring, first feeding
pulse timing, camera easing)", with the P3.12 criteria D-0066 left open (1× tick < 10 ms at 6,000 agents;
heap slope over minutes 5–15 < 1 %/min) and D-0085's cost (+0.3 ms per tick).

Measured 2026-10-12, 08:22–11:10 UTC, on the shared 2-vCPU codespace while another agent ran Gradle and
Playwright. **Every number below is "under load"**: each row carries the 1-minute load average before and
after. The lead re-measured on a quiet machine at the v1.0 gate with the commands at the end ("Gate re-measure, quiet"
below). Nothing is reported as met
that was not measured as met.

## Verdict

| Criterion | Result (this machine, under load) | Status |
|---|---|---|
| SPEC §16 / P3.12: 1× tick < 10 ms at 6,000 agents (2,000 fungal), headless | After: tick-loop CPU p50 **12.78 ms**, p95 **21.34**, p99 39.84 (load 2.13 → 2.49). Before (HEAD): p50 11.95, p95 22.47 (load 1.40 → 3.05). | **NOT MET.** Unchanged by this pass (no hot-path edit was made; see "Tick time"). The limiting stages are still sense/move (5.5 ms), intake (3.5), environment (2.1) and structures (2.0). Every remaining large gain changes float order or rules (D-0066): owner items. |
| SPEC §16: the same in the web build's worker | Imported stress dish at 1× (360×800 Chromium, SwiftShader sharing the 2 CPUs): worker tick p50 **32.3 ms**, p95 51.5 (diagnostics bar, load 4.8). It keeps 1× (effective 1.0×); at 4× it runs at 2.0× and says so. | **NOT MET.** |
| P3.12: heap slope over minutes 5–15 < 1 %/min | 41-minute run, no save in the window: **0.83 %/min** after (0.95 before). 15-minute run with the save and reload at tick 3,000 inside the window: 1.74 %/min after (1.75 before). After minute 31 (history window full): **0.09 %/min** after, 0.26 before. | **MET without a save in the window; NOT MET with one** (a single +1.3 MB step right after the save, as at G3). The late growth fell by 65 % (profile eviction). |
| P4.13: heat and memory over 15 min on the web build | Garden at 4× for 15 real minutes (dish 0 → 59 min, ≈ 2,900 organisms): post-GC heap slope over minutes 5–15 worker **2.20 %/min** (0.23 MB/min from 10.5 MB; 1.1 %/min after minute 10), main thread **0.70 %/min**; browser CPU 1.65–1.72 cores of 2 every minute. | Main thread **MET**; worker **NOT MET** at 4× (four dish minutes per real minute of history fill and genome growth). Heat needs a device: **OWNER DEVICE ITEM** (steps below). |
| SPEC §16: touch feedback p95 < 100 ms | 20 Feed taps on the running Garden at 1×: p50 67.4, **p95 146.7**, max 173.9 ms (SwiftShader at ~14 fps, load 4.2–5.1). | **NOT MET here**; **OWNER DEVICE ITEM** on a phone with a GPU. |
| SPEC §16: 60 fps desktop / 30 fps mid-range phone at 6,000 agents | SwiftShader lower bounds: 360×800 neighborhood 9.7 fps, whole dish 15.9 fps; 1440×900 3.2 / 3.5 fps. | **OWNER DEVICE ITEM** (GPU / phone). |
| D-0085: the relationship map's pool sums cost +0.3 ms per tick on every played dish | Watcher per tick on the Garden (ticks 600–6,000): **0.06–0.07 ms** with the map never opened, against 0.23–0.30 ms with the pool sums running (the old always-on behaviour). | **Done**: pool sums run only once the map has been opened for that dish in the session. |
| SPEC §3.1 / UX §2.4: effective-speed indicator | Shown after 2 s below 0.8 × the chosen speed, hidden after 2 s at ≥ 0.9 ×; accessible sentence; announced once. Seen on the web build at 4× on the stress dish. | **Done.** |
| ARCH §13 / UX §2: opt-in diagnostics overlay | Settings → "Show performance numbers": tick p50/p95, effective speed, snapshot ms, fps, memory, detail level. | **Done.** |
| SPEC §16: under load reduce cosmetics first | Renderer degrade ladder (effects, stains, marker redraw, overlay/aggregation refresh). Reached level 3 under SwiftShader in every web run. | **Done** (renderer only; never the worker). |
| Hash neutrality of everything above | Stress world stateHash and snapshot digests at ticks 0/600/1,500/3,000/9,000 identical before and after; fence, determinism and conservation tests pass. | **Proven** (below). |

## Gate re-measure, quiet (v1.0 gate, P4.14)

Measured by the lead 2026-10-12 21:57–22:45 UTC at commit `17ad62f` (wave 7b `487a152` + the WORKLOG tick; the
gate's D-0099 fix touches only the camera and the dish screen, never the worker or the simulation). The commands
were tools/lead/gate4.sh's steps `perf-stress`, `perf-heap`, `perf-web` and `perf-web-gc` (the same commands as
"Commands" below, with `--out tmp/perf-gate4/…`). They ran **alone on the machine**: the gate's store:assets,
content and fixture steps had ended, and no agent, Gradle or Playwright job ran. The browser's own load (Chromium +
SwiftShader at about 1.7 of 2 cores) is in the web rows' load averages.

| Criterion | Gate, quiet | Load (1-min, before → after) | Status |
|---|---|---|---|
| SPEC §16 / P3.12: 1× tick < 10 ms at 6,000 agents (2,000 fungal), headless, 9,000 ticks | tick-loop CPU p50 **11.10 ms**, p95 **20.30**, p99 39.38 (wall p50 11.04, p95 20.88, p99 31.57). Stage means: sense/move 4.47, intake 2.83, environment 1.70, structures 1.57 ms | 2.22 → 1.71 | **NOT MET** (G3 quiet 12.0 / 20.8 / 39.8; perf-rc1 under load 12.78 / 21.34 / 39.84). |
| The same run's hashes | save at tick 3,000 `621471caf21cfee8`, reload hash matches; tick 9,000 `8564b87b9251fd32`; ledger relErr C 5.2e-16, N 5.1e-14; `capacityLimitedTicks` 8,827 | — | **Equal to this report's "after" run** (the simulation did not move after P4.13). |
| P3.12: heap slope over minutes 5–15 < 1 %/min, no save in the window (41-minute run, forced GC) | **0.204 MB/min = 0.825 %/min**; after minute 31 0.028 MB/min = 0.089 %/min; tick 9,000 `8564b87b9251fd32` (no save) and end `a1a1b90af259e1aa`, both equal to perf-rc1's | 1.71 → 2.26 | **MET.** |
| The same with a save and reload at tick 3,000 inside the window (the 9,000-tick run) | **0.427 MB/min = 1.721 %/min** | 2.22 → 1.71 | **NOT MET** (the one-time step after building and parsing a 10.7 MB save). |
| SPEC §16 in the web build's worker: the imported 6,000-organism stress dish, 360×800, SwiftShader | at 1×: worker tick p50 **32.2 ms**, p95 50.5 (medians of 31 samples); effective speed median 1.0× (it keeps 1×). At 4×: tick p50 31.7, effective speed median **2.1×** (min 1.0); the badge showed in 12 of 13 samples | 4.67 → 4.36 (1×), 4.36 → 5.75 (4×) | **NOT MET** (the worker shares 2 threads with software rasterization). |
| P4.13: web build, Garden at 4× for 15 real minutes (timing run) | worker tick p50 14.1 ms (median of 89 samples; max 16.8), p95 22.5; effective speed median 4.0× (min 1.5); 14 fps median; snapshot 3.4 ms median; dish 0:00 → 57:03, 2,838 organisms | 2.22 → 5.78 | Recorded. |
| P4.13: the same, memory (`--gc`: a garbage collection before each heap reading) | post-GC heap slope over minutes 5–15: worker **0.195 MB/min = 1.84 %/min** of 10.56 MB (0.080 MB/min = 0.65 %/min over minutes 10–15); main thread **0.062 MB/min = 0.47 %/min**; browser CPU 1.70–1.74 cores of 2 every minute | 5.18 → 5.16 | Main thread **MET**; worker **NOT MET** at 4× (lower than perf-rc1's 2.20 %/min). Heat: **OWNER DEVICE ITEM**. |
| SPEC §16: touch feedback p95 < 100 ms | 20 Feed taps on the running Garden at 1×: p50 109.1, **p95 127.6**, max 166.9 ms | 5.96 → 4.67 | **NOT MET here** (SwiftShader ≈ 14 fps); **OWNER DEVICE ITEM**. |

Raw output: tmp/perf-gate4/{stress-9000,heap-24600,perf-web,perf-web-gc}.json and tmp/gate4/perf-*.log on the
build machine (not committed). The ratios are computed exactly as tools/perf-stress.ts and tools/perf-web.ts do
(least-squares slope over the window, as a % of the first reading in it).

## Machine and load

- `lscpu`: AMD EPYC 7763 64-Core Processor, **2 vCPUs** (one core, two SMT threads). Node v24.21.0, linux x64.
  Chromium 153.0.8010.12 (Playwright), WebGL renderer "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device
  (Subzero) (0x0000C0DE)), SwiftShader driver)" — software rendering, so frame rates are lower bounds.
- Shared: the Android builder ran Gradle and the wave's other agents ran tests during these
  measurements. A busy SMT sibling inflates CPU time as well as wall time (perf-g3.md).

| Measurement | Load before (1/5/15 min) | Load after |
|---|---|---|
| Headless 9,000 ticks, HEAD (before) | 1.40 / 3.21 / 4.17 | 3.05 / 3.28 / 4.06 |
| Headless 9,000 ticks, after the D-0066 step (first run) | 4.84 / 3.66 / 3.93 | 4.95 / 4.26 / 4.12 |
| Headless 9,000 ticks, final tree | 2.13 / 2.78 / 4.20 | 2.49 / 2.84 / 4.02 |
| `--hashes --stress-only`, HEAD / final | 3.05 (start) / 2.49 | 3.42 / 1.44 |
| 41-minute heap run, final / HEAD | 1.44 / 2.35 / 3.70 · 2.92 / 3.56 / 3.90 | 2.56 / 3.50 / 3.88 · 1.86 / 2.45 / 3.28 |
| Relationship watcher cost (Garden) | 2.54 | 2.13 |
| Web build, perf-web (Garden, taps, stress) | 1.45 / 2.33 / 3.22 | 5.42 / 4.88 / 4.47 |
| Web build, perf-web --gc (Garden memory) | 4.24 / 4.51 / 4.38 | 4.40 / 4.93 / 4.88 |
| Render bench (final, gates pass) | 2.90 / 4.53 / 4.75 | 4.67 / 4.57 / 4.73 |

## Headless tick cost (tools/perf-stress.ts, 6,000 agents, 9,000 ticks, 1×)

"Before" is HEAD 6265d34 (a `git archive` copy with this pass's tools/perf-stress.ts dropped in, so both
probes run the same tool). "After" is this pass's tree. Same world, seed (6000) and commands; both end on
stateHash `8564b87b9251fd32` with ledger relErr C 5.2e-16, N 5.1e-14, and `capacityLimitedTicks` 8,827.

| ms per tick | before: wall | before: CPU | after: wall | after: CPU |
|---|---|---|---|---|
| mean | 14.70 | 14.23 | 15.84 | 14.78 |
| p50 | 11.90 | **11.95** | 12.69 | **12.78** |
| p95 | 27.08 | **22.47** | 30.89 | **21.34** |
| p99 | 47.70 | 40.35 | 47.37 | 39.84 |
| max | 352.6 | 323.5 | 240.8 | 303.5 |
| loop CPU (s) / CPU share of wall | 133.0 / 0.97 | | 138.1 / 0.93 | |

Per stage, wall ms per tick (mean): before → after.

| Stage | before | after |
|---|---|---|
| 2 environment | 1.919 | 2.115 |
| 3 conversion | 0.207 | 0.221 |
| 4 sense / move | 5.163 | 5.515 |
| 5 contacts | 0.732 | 0.777 |
| 6 intake | 3.213 | 3.454 |
| 7 maintenance | 0.832 | 0.898 |
| 8 structures | 1.823 | 2.002 |
| 9 births | 0.722 | 0.760 |
| 10 publish | 0.083 | 0.088 |

The two runs are the same simulation within load noise (the after run's load was higher by ~0.7). A
third run of the after tree taken at load 4.8–5.0 gave CPU p50 18.24 / p95 24.78 ms, which shows how much
the shared machine moves these numbers. Snapshot (every 10 ticks, worst case with a selection, both
overlays and the lineage view): before p50 2.67 / p95 5.86 ms, after p50 2.68 / p95 7.13 ms. Save at tick
3,000: 10,674,305 bytes, reload hash equal in all runs.

### Tick time (Build step 4): no hot-path edit made

Time-boxed and skipped. The step's own measure could not separate a sub-10 % gain from the load: the same
simulation measured CPU p50 11.95, 12.78 and 18.24 ms in three runs at load 1.4–5.0 today. The stage
shares are those of G3 (perf-g3.md "Remaining gap"): sense/move and intake are dominated by random access
into ~12k-cell fields, and every remaining large gain (entity-order locality, a diffusion cutoff,
half-rate enzyme diffusion, genome compaction) changes float order or rules, which is an owner decision
(D-0066). No such option was taken.

## Hash-neutrality proof

`npx tsx tools/perf-stress.ts --hashes --stress-only` (the probe now runs to tick 9,000; `--hashes-to <tick>`
stops earlier). Before = HEAD copy, after = this tree; outputs are byte-identical:

| tick | stress world stateHash (before = after) | snapshot digest (before = after) |
|---|---|---|
| 0 | `417b122aac6a856d` | `f1e9f78e20836327` |
| 600 | `1e150b021dd1d232` | `31332f0ec6f57340` |
| 1,500 | `f6bf01e1326455d5` | `e439632697c5eeb1` |
| 3,000 | `621471caf21cfee8` | `c1bfb16f259065d7` |
| 9,000 | `8564b87b9251fd32` | `9eff90221b401348` |

(The stateHash values differ from perf-g3.md's because buildPhase moved 3 → 4 in the manifest, D-0072; the
snapshot digests at 0–3,000 equal G3's.) The 41-minute runs end on `a1a1b90af259e1aa` before and after.

Tests on this tree (`npx vitest run …`, 20 files, 126 tests, all passed, 497 s at load 7.1 → 3.2):
tests/fixtures/g2-replay, the four tests/fixtures/trajectory-fence*.test.ts, tests/fixtures/determinism and
determinism-g3, conservation-closed-lid, tests/perf/stress-shape, and this pass's tests. No fence value moved.
tests/sim/profile-eviction.test.ts ran on its own (3 passed; the stress case 474 s at load ≈ 4.5), and
tests/e2e/first-minute.spec.ts passed on desktop and phone-portrait.
tests/sim/profile-eviction.test.ts proves the eviction (below); tests/worker/perf-counters.test.ts toggles
diagnostics mid-run and compares stateHash and the full trajectory digest with an untouched host; the
renderer ladder and the camera live in src/render, which no simulation code reads (tests/render/budgets.test.ts
checks that src/render imports no worker client).

## Memory (D-0066's hash-neutral first step)

What changed (src/sim, hash-neutral):
- `src/sim/profiles.ts` `evictProfiles`, called by `step()` every `PROFILE_EVICT_TICKS` (600): drops cached
  derived profiles of genomes with no living carrier and no reference from a living organism's birth
  proposal (`propG0`/`propG1`) or reference genome, the held sample, or a branch record. A profile is a pure
  derivation of (species, genome, the world's modules), so a dropped one is rebuilt with the same values.
  Profiles are never saved or hashed: `serialize.ts` `serializeWorld` writes `genomes` from
  `world.genomes.list` and has no `profiles` field; `stateHash` hashes `genomeKey(g)` per genome.
- `src/sim/movement.ts` `releaseFoodRefs`: the stage's module-level food-array references are cleared at the
  end of stage 4, so the module no longer keeps the last world's fields reachable (D-0066 MINOR).

tests/sim/profile-eviction.test.ts: FIRST_DISH_V1 for 6,000 ticks hashes identically (stateHash and the
full trajectory digest at 1,500/3,000/4,500/6,000) with the shipped cadence, with the whole cache thrown away
every tick, and with every genome's profile kept forever; a world reloaded at tick 3,000 continues exactly
as the live one and its save has no profiles; the 6,000-agent stress world for 6,000 ticks hashes
identically with the shipped cadence and with nothing ever evicted.

Heap after a forced GC every simulated minute (`--expose-gc`):

| Run | minutes 5–15 slope | after minute 31 | heap at min 15 / 41 |
|---|---|---|---|
| 41-min, no save, HEAD | 0.237 MB/min = 0.95 %/min | 0.085 MB/min = 0.26 %/min | 27.69 / 33.26 MB |
| 41-min, no save, this tree | 0.205 MB/min = **0.83 %/min** | 0.030 MB/min = **0.09 %/min** | 27.43 / 31.97 MB |
| 15-min, save at 3,000, HEAD | 0.439 MB/min = 1.75 %/min | — | 30.10 MB |
| 15-min, save at 3,000, this tree | 0.429 MB/min = 1.74 %/min | — | 29.71 MB |

Heap MB per minute, 41-minute runs:
- minutes 5–15, HEAD: 24.84, 25.19, 25.51, 26.04, 26.35, 26.67, 27.00, 27.38, 27.63, 27.92, 27.69;
  this tree: 24.78, 25.09, 25.36, 25.88, 26.21, 26.50, 26.80, 27.17, 27.43, 27.69, 27.43.
- minutes 31–41, HEAD: 32.40 … 33.26; this tree: 31.66 … 31.97.

Reading it: minutes 5–15 are dominated by the 30-minute per-second history filling up by design (CT §12.10),
so eviction moves that slope only a little. After the history window is full, what remained (the genome
table and its profile cache) grows a third as fast. The genome table itself still grows by about 100
genomes a minute in this dense dish (3,946 genomes at minute 41); compacting it changes saved genome ids and
the hash, so it stays an owner item (D-0066).

## The relationship map's cost (D-0085)

Pool totals (a sum over every dish cell before and after stage 6, for nine food pools) now run only once
the map has been opened for that dish in this session; the existing `'relationshipMap'` request is the
signal (`src/worker/host.ts` sets `mapOpened` and arms the watcher; a map opened before the dish first plays
arms it at the first tick). From then on the pools have their own per-second record
(`src/worker/relationshipMap.ts` `RelationshipLedger.armPools`, `poolsRecordedSinceSecond`): while that
record starts after the window's start, the map's pool list says "Recorded since m:ss. Pool totals are
measured from the moment this map was first opened for this dish in this visit." — exactly as a
mid-second restart does for the whole map. The event-based arrows (catches, infects, attaches, bursts,
drains, converts, eats-seen) keep their full window. Undo restarts the pool record as it does the map.

Watcher time per tick on FIRST_DISH_V1 (its stage hooks and after-tick scan; ticks 600–6,000; two rounds;
load 2.54 → 2.13; `npx tsx tmp/perf2/watcher-cost.ts 6000`, a scratch script, not committed):

| | mean | p50 | p95 |
|---|---|---|---|
| map never opened (new default), round 1 / 2 | 0.066 / 0.058 ms | 0.023 / 0.018 | 0.296 / 0.282 |
| pool sums on (the P4.8 behaviour), round 1 / 2 | 0.303 / 0.227 ms | 0.187 / 0.178 | 0.858 / 0.441 |

So a played dish whose map is never opened saves about 0.17–0.24 ms per tick on the Garden.
tests/worker/relationship-map-cost.test.ts: no pool sum runs before the first open (the watcher's stage-5
snapshot is never called in 600 ticks; checked to fail with the guard removed: 600 calls); after it, every
window's edges equal the always-on ledger's, and each pool's total equals the always-on ledger's total over
the seconds since the first open (exactly, `toBe`). "Only active pools" was not tried.

## Web build (tools/perf-web.ts)

`npx tsx tools/perf-web.ts --out tmp/perf2/perf-web.json` (production build in tmp/dist-perf, `vite preview` on
5282, Playwright Chromium 153 with SwiftShader, viewport 360×800 with touch; Settings → "Show performance
numbers" on, so every timing below is the app's own diagnostics bar, sampled every 10 s). Load: 1.45 at the
start, 5.42 at the end (the Android builder's Gradle and the machine's other jobs; the browser itself used
1.6–1.7 of the 2 cores the whole time). Then `--no-build --gc --skip-taps --skip-stress` repeated the Garden
with a garbage collection before each heap reading (load 4.28 → 4.78), for the memory slope.

**(a) Dense Garden, FIRST_DISH_V1 at 4× for 15 real minutes** (dish time 0:03 → 58:44; the dish grows from 56
to about 2,900 organisms by dish minute 20 and stays there):

| Reading (89 samples) | median | worst |
|---|---|---|
| worker tick p50 (ms, over the last 300 ticks) | 13.6 | 17.0 |
| worker tick p95 (ms) | 22.2 | 30.3 |
| effective speed (× of 4×) | 4.0 | 1.6 (the badge showed in 2 samples) |
| snapshot build + post (ms) | 3.3 (p95 7.0) | — |
| frame rate (SwiftShader) | 14 fps | 11 fps |
| detail level | 3 from the first minute (0 at the start) | 3 |
| browser CPU per minute (all browser processes) | 1.65–1.72 cores of 2 | — |

Heap after a forced collection (the `--gc` run), per-minute floor, real minutes 5–15 (dish minutes ≈ 20–60):

| Heap | at minute 5 | slope | % of minute 5 per minute | after minute 10 |
|---|---|---|---|---|
| worker (CDP Runtime.getHeapUsage on the worker target) | 10.50 MB | 0.231 MB/min | **2.20 %/min** | 0.140 MB/min (1.1 %/min) |
| main thread (performance.memory) | 12.46 MB | 0.087 MB/min | **0.70 %/min** | 0.050 MB/min |

Worker floor by minute 5–14: 10.50, 11.29, 11.55, 11.95, 12.15, 12.51, 12.49, 12.73, 12.71, 12.75 MB (two raw
samples of 30.9 and 33.3 MB, where the collection had not finished before the reading, are not floors). At
4× one real minute is four dish minutes: the per-second history fills its 30-minute window by real minute
7.5, and what grows after it is the genome table (as headless). Without `--gc` the raw heaps are a GC
sawtooth (worker 7–46 MB) and their slope means nothing; those runs are used for timing only.

**(b) Wave E1 dense: the stress dish imported** (`tools/perf-stress.ts --save-out`, 6,000 agents with 2,000
fungal at tick 600, 10.2 MB; Saved dishes → Import file opened it paused in 1,660 ms):

| | 1× for 5 min (31 samples; load 4.81 → 4.68) | 4× for 2 min (13 samples; load 4.68 → 5.42) |
|---|---|---|
| worker tick p50 / p95 (ms, median over samples) | **32.3 / 51.5** | 32.3 / 50.3 |
| effective speed | 1.0× (keeps up) | **2.0×** (median; min 1.6×) |
| effective-speed badge shown | 0 of 31 samples | 12 of 13 samples |
| snapshot (ms, median / p95) | 7.2 / 12.3 | 8.2 / 19.2 |
| frame rate (median / min) | 13 / 7 fps | 12 / 11 fps |
| detail level | 3 | 3 |
| browser CPU per minute | 1.63–1.66 cores | 1.64 cores |

In the browser the worker shares two SMT threads with SwiftShader's software rasterizer and the main
thread, so its tick is about 2.5× the headless one (12.8 ms CPU p50). The first sample after the import
shows 272 ms (warm-up: the first ticks of a freshly loaded 6,000-agent world, not repeated).

**(c) Touch feedback: 20 Feed taps** on the running Garden at 1× (load 4.21 → 5.14). Method: the pointerdown
event's `timeStamp` on the dish canvas to the first `requestAnimationFrame` after the toast "Added sugar to
N cells." appears (reportCommand writes it in the same call that spawns the placement ring); Playwright
mouse clicks at 20 points around the dish centre.

| p50 | p95 | max | SPEC §16 target |
|---|---|---|---|
| 67.4 ms | **146.7 ms** | 173.9 ms | p95 < 100 ms: **NOT MET here**; the round trip waits for a worker tick and a software-rendered frame (≈ 70 ms per frame at 14 fps). OWNER DEVICE ITEM. |

**(d) Frame rate per viewport** (`E2E_PORT=4282 npx tsx tools/render-bench-run.ts`, the Phase 3 synthetic
6,000-organism scene; SwiftShader lower bounds; the renderer now runs its degrade ladder):

| Viewport | Neighborhood fps (frame p50 ms) | Whole dish fps | Aggregation at whole dish | rendererUpdate ms mean / p95 | applySnapshot ms mean / p95 | Ladder level reached | G3 quiet (fps nbhd / whole) |
|---|---|---|---|---|---|---|---|
| 1440×900 @1 | 3.19 (300) | 3.45 | no (sprites at scale 1, D-0016) | 1.96 / 3.7 | 4.84 / 19.7 | 3 | 3.15 / 3.33 |
| 360×800 @1 | 9.74 (100) | 15.85 | yes | 1.11 / 3.0 | 2.98 / 6.1 | 3 | 10.0 / 15.95 |
| 360×800 @2 | 2.72 (350) | 4.24 | yes | 2.01 / 5.0 | 4.79 / 10.0 | 3 | 2.80 / 4.47 |

Gates on all three viewports: `aggregationRule`, `wholeDishAggregates` and `reducedMotion` true;
`fps60AtNeighborhood` false (software rasterization is the limit, as at G1 and G3). The bench's
reduced-motion gate predated D-0089 (wave 6b made reduced motion draw still effects: the 1 s still placement
ring and the 1 s static split frame), so the first run of this pass failed it on all three viewports (load
3.58 → 4.83; tmp/perf2/bench.json). It now checks what D-0089 requires: no animated effect, the placement ring
still, and every body on its reducedMotionFrame (reduced: 0 animated effects; control: 6–10). The frame
rates match G3's quiet numbers within noise: at these rates the frame time is the software rasterizer's, and
the ladder's cosmetic savings do not show; on a GPU they would.

## Budgets and the degrade ladder (src/render/budgets.ts)

Cosmetic only, renderer only (the renderer imports no worker client, ARCH §3). Named caps for what exists:
`EFFECTS_MAX` 64 transient rings, `STAINS_MAX` 128 food-object stains, `GHOSTS_MAX` 1,024 death dissolves
(new: a mass die-off no longer grows that list without bound), overlay and aggregation textures refresh at
most every 100 ms (≤ 10 Hz, ARCH §13). The ladder follows a frame-time moving average (weight 0.1; one frame
clamped at 250 ms) against a 30 fps budget (33.3 ms): one level down after 2 s over budget, one level back
after 5 s under 0.8 × the budget (hysteresis).

| Level | What it changes |
|---|---|
| 0 | the caps above |
| 1 | transient effects capped at 16; no food-object stains |
| 2 | + family / favourite markers redraw at 2 Hz (FamilyMarkers, FavoriteMarkers read `renderer.markerRedrawMs`) |
| 3 | + overlay and aggregation textures refresh at 2 Hz |

Levels reached: **3** in every SwiftShader run (the render bench on all three viewports, the Garden from its first minute, the stress dish throughout), because software rendering never reaches 30 fps here; the Garden's diagnostics bar showed "Detail 0" in its first samples and "Detail 3" after. What level a GPU device reaches is an OWNER DEVICE item. The snapshot rate is not on the ladder (PROPOSED DECISION below). The
diagnostics bar shows the level as "Detail n".

## Effective-speed indicator (src/ui/speedBadge.ts)

`stepBadge` (pure): shown after the effective speed has stayed below 0.8 × the chosen speed for 2 s of real
time; hidden after it has stayed at or above 0.9 × for 2 s; never while paused or stepping. The visible text
stays " · running at {x.x}×"; its accessible name and title are "This device can't keep up with {speed}×,
so the dish runs at {x.x}×. No dish time is skipped."; the polite live region says it once per appearance
(cleared after 5 s so a later toast never brings it back). The dish screen uses the worker's measured
effective speed; a comparison or experiment run measures ticks per real second on screen
(`EffectiveSpeedMeter`), never at "Fast". Seen live on the stress dish at 4× (web run).

## Diagnostics (Settings → "Show performance numbers")

Off by default ("Tick time, speed, frame rate and memory, for bug reports. Off by default."). When on, a
one-line bar under the top strip that is part of the layout (it shrinks the viewport; it never covers the
dish): "Tick {p50} ms (p95 {p95})" · "Speed {x}× of {speed}×" · "Snapshot {ms} ms" · "{fps} fps" ·
"Memory {MB} MB" (performance.memory, else "Memory n/a") · "Detail {level}". The tick and snapshot times come
from `src/worker/perfCounters.ts` (a ring of the last 300 ticks; `performance.now()` around `stepDish` and
`sendSnapshot` in the worker only while diagnostics are on; with them off the host never calls
`performance.now()`, tests/worker/perf-counters.test.ts). Text 16 px; it wraps at 200 %.

## First-minute polish

- **Placement ring** only for an accepted placement (`src/ui/state.ts` `reportCommand`: `res.accepted > 0`);
  a refused placement shows its refusal and no ring. With motion on it grows from 0 to the dose radius over
  300 ms and fades out by 700 ms (`src/render/features.ts` `PLACEMENT_EXPAND_MS`, `PLACEMENT_RING_MS`); in
  reduced motion it keeps wave 6b's still ring for 1 s.
- **First feeding pulse**: a new bout of eating starts its feed animation at frame 0 on the first rendered
  frame after the snapshot in which CUE_FEEDING turned on (`bodyAnimFor`, `feedStartAfterSnapshot`,
  `feedFrameClock`); before, the frame came from a free-running per-organism clock, so the first visible
  pulse could be any frame. Never a feed frame without the cue.
- **Camera easing**: the zoom buttons and +/−, the whole-dish preset, Find / "go to" and the inspector's
  reveal pan ease over 220 ms (ease-out cubic; zoom geometric); wheel, pinch, drag and follow stay direct; a
  touch on the dish (or any direct move) ends a move where it was going, so input lands where the view goes;
  reduced motion is instant. The camera never moves on its own.

## What stays open, and why

- **1× tick < 10 ms at 6,000 agents**: not met (p50 ≈ 12–13 ms CPU, p95 ≈ 21 ms on this shared machine).
  The remaining options change results (D-0066 owner items): (1) a diffusion roundoff cutoff, (2) enzyme and
  inhibitor diffusion at half rate, (3) entity-order locality for intake and decide (changes `+=` order),
  (4) genome-table compaction (memory). Each needs an evolutionRulesVersion entry and the owner.
- **Heap slope with a save inside the window**: 1.74 %/min, from a one-time step after building and parsing a
  10 MB save; without a save, met.
- **Web worker heap at 4×**: 2.2 %/min over real minutes 5–15 (1.1 %/min after minute 10): at 4× the
  history window and the genome table grow four dish minutes per real minute. The genome-table compaction
  above is the remaining lever.
- **Touch feedback p95** 147 ms here (software rendering at ~14 fps on a shared CPU); a device check decides.
- **Device numbers**: thermal state, battery drain, real frame rates and touch latency need the nominated
  phone (OWNER DEVICE items below).
- Snapshot ids/deposits only on change (D-0066 MINOR) was not done: it is hash-neutral but saves only
  bandwidth, and the snapshot stays well inside its budget here.

## OWNER DEVICE steps (heat, battery, frame rate)

On the nominated mid-range Android phone with the debug APK (docs/ANDROID_SETUP.md §4):
1. Charge above 80 %, unplug, close other apps, let the phone rest 5 minutes at room temperature.
2. `adb shell dumpsys battery` and `adb shell dumpsys thermalservice` — copy `level`, `temperature` (tenths
   of °C) and the thermal service's current status and temperatures.
3. Open the app → Settings → turn on "Show performance numbers" → Play → Little Living Garden → Run → 4×.
4. Leave it running in the foreground for 15 minutes (screen on). Every 5 minutes write down the bar's six
   readings.
5. Run the two `dumpsys` commands again and copy the same fields.
6. Copy into EXPANSION_RESPONSE §7: the battery level and temperature before/after, the thermal status
   before/after (and whether it ever left "NONE"), and the bar's tick p50/p95, speed, fps and memory at
   minutes 5, 10 and 15. Repeat steps 3–5 at 1× with a 6,000-organism dish (Saved dishes → Import file:
   `npx tsx tools/perf-stress.ts --save-out stress.pixelmeba`, copied to the phone).

## PROPOSED DECISIONS

- The relationship map's pool totals run only after the map is first opened for that dish in the session
  (pools then say "Recorded since m:ss" until the window is covered); chosen over "only active pools"
  because it removes the whole cost for the common case of a map never opened, and its numbers are exactly
  the old ledger's over the seconds it covers. "Only active pools" was not built or measured.
- The degrade ladder stops at the renderer in v1.0: snapshot frequency, the worker and the simulation are
  never on it (SPEC §16 lists snapshot frequency as allowed; it is left for a later pass with a device).
- A refused placement draws no ring (`res.accepted > 0`); with motion on the ring grows 0 → dose radius over
  300 ms and fades by 700 ms; reduced motion keeps the 1 s still ring (D-0089).
- Camera easing (220 ms ease-out cubic) for player-initiated preset moves only; a touch on the dish
  settles an unfinished move; reduced motion instant.
- Profile eviction every 600 ticks inside `step()` (memory only; profiles are derived and unsaved).

## Commands (for the quiet re-measure)

```
# headless stress, 15 minutes of dish time (one JSON document)
node --expose-gc --import tsx tools/perf-stress.ts --ticks 9000 --out <file>.json
# the same on HEAD: a `git archive HEAD` copy with this tools/perf-stress.ts dropped in
(cd <head-copy> && node --expose-gc --import tsx tools/perf-stress.ts --ticks 9000 --out <file>.json)
# hash-neutrality probe, stress world to tick 9,000 (identical output before and after)
npx tsx tools/perf-stress.ts --hashes --stress-only
# long heap run: no snapshot measurement, no stage hooks, no save
node --expose-gc --import tsx tools/perf-stress.ts --ticks 24600 --snapshot-every 0 --no-stages --save-at -1 --hash-at 9000 --out <file>.json
# the stress dish as a save file (for the web import and the phone)
npx tsx tools/perf-stress.ts --save-out tmp/perf2/stress-600.pixelmeba --save-out-tick 600
# web build: Garden 4× 15 min, 20 Feed taps, stress import 5 min 1× + 2 min 4× (port 5282, tmp/dist-perf)
npx tsx tools/perf-web.ts --out <file>.json
# the Garden again with a garbage collection before each heap reading (memory slope only; not for timing)
npx tsx tools/perf-web.ts --no-build --gc --skip-taps --skip-stress --out <file>.json
# renderer bench (dev server on E2E_PORT; SwiftShader)
E2E_PORT=4282 npx tsx tools/render-bench-run.ts
```

Raw JSON of every run above: tmp/perf2/ (not committed).
