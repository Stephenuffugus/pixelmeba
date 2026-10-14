/**
 * Phase 5 wave 12 (structures-art-audio): the Build group's twelve structure icons (src/ui/panels/LabTrayIcons.tsx,
 * mapped in LabTray.tsx BUILD_ICONS; UX §6.4 "24 px glyphs, inline SVG, currentColor"; CT §4). For a dish that
 * records S01–S12, buildItems() gives each Build item:
 *   - an svg with viewBox "0 0 24 24", stroke-based, decorative (aria-hidden), using only currentColor (no
 *     colour literal anywhere in it);
 *   - a drawing distinct from the other eleven;
 *   - its content record's name as the item's text, which with the aria-hidden icon is the button's
 *     accessible name (LabTray.tsx renders `{icon}<span>{name}</span>` in the button).
 * The icons are rendered by calling the components (no DOM) and walking the element tree.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VNode } from 'preact';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  // The app's state module creates its worker client on import; give it a worker that never answers.
  (globalThis as Record<string, unknown>).Worker ??= class {
    onmessage: unknown = null;
    postMessage(): void {}
    terminate(): void {}
  };
});

import { buildItems } from '../../src/ui/panels/LabTray';
import { dishInfo } from '../../src/ui/state';
import type { DishInfo } from '../../src/worker/protocol';

const ROOT = join(__dirname, '..', '..');
const IDS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'];
const contentName = (id: string): string => (JSON.parse(readFileSync(join(ROOT, 'content', 'structures', `${id}.json`), 'utf8')) as { name: string }).name;

type AnyNode = VNode<Record<string, unknown>>;
/** Render a function component (no hooks) to its element tree. */
function rendered(node: AnyNode): AnyNode {
  return typeof node.type === 'function' ? rendered((node.type as (p: unknown) => AnyNode)(node.props)) : node;
}
function walk(node: unknown, visit: (n: AnyNode) => void): void {
  if (Array.isArray(node)) return node.forEach((c) => walk(c, visit));
  if (!node || typeof node !== 'object' || !('type' in node)) return;
  const n = node as AnyNode;
  visit(n);
  walk(n.props.children, visit);
}
/** Every colour-bearing attribute value in the tree. */
function colourValues(svg: AnyNode): string[] {
  const out: string[] = [];
  walk(svg, (n) => {
    for (const k of ['fill', 'stroke', 'color', 'stop-color', 'style']) {
      const v = n.props[k];
      if (v !== undefined) out.push(typeof v === 'string' ? v : JSON.stringify(v));
    }
  });
  return out;
}
/** The drawing: every element's tag and geometry attributes, in order. */
function drawing(svg: AnyNode): string {
  const parts: string[] = [];
  walk(svg, (n) => {
    if (n === svg) return;
    const { children: _c, ...rest } = n.props;
    parts.push(`${String(n.type)}${JSON.stringify(rest)}`);
  });
  return parts.join('|');
}

describe('Build icons', () => {
  dishInfo.value = { dishId: 'd1', structureIds: [...IDS], materials: [], speciesIds: [], speciesNames: [], speciesAssets: [] } as unknown as DishInfo;
  const items = buildItems();
  const icons = new Map(items.map((it) => [String(it.id), rendered(it.icon as AnyNode)]));

  it('the dish lists S01–S12 then Remove, each with its content name', () => {
    expect(items.map((it) => it.id)).toEqual([...IDS.map((id) => `build:${id}`), 'build:remove']);
    for (const id of IDS) expect(items.find((it) => it.id === `build:${id}`)!.name).toBe(contentName(id));
  });

  it('each of the 12 is a 24 px, stroke-based, decorative svg using only currentColor', () => {
    for (const id of IDS) {
      const svg = icons.get(`build:${id}`)!;
      expect(svg.type, id).toBe('svg');
      expect(svg.props.viewBox, id).toBe('0 0 24 24');
      expect(svg.props.stroke, id).toBe('currentColor');
      expect(svg.props.fill, id).toBe('none');
      expect(svg.props['aria-hidden'], id).toBe('true');
      for (const v of colourValues(svg)) expect(['none', 'currentColor'], `${id}: ${v}`).toContain(v);
      expect(drawing(svg), id).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    }
  });

  it('each drawing is distinct from the other eleven (and from Remove)', () => {
    const all = [...IDS, 'remove'].map((id) => drawing(icons.get(`build:${id}`)!));
    expect(new Set(all).size).toBe(all.length);
  });
});
