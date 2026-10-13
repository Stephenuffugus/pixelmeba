/** Registry of every sprite the build packs. Order is canonical (atlas layout, manifest order). */
import type { SpriteDef } from './sprite';
import { B01_SPRINTER } from './sprites/b01_sprinter';
import { P02_CILIATE, P03_ROTIFER, P04_SILTWORM } from './sprites/consumers';
import { A01_SUNBEAD, B04_RECYCLER, B06_CRUMBSMITH, P01_AMOEBA } from './sprites/core';
import { F01_THREADLACE, F02_CORDWEAVER } from './sprites/fungi';
import { B02_VELVET, B03_DUSK, B05_CROSSFEEDER, B07_OILWICK, B08_BROTHMAKER, X01_HITCHER, Y01_BUBBLE, Y02_CREAMBUD } from './sprites/phase3_small';
import { V01_PINPHAGE } from './sprites/virus';
import { F03_TRAPLACE, F04_SPOREVEIL } from './sprites/phase5_fungi';
import { A02_GLASSWHEEL, A03_SHADELEAF, A04_TURNLEAF, A05_RAFTBALL, B09_LANTERN, B10_BRINECOIL, B11_SOURBUD, B12_SLEEPER, B13_RAMPART, V02_LACEPHAGE, X02_THREADRIDER } from './sprites/phase5_small';
import { P05_SHELLGLIDER, P06_BELLSTALK, P07_DARTFIN, P08_WATERBEAR, P09_WHEELGRAZER, P10_NEEDLEJAW } from './sprites/phase5_large';

/**
 * Phase 1 sprites first (their packing order is unchanged), then the Phase 3 sprites by species id,
 * then the Phase 5 sprites by species id (P5.7; only positions after the Phase 3 entries move).
 */
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
  // Phase 5 (UX §6.3, P5.7); drawn before the organism flip enables them (D-0104), as Phase 3 was (D-0046).
  A02_GLASSWHEEL,
  A03_SHADELEAF,
  A04_TURNLEAF,
  A05_RAFTBALL,
  B09_LANTERN,
  B10_BRINECOIL,
  B11_SOURBUD,
  B12_SLEEPER,
  B13_RAMPART,
  F03_TRAPLACE,
  F04_SPOREVEIL,
  V02_LACEPHAGE,
  X02_THREADRIDER,
  // Phase 5 large consumers (P5.5 "48x48 frames for P08/P10", P5.7 art-large; wave 8b), by species id after stage 1's.
  P05_SHELLGLIDER,
  P06_BELLSTALK,
  P07_DARTFIN,
  P08_WATERBEAR,
  P09_WHEELGRAZER,
  P10_NEEDLEJAW,
];
