/**
 * EXP_104 in the app (P3.9; CT §10.1 "both species inspected with different O2 limitations"): the worker
 * host notes the inspector's oxygen reading for each organism the player taps (host.ts experimentSteps
 * → inspectedOxygenReading → PlayerSteps.noteOxygenLimit), and the stamp waits for it.
 *
 * The shipped recipe never reaches its gate (no Sprinter is ever OXYGEN_LIMITED; see
 * hidden-neighborhood.test.ts), so this drives the host's wiring with a test-only card whose gate is
 * `alive.B01 > 0 and alive.B03 > 0` (held at once) and, on the paused dish, one Sprinter's recorded limit set to
 * OXYGEN_LIMITED: the reading the inspector would show if oxygen ran short. Dusks show their real
 * SUIT_OXYGEN_HIGH reading on the shipped Water Garden.
 */
import { describe, expect, it } from 'vitest';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { R } from '../../src/sim/reasons';
import { DishHost } from '../../src/worker/host';
import type { FromWorker } from '../../src/worker/protocol';
import { registry } from './helpers';

function heldGateRegistry(): ContentRegistry {
  const reg = registry();
  const def = reg.experiments.EXP_104!;
  return {
    ...reg,
    experiments: {
      ...reg.experiments,
      EXP_104: {
        ...def,
        gate: {
          type: 'custom',
          params: {
            all: [
              { measure: 'alive.B01', arm: 'A', op: 'gt', value: 0, label: 'Sprinters are alive' },
              { measure: 'alive.B03', arm: 'A', op: 'gt', value: 0, label: 'Dusks are alive' },
            ],
          },
        },
      },
    },
  };
}

describe('EXP_104 player step through the worker host', () => {
  it('the stamp waits until a Dusk and a Sprinter were tapped with different oxygen readings', () => {
    let now = 0;
    const out: FromWorker[] = [];
    const host = new DishHost(heldGateRegistry(), (m) => out.push(m), {
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
    // A Dusk (real SUIT_OXYGEN_HIGH) and a Sprinter with plenty of oxygen (no oxygen reading): not yet the step.
    view(dusk);
    view(sprinter);
    expect(stamps()).toHaveLength(0);
    // The same Sprinter, now showing too little oxygen: both species seen with different readings.
    c.limitCode[sprinter] = R.OXYGEN_LIMITED;
    view(sprinter);
    expect(stamps()).toHaveLength(1);
    expect((stamps()[0] as Extract<FromWorker, { type: 'experimentStamp' }>).stamp.stamp.experimentId).toBe(
      'EXP_104',
    );
  }, 120_000);
});
