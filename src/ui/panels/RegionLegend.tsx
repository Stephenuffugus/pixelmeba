/**
 * Phase 5 wave 14 (P5.7 region pins; UX §9 "a text equivalent"; D-0128): the text legend of the numbered pins the
 * renderer draws at each region anchor of the dish's own recorded habitat (DishInfo.regions). Mounted at the top of
 * the Regions sheet (ProbePanel.tsx), where the player compares regions. Renders nothing when the dish's habitat
 * records no region (every v1.0 dish).
 */
import { dishInfo } from '../state';
import { REGION_TEXT, regionLegendItem } from '../strings/regions';

export function RegionLegend() {
  const regions = dishInfo.value?.regions ?? [];
  if (regions.length === 0) return null;
  return (
    <section class="region-legend" aria-labelledby="region-legend-title" data-testid="region-legend">
      <h3 id="region-legend-title">{REGION_TEXT.title}</h3>
      <ul class="probe-list" role="list" aria-label={REGION_TEXT.listLabel} data-testid="region-legend-list">
        {regions.map((r) => (
          <li key={r.id} data-testid={`region-legend-${r.number}`}>
            {regionLegendItem(r)}
          </li>
        ))}
      </ul>
      <p class="sub">{REGION_TEXT.note}</p>
    </section>
  );
}
