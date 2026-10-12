/**
 * P4.8c custom challenges through the worker host (DishHost; src/worker/challenge.ts;
 * src/persistence/notebookChallenges.ts; SPEC §13.5; D07 line 107; D-0071 "Objectives are evaluated, never
 * enforced in the sim"):
 *
 * - a tool the challenge does not allow is refused with its words and the world's stateHash is unchanged;
 * - the action budget counts only ACCEPTED commands of counted kinds (a deposit that placed nothing is free),
 *   refuses at the limit, and Undo gives one back (it is read from the world's own command log);
 * - names, pins and read-only queries are free; outside a challenge the same commands are accepted;
 * - the unrestricted copy (Duplicate) accepts everything and the challenge turn stays restricted;
 *   Another turn plays the same challenge;
 * - the objective is evaluated by the engine: it completes at the same tick as the same goal from content;
 * - never alters behaviour: a dish with three saved challenges vs none, and a challenge turn vs a plain copy
 *   of it, same commands, 4×, 3,000 ticks (with a save → load): equal stateHash and full trajectory digest.
 */
import { describe, expect, it } from 'vitest';
import { goalsOf } from '../../src/persistence/notebookGoals';
import { turnOf } from '../../src/persistence/notebookTurns';
import { challengesOf, type ChallengeInput } from '../../src/persistence/notebookChallenges';
import type { NotebookRecord } from '../../src/persistence/notebook';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import type { CommandPayload } from '../../src/sim/commands';
import { DishHost } from '../../src/worker/host';
import { CHALLENGE_REFUSALS } from '../../src/worker/challenge';
import { GOAL_REFUSALS } from '../../src/worker/goals';
import type { FromWorker, Speed, ToWorker } from '../../src/worker/protocol';
import { trajectoryDigest } from '../helpers/trajectory';
import { registry } from '../helpers/world';

const REG = registry();
const ISO = '2026-10-11T00:00:00.000Z';
const SUGAR: CommandPayload = { kind: 'deposit', materialId: 'SUGAR', points: [[40, 70]], radius: 2, dose: 0.5 };
const SUGAR2: CommandPayload = { kind: 'deposit', materialId: 'SUGAR', points: [[80, 60]], radius: 2, dose: 0.5 };
/** Beyond the rim: the deposit places nothing (accepted 0). */
const SUGAR_NOWHERE: CommandPayload = { kind: 'deposit', materialId: 'SUGAR', points: [[0, 0]], radius: 0, dose: 0.5 };
const SPRINTERS: CommandPayload = { kind: 'inoculate', speciesId: 'B01', x: 64, y: 64, radius: 3, count: 3 };

const FEED_ONLY: ChallengeInput = {
  name: 'Feed only',
  objective: { type: 'keepSpeciesAlive', params: { species: 'B01' }, durationSeconds: 60 },
  allowedTools: ['feed'],
  commandBudget: 2,
  horizonSeconds: 60,
  region: { kind: 'dish' },
};

class Driver {
  now = 0;
  readonly out: FromWorker[] = [];
  readonly backend = new MemoryBackend();
  readonly host: DishHost;
  private req = 0;
  constructor() {
    this.host = new DishHost(REG, (m) => this.out.push(m), { now: () => this.now, iso: () => ISO }, new SaveStore(this.backend));
  }
  id(): number {
    return ++this.req;
  }
  reply<T extends FromWorker['type']>(type: T, requestId: number): Extract<FromWorker, { type: T }> {
    const r = this.out.find((m) => m.type === type && (m as { requestId?: number }).requestId === requestId);
    if (!r) throw new Error(`no ${type} for ${requestId}: ${JSON.stringify(this.out.filter((m) => (m as { requestId?: number }).requestId === requestId || m.type === 'error').slice(-3))}`);
    return r as Extract<FromWorker, { type: T }>;
  }
  send<T extends FromWorker['type']>(msg: ToWorker, type: T): Extract<FromWorker, { type: T }> {
    this.host.handle(msg);
    return this.reply(type, (msg as { requestId: number }).requestId);
  }
  async sendAsync(msg: ToWorker): Promise<FromWorker> {
    await this.host.handleAsync(msg);
    const id = (msg as { requestId: number }).requestId;
    const r = this.out.find((m) => (m as { requestId?: number }).requestId === id);
    if (!r) throw new Error(`no answer to ${msg.type}`);
    return r;
  }
  create(dishId: string) {
    this.send({ type: 'create', requestId: this.id(), dishId, source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' }, name: 'Little Living Garden' }, 'ready');
    return this.host.world(dishId)!;
  }
  hash(dishId: string): string {
    return this.send({ type: 'hash', requestId: this.id(), dishId }, 'hash').hash;
  }
  notebook(dishId: string): NotebookRecord {
    return this.send({ type: 'notebookGet', requestId: this.id(), dishId }, 'notebook').record;
  }
  command(dishId: string, commandId: string, payload: CommandPayload = SUGAR) {
    return this.send({ type: 'command', requestId: this.id(), dishId, commandId, payload, undoable: true }, 'ack');
  }
  undo(dishId: string) {
    return this.send({ type: 'undo', requestId: this.id(), dishId }, 'ack');
  }
  async save(dishId: string, challenge: ChallengeInput) {
    const r = await this.sendAsync({ type: 'challengeSave', requestId: this.id(), dishId, challenge });
    if (r.type !== 'challengeSaved') throw new Error(`not saved: ${JSON.stringify(r)}`);
    return r;
  }
  async start(dishId: string, challengeId: string, newDishId: string) {
    const r = await this.sendAsync({ type: 'challengeStart', requestId: this.id(), dishId, challengeId, newDishId });
    if (r.type !== 'challengeStarted') throw new Error(`not started: ${JSON.stringify(r)}`);
    return r;
  }
  runTo(dishId: string, speed: Speed, target: number): void {
    this.host.handle({ type: 'activate', dishId });
    this.host.handle({ type: 'setSpeed', dishId, speed });
    const w = () => this.host.world(dishId)!;
    while (w().tick < target) {
      this.now += (Math.min(target - w().tick, 4) * 100) / speed;
      this.host.pump();
    }
    expect(w().tick).toBe(target);
    this.host.handle({ type: 'setSpeed', dishId, speed: 0 });
  }
  blocked(dishId: string) {
    return this.out.filter((m): m is Extract<FromWorker, { type: 'challengeBlocked' }> => m.type === 'challengeBlocked' && m.dishId === dishId);
  }
}

/** A Garden paused at tick 30, fed once, with the Feed-only challenge saved there, and its turn 'c1' started. */
async function feedOnlyTurn(h: Driver) {
  h.create('d1');
  h.runTo('d1', 4, 30);
  // A feed in the baseline's own past (same tick as the start): never one of the challenge's actions.
  expect(h.command('d1', 'before', SUGAR).result?.accepted).toBeGreaterThan(0);
  const saved = await h.save('d1', FEED_ONLY);
  const started = await h.start('d1', saved.challenge.id, 'c1');
  return { saved, started };
}

describe('custom challenges through DishHost', () => {
  it('saves a challenge with its baseline on the shelf and starts it as a restricted turn', async () => {
    const h = new Driver();
    const { saved, started } = await feedOnlyTurn(h);
    expect(saved.challenge).toMatchObject({ id: 'ch-1', name: 'Feed only', allowedTools: ['feed'], commandBudget: 2, horizonSeconds: 60, region: { kind: 'dish' } });
    expect(challengesOf(saved.record)).toEqual([saved.challenge]);
    const shelf = Object.values(h.backend.slots).filter((s) => s.slotId.startsWith('shelf-'));
    expect(shelf).toHaveLength(1);
    expect(shelf[0]).toMatchObject({ shelfKind: 'baseline', createdFor: 'ch-1', tick: 30, checksum: saved.challenge.baseline.checksum });
    expect(saved.challenge.baseline).toMatchObject({ tick: 30, worldId: h.host.world('d1')!.worldId });
    expect(started.turn).toMatchObject({ turn: 1, startTick: 30, horizonTicks: 600, objectiveId: 'CHALLENGE_1', challenge: { id: 'ch-1', name: 'Feed only', allowedTools: ['feed'], commandBudget: 2 } });
    expect(started.turn.challenge!.startSeq).toBe(h.host.world('c1')!.commands.nextSeq);
    expect(h.hash('c1')).toBe(h.hash('d1'));
    // The goal is the challenge's own definition, started at the turn's start tick.
    const goals = goalsOf(h.notebook('c1'));
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ objectiveId: 'CHALLENGE_1', title: 'Feed only', state: 'running', startTick: 30, predicate: { type: 'keepSpeciesAlive', params: { species: 'B01' }, durationSeconds: 60 } });
    expect(challengesOf(h.notebook('c1'))).toEqual([saved.challenge]);
  });

  it('refuses a tool it does not allow (the world unchanged), counts only accepted actions, refuses at the budget, and Undo gives one back', async () => {
    const h = new Driver();
    await feedOnlyTurn(h);
    const w = () => h.host.world('c1')!;
    const h0 = h.hash('c1');
    const seq0 = w().commands.nextSeq;

    const life = h.command('c1', 'life', SPRINTERS);
    expect(life.result).toBeNull();
    expect(life.error).toBe("This challenge doesn't allow Add Life. The limit applies only inside this challenge.");
    expect(h.blocked('c1').map((b) => b.message)).toEqual([life.error]);
    expect(h.hash('c1')).toBe(h0);
    expect(w().commands.nextSeq).toBe(seq0); // never reached the world: no sequence number taken
    expect(h.command('c1', 'lid', { kind: 'setLid', lid: 'closed' }).error).toBe(CHALLENGE_REFUSALS.notAllowed('Lid'));
    expect(h.command('c1', 'evo', { kind: 'setMutationPreset', preset: 'accelerated' }).error).toBe(CHALLENGE_REFUSALS.notAllowed('Evolution settings'));
    expect(h.hash('c1')).toBe(h0);

    // A deposit that placed nothing is not an action (D07 "successful placements").
    const nowhere = h.command('c1', 'nowhere', SUGAR_NOWHERE);
    expect(nowhere.error).toBeUndefined();
    expect(nowhere.result?.accepted).toBe(0);
    expect(h.command('c1', 'feed-1', SUGAR).result?.accepted).toBeGreaterThan(0);
    expect(h.command('c1', 'feed-2', SUGAR2).result?.accepted).toBeGreaterThan(0);
    const h2 = h.hash('c1');
    const third = h.command('c1', 'feed-3', SUGAR);
    expect(third.result).toBeNull();
    expect(third.error).toBe("This challenge's 2 actions are used.");
    expect(h.hash('c1')).toBe(h2);

    // Free: names and pins, and read-only queries, even with the budget used and lineage not in the list.
    const rename = h.command('c1', 'name', { kind: 'lineage', op: 'rename', branch: 0, name: 'Founders' });
    expect(rename.error).toBeUndefined();
    expect(rename.result).not.toBeNull(); // it reached the world (a label: never refused, never counted)
    expect(h.command('c1', 'pin', { kind: 'lineage', op: 'pin', branch: 0, pinned: true }).error).toBeUndefined();
    h.send({ type: 'notebookGet', requestId: h.id(), dishId: 'c1' }, 'notebook');
    h.send({ type: 'lineage', requestId: h.id(), dishId: 'c1', branch: null, birthId: null }, 'lineage');
    h.send({ type: 'relationshipMap', requestId: h.id(), dishId: 'c1', windowSeconds: 60 }, 'relationshipMap');
    h.send({ type: 'probeRead', requestId: h.id(), dishId: 'c1', windowSeconds: 60 }, 'probes');

    // Undo rewinds the last accepted command (the pin and rename are labels re-applied after it): one action back.
    expect(h.undo('c1').error).toBeUndefined();
    // The goal is evaluated as any goal: Undo ends the running attempt ('undone', D-0078); Try again starts the challenge's goal anew.
    expect(goalsOf(h.notebook('c1')).at(-1)).toMatchObject({ objectiveId: 'CHALLENGE_1', state: 'ended', endReason: 'undone' });
    const again = h.send({ type: 'goalStart', requestId: h.id(), dishId: 'c1', objectiveId: 'CHALLENGE_1' }, 'notebook');
    expect(again.refused).toBeUndefined();
    expect(goalsOf(again.record).at(-1)).toMatchObject({ objectiveId: 'CHALLENGE_1', title: 'Feed only', state: 'running' });
    expect(h.send({ type: 'goalStart', requestId: h.id(), dishId: 'd1', objectiveId: 'CHALLENGE_1' }, 'notebook').refused).toBeDefined(); // only on the challenge turn
    expect(h.command('c1', 'feed-4', SUGAR2).result?.accepted).toBeGreaterThan(0);
    expect(h.command('c1', 'feed-5', SUGAR).error).toBe("This challenge's 2 actions are used.");

    // Time passing changes nothing about the count.
    h.runTo('c1', 4, 100);
    expect(h.command('c1', 'feed-6', SUGAR).error).toBe("This challenge's 2 actions are used.");
    expect(h.out.filter((m) => m.type === 'error')).toEqual([]);
  });

  it('outside a challenge the same commands are accepted; the unrestricted copy accepts everything and the turn stays restricted', async () => {
    const h = new Driver();
    await feedOnlyTurn(h);
    // The dish the challenge was made from is an ordinary dish.
    expect(h.command('d1', 'd-life', SPRINTERS).result?.accepted).toBeGreaterThan(0);
    for (const [k, p] of [['a', SUGAR], ['b', SUGAR2], ['c', SUGAR]] as const) expect(h.command('d1', `d-${k}`, p).result?.accepted).toBeGreaterThan(0);
    expect(h.command('d1', 'd-lid', { kind: 'setLid', lid: 'closed' }).result?.accepted).toBe(1);
    expect(h.blocked('d1')).toHaveLength(0);

    // Leave challenge → Open an unrestricted copy: the ordinary Duplicate path.
    expect(h.command('c1', 'c-feed-1', SUGAR).result?.accepted).toBeGreaterThan(0);
    expect(h.command('c1', 'c-feed-2', SUGAR2).result?.accepted).toBeGreaterThan(0);
    const before = h.hash('c1');
    const copy = h.send({ type: 'duplicate', requestId: h.id(), dishId: 'c1', newDishId: 'free' }, 'ready');
    expect(copy.info.turn).toBeUndefined();
    expect(turnOf(h.notebook('free'))).toBeNull();
    expect(challengesOf(h.notebook('free'))).toEqual([]);
    expect(h.hash('free')).toBe(before);
    expect(h.command('free', 'f-life', SPRINTERS).result?.accepted).toBeGreaterThan(0);
    for (const k of ['1', '2', '3']) expect(h.command('free', `f-feed-${k}`, SUGAR).result?.accepted).toBeGreaterThan(0);
    expect(h.command('free', 'f-lid', { kind: 'setLid', lid: 'closed' }).result?.accepted).toBe(1);
    expect(h.blocked('free')).toHaveLength(0);
    // The challenge turn is unchanged and still restricted.
    expect(h.hash('c1')).toBe(before);
    expect(h.command('c1', 'c-life', SPRINTERS).error).toBe(CHALLENGE_REFUSALS.notAllowed('Add Life'));
    expect(h.command('c1', 'c-feed-3', SUGAR).error).toBe(CHALLENGE_REFUSALS.budgetUsed(2));
  });

  it('fix round 1: Finish leaves the challenge — a finished turn is an ordinary dish with no limits (SPEC §13.5), and Undo keeps it finished', async () => {
    const h = new Driver();
    await feedOnlyTurn(h);
    expect(h.command('c1', 'f1', SUGAR).result?.accepted).toBeGreaterThan(0);
    expect(h.command('c1', 'f2', SUGAR2).result?.accepted).toBeGreaterThan(0);
    expect(h.command('c1', 'f3', SUGAR).error).toBe(CHALLENGE_REFUSALS.budgetUsed(2));
    expect(h.command('c1', 'l0', SPRINTERS).error).toBe(CHALLENGE_REFUSALS.notAllowed('Add Life'));
    const fin = h.send({ type: 'tryFinish', requestId: h.id(), dishId: 'c1' }, 'tryTurn');
    expect(fin.turn).toMatchObject({ state: 'finished', challenge: { id: 'ch-1' } }); // the record keeps the challenge as history
    const blockedBefore = h.blocked('c1').length;
    expect(h.command('c1', 'l1', SPRINTERS).result?.accepted).toBeGreaterThan(0);
    expect(h.command('c1', 'f4', SUGAR).result?.accepted).toBeGreaterThan(0);
    expect(h.command('c1', 'lid', { kind: 'setLid', lid: 'closed' }).result?.accepted).toBe(1);
    expect(h.undo('c1').error).toBeUndefined();
    expect(turnOf(h.notebook('c1'))?.state).toBe('finished');
    expect(h.command('c1', 'f5', SUGAR2).result?.accepted).toBeGreaterThan(0);
    expect(h.blocked('c1')).toHaveLength(blockedBefore);
  });

  it('fix round 2: Finish leaves the challenge goal too — a result measured after the limits are off never completes the challenge', async () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 30);
    // B03 is not in the Garden: only Add Life (which this challenge refuses) can meet this objective.
    const LIFE_B03: CommandPayload = { kind: 'inoculate', speciesId: 'B03', x: 48, y: 64, radius: 3, count: 3 };
    const saved = await h.save('d1', { ...FEED_ONLY, name: 'Grow B03', objective: { type: 'biomassThreshold', params: { species: 'B03', threshold: 0.5 } } });
    await h.start('d1', saved.challenge.id, 'c1');
    expect(goalsOf(h.notebook('c1')).at(-1)).toMatchObject({ objectiveId: 'CHALLENGE_1', state: 'running' });
    expect(h.command('c1', 'l0', LIFE_B03).error).toBe(CHALLENGE_REFUSALS.notAllowed('Add Life'));
    h.runTo('c1', 4, 40);
    const fin = h.send({ type: 'tryFinish', requestId: h.id(), dishId: 'c1' }, 'tryTurn');
    expect(fin.turn).toMatchObject({ state: 'finished' });
    const left = goalsOf(h.notebook('c1')).at(-1);
    expect(left).toMatchObject({ objectiveId: 'CHALLENGE_1', state: 'continuedFreely', endReason: 'left', endTick: 40 });
    const announced = h.out.filter((m) => m.type === 'notebookChanged' && m.dishId === 'c1' && m.change.kind === 'goal');
    expect(announced.at(-1)).toMatchObject({ change: { kind: 'goal', id: left!.id, state: 'continuedFreely' } });
    // Now an ordinary dish: Add Life is accepted, and the organisms it placed meet the old objective at once…
    expect(h.command('c1', 'l1', LIFE_B03).result?.accepted).toBeGreaterThan(0);
    h.runTo('c1', 4, 100);
    // …but nothing records that as the challenge's completion.
    expect(goalsOf(h.notebook('c1')).map((g) => g.state)).toEqual(['continuedFreely']);
    // The challenge goal cannot be tried again outside the challenge (no limits).
    const again = h.send({ type: 'goalStart', requestId: h.id(), dishId: 'c1', objectiveId: 'CHALLENGE_1' }, 'notebook');
    expect(again.refused).toBe(GOAL_REFUSALS.unknown);
    expect(goalsOf(again.record).map((g) => g.state)).toEqual(['continuedFreely']);
    // Finishing again changes nothing (one-way, no second leave).
    h.send({ type: 'tryFinish', requestId: h.id(), dishId: 'c1' }, 'tryTurn');
    expect(goalsOf(h.notebook('c1'))).toHaveLength(1);
  });

  it('fix round 2: control — inside the challenge the same objective is still evaluated and Try again works', async () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 30);
    const saved = await h.save('d1', { ...FEED_ONLY, name: 'Grow B03', allowedTools: ['addLife'], objective: { type: 'biomassThreshold', params: { species: 'B03', threshold: 0.5 } } });
    await h.start('d1', saved.challenge.id, 'c1');
    expect(h.command('c1', 'l1', { kind: 'inoculate', speciesId: 'B03', x: 48, y: 64, radius: 3, count: 3 }).result?.accepted).toBeGreaterThan(0);
    h.runTo('c1', 4, 40);
    expect(goalsOf(h.notebook('c1')).at(-1)).toMatchObject({ objectiveId: 'CHALLENGE_1', state: 'completed' });
    const again = h.send({ type: 'goalStart', requestId: h.id(), dishId: 'c1', objectiveId: 'CHALLENGE_1' }, 'notebook');
    expect(again.refused).toBeUndefined();
  });

  it('fix round 1: Lid and Evolution settings never use an action (D07 "Configure and inspect are free"); a challenge can still disallow them', async () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 30);
    const saved = await h.save('d1', { ...FEED_ONLY, allowedTools: ['feed', 'lid', 'evolution'], commandBudget: 1 });
    await h.start('d1', saved.challenge.id, 'c1');
    expect(h.command('c1', 'lid-1', { kind: 'setLid', lid: 'closed' }).result?.accepted).toBe(1);
    expect(h.command('c1', 'lid-2', { kind: 'setLid', lid: 'closed' }).result?.accepted).toBe(1); // already closed: still free
    expect(h.command('c1', 'evo', { kind: 'setMutationPreset', preset: 'accelerated' }).error).toBeUndefined();
    expect(h.command('c1', 'f1', SUGAR).result?.accepted).toBeGreaterThan(0);
    expect(h.command('c1', 'f2', SUGAR2).error).toBe(CHALLENGE_REFUSALS.budgetUsed(1));
    expect(h.command('c1', 'lid-3', { kind: 'setLid', lid: 'open' }).result?.accepted).toBe(1);
    expect(h.command('c1', 'l', SPRINTERS).error).toBe(CHALLENGE_REFUSALS.notAllowed('Add Life'));
  });

  it('Another turn plays the same challenge (limits and goal), with a fresh budget', async () => {
    const h = new Driver();
    await feedOnlyTurn(h);
    h.command('c1', 'f1', SUGAR);
    h.command('c1', 'f2', SUGAR2);
    h.runTo('c1', 4, 30 + 600); // the horizon
    expect(turnOf(h.notebook('c1'))?.state).toBe('atHorizon');
    const next = await h.sendAsync({ type: 'tryNext', requestId: h.id(), dishId: 'c1', newDishId: 'c2', discard: true });
    if (next.type !== 'tryStarted') throw new Error(JSON.stringify(next));
    expect(next.turn).toMatchObject({ turn: 2, objectiveId: 'CHALLENGE_1', challenge: { id: 'ch-1', allowedTools: ['feed'], commandBudget: 2 } });
    expect(goalsOf(h.notebook('c2'))[0]).toMatchObject({ objectiveId: 'CHALLENGE_1', state: 'running', startTick: 30 });
    expect(challengesOf(h.notebook('c2'))).toHaveLength(1);
    expect(h.command('c2', 'l', SPRINTERS).error).toBe(CHALLENGE_REFUSALS.notAllowed('Add Life'));
    expect(h.command('c2', 'f1', SUGAR).result?.accepted).toBeGreaterThan(0);
    expect(h.command('c2', 'f2', SUGAR2).result?.accepted).toBeGreaterThan(0);
    expect(h.command('c2', 'f3', SUGAR).error).toBe(CHALLENGE_REFUSALS.budgetUsed(2));
  });

  it('D-0090: a challenge never shares a Try my dish starting point: it writes its own, so removing the try one in Storage leaves it startable', async () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 30);
    const t = await h.sendAsync({ type: 'tryStart', requestId: h.id(), dishId: 'd1', newDishId: 't1', objectiveId: null, horizonSeconds: 60, prediction: '' });
    expect(t.type).toBe('tryStarted');
    const shelf = () => Object.values(h.backend.slots).filter((s) => s.slotId.startsWith('shelf-'));
    expect(shelf().map((s) => s.createdFor)).toEqual(['try-1']);
    const saved = await h.save('d1', FEED_ONLY);
    // The precondition that made them share one before: the same paused moment, the same checksum.
    expect(shelf()[0]!.checksum).toBe(saved.challenge.baseline.checksum);
    expect(shelf().map((s) => s.createdFor).sort()).toEqual(['ch-1', 'try-1']);
    const tryRow = shelf().find((s) => s.createdFor === 'try-1')!;
    const removed = await h.sendAsync({ type: 'storageRemove', requestId: h.id(), slotId: tryRow.slotId });
    expect(removed).toMatchObject({ type: 'storageInfo', removed: true });
    expect(shelf().map((s) => s.createdFor)).toEqual(['ch-1']);
    const started = await h.start('d1', saved.challenge.id, 'c1');
    expect(started.turn).toMatchObject({ startTick: 30, objectiveId: 'CHALLENGE_1', baseline: { checksum: saved.challenge.baseline.checksum, shelfId: shelf()[0]!.slotId } });
    // A second challenge at the same moment shares the challenge's own record, not a new one.
    await h.save('d1', { ...FEED_ONLY, name: 'Feed only again' });
    expect(shelf().map((s) => s.createdFor)).toEqual(['ch-1']);
  });

  it('D-0090: when only a Try my dish record holds the moment (its own removed, or a save from before D-0090), Start stores the challenge\'s own copy', async () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 30);
    expect((await h.sendAsync({ type: 'tryStart', requestId: h.id(), dishId: 'd1', newDishId: 't1', objectiveId: null, horizonSeconds: 60, prediction: '' })).type).toBe('tryStarted');
    const saved = await h.save('d1', FEED_ONLY);
    const shelf = () => Object.values(h.backend.slots).filter((s) => s.slotId.startsWith('shelf-'));
    const own = shelf().find((s) => s.createdFor === 'ch-1')!;
    expect(await h.sendAsync({ type: 'storageRemove', requestId: h.id(), slotId: own.slotId })).toMatchObject({ type: 'storageInfo', removed: true });
    expect(shelf().map((s) => s.createdFor)).toEqual(['try-1']);
    const first = await h.start('d1', saved.challenge.id, 'c1');
    const copy = shelf().find((s) => s.createdFor === 'ch-1');
    expect(copy).toMatchObject({ shelfKind: 'baseline', tick: 30, checksum: saved.challenge.baseline.checksum });
    expect(first.turn.baseline.shelfId).toBe(copy!.slotId);
    // Removing the Try my dish row now leaves the challenge its own starting point.
    const tryRow = shelf().find((s) => s.createdFor === 'try-1')!;
    expect(await h.sendAsync({ type: 'storageRemove', requestId: h.id(), slotId: tryRow.slotId })).toMatchObject({ type: 'storageInfo', removed: true });
    const again = await h.start('d1', saved.challenge.id, 'c2');
    expect(again.turn.baseline.shelfId).toBe(copy!.slotId);
    expect(shelf().map((s) => s.createdFor)).toEqual(['ch-1']);
  });

  it('refuses what cannot be saved: an unknown species, a "custom" type, a gate goal, a budget of 0, a 21st challenge', async () => {
    const h = new Driver();
    h.create('d1');
    const refused = async (challenge: unknown) => {
      const r = await h.sendAsync({ type: 'challengeSave', requestId: h.id(), dishId: 'd1', challenge: challenge as ChallengeInput });
      expect(r.type).toBe('challengeRefused');
      return r.type === 'challengeRefused' ? r.message : '';
    };
    const before = JSON.stringify(h.backend.slots);
    expect(await refused({ ...FEED_ONLY, objective: { type: 'keepSpeciesAlive', params: { species: 'ZZZ' }, durationSeconds: 60 } })).toMatch(/cannot run/);
    expect(await refused({ ...FEED_ONLY, objective: { type: 'custom', params: {} } })).toMatch(/custom/);
    expect(await refused({ ...FEED_ONLY, objective: { type: 'transferAcrossGate', params: { gate: 'S01', field: 'sugar', threshold: 1 } } })).toMatch(/gate/);
    expect(await refused({ ...FEED_ONLY, commandBudget: 0 })).toMatch(/budget/);
    expect(await refused({ ...FEED_ONLY, script: 'alert(1)' })).toMatch(/unknown field/);
    expect(JSON.stringify(h.backend.slots)).toBe(before); // nothing written
    for (let k = 0; k < 20; k++) await h.save('d1', { ...FEED_ONLY, name: `C ${k + 1}` });
    // Made at one paused moment, they share one baseline on the shelf.
    expect(Object.keys(h.backend.slots).filter((k) => k.startsWith('shelf-'))).toHaveLength(1);
    expect(challengesOf(h.notebook('d1')).map((c) => c.id).at(-1)).toBe('ch-20');
    expect(await refused(FEED_ONLY)).toBe(CHALLENGE_REFUSALS.full(20));
  });

  it('the objective is evaluated by the engine: it completes at the same tick as the same goal from content', async () => {
    const h = new Driver();
    h.create('d1');
    h.runTo('d1', 4, 20);
    const saved = await h.save('d1', { name: 'See a split', objective: { type: 'observeEvent', params: { event: 'birth', species: 'B01' } }, allowedTools: ['addLife', 'feed', 'habitat', 'sample', 'cleanWater', 'lid', 'evolution'], commandBudget: null, horizonSeconds: 600, region: { kind: 'dish' } });
    // The same moment with the content goal SEE_SPRINTER_SPLIT (a plain copy of the paused dish).
    h.send({ type: 'duplicate', requestId: h.id(), dishId: 'd1', newDishId: 'plain' }, 'ready');
    h.send({ type: 'goalStart', requestId: h.id(), dishId: 'plain', objectiveId: 'SEE_SPRINTER_SPLIT' }, 'notebook');
    await h.start('d1', saved.challenge.id, 'c1');
    expect(h.hash('c1')).toBe(h.hash('plain'));
    const done = (dishId: string) => goalsOf(h.notebook(dishId)).at(-1)!;
    for (let t = 120; done('c1').state === 'running' && t <= 3000; t += 100) {
      h.runTo('c1', 4, t);
      h.runTo('plain', 4, t);
    }
    const a = done('c1');
    const b = done('plain');
    expect(a.state).toBe('completed');
    expect(b.state).toBe('completed');
    expect(a.endTick).toBe(b.endTick);
    expect(a.value).toBe(b.value);
    expect(h.hash('c1')).toBe(h.hash('plain'));
  }, 300_000);

  it('never alters behaviour: three saved challenges vs none, and a challenge turn vs a plain copy (3,000 ticks at 4×, save → load)', async () => {
    const h = new Driver();
    h.create('with');
    h.create('none');
    const all: ChallengeInput = { ...FEED_ONLY, allowedTools: ['addLife', 'feed', 'habitat', 'sample', 'cleanWater', 'lid', 'evolution'], commandBudget: null, horizonSeconds: 600 };
    await h.save('with', all);
    await h.save('with', { ...all, name: 'Sugar level', objective: { type: 'fieldInRange', params: { field: 'sugar', min: 0, max: 5 }, durationSeconds: 30 }, region: { kind: 'quarter', id: 'topRight' } });
    const third = await h.save('with', { ...all, name: 'Grow', objective: { type: 'biomassThreshold', params: { threshold: 500 } } });
    expect(challengesOf(third.record)).toHaveLength(3);
    expect(h.hash('with')).toBe(h.hash('none'));
    // The turn's challenge field: a challenge turn vs a plain copy of it (no turn, no challenges).
    await h.start('with', third.challenge.id, 'turn');
    h.send({ type: 'duplicate', requestId: h.id(), dishId: 'turn', newDishId: 'plain' }, 'ready');
    expect(turnOf(h.notebook('turn'))?.challenge).toBeDefined();
    expect(turnOf(h.notebook('plain'))).toBeNull();

    const play = async (dishId: string, slot: string, reloadAs: string): Promise<string> => {
      h.runTo(dishId, 4, 300);
      expect(h.command(dishId, `${dishId}-a`).result?.accepted).toBeGreaterThan(0);
      h.runTo(dishId, 4, 1500);
      await h.sendAsync({ type: 'saveSlot', requestId: h.id(), dishId, slotId: slot, name: dishId });
      const l = await h.sendAsync({ type: 'loadSlot', requestId: h.id(), slotId: slot, newDishId: reloadAs });
      expect(l.type).toBe('loaded');
      h.runTo(reloadAs, 4, 2000);
      expect(h.command(reloadAs, `${reloadAs}-b`, SUGAR2).result?.accepted).toBeGreaterThan(0);
      h.runTo(reloadAs, 4, 3000);
      return h.hash(reloadAs);
    };
    const a = await play('with', 'slot1', 'with2');
    const b = await play('none', 'slot2', 'none2');
    expect(challengesOf(h.notebook('with2'))).toHaveLength(3);
    expect(challengesOf(h.notebook('none2'))).toHaveLength(0);
    expect(a).toBe(b);
    expect(trajectoryDigest(h.host.world('with2')!, 'full')).toBe(trajectoryDigest(h.host.world('none2')!, 'full'));
    const c = await play('turn', 'slot3', 'turn2');
    const d = await play('plain', 'slot4', 'plain2');
    expect(turnOf(h.notebook('turn2'))?.challenge).toBeDefined();
    expect(c).toBe(d);
    expect(trajectoryDigest(h.host.world('turn2')!, 'full')).toBe(trajectoryDigest(h.host.world('plain2')!, 'full'));
  }, 900_000);
});
