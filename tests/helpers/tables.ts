/**
 * Reads canonical numeric tables straight from docs/CONTENT_TABLES.md so fixtures use the design
 * document itself as the oracle (content JSON must agree with it).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOC = join(import.meta.dirname, '..', '..', 'docs', 'CONTENT_TABLES.md');

function section(md: string, startHeading: string, endHeading: string): string {
  const a = md.indexOf(startHeading);
  const b = md.indexOf(endHeading, a + 1);
  if (a < 0 || b < 0) throw new Error(`section ${startHeading} not found`);
  return md.slice(a, b);
}

function rows(block: string): string[][] {
  return block
    .split('\n')
    .filter((l) => /^\|\s*[BYFAPXV][0-9]{2}\s*\|/.test(l))
    .map((l) =>
      l
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim()),
    );
}

function leadingNumber(s: string): number | null {
  const m = /-?[0-9]*\.?[0-9]+/.exec(s);
  return m ? Number(m[0]) : null;
}

export interface ProfileRow {
  id: string;
  b0: number | null;
  q: number | null;
  m: number | null;
  minAge: number | null;
  maxAge: number | null;
  energyPerCarbon: number | null;
}

export interface MovementRow {
  id: string;
  speed: number | null;
  sense: number | null;
  cooldown: number | null;
}

export function profileTable(): ProfileRow[] {
  const md = readFileSync(DOC, 'utf8');
  return rows(section(md, '### 1.2', '### 1.3')).map((r) => ({
    id: r[0]!,
    b0: leadingNumber(r[1]!),
    q: leadingNumber(r[2]!),
    m: leadingNumber(r[3]!),
    minAge: leadingNumber(r[4]!),
    maxAge: leadingNumber(r[5]!),
    energyPerCarbon: leadingNumber(r[7]!),
  }));
}

export function movementTable(): MovementRow[] {
  const md = readFileSync(DOC, 'utf8');
  return rows(section(md, '### 1.3', 'Sprite frames')).map((r) => ({
    id: r[0]!,
    speed: leadingNumber(r[1]!),
    sense: leadingNumber(r[2]!),
    cooldown: r[3] === '—' ? 0 : leadingNumber(r[3]!),
  }));
}
