/**
 * Inspector (SPEC §12.1, UX §5): Summary → Why (Happening now / Passed to offspring) → Details.
 * All text comes from reason codes and measured values in the worker's payload.
 */
import { useState } from 'preact/hooks';
import { R } from '@sim/reasons';
import type { EntityInspect } from '@worker/protocol';
import { IconClose, IconFollow } from '../icons';
import { dishInfo, getRenderer, inspector, select } from '../state';
import { reasonText } from '../strings/reasons';

const LOCUS_NAMES = ['Motility', 'Feeding', 'Sensing', 'Division', 'pH preference', 'Salt preference', 'Warmth preference', 'Dormancy'];
const FOOD_NAMES: Record<string, string> = { sugar: 'sugar', starch: 'starch', oil: 'oil', protein: 'protein', broth: 'broth', detritus: 'debris', metabolite: 'metabolite', film: 'film' };

function Bar({ label, value, max, kind }: { label: string; value: number; max: number; kind: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div class="stat-row">
      <span>{label}</span>
      <div class={`bar ${kind}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <span style={{ textAlign: 'right' }}>{Math.round(value)}</span>
    </div>
  );
}

function strongestConstraint(e: EntityInspect): { code: number; value: number } {
  if (e.limitCode !== R.NONE) return { code: e.limitCode, value: e.limitValue };
  if (e.divisionBlockers.length > 0 && e.B >= 1.5 * e.B0) return { code: e.divisionBlockers[0]!, value: 0 };
  if (e.predation) return { code: e.predation.code, value: 0 };
  return { code: R.NONE, value: 0 };
}

function actionOf(e: EntityInspect): string {
  if (e.flags & (1 << 2)) return e.predation ? 'Digesting' : 'Eating';
  if (e.flags & (1 << 3)) return 'Hunting';
  if (e.flags & (1 << 1)) return 'Stressed';
  if (e.flags & (1 << 6)) return 'Moving';
  return 'Resting in place';
}

function EntityView({ e }: { e: EntityInspect }) {
  const info = dishInfo.value;
  const [tab, setTab] = useState<'now' | 'inherited' | 'evidence'>('now');
  const name = info?.speciesNames[e.speciesIdx] ?? e.speciesId;
  const c = strongestConstraint(e);
  const ready = e.divisionBlockers.length === 0;
  return (
    <>
      <header>
        <div style={{ flex: 1 }}>
          <h2>
            {name} <span class="sub">#{e.birthId}</span>
          </h2>
          <div class="chips" style={{ marginTop: '0.25rem' }}>
            <span class="chip">{actionOf(e)}</span>
            <span class="chip">age {Math.floor(e.age)} s</span>
            <span class="chip">generation {e.generation}</span>
            {e.origin === 1 ? <span class="chip">added by you or the recipe</span> : null}
          </div>
        </div>
        <button
          class="btn ghost"
          aria-label="Follow"
          onClick={() => {
            const r = getRenderer();
            if (r) r.camera.followEntityId = e.entityId;
          }}
        >
          <IconFollow />
        </button>
        <button class="btn ghost" aria-label="Close" onClick={() => select(null)}>
          <IconClose />
        </button>
      </header>
      <p class="constraint" data-testid="constraint">
        {reasonText(c.code, 'explore')}
        {c.code !== R.NONE ? <span class="sub"> {reasonText(c.code, 'lab', { value: c.value })}</span> : null}
      </p>
      <Bar label="Energy" value={e.E} max={e.energyCap} kind="energy" />
      <Bar label="Health" value={e.H} max={100} kind="health" />
      <Bar label="Body" value={(e.B / (2 * e.B0)) * 100} max={100} kind="" />
      <div class="tabs" role="tablist">
        <button class="btn" role="tab" aria-selected={tab === 'now'} aria-pressed={tab === 'now'} onClick={() => setTab('now')}>
          Happening now
        </button>
        <button class="btn" role="tab" aria-selected={tab === 'inherited'} aria-pressed={tab === 'inherited'} onClick={() => setTab('inherited')}>
          Passed to offspring
        </button>
        <button class="btn" role="tab" aria-selected={tab === 'evidence'} aria-pressed={tab === 'evidence'} onClick={() => setTab('evidence')}>
          Details
        </button>
      </div>
      {tab === 'now' ? (
        <div role="tabpanel">
          <p style={{ margin: '0.25rem 0' }}>
            <strong>{ready ? 'Ready to split' : 'Before it can split:'}</strong>
          </p>
          {!ready ? (
            <ul style={{ margin: '0 0 0.5rem 1.1rem', padding: 0 }}>
              {e.divisionBlockers.map((b) => (
                <li key={b}>{reasonText(b, 'explore')}</li>
              ))}
            </ul>
          ) : null}
          <dl class="kv">
            <dt>Food here</dt>
            <dd>{e.foodHere.length === 0 ? (e.predation ? 'eats other organisms' : 'makes its own from light') : e.foodHere.map((f) => `${FOOD_NAMES[f.food] ?? f.food} ${f.amount.toFixed(3)}`).join(' · ')}</dd>
            <dt>Ate last second</dt>
            <dd>{e.intakeLastSecond.toFixed(4)} carbon</dd>
            <dt>Conditions</dt>
            <dd>{Math.round(e.suitability * 100)} % suitable</dd>
            {e.predation ? (
              <>
                <dt>Hunting</dt>
                <dd>{reasonText(e.predation.code, 'explore')}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}
      {tab === 'inherited' ? (
        <div role="tabpanel">
          <p class="sub">
            {e.genome.changedFromParent ? 'This offspring inherited a different trait from its parent.' : 'Same inherited traits as its parent.'} Genome {e.genome.id.slice(0, 6)}.
          </p>
          <dl class="kv">
            {e.genome.loci.map((v, i) =>
              e.genome.lociActive[i] ? (
                <>
                  <dt>{LOCUS_NAMES[i]}</dt>
                  <dd>
                    {v}
                    {v !== 50 ? ` (${v > 50 ? '+' : ''}${v - 50} from the ancestor)` : ''}
                  </dd>
                </>
              ) : null,
            )}
            <dt>Feeding policy</dt>
            <dd>{e.profile.policy === 'ordered' ? `in order: ${e.profile.foods.join(', ') || '—'}` : `weighted: ${e.profile.weights?.map((w) => w.toFixed(2)).join(' / ')}`}</dd>
            <dt>Extra abilities</dt>
            <dd>{e.genome.modules.length ? e.genome.modules.join(', ') : 'none'}</dd>
          </dl>
        </div>
      ) : null}
      {tab === 'evidence' ? (
        <div role="tabpanel">
          <dl class="kv">
            <dt>Biomass</dt>
            <dd>
              {e.B.toFixed(3)} (splits at {(2 * e.B0).toFixed(2)})
            </dd>
            <dt>Bound nutrient</dt>
            <dd>{e.N.toFixed(4)}</dd>
            <dt>Energy</dt>
            <dd>
              {e.E.toFixed(1)} / {e.energyCap}
            </dd>
            <dt>Intake ceiling</dt>
            <dd>{e.profile.q.toFixed(3)} C/s</dd>
            <dt>Upkeep</dt>
            <dd>{e.profile.m.toFixed(3)} energy/s</dd>
            <dt>Speed · senses</dt>
            <dd>
              {e.profile.speed.toFixed(2)} cells/s · {e.profile.sensing} cells
            </dd>
            <dt>Division</dt>
            <dd>
              after {e.profile.minDivisionAge.toFixed(0)} s, costs {e.profile.divisionCost.toFixed(0)} energy
            </dd>
            <dt>Prefers pH</dt>
            <dd>
              {e.profile.ph[0].toFixed(1)}–{e.profile.ph[1].toFixed(1)} (fit {Math.round(e.suitFactors.ph * 100)} %)
            </dd>
            <dt>Parent</dt>
            <dd>{e.parentBirthId > 0 ? `#${e.parentBirthId}` : 'introduced'}</dd>
            <dt>Position</dt>
            <dd>
              {e.x.toFixed(1)}, {e.y.toFixed(1)}
            </dd>
          </dl>
        </div>
      ) : null}
    </>
  );
}

export function InspectorSheet() {
  const p = inspector.value;
  if (!p) return null;
  return (
    <section class="sheet" aria-label="Inspector" data-testid="inspector">
      {p.kind === 'entity' && p.entity ? <EntityView e={p.entity} /> : null}
      {p.kind === 'cell' && p.cell ? (
        <>
          <header>
            <h2>
              Cell {p.cell.x}, {p.cell.y}
            </h2>
            <button class="btn ghost" aria-label="Close" onClick={() => select(null)}>
              <IconClose />
            </button>
          </header>
          <dl class="kv">
            <dt>Ground</dt>
            <dd>
              {p.cell.structure === 'none' ? p.cell.substrate : p.cell.structure}
            </dd>
            <dt>pH · light</dt>
            <dd>
              {p.cell.ph.toFixed(1)} · {p.cell.light.toFixed(2)}
            </dd>
            {Object.entries(p.cell.fields)
              .filter(([, v]) => v > 1e-6)
              .map(([k, v]) => (
                <>
                  <dt>{FOOD_NAMES[k] ?? k}</dt>
                  <dd>{v.toFixed(4)}</dd>
                </>
              ))}
            <dt>Residents</dt>
            <dd>{p.cell.residents.length === 0 ? 'none' : p.cell.residents.map((r) => r.speciesId).join(', ')}</dd>
          </dl>
        </>
      ) : null}
      {p.kind === 'gone' && p.gone ? (
        <>
          <header>
            <h2>{p.gone.divided ? 'It split in two' : 'No longer alive'}</h2>
            <button class="btn ghost" aria-label="Close" onClick={() => select(null)}>
              <IconClose />
            </button>
          </header>
          {p.gone.divided ? (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {p.gone.children.map((b) => (
                <button key={b} class="btn" onClick={() => select({ kind: 'entity', birthId: b })}>
                  Follow daughter #{b}
                </button>
              ))}
            </div>
          ) : (
            <p class="constraint">{reasonText(p.gone.cause, 'explore')}</p>
          )}
        </>
      ) : null}
    </section>
  );
}
