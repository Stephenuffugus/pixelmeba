# Wave g4-wave-7b: adversarial re-verification, round 1 (web-arcade fixes)

Re-verifier 1, 2026-10-12. The working tree is on top of 33a2a62 and uncommitted. Scratch files are in tmp/reverify1-g4-wave-7b/.

**Verdict: ok = true for the round-1 fixes.** Both problems sent to the fixer hold as fixed. No new BLOCKER or MAJOR was found. There is one new MINOR in the worker backstop and one new MINOR in the UI.

**Still open:** wave-verify.md's MAJOR 2 [lead] was not in this round's fix list. That is the demo's Notebook Experiments tab and its "Compare with Garden (180 s)" paired run. src/ui/views/Notebook.tsx and src/ui/panels/WhatIfSheet.tsx are still unmodified (git status). The lead must apply the patches in web-arcade-build.md "Needs the lead" before the wave is complete.

## Problems (most severe first)

1. **MINOR [web-arcade] src/worker/host.ts:1769 (compareStart): the worker backstop can be bypassed.**
   - **What is wrong:** `compareStart`'s `interventions` are passed to `applyNow(b.world, …)` without `demoCommandProblem`. In the demo, a crafted `compareStart` with an Add Life of Dusk therefore puts Dusk into arm B. `saveSlot` accepts an arm's dishId, so that arm can be saved, and the demo then refuses to open that save.
   - **Why it matters:** the fixer claims "a demo player can never make a dish the demo would then refuse to reopen", and that claim is false for this path.
   - **Reachability:** the UI cannot reach it. client.ts `compareStart` never sends interventions. In the demo, More's Compare and the Lab Tools tray are both gone. B's later commands go through the guarded `command` case.
   - **Repro:** tmp/reverify1-g4-wave-7b/arm.probe.test.ts, a DishHost with `{ demo: demoScope(REG) }`:
     - a direct `command` inoculate B03 gives "Dusk needs the full version of Pixelmeba. Nothing changed.";
     - `compareStart` with `interventions: [{ inoculate B03 }]` leaves "Dusk alive in arm B: 4";
     - `saveSlot` on b gives `slotSaved`;
     - `loadSlot` slot1 gives error kind 'demo', "this dish needs the full version of Pixelmeba (it uses Dusk)".
   - **Fix:** in the demo, run the same `demoCommandProblem` check on each intervention before `compareStart` builds anything. Alternatively, refuse `compareStart` outright in the demo, which has no Compare.

2. **MINOR [web-arcade] src/ui/views/DishScreen.tsx:157-161 with src/ui/panels/SamplePanel.tsx:122: Transfer does nothing in the demo.**
   - **What is wrong:** `demoProblem` accepts a save that holds a sample of in-scope species. In the demo, SamplePanel's Transfer button calls `setDishView('lab')`, and the new guard switches straight back to Explore. `setDishView` calls `endSession()`, which ends the transfer session. The button therefore only announces "entered Lab / entered Explore" and does nothing.
   - Cancel and Discard still work, so the player is not stuck.
   - **Repro:** by reading the code. Import into the demo a Garden save made in the full build with a sample held, then press Transfer.
   - **Fix:** hide Transfer in the demo, or offer an Explore transfer.

## Fixed problems: refutation attempts

- **VERIFIED OK: MAJOR [web-arcade] "the demo's New Dish opens the full Lab, and the worker accepts any species" is fixed.**
  - **Browser:** I rebuilt the demo from the current tree (`VITE_DEMO_MODE=1 vite build --outDir tmp/dist-reverify1-g4-wave-7b-demo`, EXIT 0, "precache 26 entries (2724.14 KiB)"). I served it on port 4394 and ran tmp/reverify1-g4-wave-7b/probe.mts, the verifier's repro adapted. Home → New dish → Create gave:
    - `data-view: explore`; view-toggle 0, lab-bar 0, lab-cat-* 0;
    - Add Life open with exactly species-A01 Sunbead, B01 Sprinter, B04 Recycler, B06 Crumbsmith, P01 Amoeba; run-toggle "Run" (paused);
    - placing Sunbead gave "Added 5 Sunbead.";
    - the keys Escape, l, l, f, Escape, i still left the view in explore;
    - More has no Compare, challenge or Try rows;
    - Save gave "Saved “My dish”." After reloading, Saved dishes → slot1 Open gave "Opened “My dish” — paused where you left it." in Explore.
  - The original repro (data-view=lab, 19 tray species, Dusk added and saved, the save refused) no longer happens. Port 4394 was stopped before and after.
  - **Lab entrances:** the only callers of `setDishView('lab')` and `openLabWith` in src/ui are NewDish (now demo-gated), the hidden LabViewToggle and SamplePanel Transfer (see MINOR 2). No key in `handleViewKey` enters the Lab from Explore.
  - **Worker:** the guard sits at the top of `case 'command'`, before `d.arm`, the sample check and `applyNow`. It covers `inoculate` and `lineage spawnSpecimen`, resolving the specimen through `world.branches.specimens`, the same list as `specimensOf`. The other `applyNow` sites are:
    - undo label re-apply and rollback replay, which only re-run commands already accepted;
    - armCommand, which runs behind the guard;
    - compareStart interventions (see MINOR 1).
  - **The new test fails on the old behaviour:** I made a load-time mutant, tmp/reverify1-g4-wave-7b/mut/platform/demoScope.ts, where `demoCommandProblem` returns null, and aliased `@platform` to it in tmp/reverify1-g4-wave-7b/vitest.mut.config.ts. Running `MUT=1 npx vitest run … tests/worker/demo-host.test.ts -t "fix round 1"` gave EXIT 1: "× Add Life of Dusk … AssertionError: expected { accepted: 4, rejected: +0 } to be null". The demo-off test still passed.
  - **Web-arcade (c):** its New Dish step asserts `data-view="explore"`, `lab-bar` 0 and `view-toggle` 0. Those assertions fail on the code the verifier probed (data-view=lab, lab-bar 1).
  - **Full build unchanged:** every new branch is behind `DEMO_MODE` or `this.demo`. NewDish's full path still calls `openLabWith('life')` and `revealLifeTray()`.

- **VERIFIED OK: MINOR [web-arcade] the wrong-shape step in web-arcade (b) is now meaningful.**
  - With the dish running, the step posts `{type:'pixelmeba:pause', extra:1}`, the bare string 'pixelmeba:pause' and `{type:'pixelmeba:pause '}`.
  - It then polls until the clock is at least `runningAt + 2` s and asserts the toggle still reads Pause.
  - Code that acted on any message with that `type` would pause the dish, and this step would fail.
  - src/platform/web.ts `hostMessage` requires exactly one key, `type`, holding one of the two exact strings.

## Regressions and fences (run by me)

- **Fence and new tests:** `npx vitest run` over tests/fixtures/g2-replay.test.ts, the four trajectory-fence files, conservation-closed-lid.test.ts, demo-scope.test.ts, tests/worker/demo-host.test.ts and tests/platform gave **13 files, 106 tests passed, EXIT 0** in 255.6 s (log: tmp/reverify1-g4-wave-7b/vitest1.log).
- **Typecheck:** `npx tsc -p tsconfig.json --noEmit` EXIT 0.
- **Lint:** `npx eslint src tests/worker/demo-host.test.ts tests/fixtures/demo-scope.test.ts tests/e2e/web-arcade.spec.ts` EXIT 0.
- **Determinism:** the new helpers are outside src/sim. They use no Math.random, Date or Map/Set iteration, and draw no RNG. A refused command takes no undo point and makes no replay entry (demo-host test: "nothing to undo"). Nothing in the sim, content, manifest or save shape changed.
- **Ownership:** this round touched only web-arcade's files (src/platform/demoScope.ts, src/worker/host.ts, src/ui/views/NewDish.tsx, src/ui/views/DishScreen.tsx and its own tests).
- **Lead item:** the fixer's PROPOSED DECISION (the worker enforces the species scope; the demo's New Dish opens in Explore with Add Life) still needs its DECISIONS.md entry from the lead.

## Notes (not graded)

- The demo's Add Life tile for Amoeba reads "Hunts Sprinter, Velvet, Dusk, …, and 8 kinds not in this dish." It names species the demo can never hold, and its "not in this dish" count looks inconsistent with the names listed. This copy predates this wave and is outside this round; the lead may want to check it.
- I did not rerun the web-arcade or full-journey e2e suites. My own browser probe covered the suspected UI path.
