import { useEffect, useRef, useState } from 'preact/hooks';
import type { SlotSummary } from '@worker/protocol';
import { IconClose, IconCopy, IconGuide, IconSave, IconUndo } from '../icons';
import { dishInfo, duplicateCurrent, exportCurrent, getClient, importFile, meta, route, saveToSlot, sheet, undo } from '../state';

export function MoreSheet() {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <section class="sheet" aria-labelledby="more-title">
      <header>
        <h2 id="more-title">More</h2>
        <button class="btn ghost" aria-label="Close" onClick={() => (sheet.value = 'none')}>
          <IconClose />
        </button>
      </header>
      <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button class="btn" onClick={() => (sheet.value = 'history')} data-testid="more-history">
          History and what happened
        </button>
        <button class="btn" onClick={() => (sheet.value = 'save')} data-testid="more-save">
          <IconSave /> Save…
        </button>
        <button
          class="btn"
          onClick={() => {
            sheet.value = 'none';
            void duplicateCurrent();
          }}
        >
          <IconCopy /> Duplicate dish
        </button>
        <button class="btn" disabled={!meta.value?.undoAvailable} onClick={() => void undo()}>
          <IconUndo /> Undo (rewinds time)
        </button>
        <button class="btn" onClick={() => void exportCurrent(false)} data-testid="more-export">
          Export living dish file
        </button>
        <button class="btn" onClick={() => void exportCurrent(true)}>
          Export without names or notes
        </button>
        <button class="btn" onClick={() => fileRef.current?.click()}>
          Import a dish file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pixelmeba,application/json,application/vnd.pixelmeba+json"
          class="sr-only"
          aria-label="Import a dish file"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) void importFile(f);
            e.currentTarget.value = '';
          }}
        />
        <button class="btn" onClick={() => (route.value = { name: 'saves' })}>
          Saved dishes
        </button>
        <button class="btn" onClick={() => (route.value = { name: 'guide' })}>
          <IconGuide /> Field Guide
        </button>
      </div>
    </section>
  );
}

export function SaveSheet() {
  const info = dishInfo.value;
  const [slots, setSlots] = useState<readonly SlotSummary[] | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [name, setName] = useState(info?.name ?? 'My dish');
  const [target, setTarget] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<string | null>(null);
  useEffect(() => {
    void getClient()
      .listSlots()
      .then((r) => {
        setSlots(r.slots);
        setPersistent(r.persistent);
      });
  }, []);
  const named = Array.from({ length: 10 }, (_, i) => `slot${i + 1}`);
  const bySlot = Object.fromEntries((slots ?? []).map((s) => [s.slotId, s]));
  const free = named.find((id) => !bySlot[id]) ?? null;
  const chosen = target ?? free;
  const save = async (slotId: string) => {
    if (await saveToSlot(slotId, name)) sheet.value = 'none';
  };
  return (
    <section class="sheet" aria-labelledby="save-title">
      <header>
        <h2 id="save-title">Save dish</h2>
        <button class="btn ghost" aria-label="Close" onClick={() => (sheet.value = 'none')}>
          <IconClose />
        </button>
      </header>
      {!persistent ? <p class="constraint">This browser is not keeping saves (private mode?). Saves last only until you close the app — export a file to keep it.</p> : null}
      <label style={{ display: 'grid', gap: '0.25rem', margin: '0.5rem 0' }}>
        Name
        <input
          value={name}
          maxLength={60}
          onInput={(e) => setName(e.currentTarget.value)}
          style={{ minHeight: '48px', padding: '0 0.75rem', borderRadius: '10px', border: '1px solid var(--line)' }}
        />
      </label>
      {slots === null ? <p class="sub">Loading slots…</p> : null}
      {slots !== null && free === null && target === null ? (
        <p class="constraint">All ten slots are used. Choose one to replace, or export a file instead.</p>
      ) : null}
      <div style={{ display: 'grid', gap: '0.35rem' }}>
        {named.map((id, i) => {
          const s = bySlot[id];
          return (
            <button key={id} class="btn" aria-pressed={chosen === id} style={{ justifyContent: 'space-between' }} onClick={() => setTarget(id)}>
              <span>Slot {i + 1}</span>
              <span class="sub">{s ? `${s.name} · ${Math.floor(s.tick / 10)} s` : 'empty'}</span>
            </button>
          );
        })}
      </div>
      {confirmReplace ? (
        <div class="constraint" role="alertdialog" aria-label="Replace save">
          <p style={{ margin: 0 }}>Replace “{bySlot[confirmReplace]?.name}”? Its previous copy is kept until your next save to this slot.</p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button class="btn primary" onClick={() => void save(confirmReplace)}>
              Replace
            </button>
            <button class="btn" onClick={() => setConfirmReplace(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          class="btn primary"
          style={{ width: '100%', marginTop: '0.75rem' }}
          disabled={!chosen}
          data-testid="save-confirm"
          onClick={() => {
            if (!chosen) return;
            if (bySlot[chosen]) setConfirmReplace(chosen);
            else void save(chosen);
          }}
        >
          Save
        </button>
      )}
    </section>
  );
}
