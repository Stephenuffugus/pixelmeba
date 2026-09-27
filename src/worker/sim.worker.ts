/**
 * Worker entry: owns all authoritative simulation state (ARCH §7). The main thread never mutates
 * a world; it sends commands and receives snapshots.
 */
import { buildRegistry } from '@sim/content/registry';
import { loadRawPacksVite } from '@sim/content/raw-vite';
import { DishHost } from './host';
import type { FromWorker, ToWorker } from './protocol';

const scope = self as unknown as {
  postMessage(msg: FromWorker, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<ToWorker>) => void) | null;
};

const registry = buildRegistry(loadRawPacksVite());
const host = new DishHost(
  registry,
  (msg, transfer) => scope.postMessage(msg, transfer ?? []),
  { now: () => performance.now() },
);

scope.onmessage = (ev) => host.handle(ev.data);

function loop(): void {
  host.pump();
  setTimeout(loop, 16);
}
loop();
