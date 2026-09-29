import { useEffect, useRef, useState } from 'preact/hooks';
import type { SlotSummary } from '@worker/protocol';
import { IconBack } from '../icons';
import { busy, getClient, importFile, loadSlot, route, showToast } from '../state';
import { dishClock, dishInfo, meta } from '../state';
import { savedIdeaLine } from '../strings/whatif';
import { slotModesLine } from '../strings/modes';

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

export function Saves() {
  const [slots, setSlots] = useState<readonly SlotSummary[] | null>(null);
  const [persistent, setPersistent] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  /** P2.8: the automatic checkpoint whose Open asks first (Continue would follow the new branch). */
  const [confirmOpen, setConfirmOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Focus follows the delete confirmation (as in the checkpoint list): Keep takes focus when it appears,
  // Keep returns it to Delete…, and after a deletion it goes to the page heading (never to <body>).
  const slotList = useRef<HTMLUListElement>(null);
  const confirmShown = useRef<string | null>(null);
  const slotDeleted = useRef(false);
  const inSlot = (slotId: string, testId: string): HTMLElement | null => {
    const row = Array.from(slotList.current?.querySelectorAll<HTMLElement>('li[data-slot]') ?? []).find((li) => li.dataset.slot === slotId);
    return row?.querySelector<HTMLElement>(`[data-testid="${testId}"]`) ?? null;
  };
  useEffect(() => {
    if (confirmDelete && inSlot(confirmDelete, 'slot-keep')) {
      confirmShown.current = confirmDelete;
      inSlot(confirmDelete, 'slot-keep')!.focus();
    } else if (!confirmDelete && confirmShown.current) {
      const id = confirmShown.current;
      confirmShown.current = null;
      if (slotDeleted.current) {
        slotDeleted.current = false;
        document.getElementById('saves-title')?.focus();
      } else inSlot(id, 'slot-delete')?.focus();
    }
  }, [confirmDelete]);
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
          <h1 id="saves-title" tabIndex={-1} style={{ fontSize: '1.5rem' }}>
            Saved dishes
          </h1>
        </header>
        {!persistent ? <p class="card">This browser is not keeping saves between visits. Export files to keep your dishes.</p> : null}
        <section class="card">
          {slots === null ? <p>Loading…</p> : null}
          {slots !== null && slots.every((s) => s.automatic) ? <p>No saved dishes yet.</p> : null}
          <ul ref={slotList} style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
            {(slots ?? []).filter((s) => !s.automatic).map((s) => (
              <li key={s.slotId} data-slot={s.slotId} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 12rem' }}>
                  <strong>{s.slotId === 'autosave' ? `${s.name} (autosave)` : s.name}</strong>
                  {s.variant ? (
                    <div class="sub" data-testid="slot-variant">
                      {savedIdeaLine(s.variant)}
                    </div>
                  ) : null}
                  {/* P2.2: mode labels wherever a world is described (UX §3.3). */}
                  {slotModesLine(s.modes) ? (
                    <div class="sub slot-modes" data-testid="slot-modes">
                      {slotModesLine(s.modes)}
                    </div>
                  ) : null}
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
                      aria-label={`Delete for good: ${s.name}`}
                      data-testid="slot-delete-confirm"
                      onClick={() => {
                        void getClient()
                          .deleteSlot(s.slotId)
                          .then(() => {
                            showToast('Deleted.');
                            slotDeleted.current = true;
                            setConfirmDelete(null);
                            refresh();
                          });
                      }}
                    >
                      Delete for good
                    </button>
                    <button class="btn" aria-label={`Keep ${s.name}`} data-testid="slot-keep" onClick={() => setConfirmDelete(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button class="btn" aria-label={`Delete ${s.name}…`} data-testid="slot-delete" onClick={() => setConfirmDelete(s.slotId)}>
                    Delete…
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
        {(slots ?? []).some((s) => s.automatic) ? (
          <CheckpointList
            checkpoints={(slots ?? []).filter((s) => s.automatic)}
            autosave={(slots ?? []).find((s) => s.slotId === 'autosave') ?? null}
            confirmOpen={confirmOpen}
            setConfirmOpen={setConfirmOpen}
            confirmDelete={confirmDelete}
            setConfirmDelete={setConfirmDelete}
            refresh={refresh}
          />
        ) : null}
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

/**
 * P2.8: automatic checkpoints, listed apart from the save slots and explained once (SPEC §10.7). Each
 * row names its moment in dish-clock time; its buttons say which checkpoint they act on. Opening one
 * starts a new branch that Continue then follows, so when Continue holds a dish, Open asks first.
 *
 * Keyboard focus never falls to the page (fix round 2, UX §4.2): when Open asks, focus moves to the
 * question, so it is read out; Cancel returns focus to that row's Open. Delete… moves focus to Keep
 * (the safe choice); Keep returns it to Delete…, and after a deletion it goes to the list's heading (or
 * the page's, when no checkpoint is left).
 */
function CheckpointList({
  checkpoints,
  autosave,
  confirmOpen,
  setConfirmOpen,
  confirmDelete,
  setConfirmDelete,
  refresh,
}: {
  checkpoints: readonly SlotSummary[];
  autosave: SlotSummary | null;
  confirmOpen: string | null;
  setConfirmOpen: (id: string | null) => void;
  confirmDelete: string | null;
  setConfirmDelete: (id: string | null) => void;
  refresh: () => void;
}) {
  // What Continue holds now: the open dish, else the autosave.
  const open = dishInfo.value;
  const held = open ? { name: open.name, tick: meta.value?.tick ?? open.tick } : autosave ? { name: autosave.name, tick: autosave.tick } : null;
  const sectionRef = useRef<HTMLElement>(null);
  const openShown = useRef<string | null>(null);
  const deleteShown = useRef<string | null>(null);
  const afterDelete = useRef(false);
  const inRow = (slotId: string, testId: string): HTMLElement | null => {
    const row = Array.from(sectionRef.current?.querySelectorAll<HTMLElement>('li[data-slot]') ?? []).find((li) => li.dataset.slot === slotId);
    return row?.querySelector<HTMLElement>(`[data-testid="${testId}"]`) ?? null;
  };
  useEffect(() => {
    if (confirmOpen && inRow(confirmOpen, 'checkpoint-confirm')) {
      openShown.current = confirmOpen;
      inRow(confirmOpen, 'checkpoint-confirm')!.focus();
    } else if (!confirmOpen && openShown.current) {
      const id = openShown.current;
      openShown.current = null;
      inRow(id, 'checkpoint-open')?.focus();
    }
  }, [confirmOpen]);
  useEffect(() => {
    if (confirmDelete && inRow(confirmDelete, 'checkpoint-keep')) {
      deleteShown.current = confirmDelete;
      inRow(confirmDelete, 'checkpoint-keep')!.focus();
    } else if (!confirmDelete && deleteShown.current) {
      const id = deleteShown.current;
      deleteShown.current = null;
      inRow(id, 'checkpoint-delete')?.focus();
    }
  }, [confirmDelete]);
  useEffect(() => {
    if (!afterDelete.current) return;
    afterDelete.current = false;
    document.getElementById('checkpoints-title')?.focus();
  }, [checkpoints.length]);
  // The last checkpoint deleted: this list goes away, so focus goes to the page's heading.
  useEffect(
    () => () => {
      if (afterDelete.current) document.getElementById('saves-title')?.focus();
    },
    [],
  );
  return (
    <section class="card" aria-labelledby="checkpoints-title" data-testid="checkpoints" ref={sectionRef}>
      <h2 id="checkpoints-title" tabIndex={-1}>
        Automatic checkpoints
      </h2>
      <p class="slot-automatic" data-testid="slot-automatic">
        Not among your ten save slots: the last 10 are kept, and the oldest is replaced first. Opening one starts a new branch from that moment, paused, and Continue then follows it. The
        checkpoint itself is left as it was.
      </p>
      <ul class="checkpoint-list">
        {checkpoints.map((s) => {
          const at = dishClock(s.tick);
          return (
            <li key={s.slotId} data-testid="checkpoint-row" data-slot={s.slotId}>
              <div style={{ flex: '1 1 12rem' }}>
                <strong>{s.name}</strong>
                {slotModesLine(s.modes) ? (
                  <div class="sub slot-modes" data-testid="slot-modes">
                    {slotModesLine(s.modes)}
                  </div>
                ) : null}
                <div class="sub">
                  at {at} dish time · {when(s.savedAt)}
                </div>
              </div>
              {confirmOpen === s.slotId && held ? (
                <>
                  <p class="checkpoint-confirm" id={`confirm-${s.slotId}`} tabIndex={-1} data-testid="checkpoint-confirm">
                    Continue now holds “{held.name}” at {dishClock(held.tick)}. Opening this checkpoint starts a new branch, and Continue will follow it instead. To keep “{held.name}” as it
                    is, save it to a slot first.
                  </p>
                  <button
                    class="btn primary"
                    disabled={busy.value}
                    aria-describedby={`confirm-${s.slotId}`}
                    onClick={() => {
                      setConfirmOpen(null);
                      void loadSlot(s.slotId);
                    }}
                    data-testid="checkpoint-open-confirm"
                  >
                    Open as a new branch
                  </button>
                  <button class="btn" onClick={() => setConfirmOpen(null)} data-testid="checkpoint-open-cancel">
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  class="btn primary"
                  disabled={busy.value}
                  aria-label={`Open ${s.name} at ${at}`}
                  onClick={() => (held ? setConfirmOpen(s.slotId) : void loadSlot(s.slotId))}
                  data-testid="checkpoint-open"
                >
                  Open
                </button>
              )}
              {confirmDelete === s.slotId ? (
                <>
                  <button
                    class="btn"
                    style={{ color: 'var(--danger)' }}
                    aria-label={`Delete for good: ${s.name} at ${at}`}
                    onClick={() => {
                      void getClient()
                        .deleteSlot(s.slotId)
                        .then(() => {
                          showToast('Deleted.');
                          deleteShown.current = null;
                          afterDelete.current = true;
                          setConfirmDelete(null);
                          refresh();
                        });
                    }}
                    data-testid="checkpoint-delete-confirm"
                  >
                    Delete for good
                  </button>
                  <button class="btn" aria-label={`Keep ${s.name} at ${at}`} onClick={() => setConfirmDelete(null)} data-testid="checkpoint-keep">
                    Keep
                  </button>
                </>
              ) : (
                <button class="btn" aria-label={`Delete ${s.name} at ${at}…`} onClick={() => setConfirmDelete(s.slotId)} data-testid="checkpoint-delete">
                  Delete…
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
