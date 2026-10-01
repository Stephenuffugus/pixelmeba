/**
 * D-0034 label ruling (D-0033 fix round 3, carry-over 5; honest labels): wherever a module gain or loss is
 * reported, the ability is named — by the name in the world's recorded content, from the birth's recorded
 * mutation descriptor — instead of the generic feed line and the raw id:
 * - feed: "A Sunbead offspring gained Reserve chamber." / "A Sunbead offspring lost Reserve chamber.";
 *   quantitative changes keep their line ("…inherited a different trait."), and a burst coalesces as before;
 * - birth record row: "gained Reserve chamber (E05)" instead of "gained E05".
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearFeed, feed, moduleChangeOf, pushFeed } from '../../src/ui/feed';
import { deltaText, recordLine } from '../../src/ui/strings/lineage';
import { MUT_MODULE_GAIN, MUT_MODULE_LOSS, MUT_PREF, MUT_QUANT } from '../../src/sim/mutation';
import { buildLineage, field, type LineageRecordRow } from '../../src/sim/lineage';
import { realizeRecipe } from '../../src/sim/recipes';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { visualEvents } from '../../src/worker/snapshot';
import type { VisualEvent } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

const SPECIES = ['Sunbead', 'Sprinter'];
const MODULES: Readonly<Record<string, string>> = { E05: 'Reserve chamber', E03: 'Resting stage' };
const moduleName = (id: string): string | undefined => MODULES[id];

function mutation(tick: number, species: number, flags: number, module: string | null, delta = 0): VisualEvent {
  return { type: 'mutation', tick, species, cell: 0, birthId: tick, mutation: { flags, delta, module } };
}
const lines = () => feed.value.map((l) => l.text);

describe('feed: a module gained or lost is named', () => {
  beforeEach(() => clearFeed());

  it('names the ability for a gain and for a loss', () => {
    pushFeed([mutation(10, 0, MUT_MODULE_GAIN, 'E05')], SPECIES, moduleName);
    expect(lines()).toEqual(['A Sunbead offspring gained Reserve chamber.']);
    clearFeed();
    pushFeed([mutation(10, 1, MUT_MODULE_LOSS, 'E05')], SPECIES, moduleName);
    expect(lines()).toEqual(['A Sprinter offspring lost Reserve chamber.']);
  });

  it('a burst coalesces as before: one line per gained or lost module, counted', () => {
    pushFeed([mutation(10, 0, MUT_MODULE_GAIN, 'E05'), mutation(12, 0, MUT_MODULE_GAIN, 'E05'), mutation(15, 0, MUT_MODULE_LOSS, 'E05')], SPECIES, moduleName);
    pushFeed([mutation(16, 0, MUT_MODULE_GAIN, 'E03'), mutation(20, 0, MUT_MODULE_GAIN, 'E05')], SPECIES, moduleName);
    expect(lines()).toEqual(['A Sunbead offspring gained Resting stage.', 'A Sunbead offspring lost Reserve chamber.', '3 Sunbead offspring gained Reserve chamber.']);
    // Outside the 5 s window a new line starts, as for every other event.
    pushFeed([mutation(80, 0, MUT_MODULE_GAIN, 'E05')], SPECIES, moduleName);
    expect(lines()[0]).toBe('A Sunbead offspring gained Reserve chamber.');
  });

  it('quantitative changes keep their line; a module change with another inherited change says so', () => {
    pushFeed([mutation(10, 0, MUT_QUANT, null, 2), mutation(11, 0, MUT_QUANT, null, -5)], SPECIES, moduleName);
    expect(lines()).toEqual(['2 Sunbead offspring inherited different traits.']);
    clearFeed();
    pushFeed([mutation(10, 0, MUT_QUANT | MUT_MODULE_GAIN, 'E05', -2)], SPECIES, moduleName);
    expect(lines()).toEqual(['A Sunbead offspring gained Reserve chamber and inherited a different trait.']);
    pushFeed([mutation(12, 0, MUT_PREF | MUT_MODULE_GAIN, 'E05')], SPECIES, moduleName);
    expect(lines()).toEqual(['2 Sunbead offspring gained Reserve chamber and inherited different traits.']);
    // Never mixed with births that gained only the module.
    pushFeed([mutation(13, 0, MUT_MODULE_GAIN, 'E05')], SPECIES, moduleName);
    expect(lines()).toEqual(['A Sunbead offspring gained Reserve chamber.', '2 Sunbead offspring gained Reserve chamber and inherited different traits.']);
  });

  it('only a recorded descriptor names a module: without one the line stays generic, and an unknown name shows the id', () => {
    pushFeed([{ type: 'mutation', tick: 10, species: 0, cell: 0, birthId: 1 }], SPECIES, moduleName);
    expect(lines()).toEqual(['A Sunbead offspring inherited a different trait.']);
    clearFeed();
    expect(moduleChangeOf(mutation(10, 0, MUT_MODULE_GAIN, null))).toBeNull();
    expect(moduleChangeOf(mutation(10, 0, MUT_QUANT, 'E05', 2))).toBeNull();
    pushFeed([mutation(10, 0, MUT_MODULE_GAIN, 'E99')], SPECIES, moduleName);
    expect(lines()).toEqual(['A Sunbead offspring gained E99.']);
  });
});

/** Run a Garden at Accelerated tick by tick, collecting the snapshot events exactly as the host does. */
function runCollecting(seed: number, ticks: number): { readonly w: World; readonly events: VisualEvent[] } {
  const w = realizeRecipe(registry(), 'FIRST_DISH_V1', { seed, worldId: `feed-${seed}`, transform: (r) => ({ ...r, mutationPreset: 'accelerated' }) });
  const events: VisualEvent[] = [];
  let last = w.counters.nextEventId - 1;
  for (let t = 0; t < ticks; t++) {
    step(w);
    events.push(...visualEvents(w.events.ring, last, w.content.modules));
    last = w.counters.nextEventId - 1;
  }
  return { w, events };
}

describe('through the simulation: every module line comes from the recorded descriptor', () => {
  it('seed 11 (Accelerated): a Sunbead born at 0:30.5 gained Reserve chamber, and the feed says exactly that', () => {
    const { w, events } = runCollecting(11, 320);
    const changes = events.filter((e) => moduleChangeOf(e) !== null);
    expect(changes.length).toBeGreaterThan(0);
    for (const e of changes) {
      // The descriptor is the birth record's: the same flags and the module at the recorded index.
      const flags = field(w.lineage, 'mutFlags', e.birthId)!;
      expect(e.mutation!.flags).toBe(flags);
      expect(e.mutation!.module).toBe(w.content.modules[field(w.lineage, 'mutModule', e.birthId)!]!.id);
      expect(flags & (MUT_MODULE_GAIN | MUT_MODULE_LOSS)).not.toBe(0);
    }
    const first = changes[0]!;
    expect([first.tick, first.birthId, first.mutation]).toEqual([305, 72, { flags: MUT_MODULE_GAIN, delta: 0, module: 'E05' }]);
    clearFeed();
    const names = (id: string) => w.content.modules.find((m) => m.id === id)?.name;
    pushFeed([first], w.species.map((s) => s.def.name), names);
    expect(lines()).toEqual(['A Sunbead offspring gained Reserve chamber.']);
  });
});

describe('birth record rows name the ability with its id', () => {
  const row = (over: Partial<LineageRecordRow>): LineageRecordRow => ({
    birthId: 71,
    birthTick: 305,
    generation: 3,
    status: 'alive',
    endTick: -1,
    deathCause: 0,
    origin: 0,
    mutFlags: 0,
    mutLocus: -1,
    mutDelta: 0,
    mutModule: null,
    ...over,
  });

  it('"gained Reserve chamber (E05)", "lost Reserve chamber (E05)"; the id alone only when no name was recorded', () => {
    expect(deltaText(row({ mutFlags: MUT_MODULE_GAIN, mutModule: 'E05', mutModuleName: 'Reserve chamber' }), [])).toBe('gained Reserve chamber (E05)');
    expect(deltaText(row({ mutFlags: MUT_MODULE_LOSS, mutModule: 'E05', mutModuleName: 'Reserve chamber' }), [])).toBe('lost Reserve chamber (E05)');
    expect(deltaText(row({ mutFlags: MUT_MODULE_GAIN, mutModule: 'E05' }), [])).toBe('gained E05');
  });

  it('seed 101 (Accelerated): the founder of the first branch gained Reserve chamber; its family row names it from the dish content', () => {
    const { w } = runCollecting(101, 1500);
    const ans = buildLineage(w, { branch: 0 });
    const root = ans.selected?.family.root;
    expect(root?.birthId).toBe(71);
    expect([root?.mutModule, root?.mutModuleName]).toEqual(['E05', 'Reserve chamber']);
    const line = recordLine(root!, 'Founder', ans.loci);
    expect(line).toContain('gained Reserve chamber (E05)');
    expect(line).not.toMatch(/gained E05/);
  });
});
