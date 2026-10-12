# Wave 7b — P4.12 Store readiness: report (2026-10-12)

Assignment: BUILD_DIRECTIVE P4.12 plus the v1.0 gate's "store assets" and "D9 §12 usability gates are owner
tasks — list them". Nothing in `src/sim`, `content/`, the manifest, a world schema or a version field other
than the app version was touched. No git add/commit was run. All browser work used port 5284
(`tmp/dist-store`) and the e2e used 4284; both were stopped by port after each run.

## Checklist

### Build

1. **Version, one source** — DONE.
   - `package.json` "version" `1.0.0`; `src/persistence/appVersion.ts:7` `APP_VERSION = '1.0.0'` (plain constant).
   - `android/app/build.gradle:3-15` parses `../package.json` with `groovy.json.JsonSlurper`, sets
     `versionName` = version and `versionCode = major*10000 + minor*100 + patch` (`:33-34`), and throws a
     `GradleException` with a clear message when the version is not `x.y.z` or minor/patch > 99.
   - Proof: `aapt2 dump badging` of the new APK says `versionCode='10000' versionName='1.0.0'` (ANDROID_SETUP §9.2).
   - `tests/tools/version-scheme.test.ts` (3 tests): APP_VERSION = package.json; the formula incl. 10000/10001/
     10100/10203/29999 and the refusals; build.gradle's JsonSlurper line, the arithmetic, the >99 guard and that the
     only `versionCode`/`versionName` lines are the derived ones. **Fails without the mechanism:** replacing
     `versionCode appVersionCode` by `versionCode 1` → "1 failed | 2 passed" (restored, rerun green).
   - `tests/ui/comprehension-labels.test.ts` still passes (in the 71-test run below).
2. **Store icon** (`--only icon`) — DONE. `tools/store-assets.ts:114` `renderStoreIcons()`:
   - `store/icon-512.png`: the launcher art (`iconComposite()` cropped to the dish's 32-cell box) ×12
     nearest-neighbour = 384 px centred on `#14252D`, full square, no text, no rounded corners, RGBA with every
     alpha 255.
   - `store/icon-foreground-512.png` (the 54-cell adaptive canvas ×9, transparent outside) and
     `store/icon-background-512.png` (solid `#14252D`, RGB).
   - Play page read 2026-10-12 with WebFetch (support.google.com/googleplay/android-developer/answer/9866151):
     icon "32-bit PNG (with alpha)", "Dimensions: 512px by 512px", "Maximum file size: 1024KB" (ours 3,322
     bytes). PROPOSED DECISION 1 below.
3. **Feature graphic** — DONE. `tools/lib/storeShots.ts:753` `featureGraphic`:
   - Garden run at 4× in the built app, paused (tick 1549, stateHash `5526b56ed7b4acda`, seed 104729).
   - More → Share… → Picture, Hide labels → Share downloads the D-0080 1,080 × 1,080 picture (kept as
     `store/feature-source-picture.png`). The tool checks the world hash is unchanged by the share.
   - A Playwright page composes it: the surround, the picture's pixels (324, 317) 280 × 250 drawn at ×2 nearest
     neighbour, centred on the busiest 16-cell square's organisms (`busiestPoint`, `:723`), a 6 px rim edge, the
     wordmark and the promise line (one sentence per line).
   - Re-encoded as 24-bit RGB (the tool refuses any non-opaque pixel), 1024 × 500.
   - Provenance is in `store/screenshots/manifest.json` "feature".
4. **Screenshots** — DONE (`tools/lib/storeShots.ts`; production build, `serviceWorkers: 'block'`, prompts and
   performance numbers off). 18 files = 3 classes × 6 topics, each with `{topic, file, size, viewport,
   deviceScaleFactor, deviceClass, buildCommit, recipe, saveFile, seed, tick, stateHash, shows, steps, sha256}`.
   Ticks and hashes are read from the app's own worker (wrapper + read-only 'hash' request).
   - 01 living dish: the Garden at 4× past 1:30, paused. Whole dish, then the busiest square dragged to the centre
     and Zoom in ×2.
   - 02 simple actions: the busy part dragged above where the tray will sit, Run at 4×, Feed tray open. Captured
     while running; tick = the snapshot on screen; no hash.
   - 03 What if?: More → What if? → R-G3 chosen with its before/after preview.
   - 04 inspection: an active, isolated organism dragged to the centre, Zoom in ×2, tapped. The inspector keeps it
     in view; on the phone, when the constraint line is below the fold, the player's Collapse shows heading +
     constraint.
   - 05 a real inherited change: `tests/fixtures/saves/first-dish-accelerated-varied-t6000.pixelmeba.gz`.
     - The tool loads it in Node and checks the branch evidence: branch `29A` (Sunbead) is established at tick
       5272, not extinct, trait `{"kind":"module","module":"E05","gained":true}`, 7 alive.
     - It then imports the save through Saved dishes → Import and saves it as "Accelerated Garden" (the fixture's
       own name starts "g2 …"; this is a slot pointer only).
     - Then it centres a member of 29A, zooms in, taps until a member answers, and goes Family → Family tree →
       "Branch established" → Compare with ancestor.
     - The hash at capture is `ee073c6c27155294` = `expected.json` hashAtLoad for that save. That proves it is the
       recorded run, unedited.
   - 06 an experiment: Notebook → Experiments → EXP_A → Start → Run → fastest → complete at 3:00 (tick 1800 both
     copies). Copy A is shown on a phone and the results are scrolled into view.
   - Sizes: phone 1080 × 1920 (360 × 640 @3). Tablets are 9:16 instead of the assignment's 5:8: 7-inch
     1152 × 2048 (576 × 1024 @2) and 10-inch 1440 × 2560 (720 × 1280 @2). See PROPOSED DECISION 2.
   - No text overlays.
5. **store/listing.md** — DONE.
   - Contents: name; short description (61 chars, the promise line); full description 2,632 chars on the shipped
     scope. It claims 19 organisms (fungi, a phage and a parasite named only as existing organisms), 3 habitats,
     4 curated dishes, 14 experiments, What if?, Compare, goals, favorites, story cards, bookmarks, gallery,
     challenges, share, and saves.
   - Also: feature table, supported devices (Android 7.0+/minSdk 24, phones and tablets), save/export behaviour,
     the fictional-simulation note, category Games › Simulation (alt. Educational), tags, contact placeholder,
     captions, and release notes (310 chars; also `store/release-notes-1.0.0.md`).
   - `tests/tools/listing.test.ts` (4 tests) checks:
     - the length limits;
     - the promise line and the note;
     - the forbidden words "superior", "advanced", "perfect", "real biology", "scientifically accurate",
       "adapted", "immune";
     - 27 Phase 5–7 feature words;
     - every species name the manifest does not enable;
     - that every count claimed matches content.
   - **Fails without the mechanism:** adding "Watch day and night pass with advanced cells." → "1 failed"
     (restored, green).
6. **PRIVACY_POLICY.md** — DONE (repo root; rendered by `privacyPolicyHtml` `tools/store-assets.ts:193` to
   `store/privacy-policy.html`: no script, no external request). It says:
   - nothing is collected, and there are no accounts, ads, analytics or crash SDK;
   - saves stay in app storage, uninstall deletes them, and Android's own backup (`allowBackup`) may copy them,
     stated plainly;
   - sharing happens only through the share sheet when the player chooses, with what each artifact contains;
   - the six Capacitor plugins are named; INTERNET is declared by the framework and unused (pending a device
     test); VIBRATE is for haptics;
   - children; changes; effective date; contact placeholder.
7. **data-safety / content-rating / smoke-test** — DONE.
   - `store/data-safety.md`: question by question (collected No, shared No, encryption/deletion not applicable,
     MASA review No), with reasons checked in code. The only `fetch` in `src/` is `src/ui/atlas.ts`, which loads
     the bundled manifest.
   - `store/content-rating.md`: the IARC answers with reasons; expected Everyone / PEGI 3 / USK 0 / IARC 3+;
     target-audience note.
   - `store/smoke-test.md`: 16 numbered steps with what to see, including airplane-mode launch, background pause,
     force-stop, export/import, share, rotate, 200 % font, TalkBack, the 15-minute heat/frame-rate readings and
     process death during a save.
8. **About** — DONE.
   - `src/ui/strings/about.ts:32` `ABOUT_TEXT` holds the accessibility statement and the privacy line (exact
     wording from the assignment).
   - `src/ui/views/SimplePage.tsx:22-33` renders both as `.about-statement` paragraphs (testids
     `about-accessibility`, `about-privacy`).
   - `src/ui/app/App.tsx` About body: the two "saved only on this device / Nothing is uploaded" sentences are
     removed, so where saves live is said once.
   - One appended `.about-statement` block in `src/ui/styles.css`.
   - Every claim in the statement exists: `src/ui/a11y/DishSummary.tsx`, `CellDescription.tsx`, Settings Reduced
     motion, Quiet audio, Simplified overlay colours, `TEXT_SCALES` up to 2.
9. **docs/PLAY_STORE_CHECKLIST.md** — DONE.
   - Play's asset rules are quoted with the read date.
   - §A rows are ticked, each with its proof. The INTERNET permission is still open.
   - §B is rewritten into B1–B12 numbered owner steps:
     - B1 account and identity;
     - B2 create the app (Game, Paid, $0.99, countries);
     - B3 hosting the privacy policy (Lucid Winds site or GitHub Pages steps) and pasting the URL;
     - B4 every App content declaration with its answer;
     - B5 signing, keystore, version bump and `android:build:release` + jarsigner;
     - B6 device tests on a named phone (smoke test, perf-rc1 OWNER DEVICE items, ANDROID_SETUP 8.1–8.13,
       INTERNET removal test, icon look, D-0092 store choice);
     - B7 Internal testing and the Pre-launch report;
     - B8 listing upload;
     - B9 the D9 §12 gates with their exact protocol and pass counts;
     - B10 the arcade choice (full or DEMO_MODE) and the demo's store link;
     - B11 promote and launch;
     - B12 every "Owner review: yes" decision since g3 (D-0064, D-0065, D-0066, D-0067, D-0068, D-0074, D-0079,
       D-0082, D-0083, D-0087, D-0091, D-0092, D-0093, D-0094, plus this stage's) pointing to EXPANSION_RESPONSE §8.
10. **docs/ANDROID_SETUP.md** — DONE. Changes: the §1 version rows, a §7 rewrite (the single source), §10 items 3
    and 5 refreshed, and a new item 10 pointing to the checklist.
    - New dated §9.2 records `npm run android:build:debug` on this tree: `BUILD SUCCESSFUL in 2m 26s`; APK
      8,246,560 bytes; sha256 `67c00bf4b3756a52426caf0e5c138b6063b724ad26a80c964e123bf9290ff0dd`.
    - aapt2: versionCode 10000, versionName 1.0.0, targetSdkVersion 36, permissions INTERNET, VIBRATE and
      DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION, icon `res/mipmap-anydpi-v26/ic_launcher.xml`.

### Done when

- **`npm run store:assets` (no flags) regenerates everything into store/ and exits 0** — DONE.
  - The no-flag run built `tmp/dist-store` and wrote the privacy page, the icons, the feature graphic (tick 1549)
    and all 18 screenshots, ending with "wrote store/screenshots/manifest.json (18 screenshots + the feature
    graphic)" and `EXIT 0`. It took about 23 minutes on the shared 2 CPUs (18:25–18:48 UTC).
  - After looking at the images I changed three topics: the phone 04 Collapse, 06 showing copy A, and the tablet
    03 scroll. I reran them with `--only screenshots --topics 03,04,06 --no-build` → `EXIT 0` (manifest merged,
    still 18 shots).
  - `--only icon|feature|screenshots` (with `--classes`, `--topics` and `--no-build`) were each run in this
    session.
- **tests/tools/store-assets.test.ts** — DONE, 8 tests. It checks:
  - the icon run is byte-deterministic and store/ holds exactly those bytes;
  - icon-512 is RGBA, every alpha 255, has surround-coloured corners and integer-scale blocks;
  - the adaptive layers;
  - privacy-policy.html equals the render of PRIVACY_POLICY.md and the policy's key lines;
  - the feature graphic is 1024 × 500 with colour type 2 (no alpha), and has its provenance and source picture
    sha;
  - per class, 6 topics at the exact 9:16 size, colour type 2, and a manifest record with matching sha256,
    viewport, DPR, commit, recipe, seed 104729, tick, a hash for every paused capture, and the 05 save file.
  - **Fails without the mechanism:** overwriting icon-512 with the background layer and phone/01 with phone/02 →
    "2 failed | 6 passed" (restored, 8 passed).
- **tests/tools/{version-scheme,listing}.test.ts pass** — DONE (see above).
- **tests/e2e/about.spec.ts on desktop AND phone-portrait** — DONE, 4 passed (34.4 s).
  - It checks Home → About shows version 1.0.0 (read from package.json), the content hash, the accessibility
    statement, the privacy line, that it is said once, and the fictional note.
  - Text is ≥ 16 px; `expectNoSeriousA11yViolations`; `expectNoHorizontalOverflow`.
  - At 200 % text: Back is reachable at 48 px, both statements are whole, nothing scrolls sideways, and axe is
    clean.
- **PRIVACY_POLICY.md, store/{listing,data-safety,content-rating,smoke-test}.md exist; checklist owner items with
  exact instructions; ANDROID_SETUP §9 dated build result** — DONE.

## Files

- **Created:**
  - `tools/lib/storeShots.ts`, `PRIVACY_POLICY.md`
  - `tests/tools/store-assets.test.ts`, `tests/tools/version-scheme.test.ts`, `tests/tools/listing.test.ts`,
    `tests/e2e/about.spec.ts`
  - `store/`: `icon-512.png`, `icon-foreground-512.png`, `icon-background-512.png`, `feature-1024x500.png`,
    `feature-source-picture.png`, `privacy-policy.html`, `listing.md`, `release-notes-1.0.0.md`,
    `data-safety.md`, `content-rating.md`, `smoke-test.md`, and `screenshots/{phone,tablet7,tablet10}/0[1-6]-*.png`
    plus `screenshots/manifest.json` (6.1 MB in all)
  - this report
- **Changed:**
  - `tools/store-assets.ts` (the stub replaced)
  - `package.json` ("version" only)
  - `src/persistence/appVersion.ts`
  - `android/app/build.gradle` (the version lines plus the parse block above them)
  - `src/ui/strings/about.ts` (appended `ABOUT_TEXT`)
  - `src/ui/views/SimplePage.tsx`
  - `src/ui/app/App.tsx` (the About body string only)
  - `src/ui/styles.css` (one appended block)
  - `docs/PLAY_STORE_CHECKLIST.md`
  - `docs/ANDROID_SETUP.md`
- `art/src/icons/featureGraphic.ts` was not needed.

## Commands and results

- `E2E_PORT=4284 E2E_OUTDIR=tmp/dist-store npx playwright test tests/e2e/about.spec.ts --project=desktop --project=phone-portrait` → `4 passed (34.4s)`.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/tools/version-scheme.test.ts tests/tools/listing.test.ts tests/ui/comprehension-labels.test.ts` → `Test Files 10 passed (10)`, `Tests 71 passed (71)` (1039 s, under load).
- `npx vitest run tests/tools/store-assets.test.ts tests/tools/version-scheme.test.ts tests/tools/listing.test.ts` → `Test Files 3 passed (3)`, `Tests 15 passed (15)`.
- `npm run store:assets` → EXIT 0 (above); `npx tsx tools/store-assets.ts --only screenshots --topics 03,04,06 --no-build` → EXIT 0.
- `npm run android:build:debug` → `BUILD SUCCESSFUL in 2m 26s` (§9.2).
- `npx tsc -p tsconfig.json --noEmit` → clean.
- `npx eslint` on every file I own or touched → clean.

## FENCE

None. No sim, content or manifest change. The fence, g2-replay, conservation and determinism files pass.

## Bugs noticed elsewhere (not mine to fix)

1. **Lab → Observe → Family tree can stay on "Reading the family tree…" forever.**
   - Cause: `src/ui/panels/LabTray.tsx` ObserveActions `lab-lineage` sets `sheet.value = 'lineage'` without
     `refreshLineage()`/`openLineage()`.
   - On a freshly opened or imported dish that is paused, `lineage.value` is null and nothing refreshes it.
     Reproduced: import `first-dish-accelerated-varied-t6000`, Lab → Observe → Family tree, 120 s, still "Reading…".
   - Fix: `onClick={() => { labTray.value = null; void openLineage(); }}`. The a11y-screens spec does not catch it
     because it only checks the sheet is visible.
   - The store run reaches the tree through the inspector instead (Family → Family tree, which calls `openLineage`).
2. Not a bug, noted for the record: Run always restarts at 1× (`togglePause` → `setSpeed(1)`), so a journey that
   pauses and resumes must re-choose 4×.

## PROPOSED DECISIONS

1. **Store icon: a 32-bit RGBA PNG with every pixel opaque.** The checklist said "32-bit PNG, no alpha" and Play
   says "32-bit PNG (with alpha)"; an RGBA file with alpha 255 everywhere meets both. The dish is drawn ×12
   (384 px, 75 % of the square), centred on the surround, so Play's rounded mask never touches it.
2. **Tablet screenshots in 9:16**: 7-inch 1152 × 2048 (576 × 1024 @2) and 10-inch 1440 × 2560 (720 × 1280 @2),
   instead of 1200 × 1920 and 1600 × 2560. Play's large-screen guidance (read 2026-10-12) says "Use a 16:9 aspect
   ratio for landscape and a 9:16 aspect ratio for portrait" and "Upload screenshots between 1,080 and 7,680px".
   The 5:8 sizes are uploadable but miss that guidance. The phone stays 1080 × 1920 ("three 9:16 portrait
   screenshots (minimum 1080x1920px)" for games' large-format eligibility).
3. **Screenshot 05 comes from the g2 fixture save.**
   - Uses `first-dish-accelerated-varied-t6000` branch 29A (gained E05), verified in the save and by its
     hashAtLoad.
   - The dish is renamed "Accelerated Garden" by an ordinary Save to a slot, because the fixture's name starts
     with "g2".
   - No new save was created; `store/screenshot-saves/` is not needed.
4. **Framing by player actions only:** drags, the Zoom in button, Collapse inspector, and the A/B switch. No
   camera hook, no injected state. The family rings on 05 are the inspector's real Family answer.
5. **The feature graphic draws the real picture at ×2** (integer, nearest neighbour), cropped around the busiest
   organisms, so they read at listing size. The whole 896 px dish cannot fit 500 px at an integer scale.
6. **One version source.** `package.json` "version" with `APP_VERSION` kept equal by a test. The RC is only the
   git tag; a re-upload of the same RC bumps the patch (ANDROID_SETUP §7).
7. **About says where saves live once, in the privacy line.** The old body sentences "Your dishes are saved only
   on this device. Nothing is uploaded." are removed.

## Notes for the lead

- The screenshots record `buildCommit` `33a2a62+dirty` because this wave is uncommitted. Regenerate after the
  wave-7b commit (`npm run store:assets`, about 25–45 min) if the store set should name the release commit.
- `tests/e2e/a11y-screens.spec.ts` "wave 7a" test: About is a new screen to add.
- The web-arcade builder's P4.11 edits (DishScreen DEMO_MODE, SW registration) were in the tree during both store
  runs and the Android build.
