/**
 * Main-thread client for the simulation worker. Request/response by requestId; snapshots stream to
 * listeners, and stale snapshots (older generation for the same dish) are discarded.
 */
import type { CommandPayload, CommandResult } from '@sim/commands';
import type { CompareSpeed, ComparisonState } from './comparison';
import type { LineageAnswer } from '@sim/lineage';
import type { LineageView } from './protocol';
import type { WhatIfAnswer, WhatIfKeep, WhatIfKept, WhatIfPick, WhatIfRefusalCode } from './protocol';
import type { ExperimentCardView } from '@sim/experiments';
import { PROTOCOL_VERSION, stamp, type DishInfo, type DishSource, type Envelope, type FamilyAnswer, type FromWorker, type OverlayId, type Selection, type SlotSummary, type SnapshotMsg, type Speed, type ToWorker } from './protocol';

export class WorkerRequestError extends Error {
  constructor(
    message: string,
    readonly kind: string | undefined,
  ) {
    super(message);
  }
}

type Pending = { resolve: (v: FromWorker) => void; reject: (e: Error) => void };

export interface WorkerLike {
  postMessage(msg: ToWorker & Envelope, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<FromWorker & Partial<Envelope>>) => void) | null;
  terminate?(): void;
}

/** Unsolicited experiment packets (P2.5). */
export type ExperimentNotice = Extract<FromWorker, { type: 'experimentStamp' | 'experimentWaiting' | 'experimentEnded' }>;

/**
 * An error as the UI words it (ARCH §7): `paused` is true only when the worker paused that dish at its
 * last valid state because of it; `request` names the request that failed (null for a failure while the
 * dish ran, or a packet the app could not read).
 */
export interface WorkerErrorNotice {
  readonly dishId: string;
  readonly message: string;
  readonly paused: boolean;
  readonly request: ToWorker['type'] | null;
}

export class SimClient {
  private nextRequest = 1;
  private readonly pending: Record<number, Pending> = {};
  private readonly lastGen: Record<string, number> = {};
  private readonly snapshotListeners: ((s: SnapshotMsg) => void)[] = [];
  private readonly errorListeners: ((e: WorkerErrorNotice) => void)[] = [];
  private readonly compareListeners: ((s: ComparisonState) => void)[] = [];
  private readonly experimentListeners: ((m: ExperimentNotice) => void)[] = [];

  constructor(private readonly worker: WorkerLike) {
    worker.onmessage = (ev) => this.receive(ev.data);
  }

  static create(): SimClient {
    const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    return new SimClient(w);
  }

  onSnapshot(fn: (s: SnapshotMsg) => void): () => void {
    this.snapshotListeners.push(fn);
    return () => {
      const i = this.snapshotListeners.indexOf(fn);
      if (i >= 0) this.snapshotListeners.splice(i, 1);
    };
  }

  onError(fn: (e: WorkerErrorNotice) => void): void {
    this.errorListeners.push(fn);
  }

  /** Every comparison status packet, solicited or not (progress while running, completion). */
  onCompare(fn: (s: ComparisonState) => void): () => void {
    this.compareListeners.push(fn);
    return () => {
      const i = this.compareListeners.indexOf(fn);
      if (i >= 0) this.compareListeners.splice(i, 1);
    };
  }

  /** Experiment notices (P2.5): a card's gate was reached (journal stamp), or its observation ended. */
  onExperiment(fn: (m: ExperimentNotice) => void): () => void {
    this.experimentListeners.push(fn);
    return () => {
      const i = this.experimentListeners.indexOf(fn);
      if (i >= 0) this.experimentListeners.splice(i, 1);
    };
  }

  /** Every packet leaves stamped with the protocol version. */
  private send(msg: ToWorker): void {
    this.worker.postMessage(stamp(msg));
  }

  private receive(msg: FromWorker & Partial<Envelope>): void {
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      // A worker from a different build: refuse its packets rather than misread them.
      const text = `protocol version mismatch: worker ${String(msg.protocolVersion)}, app ${PROTOCOL_VERSION}`;
      for (const fn of this.errorListeners) fn({ dishId: 'dishId' in msg ? msg.dishId : '', message: text, paused: false, request: null });
      const id = 'requestId' in msg ? msg.requestId : undefined;
      const pending = id !== undefined ? this.pending[id] : undefined;
      if (id !== undefined && pending) {
        pending.reject(new WorkerRequestError(text, 'protocol'));
        delete this.pending[id];
      }
      return;
    }
    if (msg.type === 'snapshot') {
      const last = this.lastGen[msg.dishId] ?? 0;
      if (msg.gen <= last) return; // stale
      this.lastGen[msg.dishId] = msg.gen;
      for (const fn of this.snapshotListeners) fn(msg);
      return;
    }
    if (msg.type === 'error') {
      for (const fn of this.errorListeners) fn({ dishId: msg.dishId, message: msg.message, paused: msg.paused === true, request: msg.request ?? null });
      if (msg.requestId !== undefined) {
        this.pending[msg.requestId]?.reject(new WorkerRequestError(msg.message, msg.kind));
        delete this.pending[msg.requestId];
      }
      return;
    }
    if (msg.type === 'experimentStamp' || msg.type === 'experimentWaiting' || msg.type === 'experimentEnded') {
      // Unsolicited experiment notices (P2.5): a stamp, a held stamp waiting for steps, or an observation ended.
      for (const fn of this.experimentListeners) fn(msg);
      return;
    }
    if (msg.type === 'compareState') for (const fn of this.compareListeners) fn(msg.state);
    const id = msg.requestId;
    if (id === undefined) return; // unsolicited status (e.g. comparison progress)
    const p = this.pending[id];
    if (p) {
      delete this.pending[id];
      p.resolve(msg);
    }
  }

  private request<T extends FromWorker>(build: (requestId: number) => ToWorker): Promise<T> {
    const requestId = this.nextRequest++;
    return new Promise<T>((resolve, reject) => {
      this.pending[requestId] = { resolve: resolve as (v: FromWorker) => void, reject };
      this.send(build(requestId));
    });
  }

  async create(dishId: string, source: DishSource, name?: string): Promise<DishInfo> {
    const msg = await this.request<Extract<FromWorker, { type: 'ready' }>>((requestId) => ({
      type: 'create',
      requestId,
      dishId,
      source,
      ...(name !== undefined ? { name } : {}),
    }));
    return msg.info;
  }

  async command(dishId: string, commandId: string, payload: CommandPayload, undoable = true): Promise<CommandResult | null> {
    const msg = await this.request<Extract<FromWorker, { type: 'ack' }>>((requestId) => ({ type: 'command', requestId, dishId, commandId, payload, undoable }));
    return msg.result;
  }

  /** Like command(), but also returns the worker's refusal text (e.g. a comparison arm that takes no changes). */
  async commandAck(dishId: string, commandId: string, payload: CommandPayload, undoable = true): Promise<{ result: CommandResult | null; error: string | null }> {
    const msg = await this.request<Extract<FromWorker, { type: 'ack' }>>((requestId) => ({ type: 'command', requestId, dishId, commandId, payload, undoable }));
    return { result: msg.result, error: msg.error ?? null };
  }

  async undo(dishId: string): Promise<boolean> {
    const msg = await this.request<Extract<FromWorker, { type: 'ack' }>>((requestId) => ({ type: 'undo', requestId, dishId }));
    return msg.error === undefined;
  }

  async save(dishId: string): Promise<{ json: string; hash: string; tick: number }> {
    const msg = await this.request<Extract<FromWorker, { type: 'saved' }>>((requestId) => ({ type: 'save', requestId, dishId }));
    return { json: msg.json, hash: msg.hash, tick: msg.tick };
  }

  async duplicate(dishId: string, newDishId: string): Promise<DishInfo> {
    const msg = await this.request<Extract<FromWorker, { type: 'ready' }>>((requestId) => ({ type: 'duplicate', requestId, dishId, newDishId }));
    return msg.info;
  }

  async hash(dishId: string): Promise<{ hash: string; tick: number }> {
    const msg = await this.request<Extract<FromWorker, { type: 'hash' }>>((requestId) => ({ type: 'hash', requestId, dishId }));
    return { hash: msg.hash, tick: msg.tick };
  }

  async history(dishId: string, lastSeconds?: number): Promise<Extract<FromWorker, { type: 'history' }>> {
    return this.request((requestId) => (lastSeconds === undefined ? { type: 'history', requestId, dishId } : { type: 'history', requestId, dishId, lastSeconds }));
  }

  async saveSlot(dishId: string, slotId: string, name: string): Promise<SlotSummary> {
    const msg = await this.request<Extract<FromWorker, { type: 'slotSaved' }>>((requestId) => ({ type: 'saveSlot', requestId, dishId, slotId, name }));
    return msg.slot;
  }

  async autosave(dishId: string): Promise<SlotSummary> {
    const msg = await this.request<Extract<FromWorker, { type: 'slotSaved' }>>((requestId) => ({ type: 'autosave', requestId, dishId }));
    return msg.slot;
  }

  async listSlots(): Promise<{ slots: readonly SlotSummary[]; persistent: boolean }> {
    const msg = await this.request<Extract<FromWorker, { type: 'slots' }>>((requestId) => ({ type: 'listSlots', requestId }));
    return { slots: msg.slots, persistent: msg.persistent };
  }

  async loadSlot(slotId: string, newDishId: string): Promise<{ info: DishInfo; usedPredecessor: boolean }> {
    const msg = await this.request<Extract<FromWorker, { type: 'loaded' }>>((requestId) => ({ type: 'loadSlot', requestId, slotId, newDishId }));
    return { info: msg.info, usedPredecessor: msg.usedPredecessor };
  }

  async deleteSlot(slotId: string): Promise<void> {
    await this.request((requestId) => ({ type: 'deleteSlot', requestId, slotId }));
  }

  async exportDish(dishId: string, strip: boolean): Promise<{ text: string; filename: string }> {
    const msg = await this.request<Extract<FromWorker, { type: 'exported' }>>((requestId) => ({ type: 'exportDish', requestId, dishId, strip }));
    return { text: msg.text, filename: msg.filename };
  }

  async importDish(text: string, newDishId: string): Promise<DishInfo> {
    const msg = await this.request<Extract<FromWorker, { type: 'loaded' }>>((requestId) => ({ type: 'importDish', requestId, text, newDishId }));
    return msg.info;
  }

  /** Living relatives of an organism ("Where is its family?"); a read-only query. */
  async family(dishId: string, birthId: number): Promise<FamilyAnswer> {
    const msg = await this.request<Extract<FromWorker, { type: 'family' }>>((requestId) => ({ type: 'family', requestId, dishId, birthId }));
    return msg.family;
  }

  /** Lineage panel data (P2.3): branches, variation, specimens, and one branch's detail; read-only. */
  async lineage(dishId: string, branch: number | null, birthId: number | null = null): Promise<LineageAnswer> {
    const msg = await this.request<Extract<FromWorker, { type: 'lineage' }>>((requestId) => ({ type: 'lineage', requestId, dishId, branch, birthId }));
    return msg.lineage;
  }

  /** Ask snapshots of this dish to carry trait-band / lineage-highlight marks (null = off). */
  lineageView(dishId: string, view: LineageView | null): void {
    this.send({ type: 'lineageView', dishId, view });
  }

  /** Start a comparison from a dish: baseline captured once, A and B realized paused (SPEC §13.4). */
  async compareStart(sourceDishId: string, ids: { compareId: string; aDishId: string; bDishId: string }): Promise<ComparisonState> {
    const msg = await this.request<Extract<FromWorker, { type: 'compareState' }>>((requestId) => ({ type: 'compareStart', requestId, sourceDishId, ...ids }));
    return msg.state;
  }

  async compareReset(compareId: string): Promise<ComparisonState> {
    const msg = await this.request<Extract<FromWorker, { type: 'compareState' }>>((requestId) => ({ type: 'compareReset', requestId, compareId }));
    return msg.state;
  }

  async compareRun(compareId: string, horizonTicks: number | null, speed: CompareSpeed): Promise<ComparisonState> {
    const msg = await this.request<Extract<FromWorker, { type: 'compareState' }>>((requestId) => ({ type: 'compareRun', requestId, compareId, horizonTicks, speed }));
    return msg.state;
  }

  compareSpeed(compareId: string, speed: CompareSpeed): void {
    this.send({ type: 'compareSpeed', compareId, speed });
  }

  async compareStop(compareId: string): Promise<ComparisonState> {
    const msg = await this.request<Extract<FromWorker, { type: 'compareState' }>>((requestId) => ({ type: 'compareStop', requestId, compareId }));
    return msg.state;
  }

  /** Discard a comparison's two worlds and baseline; the source dish and saves are never touched. */
  async compareDelete(compareId: string): Promise<void> {
    await this.request((requestId) => ({ type: 'compareDelete', requestId, compareId }));
  }

  /**
   * What if? (P2.6): the ideas for a source recipe (or for the recipe `aboutDishId` came from), with
   * previews and how that dish would be kept. Rejects with WorkerRequestError(kind = refusal code).
   */
  async whatIf(sourceId: string | null, aboutDishId: string | null): Promise<WhatIfAnswer> {
    const msg = await this.request<Extract<FromWorker, { type: 'whatIf' | 'whatIfRefused' }>>((requestId) => ({ type: 'whatIf', requestId, sourceId, aboutDishId }));
    if (msg.type === 'whatIfRefused') throw new WorkerRequestError(msg.message, msg.code);
    return msg.answer;
  }

  /**
   * Start a What if? dish (paused, new world id) after keeping `fromDishId` as `keep` says. A refusal
   * (all slots used, a changed variant, …) resolves with ok false and a readable message; nothing changed.
   */
  async whatIfStart(args: {
    readonly newDishId: string;
    readonly fromDishId: string | null;
    readonly pick: WhatIfPick;
    readonly keep: WhatIfKeep;
  }): Promise<{ readonly ok: true; readonly info: DishInfo; readonly kept: WhatIfKept } | { readonly ok: false; readonly code: WhatIfRefusalCode; readonly message: string }> {
    const msg = await this.request<Extract<FromWorker, { type: 'whatIfStarted' | 'whatIfRefused' }>>((requestId) => ({ type: 'whatIfStart', requestId, ...args }));
    if (msg.type === 'whatIfRefused') return { ok: false, code: msg.code, message: msg.message };
    return { ok: true, info: msg.info, kept: msg.kept };
  }

  /** The experiment cards this build ships (P2.5), as the Notebook shows them. */
  async experimentCatalog(): Promise<readonly ExperimentCardView[]> {
    const msg = await this.request<Extract<FromWorker, { type: 'experimentCatalog' }>>((requestId) => ({ type: 'experimentCatalog', requestId }));
    return msg.cards;
  }

  /**
   * Start a card as a new paused dish (P2.5). A paired card also opens its paired run (comparison ids
   * required) with the card's change on B. The card's recipe and seed are used as recorded.
   */
  async experimentStart(
    cardId: string,
    newDishId: string,
    compare: { readonly compareId: string; readonly aDishId: string; readonly bDishId: string } | null,
  ): Promise<{ readonly info: DishInfo; readonly compare: ComparisonState | null }> {
    const msg = await this.request<Extract<FromWorker, { type: 'experimentStarted' }>>((requestId) => ({ type: 'experimentStart', requestId, cardId, newDishId, compare }));
    return { info: msg.info, compare: msg.compare };
  }

  setSpeed(dishId: string, speed: Speed): void {
    this.send({ type: 'setSpeed', dishId, speed });
  }

  stepOnce(dishId: string): void {
    this.send({ type: 'step', dishId });
  }

  view(dishId: string, overlay: OverlayId | null, selection: Selection | null): void {
    this.send({ type: 'view', dishId, overlay, selection });
  }

  activate(dishId: string): void {
    this.send({ type: 'activate', dishId });
  }

  dispose(dishId: string): void {
    this.send({ type: 'dispose', dishId });
  }
}
