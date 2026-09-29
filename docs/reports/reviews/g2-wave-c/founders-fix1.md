# G2 wave C — P2.2 Founder modes and mutation presets: fix round 1

I fixed the findings in `founders-verify-rules.md` and `founders-verify-player.md` on top of the builder's
uncommitted work. I ran no git write command and deleted no file I did not create. My throwaway walk-through
(`tmp/fix1-founders/`, gitignored) and build folder (`tmp/dist-founders-fix1`) were removed at the end, and
port 4191 was stopped.

## 1. Findings, one by one

### MAJOR — B7: mode labels missing where saved and continuing dishes are described (both verifiers)

**FIXED.** UX §3.3: "Mode labels (must appear wherever a world is described)".

- **Slot index.** It keeps copies of the file's `meta.evolution` and `meta.registry`, as it already does for `meta.variant`.
  - `store.ts`: `SlotInfo` and `SaveRequest` have optional `evolution` and `registry`.
  - `host.ts`: both save paths pass them through `slotMetaCopies`.
- **What the host reports.** `describeSlot` returns `SlotSummary.modes = { mutationPreset, founderMode, partial? }`.
  - The copies are re-validated (`saveMetaEvolution` + `saveMetaRegistry`), and a malformed copy is dropped.
  - `partial` compares the recorded registry with this build's catalog.
  - It is used by `listSlots`, the `slotSaved` reply and What if?'s `keepDish`.
- **Where the labels show:**
  - Home Continue: the open dish (from `dishInfo`/`evolution`) and the autosave (from `modes`).
  - Saved dishes rows.
  - The Save sheet's slot buttons.
  - The paired runs: one "Both copies: …" line in Compare setup (`CompareSetup.tsx`) and Experiment setup (`ExperimentRun.tsx`).
- **Older slots.** A slot index written before this change shows no line. The labels are never guessed.
- **Tests:**
  - `founders-newdish.test.ts` "saved dishes keep their mode labels …": save, autosave and list through the host; a later change is recorded by the next save; a tampered copy is dropped; an older index shows none.
  - `founders-words.test.ts` covers `slotModesLine`.
  - The e2e `new-dish.spec` checks the Save sheet slot, Home Continue (open dish, and the autosave after a reload) and the Saved dishes rows, with the exact line and text ≥ 16 px.
- **Not covered:** automatic checkpoint rows (P2.8 ring). See §3.

### MAJOR / MINOR — Diverse: life added mid-run labelled "present at creation" (both verifiers)

**FIXED.**

- **The rule.** The Diverse ability draw now applies only while the dish is at 0:00 (tick 0, before its first tick runs), via `founders.ts` `atCreation(world)`. That covers the recipe's founders and anything added before the dish first runs, including the Lab's "enter with the Life tray open" additions at 0:00.
- **Later additions.** Life added later gets the Varied traits only, with lineage origin 1. So the chip reads "added by you or the recipe", the lineage row reads "added to the dish", and the module source never says "present at creation".
- **Why this rule:**
  - SPEC §8.6 says Diverse modules are "labelled 'present at creation'", so they can only be given at creation.
  - D04 §3 calls the modes "starting options", under "Pacing and starting diversity".
  - D04 also says "Their externally supplied biomass and energy follow normal tool initialization", so founders placed with tools at creation are included.
- **Existing hashes are unchanged.** No content recipe uses Diverse, and Diverse was not selectable before P2.2. Identical and Varied draws are untouched.
- **Words.** The Diverse note (New Dish and the Evolution sheet) now says: "each founder placed at 0:00 … Life added later gets varied traits only."
- **Tests** (`founders.test.ts`):
  - "life added after 0:00 in a Diverse dish gets varied traits only…". This fails on the old code, because the 0:00 oracle would have seeded more than 20 of the same birth ids. It also runs the real Add Life command mid-run in a Diverse garden: every new founder has origin 1 and no module.
  - "Diverse applies to life added at 0:00 too" now also checks origin 2 ⇔ module.

### MAJOR — Evolution sheet: "no extra abilities" for a dish whose recipe gave founders one (player verifier)

**FIXED.**

- **Mode notes.** They now say what the mode does, not what every founder has. For example: "Founders start with the same neutral traits (50). This mode gives them no extra abilities."
- **What this dish's founders carried.** The sheet adds a line from the recorded lineage:
  - `founders.ts` `creationFounders(world)` scans the tick-0 founder records (a prefix of the birth records).
  - The host adds it to the snapshot as `evolution.creation`.
  - `modes.ts` `creationFoundersText` words it. For Experiment C: "Present at creation: 12 of 24 Sprinters carried Reserve chamber."
  - When older records were compacted it says so, and never guesses.
- **Specimens.** A line says a placed saved specimen keeps its own traits.
- **Tests:**
  - `founders.test.ts` "creationFounders lists …". This uses RESERVE_COMPARE_V1: 24 founders, 12 with E05, unchanged after a run and a later Add Life. Its Diverse garden rows equal New Dish's summary.
  - `founders-words.test.ts`: the exact Experiment C sentence, and "Every founder" never appears in a note.
  - `founders-newdish.test.ts`: the snapshot carries `creation`.
  - e2e: `evolution-creation` text in both journeys.

### MINOR — an "unchanged" preset command still marked the History timeline (rules verifier)

**FIXED.**

- **The sim.** `commands.ts` (`setMutationPreset` case, additive): an accepted-0 result, whether the setting was already in effect or the id was unknown, is no intervention. It adds no History mark. It was already neither an undo point nor an experiment end.
- **The UI.** `EvolutionSheet` keeps a pending-choice guard, so a second quick tap is not sent at all.
- **Tests** (`founders-presets.test.ts`):
  - "choosing the setting already in effect … never marks the History timeline": no marked second after 20 ticks, and a real change is marked once. This fails on the old code.
  - `pendingInterventions` is 1 after one real change and two no-op commands.

### MINOR — a newer build's module with a definition this schema rejects got an unnamed refusal (rules verifier)

**FIXED.**

- **The change.** `saveFile.ts` names any module id outside `IMPLEMENTED_MODULES` before it schema-parses the definitions. The name is used when it is a readable string; otherwise the id alone is named.
- **Test.** `registry-imports.test.ts` "a module from a newer build is named even when this build cannot read its definition":
  - E18 with the same shape as this build's modules → named refusal.
  - E18 with `phase: 8` → named refusal. This fails on the old code, which gave "A module definition is invalid.".
  - E18 without a name → the id alone.

### MINOR — raw preset ids in `CompareText.tsx:40-41` and `strings/experiments.ts:193` (both verifiers)

**NOT FIXED (not my files; unreachable today).** Exact fix for the lead:

- `CompareText.tsx:41`: `` `Evolution setting: ${evolutionLabel(payload.preset)}` ``
- `strings/experiments.ts:193`: `` `evolution setting ${evolutionLabel(p.preset)}` ``

In both files, import `evolutionLabel` from `strings/whatif`.

### MINOR — two sources of truth for "partial registry" (`host.ts:99` registryLabel) (rules verifier)

**NOT FIXED.** It is non-additive to the What if? builder's function. Nothing visible differs today, because every world is partial.

Fix for the lead:
- Compute `registryLabel` from the build catalog size, as `registryInfo().partial` does.
- Return a registry description, not the preset label "Standard Evolution", for a full registry.

### MINOR — report claim about `aria-controls` (both verifiers)

**FIXED by making the claim true.** `#nd-rates` and `#nd-content-body` are now always rendered, with `hidden` while collapsed.

### MINOR — Space on a focused Evolution option ran the dish; no arrow keys (player verifier)

**FIXED.**

- **ChoiceGroup** (`AdvancedEvolution.tsx`):
  - It handles Space, Enter, the arrow keys, Home and End itself, and stops them from reaching the dish's shortcuts.
  - Arrows move focus between options without choosing, because a choice in the Evolution sheet is a recorded intervention.
- **DishScreen** (one additive line): Space on any focused control activates that control and never pause/run behind it (UX §4.2 "Enter/Space activate"). `garden.spec` "Space runs and pauses" still passes on all projects.
- **Test.** The e2e (200 % journey) focuses Accelerated, presses ArrowDown and checks that focus is on Fixed Traits and it is not chosen. After Space, Fixed Traits is chosen, the change is listed, and Run is still "Run".

### MINOR — focus went to `<body>` on opening the Evolution sheet and after Create (player verifier)

**FIXED.**

- **Evolution sheet.** Its heading takes focus on open (`tabIndex=-1`), like What if? and Lineage.
- **Create.** Focus moves to the first Life-tray item (`revealLifeTray` in `NewDish.tsx`).
- **Tests.** The e2e checks `#evolution-title` is focused, and `expectLifeTrayShown` checks the first item is focused.

### MINOR — P2.2 inspector text below 16 px (player verifier)

**FIXED.**

- `.module-source` is `--fs-body`.
- The inspector header chips (`.chips > .chip`, used only there) are `--fs-body`, so the reused "present at creation" chip is 16 px. This is an additive rule in the P2.2 CSS block.
- Checked by `inspector.spec` on three projects. It has no size assertion; no automated test measures these two sizes.
- Other 14 px inspector text (`.module-list > li`, from P2.1) predates P2.2. See §3.

### MINOR — Life tray "open" but off-screen after Create (landscape, 200 %) (player verifier)

**FIXED.**

- **The fix.** After `openLabWith('life')`, New Dish scrolls the tray into view and focuses its first item.
- **Test.** The e2e now asserts that the first Life item is in the viewport (`toBeInViewport({ ratio: 0.5 })`) and focused, at 100 % and 200 % on all projects. The old test only checked `aria-expanded`.
- **Screenshots.** Throwaway screenshots confirmed the tray is in view in landscape 100 % and 200 %, and on desktop at 200 %.

### MINOR — "New dish…" from the sheet discards the dish; Back went Home; stale toast (player verifier)

**PARTLY FIXED; owner decision proposed.**

- **Back.** When New Dish was opened from the Evolution sheet, Back returns to that dish and restores its run state (`newDishReturn`). This follows UX §2: blocking panels "restore the prior run state on close".
- **Warning.** New Dish shows "Creating a new dish closes “X”. To keep it, go Back and save it first (More → Save…)." whenever a dish is open.
- **Stale toast.** The previous dish's toast is cleared on Create.
- **Test.** The e2e (200 % journey): Run → New dish… → the warning is visible → Back → the dish screen is running again.
- **Not changed:** Create still closes the open dish without saving. That is the pre-existing Home → New dish flow in `state.ts` `startCustom`. See the PROPOSED DECISION below.

### MINOR — a founder told "Same inherited traits as its parent." (player verifier)

**FIXED.**

- **The change.** `Inspector.tsx` shows "A founder: it has no parent in this dish." for generation 0. History already did the same.
- **Test.** None added. The line is only UI copy, and the `inspector.spec` regression passes.

### MINOR — New Dish ledger did not add up as displayed (player verifier)

**FIXED.**

- **The change.** `modes.ts` `startLedgerText` shows every amount to 0.01 ("game units, to 0.01"). The carbon total is the sum of the two parts as shown, taken from the same hundredths.
- **Test.** `founders-words.test.ts` "the New Dish start ledger adds up as displayed":
  - 5399.00 + 168.05 = 5567.05.
  - A case where separate rounding would show 0.01 + 0.01 = 0.01.

### MINOR — "Fixed Traits: Offspring are exact copies of their parent." overclaims (player verifier)

**FIXED.** The note is now "Offspring inherit their parent’s traits unchanged. Good for controlled experiments." Covered by `founders-words.test.ts`.

### MINOR — "Its founder already carried it" shown for the founder itself (player verifier)

**FIXED.**

- For `generationsFromFounder === 0` the source reads "It already carried it when it was added to the dish."
- Descendants keep the founder wording.
- `founders-words.test.ts` was updated. The specimen test now expects the self wording.

### MINOR — the evolution toast clipped at 200 % in phone landscape (player verifier)

**FIXED.**

- **Shorter text.** `presetChangedToast`: "Now Standard Evolution. Undo rewinds it."
- **Width.** `.toast` now sizes to its text, up to 90 % of the area it sits in (`width: max-content`, additive rule). Before, the absolute `left: 50%` box could use only half the width and wrapped to 5 lines.
- **Screenshot.** Landscape at 200 % now shows 2 lines.
- **Test.** `founders-words.test.ts` covers the text.

### MINOR — a refused import from Saved dishes showed no message (player verifier)

**FIXED.**

- **The change.** `App.tsx` renders a `PageToast` for pages without their own toast host: Home, Saved dishes, Notebook and the others; not the dish, compare or experiment run. It is fixed at the bottom, 16 px, and ignores the pointer. The route switch moved unchanged into `RoutedPage`.
- **Test.** The e2e imports a broken file on Saved dishes and checks that "Nothing was changed" shows and the page stays on Saved dishes.

## 2. PROPOSED DECISIONS (for DECISIONS.md)

- **PROPOSED DECISION: the Diverse ability draw happens only at creation.**
  - It applies only while the dish is at 0:00 (tick 0): the recipe's founders and life added before the first tick runs.
  - Life added later in a Diverse dish gets Varied traits only and lineage origin 1.
  - Reason: SPEC §8.6 labels these modules "present at creation", and D04 §3 describes the modes as "starting options". The label must stay true.
  - No saved world changes, because Diverse was never selectable before P2.2.
- **PROPOSED DECISION: an evolution-setting command that changes nothing is recorded but is not an intervention.** Choosing the setting already in effect, or an unknown one, stays in the command log with accepted 0. It adds no History mark and no undo point, and it does not end an experiment.
- **PROPOSED DECISION: mode labels on saved dishes come from copies kept in the slot index.**
  - The slot index copies `meta.evolution` and `meta.registry`, as it already copies the variant.
  - The copies are re-validated and display-only; the world record stays authoritative.
  - `partial` is computed against the build catalog when the list is read.
  - Slots written earlier show no mode line and are never guessed.
- **PROPOSED DECISION: import names unsupported modules before checking their definitions.** A module id this build cannot simulate is refused by id, and by name when it is readable, before the definitions are schema-checked.
- **PROPOSED DECISION: the Evolution sheet's Founders section has three parts.**
  - The mode's note, which says what the mode does.
  - The recorded line for the founders at creation. Records that were compacted are reported as "no longer listed".
  - A line saying a placed specimen keeps its own traits.
- **PROPOSED DECISION: keyboard behaviour of choice groups.** Arrow keys, Home and End move focus between choices without choosing. Space and Enter choose. Space on any focused control on the dish screen activates that control and never pauses or runs the dish.
- **PROPOSED DECISION: toasts.**
  - A toast sizes to its text, up to 90 % of the area it sits in.
  - Pages without a dish show toasts pinned to the bottom of the window.
  - The inspector header chips use body size.
- **PROPOSED DECISION (owner): what Create does to the open dish.** Create in New Dish still closes the open dish unsaved. This predates P2.2 (Home → New dish).
  - Option A (recommended): keep the current dish first, the way What if? does. Save it to its own slot or the first free one, then autosave, and refuse with the slots-full choice when all ten are used.
  - Option B: ask for confirmation before discarding.
  - Today New Dish warns and Back returns to the dish.

## 3. Left for the lead or other owners (precise)

- **Checkpoint rows in Saved dishes have no mode line (P2.8 ring).** Three changes are needed:
  - Add optional `evolution` and `registry` to `CheckpointRequest` and to the `SlotInfo` the ring writes (`checkpoints.ts:118`).
  - Pass `...slotMetaCopies(b.file)` in the `ring.write` call at `host.ts:888`.
  - Make `checkpointSummary` add `slotModes(s, catalogSize)`.
- **CompareText / experiments raw preset ids.** See the raw preset ids finding in §1.
- **`registryLabel` in `host.ts:99`.** See the partial-registry finding in §1.
- **Pre-existing, not P2.2:**
  - **Lab tray at 200 % text in phone portrait.** Each `.lab-item` is 328 × 316 px, the icon fills it, and the name runs off to the right: the tray's `.sheet-scroll` has scrollWidth 539 in a 360 px tray (measured when the tray is opened by hand). The new-dish focus step now lands on that tile.
  - **`.module-list > li` is 14 px (P2.1), and so is `.topbar .time`.**

## 4. Files changed this round

- **Owned:**
  - `src/sim/founders.ts`
  - `src/sim/mutation.ts` (the type of the optional `EvolutionState.creation` field)
  - `src/ui/views/NewDish.tsx`
  - `src/ui/panels/AdvancedEvolution.tsx`
  - `src/ui/strings/modes.ts`
  - `tests/sim/founders.test.ts`
  - `tests/sim/founders-presets.test.ts`
  - `tests/sim/founders-newdish.test.ts`
  - `tests/sim/founders-words.test.ts`
  - `tests/fixtures/registry-imports.test.ts`
  - `tests/e2e/new-dish.spec.ts`
- **Shared, additive:**
  - `src/sim/commands.ts`: one line in the `setMutationPreset` case.
  - `src/worker/protocol.ts`: `SlotSummary.modes` and `SlotModes`.
  - `src/worker/host.ts`:
    - new helpers `slotModes`, `slotMetaCopies` and `describeSlot`;
    - the two save calls pass the meta copies;
    - `listSlots`, `slotSaved` and `keepDish` use `describeSlot`;
    - the snapshot's `evolution.creation`.
  - `src/persistence/saveFile.ts`: `saveMetaEvolution`, and the named refusal moved before the module schema check.
  - `src/ui/state.ts`: the toast text.
  - `src/ui/app/App.tsx`: `PageToast`. The route switch moved unchanged into `RoutedPage`.
  - `src/ui/views/DishScreen.tsx`: one line for Space.
  - `src/ui/panels/MoreSheet.tsx`: slot mode line.
  - `src/ui/panels/Inspector.tsx`: the generation-0 wording.
  - `src/ui/styles.css`: P2.2 block only; only new rules and one added declaration.
- **Outside my list, small and additive:**
  - `src/persistence/store.ts`: optional index copies.
  - `src/ui/views/Home.tsx` and `src/ui/views/Saves.tsx`: mode lines.
  - `src/ui/panels/CompareSetup.tsx` and `src/ui/views/ExperimentRun.tsx`: one "Both copies: …" line each.
- I ran prettier only on the files I own and that the P2.2 builder created or formatted: `NewDish.tsx`, `AdvancedEvolution.tsx`, `modes.ts`, `founders.ts`, and my test and spec files.

## 5. Commands and results (this session)

- **Owned tests:** `npx vitest run tests/sim/founders.test.ts tests/sim/founders-presets.test.ts tests/sim/founders-newdish.test.ts tests/sim/founders-words.test.ts tests/fixtures/registry-imports.test.ts` → **5 files, 46 tests passed**. First run 54.9 s; re-run after the last formatting 71.0 s.
- **Regression tests:** `npx vitest run --maxWorkers=1 tests/worker tests/persistence tests/sim/view-switch.test.ts tests/fixtures/inherited-variation.test.ts tests/fixtures/neutral-founders.test.ts tests/fixtures/determinism.test.ts tests/experiments/journal-and-words.test.ts tests/experiments/exp-c-reserve.test.ts tests/experiments/app-flow.test.ts tests/sim/lineage-panel.test.ts tests/sim/comparison.test.ts tests/sim/history-journal.test.ts` → **19 files, 203 tests passed**. No `tests/sim/mutation*.test.ts` files exist.
- **Typecheck:** `npx tsc -p tsconfig.json --noEmit` → exit 0, after the last edit.
- **Lint:** `npx eslint` on all 25 touched source, test and spec files → exit 0, after the last edit.
- **First e2e run:** `E2E_PORT=4191 E2E_OUTDIR=tmp/dist-founders-fix1 npx playwright test tests/e2e/new-dish.spec.ts` → **6 passed (6.2 m)** on phone-portrait, phone-landscape and desktop.
- **Full e2e run, final build:** `E2E_PORT=4191 E2E_OUTDIR=tmp/dist-founders-fix1 npx playwright test tests/e2e/{new-dish,whatif,lab-tools,inspector,save-reload,garden,compare,experiments}.spec.ts` → **81 passed (54.9 m)** on all three projects (27 tests × 3).
- **Walk-through:** a throwaway Playwright walk-through (`tmp/fix1-founders/`, all three projects at 100 % and 200 %) with screenshots checked by eye. It covered the tray in view, the Evolution sheet creation line, the toast, the Save sheet, Home, Saved dishes, the page toast and the Compare line. It was removed at the end.
- **Accessibility and layout:**
  - axe: `expectNoSeriousA11yViolations` passes on New Dish, the Evolution sheet (100 % and 200 %) and the regression screens.
  - Touch targets: 48 px, via `expectReachable`.
  - Text ≥ 16 px: `main.page` on New Dish and Saved dishes, the Evolution sheet, and `.slot-modes`.
  - No sideways overflow at 200 % in phone portrait and landscape.
