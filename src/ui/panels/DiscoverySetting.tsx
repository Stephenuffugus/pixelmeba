/**
 * "Pause when a new branch is named" (UX §2 Settings "pause on discoveries"; P2.3). A device
 * preference, off unless chosen; it only pauses the dish when a discovery card opens and never
 * changes the simulation. Shown in Settings (UX §2) and in the family tree.
 */
import { settings, updateSettings } from '../state';
import { LINEAGE_TEXT as T } from '../strings/lineage';

export function PauseOnDiscoveriesToggle() {
  const on = settings.value.pauseOnDiscoveries === true;
  return (
    <label class="lineage-check">
      <input type="checkbox" checked={on} onChange={(e) => updateSettings({ pauseOnDiscoveries: e.currentTarget.checked })} data-testid="pause-on-discoveries" />
      {T.pauseOnDiscoveries}
    </label>
  );
}
