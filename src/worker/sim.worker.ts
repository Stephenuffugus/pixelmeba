/**
 * Worker entry: owns all authoritative simulation state (ARCH §7). The main thread never mutates
 * a world; it sends commands and receives snapshots.
 */
import { buildRegistry } from '@sim/content/registry';
import { loadRawPacksVite } from '@sim/content/raw-vite';
import { DishHost } from './host';
import { PROTOCOL_VERSION, type Envelope, type FromWorker, type ToWorker } from './protocol';
import { IdbBackend } from '@persist/idb';
import { MemoryBackend, SaveStore } from '@persist/store';
import type { StorageEstimate } from '@persist/checkpoints';
import { chooseStore, filesystemEstimate, openFilesystemStore, type StoreChoice } from './boot';
import { demoScope } from '@platform/demoScope';

const scope = self as unknown as {
  postMessage(msg: FromWorker & Envelope, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<ToWorker & Partial<Envelope>>) => void) | null;
};

const registry = buildRegistry(loadRawPacksVite());
/** P4.11 DEMO_MODE (VITE_DEMO_MODE=1, npm run build:demo): the same content, a narrower scope; default off. */
const demo = import.meta.env.VITE_DEMO_MODE === '1' ? demoScope(registry) : null;
const queued: ToWorker[] = [];
let host: DishHost | null = null;
/** P4.10: the worker boots on the client's first message ('platform' picks the save store; D-0092). */
let booting = false;
scope.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.protocolVersion !== PROTOCOL_VERSION) {
    // An app from a different build: refuse rather than misread (ARCH §7).
    scope.postMessage({
      type: 'error',
      dishId: 'dishId' in msg ? msg.dishId : '',
      ...('requestId' in msg ? { requestId: msg.requestId } : {}),
      kind: 'protocol',
      message: `protocol version mismatch: app ${String(msg.protocolVersion)}, worker ${PROTOCOL_VERSION}`,
      lastValidTick: 0,
      protocolVersion: PROTOCOL_VERSION,
    });
    return;
  }
  if (!booting) {
    booting = true;
    void boot(chooseStore(msg));
    if (msg.type === 'platform') return;
  }
  if (msg.type === 'platform') return; // only the first one counts
  if (host) host.handle(msg);
  else queued.push(msg);
};

async function boot(choice: StoreChoice): Promise<void> {
  let store: SaveStore;
  let persistent = true;
  // P2.8: the automatic checkpoint ring checks the browser's storage estimate before each write.
  const storage = (self as unknown as { navigator?: { storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> } } }).navigator?.storage;
  const webEstimate = storage?.estimate ? () => storage.estimate!() : undefined;
  let estimate: (() => Promise<StorageEstimate | undefined>) | undefined;
  try {
    if (choice.kind === 'filesystem') {
      // P4.10 (D-0092): the Android app's files, through the main thread's Capacitor Filesystem host.
      const backend = await openFilesystemStore(choice.port);
      store = new SaveStore(backend);
      estimate = filesystemEstimate(backend, webEstimate);
    } else {
      store = new SaveStore(await IdbBackend.open());
      estimate = webEstimate;
    }
  } catch {
    // IndexedDB (or the device storage) unavailable, e.g. private browsing: saves last for this session only.
    store = new SaveStore(new MemoryBackend());
    persistent = false;
    estimate = undefined;
  }
  host = new DishHost(registry, (msg, transfer) => scope.postMessage(msg, transfer ?? []), { now: () => performance.now(), iso: () => new Date().toISOString() }, store, persistent, estimate, { demo });
  for (const m of queued.splice(0)) host.handle(m);
  loop();
}

function loop(): void {
  host?.pump();
  setTimeout(loop, 16);
}
