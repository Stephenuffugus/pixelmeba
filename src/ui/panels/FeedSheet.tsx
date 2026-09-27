import { useState } from 'preact/hooks';
import { IconClose, IconPaint } from '../icons';
import { dishInfo, setTool, sheet } from '../state';

const FOODS = ['SUGAR', 'STARCH', 'DEBRIS', 'NUTRIENT'];

export function FeedSheet() {
  const info = dishInfo.value;
  const [materialId, setMaterial] = useState('SUGAR');
  const [doseIdx, setDoseIdx] = useState(1);
  const [radius, setRadius] = useState(3);
  const [showDose, setShowDose] = useState(false);
  const [paint, setPaint] = useState(false);
  if (!info) return null;
  const mats = info.materials.filter((m) => FOODS.includes(m.id));
  const mat = mats.find((m) => m.id === materialId) ?? mats[0];
  if (!mat) return null;
  const dose = mat.doses[doseIdx] ?? 0.1;
  return (
    <section class="sheet" aria-labelledby="feed-title">
      <header>
        <h2 id="feed-title">Feed</h2>
        <button class="btn ghost" aria-label="Close" onClick={() => (sheet.value = 'none')}>
          <IconClose />
        </button>
      </header>
      <p class="sub">Pick a food, then tap the dish. Food is finite: nothing refills it for you.</p>
      <div class="chips" role="radiogroup" aria-label="Food" style={{ margin: '0.5rem 0' }}>
        {mats.map((m) => (
          <button key={m.id} class="btn" role="radio" aria-checked={m.id === materialId} aria-pressed={m.id === materialId} onClick={() => setMaterial(m.id)}>
            {m.name}
          </button>
        ))}
      </div>
      <button class="btn ghost" aria-expanded={showDose} onClick={() => setShowDose(!showDose)}>
        Dose: {dose} per cell · radius {radius}
      </button>
      {showDose ? (
        <div style={{ display: 'grid', gap: '0.5rem', margin: '0.5rem 0' }}>
          <div class="segmented" role="group" aria-label="Dose per cell">
            {mat.doses.map((d, i) => (
              <button key={d} class="btn" aria-pressed={i === doseIdx} onClick={() => setDoseIdx(i)}>
                {d}
              </button>
            ))}
          </div>
          <div class="segmented" role="group" aria-label="Brush radius">
            {[1, 3, 6].map((r) => (
              <button key={r} class="btn" aria-pressed={r === radius} onClick={() => setRadius(r)}>
                r {r}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button class="btn" aria-pressed={paint} onClick={() => setPaint(!paint)}>
          <IconPaint /> Paint
        </button>
        <button
          class="btn primary"
          style={{ flex: 1 }}
          data-testid="feed-choose"
          onClick={() => {
            setTool({ kind: 'feed', materialId: mat.id, dose, radius, paint });
            sheet.value = 'none';
          }}
        >
          Place {mat.name.toLowerCase()}
        </button>
      </div>
    </section>
  );
}
