/**
 * Phase 5 wave 12, e2-light-algae: protocol 3's E_CUE3 mode field (wave 11's CUE3_MODE_SHIFT / CUE3_MODE_MASK,
 * snapshot.ts cue3Of) carries the A04 saved metabolic mode this wave writes: it equals metabolicMode for an A04 in
 * Photo and in Sugar mode, follows a switch, and is 0 for every other organism. No protocol edit.
 *
 * MIXOTROPHY and LOW_LIGHT_CURVE are not in IMPLEMENTED_NATIVE_ABILITIES yet (the lead appends them at the wave 12
 * integration, D-0104), so REG uses allowUnimplemented.
 */
import { describe, expect, it } from 'vitest';
import { maskCells } from '../../src/sim/grid';
import { MODE_PHOTO, MODE_SUGAR } from '../../src/sim/mixotrophy';
import { step } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { CUE3_MODE_MASK, CUE3_MODE_SHIFT, E_CUE3, E_SLOT, ENT_STRIDE } from '../../src/worker/protocol';
import { packEntities } from '../../src/worker/snapshot';
import { registryWith } from '../helpers/registry';
import { clearWater, place, placeWith, registry } from '../helpers/world';

const SHIPPED = registry().manifest;
const REG = registryWith({ enabledSpecies: [...SHIPPED.enabledSpecies, 'A03', 'A04', 'A05'].sort() }, { allowUnimplemented: true });

function setLight(w: World, light: number): void {
  for (const cell of maskCells()) w.grid.lightBase[cell] = light;
  w.grid.geometryVersion++;
  updateDerived(w);
}

/** The packed mode field per slot. */
function packedModes(w: World): Map<number, number> {
  const { ents, count } = packEntities(w, null, null);
  const out = new Map<number, number>();
  for (let k = 0; k < count; k++) {
    const o = k * ENT_STRIDE;
    out.set(ents[o + E_SLOT]!, (ents[o + E_CUE3]! & CUE3_MODE_MASK) >> CUE3_MODE_SHIFT);
  }
  return out;
}

describe('E_CUE3 mode field (protocol 3, unchanged)', () => {
  it('equals metabolicMode for A04 in both modes, follows a switch, and is 0 for every other organism', () => {
    const w = clearWater({}, REG);
    setLight(w, 0.8);
    const a = place(w, 'A04', 60.5, 64.5);
    const b = placeWith(w, 'A04', 62.5, 64.5, ['E06']);
    const others = [place(w, 'A01', 64.5, 64.5), place(w, 'A03', 66.5, 64.5), place(w, 'A05', 68.5, 64.5), place(w, 'B01', 70.5, 64.5), place(w, 'P01', 72.5, 64.5)];
    expect(packedModes(w).get(a)).toBe(0); // mode 0 before the first stage 4
    step(w);
    const c = w.ents.cols;
    let m = packedModes(w);
    for (const s of [a, b]) {
      expect(c.metabolicMode[s]).toBe(MODE_PHOTO);
      expect(m.get(s)).toBe(MODE_PHOTO);
    }
    for (const s of others) expect(m.get(s)).toBe(0);
    setLight(w, 0.1);
    step(w);
    m = packedModes(w);
    for (const s of [a, b]) {
      expect(c.metabolicMode[s]).toBe(MODE_SUGAR);
      expect(m.get(s)).toBe(MODE_SUGAR);
    }
    for (const s of others) expect(m.get(s)).toBe(0);
    expect(w.events.totals.modeSwitch).toBe(2);
  });
});
