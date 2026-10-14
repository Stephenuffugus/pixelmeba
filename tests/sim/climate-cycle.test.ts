/**
 * P5.1 climate, the day/night cycle (SPEC §4.4, §4.6; CT §12.2; D-0106, D-0113; src/sim/climate.ts):
 * - cycleFactor's table: day 1, dusk 1 → 0.05 linear, night 0.05, dawn 0.05 → 1 linear, period 2400 ticks;
 * - the phase is (t − cycleStartTick) mod 2400;
 * - stage 2 of tick T computes light for t = T, every tick of a full period;
 * - the light convention outside stage 2 (the last completed stage 2): a reloaded world and a paused
 *   command show exactly the light the running world shows;
 * - leaving the cycle recomputes light once on the fast path (tc.lightVersion reset);
 * - setLightMode's state transitions round-trip through the import, and need 'climate'.
 * Worlds record 'climate' (and 'barriers', 'devices') through registryWith; nothing is enabled (D-0104).
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { cycleFactor, cyclePhaseName, cyclePhaseTick, setLightMode } from '../../src/sim/climate';
import { applyNow } from '../../src/sim/commands';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, preFlipRegistry, registry } from '../helpers/world';

const SYSTEMS = [...registry().manifest.enabledSystems, 'barriers', 'climate', 'devices'].sort() as SystemFlag[];
const REG = registryWith({ enabledSystems: SYSTEMS });
const meta = { name: 'climate cycle', savedAt: '2026-10-13T00:00:00Z', recipeId: null };

/** A clear-water dish that records 'climate', with its light cycling from tick `start`. */
function cycleWorld(start = 0): World {
  const w = clearWater({}, REG);
  w.tick = start;
  expect(setLightMode(w, 'cycle')).toBe(true);
  return w;
}

async function reload(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  return (await loadSaveFile(text)).world;
}

function sameLight(a: World, b: World): number {
  let bad = 0;
  for (const i of maskCells()) if (!Object.is(a.derived.light[i], b.derived.light[i])) bad++;
  return bad;
}

describe('cycleFactor (CT §12.2: 240 s = day 90, dusk 30, night 90, dawn 30)', () => {
  it('follows the table at its corners and midpoints', () => {
    const exact: [number, number][] = [
      [0, 1],
      [899, 1],
      [1200, 0.05],
      [2099, 0.05],
      [2100, 0.05],
    ];
    for (const [p, f] of exact) expect(cycleFactor(p), `p ${p}`).toBe(f);
    expect(cycleFactor(900)).toBe(1); // dusk starts at full light
    expect(cycleFactor(1050)).toBeCloseTo(0.525, 15);
    expect(cycleFactor(1199)).toBeCloseTo(1 - (0.95 * 299) / 300, 15);
    expect(cycleFactor(1199)).toBeGreaterThan(0.05);
    expect(cycleFactor(2250)).toBeCloseTo(0.525, 15);
    expect(cycleFactor(2399)).toBeCloseTo(0.05 + (0.95 * 299) / 300, 15);
    expect(cycleFactor(2399)).toBeLessThan(1);
    expect(['day', 'dusk', 'night', 'dawn'].map((_, k) => cyclePhaseName([0, 900, 1200, 2100][k]!))).toEqual(['day', 'dusk', 'night', 'dawn']);
    expect(cyclePhaseName(899)).toBe('day');
    expect(cyclePhaseName(2399)).toBe('dawn');
  });

  it('wraps at the period, and cycleStartTick offsets the phase', () => {
    const w = cycleWorld(0);
    expect(cyclePhaseTick(w, 2400)).toBe(0);
    expect(cycleFactor(cyclePhaseTick(w, 2400))).toBe(1);
    expect(cyclePhaseTick(w, 4999)).toBe(199);
    const v = cycleWorld(100);
    expect(v.settings.cycleStartTick).toBe(100);
    expect(cyclePhaseTick(v, 100)).toBe(0);
    expect(cyclePhaseTick(v, 1000)).toBe(900);
    expect(cyclePhaseTick(v, 99)).toBe(2399);
  });
});

describe('derived light during stage 2', () => {
  it('equals lightBase × cycleFactor(phase T) at stage 2 of tick T, every tick of one full period', () => {
    const w = cycleWorld(0);
    const cells = maskCells();
    const probe = cellIndex(64, 64);
    let bad = 0;
    let prev = -1;
    let changes = 0;
    run(w, 2400, {
      afterStage: (stage, world) => {
        if (stage !== 2) return;
        const t = world.tick;
        const f = cycleFactor(cyclePhaseTick(world, t));
        for (let k = 0; k < cells.length; k += 7) {
          const i = cells[k]!;
          if (!Object.is(world.derived.light[i], world.grid.lightBase[i]! * f)) bad++;
        }
        const v = world.derived.light[probe]!;
        const p = cyclePhaseTick(world, t);
        const moving = (p > 900 && p < 1200) || p > 2100 || p === 1200 || p === 0;
        if (prev >= 0) {
          if (moving) {
            if (v !== prev) changes++;
          } else if (v !== prev) bad++; // constant over day and night
        }
        prev = v;
      },
    });
    expect(bad).toBe(0);
    // Every dusk tick (901…1200) and every dawn tick (2101…2399, then 0) changes the light.
    expect(changes).toBe(300 + 299);
    expect(w.grid.lightBase[probe]).toBeGreaterThan(0);
  });
});

describe('the light convention outside stage 2 (the last completed stage 2; D-0113)', () => {
  it('a reloaded world and a paused command show exactly the running world\'s light at day, dusk, night and dawn', async () => {
    const w = cycleWorld(0);
    let done = 0;
    for (const k of [1, 950, 1100, 2200]) {
      run(w, k - done);
      done = k;
      const back = await reload(w);
      expect(stateHash(back)).toBe(stateHash(w));
      expect(sameLight(back, w), `tick ${w.tick}`).toBe(0);
      // A harmless paused command (debris on one cell) recomputes derived state at the same light tick.
      applyNow(back, `deposit-${k}`, { kind: 'deposit', materialId: 'DEBRIS', points: [[20.5, 64.5]], radius: 1, dose: 0.01 });
      expect(sameLight(back, w), `paused at tick ${w.tick}`).toBe(0);
    }
    // The light at the last checkpoint is the dawn value, not full light: the test is not vacuous.
    const c = cellIndex(64, 64);
    expect(w.derived.light[c]).toBe(w.grid.lightBase[c]! * cycleFactor(2199));
    expect(w.derived.light[c]).toBeLessThan(w.grid.lightBase[c]!);
  });

  it('leaving the cycle at night recomputes light once on the fast path (clamp(lightBase × shade))', () => {
    const w = clearWater({}, REG);
    // Shade on some cells so the fixed light is not uniform.
    for (let x = 30; x < 40; x++) w.grid.shade[cellIndex(x, 64)] = 0.1;
    w.grid.geometryVersion++;
    // The fast path caches this geometry's light first, and nothing bumps geometryVersion afterwards, so
    // only the per-tick recompute's tc.lightVersion reset can make leaving the cycle recompute (wave 9
    // reverify: with the bump after the cache, the reset's removal went unnoticed).
    run(w, 2);
    const gv = w.grid.geometryVersion;
    expect(setLightMode(w, 'cycle')).toBe(true);
    run(w, 1500);
    const c = cellIndex(64, 64);
    expect(w.derived.light[c]).toBe(w.grid.lightBase[c]! * 0.05);
    expect(setLightMode(w, 'fixed')).toBe(true);
    run(w, 1);
    expect(w.grid.geometryVersion).toBe(gv);
    let bad = 0;
    for (const i of maskCells()) {
      const l = w.grid.lightBase[i]! * w.grid.shade[i]!;
      if (!Object.is(w.derived.light[i], l < 0 ? 0 : l > 1 ? 1 : l)) bad++;
    }
    expect(bad).toBe(0);
  });
});

describe('setLightMode (the state transition wave 10\'s command calls)', () => {
  it("'cycle' records cycleStartTick = tick and survives buildSaveFile → loadSaveFile", async () => {
    const w = clearWater({}, REG);
    run(w, 7);
    expect(w.settings.lightMode).toBe('fixed');
    expect(setLightMode(w, 'cycle')).toBe(true);
    expect(w.settings).toMatchObject({ lightMode: 'cycle', cycleStartTick: 7 });
    // Choosing Cycle again keeps the running cycle (no jump in the light).
    run(w, 5);
    expect(setLightMode(w, 'cycle')).toBe(true);
    expect(w.settings.cycleStartTick).toBe(7);
    const back = await reload(w);
    expect(back.settings.cycleStartTick).toBe(7);
    expect(stateHash(back)).toBe(stateHash(w));
    run(w, 30);
    run(back, 30);
    expect(stateHash(back)).toBe(stateHash(w));
  });

  it("'fixed' deletes cycleStartTick and the import accepts the file", async () => {
    const w = cycleWorld(0);
    run(w, 20);
    expect(setLightMode(w, 'fixed')).toBe(true);
    expect(w.settings.lightMode).toBe('fixed');
    expect('cycleStartTick' in w.settings).toBe(false);
    const back = await reload(w);
    expect('cycleStartTick' in back.settings).toBe(false);
    expect(stateHash(back)).toBe(stateHash(w));
  });

  it('is refused without the climate system, and changes nothing', () => {
    const w = clearWater({}, preFlipRegistry());
    const h = stateHash(w);
    expect(setLightMode(w, 'cycle')).toBe(false);
    expect(w.settings.lightMode).toBe('fixed');
    expect('cycleStartTick' in w.settings).toBe(false);
    expect(stateHash(w)).toBe(h);
  });
});
