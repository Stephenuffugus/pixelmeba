/**
 * Wave 13 org-ui: the Phase 5 inspector lines' words (UX §5.1-§5.2; SPEC §12.1-§12.2; D-0120 carry-overs,
 * D-0123 MINOR 2, D-0124). Each line in Explore wording (plain) and Lab wording (with the measured value) from
 * the one inspector field that states it; "Can't split while caught in a trap."; the secretion words by what the
 * organism emits; RIVAL_EXPOSURE worded by its source (no B13 needed); one field name per field across the cell
 * inspector, the region reading and the gate sheet; a Photo-mode A04 is never "Eating"; no forbidden word.
 * The base payload is a real worker answer (a B01 under the shipped registry); each case adds one field.
 */
import { describe, expect, it } from 'vitest';
import { R, reasonName } from '../../src/sim/reasons';
import type { EntityInspect } from '../../src/worker/protocol';
import { buildInspector } from '../../src/worker/snapshot';
import { organismLines } from '../../src/ui/inspector/OrganismLines';
import { CELL_FIELD_NAMES } from '../../src/ui/panels/Inspector';
import { tallyFieldName } from '../../src/ui/panels/GateSheet';
import { poolLabel } from '../../src/ui/observe';
import { FIELD_NAMES } from '../../src/ui/strings/fields';
import { overlayCopy, OVERLAYS } from '../../src/ui/strings/lab';
import { actionLabel } from '../../src/ui/strings/modules';
import { cellRivalText, secretionLines } from '../../src/ui/strings/organisms';
import { reasonText } from '../../src/ui/strings/reasons';
import { constraintWords, dietAnswer, leadConstraint, stopAnswer } from '../../src/ui/strings/shortcuts';
import { rebuildIndex } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import { registryWith } from '../helpers/registry';
import { clearWater, place, registry } from '../helpers/world';

const NAMES = ['Sprinter', 'Siltworm', 'Traplace', 'Needlejaw', 'Turnleaf', 'Lantern', 'Rampart'];
const [SPRINTER, SILTWORM, TRAPLACE, NEEDLEJAW] = [0, 1, 2, 3];

function base(): EntityInspect {
  const w = clearWater();
  const s = place(w, 'B01', 64.5, 64.5);
  return buildInspector(w, { kind: 'entity', birthId: w.ents.cols.birthId[s]! }).entity!;
}
const B = base();
const lines = (extra: Partial<EntityInspect>, view: 'explore' | 'lab') => organismLines({ ...B, ...extra }, view, NAMES).map((l) => l.text);

describe('a v1.0 organism has no Phase 5 line', () => {
  it('organismLines is empty for the real B01 payload in both views', () => {
    expect(organismLines(B, 'explore', NAMES)).toEqual([]);
    expect(organismLines(B, 'lab', NAMES)).toEqual([]);
  });
});

describe('the trap (F03) and a held organism', () => {
  const trap = (t: Partial<NonNullable<EntityInspect['trap']>>): Partial<EntityInspect> => ({
    trap: { state: 'armed', reserveC: 0.2, reserveN: 0.02, target: null, heldSeconds: 0, holdSeconds: 8, cooldownLeft: 0, ...t },
  });
  it('armed: "Trap set." (Lab adds the store)', () => {
    expect(lines(trap({}), 'explore')).toEqual(['Trap set.']);
    expect(lines(trap({}), 'lab')).toEqual(['Trap set.', 'Trap store 0.20 C, 0.02 N.']);
  });
  it('holding: "Holding a Siltworm." / "Holding a Siltworm: 3.2 of 8 s."', () => {
    const t = trap({ state: 'holding', target: { birthId: 9, speciesIdx: SILTWORM }, heldSeconds: 3.2000000000000006 });
    expect(lines(t, 'explore')).toEqual(['Holding a Siltworm.']);
    expect(lines(t, 'lab')[0]).toBe('Holding a Siltworm: 3.2 of 8 s.');
  });
  it('cooldown: "Trap resetting." / "Trap resetting: 12 s left." (a running countdown never reads 0 s early)', () => {
    expect(lines(trap({ state: 'cooldown', cooldownLeft: 11.3 }), 'explore')).toEqual(['Trap resetting.']);
    expect(lines(trap({ state: 'cooldown', cooldownLeft: 11.3 }), 'lab')[0]).toBe('Trap resetting: 12 s left.');
  });
  it('none: no trap built yet (Lab names the rule\'s numbers)', () => {
    expect(lines(trap({ state: 'none', reserveC: 0, reserveN: 0 }), 'explore')).toEqual(['No trap built yet.']);
    expect(lines(trap({ state: 'none', reserveC: 0, reserveN: 0 }), 'lab')).toEqual(['No trap built yet: it builds one with at least 50 energy and a body of 1.3 times its starting size.']);
  });
  const held: Partial<EntityInspect> = { heldBy: { ownerBirthId: 12, ownerSpeciesIdx: TRAPLACE, heldSeconds: 3.2, holdSeconds: 8, drained: 0.03 } };
  it('held: HELD_IN_TRAP "Caught in a trap." / "Held by Traplace #12: 3.2 of 8 s; drained 0.030 C in the last second."', () => {
    expect(lines(held, 'explore')).toEqual(['Caught in a trap.']);
    expect(lines(held, 'lab')).toEqual(['Held by Traplace #12: 3.2 of 8 s; drained 0.030 C in the last second.']);
  });
  it('the lead constraint, the action chip and the division blocker ("Can\'t split while caught in a trap.")', () => {
    const e = { ...B, ...held, divisionBlockers: [R.DIV_BLOCK_STATE], B: 2 * B.B0 };
    expect(leadConstraint(e)).toEqual({ code: R.HELD_IN_TRAP, value: 3.2 });
    expect(constraintWords(e, R.HELD_IN_TRAP, 3.2, NAMES)).toEqual({
      text: 'Caught in a trap.',
      detail: 'Held by Traplace #12: 3.2 of 8 s; drained 0.030 C in the last second.',
    });
    expect(actionLabel(e)).toBe('Caught in a trap');
    const stop = stopAnswer(e, NAMES);
    expect(stop.items.map((i) => i.code)).toEqual([R.HELD_IN_TRAP, R.DIV_BLOCK_STATE]);
    expect(stop.items[1]!.detail).toBe("Can't split while caught in a trap.");
    // Not held: the old wording.
    expect(stopAnswer({ ...B, divisionBlockers: [R.DIV_BLOCK_STATE], lifeState: 2 }).items[0]!.detail).toBe("Can't split while resting.");
  });
});

describe('handling (both ends)', () => {
  it('the handler: "Holding on to its prey." / "Holding on: 0.6 of 1.0 s of contact (resets if contact breaks)."', () => {
    const h: Partial<EntityInspect> = { handling: { preyBirthId: 4, preySpeciesIdx: SPRINTER, progress: 0.6000000000000001, need: 1 } };
    expect(lines(h, 'explore')).toEqual(['Holding on to its prey.']);
    expect(lines(h, 'lab')).toEqual(['Holding on: 0.6 of 1.0 s of contact (resets if contact breaks).']);
    const e = { ...B, ...h, limitCode: R.PRED_HANDLING_IN_PROGRESS, limitValue: 0 };
    expect(constraintWords(e, R.PRED_HANDLING_IN_PROGRESS, 0).detail).toBe('Holding on: 0.6 of 1.0 s of contact (resets if contact breaks).');
    expect(actionLabel(e)).toBe('Holding on to its prey');
  });
  it('"What\'s holding it back" names a handler\'s attempt once, with its measured progress (fix 1: no "? of ? s", no repeated code)', () => {
    const h: Partial<EntityInspect> = { handling: { preyBirthId: 4, preySpeciesIdx: SPRINTER, progress: 0.6000000000000001, need: 1 } };
    const e = { ...B, ...h, limitCode: R.PRED_HANDLING_IN_PROGRESS, limitValue: 0, predation: { code: R.PRED_HANDLING_IN_PROGRESS, targetBirthId: 4, cooldown: 0 } };
    const stop = stopAnswer(e, NAMES);
    const codes = stop.items.map((i) => i.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(stop.items.filter((i) => i.code === R.PRED_HANDLING_IN_PROGRESS)).toEqual([
      { code: R.PRED_HANDLING_IN_PROGRESS, text: 'Holding on to its prey.', detail: 'Holding on: 0.6 of 1.0 s of contact (resets if contact breaks).' },
    ]);
    // The hunting item alone (limitCode elsewhere) is measured too.
    const only = stopAnswer({ ...e, limitCode: R.NONE }, NAMES).items.find((i) => i.code === R.PRED_HANDLING_IN_PROGRESS)!;
    expect(only.detail).toBe('Holding on: 0.6 of 1.0 s of contact (resets if contact breaks).');
    // Without its handling field the words never print an unmeasured "?".
    expect(reasonText(R.PRED_HANDLING_IN_PROGRESS, 'lab')).toBe('Holding on to its prey (resets if contact breaks).');
    expect(reasonText(R.CAPTURED_HANDLING, 'lab')).toBe('Being caught (resets if contact breaks).');
  });
  it('a real P10 mid-attempt (stepped in contact with a P01): every stop item is measured and listed once', () => {
    const reg = registryWith({ enabledSpecies: [...registry().manifest.enabledSpecies, 'P10'].sort() }, { allowUnimplemented: true });
    const w = clearWater({}, reg);
    const p10 = place(w, 'P10', 64.5, 64.5, { E: 50 });
    const prey = place(w, 'P01', 64.8, 64.5);
    const pin = (st: number) => {
      if (st !== 4) return;
      w.ents.cols.x[p10] = 64.5;
      w.ents.cols.x[prey] = 64.8;
      w.ents.cols.y[p10] = 64.5;
      w.ents.cols.y[prey] = 64.5;
      rebuildIndex(w);
    };
    for (let k = 0; k < 4; k++) step(w, { afterStage: pin });
    const names = w.species.map((sp) => sp.def.name ?? sp.id);
    const e = buildInspector(w, { kind: 'entity', birthId: w.ents.cols.birthId[p10]! }).entity!;
    expect(e.handling).toBeDefined();
    expect(e.predation!.code).toBe(R.PRED_HANDLING_IN_PROGRESS);
    const stop = stopAnswer(e, names);
    const codes = stop.items.map((i) => i.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const it of stop.items) expect(it.detail, reasonName(it.code)).not.toContain('?');
    const item = stop.items.find((i) => i.code === R.PRED_HANDLING_IN_PROGRESS)!;
    expect(item.detail).toBe(`Holding on: ${e.handling!.progress.toFixed(1)} of ${e.handling!.need.toFixed(1)} s of contact (resets if contact breaks).`);
  });
  it('its prey: CAPTURED_HANDLING "Being caught." / with the handler and its progress in Lab', () => {
    const v: Partial<EntityInspect> = { beingHandled: [{ predatorBirthId: 7, predatorSpeciesIdx: NEEDLEJAW, progress: 1.5, need: 2.5 }] };
    expect(lines(v, 'explore')).toEqual(['Being caught.']);
    expect(lines(v, 'lab')).toEqual(['Being caught by Needlejaw #7: 1.5 of 2.5 s of contact (resets if contact breaks).']);
    expect(leadConstraint({ ...B, ...v })).toEqual({ code: R.CAPTURED_HANDLING, value: 1.5 });
  });
});

describe('mode (A04), jacket (E11), signal (glowers)', () => {
  it('Photo / Sugar / not chosen, with the light in Lab', () => {
    expect(lines({ mode: { mode: 1, light: 0.42 } }, 'explore')).toEqual(['Making food from light.']);
    expect(lines({ mode: { mode: 1, light: 0.42 } }, 'lab')).toEqual(['Making food from light (light 0.42). It turns to sugar at light 0.25 or less.']);
    expect(lines({ mode: { mode: 2, light: 0.18 } }, 'explore')).toEqual(['Eating sugar in the dark.']);
    expect(lines({ mode: { mode: 2, light: 0.18 } }, 'lab')).toEqual(['Eating sugar while the light is low (light 0.18). It makes food from light again at light 0.35 or more.']);
    expect(lines({ mode: { mode: 0, light: 0.42 } }, 'explore')).toEqual(['Chooses its feeding mode at its first step.']);
    // The recorded MODE_* reason (limitValue = light) in Lab.
    expect(reasonText(R.MODE_PHOTO, 'lab', { value: 0.42 })).toBe('Making food from light (light 0.42).');
  });
  it('a Photo-mode A04 that is feeding is "Making food", never "Eating" (D-0123 MINOR 2); Sugar mode eats', () => {
    const FEEDING = 1 << 2;
    const USABLE = 1 << 11;
    const a04 = { ...B, flags: FEEDING | USABLE, diet: { ...B.diet, metabolism: 'mixotroph' }, profile: { ...B.profile, foods: ['sugar'] } };
    expect(actionLabel({ ...a04, mode: { mode: 1, light: 0.5 } })).toBe('Making food');
    expect(actionLabel({ ...a04, mode: { mode: 2, light: 0.1 } })).toBe('Eating');
  });
  it('the jacket: "Mineral jacket 50 % built." / "Mineral jacket 50 % (0.20 of 0.40); moves at 0.90 speed."', () => {
    const j: Partial<EntityInspect> = { jacket: { mineral: 0.2, target: 0.4, coverage: 0.5, speedFactor: 0.9 } };
    expect(lines(j, 'explore')).toEqual(['Mineral jacket 50 % built.']);
    expect(lines(j, 'lab')).toEqual(['Mineral jacket 50 % (0.20 of 0.40); moves at 0.90 speed.']);
    expect(lines({ jacket: { mineral: 0, target: 0.4, coverage: 0, speedFactor: 1 } }, 'explore')).toEqual(['No mineral jacket built yet.']);
  });
  it('NEIGHBORS_DETECTED: "It senses neighbors." / "Signal 0.34 (threshold 0.30)."; the glow state', () => {
    const sig = (sensed: number, glowing: boolean): Partial<EntityInspect> => ({ signal: { sensed, onThreshold: 0.3, offThreshold: 0.15, dwellSeconds: 5, glowing } });
    expect(lines(sig(0.34, true), 'explore')).toEqual(['It senses neighbors.', 'Glowing.']);
    expect(lines(sig(0.34, true), 'lab')).toEqual(['Signal 0.34 (threshold 0.30).', 'Glowing: it stops after 5 s at 0.15 or less.']);
    expect(lines(sig(0.12, false), 'explore')).toEqual(['Little signal from neighbors here.', 'Not glowing.']);
    expect(lines(sig(0.12, false), 'lab')).toEqual(['Signal 0.12 (threshold 0.30).', 'Not glowing: it starts after 5 s at 0.30 or more.']);
  });
});

describe('secretion words by what the organism emits (D-0120 carry-over)', () => {
  const sec = (code: number, bits: number, refusalOf: 'enzyme' | 'signal' | 'rival') => secretionLines({ code, bits, refusalOf }, 0);
  it('released: enzyme / glow signal / rivalry chemical, each named', () => {
    expect(sec(R.SECRETING, 16, 'signal')).toEqual(['Making glow signal.']);
    expect(sec(R.SECRETING, 8, 'rival')).toEqual(['Releasing rivalry chemical.']);
    expect(sec(R.SECRETING, 1 | 16, 'signal')).toEqual(['Making enzyme.', 'Making glow signal.']);
  });
  it('refused: in the words of the emitter that recorded it', () => {
    expect(sec(R.SECRETION_ENERGY_LOW, 0, 'signal')).toEqual(['Too tired to make glow signal.']);
    expect(sec(R.SECRETION_SATURATED, 0, 'signal')).toEqual(['Enough glow signal here already.']);
    expect(sec(R.SECRETION_ENERGY_LOW, 0, 'rival')).toEqual(['Too tired to release rivalry chemical.']);
    expect(sec(R.SECRETION_SATURATED, 0, 'rival')).toEqual(['Enough rivalry chemical here already.']);
    expect(sec(R.NONE, 0, 'rival')).toEqual(['No rival nearby.']);
    expect(sec(R.SECRETION_NO_SUBSTRATE, 0, 'enzyme')).toEqual(['No starch nearby to work on.']);
    // Never "enzyme" for a signal emitter.
    for (const code of [R.SECRETING, R.SECRETION_ENERGY_LOW, R.SECRETION_SATURATED]) for (const t of sec(code, code === R.SECRETING ? 16 : 0, 'signal')) expect(t).not.toMatch(/enzyme/);
  });
  it('nothing while not Active (secretionCode keeps an old value then)', () => {
    expect(secretionLines({ code: R.SECRETING, bits: 0, refusalOf: 'signal' }, 2)).toEqual([]);
  });
});

describe('RIVAL_EXPOSURE by its source, without a B13', () => {
  it('"Rivalry chemical here is hurting it." (never "A rival colony"); Lab names the amount and the exposure', () => {
    const r: Partial<EntityInspect> = { rival: { amount: 0.4, exposure: 0.1, totalExposure: 0.1, growthFactor: 1 / 1.1, damagePerSecond: 0.8 } };
    expect(lines(r, 'explore')).toEqual(['Rivalry chemical here is hurting it.']);
    expect(lines(r, 'lab')).toEqual(['Rivalry chemical 0.40 here adds 0.10 to its exposure. In all: growth × 0.91, −0.80 health/s.']);
    expect(reasonText(R.RIVAL_EXPOSURE, 'explore')).not.toMatch(/colony/);
  });
  it('the cell line names the kinds it acts on from the dish (an M08 dish holding no B13 included)', () => {
    expect(cellRivalText({ amount: 0.4, exposure: 0.1, targets: ['B01', 'B10'] }, ['B01', 'B10', 'P01'], ['Sprinter', 'Brinecoil', 'Amoeba'])).toBe(
      '0.40 here: exposure 0.10 for Sprinters and Brinecoils. Other organisms are not affected.',
    );
    expect(cellRivalText({ amount: 0.4, exposure: 0.1, targets: [] }, ['P01'], ['Amoeba'])).toBe('0.40 here; no organism in this dish is affected by it.');
  });
});

describe('sugar sources: a mixotroph releases sugar in light', () => {
  it('"Turnleafs in light" in What does it eat?', () => {
    const e = { ...B, profile: { ...B.profile, foods: ['sugar'] }, diet: { ...B.diet, sugarSources: { makers: [0, 4], enzyme: [], inLight: [4] } } };
    const ans = dietAnswer(e, ['Sunbead', 'x', 'y', 'z', 'Turnleaf']);
    expect(ans.lines.some((l) => /Sunbeads \(they release sugar as they make food\) and Turnleafs in light/.test(l))).toBe(true);
  });
});

describe('one name per field across screens', () => {
  it('rival, sGlow and quencher: the cell inspector, the region reading and the gate sheet use the field\'s own name', () => {
    for (const id of ['rival', 'sGlow', 'quencher'] as const) {
      const name = FIELD_NAMES[id];
      expect(CELL_FIELD_NAMES[id]).toBe(name);
      expect(poolLabel(id)).toBe(name);
      expect(tallyFieldName(id)).toBe(name.toLowerCase());
      // The overlay picker offers none of them today; any entry it gains must use the same name.
      const offered = OVERLAYS.find((o) => o.id === id);
      if (offered) expect(offered.copy.name).toBe(name);
      else expect(overlayCopy(id).name).toBe(id);
    }
    expect(Object.values(FIELD_NAMES)).toEqual(['Rivalry chemical', 'Glow signal', 'Quencher']);
    // Never a material's product name for the field.
    for (const v of [poolLabel('rival'), CELL_FIELD_NAMES.rival, poolLabel('sGlow')]) expect(v).not.toMatch(/extract|Lantern/);
  });
});

describe('honest labels', () => {
  it('no forbidden word in any Phase 5 line', () => {
    const all: string[] = [];
    const extras: Partial<EntityInspect>[] = [
      { trap: { state: 'holding', reserveC: 0.2, reserveN: 0.02, target: { birthId: 1, speciesIdx: 1 }, heldSeconds: 1, holdSeconds: 8, cooldownLeft: 0 } },
      { heldBy: { ownerBirthId: 1, ownerSpeciesIdx: 2, heldSeconds: 1, holdSeconds: 8, drained: 0.01 } },
      { handling: { preyBirthId: 1, preySpeciesIdx: 0, progress: 0.5, need: 1 } },
      { beingHandled: [{ predatorBirthId: 1, predatorSpeciesIdx: 3, progress: 0.5, need: 1 }] },
      { mode: { mode: 1, light: 0.5 } },
      { jacket: { mineral: 0.4, target: 0.4, coverage: 1, speedFactor: 0.8 } },
      { jacket: { mineral: 0.4, target: 0, coverage: 1, speedFactor: 1 } },
      { signal: { sensed: 0.5, onThreshold: 0.3, offThreshold: 0.15, dwellSeconds: 5, glowing: true } },
      { rival: { amount: 1, exposure: 0.25, totalExposure: 0.25, growthFactor: 0.8, damagePerSecond: 2 } },
    ];
    for (const x of extras) for (const v of ['explore', 'lab'] as const) all.push(...lines(x, v));
    expect(all.length).toBeGreaterThan(15);
    for (const s of all) expect(s, s).not.toMatch(/protected|protection|immune|armou?red|forever|superior|advanced|perfect|adapted/i);
  });
});
