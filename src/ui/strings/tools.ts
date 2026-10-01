/**
 * Words for Sample, Transfer and Clean water (UX §4.4, §5.11; SPEC §10.5–10.6; P3.5). Every number
 * shown comes from the worker (measured from the world); nothing here computes biology. All amounts are
 * fictional game units.
 */
import type { SampleMode } from '@sim/sampleSlot';

export const SAMPLE_MODE_LABELS: Readonly<Record<SampleMode, string>> = {
  life: 'Life',
  dissolved: 'Dissolved',
  deposits: 'Deposits',
  all: 'All',
};

export const SAMPLE_MODE_HINTS: Readonly<Record<SampleMode, string>> = {
  life: 'Organisms whose centres are in the circle, and phage units there.',
  dissolved: 'Dissolved food, nutrient, gases, chemistry and enzymes in the circle.',
  deposits: 'Starch, oil, protein, debris and film with their bound nutrient, and food objects.',
  all: 'Everything above. Stones, walls and beads always stay.',
};

export const CLEAN_WATER_LABELS: Readonly<Record<string, string>> = { '0.25': '25 %', '0.5': '50 %', '1': '100 %' };

/** Rounded game units for the held inventory line. */
export function units(v: number): string {
  if (v === 0) return '0';
  if (Math.abs(v) < 0.01) return '< 0.01';
  return v.toFixed(2);
}

export const TOOLS_COPY = {
  sampleName: 'Sample',
  transferName: 'Transfer',
  cleanWaterName: 'Clean water',
  sample: {
    purpose: 'Lift part of the dish into a holding slot, then move it somewhere else, put it back, or remove it.',
    habitats: 'Anywhere in the dish.',
    dose: 'Choose what to lift (Life, Dissolved, Deposits or All) and a circle of radius 1, 3 or 6.',
    changes: 'While a sample is held, the dish stays paused. The held material still counts in the dish’s totals.',
    unchanged: 'Stones, walls and beads. Partners are never split: a host and its rider, linked threads and a hunter with its claimed prey go together or not at all.',
    watch: 'What happens to the place you emptied, and to the place you move it to.',
  },
  cleanWater: {
    purpose: 'Replace part of the water under the brush with clean water.',
    habitats: 'Open cells and beads; stones and walls are skipped.',
    dose: (pct: string) => `Removes ${pct} of every dissolved food, nutrient, chemical, enzyme and phage unit there.`,
    changes: 'Oxygen and carbon dioxide there return to this habitat’s starting level. Removed material leaves the dish and is logged.',
    unchanged: 'Organisms, deposits (starch, oil, protein, debris, film) and food objects.',
    watch: 'Whether the life there recovers, or loses its food.',
  },
  modeLabel: 'Take',
  fractionLabel: 'Replace',
  begin: 'Start sampling',
  beginHint: 'The dish pauses. Tap the dish to choose where to sample.',
  aimHint: 'Tap the dish where you want to sample.',
  confirm: 'Take sample',
  cancel: 'Cancel',
  cancelSampling: 'Stop sampling',
  transfer: 'Transfer',
  transferHint: 'Tap the dish where the sample’s centre should go.',
  discard: 'Discard',
  discardConfirm: 'Discard the held sample? Its material and organisms leave the dish (logged as removed). This cannot be undone except with Undo.',
  replaceConfirm: 'A sample is already held. Replace it? The held sample will be discarded first.',
  heldTitle: 'Sample held',
  heldHint: 'Time is paused until you transfer, cancel or discard it.',
  reloadHint: 'This dish was saved while holding a sample. Complete the transfer, cancel it or discard it; time stays paused until you do.',
  complete: 'Complete (transfer)',
  previewTitle: 'Sample preview',
  nothing: 'Nothing to take here.',
  cancelled: 'Sample cancelled — everything is back exactly where it was.',
  discarded: 'Sample discarded — its contents left the dish (logged).',
  taken: (what: string) => `Sample taken: ${what}. Tap Transfer to place it.`,
  transferred: 'Sample moved.',
  transferRefused: (why: string) => `The sample was not moved: ${why}. Nothing changed; it is still held.`,
  missing: 'Partners outside the circle (take a larger circle, or sample them together):',
} as const;

/** "3 organisms, 12 cells, 1 object · C 1.20 · N 0.12 · M 0" */
export function heldLine(h: { organisms: number; cells: number; objects: number; c: number; n: number; m: number }): string {
  const parts = [
    `${h.organisms} organism${h.organisms === 1 ? '' : 's'}`,
    `${h.cells} cell${h.cells === 1 ? '' : 's'} of fields`,
  ];
  if (h.objects > 0) parts.push(`${h.objects} food object${h.objects === 1 ? '' : 's'}`);
  return `${parts.join(', ')} · carbon ${units(h.c)} · nutrient ${units(h.n)} · mineral ${units(h.m)}`;
}
