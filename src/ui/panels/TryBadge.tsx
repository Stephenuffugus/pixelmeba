/**
 * The Try my dish badge in the top strip (P4.7): while the open dish is a turn, "Turn {n} · {m:ss} left",
 * and at its horizon "Turn {n} finished". Plain text (no role=status: the app's live region reads toasts
 * only); the horizon card is reopened from More (src/ui/panels/MoreSheet.tsx).
 */
import { meta } from '../state';
import { currentTurn } from '../tryDish';
import { TRY_TEXT } from '../strings/tryDish';

export function TryBadge() {
  const t = currentTurn.value;
  if (!t || t.state === 'finished') return null;
  const tick = meta.value?.tick ?? t.startTick;
  const left = Math.max(0, t.startTick + t.horizonTicks - tick);
  const text = t.state === 'atHorizon' || left === 0 ? TRY_TEXT.badgeDone(t.turn) : TRY_TEXT.badgeRunning(t.turn, left);
  return (
    <span class="try-badge" data-testid="try-badge">
      {text}
    </span>
  );
}
