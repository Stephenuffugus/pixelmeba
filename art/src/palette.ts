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

  // Phase 3 organisms (UX §6.1 base + accent; the deep/light tones are local shades for volume)
  // B02 Velvet
  velvetTeal: '#32A89A',
  velvetLight: '#BFE9E1',
  velvetDeep: '#227A70',
  // B03 Dusk
  duskViolet: '#8B82C6',
  duskLight: '#D9D4F2',
  duskDeep: '#6A619F',
  // B05 Crossfeeder
  crossBlue: '#4A90C2',
  crossTip: '#F2F7FB',
  crossDeep: '#336D96',
  // B07 Oilwick
  oilNavy: '#2E4A7A',
  oilAmber: '#E5A83B',
  oilDeep: '#1F3357',
  oilLight: '#5A74A3',
  // B08 Brothmaker
  brothRose: '#D98CA6',
  brothBand: '#FFFFFF',
  brothDeep: '#B26A84',
  // Y01 Bubble
  bubbleCream: '#F2E6C9',
  bubbleBud: '#7A2E3F',
  bubbleDeep: '#D8C8A2',
  // Y02 Creambud
  creamIvory: '#F5EBD3',
  creamBud: '#E6923A',
  creamDeep: '#DCCDA8',
  // F01 Threadlace
  laceIvory: '#EFE3C6',
  laceOutline: '#4A3B2A',
  laceTip: '#E08A3C',
  laceSeptum: '#CDBE9C',
  // F02 Cordweaver
  cordCopper: '#B87333',
  cordPulse: '#F6D7B0',
  cordDeep: '#7E4C1F',
  cordLight: '#D69A5E',
  // P02 Ciliate
  ciliateCyan: '#7FD6E8',
  ciliateCilia: '#FFFFFF',
  ciliateDeep: '#4FA9BE',
  ciliateGroove: '#2F6F80',
  // P03 Rotifer
  rotiferPeach: '#F3B48E',
  rotiferCrown: '#C97A4E',
  rotiferDeep: '#D48F69',
  rotiferGut: '#9C5B39',
  // P04 Siltworm
  siltBrown: '#8A5A3C',
  siltHead: '#E8D3BD',
  siltDeep: '#68412A',
  siltRing: '#A97653',
  // X01 Hitcher
  hitcherGold: '#E3C15A',
  hitcherDeep: '#A88A2E',
  // V01 Pinphage
  phageBlue: '#3E7BC4',
  phageLight: '#A9C8EE',
  phageDeep: '#264F82',

  // Phase 5 organisms (UX §6.1 base + accent, by species; the deep/light/outline tones are local
  // shades for volume, derived like the Phase 3 ones). Small (P5.7 art-small) first, then the six
  // large consumers (art-large appends shades there if it needs them).
  // B09 Lantern (lanternLime is the glow colour: it appears only in glow_center's 'glow' frame)
  lanternBlueGreen: '#3FB3A6',
  lanternLime: '#C6F04D',
  lanternDeep: '#2B867B',
  lanternLight: '#A7E3DA',
  lanternCore: '#1F5F57',
  // B10 Brinecoil
  brinecoilRust: '#B5552F',
  brinecoilCream: '#F1E3C8',
  brinecoilDeep: '#86391C',
  // B11 Sourbud
  sourbudRed: '#C93B3B',
  sourbudBud: '#5A1E1E',
  sourbudDeep: '#9A2828',
  sourbudLight: '#F0A3A3',
  // B12 Sleeper
  sleeperOlive: '#8B9A3C',
  sleeperSeam: '#4E5620',
  sleeperDeep: '#6B7A27',
  sleeperLight: '#C9D38A',
  // B13 Rampart
  rampartBrick: '#A8412F',
  rampartLight: '#E4B7AF',
  rampartDeep: '#7C2C1E',
  // F03 Traplace (traplaceLoop is the trap colour: it appears only in the 'trap' frames)
  traplaceAmber: '#C98A2B',
  traplaceLoop: '#6B4A12',
  traplaceOutline: '#3E2A0C',
  traplaceLight: '#ECC27A',
  traplaceSlack: '#A88A5C',
  // F04 Sporeveil
  sporeveilSilver: '#B9BEC4',
  sporeveilRing: '#23272B',
  sporeveilOutline: '#5F666D',
  sporeveilLight: '#E8EBEE',
  // A02 Glasswheel
  glasswheelGold: '#E0B84A',
  glasswheelRim: '#F7F1D9',
  glasswheelDeep: '#A8862C',
  // A03 Shadeleaf
  shadeleafGreen: '#2F6B3A',
  shadeleafVein: '#9FE3B4',
  shadeleafDeep: '#1F4B28',
  // A04 Turnleaf (turnleafAmber shows Sugar mode: only in mode_half's 'sugar' frame)
  turnleafGreen: '#6FAE4E',
  turnleafAmber: '#D9A441',
  turnleafDeep: '#4F8236',
  turnleafLight: '#B9E09A',
  turnleafAmberLight: '#F2D08A',
  turnleafPale: '#E2F4D2',
  // A05 Raftball
  raftballEmerald: '#2E9E5B',
  raftballHollow: '#D6E7E5',
  raftballDeep: '#1F7342',
  raftballLight: '#8FD9AE',
  // X02 Threadrider
  threadriderMauve: '#8C6E9E',
  threadriderDeep: '#674E77',
  threadriderLight: '#CDB9D9',
  // V02 Lacephage
  lacephageGlyph: '#6A4FB3',
  lacephageLight: '#C2B5EA',
  lacephageDeep: '#47347F',
  // P05 Shellglider
  shellgliderCream: '#EADFC8',
  shellgliderScallop: '#9C8B6A',
  // P06 Bellstalk
  bellstalkBlue: '#A9C7E6',
  bellstalkStalk: '#5E7EA3',
  // P07 Dartfin
  dartfinAqua: '#5CC8D8',
  dartfinTail: '#1F6F7A',
  // P08 Waterbear
  waterbearTan: '#9C8A6E',
  waterbearLegs: '#5E5040',
  // P09 Wheelgrazer
  wheelgrazerRose: '#D77FA0',
  wheelgrazerWheel: '#F7DCE8',
  // P10 Needlejaw
  needlejawBlue: '#3B5FB4',
  needlejawFork: '#B7C6EE',

  // Feature layers
  reserveAmber: '#E0A53A',
  reserveEmpty: '#F6E3B0',
  restingSeam: '#4E5620',
  restingSeamLight: '#A9B46A',
  starchNotchLight: '#E8C27A',
  starchNotch: '#5B4420',
  glowCenter: '#C6F04D',
  // Phase 3 feature layers (SPEC §9 visuals; wave 2 art-features)
  anchorFoot: '#4A3B2A',
  anchorFootLight: '#B9A57E',
  shadePatch: '#2E4430',
  shadePatchLight: '#5F7F55',
  lightTrail: '#F7E7A1',
  lightTrailDeep: '#C9A93E',
  debrisGranule: '#6B5032',
  debrisGranuleLight: '#C9A878',
  proteinNotch: '#8E3B57',
  proteinRelease: '#F7D6E0',
  matrixEdge: '#3E7D70',
  matrixEdgeLight: '#A9D3C7',
  adhesionLink: '#2C3F49',
  adhesionLinkLight: '#E8E1C9',
  // Phase 5 feature layers (SPEC §9 E02/E11 visuals, §7.8, §7.10; art-small)
  glowDim: '#D3DDB8',
  glowHalo: '#E4F7A6',
  jacketRim: '#C7D0D4',
  jacketRimDeep: '#7D8A91',

  // World tiles (UX §6.2 film textures, §6.5 food object outlines; wave 2 art-features)
  filmTeal: '#7FB9AB',
  filmDeep: '#4F8F80',
  filmLight: '#C4E3DA',
  filmDull: '#9AAEA5',
  pelletAmber: '#F0C45A',
  pelletDeep: '#B98A2C',
  pelletLight: '#FBE7AE',
  pelletOutline: '#6B4F1D',
  waferLeaf: '#A9A15A',
  waferDeep: '#7C7838',
  waferVein: '#D9CF8E',
  waferOutline: '#4E4A22',
  stain: '#C2B48C',
  stainDeep: '#A99A70',
} as const;

export type ColorName = keyof typeof P;

export function hexToRgba(hex: string, alpha = 255): [number, number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), alpha];
}
