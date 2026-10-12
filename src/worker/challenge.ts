/**
 * Custom challenges in the worker (P4.8 part c; SPEC §13.5 "restrictions apply only inside that challenge";
 * D02 §20; D07 line 107 "Challenge allowances count successful placements … Configure and inspect are free.
 * Undo rewinds allowance accounting with the rest of the world. The player can always abandon a challenge and
 * open an explicitly unrestricted copy"; D09 line 134; D-0071 "Objectives are evaluated, never enforced in the
 * sim"). Pure helpers the host calls:
 *
 * - `challengeRefusal(d, payload)`: the one refusal the host's 'command' case asks for. Only on a dish whose
 *   Try my dish turn record carries a challenge (src/persistence/notebookTurns.ts TurnChallenge): a command
 *   of a tool group the challenge does not allow is refused, and so is a counted command once the action
 *   budget is used. A refusal never reaches the world (the host answers before applyNow), so the dish stays
 *   bit-identical. Outside a challenge it is always null. The OBJECTIVE is never enforced: it is evaluated by
 *   the objective engine as any goal (src/worker/goals.ts GoalRunner, src/sim/objectives.ts ObjectiveWatch);
 * - the budget is read from the world's own command log: the accepted (accepted > 0) commands of counted
 *   kinds with a sequence number at or after the turn's start (TurnChallenge.startSeq). Undo restores the
 *   world, log included, so it gives the action back (D07);
 * - the challenge's goal definition (an ObjectiveDef object the GoalRunner starts, never a registry id), the
 *   check the editor's input gets before it is saved (the engine's own predicate check, exactly as content
 *   objectives get it, plus "can this dish run it"), and the export text (the baseline save with a notebook
 *   holding only this challenge; the state and its checksum unchanged).
 *
 * Tool groups (PROPOSED DECISION): addLife = inoculate and a lineage spawnSpecimen (it introduces organisms);
 * feed = deposit, placeObject; habitat = paintSubstrate, paintShade, placeStructure, eraseStructure; sample =
 * sampleTake (Transfer and Discard finish the held sample and are not counted again); cleanWater; lid =
 * setLid; evolution = setMutationPreset. Every other lineage op (names, pins, saving a specimen) and every
 * read-only request (inspect, overlays, charts, the map, probes) is free. Fix round 1: Lid and Evolution
 * settings are configuration (D07 "Configure and inspect are free"): a challenge may disallow them, but they
 * never use an action of the budget. A finished turn is no longer inside the challenge (no limits). Fix round 2:
 * Finish also leaves the challenge's running goal ('continuedFreely', 'left'), and it cannot be tried again
 * after Finish, so a result measured without the limits is never recorded as the challenge's completion.
 */
import type { CommandPayload } from '@sim/commands';
import type { ContentRegistry } from '@sim/content/registry';
import type { ObjectiveDef } from '@sim/content/schema';
import { objectivePredicateProblem, objectiveSupportProblem, typedPredicate, type ObjectivePredicate } from '@sim/objectives';
import type { World } from '@sim/world';
import { emptyNotebook, sealNotebook, type NotebookRecord } from '@persist/notebook';
import { turnOf, type TurnChallenge } from '@persist/notebookTurns';
import { goalsOf } from '@persist/notebookGoals';
import {
  challengeInputProblem,
  challengeObjectiveId,
  challengePredicate,
  type ChallengeInput,
  type ChallengeRecord,
  type ChallengeToolGroup,
} from '@persist/notebookChallenges';

/** The tool groups as the player reads them (the refusal and the restrictions summary). */
export const CHALLENGE_TOOL_LABELS: Readonly<Record<ChallengeToolGroup, string>> = {
  addLife: 'Add Life',
  feed: 'Feed',
  habitat: 'Habitat',
  sample: 'Sample',
  cleanWater: 'Clean water',
  lid: 'Lid',
  evolution: 'Evolution settings',
};

/** Readable refusals (nothing was changed when one is given). */
export const CHALLENGE_REFUSALS = {
  notAllowed: (tool: string) => `This challenge doesn't allow ${tool}. The limit applies only inside this challenge.`,
  budgetUsed: (n: number) => `This challenge's ${n} action${n === 1 ? ' is' : 's are'} used.`,
  arm: 'A comparison copy cannot hold a challenge. Close the comparison first.',
  sample: 'Transfer, cancel or discard the held sample first; a challenge starts from a dish with nothing held.',
  failed: 'Something went wrong with this dish, so a challenge cannot be made or started from it.',
  noStore: 'This device cannot keep a starting point, so a challenge cannot be made or started.',
  full: (n: number) => `This dish already holds ${n} challenges.`,
  unknown: 'That challenge is not in this dish.',
  changed: 'This dish has changed since the challenge was made. Import the challenge file again to start it.',
  inUse: 'That new dish id is already in use.',
  noBaseline: 'The saved starting point for this challenge is not on this device. Import the challenge file to export or start it.',
  cannotRun: (why: string) => `This dish cannot run that objective: ${why}.`,
} as const;

/** The tool group a command belongs to, or null when it is free (names, pins, saved specimens). */
export function toolGroupOf(p: CommandPayload): ChallengeToolGroup | null {
  switch (p.kind) {
    case 'inoculate':
      return 'addLife';
    case 'deposit':
    case 'placeObject':
      return 'feed';
    case 'paintSubstrate':
    case 'paintShade':
    case 'placeStructure':
    case 'eraseStructure':
      return 'habitat';
    case 'sampleTake':
    case 'sampleTransfer':
    case 'sampleDiscard':
      return 'sample';
    case 'cleanWater':
      return 'cleanWater';
    case 'setLid':
      return 'lid';
    case 'setMutationPreset':
      return 'evolution';
    case 'lineage':
      return p.op === 'spawnSpecimen' ? 'addLife' : null;
  }
}

/**
 * Whether an accepted command of this kind uses one action of the budget. Transfer and Discard finish a Take;
 * fix round 1 (D07 line 107 "Challenge allowances count successful placements and external loads … Configure
 * and inspect are free"): the Lid and Evolution settings configure the dish, so they are never counted (a
 * challenge can still disallow them; setLid reports accepted 1 even when the lid was already in that state).
 */
export function countsAgainstBudget(p: CommandPayload): boolean {
  return toolGroupOf(p) !== null && p.kind !== 'sampleTransfer' && p.kind !== 'sampleDiscard' && p.kind !== 'setLid' && p.kind !== 'setMutationPreset';
}

/** The actions a challenge turn has used: accepted counted commands logged at or after its start (Undo gives one back). */
export function challengeUsed(world: World, ch: Pick<TurnChallenge, 'startSeq'>): number {
  let n = 0;
  for (const cmd of world.commands.log) if (cmd.seq >= ch.startSeq && (cmd.result?.accepted ?? 0) > 0 && countsAgainstBudget(cmd.payload)) n++;
  return n;
}

/** What challengeRefusal reads of a host dish (structurally the host's Dish). */
export interface ChallengeDish {
  readonly arm: unknown;
  readonly transient?: boolean;
  readonly notebook: NotebookRecord;
  readonly world: World;
}

/** True while `turn` plays a challenge whose limits apply: a turn not finished (Finish leaves the challenge). */
export function challengeActive(turn: { readonly state: string; readonly challenge?: TurnChallenge } | null | undefined): boolean {
  return !!turn?.challenge && turn.state !== 'finished';
}

/**
 * The challenge the dish's turn plays, or null (a comparison copy and the transient Continue copy hold none).
 * Fix round 1 (SPEC §13.5 "restrictions apply only inside that challenge"): a FINISHED turn is an ordinary
 * dish (the Finish toast says so and the badge is gone), so its limits no longer apply. Finish is one-way
 * (turnAfterTime never reopens a finished turn; Undo keeps it finished), and the record keeps the challenge
 * field as history.
 */
export function challengeOf(d: ChallengeDish): TurnChallenge | null {
  if (d.arm || d.transient) return null;
  const t = turnOf(d.notebook);
  return t?.challenge && challengeActive(t) ? t.challenge : null;
}

/**
 * The host's one refusal line: why `payload` may not change this dish, or null. Null outside a challenge.
 * Read-only: it never changes the dish.
 */
export function challengeRefusal(d: ChallengeDish, payload: CommandPayload): string | null {
  const ch = challengeOf(d);
  if (!ch) return null;
  const group = toolGroupOf(payload);
  if (group === null) return null;
  if (!ch.allowedTools.includes(group)) return CHALLENGE_REFUSALS.notAllowed(CHALLENGE_TOOL_LABELS[group]);
  if (ch.commandBudget !== null && countsAgainstBudget(payload) && challengeUsed(d.world, ch) >= ch.commandBudget) return CHALLENGE_REFUSALS.budgetUsed(ch.commandBudget);
  return null;
}

/** The goal title of a challenge: its name (the player's words, only displayed). */
export function challengeDef(c: { readonly id: string; readonly name: string; readonly predicate: ObjectivePredicate }, phase: number): ObjectiveDef {
  return {
    id: challengeObjectiveId(c.id),
    title: c.name,
    predicate: JSON.parse(JSON.stringify(c.predicate)) as ObjectivePredicate,
    phase,
    summary: c.name,
    completedText: `${c.name}: completed at {time}.`,
    endedText: `${c.name}: this attempt ended at {time}. The dish keeps going.`,
    offerOn: [],
  };
}

/**
 * Why `input` cannot be saved as a challenge of `world`, or null: the typed values (challengeInputProblem),
 * the engine's content check of its objective (objectivePredicateProblem with this build's species and
 * structures and the dish's own recorded manifest), and whether this dish can run it (objectiveSupportProblem;
 * a gate objective never can before Phase 5).
 */
export function challengeSaveProblem(registry: ContentRegistry, world: World, input: unknown): string | null {
  const p = challengeInputProblem(input);
  if (p) return p;
  const c = input as ChallengeInput;
  const pred = challengePredicate(c);
  const m = world.content.manifest;
  const def = challengeDef({ id: 'ch-1', name: c.name, predicate: pred }, m.buildPhase);
  const problem = objectivePredicateProblem(def, { species: registry.species, structures: registry.structures, recipes: registry.recipes, manifest: m });
  if (problem) return CHALLENGE_REFUSALS.cannotRun(problem.message);
  const why = objectiveSupportProblem(world, pred);
  return why === null ? null : CHALLENGE_REFUSALS.cannotRun(why);
}

/** The turn's challenge field for `c` (startSeq: the turn world's next command sequence number at its start). */
export function turnChallengeOf(c: ChallengeRecord, startSeq: number): TurnChallenge {
  const p = challengePredicate(c);
  return { id: c.id, name: c.name, allowedTools: [...c.allowedTools], commandBudget: c.commandBudget, startSeq, predicate: { type: p.type, params: p.params, ...(p.durationSeconds !== undefined ? { durationSeconds: p.durationSeconds } : {}) } };
}

/** The objective of a turn's challenge is still one of the engine's five types (a record check already ran). */
export function turnChallengeDef(ch: TurnChallenge, phase: number): ObjectiveDef | null {
  const pred = ch.predicate as ObjectivePredicate;
  return 'path' in typedPredicate(pred) ? null : challengeDef({ id: ch.id, name: ch.name, predicate: pred }, phase);
}

/** The goal definition of the turn's challenge when `objectiveId` is its goal (Try again on a challenge turn), else null. */
export function turnChallengeGoal(record: NotebookRecord, objectiveId: string, phase: number): ObjectiveDef | null {
  const t = turnOf(record);
  const ch = t?.challenge;
  // Fix round 2: only inside the challenge. After Finish its limits are off, so its goal cannot be tried again there.
  return ch && challengeActive(t) && challengeObjectiveId(ch.id) === objectiveId ? turnChallengeDef(ch, phase) : null;
}

/**
 * Fix round 2 (SPEC §13.5 "restrictions apply only inside that challenge"; Honest labels): true when Finish of
 * this dish's turn must leave the running goal, because the turn plays an active challenge and the running goal is
 * that challenge's goal. Finish lifts the limits, so the goal can no longer be completed under them. The host then
 * ends it through GoalRunner.leave ('continuedFreely', endReason 'left'). The notebook can then never say "{name}:
 * completed" for a result measured after the limits were off. A content goal running on the turn is left alone.
 */
export function challengeGoalEndsOnFinish(record: NotebookRecord): boolean {
  const t = turnOf(record);
  if (!t?.challenge || !challengeActive(t)) return false;
  const id = challengeObjectiveId(t.challenge.id);
  return goalsOf(record).some((g) => g.state === 'running' && g.objectiveId === id);
}

/**
 * The challenge file: the baseline save `text` with its notebook replaced by one holding only `challenge`
 * (no favorites, nicknames, stories, goals or turns), sealed. The state and its checksum are untouched, so
 * the file's checksum is the challenge's baseline checksum.
 */
export async function challengeExportText(text: string, challenge: ChallengeRecord): Promise<string> {
  const file = JSON.parse(text) as Record<string, unknown> & { state: { worldId: string } };
  const notebook = await sealNotebook({ ...emptyNotebook(file.state.worldId), challenges: [challenge] });
  return JSON.stringify({ ...file, notebook });
}

/** The challenge file's name. */
export function challengeFileName(name: string): string {
  return `${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'challenge'}.challenge.pixelmeba`;
}
