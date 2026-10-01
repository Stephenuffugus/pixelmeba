/**
 * Sample, Transfer, Discard and Cancel (SPEC §10.5, §3.4; D07 §09; BUILD_DIRECTIVE P3.5; D-0037).
 *
 * The held sample is `world.sample` (src/sim/sampleSlot.ts), an accounted compartment of the source
 * world: computeTotals counts it, so Take and Transfer are internal moves and only Discard exports.
 *
 * - Selection (`selectSample`, also the host's read-only preview): a footprint of cells (brushCells of
 *   the tap point at radius 1/3/6, inside the dish, solutes allowed: open cells and porous beads) and a
 *   mode. Life = organisms whose centres are in the footprint plus viral units in its cells; Dissolved =
 *   every allocated field of kind dissolved, gas or activity (companion nutrient fields are kind
 *   dissolved too); Deposits = every deposit field (starch, oil, protein, detritus and film with their
 *   companion N; grit when the silicate system exists) plus food objects; All = all of these (never
 *   structures).
 * - Whole ownership units: a host and its parasite; the whole fungal component (any link kind) and the
 *   whole adhesion component of any selected member; a predator and the prey it has claimed (a valid
 *   preySlot), in both directions. The closure over these is computed; when any member's centre lies
 *   outside the footprint the whole selection is refused and every missing member is named (species,
 *   birthId, cell). The brush is never widened.
 * - Take (`sampleTake`): every held row keeps every column and its original slot; field amounts move by
 *   cell offset from the origin cell; food objects move with their ids; genome copies travel along
 *   (cross-dish transfers need them later). Slots are freed without breaking links or host pairs: every
 *   partner is held too, so nothing dangles (releaseHostPair and removeAllLinks are not needed).
 * - Transfer (`sampleTransfer` {dx, dy}): validates every destination first; any failure refuses the
 *   whole move and changes nothing. Then a move, never a copy: fields keep their offsets (added to the
 *   destination), objects keep id and contents, organisms keep relative positions and all state, take
 *   new slots lowest-free-first in ascending original-slot order, and every stored slot reference
 *   (hostSlot, parasiteSlot, preySlot, fLink0..3, aLink0..1) is remapped; birthIds are unchanged.
 * - Discard (`sampleDiscard`): exports exactly the held carbon, nutrient and mineral; each held organism
 *   is recorded as removed with REMOVED_SAMPLED (death event, lineage, branch counts).
 * - Cancel (`cancelSample`, host-level; D-0037): the exact inverse of Take (allocate-at-slot into the
 *   original slots, field values back into their cells, objects back in id order) plus the command
 *   state: every log entry from the take's seq on leaves the log and nextSeq returns to that seq.
 *
 * No randomness is drawn anywhere here.
 */
import { AGENT_CAP, CELL_SOFT_CAPACITY, FUNGAL_CAP, GRID_W } from './constants';
import type { Command, CommandResult } from './commands';
import { emit } from './events';
import { FIELD_DEFS, FIELD_IDS, type FieldId } from './fields';
import { onDeath } from './branches';
import { fungalSegmentCount } from './fungi';
import { brushCells, cellX, cellY, inBounds, inMask, isLabRadius, ST_NONE, transportOpen } from './grid';
import { recordExport } from './ledger';
import { recordDeath } from './lineage';
import { adhesionNeighbors, fungalNeighbors, ADHESION_BIRTH_COLUMNS, ADHESION_SLOT_COLUMNS, FUNGAL_BIRTH_COLUMNS, FUNGAL_SLOT_COLUMNS } from './links';
import { FOOD_OBJECT_CAP, type FoodObject } from './objects';
import { hostOf, parasiteOf } from './parasites';
import { R } from './reasons';
import { SAMPLE_MODES, sampleTotals, type SampleGenome, type SampleMode, type SampleRow, type SampleSlot } from './sampleSlot';
import type { SavedGenome } from './serialize';
import { entityCell, rebuildIndex } from './spatial';
import { habitatCompatible } from './suitability';
import { markField, updateDerived } from './transport';
import { ENTITY_COLUMNS, MOVE_NONE, type ColumnName } from './entities';
import type { World } from './world';

export type SampleTakePayload = { readonly kind: 'sampleTake'; readonly x: number; readonly y: number; readonly radius: number; readonly mode: SampleMode };
export type SampleTransferPayload = { readonly kind: 'sampleTransfer'; readonly dx: number; readonly dy: number };
export type SampleDiscardPayload = { readonly kind: 'sampleDiscard' };
export type SamplePayload = SampleTakePayload | SampleTransferPayload | SampleDiscardPayload;

/** The refusal every dish-changing request gets while a sample is held (D-0037). */
export const SAMPLE_HELD_REFUSAL = 'A sample is held — transfer, cancel or discard it first';

/** A member of a whole ownership unit whose centre lies outside the footprint. */
export interface MissingMember {
  readonly speciesId: string;
  readonly birthId: number;
  readonly cell: readonly [number, number];
}

/** What a sample here would take (the host's preview and the take itself share it). */
export interface SampleSelection {
  readonly mode: SampleMode;
  readonly radius: number;
  readonly origin: readonly [number, number];
  /** Footprint cells (inside the dish, open or porous), ascending. */
  readonly cells: readonly number[];
  /** Organism slots taken, ascending (empty unless Life or All). */
  readonly slots: readonly number[];
  /** Field ids taken from the footprint cells, canonical order. */
  readonly fields: readonly FieldId[];
  /** Food objects taken (ids, ascending; Deposits or All). */
  readonly objectIds: readonly number[];
  /** Members of whole units outside the footprint: non-empty ⇒ the selection is refused whole. */
  readonly missing: readonly MissingMember[];
  /** Carbon, nutrient and mineral the sample would hold. */
  readonly c: number;
  readonly n: number;
  readonly m: number;
}

/** Field kinds each mode takes (SPEC §10.5; D-0037). */
function modeTakes(mode: SampleMode, kind: (typeof FIELD_DEFS)[FieldId]['kind']): boolean {
  switch (mode) {
    case 'life':
      return kind === 'viral';
    case 'dissolved':
      return kind === 'dissolved' || kind === 'gas' || kind === 'activity';
    case 'deposits':
      return kind === 'deposit';
    case 'all':
      return kind === 'viral' || kind === 'dissolved' || kind === 'gas' || kind === 'activity' || kind === 'deposit';
  }
}

export function isSampleMode(m: unknown): m is SampleMode {
  return typeof m === 'string' && (SAMPLE_MODES as readonly string[]).includes(m);
}

/** Why a take payload is malformed, or null. */
export function invalidSampleTake(p: { x: unknown; y: unknown; radius: unknown; mode: unknown }): string | null {
  if (!isSampleMode(p.mode)) return 'unknown sample mode';
  if (!isLabRadius(p.radius)) return 'invalid radius';
  if (typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return 'invalid point';
  if (!inBounds(Math.floor(p.x), Math.floor(p.y))) return 'point outside the dish area';
  return null;
}

/** The direct ownership partners of living organism `i` (host/parasite, links, claimed prey/predators). */
function partnersOf(world: World, i: number, predatorsOf: Readonly<Record<number, readonly number[]>>): number[] {
  const out: number[] = [];
  const p = parasiteOf(world, i);
  if (p >= 0) out.push(p);
  const h = hostOf(world, i);
  if (h >= 0) out.push(h);
  out.push(...fungalNeighbors(world, i), ...adhesionNeighbors(world, i));
  const c = world.ents.cols;
  const prey = c.preySlot[i]!;
  if (prey >= 0 && world.ents.refValid(prey, c.preyBirthId[i]!)) out.push(prey);
  for (const q of predatorsOf[i] ?? []) out.push(q);
  return out;
}

/**
 * The sample a tap at (x, y) with this radius and mode would take, with its whole-unit check. Read
 * only: the host's preview calls it as it is, and the take applies exactly what it returns.
 */
export function selectSample(world: World, x: number, y: number, radius: number, mode: SampleMode): SampleSelection {
  const origin = [Math.floor(x), Math.floor(y)] as const;
  const cells = brushCells(x, y, radius)
    .filter((cell) => inMask(cellX(cell), cellY(cell)) && transportOpen(world.grid, cell))
    .sort((a, b) => a - b);
  const inFoot = new Uint8Array(world.grid.substrate.length);
  for (const cell of cells) inFoot[cell] = 1;
  const fields = FIELD_IDS.filter((id) => world.fields[id] !== undefined && modeTakes(mode, FIELD_DEFS[id].kind));
  const c = world.ents.cols;
  const slots: number[] = [];
  const missing: MissingMember[] = [];
  if (mode === 'life' || mode === 'all') {
    const hw = world.ents.highWater;
    const inside = new Uint8Array(hw);
    for (let i = 0; i < hw; i++) {
      if (c.alive[i] !== 1) continue;
      if (inFoot[entityCell(c.x[i]!, c.y[i]!)] === 1) inside[i] = 1;
    }
    // Predators by the prey they have claimed (reverse of a valid preySlot), ascending slot order.
    const predatorsOf: Record<number, number[]> = {};
    for (let j = 0; j < hw; j++) {
      if (c.alive[j] !== 1) continue;
      const prey = c.preySlot[j]!;
      if (prey >= 0 && world.ents.refValid(prey, c.preyBirthId[j]!)) (predatorsOf[prey] ??= []).push(j);
    }
    // Closure over whole units, starting from every organism inside.
    const seen = new Uint8Array(hw);
    const queue: number[] = [];
    for (let i = 0; i < hw; i++) {
      if (inside[i] === 1) {
        seen[i] = 1;
        queue.push(i);
      }
    }
    for (let q = 0; q < queue.length; q++) {
      for (const p of partnersOf(world, queue[q]!, predatorsOf)) {
        if (seen[p] === 1) continue;
        seen[p] = 1;
        queue.push(p);
      }
    }
    for (let i = 0; i < hw; i++) {
      if (seen[i] !== 1) continue;
      if (inside[i] === 1) slots.push(i);
      else {
        const cell = entityCell(c.x[i]!, c.y[i]!);
        missing.push({ speciesId: world.species[c.species[i]!]!.id, birthId: c.birthId[i]!, cell: [cellX(cell), cellY(cell)] });
      }
    }
    missing.sort((a, b) => a.birthId - b.birthId);
  }
  const objectIds =
    mode === 'deposits' || mode === 'all'
      ? world.objects.filter((o) => inFoot[o.cell] === 1).map((o) => o.id).sort((a, b) => a - b)
      : [];
  // Held totals, exactly as sampleTotals will count them.
  const preview = buildSlot(world, { origin, radius, mode, cells, slots, fields, objectIds, seq: 1 }, false);
  const t = sampleTotals(preview);
  return { mode, radius, origin, cells, slots, fields, objectIds, missing, c: t.c, n: t.n, m: t.m };
}

/** The genome copy a held row carries (the same record serializeWorld writes). */
function savedGenomeOf(world: World, index: number): SavedGenome {
  const g = world.genomes.list[index]!;
  return {
    ancestor: g.ancestor,
    loci: [...g.loci],
    policy: g.policy,
    weights: g.weights === null ? null : [...g.weights],
    modules: [...g.modules],
    dev: { ...g.dev },
  };
}

const GENOME_COLUMNS = ['genome', 'refGenome', 'propG0', 'propG1'] as const;

/** Copy what a selection holds into a SampleSlot (no change to the world). */
function buildSlot(
  world: World,
  s: { origin: readonly [number, number]; radius: number; mode: SampleMode; cells: readonly number[]; slots: readonly number[]; fields: readonly FieldId[]; objectIds: readonly number[]; seq: number },
  withGenomes: boolean,
): SampleSlot {
  const c = world.ents.cols;
  const rows: SampleRow[] = s.slots.map((slot) => {
    const cols = {} as Record<ColumnName, number>;
    for (const [name] of ENTITY_COLUMNS) cols[name] = (c[name] as ArrayLike<number>)[slot]!;
    return { slot, cols };
  });
  const cells = [];
  for (const cell of s.cells) {
    const fields: Partial<Record<FieldId, number>> = {};
    let any = false;
    for (const id of s.fields) {
      const v = world.fields[id]![cell]!;
      if (Object.is(v, 0)) continue;
      fields[id] = v;
      any = true;
    }
    if (any) cells.push({ dx: cellX(cell) - s.origin[0], dy: cellY(cell) - s.origin[1], fields });
  }
  const objects: FoodObject[] = world.objects
    .filter((o) => s.objectIds.includes(o.id))
    .map((o) => ({ id: o.id, cell: o.cell, kind: o.kind, pools: { ...o.pools }, n: o.n }));
  const genomes: SampleGenome[] = [];
  if (withGenomes) {
    const idx: number[] = [];
    for (const r of rows) for (const col of GENOME_COLUMNS) if (r.cols[col] >= 0 && !idx.includes(r.cols[col])) idx.push(r.cols[col]);
    idx.sort((a, b) => a - b);
    for (const index of idx) genomes.push({ index, genome: savedGenomeOf(world, index) });
  }
  return {
    txId: `sample-${world.tick}-${s.seq}`,
    seq: s.seq,
    mode: s.mode,
    origin: [s.origin[0], s.origin[1]],
    radius: s.radius,
    rows,
    cells,
    objects,
    genomes,
  };
}

/** Readable list of missing members for a command note ("B01 #12 at (40, 41)"). */
export function missingNote(missing: readonly MissingMember[]): string {
  return `whole units only; outside the circle: ${missing.map((m) => `${m.speciesId} #${m.birthId} at (${m.cell[0]}, ${m.cell[1]})`).join(', ')}`;
}

// ---- Take -----------------------------------------------------------------------------------------

export function sampleTake(world: World, cmd: Command, p: SampleTakePayload): CommandResult {
  const bad = invalidSampleTake(p);
  if (bad) return { accepted: 0, rejected: 0, note: bad };
  if (world.sample !== null) return { accepted: 0, rejected: 0, note: 'a sample is already held' };
  const sel = selectSample(world, p.x, p.y, p.radius, p.mode);
  if (sel.missing.length > 0) return { accepted: 0, rejected: sel.missing.length, note: missingNote(sel.missing) };
  const slot = buildSlot(world, { ...sel, seq: cmd.seq }, true);
  const taken = slot.rows.length + slot.cells.length + slot.objects.length;
  if (taken === 0) return { accepted: 0, rejected: 0, note: 'nothing to take here' };
  // Fields: each held value leaves its cell exactly (the cell keeps +0).
  for (const cell of slot.cells) {
    const i = (cell.dy + slot.origin[1]) * GRID_W + cell.dx + slot.origin[0];
    for (const id of Object.keys(cell.fields) as FieldId[]) world.fields[id]![i] = 0;
  }
  for (const o of slot.objects) {
    const k = world.objects.findIndex((x) => x.id === o.id);
    world.objects.splice(k, 1);
  }
  // Rows: copied above with every column; the slots are freed (partners are all held: nothing dangles).
  for (const r of slot.rows) world.ents.free(r.slot);
  world.sample = slot;
  return { accepted: taken, rejected: 0 };
}

// ---- Cancel (host-level, exact; D-0037) ----------------------------------------------------------

/** Put a held row back into `slot` with every column exactly as held. */
function writeRow(world: World, slot: number, row: SampleRow): void {
  const c = world.ents.cols;
  for (const [name] of ENTITY_COLUMNS) (c[name] as unknown as Float64Array)[slot] = row.cols[name];
}

/** Insert a food object keeping the store in ascending id order (its creation order). */
function insertObject(world: World, o: FoodObject): void {
  let k = 0;
  while (k < world.objects.length && world.objects[k]!.id < o.id) k++;
  world.objects.splice(k, 0, { id: o.id, cell: o.cell, kind: o.kind, pools: { ...o.pools }, n: o.n });
}

/**
 * Cancel: the exact inverse of the take, then the command state as Undo leaves it: every log entry from
 * the take's seq on (the take, and any refused transfer since) leaves the log with its 'command' event,
 * and nextSeq returns to the take's seq. Throws when no sample is held or an original slot is taken
 * (impossible while the host refuses every other change).
 *
 * Exact means stateHash-exact (D-0037). The event ring (500) and commands.log (10,000) are unhashed,
 * capped observation records: when the take's or a refused transfer's entry pushed out the oldest one,
 * Cancel removes the new entries but cannot bring the pushed-out ones back.
 */
export function cancelSample(world: World): void {
  const s = world.sample;
  if (s === null) throw new Error('no sample is held');
  for (const r of s.rows) if (world.ents.isAlive(r.slot)) throw new Error(`cancel: slot ${r.slot} is occupied`);
  for (const r of s.rows) {
    world.ents.allocateAt(r.slot);
    writeRow(world, r.slot, r);
  }
  for (const cell of s.cells) {
    const i = (cell.dy + s.origin[1]) * GRID_W + cell.dx + s.origin[0];
    for (const id of Object.keys(cell.fields).sort() as FieldId[]) {
      const arr = world.fields[id]!;
      const v = cell.fields[id]!;
      arr[i] = Object.is(arr[i], 0) ? v : arr[i]! + v;
      markField(world, id);
    }
  }
  for (const o of s.objects) insertObject(world, o);
  world.sample = null;
  // Command state (D-0037): the take never happened.
  const cmds = world.commands;
  const dropped = cmds.log.filter((x) => x.seq >= s.seq).length;
  cmds.log = cmds.log.filter((x) => x.seq < s.seq);
  cmds.nextSeq = s.seq;
  const ring = world.events.ring;
  for (let k = 0; k < dropped; k++) {
    const last = ring[ring.length - 1];
    if (!last || last.type !== 'command' || !(Number(last.detail?.seq) >= s.seq)) break;
    ring.pop();
    world.events.totals.command = (world.events.totals.command ?? 1) - 1;
    world.counters.nextEventId--;
  }
  if (world.history.pendingInterventions > 0) world.history.pendingInterventions--;
  rebuildIndex(world);
  updateDerived(world);
}

// ---- Discard --------------------------------------------------------------------------------------

export function sampleDiscard(world: World): CommandResult {
  const s = world.sample;
  if (s === null) return { accepted: 0, rejected: 0, note: 'no sample is held' };
  const t = sampleTotals(s);
  recordExport(world, 'sample:discard', t.c, t.n, t.m);
  // Removed life is recorded (REMOVED_SAMPLED): each row goes back into its original slot (free while
  // held) for the ordinary removal bookkeeping, then every slot is freed. Its material left with the
  // export above, so nothing is added to the dish.
  for (const r of s.rows) if (world.ents.isAlive(r.slot)) throw new Error(`discard: slot ${r.slot} is occupied`);
  for (const r of s.rows) {
    world.ents.allocateAt(r.slot);
    writeRow(world, r.slot, r);
  }
  const c = world.ents.cols;
  for (const r of s.rows) {
    const i = r.slot;
    const cell = entityCell(c.x[i]!, c.y[i]!);
    world.ledger.energy.dissipated += c.E[i]!;
    emit(world.events, world.counters, {
      tick: world.tick,
      type: 'death',
      species: c.species[i]!,
      birthId: c.birthId[i]!,
      cell,
      cause: R.REMOVED_SAMPLED,
      detail: { biomass: c.B[i]!, age: c.age[i]! },
    });
    recordDeath(world.lineage, c.birthId[i]!, world.tick, R.REMOVED_SAMPLED);
    onDeath(world, i);
    const sp = c.species[i]!;
    world.history.pendingDeaths[sp] = (world.history.pendingDeaths[sp] ?? 0) + 1;
  }
  for (const r of s.rows) world.ents.free(r.slot);
  world.sample = null;
  return { accepted: s.rows.length + s.cells.length + s.objects.length, rejected: 0 };
}

// ---- Transfer -------------------------------------------------------------------------------------

/** Slot-valued columns with the birthId column that keeps each reference's identity. */
const REF_COLUMNS: readonly (readonly [ColumnName, ColumnName])[] = [
  ['hostSlot', 'hostBirthId'],
  ['parasiteSlot', 'parasiteBirthId'],
  ['preySlot', 'preyBirthId'],
  ...FUNGAL_SLOT_COLUMNS.map((s, k) => [s, FUNGAL_BIRTH_COLUMNS[k]!] as const),
  ...ADHESION_SLOT_COLUMNS.map((s, k) => [s, ADHESION_BIRTH_COLUMNS[k]!] as const),
];
const LINK_REFS: readonly (readonly [ColumnName, ColumnName])[] = REF_COLUMNS.slice(3);

/** Why the held sample cannot go to offset (dx, dy), or null (every destination checked first). */
export function transferProblem(world: World, dx: number, dy: number): string | null {
  const s = world.sample;
  if (s === null) return 'no sample is held';
  if (!Number.isInteger(dx) || !Number.isInteger(dy) || Math.abs(dx) > 256 || Math.abs(dy) > 256) return 'invalid offset';
  const g = world.grid;
  const dest = (x: number, y: number): number | null => (inBounds(x, y) && inMask(x, y) ? y * GRID_W + x : null);
  for (const cell of s.cells) {
    const d = dest(s.origin[0] + cell.dx + dx, s.origin[1] + cell.dy + dy);
    if (d === null) return 'part of the sample would land outside the dish';
    if (!transportOpen(g, d)) return 'part of the sample would land on a stone or wall';
  }
  if (world.objects.length + s.objects.length > FOOD_OBJECT_CAP) return `the dish already holds ${FOOD_OBJECT_CAP} food objects`;
  for (const o of s.objects) {
    const d = dest(cellX(o.cell) + dx, cellY(o.cell) + dy);
    if (d === null) return 'a food object would land outside the dish';
    if (g.structure[d] !== ST_NONE) return 'a food object would land on a structure';
    if (world.objects.some((x) => x.cell === d)) return 'a food object would land where another one lies';
  }
  if (world.ents.count + s.rows.length > Math.min(AGENT_CAP, world.ents.capacity)) return 'the dish is at its organism limit';
  let fungal = 0;
  for (const r of s.rows) if (world.species[r.cols.species]!.fungal) fungal++;
  if (fungal > 0 && fungalSegmentCount(world) + fungal > FUNGAL_CAP) return `the dish would pass ${FUNGAL_CAP} fungal segments`;
  // Organisms: each destination cell must suit the species (attachment surfaces included); a parasite
  // riding a held host goes where its host goes. Soft capacity 8 per cell counts the dish's own load.
  const incoming: Record<number, number> = {};
  const destCell: Record<number, number> = {};
  const heldBirth: Record<number, number> = {};
  for (const r of s.rows) heldBirth[r.slot] = r.cols.birthId;
  for (const r of s.rows) {
    const nx = r.cols.x + dx;
    const ny = r.cols.y + dy;
    const cx = Math.floor(nx);
    const cy = Math.floor(ny);
    const d = dest(cx, cy);
    if (d === null) return 'an organism would land outside the dish';
    destCell[r.slot] = d;
    const sp = world.species[r.cols.species]!;
    const riding = r.cols.hostSlot >= 0 && heldBirth[r.cols.hostSlot] === r.cols.hostBirthId;
    if (!riding && !habitatCompatible(world, sp, d)) return `${sp.def.name} cannot live where it would land`;
    incoming[d] = (incoming[d] ?? 0) + r.cols.B / sp.def.b0;
  }
  for (const key of Object.keys(incoming).map(Number).sort((a, b) => a - b)) {
    if (world.derived.cellLoad[key]! + incoming[key]! > CELL_SOFT_CAPACITY + 1e-9) return 'a destination cell would be too crowded';
  }
  // Linked members keep their relative cells (so links stay between four-adjacent cells).
  for (const r of s.rows) {
    for (const [sc, bc] of LINK_REFS) {
      const p = r.cols[sc];
      if (p < 0 || heldBirth[p] !== r.cols[bc]) continue;
      const partner = s.rows.find((x) => x.slot === p)!;
      const before = [Math.floor(partner.cols.x) - Math.floor(r.cols.x), Math.floor(partner.cols.y) - Math.floor(r.cols.y)];
      const a = destCell[r.slot]!;
      const b = destCell[p]!;
      if (cellX(b) - cellX(a) !== before[0] || cellY(b) - cellY(a) !== before[1]) return 'linked members would come apart';
    }
  }
  return null;
}

export function sampleTransfer(world: World, p: SampleTransferPayload): CommandResult {
  const problem = transferProblem(world, p.dx, p.dy);
  const s = world.sample;
  if (problem || s === null) return { accepted: 0, rejected: s ? s.rows.length + s.cells.length + s.objects.length : 0, note: problem ?? 'no sample is held' };
  const { dx, dy } = p;
  for (const cell of s.cells) {
    const i = (s.origin[1] + cell.dy + dy) * GRID_W + s.origin[0] + cell.dx + dx;
    for (const id of Object.keys(cell.fields).sort() as FieldId[]) {
      const arr = world.fields[id]!;
      arr[i] = Object.is(arr[i], 0) ? cell.fields[id]! : arr[i]! + cell.fields[id]!;
      markField(world, id);
    }
  }
  for (const o of s.objects) insertObject(world, { ...o, cell: (cellY(o.cell) + dy) * GRID_W + cellX(o.cell) + dx });
  // Organisms: new slots lowest-free-first in ascending original-slot order, then every reference remapped.
  const rows = [...s.rows].sort((a, b) => a.slot - b.slot);
  const map: Record<number, number> = {};
  for (const r of rows) {
    const slot = world.ents.allocate();
    if (slot < 0) throw new Error('transfer: no free slot after validation');
    map[r.slot] = slot;
    writeRow(world, slot, r);
    const c = world.ents.cols;
    c.x[slot] = r.cols.x + dx;
    c.y[slot] = r.cols.y + dy;
    if (r.cols.moveMode !== MOVE_NONE) {
      c.targetX[slot] = r.cols.targetX + dx;
      c.targetY[slot] = r.cols.targetY + dy;
    }
  }
  const heldBirth: Record<number, number> = {};
  for (const r of rows) heldBirth[r.slot] = r.cols.birthId;
  const c = world.ents.cols;
  for (const r of rows) {
    const slot = map[r.slot]!;
    for (const [sc, bc] of REF_COLUMNS) {
      const ref = r.cols[sc];
      if (ref < 0 || heldBirth[ref] !== r.cols[bc]) continue; // empty, or a stale prey link (kept as it was)
      (c[sc] as Int32Array)[slot] = map[ref]!;
    }
  }
  world.sample = null;
  return { accepted: s.rows.length + s.cells.length + s.objects.length, rejected: 0 };
}

// ---- Held summary (host snapshots; read only) -----------------------------------------------------

export interface SampleHeldSummary {
  readonly mode: SampleMode;
  readonly radius: number;
  readonly origin: readonly [number, number];
  readonly organisms: number;
  readonly cells: number;
  readonly objects: number;
  readonly c: number;
  readonly n: number;
  readonly m: number;
  /** Offsets (dx, dy pairs, flattened) of every cell the sample occupies: field cells, organism cells, object cells. */
  readonly footprint: readonly number[];
}

export function heldSummary(world: World): SampleHeldSummary | null {
  const s = world.sample;
  if (s === null) return null;
  const t = sampleTotals(s);
  const offs: string[] = [];
  const add = (dx: number, dy: number) => {
    const k = `${dx},${dy}`;
    if (!offs.includes(k)) offs.push(k);
  };
  for (const cell of s.cells) add(cell.dx, cell.dy);
  for (const r of s.rows) add(Math.floor(r.cols.x) - s.origin[0], Math.floor(r.cols.y) - s.origin[1]);
  for (const o of s.objects) add(cellX(o.cell) - s.origin[0], cellY(o.cell) - s.origin[1]);
  return {
    mode: s.mode,
    radius: s.radius,
    origin: [s.origin[0], s.origin[1]],
    organisms: s.rows.length,
    cells: s.cells.length,
    objects: s.objects.length,
    c: t.c,
    n: t.n,
    m: t.m,
    footprint: offs.flatMap((k) => k.split(',').map(Number)),
  };
}
