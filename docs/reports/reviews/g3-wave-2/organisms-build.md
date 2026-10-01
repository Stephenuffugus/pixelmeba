# G3 wave 2 — organisms build report

Builder: organisms (P3.3 part 2: B03, B05, Y01; P3.4 part 1: P02, P03, P04; Add Life / Lab Life tray for every species this wave enables). Port 4222.

## Checklist

### Build
- DONE — Shared manifest/implemented: `content/manifest.json` enabledSpecies += B03, B05, P02, P03, P04, Y01 (sorted; the other builders' B02, F01, V01, X01 are there now too). `src/sim/content/implemented.ts` += OXYGEN_SUPPRESSED, SEDIMENT_WATER_CROSSING. Ran `npx tsx tools/content-validate.ts --write`. Last check: "content ok … species 38 (enabled 15) … atlas complete for 15 enabled species".
- DONE — B03 Dusk: anaerobic (no O2 debit, 18 E per C from its record, `intake.ts` `sp.aerobic`/`energyPerCarbon`). OXYGEN_SUPPRESSED × clamp(1 − O2/0.40, 0, 1) with SUIT_OXYGEN_HIGH was already in `src/sim/suitability.ts` (~line 103); checked, and it is now implemented. Proved by tests/fixtures/dusk-suitability.test.ts and relationships-w2.test.ts.
- DONE — B05 eats metabolite only (record foodPriority ['metabolite']). Proved by relationships-w2.test.ts.
- DONE — Y01: anaerobic, 18 E/C, speed 0, water/gel. Intake emits 0.20 acid per consumed C (`intake.ts` `acidPerCarbon`, checked). Proved by relationships-w2.test.ts.
- DONE — P02/P03/P04 run on their records and the existing hunt rules. The requirements 'any', 'free' and 'inSediment' in `movement.ts preyAllowed` are checked; contacts.ts was not edited (W2-12). Proved by tests/fixtures/predation-matrix.test.ts.
- DONE — P04 SEDIMENT_WATER_CROSSING in the new `src/sim/crossing.ts`:
  - `enterCell` holds the per-cell rule: from sediment, up to two consecutive open water cells; a third is refused.
  - `crossingCompatible`/`isCrossing` is the entity-aware habitat check.
  - `entitySuitabilityAt` is stage 4's suitability. A crossing worm gets no SUIT_HABITAT and no stress damage.
  - movement.ts:
    - `traceFraction(…, cross = -1)` gets an optional crossing state, so the edge trace refuses a third water cell (~line 108).
    - `decide` treats open water as a candidate only when the crossing trace reaches it (~line 213).
    - `applyStep` records `waterCrossed` whenever the worm changes cell (~line 297).
    - Stage 4 resets the count when the worm is on its habitat (~line 319) and uses `entitySuitabilityAt` (~line 320).
  - suitability.ts: `suitabilityAt(…, habitatOk?)` is an optional override (line 71). `habitatCompatible` and `canOccupy` are unchanged.
  - snapshot.ts inspectEntity uses the same `entitySuitabilityAt` (line 243).
  - Inoculation, births and the Life brush still refuse water for P04.
  - The parasites-phage hooks in movement.ts (lines 44, 351, 398) are kept.
- DONE — Add Life (W2-13):
  - `DishInfo.speciesDiets` (protocol.ts lines 274/307, type `SpeciesDiet`) is filled in host.ts `info()` (line 1932). digestsFilm is sent only when `worldHasSystem(w, 'film')`.
  - `dietLine`/`isPhage` live in `src/ui/panels/LabTrayContent.tsx` (lines 176/188). Copy is in `LIFE_COPY.diet` (src/ui/strings/lab.ts).
  - AddLifeSheet replaces the DIETS map with a diet symbol (an inline SVG, aria-hidden) plus the diet line (`species-<ID>-diet`). `species-<ID>` is kept.
  - The Lab Life tray details show a "Diet" line (`lab-diet`).
- DONE — V01 (W2-14):
  - `LifeBrush.viral`; `lifeCellOutcome` returns `brushCellOutcome('material', structure, false)` for viral (grid.ts lines 339/351, using grid codes only).
  - `lifeBrushFor` returns `{habitatMask 0, attached false, viral true}` for metabolism 'viral'.
  - The Add Life tile shows "{n} units per cell", with a note under the count.
  - Lab tray dose line: "Adds {n} Pinphage units to every covered cell."; the count label reads "Units per cell". Phage habitats/changes/unchanged/watch copy added.
  - `reportCommand` (state.ts line 940): "Added {n} Pinphage units to each of {cells} cells." ("to 1 cell" when there is one), or "No open cells here for Pinphage."
- DONE — livesHereText (W2-03): optional 5th argument `{ attachment, structureIds }` (lab.ts lines 356/373). An attached species whose surfaces do not include the painted substrate is named with the surfaces it needs: "Velvet lives in water only on stone edges or porous beads." A bead or mesh surface is named only when the dish enables BEAD/S06. With no such surface, the species "cannot live in" it. LabTray passes `info.speciesAttachment` and `dishStructureIds(info)`. Output with no attachment option is unchanged.

### Done when
- DONE — predation-matrix (tests/fixtures/predation-matrix.test.ts, 5 tests):
  - P01–P04 × every non-viral species of shipped + B02/F01/X01 (registryWith, allowUnimplemented for BIOFILM/BRANCHING/HOST_DRAIN), in water and sediment, attached flag off/on.
  - Expected table is CT §3.2 transcribed literally.
  - Named cases: P02×B02 never, P02×free B06 yes (attached flag → no), P04×B06 water never / sediment yes, P03×B01 never.
  - Two runs are equal.
  - Flipping P02→B06 or P04→B06 to 'any' in a patched record yields exactly the expected mismatches.
- DONE — siltworm-crossing (tests/sim/siltworm-crossing.test.ts, 6 tests):
  - Crosses 1 and 2 water cells, never a 3rd: both in the trace and in a chase, where the worm stays at x 61 for over 100 ticks with prey beyond.
  - `waterCrossed` reads 1, then 2, then 0 back on sediment.
  - In water: no SUIT_HABITAT, H stays 100, no stressed flag. Plain `suitabilityAt` would report SUIT_HABITAT there.
  - Inspector `suitFactors.reason` equals `entitySuitabilityAt`; inspector suitability equals stage 4's value.
  - `canOccupy(P04, water)` is false; inoculate places worms only on sediment.
  - Decision candidates contain only water at x 60/61, never 62. With the ability removed, water is never a candidate.
  - Turn-back works, and a stranded worm is not crossing.
- DONE — dusk-suitability (tests/fixtures/dusk-suitability.test.ts, 2 tests):
  - Factor is exactly 1 / 0.75 / 0.5 / 0 at O2 0 / 0.1 / 0.2 / ≥ 0.4 (0.4, 0.8, 1.5), with SUIT_OXYGEN_HIGH; B01 ignores O2.
  - Closed lid, 20 B01 + 20 B03 at (50,70), sugar 0.50 and nutrient 0.20 per cell: O2 falls below half, B01 records OXYGEN_LIMITED, B03 suitability rises by more than 0.1.
  - This runs on a low-oxygen sediment dish; see the proposed decision below.
- DONE — relationships-w2 (tests/fixtures/relationships-w2.test.ts, 5 tests):
  - B05 grows only from metabolite: zero intake beside sugar, starch, oil, protein and debris.
  - Y01 acid delta = 0.20 × C per tick (1e-15), and pH = clamp(7 + (base − acid)/(1 + buffer), 2, 12) after `updateDerived`. A B01 eating the same sugar adds no acid.
  - B03/Y01: ΔE = 18·C, O2 unchanged, B +0.5C, CO2 +0.3C, metabolite +0.2C, energy ledger matches. B01 control: 30·C and −0.3C O2.
  - P03 eats Y01 and P04 eats B05, with meal = prey B/N and cooldowns 4/3. Ledger checks pass.
- DONE — lab-commands "Life brush preview" (owned block):
  - The parity `it.each` now covers F01 (and its unattached flip) in all three habitats.
  - New P04 case: the preview equals canOccupy, refuses open water, and inoculate into water accepts 0.
  - New V01 case: the viral preview equals `phageCellAccepts` cell by cell in all three habitats, with beads, walls and stone.
  - New `livesHereText` case for attached species (B01/B02/F01/B13; with and without beads; free-living output unchanged).
- DONE — tests/ui/diet-line.test.ts (5 tests):
  - Worker diets match the records.
  - The exact line for every one of the 15 species enabled after wave 2, plus its symbol.
  - A g2 dish has no film wording and P01 sums 15 absent kinds.
  - Dropped qualifiers and absent prey are caught on a patched P02 diet.
  - V01 brush equals the material rule; phage copy strings.
- DONE — tests/e2e/add-life-w2.spec.ts (desktop):
  - Add Life tiles B03, B05, Y01, P02, P03, P04, V01 each show a diet line and symbol. Tiles are ≥ 48 px (expectReachable); diet and dose text is ≥ 16 px.
  - V01 reads "5 units per cell", then "20 units per cell".
  - Lab P04 hover over open water reads "0 cells · N crossed out (skipped)".
  - The Lab Pinphage details read "Adds 5 Pinphage units to every covered cell."; the tap toast reads "Added 5 Pinphage units to each of N cells.".
  - axe is clean on the Add Life sheet and the Lab Life tray.
- DONE — Fence unchanged: g2-replay and the four trajectory-fence files pass.

## Files
Created:
- src/sim/crossing.ts
- tests/fixtures/predation-matrix.test.ts
- tests/fixtures/dusk-suitability.test.ts
- tests/fixtures/relationships-w2.test.ts
- tests/sim/siltworm-crossing.test.ts
- tests/ui/diet-line.test.ts
- tests/e2e/add-life-w2.spec.ts
- this report

Changed (owned):
- src/sim/movement.ts
- src/sim/grid.ts (LifeBrush.viral, lifeCellOutcome)
- src/ui/panels/AddLifeSheet.tsx
- src/ui/panels/LabTray.tsx
- src/ui/panels/LabTrayContent.tsx
- tests/sim/lab-commands.test.ts ("Life brush preview" block plus one import)

Changed (shared, additive):
- content/manifest.json
- src/sim/content/implemented.ts
- src/sim/suitability.ts (optional `habitatOk`)
- src/worker/snapshot.ts (inspectEntity call; dropped the now-unused `suitabilityAt` import)
- src/worker/protocol.ts (`SpeciesDiet`, `DishInfo.speciesDiets?`, optional, so PROTOCOL_VERSION stays as the art owner sets it)
- src/worker/host.ts (`info()` speciesDiets, gates import)
- src/ui/strings/lab.ts (LIFE_COPY diet/phage copy, `LivesHereOptions`, livesHereText)
- src/ui/state.ts (reportCommand V01 toast, LIFE_COPY import)

## Checking that the tests fail without the mechanism
- siltworm-crossing:
  - With `MAX_WATER_CELLS = 3`, 5 of 6 tests fail.
  - With the step-back rule in `enterCell` removed (`return -1`), the turn-back test fails.
  - Both changes were made temporarily to my own crossing.ts and reverted; checked with `git diff --no-index`.
- predation-matrix: the "flip" test builds patched records (P02→B06 'any', P04→B06 'any'), and the matrix reports exactly those cells as disagreeing with CT §3.2.
- dusk-suitability and relationships-w2: assertions are exact numeric (factor values, 18 vs 30 E/C, O2 delta 0 vs 0.3C, acid 0.2C). Each would fail if the record or the intake branch changed. I did not edit the shared suitability.ts or intake.ts to show this.
- diet-line: the patched-diet case asserts the qualifier words. The e2e failed as expected while V01 was not yet enabled (first run), and passed once parasites-phage landed.

## Commands
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint <my 19 files>`: clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/predation-matrix.test.ts tests/fixtures/dusk-suitability.test.ts tests/fixtures/relationships-w2.test.ts tests/sim/siltworm-crossing.test.ts tests/ui/diet-line.test.ts tests/sim/lab-commands.test.ts` → `Test Files 13 passed (13) · Tests 110 passed (110)`. Run with all four builders' in-flight edits present.
- `E2E_PORT=4222 E2E_OUTDIR=tmp/dist-organisms npx playwright test tests/e2e/add-life-w2.spec.ts --project=desktop` → `✓ 1 [desktop] … (2.2m) · 1 passed`.
- `npx tsx tools/content-validate.ts` → content ok (enabled 15).

## FENCE
No fence value changed. The crossing rule applies only to organisms whose record carries SEDIMENT_WATER_CROSSING; no g2 world holds one. `waterCrossed` stays 0, and the column stays hash-neutral. suitabilityAt without the override is byte-identical.

## Bugs or needed changes elsewhere (not my files)
- `tests/sim/view-switch.test.ts:383–384` fails now that attached B02 (film-fungi) and viral V01 (parasites-phage) are shipped. It expects `lifeBrushFor` to equal `{habitatMask, attached}`, but since wave 1 an attached species also gets `surfaces`, and a phage gets `viral: true`. Suggested expectation:
  - `{ habitatMask: 0, attached: false, viral: true }` when `sp.def.metabolism === 'viral'`;
  - otherwise `{ habitatMask: sp.habitatMask, attached: sp.attached, ...(sp.def.attachment ? { surfaces: [...sp.def.attachment.surfaces] } : {}) }`.
- `src/sim/entities.ts:107` comment for `waterCrossed` says "1 once it has crossed (per organism)". As built it is the crossing state: bits 0–1 hold the consecutive water count (0–2), bits 2–4 the direction of the last step into water (crossing.ts). Suggest rewording the comment.

## Proposed decisions
- PROPOSED DECISION (turning back): "otherwise turns back" (SPEC §6.4). From its second water cell, a Siltworm may step back into the water cell it came from (its count drops to 1); any other water cell is refused. Without this, a worm that met wide water, e.g. Sediment Edge's water half, would be stuck forever two cells out. A count-1 cell is always next to sediment, so the worm can always get home. `waterCrossed` therefore also stores the direction of the last step into water (bits 2–4); bits 0–1 are the count.
- PROPOSED DECISION (stranded worm): a Siltworm in open water it did not enter by crossing (water painted under it, or an imported state) is not crossing. It gets SUIT_HABITAT and stress damage, and may only step onto its habitat.
- PROPOSED DECISION (Dusk fixture dish): the closed-lid Dusk fixture uses an all-sediment dish at O2 0.10. A Water Garden runs out of sugar before oxygen (O2 0.8/cell vs 0.3 O2 per C, sugar 0.5/cell), and fast water diffusion refills local dips, so B01 is never oxygen-limited there; B03 at O2 ≥ 0.4 has suitability 0 and dies within 50 s. Sediment Edge (sediment O2 0.2) was measured too: the colony's O2 settled near 0.10–0.12 and rose again, with no OXYGEN_LIMITED in 4,000 ticks.
- PROPOSED DECISION (diet line wording):
  - Diet lines use content names as they are (singular, as the guide texts do).
  - Prey this dish does not record are summed: "and N kinds not in this dish", or "Hunts N kinds, none of them in this dish." if none are present.
  - Qualified prey are listed in parentheses after the plain prey: "(Crumbsmith only free-swimming; Crossfeeder only in sediment)".
  - Anaerobic feeders read "… without oxygen". Film digesters read "…, and digests film" only when the dish's own manifest enables film.
  - Hosts are worded "Drains …" and "Infects …".
- PROPOSED DECISION (livesHereText): attached species are named per surface set ("Velvet lives in water only on stone edges or porous beads."), not merged across species with different surfaces. Threadlace lists no stone edge, so the brief's example "Velvet and Threadlace … stone edge or bead" would be untrue for it. A bead or mesh surface is named only when the dish enables that Structure record.
