/** Registry of every sprite the build packs. Order is canonical (atlas layout, manifest order). */
import type { SpriteDef } from './sprite';
import { B01_SPRINTER } from './sprites/b01_sprinter';
import { P02_CILIATE, P03_ROTIFER, P04_SILTWORM } from './sprites/consumers';
import { A01_SUNBEAD, B04_RECYCLER, B06_CRUMBSMITH, P01_AMOEBA } from './sprites/core';
import { F01_THREADLACE, F02_CORDWEAVER } from './sprites/fungi';
import { B02_VELVET, B03_DUSK, B05_CROSSFEEDER, B07_OILWICK, B08_BROTHMAKER, X01_HITCHER, Y01_BUBBLE, Y02_CREAMBUD } from './sprites/phase3_small';
import { V01_PINPHAGE } from './sprites/virus';

/** Phase 1 sprites first (their packing order is unchanged), then the Phase 3 sprites by species id. */
export const SPRITES: readonly SpriteDef[] = [
  A01_SUNBEAD,
  B01_SPRINTER,
  B04_RECYCLER,
  B06_CRUMBSMITH,
  P01_AMOEBA,
  // Phase 3 (UX §6.3); not enabled until their phase's content flips them on.
  B02_VELVET,
  B03_DUSK,
  B05_CROSSFEEDER,
  B07_OILWICK,
  B08_BROTHMAKER,
  F01_THREADLACE,
  F02_CORDWEAVER,
  P02_CILIATE,
  P03_ROTIFER,
  P04_SILTWORM,
  V01_PINPHAGE,
  X01_HITCHER,
  Y01_BUBBLE,
  Y02_CREAMBUD,
];
