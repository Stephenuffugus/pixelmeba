/**
 * P4.10 (D-0092): which save store the worker opens. The client's first message is 'platform'
 * (SimClient.create → sendPlatform): 'filesystem' with a transferred MessagePort, or 'idb'. Any other first
 * message (an older client, a test driving the worker directly) boots IndexedDB as before.
 */
import { describe, expect, it } from 'vitest';
import { chooseStore, filesystemEstimate } from '../../src/worker/boot';
import { sendPlatform, type WorkerLike } from '../../src/worker/client';
import { PROTOCOL_VERSION, type ToWorker } from '../../src/worker/protocol';
import { MemoryBackend } from '../../src/persistence/store';

describe('chooseStore', () => {
  it("'platform' filesystem with a port → the Filesystem store on that port", () => {
    const { port2 } = new MessageChannel();
    const c = chooseStore({ type: 'platform', storage: 'filesystem', port: port2 });
    expect(c.kind).toBe('filesystem');
    expect(c.kind === 'filesystem' && c.port).toBe(port2);
    port2.close();
  });

  it("'platform' idb → IndexedDB; 'filesystem' without a port → IndexedDB (never a store with nobody to answer)", () => {
    expect(chooseStore({ type: 'platform', storage: 'idb' })).toEqual({ kind: 'idb' });
    expect(chooseStore({ type: 'platform', storage: 'filesystem' })).toEqual({ kind: 'idb' });
  });

  it('a first message that is not platform → IndexedDB, as before P4.10', () => {
    const first: ToWorker = { type: 'setSpeed', dishId: 'd', speed: 1 };
    expect(chooseStore(first)).toEqual({ kind: 'idb' });
    expect(chooseStore(undefined)).toEqual({ kind: 'idb' });
  });
});

describe('sendPlatform (the client side)', () => {
  function fakeWorker() {
    const sent: { msg: unknown; transfer: Transferable[] | undefined }[] = [];
    const w: WorkerLike = { postMessage: (msg, transfer) => sent.push({ msg, transfer }), onmessage: null };
    return { w, sent };
  }

  it("filesystem: one stamped 'platform' message carrying a port in the transfer list; the other end goes to the host", () => {
    const { w, sent } = fakeWorker();
    let hostPort: MessagePort | null = null;
    sendPlatform(w, 'filesystem', (p) => (hostPort = p));
    expect(sent.length).toBe(1);
    const m = sent[0]!.msg as { type: string; storage: string; port: MessagePort; protocolVersion: number };
    expect(m).toMatchObject({ type: 'platform', storage: 'filesystem', protocolVersion: PROTOCOL_VERSION });
    expect(sent[0]!.transfer).toEqual([m.port]);
    expect(hostPort).not.toBeNull();
    expect(hostPort).not.toBe(m.port);
    (hostPort as unknown as MessagePort).close();
    m.port.close();
  });

  it("idb: one stamped 'platform' message with no port, and no host", () => {
    const { w, sent } = fakeWorker();
    let hosted = false;
    sendPlatform(w, 'idb', () => (hosted = true));
    expect(sent).toEqual([{ msg: { type: 'platform', storage: 'idb', protocolVersion: PROTOCOL_VERSION }, transfer: undefined }]);
    expect(hosted).toBe(false);
  });
});

describe('filesystemEstimate (the ring, the shelf and the Storage panel on the Android app)', () => {
  it("usage is the store's own bytes (plus the WebView's); the quota is the WebView's when it gives one", async () => {
    const b = new MemoryBackend();
    b.records['r'] = { recordId: 'r', data: new Uint8Array(1234), checksum: 'c' };
    expect(await filesystemEstimate(b)()).toEqual({ usage: 1234 });
    expect(await filesystemEstimate(b, () => Promise.resolve({ usage: 100, quota: 5000 }))()).toEqual({ usage: 1334, quota: 5000 });
    expect(await filesystemEstimate(b, () => Promise.reject(new Error('no')))()).toEqual({ usage: 1234 });
    expect(await filesystemEstimate(b, () => Promise.resolve({ usage: 1, quota: 0 }))()).toEqual({ usage: 1234 });
  });
});
