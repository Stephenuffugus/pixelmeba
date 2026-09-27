/**
 * The dish host: owns worlds, runs the active one in real time, answers requests.
 * Environment-agnostic (no DOM): sim.worker.ts wires it to postMessage; tests drive it directly.
 *
 * Time model: at speed s the host aims for 10·s ticks per real second. Each pump runs due ticks
 * within a work budget; if it falls behind it drops the backlog (never skips biological ticks or
 * changes dt) and reports the effective speed it actually achieved (SPEC §3.1, §16).
 */
import { applyNow } from '@sim/commands';
import type { ContentRegistry } from '@sim/content/registry';
import { realizeRecipe } from '@sim/recipes';
import { deserializeWorld, serializeWorld, stateHash, type WorldState } from '@sim/serialize';
import { step } from '@sim/tick';
import type { World } from '@sim/world';
import { buildInspector, packDeposits, packEntities, packOverlay, visualEvents } from './snapshot';
import type { DishInfo, DishSource, FromWorker, OverlayId, Selection, SlotSummary, SnapshotMsg, Speed, ToWorker } from './protocol';
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
  ticksWindow: number[];
  effectiveSpeed: number;
  failed: boolean;
}

const MAX_PUMP_MS = 30;
const SNAPSHOT_INTERVAL_MS = 100;
const MAX_BACKLOG_TICKS = 20;

export class DishHost {
  private readonly dishes: Record<string, Dish> = {};
  private active: string | null = null;
  private lastPump: number;
  private lastSnapshot = 0;

  constructor(
    private readonly registry: ContentRegistry,
    private readonly post: (msg: FromWorker, transfer?: Transferable[]) => void,
    private readonly clock: HostClock,
    private readonly store: SaveStore | null = null,
    private readonly persistent = false,
  ) {
    this.lastPump = clock.now();
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
    const dish: Dish = {
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
      ticksWindow: [],
      effectiveSpeed: 0,
      failed: false,
    };
    this.dishes[id] = dish;
    this.active = id;
    return dish;
  }

  get activeDishId(): string | null {
    return this.active;
  }

  world(dishId: string): World | null {
    return this.dishes[dishId]?.world ?? null;
  }

  handle(msg: ToWorker): void {
    try {
      this.dispatch(msg);
    } catch (e) {
      const dishId = 'dishId' in msg ? msg.dishId : '';
      const dish = this.dishes[dishId];
      if (dish) {
        dish.speed = 0;
        dish.failed = true;
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
        if (d.failed) return;
        d.speed = msg.speed;
        d.acc = 0;
        this.sendSnapshot(d);
        return;
      }
      case 'step': {
        const d = this.need(msg.dishId);
        if (d.failed) return;
        d.speed = 0;
        step(d.world);
        this.sendSnapshot(d);
        return;
      }
      case 'command': {
        const d = this.need(msg.dishId);
        if (msg.undoable) d.undo = serializeWorld(d.world);
        const cmd = applyNow(d.world, msg.commandId, msg.payload);
        this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: cmd.result ?? null });
        this.sendSnapshot(d);
        return;
      }
      case 'undo': {
        const d = this.need(msg.dishId);
        if (!d.undo) {
          this.post({ type: 'ack', requestId: msg.requestId, dishId: d.id, result: null, error: 'nothing to undo' });
          return;
        }
        d.world = deserializeWorld(d.undo);
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
          ticksWindow: [],
          lastGeometryVersion: -1,
          selection: null,
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
        this.post({ type: 'history', requestId: msg.requestId, dishId: d.id, seconds: h.seconds, minutes: h.minutes, compacted: h.compacted });
        return;
      }
      case 'release':
        return;
      default:
        void this.handleAsync(msg);
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
    };
  }

  /** Advance the active dish according to wall-clock time. Call frequently (≈ every 16 ms). */
  pump(): void {
    const now = this.clock.now();
    const elapsed = Math.min(250, now - this.lastPump);
    this.lastPump = now;
    const d = this.active ? this.dishes[this.active] : undefined;
    if (!d) return;
    let ran = 0;
    if (d.speed > 0 && !d.failed) {
      d.acc += (elapsed / 1000) * 10 * d.speed;
      if (d.acc > MAX_BACKLOG_TICKS) d.acc = MAX_BACKLOG_TICKS;
      const start = this.clock.now();
      while (d.acc >= 1) {
        try {
          step(d.world);
        } catch (e) {
          d.speed = 0;
          d.failed = true;
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
    };
    const transfer: Transferable[] = [packed.ents.buffer, packed.ids.buffer, deposits.buffer];
    if (overlay) transfer.push(overlay.data.buffer);
    if (geometry) transfer.push(geometry.substrate.buffer, geometry.structure.buffer, geometry.shade.buffer);
    this.post(msg, transfer);
  }
}
