/**
 * P4.10 (ARCH §12 "Share: @capacitor/share with a temp file in Directory.Cache … Cancellation is a no-op"):
 * on the Android app deliverFile (src/ui/share.ts) writes the file to Directory.Cache 'share/<name>' and
 * shares it by uri (fake Filesystem and Share plugins here); a cancel answers 'cancelled', changes nothing and
 * removes the cache file; saveTextFile (Export, the keep flow's export) goes through the same share sheet;
 * the web keeps the browser path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

interface Written {
  path: string;
  data: string;
  directory: string;
  encoding?: string;
}

const fake = vi.hoisted(() => {
  const state = {
    files: {} as Record<string, string>,
    writes: [] as { path: string; data: string; directory: string; encoding?: string; recursive: boolean }[],
    deletes: [] as string[],
    rmdirs: [] as string[],
    shares: [] as { files: string[]; title?: string }[],
    cancel: false,
  };
  const Filesystem = {
    writeFile: (o: { path: string; data: string; directory: string; encoding?: string; recursive: boolean }) => {
      state.writes.push(o);
      state.files[o.path] = o.data;
      return Promise.resolve({ uri: `file:///data/user/0/com.lucidwinds.pixelmeba/cache/${o.path}` });
    },
    deleteFile: (o: { path: string }) => {
      state.deletes.push(o.path);
      delete state.files[o.path];
      return Promise.resolve();
    },
    rmdir: (o: { path: string }) => {
      state.rmdirs.push(o.path);
      for (const k of Object.keys(state.files)) if (k.startsWith(`${o.path}/`)) delete state.files[k];
      return Promise.resolve();
    },
  };
  const Share = {
    share: (o: { files: string[]; title?: string }) => {
      state.shares.push(o);
      return state.cancel ? Promise.reject(new Error('Share canceled')) : Promise.resolve({ activityType: 'x' });
    },
  };
  return { state, Filesystem, Share };
});

vi.mock('@capacitor/filesystem', () => ({ Filesystem: fake.Filesystem, Directory: { Data: 'DATA', Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' } }));
vi.mock('@capacitor/share', () => ({ Share: fake.Share }));

const { setNativePlatformForTests } = await import('../../src/platform/capacitor');
const { nativeShareEnv } = await import('../../src/platform/nativeShare');
const { browserShareEnv, deliverFile, dishFile, downloadBlob, pictureFile, platformShareEnv, SHARE_PICTURE_FILENAME } = await import('../../src/ui/share');
const { saveTextFile, toast } = await import('../../src/ui/state');

const deps = { fs: fake.Filesystem, share: fake.Share } as unknown as Parameters<typeof nativeShareEnv>[0];

beforeEach(() => {
  fake.state.files = {};
  fake.state.writes = [];
  fake.state.deletes = [];
  fake.state.rmdirs = [];
  fake.state.shares = [];
  fake.state.cancel = false;
});
afterEach(() => setNativePlatformForTests(null));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 250]);

describe('native share (fake Filesystem + Share)', () => {
  it('the picture: base64 to Directory.Cache share/, shared by uri', async () => {
    const out = await deliverFile(pictureFile(new Blob([PNG], { type: 'image/png' })), nativeShareEnv(deps));
    expect(out).toBe('shared');
    const w = fake.state.writes[0] as Written;
    expect(w).toMatchObject({ path: `share/${SHARE_PICTURE_FILENAME}`, directory: 'CACHE' });
    expect(w.encoding).toBeUndefined();
    expect(Buffer.from(w.data, 'base64')).toEqual(Buffer.from(PNG));
    expect(fake.state.shares).toEqual([{ files: [`file:///data/user/0/com.lucidwinds.pixelmeba/cache/share/${SHARE_PICTURE_FILENAME}`], title: 'Pixelmeba picture', dialogTitle: 'Pixelmeba picture' }]);
    expect(fake.state.rmdirs).toEqual(['share']); // an earlier share's file goes when a new share starts
  });

  it('a .pixelmeba: UTF-8 text to Directory.Cache share/, shared by uri', async () => {
    const text = '{"format":"pixelmeba-save","name":"Dish ✓"}';
    const out = await deliverFile(dishFile(text, 'little-garden.pixelmeba', 'Pixelmeba dish'), nativeShareEnv(deps));
    expect(out).toBe('shared');
    expect(fake.state.writes[0]).toMatchObject({ path: 'share/little-garden.pixelmeba', data: text, directory: 'CACHE', encoding: 'utf8' });
    expect(fake.state.shares[0]!.files).toEqual(['file:///data/user/0/com.lucidwinds.pixelmeba/cache/share/little-garden.pixelmeba']);
  });

  it("cancel: 'cancelled', no toast, the cache file removed, nothing else changed", async () => {
    fake.state.cancel = true;
    const before = toast.value;
    const out = await deliverFile(dishFile('{"a":1}', 'x.pixelmeba', 'Pixelmeba dish'), nativeShareEnv(deps));
    expect(out).toBe('cancelled');
    expect(toast.value).toBe(before);
    expect(fake.state.deletes).toEqual(['share/x.pixelmeba']);
    expect(fake.state.files).toEqual({});
  });

  it('saveTextFile on the native app offers the file through the share sheet (the plugins loaded on demand)', async () => {
    setNativePlatformForTests(true);
    expect(await saveTextFile('{"format":"pixelmeba-save"}', 'kept.pixelmeba')).toBe('shared');
    expect(fake.state.writes[0]).toMatchObject({ path: 'share/kept.pixelmeba', data: '{"format":"pixelmeba-save"}', encoding: 'utf8', directory: 'CACHE' });
    expect(fake.state.shares.length).toBe(1);
  });

  it('D-0096: a cancelled sheet is never reported as an export: saveTextFile resolves "cancelled", and every export checks it', async () => {
    setNativePlatformForTests(true);
    fake.state.cancel = true;
    expect(await saveTextFile('{"format":"pixelmeba-save"}', 'kept.pixelmeba')).toBe('cancelled');
    expect(fake.state.files).toEqual({});
    // The callers: a null file name (exportDishFile / exportContinueFile) keeps the keep flow and What if? at their
    // choice, and More → Export and Export challenge say "not exported" (src/ui/state.ts, WhatIfState.tsx, challenge.ts).
    const state = readFileSync('src/ui/state.ts', 'utf8');
    expect(state).toContain("return (await saveTextFile(text, filename)) === 'cancelled' ? null : filename;");
    expect(state.match(/=== 'cancelled' \? null : filename;/g)).toHaveLength(2);
    expect(state).toContain('keepNotice.value = KEEP_TEXT.exportCancelled;');
    expect(state).toContain("showToast(outcome === 'cancelled' ? SHARE_TEXT.exportCancelled : `Exported ${filename}.`);");
    expect(readFileSync('src/ui/panels/WhatIfState.tsx', 'utf8')).toContain('whatIfNotice.value = WHATIF_TEXT.exportCancelled;');
    expect(readFileSync('src/ui/challenge.ts', 'utf8')).toContain("outcome === 'cancelled' ? CHALLENGE_TEXT.exportCancelled");
  });

  it('the web path is unchanged: the browser env (Web Share or a download), never the plugins', () => {
    setNativePlatformForTests(false);
    const env = platformShareEnv();
    expect(env.download).toBe(downloadBlob);
    expect(Object.keys(env)).toEqual(Object.keys(browserShareEnv()));
    setNativePlatformForTests(true);
    expect(platformShareEnv().download).not.toBe(downloadBlob);
  });
});
