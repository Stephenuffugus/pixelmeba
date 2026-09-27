/**
 * Worker entry: owns all authoritative simulation state (ARCH §7). The main thread never mutates
 * a world; it sends commands and receives snapshots.
 */
import { buildRegistry } from '@sim/content/registry';
import { loadRawPacksVite } from '@sim/content/raw-vite';
import { DishHost } from './host';
import type { FromWorker, ToWorker } from './protocol';
import { IdbBackend } from '@persist/idb';
import { MemoryBackend, SaveStore } from '@persist/store';

const scope = self as unknown as {
  postMessage(msg: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<ToWorker>) => void) | null;
};

const registry = buildRegistry(loadRawPacksVite());
const queued: ToWorker[] = [];
let host: DishHost | null = null;
scope.onmessage = (ev) => {
  if (host) host.handle(ev.data);
  else queued.push(ev.data);
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
