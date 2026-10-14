/**
 * Environmental suitability (SPEC §6.3). Linear shoulders outside the preferred range; combined as
 * min(pH, warmth, salinity) × habitat × inhibitor growth factor × moisture × special factors.
 */
import { R } from './reasons';
import type { Profile } from './phenotype';
import type { SpeciesRT } from './species';
import { habitatBit } from './species';
import { ST_BEAD, ST_NONE } from './grid';
import { attachmentBits, onAttachmentSurface } from './attachment';
import { RIVAL_EXPOSURE_FACTOR } from './constants';
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

/**
 * Whether a species can live in a cell (SPEC §2.2, §6.3): no structure in the way (a porous bead admits
 * attached organisms only), a substrate among its recorded habitats, and, for a species whose record
 * lists attachment surfaces, one of those surfaces in the cell (attachment.ts; D-0006, P3.2), so plain
 * open water is off-limits to it. Free-living species (attachment null) never reach the surface rule,
 * so worlds without attached species keep their recorded behaviour exactly. grid.ts lifeCellOutcome
 * states the same rule for the Life brush preview.
 */
export function habitatCompatible(world: World, sp: SpeciesRT, cell: number): boolean {
  const st = world.grid.structure[cell]!;
  if (st !== ST_NONE && !(st === ST_BEAD && sp.attached)) return false;
  if ((sp.habitatMask & habitatBit(world.grid.substrate[cell]!)) === 0) return false;
  const bits = attachmentBits(sp.def);
  return bits < 0 || onAttachmentSurface(world, bits, cell);
}

/**
 * An organism's inhibitor exposure in `cell` (SPEC §4.3; CT §3.4): the inhibitor that targets its category,
 * plus 0.25 × RIVAL for a RIVAL target (B01, B10, B11; Phase 5 wave 11, rivalry.ts) in a world with the RIVAL
 * field, then × 0.5 once when the cell holds film. Every other species, and every world without the RIVAL
 * field, runs exactly the old operations.
 */
export function inhibitorExposure(world: World, sp: SpeciesRT, cell: number): number {
  let exposure = 0;
  if (sp.inhibitorField) {
    const f = world.fields[sp.inhibitorField];
    if (f) exposure += f[cell]!;
  }
  if (sp.rivalTarget) {
    const r = world.fields.rival;
    if (r) exposure += RIVAL_EXPOSURE_FACTOR * r[cell]!;
  }
  const film = world.fields.film;
  if (film && film[cell]! > 0 && exposure > 0) exposure *= 0.5;
  return exposure;
}

/**
 * Whether the RIVAL term of a target's exposure is larger than its inhibitor part (Phase 5 wave 11; PROPOSED
 * DECISION D-0119: the reason is RIVAL_EXPOSURE then, else INHIBITOR_EXPOSURE). Film halves both parts alike,
 * so the comparison is made before it. Computed only for a RIVAL target in a world with the RIVAL field.
 */
function rivalLeads(world: World, sp: SpeciesRT, cell: number): boolean {
  if (!sp.rivalTarget) return false;
  const r = world.fields.rival;
  if (!r) return false;
  const f = sp.inhibitorField ? world.fields[sp.inhibitorField] : undefined;
  return RIVAL_EXPOSURE_FACTOR * r[cell]! > (f ? f[cell]! : 0);
}

/**
 * Compute suitability for a species/profile at a cell. Returns a shared result object; copy the
 * fields you need before calling again. `habitatOk`, when given, replaces habitatCompatible as the
 * habitat factor: the entity-aware check of src/sim/crossing.ts (P04 crossing open water, W2-11).
 * Omitted, the result is exactly the species' habitat rule.
 */
export function suitabilityAt(world: World, sp: SpeciesRT, prof: Profile, cell: number, habitatOk?: boolean): SuitResult {
  if (!(habitatOk ?? habitatCompatible(world, sp, cell))) {
    out.value = 0;
    out.reason = R.SUIT_HABITAT;
    out.exposure = 0;
    return out;
  }
  const d = world.derived;
  const rPh = response(d.ph[cell]!, prof.ph[0], prof.ph[1], SHOULDER_PH);
  // Local warmth (SPEC §4.7, Phase 5) once the climate stage allocated it; the ambient setting until then.
  const wa = world.climate.warmth;
  const warmth = wa === null ? world.settings.warmth : wa[cell]!;
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
    if (gf < v) reason = rivalLeads(world, sp, cell) ? R.RIVAL_EXPOSURE : R.INHIBITOR_EXPOSURE;
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
