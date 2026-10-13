/**
 * Cell furnishings and devices (SPEC §2.5, §10.4; CT §4, §14; Phase 5 foundation, world schema 5;
 * D-0102, D-0106). PURE: the store's types, its constants and the import validator. No stage reads it
 * yet; the climate, resin and placement code of later waves imports this module. Nothing here draws
 * randomness or reads any stage 2–12 module.
 *
 * world.devices is sorted by cell with at most one furnishing or device per cell (CT §4). Furnishings
 * and devices share the one cap of 256 (D-0106). Ids share one space with edge barriers
 * (world.counters.nextDeviceId), so a gate tally or a GateReading names one structure unambiguously.
 * A basket (S07) holds whichever food object sits on its cell (objects.ts allows one object per cell),
 * so it stores no reference.
 */
import { DEVICE_CAP } from './constants';
import { cellInDish } from './barriers';
import { ST_NONE, type Grid } from './grid';

export const DEVICE_KINDS = ['S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];
/** CT §4 "cell furnishing": shelter, mesh, basket, shade roof, wick. */
export const FURNISHING_KINDS: readonly DeviceKind[] = ['S05', 'S06', 'S07', 'S11', 'S12'];
/** CT §4 "cell device": resin, heater, cooler. */
export const MACHINE_KINDS: readonly DeviceKind[] = ['S08', 'S09', 'S10'];
/** Kinds CT §4 calls "toggle": they carry `on` (false at placement: SPEC §10.4 "devices start Off"). */
export const TOGGLED_KINDS: readonly DeviceKind[] = ['S09', 'S10'];

/** What an adsorption resin (S08) may remove, in this (sorted) order (CT §4: inhibitors and RIVAL). */
export const RESIN_TARGETS = ['inhBact', 'inhFung', 'inhPhoto', 'rival'] as const;
export type ResinTarget = (typeof RESIN_TARGETS)[number];
/** Activity units one resin binds before it is saturated (CT §4 "capacity 5"). */
export const RESIN_CAPACITY = 5;

export interface Device {
  readonly id: number;
  readonly kind: DeviceKind;
  /**
   * Mutable (a device can be moved). A writer that changes it in place must bump grid.geometryVersion:
   * edgePassage.ts and attachment.ts cache per-cell views on that version and the store's identity and
   * length (climate.ts's caches compare content instead; `on` is read afresh every tick).
   */
  cell: number;
  /** S09/S10 only (required there): on or off. */
  on?: boolean;
  /** S08 only (required there): what it removes, sorted and unique; [] = Off (as placed). */
  resinSelect?: ResinTarget[];
  /** S08 only (optional): activity units bound so far per target; their sum is at most RESIN_CAPACITY. */
  bound?: Partial<Record<ResinTarget, number>>;
}

/** A sorted copy (by cell). */
export function sortDevices(devices: readonly Device[]): Device[] {
  return [...devices].sort((a, b) => a.cell - b.cell);
}

const DEVICE_KEYS = ['id', 'kind', 'cell', 'on', 'resinSelect', 'bound'];

/**
 * The first problem with a device store (untrusted) on a dish's grid, as a player-facing sentence, or
 * null. `enabledStructures` is the dish's recorded list. A furnishing or device sits on open water, gel
 * or sediment: never on a stone, wall or bead cell.
 */
export function deviceStoreProblem(devices: unknown, grid: Pick<Grid, 'structure'>, opts: { readonly enabledStructures: readonly string[] }): string | null {
  if (!Array.isArray(devices)) return 'The devices are not a list.';
  if (devices.length > DEVICE_CAP) return `The dish has more than ${DEVICE_CAP} furnishings and devices.`;
  let lastCell = -1;
  for (const raw of devices as unknown[]) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'A device is not a record.';
    const d = raw as Record<string, unknown>;
    for (const k of Object.keys(d)) if (!DEVICE_KEYS.includes(k)) return `A device has an unknown setting "${k}".`;
    if (!Number.isInteger(d.id) || (d.id as number) < 1) return 'A device has an invalid identity.';
    if (typeof d.kind !== 'string' || !(DEVICE_KINDS as readonly string[]).includes(d.kind)) return `A device is of an unknown kind ${JSON.stringify(d.kind)}.`;
    if (!opts.enabledStructures.includes(d.kind)) return `A device is of kind ${d.kind}, which this dish's rules do not include.`;
    const cell = d.cell;
    if (!cellInDish(cell)) return 'A device lies outside the dish.';
    if (grid.structure[cell] !== ST_NONE) return 'A device sits on a stone, wall or bead.';
    if (cell === lastCell) return 'Two devices share one cell.';
    if (cell < lastCell) return 'The devices are out of order.';
    lastCell = cell;
    const kind = d.kind as DeviceKind;
    if (TOGGLED_KINDS.includes(kind)) {
      if (typeof d.on !== 'boolean') return `A device of kind ${kind} is neither on nor off.`;
    } else if (d.on !== undefined) return `A device of kind ${kind} has an on/off setting.`;
    if (kind === 'S08') {
      const sel = d.resinSelect;
      if (!Array.isArray(sel)) return 'An adsorption resin has no selection.';
      for (let k = 0; k < sel.length; k++) {
        const t: unknown = sel[k];
        if (typeof t !== 'string' || !(RESIN_TARGETS as readonly string[]).includes(t)) return `An adsorption resin selects an unknown target ${JSON.stringify(t)}.`;
        if (k > 0 && !(RESIN_TARGETS.indexOf(sel[k - 1] as ResinTarget) < RESIN_TARGETS.indexOf(t as ResinTarget))) return "An adsorption resin's selection is repeated or out of order.";
      }
      if (d.bound !== undefined) {
        if (typeof d.bound !== 'object' || d.bound === null || Array.isArray(d.bound)) return "An adsorption resin's bound amounts are not a record.";
        const bound = d.bound as Record<string, unknown>;
        for (const t of Object.keys(bound)) if (!(RESIN_TARGETS as readonly string[]).includes(t)) return `An adsorption resin holds an unknown target "${t}".`;
        let sum = 0; // summed in RESIN_TARGETS order, never in key order
        for (const t of RESIN_TARGETS) {
          const v = bound[t];
          if (v === undefined) continue;
          if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 'An adsorption resin holds an invalid amount.';
          sum += v;
        }
        if (sum > RESIN_CAPACITY + 1e-9) return `An adsorption resin holds more than its capacity of ${RESIN_CAPACITY}.`;
      }
    } else {
      if (d.resinSelect !== undefined) return `A device of kind ${kind} has a resin selection.`;
      if (d.bound !== undefined) return `A device of kind ${kind} holds resin amounts.`;
    }
  }
  return null;
}
