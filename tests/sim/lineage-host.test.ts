/**
 * P2.3 through the worker host (ARCH §7): the lineage query and the trait/lineage view are read-only
 * (the state hash never moves), snapshots carry the branch count and per-organism marks in `ents`
 * order, names/pins/specimens travel the ordinary command path, and a specimen spawn is undoable like
 * any other addition.
 */
import { describe, expect, it } from 'vitest';
import { realizeRecipe } from '../../src/sim/recipes';
import { serializeWorld } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, SnapshotMsg, ToWorker } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

function setup() {
  const reg = registry();
  const w = realizeRecipe(reg, 'FIRST_DISH_V1', { seed: 101, worldId: 'lineage-host', transform: (r) => ({ ...r, mutationPreset: 'accelerated' }) });
  run(w, 1500);
  expect(w.branches.established).toBeGreaterThanOrEqual(1);
  const out: FromWorker[] = [];
  const host = new DishHost(reg, (m) => out.push(m), { now: () => 0 });
  let req = 0;
  const send = (m: ToWorker) => host.handle(m);
  const ask = <T extends FromWorker['type']>(type: T, build: (requestId: number) => ToWorker): Extract<FromWorker, { type: T }> => {
    const requestId = ++req;
    send(build(requestId));
    const reply = out.find((m) => m.type === type && 'requestId' in m && m.requestId === requestId);
    if (!reply) throw new Error(`no ${type} reply: ${JSON.stringify(out.filter((m) => m.type === 'error'))}`);
    return reply as Extract<FromWorker, { type: T }>;
  };
  ask('ready', (requestId) => ({ type: 'create', requestId, dishId: 'd', source: { kind: 'state', state: serializeWorld(w) } }));
  const hash = () => ask('hash', (requestId) => ({ type: 'hash', requestId, dishId: 'd' })).hash;
  const lastSnapshot = () => [...out].reverse().find((m): m is SnapshotMsg => m.type === 'snapshot')!;
  return { out, send, ask, hash, lastSnapshot, host };
}

describe('P2.3 lineage through the worker host', () => {
  it('queries and views are read-only; snapshots carry the branch count and marks in ents order', () => {
    const { send, ask, hash, lastSnapshot } = setup();
    const h0 = hash();
    const ans = ask('lineage', (requestId) => ({ type: 'lineage', requestId, dishId: 'd', branch: 0, birthId: null })).lineage;
    expect(ans.branches.length).toBeGreaterThanOrEqual(1);
    expect(ans.selected?.branch).toBe(0);
    expect(lastSnapshot().branchCount).toBe(ans.branches.length);
    expect(lastSnapshot().lineage).toBeUndefined();
    send({ type: 'lineageView', dishId: 'd', view: { locus: 1, branch: 0 } });
    const s = lastSnapshot();
    expect(s.lineage).toBeTruthy();
    expect(s.lineage!.locus).toBe(1);
    expect(s.lineage!.branch).toBe(0);
    expect(s.lineage!.marks.length).toBeGreaterThanOrEqual(s.count);
    expect(s.lineage!.bandCounts.reduce((a, b) => a + b, 0) + s.lineage!.inactive).toBe(s.count);
    expect(s.lineage!.members).toBe(ans.branches[0]!.living);
    // Off again: no marks.
    send({ type: 'lineageView', dishId: 'd', view: null });
    expect(lastSnapshot().lineage).toBeUndefined();
    expect(hash()).toBe(h0);
  });

  it('rename, pin and save travel the command path; a specimen spawn is an undoable addition', () => {
    const { ask, hash } = setup();
    const cmd = (commandId: string, payload: Extract<ToWorker, { type: 'command' }>['payload'], undoable: boolean) =>
      ask('ack', (requestId) => ({ type: 'command', requestId, dishId: 'd', commandId, payload, undoable }));
    expect(cmd('r', { kind: 'lineage', op: 'rename', branch: 0, name: 'Quiet savers' }, false).result).toMatchObject({ accepted: 1 });
    expect(cmd('p', { kind: 'lineage', op: 'pin', branch: 0, pinned: true }, false).result).toMatchObject({ accepted: 1 });
    expect(cmd('s', { kind: 'lineage', op: 'saveSpecimen', from: 'branch', id: 0 }, false).result).toMatchObject({ accepted: 1 });
    let ans = ask('lineage', (requestId) => ({ type: 'lineage', requestId, dishId: 'd', branch: null, birthId: null })).lineage;
    const row = ans.branches[0]!;
    expect(row.name).toBe(`Quiet savers · ${row.shortId}`);
    expect(row.pinned).toBe(true);
    expect(ans.specimens).toHaveLength(1);
    const before = hash();
    const aliveBefore = ans.species.reduce((a, s) => a + s.living, 0);
    expect(cmd('sp', { kind: 'lineage', op: 'spawnSpecimen', specimen: 1, x: 40.5, y: 64.5, radius: 3, count: 5 }, true).result).toMatchObject({ accepted: 5, rejected: 0 });
    ans = ask('lineage', (requestId) => ({ type: 'lineage', requestId, dishId: 'd', branch: null, birthId: null })).lineage;
    expect(ans.species.reduce((a, s) => a + s.living, 0)).toBe(aliveBefore + 5);
    expect(ans.specimens[0]!.spawned).toBe(5);
    // Spawned organisms start their own line: the branch's own count is unchanged.
    expect(ans.branches[0]!.alive).toBe(row.alive);
    // Undo rewinds the spawn only (names, pin and specimen were saved before it).
    const undo = ask('ack', (requestId) => ({ type: 'undo', requestId, dishId: 'd' }));
    expect(undo.error).toBeUndefined();
    expect(hash()).toBe(before);
  });
});
