# e2-shells build report (wave 10, stage 2; P5.3 shell half: A02, P05, silicate, grit)

Nothing is enabled (D-0104). A02, P05, M02, M12 and the silicate system are reached only through test registries (`registryWith(..., { allowUnimplemented: true })`). SHELL is not in IMPLEMENTED_NATIVE_ABILITIES, and the lead appends it at integration. No schema, protocol, manifest or content change.

## Checklist

### Build
1. **Constants: DONE.** `src/sim/constants.ts:170` has `SHELL_MINERAL_PER_BIOMASS = 0.1` (CT §12.3) and `:172` has `GRIT_DISSOLVE_PER_SECOND = 0.01` (CT §12.2). Stage 1's constants are kept. The per-tick amount is computed once, in `src/sim/conversion.ts:42`: `GRIT_DISSOLVE_PER_TICK = GRIT_DISSOLVE_PER_SECOND * DT`, which is exactly 0.001. Proved by grit-dissolution.test.ts:62.
2. **Shell builders in intake.ts: DONE.**
   - `buildShellTable` (`intake.ts:552`) builds a per-stage table by species index from `sp.abilities.includes('SHELL')`. It never uses a species id. It runs at `:206`.
   - Stage 2 (`:352-366`) runs only when the world has a shell species. It computes `needSi = SHELL_MINERAL_PER_BIOMASS × BIOMASS_FRACTION × C` on every ordinary route and sums it into `demandSi[cell]`. `touchedSi` drives the clearing.
   - A shell builder in a world without the silicate field throws `stageIntake: shell builder <id> in a world without the silicate system`.
   - Stage 3 (`:381`) computes `fracSiCell = min(1, silicate/demandSi)` from the same snapshot as fracN and fracO.
   - The limiting fraction is set at `:407-409` (see "L per organism kind" below).
   - The commit (`:438-445`) computes `bind = SHELL_MINERAL_PER_BIOMASS × (BIOMASS_FRACTION × Cs)`, then runs `subtractPool(world, silicate, cell, bind, 'm')` and `boundMineral += bind`.
   - The leading constraint (`:501-504`) sits after the N and O2 checks and before light: `fracSi < value && fracSi < 1` gives `R.SILICATE_LIMITED`, value = fracSi.
   - Proved by shells-silicate.test.ts:111, 129, 145, 170, 191 and 208.
3. **Grit dissolution: DONE.**
   - `dissolveGrit` (`conversion.ts:50`) is called at `:72`, after `releaseFoodObjects` and before the enzyme loop.
   - It returns at once unless both `fields.grit` and `fields.silicate` exist.
   - For every mask cell with g > 0: d = g × 0.001, then `grit = g − d` and `silicate += d`. It calls `markField('silicate')` once if anything moved.
   - There is no ledger line (it is an internal move) and no threshold zeroing.
   - Proved by grit-dissolution.test.ts:62, 84, 101 and 155.
4. **M02 and M12 doses: DONE, with no change to commands.ts.** The generic `deposit` records `tool:M02` and `tool:M12` as `inputs.m`. Proved by grit-dissolution.test.ts:120.
5. **Perf: DONE (measured, no assertion).** See "Perf" below.

### Done when
- **The four test files pass: DONE.** shells-silicate 14 tests, grit-dissolution 6, conservation-mineral 1, shells-determinism 4.
- **The regression list passes unchanged: DONE with one exception, which is not this task's.** The list is photosynthesis, shared-budget, finite-feeding, fair-shared-food, no-free-growth, producers, food-objects, enzyme-source, conservation-all-pools, tests/sim/feeding, construction, world-stores-5 and tests/persistence/phase5-import. Result: 12 of 13 files passed, 127 of 128 tests. The one failure is `tests/sim/world-stores-5.test.ts` "4× equals 1×", which expects `gateTally` unchanged. Stage 1's in-flight `gateTally.ts`/barrier-transport now accumulates co2, nutrient and oxygen flux there. That world has no shell builder and no grit. structure-commands' report already lists the same failure as barrier-transport's.
- **tsc and eslint: DONE.** `npx tsc -p tsconfig.json --noEmit` exits 0. `npx eslint` on all 7 changed or created files exits 0.
- **The fence is unchanged: DONE.** Results are under "Commands".
- **Report items: DONE.** See below.

## L per organism kind (the exact expressions) and the proof that the old path is unchanged
- Every organism that is not a shell builder: `L = Math.min(fracN, fracO)`. This is the v1.0 expression unchanged, with no third term. `fracSi` is the literal `1` for them, so `fracSi < value && fracSi < 1` is never true and the leading-constraint result is unchanged.
- A shell builder (A02 or P05, on the photosynthesis, meal, field or detritus route): `L = Math.min(fracN, fracO, fracSi)`. Here `fracSi = needSi > 0 ? fracSiCell[cell] : 1`, so it is 1 where the need is 0, as SPEC §6.5 says.
- In a world whose species include no SHELL ability (every shipped dish and every old save), `anyShell` is false. Then `needSi`, `shellEnt`, `demandSi`, `fracSiCell` and the silicate field are never written or read. The only extra work per stage is the species-table loop (about 20 `includes` calls).
- Evidence:
  - The fence (g2-replay, rc1-replay, the four trajectory-fence files, conservation-closed-lid, determinism) passes.
  - shells-silicate.test.ts:222: B01 columns are identical (Object.is) with silicate 0 and with silicate 1.
  - shells-silicate.test.ts:208: a B01 in the same cell as an A02 limited to fracSi = 0 still grows.
  - shells-determinism.test.ts:93: NEUTRAL. FIRST_DISH_V1 under silicate + M02/M12 runs 2,000 ticks. Every entity column and every field is byte-identical to the shipped registry, the silicate and grit fields stay all-zero, and the trajectoryDigest 'full' is equal.
  - shells-determinism.test.ts:124: with A02 and P05 enabled but absent, after 1,000 ticks the digest equals the shipped dish's.

## The grit scan: gate and cost
- **Gate:** `world.fields.grit && world.fields.silicate`, meaning the world records the 'silicate' system. There is no `isFieldActive('grit')` gate, as D-0117 rules. In practice grit is never deactivated anyway: `fieldActive` starts at 1, and only `diffuseField`, `decayActivity` and the film stage clear it. Grit is `diffusion: 'none'`, so the field is never skipped, which is why the missing `markField('grit')` in the writers does no harm today.
- **Cost** (tmp/e2-shells-perf/perf.ts, not committed; machine shared with other agents, so the times are inflated):
  - Dish: 2,000 ticks with 100 A02, 50 P05 and 150 B01, grit 0.5 in every cell. The shipped twin uses 100 A01, 50 P01 and 150 B01. Both end at about 1,700 to 1,800 alive.

| Run | Dish | Mean tick | p95 | Stage 3 | Stage 6 |
|---|---|---|---|---|---|
| 1 | shipped | 4.356 ms | 9.98 ms | 0.016 ms (0.37 %) | 0.676 ms (15.5 %) |
| 1 | silicate | 3.790 ms | 7.64 ms | 0.072 ms (1.90 %) | 0.539 ms (14.2 %) |
| 2 (heavier load) | shipped | 8.342 ms | 20.3 ms | 0.025 ms (0.30 %) | 1.514 ms (18.1 %) |
| 2 (heavier load) | silicate | 8.343 ms | 18.1 ms | 0.196 ms (2.34 %) | 1.420 ms (17.0 %) |

  - The grit scan adds about 0.06 to 0.17 ms per tick in a silicate world.
  - Stage 6's shell work is lost in the noise. The silicate dish is not slower, because it holds a different population.
  - The lead should take the real numbers.

## What each test proves, and the mutant checks
Each mutant was applied by hand to my own files, run against shells-silicate and grit-dissolution, and reverted. Afterwards `cmp` with the backups showed the files restored.

| Mutant | Failing tests |
|---|---|
| L includes fracSi for every organism | shells-silicate:208 (B01 next to a starved A02) |
| Mineral bound at 0.10 × C instead of 0.10 × 0.5 C | shells-silicate:111, 145, 170 |
| Silicate not subtracted | shells-silicate:111, 145 (the conservation file would also fail on mineral) |
| SILICATE_LIMITED never chosen | shells-silicate:129, 145, 191, 208 |
| Grit dissolution before releaseFoodObjects | grit-dissolution:101 |
| Grit dissolution after the enzymes | grit-dissolution:101 |
| Grit dissolving at 0.01 per tick | grit-dissolution:62, 84, 120, 136 |

The order with the food release and the enzymes is not observable in state, because neither of them reads or writes grit or silicate. grit-dissolution:101 therefore holds the order on stageConversion's source (release < dissolve < RULES loop) and says so.

**shells-silicate.test.ts:**
- **:111** Ample silicate. Over 30 ticks, every tick dM/dB = 0.10 (relative 1e-12) and the cell's silicate falls by dM (relative 1e-12). A round trip after binding passes, and both copies agree after 50 more ticks.
- **:129** Silicate 0. B stays exactly 2, boundMineral 0.2, lastIntakeTick −1, code SILICATE_LIMITED, value 0, and the CO2 total is unchanged. The round trip after a limited tick passes.
- **:145** Two A02 in one cell with uniform silicate = need/2. Each grows and binds 0.5 × its ample twin's amount, value 0.5, and the cell is drained to below 1e-15.
- **:170** A P05 catches a B01 for real, then binds 0.10 per biomass while its meal falls (the meal route).
- **:191** A P05 with a meal and silicate 0 does not grow and reports SILICATE_LIMITED 0.
- **:246** Inoculation through the real command. Each A02 holds 0.1 × b0, and inputs.m grows by 4 × 0.2.
- **:259** Division splits 0.37 into exactly 0.185 + 0.185 (silicate 0, so nothing is bound that tick). The round trip after division passes.
- **:279** Death by age at stage 7. The cell's grit equals the whole boundMineral. The round trip after the death passes.
- **:293** A direct `killEntity` sends the mineral to grit.
- **:302** P01 captures an A02. Grit in the prey's cell grows by exactly the prey's 0.2 at stage 5, with one capture.
- **:334** Sample Life take. `sampleTotals.m` = 0.31, the total m is unchanged, and after Transfer dx 10 the A02 keeps 0.31.

**grit-dissolution.test.ts:**
- **:62** After one tick, grit = 1 − 0.001 and silicate = 0.001 exactly. Stage 2 leaves grit at 1.
- **:84** After 1,000 ticks, grit matches the closed form within 1e-12 relative. Every other cell holds grit 0, grit + silicate = 1 within 1e-12, and the ledger's m residual is below 1e-12.
- **:120** M12 0.5 and M02 0.1 are recorded as inputs.m, and the dose's grit decays by the law.
- **:136** No registry species lists grit as food. Six species next to grit 0.2 everywhere leave grit exactly on the law, and intakeSeen never marks grit.
- **:155** Without silicate there are no fields, `dissolveGrit` is a no-op, and the stateHash and columns equal the shipped registry's.

**conservation-mineral.test.ts:73:** lid closed, 10,000 ticks in 20 chunks.
- Inputs are unchanged after setup, and `inactiveFieldsNonZero` is [] at every chunk.
- At least one shell builder was lost to death or capture; 486 were.
- Bound mineral grew beyond what was inoculated.
- Measured: worst relative error C 1.9e-14, N 6.3e-14, M 8.0e-15; worst absolute C 1.5e-10, N 7.2e-11, M 9.5e-13.
- Final mineral: silicate 91.43, grit 25.06, bound 2.72. 1,399 births, 1,414 deaths, 676 captures.

**shells-determinism.test.ts:**
- **:69** 400 ticks = 4 × 100.
- **:80** Save at 1,234, load, run to 3,000: stateHash and trajectoryDigest 'full' are equal.
- **:93 and :124** The NEUTRAL tests (above).

## Commands and results
- `npx vitest run --silent=false tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/shells-silicate.test.ts tests/fixtures/grit-dissolution.test.ts tests/fixtures/conservation-mineral.test.ts tests/sim/shells-determinism.test.ts` gives `Test Files 12 passed (12) / Tests 87 passed (87)`.
  - conservation-closed-lid printed: worst relative C 5.220e-15, N 1.080e-13; absolute C 2.910e-11, N 1.176e-10, M 0. These are its usual values.
- The earlier fence-only run, which started right after the source edits, gave `Test Files 8 passed (8) / Tests 62 passed (62)`.
- The regression list gave `Test Files 1 failed | 12 passed (13) / Tests 1 failed | 127 passed (128)`. The failure is world-stores-5 gateTally, which belongs to stage 1 (see above).
- `npx tsc -p tsconfig.json --noEmit` exits 0, and `npx eslint <7 files>` exits 0.
- Mutants: see the table above.

## FENCE notes
No fence value moved, and I did not run fence-update. I created no recipe.

## Files
- **Changed (owned):**
  - `src/sim/intake.ts`
  - `src/sim/conversion.ts`
  - `src/sim/constants.ts`: two constants appended after stage 1's block.
- **Created:**
  - `tests/fixtures/shells-silicate.test.ts`
  - `tests/fixtures/grit-dissolution.test.ts`
  - `tests/fixtures/conservation-mineral.test.ts`
  - `tests/sim/shells-determinism.test.ts`
  - this report
- **Scratch, not committed:** tmp/e2-shells/ (logs, the mutant script, backups) and tmp/e2-shells-perf/perf.ts.
- I did not touch commands.ts, maintenance.ts, contacts.ts, births.ts, implemented.ts, reasons or the manifest.

## Gaps and changes I would make in other files (for the lead)
1. **maintenance.ts `killEntity` (around line 148) and contacts.ts `consumePrey` (around line 138)** add mineral to grit without `markField(world, 'grit')`. This is harmless today, because grit never diffuses and is never deactivated. For consistency with every other pool writer, I suggest a one-line `markField(world, 'grit')` in both (hash-neutral, since fieldActive is not hashed).
2. **commands.ts `introduceOrganism` (around line 400)** uses the literal `0.1 * b0`. I suggest `SHELL_MINERAL_PER_BIOMASS * b0`, which gives the same value.
3. **The SILICATE_LIMITED Lab line** ("Shell growth limited by silicate: {supplied}%.") belongs to e3-resters (src/ui/strings/reasons.ts). The Explore line already exists.
4. **world-stores-5 "4× equals 1×"** needs its `gateTally` expectation updated by barrier-transport or the lead.

No gap was found in the inoculation input, the division split, the death and predation release to grit, or the Sample carrying boundMineral. All are proved by tests.

## Proposed decisions
- **PROPOSED DECISION: the silicate check comes after the N and O2 checks and before light.**
  - The leading-constraint check for silicate sits after N and O2 and before light/crowding, so with equal fractions N and then O2 win the tie (strict `<`, as today).
  - Reason: the smallest supplied fraction wins, and earlier physical needs keep their existing precedence.
- **PROPOSED DECISION: bind exactly 0.10 × the biomass gained; roundoff goes through subtractPool.**
  - The silicate bound is `0.10 × (0.50 × Cs)`, which is exactly 0.10 × the biomass gained, and the same amount is subtracted from the cell.
  - When per-entity rounding makes the cell's sum exceed the pool by dust, `subtractPool` zeroes it and records it in `roundoff.m` (within 1e-9 × amount; otherwise it throws as an allocation defect).
  - Reason: an exact 0.10 shell-to-body ratio, with the ledger still closing.
- **PROPOSED DECISION: the missing-silicate check is lazy and the shell table is rebuilt every stage.**
  - A missing silicate field throws only when a shell-builder organism actually reaches stage 6 allocation, not when the species list merely contains one.
  - The shell table is rebuilt every stage from `sp.abilities` (no cache), so it can never be stale against `world.species`.
  - Reason: the smallest blast radius for a defect check, at negligible cost.
- **Already ruled (D-0117) and implemented:** grit dissolution scans while the field exists, with no threshold zeroing (the move is exact either way: grit + silicate is conserved to roundoff).
- **PROPOSED DECISION: the stage 3 order is held on the stage's source.**
  - The stage 3 position of grit dissolution (after the food release, before catalysis) cannot be observed in state, because the three steps share no pool.
  - grit-dissolution.test.ts:101 therefore checks it on stageConversion's source.
  - Reason: a mutant that moves the call must still fail a test.
