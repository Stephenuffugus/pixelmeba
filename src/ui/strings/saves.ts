/**
 * What Saved dishes and the Save sheet say when the save store is the in-memory fallback (the worker's
 * `persistent` is false; src/worker/sim.worker.ts boot): in a browser, IndexedDB was not available (private
 * browsing); on the Android app, its save folder could not be opened (D-0095: the browser's words were wrong
 * there).
 */
export const NOT_KEEPING_SAVES = {
  /** Saved dishes (src/ui/views/Saves.tsx). */
  page: (native: boolean): string =>
    native
      ? 'Pixelmeba could not open its save folder on this device, so saves last only until you close the app. Export files to keep your dishes.'
      : 'This browser is not keeping saves between visits. Export files to keep your dishes.',
  /** The Save sheet (src/ui/panels/MoreSheet.tsx). */
  sheet: (native: boolean): string =>
    native
      ? 'Pixelmeba could not open its save folder on this device. Saves last only until you close the app — export a file to keep it.'
      : 'This browser is not keeping saves (private mode?). Saves last only until you close the app — export a file to keep it.',
} as const;
