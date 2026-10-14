/**
 * Phase 5 structure and climate words (P5.1, P5.2; SPEC §2.4, §4.4, §4.7–§4.9, §10.1, §10.4; CT §4, §5.3,
 * §12.2; UX §5.1–§5.2; D-0106, D-0111, D-0117, D-0119). Every sentence here is built from a command's own
 * result, an inspector payload or the barriers.ts table, and names structures by their content records
 * (src/ui/panels/LabTrayNames.tsx structureNameById), never by an internal code or a log note. All amounts
 * are fictional game units.
 */
import type { CommandPayload, CommandResult } from '@sim/commands';
import {
  EDGE_CHANNEL,
  EDGE_NONE,
  EDGE_S01,
  EDGE_S02,
  EDGE_SHUTTER_CLOSED,
  EDGE_SHUTTER_OPEN,
  edgeFactor,
  edgePermits,
  type TransportClass,
} from '@sim/barriers';
import { GRID_W } from '@sim/constants';
import { NOT_IN_DISH } from '@sim/grid';
import type { CellClimate, CellDeviceLine, CellEdgeLine, CellLightFactors } from '@worker/protocol';
import { inSentence, structureNameById } from '../panels/LabTrayNames';

const s = (n: number) => (n === 1 ? '' : 's');
const were = (n: number) => (n === 1 ? 'was' : 'were');

function listAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`;
}

/** "a heater", "an adsorption resin", "a one-way channel" (the article of a content name in a sentence). */
export function withArticle(name: string): string {
  const lower = inSentence(name);
  const an = /^[aeiou]/.test(lower) && !/^(one|uni|use|eu)/.test(lower);
  return `${an ? 'an' : 'a'} ${lower}`;
}

/** A content name for a structure id, in a sentence ("fine membrane"). */
function nameIn(id: string): string {
  return inSentence(structureNameById(id));
}

/** Replace any structure code (S01…S12) inside a note with its content name, so no code reaches the player. */
export function namesForCodes(note: string): string {
  return note.replace(/\bS(0[1-9]|1[0-2])\b/g, (code) => structureNameById(code));
}

// ---------------------------------------------------------------------------------------------- targets

/** What an adsorption resin can be set to remove (devices.ts RESIN_TARGETS), in player words. */
export const RESIN_TARGET_WORDS: Readonly<Record<string, string>> = {
  inhBact: 'bacterial inhibitor',
  inhFung: 'fungal inhibitor',
  inhPhoto: 'photosynthetic inhibitor',
  rival: 'rivalry chemical',
};

function targetWord(t: string): string {
  return RESIN_TARGET_WORDS[t] ?? 'a chemical';
}

// ---------------------------------------------------------------------------------------------- outcomes

/** Why an edge, device or move was skipped (structureEdits.ts StructureRefusal), as a clause after a count. */
const EDGE_REFUSALS: Readonly<Record<string, (n: number) => string>> = {
  rim: (n) => `${n} ${were(n)} on the rim`,
  structure: (n) => `${n} ${were(n)} next to a stone or wall`,
  barrier: (n) => `${n} already had a barrier`,
  channel: (n) =>
    `${n} ${were(n)} not between two open water cells (a one-way channel joins two open water cells)`,
  cap: (n) => `${n} would pass the dish’s limit of 512 edge barriers`,
};

const CELL_REFUSAL: Readonly<Record<string, string>> = {
  rim: 'that cell is outside the rim',
  structure: 'a stone, wall or bead is in that cell',
  device: 'that cell already has a furnishing or device',
  cap: 'the dish already holds 256 furnishings and devices',
  object: 'the basket carries a food object and that cell already holds one',
  missing: 'it is no longer in the dish',
};

function edgeSkips(r: CommandResult): string {
  const k = r.refused;
  if (!k) return '';
  const parts: string[] = [];
  for (const key of ['rim', 'structure', 'barrier', 'channel', 'cap'] as const) {
    const n = k[key];
    if (n !== undefined && n > 0) parts.push(EDGE_REFUSALS[key]!(n));
  }
  return parts.length > 0 ? ` Skipped: ${parts.join('; ')}.` : '';
}

function severedText(r: CommandResult): string {
  const n = r.severed ?? 0;
  return n > 0 ? ` ${n} link${s(n)} ${were(n)} cut by the barrier.` : '';
}

function firstRefusal(r: CommandResult): string | null {
  const k = r.refused;
  if (!k) return null;
  for (const key of ['rim', 'structure', 'device', 'cap', 'object', 'missing'] as const)
    if ((k[key] ?? 0) > 0) return CELL_REFUSAL[key]!;
  return null;
}

/** "Fine membrane is", "Climate (…) is": what a refused-as-not-in-this-dish structure command names. */
export function structureMissingText(p: CommandPayload, note = ''): string {
  const code = /^(S(?:0[1-9]|1[0-2])) is /.exec(note)?.[1];
  if (code) return `${structureNameById(code)} is`;
  switch (p.kind) {
    case 'placeEdges':
    case 'placeDevice':
      return `${structureNameById(p.structure)} is`;
    case 'wetBrush':
    case 'setLightMode':
    case 'setDrying':
      return 'Climate (the light cycle, drying and the wetting brush) is';
    default:
      return 'Furnishings, devices and edge barriers are';
  }
}

/** The light-cycle and drying rules quoted when the player changes them (CT §12.2; SPEC §4.4, §4.8). */
export const ENVIRONMENT_COPY = {
  lightLabel: 'Light',
  fixed: 'Fixed',
  cycle: 'Day and night',
  dryingLabel: 'Drying',
  off: 'Off',
  on: 'On',
  lightRule:
    'Fixed: every cell keeps its own steady light. Day and night: a 240 s cycle of 90 s day, 30 s dusk, 90 s night (light × 0.05) and 30 s dawn, starting when you choose it. Each change is recorded and can be undone.',
  dryingRule:
    'On: uncovered gel and sediment lose 0.001 moisture per second down to 0.1; water always stays at 1, and a shade roof stops it. Drying never concentrates chemicals. Each change is recorded and can be undone.',
  lightOutcome: (mode: 'fixed' | 'cycle') =>
    mode === 'cycle'
      ? 'Day and night: 90 s day, 30 s dusk, 90 s night, 30 s dawn. The cycle starts now.'
      : 'Light fixed: every cell keeps its own steady light again.',
  dryingOutcome: (on: boolean) =>
    on
      ? 'Drying: uncovered gel and sediment lose 0.001 moisture per second down to 0.1; it never concentrates chemicals.'
      : 'Drying off: moisture stays where it is now.',
  lightFailed: 'The light setting did not change.',
  dryingFailed: 'Drying did not change.',
} as const;

/** What the UI knows about the structures a command named (from the geometry), for the outcome words. */
export interface StructureContext {
  /** Kinds (S01…S12) of the ids a removeStructures command sent, or of the device a move or setting names. */
  readonly kinds?: readonly string[];
  /** A moved device's new cell. */
  readonly cell?: number;
}

/**
 * The announcement after a structure or climate command, from the counts the simulation returned (the
 * command result is authoritative; the context only supplies content names). Null for any other kind.
 */
export function structureOutcome(
  p: CommandPayload,
  r: CommandResult,
  ctx: StructureContext = {},
): string | null {
  const note = r.note ?? '';
  const wholeRefusal =
    r.accepted === 0 &&
    r.rejected === 0 &&
    note !== '' &&
    note !== 'unchanged' &&
    !note.startsWith('nothing');
  if (wholeRefusal) {
    if (note.endsWith(NOT_IN_DISH))
      return `Not changed: ${structureMissingText(p, note)} not in this dish’s recorded content.`;
    if (note === 'an edge barrier cannot be moved') return 'Not moved: an edge barrier cannot be moved.';
    return `Not changed: ${namesForCodes(note)}.`;
  }
  const kind = ctx.kinds?.[0];
  switch (p.kind) {
    case 'placeEdges': {
      const label = nameIn(p.structure);
      const state = p.structure === 'S03' ? (p.open === false ? ' (closed)' : ' (open)') : '';
      if (r.accepted === 0) return `Nothing placed.${edgeSkips(r)}`;
      return `Placed ${withArticle(label)}${state} on ${r.accepted} edge${s(r.accepted)}.${edgeSkips(r)}${severedText(r)}`;
    }
    case 'placeDevice': {
      const name = structureNameById(p.structure);
      if (r.accepted === 0) return `Not placed: ${firstRefusal(r) ?? 'that cell cannot take it'}.`;
      if (p.structure === 'S09' || p.structure === 'S10')
        return `Placed ${withArticle(name)}. It starts Off; turn it On in its settings.`;
      if (p.structure === 'S08')
        return `Placed ${withArticle(name)}. It starts Off: choose what it removes in its settings.`;
      return `Placed ${withArticle(name)}.`;
    }
    case 'removeStructures': {
      const missing = r.refused?.missing ?? 0;
      const gone = missing > 0 ? ` ${missing} ${were(missing)} already gone.` : '';
      if (r.accepted === 0) return `Nothing removed.${gone}`;
      let text = `Removed ${r.accepted} structure${s(r.accepted)}.${gone}`;
      if ((ctx.kinds ?? []).includes('S07')) text += ' A basket’s food object stays in its cell.';
      const ex = r.exported;
      if (ex) {
        const parts = Object.entries(ex)
          .filter(([, v]) => typeof v === 'number' && v > 0)
          .map(
            ([t, v]) =>
              `${(v).toFixed(2)} unit${(v).toFixed(2) === '1.00' ? '' : 's'} of ${targetWord(t)}`,
          );
        if (parts.length > 0)
          text += ` The resin held ${listAnd(parts)}; ${parts.length === 1 ? 'it' : 'they'} left the dish with the resin.`;
      }
      return text;
    }
    case 'moveDevice': {
      const name = kind ? withArticle(structureNameById(kind)) : 'the device';
      if (note === 'unchanged') return `Not moved: ${name.replace(/^an? /, 'the ')} is already in that cell.`;
      if (r.accepted === 0) return `Not moved: ${firstRefusal(r) ?? 'that cell cannot take it'}.`;
      const where =
        ctx.cell !== undefined ? ` to cell ${ctx.cell % GRID_W}, ${Math.floor(ctx.cell / GRID_W)}` : '';
      const carried = kind === 'S07' ? ' Its food object moved with it.' : '';
      return `Moved ${name.replace(/^an? /, 'the ')}${where}.${carried}`;
    }
    case 'setDevice': {
      const name = kind ? structureNameById(kind) : 'Device';
      if (note === 'unchanged') return `${name}: already set that way; nothing changed.`;
      if (r.accepted === 0) return `${name}: ${firstRefusal(r) ?? 'not changed'}.`;
      if (p.on !== undefined) return p.on ? `${name} On.` : `${name} Off.`;
      if (p.open !== undefined)
        return p.open
          ? `${name} open: everything crosses that edge as if it were empty.`
          : `${name} closed: nothing crosses that edge now.${severedText(r)}`;
      const sel = p.resinSelect ?? [];
      return sel.length === 0
        ? `${name} Off: it removes nothing now; what it holds stays bound.`
        : `${name} now removes ${listAnd(sel.map(targetWord))}.`;
    }
    case 'wetBrush':
      if (r.accepted === 0) return 'Nothing wetted: water cells are always wet.';
      return `Moisture set to 0.9 on ${r.accepted} cell${s(r.accepted)}.${r.rejected > 0 ? ' Water cells are always wet.' : ''}`;
    case 'setLightMode':
      if (note === 'unchanged') return `Light is already ${p.mode === 'cycle' ? 'day and night' : 'fixed'}.`;
      return ENVIRONMENT_COPY.lightOutcome(p.mode);
    case 'setDrying':
      if (note === 'unchanged') return `Drying is already ${p.drying ? 'on' : 'off'}.`;
      return ENVIRONMENT_COPY.dryingOutcome(p.drying);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------- the gate

/** The CT §5.3 rows of the gate table, in its order. */
export const GATE_FIELD_ROWS: readonly {
  readonly cls: 'dissolved' | 'activity' | 'viral';
  readonly label: string;
  readonly examples: string;
}[] = [
  {
    cls: 'dissolved',
    label: 'Dissolved',
    examples: 'sugar, broth, gases, nutrient, salt, acid, base, buffer, silicate, metabolite, inhibitors',
  },
  { cls: 'activity', label: 'Activity', examples: 'enzymes, signal, quencher, breaker, rivalry chemical' },
  { cls: 'viral', label: 'Viral', examples: 'viruses' },
];
export const GATE_ORGANISM_ROWS: readonly {
  readonly cls: Exclude<TransportClass, 'dissolved' | 'activity' | 'viral'>;
  readonly label: string;
  readonly examples: string;
}[] = [
  { cls: 'small', label: 'Small', examples: 'free bacteria and other small swimmers' },
  { cls: 'medium', label: 'Medium', examples: 'yeasts, algae and most consumers' },
  { cls: 'large', label: 'Large', examples: 'the largest consumers' },
  { cls: 'fixed', label: 'Fixed', examples: 'attached colonies, fungi, deposits, film and food objects' },
];

export interface GateRow {
  readonly label: string;
  readonly examples: string;
  /** "25 %", "Passes", "Blocked". */
  readonly value: string;
}

/**
 * The permission table of an edge with barriers.ts code `code` (CT §5.3): the three field classes with
 * their diffusion factor (edgeFactor) and the four organism classes with Passes / Blocked (edgePermits).
 * The single source is barriers.ts; nothing here restates a number.
 */
export function gateRows(code: number): {
  readonly fields: readonly GateRow[];
  readonly organisms: readonly GateRow[];
} {
  return {
    fields: GATE_FIELD_ROWS.map((r) => ({
      label: r.label,
      examples: r.examples,
      value: `${Math.round(edgeFactor(code, r.cls) * 100)} %`,
    })),
    // Fixed things never move, so where the edge would let them through they simply stay put (D-0120).
    organisms: GATE_ORGANISM_ROWS.map((r) => ({
      label: r.label,
      examples: r.examples,
      value: edgePermits(code, r.cls) ? (r.cls === 'fixed' ? 'Stays put' : 'Passes') : 'Blocked',
    })),
  };
}

/** Which side of the gate's cell its neighbour lies on, in words. */
const SIDE_WORDS: Readonly<Record<CellEdgeLine['side'], string>> = {
  N: 'North',
  E: 'East',
  S: 'South',
  W: 'West',
};
const TOWARD: Readonly<Record<CellEdgeLine['side'], string>> = {
  N: 'the cell above',
  E: 'the cell to the right',
  S: 'the cell below',
  W: 'the cell to the left',
};
const AWAY: Readonly<Record<CellEdgeLine['side'], CellEdgeLine['side']>> = { N: 'S', E: 'W', S: 'N', W: 'E' };

/** The S04 line: "Only the directed transfer crosses: …toward the cell to the right…". */
export function channelLine(edge: Pick<CellEdgeLine, 'side' | 'flow'>): string {
  const toward = edge.flow === 'in' ? `this cell (from ${TOWARD[edge.side]})` : TOWARD[edge.side];
  return `Only the directed transfer crosses: 2 % of dissolved and viral pools per second toward ${toward}, and one small free organism per second.`;
}

/** The S03 state and the code's words for the table caption. */
export function gateStateText(code: number): string {
  if (code === EDGE_SHUTTER_OPEN) return 'Open: no barrier at all.';
  if (code === EDGE_SHUTTER_CLOSED) return 'Closed: nothing crosses.';
  if (code === EDGE_CHANNEL) return 'Ordinary spreading and movement do not cross a channel.';
  if (code === EDGE_S01 || code === EDGE_S02 || code === EDGE_NONE) return '';
  return '';
}

/**
 * The measured totals of a gate (CellInspect edges[].tally, world.gateTally: observation only), in honest
 * words: "Measured since this barrier was placed: sugar 0.42 moved across; 0 organisms crossed."
 * Nothing measured yet (null, or a record with no amount and no crossing): "Nothing has crossed yet."
 */
export function gateTotalsText(tally: CellEdgeLine['tally'], fieldName: (id: string) => string): string {
  if (tally === null) return 'Nothing has crossed yet.';
  const parts = Object.entries(tally.fields)
    .filter(([, v]) => typeof v === 'number' && v > 0)
    .map(([id, v]) => `${fieldName(id)} ${v < 0.005 ? 'less than 0.01' : v.toFixed(2)}`);
  if (parts.length === 0 && tally.organisms === 0) return 'Nothing has crossed yet.';
  const fields = parts.length > 0 ? `${listAnd(parts)} moved across` : 'nothing dissolved moved across';
  return `Measured since this barrier was placed: ${fields}; ${tally.organisms} organism${s(tally.organisms)} crossed.`;
}

// ---------------------------------------------------------------------------------------------- inspector

/** "East edge: Small gate", "South edge: Shutter gate (closed)", "West edge: One-way channel, carries into this cell". */
export function edgeLineText(e: Pick<CellEdgeLine, 'kind' | 'side' | 'open' | 'flow'>): string {
  const name = structureNameById(e.kind);
  const state = e.kind === 'S03' ? (e.open ? ' (open)' : ' (closed)') : '';
  const flow =
    e.kind === 'S04' ? (e.flow === 'in' ? ', carries into this cell' : ', carries out of this cell') : '';
  return `${SIDE_WORDS[e.side]} edge: ${name}${state}${flow}`;
}

/** The edge an inspector line names, as [lower cell, 'R' | 'D'] (the GeometryMsg / command form). */
export function edgeRefOf(
  cell: number,
  e: Pick<CellEdgeLine, 'side' | 'neighbour'>,
): readonly [number, 'R' | 'D'] {
  switch (e.side) {
    case 'E':
      return [cell, 'R'];
    case 'S':
      return [cell, 'D'];
    case 'W':
      return [e.neighbour, 'R'];
    case 'N':
      return [e.neighbour, 'D'];
  }
}

/** The opposite side (an edge seen from its other cell). */
export function otherSide(side: CellEdgeLine['side']): CellEdgeLine['side'] {
  return AWAY[side];
}

/** "Heater, Off", "Adsorption resin: removes bacterial inhibitor; 24 % full", "Porous shelter". */
export function deviceLineText(d: CellDeviceLine): string {
  const name = structureNameById(d.kind);
  if (d.on !== undefined) return `${name}, ${d.on ? 'On' : 'Off'}`;
  if (d.kind === 'S08')
    return `${name}: ${resinSelectionText(d.resinSelect ?? [])}; ${resinFillText(d.saturation ?? 0)}`;
  return name;
}

export function resinSelectionText(sel: readonly string[]): string {
  return sel.length === 0 ? 'Off (removes nothing)' : `removes ${listAnd(sel.map(targetWord))}`;
}

/** "24 % full", "full: it removes nothing more", "empty". */
export function resinFillText(saturation: number): string {
  if (saturation >= 1) return 'full: it removes nothing more';
  if (saturation <= 0) return 'empty';
  return `${Math.round(saturation * 100)} % full`;
}

/** "Warmth 0.62 here (ambient 0.50)" / "Warmth 0.50 (the dish’s ambient)". */
export function warmthText(c: CellClimate): string {
  return c.warmthLocal
    ? `${c.warmth.toFixed(2)} here (ambient ${c.ambientWarmth.toFixed(2)})`
    : `${c.warmth.toFixed(2)} (the dish’s ambient)`;
}

export function moistureText(c: CellClimate): string {
  return c.moisture.toFixed(2);
}

const PHASE_WORDS: Readonly<Record<'day' | 'dusk' | 'night' | 'dawn', string>> = {
  day: 'Day: full light',
  dusk: 'Dusk: light fading',
  night: 'Night: less light',
  dawn: 'Dawn: light returning',
};

/**
 * Every light factor of a cell (SPEC §4.4 "the inspector shows every factor"). Lab: the product,
 * "0.20 = baseline 0.80 × day and night 0.05 (night, 34 s in) × shade 1.00 × roof 0.25 × canopy 1.00";
 * Explore: the cycle's phase and any roof or canopy in plain words. Only payload values; the UI formats.
 */
export function lightFactorText(
  view: 'explore' | 'lab',
  light: number | undefined,
  base: number | undefined,
  shade: number | undefined,
  f: CellLightFactors,
): string {
  if (view === 'explore') {
    const parts: string[] = [];
    if (f.cycle) parts.push(PHASE_WORDS[f.cycle.phase]);
    if (f.roof !== undefined && f.roof < 1) parts.push('under a shade roof: less light');
    if (f.canopy !== undefined && f.canopy < 1) parts.push('shaded by algae above');
    if (parts.length === 0) return typeof light === 'number' ? light.toFixed(2) : 'not measured';
    const text = parts.join('; ');
    return `${text[0]!.toUpperCase()}${text.slice(1)}`;
  }
  const terms: string[] = [];
  if (base !== undefined) terms.push(`baseline ${base.toFixed(2)}`);
  if (f.cycle)
    terms.push(
      `day and night ${f.cycle.factor.toFixed(2)} (${f.cycle.phase}, ${Math.floor(f.cycle.secondsIntoPhase)} s in)`,
    );
  if (shade !== undefined) terms.push(`shade ${shade.toFixed(2)}`);
  if (f.roof !== undefined) terms.push(`roof ${f.roof.toFixed(2)}`);
  if (f.canopy !== undefined) terms.push(`canopy ${f.canopy.toFixed(2)}`);
  const eff = typeof light === 'number' ? light.toFixed(2) : 'not measured';
  return terms.length > 0 ? `${eff} = ${terms.join(' × ')}` : eff;
}

/** The selected cell's edges and device, for its one-line accessible description. */
export function cellStructureDescription(
  edges: readonly CellEdgeLine[] | undefined,
  device: CellDeviceLine | undefined,
): string {
  const parts: string[] = [];
  for (const e of edges ?? []) parts.push(edgeLineText(e));
  if (device) parts.push(deviceLineText(device));
  return parts.length > 0 ? `${parts.join('. ')}.` : '';
}

// ---------------------------------------------------------------------------------------------- build tray

/** The Build group's UI chrome (what each kind of structure does to where it goes); names and rules are content. */
export const BUILD_COPY = {
  group: 'Build',
  groupHint:
    'Edge barriers go on the edges between cells; furnishings and devices go on one cell. Each placement is one change you can undo.',
  remove: 'Remove',
  removePurpose: 'Take edge barriers, furnishings and devices out of the dish.',
  removeHabitats:
    'Tap a furnishing or device (near the middle of its cell) or an edge barrier, or drag across several.',
  removeDose: 'Everything you touched, in one change.',
  removeChanges:
    'Removes them. A removed adsorption resin takes what it holds out of the dish as a logged export.',
  removeUnchanged:
    'The substrate, organisms and amounts in the cells stay. A basket’s food object stays in its cell. Gate totals already measured are kept.',
  removeWatch: 'What starts crossing where a barrier was.',
  edgeHabitats:
    'The edge between two cells inside the rim, not next to a stone or wall. Tap an edge or drag along several; refused edges are crossed out before you let go.',
  channelHabitats:
    'The edge between two open water cells inside the rim. Tap an edge or drag along several; refused edges are crossed out before you let go.',
  edgeDose: 'One barrier on each edge you tap or drag along (at most 512 in a dish).',
  edgeUnchanged:
    'No material is added or moved: the cells on either side keep their substrate and everything in them.',
  deviceHabitats:
    'One open water, gel or sediment cell inside the rim with no stone, wall, bead or other furnishing or device. Organisms and food objects in the cell do not stop it.',
  deviceDose: 'One per tap (at most 256 furnishings and devices in a dish).',
  deviceUnchanged: 'No material is added: the cell keeps its substrate and everything in it.',
  machineUnchanged: 'No material is added: the cell keeps its substrate and everything in it. It starts Off.',
  shutterLabel: 'Starts',
  shutterOpen: 'Open',
  shutterClosed: 'Closed',
  flowLabel: 'Carries',
  flowForward: 'Toward right / down',
  flowBack: 'Toward left / up',
  edgeHint: 'Tap an edge or drag along edges. One stroke is one change; two fingers cancel.',
  deviceHint: 'Tap a cell to place it. The tool stays selected.',
  removeHint: 'Tap or drag over what to remove. One stroke is one change.',
  noBuild: 'This dish’s recorded content has no edge barriers, furnishings or devices.',
} as const;

/** The live count line while an edge stroke or a removal is previewed. */
export function edgePreviewText(ok: number, reasons: Readonly<Partial<Record<string, number>>>): string {
  const parts: string[] = [];
  for (const key of ['rim', 'structure', 'barrier', 'channel', 'cap'] as const) {
    const n = reasons[key];
    if (n !== undefined && n > 0)
      parts.push(EDGE_REFUSALS[key]!(n).replace(/ \(a one-way channel joins two open water cells\)$/, ''));
  }
  return `${ok} edge${s(ok)}${parts.length > 0 ? ` · crossed out: ${parts.join('; ')}` : ''}`;
}

export function removePreviewText(edges: number, devices: number): string {
  const n = edges + devices;
  return n === 0
    ? 'Nothing to remove here'
    : `${n} to remove: ${edges} edge barrier${s(edges)}, ${devices} furnishing${devices === 1 ? '' : 's'} or device${devices === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------------------------- device sheet

export const DEVICE_COPY = {
  settings: 'Settings',
  showGate: 'Show gate',
  on: 'On',
  off: 'Off',
  power: 'Power',
  resinTargets: 'Removes',
  resinOff: 'Off (none)',
  resinBound: 'Holds',
  resinNone: 'Nothing bound yet.',
  move: 'Move',
  moveCancel: 'Cancel move',
  movePaused: 'Pause to move a device.',
  movePrompt: (name: string) => `Tap the new cell for the ${inSentence(name)}. Escape or Cancel move stops.`,
  remove: 'Remove',
  close: 'Close',
  gone: 'It is no longer in this cell.',
  undoNote: 'Every change is recorded and can be undone.',
} as const;

export const GATE_COPY = {
  title: (name: string) => `${name}: what crosses`,
  caption: (name: string) => `What crosses this ${inSentence(name)} (from the dish’s barrier table)`,
  classHead: 'Kind',
  examplesHead: 'For example',
  crossHead: 'Crosses',
  measured: 'Measured',
  open: 'Open it',
  close: 'Close it',
  tracerPaused: 'The preview runs while paused; it moves nothing.',
  tracerRunning: 'Pause the dish to see the preview of what crosses.',
} as const;
