/**
 * P4.11 (ARCH §14 "works … inside an iframe; no window.top/parent access"): a second guard beside the ESLint
 * rules (eslint.config.js IFRAME_GLOBALS / IFRAME_PROPERTIES). Every source file under src/ is scanned, with
 * comments and string literals removed, for a reach outside the frame: window/self/globalThis .top .parent
 * .opener .frameElement, and the bare globals top, parent, opener and frameElement used as values. The host
 * speaks only through postMessage, and only two exact shapes act (hostMessage).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hostMessage } from '../../src/platform/web';

const ROOT = join(import.meta.dirname, '..', '..');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

/** Source with comments and string/template literal contents blanked (newlines kept for line numbers). */
function codeOnly(src: string): string {
  const out: string[] = [];
  const blank = (ch: string): string => (ch === '\n' ? '\n' : ' ');
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') {
        out.push(' ');
        i++;
      }
    } else if (c === '/' && n === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out.push(blank(src[i]!));
        i++;
      }
      out.push('  ');
      i += 2;
    } else if (c === "'" || c === '"' || c === '`') {
      out.push(c);
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') {
          out.push(' ');
          i++;
        }
        out.push(blank(src[i] ?? ' '));
        i++;
      }
      out.push(c);
      i++;
    } else {
      out.push(c);
      i++;
    }
  }
  return out.join('');
}

const PATTERNS: readonly RegExp[] = [
  /\b(?:window|self|globalThis)\s*(?:\?\.|\.)\s*(?:top|parent|opener|frameElement)\b/,
  /\b(?:window|self|globalThis)\s*\[\s*['"`](?:top|parent|opener|frameElement)/,
  // A bare global used as a value: not a property (x.parent), not a key (parent:), not a declaration/parameter.
  /(?<![.\w$]|\?\.)\s*\b(?:top|parent|opener|frameElement)\b(?=\s*(?:\.|\?\.|\[|\)|;|,|$))/m,
];

describe('iframe-safe: nothing in src/ reaches outside its frame', () => {
  it('the scan finds the patterns it looks for (the guard is live)', () => {
    expect(PATTERNS[0]!.test(codeOnly('const t = window.top;'))).toBe(true);
    expect(PATTERNS[0]!.test(codeOnly('globalThis?.parent?.postMessage(x)'))).toBe(true);
    expect(PATTERNS[1]!.test("window['opener']")).toBe(true);
    expect(PATTERNS[2]!.test(codeOnly('if (parent.length) go();'))).toBe(true);
    // Comments, strings, other objects' properties and local names are not reaches.
    expect(PATTERNS.some((p) => p.test(codeOnly('// window.top is never read\nconst s = "window.parent";')))).toBe(false);
    expect(PATTERNS.some((p) => p.test(codeOnly('node.parent.x = el.top; const { parent: p } = tree;')))).toBe(false);
  });

  it('every source file under src/ is clean', () => {
    const found: string[] = [];
    for (const f of files(join(ROOT, 'src'))) {
      const code = codeOnly(readFileSync(f, 'utf8'));
      const lines = code.split('\n');
      lines.forEach((line, k) => {
        if (PATTERNS.slice(0, 2).some((p) => p.test(line))) found.push(`${relative(ROOT, f)}:${k + 1}: ${line.trim()}`);
      });
      // Bare globals: only flagged where no local binding of that name exists in the file.
      for (const name of ['top', 'parent', 'opener', 'frameElement']) {
        const declared = new RegExp(`(?:\\b(?:const|let|var|function|class)\\s+${name}\\b|[(,]\\s*${name}\\s*[:,)=]|\\{[^}]*\\b${name}\\b[^}]*\\}\\s*[:=])`).test(code);
        if (declared) continue;
        const bare = new RegExp(`(?<![.\\w$]|\\?\\.)\\b${name}\\b(?!\\s*:)(?=\\s*(?:\\.|\\?\\.|\\[|\\)|;|,|$))`, 'm');
        lines.forEach((line, k) => {
          if (bare.test(line)) found.push(`${relative(ROOT, f)}:${k + 1}: ${line.trim()}`);
        });
      }
    }
    expect(found).toEqual([]);
  });
});

describe('the arcade host messages (ARCH §14): only two exact shapes act', () => {
  it('pause and resume', () => {
    expect(hostMessage({ type: 'pixelmeba:pause' })).toBe('pause');
    expect(hostMessage({ type: 'pixelmeba:resume' })).toBe('resume');
  });
  it('anything else does nothing', () => {
    for (const d of [null, undefined, 'pixelmeba:pause', 1, [], ['pixelmeba:pause'], {}, { type: 'pixelmeba:run' }, { type: 'pixelmeba:pause', speed: 4 }, { kind: 'pixelmeba:pause' }, { type: 'PIXELMEBA:PAUSE' }])
      expect(hostMessage(d), JSON.stringify(d) ?? 'undefined').toBeNull();
  });
});
