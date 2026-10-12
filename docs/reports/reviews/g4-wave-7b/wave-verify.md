# Wave g4-wave-7b: adversarial verification (web-arcade P4.11 + full journey; store P4.12)

Verifier run 0, 2026-10-12. Working tree on top of 33a2a62, uncommitted. Scratch: tmp/verify-g4-wave-7b-0/.

**Verdict: ok = false.** There is 1 MAJOR for web-arcade and 1 MAJOR for the lead. Everything else holds, apart from some MINOR items.

## Problems (most severe first)

1. **MAJOR [web-arcade] src/ui/views/NewDish.tsx:326 (with src/worker/host.ts 'command' and src/ui/panels/LabTray.tsx:138): in the demo, New Dish opens the full Lab, and the player cannot leave it.**
   - **What happens:** `started()` calls `openLabWith('life')` unconditionally. In DEMO_MODE the new dish therefore opens in Lab view. Every Lab category is there: Inspect, Life, Food, Chemistry, Habitat, Tools (which includes Compare) and Observe. The Lab Life tray lists all 19 species, because `trayItems('life')` is not filtered by `uiDemoScope()`. DishScreen hides the Explore/Lab toggle in the demo, so the player is stuck in Lab.
   - **The worker does not stop it either.** It never refuses an `inoculate` of a species outside the scope. A demo player can add Dusk with no developer tools at all, then save. Their own save, and the autosave behind Continue, is then refused with "Couldn't open: this dish needs the full version of Pixelmeba (it uses Dusk). Nothing changed."
   - **What the docs require:**
     - The assignment says New Dish keeps "species and habitat limited to the scope" and the demo is "Explore only, D09 'Explore controls'".
     - D09 line 209 limits the demo to "the first five implemented organism templates … Explore controls".
     - The builder's report says this "can only be reached through developer tools". That is not true.
   - **Repro:** `tmp/verify-g4-wave-7b-0/probe-newdish.mts` (demo build `VITE_DEMO_MODE=1 vite build --outDir tmp/dist-verify-g4-wave-7b-0-demo`, served on 4390). Home → New dish → Create gives:
     - `data-view=lab`, `view-toggle` count 0, `lab-bar` count 1;
     - "life tray buttons: 19 Sunbead | Sprinter | Velvet | Dusk | … | Creambud";
     - categories inspect/life/food/chemistry/habitat/tools/observe.
     - Picking Dusk and tapping the dish takes it from "56 alive" to "66 alive". Save then shows "Saved “My dish”." Reloading and opening slot1 shows "Couldn't open: this dish needs the full version of Pixelmeba (it uses Dusk). Nothing changed."
   - **Fix direction:**
     - In the demo, New Dish's start should not open the Lab: stay in Explore and open Add Life.
     - The Lab trays should be filtered by scope, or the Lab made unreachable in the demo.
     - The worker should refuse a species command outside the scope (`demoCheck` for 'command' inoculate), so the worker, not only the screen, enforces the scope.
     - web-arcade (c) should cover New Dish in the demo. Its current checks never reach this path.

2. **MAJOR [lead] src/ui/views/Notebook.tsx TABS and src/ui/panels/WhatIfSheet.tsx `pairOffered`: two demo UI items in Build item 4 are not done.**
   - The demo still shows the Notebook's Experiments tab: 14 cards whose Start the worker refuses (host.ts prepareExperiment DemoRefusal).
   - It also still offers the paired "Compare with Garden (180 s)" run, which the assignment says the demo hides.
   - Both files were outside web-arcade's ownership. The builder gave exact patches in web-arcade-build.md under "Needs the lead"; the lead must apply them before the demo is complete.
   - A test is also needed: extend web-arcade (c) to assert no `notebook` experiments tab and no `whatif-pair` in the demo.

3. **MINOR [store] store/screenshots/{phone,tablet7,tablet10}/06-experiment.png: the shot carries more than one idea.**
   - A transient toast ("Journal stamp: Measured sugar made from starch. Your dish is unchanged; the copies run to their stopping point.") covers the top of the dish preview.
   - The preview shows "A · as written +3:00 · 0 alive", an empty dish.
   - D09 §11: "Every screenshot should communicate one idea at phone size."
   - It is honest, but a capture taken after the toast has gone, of the results with a populated arm, would read better. Repro: view the phone PNG.

4. **MINOR [store] store/screenshots/tablet7, tablet10: the tablet sizes differ from ARCH §15 and the assignment.**
   - The shots are 1152×2048 and 1440×2560.
   - ARCH §15 says "screenshots via Playwright at 1080x1920 and 1920x1080 (and tablet 1600x2560)". The assignment says 1200×1920 and 1600×2560.
   - The builder's reason, Play's quoted 9:16 tablet guidance, is sound and labelled PROPOSED DECISION. It needs a DECISIONS entry that records the conflict with ARCH §15, plus an owner flag.

5. **MINOR [lead] docs/PLAY_STORE_CHECKLIST.md §C and §B10: the arcade's offline claim conflicts with web-arcade's decision.**
   - §C says `dist/` has "PWA offline support". Web-arcade's PROPOSED DECISION is that the stamped arcade deploy (tools/deploy-arcade.mjs `<base>`) registers no service worker and plays online only, until the owner supplies the arcade's manifest and embedding rules.
   - B10 does not tell the owner this, and that owner item is not listed. Add it to B10 and §C.

6. **MINOR [lead] src/ui/strings/about.ts ABOUT_TEXT.privacy versus android allowBackup="true".**
   - About says "Saves stay on this device." Android Auto Backup may copy them to the player's Google account. PRIVACY_POLICY.md and data-safety.md say so plainly.
   - The line was dictated verbatim by the assignment, so this is wording for the owner to review under D-0093, not a builder defect.

7. **MINOR [web-arcade] tests/e2e/web-arcade.spec.ts (b), line "Another shape does nothing": a test step that checks nothing.**
   - The step posts `{type:'pixelmeba:pause', extra:1}` while the dish is already paused, then asserts nothing about it.
   - The exact-shape rule is covered by the unit test (iframe-safe.test.ts hostMessage), so this only overstates what the e2e proves.

8. **MINOR [lead] store/screenshots/manifest.json: `buildCommit` is "33a2a62+dirty".**
   - After the wave commit, rerun `npm run store:assets` (about 23 min) so the provenance names the release commit, as the store report says.

## VERIFIED OK

**Fence and new unit tests, run by me:**
- I ran `npx vitest run` on:
  - the fence: tests/fixtures/g2-replay, the four trajectory-fence files, conservation-closed-lid;
  - the new tests: demo-scope, worker/demo-host, tests/platform (all), tools/version-scheme, tools/listing, tools/store-assets;
  - ui/comprehension-labels.
- Result: **17 files, 125 tests passed**, EXIT 0 (log: tmp/verify-g4-wave-7b-0/vitest1.log).

**Typecheck and lint:**
- `npx tsc -p tsconfig.json --noEmit` EXIT 0.
- `npx eslint` over src, the new tests, tools, vite.config.ts, playwright.config.ts and eslint.config.js: EXIT 0.

**The iframe rule applies everywhere in src:**
- `eslint --print-config` shows top/parent/opener/frameElement as restricted globals, plus 12 restricted window/self/globalThis properties, for src/ui, src/worker, src/sim (alongside SIM_DETERMINISM's Date/performance/window/document/fetch) and src/render.
- The `@capacitor` boundary block is unchanged.

**The demo refusal happens before anything is kept (D-0033), in every path:**
- host.ts calls `demoCheck` on the prepared world before `keepFirst` in loadSlot (`opened`), importDish, recipeImport, recipeIdStart, create with keepFrom and plain create.
- What if? refuses before `keepSource`. An experiment card is refused in prepareExperiment.
- demo-host.test.ts checks the open dish's hash, that it keeps running, the backend slots and records, and activeDishId for each path. With demo off, the same requests all succeed.

**Demo toasts:**
- My browser probe got exactly one "Couldn't open: … (it uses Dusk). Nothing changed." toast. The global onError skips `loadSlot` with kind 'demo' (state.ts).

**Demo scope and save format:**
- The scope is read from content: species A01, B01, B04, B06, P01; FIRST_DISH_V1; R-G0–R-G3; WATER_GARDEN. R-G0's title is "Garden", so "three What if? ideas" is accurate.
- The content pack is not trimmed, and the same contentHash is used. The demo and full builds export byte-identical files, and the full build opens a demo save with an equal stateHash.
- No sim, content, manifest or save-shape change. APP_VERSION is metadata only; nothing compares it.

**Service worker and offline:**
- `swRefusal` covers dev, native, unsupported, insecure and moved-base (including an unreadable base). Registration is './sw.js' with scope './'.
- My demo build (EXIT 0) emits sw.js with 26 precache URLs. That covers every non-map file: 20 js minus sw.js and workbox, css, html, atlas json, 4 png, webmanifest. There are no other file types.
- sw.js has no clientsClaim, and its only skipWaiting is inside the plugin's SKIP_WAITING message hook.
- index.html keeps deploy-arcade's preconditions (spec (d)).

**main.tsx host messages:**
- Only the two exact shapes act.
- Resume clears the host pause, never calls setSpeed, and resumes audio only after a gesture while visible.
- 'load' registers the service worker.

**Ownership and shared files:**
- tests/e2e/staticServer.ts: the `pages` option is additive, with no behaviour change without it.
- package.json: store changed "version" only; web-arcade added "build:demo" only.
- .gitignore: dist-demo added.
- playwright.config.ts: `serviceWorkers: 'block'`; web-arcade.spec.ts opts in.
- Each builder edited only its own files. The styles.css About block is appended at the end, and `.demo-line` is web-arcade's.

**full-journey.spec.ts covers every step in the assignment by reading:** feed toast, inspector name, Undo back to the pre-feed hash, save, reload and the same hash, R-G3 at 0:00 paused, pair setup → run → results ("this paired run", the caveat, a conclusion) → Done gives R-G3 at 0:00 paused, Share's three labelled radios, a 1080×1080 PNG, and the hash unchanged after Close. Axe runs at the 6 screens. I did not rerun it: no suspected defect.

**Store version scheme:**
- package.json, APP_VERSION and build.gradle all give 1.0.0. The JsonSlurper reads `rootProject.file('../package.json')`; versionCode = major*10000 + minor*100 + patch, with a guard for minor or patch > 99.
- aapt reports versionCode 10000 (ANDROID_SETUP §9.2).
- The debug APK (18:28:58) is newer than the last wave-7b source edit (18:16:20), so it was built from the final source tree.

**Store images:**

| File | Size | Format and check |
|---|---|---|
| icon-512.png | 512×512 | RGBA, minimum alpha 255 (decoded by me) |
| feature-1024x500.png | 1024×500 | colour type 2: RGB, no alpha |
| phone screenshots | 1080×1920 | RGB, six topics |
| tablet7 screenshots | 1152×2048 | RGB, six topics |
| tablet10 screenshots | 1440×2560 | RGB, six topics |

- Topic 05 shows a real "Branch established" branch, 29A, from a saved run. Topic 04 shows the constraint line.

**Listing claims match the content and the UI:**
- Content: 19 enabled species (an alga, 7 bacteria, 2 fungi, 2 yeasts, 4 consumers, a phage, a parasite), 14 experiments at phase ≤ 4, 3 habitats, 10 named slots (store.ts NAMED_SLOTS).
- The UI has "Export without names or notes", "Hide labels", Saves Delete, "Quiet audio" and "Simplified overlay colours".
- No Phase 5–7 promises.

**Privacy and data safety:** PRIVACY_POLICY.md and data-safety.md state allowBackup, INTERNET, VIBRATE and the six Capacitor plugins accurately.

## Notes (not graded)

- The store builder reports that Lab → Observe → Family tree hangs on "Reading the family tree…". LabTray.tsx:631-634 only sets `sheet.value = 'lineage'` and never calls `openLineage()`. I did not reproduce it in a browser; the lead should confirm and route it.
- Web-arcade's damaged-save double toast outside the demo is unverified by me.
- Port 4390 was stopped before and after the probe.
