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
| `versionCode` / `versionName` | `1` / `"1.0"` (template defaults; set per §7 before the first upload) | `android/app/build.gradle` |

**Google Play target API.** The Play page
(<https://developer.android.com/google/play/requirements/target-sdk>, read 2026‑09‑27) says:
"Starting August 31 2026: New apps and app updates must target Android 16 (API level 36) or
higher". `targetSdkVersion = 36` meets that today. **Check that page again at submission time**;
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
passwords) somewhere other than this machine:

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

`versionName` is the semantic version (`major.minor.patch`). `versionCode` follows
**`versionCode = major*10000 + minor*100 + patch`**. That caps `minor` and `patch` at 99.

| Release | `versionName` | `versionCode` |
|---|---|---|
| 1.0.0 | `"1.0.0"` | `10000` |
| 1.0.1 | `"1.0.1"` | `10001` |
| 1.1.0 | `"1.1.0"` | `10100` |
| 1.2.3 | `"1.2.3"` | `10203` |

Set both in `android/app/build.gradle` → `defaultConfig` before each upload. Every upload to any
Play track must have a higher `versionCode` than the last one. To upload a second build of the
same release candidate, bump `patch`.

## 8. Release build (AAB for Google Play)

```bash
npm ci
npm run build
npx cap sync android
cd android
./gradlew bundleRelease       # Windows: gradlew.bat bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`. Check that it is signed:
`jarsigner -verify -verbose:summary app/build/outputs/bundle/release/app-release.aab` should end
with `jar verified.` and name your upload certificate. If it says `no manifest.`, the AAB is
unsigned; see §6. (`./gradlew assembleRelease` makes a sideloadable APK under
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

## 10. Open items for the owner

1. Use **JDK 21** for Gradle. JDK 25 fails with this Gradle version (§9).
2. Create the upload keystore and `android/keystore.properties` (§5–§6). Enrol in Play App Signing.
3. Set `versionCode`/`versionName` per §7 before the first upload (currently the template's
   `1`/`"1.0"`).
4. Re-check the Play target API requirement at submission (API 36 required since 2026‑08‑31,
   read 2026‑09‑27).
5. The launcher icon and splash are still Capacitor's defaults. They get replaced from `store/`
   in the Phase 4 asset tasks.
6. The Capacitor template declares `android.permission.INTERNET`. ARCHITECTURE §12 says the app
   needs no network permission. Removing it from `android/app/src/main/AndroidManifest.xml`
   must be tested on a device first, because the WebView serves the bundled assets from
   `https://localhost`. It stays as generated until someone runs that test.
7. Install the debug APK on a real phone and run the pre-launch smoke test in
   `docs/PLAY_STORE_CHECKLIST.md` §A.
