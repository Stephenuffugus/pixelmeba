/**
 * Opening and leaving the Field Guide (UX §2: blocking panels pause and restore the prior run state on
 * close; P3.8 W5-04), and keeping the device's "seen in your dishes" record up to date (D-0039).
 *
 * Leaving the dish already pauses it (src/ui/state.ts route effect). When More opens the guide, the
 * dish and its speed are recorded, as New Dish's return is (AdvancedEvolution.tsx newDishReturn); the
 * guide's Back returns to that dish at that speed. Opened from Home, Back returns Home.
 */
import { useEffect } from 'preact/hooks';
import type { Speed } from '@worker/protocol';
import { dishInfo, getClient, meta, route, setSpeed, sheet } from '../state';
import { recordRelationships } from '../badges';

/** The dish the guide was opened from, and the speed it was running at; null when opened from Home. */
export const guideReturn: { current: { readonly dishId: string; readonly speed: number } | null } = { current: null };

/** More → Field Guide: remember the open dish and its speed, then open the guide (leaving pauses the dish). */
export function openGuideFromDish(): void {
  const info = dishInfo.value;
  guideReturn.current = info ? { dishId: info.dishId, speed: meta.value?.speed ?? 0 } : null;
  sheet.value = 'none';
  route.value = { name: 'guide' };
}

/** Back: to the dish the guide was opened from, running again at its speed if it was running; else Home. */
export function guideBack(): void {
  const from = guideReturn.current;
  guideReturn.current = null;
  const open = dishInfo.value;
  if (from && open && open.dishId === from.dishId) {
    route.value = { name: 'dish' };
    if (from.speed > 0) setSpeed(from.speed as Speed);
    return;
  }
  route.value = { name: 'home' };
}

/** Ask the worker what the open dish has shown so far and merge it into the device record. Never throws. */
export async function syncRelationships(): Promise<void> {
  const info = dishInfo.value;
  if (!info) return;
  try {
    const r = await getClient().relationships(info.dishId);
    recordRelationships(r);
  } catch {
    // The record is a convenience: a refused request or storage leaves the dish and the guide as they are.
  }
}

/** Every 2 s while a dish screen is shown, and once when it is left, merge what the dish has shown. */
export function RelationshipSync() {
  const name = route.value.name;
  const dishId = dishInfo.value?.dishId ?? null;
  useEffect(() => {
    if (name !== 'dish' || dishId === null) return;
    const t = setInterval(() => void syncRelationships(), 2000);
    return () => {
      clearInterval(t);
      void syncRelationships();
    };
  }, [name, dishId]);
  return null;
}
