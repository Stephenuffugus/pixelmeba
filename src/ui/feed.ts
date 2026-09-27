/**
 * Event feed (SPEC §12.3): repeated events are coalesced per type, species and cause over 5 simulated
 * seconds. Text is generated from recorded events only.
 */
import { signal } from '@preact/signals';
import type { VisualEvent } from '@worker/protocol';
import { reasonText } from './strings/reasons';

export interface FeedLine {
  readonly key: string;
  readonly tick: number;
  readonly text: string;
  count: number;
}

export const feed = signal<readonly FeedLine[]>([]);
const WINDOW = 50;
const MAX_LINES = 60;

function describe(ev: VisualEvent, name: string, n: number): string {
  const s = n === 1 ? '' : 's';
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

export function pushFeed(events: readonly VisualEvent[], speciesNames: readonly string[]): void {
  if (events.length === 0) return;
  const lines = [...feed.value];
  for (const ev of events) {
    const name = speciesNames[ev.species] ?? 'organism';
    const key = `${ev.type}:${ev.species}:${ev.cause ?? ''}`;
    const last = lines.find((l) => l.key === key && ev.tick - l.tick < WINDOW);
    if (last) {
      last.count++;
      (last as { text: string }).text = describe(ev, name, last.count);
    } else {
      lines.unshift({ key, tick: ev.tick, text: describe(ev, name, 1), count: 1 });
    }
  }
  feed.value = lines.slice(0, MAX_LINES);
}

export function clearFeed(): void {
  feed.value = [];
}
