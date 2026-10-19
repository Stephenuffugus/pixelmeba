import { useEffect, useRef, useState } from 'preact/hooks';
import type { SlotSummary } from '@worker/protocol';
import { IconClose, IconCopy, IconGuide, IconSave, IconUndo } from '../icons';
import { IconCompare } from './CompareIcon';
import { openWhatIf } from './WhatIfState';
import { openGuideFromDish } from '../views/FieldGuideNav';
import { WHATIF_TEXT } from '../strings/whatif';
import { modesFlags, worldModesLine } from '../strings/modes';
import { slotModesLine } from '../strings/modes';
import { dishClock, evolution } from '../state';
import {
  dishInfo,
  duplicateCurrent,
  openCompare,
  exportCurrent,
  getClient,
  importFile,
  meta,
  route,
  saveToSlot,
  sheet,
  undo,
} from '../state';
import { saveAndLeave } from '../state';
import { HOME_TEXT } from '../strings/home';
import { NOT_KEEPING_SAVES } from '../strings/saves';
import { isNativePlatform } from '@platform/capacitor';
import { GoalRow } from './GoalChoice';
import { TryMoreRow } from './TrySetup';
import { ChallengeMoreRows } from './ChallengeStart';
import { openShare } from '../share';
import { openBookmarkSheet } from '../bookmarks';
import { BOOKMARK_UI } from '../strings/notebookTools';
import { IconShare } from './ShareSheet';
import { DEMO_MODE } from '@platform/web'; // P4.11

export function MoreSheet() {
  const fileRef = useRef<HTMLInputElement>(null);
  // P4.1 (SPEC §12.6, UX §5.10 "include nickname (off)"): family nicknames leave only by this choice.
  const [nicknames, setNicknames] = useState(false);
  return (
    <section class="sheet" aria-labelledby="more-title">
      <div class="sheet-scroll">
        <header>
          <h2 id="more-title">More</h2>
          <button class="btn ghost" aria-label="Close" onClick={() => (sheet.value = 'none')}>
            <IconClose />
          </button>
        </header>
        {/* UX §3.3: mode labels wherever a world is described (P2.2). */}
        {dishInfo.value ? (
          <p class="world-modes" data-testid="more-world-label">
            {worldModesLine(evolution.value?.preset ?? dishInfo.value.mutationPreset, evolution.value?.founderMode ?? dishInfo.value.founderMode, modesFlags(dishInfo.value.registry, dishInfo.value.testOverrides))}
          </p>
        ) : null}
        <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button class="btn" onClick={() => (sheet.value = 'history')} data-testid="more-history">
            History and what happened
          </button>
          {/* P4.8b (SPEC §12.8): a bookmark of this moment, optionally with a stored snapshot. */}
          <button class="btn" onClick={openBookmarkSheet} data-testid="bookmark-now">
            {BOOKMARK_UI.moreRow}
          </button>
          {/* P4.4 (SPEC §13.5): the Goal row — the running goal and Leave goal, or Try a goal… */}
          {DEMO_MODE ? null : <GoalRow />}
          <button class="btn" onClick={() => (sheet.value = 'evolution')} data-testid="more-evolution">
            Evolution settings (Advanced)
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
          {/* What if? (P2.6, UX §3.4): for a dish from a recipe with What if? ideas, or made from one. */}
          {dishInfo.value?.whatIfSourceId ? (
            <button
              class="btn"
              onClick={() => {
                sheet.value = 'none';
                openWhatIf('dish');
              }}
              data-testid="more-whatif"
            >
              {WHATIF_TEXT.moreItem}
            </button>
          ) : null}
          {/* P4.7 (SPEC §13.6): Try my dish… (a turn at its horizon: its result card again). */}
          {/* P4.11 DEMO_MODE (D09 §10): no Try my dish, challenges, goals or Compare in the demo. */}
          {DEMO_MODE ? null : <TryMoreRow />}
          {/* P4.8c (SPEC §13.5): Make a challenge…, Start challenge: {name}, Export challenge, Leave challenge…. */}
          {DEMO_MODE ? null : <ChallengeMoreRows />}
          {/* UX §2.4: Compare lives in More (and in the Lab Tools tray from P2.7). */}
          {DEMO_MODE ? null : (
            <button
              class="btn"
              onClick={() => {
                sheet.value = 'none';
                void openCompare();
              }}
              data-testid="action-compare"
            >
              <IconCompare /> Compare: copy this dish and change one thing
            </button>
          )}
          <button class="btn" disabled={!meta.value?.undoAvailable} onClick={() => void undo()}>
            <IconUndo /> Undo (rewinds time)
          </button>
          {/* P4.6 (UX §5.10): Share — Picture, Starting recipe or Living dish, through the OS share/save flow. */}
          <button class="btn" onClick={() => openShare()} data-testid="more-share">
            <IconShare /> Share…
          </button>
          <label class="fav-share-option">
            <input type="checkbox" checked={nicknames} onChange={(e) => setNicknames(e.currentTarget.checked)} data-testid="more-include-nicknames" />
            Include family nicknames
          </label>
          <button class="btn" onClick={() => void exportCurrent(false, nicknames)} data-testid="more-export">
            Export living dish file
          </button>
          <button class="btn" onClick={() => void exportCurrent(true, nicknames)}>
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
            // m24: the visible button operates this input; assistive technology hears that button only.
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void importFile(f);
              e.currentTarget.value = '';
            }}
          />
          <button class="btn" onClick={() => (route.value = { name: 'saves' })}>
            Saved dishes
          </button>
          {/* P3.8 (UX §2): the guide is a blocking panel; its Back returns here at this speed. */}
          <button class="btn" onClick={openGuideFromDish} data-testid="more-guide">
            <IconGuide /> Field Guide
          </button>
        </div>
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
  /** P4.3: the pending replacement was asked for by "Save and leave" (then the dish is left after saving). */
  const [leaveAfter, setLeaveAfter] = useState(false);
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
    if (leaveAfter) {
      await saveAndLeave(slotId, name); // P4.3 (D08): save (and autosave), then Home with the session memory
      return;
    }
    if (await saveToSlot(slotId, name)) sheet.value = 'none';
  };
  return (
    <section class="sheet" aria-labelledby="save-title">
      <div class="sheet-scroll">
        <header>
          <h2 id="save-title">Save dish</h2>
          <button class="btn ghost" aria-label="Close" onClick={() => (sheet.value = 'none')}>
            <IconClose />
          </button>
        </header>
        {!persistent ? (
          <p class="constraint">{NOT_KEEPING_SAVES.sheet(isNativePlatform())}</p>
        ) : null}
        <label style={{ display: 'grid', gap: '0.25rem', margin: '0.5rem 0' }}>
          Name
          <input
            value={name}
            maxLength={60}
            onInput={(e) => setName(e.currentTarget.value)}
            style={{
              minHeight: '48px',
              padding: '0 0.75rem',
              borderRadius: '10px',
              border: '1px solid var(--line)',
            }}
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
              <button
                key={id}
                class="btn"
                aria-pressed={chosen === id}
                style={{ justifyContent: 'space-between' }}
                onClick={() => setTarget(id)}
              >
                <span>Slot {i + 1}</span>
                <span class="sub">
                  {s ? `${s.name} · ${dishClock(s.tick)}` : 'empty'}
                  {/* P2.2: the saved world's mode labels (UX §3.3). */}
                  {s && slotModesLine(s.modes) ? <span class="slot-modes">{slotModesLine(s.modes)}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
        {confirmReplace ? (
          <div class="constraint" role="alertdialog" aria-label="Replace save">
            <p style={{ margin: 0 }}>
              Replace “{bySlot[confirmReplace]?.name}”? Its previous copy is kept until your next save to this
              slot.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button class="btn primary" onClick={() => void save(confirmReplace)}>
                Replace
              </button>
              <button
                class="btn"
                onClick={() => {
                  setConfirmReplace(null);
                  setLeaveAfter(false);
                }}
              >
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
              setLeaveAfter(false);
              if (bySlot[chosen]) setConfirmReplace(chosen);
              else void save(chosen);
            }}
          >
            Save
          </button>
        )}
        {/* P4.3 (D08 "A satisfying stopping point"): save, then Home shows a small session memory. */}
        {confirmReplace ? null : (
          <button
            class="btn"
            style={{ width: '100%', marginTop: '0.5rem' }}
            disabled={!chosen}
            data-testid="save-leave"
            onClick={() => {
              if (!chosen) return;
              setLeaveAfter(true);
              if (bySlot[chosen]) setConfirmReplace(chosen);
              else void saveAndLeave(chosen, name);
            }}
          >
            {HOME_TEXT.saveAndLeave}
          </button>
        )}
      </div>
    </section>
  );
}
