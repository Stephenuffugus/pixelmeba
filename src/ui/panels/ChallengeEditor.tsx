/**
 * Make a challenge (P4.8 part c; SPEC §13.5 "saved baseline, allowed tools, optional command budget, one
 * objective, numeric targets … no scripts"; D02 §20; D09 line 134). Sheet 'challenge', view 'edit', from More
 * on a paused dish (src/ui/challenge.ts openChallengeEditor pauses it; Cancel restores its run state).
 *
 * Every choice is typed: the goal type (five radio buttons; "Move material across a gate" is disabled with
 * "This dish has no gate to measure." on a dish without a gate structure), ids from lists (kind, level,
 * event, enzyme, region), numbers from number fields, tool checkboxes (all on by default), an optional action
 * limit and the turn length (60 / 180 / 600 s, 180 by default). The summary shows the restrictions exactly as a
 * player sees them before Start. The name is only displayed.
 */
import { IconClose } from '../icons';
import { CHALLENGE_BUDGET_MAX, CHALLENGE_BUDGET_MIN, CHALLENGE_HORIZON_SECONDS, CHALLENGE_NAME_MAX, CHALLENGE_QUARTERS, CHALLENGE_TOOL_GROUPS } from '@persist/notebookChallenges';
import { OBJECTIVE_TYPES, type ObjectiveType } from '@sim/objectives';
import { dishInfo, latestDishSnapshots } from '../state';
import { challengeSheet, chooseTemplate, closeChallengeSheet, draftToInput, gateAvailable, offeredEvents, offeredFields, offeredSpecies, saveChallenge, toggleTool, updateDraft, type ChallengeDraft } from '../challenge';
import {
  CHALLENGE_ENZYME_NAMES,
  CHALLENGE_EVENT_NAMES,
  CHALLENGE_FIELD_NAMES,
  CHALLENGE_MEASURE_NAMES,
  CHALLENGE_REGION_NAMES,
  CHALLENGE_TEXT,
  CHALLENGE_TOOL_LABELS,
  CHALLENGE_TYPE_NAMES,
  objectiveLine,
  restrictionsSummary,
  turnLine,
} from '../strings/challenge';

function NumberField(props: { id: string; label: string; value: string; min?: number; max?: number; step?: string; onInput: (v: string) => void }) {
  return (
    <label class="ch-field" for={props.id}>
      <span>{props.label}</span>
      <input
        id={props.id}
        type="number"
        inputMode="decimal"
        min={props.min ?? 0}
        {...(props.max !== undefined ? { max: props.max } : {})}
        step={props.step ?? 'any'}
        value={props.value}
        data-testid={props.id}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
    </label>
  );
}

function SelectField(props: { id: string; label: string; value: string; options: readonly (readonly [string, string])[]; onChange: (v: string) => void }) {
  return (
    <label class="ch-field" for={props.id}>
      <span>{props.label}</span>
      <select id={props.id} value={props.value} data-testid={props.id} onChange={(e) => props.onChange(e.currentTarget.value)}>
        {props.options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function ObjectiveFields({ d }: { d: ChallengeDraft }) {
  const info = dishInfo.value;
  const kinds = offeredSpecies(info).map((id) => [id, info?.speciesNames[info.speciesIds.indexOf(id)] ?? id] as const);
  const duration = <NumberField id="ch-duration" label={CHALLENGE_TEXT.durationLabel} value={d.durationSeconds} min={1} max={d.horizonSeconds} step="1" onInput={(v) => updateDraft({ durationSeconds: v })} />;
  switch (d.type) {
    case 'keepSpeciesAlive':
      return (
        <>
          <SelectField id="ch-species" label={CHALLENGE_TEXT.speciesLabel} value={d.species} options={kinds} onChange={(v) => updateDraft({ species: v })} />
          {duration}
        </>
      );
    case 'biomassThreshold': {
      // P5.6: what is measured, where (a quarter or one of the dish's own regions) and an optional starting limit
      // (Recover a neighborhood). The whole dish is not offered once a starting limit is set.
      const regions: (readonly [string, string])[] = [
        ...(d.fromBelow.trim() === '' ? [['dish', CHALLENGE_REGION_NAMES.dish!] as const] : []),
        ...CHALLENGE_QUARTERS.map((r) => [r, CHALLENGE_REGION_NAMES[r]!] as const),
        ...(info?.regions ?? []).map((r) => [`habitat:${r.id}`, CHALLENGE_TEXT.habitatRegion(r.label)] as const),
      ];
      return (
        <>
          <SelectField id="ch-species" label={CHALLENGE_TEXT.speciesLabel} value={d.species} options={[['', CHALLENGE_TEXT.allLife], ...kinds]} onChange={(v) => updateDraft({ species: v })} />
          <SelectField id="ch-measure" label={CHALLENGE_TEXT.measureLabel} value={d.measure} options={Object.entries(CHALLENGE_MEASURE_NAMES)} onChange={(v) => updateDraft({ measure: v })} />
          <NumberField id="ch-threshold" label={d.measure === '' ? CHALLENGE_TEXT.thresholdLabel : CHALLENGE_TEXT.countLabel} value={d.threshold} min={0} onInput={(v) => updateDraft({ threshold: v })} />
          <NumberField id="ch-from-below" label={CHALLENGE_TEXT.fromBelowLabel} value={d.fromBelow} min={1} step="1" onInput={(v) => updateDraft({ fromBelow: v })} />
          {d.measure !== '' || d.fromBelow.trim() !== '' ? (
            <SelectField
              id="ch-region"
              label={CHALLENGE_TEXT.regionLegend}
              value={regions.some(([v]) => v === d.region) ? d.region : ''}
              options={regions.some(([v]) => v === d.region) ? regions : [['', CHALLENGE_TEXT.chooseRegion], ...regions]}
              onChange={(v) => updateDraft({ region: v })}
            />
          ) : null}
        </>
      );
    }
    case 'observeEvent':
      return (
        <>
          <SelectField id="ch-event" label={CHALLENGE_TEXT.eventLabel} value={d.event} options={offeredEvents(info).map((e) => [e, CHALLENGE_EVENT_NAMES[e]!] as const)} onChange={(v) => updateDraft({ event: v })} />
          {d.event === 'conversion' ? (
            <SelectField id="ch-enzyme" label={CHALLENGE_TEXT.enzymeLabel} value={d.enzyme} options={Object.entries(CHALLENGE_ENZYME_NAMES)} onChange={(v) => updateDraft({ enzyme: v })} />
          ) : (
            <SelectField id="ch-species" label={CHALLENGE_TEXT.speciesLabel} value={d.species} options={[['', CHALLENGE_TEXT.anyKind], ...kinds]} onChange={(v) => updateDraft({ species: v })} />
          )}
        </>
      );
    case 'fieldInRange':
      return (
        <>
          <SelectField id="ch-field" label={CHALLENGE_TEXT.fieldLabel} value={d.field} options={offeredFields(info).map((f) => [f, CHALLENGE_FIELD_NAMES[f]!] as const)} onChange={(v) => updateDraft({ field: v })} />
          <NumberField id="ch-min" label={CHALLENGE_TEXT.minLabel} value={d.min} onInput={(v) => updateDraft({ min: v })} />
          <NumberField id="ch-max" label={CHALLENGE_TEXT.maxLabel} value={d.max} onInput={(v) => updateDraft({ max: v })} />
          {duration}
          <SelectField
            id="ch-region"
            label={CHALLENGE_TEXT.regionLegend}
            value={d.region}
            options={(['dish', ...CHALLENGE_QUARTERS] as const).map((r) => [r, CHALLENGE_REGION_NAMES[r]!] as const)}
            onChange={(v) => updateDraft({ region: v })}
          />
        </>
      );
    case 'transferAcrossGate':
      return null;
  }
}

export function ChallengeEditor() {
  const s = challengeSheet.value;
  const info = dishInfo.value;
  if (!s || s.view !== 'edit') return null;
  const d = s.draft;
  const geometry = latestDishSnapshots()?.geometry; // P5.6: a placed gate, not only an enabled one
  const gate = gateAvailable(info, geometry ? (geometry.edges?.list ?? []) : null);
  const preview = draftToInput(d, info);
  const speciesName = (id: string) => info?.speciesNames[info.speciesIds.indexOf(id)] ?? id;
  return (
    <section class="sheet try-sheet ch-sheet" aria-labelledby="ch-editor-title" data-testid="challenge-editor">
      <div class="sheet-scroll">
        <header>
          <h2 id="ch-editor-title">{CHALLENGE_TEXT.editorTitle}</h2>
          <button class="btn ghost" aria-label={CHALLENGE_TEXT.cancel} onClick={closeChallengeSheet}>
            <IconClose />
          </button>
        </header>
        <p class="try-text">{CHALLENGE_TEXT.editorIntro}</p>
        {s.templates.length > 0 ? (
          <SelectField
            id="ch-start-from"
            label={CHALLENGE_TEXT.startFromLabel}
            value={d.template ?? ''}
            options={[['', CHALLENGE_TEXT.startFromNone], ...s.templates.map((t) => [t.id, t.title] as const)]}
            onChange={(v) => chooseTemplate(v === '' ? null : v)}
          />
        ) : null}
        <label class="ch-field" for="ch-name">
          <span>{CHALLENGE_TEXT.nameLabel}</span>
          <input id="ch-name" type="text" value={d.name} maxLength={CHALLENGE_NAME_MAX} data-testid="ch-name" onInput={(e) => updateDraft({ name: e.currentTarget.value })} />
        </label>
        <fieldset class="goal-choices" data-testid="ch-type">
          <legend>{CHALLENGE_TEXT.typeLegend}</legend>
          {OBJECTIVE_TYPES.map((t: ObjectiveType) => {
            const disabled = t === 'transferAcrossGate' && !gate;
            const checked = d.type === t;
            return (
              <label key={t} class={`goal-choice${checked ? ' selected' : ''}${disabled ? ' ch-disabled' : ''}`} data-testid={`ch-type-${t}`}>
                <input type="radio" name="ch-type" value={t} checked={checked} disabled={disabled} aria-describedby={disabled ? 'ch-no-gate' : undefined} onChange={() => updateDraft({ type: t })} />
                <span class="goal-choice-text">
                  <strong>{CHALLENGE_TYPE_NAMES[t]}</strong>
                  {disabled ? <span id="ch-no-gate">{CHALLENGE_TEXT.noGate}</span> : null}
                </span>
              </label>
            );
          })}
        </fieldset>
        <div class="ch-fields">
          <ObjectiveFields d={d} />
        </div>
        <fieldset class="goal-choices" data-testid="ch-tools">
          <legend>{CHALLENGE_TEXT.toolsLegend}</legend>
          {CHALLENGE_TOOL_GROUPS.map((t) => {
            const on = d.allowedTools.includes(t);
            return (
              <label key={t} class={`goal-choice${on ? ' selected' : ''}`} data-testid={`ch-tool-${t}`}>
                <input type="checkbox" checked={on} onChange={(e) => toggleTool(t, e.currentTarget.checked)} />
                <span class="goal-choice-text">
                  <strong>{CHALLENGE_TOOL_LABELS[t]}</strong>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div class="ch-fields">
          <NumberField id="ch-budget" label={CHALLENGE_TEXT.budgetLabel} value={d.budget} min={CHALLENGE_BUDGET_MIN} max={CHALLENGE_BUDGET_MAX} step="1" onInput={(v) => updateDraft({ budget: v })} />
          <p class="try-text try-muted">{CHALLENGE_TEXT.budgetHint}</p>
        </div>
        <fieldset class="goal-choices" data-testid="ch-length">
          <legend>{CHALLENGE_TEXT.lengthLegend}</legend>
          {CHALLENGE_HORIZON_SECONDS.map((sec) => {
            const checked = d.horizonSeconds === sec;
            return (
              <label key={sec} class={`goal-choice${checked ? ' selected' : ''}`} data-testid={`ch-length-${sec}`}>
                <input type="radio" name="ch-length" value={String(sec)} checked={checked} onChange={() => updateDraft({ horizonSeconds: sec })} />
                <span class="goal-choice-text">
                  <strong>{CHALLENGE_TEXT.lengthOption(sec)}</strong>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div class="ch-summary" data-testid="ch-summary">
          <h3>{CHALLENGE_TEXT.summaryHeading}</h3>
          {preview.ok ? <p class="try-text">{objectiveLine(preview.input, speciesName, (id) => info?.regions?.find((r) => r.id === id)?.label ?? id)}</p> : null}
          <p class="try-text" data-testid="ch-restrictions">
            {restrictionsSummary({ allowedTools: d.allowedTools, commandBudget: preview.ok ? preview.input.commandBudget : /^[0-9]{1,2}$/.test(d.budget.trim()) && Number(d.budget) >= 1 ? Number(d.budget) : null })}
          </p>
          <p class="try-text">{turnLine(d.horizonSeconds)}</p>
        </div>
        {s.message !== null ? (
          <p class="constraint try-text" data-testid="ch-message">
            {s.message}
          </p>
        ) : null}
        <div class="try-actions">
          <button class="btn primary" disabled={s.busy} data-testid="ch-save" onClick={() => void saveChallenge()}>
            {s.busy ? CHALLENGE_TEXT.saving : CHALLENGE_TEXT.save}
          </button>
          <button class="btn" onClick={closeChallengeSheet} data-testid="ch-cancel">
            {CHALLENGE_TEXT.cancel}
          </button>
        </div>
      </div>
    </section>
  );
}
