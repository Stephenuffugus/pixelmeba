/**
 * P3.4 host specificity (D01 "Host specificity"; SPEC §7.4, §7.5; CT §3.3; src/sim/parasites.ts,
 * src/sim/viruses.ts):
 * - a dense dish with every species enabled in wave 2 and 5 Pinphage units per cell infects only
 *   Sprinters (B01) over 600 ticks;
 * - a Hitcher in contact with every other species never attaches; it attaches to a Sunbead (control);
 * - with no host, units only decay (1 %/s, diffusion conserves them) and the ledger closes;
 * - fewer than one unit never infects (tests/fixtures/phage.test.ts proves the per-draw rule).
 *
 * The registry enables this wave's species next to the shipped ones through registryWith, with
 * allowUnimplemented for OXYGEN_SUPPRESSED (B03), SEDIMENT_WATER_CROSSING (P04), BIOFILM (B02) and
 * BRANCHING (F01), which other wave 2 builders implement.
 */
import { describe, expect, it } from 'vitest';
import { applyNow } from '../../src/sim/commands';
import { stageContacts } from '../../src/sim/contacts';
import type { ContentRegistry } from '../../src/sim/content/registry';
import type { SystemFlag } from '../../src/sim/fields';
import { maskCells } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { realizeRecipe } from '../../src/sim/recipes';
import { rebuildIndex } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import { markField } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { aliveOf, place, rebaseLedger, registry } from '../helpers/world';

const WAVE2_SPECIES = ['B02', 'B03', 'B05', 'F01', 'P02', 'P03', 'P04', 'V01', 'X01', 'Y01'];
const WAVE2_SYSTEMS: SystemFlag[] = ['film', 'fungi', 'parasites', 'viruses'];

function union<T extends string>(a: readonly T[], b: readonly T[]): T[] {
  return [...a, ...b].filter((x, i, all) => all.indexOf(x) === i).sort();
}

function wave2Registry(): ContentRegistry {
  const m = registry().manifest;
  return registryWith(
    { enabledSpecies: union(m.enabledSpecies, WAVE2_SPECIES), enabledSystems: union(m.enabledSystems, WAVE2_SYSTEMS) },
    { allowUnimplemented: true },
  );
}

/** Clear water (no stones, no sugar) with a sediment band for the sediment and attached species. */
function dish(reg: ContentRegistry): World {
  const base = reg.recipes.FIRST_DISH_V1!;
  const w = realizeRecipe(
    reg,
    { ...base, id: 'TEST_HOSTS', removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0.2 }, mutationPreset: 'fixed' },
    { worldId: 'hosts' },
  );
  applyNow(w, 'sediment', { kind: 'paintSubstrate', substrate: 'sediment', points: [[30, 80], [98, 80]], radius: 4 });
  return w;
}

/** Every enabled organism species (not the field virus), several of each, on a habitat that suits it. */
function populate(w: World, perSpecies: number, exclude: readonly string[] = []): string[] {
  const ids = w.species.map((s) => s.id).filter((id) => id !== 'V01' && !exclude.includes(id));
  ids.forEach((id, k) => {
    const onSediment = ['B02', 'F01', 'P04'].includes(id);
    for (let n = 0; n < perSpecies; n++) {
      const x = 32.5 + ((k * perSpecies + n) % 64);
      // Species that wrap past x = 96 get their own band, so no two species share cells.
      const band = Math.floor((k * perSpecies + n) / 64);
      const y = onSediment ? 79.5 + (n % 3) - 3 * band : 50.5 + (n % 6) + 8 * band;
      place(w, id, x, y);
    }
  });
  return ids;
}

describe('Host specificity (D01; SPEC §7.4, §7.5)', () => {
  it('a dense dish of every enabled species with 5 units per cell infects only Sprinters over 600 ticks', () => {
    const w = dish(wave2Registry());
    const ids = populate(w, 6);
    expect(ids).toEqual(expect.arrayContaining(['A01', 'B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'F01', 'P01', 'P02', 'P03', 'P04', 'X01', 'Y01']));
    for (const cell of maskCells()) w.fields.v01![cell] = 5;
    markField(w, 'v01');
    rebaseLedger(w);
    const infectedBy: Record<string, number> = {};
    const exposed: Record<string, number> = {};
    for (let t = 0; t < 600; t++) {
      step(w, {
        afterStage: (stage, world) => {
          if (stage !== 5) return;
          const c = world.ents.cols;
          for (let i = 0; i < world.ents.highWater; i++) {
            if (c.alive[i] !== 1) continue;
            const id = world.species[c.species[i]!]!.id;
            exposed[id] = (exposed[id] ?? 0) + 1;
            if (c.infectedBy[i] !== 0) infectedBy[id] = (infectedBy[id] ?? 0) + 1;
          }
        },
      });
    }
    expect(Object.keys(infectedBy)).toEqual(['B01']);
    expect(infectedBy.B01).toBeGreaterThan(0);
    // Every other species was present and exposed to units for many host-ticks.
    for (const id of ids) expect(exposed[id] ?? 0, id).toBeGreaterThan(100);
    expect(checkLedger(w).ok).toBe(true);
  }, 300_000);

  it('a Hitcher in contact with every other species never attaches; with a Sunbead it does', () => {
    const w = dish(wave2Registry());
    const c = w.ents.cols;
    const others = w.species.map((s) => s.id).filter((id) => !['V01', 'X01', 'A01'].includes(id));
    const hitchers: number[] = [];
    others.forEach((id, k) => {
      const onSediment = ['B02', 'F01', 'P04'].includes(id);
      const x = 30.5 + k * 5;
      const y = onSediment ? 80.5 : 50.5;
      place(w, id, x, y);
      hitchers.push(place(w, 'X01', x + 0.1, y)); // centres 0.1 cells apart
    });
    rebuildIndex(w);
    for (let t = 0; t < 50; t++) {
      stageContacts(w);
      w.tick++;
    }
    for (const h of hitchers) expect(c.hostSlot[h]).toBe(-1);
    // Full ticks too (pursuit, contact, drain): still nothing to attach to.
    for (let t = 0; t < 300; t++) step(w);
    for (const h of aliveOf(w, 'X01')) expect(c.hostSlot[h]).toBe(-1);
    // Control: a Sunbead in the same dish is taken.
    const sunbead = place(w, 'A01', 60.5, 40.5);
    const x = place(w, 'X01', 60.6, 40.5);
    stageContacts(w);
    expect(c.hostSlot[x]).toBe(sunbead);
  });

  it('with no host, units only decay (1 %/s into detritus) and the ledger closes', () => {
    const w = dish(wave2Registry());
    const ids = populate(w, 3, ['B01']); // every species but the only host
    applyNow(w, 'phage', { kind: 'inoculate', speciesId: 'V01', x: 64, y: 60, radius: 6, count: 20 });
    rebaseLedger(w);
    const sum = () => maskCells().reduce((a, k) => a + w.fields.v01![k]!, 0);
    const U0 = sum();
    expect(U0).toBeGreaterThan(0);
    expect(ids.length).toBeGreaterThan(10);
    for (let t = 0; t < 300; t++) step(w);
    expect(sum() / (U0 * Math.pow(1 - 0.001, 300))).toBeCloseTo(1, 9);
    const c = w.ents.cols;
    for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1) expect(c.infectedBy[i]).toBe(0);
    expect(checkLedger(w).ok).toBe(true);
  });
});
