/**
 * P4.12 (docs/ANDROID_SETUP.md §7): the app version has ONE source, package.json "version". The app's
 * APP_VERSION (every .pixelmeba file's metadata, About) must equal it, and android/app/build.gradle derives
 * versionName and versionCode = major*10000 + minor*100 + patch from it, refusing minor or patch > 99.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../../src/persistence/appVersion';

const ROOT = join(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
const gradle = readFileSync(join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');

/** The scheme of ANDROID_SETUP §7 (the same arithmetic build.gradle does). */
function versionCode(version: string): number {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`${version} is not major.minor.patch`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (minor > 99 || patch > 99) throw new Error(`${version}: minor and patch must be 0-99`);
  return major * 10000 + minor * 100 + patch;
}

describe('version scheme (one source: package.json)', () => {
  it('APP_VERSION equals package.json "version" (1.0.0 for this release), a major.minor.patch version', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('versionCode = major*10000 + minor*100 + patch; minor or patch > 99 is refused', () => {
    expect(versionCode('1.0.0')).toBe(10000);
    expect(versionCode('1.0.1')).toBe(10001);
    expect(versionCode('1.1.0')).toBe(10100);
    expect(versionCode('1.2.3')).toBe(10203);
    expect(versionCode('2.99.99')).toBe(29999);
    expect(() => versionCode('1.100.0')).toThrow(/0-99/);
    expect(() => versionCode('1.0.100')).toThrow(/0-99/);
    expect(() => versionCode('1.0')).toThrow(/major.minor.patch/);
  });

  it('build.gradle reads package.json and sets versionName/versionCode from it, never a literal', () => {
    expect(gradle).toContain("new groovy.json.JsonSlurper().parse(rootProject.file('../package.json'))");
    // The arithmetic is exactly the scheme's.
    expect(gradle).toMatch(/def appVersionCode = appVersionParts\[0\] \* 10000 \+ appVersionParts\[1\] \* 100 \+ appVersionParts\[2\]/);
    expect(gradle).toMatch(/if \(appVersionParts\[1\] > 99 \|\| appVersionParts\[2\] > 99\) \{\s*throw new GradleException/);
    expect(gradle).toMatch(/def appVersionName = appPackageJson\.version as String/);
    // defaultConfig uses the derived values; no literal version is left behind.
    const lines = gradle.split('\n').map((l) => l.trim());
    expect(lines.filter((l) => /^versionCode\b/.test(l))).toEqual(['versionCode appVersionCode']);
    expect(lines.filter((l) => /^versionName\b/.test(l))).toEqual(['versionName appVersionName']);
  });
});
