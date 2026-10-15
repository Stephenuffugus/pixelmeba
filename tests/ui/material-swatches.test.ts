/**
 * Phase 5 wave 12 (structures-art-audio): every material the Lab tray can list has a colour-plus-pattern swatch
 * (src/ui/styles.css .sw-<id>; LabTray.tsx Swatch draws `lab-swatch sw-<id lowercased>`; UX §9 "No essential
 * meaning by color alone"). The tray lists materials of kind field, activity, deposit and object (paints are
 * habitat tools with their own icons). Each needs a rule whose background holds a gradient or pattern, never a
 * flat colour; the five Phase 5 swatches (M02, M06, M07, M08, M12) are among them. They show in the tray once
 * the organism flip enables those materials.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHEMISTRY_MATERIALS, FOOD_MATERIALS, FOOD_OBJECTS, MATERIAL_COPY, OBJECT_COPY } from '../../src/ui/strings/lab';

const ROOT = join(__dirname, '..', '..');
const TRAY_KINDS = new Set(['field', 'activity', 'deposit', 'object']);
const CSS = readFileSync(join(ROOT, 'src', 'ui', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const materials = readdirSync(join(ROOT, 'content', 'materials'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(ROOT, 'content', 'materials', f), 'utf8')) as { id: string; kind: string })
  .filter((m) => TRAY_KINDS.has(m.kind))
  .sort((a, b) => (a.id < b.id ? -1 : 1));

/** The background declarations of every rule whose selector list names `.sw-<id>` exactly. */
function backgrounds(id: string): string[] {
  const cls = `.sw-${id.toLowerCase()}`;
  const out: string[] = [];
  for (const m of CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = m[1]!.split(',').map((s) => s.trim());
    if (!selectors.includes(cls)) continue;
    for (const d of m[2]!.matchAll(/background(?:-image)?\s*:\s*([^;]+);/g)) out.push(d[1]!.trim());
  }
  return out;
}

describe('material swatches', () => {
  it('lists the tray materials (the Phase 5 ones included)', () => {
    const ids = materials.map((m) => m.id);
    for (const id of ['M02', 'M06', 'M07', 'M08', 'M12']) expect(ids).toContain(id);
    expect(ids.length).toBeGreaterThanOrEqual(26);
  });

  it('every tray material has a .sw-<id> rule whose background is a gradient or pattern, not a flat colour', () => {
    const missing: string[] = [];
    for (const m of materials) {
      const bg = backgrounds(m.id);
      if (bg.length === 0 || !bg.some((b) => /gradient\(|url\(/.test(b))) missing.push(m.id);
    }
    expect(missing).toEqual([]);
  });

  it('the five Phase 5 swatches each layer a pattern over their colours (more than one colour stop)', () => {
    for (const id of ['M02', 'M06', 'M07', 'M08', 'M12']) {
      const bg = backgrounds(id).join(' ');
      expect(bg, id).toMatch(/gradient\(/);
      const colours = new Set(bg.match(/#[0-9a-f]{3,6}\b/gi)?.map((c) => c.toLowerCase()) ?? []);
      expect(colours.size, id).toBeGreaterThanOrEqual(2);
    }
    // M07 is M06's swatch with a dark bar across: the bar is the extra layer.
    expect(backgrounds('M07').join(' ')).toContain(backgrounds('M06').join(' '));
  });

  it('every tray material the shipped manifest enables is in a tray list with its own copy (the organism flip: M02, M06, M07, M08, M12)', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'content', 'manifest.json'), 'utf8')) as { enabledMaterials: string[] };
    const listed = new Set([...FOOD_MATERIALS, ...CHEMISTRY_MATERIALS, ...FOOD_OBJECTS]);
    const unlisted: string[] = [];
    const noCopy: string[] = [];
    for (const m of materials) {
      if (!manifest.enabledMaterials.includes(m.id)) continue;
      if (!listed.has(m.id)) unlisted.push(m.id);
      if (MATERIAL_COPY[m.id] === undefined && OBJECT_COPY[m.id] === undefined) noCopy.push(m.id);
    }
    expect(unlisted).toEqual([]);
    expect(noCopy).toEqual([]);
    for (const id of ['M02', 'M06', 'M07', 'M08', 'M12']) {
      expect(CHEMISTRY_MATERIALS, id).toContain(id);
      expect(FOOD_MATERIALS, id).not.toContain(id);
    }
  });
});
