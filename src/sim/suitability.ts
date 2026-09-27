/**
 * Environmental suitability (SPEC §6.3). Linear shoulders outside the preferred range; combined as
 * min(pH, warmth, salinity) × habitat × inhibitor growth factor × moisture × special factors.
 */
import { R } from './reasons';
import type { Profile } from './phenotype';
import type { SpeciesRT } from './species';
import { habitatBit } from './species';
import { ST_BEAD, ST_NONE } from './grid';
import type { World } from './world';

export const SHOULDER_PH = 1.0;
export const SHOULDER_WARMTH = 0.15;
export const SHOULDER_SALINITY = 0.2;
export const SHOULDER_MOISTURE = 0.2;

export function response(x: number, a: number, b: number, w: number): number {
  if (x < a) return Math.max(0, 1 - (a - x) / w);
  if (x > b) return Math.max(0, 1 - (x - b) / w);
  return 1;
}

export function responseBelowOnly(x: number, a: number, w: number): number {
  return x < a ? Math.max(0, 1 - (a - x) / w) : 1;
}

export interface SuitResult {
  value: number;
  /** Reason code of the weakest factor (R.NONE when suitability is 1). */
  reason: number;
  /** Effective inhibitor exposure (for health damage). */
  exposure: number;
}

const out: SuitResult = { value: 1, reason: 0, exposure: 0 };

export function habitatCompatible(world: World, sp: SpeciesRT, cell: number): boolean {
  const st = world.grid.structure[cell]!;
  if (st !== ST_NONE && !(st === ST_BEAD && sp.attached)) return false;
  return (sp.habitatMask & habitatBit(world.grid.substrate[cell]!)) !== 0;
}

export function inhibitorExposure(world: World, sp: SpeciesRT, cell: number): number {
  let exposure = 0;
  if (sp.inhibitorField) {
    const f = world.fields[sp.inhibitorField];
    if (f) exposure += f[cell]!;
  }
  const film = world.fields.film;
  if (film && film[cell]! > 0 && exposure > 0) exposure *= 0.5;
  return exposure;
}

/**
 * Compute suitability for a species/profile at a cell. Returns a shared result object; copy the
 * fields you need before calling again.
 */
export function suitabilityAt(world: World, sp: SpeciesRT, prof: Profile, cell: number): SuitResult {
  if (!habitatCompatible(world, sp, cell)) {
    out.value = 0;
    out.reason = R.SUIT_HABITAT;
    out.exposure = 0;
    return out;
  }
  const d = world.derived;
  const rPh = response(d.ph[cell]!, prof.ph[0], prof.ph[1], SHOULDER_PH);
  const warmth = world.settings.warmth;
  const rWarm = response(warmth, prof.warmth[0], prof.warmth[1], SHOULDER_WARMTH);
  const salt = world.fields.salt![cell]!;
  const rSal = response(salt, prof.salinity[0], prof.salinity[1], SHOULDER_SALINITY);
  let v = rPh;
  let reason = rPh < 1 ? R.SUIT_PH : R.NONE;
  if (rWarm < v) {
    v = rWarm;
    reason = R.SUIT_WARMTH;
  }
  if (rSal < v) {
    v = rSal;
    reason = R.SUIT_SALINITY;
  }
  const rMoist = responseBelowOnly(d.moisture[cell]!, prof.moisture[0], SHOULDER_MOISTURE);
  if (rMoist < 1) {
    if (rMoist < v) reason = R.SUIT_MOISTURE;
    v *= rMoist;
  }
  const exposure = inhibitorExposure(world, sp, cell);
  if (exposure > 0) {
    const gf = 1 / (1 + exposure);
    if (gf < v) reason = R.INHIBITOR_EXPOSURE;
    v *= gf;
  }
  if (sp.abilities.includes('OXYGEN_SUPPRESSED')) {
    const o2 = world.fields.oxygen![cell]!;
    const f = Math.min(1, Math.max(0, 1 - o2 / 0.4));
    if (f < 1 && f <= v) reason = R.SUIT_OXYGEN_HIGH;
    v *= f;
  }
  out.value = v;
  out.reason = v >= 1 ? R.NONE : reason;
  out.exposure = exposure;
  return out;
}
