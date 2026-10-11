# Wave 7 "Ship": task-file writer report

File: /workspaces/pixelmeba/docs/agent/g4-wave-7.tasks.js.txt. It was written against main 2dc561f. Wave 6b's uncommitted edits were not read as built. Every 6b fact is a `<lead: …>` placeholder, and LEAD PRE-LAUNCH 1a–1f lists them.

## Parse check

```
$ node -e "...replace(/^export /gm,''); new Function(s+'; return WAVE_TASKS.map(...)')()..."
android 4281 1 own 19686
perf2-polish 4282 1 false 14190
web-arcade 4283 2 false 12643
store 4284 2 false 13156
```
The STATE string is 14,170 characters.

## Stages and ownership (one owner per file per stage)

| Stage | Task (port) | New files | Owner of |
|---|---|---|---|
| 1 | android (4281, critical 'own'; harness server 5281) | src/persistence/{capacitorFs,fsPort}.ts, src/worker/boot.ts, src/platform/{capacitor,fsHost,lifecycle,nativeShare,fsHarness}.ts, art/src/icons/appIcon.ts, tools/{android-build,android-icons}.ts, tools/android-keystore.sh, tests (capacitor-fs, backend-contract, fs-bridge, lifecycle, native-share, boot, android-icons, android-keystore), tests/e2e/{android-storage.spec,staticServer}.ts | src/worker/{sim.worker,protocol,client}.ts, src/ui/main.tsx, src/ui/share.ts, capacitor.config.ts, android/**, public/icons/**, docs/ANDROID_SETUP.md, tools/android-sync.ts, package.json scripts, eslint.config.js |
| 1 | perf2-polish (4282; perf-web 5282) | src/render/budgets.ts, src/worker/perfCounters.ts, src/ui/speedBadge.ts, src/ui/panels/Diagnostics.tsx, tools/perf-web.ts, docs/reports/perf-rc1.md, tests (budgets, camera-easing, feeding-pulse, speed-badge, placement-ring, diagnostics, perf-counters, relationship-map-cost, profile-eviction), tests/e2e/first-minute.spec.ts | src/worker/{host,relationshipMap,snapshot}.ts, src/sim/** (hash-neutral only), src/render/{renderer,camera,features,layers}.ts, src/ui/state.ts, src/ui/views/{DishScreen,SimplePage,CompareScreen,ExperimentRun}.tsx, src/ui/styles.css, tools/{perf-stress,render-bench,render-bench-run}.ts, the UX §7.4 camera-easing cell |
| 2 | web-arcade (4283; servers 5283, 5383) | src/platform/{web,demoScope}.ts, tools/build-demo.ts, tests (demo-scope fixture, sw-register, iframe-safe, demo-host), tests/e2e/{web-arcade,full-journey}.spec.ts | vite.config.ts, index.html, playwright.config.ts, eslint.config.js, src/ui/main.tsx, src/worker/{sim.worker,host,protocol,client}.ts, src/ui/state.ts, src/ui/views/{Home,Play,NewDish,DishScreen,Saves,FieldGuide}.tsx, src/ui/panels/{MoreSheet,GoalChoice}.tsx + the Add Life tray, src/ui/styles.css |
| 2 | store (4284; server 5284) | tools/lib/storeShots.ts, art/src/icons/featureGraphic.ts (only if needed), store/**, PRIVACY_POLICY.md, tests/tools/{store-assets,version-scheme,listing}.test.ts, tests/e2e/about.spec.ts | tools/store-assets.ts, docs/PLAY_STORE_CHECKLIST.md, docs/ANDROID_SETUP.md (§1 version rows, §7, §9 new entry, §10), android/app/build.gradle (version lines), src/persistence/appVersion.ts, package.json "version", SimplePage.tsx, strings/about.ts, the App.tsx About string |

Shared files (additive, by symbol):
- **Stage 1, protocol.ts and client.ts:** android owns them. perf2-polish adds only ToWorker 'diagnostics' {on}, SnapshotMsg.perf? and client.setDiagnostics.
- **Stage 1, state.ts:** perf2-polish owns it. android changes only the body of saveTextFile and may add one signal.
- **Stage 1, styles.css:** perf2-polish owns it. android may append one block.
- **Stage 2, state.ts and styles.css:** web-arcade owns them. store appends one About block.
- **Stage 2, package.json:** store owns "version". web-arcade adds only "build:demo".
- **Stage 2, tests/e2e/staticServer.ts:** web-arcade may add an option to it.
- **Every stage:** tests/helpers/host.ts and tests/e2e/helpers.ts take new helpers only. Tests that pin a list may be updated.

Nobody edits:
- content/**, public/atlas/** or the fence;
- src/sim/{serialize,world,rng}.ts;
- the save-format files (saveFile, store, idb, notebook*, shelf, checkpoints, recipeFile, recipeId);
- tools/deploy-arcade.mjs.

Art owners: android in stage 1 (appIcon.ts) and store in stage 2 (featureGraphic.ts). Nobody runs art:build.

## v1.0 gate evidence map

| Gate item (BUILD_DIRECTIVE 673–677) | Covered by |
|---|---|
| All prior fixtures | earlier waves; the lead runs `npm run check` at P4.14 |
| favorites | wave 5a: tests/ui/favorites, worker/favorites-host, e2e/favorites |
| stories | wave 5b: tests/ui/stories, worker/stories-host, e2e/stories |
| objectives | wave 5b: tests/sim/objectives, content/objectives, worker/goals-host, e2e/goals |
| share | wave 6a: tests/persistence/share, render/picture, ui/share, e2e/share; android adds the native path |
| variants-paired | wave 6b (placeholder) |
| view-switch | P2.7: tests/sim/view-switch.test.ts |
| one-gesture accounting | e2e/place-and-undo ("one tap places one dose…", "a two-finger gesture never paints") and tests/sim/lab-commands |
| demo scope | web-arcade: tests/fixtures/demo-scope.test.ts and the DEMO_MODE part of e2e/web-arcade |
| e2e full journey | web-arcade: tests/e2e/full-journey.spec.ts (new); its compare step is a 6b placeholder |
| axe clean | a11y-screens plus every journey's expectNoSeriousA11yViolations; the new screens come from perf2-polish, web-arcade and store; the lead runs three projects once |
| perf report | perf2-polish docs/reports/perf-rc1.md, measured under load; the lead re-measures quietly (LEAD AFTER 3) |
| Android result | android (debug APK and unsigned AAB) and store (rebuild with 1.0.0 / 10000 and the new icons); the lead copies both into EXPANSION_RESPONSE §7 |
| store assets | store |
| D9 §12 usability gates (owner) | store writes them in PLAY_STORE_CHECKLIST §B with the protocol; the lead lists them in EXPANSION_RESPONSE §8 |

## Proposed decisions (the canonical docs were silent or conflicted)

- PROPOSED DECISION: Android saves use the Capacitor Filesystem adapter, and IndexedDB stays the web store. This supersedes D-0013 for the native app only.
  - BUILD_DIRECTIVE P4.10, ARCH §11.1/§12 and g4-plan call 5 all say Filesystem.
  - If the lead keeps D-0013 instead, it is a one-line change in android's Build step 4.
- PROPOSED DECISION: the Filesystem adapter implements the code's StorageBackend contract (one atomic commit of several records and pointers) with a journal: records/, slots/, journal.json as the commit point, temp-write → read-back → rename, and recovery on open.
  - This replaces ARCH §11.1's per-slot current/previous/tmp layout, which cannot make the checkpoint ring's or the shelf's multi-pointer commits atomic.
  - The predecessor is still kept through SaveStore.
- PROPOSED DECISION: the worker reaches Capacitor through a MessagePort bridge. The client's first message is ToWorker 'platform' {storage}, an additive message with no PROTOCOL_VERSION bump. Each bridge op has a 30 s timeout that marks the backend failed.
- PROPOSED DECISION: the browser interruption harness is a separate build with VITE_FS_HARNESS=1.
  - It uses the real bridge, the real @capacitor/filesystem web implementation and window.__fsHarness.
  - A test proves the normal dist does not contain it.
- PROPOSED DECISION: on Android every export goes through the OS share sheet, and no storage permission is requested.
- PROPOSED DECISION: Settings stay in localStorage on Android. This deviates from ARCH §11.1's "Settings only in Preferences"; it is flagged for the owner.
- PROPOSED DECISION: android:allowBackup stays "true", and the privacy policy says so (owner item). VIBRATE is added (D-0064). INTERNET stays until a device test (ANDROID_SETUP §10.6).
- PROPOSED DECISION: the resume copy is "Paused while Pixelmeba was in the background. No dish time passed." It shows only if the dish was running when it paused.
- PROPOSED DECISION: one app-icon matrix (art/src/icons/appIcon.ts) feeds the Android mipmaps and splash, public/icons and store/icon-512.
  - The art sits on a 54-px adaptive grid and a 24-px legacy grid, with integer scales only.
  - The store icon is RGBA with every pixel opaque. This reads the checklist's "no alpha" together with Play's icon spec, which store re-reads.
- PROPOSED DECISION (D-0085): the relationship map's pool sums start the first time the map is opened in a session, and pool nodes then say "Recorded since m:ss". Event arrows keep their full window.
- PROPOSED DECISION: the budget ladder stops at the renderer. Snapshot frequency is unchanged in v1.0.
- PROPOSED DECISION: the speed badge shows after 2 s below 0.8× and hides after 2 s at or above 0.9×. Its accessible name is "This device can't keep up with {speed}×, so the dish runs at {x}×. No dish time is skipped."
- PROPOSED DECISION: the deposit ring plays only on an accepted placement. Under reduced motion it is a static ring for 600 ms.
- PROPOSED DECISION: camera easing is 220 ms ease-out, for player-initiated moves only. Wheel, pinch and drag stay direct, and reduced motion makes every move instant.
- PROPOSED DECISION: diagnostics is an opt-in one-line bar under the top strip. It is part of the layout and never covers the dish.
- PROPOSED DECISION: perf2-polish's numbers are labelled "under load" because android runs Gradle at the same time. The lead re-measures quietly with the report's commands.
- PROPOSED DECISION: "dense Garden + wave E1" is measured two ways: FIRST_DISH_V1 at 4× for 15 minutes, and the 6,000-agent stress world imported as a save. Heat is an owner device item, with exact adb steps; the CPU share is recorded as a proxy.
- PROPOSED DECISION: the demo scope is the five phase-1 species (A01, B01, B04, B06, P01), FIRST_DISH_V1 with R-G0…R-G3, the WATER_GARDEN habitat, and Explore only.
  - New Dish stays, restricted to the scope (ARCH §14 conflicts with D09's "Explore controls").
  - Compare, paired variants, goals, Try my dish, experiments and curated dishes are hidden.
  - The content pack is unchanged, so demo saves keep the full build's contentHash.
- PROPOSED DECISION: the demo refusal is checked on the prepared world before keepFirst.
  - Import toast: "Import failed: this dish needs the full version of Pixelmeba (it uses …). Nothing changed."
  - Slot refusal: "Couldn't open: …".
  - There is no store link until the owner gives one.
- PROPOSED DECISION: the service worker uses vite-plugin-pwa generateSW with no prompt and no skipWaiting.
  - It never registers in the native app.
  - It never registers when a <base> moves the document's directory. The arcade's stamped layout from deploy-arcade.mjs therefore plays online, which is an owner item.
  - Playwright sets serviceWorkers 'block' by default.
- PROPOSED DECISION: 'pixelmeba:resume' never runs the dish. It only clears the host pause.
- PROPOSED DECISION: the version has one source. package.json is 1.0.0, which sets APP_VERSION and Gradle's versionName and versionCode 10000. The RC exists only as a tag.
- PROPOSED DECISION: screenshot topic 6 is "an experiment" (UX §10), not D09's "equipment experiment", because equipment is Phase 6. Topic 5 must come from a recorded run with a qualified branch; otherwise it is replaced per D09 and the replacement is stated.
- PROPOSED DECISION: wave 7 runs as two run files, 7a and 7b, with an integrate-and-commit step between them, as wave 6 did.

## Where the tree contradicts g4-plan, ARCH or BUILD_DIRECTIVE

1. **Android save store.** D-0013 put saves in IndexedDB on Android and used Filesystem only for export/share. BUILD_DIRECTIVE P4.10, ARCH §11.1/§12 and g4-plan call 5 require a Filesystem save adapter.
2. **Storage interface.** ARCH §11.1's StorageAdapter (per-slot writeAtomic/readPredecessor) is not the code's interface. The code uses StorageBackend with a multi-record atomic commit.
3. **Missing scripts and folders.** ARCH §2 lists the android:build:debug and android:build:release scripts, src/platform, src/diagnostics and src/persistence/{adapter,capacitorFs}.ts. None of these exist. The @platform alias in vite.config.ts points at a missing folder.
4. **No diagnostics overlay.** ARCH §13 and UX §2 ask for an opt-in diagnostics overlay; none exists.
5. **No Capacitor in src.** No @capacitor import exists anywhere in src. There is no App pause/resume handling, no native share, and saveTextFile uses a Blob download, which does nothing in an Android WebView.
6. **No resume hook.** main.tsx handles 'pixelmeba:pause' but not 'pixelmeba:resume' (ARCH §14 asks for both).
7. **PWA plugin unused.** vite-plugin-pwa 1.3.0 is installed but not configured. There is no web manifest and no service worker.
8. **Version sources disagree.** APP_VERSION is '0.1.0', package.json is '0.0.0', and Gradle has versionCode 1 / versionName "1.0". ANDROID_SETUP §7 says 1.0.0 → 10000.
9. **Ring on refused placements.** src/ui/state.ts reportCommand draws the placement ring even when res.accepted === 0. That is a visible feature without real state (CLAUDE.md "Every visible feature maps to real state").
10. **Missing VIBRATE.** D-0064 expects P4.10 to add VIBRATE; AndroidManifest has INTERNET only. The launcher icons and splash are still Capacitor's defaults.
11. **Arcade deploy and offline play.** tools/deploy-arcade.mjs needs /workspaces/lucid-winds, which is absent in this codespace. Its <base>-stamped layout keeps ARCH §14's offline PWA from working on the arcade deploy as built. Its portal note still says "a Phase 2 development build".
12. **Icon alpha wording.** PLAY_STORE_CHECKLIST says the icon is "32-bit PNG, no alpha". Read literally, that conflicts with itself and with Play's icon spec; store resolves it as opaque RGBA.
13. **Demo scope wording.** D09 §10 says the demo has "Explore controls", while ARCH §14 "restricts New Dish species" and New Dish sits in the Lab hub. The demo is resolved as above.
14. **Equipment screenshot.** D09 §11 asks for an "available equipment experiment" screenshot; equipment does not exist before Phase 6.
15. **Known from D-0066 (unchanged).** The src/sim/genome.ts comment about compaction is still wrong. The tick and memory criteria are still open.
16. **Store folder.** store/ exists but is empty and untracked, and tools/store-assets.ts is a stub that exits 1.

## Estimated builder-hours

| Task | Hours | Why |
|---|---|---|
| android | ≈ 2.5 | Adapter and journal, bridge, crash enumeration, browser harness, lifecycle, native share, icons, scripts, two Gradle builds of about 6 minutes each |
| perf2-polish | ≈ 2.5 | Two 15-minute measurement runs, before and after; the 45-minute tick time-box is optional |
| web-arcade | ≈ 1.75 | Two builds, the subpath/offline/iframe/demo e2e, and the full journey on two projects |
| store | ≈ 2.0 | Six topics × three device sizes of screenshots, documents, one Gradle build |

Wall time: stage 1 is about 2.5 h plus verification, and stage 2 about 2 h plus verification. Integration between them takes about 45 minutes. P4.14's quiet re-measure takes about 40 minutes, and the three-project e2e run takes about 2 hours.
