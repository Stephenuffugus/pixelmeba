# Wave 10 · barrier-transport · build report

Task: the transport half of P5.2: barrier factors in ordinary diffusion, the S04 channel, the S08 resin and gate tallies, all in stage 2. Nothing is enabled (D-0104), with no schema or protocol bump. The fence is unchanged.

## Checklist

**Build**
- [x] 0. Nothing to do: wave 9's integration already fixed `classOf` (D-0115), and channel.ts uses it as it is.
- [x] 1. Barrier coefficients.
  - Code: src/sim/transport.ts `transportCache` (184), `applyBarrierFactors` (223), `filmCoefficients` (311) and `viralFilmCoefficients` (345); new TransportCache fields at 88–106.
  - The v1.0 loop and `kR[i] = Math.min(ki, kj)` are byte for byte unchanged.
  - Factors are applied only when `world.edges.length > 0`, and only on the edges in the store. An open S03 is skipped.
  - The viral pair is the same array as kR/kD unless an S01 exists.
  - Film halves the coefficient after the barrier factor (min × factor, then × 0.5).
  - The kernel picks its pair from `VIRAL_FIELD` (FIELD_DEFS barrier 'viral'). `diffuseField` is untouched.
  - Proof: tests/sim/barrier-transport.test.ts (15 tests).
- [x] 2. Gate tallies.
  - Code: src/sim/gateTally.ts. `gateEdgesOf` builds the edge list and is cached on TransportCache under item 1's key. `tallyFieldFlux` uses the kernel's expression on pre-step values. `gateOrganismsBefore` / `gateOrganismsAfter` run a DDA with the Y step first at an exact corner. `tallyOf` inserts records in id order.
  - Hooks: src/sim/tick.ts 32–34.
  - Proof: tests/sim/gate-tally.test.ts (11 tests).
- [x] 3. S04 channel.
  - Code: src/sim/channel.ts `channelStep` (80), `applyPools` (102) and `moveOrganisms` (172). It is called in transport.ts `stageEnvironment` right after the diffusion loop.
  - Proof: tests/sim/channel.test.ts (16 tests).
- [x] 4. S08 resin.
  - Code: src/sim/resin.ts `resinStep` (48), called after `filmStage` and before `neutralize`.
  - Proof: tests/sim/resin.test.ts (8 tests).
- [x] 5. Stage 2 order: climateStep → film coefficients → diffusion (barrier pairs, field tallies) → channelStep → gasExchange → decays → filmStage → resinStep → neutralize → updateDerived (transport.ts 529+).
- [x] 6. Constants (constants.ts, appended): `CHANNEL_POOL_FRACTION_PER_SECOND` 0.02, `CHANNEL_ORGANISM_TICKS` 10 and `RESIN_RATE_PER_SECOND` 0.05 (CT §12.2). Each per-tick amount is computed once at module level (channel.ts and resin.ts). `RESIN_CAPACITY` stays in devices.ts.
- [x] 7. Perf: script at tmp/barrier-transport-perf/perf.ts (not committed). Numbers below.

**Done when**
- [x] My five test files pass (54 tests in all).
- [x] The regression list passes except two wave 9 assertions that this wave's mechanisms make out of date. Both are in files I do not own; patches are below and verified on scratch copies.
- [x] `npx tsc -p tsconfig.json --noEmit` is clean, and eslint is clean on every changed file.
- [x] The fence is unchanged.
- [x] This report.

## Coefficient pairs and the cache key

| pair | contents | when |
|---|---|---|
| kR/kD | min(ki, kj), multiplied by `edgeFactor(code, 'dissolved')` on barrier edges | always (factors only when edges exist) |
| kRv/kDv | the same arrays as kR/kD (`===`) | no S01 in the store |
| kRv/kDv = kRvOwn/kDvOwn | min(ki, kj), multiplied by `edgeFactor(code, 'viral')` on barrier edges | at least one S01 |
| kRf/kDf | the film copy of kR/kD (×0.5 on every edge of a film cell) | film active |
| kRvf/kDvf | the film copy of the separate viral pair | film active and a separate viral pair |

- **Cache key:** `tc.version === grid.geometryVersion && tc.edgesRef === world.edges && tc.edgesLen === world.edges.length`.
  - The length was added to the specified identity key as cheap insurance; edgePassage.ts uses the same key.
  - The gate edge list (S01, S02 and S03 open or closed; S04 excluded) is rebuilt under the same key.
- **Dissolved vs activity:** the two factors are equal for every CT §5.3 code. A test pins this, and also pins that viral differs only on S01.

## Gates (D-0103)

| step | returns at once when |
|---|---|
| barrier factors | `world.edges.length === 0` (the v1.0 loop runs alone) |
| field tallies | `gateTallyOn`: no edges, or the world does not record 'barriers' |
| `gateOrganismsBefore/After` | same as field tallies |
| `channelStep` | no edges, no 'barriers', or no S04 |
| `resinStep` | no devices, no 'devices', or (per device) not an S08, an empty selection, or saturated |

## Writer contract (for structure-commands)

- Every command write to `world.edges` or `world.devices` bumps `grid.geometryVersion` exactly once. That covers place, remove, move, a shutter toggle and a new array.
  - The transport cache also catches a new array or a length change without a bump, but an in-place change to `open` does not change identity or length. Such a change needs the bump.
- Stage writes do not bump, and no cache keys on them:
  - `edge.nextOrganismTick` (channel.ts);
  - `device.bound` (resin.ts; its keys stay in RESIN_TARGETS order);
  - `world.gateTally`.
- The resin reads `device.cell`, `resinSelect` and `bound` fresh every tick. So a move or a selection change takes effect on the next stage 2 without any cache.

## Per-tick costs (item 7, indicative; 2 shared CPUs, other agents running)

The run is 2,000 ticks of clear water, 400 B01 at the start (about 350 alive at the end), and uniform sugar.

| world | mean tick | p95 | stage 2 | stage 2 share |
|---|---|---|---|---|
| (a) no edges or devices | 4.12 / 3.84 ms | 7.94 / 6.42 | 1.48 / 1.42 ms | 36–37 % |
| (b) 512 edges (S01 line, S02 line, alternating shutters, 8 channels, S02 D edges) + 8 resins | 5.38 / 4.96 ms | 10.77 / 7.85 | 2.21 / 2.00 ms | 40–41 % |

- Stage 2 costs about +0.6 to +0.7 ms with 512 edges. Most of that is the field tallies: about 455 gate edges × the active diffusing fields, each with a binary search into gateTally.
- The rest of the tick difference is wave 9's stage 4 edge checks plus the organism-tally scan.
- If the lead wants it cheaper: cache each gate edge's tally record index on the GateEdge list (rebuilt when gateTally's length changes).

## Tests and what they prove

**tests/sim/barrier-transport.test.ts**
- First-tick flux across the edge, relative to the open dish (relative tolerance 1e-12):
  - sugar: S01 0.25, S02 0.5;
  - v01: S01 0, S02 0.5;
  - v02: half of v01, then 0.5 of that through S02;
  - eStarch: S01 0.25, S02 0.5.
- Film beside an S01 gives 0.125. The viral film pair gives v01 0.25 through S02 + film.
- A closed S03 across the dish keeps the far side exactly 0 for 1,000 ticks.
- An open S03 leaves kR/kD byte-equal and every field byte-identical after 400 ticks.
- S04's coefficient is 0 in both pairs.
- The crossing sugarN/sugar ratio equals the source ratio.
- The factor table holds: dissolved = activity, and viral differs only on S01.
- Every barrier-'none' field has diffusion 'none', and detritus stays put.
- NEUTRAL: with edges [], kR/kD are byte-equal to a shipped-registry world's and to an independent min(ki, kj), and kRv === kR.
- With an S02 line only, the viral pair is aliased. With an S01 it is separate and 0 on the S01.
- Cache: a new array without a bump rebuilds (identity), and an in-place shutter toggle with a bump rebuilds.

**tests/sim/channel.test.ts** (pools are measured against a twin dish whose channel edge is a closed S03)
- The destination gains exactly 0.002 × snapshot and the source loses the same; the gain is tallied.
- flow −1 reverses the direction.
- Sugar at the destination never comes back through the channel.
- No multi-hop: in the chain A→B→C, C stays exactly 0.
- Activity (eStarch, breaker), deposits and film never move.
- v01 and v02 move 0.2 % per tick.
- Companions keep their ratio, and inhibitors, salt and oxygen ride along.
- Organisms:
  - a B01 moves with every column except x unchanged, and the same in-cell fraction;
  - the second B01 waits 10 ticks (nextOrganismTick 10, then 20; tally 2);
  - the lowest birthId goes first, not the lowest slot (slot reuse);
  - never moved: P01, an attached B02, an unflagged B02, an E12-linked B01, an X01 on an A01, and a constructed X01-on-B01 pair (proves the host/parasite rule alone);
  - a free X01 is moved;
  - a resting E03 B01 is moved and stays Resting;
  - nextOrganismTick stays absent when no organism ever moved.
- Saves: a save while the channel waits, loaded and run 400 ticks, gives an equal stateHash and an equal gateTally, and the import accepts it.
- Conservation: 2,000 closed-lid ticks with three channels keep relErr < 1e-5 at every 500-tick check.

**tests/sim/resin.test.ts**
- With inhBact held at 1.0, the bound amount grows by 0.005 per tick until 5 (999–1,001 ticks). Then the field is byte-unchanged by `resinStep` and the bound amount stays fixed.
- The bound sum stays ≤ 5 + 1e-9 every tick.
- The import accepts round trips at a partial bound (tick 400) and at saturation.
- With two targets the budget splits 0.75 / 0.25, and the last target takes the exact remainder.
- An unselected inhPhoto is untouched.
- Bound keys stay in RESIN_TARGETS order.
- Activity below the budget is taken whole, never below 0.
- rival is skipped in a world without 'rivalry'.
- A selection of [] does nothing.
- computeTotals c/n/m are bit-equal before and after.
- A device moved in place works at its new cell.

**tests/sim/gate-tally.test.ts**
- S02 line, closed lid, flow checked one-way every tick: the far-side sugar equals the summed tally (relative 1e-12).
- A closed S03 tallies nothing. An S04 is not in the diffusion tallies. Channel moves are tallied (sugar and 1 organism).
- Over 1,500 ticks, B01 tally crossings equal an independent count of side changes, with crossings on both the S02 and the open-S03 parts.
- An exact-corner diagonal counts the Y edge, then the X edge, and not the other L-path's edge.
- An S01 line: 0 side changes and 0 tally crossings over 3,000 ticks, while sugar is tallied.
- A host and its parasite crossing together count 2.
- A reused slot (birthId changed) is not counted.
- Two worlds that differ only in gateTally have equal stateHash.
- No barriers means gateTally stays [], under both the shipped and the barrier registry.
- Save at 777, load, run to 2,000: gateTally and stateHash are deep-equal.
- Records stay sorted with ids below nextDeviceId.

**tests/sim/barrier-transport-determinism.test.ts**
- The dish has an S01 line, S02 gates, closed and open shutters, two S04 with opposite flows, two resins, 40 B01 + 4 P01, v01, sugar and inhibitors.
- run(400) equals 4 × run(100) (stateHash, full digest, gateTally).
- Save at 777, load, run to 3,000 matches the uninterrupted run (hash, digest, gateTally), and the import accepts round trips at 0, 777 and 3,000.
- A channel waited and the resins bound activity during the run.
- The S01 and closed-S03 tallies stay at 0 organisms.
- 10,000 closed-lid ticks: worst relErr < 1e-5 and absolute residual < 1e-8.
- NEUTRAL: with edges and devices [], entity columns and fields are byte-identical to the shipped-registry run after 2,000 ticks, and no gateTally record is created.

### Mutants (applied by hand, run, reverted; `cmp` confirmed every source restored)

| mutant | failing test |
|---|---|
| S02's factor on every coefficient once edges exist | barrier-transport "open S03 … byte-equal" |
| ×edgeFactor(EDGE_NONE) on every cell, edges [] included | **survives: an equivalent mutant**, because x × 1 === x exactly in IEEE 754. The "no extra float op" rule is held by the code shape: the block runs only under `edges.length > 0` and only on store edges. |
| cache keyed on geometryVersion alone | barrier-transport "replacing world.edges … identity key" |
| viral pair aliased while an S01 exists | barrier-transport "v01: 0 through S01" and "v02 …" |
| channel reads live values instead of the snapshot | channel "no multi-hop" |
| channel moves activity fields | channel "activity fields and deposits never move" |
| channel eligibility reduced to `true` | channel "never moved …" (and "nextOrganismTick absent") |
| link rule removed | channel "never moved …" (E12-linked B01) |
| host/parasite rule removed | channel "never moved …" (constructed Small-host pair) |
| nextOrganismTick not set | channel "a second B01 waits 10 ticks" |
| resin without the remaining cap | resin "held at 1.0 … never exceeds 5" |
| tally after diffuseField (post-step values) | gate-tally "far side's gain equals the tally" |

## Commands and results

- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts` plus my five files → **Test Files 13 passed (13), Tests 116 passed (116)** (01:54 UTC, 813 s).
  - An earlier fence-only run gave **8 passed, 62 tests passed**.
  - The determinism file was edited during the combined run (a stronger S01 assertion), so it was re-run alone afterwards → **4 passed**.
- `npx vitest run tests/sim/barrier-transport.test.ts` → 15 passed; `tests/sim/channel.test.ts` → 16 passed; `tests/sim/resin.test.ts` → 8 passed; `tests/sim/gate-tally.test.ts` → 11 passed.
- Regression list → **21 files passed, 2 failed (269 tests passed, 2 failed)**:
  - tests/sim/{transport,barriers-table,world-stores-5,chemistry,movement-births-tick};
  - wave 9's nine files;
  - tests/fixtures/{transport-obstacles,film,phage,conservation-all-pools,fungal-transport,producers,photosynthesis};
  - tests/persistence/{phase5-import,migration-schema5}.
  - The two failures are below.
- `npx tsc -p tsconfig.json --noEmit` → clean.
- `npx eslint` on the 11 changed or created files → clean, after `--fix` removed two unnecessary `!` in channel.test.ts.

## Fence notes
- No fence value moved, and fence-update was not run.

## Two wave 9 tests to update (lead; files I do not own)

Both now fail only because this wave's mechanisms exist. Both patches were verified on scratch copies under tmp/bt/verify: 2 files, 21 tests passed.

1. **tests/sim/barrier-movement.test.ts** "S04 one-way channel edge (D-0106) › is closed to ordinary movement in both directions".
   - The live channel now carries the left B01 (source side) east by its directed transfer, which is correct under SPEC §4.9.
   - Patch line 236: hold the transfer off so only ordinary movement is under test:
     ```ts
     pushEdges(w, verticalLine('S04', 63, 0, 127, { flow: 1, nextOrganismTick: 1_000_000_000 }));
     ```
2. **tests/sim/world-stores-5.test.ts** "4× equals 1×".
   - `expect(a.gateTally).toEqual(TALLY)` fails because this world records 'barriers', so its tallies keep counting (observation only).
   - Replace it with:
     ```ts
     expect(b.gateTally).toEqual(a.gateTally);
     for (const t of TALLY) {
       const now = a.gateTally.find((g) => g.id === t.id)!;
       expect(now.organisms).toBeGreaterThanOrEqual(t.organisms);
       for (const [k, v] of Object.entries(t.fields)) expect(now.fields[k as keyof typeof now.fields]!).toBeGreaterThanOrEqual(v);
     }
     ```

## Bugs noticed elsewhere
- None found in wave 9's movement: the S01, closed-shutter and S04 crossing counts are 0 in every run above.
- edgePassage.ts was not changed.

## Proposed decisions

1. **PROPOSED DECISION: film halves the barrier-adjusted coefficient** (min × factor, then × 0.5). SPEC §4.1 states both rules and does not order them; multiplication commutes in value, and this order fixes the bits.
2. **PROPOSED DECISION: the channel's eligible pools** are every field of barrier class 'dissolved' or 'viral' that diffuses:
   - sugar, sugarN, broth, brothN, metabolite, nutrient, oxygen, co2, acid, base, buffer, salt, the three inhibitors, silicate, v01, v02;
   - never activity fields, deposits, film or objects (SPEC §4.9 "every eligible dissolved/viral pool").
   - Oxygen and CO2 are included: they are dissolved, and the closed-lid ledger is unaffected because oxygen is not material and CO2 moves internally.
3. **PROPOSED DECISION: one organism per transfer.** A host carrying a parasite, and a parasite on a host, are not free. The tally counts organisms, not units: an attached parasite moved with its host counts as its own crossing.
4. **PROPOSED DECISION: a resting organism rides the channel** passively, in any life state.
5. **PROPOSED DECISION: lowest birthId first.** It is stable through sample remaps, which change slots.
6. **PROPOSED DECISION: the transport cache key includes the edges store's length**, as well as its identity (the same key as edgePassage.ts). It is cheap insurance against an in-place push without a bump. An in-place `open` change still needs the bump.
7. **PROPOSED DECISION: an organism that one channel moved this tick cannot be moved by another** (organisms, like pools, have no multi-hop). Candidates are listed per source cell from positions before any move.
8. **PROPOSED DECISION: the exact integer offset keeps the in-cell position bit for bit** whenever the sum stays in one binade. If x + 1 would round up into the next cell (x within one ulp below a power of two), x is put at the largest value inside the destination cell (channel.ts `shifted`). No test world reaches it.
9. **PROPOSED DECISION: the channel's per-pool cap is implemented but unreachable in practice.** A cell has at most four edges, so its requests total at most 0.8 % of the snapshot.
