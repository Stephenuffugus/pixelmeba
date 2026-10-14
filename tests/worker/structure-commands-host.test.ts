/**
 * Phase 5 wave 10 structure-commands through the worker host (DishHost 'command' path; D-0117):
 * - on a shipped dish a placeEdges (and every other new kind) is refused "not in this dish", leaves no undo
 *   point and changes nothing but the command log and its sequence number (the same stateHash as a twin
 *   given a refused v1.0 command: any refused command takes a sequence number);
 * - challenge budgets: placeDevice counts as a 'habitat' action, setDevice, setLightMode and setDrying are
 *   free ('configure and inspect are free', D07); the light mode and drying belong to the 'lid' group.
 */
import { describe, expect, it } from 'vitest';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { cellIndex } from '../../src/sim/grid';
import { challengeUsed, countsAgainstBudget, toolGroupOf } from '../../src/worker/challenge';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { barrierRegistry, clearWater, preFlipRegistry, registry } from '../helpers/world';

const ISO = '2026-10-14T00:00:00.000Z';
const NOWHERE: CommandPayload = { kind: 'deposit', materialId: 'SUGAR', points: [[0, 0]], radius: 0, dose: 0.5 };
const NEW_KINDS: CommandPayload[] = [
  { kind: 'placeEdges', structure: 'S01', edges: [[cellIndex(60, 60), 'R']] },
  { kind: 'placeDevice', structure: 'S05', cell: cellIndex(60, 60) },
  { kind: 'removeStructures', ids: [1] },
  { kind: 'moveDevice', id: 1, cell: cellIndex(61, 60) },
  { kind: 'setDevice', id: 1, on: true },
  { kind: 'wetBrush', points: [[60.5, 60.5]], radius: 3 },
  { kind: 'setLightMode', mode: 'cycle' },
  { kind: 'setDrying', drying: true },
];

class Driver {
  readonly out: FromWorker[] = [];
  readonly host: DishHost;
  constructor(reg: ContentRegistry = registry()) {
    this.host = new DishHost(reg, (m) => this.out.push(m), { now: () => 0, iso: () => ISO }, new SaveStore(new MemoryBackend()));
  }
  private req = 0;
  send<T extends FromWorker['type']>(msg: ToWorker, type: T): Extract<FromWorker, { type: T }> {
    this.host.handle(msg);
    const id = (msg as { requestId: number }).requestId;
    const r = this.out.find((m) => m.type === type && (m as { requestId?: number }).requestId === id);
    if (!r) throw new Error(`no ${type} for ${id}`);
    return r as Extract<FromWorker, { type: T }>;
  }
  create(dishId: string) {
    this.send({ type: 'create', requestId: ++this.req, dishId, source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' }, name: 'Garden' }, 'ready');
  }
  command(dishId: string, payload: CommandPayload) {
    return this.send({ type: 'command', requestId: ++this.req, dishId, commandId: `c${this.req}`, payload, undoable: true }, 'ack');
  }
  undo(dishId: string) {
    return this.send({ type: 'undo', requestId: ++this.req, dishId }, 'ack');
  }
  hash(dishId: string): string {
    return this.send({ type: 'hash', requestId: ++this.req, dishId }, 'hash').hash;
  }
}

describe('structure commands through the host', () => {
  it('a v1.0 (pre-flip) dish refuses every new kind "not in this dish", with no undo point and nothing changed', () => {
    const h = new Driver(preFlipRegistry());
    h.create('d1');
    h.create('twin');
    const ack = h.command('d1', NEW_KINDS[0]!);
    expect(ack.error).toBeUndefined();
    expect(ack.result).toEqual({ accepted: 0, rejected: 0, note: 'S01 is not in this dish' });
    expect(h.undo('d1').error).toBe('nothing to undo');
    for (const p of NEW_KINDS.slice(1)) {
      const r = h.command('d1', p);
      expect(r.result!.accepted, p.kind).toBe(0);
      expect(r.result!.note!.endsWith('not in this dish'), `${p.kind}: ${r.result!.note}`).toBe(true);
    }
    expect(h.undo('d1').error).toBe('nothing to undo');
    for (let k = 0; k < NEW_KINDS.length; k++) expect(h.command('twin', NOWHERE).result!.accepted).toBe(0);
    const w = h.host.world('d1')!;
    expect(w.edges).toEqual([]);
    expect(w.devices).toEqual([]);
    expect(w.counters.nextDeviceId).toBe(1);
    expect(w.settings.lightMode).toBe('fixed');
    expect(w.settings.drying).toBe(false);
    expect(w.climate).toEqual({ warmth: null, moisture: null });
    expect(h.hash('d1')).toBe(h.hash('twin'));
  });
});

describe('challenge groups and budgets', () => {
  it('maps building and the wetting brush to habitat, light and drying to lid; settings are free', () => {
    for (const p of NEW_KINDS) {
      expect(toolGroupOf(p), p.kind).toBe(p.kind === 'setLightMode' || p.kind === 'setDrying' ? 'lid' : 'habitat');
      expect(countsAgainstBudget(p), p.kind).toBe(!['setDevice', 'setLightMode', 'setDrying'].includes(p.kind));
    }
  });

  it('a challenge turn’s budget counts an accepted placeDevice but not setDevice, setLightMode or setDrying', () => {
    const w = clearWater({}, barrierRegistry());
    const start = { startSeq: w.commands.nextSeq };
    const placed = applyNow(w, 'heater', { kind: 'placeDevice', structure: 'S09', cell: cellIndex(60, 60) }).result!;
    expect(placed.accepted).toBe(1);
    expect(challengeUsed(w, start)).toBe(1);
    expect(applyNow(w, 'on', { kind: 'setDevice', id: placed.ids![0]!, on: true }).result!.accepted).toBe(1);
    expect(applyNow(w, 'cycle', { kind: 'setLightMode', mode: 'cycle' }).result!.accepted).toBe(1);
    expect(applyNow(w, 'dry', { kind: 'setDrying', drying: true }).result!.accepted).toBe(1);
    expect(challengeUsed(w, start)).toBe(1);
    expect(applyNow(w, 'wall', { kind: 'placeEdges', structure: 'S01', edges: [[cellIndex(62, 60), 'R']] }).result!.accepted).toBe(1);
    expect(applyNow(w, 'wet', { kind: 'wetBrush', points: [[60.5, 60.5]], radius: 1 }).result!.accepted).toBe(0); // water only: free
    expect(challengeUsed(w, start)).toBe(2);
  });
});
