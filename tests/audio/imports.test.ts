/**
 * P3.10 (W5-19): src/audio is cosmetic and never reaches the simulation. ESLint's determinism rules
 * cover only src/sim/**, so this test is the proof that no file under src/audio imports src/sim (or
 * @sim/*, or the worker that hosts it). Cosmetic Math.random in src/audio is allowed.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const AUDIO = join(ROOT, 'src', 'audio');

function files(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
}

/** Module specifiers of every import / export-from / dynamic import in a source text. */
function specifiers(src: string): string[] {
  const out: string[] = [];
  const re =
    /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (let m = re.exec(src); m; m = re.exec(src)) out.push((m[1] ?? m[2] ?? m[3])!);
  return out;
}

function forbidden(spec: string, fromFile: string): boolean {
  if (/^@(sim|worker)\//.test(spec)) return true;
  if (spec.startsWith('.')) {
    const target = relative(ROOT, join(fromFile, '..', spec)).replace(/\\/g, '/');
    return target.startsWith('src/sim') || target.startsWith('src/worker');
  }
  return /(^|\/)src\/(sim|worker)(\/|$)/.test(spec);
}

describe('src/audio never imports the simulation', () => {
  const list = files(AUDIO);

  it('finds the audio sources', () => {
    expect(list.map((f) => relative(AUDIO, f)).sort()).toEqual(
      expect.arrayContaining([
        'SoundKit.ts',
        'ambient.ts',
        'cues.ts',
        'haptics.ts',
        'mix.ts',
        'patches.ts',
        'rateLimiter.ts',
      ]),
    );
  });

  it('no import of src/sim, @sim/*, src/worker or @worker/*', () => {
    const bad: string[] = [];
    for (const f of list) {
      for (const s of specifiers(readFileSync(f, 'utf8')))
        if (forbidden(s, f)) bad.push(`${relative(ROOT, f)} → ${s}`);
    }
    expect(bad).toEqual([]);
  });

  it('the checker catches each forbidden form', () => {
    const f = join(AUDIO, 'cues.ts');
    const src = [
      "import { det } from '@sim/rng';",
      "import type { World } from '../sim/world';",
      "export { x } from '../worker/protocol';",
      "const m = await import('@sim/world');",
      "import '../../src/sim/rng';",
    ].join('\n');
    expect(specifiers(src).filter((s) => forbidden(s, f))).toHaveLength(5);
    expect(forbidden('./patches', f)).toBe(false);
    expect(forbidden('preact', f)).toBe(false);
  });
});
