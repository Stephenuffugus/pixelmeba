/**
 * Wave B fix round 2 (fix1-experiments-verify MINOR, items 5 and 6): Food trail's player step "the
 * inspector identifies food use" (CT §10.1) is noted only while the inspector is actually open on that
 * organism. The UI's own state module runs against the real worker host (DishHost, in process, behind a
 * stand-in Worker), exactly as the app wires them: the worker is told about a selection only while the
 * inspector sheet shows it, so a Sprinter tapped while idle does not earn the step later, off screen,
 * after the Look button closed the sheet. The dish's notice names the step the held stamp waits for.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as UiState from '../../src/ui/state';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { realizeRecipe } from '../../src/sim/recipes';
import { run } from '../../src/sim/tick';
import { registry } from './helpers';

type Msg = ToWorker & { protocolVersion?: number };

let host: DishHost;
const out: FromWorker[] = [];
const sent: Msg[] = [];

class InProcessWorker {
  onmessage: ((ev: { data: FromWorker }) => void) | null = null;
  constructor() {
    host = new DishHost(
      registry(),
      (m) => {
        out.push(m);
        queueMicrotask(() => this.onmessage?.({ data: m }));
      },
      { now: () => 0 },
    );
  }
  postMessage(msg: Msg): void {
    sent.push(msg);
    host.handle(msg);
  }
  terminate(): void {}
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

let ui: typeof UiState;

beforeAll(async () => {
  vi.stubGlobal('Worker', InProcessWorker);
  ui = await import('../../src/ui/state');
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const stamps = () => out.filter((m) => m.type === 'experimentStamp');

describe('Food trail: the inspector step needs the inspector open on that organism', () => {
  it('a Sprinter tapped while idle, whose inspector was closed, earns nothing when it eats later; open again, it does', async () => {
    // The Sprinters that are eating at 15 s, found on the same recipe and seed run headless (the card
    // only observes, so the app's dish is this world tick for tick).
    const T = 150;
    const plain = realizeRecipe(registry(), 'FOOD_TRAIL_V1', { seed: 101 });
    const atStart = new Set<number>();
    for (let i = 0; i < plain.ents.highWater; i++) if (plain.ents.cols.alive[i] === 1) atStart.add(plain.ents.cols.birthId[i]!);
    run(plain, T);
    const b01 = plain.species.findIndex((s) => s.id === 'B01');
    const c = plain.ents.cols;
    let sprinter = -1;
    for (let i = 0; i < plain.ents.highWater && sprinter < 0; i++)
      if (c.alive[i] === 1 && c.species[i] === b01 && c.intakeLastSecond[i]! > 0 && atStart.has(c.birthId[i]!)) sprinter = c.birthId[i]!;
    expect(sprinter).toBeGreaterThan(0);

    await ui.loadExperimentCards();
    await ui.startExperiment('EXP_101');
    await flush();
    const dishId = ui.dishInfo.value!.dishId;
    expect(ui.dishInfo.value!.recipeId).toBe('FOOD_TRAIL_V1');

    // Tap the Sprinter at 0 s (it has not eaten yet): the inspector opens on it.
    ui.select({ kind: 'entity', birthId: sprinter });
    await flush();
    expect(ui.sheet.value).toBe('inspect');
    const lastView = () => sent.filter((m): m is Extract<Msg, { type: 'view' }> => m.type === 'view').at(-1)!;
    expect(lastView().selection).toEqual({ kind: 'entity', birthId: sprinter });
    // Look closes the inspector (the organism stays highlighted on the dish): the worker inspects nothing.
    ui.setTool({ kind: 'look' });
    ui.sheet.value = 'none';
    await flush();
    expect(ui.selection.value).toEqual({ kind: 'entity', birthId: sprinter });
    expect(lastView().selection).toBeNull();

    // Past the card's 7 s gate, to 15 s, where that Sprinter is eating.
    for (let k = 0; k < T; k++) ui.stepOnce();
    await flush();
    expect(host.world(dishId)!.tick).toBe(T);
    const w = host.world(dishId)!;
    let slot = -1;
    for (let i = 0; i < w.ents.highWater; i++) if (w.ents.cols.alive[i] === 1 && w.ents.cols.birthId[i] === sprinter) slot = i;
    expect(w.ents.cols.intakeLastSecond[slot]!).toBeGreaterThan(0);
    // It ate while the inspector was closed: not the step, so no stamp; the dish's notice names the step.
    expect(stamps()).toHaveLength(0);
    expect(ui.experimentWaiting.value).toMatchObject({ dishId, cardId: 'EXP_101' });
    expect(ui.experimentWaiting.value!.text).toContain('every part held at 7 s');
    expect(ui.experimentWaiting.value!.text).toContain('Tap a Sprinter while it is eating');

    // The inspector open on it again (History's "Back to …" does exactly this) while it eats: the step.
    ui.sheet.value = 'inspect';
    await flush();
    expect(lastView().selection).toEqual({ kind: 'entity', birthId: sprinter });
    expect(stamps()).toHaveLength(1);
    // The stamp arrived: the notice goes.
    expect(ui.experimentWaiting.value).toBeNull();
  }, 120_000);
});
