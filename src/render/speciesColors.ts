/** Base identity colors per species for aggregation, legends and markers (UX §6.1). */
const HEX: Readonly<Record<string, string>> = {
  B01: '#EF7B6C',
  B02: '#32A89A',
  B03: '#8B82C6',
  B04: '#D6A64D',
  B05: '#4A90C2',
  B06: '#C8963E',
  B07: '#2E4A7A',
  B08: '#D98CA6',
  B09: '#3FB3A6',
  B10: '#B5552F',
  B11: '#C93B3B',
  B12: '#8B9A3C',
  B13: '#A8412F',
  Y01: '#F2E6C9',
  Y02: '#F5EBD3',
  F01: '#EFE3C6',
  F02: '#B87333',
  F03: '#C98A2B',
  F04: '#B9BEC4',
  A01: '#8CBA4B',
  A02: '#E0B84A',
  A03: '#2F6B3A',
  A04: '#6FAE4E',
  A05: '#2E9E5B',
  P01: '#B8AEDC',
  P02: '#7FD6E8',
  P03: '#F3B48E',
  P04: '#8A5A3C',
  P05: '#EADFC8',
  P06: '#A9C7E6',
  P07: '#5CC8D8',
  P08: '#9C8A6E',
  P09: '#D77FA0',
  P10: '#3B5FB4',
  X01: '#E3C15A',
  X02: '#8C6E9E',
  V01: '#3E7BC4',
  V02: '#6A4FB3',
};

export function speciesHex(id: string): string {
  return HEX[id] ?? '#FFFFFF';
}

export function speciesRgb(id: string): [number, number, number] {
  const h = speciesHex(id).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
