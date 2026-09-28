/**
 * The dish host: owns worlds, runs the active one in real time, answers requests.
 * Environment-agnostic (no DOM): sim.worker.ts wires it to postMessage; tests drive it directly.
 *
 * Time model: at speed s the host aims for 10·s ticks per real second. Each pump runs due ticks
 * within a work budget; if it falls behind it drops the backlog (never skips biological ticks or
 * changes dt) and reports the effective speed it actually achieved (SPEC §3.1, §16).
 */
import { applyNow, type CommandPayload } from '@sim/commands';
import type { ContentRegistry } from '@sim/content/registry';
import { realizeRecipe } from '@sim/recipes';
import { deserializeWorld, serializeWorld, stateHash, type WorldState } from '@sim/serialize';
import { step } from '@sim/tick';
import type { World } from '@sim/world';
import { allocatedFieldIds } from '@sim/fields';
import { buildFamily, buildInspector, packDeposits, packEntities, packOverlay, visualEvents } from './snapshot';
import { buildLineage, packLineageMarks } from '@sim/lineage';
import type { LineageMarks, LineageView } from './protocol';
import { stamp, type DishInfo, type DishSource, type Envelope, type FromWorker, type OverlayId, type Selection, type SlotSummary, type SnapshotMsg, type Speed, type ToWorker } from './protocol';
import { captureBaseline, PairedRun, realizeArm, type CompareSpeed, type CompareStatus, type ComparisonResults, type ComparisonState, type Intervention } from './comparison';
import { buildSaveFile, loadSaveFile, SaveFileError } from '@persist/saveFile';
import { AUTOSAVE_SLOT, type SaveStore, type SlotInfo } from '@persist/store';

export interface HostClock {
  now(): number;
  /** Wall-clock ISO timestamp for save metadata (never enters the simulation). */
  iso?(): string;
}

function summary(s: SlotInfo): SlotSummary {
  return { slotId: s.slotId, name: s.name, tick: s.tick, savedAt: s.savedAt, recipeId: s.recipeId, bytes: s.bytes };
}

interface Dish {
  readonly id: string;
  world: World;
  name: string;
  speed: Speed;
  acc: number;
  gen: number;
  lastEventId: number;
  lastGeometryVersion: number;
  overlay: OverlayId | null;
  selection: Selection | null;
  undo: WorldState | null;
  /** Last known-good state and the commands applied since, for rollback on error (ARCH §7). */
  checkpoint: WorldState;
  replay: { readonly tick: number; readonly commandId: string; readonly payload: CommandPayload }[];
  ticksWindow: number[];
  effectiveSpeed: number;
  failed: boolean;
  /** Set on the two worlds of a comparison (SPEC §13.4); their time is driven only by the comparison. */
  arm: { readonly compareId: string; readonly role: 'A' | 'B' } | null;
  /** Trait overlay / lineage highlight requested by the lineage panel (P2.3; render-only). */
  lineageView?: LineageView | null;
}

/**
 * An open comparison (worker state, never simulation state). The baseline is stored once; A and B
 * are separate dishes realized from it. Deleting it removes A, B and the baseline only.
 */
interface Comparison {
  readonly id: string;
  readonly sourceDishId: string;
  readonly aDishId: string;
  readonly bDishId: string;
  readonly baseline: WorldState;
  readonly priorSpeed: Speed;
  status: CompareStatus;
  horizonTicks: number | null;
  speed: CompareSpeed;
  acc: number;
  lastSnapshot: number;
  interventions: Intervention[];
  run: PairedRun | null;
  results: ComparisonResults | null;
  error: string | null;
}

const MAX_PUMP_MS = 30;
const SNAPSHOT_INTERVAL_MS = 100;
const MAX_BACKLOG_TICKS = 20;
/** A fresh rollback checkpoint every 30 simulated seconds (serialize ≈ 20 ms at 700 organisms). */
const CHECKPOINT_TICKS = 300;
/** Requests that change a world and are rolled back if they throw part-way. */
const MUTATING = new Set<ToWorker['type']>(['command', 'step', 'undo']);
/** Upper bound on comparison pairs per pump at 'max' pacing (the work budget usually stops sooner). */
const MAX_COMPARE_PAIRS_PER_PUMP = 400;

export class DishHost {
  private readonly dishes: Record<string, Dish> = {};
  private active: string | null = null;
  private comparison: Comparison | null = null;
  private lastPump: number;
  private lastSnapshot = 0;

  constructor(
    private readonly registry: ContentRegistry,
    private readonly postRaw: (msg: FromWorker & Envelope, transfer?: Transferable[]) => void,
    private readonly clock: HostClock,
    private readonly store: SaveStore | null = null,
    private readonly persistent = false,
  ) {
    this.lastPump = clock.now();
  }

  /** Every packet leaves stamped with the protocol version. */
  private post(msg: FromWorker, transfer?: Transferable[]): void {
    this.postRaw(stamp(msg), transfer);
  }

  private iso(): string {
    return this.clock.iso ? this.clock.iso() : new Date(0).toISOString();
  }

  /** Asynchronous requests (storage, checksums). Errors are reported, never thrown. */
  async handleAsync(msg: ToWorker): Promise<void> {
    try {
      switch (msg.type) {
        case 'saveSlot':
        case 'autosave': {
          const d = this.need(msg.dishId);
          if (!this.store) throw new Error('Saving is unavailable on this device.');
          const slotId = msg.type === 'autosave' ? AUTOSAVE_SLOT : msg.slotId;
          const name = msg.type === 'autosave' ? d.name : msg.name;
          if (msg.type === 'saveSlot') d.name = name;
          const savedAt = this.iso();
          const built = await buildSaveFile(d.world, { name, savedAt, recipeId: d.world.content.provenance.recipeId });
          const info = await this.store.save({ slotId, text: built.text, checksum: built.checksum, name, tick: d.world.tick, savedAt, recipeId: d.world.content.provenance.recipeId });
          this.post({ type: 'slotSaved', requestId: msg.requestId, slot: summary(info) });
          return;
        }
        case 'listSlots': {
          const slots = this.store ? await this.store.list() : [];
          this.post({ type: 'slots', requestId: msg.requestId, slots: slots.map(summary), persistent: this.persistent });
          return;
        }
        case 'loadSlot': {
          if (!this.store) throw new Error('Saving is unavailable on this device.');
          const res = await this.store.load(msg.slotId, async (text) => {
            await loadSaveFile(text);
            return true;
          });
          if (!res) throw new SaveFileError('That save could not be read, and no earlier copy was usable.', 'integrity');
          const { file, world } = await loadSaveFile(res.text);
          const dish = this.addDish(msg.newDishId, world, file.meta.name);
          this.post({ type: 'loaded', requestId: msg.requestId, info: this.info(dish), usedPredecessor: res.usedPredecessor });
          this.sendSnapshot(dish);
          return;
        }
        case 'deleteSlot': {
          await this.store?.remove(msg.slotId);
          this.post({ type: 'done', requestId: msg.requestId });
          return;
        }
        case 'exportDish': {
          const d = this.need(msg.dishId);
          const built = await buildSaveFile(d.world, { name: d.name, savedAt: this.iso(), recipeId: d.world.content.provenance.recipeId }, { stripNames: msg.strip });
          const base = (msg.strip ? 'shared-dish' : d.name).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'dish';
          this.post({ type: 'exported', requestId: msg.requestId, text: built.text, filename: `${base}.pixelmeba` });
          return;
        }
        case 'importDish': {
          const { file, world } = await loadSaveFile(msg.text);
          const dish = this.addDish(msg.newDishId, world, file.meta.name);
          this.post({ type: 'loaded', requestId: msg.requestId, info: this.info(dish), usedPredecessor: false });
          this.sendSnapshot(dish);
          return;
        }
        default:
          this.handle(msg);
      }
    } catch (e) {
      this.post({
        type: 'error',
        dishId: 'dishId' in msg ? msg.dishId : '',
        requestId: 'requestId' in msg ? msg.requestId : undefined,
        message: e instanceof Error ? e.message : String(e),
        lastValidTick: 0,
        ...(e instanceof SaveFileError ? { kind: e.kind } : {}),
      } as FromWorker);
    }
  }

  private addDish(id: string, world: World, name: string): Dish {
    const dish = this.makeDish(id, world, name, serializeWorld(world));
    this.dishes[id] = dish;
    this.active = id;
    return dish;
  }

  private makeDish(id: string, world: World, name: string, checkpoint: WorldState): Dish {
    return {
      id,
      world,
      name,
      speed: 0,
      acc: 0,
      gen: 0,
      lastEventId: world.counters.nextEventId - 1,
      lastGeometryVersion: -1,
      overlay: null,
      selection: null,
      undo: null,
      checkpoint,
      replay: [],
      ticksWindow: [],
      effectiveSpeed: 0,
      failed: false,
      arm: null,
    };
  }

  get activeDishId(): string | null {
    return this.active;
  }

  world(dishId: string): World | null {
    return this.dishes[dishId]?.world ?? null;
  }

  handle(msg: ToWorker): void {
    const target = 'dishId' in msg ? this.dishes[msg.dishId] : undefined;
    const tickBefore = target?.world.tick ?? 0;
    try {
      this.dispatch(msg);
    } catch (e) {
      const dishId = 'dishId' in msg ? msg.dishId : '';
      const dish = this.dishes[dishId];
      if (dish) {
        dish.speed = 0;
        dish.failed = true;
        // A request that threw part-way may have left partial changes: restore the last valid state.
        if (dish === target && MUTATING.has(msg.type)) this.rollback(dish, tickBefore);
      }
      this.post({
        type: 'error',
        dishId,
        ...('requestId' in msg ? { requestId: msg.requestId } : {}),
        message: e instanceof Error ? e.message : String(e),
        lastValidTick: dish?.world.tick ?? 0,
      });
    }
  }

  private dispatch(msg: ToWorker): void {
    switch (msg.type) {
      case 'create': {
        const world = this.build(msg.source, msg.dishId);
        const dish = this.addDish(msg.dishId, world, msg.name ?? world.content.provenance.recipeId ?? 'Dish');
        this.post({ type: 'ready', requestId: msg.requestId, info: this.info(dish) });
        this.sendSnapshot(dish);
        return;
      }
      case 'dispose':
        // Comparison worlds leave only with their comparison (compareDelete).
        if (this.dishes[msg.dishId]?.arm && this.comparison?.id === this.dishes[msg.dishId]!.arm!.compareId) return;
        delete this.dishes[msg.dishId];
        if (this.active === msg.dishId) this.active = null;
        return;
      case 'activate': {
        const d = this.need(msg.dishId);
        this.active = d.id;
        d.lastGeometryVersion = -1;
        this.sendSnapshot(d);
        return;
      }
      case 'setSpeed': {
        const d = this.need(msg.dishId);
        if (d.failed || d.arm) return; // a comparison arm's time is driven only by the comparison
        d.speed = msg.speed;
        d.acc = 0;
        this.sendSnapshot(d);
        return;
      }
      case 'step': {
        const d = this.need(msg.dishId);
        if (d.failed || d.arm) return;
        d.speed = 0;
        step(d.world);
        this.sendSnapshot(d);
        return;
      }
      case 'command': {
        const d = this.need(msg.dishId);
        if (d.arm) {
          this.armCommand(d, msg);
          return;
        }
        const before = msg.undoable ? serializeWorld(d.world) : null;
        const tick = d.world.tick;
        const cmd = applyNow(d.world, msg.commandId, msg.payload);
        if (before) {
          d.undo = before;
          // The pre-command state doubles as the rollback checkpoint.
          d.checkpoint = before;
          d.replay = [];
        }
        d.replay.push({ tick, commandId: msg.commandId, payload: msg.payload });
        this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: cmd.result ?? null });
        this.sendSnapshot(d);
        return;
      }
      case 'undo': {
        const d = this.need(msg.dishId);
        if (d.arm) {
          this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: null, error: 'Comparison copies are not rewound; clear the change on B instead.' });
          return;
        }
        if (!d.undo) {
          this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: null, error: 'nothing to undo' });
          return;
        }
        d.world = deserializeWorld(d.undo);
        d.checkpoint = d.undo;
        d.replay = [];
        d.undo = null;
        d.speed = 0;
        d.lastEventId = d.world.counters.nextEventId - 1;
        d.lastGeometryVersion = -1;
        this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: null });
        this.sendSnapshot(d);
        return;
      }
      case 'view': {
        const d = this.need(msg.dishId);
        d.overlay = msg.overlay;
        d.selection = msg.selection;
        this.sendSnapshot(d);
        return;
      }
      case 'save': {
        const d = this.need(msg.dishId);
        const state = serializeWorld(d.world);
        this.post({ type: 'saved', requestId: msg.requestId, dishId: d.id, json: JSON.stringify(state), hash: stateHash(d.world), tick: d.world.tick });
        return;
      }
      case 'duplicate': {
        const d = this.need(msg.dishId);
        const state = { ...serializeWorld(d.world), worldId: `${d.world.worldId}+${msg.newDishId}` };
        const copy = deserializeWorld(state);
        this.dishes[msg.newDishId] = {
          ...d,
          id: msg.newDishId,
          world: copy,
          name: `${d.name} (copy)`,
          speed: 0,
          undo: null,
          checkpoint: state,
          replay: [],
          failed: false,
          ticksWindow: [],
          lastGeometryVersion: -1,
          selection: null,
          arm: null,
        };
        this.post({ type: 'ready', requestId: msg.requestId, info: this.info(this.dishes[msg.newDishId]!) });
        return;
      }
      case 'hash': {
        const d = this.need(msg.dishId);
        this.post({ type: 'hash', requestId: msg.requestId, dishId: d.id, hash: stateHash(d.world), tick: d.world.tick });
        return;
      }
      case 'history': {
        const d = this.need(msg.dishId);
        const h = d.world.history;
        const seconds = msg.lastSeconds !== undefined && msg.lastSeconds >= 0 ? h.seconds.slice(-msg.lastSeconds) : h.seconds;
        this.post({ type: 'history', requestId: msg.requestId, dishId: d.id, seconds, minutes: h.minutes, compacted: h.compacted });
        return;
      }
      case 'family': {
        // Read-only: answers from lineage records and entity columns, never touches the world.
        const d = this.need(msg.dishId);
        this.post({ type: 'family', requestId: msg.requestId, dishId: d.id, family: buildFamily(d.world, msg.birthId) });
        return;
      }
      case 'lineage': {
        // Read-only (P2.3): branch records, candidates, specimens and one branch's detail.
        const d = this.need(msg.dishId);
        this.post({ type: 'lineage', requestId: msg.requestId, dishId: d.id, lineage: buildLineage(d.world, { branch: msg.branch, birthId: msg.birthId }) });
        return;
      }
      case 'lineageView': {
        const d = this.need(msg.dishId);
        d.lineageView = msg.view && (msg.view.locus !== null || msg.view.branch !== null) ? msg.view : null;
        this.sendSnapshot(d);
        return;
      }
      case 'compareStart':
        this.compareStart(msg);
        return;
      case 'compareReset': {
        const c = this.needCompare(msg.compareId);
        if (c.status !== 'setup') throw new Error('The change on B can only be cleared before the run starts.');
        c.interventions = [];
        this.resetB(c);
        this.postCompare(c, msg.requestId);
        return;
      }
      case 'compareRun': {
        const c = this.needCompare(msg.compareId);
        if (c.status !== 'setup') throw new Error('This comparison has already run.');
        const a = this.dishes[c.aDishId]!;
        const b = this.dishes[c.bDishId]!;
        c.run = new PairedRun(c.baseline, a.world, b.world, msg.horizonTicks);
        c.horizonTicks = msg.horizonTicks;
        c.speed = msg.speed;
        c.acc = 0;
        c.lastSnapshot = -Infinity;
        c.status = 'running';
        this.postCompare(c, msg.requestId);
        return;
      }
      case 'compareSpeed': {
        const c = this.needCompare(msg.compareId);
        c.speed = msg.speed;
        c.acc = 0;
        this.postCompare(c);
        return;
      }
      case 'compareStop': {
        const c = this.needCompare(msg.compareId);
        if (c.status === 'running') this.finishComparison(c);
        this.postCompare(c, msg.requestId);
        return;
      }
      case 'compareDelete': {
        const c = this.comparison;
        if (c && c.id === msg.compareId) {
          // Only the comparison's own worlds and baseline go. The source dish and every save slot stay.
          delete this.dishes[c.aDishId];
          delete this.dishes[c.bDishId];
          if (this.active === c.aDishId || this.active === c.bDishId) this.active = null;
          this.comparison = null;
        }
        this.post({ type: 'done', requestId: msg.requestId });
        return;
      }
      case 'release':
        return;
      case 'saveSlot':
      case 'autosave':
      case 'listSlots':
      case 'loadSlot':
      case 'deleteSlot':
      case 'exportDish':
      case 'importDish':
        void this.handleAsync(msg);
        return;
      default:
        // An unknown request must fail once, not bounce between handle() and handleAsync() forever.
        throw new Error(`unknown request ${String((msg as { type?: unknown }).type)}`);
    }
  }

  private needCompare(compareId: string): Comparison {
    const c = this.comparison;
    if (!c || c.id !== compareId) throw new Error('That comparison is no longer open.');
    return c;
  }

  private compareStart(msg: Extract<ToWorker, { type: 'compareStart' }>): void {
    if (this.comparison) throw new Error('A comparison is already open; finish or delete it first.');
    const src = this.need(msg.sourceDishId);
    if (src.arm) throw new Error('A comparison copy cannot start another comparison.');
    if (msg.aDishId === msg.bDishId || this.dishes[msg.aDishId] || this.dishes[msg.bDishId]) throw new Error('comparison dish ids must be new and distinct');
    // Blocking panel (UX §2): the source pauses; the UI restores its prior speed when the comparison closes.
    const priorSpeed = src.speed;
    src.speed = 0;
    src.acc = 0;
    const baseline = captureBaseline(src.world);
    const c: Comparison = {
      id: msg.compareId,
      sourceDishId: src.id,
      aDishId: msg.aDishId,
      bDishId: msg.bDishId,
      baseline,
      priorSpeed,
      status: 'setup',
      horizonTicks: null,
      speed: 4,
      acc: 0,
      lastSnapshot: -Infinity,
      interventions: [],
      run: null,
      results: null,
      error: null,
    };
    this.comparison = c;
    const a = this.addArm(c, 'A', src.name);
    const b = this.addArm(c, 'B', src.name);
    if (this.active === src.id) this.active = null;
    for (const iv of msg.interventions ?? []) {
      const cmd = applyNow(b.world, iv.commandId, iv.payload);
      c.interventions.push({ commandId: iv.commandId, payload: iv.payload, result: cmd.result ?? null });
    }
    this.postCompare(c, msg.requestId);
    this.sendSnapshot(a);
    this.sendSnapshot(b);
  }

  private armWorldId(c: Comparison, role: 'A' | 'B'): string {
    return `${c.baseline.worldId}+${c.id}:${role}`;
  }

  private addArm(c: Comparison, role: 'A' | 'B', sourceName: string): Dish {
    const id = role === 'A' ? c.aDishId : c.bDishId;
    const worldId = this.armWorldId(c, role);
    const dish = this.makeDish(id, realizeArm(c.baseline, worldId), `${sourceName} (${role})`, { ...c.baseline, worldId });
    dish.arm = { compareId: c.id, role };
    this.dishes[id] = dish;
    return dish;
  }

  /** B returns to the baseline exactly (a fresh realization of the stored baseline). */
  private resetB(c: Comparison): Dish {
    const b = this.dishes[c.bDishId]!;
    const worldId = this.armWorldId(c, 'B');
    b.world = realizeArm(c.baseline, worldId);
    b.checkpoint = { ...c.baseline, worldId };
    b.replay = [];
    b.undo = null;
    b.failed = false;
    b.lastEventId = b.world.counters.nextEventId - 1;
    b.lastGeometryVersion = -1;
    this.sendSnapshot(b);
    return b;
  }

  /**
   * A command sent to a comparison arm. Only B receives changes, only before the run, and through the
   * ordinary paused-edit path (applyNow), exactly as on any dish. A change that places nothing leaves B
   * identical to A. The baseline arm A never receives a command.
   */
  private armCommand(d: Dish, msg: Extract<ToWorker, { type: 'command' }>): void {
    const c = this.comparison;
    const refuse = (error: string) => this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: null, error });
    if (!c || !d.arm || c.id !== d.arm.compareId) return refuse('This comparison has ended.');
    if (d.arm.role === 'A') return refuse('A is the baseline and never receives changes; queue the change on B.');
    if (c.status !== 'setup') return refuse('Changes can only be queued on B before the run starts.');
    let result: Intervention['result'];
    try {
      result = applyNow(d.world, msg.commandId, msg.payload).result ?? null;
    } catch (e) {
      // Restore B to the baseline plus the changes already queued (deterministic), then report.
      const b = this.resetB(c);
      for (const iv of c.interventions) applyNow(b.world, iv.commandId, iv.payload);
      this.sendSnapshot(b);
      return refuse(e instanceof Error ? e.message : String(e));
    }
    if (!result || result.accepted === 0) {
      const b = this.resetB(c);
      for (const iv of c.interventions) applyNow(b.world, iv.commandId, iv.payload);
      this.sendSnapshot(b);
    } else {
      c.interventions.push({ commandId: msg.commandId, payload: msg.payload, result });
      this.sendSnapshot(d);
    }
    this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result });
    this.postCompare(c);
  }

  private compareState(c: Comparison): ComparisonState {
    return {
      compareId: c.id,
      sourceDishId: c.sourceDishId,
      aDishId: c.aDishId,
      bDishId: c.bDishId,
      baselineTick: c.baseline.tick,
      status: c.status,
      horizonTicks: c.horizonTicks,
      ticksRun: c.run?.ticksRun ?? 0,
      speed: c.speed,
      priorSpeed: c.priorSpeed,
      interventions: c.interventions,
      results: c.results,
      error: c.error,
    };
  }

  private postCompare(c: Comparison, requestId?: number): void {
    this.post({ type: 'compareState', ...(requestId !== undefined ? { requestId } : {}), state: this.compareState(c) });
  }

  private finishComparison(c: Comparison): void {
    c.status = 'complete';
    c.acc = 0;
    c.results = c.run!.results(c.interventions);
    this.sendSnapshot(this.dishes[c.aDishId]!);
    this.sendSnapshot(this.dishes[c.bDishId]!);
  }

  /**
   * Advance a running comparison. Wall-clock time only decides how many *pairs* run in this frame;
   * every pair steps A once and B once, and the run stops exactly at the horizon, so the two arms
   * always hold equal tick counts.
   */
  private pumpComparison(elapsed: number, now: number): void {
    const c = this.comparison;
    if (!c || c.status !== 'running' || !c.run) return;
    const run = c.run;
    const start = this.clock.now();
    if (c.speed === 'max') c.acc = MAX_COMPARE_PAIRS_PER_PUMP;
    else if (c.speed > 0) c.acc = Math.min(MAX_BACKLOG_TICKS, c.acc + (elapsed / 1000) * 10 * c.speed);
    while (c.acc >= 1 && !run.done) {
      try {
        run.stepPair();
      } catch (e) {
        c.status = 'failed';
        c.error = e instanceof Error ? e.message : String(e);
        this.postCompare(c);
        return;
      }
      c.acc -= 1;
      if (this.clock.now() - start > MAX_PUMP_MS) {
        c.acc = Math.min(c.acc, 1); // behind real time: drop the backlog, never a tick of either arm
        break;
      }
    }
    if (c.speed === 'max') c.acc = 0;
    if (run.done) {
      this.finishComparison(c);
      this.postCompare(c);
      return;
    }
    if (now - c.lastSnapshot >= SNAPSHOT_INTERVAL_MS) {
      c.lastSnapshot = now;
      this.sendSnapshot(this.dishes[c.aDishId]!);
      this.sendSnapshot(this.dishes[c.bDishId]!);
      this.postCompare(c);
    }
  }

  private need(dishId: string): Dish {
    const d = this.dishes[dishId];
    if (!d) throw new Error(`no dish ${dishId}`);
    return d;
  }

  private build(source: DishSource, dishId: string): World {
    if (source.kind === 'recipe') {
      const o = source.overrides;
      return realizeRecipe(this.registry, source.recipeId, {
        worldId: dishId,
        ...(source.seed !== undefined ? { seed: source.seed } : {}),
        ...(o
          ? {
              transform: (r) => ({
                ...r,
                ...(o.mutationPreset ? { mutationPreset: o.mutationPreset } : {}),
                ...(o.founderMode ? { founderMode: o.founderMode } : {}),
                ...(o.empty ? { founders: [], fieldPatches: [], scheduledCommands: [] } : {}),
              }),
            }
          : {}),
      });
    }
    return deserializeWorld(source.state);
  }

  private info(d: Dish): DishInfo {
    const w = d.world;
    const m = w.content.manifest;
    const partial = m.enabledModules.length < 17;
    return {
      dishId: d.id,
      worldId: w.worldId,
      name: d.name,
      seed: w.seed,
      tick: w.tick,
      speciesIds: w.species.map((s) => s.id),
      speciesNames: w.species.map((s) => s.def.name),
      speciesAssets: w.species.map((s) => s.def.assetId),
      materials: w.content.materials.map((mat) => ({ id: mat.id, name: mat.name, target: mat.target, doses: mat.doses, kind: mat.kind })),
      mutationPreset: w.settings.mutationPreset,
      founderMode: w.settings.founderMode,
      recipeId: w.content.provenance.recipeId,
      contentHash: m.contentHash,
      manifestLabel: partial ? 'Core prototype — quantitative evolution' : 'Standard Evolution',
      speciesHabitats: w.species.map((s) => [...s.def.habitats]),
      speciesSummaries: w.species.map((s) => s.def.guide.summary),
      materialSummaries: w.content.materials.map((mat) => mat.guide.summary),
      fieldIds: allocatedFieldIds(w.fields),
    };
  }

  /** Advance the active dish according to wall-clock time. Call frequently (≈ every 16 ms). */
  private checkpoint(d: Dish): void {
    d.checkpoint = serializeWorld(d.world);
    d.replay = [];
  }

  /**
   * Restore the dish to its state at `tick` (ARCH §7: an error preserves the last valid state): the
   * last checkpoint, plus the commands applied since, re-run deterministically. If the replay itself
   * fails, the checkpoint alone is kept.
   */
  private rollback(d: Dish, tick: number): void {
    let w = deserializeWorld(d.checkpoint);
    try {
      let k = 0;
      for (;;) {
        while (k < d.replay.length && d.replay[k]!.tick === w.tick) {
          const r = d.replay[k++]!;
          applyNow(w, r.commandId, r.payload);
        }
        if (w.tick >= tick) break;
        step(w);
      }
    } catch {
      w = deserializeWorld(d.checkpoint);
      d.replay = [];
    }
    d.world = w;
    d.lastEventId = Math.min(d.lastEventId, w.counters.nextEventId - 1);
    d.lastGeometryVersion = -1;
  }

  pump(): void {
    const now = this.clock.now();
    const elapsed = Math.min(250, now - this.lastPump);
    this.lastPump = now;
    this.pumpComparison(elapsed, now);
    const d = this.active ? this.dishes[this.active] : undefined;
    if (!d) return;
    let ran = 0;
    if (d.speed > 0 && !d.failed) {
      d.acc += (elapsed / 1000) * 10 * d.speed;
      if (d.acc > MAX_BACKLOG_TICKS) d.acc = MAX_BACKLOG_TICKS;
      const start = this.clock.now();
      while (d.acc >= 1) {
        if (d.world.tick - d.checkpoint.tick >= CHECKPOINT_TICKS) this.checkpoint(d);
        const t0 = d.world.tick;
        try {
          step(d.world);
        } catch (e) {
          d.speed = 0;
          d.failed = true;
          this.rollback(d, t0);
          this.post({ type: 'error', dishId: d.id, message: e instanceof Error ? e.message : String(e), lastValidTick: d.world.tick });
          break;
        }
        d.acc -= 1;
        ran++;
        if (this.clock.now() - start > MAX_PUMP_MS) {
          d.acc = Math.min(d.acc, 1); // drop backlog: we are behind real time
          break;
        }
      }
    }
    d.ticksWindow.push(now, ran);
    while (d.ticksWindow.length > 0 && now - d.ticksWindow[0]! > 2000) d.ticksWindow.splice(0, 2);
    let ticks = 0;
    for (let k = 1; k < d.ticksWindow.length; k += 2) ticks += d.ticksWindow[k]!;
    const span = Math.max(250, now - (d.ticksWindow[0] ?? now));
    d.effectiveSpeed = d.speed === 0 ? 0 : ticks / (span / 1000) / 10;
    if (now - this.lastSnapshot >= SNAPSHOT_INTERVAL_MS) this.sendSnapshot(d);
  }

  sendSnapshot(d: Dish): void {
    const w = d.world;
    this.lastSnapshot = this.clock.now();
    const packed = packEntities(w, null, null);
    const deposits = packDeposits(w, null);
    const overlay = d.overlay ? packOverlay(w, d.overlay, null) : null;
    const events = visualEvents(w.events.ring, d.lastEventId);
    const lv = d.lineageView;
    const lineage: LineageMarks | null = lv ? { locus: lv.locus, branch: lv.branch, ...packLineageMarks(w, lv.locus, lv.branch) } : null;
    d.lastEventId = w.counters.nextEventId - 1;
    let geometry: SnapshotMsg['geometry'] = null;
    if (d.lastGeometryVersion !== w.grid.geometryVersion) {
      geometry = {
        version: w.grid.geometryVersion,
        substrate: new Uint8Array(w.grid.substrate),
        structure: new Uint8Array(w.grid.structure),
        shade: new Float32Array(w.grid.shade),
      };
      d.lastGeometryVersion = w.grid.geometryVersion;
    }
    const msg: SnapshotMsg = {
      type: 'snapshot',
      dishId: d.id,
      gen: ++d.gen,
      tick: w.tick,
      speed: d.speed,
      effectiveSpeed: d.effectiveSpeed,
      count: packed.count,
      ents: packed.ents,
      ids: packed.ids,
      deposits,
      overlay: overlay && d.overlay ? { id: d.overlay, data: overlay.data, max: overlay.max } : null,
      geometry,
      events,
      selection: d.selection ? buildInspector(w, d.selection) : null,
      capacityReached: w.ents.count >= w.ents.capacity,
      speciesCounts: packed.speciesCounts,
      undoAvailable: d.undo !== null,
      ...(lineage ? { lineage } : {}),
    };
    const transfer: Transferable[] = [packed.ents.buffer, packed.ids.buffer, deposits.buffer];
    if (overlay) transfer.push(overlay.data.buffer);
    if (lineage) transfer.push(lineage.marks.buffer as ArrayBuffer);
    if (geometry) transfer.push(geometry.substrate.buffer, geometry.structure.buffer, geometry.shade.buffer);
    this.post(msg, transfer);
  }
}
