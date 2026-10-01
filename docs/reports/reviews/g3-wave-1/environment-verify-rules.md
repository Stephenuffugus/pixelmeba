# g3 wave 1: environment verification (lens: rules, determinism, conservation, tests)

**Verdict: ok = true.** I found no BLOCKER and no MAJOR. Five MINORs follow, most severe first, then the items I verified.

All runs were done in this session against the working tree (uncommitted). Scratch work is in tmp/verify-environment-rules/: probe tests and a load-time mutant vitest config. No tracked file was edited except this report.

## Problems

1. **MINOR: the desktop e2e journey did not pass in my session; it overruns its time budget under load.**
   - Test: tests/e2e/chemistry-habitats.spec.ts:102. The Sediment Edge salt/acid/buffer/lid journey has a 420 s budget (`SLOW`, :16).
   - Run 1 (`E2E_PORT=4217 … npx playwright test tests/e2e/chemistry-habitats.spec.ts`): 5 passed, 1 failed. Phone-portrait and phone-landscape passed both tests; desktop passed the 200 % text test.
     - Desktop failed the journey after 7.2 min. It stalled at `closeInspector` (:98, called from :156) waiting for "Close" to become stable.
     - The page snapshot showed correct values: pH 6.67, salinity 0.50, oxygen 0.80, light "0.80 (habitat 0.80 × shade 1.00)", exposure "None here."
   - Run 2 (desktop only, `-g "lid toggles"`): timed out again after 7.2 min, with load average 7.7 on 2 CPUs (another verifier's Playwright was running).
     - The final page snapshot shows the journey had reached its last step: Open pressed and the "Lid open" toast showing.
   - Every value assertion I saw held. The failure is the time budget, not behaviour.
   - The builder's report also describes two desktop failures, and removing a toast assertion, before one green run. The spec is load-sensitive.
   - Repro: run the spec on desktop while another Playwright or vitest job uses the 2 CPUs.
   - Suggested fix: raise `SLOW` for desktop, or cut the repeated "Whole dish" clicks and per-step axe scans.

2. **MINOR: no test covers the Life brush preview's bead rule for attached species that do not list 'bead'.**
   - Code: src/sim/grid.ts:352, `structure === ST_BEAD ? surfaces.includes('bead')`.
   - The new preview test (tests/sim/lab-commands.test.ts:998) uses only B02, whose list includes bead.
   - Mutant `beadAlways` (`? surfaces.includes('bead')` → `? true`): the builder's lab-commands tests still pass, 2 passed.
   - My probe (tmp/verify-environment-rules/probe.test.ts, "preview parity for every attached record") kills it with 2270 mismatching cells.
     - The probe checks B02, B13, F01–F04 and P06 in Water Garden, Gel Colony and Sediment Edge, with gel and sediment paint and beads.
     - It passes unmutated (0 mismatches), so the implementation is right; only the test is missing.
   - Suggested fix: add B13 (or every attached record) to the B02 preview test.

3. **MINOR: no test covers `freshStart` re-applying the habitat override.**
   - Code: src/worker/host.ts:1499/1506 (re-realize from recorded overrides).
   - Mutant `freshNoHabitat` (`...withHabitatOverride(r, o.habitatId)` → `...r` in `freshStart`):
     - Survivors: tests/worker (all 10 files), tests/fixtures/habitat-presets.test.ts and tests/sim/founders-newdish.test.ts (12 files, 158 tests).
     - Killed only by my probe ("save/reload of habitat starts…", which calls `freshStart` and checks the rebuilt habitat id).
   - The failure would be safe: a Gel Colony dish would never count as "fresh", so the keep step would keep an untouched dish.
   - Still, the report's claim that every path that rebuilds a dish from its recorded overrides re-applies the habitat is true by reading only.
   - Suggested fix: one keep-dish test with an Empty Gel Colony start.

4. **MINOR: PROPOSED DECISION 3 needs one more sentence. A bead hides the surface under it.**
   - Code: src/sim/attachment.ts:65–71. `cellSurfaces` returns only `SURF_BEAD` for a bead cell.
   - So B13 (gel, sediment, mesh, stoneEdge) is refused on a bead placed on gel, on sediment or beside stone, although the cell is a gel or sediment cell. F03 is refused the same way on a bead over sediment.
   - SPEC §2.2 lists "gel cells, sediment cells, passable cells four‑adjacent to stone ("stone edge"), porous bead cells". It does not say whether a bead cell still counts as gel or sediment underneath.
   - The behaviour is consistent: preview and command agree (my probe, 0 mismatches). It is defensible, but the DECISIONS entry should state the masking explicitly so the owner can rule on it.

5. **MINOR: two items go beyond the listed scope or reuse (both disclosed).**
   - The renderer's `stoneEdgeAt` (src/render/renderer.ts:993–1003) re-implements `isStoneEdge` instead of reusing it; it has only the structure array.
     - It matches grid.ts:140 by inspection: same four neighbours, same bounds, `ST_NONE` required.
     - No test exercises it.
   - `SnapshotMsg.lid` and `SimClient.lidOf` (protocol.ts:337, client.ts:93) and the one-line edit to tests/sim/founders-newdish.test.ts are outside the listed shared purposes.
     - Both are additive. The test edit keeps the original name and summary assertions and adds stricter grid and rules checks.

## Verified OK

- **Fence:** `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts` plus the builder's tests and lab-commands: Test Files 11 passed (11), Tests 104 passed (104). No FENCE.
- **Builder's new tests pass:**
  - tests/sim/chemistry.test.ts: 14
  - tests/sim/attachment.test.ts: 3
  - tests/fixtures/habitat-presets.test.ts: 7
  - tests/content/material-guide-text.test.ts
  - tests/sim/lab-commands.test.ts
- **Unit regression:** transport, view-switch, deposit-bounds, founders-newdish, tests/content, tests/recipes, tests/experiments/framework.test.ts, tests/worker, plus fixtures determinism and deterministic-state: Test Files 24 passed (24), Tests 381 passed (381).
- **Checks:**
  - `npx tsc -p tsconfig.json --noEmit` exits 0.
  - eslint on all 24 touched or new files: clean.
  - `npx tsx tools/content-validate.ts` (read-only, without --write) reports "content ok · contentHash 59d708d2…eab93", which matches the manifest.
- **Manifest edit is additive:** content/manifest.json adds `chemistry`; the 12 materials; GEL_COLONY and SEDIMENT_EDGE; and the new contentHash. buildPhase stays 3 and contentVersion 2. Nothing was removed or reordered.
- **Stage 2 rules (src/sim/transport.ts:302–330, already there, unchanged):**
  - Order is diffuse → gasExchange → decays (inhibitors 0.002 per tick, CT §12.2 "inhibitor decay 0.2 %/tick") → neutralize (min(acid, base) from both, :256–270) → updateDerived (pH clamp 2..12, :285–286; stored values untouched).
  - A closed lid returns before any exchange (:231).
- **Rules match CT and the tests are exact:**
  - pH (0,0,0)=7, (0,3,0)=10, (0,6,0)=12 with base still stored as 6, (2,0,1)=6.
  - Salt total holds to 1e-12 over 1,000 ticks.
  - Inhibitors are exactly v×0.998 per tick.
  - Inhibitor targets are checked across all 38 records against CT §3.4 ("Bacterial inhibitor | B01–B13 … Fungal | Y01, Y02, F01–F04 … Photosynthetic | A01–A05").
  - Film halves exposure once (D-0008).
  - Growth factor is 1/(1+e) and damage is 8×e×DT.
  - Sediment gas exchange is 0.1×.
  - Shade changes only light.
  - Every material input is ledgered: DEBRIS adds 0.10 N per C, CO2 counts as carbon, and oxygen has material 'none'.
- **Mutants killed by the builder's tests (load-time transform, tmp/verify-environment-rules/vitest.mutant.config.ts):**
  - `stoneEdgeIgnored` (grid.ts lifeCellOutcome stone-edge term → false): killed by the B02 preview test.
  - `beadAlwaysSim` (attachment.ts bead returns every bit): killed by the attachment.test mask test.
  - `phNoBuffer`: killed by the chemistry pH test.
  - `inspectNoShade` (chemistry.ts lightFactors shade → 1): killed by the chemistry light test.
  - `keepSugar` (withHabitatOverride keeps backgroundOverrides): killed by two habitat-presets tests.
  - `provNoHabitat` (host recipeProvenance drops habitatId): killed by the habitat-presets New Dish test.
- **CT §8.1 presets match cell by cell:**
  - Gel Colony: 1,200 channel cells at x 59–68 and 10,104 gel cells; light 0.5, warmth 0.5, O2 0.8, CO2 0.5, nutrient 0.10, sugar 0.10.
  - Sediment Edge: 5,123 water, 5,652 sediment and 529 stone cells (r 13 at (45,43)). Light 0.8/0.15; O2 0.8/0.2; detritus 0.10 and detritusN 0.010 in sediment.
  - Moisture is 1.0 or 0.8. The lid is open and light is fixed. The initial ledger equals the preloaded totals.
- **Attachment cache is per world:**
  - The mask lives on `world.derived.transport` (transport.ts:45–50, attachment.ts:78–90) and rebuilds when geometryVersion changes.
  - Every grid write in src/sim bumps geometryVersion: structures.ts:325, recipes.ts:128, experiments.ts:446. Deserialization makes a fresh world.
  - The test with two worlds at the same version, read interleaved, passes.
  - The check sits in `habitatCompatible` (suitability.ts:46–52), keyed on `sp.def.attachment`, so free-living species never reach it.
- **Determinism:**
  - No `Math.random`, `Date`, Map/Set iteration or object-key iteration in attachment.ts, chemistry.ts, suitability.ts, transport.ts or grid.ts. The `WeakMap` in attachment.ts is used for lookup only.
  - Presets realize deterministically (stateHash and the 'full' digest).
  - My probe: an Empty Gel Colony dish saved, reloaded (JSON round-trip) and stepped 30 ticks alongside the original keeps the same stateHash, recipeOverridesOf and attachment mask.
- **Conservation on the new presets:**
  - Probe: Gel Colony and Sediment Edge with a closed lid, B01 and A01 inoculated, acid, bacterial inhibitor and protein added, 3,000 ticks.
  - `checkLedger(w).ok` holds every 500 ticks and at the end.
- **Saves:**
  - No schema bump is needed: the inhibitor fields follow the world's manifest, and `habitatId` is an optional provenance override validated in recipeOverridesOf (recipes.ts:192).
  - g2 saves replay unchanged (g2-replay passes).
- **No hard-coded stateHash literals** in the new tests.
- **e2e:**
  - chemistry-habitats passes on phone-portrait and phone-landscape (journey and 200 % text) and on desktop for 200 % text. That includes the 200 % run after the builder's final edit, which the builder had not re-run.
  - Desktop journey: see MINOR 1.
  - The other e2e regression specs (lab-tools, new-dish, inspector, whatif) were not re-run by me; they belong to the UI verifier.

## Proposed decisions (builder): assessment

1. **Sediment Edge bound N 0.010 per sediment cell:** consistent with CT §5.1 DEBRIS "detritus C + 0.10 N per C". Fine.
2. **Habitat starts drop FIRST_DISH_V1's background overrides:** the dish then equals CT §8.1 ("All unspecified fields zero"; Gel Colony "sugar 0.10"). The summary quotes the habitat's rules text and does not say "no food". Fine.
3. **On a bead, an attached species needs 'bead':** fine. Add the masking sentence (MINOR 4).
4. **`SnapshotMsg.lid`:** optional, so PROTOCOL_VERSION stays 1. Fine.
