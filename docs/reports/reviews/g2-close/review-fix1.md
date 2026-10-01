# G2 comprehension review: fix round 1

Fixes for `docs/reports/comprehension-g2.md` (D06 §18: "revise labels, hierarchy or event evidence
before adding another system"). Only labels, layout, hierarchy and event evidence changed. No
mechanics, numbers or content values changed, and no content file was edited. Every new sentence
states a measured value, a recorded birth-record value or a stated game rule.

Nothing is committed. Scratch output is in `tmp/fix1-comp/` (git-ignored). Port 4197 is stopped.

## Per finding

### B1 · A tap outside the dish broke the inspector — FIXED

**Cause.** `r.pick` computed `floor(wy) * 128 + floor(wx)`. So:
- a point left of the grid wrapped to the far side of the row above ("Cell 113, 58" for a tap left of the dish);
- a point beyond the grid gave an index with no cell, and `p.cell.ph.toFixed` threw.

**How it is fixed.**
- **Tap mapping.** New `src/ui/dishPoint.ts`, `dishCellAt(wx, wy)`, returns the dish cell only when the point is inside the grid and inside the circular mask (`inBounds` + `inMask`). Otherwise it returns null.
- **Tap handling.** `DishScreen` `onTap` uses this mapping when no organism is under the finger. A point outside the dish closes any panel and shows a short toast, "Outside the dish.". No cell is described.
- **Cell panel cannot throw.** Every number goes through `cellNumber()`, which reads "not measured" for a missing value instead of calling `.toFixed` on undefined. Fields and residents are null-guarded.

**Tests.**
- `tests/ui/dish-point.test.ts` (8 tests):
  - Points beyond the grid are rejected, including the old wrap case `(-0.5, 58.5)`, NaN and Infinity.
  - The dark corners inside the grid are rejected.
  - Every mask cell, rim included, maps to itself and nothing else maps.
  - Rim edges are exact (cell-boundary ±0.01).
  - Screen to cell through the real `Camera`: the phone band below the dish, after Zoom out, and the dish centre.
  - The worker's cell payload is finite for rim and centre cells.
- e2e `inspector.spec.ts` "taps around the dish edge…", run in all 3 projects. It taps every bare-canvas point outside the drawn dish:
  - the four corners;
  - the band below the dish (portrait) or beside it (wide screens);
  - just beyond the rim on the diagonals.
  
  For each tap it asserts the toast and that no inspector opens. It repeats this after three Zoom outs. A tap just inside the rim must show "Cell x, y" with pH and no "not measured". Then the dish is run, an organism is inspected, and History is opened. The test asserts zero page errors and zero console errors.

### M1 · A kept comparison result could not be found — FIXED (listed now)

- **Journal list.** Notebook → Journal has a new section, **Saved comparison results**, newest first (`SavedResults` in `src/ui/views/Notebook.tsx`).
  - Each card is one line built only from what the card recorded (`src/ui/strings/compareCards.ts`), for example: "“Little Living Garden” at 0:54 · B: Sugar, 0.1 per cell on 24 cells · both ran 1:00 · Organisms alive: A 168, B 173 (+5) · Your conclusion: Supports my prediction".
  - Opening a card shows "Measured at the end of that paired run" with the saved table and the M4 sentence. The prediction and note are shown when present.
  - A damaged stored card is not listed. An empty section explains how a card gets there.
- **Toast.** It now reads "Result card saved on this device. Notebook → Journal lists it."
- **Under Done.** The results screen adds: "A saved result card is listed in Notebook → Journal. To keep a changed version as its own dish, use More → Duplicate dish and change the copy."
- **Tests:**
  - `tests/ui/comprehension-labels.test.ts`: the line text, the zero and negative headline, and the damaged-card filter.
  - e2e `compare.spec.ts` journey 1, in 3 projects: the toast; the Done note; then Done → Home → Notebook → Journal, where exactly one card is listed, its line matches the expected pattern, the prediction is shown and the table opens. The test checks axe and that nothing overflows sideways.

### M2 · An inherited difference was found by chance and easy to read past — FIXED (a) and (b)

Both parts read recorded birth records only, through a small read-only addition to the worker payload. It is not hashed and changes no simulation state:
- `EntityInspect.genome.parentLoci` and `founderLoci`: the recorded genomes of the parent and of the founder at the root of the recorded ancestry.
- `VisualEvent.mutation.locus`, `from` and `to`: the locus and its value in the parent's and the offspring's recorded genomes. These are sent only when `to − from` equals the recorded delta.

**(a) Inspector lead.** `src/ui/strings/inherited.ts` `inheritedLead()` now states both comparisons, for example:
- "Inherited from its parent unchanged. Differs from the founder of its line: Division 45 (founder 50)."
- "Inherited a change from its parent: pH preference 48 (parent 50). …"
- "… Same trait values as the founder of its line."
- If the parent's record was summarized, it says so instead of comparing.

Each trait row's note now reads "(parent 50 · founder 50)", and only for the genomes it differs from. It falls back to the old "(±n from the ancestor)" only when neither record is available. History's "What changed?" line uses the same lead.

**(b) Event lines** (`src/ui/feed.ts`, building on fix round 3's module lines):
- One birth: "A Sprinter offspring inherited a lower Division value (parent 50 → 48)."
- A shifted preference or a policy change gets its own wording.
- A burst still coalesces into one line, for example "2 Sunbead offspring inherited different traits: Division 50 → 45; pH preference 50 → 55." It shows at most four values, then "; N other changes".
- Without values (an older payload), the line keeps the old wording.
- Module gains and losses keep fix round 3's lines.

The inspector's names for traits ("Division", "pH preference") are reused so a player can match an event line to a row in the inspector.

**Tests.** `tests/ui/inherited-differences.test.ts` (9 tests):
- the lead in every case, including the review's exact case (unchanged from the parent, different from the founder);
- the notes;
- one event line, a coalesced burst, unknown values, and module lines unchanged;
- through the simulation (Garden, seed 104729, 700 ticks): every quantitative event's `locus`, `from` and `to` equal the lineage records, and each living offspring's `parentLoci` and `founderLoci` equal its recorded parent and founder genomes.

**Deferred:** part (3) of the review's proposal, **Show it** / **Show one** links on event lines and on the trait-overlay bands. That is m21/m16 territory and a new navigation feature.

### M3 · At 200 % text on a phone the inspector's tab names were clipped — FIXED

- **Tabs** (`src/ui/styles.css`): each tab is now `flex: 1 1 auto`. It is never narrower than its longest word, wraps only between words, and moves to the next line when it does not fit. Tabs are now 48 px tall instead of 40.
- **Space for the answer:** a single labelled `tabpanel` (`aria-labelledby` the open tab). When less than 40 % of the sheet would show the answer (large text, short sheet), opening a tab scrolls the sheet so the answer starts at its top. At 150 % and 200 % text the answer then begins with the open tab's name (`.tab-context`, `aria-hidden` because the tab already labels the panel). The tab names stay one scroll up and are never clipped.
- **Measured** (360×800 at 200 %): the sheet's scroll area is 317 px and the three tabs take 261 px. That is why the answer is scrolled to the top instead of the tabs being shrunk.
- **Test:** e2e `inspector.spec.ts` "at 200 % text the inspector tabs are read whole…", in all 3 projects. For each of the three tabs it checks:
  - no clipped text (a new `clippedButtons` helper compares each button's text rectangles with the button's own box);
  - the tab is at least 48 px;
  - the open answer shows at least 40 % of the sheet, or all of itself;
  - nothing overflows sideways, and axe is clean.

### M4 · The paired results invited reading every row as a direct effect — FIXED

- **Sentence.** Results now add, after the existing summary: "Every difference below traces back to your change, directly or through knock-on effects; this table does not show which." The saved card's table repeats it.
- **Not added:** the review's optional row group "Food eaten during the run, by kind" and "Mean carbon dioxide". That would need new comparison measures, so it is a new system and out of scope here.
- **Test:** e2e `compare.spec.ts` asserts the exact sentence in 3 projects.

### M5 · The Garden's main food link was never stated — FIXED

**Sunbead's "What does it eat?"** (pure photosynthesis):
- "As it does, it releases half of the carbon it takes in into the water as sugar that others nearby can eat."
- Its last line adds the measured amount: "It took in 0.098 carbon in the last second, and released 0.049 of it as sugar."
- The rule share comes from `PHOTO_SUGAR_FRACTION`, the constant the simulation uses at `intake.ts:300`. The amount is that share of the same measured intake; per tick it is exactly what the rule adds to the cell.

**Sprinter's answer (anyone that eats sugar):** "Sugar here can come from sugar placed in the dish, Sunbeads (they release sugar as they make food) and Crumbsmiths’ enzyme (it turns starch into sugar)."
- The kinds come from a new payload field, `diet.sugarSources`. It is read from this world's recorded species: photosynthesis-only kinds, and kinds with `E_STARCH_SECRETION`.
- A Crumbsmith's own answer does not list itself as a source, because its own enzyme line already says it.

**Tests:** `comprehension-labels.test.ts` (exact Sunbead lines and the measured amount; the exact Sprinter line; the Crumbsmith variant; no sugar line for a Recycler). The existing e2e inspector journey still passes.

### Minor findings fixed

**m4 · Compare setup: a refused placement**
- The refusal now says why: "That can't go there: food can't go onto stone, a wall or beyond the rim. Tap open water." This follows `transportOpen`: a deposit goes only into cells with no structure or a porous bead.
- The chosen food (or organism) stays selected for the next tap. `queueOnB` now returns how much B accepted. `CompareViewport` restores the tool when the answer is 0 and nothing is queued yet.
- Test: e2e `compare.spec.ts` journey 2 taps the corner of B, then asserts the message, "Now tap dish B to place it." and that nothing was queued. The next tap queues.

**m5 · Out of energy**
- `leadConstraint()` puts ENERGY_ZERO first whenever `E <= 0`: the summary reads "Out of energy — losing health." with the detail "Energy 0: losing 4 health per second." `stopAnswer()` also lists it first.
- The reason is never raised by the simulation; the UI shows it from the measured energy and the rule at `maintenance.ts:70`.
- An energy of 0.2, which the meter shows as "0", is not starvation, and the summary does not say so.
- Test: `comprehension-labels.test.ts`.

**m6 · Sunbeads described as eating**
- An organism that makes its food from light gets the chip "Making food" ("Making only a little food" below the usable share).
- Its food-access limit reads "It is making less food than it could here." with "Food made: 53 % of its budget.".
- Passed to offspring shows its feeding policy as "makes its own food".
- Test: `comprehension-labels.test.ts`; the existing action-label tests are unchanged and pass.

**m7 · Split requirements**
- When every item is a split requirement (DIV_*), the list is titled "Not ready to split yet." and headed "Before it can split:".
- With nothing limiting it, the summary reads "Doing fine right now. Not ready to split yet."
- Test: `comprehension-labels.test.ts`.

**m11 · Death line grammar**
- "A Recycler died — it ran out of energy." / "2 Sprinters died — they ran out of energy." Every death cause has a plural form.
- Test: `inherited-differences.test.ts`.

**m12 · Kinds never in the dish**
- A kind with no organism and no biomass in any sample is shown as "Amoeba — none added yet" instead of two flat charts. This applies only when the samples reach back to the dish's first second and none was summarized.
- Older or longer histories keep the charts, because "never added" could not be shown from their samples.
- Test: e2e B1 journey, in 3 projects.

**m14 · Body meter**
- The meter reads "Body 99 %" (with `aria-valuetext`).

**m15 · Cell panel labels**
- pH and Light are separate rows. Fields have plain names ("Mineral nutrient", "Oxygen", "Carbon dioxide", "Nutrient in sugar", …).
- Residents are shown by kind name instead of the species id ("B01").

**m24 · Duplicate import control**
- The raw file input is `aria-hidden` with `tabIndex=-1` in More and Saved dishes. Its `aria-label` attribute stays, so existing specs can still locate it.
- Test: e2e `garden.spec.ts` "More and Saved dishes each offer one import control…", in 3 projects.

**m25 · About names no version**
- About lists the app version, content hash, content version, simulation rules, evolution rules, ability registry, trait mapping and build phase (`src/ui/strings/about.ts`).
- The values come from `content/manifest.json` and `APP_VERSION`, which moved to `src/persistence/appVersion.ts` and is re-exported by `saveFile.ts`, so it stays one constant. This keeps the save and import code out of the main bundle.
- Tests: `comprehension-labels.test.ts` (each value equals the manifest's) and e2e `garden.spec.ts` "About shows…", in 3 projects, with axe and the no-sideways-overflow check.

### DEFERRED (to P3.11 / P4 polish, as assigned)

- **m1** your change in the record
- **m2** placed sugar outline
- **m3** Explore Feed next step
- **m8** an inherited value's game-rule effect
- **m9** "Why did it stop?" name (owner's call)
- **m10** time formats in History
- **m13** arrival line over Whole dish
- **m16** selection ring shape
- **m17** branch card coordinates and founder wording
- **m18** Family tree in More
- **m19** top strip dish name
- **m20** Observe tray on phones
- **m21** show one of a kind
- **m22** population in save rows
- **m23** Back from Saved dishes

Also deferred: M2's **Show it** links and M4's optional measure rows (see above).

## Files changed

**UI (owned):**
- Changed: `src/ui/feed.ts`, `src/ui/panels/Inspector.tsx`, `src/ui/panels/HistorySheet.tsx`, `src/ui/panels/CompareResults.tsx`, `src/ui/panels/CompareText.tsx` (`measureLabel`), `src/ui/panels/MoreSheet.tsx`, `src/ui/views/DishScreen.tsx`, `src/ui/views/CompareViewport.tsx`, `src/ui/views/Notebook.tsx`, `src/ui/views/Saves.tsx`, `src/ui/views/SimplePage.tsx`, `src/ui/app/App.tsx`.
- `src/ui/state.ts`: `queueOnB` returns the accepted count; the deposit refusal text; the result-card toast.
- `src/ui/strings/shortcuts.ts`, `src/ui/strings/modules.ts`, `src/ui/styles.css`.
- New: `src/ui/dishPoint.ts`, `src/ui/strings/inherited.ts`, `src/ui/strings/compareCards.ts`, `src/ui/strings/about.ts`.

**Outside `src/ui`** (minimal, read-only payload additions that M2 and M5 need, plus one version constant; flagged for the lead):
- `src/worker/protocol.ts`: optional fields `VisualEvent.mutation.locus/from/to`, `EntityInspect.genome.parentLoci/founderLoci`, `EntityInspect.diet.sugarSources`.
- `src/worker/snapshot.ts`: `visualEvents(…, lociOf)`, `lociOfBirth()`, `founderLociOf()`, `sugarSourcesOf()`. These are pure reads of lineage, genomes and species.
- `src/worker/host.ts`: one line, passing `lociOfBirth(w)` to `visualEvents`.
- `src/persistence/appVersion.ts` (new) and `src/persistence/saveFile.ts`: `APP_VERSION` moved and re-exported, with the same value `0.1.0`.

**Tests:**
- New: `tests/ui/dish-point.test.ts`, `tests/ui/inherited-differences.test.ts`, `tests/ui/comprehension-labels.test.ts`.
- New and extended e2e journeys: `tests/e2e/inspector.spec.ts` (B1 edge taps, M3 at 200 %), `tests/e2e/compare.spec.ts` (M1, M4, m4), `tests/e2e/garden.spec.ts` (m25 About, m24 import control).

**Not changed:** `content/**`. The Sunbead's guide already says "Turns carbon dioxide into half body and half sugar". Changing any text would change the content hash that g2 saves and fixtures pin.

## Commands and results (this session)

- `npx tsc -p tsconfig.json --noEmit` → clean.
- `npx eslint` on every changed or new `.ts`/`.tsx` file → clean. The only output is "File ignored" for `styles.css`.
- Unit tests:
  - `npx vitest run tests/ui/dish-point.test.ts` → 8/8.
  - `tests/ui/inherited-differences.test.ts` → 9/9.
  - `tests/ui/comprehension-labels.test.ts` → 8/8.
- `npx vitest run tests/ui tests/sim/module-visuals.test.ts tests/sim/founders.test.ts tests/sim/founders-words.test.ts tests/experiments/app-flow.test.ts tests/experiments/journal-and-words.test.ts tests/worker/keep-continue-ui.test.ts tests/worker/keep-autosave.test.ts tests/persistence/persistence.test.ts tests/persistence/strip-names.test.ts tests/fixtures/registry-imports.test.ts` → **21 files, 174/174 passed** (268 s).
- `E2E_PORT=4197 E2E_OUTDIR=tmp/dist-review-fix npx playwright test tests/e2e/inspector.spec.ts tests/e2e/garden.spec.ts tests/e2e/compare.spec.ts tests/e2e/experiments.spec.ts tests/e2e/save-reload.spec.ts` (phone-portrait, phone-landscape, desktop) → **69/69 passed** (35.3 min; log `tmp/fix1-comp/e2e-full.log`).
  - This covers every screen touched: the dish and inspector, History, Compare, the Notebook (Journal and Experiments), Saved dishes and More, About and Settings.
  - Axe found no serious or critical issues on the dish and inspector (100 % and 200 %), History, Compare setup and results, the Notebook Journal with a saved card, About, and the experiment screens.
  - 48 px targets: the inspector tabs, plus the existing reachability checks.
  - 200 % text was checked in phone portrait and landscape: inspector tabs, Garden, experiments.
- An earlier run of the two new inspector journeys failed on purpose-written layout checks; this shaped the M3 design:
  - landscape at 200 %: the answer was 61 px below the sheet when only the tabs were scrolled to the top;
  - on desktop a corner tap landed on the zoom buttons.
  
  After the fix: 6/6 (`tmp/fix1-comp/e2e-insp2.log`).
- **Not run:** `npm run check` in full and the whole e2e suite (about 159 journeys). These are left to the lead's integration run.
  - `keep-dish`, `observe`, `lineage`, `whatif` and `new-dish` locate the file input by `input[aria-label="Import a dish file"]` or `input[type="file"]`. Both still match: only `aria-hidden` was added, and `setInputFiles` ignores it.

## Proposed decisions

- **PROPOSED DECISION:** D-0020 deferred listing result cards to Phase 4. Saved comparison result cards are now listed in Notebook → Journal, in a section of their own. They are read-only and opening one shows its table. The reason is M1: half of the D06 §18 session task ("keep a second version so the two can be compared") depends on finding them again. Linking cards from notes already existed.
- **PROPOSED DECISION:** the inspector payload carries the recorded parent and founder loci, and quantitative mutation events carry `locus`, `from` and `to` from the lineage genomes. These are display-only fields: not hashed, not saved, and omitted when either record was summarized. Event lines name the trait with the inspector's short names ("Division", "pH preference") rather than the content locus names ("Division investment"), so a line matches a row in the inspector. UX §5.2's "Inherited {locus} {±Δ} ({ancestor} {a} → {b})" is followed with the parent as the reference.
- **PROPOSED DECISION:** ENERGY_ZERO is shown by the UI from measured `E <= 0`, using the starvation rule at `maintenance.ts:70`, and not raised as a simulation limit code. Raising it in the simulation would change recorded state and hashes.
- **PROPOSED DECISION:** a tap outside the dish shows the short toast "Outside the dish." and closes any open panel. It does not silently do nothing, so a player learns why nothing opened.
- **PROPOSED DECISION:** `APP_VERSION` lives in `src/persistence/appVersion.ts`, so About can show it without pulling the save and import code into the main bundle.
- **For the owner (optional follow-up):** the inspector's key/value rows and question buttons use `--fs-small` (14 px). These predate this round and are outside the listed findings. UX §4.1 asks for body text of at least 16 px, so they could be raised in P4 polish.
