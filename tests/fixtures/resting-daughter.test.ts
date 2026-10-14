/**
 * Phase 5 wave 10, e3-resters: F04 Sporeveil's resting daughters (SPEC §6.9 step 2, §7.2, §7.4, §7.6;
 * CT §5.3, §12.7; D-0106, D-0108, D-0114, D-0115, D-0117; src/sim/births.ts, src/sim/dormancy.ts).
 *
 * - An F04 division places the new daughter Resting with FLAG.restNewborn: unattached, unlinked (fungal
 *   degree 0, no linkFormed event), classOf 'small', limitCode RESTING_NEWBORN (value 0) from the birth
 *   tick, the post-cost half of every pool, and the birth event's detail `resting: 1` (no rest event). The
 *   retained parent stays Active and Fixed in its own cell.
 * - Placement stays under the parent's Fixed class (D-0114): no edge barrier of any kind, S02 included,
 *   stands between parent and daughter (20 seeds beside an S02 line, 20 beside an S01 line).
 * - On a cell with a surface and detritus she wakes after 10 s (Waking) + 5 s (Active), paying 5 E once;
 *   FLAG.restNewborn clears in the tick she becomes Active and classOf is back to 'fixed', with the 30 s
 *   lockout.
 * - With her surface removed (an S06 mesh taken off her water cell) she never wakes and dies of age with
 *   an honest recorded cause; `attachable` is required on its own (state-machine test with suitability held).
 * - While she rests her habitat factor is her habitat only, without the surface rule (lead ruling on D-0106,
 *   D-0117; crossing.ts entitySuitabilityAt): on plain water she takes no SUIT_HABITAT stress and never wakes.
 * - X02 never attaches to her while she rests and attaches once she is Active.
 * - Round trips at birth, mid-rest, mid-wake and right after waking pass the import and continue
 *   identically; the flag left on an Active organism is refused.
 *
 * Registry: tests/helpers/world.ts resterRegistry() (allowUnimplemented: DORMANCY and RESTING_DAUGHTER are
 * implemented here but listed as implemented by the lead at integration, D-0117). Worlds: GEL_COLONY
 * (gel with a water channel x 59–68), background sugar 0.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { classOf } from '../../src/sim/barriers';
import { stageContacts } from '../../src/sim/contacts';
import { entitySuitabilityAt } from '../../src/sim/crossing';
import { dormancyReason, dormancyStep, wakeConditions } from '../../src/sim/dormancy';
import { FLAG, LIFE_ACTIVE, LIFE_RESTING, LIFE_WAKING } from '../../src/sim/entities';
import { cellIndex, SUB_GEL, SUB_WATER } from '../../src/sim/grid';
import { fungalDegree } from '../../src/sim/links';
import { killEntity } from '../../src/sim/maintenance';
import { dormancySummary } from '../../src/sim/moduleView';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { entityCell, rebuildIndex } from '../../src/sim/spatial';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { dormancyLines } from '../../src/ui/strings/modules';
import { trajectoryDigest } from '../helpers/trajectory';
import { aliveOf, clearWater, paintRect, place, pushDevices, pushEdges, resterRegistry, setField, verticalLine } from '../helpers/world';

const REG = resterRegistry();
const meta = { name: 'resting daughter', savedAt: '2026-10-14T00:00:00Z', recipeId: null };

/** Parent cell (gel) and its four neighbours. */
const PX = 30;
const PY = 64;
const P = cellIndex(PX, PY);
const E_ = cellIndex(PX + 1, PY);

function gelDish(seed?: number): World {
  return clearWater({ habitatId: 'GEL_COLONY', ...(seed === undefined ? {} : { seed }) }, REG);
}

/** An F04 ready to divide (B ≥ 2 B0', E ≥ 60, age past its minimum) at the centre of (x, y). */
function readyF04(w: World, x = PX, y = PY): number {
  return place(w, 'F04', x + 0.5, y + 0.5, { B: 4.2, E: 80, age: 100 });
}

/** Step once; the F04 slots new this tick. */
function stepNew(w: World): number[] {
  const before = new Set(aliveOf(w, 'F04'));
  step(w);
  return aliveOf(w, 'F04').filter((s) => !before.has(s));
}

/** An F04 division whose daughter goes E (detritus there: food ranks first); returns parent and daughter. */
function divided(w = gelDish()): { w: World; p: number; d: number; birthTick: number } {
  setField(w, 'detritus', E_, 0.5);
  const p = readyF04(w);
  const born = stepNew(w);
  expect(born).toHaveLength(1);
  return { w, p, d: born[0]!, birthTick: w.tick - 1 };
}

async function reload(w: World): Promise<World> {
  return (await loadSaveFile((await buildSaveFile(w, meta)).text)).world;
}

/**
 * Save → load, compared with the original `w` itself (stateHash, and the lifeState / flags / timer columns
 * explicitly, so a save that dropped FLAG.restNewborn fails here); then the loaded world and an in-memory
 * copy of `w` both continue `ticks`: equal stateHash and full trajectory digest. `w` is not stepped.
 */
async function roundTrip(w: World, ticks = 60): Promise<void> {
  const back = await reload(w);
  expect(stateHash(back)).toBe(stateHash(w));
  const hw = w.ents.highWater;
  for (const col of ['alive', 'lifeState', 'flags', 'stateTimer', 'dryTimer', 'lockoutTimer', 'limitCode'] as const)
    expect(Array.from(back.ents.cols[col].subarray(0, hw)), col).toEqual(Array.from(w.ents.cols[col].subarray(0, hw)));
  const ref = deserializeWorld(serializeWorld(w));
  expect(stateHash(ref)).toBe(stateHash(w));
  run(ref, ticks);
  run(back, ticks);
  expect(stateHash(back)).toBe(stateHash(ref));
  expect(trajectoryDigest(back, 'full')).toBe(trajectoryDigest(ref, 'full'));
}

describe('F04 division: the new daughter begins Resting (SPEC §6.9 step 2, §7.2, §7.6; D-0106)', () => {
  it('Resting with FLAG.restNewborn, unattached, unlinked, Small, RESTING_NEWBORN, half the post-cost pools; birth detail resting 1', () => {
    const w = gelDish();
    setField(w, 'detritus', E_, 0.5);
    const p = readyF04(w);
    const c = w.ents.cols;
    const prof = profileOf(w, p);
    const pre = { B: c.B[p]!, N: c.N[p]!, E: c.E[p]! };
    const eventsBefore = w.events.ring.length;
    const divisionBefore = w.ledger.energy.division;
    const born = stepNew(w);
    expect(born).toHaveLength(1);
    const d = born[0]!;
    // Placement: the E neighbour (food ranks first), the retained parent stays in its cell.
    expect(entityCell(c.x[d]!, c.y[d]!)).toBe(E_);
    expect(entityCell(c.x[p]!, c.y[p]!)).toBe(P);
    // Her state.
    expect(c.lifeState[d]).toBe(LIFE_RESTING);
    expect(c.flags[d]! & FLAG.restNewborn).toBe(FLAG.restNewborn);
    expect(c.flags[d]! & FLAG.restDry).toBe(0);
    expect(c.flags[d]! & FLAG.attached).toBe(0);
    expect([c.stateTimer[d], c.dryTimer[d], c.lockoutTimer[d]]).toEqual([0, 0, 0]);
    expect(fungalDegree(w, d)).toBe(0);
    expect(fungalDegree(w, p)).toBe(0);
    expect(classOf(w, d)).toBe('small');
    expect(c.limitCode[d]).toBe(R.RESTING_NEWBORN);
    expect(c.limitValue[d]).toBe(0);
    expect(dormancyReason(w, d).code).toBe(R.RESTING_NEWBORN);
    const sum = dormancySummary(w, d)!;
    expect(sum.cause).toBe(R.RESTING_NEWBORN);
    expect(sum.wake.attachable).toBe(true);
    // Pools: the post-cost half, equal to the retained daughter's (no gift, no entry cost).
    const cost = prof.divisionCost;
    expect(c.B[d]).toBe(pre.B / 2);
    expect(c.N[d]).toBe(pre.N / 2);
    expect(c.B[d]).toBe(c.B[p]);
    expect(c.N[d]).toBe(c.N[p]);
    expect(c.E[d]).toBe(c.E[p]);
    expect(w.ledger.energy.division - divisionBefore).toBe(cost);
    expect(c.E[d]!).toBeLessThan((pre.E - cost) / 2); // the tick's maintenance came first; nothing was added
    // The retained parent: Active, Fixed, never flagged.
    expect(c.lifeState[p]).toBe(LIFE_ACTIVE);
    expect(c.flags[p]! & FLAG.restNewborn).toBe(0);
    expect(classOf(w, p)).toBe('fixed');
    // Events: one birth with resting 1 and no link key; no linkFormed, no rest event.
    const evs = w.events.ring.slice(eventsBefore);
    const births = evs.filter((e) => e.type === 'birth');
    expect(births).toHaveLength(1);
    expect(births[0]!.detail).toMatchObject({ daughterB: c.birthId[d], resting: 1 });
    expect(births[0]!.detail).not.toHaveProperty('link');
    expect(evs.filter((e) => e.type === 'linkFormed' || e.type === 'rest')).toHaveLength(0);
  });

  it('an adult F04 entering rest through the ordinary trigger never gets FLAG.restNewborn', () => {
    const w = gelDish();
    const s = place(w, 'F04', 40.5, 40.5, { E: 40 });
    run(w, 250);
    const c = w.ents.cols;
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    expect(c.flags[s]! & FLAG.restNewborn).toBe(0);
    expect(c.limitCode[s]).toBe(R.RESTING_FOOD_SCARCE);
    expect(classOf(w, s)).toBe('fixed');
  });
});

describe('placement stays under the parent Fixed class (D-0106 either party, D-0114)', () => {
  for (const kind of ['S02', 'S01'] as const) {
    it(`20 seeds beside an ${kind} line: never across it, even when the only food lies across`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        // Food across the line: without the edge rule the daughter would go E (food ranks first).
        const w = gelDish(seed);
        pushEdges(w, verticalLine(kind, PX, PY - 3, PY + 3));
        setField(w, 'detritus', E_, 0.5);
        const p = readyF04(w);
        const born = stepNew(w);
        expect(born, `seed ${seed}`).toHaveLength(1);
        const cell = entityCell(w.ents.cols.x[born[0]!]!, w.ents.cols.y[born[0]!]!);
        expect(cell, `seed ${seed}`).not.toBe(E_);
        expect(w.ents.cols.lifeState[born[0]!]).toBe(LIFE_RESTING);
        expect(entityCell(w.ents.cols.x[p]!, w.ents.cols.y[p]!)).toBe(P);

        // The only attachable neighbour lies across the line: no birth, the proposal waits.
        const v = gelDish(seed);
        pushEdges(v, verticalLine(kind, PX, PY - 3, PY + 3));
        paintRect(v, SUB_WATER, PX - 1, PY - 1, PX, PY + 1);
        paintRect(v, SUB_GEL, PX, PY, PX, PY);
        const q = readyF04(v);
        expect(stepNew(v), `seed ${seed}`).toHaveLength(0);
        expect(v.ents.cols.divBlockCode[q]).toBe(R.DIV_BLOCK_PLACEMENT);
      }
    });
  }
});

describe('waking (SPEC §7.6; D-0106 attachability is part of waking; D-0108)', () => {
  it('on a gel cell with detritus: Waking after 10 s, Active after 5 s more; the flag clears in that tick; 5 E paid once', () => {
    const { w, d, birthTick } = divided();
    const c = w.ents.cols;
    let waking = -1;
    let active = -1;
    let dormancyAtWake = -1;
    for (let t = 0; t < 400 && active < 0; t++) {
      const before = w.ledger.energy.dormancy;
      step(w);
      if (waking < 0 && c.lifeState[d] === LIFE_WAKING) {
        waking = w.tick - 1;
        dormancyAtWake = w.ledger.energy.dormancy - before;
      }
      if (c.lifeState[d] === LIFE_RESTING || c.lifeState[d] === LIFE_WAKING) {
        expect(c.flags[d]! & FLAG.restNewborn).toBe(FLAG.restNewborn);
        expect(classOf(w, d)).toBe('small');
        expect(c.limitCode[d]).toBe(c.lifeState[d] === LIFE_RESTING ? R.RESTING_NEWBORN : R.WAKING);
      }
      if (c.lifeState[d] === LIFE_ACTIVE) active = w.tick - 1;
    }
    expect(waking - birthTick).toBe(100); // 10 s of food, moisture, environment and a surface
    expect(active - waking).toBe(50); // 5 s Waking
    expect(dormancyAtWake).toBe(5);
    // Active: the flag is gone in the same tick, the class is Fixed again, the 30 s lockout runs.
    expect(c.flags[d]! & FLAG.restNewborn).toBe(0);
    expect(classOf(w, d)).toBe('fixed');
    expect(c.lockoutTimer[d]).toBe(30);
    expect(dormancyReason(w, d).code).toBe(R.DORMANCY_LOCKOUT);
    expect(dormancySummary(w, d)!.wake.attachable).toBeUndefined();
  });

  it('her surface removed (S06 mesh taken off her water cell): she never wakes, takes no habitat stress, and dies of age with energy left', () => {
    const w = gelDish();
    // Water around the parent; the only attachable neighbour is the E water cell under an S06 mesh.
    paintRect(w, SUB_WATER, PX - 1, PY - 1, PX + 1, PY + 1);
    paintRect(w, SUB_GEL, PX, PY, PX, PY);
    pushDevices(w, [{ kind: 'S06', cell: E_ }]);
    setField(w, 'detritus', E_, 0.5);
    const p = readyF04(w);
    const born = stepNew(w);
    expect(born).toHaveLength(1);
    const d = born[0]!;
    const c = w.ents.cols;
    const birthId = c.birthId[d]!;
    expect(entityCell(c.x[d]!, c.y[d]!)).toBe(E_);
    expect(c.lifeState[d]).toBe(LIFE_RESTING);
    // The mesh goes (the store pushed, geometryVersion bumped as every device writer must).
    w.devices.length = 0;
    w.grid.geometryVersion++;
    killEntity(w, p, R.REMOVED_SAMPLED); // the parent out of the way (its body becomes detritus)
    rebuildIndex(w);
    // Labelled test state: health 20 (from 100). Plain water is her habitat while she rests (lead ruling on
    // D-0106: her habitat factor has no surface rule until she wakes), so no stress ever lowers it.
    c.H[d] = 20;
    let E = c.E[d]!;
    let died = false;
    let t = 0;
    for (; t < 20_000 && !died; t++) {
      step(w);
      if (c.alive[d] !== 1 || c.birthId[d] !== birthId) {
        died = true;
        break;
      }
      expect(c.lifeState[d]).toBe(LIFE_RESTING);
      expect(c.H[d]).toBe(20);
      expect(c.suitability[d]).toBe(1);
      expect(c.E[d]!).toBeLessThanOrEqual(E);
      E = c.E[d]!;
      expect(c.limitCode[d]).toBe(R.RESTING_NEWBORN);
      if (t === 200) expect(wakeConditions(w, d, profileOf(w, d), profileOf(w, d).dormancy!)).toEqual({ food: true, moisture: true, environment: true, attachable: false });
    }
    expect(died).toBe(true);
    const death = w.events.ring.find((e) => e.type === 'death' && e.birthId === birthId);
    expect(death).toBeDefined();
    // F04 maxAge 1800 s from her birth tick; she still had energy (0.01 E/s at rest).
    expect(death!.cause).toBe(R.DEATH_AGE);
    expect(t).toBeGreaterThanOrEqual(17_990);
    expect(t).toBeLessThanOrEqual(18_000);
    expect(E).toBeGreaterThan(0);
  }, 120_000);

  it('attachable is required on its own: suitability held at 1 on a cell without a surface, she stays Resting', () => {
    const { w, p, d } = divided();
    const c = w.ents.cols;
    killEntity(w, p, R.REMOVED_SAMPLED);
    // Move her onto open water with food: no surface for F04 there.
    const cell = cellIndex(64, 64);
    c.x[d] = 64.5;
    c.y[d] = 64.5;
    setField(w, 'detritus', cell, 0.5);
    rebuildIndex(w);
    const prof = profileOf(w, d);
    for (let t = 0; t < 200; t++) {
      c.suitability[d] = 1; // labelled test state: the environment condition held true
      dormancyStep(w, d, prof);
      const wc = wakeConditions(w, d, prof, prof.dormancy!);
      expect(wc).toEqual({ food: true, moisture: true, environment: true, attachable: false });
      expect(c.lifeState[d]).toBe(LIFE_RESTING);
      expect(c.stateTimer[d]).toBe(0);
    }
  });
});

describe('a resting newborn on plain water: her habitat factor has no surface rule until she wakes (lead ruling on D-0106, D-0117)', () => {
  /** A daughter carried onto the open water channel (64, 64) of GEL_COLONY with food, her parent gone. */
  function onWater(): { w: World; d: number; cell: number } {
    const { w, p, d } = divided();
    const c = w.ents.cols;
    killEntity(w, p, R.REMOVED_SAMPLED);
    const cell = cellIndex(64, 64);
    expect(w.grid.substrate[cell]).toBe(SUB_WATER);
    c.x[d] = 64.5;
    c.y[d] = 64.5;
    setField(w, 'detritus', cell, 0.5);
    rebuildIndex(w);
    return { w, d, cell };
  }

  it('over 3,000 ticks she takes no habitat stress (health unchanged) and never wakes there', () => {
    const { w, d } = onWater();
    const c = w.ents.cols;
    const H = c.H[d]!;
    const birthId = c.birthId[d]!;
    for (let t = 0; t < 3000; t++) {
      step(w);
      expect(c.alive[d] === 1 && c.birthId[d] === birthId).toBe(true);
      expect(c.lifeState[d]).toBe(LIFE_RESTING);
      expect(c.suitability[d]).toBe(1);
    }
    expect(c.H[d]).toBe(H);
    expect(c.flags[d]! & FLAG.restNewborn).not.toBe(0);
    expect(wakeConditions(w, d, profileOf(w, d), profileOf(w, d).dormancy!).attachable).toBe(false);
  }, 60_000);

  it("the inspector's suitability reason for her is not SUIT_HABITAT; an adult F04 off any surface still gets SUIT_HABITAT", () => {
    const { w, d, cell } = onWater();
    const sp = w.species[w.ents.cols.species[d]!]!;
    step(w);
    const hers = entitySuitabilityAt(w, d, sp, profileOf(w, d), cell);
    expect(hers.reason).not.toBe(R.SUIT_HABITAT);
    expect(hers.value).toBe(1);
    // Control: an Active adult F04 (no flag) on the same kind of water cell keeps the surface rule.
    const a = place(w, 'F04', 64.5, 70.5, { B: 2, E: 40 });
    expect(w.ents.cols.flags[a]! & FLAG.restNewborn).toBe(0);
    step(w);
    const adult = entitySuitabilityAt(w, a, sp, profileOf(w, a), cellIndex(64, 70));
    expect(adult.reason).toBe(R.SUIT_HABITAT);
    expect(adult.value).toBe(0);
    expect(w.ents.cols.suitability[a]).toBe(0);
  });

  it('a save mid-rest on plain water loads equal and both continue equal', async () => {
    const { w } = onWater();
    run(w, 400);
    const b = await reload(w);
    expect(stateHash(b)).toBe(stateHash(w));
    run(w, 600);
    run(b, 600);
    expect(stateHash(b)).toBe(stateHash(w));
  }, 60_000);
});

describe("the inspector's dormancy sheet names her real cause and her surface (D-0106 honest label; wave-10 verify MAJOR)", () => {
  it('a resting newborn: "Resting since it formed.", never the food-scarce sentence; her wake line and checklist include the surface', () => {
    const { w, d } = divided();
    const c = w.ents.cols;
    const lines = dormancyLines(dormancySummary(w, d)!, c.E[d]!);
    expect(lines[0]).toBe('Resting since it formed.');
    expect(lines[1]).toContain('usable food, wet enough water, suitable conditions and a surface to hold');
    expect(lines[2]).toContain('Surface to hold: yes');
    // Through her whole rest the sheet never claims food stayed scarce.
    for (let t = 0; t < 120 && c.lifeState[d] === LIFE_RESTING; t++) {
      expect(dormancyLines(dormancySummary(w, d)!, c.E[d]!).join('\n')).not.toContain('food stayed scarce');
      step(w);
    }
  });

  it('no surface at her cell: the checklist says so, so three yes never stand beside a clock that does not run', () => {
    const { w, p, d } = divided();
    const c = w.ents.cols;
    killEntity(w, p, R.REMOVED_SAMPLED);
    const cell = cellIndex(64, 64); // open water with food: no surface for F04
    c.x[d] = 64.5;
    c.y[d] = 64.5;
    setField(w, 'detritus', cell, 0.5);
    rebuildIndex(w);
    const prof = profileOf(w, d);
    c.suitability[d] = 1; // labelled test state: the environment condition held true
    dormancyStep(w, d, prof);
    expect(dormancyLines(dormancySummary(w, d)!, c.E[d]!)[2]).toBe('Food here: yes · Wet enough: yes · Conditions suitable: yes · Surface to hold: not yet · held 0 of 10 s.');
  });

  it('an adult resting for food keeps the v1.0 sentences (no surface item)', () => {
    const w = gelDish();
    const s = place(w, 'F04', 40.5, 40.5, { E: 40 });
    run(w, 250);
    const c = w.ents.cols;
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    const lines = dormancyLines(dormancySummary(w, s)!, c.E[s]!);
    expect(lines[0]).toBe('Resting because food stayed scarce.');
    expect(lines[1]).toContain('usable food, wet enough water and suitable conditions, with at least');
    expect(lines.join('\n')).not.toContain('Surface');
  });
});

describe('X02 and a resting daughter (SPEC §7.4: never resting daughters)', () => {
  it('never attaches while she rests; attaches once she is Active', () => {
    const { w, p, d } = divided();
    const c = w.ents.cols;
    killEntity(w, p, R.REMOVED_SAMPLED);
    const x = place(w, 'X02', c.x[d]!, c.y[d]!, { E: 40 });
    let attachedAt = -1;
    for (let t = 0; t < 300 && attachedAt < 0; t++) {
      c.x[x] = c.x[d]!; // labelled test state: the parasite held on her position before each tick
      c.y[x] = c.y[d]!;
      rebuildIndex(w);
      const wasActive = c.lifeState[d] === LIFE_ACTIVE;
      step(w);
      if (c.hostSlot[x] === d) attachedAt = t;
      else if (!wasActive) expect(c.hostSlot[x]).toBe(-1);
      if (c.lifeState[d] !== LIFE_ACTIVE) expect(c.hostSlot[x]).toBe(-1);
    }
    expect(attachedAt).toBeGreaterThan(0);
    expect(c.lifeState[d]).toBe(LIFE_ACTIVE);
    expect(c.parasiteSlot[d]).toBe(x);
    expect(c.flags[d]! & FLAG.restNewborn).toBe(0);
    stageContacts(w); // the pair stays
    expect(c.hostSlot[x]).toBe(d);
  });
});

describe('saves (D-0108: the import refuses state the rules could not have produced)', () => {
  it('round trips at birth, mid-rest, mid-wake and right after waking load and continue identically', async () => {
    const { w, d } = divided();
    const c = w.ents.cols;
    await roundTrip(w); // at birth (the tick she formed)
    run(w, 50);
    expect(c.lifeState[d]).toBe(LIFE_RESTING);
    await roundTrip(w); // mid-rest
    run(w, 70);
    expect(c.lifeState[d]).toBe(LIFE_WAKING);
    expect(c.flags[d]! & FLAG.restNewborn).toBe(FLAG.restNewborn);
    await roundTrip(w); // mid-wake
    while (c.lifeState[d] !== LIFE_ACTIVE) step(w);
    expect(c.flags[d]! & FLAG.restNewborn).toBe(0);
    await roundTrip(w); // right after waking
  });

  it('the flag left on an Active organism (the mutant "not cleared on waking") is refused', async () => {
    const { w, d } = divided();
    const c = w.ents.cols;
    while (c.lifeState[d] !== LIFE_ACTIVE) step(w);
    c.flags[d] = c.flags[d]! | FLAG.restNewborn;
    await expect(buildSaveFile(w, meta).then((f) => loadSaveFile(f.text))).rejects.toThrow(/An active organism is marked as a resting newborn\./);
  });
});
