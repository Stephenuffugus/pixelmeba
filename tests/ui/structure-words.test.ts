/**
 * P5.1/P5.2 outcome words (src/ui/strings/structures.ts structureOutcome; strings/lab.ts skippedText and
 * missingText): every new command kind's sentence for accepted, partial and refused-whole results, each
 * refused reason, the exported and severed words, skippedText's device and barrier parts (absent when 0),
 * and no internal code (S01…, E01…) ever reaching the player except through a content name.
 */
import { describe, expect, it } from 'vitest';
import type { CommandPayload, CommandResult } from '../../src/sim/commands';
import { habitatEditOutcome } from '../../src/ui/strings/lab';
import { structureOutcome } from '../../src/ui/strings/structures';

const CODE = /\b[SE]\d\d\b/;
const say = (p: CommandPayload, r: CommandResult, ctx = {}) => {
  const text = structureOutcome(p, r, ctx);
  expect(text).not.toBeNull();
  expect(text!).not.toMatch(CODE);
  return text!;
};

const membrane: CommandPayload = { kind: 'placeEdges', structure: 'S01', edges: [[100, 'R']] };

describe('placeEdges', () => {
  it('accepted, partial with every reason, severed', () => {
    expect(say(membrane, { accepted: 6, rejected: 0, ids: [1, 2, 3, 4, 5, 6] })).toBe('Placed a fine membrane on 6 edges.');
    expect(say(membrane, { accepted: 6, rejected: 3, refused: { rim: 2, barrier: 1 } })).toBe(
      'Placed a fine membrane on 6 edges. Skipped: 2 were on the rim; 1 already had a barrier.',
    );
    expect(say(membrane, { accepted: 1, rejected: 4, refused: { rim: 1, structure: 1, barrier: 1, cap: 1 } })).toBe(
      'Placed a fine membrane on 1 edge. Skipped: 1 was on the rim; 1 was next to a stone or wall; 1 already had a barrier; 1 would pass the dish’s limit of 512 edge barriers.',
    );
    const channel: CommandPayload = { kind: 'placeEdges', structure: 'S04', edges: [[100, 'R']], flow: 1 };
    expect(say(channel, { accepted: 0, rejected: 2, refused: { channel: 2 }, note: 'nothing placed' })).toBe(
      'Nothing placed. Skipped: 2 were not between two open water cells (a one-way channel joins two open water cells).',
    );
    expect(say(membrane, { accepted: 3, rejected: 0, severed: 2 })).toBe('Placed a fine membrane on 3 edges. 2 links were cut by the barrier.');
    expect(say(membrane, { accepted: 3, rejected: 0, severed: 1 })).toContain('1 link was cut by the barrier.');
    const shutter: CommandPayload = { kind: 'placeEdges', structure: 'S03', edges: [[100, 'R']], open: false };
    expect(say(shutter, { accepted: 2, rejected: 0 })).toBe('Placed a shutter gate (closed) on 2 edges.');
    expect(say({ ...shutter, open: true }, { accepted: 1, rejected: 0 })).toBe('Placed a shutter gate (open) on 1 edge.');
  });

  it('refused whole: not in this dish, and a malformed stroke', () => {
    expect(say(membrane, { accepted: 0, rejected: 0, note: 'S01 is not in this dish' })).toBe('Not changed: Fine membrane is not in this dish’s recorded content.');
    expect(say(membrane, { accepted: 0, rejected: 0, note: 'repeated edge' })).toBe('Not changed: repeated edge.');
    expect(say(membrane, { accepted: 0, rejected: 0, note: 'unknown edge barrier S07' })).toBe('Not changed: unknown edge barrier Nutrient basket.');
  });
});

describe('placeDevice', () => {
  const heater: CommandPayload = { kind: 'placeDevice', structure: 'S09', cell: 5000 };
  it('accepted (Off), each refusal, not in this dish', () => {
    expect(say(heater, { accepted: 1, rejected: 0, ids: [4] })).toBe('Placed a heater. It starts Off; turn it On in its settings.');
    expect(say({ kind: 'placeDevice', structure: 'S08', cell: 5000 }, { accepted: 1, rejected: 0 })).toBe(
      'Placed an adsorption resin. It starts Off: choose what it removes in its settings.',
    );
    expect(say({ kind: 'placeDevice', structure: 'S05', cell: 5000 }, { accepted: 1, rejected: 0 })).toBe('Placed a porous shelter.');
    expect(say(heater, { accepted: 0, rejected: 1, refused: { rim: 1 }, note: 'nothing placed' })).toBe('Not placed: that cell is outside the rim.');
    expect(say(heater, { accepted: 0, rejected: 1, refused: { structure: 1 }, note: 'nothing placed' })).toBe('Not placed: a stone, wall or bead is in that cell.');
    expect(say(heater, { accepted: 0, rejected: 1, refused: { device: 1 }, note: 'nothing placed' })).toBe('Not placed: that cell already has a furnishing or device.');
    expect(say(heater, { accepted: 0, rejected: 1, refused: { cap: 1 }, note: 'nothing placed' })).toBe('Not placed: the dish already holds 256 furnishings and devices.');
    expect(say(heater, { accepted: 0, rejected: 0, note: 'S09 is not in this dish' })).toBe('Not changed: Heater is not in this dish’s recorded content.');
  });
});

describe('removeStructures', () => {
  const p: CommandPayload = { kind: 'removeStructures', ids: [3, 4, 9] };
  it('removed, partly gone, the resin export and the basket', () => {
    expect(say(p, { accepted: 3, rejected: 0, ids: [3, 4, 9] })).toBe('Removed 3 structures.');
    expect(say(p, { accepted: 2, rejected: 1, refused: { missing: 1 }, ids: [3, 4] })).toBe('Removed 2 structures. 1 was already gone.');
    expect(say(p, { accepted: 1, rejected: 0, ids: [3], exported: { rival: 1.2 } }, { kinds: ['S08'] })).toBe(
      'Removed 1 structure. The resin held 1.20 units of rivalry chemical; it left the dish with the resin.',
    );
    expect(say(p, { accepted: 1, rejected: 0, exported: { inhBact: 0.5, rival: 1 } })).toContain(
      'The resin held 0.50 units of bacterial inhibitor and 1.00 unit of rivalry chemical; they left the dish with the resin.',
    );
    expect(say(p, { accepted: 1, rejected: 0 }, { kinds: ['S07'] })).toBe('Removed 1 structure. A basket’s food object stays in its cell.');
    expect(say(p, { accepted: 0, rejected: 3, refused: { missing: 3 }, note: 'nothing removed' })).toBe('Nothing removed. 3 were already gone.');
    expect(say(p, { accepted: 0, rejected: 0, note: 'structures are not in this dish' })).toBe(
      'Not changed: Furnishings, devices and edge barriers are not in this dish’s recorded content.',
    );
    expect(say(p, { accepted: 0, rejected: 0, note: 'S08 is not in this dish' })).toBe('Not changed: Adsorption resin is not in this dish’s recorded content.');
  });
});

describe('moveDevice', () => {
  const p: CommandPayload = { kind: 'moveDevice', id: 4, cell: 130 };
  it('moved, each refusal, unchanged, an edge', () => {
    expect(say(p, { accepted: 1, rejected: 0 }, { kinds: ['S09'], cell: 130 })).toBe('Moved the heater to cell 2, 1.');
    expect(say(p, { accepted: 1, rejected: 0 }, { kinds: ['S07'], cell: 130 })).toBe('Moved the nutrient basket to cell 2, 1. Its food object moved with it.');
    expect(say(p, { accepted: 0, rejected: 1, refused: { object: 1 }, note: 'not moved' }, { kinds: ['S07'] })).toBe(
      'Not moved: the basket carries a food object and that cell already holds one.',
    );
    expect(say(p, { accepted: 0, rejected: 1, refused: { device: 1 }, note: 'not moved' })).toBe('Not moved: that cell already has a furnishing or device.');
    expect(say(p, { accepted: 0, rejected: 1, refused: { structure: 1 }, note: 'not moved' })).toBe('Not moved: a stone, wall or bead is in that cell.');
    expect(say(p, { accepted: 0, rejected: 1, refused: { missing: 1 }, note: 'no such structure' })).toBe('Not moved: it is no longer in the dish.');
    expect(say(p, { accepted: 0, rejected: 0, note: 'unchanged' }, { kinds: ['S09'] })).toBe('Not moved: the heater is already in that cell.');
    expect(say(p, { accepted: 0, rejected: 0, note: 'an edge barrier cannot be moved' })).toBe('Not moved: an edge barrier cannot be moved.');
  });
});

describe('setDevice', () => {
  it('on, off, open, closed (severed), resin selection, unchanged', () => {
    expect(say({ kind: 'setDevice', id: 4, on: true }, { accepted: 1, rejected: 0 }, { kinds: ['S09'] })).toBe('Heater On.');
    expect(say({ kind: 'setDevice', id: 4, on: false }, { accepted: 1, rejected: 0 }, { kinds: ['S10'] })).toBe('Cooler Off.');
    expect(say({ kind: 'setDevice', id: 4, open: true }, { accepted: 1, rejected: 0 }, { kinds: ['S03'] })).toBe(
      'Shutter gate open: everything crosses that edge as if it were empty.',
    );
    expect(say({ kind: 'setDevice', id: 4, open: false }, { accepted: 1, rejected: 0, severed: 1 }, { kinds: ['S03'] })).toBe(
      'Shutter gate closed: nothing crosses that edge now. 1 link was cut by the barrier.',
    );
    expect(say({ kind: 'setDevice', id: 4, resinSelect: ['inhBact', 'rival'] }, { accepted: 1, rejected: 0 }, { kinds: ['S08'] })).toBe(
      'Adsorption resin now removes bacterial inhibitor and rivalry chemical.',
    );
    expect(say({ kind: 'setDevice', id: 4, resinSelect: [] }, { accepted: 1, rejected: 0 }, { kinds: ['S08'] })).toBe(
      'Adsorption resin Off: it removes nothing now; what it holds stays bound.',
    );
    expect(say({ kind: 'setDevice', id: 4, on: true }, { accepted: 0, rejected: 0, note: 'unchanged' }, { kinds: ['S09'] })).toBe(
      'Heater: already set that way; nothing changed.',
    );
    expect(say({ kind: 'setDevice', id: 4, on: true }, { accepted: 0, rejected: 0, note: 'S08 has no on setting' })).toBe(
      'Not changed: Adsorption resin has no on setting.',
    );
  });
});

describe('climate commands', () => {
  it('wetBrush, setLightMode, setDrying', () => {
    const wet: CommandPayload = { kind: 'wetBrush', points: [[60, 60]], radius: 3 };
    expect(say(wet, { accepted: 12, rejected: 17 })).toBe('Moisture set to 0.9 on 12 cells. Water cells are always wet.');
    expect(say(wet, { accepted: 1, rejected: 0 })).toBe('Moisture set to 0.9 on 1 cell.');
    expect(say(wet, { accepted: 0, rejected: 29, note: 'nothing wetted' })).toBe('Nothing wetted: water cells are always wet.');
    expect(say(wet, { accepted: 0, rejected: 0, note: 'climate is not in this dish' })).toBe(
      'Not changed: Climate (the light cycle, drying and the wetting brush) is not in this dish’s recorded content.',
    );
    expect(say({ kind: 'setLightMode', mode: 'cycle' }, { accepted: 1, rejected: 0 })).toBe(
      'Day and night: 90 s day, 30 s dusk, 90 s night, 30 s dawn. The cycle starts now.',
    );
    expect(say({ kind: 'setLightMode', mode: 'fixed' }, { accepted: 0, rejected: 0, note: 'unchanged' })).toBe('Light is already fixed.');
    expect(say({ kind: 'setDrying', drying: true }, { accepted: 1, rejected: 0 })).toBe(
      'Drying: uncovered gel and sediment lose 0.001 moisture per second down to 0.1; it never concentrates chemicals.',
    );
    expect(say({ kind: 'setDrying', drying: false }, { accepted: 1, rejected: 0 })).toBe('Drying off: moisture stays where it is now.');
  });

  it('other kinds are not structure words', () => {
    expect(structureOutcome({ kind: 'setLid', lid: 'open' }, { accepted: 1, rejected: 0 })).toBeNull();
  });
});

describe('skippedText learns device and barrier', () => {
  const paint: CommandPayload = { kind: 'paintSubstrate', substrate: 'gel', points: [[60, 60]], radius: 3 };
  it('present only when > 0', () => {
    const base = { rim: 0, structure: 0, organism: 0, enclosed: 0 };
    expect(habitatEditOutcome(paint, { accepted: 4, rejected: 0, skipped: base }, 'gel')).toBe('Painted gel on 4 cells.');
    expect(habitatEditOutcome(paint, { accepted: 4, rejected: 0, skipped: { ...base, device: 0, barrier: 0 } }, 'gel')).toBe('Painted gel on 4 cells.');
    expect(habitatEditOutcome(paint, { accepted: 4, rejected: 3, skipped: { ...base, device: 2, barrier: 1 } }, 'gel')).toBe(
      'Painted gel on 4 cells. Skipped: 2 held a furnishing or device; 1 was a side of a one-way channel.',
    );
    expect(habitatEditOutcome(paint, { accepted: 0, rejected: 3, skipped: { ...base, barrier: 3 } }, 'gel')).toBe(
      'Nothing painted. Skipped: 3 were sides of a one-way channel.',
    );
  });

  it('habitatEditOutcome words a structure kind through structureOutcome, and its missing text names content', () => {
    expect(habitatEditOutcome(membrane, { accepted: 0, rejected: 0, note: 'S01 is not in this dish' })).toBe(
      'Not changed: Fine membrane is not in this dish’s recorded content.',
    );
    expect(habitatEditOutcome(membrane, { accepted: 2, rejected: 0 })).toBe('Placed a fine membrane on 2 edges.');
  });
});
