/**
 * P4.10 (D-0092): the worker ↔ main-thread file bridge. PortFsOps (src/persistence/fsPort.ts) over a real
 * MessageChannel against the main thread's host (src/platform/fsHost.ts serveFs) driving a fake Filesystem
 * plugin that answers as Capacitor's Android plugin does (its "does not exist" texts and code). Proves: the
 * operations arrive in order and the store works end to end; errors keep their names (QuotaExceededError and
 * an Android ENOSPC message → isStorageFull); missing files read as null / []; an operation not answered in
 * 30 s rejects and marks the port failed, the next commit refuses at once, and the old save is intact.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageChannel } from 'node:worker_threads';
import { FilesystemBackend } from '../../src/persistence/capacitorFs';
import { FS_PORT_TEXT, PortFsOps, type FsAnswer, type FsRequest, type PortLike } from '../../src/persistence/fsPort';
import { isStorageFull, SaveStore } from '../../src/persistence/store';
import { perform, serveFs, type FsPlugin, type HostPort } from '../../src/platform/fsHost';
import { req, verifyText } from '../persistence/backend-contract';

/** An in-memory Filesystem plugin with Capacitor Android's error texts (FilesystemErrors.kt). */
class FakeFilesystem implements FsPlugin {
  readonly files: Record<string, string> = {};
  readonly calls: string[] = [];
  failWrite: { name: string; message: string } | null = null;

  private gone(method: string, path: string): Error {
    const e = new Error(`'${method}' failed because file at '/data/user/0/com.lucidwinds.pixelmeba/files/${path}' does not exist.`) as Error & { code: string };
    e.code = 'OS-PLUG-FILE-0008';
    return e;
  }
  readFile(o: { path: string }): Promise<{ data: string }> {
    this.calls.push(`readFile ${o.path}`);
    const t = this.files[o.path];
    return t === undefined ? Promise.reject(this.gone('readFile', o.path)) : Promise.resolve({ data: t });
  }
  writeFile(o: { path: string; data: string; recursive: boolean }): Promise<unknown> {
    this.calls.push(`writeFile ${o.path}`);
    if (!o.recursive) return Promise.reject(new Error('recursive expected'));
    if (this.failWrite) {
      const e = new Error(this.failWrite.message);
      Object.defineProperty(e, 'name', { value: this.failWrite.name });
      return Promise.reject(e);
    }
    this.files[o.path] = o.data;
    return Promise.resolve({ uri: `file:///${o.path}` });
  }
  rename(o: { from: string; to: string }): Promise<void> {
    this.calls.push(`rename ${o.from} ${o.to}`);
    const t = this.files[o.from];
    if (t === undefined) return Promise.reject(this.gone('rename', o.from));
    delete this.files[o.to]; // Android: the target is deleted, then File.renameTo
    this.files[o.to] = t;
    delete this.files[o.from];
    return Promise.resolve();
  }
  deleteFile(o: { path: string }): Promise<void> {
    this.calls.push(`deleteFile ${o.path}`);
    if (this.files[o.path] === undefined) return Promise.reject(this.gone('deleteFile', o.path));
    delete this.files[o.path];
    return Promise.resolve();
  }
  readdir(o: { path: string }): Promise<{ files: { name: string }[] }> {
    this.calls.push(`readdir ${o.path}`);
    const prefix = `${o.path}/`;
    const names = Object.keys(this.files)
      .filter((p) => p.startsWith(prefix))
      .map((p) => p.slice(prefix.length).split('/')[0]!);
    if (names.length === 0) return Promise.reject(this.gone('readdir', o.path));
    return Promise.resolve({ files: [...new Set(names)].sort().map((name) => ({ name })) });
  }
  stat(o: { path: string }): Promise<{ size: number }> {
    this.calls.push(`stat ${o.path}`);
    const t = this.files[o.path];
    return t === undefined ? Promise.reject(this.gone('stat', o.path)) : Promise.resolve({ size: new TextEncoder().encode(t).byteLength });
  }
}

const channels: MessageChannel[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const c of channels.splice(0)) {
    c.port1.close();
    c.port2.close();
  }
});

function bridge(fs: FakeFilesystem, gate?: Parameters<typeof serveFs>[2]): { ops: PortFsOps; received: () => number } {
  const ch = new MessageChannel();
  channels.push(ch);
  let received = 0;
  serveFs(ch.port1 as unknown as HostPort, fs, (r) => {
    received++;
    return gate ? gate(r) : true;
  });
  return { ops: new PortFsOps(ch.port2 as unknown as PortLike), received: () => received };
}

describe('the file bridge (PortFsOps ↔ fsHost)', () => {
  it('carries every operation in order; a SaveStore over it saves, lists and loads', async () => {
    const fs = new FakeFilesystem();
    const { ops } = bridge(fs);
    const b = await FilesystemBackend.open(ops);
    const store = new SaveStore(b);
    await store.save(req('slot1', 'A'));
    const at = fs.calls.length;
    await store.save(req('slot1', 'B'));
    const calls = fs.calls.slice(at).map((c) => c.replace(/records\/[a-z0-9_-]+/gu, 'records/R'));
    expect(calls).toEqual([
      'readFile pixelmeba/slots/slot1.json',
      'readFile pixelmeba/records/R.json',
      'writeFile pixelmeba/records/R.json.tmp',
      'readFile pixelmeba/records/R.json.tmp',
      'rename pixelmeba/records/R.json.tmp pixelmeba/records/R.json',
      'writeFile pixelmeba/journal.tmp',
      'readFile pixelmeba/journal.tmp',
      'rename pixelmeba/journal.tmp pixelmeba/journal.json',
      'writeFile pixelmeba/slots/slot1.json.tmp',
      'readFile pixelmeba/slots/slot1.json.tmp',
      'rename pixelmeba/slots/slot1.json.tmp pixelmeba/slots/slot1.json',
      'deleteFile pixelmeba/journal.json',
    ]);
    expect(await store.load('slot1', verifyText)).toEqual({ text: 'SAVE B', usedPredecessor: false });
    expect((await store.list()).map((s) => s.slotId)).toEqual(['slot1']);
    expect((await b.usage()).bytes).toBeGreaterThan(0);
  });

  it('missing files read as null, missing folders list as [], removing a missing file is fine', async () => {
    const fs = new FakeFilesystem();
    const { ops } = bridge(fs);
    expect(await ops.read('pixelmeba/none.json')).toBeNull();
    expect(await ops.list('pixelmeba/records')).toEqual([]);
    expect(await ops.size('pixelmeba/none.json')).toBeNull();
    await expect(ops.remove('pixelmeba/none.json')).resolves.toBeNull();
    // The web implementation's texts are recognised too.
    const web = { ...fs, readFile: () => Promise.reject(new Error('File does not exist.')) } as unknown as FsPlugin;
    expect(await perform(web, { id: 1, op: 'read', args: ['x'] })).toBeNull();
  });

  it('errors keep their names: QuotaExceededError and an Android ENOSPC write are storage-full; the old save stays', async () => {
    for (const failure of [
      { name: 'QuotaExceededError', message: 'The quota has been exceeded.' },
      { name: 'Error', message: "'writeFile' failed with: write failed: ENOSPC (No space left on device)" },
    ]) {
      const fs = new FakeFilesystem();
      const { ops } = bridge(fs);
      const store = new SaveStore(await FilesystemBackend.open(ops));
      await store.save(req('slot1', 'A'));
      fs.failWrite = failure;
      let caught: unknown = null;
      await store.save(req('slot1', 'B')).catch((e: unknown) => (caught = e));
      expect(isStorageFull(caught)).toBe(true);
      fs.failWrite = null;
      expect(await store.load('slot1', verifyText)).toEqual({ text: 'SAVE A', usedPredecessor: false });
    }
    const fs = new FakeFilesystem();
    const { ops } = bridge(fs);
    fs.failWrite = { name: 'TypeError', message: 'bad' };
    const err = await ops.write('x', 'y').catch((e: unknown) => e as Error);
    expect(err).toMatchObject({ name: 'TypeError', message: 'bad' });
    expect(isStorageFull(err)).toBe(false);
  });

  it('an operation unanswered for 30 s rejects and marks the store failed; the next commit refuses at once; the old save is intact', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fs = new FakeFilesystem();
    let stopAt = Infinity;
    let answered = 0;
    const { ops, received } = bridge(fs, () => answered++ < stopAt);
    const store = new SaveStore(await FilesystemBackend.open(ops));
    await store.save(req('slot1', 'A'));
    stopAt = answered + 3; // the host answers three more operations, then never again (a dead main thread)
    const saving = store.save(req('slot1', 'B'));
    let outcome: unknown = 'pending';
    saving.then(
      () => (outcome = 'saved'),
      (e: unknown) => (outcome = e),
    );
    while (received() < stopAt + 1) await new Promise((r) => setImmediate(r));
    await vi.advanceTimersByTimeAsync(29_999);
    expect(outcome).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toContain('did not answer');
    expect(ops.failed).toBe(true);
    // No later commit starts: refused before anything reaches the host.
    const before = received();
    await expect(store.save(req('slot1', 'C'))).rejects.toThrow(FS_PORT_TEXT.failed);
    expect(received()).toBe(before);
    // A restart (a new bridge on the same files) opens the old save.
    vi.useRealTimers();
    const again = bridge(fs);
    const reopened = new SaveStore(await FilesystemBackend.open(again.ops));
    expect(await reopened.load('slot1', verifyText)).toEqual({ text: 'SAVE A', usedPredecessor: false });
    expect(Object.keys(fs.files).filter((p) => p.endsWith('.tmp'))).toEqual([]);
  });

  it('D-0095: a timer that fires long after its deadline (the app was frozen in the background) gets a fresh limit; the late answer is used and the port stays open', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let clock = 0;
    const posted: FsRequest[] = [];
    const port: PortLike = { onmessage: null, postMessage: (m) => void posted.push(m) };
    const ops = new PortFsOps(port, 30_000, () => clock);
    let outcome: unknown = 'pending';
    ops.read('pixelmeba/journal.json').then(
      (v) => (outcome = v),
      (e: unknown) => (outcome = e),
    );
    // Frozen for two minutes: the clock went on, and the timer fires at the thaw, 90 s past its deadline.
    clock = 120_000;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(outcome).toBe('pending');
    expect(ops.failed).toBe(false);
    // The answer that was waiting on the main thread arrives and is used.
    port.onmessage!({ data: { id: posted[0]!.id, ok: true, value: 'text' } } as MessageEvent<FsAnswer>);
    await vi.advanceTimersByTimeAsync(0);
    expect(outcome).toBe('text');
    // A storage that really stops answering still stops the port when its limit runs out on time.
    let written: unknown = 'pending';
    ops.write('pixelmeba/journal.tmp', 'x').then(
      () => (written = 'written'),
      (e: unknown) => (written = e),
    );
    clock += 30_000;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(written).toBeInstanceOf(Error);
    expect((written as Error).message).toContain('did not answer');
    expect(ops.failed).toBe(true);
  });
});
