/**
 * The S08 adsorption resin (Phase 5 wave 10 barrier-transport; SPEC §3.2 stage 2, §4.9; CT §4, §12.2;
 * D-0117). Stage 2, after the decays and filmStage, before neutralization.
 *
 * Each resin with a non-empty selection removes the selected inhibitor/RIVAL activity from its own cell
 * at no more than 0.05 units per second (× dt), shared among the selected targets in proportion to their
 * amounts, until RESIN_CAPACITY (5) units are bound in total; a saturated resin is inert. The last selected
 * target holding activity takes the exact remainder, so the removals sum to the tick's take. `bound` is
 * created lazily with its keys in RESIN_TARGETS order. Activity is not a conserved material: no ledger
 * line (the export at removal is the remove command's). A stage write: no geometryVersion bump, and no
 * cache keys on `bound`.
 *
 * Gate (D-0103): returns at once without devices or when the world does not record 'devices'.
 */
import { DT, RESIN_RATE_PER_SECOND } from './constants';
import { RESIN_CAPACITY, RESIN_TARGETS, type Device, type ResinTarget } from './devices';
import { worldHasSystem } from './gates';
import type { World } from './world';

/** Activity units one resin may remove per tick (CT §12.2 0.05/s × dt). */
const RESIN_PER_TICK = RESIN_RATE_PER_SECOND * DT;

/** Units bound so far, summed in RESIN_TARGETS order. */
export function resinBoundSum(d: Pick<Device, 'bound'>): number {
  const b = d.bound;
  if (b === undefined) return 0;
  let sum = 0;
  for (const t of RESIN_TARGETS) sum += b[t] ?? 0;
  return sum;
}

function addBound(d: Device, t: ResinTarget, amount: number): void {
  const old = d.bound;
  if (old !== undefined && old[t] !== undefined) {
    old[t] = old[t] + amount;
    return;
  }
  // A new key: rebuild the record so its keys stay in RESIN_TARGETS order.
  const next: Partial<Record<ResinTarget, number>> = {};
  for (const k of RESIN_TARGETS) {
    if (k === t) next[k] = (old?.[k] ?? 0) + amount;
    else if (old?.[k] !== undefined) next[k] = old[k];
  }
  d.bound = next;
}

/** Stage 2: every resin's adsorption. */
export function resinStep(world: World): void {
  const devices = world.devices;
  if (devices.length === 0 || !worldHasSystem(world, 'devices')) return;
  for (let k = 0; k < devices.length; k++) {
    const d = devices[k]!;
    if (d.kind !== 'S08') continue;
    const sel = d.resinSelect;
    if (sel === undefined || sel.length === 0) continue;
    const remaining = RESIN_CAPACITY - resinBoundSum(d);
    if (remaining <= 0) continue;
    const budget = RESIN_PER_TICK < remaining ? RESIN_PER_TICK : remaining;
    const cell = d.cell;
    let total = 0;
    let last = -1;
    for (let s = 0; s < sel.length; s++) {
      const arr = world.fields[sel[s]!];
      if (arr === undefined) continue;
      const a = arr[cell]!;
      if (a > 0) {
        total += a;
        last = s;
      }
    }
    if (total <= 0) continue;
    const take = budget < total ? budget : total;
    let removedSoFar = 0;
    for (let s = 0; s <= last; s++) {
      const t = sel[s]!;
      const arr = world.fields[t];
      if (arr === undefined) continue;
      const a = arr[cell]!;
      if (a <= 0) continue;
      let r = s === last ? take - removedSoFar : (take * a) / total;
      if (r > a) r = a;
      if (r <= 0) continue;
      arr[cell] = a - r;
      removedSoFar += r;
      addBound(d, t, r);
    }
  }
}
