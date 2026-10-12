/**
 * P4.10 (D-0092): the browser interruption harness — a separate build (VITE_FS_HARNESS=1), never shipped.
 * The web app then keeps its saves through the REAL worker ↔ main-thread bridge (src/persistence/fsPort.ts,
 * src/platform/fsHost.ts) and the REAL @capacitor/filesystem web implementation (stored in IndexedDB), and
 * `window.__fsHarness` lets a browser test interrupt it:
 *   opsSoFar()   file operations finished and answered so far;
 *   stopAfter(n) run n more operations, then never run or answer another (a dead process; reload = relaunch);
 *   corrupt(p)   damage one stored file;
 *   files()      every stored path under pixelmeba/;
 *   read(p)      one stored file's text (null when missing);
 *   log()        one line per answered operation ("write pixelmeba/journal.tmp", "rename <from> <to>", …);
 *   idle()       no operation is running.
 * Only src/platform/capacitor.ts startFsHost imports this file, behind `import.meta.env.VITE_FS_HARNESS === '1'`,
 * so every other build drops it (tests/e2e/android-storage.spec.ts greps the normal build for "__fsHarness").
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { isNotFound, serveFs } from './fsHost';

export interface FsHarness {
  opsSoFar(): number;
  stopAfter(n: number): void;
  corrupt(path: string): Promise<void>;
  files(): Promise<string[]>;
  read(path: string): Promise<string | null>;
  /** One line per answered operation: "<op> <path>" ("rename <from> <to>"). */
  log(): string[];
  /** True when no operation is running (every one let through has been answered). */
  idle(): boolean;
}

async function readText(path: string): Promise<string | null> {
  try {
    const r = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
    return typeof r.data === 'string' ? r.data : await r.data.text();
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries: readonly { name: string; type: string }[];
  try {
    entries = (await Filesystem.readdir({ path: dir, directory: Directory.Data })).files;
  } catch (e) {
    if (isNotFound(e)) return;
    throw e;
  }
  for (const f of entries) {
    const p = `${dir}/${f.name}`;
    if (f.type === 'directory') await walk(p, out);
    else out.push(p);
  }
}

export function startHarnessHost(port: MessagePort): void {
  // `accepted` counts operations let through to the plugin; `answered` those finished and answered. stopAfter(n)
  // lets n more through and holds every later one for ever, so once `answered` reaches them nothing else runs.
  let accepted = 0;
  let answered = 0;
  let stopAt: number | null = null;
  const lines: string[] = [];
  serveFs(
    port,
    Filesystem,
    () => {
      if (stopAt !== null && accepted >= stopAt) return false;
      accepted++;
      return true;
    },
    (req) => {
      answered++;
      lines.push(`${req.op} ${req.args[0] ?? ''}${req.op === 'rename' ? ` ${req.args[1] ?? ''}` : ''}`);
    },
  );
  const harness: FsHarness = {
    opsSoFar: () => answered,
    stopAfter: (n) => {
      stopAt = accepted + Math.max(0, Math.floor(n));
    },
    corrupt: async (path) => {
      const text = await readText(path);
      if (text === null) throw new Error(`no file ${path}`);
      let damaged = 'corrupted';
      try {
        const o = JSON.parse(text) as { data?: unknown };
        if (typeof o.data === 'string' && o.data.length > 16) {
          // Keep the JSON and the base64 shape; change the compressed bytes in the middle.
          const mid = Math.floor(o.data.length / 2) & ~3;
          const flipped = o.data.slice(mid, mid + 8) === 'AAAAAAAA' ? 'BBBBBBBB' : 'AAAAAAAA';
          damaged = JSON.stringify({ ...o, data: o.data.slice(0, mid) + flipped + o.data.slice(mid + 8) });
        }
      } catch {
        damaged = 'corrupted';
      }
      await Filesystem.writeFile({ path, data: damaged, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true });
    },
    files: async () => {
      const out: string[] = [];
      await walk('pixelmeba', out);
      return out.sort();
    },
    read: readText,
    log: () => [...lines],
    idle: () => accepted === answered,
  };
  (window as unknown as { __fsHarness?: FsHarness }).__fsHarness = harness;
}
