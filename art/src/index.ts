/** Registry of every sprite the build packs. Order is canonical (atlas layout, manifest order). */
import type { SpriteDef } from './sprite';
import { B01_SPRINTER } from './sprites/b01_sprinter';
import { A01_SUNBEAD, B04_RECYCLER, B06_CRUMBSMITH, P01_AMOEBA } from './sprites/core';

export const SPRITES: readonly SpriteDef[] = [A01_SUNBEAD, B01_SPRINTER, B04_RECYCLER, B06_CRUMBSMITH, P01_AMOEBA];
