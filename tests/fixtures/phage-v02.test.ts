/**
 * Phase 5 wave 10, e3-resters: V02 Lacephage (SPEC §7.5; CT §1.2, §3.3, §12.5; D-0117;
 * src/sim/viruses.ts).
 *
 * - V02 infects B02 only, and only where its cell holds film ≥ 0.10 (V02_FILM_MIN): film 0.10 infects,
 *   just below never; a world without the film field never infects (B02 itself needs the film system).
 * - An infected B02 (infectedBy 2) lyses 200 ticks later into v02 units (floor(0.40 × B / 0.01)) and
 *   detritus, through the same generic code as V01.
 * - Disjoint pools: V01 never infects B02 and V02 never infects B01, both dosed together; each infection
 *   takes a unit only from its own field.
 * - v02 diffuses at exactly half v01's rate (one-cell doses of equal units, after one tick).
 * - Doses: the inoculate command doses V02 units like V01 (an external input `dose:V02`).
 * - Closed lid, 10,000 ticks with both viruses: carbon and nutrient conserve to < 1e-5, with lyses of both.
 * - Saves: an infected B02 round-trips; the import refuses it in a dish without V02.
 *
 * Registry: tests/helpers/world.ts resterRegistry() (V02 enabled through a test registry; nothing is
 * enabled in the shipped manifest, D-0104). Worlds: GEL_COLONY (gel, water channel x 59–68).
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { applyNow } from '../../src/sim/commands';
import { cellIndex } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import { inactiveFieldsNonZero, markField } from '../../src/sim/transport';
import { infectHosts, isFieldVirus, V02_FILM_MIN, virusIdOfCode } from '../../src/sim/viruses';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';
import { aliveOf, clearWater, place, preOrganismFlipRegistry, rebaseLedger, registry, resterRegistry, setField } from '../helpers/world';

const REG = resterRegistry();
const meta = { name: 'phage v02', savedAt: '2026-10-14T00:00:00Z', recipeId: null };

/** Gel at x < 59 and x > 68; the water channel between. */
const GX = 30;
const GY = 64;
const G = cellIndex(GX, GY);
const WX = 63;
const W_ = cellIndex(WX, GY);

function gelDish(overrides: Parameters<typeof clearWater>[0] = {}): World {
  return clearWater({ habitatId: 'GEL_COLONY', ...overrides }, REG);
}

/** Test setup: units straight into a viral field (re-based by the caller). */
function setUnits(w: World, id: 'v01' | 'v02', cell: number, units: number): void {
  w.fields[id]![cell] = units;
  markField(w, id);
}

/** A B02 below 40 E (no film deposition) on gel, its cell's film set; returns its slot. */
function velvet(w: World, film: number, x = GX, y = GY, state: Parameters<typeof place>[4] = {}): number {
  setField(w, 'film', cellIndex(x, y), film);
  return place(w, 'B02', x + 0.5, y + 0.5, { E: 30, ...state });
}

describe('V02 Lacephage infection (SPEC §7.5, CT §3.3, §12.5)', () => {
  it('its record and table entry: host B02, half-speed units, code 2, film minimum 0.10', () => {
    expect(REG.species.V02!.hostIds).toEqual(['B02']);
    expect(REG.species.V02!.metabolism).toBe('viral');
    expect(virusIdOfCode(2)).toBe('V02');
    expect(virusIdOfCode(1)).toBe('V01');
    expect(isFieldVirus('V02')).toBe(true);
    expect(V02_FILM_MIN).toBe(0.1);
  });

  it('film 0.10 in the host cell infects; just below never does (one stage 5 pass, the draw p ≈ 1)', () => {
    for (const [film, infected] of [
      [0.1, true],
      [0.2, true],
      [0.09999999, false],
      [0.09, false],
      [0, false],
    ] as const) {
      const w = gelDish();
      const s = velvet(w, film);
      setUnits(w, 'v02', G, 2000);
      infectHosts(w);
      expect(w.ents.cols.infectedBy[s], `film ${film}`).toBe(infected ? 2 : 0);
      expect(w.fields.v02![G], `film ${film}`).toBe(infected ? 1999 : 2000);
    }
  });

  it('on film ≥ 0.10 a B02 is infected and lyses 200 ticks later: 28 v02 units from B 0.7, the rest and all N to detritus', () => {
    const w = gelDish();
    const host = velvet(w, 0.3, GX, GY, { B: 0.69, N: 0.069 });
    setUnits(w, 'v02', G, 2000);
    rebaseLedger(w);
    const c = w.ents.cols;
    const birth = c.birthId[host]!;
    let infectedAt = -1;
    let lysedAt = -1;
    let before: { B: number; N: number; units: number; det: number; detN: number } | null = null;
    let after: { units: number; det: number; detN: number } | null = null;
    for (let t = 0; t < 400 && lysedAt < 0; t++) {
      step(w, {
        afterStage: (stage, world) => {
          const cc = world.ents.cols;
          const live = cc.alive[host] === 1 && cc.birthId[host] === birth;
          if (stage === 5 && infectedAt < 0 && live && cc.infectedBy[host] === 2) infectedAt = world.tick;
          if (stage === 6 && live) before = { B: cc.B[host]!, N: cc.N[host]!, units: world.fields.v02![G]!, det: world.fields.detritus![G]!, detN: world.fields.detritusN![G]! };
          if (stage === 7 && !live && lysedAt < 0) {
            lysedAt = world.tick;
            after = { units: world.fields.v02![G]!, det: world.fields.detritus![G]!, detN: world.fields.detritusN![G]! };
          }
        },
      });
    }
    expect(infectedAt).toBeGreaterThanOrEqual(0);
    expect(lysedAt - infectedAt).toBe(200);
    expect(w.events.ring.find((e) => e.type === 'death' && e.birthId === birth)?.cause).toBe(R.DEATH_LYSIS);
    const b = before!;
    const a = after!;
    expect(b.B).toBeCloseTo(0.7, 15);
    expect(a.units - b.units).toBe(28);
    expect(28 * 0.01 + (a.det - b.det)).toBeCloseTo(b.B, 14);
    expect(a.detN - b.detN).toBeCloseTo(b.N, 15);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('film 0.09 (no deposition below 40 E): never infected over 600 ticks with 2,000 units', () => {
    const w = gelDish();
    const s = velvet(w, 0.09);
    setUnits(w, 'v02', G, 2000);
    for (let t = 0; t < 600; t++) {
      step(w);
      expect(w.ents.cols.infectedBy[s]).toBe(0);
      expect(w.fields.film![G]!).toBeLessThan(0.1);
    }
    expect(w.ents.cols.alive[s]).toBe(1);
  });

  it('without the film field V02 never infects; B02, its only host, needs the film system to exist at all', () => {
    const w = gelDish();
    const s = velvet(w, 0.5);
    setUnits(w, 'v02', G, 2000);
    delete (w.fields as Record<string, unknown>).film; // labelled test state: a world without the film field
    infectHosts(w);
    expect(w.ents.cols.infectedBy[s]).toBe(0);
    expect(w.fields.v02![G]).toBe(2000);
    const shipped = registry().manifest;
    expect(() =>
      registryWith(
        { enabledSystems: shipped.enabledSystems.filter((x) => x !== 'film'), enabledSpecies: [...shipped.enabledSpecies, 'V02'].sort() },
        { allowUnimplemented: true },
      ),
    ).toThrow(/B02[\s\S]*film/);
  });
});

describe('disjoint pools (SPEC §7.5: V01 and V02 never share units or hosts)', () => {
  it('both viruses dosed on both hosts: B01 takes a v01 unit only, B02 a v02 unit only', () => {
    const w = gelDish();
    const b02 = velvet(w, 0.5);
    const b01 = place(w, 'B01', WX + 0.5, GY + 0.5);
    for (const cell of [G, W_]) {
      setUnits(w, 'v01', cell, 2000);
      setUnits(w, 'v02', cell, 2000);
    }
    setField(w, 'film', W_, 0.5); // film on the B01 cell too: V02's gate is not what spares it
    infectHosts(w);
    const c = w.ents.cols;
    expect(c.infectedBy[b01]).toBe(1);
    expect(c.infectedBy[b02]).toBe(2);
    expect([w.fields.v01![W_], w.fields.v02![W_]]).toEqual([1999, 2000]);
    expect([w.fields.v01![G], w.fields.v02![G]]).toEqual([2000, 1999]);
  });

  it('over a run, V01 never infects B02 and V02 never infects B01', () => {
    const w = gelDish();
    const b02 = velvet(w, 0.5);
    const b01 = place(w, 'B01', WX + 0.5, GY + 0.5);
    setUnits(w, 'v01', G, 500);
    setUnits(w, 'v02', W_, 500);
    setField(w, 'film', W_, 0.5);
    const c = w.ents.cols;
    for (let t = 0; t < 300; t++) {
      step(w);
      expect(c.infectedBy[b02]).toBe(0);
      if (c.alive[b01] === 1) expect(c.infectedBy[b01]).toBe(0);
    }
  });

  it('v02 diffuses at exactly half v01 rate (equal one-cell doses in two dishes, one tick)', () => {
    const a = clearWater({}, REG);
    const b = clearWater({}, REG);
    const X = cellIndex(64, 64);
    setUnits(a, 'v01', X, 1000);
    setUnits(b, 'v02', X, 1000);
    step(a);
    step(b);
    for (const n of [X + 1, X - 1, X + 128, X - 128]) {
      const gain1 = a.fields.v01![n]!;
      const gain2 = b.fields.v02![n]!;
      expect(gain1).toBeGreaterThan(0);
      expect(gain2 / gain1).toBe(0.5);
    }
    expect(1000 - b.fields.v02![X]! < 1000 - a.fields.v01![X]!).toBe(true);
  });

  it('the inoculate command doses V02 units like V01: count per accepted cell, an external input dose:V02, no entities', () => {
    const w = gelDish();
    const before = w.ents.count;
    const inputs = w.ledger.inputs.c;
    const cmd = applyNow(w, 'phage', { kind: 'inoculate', speciesId: 'V02', x: GX + 0.5, y: GY + 0.5, radius: 0, count: 5 });
    expect(cmd.result).toEqual({ accepted: 1, rejected: 0 });
    expect(w.fields.v02![G]).toBe(5);
    expect(w.fields.v01![G]).toBe(0);
    expect(w.ents.count).toBe(before);
    expect(w.ledger.inputs.c - inputs).toBeCloseTo(0.05, 15);
    expect(w.ledger.entries.some((e) => e.source === 'dose:V02' && Math.abs(e.c - 0.05) < 1e-15)).toBe(true);
    expect(checkLedger(w).ok).toBe(true);
  });
});

describe('conservation and saves', () => {
  it('a closed-lid 10,000-tick dish with both viruses conserves to < 1e-5 with lyses of both hosts', () => {
    const w = gelDish({ lid: 'closed' });
    for (let y = 56; y <= 72; y++) for (let x = 52; x <= 75; x++) w.fields.sugar![cellIndex(x, y)] = 0.5;
    markField(w, 'sugar');
    for (let k = 0; k < 12; k++) place(w, 'B01', 60.5 + (k % 4) * 2, 58.5 + Math.floor(k / 4) * 4);
    for (let k = 0; k < 12; k++) {
      const x = k < 6 ? 53 + (k % 3) * 2 : 70 + (k % 3) * 2;
      const y = 60 + Math.floor((k % 6) / 3) * 4;
      setField(w, 'film', cellIndex(x, y), 0.3);
      place(w, 'B02', x + 0.5, y + 0.5);
    }
    applyNow(w, 'phage', { kind: 'inoculate', speciesId: 'V01', x: 63, y: 64, radius: 4, count: 5 });
    for (const x of [54, 71]) applyNow(w, 'phage', { kind: 'inoculate', speciesId: 'V02', x, y: 62, radius: 3, count: 20 });
    rebaseLedger(w);
    const lysed = { B01: 0, B02: 0 };
    let seen = w.counters.nextEventId;
    let worstC = 0;
    let worstN = 0;
    for (let chunk = 0; chunk < 20; chunk++) {
      for (let t = 0; t < 500; t++) {
        step(w);
        for (const e of w.events.ring) {
          if (e.id < seen || e.type !== 'death' || e.cause !== R.DEATH_LYSIS) continue;
          const id = w.species[e.species!]!.id;
          if (id === 'B01' || id === 'B02') lysed[id]++;
        }
        seen = w.counters.nextEventId;
      }
      const check = checkLedger(w);
      worstC = Math.max(worstC, check.relErr.c);
      worstN = Math.max(worstN, check.relErr.n);
      expect(check.ok, `tick ${w.tick}: ${JSON.stringify(check)}`).toBe(true);
      expect(inactiveFieldsNonZero(w)).toEqual([]);
    }
    expect(w.tick).toBe(10000);
    expect(worstC).toBeLessThan(1e-5);
    expect(worstN).toBeLessThan(1e-5);
    expect(lysed.B01).toBeGreaterThanOrEqual(1);
    expect(lysed.B02).toBeGreaterThanOrEqual(1);
    console.info(`v01+v02 closed lid: worst relative error C ${worstC.toExponential(3)}, N ${worstN.toExponential(3)}; lyses B01 ${lysed.B01}, B02 ${lysed.B02}`);
  }, 600_000);

  it('an infected B02 (infectedBy 2) round-trips and continues identically through its lysis', async () => {
    const w = gelDish();
    const s = velvet(w, 0.5);
    setUnits(w, 'v02', G, 2000);
    run(w, 30);
    expect(w.ents.cols.infectedBy[s]).toBe(2);
    const back = (await loadSaveFile((await buildSaveFile(w, meta)).text)).world;
    expect(stateHash(back)).toBe(stateHash(w));
    run(w, 250);
    run(back, 250);
    expect(aliveOf(w, 'B02')).toHaveLength(0);
    expect(stateHash(back)).toBe(stateHash(w));
    expect(trajectoryDigest(back, 'full')).toBe(trajectoryDigest(w, 'full'));
  });

  it('the import refuses an infection by code 2 in a dish without V02', async () => {
    const w = clearWater({ habitatId: 'GEL_COLONY' }, preOrganismFlipRegistry()); // B02, V01, no V02 (the manifest before the organism flip, D-0127)
    expect(w.species.some((sp) => sp.id === 'V02')).toBe(false);
    const s = place(w, 'B02', GX + 0.5, GY + 0.5);
    w.ents.cols.infectedBy[s] = 2;
    await expect(buildSaveFile(w, meta).then((f) => loadSaveFile(f.text))).rejects.toThrow(/An organism is infected by a virus this dish does not have\./);
  });
});
