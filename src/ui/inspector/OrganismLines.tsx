/**
 * The organism inspector's Phase 5 lines (wave 13 org-ui; SPEC §12.1-§12.2; UX §5.1-§5.2; D-0124): a trap and
 * its store, a held organism, a handler and its prey, a mixotroph's mode, the mineral jacket, the sensed signal
 * and glow, what a Phase 5 emitter released, and rivalry chemical on a target. Each line is one optional
 * EntityInspect field (src/worker/snapshot.ts phase5Lines) in Explore or Lab words (strings/organisms.ts); every
 * field is absent on a v1.0 organism, so nothing here shows in a v1.0 dish.
 */
import type { EntityInspect } from '@worker/protocol';
import {
  beingHandledLines,
  handlingLine,
  heldLine,
  jacketLine,
  modeLine,
  rivalLine,
  secretionLines,
  signalLines,
  trapLines,
  type View,
} from '../strings/organisms';

/** The lines in display order, each with its test id (pure; tests/ui/inspector-p5.test.ts). */
export function organismLines(e: EntityInspect, view: View, names: readonly string[]): { readonly id: string; readonly text: string }[] {
  const out: { id: string; text: string }[] = [];
  if (e.heldBy) out.push({ id: 'held', text: heldLine(e.heldBy, view, names) });
  if (e.beingHandled && e.beingHandled.length > 0) for (const t of beingHandledLines(e.beingHandled, view, names)) out.push({ id: 'being-handled', text: t });
  if (e.handling) out.push({ id: 'handling', text: handlingLine(e.handling, view) });
  if (e.trap) for (const t of trapLines(e.trap, view, names)) out.push({ id: 'trap', text: t });
  if (e.signal) for (const t of signalLines(e.signal, view)) out.push({ id: 'signal', text: t });
  if (e.mode) out.push({ id: 'mode', text: modeLine(e.mode, view) });
  if (e.jacket) out.push({ id: 'jacket', text: jacketLine(e.jacket, view) });
  if (e.secretion) for (const t of secretionLines(e.secretion, e.lifeState)) out.push({ id: 'secretion', text: t });
  if (e.rival) out.push({ id: 'rival', text: rivalLine(e.rival, view) });
  return out;
}

export function OrganismLines({ e, view, names }: { e: EntityInspect; view: View; names: readonly string[] }) {
  const lines = organismLines(e, view, names);
  if (lines.length === 0) return null;
  return (
    <section aria-label="Its state now" data-testid="organism-p5">
      {lines.map((l, k) => (
        <p key={`${l.id}-${k}`} class="inspector-line" data-testid={`p5-${l.id}`}>
          {l.text}
        </p>
      ))}
    </section>
  );
}
