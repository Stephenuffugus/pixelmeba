# P2.5 wave B report: one paired-run model, Experiment C, and the cards in the app

All three parts are built and tested. Experiment C runs end to end, but on RESERVE_COMPARE_V1 its observation gate is **not reached**. The fixture records why instead, and no mechanic, constant or recipe number was changed. Typecheck and eslint are clean on every file I touched, every test I touched passes, and the e2e specs pass on phone-portrait, phone-landscape and desktop.

## 1. One paired-run measurement model
- **New module `src/sim/pairedRun.ts`** holds the one observer (`ArmObserver`), the stepping (`PairedRun`, `stepObserved`) and the measurement grammar. It has two read-outs: named measurements for cards and gates (`measureArm`), and the comparison panel's summary (`measureSummary`).
- **`experiments.ts` and `comparison.ts`** now use it and re-export what their callers already imported. Comparison arms are stepped with the observer's read-only stage hook; state hashes are unchanged.
- **Proof of identical numbers:** I recorded every wave A number on a clean `git archive HEAD` copy, for the six cards and three comparisons. I then reran the same script on that copy with only my refactored files swapped in. All 2,771 values matched, including state hashes. The only additions were 164 keys, all in the new measurement families.
- **Speed:** a same-process benchmark showed no measurable cost.
- **Kept as a test:** the recording is `tests/experiments/golden/wave-a-measurements.json` (hashes left out). Every card fixture now ends with `expectWaveANumbers(r)`, and `tests/sim/comparison.test.ts` checks the three comparisons against it.

## 2. Experiment C (a Seeded traits demonstration)
- **Recipe:** `content/recipes/RESERVE_COMPARE_V1.json` follows CT §9.2 exactly. The five stable-food meals are the recipe's scheduled commands.
- **Card:** `content/experiments/EXP_C.json`. Arm A is the recipe as written (stable food). Arm B is the single meal, using a new change kind `omitScheduled` (one additive line in `schema.ts`).
- **New measurements:**
  - per founder group: `founders`, `descendants`, `groupEnergy` and `groupExtinctAt`, as `.SP.GROUP` (e.g. `B01.E05`);
  - per species: `reserveHeld` and `reservePeak`, the energy held above the normal 100 E cap.
- **Gate:** both copies ran 600 s, and in copy B a reserve chamber held energy above the normal cap.
- **Result on seed 104729:** not reached. `reservePeak.B01` is 0 in both copies at every tick, so the chamber's extra room is never used.
  - Energy peaks around 80–87 E, intake is limited by food access for every Sprinter from 30 s, and division halves energy.
  - Everything dies of starvation: copy B by 230 s, copy A by 488 s.
  - The reserve-chamber family died out 15 s (A) and 14 s (B) before the other family. That only coincided with the chamber's running cost.
- **Candidates measured in memory, nothing changed:**
  - a meal dose of 2.0 per cell reaches the gate on all 6 dev seeds (26.6–29.6 E stored);
  - both families still die out in both copies, and the reserve-chamber family never outlasts the other by more than 1 s on any seed.
- `tests/experiments/exp-c-reserve.test.ts` passes, asserting the limiting factor.

## 3. Cards in the app
- **Worker:** the protocol gains `experimentCatalog` and `experimentStart {cardId, newDishId, compare}`. The host realizes a card with the same `realizeExperimentArms` and `GateWatch` as the headless runner.
  - A paired card runs through the comparison engine with the card's change already on B. B refuses any other change, Clear change is refused, and the run length is forced to the card's stopping point.
  - Reaching the gate posts `experimentStamp`, and the world keeps running.
  - On a single-arm card, a player command ends the card's observation (`experimentEnded`); the dish goes on.
- **UI:** Home → Notebook (Journal · Experiments) → card detail showing every SPEC §13.2 part → Start.
  - Starting keeps the current dish in Continue first.
  - A paired card opens `ExperimentRun`, with the prediction note and the gate shown as measured.
  - The Journal (localStorage `pixelmeba.journal`, newest first, max 200) lists each stamp.
- `tests/experiments/app-flow.test.ts` shows that Experiment A in the app gives the same stamp, gate, card measurements and end hashes as `runExperiment`.

## Files
- **Created:** `src/sim/pairedRun.ts`, `content/experiments/EXP_C.json`, `content/recipes/RESERVE_COMPARE_V1.json`, `src/ui/journal.ts`, `src/ui/strings/experiments.ts`, `src/ui/views/{Notebook,ExperimentCard,ExperimentRun,ExperimentViewport}.tsx`, `tests/experiments/{golden.ts,golden/wave-a-measurements.json,exp-c-reserve.test.ts,app-flow.test.ts,journal-and-words.test.ts}`, `tests/e2e/experiments.spec.ts`.
- **Changed (owned):** `src/sim/experiments.ts`, `src/worker/comparison.ts`, the six card fixtures and `framework.test.ts`, `tests/sim/comparison.test.ts`, `docs/reports/experiments-g2.md` (new wave B section).
- **Changed (shared):**
  - Additive only: `src/sim/content/schema.ts` (one line), `src/worker/protocol.ts` and `client.ts` (new messages and methods), `src/ui/state.ts` (routes, actions, journal wiring), `src/ui/app/App.tsx` (routes), `src/ui/styles.css` (appended).
  - `src/worker/host.ts`: mostly additive; three statements replaced (two `step` calls → `stepDish`, and the `compareRun` branch).
  - `src/ui/views/Home.tsx`: the Notebook button is enabled.
  - `content/manifest.json`: the content hash was rewritten (now `86bd7cde…`).

## Commands and results
- `npx tsx tools/content-validate.ts --write`: content ok, 7 recipes, 7 experiments.
- `npx tsc -p tsconfig.json --noEmit`: clean. `npx eslint` on every touched file: clean.
- vitest, seven card fixtures: 38/38 passed.
- vitest, comparison, worker/host/protocol/whatif, deterministic-state, ui/family, app-flow, journal-and-words and framework tests: 85/85 passed.
- vitest, `tests/content` and `tests/recipes`: 45/45 passed.
- `E2E_PORT=4184 E2E_OUTDIR=tmp/dist-experiments npx playwright test tests/e2e/experiments.spec.ts tests/e2e/compare.spec.ts` on all three projects: 12/12 passed.
  - The experiments spec checks axe (no serious or critical violations) on every new screen, no text below 16 px, 48 px targets and 200 % text.
  - The existing compare spec also still passes.
- Port 4184 is stopped.

## Not done
- EXP_C does not reach its gate on V1, so per SPEC §13.2 it is not release-ready until a new recipe revision; choosing one is an owner decision.
- An experiment's in-app observation is worker state: saving and reloading that dish does not resume watching the gate.
- `completion.playerSteps` is not checked in the app yet.

## Needed elsewhere
- The Inspector (`src/ui/panels/Inspector.tsx`, owned by another agent) shows no "present at creation" label for lineage origin 2. Experiment C's reserve-chamber founders should carry it.

## Proposed decisions
- PROPOSED DECISION: One paired-run model in `src/sim/pairedRun.ts`, shared by the comparison engine and experiment cards.
- PROPOSED DECISION: Experiment C arms: A (control) is the recipe with the stable-food schedule; B is the single meal via `omitScheduled`, following D06 §8. The Run button reads "Accept the schedule and run both".
- PROPOSED DECISION: EXP_C's gate requires stored surplus in copy B (`reservePeak.B01 > 0`), the precondition of the card's question per D06 §11. Whether to adopt RESERVE_COMPARE_V2 with a meal dose of 2.0 is left to the owner.
- PROPOSED DECISION: A founder group is the organisms alive when the run starts, grouped by species and module set; births join their parent's group, and organisms introduced mid-run join none.
- PROPOSED DECISION: Starting a card replaces the open dish the way Play and New dish do, after an autosave to Continue, without writing a named save slot. A player command ends a single-arm card's observation. The journal lives on the device (localStorage) and stores each stamp with its labels as recorded.