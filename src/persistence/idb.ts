/**
 * IndexedDB backend (web and the Android WebView). One readwrite transaction per commit makes the
 * new record and the slot pointer land atomically (DECISIONS D-0013).
 */
import type { SlotInfo, StorageBackend, StoredRecord } from './store';

const DB_NAME = 'pixelmeba';
const DB_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

export function openDb(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = factory.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'recordId' });
      if (!db.objectStoreNames.contains('slots')) db.createObjectStore('slots', { keyPath: 'slotId' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('IndexedDB unavailable'));
    open.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  });
}

export class IdbBackend implements StorageBackend {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(factory?: IDBFactory): Promise<IdbBackend> {
    return new IdbBackend(await openDb(factory));
  }

  async getSlot(slotId: string): Promise<SlotInfo | null> {
    const tx = this.db.transaction('slots', 'readonly');
    return ((await req(tx.objectStore('slots').get(slotId))) as SlotInfo | undefined) ?? null;
  }

  async listSlots(): Promise<SlotInfo[]> {
    const tx = this.db.transaction('slots', 'readonly');
    return (await req(tx.objectStore('slots').getAll())) as SlotInfo[];
  }

  async getRecord(recordId: string): Promise<StoredRecord | null> {
    const tx = this.db.transaction('records', 'readonly');
    return ((await req(tx.objectStore('records').get(recordId))) as StoredRecord | undefined) ?? null;
  }

  commit(ops: { putRecords: StoredRecord[]; putSlots: SlotInfo[]; deleteRecords: string[]; deleteSlots: string[] }): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['records', 'slots'], 'readwrite');
      const records = tx.objectStore('records');
      const slots = tx.objectStore('slots');
      for (const r of ops.putRecords) records.put(r);
      for (const s of ops.putSlots) slots.put(s);
      for (const id of ops.deleteRecords) records.delete(id);
      for (const id of ops.deleteSlots) slots.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('save transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('save transaction aborted'));
    });
  }
}
