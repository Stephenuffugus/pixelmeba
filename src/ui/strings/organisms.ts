/**
 * Words for the Phase 5 organism lines of the inspector (wave 13 org-ui; SPEC §12.1-§12.2, §7.3, §7.8, §7.10,
 * §7.17, §9 E11; UX §5.1-§5.2; D-0124). Every sentence is built from one optional EntityInspect / CellInspect
 * field the worker filled from the columns or the simulation's own readers, and each line that a reason code
 * names (HELD_IN_TRAP, CAPTURED_HANDLING, PRED_HANDLING_IN_PROGRESS, MODE_*, NEIGHBORS_DETECTED, RIVAL_EXPOSURE)
 * goes through reasonText. Explore wording is plain; Lab wording adds the measured value. No "protected",
 * "immune", "armored" or "trapped forever"; all numbers are fictional game units.
 */
import { MODE_PHOTO_LIGHT, MODE_SUGAR_LIGHT, TRAP_ARM_MIN_BODY_MULTIPLE, TRAP_ARM_MIN_ENERGY } from '@sim/constants';
import { R } from '@sim/reasons';
import type { CellInspect, EntityInspect } from '@worker/protocol';
import { fieldWord } from './fields';
import { reasonText } from './reasons';

export type View = 'explore' | 'lab';

const n1 = (v: number) => v.toFixed(1);
const n2 = (v: number) => v.toFixed(2);
const whole = (v: number) => String(Math.max(0, Math.ceil(v - 1e-6)));
const nameOf = (names: readonly string[], idx: number, fallback: string) => names[idx] ?? fallback;
/** Plural of a kind's name in a sentence ("Sprinters"). */
const plural = (name: string) => (/s$/.test(name) ? name : `${name}s`);
const listWords = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`;

/** A trap owner's trap (F03): "Trap set." / "Holding a Siltworm: 3.2 of 8 s." / "Trap resetting: 12 s left." */
export function trapLines(t: NonNullable<EntityInspect['trap']>, view: View, names: readonly string[]): string[] {
  const lines: string[] = [];
  switch (t.state) {
    case 'none':
      lines.push(
        view === 'lab'
          ? `No trap built yet: it builds one with at least ${TRAP_ARM_MIN_ENERGY} energy and a body of ${TRAP_ARM_MIN_BODY_MULTIPLE} times its starting size.`
          : 'No trap built yet.',
      );
      break;
    case 'armed':
      lines.push('Trap set.');
      break;
    case 'holding': {
      const what = t.target ? nameOf(names, t.target.speciesIdx, 'organism') : 'organism';
      lines.push(view === 'lab' ? `Holding a ${what}: ${n1(t.heldSeconds)} of ${whole(t.holdSeconds)} s.` : `Holding a ${what}.`);
      break;
    }
    case 'cooldown':
      lines.push(view === 'lab' ? `Trap resetting: ${whole(t.cooldownLeft)} s left.` : 'Trap resetting.');
      break;
  }
  if (view === 'lab' && t.reserveC > 0) lines.push(`Trap store ${n2(t.reserveC)} C, ${n2(t.reserveN)} N.`);
  return lines;
}

/** A held organism: HELD_IN_TRAP, derived from heldBy (never a recorded reason). */
export function heldLine(h: NonNullable<EntityInspect['heldBy']>, view: View, names: readonly string[]): string {
  return reasonText(R.HELD_IN_TRAP, view, {
    speciesName: nameOf(names, h.ownerSpeciesIdx, 'a trap'),
    birthId: h.ownerBirthId,
    value: h.heldSeconds,
    need: h.holdSeconds,
    drained: h.drained,
  });
}

/** A handler: PRED_HANDLING_IN_PROGRESS with its own progress and need. */
export function handlingLine(h: NonNullable<EntityInspect['handling']>, view: View): string {
  return reasonText(R.PRED_HANDLING_IN_PROGRESS, view, { value: h.progress, need: h.need });
}

/** Its prey: CAPTURED_HANDLING, derived from the handler's columns, one line per handler. */
export function beingHandledLines(list: NonNullable<EntityInspect['beingHandled']>, view: View, names: readonly string[]): string[] {
  if (view === 'explore') return [reasonText(R.CAPTURED_HANDLING, 'explore')];
  return list.map((b) =>
    reasonText(R.CAPTURED_HANDLING, 'lab', { speciesName: nameOf(names, b.predatorSpeciesIdx, 'a predator'), birthId: b.predatorBirthId, value: b.progress, need: b.need }),
  );
}

/** A mixotroph's mode (A04): MODE_PHOTO / MODE_SUGAR with the light at its cell; mode 0 before its first step. */
export function modeLine(m: NonNullable<EntityInspect['mode']>, view: View): string {
  if (m.mode === 1) {
    const base = reasonText(R.MODE_PHOTO, view, { value: m.light });
    return view === 'lab' ? `${base} It turns to sugar at light ${n2(MODE_SUGAR_LIGHT)} or less.` : base;
  }
  if (m.mode === 2) {
    const base = reasonText(R.MODE_SUGAR, view, { value: m.light });
    return view === 'lab' ? `${base} It makes food from light again at light ${n2(MODE_PHOTO_LIGHT)} or more.` : base;
  }
  return view === 'lab' ? `Chooses its feeding mode at its first step (light ${n2(m.light)} here).` : 'Chooses its feeding mode at its first step.';
}

/** The mineral jacket: "Mineral jacket 50 % (0.20 of 0.40); moves at 0.90 speed." */
export function jacketLine(j: NonNullable<EntityInspect['jacket']>, view: View): string {
  const pct = `${Math.round(j.coverage * 100)} %`;
  if (j.target <= 0) return view === 'lab' ? `Mineral jacket ${n2(j.mineral)} mineral; it no longer builds one.` : 'It wears a mineral jacket it no longer builds.';
  if (view === 'explore') return j.mineral > 0 ? `Mineral jacket ${pct} built.` : 'No mineral jacket built yet.';
  return `Mineral jacket ${pct} (${n2(j.mineral)} of ${n2(j.target)}); moves at ${n2(j.speedFactor)} speed.`;
}

/** NEIGHBORS_DETECTED (UX §5.2): "It senses neighbors." / "Signal 0.34 (threshold 0.30)."; then its glow. */
export function signalLines(sig: NonNullable<EntityInspect['signal']>, view: View): string[] {
  const enough = sig.sensed >= sig.onThreshold;
  const sense = view === 'lab' ? reasonText(R.NEIGHBORS_DETECTED, 'lab', { value: sig.sensed, threshold: sig.onThreshold }) : enough ? reasonText(R.NEIGHBORS_DETECTED, 'explore') : 'Little signal from neighbors here.';
  const glow = sig.glowing
    ? view === 'lab'
      ? `Glowing: it stops after ${whole(sig.dwellSeconds)} s at ${n2(sig.offThreshold)} or less.`
      : reasonText(R.GLOW_ON, 'explore')
    : view === 'lab'
      ? `Not glowing: it starts after ${whole(sig.dwellSeconds)} s at ${n2(sig.onThreshold)} or more.`
      : reasonText(R.GLOW_OFF, 'explore');
  return [sense, glow];
}

const ENZYME_BITS = 1 | 2 | 4;
const RIVAL_BIT = 8;
const SIGNAL_BIT = 16;

/**
 * What a Phase 5 emitter released this tick, worded by what it emits (D-0120 carry-over): the enzyme words stay
 * for enzymes; the signal and the rivalry chemical have their own. With nothing released, the recorded refusal
 * in the words of the emitter that recorded it. Empty while not Active (secretionCode keeps an old value then).
 */
export function secretionLines(sec: NonNullable<EntityInspect['secretion']>, lifeState: number): string[] {
  if (lifeState !== 0) return [];
  const out: string[] = [];
  if (sec.bits & ENZYME_BITS) out.push(reasonText(R.SECRETING, 'explore'));
  if (sec.bits & SIGNAL_BIT) out.push(`Making ${fieldWord('sGlow')}.`);
  if (sec.bits & RIVAL_BIT) out.push(`Releasing ${fieldWord('rival')}.`);
  if (out.length > 0) return out;
  const words = sec.refusalOf === 'signal' ? fieldWord('sGlow') : sec.refusalOf === 'rival' ? fieldWord('rival') : null;
  if (words === null) return sec.code === R.NONE ? [] : [reasonText(sec.code, 'explore')];
  const verb = sec.refusalOf === 'signal' ? 'make' : 'release';
  switch (sec.code) {
    case R.SECRETION_ENERGY_LOW:
      return [`Too tired to ${verb} ${words}.`];
    case R.SECRETION_SATURATED:
      return [`Enough ${words} here already.`];
    case R.NONE:
      // RIVALRY records NONE when no rival target is within reach (rivalry.ts; D-0119).
      return sec.refusalOf === 'rival' ? ['No rival nearby.'] : [];
    default:
      return [];
  }
}

/** RIVAL_EXPOSURE for a target in rivalry chemical (EntityInspect.rival). */
export function rivalLine(r: NonNullable<EntityInspect['rival']>, view: View): string {
  if (view === 'explore') return reasonText(R.RIVAL_EXPOSURE, 'explore');
  return `${reasonText(R.RIVAL_EXPOSURE, 'lab', { value: r.amount, exposure: r.exposure })} In all: growth × ${n2(r.growthFactor)}, −${n2(r.damagePerSecond)} health/s.`;
}

/** The cell inspector's rivalry line (CellInspect.exposure.rival): amount, exposure and the kinds it acts on, by name. */
export function cellRivalText(r: NonNullable<NonNullable<CellInspect['exposure']>['rival']>, speciesIds: readonly string[], speciesNames: readonly string[]): string {
  const who = r.targets.map((id) => {
    const i = speciesIds.indexOf(id);
    return plural(i >= 0 ? (speciesNames[i] ?? id) : id);
  });
  const head = `${n2(r.amount)} here`;
  if (who.length === 0) return `${head}; no organism in this dish is affected by it.`;
  return `${head}: exposure ${n2(r.exposure)} for ${listWords(who)}. Other organisms are not affected.`;
}
