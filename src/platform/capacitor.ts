/**
 * P4.10: the one place that asks which platform the app runs on (ARCH §3: only src/platform imports
 * @capacitor/*). The web build and the arcade build are not native; the Android app is.
 */
import { Capacitor } from '@capacitor/core';

let override: boolean | null = null;

/** True inside the Capacitor Android (or iOS) app; false in a browser. */
export function isNativePlatform(): boolean {
  if (override !== null) return override;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Tests only: pretend to be (true) or not to be (false) the native app; null restores the real answer. */
export function setNativePlatformForTests(v: boolean | null): void {
  override = v;
}

/** The save store the worker should use: the Filesystem adapter on the native app and in the harness build. */
export function platformStorage(): 'idb' | 'filesystem' {
  return isNativePlatform() || import.meta.env.VITE_FS_HARNESS === '1' ? 'filesystem' : 'idb';
}

/**
 * Start the main thread's file host on `port` (the worker's Filesystem store asks it; D-0092). Loaded on
 * demand, so the web build never loads the Filesystem plugin. In the interruption harness build
 * (VITE_FS_HARNESS=1, never shipped) the host is wrapped by src/platform/fsHarness.ts; that branch is
 * removed from every other build.
 */
export function startFsHost(port: MessagePort): void {
  if (import.meta.env.VITE_FS_HARNESS === '1') {
    import('./fsHarness').then(
      (m) => m.startHarnessHost(port),
      (e: unknown) => console.error('The file host did not start:', e),
    );
    return;
  }
  import('./fsHost').then(
    (m) => m.serveFs(port),
    (e: unknown) => console.error('The file host did not start:', e),
  );
}
