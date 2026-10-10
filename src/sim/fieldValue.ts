/**
 * Which field-cell values a save (or a held sample) may carry.
 *
 * Fields are non-negative pools, but float roundoff in the simulation can leave an empty cell a few
 * ulps below zero: a whole-body capture splits the prey's nutrient as takeN = N*take/B, which for
 * take === B can round one ulp above N, so the overflow (N - takeN) added to an empty detritus cell is
 * about −1.4e-17 (contacts.ts consumePrey; flip verifier MAJOR, docs/reports/reviews/g3-flip). The
 * game saves that state itself, so the import must load it, unchanged, for the world to continue
 * exactly (the simulation is not altered: every recorded trajectory, g2 save and golden stays as it
 * was). FIELD_ROUNDOFF sits far above what roundoff leaves in a cell (about 1e-16) and far below any
 * real pool amount, so a damaged or edited save with a genuinely negative pool is still refused.
 */
export const FIELD_ROUNDOFF = 1e-12;

/** A finite value that is non-negative, or negative only by float roundoff (|v| ≤ FIELD_ROUNDOFF). */
export function isStorableFieldValue(v: number): boolean {
  return Number.isFinite(v) && v >= -FIELD_ROUNDOFF;
}
