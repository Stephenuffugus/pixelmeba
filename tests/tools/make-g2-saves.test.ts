/**
 * tools/make-g2-saves.ts writes the g2 saves only on the g2 build (preflight fix round 1). Once
 * content/manifest.json is past g2 (the Preflight's bump, D-0036) it only verifies, and --force is
 * refused: tools/fence-update.ts --g2 --reason D-00xx stays the one path that re-records expected.json.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeRefusal } from '../../tools/make-g2-saves';
import { CONTENT_DIR, REPO_ROOT } from '../../tools/lib/content-fs';
import { SAVES_DIR } from '../helpers/g2-saves';

const fixtures = () =>
  readdirSync(SAVES_DIR)
    .sort()
    .map((f) => `${f} ${createHash('sha256').update(readFileSync(join(SAVES_DIR, f))).digest('hex')}`);

describe('make-g2-saves writes only on the g2 build', () => {
  it('only a g2 manifest (build phase 2, content version 1) may write', () => {
    expect(writeRefusal({ buildPhase: 2, contentVersion: 1 })).toBeNull();
    for (const m of [
      { buildPhase: 3, contentVersion: 2 },
      { buildPhase: 3, contentVersion: 1 },
      { buildPhase: 2, contentVersion: 2 },
    ])
      expect(writeRefusal(m), JSON.stringify(m)).toMatch(/^content\/manifest\.json is past g2 .*only verifies them.*fence-update\.ts --g2 --reason D-00xx/);
    // This tree is past g2.
    const shipped = JSON.parse(readFileSync(join(CONTENT_DIR, 'manifest.json'), 'utf8')) as { buildPhase: number; contentVersion: number };
    expect(writeRefusal(shipped)).not.toBeNull();
  });

  it('refuses --force past g2 before building anything: exit 2, the reason on stderr, every fixture byte-identical', () => {
    const before = fixtures();
    expect(before.length).toBeGreaterThanOrEqual(10);
    const res = spawnSync(join(REPO_ROOT, 'node_modules', '.bin', 'tsx'), [join(REPO_ROOT, 'tools', 'make-g2-saves.ts'), '--force'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/^make-g2-saves refused --force: content\/manifest\.json is past g2 \(buildPhase \d+, contentVersion \d+\)/m);
    expect(res.stdout).not.toMatch(/^built /m);
    expect(fixtures()).toEqual(before);
  });
});
