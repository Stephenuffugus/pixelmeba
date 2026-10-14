/**
 * P5.2 gate inspector table (src/ui/strings/structures.ts gateRows, channelLine, gateTotalsText): every row
 * for every edge code equals barriers.ts edgeFactor / edgePermits (the CT §5.3 table's single source), the
 * S04 directed line, and the measured-totals sentence for a null, a zero and a non-zero tally.
 */
import { describe, expect, it } from 'vitest';
import {
  EDGE_CHANNEL,
  EDGE_NONE,
  EDGE_S01,
  EDGE_S02,
  EDGE_SHUTTER_CLOSED,
  EDGE_SHUTTER_OPEN,
  edgeFactor,
  edgePermits,
} from '../../src/sim/barriers';
import { channelLine, GATE_FIELD_ROWS, GATE_ORGANISM_ROWS, gateRows, gateTotalsText } from '../../src/ui/strings/structures';

const CODES = [EDGE_NONE, EDGE_S01, EDGE_S02, EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN, EDGE_CHANNEL];
const name = (id: string) => ({ sugar: 'sugar', oxygen: 'oxygen' })[id] ?? id;

describe('gate table rows', () => {
  it('every row of every edge code is the barriers.ts table', () => {
    for (const code of CODES) {
      const rows = gateRows(code);
      expect(rows.fields.map((r) => r.label)).toEqual(['Dissolved', 'Activity', 'Viral']);
      expect(rows.organisms.map((r) => r.label)).toEqual(['Small', 'Medium', 'Large', 'Fixed']);
      GATE_FIELD_ROWS.forEach((r, i) => expect(rows.fields[i]!.value).toBe(`${Math.round(edgeFactor(code, r.cls) * 100)} %`));
      // Fixed things never move: 'Stays put' where the edge would let them through (D-0120).
      GATE_ORGANISM_ROWS.forEach((r, i) =>
        expect(rows.organisms[i]!.value).toBe(edgePermits(code, r.cls) ? (r.cls === 'fixed' ? 'Stays put' : 'Passes') : 'Blocked'),
      );
    }
  });

  it('reads as CT §5.3 for the membrane and the small gate', () => {
    const s01 = gateRows(EDGE_S01);
    expect(s01.fields.map((r) => r.value)).toEqual(['25 %', '25 %', '0 %']);
    expect(s01.organisms.map((r) => r.value)).toEqual(['Blocked', 'Blocked', 'Blocked', 'Blocked']);
    const s02 = gateRows(EDGE_S02);
    expect(s02.fields.map((r) => r.value)).toEqual(['50 %', '50 %', '50 %']);
    expect(s02.organisms.map((r) => r.value)).toEqual(['Passes', 'Blocked', 'Blocked', 'Blocked']);
    expect(gateRows(EDGE_SHUTTER_CLOSED).fields.map((r) => r.value)).toEqual(['0 %', '0 %', '0 %']);
    expect(gateRows(EDGE_SHUTTER_OPEN).fields.map((r) => r.value)).toEqual(['100 %', '100 %', '100 %']);
  });
});

describe('the channel line', () => {
  it('names the receiving side', () => {
    expect(channelLine({ side: 'E', flow: 'out' })).toBe(
      'Only the directed transfer crosses: 2 % of dissolved and viral pools per second toward the cell to the right, and one small free organism per second.',
    );
    expect(channelLine({ side: 'S', flow: 'in' })).toContain('toward this cell (from the cell below)');
  });
});

describe('measured totals', () => {
  it('null: nothing has crossed yet', () => {
    expect(gateTotalsText(null, name)).toBe('Nothing has crossed yet.');
  });
  it('zero: nothing has crossed yet', () => {
    expect(gateTotalsText({ fields: { sugar: 0 }, organisms: 0 }, name)).toBe('Nothing has crossed yet.');
    expect(gateTotalsText({ fields: {}, organisms: 0 }, name)).toBe('Nothing has crossed yet.');
  });
  it('non-zero: amounts and crossings from the tally', () => {
    expect(gateTotalsText({ fields: { sugar: 0.4213, oxygen: 1.5 }, organisms: 0 }, name)).toBe(
      'Measured since this barrier was placed: sugar 0.42 and oxygen 1.50 moved across; 0 organisms crossed.',
    );
    expect(gateTotalsText({ fields: {}, organisms: 3 }, name)).toBe(
      'Measured since this barrier was placed: nothing dissolved moved across; 3 organisms crossed.',
    );
    expect(gateTotalsText({ fields: { sugar: 0.001 }, organisms: 1 }, name)).toBe(
      'Measured since this barrier was placed: sugar less than 0.01 moved across; 1 organism crossed.',
    );
  });
});
