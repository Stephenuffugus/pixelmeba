/**
 * EXP_104 in the app (P3.9; CT §10.1 "both species inspected with different O2 limitations"): the worker
 * host notes the inspector's oxygen reading for each organism the player taps (host.ts experimentSteps
 * → inspectedOxygenReading → PlayerSteps.noteOxygenLimit), and the stamp waits for it.
 *
 * Revision 2 (D-0068) reaches its gate at 1 s, so this drives the real card: at 2 s the founders' feast
 * has emptied the patch's oxygen (Sprinters read OXYGEN_LIMITED) and Dusks read SUIT_OXYGEN_HIGH.
 */
import { describe, expect, it } from 'vitest';
import { R } from '../../src/sim/reasons';
import { DishHost } from '../../src/worker/host';
import type { FromWorker } from '../../src/worker/protocol';
import { registry } from './helpers';

describe('EXP_104 player step through the worker host', () => {
  it('the stamp waits until a Dusk and a Sprinter were tapped with different oxygen readings', () => {
    let now = 0;
    const out: FromWorker[] = [];
    const host = new DishHost(registry(), (m) => out.push(m), {
      now: () => now,
      iso: () => '2026-10-10T00:00:00.000Z',
    });
    host.handle({
      type: 'experimentStart',
      requestId: 1,
      cardId: 'EXP_104',
      newDishId: 'host',
      compare: null,
    });
    expect(
      out.find((m) => 'requestId' in m && m.requestId === 1),
      JSON.stringify(out.slice(-2)),
    ).toEqual(expect.objectContaining({ type: 'experimentStarted' }));
    host.handle({ type: 'setSpeed', dishId: 'host', speed: 4 });
    const w = () => host.world('host')!;
    while (w().tick < 20) {
      now += 25;
      host.pump();
    }
    host.handle({ type: 'setSpeed', dishId: 'host', speed: 0 });
    const stamps = () => out.filter((m) => m.type === 'experimentStamp');
    expect(stamps()).toHaveLength(0);
    expect(out.filter((m) => m.type === 'experimentWaiting').at(-1)).toEqual(
      expect.objectContaining({ cardId: 'EXP_104', missing: ['inspectOxygenLimits'] }),
    );

    const c = w().ents.cols;
    const first = (id: string): number => {
      for (let i = 0; i < w().ents.highWater; i++)
        if (c.alive[i] === 1 && w().species[c.species[i]!]!.id === id) return i;
      throw new Error(`no living ${id}`);
    };
    const view = (slot: number) =>
      host.handle({
        type: 'view',
        dishId: 'host',
        overlay: null,
        selection: { kind: 'entity', birthId: c.birthId[slot]! },
      });
    const dusk = first('B03');
    const sprinter = first('B01');
    expect(c.limitCode[sprinter]).toBe(R.OXYGEN_LIMITED);
    // Only a Dusk (SUIT_OXYGEN_HIGH), seen twice: not yet the step.
    view(dusk);
    view(dusk);
    expect(stamps()).toHaveLength(0);
    // A Sprinter short of oxygen: both species seen with different readings.
    view(sprinter);
    expect(stamps()).toHaveLength(1);
    expect((stamps()[0] as Extract<FromWorker, { type: 'experimentStamp' }>).stamp.stamp.experimentId).toBe(
      'EXP_104',
    );
  }, 120_000);
});
