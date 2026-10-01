/**
 * D-0033 fix round 3, the lead's rulings on words:
 * - (J) one time format per save: Saved dishes (Continue, the named slots, the checkpoints) and Home's
 *   Continue card name a save's moment on the dish clock ("at 0:05 dish time"), never "5 s simulated";
 * - (K) curly quotes in every player-facing sentence that quotes a dish name (the toasts after a manual
 *   save and after opening a checkpoint, the keep refusals), as the kept line already did.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { atDishTime, checkpointOpenedText, continueCardText, savedToastText } from '../../src/ui/state';

describe('(J) a save’s moment is on the dish clock everywhere it is listed', () => {
  it('at m:ss dish time (h:mm:ss past an hour), whole seconds as the dish clock shows them', () => {
    expect(atDishTime(0)).toBe('at 0:00 dish time');
    expect(atDishTime(59)).toBe('at 0:05 dish time');
    expect(atDishTime(600)).toBe('at 1:00 dish time');
    expect(atDishTime(6005)).toBe('at 10:00 dish time');
    expect(atDishTime(36_000)).toBe('at 1:00:00 dish time');
  });

  it('Home’s Continue card', () => {
    expect(continueCardText('Little Living Garden', 50)).toBe('Little Living Garden — at 0:05 dish time. Opens paused.');
    expect(continueCardText('Little Living Garden (from 1:00)', 600)).toBe('Little Living Garden (from 1:00) — at 1:00 dish time. Opens paused.');
  });

  it('no view says "s simulated" for a save any more', () => {
    for (const file of ['src/ui/views/Saves.tsx', 'src/ui/views/Home.tsx']) expect(readFileSync(file, 'utf8')).not.toMatch(/s simulated/);
  });
});

describe('(K) a quoted dish name takes curly quotes', () => {
  it('the toast after a manual save, and when Continue could not follow it', () => {
    expect(savedToastText('Little Living Garden', true)).toBe('Saved “Little Living Garden”.');
    expect(savedToastText('Little Living Garden', false)).toBe('Saved “Little Living Garden”, but Continue could not be updated; it still opens your previous autosave.');
  });

  it('the toast after opening an automatic checkpoint', () => {
    const branch = { fromName: 'Little Living Garden', tick: 600 };
    expect(checkpointOpenedText(branch, 'Little Living Garden (from 1:00)')).toBe(
      'Opened the automatic checkpoint of “Little Living Garden” at 1:00 as a new branch, “Little Living Garden (from 1:00)”, paused. Continue now follows this branch.',
    );
  });

  /** Every .ts/.tsx file under a folder. */
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(n) ? [p] : [];
    });
  }

  it('no player-facing sentence in src/ui puts straight quotes around an interpolated value; the worker’s keep refusals neither', () => {
    const offenders: string[] = [];
    for (const file of sources('src/ui')) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, k) => {
          if (/^\s*(\*|\/\/|\/\*)/.test(line)) return; // comments are not shown to the player
          // A straight quote right before `${` or right after an interpolation's closing `}`, except a CSS
          // attribute selector such as [data-testid="${id}"], which no player reads.
          const bad = /(^|[^=])"\$\{/.test(line) || /\$\{[^}]*\}"(?!\])/.test(line);
          if (bad) offenders.push(`${file}:${k + 1}: ${line.trim()}`);
        });
    }
    const host = readFileSync('src/worker/host.ts', 'utf8');
    for (const m of host.matchAll(/"\$\{d\.name\}"/g)) offenders.push(`src/worker/host.ts: ${m[0]}`);
    expect(offenders).toEqual([]);
  });
});
