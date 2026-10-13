/**
 * npm run android:build:debug    → android/app/build/outputs/apk/debug/app-debug.apk
 * npm run android:build:release  → android/app/build/outputs/bundle/release/app-release.aab
 *
 * P4.10 (ARCH §2, §12; D-0091; docs/ANDROID_SETUP.md §4, §8): the web build and `cap sync android` (the steps of
 * tools/android-sync.ts), then Gradle on a JDK 21 with the Android SDK, then the facts about the output: path,
 * bytes, sha256, and for an APK the `aapt2 dump badging` lines (package, versionCode, versionName, sdkVersion,
 * targetSdkVersion, every uses-permission). A release bundle is checked with `jarsigner -verify`; without
 * android/keystore.properties it is unsigned and this says so. Nothing here writes android/local.properties
 * (the SDK is passed to Gradle as ANDROID_HOME) or touches a keystore. A release build carries no source maps
 * (D-0100); a debug build keeps them.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const ANDROID_DIR = join(REPO_ROOT, 'android');

export const ANDROID_BUILD_TEXT = {
  noJdk: 'Gradle 8.14.3 needs JDK 21; set JAVA_HOME (docs/ANDROID_SETUP.md §2)',
  noSdk: 'No Android SDK found: set ANDROID_HOME (or ANDROID_SDK_ROOT, or sdk.dir in android/local.properties) (docs/ANDROID_SETUP.md §2)',
  unsigned:
    'UNSIGNED: Google Play rejects this file. Create the upload key (npm run android:keystore) and android/keystore.properties (docs/ANDROID_SETUP.md §5-§6).',
} as const;

function fail(message: string): never {
  console.error(`\nandroid:build FAILED: ${message}`);
  process.exit(1);
}

/** The major version of `<home>/bin/java`, or null. */
export function javaMajorAt(home: string): number | null {
  const java = join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (!existsSync(java)) return null;
  const r = spawnSync(java, ['-version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  const m = /version "(\d+)(?:\.(\d+))?/u.exec(`${r.stderr}${r.stdout}`);
  if (!m?.[1]) return null;
  const major = Number(m[1]);
  return major === 1 && m[2] ? Number(m[2]) : major;
}

/** A JDK 21: JAVA_HOME when it is 21, else /usr/local/sdkman/candidates/java/21*; null when there is none. */
export function findJdk21(env: NodeJS.ProcessEnv = process.env, major: (home: string) => number | null = javaMajorAt, sdkman = '/usr/local/sdkman/candidates/java'): string | null {
  if (env.JAVA_HOME && major(env.JAVA_HOME) === 21) return env.JAVA_HOME;
  if (existsSync(sdkman)) {
    for (const d of readdirSync(sdkman).sort().reverse()) {
      if (!d.startsWith('21')) continue;
      const home = join(sdkman, d);
      if (major(home) === 21) return home;
    }
  }
  return null;
}

/** The Android SDK: ANDROID_HOME, ANDROID_SDK_ROOT, android/local.properties sdk.dir, else ~/android-sdk. */
export function findSdk(env: NodeJS.ProcessEnv = process.env, androidDir = ANDROID_DIR, home = homedir()): string | null {
  for (const v of [env.ANDROID_HOME, env.ANDROID_SDK_ROOT]) if (v && existsSync(v)) return v;
  const props = join(androidDir, 'local.properties');
  if (existsSync(props)) {
    const dir = /^sdk\.dir=(.*)$/mu.exec(readFileSync(props, 'utf8'))?.[1]?.trim().replace(/\\:/gu, ':').replace(/\\\\/gu, '\\');
    if (dir && existsSync(dir)) return dir;
  }
  const fallback = join(home, 'android-sdk');
  return existsSync(fallback) ? fallback : null;
}

/** The newest build-tools aapt2 in the SDK, or null. */
function aapt2(sdk: string): string | null {
  const bt = join(sdk, 'build-tools');
  if (!existsSync(bt)) return null;
  const versions = readdirSync(bt).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  for (const v of versions) {
    const p = join(bt, v, 'aapt2');
    if (existsSync(p)) return p;
  }
  return null;
}

/** The badging lines worth recording (package, versions, SDK levels, permissions). */
export function badgingLines(dump: string): string[] {
  return dump.split('\n').filter((l) => /^(package:|sdkVersion:|targetSdkVersion:|uses-permission:|application-label:)/u.test(l));
}

function run(label: string, command: string, args: readonly string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): void {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const r = spawnSync(command, args, { cwd: opts.cwd ?? REPO_ROOT, env: opts.env ?? process.env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.error) fail(`${label}: could not start "${command}" (${r.error.message}).`);
  if (r.status !== 0) fail(`${label}: "${command} ${args.join(' ')}" exited with code ${r.status ?? r.signal ?? 'unknown'}.`);
}

/**
 * D-0100: the web build's arguments for each mode. A release bundle carries no source maps: the app never loads
 * them, and at the v1.0 gate they were 2.45 MB of the 6.26 MB bundle. A debug build keeps them for chrome://inspect
 * on a device. dist/ for the web keeps them (`build.sourcemap` in vite.config.ts); the arcade deploy leaves them out.
 */
export function webBuildArgs(mode: 'debug' | 'release'): string[] {
  return mode === 'release' ? ['vite', 'build', '--sourcemap', 'false'] : ['vite', 'build'];
}

/** The source-map files under `dir` (recursive), as paths relative to it. */
export function sourceMaps(dir: string): string[] {
  return (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith('.map'));
}

function main(): void {
  const mode = process.argv[2];
  if (mode !== 'debug' && mode !== 'release') fail('usage: tsx tools/android-build.ts debug|release');
  if (!existsSync(join(ANDROID_DIR, 'app', 'build.gradle'))) fail('android/ is missing or incomplete (docs/ANDROID_SETUP.md §3).');
  const jdk = findJdk21();
  if (!jdk) fail(ANDROID_BUILD_TEXT.noJdk);
  const sdk = findSdk();
  if (!sdk) fail(ANDROID_BUILD_TEXT.noSdk);
  console.log(`JDK 21: ${jdk}\nAndroid SDK: ${sdk}`);

  // The steps of tools/android-sync.ts: the web build, then the copy into the Android project.
  run('web build', 'npx', webBuildArgs(mode));
  if (!existsSync(join(REPO_ROOT, 'dist', 'index.html'))) fail('the web build finished but dist/index.html does not exist.');
  const maps = mode === 'release' ? sourceMaps(join(REPO_ROOT, 'dist')) : [];
  if (maps.length > 0) fail(`a release bundle must carry no source maps (D-0100), but dist/ holds ${maps.join(', ')}.`);
  run('capacitor sync', 'npx', ['cap', 'sync', 'android']);

  const env = { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, PATH: `${join(jdk, 'bin')}:${process.env.PATH ?? ''}` };
  const task = mode === 'debug' ? 'assembleDebug' : 'bundleRelease';
  const started = Date.now();
  run(`gradle ${task}`, process.platform === 'win32' ? 'gradlew.bat' : './gradlew', [task, '--console=plain'], { cwd: ANDROID_DIR, env });
  console.log(`\n${task} took ${Math.round((Date.now() - started) / 1000)} s`);

  const out = mode === 'debug' ? join(ANDROID_DIR, 'app/build/outputs/apk/debug/app-debug.apk') : join(ANDROID_DIR, 'app/build/outputs/bundle/release/app-release.aab');
  if (!existsSync(out)) fail(`Gradle finished but ${out} does not exist.`);
  const bytes = readFileSync(out);
  console.log(`\nOutput: ${out.slice(REPO_ROOT.length + 1)}`);
  console.log(`Bytes: ${statSync(out).size}`);
  console.log(`sha256: ${createHash('sha256').update(bytes).digest('hex')}`);

  if (mode === 'debug') {
    const tool = aapt2(sdk);
    if (!tool) console.log('aapt2 not found in the SDK build-tools: badging not printed.');
    else {
      const r = spawnSync(tool, ['dump', 'badging', out], { encoding: 'utf8' });
      console.log(`\naapt2 dump badging (${tool.slice(sdk.length + 1)}):`);
      for (const l of badgingLines(r.stdout ?? '')) console.log(`  ${l}`);
    }
  } else {
    const signed = existsSync(join(ANDROID_DIR, 'keystore.properties'));
    if (!signed) console.log(`\n${ANDROID_BUILD_TEXT.unsigned}`);
    const r = spawnSync(join(jdk, 'bin', 'jarsigner'), ['-verify', out], { encoding: 'utf8' });
    console.log(`\njarsigner -verify: ${`${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-1)[0] ?? ''}`);
  }
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
