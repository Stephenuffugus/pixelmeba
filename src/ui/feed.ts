/**
 * Event feed (SPEC §12.3): repeated events are coalesced per type, species and cause over 5 simulated
 * seconds. Text is generated from recorded events only.
 */
import { signal } from '@preact/signals';
import { MUT_DEV, MUT_MODULE_GAIN, MUT_MODULE_LOSS, MUT_POLICY_ESTABLISHED, MUT_PREF, MUT_QUANT } from '@sim/mutation';
import type { VisualEvent } from '@worker/protocol';
import { reasonText } from './strings/reasons';

export interface FeedLine {
  readonly key: string;
  readonly tick: number;
  readonly text: string;
  /** Species index the events belong to, or -1 for dish-wide events (e.g. starch became sugar). */
  readonly species: number;
  count: number;
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

function describe(ev: VisualEvent, name: string, n: number, moduleName: ModuleNameOf): string {
  const s = n === 1 ? '' : 's';
  const change = moduleChangeOf(ev);
  if (change) return moduleLine(change, name, n, moduleName);
  switch (ev.type) {
    case 'birth':
      return n === 1 ? `A ${name} split in two.` : `${n} ${name} divisions.`;
    case 'death':
      return `${n} ${name}${s} died — ${reasonText(ev.cause ?? 0, 'explore').replace(/\.$/, '').toLowerCase()}.`;
    case 'introduce':
      return `${n} ${name}${s} added.`;
    case 'capture':
      return n === 1 ? `A ${name} caught its prey.` : `${name}s caught prey ${n} times.`;
    case 'mutation':
      return n === 1 ? `A ${name} offspring inherited a different trait.` : `${n} ${name} offspring inherited different traits.`;
    case 'branchEstablished':
      return `A new ${name} branch was established.`;
    case 'branchExtinct':
      return `A ${name} branch has no members left.`;
    case 'conversion':
      return 'Starch became sugar.';
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
    if (last) {
      last.count++;
      (last as { text: string }).text = describe(ev, name, last.count, moduleName);
    } else {
      lines.unshift({ key, tick: ev.tick, text: describe(ev, name, 1, moduleName), species: ev.species, count: 1 });
    }
  }
  feed.value = lines.slice(0, MAX_LINES);
}

export function clearFeed(): void {
  feed.value = [];
}
