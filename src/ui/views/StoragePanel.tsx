/**
 * Saved dishes → Storage (P4.8b; D02 §20 "Show approximate storage used and offer explicit cleanup. Never
 * silently evict named dish saves."; D-0082; D-0084): what this device keeps, by group, with sizes. Remove…
 * on a checkpoint, a Try my dish starting point or a snapshot asks once, naming what goes and what stays.
 * Saved dishes and Continue have no Remove here: they are deleted only with Saved dishes' own Delete….
 */
import { useEffect } from 'preact/hooks';
import { getClient } from '../state';
import { atDishTime } from '../state';
import { askRemove, cancelRemove, confirmRemove, pendingRemove, refreshStorage, removeQuestion, rowBytes, storageGroups, storageInfoNow, storageMessage, storageTotal, usageLine } from '../storage';
import { sizeText, STORAGE_UI } from '../strings/notebookTools';
import { slotNumber } from '../strings/whatif';

export function StoragePanel({ onChanged }: { onChanged?: () => void }) {
  useEffect(() => {
    storageMessage.value = null;
    pendingRemove.value = null;
    void refreshStorage(getClient());
  }, []);
  const info = storageInfoNow.value;
  const pending = pendingRemove.value;
  return (
    <section class="card storage-panel" aria-labelledby="storage-title" data-testid="storage-panel">
      <h2 id="storage-title" tabIndex={-1}>
        {STORAGE_UI.title}
      </h2>
      <p>{STORAGE_UI.lead}</p>
      {!info ? (
        <p>{STORAGE_UI.reading}</p>
      ) : (
        <>
          <p data-testid="storage-usage">
            <strong>{usageLine(info.estimate)}</strong>
          </p>
          <p class="sub">{STORAGE_UI.total(sizeText(storageTotal(info)))}</p>
          {storageMessage.value ? (
            <p class="constraint" role="status" data-testid="storage-message">
              {storageMessage.value}
            </p>
          ) : null}
          {storageGroups(info).map((g) => (
            <section key={g.id} aria-labelledby={`storage-${g.id}`} data-testid={`storage-group-${g.id}`}>
              <h3 id={`storage-${g.id}`}>
                {g.label} <span class="sub">· {sizeText(g.bytes)}</span>
              </h3>
              {g.id === 'saved' ? <p class="sub">{STORAGE_UI.savedNote}</p> : null}
              {g.rows.length === 0 ? <p class="sub">{STORAGE_UI.empty}</p> : null}
              <ul class="storage-rows">
                {g.rows.map((r) => {
                  const question = removeQuestion(r);
                  const label = r.kind === 'slot' ? `Slot ${slotNumber(r.slotId)}: ${r.name}` : r.name;
                  return (
                    <li key={r.slotId} data-testid="storage-row" data-slot={r.slotId} data-kind={r.kind}>
                      <div style={{ flex: '1 1 12rem' }}>
                        <strong>{label}</strong>
                        <div class="sub">
                          {atDishTime(r.tick)} · {sizeText(rowBytes(r))}
                          {r.previousBytes > 0 ? ` (${STORAGE_UI.previous(sizeText(r.previousBytes))})` : ''}
                        </div>
                      </div>
                      {question === null ? null : pending === r.slotId ? (
                        <>
                          <p class="storage-confirm" id={`storage-q-${r.slotId}`} data-testid="storage-confirm-text">
                            {question}
                          </p>
                          <button
                            class="btn"
                            style={{ color: 'var(--danger)' }}
                            aria-describedby={`storage-q-${r.slotId}`}
                            data-testid="storage-remove-confirm"
                            onClick={() =>
                              void confirmRemove(getClient()).then(() => {
                                onChanged?.();
                                document.getElementById('storage-title')?.focus();
                              })
                            }
                          >
                            {STORAGE_UI.removeConfirm}
                          </button>
                          <button class="btn" data-testid="storage-remove-cancel" onClick={cancelRemove}>
                            {STORAGE_UI.cancel}
                          </button>
                        </>
                      ) : (
                        <button class="btn" aria-label={`Remove ${label}…`} data-testid="storage-remove" onClick={() => askRemove(r.slotId)}>
                          {STORAGE_UI.remove}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </section>
  );
}
