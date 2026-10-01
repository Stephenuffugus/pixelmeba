# g3 wave 3 — e1-producers build report (P3.6 part 1)

Builder: e1-producers (port 4231). 2026-10-01. Nothing committed (the lead commits).

## Checklist — Build

- DONE — Manifest: enabledSpecies += B07, B08, Y02; enabledMaterials += M01, M03, M04, M05, M09 (one edit, sorted). `content/manifest.json`. Content hash written with `content-validate --write` (final validate: `content ok`, 19 species enabled — F02 is f02-links').
- DONE — implemented.ts: `E_OIL_SECRETION`, `E_PROTEIN_SECRETION` (`src/sim/content/implemented.ts:8`).
- DONE — phenotype: native `ProducerRules` {source 'native', ENZYME_EMIT_RATE, ENZYME_EMIT_MIN_ENERGY, ENZYME_EMIT_COST, ENZYME_LOCAL_CAP} for E_OIL_SECRETION / E_PROTEIN_SECRETION (`src/sim/phenotype.ts:163`, `:170`, `:343-344`). Proof: producers.test.ts:56.
- DONE — movement foodScore: oil and protein terms after the starch term (`src/sim/movement.ts:183-191`); B06/E01 unchanged (no oil/protein rules) — fence + g2 replay pass. Proof: producers.test.ts:229.
- DONE (verify only) — secretion.ts (mod-builders'): emits 0.02/s into its own cell while Active, E > 35, substrate in cell or four-neighbour, activity < 1.0; 0.40 E/s; refusal codes ENERGY_LOW / NO_SUBSTRATE / SATURATED; non-Active skipped before any write (structures.ts stageStructures). Tests assert FLAG.secreting + secretionCode, never the secreting column. Proof: producers.test.ts:70, :101.
- DONE (verify only) — conversion.ts / transport.ts against SPEC §5.3: min(substrate, 0.10 × activity/(1 + breaker) × dt), proportional bound N (oil → free nutrient), pre-reaction pools, no chaining; enzymes half diffusion, −2 %/s; breaker normal diffusion, −1 %/s. Proof: producers.test.ts:146, :168, :178.
- DONE — Materials M01 (0.02/0.10/0.50 C + 0.10 N/C), M03/M04/M05/M09 (0.1/0.5/1.0) were already content; offered in the Lab trays: `src/ui/strings/lab.ts:37` (FOOD += M01), `:47-53` (CHEMISTRY += M03, M04, M05, M09), MATERIAL_COPY `M01`, `M03-M05` (`enzymeCopy`, :288), `M09` (:277); swatches `src/ui/styles.css` `.sw-m01`… (:1337).
- DONE — Reaction ledger: `src/sim/reactions.ts` (per-cell, per-enzyme C and N converted, current and last whole second; lazily allocated; observation only), recorder hook `src/sim/conversion.ts:74` (one call per rule and cell), World field `reactionCells` (`src/sim/world.ts:136`, `:206`), registered in `tests/helpers/trajectory.ts` POST_G2_DERIVED_KEYS. Worker rows `src/worker/snapshot.ts:663 reactionLines` / `:643 producersNear` (protocol `ReactionRow`, `CellInspect.reactions?`, `src/worker/protocol.ts:716-740`). UI `src/ui/panels/ReactionLedger.tsx`, copy `src/ui/strings/reactions.ts`, mounted in the cell inspector `src/ui/panels/Inspector.tsx:736`. Per enzyme: activity, effective activity (breaker named), substrate present, converted and product made last second, bound N moved (oil: "released as free mineral nutrient"), dish last second and cumulative (`world.conversionTotals`). "Made here by {species}" only with a living producer of that enzyme in the cell or a four-neighbour, else "Enzyme present". Proof: producers.test.ts:211, :255; e2e reactions.spec.ts.
- DONE — Body text ≥ 16 px: ledger is `<p>` body text (`.reaction-ledger`, styles.css :451); wave 2's "Biofilm here" and "Network" lines moved out of the 14 px `.kv` grid into `.inspector-line` paragraphs (`Inspector.tsx:519`, `:524`; `film-here` testid kept on the number so film-fungi.spec still parses it). Proof: reactions.spec (expectTextAtLeast16px on the ledger), film-fungi.spec passes.
- DONE — Food-access overlay (PROPOSED DECISION below): `OverlayId += 'foodAccess'` (protocol.ts:35), `packOverlay(world, id, out, selection)` → `packFoodAccess` (`snapshot.ts:320`, `:341`); host passes the view selection (`src/worker/host.ts:2103`, one argument); OVERLAYS entry (`lab.ts:475`), offered in every dish like light (`OverlayPicker.tsx:22`); default 'food' colormap (no layers.ts change). Proof: producers.test.ts:328; reactions.spec (Lab → Observe → Food access toggles with its legend).
- DONE — omitFounders change: schema `src/sim/content/schema.ts:291`; validation (last group only) `src/sim/experiments.ts:280`; realization `:534-541`; words `src/ui/strings/experiments.ts:235` ("The same, without the 20 Brothmaker founders."), `src/ui/views/ExperimentRun.tsx:52` ("B · without Brothmakers").
- DONE — Recipes SHARED_LUNCH_V1 (201), OIL_NEIGHBORHOOD_V1 (202), PROTEIN_CHAIN_V1 (203; Y02 group first, then B08; protein 0.50 + proteinN 0.05), BROKEN_CATALYST_V1 (204; Shared lunch's setup, own seed). Cards EXP_201 … EXP_204 (question, recipe, intervention, predicted tradeoff, measurements, stopping point, confounds, journal stamp; gates as assigned).
- DONE — Pinned card lists extended: tests/experiments/framework.test.ts, app-flow.test.ts, journal-and-words.test.ts (paired: 203, 204), tests/e2e/experiments.spec.ts (11 cards). Also tests/ui/diet-line.test.ts EXPECTED += B07, B08, Y02 and the P01–P04 lines that now name them.
- DONE — Fence: `npx tsx tools/fence-update.ts --add` for the four recipes (currentDigests 0c312485379ed15d, 4ce88e76450e4b03, 3754a631f383dd83, 0143728607d74854). No existing entry changed.

## Checklist — Done when

- DONE — tests/fixtures/producers.test.ts (18 tests): exact 0.40 × dt per emitting tick for B07 and B08, 0 otherwise (:70); each refusal code incl. four-neighbour vs diagonal substrate and the non-Active case (:101); each enzyme conserves C and N to 1e-12 with checkLedger ok (:146) plus a closed 60 s dish (:190); breaker 1.0 halves conversion (:168); decay and diffusion rates exact (:178); foodScore 0.5 × avail(substrate) only while E > 35 (:229); credit follows producer position (:255); prey rows CT §3.2 (:289); reaction record window (:211); food-access overlay (:328).
- DONE — tests/experiments/e201-e204.test.ts (11 tests): all four gates reached on the shipped content (no mechanics or constants changed); EXP_203 arm B keeps every Y02 cell and birthId and makes zero broth; EXP_204 reports B − A (−9.90 C; B < A measured); E201/E202 balances; determinism (EXP_202 twice). Section "E201–E204 (G3)" appended to docs/reports/experiments-g2.md (incl. the measured limiting factor: E202/E203 producers starve).
- DONE — tests/e2e/reactions.spec.ts (desktop): Notebook → Experiments → EXP_202 (one dish) → 4× → taps patch cells at points no organism can be picked (positions from the worker's snapshots) → ledger shows "oil carbon became … metabolite", "Made here by Oilwick" exactly where an Oilwick is in the cell or a four-neighbour and "Enzyme present" otherwise (both kinds read when both exist) → Lab → Observe → Food access (48 px target) toggles with its legend; text ≥ 16 px; axe clean.
- DONE — Non-vacuity (each mutation applied, the named test run, then reverted):
  - foodScore oil term disabled → "foodScore: a producer weighs 0.5 × avail…" fails (expected 60.5 to be 64.5).
  - producersNear neighbourhood replaced by the whole dish → "the reaction ledger credits a producer only in the cell or a four-neighbour…" fails (expected ['B07'] to equal []).
  - last-group rule disabled → "only the last founder group can be omitted…" fails (expected [] to equal ['change.founderIndex']).
- DONE — Fence unchanged apart from the four added recipes (fence + g2 replay pass).

## Files

Created: src/sim/reactions.ts, src/ui/panels/ReactionLedger.tsx, src/ui/strings/reactions.ts, content/recipes/{SHARED_LUNCH_V1,OIL_NEIGHBORHOOD_V1,PROTEIN_CHAIN_V1,BROKEN_CATALYST_V1}.json, content/experiments/EXP_20{1,2,3,4}.json, tests/fixtures/producers.test.ts, tests/experiments/e201-e204.test.ts, tests/e2e/reactions.spec.ts, this report.
Changed (owned): src/worker/snapshot.ts, src/ui/panels/Inspector.tsx.
Changed (shared, additive): content/manifest.json, src/sim/content/implemented.ts, src/sim/phenotype.ts, src/sim/movement.ts, src/sim/conversion.ts, src/sim/world.ts, src/sim/content/schema.ts, src/sim/experiments.ts, src/ui/strings/experiments.ts, src/ui/views/ExperimentRun.tsx, src/worker/protocol.ts, src/worker/host.ts (one argument), src/ui/strings/lab.ts, src/ui/panels/OverlayPicker.tsx, src/ui/styles.css, tests/helpers/trajectory.ts, tests/fixtures/fence.json (tool), tests/experiments/{framework,app-flow,journal-and-words}.test.ts, tests/e2e/experiments.spec.ts, tests/ui/diet-line.test.ts, docs/reports/experiments-g2.md.

## Commands and results

- `npx tsx tools/content-validate.ts --write` → `wrote contentHash …`; final `content-validate` → `content ok · … species 38 (enabled 19) … recipes 11 · experiments 11`.
- `npx tsc -p tsconfig.json --noEmit` → clean. `npx eslint <26 touched files>` → clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/producers.test.ts tests/experiments/e201-e204.test.ts tests/experiments/{framework,journal-and-words,app-flow}.test.ts tests/worker/{host,protocol}.test.ts tests/helpers/trajectory.test.ts tests/content tests/ui tests/fixtures/{enzyme-source,module-accounting,predation-matrix}.test.ts tests/sim/{stage8-order,lab-commands}.test.ts tests/experiments/{inspector-step,secretion-sample}.test.ts tests/render/layers.test.ts` → `Test Files 3 failed | 38 passed (41)`, `Tests 3 failed | 475 passed (478)`; the three: my overlay test (threshold, fixed), diet-line (fixed for my species), comprehension-labels M5 (F02, not mine — below).
- Rerun `npx vitest run tests/fixtures/producers.test.ts tests/ui/diet-line.test.ts tests/fixtures/trajectory-fence tests/fixtures/g2-replay.test.ts` → `Test Files 1 failed | 6 passed (7)`, `Tests 1 failed | 66 passed (67)`: the one failure is diet-line's species list missing F02 (f02-links enabled it; its line is "Eats sugar, then debris.").
- `npx vitest run tests/experiments/e201-e204.test.ts` → `Tests 11 passed (11)`.
- `E2E_PORT=4231 E2E_OUTDIR=tmp/dist-e1-producers npx playwright test tests/e2e/reactions.spec.ts --project=desktop` → `1 passed (3.1m)`.
- Same with `tests/e2e/experiments.spec.ts tests/e2e/film-fungi.spec.ts -g "Notebook → Experiment A|Velvet is refused"` → `2 passed (6.6m)`.
- `npx tsx tools/fence-update.ts --add SHARED_LUNCH_V1|OIL_NEIGHBORHOOD_V1|PROTEIN_CHAIN_V1|BROKEN_CATALYST_V1` → four "added recipe … to tick 1200" lines.

## FENCE notes

- No existing fence value changed. Four entries added (g2Digest null).
- FENCE: OIL_NEIGHBORHOOD_V1, PROTEIN_CHAIN_V1 — their currentDigests were recorded with `secreting = 1` for B07/B08 (the `secreting` column is digested). When mod-builders makes `secreting` a producer bit set (oil 2, protein 4) these two digests move; the lead re-records them under that decision. All four also move at the module flip (Standard preset).

## Bugs and notes for other owners

- tests/ui/comprehension-labels.test.ts "M5: the Sprinter says where sugar here can come from" fails because F02 (enabled by f02-links) natively releases starch enzyme, so the sentence now names Cordweavers too. Owner: f02-links / lead.
- tests/ui/diet-line.test.ts EXPECTED needs `F02: 'Eats sugar, then debris.'` (f02-links' species; I did not add it to avoid a duplicate key).
- f02-links' "Transport" inspector line is already an `.inspector-line` paragraph (16 px).
- src/sim/phenotype.ts Profile comments "Null for every species until P3.6" are now stale (mod-anchor-light's file).
- Environment: in this container's shell `grep` resolves to a broken wrapper ("claude native binary not installed"); `/bin/grep` works.

## Proposed decisions

- PROPOSED DECISION (food-access overlay, SPEC §10.8): per cell, the carbon of the pools the selected organism's species can eat now — its profile foods plus film when it digests film in a film world (the inspector's "Food here" list); with no organism selected (or a cell selected), the carbon every enzyme made accessible in the last whole second. Legend low → high, 'food' colormap, offered in every dish (derived, like light), observation only (tested: state hash unchanged).
- PROPOSED DECISION (E203 "protein 0.50 with N 0.05"): N 0.05 is bound nutrient (proteinN 0.05 = 0.10 N per C); no free nutrient beyond the Water Garden's own 0.10 background.
- PROPOSED DECISION (reaction ledger): "last second" is the last complete simulated second (ticks 10s…10s+9), recorded per cell and enzyme in an observation-only, unsaved, unhashed store that starts empty after a load or duplicate; "Made here by {species}" names every species with a living organism whose profile holds that enzyme's producer rules (native or module, any life state) in the cell or a four-neighbour — SPEC §5.3's emit neighbourhood — and "Enzyme present" otherwise. It does not claim which producer made which unit.
- PROPOSED DECISION (omitFounders): a paired card may omit only the recipe's last founder group, so every earlier group keeps arm A's cells and birth ids (founders are placed group by group, nearest-first).
- PROPOSED DECISION (E201/E202 single-arm, no player steps; E204 gate = both copies ran 120 s with converted.starch measured; the comparison is reported, never forced).
- OWNER FLAG (balance): in E202 and E203 every Oilwick and Brothmaker starves (154 s / 149 s): one producer's 0.02 activity/s, 2 %/s decay and 0.10 × activity conversion feed far less than its 0.38–0.40 E/s upkeep plus 0.40 E/s enzyme cost. CT numbers as written; a fix would be a content tuning question (recipe revision or CT §12.6), not done here.
