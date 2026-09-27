/**
 * npm run android:sync
 * Builds the static web app into dist/ (`npx vite build`) and copies it plus the Capacitor plugin
 * list into the Android project (`npx cap sync android`) — ARCH §12, BUILD_DIRECTIVE P1.11.
 * Exits non-zero with a clear message if either step fails. Neither step needs the Android SDK;
 * afterwards it reports whether the JDK/SDK needed for `./gradlew assembleDebug` are visible and
 * points at docs/ANDROID_SETUP.md when they are not.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const ANDROID_DIR = join(REPO_ROOT, 'android');
const SETUP_DOC = 'docs/ANDROID_SETUP.md';

function fail(message: string): never {
  console.error(`\nandroid:sync FAILED: ${message}`);
  console.error(`See ${SETUP_DOC} for the full Android setup.`);
  process.exit(1);
}

function run(label: string, command: string, args: readonly string[]): void {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) fail(`${label}: could not start "${command}" (${result.error.message}).`);
  if (result.signal) fail(`${label}: "${command} ${args.join(' ')}" was killed by ${result.signal}.`);
  if (result.status !== 0)
    fail(`${label}: "${command} ${args.join(' ')}" exited with code ${result.status ?? 'unknown'}.`);
}

/** Major version of the `java` on PATH (or JAVA_HOME), or null when none is found. */
function javaMajor(): number | null {
  const javaHome = process.env.JAVA_HOME;
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  // JAVA_HOME first, then PATH. No shell: java is a plain executable, and a shell would split a
  // JAVA_HOME containing spaces (C:\Program Files\...).
  const candidates = javaHome ? [join(javaHome, 'bin', exe), exe] : [exe];
  for (const java of candidates) {
    const result = spawnSync(java, ['-version'], { encoding: 'utf8' });
    if (result.error || result.status !== 0) continue;
    const match = /version "(\d+)(?:\.(\d+))?/.exec(`${result.stderr}${result.stdout}`);
    if (!match?.[1]) continue;
    const major = Number(match[1]);
    return major === 1 && match[2] ? Number(match[2]) : major;
  }
  return null;
}

/** Android SDK location from ANDROID_HOME, ANDROID_SDK_ROOT or android/local.properties. */
function androidSdk(): string | null {
  for (const v of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]) {
    if (v && existsSync(v)) return v;
  }
  const localProps = join(ANDROID_DIR, 'local.properties');
  if (existsSync(localProps)) {
    const line = /^sdk\.dir=(.*)$/m.exec(readFileSync(localProps, 'utf8'));
    const dir = line?.[1]?.trim().replace(/\\:/g, ':').replace(/\\\\/g, '\\');
    if (dir && existsSync(dir)) return dir;
  }
  return null;
}

if (!existsSync(join(REPO_ROOT, 'capacitor.config.ts'))) {
  fail('capacitor.config.ts is missing at the repository root.');
}
if (!existsSync(join(ANDROID_DIR, 'app', 'build.gradle'))) {
  fail(
    'android/ is missing or incomplete. Run "npx vite build && npx cap add android" once, then re-run this command.',
  );
}

run('web build', 'npx', ['vite', 'build']);
if (!existsSync(join(REPO_ROOT, 'dist', 'index.html')))
  fail('web build finished but dist/index.html does not exist.');
run('capacitor sync', 'npx', ['cap', 'sync', 'android']);

console.log('\nandroid:sync OK: dist/ copied into android/app/src/main/assets/public and plugins updated.');

// Informational only: the native build (./gradlew) needs a supported JDK and the Android SDK.
const major = javaMajor();
const sdk = androidSdk();
const notes: string[] = [];
if (major === null) notes.push('No JDK found (java -version failed). Install JDK 21 and set JAVA_HOME.');
else if (major !== 21)
  notes.push(
    `JDK ${major} is active; this project is verified with JDK 21 (Gradle 8.14.3 cannot run on JDK 25+). Set JAVA_HOME to a JDK 21.`,
  );
if (sdk === null)
  notes.push(
    'Android SDK not found (ANDROID_HOME / ANDROID_SDK_ROOT unset and no sdk.dir in android/local.properties).',
  );
if (notes.length > 0) {
  console.log('\nBefore building the APK/AAB:');
  for (const n of notes) console.log(`  - ${n}`);
  console.log(`  Steps: ${SETUP_DOC}`);
} else {
  console.log(`JDK ${major} and Android SDK at ${sdk} detected. Next: cd android && ./gradlew assembleDebug`);
}
