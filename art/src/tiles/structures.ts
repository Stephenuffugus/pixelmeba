/**
 * Phase 5 furnishing and device tiles (P5.7 "12 structure icons/tiles", first pass; UX §6.5 "equipment
 * props as small readable lab pieces with neutral outlines"; CT §4 S08 "darkens as saturated"; wave 11
 * structure-render-worker, D-0119). One atlas tile id 'device', 16×16, one heading, appended LAST to
 * art/src/tiles TILES so no earlier frame moves. Frames, in this order:
 *
 *    0 s05      porous shelter: an arch with pores
 *    1 s06      attachment mesh: a grid
 *    2 s07      nutrient basket: an open cup outline
 *    3 s08_0    adsorption resin, saturation quartile 0 (a pale block) …
 *    6 s08_3    … quartile 3 (a dark, densely dotted block): darker and denser by quartile
 *    7 s09_off  heater: a coil
 *    8 s09_on   heater on: the coil with a warm accent and heat ticks
 *    9 s10_off  cooler: a snowflake-like fin
 *   10 s10_on   cooler on: the fin with a cool accent and frost tips
 *   11 s11      shade roof: an OUTLINE only (organisms under it stay visible)
 *   12 s12      moisture wick: a strand with a drop
 *
 * The renderer picks a frame from snapshot data only (src/render/structureLayer.ts deviceFrame): the
 * device kind, S09/S10 `on` (GeometryMsg.devices) and a resin's saturation (SnapshotMsg.resins). Silhouette
 * and value carry each frame in grayscale (the On frames add shapes, not only colour); texture is
 * deterministic. Edge barriers (S01–S04) are procedural line glyphs, not tiles (D-0119).
 */
import { P } from '../palette';
import { Px } from '../px';
import type { TileDef } from './index';

/** 16, as art/src/tiles TILE_SIZE (not imported: index.ts imports this module). */
const S = 16;

const K = { ink: 1, body: 2, shade: 3, light: 4, r0: 5, r1: 6, r2: 7, r3: 8, warm: 9, glow: 10, cool: 11, frost: 12, strand: 13, drop: 14 } as const;

/** Porous shelter: a thick arch over the cell with a row of pores through it. */
function shelter(): Px {
  const p = new Px(S, S);
  for (let y = 2; y < 14; y++)
    for (let x = 1; x < 15; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 13);
      if (d <= 6.6 && d >= 3.4 && y < 13) p.set(x, y, K.body);
    }
  // Feet on the floor line.
  p.fillRect(2, 12, 3, 2, K.body).fillRect(11, 12, 3, 2, K.body);
  p.shadeEdge([K.body], K.shade, 1, 1);
  // Pores: holes along the arch (value pattern that reads in grayscale).
  for (const [x, y] of [[4, 9], [5, 6], [8, 5], [11, 6], [12, 9]] as const) p.set(x, y, 0);
  return p.outline(K.ink);
}

/** Attachment mesh: a square lattice (period 3) inside a frame. */
function mesh(): Px {
  const p = new Px(S, S);
  for (let y = 2; y <= 13; y++)
    for (let x = 2; x <= 13; x++) {
      const border = x === 2 || y === 2 || x === 13 || y === 13;
      const strand = (x - 2) % 3 === 0 || (y - 2) % 3 === 0;
      if (border) p.set(x, y, K.ink);
      else if (strand) p.set(x, y, K.shade);
    }
  // Knots where strands cross.
  for (let y = 5; y <= 11; y += 3) for (let x = 5; x <= 11; x += 3) p.set(x, y, K.ink);
  return p;
}

/** Nutrient basket: an open cup outline (a U with a rim lip), empty inside. */
function basket(): Px {
  const p = new Px(S, S);
  p.line(2, 5, 13, 5, K.ink); // rim lip
  p.line(3, 6, 4, 12, K.ink).line(12, 6, 11, 12, K.ink);
  p.line(4, 13, 11, 13, K.ink);
  // Weave ticks on the walls.
  for (const y of [7, 9, 11]) p.set(y === 7 ? 3 : 4, y, K.shade).set(y === 7 ? 12 : 11, y, K.shade);
  p.line(5, 13, 10, 13, K.shade);
  p.set(2, 4, K.ink).set(13, 4, K.ink);
  return p;
}

/** Adsorption resin at saturation quartile q (0–3): a block that darkens, with denser dark dots, as it fills. */
function resin(q: number): Px {
  const p = new Px(S, S);
  const fill = [K.r0, K.r1, K.r2, K.r3][q]!;
  p.fillRect(3, 3, 10, 10, fill);
  // A bead texture: more dark grains per quartile (a deterministic lattice), so value reads in grayscale.
  for (let y = 4; y < 12; y++)
    for (let x = 4; x < 12; x++) {
      const grain = (x * 5 + y * 3) % 7;
      if (grain < q + 1) p.set(x, y, q >= 2 ? K.ink : K.r2);
    }
  p.line(3, 3, 12, 3, K.light); // top highlight
  return p.outline(K.ink);
}

/** Heater: a zigzag coil between two posts; On adds the warm accent and three heat ticks above. */
function heater(on: boolean): Px {
  const p = new Px(S, S);
  p.fillRect(2, 11, 12, 2, K.shade); // base plate
  const coil = on ? K.warm : K.body;
  for (let k = 0; k < 5; k++) p.line(3 + 2 * k, k % 2 === 0 ? 9 : 5, 4 + 2 * k, k % 2 === 0 ? 5 : 9, coil);
  p.line(2, 10, 2, 5, K.shade).line(13, 10, 13, 5, K.shade);
  if (on) {
    for (const x of [4, 8, 12]) p.set(x - 1, 2, K.glow).set(x, 1, K.glow).set(x, 3, K.glow);
    p.set(8, 7, K.glow);
  }
  return p.outline(K.ink);
}

/** Cooler: a six-armed fin (a snowflake-like star); On adds the cool accent and frost tips. */
function cooler(on: boolean): Px {
  const p = new Px(S, S);
  const arm = on ? K.cool : K.body;
  p.line(8, 2, 8, 13, arm).line(3, 5, 13, 11, arm).line(3, 11, 13, 5, arm);
  p.set(7, 7, arm).set(8, 8, arm).set(7, 8, arm).set(8, 7, arm);
  if (on) for (const [x, y] of [[8, 1], [8, 14], [2, 4], [14, 12], [2, 12], [14, 4]] as const) p.set(x, y, K.frost);
  return p.outline(K.ink);
}

/** Shade roof: an outline only — a pitched top edge and a dashed eave around an empty middle. */
function roof(): Px {
  const p = new Px(S, S);
  p.line(1, 5, 7, 1, K.ink).line(8, 1, 14, 5, K.ink);
  for (let x = 1; x <= 14; x++) if (x % 3 !== 0) p.set(x, 14, K.ink);
  for (let y = 6; y <= 13; y++) if (y % 3 !== 0) p.set(1, y, K.ink).set(14, y, K.ink);
  p.line(2, 5, 13, 5, K.shade);
  return p;
}

/** Moisture wick: a wavy strand from the top with a drop at its foot. */
function wick(): Px {
  const p = new Px(S, S);
  for (let y = 1; y <= 9; y++) p.set(7 + (y % 4 === 1 ? 1 : y % 4 === 3 ? -1 : 0), y, K.strand);
  for (let y = 1; y <= 9; y++) p.set(8 + (y % 4 === 1 ? 1 : y % 4 === 3 ? -1 : 0), y, K.strand);
  p.fillEllipse(8, 12, 2.6, 2.6, K.drop);
  p.set(7, 11, K.light);
  return p.outline(K.ink);
}

export const DEVICE_FRAME_NAMES = ['s05', 's06', 's07', 's08_0', 's08_1', 's08_2', 's08_3', 's09_off', 's09_on', 's10_off', 's10_on', 's11', 's12'] as const;

export const DEVICE: TileDef = {
  id: 'device',
  palette: [
    '',
    P.deviceInk,
    P.deviceBody,
    P.deviceShade,
    P.deviceLight,
    P.resinFill0,
    P.resinFill1,
    P.resinFill2,
    P.resinFill3,
    P.heaterWarm,
    P.heaterGlow,
    P.coolerCool,
    P.coolerFrost,
    P.wickStrand,
    P.wickDrop,
  ],
  frameNames: DEVICE_FRAME_NAMES,
  frames: [shelter(), mesh(), basket(), resin(0), resin(1), resin(2), resin(3), heater(false), heater(true), cooler(false), cooler(true), roof(), wick()],
};
