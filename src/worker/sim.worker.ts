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

const scope = self as unknown as {
  postMessage(msg: FromWorker & Envelope, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<ToWorker & Partial<Envelope>>) => void) | null;
};

const registry = buildRegistry(loadRawPacksVite());
const queued: ToWorker[] = [];
let host: DishHost | null = null;
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
  if (host) host.handle(msg);
  else queued.push(msg);
};

async function boot(): Promise<void> {
  let store: SaveStore;
  let persistent = true;
  try {
    store = new SaveStore(await IdbBackend.open());
  } catch {
    // IndexedDB unavailable (e.g. private browsing): saves last for this session only.
    store = new SaveStore(new MemoryBackend());
    persistent = false;
  }
  host = new DishHost(registry, (msg, transfer) => scope.postMessage(msg, transfer ?? []), { now: () => performance.now(), iso: () => new Date().toISOString() }, store, persistent);
  for (const m of queued.splice(0)) host.handle(m);
  loop();
}

function loop(): void {
  host?.pump();
  setTimeout(loop, 16);
}
void boot();
