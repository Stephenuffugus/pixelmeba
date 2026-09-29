# P2.9 second tuning report: build report (tune-g2)

The tuning report is written at `/workspaces/pixelmeba/docs/reports/tune-g2.md`, covering both presets on all six development seeds, with the hand-written analysis. I did not change any recipe, mechanic, constant or content number, and I measured no candidate recipe because none is warranted. The D06 pacing targets are met on 6/6 seeds at both presets; Accelerated confirms a branch within 600 s on 6/6 seeds, Standard on 1/6.

I did not write `/workspaces/pixelmeba/docs/reports/reviews/g2-close/tune-g2-build.md`. The session blocks subagents from creating report `.md` files and says to return them as text, so this message is that report; the lead can save it there verbatim.

## Files changed (only the four I own)
- **`/workspaces/pixelmeba/tools/sim-tune.ts`**
  - `--presets standard,accelerated` writes one report with a section per preset and a side-by-side table; `--preset` still works.
  - An observer reads the new birth records after every tick, so lineage compaction cannot lose them. It counts daughter trials, quantitative and preference draws, module draws, gain and loss attempts, committed gains and losses, and draws that had no legal option.
  - Module draws are recomputed with the sim's own pure `draftDaughter`, probing a module set with a legal gain and one with a legal loss. This matters because a draw with no legal option leaves no trace in the genome.
  - "Draws reproduced" re-drafts every daughter from its parent's recorded genome and compares genome, flags, locus, delta and module. "Mismatches" must be 0, and the tool exits 2 if either check is not clean.
  - New tables and columns:
    - pooled per-daughter rates, with exact Poisson 95 % ranges of the preset chance and a per-minute rate;
    - waiting time for a gain attempt;
    - module carriers (carrier-seconds, reserve room in use, resting, secreting, energy against plain organisms);
    - which gains still have a living carrier;
    - branch confirmations, using the name the player sees;
    - censored milestones for first gain attempt, first gain, first candidate, first confirmation and first module-branch confirmation.
  - Read-only is preserved: the endpoint hash equals a plain run.
- **`/workspaces/pixelmeba/tools/sim-run.ts`** (additive only): `--preset standard|accelerated|fixed`, `mutationPreset` in the summary, and in `--perf` output `agents {start,end,peak,mean}` and `loadAverage1m`.
- **`/workspaces/pixelmeba/tests/tools/sim-tune.test.ts`**: 10 new tests plus added checks in one existing test (19 in total).
- **`/workspaces/pixelmeba/docs/reports/tune-g2.md`** (new): generated tables plus the analysis block.

## What each new test proves
- **Existing per-seed fields test, extended:** each division gives exactly 2 daughter trials, and every daughter is re-drafted exactly from its recorded keys with 0 mismatches. Quantitative draws equal the lineage count, the per-second daughter series ends at the totals, and the rates are `ratesFor('standard')`.
- **CLI parsing:** one preset or both parse correctly, and an unknown preset is refused.
- **Draw classification matches `draftDaughter` (Accelerated):** 8,000 fixed-key daughter trials × 5 parent genomes (legal gain, slots full, only gain already carried, legal loss, native duplicate).
  - The recomputed draw agrees with the sim's own draft in every case.
  - The draw does not depend on the genome.
  - The count lies inside the 1 % Poisson range.
- **Draw classification at Standard:** the same check at 0.2 %.
- **Rate helpers:**
  - Poisson and normal ranges are correct.
  - 1 − chance of none equals the sim's SPEC §8.7 figure (`moduleGainAttemptChance`, the 63 %).
  - The median wait is correct.
- **Accelerated run, seed 130363, 150 s (it has gains and a confirmed branch):**
  - The endpoint hash equals a plain Accelerated run.
  - Every tally matches an independent recount from the birth records: attempts = gains + no-option draws, events = GAIN records, correct first gain tick.
  - Living carriers are recounted and all attributed to gains.
  - Branch rows match the branch book, with names from `generatedBranchName`, at least 5 members and at least 3 generations.
- **Two-preset rendering:** all headings are present and Standard comes first. The Standard first gain is censored as `≥ 150.0 s (not estimable) … 1/1 (no event by 150 s)`, never reported as an event at T.
- **`sim-run --preset` CLI (spawned):** its hash equals an in-process Accelerated run, the agent fields are present, and an unknown preset exits non-zero.

## Commands and results
- `npx vitest run tests/tools/sim-tune.test.ts` → `Test Files 1 passed (1) · Tests 19 passed (19)` (90.6 s at load ≈ 8).
- `npx tsc -p tsconfig.json --noEmit` → exit 0.
- `npx eslint tools/sim-tune.ts tools/sim-run.ts tests/tools/sim-tune.test.ts` → exit 0, clean.
- `npm run sim:tune -- --presets standard,accelerated --out docs/reports/tune-g2.md` → exit 0; all 12 runs had `reproduced n/n · mismatches 0`; ledger ok everywhere. Three runs in this session gave identical hashes.

**600 s results by preset**

| | Standard | Accelerated |
|---|---|---|
| D06 pacing targets | 6/6 | 6/6 |
| Module gains | 9 (1–3 per dish), first median 255.9 s | 65 (9–15 per dish), first median 88.9 s |
| Seeds with a confirmed branch | 1/6 (433 s) | 6/6, median 312.1 s (122.8–510.8 s) |
| Gain attempts per daughter | 9 / 13,596 = 0.066 % (expected 13.6, range 7–21) | 68 / 13,586 = 0.50 % (expected 67.9, range 52–85) |

- The Accelerated confirmations are 15 in total, 14 of them module branches.

**Tick cost:** `npm run sim:run -- --recipe FIRST_DISH_V1 --seed 104729 --ticks 6000 --perf` (plus `--preset accelerated`), load 1.5–1.8.

| Preset | p50 ms | p95 ms | p99 ms | Agents mean / peak |
|---|---|---|---|---|
| Standard | 1.655 | 3.181 | 4.896 | 404.9 / 718 |
| Accelerated | 1.637 | 3.091 | 4.766 | 403.3 / 715 |

- I also ran the `g1` tag's `sim-run` interleaved with today's code on the same machine: G1 p50 1.594 ms against G2 1.622 ms, so Phase 2 caused no measurable slowdown.

**Comparison with G1:** every hash changed, as expected. Scratch evidence (not in the repo) separates the causes:
- Today's code with the module registry emptied in memory reproduces tune-g1's births, deaths, counts, biomass, food and mutation counts **exactly on all six seeds**, with new hashes. So the hash change comes from D-0023 and the new state, not the ecology.
- Branch counts cannot be compared with G1's, because the P2.3 bookkeeping changed (D-0025).
- With the registry on, 4 of 6 seeds match G1 exactly. The other two (104729, 196613) diverge after their first module gain.

**Supplementary 1,200 s runs** (scratchpad, not the D06 stopping rule):
- Standard dishes with a confirmed branch rise to 4/6 by 1,200 s; 3/6 have a confirmed module branch.
- On 3 of 12 dishes the Recyclers bloom after about 650 s (871–1,044 Recyclers, 1,534–1,598 Sunbeads).

## Not done, and why
- **No candidate recipe measured.** None is warranted: the targets are met, and D06 §9 accepts no branch within 10 minutes on Standard. The G1 candidates stay deferred to P3 under D-0015.
- **Build report file not written:** see the note at the top.
- **Playwright, axe, touch targets and 200 % text:** not run or not applicable. The instructions said not to run Playwright, and I changed no UI.
- **Full `npm run check`:** not run; I ran only this test file, as instructed for the shared 2-CPU machine.
- **Effective-speed column in the report:** it is wall-clock time at load 2–4, so it is noisy. The report says so and uses the `sim:run` numbers for tick cost.

## Bugs and issues noticed elsewhere (not my files)
- `/workspaces/pixelmeba/src/ui/strings/lineage.ts:231-232`: lineage rows show the raw module ID ("gained E05") instead of the module name.
- `/workspaces/pixelmeba/src/ui/feed.ts:33-34`: a module gain gets the same feed line as a quantitative change ("inherited a different trait").
- Branch short IDs repeat because genomes are content-addressed: "Sunbead · Reserve chamber · 792" appears in three dishes, and "792" and "792-2" appear in one dish. This is honest, but two compared dishes can show different branches under the same name.
- At 1,200 s, Accelerated confirms 14–41 branches per dish, while the discovery card shows at most one new card per 60 s.
- Gained Starch release never secreted in any dish (0 of 2,638 carrier-seconds by 600 s). Resting stage in Sprinters never rested before 600 s.

## Proposed decisions
- **PROPOSED DECISION: keep FIRST_DISH_V1 at G2, with no V2.** The D06 targets are met 6/6 at both presets. Accelerated shows gains and confirmed branches within 10 minutes on 6/6 seeds. Standard shows gains on 6/6 seeds and confirmed branches on 1/6 by 600 s and 4/6 by 1,200 s, which D06 §9 allows.
- **PROPOSED DECISION: P3 tuning adds a 1,200 s horizon.** Measure recipe candidates at 600 s and also at a supplementary 1,200 s. The Recycler bloom that closes the food web appears on 3 of 12 dishes only after about 650 s.
- **PROPOSED DECISION (owner or comprehension pass; a label change, not a mechanic change): name the ability wherever a gain is reported.** For example, the feed line "A Sunbead offspring gained Reserve chamber." and "gained Reserve chamber (E05)" in lineage rows.
- **On the open owner questions:**
  - D-0022 (EXP_A bootstrap): the G2 numbers show the same Crumbsmith energy trap on both presets. They confirm the mechanism but don't decide the question.
  - D-0027 (RESERVE_COMPARE_V2 meal dose): Sprinters carrying Reserve chamber never used the extra room under ordinary feeding (0 of 698 carrier-seconds). That supports giving the comparison a surplus source, but does not choose the dose.
