/**
 * Wave 13 org-ui: the Phase 5 marks in the renderer's vocabulary (D-0109, D-0112, D-0124; UX §6.2, §6.5,
 * §7.1-§7.4). featureLayers picks each mark only from its E_CUE3 bits, with its frame, in the priority live
 * state (held, handling) → glow → mode → jacket → the v1.0 order, at most two unselected; the trap loop's
 * closing frame only from HOLD_CLOSING (a committed hold's first second), holding only in reduced motion; F03's
 * trap still and the native resters' poses per recorded state; nothing for a v1.0 cue. The grit glyph: a v1.0
 * band set paints the HEAD pixels byte for byte; grit paints pale angular specks with a dark corner.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  dormantPoseFrame,
  featureLayers,
  FEATURE_LAYER_IDS,
  MAX_UNSELECTED_MARKS,
  trapLoopFrame,
  trapPoseFrame,
  type LayerPick,
} from '../../src/render/features';
import { cosmetic, DISH_COLORS, DISH_PX_PER_CELL, paintDeposits, repaintDepositCells } from '../../src/render/layers';
import { CELL_COUNT, GRID_W } from '../../src/sim/constants';
import { contrastRatio, GRAPHIC_MIN } from '../../src/ui/a11y/contrast';
import * as P from '../../src/worker/protocol';

const picks = (cue: number, cue3: number, opts: { selected?: boolean; life?: number; cue2?: number; reduced?: boolean } = {}): LayerPick[] => {
  const out: LayerPick[] = [];
  const n = featureLayers(cue, opts.life ?? 0, opts.selected ?? true, out, opts.cue2 ?? 0, { cue3, reduced: opts.reduced ?? false });
  return out.slice(0, n).map((p) => ({ ...p }));
};
const quarter = (q: number) => P.CUE3_HANDLING | (q << P.CUE3_HANDLING_QUARTER_SHIFT);
const jacket = (b: number) => P.CUE3_JACKETED | (b << P.CUE3_JACKET_SHIFT);

describe('the Phase 5 marks are in the renderer vocabulary, after the v1.0 ten (D-0109/D-0112)', () => {
  it('FEATURE_LAYER_IDS ends with the five marks in packing order', () => {
    expect(FEATURE_LAYER_IDS.slice(10)).toEqual(['glow_center', 'jacket_rim', 'mode_half', 'handling_arc', 'trap_loop']);
  });
});

describe('featureLayers: each Phase 5 mark only from its bits, with its frame', () => {
  it('trap_loop on HELD (closing frame 0 only with HOLD_CLOSING); none from HOLD_CLOSING alone', () => {
    expect(picks(0, P.CUE3_HELD)).toEqual([{ layer: 'trap_loop', frame: 1 }]);
    expect(picks(0, P.CUE3_HELD | P.CUE3_HOLD_CLOSING)).toEqual([{ layer: 'trap_loop', frame: 0 }]);
    expect(picks(0, P.CUE3_HOLD_CLOSING)).toEqual([]);
  });

  it('handling_arc on HANDLING with the packed quarter; the quarter bits alone draw nothing', () => {
    for (const q of [0, 1, 2, 3]) expect(picks(0, quarter(q))).toEqual([{ layer: 'handling_arc', frame: q }]);
    expect(picks(0, 2 << P.CUE3_HANDLING_QUARTER_SHIFT)).toEqual([]);
  });

  it('glow_center on a glower or an E02 carrier: dim frame 0, frame 1 while GLOWING; GLOWING alone draws nothing', () => {
    expect(picks(0, P.CUE3_GLOWER)).toEqual([{ layer: 'glow_center', frame: 0 }]);
    expect(picks(0, P.CUE3_GLOWER | P.CUE3_GLOWING)).toEqual([{ layer: 'glow_center', frame: 1 }]);
    expect(picks(0, P.CUE3_MOD_E02 | P.CUE3_GLOWER)).toEqual([{ layer: 'glow_center', frame: 0 }]);
    expect(picks(0, P.CUE3_MOD_E02)).toEqual([{ layer: 'glow_center', frame: 0 }]);
    expect(picks(0, P.CUE3_GLOWING)).toEqual([]);
  });

  it('mode_half: Photo frame 0, Sugar frame 1, none at mode 0', () => {
    expect(picks(0, 1 << P.CUE3_MODE_SHIFT)).toEqual([{ layer: 'mode_half', frame: 0 }]);
    expect(picks(0, 2 << P.CUE3_MODE_SHIFT)).toEqual([{ layer: 'mode_half', frame: 1 }]);
    expect(picks(0, 0)).toEqual([]);
  });

  it('jacket_rim on JACKETED with the band; MOD_E11 alone (no jacket yet) and the band bits alone draw nothing', () => {
    for (const b of [0, 1, 2, 3]) expect(picks(0, jacket(b))).toEqual([{ layer: 'jacket_rim', frame: b }]);
    expect(picks(0, P.CUE3_MOD_E11)).toEqual([]);
    expect(picks(0, 3 << P.CUE3_JACKET_SHIFT)).toEqual([]);
  });

  it('the trap state and the shell draw no feature mark (the trap is F03\'s own pose; the shell is in the body art)', () => {
    for (const s of [1, 2, 3]) expect(picks(0, s << P.CUE3_TRAP_SHIFT)).toEqual([]);
    expect(picks(0, P.CUE3_SHELL)).toEqual([]);
  });
});

describe('priority and the two-mark cap (D-0124: live state, then glow, then mode and jacket, then v1.0)', () => {
  const all = P.CUE3_HELD | quarter(2) | P.CUE3_GLOWER | P.CUE3_GLOWING | (1 << P.CUE3_MODE_SHIFT) | jacket(1);
  it('a selected organism shows every mark in priority order, the Phase 5 marks before the v1.0 ones', () => {
    expect(picks(P.CUE_MOD_E01, all).map((p) => p.layer)).toEqual(['trap_loop', 'handling_arc', 'glow_center', 'mode_half', 'jacket_rim', 'starch_notch']);
  });
  it('unselected: the first two only', () => {
    expect(MAX_UNSELECTED_MARKS).toBe(2);
    expect(picks(P.CUE_MOD_E01, all, { selected: false }).map((p) => p.layer)).toEqual(['trap_loop', 'handling_arc']);
    expect(picks(P.CUE_MOD_E01, P.CUE3_GLOWER | jacket(2), { selected: false }).map((p) => p.layer)).toEqual(['glow_center', 'jacket_rim']);
    expect(picks(P.CUE_MOD_E01 | P.CUE_MOD_E05, (2 << P.CUE3_MODE_SHIFT), { selected: false }).map((p) => p.layer)).toEqual(['mode_half', 'reserve_pocket']);
  });
});

describe('reduced motion (UX §7.4 rows: handling arc, trap loop, glow halo)', () => {
  it('trap loop: holding only; handling arc: the same quarter stills; glow halo: the static glow frame', () => {
    expect(trapLoopFrame(P.CUE3_HELD | P.CUE3_HOLD_CLOSING, false)).toBe(0);
    expect(trapLoopFrame(P.CUE3_HELD | P.CUE3_HOLD_CLOSING, true)).toBe(1);
    expect(trapLoopFrame(P.CUE3_HELD, false)).toBe(1);
    expect(picks(0, P.CUE3_HELD | P.CUE3_HOLD_CLOSING, { reduced: true })).toEqual([{ layer: 'trap_loop', frame: 1 }]);
    for (const q of [0, 1, 2, 3]) expect(picks(0, quarter(q), { reduced: true })).toEqual(picks(0, quarter(q)));
    expect(picks(0, P.CUE3_GLOWER | P.CUE3_GLOWING, { reduced: true })).toEqual([{ layer: 'glow_center', frame: 1 }]);
  });
});

describe('poses: F03\'s trap still and the native resters\' dormant stills', () => {
  it('trapPoseFrame: 1 armed → Open 0, 2 holding → Holding 1, 3 cooldown → Cooldown 2, none → -1', () => {
    expect([0, 1, 2, 3].map((s) => trapPoseFrame(s << P.CUE3_TRAP_SHIFT))).toEqual([-1, 0, 1, 2]);
    expect(trapPoseFrame(P.CUE3_HELD | P.CUE3_GLOWER)).toBe(-1);
  });
  it('dormantPoseFrame: Preparing 0, Resting 1, Waking 2; Active -1', () => {
    expect([0, 1, 2, 3, 4].map(dormantPoseFrame)).toEqual([-1, 0, 1, 2, -1]);
  });
});

describe('a v1.0 cue draws exactly what it drew before', () => {
  it('cue3 0 (or absent) gives the same picks as without the context field, for every v1.0 cue combination sampled', () => {
    const base: LayerPick[] = [];
    const now: LayerPick[] = [];
    for (let k = 0; k < 4000; k++) {
      const cue = Math.floor(cosmetic(k, 3) * 2048);
      const cue2 = Math.floor(cosmetic(k, 5) * 16384);
      const life = Math.floor(cosmetic(k, 9) * 4);
      const selected = cosmetic(k, 13) < 0.5;
      const reduced = cosmetic(k, 17) < 0.5;
      const a = featureLayers(cue, life, selected, base, cue2, { reduced, filmBand: 2 });
      const b = featureLayers(cue, life, selected, now, cue2, { reduced, filmBand: 2, cue3: 0 });
      expect(b).toBe(a);
      expect(now.slice(0, b)).toEqual(base.slice(0, a));
      for (let m = 0; m < b; m++) expect(['glow_center', 'jacket_rim', 'mode_half', 'handling_arc', 'trap_loop']).not.toContain(now[m]!.layer);
    }
  });
});

describe('the grit glyph (layers.ts paintDepositCell, deposit band 7; procedural, D-0109/D-0112)', () => {
  const W = GRID_W * DISH_PX_PER_CELL;
  const image = () => ({ width: W, height: W, data: new Uint8ClampedArray(W * W * 4) }) as unknown as ImageData;
  const v1Bands = () => {
    const bands = new Uint8Array(8 * CELL_COUNT);
    for (let k = 0; k < 6000; k++) {
      const i = Math.floor(cosmetic(k, 7) * CELL_COUNT);
      const band = Math.floor(cosmetic(k, 11) * 7); // bands 0–6, never 7 (grit is 0 in every v1.0 dish)
      bands[band * CELL_COUNT + i] = Math.floor(cosmetic(k, 29) * 256);
    }
    return bands;
  };

  it('a v1.0 band set paints the HEAD pixels byte for byte (and the same as its first six bands alone)', () => {
    const img = image();
    paintDeposits(img, v1Bands());
    // sha256 of HEAD's (3daebb2) paintDeposits over this exact band set, computed from a git archive of HEAD with
    // tmp/org-ui/cmp/paint.ts while this wave was built; the current painter must give the same pixels.
    expect(createHash('sha256').update(img.data).digest('hex')).toBe('cabc7fadca5865cc80cd27c5c8c80fcd2e8d429d217aa46726cbc8f87b40a75c');
    const six = image();
    paintDeposits(six, v1Bands().slice(0, 6 * CELL_COUNT));
    expect(Buffer.from(six.data.buffer).equals(Buffer.from(img.data.buffer))).toBe(true);
  });

  it('grit paints pale angular specks with a dark corner, more where there is more grit; only in its own cell', () => {
    const count = (level: number) => {
      const bands = new Uint8Array(8 * CELL_COUNT);
      const cell = 64 * GRID_W + 64;
      bands[7 * CELL_COUNT + cell] = level;
      const img = image();
      paintDeposits(img, bands);
      let pale = 0;
      let edge = 0;
      let outside = 0;
      for (let y = 0; y < W; y++)
        for (let x = 0; x < W; x++) {
          const o = (y * W + x) * 4;
          if (img.data[o + 3] === 0) continue;
          const inCell = Math.floor(x / DISH_PX_PER_CELL) === 64 && Math.floor(y / DISH_PX_PER_CELL) === 64;
          if (!inCell) outside++;
          const rgb = [img.data[o], img.data[o + 1], img.data[o + 2]];
          if (rgb.join() === DISH_COLORS.gritPale.join()) pale++;
          if (rgb.join() === DISH_COLORS.gritEdge.join()) edge++;
        }
      return { pale, edge, outside };
    };
    expect(count(0)).toEqual({ pale: 0, edge: 0, outside: 0 });
    const lo = count(20);
    const hi = count(250);
    expect(lo.outside + hi.outside).toBe(0);
    expect(lo.pale).toBeGreaterThan(0);
    expect(lo.edge).toBeGreaterThan(0);
    expect(hi.pale + hi.edge).toBeGreaterThan(lo.pale + lo.edge);
  });

  it('the incremental repaint follows band 7 and stays byte-identical to a full paint', () => {
    const bands = new Uint8Array(8 * CELL_COUNT);
    const prev = new Uint8Array(8 * CELL_COUNT);
    const inc = image();
    const rect = { x: 0, y: 0, w: 0, h: 0 };
    for (let round = 0; round < 10; round++) {
      for (let k = 0; k < 300; k++) {
        const i = Math.floor(cosmetic(round * 1000 + k, 7) * CELL_COUNT);
        const band = cosmetic(round * 1000 + k, 41) < 0.5 ? 7 : Math.floor(cosmetic(round * 1000 + k, 11) * 6);
        bands[band * CELL_COUNT + i] = Math.floor(cosmetic(round * 1000 + k, 29) * 256);
      }
      repaintDepositCells(inc, bands, prev, rect);
      const full = image();
      paintDeposits(full, bands);
      expect(Buffer.from(inc.data.buffer).equals(Buffer.from(full.data.buffer))).toBe(true);
    }
  });

  it('contrast (UX §4.1 essential graphics ≥ 3:1): the dark corner on water and gel, the pale face on sediment; distinct from starch and debris', () => {
    const c = DISH_COLORS;
    expect(contrastRatio(c.gritEdge, c.water)).toBeGreaterThanOrEqual(GRAPHIC_MIN);
    expect(contrastRatio(c.gritEdge, c.gel)).toBeGreaterThanOrEqual(GRAPHIC_MIN);
    expect(contrastRatio(c.gritPale, c.sediment)).toBeGreaterThanOrEqual(GRAPHIC_MIN);
    expect(c.gritPale).not.toEqual(c.starch);
    expect(c.gritEdge).not.toEqual(c.detritus);
  });
});
