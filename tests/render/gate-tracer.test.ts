/**
 * The gate preview tracer (P5.2; SPEC §4.9 last line; g5-briefs S6; D-0119): src/render/gateTracer.ts frames
 * are a pure function of (code, token index, ms); a blocked class never reaches the far side and a permitted
 * one does, for every code (CT §5.3 through barriers.ts edgePermits/edgeFactor; S04 one way only); the
 * renderer path draws nothing unless the dish is paused; computing thousands of frames between ticks leaves
 * the simulation bit-identical; reduced motion is a static end frame; and the source draws no simulation
 * randomness, Math.random or Date.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EDGE_CHANNEL, EDGE_NONE, EDGE_S01, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN, type TransportClass } from '../../src/sim/barriers';
import { cellIndex } from '../../src/sim/grid';
import { stateHash } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { EDGE_FLOW_BACK } from '../../src/worker/protocol';
import { TRACER_CLASSES, TRACER_PERIOD_MS, TRACER_REACH, TRACER_TOKENS, tracerDrawList, tracerFrame, tracerPoint, tracerToken } from '../../src/render/gateTracer';
import { barrierDish, place, pushEdges, verticalLine } from '../helpers/world';
import { trajectoryDigest } from '../helpers/trajectory';

const ROOT = join(__dirname, '..', '..');
const CODES = [EDGE_NONE, EDGE_S01, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN, EDGE_CHANNEL, EDGE_CHANNEL | EDGE_FLOW_BACK];

/** Which tokens reach the far side over two whole periods (sampled every 7 ms), and whether any blocked token ever left its side. */
function crossings(code: number): { crossed: Set<string>; leaked: string[] } {
  const crossed = new Set<string>();
  const leaked: string[] = [];
  for (let i = 0; i < TRACER_TOKENS; i++) {
    for (let ms = 0; ms <= 2 * TRACER_PERIOD_MS; ms += 7) {
      const t = tracerToken(code, i, ms);
      const far = t.across * t.side < 0;
      if (far && t.across * t.side < -0.3) crossed.add(`${t.cls}${t.side}`);
      if (!t.crosses && t.across * t.side <= 0) leaked.push(`${t.cls}${t.side}@${ms}`);
    }
  }
  return { crossed, leaked };
}

const both = (classes: readonly TransportClass[]): string[] => classes.flatMap((c) => [`${c}-1`, `${c}1`]).sort();

describe('gate preview tracer (cosmetic, paused only)', () => {
  it('frames are a pure function of (code, index, ms)', () => {
    for (const code of CODES)
      for (const ms of [0, 1, 433, 1600, 3199, 3200, 12345.5]) {
        expect(tracerFrame(code, ms)).toEqual(tracerFrame(code, ms));
        for (let i = 0; i < TRACER_TOKENS; i++) expect(tracerToken(code, i, ms)).toEqual(tracerFrame(code, ms)[i]);
      }
    expect(tracerFrame(EDGE_S01, 0).map((t) => t.cls)).toEqual([...TRACER_CLASSES, ...TRACER_CLASSES]);
  });

  it('a blocked class never reaches the far side and a permitted one does, for every code', () => {
    const moving = TRACER_CLASSES.filter((c) => c !== 'fixed');
    const want: Record<number, string[]> = {
      [EDGE_NONE]: both(moving),
      [EDGE_S01]: both(['dissolved', 'activity']),
      [EDGE_S02]: both(['dissolved', 'activity', 'viral', 'small']),
      [EDGE_SHUTTER_CLOSED]: [],
      [EDGE_SHUTTER_OPEN]: both(moving),
      // S04 flowing +1: from the edge's own cell side (−1) only, pools it moves and Small; nothing back.
      [EDGE_CHANNEL]: ['dissolved-1', 'small-1', 'viral-1'],
      [EDGE_CHANNEL | EDGE_FLOW_BACK]: ['dissolved1', 'small1', 'viral1'],
    };
    for (const code of CODES) {
      const { crossed, leaked } = crossings(code);
      expect(leaked, `code ${code}`).toEqual([]);
      expect([...crossed].sort(), `code ${code}`).toEqual([...want[code]!].sort());
    }
    // Spot checks named by the task: S01 viral blocked, S02 Small passes and Medium does not.
    expect(tracerToken(EDGE_S01, 2, 0).crosses).toBe(false);
    expect(tracerToken(EDGE_S02, 3, 0).crosses).toBe(true);
    expect(tracerToken(EDGE_S02, 4, 0).crosses).toBe(false);
  });

  it('the Fixed tokens never move on any code, open edges included (D-0120)', () => {
    for (const code of CODES)
      for (const ms of [0, 1, 433, 1600, 2400, 3199, 12345.5])
        for (const reduced of [false, true]) {
          const own = tracerToken(code, 6, ms, reduced);
          const far = tracerToken(code, 13, ms, reduced);
          expect([own.cls, far.cls]).toEqual(['fixed', 'fixed']);
          expect([own.crosses, own.trail, own.across]).toEqual([false, 0, -TRACER_REACH]);
          expect([far.crosses, far.trail, far.across]).toEqual([false, 0, TRACER_REACH]);
        }
  });

  it('field classes cross with a trail density equal to the edge factor; organisms leave none', () => {
    expect(tracerToken(EDGE_S01, 0, 0).trail).toBe(0.25);
    expect(tracerToken(EDGE_S02, 1, 0).trail).toBe(0.5);
    expect(tracerToken(EDGE_SHUTTER_OPEN, 2, 0).trail).toBe(1);
    expect(tracerToken(EDGE_S01, 2, 0).trail).toBe(0);
    expect(tracerToken(EDGE_S02, 3, 0).trail).toBe(0);
  });

  it('reduced motion: one static frame with every token at its end position', () => {
    for (const code of CODES) {
      const f = tracerFrame(code, 0, true);
      for (const ms of [17, 900, 2500]) expect(tracerFrame(code, ms, true)).toEqual(f);
      for (const t of f) expect(t.crosses ? t.across * t.side < -0.5 : t.across * t.side > 0.5).toBe(true);
    }
  });

  it('the renderer path draws nothing unless paused with a selection', () => {
    const sel = { cell: cellIndex(64, 64), dir: 'R' as const };
    for (const speed of [1, 2, 4]) expect(tracerDrawList(sel, speed, EDGE_S01, 100, false)).toBeNull();
    expect(tracerDrawList(null, 0, EDGE_S01, 100, false)).toBeNull();
    expect(tracerDrawList(sel, 0, EDGE_S01, 100, false)).toHaveLength(TRACER_TOKENS);
    // renderer.ts draws the tracer only through tracerDrawList with the current snapshot's speed.
    const src = readFileSync(join(ROOT, 'src', 'render', 'renderer.ts'), 'utf8');
    expect(src).toMatch(/tracerDrawList\(sel, s\.speed, code,/);
    expect(src.match(/tracerFrame|tracerToken/g)).toBeNull();
    // Points lie on the edge's normal through the token's lane.
    const [x, y] = tracerPoint({ along: 0.5, across: -0.25 }, cellIndex(10, 20), 'R');
    expect([x, y]).toEqual([10.75, 20.5]);
    expect(tracerPoint({ along: 0.5, across: 0.25 }, cellIndex(10, 20), 'D')).toEqual([10.5, 21.25]);
  });

  it('4,000 tracer frames computed between 400 ticks leave stateHash and the full digest unchanged', () => {
    const make = (): World => {
      const w = barrierDish();
      pushEdges(w, [...verticalLine('S02', 60, 50, 78), { kind: 'S03', cell: cellIndex(70, 60), dir: 'D', open: true }]);
      for (let k = 0; k < 12; k++) place(w, k % 2 ? 'B01' : 'P01', 50.5 + 2 * k, 60.5 + (k % 5));
      return w;
    };
    const a = make();
    const b = make();
    let ms = 0;
    for (let t = 0; t < 400; t++) {
      step(a);
      step(b);
      for (let f = 0; f < 10; f++) {
        ms += 16.7;
        const e = b.edges[(t + f) % b.edges.length]!;
        const code = e.kind === 'S02' ? EDGE_S02 : EDGE_SHUTTER_OPEN;
        for (const tok of tracerFrame(code, ms, f % 2 === 0)) tracerPoint(tok, e.cell, e.dir);
      }
    }
    expect(stateHash(b)).toBe(stateHash(a));
    expect(trajectoryDigest(b, 'full')).toBe(trajectoryDigest(a, 'full'));
  });

  it('gateTracer.ts imports nothing from src/sim/rng.ts and uses no Math.random or Date', () => {
    const src = readFileSync(join(ROOT, 'src', 'render', 'gateTracer.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/rng/);
    expect(code).not.toMatch(/\bdet\(/);
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/\bDate\b/);
    expect(code).not.toMatch(/performance\.now/);
    for (const m of code.matchAll(/from '([^']+)'/g)) expect(['@sim/barriers', '@worker/protocol', './layers', './structureLayer']).toContain(m[1]);
  });
});
