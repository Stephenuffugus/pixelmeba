/**
 * Viral fields (SPEC §7.5, §10.2; CT §1.2 / §3.3 / §12.5 / §13; P3.4). V01 Pinphage lives as units in
 * the `v01` field (0.01 C each; ledger.ts counts them through FIELD_DEFS.v01.carbonPerUnit). Units
 * diffuse and decay 1 %/s into detritus carbon with no nutrient in stage 2 (transport.ts decayViral).
 * A virus never becomes an entity: a dose adds units to cells, infection moves one unit into a host,
 * lysis moves part of the host back into units.
 *
 * Everything here needs the world's recorded manifest to enable the viruses system (so the v01 field
 * exists) and the virus species; a g2 save has neither and never runs any of it.
 *
 * - Stage 1 (commands.ts inoculate → `dosePhage`): 1/5/20 units into each footprint cell the material
 *   brush accepts (`phageCellAccepts`), recorded as an external carbon input (count × 0.01 C per dosed
 *   cell, no nutrient, no entities).
 * - Stage 5 (contacts.ts, after parasite attachment → `infectHosts`): every alive, uninfected organism
 *   of a listed host species (V01 hostIds: B01) in a cell holding ≥ 1 unit at the start of the stage
 *   draws u = detFloat(seed, 'infect', tick, birthId) against p = 1 − exp(−0.05 × units × dt). Hosts
 *   that pass take one whole unit each while ≥ 1 unit remains in their cell, in descending
 *   det(seed, 'contact', tick, KIND_INFECT, birthId) order (ties to the lower birthId). The unit's
 *   0.01 C joins the host's B (no nutrient); infectedBy = the virus code; infectionTimer = 0.
 * - Stage 7 (maintenance.ts → `infectionDue`, `lyse`): the timer advances 0.1 s per tick; at 20 s, before
 *   any ordinary death, floor(0.40 × B / 0.01) units go to the host's cell, and maintenance.ts removes
 *   the host through killEntity (DEATH_LYSIS): the remaining B, all N and any meal become detritus, a
 *   parasite is released, links are removed. Infected hosts still feed; division and healing are
 *   blocked elsewhere (births.ts, maintenance.ts).
 */
import { DT } from './constants';
import { FIELD_DEFS, type FieldId } from './fields';
import { worldHasSystem } from './gates';
import { brushCellOutcome, brushCells } from './grid';
import { recordInput, subtractPool } from './ledger';
import { det, detFloat, STREAMS } from './rng';
import { entityCell } from './spatial';
import { markField } from './transport';
import type { World } from './world';

/** Stage 5 contact kind for the infection unit order on the shared 'contact' stream (see parasites.ts). */
export const KIND_INFECT = 3;

/** Infection rate per unit per second: p = 1 − exp(−INFECTION_RATE × units × dt) (CT §12.5). */
export const INFECTION_RATE = 0.05;
/** Seconds from infection to lysis (CT §12.5). */
export const LYSIS_SECONDS = 20;
/** Share of host biomass that lysis turns into whole units (CT §12.5). */
export const LYSIS_UNIT_FRACTION = 0.4;
/** Largest phage dose per cell a command may carry (the tools send 1, 5 or 20; SPEC §10.2). */
export const PHAGE_DOSE_MAX = 20;

/** The viruses this build simulates: species ID → its unit field and the code stored in `infectedBy`. */
const VIRUSES: ReadonlyArray<{ readonly id: string; readonly field: FieldId; readonly code: number }> = [{ id: 'V01', field: 'v01', code: 1 }];

/** The virus species ID for an `infectedBy` code, or null. */
export function virusIdOfCode(code: number): string | null {
  for (const v of VIRUSES) if (v.code === code) return v.id;
  return null;
}

/** Whether species `id` is a virus this build doses as field units (never as an entity). */
export function isFieldVirus(id: string): boolean {
  return VIRUSES.some((v) => v.id === id);
}

/** Carbon per viral unit (0.01 C; FIELD_DEFS). */
export function unitCarbon(field: FieldId): number {
  return FIELD_DEFS[field].carbonPerUnit ?? 0.01;
}

/**
 * Whether a phage dose may put units into `cell`: exactly the material brush's rule (open water, gel or
 * sediment, or a porous bead; never a stone, wall or the rim). grid.ts lifeCellOutcome's `viral` branch
 * states the same rule for the Life brush preview.
 */
export function phageCellAccepts(world: World, cell: number): boolean {
  return brushCellOutcome('material', world.grid.structure[cell]!, false) === 'ok';
}

function virusIn(world: World, id: string): { readonly field: Float64Array; readonly fieldId: FieldId; readonly code: number; readonly spIdx: number } | null {
  if (!worldHasSystem(world, 'viruses')) return null;
  const v = VIRUSES.find((x) => x.id === id);
  if (!v) return null;
  const field = world.fields[v.field];
  if (!field) return null;
  const spIdx = world.species.findIndex((s) => s.id === id);
  if (spIdx < 0) return null;
  return { field, fieldId: v.field, code: v.code, spIdx };
}

// ------------------------------------------------------------------------------------- stage 1

/**
 * A phage dose (the inoculate command with a field virus's species ID): `count` units into every cell
 * of the footprint that phageCellAccepts, an external input of count × 0.01 C per dosed cell (no
 * nutrient). `accepted` is the number of cells dosed, `rejected` the cells refused. Refused whole in a
 * world without the viruses system, or with a count other than a whole 1…20.
 */
export function dosePhage(
  world: World,
  speciesId: string,
  x: number,
  y: number,
  radius: number,
  count: number,
): { accepted: number; rejected: number; note?: string } {
  const v = virusIn(world, speciesId);
  if (!v) return { accepted: 0, rejected: 0, note: `${speciesId} is not enabled in this dish` };
  if (!Number.isInteger(count) || count < 1 || count > PHAGE_DOSE_MAX) return { accepted: 0, rejected: 0, note: 'invalid dose' };
  if (![x, y, radius].every(Number.isFinite) || radius < 0 || radius > 6) return { accepted: 0, rejected: 0, note: 'invalid footprint' };
  let accepted = 0;
  let rejected = 0;
  for (const cell of brushCells(x, y, radius)) {
    if (!phageCellAccepts(world, cell)) {
      rejected++;
      continue;
    }
    v.field[cell]! += count;
    accepted++;
  }
  if (accepted > 0) {
    recordInput(world, `dose:${speciesId}`, accepted * count * unitCarbon(v.fieldId), 0);
    markField(world, v.fieldId);
  }
  return { accepted, rejected };
}

// ------------------------------------------------------------------------------------- stage 5

const candidates: number[] = [];
const candCell: number[] = [];
const candPriority: number[] = [];

/**
 * Stage 5 host-specific infection (after parasite attachment). Draws read the units each cell held at
 * the start of the stage; consumption follows in a fixed order so no unit is used twice and fewer than
 * one whole unit never infects.
 */
export function infectHosts(world: World): void {
  for (const virus of VIRUSES) {
    const v = virusIn(world, virus.id);
    if (!v) continue;
    infectWith(world, v.field, v.fieldId, v.code, v.spIdx);
  }
}

function infectWith(world: World, field: Float64Array, fieldId: FieldId, code: number, virusIdx: number): void {
  const c = world.ents.cols;
  const hostIds = world.species[virusIdx]!.def.hostIds;
  const isHost = world.species.map((s) => hostIds.includes(s.id));
  if (!isHost.includes(true)) return;
  candidates.length = 0;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1 || c.infectedBy[i] !== 0 || !isHost[c.species[i]!]) continue;
    const cell = entityCell(c.x[i]!, c.y[i]!);
    const units = field[cell]!;
    if (!(units >= 1)) continue; // fewer than one whole unit cannot infect (SPEC §7.5)
    const p = 1 - Math.exp(-INFECTION_RATE * units * DT);
    if (detFloat(world.seed, STREAMS.infect, world.tick, c.birthId[i]!) >= p) continue;
    candidates.push(i);
  }
  if (candidates.length === 0) return;
  // Units go in descending seeded priority within each cell (PROPOSED DECISION; SPEC §3.2 row 5).
  const order = candidates.map((_, k) => k);
  for (let k = 0; k < candidates.length; k++) {
    const i = candidates[k]!;
    candCell[k] = entityCell(c.x[i]!, c.y[i]!);
    candPriority[k] = det(world.seed, STREAMS.contact, world.tick, KIND_INFECT, c.birthId[i]!);
  }
  order.sort((a, b) => candCell[a]! - candCell[b]! || candPriority[b]! - candPriority[a]! || c.birthId[candidates[a]!]! - c.birthId[candidates[b]!]!);
  const per = unitCarbon(fieldId);
  for (const k of order) {
    const i = candidates[k]!;
    const cell = candCell[k]!;
    if (!(field[cell]! >= 1)) continue;
    subtractPool(world, field, cell, 1, 'c');
    // The unit's carbon joins the host's body; it carries no nutrient (PROPOSED DECISION).
    c.B[i]! += per;
    c.infectedBy[i] = code;
    c.infectionTimer[i] = 0;
  }
  markField(world, fieldId);
}

// ------------------------------------------------------------------------------------- stage 7

/**
 * Stage 7, in the timer step: true when infected organism `i` lyses now (its timer has reached 20 s);
 * otherwise advances its timer by dt. Uninfected organisms are untouched. Lysis happens exactly
 * 20 s / dt = 200 ticks after the infecting tick.
 */
export function infectionDue(world: World, i: number): boolean {
  const c = world.ents.cols;
  if (c.infectedBy[i] === 0) return false;
  if (c.infectionTimer[i]! >= LYSIS_SECONDS - 1e-9) return true;
  c.infectionTimer[i]! += DT;
  return false;
}

/**
 * Stage 7 lysis (before ordinary death): floor(0.40 × B / 0.01) whole units go to the host's cell and
 * leave its body. The caller then removes the host through killEntity with DEATH_LYSIS, which turns the
 * remaining B, all bound N and any meal into detritus at that cell, releases a parasite and removes
 * links. Returns the number of units released.
 */
export function lyse(world: World, i: number): number {
  const c = world.ents.cols;
  const code = c.infectedBy[i]!;
  const id = virusIdOfCode(code);
  const v = id === null ? null : VIRUSES.find((x) => x.id === id)!;
  const field = v ? world.fields[v.field] : undefined;
  if (!v || !field) throw new Error(`lyse: slot ${i} is infected by unknown virus code ${code}`);
  const per = unitCarbon(v.field);
  const B = c.B[i]!;
  // 1e-9 absorbs float error (0.40 × 0.7 / 0.01 = 27.999999999999996 → 28 units).
  const units = Math.max(0, Math.floor((LYSIS_UNIT_FRACTION * B) / per + 1e-9));
  if (units > 0) {
    subtractPool(world, c.B, i, units * per, 'c');
    field[entityCell(c.x[i]!, c.y[i]!)]! += units;
    markField(world, v.field);
  }
  return units;
}

/** Inspector facts for an infected organism: the virus's species index and seconds until lysis. */
export function infectionInfo(world: World, i: number): { readonly speciesIdx: number; readonly secondsLeft: number } | null {
  const c = world.ents.cols;
  const id = virusIdOfCode(c.infectedBy[i]!);
  if (id === null) return null;
  const spIdx = world.species.findIndex((s) => s.id === id);
  if (spIdx < 0) return null;
  return { speciesIdx: spIdx, secondsLeft: Math.max(0, LYSIS_SECONDS - c.infectionTimer[i]!) };
}
