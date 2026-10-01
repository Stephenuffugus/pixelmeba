/**
 * Words and number formats for the comparison screens (UX §5.6). Every figure shown comes from the
 * worker's measured results; nothing here computes biology.
 */
import type { CommandPayload, CommandResult } from '@sim/commands';
import type { Intervention, MeasureRow } from '@worker/comparison';
import type { DishInfo } from '@worker/protocol';
import { reasonName } from '@sim/reasons';
import { reasonText } from '../strings/reasons';
import { paintName, structureName } from './LabTrayNames';
import { evolutionLabel } from '../strings/whatif';
import { CLEAN_WATER_LABELS, SAMPLE_MODE_LABELS } from '../strings/tools';

/** Simulated time mm:ss (h:mm:ss when needed) from ticks. */
export function clock(ticks: number): string {
  const s = Math.floor(ticks / 10);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function horizonLabel(seconds: number | null): string {
  if (seconds === null) return 'Until I stop';
  return seconds < 120 ? `${seconds} s` : `${seconds / 60} min`;
}

/** One queued change in plain words, from the command and the amount the worker accepted. */
export function describeChange(info: DishInfo, payload: CommandPayload, result: CommandResult | null): string {
  const accepted = result?.accepted ?? 0;
  switch (payload.kind) {
    case 'deposit': {
      const mat = info.materials.find((m) => m.id === payload.materialId)?.name ?? payload.materialId;
      return `${mat}, ${payload.dose} per cell on ${accepted} cell${accepted === 1 ? '' : 's'}`;
    }
    case 'inoculate': {
      const name = info.speciesNames[info.speciesIds.indexOf(payload.speciesId)] ?? payload.speciesId;
      return `${accepted} ${name} added`;
    }
    case 'setLid':
      return `Lid ${payload.lid}`;
    case 'setMutationPreset':
      return `Evolution setting: ${evolutionLabel(payload.preset)}`;
    // Lab habitat edits (P2.7), named from content ("Impermeable wall"), never by internal code.
    case 'paintSubstrate':
      return `${paintName(info, payload.substrate)} painted on ${accepted} cell${accepted === 1 ? '' : 's'}`;
    case 'paintShade':
      return payload.erase
        ? `Shade removed from ${accepted} cell${accepted === 1 ? '' : 's'}`
        : `${paintName(info, 'shade')} on ${accepted} cell${accepted === 1 ? '' : 's'}`;
    case 'placeStructure':
      return `${structureName(payload.structure)} placed on ${accepted} cell${accepted === 1 ? '' : 's'}`;
    case 'eraseStructure':
      return `Structure removed from ${accepted} cell${accepted === 1 ? '' : 's'}`;
    // Branch notebook and specimens (P2.3).
    case 'lineage':
      return payload.op === 'spawnSpecimen' ? `${accepted} from specimen ${payload.specimen} added` : 'Family tree note';
    // Finite food objects (P3.6): one per tap, named from content ("Leaf wafer").
    case 'placeObject': {
      const mat = info.materials.find((m) => m.id === payload.materialId)?.name ?? payload.materialId;
      return accepted > 0 ? `${mat} placed at (${Math.floor(payload.x)}, ${Math.floor(payload.y)})` : `${mat} not placed`;
    }
    // Sample, Transfer and Clean water (P3.5).
    case 'sampleTake':
      return accepted > 0 ? `Sample taken (${SAMPLE_MODE_LABELS[payload.mode] ?? payload.mode}, radius ${payload.radius})` : 'Sample not taken';
    case 'sampleTransfer':
      return accepted > 0 ? `Sample moved by (${payload.dx}, ${payload.dy})` : 'Sample not moved';
    case 'sampleDiscard':
      return accepted > 0 ? 'Held sample discarded' : 'No sample discarded';
    case 'cleanWater':
      return `Clean water (${CLEAN_WATER_LABELS[String(payload.fraction)] ?? payload.fraction}) on ${accepted} cell${accepted === 1 ? '' : 's'}`;
  }
}

export function describeChanges(info: DishInfo, list: readonly Intervention[]): string {
  return list.length === 0 ? 'no change' : list.map((iv) => describeChange(info, iv.payload, iv.result)).join('; ');
}

const LABELS: Record<Exclude<MeasureRow['key'], 'speciesCount' | 'speciesBiomass'>, string> = {
  alive: 'Organisms alive',
  biomass: 'Living biomass',
  speciesAlive: 'Kinds still alive',
  shannon: 'Diversity index (Shannon H)',
  oxygenMean: 'Mean oxygen',
  births: 'Births during the run',
  deaths: 'Deaths during the run',
  capacitySeconds: 'Seconds the dish was full',
  carbonAdded: 'Carbon added since the start',
};

const DECIMALS: Record<MeasureRow['key'], number> = {
  alive: 0,
  biomass: 2,
  speciesAlive: 0,
  shannon: 3,
  oxygenMean: 3,
  births: 0,
  deaths: 0,
  capacitySeconds: 1,
  carbonAdded: 2,
  speciesCount: 0,
  speciesBiomass: 2,
};

/** The name of a dish-wide measure (not a per-kind row), e.g. for a saved result card. */
export function measureLabel(key: MeasureRow['key']): string | null {
  return key === 'speciesCount' || key === 'speciesBiomass' ? null : LABELS[key];
}

export function rowLabel(row: MeasureRow, info: DishInfo): string {
  if (row.key === 'speciesCount') return `${info.speciesNames[row.species ?? -1] ?? '?'} alive`;
  if (row.key === 'speciesBiomass') return `${info.speciesNames[row.species ?? -1] ?? '?'} biomass`;
  return LABELS[row.key];
}

export function fmt(value: number, key: MeasureRow['key']): string {
  const d = DECIMALS[key];
  const v = Math.abs(value) < 0.5 * 10 ** -d ? 0 : value;
  return v.toFixed(d).replace('-', '−');
}

/** An absolute difference B − A in game units, signed; "0" when none, "≈0" when too small to show. */
export function fmtDiff(value: number, key: MeasureRow['key']): string {
  if (value === 0) return '0';
  const s = fmt(value, key);
  if (/^0(\.0+)?$/.test(s)) return '≈0';
  return value > 0 ? `+${s}` : s;
}

const CAUSES: Record<string, string> = {
  DEATH_STARVATION: 'Ran out of energy',
  DEATH_STRESS: 'Conditions too harsh',
  DEATH_INHIBITOR: 'Harmed by something in the water',
  DEATH_AGE: 'End of life',
  DEATH_PREDATION: 'Eaten',
  DEATH_LYSIS: 'Burst by a virus',
  DEATH_PARASITE_DRAIN: 'Drained by a parasite',
  DEATH_TRAP_DRAIN: 'Drained by a trap',
};

export function causeLabel(code: number): string {
  return CAUSES[reasonName(code)] ?? reasonText(code, 'explore').replace(/\.$/, '');
}

export const CONCLUSIONS = [
  { id: 'supports', label: 'Supports my prediction' },
  { id: 'contradicts', label: 'Contradicts my prediction' },
  { id: 'cantTell', label: "Can't tell" },
] as const;
