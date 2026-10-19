/**
 * P5.6 player steps on a single-arm card's dish (CT §10.3 E205, E207, E211; D-0131), through the real
 * DishHost: 'inspectGlow' is noted only for a glowing-rules organism of the followed species; 'toggleShutter'
 * is noted on an accepted open toggle of the shutter the recipe placed and the card keeps observing (its own
 * step is not a change to its dish), while any other accepted command still ends the card as 'changed';
 * 'inspectMoisture' is noted on a cell selection inside a region the card measures and not outside.
 */
import { describe, expect, it } from 'vitest';
import { cellIndex } from '../../src/sim/grid';
import { inspectShowsGlow, inspectShowsMoisture, isCardShutterToggle, type PlayerSteps } from '../../src/sim/experiments';
import { DishHost } from '../../src/worker/host';
import type { FromWorker } from '../../src/worker/protocol';
import { clearWater, place, registry } from '../helpers/world';

function start(cardId: string) {
  let now = 0;
  let req = 0;
  const out: FromWorker[] = [];
  const host = new DishHost(registry(), (m) => out.push(m), { now: () => now, iso: () => '2026-10-18T00:00:00.000Z' });
  host.handle({ type: 'experimentStart', requestId: ++req, cardId, newDishId: 'card', compare: null });
  expect(out.find((m) => 'requestId' in m && m.requestId === 1)?.type).toBe('experimentStarted');
  const world = () => host.world('card')!;
  // Worker state the card keeps (never simulation state): read for the test only.
  const steps = () => (host as unknown as { dishes: Record<string, { experiment?: { steps: PlayerSteps; ended: boolean } }> }).dishes.card!.experiment!;
  return {
    host,
    out,
    world,
    steps,
    command(payload: Parameters<typeof isCardShutterToggle>[1] & object) {
      const requestId = ++req;
      host.handle({ type: 'command', requestId, dishId: 'card', commandId: `c${requestId}`, payload: payload as never, undoable: true });
      return out.find((m) => 'requestId' in m && m.requestId === requestId) as Extract<FromWorker, { type: 'ack' }>;
    },
    run(ticks: number) {
      host.handle({ type: 'setSpeed', dishId: 'card', speed: 4 });
      const until = world().tick + ticks;
      while (world().tick < until) {
        now += 25;
        host.pump();
      }
      host.handle({ type: 'setSpeed', dishId: 'card', speed: 0 });
    },
    select(selection: { kind: 'entity'; birthId: number } | { kind: 'cell'; cell: number } | null) {
      host.handle({ type: 'view', dishId: 'card', overlay: null, selection });
    },
  };
}
const done = (s: PlayerSteps, step: string) => s.status().find((x) => x.step === step)?.done;

describe('P5.6 player steps', () => {
  it('inspectShowsGlow: only a living organism with glow rules of a followed species', () => {
    const w = clearWater();
    const lantern = place(w, 'B09', 60.5, 64.5);
    const sprinter = place(w, 'B01', 62.5, 64.5);
    const c = w.ents.cols;
    expect(inspectShowsGlow(w, c.birthId[lantern]!, ['B09'])).toBe(true);
    expect(inspectShowsGlow(w, c.birthId[lantern]!, [])).toBe(true);
    expect(inspectShowsGlow(w, c.birthId[lantern]!, ['B01'])).toBe(false);
    expect(inspectShowsGlow(w, c.birthId[sprinter]!, [])).toBe(false); // no glow rules
    expect(inspectShowsGlow(w, 999_999, [])).toBe(false);
  });

  it('inspectGlow (EXP_205): a cell or an unknown organism is not the step; a Lantern is', () => {
    const h = start('EXP_205');
    h.select({ kind: 'cell', cell: cellIndex(64, 64) });
    h.select({ kind: 'entity', birthId: 999_999 });
    expect(done(h.steps().steps, 'inspectGlow')).toBe(false);
    const w = h.world();
    const c = w.ents.cols;
    let lantern = -1;
    for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1) lantern = c.birthId[i]!;
    h.select({ kind: 'entity', birthId: lantern });
    expect(done(h.steps().steps, 'inspectGlow')).toBe(true);
  });

  it('toggleShutter (EXP_207): the recipe’s shutter toggle is noted and the card keeps running; a deposit still ends it as changed', () => {
    const h = start('EXP_207');
    const shutters = h.world().edges.filter((e) => e.kind === 'S03');
    expect(shutters.map((e) => e.open)).toEqual([true, true, true, true]);
    h.run(20);
    const ack = h.command({ kind: 'setDevice', id: shutters[0]!.id, open: false });
    expect(ack.result?.accepted).toBe(1);
    expect(h.world().edges.find((e) => e.id === shutters[0]!.id)!.open).toBe(false);
    expect(done(h.steps().steps, 'toggleShutter')).toBe(true);
    expect(h.steps().ended).toBe(false);
    expect(h.out.some((m) => m.type === 'experimentEnded')).toBe(false);
    // The same toggle sent again changes nothing (accepted 0): no step, no end.
    expect(h.command({ kind: 'setDevice', id: shutters[0]!.id, open: false }).result?.accepted).toBe(0);
    expect(h.steps().ended).toBe(false);
    // The card keeps observing: its gate is reached and the stamp is posted (its one step was taken).
    h.run(500);
    expect(h.out.some((m) => m.type === 'experimentStamp')).toBe(true);
    // Any other accepted command still ends a card (a fresh start, since this one is complete).
    const g = start('EXP_207');
    const dep = g.command({ kind: 'deposit', materialId: 'SUGAR', points: [[40.5, 64.5]], radius: 2, dose: 0.1 } as never);
    expect(dep.result?.accepted).toBeGreaterThan(0);
    expect(g.steps().ended).toBe(true);
    expect(g.out.find((m) => m.type === 'experimentEnded')).toMatchObject({ reason: 'changed' });
  });

  it('isCardShutterToggle: only an S03 the recipe placed (id below the first player id)', () => {
    const h = start('EXP_207');
    const w = h.world();
    const s03 = w.edges.find((e) => e.kind === 'S03')!;
    const first = w.counters.nextDeviceId;
    expect(isCardShutterToggle(w, { kind: 'setDevice', id: s03.id, open: false }, first)).toBe(true);
    expect(isCardShutterToggle(w, { kind: 'setDevice', id: s03.id, open: false }, s03.id)).toBe(false); // as if a player placed it
    expect(isCardShutterToggle(w, { kind: 'setDevice', id: s03.id }, first)).toBe(false); // no open setting
    expect(isCardShutterToggle(w, { kind: 'deposit', id: s03.id, open: false }, first)).toBe(false);
    expect(isCardShutterToggle(w, { kind: 'setDevice', id: 9999, open: false }, first)).toBe(false);
  });

  it('inspectMoisture (EXP_211): a cell inside a measured region is the step, a cell outside is not', () => {
    const h = start('EXP_211');
    const w = h.world();
    const regions = w.content.habitat.regions!.filter((r) => r.id === 'ROOF' || r.id === 'OPEN_GEL');
    expect(inspectShowsMoisture(w, { kind: 'cell', cell: cellIndex(28, 64) }, regions)).toBe(false); // the channel is not measured
    h.select({ kind: 'cell', cell: cellIndex(28, 64) });
    h.select({ kind: 'cell', cell: cellIndex(10, 64) });
    expect(done(h.steps().steps, 'inspectMoisture')).toBe(false);
    h.select({ kind: 'cell', cell: cellIndex(88, 64) });
    expect(done(h.steps().steps, 'inspectMoisture')).toBe(true);
  });
});
