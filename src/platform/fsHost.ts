/**
 * P4.10 (D-0092): the main thread's side of the worker's file store. It answers PortFsOps requests
 * (src/persistence/fsPort.ts) with @capacitor/filesystem in Directory.Data, as UTF-8 text:
 * read → readFile (null when the file does not exist), write → writeFile (recursive: parent folders are
 * created), rename, remove → deleteFile (a missing file is fine), list → readdir (names; [] when the folder
 * does not exist), size → stat.
 *
 * "Does not exist" is recognised by the plugin's own texts: Android (Filesystem 8.1.3 FilesystemErrors
 * doesNotExist, code OS-PLUG-FILE-0008) "'readFile' failed because file at '…' does not exist."; the web
 * implementation "File does not exist." / "Folder does not exist." / "Entry does not exist.".
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { FsAnswer, FsRequest } from '@persist/fsPort';

/** The part of the Filesystem plugin this uses (a fake in tests; the harness wraps the real one). */
export interface FsPlugin {
  readFile(o: { path: string; directory: Directory; encoding: Encoding }): Promise<{ data: string | Blob }>;
  writeFile(o: { path: string; data: string; directory: Directory; encoding: Encoding; recursive: boolean }): Promise<unknown>;
  rename(o: { from: string; to: string; directory: Directory; toDirectory: Directory }): Promise<void>;
  deleteFile(o: { path: string; directory: Directory }): Promise<void>;
  readdir(o: { path: string; directory: Directory }): Promise<{ files: readonly { name: string }[] }>;
  stat(o: { path: string; directory: Directory }): Promise<{ size: number }>;
}

/** The port this host answers on (a MessagePort, or a fake). */
export interface HostPort {
  postMessage(msg: FsAnswer): void;
  onmessage: ((ev: MessageEvent<FsRequest>) => void) | null;
}

export function isNotFound(e: unknown): boolean {
  const o = e as { message?: unknown; code?: unknown } | null;
  const message = typeof o?.message === 'string' ? o.message : String(e);
  return o?.code === 'OS-PLUG-FILE-0008' || /does not exist/iu.test(message);
}

const DIR = Directory.Data;

/** One request answered with the plugin (the value FsOps expects). */
export async function perform(fs: FsPlugin, req: FsRequest): Promise<unknown> {
  const [a = '', b = ''] = req.args;
  switch (req.op) {
    case 'read':
      try {
        const r = await fs.readFile({ path: a, directory: DIR, encoding: Encoding.UTF8 });
        return typeof r.data === 'string' ? r.data : await r.data.text();
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    case 'write':
      await fs.writeFile({ path: a, data: b, directory: DIR, encoding: Encoding.UTF8, recursive: true });
      return null;
    case 'rename':
      await fs.rename({ from: a, to: b, directory: DIR, toDirectory: DIR });
      return null;
    case 'remove':
      try {
        await fs.deleteFile({ path: a, directory: DIR });
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
      return null;
    case 'list':
      try {
        return (await fs.readdir({ path: a, directory: DIR })).files.map((f) => f.name);
      } catch (e) {
        if (isNotFound(e)) return [];
        throw e;
      }
    case 'size':
      try {
        return (await fs.stat({ path: a, directory: DIR })).size;
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    default:
      throw new Error(`unknown file operation ${String((req as { op?: unknown }).op)}`);
  }
}

function errorOf(e: unknown): { name: string; message: string } {
  const o = e as { name?: unknown; message?: unknown } | null;
  return {
    name: typeof o?.name === 'string' ? o.name : 'Error',
    message: typeof o?.message === 'string' ? o.message : String(e),
  };
}

/**
 * Answer every request arriving on `port` with `fs` (default: the Capacitor Filesystem plugin). `gate`, when
 * given, is asked first and may hold a request back for ever (the harness's "dead process"); `answered`, when
 * given, is told after each answer has been sent (the operation has finished).
 */
export function serveFs(port: HostPort, fs: FsPlugin = Filesystem, gate?: (req: FsRequest) => boolean, answered?: (req: FsRequest, ok: boolean) => void): void {
  port.onmessage = (ev) => {
    const req = ev.data;
    if (gate && !gate(req)) return;
    perform(fs, req).then(
      (value) => {
        port.postMessage({ id: req.id, ok: true, value });
        answered?.(req, true);
      },
      (e: unknown) => {
        port.postMessage({ id: req.id, ok: false, error: errorOf(e) });
        answered?.(req, false);
      },
    );
  };
}
