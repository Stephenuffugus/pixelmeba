/**
 * P5.5 (Phase 5 wave 12, e3-predation): P07 Dartfin as a plain fast predator, and the Phase 5 predators'
 * prey tables (CT §1.3 P07 "3.0 | 5 | 2 s | water | free", §3.2 prey lists, "A05 is prey only for P08";
 * SPEC §7.3; CT §5.3 classes; D-0122).
 *
 * Nothing here is enabled (D-0104): the dishes record the Phase 5 species through test registries with
 * allowUnimplemented, because HANDLING, RADIUS_CAPTURE and DETRITUS_FALLBACK (P10, P06, P09) join
 * IMPLEMENTED_NATIVE_ABILITIES at the wave 12 integration and TRAP (F03) in wave 13.
 */
import { describe, expect, it } from 'vitest';
import { DT } from '../../src/sim/constants';
import { stageContacts } from '../../src/sim/contacts';
import { FLAG } from '../../src/sim/entities';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex } from '../../src/sim/grid';
import { preyAllowed } from '../../src/sim/movement';
import { profileOf } from '../../src/sim/profiles';
import { rebuildIndex } from '../../src/sim/spatial';
import { PREY_ANY, PREY_NONE } from '../../src/sim/species';
import { step } from '../../src/sim/tick';
import { speciesIndex } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, place, pushEdges, registry } from '../helpers/world';

const shipped = registry().manifest;
const REG_P = registryWith(
  {
    enabledSpecies: [...shipped.enabledSpecies, 'A02', 'A03', 'A04', 'P05', 'P06', 'P07', 'P09', 'P10'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'silicate'].sort() as SystemFlag[],
  },
  { allowUnimplemented: true }, // HANDLING, RADIUS_CAPTURE, DETRITUS_FALLBACK: appended by the lead at integration
);

/** Every species record (all 38 ids), with the systems their abilities need. */
const ALL_IDS = [
  'A01', 'A02', 'A03', 'A04', 'A05',
  'B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10', 'B11', 'B12', 'B13',
  'F01', 'F02', 'F03', 'F04',
  'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10',
  'V01', 'V02', 'X01', 'X02', 'Y01', 'Y02',
];
const REG_ALL = registryWith(
  {
    enabledSpecies: ALL_IDS,
    enabledSystems: [...new Set([...shipped.enabledSystems, 'rivalry', 'signals', 'silicate'])].sort() as SystemFlag[],
  },
  { allowUnimplemented: true }, // as above, plus F03's TRAP (wave 13)
);

/** CT §3.2 for the Phase 5 predators, expanded (B03–B12 = B03 … B12), and P10's contact seconds. */
const B03_B12 = ['B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B09', 'B10', 'B11', 'B12'];
const CT_PREY: Record<string, readonly string[]> = {
  P05: ['B01', ...B03_B12],
  P06: ['B01', ...B03_B12],
  P07: ['B01', ...B03_B12],
  P08: ['A01', 'A02', 'A03', 'A04', 'A05', 'F01', 'F02', 'F04'],
  P09: ['A02', 'A03', 'A04', 'Y02'],
  P10: ['P01', 'P02', 'P05', 'P07'],
};

describe('Phase 5 predators (P5.5)', () => {
  it('SpeciesRT.prey and preyContact equal CT §3.2 (P10: 1 / 1 / 4 / 1 s); A05 is prey only for P08', () => {
    const w = clearWater({}, REG_ALL);
    for (const [pred, list] of Object.entries(CT_PREY)) {
      const sp = w.species[speciesIndex(w, pred)]!;
      const listed = w.species.filter((s) => sp.prey[s.idx] !== PREY_NONE).map((s) => s.id);
      expect(listed, pred).toEqual([...list].sort());
      for (const id of list) expect(sp.prey[speciesIndex(w, id)], `${pred} ${id}`).toBe(PREY_ANY);
      const contact = Object.fromEntries(list.map((id) => [id, sp.preyContact[speciesIndex(w, id)]]));
      if (pred === 'P10') expect(contact).toEqual({ P01: 1, P02: 1, P05: 4, P07: 1 });
      else expect(Object.values(contact).every((v) => v === 0), pred).toBe(true);
    }
    const a05 = speciesIndex(w, 'A05');
    expect(w.species.filter((s) => s.prey[a05] !== PREY_NONE).map((s) => s.id)).toEqual(['P08']);
    // P06 and P10 carry their rules; P07 is a plain predator.
    expect(w.species[speciesIndex(w, 'P07')]!.abilities).toEqual(['PREDATION']);
  });

  it('P07: speed 3 (0.3 cells per tick in pursuit), sensing 5, cooldown 2 s, Small class', () => {
    const w = clearWater({}, REG_P);
    const p07 = place(w, 'P07', 60.5, 64.5, { E: 50 });
    const prof = profileOf(w, p07);
    expect(prof.speed).toBe(3);
    expect(prof.sensing).toBe(5);
    expect(w.species[speciesIndex(w, 'P07')]!.def.attackCooldown).toBe(2);
    expect(w.species[speciesIndex(w, 'P07')]!.def.transportClass).toBe('small');

    // Pursuit: a B01 pinned 4 cells east; from the first decision on, 0.3 cells per tick toward it.
    const c = w.ents.cols;
    const prey = place(w, 'B01', 64.5, 64.5);
    c.decisionTimer[p07] = 0;
    const xs: number[] = [c.x[p07]!];
    for (let k = 0; k < 8; k++) {
      step(w, {
        afterStage: (s) => {
          if (s !== 4) return;
          c.x[prey] = 64.5;
          c.y[prey] = 64.5;
          rebuildIndex(w);
        },
      });
      xs.push(c.x[p07]!);
      if (k === 0) expect(c.preySlot[p07]).toBe(prey);
    }
    for (let k = 1; k < xs.length; k++) expect(xs[k]! - xs[k - 1]!).toBeCloseTo(0.3, 12);
    expect(c.y[p07]).toBe(64.5);
  });

  it('P07 senses 5 cells: a B01 4.9 cells away is acquired on a decision tick; one 7 cells away is not', () => {
    for (const [dx, seen] of [[4.9, true], [7, false]] as const) {
      const w = clearWater({}, REG_P);
      const p07 = place(w, 'P07', 60.5, 64.5, { E: 50 });
      const prey = place(w, 'B01', 60.5 + dx, 64.5);
      w.ents.cols.decisionTimer[p07] = 0;
      step(w);
      expect(w.ents.cols.preySlot[p07] === prey).toBe(seen);
    }
  });

  it('P07 waits 2 s between captures', () => {
    const w = clearWater({}, REG_P);
    const c = w.ents.cols;
    const p07 = place(w, 'P07', 64.5, 64.5, { E: 50 });
    place(w, 'B01', 64.8, 64.5);
    stageContacts(w);
    expect(c.attackCooldown[p07]).toBe(2);
    c.mealC[p07] = 0; // keep it hungry: only the cooldown is under test
    c.mealN[p07] = 0;
    const second = place(w, 'B01', 64.6, 64.6);
    let calls = 0;
    while (w.ents.isAlive(second) && calls < 60) {
      stageContacts(w);
      calls++;
      c.attackCooldown[p07] = Math.max(0, c.attackCooldown[p07]! - DT);
    }
    expect(calls).toBe(21);
  });

  it('P07 catches every listed prey whatever its attachment state (requires "any")', () => {
    for (const id of CT_PREY.P07!) {
      const w = clearWater({}, REG_ALL);
      const sp = w.species[speciesIndex(w, 'P07')]!;
      place(w, 'P07', 64.5, 64.5, { E: 50 });
      const prey = place(w, id, 64.8, 64.5);
      w.ents.cols.flags[prey] = w.ents.cols.flags[prey]! | FLAG.attached;
      expect(preyAllowed(w, sp, prey), id).toBe(true);
      const birth = w.ents.cols.birthId[prey]!;
      rebuildIndex(w);
      stageContacts(w);
      expect(w.ents.refValid(prey, birth), id).toBe(false);
    }
  });

  it('P07 (Small) passes an S02 a P01 (Medium) cannot, and captures across it', () => {
    const across = (pred: string): { crossed: boolean; caught: boolean } => {
      const w = clearWater({}, REG_P);
      pushEdges(w, [{ kind: 'S02', cell: cellIndex(64, 64), dir: 'R' }]);
      const p = place(w, pred, 64.5, 64.5, { E: 50 });
      const prey = place(w, 'B01', 65.6, 64.5);
      const birth = w.ents.cols.birthId[prey]!;
      w.ents.cols.decisionTimer[p] = 0;
      let crossed = false;
      for (let k = 0; k < 20 && w.ents.refValid(prey, birth); k++) {
        step(w, {
          afterStage: (s) => {
            if (s !== 4) return;
            if (w.ents.cols.x[p]! >= 65) crossed = true;
            w.ents.cols.x[prey] = 65.6;
            w.ents.cols.y[prey] = 64.5;
            rebuildIndex(w);
          },
        });
        if (w.ents.cols.x[p]! >= 65) crossed = true;
      }
      return { crossed, caught: !w.ents.refValid(prey, birth) };
    };
    expect(across('P07')).toEqual({ crossed: true, caught: true });
    expect(across('P01')).toEqual({ crossed: false, caught: false });
  });
});

