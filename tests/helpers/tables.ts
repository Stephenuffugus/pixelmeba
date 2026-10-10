/**
 * Reads canonical numeric tables straight from docs/CONTENT_TABLES.md so fixtures use the design
 * document itself as the oracle (content JSON must agree with it).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOC = join(import.meta.dirname, '..', '..', 'docs', 'CONTENT_TABLES.md');

function section(md: string, startHeading: string, endHeading: string): string {
  const a = md.indexOf(startHeading);
  const b = md.indexOf(endHeading, a + 1);
  if (a < 0 || b < 0) throw new Error(`section ${startHeading} not found`);
  return md.slice(a, b);
}

function rows(block: string): string[][] {
  return block
    .split('\n')
    .filter((l) => /^\|\s*[BYFAPXV][0-9]{2}\s*\|/.test(l))
    .map((l) =>
      l
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim()),
    );
}

function leadingNumber(s: string): number | null {
  const m = /-?[0-9]*\.?[0-9]+/.exec(s);
  return m ? Number(m[0]) : null;
}

export interface ProfileRow {
  id: string;
  b0: number | null;
  q: number | null;
  m: number | null;
  minAge: number | null;
  maxAge: number | null;
  energyPerCarbon: number | null;
}

export interface MovementRow {
  id: string;
  speed: number | null;
  sense: number | null;
  cooldown: number | null;
}

export function profileTable(): ProfileRow[] {
  const md = readFileSync(DOC, 'utf8');
  return rows(section(md, '### 1.2', '### 1.3')).map((r) => ({
    id: r[0]!,
    b0: leadingNumber(r[1]!),
    q: leadingNumber(r[2]!),
    m: leadingNumber(r[3]!),
    minAge: leadingNumber(r[4]!),
    maxAge: leadingNumber(r[5]!),
    energyPerCarbon: leadingNumber(r[7]!),
  }));
}

export function movementTable(): MovementRow[] {
  const md = readFileSync(DOC, 'utf8');
  return rows(section(md, '### 1.3', 'Sprite frames')).map((r) => ({
    id: r[0]!,
    speed: leadingNumber(r[1]!),
    sense: leadingNumber(r[2]!),
    cooldown: r[3] === '—' ? 0 : leadingNumber(r[3]!),
  }));
}

// ---- G3 relationship oracles (W5-18): CT §3.1–§3.5, §5.1–§5.2, §7.1 and SPEC §5.3, parsed from the docs ----

const SPEC = join(import.meta.dirname, '..', '..', 'docs', 'PIXELMEBA_IMPLEMENTATION_SPEC.md');
const ID = /^[A-Z][0-9]{2}$/;

/** Every markdown table row of a block (header and separator rows dropped), split into trimmed cells. */
function tableRows(block: string): string[][] {
  return block
    .split('\n')
    .filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l))
    .slice(1)
    .map((l) =>
      l
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim()),
    );
}

/** The prose of a section after its heading line, joined into one line. */
function prose(block: string): string {
  return block
    .split('\n')
    .slice(1)
    .filter((l) => !l.startsWith('|'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drop parenthetical notes such as "(never attached B02)". */
function stripNotes(s: string): string {
  return s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Expand an ID list ("B01, B03–B12, Y01" or "F01/F02/F04"): ranges with an en dash or hyphen expand
 * inclusively; anything that is not an ID is ignored.
 */
export function expandIds(s: string): string[] {
  const out: string[] = [];
  const re = /([A-Z])([0-9]{2})(?:\s*[–-]\s*([A-Z])?([0-9]{2}))?/g;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    const prefix = m[1]!;
    const a = Number(m[2]);
    if (m[4] !== undefined && (m[3] === undefined || m[3] === prefix)) {
      const b = Number(m[4]);
      for (let k = a; k <= b; k++) out.push(`${prefix}${String(k).padStart(2, '0')}`);
    } else out.push(`${prefix}${m[2]!}`);
  }
  return out;
}

export interface DietRow {
  /** The species IDs the entry names ("A01/A02/A03/A05" is four rows), or 'E08' for "E08 carriers". */
  readonly id: string;
  /** Field foods in the listed order (photosynthesis is not a food; see `photosynthesis`). */
  readonly foods: readonly string[];
  /** "(+film)": eats film (as detritus, CT §3.5, D-0038). */
  readonly film: boolean;
  readonly photosynthesis: boolean;
  /** "when no meal" (P09, E08 carriers). */
  readonly whenNoMeal: boolean;
  readonly raw: string;
}

const FIELD_FOODS = ['sugar', 'starch', 'oil', 'protein', 'broth', 'detritus', 'metabolite'] as const;

/** CT §3.1 diets: the prose list "ID foods · ID foods · …". */
export function dietTable(): DietRow[] {
  const md = readFileSync(DOC, 'utf8');
  const text = prose(section(md, '### 3.1', '### 3.2'));
  const out: DietRow[] = [];
  for (const entry of text.split('·').map((e) => e.trim()).filter(Boolean)) {
    const m = /^((?:[A-Z][0-9]{2})(?:\/[A-Z][0-9]{2})*)(?:\s+carriers)?\s+(.*)$/.exec(entry);
    if (!m) throw new Error(`CT §3.1: cannot read diet entry "${entry}"`);
    const ids = m[1]!.split('/');
    const rest = m[2]!;
    const film = /\(\+film\)/.test(rest);
    const photosynthesis = /photosynthesis/.test(rest);
    const plain = stripNotes(rest);
    const foods = plain
      .split(/[,/]/)
      .map((t) => t.trim().split(' ')[0]!)
      .filter((t): t is (typeof FIELD_FOODS)[number] => (FIELD_FOODS as readonly string[]).includes(t));
    for (const id of ids) out.push({ id, foods, film, photosynthesis, whenNoMeal: /when no meal/.test(rest), raw: entry });
  }
  return out;
}

export type PreyRequirement = 'any' | 'free' | 'inSediment';

export interface PreyRow {
  readonly id: string;
  readonly name: string;
  readonly prey: Readonly<Record<string, PreyRequirement>>;
  /** "within 1 cell": radius capture (P06), applies to the whole row. */
  readonly withinCells: number | null;
  readonly raw: string;
}

/** CT §3.2 prey lists ("free" excludes attached; "while in sediment"; parenthetical notes ignored). */
export function preyTable(): PreyRow[] {
  const md = readFileSync(DOC, 'utf8');
  return tableRows(section(md, '### 3.2', '### 3.3'))
    .filter((r) => ID.test(r[0]!.split(' ')[0]!))
    .map((r) => {
      const [id, ...name] = r[0]!.split(' ');
      let text = stripNotes(r[1]!);
      let withinCells: number | null = null;
      const within = /\s*within ([0-9]+) cells?$/.exec(text);
      if (within) {
        withinCells = Number(within[1]);
        text = text.slice(0, within.index);
      }
      const prey: Record<string, PreyRequirement> = {};
      for (const token of text.split(/[,;]/).map((t) => t.trim()).filter(Boolean)) {
        const req: PreyRequirement = /^free\b/.test(token) ? 'free' : /while in sediment$/.test(token) ? 'inSediment' : 'any';
        for (const p of expandIds(token)) prey[p] = req;
      }
      return { id: id!, name: name.join(' '), prey, withinCells, raw: r[1]! };
    });
}

export interface HostRow {
  readonly id: string;
  readonly name: string;
  readonly kind: 'attaches' | 'infects' | 'traps';
  readonly targets: readonly string[];
  /** "drain 0.02 C/s", when given. */
  readonly drainPerSecond: number | null;
  /** "where film ≥ 0.10", when given. */
  readonly minFilm: number | null;
  readonly raw: string;
}

/** CT §3.3 hosts, parasites, viruses and traps. */
export function hostTable(): HostRow[] {
  const md = readFileSync(DOC, 'utf8');
  return tableRows(section(md, '### 3.3', '### 3.4'))
    .filter((r) => ID.test(r[0]!.split(' ')[0]!))
    .map((r) => {
      const [id, ...name] = r[0]!.split(' ');
      const rule = r[1]!;
      const kind = /^attaches/.test(rule) ? 'attaches' : /^infects/.test(rule) ? 'infects' : /^traps/.test(rule) ? 'traps' : null;
      if (kind === null) throw new Error(`CT §3.3: cannot read rule "${rule}"`);
      const first = rule.split(/;|,\s*where/)[0]!;
      const drain = /drain ([0-9.]+) C\/s/.exec(rule);
      const film = /film ≥ ([0-9.]+)/.exec(rule);
      return {
        id: id!,
        name: name.join(' '),
        kind,
        targets: expandIds(first),
        drainPerSecond: drain ? Number(drain[1]) : null,
        minFilm: film ? Number(film[1]) : null,
        raw: rule,
      };
    });
}

export interface InhibitorRow {
  /** The field's name as CT writes it ("Bacterial inhibitor", "RIVAL (B13 secretion / M08)"). */
  readonly field: string;
  readonly targets: readonly string[];
  readonly raw: string;
}

/** CT §3.4 inhibitor and RIVAL targets, keyed by field name. */
export function inhibitorTable(): InhibitorRow[] {
  const md = readFileSync(DOC, 'utf8');
  return tableRows(section(md, '### 3.4', '### 3.5'))
    .filter((r) => r.length >= 2 && r[0] !== '')
    .map((r) => ({ field: r[0]!, targets: expandIds(stripNotes(r[1]!)), raw: r[1]! }));
}

/** CT §3.5 film digesters ("B04, F01 (as detritus)."). */
export function filmDigesters(): string[] {
  const md = readFileSync(DOC, 'utf8');
  const text = prose(section(md, '### 3.5', '## 4.'));
  const first = text.split('.')[0]!;
  return expandIds(stripNotes(first));
}

export interface ModuleRow {
  readonly id: string;
  readonly name: string;
  /** Eligible ancestors, ranges expanded; "(not native …)" and other notes excluded. */
  readonly eligible: readonly string[];
  /** Species named in "(not native …)": they hold the ability natively. */
  readonly notNative: readonly string[];
  readonly phase: number;
  readonly raw: string;
}

/** CT §7.1 module registry rows. */
export function moduleTable(): ModuleRow[] {
  const md = readFileSync(DOC, 'utf8');
  return tableRows(section(md, '### 7.1', '### 7.2'))
    .filter((r) => /^E[0-9]{2}$/.test(r[0]!))
    .map((r) => {
      const notes = /\(not native ([^)]*)\)/.exec(r[2]!);
      return {
        id: r[0]!,
        name: r[1]!,
        // Only species IDs ("E12‑eligible bacteria" for E15 names a module, not an ancestor).
        eligible: expandIds(stripNotes(r[2]!)).filter((id) => !id.startsWith('E')),
        notNative: notes ? expandIds(notes[1]!) : [],
        phase: Number(r[3]),
        raw: r[2]!,
      };
    });
}

export interface MaterialRow {
  readonly id: string;
  readonly name: string;
  /** CT §5.1 "Adds" or §5.2 "Effect". */
  readonly adds: string;
  /** CT §5.1 dose column or §5.2 "Dose". */
  readonly dose: string;
  readonly phase: number;
  /** The CT table the row comes from. */
  readonly section: '5.1' | '5.2';
}

/** CT §5.1 foundation tray and §5.2 expansion materials (WATER/GEL/SEDIMENT is three rows). */
export function materialTable(): MaterialRow[] {
  const md = readFileSync(DOC, 'utf8');
  const out: MaterialRow[] = [];
  for (const r of tableRows(section(md, '### 5.1', '### 5.2'))) {
    if (r.length < 6) continue;
    for (const id of r[0]!.split('/')) out.push({ id, name: r[1]!, adds: r[2]!, dose: r[3]!, phase: Number(r[5]), section: '5.1' });
  }
  for (const r of tableRows(section(md, '### 5.2', '### 5.3'))) {
    if (r.length < 5) continue;
    out.push({ id: r[0]!, name: r[1]!, adds: r[3]!, dose: r[2]!, phase: Number(r[4]), section: '5.2' });
  }
  return out;
}

export interface EnzymeRules {
  /** Substrate → product (SPEC §5.3 "(starch→sugar, oil→metabolite, protein→broth)"). */
  readonly products: Readonly<Record<string, string>>;
  /** Native producer species → activity name ("E_STARCH", …). */
  readonly nativeProducers: Readonly<Record<string, string>>;
  /** Producer modules ("modules E01, E09"). */
  readonly producerModules: readonly string[];
  /** The conversion rate per unit effective activity per second (0.10). */
  readonly rate: number;
}

/** SPEC §5.3 enzymes: products, producers and the conversion rate. */
export function enzymeRules(): EnzymeRules {
  const md = readFileSync(SPEC, 'utf8');
  const text = prose(section(md, '### 5.3', '\n---'));
  const products: Record<string, string> = {};
  const pm = /\(([a-z]+→[a-z]+(?:, [a-z]+→[a-z]+)*)\)/.exec(text);
  if (!pm) throw new Error('SPEC §5.3: product list not found');
  for (const pair of pm[1]!.split(', ')) {
    const [a, b] = pair.split('→');
    products[a!] = b!;
  }
  const nativeProducers: Record<string, string> = {};
  const nm = /\*\*Producers\*\* \(native ([^;]*); modules ([^)]*)\)/.exec(text);
  if (!nm) throw new Error('SPEC §5.3: producer list not found');
  for (const part of nm[1]!.split(', ')) {
    const [ids, act] = part.split('→').map((s) => s.trim());
    for (const id of expandIds(ids!.replace(/\//g, ', '))) nativeProducers[id] = act!;
  }
  const rate = /0\.10 ×\s*effectiveActivity/.test(text) ? 0.1 : NaN;
  return { products, nativeProducers, producerModules: expandIds(nm[2]!), rate };
}

export interface IdentityRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  /** "(attached)" in the category column: a fixed species that is never "free" (CT §3.2). */
  readonly attached: boolean;
  readonly phase: number;
  readonly role: string;
}

/** CT §1.1 identity rows. */
export function identityTable(): IdentityRow[] {
  const md = readFileSync(DOC, 'utf8');
  return rows(section(md, '### 1.1', '### 1.2')).map((r) => ({
    id: r[0]!,
    name: r[1]!,
    category: r[2]!.replace(/\s*\(.*\)$/, ''),
    attached: /\(attached\)/.test(r[2]!),
    phase: Number(r[4]),
    role: r[5]!,
  }));
}
