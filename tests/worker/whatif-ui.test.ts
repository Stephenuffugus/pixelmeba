/**
 * What if? sheet, UI half (wave B fix; whatif-verify.md items 2–5 of the UI; D-0026):
 * - every mark the before/after preview draws keeps ≥ 3:1 against water #D6E7E5 (UX §4.1 "essential
 *   graphics"), with any opacity blended in; an amount change is a darker opaque fill, not a fainter one;
 * - a choice's Details describe the world-to-be with the same Evolution and Registry rows as a What if?
 *   dish's provenance (UX §3.3 "wherever a world is described");
 * - the global error toast never says the dish was paused for a request that was about no dish.
 * The preview is rendered by calling the components (no DOM) and walking the element tree.
 */
import { describe, expect, it } from 'vitest';
import type { VNode } from 'preact';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, WhatIfAnswer, WhatIfChoice } from '../../src/worker/protocol';
import { amountFill, WhatIfPreview } from '../../src/ui/panels/WhatIfPreview';
import { choiceDetails, previewCaption, provenanceDetails } from '../../src/ui/strings/whatif';
import { errorToastText } from '../../src/ui/state';
import { registry } from '../helpers/world';

const REG = registry();
/** Water in the preview and the dish (UX §6.1). */
const WATER = '#D6E7E5';

async function answer(): Promise<WhatIfAnswer & { readonly registryLabel?: string }> {
  const out: FromWorker[] = [];
  const host = new DishHost(REG, (m) => out.push(m), { now: () => 0, iso: () => '2026-09-28T00:00:00.000Z' });
  await host.handleAsync({ type: 'whatIf', requestId: 1, sourceId: 'FIRST_DISH_V1', aboutDishId: null });
  const r = out.find((m) => m.type === 'whatIf');
  if (r?.type !== 'whatIf') throw new Error(JSON.stringify(out));
  return r.answer;
}

// WCAG 2 relative luminance and contrast.
const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function rgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lum = ([r, g, b]: [number, number, number]) =>
  0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** The colour a mark shows over water once its opacity is blended in. */
function over(hex: string, alpha: number): [number, number, number] {
  const f = rgb(hex);
  const w = rgb(WATER);
  return [0, 1, 2].map((i) => f[i]! * alpha + w[i]! * (1 - alpha)) as [number, number, number];
}

interface Mark {
  readonly type: string;
  readonly paint: 'fill' | 'stroke';
  readonly color: string;
  readonly alpha: number;
  readonly testid: string | undefined;
}

/** Render function components and collect every painted fill and stroke (background and halo excluded). */
function marks(node: unknown, inherited = 1, out: Mark[] = []): Mark[] {
  if (Array.isArray(node)) {
    for (const n of node) marks(n, inherited, out);
    return out;
  }
  if (!node || typeof node !== 'object' || !('type' in node)) return out;
  const v = node as VNode<Record<string, unknown>>;
  if (typeof v.type === 'function')
    return marks((v.type as (p: unknown) => unknown)(v.props), inherited, out);
  const p = v.props;
  const alpha = inherited * (typeof p.opacity === 'number' ? p.opacity : Number(p.opacity ?? 1));
  const layer = p['data-layer'];
  if (layer !== 'ground' && layer !== 'halo') {
    for (const paint of ['fill', 'stroke'] as const) {
      const color = p[paint];
      // The water itself (and a water-coloured halo) is the background, not a mark on it.
      if (typeof color !== 'string' || color === 'none' || color.toUpperCase() === WATER) continue;
      const own = Number(p[`${paint}-opacity`] ?? 1);
      out.push({
        type: String(v.type),
        paint,
        color,
        alpha: alpha * own,
        testid: p['data-testid'] as string | undefined,
      });
    }
  }
  return marks(p.children, alpha, out);
}

describe('The before/after preview keeps every mark ≥ 3:1 on water (UX §4.1; item 3)', () => {
  it('every fill and stroke drawn for every choice, blended with its opacity, is ≥ 3:1 against #D6E7E5', async () => {
    const a = await answer();
    expect(a.choices.map((c) => c.preview.id)).toEqual(['R-G1', 'R-G2', 'R-G3']);
    for (const choice of a.choices) {
      const found = marks(WhatIfPreview({ choice, layout: a.layout }));
      expect(
        found.filter((m) => m.testid === 'whatif-before-patch' || m.testid === 'whatif-new-patch').length,
      ).toBeGreaterThanOrEqual(2);
      for (const m of found) {
        const c = contrast(over(m.color, m.alpha), rgb(WATER));
        expect(
          c,
          `${choice.preview.id} ${m.type} ${m.paint} ${m.color} α${m.alpha.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('an amount change is an opaque fill that is darker for more, and says its direction in words', async () => {
    const a = await answer();
    for (const choice of a.choices.filter((c) => c.preview.change.kind === 'amount')) {
      const change = choice.preview.change;
      if (change.kind !== 'amount') continue;
      const found = marks(WhatIfPreview({ choice, layout: a.layout }));
      const before = found.find((m) => m.testid === 'whatif-before-patch')!;
      const after = found.find((m) => m.testid === 'whatif-new-patch')!;
      expect(before.alpha).toBe(1);
      expect(after.alpha).toBe(1);
      expect(before.color).not.toBe(after.color);
      const [more, less] = change.after > change.before ? [after, before] : [before, after];
      expect(lum(rgb(more.color))).toBeLessThan(lum(rgb(less.color)));
      expect(previewCaption(change, 'after')).toBe(`After: ${change.direction} ${change.field}`);
    }
    // The ramp's ends and middle, and a tiny amount, all stay ≥ 3:1.
    for (const t of [0.001, 0.25, 0.5, 0.75, 1])
      expect(contrast(rgb(amountFill(t, 1)), rgb(WATER))).toBeGreaterThanOrEqual(3);
  });

  it('an amount of zero draws an outline where the patch was, not a pale fill', async () => {
    const a = await answer();
    const g1 = a.choices.find((c) => c.preview.id === 'R-G1')!;
    const change = g1.preview.change;
    if (change.kind !== 'amount') throw new Error('R-G1 is an amount change');
    const none: WhatIfChoice = { ...g1, preview: { ...g1.preview, change: { ...change, after: 0 } } };
    const after = marks(WhatIfPreview({ choice: none, layout: a.layout })).filter(
      (m) => m.testid === 'whatif-new-patch',
    );
    expect(after.map((m) => m.paint)).toEqual(['stroke']);
    for (const m of after) expect(contrast(over(m.color, m.alpha), rgb(WATER))).toBeGreaterThanOrEqual(3);
  });
});

describe('Choice Details carry the Evolution and Registry rows provenance shows (UX §3.3; item 4)', () => {
  it('the same labels, in the same rows, for the world-to-be', async () => {
    const a = await answer();
    const c = a.choices[2]!;
    expect(a.registryLabel).toBeTruthy();
    const rows = choiceDetails(c.preview, c, a.registryLabel ?? null);
    const record = {
      variantId: 'R-G3',
      variantRevision: 1,
      title: 'Dinner farther away',
      sourceId: 'FIRST_DISH_V1',
      sourceRevision: 1,
      sourceChecksum: c.sourceChecksum,
      variantChecksum: c.variantChecksum,
      initialStateHash: 'x',
      seed: 104729,
      simulationVersion: 3,
      evolutionRulesVersion: 1,
      contentVersion: 1,
      contentHash: 'h',
      patch: { kind: 'none' as const },
    };
    const prov = provenanceDetails(record, a.sourceName, {
      mutationPreset: c.preview.mutationPreset,
      founderMode: c.preview.founderMode,
      manifestLabel: a.registryLabel!,
    });
    const row = (rs: readonly { term: string; value: string }[], term: string) =>
      rs.find((r) => r.term === term)?.value;
    expect(row(rows, 'Registry')).toBe(a.registryLabel);
    expect(row(rows, 'Registry')).toBe(row(prov, 'Registry'));
    expect(row(rows, 'Evolution')).toBe(row(prov, 'Evolution'));
    expect(row(rows, 'Evolution')).toBe('Standard Evolution · Identical founders');
  });
});

describe('The global error toast is worded by what failed (item 8)', () => {
  it('a request about no dish (load, import, list) never claims the dish was paused', () => {
    const text = errorToastText({ dishId: '', message: 'This is not a Pixelmeba save file.' });
    expect(text).not.toMatch(/dish was paused/i);
    expect(text).toBe('Nothing was paused or changed: This is not a Pixelmeba save file.');
  });

  it('a failure of a dish itself says it was paused (ARCH §7: the last valid state is kept)', () => {
    expect(errorToastText({ dishId: 'dish-1', message: 'boom' })).toBe(
      'Something went wrong and the dish was paused: boom',
    );
  });
});
