/**
 * P5.6 words (wave 15 p5-polish; D-0131): every Phase 5 measurement head (src/sim/pairedRun.ts P5_MEASURE_HEADS) and
 * region form has one plain label in src/ui/strings/experiments.ts measureLabel, from the card's own names (species,
 * ExperimentCardView.regionNames), and the three Phase 5 player steps have words. No label says "because",
 * "superior", "advanced", "perfect", "adapted" or "immune", and none leaks a raw id. Every Phase 5 card in the tree
 * (stage 1's EXP_205 … EXP_211) is worded in full from the shipped registry.
 */
import { describe, expect, it } from 'vitest';
import { experimentCardView, experimentCatalog, type ExperimentCardView, type PlayerStep } from '../../src/sim/experiments';
import { EVENT_MEASURE_TYPES, GATE_KINDS, P5_MEASURE_HEADS, parseMeasure } from '../../src/sim/pairedRun';
import { formatDiff, formatMeasure, measureLabel, playerStepLabel, playerStepText, regionWords } from '../../src/ui/strings/experiments';
import { registry } from '../experiments/helpers';

const BANNED = /\b(because|superior|advanced|perfect|adapted|immune)\b/i;

const CARD = {
  id: 'EXP_TEST',
  paired: false,
  speciesNames: { B01: 'Sprinter', B09: 'Lantern', B12: 'Sleeper', A04: 'Turnleaf', P10: 'Needlejaw', X02: 'Threadrider', F03: 'Traplace', F04: 'Sporeveil', B06: 'Crumbsmith', V02: 'Lacephage', V01: 'Pinphage' },
  moduleNames: {},
  materialNames: {},
  patches: [],
  scheduled: [],
  founders: [],
  stepSpecies: ['B09'],
  regionNames: { FRESH_POOL: 'Fresh pool', BRINE_POOL: 'Brine pool', ROOF: 'Under the roof', OPEN_GEL: 'Open gel', LEFT_SIDE: 'Left side' },
} as unknown as ExperimentCardView;

/** One sample id per Phase 5 head (and the region forms and the two virus forms). */
const SAMPLES: Readonly<Record<string, string>> = {
  resting: 'resting.B12',
  glowing: 'glowing.B09',
  glowingStart: 'glowingStart.B09',
  attached: 'attached.X02',
  events: 'events.glowOn.B09',
  firstCaptureAt: 'firstCaptureAt.P10',
  intakePhoto: 'intakePhoto.A04',
  intakeSugar: 'intakeSugar.A04',
  secretingSeconds: 'secretingSeconds.B09',
  gateTransfer: 'gateTransfer.S01.sugar',
  gateCrossings: 'gateCrossings.S01',
  mean: 'mean.salt@FRESH_POOL',
  moisture: 'moisture@ROOF',
};

describe('Phase 5 measure labels (measureLabel)', () => {
  it('every head in P5_MEASURE_HEADS has a sample id in the grammar and a plain label', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual([...P5_MEASURE_HEADS].sort());
    for (const head of P5_MEASURE_HEADS) {
      const id = SAMPLES[head]!;
      expect(typeof parseMeasure(id), id).toBe('object');
      const label = measureLabel(CARD, id);
      expect(label, id).not.toBe(id);
      expect(label, id).not.toMatch(BANNED);
      expect(label, id).not.toMatch(/[A-Z]{2,}[0-9_]|\b[BYFAPXV][0-9]{2}\b|@/);
    }
  });

  it('the exact words for the named examples', () => {
    expect(measureLabel(CARD, 'events.glowOn.B09')).toBe('Glow switch-ons by Lanterns');
    expect(measureLabel(CARD, 'events.glowOff.B09')).toBe('Glow switch-offs by Lanterns');
    expect(measureLabel(CARD, 'resting.B12')).toBe('Sleepers resting');
    expect(measureLabel(CARD, 'glowing.B09')).toBe('Lanterns glowing');
    expect(measureLabel(CARD, 'glowingStart.B09')).toBe('Lanterns glowing when the run began');
    expect(measureLabel(CARD, 'alive.B01@FRESH_POOL')).toBe('Sprinters in the Fresh pool');
    expect(measureLabel(CARD, 'resting.F04@ROOF')).toBe('Sporeveils resting under the roof');
    expect(measureLabel(CARD, 'biomass.B01@LEFT_SIDE')).toBe('Sprinter biomass in the Left side');
    expect(measureLabel(CARD, 'gateTransfer.S01.sugar')).toBe('Sugar moved across fine membranes');
    expect(measureLabel(CARD, 'gateTransfer.S03.salt')).toBe('Salt moved across shutter gates');
    expect(measureLabel(CARD, 'gateCrossings.S02')).toBe('Organism crossings of small gates');
    expect(measureLabel(CARD, 'intakePhoto.A04')).toBe('Carbon Turnleafs took in while in Photo mode');
    expect(measureLabel(CARD, 'intakeSugar.A04')).toBe('Carbon Turnleafs took in while in Sugar mode');
    expect(measureLabel(CARD, 'mean.salt@BRINE_POOL')).toBe('Mean salt in the Brine pool');
    expect(measureLabel(CARD, 'moisture@OPEN_GEL')).toBe('Mean moisture in the Open gel');
    expect(measureLabel(CARD, 'firstCaptureAt.P10')).toBe('When Needlejaws first caught prey');
    expect(measureLabel(CARD, 'attached.X02')).toBe('Threadriders riding a host');
    expect(measureLabel(CARD, 'infections.B01.V02')).toBe('Sprinters newly infected by Lacephage');
    expect(measureLabel(CARD, 'wholeUnitCells.B01.V02')).toBe('Most cells at once holding a whole Lacephage unit and a living Sprinter');
    // The P3.9 forms read as before.
    expect(measureLabel(CARD, 'infections.B01')).toBe('Sprinters newly infected');
    expect(measureLabel(CARD, 'wholeUnitCells.B01')).toBe('Most cells at once holding a whole Pinphage unit and a living Sprinter');
    expect(regionWords(CARD, 'NOWHERE')).toBe('in the NOWHERE');
  });

  it('every counted event type, every gate kind and every region form has words, none banned', () => {
    for (const t of EVENT_MEASURE_TYPES) {
      const l = measureLabel(CARD, `events.${t}.B09`);
      // Not the fallback (“type” records of …), and never the camel-case type itself.
      expect(l, t).not.toContain('“');
      if (/[A-Z]/.test(t)) expect(l, t).not.toContain(t);
      expect(l).not.toMatch(BANNED);
    }
    for (const g of GATE_KINDS) {
      expect(measureLabel(CARD, `gateCrossings.${g}`)).not.toContain(g);
      expect(measureLabel(CARD, `gateTransfer.${g}.salt`)).not.toContain(g);
    }
    for (const id of ['alive.B01@FRESH_POOL', 'resting.F04@ROOF', 'biomass.B01@OPEN_GEL', 'mean.salt@FRESH_POOL', 'moisture@ROOF']) {
      expect(typeof parseMeasure(id)).toBe('object');
      expect(measureLabel(CARD, id)).not.toMatch(/@|[A-Z]{3,}_/);
    }
  });

  it('values carry their units: counts whole, seconds, "no capture yet", means to 0.001', () => {
    expect(formatMeasure('events.glowOn.B09', 3)).toBe('3');
    expect(formatMeasure('gateCrossings.S01', 12)).toBe('12');
    expect(formatMeasure('alive.B01@FRESH_POOL', 7)).toBe('7');
    expect(formatMeasure('firstCaptureAt.P10', -1)).toBe('no capture yet');
    expect(formatMeasure('firstCaptureAt.P10', 12.3)).toBe('12.3 s');
    expect(formatMeasure('secretingSeconds.B09', 4.25)).toBe('4.3 s');
    expect(formatMeasure('intakePhoto.A04', 1.234)).toBe('1.23 C');
    expect(formatMeasure('moisture@ROOF', 0.41234)).toBe('0.412');
    expect(formatMeasure('mean.salt@FRESH_POOL', 0.0567)).toBe('0.057');
    expect(formatDiff('firstCaptureAt.P10', -1, 4)).toBe('—');
    expect(formatDiff('moisture@ROOF', 0.4, 0.5)).toBe('+0.100');
  });
});

describe('the three Phase 5 player steps', () => {
  const STEPS: readonly PlayerStep[] = ['inspectGlow', 'toggleShutter', 'inspectMoisture'];
  it('each has words that start with its label', () => {
    expect(STEPS.map((s) => playerStepLabel(CARD, s))).toEqual(['Inspect a Lantern’s glow', 'Open or close the shutter', 'Inspect moisture in a marked region']);
    for (const s of STEPS) {
      const t = playerStepText(CARD, s);
      expect(t.startsWith(playerStepLabel(CARD, s))).toBe(true);
      expect(t).not.toMatch(BANNED);
    }
  });
});

describe('every Phase 5 card in the tree is worded in full (shipped registry)', () => {
  it('no measurement or step of EXP_205 … EXP_218 falls back to its raw id', () => {
    const reg = registry();
    const p5 = experimentCatalog(reg).filter((d) => d.phase === 5);
    expect(p5.length).toBeGreaterThanOrEqual(7);
    for (const def of p5) {
      const card = experimentCardView(reg, def);
      for (const id of card.measurements) {
        const l = measureLabel(card, id);
        expect(l, `${def.id} ${id}`).not.toBe(id);
        expect(l, `${def.id} ${id}`).not.toMatch(/@|\b[BYFAPXV][0-9]{2}\b/);
        expect(l).not.toMatch(BANNED);
      }
      for (const st of card.playerSteps) expect(playerStepText(card, st), `${def.id} ${st}`).toBeTruthy();
    }
  });
});
