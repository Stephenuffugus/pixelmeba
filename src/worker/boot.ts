/**
 * P4.10 (D-0092): which save store the worker opens. The client's FIRST message is 'platform'
 * (src/worker/client.ts SimClient.create): 'filesystem' carries a MessagePort to the main thread's
 * file host (the Android app, and the interruption harness build), 'idb' keeps IndexedDB (the web).
 * Any other first message (an older client, a test) boots with IndexedDB as before.
 */
import type { StorageEstimate } from '@persist/checkpoints';
import { FilesystemBackend } from '@persist/capacitorFs';
import { PortFsOps, type PortLike } from '@persist/fsPort';
import type { StorageBackend } from '@persist/store';
import type { ToWorker } from './protocol';

export type StoreChoice = { readonly kind: 'idb' } | { readonly kind: 'filesystem'; readonly port: PortLike };

/** The store a first message asks for. */
export function chooseStore(first: ToWorker | null | undefined): StoreChoice {
  if (first && first.type === 'platform' && first.storage === 'filesystem' && first.port) return { kind: 'filesystem', port: first.port as unknown as PortLike };
  return { kind: 'idb' };
}

/** Open the Filesystem store over the port (recovery runs first: see FilesystemBackend.open). */
export function openFilesystemStore(port: PortLike): Promise<FilesystemBackend> {
  return FilesystemBackend.open(new PortFsOps(port));
}

/**
 * The storage estimate for the Filesystem store (the checkpoint ring's and the shelf's preflight, and the
 * Storage panel, through DishHost's storageEstimate): usage = the bytes of the store's own files plus what
 * the WebView itself keeps; quota = the WebView's own quota when it reports one (Chromium derives it from
 * the device's disk), else none (then the preflight is skipped and the store's own out-of-space refusal,
 * StorageFullError, still keeps everything as it was).
 */
export function filesystemEstimate(backend: StorageBackend, web?: () => Promise<StorageEstimate | undefined>): () => Promise<StorageEstimate | undefined> {
  return async () => {
    const own = backend.usage ? await backend.usage() : { bytes: 0, quota: null };
    let w: StorageEstimate | undefined;
    try {
      w = web ? await web() : undefined;
    } catch {
      w = undefined;
    }
    const quota = w && typeof w.quota === 'number' && Number.isFinite(w.quota) && w.quota > 0 ? w.quota : undefined;
    const webUsage = w && typeof w.usage === 'number' && Number.isFinite(w.usage) ? w.usage : 0;
    return quota === undefined ? { usage: own.bytes } : { usage: own.bytes + webUsage, quota };
  };
}
