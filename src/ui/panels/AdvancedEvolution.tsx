/**
 * Evolution settings (SPEC §8.6–§8.7, UX §2.3 / §3.3; P2.2).
 *
 * `ChoiceGroup` and `RatesTable` are shared with New Dish. `EvolutionSheet` is the dish's Advanced
 * panel: the setting in effect with its per-daughter rates (from the world's snapshot, never from UI
 * state), a control that changes it (one undoable command, recorded with its tick), the changes made
 * so far, the founder mode (fixed when the dish was made) and the recorded module registry.
 */
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { MutationRates } from '@sim/mutation';
import { IconClose } from '../icons';
import { dishInfo, evolution, meta, route, setEvolutionPreset, sheet } from '../state';
import {
  CORE_PROTOTYPE_LABEL,
  creationFoundersText,
  founderLabel,
  founderNote,
  pacingText,
  PRESET_CHOICES,
  presetChangeText,
  RATES_PER_BIRTH,
  rateRows,
  registryLine,
  simTime,
  worldModesLine,
  type PresetId,
} from '../strings/modes';

/**
 * New Dish opened from a dish's Evolution sheet ("New dish…"): Back returns to that dish and restores
 * the run state it had (UX §2 "blocking panels … restore the prior run state on close"). Null when New
 * Dish was opened from Home.
 */
export const newDishReturn: { current: { readonly dishId: string; readonly speed: number } | null } = {
  current: null,
};

/** Keys a choice handles itself: they never reach the dish's global shortcuts (Space is not pause/run here). */
const CHOICE_KEYS = [' ', 'Enter', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];

/**
 * Arrow keys, Home and End move focus between the options (UX §4.2 keyboard); Enter or Space chooses
 * the focused one. Moving never chooses: in the Evolution sheet a choice is a recorded intervention.
 */
function onChoiceKey(e: JSX.TargetedKeyboardEvent<HTMLDivElement>): void {
  if (!CHOICE_KEYS.includes(e.key)) return;
  e.stopPropagation();
  if (e.key === ' ' || e.key === 'Enter') return; // the focused button's own activation
  const options = Array.from(
    e.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]:not([disabled])'),
  );
  if (options.length === 0) return;
  const at = options.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? options.length - 1
        : e.key === 'ArrowDown' || e.key === 'ArrowRight'
          ? (at + 1) % options.length
          : (at - 1 + options.length) % options.length;
  e.preventDefault();
  options[next]!.focus();
}

/**
 * A labelled single-choice group of large buttons (role radio), each with a one-line note. `compact`
 * (for sheets over the dish, where 200 % text leaves little room) puts only the labels in the buttons
 * and shows the chosen option's note once, below them.
 */
export function ChoiceGroup<T extends string>(props: {
  readonly label: string;
  readonly choices: readonly { readonly id: T; readonly label: string; readonly note: string }[];
  readonly value: T;
  readonly onChange: (id: T) => void;
  readonly testId: string;
  readonly disabled?: boolean;
  readonly compact?: boolean;
}): JSX.Element {
  const noteId = `${props.testId}-note`;
  const chosen = props.choices.find((c) => c.id === props.value);
  return (
    <>
      <div
        class="choice-list"
        role="radiogroup"
        aria-label={props.label}
        data-testid={props.testId}
        onKeyDown={onChoiceKey}
      >
        {props.choices.map((c) => (
          <button
            key={c.id}
            type="button"
            class="btn choice"
            role="radio"
            aria-checked={props.value === c.id}
            aria-describedby={props.compact && props.value === c.id ? noteId : undefined}
            disabled={props.disabled}
            data-testid={`${props.testId}-${c.id}`}
            onClick={() => props.onChange(c.id)}
          >
            <span class="choice-label">{c.label}</span>
            {props.compact ? null : <span class="choice-note">{c.note}</span>}
          </button>
        ))}
      </div>
      {props.compact && chosen ? (
        <p class="sub" id={noteId}>
          {chosen.note}
        </p>
      ) : null}
    </>
  );
}

/** The per-daughter chances for a setting (SPEC §8.3 order), with what each one means. */
export function RatesTable({
  rates,
  developmentalEnabled,
  testId,
}: {
  readonly rates: MutationRates;
  readonly developmentalEnabled: boolean;
  readonly testId: string;
}): JSX.Element {
  return (
    <table class="rates" data-testid={testId}>
      <caption class="sub">Chance for each offspring</caption>
      <tbody>
        {rateRows(rates, developmentalEnabled).map((r) => (
          <tr key={r.key} data-rate={r.key}>
            <th scope="row">
              {r.label}
              <span class="rate-detail">{r.detail}</span>
            </th>
            <td>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function EvolutionSheet(): JSX.Element | null {
  const info = dishInfo.value;
  const evo = evolution.value;
  const heading = useRef<HTMLHeadingElement>(null);
  // A choice already sent and not yet answered: a second tap never sends it again.
  const pending = useRef<PresetId | null>(null);
  // Focus moves into the sheet when it opens, as in What if? and Lineage (screen readers hear it).
  useEffect(() => heading.current?.focus(), []);
  if (!info) return null;
  const registry = info.registry ?? null;
  const mode = evo?.founderMode ?? info.founderMode;
  const moduleName = (id: string) => registry?.modules.find((m) => m.id === id)?.name ?? id;
  return (
    <section class="sheet" aria-labelledby="evolution-title" data-testid="evolution-sheet">
      <div class="sheet-scroll">
        <header>
          <h2 id="evolution-title" tabIndex={-1} ref={heading}>
            Evolution settings
          </h2>
          <button class="btn ghost" aria-label="Close" onClick={() => (sheet.value = 'none')}>
            <IconClose />
          </button>
        </header>
        <p class="world-modes" data-testid="evolution-world-label">
          {worldModesLine(evo?.preset ?? info.mutationPreset, evo?.founderMode ?? info.founderMode, registry)}
        </p>
        {evo ? (
          <>
            <h3 class="panel-h">Evolution now</h3>
            <ChoiceGroup<PresetId>
              label="Evolution setting"
              choices={PRESET_CHOICES}
              value={evo.preset}
              compact
              testId="evolution-preset"
              onChange={(id) => {
                if (id === evo.preset || pending.current !== null) return;
                pending.current = id;
                void setEvolutionPreset(id).finally(() => {
                  pending.current = null;
                });
              }}
            />
            <p class="sub">
              A change takes effect at the current time and is recorded in History. Undo rewinds your latest
              change.
            </p>
            <h3 class="panel-h">Chances per offspring</h3>
            <RatesTable
              rates={evo.rates}
              developmentalEnabled={evo.developmentalEnabled}
              testId="evolution-rates"
            />
            <p class="sub">{RATES_PER_BIRTH}</p>
            <p class="sub">{pacingText(evo.rates)}</p>
            <h3 class="panel-h">Changes in this dish</h3>
            {evo.changes.length > 0 ? (
              <ol class="change-list" data-testid="evolution-changes">
                {evo.changes.map((c) => (
                  <li key={c.commandId}>
                    <span class="change-time">{simTime(c.tick)}</span> {presetChangeText(c)}
                  </li>
                ))}
              </ol>
            ) : (
              <p class="sub" data-testid="evolution-changes-none">
                No changes recorded while this dish ran.
              </p>
            )}
          </>
        ) : (
          <p class="sub">Reading the dish…</p>
        )}
        <h3 class="panel-h">Founders</h3>
        <p class="sub" data-testid="evolution-founders">
          {founderLabel(mode)}: {founderNote(mode)}
        </p>
        {/* What this dish's founders actually carried (a recipe may give some an ability, present at creation). */}
        {evo?.creation ? (
          <p class="sub" data-testid="evolution-creation">
            {creationFoundersText(
              evo.creation,
              (i) => info.speciesNames[i] ?? `species ${i + 1}`,
              moduleName,
            )}
          </p>
        ) : null}
        <p class="sub">
          A saved specimen you place keeps its own traits and abilities. The founder mode is fixed when a dish
          is made; to try another, start a new dish.
        </p>
        <button
          class="btn"
          data-testid="evolution-new-dish"
          onClick={() => {
            // Back from New Dish returns here, running again if it was running (UX §2 blocking panels).
            newDishReturn.current = { dishId: info.dishId, speed: meta.value?.speed ?? 0 };
            sheet.value = 'none';
            route.value = { name: 'newDish' };
          }}
        >
          New dish…
        </button>
        {registry ? (
          <>
            <h3 class="panel-h">Content</h3>
            {registry.partial ? (
              <p class="sub">{CORE_PROTOTYPE_LABEL}: this version simulates only some extra abilities.</p>
            ) : null}
            <p class="sub" data-testid="evolution-registry">
              {registryLine(registry)}
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
