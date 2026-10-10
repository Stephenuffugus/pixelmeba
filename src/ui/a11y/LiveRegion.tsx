/**
 * The one always-mounted polite live region (UX §9; P3.11 W6-07). It reads out the one-line result the
 * app shows as a toast (placement accepted with its count, saved, undone, refusals), on every screen.
 * The visible toasts carry no role or aria-live of their own, so nothing is announced twice. Cards
 * and panels keep their own sr-only statuses (the Lab view switch, the discovery card).
 */
import { toast } from '../state';

export function LiveRegion() {
  return (
    <div class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="live-region">
      {toast.value ?? ''}
    </div>
  );
}
