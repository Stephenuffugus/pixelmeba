# Wave 7a — P4.10 Android: report (2026-10-12)

Assignment: BUILD_DIRECTIVE P4.10 under g4-plan call 5 (D-0091) and D-0092. Nothing in src/sim was touched; no
version field, manifest, content or world schema changed. No git add/commit was run.

## Checklist

### Build

1. **FilesystemBackend**: DONE. `src/persistence/capacitorFs.ts`.
   - FsOps interface at :36. Names: `fsName`/`fsIdOf` at :65. A reversible encoding: `[a-z0-9-]` stay, every
     other UTF-8 byte becomes `_hh`. It is case-safe and never contains `:` `/` `\`.
   - Built-in base64 helpers. `toStorageError` at :156.
   - `FilesystemBackend` at :206:
     - `open` + `recover` at :219/:261: replay the journal, remove `*.tmp`, remove orphan records. Orphans are found
       by decoding file names, so no record is read at launch.
     - `commit` at :317 runs steps (a)–(d), serialized by one promise chain over every operation (reads included).
     - `usage` at :343.
   - `MemoryFsOps` at :380: `crashAfter`, `tear` (exact path or `dir/*`), `splitRename` (Android's
     remove-then-rename as two ops), `snapshotFiles`/`fromFiles`, `quotaBytes` (throws the Android ENOSPC text),
     `failNextWrite`, and an op `log`.
   - **Rename onto an existing target, as found:**
     - Android: Capacitor Filesystem 8.1.3 → ionfilesystem-android 1.1.0 `IONFILELocalFilesHelper.renameFile`
       (javap of the cached AAR) calls `destination.delete()`, then `File.renameTo`, then falls back to copy + delete.
       So the native rename already removes the target and is not atomic.
     - Web: `dist/esm/web.js` `_copy` reads the source, deletes it, then writes the target.
     - `FsOps.rename` therefore never removes anything itself. This is safe only because a slot file is replaced
       after the commit point and recovery rewrites it from the journal. The `splitRename` crash enumeration proves it.
   - **Out of space:**
     - Android rejects with `FilesystemErrors.operationFailed`: "'writeFile' failed with: <Java exception message>".
       `toStorageError` matches `ENOSPC|No space left on device|QuotaExceeded` and the name `QuotaExceededError`.
     - The exact device text of a full disk could not be produced here.
2. **Bridge**: DONE.
   - `src/persistence/fsPort.ts` PortFsOps at :53. It has one pending map and a 30 s timer per op. On timeout it
     sets `dead` (:86), and every later op rejects at once with "Saving is stopped until Pixelmeba is restarted…".
     Error names are kept, and out-of-space errors become StorageFullError.
   - `src/platform/fsHost.ts`:
     - `perform` at :40: readFile/writeFile (recursive, UTF-8)/rename/deleteFile/readdir/stat on Directory.Data.
       "Does not exist" is recognised by code `OS-PLUG-FILE-0008` or the text.
     - `serveFs` at :96, with an optional gate and an answered hook.
   - `src/worker/protocol.ts:74` ToWorker `'platform' { storage, port? }`. There is no PROTOCOL_VERSION bump.
   - `src/worker/client.ts`:
     - `sendPlatform` at :110 is called first in `SimClient.create` (:143), with the port in the transfer list.
     - `src/platform/capacitor.ts` `platformStorage()` (:25) answers 'filesystem' when `isNativePlatform()` or
       `VITE_FS_HARNESS === '1'`, else 'idb'.
     - `startFsHost` (:35) loads fsHost (or the harness) on demand, so the web bundle never loads the Filesystem
       plugin.
   - `src/worker/boot.ts`:
     - `chooseStore` at :16.
     - `filesystemEstimate` at :33: usage = the store's file bytes plus the WebView's usage; quota = the WebView's
       quota, or none.
   - `src/worker/sim.worker.ts`:
     - The worker now boots on its first message (:40). `boot(choice)` is at :49.
     - On 'filesystem' it uses `FilesystemBackend.open(new PortFsOps(port))`, `persistent` true, and the usage-based
       estimate passed to DishHost. That one argument covers the ring, the shelf and the Storage panel.
     - Any other first message boots IndexedDB as before and is then handled. Later 'platform' messages are ignored.
     - If the Filesystem store fails to open, boot falls back to MemoryBackend with persistent=false, as an IDB
       failure did.
3. **Lifecycle**: DONE.
   - `src/platform/lifecycle.ts`:
     - `pauseDishForBackground` at :37 is the one extracted handler: speed 0 when running, comparison
       `priorSpeed` → 0, one autosave.
     - `Lifecycle` at :47 acts once per absence. This matters because the WebView may also fire visibilitychange
       around a native pause.
     - `wireNativeLifecycle` at :83: App 'pause'/'resume', with @capacitor/app imported on demand.
   - `src/ui/main.tsx`:
     - `pauseForBackground` at :37 passes the real state signals.
     - Native → App pause/resume. 'resume' never changes the speed and calls `showToast` (always-mounted LiveRegion)
       with "Paused while Pixelmeba was in the background. No dish time passed." only when a dish was running.
     - The web keeps visibilitychange (:60).
   - Kill recovery needed no new code. It is proved by the crash-point tests and the e2e (below).
4. **Native share and files**: DONE.
   - `src/platform/nativeShare.ts`:
     - `shareNative` at :59: write to Directory.Cache `share/<name>` (base64 for PNG, UTF-8 otherwise), then
       `Share.share({ files:[uri], title, dialogTitle })`. On cancel, delete the file and reject.
     - `nativeShareEnv` at :85.
   - `src/ui/share.ts:253` `platformShareEnv()` is now the default of `deliverFile`. On the web it is
     `browserShareEnv()`, unchanged.
   - `src/ui/state.ts:579` `saveTextFile` body: on native it calls `void deliverFile(dishFile(text, filename,
     filename))`. I also added two import lines. **Note for the state.ts owner:** this creates a state.ts ↔ share.ts
     import cycle, which is safe because each side uses the other only inside function bodies.
   - Import is unchanged (`<input type=file>`). The picker note is in ANDROID_SETUP §10.8.8 and §11.
5. **Android project**: DONE.
   - `AndroidManifest.xml:44` adds VIBRATE. INTERNET and allowBackup="true" stay, with comments.
   - `res/values/styles.xml` adds `windowSplashScreenBackground` = `@color/ic_launcher_background` (#14252D) for the
     Android 12+ launch screen. The debug build linked it.
   - `capacitor.config.ts` is unchanged. Settings stay in localStorage.
6. **Harness**: DONE.
   - `src/platform/fsHarness.ts` `startHarnessHost` (:56) sets `window.__fsHarness`. It has `opsSoFar`, `stopAfter`,
     `corrupt` and `files`, plus two additions for the e2e: `read`, `log` and `idle`.
   - `opsSoFar` counts operations finished and answered. `stopAfter(n)` lets n more through to the plugin and holds
     every later one forever.
   - It is only reachable behind `import.meta.env.VITE_FS_HARNESS === '1'` in `startFsHost`. The normal build has no
     `__fsHarness`, checked by grep and by the e2e test.
7. **Icons and splash**: DONE.
   - `art/src/icons/appIcon.ts`:
     - Palette-indexed Px, built from palette names: rim, rimLight, water tones, wall, and Sunbead colours for the
       one colony.
     - Foreground `iconForeground()` (:114) is 54×54, drawn inside radius 16.5 cells, measured to every cell's
       farthest corner.
     - Legacy art is square or round on a 24-cell grid. `ICON_BACKGROUND` = P.outside #14252D.
   - `tools/android-icons.ts`:
     - `renderIcons` at :93, plus `--check`. pngjs, integer scales only.
     - mipmap foreground: 108/162/216/324/432 px. Legacy: 48/72/96/144/192 px.
     - 11 splash PNGs at the template's sizes, with the dish at most half the short side.
     - `values/ic_launcher_background.xml`.
     - `public/icons/icon-192.png` (×8), `icon-512.png` (×21, centred) and `maskable-512.png` (×9, centred). All
       opaque (RGB).
8. **Scripts**: DONE.
   - package.json gains `android:build:debug`, `android:build:release`, `android:keystore`, and `android:icons`
     (an extra one).
   - `tools/android-build.ts`:
     - Runs the web build + cap sync.
     - JDK 21 search: JAVA_HOME if it is 21, then sdkman `21*`, else the exact message.
     - SDK search: ANDROID_HOME → ANDROID_SDK_ROOT → local.properties → ~/android-sdk. The SDK is passed as env;
       local.properties is never written.
     - Runs Gradle, then prints the path, bytes, sha256, and aapt2 badging lines (APK) or the UNSIGNED line plus
       `jarsigner -verify` (AAB).
   - `tools/android-keystore.sh`:
     - `--out` is required. The path is resolved (`..`, relative and symlinked) and refused inside the repo with the
       exact message. An existing file is also refused.
     - Runs `keytool -genkeypair -v -keystore <path> -alias pixelmeba-upload -keyalg RSA -keysize 2048
       -validity 10000`, or prints it with `--dry-run`, then prints the four properties lines with placeholders.
     - No keystore was created.
9. **targetSdkVersion**: DONE. It stays 36.
   - Capacitor 8.5.2 template (`node_modules/@capacitor/cli/assets/android-template.tar.gz` → `variables.gradle`):
     `minSdkVersion = 24`, `compileSdkVersion = 36`, `targetSdkVersion = 36`. `@capacitor/android/capacitor/build.gradle`
     falls back to 36.
   - Play page (WebFetch, 2026-10-12): "Starting August 31 2026: New apps and app updates must target Android 16
     (API level 36) or higher to be submitted to Google Play". An extension to November 1, 2026 can be requested.
10. **docs/ANDROID_SETUP.md**: DONE.
    - §1 facts: permissions, allowBackup, saves, settings, icons, and both target-SDK readings.
    - §4 and §5 name `android:build:debug` and `android:keystore`. §8 names `android:build:release` and JDK 21's
      "jar is unsigned." wording.
    - New §9.1 is the dated evidence.
    - §10 owner items are rewritten, including the full device smoke test and the IndexedDB flip decision.
    - New §11 explains how the app saves, pauses and shares.

### Done when

- **backend-contract**: DONE. `tests/persistence/backend-contract.ts` holds one suite of 8 cases: save, predecessor
  + corrupt fallback, remove, list, ring, shelf, failed commit, out-of-space. `capacitor-fs.test.ts` runs it for
  MemoryBackend, FilesystemBackend(MemoryFsOps) and FilesystemBackend(MemoryFsOps, splitRename).
- **capacitor-fs crash points**: DONE.
  - Scenarios: slot save, checkpoint commit (with eviction), shelf commit, remove. Each runs × {atomic rename,
    remove-then-rename}.
  - Every cut k = 0…N, then a relaunch. The store holds exactly the old state iff k ≤ the journal rename's index, and
    exactly the new one otherwise. The predecessor is kept.
  - After open, no `*.tmp`, journal or orphan remains.
  - Every cut during that recovery is also tested and converges to the same state.
  - Also covered: the exact op order of a commit; a torn record/journal tmp is rejected by the read-back with the old
    save intact; a torn slot tmp after the commit point is repaired before the next op; damaged record files (empty,
    not JSON, wrong id, bad base64, valid base64 with bad gzip) fall back to the predecessor; `name()` round trip;
    base64; `usage()`; two concurrent commits serialize; a record id already on disk is never replaced.
- **fs-bridge**: DONE. `tests/platform/fs-bridge.test.ts`: a real MessageChannel and the real serveFs, with a fake
  plugin that uses Android's texts and code. It tests:
  - op order end to end;
  - missing files → null / [];
  - QuotaExceededError and Android ENOSPC → isStorageFull, with the old save intact;
  - other error names kept;
  - a 30 s timeout with fake timers: still pending at 29,999 ms, rejects at 30 s, `failed` set, the next commit
    refused before reaching the host, and a restart opens the old save.
- **boot**: DONE. `tests/worker/boot.test.ts`:
  - chooseStore: filesystem+port, idb, filesystem without a port → idb, and a non-platform first message → idb;
  - sendPlatform: a stamped message with the port transferred, or no port for idb;
  - filesystemEstimate.
- **lifecycle**: DONE. `tests/platform/lifecycle.test.ts` (fake App plugin, real preact signals):
  - pause → speeds [0], priorSpeed 0 with other fields kept, exactly one autosave, also when visibility fires too;
  - resume → no speed change and the line once;
  - a paused dish says nothing; no dish does nothing;
  - the web foreground never announces.
- **native-share**: DONE. `tests/platform/native-share.test.ts` (vi.mock of the two plugins):
  - picture base64 and .pixelmeba UTF-8 to CACHE `share/…`, shared by uri;
  - cancel → 'cancelled', toast unchanged, cache file deleted;
  - `saveTextFile` on native → share sheet;
  - the web env is `browserShareEnv`.
- **icons**: DONE. `tests/tools/android-icons.test.ts`: deterministic bytes, and disk == tool output; exact sizes for
  all 29 PNGs; the foreground stays inside the safe circle; opaque files have no alpha; every cell is a solid k×k
  block.
- **keystore**: DONE. `tests/tools/android-keystore.test.ts`: refusal for 5 spellings of in-repo paths, including a
  symlink and `../..`; a dry run outside prints the command and lines and creates nothing; no password flags.
- **e2e**: DONE. `tests/e2e/android-storage.spec.ts` + `tests/e2e/staticServer.ts`. Both desktop and phone-portrait
  passed (output below).
  - Port 5281, with a harness build in beforeAll.
  - Flow: Garden → run → Save to Slot 1 (moment A, via the UI) → measure one save → for every k < N: a new moment,
    `idle`, `stopAfter(k)`, saveSlot through the protocol, reload, Saved dishes → Slot 1 → Open.
  - Expected: the new moment iff the answered log contains Slot 1's journal rename, else the old one. The test also
    asserts this equals `k > commitAt` whenever nothing else interleaved, and that the "damaged" line is absent.
  - Then: corrupt the current record → the previous moment opens with the damaged line, and axe passes; then
    hidden → paused and autosaved, reload → Continue holds that moment.
  - Test 2 greps the normal build.
- **Debug APK / release AAB / targetSdk**: DONE. Details are below and in ANDROID_SETUP §9.1.
- **Boundary**: DONE.
  - eslint `@typescript-eslint/no-restricted-imports` on `src/**` except `src/platform/**` (eslint.config.js:117).
    It is a separate rule name, so it does not override the folder rules for src/sim, src/worker and src/render.
  - Proven with probe files I created in src/persistence and src/worker, which errored "ARCH §3: only src/platform
    imports @capacitor/* (P4.10)", then were deleted.
  - `git grep @capacitor/ -- src` shows no hit outside src/platform.
  - It does not see dynamic `import()`. None exists outside src/platform.
- **g2-replay, trajectory-fence and tests/persistence**: DONE. They pass unchanged.

## Files

- **New**:
  - src/persistence/{capacitorFs,fsPort}.ts
  - src/platform/{capacitor,fsHost,fsHarness,lifecycle,nativeShare}.ts
  - src/worker/boot.ts
  - art/src/icons/appIcon.ts
  - tools/{android-build,android-icons}.ts, tools/android-keystore.sh
  - public/icons/{icon-192,icon-512,maskable-512}.png
  - tests/persistence/{backend-contract.ts,capacitor-fs.test.ts}
  - tests/platform/{fs-bridge,lifecycle,native-share}.test.ts
  - tests/worker/boot.test.ts
  - tests/tools/{android-icons,android-keystore}.test.ts
  - tests/e2e/{android-storage.spec.ts,staticServer.ts}
  - this report
- **Changed**:
  - src/worker/{sim.worker,protocol,client}.ts
  - src/ui/main.tsx, src/ui/share.ts
  - src/ui/state.ts (saveTextFile body + 2 imports)
  - eslint.config.js (one block)
  - package.json (scripts)
  - android/app/src/main/AndroidManifest.xml, res/values/{styles,ic_launcher_background}.xml
  - 15 mipmap PNGs, 11 splash PNGs
  - docs/ANDROID_SETUP.md
- `npx cap sync android` (run by the build script) changed no tracked file.

## How the tests fail without their mechanism (mutations run here, then restored)

- **Journal replay at open disabled**: all 8 crash-enumeration tests and the torn-slot test fail (9 failed).
- **Read-back comparison disabled**: the torn record/journal test and the torn-slot test fail.
- **Orphan sweep disabled**: 6 crash tests and the torn test fail.
- **Serialization chain removed**: "two commits started together" fails. The first version of that test used
  SaveStore and passed without the chain, because gzip timing serialized it. It now calls `backend.commit` directly.
- **Timeout not marking the port dead**: the 30 s test fails.
- **Foreground drawn past the safe circle**: the safe-circle test fails, and the disk check fails as well.

## Commands and results

- `npx tsc -p tsconfig.json --noEmit` → clean (last run after the other agents' current edits).
- `npx eslint` on every file listed above plus src/persistence, src/worker, src/platform and eslint.config.js →
  clean.
- `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/persistence tests/platform tests/worker/boot.test.ts tests/tools/android-icons.test.ts tests/tools/android-keystore.test.ts tests/ui/share.test.ts tests/ui/challenge.test.ts`
  → `Test Files 27 passed (27)`, `Tests 241 passed (241)`, Duration 1009 s. This ran while other agents were busy,
  so the time is inflated. capacitor-fs alone is 42 tests in 8.4 s.
- `E2E_PORT=4281 E2E_OUTDIR=tmp/dist-android npx playwright test tests/e2e/android-storage.spec.ts --project=desktop --project=phone-portrait`
  → `4 passed (16.5m)`:
  - phone-portrait: "one save = 12 file operations, commit point at operation 7; cuts k=0..11 opened: old×8 new×4"
    (4.2 min);
  - desktop: "13 file operations, commit point at operation 7; cuts k=0..12 opened: old×8 new×5" (11.9 min).
  - Ports 4281 and 5281 were stopped before and after.
- `npm run android:build:debug`:
  - Gradle: `BUILD SUCCESSFUL in 1m 18s`.
  - APK: `android/app/build/outputs/apk/debug/app-debug.apk`, 8,568,278 bytes, sha256
    ed058b449f8802cb2d1f396c5cf53577fad951da1d03a92ec0f597b4baf90a95.
  - aapt2: `package: name='com.lucidwinds.pixelmeba' versionCode='1' versionName='1.0'`, `targetSdkVersion:'36'`.
  - Permissions: INTERNET, VIBRATE, `com.lucidwinds.pixelmeba.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`.
- `npm run android:build:release`:
  - Gradle: `BUILD SUCCESSFUL in 40s`.
  - AAB: `android/app/build/outputs/bundle/release/app-release.aab`, 6,233,377 bytes, sha256
    42583a0d4412d61a9440e5aeb9eba21d3df1c607578f7243df52e9d26eb4df78.
  - The UNSIGNED line was printed, and `jarsigner -verify` → `jar is unsigned.`. That is JDK 21's wording; the
    2026-09-27 run recorded `no manifest.`.
- `npx tsx tools/android-icons.ts --check` → "android-icons: every file matches".

## FENCE

None. Nothing in src/sim, content or the world schema was touched. The fence tests pass with the current working
tree, which includes other agents' in-flight src/sim edits.

## Noticed elsewhere (not changed)

- **Main-thread starvation under SwiftShader** (for perf2-polish). The web Filesystem implementation runs in
  IndexedDB on the main thread. With the dish screen open, each of its IndexedDB requests waits roughly one rendered
  frame, so one save took about 29 s in the harness on desktop: writes about 4 s, renames about 5 s. That suggests
  the renderer keeps the main thread busy even on a paused dish. On a phone the native plugin is used instead, but
  every bridge round-trip still lands on the main thread. This is the "autosave stutter" device item of D-0092
  (ANDROID_SETUP §10.8.4).
- **Fallback wording on Android.** When the Filesystem store cannot open, the worker falls back to memory (as with
  IndexedDB). The Saves screen then says "This browser is not keeping saves between visits…", which is web wording.
  An Android wording would be a small Saves.tsx change. That file is not mine.
- **Bundle size.** The main bundle now includes @capacitor/core (registerPlugin plus platform checks). The
  Filesystem, Share and App plugins are loaded on demand only on native. Measured `index-*.js` 1,078 kB in this
  working tree, which includes other agents' changes.

## Proposed decisions

- **PROPOSED DECISION: the file store uses a journal layout instead of ARCH §11.1's per-slot files.**
  - The layout is `records/`, `slots/` and `journal.json` (commit point), not `slots/<id>/{current,previous}.json`
    + `current.tmp`.
  - Reason: SaveStore, the checkpoint ring and the shelf commit several records and pointers as one atomic unit
    (D-0013's reason). The predecessor is still kept through SaveStore's `previous` pointer.
  - Suggested ARCH §11.1 text for the lead: "Android (D-0092): Capacitor Filesystem in Directory.Data/pixelmeba/:
    records/<name>.json, slots/<name>.json, journal.json. A commit writes each record tmp → reads it back → renames
    it, writes journal.tmp → reads it back → renames it to journal.json (the commit point), applies the slot
    pointers the same way, deletes, and removes the journal. Open re-applies a journal, removes *.tmp and orphan
    records."
- **PROPOSED DECISION: a failure after the commit point still resolves the commit.**
  - Once journal.json exists the commit is durable, so `commit` resolves.
  - The rest is applied before the next operation of the backend, or at the next open.
  - If the journal rename itself times out, it is ambiguous. The commit rejects, but the save may still appear at
    the next launch. Either way the previous save is intact.
- **PROPOSED DECISION: Android exports go through the share sheet.**
  - Every export on Android is offered through the system share sheet. "Save to Files" and Drive are among its
    targets.
  - No storage permission is requested.
- **PROPOSED DECISION: settings stay in WebView localStorage on Android.**
  - WebView localStorage is the app's private data, like IndexedDB.
  - ARCH §11.1's "Settings only in Preferences" is a deviation for the owner to confirm.
- **PROPOSED DECISION (owner item): `android:allowBackup="true"` stays.**
  - The player's own Android backup may restore their saves on a new phone.
  - Pixelmeba sends nothing.
- **PROPOSED DECISION: the interruption harness is a separate build, never shipped.** It is the VITE_FS_HARNESS=1
  build, and a test proves the normal dist has no "__fsHarness".
- **PROPOSED DECISION: the storage estimate on Android.**
  - usage = the store's own file bytes + the WebView's usage.
  - quota = the WebView's quota (Chromium derives it from the disk), or none.
  - With no quota, the preflight is skipped, the Storage panel says "Storage use is not available…", and the
    store's own ENOSPC → StorageFullError still keeps everything.
- **PROPOSED DECISION: when a shared file is removed.**
  - A shared cache file is removed at once when the player cancels.
  - After a completed share it stays until the next share starts. The receiving app (Drive, Gmail) may still read
    the content URI after the sheet closes. The system may also clear the cache.
  - This deviates from "removed afterwards".
- **PROPOSED DECISION: the file-name encoding.** `[a-z0-9-]` plus `_hh` per other byte, instead of full hex. It is
  readable in the harness, case-safe, reversible, and never contains `:` `/` `\`.
- **PROPOSED DECISION: the Android 12+ launch screen.** Set `windowSplashScreenBackground` to #14252D, so the system
  launch screen (launcher icon on a colour) matches the splash images.
- **PROPOSED DECISION: an extra `android:icons` npm script** regenerates every launcher, splash and web icon. It has
  `--check`.
- **Note for the lead:** the worker now boots on its first message instead of at module load. Every client message
  carries the protocol stamp. A worker that never receives a message never opens a store.
