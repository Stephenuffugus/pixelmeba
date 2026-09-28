/**
 * Inspector (SPEC §12.1, UX §5): Summary → Why (Happening now / Passed to offspring) → Details.
 * All text comes from reason codes and measured values in the worker's payload.
 */
import { signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { R } from '@sim/reasons';
import type { EntityInspect, FamilyAnswer } from '@worker/protocol';
import { IconClose, IconFollow } from '../icons';
import {
  askFamily,
  clearFamily,
  dishInfo,
  familyView,
  getRenderer,
  inspector,
  openHistoryFor,
  select,
  showOrganism,
} from '../state';
import { reasonText } from '../strings/reasons';
import { dietAnswer, familySummary, relationLabel, stopAnswer } from '../strings/shortcuts';
import { dormancyLines, energyCapText, LIFE_ACTIVE, lifeStateLabel, moduleText, originChip, upkeepText } from '../strings/modules';
import { openLineage } from './LineageState';
import { paintName, structureName } from './LabTrayNames';
import { PAINT_TARGETS, PLACEABLE_STRUCTURES, type PaintTarget, type PlaceableStructure } from '@sim/grid';

/** The cell's ground in content words ("Impermeable wall", "Gel"), never the simulation's codes. */
function groundName(substrate: string, structure: string): string {
  if (structure !== 'none') {
    return (PLACEABLE_STRUCTURES as readonly string[]).includes(structure) ? structureName(structure as PlaceableStructure) : 'Structure';
  }
  return (PAINT_TARGETS as readonly string[]).includes(substrate) ? paintName(dishInfo.value, substrate as PaintTarget) : substrate;
}

const LOCUS_NAMES = [
  'Motility',
  'Feeding',
  'Sensing',
  'Division',
  'pH preference',
  'Salt preference',
  'Warmth preference',
  'Dormancy',
];
const FOOD_NAMES: Record<string, string> = {
  sugar: 'sugar',
  starch: 'starch',
  oil: 'oil',
  protein: 'protein',
  broth: 'broth',
  detritus: 'debris',
  metabolite: 'metabolite',
  film: 'film',
};
/** Family members listed in the inspector before "Show more". */
const FAMILY_LIST_STEP = 6;

function Bar({ label, value, max, kind }: { label: string; value: number; max: number; kind: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div class="stat-row">
      <span>{label}</span>
      <div
        class={`bar ${kind}`}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
      >
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
  // A life state other than Active (Preparing, Resting, Waking) is the organism's real state (P2.1).
  if (e.lifeState !== LIFE_ACTIVE) return lifeStateLabel(e.lifeState);
  if (e.flags & (1 << 2)) return e.predation ? 'Digesting' : 'Eating';
  if (e.flags & (1 << 3)) return 'Hunting';
  if (e.flags & (1 << 1)) return 'Stressed';
  if (e.flags & (1 << 6)) return 'Moving';
  // Not "resting": that word now names the resting stage.
  return 'Staying in place';
}

function FamilyList({ f, onHide }: { f: FamilyAnswer; onHide: () => void }) {
  const [shown, setShown] = useState(FAMILY_LIST_STEP);
  const s = familySummary(f);
  return (
    <>
      {s.lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
      {f.members.length > 0 ? (
        <>
          <p class="sub">Family members are marked with rings on the dish. Choose one to look at it.</p>
          <ul class="family-list" aria-label="Living family members">
            {f.members.slice(0, shown).map((m) => (
              <li key={m.birthId}>
                <button
                  class="btn"
                  data-testid="family-member"
                  onClick={() => {
                    const p = getRenderer()?.positionOf(m.entityId) ?? [m.x, m.y];
                    showOrganism(m.birthId, p[0], p[1]);
                  }}
                >
                  #{m.birthId} · {relationLabel(m)} · generation {m.generation}
                </button>
              </li>
            ))}
          </ul>
          <div class="answer-actions">
            {shown < f.members.length ? (
              <button class="btn" onClick={() => setShown(shown + FAMILY_LIST_STEP)}>
                Show more
              </button>
            ) : null}
            <button
              class="btn"
              onClick={() => {
                clearFamily();
                onHide();
              }}
            >
              Hide family rings
            </button>
          </div>
        </>
      ) : null}
      {/* P2.3: the named branches this organism's family belongs to (the family tree panel). */}
      <div class="answer-actions">
        <button class="btn" data-testid="open-lineage" onClick={() => void openLineage({ birthId: f.birthId })}>
          Family tree
        </button>
      </div>
    </>
  );
}

type Answer = 'eat' | 'family' | null;

/** Four decimals, but a nonzero amount never reads as "0.0000". */
function amount(v: number): string {
  if (v > 0 && v < 0.00005) return 'trace (< 0.0001)';
  return v.toFixed(4);
}

/** Collapsed inspector: header and constraint sentence only (UX §4.1 reposition route). */
const collapsed = signal(false);

/**
 * UX §4.1: a panel never covers the selected organism without a way out. After the inspector opens,
 * changes organism, or collapses/expands, move the view so the organism sits in the part of the
 * viewport the sheet (portrait) or side panel (landscape) leaves uncovered. Zoom never changes.
 */
function keepSelectionVisible(sheetEl: HTMLElement, entityId: number, fallback: [number, number]): void {
  const r = getRenderer();
  const vp = document.querySelector<HTMLElement>('[data-testid="viewport"]');
  if (!r || !vp) return;
  const v = vp.getBoundingClientRect();
  const s = sheetEl.getBoundingClientRect();
  const [x, y] = r.positionOf(entityId) ?? fallback;
  const cam = r.camera;
  const [sx, sy] = cam.worldToScreen(x, y);
  const M = 32;
  if (s.bottom >= v.bottom - 4 && s.width >= v.width * 0.9) {
    const visH = s.top - v.top;
    if (visH > 2 * M && (sy > visH - M || sy < M)) cam.revealAt(x, y, visH / 2, sx);
  } else if (s.left > v.left + v.width / 3) {
    const visW = s.left - v.left;
    if (visW > 2 * M && (sx > visW - M || sx < M)) cam.revealAt(x, y, sy, visW / 2);
  }
}

function EntityView({ e }: { e: EntityInspect }) {
  const info = dishInfo.value;
  const [tab, setTab] = useState<'now' | 'inherited' | 'evidence'>('now');
  const [answer, setAnswer] = useState<Answer>(null);
  const [whyFocus, setWhyFocus] = useState(0);
  const whyRef = useRef<HTMLElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const name = info?.speciesNames[e.speciesIdx] ?? e.speciesId;
  const c = strongestConstraint(e);
  const stop = stopAnswer(e);
  const fam = familyView.value;
  const family = fam && fam.birthId === e.birthId ? fam : null;

  // A different organism: its answers start closed (family rings stay until hidden or deselected).
  useEffect(() => setAnswer(null), [e.birthId]);
  useEffect(() => {
    if (whyFocus === 0 || !whyRef.current) return;
    whyRef.current.scrollIntoView({ block: 'nearest' });
    whyRef.current.focus({ preventScroll: true });
  }, [whyFocus]);
  useEffect(() => {
    if (answer) answerRef.current?.scrollIntoView({ block: 'nearest' });
  }, [answer, family]);

  const diet = answer === 'eat' ? dietAnswer(e, info?.speciesNames ?? []) : null;
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
            {originChip(e.origin) ? <span class="chip">{originChip(e.origin)}</span> : null}
            {e.dormancy && e.dormancy.state === LIFE_ACTIVE && e.dormancy.lockoutSeconds > 0 ? (
              <span class="chip">just woke up</span>
            ) : null}
          </div>
        </div>
        <button
          class="btn ghost"
          aria-label={collapsed.value ? 'Expand inspector' : 'Collapse inspector'}
          aria-expanded={!collapsed.value}
          data-testid="inspector-collapse"
          onClick={() => (collapsed.value = !collapsed.value)}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d={collapsed.value ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
          </svg>
        </button>
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
      {collapsed.value ? null : (
        <>
          <Bar label="Energy" value={e.E} max={e.energyCap} kind="energy" />
          <Bar label="Health" value={e.H} max={100} kind="health" />
          <Bar label="Body" value={(e.B / (2 * e.B0)) * 100} max={100} kind="" />
          <div class="shortcuts" role="group" aria-label="Questions">
            <button
              class="btn"
              aria-pressed={answer === 'eat'}
              data-testid="shortcut-eat"
              onClick={() => setAnswer(answer === 'eat' ? null : 'eat')}
            >
              What does it eat?
            </button>
            <button
              class="btn"
              data-testid="shortcut-why"
              onClick={() => {
                setAnswer(null);
                setTab('now');
                setWhyFocus(whyFocus + 1);
              }}
            >
              Why did it stop?
            </button>
            <button
              class="btn"
              aria-pressed={answer === 'family'}
              data-testid="shortcut-family"
              onClick={() => {
                if (answer === 'family') {
                  setAnswer(null);
                  clearFamily();
                  return;
                }
                setAnswer('family');
                // A failed lookup shows a toast; close the answer so it never waits forever.
                void askFamily(e.birthId).then((f) => {
                  if (!f) setAnswer((a) => (a === 'family' ? null : a));
                });
              }}
            >
              Where is its family?
            </button>
            <button
              class="btn"
              data-testid="shortcut-changed"
              onClick={() => openHistoryFor(e.speciesIdx, e.birthId)}
            >
              What changed?
            </button>
          </div>
          {answer ? (
            <div
              class="answer"
              role="region"
              aria-label={answer === 'eat' ? 'What it eats' : 'Its family'}
              aria-live="polite"
              data-testid="shortcut-answer"
              ref={answerRef}
            >
              <h3>{answer === 'eat' ? 'What it eats' : 'Its family'}</h3>
              {diet ? diet.lines.map((l) => <p key={l}>{l}</p>) : null}
              {answer === 'family' ? (
                family ? (
                  <FamilyList key={family.tick} f={family} onHide={() => setAnswer(null)} />
                ) : (
                  <p class="sub">Looking up its family…</p>
                )
              ) : null}
            </div>
          ) : null}
          <div class="tabs" role="tablist">
            <button class="btn" role="tab" aria-selected={tab === 'now'} onClick={() => setTab('now')}>
              Happening now
            </button>
            <button
              class="btn"
              role="tab"
              aria-selected={tab === 'inherited'}
              onClick={() => setTab('inherited')}
            >
              Passed to offspring
            </button>
            <button
              class="btn"
              role="tab"
              aria-selected={tab === 'evidence'}
              onClick={() => setTab('evidence')}
            >
              Details
            </button>
          </div>
          {tab === 'now' ? (
            <div role="tabpanel">
              <section
                class={`why${whyFocus > 0 ? ' focused' : ''}`}
                tabIndex={-1}
                ref={whyRef}
                aria-labelledby="why-title"
                data-testid="why-stop"
              >
                <h3 id="why-title">What's holding it back</h3>
                <p>
                  <strong>{stop.title}</strong>
                </p>
                {stop.items.length > 0 ? (
                  <ul>
                    {stop.items.map((it) => (
                      <li key={it.code}>
                        {it.text} <span class="sub">{it.detail}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
              {e.dormancy && (e.dormancy.state !== LIFE_ACTIVE || e.dormancy.lockoutSeconds > 0 || e.dormancy.noIntakeSeconds > 0.05) ? (
                <section aria-labelledby="rest-title" data-testid="resting-stage">
                  <h3 id="rest-title">Resting stage</h3>
                  {dormancyLines(e.dormancy, e.E).map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                </section>
              ) : null}
              <dl class="kv">
                <dt>Food here</dt>
                <dd>
                  {e.foodHere.length === 0
                    ? e.predation
                      ? 'eats other organisms'
                      : 'makes its own from light'
                    : e.foodHere
                        .map((f) => `${FOOD_NAMES[f.food] ?? f.food} ${f.amount.toFixed(3)}`)
                        .join(' · ')}
                </dd>
                <dt>Ate last second</dt>
                <dd>{amount(e.intakeLastSecond)} carbon</dd>
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
                {e.genome.changedFromParent
                  ? 'This offspring inherited a different trait from its parent.'
                  : 'Same inherited traits as its parent.'}{' '}
                Genome {e.genome.id.slice(0, 6)}.
              </p>
              <dl class="kv">
                {e.genome.loci.map((v, i) =>
                  e.lociActiveEffective[i] ? (
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
                <dd>
                  {e.profile.policy === 'ordered'
                    ? `in order: ${e.profile.foods.join(', ') || '—'}`
                    : `weighted: ${e.profile.weights?.map((w) => w.toFixed(2)).join(' / ')}`}
                </dd>
                <dt>Extra abilities</dt>
                <dd>{e.modules.length ? `${e.modules.length} of 3 slots used` : 'none'}</dd>
              </dl>
              {e.modules.length > 0 ? (
                <ul class="module-list" aria-label="Extra abilities" data-testid="module-list">
                  {e.modules.map((m) => {
                    const t = moduleText(m);
                    return (
                      <li key={m.id}>
                        <strong>{t.name}</strong> <span class="sub">({t.id})</span>
                        <br />
                        {t.does} <span class="sub">{t.costs}</span>
                        {t.now ? <span class="sub"> {t.now}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
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
                <dd>{energyCapText(e)}</dd>
                <dt>Intake ceiling</dt>
                <dd>{e.profile.q.toFixed(3)} C/s</dd>
                <dt>Upkeep</dt>
                <dd>{upkeepText(e)}</dd>
                <dt>Speed · senses</dt>
                <dd>
                  {e.profile.speed.toFixed(2)} cells/s · {e.profile.sensing} cells
                </dd>
                <dt>Division</dt>
                <dd>
                  after {e.profile.minDivisionAge.toFixed(0)} s, costs {e.profile.divisionCost.toFixed(0)}{' '}
                  energy
                </dd>
                <dt>Prefers pH</dt>
                <dd>
                  {e.profile.ph[0].toFixed(1)}–{e.profile.ph[1].toFixed(1)} (fit{' '}
                  {Math.round(e.suitFactors.ph * 100)} %)
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
      )}
    </>
  );
}

export function InspectorSheet() {
  const p = inspector.value;
  const ref = useRef<HTMLElement>(null);
  const entity = p?.kind === 'entity' ? p.entity : undefined;
  const birthId = entity?.birthId ?? -1;
  const isCollapsed = collapsed.value;
  useLayoutEffect(() => {
    if (!entity || !ref.current) return;
    keepSelectionVisible(ref.current, entity.entityId, [entity.x, entity.y]);
    // Only when the organism or the sheet size changes; live payload updates must not move the view.
  }, [birthId, isCollapsed]);
  if (!p) return null;
  return (
    <section
      class={`sheet${isCollapsed ? ' inspector-collapsed' : ''}`}
      aria-label="Inspector"
      data-testid="inspector"
      ref={ref}
    >
      <div class="sheet-scroll">
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
              <dd>{groundName(p.cell.substrate, p.cell.structure)}</dd>
              <dt>pH · light</dt>
              <dd>
                {p.cell.ph.toFixed(1)} · {p.cell.light.toFixed(2)}
              </dd>
              {Object.entries(p.cell.fields)
                .filter(([, v]) => v > 1e-6)
                .map(([k, v]) => (
                  <>
                    <dt>{FOOD_NAMES[k] ?? k}</dt>
                    <dd>{amount(v)}</dd>
                  </>
                ))}
              <dt>Residents</dt>
              <dd>
                {p.cell.residents.length === 0 ? 'none' : p.cell.residents.map((r) => r.speciesId).join(', ')}
              </dd>
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
      </div>
    </section>
  );
}
