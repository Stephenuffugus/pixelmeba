# Wave B fix report: experiments UI and EXP_C (P2.5)

Items 1–6 and 8–10 are fixed. Item 7 is not fixed in the tree: it needs edits to `src/worker/protocol.ts` and `src/ui/state.ts`, and those files are outside my assignment. A ready patch for it is at `/workspaces/pixelmeba/tmp/p25-item7-reopen-notice.patch`. Typecheck and eslint are clean, content is valid, every touched test passes, and the e2e spec passes on all three projects.

I copied the new tests into a `git archive HEAD` scratch copy and ran them there. All 10 behavioural tests failed on the old code (listed per item below).

## Per item

**1. Card copy — FIXED.**
- New `completionText(card)` in `src/ui/strings/experiments.ts`. Paired cards say both copies run to their stopping point and then stop, "your dish is unchanged", and closing the run discards them. Single-arm cards say "The world keeps running."
- `ExperimentCard.tsx` uses it and also lists the card's player steps.
- Proof: `journal-and-words.test.ts` "completion copy…" checks all 7 cards by kind, and the e2e checks the EXP_A card.

**2. Energy distributions — FIXED.**
- New measurements `groupEnergyMedian`, `groupEnergyMin` and `groupEnergyMax` (per founder group) in `pairedRun.ts`. EXP_C now lists them for both groups.
- `ArmResult.groupTimeline` is recorded beside `timeline` at the same seconds. Each sample gives the group's alive count and mean, median, min and max energy, with null when the group is empty.
- `timeline` itself is unchanged, because the golden file pins its hash. Wave A numbers are identical; the only additions are the new families, which I added to `NEW_FAMILIES` in `golden.ts`.
- Proof: two new `exp-c-reserve.test.ts` tests. One checks against an independent walk of parent links at 90 s; the other checks the 600 s run. On HEAD, `parseMeasure` reports "unknown measurement".

**3. Empty groups — FIXED.**
- `formatMeasure` and `formatDiff` take the same arm's record. An energy over nobody (group energies, or `meanEnergy.SP` when `alive.SP` is 0) now shows "none alive", and its difference shows "—". Raw values stay 0, as the golden file requires.
- Content validation now requires the matching count (`alive.SP` or `descendants.SP.GROUP`) whenever a card reports one of these energies.
- The results table uses the records. The Journal re-reads stamps from their raw numbers (`journalMeasureCells`), so old stamps display correctly too.
- Proof: `journal-and-words.test.ts` "an energy over nobody…" (2 tests) and a `framework.test.ts` validation test.

**4. Touch targets — FIXED.**
- `.compare-toggle .btn` now has `min-width: var(--target)` (48 px).
- Proof: the e2e measures the A/B toggle on the experiment run screen and the Compare screen on phones.

**5. Refused commands — FIXED.**
- In `host.ts`, only a command with no result or with accepted > 0 ends a single-arm card's observation.
- Proof: `app-flow.test.ts` "Food trail: a command that places nothing…". On HEAD it failed with an unwanted `experimentEnded`.

**6. "present at creation" — FIXED.**
- New `originChip()` in `src/ui/strings/modules.ts`: origin 2 gives "present at creation" and origin 1 gives "added by you or the recipe". One chip line in `Inspector.tsx` now uses it.
- Descendants of seeded founders are not labelled, because the Inspector has no founder-origin field. See the proposed decisions.
- Proof: `journal-and-words.test.ts` runs `buildInspector` on RESERVE_COMPARE_V1 founders.

**7. Reload notice — NOT FIXED in the tree.**
- **Why:** telling the player needs a new `experimentEnded` reason `'closed'` in `protocol.ts` and a toast in `state.ts`, both outside my files.
- **Already in the tree:** `experimentOf(world)` in `experiments.ts`, which survives save and load, and `experimentEndedText('closed', …)`. Both are tested in `app-flow.test.ts`.
- **What the patch does:**
  - `protocol.ts`: adds the `'closed'` reason.
  - `host.ts`: posts that notice when a card's dish is loaded from a slot or imported.
  - `state.ts`: shows the toast, loading the card catalog first if needed, and fills in the item 3 and paired-toast fixes described below.
  - `app-flow.test.ts`: adds a test.
- **Evidence:** checked in a scratch copy: typecheck clean and the host tests pass. `git apply --check` is clean on the current tree.

**8. Player steps — FIXED.**
- New `PlayerSteps` class in `experiments.ts`. The host holds the stamp from the moment the measured gate holds until every listed step is done. The stamp keeps the values from the gate moment. Steps come only from UI events and never touch simulation state.
- How each step is recognised:
  - **inspectFoodUse:** the selected organism is of a species the gate follows and took in food in the last second.
  - **openResourceHistory:** a `history` request for the dish.
  - **viewComparison:** the run's results are shown.
  - **viewPreyHistory:** a `history` request for an arm after the run is complete. This comes from a new "Population history, A and B" section on the results screen.
- `ComparisonExperiment` now carries `steps`, and the run screen marks each one ✓ or ○. Validation requires paired steps on paired cards and single-arm steps on single-arm cards.
- One existing test changed because this item changes the behaviour: "Cleaning crew" in `app-flow.test.ts` now opens History before expecting the stamp.
- Proof:
  - `app-flow.test.ts`: Cleaning crew (no stamp until History; it failed on HEAD), step before the gate, Food trail (no stamp for a cell or a non-eating Sprinter; stamp for an eating one), and EXP_106 (no stamp after the results; stamp after the arm history, equal to the headless stamp).
  - e2e: Cleaning crew and Predator balance journeys.

**9. Recipe text — FIXED.**
- RESERVE_COMPARE_V1 now reads "24 Sprinters with the same neutral traits … only the reserve chamber differs".
- The labels now say "Most energy held above the normal cap at one moment, all Sprinters together" and "Energy held above the normal cap, all Sprinters together".
- `docs/reports/experiments-g2.md` now says these are sums wherever it gives them. The existing label test was updated because the item changes the label.

**10. Journal storage — FIXED.**
- Added a "Journal storage" subsection to `docs/reports/experiments-g2.md` §6. It describes the localStorage store, what an entry holds, what is not saved or exported, and SPEC §14.1 / D-0027.

## Found outside my files
- The History sheet charts sugar, nutrient and oxygen but not debris. EXP_103, CLEANING_CREW_V1 and the DEBRIS material still say "open the resource history to see the debris total". I left that text unchanged.
- The `state.ts` stamp toast says "The dish keeps running." for paired stamps too. The item 7 patch switches it to `stampToastText`.
- For single-arm cards, a stamp that is waiting for a step is only explained on the card detail. There is no panel in the dish view that says so.

## Proposed decisions
- PROPOSED DECISION: A card's stamp needs its measured gate plus its `completion.playerSteps`, noted by the worker from UI events only. The stamp keeps the values of the moment the gate held. The headless runner stamps on the measured gate alone.
- PROPOSED DECISION: Energies over no living member are recorded as 0 and shown as "none alive". Cards must also report the matching count.
- PROPOSED DECISION: Founder-group energy distributions go in `groupTimeline`, beside the golden-pinned `timeline`.
- PROPOSED DECISION: The Inspector shows "present at creation" for lineage origin 2. Labelling descendants of seeded founders needs a founder-origin field in `EntityInspect`, which would be a snapshot and protocol change.

## Files changed
- **Owned:**
  - `src/sim/pairedRun.ts`, `src/sim/experiments.ts`, `src/worker/comparison.ts`
  - `src/ui/views/{ExperimentCard,ExperimentRun,Notebook}.tsx`, `src/ui/strings/experiments.ts`
  - `content/experiments/EXP_C.json`, `content/recipes/RESERVE_COMPARE_V1.json`
  - `tests/experiments/{app-flow,exp-c-reserve,journal-and-words,framework}.test.ts`, `tests/experiments/golden.ts`, `tests/e2e/experiments.spec.ts`
  - `docs/reports/experiments-g2.md`
- **Shared (minimal edits):**
  - `src/worker/host.ts` (experiment parts, plus one call each in the `view` and `history` handlers)
  - `src/ui/styles.css` (`.compare-toggle` only)
  - `src/ui/panels/Inspector.tsx` (one chip line and its import)
  - `src/ui/strings/modules.ts` (`originChip`)
  - `content/manifest.json` (hash rewritten by `--write`)
- **Created:** `tmp/p25-item7-reopen-notice.patch` (tmp/ is gitignored).

## Commands and results
- `npx tsx tools/content-validate.ts --write` then without `--write`: content ok, hash 7472589b…, 7 recipes, 7 experiments.
- `npx tsc -p tsconfig.json --noEmit`: clean. `npx eslint` on all 16 touched source and test files: clean.
- vitest:
  - `journal-and-words`: 9/9.
  - `app-flow`: 11/11.
  - `exp-c-reserve`: 14/14 (116 s).
  - Six card fixtures plus `framework`: 44/44 (487 s), including `expectWaveANumbers`.
  - `framework`, `tests/sim/comparison`, `tests/content`, `tests/recipes`, `tests/worker`, `tests/ui`: 15 files, 142/142.
- HEAD scratch copy: the new tests gave 10 failed and 2 passed. The 2 that passed are the step-before-gate test and the unchanged "change ends observation" test.
- `E2E_PORT=4184 E2E_OUTDIR=tmp/dist-p25fix npx playwright test tests/e2e/experiments.spec.ts --project=phone-portrait --project=desktop --project=phone-landscape`: 15 passed (7.3 min). This includes axe (no serious or critical violations), text ≥ 16 px and no horizontal overflow on the results with the history open, 48 px targets and 200 % text.
- `tests/e2e/compare.spec.ts` on phone-portrait and desktop: 4 passed.
- Port 4184 stopped and `tmp/dist-p25fix` removed.