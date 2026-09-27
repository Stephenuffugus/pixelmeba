/**
 * Field registry (SPEC §2.3, CT §13). Order is saved and hashed: append only, never reorder.
 * Each field is a per-cell Float64Array allocated only when its system is enabled.
 */
import { CELL_COUNT } from './constants';

export type DiffusionClass = 'none' | 'normal' | 'half' | 'viralHalf';
export type BarrierClass = 'dissolved' | 'activity' | 'viral' | 'none';
export type Material = 'carbon' | 'nutrient' | 'mineral' | 'none';

export interface FieldDef {
  readonly id: FieldId;
  readonly diffusion: DiffusionClass;
  readonly barrier: BarrierClass;
  readonly material: Material;
  /** Carbon per unit (viral units are 0.01 C each). */
  readonly carbonPerUnit?: number;
  /** For carbon pools that carry bound nutrient: the companion field id. */
  readonly companion?: FieldId;
  /** Manifest system flag that allocates this field. 'core' is always on. */
  readonly system: SystemFlag;
  /** Deposits never diffuse and are drawn as glyphs; dissolved fields appear as overlays. */
  readonly kind: 'dissolved' | 'deposit' | 'gas' | 'activity' | 'viral' | 'index';
}

export const SYSTEM_FLAGS = [
  'core',
  'enzymes',
  'film',
  'fungi',
  'parasites',
  'viruses',
  'chemistry',
  'signals',
  'rivalry',
  'silicate',
  'climate',
  'barriers',
  'devices',
  'foodObjects',
  'equipment',
  'developmental',
] as const;
export type SystemFlag = (typeof SYSTEM_FLAGS)[number];

export const FIELD_IDS = [
  'sugar',
  'sugarN',
  'starch',
  'starchN',
  'oil',
  'oilN',
  'protein',
  'proteinN',
  'broth',
  'brothN',
  'detritus',
  'detritusN',
  'metabolite',
  'film',
  'filmN',
  'nutrient',
  'oxygen',
  'co2',
  'acid',
  'base',
  'buffer',
  'salt',
  'inhBact',
  'inhFung',
  'inhPhoto',
  'silicate',
  'grit',
  'v01',
  'v02',
  'eStarch',
  'eOil',
  'eProtein',
  'breaker',
  'sGlow',
  'quencher',
  'rival',
] as const;
export type FieldId = (typeof FIELD_IDS)[number];

const F = (d: Omit<FieldDef, 'id'>) => d;

export const FIELD_DEFS: Readonly<Record<FieldId, FieldDef>> = Object.freeze({
  sugar: { id: 'sugar', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'carbon', companion: 'sugarN', system: 'core', kind: 'dissolved' }) },
  sugarN: { id: 'sugarN', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'nutrient', system: 'core', kind: 'dissolved' }) },
  starch: { id: 'starch', ...F({ diffusion: 'none', barrier: 'none', material: 'carbon', companion: 'starchN', system: 'core', kind: 'deposit' }) },
  starchN: { id: 'starchN', ...F({ diffusion: 'none', barrier: 'none', material: 'nutrient', system: 'core', kind: 'deposit' }) },
  oil: { id: 'oil', ...F({ diffusion: 'none', barrier: 'none', material: 'carbon', companion: 'oilN', system: 'core', kind: 'deposit' }) },
  oilN: { id: 'oilN', ...F({ diffusion: 'none', barrier: 'none', material: 'nutrient', system: 'core', kind: 'deposit' }) },
  protein: { id: 'protein', ...F({ diffusion: 'none', barrier: 'none', material: 'carbon', companion: 'proteinN', system: 'core', kind: 'deposit' }) },
  proteinN: { id: 'proteinN', ...F({ diffusion: 'none', barrier: 'none', material: 'nutrient', system: 'core', kind: 'deposit' }) },
  broth: { id: 'broth', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'carbon', companion: 'brothN', system: 'enzymes', kind: 'dissolved' }) },
  brothN: { id: 'brothN', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'nutrient', system: 'enzymes', kind: 'dissolved' }) },
  detritus: { id: 'detritus', ...F({ diffusion: 'none', barrier: 'none', material: 'carbon', companion: 'detritusN', system: 'core', kind: 'deposit' }) },
  detritusN: { id: 'detritusN', ...F({ diffusion: 'none', barrier: 'none', material: 'nutrient', system: 'core', kind: 'deposit' }) },
  metabolite: { id: 'metabolite', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'carbon', system: 'core', kind: 'dissolved' }) },
  film: { id: 'film', ...F({ diffusion: 'none', barrier: 'none', material: 'carbon', companion: 'filmN', system: 'film', kind: 'deposit' }) },
  filmN: { id: 'filmN', ...F({ diffusion: 'none', barrier: 'none', material: 'nutrient', system: 'film', kind: 'deposit' }) },
  nutrient: { id: 'nutrient', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'nutrient', system: 'core', kind: 'dissolved' }) },
  oxygen: { id: 'oxygen', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'none', system: 'core', kind: 'gas' }) },
  co2: { id: 'co2', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'carbon', system: 'core', kind: 'gas' }) },
  acid: { id: 'acid', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'none', system: 'core', kind: 'dissolved' }) },
  base: { id: 'base', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'none', system: 'core', kind: 'dissolved' }) },
  buffer: { id: 'buffer', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'none', system: 'core', kind: 'dissolved' }) },
  salt: { id: 'salt', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'none', system: 'core', kind: 'dissolved' }) },
  inhBact: { id: 'inhBact', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'none', system: 'chemistry', kind: 'dissolved' }) },
  inhFung: { id: 'inhFung', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'none', system: 'chemistry', kind: 'dissolved' }) },
  inhPhoto: { id: 'inhPhoto', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'none', system: 'chemistry', kind: 'dissolved' }) },
  silicate: { id: 'silicate', ...F({ diffusion: 'normal', barrier: 'dissolved', material: 'mineral', system: 'silicate', kind: 'dissolved' }) },
  grit: { id: 'grit', ...F({ diffusion: 'none', barrier: 'none', material: 'mineral', system: 'silicate', kind: 'deposit' }) },
  v01: { id: 'v01', ...F({ diffusion: 'normal', barrier: 'viral', material: 'carbon', carbonPerUnit: 0.01, system: 'viruses', kind: 'viral' }) },
  v02: { id: 'v02', ...F({ diffusion: 'viralHalf', barrier: 'viral', material: 'carbon', carbonPerUnit: 0.01, system: 'viruses', kind: 'viral' }) },
  eStarch: { id: 'eStarch', ...F({ diffusion: 'half', barrier: 'activity', material: 'none', system: 'enzymes', kind: 'activity' }) },
  eOil: { id: 'eOil', ...F({ diffusion: 'half', barrier: 'activity', material: 'none', system: 'enzymes', kind: 'activity' }) },
  eProtein: { id: 'eProtein', ...F({ diffusion: 'half', barrier: 'activity', material: 'none', system: 'enzymes', kind: 'activity' }) },
  breaker: { id: 'breaker', ...F({ diffusion: 'normal', barrier: 'activity', material: 'none', system: 'enzymes', kind: 'activity' }) },
  sGlow: { id: 'sGlow', ...F({ diffusion: 'normal', barrier: 'activity', material: 'none', system: 'signals', kind: 'activity' }) },
  quencher: { id: 'quencher', ...F({ diffusion: 'normal', barrier: 'activity', material: 'none', system: 'signals', kind: 'activity' }) },
  rival: { id: 'rival', ...F({ diffusion: 'half', barrier: 'activity', material: 'none', system: 'rivalry', kind: 'activity' }) },
});

/** Carbon food pools and their companion nutrient fields, in canonical order. */
export const CARBON_WITH_COMPANION: ReadonlyArray<readonly [FieldId, FieldId]> = [
  ['sugar', 'sugarN'],
  ['starch', 'starchN'],
  ['oil', 'oilN'],
  ['protein', 'proteinN'],
  ['broth', 'brothN'],
  ['detritus', 'detritusN'],
  ['film', 'filmN'],
];

export type FieldStore = Partial<Record<FieldId, Float64Array>>;

export function allocateFields(systems: readonly SystemFlag[]): FieldStore {
  const store: FieldStore = {};
  for (const id of FIELD_IDS) {
    const sys = FIELD_DEFS[id].system;
    if (sys === 'core' || systems.includes(sys)) store[id] = new Float64Array(CELL_COUNT);
  }
  return store;
}

/** Iterate allocated fields in canonical order. */
export function allocatedFieldIds(store: FieldStore): FieldId[] {
  return FIELD_IDS.filter((id) => store[id] !== undefined);
}

export function isFieldId(s: string): s is FieldId {
  return (FIELD_IDS as readonly string[]).includes(s);
}
