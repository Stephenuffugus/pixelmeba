# Wave g5-wave-10 verify group 2 (e2-shells, e3-resters): rules, determinism, conservation, tests, player-facing truth

Verifier 2 of 2, 2026-10-14. Lens: rules against the canonical docs, determinism, conservation, test strength, and player-facing truth.

I edited no tracked file. Mutants were applied at load time through a Vite transform plugin (`tmp/verify-g5-wave-10-1/vitest.mutant.config.ts`). The comparisons with the pre-change code served HEAD's copies of the files through a Vite load hook (`vitest.head.config.ts`).

**Verdict: ok = false.** There is one MAJOR, a latent false label in the inspector for e3-resters' resting newborn. The sim work of both tasks holds.

## Problems (most severe first)

1. **MAJOR [e3-resters]**
   - **Where:** `src/ui/strings/modules.ts:229-233` (with `src/worker/protocol.ts:912,924`).
   - **What is wrong:** the inspector's dormancy block still says "Resting because food stayed scarce." for an F04 resting newborn.
     - `dormancySummary` now returns `cause = RESTING_NEWBORN` (moduleView.ts:154). The snapshot (worker/snapshot.ts:582) and Inspector.tsx:575 then pass it to `dormancyLines`.
     - `dormancyLines` prints the food sentence for every cause that is not RESTING_DRY.
     - The same block's wake sentence and checklist (":231-233") list food, moisture and conditions only. It never names the surface she needs, so it can show three "yes" next to "held 0 of 10 s".
     - The assignment's goal was "so the inspector never shows a false RESTING_FOOD_SCARCE". The reason line meets it, but this block contradicts it on the same sheet. That breaks CLAUDE.md "Honest labels".
     - The build report lists only the wake line (":234", as a proposal for wave 11). It omits the false cause sentence, although the Done-when asks for "anything you would have changed in another task's files".
     - Nothing ships it today (F04 is not enabled, D-0104).
   - **Fix (lead or wave 11; modules.ts is not e3's file):**
     - Add a `d.cause === R.RESTING_NEWBORN` branch, for example "Resting since it formed."
     - Add a "Surface to hold" check when `d.wake.attachable !== undefined`.
     - Widen `DormancyInspect.wake` and the cause comment in protocol.ts.
   - **Repro:** in tests/fixtures/resting-daughter.test.ts's `divided()` world, `dormancyLines(dormancySummary(w, d)!, c.E[d])[0]` is "Resting because food stayed scarce.".

2. **MINOR [e3-resters]**
   - **Where:** `src/ui/narration.ts:108` and `src/ui/strings/narration.ts:50`.
   - **What is wrong:** the narrator's `need = 'resting'` covers RESTING_FOOD_SCARCE and RESTING_DRY only. An inspected resting newborn gets no resting narration.
   - It is silent rather than false, so this is not a truth violation. It is one more place to route RESTING_NEWBORN before F04 is enabled. The report does not mention it.
   - **Repro:** read the two lines.

3. **MINOR [e2-shells]**
   - **Where:** `src/sim/intake.ts:358`.
   - **What is wrong:** the clear error for "shell builder in a world without the silicate system" is untested.
   - **Repro:** mutant m4 replaced `if (!silicate) throw` with `if (false as boolean) throw`. shells-silicate, grit-dissolution and shells-determinism still passed (24/24).
   - The registry already refuses SHELL without 'silicate' (registry.ts:580), so this is a defence-in-depth check with no test.

4. **MINOR [e2-shells]**
   - **Where:** `tests/fixtures/grit-dissolution.test.ts:155`.
   - **What is wrong:** "a world without the silicate system … plays exactly as under the shipped registry" compares the shipped registry with `registryWith({ enabledSystems: [...SHIPPED.enabledSystems] })`, the same manifest. That half is vacuous.
   - The real proof is the `dissolveGrit(shipped)` no-op call in the same test, plus the fence.

5. **MINOR [e3-resters]**
   - **Where:** `tests/fixtures/resting-daughter.test.ts:300-313` and `tests/fixtures/dormancy-native.test.ts:153-168, 266`.
   - **What is wrong:** the "round trips at birth / mid-rest / mid-wake / after waking" call `roundTrip(await reload(w))`. That compares a reload of a reload with the first reload. The first reload is never compared with the original `w`, so a save that dropped a column such as FLAG.restNewborn would still pass these tests.
   - Other tests cover the property directly:
     - resters-determinism compares against the original on a save taken while daughters rest and wake, using stateHash and the 'full' digest.
     - phage-v02's infected-B02 round trip does the same.
     - The explicit refusal test covers the flag left on an Active organism.
   - The tests are weaker than they read.

## Not graded here: owned by the group 1 verifier
- **tests/sim/world-stores-5.test.ts "4× equals 1×" fails on the current tree.** `gateTally` now holds co2, nutrient and oxygen flux where the test expects the stored values.
  - I reproduced it with all seven e2/e3 source files served from HEAD (still 1 failed of 8), so it comes from stage 1 (barrier-transport's gateTally.ts), not from these two tasks.
  - It breaks `npm run check`, so it must be fixed before the wave commits.

## VERIFIED OK
- **Fence and the builders' tests.** `npx vitest run` on g2-replay, rc1-replay, trajectory-fence (4 files), conservation-closed-lid, determinism and the 9 new files gave "Test Files 17 passed (17), Tests 131 passed (131)", exit 0.
- **Regression lists of both tasks.** These ran in one batch, together with tests/ui/narration*.test.ts:
  - tests/fixtures/{photosynthesis, shared-budget, finite-feeding, fair-shared-food, no-free-growth, producers, food-objects, enzyme-source, conservation-all-pools, phage, parasite, fungal-branching, fungal-transport, film, host-specificity, relationships-film, relationship-matrix, blocked-division-proposal, module-e04, module-e12}
  - tests/sim/{feeding, construction, world-stores-5, dormancy, movement-births-tick, links, fungal-links, modules, barrier-placement}
  - tests/persistence/{phase5-import, migration-schema5}, tests/ui/reasons
  - Result: "Test Files 1 failed | 33 passed (34), Tests 1 failed | 361 passed (362)". The one failure is world-stores-5, explained above.
- **tsc and eslint.** `npx tsc -p tsconfig.json --noEmit` exit 0. `npx eslint` on all 19 changed or new files of both tasks exit 0.
- **Byte-level neutrality against HEAD (both tasks).** The HEAD copies served were births, dormancy, viruses, moduleView, reasons, intake and conversion. (constants.ts was not served from HEAD: it also carries stage 1's constants.)
  - Dish 1: e3's B01/B02/F01/F02/X01/V01 neutral dish at 500, 1000, 1500 and 2000 ticks. stateHash, 'full' digest and a sha256 of every entity column and field are identical (for example @2000: 5b4c69f7617753e5 / 257b906dfc88827f / 56df01107b3eecde).
  - Dish 2: FIRST_DISH_V1 at 3000 ticks, identical (a8dfe572a4d7112d / 196db149ab7cb7a6).
- **[e2-shells] L per organism kind.**
  - Non-shell organisms: exactly `Math.min(fracN, fracO)` (intake.ts:409). Silicate is read only under `anyShell`.
  - A02 and P05: `min(fracN, fracO, fracSi)` with `fracSi = 1` when the need is 0.
  - The silicate share comes from the same stage snapshot: needSi = 0.10 × 0.50 × C, summed per cell. This matches SPEC §6.5 "L = min(1, gotN/needN, gotO2/needO2, gotSi/needSi)".
  - My mutants:
    - m8 (fracSi applied to every organism): fails shells-silicate "B01 in the same cell … still feeds".
    - m10 (bind 0.10 × C): fails 3 binding tests.
- **[e2-shells] Commit.**
  - `bind = 0.10 × (0.50 × Cs)` is taken from the cell with `subtractPool(…, 'm')`. Overdraft is bounded by fracSi, so only float dust reaches roundoff, and subtractPool throws above 1e-9.
  - SILICATE_LIMITED is placed after N and O2 with strict `<`, and its value is the share supplied. This matches CT §12.3 and UX §5.2.
- **[e2-shells] Grit dissolution.**
  - `dissolveGrit` runs after `releaseFoodObjects` and before the enzymes (SPEC §3.2 row 3), with d = g × 0.001 per tick (CT §12.2). It is gated on both fields existing (D-0117) and has no threshold zeroing. Mineral moves exactly, with no ledger line.
  - My mutant m1 (no `markField('silicate')` on dissolution) fails grit-dissolution's 1,000-tick test, because the silicate never diffuses.
- **[e2-shells] Conservation.** conservation-mineral covers 10,000 closed-lid ticks with relErr < 1e-5 for C, N and m, absolute < 1e-8, and asserts shell losses > 0. It passed in my run.
- **[e2-shells] Inoculation, division, death, predation and Sample.** Each is proven by a test with an exact value. No change was made in commands.ts, maintenance.ts, contacts.ts or births.ts for these.
- **[e2-shells] Ownership.** No content, schema, protocol, manifest or implemented.ts edit. The constants are additive at constants.ts:165-172.
- **[e3-resters] Resting-daughter states.**

  | State | Flags | Class | Reason |
  |---|---|---|---|
  | At birth | Resting, restNewborn, not restDry, not attached, clocks 0 | Small | RESTING_NEWBORN, value 0 |
  | Waking | restNewborn | Small | WAKING |
  | Active | flag cleared in that tick | Fixed | 30 s lockout |

  - At birth she has fungal degree 0, her birth detail is `resting: 1`, and there is no linkFormed or rest event.
  - My mutants:
    - m3 (no `stateReason` at birth): fails the birth-state test.
    - m7 (old cause expression in moduleView): fails the birth-state test.
    - m9 (daughter linked): fails the birth-state test, as the builder said.
- **[e3-resters] Placement.** Placement uses the parent's Fixed class (D-0114). fungi.ts is unchanged. Tested with 20 seeds each beside S02 and S01 lines, including the "only attachable cell across the line → DIV_BLOCK_PLACEMENT" case.
- **[e3-resters] Waking.** `attachable` (canOccupy) is present only for a resting newborn. "Required on its own" is tested with suitability held, and that test fails if the check is removed.
  - The builder honestly reports that she dies of DEATH_STRESS rather than starvation when her surface goes. Without a surface her suitability is 0, so in real runs `attachable` never decides the outcome. That is consistent with D-0106's "attachability is part of waking".
- **[e3-resters] RESTING_NEWBORN appended at the end of REASONS.** There are 79 codes, and limitCode is u16. Explore and Lab copy match D-0117. The SILICATE_LIMITED Lab case follows the project's `pct` style, as NUTRIENT_LIMITED does.
- **[e3-resters] V02.**
  - The film gate (>= 0.10, CT §12.5, SPEC §7.5) is applied before the draw. Without a film field V02 never infects.
  - V01's pass is unchanged: `film` is null for V01, as the HEAD probe confirms. The order is V01 then V02.
  - `virusIdOfCode(2)` resolves to V02, so saveFile accepts infectedBy 2 only with V02 present (tested). Half diffusion is exactly 0.5 (tested).
  - My mutant m2 (`>` instead of `>=`) fails the film 0.10 boundary test.
- **[e3-resters] X02.** parasites.ts is unchanged. parasite-x02 covers Active F02/F04 only, release on rest or death, the 0.0015 C/tick 50/30/20 split, no travel along links, gel/sediment free life and DEATH_PARASITE_DRAIN.
- **[e3-resters] Moisture observation (owner flag in D-0117).** It is correct from CT's numbers: tolerance 0.2–1, shoulder 0.2 and floor 0.1 give suitability 0.5, which is greater than 0.20. Both tests prove it, and the dry trigger is shown with an E03 B01 below 0.24.
- **[e3-resters] Ownership.**
  - Edits only in births, dormancy, viruses, moduleView (the cause and wake type), reasons (appended), ui/strings/reasons, and tests/helpers/world.ts (two new helpers).
  - No edit to transport, movement, contacts, commands, barriers, parasites or fungi.
- **Determinism (both tasks).** There is no Math.random, Date, or Map/Set or object-key iteration in the new sim code. No RNG stream is reused: V02's per-cell ordering keys on disjoint hosts' birthIds. 1× vs 4× and save/reload (stateHash and 'full' digest) pass in shells-determinism and resters-determinism.
- **Stale mutant wording.** e3's assignment lists the mutant "the daughter placed in the parent's class", which contradicts D-0114. The builder correctly ran the inverse ("her own Small class"), and it fails the S02 seeds test.

## Not re-measured
- e2-shells' perf table (mean, p95, stage shares). It is measured with no assertion. The scan costs O(mask cells) per tick, only in silicate worlds.
