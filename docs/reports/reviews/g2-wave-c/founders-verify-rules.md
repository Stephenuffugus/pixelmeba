# G2 wave C — P2.2 Founder modes and mutation presets: adversarial verification (rules, data and tests)

Verifier lens: every number and rule checked against the canonical docs, determinism, conservation,
saves, test strength (would each test fail on the old behaviour?), and ownership. I edited no
repository file except this report. My scratch work is in `tmp/verify-founders-rules/`.

**Verdict: not done.** There are no blockers, but one MAJOR item is still open: B7, the mode labels
wherever a world is described. There are also six MINOR items. Everything the "Done when" list names
holds, and I re-ran it myself.

## Problems (most severe first)

### MAJOR 1: the mode labels are missing where saved dishes are described (Build item B7)

- **What the rule says:** UX §3.3 is titled *"Mode labels (must appear wherever a world is described)"*. The assignment asks for "Core prototype — quantitative evolution" "wherever the world is described while the module registry is partial".
- **Where they are missing:**
  - `src/ui/views/Saves.tsx:45-47`. The Saved dishes list already describes a slot's What if? identity (`savedIdeaLine`), but never its evolution setting, founder mode or the "Core prototype" label.
  - `src/ui/views/Home.tsx:25-39`. The Continue card says only "`{name}` — paused where you left it" or "`{name}` — N s simulated".
- **Root cause:** `SlotSummary` (`src/worker/protocol.ts:146-161`) has no evolution or registry fields.
- **An easier half:** the open-dish branch of Home's Continue card (`hasDish`) already has `dishInfo.mutationPreset`, `founderMode` and `registry`. That branch needs no store change.
- **Repro:**
  1. New Dish → Accelerated + Diverse → Create.
  2. More → Save… to a slot.
  3. Home, then Saved dishes.
  4. The row shows the name and time only. It does not say "Accelerated Evolution (game setting, not realism)", "Diverse founders" or "Core prototype — quantitative evolution".
- **Status:** the builder disclosed this (report §6, B7 PARTIAL). The fix needs whoever owns `store.ts`, `Home.tsx` and `Saves.tsx`.

### MINOR 1: a mid-run Add Life organism in a Diverse dish is labelled "present at creation" instead of "added"

- **What happens:** `src/sim/commands.ts:344` sets `origin: draw?.seededModule ? 2 : (opts.origin ?? 1)`. So an organism the player adds at any time in a Diverse dish gets origin 2 when it draws a module. Then:
  - The Inspector chip (`originChip`, `src/ui/strings/modules.ts:18-26`) reads "present at creation" instead of "added by you or the recipe".
  - The lineage row (`src/ui/strings/lineage.ts:226`) reads "present at creation" instead of "added to the dish".
- **Contradiction:** `originChip`'s own docstring defines origin 2 as a founder whose genome "was seeded when the dish was made".
- **Repro** (`tmp/verify-founders-rules/probe.test.ts`):
  1. `clearWater({ founderMode: 'diverse', seed: 5 })`, then `run(w, 300)`.
  2. Call `introduceOrganism(w, B06, cell, 'tool:addLife', {})` 200 times.
  3. Result: **25 of 200 organisms added at tick 300 get `founderOrigin === 2`.**
- **Suggestion:** the module label itself is defensible; losing "added by you at 0:30" is the problem. Either keep origin 1 for tool inoculations after tick 0 and carry the fact through `founderOrigin.modules[].source === 'creation'`, or reword the chip and docstring (for example "added with an ability present at creation").
- **Decision needed:** record the ruling in DECISIONS. The builder's PROPOSED DECISION ("applies to recipe founders and Add Life alike") does not mention this label consequence.

### MINOR 2: an "unchanged" preset command still marks the History timeline

- **What happens:**
  - `setMutationPreset` returns `accepted 0, note 'unchanged'` when the setting is already in effect (`src/sim/commands.ts:143-149`).
  - `applyCommand` still appends the command to the log and increments `history.pendingInterventions` (`src/sim/commands.ts:128`).
  - The History chart therefore marks an intervention at a second where nothing changed. This goes against "every visible feature maps to real state".
- **Repro (probe):** on a Standard dish, `applyNow(w, 'x', { kind: 'setMutationPreset', preset: 'standard' })` gives `{"accepted":0,"rejected":0,"note":"unchanged"}`, `pendingInterventions` goes 0 → 1, and the log length becomes 1.
- **How the UI reaches it:** the guard `if (id !== evo.preset)` (`src/ui/panels/AdvancedEvolution.tsx:128`) reads the last snapshot. Two quick taps on the same option before that snapshot returns send a second, unchanged command.
- **Status:** the builder flagged the generic accepted-0 case in §7. The accepted-0 result for this command is new P2.2 code, though.

### MINOR 3: a future module whose definition this build's schema rejects gets an unnamed refusal

- **What happens:**
  - `src/persistence/saveFile.ts:216` schema-parses every module definition first. Any failure gives "A module definition is invalid.".
  - That check runs before the named refusal at `saveFile.ts:225-229`.
- **Repro (probe):**
  - E18 "Future ability" with a definition shaped like E05 → *'This dish uses the extra ability "Future ability" (E18), which this version of Pixelmeba cannot simulate. Nothing was loaded.'* This is correct.
  - The same E18 with `phase: 8` → *"A module definition is invalid."*, with no id and no hint that the file comes from a newer version.
- **Suggestion:** check ids against `IMPLEMENTED_MODULES` (with the name when it is a string) before schema-parsing the definitions.
- **Test gap:** registry-imports test 1 only uses E07, which is in this build's catalog. No test covers a module id absent from the catalog. My probe shows the same-shape case works.

### MINOR 4: raw preset ids where a command is described

- **Where:**
  - `src/ui/panels/CompareText.tsx:40-41` shows "Evolution setting: accelerated".
  - `src/ui/strings/experiments.ts:193` shows "evolution setting accelerated".
- **Rule:** UX §3.3 wants "Accelerated Evolution (game setting, not realism)".
- **Reachability:** neither path can be reached today. CompareScreen offers no Evolution sheet (`CompareScreen.tsx:137-138`), and no content experiment schedules `setMutationPreset`.
- **Status:** the builder flagged it; not the builder's files.

### MINOR 5: two sources of truth for "partial registry"

- `src/worker/host.ts:99` `registryLabel` hard-codes 17 modules. For a full registry it returns a preset label, "Standard Evolution", as the registry label.
- The P2.2 `registryInfo.partial` (`host.ts:1405-1415`) uses the build catalog size instead.
- Today every world is partial, so nothing visible differs. The builder flagged it.

### MINOR 6: one claim in the build report is inaccurate

- **The claim:** "The Content section always renders its controlled region, so its `aria-controls` never points at a missing element."
- **What the code does:** `src/ui/views/NewDish.tsx:289-306` renders `#nd-content-body` only while the section is expanded. The same holds for `#nd-rates` (`NewDish.tsx:255-275`). While collapsed, `aria-controls` names an id that does not exist.
- **Impact:** none functionally. axe accepts this with `aria-expanded="false"`, and the e2e axe checks pass. Only the report statement is wrong.

## VERIFIED OK

- **VERIFIED OK — preset rates (CT §12.8, SPEC §8.6)**
  - The docs: CT §12.8 "Rates Standard 8/2/0.2/1 %, Accelerated 16/4/1/2 %, Fixed 0". SPEC §8.6 "Developmental is 0 and absent before Phase 7".
  - `ratesFor` in `src/sim/mutation.ts:33-42` matches. The panel shows "—" for developmental while it is disabled.
  - founders-presets test 1 and founders-words test 4 check the numbers.
- **VERIFIED OK — SPEC §8.7 pacing**
  - The doc: "1 − 0.999^1000 ≈ 63 %".
  - `moduleGainAttemptChance = 1 − (1 − m/2)^n` gives 63 % at Standard. Its text says "A try is not a lasting new branch".
- **VERIFIED OK — Identical**
  - The doc: SPEC §8.6 "(loci 50, no modules)".
  - `founderDraw` (`founders.ts:76-98`) sets neutral loci. The only modules are recipe-declared ones, and FIRST_DISH_V1 declares none.
  - The test checks all 56 founders: loci 50, no modules, origin 1.
- **VERIFIED OK — Varied**
  - The doc: "each active locus from 45–55 inclusive via det(seed,'founder.init',…,locus)".
  - `variedLocus` computes `45 + det(seed,'founder.init',birthId,l) % 11`. `git show HEAD:src/sim/founders.ts` has the same expression, so it is bit-identical to wave A.
  - Inactive loci stay 50. An even-coverage test uses 2,000 founders × 7 loci.
- **VERIFIED OK — Diverse**
  - The docs: SPEC §8.6 "10 % of eligible founders each receive one legal module chosen uniformly"; D04 §3 "independently give 10% of eligible founders one legal supplementary module, selected uniformly".
  - The roll is `detFloat(seed,'founder.module',birthId,0) < 0.1`. The pick is `detInt(…, birthId, 1)` over `eligibleGains` of the **world's recorded** registry (sorted ids).
  - The `founder.module` stream already existed (`src/sim/rng.ts:16`), so no stream was added or reordered.
  - The module is chosen before the loci, so a seeded E03 varies the dormancy locus.
  - Tests:
    - An exact oracle check on 3 seeds.
    - A statistical check: 3,000 founders, about 10 %, uniform over E01, E03 and E05.
    - No module when no gain is legal.
    - Reference genome equals own genome, and `candRoot` is 0.
  - In my FIRST_DISH_V1 seed 104729 run, 8 of the 56 founders were seeded.
- **VERIFIED OK — determinism**
  - The `src/sim` diff adds no `Math.random`, `Date`, Map, Set or for…in.
  - `Object.keys(r.modules).sort()` appears only in the read-only `founderSummary`.
  - eslint is clean on the P2.2 files.
  - All three modes give the same `stateHash` for the same seed, and different seeds give different founders.
- **VERIFIED OK — per-birth rates independent of speed**
  - Rates read only `settings.mutationPreset` and `manifest.developmentalEnabled`, when the proposal is made (`proposeDaughters`, `births.ts:142`).
  - The test runs 1× and 4× (`maxTicksPerPump > 1`). Both give the same hash and identical `mutFlags`, `genome` and `birthTick` arrays. More than 20 births on each side of the change are checked against the 8 % / 16 % draw oracle.
- **VERIFIED OK — the preset change is a timestamped, undoable intervention**
  - `commands.ts:143-149` records `presetFrom` and `targetTick`. An unknown id is rejected.
  - Undo through the host rewinds to tick 100 with the old setting and an empty change list.
  - The change survives save and reload (`presetChanges` is equal and the hash is equal).
  - It marks a History second.
  - Snapshot, `changes` and Undo are covered in founders-newdish test 3.
- **VERIFIED OK — conservation**
  - No material moves were added. `introduceOrganism`'s ledger path is unchanged.
  - A seeded module brings no inventory: the Phase 2 modules E01, E03 and E05 have no structures.
- **VERIFIED OK — saves**
  - The world-state shape is unchanged. `presetFrom` is an optional field on a command-log result, and the state hash covers only pending commands (`hash.ts:250`), not the log. So no schema bump is needed.
  - `meta.registry` and `meta.evolution` sit outside the checksum, which is computed over state only. An old file without them loads with the same hash (registry-imports test 4).
  - A forged meta value is ignored (`saveFile.ts:155`).
  - The tests/persistence migration tests pass.
- **VERIFIED OK — a failed import touches nothing (D1)**
  - The refusal names the module.
  - Through the worker host, the error reply leaves the open dish's hash and the active dish unchanged, and `imported` is null (registry-imports test 1).
  - Mental revert: without the `IMPLEMENTED_MODULES` check, the exact-message assertion fails.
- **VERIFIED OK — a changed build registry never changes an old save (D2)**
  - The test changes E05's numbers, E01's eligibility, the enabled list and the registry version.
  - The imported old save keeps its content modules, manifest, genomes and branches, including candidates. It keeps the same hash and the same 150-tick future.
  - Its eligibility follows the recorded registry.
  - A re-export keeps the recorded registry in `meta`.
  - Mental revert: loading against the build's registry would fail these assertions.
- **VERIFIED OK — export metadata (B9)**
  - `buildSaveFile` always writes `registry {moduleRegistryVersion, evolutionRulesVersion, enabledModules}` and `evolution` from the world.
- **VERIFIED OK — the founder-origin field and honest labels (D7/D8)**
  - The field is added in `founders.ts:232-293`, `snapshot.ts:280` and `protocol.ts:386` (additive, optional).
  - Covered cases:
    - creation / inherited-creation / mutation / introduced / unknown after compaction;
    - a carried genome is never called "varied" in any mode. This test fails on the old rule that any locus ≠ 50 means "varied".
  - The inspector payload is read end to end in founders-words.
  - The Inspector reuses `originChip` for "present at creation".
- **VERIFIED OK — UX §3.3 strings**
  - `src/ui/strings/whatif.ts:116-126` and `CORE_PROTOTYPE_LABEL` match "Standard Evolution", "Accelerated Evolution (game setting, not realism)", "Fixed Traits" and "Core prototype — quantitative evolution" exactly.
- **VERIFIED OK — founder mode fixed per dish**
  - SPEC §8.6: "Changing modes starts a new dish or an explicit converted copy".
  - The Evolution sheet changes only the preset. Founders are shown read-only with "start a new dish".
- **VERIFIED OK — New Dish enters paused in the Lab with the Life tray open (UX §2.3)**
  - `NewDish.tsx:150-155` calls `labShowsDish` and then `openLabWith('life')`.
  - The e2e checks `data-view=lab`, `lab-cat-life aria-expanded=true` and `run-toggle`="Run".
- **VERIFIED OK — ownership**
  - Every change marked P2.2 is in an owned or shared-additive file.
  - The `styles.css` diff has no removed lines.
  - `commands.ts` replaced only the two-line `setMutationPreset` body, which is in scope, and added the Diverse origin in `introduceOrganism`.
  - `DishScreen.tsx` added an effect that closes the Lab tray when a sheet opens, needed for the "Life tray open" entry. The lab-tools spec still passes, per the builder's run.

## Commands run this session (results)

- `npx vitest run tests/fixtures/registry-imports.test.ts tests/sim/founders.test.ts tests/sim/founders-presets.test.ts tests/sim/founders-newdish.test.ts tests/sim/founders-words.test.ts tests/fixtures/inherited-variation.test.ts tests/fixtures/neutral-founders.test.ts tests/sim/view-switch.test.ts` → **Test Files 8 passed (8), Tests 100 passed (100)**, 212 s.
- `npx vitest run tests/worker tests/persistence` → **Test Files 9 passed (9), Tests 76 passed (76)**, 178 s.
- `npx tsc -p tsconfig.json --noEmit` → exit 0.
- `npx eslint` on the 21 P2.2 source and test files → exit 0.
- Probe (`tmp/verify-founders-rules/probe.test.ts`, its own vitest config) → 4 passed. Outputs are quoted under MINOR 1–3 above.
- `E2E_PORT=4201 E2E_OUTDIR=tmp/dist-verify-founders-rules npx playwright test tests/e2e/new-dish.spec.ts` → **6 passed (5.6m)** across phone-portrait, phone-landscape and desktop: the Done-when journey and the 200 % text test. Port 4201 was stopped afterwards and `tmp/dist-verify-founders-rules` was removed.
