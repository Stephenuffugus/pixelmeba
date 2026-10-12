# Wave 7a — perf2-polish build report (P4.13 Performance pass 2 and polish)

Builder: perf2-polish. Tree: main 6265d34 + this stage's uncommitted edits (the Android builder edited the
same tree in parallel). All timings were taken on the shared 2-vCPU codespace while Gradle and other jobs
ran, and are labelled with the 1-minute load average in docs/reports/perf-rc1.md.

## Checklist — Build

1. **Baseline first** — DONE. `tmp/perf2/head` = `git archive HEAD` + this tools/perf-stress.ts; `node --expose-gc --import tsx tools/perf-stress.ts --ticks 9000 --out ../before-stress.json` (load 1.40 → 3.05) and `npx tsx tools/perf-stress.ts --hashes --stress-only > ../before-hashes.json`. Kept in tmp/perf2/before-*.json (plus before-long.json).
2. **D-0085 pool sums only after the map is first opened** — DONE.
   - src/worker/relationshipMap.ts:187 `RelationshipLedger.armPools`, own pool `SecondRecord`, `poolsRecordedSinceSecond` (:270); src/worker/relationships.ts:101 `armPools`, stage-5 guard `this.ledger.poolsArmed`; src/worker/host.ts:1037 (the 'relationshipMap' request sets `d.mapOpened` and arms) and :1545 (a map opened before the first tick arms at the first tick).
   - UI line under "Taken from the pools": src/ui/panels/RelationshipMap.tsx:318 + src/ui/strings/observe.ts `poolsSinceWhy` ("Recorded since m:ss. Pool totals are measured from the moment this map was first opened for this dish in this visit.").
   - Proof: tests/worker/relationship-map-cost.test.ts (4 tests). Watcher cost on the Garden (ticks 600–6,000): 0.058–0.066 ms/tick never opened vs 0.227–0.303 ms/tick with pool sums (the old behaviour).
3. **Memory: profile eviction + movement refs** — DONE. src/sim/profiles.ts:40 `evictProfiles` (+ `PROFILE_EVICT_TICKS` 600, :33), called from src/sim/tick.ts:48; src/sim/movement.ts:515 `releaseFoodRefs` (called at :506). Proof: tests/sim/profile-eviction.test.ts. Heap: 41-min run slope minutes 5–15 0.95 → **0.83 %/min**, after minute 31 0.26 → **0.09 %/min**, heap at minute 41 33.26 → 31.97 MB; 15-min run with the save in the window 1.75 → 1.74 %/min.
4. **Tick time** — NOT DONE (skipped with reason). Under today's load the same simulation measured CPU p50 11.95, 12.78 and 18.24 ms in three runs (load 1.4–5.0), so a sub-10 % hot-path gain could not be proven; the remaining large gains change float order or rules (owner items, D-0066). No sim hot-path edit was made.
5. **Worker perf counters** — DONE. src/worker/perfCounters.ts:16 `PerfCounters` (ring of 300 tick and snapshot times); src/worker/host.ts:1024 'diagnostics' case, :3437 `recordTick`, :3522 `perf` on SnapshotMsg, :3530 `recordSnapshot`; the relationship watcher timed only while on (stepDish). Protocol (shared, additive): src/worker/protocol.ts:107 ToWorker 'diagnostics', :633 `perf?: PerfSample`, :637 `PerfSample`; src/worker/client.ts:513 `setDiagnostics`. Proof: tests/worker/perf-counters.test.ts.
6. **Diagnostics** — DONE. Settings toggle src/ui/views/SimplePage.tsx:97 ("Show performance numbers" + hint), setting src/ui/state.ts:109 `showPerformance?` (default off; older settings load), plumbing :202, :267, `diagPerf` :133; bar src/ui/panels/Diagnostics.tsx:52 (diag-tick/speed/snapshot/fps/memory/level), placed at src/ui/views/DishScreen.tsx:287 as a grid row (src/ui/styles.css:310–335 `.with-diag`, `.diag-bar`, 16 px, wraps). Proof: tests/ui/diagnostics.test.ts, tests/e2e/first-minute.spec.ts.
7. **Budgets and ladder** — DONE. src/render/budgets.ts (`EFFECTS_MAX` 64, `EFFECTS_MAX_DEGRADED` 16, `STAINS_MAX` 128, new `GHOSTS_MAX` 1024, marker redraw 0/500 ms, overlay/aggregation refresh 100/500 ms, `BudgetLadder` :76 with 2 s degrade / 5 s recover and a 0.8–1.0 hysteresis band); renderer src/render/renderer.ts:840 `frameBudget`, overlay/aggregation throttles in applySnapshot/frame, caps in spawnEffect/handleEvents; markers: src/ui/panels/FavoriteMarkers.tsx:22, FamilyMarkers.tsx:21 read `renderer.markerRedrawMs`. Never touches the worker. Proof: tests/render/budgets.test.ts. Level reached: 3 in every SwiftShader run.
8. **Effective-speed indicator** — DONE. src/ui/speedBadge.ts:45 `stepBadge`, :95 `useSpeedBadge` (announces once through the polite live region, cleared after 5 s), :141 `PairSpeedBadge`; DishScreen.tsx:238, CompareScreen.tsx:117, ExperimentRun.tsx:149; live region src/ui/a11y/LiveRegion.tsx:13 (`toast ?? announcement`). Proof: tests/ui/speed-badge.test.ts; seen live on the stress dish at 4× (perf-web: 12 of 13 samples).
9. **First-minute polish** — DONE.
   - Ring only when accepted: src/ui/state.ts:1116 `reportCommand` (exported) with `res.accepted > 0` at :1129, :1134, :1141. Timing: src/render/features.ts:218 `PLACEMENT_EXPAND_MS` 300, `PLACEMENT_RING_MS` 700, `effectLook`; reduced motion keeps 6b's 1 s still ring. Proof: tests/ui/placement-ring.test.ts, tests/render/reduced-motion.test.ts.
   - First feeding pulse: src/render/features.ts:285 `bodyAnimFor`, :299 `feedStartAfterSnapshot`, `feedFrameClock`; renderer per-entity `feedStart` (applySnapshot) and the frame choice (renderer.ts:1023). Proof: tests/render/feeding-pulse.test.ts.
   - Camera easing: src/render/camera.ts:37 `easePose`, :93 `eased`, :111 `zoomBy`, `step`, `settle`, `fit(instant)`; renderer.ts:429 (a touch on the canvas settles), `camera.clock`, `reducedMotion`; DishScreen.tsx:315/:318 zoom buttons and +/− use `zoomBy`, :201 Enter-tap settles. UX §7.4 "camera easing" As-built cell updated (docs/UX_SPEC.md). Proof: tests/render/camera-easing.test.ts.
10. **tools/perf-web.ts** — DONE (new). (a) Garden 4× 15 min with the diagnostics bar every 10 s + worker heap via CDP (page session, `Target.setAutoAttach` flatten false, `Runtime.getHeapUsage` through `Target.sendMessageToTarget` — it works) + browser CPU per minute from `ps` over the launched browser's process tree; `--gc` collects garbage before each heap reading. (b) tools/perf-stress.ts `--save-out` (≤ 25 MB check) → Saved dishes → Import file, 5 min 1× + 2 min 4×. (c) 20 Feed taps, pointerdown `timeStamp` → first rAF after the accepted toast. (d) machine JSON. Port 5282, tmp/dist-perf, stopped by port.
11. **docs/reports/perf-rc1.md** — DONE: verdict table, headless before/after with stages, web tables (Garden 15 min, stress 1×/4×, touch, fps per viewport), memory slopes (headless and web worker/main), ladder levels, D-0085 before/after, hash-neutrality proof, open items, OWNER DEVICE steps, commands.

## Checklist — Done when

- New unit tests pass — DONE: tests/render/{budgets,camera-easing,feeding-pulse}.test.ts, tests/ui/{speed-badge,placement-ring,diagnostics}.test.ts, tests/worker/{perf-counters,relationship-map-cost}.test.ts, tests/sim/profile-eviction.test.ts. tests/worker/relationship-map.test.ts and tests/ui/observe.test.ts still pass, adjusted:
  - relationship-map.test.ts `watch()` now calls `rw.armPools()` at the start (these ledger tests read pool totals from the first tick, i.e. the old always-on behaviour); nothing else changed.
  - observe.test.ts's map fixture gains `poolsRecordedSinceSecond: null` (the new required field).
  - tests/render/reduced-motion.test.ts (6b's) adjusted twice: the placement ring's radius at t=0 is now 0 and reaches the dose radius at 300 ms; the "camera easing → instant" test now checks reduced motion with a clock (it had asserted there is no easing in any mode).
- Hash neutrality — DONE: `--hashes --stress-only` before (HEAD copy) and after are byte-identical (pasted below); g2-replay, the four trajectory-fence files, determinism + determinism-g3, conservation-closed-lid and stress-shape pass; tests/worker/perf-counters.test.ts toggles diagnostics mid-run and compares stateHash and trajectoryDigest 'full' with an untouched host; the ladder lives in src/render (tests/render/budgets.test.ts checks src/render imports no worker client).
- docs/reports/perf-rc1.md — DONE, every number with load; open items listed; nothing reported met that was not measured met.
- tests/e2e/first-minute.spec.ts desktop AND phone-portrait — DONE (2 passed). One deliberate deviation: **a refused Feed does change the worker's stateHash** (every command takes `commands.nextSeq`, which stateHash covers, and adds a 'command' event, refused or not), so the spec checks instead that the world without its command record (`'save'` request minus `commands`, `events` and `counters.nextEventId`) is identical and that exactly one 'command' event was added. The accepted Feed changes the hash once (and not again while paused). Axe on Settings and on the dish with the bar; bar below the top strip and above the viewport (bounding boxes); 16 px text; no sideways scroll at 200 % text.

## Files

Created: src/render/budgets.ts, src/worker/perfCounters.ts, src/ui/speedBadge.ts, src/ui/panels/Diagnostics.tsx, tools/perf-web.ts, docs/reports/perf-rc1.md, tests/render/{budgets,camera-easing,feeding-pulse}.test.ts, tests/ui/{speed-badge,placement-ring,diagnostics}.test.ts, tests/worker/{perf-counters,relationship-map-cost}.test.ts, tests/sim/profile-eviction.test.ts, tests/e2e/first-minute.spec.ts, this report.

Changed (owned): src/worker/{host,relationshipMap}.ts, src/sim/{profiles,tick,movement}.ts (hash-neutral), src/render/{renderer,camera,features}.ts, src/ui/state.ts (settings field, signals, exported reportCommand with the ring guard; the Android builder's saveTextFile untouched), src/ui/views/{DishScreen,SimplePage,CompareScreen,ExperimentRun}.tsx, src/ui/styles.css, tools/{perf-stress,render-bench}.ts, docs/UX_SPEC.md (§7.4 camera-easing As-built cell only).

Changed (shared, additive): src/worker/protocol.ts ('diagnostics' message, `perf?`, `PerfSample`), src/worker/client.ts (`setDiagnostics`).

Changed outside the owned list (small, additive; please review): src/worker/relationships.ts (`armPools` + the stage-5 guard; the watcher is what sums the pools), src/ui/panels/RelationshipMap.tsx and src/ui/strings/observe.ts (the pools' "Recorded since" line), src/ui/a11y/LiveRegion.tsx (one expression: `toast ?? announcement`), src/ui/panels/{FavoriteMarkers,FamilyMarkers}.tsx (two-line throttle reading `renderer.markerRedrawMs`), tests/render/reduced-motion.test.ts, tests/ui/observe.test.ts, tests/worker/relationship-map.test.ts.

## What each test proves (and how it fails without the mechanism)

- relationship-map-cost: no pool sum before the first open (watcher `beforeIntake` called 0 times in 600 ticks; **mutation checked**: guard removed → "called 600 times"); after it, edges equal the always-on ledger's and pool totals equal its sum over [first open, to] exactly; a map opened before play has no "Recorded since"; ledger rules for mid-second opens and Undo.
- perf-counters: ring/percentiles; off → no `perf`, **no performance.now() call** (**mutation checked**: guard removed → 200 calls); on/off toggling; hash-neutral mid-run toggling (stateHash + trajectory 'full').
- profile-eviction: Garden 6,000 ticks identical (stateHash + trajectory at 4 marks) with the shipped cadence, evict-everything-every-tick and keep-everything; non-vacuous (the shipped cache holds fewer profiles than genomes; `evictProfiles` drops entries); reload at 3,000 continues identically, no profiles in the save; stress world 6,000 ticks identical shipped vs never-evicted.
- placement-ring: accepted 0 → no ring (feed, life, capacity, phage); accepted > 0 → one ring at centre/radius (**mutation checked**: guard removed → the accepted-0 test fails).
- feeding-pulse: never a feed frame without CUE_FEEDING; a new bout starts at frame 0 on the first frame after its snapshot for any free-clock phase (with the free clock it would be frame 3 for phase 250); start carried and cleared.
- camera-easing: endpoints exact, monotonic, ease-out; lands exactly at 220 ms; instant in reduced motion or without a clock; a new move starts where the view is and composes on the previous target; drag/wheel direct and settling.
- speed-badge: 2 s below 0.8× to show, 2 s at ≥ 0.9× to hide, band 0.8–0.9 holds, never paused, text/label, the meter.
- budgets: per-level allowances, ladder timing both ways, hysteresis band, clamp, no worker client import.
- diagnostics: off by default, older settings load off, the six readings' wording, memory n/a.

## Commands and results

```
npx tsc -p tsconfig.json --noEmit                                 → exit 0
npx eslint <every file listed above>                               → exit 0
npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence.test.ts tests/fixtures/trajectory-fence-arms.test.ts tests/fixtures/trajectory-fence-current.test.ts tests/fixtures/trajectory-fence-current-arms.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts tests/fixtures/conservation-closed-lid.test.ts tests/perf/stress-shape.test.ts tests/render/budgets.test.ts tests/render/camera-easing.test.ts tests/render/feeding-pulse.test.ts tests/render/reduced-motion.test.ts tests/ui/speed-badge.test.ts tests/ui/placement-ring.test.ts tests/ui/diagnostics.test.ts tests/ui/observe.test.ts tests/worker/perf-counters.test.ts tests/worker/relationship-map-cost.test.ts tests/worker/relationship-map.test.ts
  → Test Files 20 passed (20); Tests 126 passed (126); 497 s (load 7.09 → 3.18)
npx vitest run tests/sim/profile-eviction.test.ts                  → Tests 3 passed (3) (Garden 239 s, reload 125 s, earlier stress variant 1,045 s)
npx vitest run tests/sim/profile-eviction.test.ts -t "stress world" → Tests 1 passed | 2 skipped (final stress variant, 474 s at load ~4.5)
npx vitest run tests/worker/relationships.test.ts tests/worker/protocol.test.ts tests/ui/dish-point.test.ts tests/worker/probes.test.ts tests/worker/host.test.ts → Test Files 5 passed; Tests 49 passed
npx vitest run (the 7 fast render/ui files after the last edits)   → Test Files 7 passed; Tests 39 passed
E2E_PORT=4282 E2E_OUTDIR=tmp/dist-perf2-polish npx playwright test tests/e2e/first-minute.spec.ts --project=desktop --project=phone-portrait
  → ✓ [phone-portrait] (36.1s) ✓ [desktop] (1.5m) — 2 passed (2.3m)
npx tsx tools/perf-stress.ts --hashes --stress-only   (before = HEAD copy; after = this tree; identical)
  {"stress":{"0":"417b122aac6a856d","600":"1e150b021dd1d232","1500":"f6bf01e1326455d5","3000":"621471caf21cfee8","9000":"8564b87b9251fd32"},
   "snapshotDigests":{"0":"f1e9f78e20836327","600":"31332f0ec6f57340","1500":"e439632697c5eeb1","3000":"c1bfb16f259065d7","9000":"9eff90221b401348"}}
node --expose-gc --import tsx tools/perf-stress.ts --ticks 9000 --out …   before CPU p50 11.95 / p95 22.47 (load 1.40→3.05); after 12.78 / 21.34 (load 2.13→2.49); endpoint 8564b87b9251fd32 both
node --expose-gc --import tsx tools/perf-stress.ts --ticks 24600 --snapshot-every 0 --no-stages --save-at -1 --hash-at 9000 --out …   before 0.95 %/min (late 0.26); after 0.83 %/min (late 0.09); endpoint a1a1b90af259e1aa both
npx tsx tools/perf-web.ts --out tmp/perf2/perf-web.json             → exit 0 (Garden 4× tick p50 13.6 ms, stress 1× 32.3 ms, 4× runs at 2.0×; taps p95 146.7 ms)
npx tsx tools/perf-web.ts --no-build --gc --skip-taps --skip-stress → exit 0 (worker 2.20 %/min, main 0.70 %/min over minutes 5–15)
E2E_PORT=4282 npx tsx tools/render-bench-run.ts                      → first run exit 1 (reducedMotion gate stale since D-0089, all viewports); after updating the gate: exit 0, all behaviour gates true
```

## FENCE notes

None. No fence value moved; no fence file was touched; Phase 4 adds no simulation rule (the src/sim edits are a derived-cache eviction and clearing module-level references, both proven hash-neutral).

## Bugs noticed elsewhere

1. src/ui/panels/LineageState.tsx:184 `placeSpecimenTap` draws a placement ring even when the spawn placed nothing (`res.accepted === 0`) — the same visible-feature-without-state bug this pass fixed in `reportCommand`. Fix: `if (res.accepted > 0) getRenderer()?.placementRing(...)` (not my file).
2. docs/UX_SPEC.md §7.4 "camera easing" row: the middle column still says "the camera has no easing in any mode"; with P4.13 that is true only in reduced motion. I edited only the As-built cell as assigned; the lead should change the middle column to "instant".
3. tools/render-bench.ts's reduced-motion gate had failed since wave 6b (D-0089 draws still effects in reduced motion); fixed here (my file) to check that nothing animates.
4. A refused placement changes stateHash (command sequence number and a 'command' event). By design, but worth knowing for future journeys that compare hashes around refusals.
5. tests/sim/profile-eviction.test.ts is slow (≈ 14 min under load, est. 6–7 min quiet; the stress case alone 474 s). The lead may prefer to trim the Garden case to one mode pair.

## PROPOSED DECISIONS

- PROPOSED DECISION: the relationship map's pool totals are summed only after the map is first opened for that dish in the session (the 'relationshipMap' request is the signal); the pools then say "Recorded since m:ss" until the window is covered; event-based arrows keep their full window. Chosen over "only active pools" (not built or measured) because it removes the whole cost when the map is never opened (watcher 0.23–0.30 → 0.06–0.07 ms/tick on the Garden) and its numbers equal the old ledger's over the seconds it covers.
- PROPOSED DECISION: the degrade ladder stops at the renderer in v1.0 (effects, stains, marker redraw, overlay/aggregation refresh); snapshot frequency, the worker and the simulation are never on it.
- PROPOSED DECISION: a refused placement draws no ring; with motion on the ring grows from 0 to the dose radius over 300 ms and fades by 700 ms; reduced motion keeps D-0089's 1 s still ring. UX §7.4 "deposit/placement ring" As-built note for the lead: "`src/render/features.ts: placementEffect, effectLook, PLACEMENT_STATIC_MS` (motion on since P4.13: 0 → dose radius in `PLACEMENT_EXPAND_MS` 300 ms, faded by `PLACEMENT_RING_MS` 700 ms; drawn only for an accepted placement, `src/ui/state.ts: reportCommand`)".
- PROPOSED DECISION: camera easing 220 ms ease-out cubic (zoom geometric) for player-initiated preset moves only (zoom buttons, +/−, whole dish, Find / go to, the inspector's reveal pan); wheel, pinch, drag and follow direct; a touch on the dish settles an unfinished move so input lands where the view is going; reduced motion instant.
- PROPOSED DECISION: `evictProfiles` runs inside `step()` every 600 ticks (memory only; derived, unsaved, unhashed); genome-table compaction stays an owner item.
- PROPOSED DECISION: the effective-speed badge on comparison and experiment screens measures ticks per real second on screen (their worker state has no effective speed); no protocol change.
- PROPOSED DECISION: `GHOSTS_MAX` 1,024 caps death dissolves (cosmetic; a mass die-off no longer grows the list without bound).
