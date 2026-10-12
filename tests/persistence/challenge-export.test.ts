/**
 * P4.8c challenge files (SPEC §13.5 "exported with stable IDs, region masks and baseline checksum"; D02 §20 "To
 * share, use the existing file export"; D-0070 notebook import rules):
 *
 * - export → import round trip: the challenge keeps its stable id, its region and its numbers; the file's own
 *   state checksum is the challenge's baseline checksum; the file's notebook holds only this challenge;
 * - the imported dish offers Start while its state checksum still equals the baseline's (also on a device
 *   whose shelf never held the baseline), and starts the challenge; once the dish changed it refuses with
 *   "This dish has changed since the challenge was made…";
 * - malformed challenges (an unknown species, a 'custom' type, a budget of 0 or 100, a non-finite threshold,
 *   an unknown tool group, 21 records) drop the notebook with notebookDropped, and the world still loads.
 */
import { describe, expect, it } from 'vitest';
import { loadSaveFile, parseSaveFile } from '../../src/persistence/saveFile';
import { NOTEBOOK_DROPPED_TEXT, notebookProblem, sealNotebook, type NotebookRecord } from '../../src/persistence/notebook';
import { challengesOf, challengesProblem, type ChallengeInput, type ChallengeRecord } from '../../src/persistence/notebookChallenges';
import { withoutTurnNotes } from '../../src/persistence/notebookTurns';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import { stateHash } from '../../src/sim/serialize';
import { DishHost } from '../../src/worker/host';
import { CHALLENGE_REFUSALS } from '../../src/worker/challenge';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

const REG = registry();
const ISO = '2026-10-11T00:00:00.000Z';

const LEVEL: ChallengeInput = {
  name: 'Sugar in the top right',
  objective: { type: 'fieldInRange', params: { field: 'sugar', min: 0, max: 5 }, durationSeconds: 30 },
  allowedTools: ['feed', 'lid'],
  commandBudget: 5,
  horizonSeconds: 180,
  region: { kind: 'quarter', id: 'topRight' },
};

class Device {
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
  async ask(msg: ToWorker): Promise<FromWorker> {
    if (msg.type === 'create' || msg.type === 'notebookGet' || msg.type === 'setSpeed') this.host.handle(msg);
    else await this.host.handleAsync(msg);
    const id = (msg as { requestId?: number }).requestId;
    return this.out.find((m) => (m as { requestId?: number }).requestId === id)!;
  }
  async notebook(dishId: string): Promise<NotebookRecord> {
    const r = await this.ask({ type: 'notebookGet', requestId: this.id(), dishId });
    if (r.type !== 'notebook') throw new Error(JSON.stringify(r));
    return r.record;
  }
  async check(dishId: string, challengeId: string): Promise<string | null> {
    const r = await this.ask({ type: 'challengeStart', requestId: this.id(), dishId, challengeId, newDishId: '', check: true });
    if (r.type !== 'challengeChecked') throw new Error(JSON.stringify(r));
    return r.refusal;
  }
  async import(text: string, newDishId: string) {
    const r = await this.ask({ type: 'importDish', requestId: this.id(), text, newDishId });
    if (r.type !== 'loaded') throw new Error(JSON.stringify(r));
    return r;
  }
  shelfCount(): number {
    return Object.keys(this.backend.slots).filter((k) => k.startsWith('shelf-')).length;
  }
}

/** A Garden run to tick 40, a challenge saved there, and its exported file. */
async function exportedChallenge(): Promise<{ device: Device; challenge: ChallengeRecord; text: string; filename: string }> {
  const device = new Device();
  await device.ask({ type: 'create', requestId: device.id(), dishId: 'd1', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' }, name: 'Little Living Garden' });
  device.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 4 });
  while (device.host.world('d1')!.tick < 40) {
    device.now += 100;
    device.host.pump();
  }
  device.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
  const saved = await device.ask({ type: 'challengeSave', requestId: device.id(), dishId: 'd1', challenge: LEVEL });
  if (saved.type !== 'challengeSaved') throw new Error(JSON.stringify(saved));
  // The dish runs on after the challenge was made: the export still carries the baseline moment.
  device.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 4 });
  for (let k = 0; k < 5; k++) {
    device.now += 100;
    device.host.pump();
  }
  device.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
  const ex = await device.ask({ type: 'challengeExport', requestId: device.id(), dishId: 'd1', challengeId: saved.challenge.id });
  if (ex.type !== 'challengeExported') throw new Error(JSON.stringify(ex));
  return { device, challenge: saved.challenge, text: ex.text, filename: ex.filename };
}

/** `text` with its notebook's challenges replaced (sealed again, so only the content can be the problem). */
async function withChallenges(text: string, challenges: unknown[]): Promise<string> {
  const file = JSON.parse(text) as { notebook: NotebookRecord };
  const notebook = await sealNotebook({ ...file.notebook, challenges: challenges as ChallengeRecord[] });
  return JSON.stringify({ ...file, notebook });
}

describe('challenge files', () => {
  it('export → import keeps the challenge, its stable id and region; the baseline checksum is the file checksum', async () => {
    const { challenge, text, filename } = await exportedChallenge();
    expect(filename).toBe('sugar-in-the-top-right.challenge.pixelmeba');
    const file = await parseSaveFile(text);
    expect(file.checksum).toBe(challenge.baseline.checksum);
    expect(file.tick).toBe(40);
    const loaded = await loadSaveFile(text);
    expect(loaded.notebookDropped).toBeNull();
    // Only this challenge travels: no favorites, goals, stories, turns or nicknames.
    expect(loaded.notebook).toMatchObject({ favorites: [], challenges: [challenge] });
    expect(Object.keys(loaded.notebook).sort()).toEqual(['challenges', 'checksum', 'favorites', 'format', 'nextFavorite', 'notebookVersion', 'worldId']);
    expect(challengesOf(loaded.notebook)[0]).toMatchObject({ id: 'ch-1', region: { kind: 'quarter', id: 'topRight' }, objective: { type: 'fieldInRange', params: { field: 'sugar', min: 0, max: 5 }, durationSeconds: 30 } });

    // Imported on another device (its shelf never held the baseline): Start is offered and starts.
    const other = new Device();
    const r = await other.import(text, 'imp');
    expect(r.notebookDropped).toBeUndefined();
    expect(challengesOf(await other.notebook('imp'))).toEqual([challenge]);
    expect(await other.check('imp', 'ch-1')).toBeNull();
    expect(other.shelfCount()).toBe(0); // a check writes nothing
    const started = await other.ask({ type: 'challengeStart', requestId: other.id(), dishId: 'imp', challengeId: 'ch-1', newDishId: 'turn' });
    if (started.type !== 'challengeStarted') throw new Error(JSON.stringify(started));
    expect(started.turn).toMatchObject({ startTick: 40, horizonTicks: 1800, baseline: { checksum: challenge.baseline.checksum }, challenge: { id: 'ch-1', allowedTools: ['feed', 'lid'], commandBudget: 5 } });
    expect(other.shelfCount()).toBe(1);

    // A third device: once the imported dish changed, it cannot start (and says why).
    const third = new Device();
    await third.import(text, 'imp');
    third.host.handle({ type: 'setSpeed', dishId: 'imp', speed: 4 });
    third.now += 300;
    third.host.pump();
    third.host.handle({ type: 'setSpeed', dishId: 'imp', speed: 0 });
    expect(third.host.world('imp')!.tick).toBeGreaterThan(40);
    expect(await third.check('imp', 'ch-1')).toBe(CHALLENGE_REFUSALS.changed);
    expect(CHALLENGE_REFUSALS.changed).toBe('This dish has changed since the challenge was made. Import the challenge file again to start it.');
    // The device that made it still starts it from the dish that ran on (its shelf holds the baseline).
  });

  it('the device that made it starts it from the shelf, even after the dish ran on', async () => {
    const { device, challenge } = await exportedChallenge();
    expect(device.host.world('d1')!.tick).toBeGreaterThan(40);
    expect(await device.check('d1', challenge.id)).toBeNull();
  });

  it('"Export without names or notes" leaves challenge names out', async () => {
    const { device } = await exportedChallenge();
    const r = await device.ask({ type: 'exportDish', requestId: device.id(), dishId: 'd1', strip: true });
    if (r.type !== 'exported') throw new Error(JSON.stringify(r));
    const loaded = await loadSaveFile(r.text);
    expect(challengesOf(loaded.notebook).map((c) => c.name)).toEqual(['Shared challenge']);
    expect(withoutTurnNotes({ challenges: [] })).toEqual({ challenges: [] });
  });

  it('malformed challenges drop the notebook with notebookDropped; the world loads unchanged', async () => {
    const { challenge, text } = await exportedChallenge();
    const good = await loadSaveFile(text);
    const hash = stateHash(good.world);
    const cases: [string, unknown[]][] = [
      ['an unknown species', [{ ...challenge, objective: { type: 'keepSpeciesAlive', params: { species: 'ZZZ' }, durationSeconds: 30 }, region: { kind: 'dish' } }]],
      ['a custom type', [{ ...challenge, objective: { type: 'custom', params: {} } }]],
      ['a budget of 0', [{ ...challenge, commandBudget: 0 }]],
      ['a budget of 100', [{ ...challenge, commandBudget: 100 }]],
      ['a fractional budget', [{ ...challenge, commandBudget: 2.5 }]],
      ['an unknown tool group', [{ ...challenge, allowedTools: ['feed', 'teleport'] }]],
      ['a region on a non-range goal', [{ ...challenge, objective: { type: 'biomassThreshold', params: { threshold: 5 } } }]],
      ['an unknown region', [{ ...challenge, region: { kind: 'quarter', id: 'middle' } }]],
      ['a free-form mask', [{ ...challenge, region: { kind: 'mask', cells: [1, 2, 3] } }]],
      ['a script field', [{ ...challenge, script: 'alert(1)' }]],
      ['an expression for a number', [{ ...challenge, objective: { ...challenge.objective, params: { field: 'sugar', min: '0', max: 'x*2' } } }]],
      ['a gate goal (no gate in this dish)', [{ ...challenge, objective: { type: 'transferAcrossGate', params: { gate: 'S01', field: 'sugar', threshold: 1 } }, region: { kind: 'dish' } }]],
      ['a duration longer than the turn', [{ ...challenge, horizonSeconds: 60, objective: { ...challenge.objective, durationSeconds: 120 } }]],
      ['a bad baseline checksum', [{ ...challenge, baseline: { ...challenge.baseline, checksum: 'abc' } }]],
      ['two records with one id', [challenge, challenge]],
      ['21 records', Array.from({ length: 21 }, (_, k) => ({ ...challenge, id: `ch-${k + 1}` }))],
    ];
    for (const [what, list] of cases) {
      const bad = await withChallenges(text, list);
      const r = await loadSaveFile(bad);
      expect(r.notebookDropped, what).toBe(NOTEBOOK_DROPPED_TEXT);
      expect(challengesOf(r.notebook), what).toEqual([]);
      expect(stateHash(r.world), what).toBe(hash);
      expect(r.file.checksum, what).toBe(challenge.baseline.checksum);
    }
    // A non-finite threshold (JSON cannot carry one, but a file can say 1e999): the kind check refuses it.
    const inf = { ...challenge, objective: { type: 'biomassThreshold', params: { threshold: Number.POSITIVE_INFINITY } }, region: { kind: 'dish' } };
    expect(challengesProblem([inf])).toMatch(/finite/);
    const infText = (await withChallenges(text, [{ ...inf, objective: { type: 'biomassThreshold', params: { threshold: 7 } } }])).replace('"threshold":7', '"threshold":1e999');
    const infLoad = await loadSaveFile(infText);
    expect(infLoad.notebookDropped).toBe(NOTEBOOK_DROPPED_TEXT);
    expect(stateHash(infLoad.world)).toBe(hash);
    // The checks name the problem (before the checksum is read).
    const raw = JSON.parse(await withChallenges(text, [{ ...challenge, commandBudget: 100 }])) as { notebook: unknown; state: { worldId: string } };
    expect(await notebookProblem(raw.notebook, raw.state.worldId)).toMatch(/budget/);
    // The 20-record limit holds exactly.
    expect(challengesProblem(Array.from({ length: 20 }, (_, k) => ({ ...challenge, id: `ch-${k + 1}` })))).toBeNull();
  });

  it('a failed import never touches the open dish', async () => {
    const { device, text } = await exportedChallenge();
    const before = stateHash(device.host.world('d1')!);
    const r = await device.ask({ type: 'importDish', requestId: device.id(), text: text.replace('"tick":', '"tick":"x",'), newDishId: 'bad' });
    expect(r.type).toBe('error');
    expect(device.host.world('bad')).toBeNull();
    expect(stateHash(device.host.world('d1')!)).toBe(before);
  });
});
