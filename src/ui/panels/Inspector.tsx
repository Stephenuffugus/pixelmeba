/**
 * Inspector (SPEC §12.1, UX §5): Summary → Why (Happening now / Passed to offspring) → Details.
 * All text comes from reason codes and measured values in the worker's payload.
 */
import { signal } from '@preact/signals';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { CellInspect, EntityInspect, FamilyAnswer } from '@worker/protocol';
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
import { R } from '@sim/reasons';
import { constraintWords, dietAnswer, familySummary, leadConstraint, makesOwnFood, relationLabel, stopAnswer } from '../strings/shortcuts';
import { inheritedLead, LOCUS_NAMES, locusNote } from '../strings/inherited';
import { actionLabel, dormancyChip, dormancyLines, energyCapText, LIFE_ACTIVE, moduleText, originChip, upkeepText } from '../strings/modules';
import { founderStartText, moduleSourceText } from '../strings/modes';
import { openLineage } from './LineageState';
import { ReactionLedger } from './ReactionLedger';
import { paintName, structureName } from './LabTrayNames';
import { dishView } from '../views/LabView';
import { PAINT_TARGETS, PLACEABLE_STRUCTURES, type PaintTarget, type PlaceableStructure } from '@sim/grid';

/** The cell's ground in content words ("Impermeable wall", "Gel"), never the simulation's codes. */
function groundName(substrate: string, structure: string): string {
  if (structure !== 'none') {
    return (PLACEABLE_STRUCTURES as readonly string[]).includes(structure) ? structureName(structure as PlaceableStructure) : 'Structure';
  }
  return (PAINT_TARGETS as readonly string[]).includes(substrate) ? paintName(dishInfo.value, substrate as PaintTarget) : substrate;
}

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
/**
 * Cell panel names (m15): what a field holds, capitalised like "Ground" (fallback: the field id). The
 * "…N" fields are the mineral nutrient bound in a food.
 */
const CELL_FIELD_NAMES: Record<string, string> = {
  sugar: 'Sugar',
  sugarN: 'Nutrient in sugar',
  starch: 'Starch',
  starchN: 'Nutrient in starch',
  oil: 'Oil',
  oilN: 'Nutrient in oil',
  protein: 'Protein',
  proteinN: 'Nutrient in protein',
  broth: 'Broth',
  brothN: 'Nutrient in broth',
  detritus: 'Debris',
  detritusN: 'Nutrient in debris',
  metabolite: 'Metabolite',
  film: 'Biofilm',
  filmN: 'Nutrient in biofilm',
  nutrient: 'Mineral nutrient',
  oxygen: 'Oxygen',
  co2: 'Carbon dioxide',
  acid: 'Acid',
  base: 'Base',
  buffer: 'Buffer',
  salt: 'Salt',
  silicate: 'Silicate',
  grit: 'Grit',
  eStarch: 'Starch enzyme',
  eOil: 'Oil enzyme',
  eProtein: 'Protein enzyme',
  inhBact: 'Bacterial inhibitor',
  inhFung: 'Fungal inhibitor',
  inhPhoto: 'Photosynthetic inhibitor',
};

/** Pools with their own cell lines (P3.1), left out of the generic pool list. */
const OWN_CELL_LINES: readonly string[] = ['salt', 'oxygen', 'inhBact', 'inhFung', 'inhPhoto'];

/** Who each inhibitor targets (CT §3.4), as the cell inspector names it. */
const EXPOSURE_WHO: Record<string, string> = {
  bacterial: 'Bacteria',
  fungal: 'Yeasts and fungi',
  photosynthetic: 'Algae',
};

type CellView = CellInspect;

/** "Bacteria 0.10 (growth × 0.91, −0.80 health/s)"; "None here." when no inhibitor is present (P3.1). */
function exposureText(e: NonNullable<CellView['exposure']>): string {
  const hit = e.lines.filter((l) => l.amount > 0);
  if (hit.length === 0) return 'None here.';
  const parts = hit.map(
    (l) =>
      `${EXPOSURE_WHO[l.category] ?? l.category} ${l.exposure.toFixed(2)} (growth × ${l.growthFactor.toFixed(2)}, −${l.damagePerSecond.toFixed(2)} health/s)`,
  );
  return `${parts.join('; ')}.${e.filmHalves ? ' Biofilm here halves it.' : ''} Other organisms are not affected.`;
}

/**
 * P3.3 (W2-08): segments and separate threads are counted apart — "Threadlace: 12 segments in 3
 * separate threads; this one has 5." Numbers come from the worker (fungi.ts fungalNetwork).
 */
function networkText(name: string, n: NonNullable<EntityInspect['network']>): string {
  const seg = (k: number) => `${k} ${k === 1 ? 'segment' : 'segments'}`;
  const threads = `${n.threads} separate ${n.threads === 1 ? 'thread' : 'threads'}`;
  return `${name}: ${seg(n.segments)} in ${threads}; this one has ${seg(n.thisThread)}.`;
}

/**
 * P3.6: what an F02 segment passed along its transport links (measured, fungalTransport.ts): "Sent 0.120
 * carbon to 2 linked segments in the last 10 s. Received 0.040 carbon from 1 linked segment in the last
 * 10 s." Energy is never shared, so only carbon is named.
 */
function transferText(t: NonNullable<EntityInspect['transfer']>): string {
  const seg = (k: number) => `${k} linked ${k === 1 ? 'segment' : 'segments'}`;
  const win = `in the last ${t.windowSeconds} s`;
  const parts: string[] = [];
  if (t.sentC > 0) parts.push(`Sent ${t.sentC.toFixed(3)} carbon to ${seg(t.sentTo)} ${win}.`);
  if (t.receivedC > 0) parts.push(`Received ${t.receivedC.toFixed(3)} carbon from ${seg(t.receivedFrom)} ${win}.`);
  return parts.length > 0 ? parts.join(' ') : `No carbon moved along its links ${win}.`;
}

/**
 * P3.6 (SPEC §5.1): the cell's food object and what it still holds, named from the dish's content:
 * "Leaf wafer: 5.400 starch C, 3.600 protein C and 0.900 N left." Numbers are the worker's (game units).
 */
function objectText(o: NonNullable<CellView['object']>): string {
  const name = dishInfo.value?.materials.find((m) => m.kind === 'object' && m.target === o.kind)?.name ?? o.kind;
  const parts: string[] = [];
  for (const pool of ['sugar', 'starch', 'protein'] as const) {
    const v = o.pools[pool];
    if (v !== undefined) parts.push(`${v.toFixed(3)} ${pool} C`);
  }
  parts.push(`${o.n.toFixed(3)} N`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `${name}: ${list} left.`;
}

/** "0.08 (habitat 0.80 × shade 0.10)" (SPEC §4.4: the inspector shows every light factor). */
function lightText(c: CellView): string {
  const eff = cellNumber(c.light, 2);
  if (c.lightBase === undefined || c.shade === undefined) return eff;
  return `${eff} (habitat ${c.lightBase.toFixed(2)} × shade ${c.shade.toFixed(2)})`;
}

/** A measured cell value with fixed decimals; a missing or non-finite value reads "not measured" (B1). */
function cellNumber(v: number | undefined, digits: number): string {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : 'not measured';
}

/** Family members listed in the inspector before "Show more". */
const FAMILY_LIST_STEP = 6;

function Bar({ label, value, max, kind, unit = '' }: { label: string; value: number; max: number; kind: string; unit?: string }) {
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
        aria-valuetext={`${Math.round(value)}${unit}`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      <span style={{ textAlign: 'right' }}>
        {Math.round(value)}
        {unit}
      </span>
    </div>
  );
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

/** "Happening now" (temporary state) against "Passed to offspring" (inherited): UX §5.1. */
const INSPECTOR_TABS = [
  { id: 'now', label: 'Happening now' },
  { id: 'inherited', label: 'Passed to offspring' },
  { id: 'evidence', label: 'Details' },
] as const;

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
  const [tabPicked, setTabPicked] = useState(0);
  const whyRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const name = info?.speciesNames[e.speciesIdx] ?? e.speciesId;
  const c = leadConstraint(e);
  const cw = constraintWords(e, c.code, c.value);
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
  // M3: a tab the player opens gets the sheet's height. When little of its answer would show below the
  // tabs (large text, a short sheet), scroll the sheet so the answer starts at its top; the answer then
  // begins with the open tab's name, and the tab names are a scroll up, never clipped.
  useEffect(() => {
    if (tabPicked === 0) return;
    const panel = panelRef.current;
    const scroller = panel?.closest<HTMLElement>('.sheet-scroll');
    if (!panel || !scroller) return;
    const box = scroller.getBoundingClientRect();
    const r = panel.getBoundingClientRect();
    const shown = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
    if (shown < Math.min(r.height, box.height * 0.4)) scroller.scrollTop += r.top - box.top;
  }, [tabPicked]);
  const pickTab = (next: 'now' | 'inherited' | 'evidence') => {
    setTab(next);
    setTabPicked((n) => n + 1);
  };

  const diet = answer === 'eat' ? dietAnswer(e, info?.speciesNames ?? []) : null;
  return (
    <>
      <header>
        <div style={{ flex: 1 }}>
          <h2>
            {name} <span class="sub">#{e.birthId}</span>
          </h2>
          <div class="chips" style={{ marginTop: '0.25rem' }}>
            <span class="chip">{actionLabel(e)}</span>
            <span class="chip">age {Math.floor(e.age)} s</span>
            <span class="chip">generation {e.generation}</span>
            {originChip(e.origin) ? <span class="chip">{originChip(e.origin)}</span> : null}
            {dormancyChip(e.dormancy) ? <span class="chip">{dormancyChip(e.dormancy)}</span> : null}
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
        {cw.text}
        {cw.detail ? <span class="sub"> {cw.detail}</span> : null}
      </p>
      {collapsed.value ? null : (
        <>
          <Bar label="Energy" value={e.E} max={e.energyCap} kind="energy" />
          <Bar label="Health" value={e.H} max={100} kind="health" />
          <Bar label="Body" value={(e.B / (2 * e.B0)) * 100} max={100} kind="" unit=" %" />
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
          <div class="tabs inspector-tabs" role="tablist">
            {INSPECTOR_TABS.map((t) => (
              <button
                key={t.id}
                class="btn"
                role="tab"
                id={`insp-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="insp-tabpanel"
                onClick={() => pickTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id="insp-tabpanel" aria-labelledby={`insp-tab-${tab}`} ref={panelRef}>
            <p class="tab-context" aria-hidden="true">
              {INSPECTOR_TABS.find((t) => t.id === tab)!.label}
            </p>
          {tab === 'now' ? (
            <div>
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
                {stop.splitOnly ? <p class="sub">Before it can split:</p> : null}
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
              {/* P3.4: infections, attached parasites and the host a parasite rides, from recorded state
                  (UX §5.2: Explore wording in Explore, Lab wording with the measured value in Lab), as
                  body text above the small key/value grid. */}
              {e.infection || e.parasite || e.host ? (
                <section aria-label="Infection and parasites" data-testid="infection-parasites">
                  {e.infection ? (
                    <p data-testid="infection">
                      {reasonText(R.INFECTED, dishView.value, { speciesName: info?.speciesNames[e.infection.speciesIdx] ?? 'a virus', value: e.infection.secondsLeft })}
                    </p>
                  ) : null}
                  {e.parasite ? (
                    <p data-testid="parasite">
                      {reasonText(R.PARASITIZED, dishView.value, { speciesName: info?.speciesNames[e.parasite.speciesIdx] ?? 'A parasite', value: e.parasite.rate })}{' '}
                      <span class="sub">#{e.parasite.birthId}</span>
                    </p>
                  ) : null}
                  {e.host ? (
                    <p data-testid="parasite-host">
                      Attached to {info?.speciesNames[e.host.speciesIdx] ?? 'its host'} <span class="sub">#{e.host.birthId}</span>; it moves with its host.
                    </p>
                  ) : null}
                </section>
              ) : null}
              {/* P3.6 (wave 2 verify MINOR): film and network sentences are body text (16 px), not the small grid. */}
              {e.filmHere !== undefined && e.filmHere > 0 ? (
                <p class="inspector-line">
                  Biofilm here: <span data-testid="film-here">{e.filmHere.toFixed(3)} carbon in this cell</span>.
                </p>
              ) : null}
              {e.network ? (
                <p class="inspector-line" data-testid="fungal-network">
                  {networkText(name, e.network)}
                </p>
              ) : null}
              {e.transfer ? (
                <p class="inspector-line" data-testid="fungal-transfer">
                  {transferText(e.transfer)}
                </p>
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
            <div>
              <p class="sub" data-testid="inherited-lead">
                {/* P2.2: a founder (generation 0) has no parent in this dish, so it is never compared with one.
                    M2: both comparisons, with its parent and with its line's founder, from recorded genomes. */}
                {inheritedLead(e)} Genome {e.genome.id.slice(0, 6)}.
              </p>
              {/* P2.2: starting differences of varied founders are not evolution (honest labels). */}
              {e.founderOrigin && founderStartText(e.founderOrigin) ? (
                <p class="sub" data-testid="founder-start">
                  {founderStartText(e.founderOrigin)}
                </p>
              ) : null}
              <dl class="kv">
                {e.genome.loci.map((v, i) =>
                  e.lociActiveEffective[i] ? (
                    <>
                      <dt>{LOCUS_NAMES[i]}</dt>
                      <dd>
                        {v}
                        {locusNote(e, i)}
                      </dd>
                    </>
                  ) : null,
                )}
                <dt>Feeding policy</dt>
                <dd>
                  {makesOwnFood(e)
                    ? 'makes its own food'
                    : e.profile.policy === 'ordered'
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
                        {/* P2.2: where this organism's copy came from, from its recorded lineage. */}
                        {e.founderOrigin
                          ? e.founderOrigin.modules
                              .filter((o) => o.id === m.id)
                              .map((o) => (
                                <span key={o.id} class="module-source" data-testid={`module-source-${o.id}`}>
                                  {moduleSourceText(o, e.founderOrigin!, e.birthId)}
                                </span>
                              ))
                          : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}
          {tab === 'evidence' ? (
            <div>
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
          </div>
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
              {p.cell.object ? (
                <>
                  <dt>Food object</dt>
                  <dd data-testid="cell-object">{objectText(p.cell.object)}</dd>
                </>
              ) : null}
              <dt>pH</dt>
              <dd data-testid="cell-ph">{cellNumber(p.cell.ph, 2)}</dd>
              {p.cell.salinity !== undefined ? (
                <>
                  <dt>Salinity</dt>
                  <dd data-testid="cell-salinity">{cellNumber(p.cell.salinity, 2)}</dd>
                </>
              ) : null}
              {p.cell.oxygen !== undefined ? (
                <>
                  <dt>Oxygen</dt>
                  <dd data-testid="cell-oxygen">{cellNumber(p.cell.oxygen, 2)}</dd>
                </>
              ) : null}
              <dt>Light</dt>
              <dd data-testid="cell-light">{lightText(p.cell)}</dd>
              {p.cell.exposure ? (
                <>
                  <dt>Inhibitor exposure</dt>
                  <dd data-testid="cell-exposure">{exposureText(p.cell.exposure)}</dd>
                </>
              ) : null}
              {Object.entries(p.cell.fields ?? {})
                .filter(([k, v]) => typeof v === 'number' && v > 1e-6 && !(p.cell!.salinity !== undefined && OWN_CELL_LINES.includes(k)))
                .map(([k, v]) => (
                  <>
                    <dt>{CELL_FIELD_NAMES[k] ?? k.charAt(0).toUpperCase() + k.slice(1)}</dt>
                    <dd>{amount(v)}</dd>
                  </>
                ))}
              <dt>Residents</dt>
              <dd>
                {(p.cell.residents ?? []).length === 0
                  ? 'none'
                  : p.cell.residents.map((r) => dishInfo.value?.speciesNames[dishInfo.value.speciesIds.indexOf(r.speciesId)] ?? r.speciesId).join(', ')}
              </dd>
            </dl>
            {p.cell.reactions ? <ReactionLedger rows={p.cell.reactions} /> : null}
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
