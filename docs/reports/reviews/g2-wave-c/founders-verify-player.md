# G2 wave C — P2.2 Founder modes and mutation presets: adversarial verification (player-facing truth and usability)

Verifier lens: what a player actually sees and can do. I built the app, served it on port 4211 and drove it with throwaway Playwright specs on all three projects (phone portrait 360×800, phone landscape 800×360, desktop 1440×900), at 100 % and 200 % text. I read every screenshot. I also used small vitest probes for the inspector words.

I edited no repository file except this report and ran no git write commands. Scratch files, screenshots and logs are in `tmp/verify-founders-player/` (tmp/ is gitignored). I stopped port 4211 and deleted my scratch build when I finished.

**Verdict: not done (ok = false).** There are no BLOCKERs and three MAJORs, all player-visible:

1. **B7 is still partial.** Home, the Saved dishes list and the Save sheet describe a world without its mode labels.
2. **Mid-run Add Life is mislabelled.** In a Diverse dish, an organism you add at 5:00 is labelled "present at creation".
3. **The Evolution sheet contradicts the dish in one experiment.** In the Seeded traits demonstration dish, it says the founders have "no extra abilities" while half of them carry a Reserve chamber.

The "Done when" journey itself holds. `tests/e2e/new-dish.spec.ts` passed **6/6 on all three projects** in my run.

---

## Problems (most severe first)

### MAJOR 1: mode labels are missing where saved and continuing dishes are described (Build item B7)

- **The rule:** UX §3.3 says mode labels "must appear wherever a world is described". The assignment asks for "Core prototype — quantitative evolution" "wherever the world is described while the module registry is partial".
- **Where they are missing** (seen in my run, phone portrait, `tmp/verify-founders-player/player2-log.txt`):
  - `src/ui/views/Home.tsx:25-39`, the Continue card. It reads "Dish B — paused where you left it." (open dish), or "{name} — N s simulated. Opens paused." (autosave).
  - `src/ui/views/Saves.tsx:43-58`, the Saved dishes rows. They read "From a newer version / 5 s simulated · 9/28/2026, 6:52:33 PM". The imported dish is Standard, Identical and Core prototype, but the row says none of that.
  - `src/ui/panels/MoreSheet.tsx:174-186`, the Save sheet's slot buttons (`{name} · N s`).
  - The paired-run screens (`ExperimentRun.tsx`, `CompareScreen.tsx`) describe two worlds and show no mode label either.
- **Repro:**
  1. New Dish → Accelerated → Create.
  2. Home: the Continue card has no labels.
  3. More → Save… to Slot 1 → Home → Saved dishes: the row has no labels.
- **An easier half:** Home's open-dish branch already has `dishInfo.value.mutationPreset`, `founderMode` and `registry`. It needs no store change.
- **Status:** the builder disclosed this (report §6). Two independent verifiers now rate it MAJOR.

### MAJOR 2: in a Diverse dish, an organism the player adds mid-run is labelled "present at creation"

- **The code:** `src/sim/commands.ts:344`, `origin: draw?.seededModule ? 2 : (opts.origin ?? 1)`. This applies to every `introduceOrganism` call with no genome, including the Add Life tool (`commands.ts:267`) at any tick.
- **What the player sees** (probe `tmp/verify-founders-player/probe/diverse.test.ts`: FIRST_DISH_V1, seed 104729, Diverse, `run(w, 3000)` (5:00), then Add Life). The first module-carrying organism of each species, for example A01 #929, B01 #945 and P01 #969:
  - The Inspector chip (`Inspector.tsx:224`) reads **"present at creation"**. It should read "added by you or the recipe".
  - The module source (`strings/modes.ts` `moduleSourceText`) reads **"Present at creation."**
  - The lineage row (`strings/lineage.ts:226`) reads **"present at creation"**. It should read "added to the dish".
  - The same inspector also says: *"Its traits were set a little apart from 50 when it was added (varied founders)"*. So the inspector contradicts itself: "present at creation" versus "when it was added".
- **Why this breaks the honest-label rule:**
  - Everywhere else in P2.2, "present at creation" means *when the dish was made*. New Dish's summary counts "8 of the 56 founders … start with one (present at creation)", and that count excludes later Add Life. The Diverse note says "present at creation, not evolved in this dish".
  - Descendants of such an organism are told "Inherited from its founder #929, which had it at creation." A player reads that as dish creation.
  - Nothing tells the player that Add Life in a Diverse dish can give an organism an extra ability. The Life tray does not mention it, and the Diverse note says only "each founder".
- **Suggested fix:**
  - Keep origin 1 ("added by you or the recipe") for anything introduced after tick 0.
  - Carry the module fact in `founderOrigin.modules[].source` with honest words, for example "It carried this ability when you added it (Diverse founders)".
  - Or restrict the Diverse draw to recipe founders at creation.
  - Either way, log the ruling in DECISIONS. The builder's PROPOSED DECISION ("recipe founders and Add Life alike") does not mention this labelling consequence.
- **Rating:** the rules verifier rated this MINOR. Under the player / honest-label lens it is a visible false claim in the inspector, so I rate it MAJOR.

### MAJOR 3: the Evolution sheet says "no extra abilities" for a dish whose founders carry one

- **The code:**
  - `src/ui/panels/AdvancedEvolution.tsx:161-164` prints `founderNote(founderMode)`.
  - `src/ui/strings/modes.ts:53` says: "Every founder starts with the same neutral traits (50) and no extra abilities."
  - The note describes the mode's own draw, but it is phrased as a fact about this dish's founders. It ignores modules declared by the recipe.
- **Repro** (desktop; `tmp/verify-founders-player/shots/desktop-p5-expc-founders.png`):
  1. Home → Notebook → the "Seeded traits demonstration" card (EXP_C) → Start.
  2. Close the run and go to its dish.
  3. More → Evolution settings (Advanced).
- **What it shows:**
  - The sheet reads "Identical founders: Every founder starts with the same neutral traits (50) and no extra abilities."
  - The More label reads "Fixed Traits · Identical founders · Core prototype — quantitative evolution".
- **Why it is false:** that dish is RESERVE_COMPARE_V1. Its odd-numbered founders get a Reserve chamber (E05) present at creation (`content/recipes/RESERVE_COMPARE_V1.json:23-25`; `recipes.ts:295-298` gives them origin 2). The experiment card itself says the reserve chambers "were given to alternate founders when the dish was made (present at creation)". The inspector chip on those founders also says "present at creation". So two P2.2 surfaces contradict each other about the same dish.
- **Suggested fix:** state only what the mode did ("Traits start at 50; the founder mode adds no abilities"), and add a line from the preview/world's own founder summary. `founderSummary` / `NewDishPreview.founders[].withModule` already counts founders with modules, for example "12 of 24 Sprinters were given Reserve chamber by the recipe, present at creation".

### MINOR 1: Space on a focused Evolution option starts the dish instead of choosing it

- **The code:** `src/ui/views/DishScreen.tsx:128-130`. The global key handler takes Space for pause/run unless the focus is in an input, textarea or select. So it also fires on focused buttons.
- **Repro, all three projects:**
  1. More → Evolution settings.
  2. Focus "Fixed Traits" and press Space.
  3. Result: `aria-checked` stays false, and Run changes to **Pause**. The dish starts running at the old setting (`player-log.txt`: "Space on evolution-preset-fixed: fixed checked= false run before Run run after Pause").
- **Why it matters:** UX §4.2 lists "Enter/Space activate". Enter works.
- **Status:** the handler predates P2.2, but P2.2's new control is affected. The e2e never activates it from the keyboard. The radiogroups also have no arrow-key navigation (an app-wide pattern).

### MINOR 2: focus goes to `<body>` when the Evolution sheet opens and after Create

- **Repro:** press Enter on More → "Evolution settings (Advanced)". `document.activeElement` is then BODY, on all projects. It is also BODY right after "Create dish".
- **Why it matters:** screen-reader users hear nothing about the sheet or the opened Life tray. What if? and Lineage already move focus into their panel.

### MINOR 3: P2.2 text in the inspector is below 16 px, and the e2e does not look there

- **What I measured:** `.module-source` (the P2.2 "Present at creation." / "Inherited from its founder #N …" line, D8) is **14 px**. It inherits `.module-list > li { font-size: var(--fs-small) }` (`styles.css:1019-1024`; the `.module-source` block is at `styles.css:2275`). The reused chip "present at creation" is **12.8 px** (`.chip`, `styles.css:421-422`). Measured on phone portrait and desktop in `player4-log.txt`.
- **Why it matters:**
  - UX §4.1 requires body text of at least 16 px.
  - The builder's X2 claim ("P2.2 text ≥ 16 px") holds only for New Dish and the Evolution sheet. `expectTextAtLeast16px` checks only `main.page` and `[data-testid=evolution-sheet]`.
  - `founder-start` is 16 px (OK).

### MINOR 4: in phone landscape (100 % and 200 %) and desktop at 200 %, the "open" Life tray is off-screen after Create

- **Evidence:** `player3-log.txt` and `shots/phone-landscape-100-p3-created.png`.
  - Phone landscape 100 %: the tray starts at y = 354 in a 360 px-tall window, and the first species tile is at y = 468. The player sees "Life" pressed and no species.
  - Phone landscape 200 %: the first tile is at y = 934.
  - Desktop 200 %: the first tile is at y = 934 of 900.
  - Phone portrait and desktop at 100 % are fine.
- **Test gap:** `new-dish.spec.ts` asserts only `lab-cat-life` `aria-expanded="true"`. That is a weaker proxy for UX §2.3's "Enter paused with the Life tray open".
- **Suggested fix:** scroll the tray into view when `openLabWith('life')` runs, and assert it is in the viewport.

### MINOR 5: "New dish…" in the Evolution sheet leads to a flow that discards the current dish with no warning, and Back does not return to it

- **Repro** (phone portrait, `player2-log.txt`):
  1. New Dish "Dish A" → Create → Run 3 s → Evolution settings → Fixed Traits.
  2. Tap "New dish…" (`AdvancedEvolution.tsx:166-174`), then Back. You land on **Home**, not the dish (`NewDish.tsx:165`), and the dish is left paused.
  3. New dish "Dish B" → Create.
  4. **Dish A is gone.** It is not in Saved dishes and not in Continue. `startCustom` disposes it without saving (`state.ts:448`).
- **Also seen:** the previous dish's toast "Evolution is now Fixed Traits. The change is in History; Undo rewinds it." was still showing on the brand-new Dish B, which is Standard and has no such change. `enterDish` never clears the toast.
- **Why it matters:**
  - UX §2 says blocking panels (New Dish) "pause and restore the prior run state on close".
  - The sheet's own copy sends players here ("to try another mode, start a new dish"). That is the "change one thing" path, and it destroys the dish being compared.
  - What if? keeps the current dish first (`startExperiment` autosaves it; the What if? flow offers slots).
- **Status:** the discard itself predates P2.2 (Home → New dish). The one-tap entry from inside the dish is new. Needs an owner decision: route through the What if? keep flow, or confirm first.

### MINOR 6: a founder is told "Same inherited traits as its parent."

- **Where:** `Inspector.tsx:419-423`.
- **What happens:** a generation-0 founder has no parent. Right below that sentence, the new P2.2 line says its traits "were set a little apart from 50 when it was added (varied founders)" (`shots/phone-portrait-07-inspector-inherited.png`, Sprinter #2). The two lines contradict each other.
- **Status:** the wording predates P2.2, but it now sits next to the P2.2 line. Suggest "It is a founder: it has no parent in this dish." for generation 0.

### MINOR 7: the New Dish ledger does not add up as displayed

- **Where:** `NewDish.tsx:76-80`.
- **What the page shows:** "At the start the dish holds 5567.1 carbon … the habitat's own 5399.0 carbon plus 168.0 added". But 5399.0 + 168.0 = 5567.0.
- **The real values** (probe `probe-ledger.txt`): 5399 + 168.05 = 5567.05. `amount()` rounds each value separately.
- **Also:** mineral is shown as "0.00" while the others use one decimal.
- **Why it matters:** "a scientist can verify" (UX §1). Show two decimals, or build the total from the displayed parts.

### MINOR 8: "Fixed Traits: Offspring are exact copies of their parent." overclaims

- **Where:** `strings/modes.ts:40`.
- **The problem:** only the genome is copied. Body, energy and state are not ("a temporary state is not inherited").
- **Suggested wording:** "Offspring inherit their parent's traits unchanged. Good for controlled experiments."

### MINOR 9: "Its founder already carried it …" is shown for the founder itself

- **Where:** `strings/modes.ts:174`. The 'introduced' source always says "Its founder already carried it when it was added to the dish.", even when `generationsFromFounder === 0` (the organism *is* the founder, for example a saved specimen just placed).
- **Test:** `founders-words.test.ts` ("a saved genome added to an Identical dish …") expects this exact wording.
- **Suggested wording:** "It already carried it when it was added to the dish."

### MINOR 10: the P2.2 toast is clipped at 200 % text in phone landscape

- **Evidence:** `shots/phone-landscape-200-08-evolution-change.png`. "Evolution is now Standard Evolution. The change is in History; Undo rewinds it." runs off the bottom of the screen after "The change is in", and it covers the change list for 3.5 s.
- **Status:** the toast layout predates P2.2 (at 200 % portrait it covers the whole sheet but stays readable). A shorter message would help ("Evolution: Standard. Undo rewinds it.").

### MINOR 11: from Saved dishes, an import refused for an unknown module shows no message at all

- **Repro:**
  1. Home → Saved dishes → Choose a file…
  2. Pick `tmp/verify-founders-player/bad-e07.pixelmeba` (a valid, re-checksummed save with E07 "Light seeker" in its registry, made by `probe/badfile.test.ts`).
  3. Result: nothing appears for 30 s on any project, and the page stays on "Saved dishes" (`player2` first run, "refusal text ever shown within 30 s: false").
- **Cause:** `importFile` sets a toast (`state.ts:384`), but only DishScreen, ExperimentRun and CompareScreen render toasts. Home and Saves have no toast host.
- **The message itself is fine:** importing the same file from a dish's More sheet shows "Nothing was changed: This dish uses the extra ability "Light seeker" (E07), which this version of Pixelmeba cannot simulate. Nothing was loaded." (`player6-log.txt`).
- **Status:** the D1 fixture is satisfied as written, and the silent Saves import predates P2.2. But D1's "fails import clearly" does not reach a player who imports from Saved dishes. A toast host in `App.tsx` (shared) would fix every page.

### MINOR 12: the builder report's accessibility claim for Content is inaccurate

- **The claim:** "The Content section always renders its controlled region, so its aria-controls never points at a missing element."
- **The code:** `NewDish.tsx:283-290` renders `<div id="nd-content-body">` only when `showContent`. The same holds for `nd-rates` (`NewDish.tsx:249-256`). When collapsed, `aria-controls` names a missing id.
- **Impact:** none for users (axe allows this with `aria-expanded="false"`). This is about report accuracy only.

**Seen but not counted against P2.2 (pre-existing, app-wide):**

- The focus outline (#f2b84b) on the light surface (#f5f4ef) is about 1.6 : 1, below 3 : 1 for a focus indicator.
- The Lab Life tray label "Crumbsmith" touches the panel edge on desktop.
- `CompareText.tsx:41` and `strings/experiments.ts:193` show raw preset ids. The rules verifier already listed this; I found no UI path that sends a preset change to arm B.

---

## VERIFIED OK

- **The task e2e spec, all projects:** `E2E_PORT=4211 E2E_OUTDIR=tmp/dist-verify-founders-player npx playwright test tests/e2e/new-dish.spec.ts` gave **6 passed (4.5 m)**: phone portrait 49.4 s + 23.1 s, phone landscape 39.4 s + 16.5 s, desktop 1.4 m + 47.4 s.
- **The spec exercises the Done-when journey, not a proxy:**
  - New Dish → Varied + Accelerated (checks `aria-checked`).
  - The UX §3.3 labels in "What you get".
  - Advanced rates: 16/4/1 %, then 8/0.2 % after switching.
  - Create, then Run (`Pause` label), then a change while running. The time stamp is at least the time before the change.
  - History → What happened lists "Evolution changed from Accelerated Evolution (game setting, not realism) to Standard Evolution."
  - Undo removes it.
  - The exceptions are the Life-tray visibility gap (MINOR 4) and that History chart marks are not asserted. I checked the marks by hand: the first chart's SVG has lines at the two change seconds (x ≈ 62 and 296 in landscape, 84 and 243 on desktop).
- **The UX §3.3 strings are exact:** "Standard Evolution", "Accelerated Evolution (game setting, not realism)", "Fixed Traits", "Core prototype — quantitative evolution", "present at creation". Seen in New Dish ("What you get" and Content), the More label, the Evolution sheet (label and Content) and the inspector chip. Seen on all three projects.
- **Advanced rates and pacing match CT §12.8 and SPEC §8.7:**
  - Standard 8 / 2 / 0.2 %, Accelerated 16 / 4 / 1 %, Fixed 0 / 0 / 0.
  - Developmental shows "—, not part of this version".
  - Pacing reads "about 63 %" (Standard) or "about 99 %" (Accelerated) with "A try is not a lasting new branch, and nothing is promised in a fixed time". Fixed reads "Offspring never change at this setting."
  - The speed copy reads "Playing at 2× or 4× … never changes these chances."
- **Preset change during play:** timestamped (0:01 and 0:06 portrait; 0:03 and 0:09 desktop). Listed in the Evolution sheet and in History → What happened. Marked on the charts. Undo removes only the latest change, and the More label goes back ("Fixed Traits · Diverse founders · Core prototype …").
- **New Dish opens paused in the Lab with Life expanded** on all three projects: "0:00 · 56 alive", Run label. The only caveat is the visibility gap in MINOR 4.
- **Diverse founders:**
  - New Dish's summary for seed 104729 ("8 of the 56 founders … 2 Sunbeads (2 with Reserve chamber); 4 Sprinters (1 with Starch release, 1 with Resting stage, 2 with Reserve chamber); 2 Recyclers …") matches the world exactly. My probe found 8 seeded founders: #2, #8, #9, #24, #41, #44, #54, #55.
  - Tapping Sprinter #2 in the running UI shows the chip "present at creation", the module source "Present at creation." and the founder-start line.
- **Descendant words:** "Inherited from its founder #N, which had it at creation." and the varied-founder line come from a real inspector payload (founders-words).
- **Export metadata:** a file from `buildSaveFile` carries `meta.registry {moduleRegistryVersion: 1, evolutionRulesVersion: 1, enabledModules: [E01, E03, E05]}` and `meta.evolution {mutationPreset, founderMode}` (`good-meta.json`).
- **An unsupported module is refused, readably:** the More-sheet import shows the message naming "Light seeker" (E07), and the open dish stays "Little Living Garden, 0:00 · 56 alive". An imported valid file shows "Standard Evolution · Identical founders · Core prototype — quantitative evolution".
- **Accessibility, all projects:**
  - axe finds no serious or critical violations on New Dish (initial, Varied + Accelerated with both disclosures open, Diverse, 200 %), the inspector, the Evolution sheet (before and after changes, 200 %) and History. Only moderate `landmark-one-main` / `page-has-heading-one` appear on the dish screen (pre-existing).
  - Every button, input and radio in New Dish and the Evolution sheet is at least 48 px.
  - All text in New Dish and the Evolution sheet is at least 16 px.
  - No horizontal overflow at 100 % or 200 % on any project.
  - The Tab order through New Dish is logical: Back → Start with → Name → Seed → Randomize → presets → founders → Advanced → Content → Create.
  - The chosen option is marked by fill plus a 6 px bar, not by colour alone, and axe's colour-contrast check is clean.
- **Reduced motion:** the P2.2 CSS block adds no transitions or animations.
- **Targeted vitest:** `npx vitest run tests/sim/founders*.test.ts tests/fixtures/registry-imports.test.ts` gave **5 files, 37 tests passed** (45 s).

## Commands (this session)

- `npx vite build --outDir tmp/dist-verify-founders-player`, then `vite preview --port 4211`. Stopped by port, and the build was removed afterwards.
- `E2E_PORT=4211 E2E_OUTDIR=tmp/dist-verify-founders-player npx playwright test tests/e2e/new-dish.spec.ts`: 6 passed.
- `npx playwright test -c tmp/verify-founders-player/pw.config.ts` (throwaway specs `player.spec.ts` and `player2`–`player6`): the walk-throughs passed on all projects. `player2` first failed on my own selector (strict mode on "Slot 1"); after the fix it passed on phone portrait.
- `npx vitest run --config tmp/verify-founders-player/vitest.probe.config.ts` (probes: `diverse`, `badfile`, `ledger`).
- `npx vitest run` on the 5 P2.2 test files: 37 passed.
