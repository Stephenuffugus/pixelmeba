/**
 * The app version written into every .pixelmeba and recipe file's metadata and shown in About (UX §2).
 * It equals package.json "version", the one source the Android build also reads (versionName, and
 * versionCode = major*10000 + minor*100 + patch; docs/ANDROID_SETUP.md §7). tests/tools/version-scheme.test.ts
 * checks that the three agree. A plain constant on purpose: the worker and the app read it without a build step.
 */
export const APP_VERSION = '1.0.0';
