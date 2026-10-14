/**
 * New Dish (UX §2.3; SPEC §8.6; P2.2): progressive disclosure — Basics (start, name, seed with
 * Randomize), Evolution (Standard · Accelerated · Fixed Traits with the honesty note; founder mode
 * Identical · Varied · Diverse; the per-offspring chances on request), Content (the module registry
 * read-only from the manifest), then a summary of exactly what is preloaded and the total initial
 * ledger. The summary comes from the worker building the very dish the choices describe (and then
 * discarding it), so what it states is what Create makes. The dish opens paused, in the Lab with the
 * Life tray open.
 *
 * P3.9: the curated dishes (CT §9.3; content/recipes L3xx) are Basics starts too. Picking one sets the
 * seed, evolution setting and founder mode to the recipe's own, so Create makes the authored recipe
 * (the worker records no change: host isAuthoredRecipe); Randomize or another setting is recorded as
 * the player's change. The summary shows the dish's question and labels its pre-seeded genomes.
 */
import { DEMO_MODE } from '@platform/web'; // P4.11
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Manifest, RecipeDef } from '@sim/content/schema';
import type { DishInfo, NewDishPreview, Speed } from '@worker/protocol';
import { DISH_TEX, paintDish } from '@render/layers';
import { CELL_COUNT } from '@sim/constants';
import { IconBack, IconPlay } from '../icons';
import { busy, dishInfo, newDishPreview, route, setSpeed, sheet, startCustom, toast } from '../state';
import { useKeepPlanText } from '../panels/KeepPlanLine';
import { ChoiceGroup, newDishReturn, RatesTable } from '../panels/AdvancedEvolution';
import { labShowsDish, openLabWith, setDishView } from './LabView';
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
import { effectiveEnvironment, environmentGroupVisible, environmentOverrides, environmentSummary, type DishEnvironment, type EnvironmentChoice } from '../environment';
import { ENVIRONMENT_COPY } from '../strings/structures';
import { LID_COPY } from '../strings/lab';

const RECIPE_ID = 'FIRST_DISH_V1';
const MAX_SEED = 4294967295;

/** 'Start with' choices (UX §2.3): the Garden, an empty habitat preset (CT §8.1; P3.2), or a curated dish (P3.9). */
type StartId = 'garden' | 'empty' | 'gel' | 'sediment' | `curated:${string}`;

/** A curated dish as New Dish offers it (CT §9.3): the bundled recipe record's own values. */
interface CuratedDish {
  readonly id: string;
  readonly name: string;
  readonly seed: number;
  readonly question: string;
  readonly labels: readonly string[];
  readonly mutationPreset: PresetId;
  readonly founderMode: FounderModeId;
}

/**
 * The curated dishes this build ships (recipe ids L3xx_…, phase ≤ the manifest's build phase), in id
 * order, read from the same content records the worker validates (as the Lab tray reads its tools).
 * The worker builds the dish from its own validated copy; these values only choose what to ask for.
 */
/** This build's content manifest (the same record the worker validates). */
const BUILD_MANIFEST: Manifest | undefined = Object.values(
  import.meta.glob<Manifest>('../../../content/manifest.json', { eager: true, import: 'default' }),
)[0];

/**
 * P5.1 (UX §2.3 "Environment … Phase 5"): the Environment group is offered only when this build's manifest
 * enables 'climate' (src/ui/environment.ts); until the systems flip (D-0104) it is absent.
 */
const ENVIRONMENT_OFFERED = environmentGroupVisible(BUILD_MANIFEST);

const CURATED: readonly CuratedDish[] = (() => {
  const manifest = BUILD_MANIFEST;
  const glob = import.meta.glob<RecipeDef>('../../../content/recipes/L*.json', { eager: true, import: 'default' });
  return Object.keys(glob)
    .sort()
    .map((path) => glob[path]!)
    .filter((r) => /^L\d{3}_/.test(r.id) && manifest !== undefined && r.phase <= manifest.buildPhase)
    .map((r) => ({
      id: r.id,
      name: r.name,
      seed: r.seed,
      question: r.question ?? '',
      labels: r.labels ?? [],
      mutationPreset: r.mutationPreset,
      founderMode: r.founderMode,
    }));
})();

function curatedOf(start: StartId): CuratedDish | null {
  return start.startsWith('curated:') ? (CURATED.find((c) => `curated:${c.id}` === start) ?? null) : null;
}

/** Starts with nothing living (an empty preset). */
function isEmptyStart(start: StartId): boolean {
  return start === 'empty' || start === 'gel' || start === 'sediment';
}

/** Habitat-only starts on another preset than the recipe's: the habitat the dish is built on. */
const START_HABITAT: Readonly<Partial<Record<StartId, string>>> = {
  gel: 'GEL_COLONY',
  sediment: 'SEDIMENT_EDGE',
};

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

/**
 * The habitat's layout as the dish will start (the worker's habitatGrid), drawn with the dish's own
 * colours; the words next to it say the same, so nothing rests on the picture alone.
 */
function HabitatMap({ p }: { readonly p: NewDishPreview }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const grid = p.habitat.grid;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !grid) return;
    const img = ctx.createImageData(DISH_TEX, DISH_TEX);
    paintDish(img, grid.substrate, grid.structure, new Float32Array(CELL_COUNT).fill(1));
    ctx.putImageData(img, 0, 0);
  }, [grid]);
  if (!grid) return null;
  return (
    <canvas
      ref={ref}
      style={{
        display: 'block',
        width: '10rem',
        maxWidth: '100%',
        height: 'auto',
        imageRendering: 'pixelated',
        margin: '0 0 0.5rem',
      }}
      width={DISH_TEX}
      height={DISH_TEX}
      role="img"
      aria-label={`Map of ${p.habitat.name}: ${p.habitat.summary}`}
      data-testid="new-dish-map"
    />
  );
}

/**
 * P3.9: a curated dish's question, its labels, and whether these choices make the dish as authored
 * (the recipe's own seed and settings) or the player's own version of it (recorded as changes).
 */
function CuratedLines({ dish, p }: { readonly dish: CuratedDish; readonly p: NewDishPreview }) {
  const changes: string[] = [];
  if (p.seed !== dish.seed) changes.push(`seed ${p.seed} instead of ${dish.seed}`);
  if (p.mutationPreset !== dish.mutationPreset) changes.push('another evolution setting');
  if (p.founderMode !== dish.founderMode) changes.push('another founder setting');
  return (
    <>
      <p data-testid="new-dish-question">
        <strong>{dish.name}</strong> asks: {dish.question}
      </p>
      {dish.labels.length > 0 ? <p data-testid="new-dish-labels">{dish.labels.join(' · ')}</p> : null}
      <p data-testid="new-dish-authored">
        {changes.length === 0
          ? `This is ${dish.name} as written, with its own seed ${dish.seed}.`
          : `Your own version of ${dish.name}: ${listText(changes)}. The dish records what you changed.`}
      </p>
    </>
  );
}

/** Exactly what the preview world holds, in words (founders, patches, seeded abilities, initial ledger). */
function Summary({ p, habitatStart, curated, env }: { readonly p: NewDishPreview; readonly habitatStart: boolean; readonly curated: CuratedDish | null; readonly env: DishEnvironment | null }) {
  const founders = p.founders.map((f) => countOf(f.count, f.name));
  const seeded = p.founders.filter((f) => f.withModule > 0);
  const eligible = p.founders.reduce((a, f) => a + f.eligible, 0);
  const withModule = p.founders.reduce((a, f) => a + f.withModule, 0);
  return (
    <div data-testid="new-dish-summary">
      {curated ? <CuratedLines dish={curated} p={p} /> : null}
      <HabitatMap p={p} />
      {habitatStart ? (
        // A habitat start is the preset exactly as CT §8.1 defines it: its rules text says what every
        // cell holds (food included), and nothing else is added.
        <p data-testid="new-dish-habitat">
          {p.habitat.name}: {p.habitat.summary} {p.habitat.rules ?? ''} No life until you add it.
        </p>
      ) : (
        <p>
          {p.habitat.name}: {p.habitat.summary}{' '}
          {p.empty
            ? 'No life and no food until you add them.'
            : `${p.patches.length > 0 ? `${listText(p.patches)}; ` : ''}${founders.length > 0 ? `${listText(founders)}.` : 'no founders.'}`}
        </p>
      )}
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
      {p.founderMode !== 'diverse' && !p.empty && withModule > 0 ? (
        // P3.9 (CT §9.3 "pre-seeded genomes labelled"): abilities the recipe gives some founders.
        <p data-testid="new-dish-preseeded">
          Pre-seeded genomes, present at creation (set by the dish, not evolved here):{' '}
          {seeded
            .map(
              (f) =>
                `${f.modules.map((m) => `${m.count} of the ${countOf(f.count, f.name)} start with ${m.name}`).join(', ')}${f.count > f.withModule ? `; ${f.count - f.withModule} start without` : ''}`,
            )
            .join('; ')}
          .
        </p>
      ) : null}
      {env ? <p data-testid="new-dish-environment-summary">{environmentSummary(env)}</p> : null}
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

/** One environment setting as two labelled buttons (the LidToggle pattern; UX §4.1 targets). */
function EnvChoice<T extends string | boolean>({
  label,
  testId,
  value,
  options,
  onPick,
  rule,
}: {
  label: string;
  testId: string;
  value: T | null;
  options: readonly { readonly v: T; readonly label: string }[];
  onPick: (v: T) => void;
  rule: string;
}) {
  return (
    <div class="lab-option" data-testid={testId}>
      <span class="lab-option-label" id={`${testId}-label`}>
        {label}
      </span>
      <div class="segmented" role="group" aria-labelledby={`${testId}-label`} aria-describedby={`${testId}-rule`}>
        {options.map((o) => (
          <button key={String(o.v)} type="button" class="btn" aria-pressed={value === o.v} onClick={() => onPick(o.v)} data-testid={`${testId}-${String(o.v)}`}>
            {o.label}
          </button>
        ))}
      </div>
      <p class="sub" id={`${testId}-rule`}>
        {rule}
      </p>
    </div>
  );
}

/**
 * P5.1 New Dish Environment (UX §2.3; CT §8.1; D-0106): the lid, the light mode and drying the dish starts
 * with, after Evolution. Defaults are the preview world's own; only changed keys become overrides.
 */
function EnvironmentGroup({
  defaults,
  choice,
  onChange,
}: {
  defaults: DishEnvironment | null;
  choice: EnvironmentChoice;
  onChange: (c: EnvironmentChoice) => void;
}) {
  const env = defaults ? effectiveEnvironment(defaults, choice) : null;
  return (
    <section class="card" aria-labelledby="nd-environment" data-testid="new-dish-environment">
      <h2 id="nd-environment">Environment</h2>
      <EnvChoice<'open' | 'closed'>
        label={LID_COPY.label}
        testId="new-dish-lid"
        value={env?.lid ?? null}
        options={[
          { v: 'open', label: LID_COPY.open },
          { v: 'closed', label: LID_COPY.closed },
        ]}
        onPick={(v) => onChange({ ...choice, lid: v })}
        rule={LID_COPY.rule.replace(/ Each change is recorded and can be undone\.$/, "")}
      />
      <EnvChoice<'fixed' | 'cycle'>
        label={ENVIRONMENT_COPY.lightLabel}
        testId="new-dish-light"
        value={env?.lightMode ?? null}
        options={[
          { v: 'fixed', label: ENVIRONMENT_COPY.fixed },
          { v: 'cycle', label: ENVIRONMENT_COPY.cycle },
        ]}
        onPick={(v) => onChange({ ...choice, lightMode: v })}
        rule={ENVIRONMENT_COPY.lightRule.replace(/ Each change is recorded and can be undone\.$/, "")}
      />
      <EnvChoice<boolean>
        label={ENVIRONMENT_COPY.dryingLabel}
        testId="new-dish-drying"
        value={env?.drying ?? null}
        options={[
          { v: false, label: ENVIRONMENT_COPY.off },
          { v: true, label: ENVIRONMENT_COPY.on },
        ]}
        onPick={(v) => onChange({ ...choice, drying: v })}
        rule={ENVIRONMENT_COPY.dryingRule.replace(/ Each change is recorded and can be undone\.$/, "")}
      />
    </section>
  );
}

export function NewDish() {
  const [start, setStart] = useState<StartId>('garden');
  const [name, setName] = useState('My dish');
  const [seed, setSeed] = useState(randomSeed);
  const [preset, setPreset] = useState<PresetId>('standard');
  const [founders, setFounders] = useState<FounderModeId>('identical');
  const [showRates, setShowRates] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [preview, setPreview] = useState<{ readonly start: StartId; readonly p: NewDishPreview } | null>(
    null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  /** P5.1: the Environment group's picks (only keys the player touched). */
  const [envChoice, setEnvChoice] = useState<EnvironmentChoice>({});
  const request = useRef(0);

  const curated = curatedOf(start);
  const recipeId = curated?.id ?? RECIPE_ID;
  const empty = isEmptyStart(start);

  /** Choosing a curated dish takes its own seed and settings (the authored recipe); other starts keep the choices. */
  const chooseStart = (next: StartId) => {
    const dish = curatedOf(next);
    if (dish) {
      setSeed(dish.seed);
      setPreset(dish.mutationPreset);
      setFounders(dish.founderMode);
      // The default name follows the dish, unless the player typed their own.
      if (name === 'My dish' || CURATED.some((c) => c.name === name)) setName(dish.name);
    } else if (CURATED.some((c) => c.name === name)) setName('My dish');
    setStart(next);
  };

  // The summary always describes the current choices: a newer request makes an older answer stale.
  useEffect(() => {
    const id = ++request.current;
    const t = setTimeout(() => {
      const habitatId = START_HABITAT[start];
      newDishPreview(curatedOf(start)?.id ?? RECIPE_ID, seed, {
        mutationPreset: preset,
        founderMode: founders,
        empty: isEmptyStart(start),
        ...(habitatId !== undefined ? { habitatId } : {}),
      })
        .then((p) => {
          if (id !== request.current) return;
          setPreview({ start, p });
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
    preview.start === start &&
    preview.p.seed === seed &&
    preview.p.mutationPreset === preset &&
    preview.p.founderMode === founders &&
    preview.p.empty === empty &&
    preview.p.recipeId === recipeId
      ? preview.p
      : null;
  // P5.1: the group's defaults are the preview world's own environment (recipe, else habitat; CT §8.1),
  // asked for without the group's picks so a pick never becomes its own default.
  const envDefaults: DishEnvironment | null = ENVIRONMENT_OFFERED ? (current?.environment ?? null) : null;
  const env = envDefaults ? effectiveEnvironment(envDefaults, envChoice) : null;
  // The registry is this build's manifest whatever the choices, so an older answer still describes it.
  const registry = (current ?? preview?.p)?.registry ?? null;

  // D-0033: what Create will do to the open dish (with none open, the dish Continue holds: fix round 1),
  // from the worker's keep step (said before Create).
  const planLine = useKeepPlanText('start');

  /** Runs once the new dish is open (at once, or after the all-slots-used choice). */
  const started = (info: DishInfo) => {
    // The dish New Dish was opened from is closed now: Back has nothing to return to.
    newDishReturn.current = null;
    // A message about the dish that was open (e.g. its last evolution change) is not about this one.
    toast.value = null;
    // UX §2.3: a new Lab dish enters paused with the Life tray open. Tell the Lab this dish is already
    // shown first, so its toolbar keeps the tray it is about to open.
    labShowsDish(info.dishId);
    if (DEMO_MODE) {
      // P4.11 fix round 1 (D09 line 209 "Explore controls"): the demo has no Lab. The new dish opens in
      // Explore, paused, with Add Life open (the demo's five organisms).
      setDishView('explore');
      sheet.value = 'addLife';
      return;
    }
    openLabWith('life');
    revealLifeTray();
  };

  const create = async () => {
    setProblem(null);
    try {
      const outcome = await startCustom(
        {
          recipeId,
          name,
          seed,
          mutationPreset: preset,
          founderMode: founders,
          empty,
          ...(START_HABITAT[start] !== undefined ? { habitatId: START_HABITAT[start] } : {}),
          // Only the keys changed from the defaults: an untouched group records nothing.
          ...(envDefaults ? { environment: environmentOverrides(envDefaults, envChoice) } : {}),
        },
        started,
      );
      // A refused keep (e.g. the save could not be written) started nothing and says why.
      if (outcome.kind === 'refused') setProblem(outcome.message);
    } catch (e) {
      setProblem(
        `The new dish could not be started; nothing changed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
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
          <ChoiceGroup<StartId>
            label="Start with"
            testId="new-dish-start-with"
            value={start}
            onChange={chooseStart}
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
              // P4.11 DEMO_MODE (ARCH §14 "restricts New Dish species"): the Garden's habitat and species only.
              ...(DEMO_MODE
                ? []
                : [
                    {
                      id: 'gel' as StartId,
                      label: 'Empty Gel Colony',
                      note: 'Gel with one water channel and a little sugar everywhere, with nothing living.',
                    },
                    {
                      id: 'sediment' as StartId,
                      label: 'Empty Sediment Edge',
                      note: 'Water above, sediment with debris below and one stone, with nothing living.',
                    },
                    // P3.9: curated dishes (CT §9.3), each with its question.
                    ...CURATED.map((c) => ({ id: `curated:${c.id}` as StartId, label: c.name, note: c.question })),
                  ]),
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
        {ENVIRONMENT_OFFERED ? (
          <EnvironmentGroup defaults={envDefaults} choice={envChoice} onChange={setEnvChoice} />
        ) : null}
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
          {current ? (
            <Summary p={current} habitatStart={START_HABITAT[start] !== undefined} curated={curated} env={env} />
          ) : (
            <p>Working out exactly what this dish starts with…</p>
          )}
          {problem ? (
            <p class="constraint" role="alert">
              {problem}
            </p>
          ) : null}
          {/* D-0033: the open dish (or the dish Continue holds) is kept first; this says how, or that nothing needs keeping. */}
          {planLine ? (
            <p class="constraint" data-testid="new-dish-replaces" aria-live="polite">
              {planLine}
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
