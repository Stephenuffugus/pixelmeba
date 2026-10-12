# Pixelmeba — Data safety form answers (Play Console → Policy → App content → Data safety)

App version 1.0.0 (`versionCode 10000`). Prepared 2026-10-12 from the code, not from memory: the app makes no
request to any server (the only `fetch` in `src/`, `src/ui/atlas.ts`, loads the bundled sprite manifest from the
app's own files; there is no `XMLHttpRequest`, `WebSocket` or `sendBeacon`), no analytics, ads, crash or
account SDK, and the only native plugins are Capacitor's App, Filesystem, Preferences, Share, Splash Screen and
Status Bar (`package.json`, `android/capacitor.settings.gradle`). Re-check this list if a plugin or SDK is ever
added. The privacy policy is `PRIVACY_POLICY.md` (hosted copy: `store/privacy-policy.html`).

## Overview section

| Question | Answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | **No** | Nothing leaves the device except a file the player sends with the system share sheet. |

Answering **No** here ends the data-type questions; Play then shows "No data collected" and "No data shared
with third parties" on the listing. The remaining questions below are what Play asks or may ask, with the
answer and the reason, so the form can be filled in one pass.

## Data collection and security

| Question | Answer | Why |
|---|---|---|
| Is all of the user data collected by your app encrypted in transit? | **Not applicable** (not asked once "No data collected" is chosen) | No data is collected or transmitted. |
| Do you provide a way for users to request that their data is deleted? | **Not applicable** | Nothing is collected, so there is nothing held by the developer to delete. Saves live only on the device; uninstalling deletes them, and Saved dishes → Delete removes one. |
| Has your app been independently validated against a global security standard (MASA)? | **No** | No independent security review was done. |
| Is your app's data collection required or optional? | **Not applicable** | — |

## Why each user-initiated action is not "collection" or "sharing"

Play's form (paraphrased; read its current help text when filling it in): data is *collected* when the app
transmits it off the device, and *shared* when it is transferred to a third party; data processed only on the
device, and a transfer the user starts and reasonably expects (such as sending a file through the system share
sheet), do not count as either.

- **Share** (picture, starting recipe, living dish) and **Export** (`.pixelmeba`): the player taps Share or
  Export, picks the destination in Android's own share sheet, and can cancel. The developer receives nothing.
  This is a user-initiated transfer to an app the player chooses, so it is neither collection nor sharing.
- **Saves, settings and the Notebook**: stored only in the app's private storage on the device (processed on
  device), never transmitted by the app.
- **Android backup** (`android:allowBackup="true"`): Android's own Auto Backup may copy app data to the
  player's Google account when the player has turned backup on. Play's form treats this as the operating
  system's service, not data collected by the app; the privacy policy says so plainly.
- **Permissions**: `INTERNET` (declared by the Capacitor template; the app makes no request) and `VIBRATE`
  (haptics, Settings → Sound). No permission reaches location, contacts, files, camera or microphone.

## Data types (only if Play asks type by type)

Every type — Location, Personal info, Financial info, Health and fitness, Messages, Photos and videos,
Audio files, Files and docs, Calendar, Contacts, App activity, Web browsing, App info and performance
(crash logs, diagnostics), Device or other IDs — **Not collected, not shared.**

The in-app "Show performance numbers" setting shows tick time, frame rate and memory on the screen only; it is
never stored off the device or transmitted.
