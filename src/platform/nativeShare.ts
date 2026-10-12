/**
 * P4.10 (ARCH §12 "Share: @capacitor/share with a temp file in Directory.Cache … Cancellation is a no-op"):
 * the ShareEnv deliverFile (src/ui/share.ts) uses on the Android app. A file to share is written to
 * Directory.Cache 'share/<filename>' (base64 for the PNG, UTF-8 for a .pixelmeba) and handed to the system
 * share sheet by its uri; "Save to Files" and Drive are among the sheet's targets, so exports need no storage
 * permission. The player cancelling (the plugin rejects "Share canceled") rejects here, deliverFile answers
 * 'cancelled', and the cache file is removed at once. After a completed share the file stays until the next
 * share starts (the receiving app may still be reading it when the sheet closes); the system may also clear
 * the cache at any time.
 */
import type { ShareEnv } from '@ui/share';

/** The part of the Filesystem plugin this uses. */
export interface ShareFs {
  writeFile(o: { path: string; data: string; directory: 'CACHE'; encoding?: 'utf8'; recursive: boolean }): Promise<{ uri: string }>;
  deleteFile(o: { path: string; directory: 'CACHE' }): Promise<void>;
  rmdir(o: { path: string; directory: 'CACHE'; recursive: boolean }): Promise<void>;
}

/** The part of the Share plugin this uses. */
export interface SharePlugin {
  share(o: { files: string[]; title?: string; dialogTitle?: string }): Promise<unknown>;
}

export interface NativeShareDeps {
  readonly fs: ShareFs;
  readonly share: SharePlugin;
}

/** Where shared files are written in Directory.Cache. */
export const SHARE_CACHE_DIR = 'share';

async function loadDeps(): Promise<NativeShareDeps> {
  const [{ Filesystem }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  return { fs: Filesystem as unknown as ShareFs, share: Share as unknown as SharePlugin };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/** A file name safe in the cache folder (no folders, no leading dot). */
function safeName(name: string): string {
  const n = name.replace(/[/\\:*?"<>|]+/gu, '-').replace(/^\.+/u, '').trim();
  return n.length > 0 ? n.slice(0, 120) : 'pixelmeba-file';
}

function isText(file: File): boolean {
  return !file.type.startsWith('image/') && !/\.png$/iu.test(file.name);
}

/**
 * Share one file through the system share sheet. Resolves when shared; rejects when the player cancelled or
 * the platform refused (nothing else changes either way).
 */
export async function shareNative(file: File, title: string, deps?: NativeShareDeps): Promise<void> {
  const d = deps ?? (await loadDeps());
  // An earlier share's file is no longer needed once a new share starts.
  try {
    await d.fs.rmdir({ path: SHARE_CACHE_DIR, directory: 'CACHE', recursive: true });
  } catch {
    // nothing there yet
  }
  const path = `${SHARE_CACHE_DIR}/${safeName(file.name)}`;
  const text = isText(file);
  const data = text ? await file.text() : bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  const { uri } = await d.fs.writeFile({ path, data, directory: 'CACHE', ...(text ? { encoding: 'utf8' as const } : {}), recursive: true });
  try {
    await d.share.share({ files: [uri], title, dialogTitle: title });
  } catch (e) {
    // Cancelled (or refused): nobody will read the file, so it goes now.
    try {
      await d.fs.deleteFile({ path, directory: 'CACHE' });
    } catch {
      // already gone
    }
    throw e;
  }
}

/** deliverFile's environment on the native app: always the share sheet, never a download. */
export function nativeShareEnv(deps?: NativeShareDeps): ShareEnv {
  return {
    nav: {
      canShare: (data: ShareData) => Array.isArray(data.files) && data.files.length === 1,
      share: async (data: ShareData) => {
        const file = data.files?.[0];
        if (!file) throw new Error('nothing to share');
        await shareNative(file, data.title ?? file.name, deps);
      },
    },
    makeFile: (blob, filename, type) => {
      try {
        return new File([blob], filename, { type });
      } catch {
        return null;
      }
    },
    // Unreachable while canShare holds for one file; a native app never offers a browser download.
    download: () => {
      throw new Error('The Android app shares files through the share sheet.');
    },
  };
}
