/**
 * New Dish (UX §2.3; SPEC §8.6; P2.2): progressive disclosure — Basics (start, name, seed with
 * Randomize), Evolution (Standard · Accelerated · Fixed Traits with the honesty note; founder mode
 * Identical · Varied · Diverse; the per-offspring chances on request), Content (the module registry
 * read-only from the manifest), then a summary of exactly what is preloaded and the total initial
 * ledger. The summary comes from the worker building the very dish the choices describe (and then
 * discarding it), so what it states is what Create makes. The dish opens paused, in the Lab with the
 * Life tray open.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { NewDishPreview, Speed } from '@worker/protocol';
import { IconBack, IconPlay } from '../icons';
import { busy, dishInfo, newDishPreview, route, setSpeed, startCustom, toast } from '../state';
import { ChoiceGroup, newDishReturn, RatesTable } from '../panels/AdvancedEvolution';
import { labShowsDish, openLabWith } from './LabView';
import {
  CORE_PROTOTYPE_LABEL,
  FOUNDER_CHOICES,
  pacingText,
  PRESET_CHOICES,
  RATES_PER_BIRTH,
  registryLine,
  startLedgerText,
  worldModesLine,
  type FounderModeId,
  type PresetId,
} from '../strings/modes';
import { plural } from '../strings/experiments';

const RECIPE_ID = 'FIRST_DISH_V1';
const MAX_SEED = 4294967295;

function randomSeed(): number {
  // UI only: picks the seed the dish will record. The simulation never reads this generator.
  return Math.floor(Math.random() * 900000) + 100000;
}

/** "1 Sprinter", "24 Sprinters" (the species' own name, pluralized as elsewhere in the app). */
function countOf(n: number, name: string): string {
  return `${n} ${n === 1 ? name : plural(name)}`;
}

function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Exactly what the preview world holds, in words (founders, patches, seeded abilities, initial ledger). */
function Summary({ p }: { readonly p: NewDishPreview }) {
  const founders = p.founders.map((f) => countOf(f.count, f.name));
  const seeded = p.founders.filter((f) => f.withModule > 0);
  const eligible = p.founders.reduce((a, f) => a + f.eligible, 0);
  const withModule = p.founders.reduce((a, f) => a + f.withModule, 0);
  return (
    <div data-testid="new-dish-summary">
      <p>
        {p.habitat.name}: {p.habitat.summary}{' '}
        {p.empty
          ? 'No life and no food until you add them.'
          : `${p.patches.length > 0 ? `${listText(p.patches)}; ` : ''}${founders.length > 0 ? `${listText(founders)}.` : 'no founders.'}`}
      </p>
      {p.founderMode === 'diverse' && !p.empty ? (
        <p data-testid="new-dish-diverse">
          {withModule === 0
            ? `None of the ${eligible} founders that could carry an extra ability starts with one on this seed.`
            : `${withModule} of the ${eligible} founders that could carry an extra ability start with one (present at creation): ${seeded
                .map(
                  (f) =>
                    `${countOf(f.withModule, f.name)} (${f.modules.map((m) => `${m.count} with ${m.name}`).join(', ')})`,
                )
                .join('; ')}.`}
        </p>
      ) : null}
      <p data-testid="new-dish-ledger">{startLedgerText(p.ledger)}</p>
      <p>
        Seed {p.seed}. Nothing else appears on its own. It opens paused in the Lab, with the Life tray open.
      </p>
    </div>
  );
}

/**
 * UX §2.3 "enter … with the Life tray open": once the new dish screen shows the tray, bring it into view
 * (in phone landscape and at 200 % text it sits below the Lab categories) and move focus to its first
 * item, so keyboard and screen-reader players land in it too. UI only; waits at most about a second.
 */
function revealLifeTray(frames = 60): void {
  const tray = document.querySelector<HTMLElement>('[data-testid="lab-tray"][data-category="life"]');
  if (!tray) {
    if (frames > 0) requestAnimationFrame(() => revealLifeTray(frames - 1));
    return;
  }
  tray.scrollIntoView({ block: 'start' });
  const first = tray.querySelector<HTMLElement>('.lab-item');
  if (!first) return;
  first.focus({ preventScroll: true });
  const r = first.getBoundingClientRect();
  if (r.top < 0 || r.bottom > window.innerHeight) first.scrollIntoView({ block: 'nearest' });
}

export function NewDish() {
  const [start, setStart] = useState<'garden' | 'empty'>('garden');
  const [name, setName] = useState('My dish');
  const [seed, setSeed] = useState(randomSeed);
  const [preset, setPreset] = useState<PresetId>('standard');
  const [founders, setFounders] = useState<FounderModeId>('identical');
  const [showRates, setShowRates] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [preview, setPreview] = useState<NewDishPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const request = useRef(0);

  // The summary always describes the current choices: a newer request makes an older answer stale.
  useEffect(() => {
    const id = ++request.current;
    const t = setTimeout(() => {
      newDishPreview(RECIPE_ID, seed, {
        mutationPreset: preset,
        founderMode: founders,
        empty: start === 'empty',
      })
        .then((p) => {
          if (id !== request.current) return;
          setPreview(p);
          setProblem(null);
        })
        .catch((e: unknown) => {
          if (id === request.current) setProblem(e instanceof Error ? e.message : String(e));
        });
    }, 120);
    return () => clearTimeout(t);
  }, [start, seed, preset, founders]);

  const current =
    preview &&
    preview.seed === seed &&
    preview.mutationPreset === preset &&
    preview.founderMode === founders &&
    preview.empty === (start === 'empty')
      ? preview
      : null;
  // The registry is this build's manifest whatever the choices, so an older answer still describes it.
  const registry = (current ?? preview)?.registry ?? null;

  const create = async () => {
    setProblem(null);
    try {
      await startCustom({
        recipeId: RECIPE_ID,
        name,
        seed,
        mutationPreset: preset,
        founderMode: founders,
        empty: start === 'empty',
      });
    } catch (e) {
      setProblem(
        `The new dish could not be started; nothing changed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }
    // The dish New Dish was opened from is closed now: Back has nothing to return to.
    newDishReturn.current = null;
    const info = dishInfo.value;
    if (!info) return;
    // A message about the dish that was open (e.g. its last evolution change) is not about this one.
    toast.value = null;
    // UX §2.3: a new Lab dish enters paused with the Life tray open. Tell the Lab this dish is already
    // shown first, so its toolbar keeps the tray it is about to open.
    labShowsDish(info.dishId);
    openLabWith('life');
    revealLifeTray();
  };

  // Back returns to the dish the Evolution sheet opened this from, in the run state it had; else Home.
  const back = () => {
    const from = newDishReturn.current;
    newDishReturn.current = null;
    const open = dishInfo.value;
    if (from && open && open.dishId === from.dishId) {
      route.value = { name: 'dish' };
      if (from.speed > 0) setSpeed(from.speed as Speed);
      return;
    }
    route.value = { name: 'home' };
  };
  const openDish = dishInfo.value;

  return (
    <main class="page" aria-labelledby="new-title">
      <div class="home-grid">
        <header style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button class="btn ghost" style={{ color: 'inherit' }} onClick={back} aria-label="Back">
            <IconBack />
          </button>
          <h1 id="new-title" style={{ fontSize: '1.5rem' }}>
            New dish
          </h1>
        </header>
        <section class="card" aria-labelledby="nd-basics">
          <h2 id="nd-basics">Start with</h2>
          <ChoiceGroup<'garden' | 'empty'>
            label="Start with"
            testId="new-dish-start-with"
            value={start}
            onChange={setStart}
            choices={[
              {
                id: 'garden',
                label: 'Little Living Garden',
                note: 'Food patches and four kinds of life, ready to watch.',
              },
              {
                id: 'empty',
                label: 'Empty Water Garden',
                note: 'The same water and stones, with nothing living and no food.',
              },
            ]}
          />
          <label class="field">
            Name
            <input
              value={name}
              maxLength={60}
              onInput={(e) => setName(e.currentTarget.value)}
              data-testid="new-dish-name"
            />
          </label>
          <label class="field" for="new-dish-seed">
            Seed (same seed + same actions = same history)
          </label>
          <div class="field-row">
            <input
              id="new-dish-seed"
              inputMode="numeric"
              value={String(seed)}
              data-testid="new-dish-seed"
              onInput={(e) =>
                setSeed(
                  Math.max(0, Math.min(MAX_SEED, Number(e.currentTarget.value.replace(/\D/g, '')) || 0)),
                )
              }
            />
            <button
              class="btn"
              type="button"
              onClick={() => setSeed(randomSeed())}
              data-testid="new-dish-randomize"
            >
              Randomize
            </button>
          </div>
        </section>
        <section class="card" aria-labelledby="nd-evolution">
          <h2 id="nd-evolution">Evolution</h2>
          <ChoiceGroup<PresetId>
            label="Evolution setting"
            testId="new-dish-preset"
            value={preset}
            onChange={setPreset}
            choices={PRESET_CHOICES}
          />
          <h3 class="panel-h">Founders</h3>
          <ChoiceGroup<FounderModeId>
            label="Founders"
            testId="new-dish-founders"
            value={founders}
            onChange={setFounders}
            choices={FOUNDER_CHOICES}
          />
          <button
            class="btn ghost disclosure"
            type="button"
            aria-expanded={showRates}
            aria-controls="nd-rates"
            onClick={() => setShowRates(!showRates)}
            data-testid="new-dish-advanced"
          >
            {showRates ? 'Hide' : 'Show'} the chances per offspring (Advanced)
          </button>
          {/* The controlled region always exists (hidden while collapsed), so aria-controls names a real element. */}
          <div id="nd-rates" data-testid="new-dish-rates-panel" hidden={!showRates}>
            {!showRates ? null : current ? (
              <>
                <RatesTable
                  rates={current.rates}
                  developmentalEnabled={current.developmentalEnabled}
                  testId="new-dish-rates"
                />
                <p class="sub">{RATES_PER_BIRTH}</p>
                <p class="sub">{pacingText(current.rates)}</p>
                <p class="sub">
                  You can change the evolution setting later while the dish runs; each change is recorded with
                  its time. Founders stay as made.
                </p>
              </>
            ) : (
              <p class="sub">Reading the chances…</p>
            )}
          </div>
        </section>
        <section class="card" aria-labelledby="nd-content">
          <h2 id="nd-content">Content</h2>
          <button
            class="btn ghost disclosure"
            type="button"
            aria-expanded={showContent}
            aria-controls="nd-content-body"
            onClick={() => setShowContent(!showContent)}
            data-testid="new-dish-content"
          >
            {showContent ? 'Hide' : 'Show'} what this version simulates
          </button>
          <div id="nd-content-body" hidden={!showContent}>
            {!showContent ? null : registry ? (
              <>
                {registry.partial ? (
                  <p>{CORE_PROTOTYPE_LABEL}: only some extra abilities exist in this version.</p>
                ) : null}
                <p data-testid="new-dish-registry">{registryLine(registry)}</p>
                <p>
                  Systems: {registry.systems.join(', ')} · evolution rules version{' '}
                  {registry.evolutionRulesVersion}.
                </p>
              </>
            ) : (
              <p class="sub">Reading what this version simulates…</p>
            )}
          </div>
        </section>
        <section class="card" aria-labelledby="nd-summary">
          <h2 id="nd-summary">What you get</h2>
          <p class="world-modes" data-testid="new-dish-modes">
            {worldModesLine(preset, founders, registry)}
          </p>
          {current ? <Summary p={current} /> : <p>Working out exactly what this dish starts with…</p>}
          {problem ? (
            <p class="constraint" role="alert">
              {problem}
            </p>
          ) : null}
          {openDish ? (
            <p class="constraint" data-testid="new-dish-replaces">
              Creating a new dish closes “{openDish.name}”. To keep it, go Back and save it first (More →
              Save…).
            </p>
          ) : null}
          <button
            class="btn primary"
            disabled={busy.value}
            data-testid="new-dish-start"
            onClick={() => void create()}
          >
            <IconPlay /> Create dish
          </button>
        </section>
      </div>
    </main>
  );
}
