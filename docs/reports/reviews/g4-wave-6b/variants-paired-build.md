# P4.5 Paired Garden variants (R2): build report (wave 6b, variants-paired)

## Checklist

### Build
1. **DONE.** The What if? sheet has a second action, "Compare with Garden (180 s)" (`data-testid whatif-pair`), with the line "Runs this idea and the unchanged Garden side by side for 180 seconds of dish time."
   - Where: src/ui/panels/WhatIfSheet.tsx:246-258; words in src/ui/strings/variantPair.ts.
   - It shows only for an idea of the Garden, never for R-G0 (`pairOffered`).
   - All-slots-used: the What if? FullStep carries `pair`, so export, replace and Cancel work for the pair as they do for Start (WhatIfState.tsx `startPairFromWhatIf` :156; WhatIfSheet.tsx:413).
   - Proven by: tests/e2e/variants-paired.spec.ts; tests/worker/variants-paired-host.test.ts (test 1, `pairOffered`).
2. **DONE.** The worker side:
   - Messages (src/worker/protocol.ts:296-313, :1212):
     - ToWorker `variantPairStart { requestId, variantId, newDishId, compare, sequential, keepFrom? }`.
     - FromWorker `variantPairStarted { requestId, info, compare, kept? }`. This is a new message: I did not reuse 'experimentStarted', which carries a cardId.
     - Refusals answer `whatIfRefused`, What if?'s readable refusal with no global error toast. A keep refusal answers `keepRefused`.
   - Host (src/worker/host.ts):
     - `variantPairStart` :1860. Both arms are realized from content (`prepareVariantPair`: realizeVariant for R-G0 and for the idea), then `keepFirst` (D-0033), then the ids are checked again.
     - It opens a NEW paused dish `newDishId` holding the idea's start (never stepped during the comparison), plus arms A and B. There are no interventions.
   - The horizon is fixed at 1800 ticks (`variantPairRun` :1935). Any other horizon refuses with "A Garden comparison always runs 180 seconds of dish time."
   - Stop (`variantPairStop` :1948) ends both arms at the same tick. The results say the seconds actually run ("each ran m:ss … (stopped early)").
   - Arms take no command: armCommand :1739 refuses with "The two dishes run as designed: this comparison takes no other change." compareReset :1167 refuses as well.
   - `ComparisonState.variantPair` (src/worker/comparison.ts:107; type `ComparisonVariantPair` in src/worker/variantPair.ts) carries:
     - variantId, revision, title, question;
     - identity "R-G1 / revision 1 / seed 104729", and baseIdentity for R-G0;
     - change, e.g. "B's sugar patch held 0.20 C per cell instead of 0.40." or "B's sugar patch was moved from (48, 64) to (48, 82)." (What if?'s "(48, 64)" spacing). Also changeShort;
     - sequential, phase, targetTicks;
     - sugarStart and sugarEnd.
   - Client: src/worker/client.ts:640 `variantPairStart`.
3. **DONE.** Sequential mode (src/worker/variantPair.ts `VariantPairRun` :187).
   - It runs A to the target with its observer, takes A's half of the results (`measureSummary` with stateHash, plus the sugar), and lets A go:
     - the runner drops A's world and observer (`startArmB` :323);
     - the host sends A's last snapshot, then deletes the A dish entry (`variantPairAfterA` :1956).
   - It then realizes B from its stored start, runs it to the same tick count, and composes the same `ComparisonResults` that PairedRun composes.
   - Until B starts, B's view shows the idea's start from the idea dish's own paused world.
   - Trigger: the UI passes `sequential = pairRunsSequentially()`, i.e. `navigator.deviceMemory` is a number ≤ 2 (src/ui/state.ts:1375). The setup says "This device runs the two dishes one after the other. Both get exactly 180 seconds."
   - Proven by: fixture (sequential deep-equals paired for all three ideas); host test (sequential = paired for the same stop tick; A is let go; Stop refused in B); e2e low-memory journey.
4. **DONE.** Results (src/ui/panels/CompareResults.tsx `PairHead` :181), when `variantPair` is set, in this order:
   - title "A smaller meal vs Garden", then the question and the change statement;
   - "this paired run" (`r.label`, i.e. PAIRED_RUN_LABEL);
   - the caveat "One paired run is an illustration, not a general rule.";
   - the first table: each kind alive in A and B ("both counts"), then "Sugar left in the dish" (dish total of dissolved sugar, A and B; start values under it);
   - then the existing measures: biomass, kinds alive, O2, deaths by cause, traits, modules, capacity, differences.
   - The prediction note (PredictionNote) and the conclusion picker are the existing P2.4 ones. The result card's change reads "“A smaller meal” — sugar patch held … (vs the unchanged Garden)".
5. **DONE.** Close (Done or the back button) runs `compareDelete`; the idea's dish (`sourceDishId`) is activated paused at 0:00. The toast reads "Comparison closed. “A smaller meal” is open, paused at 0:00." (src/ui/state.ts:1357). The comparison writes no save slot.
   - Proven by: host test (store unchanged across the run and Close; the idea dish's hash equals its recorded initialStateHash); e2e (0:00 · 56 alive, Run button).
   - The existing UI rule "autosave on comparison completion" (SPEC §14.2, onCompareState) still writes Continue with the open dish. That dish is the idea at tick 0, as an experiment card's paired run does today. I did not change it (see note 2).
6. **DONE (no content edit).** Goals on variants come through the goal catalog (sourceId); content/variants/* is unchanged.

### Done when
- **DONE.** tests/fixtures/variants-paired.test.ts, for R-G1, R-G2 and R-G3 against R-G0:
  - both arms start at tick 0 and run 1800 ticks;
  - A's hash equals R-G0 run alone (plain `step`, no observer) for 1800 ticks;
  - B's hash equals the idea run alone;
  - sequential results `toEqual` paired results, and the sugar left is equal;
  - initial sugar: R-G1 holds half the patch sugar, R-G2 double, R-G3 the same total (equal cell counts);
  - Stop: paired and sequential stopped at 75 ticks give equal results;
  - sequential B refuses Stop;
  - the change statements, and refusals for R-G0 and unknown ids.
- **DONE.** tests/worker/variants-paired-host.test.ts (DishHost, MemoryBackend):
  - refuses unknown, R-G0, a busy comparison and ids in use; nothing changes (no dish, no comparison, store byte-equal, open dish hash equal);
  - keeps the open dish first (slot1 holds exactly the open dish) and opens the idea at tick 0;
  - horizons 600, 6000, null and 1799 refuse and nothing runs;
  - commands to A and to B are refused; compareReset is refused;
  - the full run gives 1800 ticks each with empty command logs;
  - after Close the idea is at tick 0 with an unchanged hash, and the store is unchanged;
  - sequential: A is gone in phase B, Stop is refused in B, and the results equal paired.
- **DONE.** tests/e2e/variants-paired.spec.ts, on desktop and phone-portrait:
  - the full journey (Play → What if? → A smaller meal → Compare with Garden → prediction → Run at Fast → both counts, "Sugar left in the dish", "this paired run", the caveat → Can't tell → Done → "A smaller meal" at 0:00 · 56 alive, paused);
  - axe checks on setup and results;
  - plus a low-memory journey (deviceMemory 1 shows the sequential line; Close at setup opens the idea at 0:00).

## Where the code differs from the assignment's plan (the code wins)
- What if? keeps its own keep flow (`WhatIfKeep` with the FullStep panel) rather than the shared Keep sheet. The pair sends `keepFrom` through `keepFirst`, as planned. In the UI it reuses What if?'s FullStep, so the all-slots-used choice stays inside the What if? sheet.
- Refusals use `whatIfRefused`, not an error packet, so there is no double toast.
- `KeepFrom` keep result shape: `kept.slot.slotId`, not `kept.slotId`.

## Files
- **Created:**
  - src/worker/variantPair.ts
  - src/ui/strings/variantPair.ts
  - tests/fixtures/variants-paired.test.ts
  - tests/worker/variants-paired-host.test.ts
  - tests/e2e/variants-paired.spec.ts
  - this report
- **Changed (additive):**
  - src/worker/host.ts: imports, LiveVariantPair, cases, the P4.5 block before duplicateDish, and one-line hooks in compareReset, compareRun, compareStop, armCommand, compareState and pumpComparison.
  - src/worker/protocol.ts: two messages.
  - src/worker/client.ts: one method.
  - src/worker/comparison.ts: one optional field.
  - src/ui/state.ts: the P4.5 block after closeCompare, and the closeCompare toast.
  - src/ui/panels/WhatIfState.tsx, WhatIfSheet.tsx, CompareSetup.tsx (PairSetup, plus sequential progress in CompareRunning), CompareResults.tsx (PairHead and the Done text).
  - src/ui/views/CompareScreen.tsx: title, arm toggle labels, sequential progress.
- **Not touched:** src/sim, content, styles.css (no CSS needed), ExperimentRun.tsx, whatif.ts, compareCards.ts.
- The UI's `VARIANT_PAIR_SECONDS` and `VARIANT_PAIR_BASE` are local copies, so the main bundle does not import sim code. A host test asserts they equal the worker's.

## How each test fails without its mechanism (mutation checks, restored afterwards)
- Busy-comparison check removed from `variantPairProblem`: "refuses an unknown idea, R-G0 itself and a busy comparison" fails.
- armCommand's variant-pair refusal removed: the run test fails with "expected { accepted: 1, rejected: 0 } to be null".
- Sequential A stepped with a throw-away observer: the fixture "R-G1 vs R-G0 … sequential = paired" fails (births 208 vs 0, deaths by cause missing).

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: clean. An earlier run showed an error in tests/ui/narration-evidence.test.ts from the narration builder's in-flight edit; it was gone on the final run.
- `npx eslint <my 15 files>`: clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/variants-paired.test.ts tests/worker/variants-paired-host.test.ts tests/worker/whatif.test.ts tests/worker/compare-client.test.ts tests/worker/whatif-ui.test.ts tests/worker/protocol.test.ts`: **Test Files 13 passed (13), Tests 125 passed (125).**
- `E2E_PORT=4276 E2E_OUTDIR=tmp/dist-variants-paired npx playwright test tests/e2e/variants-paired.spec.ts --project=desktop --project=phone-portrait`: **4 passed (3.6m).**
  - Earlier runs failed twice: an axe scrollable-region violation on my counts table (fixed: the wrapper is focusable, with role region), and a phone layout shift on Play (see note 1).

## FENCE
None. There is no src/sim edit, no content edit and no fence value change. The g2-replay and four trajectory-fence files pass.

## Notes, and bugs noticed elsewhere
1. On phone-portrait, the Play page's What if? link moved out of view after `scrollIntoViewIfNeeded`, once, under load (`expectReachable` failed with viewport ratio 0). The Garden card grows after its thumbnail and goal offers load. tests/e2e/whatif.spec.ts uses the same helper and may flake the same way. My spec retries the scroll (`reachableAfterLayout`); the shared helper is unchanged.
2. Continue is written at comparison completion: state.ts onCompareState runs "autosave on comparison completion" (SPEC §14.2) for the source dish. For a variant pair, that is the idea's own dish at 0:00. This matches the experiment paired run and D-0033 "Continue is the last dish", and no named slot is touched. The lead may want it skipped for a never-run dish.
3. src/ui/views/CompareViewport.tsx (not mine) labels the arms "A · baseline" and "B · with your change", including on a variant pair. The toggle on CompareScreen says "A · Garden" and "B · {idea}". Suggested follow-up for the owner of that file: take the labels from `compareState.variantPair` when set.
4. ARCH §7 should gain an "As built, Phase 4 wave 6b" line for `variantPairStart` → `variantPairStarted | whatIfRefused | keepRefused`, and for `ComparisonState.variantPair`. I may not edit ARCH; this is for the lead.
5. Measured cost, fixture only and under shared load (perf is the lead's): one full pair took about 35-70 s of headless stepping. In the e2e, a full pair at Fast finished within about 1.5 min per project.

## Proposed decisions
- **PROPOSED DECISION: the Garden pair runs a fixed 1800 ticks (D09 "the existing 180-simulation-second paired comparison").**
  - compareRun with any other horizon refuses. Stop is allowed and ends both arms at the same tick, and the results say the time actually run.
  - The pair never takes a command (D09 "no extra commands by default"); there is no option to add one.
- **PROPOSED DECISION: sequential mode is chosen by the UI when `navigator.deviceMemory` is a number ≤ 2.** Unknown memory (Safari, Firefox, WebView without the API) runs paired.
  - A runs to the target first and is let go: its world, observer and dish entry go, and its last snapshot stays on screen. Then B is realized from its stored start.
  - Stop is allowed only while A runs, and B then runs to exactly A's tick count. While B runs, Stop is refused ("B must get exactly the same time as A"); the button is disabled with that line.
  - The results are the same ComparisonResults as the paired run (fixture-proven deep-equal).
- **PROPOSED DECISION: a variant pair opens a NEW paused dish holding the idea's start, as an experiment card's paired start does.**
  - The open dish is kept first (D-0033) after both arms are realized. A refusal keeps nothing.
  - Close opens that dish at 0:00 (it never ran), so the player can play the idea itself.
  - Refusals answer What if?'s `whatIfRefused`. With all slots used, the What if? sheet's own export/replace/Cancel step applies to the pair.
- **PROPOSED DECISION: the D09 "both counts and food remaining" rows.**
  - Both counts: living organisms of each kind present in A or B.
  - Food remaining: "Sugar left in the dish", the dish total of dissolved sugar (carbon), with the start totals shown under the table.
  - These two come first, ahead of the existing measures.
- **PROPOSED DECISION: goals on Garden variants come only through the goal catalog** (sourceId; D-0078/D-0079). content/variants/* stays without objectiveId (CT §9.4).
