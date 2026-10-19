/**
 * P5.6 part 3: the play prompts and Recover a neighborhood through the worker host (DishHost; src/worker/goals.ts,
 * src/worker/challenge.ts; D-0070, D-0071, D-0131).
 *
 * - offers: an H05 dish (a New Dish habitat start: its RECORDED habitat is H05, its recipe FIRST_DISH_V1's habitat is
 *   WATER_GARDEN) offers TWO_NEIGHBORHOODS, a BRINE_CROSSING_V1 dish (on H05) too, a FIRST_DISH_V1 dish does not;
 *   no dish offers RECOVER_A_NEIGHBORHOOD as a goal, and every dish lists it as a challenge starting point;
 * - a save → load between the first clause and the completion completes at the SAME tick as the uninterrupted run
 *   (TWO_NEIGHBORHOODS: the hold; FOOD_RELAY: the saved clauses, amounts and event position); NIGHT_GARDEN (no
 *   shipped dish glows, objectives-p5.test.ts) resumes with the saved clauses, amounts and cycle and reads exactly
 *   as the uninterrupted run at a later tick;
 * - a running prompt never alters behaviour: equal stateHash and full trajectory digest over 3,000 ticks at 4×;
 * - a Recover challenge saved on an H05 baseline with its region chosen: the baseline's region check, its budget of
 *   three counted, and its export / import round trip keeping the region.
 */
import { describe, expect, it } from 'vitest';
import { goalsOf, goalsProblem, goalsWorldProblem, goalWorldRefsOf, type GoalRecord } from '../../src/persistence/notebookGoals';
import { NOTEBOOK_DROPPED_TEXT } from '../../src/persistence/notebook';
import { challengesOf, type ChallengeInput } from '../../src/persistence/notebookChallenges';
import type { NotebookRecord } from '../../src/persistence/notebook';
import { loadSaveFile } from '../../src/persistence/saveFile';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import type { CommandPayload } from '../../src/sim/commands';
import { stateHash } from '../../src/sim/serialize';
import type { World } from '../../src/sim/world';
import { CHALLENGE_REFUSALS } from '../../src/worker/challenge';
import { DishHost } from '../../src/worker/host';
import { CHALLENGE_TEMPLATES_REQUEST, type FromWorker, type RecipeOverrides, type Speed, type ToWorker } from '../../src/worker/protocol';
import { trajectoryDigest } from '../helpers/trajectory';
import { registry } from '../helpers/world';

const REG = registry();
const ISO = '2026-10-18T00:00:00.000Z';
const H05: RecipeOverrides = { empty: true, habitatId: 'H05_BRINE_MOSAIC' };
const sugarStroke = (cx: number): CommandPayload => ({ kind: 'deposit', materialId: 'SUGAR', points: [[cx - 8, 64], [cx, 56], [cx + 8, 64], [cx, 72], [cx, 64]], radius: 6, dose: 0.5 });
const inoculate = (speciesId: string, x: number, y: number, count: number, radius = 6): CommandPayload => ({ kind: 'inoculate', speciesId, x, y, radius, count });

class Driver {
  now = 0;
  readonly out: FromWorker[] = [];
  readonly host: DishHost;
  private req = 0;
  constructor() {
    this.host = new DishHost(REG, (m) => this.out.push(m), { now: () => this.now, iso: () => ISO }, new SaveStore(new MemoryBackend()));
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
  create(dishId: string, recipeId = 'FIRST_DISH_V1', overrides?: RecipeOverrides): World {
    this.send({ type: 'create', requestId: this.id(), dishId, source: { kind: 'recipe', recipeId, ...(overrides ? { overrides } : {}) } }, 'ready');
    return this.host.world(dishId)!;
  }
  catalog(dishId: string, recipeId: string | null = null): string[] {
    return this.send({ type: 'goalCatalog', requestId: this.id(), targetDishId: dishId, recipeId }, 'goalCatalog').goals.map((g) => g.id);
  }
  start(dishId: string, objectiveId: string) {
    return this.send({ type: 'goalStart', requestId: this.id(), dishId, objectiveId }, 'notebook');
  }
  notebook(dishId: string): NotebookRecord {
    return this.send({ type: 'notebookGet', requestId: this.id(), dishId }, 'notebook').record;
  }
  goals(dishId: string): readonly GoalRecord[] {
    return goalsOf(this.notebook(dishId));
  }
  command(dishId: string, commandId: string, payload: CommandPayload) {
    return this.send({ type: 'command', requestId: this.id(), dishId, commandId, payload, undoable: true }, 'ack');
  }
  hash(dishId: string): string {
    return this.send({ type: 'hash', requestId: this.id(), dishId }, 'hash').hash;
  }
  runTo(dishId: string, speed: Speed, target: number): void {
    this.host.handle({ type: 'activate', dishId });
    this.host.handle({ type: 'setSpeed', dishId, speed });
    const w = () => this.host.world(dishId)!;
    while (w().tick < target) {
      this.now += (Math.min(target - w().tick, 4) * 100) / speed;
      this.host.pump();
    }
    this.host.handle({ type: 'setSpeed', dishId, speed: 0 });
    expect(w().tick).toBe(target);
  }
  /** Run to `target`, applying each command right after the step that reaches its tick. */
  play(dishId: string, target: number, cmds: readonly { at: number; payload: CommandPayload }[]): void {
    for (const c of [...cmds].sort((a, b) => a.at - b.at)) {
      if (c.at >= target || c.at < this.host.world(dishId)!.tick) continue;
      this.runTo(dishId, 4, c.at);
      expect(this.command(dishId, `c-${c.at}`, c.payload).result?.accepted, `command at ${c.at}`).toBeGreaterThan(0);
    }
    this.runTo(dishId, 4, target);
  }
  async saveLoad(dishId: string, slotId: string, newDishId: string): Promise<void> {
    const s = await this.sendAsync({ type: 'saveSlot', requestId: this.id(), dishId, slotId, name: dishId });
    expect(s.type).toBe('slotSaved');
    const l = await this.sendAsync({ type: 'loadSlot', requestId: this.id(), slotId, newDishId });
    expect(l.type).toBe('loaded');
    this.host.handle({ type: 'dispose', dishId });
  }
}

describe('offers', () => {
  it('the dish’s RECORDED habitat decides: H05 and BRINE_CROSSING_V1 offer Two neighborhoods, the Garden does not; Recover is only a challenge starting point', () => {
    const h = new Driver();
    const w = h.create('h05', 'FIRST_DISH_V1', H05);
    expect(w.content.habitat.id).toBe('H05_BRINE_MOSAIC');
    expect(REG.recipes.FIRST_DISH_V1!.habitatId).toBe('WATER_GARDEN'); // the build's recipe habitat differs
    // A New Dish habitat start records FIRST_DISH_V1 as its recipe, so the Garden's goals stay offered (D-0078).
    expect(h.catalog('h05')).toEqual(['KEEP_SPRINTERS_GOING', 'SEE_SPRINTER_SPLIT', 'TWO_NEIGHBORHOODS', 'WATCH_STARCH_BECOME_FOOD']);
    h.create('bc', 'BRINE_CROSSING_V1');
    expect(h.catalog('bc')).toEqual(['TWO_NEIGHBORHOODS']);
    h.create('garden');
    expect(h.catalog('garden')).toEqual(['KEEP_SPRINTERS_GOING', 'SEE_SPRINTER_SPLIT', 'WATCH_STARCH_BECOME_FOOD']);
    h.create('lunch', 'SHARED_LUNCH_V1');
    expect(h.catalog('lunch')).toEqual(['FOOD_RELAY']);
    h.create('h11', 'FIRST_DISH_V1', { empty: true, habitatId: 'H11_GRAZING_MEADOW' });
    expect(h.catalog('h11')).toEqual(['KEEP_SPRINTERS_GOING', 'LEAVE_A_REFUGE', 'LIVING_BRIDGE', 'SEE_SPRINTER_SPLIT', 'SUSTAIN_THREE_SPECIES', 'WATCH_STARCH_BECOME_FOOD']);
    h.create('h08', 'FIRST_DISH_V1', { empty: true, habitatId: 'H08_NIGHT_LANTERNS' });
    expect(h.catalog('h08')).toEqual(['KEEP_SPRINTERS_GOING', 'NIGHT_GARDEN', 'SEE_SPRINTER_SPLIT', 'SUSTAIN_THREE_SPECIES', 'WATCH_STARCH_BECOME_FOOD']);
    // The Play card (no dish yet) never considers habitats: the Garden's three only.
    expect(h.send({ type: 'goalCatalog', requestId: h.id(), targetDishId: null, recipeId: 'FIRST_DISH_V1' }, 'goalCatalog').goals.map((g) => g.id)).toEqual(['KEEP_SPRINTERS_GOING', 'SEE_SPRINTER_SPLIT', 'WATCH_STARCH_BECOME_FOOD']);
    // Starting points: every dish lists Recover with its template; never as a goal.
    for (const d of ['h05', 'garden', 'h11']) {
      const t = h.send({ type: 'goalCatalog', requestId: h.id(), targetDishId: d, recipeId: CHALLENGE_TEMPLATES_REQUEST }, 'goalCatalog').goals;
      expect(t.map((g) => g.id)).toEqual(['RECOVER_A_NEIGHBORHOOD']);
      expect(t[0]!.challengeTemplate).toEqual({
        commandBudget: 3,
        allowedTools: ['addLife', 'feed', 'habitat', 'sample', 'cleanWater', 'lid', 'evolution'],
        horizonSeconds: 180,
        predicate: { type: 'biomassThreshold', params: { measure: 'activeCount', threshold: 20, fromBelow: 5 } },
      });
    }
    expect(h.start('garden', 'TWO_NEIGHBORHOODS').refused).toBe('That goal is not available for this dish.');
    expect(h.start('h05', 'RECOVER_A_NEIGHBORHOOD').refused).toBe('That goal is not available for this dish.');
  });
});

describe('a save → load between the first clause and the completion', () => {
  const twoCmds = [
    { at: 600, payload: sugarStroke(40) },
    { at: 1100, payload: sugarStroke(40) },
  ];
  const relayCmds = [{ at: 1, payload: inoculate('B04', 45, 64, 10, 4) }];

  async function prompt(recipeId: string, overrides: RecipeOverrides | undefined, objectiveId: string, cmds: readonly { at: number; payload: CommandPayload }[], saveAt: number | null, end: number): Promise<{ goal: GoalRecord; saved: GoalRecord | null }> {
    const h = new Driver();
    h.create('d', recipeId, overrides);
    expect(h.start('d', objectiveId).refused).toBeUndefined();
    let dish = 'd';
    let saved: GoalRecord | null = null;
    if (saveAt !== null) {
      h.play(dish, saveAt, cmds);
      saved = h.goals(dish)[0]!;
      expect(saved.state).toBe('running');
      await h.saveLoad(dish, 'slot1', 'd2');
      dish = 'd2';
      expect(h.goals(dish)[0]).toEqual(saved);
    }
    h.play(dish, end, cmds);
    const goal = h.goals(dish)[0]!;
    expect(goalsProblem(goalsOf(h.notebook(dish)))).toBeNull();
    return { goal, saved };
  }

  it('TWO_NEIGHBORHOODS (BRINE_CROSSING_V1 fed twice) completes at 1800 both ways', async () => {
    const ref = await prompt('BRINE_CROSSING_V1', undefined, 'TWO_NEIGHBORHOODS', twoCmds, null, 1810);
    expect([ref.goal.state, ref.goal.endTick]).toEqual(['completed', 1800]);
    const re = await prompt('BRINE_CROSSING_V1', undefined, 'TWO_NEIGHBORHOODS', twoCmds, 905, 1810);
    expect(re.saved!.progress).toEqual({ startTick: 0, holdSinceTick: 0, state: 'running' });
    expect([re.goal.state, re.goal.endTick, re.goal.value]).toEqual(['completed', 1800, ref.goal.value]);
  }, 600_000);

  it('FOOD_RELAY (SHARED_LUNCH_V1 with Recyclers added) completes at the same tick with its saved clauses and amounts', async () => {
    const ref = await prompt('SHARED_LUNCH_V1', undefined, 'FOOD_RELAY', relayCmds, null, 1600);
    expect(ref.goal.state).toBe('completed');
    const re = await prompt('SHARED_LUNCH_V1', undefined, 'FOOD_RELAY', relayCmds, ref.goal.endTick! - 25, 1600);
    expect(re.saved!.progress.clauses!.filter((t) => t !== null).length).toBe(3);
    expect(re.saved!.progress.amounts!.length).toBe(4);
    expect(re.saved!.progress.lastEventId).toBeGreaterThan(0);
    expect([re.goal.state, re.goal.endTick]).toEqual(['completed', ref.goal.endTick]);
    expect(re.goal.progress).toEqual(ref.goal.progress);
    console.log(`FOOD_RELAY through the host: completed at ${ref.goal.endTick}`);
  }, 600_000);

  it('NIGHT_GARDEN on the H08 community resumes with its clauses, amounts and cycle exactly as the uninterrupted run reads', async () => {
    const community: RecipeOverrides = { empty: true, habitatId: 'H08_NIGHT_LANTERNS', community: true };
    const ref = await prompt('FIRST_DISH_V1', community, 'NIGHT_GARDEN', [], null, 2700);
    const re = await prompt('FIRST_DISH_V1', community, 'NIGHT_GARDEN', [], 2450, 2700);
    expect(re.saved!.progress).toMatchObject({ cycle: 1, clauses: [null, 2401] });
    expect(ref.goal.state).toBe('running');
    expect(re.goal).toEqual(ref.goal);
    expect(re.goal.progress.amounts![1]).toBeGreaterThan(0);
  }, 600_000);
});

describe('a running prompt never alters behaviour', () => {
  it('SHARED_LUNCH_V1 at 4× for 3,000 ticks with FOOD_RELAY and LEAVE-style clauses running vs none: equal stateHash and full trajectory digest', () => {
    const run = (withGoal: boolean) => {
      const h = new Driver();
      h.create('d', 'SHARED_LUNCH_V1');
      if (withGoal) expect(h.start('d', 'FOOD_RELAY').refused).toBeUndefined();
      h.play('d', 3000, [{ at: 1, payload: inoculate('B04', 45, 64, 10, 4) }]);
      const w = h.host.world('d')!;
      return { hash: stateHash(w), digest: trajectoryDigest(w, 'full'), goals: h.goals('d') };
    };
    const plain = run(false);
    const goal = run(true);
    expect(plain.goals).toEqual([]);
    expect(goal.goals.map((g) => g.state)).toEqual(['completed']);
    expect(goal.hash).toBe(plain.hash);
    expect(goal.digest).toBe(plain.digest);
  }, 600_000);
});

describe('Recover a neighborhood as a challenge', () => {
  const recover = (region: ChallengeInput['region']): ChallengeInput => ({
    name: 'Recover a neighborhood',
    objective: { type: 'biomassThreshold', params: { measure: 'activeCount', threshold: 20, fromBelow: 5 } },
    allowedTools: ['addLife', 'feed', 'habitat', 'sample', 'cleanWater', 'lid', 'evolution'],
    commandBudget: 3,
    horizonSeconds: 180,
    region,
  });

  it('saved on an H05 baseline with its region; refused where there is nothing to recover or no such region; three actions counted; export → import keeps the region', async () => {
    const h = new Driver();
    h.create('h05c', 'FIRST_DISH_V1', { ...H05, community: true });
    const refuse = async (input: ChallengeInput) => {
      const r = await h.sendAsync({ type: 'challengeSave', requestId: h.id(), dishId: 'h05c', challenge: input });
      expect(r.type).toBe('challengeRefused');
      return (r as Extract<FromWorker, { type: 'challengeRefused' }>).message;
    };
    expect(await refuse(recover({ kind: 'habitat', id: 'BRINE_POOL' }))).toBe(CHALLENGE_REFUSALS.nothingToRecover('This region already has 5 or more active organisms.'));
    expect(CHALLENGE_REFUSALS.nothingToRecover('This region already has 5 or more active organisms.')).toBe('This region already has 5 or more active organisms, so there is nothing to recover.');
    expect(await refuse(recover({ kind: 'habitat', id: 'MESH' }))).toBe(CHALLENGE_REFUSALS.cannotRun('this dish has no region MESH'));
    const saved = await h.sendAsync({ type: 'challengeSave', requestId: h.id(), dishId: 'h05c', challenge: recover({ kind: 'habitat', id: 'CHANNEL' }) });
    if (saved.type !== 'challengeSaved') throw new Error(JSON.stringify(saved));
    expect(saved.challenge).toMatchObject({ id: 'ch-1', region: { kind: 'habitat', id: 'CHANNEL' }, commandBudget: 3 });
    // The turn: three counted actions, the fourth refused.
    const started = await h.sendAsync({ type: 'challengeStart', requestId: h.id(), dishId: 'h05c', challengeId: 'ch-1', newDishId: 'turn' });
    if (started.type !== 'challengeStarted') throw new Error(JSON.stringify(started));
    expect(goalsOf(h.notebook('turn')).map((g) => [g.objectiveId, g.state, g.predicate.params.region])).toEqual([['CHALLENGE_1', 'running', 'CHANNEL']]);
    for (let k = 0; k < 3; k++) expect(h.command('turn', `a${k}`, sugarStroke(40 + k)).result?.accepted).toBeGreaterThan(0);
    expect(h.command('turn', 'a3', sugarStroke(50)).error).toBe(CHALLENGE_REFUSALS.budgetUsed(3));
    // Export → import keeps the region and the stable id.
    const ex = await h.sendAsync({ type: 'challengeExport', requestId: h.id(), dishId: 'h05c', challengeId: 'ch-1' });
    if (ex.type !== 'challengeExported') throw new Error(JSON.stringify(ex));
    const loaded = await loadSaveFile(ex.text);
    expect(loaded.notebookDropped).toBeNull();
    expect(challengesOf(loaded.notebook)).toEqual([saved.challenge]);
    expect(challengesOf(loaded.notebook)[0]!.region).toEqual({ kind: 'habitat', id: 'CHANNEL' });
  }, 300_000);
});

/**
 * Fix round 1 (wave 15 verifier): progress that a save must carry, and ordinary commands that must not drop the notebook.
 * - NIGHT_GARDEN with the light switched to fixed (setLightMode, an ordinary command): the attempt ends at the next
 *   tick (endReason 'zero', its endedText), and a save made between the command and that tick reloads with the
 *   WHOLE notebook (it was dropped before: the load-time check refused the running window goal) and ends at the same tick.
 * - LIVING_BRIDGE with Add Life between ticks and a save before the next tick: the saved input base ends the reloaded
 *   attempt at the same tick as the uninterrupted run (before: the base was rebuilt from the loaded ledger, never ended).
 * - A saved light cycle the dish was never in (a forged or stale file) is refused by the file check.
 */
describe('fix round 1: saved progress and ordinary commands', () => {
  const H08: RecipeOverrides = { empty: true, habitatId: 'H08_NIGHT_LANTERNS' };

  it('NIGHT_GARDEN: switching to fixed light ends the attempt at the next tick, uninterrupted and through a save → load made in between', async () => {
    const run = async (reload: boolean) => {
      const h = new Driver();
      h.create('d', 'FIRST_DISH_V1', H08);
      h.play('d', 30, [{ at: 1, payload: inoculate('B09', 64, 64, 6) }, { at: 2, payload: inoculate('A01', 64, 64, 6) }]);
      expect(h.start('d', 'NIGHT_GARDEN').refused).toBeUndefined();
      h.runTo('d', 4, 100);
      expect(h.command('d', 'fixed', { kind: 'setLightMode', mode: 'fixed' }).result?.accepted).toBeGreaterThan(0);
      let dish = 'd';
      if (reload) {
        // A favorite, so the test shows the whole notebook survives (not just the goal).
        const w = h.host.world('d')!;
        let birthId = -1;
        for (let i = 0; i < w.ents.highWater && birthId < 0; i++) if (w.ents.cols.alive[i] === 1) birthId = w.ents.cols.birthId[i]!;
        const fav = h.send({ type: 'favorite', requestId: h.id(), dishId: 'd', op: { kind: 'follow', birthId, nickname: null, pattern: 'circle' } }, 'notebook');
        expect(fav.refused).toBeUndefined();
        const before = h.notebook('d');
        expect(before.favorites).toHaveLength(1);
        expect(goalsOf(before).map((g) => g.state)).toEqual(['running']);
        await h.saveLoad('d', 'slot1', 'd2');
        dish = 'd2';
        const loaded = h.out.filter((m) => m.type === 'loaded').at(-1) as Extract<FromWorker, { type: 'loaded' }>;
        expect(JSON.stringify(loaded)).not.toContain(NOTEBOOK_DROPPED_TEXT);
        expect(h.notebook(dish).favorites).toEqual(before.favorites);
        expect(goalsOf(h.notebook(dish))).toEqual(goalsOf(before));
      }
      h.runTo(dish, 4, 120);
      return goalsOf(h.notebook(dish))[0]!;
    };
    const plain = await run(false);
    expect([plain.state, plain.endTick, plain.endReason]).toEqual(['ended', 101, 'zero']);
    const re = await run(true);
    expect(re).toEqual(plain);
    expect(REG.objectives.NIGHT_GARDEN!.endedText).toMatch(/fixed light/);
  }, 300_000);

  it('LIVING_BRIDGE: an Add Life between ticks, saved before the next tick, ends the reloaded attempt at that tick as uninterrupted (the saved input base)', async () => {
    const run = async (reload: boolean) => {
      const h = new Driver();
      h.create('d', 'FUNGAL_SUPPLY_LINE_V1');
      expect(h.start('d', 'LIVING_BRIDGE').refused).toBeUndefined();
      const base = h.goals('d')[0]!.progress.inputs;
      expect(base).toHaveLength(3);
      h.runTo('d', 4, 50);
      expect(h.command('d', 'add', inoculate('B01', 64, 64, 2)).result?.accepted).toBeGreaterThan(0);
      let dish = 'd';
      if (reload) {
        expect(h.goals('d')[0]!.progress.inputs).toEqual(base);
        await h.saveLoad('d', 'slot1', 'd2');
        dish = 'd2';
        expect(h.goals(dish)[0]!.progress.inputs).toEqual(base);
      }
      h.runTo(dish, 4, 60);
      return { goal: h.goals(dish)[0]!, hash: h.hash(dish) };
    };
    const plain = await run(false);
    expect([plain.goal.state, plain.goal.endTick, plain.goal.endReason]).toEqual(['ended', 51, 'zero']);
    const re = await run(true);
    expect(re.goal).toEqual(plain.goal);
    expect(re.hash).toBe(plain.hash);
  }, 300_000);

  it('the file check refuses a running cycle-window goal whose saved light cycle or clause ticks the dish was never in, and an input base above the ledger', () => {
    const h = new Driver();
    const w = h.create('d', 'FIRST_DISH_V1', { ...H08, community: true });
    expect(h.start('d', 'NIGHT_GARDEN').refused).toBeUndefined();
    h.runTo('d', 4, 2450);
    const record = h.notebook('d');
    const g = goalsOf(record)[0]!;
    expect(g.progress).toMatchObject({ state: 'running', cycle: 1, clauses: [null, 2401] });
    const refs = { speciesIds: w.species.map((s) => s.id), nextBirthId: w.counters.nextBirthId, tick: w.tick, ...goalWorldRefsOf(w) };
    const withProgress = (p: Partial<GoalRecord['progress']>) => ({ ...record, goals: [{ ...g, progress: { ...g.progress, ...p } }] });
    expect(goalsWorldProblem(record as never, refs)).toBeNull();
    expect(goalsWorldProblem(withProgress({ cycle: 99 }) as never, refs)).toBe('a running goal saved a light cycle this dish never had');
    expect(goalsWorldProblem(withProgress({ cycle: 0 }) as never, refs)).toBe('a running goal saved a light cycle this dish was not in');
    expect(goalsWorldProblem(withProgress({ clauses: [null, 2300] }) as never, refs)).toBe('a running goal saw a clause outside its light cycle');
    // Switched to fixed light: only the bound applies (the next tick ends the attempt).
    expect(goalsWorldProblem(withProgress({ cycle: 0 }) as never, { ...refs, cycleStartTick: null })).toBeNull();
    // A LIVING_BRIDGE record's input base above the dish's ledger.
    const lb = h.create('b', 'FUNGAL_SUPPLY_LINE_V1');
    expect(h.start('b', 'LIVING_BRIDGE').refused).toBeUndefined();
    const lr = h.notebook('b');
    const lg = goalsOf(lr)[0]!;
    const lrefs = { speciesIds: lb.species.map((s) => s.id), nextBirthId: lb.counters.nextBirthId, tick: lb.tick, ...goalWorldRefsOf(lb) };
    expect(goalsWorldProblem(lr as never, lrefs)).toBeNull();
    const up = { ...lr, goals: [{ ...lg, progress: { ...lg.progress, inputs: [lg.progress.inputs![0] + 1, lg.progress.inputs![1], lg.progress.inputs![2]] } }] };
    expect(goalsWorldProblem(up as never, lrefs)).toBe('a running goal saved an input base this dish never had');
    const missing = { ...lr, goals: [{ ...lg, progress: { ...lg.progress, inputs: undefined } }] };
    expect(goalsProblem(JSON.parse(JSON.stringify(missing.goals)))).toBe('a goal has an input base its predicate does not have');
  }, 300_000);
});
