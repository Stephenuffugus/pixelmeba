/**
 * P4.10 (D-0092): the Android app's file store (src/persistence/capacitorFs.ts).
 *
 * - The StorageBackend contract (tests/persistence/backend-contract.ts) holds for MemoryBackend and for
 *   FilesystemBackend over MemoryFsOps (with an atomic rename, and with Android's remove-then-rename).
 * - Crash-point enumeration: for a slot save, a checkpoint commit, a shelf commit and a remove, the commit is
 *   cut after every k of its N operations, the store is reopened on the same files, and it holds exactly the
 *   old state when the cut came before the journal's rename to journal.json and exactly the new one after
 *   it — never nothing, never a damaged record; the predecessor is kept; no *.tmp, journal or orphan record is
 *   left; and a crash during that recovery (every k again) still converges.
 */
import { describe, expect, it } from 'vitest';
import { CheckpointRing, CHECKPOINT_RING_SIZE } from '../../src/persistence/checkpoints';
import { FilesystemBackend, fsIdOf, fsName, FS_ROOT, fromBase64, MemoryFsOps, toBase64, toStorageError } from '../../src/persistence/capacitorFs';
import { Shelf } from '../../src/persistence/shelf';
import { isStorageFull, MemoryBackend, SaveStore, StorageFullError } from '../../src/persistence/store';
import { backendContract, noise, req, verifyText } from './backend-contract';

// ------------------------------------------------------------------------------------------- contract

backendContract('MemoryBackend', () => {
  const backend = new MemoryBackend();
  return Promise.resolve({
    backend,
    failNextCommit: () => {
      backend.failNextCommit = true;
    },
    limitTo: async (extra) => {
      backend.quotaBytes = (await backend.usage()).bytes + extra;
    },
    corruptRecord: (id) => {
      const r = backend.records[id]!;
      backend.records[id] = { ...r, data: new Uint8Array([1, 2, 3, 4]) };
      return Promise.resolve();
    },
  });
});

for (const splitRename of [false, true]) {
  backendContract(`FilesystemBackend(MemoryFsOps${splitRename ? ', remove-then-rename' : ''})`, async () => {
    const ops = new MemoryFsOps({}, { splitRename });
    const backend = await FilesystemBackend.open(ops);
    return {
      backend,
      failNextCommit: () => {
        ops.failNextWrite = true;
      },
      limitTo: (extra) => {
        let n = 0;
        for (const t of Object.values(ops.files)) n += new TextEncoder().encode(t).byteLength;
        ops.quotaBytes = n + extra;
        return Promise.resolve();
      },
      corruptRecord: (id) => {
        ops.files[`${FS_ROOT}/records/${fsName(id)}.json`] = '{"recordId": broken';
        return Promise.resolve();
      },
    };
  });
}

// ------------------------------------------------------------------------------------------- names, base64, errors

describe('file names and encodings', () => {
  it('name() is reversible and never contains ":" "/" or "\\\\"', () => {
    const ids = [
      'slot1:2026-10-12T04:05:00.000Z:1a',
      'checkpoint-00000012-ab12cd34:2026-10-12T04:05:00.000Z:z',
      'shelf-baseline-00000001-w:2026-10-12T00:00:00Z:3',
      'autosave',
      'a/b\\c:d_e~f.G',
      'Ünïcödé · ✓',
      '',
    ];
    for (const id of ids) {
      const n = fsName(id);
      expect(n).not.toMatch(/[:/\\]/u);
      expect(n).toMatch(/^[a-z0-9_-]*$/u);
      expect(fsIdOf(n)).toBe(id);
    }
    expect(fsName('Slot1')).not.toBe(fsName('slot1')); // case-safe on case-insensitive file systems
    expect(fsIdOf('bad:name')).toBeNull();
    expect(fsIdOf('_zz')).toBeNull();
  });

  it('base64 round-trips any bytes', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 100, 70_000]) {
      const b = new Uint8Array(n);
      for (let i = 0; i < n; i++) b[i] = (i * 151 + 7) & 255;
      const t = toBase64(b);
      expect(t).toBe(Buffer.from(b).toString('base64'));
      expect(Array.from(fromBase64(t))).toEqual(Array.from(b));
    }
    expect(() => fromBase64('abc')).toThrow();
    expect(() => fromBase64('ab$=')).toThrow();
  });

  it('out-of-space errors become StorageFullError; others pass through', () => {
    expect(isStorageFull(toStorageError(new Error("'writeFile' failed with: write failed: ENOSPC (No space left on device)")))).toBe(true);
    const q = new Error('quota');
    Object.defineProperty(q, 'name', { value: 'QuotaExceededError' });
    expect(isStorageFull(toStorageError(q))).toBe(true);
    expect(toStorageError(new StorageFullError('x'))).toBeInstanceOf(StorageFullError);
    expect(isStorageFull(toStorageError(new Error('simulated write failure')))).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------- crash points

const JOURNAL = `${FS_ROOT}/journal.json`;
const COMMIT_POINT = `rename ${FS_ROOT}/journal.tmp ${JOURNAL}`;

interface Scenario {
  readonly name: string;
  /** Build the starting files. */
  setup(b: FilesystemBackend): Promise<void>;
  /** The interrupted operation. */
  act(b: FilesystemBackend): Promise<unknown>;
  /** Assert the store (just reopened) holds exactly the old or exactly the new state. */
  check(b: FilesystemBackend, expectNew: boolean): Promise<void>;
}

const WRITER = 'crash';

const slotSave: Scenario = {
  name: 'a slot save',
  async setup(b) {
    const s = new SaveStore(b);
    await s.save(req('slot1', 'P0'));
    await s.save(req('slot1', 'A'));
    await s.save(req('slot2', 'other'));
  },
  act: (b) => new SaveStore(b).save({ ...req('slot1', 'B'), savedAt: '2026-10-12T09:00:00.000Z' }),
  async check(b, expectNew) {
    const s = new SaveStore(b);
    const slot = (await b.getSlot('slot1'))!;
    expect((await s.load('slot1', verifyText))).toEqual({ text: expectNew ? 'SAVE B' : 'SAVE A', usedPredecessor: false });
    // The predecessor is retained (and loads).
    const prev = await b.getRecord(slot.previous!);
    expect(prev).not.toBeNull();
    expect(slot.name).toBe(expectNew ? 'Dish B' : 'Dish A');
    expect((await s.load('slot2', verifyText))?.text).toBe('SAVE other');
  },
};

const checkpointCommit: Scenario = {
  name: 'a checkpoint commit (with the eviction of the oldest)',
  async setup(b) {
    const ring = new CheckpointRing(b, undefined, WRITER);
    for (let i = 0; i < CHECKPOINT_RING_SIZE; i++) await ring.write({ text: `SAVE ck${i}`, checksum: `c${i}`, name: 'Dish', worldId: 'w', tick: 600 * (i + 1), savedAt: `2026-10-12T01:00:${String(i).padStart(2, '0')}.000Z`, recipeId: null });
    await new SaveStore(b).save(req('slot1', 'named'));
  },
  act: (b) => new CheckpointRing(b, undefined, WRITER).write({ text: 'SAVE ckNew', checksum: 'cNew', name: 'Dish', worldId: 'w', tick: 99_000, savedAt: '2026-10-12T02:00:00.000Z', recipeId: null }),
  async check(b, expectNew) {
    const ring = new CheckpointRing(b, undefined, WRITER);
    const held = await ring.list();
    expect(held.length).toBe(CHECKPOINT_RING_SIZE);
    const texts: string[] = [];
    for (const s of held) texts.push((await new SaveStore(b).load(s.slotId, verifyText))!.text);
    expect(texts.includes('SAVE ckNew')).toBe(expectNew);
    expect(texts.includes('SAVE ck0')).toBe(!expectNew);
    expect((await new SaveStore(b).load('slot1', verifyText))?.text).toBe('SAVE named');
  },
};

const shelfCommit: Scenario = {
  name: 'a shelf commit',
  async setup(b) {
    await new SaveStore(b).save(req('slot1', 'named'));
    await new Shelf(b, undefined, WRITER).put('snapshot', { text: 'SAVE snap0', checksum: 's0', name: 'Dish', worldId: 'w', tick: 10, savedAt: '2026-10-12T03:00:00.000Z', recipeId: null, createdFor: 'bm-0' });
  },
  act: (b) => new Shelf(b, undefined, WRITER).put('snapshot', { text: 'SAVE snap1', checksum: 's1', name: 'Dish', worldId: 'w', tick: 20, savedAt: '2026-10-12T03:00:01.000Z', recipeId: null, createdFor: 'bm-1' }),
  async check(b, expectNew) {
    const shelf = new Shelf(b, undefined, WRITER);
    const held = await shelf.list('snapshot');
    expect(held.map((s) => s.createdFor)).toEqual(expectNew ? ['bm-0', 'bm-1'] : ['bm-0']);
    for (const s of held) expect(await shelf.get(s.slotId, (t) => verifyText(t))).not.toBeNull();
    expect((await new SaveStore(b).load('slot1', verifyText))?.text).toBe('SAVE named');
  },
};

const removeSlot: Scenario = {
  name: 'a remove',
  async setup(b) {
    const s = new SaveStore(b);
    await s.save(req('slot1', 'A'));
    await s.save(req('slot1', 'B'));
    await s.save(req('slot2', 'other'));
  },
  act: (b) => new SaveStore(b).remove('slot1'),
  async check(b, expectNew) {
    const s = new SaveStore(b);
    const got = await s.load('slot1', verifyText);
    if (expectNew) expect(got).toBeNull();
    else {
      expect(got).toEqual({ text: 'SAVE B', usedPredecessor: false });
      const slot = (await b.getSlot('slot1'))!;
      expect(await b.getRecord(slot.previous!)).not.toBeNull();
    }
    expect((await s.load('slot2', verifyText))?.text).toBe('SAVE other');
  },
};

/** No *.tmp, no journal and no record that no slot names are left after an open. */
function expectClean(ops: MemoryFsOps): void {
  const paths = Object.keys(ops.files);
  expect(paths.filter((p) => p.endsWith('.tmp'))).toEqual([]);
  expect(paths).not.toContain(JOURNAL);
  const referenced = new Set<string>();
  for (const p of paths.filter((x) => x.startsWith(`${FS_ROOT}/slots/`))) {
    const s = JSON.parse(ops.files[p]!) as { current: string; previous: string | null };
    referenced.add(s.current);
    if (s.previous) referenced.add(s.previous);
  }
  for (const p of paths.filter((x) => x.startsWith(`${FS_ROOT}/records/`))) {
    const id = fsIdOf(p.slice(`${FS_ROOT}/records/`.length, -'.json'.length));
    expect(id !== null && referenced.has(id)).toBe(true);
  }
}

async function baseFiles(sc: Scenario, splitRename: boolean): Promise<Record<string, string>> {
  const ops = new MemoryFsOps({}, { splitRename });
  await sc.setup(await FilesystemBackend.open(ops));
  return ops.snapshotFiles();
}

/** The operations of one uninterrupted act, and where its commit point falls among them. */
async function measure(sc: Scenario, base: Record<string, string>, splitRename: boolean): Promise<{ n: number; commitAt: number; log: string[] }> {
  const ops = MemoryFsOps.fromFiles(base, { splitRename });
  const b = await FilesystemBackend.open(ops);
  const from = ops.log.length;
  await sc.act(b);
  const log = ops.log.slice(from);
  const commitAt = log.indexOf(COMMIT_POINT);
  return { n: log.length, commitAt, log };
}

for (const splitRename of [false, true]) {
  describe(`crash-point enumeration (${splitRename ? 'remove-then-rename, as on Android' : 'atomic rename'})`, () => {
    for (const sc of [slotSave, checkpointCommit, shelfCommit, removeSlot]) {
      it(`${sc.name}: a crash after any of its operations reopens to exactly the old or the new state`, async () => {
        const base = await baseFiles(sc, splitRename);
        const { n, commitAt } = await measure(sc, base, splitRename);
        expect(commitAt).toBeGreaterThan(0);
        expect(n).toBeGreaterThan(commitAt);
        let sawOld = 0;
        let sawNew = 0;
        let recoveryCuts = 0;
        for (let k = 0; k <= n; k++) {
          const ops = MemoryFsOps.fromFiles(base, { splitRename });
          const b = await FilesystemBackend.open(ops);
          ops.crashAfter(k);
          await sc.act(b).catch(() => undefined);
          // The commit point is operation `commitAt`: it ran exactly when the cut came after it.
          const expectNew = k > commitAt;
          if (expectNew) sawNew++;
          else sawOld++;
          const crashed = ops.snapshotFiles();

          // Relaunch on the same files.
          const ops2 = MemoryFsOps.fromFiles(crashed, { splitRename });
          const b2 = await FilesystemBackend.open(ops2);
          expectClean(ops2);
          await sc.check(b2, expectNew);

          // A crash during that recovery, after each of its operations, still converges.
          const probe = MemoryFsOps.fromFiles(crashed, { splitRename });
          await FilesystemBackend.open(probe);
          const r = probe.opCount;
          for (let j = 0; j < r; j++) {
            const ops3 = MemoryFsOps.fromFiles(crashed, { splitRename });
            ops3.crashAfter(j);
            await FilesystemBackend.open(ops3).catch(() => undefined);
            const ops4 = MemoryFsOps.fromFiles(ops3.snapshotFiles(), { splitRename });
            const b4 = await FilesystemBackend.open(ops4);
            expectClean(ops4);
            await sc.check(b4, expectNew);
            recoveryCuts++;
          }
        }
        expect(sawOld).toBe(commitAt + 1);
        expect(sawNew).toBe(n - commitAt);
        expect(recoveryCuts).toBeGreaterThan(n);
      });
    }
  });
}

describe('FilesystemBackend details', () => {
  it('commit order: records (tmp → read back → rename), then the journal (the commit point), then the dropped records, then the slots, then the journal goes', async () => {
    const ops = new MemoryFsOps();
    const b = await FilesystemBackend.open(ops);
    const s = new SaveStore(b);
    await s.save(req('slot1', 'A'));
    const from = ops.log.length;
    await s.save(req('slot1', 'B'));
    await s.save(req('slot1', 'C')); // deletes A's record
    const log = ops.log.slice(from).map((l) => l.replace(/records\/[a-z0-9_-]+/gu, 'records/R'));
    const second = log.slice(log.lastIndexOf('read pixelmeba/slots/slot1.json'));
    expect(second).toEqual([
      'read pixelmeba/slots/slot1.json', // SaveStore.save asks for the slot's current pointer
      'read pixelmeba/records/R.json', // a new record id never replaces a record
      'write pixelmeba/records/R.json.tmp',
      'read pixelmeba/records/R.json.tmp',
      'rename pixelmeba/records/R.json.tmp pixelmeba/records/R.json',
      'write pixelmeba/journal.tmp',
      'read pixelmeba/journal.tmp',
      COMMIT_POINT,
      'remove pixelmeba/records/R.json', // D-0095: the dropped record first (its space lets the pointer be written)
      'write pixelmeba/slots/slot1.json.tmp',
      'read pixelmeba/slots/slot1.json.tmp',
      'rename pixelmeba/slots/slot1.json.tmp pixelmeba/slots/slot1.json',
      `remove ${JOURNAL}`,
    ]);
  });

  it('a torn record or journal write is caught by the read-back: the commit rejects and the old save stays', async () => {
    for (const torn of [`${FS_ROOT}/records/*`, `${FS_ROOT}/journal.tmp`]) {
      const ops = new MemoryFsOps();
      const b = await FilesystemBackend.open(ops);
      const s = new SaveStore(b);
      const a = await s.save(req('slot1', 'A'));
      const before = ops.snapshotFiles();
      ops.tear(torn);
      await expect(s.save(req('slot1', 'B'))).rejects.toThrow(/did not read back the same/u);
      // D-0095: the refused commit removed what it wrote (no .tmp, no new record), before any reopen.
      expect(ops.snapshotFiles()).toEqual(before);
      expect(await b.getSlot('slot1')).toEqual(a);
      expect(await s.load('slot1', verifyText)).toEqual({ text: 'SAVE A', usedPredecessor: false });
      const ops2 = MemoryFsOps.fromFiles(ops.snapshotFiles());
      const b2 = await FilesystemBackend.open(ops2);
      expectClean(ops2);
      expect(await new SaveStore(b2).load('slot1', verifyText)).toEqual({ text: 'SAVE A', usedPredecessor: false });
    }
  });

  it('a torn slot write after the commit point is repaired before the next operation (the commit is durable)', async () => {
    const ops = new MemoryFsOps();
    const b = await FilesystemBackend.open(ops);
    const s = new SaveStore(b);
    await s.save(req('slot1', 'A'));
    ops.tear(`${FS_ROOT}/slots/slot1.json.tmp`);
    await s.save(req('slot1', 'B')); // resolves: past the commit point
    expect(Object.keys(ops.files)).toContain(JOURNAL); // not yet applied
    expect(await s.load('slot1', verifyText)).toEqual({ text: 'SAVE B', usedPredecessor: false }); // replayed first
    expect(Object.keys(ops.files)).not.toContain(JOURNAL);
  });

  it('a damaged record file reads as null, so the load falls back to the predecessor', async () => {
    const ops = new MemoryFsOps();
    const b = await FilesystemBackend.open(ops);
    const s = new SaveStore(b);
    await s.save(req('slot1', 'A'));
    const cur = await s.save(req('slot1', 'B'));
    const path = `${FS_ROOT}/records/${fsName(cur.current)}.json`;
    const good = ops.files[path]!;
    for (const damage of ['', 'not json', JSON.stringify({ recordId: 'other', checksum: 'x', data: '' }), good.replace(/"data":"[A-Za-z0-9+/]{8}/u, '"data":"$$$$$$$$$$$$$$$$')]) {
      ops.files[path] = damage;
      expect(await b.getRecord(cur.current)).toBeNull();
      expect(await s.load('slot1', verifyText)).toEqual({ text: 'SAVE A', usedPredecessor: true });
    }
    // Valid base64 with damaged gzip bytes: the record reads, its text does not, so the predecessor opens.
    const o = JSON.parse(good) as { data: string };
    const mid = Math.floor(o.data.length / 2) & ~3;
    ops.files[path] = JSON.stringify({ ...o, data: o.data.slice(0, mid) + 'AAAAAAAA' + o.data.slice(mid + 8) });
    expect(await b.getRecord(cur.current)).not.toBeNull();
    expect(await s.load('slot1', verifyText)).toEqual({ text: 'SAVE A', usedPredecessor: true });
  });

  it('usage() is the bytes of the record and slot files (quota unknown)', async () => {
    const ops = new MemoryFsOps();
    const b = await FilesystemBackend.open(ops);
    await new SaveStore(b).save(req('slot1', noise(3000, 9)));
    await new SaveStore(b).save(req('slot2', 'small'));
    let expected = 0;
    for (const [p, t] of Object.entries(ops.files)) if (p.startsWith(`${FS_ROOT}/records/`) || p.startsWith(`${FS_ROOT}/slots/`)) expected += new TextEncoder().encode(t).byteLength;
    expect(await b.usage()).toEqual({ bytes: expected, quota: null });
    expect(expected).toBeGreaterThan(3000);
  });

  it('two commits started together run one after the other, and both land', async () => {
    const ops = new MemoryFsOps();
    const b = await FilesystemBackend.open(ops);
    const slot = (id: string, rec: string) => ({ slotId: id, name: id, tick: 0, savedAt: 't', recipeId: null, current: rec, previous: null, bytes: 1, checksum: rec });
    const from = ops.log.length;
    await Promise.all([
      b.commit({ putRecords: [{ recordId: 'r:one', data: new Uint8Array([1]), checksum: 'r:one' }], putSlots: [slot('slot1', 'r:one')], deleteRecords: [], deleteSlots: [] }),
      b.commit({ putRecords: [{ recordId: 'r:two', data: new Uint8Array([2]), checksum: 'r:two' }], putSlots: [slot('slot2', 'r:two')], deleteRecords: [], deleteSlots: [] }),
    ]);
    const log = ops.log.slice(from);
    // The first commit's journal is removed before the second commit touches anything.
    const firstDone = log.indexOf(`remove ${JOURNAL}`);
    const secondStart = log.findIndex((l) => l.includes(fsName('r:two')));
    expect(firstDone).toBeGreaterThan(0);
    expect(secondStart).toBeGreaterThan(firstDone);
    expect(log.filter((l) => l.includes(fsName('r:one'))).every((_, i, all) => log.indexOf(all[i]!) < firstDone)).toBe(true);
    const s = new SaveStore(b);
    expect((await b.getSlot('slot1'))?.current).toBe('r:one');
    expect((await b.getSlot('slot2'))?.current).toBe('r:two');
    expect((await s.list()).length).toBe(2);
  });

  it('a record id already on disk is never replaced', async () => {
    const ops = new MemoryFsOps();
    const b = await FilesystemBackend.open(ops);
    const data = new Uint8Array([1, 2, 3]);
    await b.commit({ putRecords: [{ recordId: 'r:1', data, checksum: 'a' }], putSlots: [{ slotId: 'slot1', name: 'x', tick: 0, savedAt: 't', recipeId: null, current: 'r:1', previous: null, bytes: 3, checksum: 'a' }], deleteRecords: [], deleteSlots: [] });
    await expect(b.commit({ putRecords: [{ recordId: 'r:1', data: new Uint8Array([9]), checksum: 'b' }], putSlots: [], deleteRecords: [], deleteSlots: [] })).rejects.toThrow(/already exists/u);
    expect((await b.getRecord('r:1'))?.checksum).toBe('a');
  });
});

// ------------------------------------------------------------------------------------------- D-0095 (wave 7a integration)

/** Android's out-of-space rejection (Filesystem 8.1.3 operationFailed with the IOException's message). */
const ENOSPC = "'writeFile' failed with: write failed: ENOSPC (No space left on device)";
const recordsOf = (ops: MemoryFsOps, slotId: string): string[] => Object.keys(ops.files).filter((p) => p.startsWith(`${FS_ROOT}/records/${fsName(`${slotId}:`)}`));

describe('D-0095: a full device, a damaged slot file, a refused commit', () => {
  it('a commit refused before its commit point (out of space) leaves the files exactly as they were, retry after retry', async () => {
    const ops = new MemoryFsOps();
    const s = new SaveStore(await FilesystemBackend.open(ops));
    await s.save(req('slot1', 'A'));
    const before = ops.snapshotFiles();
    for (const refused of [`write ${FS_ROOT}/records/`, `write ${FS_ROOT}/journal.tmp`]) {
      ops.failOp = (what) => (what.startsWith(refused) ? new Error(ENOSPC) : null);
      for (let i = 0; i < 3; i++) {
        const err = await s.save(req('slot1', `B${i}`)).catch((e: unknown) => e);
        expect(isStorageFull(err)).toBe(true);
        expect(ops.snapshotFiles()).toEqual(before); // its new record and journal.tmp were removed at once
      }
    }
    ops.failOp = null;
    expect(await s.load('slot1', verifyText)).toEqual({ text: 'SAVE A', usedPredecessor: false });
  });

  it('a journal rename that reports a failure but landed keeps the new records: a relaunch opens the new save intact', async () => {
    /** Android's copy fallback can write journal.json and then fail to delete the source. */
    class LandedRename extends MemoryFsOps {
      armed = false;
      override async rename(from: string, to: string): Promise<void> {
        await super.rename(from, to);
        if (this.armed && to === JOURNAL) {
          this.armed = false;
          throw new Error("'rename' failed with: the source could not be deleted");
        }
      }
    }
    const ops = new LandedRename();
    const s = new SaveStore(await FilesystemBackend.open(ops));
    await s.save(req('slot1', 'A'));
    ops.armed = true;
    await expect(s.save(req('slot1', 'B'))).rejects.toThrow(/could not be deleted/u);
    expect(recordsOf(ops, 'slot1').length).toBe(2); // not discarded: the commit point may have passed
    const ops2 = MemoryFsOps.fromFiles(ops.snapshotFiles());
    const s2 = new SaveStore(await FilesystemBackend.open(ops2));
    expect(await s2.load('slot1', verifyText)).toEqual({ text: 'SAVE B', usedPredecessor: false });
    expectClean(ops2);
  });

  it('out of space after the commit point: every save stays readable, writes are refused as storage full, a relaunch while full opens, freeing space completes the commit', async () => {
    const full = (what: string): Error | null => (what.startsWith(`write ${FS_ROOT}/slots/`) ? new Error(ENOSPC) : null);
    const ops = new MemoryFsOps();
    const b = await FilesystemBackend.open(ops);
    const s = new SaveStore(b);
    await s.save(req('slot1', 'A'));
    await s.save(req('slot2', 'C'));
    ops.failOp = full;
    await s.save(req('slot1', 'B')); // resolves: past the commit point
    expect(Object.keys(ops.files)).toContain(JOURNAL); // not applied: the slot pointer could not be written
    // Reads see the journal laid over the files.
    expect((await b.listSlots()).map((x) => [x.slotId, x.name])).toEqual([
      ['slot1', 'Dish B'],
      ['slot2', 'Dish C'],
    ]);
    expect(await s.load('slot1', verifyText)).toEqual({ text: 'SAVE B', usedPredecessor: false });
    expect(await s.load('slot2', verifyText)).toEqual({ text: 'SAVE C', usedPredecessor: false });
    // Writes are refused as storage full and change nothing.
    const held = ops.snapshotFiles();
    expect(isStorageFull(await s.save(req('slot2', 'D')).catch((e: unknown) => e))).toBe(true);
    expect(isStorageFull(await s.remove('slot2').catch((e: unknown) => e))).toBe(true);
    expect(ops.snapshotFiles()).toEqual(held);
    // A relaunch while still full opens (before D-0095 the open failed and the app fell back to memory).
    const ops2 = MemoryFsOps.fromFiles(ops.snapshotFiles());
    ops2.failOp = full;
    const b2 = await FilesystemBackend.open(ops2);
    const s2 = new SaveStore(b2);
    expect(await s2.load('slot1', verifyText)).toEqual({ text: 'SAVE B', usedPredecessor: false });
    expect(await s2.load('slot2', verifyText)).toEqual({ text: 'SAVE C', usedPredecessor: false });
    const slot1 = (await b2.getSlot('slot1'))!;
    expect((await b2.getRecord(slot1.previous!))?.checksum).toBe('sha256:A'); // the predecessor is kept
    // Space freed: the next operation applies the journal, then the save goes through.
    ops2.failOp = null;
    await s2.save(req('slot2', 'D'));
    expect(await s2.load('slot2', verifyText)).toEqual({ text: 'SAVE D', usedPredecessor: false });
    expect(await s2.load('slot1', verifyText)).toEqual({ text: 'SAVE B', usedPredecessor: false });
    const ops3 = MemoryFsOps.fromFiles(ops2.snapshotFiles());
    await FilesystemBackend.open(ops3);
    expectClean(ops3);
  });

  it('a slot file that cannot be read keeps its saves on disk at the next open; true orphans are still removed', async () => {
    const ops = new MemoryFsOps();
    const s = new SaveStore(await FilesystemBackend.open(ops));
    await s.save(req('slot1', 'A'));
    await s.save(req('slot1', 'B'));
    await s.save(req('slot2', 'C'));
    const slotFile = `${FS_ROOT}/slots/slot1.json`;
    ops.files[slotFile] = ops.files[slotFile]!.slice(0, 20); // torn by a power cut after its rename, or damaged
    const orphan = `${FS_ROOT}/records/${fsName('slot3:2026-10-12T00:00:00.000Z:9')}.json`;
    ops.files[orphan] = '{}'; // a record of a commit that never reached its commit point
    expect(recordsOf(ops, 'slot1').length).toBe(2);
    const ops2 = MemoryFsOps.fromFiles(ops.snapshotFiles());
    const b2 = await FilesystemBackend.open(ops2);
    expect(recordsOf(ops2, 'slot1').length).toBe(2); // before D-0095 the sweep removed both
    expect(Object.keys(ops2.files)).not.toContain(orphan);
    expect((await b2.listSlots()).map((x) => x.slotId)).toEqual(['slot2']);
    expect(await new SaveStore(b2).load('slot2', verifyText)).toEqual({ text: 'SAVE C', usedPredecessor: false });
  });
});
