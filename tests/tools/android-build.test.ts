/**
 * D-0100 (v1.0 gate): a release bundle carries no source maps (the app never loads them; they were 2.45 MB of the
 * 6.26 MB bundle); a debug build keeps them for chrome://inspect on a device.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sourceMaps, webBuildArgs } from '../../tools/android-build';

describe('android-build web step (D-0100)', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('builds a release bundle without source maps and a debug build with the config default (maps on)', () => {
    expect(webBuildArgs('release')).toEqual(['vite', 'build', '--sourcemap', 'false']);
    expect(webBuildArgs('debug')).toEqual(['vite', 'build']);
  });

  it('finds every source map under a folder, nested ones included, and nothing else', () => {
    dir = mkdtempSync(join(tmpdir(), 'pixelmeba-maps-'));
    mkdirSync(join(dir, 'assets', 'deep'), { recursive: true });
    for (const f of ['index.html', 'assets/a.js', 'assets/a.js.map', 'assets/deep/w.js.map', 'assets/map.json'])
      writeFileSync(join(dir, f), '');
    expect(sourceMaps(dir).map((f) => f.replace(/\\/g, '/')).sort()).toEqual(['assets/a.js.map', 'assets/deep/w.js.map']);
    rmSync(join(dir, 'assets', 'a.js.map'));
    rmSync(join(dir, 'assets', 'deep', 'w.js.map'));
    expect(sourceMaps(dir)).toEqual([]);
  });
});
