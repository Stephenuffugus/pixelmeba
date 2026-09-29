/**
 * D-0033: before an action that replaces the open dish, say truthfully what will happen to it — or,
 * with no dish open, to the dish Continue holds (fix round 1) — from the worker's keep step (the same
 * plan the action then follows). Used where the screen already explains the action: New Dish and an
 * experiment card. Nothing is said when there is nothing to keep.
 */
import { useEffect, useState } from 'preact/hooks';
import type { WhatIfPlan } from '@worker/protocol';
import { dishInfo, keepPlanNow } from '../state';
import { keepPlanText, type KeepVerb } from '../strings/keep';

/** The worker's plan for the open dish (or the dish Continue holds), read again whenever the open dish changes. */
export function useKeepPlan(): { readonly plan: WhatIfPlan | null; readonly loading: boolean } {
  const key = dishInfo.value?.dishId ?? '';
  const [got, setGot] = useState<{ readonly key: string; readonly plan: WhatIfPlan | null } | null>(null);
  useEffect(() => {
    let live = true;
    void keepPlanNow().then((plan) => {
      if (live) setGot({ key, plan });
    });
    return () => {
      live = false;
    };
  }, [key]);
  const ready = got !== null && got.key === key;
  return { plan: ready ? got.plan : null, loading: !ready };
}

/**
 * The sentence for `verb` ('' when nothing will be kept). While the plan is read, an open dish is named
 * ("Checking how … is kept"); a plan that could not be read falls back to the rule itself.
 */
export function useKeepPlanText(verb: KeepVerb): string {
  const { plan, loading } = useKeepPlan();
  const open = dishInfo.value;
  if (loading) return open ? `Checking how “${open.name}” is kept first…` : '';
  if (plan) return keepPlanText(plan, verb);
  return open ? `“${open.name}” is kept first: in the save slot it came from, else the first empty one, and in Continue.` : '';
}

/** The plan as one short paragraph (polite live region: it can arrive a moment after the page). */
export function KeepPlanLine(props: { readonly verb: KeepVerb; readonly class: string; readonly testId: string }) {
  const text = useKeepPlanText(props.verb);
  return (
    <p class={props.class} data-testid={props.testId} aria-live="polite" hidden={text === ''}>
      {text}
    </p>
  );
}
