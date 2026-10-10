# g3-fixtures build report (wave 4, stage 1)

All three G3 gate fixtures are built and pass. The relationship matrix has 711 rows and every row agrees with the catalog. No bug was found. No fence value moved. No src/** or content/** file was changed.

## Checklist

### Build
- **0. Doc parsers (W5-18): DONE.** These are in `tests/helpers/tables.ts`, additive from line 72 on:
  - `expandIds` :113. It expands ranges written with an en dash.
  - `dietTable` :143. Reads the CT §3.1 prose. Keeps `(+film)`, photosynthesis, "when no meal" and the `E08 carriers` row.
  - `preyTable` :176. Reads the CT §3.2 rows whose first cell is "ID Name". Keeps `free`, `while in sediment` and `within 1 cell`, and drops parenthetical notes.
  - `hostTable` :211. CT §3.3: verb, targets, drain and minimum film.
  - `inhibitorTable` :243. CT §3.4, keyed by field name.
  - `filmDigesters` :251. CT §3.5.
  - `moduleTable` :270. CT §7.1: eligible ancestors, plus `notNative` from "(not native …)". E15's "E12‑eligible bacteria" gives no ancestors.
  - Also added:
    - `materialTable` :301 (CT §5.1/§5.2).
    - `enzymeRules` :327 (SPEC §5.3 products, producers and rate).
    - `identityTable` :359 (CT §1.1 "(attached)").
  - The parsers are checked by `tests/fixtures/relationship-matrix.test.ts:40-90`. Two of those checks: §3.1 `(+film)` must equal §3.5, and P02 must not list B02 (that is a note).
- **1. Relationship matrix: DONE.**
  - `tools/relationship-matrix.ts` `runMatrix` :637 builds one tiny deterministic world per row under the shipped registry. Observations come from the simulation's own stages, and expectations come only from the docs.
  - Families:
    - diets :221 (stage 6, only that food present, three passes; film eaten as detritus, D-0038; E08 carriers)
    - prey :282, with four variants: home ground, sediment, a real E04 anchor beside a stone (D-0055), and the attached flag (labelled test state)
    - hosts :313 (X01: one stage-5 pass; V01: 1000 units, up to 10 passes)
    - inhibitors :357 (stage 7 inhibitor damage)
    - enzymes :395 (exact `min(s, 0.10 × a/(1+b) × dt)`, product and proportional N; breaker)
    - producers :439 (stage 8 `secreting` equals `PRODUCER_BIT` and only its own activity rises; natives B06/F02/B07/B08 plus B01+E01 and B04+E09)
    - modules :485 (`validateModuleSet` and `eligibleGains` agree with CT §7.1, natives excluded)
    - materials :550 (each enabled material through its tray command changes exactly the field, layer or object that CT §5 names; pellet and wafer then release at CT's rates with 0.10 N/C)
  - The CLI writes `docs/reports/relationships-g3.md`: row, expected, observed, pass and source, with counts by family.
  - The test is `tests/fixtures/relationship-matrix.test.ts`. It checks coverage (:109), that no family is vacuous (:133), one `it` per family (:141), and runtime ≤ 90 s (:104). `KNOWN_BUGS` is empty.
- **2. conservation-all-pools: DONE.**
  - Test: `tests/fixtures/conservation-all-pools.test.ts:208`; the dish is built by `build()`.
  - Setup: a closed lid. Everything is placed through the Lab commands or labelled test state, and then the ledger is re-based.
  - Contents:
    - B02 on gel, plus E10 B01s
    - F01 on debris, plus an F02 chain of 4 with transport links (donor B = 4)
    - X01 on A01, plus E07 A01s
    - V01 dosed onto a B01 colony
    - B06, B07 and B08 on their deposits, with M09 breaker over the oil
    - an M10 pellet and an M11 wafer
    - stones, walls, beads, gel and sediment
    - P01–P04, B03 (low-oxygen sediment), Y01, B04 and B05
    - E04 B01s beside a stone and an E12 B01 cluster
  - Run: 10,000 ticks. Every 100th tick it checks:
    - `checkLedger` C, N and M < 1e-5
    - inputs and exports unchanged
    - `exchangeC` 0
    - `inactiveFieldsNonZero` empty
  - It also asserts a tighter tripwire of 1e-9 relative (see notes).
  - Non-vacuity asserts:
    - film > 0
    - F02 transfer > 0
    - infections ≥ 1 and lyses ≥ 1
    - parasite drain ticks > 0
    - each enzyme converted > 0
    - pellet and wafer released > 0, and at least one emptied
    - captures > 0
    - adhesion links > 0
    - births and deaths > 0
    - life lasts at least to tick 5,000
    - peak population < 1,000
- **3. transport-obstacles: DONE.** All in `tests/fixtures/transport-obstacles.test.ts`:
  - **Pulse :60.** Sugar plus sugarN, run for 1,000 full ticks:
    - sum constant to 1e-12
    - the maximum never rises, and falls more than 100× overall
    - no negative cell
    - N/C stays 0.1 in every cell
  - **Wall and stone rings :241.** Built with the Lab command, radius-1 brush.
    - Sugar, eStarch and v01 sit inside and broth outside. Outside or inside sums are exactly 0, checked every 10 ticks for 1,000 ticks.
    - B01, P02, X01 and B05 are placed on both sides: zero crossings, no organism in a structure cell, and every newborn on its parent's side.
    - No infection outside.
    - Non-vacuity: 1,599 moves, 32 births and 6 infections inside.
  - **Bead ring :264.** All three field classes pass the beads; no swimmer crosses.
  - **Film :277.** One transport step, exact: the flux across a film cell's edges is half the open-water control. Film in the neighbour halves only the shared edge.
  - **Sampling :330.** `sampleTake`, `sampleTransfer` and `sampleDiscard` through `applyNow`:
    - take and transfer leave totals, inputs and exports unchanged (a move, not a copy)
    - the discard's export delta equals `sampleTotals` of the held sample, bit for bit
  - **Clean water :376, at 25, 50 and 100 %.**
    - Exports equal the removed dissolved C and N, plus the CO2 removed.
    - Inputs equal the CO2 added back to the habitat baseline.
    - O2 and CO2 sit at baseline afterwards.
    - Life, deposits and objects are untouched.
    - The ledger closes, also after 50 more ticks.

### Done when
- **The three files pass: DONE.**
  - relationship-matrix: 15 tests pass. 711 rows, 711 pass, 0 fail. Runtime is 6–36 s depending on load (the `it` asserts < 90 s).
  - transport-obstacles: 9 tests pass, 19.7–24 s.
  - conservation-all-pools: 1 test passes, 66–206 s depending on load (load average 6 on 2 CPUs). It takes about 23 s in plain tsx at 2.3 ms per tick, so it is **over the 60 s target under vitest on this loaded machine**.
- **docs/reports/relationships-g3.md generated: DONE** (`npx tsx tools/relationship-matrix.ts`). Its header records the contentHash it ran against. **g3-evidence should regenerate it after the lead commits**, because another builder's in-flight content edit changed the hash while I worked.
- **Every failing row reported: none fail.** `KNOWN_BUGS = {}`.
- **Each fixture fails when its mechanism is removed: DONE.** I ran load-time mutants under `tmp/fx/mutants/`. Each one is a `vi.mock` of one module, with the real test file imported; the config is `tmp/fx/mutants/vitest.config.ts`. Every mutant was killed:

| Mutant | Fixture | Result |
|---|---|---|
| `preyAllowed` treats "free" as any | matrix | prey fails (attached-flag rows: P02 × B06/B07/B08) |
| every species digests film (`orderedFilmRequest`) | matrix | diets fails (10 film rows) |
| every species reads `inhBact` (`inhibitorExposure`) | matrix | inhibitors fails (15 rows) |
| `moduleSetProblem` ignores ancestor lists | matrix | modules fails |
| `ENZYME_CONVERSION` 0.2 | matrix | enzymes fails (6 rows) |
| lysis leaks one unit (0.01 C) | conservation | ledger open at tick 300 |
| F02 transport pass does nothing | conservation | non-vacuity fails (fungal transfer 0) |
| `transportOpen` ignores walls and stones | transport | wall and stone rings fail |
| swimmers may enter structure cells (`habitatCompatible`) | transport | all three rings fail (crossings, organisms in structure cells) |
| sample discard not exported (`recordExport`) | transport | sampling test fails |

  - Not mutated: the film flux rule (`filmCoefficients` is internal to transport.ts) and the pulse. Both assert exact equalities against an open-water control or invariant, so a factor of 1 would fail.

## Files
- New:
  - `tools/relationship-matrix.ts`
  - `tests/fixtures/relationship-matrix.test.ts`
  - `tests/fixtures/conservation-all-pools.test.ts`
  - `tests/fixtures/transport-obstacles.test.ts`
  - `docs/reports/relationships-g3.md` (generated)
  - this report
- Shared, additive only:
  - `tests/helpers/tables.ts`: the parsers above.
  - `tests/helpers/world.ts`: `placeWith(world, speciesId, x, y, modules, state)` at :133, the module-carrying `place`.
- Scratch, gitignored: `tmp/fx/**` (mutants, logs, profiler scripts).

## Commands and results
- `npx vitest run --maxWorkers=2 tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/relationship-matrix.test.ts tests/fixtures/conservation-all-pools.test.ts tests/fixtures/transport-obstacles.test.ts`
  - Result: `Test Files 1 failed | 9 passed (10)`, `Tests 1 failed | 73 passed (74)`.
  - The one failure was a wall-time assertion I had put in conservation-all-pools (205 s against < 120 s while the e2e suites ran). I removed it; wall time is now reported, not asserted. Rerun: `npx vitest run tests/fixtures/conservation-all-pools.test.ts` gave `Test Files 1 passed (1)`, `Tests 1 passed (1)` (143.6 s under load average 6).
- conservation-all-pools output:
  - Worst relative error C 6.13e-15, N 7.05e-14, |M| 0.
  - Peak 155 alive; last alive at tick 5,500; 308 births, 406 deaths.
  - Film max 54.75 C.
  - F02 transfer max 0.04 C per second.
  - 21 infections, 17 lyses.
  - 40,263 drain ticks, 295 captures, 5 adhesion links.
  - Converted: starch 1.41, oil 2.60, protein 2.31 C.
  - Pellet and wafer both released all 10 C and both emptied.
  - Roundoff: C 1.4e-14.
- `npx tsx tools/relationship-matrix.ts` gave: 711 rows, 711 pass, 0 fail, written to `docs/reports/relationships-g3.md`.

| Family | Rows | Pass | Positive relationships |
|---|---:|---:|---:|
| diets | 189 | 189 | 25 |
| prey | 184 | 184 | 91 |
| hosts | 36 | 36 | 2 |
| inhibitors | 54 | 54 | 13 |
| enzymes | 12 | 12 | 6 |
| producers | 18 | 18 | 6 |
| modules | 190 | 190 | 61 |
| materials | 28 | 28 | 28 |

- `npx eslint` on my six files: clean.
- `npx tsc -p tsconfig.json --noEmit`: clean for my files. It reports one error that is not mine: `tests/e2e/field-guide.spec.ts(33,7)` TS4114, from another stage-1 builder's in-flight file. An earlier run also showed `tests/content/guide.test.ts(95,83)` from the same in-flight work.
- E2E: none needed, none run.

## FENCE
None. No src or content was changed, and no fence file was touched.

## Bugs noticed elsewhere
None in the simulation: every catalog relationship holds.

## Notes for the lead
- **Ledger tolerance vs. CO2.** In a Water Garden about 5,600 C of the dish's carbon is dissolved CO2. SPEC §3.4's 1e-5 relative tolerance is therefore about 0.06 C, more than six viral units, so a small leak passes the gate criterion. conservation-all-pools also asserts 1e-9 relative (measured about 1e-14). The G0 closed-lid fixture has the same blind spot.
- **Runtime of conservation-all-pools.** The cost is transport: about 18 active fields diffusing every tick, and v01 never decays to 0. Under vitest on this machine it is 2.5–9× slower than plain tsx (23 s). On an idle machine it should be near 60 s. If the full suite needs it shorter, the lever is CHECK_EVERY, not the dish.
- **Positive coverage is limited by the Phase 3 manifest.** Hosts have only 2 positive rows (X01→A01, V01→B01), and the "free" rule is only observable through the labelled attached flag, because no enabled free-listed prey (B06–B08) can be attached in a shipped dish.
- **Population collapse.** The dish dies out by about tick 5,500. Founders age out, food is finite and the lid is closed. That is a valid outcome; the ledger is checked across the whole run.

## Proposed decisions
- PROPOSED DECISION: The G3 relationship evidence is `tools/relationship-matrix.ts` run under the shipped manifest. Its expectations come only from the docs (CT §1.1, §3.1–§3.5, §5, §7.1; SPEC §5.3), via `tests/helpers/tables.ts`. A failing row is never weakened; it would be listed in `KNOWN_BUGS` with an it.fails and a bug id. g3-evidence copies `docs/reports/relationships-g3.md` after the final wave 4 commit, and regenerates it if contentHash changed.
- PROPOSED DECISION: Fixtures that run whole-dish horizons report their wall time instead of asserting it. The shared 2-CPU machine varies threefold with load. The relationship matrix's ≤ 90 s check stays because the assignment names it, and it has a 2.5× margin at the worst measured load.
