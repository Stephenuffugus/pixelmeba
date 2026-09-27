# Opening-loop review, G1

The G1 gate asks whether a player can open the Garden, see food turn into growth and starch turn
into sugar, intervene, inspect the consequence, find an inherited difference (or its recorded
absence), save, reload and duplicate. This review drove the production build (`vite build`,
`vite preview`) in headless Chromium the way a player would, at 1440×900 and 360×800. Every step
below was performed and the values quoted are what the app showed. Screenshots are in
`docs/reports/img/g1/`; `tools/review-opening-loop.mjs` reproduces the run.

Environment: shared 2-CPU Codespace, SwiftShader software WebGL (so frame rates are not
representative; see `render-perf-g1.md`). Recipe FIRST_DISH_V1, seed 104729, Standard evolution.

| Step | Result | Evidence |
|---|---|---|
| Open the Garden | Home → Play → Start opens the dish paused: "0:00 · 56 alive". | `desktop-01-open.png`, `phone-01-open.png` |
| Food → growth | Run at 4× to about 50 s: 56 → 77 alive (desktop), 56 → 74 (phone, 44 s). History lists "12 Sunbead divisions" at 29 s and Sprinter divisions from 35 s. | `desktop-02-growth.png`, `desktop-08-history.png` |
| Starch → sugar | Zoomed on the starch patch: pale starch grains with ochre catalysis dust drawn only where stage 3 converted starch in the last tick, and a sugar haze around it. A Crumbsmith's "What does it eat?": "It can't eat starch itself, but it releases an enzyme that turns nearby starch into sugar that anyone nearby can eat. In its cell now: sugar 0.007. It took in 0.0095 carbon in the last second." | `desktop-03-starch-patch.png`, `desktop-04-inspect-eat.png`, `phone-04-inspect-eat.png` |
| Why it is not splitting | "Why did it stop?" on the same Crumbsmith: "A few things are slowing it down. There is not enough food here. Food access: 7 % of its intake budget found. Needs to grow more before splitting. Body 1.23 of 2.00 needed. Needs more energy to split. Energy 31 of 60 needed." | `desktop-05-why.png` |
| Intervene | Feed (Sugar, default dose) tapped on the old sugar patch: "Added sugar to 32 cells." | `desktop-06-feed.png` |
| Inspect the consequence | 15 s later a Sprinter there (#147, generation 1, age 3 s) was eating: "It took in 0.015 carbon in the last second", food access 8 %. | `desktop-07-consequence.png` |
| Inherited difference | History → What happened: "2 Sunbead offspring inherited different traits.", "A Sprinter offspring inherited a different trait.", and more, with divisions listed separately. | `desktop-08-history.png`, `phone-08-history.png` |
| Charts | Small multiples per species (organisms, living biomass), oxygen, nutrient, sugar, births and deaths. | `desktop-09-charts.png` |
| Save, reload | More → Save → slot 1 at "1:08 · 110 alive"; page reload; Home → Continue opened "1:08 · 110 alive", paused. | `desktop-10-reloaded.png` |
| Duplicate | More → Duplicate dish: "Little Living Garden (copy)" at the same moment. | `desktop-11-duplicate.png` |

## Problems found by this review, and what was done

- **Continue could open an older moment than the manual save** (phone run: saved at 1:01,
  Continue opened the 0:44 autosave). A manual save is an autosave event (SPEC §14.2), so it now
  refreshes the autosave too, and leaving the page (`pagehide`) triggers one. A journey now checks
  that Continue after a manual save opens the same moment; the phone rerun then saved at
  "1:01 · 90 alive" and Continue reopened "1:01 · 90 alive" (`phone-10-reloaded.png`).
- **Starch → sugar had no visible activity.** Nothing drew the catalysis dust that P1.4 and UX §7
  require ("activity particles only during conversion"). Stage 3 now records, per cell, the carbon
  it converted in the last tick (observation only: never read by the simulation, not hashed, not
  saved), the snapshot carries it as a sixth deposit band, and the deposit layer draws ochre specks
  there.
- **Deposit texture noise was biased.** The renderer's cosmetic hash returned negative numbers half
  the time, so starch grains were drawn about twice as densely as designed and debris flecks
  under-drawn. Fixed (unsigned), with a range test.
- **Trace amounts read as "0.0000"** in the cell inspector. Values below 0.00005 now read
  "trace (< 0.0001)".
- **The inspector covered the selected organism on phones** (UX §4.1). The view now pans so the
  organism sits above the sheet, and the sheet can collapse (D-0017).

## What a player does not see yet (by design, later phases)

- Overlays are chosen from the Lab view's Observe tray (P2.7); in Explore, sugar is shown as a haze.
- Crumbsmiths stall after about a minute and Recyclers often run out of food by 10 minutes
  (`tune-g1.md`); the guide text says "None of this is guaranteed", and the recipe is unchanged
  (D-0015).
