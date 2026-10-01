/**
 * Chemistry readings (SPEC §4.3–4.4, §12.1; CT §3.4, §12.2; P3.1): the values the cell inspector
 * shows, computed by the same rules the simulation applies. Pure reads of a world; nothing here
 * changes state or consumes randomness.
 *
 * - pH display = clamp(7 + (base − acid)/(1 + buffer), 2, 12); stored acid, base and buffer are never
 *   clamped (transport.ts updateDerived keeps the same formula in world.derived.ph).
 * - Salinity index = the cell's salt amount (it may exceed 1; tolerances read the actual value).
 * - Inhibitor exposure by category (CT §3.4): bacterial targets B01–B13, fungal Y01, Y02 and F01–F04,
 *   photosynthetic A01–A05; consumers, parasites and viruses are untouched. An organism's exposure is
 *   the sum of the inhibitors that target it, × 0.5 once when its cell holds film (D-0008); its growth
 *   is × 1/(1 + exposure) and it loses 8 × exposure health per second (suitability.ts, maintenance.ts).
 * - Light factors (SPEC §4.4): effective light = clamp(habitat baseline × painted shade, 0, 1) while
 *   there is no light cycle, lamp, roof or canopy (Phase 5–6).
 */
import { INHIBITOR_DAMAGE } from './constants';
import type { Species } from './content/schema';
import type { FieldId } from './fields';
import type { World } from './world';

export const PH_MIN = 2;
export const PH_MAX = 12;

/** The displayed pH of acid, base and buffer amounts (SPEC §4.3). */
export function phDisplay(acid: number, base: number, buffer: number): number {
  const ph = 7 + (base - acid) / (1 + buffer);
  return ph < PH_MIN ? PH_MIN : ph > PH_MAX ? PH_MAX : ph;
}

/** The displayed pH of a cell, from its stored amounts (0 for a field this world does not allocate). */
export function cellPh(world: World, cell: number): number {
  const f = world.fields;
  return phDisplay(f.acid?.[cell] ?? 0, f.base?.[cell] ?? 0, f.buffer?.[cell] ?? 0);
}

/** The salinity index of a cell: its salt amount, unclamped (SPEC §4.3). */
export function salinityIndex(world: World, cell: number): number {
  return world.fields.salt?.[cell] ?? 0;
}

export type InhibitorCategory = 'bacterial' | 'fungal' | 'photosynthetic';

/** The three inhibitor fields and the species categories each one targets (CT §3.4). */
export const INHIBITORS: readonly {
  readonly category: InhibitorCategory;
  readonly field: FieldId;
  readonly targets: readonly Species['category'][];
}[] = [
  { category: 'bacterial', field: 'inhBact', targets: ['bacterium'] },
  { category: 'fungal', field: 'inhFung', targets: ['yeast', 'fungus'] },
  { category: 'photosynthetic', field: 'inhPhoto', targets: ['alga'] },
];

/** The inhibitor category that targets a species category, or null (consumers, parasites, viruses). */
export function inhibitorCategoryOf(category: Species['category']): InhibitorCategory | null {
  for (const inh of INHIBITORS) if (inh.targets.includes(category)) return inh.category;
  return null;
}

export interface ExposureLine {
  readonly category: InhibitorCategory;
  /** The inhibitor amount in the cell. */
  readonly amount: number;
  /** The exposure an organism of this category has here: the amount, × 0.5 when the cell holds film. */
  readonly exposure: number;
  /** Growth multiplier 1/(1 + exposure). */
  readonly growthFactor: number;
  /** Health lost per second, 8 × exposure. */
  readonly damagePerSecond: number;
}

export interface ExposureBreakdown {
  /** Whether film in the cell halves the exposure (D-0008). */
  readonly filmHalves: boolean;
  /** One line per inhibitor this world allocates (its 'chemistry' system), in CT §3.4 order. */
  readonly lines: readonly ExposureLine[];
}

/**
 * Inhibitor exposure in a cell by target category, as suitability.ts inhibitorExposure computes it for
 * an organism of that category. Empty `lines` when the world records no inhibitors.
 */
export function exposureBreakdown(world: World, cell: number): ExposureBreakdown {
  const film = world.fields.film;
  const filmHalves = film !== undefined && film[cell]! > 0;
  const lines: ExposureLine[] = [];
  for (const inh of INHIBITORS) {
    const f = world.fields[inh.field];
    if (!f) continue;
    const amount = f[cell]!;
    const exposure = filmHalves && amount > 0 ? amount * 0.5 : amount;
    lines.push({
      category: inh.category,
      amount,
      exposure,
      growthFactor: 1 / (1 + exposure),
      damagePerSecond: INHIBITOR_DAMAGE * exposure,
    });
  }
  return { filmHalves, lines };
}

export interface LightFactors {
  /** The habitat's light baseline in this cell. */
  readonly baseline: number;
  /** The painted shade factor (1.0, or the dish's shade paint factor). */
  readonly shade: number;
  /** The light organisms receive: clamp(baseline × shade, 0, 1). */
  readonly effective: number;
}

/** The light factors of a cell (SPEC §4.4). */
export function lightFactors(world: World, cell: number): LightFactors {
  const baseline = world.grid.lightBase[cell]!;
  const shade = world.grid.shade[cell]!;
  const l = baseline * shade;
  return { baseline, shade, effective: l < 0 ? 0 : l > 1 ? 1 : l };
}
