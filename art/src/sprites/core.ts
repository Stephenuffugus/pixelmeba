/**
 * Core roster sprites (Phase 1): B04 Recycler, B06 Crumbsmith, A01 Sunbead, P01 Amoeba.
 * Silhouettes follow UX_SPEC §6.3 and must stay distinct in grayscale:
 *   Sprinter = long rod with pale band · Recycler = chain of three beads ·
 *   Crumbsmith = short stubby rod with three dark notches · Sunbead = round disk with gold center ·
 *   Amoeba = large soft two-lobed blob with a nucleus.
 */
import { P } from '../palette';
import { Px } from '../px';
import type { AnimationDef, SpriteDef } from '../sprite';

const O = 1; // outline

function deathFrames(base: Px, map: Readonly<Record<number, number>>, fractions: readonly number[], remains: number, remainsDark: number): Px[] {
  return fractions.map((f, k) => {
    const p = base.clone();
    for (let i = 0; i < p.data.length; i++) {
      const v = p.data[i]!;
      if (v === 0) continue;
      p.data[i] = v === O ? remainsDark : (map[v] ?? remains);
    }
    return p.erode(f, 29 + k * 7);
  });
}

function anim(frames: Px[], durationMs: number, loop: boolean, reducedMotionFrame = 0): AnimationDef {
  return { frames, durationMs, loop, reducedMotionFrame };
}

// ------------------------------------------------------------------------------ B04 Recycler
// Amber bead chain. Settles near debris; beads bob alternately.
const REC = { C: 2, D: 3, L: 4, H: 5, S: 6, R: 7, RD: 8 } as const;
const recPalette = ['', P.outlineDark, P.recyclerAmber, P.recyclerDeep, P.recyclerLight, P.highlight, '#BDB29A', P.remains, P.remainsDark];

function recycler(bob: readonly [number, number, number], gap = 0, split = false): Px {
  const p = new Px(16, 16);
  // Three distinct beads with visible waists between them (a chain, not a bar).
  const xs = [3 - gap, 8, 13 + gap];
  xs.forEach((x, k) => {
    if (split && k === 1) return;
    p.fillEllipse(x, 8 + bob[k]!, 2.05, 2.05, REC.C);
  });
  if (!split) {
    // One-pixel links on the center row only.
    p.set(5 - gap, 8, REC.C).set(10 + gap, 8, REC.C);
    if (gap > 0) p.set(4 - gap + 1, 8, REC.C).set(11 + gap - 1, 8, REC.C);
  } else {
    p.fillEllipse(6.2, 8, 1.7, 1.7, REC.C);
    p.fillEllipse(9.8, 8, 1.7, 1.7, REC.C);
    p.set(8, 8, 0).set(8, 7, 0).set(8, 9, 0);
  }
  p.shadeEdge([REC.C], REC.D, 1, 1);
  xs.forEach((x, k) => {
    if (split && k === 1) return;
    p.tint(Math.floor(x) - 1, 7 + bob[k]!, REC.L);
  });
  return p.outline(O);
}

const recMove = [recycler([0, 0, 0]), recycler([-1, 0, 1]), recycler([0, 0, 0]), recycler([1, 0, -1])];
const recRepro = [recycler([0, 0, 0], 0), recycler([0, 0, 0], 1), recycler([0, 1, 0], 1), recycler([0, 0, 0], 1, true)];
const recStress = [0, 1].map((k) => {
  const p = recycler([0, 0, 0]);
  p.replace(REC.C, REC.S);
  for (const x of [4, 8, 12]) p.tint(x, 8 + (k ? 1 : -1), REC.D);
  return p;
});

export const B04_RECYCLER: SpriteDef = {
  assetId: 'b04_recycler',
  speciesId: 'B04',
  size: 16,
  headings: 4,
  palette: recPalette,
  animations: {
    move: anim(recMove, 160, true),
    reproduction: anim(recRepro, 110, false, 3),
    stress: anim(recStress, 400, true),
    death: anim(deathFrames(recycler([0, 0, 0]), {}, [0.35, 0.65, 0.85], REC.R, REC.RD), 140, false, 2),
  },
  required: ['move', 'reproduction', 'stress', 'death'],
};

// ----------------------------------------------------------------------------- B06 Crumbsmith
// Ochre short stubby rod with three dark notches along its back.
const CR = { C: 2, D: 3, N: 4, L: 5, S: 6, R: 7, RD: 8 } as const;
const crPalette = ['', P.outlineDark, P.crumbOchre, P.crumbDeep, P.crumbNotch, P.crumbLight, '#BCB09A', P.remains, P.remainsDark];

function crumbsmith(len = 0, pinch = false, wiggle = 0): Px {
  const p = new Px(16, 16);
  p.fillRodH(6 - len * 0.5, 10 + len * 0.5, 8, 3, CR.C);
  p.shadeEdge([CR.C], CR.D, 0, 1);
  // Three notches on the upper edge.
  for (const x of [6, 8, 10]) {
    const top = [5, 6].find((y) => p.get(x + (x === 8 ? wiggle : 0), y) === CR.C) ?? 5;
    p.set(x + (x === 8 ? wiggle : 0), top, CR.N);
  }
  p.tint(5, 8, CR.L).tint(6, 9, CR.L).tint(10, 9, CR.L);
  if (pinch) for (const y of [5, 6, 10, 11]) p.set(8, y, 0);
  return p.outline(O);
}

const crMove = [crumbsmith(0, false, 0), crumbsmith(0, false, 0), crumbsmith(0, false, 1), crumbsmith(0, false, 0)];
crMove[1]!.tint(9, 8, CR.L);
crMove[3]!.tint(7, 8, CR.L);
const crRepro = [
  crumbsmith(1),
  crumbsmith(2),
  crumbsmith(2, true),
  (() => {
    const p = new Px(16, 16);
    p.fillRodH(3.5, 4.5, 8, 2.2, CR.C);
    p.fillRodH(11.5, 12.5, 8, 2.2, CR.C);
    p.shadeEdge([CR.C], CR.D, 0, 1);
    p.set(4, 6, CR.N).set(12, 6, CR.N);
    return p.outline(O);
  })(),
];
const crStress = [0, 1].map((k) => {
  const p = crumbsmith();
  p.replace(CR.C, CR.S);
  for (let x = 5; x <= 11; x += 2) p.tint(x, 9 - k, CR.D);
  return p;
});

export const B06_CRUMBSMITH: SpriteDef = {
  assetId: 'b06_crumbsmith',
  speciesId: 'B06',
  size: 16,
  headings: 4,
  palette: crPalette,
  animations: {
    move: anim(crMove, 140, true),
    reproduction: anim(crRepro, 100, false, 3),
    stress: anim(crStress, 400, true),
    death: anim(deathFrames(crumbsmith(), {}, [0.35, 0.65, 0.85], CR.R, CR.RD), 140, false, 2),
  },
  required: ['move', 'reproduction', 'stress', 'death'],
};

// -------------------------------------------------------------------------------- A01 Sunbead
// Green disk with a gold center; internal pixels pulse gently; division pinches into two beads.
const SB = { C: 2, D: 3, G: 4, L: 5, S: 6, R: 7, RD: 8, GD: 9 } as const;
const sbPalette = ['', P.outlineDark, P.sunbeadGreen, P.sunbeadDeep, P.sunbeadGold, P.sunbeadLight, '#A9AE9C', P.remains, P.remainsDark, '#C9A24A'];

function sunbead(pulse: number, cx = 8, r = 4.6): Px {
  const p = new Px(16, 16);
  p.fillEllipse(cx, 8, r, r, SB.C);
  p.shadeEdge([SB.C], SB.D, 1, 1);
  p.tint(Math.round(cx) - 3, 6, SB.L).tint(Math.round(cx) - 2, 5, SB.L);
  // Gold center: 2×2 core, growing to a plus-shape at pulse peak.
  const x0 = Math.round(cx) - 1;
  for (const [x, y] of [
    [x0, 7],
    [x0 + 1, 7],
    [x0, 8],
    [x0 + 1, 8],
  ] as const) p.tint(x, y, SB.G);
  if (pulse >= 1) for (const [x, y] of [[x0, 6], [x0 + 1, 9]] as const) p.tint(x, y, SB.GD);
  if (pulse >= 2) for (const [x, y] of [[x0 - 1, 7], [x0 + 2, 8], [x0 + 1, 6], [x0, 9]] as const) p.tint(x, y, SB.GD);
  return p.outline(O);
}

const sbIdle = [sunbead(0), sunbead(1), sunbead(2), sunbead(1)];
const sbRepro = [
  sunbead(1),
  (() => {
    const p = new Px(16, 16);
    p.fillEllipse(8, 8, 5.4, 4.4, SB.C);
    p.shadeEdge([SB.C], SB.D, 1, 1);
    p.tint(6, 8, SB.G).tint(10, 8, SB.G);
    return p.outline(O);
  })(),
  (() => {
    const p = new Px(16, 16);
    p.fillEllipse(5.4, 8, 3.3, 3.5, SB.C);
    p.fillEllipse(10.6, 8, 3.3, 3.5, SB.C);
    p.shadeEdge([SB.C], SB.D, 1, 1);
    p.tint(5, 8, SB.G).tint(10, 8, SB.G);
    return p.outline(O);
  })(),
  (() => {
    const p = new Px(16, 16);
    p.fillEllipse(4.5, 8, 3.2, 3.2, SB.C);
    p.fillEllipse(11.5, 8, 3.2, 3.2, SB.C);
    p.shadeEdge([SB.C], SB.D, 1, 1);
    p.tint(4, 8, SB.G).tint(11, 8, SB.G);
    return p.outline(O);
  })(),
];
const sbStress = [0, 1].map((k) => {
  const p = sunbead(0);
  p.replace(SB.C, SB.S);
  for (const [x, y] of [[5, 6], [10, 10], [11, 7], [6, 11]] as const) p.tint(x + k, y, SB.D);
  return p;
});

export const A01_SUNBEAD: SpriteDef = {
  assetId: 'a01_sunbead',
  speciesId: 'A01',
  size: 16,
  headings: 1,
  palette: sbPalette,
  animations: {
    idle: anim(sbIdle, 320, true),
    reproduction: anim(sbRepro, 120, false, 3),
    stress: anim(sbStress, 420, true),
    death: anim(deathFrames(sunbead(0), {}, [0.35, 0.65, 0.85], SB.R, SB.RD), 150, false, 2),
  },
  required: ['idle', 'reproduction', 'stress', 'death'],
};

// ---------------------------------------------------------------------------------- P01 Amoeba
// Large soft grazer: irregular two-lobed silhouette, darker nucleus, granular interior.
const AM = { C: 2, D: 3, L: 4, N: 5, S: 6, R: 7, RD: 8, G: 9 } as const;
const amPalette = ['', P.outlineSoft, P.amoebaLilac, P.amoebaDeep, P.amoebaLight, P.amoebaNucleus, '#B3AFB9', P.remains, P.remainsDark, '#A69CCB'];

interface Lobe {
  readonly dx: number;
  readonly dy: number;
  readonly r: number;
}

function amoeba(lobes: readonly Lobe[], opts: { cup?: number; stretch?: number; pinch?: boolean } = {}): Px {
  const p = new Px(32, 32);
  const s = opts.stretch ?? 0;
  p.fillEllipse(16, 16, 7.5 + s, 6.8 - s * 0.4, AM.C);
  for (const l of lobes) p.fillEllipse(16 + l.dx, 16 + l.dy, l.r, l.r * 0.85, AM.C);
  if (opts.cup) {
    // Engulfing cup opening toward the East edge.
    p.fillEllipse(23 + opts.cup, 16, 2.6, 2.2, 0);
  }
  if (opts.pinch) for (let y = 8; y <= 24; y++) if (y < 12 || y > 20) p.set(16, y, 0).set(15, y, 0);
  p.shadeEdge([AM.C], AM.D, 1, 1);
  // Light upper-left membrane.
  p.shadeEdge([AM.C], AM.L, -1, -1);
  // Nucleus and granules (inside only).
  const n = opts.pinch ? [[11, 15], [20, 15]] : [[14, 15]];
  for (const [nx, ny] of n) {
    for (const [x, y] of [[nx!, ny!], [nx! + 1, ny!], [nx!, ny! + 1], [nx! + 1, ny! + 1], [nx! - 1, ny!], [nx! + 2, ny! + 1]] as const) p.tint(x, y, AM.N);
  }
  for (const [x, y] of [[19, 13], [12, 19], [20, 19], [17, 21], [10, 14]] as const) p.tint(x, y, AM.G);
  return p.outline(O);
}

const L = (dx: number, dy: number, r: number): Lobe => ({ dx, dy, r });
const amMove = [
  amoeba([L(7, -3, 3.4), L(-6, 4, 3)]),
  amoeba([L(8, -2, 3.6), L(-6, 4, 2.6)]),
  amoeba([L(9, -1, 3.6), L(-5, 5, 2.4)]),
  amoeba([L(8, 1, 3.4), L(-6, 3, 2.8)]),
  amoeba([L(7, 2, 3.2), L(-7, 3, 3)]),
  amoeba([L(6, -1, 3.2), L(-7, 4, 3.2)]),
];
const amFeed = [
  amoeba([L(7, -4, 3.2), L(7, 4, 3.2)], { cup: 0 }),
  amoeba([L(8, -4, 3.2), L(8, 4, 3.2)], { cup: 1 }),
  amoeba([L(8, -3, 3), L(8, 3, 3)], { cup: 0 }),
  amoeba([L(7, -1, 3.2), L(-6, 4, 2.8)]),
];
const amRepro = [
  amoeba([L(7, 0, 3.4), L(-7, 0, 3.4)]),
  amoeba([L(8, 0, 3.8), L(-8, 0, 3.8)], { stretch: 2 }),
  amoeba([L(9, 0, 4), L(-9, 0, 4)], { stretch: 3, pinch: true }),
  (() => {
    const p = new Px(32, 32);
    p.fillEllipse(8.5, 16, 5.6, 5, AM.C);
    p.fillEllipse(23.5, 16, 5.6, 5, AM.C);
    p.shadeEdge([AM.C], AM.D, 1, 1);
    p.shadeEdge([AM.C], AM.L, -1, -1);
    for (const [x, y] of [[8, 16], [9, 16], [8, 17], [23, 16], [24, 16], [23, 17]] as const) p.tint(x, y, AM.N);
    return p.outline(O);
  })(),
];
const amStress = [0, 1].map((k) => {
  const p = amoeba([L(6, -2, 2.8), L(-6, 3, 2.6)]);
  p.replace(AM.C, AM.S).replace(AM.L, AM.S);
  for (let x = 10; x <= 22; x += 3) p.tint(x, 12 + ((x + k) % 3) * 3, AM.D);
  return p;
});

export const P01_AMOEBA: SpriteDef = {
  assetId: 'p01_amoeba',
  speciesId: 'P01',
  size: 32,
  headings: 1,
  palette: amPalette,
  animations: {
    move: anim(amMove, 180, true),
    feed: anim(amFeed, 150, false, 1),
    reproduction: anim(amRepro, 140, false, 3),
    stress: anim(amStress, 420, true),
    death: anim(deathFrames(amoeba([L(7, -3, 3.4), L(-6, 4, 3)]), {}, [0.25, 0.5, 0.72, 0.9], AM.R, AM.RD), 160, false, 3),
  },
  required: ['move', 'feed', 'reproduction', 'stress', 'death'],
};
