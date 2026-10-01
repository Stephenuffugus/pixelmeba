# g3 wave 3 — wave verify 1 (rules, determinism, conservation, tests, player-facing truth)

Scope: e1-producers, f02-links, food-objects, tools-sample. Uncommitted working tree, 2026-10-01.
Verdict: **ok = false**. There are 2 MAJOR problems: a conservation leak through import, and `npm run check` is red.

## Problems (most severe first)

- MAJOR [food-objects] src/sim/objects.ts:292 (objectReleasePlan) and :123 (foodObjectProblem) — the import accepts any pool on any object kind. The release code only looks at the pools its kind's rule names, so a pellet that also holds starch counts as emptied once its sugar is gone. It then leaves the store with the starch carbon still inside, and that carbon disappears from the ledger. The build report says such an object "could never empty", which is wrong: it empties and destroys carbon. Repro (probe tmp/verify-g3-wave-3-0/obj-leak.test.ts):
  1. `placeObject(w, cell, 'pellet', {sugar: 0.004, starch: 0.5}, 0.05)`.
  2. `buildSaveFile` → `loadSaveFile`: it loads without complaint.
  3. Run 3 ticks: objects left 0, total carbon 5652.504 → 5652.004, `checkLedger(world).ok` = false.

  Fix: refuse pools outside `FOOD_OBJECT_RULES[kind]` in `foodObjectProblem` (SPEC §14.3 "nonnegative pools, reference integrity…"), or release every held pool.
- MAJOR [f02-links] content/manifest.json (enabledSpecies += F02) — enabling F02 breaks two existing tests, so `npm run check` is red. Run `npx vitest run tests/ui/diet-line.test.ts tests/ui/comprehension-labels.test.ts`: 2 failed.
  - diet-line "every species enabled after wave 2…" has no F02 row.
  - comprehension-labels M5: the Sprinter's sugar-source sentence now also names Cordweavers' enzyme.

  e1-producers reported both and left them alone. The lead must add `F02: 'Eats sugar, then debris.'` to diet-line (it shares a block with e1's B07/B08/Y02 edit) and update the M5 expectation before committing.
- MINOR [tools-sample] src/sim/sample.ts:441 and :445 — two of Transfer's destination checks are untested.
  - A load-time mutant that disables `habitatCompatible` leaves tools.test.ts and sample-transaction.test.ts at 19/19 passing.
  - A mutant that disables the soft-capacity-8 check also leaves them at 19/19.
  - The Build list requires both checks. Only the stone/field refusal is tested ("Transfer is atomic").
- MINOR [food-objects] src/sim/conversion.ts:42 — "Stage 3, before enzymes" is untested. A mutant that moves `releaseFoodObjects` after the enzyme loop leaves food-objects.test.ts at 16/16 passing. A wafer with starch enzyme in its cell would show the difference: the released starch is converted the same tick, or not.
- MINOR [f02-links] src/sim/fungalTransport.ts:234 — the proposed rule "only Active segments take part" is untested. A mutant without the lifeState check leaves fungal-transport and fungal-links at 21/21 passing.
- MINOR [e1-producers] content/experiments/EXP_201.json — the gate and journal stamp claim more than the measurements show.
  - The Water Garden keeps 0.02 sugar per cell. The gate `intake.B01 ≥ 0.5` was reached at 8 s with only 1.16 C converted.
  - By 180 s Sprinters ate 42.03 C and Crumbsmiths 34.14 C, against 20.78 C converted in total (docs/reports/experiments-g2.md).
  - So most of what the Sprinters ate is background sugar, yet the stamp says "Watched Sprinters share a Crumbsmith's lunch".
  - The confounds text admits this, and the gate is CT §10.3's literal. Suggest an owner flag, or a stamp that does not assert the sharing.
- MINOR [e1-producers] src/worker/snapshot.ts:664 producersNear — "Made here by {species}" credits any living organism with producer rules in the cell or a four-neighbour. It does not check that the organism released anything: it may be at E ≤ 35, have no substrate, or have just arrived. A per-tick record of who released already exists (the PRODUCER_BIT set in the `secreting` column), but nothing keeps it over time. This follows the assignment's rule. Flagged against CLAUDE.md "Coincided with until a recorded mechanism supports because".
- NIT [food-objects] src/ui/panels/Inspector.tsx:715 — the cell's food-object line sits in the 14 px `.kv` grid. Disclosed, and deferred to P3.11 with the other rows.
- NIT [f02-links] src/sim/publish.ts:51 — `world.species` holds every enabled species, so `worldHasTransport` is true in every new dish.
  - Every new dish's samples now carry `fungalTransfer: 0`, and the "cheap gate" never short-circuits.
  - Behaviour is still correct and bit-identical: no links means no edges.
- NIT [f02-links] Inspector.tsx:129 transferText — `toFixed(3)` prints "Sent 0.000 carbon to 1 linked segment" when less than 0.0005 C moved in 10 s.
- NIT [tools-sample] src/ui/strings/tools.ts discardConfirm — "This cannot be undone except with Undo." contradicts itself.
- NIT [tools-sample] src/sim/sampleSlot.ts:283 — hard-coded 6000 instead of AGENT_CAP.
- NIT [e1-producers] edited tools-sample's host.ts (one argument) and tests/ui/diet-line.test.ts, which is not in its list. Both are disclosed and additive.
- NIT [f02-links] edited src/sim/links.ts, which is not in its list. Disclosed and additive; events are not hashed.
- NIT [food-objects] edited LabTrayContent.tsx and LabToolbar.tsx, which are not in its list. Disclosed, one line each.
- NIT [e1-producers] the report's FENCE note is stale. The `secreting` bit set (oil 2, protein 4) is already in the tree, and the four new fence entries pass against it.

## VERIFIED OK
- VERIFIED OK — fence, replay, conservation and the builders' new tests. `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/producers.test.ts tests/experiments/e201-e204.test.ts tests/fixtures/fungal-transport.test.ts tests/sim/fungal-links.test.ts tests/fixtures/food-objects.test.ts tests/sim/tools.test.ts tests/worker/sample-transaction.test.ts` → Test Files 13 passed, Tests 130 passed (685 s).
- VERIFIED OK — `tsc --noEmit` exits 0. eslint on 21 reviewed files exits 0. `content-validate` reports content ok, contentHash cef0ea56… (matches the manifest), 19 enabled species.
- VERIFIED OK — fence.json: only the four new recipe entries were added; no existing digest changed.
- VERIFIED OK — host refusal of Step while a sample is held is not vacuous. A mutant that removes `refuseWhileHeld(d, 'step')` fails "Begin pauses; Run, Step and an inoculate are refused…".
- VERIFIED OK [f02-links] — fungalTransport.ts follows SPEC §7.7 and CT §12.6:
  - one snapshot; edges in canonical order;
  - donor/receiver tests and r = min(0.02·dt, ½ diff);
  - donor cap, then receiver cap;
  - N moved = N_d·r/B_d from the snapshot; no energy moves; no ledger entry.

  The E212 oracle imports nothing from the sim. Degree ≤ 4, the linkFormed/linkBroken events and the unlinked-daughter detail are present and tested. The observation field is never hashed or saved.
- VERIFIED OK [e1-producers] — native oil and protein ProducerRules use the CT §12.6 constants. The foodScore terms come after starch, and B06/E01 behaviour is unchanged (fence passes). The secretion refusal codes match SPEC §5.3. The reaction record is observation only (POST_G2_DERIVED_KEYS). The omitFounders rule accepts only the last group; EXP_203 arm B keeps every Y02's cell and birthId and makes zero broth. EXP_204 measured B − A = −9.90 C, not forced.
- VERIFIED OK [food-objects] — placement is ledgered as an external input (+10 C, +1 N), with CT §5.2 rates. The last transfer moves the exact remainder. The object is refused on structures, occupied cells, past the cap, and without the system or material. brushCellOutcome matches applyHabitatEdit. There is no fence effect.
- VERIFIED OK [tools-sample] — Take, Cancel, Transfer, Discard and Clean water match SPEC §10.5–10.6 and D-0037:
  - closure over host/parasite, fungal, adhesion and claimed-prey units;
  - Cancel through `allocateAt` (lowest-free allocation is unchanged), with nextSeq and the log restored;
  - remapped references; Discard exports exactly the held totals with REMOVED_SAMPLED;
  - the clean-water CO2 difference is ledgered and O2 is not;
  - import refusals end "Nothing was loaded.";
  - compareStart and comparison copies refuse samples.
- VERIFIED OK — no Math.random, Date, Map/Set iteration or unsorted key iteration that affects results in the new sim code. sample.ts:281 iterates keys only to zero values, so order does not matter.
