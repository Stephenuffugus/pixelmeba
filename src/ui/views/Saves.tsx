import { useEffect, useRef, useState } from 'preact/hooks';
import type { SlotSummary } from '@worker/protocol';
import { IconBack } from '../icons';
import { busy, getClient, importFile, loadSlot, route, showToast } from '../state';

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

export function Saves() {
  const [slots, setSlots] = useState<readonly SlotSummary[] | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () =>
    void getClient()
      .listSlots()
      .then((r) => {
        setSlots(r.slots);
        setPersistent(r.persistent);
      });
  useEffect(refresh, []);
  return (
    <main class="page" aria-labelledby="saves-title">
      <div class="home-grid">
        <header style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button class="btn ghost" style={{ color: 'inherit' }} onClick={() => (route.value = { name: 'home' })} aria-label="Back">
            <IconBack />
          </button>
          <h1 id="saves-title" style={{ fontSize: '1.5rem' }}>
            Saved dishes
          </h1>
        </header>
        {!persistent ? <p class="card">This browser is not keeping saves between visits. Export files to keep your dishes.</p> : null}
        <section class="card">
          {slots === null ? <p>Loading…</p> : null}
          {slots !== null && slots.length === 0 ? <p>No saved dishes yet.</p> : null}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
            {(slots ?? []).map((s) => (
              <li key={s.slotId} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 12rem' }}>
                  <strong>{s.slotId === 'autosave' ? `${s.name} (autosave)` : s.name}</strong>
                  <div class="sub">
                    {Math.floor(s.tick / 10)} s simulated · {when(s.savedAt)}
                  </div>
                </div>
                <button class="btn primary" disabled={busy.value} onClick={() => void loadSlot(s.slotId)}>
                  Open
                </button>
                {confirmDelete === s.slotId ? (
                  <>
                    <button
                      class="btn"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => {
                        void getClient()
                          .deleteSlot(s.slotId)
                          .then(() => {
                            showToast('Deleted.');
                            setConfirmDelete(null);
                            refresh();
                          });
                      }}
                    >
                      Delete for good
                    </button>
                    <button class="btn" onClick={() => setConfirmDelete(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button class="btn" onClick={() => setConfirmDelete(s.slotId)}>
                    Delete…
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section class="card">
          <h2>Import</h2>
          <p>Open a .pixelmeba file someone shared with you. A damaged or unsupported file changes nothing.</p>
          <button class="btn" onClick={() => fileRef.current?.click()}>
            Choose a file…
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
        </section>
      </div>
    </main>
  );
}
