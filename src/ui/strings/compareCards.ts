/**
 * Saved comparison result cards in the Notebook (G2 comprehension M1; SPEC §13.4, UX §5.6). One line
 * per card, from what the card itself recorded when it was saved: the dish and its moment, the change on
 * B, how long both copies ran, the headline difference (organisms alive in A and B) and the player's
 * conclusion. Nothing is recomputed; a card missing a field reads without it.
 */
import type { CompareCard } from '../state';
import { clock, CONCLUSIONS, fmt, fmtDiff } from '../panels/CompareText';

/** A stored card that has the fields a line needs (cards are read back from this device's storage). */
export function isListableCard(c: unknown): c is CompareCard {
  if (!c || typeof c !== 'object') return false;
  const k = c as Partial<CompareCard>;
  return (
    typeof k.savedAt === 'string' &&
    typeof k.dishName === 'string' &&
    typeof k.change === 'string' &&
    typeof k.baselineTick === 'number' &&
    typeof k.ticks === 'number' &&
    Array.isArray(k.rows)
  );
}

export function conclusionLabel(id: string | null | undefined): string | null {
  return CONCLUSIONS.find((k) => k.id === id)?.label ?? null;
}

/** "Organisms alive: A 168, B 173 (+5)", from the card's recorded row; null when it has none. */
export function headlineDifference(c: CompareCard): string | null {
  const row = c.rows.find((r) => r.key === 'alive');
  if (!row || typeof row.a !== 'number' || typeof row.b !== 'number' || typeof row.diff !== 'number') return null;
  return `Organisms alive: A ${fmt(row.a, 'alive')}, B ${fmt(row.b, 'alive')} (${fmtDiff(row.diff, 'alive')})`;
}

/**
 * "“Little Living Garden” at 0:54 · B: Sugar, 0.1 per cell on 24 cells · both ran 1:00 · Organisms
 * alive: A 168, B 173 (+5) · Your conclusion: Supports my prediction".
 */
export function compareCardLine(c: CompareCard): string {
  const parts = [`“${c.dishName}” at ${clock(c.baselineTick)}`, `B: ${c.change}`, `both ran ${clock(c.ticks)}`];
  const head = headlineDifference(c);
  if (head) parts.push(head);
  const conclusion = conclusionLabel(c.conclusion);
  parts.push(conclusion ? `Your conclusion: ${conclusion}` : 'No conclusion chosen');
  return parts.join(' · ');
}
