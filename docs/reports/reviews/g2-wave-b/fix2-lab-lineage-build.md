I fixed all seven items. Each has a test that fails on the old code and passes now; I checked that by swapping the old code or content back in and rerunning. Nothing is committed and I ran no git write commands.

## Items

**1. Honest habitat text: FIXED**
- **Content rules:** I rewrote the rules text for WATER, GEL and SEDIMENT. It names no organism or device and keeps only rules that hold in every phase:
  - the diffusion rates (0.10, 0.025 and 0.01 per tick);
  - gas exchange (ten times slower in sediment);
  - gel and sediment are drier than water (moisture 0.8, in `transport.ts`);
  - an attached organism can hold on to gel or sediment only if its record lists that surface;
  - each organism's recorded habitats decide where it can live.
- **Gel example:** it no longer says organisms "settle" on gel.
- **Nutrient:** the NUTRIENT rules now end "Nutrient alone is not food: it adds no carbon or energy." The false line "Adding nutrient alone creates no growth" is gone.
- **New tray line:** the Habitat tray shows a computed "Lives here in this dish" line (`data-testid="lab-lives"`). `livesHereText` builds it from the world's species habitats in DishInfo, with the same rule as `habitatCompatible`. That sentence used to be appended to "Watch for", which is now the content example only.
- **Checked against content:** Sunbead and Amoeba are water only; Sprinter, Recycler and Crumbsmith live in water, gel and sediment.
- **Tests** (`tests/sim/lab-commands.test.ts`, describe "Lab habitat words (wave B fix 2)"):
  - Nothing in the WATER/GEL/SEDIMENT/SHADE/NUTRIENT rules names any of the 38 species (all phases), mesh, fungi or algae.
  - The Garden's lines are "Sprinter, Recycler and Crumbsmith. Sunbead and Amoeba cannot live in gel." (same for sediment), and all five for water.
  - `itemCopy('paint:gel')` returns rules = content text, lives = the computed line, watch = the content example.

**2. Crafted-stroke stall: FIXED**
- **Counter:** I added `strokeSampleCount` in `grid.ts`, next to `strokeFootprint` and counted the same way. It stops counting early once past the limit.
- **Bound:** `invalidHabitatEdit` now refuses the whole edit ('stroke too long') when a stroke samples more than `LAB_MAX_STROKE_SAMPLES = 100_000` brush disks.
- **How I chose it:** I drove a real scribble in Playwright on an 800×360 phone at the whole-dish zoom (2.41 px per cell). Sweeping the whole dish at 1,500 px/s for 4.1 s sent 243 points and sampled 2,663 disks, about 0.43 per pixel.
  - A 20-second scribble would be about 13,000; at the smallest zoom about 14,400; a full minute about 43,000.
  - 100,000 is more than two minutes of non-stop fast scribbling.
  - At the bound, a radius-6 footprint costs about 0.4 s once (measured under load).
- **Tests** (describe "stroke length bound"):
  - The verifier's 20,000-point alternating stroke at radius 6 has more than 2 million samples.
  - Paint, shade, wall and erase each refuse it in under 250 ms and leave the grid and fields unchanged. The old code took 29 s and painted 1,560 cells.
  - A stroke of exactly 100,000 samples is applied; one more sample is refused.

**3. Names from content: FIXED**
- **Names module:** new file `src/ui/panels/LabTrayNames.tsx` supplies the display names: `structureName`, `paintName` (the dish's own paint record first) and `inSentence`.
- **Compare lines:** `CompareText` now writes "Impermeable wall placed on 12 cells", "Porous bead …", "Stone …", "Sediment painted on …" and "Shade paint on …".
- **Refusal toast:** `habitatEditOutcome` now reads "Not changed: Impermeable wall is not in this dish's recorded content." It no longer prints the simulation's note, and success lines without a label fall back to content names.
- **Log note:** the simulation's saved note names the content ID ("WALL is not in this dish"). The shared marker `NOT_IN_DISH` lives in `grid.ts`, so the UI does not pull `structures.ts` onto the main thread.
- **Test:** compare lines for all edit kinds, and all five refusals on a real older save (the caller passes `'wall'` as the label, as LabView does today).

**4. Hash coverage: FIXED, by deriving the value from hashed data**
- **Change:** a Branch now records `rootGeneration` when it is named, and branch records are hashed. `saveSpecimen` uses `br.rootGeneration`, or for older branches the hashed birth arrays, or −1. It never reads `lineage.kept`. The lineage panel's depth uses the same value.
- **Why this rather than hashing keep/kept:** kept is a display record. Two naturally reached states can hash equal but differ in kept (for example, pinned before compaction versus unpinned and re-pinned after it). Deriving the value restores "nothing the simulation needs lives in lineage records".
- **Test** (`tests/fixtures/branch-evidence.test.ts`): the verifier's repro. A pinned branch is compacted; the copy without keep/kept has an equal hash; after the same `saveSpecimen` the hashes are still equal and the generation is 1. A branch recorded before `rootGeneration` gives equal hashes too: −1 after compaction, 1 before.

**5. Surcharge line: FIXED**
- `moduleChange` quotes the module's registry rate times the carrier's profile multiplier (`Profile.surcharge / Σ raw rates`). The carrier is the branch for a gained module and the ancestor for a lost one. The strings print it with at most 4 decimals.
- **Test:** E05 with feeding locus 60 reads "…costs 0.021 energy per second while carried and 0.03 energy per second upkeep". The lost-E05 case reads "…its ancestor did, at 0.021…".

**6. DiscoveryPacer: FIXED**
- **Pacer:** `deliver` now returns (or resolves to) the ids a card really shows.
  - Only those ids stop waiting, and only a new card that was really shown starts the 60 s gap.
  - A failed or empty answer keeps the discoveries and retries after `DISCOVERY_RETRY_MS = 5000`.
  - Only one delivery runs at a time.
  - `reset()` bumps an epoch, so a late answer for the old dish changes nothing.
- **`LineageState.showDiscovery`:** it returns the shown ids, and returns [] when the dish changed or when the card was dismissed while ids were joining it.
- **Tests** (`tests/ui/discovery-pacer.test.ts`): 5 new async tests: failed answer, answer without the rows, dish change while an answer is on its way, a late old-dish answer, and discoveries arriving while an answer is on its way. All 5 fail on the old pacer; the 6 old tests are unchanged apart from the harness returning the ids it shows.

**7. Debris total: FIXED by changing the text**
- `HistorySample` records no debris, and adding a field would change the saved world format. So the texts now point at the Debris overlay (Lab → Observe):
  - EXP_103's intervention;
  - EXP_103's confounds ("the debris in the dish can grow as well as shrink");
  - CLEANING_CREW_V1's expected observations;
  - the DEBRIS example.
- EXP_103 still sends the player to the resource history, for the Recyclers' numbers and living biomass. Its `openResourceHistory` step is required by CT §10 row 103.
- **Test:** new `tests/content/debris-text.test.ts`.
  - A real Cleaning crew sample has no debris key.
  - No content sentence that mentions history mentions debris.
  - The three texts name the Debris overlay.
  - The Lab toggle, the Observe tray and the Debris overlay exist, and both dishes list `detritus` in `fieldIds`.

## Changes other files need (not in my ownership)
- **`LabView.tsx` and the renderer:** the brush preview rebuilds the whole footprint on every pointermove, so the cost grows with the square of the stroke length. My 4-second radius-1 scribble took 79–95 s of wall time in SwiftShader. The preview should be built incrementally.
- **Deposit strokes:** they have the same unbounded path length. The same bound should apply in `commands.ts` (`strokeCells`).
- **`editLabel` in `LabTrayContent.tsx`:** it still falls back to the internal code for a structure the dish lacks. It could use `structureName` from `LabTrayNames`. The toast no longer depends on it.
- **Inspector:** `strings/modules.ts` and `moduleView.ts` still say "Carrying it costs 0.02 energy/s" from the registry rate, the same issue as item 5.

## Proposed decisions
- PROPOSED DECISION: Branch records gain an optional `rootGeneration`, recorded when the branch is named. There is no world schema bump, as with the other optional P2.3 branch fields, and readers fall back. Hashed state never reads `lineage.keep` or `lineage.kept`.
- PROPOSED DECISION: A habitat edit may sample at most 100,000 brush disks (`LAB_MAX_STROKE_SAMPLES`), measured as above. Longer strokes are refused whole.
- PROPOSED DECISION: Habitat paint rules text states only rules that hold in every phase and names no organism. Which organisms can live in a substrate is a computed line from the world's species.
- PROPOSED DECISION: Refusals and change lines use content names. The simulation's log notes name content IDs and end in `NOT_IN_DISH`.
- PROPOSED DECISION: Module "Game rule:" lines quote the surcharge the carrier's profile actually charges.
- PROPOSED DECISION: A discovery waits until a card shows it; a delivery that shows nothing is retried after 5 s and starts no gap.
- PROPOSED DECISION: Debris texts point to the Debris overlay. Charting debris in History would need a new history sample field and old-save handling; that is for the owner to decide.

## Files changed
- `content/materials/{WATER,GEL,SEDIMENT,NUTRIENT,DEBRIS}.json`
- `content/experiments/EXP_103.json`
- `content/recipes/CLEANING_CREW_V1.json`
- `content/manifest.json` (hash written by the validator)
- `src/sim/{grid,structures,branches,lineage,specimens}.ts`
- `src/ui/panels/{LabTray,CompareText,DiscoveryPacer,LineageState}.tsx`
- `src/ui/panels/LabTrayNames.tsx` (new)
- `src/ui/strings/{lab,lineage}.ts`
- `tests/sim/lab-commands.test.ts`
- `tests/fixtures/branch-evidence.test.ts`
- `tests/ui/discovery-pacer.test.ts`
- `tests/content/debris-text.test.ts` (new)

## Commands and results
- `npx tsx tools/content-validate.ts --write`: content ok, hash b8ed0873…; the re-check without `--write` matches.
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint` on all 16 files I touched: clean.
- `npx vitest run` on lab-commands, branch-evidence, lineage-panel, lineage-host, `tests/ui` and `tests/content`: 11 files, 118 passed.
- Also passed:
  - `tests/sim/view-switch.test.ts`: 14 passed.
  - `tests/experiments` journal-and-words, cleaning-crew and framework: 32 passed.
  - deterministic-state, inherited-variation and `tests/persistence`: 28 passed.
- `E2E_PORT=4182 E2E_OUTDIR=tmp/dist-fix2b npx playwright test tests/e2e/lab-tools.spec.ts tests/e2e/lineage.spec.ts` on all three projects: 21 passed (23.7 min). This includes the axe checks (no serious or critical violations), 200 % text, 48 px targets and no horizontal overflow.
- Same command with `compare.spec.ts` and `experiments.spec.ts`: 18 passed. Three desktop tests hit their time limits while another agent's Playwright run (port 4193) had the load average at about 7–8; every action took 2–10 s and no assertion failed.
  - Reruns on desktop: `experiments.spec.ts:40` passed (2.6 min).
  - Then `compare.spec.ts:13` and `experiments.spec.ts:226` passed together (3.3 min).
- Port 4182 is stopped and `tmp/dist-fix2b` is removed.

**Scratchpad:** I first wrote `probe.config.ts` and `scribble.pw.ts` into the shared `scratchpad/probe/` folder, which already held an earlier agent's probe files. If a `probe.config.ts` was there, I overwrote it. My probe now lives in `scratchpad/fix2b-probe/`.