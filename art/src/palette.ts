/**
 * Named colors (UX_SPEC §6.1). Organisms are the brightest things on screen; chrome stays quiet.
 * Every species must also read in grayscale through silhouette and pattern.
 */
export const P = {
  // Environment
  outside: '#14252D',
  water: '#D6E7E5',
  waterDeep: '#C9DEDB',
  waterLight: '#E3EFED',
  gel: '#E9E1C8',
  gelDark: '#DDD3B6',
  sediment: '#8B7661',
  sedimentDark: '#7A6652',
  sedimentLight: '#9C8871',
  stone: '#6E7B84',
  stoneDark: '#58646C',
  stoneLight: '#9AA7AE',
  wall: '#3A4650',
  rim: '#2C3F49',
  rimLight: '#F5F4EF',

  // Interface
  surface: '#F5F4EF',
  text: '#172C35',
  primary: '#256E9E',
  muted: '#6B7B84',
  focus: '#F2B84B',
  danger: '#B3473F',

  // Shared organism tones
  outlineDark: '#1E2A30',
  outlineSoft: '#3B4A50',
  highlight: '#FFFFFF',
  remains: '#A89B84',
  remainsDark: '#857863',

  // B01 Sprinter
  sprinterCoral: '#EF7B6C',
  sprinterDeep: '#C95A4D',
  sprinterBand: '#FBD5CD',
  // B04 Recycler
  recyclerAmber: '#D6A64D',
  recyclerDeep: '#A87C2E',
  recyclerLight: '#F6E3B0',
  // B06 Crumbsmith
  crumbOchre: '#C8963E',
  crumbDeep: '#9E7229',
  crumbNotch: '#5B4420',
  crumbLight: '#E8C27A',
  // A01 Sunbead
  sunbeadGreen: '#8CBA4B',
  sunbeadDeep: '#62913A',
  sunbeadGold: '#E9C46A',
  sunbeadLight: '#B7D98A',
  // P01 Amoeba
  amoebaLilac: '#B8AEDC',
  amoebaDeep: '#8F84B8',
  amoebaLight: '#DCD6F0',
  amoebaNucleus: '#6E63A0',

  // Feature layers
  reserveAmber: '#E0A53A',
  reserveEmpty: '#F6E3B0',
  restingSeam: '#4E5620',
  restingSeamLight: '#A9B46A',
  starchNotchLight: '#E8C27A',
  starchNotch: '#5B4420',
  glowCenter: '#C6F04D',
} as const;

export type ColorName = keyof typeof P;

export function hexToRgba(hex: string, alpha = 255): [number, number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), alpha];
}
