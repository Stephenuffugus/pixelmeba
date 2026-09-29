# D-0033 "keep the open dish first": verification, player lens

Verifier (adversarial) for the keep-dish build. Lens: player-facing truth and usability. Date 2026-09-29.

**Verdict: not OK.** 3 MAJOR, 6 MINOR. The Keep sheet itself holds up well. Every sentence the builder
added is true where it appears, and the e2e results the builder reported are real. The problems are:

- what is still said, or not said, around the new behaviour;
- one unnecessary-keep case that fills the slots;
- a relaunch path where the dish on Home's Continue card is replaced without being kept.

## How this was checked

- **Tree under test:** the uncommitted working tree. Checksums are in
  `tmp/verify-keep-dish-player/snapshot.txt`, and the same diff hash was re-checked at the end
  (`c1e9e1da…`), so nothing changed during the verification.
- **Build and server:** built into `tmp/dist-keep-dish-20` and served on port 4211. The server was
  stopped at the end, by port only.
- **Throwaway spec:** `tmp/verify-keep-dish-player/player.pspec.ts`, with its own config
  `tmp/verify-keep-dish-player/playwright.config.ts`.
  - It drove the built app on phone-portrait (360×800), phone-landscape (800×360) and desktop
    (1440×900), at 100 % and 200 % text.
  - Every probe passed on every project: A–F (18), G–L (18), M (3), N (portrait).
  - The raw observations (JSON) and screenshots are in `tmp/verify-keep-dish-player/obs/`.
- **Repo e2e re-runs:** `keep-dish.spec.ts` and `whatif.spec.ts` on all three projects. The results
  are under VERIFIED OK below.

## Problems (most severe first)

### MAJOR 1 — An untouched recipe start is saved to a new slot every time it is replaced

Restarting the Garden fills the ten slots with identical 0:00 copies.

- **Where:** `src/worker/host.ts:1412-1423` (`keepPlan`) and `:1536-1538` (`keepDish`). The only
  "nothing to write" rules are:
  - `rebuildsExactly` (`:1385-1390`), which requires a What if? variant record;
  - `holdsExactly`, which requires the dish's own slot.

  A Garden started from the Play shelf, a New Dish, or an experiment dish that is still at tick 0 and
  was never saved matches neither rule, so it is always written.
- **Repro (all three projects, 100 %):**
  1. Home → Play → Start. Do not run the dish.
  2. Home → Play → Start again. The toast says "Saved “Little Living Garden” to Slot 1 first."
  3. Once more. The toast says "Saved “Little Living Garden” to Slot 2 first."
  4. Saved dishes now lists Slot 1 and Slot 2, both "0 s simulated" (`obs/*-A.json`,
     `untouchedRestart1/2`, `rowsAfterUntouchedRestarts`).
  5. After ten restarts, all ten slots hold identical 0:00 Gardens. The next Start opens "All ten
     save slots are used", for a dish that Start rebuilds exactly.
- **Why this is MAJOR:**
  - The assignment's Done-when lists "unchanged recipe start → nothing written", and the ruling says
    nothing is written when keeping is unnecessary.
  - The builder tested (a) only with a What if? variant (R-G2). The builder then raised the Garden
    case as PROPOSED DECISION 7 but shipped the behaviour that uses up slots.
  - What if? already kept an untouched Garden this way (`tests/worker/whatif.test.ts:721-723`). That
    mattered little while only What if? kept dishes. Play Start is now the most common way to replace
    a dish, so every restart uses a slot.
- **Fix:** the lead rules on PD 7. The builder's option is to treat an authored recipe start at tick 0
  as rebuildable exactly: same recipe revision and seed, no overrides, the fresh-realization hash, an
  empty command log and journal. That option changes one existing What if? assertion.

### MAJOR 2 — The experiment card still promises the superseded D-0027 behaviour

- **Where:** `src/ui/views/ExperimentCard.tsx:125`: "Starts a new paused dish from this recipe and
  seed. Your current dish is kept in Continue first."
- **Repro (all three projects):**
  1. Start the Garden and run it 1 s.
  2. Home → Notebook → Food trail. The card reads "… Your current dish is kept in Continue first."
  3. Start this experiment. The toast says "Saved “Little Living Garden” to Slot 1 first."
  4. Saved dishes now lists Slot 1 as well as the autosave (`obs/*-C.json`).

  The paired card (Light and life, `obs/*-L.json`) shows the same sentence and the same result.
  With ten slots used, the same Start opens "Keep your dish first … before the experiment starts"
  (`obs/*-I.json`). The card never mentions a save slot or that choice.
- **Why it matters:**
  - The assignment explicitly supersedes D-0027's "autosave to Continue without writing a named
    slot". This sentence is the only thing the player reads before this action, and it still
    describes D-0027.
  - After a relaunch (MAJOR 3) it is wrong in the other direction: nothing is kept, and Continue is
    overwritten by the experiment.
  - The file is outside the builder's list. The builder flagged it honestly (lead action item 2), but
    the product as delivered tells the player something untrue.
- **Fix:** replace the sentence. Better, state the plan as New Dish does (`keepPlanNow` and
  `keepPlanText(plan, 'experiment')`).

### MAJOR 3 — After a relaunch, starting anything silently replaces the dish on Home's Continue card

This is not in the ruling's literal wording ("the open dish") and is not a regression. It needs a lead
ruling.

- **Where:** after a reload or app relaunch, `dishInfo` is null.
  - `replaceOpenDish` (`src/ui/state.ts:603`, `:612`) therefore sends no `keepFrom`, and nothing is
    kept.
  - Home still presents the autosave as the player's dish: "Continue — Little Living Garden — 3 s
    simulated. Opens paused." (`src/ui/views/Home.tsx:38-53`).
  - The builder's PROPOSED DECISION 6 covers Home → Continue only.
- **Repro (phone-portrait, `obs/phone-portrait-N.json`):**
  1. Start the Garden, run it to 0:03, and wait 32 s on the dish screen. The 30 s autosave writes
     Continue. Saved dishes lists only the autosave, at 3 s.
  2. Reload. Home shows the Continue card for that dish.
  3. Play → Start. There is no toast: nothing was kept.
  4. Run the new Garden 1 s and wait 32 s. Saved dishes now lists only the autosave, at 1 s.

  The 3 s dish that Home offered to continue is gone. The player was told nothing, before or after.
  New Dish → Create, an experiment Start, Saved dishes → Open and Import take the same path. For
  New Dish, no plan line is shown at all, because `openDish` is null.
- **Why it matters:** on Android the OS routinely kills a backgrounded app, so this is the normal way
  a session starts. The promise "keep the open dish first" then does not hold for the dish the player
  thinks of as theirs.
- **Fix (the lead's call):** when no dish is open, keep the autosave's dish first by the same rules.
  - Nothing is written when a named slot already holds it exactly (same checksum), or when it is an
    untouched recipe start.
  - Otherwise, at minimum, say before the action that Continue will then follow the new dish.

### MINOR 4 — The new "what happened" line is 14 px on the dish screen

- **Where:** `src/ui/styles.css:480-489` sets `.toast { font-size: var(--fs-small) }` (0.875rem).
  - The toast is rendered by `DishScreen.tsx:248` and `ExperimentRun.tsx:167`.
  - The lines are raised at `state.ts:388`, `:392`, `:419`, `:532`, `:1380` and `:1387`.
- **Measured (100 % text, all three projects):**
  - 14 px for "Saved “…” to Slot N first." after Play Start, New Dish Create, Open, Import and a card
    Start.
  - 14 px for "Nothing was changed." after a Cancel over the dish screen (More → Import).
  - Page toasts are 16 px (D-0030). UX §4.1 requires body text ≥ 16 px.
- **Note:** `styles.css` is not in the builder's list.

### MINOR 5 — The kept line covers the start prompt for its 5 s

None of these starts showed a toast before D-0033.

- **Where:**
  - `state.ts:529-532`: `enterDish(…, prompt)`, then `showToast(line, 5000)`.
  - `state.ts:1385-1387`: the card prompt, then the line.
  - `.toast` (`top: 0.75rem`, z 8) sits over `.prompt` (`top: 0.75rem`, z 4)
    (`styles.css:480-507`).
- **Repro:**
  - With default settings (prompts on), run the Garden 1 s, then Home → Play → Start.
    - The toast box overlaps "Press play and look closely." on all three projects (`obs/*-F.json`,
      `overlap: true`).
    - On phones the prompt is fully hidden (`obs/phone-portrait-F-play-start.png`).
  - Food trail Start hides the first lines of "Food trail: press play and watch. Your Journal gets a
    stamp…" (`obs/phone-portrait-C-after-start.png`).
  - On the paired run, the toast covers the A/B switch (`obs/phone-portrait-L-paired.png`).

### MINOR 6 — "Slot N" cannot be found on Saved dishes

- **Where:**
  - `src/ui/views/Saves.tsx:66-90`: rows show the name, the modes and "N s simulated · date", but no
    slot number.
  - `src/persistence/store.ts:108-110` sorts slot ids as strings, giving the order autosave, slot1,
    slot10, slot2, …
- **Repro:**
  - After probe A, the toast said "Slot 3". Saved dishes shows three rows named "Little Living
    Garden" plus "My dish" and the autosave, none numbered.
  - With ten slots used, the second row is Slot 10 (`obs/*-G.json`, `rows`).
  - Only the Save sheet and the Keep sheet number the slots.
  - The two screens also use different time formats: the Keep sheet says "Slot 3: Little Living
    Garden · 0:02", Saved dishes says "2 s simulated".
- **Note:** `Saves.tsx` is in the builder's list.

### MINOR 7 — What a screen reader hears in the Keep sheet

- **Where:**
  - `src/ui/panels/KeepSheet.tsx:119-124`: the dialog is labelled "Keep your dish first", with no
    `aria-describedby`.
  - `src/ui/panels/KeepChoice.tsx:136-150`: the consequence line is neither live nor referenced by the
    Replace button.
- **Observed:**
  - On open, focus goes to the h3 "All ten save slots are used". The sentence that explains the
    choice ("… export it as a file, or choose a saved dish to replace. Cancel changes nothing.") is
    not announced.
  - In the replace step, choosing a slot with the arrow keys shows "“Little Living Garden” in Slot 3
    will be replaced by “Little Living Garden”." silently.
  - "Replace and start" / "Replace and open" have no description (`replaceStartDescribedBy: null` in
    `obs/*-B*.json`).
  - This is inherited from What if?'s panel (same code). Everything else about the sheet's semantics
    holds; see VERIFIED OK.

### MINOR 8 — Wording nits in the combined lines

- **Mixed quote styles in one toast:** "Saved “Little Living Garden” to Slot 4 first, in place of
  “Little Living Garden”. Imported "Little Living Garden" — paused." (`state.ts:419`; `:392` has the
  same pattern for "Opened "…""). `tests/worker/keep-strings.test.ts` pins it.
- **Two wordings for one event:** What if? says "“X” was saved to Slot 2." (`startedText`). Every
  other action says "Saved “X” to Slot 2 first."
- **Replacing a save with the same name:** the line reads "… to Slot 4 first, in place of “Little
  Living Garden”." It is true, but gives the player nothing to tell the two apart (the moment would).

### MINOR 9 — Duplicate says "the original is unchanged", then the original is silently lost

Duplicate is not on the ruling's list. This is the builder's PROPOSED DECISION 10 and needs a ruling.

- **Where:** `src/ui/state.ts:468-476`.
- **Repro (all three projects, `obs/*-M.json`):**
  1. Run the Garden to 0:03.
  2. More → Duplicate dish. The toast says "Duplicated. You are now in the copy; the original is
     unchanged."
  3. Run the copy to 0:06.
  4. Home → Play → Start. The toast says "Saved “Little Living Garden (copy)” to Slot 1 first."
  5. Saved dishes lists only the copy (slot 1 and the autosave). The original "Little Living Garden"
     was never kept and cannot be reached again.
- Nothing told the player it would be dropped.

## VERIFIED OK

- **VERIFIED OK — keep-dish and What if? e2e on all three projects.**
  - Command: `E2E_PORT=4211 E2E_OUTDIR=tmp/dist-keep-dish-20 npx playwright test tests/e2e/keep-dish.spec.ts tests/e2e/whatif.spec.ts --project=phone-portrait --project=phone-landscape --project=desktop`
  - Result: `30 passed (32.2m)`, exit 0 (`tmp/verify-keep-dish-player/e2e-rerun.log`).
  - `tests/e2e/whatif.spec.ts` is unmodified (`git status` clean for it).
- **VERIFIED OK — the two existing specs the builder edited still pass** (one changed assertion each).
  - Command: `E2E_PORT=4211 E2E_OUTDIR=tmp/dist-keep-dish-20 npx playwright test tests/e2e/new-dish.spec.ts tests/e2e/observe.spec.ts --project=phone-portrait`
  - Result: `6 passed (2.4m)`, exit 0 (`tmp/verify-keep-dish-player/e2e-edited.log`).
  - All three projects are covered by the builder's full run.
- **VERIFIED OK — the builder's whole-suite claim ("135 passed (1.6h)", port 4191) is real.**
  - `test-results/4191/.last-run.json` is `{"status":"passed","failedTests":[]}`, written 06:20 UTC.
  - `playwright test --list` gives "Total: 135 tests in 12 files".
  - `tmp/dist-keep` was built at 04:45:55, after the last source change (`src/worker/host.ts`
    04:45:27; every other touched `src/` file is earlier). The run spans 04:46–06:20 (≈ 1.6 h).
- **VERIFIED OK — the New Dish plan line is true for every kind reached, and matches what Create
  then does** (all three projects, `obs/*-A.json`, `obs/*-G.json`).

  | Plan kind | Line before Create | What happens |
  |---|---|---|
  | Empty slot | "“Little Living Garden” will first be saved to Slot 3 (empty now) and to Continue." | Toast "Saved “Little Living Garden” to Slot 3 first."; Slot 3 lists "2 s simulated" |
  | Already saved | "“My dish” is already saved in Slot 4 exactly as it is now, so nothing is saved first." | Nothing |
  | Own slot | "“My dish” will first be saved to Slot 4, where it was saved before, and to Continue." | Toast "Saved “My dish” to Slot 4 first." |
  | All ten used | "All ten save slots are used. Before the new dish opens you will choose how to keep “Little Living Garden”." | The Keep sheet |

  - The line is 16 px (32 px at 200 %) and `aria-live="polite"`.
  - The old "Creating a new dish closes …" copy is gone from `src/`.
- **VERIFIED OK — the lines after the action are true and match Saved dishes:**
  - Play Start and New Dish Create, as above.
  - Import with Replace: "Saved “Little Living Garden” to Slot 4 first, in place of “Little Living
    Garden”. Imported …"; Slot 4 then holds 2 s (`obs/*-H.json`).
  - The export path: "“Little Living Garden” is in the file you exported." No slot is written and
    Continue holds the kept dish (`obs/*-G.json`, `obs/*-I.json`).
  - A paired card: the line shows on the experiment-run screen (`obs/*-L.json`).
- **VERIFIED OK — nothing is said when nothing was written.**
  - A dish its own slot holds exactly gets no line.
  - What if? states "Your current dish “Little Living Garden” is already saved in Slot 1 exactly as it
    is now, so nothing needs saving first." (`obs/*-K.json`).
- **VERIFIED OK — the Keep sheet is keyboard-reachable, in the right order, and correctly announced**
  (all three projects, 100 % and 200 %, `obs/*-B1.json`, `obs/*-B2.json`).
  - Semantics: `role="dialog"`, `aria-modal="true"`, named "Keep your dish first". It opens by Enter
    on Start.
  - Focus on open lands on the h3 inside the dialog.
  - Tab order: Export → Replace a saved dish… → Cancel → Close → back to Export. Shift+Tab wraps the
    other way.
  - Replace step: the radio group is reached by Tab, and the arrow keys check slots. The disabled
    Replace button is skipped.
  - Escape and Close cancel. Focus returns to the control that started the action: Start, Create
    dish, or "Import a dish file…".
- **VERIFIED OK — 48 px targets, text ≥ 16 px, axe clean, no sideways scroll in the Keep sheet**
  (all three projects, 100 % and 200 %).
  - No target under 47.5 px. The slot labels are 48 px or more, and the radios sit inside them.
  - No text under 16 px.
  - axe on the sheet and on the whole page: zero violations of any impact.
  - The document never scrolls sideways.
  - At 200 % landscape the sheet (720×312) scrolls inside `.sheet-scroll`.
- **VERIFIED OK — Cancel changes nothing, including the run state.**
  - The toast "Nothing was changed." appears (a 16 px page toast, `role=status`).
  - The dish reopens with an identical time and count, paused.
  - More → Import over a running dish (`obs/*-D.json`): the dish is paused while the sheet is open (the
    clock froze at 4 s over 2.5 s). After Cancel it runs again (Pause label, the clock moves).
- **VERIFIED OK — keys never reach the dish behind the sheet** (`obs/*-J.json`).
  - Pressed with the sheet open: Space, 4, 1, → , ".", Enter and seven Tabs.
  - Focus stayed in the sheet, the dish stayed paused at the same time, and the sheet stayed open.
  - Close returned focus to "Import a dish file…".
- **VERIFIED OK — the Keep sheet's words follow the action:**

  | Action | Sheet text | Export button | Replace button |
  |---|---|---|---|
  | Start / New Dish | "… before the new dish opens …", "Waiting to start: “My dish”." | "Start the new dish" | — |
  | Experiment | "… before the experiment starts …", "Waiting to start: “Food trail”." | "Start the experiment" | — |
  | Import | "… before the file opens …", "Waiting to open: “import-h.pixelmeba”." | — | "Replace and open" |

  The confirmation wording is "“Little Living Garden” in Slot 4 will be replaced by “Little Living
  Garden”."
- **VERIFIED OK — Home → Continue never replaces an open dish.** With a dish open, Home's Continue only
  routes back to it (`src/ui/views/Home.tsx:26-37`). The autosave is loaded only when no dish is open
  (`:38-53`); see MAJOR 3 for what that leaves uncovered.
