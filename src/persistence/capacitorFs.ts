/**
 * P4.10 (D-0092; ARCH §11.1, §12; SPEC §14.1–§14.3): the save store on the Android app, as files in the
 * app's private data directory (Capacitor Filesystem, Directory.Data). Pure TypeScript with no Capacitor
 * import: it runs in the worker and reaches the files through `FsOps` (src/persistence/fsPort.ts, which
 * asks the main thread's src/platform/fsHost.ts), and in tests through `MemoryFsOps`.
 *
 * It keeps the StorageBackend contract the rest of the code relies on (SaveStore, the checkpoint ring and
 * the shelf): one commit is atomic over several records and slot pointers (D-0013's reason). A file system
 * has no multi-file transaction, so a commit goes through a journal:
 *
 *   (a) each new record: write records/<n>.json.tmp, read it back and compare the text exactly, rename it
 *       to records/<n>.json (a new record id never replaces a record);
 *   (b) write journal.tmp = { putSlots, deleteSlots, deleteRecords }, read it back, compare, rename it to
 *       journal.json — THE COMMIT POINT;
 *   (c) apply the journal: delete the records it drops first (that frees space on a nearly full device),
 *       then each slot pointer by tmp → read back → rename, then delete slots;
 *   (d) remove journal.json.
 *
 * Any failure before (b)'s rename rejects the commit and changes no slot; the commit then removes what it
 * wrote, best effort (anything left is an orphan, removed at the next open). After (b) the commit is
 * durable: it completes now, or before the next operation of this backend, or at the next open (recovery
 * re-applies (c), which is idempotent). While a committed journal cannot be applied (the device is full),
 * reads see the slot files with the journal laid over them, so every save stays readable, and every write
 * is refused with the error that stopped it (D-0095).
 *
 * Layout under `pixelmeba/`: records/<name(recordId)>.json = {"recordId","checksum","data": base64 of the
 * gzip bytes}; slots/<name(slotId)>.json = the SlotInfo; journal.json; and any *.tmp. Text only (UTF-8):
 * the Capacitor bridge carries strings, so the record bytes travel as base64 inside JSON.
 *
 * Renaming onto an existing file: Capacitor Filesystem 8.1.3's Android rename (ionfilesystem-android 1.1.0,
 * IONFILELocalFilesHelper.renameFile) deletes the target and then calls File.renameTo, so the target can be
 * missing for a moment; its web implementation (dist/esm/web.js `_copy`) reads the source, deletes it and
 * writes the target. Neither is atomic. That is safe here only because of the journal: a slot file is
 * replaced only in step (c), after the commit point, and recovery rewrites it from the journal.
 */
import { canonicalJson } from '@sim/hash';
import { isStorageFull, StorageFullError, type SlotInfo, type StorageBackend, type StoredRecord } from './store';

/** What the backend needs from a file system (paths are relative to the platform's data directory). */
export interface FsOps {
  /** The file's text, or null when it does not exist. */
  read(path: string): Promise<string | null>;
  /** Write (create or replace) a text file, creating its parent folders. */
  write(path: string, text: string): Promise<void>;
  /** Move `from` to `to`, replacing `to` when it exists. */
  rename(from: string, to: string): Promise<void>;
  /** Remove a file; a missing file is fine. */
  remove(path: string): Promise<void>;
  /** The names (not paths) of the files in `dir`; [] when it does not exist. */
  list(dir: string): Promise<string[]>;
  /** The file's size in bytes, or null when it does not exist. */
  size?(path: string): Promise<number | null>;
}

export const FS_ROOT = 'pixelmeba';
const RECORDS = `${FS_ROOT}/records`;
const SLOTS = `${FS_ROOT}/slots`;
const JOURNAL = `${FS_ROOT}/journal.json`;
const JOURNAL_TMP = `${FS_ROOT}/journal.tmp`;
const TMP = '.tmp';
const JSON_EXT = '.json';

// ------------------------------------------------------------------------------------------- names

/**
 * A reversible, file-safe name for an id: [a-z0-9-] stay; every other UTF-8 byte (upper case, ':', '.',
 * '_', '/', '\\', …) becomes '_' and two lower-case hex digits. Case-safe and never contains ':' '/' '\\'.
 */
export function fsName(id: string): string {
  let out = '';
  for (const b of new TextEncoder().encode(id)) {
    const ch = String.fromCharCode(b);
    out += (b >= 0x61 && b <= 0x7a) || (b >= 0x30 && b <= 0x39) || b === 0x2d ? ch : `_${b.toString(16).padStart(2, '0')}`;
  }
  return out;
}

/** The id a name came from (`fsName` reversed), or null when it is not one of its names. */
export function fsIdOf(name: string): string | null {
  const bytes: number[] = [];
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c === 0x5f) {
      const hex = name.slice(i + 1, i + 3);
      if (!/^[0-9a-f]{2}$/u.test(hex)) return null;
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else if ((c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c === 0x2d) bytes.push(c);
    else return null;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

const recordPath = (recordId: string): string => `${RECORDS}/${fsName(recordId)}${JSON_EXT}`;
const slotPath = (slotId: string): string => `${SLOTS}/${fsName(slotId)}${JSON_EXT}`;

// ------------------------------------------------------------------------------------------- base64

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

/** Standard base64 (with padding) of `bytes`. */
export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const CHUNK = 3 * 8192;
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(bytes.length, start + CHUNK);
    let s = '';
    for (let i = start; i < end; i += 3) {
      const a = bytes[i]!;
      const b = i + 1 < end ? bytes[i + 1]! : 0;
      const c = i + 2 < end ? bytes[i + 2]! : 0;
      const n = (a << 16) | (b << 8) | c;
      s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < end ? B64[(n >> 6) & 63]! : '=') + (i + 2 < end ? B64[n & 63]! : '=');
    }
    parts.push(s);
  }
  return parts.join('');
}

/** The bytes of standard base64 text; throws on anything that is not. */
export function fromBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0) throw new Error('not base64');
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => {
      const ch = text.charCodeAt(i + k);
      if (ch === 0x3d && i + 4 === text.length && k >= 4 - pad) return 0;
      const x = ch < 128 ? B64_INDEX[ch]! : -1;
      if (x < 0) throw new Error('not base64');
      return x;
    });
    const n = (v[0]! << 18) | (v[1]! << 12) | (v[2]! << 6) | v[3]!;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// ------------------------------------------------------------------------------------------- errors

/**
 * A platform's out-of-space error as StorageFullError (so `isStorageFull` holds and the checkpoint ring and
 * the shelf say "storage full"). Matched: the name QuotaExceededError (IndexedDB, including Capacitor's web
 * Filesystem, which stores in IndexedDB); on Android, Filesystem 8.1.3 rejects a failed write with
 * FilesystemErrors.operationFailed: "'writeFile' failed with: <the Java exception's message>", and a full
 * disk's IOException message carries "ENOSPC (No space left on device)" — both words are matched.
 */
export function toStorageError(e: unknown): Error {
  const m = (e as { message?: unknown } | null)?.message;
  const message = e instanceof Error ? e.message : typeof m === 'string' ? m : String(e);
  if (isStorageFull(e)) return e instanceof Error ? e : new StorageFullError(message);
  if (/ENOSPC|No space left on device|QuotaExceeded|quota exceeded/iu.test(message)) return new StorageFullError(message);
  return e instanceof Error ? e : new Error(message);
}

// ------------------------------------------------------------------------------------------- journal

interface Journal {
  readonly format: 'pixelmeba-fs-journal';
  readonly version: 1;
  readonly putSlots: readonly SlotInfo[];
  readonly deleteSlots: readonly string[];
  readonly deleteRecords: readonly string[];
}

function parseJournal(text: string): Journal | null {
  try {
    const j = JSON.parse(text) as Partial<Journal> | null;
    if (!j || j.format !== 'pixelmeba-fs-journal' || j.version !== 1) return null;
    if (!Array.isArray(j.putSlots) || !Array.isArray(j.deleteSlots) || !Array.isArray(j.deleteRecords)) return null;
    if (!j.putSlots.every((s) => typeof s === 'object' && s !== null && typeof (s as { slotId?: unknown }).slotId === 'string')) return null;
    if (!j.deleteSlots.every((s) => typeof s === 'string') || !j.deleteRecords.every((s) => typeof s === 'string')) return null;
    return j as Journal;
  } catch {
    return null;
  }
}

function parseSlot(text: string, slotId?: string): SlotInfo | null {
  try {
    const s = JSON.parse(text) as SlotInfo | null;
    if (!s || typeof s !== 'object' || typeof s.slotId !== 'string' || typeof s.current !== 'string') return null;
    if (slotId !== undefined && s.slotId !== slotId) return null;
    return s;
  } catch {
    return null;
  }
}

function recordText(r: StoredRecord): string {
  return canonicalJson({ recordId: r.recordId, checksum: r.checksum, data: toBase64(r.data) });
}

/** The journal's last pointer for `slotId`, or null when it writes none (step (c) writes them in order). */
function journalSlot(j: Journal, slotId: string): SlotInfo | null {
  let out: SlotInfo | null = null;
  for (const s of j.putSlots) if (s.slotId === slotId) out = s;
  return out;
}

/** The slots once `j` is applied to `slots` (the pointers it writes, then the slots it deletes), in file-name order. */
function slotsWithJournal(slots: readonly SlotInfo[], j: Journal): SlotInfo[] {
  const out: SlotInfo[] = [];
  for (const s of [...slots, ...j.putSlots]) {
    const i = out.findIndex((x) => x.slotId === s.slotId);
    if (i >= 0) out[i] = s;
    else out.push(s);
  }
  return out.filter((s) => !j.deleteSlots.includes(s.slotId)).sort((a, b) => (fsName(a.slotId) < fsName(b.slotId) ? -1 : fsName(a.slotId) > fsName(b.slotId) ? 1 : 0));
}

// ------------------------------------------------------------------------------------------- backend

export type CommitOps = Parameters<StorageBackend['commit']>[0];

export class FilesystemBackend implements StorageBackend {
  /** Every operation runs after the previous one settles (reads never see a commit half applied). */
  private chain: Promise<unknown> = Promise.resolve();
  /**
   * A journal past its commit point that is not fully applied yet: it is applied before the next operation.
   * While it cannot be (D-0095: the device is full), reads see the files with it laid over them and writes are
   * refused.
   */
  private pending: Journal | null = null;

  private constructor(private readonly ops: FsOps) {}

  /**
   * Open the store on `ops` and recover: re-apply a committed journal and remove it, remove every *.tmp, and
   * remove every record that no slot names as current or previous (an orphan of a commit that never reached
   * its commit point). Idempotent, so a crash during recovery is recovered by the next open. A committed
   * journal that cannot be applied yet does not stop the open: the store opens with it pending (D-0095).
   */
  static async open(ops: FsOps): Promise<FilesystemBackend> {
    const b = new FilesystemBackend(ops);
    await b.recover();
    return b;
  }

  /**
   * Run `f` after every earlier operation. A pending journal is applied first; when that fails, a write is
   * refused with its error and a read goes ahead on the files with the journal laid over them.
   */
  private serial<T>(f: () => Promise<T>, write = false): Promise<T> {
    const run = this.chain.then(async () => {
      if (this.pending) {
        try {
          await this.replayJournal();
        } catch (e) {
          if (write) throw toStorageError(e);
        }
      }
      return f();
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Write `text` to `tmp`, read it back and compare it exactly, then rename it to `path`. */
  private async writeVerified(path: string, text: string, tmp = `${path}${TMP}`): Promise<void> {
    await this.writeChecked(path, text, tmp);
    await this.ops.rename(tmp, path);
  }

  /** Write `text` to `tmp` and read it back; a copy that differs (a torn write) is refused. */
  private async writeChecked(path: string, text: string, tmp: string): Promise<void> {
    await this.ops.write(tmp, text);
    const back = await this.ops.read(tmp);
    if (back !== text) throw new Error(`The stored copy of ${path} did not read back the same; nothing was changed.`);
  }

  /**
   * Step (c) then (d) for a committed journal (idempotent). The records it drops go first: nothing names them
   * once the journal is committed (reads lay the journal over the files), and their space lets the slot
   * pointers be written on a nearly full device.
   */
  private async apply(j: Journal): Promise<void> {
    for (const id of j.deleteRecords) await this.ops.remove(recordPath(id));
    for (const s of j.putSlots) await this.writeVerified(slotPath(s.slotId), canonicalJson(s));
    for (const id of j.deleteSlots) await this.ops.remove(slotPath(id));
    await this.ops.remove(JOURNAL);
  }

  /** Apply the pending journal, or the one on disk (read at open); throws, with the journal kept pending, when it cannot be applied. */
  private async replayJournal(): Promise<void> {
    if (!this.pending) {
      const text = await this.ops.read(JOURNAL);
      if (text === null) return;
      const j = parseJournal(text);
      // journal.json is only ever a verified copy (step (b)); one that does not parse was never committed.
      if (!j) {
        await this.ops.remove(JOURNAL);
        return;
      }
      this.pending = j;
    }
    await this.apply(this.pending);
    this.pending = null;
  }

  private async recover(): Promise<void> {
    try {
      await this.replayJournal();
    } catch (e) {
      // D-0095: a committed journal that cannot be applied yet (a full device) stays pending; anything else fails the open.
      if (!this.pending) throw e;
    }
    for (const dir of [FS_ROOT, RECORDS, SLOTS]) {
      for (const name of await this.ops.list(dir)) if (name.endsWith(TMP)) await this.ops.remove(`${dir}/${name}`);
    }
    const { slots, unreadable } = await this.readSlotFiles();
    const referenced = new Set<string>();
    for (const s of this.pending ? slotsWithJournal(slots, this.pending) : slots) {
      referenced.add(s.current);
      if (s.previous) referenced.add(s.previous);
    }
    for (const name of (await this.ops.list(RECORDS)).sort()) {
      if (!name.endsWith(JSON_EXT)) continue;
      const id = fsIdOf(name.slice(0, -JSON_EXT.length));
      if (id !== null && referenced.has(id)) continue;
      // D-0095: a slot file that cannot be read (torn by a power cut, damaged) keeps its records on disk:
      // record ids begin with their slot's id and ':' (store.ts, checkpoints.ts, shelf.ts).
      if (id !== null && unreadable.some((slotId) => id.startsWith(`${slotId}:`))) continue;
      await this.ops.remove(`${RECORDS}/${name}`);
    }
    if (this.pending) {
      // The sweep may have freed enough space: try once more (it stays pending when it still cannot be applied).
      try {
        await this.replayJournal();
      } catch {
        /* reads lay the journal over the files; writes try it again first */
      }
    }
  }

  /** The slot files that parse, and the ids of those that do not (file-name order). */
  private async readSlotFiles(): Promise<{ readonly slots: SlotInfo[]; readonly unreadable: string[] }> {
    const slots: SlotInfo[] = [];
    const unreadable: string[] = [];
    for (const name of (await this.ops.list(SLOTS)).sort()) {
      if (!name.endsWith(JSON_EXT)) continue;
      const id = fsIdOf(name.slice(0, -JSON_EXT.length));
      if (id === null) continue;
      const text = await this.ops.read(`${SLOTS}/${name}`);
      const s = text === null ? null : parseSlot(text, id);
      if (s) slots.push(s);
      else if (text !== null) unreadable.push(id);
    }
    return { slots, unreadable };
  }

  getSlot(slotId: string): Promise<SlotInfo | null> {
    return this.serial(async () => {
      const j = this.pending;
      if (j) {
        if (j.deleteSlots.includes(slotId)) return null;
        const put = journalSlot(j, slotId);
        if (put) return put;
      }
      const text = await this.ops.read(slotPath(slotId));
      return text === null ? null : parseSlot(text, slotId);
    });
  }

  listSlots(): Promise<SlotInfo[]> {
    return this.serial(async () => {
      const { slots } = await this.readSlotFiles();
      return this.pending ? slotsWithJournal(slots, this.pending) : slots;
    });
  }

  /** The record, or null when its file is missing or does not parse (SaveStore.load then tries the predecessor). */
  getRecord(recordId: string): Promise<StoredRecord | null> {
    return this.serial(async () => {
      if (this.pending?.deleteRecords.includes(recordId)) return null;
      const text = await this.ops.read(recordPath(recordId));
      if (text === null) return null;
      try {
        const r = JSON.parse(text) as { recordId?: unknown; checksum?: unknown; data?: unknown } | null;
        if (!r || r.recordId !== recordId || typeof r.checksum !== 'string' || typeof r.data !== 'string') return null;
        return { recordId, checksum: r.checksum, data: fromBase64(r.data) };
      } catch {
        return null;
      }
    });
  }

  commit(ops: CommitOps): Promise<void> {
    return this.serial(async () => {
      const journal = journalOf(ops);
      /** The record files this commit creates (never one that was already on disk). */
      const created: string[] = [];
      let renaming = false;
      try {
        // (a) the new records, each verified before it gets its final name.
        for (const r of ops.putRecords) {
          const path = recordPath(r.recordId);
          const text = recordText(r);
          const held = await this.ops.read(path);
          if (held !== null && held !== text) throw new Error(`A record named ${r.recordId} already exists; nothing was changed.`);
          if (held === null) {
            created.push(path);
            await this.writeVerified(path, text);
          }
        }
        // (b) journal.tmp, verified; its rename to journal.json is the commit point.
        await this.writeChecked(JOURNAL, canonicalJson(journal), JOURNAL_TMP);
        renaming = true;
        await this.ops.rename(JOURNAL_TMP, JOURNAL);
      } catch (e) {
        // A failed rename may still have landed (a timeout, a copy fallback), so the files stay for the next open.
        if (!renaming) await this.discard(created);
        throw toStorageError(e);
      }
      // Durable from here: finish now, or before the next operation, or at the next open.
      try {
        await this.apply(journal);
      } catch {
        this.pending = journal;
      }
    }, true);
  }

  /**
   * D-0095: before the commit point, remove what a refused commit wrote (its new records, their temporary
   * copies and journal.tmp), best effort, so retrying on a full device does not use up more space each time.
   * Anything left is removed at the next open.
   */
  private async discard(created: readonly string[]): Promise<void> {
    for (const path of [...created.flatMap((p) => [`${p}${TMP}`, p]), JOURNAL_TMP]) {
      try {
        await this.ops.remove(path);
      } catch {
        /* the next open removes it */
      }
    }
  }

  /** Bytes the store's files take (records and slot pointers); the quota is unknown (null). */
  usage(): Promise<{ readonly bytes: number; readonly quota: number | null }> {
    return this.serial(async () => {
      let bytes = 0;
      for (const dir of [RECORDS, SLOTS]) {
        for (const name of (await this.ops.list(dir)).sort()) {
          const path = `${dir}/${name}`;
          const size = this.ops.size ? await this.ops.size(path) : null;
          if (size !== null) bytes += size;
          else {
            const text = await this.ops.read(path);
            if (text !== null) bytes += new TextEncoder().encode(text).byteLength;
          }
        }
      }
      return { bytes, quota: null };
    });
  }
}

function journalOf(ops: CommitOps): Journal {
  return { format: 'pixelmeba-fs-journal', version: 1, putSlots: ops.putSlots, deleteSlots: ops.deleteSlots, deleteRecords: ops.deleteRecords };
}

// ------------------------------------------------------------------------------------------- memory ops

/** Thrown by MemoryFsOps once its simulated process has died (crashAfter). */
export class SimulatedCrash extends Error {
  override readonly name = 'SimulatedCrash';
}

/**
 * Files in a plain object (tests and the interruption harness's reasoning). `crashAfter(n)`: the next n
 * operations run, then this one and every later one throws (a dead process; the operation that throws is not
 * applied). `splitRename`: a rename onto an existing file is two operations — remove the target, then move —
 * as Android's rename is, so a crash can fall between them. `tear(path)`: the next write to `path` stores only
 * the first half of its text and still resolves. `failOp`: chosen operations reject (say, a full device that
 * refuses the slot writes) while the process lives on. `snapshotFiles()` / `fromFiles()` relaunch on the same files.
 */
export class MemoryFsOps implements FsOps {
  readonly files: Record<string, string>;
  /** Operations run so far (each call is one; a split rename onto an existing file is two). */
  opCount = 0;
  /** What each operation run so far did ("write <path>", "rename <from> <to>", "unlink <to>", …). */
  readonly log: string[] = [];
  quotaBytes: number | null = null;
  failNextWrite = false;
  /** An error to throw instead of running an operation (by its log text, e.g. "write pixelmeba/slots/slot1.json.tmp"), or null to run it. */
  failOp: ((what: string) => Error | null) | null = null;
  private left: number | null = null;
  private dead = false;
  private readonly torn = new Set<string>();

  constructor(
    files: Record<string, string> = {},
    readonly options: { readonly splitRename?: boolean } = {},
  ) {
    this.files = { ...files };
  }

  static fromFiles(files: Record<string, string>, options: { readonly splitRename?: boolean } = {}): MemoryFsOps {
    return new MemoryFsOps(files, options);
  }

  snapshotFiles(): Record<string, string> {
    return { ...this.files };
  }

  crashAfter(n: number): void {
    this.left = n;
  }

  /** The next write to `path` (or, for 'dir/*', to any path under dir/) stores half its text and resolves. */
  tear(path: string): void {
    this.torn.add(path);
  }

  private tornNow(path: string): boolean {
    for (const t of [...this.torn].sort()) {
      if (t === path || (t.endsWith('*') && path.startsWith(t.slice(0, -1)))) {
        this.torn.delete(t);
        return true;
      }
    }
    return false;
  }

  get crashed(): boolean {
    return this.dead;
  }

  private step(what: string): void {
    if (this.dead) throw new SimulatedCrash('the process is gone');
    if (this.left !== null) {
      if (this.left === 0) {
        this.dead = true;
        throw new SimulatedCrash('the process died');
      }
      this.left--;
    }
    const refused = this.failOp?.(what);
    if (refused) throw refused;
    this.opCount++;
    this.log.push(what);
  }

  private bytes(): number {
    let n = 0;
    for (const k of Object.keys(this.files)) n += new TextEncoder().encode(this.files[k]).byteLength;
    return n;
  }

  /** Run one operation; anything it throws becomes the rejection. */
  private op<T>(f: () => T): Promise<T> {
    try {
      return Promise.resolve(f());
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  read(path: string): Promise<string | null> {
    return this.op(() => {
      this.step(`read ${path}`);
      return Object.prototype.hasOwnProperty.call(this.files, path) ? this.files[path]! : null;
    });
  }

  write(path: string, text: string): Promise<void> {
    return this.op(() => {
      this.step(`write ${path}`);
      if (this.failNextWrite) {
        this.failNextWrite = false;
        throw new Error('simulated write failure');
      }
      if (this.quotaBytes !== null) {
        const old = this.files[path];
        const after = this.bytes() - (old === undefined ? 0 : new TextEncoder().encode(old).byteLength) + new TextEncoder().encode(text).byteLength;
        if (after > this.quotaBytes) throw new Error("'writeFile' failed with: write failed: ENOSPC (No space left on device)");
      }
      this.files[path] = this.tornNow(path) ? text.slice(0, Math.floor(text.length / 2)) : text;
    });
  }

  rename(from: string, to: string): Promise<void> {
    return this.op(() => {
      if (from === to) {
        this.step(`rename ${from} ${to}`);
        return;
      }
      if (this.options.splitRename && Object.prototype.hasOwnProperty.call(this.files, to)) {
        this.step(`unlink ${to}`);
        delete this.files[to];
      }
      this.step(`rename ${from} ${to}`);
      if (!Object.prototype.hasOwnProperty.call(this.files, from)) throw new Error(`'rename' failed because file at '${from}' does not exist.`);
      this.files[to] = this.files[from]!;
      delete this.files[from];
    });
  }

  remove(path: string): Promise<void> {
    return this.op(() => {
      this.step(`remove ${path}`);
      delete this.files[path];
    });
  }

  list(dir: string): Promise<string[]> {
    return this.op(() => {
      this.step(`list ${dir}`);
      const prefix = `${dir}/`;
      return Object.keys(this.files)
        .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .map((p) => p.slice(prefix.length))
        .sort();
    });
  }

  size(path: string): Promise<number | null> {
    return this.op(() => {
      this.step(`size ${path}`);
      const t = this.files[path];
      return t === undefined ? null : new TextEncoder().encode(t).byteLength;
    });
  }
}
