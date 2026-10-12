/**
 * npm run build:demo [-- --outDir <dir>]
 * P4.11 (ARCH §14; CONFLICT_REGISTER R22): the optional DEMO_MODE web build — the same app and the same content
 * pack built with VITE_DEMO_MODE=1 (the Garden, its What if? ideas, the five phase-1 organisms, Explore, saves
 * and export; src/platform/demoScope.ts). Typechecks first, then `vite build --outDir dist-demo` (gitignored).
 * The full web build (npm run build → dist/) is unchanged and remains the default.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

const outDir = argValue('--outDir') ?? 'dist-demo';

function run(label: string, command: string, args: readonly string[]): void {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: REPO_ROOT, stdio: 'inherit', env: { ...process.env, VITE_DEMO_MODE: '1' }, shell: process.platform === 'win32' });
  if (result.error || result.status !== 0) {
    console.error(`\nbuild:demo FAILED at ${label}: "${command} ${args.join(' ')}" ${result.error ? `could not start (${result.error.message})` : `exited with code ${result.status ?? result.signal ?? 'unknown'}`}.`);
    process.exit(1);
  }
}

run('typecheck', 'npx', ['tsc', '-p', 'tsconfig.json', '--noEmit']);
run('vite build', 'npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir']);

const index = join(REPO_ROOT, outDir, 'index.html');
if (!existsSync(index) || !existsSync(join(REPO_ROOT, outDir, 'sw.js'))) {
  console.error(`\nbuild:demo FAILED: ${outDir}/index.html or ${outDir}/sw.js is missing.`);
  process.exit(1);
}
const html = readFileSync(index, 'utf8');
console.log(`\nbuild:demo OK: ${outDir}/ (DEMO_MODE on; index.html ${html.length} bytes, sw.js present).`);
