# region-charts-gates build report (Phase 5 wave 11, stage 2, port 4274)

Nothing is enabled (D-0104). No schema or protocol bump. Fence unchanged. No stage 1 file edited.

## Checklist

### Build
1. **Boundary pools.** DONE. src/worker/probes.ts:88 `PROBE_BOUNDARY_FIELDS` = the 8 old pools + `salt`, `silicate` (means unchanged); :108 `MOVED_ONLY` = sugar, broth, salt, silicate; :93 `PROBE_DECAYING_FIELDS` (inhBact, inhFung, inhPhoto, eStarch, eOil, eProtein, breaker, sGlow, quencher, rival, v01, v02) appended to `boundary` when the world has the field, always `notMeasured` with `why: 'decays'`, or `'resin'` (S08 with a non-empty resinSelect on a region cell selecting the field; resin wins; :682 `resinFieldsIn`). Gases keep the lid rule and now carry `why: 'gas'`. `why` is absent on measured/absent entries and on deposits/debris. Proof: probes-gates "salt and silicate are measured; …" and "with the lid open the gases say why".
2. **Organism crossings per species.** DONE. probes.ts:551 `crossings()`; membership by a per-cell 6-bit mask built at `set()`; matched by slot AND birthId; re-slotted organisms (Sample Transfer/Cancel) matched by birthId through a per-call `gone` map and a `held` map kept while a sample is held. Called twice per tick: from the stage hook after stage 4 and from `afterTick` (see PROPOSED DECISION 2). Per region per second: `entered[species]`, `left[species]` (Int32Array, allocated at the first crossing). Reading: `crossings: { species, entered, left }[]` over the window; `recordedSinceSecond` as the boundary record. Proof: probes-crossings (4 tests), probes-gates S02 test.
3. **Per-gate totals.** DONE. probes.ts:169 `ProbeGate`, :651 `readGates`; `ProbeReadings.gates` ([] without edges). Window from per-second copies of world.gateTally (`sampleGates`, :536, at whole seconds only, retained 601 s), null until a full second is recorded. Proof: probes-gates membrane and S04 tests.
4. **Per-second series.** DONE. `ProbeReading.series` (probes.ts:136, built :739): `seconds`, `total`, `biomass` (sampled after the second's last tick), `pools: { field, into[] }` for every pool the reading reports `measured`; bounded by MAP_RETAIN_SECONDS; Undo/rollback drops later seconds (SecondRecord.restoreTo). Proof: probes-gates membrane test (series sum = window total), probes-crossings Undo test.
5. **GateReading.** DONE. src/sim/objectives.ts:146 `WORLD_GATES` { transferred, organisms }; :121 optional `organisms?` on the interface; :387 and :451 default `gates = WORLD_GATES`. Proof: tests/sim/gate-reading.test.ts (4 tests); objectives.test.ts and goals-host.test.ts pass unchanged.
6. **Probe sheet charts.** DONE. src/ui/panels/ProbeCharts.tsx (new), probeCharts.css (new, imported by ProbeCharts.tsx, which ProbePanel.tsx imports), ProbePanel.tsx:124, src/ui/observe.ts:248-420 (pure helpers), src/ui/strings/observe.ts (new copy and names). Proof: tests/ui/probe-charts.test.ts, region-charts.spec.ts on desktop and phone-portrait.
7. **Read-only proof.** DONE. probes-gates "six regions read every 10 ticks over 2,000 ticks": equal stateHash, `trajectoryDigest 'full'`, `JSON.stringify(gateTally)` (not hashed, so checked separately) and `climate`, on a dish with S01, S02, S04, an S08 and 13 Sprinters.
8. **Perf.** DONE (scratch script tmp/region-charts-gates/perf.test.ts, not committed; contended 2-CPU machine, indicative): six regions (one the whole dish), 500 Sprinters placed (527 alive at the end), 1,000 measured ticks after 200 warm-up:
   - crossings (stage-4 pass + afterTick pass together): mean 245 µs, p95 572 µs per tick (first run before a micro-optimisation: mean 347, p95 547);
   - afterTick alone: mean 117 µs, p95 173 µs;
   - the stage 1+2 boundary sums (existing code, now 10 pools): mean 1.65 ms, p95 6.0 ms per tick — dominated by the whole-dish region; the two new pools add 2/8 of the old cost. Only while regions exist.

### Done when
- Four unit files pass; tests/worker/{probes,goals-host,challenge-host,relationship-map}.test.ts, tests/sim/objectives.test.ts, tests/ui/observe.test.ts pass: DONE (`Test Files 10 passed (10)`, `Tests 90 passed (90)`).
- tsc and eslint: DONE (both exit 0 on every changed file).
- Journeys on desktop and phone-portrait: DONE (`12 passed (26.6m)`: region-charts, observe ×4, observe-tools on both projects).
- FENCE unchanged: DONE (`Test Files 8 passed (8)`, `Tests 62 passed (62)`, 1,348 s).
- Report items: below.

## Reading shape as built (new fields)
- `ProbeBoundary.why?: 'gas' | 'decays' | 'resin'`.
- `ProbeReading.crossings: readonly { species, entered, left }[]` (world species order, species with none left out).
- `ProbeReading.series: { seconds: number[]; total: (number|null)[]; biomass: (number|null)[]; pools: { field; into: (number|null)[] }[] }`.
- `ProbeReadings.gates: readonly ProbeGate[]`, `ProbeGate = { id, kind: 'S01'..'S04', cell, dir, regions: ProbeId[], sinceStart: GateAmounts, window: (GateAmounts & { recordedSinceSecond: number | null }) | null }`, `GateAmounts = { fields: { field, amount }[] (FIELD_IDS order, only fields with an amount > 0 in the cumulative record), organisms }`.
- boundary list order: the 8 old pools, salt, silicate (always; 'absent' when missing), then the decaying pools the world has.
- A v1.0 dish: probes-gates "a v1.0 dish" compares against a golden made by HEAD's probes.ts (`git show HEAD:src/worker/probes.ts`, scratch run): every old key and the first 8 boundary entries deep-equal; `gates: []`; salt `measured` 0 (every shipped world allocates salt), silicate `absent`, then 12 decaying entries `notMeasured`/'decays' (every shipped world allocates them). With the lid open a v1.0 gas entry also gains `why: 'gas'`.

## GateReading semantics
`WORLD_GATES.transferred(world, gate, field)`: the edges of world.edges with `kind === gate`; none → null ("this dish has no such gate", the goal is not offered, as before); else the sum in store order of `world.gateTally[id].fields[field] ?? 0` (read-only binary search; never `tallyOf`, which inserts). `organisms(world, gate)` the same for crossings. Cumulative |flux| in either direction, field units (D-0117). Removing a gate removes its share (the watch's moved value can fall; a fall never completes a goal). Resumed goals count from the load (pinned by gate-reading "resumed after buildSaveFile → loadSaveFile").

## Crossing rule
An organism counts as entering/leaving region R when its R-membership (cell under floor(x), floor(y)) differs between two consecutive baselines and it is the same organism (same slot and birthId, or the same birthId after a re-slot by Sample Transfer/Cancel). Baselines: after the previous tick → after stage 4 → after the tick. Births, introductions, deaths and discards are never crossings. Words: "entered", "left".

## Tests and what each proves (each mutant reverted; files byte-identical to the backup afterwards)
- tests/worker/probes-gates.test.ts (7): membrane E207/E209 measures; S02 organisms = region entries + leaves; S04 channel totals; salt/silicate measured and decaying reasons; lid-open gas reason; v1.0 golden; read-only proof.
- tests/worker/probes-crossings.test.ts (4): births/deaths/discard not crossings; reused slot not a crossing; Transfer counts (held across ticks too), overlapping regions independent; Undo drops later seconds; 60/180/600 s windows equal differences of the cumulative record.
- tests/sim/gate-reading.test.ts (4): offered and completes at the exact tick; v1.0 dish refused; only the named kind, removal removes the share; resume counts from the load.
- tests/ui/probe-charts.test.ts (7): polyline scaling (min/max, flat, single point, nulls, zero baseline), table rows = series, words for every status/why, crossings, gate groups, forbidden words (incl. migrated/fled/chose).
- Mutants: salt left out of MOVED_ONLY → probes-gates "salt and silicate…" fails ("salt: expected 'notMeasured' to be 'measured'"); rival reported measured → same test fails; reused slot counted → probes-crossings "a slot reused…" fails; WORLD_GATES summing every kind → gate-reading "a v1.0 dish…another kind" and "sums only…" fail; default gates left null → gate-reading "is offered…" fails ("expected 'this dish has no such gate' to be null"); probes writing a field → read-only test fails (stateHash differs).

## Commands
- `npx vitest run <fence>` → `Test Files 8 passed (8)`, `Tests 62 passed (62)`.
- `npx vitest run <4 new files + probes, goals-host, challenge-host, relationship-map, objectives, observe>` → `Test Files 10 passed (10)`, `Tests 90 passed (90)`.
- `E2E_PORT=4274 E2E_OUTDIR=tmp/dist-region-charts-gates npx playwright test tests/e2e/region-charts.spec.ts tests/e2e/observe.spec.ts tests/e2e/observe-tools.spec.ts --project=desktop --project=phone-portrait` → `12 passed (26.6m)`; port stopped after.
- `npx tsc -p tsconfig.json --noEmit` → exit 0; `npx eslint <13 changed/new files>` → exit 0.

## Files
New: src/ui/panels/ProbeCharts.tsx, src/ui/panels/probeCharts.css, tests/worker/probes-gates.test.ts, tests/worker/probes-crossings.test.ts, tests/sim/gate-reading.test.ts, tests/ui/probe-charts.test.ts, tests/e2e/regionFixture.ts, tests/e2e/region-charts.spec.ts, this report.
Changed: src/worker/probes.ts, src/sim/objectives.ts (WORLD_GATES, the optional `organisms?` on GateReading, the two defaults), src/ui/panels/ProbePanel.tsx, src/ui/observe.ts, src/ui/strings/observe.ts, tests/worker/probes.test.ts (one line, see below). Not changed: goals.ts, ProbeSession.tsx, host.ts, challenge.ts, protocol.ts, every stage 1 file.

## FENCE
No fence value moved; nothing to report.

## Outside my list
- tests/worker/probes.test.ts (the existing probes test; not on my "new" list): one line. Its whole-dish boundary check lists the measured pools; salt is now measured in every shipped world, so `'salt', 'silicate'` were added to that list. No assertion weakened.

## Bugs / notes elsewhere
- **Notebook resume of a gate goal.** objectives.ts `objectiveRefsProblem` (the save file's notebook check, persistence/notebookGoals.ts) still returns "this dish has no such gate" for every transferAcrossGate goal, so a running gate goal in a saved notebook is dropped at load. No shipped objective uses transferAcrossGate, so nothing reaches it today. For P5.6: give the notebook check a gate reader (WORLD_GATES needs the world, or record the dish's edge kinds in ObjectiveWorldRefs) and save the base amount in the goal progress (NOTEBOOK_VERSION).
- objectives.ts's header comment still says "This build has no gate structure"; I left it (only WORLD_GATES and the defaults are mine).
- On a 360 px phone, in the imported fixture dish, the region drawing panel (`probe-session`) measured 288 × 286 px over the dish's upper half (y 127–412), so a drag starting there hits its buttons; the journey draws in the lower half. observe-tools' drags are in the lower half too. Worth a look at the a11y/polish pass (styles.css is structure-ui's this wave).
- Under contention the boundary sums with a whole-dish region cost about 1.6 ms per tick (existing P4.8 code; now 10 pools). P4.13-style fix if wanted: sum only active fields (`world.derived.fieldActive`), since an inactive field is exactly zero.

## PROPOSED DECISIONS
1. **Decaying pools are never boundary totals** (contradicts g5-briefs line 107, which assumed only the resin case): transport.ts decays every activity field and both viruses in stage 2, so a change across stage 2 is not transport for any of them; reported 'notMeasured' with why 'decays', or 'resin' where an S08 selecting it sits in the region (resin wins). Gases with the lid open carry why 'gas'. Deposits and debris keep no why (the sheet's general line covers them, and the v1.0 shape is kept).
2. **Crossings are compared twice per tick** (after stage 4 and after the tick), not only after the tick: a division in stage 9 gives the dividing slot new birthIds, so an organism that crossed in stage 4 and divided (or died in stages 5–7) in the same tick would otherwise be lost. With it, region entries + leaves equal the S02's tallied organisms exactly (probes-gates). Moves in stages 5–10 are still caught by the second pass.
3. **Transfers are matched by birthId** (a Sample Transfer gives new slots): the organism counts as leaving/entering relative to where it was taken; while held across ticks it keeps its pre-take membership; a Discard is a removal, not a leave.
4. **The sheet sums gates per kind** ("Fine membrane · 120 edges: Since the dish began: Sugar 3.20; 0 organisms crossed. In the last 60 s: …"), not one line per edge: a membrane line is up to 512 edges; per-edge totals live in the gate inspector (CellInspect edges, structure-ui). The worker's reading keeps one ProbeGate per edge.
5. **The gate window is the change of world.gateTally between whole-second copies** (session state, retained 601 s): start = the copy at the window's first second, or the first copy after it ("Since m:ss" when later); end = the live tally. Null until a full second is recorded.
6. **GateReading semantics** as above: cumulative |flux| either direction, summed over the current edges of the named kind; a removed gate's share leaves the sum; a resumed goal counts from the load (exact resume: P5.6, NOTEBOOK_VERSION).
7. **Screen readers get the table by default**: while charts show, the SVGs are aria-hidden and the same captioned table is in the page as sr-only; "Show as table" shows it visibly. The table sits in a focusable, labelled scroll region so a phone never scrolls sideways.

No NEEDS lines: nothing was missing from stage 1.
