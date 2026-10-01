/**
 * Stage 1 — commands (SPEC §3.2, §10). One completed gesture = one command, applied atomically at
 * stage 1 of its target tick in (targetTick, seq) order. While paused, commands are applied
 * immediately as edit transactions at the current tick; a replay applies them at the same point
 * (the start of the next step), so both paths produce identical state.
 */
import { fungalIntroductionRefused } from './fungi';
import { dosePhage, isFieldVirus } from './viruses';
import { CELL_SOFT_CAPACITY, GRID_H, GRID_W, INITIAL_ENERGY, INITIAL_HEALTH, INITIAL_NUTRIENT_RATIO } from './constants';
import { emit, milestone } from './events';
import { FLAG } from './entities';
import { FIELD_DEFS, isFieldId, type FieldId } from './fields';
import { brushCells, strokeSampleCount, transportOpen } from './grid';
import { recordInput } from './ledger';
import { recordBirth } from './lineage';
import { canOccupy, initialDecisionTimer } from './movement';
import { founderDraw, ModuleSetError } from './founders';
import { isMutationPreset } from './mutation';
import { validateModuleSet } from './modules';
import { markField, updateDerived } from './transport';
import { rebuildIndex } from './spatial';
import { initFounder } from './branches';
import { applyLineage, isIntervention, type LineageOp } from './specimens';
import { detFloat, detPermutation, STREAMS } from './rng';
import { applyHabitatEdit, LAB_MAX_POINTS, LAB_MAX_STROKE_SAMPLES, type HabitatEditPayload, type HabitatMoved, type HabitatSkips } from './structures';
import type { World, WorldSettings } from './world';
import { speciesIndex } from './world';

export type CommandPayload =
  /** Lab habitat paint, shade and structures (P2.7; semantics in structures.ts applyHabitatEdit). */
  | HabitatEditPayload
  | { kind: 'inoculate'; speciesId: string; x: number; y: number; radius: number; count: number }
  | { kind: 'deposit'; materialId: string; points: ReadonlyArray<readonly [number, number]>; radius: number; dose: number }
  | { kind: 'setLid'; lid: WorldSettings['lid'] }
  | { kind: 'setMutationPreset'; preset: WorldSettings['mutationPreset'] }
  /** Branch names and pins, saving and spawning specimens (P2.3; semantics in specimens.ts). */
  | ({ readonly kind: 'lineage' } & LineageOp);

export interface CommandResult {
  readonly accepted: number;
  readonly rejected: number;
  readonly note?: string;
  /** Habitat edits (P2.7): why covered cells were refused (outside the rim, a structure, a live organism, sealed in). */
  readonly skipped?: HabitatSkips;
  /** Habitat edits (P2.7): material a new stone or wall moved into neighboring open cells (totals unchanged). */
  readonly moved?: HabitatMoved;
  /** Evolution-setting change (P2.2): the setting it replaced, so the log alone says what changed and when. */
  readonly presetFrom?: WorldSettings['mutationPreset'];
}

export interface Command {
  readonly commandId: string;
  readonly seq: number;
  readonly targetTick: number;
  readonly payload: CommandPayload;
  result?: CommandResult;
}

/** Queue a command for its target tick. Returns the stamped command. */
export function queueCommand(world: World, commandId: string, payload: CommandPayload, targetTick = world.tick): Command {
  if (targetTick < world.tick) throw new Error(`command ${commandId} targets past tick ${targetTick}`);
  const cmd: Command = { commandId, seq: world.commands.nextSeq++, targetTick, payload };
  world.commands.pending.push(cmd);
  world.commands.pending.sort((a, b) => a.targetTick - b.targetTick || a.seq - b.seq);
  return cmd;
}

/** Apply every pending command due at the world's current tick (stage 1). */
export function stageCommands(world: World): void {
  const due: Command[] = [];
  const rest: Command[] = [];
  for (const cmd of world.commands.pending) (cmd.targetTick <= world.tick ? due : rest).push(cmd);
  world.commands.pending = rest;
  if (due.length === 0) return;
  // Capacity checks read cell load: rebuild it from live state so a reloaded world and an
  // uninterrupted one see exactly the same values.
  rebuildIndex(world);
  for (const cmd of due) applyCommand(world, cmd);
}

/** Paused edit transaction: queue at the current tick and apply now without advancing time. */
export function applyNow(world: World, commandId: string, payload: CommandPayload): Command {
  const cmd = queueCommand(world, commandId, payload, world.tick);
  stageCommands(world);
  // A paused edit is a complete transaction: fold transient bookkeeping now so nothing live is
  // left outside saved state, and leave derived state exactly as a reload would rebuild it.
  if (world.capacityHitThisTick) {
    world.capacityLimitedTicks++;
    world.history.pendingCapacity = true;
    world.capacityHitThisTick = false;
  }
  rebuildIndex(world);
  updateDerived(world);
  return cmd;
}

function applyCommand(world: World, cmd: Command): void {
  const p = cmd.payload;
  const interventionsBefore = world.history.pendingInterventions;
  let result: CommandResult;
  switch (p.kind) {
    case 'inoculate':
      result = inoculate(world, cmd, p);
      break;
    case 'deposit':
      result = deposit(world, p);
      break;
    case 'setLid':
      world.settings.lid = p.lid;
      result = { accepted: 1, rejected: 0 };
      break;
    case 'setMutationPreset':
      result = setMutationPreset(world, p.preset);
      // P2.2: a choice that changed nothing (the setting already in effect, or an unknown one) is no
      // intervention, so the History charts never mark a second where nothing changed.
      if (result.accepted === 0) world.history.pendingInterventions--;
      break;
    case 'lineage':
      result = applyLineage(world, p, introduceOrganism);
      // Names, pins and saved specimens are notebook labels, not interventions on the dish (the chart
      // marks below count only changes to the dish; spawning a specimen is one).
      if (!isIntervention(p)) world.history.pendingInterventions--;
      break;
    case 'paintSubstrate':
    case 'paintShade':
    case 'placeStructure':
    case 'eraseStructure':
      result = applyHabitatEdit(world, p);
      break;
  }
  cmd.result = result;
  world.commands.log.push(cmd);
  if (world.commands.log.length > 10000) world.commands.log.splice(0, world.commands.log.length - 10000);
  world.history.pendingInterventions++;
  // P2.8: a command that placed or changed nothing (accepted 0) is no change to the dish, so History and
  // the regional trait charts never mark it (like D-0028: it is no undo point either). The cases above
  // that already took their count back are left as they are.
  if (result.accepted === 0 && world.history.pendingInterventions > interventionsBefore) world.history.pendingInterventions--;
  emit(world.events, world.counters, {
    tick: world.tick,
    type: 'command',
    amount: result.accepted,
    detail: { kind: p.kind, accepted: result.accepted, rejected: result.rejected, seq: cmd.seq },
  });
}

/**
 * Change the evolution setting (SPEC §8.6, P2.2): a timestamped intervention. The command log records
 * the tick it took effect (targetTick) and the setting it replaced (presetFrom); it is undoable like any
 * other command. Rates are per daughter at proposal time, so nothing already drawn is redrawn. An
 * unknown setting is refused; choosing the current one changes nothing (accepted 0: no undo point).
 */
function setMutationPreset(world: World, preset: unknown): CommandResult {
  if (!isMutationPreset(preset)) return { accepted: 0, rejected: 1, note: 'unknown evolution setting' };
  const from = world.settings.mutationPreset;
  if (preset === from) return { accepted: 0, rejected: 0, note: 'unchanged' };
  world.settings.mutationPreset = preset;
  return { accepted: 1, rejected: 0, presetFrom: from };
}

/** Cells covered by a stroke: disks at points sampled ≤ 1 cell apart, each cell once, row-major. */
export function strokeCells(points: ReadonlyArray<readonly [number, number]>, radius: number): number[] {
  // eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated
  const seen = new Set<number>();
  const out: number[] = [];
  const add = (x: number, y: number) => {
    for (const cell of brushCells(x, y, radius)) {
      if (!seen.has(cell)) {
        seen.add(cell);
        out.push(cell);
      }
    }
  };
  for (let k = 0; k < points.length; k++) {
    const [x, y] = points[k]!;
    if (k === 0) {
      add(x, y);
      continue;
    }
    const [px, py] = points[k - 1]!;
    const dist = Math.hypot(x - px, y - py);
    const steps = Math.max(1, Math.ceil(dist));
    for (let s = 1; s <= steps; s++) add(px + ((x - px) * s) / steps, py + ((y - py) * s) / steps);
  }
  return out.sort((a, b) => a - b);
}

/** Largest food-brush radius a deposit may carry (the UI sends 1, 3 or 6; recipes and cards use 0–6). */
const DEPOSIT_MAX_RADIUS = 6;

/**
 * Why a deposit stroke is malformed, or null. strokeCells walks every sampled cell of the path, so a
 * crafted, damaged or replayed command is bounded like a Lab habitat edit (structures.ts
 * invalidHabitatEdit): a finite radius in 0–6, finite points near the dish, at most LAB_MAX_POINTS
 * points and LAB_MAX_STROKE_SAMPLES sampled disks. Refused whole; nothing is placed.
 */
export function invalidDepositStroke(points: unknown, radius: unknown): string | null {
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius < 0 || radius > DEPOSIT_MAX_RADIUS) return 'invalid radius';
  if (!Array.isArray(points) || points.length === 0) return 'empty stroke';
  if (points.length > LAB_MAX_POINTS) return 'stroke too long';
  const margin = DEPOSIT_MAX_RADIUS + 2;
  for (const pt of points as readonly unknown[]) {
    if (!Array.isArray(pt) || pt.length !== 2) return 'invalid point';
    const x: unknown = pt[0];
    const y: unknown = pt[1];
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return 'invalid point';
    if (x < -margin || y < -margin || x > GRID_W + margin || y > GRID_H + margin) return 'point outside the dish area';
  }
  const pts = points as ReadonlyArray<readonly [number, number]>;
  if (strokeSampleCount(pts, LAB_MAX_STROKE_SAMPLES) > LAB_MAX_STROKE_SAMPLES) return 'stroke too long';
  return null;
}

function deposit(world: World, p: Extract<CommandPayload, { kind: 'deposit' }>): CommandResult {
  const bad = invalidDepositStroke(p.points, p.radius);
  if (bad) return { accepted: 0, rejected: 0, note: bad };
  const mat = world.content.materials.find((m) => m.id === p.materialId);
  if (!mat) return { accepted: 0, rejected: 0, note: `unknown material ${p.materialId}` };
  if (!(p.dose >= 0) || !Number.isFinite(p.dose)) return { accepted: 0, rejected: 0, note: 'invalid dose' };
  if (!isFieldId(mat.target)) return { accepted: 0, rejected: 0, note: `material ${mat.id} is not a field material` };
  const target: FieldId = mat.target;
  const field = world.fields[target];
  if (!field) return { accepted: 0, rejected: 0, note: `field ${target} is not enabled in this world` };
  const def = FIELD_DEFS[target];
  const comp = def.companion ? world.fields[def.companion] : undefined;
  const nPerC = mat.companionNutrientPerCarbon;
  const cells = strokeCells(p.points, p.radius);
  let accepted = 0;
  let rejected = 0;
  let addC = 0;
  let addN = 0;
  let addM = 0;
  for (const cell of cells) {
    if (!transportOpen(world.grid, cell)) {
      rejected++;
      continue;
    }
    accepted++;
    field[cell]! += p.dose;
    if (def.material === 'carbon') addC += p.dose * (def.carbonPerUnit ?? 1);
    else if (def.material === 'nutrient') addN += p.dose;
    else if (def.material === 'mineral') addM += p.dose;
    if (comp && nPerC > 0) {
      comp[cell]! += p.dose * nPerC;
      addN += p.dose * nPerC;
    }
  }
  if (addC || addN || addM) recordInput(world, `tool:${mat.id}`, addC, addN, addM);
  if (accepted > 0) {
    markField(world, target);
    if (def.companion && nPerC > 0) markField(world, def.companion);
  }
  return { accepted, rejected };
}

function inoculate(world: World, cmd: Command, p: Extract<CommandPayload, { kind: 'inoculate' }>): CommandResult {
  // A phage dose (SPEC §10.2; viruses.ts): units into cells, never an organism. accepted/rejected count cells.
  if (isFieldVirus(p.speciesId)) return dosePhage(world, p.speciesId, p.x, p.y, p.radius, p.count);
  let spIdx: number;
  try {
    spIdx = speciesIndex(world, p.speciesId);
  } catch {
    return { accepted: 0, rejected: p.count, note: `species ${p.speciesId} is not enabled` };
  }
  const sp = world.species[spIdx]!;
  const cells = brushCells(p.x, p.y, p.radius).filter((cell) => canOccupy(world, sp, cell));
  if (cells.length === 0) return { accepted: 0, rejected: p.count, note: 'no compatible cells' };
  const order = detPermutation(cells.length, world.seed, STREAMS.inoculate, cmd.seq);
  const load = world.derived.cellLoad;
  let accepted = 0;
  let k = 0;
  let capacityHit = false;
  for (let n = 0; n < p.count; n++) {
    // Round-robin over the shuffled cells, skipping cells at soft capacity.
    let placed = false;
    for (let tries = 0; tries < cells.length; tries++) {
      const cell = cells[order[(k + tries) % cells.length]!]!;
      if (load[cell]! + 1 > CELL_SOFT_CAPACITY) continue;
      const slot = introduceOrganism(world, spIdx, cell, 'tool');
      if (slot < 0) {
        capacityHit = true;
        break;
      }
      load[cell]! += 1;
      k = (k + tries + 1) % cells.length;
      placed = true;
      accepted++;
      break;
    }
    if (!placed) break;
  }
  if (capacityHit) world.capacityHitThisTick = true;
  return { accepted, rejected: p.count - accepted, ...(capacityHit ? { note: 'capacity' } : {}) };
}

/**
 * Create a new external organism with ordinary founder inventories (SPEC §6.1) at a jittered point
 * inside `cell`. Its material is logged as an external input. Returns the slot or -1 at capacity.
 */
export function introduceOrganism(
  world: World,
  spIdx: number,
  cell: number,
  source: string,
  opts: { modules?: readonly string[]; exactCenter?: boolean; origin?: number; /** An existing genome (specimen spawn, P2.3). */ genome?: number } = {},
): number {
  const e = world.ents;
  // An illegal module set is refused before anything is allocated or logged (SPEC §9).
  if (opts.modules && opts.modules.length > 0) {
    const problem = validateModuleSet(world, world.species[spIdx]!.id, [...opts.modules].sort());
    if (problem) throw new ModuleSetError(`cannot introduce ${world.species[spIdx]!.id}: ${problem}`);
  }
  if (fungalIntroductionRefused(world, spIdx)) return -1; // 2,000 fungal segments (SPEC §2.5; fungi.ts)
  // A field virus (V01) is units in a field, never an organism (SPEC §7.5, §10.2; viruses.ts dosePhage).
  if (isFieldVirus(world.species[spIdx]!.id)) throw new Error(`cannot introduce ${world.species[spIdx]!.id}: a virus is dosed as field units`);
  const slot = e.allocate();
  if (slot < 0) return -1;
  const c = e.cols;
  const sp = world.species[spIdx]!;
  const b0 = sp.def.b0;
  const birthId = world.counters.nextBirthId++;
  // A Diverse founder's seeded module is present at creation (lineage origin 2, SPEC §8.6; P2.2).
  const draw = opts.genome === undefined ? founderDraw(world, spIdx, birthId, opts.modules ?? []) : null;
  const genome = opts.genome ?? draw!.genome;
  const x = cell % GRID_W;
  const y = Math.floor(cell / GRID_W);
  const jx = opts.exactCenter ? 0.5 : 0.2 + 0.6 * detFloat(world.seed, STREAMS.jitter, birthId, 0);
  const jy = opts.exactCenter ? 0.5 : 0.2 + 0.6 * detFloat(world.seed, STREAMS.jitter, birthId, 1);
  c.species[slot] = spIdx;
  c.genome[slot] = genome;
  c.entityId[slot] = world.counters.nextEntityId++;
  c.birthId[slot] = birthId;
  c.x[slot] = x + jx;
  c.y[slot] = y + jy;
  c.B[slot] = b0;
  c.N[slot] = INITIAL_NUTRIENT_RATIO * b0;
  c.E[slot] = INITIAL_ENERGY;
  c.H[slot] = INITIAL_HEALTH;
  c.age[slot] = 0;
  c.lifeState[slot] = 0;
  c.flags[slot] = FLAG.introduced | (sp.attached ? FLAG.attached : 0);
  c.suitability[slot] = 1;
  c.lastIntakeTick[slot] = -1;
  c.decisionTimer[slot] = initialDecisionTimer(world, birthId);
  let mineral = 0;
  if (sp.abilities.includes('SHELL')) {
    mineral = 0.1 * b0;
    c.boundMineral[slot] = mineral;
  }
  recordInput(world, `introduce:${source}`, b0, INITIAL_NUTRIENT_RATIO * b0, mineral);
  initFounder(world, slot);
  recordBirth(world.lineage, birthId, {
    parent: 0,
    genome,
    tick: world.tick,
    generation: 0,
    species: spIdx,
    entityId: c.entityId[slot],
    origin: draw?.seededModule ? 2 : (opts.origin ?? 1),
  });
  emit(world.events, world.counters, { tick: world.tick, type: 'introduce', species: spIdx, birthId, cell, detail: { source } });
  milestone(world.events, 'firstIntroduce', world.tick);
  return slot;
}
