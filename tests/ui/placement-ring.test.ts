/**
 * P4.13 the placement ring maps to real state (UX §7.1; CLAUDE.md "Every visible feature maps to real
 * state"): src/ui/state.ts reportCommand draws a ring only when the command placed something
 * (res.accepted > 0), at the dose's centre and radius. Before P4.13 a refused placement drew a ring.
 * Checked to fail without the mechanism: with the `res.accepted > 0` guards removed, the refused cases
 * see a ring.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { reportCommand } from '../../src/ui/state';
import { reportSpecimenPlacement } from '../../src/ui/panels/LineageState';
import { SPECIMEN_RADIUS } from '../../src/sim/specimens';
import type { CommandPayload, CommandResult } from '../../src/sim/commands';
import type { DishInfo } from '../../src/worker/protocol';

const info = {
  dishId: 'd',
  speciesIds: ['B01', 'V01'],
  speciesNames: ['Sprinter', 'Pinphage'],
  speciesDiets: [{ metabolism: 'heterotroph' }, { metabolism: 'viral' }],
  materials: [{ id: 'SUGAR', name: 'Sugar' }],
} as unknown as DishInfo;

const result = (accepted: number, extra: Partial<CommandResult> = {}): CommandResult =>
  ({ accepted, rejected: 0, ...extra });

function ringFor(payload: CommandPayload, res: CommandResult) {
  const ring = { placementRing: vi.fn() };
  reportCommand(info, payload, res, ring);
  return ring.placementRing;
}

describe('placement ring only for an accepted placement (P4.13)', () => {
  const feed: CommandPayload = { kind: 'deposit', materialId: 'SUGAR', points: [[40.5, 52.5]], radius: 3, dose: 0.1 };
  const life: CommandPayload = { kind: 'inoculate', speciesId: 'B01', x: 20.5, y: 30.5, radius: 2, count: 5 };
  const phage: CommandPayload = { kind: 'inoculate', speciesId: 'V01', x: 70.5, y: 60.5, radius: 1, count: 50 };

  it('accepted 0 → no ring (food, life, a phage dose)', () => {
    expect(ringFor(feed, result(0))).not.toHaveBeenCalled();
    expect(ringFor(life, result(0))).not.toHaveBeenCalled();
    expect(ringFor(life, result(0, { note: 'capacity' }))).not.toHaveBeenCalled();
    expect(ringFor(phage, result(0))).not.toHaveBeenCalled();
  });

  it('accepted > 0 → one ring at the dose centre and radius', () => {
    const f = ringFor(feed, result(29));
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith(40.5, 52.5, 3);
    const l = ringFor(life, result(5));
    expect(l).toHaveBeenCalledTimes(1);
    expect(l).toHaveBeenCalledWith(20.5, 30.5, 2);
    const p = ringFor(phage, result(1));
    expect(p).toHaveBeenCalledWith(70.5, 60.5, 1);
  });

  it('no answer (null) → nothing', () => {
    const ring = { placementRing: vi.fn() };
    reportCommand(info, feed, null, ring);
    expect(ring.placementRing).not.toHaveBeenCalled();
  });
});

describe('a specimen placement draws its ring only when something was placed (D-0095)', () => {
  it('accepted 0 → no ring (no room, a full dish); accepted > 0 → one ring at the tap and the specimen radius', () => {
    for (const res of [{ accepted: 0 }, { accepted: 0, note: 'capacity' }]) {
      const ring = { placementRing: vi.fn() };
      reportSpecimenPlacement(res, 'Branch 3', 10.5, 20.5, ring);
      expect(ring.placementRing).not.toHaveBeenCalled();
    }
    const ring = { placementRing: vi.fn() };
    reportSpecimenPlacement({ accepted: 4 }, 'Branch 3', 10.5, 20.5, ring);
    expect(ring.placementRing).toHaveBeenCalledTimes(1);
    expect(ring.placementRing).toHaveBeenCalledWith(10.5, 20.5, SPECIMEN_RADIUS);
  });

  it('placeSpecimenTap reports through reportSpecimenPlacement and draws no ring of its own (integration verifier)', () => {
    const src = readFileSync('src/ui/panels/LineageState.tsx', 'utf8');
    const body = src.slice(src.indexOf('export function placeSpecimenTap'), src.indexOf('export function reportSpecimenPlacement'));
    expect(body).toContain('reportSpecimenPlacement(res, p.label, wx, wy, getRenderer());');
    expect(body).not.toContain('placementRing(');
  });
});
