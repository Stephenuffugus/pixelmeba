# EXP_104 recipe revision probe (lead, 2026-10-10)

Why: EXP_104 "A hidden neighborhood" does not reach its gate on HIDDEN_NEIGHBORHOOD_V1 revision 1. CT's closed
Water Garden starts at oxygen 0.8, so no Sprinter (B01) is ever `OXYGEN_LIMITED`, and the Dusks (B03) die of
high oxygen by 50 s. See D-0062 and the experiments-g3.md section "EXP_104 — gate NOT reached". SPEC §13.2
says the card is not release-ready until a new revision reaches the gate. This probe measures the revision
the owner note suggested: a lower starting oxygen, with CT's founders and patch unchanged.

The probe ran in memory only. It patched `backgroundOverrides: { oxygen: X }` and `revision: 2` into the
loaded content packs, rewrote the content hash, validated, then ran `runExperiment(registry, 'EXP_104')`
(seed 104, 180 s, arm A). No file under content/ was changed: content edits were frozen while wave 4 stage 2
ran. The probe scripts were scratch files under tmp/lead/; they were not committed.

## Gate and totals at 180 s

| Starting O2 | Gate | B01 `OXYGEN_LIMITED` (org·s) | B03 `SUIT_OXYGEN_HIGH` (org·s) | O2 mean | intake B01 / B03 | alive B01 / B03 | births B01 / B03 | deaths B01 / B03 |
|---|---|---|---|---|---|---|---|---|
| 0.8 (rev 1) | not reached | 0 | 998 | 0.761 | 111.7 / 0 | — / 0 | — | — / 20 |
| 0.3 | not reached | 0 | 3598 | 0.284 | 99.2 / 17.4 | 34 / 18 | 20 / 0 | 6 / 2 |
| 0.15 | not reached | 0 | 3600 | 0.141 | 80.6 / 33.3 | 28 / 20 | 17 / 0 | 9 / 0 |
| 0.1 | not reached | 0 | 3600 | 0.093 | 77.4 / 37.6 | 27 / 20 | 14 / 0 | 7 / 0 |
| 0.07 | reached at 3 s | 2.3 | 3598.8 | 0.065 | 74.8 / 39.9 | 26 / 20 | 13 / 0 | 7 / 0 |
| 0.05 | reached at 2 s | 42.2 | 3574.9 | 0.046 | 71.6 / 41.9 | 26 / 20 | 12 / 0 | 6 / 0 |
| 0.03 | reached at 1 s | 131.1 | 3496.7 | 0.027 | 65.8 / 46.8 | 28 / 20 | 9 / 0 | 1 / 0 |

## When Sprinters are oxygen-limited

Counts are per 10 s window. avgLim is the mean number of oxygen-limited Sprinters per tick, then the most in
any one tick, then the living Sprinters at the window's end. The last value is the lowest oxygen in any
Sprinter's cell.

- **O2 0.05**: 70 of 1800 ticks have at least one oxygen-limited Sprinter.
  - 0–10 s: avgLim 4.22, max 10 of 20. Lowest O2 at a Sprinter: 0.0000.
  - 10–20 s and later: 0. The lowest O2 at a Sprinter recovers to 0.0013, then 0.019, then 0.045 by 170 s.
- **O2 0.03**: 119 of 1800 ticks.
  - 0–10 s: avgLim 12.25, max 20 of 20.
  - 10–20 s: avgLim 0.86, max 6.
  - 20 s and later: 0. The lowest O2 at a Sprinter recovers from 0.003 to 0.025.

What happens: the founders land on a rich sugar patch and feast. Each Sprinter's oxygen demand scales with
its intake. The cell rule is `fracO = min(1, O2 / demandO2)` (src/sim/intake.ts ≈ :345). The feast empties
the patch's oxygen within seconds, and most Sprinters read `OXYGEN_LIMITED`. Once the sugar is eaten down,
`FOOD_ACCESS_LOW` leads, demand falls, and oxygen diffuses back in. From about 20 s on, no Sprinter is ever
oxygen-limited at any starting level tested.

The Dusks live through the whole run below 0.1: all 20 alive and taking in food. Their `SUIT_OXYGEN_HIGH`
reading holds about 97–100 % of the time, but it is mild: suitability is 1 − O2/0.4, which is 0.925 at 0.03.

## Lead reading (input to the decision; not yet recorded as a D-number)

- A starting oxygen of 0.03–0.05 reaches the gate in a real, explainable way: the feast burns the patch's
  oxygen out. The Dusks living, instead of dying at 50 s, also fits the card's question.
- The oxygen-limited moment is only the first ~10–20 s. The player step `inspectOxygenLimits` needs a tap
  on an oxygen-limited Sprinter, so the card text must say when to look ("pause in the first seconds, while
  the patch is busiest"), or most players will miss it and see only `FOOD_ACCESS_LOW`.
- Candidate: revision 2 with `backgroundOverrides: { oxygen: 0.03 }`, CT's founders and patch unchanged. The
  texts should say the dish starts low in oxygen and when to look. Then:
  - re-pin tests/experiments/hidden-neighborhood.test.ts to the revision-2 outcome;
  - run content-validate --write;
  - run `tools/fence-update.ts` for the EXP_104/HIDDEN_NEIGHBORHOOD entries with the new D-number as reason.
- The alternative stays open for the owner: keep EXP_104 out of the v1.0 card list. Either way it is an
  owner-review item.
