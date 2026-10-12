/**
 * Main-thread client for the simulation worker. Request/response by requestId; snapshots stream to
 * listeners, and stale snapshots (older generation for the same dish) are discarded.
 */
import type { CommandPayload, CommandResult } from '@sim/commands';
import type { CompareSpeed, ComparisonState } from './comparison';
import type { LineageAnswer } from '@sim/lineage';
import type { LineageView } from './protocol';
import type { WhatIfAnswer, WhatIfKeep, WhatIfKept, WhatIfPick, WhatIfPlan, WhatIfRefusalCode } from './protocol';
import type { KeepFrom, KeepRefusalCode } from './protocol';
import type { ExperimentCardView } from '@sim/experiments';
import type { NewDishPreview, RecipeOverrides } from './protocol';
import type { SamplePreview } from './protocol';
import type { SessionSummary } from './protocol';
import type { SampleHeldSummary } from '@sim/sample';
import type { SampleMode } from '@sim/sampleSlot';
import type { FavoriteOp } from './protocol';
import type { GoalOffer } from './protocol';
import type { TryGoalOption, TryRefusalCode } from './protocol';
import type { TurnRecord } from '@persist/notebookTurns';
import type { ChallengeInput, ChallengeRecord } from '@persist/notebookChallenges'; // P4.8c
import type { NotebookRecord } from '@persist/notebook';
import type { MapWindow, RelationshipMapData } from './relationshipMap';
import type { ProbeMask } from './probes';
import type { BookmarkEventRef, GalleryEntryInput } from './protocol';
import type { StorageInfo } from './storage';
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

/**
 * D-0033: an action that replaces the open dish was refused because the open dish could not be kept
 * first (readable `message`; nothing was changed). `exclude`: a slot the replacement choice may not use.
 */
export interface KeepRefused {
  readonly ok: false;
  readonly code: KeepRefusalCode;
  readonly message: string;
  readonly exclude: string | null;
  /** The dish that could not be kept; `fromContinue`: the dish Continue holds (no dish was open). */
  readonly name: string;
  readonly fromContinue: boolean;
}

/** D-0033: the answer to a replacing request: opened, with how the open dish was kept (null: nothing to keep), or refused. */
export type KeptOr<T> = ({ readonly ok: true; readonly kept: WhatIfKept | null } & T) | KeepRefused;

function keepRefused(msg: Extract<FromWorker, { type: 'keepRefused' }>): KeepRefused {
  return { ok: false, code: msg.code, message: msg.message, exclude: msg.exclude, name: msg.name, fromContinue: msg.fromContinue === true };
}

/** Unsolicited automatic checkpoint outcomes (P2.8). */
export type CheckpointNotice = Extract<FromWorker, { type: 'checkpoint' }>;

/**
 * P4.1: notebook notices — a change the worker made without being asked (a followed family's
 * representative or last member left), or a loaded file whose notebook was dropped (the dish loaded).
 */
export type NotebookNotice = Extract<FromWorker, { type: 'notebookChanged' }> | { readonly type: 'notebookDropped'; readonly dishId: string; readonly message: string };

/** P4.1: the answer to a notebook request (the record; a refusal or a removed favorite, when any). */
export type NotebookAnswer = Extract<FromWorker, { type: 'notebook' }>;

/** P4.7: Try my dish notices — a turn reached its horizon, or a turn's record changed (kept, Finish, Undo below the horizon). */
export type TryNotice = Extract<FromWorker, { type: 'tryHorizon' | 'tryTurn' }>;

/** P4.7: the answer to a Try my dish start (turn 1 or the next turn), or why it was refused (nothing changed). */
export type TryAnswer =
  | { readonly ok: true; readonly info: DishInfo; readonly turn: TurnRecord; readonly kept: WhatIfKept | null }
  | { readonly ok: false; readonly code: TryRefusalCode; readonly message: string };

/** P4.8c: a challenge request's answer, or its refusal (nothing changed). */
export type ChallengeAnswer<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly message: string };

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
  /** P3.1: each dish's lid setting from its latest snapshot (the Habitat tray's lid toggle). */
  private readonly lastLid: Record<string, 'open' | 'closed'> = {};
  /** P3.5: each dish's held sample from its latest snapshot (null: none held). */
  private readonly lastSample: Record<string, SampleHeldSummary | null> = {};
  private readonly snapshotListeners: ((s: SnapshotMsg) => void)[] = [];
  private readonly errorListeners: ((e: WorkerErrorNotice) => void)[] = [];
  private readonly compareListeners: ((s: ComparisonState) => void)[] = [];
  private readonly experimentListeners: ((m: ExperimentNotice) => void)[] = [];
  private readonly checkpointListeners: ((m: CheckpointNotice) => void)[] = [];
  private readonly notebookListeners: ((m: NotebookNotice) => void)[] = [];
  private readonly tryListeners: ((m: TryNotice) => void)[] = [];
  /** P4.8c: commands a challenge turn refused (unsolicited, besides the command's ack). */
  private readonly challengeListeners: ((m: Extract<FromWorker, { type: 'challengeBlocked' }>) => void)[] = [];

  constructor(private readonly worker: WorkerLike) {
    worker.onmessage = (ev) => this.receive(ev.data);
  }

  static create(): SimClient {
    const w = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    return new SimClient(w);
  }

  /** P3.1: a dish's lid setting as its latest snapshot reported it, or null before one arrived. */
  lidOf(dishId: string): 'open' | 'closed' | null {
    return this.lastLid[dishId] ?? null;
  }

  /** P3.5: the sample a dish holds as its latest snapshot reported it (null: none, or no snapshot yet). */
  sampleOf(dishId: string): SampleHeldSummary | null {
    return this.lastSample[dishId] ?? null;
  }

  /** P3.5 Sample Begin (host-level; D-0037): pauses the dish; resolves with its stateHash at that moment. */
  async sampleBegin(dishId: string): Promise<{ hash: string; tick: number }> {
    const msg = await this.request<Extract<FromWorker, { type: 'sampleBegun' }>>((requestId) => ({ type: 'sampleBegin', requestId, dishId }));
    return { hash: msg.hash, tick: msg.tick };
  }

  /** P3.5: what a sample at (x, y) would take (read-only). */
  async samplePreview(dishId: string, x: number, y: number, radius: number, mode: SampleMode): Promise<SamplePreview> {
    const msg = await this.request<Extract<FromWorker, { type: 'samplePreview' }>>((requestId) => ({ type: 'samplePreview', requestId, dishId, x, y, radius, mode }));
    return msg.preview;
  }

  /** P3.5 Cancel (host-level, exact; D-0037): resolves with the restored hash and the hash Begin recorded. */
  async sampleCancel(dishId: string): Promise<{ hash: string; beginHash: string | null }> {
    const msg = await this.request<Extract<FromWorker, { type: 'sampleCancelled' }>>((requestId) => ({ type: 'sampleCancel', requestId, dishId }));
    return { hash: msg.hash, beginHash: msg.beginHash };
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

  /** P4.1: notebook notices (a followed family's change; a dropped notebook when a dish was loaded). */
  onNotebook(fn: (m: NotebookNotice) => void): () => void {
    this.notebookListeners.push(fn);
    return () => {
      const i = this.notebookListeners.indexOf(fn);
      if (i >= 0) this.notebookListeners.splice(i, 1);
    };
  }

  /** P4.7: Try my dish notices (a turn's horizon; a turn record changed). Answers to tryFinish are delivered here too. */
  /** P4.8c: a command a challenge turn refused (its words; the dish is unchanged). */
  onChallengeBlocked(fn: (m: Extract<FromWorker, { type: 'challengeBlocked' }>) => void): () => void {
    this.challengeListeners.push(fn);
    return () => {
      const i = this.challengeListeners.indexOf(fn);
      if (i >= 0) this.challengeListeners.splice(i, 1);
    };
  }

  /** P4.8c: save a custom challenge of the paused dish (its baseline goes on the shelf). */
  async challengeSave(dishId: string, challenge: ChallengeInput): Promise<ChallengeAnswer<{ readonly record: NotebookRecord; readonly challenge: ChallengeRecord }>> {
    const msg = await this.request<Extract<FromWorker, { type: 'challengeSaved' | 'challengeRefused' }>>((requestId) => ({ type: 'challengeSave', requestId, dishId, challenge }));
    return msg.type === 'challengeRefused' ? { ok: false, message: msg.message } : { ok: true, record: msg.record, challenge: msg.challenge };
  }

  /** P4.8c: the challenge file (text and file name). */
  async challengeExport(dishId: string, challengeId: string): Promise<ChallengeAnswer<{ readonly text: string; readonly filename: string }>> {
    const msg = await this.request<Extract<FromWorker, { type: 'challengeExported' | 'challengeRefused' }>>((requestId) => ({ type: 'challengeExport', requestId, dishId, challengeId }));
    return msg.type === 'challengeRefused' ? { ok: false, message: msg.message } : { ok: true, text: msg.text, filename: msg.filename };
  }

  /** P4.8c: whether a challenge can start from this dish now (null: it can). Read-only. */
  async challengeCheck(dishId: string, challengeId: string): Promise<string | null> {
    const msg = await this.request<Extract<FromWorker, { type: 'challengeChecked' | 'challengeRefused' }>>((requestId) => ({ type: 'challengeStart', requestId, dishId, challengeId, newDishId: '', check: true }));
    return msg.type === 'challengeRefused' ? msg.message : msg.refusal;
  }

  /** P4.8c: start a challenge turn, keeping the open dish first (D-0033). */
  async challengeStartKeeping(dishId: string, challengeId: string, newDishId: string, keepFrom: KeepFrom | null): Promise<ChallengeAnswer<{ readonly info: DishInfo; readonly turn: TurnRecord; readonly kept: WhatIfKept | null }> | KeepRefused> {
    const msg = await this.request<Extract<FromWorker, { type: 'challengeStarted' | 'challengeRefused' | 'keepRefused' }>>((requestId) => ({ type: 'challengeStart', requestId, dishId, challengeId, newDishId, ...(keepFrom ? { keepFrom } : {}) }));
    if (msg.type === 'keepRefused') return keepRefused(msg);
    if (msg.type === 'challengeRefused') return { ok: false, message: msg.message };
    return { ok: true, info: msg.info, turn: msg.turn, kept: msg.kept ?? null };
  }

  onTry(fn: (m: TryNotice) => void): () => void {
    this.tryListeners.push(fn);
    return () => {
      const i = this.tryListeners.indexOf(fn);
      if (i >= 0) this.tryListeners.splice(i, 1);
    };
  }

  /** P4.7: the Try my dish setup's choices for a dish (read-only). */
  async trySetup(dishId: string): Promise<{ readonly goals: readonly TryGoalOption[]; readonly refusal: string | null }> {
    const msg = await this.request<Extract<FromWorker, { type: 'trySetup' }>>((requestId) => ({ type: 'trySetup', requestId, dishId }));
    return { goals: msg.goals, refusal: msg.refusal };
  }

  /** P4.7: store the paused dish as a baseline and open turn 1, keeping the open dish first (D-0033). */
  async tryStartKeeping(
    args: { readonly dishId: string; readonly newDishId: string; readonly objectiveId: string | null; readonly horizonSeconds: number; readonly prediction: string },
    keepFrom: KeepFrom | null,
  ): Promise<TryAnswer | KeepRefused> {
    const msg = await this.request<Extract<FromWorker, { type: 'tryStarted' | 'tryRefused' | 'keepRefused' }>>((requestId) => ({ type: 'tryStart', requestId, ...args, ...(keepFrom ? { keepFrom } : {}) }));
    if (msg.type === 'keepRefused') return keepRefused(msg);
    if (msg.type === 'tryRefused') return { ok: false, code: msg.code, message: msg.message };
    return { ok: true, info: msg.info, turn: msg.turn, kept: msg.kept ?? null };
  }

  /** P4.7: Another turn from the same baseline (`discard`: the player confirmed Discard turn). */
  async tryNext(dishId: string, newDishId: string, discard: boolean): Promise<TryAnswer> {
    const msg = await this.request<Extract<FromWorker, { type: 'tryStarted' | 'tryRefused' }>>((requestId) => ({ type: 'tryNext', requestId, dishId, newDishId, discard }));
    if (msg.type === 'tryRefused') return { ok: false, code: msg.code, message: msg.message };
    return { ok: true, info: msg.info, turn: msg.turn, kept: null };
  }

  /** P4.7: Finish — the turn becomes an ordinary paused dish. Resolves with its record. */
  async tryFinish(dishId: string): Promise<TurnRecord | null> {
    const msg = await this.request<Extract<FromWorker, { type: 'tryTurn' }>>((requestId) => ({ type: 'tryFinish', requestId, dishId }));
    return msg.turn;
  }

  /** P4.1: a dish's notebook record (with `inspect`, also that living organism's inspector payload). Read-only. */
  async notebookGet(dishId: string, inspect?: number): Promise<NotebookAnswer> {
    return this.request<NotebookAnswer>((requestId) => ({ type: 'notebookGet', requestId, dishId, ...(inspect !== undefined ? { inspect } : {}) }));
  }

  /** P4.1: change a dish's favorites (notebook state; never a command). Resolves with the record and any refusal. */
  async favorite(dishId: string, op: FavoriteOp): Promise<NotebookAnswer> {
    return this.request<NotebookAnswer>((requestId) => ({ type: 'favorite', requestId, dishId, op }));
  }

  /** P4.4: start a goal on a dish at its current tick (notebook state; never a command). Resolves with the record and any refusal. */
  async goalStart(dishId: string, objectiveId: string): Promise<NotebookAnswer> {
    return this.request<NotebookAnswer>((requestId) => ({ type: 'goalStart', requestId, dishId, objectiveId }));
  }

  /** P4.4: Leave goal (the running goal, or the latest ended one, continues freely). */
  async goalLeave(dishId: string): Promise<NotebookAnswer> {
    return this.request<NotebookAnswer>((requestId) => ({ type: 'goalLeave', requestId, dishId }));
  }

  /** P4.4: the player dismissed goal `id`'s sentence (no answer). */
  goalShown(dishId: string, id: string): void {
    this.send({ type: 'goalShown', dishId, id });
  }

  /** P4.4: the goals offered for an open dish, or (dishId null) for a recipe before its dish exists. Read-only. */
  async goalCatalog(dishId: string | null, recipeId: string | null): Promise<readonly GoalOffer[]> {
    const msg = await this.request<Extract<FromWorker, { type: 'goalCatalog' }>>((requestId) => ({ type: 'goalCatalog', requestId, targetDishId: dishId, recipeId }));
    return msg.goals;
  }

  /** P4.2: mark a story card opened ('seen') or dismissed (notebook state; never a command). Resolves with the record. */
  async storyMark(dishId: string, id: string, mark: 'seen' | 'dismissed'): Promise<NotebookAnswer> {
    return this.request<NotebookAnswer>((requestId) => ({ type: 'storyMark', requestId, dishId, id, mark }));
  }

  /** P4.8b: add a bookmark (now, optionally with a stored snapshot; or an event row, text only). Resolves with the record or the refusal. */
  async bookmarkAdd(dishId: string, title: string, snapshot: boolean, event: BookmarkEventRef | null): Promise<NotebookAnswer> {
    return this.request<NotebookAnswer>((requestId) => ({ type: 'bookmarkAdd', requestId, dishId, title, snapshot, event }));
  }

  /** P4.8b: delete one bookmark (notebook state). */
  async bookmarkDelete(dishId: string, id: string): Promise<NotebookAnswer> {
    return this.request<NotebookAnswer>((requestId) => ({ type: 'bookmarkDelete', requestId, dishId, id }));
  }

  /**
   * P4.8b: open snapshot bookmark `id` of dish `dishId` as a new branch, keeping the open dish first (D-0033).
   * `gone`: the stored moment is missing or unreadable (nothing changed).
   */
  async bookmarkOpenKeeping(
    dishId: string,
    id: string,
    newDishId: string,
    keepFrom: KeepFrom | null,
  ): Promise<KeptOr<{ readonly info: DishInfo; readonly branch?: { readonly fromName: string; readonly tick: number } }> | { readonly ok: false; readonly gone: string }> {
    const msg = await this.request<Extract<FromWorker, { type: 'loaded' | 'keepRefused' | 'bookmarkGone' }>>((requestId) => ({ type: 'bookmarkOpen', requestId, dishId, id, newDishId, ...(keepFrom ? { keepFrom } : {}) }));
    if (msg.type === 'bookmarkGone') return { ok: false, gone: msg.message };
    if (msg.type === 'keepRefused') return keepRefused(msg);
    return { ok: true, info: msg.info, kept: msg.kept ?? null, ...(msg.branch ? { branch: msg.branch } : {}) };
  }

  /** P4.8b: save a specimen to the gallery (notebook state; never spawns). */
  async galleryAdd(dishId: string, entry: GalleryEntryInput): Promise<NotebookAnswer> {
    return this.request<NotebookAnswer>((requestId) => ({ type: 'galleryAdd', requestId, dishId, entry }));
  }

  /** P4.8b: delete one gallery entry. */
  async galleryDelete(dishId: string, id: string): Promise<NotebookAnswer> {
    return this.request<NotebookAnswer>((requestId) => ({ type: 'galleryDelete', requestId, dishId, id }));
  }

  /** P4.8b: what this device stores (read-only). */
  async storageInfo(): Promise<StorageInfo> {
    return (await this.request<Extract<FromWorker, { type: 'storageInfo' }>>((requestId) => ({ type: 'storageInfo', requestId }))).storage;
  }

  /** P4.8b: remove one checkpoint or shelf record (the storage panel, after its confirmation); resolves with the store as it now is. */
  async storageRemove(slotId: string): Promise<{ readonly storage: StorageInfo; readonly removed: boolean }> {
    const msg = await this.request<Extract<FromWorker, { type: 'storageInfo' }>>((requestId) => ({ type: 'storageRemove', requestId, slotId }));
    return { storage: msg.storage, removed: msg.removed === true };
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
      if (msg.lid) this.lastLid[msg.dishId] = msg.lid;
      if (msg.sample !== undefined) this.lastSample[msg.dishId] = msg.sample;
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
    if (msg.type === 'checkpoint') {
      // Unsolicited (P2.8): an automatic checkpoint was written or refused.
      for (const fn of this.checkpointListeners) fn(msg);
      return;
    }
    if (msg.type === 'notebookChanged') {
      for (const fn of this.notebookListeners) fn(msg);
      return;
    }
    if (msg.type === 'tryHorizon') {
      // P4.7 (unsolicited): a turn reached its horizon.
      for (const fn of this.tryListeners) fn(msg);
      return;
    }
    if (msg.type === 'challengeBlocked') {
      // P4.8c (unsolicited): a challenge turn refused a command (the ack resolves the command as usual).
      for (const fn of this.challengeListeners) fn(msg);
      return;
    }
    // P4.7: a turn record changed (unsolicited, or the answer to tryFinish, which then resolves as usual).
    if (msg.type === 'tryTurn') for (const fn of this.tryListeners) fn(msg);
    // P4.1: a loaded dish whose notebook was dropped is announced, then the request resolves as usual.
    if (msg.type === 'loaded' && msg.notebookDropped) for (const fn of this.notebookListeners) fn({ type: 'notebookDropped', dishId: msg.info.dishId, message: msg.notebookDropped });
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

  /** Automatic checkpoint outcomes (P2.8). */
  onCheckpoint(fn: (m: CheckpointNotice) => void): () => void {
    this.checkpointListeners.push(fn);
    return () => {
      const i = this.checkpointListeners.indexOf(fn);
      if (i >= 0) this.checkpointListeners.splice(i, 1);
    };
  }

  /** P2.8: turn the automatic checkpoint ring on or off. */
  setCheckpointRing(enabled: boolean): void {
    this.send({ type: 'checkpointRing', enabled });
  }

  /** P2.8: the recorded regional series of one species' locus, and the loci with records per species (read-only). */
  async traitHistory(dishId: string, species: number, locus: number): Promise<Extract<FromWorker, { type: 'traitHistory' }>> {
    return this.request((requestId) => ({ type: 'traitHistory', requestId, dishId, species, locus }));
  }

  /** P2.8: keep a Notebook entry with a dish (written with its saves); resolves whether the dish kept it. */
  async journalPut(dishId: string, entry: unknown): Promise<boolean> {
    const msg = await this.request<Extract<FromWorker, { type: 'journal' }>>((requestId) => ({ type: 'journalPut', requestId, dishId, entry }));
    return msg.stored === true;
  }

  /** P2.8: the Notebook entries kept with a dish. */
  async journalGet(dishId: string): Promise<Extract<FromWorker, { type: 'journal' }>['entries']> {
    const msg = await this.request<Extract<FromWorker, { type: 'journal' }>>((requestId) => ({ type: 'journalGet', requestId, dishId }));
    return msg.entries;
  }

  async saveSlot(dishId: string, slotId: string, name: string): Promise<SlotSummary> {
    const msg = await this.request<Extract<FromWorker, { type: 'slotSaved' }>>((requestId) => ({ type: 'saveSlot', requestId, dishId, slotId, name }));
    return msg.slot;
  }

  /**
   * An autosave event (SPEC §14.2). The worker builds the dish's file and writes Continue unless Continue
   * already holds exactly that file (D-0033 fix round 3); `wrote` says which. Either way Continue then
   * holds this dish as it is now.
   */
  async autosave(dishId: string): Promise<{ readonly slot: SlotSummary; readonly wrote: boolean }> {
    const msg = await this.request<Extract<FromWorker, { type: 'slotSaved' }>>((requestId) => ({ type: 'autosave', requestId, dishId }));
    return { slot: msg.slot, wrote: msg.wrote };
  }

  async listSlots(): Promise<{ slots: readonly SlotSummary[]; persistent: boolean }> {
    const msg = await this.request<Extract<FromWorker, { type: 'slots' }>>((requestId) => ({ type: 'listSlots', requestId }));
    return { slots: msg.slots, persistent: msg.persistent };
  }

  async loadSlot(slotId: string, newDishId: string): Promise<{ info: DishInfo; usedPredecessor: boolean; branch?: { readonly fromName: string; readonly tick: number } }> {
    const msg = await this.request<Extract<FromWorker, { type: 'loaded' }>>((requestId) => ({ type: 'loadSlot', requestId, slotId, newDishId }));
    // P2.8: an automatic checkpoint opens as a new branch; the reply names where it came from.
    return { info: msg.info, usedPredecessor: msg.usedPredecessor, ...(msg.branch ? { branch: msg.branch } : {}) };
  }

  async deleteSlot(slotId: string): Promise<void> {
    await this.request((requestId) => ({ type: 'deleteSlot', requestId, slotId }));
  }

  async exportDish(dishId: string, strip: boolean, includeNicknames = false): Promise<{ text: string; filename: string }> {
    const msg = await this.request<Extract<FromWorker, { type: 'exported' }>>((requestId) => ({ type: 'exportDish', requestId, dishId, strip, ...(includeNicknames ? { includeNicknames } : {}) }));
    return { text: msg.text, filename: msg.filename };
  }

  /** D-0033: a stored save (the autosave Continue holds) as a .pixelmeba file, exactly as stored. */
  async exportSave(slotId: string, includeNicknames = false): Promise<{ text: string; filename: string }> {
    const msg = await this.request<Extract<FromWorker, { type: 'exported' }>>((requestId) => ({ type: 'exportSave', requestId, slotId, ...(includeNicknames ? { includeNicknames } : {}) }));
    return { text: msg.text, filename: msg.filename };
  }

  async importDish(text: string, newDishId: string): Promise<DishInfo> {
    const msg = await this.request<Extract<FromWorker, { type: 'loaded' }>>((requestId) => ({ type: 'importDish', requestId, text, newDishId }));
    return msg.info;
  }

  // D-0033: the requests that replace the open dish, keeping it first when `keepFrom` names it.

  /** Create a dish (Play shelf, New Dish), keeping the open dish first. */
  async createKeeping(dishId: string, source: DishSource, name: string | undefined, keepFrom: KeepFrom | null): Promise<KeptOr<{ readonly info: DishInfo }>> {
    const msg = await this.request<Extract<FromWorker, { type: 'ready' | 'keepRefused' }>>((requestId) => ({
      type: 'create',
      requestId,
      dishId,
      source,
      ...(name !== undefined ? { name } : {}),
      ...(keepFrom ? { keepFrom } : {}),
    }));
    if (msg.type === 'keepRefused') return keepRefused(msg);
    return { ok: true, info: msg.info, kept: msg.kept ?? null };
  }

  /** Open a save (a named slot, the autosave or an automatic checkpoint), keeping the open dish first. */
  async loadSlotKeeping(
    slotId: string,
    newDishId: string,
    keepFrom: KeepFrom | null,
  ): Promise<KeptOr<{ readonly info: DishInfo; readonly usedPredecessor: boolean; readonly branch?: { readonly fromName: string; readonly tick: number } }>> {
    const msg = await this.request<Extract<FromWorker, { type: 'loaded' | 'keepRefused' }>>((requestId) => ({ type: 'loadSlot', requestId, slotId, newDishId, ...(keepFrom ? { keepFrom } : {}) }));
    if (msg.type === 'keepRefused') return keepRefused(msg);
    return { ok: true, info: msg.info, usedPredecessor: msg.usedPredecessor, kept: msg.kept ?? null, ...(msg.branch ? { branch: msg.branch } : {}) };
  }

  /** Open a .pixelmeba file, keeping the open dish first (the file is checked before anything is kept). */
  async importDishKeeping(text: string, newDishId: string, keepFrom: KeepFrom | null): Promise<KeptOr<{ readonly info: DishInfo }>> {
    const msg = await this.request<Extract<FromWorker, { type: 'loaded' | 'keepRefused' }>>((requestId) => ({ type: 'importDish', requestId, text, newDishId, ...(keepFrom ? { keepFrom } : {}) }));
    if (msg.type === 'keepRefused') return keepRefused(msg);
    return { ok: true, info: msg.info, kept: msg.kept ?? null };
  }

  /**
   * P4.6 Share: the dish's Starting recipe file (read-only). Rejects with a WorkerRequestError (kind
   * 'no-start') and readable text when the dish has no recorded start.
   */
  async recipeExport(dishId: string): Promise<Extract<FromWorker, { type: 'recipeExported' }>> {
    return this.request<Extract<FromWorker, { type: 'recipeExported' }>>((requestId) => ({ type: 'recipeExport', requestId, dishId }));
  }

  /** P4.6: open a Starting recipe file as a new paused dish, keeping the open dish first (the file is checked before anything is kept). */
  async recipeImportKeeping(text: string, newDishId: string, keepFrom: KeepFrom | null): Promise<KeptOr<{ readonly info: DishInfo }>> {
    const msg = await this.request<Extract<FromWorker, { type: 'loaded' | 'keepRefused' }>>((requestId) => ({ type: 'recipeImport', requestId, text, newDishId, ...(keepFrom ? { keepFrom } : {}) }));
    if (msg.type === 'keepRefused') return keepRefused(msg);
    return { ok: true, info: msg.info, kept: msg.kept ?? null };
  }

  /** P4.6 Import recipe ID: start a bundled recipe or What if? idea by its identifier, keeping the open dish first. */
  async recipeIdStartKeeping(id: string, newDishId: string, keepFrom: KeepFrom | null): Promise<KeptOr<{ readonly info: DishInfo }>> {
    const msg = await this.request<Extract<FromWorker, { type: 'ready' | 'keepRefused' }>>((requestId) => ({ type: 'recipeIdStart', requestId, id, newDishId, ...(keepFrom ? { keepFrom } : {}) }));
    if (msg.type === 'keepRefused') return keepRefused(msg);
    return { ok: true, info: msg.info, kept: msg.kept ?? null };
  }

  /** Start an experiment card (P2.5), keeping the open dish first. */
  async experimentStartKeeping(
    cardId: string,
    newDishId: string,
    compare: { readonly compareId: string; readonly aDishId: string; readonly bDishId: string } | null,
    keepFrom: KeepFrom | null,
  ): Promise<KeptOr<{ readonly info: DishInfo; readonly compare: ComparisonState | null }>> {
    const msg = await this.request<Extract<FromWorker, { type: 'experimentStarted' | 'keepRefused' }>>((requestId) => ({
      type: 'experimentStart',
      requestId,
      cardId,
      newDishId,
      compare,
      ...(keepFrom ? { keepFrom } : {}),
    }));
    if (msg.type === 'keepRefused') return keepRefused(msg);
    return { ok: true, info: msg.info, compare: msg.compare, kept: msg.kept ?? null };
  }

  /**
   * P4.5: compare What if? idea `variantId` with the unchanged Garden for 180 s, keeping the open dish
   * first (D-0033). Resolves with the idea's new paused dish and the comparison (setup), a keep refusal,
   * or a readable refusal (`refused`; nothing was started, saved or changed).
   */
  async variantPairStart(args: {
    readonly variantId: string;
    readonly newDishId: string;
    readonly compare: { readonly compareId: string; readonly aDishId: string; readonly bDishId: string };
    readonly sequential: boolean;
    readonly keepFrom: KeepFrom | null;
  }): Promise<KeptOr<{ readonly info: DishInfo; readonly compare: ComparisonState }> | { readonly ok: false; readonly code: 'refused'; readonly message: string }> {
    const { keepFrom, ...rest } = args;
    const msg = await this.request<Extract<FromWorker, { type: 'variantPairStarted' | 'whatIfRefused' | 'keepRefused' }>>((requestId) => ({
      type: 'variantPairStart',
      requestId,
      ...rest,
      ...(keepFrom ? { keepFrom } : {}),
    }));
    if (msg.type === 'keepRefused') return keepRefused(msg);
    if (msg.type === 'whatIfRefused') return { ok: false, code: 'refused', message: msg.message };
    return { ok: true, info: msg.info, compare: msg.compare, kept: msg.kept ?? null };
  }

  /** Duplicate dish, keeping the dish being duplicated first (D-0033); the copy is registered, not activated. */
  async duplicateKeeping(dishId: string, newDishId: string, keepFrom: KeepFrom | null): Promise<KeptOr<{ readonly info: DishInfo }>> {
    const msg = await this.request<Extract<FromWorker, { type: 'ready' | 'keepRefused' }>>((requestId) => ({ type: 'duplicate', requestId, dishId, newDishId, ...(keepFrom ? { keepFrom } : {}) }));
    if (msg.type === 'keepRefused') return keepRefused(msg);
    return { ok: true, info: msg.info, kept: msg.kept ?? null };
  }

  /**
   * How the open dish (with none open: the dish Continue holds) would be kept if an action replaced it
   * now (`opening`: the save it would open). Read-only.
   */
  async keepPlan(aboutDishId: string | null, opening: string | null = null): Promise<WhatIfPlan> {
    const msg = await this.request<Extract<FromWorker, { type: 'keepPlan' }>>((requestId) => ({ type: 'keepPlan', requestId, aboutDishId, opening }));
    return msg.plan;
  }

  /** P4.8: the relationship map of the last 60/180/600 dish seconds (read-only; session state). */
  async relationshipMap(dishId: string, windowSeconds: MapWindow): Promise<RelationshipMapData> {
    const msg = await this.request<Extract<FromWorker, { type: 'relationshipMap' }>>((requestId) => ({ type: 'relationshipMap', requestId, dishId, windowSeconds }));
    return msg.map;
  }

  /** P4.8: replace the open dish's region probes (session state, never a command); answers with masks and readings. */
  async probeSet(dishId: string, probes: readonly ProbeMask[], windowSeconds: MapWindow): Promise<Extract<FromWorker, { type: 'probes' }>> {
    return this.request<Extract<FromWorker, { type: 'probes' }>>((requestId) => ({ type: 'probeSet', requestId, dishId, probes, windowSeconds }));
  }

  /** P4.8: the region probes' readings now (read-only). */
  async probeRead(dishId: string, windowSeconds: MapWindow): Promise<Extract<FromWorker, { type: 'probes' }>> {
    return this.request<Extract<FromWorker, { type: 'probes' }>>((requestId) => ({ type: 'probeRead', requestId, dishId, windowSeconds }));
  }

  /** P3.8: the relationships first seen in a played dish so far (read-only; never saved). */
  async relationships(dishId: string): Promise<Extract<FromWorker, { type: 'relationships' }>> {
    return this.request<Extract<FromWorker, { type: 'relationships' }>>((requestId) => ({ type: 'relationships', requestId, dishId }));
  }

  /** Living relatives of an organism ("Where is its family?"); a read-only query. */
  /** P4.3 session memory: what the dish recorded since `sinceTick` (read-only; never the History sheet's request). */
  async sessionSummary(dishId: string, sinceTick: number): Promise<SessionSummary> {
    const msg = await this.request<Extract<FromWorker, { type: 'sessionSummary' }>>((requestId) => ({ type: 'sessionSummary', requestId, dishId, sinceTick }));
    return msg.summary;
  }

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

  /** New Dish (P2.2): exactly what a dish with these choices would start with. Read-only; creates nothing. */
  async newDishPreview(recipeId: string, seed: number, overrides: RecipeOverrides): Promise<NewDishPreview> {
    const msg = await this.request<Extract<FromWorker, { type: 'newDishPreview' }>>((requestId) => ({ type: 'newDishPreview', requestId, recipeId, seed, overrides }));
    return msg.preview;
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
