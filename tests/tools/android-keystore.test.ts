/**
 * P4.10 (D-0091): tools/android-keystore.sh refuses any path inside the repository (resolved: "..", a relative
 * path, a symlinked folder) and, with --dry-run outside it, prints the keytool command and the
 * keystore.properties lines without creating anything or printing a password.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'tools', 'android-keystore.sh');
const scratch = mkdtempSync(join(tmpdir(), 'pixelmeba-keystore-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function run(args: string[], cwd = ROOT) {
  const r = spawnSync('bash', [SCRIPT, ...args], { cwd, encoding: 'utf8' });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

describe('android-keystore.sh', () => {
  it('refuses a path inside the repository, however it is written, and creates nothing', () => {
    const link = join(scratch, 'repo-link');
    symlinkSync(ROOT, link);
    for (const [path, cwd] of [
      ['android/pixelmeba-upload.jks', ROOT],
      [join(ROOT, 'tmp', 'new-folder', 'k.jks'), ROOT],
      [join(ROOT, '..', 'pixelmeba', 'k.jks'), ROOT],
      [join(link, 'android', 'k.jks'), ROOT],
      ['../../k.jks', join(ROOT, 'android', 'app')],
    ] as const) {
      const r = run(['--out', path, '--dry-run'], cwd);
      expect(r.status, path).toBe(1);
      expect(r.err).toMatch(/^Refused: .* is inside the repository \(.*\)\. The upload key must live outside it \(docs\/ANDROID_SETUP\.md §5\); nothing was created\./u);
      expect(r.out).toBe('');
    }
    expect(existsSync(join(ROOT, 'android', 'pixelmeba-upload.jks'))).toBe(false);
    expect(existsSync(join(ROOT, 'tmp', 'new-folder'))).toBe(false);
  });

  it('--dry-run outside the repository prints the keytool command and the properties lines, and creates nothing', () => {
    const target = join(scratch, 'keys', 'pixelmeba-upload.jks');
    const r = run(['--out', target, '--dry-run']);
    expect(r.status).toBe(0);
    expect(r.out).toContain('Dry run: nothing was created.');
    expect(r.out).toContain(`keytool -genkeypair -v -keystore ${target} -alias pixelmeba-upload -keyalg RSA -keysize 2048 -validity 10000`);
    expect(r.out).toContain(`storeFile=${target}`);
    expect(r.out).toContain('storePassword=<the store password you chose>');
    expect(r.out).toContain('keyAlias=pixelmeba-upload');
    expect(r.out).toContain('keyPassword=<the key password you chose>');
    expect(r.out).not.toMatch(/-storepass|-keypass/u);
    expect(existsSync(target)).toBe(false);
    expect(existsSync(join(scratch, 'keys'))).toBe(false);
  });

  it('needs --out', () => {
    expect(run([]).status).toBe(2);
  });
});
