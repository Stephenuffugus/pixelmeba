/**
 * Import checks for world schema 5 state (SPEC §14.3; Phase 5 foundation, D-0102, D-0103, D-0106).
 *
 * phase5StateProblem() runs inside parseSaveFile after the schema 4 checks (phase3StateProblem), on the
 * migrated state, before any world is built. It refuses Phase 5 state that the dish's own recorded rules
 * could never have produced: edge barriers, devices, local climate or a light cycle in a dish that does not
 * record their system; malformed stores; and organism columns (glow, metabolic mode, trap, held, handling,
 * the resting-newborn flag) on organisms without the ability that writes them. Each refusal is a
 * player-facing sentence; the caller appends "Nothing was loaded.".
 *
 * Nothing in the shipped content or the v1.0 corpus uses a light cycle, drying or any Phase 5 store (CT §8.1),
 * so these refusals reject nothing a real save holds.
 */
import { CELL_COUNT, CHANNEL_ORGANISM_TICKS } from '@sim/constants';
import { edgeStoreProblem } from '@sim/barriers';
import { deviceStoreProblem } from '@sim/devices';
import { emptyValueOf, FLAG, LIFE_ACTIVE, type ColumnName } from '@sim/entities';
import { isFieldId } from '@sim/fields';
import { base64ToBytes } from '@sim/hash';
import { decodeSample } from '@sim/sampleSlot';
import { COLUMNS_ADDED_IN, type WorldState } from '@sim/serialize';

/** What the check needs to know about the dish (all from its own recorded content). */
export interface Phase5CheckContext {
  readonly species: readonly { readonly nativeAbilities: readonly string[] }[];
  readonly genomes: readonly { readonly modules: readonly string[] }[];
  readonly modules: readonly { readonly id: string }[];
  readonly systems: readonly string[];
  readonly enabledStructures: readonly string[];
}

const TRAP_COLUMNS = ['trapReserveC', 'trapReserveN', 'trapSlot', 'trapBirthId', 'trapTimer', 'trapCooldown'] as const satisfies readonly ColumnName[];

type Row = (name: ColumnName) => number;

/**
 * The first problem with one organism's schema 5 columns (a living slot or a held sample row), checked
 * against its species' abilities and its genome's modules, or null. Pair references are checked by the caller.
 */
function organismProblem(get: Row, ctx: Phase5CheckContext): string | null {
  const sp = ctx.species[get('species')];
  const genome = ctx.genomes[get('genome')];
  if (!sp || !genome) return null; // refused earlier (unknown species or genome)
  const has = (a: string) => sp.nativeAbilities.includes(a);
  const glowState = get('glowState');
  if (glowState !== 0 && glowState !== 1) return 'An organism has an unknown glow state.';
  const glowDwell = get('glowDwell');
  if (glowDwell < 0) return "An organism's glow timer is negative.";
  if ((glowState !== 0 || glowDwell !== 0) && !has('SIGNAL_GLOW') && !genome.modules.includes('E02')) return 'An organism is glowing although it cannot glow.';
  // Glow is off in any non-Active state (D-0106).
  if (glowState === 1 && get('lifeState') !== LIFE_ACTIVE) return 'An organism is glowing although it is not active.';
  const mode = get('metabolicMode');
  if (mode !== 0 && mode !== 1 && mode !== 2) return 'An organism has an unknown feeding mode.';
  if (mode !== 0 && !has('MIXOTROPHY')) return 'An organism has a feeding mode although it cannot switch modes.';
  for (const name of TRAP_COLUMNS) {
    if (get(name) !== emptyValueOf(name) && !has('TRAP')) return 'An organism has trap state although it cannot trap.';
  }
  for (const name of ['trapReserveC', 'trapReserveN', 'trapTimer', 'trapCooldown'] as const) {
    if (get(name) < 0) return `An organism's trap ${name === 'trapTimer' ? 'hold time' : name === 'trapCooldown' ? 'wait' : 'reserve'} is negative.`;
  }
  // computeTotals and sampleTotals do not count a trap reserve yet: e3-traps adds it to both and replaces this rule (D-0108).
  if (get('trapReserveC') !== 0 || get('trapReserveN') !== 0) return 'A trap holds a food reserve that this version does not count yet.';
  if (get('trapSlot') < -1 || (get('trapSlot') === -1 && get('trapBirthId') !== 0)) return 'A trap names an organism it does not hold.';
  if (get('heldBySlot') < -1 || (get('heldBySlot') === -1 && get('heldByBirthId') !== 0)) return 'An organism names a trap that does not hold it.';
  const need = get('handlingNeed');
  if (need < 0) return "An organism's handling time is negative.";
  if (need !== 0 && !has('HANDLING')) return 'An organism is handling prey although it has no handling ability.';
  // Handling progress (Phase 5 wave 12; src/sim/handling.ts): written only by a HANDLING predator's attempt,
  // and zeroed with the need when it ends, so at a tick boundary need > 0 means 0 < progress < need and
  // need 0 means progress 0. No v1.0 code writes handlingProgress, so no real save holds anything else. A
  // stale target reference is legal (a later-stage death), so the prey is not checked here.
  const progress = get('handlingProgress');
  if (progress < 0) return "An organism's handling progress is negative.";
  if (progress !== 0 && !has('HANDLING')) return 'An organism is handling prey although it has no handling ability.';
  if (need === 0 && progress !== 0) return "An organism's handling has no attempt.";
  if (need > 0 && progress >= need) return "An organism's handling is already complete.";
  // Shell and jacket mineral (wave 10 lead fixes). boundMineral is written only for a species with native
  // SHELL (inoculation, stage 6 binding) and split between same-species daughters, so any other organism
  // holding it is unreachable. jacketMineral has no writer yet (E11 is not implemented; division halves
  // it), but E11 needs the silicate system and module loss at division may one day leave a jacket on a
  // daughter without E11, so the rule is the system only: without it a death or capture could not put the
  // mineral anywhere (maintenance.ts killEntity, contacts.ts).
  if (get('boundMineral') > 0 && !has('SHELL')) return 'An organism carries shell mineral although it cannot build a shell.';
  if (get('jacketMineral') > 0 && !ctx.systems.includes('silicate')) return "An organism carries jacket mineral although the dish's rules have no silicate.";
  if ((get('flags') & FLAG.restNewborn) !== 0) {
    if (!has('RESTING_DAUGHTER')) return 'An organism is marked as a resting newborn although its kind has no resting daughters.';
    if (get('lifeState') === LIFE_ACTIVE) return 'An active organism is marked as a resting newborn.';
  }
  return null;
}

function climateProblem(name: string, enc: unknown): string | null {
  if (enc === null || enc === undefined) return null;
  const e = enc as { dtype?: unknown; length?: unknown; b64?: unknown };
  if (typeof e !== 'object' || e.dtype !== 'f64' || e.length !== CELL_COUNT || typeof e.b64 !== 'string') return `The dish's local ${name} cannot be read.`;
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(e.b64);
  } catch {
    return `The dish's local ${name} cannot be read.`;
  }
  if (bytes.length !== CELL_COUNT * 8) return `The dish's local ${name} cannot be read.`;
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const arr = new Float64Array(copy.buffer);
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]!;
    if (!Number.isFinite(v) || v < 0 || v > 1) return `The dish's local ${name} has an invalid value at cell ${i}.`;
  }
  return null;
}

function gateTallyProblem(raw: unknown, nextDeviceId: number, barriers: boolean): string | null {
  if (!Array.isArray(raw)) return 'The gate tallies are not a list.';
  if (raw.length > 0 && !barriers) return "The dish has gate tallies, but its rules have no edge barriers.";
  let last = 0;
  for (const t of raw as unknown[]) {
    if (typeof t !== 'object' || t === null || Array.isArray(t)) return 'A gate tally is not a record.';
    const g = t as Record<string, unknown>;
    for (const k of Object.keys(g)) if (k !== 'id' && k !== 'fields' && k !== 'organisms') return `A gate tally has an unknown entry "${k}".`;
    if (!Number.isInteger(g.id) || (g.id as number) <= last) return 'The gate tallies are out of order or repeated.';
    if ((g.id as number) >= nextDeviceId) return 'A gate tally names a structure the dish never placed.';
    last = g.id as number;
    if (typeof g.fields !== 'object' || g.fields === null || Array.isArray(g.fields)) return "A gate tally's amounts are not a record.";
    const fields = g.fields as Record<string, unknown>;
    for (const k of Object.keys(fields)) {
      if (!isFieldId(k)) return `A gate tally counts an unknown field "${k}".`;
      const v = fields[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 'A gate tally holds an invalid amount.';
    }
    if (!Number.isInteger(g.organisms) || (g.organisms as number) < 0) return 'A gate tally holds an invalid organism count.';
  }
  return null;
}

/**
 * The first problem with a (migrated) state's schema 5 records, as a player-facing sentence, or null.
 * `cols` are the decoded entity columns over [0, hw) (already checked for dtype, length and finite values;
 * living slots already have a known species and genome).
 */
export function phase5StateProblem(s: WorldState, cols: Readonly<Record<string, ArrayLike<number>>>, hw: number, ctx: Phase5CheckContext): string | null {
  const sys = (id: string) => ctx.systems.includes(id);
  // An absent store is empty (as deserializeWorld reads it); a present one must be well formed, null included.
  const edges: unknown = s.edges === undefined ? [] : s.edges;
  const devices: unknown = s.devices === undefined ? [] : s.devices;
  if (Array.isArray(edges) && edges.length > 0 && !sys('barriers')) return "The dish has edge barriers, but its rules have no edge barriers.";
  if (Array.isArray(devices) && devices.length > 0 && !sys('devices')) return "The dish has furnishings or devices, but its rules have none.";

  // Climate: local arrays, the light cycle and drying all need the climate system.
  const climateRaw: unknown = s.climate === undefined ? { warmth: null, moisture: null } : s.climate;
  if (typeof climateRaw !== 'object' || climateRaw === null || Array.isArray(climateRaw)) return "The dish's local climate cannot be read.";
  if (Object.keys(climateRaw).some((k) => k !== 'warmth' && k !== 'moisture')) return "The dish's local climate cannot be read.";
  const climate = climateRaw as { warmth?: unknown; moisture?: unknown };
  for (const name of ['warmth', 'moisture'] as const) {
    const enc = climate[name];
    if (enc !== null && enc !== undefined && !sys('climate')) return `The dish has local ${name}, but its rules have no climate.`;
    const p = climateProblem(name, enc);
    if (p) return p;
  }
  const settings = s.settings as { lightMode?: unknown; drying?: unknown; cycleStartTick?: unknown };
  if (settings.lightMode === 'cycle' && !sys('climate')) return "The dish's light cycles, but its rules have no climate.";
  if (settings.drying === true && !sys('climate')) return "The dish is drying, but its rules have no climate.";
  const start = settings.cycleStartTick;
  if (settings.lightMode === 'cycle') {
    if (start === undefined) return "The dish's light cycle has no start.";
    if (!Number.isInteger(start) || (start as number) < 0 || (start as number) > s.tick) return "The dish's light cycle starts at an invalid time.";
  } else if (start !== undefined) return 'The dish records a light cycle start, but its light does not cycle.';

  // Edge barriers and devices on the dish's own grid, with one id space.
  const grid = { substrate: base64ToBytes(s.grid.substrate.b64), structure: base64ToBytes(s.grid.structure.b64) };
  const edgeError = edgeStoreProblem(edges, grid, { enabledStructures: ctx.enabledStructures });
  if (edgeError) return edgeError;
  // A channel's organism wait is written only by its own transfer (channel.ts moveOrganisms: stage 2 of
  // tick T writes T + CHANNEL_ORGANISM_TICKS, then the tick advances to T + 1), so a saved wait never lies
  // more than CHANNEL_ORGANISM_TICKS past the saved tick; a later one would switch the transfer off for good.
  for (const e of edges as readonly { readonly kind: string; readonly nextOrganismTick?: number }[]) {
    if (e.kind === 'S04' && e.nextOrganismTick !== undefined && !(e.nextOrganismTick <= s.tick + CHANNEL_ORGANISM_TICKS)) return 'A one-way channel has an invalid organism wait.';
  }
  const deviceError = deviceStoreProblem(devices, grid, { enabledStructures: ctx.enabledStructures });
  if (deviceError) return deviceError;
  const savedNext = (s.counters as { nextDeviceId?: unknown }).nextDeviceId;
  const nextDeviceId = savedNext === undefined ? 1 : savedNext;
  if (!Number.isInteger(nextDeviceId) || (nextDeviceId as number) < 1) return 'The structure counter is invalid.';
  const ids = [...(edges as { id: number }[]), ...(devices as { id: number }[])].map((x) => x.id).sort((a, b) => a - b);
  for (let k = 0; k < ids.length; k++) {
    if (k > 0 && ids[k] === ids[k - 1]) return 'Two structures share one identity.';
    if (ids[k]! >= (nextDeviceId as number)) return 'A structure has an identity the dish never gave.';
  }
  const tally = gateTallyProblem(s.gateTally === undefined ? [] : s.gateTally, nextDeviceId as number, sys('barriers'));
  if (tally) return tally;

  // Organism columns: living slots against their abilities, mutual trap pairs, dead slots empty.
  const added = COLUMNS_ADDED_IN[5]!;
  for (let i = 0; i < hw; i++) {
    if (cols.alive![i] !== 1) {
      for (const name of added) if (cols[name]![i] !== emptyValueOf(name)) return 'An empty place in the dish holds organism state.';
      continue;
    }
    const p = organismProblem((name) => cols[name]![i]!, ctx);
    if (p) return p;
    const t = cols.trapSlot![i]!;
    if (t >= 0) {
      if (t === i) return 'A trap holds itself.';
      if (t >= hw || cols.alive![t] !== 1 || cols.birthId![t] !== cols.trapBirthId![i]) return 'A trap holds an organism that is not there.';
      if (cols.heldBySlot![t] !== i || cols.heldByBirthId![t] !== cols.birthId![i]) return 'A trap and the organism it holds do not refer to each other.';
    }
    const h = cols.heldBySlot![i]!;
    if (h >= 0) {
      if (h >= hw || cols.alive![h] !== 1 || cols.birthId![h] !== cols.heldByBirthId![i]) return 'An organism is held by a trap that is not there.';
      if (cols.trapSlot![h] !== i || cols.trapBirthId![h] !== cols.birthId![i]) return 'A held organism and its trap do not refer to each other.';
    }
  }

  // Held sample rows (already decodable: phase3StateProblem checked the sample first).
  if (s.sample) {
    let rows: readonly { readonly cols: Readonly<Record<ColumnName, number>> }[];
    try {
      rows = decodeSample(s.sample).rows;
    } catch (e) {
      return `The held sample cannot be loaded (${(e as Error).message}).`;
    }
    for (const r of rows) {
      // The trap's sample closure (a trap and its prey move together) lands with the trap stage, which replaces this rule.
      if (r.cols.trapSlot >= 0 || r.cols.heldBySlot >= 0) return 'The held sample holds a trap or a trapped organism.';
      const p = organismProblem((name) => r.cols[name], ctx);
      if (p) return `The held sample cannot be loaded. ${p}`;
    }
  }
  return null;
}
