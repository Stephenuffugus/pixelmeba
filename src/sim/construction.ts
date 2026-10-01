/**
 * Shared construction (SPEC §3.2 stage 8, §3.3, §7.1, §9 E10; CT §12.6; D04 §2 C08 and §9; P3.7).
 *
 * Building actions (native B02 film deposition, the E10 matrix builder) do not move material while
 * the per-organism pass runs: each submits a request {slot, cell, bodyC, energyReserved, energyPerC}
 * through ActionContext.requestConstruction, which holds the body carbon and the full energy cost
 * against the builder's later actions. After every organism has acted, this pass resolves all
 * requests at once from one snapshot:
 *
 *   per cell, ascending: headroom = max(0, FILM_CAP − film(snapshot));
 *   if Σ bodyC > headroom every request in the cell is scaled by headroom / Σ bodyC;
 *   each builder moves its accepted body C with proportional N (N × accepted / B, snapshot B and N)
 *   into film / filmN and is charged energyPerC × accepted only (ledger.energy.construction);
 *   the rest of each reservation is returned (it was never deducted).
 *
 * The carbon and nutrient moves are internal (body → film), so the material ledger is unchanged. A
 * scaled cell ends at exactly FILM_CAP: the float dust between FILM_CAP and film + Σ accepted (a few
 * ulps) is recorded in ledger.roundoff.c so the material ledger still closes exactly. Equal requests
 * get equal shares whatever their slot order. No shipped world builds yet (the film system lands with
 * P3.3), so the pass returns at once when nothing was requested.
 */
import { FILM_CAP } from './constants';
import { markField } from './transport';
import type { World } from './world';

export interface ConstructionRequest {
  readonly slot: number;
  readonly cell: number;
  /** Body carbon offered (the most this builder may convert this tick). */
  readonly bodyC: number;
  /** Energy held for the full offer (energyPerC × bodyC). */
  readonly energyReserved: number;
  /** Energy charged per carbon actually accepted. */
  readonly energyPerC: number;
}

export interface ConstructionOutcome {
  readonly slot: number;
  readonly cell: number;
  /** Body carbon moved into film. */
  readonly accepted: number;
  /** Body nutrient moved into filmN with it. */
  readonly movedN: number;
  /** Energy charged (energyPerC × accepted). */
  readonly charged: number;
  /** Reserved energy returned unused (energyReserved − charged). */
  readonly returned: number;
}

/** Most dust a scaled cell may carry before pinning to FILM_CAP (anything larger is a defect). */
const PIN_DUST_MAX = 1e-12;

/** Request indices in canonical order: cell ascending, then slot, then submission order. */
function canonicalOrder(requests: readonly ConstructionRequest[]): number[] {
  const order = requests.map((_, k) => k);
  order.sort((a, b) => requests[a]!.cell - requests[b]!.cell || requests[a]!.slot - requests[b]!.slot || a - b);
  return order;
}

/**
 * Resolve every construction request submitted in this stage (one snapshot, one commit). Returns the
 * outcome per request in canonical order (cell, slot). Throws on a malformed request or when a world
 * without the film system receives one.
 */
export function constructionPass(world: World, requests: readonly ConstructionRequest[]): ConstructionOutcome[] {
  if (requests.length === 0) return [];
  const film = world.fields.film;
  const filmN = world.fields.filmN;
  if (!film || !filmN) throw new Error('stage 8: construction requested in a world without the film system');
  const c = world.ents.cols;
  for (let k = 0; k < requests.length; k++) {
    const r = requests[k]!;
    if (c.alive[r.slot] !== 1) throw new Error(`stage 8: construction request from empty slot ${r.slot}`);
    if (!(r.bodyC > 0) || !Number.isFinite(r.bodyC)) throw new Error(`stage 8: invalid construction amount ${r.bodyC}`);
    if (!(r.energyPerC >= 0) || !Number.isFinite(r.energyPerC)) throw new Error(`stage 8: invalid construction energy rate ${r.energyPerC}`);
    if (!(r.energyReserved >= r.energyPerC * r.bodyC)) throw new Error(`stage 8: construction request from slot ${r.slot} reserves too little energy`);
    if (!(r.cell >= 0 && r.cell < film.length)) throw new Error(`stage 8: construction cell ${r.cell} is outside the grid`);
  }
  const order = canonicalOrder(requests);

  // Read phase: every amount from the snapshot (film, B, N before any commit).
  const n = order.length;
  const accepted = new Float64Array(n);
  const movedN = new Float64Array(n);
  /** Per group start: whether the cell was scaled (pin to FILM_CAP) and the snapshot film. */
  const groupStart: number[] = [];
  const groupScaled: boolean[] = [];
  let k = 0;
  while (k < n) {
    const cell = requests[order[k]!]!.cell;
    let end = k;
    let sum = 0;
    while (end < n && requests[order[end]!]!.cell === cell) {
      sum += requests[order[end]!]!.bodyC;
      end++;
    }
    const headroom = Math.max(0, FILM_CAP - film[cell]!);
    const scaled = sum > headroom;
    const scale = scaled ? headroom / sum : 1;
    for (let q = k; q < end; q++) {
      const r = requests[order[q]!]!;
      const a = scaled ? r.bodyC * scale : r.bodyC;
      accepted[q] = a;
      movedN[q] = (c.N[r.slot]! * a) / c.B[r.slot]!;
    }
    groupStart.push(k);
    groupScaled.push(scaled);
    k = end;
  }

  // Commit phase: all moves together.
  const EL = world.ledger.energy;
  const out: ConstructionOutcome[] = [];
  for (let g = 0; g < groupStart.length; g++) {
    const start = groupStart[g]!;
    const end = g + 1 < groupStart.length ? groupStart[g + 1]! : n;
    const cell = requests[order[start]!]!.cell;
    for (let q = start; q < end; q++) {
      const r = requests[order[q]!]!;
      const a = accepted[q]!;
      const dn = movedN[q]!;
      const charged = r.energyPerC * a;
      if (a > 0) {
        c.B[r.slot]! -= a;
        c.N[r.slot]! -= dn;
        film[cell]! += a;
        filmN[cell]! += dn;
      }
      if (charged > 0) {
        c.E[r.slot]! -= charged;
        EL.construction += charged;
      }
      out.push({ slot: r.slot, cell, accepted: a, movedN: dn, charged, returned: r.energyReserved - charged });
    }
    if (groupScaled[g]) {
      const dust = FILM_CAP - film[cell]!;
      if (Math.abs(dust) > PIN_DUST_MAX) throw new Error(`stage 8: film in cell ${cell} missed the cap by ${dust} — allocation defect`);
      film[cell] = FILM_CAP;
      world.ledger.roundoff.c += dust;
    }
  }
  markField(world, 'film');
  markField(world, 'filmN');
  return out;
}
