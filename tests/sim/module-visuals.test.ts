/**
 * P2.1 inspector exposure and visual-layer mapping (SPEC §9 visuals, §12.1; UX §6.2): every mark
 * and every inspector line comes from the genome and measured state. No notch without E01, no
 * pocket without E05 (and its fill band is the real stored energy), no seam unless an E03 carrier
 * is Preparing, Resting or Waking; at most two marks unless selected.
 */
import { describe, expect, it } from 'vitest';
import { introduceOrganism } from '../../src/sim/commands';
import { LIFE_RESTING } from '../../src/sim/entities';
import { cellIndex } from '../../src/sim/grid';
import { reserveBand } from '../../src/sim/moduleView';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { rebuildIndex } from '../../src/sim/spatial';
import { run } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import {
  CUE_MOD_E01,
  CUE_MOD_E03,
  CUE_MOD_E05,
  CUE_RESERVE_BAND_MASK,
  CUE_RESERVE_BAND_SHIFT,
  E_CUE,
  E_LIFE,
  ENT_STRIDE,
  ID_STRIDE,
} from '../../src/worker/protocol';
import { buildInspector, packEntities } from '../../src/worker/snapshot';
import { buildLayerAtlas, featureLayers, type LayerPick } from '../../src/render/features';
import { FEATURE_LAYERS } from '../../art/src/layers/modules';
import { clearWater } from '../helpers/world';
import { dormancyLines, energyCapText, lifeStateLabel, moduleText, upkeepText } from '../../src/ui/strings/modules';
import { stopAnswer } from '../../src/ui/strings/shortcuts';
import { reasonText } from '../../src/ui/strings/reasons';

const FORBIDDEN = /\b(immune|superior|adapted|advanced|perfect|invincible)\b/i;
function clean(lines: readonly string[]): void {
  for (const l of lines) {
    expect(l.length).toBeGreaterThan(3);
    expect(l).not.toMatch(FORBIDDEN);
    expect(l).not.toMatch(/undefined|NaN|null|\?/);
  }
}

function placeWith(w: World, x: number, modules: readonly string[], E?: number): number {
  const s = introduceOrganism(w, speciesIndex(w, 'B01'), cellIndex(x, 64), 'test', { modules, exactCenter: true });
  if (E !== undefined) w.ents.cols.E[s] = E;
  rebuildIndex(w);
  return s;
}

function cueOf(w: World, birthId: number): { cue: number; life: number } {
  const p = packEntities(w, null, null);
  for (let k = 0; k < p.count; k++) {
    if (p.ids[k * ID_STRIDE] === birthId) return { cue: p.ents[k * ENT_STRIDE + E_CUE]!, life: p.ents[k * ENT_STRIDE + E_LIFE]! };
  }
  throw new Error('not packed');
}

describe('P2.1 module visuals and inspector', () => {
  it('cue bits follow the genome; the reserve band follows stored energy above the base cap', () => {
    const w = clearWater();
    const plain = placeWith(w, 20, []);
    const e01 = placeWith(w, 30, ['E01']);
    const e03 = placeWith(w, 40, ['E03']);
    const bands = [50, 100, 105, 113.3, 120, 127, 140].map((E, k) => placeWith(w, 50 + 5 * k, ['E05'], E));
    const c = w.ents.cols;
    const mods = CUE_MOD_E01 | CUE_MOD_E03 | CUE_MOD_E05;
    expect(cueOf(w, c.birthId[plain]!).cue & (mods | CUE_RESERVE_BAND_MASK)).toBe(0);
    expect(cueOf(w, c.birthId[e01]!).cue & mods).toBe(CUE_MOD_E01);
    expect(cueOf(w, c.birthId[e03]!).cue & mods).toBe(CUE_MOD_E03);
    const got = bands.map((s) => {
      const cue = cueOf(w, c.birthId[s]!).cue;
      expect(cue & mods).toBe(CUE_MOD_E05);
      return (cue & CUE_RESERVE_BAND_MASK) >> CUE_RESERVE_BAND_SHIFT;
    });
    expect(got).toEqual([0, 0, 1, 1, 2, 3, 3]);
    expect(reserveBand(140, profileOf(w, plain))).toBe(0); // no chamber, no band
  });

  it('marks map only from cue bits and life state; two at most unless selected', () => {
    const picks: LayerPick[] = [];
    expect(featureLayers(0, 0, true, picks)).toBe(0);
    // An Active E03 carrier shows the small seam (frame 0), after any live marks.
    expect(featureLayers(CUE_MOD_E03, 0, true, picks)).toBe(1);
    expect(picks[0]).toEqual({ layer: 'resting_seam', frame: 0 });
    expect(featureLayers(CUE_MOD_E03 | CUE_MOD_E01 | CUE_MOD_E05, 0, false, picks)).toBe(2);
    expect(picks.slice(0, 2).map((p) => p.layer)).toEqual(['reserve_pocket', 'starch_notch']);
    expect(featureLayers(CUE_MOD_E01, 0, false, picks)).toBe(1);
    expect(picks[0]).toEqual({ layer: 'starch_notch', frame: 0 });
    const all = CUE_MOD_E01 | CUE_MOD_E03 | CUE_MOD_E05 | (2 << CUE_RESERVE_BAND_SHIFT);
    expect(featureLayers(all, LIFE_RESTING, false, picks)).toBe(2);
    expect(picks.slice(0, 2)).toEqual([
      { layer: 'resting_seam', frame: 1 },
      { layer: 'reserve_pocket', frame: 2 },
    ]);
    expect(featureLayers(all, LIFE_RESTING, true, picks)).toBe(3);
    expect(picks[2]).toEqual({ layer: 'starch_notch', frame: 0 });
    for (const life of [1, 2, 3]) {
      featureLayers(CUE_MOD_E03, life, false, picks);
      expect(picks[0]).toEqual({ layer: 'resting_seam', frame: life - 1 });
    }
  });

  it('the feature-layer atlas is deterministic and every authored frame has pixels in every heading', () => {
    const a = buildLayerAtlas();
    const b = buildLayerAtlas();
    expect(Buffer.from(a.rgba).equals(Buffer.from(b.rgba))).toBe(true);
    const frames = FEATURE_LAYERS.reduce((n, l) => n + l.frames.length, 0);
    expect(Object.keys(a.rects)).toHaveLength(frames * 4);
    expect(FEATURE_LAYERS.find((l) => l.id === 'reserve_pocket')!.frames).toHaveLength(4);
    expect(FEATURE_LAYERS.find((l) => l.id === 'resting_seam')!.frames).toHaveLength(3);
    for (const [key, [x, y, w, h]] of Object.entries(a.rects)) {
      let opaque = 0;
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (a.rgba[(yy * a.width + xx) * 4 + 3]! > 0) opaque++;
      expect(opaque, key).toBeGreaterThan(0);
    }
  });

  it('the inspector lists carried modules with their recorded costs and the resting state with reasons', () => {
    const w = clearWater();
    const s = placeWith(w, 64, ['E03', 'E05']);
    const b = w.ents.cols.birthId[s]!;
    const active = buildInspector(w, { kind: 'entity', birthId: b }).entity!;
    expect(active.modules.map((m) => m.id)).toEqual(['E03', 'E05']);
    const e05 = active.modules.find((m) => m.id === 'E05')!;
    expect(e05.name).toBe('Reserve chamber');
    expect(e05.surchargePerSecond).toBe(0.02);
    expect(e05.params).toEqual({ capacityBonus: 40, upkeepPerSecond: 0.03 });
    expect(active.energyCap).toBe(140);
    expect(active.energyCapBase).toBe(100);
    expect(active.upkeep.resting).toBe(false);
    expect(active.upkeep.surcharge).toBeCloseTo(0.04, 12);
    expect(active.upkeep.chamber).toBeCloseTo(0.03, 12);
    expect(active.upkeep.maintenance).toBeCloseTo(0.5, 12);
    expect(active.lociActiveEffective[7]).toBe(true);
    expect(active.genome.lociActive[7]).toBe(false); // the template alone does not activate it
    expect(active.dormancy!.state).toBe(0);
    expect(active.dormancy!.triggerSeconds).toBeCloseTo(20, 12);
    expect(active.dormancy!.rules.prepareCost).toBe(10);
    run(w, 250);
    const resting = buildInspector(w, { kind: 'entity', birthId: b }).entity!;
    expect(resting.lifeState).toBe(LIFE_RESTING);
    expect(resting.limitCode).toBe(R.RESTING_FOOD_SCARCE);
    expect(resting.dormancy!.cause).toBe(R.RESTING_FOOD_SCARCE);
    expect(resting.dormancy!.wake.food).toBe(false);
    expect(resting.upkeep).toEqual({ resting: true, maintenance: 0.01, surcharge: 0, chamber: 0 });
    expect(resting.modules.find((m) => m.id === 'E03')!.activeNow).toBe(true);
    expect(resting.divisionBlockers).toContain(R.DIV_BLOCK_STATE);
    // Words come from the payload: recorded numbers, state and reasons.
    const e03 = moduleText(resting.modules.find((m) => m.id === 'E03')!);
    expect(e03.costs).toBe('Carrying it costs 0.02 energy/s except while resting; 10 energy to get ready, 0.01 energy/s while resting (instead of all other upkeep), 5 energy to wake.');
    expect(moduleText(e05).does).toContain('room, not energy');
    expect(lifeStateLabel(resting.lifeState)).toBe('Resting');
    expect(upkeepText(resting)).toBe('0.01 energy/s while resting (instead of all other upkeep)');
    expect(upkeepText(active)).toBe('0.5 energy/s + 0.04 for carrying extra abilities + 0.03 reserve chamber upkeep');
    expect(energyCapText(active)).toBe('50 / 140 (100 + 40 room from its reserve chamber)');
    const restLines = dormancyLines(resting.dormancy!, resting.E);
    expect(restLines[0]).toBe('Resting because food stayed scarce.');
    expect(restLines.join(' ')).toContain('Food here: not yet');
    const stop = stopAnswer(resting);
    expect(stop.items.map((i) => i.code)).toContain(R.DIV_BLOCK_STATE);
    expect(stop.items.find((i) => i.code === R.DIV_BLOCK_STATE)!.detail).toBe("Can't split while resting.");
    expect(reasonText(resting.limitCode, 'lab', { value: resting.limitValue })).toMatch(/^Resting because food stayed scarce; wakes after 10 s of food and energy ≥ 5 \(\d+ s so far\)\.$/);
    clean([...restLines, e03.does, e03.costs, upkeepText(resting), upkeepText(active), ...dormancyLines(active.dormancy!, active.E)]);
    // Plain organisms carry no module rows and no dormancy machine.
    const p = placeWith(w, 20, []);
    const plain = buildInspector(w, { kind: 'entity', birthId: w.ents.cols.birthId[p]! }).entity!;
    expect(plain.modules).toEqual([]);
    expect(plain.dormancy).toBeNull();
  });
});
