/**
 * Duplicate dish (DishHost.duplicateDish): the copy is an independent dish. Its worker-only state must
 * not be the original's by reference. In particular the P3.8 relationship watcher (D-0039; "relationships
 * first seen while this dish is played", never saved): the copy starts with a fresh watcher, as a dish
 * rebuilt from its serialized world after a reload does, so a relationship first seen in the copy is
 * never written into the original's record (the Field Guide's "Seen in your dishes" would otherwise
 * credit the original dish with what only the copy showed), and the original's later sightings never
 * reach the copy.
 */
import { describe, expect, it } from 'vitest';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, RelationshipSeen, Speed } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

class Driver {
  now = 0;
  readonly out: FromWorker[] = [];
  readonly host = new DishHost(registry(), (m) => this.out.push(m), { now: () => this.now });
  private req = 0;

  create(dishId: string): void {
    const requestId = ++this.req;
    this.host.handle({ type: 'create', requestId, dishId, source: { kind: 'recipe', recipeId: 'ONE_HOST_V1' } });
    if (!this.out.some((m) => m.type === 'ready' && m.requestId === requestId)) throw new Error(`no dish ${dishId}`);
  }

  duplicate(dishId: string, newDishId: string): void {
    const requestId = ++this.req;
    this.host.handle({ type: 'duplicate', requestId, dishId, newDishId });
    if (!this.out.some((m) => m.type === 'ready' && m.requestId === requestId)) throw new Error(`no copy ${newDishId}`);
  }

  /** Make `dishId` the active dish and run it at 4× until it reaches `target`, then pause it. */
  runTo(dishId: string, target: number, speed: Speed = 4): void {
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

  relationships(dishId: string): RelationshipSeen[] {
    const requestId = ++this.req;
    this.host.handle({ type: 'relationships', requestId, dishId });
    const r = this.out.find((m) => m.type === 'relationships' && m.requestId === requestId);
    if (r?.type !== 'relationships') throw new Error('no relationships reply');
    return r.entries.map((e) => ({ ...e }));
  }
}

const ids = (es: readonly RelationshipSeen[]) => es.map((e) => e.relationshipId);

describe('Duplicate dish: the copy shares no relationship record with the original', () => {
  it('a relationship first seen in the copy is not written into the original, nor the reverse', () => {
    const h = new Driver();
    h.create('orig');
    // One tick: the original's watcher exists (stepDish creates it lazily) and has taken its baseline.
    h.runTo('orig', 1);
    const before = h.relationships('orig');
    h.duplicate('orig', 'copy');
    // The copy starts with a record of its own (nothing seen yet while it was played).
    expect(h.relationships('copy')).toEqual([]);

    h.runTo('copy', 300);
    const inCopy = h.relationships('copy');
    // The copy recorded something the original had not seen (else this test would prove nothing): in
    // One Host the first lysis comes about 20 s in ...
    expect(ids(before)).not.toContain('bursts:V01:B01');
    expect(ids(inCopy)).toContain('bursts:V01:B01');
    // ... and the original's record is exactly what it was before the copy ran.
    expect(h.relationships('orig')).toEqual(before);

    // The reverse: the original's later sightings never reach the copy's record.
    h.runTo('orig', 300);
    expect(ids(h.relationships('orig'))).toContain('bursts:V01:B01');
    expect(h.relationships('copy')).toEqual(inCopy);
  }, 120_000);
});
