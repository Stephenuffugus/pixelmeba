/**
 * P5.6 measurement grammar (wave 15, D-0131; g5-briefs E1; CT §10.3): every Phase 5 measure id parses, every
 * bad id is refused with its message, and each measure read on a small constructed world under the SHIPPED
 * registry equals a direct count of the state, the event ring, the gate tally or the ledgers it names.
 * Observation-only is proved in observer-neutral-p5.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { entitySuitabilityAt } from '../../src/sim/crossing';
import { LIFE_ACTIVE, LIFE_RESTING } from '../../src/sim/entities';
import { regionCells, regionContains } from '../../src/sim/content/habitatRules';
import { WORLD_GATES } from '../../src/sim/objectives';
import {
  ArmObserver,
  catalogIds,
  EVENT_MEASURE_TYPES,
  isSuitabilityReason,
  measureArm,
  MeasureError,
  P5_MEASURE_HEADS,
  parseMeasure,
  SCALAR_MEASURES,
  SPECIES_MEASURES,
  GROUP_MEASURES,
  stepObserved,
} from '../../src/sim/pairedRun';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { entityCell } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { clearWater, fillField, place, rebaseLedger, registry } from '../helpers/world';
import { habitatRegistry, habitatStart } from '../helpers/habitats';

const runObserved = (w: World, obs: ArmObserver, ticks: number) => {
  for (let k = 0; k < ticks; k++) stepObserved(w, obs);
};

describe('P5.6 measure ids', () => {
  it('every new id parses', () => {
    const ids = [
      'resting.B12',
      'glowing.B09',
      'glowingStart.B09',
      'attached.X01',
      ...EVENT_MEASURE_TYPES.map((t) => `events.${t}.B09`),
      'firstCaptureAt.P01',
      'intakePhoto.A04',
      'intakeSugar.A04',
      'infections.B02.V02',
      'wholeUnitCells.B02.V02',
      'secretingSeconds.B13',
      'gateTransfer.S03.salt',
      'gateCrossings.S01',
      'alive.B01@FRESH_POOL',
      'resting.F04@ROOF',
      'biomass.B10@BRINE_POOL',
      'mean.salt@FRESH_POOL',
      'moisture@OPEN_GEL',
      'limitSeconds.B01.RIVAL_EXPOSURE',
    ];
    for (const id of ids) expect(typeof parseMeasure(id), id).toBe('object');
    // The heads p5-polish words (item 0): every new head appears in an id above.
    for (const head of P5_MEASURE_HEADS) expect(ids.some((id) => id.split(/[.@]/)[0] === head), head).toBe(true);
  });

  it('bad ids are refused with their message', () => {
    expect(parseMeasure('events.jump.B09')).toMatch(/"jump" is not a counted event type/);
    expect(parseMeasure('events.glowOn')).toMatch(/needs an event type and a species/);
    expect(parseMeasure('gateTransfer.S05.salt')).toBe('"S05" is not an edge structure (S01, S02, S03 or S04)');
    expect(parseMeasure('gateCrossings.WALL')).toBe('"WALL" is not an edge structure (S01, S02, S03 or S04)');
    expect(parseMeasure('gateTransfer.S01.gold')).toBe('unknown field "gold"');
    expect(parseMeasure('infections.B01.B02')).toBe('"B02" is not a virus');
    expect(parseMeasure('wholeUnitCells.B01.X01')).toBe('"X01" is not a virus');
    expect(parseMeasure('alive.B01@fresh')).toBe('"fresh" is not a region id');
    expect(parseMeasure('births.B01@FRESH_POOL')).toMatch(/cannot be measured in a region/);
    expect(parseMeasure('mean.salt')).toMatch(/needs a region/);
    expect(parseMeasure('moisture')).toMatch(/needs a region/);
    expect(parseMeasure('glowing.Q01')).toBe('"Q01" is not a species id');
  });

  it('a region the world’s recorded habitat lacks, or a gate the dish lacks, is a MeasureError when the observer is created', () => {
    const h05 = habitatStart(habitatRegistry(), 'H05_BRINE_MOSAIC');
    expect(() => new ArmObserver(h05, { observe: ['alive.B01@ROOF'] })).toThrow(MeasureError);
    expect(() => new ArmObserver(h05, { observe: ['alive.B01@FRESH_POOL'] })).not.toThrow();
    const plain = clearWater();
    expect(() => new ArmObserver(plain, { observe: ['gateTransfer.S01.sugar'] })).toThrow(/has no S01 edge/);
    expect(() => new ArmObserver(plain, { observe: ['moisture@ROOF'] })).toThrow(/records no region ROOF/);
  });

  it('RIVAL_EXPOSURE is a suitability reason (limitSeconds reads what the inspector shows)', () => {
    expect(isSuitabilityReason('RIVAL_EXPOSURE')).toBe(true);
    expect(isSuitabilityReason('INHIBITOR_EXPOSURE')).toBe(true);
    expect(isSuitabilityReason('FOOD_ACCESS_LOW')).toBe(false);
  });
});

describe('P5.6 measures equal direct counts (shipped registry)', () => {
  it('resting, glowing, glowingStart and attached count the columns', () => {
    const w = clearWater();
    const sleepers = [0, 1, 2, 3].map((k) => place(w, 'B12', 60.5 + k, 60.5));
    const lanterns = [0, 1, 2].map((k) => place(w, 'B09', 60.5 + k, 70.5));
    const c = w.ents.cols;
    c.lifeState[sleepers[0]!] = LIFE_RESTING;
    c.lifeState[sleepers[2]!] = LIFE_RESTING;
    c.glowState[lanterns[1]!] = 1;
    c.glowState[lanterns[2]!] = 1;
    c.hostBirthId[lanterns[0]!] = c.birthId[sleepers[1]!]!; // a column read only: attached counts hostBirthId ≠ 0
    const obs = new ArmObserver(w);
    c.glowState[lanterns[2]!] = 0;
    const m = measureArm(w, obs, ['resting.B12', 'glowing.B09', 'glowingStart.B09', 'attached.B09', 'attached.B12']);
    expect(m).toEqual({ 'resting.B12': 2, 'glowing.B09': 1, 'glowingStart.B09': 2, 'attached.B09': 1, 'attached.B12': 0 });
    const direct = sleepers.filter((i) => c.lifeState[i] !== LIFE_ACTIVE).length;
    expect(m['resting.B12']).toBe(direct);
  });

  it('events.glowOn.B09 equals the ring’s glowOn records of B09 over a run in which the ring never overflows', () => {
    const w = clearWater();
    for (let k = 0; k < 6; k++) place(w, 'B09', 58.5 + 2 * k, 64.5);
    fillField(w, 'sugar', 0.5);
    fillField(w, 'sGlow', 0.6); // sensed 0.6 ≥ 0.30: each Lantern turns on after its 5 s dwell
    const first = w.counters.nextEventId;
    const obs = new ArmObserver(w, { observe: ['events.glowOn.B09', 'events.glowOff.B09', 'events.rest.B09'] });
    runObserved(w, obs, 200);
    expect(w.counters.nextEventId - first).toBeLessThan(500); // the ring kept every record of the run
    const ring = w.events.ring.filter((e) => e.id >= first);
    const sp = w.species.findIndex((s) => s.id === 'B09');
    const count = (type: string) => ring.filter((e) => e.type === type && e.species === sp).length;
    const m = measureArm(w, obs, ['events.glowOn.B09', 'events.glowOff.B09', 'events.rest.B09']);
    expect(count('glowOn')).toBeGreaterThan(0);
    expect(m['events.glowOn.B09']).toBe(count('glowOn'));
    expect(m['events.glowOff.B09']).toBe(count('glowOff'));
    expect(m['events.rest.B09']).toBe(count('rest'));
  });

  it('intakePhoto.A04 + intakeSugar.A04 equal intake.A04 over a run that crosses both modes', () => {
    const w = clearWater({ lightMode: 'cycle', backgroundOverrides: { sugar: 0.3 } });
    for (let k = 0; k < 12; k++) place(w, 'A04', 52.5 + 2 * k, 64.5);
    rebaseLedger(w);
    const obs = new ArmObserver(w, { observe: ['intakePhoto.A04', 'intakeSugar.A04', 'intakePhoto.B01'] });
    runObserved(w, obs, 2400); // one 240 s light cycle: day (Photo) and night (Sugar)
    const m = measureArm(w, obs, ['intakePhoto.A04', 'intakeSugar.A04', 'intake.A04', 'intakePhoto.B01']);
    expect(m['intakePhoto.A04']).toBeGreaterThan(0);
    expect(m['intakeSugar.A04']).toBeGreaterThan(0);
    expect(m['intakePhoto.A04']! + m['intakeSugar.A04']!).toBeCloseTo(m['intake.A04']!, 9);
    expect(m['intakePhoto.B01']).toBe(0); // a species without MIXOTROPHY has no mode
  });

  it('infections.SP.VIRUS splits infections.SP by virus on a mixed V01 / V02 dish', () => {
    const w = clearWater();
    for (let k = 0; k < 10; k++) {
      place(w, 'B01', 54.5 + 2 * k, 60.5);
      place(w, 'B02', 54.5 + 2 * k, 68.5);
    }
    fillField(w, 'sugar', 0.5);
    fillField(w, 'film', 0.3); // V02 infects only where its host's cell holds film ≥ 0.1
    fillField(w, 'v01', 3);
    fillField(w, 'v02', 3);
    const ids = ['infections.B01', 'infections.B01.V01', 'infections.B01.V02', 'infections.B02', 'infections.B02.V01', 'infections.B02.V02', 'wholeUnitCells.B02.V02', 'wholeUnitCells.B02', 'wholeUnitCells.B02.V01'];
    const obs = new ArmObserver(w, { observe: ids });
    runObserved(w, obs, 100);
    const m = measureArm(w, obs, ids);
    expect(m['infections.B01.V01']).toBeGreaterThan(0);
    expect(m['infections.B02.V02']).toBeGreaterThan(0);
    expect(m['infections.B01.V02']).toBe(0); // V02's host list holds B02 only (CT §3.3)
    expect(m['infections.B02.V01']).toBe(0); // V01's holds B01 only
    expect(m['infections.B01']).toBe(m['infections.B01.V01']! + m['infections.B01.V02']!);
    expect(m['infections.B02']).toBe(m['infections.B02.V01']! + m['infections.B02.V02']!);
    expect(m['wholeUnitCells.B02.V02']).toBeGreaterThan(0);
    expect(m['wholeUnitCells.B02']).toBe(m['wholeUnitCells.B02.V01']); // the two-part id reads v01, as before
  });

  it('gateTransfer.S01.sugar and gateCrossings.S01 equal the WORLD_GATES deltas (Gate Lab)', () => {
    const w = realizeRecipe(registry(), 'GATE_MEAL_V1');
    for (let k = 0; k < 50; k++) step(w); // the run starts after the dish has a sugar difference
    const start = WORLD_GATES.transferred(w, 'S01', 'sugar')!;
    const crossStart = WORLD_GATES.organisms!(w, 'S01')!;
    const obs = new ArmObserver(w, { observe: ['gateTransfer.S01.sugar', 'gateCrossings.S01', 'gateTransfer.S01.starch'] });
    runObserved(w, obs, 200);
    const m = measureArm(w, obs, ['gateTransfer.S01.sugar', 'gateCrossings.S01', 'gateTransfer.S01.starch']);
    expect(m['gateTransfer.S01.sugar']).toBe(WORLD_GATES.transferred(w, 'S01', 'sugar')! - start);
    expect(m['gateTransfer.S01.sugar']).toBeGreaterThan(0);
    expect(m['gateCrossings.S01']).toBe(WORLD_GATES.organisms!(w, 'S01')! - crossStart);
    expect(m['gateTransfer.S01.starch']).toBe(WORLD_GATES.transferred(w, 'S01', 'starch')!);
  });

  it('alive.B01@FRESH_POOL and mean.salt@BRINE_POOL equal counts over regionContains / regionCells (H05)', () => {
    const w = habitatStart(habitatRegistry(), 'H05_BRINE_MOSAIC', { community: true });
    const regions = w.content.habitat.regions!;
    const fresh = regions.find((r) => r.id === 'FRESH_POOL')!;
    const brine = regions.find((r) => r.id === 'BRINE_POOL')!;
    const ids = ['alive.B01@FRESH_POOL', 'alive.B10@FRESH_POOL', 'biomass.B10@BRINE_POOL', 'resting.B01@FRESH_POOL', 'mean.salt@BRINE_POOL', 'moisture@FRESH_POOL'];
    const obs = new ArmObserver(w, { observe: ids });
    runObserved(w, obs, 300);
    const m = measureArm(w, obs, ids);
    const c = w.ents.cols;
    const inRegion = (sp: string, r: typeof fresh) => {
      const s = w.species.findIndex((x) => x.id === sp);
      const out: number[] = [];
      for (let i = 0; i < w.ents.highWater; i++) {
        if (c.alive[i] !== 1 || c.species[i] !== s) continue;
        const cell = entityCell(c.x[i]!, c.y[i]!);
        if (regionContains(r, cell % 128, Math.floor(cell / 128))) out.push(i);
      }
      return out;
    };
    expect(m['alive.B01@FRESH_POOL']).toBe(inRegion('B01', fresh).length);
    expect(m['alive.B01@FRESH_POOL']).toBeGreaterThan(0);
    expect(m['alive.B10@FRESH_POOL']).toBe(inRegion('B10', fresh).length);
    expect(m['biomass.B10@BRINE_POOL']).toBeCloseTo(inRegion('B10', brine).reduce((s, i) => s + c.B[i]!, 0), 12);
    expect(m['resting.B01@FRESH_POOL']).toBe(inRegion('B01', fresh).filter((i) => c.lifeState[i] !== LIFE_ACTIVE).length);
    const cells = regionCells(brine);
    expect(m['mean.salt@BRINE_POOL']).toBeCloseTo(cells.reduce((s, k) => s + w.fields.salt![k]!, 0) / cells.length, 12);
    expect(m['mean.salt@BRINE_POOL']).toBeGreaterThan(0.3);
    const fc = regionCells(fresh);
    expect(m['moisture@FRESH_POOL']).toBeCloseTo(fc.reduce((s, k) => s + w.derived.moisture[k]!, 0) / fc.length, 12);
  });

  it('limitSeconds.B01.RIVAL_EXPOSURE > 0 where the inspector shows RIVAL_EXPOSURE', () => {
    const w = clearWater();
    const slots = [0, 1, 2].map((k) => place(w, 'B01', 60.5 + 2 * k, 64.5));
    fillField(w, 'sugar', 0.5);
    fillField(w, 'rival', 2); // exposure 0.25 × 2 = 0.5 → growth factor 0.67, the lowest factor
    step(w);
    const c = w.ents.cols;
    const sp = w.species[c.species[slots[0]!]!]!;
    expect(entitySuitabilityAt(w, slots[0]!, sp, profileOf(w, slots[0]!), entityCell(c.x[slots[0]!]!, c.y[slots[0]!]!)).reason).toBe(R.RIVAL_EXPOSURE);
    const obs = new ArmObserver(w, { observe: ['limitSeconds.B01.RIVAL_EXPOSURE'] });
    runObserved(w, obs, 10);
    expect(measureArm(w, obs, ['limitSeconds.B01.RIVAL_EXPOSURE'])['limitSeconds.B01.RIVAL_EXPOSURE']).toBeGreaterThan(0);
  });

  it('firstCaptureAt.SP is −1 without a capture, and secretingSeconds counts organisms that released this tick', () => {
    const w = clearWater();
    const crumbs = [0, 1, 2, 3].map((k) => place(w, 'B06', 60.5 + 2 * k, 64.5));
    fillField(w, 'starch', 0.5);
    const obs = new ArmObserver(w, { observe: ['secretingSeconds.B06'] });
    let direct = 0;
    for (let k = 0; k < 50; k++) {
      stepObserved(w, obs);
      const c = w.ents.cols;
      direct += crumbs.filter((i) => c.alive[i] === 1 && c.secreting[i] !== 0).length / 10;
    }
    const m = measureArm(w, obs, ['secretingSeconds.B06', 'firstCaptureAt.B06']);
    expect(m['secretingSeconds.B06']).toBeGreaterThan(0);
    expect(m['secretingSeconds.B06']).toBeCloseTo(direct, 9);
    expect(m['firstCaptureAt.B06']).toBe(-1);
  });

  it('catalogIds (the comparison engine’s full catalog) lists none of the new heads for a FIRST_DISH_V1 world', () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1');
    const obs = new ArmObserver(w);
    runObserved(w, obs, 50);
    const ids = catalogIds(w, obs);
    const oldHeads = [...SCALAR_MEASURES, ...SPECIES_MEASURES, ...GROUP_MEASURES, 'deaths', 'field', 'consumed', 'converted', 'patchInput'];
    for (const id of ids) {
      expect(id.includes('@'), id).toBe(false);
      expect(oldHeads.includes(id.split('.')[0]!), id).toBe(true);
    }
    // Asking for tracked Phase 5 measures adds exactly those ids, in the order asked, and nothing else.
    const asked = ['events.glowOn.B01', 'alive.B01']; // alive.B01 is not tracked: ignored by `observe`
    const obs2 = new ArmObserver(w, { observe: asked });
    expect(catalogIds(w, obs2)).toEqual([...catalogIds(w, new ArmObserver(w)), 'events.glowOn.B01']);
  });
});
