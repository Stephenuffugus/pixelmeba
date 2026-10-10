/**
 * P3.12 stress-world shape (W6-13): tools/perf-stress.ts builds the population the Phase 3 performance
 * numbers are measured on (docs/reports/perf-g3.md). This keeps those numbers honest: if the builder
 * stopped producing 6,000 agents with 2,000 fungal segments, or some Phase 3 system stopped acting in
 * it, the measured tick cost would describe an easier dish. It runs in every `npm run check`, so it
 * builds the dish and steps only until every mechanism has acted once (about 220 ticks; the slowest is
 * the first E12 adhesion link), never the 15-minute run.
 *
 * Non-vacuity of the watch itself: built without the phage dose ('phage' omitted) the same run reports
 * 'infection' and 'lysis' missing, and without the food objects 'objectRelease' (checked by hand when
 * this test was written; see docs/reports/reviews/g3-wave-4b/perf-build.md).
 */
import { describe, expect, it } from 'vitest';
import { AGENT_CAP, FUNGAL_CAP } from '../../src/sim/constants';
import { worldHasModule, worldHasSystem } from '../../src/sim/gates';
import { SUB_GEL, SUB_SEDIMENT, ST_BEAD, ST_WALL } from '../../src/sim/grid';
import { FUNGAL_SLOT_COLUMNS, FUNGAL_KIND_COLUMNS, LINK_TRANSPORT, LINK_VISUAL } from '../../src/sim/links';
import { profileOf } from '../../src/sim/profiles';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import {
  buildStressWorld,
  census,
  EARLY_MECHANISMS,
  MechanismWatch,
  STRESS_AGENTS,
  STRESS_FUNGAL,
} from '../../tools/perf-stress';

/** Generous cap: every early mechanism fired by tick ~220 when this was written (seed 6000). */
const MAX_TICKS = 600;

function count<T>(xs: ArrayLike<T>, pred: (v: T) => boolean): number {
  let n = 0;
  for (let k = 0; k < xs.length; k++) if (pred(xs[k]!)) n++;
  return n;
}

function carriers(w: World, moduleId: string): number {
  const c = w.ents.cols;
  let n = 0;
  for (let i = 0; i < w.ents.highWater; i++)
    if (c.alive[i] === 1 && profileOf(w, i).modules.includes(moduleId)) n++;
  return n;
}

function fungalLinks(w: World, kind: number): number {
  const c = w.ents.cols;
  let n = 0;
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    for (let k = 0; k < FUNGAL_SLOT_COLUMNS.length; k++)
      if (c[FUNGAL_SLOT_COLUMNS[k]!][i]! >= 0 && c[FUNGAL_KIND_COLUMNS[k]!][i] === kind) n++;
  }
  return n / 2; // stored on both ends
}

describe('P3.12 stress world (tools/perf-stress.ts)', () => {
  it(
    'builds 6,000 agents with 2,000 linked fungal segments and every Phase 3 system, and each mechanism acts',
    { timeout: 120_000 },
    () => {
      const { world: w, links } = buildStressWorld();
      const start = census(w);
      // The target population of SPEC §2.5 / §16 exactly, at both caps.
      expect(STRESS_AGENTS).toBe(AGENT_CAP);
      expect(STRESS_FUNGAL).toBe(FUNGAL_CAP);
      expect(start.alive).toBe(6000);
      expect(start.fungal).toBe(2000);
      expect(Object.keys(start.species).sort()).toEqual([
        'A01',
        'B01',
        'B02',
        'B03',
        'B04',
        'B05',
        'B06',
        'B07',
        'B08',
        'F01',
        'F02',
        'P01',
        'P02',
        'P03',
        'P04',
        'X01',
        'Y01',
        'Y02',
      ]);
      expect(start.species.F01! + start.species.F02!).toBe(2000);
      // Linked networks: F01 visual threads and F02 transport trees, as the builder reports them.
      expect(links.visual).toBeGreaterThan(900);
      expect(links.transport).toBeGreaterThan(900);
      expect(fungalLinks(w, LINK_VISUAL)).toBe(links.visual);
      expect(fungalLinks(w, LINK_TRANSPORT)).toBe(links.transport);
      // Every shipped system and the modules the stress needs are in the world's recorded manifest.
      for (const sys of [
        'chemistry',
        'core',
        'enzymes',
        'film',
        'foodObjects',
        'fungi',
        'parasites',
        'viruses',
      ] as const)
        expect(worldHasSystem(w, sys), sys).toBe(true);
      for (const m of ['E04', 'E07', 'E10', 'E12']) {
        expect(worldHasModule(w, m), m).toBe(true);
        expect(carriers(w, m), `${m} carriers`).toBeGreaterThanOrEqual(12);
      }
      // Habitat: gel, sediment, walls and beads (no stones: removed for the gel pad); the phage dose, the M09 breaker, both food objects.
      expect(count(w.grid.substrate, (v) => v === SUB_GEL)).toBeGreaterThan(1000);
      expect(count(w.grid.substrate, (v) => v === SUB_SEDIMENT)).toBeGreaterThan(1000);
      for (const st of [ST_WALL, ST_BEAD])
        expect(
          count(w.grid.structure, (v) => v === st),
          `structure ${st}`,
        ).toBeGreaterThan(0);
      expect(count(w.fields.v01!, (v) => v > 0)).toBeGreaterThan(0);
      expect(count(w.fields.breaker!, (v) => v > 0)).toBeGreaterThan(0);
      expect(new Set(w.objects.map((o) => o.kind))).toEqual(new Set(['pellet', 'wafer']));
      expect(w.objects.length).toBeGreaterThanOrEqual(30);

      // Step until every early mechanism has acted once.
      const watch = new MechanismWatch(w);
      while (w.tick < MAX_TICKS && EARLY_MECHANISMS.some((m) => watch.first[m] === null)) {
        step(w, watch.hooks);
        watch.afterTick(w);
      }
      const missing = EARLY_MECHANISMS.filter((m) => watch.first[m] === null);
      expect(missing, `mechanisms that never acted by tick ${w.tick}: ${missing.join(', ')}`).toEqual([]);
      // Still a dense dish when the last one fired (near the agent cap, fungal pads intact).
      const now = census(w);
      expect(now.alive).toBeGreaterThan(5000);
      expect(now.fungal).toBeGreaterThan(1900);
    },
  );
});
