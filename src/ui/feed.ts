/**
 * Event feed (SPEC §12.3): repeated events are coalesced per type, species and cause over 5 simulated
 * seconds. Text is generated from recorded events only.
 */
import { signal } from '@preact/signals';
import { MUT_DEV, MUT_MODULE_GAIN, MUT_MODULE_LOSS, MUT_POLICY_ESTABLISHED, MUT_PREF, MUT_QUANT } from '@sim/mutation';
import { reasonName, type ReasonName } from '@sim/reasons';
import type { VisualEvent } from '@worker/protocol';
import { reasonText } from './strings/reasons';
import { locusName } from './strings/inherited';

export interface FeedLine {
  readonly key: string;
  readonly tick: number;
  readonly text: string;
  /** Species index the events belong to, or -1 for dish-wide events (e.g. starch became sugar). */
  readonly species: number;
  count: number;
  /**
   * A coalesced inherited-change line (G2 comprehension M2): each birth's recorded change in words
   * ("Division 50 → 48"), or null when its birth record carried no trait values (another kind of change).
   */
  details?: (string | null)[];
}

export const feed = signal<readonly FeedLine[]>([]);
const WINDOW = 50;
const MAX_LINES = 60;

/** The name of a module of the open dish's recorded content by id (DishInfo.registry), if known. */
export type ModuleNameOf = (id: string) => string | undefined;

/**
 * A module gained or lost at a birth, read from its recorded mutation descriptor (D-0034 label ruling),
 * or null when the birth changed no module. `other`: the same birth also inherited another change (a
 * trait value, a food preference or mixing by weight; the birth record's rules, deltaText).
 */
export function moduleChangeOf(ev: VisualEvent): { readonly gained: boolean; readonly id: string; readonly other: boolean } | null {
  const m = ev.mutation;
  if (ev.type !== 'mutation' || !m || m.module === null) return null;
  const gained = (m.flags & MUT_MODULE_GAIN) !== 0;
  if (gained === ((m.flags & MUT_MODULE_LOSS) !== 0)) return null;
  return { gained, id: m.module, other: (m.flags & (MUT_QUANT | MUT_PREF | MUT_POLICY_ESTABLISHED | MUT_DEV)) !== 0 };
}

/**
 * "A Sunbead offspring gained Reserve chamber." / "3 Sunbead offspring lost Reserve chamber." — the
 * ability by its content name (its id only when the name is unknown), never the generic trait line.
 */
function moduleLine(change: { readonly gained: boolean; readonly id: string; readonly other: boolean }, name: string, n: number, moduleName: ModuleNameOf): string {
  const ability = moduleName(change.id) ?? change.id;
  const who = n === 1 ? `A ${name} offspring` : `${n} ${name} offspring`;
  const also = change.other ? (n === 1 ? ' and inherited a different trait' : ' and inherited different traits') : '';
  return `${who} ${change.gained ? 'gained' : 'lost'} ${ability}${also}.`;
}

/** Death causes for several organisms at once (m11: "2 Sprinters died — they ran out of energy."). */
const DEATH_PLURAL: Partial<Record<ReasonName, string>> = {
  DEATH_STARVATION: 'they ran out of energy',
  DEATH_STRESS: 'the conditions were too harsh',
  DEATH_INHIBITOR: 'something in the water harmed them',
  DEATH_AGE: 'they reached the end of their lives',
  DEATH_PREDATION: 'they were eaten',
  DEATH_LYSIS: 'a virus burst them',
  DEATH_PARASITE_DRAIN: 'a parasite drained them',
  DEATH_TRAP_DRAIN: 'a trap drained them',
  REMOVED_SAMPLED: 'they were moved with the sample tool',
};

function deathLine(name: string, n: number, cause: number): string {
  if (n === 1) return `A ${name} died — ${lowerFirst(reasonText(cause, 'explore').replace(/\.$/, ''))}.`;
  const plural = DEATH_PLURAL[reasonName(cause)];
  return `${n} ${name}s died — ${plural ?? lowerFirst(reasonText(cause, 'explore').replace(/\.$/, ''))}.`;
}

function lowerFirst(t: string): string {
  return t.charAt(0).toLowerCase() + t.slice(1);
}

/** One birth's recorded quantitative change ("Division 50 → 48"), or null when its values were not sent. */
function quantDetail(ev: VisualEvent): string | null {
  const m = ev.mutation;
  if (!m || (m.flags & MUT_QUANT) === 0 || m.locus === undefined || m.from === undefined || m.to === undefined) return null;
  return `${locusName(m.locus)} ${m.from} → ${m.to}`;
}

/** Shown in a coalesced line before "and N more". */
const DETAILS_SHOWN = 4;

/**
 * An inherited change at a birth, from its recorded descriptor (M2): the trait and both values for a
 * quantitative change ("A Sprinter offspring inherited a lower Division value (parent 50 → 48)."); a
 * burst coalesces into one line listing the recorded values.
 */
function inheritedLine(ev: VisualEvent, name: string, n: number, details: readonly (string | null)[]): string {
  const m = ev.mutation;
  if (n === 1) {
    if (m && (m.flags & MUT_QUANT) !== 0 && m.locus !== undefined && m.from !== undefined && m.to !== undefined) {
      const also = m.flags & MUT_POLICY_ESTABLISHED ? ', and began mixing its foods by weight' : m.flags & MUT_PREF ? ', and a shifted food preference' : '';
      return `A ${name} offspring inherited a ${m.to < m.from ? 'lower' : 'higher'} ${locusName(m.locus)} value (parent ${m.from} → ${m.to})${also}.`;
    }
    if (m && (m.flags & MUT_QUANT) === 0 && m.flags & MUT_POLICY_ESTABLISHED) return `A ${name} offspring began mixing its foods by weight.`;
    if (m && (m.flags & MUT_QUANT) === 0 && m.flags & MUT_PREF) return `A ${name} offspring inherited a shifted food preference.`;
    return `A ${name} offspring inherited a different trait.`;
  }
  const known = details.filter((d): d is string => d !== null);
  if (known.length === 0) return `${n} ${name} offspring inherited different traits.`;
  const shown = known.slice(0, DETAILS_SHOWN);
  const more = n - shown.length;
  return `${n} ${name} offspring inherited different traits: ${shown.join('; ')}${more > 0 ? `; ${more} other change${more === 1 ? '' : 's'}` : ''}.`;
}

function describe(ev: VisualEvent, name: string, n: number, moduleName: ModuleNameOf, details: readonly (string | null)[] = []): string {
  const s = n === 1 ? '' : 's';
  const change = moduleChangeOf(ev);
  if (change) return moduleLine(change, name, n, moduleName);
  switch (ev.type) {
    case 'birth':
      return n === 1 ? `A ${name} split in two.` : `${n} ${name} divisions.`;
    case 'death':
      return deathLine(name, n, ev.cause ?? 0);
    case 'introduce':
      return `${n} ${name}${s} added.`;
    case 'capture':
      return n === 1 ? `A ${name} caught its prey.` : `${name}s caught prey ${n} times.`;
    case 'mutation':
      return inheritedLine(ev, name, n, details);
    case 'branchEstablished':
      return `A new ${name} branch was established.`;
    case 'branchExtinct':
      return `A ${name} branch has no members left.`;
    case 'conversion':
      return 'Starch became sugar.';
    case 'objectEmptied':
      // Protocol 2 (wave 2 art-features): the event type exists; wave 3 food objects passes it through.
      return n === 1 ? 'A food object ran out.' : `${n} food objects ran out.`;
  }
}

/**
 * The feed key events coalesce under: type, species and cause; a module change also by gained or lost,
 * the module and whether the birth inherited another change, so one line never mixes them.
 */
function keyOf(ev: VisualEvent): string {
  const change = moduleChangeOf(ev);
  const base = `${ev.type}:${ev.species}:${ev.cause ?? ''}`;
  return change ? `${base}:${change.gained ? 'gained' : 'lost'}:${change.id}:${change.other ? 'and' : 'only'}` : base;
}

/** `moduleName`: the open dish's recorded module names (a module change names its ability). */
export function pushFeed(events: readonly VisualEvent[], speciesNames: readonly string[], moduleName: ModuleNameOf = () => undefined): void {
  if (events.length === 0) return;
  const lines = [...feed.value];
  for (const ev of events) {
    const name = speciesNames[ev.species] ?? 'organism';
    const key = keyOf(ev);
    const last = lines.find((l) => l.key === key && ev.tick - l.tick < WINDOW);
    const inherited = ev.type === 'mutation' && moduleChangeOf(ev) === null;
    if (last) {
      last.count++;
      if (inherited) last.details = [...(last.details ?? []), quantDetail(ev)];
      (last as { text: string }).text = describe(ev, name, last.count, moduleName, last.details);
    } else {
      const details = inherited ? [quantDetail(ev)] : undefined;
      lines.unshift({ key, tick: ev.tick, text: describe(ev, name, 1, moduleName, details), species: ev.species, count: 1, ...(details ? { details } : {}) });
    }
  }
  feed.value = lines.slice(0, MAX_LINES);
}

export function clearFeed(): void {
  feed.value = [];
}
