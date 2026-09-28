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
import type { RecipeDef } from '@sim/content/schema';
import { realizeRecipe, recipeOverridesOf, type RecipeOverridesRecord, type RecipeWorldProvenance } from '@sim/recipes';
import { deserializeWorld, serializeWorld, stateHash, type WorldState } from '@sim/serialize';
import { step } from '@sim/tick';
import type { World } from '@sim/world';
import { allocatedFieldIds } from '@sim/fields';
import { buildFamily, buildInspector, packDeposits, packEntities, packOverlay, visualEvents } from './snapshot';
import { buildLineage, packLineageMarks } from '@sim/lineage';
import type { LineageMarks, LineageView } from './protocol';
import { stamp, type DishInfo, type DishSource, type Envelope, type FromWorker, type OverlayId, type Selection, type SlotSummary, type SnapshotMsg, type Speed, type ToWorker } from './protocol';
import type { ExperimentStampMsg } from './protocol';
import { captureBaseline, PairedRun, realizeArm, type CompareSpeed, type CompareStatus, type ComparisonResults, type ComparisonState, type Intervention } from './comparison';
import type { ComparisonExperiment } from './comparison';
import { experimentCardView, experimentCatalog, GateWatch, inspectShowsFoodUse, PlayerSteps, realizeExperimentArms, stepSpecies, type PlayerStep } from '@sim/experiments';
import { PAIRED_RUN_LABEL, SINGLE_RUN_LABEL, stepObserved, type ArmObserver } from '@sim/pairedRun';
import { TICKS_PER_SECOND } from '@sim/constants';
import { isIntervention } from '@sim/specimens';
import { buildSaveFile, loadSaveFile, SaveFileError } from '@persist/saveFile';
import { AUTOSAVE_SLOT, type SaveStore, type SlotInfo } from '@persist/store';
import { SaveStore as SaveStoreClass } from '@persist/store';
import {
  MAX_WHAT_IF_CHOICES,
  nextVariantId,
  realizeAgain,
  realizeVariant,
  variantChecksums,
  variantPatchOutlines,
  variantPreview,
  variantRecordOf,
  VariantError,
  whatIfChoices,
  type VariantRecord,
} from '@sim/variants';
import type { WhatIfAnswer, WhatIfChoice, WhatIfKeep, WhatIfKept, WhatIfPlan, WhatIfRefusalCode } from './protocol';

export interface HostClock {
  now(): number;
  /** Wall-clock ISO timestamp for save metadata (never enters the simulation). */
  iso?(): string;
}

/** A readable What if? refusal (UX §3.4): nothing was started, saved or changed. */
class WhatIfRefusal extends Error {
  constructor(
    readonly code: WhatIfRefusalCode,
    message: string,
  ) {
    super(message);
    this.name = 'WhatIfRefusal';
  }
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
  /** Names, pins and saved specimens applied since the undoable command (P2.3): re-applied after Undo. */
  undoLabels?: { readonly commandId: string; readonly payload: CommandPayload }[];
  /** A single-arm experiment card running on this dish (P2.5): its gate is watched while it runs. */
  experiment?: SingleArmExperiment | null;
}

/** A single-arm experiment card's observation of its dish (worker state; never saved in the world). */
interface SingleArmExperiment {
  readonly watch: GateWatch;
  readonly obs: ArmObserver;
  readonly labels: readonly string[];
  /** The dish was changed or failed: the card's observation stopped (the dish itself goes on). */
  ended: boolean;
  /** The player steps the card lists, noted from UI events (CT §10.1); the stamp needs them all. */
  readonly steps: PlayerSteps;
  /** The species those steps follow (e.g. the Sprinters whose food use the inspector shows). */
  readonly species: readonly string[];
  /** The stamp as recorded when the measured gate held, kept until every listed step is taken. */
  pending: ExperimentStampMsg | null;
  /** The stamp was posted (the observation is complete). */
  posted: boolean;
}

/** An experiment card's paired run (P2.5): the card's own arms, observers and gate. */
interface LiveExperiment {
  readonly watch: GateWatch;
  readonly obsA: ArmObserver;
  readonly obsB: ArmObserver;
  readonly labels: readonly string[];
  readonly horizonTicks: number;
  measured: { readonly A: Readonly<Record<string, number>>; readonly B: Readonly<Record<string, number>> } | null;
  /** The player steps the card lists (results read, population history opened); the stamp needs them all. */
  readonly steps: PlayerSteps;
  /** The stamp as recorded when the measured gate held, kept until every listed step is taken. */
  pending: ExperimentStampMsg | null;
  posted: boolean;
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
  /** Set when this comparison is an experiment card's paired run (P2.5). */
  experiment?: LiveExperiment;
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
  /** What if? (P2.6): the named slot each dish was opened from or last saved to ("the active slot"). */
  private readonly ownSlots: Record<string, string> = {};
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
          if (msg.type === 'saveSlot') this.ownSlots[d.id] = slotId;
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
          if (msg.slotId !== AUTOSAVE_SLOT) this.ownSlots[dish.id] = msg.slotId;
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
        case 'whatIf':
        case 'whatIfStart':
          await this.handleWhatIf(msg);
          return;
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
        this.stepDish(d);
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
        // A command that placed nothing (accepted 0) left the dish unchanged: the card keeps observing.
        const changed = cmd.result === undefined || cmd.result.accepted > 0;
        if (d.experiment && !d.experiment.ended && changed && (msg.payload.kind !== 'lineage' || isIntervention(msg.payload))) this.endExperiment(d, 'changed');
        if (before) {
          d.undo = before;
          // The pre-command state doubles as the rollback checkpoint.
          d.checkpoint = before;
          d.replay = [];
        }
        if (before) d.undoLabels = [];
        else if (d.undo && msg.payload.kind === 'lineage' && !isIntervention(msg.payload)) (d.undoLabels ??= []).push({ commandId: msg.commandId, payload: msg.payload });
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
        // Names, pins and saved specimens made after the undone command are notebook labels, not part
        // of that change: re-apply them in their original order at the restored tick (P2.3).
        for (const l of d.undoLabels ?? []) {
          applyNow(d.world, l.commandId, l.payload);
          d.replay.push({ tick: d.world.tick, commandId: l.commandId, payload: l.payload });
        }
        d.undoLabels = [];
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
        this.experimentSteps(d);
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
          experiment: null,
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
        this.experimentHistoryOpened(d);
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
        // Render-only marks on this dish's snapshots (P2.3); the world is never touched.
        const d = this.need(msg.dishId);
        d.lineageView = msg.view && (msg.view.locus !== null || msg.view.branch !== null) ? msg.view : null;
        this.sendSnapshot(d);
        return;
      }
      case 'experimentCatalog':
        this.post({ type: 'experimentCatalog', requestId: msg.requestId, cards: experimentCatalog(this.registry).map((d) => experimentCardView(this.registry, d)) });
        return;
      case 'experimentStart':
        this.experimentStart(msg);
        return;
      case 'compareStart':
        this.compareStart(msg);
        return;
      case 'compareReset': {
        const c = this.needCompare(msg.compareId);
        if (c.status !== 'setup') throw new Error('The change on B can only be cleared before the run starts.');
        if (c.experiment) throw new Error("This experiment's change is part of the card and cannot be cleared.");
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
        const x = c.experiment;
        // An experiment card runs its own horizon (its stopping point) with the observers attached at its setup.
        c.run = x
          ? new PairedRun(c.baseline, a.world, b.world, x.horizonTicks, { obsA: x.obsA, obsB: x.obsB, inputBaseB: x.obsB.inputStart })
          : new PairedRun(c.baseline, a.world, b.world, msg.horizonTicks);
        c.horizonTicks = x ? x.horizonTicks : msg.horizonTicks;
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
      case 'whatIf':
      case 'whatIfStart':
        void this.handleAsync(msg);
        return;
      default:
        // An unknown request must fail once, not bounce between handle() and handleAsync() forever.
        throw new Error(`unknown request ${String((msg as { type?: unknown }).type)}`);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Experiment cards (P2.5; SPEC §13.2, UX §1 Notebook → Experiments). A card starts as a NEW paused
  // dish realized from its recipe and seed exactly as the headless runner realizes it
  // (realizeExperimentArms); a paired card opens its paired run through the comparison engine with
  // the card's one change already on B. The same GateWatch as the headless runner watches the gate;
  // reaching it posts the journal stamp and the world keeps running. Worker state only.

  private experimentStart(msg: Extract<ToWorker, { type: 'experimentStart' }>): void {
    const def = this.registry.experiments[msg.cardId];
    if (!def || def.phase > this.registry.manifest.buildPhase) throw new Error(`There is no experiment "${msg.cardId}" in this version of Pixelmeba.`);
    if (this.dishes[msg.newDishId]) throw new Error('That new dish id is already in use.');
    const ids = msg.compare;
    if (def.paired) {
      if (!ids) throw new Error('A paired experiment needs comparison ids.');
      if (this.comparison) throw new Error('A comparison is already open; finish or delete it first.');
      const all = [msg.newDishId, ids.aDishId, ids.bDishId];
      if (new Set(all).size !== 3 || all.some((id) => this.dishes[id])) throw new Error('comparison dish ids must be new and distinct');
    }
    const recipe = this.registry.recipes[def.recipeId]!;
    const labels = [...recipe.labels];
    // Labels such as "Seeded traits demonstration" travel with the dish name wherever it is shown.
    const name = [def.title, ...labels.filter((l) => !/^Experiment\b/.test(l))].join(' · ');
    const arms = realizeExperimentArms(this.registry, def, {
      worldIds: ids ? { A: `${msg.newDishId}+${ids.compareId}:A`, B: `${msg.newDishId}+${ids.compareId}:B`, shared: msg.newDishId } : { A: msg.newDishId },
    });
    const watch = new GateWatch(def, recipe, this.registry.manifest);
    const steps = new PlayerSteps(def);
    if (!def.paired || !ids || !arms.B || !arms.obsB) {
      const dish = this.addDish(msg.newDishId, arms.A, name);
      dish.experiment = { watch, obs: arms.obsA, labels, ended: false, steps, species: stepSpecies(def), pending: null, posted: false };
      this.post({ type: 'experimentStarted', requestId: msg.requestId, cardId: def.id, info: this.info(dish), compare: null });
      this.sendSnapshot(dish);
      return;
    }
    // Paired: the new dish holds the card's start (A's start state); A and B are the card's own arms.
    const baseline: WorldState = { ...serializeWorld(arms.A), worldId: msg.newDishId };
    const src = this.addDish(msg.newDishId, deserializeWorld(baseline), name);
    const horizonTicks = Math.round(def.stoppingSeconds * TICKS_PER_SECOND) - arms.startTick;
    const c: Comparison = {
      id: ids.compareId,
      sourceDishId: src.id,
      aDishId: ids.aDishId,
      bDishId: ids.bDishId,
      baseline,
      priorSpeed: 0,
      status: 'setup',
      horizonTicks,
      speed: 4,
      acc: 0,
      lastSnapshot: -Infinity,
      interventions: [...arms.interventions],
      run: null,
      results: null,
      error: null,
      experiment: { watch, obsA: arms.obsA, obsB: arms.obsB, labels, horizonTicks, measured: null, steps, pending: null, posted: false },
    };
    this.comparison = c;
    for (const [role, world] of [
      ['A', arms.A],
      ['B', arms.B],
    ] as const) {
      const id = role === 'A' ? c.aDishId : c.bDishId;
      const dish = this.makeDish(id, world, `${name} (${role})`, serializeWorld(world));
      dish.arm = { compareId: c.id, role };
      this.dishes[id] = dish;
    }
    this.active = null;
    this.post({ type: 'experimentStarted', requestId: msg.requestId, cardId: def.id, info: this.info(src), compare: this.compareState(c) });
    this.sendSnapshot(this.dishes[c.aDishId]!);
    this.sendSnapshot(this.dishes[c.bDishId]!);
  }

  /** The card's measurements in A and B now. */
  private experimentMeasured(run: PairedRun, x: LiveExperiment): NonNullable<LiveExperiment['measured']> {
    const m = x.watch.measured({ world: run.a, obs: x.obsA }, { world: run.b, obs: x.obsB });
    return { A: m.A, B: m.B ?? {} };
  }

  /**
   * After every pair of an experiment's paired run: watch the gate. When it holds, the stamp is recorded
   * with the values of that moment and posted once the card's player steps are taken too (the run goes on).
   */
  private experimentAfterPair(c: Comparison, run: PairedRun, x: LiveExperiment): void {
    const stamp = x.watch.afterTick({ world: run.a, obs: x.obsA }, { world: run.b, obs: x.obsB });
    if (!stamp) return;
    x.measured = this.experimentMeasured(run, x);
    x.pending = { stamp, title: x.watch.def.title, label: PAIRED_RUN_LABEL, labels: x.labels, measured: x.measured };
    if (this.experimentPostPaired(c, x)) this.postCompare(c);
  }

  /** Post a paired card's held stamp once its measured gate held and every listed step was taken. */
  private experimentPostPaired(c: Comparison, x: LiveExperiment): boolean {
    if (x.posted || !x.pending || !x.steps.complete) return false;
    x.posted = true;
    this.post({ type: 'experimentStamp', dishId: c.sourceDishId, stamp: x.pending });
    return true;
  }

  /**
   * The history of a dish was requested — the only request that opens a history view (the History sheet
   * on a dish; the population history on a paired run's results). A UI event, never simulation state.
   */
  private experimentHistoryOpened(d: Dish): void {
    if (d.arm) {
      const c = this.comparison;
      const x = c?.experiment;
      if (!c || !x || c.id !== d.arm.compareId || c.status !== 'complete') return;
      if (x.steps.note('viewPreyHistory') && this.experimentPostPaired(c, x)) this.postCompare(c);
      return;
    }
    this.experimentSteps(d, 'openResourceHistory');
  }

  /**
   * Note a player step on a single-arm card's dish (UI events only: reads the world, never writes it),
   * including "the inspector identifies food use" for the organism selected now, and post the held stamp
   * once the measured gate held and every listed step was taken.
   */
  private experimentSteps(d: Dish, step?: PlayerStep): void {
    const x = d.experiment;
    if (!x || x.ended || x.posted) return;
    if (step) x.steps.note(step);
    const sel = d.selection;
    if (x.steps.needs('inspectFoodUse') && sel?.kind === 'entity' && inspectShowsFoodUse(d.world, sel.birthId, x.species)) x.steps.note('inspectFoodUse');
    if (!x.pending || !x.steps.complete) return;
    x.posted = true;
    this.post({ type: 'experimentStamp', dishId: d.id, stamp: x.pending });
  }

  private experimentView(c: Comparison, x: LiveExperiment): ComparisonExperiment {
    const def = x.watch.def;
    const a = this.dishes[c.aDishId];
    const b = this.dishes[c.bDishId];
    return {
      cardId: def.id,
      title: def.title,
      labels: x.labels,
      recipeId: x.watch.recipe.id,
      recipeRevision: x.watch.recipe.revision,
      seed: def.seed,
      change: def.change,
      horizonTicks: x.horizonTicks,
      gate: a && b ? x.watch.status({ world: a.world, obs: x.obsA }, { world: b.world, obs: x.obsB }) : null,
      steps: x.steps.status(),
      stamp: x.posted ? x.watch.stamp : null,
      measured: x.measured,
    };
  }

  /**
   * One tick of a free-running dish; a single-arm card's observer and gate ride along until the gate
   * (read-only). The stamp is recorded when the measured gate holds and posted once the card's player
   * steps are taken too.
   */
  private stepDish(d: Dish): void {
    const x = d.experiment;
    if (!x || x.ended || x.watch.reached) step(d.world);
    else {
      stepObserved(d.world, x.obs);
      const stamp = x.watch.afterTick({ world: d.world, obs: x.obs }, null);
      if (stamp) {
        const measured = x.watch.measured({ world: d.world, obs: x.obs }, null);
        x.pending = { stamp, title: x.watch.def.title, label: SINGLE_RUN_LABEL, labels: x.labels, measured };
      }
    }
    if (x && !x.ended && !x.posted) this.experimentSteps(d);
  }

  /** A single-arm card's dish was changed or failed before its gate: the observation stops; the dish goes on. */
  private endExperiment(d: Dish, reason: 'changed' | 'failed'): void {
    const x = d.experiment;
    if (!x || x.ended || x.posted) return;
    x.ended = true;
    this.post({ type: 'experimentEnded', dishId: d.id, cardId: x.watch.def.id, reason });
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
    if (c.experiment) return refuse("This experiment's one change is already on B; it takes no other change.");
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
      ...(c.experiment ? { experiment: this.experimentView(c, c.experiment) } : {}),
    };
  }

  private postCompare(c: Comparison, requestId?: number): void {
    this.post({ type: 'compareState', ...(requestId !== undefined ? { requestId } : {}), state: this.compareState(c) });
  }

  private finishComparison(c: Comparison): void {
    c.status = 'complete';
    c.acc = 0;
    c.results = c.run!.results(c.interventions);
    if (c.experiment) c.experiment.measured = this.experimentMeasured(c.run!, c.experiment);
    // The results are on the run's screen from this moment (the paired run's "view the comparison" step).
    if (c.experiment && c.experiment.steps.note('viewComparison')) this.experimentPostPaired(c, c.experiment);
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
        if (c.experiment) this.experimentAfterPair(c, run, c.experiment);
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
        // What if? (D09 §4): record exactly what was applied above, so the world says whether it IS the authored recipe.
        provenance: this.recipeProvenance(source),
      });
    }
    return deserializeWorld(source.state);
  }

  /** Provenance of a recipe dish with the overrides build() applies (`{}` = the recipe as authored). */
  private recipeProvenance(source: Extract<DishSource, { kind: 'recipe' }>): RecipeWorldProvenance {
    const o = source.overrides;
    const overrides: RecipeOverridesRecord = {
      ...(source.seed !== undefined ? { seed: source.seed } : {}),
      ...(o?.mutationPreset ? { mutationPreset: o.mutationPreset } : {}),
      ...(o?.founderMode ? { founderMode: o.founderMode } : {}),
      ...(o?.empty ? { empty: true } : {}),
    };
    return { recipeId: source.recipeId, recipeRevision: this.registry.recipes[source.recipeId]?.revision ?? null, createdFrom: 'recipe', overrides };
  }

  // -------------------------------------------------------------------------------------------
  // What if? (P2.6; SPEC §13.3, UX §3.4, D09 §4–§5). Previews and catalog order are pure functions of
  // content; realization builds a fresh world at tick 0 and never touches another world or its random
  // streams. The previous dish is kept through the save flow before the new dish opens.

  /**
   * DishInfo fields: the variant record (provenance) and the recipe whose What if? ideas apply: a
   * variant dish's source, or the recipe a dish IS exactly (D09 §4). A custom dish gets none.
   */
  private whatIfInfo(w: World): { variant: VariantRecord | null; whatIfSourceId: string | null } {
    const record = variantRecordOf(w);
    if (record) return { variant: record, whatIfSourceId: record.sourceId };
    const p = w.content.provenance;
    const recipe = p.createdFrom === 'recipe' && p.recipeId !== null ? this.registry.recipes[p.recipeId] : undefined;
    const ideas = recipe !== undefined && this.isAuthoredRecipe(w, recipe) && whatIfChoices(this.registry, recipe.id).length > 0;
    return { variant: null, whatIfSourceId: ideas && recipe ? recipe.id : null };
  }

  /**
   * D09 §4 "remixes authored starting recipes … In a custom dish, offer Duplicate dish": the world was
   * made from this build's revision of the recipe with its own seed, no overrides and not empty. A
   * save made before overrides were recorded counts only when its seed and settings match exactly; a
   * malformed record never does.
   */
  private isAuthoredRecipe(w: World, recipe: RecipeDef): boolean {
    if (w.content.provenance.recipeRevision !== recipe.revision || w.seed !== recipe.seed) return false;
    const o = recipeOverridesOf(w);
    if (o === null) return false;
    if (o === undefined) return w.settings.mutationPreset === recipe.mutationPreset && w.settings.founderMode === recipe.founderMode;
    return (
      o.empty !== true &&
      (o.seed ?? recipe.seed) === recipe.seed &&
      (o.mutationPreset ?? recipe.mutationPreset) === recipe.mutationPreset &&
      (o.founderMode ?? recipe.founderMode) === recipe.founderMode
    );
  }

  /** Every What if? failure becomes a readable refusal: nothing was started, saved or changed. */
  private async handleWhatIf(msg: Extract<ToWorker, { type: 'whatIf' | 'whatIfStart' }>): Promise<void> {
    try {
      if (msg.type === 'whatIf') this.post({ type: 'whatIf', requestId: msg.requestId, answer: await this.whatIfAnswer(msg.sourceId, msg.aboutDishId) });
      else await this.whatIfStart(msg);
    } catch (e) {
      const code: WhatIfRefusalCode = e instanceof WhatIfRefusal ? e.code : e instanceof VariantError ? e.code : 'failed';
      this.post({ type: 'whatIfRefused', requestId: msg.requestId, code, message: e instanceof Error ? e.message : String(e) });
    }
  }

  /**
   * The answer also carries `registryLabel`: the UX §3.3 label of the world a choice would build (this
   * build's manifest, by the same rule as DishInfo.manifestLabel), for the choice's Details. It is an
   * additive field outside the WhatIfAnswer type until protocol.ts declares it (see D-0026 follow-up).
   */
  private async whatIfAnswer(sourceIdIn: string | null, dishId: string | null): Promise<WhatIfAnswer & { readonly registryLabel: string }> {
    const d = dishId !== null ? this.need(dishId) : null;
    const record = d ? variantRecordOf(d.world) : null;
    const sourceId = sourceIdIn ?? (d ? this.whatIfInfo(d.world).whatIfSourceId : null);
    if (sourceId === null) throw new WhatIfRefusal('not-variant', 'This dish did not start from a recipe with What if? ideas.');
    const source = this.registry.recipes[sourceId];
    const choices: WhatIfChoice[] = [];
    if (source) {
      for (const v of whatIfChoices(this.registry, sourceId).slice(0, MAX_WHAT_IF_CHOICES)) {
        const { oldCells, newCells } = variantPatchOutlines(this.registry, v.id);
        choices.push({ preview: variantPreview(this.registry, v.id), oldCells, newCells, ...(await variantChecksums(this.registry, v.id)) });
      }
    }
    const nextId = record && this.registry.variants[record.variantId] ? nextVariantId(this.registry, record.variantId) : null;
    const next = nextId !== null ? this.registry.variants[nextId]! : null;
    return {
      sourceId,
      sourceName: source?.name ?? sourceId,
      sourceQuestion: source?.question ?? null,
      choices,
      layout: {
        patches: (source?.fieldPatches ?? []).map((p, index) => ({ index, center: p.center, radius: p.radius, label: p.label ?? null })),
        founders: (source?.founders ?? []).map((f) => ({ speciesId: f.species, name: this.registry.species[f.species]?.name ?? f.species, count: f.count, center: f.center, radius: f.radius })),
      },
      current: d && record ? { ...record, atStart: await this.rebuildsExactly(d) } : null,
      next: next ? { id: next.id, title: next.title, question: next.question, previewDifference: next.previewDifference } : null,
      plan: await this.keepPlan(d),
      registryLabel: this.registry.manifest.enabledModules.length < 17 ? 'Core prototype — quantitative evolution' : 'Standard Evolution',
    };
  }

  /**
   * A What if? dish that is still exactly its recorded start AND that this build rebuilds exactly
   * (D-0026): tick 0 with the recorded start hash, and the variant revision, both checksums, the
   * content hash and the rule versions all as recorded. Only such a dish is "unchanged" and not saved
   * again; any other goes through the normal save flow.
   */
  private async rebuildsExactly(d: Dish): Promise<boolean> {
    const record = variantRecordOf(d.world);
    if (!record || !(await this.recordMatchesBuild(record))) return false;
    // Checked after the await, with no await after it: the dish may have been stepped meanwhile.
    return d.world.tick === 0 && stateHash(d.world) === record.initialStateHash;
  }

  /** The variant record names exactly what this build would realize (same idea, same rules). */
  private async recordMatchesBuild(r: VariantRecord): Promise<boolean> {
    const v = this.registry.variants[r.variantId];
    const m = this.registry.manifest;
    if (!v || v.revision !== r.variantRevision || v.sourceId !== r.sourceId || v.sourceRevision !== r.sourceRevision) return false;
    if (m.contentHash !== r.contentHash || m.contentVersion !== r.contentVersion) return false;
    if (m.simulationVersion !== r.simulationVersion || m.evolutionRulesVersion !== r.evolutionRulesVersion) return false;
    try {
      const sums = await variantChecksums(this.registry, r.variantId);
      return sums.sourceChecksum === r.sourceChecksum && sums.variantChecksum === r.variantChecksum;
    } catch {
      return false;
    }
  }

  /** How 'auto' would keep this dish (UX §3.4): its own slot, else the first free named slot. */
  private async keepPlan(d: Dish | null): Promise<WhatIfPlan> {
    if (!d) return { kind: 'none' };
    if (await this.rebuildsExactly(d)) return { kind: 'unchanged', name: d.name };
    if (!this.store) return { kind: 'unavailable', name: d.name };
    const own = this.ownSlots[d.id];
    if (own !== undefined) return { kind: 'slot', slotId: own, own: true, name: d.name };
    const free = await this.store.freeSlot();
    return free !== null ? { kind: 'slot', slotId: free, own: false, name: d.name } : { kind: 'full', name: d.name };
  }

  private async whatIfStart(msg: Extract<ToWorker, { type: 'whatIfStart' }>): Promise<void> {
    if (this.dishes[msg.newDishId]) throw new WhatIfRefusal('in-use', 'That new dish id is already in use.');
    const from = msg.fromDishId !== null ? this.need(msg.fromDishId) : null;
    if (from?.arm) throw new WhatIfRefusal('not-variant', 'A comparison copy cannot start a What if? dish.');
    // 1. Build the new world first (pure): a refusal here saves nothing and changes nothing.
    const worldId = msg.newDishId;
    let world: World;
    if (msg.pick.kind === 'variant') {
      world = await realizeVariant(this.registry, msg.pick.variantId, { worldId });
    } else {
      const record = from ? variantRecordOf(from.world) : null;
      if (!record) throw new WhatIfRefusal('not-variant', 'This dish was not made from a What if? idea, so there is nothing to start again.');
      if (msg.pick.kind === 'again') {
        world = await realizeAgain(this.registry, record, { worldId });
      } else {
        const nextId = this.registry.variants[record.variantId] ? nextVariantId(this.registry, record.variantId) : null;
        if (nextId === null) throw new WhatIfRefusal('unknown-variant', `There is no other idea for "${record.title}" in this version of Pixelmeba. Your dish is unchanged.`);
        world = await realizeVariant(this.registry, nextId, { worldId });
      }
    }
    // 2. Keep the current dish through the save flow; a refusal or failed write starts nothing.
    const kept = await this.keepDish(from, msg.keep);
    // 3. Open the new dish, paused, as a separate dish with its own world id.
    const dish = this.addDish(msg.newDishId, world, variantRecordOf(world)!.title);
    this.post({ type: 'whatIfStarted', requestId: msg.requestId, info: this.info(dish), kept });
    this.sendSnapshot(dish);
  }

  /** Write one dish to a slot exactly as saveSlot/autosave do. */
  private async writeSlot(d: Dish, slotId: string): Promise<SlotInfo> {
    const savedAt = this.iso();
    const recipeId = d.world.content.provenance.recipeId;
    const built = await buildSaveFile(d.world, { name: d.name, savedAt, recipeId });
    return this.store!.save({ slotId, text: built.text, checksum: built.checksum, name: d.name, tick: d.world.tick, savedAt, recipeId });
  }

  /**
   * Keep the dish being left (UX §3.4, D09 §3): 'auto' saves it to its own slot or the first free one
   * and refuses when all ten are used; 'replace' writes the slot the player chose; 'exported' writes
   * no slot. The autosave (Continue) follows. The dish is paused first so every write holds one
   * moment; on refusal or a failed write it resumes its prior speed and nothing else changes.
   */
  private async keepDish(d: Dish | null, keep: WhatIfKeep): Promise<WhatIfKept> {
    if (!d) return { kind: 'none', slot: null, replaced: null, name: null, autosaved: false };
    if (keep.kind === 'auto' && (await this.rebuildsExactly(d))) return { kind: 'unchanged', slot: null, replaced: null, name: d.name, autosaved: false };
    const priorSpeed = d.speed;
    d.speed = 0;
    d.acc = 0;
    try {
      let slot: SlotSummary | null = null;
      let replaced: string | null = null;
      if (keep.kind !== 'exported') {
        if (!this.store) throw new WhatIfRefusal('save-unavailable', 'This device cannot save dishes, so the new dish was not started. Export your dish as a file first.');
        const slots = await this.store.list();
        let slotId: string | null;
        if (keep.kind === 'replace') {
          if (!SaveStoreClass.slotIds().includes(keep.slotId)) throw new WhatIfRefusal('failed', 'That save slot does not exist. Nothing was changed.');
          slotId = keep.slotId;
          const old = slots.find((s) => s.slotId === slotId);
          replaced = old && this.ownSlots[d.id] !== slotId ? old.name : null;
        } else {
          slotId = this.ownSlots[d.id] ?? (await this.store.freeSlot());
          if (slotId === null) {
            throw new WhatIfRefusal('slots-full', `All ten save slots are used, so "${d.name}" has nowhere to go. Export it as a file or choose a save to replace. Nothing has changed.`);
          }
        }
        try {
          slot = summary(await this.writeSlot(d, slotId));
        } catch (e) {
          throw new WhatIfRefusal('save-failed', `"${d.name}" could not be saved, so the new dish was not started. Your saves are unchanged. (${e instanceof Error ? e.message : String(e)})`);
        }
        this.ownSlots[d.id] = slotId;
      }
      let autosaved = false;
      if (this.store) {
        try {
          await this.writeSlot(d, AUTOSAVE_SLOT);
          autosaved = true;
        } catch {
          // The dish is kept in its slot or file; Continue keeps opening the previous autosave.
        }
      }
      return { kind: slot ? 'slot' : 'exported', slot, replaced, name: d.name, autosaved };
    } catch (e) {
      d.speed = priorSpeed;
      throw e;
    }
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
      // Lab trays (P2.7): recorded content the item details quote (read-only).
      speciesHabitats: w.species.map((s) => [...s.def.habitats]),
      speciesAttachment: w.species.map((s) => (s.def.attachment ? [...s.def.attachment.surfaces] : null)),
      speciesSummaries: w.species.map((s) => s.def.guide.summary),
      materialSummaries: w.content.materials.map((mat) => mat.guide.summary),
      fieldIds: allocatedFieldIds(w.fields),
      ...this.whatIfInfo(w),
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
          this.stepDish(d);
        } catch (e) {
          d.speed = 0;
          d.failed = true;
          if (d.experiment && !d.experiment.ended) this.endExperiment(d, 'failed');
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
      branchCount: w.branches.branches.length,
      ...(lineage ? { lineage } : {}),
    };
    const transfer: Transferable[] = [packed.ents.buffer, packed.ids.buffer, deposits.buffer];
    if (overlay) transfer.push(overlay.data.buffer);
    if (lineage) transfer.push(lineage.marks.buffer as ArrayBuffer);
    if (geometry) transfer.push(geometry.substrate.buffer, geometry.structure.buffer, geometry.shade.buffer);
    this.post(msg, transfer);
  }
}
