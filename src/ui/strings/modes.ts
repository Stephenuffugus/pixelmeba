/**
 * Words for evolution settings, founder modes and the module registry (SPEC §8.6–§8.7, UX §2.3 and
 * §3.3; P2.2). Every number shown comes from the world's (or the preview world's) recorded state:
 * the per-daughter rates, the registry and the recorded changes. Mode labels must appear wherever a
 * world is described (UX §3.3). All numbers are fictional game units and chances, never promises.
 */
import type { CreationFounders, FounderOrigin, ModuleOrigin } from '@sim/founders';
import type { MutationRates, PresetChange } from '@sim/mutation';
import { moduleGainAttemptChance } from '@sim/mutation';
import type { RegistryInfo, SlotModes } from '@worker/protocol';
import { evolutionLabel, founderLabel } from './whatif';
import { plural } from './experiments';

export { evolutionLabel, founderLabel };

/** UX §3.3: a world whose recorded registry enables fewer modules than the full catalog. */
export const CORE_PROTOTYPE_LABEL = 'Core prototype — quantitative evolution';

export type PresetId = 'standard' | 'accelerated' | 'fixed';
export type FounderModeId = 'identical' | 'varied' | 'diverse';

/** The three evolution settings with their one-line honesty notes (UX §2.3), in offer order. */
export const PRESET_CHOICES: readonly {
  readonly id: PresetId;
  readonly label: string;
  readonly note: string;
}[] = [
  {
    id: 'standard',
    label: evolutionLabel('standard'),
    note: 'Offspring sometimes inherit a small difference. Nothing is guaranteed.',
  },
  {
    id: 'accelerated',
    label: evolutionLabel('accelerated'),
    note: 'Inherited differences are drawn more often than in Standard. Faster change for play, not how real cells work.',
  },
  {
    id: 'fixed',
    label: evolutionLabel('fixed'),
    // Only the genome is inherited unchanged; body, energy and state are not (honest labels).
    note: 'Offspring inherit their parent’s traits unchanged. Good for controlled experiments.',
  },
];

/** The three founder modes with their notes (SPEC §8.6), in offer order. */
export const FOUNDER_CHOICES: readonly {
  readonly id: FounderModeId;
  readonly label: string;
  readonly note: string;
}[] = [
  {
    id: 'identical',
    label: founderLabel('identical'),
    // What the mode does, never a claim about every founder: a recipe may give its founders an ability.
    note: 'Founders start with the same neutral traits (50). This mode gives them no extra abilities.',
  },
  {
    id: 'varied',
    label: founderLabel('varied'),
    note: 'Each founder’s active traits start a little apart, from 45 to 55, set by the seed. This mode gives them no extra abilities.',
  },
  {
    id: 'diverse',
    label: founderLabel('diverse'),
    // Only founders placed at 0:00 draw an ability (founders.ts atCreation), so "present at creation" stays true.
    note: 'Varied, and each founder placed at 0:00 that could carry an extra ability has a 1 in 10 chance to start with one — present at creation, not evolved here. Life added later gets varied traits only.',
  },
];

export function founderNote(mode: string): string {
  return FOUNDER_CHOICES.find((c) => c.id === mode)?.note ?? '';
}

/** A saved dish's mode labels (Saved dishes, Continue, the Save sheet), or null when the slot did not record them. */
export function slotModesLine(m: SlotModes | undefined): string | null {
  return m ? worldModesLine(m.mutationPreset, m.founderMode, { partial: m.partial === true }) : null;
}

/** The toast after an evolution-setting change (short, so it fits one line at 200 % text). */
export function presetChangedToast(preset: string): string {
  return `Now ${evolutionLabel(preset)}. Undo rewinds it.`;
}

/**
 * What the founders the dish was made with carried (the Evolution sheet), from the recorded lineage:
 * the founder mode's note says what the mode does; this says what this dish's founders actually had,
 * including abilities a recipe gave them (present at creation).
 */
export function creationFoundersText(
  c: CreationFounders | undefined,
  speciesName: (index: number) => string,
  moduleName: (id: string) => string,
): string {
  if (!c) return '';
  if (!c.complete)
    return 'The records of the founders this dish was made with were summarized, so what they carried is no longer listed.';
  if (c.rows.length === 0) return 'No founders were placed at 0:00.';
  const seeded = c.rows.filter((r) => r.withModule > 0);
  if (seeded.length === 0) return 'None of the founders placed at 0:00 carried an extra ability.';
  const parts = seeded.map((r) => {
    const name = speciesName(r.species);
    const of = `${r.withModule} of ${r.count} ${r.count === 1 ? name : plural(name)}`;
    const only = r.modules.length === 1 && r.modules[0]!.count === r.withModule;
    return only
      ? `${of} carried ${moduleName(r.modules[0]!.id)}`
      : `${of} carried extra abilities (${r.modules.map((m) => `${m.count} with ${moduleName(m.id)}`).join(', ')})`;
  });
  return `Present at creation: ${listText(parts)}.`;
}

function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join('; ')}; and ${items[items.length - 1]}`;
}

/** Hundredths of a game unit, so every displayed amount is exactly the value the sums use. */
function cents(v: number): number {
  return Math.round(v * 100);
}

function fromCents(c: number): string {
  return (c / 100).toFixed(2);
}

/**
 * New Dish's start ledger in words (UX §2.3 "the total initial ledger"): every amount to 0.01, and the
 * carbon total is the sum of the two parts as shown, so the sentence adds up as displayed.
 */
export function startLedgerText(l: {
  readonly habitat: { readonly c: number };
  readonly added: { readonly c: number };
  readonly total: { readonly n: number; readonly m: number };
}): string {
  const h = cents(l.habitat.c);
  const a = cents(l.added.c);
  return `At the start the dish holds ${fromCents(h + a)} carbon, ${fromCents(cents(l.total.n))} nutrient and ${fromCents(cents(l.total.m))} mineral (game units, to 0.01): the habitat’s own ${fromCents(h)} carbon plus ${fromCents(a)} added with the food and founders.`;
}

/** "Standard Evolution · Varied founders · Core prototype — quantitative evolution" (UX §3.3). */
export function worldModesLine(
  preset: string,
  founderMode: string,
  registry: Pick<RegistryInfo, 'partial'> | null | undefined,
): string {
  const parts = [evolutionLabel(preset), founderLabel(founderMode)];
  if (registry?.partial) parts.push(CORE_PROTOTYPE_LABEL);
  return parts.join(' · ');
}

/** A chance as the panel shows it: "8 %", "0.2 %", "0 %". */
export function percent(p: number): string {
  const v = p * 100;
  const s = Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)));
  return `${s} %`;
}

export interface RateRow {
  readonly key: keyof MutationRates;
  readonly label: string;
  readonly detail: string;
  readonly value: string;
}

/** The per-daughter rates as rows (SPEC §8.3 order: quantitative → preference → module → developmental). */
export function rateRows(rates: MutationRates, developmentalEnabled: boolean): RateRow[] {
  return [
    {
      key: 'quantitative',
      label: 'Trait change',
      detail: 'one active trait moves by 2 (or sometimes 5)',
      value: percent(rates.quantitative),
    },
    {
      key: 'preference',
      label: 'Food preference shift',
      detail: 'only for organisms that eat two or more foods',
      value: percent(rates.preference),
    },
    {
      key: 'module',
      label: 'Extra ability gained or lost',
      detail: 'half the time a gain, half a loss, only where legal',
      value: percent(rates.module),
    },
    {
      key: 'developmental',
      label: 'Body plan or behavior change',
      detail: developmentalEnabled ? 'developmental changes' : 'not part of this version',
      value: developmentalEnabled ? percent(rates.developmental) : '—',
    },
  ];
}

export const RATES_PER_BIRTH =
  'Chances for each offspring, drawn once when it is set up to be born. Playing at 2× or 4× runs more time each second; it never changes these chances.';

/** SPEC §8.7 pacing statement for the given rates (an attempt is not a surviving branch). */
export function pacingText(rates: MutationRates): string {
  if (rates.quantitative === 0 && rates.preference === 0 && rates.module === 0)
    return 'Offspring never change at this setting.';
  const p = Math.round(moduleGainAttemptChance(rates, 1000) * 100);
  return `Out of 1,000 offspring that could gain an extra ability, the chance that at least one tries is about ${p} %. A try is not a lasting new branch, and nothing is promised in a fixed time.`;
}

/** Simulated time mm:ss (h:mm:ss when needed), as the top strip shows it. */
export function simTime(tick: number): string {
  const s = Math.floor(tick / 10);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}

/** One recorded change, for the Advanced panel and History's "What happened". */
export function presetChangeText(c: PresetChange): string {
  return c.from
    ? `Evolution changed from ${evolutionLabel(c.from)} to ${evolutionLabel(c.to)}.`
    : `Evolution changed to ${evolutionLabel(c.to)}.`;
}

/** The recorded registry in one line: "Registry v1 · Starch release (E01), … — 3 of 17 abilities". */
export function registryLine(r: RegistryInfo): string {
  const list =
    r.modules.length > 0 ? r.modules.map((m) => `${m.name} (${m.id})`).join(', ') : 'no extra abilities';
  return `Module registry version ${r.moduleRegistryVersion}: ${list} — ${r.modules.length} of ${r.catalogSize} abilities.`;
}

/** How an organism came to carry one module (inspector; from recorded lineage only). */
export function moduleSourceText(o: ModuleOrigin, origin: FounderOrigin, birthId: number): string {
  switch (o.source) {
    case 'creation':
      return 'Present at creation.';
    case 'inherited-creation':
      return `Inherited from its founder #${origin.founderBirthId}, which had it at creation.`;
    case 'mutation':
      return o.gainedAtBirth === birthId
        ? 'Gained by a mutation when it was born.'
        : `Gained by a mutation in its family (at the birth of #${o.gainedAtBirth ?? '?'}).`;
    case 'introduced':
      return origin.generationsFromFounder === 0
        ? 'It already carried it when it was added to the dish.'
        : 'Its founder already carried it when it was added to the dish.';
    default:
      return 'Where it came from is no longer recorded (older family records were summarized).';
  }
}

/** One line about starting differences, or null (neutral founders; unknown history). */
export function founderStartText(origin: FounderOrigin): string | null {
  const self = origin.generationsFromFounder === 0;
  switch (origin.founderStart) {
    case 'varied':
      return self
        ? 'Its traits were set a little apart from 50 when it was added (varied founders); they did not evolve here.'
        : `Its founder #${origin.founderBirthId} started with traits a little apart from 50 (varied founders), so not every difference from 50 evolved here.`;
    case 'carried':
      return self
        ? 'It was added already carrying these traits (for example as a saved specimen); their differences from 50 did not evolve in this dish.'
        : `Its founder #${origin.founderBirthId} was added already carrying different traits (for example as a saved specimen), so not every difference from 50 evolved in this dish.`;
    default:
      return null;
  }
}
