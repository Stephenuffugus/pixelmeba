import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { drawFrame, loadAtlas } from '../atlas';
import { IconClose } from '../icons';
import { dishInfo, setTool, sheet } from '../state';
import { LIFE_COPY } from '../strings/lab';
import { dietLine, isPhage, type DietSymbol } from './LabTrayContent';

function Thumb({ asset }: { asset: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    void loadAtlas().then((a) => {
      if (ref.current) drawFrame(ref.current, a, asset);
    });
  }, [asset]);
  return <canvas ref={ref} width={48} height={48} aria-hidden="true" />;
}

/**
 * Diet symbols (UX §4.3): a small mark next to the diet line, by kind of feeding. The line itself
 * carries the meaning, so the symbol is hidden from assistive technology and never colour-only.
 */
const DIET_PATHS: Readonly<Record<DietSymbol, JSX.Element[]>> = {
  light: [<circle key="c" cx="12" cy="12" r="4" />, <path key="r" d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />],
  eats: [<circle key="a" cx="8" cy="14" r="2.5" />, <circle key="b" cx="15" cy="10" r="2.5" />, <circle key="c" cx="15.5" cy="17" r="1.8" />],
  hunts: [<circle key="a" cx="9" cy="12" r="5" />, <path key="m" d="M14 12l7-4v8z" />],
  drains: [<path key="d" d="M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z" />],
  infects: [<path key="h" d="M8 4h8l3 5-3 5H8L5 9z" />, <path key="t" d="M12 14v6M8 20l4-3 4 3" />],
  none: [<circle key="o" cx="12" cy="12" r="6" />],
};

function DietSymbolMark({ symbol }: { symbol: DietSymbol }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: '0 0 auto', marginTop: '0.2rem' }}
      data-diet-symbol={symbol}
    >
      {DIET_PATHS[symbol]}
    </svg>
  );
}

export function AddLifeSheet() {
  const info = dishInfo.value;
  const [count, setCount] = useState(5);
  if (!info) return null;
  const phages = info.speciesIds.filter((id) => isPhage(info, id));
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
        {phages.map((id) => (
          <p key={id} class="sub" data-testid={`phage-note-${id}`}>
            {LIFE_COPY.phageCountNote(info.speciesNames[info.speciesIds.indexOf(id)] ?? id)}
          </p>
        ))}
        <div class="species-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(9.5rem, 1fr))' }}>
          {info.speciesIds.map((id, i) => {
            const diet = dietLine(info, id);
            const phage = isPhage(info, id);
            return (
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
                {diet ? (
                  <span
                    class="sub"
                    data-testid={`species-${id}-diet`}
                    style={{ fontWeight: 400, display: 'flex', gap: '0.35rem', alignItems: 'flex-start', textAlign: 'left' }}
                  >
                    <DietSymbolMark symbol={diet.symbol} />
                    <span>{diet.text}</span>
                  </span>
                ) : null}
                {phage ? (
                  <span class="sub" data-testid={`species-${id}-dose`} style={{ fontWeight: 400 }}>
                    {LIFE_COPY.phageTile(count)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
