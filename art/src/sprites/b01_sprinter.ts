/**
 * B01 Sprinter — "Coral rod with a pale middle band. Short glides, quick binary division and
 * irregular spreading patches." 16×16 frames, ~12×5 px visible body, facing East.
 * Motion: a two-pixel flagellum at the tail flicks; the band shimmers. Nothing implies locomotion
 * beyond what the simulation moves.
 */
import { P } from '../palette';
import { Px } from '../px';
import type { SpriteDef } from '../sprite';

const T = 0;
const O = 1; // outline
const C = 2; // coral body
const D = 3; // deep shade
const B = 4; // pale band
const H = 5; // highlight
const S = 6; // stress gray
const R = 7; // remains
const RD = 8; // remains dark

const palette = ['', P.outlineDark, P.sprinterCoral, P.sprinterDeep, P.sprinterBand, P.highlight, '#B9A7A3', P.remains, P.remainsDark];

function body(len = 0, pinch = false): Px {
  const p = new Px(16, 16);
  p.fillRodH(5 - len * 0.5, 11 + len * 0.5, 8, 2.5, C);
  p.shadeEdge([C], D, 0, 1);
  // Pale middle band (two columns).
  for (let y = 5; y <= 10; y++) {
    p.tint(7, y, B);
    p.tint(8, y, B);
  }
  if (pinch) {
    // Pinch at the band: clear the top and bottom body rows there.
    for (const x of [7, 8]) {
      p.set(x, 5, T).set(x, 6, T).set(x, 10, T).set(x, 11, T);
    }
  }
  p.tint(4, 7, H);
  p.tint(5, 6, H);
  p.outline(O);
  return p;
}

function flagellum(p: Px, phase: number): Px {
  // Tail at the West end (the Sprinter faces East).
  const pts = [
    [[1, 8], [0, 7]],
    [[1, 8], [0, 8]],
    [[1, 8], [0, 9]],
    [[1, 8], [0, 8]],
  ][phase % 4]!;
  for (const [x, y] of pts) if (p.get(x!, y!) === T) p.set(x!, y!, O);
  return p;
}

const move = [0, 1, 2, 3].map((k) => {
  const p = flagellum(body(), k);
  // Band shimmer: one band pixel brightens per frame.
  p.tint(7 + (k % 2), 6 + (k % 3), H);
  return p;
});

const reproduction = [
  body(1),
  body(2),
  body(2, true),
  (() => {
    // Two short daughters separating along the axis.
    const p = new Px(16, 16);
    p.fillRodH(3, 5, 8, 2.2, C);
    p.fillRodH(11, 13, 8, 2.2, C);
    p.shadeEdge([C], D, 0, 1);
    p.tint(5, 8, B).tint(6, 8, B).tint(10, 8, B).tint(11, 8, B);
    p.tint(2, 7, H).tint(10, 7, H);
    return p.outline(O);
  })(),
];

const stress = [0, 1].map((k) => {
  const p = body();
  p.replace(C, S).replace(D, D);
  // Checker speckle so stress reads without color.
  for (let x = 4; x <= 12; x += 2) p.tint(x, 7 + ((x / 2 + k) % 2), D);
  return p;
});

const death = [0.35, 0.65, 0.85].map((f, k) => {
  const p = body();
  p.replace(C, R).replace(D, RD).replace(B, R).replace(H, R).replace(O, RD);
  return p.erode(f, 11 + k);
});

export const B01_SPRINTER: SpriteDef = {
  assetId: 'b01_sprinter',
  speciesId: 'B01',
  size: 16,
  headings: 4,
  palette,
  animations: {
    move: { frames: move, durationMs: 120, loop: true, reducedMotionFrame: 1 },
    reproduction: { frames: reproduction, durationMs: 90, loop: false, reducedMotionFrame: 3 },
    stress: { frames: stress, durationMs: 400, loop: true, reducedMotionFrame: 0 },
    death: { frames: death, durationMs: 140, loop: false, reducedMotionFrame: 2 },
  },
  required: ['move', 'reproduction', 'stress', 'death'],
};
