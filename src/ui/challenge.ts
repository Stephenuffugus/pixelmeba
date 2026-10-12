/**
 * Custom challenges on the main thread (P4.8 part c; SPEC §13.5; D02 §20; D07 line 107; D09 line 134;
 * D-0071; UX §2 "Blocking panels … pause and restore the prior run state on close"). UI state only; the
 * records, the baseline and the limits are the worker's (src/worker/challenge.ts,
 * src/persistence/notebookChallenges.ts):
 *
 * - the editor (sheet 'challenge', view 'edit'; More → Make a challenge…): a draft of typed choices only —
 *   ids picked from lists, numbers from number fields and a name that is only displayed. `draftToInput`
 *   turns it into a ChallengeInput or says what is missing; nothing typed as text reaches the objective;
 * - the start sheet (view 'start'; More → Start challenge: {name}): the restrictions first, then Start, which
 *   keeps the open dish first (D-0033) and opens a Try my dish turn from the challenge's baseline;
 * - Leave challenge (view 'leave'): Open an unrestricted copy (the ordinary Duplicate path; a copy never
 *   takes the turn record, so it has no limits);
 * - Export challenge: the challenge file through the ordinary download;
 * - a command a challenge turn refused is announced with its words (the toast; the dish is unchanged).
 */
import { batch, signal } from '@preact/signals';
import type { SimClient } from '@worker/client';
import type { DishInfo, Speed } from '@worker/protocol';
import {
  CHALLENGE_BUDGET_MAX,
  CHALLENGE_BUDGET_MIN,
  CHALLENGE_HORIZON_DEFAULT,
  CHALLENGE_QUARTERS,
  CHALLENGE_TOOL_GROUPS,
  challengeInputProblem,
  challengesOf,
  cleanChallengeName,
  type ChallengeHorizonSeconds,
  type ChallengeInput,
  type ChallengeQuarter,
  type ChallengeRecord,
  type ChallengeToolGroup,
} from '@persist/notebookChallenges';
import type { ObjectiveType } from '@sim/objectives';
import { dishInfo, enterStartedDish, freshDishId, getClient, meta, replaceForTry, route, saveTextFile, sheet, showToast } from './state';
import { notebook } from './favorites';
import { currentTurn } from './tryDish';
import { keptLine } from './strings/keep';
import { CHALLENGE_EVENT_NAMES, CHALLENGE_FIELD_NAMES, CHALLENGE_TEXT } from './strings/challenge';

export type ChallengeView = 'edit' | 'start' | 'leave';

/** The editor's typed choices (strings only where a list or a number field supplies them). */
export interface ChallengeDraft {
  readonly name: string;
  readonly type: ObjectiveType;
  /** keepSpeciesAlive: required; biomassThreshold / observeEvent: '' means all life / any kind. */
  readonly species: string;
  readonly threshold: string;
  readonly field: string;
  readonly min: string;
  readonly max: string;
  readonly durationSeconds: string;
  readonly event: string;
  readonly enzyme: string;
  readonly region: 'dish' | ChallengeQuarter;
  readonly allowedTools: readonly ChallengeToolGroup[];
  /** '' = no limit. */
  readonly budget: string;
  readonly horizonSeconds: ChallengeHorizonSeconds;
}

export interface ChallengeSheetState {
  readonly view: ChallengeView;
  readonly dishId: string;
  readonly draft: ChallengeDraft;
  /** The challenge the start sheet shows (start view). */
  readonly challengeId: string | null;
  /** Start view: why it cannot start (null: it can; undefined: still checking). */
  readonly refusal: string | null | undefined;
  readonly busy: boolean;
  readonly message: string | null;
  /** The dish's run state when the panel opened (restored on close). */
  readonly resumeSpeed: Speed;
}

export const challengeSheet = signal<ChallengeSheetState | null>(null);

/** Fields the editor offers on this dish (allocated by it and in CHALLENGE_FIELD_NAMES). */
export function offeredFields(info: Pick<DishInfo, 'fieldIds'> | null): string[] {
  const have = info?.fieldIds ?? [];
  return Object.keys(CHALLENGE_FIELD_NAMES).filter((f) => have.includes(f));
}

/** Event types the editor offers (conversion only with the enzymes system's activity field). */
export function offeredEvents(info: Pick<DishInfo, 'fieldIds'> | null): string[] {
  return Object.keys(CHALLENGE_EVENT_NAMES).filter((e) => e !== 'conversion' || (info?.fieldIds ?? []).includes('broth'));
}

/** The kinds a challenge can name (the dish's recorded species). */
export function offeredSpecies(info: Pick<DishInfo, 'speciesIds'> | null): string[] {
  return [...(info?.speciesIds ?? [])];
}

/** Whether this dish has a gate structure a transfer goal could measure (none before Phase 5). */
export function gateAvailable(info: Pick<DishInfo, 'structureIds'> | null): boolean {
  return (info?.structureIds ?? []).some((id) => /^S[0-9]{2}$/.test(id));
}

/** The editor's defaults: keep the first kind alive for 60 s; every tool; no limit; 180 s turns. */
export function newDraft(info: Pick<DishInfo, 'speciesIds' | 'fieldIds'> | null): ChallengeDraft {
  return {
    name: CHALLENGE_TEXT.defaultName,
    type: 'keepSpeciesAlive',
    species: offeredSpecies(info)[0] ?? '',
    threshold: '100',
    field: offeredFields(info)[0] ?? 'sugar',
    min: '0',
    max: '1',
    durationSeconds: '60',
    event: 'birth',
    enzyme: 'starch',
    region: 'dish',
    allowedTools: [...CHALLENGE_TOOL_GROUPS],
    budget: '',
    horizonSeconds: CHALLENGE_HORIZON_DEFAULT,
  };
}

const num = (s: string): number | null => {
  const t = s.trim();
  if (t === '' || !/^[0-9]+(\.[0-9]+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * The ChallengeInput a draft describes, or the first thing to fix. Only typed values leave: a species, field,
 * event, enzyme or region must be one the lists offer on `info`, every number comes from a number field (a
 * non-number is refused, never passed on), and the name is cleaned and kept out of the objective.
 */
export function draftToInput(d: ChallengeDraft, info: Pick<DishInfo, 'speciesIds' | 'fieldIds' | 'structureIds'> | null): { readonly ok: true; readonly input: ChallengeInput } | { readonly ok: false; readonly message: string } {
  const bad = (message: string) => ({ ok: false as const, message });
  const name = cleanChallengeName(d.name);
  if (name.length === 0) return bad('Give the challenge a name.');
  const species = offeredSpecies(info);
  const kind = (required: boolean): string | null | undefined => {
    if (d.species === '' && !required) return null;
    return species.includes(d.species) ? d.species : undefined;
  };
  const duration = num(d.durationSeconds);
  let objective: ChallengeInput['objective'];
  switch (d.type) {
    case 'keepSpeciesAlive': {
      const sp = kind(true);
      if (!sp) return bad('Choose a kind to keep alive.');
      if (duration === null || duration <= 0) return bad('Enter how many seconds, above 0.');
      objective = { type: d.type, params: { species: sp }, durationSeconds: duration };
      break;
    }
    case 'biomassThreshold': {
      const sp = kind(false);
      if (sp === undefined) return bad('Choose a kind, or all living things.');
      const t = num(d.threshold);
      if (t === null || t <= 0) return bad('Enter a biomass above 0.');
      objective = { type: d.type, params: { ...(sp ? { species: sp } : {}), threshold: t } };
      break;
    }
    case 'transferAcrossGate':
      return bad(CHALLENGE_TEXT.noGate);
    case 'observeEvent': {
      if (!offeredEvents(info).includes(d.event)) return bad('Choose what to see.');
      if (d.event === 'conversion') {
        if (!['starch', 'oil', 'protein'].includes(d.enzyme)) return bad('Choose an enzyme.');
        objective = { type: d.type, params: { event: 'conversion', enzyme: d.enzyme } };
      } else {
        const sp = kind(false);
        if (sp === undefined) return bad('Choose a kind, or any kind.');
        objective = { type: d.type, params: { event: d.event, ...(sp ? { species: sp } : {}) } };
      }
      break;
    }
    case 'fieldInRange': {
      if (!offeredFields(info).includes(d.field)) return bad('Choose a level to keep.');
      const min = num(d.min);
      const max = num(d.max);
      if (min === null || max === null || max < min) return bad('Enter a range with at least ≤ at most.');
      if (duration === null || duration <= 0) return bad('Enter how many seconds, above 0.');
      objective = { type: d.type, params: { field: d.field, min, max }, durationSeconds: duration };
      break;
    }
  }
  if (objective.durationSeconds !== undefined && objective.durationSeconds > d.horizonSeconds) return bad('That goal needs a longer turn.');
  let budget: number | null = null;
  if (d.budget.trim() !== '') {
    const b = num(d.budget);
    if (b === null || !Number.isInteger(b) || b < CHALLENGE_BUDGET_MIN || b > CHALLENGE_BUDGET_MAX) return bad(`Enter an action limit from ${CHALLENGE_BUDGET_MIN} to ${CHALLENGE_BUDGET_MAX}, or leave it empty.`);
    budget = b;
  }
  const region = d.type === 'fieldInRange' && (CHALLENGE_QUARTERS as readonly string[]).includes(d.region) ? { kind: 'quarter' as const, id: d.region as ChallengeQuarter } : { kind: 'dish' as const };
  const input: ChallengeInput = {
    name,
    objective,
    allowedTools: CHALLENGE_TOOL_GROUPS.filter((t) => d.allowedTools.includes(t)),
    commandBudget: budget,
    horizonSeconds: d.horizonSeconds,
    region,
  };
  const problem = challengeInputProblem(input);
  return problem ? bad(problem) : { ok: true, input };
}

/** The challenge a start sheet or export means: the turn's challenge, else the latest the dish holds. */
export function defaultChallenge(records: readonly ChallengeRecord[], turnChallengeId: string | null): ChallengeRecord | null {
  return records.find((c) => c.id === turnChallengeId) ?? records.at(-1) ?? null;
}

function pauseForSheet(): { dishId: string; speed: Speed } | null {
  const info = dishInfo.value;
  if (!info) return null;
  const speed = meta.value?.speed ?? 0;
  if (speed > 0) getClient().setSpeed(info.dishId, 0);
  return { dishId: info.dishId, speed };
}

function openSheet(view: ChallengeView, challengeId: string | null): void {
  const p = pauseForSheet();
  if (!p) return;
  challengeSheet.value = { view, dishId: p.dishId, draft: newDraft(dishInfo.value), challengeId, refusal: view === 'start' ? undefined : null, busy: false, message: null, resumeSpeed: p.speed };
  sheet.value = 'challenge';
  if (view === 'start' && challengeId !== null) void checkStart(p.dishId, challengeId);
}

/** More → Make a challenge… (a blocking panel: the dish pauses; Cancel restores its run state). */
export function openChallengeEditor(): void {
  openSheet('edit', null);
}

/** More → Start challenge: {name}. */
export function openChallengeStart(challengeId: string): void {
  openSheet('start', challengeId);
}

/** More → Leave challenge…. */
export function openChallengeLeave(): void {
  openSheet('leave', currentTurn.value?.challenge?.id ?? null);
}

async function checkStart(dishId: string, challengeId: string): Promise<void> {
  let refusal: string | null;
  try {
    refusal = await getClient().challengeCheck(dishId, challengeId);
  } catch (e) {
    refusal = e instanceof Error ? e.message : String(e);
  }
  const s = challengeSheet.peek();
  if (s && s.dishId === dishId && s.challengeId === challengeId) challengeSheet.value = { ...s, refusal };
}

/** The start sheet's choice among the dish's challenges. */
export function chooseChallenge(challengeId: string): void {
  const s = challengeSheet.value;
  if (!s || s.view !== 'start' || s.challengeId === challengeId) return;
  challengeSheet.value = { ...s, challengeId, refusal: undefined, message: null };
  void checkStart(s.dishId, challengeId);
}

export function updateDraft(patch: Partial<ChallengeDraft>): void {
  const s = challengeSheet.value;
  if (s) challengeSheet.value = { ...s, draft: { ...s.draft, ...patch }, message: null };
}

export function toggleTool(t: ChallengeToolGroup, on: boolean): void {
  const s = challengeSheet.value;
  if (!s) return;
  const tools = on ? [...new Set([...s.draft.allowedTools, t])] : s.draft.allowedTools.filter((x) => x !== t);
  updateDraft({ allowedTools: CHALLENGE_TOOL_GROUPS.filter((x) => tools.includes(x)) });
}

/** Close (Cancel, Esc, or after an action): the dish carries on as it was running when nothing replaced it. */
export function closeChallengeSheet(): void {
  const s = challengeSheet.value;
  challengeSheet.value = null;
  if (sheet.value === 'challenge') sheet.value = 'none';
  if (s && s.resumeSpeed > 0 && dishInfo.value?.dishId === s.dishId && route.value.name === 'dish') getClient().setSpeed(s.dishId, s.resumeSpeed);
}

/** The DishScreen key handler's check: the challenge sheet is a blocking panel (Esc is its Cancel). True: the key was taken. */
export function challengeSheetKey(key: string): boolean {
  if (sheet.value !== 'challenge') return false;
  if (key === 'Escape') closeChallengeSheet();
  return true;
}

/** Save challenge: the paused dish becomes the challenge's baseline on the shelf; the record joins its notebook. */
export async function saveChallenge(): Promise<void> {
  const s = challengeSheet.value;
  const info = dishInfo.value;
  if (!s || s.view !== 'edit' || s.busy || !info || info.dishId !== s.dishId) return;
  const r = draftToInput(s.draft, info);
  if (!r.ok) {
    challengeSheet.value = { ...s, message: r.message };
    return;
  }
  challengeSheet.value = { ...s, busy: true, message: null };
  try {
    const a = await getClient().challengeSave(s.dishId, r.input);
    const now = challengeSheet.peek();
    if (!a.ok) {
      if (now) challengeSheet.value = { ...now, busy: false, message: CHALLENGE_TEXT.saveFailed(a.message) };
      return;
    }
    if (dishInfo.peek()?.dishId === s.dishId) notebook.value = a.record;
    closeChallengeSheet();
    showToast(CHALLENGE_TEXT.saved(a.challenge.name), 5000);
  } catch (e) {
    const now = challengeSheet.peek();
    if (now) challengeSheet.value = { ...now, busy: false, message: CHALLENGE_TEXT.saveFailed(e instanceof Error ? e.message : String(e)) };
  }
}

/** Start challenge: the open dish is kept first (D-0033), then the challenge's turn 1 opens paused in its place. */
export async function startChallenge(): Promise<void> {
  const s = challengeSheet.value;
  const info = dishInfo.value;
  if (!s || s.view !== 'start' || s.busy || s.refusal !== null || s.challengeId === null || !info || info.dishId !== s.dishId) return;
  const challenge = challengesOf(notebook.value ?? {}).find((c) => c.id === s.challengeId);
  const name = challenge?.name ?? '';
  challengeSheet.value = { ...s, busy: true, message: null };
  const c = getClient();
  try {
    const outcome = await replaceForTry(CHALLENGE_TEXT.startTitle(name), async (keepFrom) => {
      const r = await c.challengeStartKeeping(s.dishId, s.challengeId!, freshDishId(), keepFrom);
      if ('exclude' in r) return r; // the open dish could not be kept (the Keep sheet asks)
      if (!r.ok) throw new Error(r.message);
      challengeSheet.value = null;
      if (sheet.value === 'challenge') sheet.value = 'none';
      enterStartedDish(r.info, s.dishId);
      currentTurn.value = r.turn;
      const line = keptLine(r.kept);
      showToast(`${line ? `${line} ` : ''}${CHALLENGE_TEXT.started(name, r.turn.startTick)}`, 5000);
      return { ok: true };
    });
    const now = challengeSheet.peek();
    if (outcome.kind === 'refused' && now) challengeSheet.value = { ...now, busy: false, message: CHALLENGE_TEXT.startFailed(outcome.message) };
    else if (outcome.kind === 'choosing' && now) {
      challengeSheet.value = { ...now, busy: false };
      if (sheet.value === 'challenge') sheet.value = 'none';
    }
  } catch (e) {
    const now = challengeSheet.peek();
    if (now) challengeSheet.value = { ...now, busy: false, message: CHALLENGE_TEXT.startFailed(e instanceof Error ? e.message : String(e)) };
  }
}

/** Export challenge: the challenge file through the ordinary download. */
export async function exportChallenge(challengeId: string): Promise<void> {
  const info = dishInfo.value;
  if (!info) return;
  try {
    const r = await getClient().challengeExport(info.dishId, challengeId);
    if (!r.ok) {
      showToast(CHALLENGE_TEXT.exportFailed(r.message), 6000);
      return;
    }
    saveTextFile(r.text, r.filename);
    showToast(CHALLENGE_TEXT.exported(r.filename));
  } catch (e) {
    showToast(CHALLENGE_TEXT.exportFailed(e instanceof Error ? e.message : String(e)), 6000);
  }
}

/**
 * Open an unrestricted copy (D07 "The player can always abandon a challenge and open an explicitly unrestricted
 * copy"): the ordinary Duplicate path, keeping the turn first (D-0033). A copy never takes the turn record.
 */
export async function openUnrestrictedCopy(): Promise<void> {
  const s = challengeSheet.value;
  const info = dishInfo.value;
  if (!s || s.view !== 'leave' || s.busy || !info || info.dishId !== s.dishId) return;
  challengeSheet.value = { ...s, busy: true, message: null };
  const c = getClient();
  try {
    const outcome = await replaceForTry(`${info.name} (copy)`, async (keepFrom) => {
      const r = await c.duplicateKeeping(info.dishId, freshDishId(), keepFrom);
      if (!r.ok) return r;
      batch(() => {
        challengeSheet.value = null;
        if (sheet.value === 'challenge') sheet.value = 'none';
      });
      c.activate(r.info.dishId);
      enterStartedDish(r.info, info.dishId);
      const line = keptLine(r.kept);
      showToast(`${line ? `${line} ` : ''}${CHALLENGE_TEXT.copyOpened}`, 6000);
      return { ok: true };
    });
    const now = challengeSheet.peek();
    if (outcome.kind === 'refused' && now) challengeSheet.value = { ...now, busy: false, message: CHALLENGE_TEXT.copyFailed(outcome.message) };
    else if (outcome.kind === 'choosing' && now) {
      challengeSheet.value = { ...now, busy: false };
      if (sheet.value === 'challenge') sheet.value = 'none';
    }
  } catch (e) {
    const now = challengeSheet.peek();
    if (now) challengeSheet.value = { ...now, busy: false, message: CHALLENGE_TEXT.copyFailed(e instanceof Error ? e.message : String(e)) };
  }
}

let wiredTo: SimClient | null = null;

/** Subscribe once per client (state.ts getClient): a command a challenge turn refused is announced in its words. */
export function wireChallenge(client: SimClient): void {
  if (wiredTo === client) return;
  wiredTo = client;
  client.onChallengeBlocked((m) => {
    if (m.dishId === dishInfo.peek()?.dishId) showToast(m.message, 5000);
  });
}
