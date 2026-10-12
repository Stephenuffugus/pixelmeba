# Wave 7b web-arcade (P4.11): fix round 1

Date: 2026-10-12. Round-1 fixer for the web-arcade assignment. Nothing was committed; the lead commits.

## Problems

### MAJOR: in the demo, New Dish opened the full Lab, and the worker accepted any species. FIXED.

The fix has three layers.

1. **The UI (src/ui/views/NewDish.tsx `started`).**
   - In DEMO_MODE the new dish opens in Explore with `setDishView('explore')` and the Add Life sheet open (`sheet.value = 'addLife'`). Add Life is already filtered to the five by `uiDemoScope()`.
   - The full build keeps `openLabWith('life')` and `revealLifeTray()`, unchanged (UX §2.3).
   - This follows D09 line 209: "Explore controls".
2. **A guard (src/ui/views/DishScreen.tsx).**
   - In DEMO_MODE, a `useEffect` returns the dish to Explore whenever `dishView` is 'lab'.
   - This covers the one other Lab entrance, SamplePanel's Transfer, which is reachable only if a world holding a sample is loaded.
3. **The worker (src/worker/host.ts `case 'command'`).**
   - New pure helpers in src/platform/demoScope.ts: `demoCommandProblem(world, payload, scope, registry)` and `demoCommandReason`.
   - In the demo, the worker refuses two commands before `applyNow`, before the arm, sample and challenge paths:
     - an `inoculate` of a species outside the scope;
     - a `lineage` `spawnSpecimen` whose specimen's species is outside the scope.
   - A refused command takes no undo point, writes nothing, and changes neither the hash nor the replay. Its ack is `{ result: null, error: "Dusk needs the full version of Pixelmeba. Nothing changed." }`.
   - So a demo player can never make a dish that the demo then refuses to open.

**Tests.** Each one fails on the old behaviour.
- **tests/worker/demo-host.test.ts**, new describe "the demo worker refuses a command that adds a species outside the scope":
  - With demo on, Add Life of Dusk gets the exact ack error. The stateHash and the store are unchanged, and there is no undo point (undo answers 'nothing to undo').
  - A Sunbead is still accepted. Save to slot1, then reopen: the dish loads.
  - With demo off, the same Dusk command is accepted.
- **tests/fixtures/demo-scope.test.ts**, new describe:
  - `demoCommandProblem` for inoculate: Dusk gives `{ ids ['B03'], names ['Dusk'] }`, the exact reason sentence, null for each of the five, and null for other commands.
  - A saved Dusk specimen's spawn is a problem; a Sunbead specimen's spawn is not.
- **tests/e2e/web-arcade.spec.ts (c)**, extended:
  - Demo Home → New dish → Create gives `data-view="explore"`, Run, no `lab-bar`, no `view-toggle`, and Add Life showing exactly Sunbead, Sprinter, Recycler, Crumbsmith, Amoeba.
  - After 500 ms it is still Explore.
  - Add Life of Dusk sent straight to the worker (a new `workerCommand` protocol helper) is refused with the exact text, and the worker hash is unchanged.
  - Sunbead placed through the UI gives "Added n Sunbead".
  - The verifier saw `data-view=lab` and 19 tray items on the old code, so this test would have failed there.

### MINOR: web-arcade (b)'s "Another shape does nothing" asserted nothing. FIXED.
- The step now posts three wrong shapes while the dish is **running**: `{type:'pixelmeba:pause', extra:1}`, the bare string `'pixelmeba:pause'`, and `{type:'pixelmeba:pause '}`.
- It then asserts that the clock advances by at least 2 s and that the toggle still reads Pause.
- Old code that acted on any `type` would pause the dish and fail this step.

### Not mine (from wave-verify.md)
- MAJOR 2 (Notebook Experiments tab and WhatIfSheet `whatif-pair` in the demo) is the lead's, with the patches in web-arcade-build.md under "Needs the lead".
- MINOR 3–6 and 8 belong to store or the lead.

## Files changed
- src/platform/demoScope.ts: `demoCommandProblem` and `demoCommandReason`, plus a type import of CommandPayload.
- src/worker/host.ts: the demo command guard at the top of `case 'command'`, and the import.
- src/ui/views/NewDish.tsx: in the demo, `started` stays in Explore and opens Add Life.
- src/ui/views/DishScreen.tsx: the demo's no-Lab guard effect.
- tests/worker/demo-host.test.ts, tests/fixtures/demo-scope.test.ts, tests/e2e/web-arcade.spec.ts: the tests above, and the spec header updated.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint` on the changed src and test files: clean.
- `npx vitest run` on the fence and the related tests: **14 files, 110 tests passed**, EXIT 0 (325 s). The files were:
  - tests/fixtures/g2-replay.test.ts
  - tests/fixtures/trajectory-fence*
  - tests/fixtures/conservation-closed-lid.test.ts
  - tests/fixtures/determinism.test.ts
  - tests/fixtures/demo-scope.test.ts
  - tests/worker/demo-host.test.ts
  - tests/platform
- `E2E_PORT=4283 E2E_OUTDIR=tmp/dist-web-arcade npx playwright test tests/e2e/web-arcade.spec.ts --project=desktop`: **4 passed** (2.7 m).
  - The first run failed at my new probe, because the helper left out `protocolVersion`. I fixed the helper and reran.
- The same spec with `--project=phone-portrait`: **4 passed** (1.8 m).
- `tests/e2e/full-journey.spec.ts --project=desktop`: **1 passed** (4.3 m).
- Ports 4283, 5283 and 5383 were stopped before and after each run.

## PROPOSED DECISION
In DEMO_MODE the worker, not only the screen, enforces the species scope. It refuses an Add Life or a specimen placement of a species outside the demo, with "{name} needs the full version of Pixelmeba. Nothing changed.", before the command reaches the world (no undo point, no replay entry). The UI never offers such a command; the worker's refusal is the backstop, so a demo player cannot make a dish the demo would refuse to reopen. New Dish in the demo opens the dish in Explore with Add Life open (the demo has no Lab; D09 line 209 "Explore controls"). It replaces UX §2.3's Lab start only in the demo.
