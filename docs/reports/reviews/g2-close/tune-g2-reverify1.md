# tune-g2 re-verification, round 1 (P2.9 second tuning report)

Scope: the round-1 fix of docs/reports/tune-g2.md, tools/sim-tune.ts, tools/sim-run.ts and
tests/tools/sim-tune.test.ts (fix report: docs/reports/reviews/g2-close/tune-g2-fix1.md). Read-only: no
repository file was changed except this one. Scratch work is in tmp/reverify-tune-g2/.

**Verdict: ok.** All 15 round-1 findings (11 distinct problems) are fixed; I found no BLOCKER or MAJOR
problem. Five new MINOR problems are listed below the verdicts. Four are wording or traceability issues
and one is a test that cannot catch the bug it is named for.

## Round-1 findings

- VERIFIED OK — The 1,200 s evidence was not in the repo (both verifiers) — The report now has a
  "supplementary horizon, 1200 s" section for each preset (docs/reports/tune-g2.md:504–746), built by the
  new `--horizon` option (tools/sim-tune.ts:1093–1112, 2016–2100).
  - Every 1,200 s figure the analysis quotes is in those tables: 4/6 dishes with a branch (median
    913.0 s); 871–1,044 Recyclers and 1,534–1,598 Sunbeads; food 1,719–2,886 C against 5,603–5,764 C;
    87,498 = 41,082 + 46,416 daughters; 23,414 = 9,356 + 248 + 12,986 + 824 E01 carrier-seconds; E03
    not active 6.07 % and 59.9 %; 145 branches (58 / 54 / 33); 2,598–2,914 agents.
  - Checked against the round-1 verifier's independent `--seconds 1200` run with the pre-fix tool
    (tmp/verify-tune-g2-numbers/tune-1200.md):
    - all 12 hashes at 1,200 s are equal;
    - per seed, 0 mismatches in divisions, deaths, causes, alive, food, daughters, mutation events,
      gains, losses and extinctions, and in every 60 s count from 660 to 1,200 s;
    - the pooled rate tables, carrier tables and censored-milestone rows are byte-identical.
  - My own plain runs, which use no tool code, give `92e43e2ead863a84` (Standard 104729) and
    `00995c45d6d732ed` (Accelerated 314159) at 1,200 s, the same as the tables.
- VERIFIED OK — There were no per-module rates for the rare modules — New tables at 600 s and 1,200 s
  (tune-g2.md:83–91, 301–309, 548–556, 648–656; code in tools/sim-tune.ts:490–500 and 1508–1556).
  - The expected-count model matches `draftDaughter` (src/sim/mutation.ts:153–161). It rolls the module
    draw, flips a 50/50 gain/loss coin, then picks uniformly from `eligibleGains` or `lossOptions`.
  - My independent recount (tmp/reverify-tune-g2/recount.ts) runs each dish plainly, then recounts from
    the lineage. Over the 12 dishes at 600 s it reproduces every trial count and species split exactly:

    | Preset | Module | Gain trials (split) | Expected gains | Loss trials |
    |---|---|---|---|---|
    | Standard | E01 | 2,896 (B01 2,852 / B04 44) | 0.97 | 4 |
    | Standard | E03 | 2,952 (2,856 / 52 / 44) | 0.99 | 0 |
    | Standard | E05 | 13,572 (10,620 / 2,856 / 52 / 44) | 11.61 | 24 |
    | Accelerated | E01 | 2,880 | 4.83 | 8 |
    | Accelerated | E03 | 2,950 | 5.00 | 30 |
    | Accelerated | E05 | 13,146 | 55.91 | 440 (expected losses 2.2, observed 2) |

  - The test's recount (tests/tools/sim-tune.test.ts:527–556) fails on the pre-fix observer, which has
    no `gainTrialsByModule`.
- VERIFIED OK — The Starch release cause was given as location (verifier A, tune-g2.md:589–591 old) —
  The text now names both recorded blockers with their shares and makes no location claim
  (tune-g2.md:859–870; tables at 115–119, 337–341, 571–576 and 673–678).
  - `starchWithinReach` (tools/sim-tune.ts:284–295) is a line-for-line copy of `substrateNear`
    (src/sim/structures.ts:44–52). The energy test uses the carrier's profile `minEnergy` (35 for E01).
  - My plain runs, with my own copy of the substrate test, reproduce the tables exactly:

    | Run | Carrier-seconds | Recorded outcomes | Starch within reach | E ≤ 35 |
    |---|---|---|---|---|
    | Standard, 600 s | 499 | 268 / 230 / 1 | 0 | 231 (46.3 %) |
    | Accelerated, 3 seeds, 600 s | 2,139 | 1,144 / 995 | 0 | 1,144 (53.5 %) |
    | Standard to 1,200 s, B01 | 9,356 | 6,846 / 2,505 / 5 | 0 | 6,855 |
    | Standard to 1,200 s, B04 | 248 | 231 / 17 | 0 | 231 |
    | Accelerated 314159 to 1,200 s, B04 | 824 | 613 / 211 | 0 | 613 |

- VERIFIED OK — The same Starch release finding (verifier B, with the SECRETION_ENERGY_LOW shares) —
  The same evidence covers it. The 600 s shares are 46.3 % and 53.5 %; by 1,200 s they are 64–93 %.
- VERIFIED OK — The D06 §18 headings were blurred — "Mechanically correct" now opens with the draw rates
  (tune-g2.md:896–945). The pacing targets moved under "Fast enough" (987–996). Repeated branch names and
  the one-card-per-60 s cap moved under "Understood" (961–971). The sources back the "Understood" text:
  D-0025 (at most one new card per 60 s), src/ui/feed.ts:34 ("inherited a different trait") and
  src/ui/strings/lineage.ts:231 ("gained E05").
- VERIFIED OK — The build was not identified (both verifiers) — The header (tune-g2.md:5–6) gives the
  rule versions and git `3ebfdf5`, says src/sim/ and content/ are identical to it, and names the
  uncommitted tool.
  - The rule versions (3/1/1/1/1, schema 3) match content/manifest.json, and are the same at the g1 tag.
  - The only later commit, 486dbf7, adds only docs/agent/g3-plan-recheck.md:
    `git diff 3ebfdf5 486dbf7 -- src content tools tests` is empty.
  - tools/sim-tune.ts was last modified at 05:28:48, before the run (about 05:36–06:09).
  - The report's tables are byte-identical to that run's stdout (session scratchpad, tune-full.stdout).
  - A smoke run now prints HEAD 486dbf7. See MINOR 5 for a wording nit.
- VERIFIED OK — "The tuner only observes" proved nothing (both verifiers) — `--plain-check` re-runs
  every seed with `realizeRecipe` + `step` and no hooks (tools/sim-tune.ts:1155–1184, 2334–2340).
  - The integrity table no longer prints the checkpoint hash twice (tune-g2.md:131–138). The test at
    tests/tools/sim-tune.test.ts:669–676 fails on the pre-fix renderer, which printed it twice.
  - My plain runs, in a fresh process, reproduce all 12 hashes at 600 s and both 1,200 s hashes I ran.
  - The check is not vacuous. I patched the observer to add 0.001 to one sugar cell at tick 50.
    `plainMismatches` then returned `[100]`, and `integrityProblems` reported "plain-run hash differs at
    10 s" (tmp/reverify-tune-g2/mutation.ts).
- VERIFIED OK — The same "only observes" finding (verifier B, `final` is `checkpoint`) — Same evidence.
  The endpoint column now reads "— (not extended …)" for runs that were not extended.
- VERIFIED OK — "Chance of no gain attempt" counted only gain-eligible daughters — The tables now have
  both columns (tune-g2.md:97–104, 315–322; tools/sim-tune.ts:1568–1577). For Accelerated 130363:
  0.995^2,258 = 0.0012 % and 0.995^1,996 = 0.0045 %, as printed. The test's header and row assertions
  (tests/tools/sim-tune.test.ts:520–526) fail on the pre-fix header.
- VERIFIED OK — "1–9 carriers" left out the dishes with none — All three places are now qualified
  (tune-g2.md:810–811, 953–955, 1071–1072). Grep finds no unqualified "1–9".
- VERIFIED OK — The 1,200 s numbers were in no table (verifier B) — Same evidence as the first finding.
- VERIFIED OK — The Recycler bloom was stated as a mechanism — tune-g2.md:886–894 now says "coincides
  with". It gives the onsets from the new 60 s table, which I checked: 5→34→244→547; 1→2→10→87→546;
  2→2→1→8→35→248→806. It names the two dishes that had Recyclers at 600 s but did not bloom (Standard
  196613, lost at 613 s, and Standard 262147, lost at 651 s). A leftover wording error elsewhere is
  MINOR 2.
- VERIFIED OK — The Standard waiting time used Accelerated inputs — tune-g2.md:849–856 now uses
  Standard figures only:
  - 41 gains in 120 dish-minutes (line 541);
  - 5 module branches (3 + 1 + 1 in the column at lines 512–517), about one per 24 dish-minutes;
  - 3/6 dishes by 1,200 s (line 740);
  - 1 of 9 gains by 600 s, confirmed 180.3 s later.

  The Accelerated figures are labelled as such (58 module branches = 11 + 12 + 12 + 9 + 5 + 9).
- VERIFIED OK — "Did not measurably slow" rested on one pair of runs — The report now has seven
  interleaved rounds (tune-g2.md:997–1021). I recomputed every cell from the 21 JSON files in the session
  scratchpad (perf-*-1..4, cpu-*-1..3):
  - wall p50 medians 4.21 / 4.14 / 4.25 ms; p95 10.42 / 10.23 / 10.64 ms; p99 14.83 / 15.15 / 15.54 ms;
  - per-round differences +8.7, −3.7, −2.0, −0.2, +6.2, −38.8 and −3.0 %;
  - process CPU 15.7–17.8 s (G1) against 14.8–17.7 s (G2); tick loop on a CPU for 54–90 % of wall time;
  - stage medians 2.04, 1.13, 0.74, 0.36, 0.32 and 0.15 ms;
  - all seven G1 runs gave `fc8085219c7ed466`.

  `perf.cpu` is an addition to the existing output (tools/sim-run.ts), and the test covers it
  (tests/tools/sim-tune.test.ts:604–608).

## Remaining and new problems

1. MINOR — tests/tools/sim-tune.test.ts:631–655 — The test "the D06 checkpoint is unchanged by it"
   cannot catch the bug it is named for.
   - It runs Standard 104729 with the D06 checkpoint at 10 s and the horizon at 20 s. The first division
     is at 29.3 s, so both times have 0 daughters and no gain, carrier or branch. The continuation
     therefore cannot change the inheritance snapshot, which is the part the horizon puts at risk.
   - Repro: tmp/reverify-tune-g2/mutation.ts runs the same comparison against a copy of the tool whose
     `snapshot()` shares the live tallies instead of copying them (events, gainsByModule, bySpecies,
     carrierSeconds):
     - at 10 s / 20 s, the D06 checkpoint JSON with and without the horizon is EQUAL, so the bug is not
       detected;
     - the same mutation at Accelerated 130363, 150 s / 300 s (330 → 848 daughters), DIFFERS.
   - The shipped `snapshot()` copies everything (tools/sim-tune.ts:540–571), and the report's D06 tables
     match the pre-fix report. Today's numbers are therefore sound; only the regression guard is empty.
   - Fix: take the horizon on a run that has divisions and gains. For example, give the file's existing
     Accelerated 130363 150 s run a 180 s horizon, and compare its checkpoint with the plain 150 s run.
2. MINOR — docs/reports/tune-g2.md:1053–1055 — The bullet says "the Recycler bloom grows fastest after
   600 s (… 720–840 s and 780–900 s on the two Accelerated dishes)".
   - For Accelerated 314159, the report's own 60 s counts (line 630) are 8 → 35 → 248 at 780, 840 and
     900 s, then 806 at 960 s. The largest 60 s rise (+558) is at 900–960 s, outside the stated window.
     The analysis above gives the series to 960 s (lines 889–890).
   - The other two windows do contain their largest rise: Standard 104729 +303 at 720–780 s, Accelerated
     155921 +459 at 780–840 s.
   - Fix: write "720–960 s" for 314159, or say the bloom "starts" rather than "grows fastest".
3. MINOR — docs/reports/tune-g2.md:785–787 (already in the pre-fix text; not raised in round 1) — The
   claim that four Standard seeds "still match G1's population numbers exactly" is too strong.
   - Those seeds (130363, 155921, 262147, 314159) match G1's 600 s population and food tables.
   - But the 60 s living counts differ on two of them:
     - 130363 has 372 Sunbeads at 420 s (line 180) against G1's 373 (docs/reports/tune-g1.md:92);
     - 262147 has 448 at 540 s (line 183) against 449 (tune-g1.md:95).
   - Both dishes gained Reserve chamber before then (213.8 s and 221.3 s).
   - Fix: "match G1's 600 s population and food tables exactly; the 60 s counts differ by one Sunbead on
     130363 (420 s) and 262147 (540 s)".
4. MINOR — docs/reports/tune-g2.md:1022–1025, against 756–758 — The observer-overhead numbers are not
   traceable from the repo.
   - The sentence "the observed runs took between 1 % less and 10 % more wall time than the plain runs …
     (Standard 130363 to 1,200 s: 70.7 s against 68.5 s)" is in no table.
   - The analysis's own note says "Numbers that are in no table come from `sim:run --perf` … and one
     scratch counterfactual". That note does not cover these numbers.
   - They come from the tuner's stderr, which exists only in the session scratchpad (tune-full.stderr)
     and does not survive a restart.
   - The numbers are correct: I recomputed −1.4 % to +9.6 % over the 12 pairs from that log.
   - Fix: print the plain run's wall time in the "Plain run" cells (tools/sim-tune.ts:2335–2338 already
     measures it), or name the log as the source.
5. MINOR (nit) — tools/sim-tune.ts:1369–1370 and 1400 — The header can mislabel a change in tools/lib.
   - `SIM_ROOTS` covers src/sim and content. tools/lib is in `TOOL_ROOTS`, yet tools/lib/content-fs.ts
     builds the ContentRegistry that every run simulates from.
   - The header says tool changes "only read the world, so they change what is reported, not the
     simulated numbers". A local edit to content-fs.ts would be listed under that label, which would be
     wrong.
   - This report is unaffected, because tools/lib is clean.
   - Fix: move tools/lib to `SIM_ROOTS`, or word the sentence separately for each root.

## Commands and results (this session)

- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint tools/sim-tune.ts tools/sim-run.ts tests/tools/sim-tune.test.ts`: exit 0.
- `npx vitest run tests/tools/sim-tune.test.ts tests/experiments/secretion-sample.test.ts`: 2 files,
  27 of 27 tests passed (103 s).
- `npx tsx tmp/reverify-tune-g2/recount.ts` over 12 dishes: Standard 104729 and Accelerated 314159 to
  1,200 s, the rest to 600 s. Plain runs with no tool code. Exit 0; all hashes match the report, and the
  per-module recount and E01 measurements are as above.
- `npx tsx tmp/reverify-tune-g2/mutation.ts`: the shared-tallies mutation is not detected at 10 s / 20 s
  and is detected at 150 s / 300 s. The writing observer is detected.
- `npx tsx tools/sim-tune.ts --seeds 104729,130363 --presets standard,accelerated --seconds 30 --extend 60
  --horizon 90 --plain-check --out tmp/reverify-tune-g2/smoke.md`: exit 0. "same hashes" on all 4 runs,
  and the header shows HEAD 486dbf7.
- Table comparisons with tmp/verify-tune-g2-numbers/tune-1200.md (1,200 s) and with the pre-fix report
  (session scratchpad tune-g2.before-fix1.md): 0 mismatches. The 600 s D06 numbers are unchanged; only
  the intended columns and tables and the wall times differ.
- Not run: Playwright (as instructed) and the whole `npm run check` suite. I ran the typecheck, lint on
  the changed files, and the two test files that import these tools.
