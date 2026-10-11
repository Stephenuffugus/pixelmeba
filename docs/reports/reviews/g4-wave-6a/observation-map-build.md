# P4.8 part a — relationship map and region probes (observation-map build report)

Wave 6 stage 1, builder "observation-map". Observation only: nothing here changes the world, sends a command or draws randomness. No sim rule, no version, schema or protocol-version change, no content change.

## Checklist

### Build
1. Relationship ledger — DONE.
   - `src/worker/relationshipMap.ts`: `SecondRecord<T>` :99 (per-second buckets, 600 s kept, `restoreTo` :133, `window`), `RelationshipLedger` :156 (`add`, `seen`, `poolRemoved`, `read` :198), `emptyMap` :255, `NET_POOLS`, `MAP_WINDOWS`.
   - Fed by `src/worker/relationships.ts` (owned): `ledger` :67, built at :73. Restored worlds drop later seconds at :87. Per-occurrence entries: catches with the event's carbon :120, bursts :128, drains :134, pool removal across stage 6 :171 (pre-totals at stage 5 in `beforeIntake`), eats seconds :178, infects :216, attaches :228, converts carbon per credited producer :262.
   - The first-seen table (P3.8) is unchanged; tests/worker/relationships.test.ts passes.
   - Undo, rollback and reload:
     - Undo or a rollback to tick T drops every second holding a tick ≥ T.
     - If T falls inside a second, the record restarts at T and the map says "Recorded since m:ss".
     - A reload starts a new watcher, so the record is empty and recording starts at the load tick.
   - Proved by tests/worker/relationship-map.test.ts.
2. Map view — DONE.
   - `src/ui/panels/RelationshipMap.tsx`: `WindowChoice` :34 (native radio fieldset, default 60), `RelationshipMapSheet` :238 (table first, then pools, the exchange line, the SVG `Picture` :119 with atlas icons and kind text on every arrow, the footnote and the empty line).
   - Copy is in `src/ui/strings/observe.ts`. Helpers are in `src/ui/observe.ts`: `mapRows` :62, `poolLines` :73, `exchangePairs` :86, `mapPicture` :115.
   - The entry is the Observe tray button `lab-relmap` (src/ui/panels/LabTray.tsx:644). The sheet id is `'relationshipMap'` (state.ts:109, DishScreen.tsx:327).
   - "resource exchange observed" appears only for two species that each have an arrow to the other. Pools and enzymes never count.
3. Region probes — DONE.
   - `src/worker/probes.ts`:
     - `probeSetProblem` :125 (at most 6, letters A–F, integers, at least one dish cell). The 7th region is refused with the exact copy.
     - `maskCellList` :140 (integer cells as centres; circle by d² ≤ r²; clipped to the dish mask) and `overlapsOf` :162.
     - `boundaryMeasurable` :185 and `ProbeSet` :217. The stage 1 / stage 2 hooks are `beforeEnvironment` :276 and `afterEnvironment` :287. Readings come from `readRegion` :315.
   - Drawing:
     - The session lives in `src/ui/panels/ProbeSession.tsx`. The tray button is `lab-regions` (LabTray.tsx:656). Rectangle and Circle are aria-pressed toggles. One drag draws one region; a tap draws nothing.
     - Lab gestures route to the session: src/ui/views/LabView.tsx:229, 380, 390, 414, 436. Escape ends the session (:511).
     - The session bar and outlines are mounted at src/ui/views/LabToolbar.tsx:75-76.
   - Panel: `src/ui/panels/ProbePanel.tsx` `ProbeSheet` :28 (sheet `'probes'`, DishScreen.tsx:328). It shows the readings, the overlap warning (:66), Delete per region, and the line "Regions are not saved with the dish.".
   - Renderer: `setProbes` / `drawProbes` (src/render/renderer.ts:1309/:1325, called each frame at :1034).
     - Each region is drawn as a light dashed stroke over the 0x172c35 companion stroke, with a 3×5 pixel letter on a dark tile.
     - Everything comes from the masks the UI passes in, never from the world. Nothing animates, so reduced motion needs no change.
   - Stage 2 audit (src/sim/transport.ts `stageEnvironment`):
     - sugar and broth: diffusion only, always measured.
     - oxygen and CO2: diffusion plus `gasExchange` with the air unless the lid is closed. They are measured only for seconds whose every tick had the lid closed.
     - starch, oil and protein: deposits, never moved. detritus: stage 2 adds to it (film decay, viral decay). All four show "not measured here".
4. Keyboard — DONE.
   - The tray buttons are ordinary buttons.
   - The window choice is native radios (arrow keys move the choice).
   - Delete is a button per region; the e2e test focuses it and presses Enter.
   - Escape ends the drawing session (e2e).
   - Drawing a region needs a drag; there is no keyboard way to draw one (see proposed decisions).

### Not built here
- **Follow family:** already done in P4.1/P2.3 (D-0073). Highlighting is capped at 200 with an aggregate marker after that:
  - src/worker/favorites.ts:35 `FAVORITE_HIGHLIGHT_MAX = 200`, applied at :453-456 and :502-504;
  - the P2.3 lineage cap at src/sim/lineage.ts:277 `LINEAGE_MEMBERS_MAX = 200` and src/render/renderer.ts:85 `LINEAGE_RINGS_MAX = 200`.
  - Nothing was built.
- **Transfer preview:** not built. There is no gate structure (enabledStructures BEAD, STONE, WALL), so there is nothing to select. There is no button and no gate code. D-0082 already defers it; see the proposed decision below.

### Done when
- **tests/worker/relationship-map.test.ts (7 tests) — DONE.**
  - catches: count = capture events, carbon = their amounts (read every tick).
  - infects / bursts: counts equal an independent infectedBy 0→non-zero scan and the lysis deaths.
  - converts: credited to B06 only, with carbon ≤ the dish's conversion. Enzyme alone gives no edge.
  - Two species (B01, B06) on one sugar pool: seconds seen equal the intake bits counted independently. The pool's removal equals the independent stage-5→6 poolTotal sum and is not split. Exactly two edges, one pool.
  - Windows 60/180/600 cut at whole seconds; 600 s retention; young-dish and "recorded since" cases.
  - Undo:
    - a whole-second restore (tick 300) gives a map identical to the one read at tick 300;
    - a part-second restore (tick 305) restarts the record (no edges, "since 0:30").
  - Never alters behaviour: a host dish run 3,000 ticks at 4× while reading the map 18 times has the same stateHash and full trajectoryDigest as plain steps, and nothing appears in the save.
- **tests/worker/probes.test.ts (8 tests) — DONE.**
  - Cell lists for rectangles (either corner order), circles (13 cells at r 2) and clipping (the whole grid as a rectangle equals maskCells).
  - Readings match direct sums.
  - Whole-dish boundary on a closed-lid dish is below 1e-9 for every measured pool. The half-dish boundary equals the independently measured stage-2 change (sugar, oxygen, CO2).
  - With the lid open, gases are "not measured" and sugar is measured.
  - Overlaps; the 6 limit; unique letters.
  - Host checks:
    - the 7th region is refused and changes nothing;
    - Undo restores the boundary reading exactly;
    - a duplicate has no regions;
    - nothing appears in the save.
  - Six probes vs none over 3,000 ticks at 4×: equal stateHash and full digest.
- **tests/ui/observe.test.ts (6 tests) — DONE.**
  - Exact copy: footnote, empty window (60/600), overlap, refusal, not-saved line, value strings.
  - No forbidden word in any string the file can produce (mutualis, helps, better, needs, depends on, superior, advanced, perfect, adapted, immune, symbio, partner). "resource exchange observed" appears in exactly one string.
  - Exchange only for mutual species arrows; rows and picture come from edges only; drag → mask; boundary wording.
- **tests/e2e/observe-tools.spec.ts — DONE (desktop and phone-portrait both pass).** The journey:
  - Garden → run to ≥ 20 s at 4× → pause → Lab → Observe → Relationship map.
  - The row `eats:B01:sugar` reads "Sprinter / eats / sugar / seen eating in N of the last 60 s", and the picture's arrow carries "eats".
  - Switching to 180 s changes the column header and the value.
  - Regions: rectangle then circle → "2 of 6 regions" → readings for A and B, the overlap text, the not-saved line. Delete B by keyboard removes the warning. Escape ends drawing.
  - The worker hash (tick + hash) is unchanged after the map, after drawing, and at the end.
  - expectNoSeriousA11yViolations passes on the map and the probe panel.
  - In the map sheet, the session bar and the probe sheet, every text is ≥ 16 px (SVG labels by drawn height) and every button or radio label is ≥ 48 px.

### Checked to fail without the mechanism
I removed three mechanisms one at a time, ran the matching tests, then restored the files from backups:
- without `ledger.restoreTo` in `rebind`, the Undo test fails;
- without `ledger.poolRemoved`, the two-species pool test fails;
- with the probes' stage-2 delta zeroed, the boundary test fails.

The run printed "3 failed".

## Files
- New:
  - src/worker/relationshipMap.ts, src/worker/probes.ts
  - src/ui/observe.ts, src/ui/strings/observe.ts
  - src/ui/panels/RelationshipMap.tsx, src/ui/panels/ProbePanel.tsx, src/ui/panels/ProbeSession.tsx
  - tests/worker/relationship-map.test.ts, tests/worker/probes.test.ts, tests/ui/observe.test.ts, tests/e2e/observe-tools.spec.ts
- Owned files changed:
  - src/worker/relationships.ts (ledger feed);
  - src/render/renderer.ts (setProbes / drawProbes, `probeOutline`, `dashed`);
  - src/ui/panels/LabTray.tsx (two Observe buttons, `IconRelMap`, the group label, endProbeSession in pickSession);
  - src/ui/views/LabView.tsx (gesture routing, Escape);
  - src/ui/views/LabToolbar.tsx (mounts);
  - src/ui/strings/lab.ts (the Observe hint now names relationships and regions).
- Shared, additive:
  - src/worker/protocol.ts (2 imports, 3 ToWorker and 2 FromWorker members);
  - src/worker/client.ts (3 methods);
  - src/worker/host.ts:
    - 2 imports and the `probes?` Dish field;
    - the `relationshipMap` / `probeSet` / `probeRead` cases;
    - one hook line (:1441) and one after-tick line (:1455) in stepDish, never for d.arm and never in rollback replays;
    - `probes: null` in duplicateDish (:1776; D-0075 sharing rule).
  - src/ui/state.ts (2 sheet ids), src/ui/views/DishScreen.tsx (2 imports and 2 branches), src/ui/styles.css (the block at :3588).
- Prettier: run only on my new files.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit` → clean.
- `npx eslint <all files above>` → exit 0.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/worker/relationship-map.test.ts tests/worker/probes.test.ts tests/ui/observe.test.ts tests/worker/relationships.test.ts tests/worker/duplicate-sharing.test.ts tests/sim/view-switch.test.ts tests/sim/lab-commands.test.ts tests/audio/call-sites.test.ts tests/ui/diet-line.test.ts tests/worker/host.test.ts` → `Test Files 17 passed (17)`, `Tests 159 passed (159)`.
- `E2E_PORT=4273 E2E_OUTDIR=tmp/dist-observe-tools npx playwright test tests/e2e/observe-tools.spec.ts --project=desktop --project=phone-portrait` → `2 passed (3.2m)`.
  - Earlier runs failed twice, both fixed: axe `scrollable-region-focusable` on the table wrapper (now a focusable labelled region), and the phone session bar covering the drag point (bar made shorter, title visually hidden on phones).
  - Port 4273 was stopped before and after each run.

## FENCE
None. Every fence file passed unchanged and no fence value moved.

## Notes and bugs noticed elsewhere
- **Performance (not measured by me; left to the lead):** the ledger runs on every played dish, not only when the map is open.
  - It adds two poolTotal sums per tick for each food pool. That is limited to active fields, but sugar, metabolite and CO2 are always summed because feeding returns to them.
  - Probes add 2 × (cells in mask) × 8 field sums per tick, only while regions exist.
  - The always-on choice keeps the map populated when it is first opened.
- No bugs found in other code.
- `LabTray` Observe group's aria-label changed from "Charts and family" to "Charts, family, relationships and regions". No test pinned it; other specs were not re-run, as instructed.

## Proposed decisions
- **PROPOSED DECISION: the relationship map as built.**
  - Scope: worker session state for a played dish, kept per whole dish second for 600 s. It is never saved, hashed or read by the sim, and it is empty after a reload.
  - Undo or rollback to tick T drops every second holding a tick ≥ T. If T falls inside a second, the record restarts at T ("Recorded since m:ss"), so a part second is never shown as a whole one.
  - What each kind measures:
    - catches: count and the capture events' carbon;
    - infects, attaches, bursts, drains: counts, credited as P3.8 credits them;
    - converts: the carbon converted in cells where producersNear names that species. A cell where two producer species are named counts for each; it is never split between them (D-0051 never assigns units to producers);
    - eats: seconds seen (IntakeSeen holds bits only).
  - Pool nodes carry the carbon feeding removed (poolTotal before and after stage 6), never divided among eaters. For sugar, metabolite and CO2 it is labelled "net", because feeding also returns to them.
  - "resource exchange observed" is shown only for two species that each have an arrow to the other in the window.
- **PROPOSED DECISION: region probes as built.**
  - Masks use integer cell centres (content geometry, SPEC §13.1), clipped to the dish mask, at most 6, lettered A–F. A rectangle's corners are the drag's start and end cells; a circle is centred on the start cell with a whole-cell radius ≤ 64.
  - Population counts living organisms by the cell under their position (floor).
  - Boundary transfer is measured only for sugar and broth, and for oxygen and CO2 only in seconds whose every tick had the lid closed. starch, oil, protein and detritus show "not measured here".
  - Regions are worker session state for the open dish. They are not saved, reset on reload, start empty in a duplicate, and are never on a comparison copy.
  - Masks survive Undo; their boundary seconds later than the restored tick are dropped. D-0082's "reset on … Undo" is read as "the windows' records reset", not "the masks are deleted". The lead may rule otherwise.
- **PROPOSED DECISION:** transfer preview ships with the Phase 5 gate structures (restating D-0082 for WORKLOG P4.8). There is no gate to select in v1.0 (enabledStructures BEAD, STONE, WALL), so no button and no speculative code.
- **PROPOSED DECISION: drawing regions.**
  - One drag draws one region and a tap draws nothing (a toast says to drag); two fingers still pan and cancel.
  - Escape and Done end the session; the session ends on a view switch or when another Lab tool or session is picked.
  - There is no keyboard way to draw a region: the readings, Delete and the window choice are all keyboard reachable. A keyboard draw (for example Enter twice at the reticle) can be added at the a11y pass if the owner wants it.
- **PROPOSED DECISION:** picture labels are scaled so they render at ≥ 16 CSS px at any width (UX §4.1). The table stays the primary, accessible form (UX §9).
