/**
 * P4.8 Observe copy and helpers (src/ui/strings/observe.ts, src/ui/observe.ts).
 *
 * The exact copy the assignment names (footnote, empty window, overlap warning, the six-region refusal,
 * the not-saved line); no forbidden word in any string the file can produce; "resource exchange
 * observed" only for two species that each have an arrow to the other; table rows and the picture from
 * the map's edges only; a drag makes exactly one mask.
 */
import { describe, expect, it } from 'vitest';
import { allObserveStrings, edgeValue, OBSERVE_TEXT } from '../../src/ui/strings/observe';
import {
  exchangePairs,
  mapPicture,
  mapRows,
  maskFromDrag,
  nextProbeId,
  poolLines,
  boundaryText,
} from '../../src/ui/observe';
import type { MapEdge, RelationshipMapData } from '../../src/worker/relationshipMap';
import type { ProbeMask } from '../../src/worker/probes';

const names = {
  speciesIds: ['A01', 'B01', 'P01', 'V01', 'B06'],
  speciesNames: ['Sunbead', 'Sprinter', 'Ciliate', 'Pinphage', 'Crumbsmith'],
};

function map(edges: Partial<MapEdge>[], pools: RelationshipMapData['pools'] = []): RelationshipMapData {
  return {
    windowSeconds: 60,
    tick: 600,
    fromSecond: 0,
    toSecond: 59,
    recordedSinceSecond: null,
    poolsRecordedSinceSecond: null, // P4.13: pool totals cover the whole window in these fixtures
    edges: edges.map((e) => ({
      kind: 'eats',
      actor: 'B01',
      target: 'sugar',
      count: 0,
      carbon: 0,
      seconds: 0,
      ...e,
    })),
    pools,
  };
}

describe('Observe copy (P4.8)', () => {
  it('the exact lines', () => {
    expect(OBSERVE_TEXT.footnote).toBe(
      "Only what this dish recorded is shown. A missing arrow means it wasn't seen in this window, not that it can't happen.",
    );
    expect(OBSERVE_TEXT.empty(60)).toBe(
      'Nothing was recorded passing between living things in the last 60 s.',
    );
    expect(OBSERVE_TEXT.empty(600)).toBe(
      'Nothing was recorded passing between living things in the last 600 s.',
    );
    expect(OBSERVE_TEXT.overlap('A', 'B')).toBe(
      "Regions A and B overlap. Cells inside both are counted in each, so don't add their totals together.",
    );
    expect(OBSERVE_TEXT.refusedSix).toBe('Six regions is the most. Delete one to draw another.');
    expect(OBSERVE_TEXT.notSaved).toBe('Regions are not saved with the dish.');
    expect(OBSERVE_TEXT.recordedSince('1:05')).toBe('Recorded since 1:05.');
    expect(edgeValue('catches', { count: 3, carbon: 1.234, seconds: 0 }, 60)).toBe('3 catches, 1.23 C taken');
    expect(edgeValue('catches', { count: 1, carbon: 0.5, seconds: 0 }, 60)).toBe('1 catch, 0.50 C taken');
    expect(edgeValue('eats', { count: 0, carbon: 0, seconds: 12 }, 180)).toBe(
      'seen eating in 12 of the last 180 s',
    );
    expect(edgeValue('converts', { count: 0, carbon: 0.4, seconds: 0 }, 60)).toBe('0.40 C converted');
  });

  it('no forbidden word in any string the observe copy can produce', () => {
    const all = allObserveStrings();
    expect(all.length).toBeGreaterThan(40);
    const forbidden =
      /mutualis|\bhelps?\b|\bbetter\b|\bneeds?\b|depends? on|superior|advanced|perfect|adapted|immune|symbio|partner/i;
    for (const s of all) expect(s, s).not.toMatch(forbidden);
    // "resource exchange observed" is the only summary label, in exactly one string.
    expect(all.filter((s) => /resource exchange observed/.test(s))).toHaveLength(1);
  });

  it('"resource exchange observed" only where two species each have an arrow to the other', () => {
    // A one-way catch, eating from pools and a conversion are never an exchange.
    expect(
      exchangePairs(
        map([
          { kind: 'catches', actor: 'P01', target: 'B01', count: 2 },
          { kind: 'eats', actor: 'B01', target: 'sugar', seconds: 4 },
          { kind: 'converts', actor: 'B06', target: 'starch', carbon: 1 },
        ]),
      ),
    ).toEqual([]);
    // Each has an arrow to the other: one pair, named once.
    expect(
      exchangePairs(
        map([
          { kind: 'catches', actor: 'P01', target: 'B01', count: 2 },
          { kind: 'infects', actor: 'B01', target: 'P01', count: 1 },
        ]),
      ),
    ).toEqual([['B01', 'P01']]);
    // Two species both eating sugar have no arrow to each other.
    expect(exchangePairs(map([{ actor: 'B01' }, { actor: 'A01', target: 'co2' }]))).toEqual([]);
  });

  it('table rows and the picture come from the edges only (one arrow per edge, kind as text)', () => {
    const m = map(
      [
        { kind: 'eats', actor: 'B01', target: 'sugar', seconds: 20 },
        { kind: 'catches', actor: 'P01', target: 'B01', count: 2, carbon: 0.6 },
        { kind: 'converts', actor: 'B06', target: 'starch', carbon: 0.25 },
      ],
      [{ pool: 'sugar', removed: 1.5, net: true }],
    );
    expect(mapRows(m, names).map((r) => [r.actor, r.kind, r.target, r.measured])).toEqual([
      ['Sprinter', 'eats', 'sugar', 'seen eating in 20 of the last 60 s'],
      ['Ciliate', 'catches', 'Sprinter', '2 catches, 0.60 C taken'],
      ['Crumbsmith', 'converts', 'starch into sugar', '0.25 C converted'],
    ]);
    const pic = mapPicture(m, names);
    expect(pic.arrows.map((a) => [a.from, a.to, a.text])).toEqual([
      ['s:B01', 'p:sugar', 'eats'],
      ['s:P01', 's:B01', 'catches'],
      ['s:B06', 'e:starch', 'converts'],
    ]);
    expect(pic.nodes.map((n) => n.id).sort()).toEqual(['e:starch', 'p:sugar', 's:B01', 's:B06', 's:P01']);
    expect(mapPicture(map([]), names)).toEqual({ nodes: [], arrows: [] });
    expect(poolLines(m)).toEqual([
      'Sugar: net 1.50 C left the pool during feeding (feeding also returns some)',
    ]);
    expect(poolLines(map([], [{ pool: 'detritus', removed: 0.3, net: false }]))).toEqual([
      'Debris: 0.30 C taken by feeding',
    ]);
  });

  it('a drag makes one mask: rectangle corners at the drag’s cells, a circle from centre to edge; letters A–F, then none', () => {
    expect(maskFromDrag('rect', 'A', [40.7, 30.2], [50.1, 20.9])).toEqual({
      id: 'A',
      shape: 'rect',
      x0: 40,
      y0: 30,
      x1: 50,
      y1: 20,
    });
    expect(maskFromDrag('circle', 'B', [60.5, 60.5], [66.5, 60.5])).toEqual({
      id: 'B',
      shape: 'circle',
      cx: 60,
      cy: 60,
      r: 6,
    });
    expect(maskFromDrag('rect', 'C', [-5, 200], [130, -1])).toEqual({
      id: 'C',
      shape: 'rect',
      x0: 0,
      y0: 127,
      x1: 127,
      y1: 0,
    });
    const masks: ProbeMask[] = [];
    for (const id of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
      expect(nextProbeId(masks)).toBe(id);
      masks.push(maskFromDrag('rect', id, [40, 40], [42, 42]));
    }
    expect(nextProbeId(masks)).toBeNull();
    expect(nextProbeId(masks.filter((m) => m.id !== 'C'))).toBe('C');
  });

  it('boundary wording is signed and says when it is not measured', () => {
    expect(boundaryText('measured', 0.25)).toBe('0.25 into the region');
    expect(boundaryText('measured', -0.25)).toBe('0.25 out of the region');
    expect(boundaryText('measured', 0)).toBe('no change');
    expect(boundaryText('notMeasured', 0)).toBe('not measured here');
  });
});
