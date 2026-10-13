# ANDROID_SETUP — building Pixelmeba for Android

Pixelmeba ships on Android as a Capacitor 8 shell around the static web build in `dist/`
(ARCHITECTURE §12). This page is the owner's recipe for debug and release builds on your own
machine, plus a record of what was verified in the build environment.

## 1. Project facts (from the generated `android/` project)

| Item | Value | Where it lives |
|---|---|---|
| Application ID | `com.lucidwinds.pixelmeba` | `capacitor.config.ts`, `android/app/build.gradle` |
| App name | `Pixelmeba` | `capacitor.config.ts`, `android/app/src/main/res/values/strings.xml` |
| Web assets | `dist/` → `android/app/src/main/assets/public` (copied by `cap sync`; gitignored) | `capacitor.config.ts` `webDir` |
| Scheme | `https://localhost`, `allowMixedContent: false`, no remote `server.url` | `capacitor.config.ts` |
| Capacitor | 8.5.2 (`@capacitor/android`, `@capacitor/cli`) | `package.json` |
| Plugins synced | app 8.1.1, filesystem 8.1.3, preferences 8.0.1, share 8.0.2, splash-screen 8.0.2, status-bar 8.0.3 | `package.json` |
| Gradle wrapper | 8.14.3 | `android/gradle/wrapper/gradle-wrapper.properties` |
| Android Gradle Plugin | 8.13.0 (default build-tools 35.0.0) | `android/build.gradle` |
| `minSdkVersion` | 24 | `android/variables.gradle` |
| `compileSdkVersion` | 36 | `android/variables.gradle` |
| `targetSdkVersion` | 36 | `android/variables.gradle` |
| `versionName` | `1.0.0` = `package.json` "version" (the one source; P4.12) | `package.json`, read by `android/app/build.gradle` |
| `versionCode` | `10000` = major*10000 + minor*100 + patch, computed by Gradle from `package.json` (§7) | `android/app/build.gradle` |
| Permissions | `INTERNET` (template), `VIBRATE` (P4.10, D-0064 haptics; a normal permission, no prompt) | `android/app/src/main/AndroidManifest.xml` |
| `allowBackup` | `true` (the player's own Android backup may carry saves to a new phone; Pixelmeba sends nothing) | `AndroidManifest.xml` |
| Saves | Capacitor Filesystem, `Directory.Data/pixelmeba/` (D-0092): `records/`, `slots/`, `journal.json` | `src/persistence/capacitorFs.ts` |
| Settings, journal, badges | WebView `localStorage` (the app's private data, like IndexedDB) | `src/ui/settings`, `src/ui/journal.ts` |
| Launcher icon, splash | generated from `art/src/icons/appIcon.ts` by `npm run android:icons` | `android/app/src/main/res/` |

**Google Play target API.** The Play page
(<https://developer.android.com/google/play/requirements/target-sdk>, read 2026‑09‑27 and again
2026‑10‑12) says: "Starting August 31 2026: New apps and app updates must target Android 16 (API level
36) or higher to be submitted to Google Play" (Wear OS / Automotive / TV / XR have lower floors; an
extension to November 1, 2026 can be requested). Capacitor 8.5.2's own template default is the same:
`node_modules/@capacitor/cli/assets/android-template.tar.gz` → `variables.gradle` has
`minSdkVersion = 24`, `compileSdkVersion = 36`, `targetSdkVersion = 36` (and
`node_modules/@capacitor/android/capacitor/build.gradle` falls back to 36). `targetSdkVersion = 36` meets
that today. **Check that page again at submission time**;
the requirement moves every year. To raise it, change `compileSdkVersion`/`targetSdkVersion` in
`android/variables.gradle` and install the matching `platforms;android-NN` package.

## 2. What you need installed

- **JDK 21.** Gradle 8.14.3 runs on Java up to 24 only; Gradle's compatibility table puts Java 25
  support at Gradle 9.1.0. On JDK 25 this build fails immediately (exact error in §9). Any JDK 21
  works (Temurin, Microsoft, Zulu, or Android Studio's bundled JDK). Check it with `java -version`,
  and set `JAVA_HOME` to it for command-line builds.
- **Node.js ≥ 24** and npm (the repo's `engines` field).
- **Android SDK**, either route:
  - **Android Studio** (Capacitor 8 needs Android Studio 2025.2.1 or newer). In *Settings ›
    Build, Execution, Deployment › Build Tools › Gradle › Gradle JDK*, choose a JDK 21. Open the
    project with `npx cap open android`. Studio writes `android/local.properties` (`sdk.dir=…`),
    which is gitignored.
  - **Command-line tools only** (what was used in §9):
    ```bash
    export ANDROID_HOME="$HOME/android-sdk"
    mkdir -p "$ANDROID_HOME/cmdline-tools"
    # Download the current "Command line tools only" zip for your OS from
    # https://developer.android.com/studio#command-tools, then:
    unzip commandlinetools-<os>-<build>_latest.zip -d "$ANDROID_HOME/cmdline-tools"
    mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
    yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$ANDROID_HOME" --licenses
    "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$ANDROID_HOME" \
      "platform-tools" "platforms;android-36" "build-tools;35.0.0"
    ```
    Command-line tools 23.0 print a warning that `sdkmanager` is deprecated in favour of
    `android sdk`. The commands above still worked, including the license step.
    If you don't export `ANDROID_HOME`, put `sdk.dir=/absolute/path/to/android-sdk` in
    `android/local.properties`.
- SDK packages this project needs: `platform-tools`, `platforms;android-36` (= `compileSdkVersion`),
  and `build-tools;35.0.0` (AGP 8.13.0's default; Gradle downloads it itself if it is missing and
  the licenses are accepted).

## 3. First-time setup from a fresh clone

```bash
npm ci
npm run build                 # typecheck + vite build → dist/
npx cap sync android          # copies dist/ and regenerates the plugin glue (see below)
```

Or run `npm run android:sync`, which does `npx vite build` then `npx cap sync android`, exits
non-zero if either step fails, and then says whether a JDK 21 and an Android SDK are visible.
It does **not** typecheck, so run `npm run build` (or `npm run check`) before release builds.

`android/capacitor-cordova-android-plugins/`, `android/app/src/main/assets/public/` and the
generated `capacitor.config.json`/`capacitor.plugins.json` are gitignored, so **always sync after
cloning and after every web change**. Otherwise Gradle fails or packages stale web assets.
Sync also rewrites `android/capacitor.settings.gradle` and `android/app/capacitor.build.gradle`.
Those two are committed, so review and commit them when a plugin is added or updated.

## 4. Debug build

```bash
npm run android:build:debug   # P4.10: vite build + cap sync android + ./gradlew assembleDebug on a JDK 21
```

`tools/android-build.ts` finds a JDK 21 (`JAVA_HOME` when it is 21, else
`/usr/local/sdkman/candidates/java/21*`; otherwise it stops with "Gradle 8.14.3 needs JDK 21; set JAVA_HOME
(docs/ANDROID_SETUP.md §2)") and the SDK (`ANDROID_HOME`, `ANDROID_SDK_ROOT`, `android/local.properties`, else
`~/android-sdk`; it passes the SDK to Gradle as `ANDROID_HOME` and never writes `local.properties`). It then prints
the APK's path, size, sha256 and the `aapt2 dump badging` lines (package, versions, SDK levels, permissions).
By hand, the same build is:

```bash
cd android
./gradlew assembleDebug       # Windows: gradlew.bat assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk` (signed with the auto-generated debug
key in `~/.android/debug.keystore`; it can't be uploaded to Play).

Install and launch on a device with USB debugging on:

```bash
export PATH="$ANDROID_HOME/platform-tools:$PATH"   # adb lives here on the command-line-only route
adb install -r app/build/outputs/apk/debug/app-debug.apk
# or, from the repo root: npx cap run android
```

## 5. Upload keystore (owner only; never commit it)

Play App Signing (§8) means Google holds the key that signs what users install. You hold only an
**upload key**. Create it once, **outside the repository**, and back it up (along with its
passwords) somewhere other than this machine. The script refuses any path inside the repository
(resolved, so `..` and symlinks do not get round it), lets `keytool` ask for the passwords (it never
stores or prints one), and prints the four `keystore.properties` lines of §6 with password placeholders:

```bash
npm run android:keystore -- --out /path/outside/repo/pixelmeba-upload.jks
npm run android:keystore -- --out /path/outside/repo/pixelmeba-upload.jks --dry-run   # prints the command only
```

which runs:

```bash
keytool -genkeypair -v \
  -keystore /path/outside/repo/pixelmeba-upload.jks \
  -alias pixelmeba-upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` asks for a store password, a key password and your name/organisation. The repo's
`.gitignore` already excludes `*.jks`, `*.keystore` and `keystore.properties`, but the keystore
still belongs outside the repo.

## 6. Signing configuration

Create **`android/keystore.properties`** (gitignored; `rootProject` is `android/`):

```properties
storeFile=/path/outside/repo/pixelmeba-upload.jks
storePassword=<store password>
keyAlias=pixelmeba-upload
keyPassword=<key password>
```

`storeFile` may be absolute (recommended) or relative to `android/`.

`android/app/build.gradle` is already wired to read that file. For reference, the wiring is:

```groovy
def keystorePropertiesFile = rootProject.file('keystore.properties')
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.withInputStream { stream -> keystoreProperties.load(stream) }
}

android {
    // ...
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile rootProject.file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            if (keystorePropertiesFile.exists()) {
                signingConfig signingConfigs.release
            }
            minifyEnabled false
            // ...
        }
    }
}
```

Without `keystore.properties`, `bundleRelease` still succeeds but produces an **unsigned** AAB,
which Play rejects. Debug builds ignore the file.

## 7. Versioning

**One source: `package.json` "version"** (P4.12). Everything else is derived from it or checked against it:

- `android/app/build.gradle` parses `../package.json` with `groovy.json.JsonSlurper` and sets
  `versionName` = that version and **`versionCode = major*10000 + minor*100 + patch`**. It stops the build
  with a clear message when the version is not `major.minor.patch` or when `minor` or `patch` is above 99 (the
  formula's cap).
- `src/persistence/appVersion.ts` `APP_VERSION` (written into every `.pixelmeba` and recipe file's metadata,
  shown in About) is a plain constant that must equal it; `tests/tools/version-scheme.test.ts` fails when they
  differ, and checks the formula and the Gradle lines.

| Release | `package.json` "version" = `versionName` | `versionCode` |
|---|---|---|
| 1.0.0 | `1.0.0` | `10000` |
| 1.0.1 | `1.0.1` | `10001` |
| 1.1.0 | `1.1.0` | `10100` |
| 1.2.3 | `1.2.3` | `10203` |

To change the version, edit `package.json` "version" and `APP_VERSION` together, then run
`npx vitest run tests/tools/version-scheme.test.ts`. Every upload to any Play track must have a higher
`versionCode` than the last one. The release candidate is only the git tag `v1.0.0-rc1` (the app says 1.0.0);
to upload a second build of the same release candidate, bump `patch` (1.0.1 → 10001).

## 8. Release build (AAB for Google Play)

```bash
npm ci
npm run check                 # typecheck + lint + unit tests (android:build:* does not typecheck)
npm run android:build:release # vite build (no source maps) + cap sync android + ./gradlew bundleRelease on a JDK 21
```

The script prints the AAB's path, size and sha256 and runs `jarsigner -verify` on it. Without
`android/keystore.properties` it also prints "UNSIGNED: Google Play rejects this file. Create the upload key
(npm run android:keystore) and android/keystore.properties (docs/ANDROID_SETUP.md §5-§6)." A release bundle carries
no source maps (D-0100): the app never loads them, and they made up 2.45 MB of the 6.26 MB bundle. The script builds
the web app with `--sourcemap false` and stops if dist/ still holds a map. The debug build keeps them for
chrome://inspect on a phone. By hand:

```bash
npx tsc -p tsconfig.json --noEmit
npx vite build --sourcemap false
npx cap sync android
cd android
./gradlew bundleRelease       # Windows: gradlew.bat bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`. Check that it is signed:
`jarsigner -verify -verbose:summary app/build/outputs/bundle/release/app-release.aab` should end
with `jar verified.` and name your upload certificate. If it says `no manifest.` or `jar is unsigned.`
(JDK 21's wording), the AAB is unsigned; see §6. (`./gradlew assembleRelease` makes a sideloadable APK under
`android/app/build/outputs/apk/release/` if you need one.)

**Play App Signing:** when you create the app in the Play Console, let Google generate and
hold the app signing key (the default for new apps). You sign uploads with your upload key.
If the upload key is lost or leaked, the Play Console can reset it, so no user-facing update is
lost. Upload to **Internal testing** first and read the Pre-launch report
(`docs/PLAY_STORE_CHECKLIST.md` §B).

## 9. What was verified in this environment

Environment: GitHub Codespace, Linux 6.8.0-1064-azure x86_64, 2 CPUs, 7 GB RAM, Node v24.21.0,
2026‑09‑27. Every result below comes from a command run here.

- **Initial state:** `java -version` → OpenJDK 25.0.4.1 (Microsoft build), the default
  `JAVA_HOME`. A second JDK, 21.0.12.1 (Microsoft), is installed at
  `/usr/local/sdkman/candidates/java/21.0.12+1-ms`. `ANDROID_HOME` and `ANDROID_SDK_ROOT` were
  empty, and there was no `sdkmanager` or `adb` on `PATH`.
- **Capacitor:** `npx vite build` succeeded. `npx cap add android` created `android/` and found
  the 6 plugins listed in §1. `npx cap sync android` finished OK.
- **SDK install (47 s wall clock, 19:10:16–19:11:03):** downloaded `commandlinetools-linux-16111833_latest.zip`
  (181,052,239 bytes; SHA-1 `e025545c62a8e64c7559119566a569fb1dec5f60`, which matches Google's
  `repository2-3.xml`) into `~/android-sdk`. Installed `platform-tools` 37.0.1,
  `platforms;android-36` (r02), `build-tools;35.0.0` and `build-tools;36.0.0` (~635 MB total).
- **`./gradlew assembleDebug` on JDK 25:** failed after 49 s with
  `BUG! exception in phase 'semantic analysis' in source unit '_BuildScript_' Unsupported class file major version 69`
  (class file major version 69 is Java 25; Gradle 8.14.3 supports up to Java 24).
- **`./gradlew assembleDebug` on JDK 21:** `BUILD SUCCESSFUL in 5m 41s` (274 tasks, cold Gradle
  cache). This produced `android/app/build/outputs/apk/debug/app-debug.apk`, 5,697,562 bytes. A
  second build after a later web re-sync produced 6,032,683 bytes. `aapt2 dump badging` reports
  `package: name='com.lucidwinds.pixelmeba' versionCode='1' versionName='1.0'`,
  `compileSdkVersion='36'`, `targetSdkVersion:'36'`, `application-label:'Pixelmeba'`, and the
  permissions `android.permission.INTERNET` and
  `com.lucidwinds.pixelmeba.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` (from androidx.core). The
  packaged `assets/capacitor.config.json` matches `capacitor.config.ts`.
- **`./gradlew bundleRelease` without `keystore.properties` (JDK 21):** `BUILD SUCCESSFUL`
  (`assembleDebug bundleRelease` together took 6m 16s). This produced
  `app/build/outputs/bundle/release/app-release.aab`, 4,280,147 bytes. `jarsigner -verify` →
  `no manifest.` (unsigned, as expected).
- **Signing wiring:** tested with a throwaway 1-day RSA keystore (`CN=Throwaway Test, O=Not A
  Release Key`) kept in a temp directory outside the repo, plus a temporary
  `android/keystore.properties`. `bundleRelease` → `BUILD SUCCESSFUL in 1m 36s`, and
  `jarsigner -verify` → `jar verified.`, signed by the throwaway certificate. The keystore, the
  properties file and that AAB were then deleted. No keystore exists in the repo.
- **Build warnings seen (none fatal):**
  - `Using flatDir should be avoided` (Capacitor template)
  - `SDK processing. This version only understands SDK XML versions up to 3 but an SDK XML file of version 4 was encountered`
    (AGP 8.13 reading a package from cmdline-tools 23; harmless)
  - a Kotlin deprecation warning for `downloadFile` in `@capacitor/filesystem`
- **Not verified here:** no emulator or physical device was available, so the APK was never
  installed or launched. There are no device measurements (frame rate, tick cost, memory,
  lifecycle pause/resume, share sheet, file import). Those need a real phone (PLAY_STORE_CHECKLIST §B).

### 9.1 P4.10, 2026‑10‑12 (same codespace; JDK 21 at `/usr/local/sdkman/candidates/java/21.0.12+1-ms`, `~/android-sdk`)

Every line below is a command run here and its result. Still **no emulator or device**: nothing below was
installed or launched, and there are no device measurements.

- **Capacitor template default** (`tar -xzOf node_modules/@capacitor/cli/assets/android-template.tar.gz variables.gradle`):
  `minSdkVersion = 24`, `compileSdkVersion = 36`, `targetSdkVersion = 36`. **Play page** (WebFetch of
  <https://developer.android.com/google/play/requirements/target-sdk>, 2026‑10‑12): "Starting August 31 2026: New
  apps and app updates must target Android 16 (API level 36) or higher to be submitted to Google Play". Kept 36.
- `npx tsx tools/android-icons.ts` → wrote the 15 launcher PNGs (`mipmap-{mdpi…xxxhdpi}/ic_launcher{,_round,_foreground}.png`),
  the 11 splash PNGs, `values/ic_launcher_background.xml` (`#14252D`) and `public/icons/{icon-192,icon-512,maskable-512}.png`;
  `--check` → "android-icons: every file matches".
- `npm run android:build:debug` (09:36:51–09:38:22 UTC): `vite build` ✓, `cap sync android` ✓ (6 plugins), then
  `./gradlew assembleDebug --console=plain` → **`BUILD SUCCESSFUL in 1m 18s`** (274 actionable tasks: 37 executed,
  237 up-to-date). Output `android/app/build/outputs/apk/debug/app-debug.apk`, **8,568,278 bytes**, sha256
  `ed058b449f8802cb2d1f396c5cf53577fad951da1d03a92ec0f597b4baf90a95`. `aapt2 dump badging` (build-tools 36.0.0):
  `package: name='com.lucidwinds.pixelmeba' versionCode='1' versionName='1.0' … compileSdkVersion='36'`,
  `targetSdkVersion:'36'`, `uses-permission: name='android.permission.INTERNET'`,
  `uses-permission: name='android.permission.VIBRATE'`,
  `uses-permission: name='com.lucidwinds.pixelmeba.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'`,
  `application-label:'Pixelmeba'`. (`sdkVersion:` is not printed by this aapt2 for this APK; minSdk 24 is in
  `android/variables.gradle`.) Warnings as before: flatDir, SDK XML version 4.
- `npm run android:build:release` (09:38–09:39:28 UTC, no `keystore.properties`): `./gradlew bundleRelease` →
  **`BUILD SUCCESSFUL in 40s`** (335 actionable tasks: 52 executed, 283 up-to-date). Output
  `android/app/build/outputs/bundle/release/app-release.aab`, **6,233,377 bytes**, sha256
  `42583a0d4412d61a9440e5aeb9eba21d3df1c607578f7243df52e9d26eb4df78`; the script printed the UNSIGNED line;
  `jarsigner -verify` (JDK 21) → **`jar is unsigned.`** (the 2026‑09‑27 run's JDK printed `no manifest.` for the
  same situation: both mean unsigned).
- `npm run android:keystore -- --out <path inside the repo> --dry-run` → refused ("… is inside the repository …;
  nothing was created."); outside the repo with `--dry-run` → printed the `keytool -genkeypair …` command and the
  four properties lines; **no keystore was created in this session** (tests/tools/android-keystore.test.ts).
- The browser interruption harness (`VITE_FS_HARNESS=1 npx vite build --outDir tmp/dist-android-harness`, the real
  bridge and the real `@capacitor/filesystem` web implementation): `tests/e2e/android-storage.spec.ts` passed on
  `phone-portrait` (4.2 min) and `desktop` (11.9 min; the web Filesystem stores in IndexedDB on the main thread,
  and under SwiftShader each of its requests waits for a frame). The measured save to Slot 1 took 12 file
  operations on phone-portrait and 13 on desktop, with the commit point (the journal rename) at operation 7 in
  both; cut after k = 0…7 → the relaunch opened the old moment, k = 8…11 (8…12 on desktop) → the new moment;
  never an error. A damaged current record opened the previous copy with "The latest save was damaged, so the previous copy
  was opened."; the page going hidden paused the dish, autosaved, and Continue held that moment after a reload.
  The normal build contains no `__fsHarness`.

### 9.2 P4.12, 2026‑10‑12 18:26–18:29 UTC (same codespace, JDK 21, `~/android-sdk`; the wave 7b tree on top of `33a2a62`, uncommitted)

The version now comes from `package.json` (§7). Still **no emulator or device**.

- `npm run android:build:debug`: `vite build` ✓, `cap sync android` ✓ (6 plugins), `./gradlew assembleDebug` →
  **`BUILD SUCCESSFUL in 2m 26s`** (274 actionable tasks: 33 executed, 241 up-to-date). Output
  `android/app/build/outputs/apk/debug/app-debug.apk`, **8,246,560 bytes**, sha256
  `67c00bf4b3756a52426caf0e5c138b6063b724ad26a80c964e123bf9290ff0dd`.
- `aapt2 dump badging` (build-tools 36.0.0): `package: name='com.lucidwinds.pixelmeba' versionCode='10000'
  versionName='1.0.0' … compileSdkVersion='36'`, `targetSdkVersion:'36'`, `uses-permission:
  name='android.permission.INTERNET'`, `uses-permission: name='android.permission.VIBRATE'`, `uses-permission:
  name='com.lucidwinds.pixelmeba.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'`, `application-label:'Pixelmeba'`,
  `application: label='Pixelmeba' icon='res/mipmap-anydpi-v26/ic_launcher.xml'` (the adaptive launcher icon of
  §1, `application-icon-160` … `-640` all that resource), `launchable-activity:
  name='com.lucidwinds.pixelmeba.MainActivity'`. Warnings as before (flatDir, SDK XML version 4).
- The release bundle was not rebuilt in this stage (no keystore here; §9.1 has the unsigned `bundleRelease`);
  it reads the same version lines.

## 10. Open items for the owner

1. Use **JDK 21** for Gradle. JDK 25 fails with this Gradle version (§9).
2. Create the upload keystore (`npm run android:keystore -- --out /path/outside/repo/pixelmeba-upload.jks`)
   and `android/keystore.properties` (§5–§6). Enrol in Play App Signing.
3. The version is set: `package.json` "version" 1.0.0 → `versionName` 1.0.0, `versionCode` 10000 (§7, P4.12).
   For a second upload of the same release candidate, bump the patch in `package.json` and `APP_VERSION`.
4. Re-check the Play target API requirement at submission (API 36 required since 2026‑08‑31,
   read 2026‑09‑27 and 2026‑10‑12).
5. Look at the launcher icon and splash (P4.10, `art/src/icons/appIcon.ts`: the dish with one bright colony,
   no text) on a real launcher: adaptive masks (circle, squircle, teardrop), the Android 12+ launch screen
   (the icon on `#14252D`), and the legacy icon on an older launcher. The store icon (`store/icon-512.png`,
   the same art ×12 on the surround, full square; `npm run store:assets -- --only icon`) is what Play shows
   with its own mask: check it in the Play Console preview (P4.12).
6. The Capacitor template declares `android.permission.INTERNET`. ARCHITECTURE §12 says the app
   needs no network permission. Removing it from `android/app/src/main/AndroidManifest.xml`
   must be tested on a device first, because the WebView serves the bundled assets from
   `https://localhost`. It stays as generated until someone runs that test: remove it, install,
   cold-launch in airplane mode, play, save, reopen; keep it removed only if all of that works.
7. `android:allowBackup="true"` stays (PROPOSED in P4.10): the player's own Android backup may restore their
   saves on a new phone; Pixelmeba itself sends nothing. Decide whether to keep it (Play's Data safety form
   asks nothing about the OS backup).
8. **Device smoke test** (install the debug APK, `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`),
   with notes of what you saw:
   1. cold launch in **airplane mode**: Home appears, no network error;
   2. create the Garden, feed (Add life / food), run at 1× and 4×;
   3. **Home button, then return**: the dish is paused and the line "Paused while Pixelmeba was in the
      background. No dish time passed." shows; the dish time did not move; Resume runs it;
   4. **autosave stutter**: on a mid-range phone, going to the background with a long-running dish shows no
      visible stutter, and Home → return keeps the last save (Continue opens it) (D-0092);
   5. **force-stop during a save**: Save to a slot, and while it saves force-stop from Settings → Apps →
      Pixelmeba → Force stop; relaunch: Saved dishes opens the last committed save of that slot (the new one
      or the one before; never an error). Also force-stop with a dish running, relaunch, Continue;
   6. **Share a picture** and **Share a living dish** (the system share sheet; "Save to Files"/Drive are
      among its targets); cancel once: "Not shared. Nothing changed.". The Share sheet pauses the dish itself
      while it is open ("The dish is paused while this is open."), so no line shows on return and Close runs it
      again. For the background pause, use More → Export living dish file with the dish running: the system
      sheet covers the app, the dish pauses, and the return shows "Paused while Pixelmeba was in the
      background…" (D-0095, D-0096);
   7. **Export** (More → Export, and the keep flow's Export): offered through the share sheet (no storage
      permission is asked); cancel the sheet once: "Not exported. Nothing changed." (the keep flow stays at its
      choice: D-0096);
   8. **import a .pixelmeba from Files** (More → Import, Saved dishes → Import). The Android document picker
      may grey out `.pixelmeba` files because the type is unknown to Android; if it does, record it: the fix is
      to widen the file input's `accept` on the native app (P4.10 left it as on the web);
   9. rotate the phone with a dish open; set system font size to 200 %; a TalkBack pass over Home, the dish
      and Saved dishes;
   10. haptics: Settings → Sound → Haptics on, place life: a short buzz (VIBRATE, D-0064);
   11. the INTERNET permission test of item 6;
   12. **Home during a save, then a long wait** (D-0095; a smoke check: the Home autosave usually ends before
       Android freezes the app, and the re-arm itself is proved by tests/platform/fs-bridge.test.ts "D-0095 …"):
       run a dish, press Home (that autosaves), leave the phone for 2 minutes or more, return, then Save to a
       slot and open Saved dishes: the save works and the list opens (no "Saving is stopped until Pixelmeba is
       restarted");
   13. **a nearly full phone** (optional; D-0095): fill the storage until a save is refused ("storage full"),
       then open Saved dishes: every earlier save still opens; free some space in Android's Settings → Storage
       (while a save is waiting to finish, Pixelmeba refuses every write, a removal included) and save again.
9. Keep the Filesystem save store (D-0092) or flip the native app back to IndexedDB (D-0013) after item 8.4–8.5:
   the flip is one line in `src/platform/capacitor.ts` `platformStorage()`.
10. The Play Console steps (listing, content rating, data safety, privacy-policy URL, Internal testing, the
    device smoke test `store/smoke-test.md`, the usability gates) are numbered in
    `docs/PLAY_STORE_CHECKLIST.md` §B.

## 11. How the Android app keeps saves, pauses and shares (P4.10)

- **Saves** (D-0092): `src/persistence/capacitorFs.ts` FilesystemBackend under `Directory.Data/pixelmeba/`:
  `records/<name>.json` (one save record: `recordId`, `checksum`, base64 of the gzip bytes), `slots/<name>.json`
  (the slot pointer: current and previous record), `journal.json` (the commit point), `*.tmp`. A commit writes and
  reads back each new record, then the journal (renamed to `journal.json`: committed), then removes the records it
  drops, writes the slot pointers, deletes slots, and removes the journal. A commit refused before its commit point
  removes what it wrote. Opening the store re-applies a committed journal, removes `*.tmp` and removes records no
  slot names, except those of a slot file that cannot be read (D-0095: saving into such a slot, which shows as
  free, lets the next open remove its old records; the records of a damaged checkpoint or shelf file are kept).
  On a full phone a committed journal that cannot be applied yet leaves every save readable and refuses every
  write, a removal included, as "storage full" until space is freed outside Pixelmeba (D-0095). The worker
  reaches the files through a MessagePort; the main thread (`src/platform/fsHost.ts`) answers with the
  Filesystem plugin; an operation unanswered 30 s after it started stops saving until the app restarts (what was
  saved stays), and a timer that fires more than 5 s late (Android froze the app) gets a fresh 30 s (D-0095). A
  power cut (not an app kill) is outside the tested crash points: Capacitor's `writeFile` does not fsync. The
  web build keeps IndexedDB.
- **Background**: Capacitor App `pause` → the same handler as the web's page-hidden (pause, a comparison comes
  back paused, one autosave); `resume` never changes the speed and says "Paused while Pixelmeba was in the
  background. No dish time passed." when a dish had been running. The page becoming visible again also ends
  the absence (silently), so a missed `resume` never leaves the next background unpaused. A running comparison
  or experiment stops too (D-0096). The system share sheet (More → Export) and the file picker count as the
  background; the in-app Share sheet pauses the dish itself while open and shows no return line (D-0095,
  D-0096); its stored speed also survives a trip to the background, so Close after a return runs the dish
  again (P4.6, unchanged). There is no offline growth.
- **Share and export**: files go to `Directory.Cache/share/<name>` and to the system share sheet
  (`@capacitor/share`); a cancel changes nothing and removes the file; a shared file stays until the next share
  (the receiving app may still be reading it). Export uses the same sheet; no storage permission is requested.
- **Import**: the WebView's file input (`accept=".pixelmeba,application/json,application/vnd.pixelmeba+json"`).
  The Android document picker may grey out `.pixelmeba` (an unknown MIME type); a device test decides (§10.8.8).
- **Icons**: `npm run android:icons` regenerates every launcher, splash and web icon from `art/src/icons/appIcon.ts`
  (integer scales, deterministic bytes).
