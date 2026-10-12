/**
 * P4.10 (D-0092): FsOps over a MessagePort, so the worker's FilesystemBackend reaches the Capacitor
 * Filesystem plugin, which lives on the main thread (src/platform/fsHost.ts answers).
 *
 * Request { id, op, args } → answer { id, ok: true, value } | { id, ok: false, error: { name, message } }.
 * An error keeps its name (QuotaExceededError stays one, so isStorageFull holds) and an out-of-space message
 * becomes StorageFullError (toStorageError). Each operation has a 30 s limit: one that is not answered in time
 * rejects AND marks this port failed, so every later operation rejects at once and no later commit starts
 * until the app restarts. The saved dishes are safe either way: a commit that never reached its commit point
 * changed no slot, and one that did is applied at the next open (src/persistence/capacitorFs.ts).
 *
 * D-0095: the limit counts time the app was running. Android freezes a backgrounded app (the cached-app
 * freezer) while the clock goes on, so a save started by 'pause' can have its timer fire on the thaw before
 * the answer already waiting on the main thread arrives. A timer that fires more than FS_SUSPENDED_MS after
 * its deadline was held up by a freeze (or a long stall), not by the storage: it is re-armed for another full
 * limit instead of failing the port.
 */
import type { FsOps } from './capacitorFs';
import { toStorageError } from './capacitorFs';

export type FsOpName = 'read' | 'write' | 'rename' | 'remove' | 'list' | 'size';

export interface FsRequest {
  readonly id: number;
  readonly op: FsOpName;
  readonly args: readonly string[];
}

export type FsAnswer =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly error: { readonly name: string; readonly message: string } };

/** The part of a MessagePort this needs (a fake in tests). */
export interface PortLike {
  postMessage(msg: FsRequest): void;
  onmessage: ((ev: MessageEvent<FsAnswer>) => void) | null;
}

export const FS_OP_TIMEOUT_MS = 30_000;
/** A timer this late was held up by a frozen or stalled app, not by the storage (D-0095). */
export const FS_SUSPENDED_MS = 5_000;

export const FS_PORT_TEXT = {
  timeout: (op: string, seconds: number) => `The device storage did not answer (${op}) within ${seconds} s. Saving is stopped until Pixelmeba is restarted; nothing already saved was changed.`,
  failed: 'Saving is stopped until Pixelmeba is restarted because the device storage stopped answering. Nothing already saved was changed.',
} as const;

interface Pending {
  readonly resolve: (v: unknown) => void;
  readonly reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** An Error carrying the platform's name and message. */
export function errorFrom(e: { readonly name: string; readonly message: string }): Error {
  const err = new Error(e.message);
  if (e.name && e.name !== 'Error') Object.defineProperty(err, 'name', { value: e.name, configurable: true, writable: true });
  return toStorageError(err);
}

export class PortFsOps implements FsOps {
  private nextId = 1;
  private readonly pending: Record<number, Pending> = {};
  private dead: Error | null = null;

  constructor(
    private readonly port: PortLike,
    private readonly timeoutMs: number = FS_OP_TIMEOUT_MS,
    /** A monotonic clock in ms (tests pass their own). */
    private readonly now: () => number = () => performance.now(),
  ) {
    port.onmessage = (ev) => this.answer(ev.data);
  }

  /** True once an operation went unanswered past its limit (until the app restarts). */
  get failed(): boolean {
    return this.dead !== null;
  }

  private answer(a: FsAnswer): void {
    const p = this.pending[a.id];
    if (!p) return; // late answer to an operation that already timed out
    delete this.pending[a.id];
    clearTimeout(p.timer);
    if (a.ok) p.resolve(a.value);
    else p.reject(errorFrom(a.error));
  }

  private call<T>(op: FsOpName, args: readonly string[]): Promise<T> {
    if (this.dead) return Promise.reject(new Error(FS_PORT_TEXT.failed));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      let deadline = this.now() + this.timeoutMs;
      const expire = (): void => {
        const p = this.pending[id];
        if (!p) return;
        if (this.now() - deadline > FS_SUSPENDED_MS) {
          // D-0095: held up by a frozen app (or a long stall), not by the storage: a fresh limit.
          deadline = this.now() + this.timeoutMs;
          p.timer = setTimeout(expire, this.timeoutMs);
          return;
        }
        delete this.pending[id];
        this.dead = new Error(FS_PORT_TEXT.timeout(op, Math.round(this.timeoutMs / 1000)));
        reject(this.dead);
      };
      const timer = setTimeout(expire, this.timeoutMs);
      this.pending[id] = { resolve: (v) => resolve(v as T), reject, timer };
      try {
        this.port.postMessage({ id, op, args });
      } catch (e) {
        delete this.pending[id];
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  read(path: string): Promise<string | null> {
    return this.call<string | null>('read', [path]);
  }
  write(path: string, text: string): Promise<void> {
    return this.call<void>('write', [path, text]);
  }
  rename(from: string, to: string): Promise<void> {
    return this.call<void>('rename', [from, to]);
  }
  remove(path: string): Promise<void> {
    return this.call<void>('remove', [path]);
  }
  list(dir: string): Promise<string[]> {
    return this.call<string[]>('list', [dir]);
  }
  size(path: string): Promise<number | null> {
    return this.call<number | null>('size', [path]);
  }
}
