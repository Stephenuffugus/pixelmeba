/**
 * Phase 5 E2-SHELLS: shell grit dissolves into free silicate in stage 3 (SPEC §3.2 row 3, §5.2; CT
 * §5.2 M02/M12, §12.2 "grit → silicate 0.01 × remaining/s"; D-0117).
 *
 * d = grit × 0.01 × dt per cell per tick, an internal mineral move (grit + silicate unchanged), after the
 * finite food release and before enzyme catalysis. Grit never diffuses and is never food. M02 and M12
 * doses go through the generic deposit command as mineral inputs. A world without the silicate system
 * has neither field and never runs the scan.
 *
 * NOTHING is enabled (D-0104): REG enables A02, P05, M02, M12 and 'silicate' for tests only
 * (allowUnimplemented: SHELL is appended to the implemented list by the lead at integration).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import { DT, GRIT_DISSOLVE_PER_SECOND } from '../../src/sim/constants';
import { dissolveGrit } from '../../src/sim/conversion';
import { FIELD_IDS, type SystemFlag } from '../../src/sim/fields';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { canonicalJson } from '../../src/sim/hash';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { killEntity } from '../../src/sim/maintenance';
import { R } from '../../src/sim/reasons';
import { serializeWorld } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { aliveOf, clearWater, place, preFlipRegistry, rebaseLedger, registry } from '../helpers/world';

const SHIPPED = registry().manifest;
const REG = registryWith(
  {
    enabledSpecies: [...SHIPPED.enabledSpecies, 'A02', 'P05'].sort(),
    enabledSystems: [...SHIPPED.enabledSystems, 'silicate'].sort() as SystemFlag[],
    enabledMaterials: [...SHIPPED.enabledMaterials, 'M02', 'M12'].sort(),
  },
  { allowUnimplemented: true },
);
const CELL = cellIndex(64, 64);
const K = GRIT_DISSOLVE_PER_SECOND * DT;

let seq = 0;
function cmd(w: World, payload: CommandPayload) {
  return applyNow(w, `grit-${++seq}`, payload).result!;
}

/** Closed-lid clear water under REG with grit 1.0 in one cell (re-based as initial state). */
function gritDish(): World {
  const w = clearWater({ lid: 'closed' }, REG);
  w.fields.grit![CELL] = 1;
  rebaseLedger(w);
  return w;
}

function sum(w: World, id: 'grit' | 'silicate'): number {
  const a = w.fields[id]!;
  let s = 0;
  for (const k of maskCells()) s += a[k]!;
  return s;
}

describe('E2-SHELLS: grit dissolution (stage 3)', () => {
  it('one tick: grit 1.0 becomes 1 − 0.001 and silicate gains 0.001 in that cell, exactly', () => {
    expect(K).toBe(0.001);
    const w = gritDish();
    let g3 = -1;
    let s3 = -1;
    let g2 = -1;
    step(w, {
      afterStage: (s) => {
        if (s === 2) g2 = w.fields.grit![CELL]!;
        if (s === 3) {
          g3 = w.fields.grit![CELL]!;
          s3 = w.fields.silicate![CELL]!;
        }
      },
    });
    expect(g2).toBe(1); // nothing before stage 3 touches grit (it never diffuses)
    expect(g3).toBe(1 - 1 * K);
    expect(s3).toBe(1 * K);
    expect(w.fields.grit![CELL]).toBe(1 - K);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('1,000 ticks: grit follows (1 − 0.001)^1000 and grit + silicate is unchanged; grit never leaves its cell', () => {
    const w = gritDish();
    run(w, 1000);
    const g = w.fields.grit![CELL]!;
    const closed = Math.pow(1 - K, 1000);
    expect(Math.abs(g - closed) / closed).toBeLessThan(1e-12);
    // Grit never diffuses: every other cell holds none.
    for (const k of maskCells()) if (k !== CELL) expect(w.fields.grit![k]).toBe(0);
    // Silicate diffused away from the cell, but the mineral total is unchanged (internal move).
    expect(Math.abs(sum(w, 'grit') + sum(w, 'silicate') - 1)).toBeLessThan(1e-12);
    expect(sum(w, 'silicate')).toBeCloseTo(1 - closed, 12);
    expect(w.fields.silicate![CELL + 1]!).toBeGreaterThan(0);
    const chk = checkLedger(w);
    expect(chk.ok).toBe(true);
    expect(Math.abs(chk.actual.m - chk.expected.m)).toBeLessThan(1e-12);
  });

  it('runs after the food release and before catalysis (SPEC §3.2 row 3); the scan alone reproduces stage 3 on grit', () => {
    const a = gritDish();
    const b = gritDish();
    step(a);
    // b: one direct call of dissolveGrit reproduces stage 3's grit update exactly.
    dissolveGrit(b);
    expect(b.fields.grit![CELL]).toBe(a.fields.grit![CELL]);
    // Neither the food release nor catalysis reads or writes grit or silicate, so their order with the
    // dissolution is not observable in state; the canonical order is held on the stage's source.
    const src = readFileSync(fileURLToPath(new URL('../../src/sim/conversion.ts', import.meta.url)), 'utf8');
    const body = src.slice(src.indexOf('export function stageConversion'));
    const release = body.indexOf('releaseFoodObjects(world);');
    const dissolve = body.indexOf('dissolveGrit(world);');
    const enzymes = body.indexOf('for (const r of RULES)');
    expect(release).toBeGreaterThan(0);
    expect(dissolve).toBeGreaterThan(release);
    expect(enzymes).toBeGreaterThan(dissolve);
  });

  it('an M12 dose and an M02 dose are recorded as mineral inputs (generic deposit command)', () => {
    const w = clearWater({ lid: 'closed' }, REG);
    const m0 = w.ledger.inputs.m;
    const r12 = cmd(w, { kind: 'deposit', materialId: 'M12', points: [[40.5, 64.5]], radius: 0, dose: 0.5 });
    expect(r12.accepted).toBe(1);
    expect(w.fields.grit![cellIndex(40, 64)]).toBe(0.5);
    expect(w.ledger.inputs.m - m0).toBe(0.5);
    const r02 = cmd(w, { kind: 'deposit', materialId: 'M02', points: [[80.5, 64.5]], radius: 0, dose: 0.1 });
    expect(r02.accepted).toBe(1);
    expect(w.fields.silicate![cellIndex(80, 64)]).toBe(0.1);
    expect(w.ledger.inputs.m - m0).toBeCloseTo(0.6, 15);
    run(w, 200);
    expect(checkLedger(w).ok).toBe(true);
    expect(w.fields.grit![cellIndex(40, 64)]).toBeCloseTo(0.5 * Math.pow(1 - K, 200), 14);
  });

  it('grit is never food: no species of the registry lists it, and no organism ever requests it', () => {
    for (const id of REG.speciesIds) {
      const sp = REG.species[id]!;
      expect(sp.foodPriority as readonly string[]).not.toContain('grit');
    }
    // A dish of every shipped consumer next to grit only: grit falls only by the dissolution law.
    const w = clearWater({ lid: 'closed', backgroundOverrides: { sugar: 0.3 } }, REG);
    for (const k of maskCells()) w.fields.grit![k] = 0.2;
    rebaseLedger(w);
    for (const [k, id] of ['B01', 'B04', 'B06', 'P01', 'P05', 'Y01'].entries()) place(w, id, 50.5 + k * 4, 64.5);
    run(w, 100);
    const expected = 0.2 * Math.pow(1 - K, 100);
    for (const k of maskCells()) expect(Math.abs(w.fields.grit![k]! - expected)).toBeLessThan(1e-15);
    // The intake observation (intakeSeen) never records grit for any species.
    const b = w.intakeSeen.bits;
    expect(b).not.toBeNull();
    for (let s = 0; s < w.species.length; s++) expect(b![s * FIELD_IDS.length + FIELD_IDS.indexOf('grit')]).toBe(0);
  });

  // A world without the silicate system: the proof that it plays exactly as before Phase 5 is the FENCE
  // (tests/fixtures/g2-replay, rc1-replay, trajectory-fence: recorded v1.0 worlds hash as they always
  // did). What is checked here is that such a world can never reach dissolveGrit's body: it has neither
  // field, deaths there carry no mineral, and the stage 3 call leaves every byte of state as it was.
  it('a world without the silicate system: no grit or silicate field, no mineral in any body through deaths, and dissolveGrit changes nothing', () => {
    const w = clearWater({ backgroundOverrides: { sugar: 0.3 } }, preFlipRegistry()); // a v1.0 dish (the shipped one has silicate since D-0127)
    expect(w.content.manifest.enabledSystems).not.toContain('silicate');
    for (const [k, id] of ['B01', 'B04', 'P01', 'B01', 'B04', 'B01', 'B04', 'P01', 'B01', 'B04'].entries()) place(w, id, 50.5 + k * 3, 64.5, { E: 60 });
    const c = w.ents.cols;
    let deaths = 0;
    for (let t = 0; t < 300; t++) {
      if (t % 60 === 30) {
        const victim = aliveOf(w)[0];
        if (victim !== undefined) {
          killEntity(w, victim, R.DEATH_STARVATION);
          deaths++;
        }
      }
      step(w);
      expect(w.fields.grit).toBeUndefined();
      expect(w.fields.silicate).toBeUndefined();
      for (let i = 0; i < w.ents.highWater; i++) {
        expect(c.boundMineral[i]).toBe(0);
        expect(c.jacketMineral[i]).toBe(0);
      }
    }
    expect(deaths).toBe(5);
    expect(w.events.ring.filter((e) => e.type === 'death').length).toBeGreaterThanOrEqual(deaths);
    expect(computeTotals(w).m).toBe(0);
    const unchanged = (fn: (x: World) => void, x: World) => {
      const before = canonicalJson(serializeWorld(x));
      const active = Array.from(x.derived.fieldActive);
      fn(x);
      return canonicalJson(serializeWorld(x)) === before && Array.from(x.derived.fieldActive).join() === active.join();
    };
    expect(unchanged(dissolveGrit, w)).toBe(true);
    // Control: the same comparison sees a dissolution step in a world that has the fields (1 − K by hand).
    const g = gritDish();
    expect(unchanged(dissolveGrit, g)).toBe(false);
    expect(g.fields.grit![CELL]).toBe(1 - K);
  });
});
