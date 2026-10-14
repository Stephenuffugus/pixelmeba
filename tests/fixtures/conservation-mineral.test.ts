/**
 * Phase 5 E2-SHELLS: closed-lid mineral conservation (SPEC §3.4, §5.2, §6.5, §6.8, §7.11; D-0117).
 *
 * Lid closed, no input after setup: A02 and P05 (shell builders), B01 and P01, silicate and grit
 * patches, 10,000 ticks in 20 chunks. Carbon, nutrient and mineral (silicate + grit + boundMineral +
 * jacketMineral + the sample's mineral) reconcile within 1e-5 relative at every checkpoint, and the
 * absolute residual stays under 1e-8 per element, through binding, grit dissolution, shell-builder
 * deaths and predation (at least one shell went to grit).
 *
 * NOTHING is enabled (D-0104): REG enables A02, P05, M02, M12 and 'silicate' for tests only
 * (allowUnimplemented: SHELL is appended to the implemented list by the lead at integration).
 */
import { describe, expect, it } from 'vitest';
import { applyNow } from '../../src/sim/commands';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex } from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { run } from '../../src/sim/tick';
import { inactiveFieldsNonZero } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, rebaseLedger, registry } from '../helpers/world';

const SHIPPED = registry().manifest;
const REG = registryWith(
  {
    enabledSpecies: [...SHIPPED.enabledSpecies, 'A02', 'P05'].sort(),
    enabledSystems: [...SHIPPED.enabledSystems, 'silicate'].sort() as SystemFlag[],
    enabledMaterials: [...SHIPPED.enabledMaterials, 'M02', 'M12'].sort(),
  },
  { allowUnimplemented: true },
);
const ABS_RESIDUAL_BOUND = 1e-8;

/** The mineral dish: silicate and grit patches set as initial state, then four species inoculated. */
function mineralDish(lid: 'open' | 'closed'): World {
  const w = clearWater({ lid, backgroundOverrides: { sugar: 0.2 } }, REG);
  const si = w.fields.silicate!;
  const grit = w.fields.grit!;
  for (let y = 54; y < 74; y++) {
    for (let x = 44; x < 60; x++) si[cellIndex(x, y)] = 0.05;
    for (let x = 68; x < 84; x++) grit[cellIndex(x, y)] = 0.3;
  }
  rebaseLedger(w);
  let n = 0;
  const inoc = (speciesId: string, x: number, y: number, count: number) =>
    applyNow(w, `mineral-${++n}`, { kind: 'inoculate', speciesId, x, y, radius: 4, count });
  inoc('A02', 52.5, 64.5, 12);
  inoc('A02', 76.5, 64.5, 12);
  inoc('B01', 64.5, 58.5, 20);
  inoc('B01', 64.5, 70.5, 20);
  inoc('P05', 60.5, 64.5, 3);
  inoc('P05', 70.5, 64.5, 3);
  inoc('P01', 64.5, 64.5, 2);
  return w;
}

/** Live shell builders (A02, P05) and their bound mineral. */
function shells(w: World): { count: number; mineral: number } {
  const c = w.ents.cols;
  let count = 0;
  let mineral = 0;
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    if (!w.species[c.species[i]!]!.abilities.includes('SHELL')) continue;
    count++;
    mineral += c.boundMineral[i]!;
  }
  return { count, mineral };
}

describe('E2-SHELLS: closed-lid mineral conservation', () => {
  it('conserves C, N and mineral over 10,000 ticks with A02, P05, B01, P01, silicate and grit', () => {
    const w = mineralDish('closed');
    const inputsAtStart = { ...w.ledger.inputs };
    const t0 = computeTotals(w);
    expect(t0.m).toBeGreaterThan(0);
    expect(shells(w).count).toBe(30);
    let shellLosses = 0;
    let last = shells(w).count;
    let binding = 0;
    const worst = { c: 0, n: 0, m: 0 };
    const worstAbs = { c: 0, n: 0, m: 0 };
    for (let chunk = 0; chunk < 20; chunk++) {
      run(w, 500, {
        afterStage: (s, world) => {
          // A shell builder leaves the dish only by death (stage 7) or capture (stage 5); births are stage 9.
          if (s === 4 || s === 5 || s === 7) {
            const now = shells(world).count;
            if (s !== 4 && now < last) shellLosses += last - now;
            last = now;
          }
          if (s === 6 && world.tick % 50 === 0) binding = Math.max(binding, shells(world).mineral);
        },
      });
      const chk = checkLedger(w);
      for (const e of ['c', 'n', 'm'] as const) {
        worst[e] = Math.max(worst[e], chk.relErr[e]);
        worstAbs[e] = Math.max(worstAbs[e], Math.abs(chk.actual[e] - chk.expected[e]));
      }
      expect(chk.ok, `tick ${w.tick}: ${JSON.stringify(chk)}`).toBe(true);
      expect(inactiveFieldsNonZero(w)).toEqual([]);
    }
    expect(w.tick).toBe(10000);
    expect(w.ledger.exchangeC).toBe(0);
    expect(w.ledger.inputs).toEqual(inputsAtStart);
    expect(shellLosses).toBeGreaterThan(0); // at least one shell went to grit
    expect(binding).toBeGreaterThan(30 * 0.1 * 2); // shells grew beyond their inoculated mineral
    expect(worst.c).toBeLessThan(1e-5);
    expect(worst.n).toBeLessThan(1e-5);
    expect(worst.m).toBeLessThan(1e-5);
    expect(worstAbs.c).toBeLessThan(ABS_RESIDUAL_BOUND);
    expect(worstAbs.n).toBeLessThan(ABS_RESIDUAL_BOUND);
    expect(worstAbs.m).toBeLessThan(ABS_RESIDUAL_BOUND);
    const t = computeTotals(w);
    console.info(
      `conservation-mineral: worst relative C ${worst.c.toExponential(3)}, N ${worst.n.toExponential(3)}, M ${worst.m.toExponential(3)}; ` +
        `worst absolute C ${worstAbs.c.toExponential(3)}, N ${worstAbs.n.toExponential(3)}, M ${worstAbs.m.toExponential(3)}; ` +
        `shell losses ${shellLosses}; mineral silicate ${t.breakdown.silicate!.toFixed(4)} grit ${t.breakdown.grit!.toFixed(4)} bound ${t.breakdown.bodyMineral!.toFixed(4)}; ` +
        `alive ${w.ents.count}; births ${w.events.totals.birth ?? 0}; deaths ${w.events.totals.death ?? 0}; captures ${w.events.totals.capture ?? 0}`,
    );
  }, 900_000);
});
