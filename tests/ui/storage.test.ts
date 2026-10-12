/**
 * P4.8b the storage panel's model (src/ui/storage.ts; D02 §20 "Show approximate storage used and offer
 * explicit cleanup. Never silently evict named dish saves."; D-0082).
 *
 * - group sums (each named slot with its previous copy; Continue; checkpoints; starting points; snapshots);
 * - every cleanup asks first: askRemove never reaches the worker; confirmRemove sends exactly one removal;
 *   Cancel sends none; each confirmation names what goes and what stays;
 * - no group action and no row action touches a named slot or Continue (no question, askRemove false), and
 *   the worker refuses one as well (tests/worker/bookmarks-host.test.ts).
 */
import { describe, expect, it } from 'vitest';
import type { StorageInfo, StorageRow } from '../../src/worker/storage';
import { storageRemovable } from '../../src/worker/storage';
import { askRemove, cancelRemove, confirmRemove, pendingRemove, refreshStorage, removeQuestion, rowBytes, storageGroups, storageInfoNow, storageTotal, usageLine, type StorageClient } from '../../src/ui/storage';

function row(slotId: string, kind: StorageRow['kind'], bytes: number, previousBytes = 0): StorageRow {
  return { slotId, kind, name: slotId, tick: 600, savedAt: '2026-10-11T00:00:00.000Z', bytes, previousBytes, checksum: `sha256:${'b'.repeat(64)}`, createdFor: null };
}

const INFO: StorageInfo = {
  estimate: { usage: 3 * 1024 * 1024, quota: 2 * 1024 * 1024 * 1024 },
  slots: [row('autosave', 'autosave', 500, 400), row('slot1', 'slot', 1000, 900), row('slot2', 'slot', 2000, 0)],
  checkpoints: [row('checkpoint-00000002-w', 'checkpoint', 300), row('checkpoint-00000001-w', 'checkpoint', 200)],
  shelf: [row('shelf-baseline-00000001-w', 'baseline', 700), row('shelf-snapshot-00000001-w', 'snapshot', 800), row('shelf-snapshot-00000002-w', 'snapshot', 50)],
};

class Recorder implements StorageClient {
  readonly calls: string[] = [];
  storageInfo(): Promise<StorageInfo> {
    this.calls.push('info');
    return Promise.resolve(INFO);
  }
  storageRemove(slotId: string): Promise<{ storage: StorageInfo; removed: boolean }> {
    this.calls.push(`remove ${slotId}`);
    return Promise.resolve({ storage: { ...INFO, shelf: INFO.shelf.filter((r) => r.slotId !== slotId), checkpoints: INFO.checkpoints.filter((r) => r.slotId !== slotId) }, removed: true });
  }
}

describe('storage groups', () => {
  it('sums each group, counting a named slot’s kept previous copy', () => {
    const g = Object.fromEntries(storageGroups(INFO).map((x) => [x.id, x]));
    expect(storageGroups(INFO).map((x) => x.id)).toEqual(['saved', 'continue', 'checkpoints', 'baselines', 'snapshots']);
    expect(g.saved!.bytes).toBe(1000 + 900 + 2000);
    expect(g.saved!.rows.map((r) => r.slotId)).toEqual(['slot1', 'slot2']);
    expect(g.continue!.bytes).toBe(900);
    expect(g.checkpoints!.bytes).toBe(500);
    expect(g.baselines!.bytes).toBe(700);
    expect(g.snapshots!.bytes).toBe(850);
    expect(storageTotal(INFO)).toBe(3900 + 900 + 500 + 700 + 850);
    expect(rowBytes(INFO.slots[1]!)).toBe(1900);
    expect(g.saved!.removable).toBe(false);
    expect(g.continue!.removable).toBe(false);
    expect(usageLine(INFO.estimate)).toBe('About 3.0 MB of 2.0 GB used on this device');
    expect(usageLine(null)).toBe('Storage use is not available in this browser.');
  });
});

describe('cleanup', () => {
  it('every cleanup asks first; confirming sends exactly one removal; Cancel sends none', async () => {
    const c = new Recorder();
    await refreshStorage(c);
    expect(c.calls).toEqual(['info']);
    for (const r of [...INFO.checkpoints, ...INFO.shelf]) {
      expect(askRemove(r.slotId)).toBe(true);
      expect(pendingRemove.value).toBe(r.slotId);
      expect(c.calls).toEqual(['info']); // asking never reaches the worker
      cancelRemove();
      expect(pendingRemove.value).toBeNull();
    }
    expect(await confirmRemove(c)).toBe(false); // nothing was asked: nothing is removed
    expect(c.calls).toEqual(['info']);
    expect(askRemove('shelf-snapshot-00000001-w')).toBe(true);
    expect(await confirmRemove(c)).toBe(true);
    expect(c.calls).toEqual(['info', 'remove shelf-snapshot-00000001-w']);
    expect(storageInfoNow.value!.shelf.map((r) => r.slotId)).toEqual(['shelf-baseline-00000001-w', 'shelf-snapshot-00000002-w']);
  });

  it('each confirmation names what goes and what stays', () => {
    expect(removeQuestion(row('checkpoint-1-w', 'checkpoint', 1))).toBe('Remove this automatic checkpoint? Your saved dishes and Continue stay.');
    expect(removeQuestion(row('shelf-baseline-1-w', 'baseline', 1))).toBe('Remove this starting point? Turns already played stay; Another turn will be unavailable.');
    expect(removeQuestion(row('shelf-snapshot-1-w', 'snapshot', 1))).toBe('Remove this snapshot? The bookmark text stays in its dish.');
  });

  it('no group action touches a named slot or Continue', async () => {
    const c = new Recorder();
    await refreshStorage(c);
    for (const r of INFO.slots) {
      expect(removeQuestion(r)).toBeNull();
      expect(askRemove(r.slotId)).toBe(false);
      expect(pendingRemove.value).toBeNull();
      expect(storageRemovable(r.slotId)).toBe(false);
    }
    // Even a pending value forced to a named slot is never sent.
    pendingRemove.value = 'slot1';
    expect(await confirmRemove(c)).toBe(false);
    expect(c.calls).toEqual(['info']);
    for (const r of [...INFO.checkpoints, ...INFO.shelf]) expect(storageRemovable(r.slotId)).toBe(true);
    // There is no "remove all" in the model: the only removal takes one confirmed row.
    const exported = Object.keys(await import('../../src/ui/storage'));
    expect(exported.filter((k) => /all|group|clear|evict/i.test(k) && k !== 'storageGroups')).toEqual([]);
  });
});
