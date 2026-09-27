import { useEffect, useRef, useState } from 'preact/hooks';
import { drawFrame, loadAtlas } from '../atlas';
import { IconClose } from '../icons';
import { dishInfo, setTool, sheet } from '../state';

const DIETS: Record<string, string> = {
  B01: 'Eats sugar',
  B04: 'Eats debris and solid food',
  B06: 'Eats sugar; unlocks starch',
  A01: 'Makes food from light',
  P01: 'Eats small organisms',
};

function Thumb({ asset }: { asset: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    void loadAtlas().then((a) => {
      if (ref.current) drawFrame(ref.current, a, asset);
    });
  }, [asset]);
  return <canvas ref={ref} width={48} height={48} aria-hidden="true" />;
}

export function AddLifeSheet() {
  const info = dishInfo.value;
  const [count, setCount] = useState(5);
  if (!info) return null;
  return (
    <section class="sheet" aria-labelledby="addlife-title">
      <div class="sheet-scroll">
        <header>
          <h2 id="addlife-title">Add Life</h2>
          <button class="btn ghost" aria-label="Close" onClick={() => (sheet.value = 'none')}>
            <IconClose />
          </button>
        </header>
        <p class="sub">Choose an organism, then tap the dish to place it. Nothing else appears on its own.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
          <span class="sub">How many</span>
          <div class="segmented" role="group" aria-label="How many">
            {[1, 5, 20].map((n) => (
              <button key={n} class="btn" aria-pressed={count === n} onClick={() => setCount(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div class="species-grid">
          {info.speciesIds.map((id, i) => (
            <button
              key={id}
              class="btn species-tile"
              data-testid={`species-${id}`}
              onClick={() => {
                setTool({ kind: 'addLife', speciesId: id, count, radius: 3 });
                sheet.value = 'none';
              }}
            >
              <Thumb asset={info.speciesAssets[i]!} />
              <span>{info.speciesNames[i]}</span>
              <span class="sub" style={{ fontWeight: 400 }}>
                {DIETS[id] ?? ''}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
