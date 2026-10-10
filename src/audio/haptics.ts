/**
 * Haptics (UX §8.1 "haptics only on intentional tool actions"; P3.10). A short buzz only when the
 * player made a placement the dish accepted (a Lab tool or Add Life / Add food), only when the player
 * turned haptics on (off by default), and only where `navigator.vibrate` exists (feature-detected; no
 * dependency). W5-22 (proposed decision): the Android build has no haptics until P4.10 adds
 * android.permission.VIBRATE (PLAY_STORE_CHECKLIST); the WebView's vibrate is a no-op without it.
 */

export const HAPTIC_TAP_MS = 12;

export interface VibrateHost {
  readonly vibrate?: (pattern: number | number[]) => boolean;
}

function defaultHost(): VibrateHost | null {
  return typeof navigator === 'undefined' ? null : navigator;
}

/** Buzz once for an intentional tool action. Returns whether a vibration was requested. */
export function hapticTap(enabled: boolean, host: VibrateHost | null = defaultHost()): boolean {
  if (!enabled || !host || typeof host.vibrate !== 'function') return false;
  try {
    return host.vibrate(HAPTIC_TAP_MS);
  } catch {
    return false;
  }
}
