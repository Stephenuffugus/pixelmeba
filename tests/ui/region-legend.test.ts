/**
 * Phase 5 wave 14 (P5.7 region pins; UX §9 text equivalent; D-0128): the region legend's words
 * (src/ui/strings/regions.ts) for 1, 3 and 6 regions, and nothing for none. The legend (RegionLegend.tsx) lists
 * regionLegendItem per region and renders nothing without regions; the words never claim a measurement.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REGION_TEXT, regionLegendItem, regionLegendText } from '../../src/ui/strings/regions';

const LABELS = ['Fresh pool', 'Brine pool', 'Channel', 'West wafer', 'Mesh patch', 'East wafer'];
const regions = (n: number) => LABELS.slice(0, n).map((label, k) => ({ number: k + 1, label }));

describe('region legend words', () => {
  it('one region', () => {
    expect(regionLegendText(regions(1))).toBe('Habitat regions: 1 Fresh pool.');
    expect(regionLegendItem(regions(1)[0]!)).toBe('1 Fresh pool');
  });

  it('three regions', () => {
    expect(regionLegendText(regions(3))).toBe('Habitat regions: 1 Fresh pool · 2 Brine pool · 3 Channel.');
    expect(regions(3).map(regionLegendItem)).toEqual(['1 Fresh pool', '2 Brine pool', '3 Channel']);
  });

  it('six regions', () => {
    expect(regionLegendText(regions(6))).toBe(
      'Habitat regions: 1 Fresh pool · 2 Brine pool · 3 Channel · 4 West wafer · 5 Mesh patch · 6 East wafer.',
    );
  });

  it('nothing for none', () => {
    expect(regionLegendText([])).toBeNull();
    // The component renders nothing when the dish's habitat records no region.
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'ui', 'panels', 'RegionLegend.tsx'), 'utf8');
    expect(src).toMatch(/if \(regions\.length === 0\) return null;/);
    expect(src).toMatch(/regionLegendItem\(r\)/);
    expect(src).toMatch(/role="list"/);
  });

  it('honest words: pins are habitat content, not probes, and nothing is measured', () => {
    const all = Object.values(REGION_TEXT).join(' ');
    expect(all).toMatch(/not probe regions/);
    expect(all).not.toMatch(/superior|advanced|perfect|adapted|immune|best|because/i);
  });
});
