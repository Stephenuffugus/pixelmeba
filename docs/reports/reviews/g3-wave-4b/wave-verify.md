# Wave verify: g3-wave-4b (a11y, perf, g3-evidence)

Verifier run 2026-10-10, 14:30–14:45 UTC. Read-only except this file; scratch in tmp/verify-g3-wave-4b-0/ (the HEAD copy and the e2e build output were removed afterwards). Port 4390 was stopped before and after the browser run.

Result: **ok = false.** There are 3 MAJOR findings and no BLOCKER:
- One MAJOR is a proven e2e regression from the a11y live region.
- Two MAJORs are P3.12 "Done when" criteria the builders reported honestly as not met.

## Commands run by the verifier

| Command | Result |
|---|---|
| `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/perf/stress-shape.test.ts tests/ui/a11y-contrast.test.ts tests/ui/a11y-describe.test.ts --reporter=verbose` | Test Files 9 passed (9), Tests 68 passed (68), 247 s. Closed lid: C 5.220e-15, N 1.080e-13; 731 births, 320 deaths. stress-shape 15.8 s at load about 2.7 |
| `npx tsx tools/perf-stress.ts --hashes --stress-only` on the current tree, and on a `git archive HEAD` copy with tools/perf-stress.ts added | Outputs **identical**. stateHash at tick 0/600/1500/3000: 3f7d911d9248adfc / c072e2c9e4167cea / 7d122e1d11c2192b / 095952d6d6af35cf. Snapshot digests: f1e9f78e20836327 / 31332f0ec6f57340 / e439632697c5eeb1 / c1bfb16f259065d7 |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npx eslint` on every modified file and every new file | exit 0 |
| `E2E_PORT=4390 E2E_OUTDIR=tmp/dist-verify-g3-wave-4b-0 npx playwright test tests/e2e/compare.spec.ts tests/e2e/inspector.spec.ts --project=desktop -g "A refuses the change\|taps around the dish edge"` | **2 failed**: strict-mode violations caused by the live region (see the first MAJOR) |

## Findings, most severe first

### MAJOR [a11y] The live region breaks existing e2e specs

Where: src/ui/a11y/LiveRegion.tsx:13 and App.tsx:40. The failing locators are tests/e2e/compare.spec.ts:99, compare.spec.ts:143, compare.spec.ts:151 and inspector.spec.ts:130.

What is wrong:
- The always-mounted sr-only live region repeats every toast's text.
- Every page-level `page.getByText('<toast text>')` therefore resolves to 2 elements, and Playwright strict mode fails.
- The builder listed 3 of these locators and missed **compare.spec.ts:143** ('A is the baseline and stays unchanged…', a `showToast` from CompareViewport.tsx:74).
- The gate's full e2e run fails until the lead scopes these locators, for example to `.toast`.

Repro: the Playwright command in the table above.
- compare.spec.ts:128 fails at :143: "strict mode violation: getByText('A is the baseline…') resolved to 2 elements: div.toast, div[data-testid=live-region]".
- inspector.spec.ts:95 fails at :133 the same way for 'Outside the dish.'.
- compare.spec.ts:99 and :151 have the same pattern and will fail too.

### MAJOR [perf] P3.12 tick-cost criterion is not met

Where: docs/reports/perf-g3.md:46 and BUILD_DIRECTIVE.md:570 ("Done when: 1× tick < 10 ms at target population on the dev machine").

What is wrong:
- The measured CPU p95 is 23.9 ms (p50 18.8, p99 42.6) at 6,000 agents.
- This is reported honestly as not met, with the limiting stages: sense/move 7.3, intake 4.8, environment 2.7 and structures 2.7 ms.
- The assignment accepted "or the measured limiting stage and the remaining gap", so the builder did what it was asked.
- The BUILD_DIRECTIVE criterion is still unmet. G3 cannot record P3.12 as done without an owner ruling or the quiet-machine re-measure (W6-12).

Repro: perf-g3.md, "Tick cost" table.

### MAJOR [perf] P3.12 memory criterion is not met; the genome table grows without bound

Where: docs/reports/perf-g3.md:218-262 and src/sim/genome.ts:3.

What is wrong:
- The heap slope in the assigned 15-minute run (with the save at tick 3,000) is 1.73 %/min over minutes 5–15. The criterion is < 1 %.
- The 41-minute run without a save gives 0.97 %/min.
- BUILD_DIRECTIVE.md:570 says "no unbounded memory growth". The genome table and the `profiles` cache grow with every new genome (about 100 per minute in the dense dish).
- I confirmed that src/sim/genome.ts:3 claims "compaction (P1.2) rebuilds it from referenced genomes", but no compaction exists in src/. A grep for "compact" in genome.ts, serialize.ts and world.ts finds only that comment.
- This needs either the PROPOSED compaction (a ruleset decision, because it changes genome ids and the hash) or an owner ruling on the criterion.

Repro: perf-g3.md "Memory"; `grep -rn compact src/sim/genome.ts`.

### MINOR [a11y] DishSummary says "extinct" for a species that is only held in a Sample

Where: src/ui/a11y/describe.ts:61 and DishSummary.tsx:23.

What is wrong:
- sampleTake frees the slots of the held organisms (src/sim/sample.ts header: "Slots are freed"), so SnapshotMsg.speciesCounts drops to 0 for that species.
- The summary then reads "<Species>: extinct in this dish — none alive now, after members were seen" while the organisms sit in the held sample.
- This is a visible claim that does not trace to the measured state.

Repro: Take a Sample (Life or All) around the only Cordweaver network. Whole fungal components are taken together.

Fix: count held organisms (heldSummary) or word it "none in the dish now; N held in the sample".

### MINOR [a11y] keyboard.spec's second test does not prove two of its claims

Where: tests/e2e/keyboard.spec.ts:173-202.

What is wrong:
- The title says "arrows pan the dish under the reticle", but nothing asserts that the camera or the view moved after 6 × ArrowDown.
- The CellDescription assertions run only when Enter happened to open a cell inspector (`if (/^Cell /.test(...))`). When Enter selects an organism or opens the candidate list, the cell description is never checked.
- So neither the panning nor the CellDescription text is necessarily exercised.

Repro: read the branches at :178-195.

### MINOR [a11y] The UX §6.1 palette value for danger changed without a DECISIONS entry

Where: src/ui/styles.css:14.

What is wrong:
- `--danger` is #AD4239. UX_SPEC.md:233 gives "danger (rare) `#B3473F`".
- The change is justified: #B3473F is 4.44:1 on --surface-2, and UX §4.1 requires 4.5:1.
- It is recorded only as a PROPOSED DECISION in a11y-build.md. Per CLAUDE.md "Decide, log, continue", it needs a docs/DECISIONS.md entry. The lead owns that file.

### MINOR [a11y] The DishSummary trend uses counts, not the assigned History biomass

Where: src/ui/a11y/DishSummary.tsx:8-13.

What is wrong:
- The assignment asked for the trend from `client.history(...)` HistorySample.biomass.
- The builder's reason is correct: host.ts:705 calls `experimentHistoryOpened(d)` on every 'history' request, so polling it would tick EXP_103 and EXP_106 player steps.
- The deviation is documented and the wording says "count", so it is honest. It needs the lead's ruling, or a read-only history flag (a protocol change).

### MINOR [a11y] restoreFocus can make Enter place at the centre for a pointer user

Where: src/ui/views/DishScreen.tsx:137-144.

What is wrong:
- restoreFocus also runs after pointer actions: closing a sheet by choosing a species with the mouse leaves focus on the body.
- The dish-focus element is then focused programmatically, with no :focus-visible, so the reticle is hidden.
- A later Enter press then commits a placement at the hidden centre.
- This is plausible from reading the code. It was not run.

### MINOR [g3-evidence] §8 item 4 files genome-table compaction under the tick gap

Where: docs/EXPANSION_RESPONSE.md, §8 item 4.

What is wrong:
- The item lists "genome-table compaction (genome ids are hashed)" among "Owner rules decisions that would close the tick gap".
- perf-g3.md presents compaction as the memory fix, not a tick-cost fix. The owner may misread what each decision buys.

### MINOR [g3-evidence] The D-0015 re-measurement cannot be reproduced from the repository

Where: docs/reports/tune-g3.md:3794-3811.

What is wrong:
- The script that produced the table is tmp/evidence/d0015-remeasure.ts, which is git-ignored scratch.
- The committed report cannot be regenerated by the lead or the owner.
- Fix: commit it under tools/ or tests/helpers, or paste the exact patch list into tune-g3.md.

### MINOR [lead] The inspector's sugar-sources line names absent species and omits E01 carriers

Where: src/worker/snapshot.ts:611 (`sugarSourcesOf`), worded by src/ui/strings/shortcuts.ts:63.

What is wrong:
- I confirmed that it iterates `world.species`, the recorded list, and only native `E_STARCH_SECRETION`.
- "Sugar here can come from … Cordweavers' enzyme" therefore appears with no Cordweaver in the dish, and E01 carriers are never named.
- This predates this wave. The g3-evidence builder reported it, and it is listed in EXPANSION_RESPONSE §8 item 27.

### MINOR [lead] relationships-g3.md has a stale contentHash header

Where: docs/reports/relationships-g3.md:5.

What is wrong:
- The header still names contentHash `e5bf702e827b3508…`; the manifest has 8a004f51….
- Per the builder, the rows are unchanged. Regenerate the file (D-0063).

## Verified OK

### a11y

- **Focus ring:**
  - The `:focus-visible` rule keeps the 3 px amber outline at a 2 px offset and adds `box-shadow 0 0 0 7px #172C35` (styles.css:70-74).
  - The ink shows inside the amber (0–2 px) and outside it (5–7 px).
  - contrast.md "Focus ring" reports ≥ 3:1 on all 14 surfaces audited, taking the better of the two colours on each.
  - tests/ui/a11y-contrast.test.ts passes.
- **Keyboard map:**
  - Enter at the reticle is added inside the existing window keydown handler (DishScreen.tsx:168-181). No second listener was added.
  - It sits after the What if? guard (D-0026) and after `handleViewKey`.
  - It calls the same `labGestures` object passed to attachGestures (`gestures.current = labGestures(...)`, :109).
- **Live region:** one sr-only `role=status aria-live=polite` region is mounted in App.tsx. role and aria-live were removed from the visible toasts in DishScreen, CompareScreen, ExperimentRun and PageToast.
- **Simplified overlay palette:**
  - Optional setting, default false (state.ts:90).
  - colormapFor, paintOverlay and legendStops take an optional argument, and the defaults are unchanged.
  - The renderer edits are limited to the palette switch and the newborn fade under reduced motion, as the assignment allows.
- **Unit tests:** tests/ui/a11y-describe.test.ts (9) and a11y-contrast.test.ts (6) are pure, run in node, and pass.
- **a11y-screens.spec:** it asserts the exact list of visited screens (`Audit.done`), so a skipped screen fails. It covers every screen family the assignment names, and it fails on serious or critical axe findings.
- **Edits outside ownership:** none. There are no content/, art/src, src/sim or src/worker edits by a11y, and no schema, protocol or manifest change.

### perf

- **Hash neutrality, independently re-proven:**
  - The stress-world stateHash at ticks 0, 600, 1,500 and 3,000 and all four snapshot digests are identical between HEAD and the current tree (table above).
  - g2-replay and the four trajectory-fence files pass on the current tree (68/68 in my run).
- **Reading of every src/sim diff:**
  - The `Object.fromEntries` construction keeps the same key order.
  - The intake index lookups use the same arrays and the same arithmetic.
  - The food scores keep the same per-cell order.
  - Skipping the prefix-sum window is sound: a cross < 0 trace only visits cells in the bounding box of its start and end cells, every step with t ≤ 1 stays inside it, and `traceCount` is read only after cross ≥ 0 traces (movement.ts:385).
  - `suitabilityAt(..., true)` is equivalent for non-crossers, because canOccupy is habitatCompatible.
  - `Math.hypot` is moved to the early-return paths only.
  - fungalNetwork gives the same partners in the same order; `neighbors`' isAlive check is implied by refValid.
  - The early return in linkMaskOf is equivalent, because the transfer bit requires mask ≠ 0.
  - Marking film inactive is sound: fieldActive is never saved or hashed (world.ts:191 only), filmStage's skip needs both film and filmN inactive, and every film writer marks the field (construction.ts:143; sample.ts, tools.ts and commands.ts mark generically).
  - creationFounders' memo is safe, because Undo, rollback and reload build a new World (host.ts:651 `deserializeWorld`).
- **stress-shape test:**
  - It asserts 6,000 agents with 2,000 fungal segments, the visual and transport link counts, every system in the manifest, E04/E07/E10/E12 carriers (≥ 12 each), gel, sediment, wall, bead, V01, breaker, pellet and wafer.
  - It steps until 17 mechanisms have acted.
  - It ran in 15.8 s, inside the ~20 s budget.
- **render-bench-run:** reads E2E_PORT, with 4176 as the default (W6-14).
- **Ownership:** no src/render, src/ui or content edits by perf.

### g3-evidence

- **§1 versions** match content/manifest.json:
  - simulationVersion 3, evolutionRulesVersion 1, moduleRegistryVersion 2, contentVersion 2, buildPhase 3;
  - contentHash 8a004f51…;
  - SCHEMA_VERSION 4 (world.ts:36) and PROTOCOL_VERSION 2 (protocol.ts:23).
- **§2 scope** is correct: 19 species, modules E01, E03–E10 and E12 (10), 8 systems, 18 recipes.
- **Conservation line:** the Appendix A percentages are converted correctly (6.13e-15 relative is 6.1e-13 %).
- **determinism-g3:** compares relationally, with no 16-hex hash literal in it or in launch-ecology or stress-shape. It covers every listed Phase 3 system, a held-then-transferred sample, and three negative controls.
- **launch-ecology.spec:**
  - It follows the assigned journey: the Gel start choice, the Lab with the Life tray, never pressing the view toggle, and Field Guide → Back with an equal hash and time.
  - It reaches the worker only through watchWorker and workerHash.
  - Its `.toast`-scoped locators are not affected by the live region.
- **tune-g3 D-0015 tables:** the per-seed Recycler columns agree with the range and "extinct on n/6" columns for all five candidates.
- **Ownership:** no src/ or content/ edits by g3-evidence. The only code change is its own test (`recipeId: null`), and tsc is clean.
