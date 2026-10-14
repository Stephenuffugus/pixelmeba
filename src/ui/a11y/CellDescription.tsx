/**
 * The selected cell, described in one line (UX §9 "selected-cell description"; P3.11 W6-03): ground,
 * pH, oxygen, light, the food it holds and its residents, from the inspector's cell payload (measured
 * values only). It is the dish's accessible description, so focus on the dish reads the cell the
 * player last chose with Enter or a tap.
 */
import { PAINT_TARGETS, PLACEABLE_STRUCTURES, type PaintTarget, type PlaceableStructure } from '@sim/grid';
import { paintName, structureName } from '../panels/LabTrayNames';
import { dishInfo, inspector } from '../state';
import { cellDescriptionText } from './describe';
import { cellStructureDescription } from '../strings/structures';

export const CELL_DESCRIPTION_ID = 'dish-cell-description';

/** The cell's ground in content words, as the inspector names it ("Water", "Gel", "Impermeable wall"). */
function groundName(substrate: string, structure: string): string {
  if (structure !== 'none') {
    return (PLACEABLE_STRUCTURES as readonly string[]).includes(structure)
      ? structureName(structure as PlaceableStructure)
      : 'Structure';
  }
  return (PAINT_TARGETS as readonly string[]).includes(substrate)
    ? paintName(dishInfo.value, substrate as PaintTarget)
    : substrate;
}

export function CellDescription() {
  const p = inspector.value;
  const info = dishInfo.value;
  const c = p?.kind === 'cell' ? p.cell : undefined;
  const text = c
    ? cellDescriptionText({
        x: c.x,
        y: c.y,
        ground: groundName(c.substrate, c.structure),
        ph: c.ph,
        oxygen: c.oxygen,
        light: c.light,
        fields: c.fields ?? {},
        residents: (c.residents ?? []).map(
          (r) => info?.speciesNames[info.speciesIds.indexOf(r.speciesId)] ?? r.speciesId,
        ),
      })
    : '';
  // P5.1/P5.2: the cell's edge barriers and its furnishing or device are named too (absent on a v1.0 dish).
  const structures = c ? cellStructureDescription(c.edges, c.device) : '';
  const full = structures ? `${text} ${structures}` : text;
  return (
    <p id={CELL_DESCRIPTION_ID} class="sr-only" data-testid="cell-description">
      {full}
    </p>
  );
}
