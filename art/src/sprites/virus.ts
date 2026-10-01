/**
 * V01 Pinphage (UX §6.2–6.3): viruses are never drawn as moving bodies. The atlas carries only
 *   glyph/e/0  the inspection glyph (a head-and-tail phage: hexagonal head, collar, tail, base plate
 *              and two tail fibres), shown by the inspector and on selection;
 *   idle/e/0   the thumbnail for UI lists (src/ui/atlas.ts drawFrame falls back to `idle`).
 * Free-phage abundance is a density overlay drawn from the field (a render of world state, not an
 * atlas frame), so nothing here implies an individual moving particle.
 */
import { P } from '../palette';
import type { Px } from '../px';
import type { SpriteDef } from '../sprite';
import { anim, canvas, O } from './kit';

const C = 2;
const D = 3;
const L = 4;

const phagePalette = ['', P.outlineDark, P.phageBlue, P.phageDeep, P.phageLight];

/** Head-and-tail glyph; `big` draws the slightly larger thumbnail variant. */
function phage(big: boolean): Px {
  const p = canvas(16);
  const k = big ? 1 : 0;
  // Hexagonal head: a diamond-capped box.
  const hx0 = 5 - k;
  const hx1 = 10 + k;
  const hy0 = 1;
  const hy1 = 7 + k;
  for (let y = hy0; y <= hy1; y++) {
    const inset = Math.max(0, Math.max(hy0 + 1 - y, y - (hy1 - 1)));
    for (let x = hx0 + inset; x <= hx1 - inset; x++) p.set(x, y, C);
  }
  // Collar and tail (2 px wide), base plate, two fibres.
  const ty1 = 12;
  p.fillRect(7, hy1 + 1, 2, ty1 - hy1, D);
  p.fillRect(5, ty1, 6, 1, C);
  p.line(5, ty1 + 1, 3, 14, C).line(10, ty1 + 1, 12, 14, C);
  // Head facets: a light top-left face.
  p.tint(hx0 + 1, 3, L).tint(hx0 + 2, 2, L).tint(hx0 + 1, 4, L);
  return p.outline(O);
}

export const V01_PINPHAGE: SpriteDef = {
  assetId: 'v01_pinphage',
  speciesId: 'V01',
  size: 16,
  headings: 1,
  form: 'virus',
  palette: phagePalette,
  animations: {
    glyph: anim([phage(false)], 1000, false, 0),
    idle: anim([phage(true)], 1000, false, 0),
  },
  required: ['glyph', 'idle'],
};
