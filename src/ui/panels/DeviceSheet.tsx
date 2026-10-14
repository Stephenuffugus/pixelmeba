/**
 * The device settings sheet (P5.1/P5.2; SPEC §10.4 "devices start Off; moving a device is a paused atomic
 * relocation"; UX §5.2; D-0117, D-0119). Opened from the cell inspector's device line ("Settings"). It
 * shows the kind's content name and rules, its state from the live CellInspect.device payload, and:
 * - a heater's or cooler's On / Off (setDevice { id, on });
 * - an adsorption resin's targets as checkboxes, only those whose field this dish has, with Off = none
 *   (setDevice { id, resinSelect } in RESIN_TARGETS order), what it holds per target and how full it is;
 * - Move, enabled only while the dish is paused: the next tap on the dish (with a placement preview) sends one
 *   moveDevice command; while running the button is disabled with the visible reason;
 * - Remove (removeStructures).
 * Every change is one recorded, undoable command, announced through the toast's live region.
 */
import { RESIN_TARGETS, TOGGLED_KINDS, type ResinTarget } from '@sim/devices';
import { IconClose } from '../icons';
import { dishInfo, inspector, meta, select, selection, sheet } from '../state';
import { cancelDeviceMove, movingDevice, sendLabCommand } from '../views/LabView';
import { structureNameById, structureRecordById } from './LabTrayNames';
import { DEVICE_COPY, RESIN_TARGET_WORDS, resinFillText, resinSelectionText } from '../strings/structures';

/** Open the settings of the inspected cell's device. */
export function openDeviceSheet(): void {
  sheet.value = 'device';
}

/** Back to the cell inspector (the sheet's Close). */
function back(): void {
  sheet.value = 'inspect';
}

/** The resin targets this dish can select: those whose field the dish allocates (DishInfo.fieldIds). */
export function resinTargetsOffered(fieldIds: readonly string[] | undefined): ResinTarget[] {
  return RESIN_TARGETS.filter((t) => fieldIds === undefined || fieldIds.includes(t));
}

/** A resin selection with `t` toggled, in RESIN_TARGETS order (the command refuses any other order). */
export function toggledSelection(current: readonly string[], t: ResinTarget, on: boolean): ResinTarget[] {
  return RESIN_TARGETS.filter((x) => (x === t ? on : current.includes(x)));
}

function MoveBar({ name }: { name: string }) {
  return (
    <section class="sheet device-move" aria-label={DEVICE_COPY.move} data-testid="device-move-bar">
      <p role="status">{DEVICE_COPY.movePrompt(name)}</p>
      <button class="btn" onClick={cancelDeviceMove} data-testid="device-move-cancel">
        {DEVICE_COPY.moveCancel}
      </button>
    </section>
  );
}

export function DeviceSheet() {
  const p = inspector.value;
  const moving = movingDevice.value;
  if (moving) return <MoveBar name={structureNameById(moving.kind)} />;
  const cell = p?.kind === 'cell' ? p.cell : undefined;
  const d = cell?.device;
  const sel = selection.value;
  const cellIndex = sel?.kind === 'cell' ? sel.cell : -1;
  const paused = (meta.value?.speed ?? 0) === 0;
  const name = d ? structureNameById(d.kind) : '';
  const rec = d ? structureRecordById(d.kind) : null;
  const ctx = d ? { kinds: [d.kind] } : {};
  return (
    <section class="sheet" aria-labelledby="device-sheet-title" data-testid="device-sheet">
      <div class="sheet-scroll">
        <header>
          <h2 id="device-sheet-title">{d ? name : DEVICE_COPY.settings}</h2>
          <button
            class="btn ghost"
            aria-label={DEVICE_COPY.close}
            onClick={back}
            data-testid="device-sheet-close"
          >
            <IconClose />
          </button>
        </header>
        {!d ? (
          <p data-testid="device-gone">{DEVICE_COPY.gone}</p>
        ) : (
          <>
            {rec ? <p class="lab-sub">{rec.guide.rules}</p> : null}
            {TOGGLED_KINDS.includes(d.kind) ? (
              <div class="lab-option" data-testid="device-power">
                <span class="lab-option-label" id="device-power-label">
                  {DEVICE_COPY.power}
                </span>
                <div class="segmented" role="group" aria-labelledby="device-power-label">
                  {([false, true] as const).map((v) => (
                    <button
                      key={String(v)}
                      class="btn"
                      aria-pressed={d.on === v}
                      onClick={() =>
                        d.on === v
                          ? undefined
                          : void sendLabCommand({ kind: 'setDevice', id: d.id, on: v }, ctx)
                      }
                      data-testid={`device-${v ? 'on' : 'off'}`}
                    >
                      {v ? DEVICE_COPY.on : DEVICE_COPY.off}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {d.kind === 'S08' ? (
              <ResinSettings
                id={d.id}
                sel={d.resinSelect ?? []}
                bound={d.bound ?? {}}
                saturation={d.saturation ?? 0}
                ctx={ctx}
              />
            ) : null}
            <div
              class="lab-actions"
              role="group"
              aria-label={`${name}: ${DEVICE_COPY.move} or ${DEVICE_COPY.remove}`}
            >
              <button
                class="btn"
                disabled={!paused}
                aria-describedby={paused ? undefined : 'device-move-reason'}
                onClick={() => {
                  if (!paused || cellIndex < 0) return;
                  movingDevice.value = { id: d.id, kind: d.kind, from: cellIndex };
                }}
                data-testid="device-move"
              >
                {DEVICE_COPY.move}
              </button>
              <button
                class="btn"
                onClick={() =>
                  void sendLabCommand({ kind: 'removeStructures', ids: [d.id] }, ctx).then((res) => {
                    if (res && res.accepted > 0 && dishInfo.value)
                      select(cellIndex >= 0 ? { kind: 'cell', cell: cellIndex } : null);
                  })
                }
                data-testid="device-remove"
              >
                {DEVICE_COPY.remove}
              </button>
            </div>
            {!paused ? (
              <p class="lab-sub" id="device-move-reason" data-testid="device-move-reason">
                {DEVICE_COPY.movePaused}
              </p>
            ) : null}
            <p class="lab-sub">{DEVICE_COPY.undoNote}</p>
          </>
        )}
      </div>
    </section>
  );
}

function ResinSettings({
  id,
  sel,
  bound,
  saturation,
  ctx,
}: {
  id: number;
  sel: readonly string[];
  bound: Readonly<Record<string, number>>;
  saturation: number;
  ctx: { kinds?: readonly string[] };
}) {
  const offered = resinTargetsOffered(dishInfo.value?.fieldIds);
  const held = RESIN_TARGETS.filter((t) => (bound[t] ?? 0) > 0);
  const total = RESIN_TARGETS.reduce((a, t) => a + (bound[t] ?? 0), 0);
  const send = (next: ResinTarget[]) =>
    void sendLabCommand({ kind: 'setDevice', id, resinSelect: next }, ctx);
  return (
    <>
      <fieldset class="device-targets" data-testid="resin-targets">
        <legend class="lab-option-label">{DEVICE_COPY.resinTargets}</legend>
        <p class="lab-sub" data-testid="resin-selection">
          {resinSelectionText(sel)}
        </p>
        <button
          class="btn"
          aria-pressed={sel.length === 0}
          onClick={() => (sel.length === 0 ? undefined : send([]))}
          data-testid="resin-off"
        >
          {DEVICE_COPY.resinOff}
        </button>
        {offered.map((t) => (
          <label class="check-row" key={t}>
            <input
              type="checkbox"
              checked={sel.includes(t)}
              onChange={(e) => send(toggledSelection(sel, t, e.currentTarget.checked))}
              data-testid={`resin-${t}`}
            />
            <span>{RESIN_TARGET_WORDS[t]}</span>
          </label>
        ))}
      </fieldset>
      <dl class="kv" data-testid="resin-bound">
        <dt>{DEVICE_COPY.resinBound}</dt>
        <dd>
          {held.length === 0
            ? DEVICE_COPY.resinNone
            : held.map((t) => `${RESIN_TARGET_WORDS[t]} ${(bound[t] ?? 0).toFixed(2)}`).join('; ')}
        </dd>
        <dt>Fill</dt>
        <dd data-testid="resin-fill">
          {resinFillText(saturation)} ({total.toFixed(2)} of 5 units)
        </dd>
      </dl>
    </>
  );
}
