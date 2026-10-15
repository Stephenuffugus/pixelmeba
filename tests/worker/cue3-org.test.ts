/**
 * Wave 13 org-ui: the E_CUE3 refinements for the Phase 5 organism marks (protocol 3, additive; D-0124).
 * - HANDLING_QUARTER (2 bits at 13): the D-0112 handling_arc frame min(3, max(0, ⌈4 p / n⌉ − 1)), packed only
 *   while CUE3_HANDLING is set, on a real P10 attempt (stepped) and at the exact ratios (set by hand, named);
 * - JACKET band from src/sim/handling.ts jacketCoverage on a jacket built in stage 8 (current B, not the target);
 * - HOLD_CLOSING on a real trap hold for exactly its first second; GLOWER on a native glower and an E02 carrier;
 * - a v1.0 dish packs E_CUE3 0 for every organism (tests/worker/protocol3-v1-equivalence.test.ts is the golden).
 * Registry REG_O: the shipped manifest plus A04, B09, B13, F03, P07, P10, E11, 'signals', 'rivalry', 'silicate'
 * and M08, with allowUnimplemented (TRAP is appended by the lead at the wave 13 integration, E11 at the organism
 * flip). States are reached by stepping unless a test says it sets one by hand.
 */
import { describe, expect, it } from 'vitest';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex, SUB_SEDIMENT } from '../../src/sim/grid';
import { jacketCoverage } from '../../src/sim/handling';
import { realizeRecipe } from '../../src/sim/recipes';
import { rebuildIndex } from '../../src/sim/spatial';
import { step, type StepHooks } from '../../src/sim/tick';
import { markField } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import * as P from '../../src/worker/protocol';
import { cue3Of, handlingQuarter, packEntities } from '../../src/worker/snapshot';
import { registryWith } from '../helpers/registry';
import { clearWater, fillField, place, placeWith, registry } from '../helpers/world';

const shipped = registry().manifest;
// Wave 13: TRAP (F03) is appended at the integration, E11 at the organism flip; HANDLING etc. are implemented.
const REG_O = registryWith(
  {
    enabledSpecies: [...shipped.enabledSpecies, 'A04', 'B09', 'B13', 'F03', 'P07', 'P10'].sort(),
    enabledModules: [...shipped.enabledModules, 'E11'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'signals', 'rivalry', 'silicate'].sort() as SystemFlag[],
    enabledMaterials: [...shipped.enabledMaterials, 'M08'].sort(),
  },
  { allowUnimplemented: true },
);

function cue3(w: World, slot: number): number {
  const p = packEntities(w, null, null);
  for (let k = 0; k < p.count; k++) if (p.ents[k * P.ENT_STRIDE + P.E_SLOT] === slot) return p.ents[k * P.ENT_STRIDE + P.E_CUE3]!;
  throw new Error(`slot ${slot} not packed`);
}
const quarterOf = (c: number) => (c & P.CUE3_HANDLING_QUARTER_MASK) >> P.CUE3_HANDLING_QUARTER_SHIFT;
const jacketBandOf = (c: number) => (c & P.CUE3_JACKET_MASK) >> P.CUE3_JACKET_SHIFT;

/** One tick with organisms put at fixed positions right after stage 4 (the handling.test pin). */
function stepPinned(w: World, pins: readonly (readonly [number, number, number])[]): void {
  step(w, {
    afterStage: (s) => {
      if (s !== 4) return;
      for (const [slot, x, y] of pins) {
        if (!w.ents.isAlive(slot)) continue;
        w.ents.cols.x[slot] = x;
        w.ents.cols.y[slot] = y;
      }
      rebuildIndex(w);
    },
  });
}

describe('E_CUE3 wave 13 bits: values and ranges', () => {
  it('the new bits are distinct from every wave 11 bit and below 2^24', () => {
    expect([P.CUE3_HANDLING_QUARTER_SHIFT, P.CUE3_HANDLING_QUARTER_MASK, P.CUE3_HOLD_CLOSING, P.CUE3_GLOWER]).toEqual([13, 3 << 13, 32768, 65536]);
    let seen = 0;
    for (const f of [
      P.CUE3_GLOWING,
      P.CUE3_MOD_E02,
      P.CUE3_MODE_MASK,
      P.CUE3_HELD,
      P.CUE3_HANDLING,
      P.CUE3_TRAP_MASK,
      P.CUE3_JACKET_MASK,
      P.CUE3_JACKETED,
      P.CUE3_MOD_E11,
      P.CUE3_SHELL,
      P.CUE3_HANDLING_QUARTER_MASK,
      P.CUE3_HOLD_CLOSING,
      P.CUE3_GLOWER,
    ]) {
      expect(f & seen).toBe(0);
      seen |= f;
    }
    expect(seen).toBeLessThan(2 ** 24);
    expect(Math.fround(seen)).toBe(seen);
    expect(P.PROTOCOL_VERSION).toBe(3);
    expect(P.ENT_STRIDE).toBe(15);
  });
});

describe('the handling quarter (D-0112 handling_arc frame)', () => {
  it('handlingQuarter at p / n = 0.1, 0.25, 0.26, 0.5, 0.75, 1 − 1e-9 is 0, 0, 1, 1, 2, 3 (need 1 and need 4)', () => {
    for (const need of [1, 4]) {
      expect([0.1, 0.25, 0.26, 0.5, 0.75, 1 - 1e-9].map((r) => handlingQuarter(r * need, need))).toEqual([0, 0, 1, 1, 2, 3]);
    }
    expect(handlingQuarter(0.5, 0)).toBe(0);
  });

  it('a real P10 attempt on a P01 packs CUE3_HANDLING with the quarter of its own progress over its need, every tick', () => {
    const w = clearWater({}, REG_O);
    const p10 = place(w, 'P10', 64.5, 64.5, { E: 50 });
    const prey = place(w, 'P01', 64.8, 64.5);
    const c = w.ents.cols;
    expect(cue3(w, p10) & (P.CUE3_HANDLING | P.CUE3_HANDLING_QUARTER_MASK)).toBe(0);
    const seen: number[] = [];
    for (let k = 0; k < 12 && w.ents.isAlive(prey); k++) {
      stepPinned(w, [
        [p10, 64.5, 64.5],
        [prey, 64.8, 64.5],
      ]);
      if (!(c.handlingNeed[p10]! > 0)) continue;
      const word = cue3(w, p10);
      expect(word & P.CUE3_HANDLING).toBe(P.CUE3_HANDLING);
      expect(quarterOf(word)).toBe(handlingQuarter(c.handlingProgress[p10]!, c.handlingNeed[p10]!));
      seen.push(quarterOf(word));
    }
    // 1 s of contact: progress 0.1 … 0.9 at the tick boundaries → quarters 0, 0, 1, 1, 1, 2, 2, 3, 3.
    expect(seen).toEqual([0, 0, 1, 1, 1, 2, 2, 3, 3]);
    expect(w.ents.isAlive(prey)).toBe(false); // captured on the 10th contact tick
    expect(cue3(w, p10) & (P.CUE3_HANDLING | P.CUE3_HANDLING_QUARTER_MASK)).toBe(0); // no attempt, no quarter
  });

  it('set by hand: the exact ratios pack their frames; need 0 (no attempt) packs no quarter even with progress', () => {
    const w = clearWater({}, REG_O);
    const p10 = place(w, 'P10', 64.5, 64.5, { E: 50 });
    const prey = place(w, 'P01', 64.8, 64.5);
    const c = w.ents.cols;
    c.preySlot[p10] = prey;
    c.preyBirthId[p10] = c.birthId[prey]!;
    c.handlingNeed[p10] = 4;
    for (const [r, f] of [
      [0.1, 0],
      [0.25, 0],
      [0.26, 1],
      [0.5, 1],
      [0.75, 2],
      [1 - 1e-9, 3],
    ] as const) {
      c.handlingProgress[p10] = r * 4;
      expect(cue3(w, p10)).toBe(P.CUE3_HANDLING | (f << P.CUE3_HANDLING_QUARTER_SHIFT));
    }
    c.handlingNeed[p10] = 0;
    expect(cue3(w, p10)).toBe(0);
  });
});

describe('the jacket band reads jacketCoverage (one c everywhere; D-0124)', () => {
  it('on a jacket built in stage 8, the band is ⌈4c⌉ − 1 of the current body; at B ≤ 0 (set by hand) c is 0, band 0', () => {
    const w = clearWater({}, REG_O);
    fillField(w, 'silicate', 0.3);
    const s = placeWith(w, 'P01', 64.5, 64.5, ['E11'], { E: 90 });
    const c = w.ents.cols;
    const bands = new Set<number>();
    for (let t = 0; t < 260; t++) {
      step(w);
      if (!w.ents.isAlive(s)) break;
      const m = c.jacketMineral[s]!;
      const word = cue3(w, s);
      if (m > 0) {
        const cov = jacketCoverage(m, c.B[s]!);
        expect(word & P.CUE3_JACKETED).toBe(P.CUE3_JACKETED);
        expect(jacketBandOf(word)).toBe(Math.min(3, Math.max(0, Math.ceil(4 * cov) - 1)));
        bands.add(jacketBandOf(word));
      } else expect(word & (P.CUE3_JACKETED | P.CUE3_JACKET_MASK)).toBe(0);
    }
    expect([...bands].sort()).toEqual([0, 1, 2, 3]);
    // Not the target: halve the body after a full jacket (set by hand) → c stays at 1 (min 1), band 3; double it → band 1.
    const m = c.jacketMineral[s]!;
    const B = c.B[s]!;
    c.B[s] = 2 * B;
    expect(jacketBandOf(cue3(w, s))).toBe(Math.min(3, Math.max(0, Math.ceil(4 * jacketCoverage(m, 2 * B)) - 1)));
    c.B[s] = 0;
    expect(jacketCoverage(m, 0)).toBe(0);
    expect(jacketBandOf(cue3(w, s))).toBe(0);
  });
});

describe('HOLD_CLOSING (the trap_loop closing frame) and GLOWER', () => {
  it('a real hold packs HELD | HOLD_CLOSING for exactly its first second (10 ticks), then HELD only', () => {
    const w = clearWater({}, REG_O);
    for (let y = 56; y < 72; y++) for (let x = 56; x < 72; x++) w.grid.substrate[cellIndex(x, y)] = SUB_SEDIMENT;
    w.grid.geometryVersion++;
    fillField(w, 'broth', 0);
    const f = place(w, 'F03', 64.5, 64.5, { B: 2.8, N: 0.28, E: 80 });
    const p = place(w, 'P04', 64.6, 64.5, { E: 100 });
    const c = w.ents.cols;
    const pin: StepHooks = {
      afterStage: (s) => {
        if (s !== 4 || !w.ents.isAlive(p)) return;
        c.x[p] = 64.6;
        c.y[p] = 64.5;
        rebuildIndex(w);
      },
    };
    let t = 0;
    while (c.heldBySlot[p]! < 0 && t++ < 50) step(w, pin);
    expect(c.heldBySlot[p]).toBe(f);
    expect(w.events.ring.some((e) => e.type === 'trapHold')).toBe(true);
    const words: number[] = [];
    for (let k = 0; k < 14; k++) {
      words.push(cue3(w, p) & (P.CUE3_HELD | P.CUE3_HOLD_CLOSING));
      step(w, pin);
    }
    const closing = P.CUE3_HELD | P.CUE3_HOLD_CLOSING;
    expect(words).toEqual([...Array<number>(10).fill(closing), ...Array<number>(4).fill(P.CUE3_HELD)]);
    // The owner shows its trap state, never the held bits.
    expect(cue3(w, f) & (P.CUE3_HELD | P.CUE3_HOLD_CLOSING)).toBe(0);
    expect((cue3(w, f) & P.CUE3_TRAP_MASK) >> P.CUE3_TRAP_SHIFT).toBe(2);
  });

  it('GLOWER on a native glower (B09) and an E02 carrier; never on a plain organism; GLOWING from the glow state', () => {
    const reg = registryWith(
      {
        enabledSpecies: [...shipped.enabledSpecies, 'B09'].sort(),
        enabledModules: [...shipped.enabledModules, 'E02'].sort(),
        enabledSystems: [...shipped.enabledSystems, 'signals'].sort() as SystemFlag[],
      },
      { allowUnimplemented: true }, // E02 joins IMPLEMENTED_MODULES at the organism flip
    );
    const w = clearWater({}, reg);
    const b09 = place(w, 'B09', 40.5, 64.5);
    const e02 = placeWith(w, 'B01', 50.5, 64.5, ['E02']);
    const plain = place(w, 'B01', 60.5, 64.5);
    expect(cue3(w, b09)).toBe(P.CUE3_GLOWER);
    expect(cue3(w, e02)).toBe(P.CUE3_GLOWER | P.CUE3_MOD_E02);
    expect(cue3(w, plain)).toBe(0);
    // A glow reached by stepping: signal held at 0.5 right before stage 8 for 6 s.
    const cell = cellIndex(40, 64);
    for (let k = 0; k < 60; k++)
      step(w, {
        afterStage: (s, world) => {
          if (s !== 7) return;
          world.fields.sGlow![cell] = 0.5;
          markField(world, 'sGlow');
        },
      });
    expect(w.ents.cols.glowState[b09]).toBe(1);
    expect(cue3(w, b09)).toBe(P.CUE3_GLOWER | P.CUE3_GLOWING);
  });
});

describe('a v1.0 dish packs no Phase 5 bit', () => {
  it('FIRST_DISH_V1 under the shipped registry: E_CUE3 0 for every organism over 300 ticks; cue3Of without a glower is the wave 11 word', () => {
    const reg = registry();
    const w = realizeRecipe(reg, 'FIRST_DISH_V1', { seed: 104729 });
    for (let t = 0; t < 300; t++) {
      step(w);
      if (t % 50 !== 49) continue;
      const p = packEntities(w, null, null);
      expect(p.count).toBeGreaterThan(0);
      for (let k = 0; k < p.count; k++) expect(p.ents[k * P.ENT_STRIDE + P.E_CUE3]).toBe(0);
    }
    for (let i = 0; i < w.ents.highWater; i++) if (w.ents.cols.alive[i] === 1) expect(cue3Of(w, i, [], false)).toBe(0);
  });
});
