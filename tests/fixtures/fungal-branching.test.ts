/**
 * P3.3 fungal branching (SPEC §2.5, §6.9, §7.2; CT §1 F01, §14; ARCH §10.1; src/sim/fungi.ts,
 * src/sim/births.ts).
 *
 *  - Placement ranks the free four-neighbour cells by usable food (film included for a film
 *    digester), then suitability, then E, S, W, N: each key decides a case, and food outranks
 *    suitability.
 *  - A daughter never lands in open water, on a diagonal, in the parent's cell or on a fungal segment
 *    (including one placed earlier in the same stage).
 *  - A blocked placement keeps the proposal and charges nothing; when a cell frees, the kept proposal
 *    commits.
 *  - At 2,000 living segments, fungal births get DIV_BLOCK_CAPACITY with the capacity flag and fungal
 *    introductions are refused (counted as rejected); nothing dies; other species are unaffected.
 *  - Every division links parent and daughter (LINK_VISUAL for F01); killing a segment removes its
 *    links; linksValid holds after every tick of a branching run.
 *  - Segments and connected threads are counted separately (fungalNetwork, the inspector's line).
 *
 * Worlds: Empty Gel Colony under the shipped manifest (water channel x 59–68), background sugar
 * zeroed; F01 state (B, E, age) set directly and logged as inputs (tests/helpers/world.ts place).
 */
import { describe, expect, it } from 'vitest';
import { applyNow } from '../../src/sim/commands';
import { FUNGAL_CAP } from '../../src/sim/constants';
import { FLAG } from '../../src/sim/entities';
import { fungalNetwork, fungalSegmentCount } from '../../src/sim/fungi';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import {
  fungalComponent,
  fungalDegree,
  fungalLinkKind,
  fungalNeighbors,
  LINK_VISUAL,
  linksValid,
} from '../../src/sim/links';
import { killEntity } from '../../src/sim/maintenance';
import { R } from '../../src/sim/reasons';
import { realizeRecipe, withHabitatOverride } from '../../src/sim/recipes';
import { entityCell } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { aliveOf, fillField, place, registry, setField } from '../helpers/world';

const PX = 30;
const PY = 64;
const P = cellIndex(PX, PY);
const E_ = cellIndex(PX + 1, PY);
const S_ = cellIndex(PX, PY + 1);
const W_ = cellIndex(PX - 1, PY);
const N_ = cellIndex(PX, PY - 1);

function gel(): World {
  const reg = registry();
  const r = withHabitatOverride(reg.recipes.FIRST_DISH_V1!, 'GEL_COLONY');
  const w = realizeRecipe(
    reg,
    { ...r, founders: [], fieldPatches: [], scheduledCommands: [], mutationPreset: 'fixed' },
    { worldId: 'fungi-test' },
  );
  fillField(w, 'sugar', 0);
  return w;
}

/** An F01 ready to divide (B ≥ 2 B0′, E ≥ 60, age past its minimum) at the centre of (x, y). */
function ready(w: World, x: number, y: number): number {
  return place(w, 'F01', x + 0.5, y + 0.5, { B: 4.2, E: 80, age: 100 });
}

/** An F01 segment that will not divide this tick. */
function segment(w: World, x: number, y: number): number {
  return place(w, 'F01', x + 0.5, y + 0.5);
}

/** Step once; the F01 slots that are new this tick, with the cell each sits in. */
function stepNew(w: World): { slot: number; cell: number }[] {
  const before = new Set(aliveOf(w, 'F01'));
  step(w);
  return aliveOf(w, 'F01')
    .filter((s) => !before.has(s))
    .map((slot) => ({ slot, cell: entityCell(w.ents.cols.x[slot]!, w.ents.cols.y[slot]!) }));
}

function isFourNeighbour(a: number, b: number): boolean {
  const dx = Math.abs((a % 128) - (b % 128));
  const dy = Math.abs(Math.floor(a / 128) - Math.floor(b / 128));
  return dx + dy === 1;
}

describe('P3.3 fungal placement ranking', () => {
  it('order decides when food and suitability tie: E first', () => {
    const w = gel();
    const p = ready(w, PX, PY);
    const born = stepNew(w);
    expect(born.map((b) => b.cell)).toEqual([E_]);
    expect(fungalNeighbors(w, p)).toEqual([born[0]!.slot]);
  });

  it('usable food decides: the richest neighbour wins over the fixed order', () => {
    const w = gel();
    setField(w, 'detritus', W_, 0.2);
    setField(w, 'detritusN', W_, 0.02);
    ready(w, PX, PY);
    expect(stepNew(w).map((b) => b.cell)).toEqual([W_]);
  });

  it('film counts as usable food for a film digester', () => {
    const w = gel();
    setField(w, 'film', S_, 0.2);
    setField(w, 'filmN', S_, 0.02);
    ready(w, PX, PY);
    expect(stepNew(w).map((b) => b.cell)).toEqual([S_]);
  });

  it('suitability decides when food ties', () => {
    const w = gel();
    for (const cell of [E_, S_, W_]) setField(w, 'inhFung', cell, 0.5);
    ready(w, PX, PY);
    expect(stepNew(w).map((b) => b.cell)).toEqual([N_]);
  });

  it('food outranks suitability', () => {
    const w = gel();
    setField(w, 'inhFung', E_, 0.5);
    setField(w, 'detritus', E_, 0.05);
    setField(w, 'detritusN', E_, 0.005);
    ready(w, PX, PY);
    expect(stepNew(w).map((b) => b.cell)).toEqual([E_]);
  });
});

describe('P3.3 where a daughter may land', () => {
  it('never in open water, even when the water cell holds the most food', () => {
    const w = gel();
    const x = 58; // gel; x 59 is the water channel
    setField(w, 'detritus', cellIndex(59, PY), 0.3);
    setField(w, 'detritusN', cellIndex(59, PY), 0.03);
    ready(w, x, PY);
    expect(stepNew(w).map((b) => b.cell)).toEqual([cellIndex(x, PY + 1)]);
  });

  it('never on a fungal segment: the occupied E neighbour is skipped', () => {
    const w = gel();
    segment(w, PX + 1, PY);
    ready(w, PX, PY);
    expect(stepNew(w).map((b) => b.cell)).toEqual([S_]);
  });

  it('never on a cell another parent filled earlier in the same stage', () => {
    const w = gel();
    const mid = cellIndex(PX + 1, PY);
    setField(w, 'detritus', mid, 0.3);
    setField(w, 'detritusN', mid, 0.03);
    ready(w, PX, PY);
    ready(w, PX + 2, PY);
    const cells = stepNew(w).map((b) => b.cell);
    expect(cells).toHaveLength(2);
    expect(cells).toContain(mid);
    expect(new Set(cells).size).toBe(2);
  });

  it('never on a diagonal or in the parent cell: with its four neighbours taken it is blocked at no cost, and the kept proposal commits once a cell frees', () => {
    const w = gel();
    const c = w.ents.cols;
    const others = [
      segment(w, PX + 1, PY),
      segment(w, PX, PY + 1),
      segment(w, PX - 1, PY),
      segment(w, PX, PY - 1),
    ];
    // Food on the diagonals and in its own cell: tempting, but not candidates.
    for (const cell of [
      P,
      cellIndex(PX + 1, PY + 1),
      cellIndex(PX - 1, PY - 1),
      cellIndex(PX + 1, PY - 1),
      cellIndex(PX - 1, PY + 1),
    ]) {
      setField(w, 'detritus', cell, 0.3);
      setField(w, 'detritusN', cell, 0.03);
    }
    const p = ready(w, PX, PY);
    const division0 = w.ledger.energy.division;
    for (let t = 0; t < 3; t++) {
      expect(stepNew(w)).toEqual([]);
      expect(c.divBlockCode[p]).toBe(R.DIV_BLOCK_PLACEMENT);
    }
    expect(c.propG0[p]).toBeGreaterThanOrEqual(0);
    const kept = [c.propG0[p]!, c.propG1[p]!];
    expect(w.ledger.energy.division).toBe(division0);
    // Free the W neighbour: the kept proposal commits there, and only now is the cost charged.
    killEntity(w, others[2]!, R.DEATH_STARVATION);
    const born = stepNew(w);
    expect(born.map((b) => b.cell)).toEqual([W_]);
    expect([c.genome[p], c.genome[born[0]!.slot]]).toEqual(kept);
    expect(w.ledger.energy.division).toBeGreaterThan(division0);
    expect(linksValid(w)).toBe(true);
    expect(checkLedger(w).ok).toBe(true);
  });
});

describe('P3.3 the 2,000 fungal segment cap', () => {
  /** FUNGAL_CAP − 1 resting-size segments in gel cells away from (PX, PY), plus one ready parent there. */
  function crowded(total: number): { w: World; parent: number } {
    const w = gel();
    const parent = ready(w, PX, PY);
    let n = 1;
    for (const cell of maskCells()) {
      if (n >= total) break;
      const x = cell % 128;
      const y = Math.floor(cell / 128);
      if (w.grid.substrate[cell] !== 1 || (Math.abs(x - PX) <= 2 && Math.abs(y - PY) <= 2)) continue;
      segment(w, x, y);
      n++;
    }
    expect(fungalSegmentCount(w)).toBe(total);
    return { w, parent };
  }

  it('at 2,000 segments, fungal births and introductions are refused, nothing dies, and other species still enter', () => {
    const { w, parent } = crowded(FUNGAL_CAP);
    const c = w.ents.cols;
    expect(stepNew(w)).toEqual([]);
    expect(c.divBlockCode[parent]).toBe(R.DIV_BLOCK_CAPACITY);
    expect(c.flags[parent]! & FLAG.capacityBlocked).not.toBe(0);
    expect(c.propG0[parent]).toBe(-1); // refused before a proposal, as at the agent cap
    expect(fungalSegmentCount(w)).toBe(FUNGAL_CAP);
    const limited0 = w.capacityLimitedTicks;
    const fungal = applyNow(w, 'more-fungi', {
      kind: 'inoculate',
      speciesId: 'F01',
      x: 100.5,
      y: 64.5,
      radius: 3,
      count: 3,
    });
    expect(fungal.result).toMatchObject({ accepted: 0, rejected: 3, note: 'capacity' });
    expect(w.capacityLimitedTicks).toBe(limited0 + 1);
    expect(fungalSegmentCount(w)).toBe(FUNGAL_CAP);
    const velvet = applyNow(w, 'velvet', {
      kind: 'inoculate',
      speciesId: 'B02',
      x: 100.5,
      y: 64.5,
      radius: 3,
      count: 3,
    });
    expect(velvet.result).toMatchObject({ accepted: 3, rejected: 0 });
  });

  it('one below the cap a fungal birth commits, reaching exactly 2,000', () => {
    const { w } = crowded(FUNGAL_CAP - 1);
    expect(stepNew(w)).toHaveLength(1);
    expect(fungalSegmentCount(w)).toBe(FUNGAL_CAP);
  });
});

describe('P3.3 links and threads', () => {
  it('every division links parent and daughter; killing a segment removes its links; linksValid after every tick', () => {
    const w = gel();
    const c = w.ents.cols;
    // A detritus-rich gel patch (a segment feeds only in its own cell): three founders branch for a while.
    for (let y = PY - 8; y <= PY + 8; y++)
      for (let x = PX - 8; x <= PX + 8; x++) {
        setField(w, 'detritus', cellIndex(x, y), 6);
        setField(w, 'detritusN', cellIndex(x, y), 0.6);
      }
    ready(w, PX, PY);
    ready(w, PX - 3, PY - 3);
    ready(w, PX + 3, PY + 3);
    let divisions = 0;
    for (let t = 0; t < 1500; t++) {
      const parents = new Map<number, number>();
      for (const s of aliveOf(w, 'F01')) parents.set(s, c.birthId[s]!);
      const born = stepNew(w);
      for (const b of born) {
        divisions++;
        // Its parent is the segment whose birthId changed this tick (the retained daughter) and that it links to.
        const linked = fungalNeighbors(w, b.slot).filter(
          (p) => parents.has(p) && parents.get(p) !== c.birthId[p],
        );
        expect(linked).toHaveLength(1);
        const p = linked[0]!;
        expect(fungalLinkKind(w, p, b.slot)).toBe(LINK_VISUAL);
        expect(isFourNeighbour(entityCell(c.x[p]!, c.y[p]!), b.cell)).toBe(true);
        expect(w.grid.substrate[b.cell]).not.toBe(0);
      }
      expect(linksValid(w)).toBe(true);
      for (const s of aliveOf(w, 'F01')) expect(fungalDegree(w, s)).toBeLessThanOrEqual(4);
    }
    expect(divisions).toBeGreaterThanOrEqual(6);
    // Segments never share a cell after branching (founders were placed apart).
    const cells = aliveOf(w, 'F01').map((s) => entityCell(c.x[s]!, c.y[s]!));
    expect(new Set(cells).size).toBe(cells.length);
    // Kill one linked segment: every link to it goes, from both ends.
    const victim = aliveOf(w, 'F01').find((s) => fungalDegree(w, s) >= 1)!;
    const partners = fungalNeighbors(w, victim);
    const degrees = partners.map((p) => fungalDegree(w, p));
    killEntity(w, victim, R.DEATH_STARVATION);
    partners.forEach((p, k) => {
      expect(fungalNeighbors(w, p)).not.toContain(victim);
      expect(fungalDegree(w, p)).toBe(degrees[k]! - 1);
    });
    expect(linksValid(w)).toBe(true);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('segments and separate threads are counted apart', () => {
    const w = gel();
    const a = ready(w, PX, PY);
    const b = stepNew(w)[0]!.slot; // a–b
    const c = w.ents.cols;
    c.B[b] = 4.2;
    c.E[b] = 80;
    c.age[b] = 100;
    const d = stepNew(w)[0]!.slot; // b–d
    const lone = segment(w, PX + 20, PY);
    expect(fungalNetwork(w, a)).toEqual({ segments: 4, threads: 2, thisThread: 3 });
    expect(fungalNetwork(w, lone)).toEqual({ segments: 4, threads: 2, thisThread: 1 });
    expect(fungalComponent(w, a)).toEqual([a, b, d].sort((x, y) => x - y));
    // Breaking the middle segment splits the thread.
    killEntity(w, b, R.DEATH_STARVATION);
    expect(fungalNetwork(w, a)).toEqual({ segments: 3, threads: 3, thisThread: 1 });
    expect(fungalNetwork(w, d)).toEqual({ segments: 3, threads: 3, thisThread: 1 });
    expect(fungalNetwork(w, place(w, 'B02', PX + 0.5, PY + 0.5))).toBeNull();
  });
});
