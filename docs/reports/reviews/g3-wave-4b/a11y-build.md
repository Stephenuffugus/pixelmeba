# P3.11 Accessibility pass 1: build report (wave 4, stage 2, a11y)

Nothing was committed (the lead commits). No edits to content/, art/src, src/sim or src/worker. No world schema, protocol, version or manifest change. Fence values are unchanged.

## Checklist

### Build

- **DONE: visible focus everywhere (W6-04).** The global ring keeps the 3 px `--focus` #F2B84B outline with a 2 px offset. It now also draws a dark ink ring underneath and around it: `box-shadow: 0 0 0 7px var(--focus-ink)` (#172C35). Code: src/ui/styles.css:13 (token) and :70-74 (rule). On light surfaces the amber alone measures 1.3-1.6:1. With the ink ring, the indicator is ≥ 3:1 on all 15 surfaces audited (docs/reports/contrast.md, "Focus ring"). Proved by tests/e2e/keyboard.spec.ts: `expectFocusVisible` checks every stop on the journey (a real element, `:focus-visible`, outline ≥ 2 px). Also by tests/ui/a11y-contrast.test.ts, "the amber focus ring alone fails…".
- **DONE: the keyboard map is verified (W6-05).** I kept the existing handlers: the window keydown in DishScreen and `handleViewKey` in LabView. I added no second listener. The one missing key was Enter at the reticle, now inside the same handler (DishScreen.tsx:167-180). The journey exercises Space (run/pause), L, I, Esc, U, Tab and Shift+Tab, Enter on controls, arrows and '/' in the Field Guide. It also checks that '/' focuses the guide search. A second test checks that l/f/u/4/. do nothing while What if? is open (D-0026).
- **DONE: keyboard placement and selection (W6-06).** See the proposed decision below.
  - A `.dish-focus` element (`role="application"`, tabbable) sits over the canvas and under every panel. It has `pointer-events: none`, so taps still reach the canvas. Code: DishScreen.tsx:253-269, styles.css:2927+.
  - When it is focused (`:focus-visible`), it shows a centre reticle (`data-testid="reticle"`).
  - Enter calls the same handler object that DishScreen passes to `attachGestures` (`gestures.current = labGestures({...})`, DishScreen.tsx:109). It taps at the viewport centre. A placement tool commits one gesture; Look or Lab Inspect selects.
  - When a keyboard tap opens the candidate list, focus moves to its first option (DishScreen.tsx:385-393).
  - Arrows pan as before.
  - If a key or a choice closes the panel that held focus (sheet, candidate list, Lab tray, tool change), focus goes back to the dish instead of the page body (DishScreen.tsx:136-144; src/ui/a11y/focus.ts `restoreFocus`).
  - Proved by keyboard.spec, both tests.
- **DONE: ARIA labels for panels, inspector values and charts; chart tables verified (D-0014).**
  - I audited the existing labels. Every sheet is a `section` named through aria-labelledby or aria-label. The inspector meters are `role="meter"` with aria-label and valuetext. History and trait charts are `role="img"` with a text label. History has a Table tab, Regions has a table view, and the compare and experiment results are tables.
  - axe found one real defect: the candidate `listbox` contained a non-option Cancel button (aria-required-children, serious). It showed up in the first keyboard.spec run. Fix: the listbox holds only the options, and Cancel sits beside it (DishScreen.tsx:396-407, styles.css:603).
  - a11y-screens.spec checks that History's table alternative has column headers.
- **DONE: the canvas is summarized (W6-03), with a deviation.**
  - `DishSummary` (src/ui/a11y/DishSummary.tsx) is a visually hidden "Dish summary" region. It gives each species' name and its count from `SnapMeta.speciesCounts`. It says extinct when the count is 0 after members were seen on this timeline. It says "None in the dish now: …" for species never seen.
  - `CellDescription` (src/ui/a11y/CellDescription.tsx) builds one line from the inspector's cell payload. It is the dish element's `aria-describedby`.
  - Text builders: src/ui/a11y/describe.ts.
  - **Deviation:** the trend is the living **count** over the last 30 s of dish time, as received by this screen. It is not History biomass, because `client.history` is not side-effect free. DishHost's 'history' case calls `experimentHistoryOpened`, which records the player step `openResourceHistory` (EXP_103) or `viewPreyHistory` (EXP_106). A summary that polled it would complete card steps the player never took. The builder already supports `measure: 'biomass'`. See the proposed decision.
- **DONE: one always-mounted polite live region (W6-07).**
  - src/ui/a11y/LiveRegion.tsx is mounted once in App.tsx:40. It reads out `toast.value`, which covers placement accepted with its count, saved, undone and refusals.
  - I removed role and aria-live from the visible toasts: DishScreen.tsx:307, CompareScreen.tsx (toast), ExperimentRun.tsx (toast) and App.tsx PageToast.
  - The sr-only statuses in LabView and DiscoveryCard are unchanged.
  - Proved by keyboard.spec: the live region reads "Added N Sprinter…", "Undone — time rewound to before that change." and "Saved “Little Living Garden”…".
  - **Three other specs need a one-line change; see FENCE / bugs.**
- **DONE: reduced motion is honored everywhere (UX §7.4).**
  - I verified what already exists: CSS `.reduced-motion *` and the media query, no camera easing, split flash and placement ring off, static fungal pulse, no trails, pulsing marks static, death frames static.
  - Added: newborns no longer fade in when reduced motion is on (renderer.ts:907-909).
- **DONE: simplified overlay palette.**
  - New Settings option "Simplified overlay colours", stored as `simplifiedOverlayPalette` (optional, default false). Code: state.ts:86-90, 158 and 1060; SimplePage.tsx:62-77.
  - `colormapFor`, `paintOverlay` and `legendStops` take an optional `simplified` argument (layers.ts:206, 233, 253). The new `RAMPS.simple` runs #F5F4EF → #7A929E → #0A1419 (layers.ts:199-203). Its two ends are 16.9:1 apart, and still ≥ 3:1 apart at the default 45 % opacity over water.
  - The renderer repaints the shown overlay as soon as the option changes, even while the dish is paused (renderer.ts:467-487).
  - OverlayLegend follows the setting.
  - Defaults are byte-identical: tests/sim/view-switch.test.ts passes.
- **DONE: 200 % text reflow at 360×800, 800×360 and 1440×900.** Checked by a11y-screens.spec "200 % text…". On Home, Play, the dish (Explore), the Add Life sheet and every Lab category, the primary controls are reachable 48 px targets (`expectReachable`) and nothing scrolls sideways (`expectNoHorizontalOverflow`). The reticle stays in view.
- **DONE: contrast audit (W6-08).**
  - tools/contrast-audit.ts reads the sources themselves: styles.css tokens and rules, art/src/palette.ts, every organism sprite's outline and body (SPRITES palette indices 1/2, checked only on the grounds the species lives on), the layers.ts dish and deposit colours (`DISH_COLORS`, a new export) and overlay `RAMPS`, speciesColors.ts, and the TRAIT_BAND_COLORS parsed from the renderer.ts source.
  - Result: 246 pairs, 208 required, 129 pass, 79 justified, 0 unexplained.
  - Fixes in files I own:
    - `--danger` changed from #B3473F to #AD4239 (4.44 → 4.78:1 on --surface-2).
    - Energy bar changed from #D99A2B to #9A6A12 (1.76 → 3.41:1).
    - Health bar changed from #4F9A58 to #3F8146 (2.49 → 3.41:1).
    - The simplified ramp end is #0A1419.
  - Every remaining failure is justified in docs/reports/contrast.md. Real gaps, with proposals for the art/render owners: stone vs sediment 1.0:1, wall vs sediment 2.2:1, Cordweaver on sediment 1.65:1, the pale identity colours at aggregation zoom, the deposit textures, and the food ramp ends at 2.98:1.

### Done when

- **DONE: tests/ui/a11y-describe.test.ts and tests/ui/a11y-contrast.test.ts (W6-02).** Pure functions in the node environment, 15 tests. They cover the trend rule (5 % steady band), the extinct and absent wording, the rewind and other-dish reset, the cell line, the WCAG reference values, rounding down, alpha compositing, the focus-ring facts, and the simplified ramp and legend.
- **DONE: tests/e2e/a11y-screens.spec.ts (W6-09).** Zero serious or critical axe findings on 52 scanned screens and states. Each test collects its findings with the screen name and asserts the full list of visited screens, so a skipped screen fails too.
  - Pages: Home; Play; What if? from Play; Settings with sound settings; About; Saved dishes, empty; the four Field Guide tabs; Notebook Journal and Experiments; the EXP_A experiment card; New Dish basics, a curated dish (L306), Evolution with Advanced rates, and Content and summary.
  - Dish: Explore; Add Life; Feed; the candidate list (tap points are midpoints of close organism pairs, read from snapshots); the inspector's Summary, Happening now, Passed to offspring and Details tabs and "Why did it stop?"; the cell inspector with its reaction ledger; More; Save; Evolution settings (Advanced); History Charts, Regions, Table and What happened; What if? from the dish; Lab Inspect and the trays life, food, chemistry, habitat, tools and observe; Lineage; the Sample session in aim and preview; Saved dishes with a named slot and automatic checkpoints (ring on, run at 4× past 62 s).
  - Other screens: Compare setup and results; paired run setup and running; the Keep sheet (10 slots used); the discovery card (the lineage.spec fixture, built headless).
- **DONE: tests/e2e/keyboard.spec.ts.** Home → Play → Garden → run → Add Life (L, count 20, Sprinter) → place with Enter → Inspect (I) → Enter (candidate list or inspector) → Why? (shortcut-why) → Esc → Undo (U) → More → Save → More → Field Guide → '/' search → back. No mouse is used; the focus indicator is asserted at each step. The second test covers arrows, the candidate list or cell description with Esc, the species list, and What if? blocking dish keys.
- **DONE: 200 % text checks at the three sizes**, in the desktop project with `page.setViewportSize`.
- **DONE: both specs pass on desktop.** The lead runs all three projects at the gate.
- **DONE: docs/reports/contrast.md lists every pair with its ratio.** It is generated: `npx tsx tools/contrast-audit.ts --write`.

## Files

Created:
- src/ui/a11y/describe.ts
- src/ui/a11y/contrast.ts
- src/ui/a11y/DishSummary.tsx
- src/ui/a11y/CellDescription.tsx
- src/ui/a11y/LiveRegion.tsx
- src/ui/a11y/focus.ts
- tools/contrast-audit.ts
- docs/reports/contrast.md
- tests/ui/a11y-describe.test.ts
- tests/ui/a11y-contrast.test.ts
- tests/e2e/keyboard.spec.ts
- tests/e2e/a11y-screens.spec.ts
- this report

Changed, owned:
- src/ui/styles.css: focus ink ring, --danger, meter fills, `.candidate-options`, `.dish-focus` and reticle.
- src/ui/views/DishScreen.tsx

Changed, shared (additive only):
- src/ui/app/App.tsx: LiveRegion mount; PageToast loses role and aria-live.
- src/ui/views/CompareScreen.tsx, src/ui/views/ExperimentRun.tsx: the toast loses role and aria-live.
- src/ui/views/SimplePage.tsx: the toggle.
- src/ui/state.ts: the optional setting and its 2 setOptions call sites.
- src/ui/panels/OverlayLegend.tsx
- src/render/layers.ts: optional `simplified` argument, `RAMPS.simple`, exports `RAMPS` and `DISH_COLORS`.
- src/render/renderer.ts: palette option and overlay repaint; newborn fade off in reduced motion.

## What each test proves, and how I checked it fails without the mechanism

- **a11y-describe.test.ts** proves the summary never says "extinct" without members seen on this timeline, the trend reads only recorded samples, and the cell line holds measured values only. Mutation check: I made extinction `count < 0` and removed the rewind reset in recordCounts. 3 of 9 tests failed, then I restored the code.
- **a11y-contrast.test.ts** checks the math against WCAG's 21:1 and 4.54:1 (#767676) references, and confirms the amber fails alone while the amber plus ink pair passes on every surface. The simplified ramp's 45 % check fails with the first ramp end I chose, #172C35: the audit measured 2.69:1. That is why the end is #0A1419.
- **a11y-screens.spec.ts** fails if any serious or critical axe finding appears, or if a screen is skipped (`visited` is asserted). The first run of the candidate-list scan (inside keyboard.spec) failed on aria-required-children until I fixed the listbox.
- **keyboard.spec.ts:**
  - "Focus lands on the dish" after the Garden opens, and again after a species is chosen, fails without `restoreFocus`: focus would stay on the body.
  - "Added N" shows that Enter placed through the gesture handler.
  - Each `tabTo` stop needs `:focus-visible` and an outline.
  - What if? blocking is checked by the clock not moving and no sheet opening.

## Commands and results

- `npx tsc -p tsconfig.json --noEmit` → clean. One earlier run showed TS6133 in tools/render-bench.ts; that came from perf's in-flight edit, and it was clean on re-run.
- `npx eslint <all my files>` → clean.
- `npx prettier --write` on my new files only.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/ui/a11y-describe.test.ts tests/ui/a11y-contrast.test.ts tests/sim/view-switch.test.ts` → `Test Files 10 passed (10)`, `Tests 85 passed (85)` (1275 s on the loaded machine).
- `npx vitest run tests/ui/a11y-describe.test.ts tests/ui/a11y-contrast.test.ts` after the mutation was restored → `Tests 15 passed (15)`.
- `E2E_PORT=4261 E2E_OUTDIR=tmp/dist-a11y npx playwright test tests/e2e/keyboard.spec.ts tests/e2e/a11y-screens.spec.ts --project=desktop` → 6 passed, 2 failed. The "dish" test reached the Lab: Inspect is a tool with no tray, so the test was wrong. The 200 % test hit its timeout at load average about 6.9.
- The same command with `-g 'dish: Explore|200 % text'`, after fixing the test (Inspect scanned as a tool) and raising timeouts → `2 passed (12.3m)`.
- Every test passed on the current code: keyboard ×2, pages, compare/paired run, Keep sheet and discovery card in run 3; dish and 200 % in run 4. Run 4 built after every source change except a CSS revert that changes nothing in effect: `.setting-note` was already set to body size by a later rule.
- `npx tsx tools/contrast-audit.ts --write` → `246 pairs; 208 required, 129 pass, 79 justified failures, 0 unexplained`.
- Port 4261 was stopped before and after each run.

## FENCE

No fence value moves. Nothing in src/sim or src/worker changed, and stateHash is untouched. g2-replay and the four trajectory-fence files pass.

## Bugs or risks noticed elsewhere

1. **E2E locators the lead must update.** These match toast text with `page.getByText`. The text is now also in the sr-only live region, so the locator matches 2 elements (Playwright strict mode). I did not run those specs, per the stage rule. Change each to a `.toast`-scoped locator, for example `page.locator('.toast', { hasText: '…' })`:
   - tests/e2e/inspector.spec.ts:130, `page.getByText('Outside the dish.')`
   - tests/e2e/compare.spec.ts:99, 'Result card saved on this device…'
   - tests/e2e/compare.spec.ts:151, "That can't go there: …"

   Specs that use `page.locator('.toast')` or the keep-dish `.toast` recorder are unaffected.
2. **`client.history` records card player steps.** It goes through DishHost 'history' → `experimentHistoryOpened`, which notes 'openResourceHistory' or 'viewPreyHistory'. Any future UI feature that reads history for its own use would silently complete EXP_103 or EXP_106 steps.
3. **14 px text remains.** `--fs-small` (14 px) is still used for some secondary lines (for example `.sub`, shortcut answers). I did not re-audit every panel for "text ≥ 16 px". The panels other specs already check pass. The two specs here check axe, touch targets and reflow, not font sizes.
4. **New Dish page.** `new-dish-start-with-curated:…` is the only id style containing a colon. It works, but CSS selectors need escaping.

## Proposed decisions

- **PROPOSED DECISION (W6-06):** The dish has a keyboard stop: a `role="application"` element, over the canvas and under every panel, that takes no pointer input. When focused it shows an amber-and-ink centre reticle. Enter is one tap at the viewport centre through the same gesture handlers as a pointer tap: a placement tool commits one command, and Look or Lab Inspect selects (the candidate list takes focus when a keyboard tap is ambiguous). Arrows pan under the reticle. When a key or choice closes the panel that held focus, focus returns to the dish. The element's accessible description is the selected cell's one-line description, plus a key hint.
- **PROPOSED DECISION (W6-03):** The dish summary's trend is the living count over the last 30 s of dish time as received by the screen, not History biomass, because a History request is a recorded player step for cards. Owner/lead option: add a read-only flag to the 'history' request (for example `peek: true`, skipping `experimentHistoryOpened`; a worker/protocol change). The summary can then switch to `measure: 'biomass'` with no other change.
- **PROPOSED DECISION (W6-07):** One always-mounted polite live region in App announces `toast.value`. Visible toasts carry no live role, so nothing is announced twice and a toast raised during a route change is still announced. The sr-only statuses of the Lab view switch and the discovery card stay.
- **PROPOSED DECISION (contrast):**
  - `--danger` in the UI is #AD4239 (UX §6.1's #B3473F is 4.44:1 on --surface-2).
  - The inspector's energy and health bar fills are #9A6A12 and #3F8146 (≥ 3:1 on their track).
  - The focus ring is amber with an ink (#172C35) ring.
  - Art and render proposals are in contrast.md: P.muted to #4F5F67, F02 outline to outlineDark, a darker or ink-edged stone and wall on sediment, a darker bead tone, deposit edge tones, and the food ramp high end to #CC7019.
- **PROPOSED DECISION (simplified overlay palette):** Settings "Simplified overlay colours" (off by default) draws every overlay, pH included, in one light-to-dark ramp, #F5F4EF → #7A929E → #0A1419; the legend follows. The ramp's ends stay ≥ 3:1 apart even at the default 45 % opacity over water. This affects display only: it is cosmetic and never reaches the simulation.
