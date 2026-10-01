/**
 * Lab trays (UX §4.4): a category opens a shallow tray of labelled items; selecting an item makes it
 * the Lab's persistent tool and shows its purpose, suitable habitats, dose, radius, and what it
 * changes / does not change / what to watch for. Tools also carries dish actions (snapshot,
 * duplicate, compare, undo); Observe carries overlays, charts (the History sheet) and the family tree
 * (the lineage panel's sheet, P2.3).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { drawFrame, loadAtlas } from '../atlas';
import { IconClose, IconCopy, IconUndo } from '../icons';
import { dishInfo, duplicateCurrent, getClient, meta, openCompare, sheet, showToast, undo } from '../state';
import type { PlaceableStructure, SubstrateName } from '@sim/grid';
import {
  BRUSH_COPY,
  CHEMISTRY_MATERIALS,
  COUNTS,
  ERASE_STRUCTURE,
  FALLBACK_MATERIAL_COPY,
  FOOD_MATERIALS,
  FOOD_OBJECTS,
  OBJECT_COPY,
  habitatList,
  LAB_CATEGORIES,
  LAB_TEXT,
  LID_COPY,
  LIFE_COPY,
  livesHereText,
  MATERIAL_COPY,
  RADII,
  SHADE_ERASE,
  type HabitatToolId,
  type ItemCopy,
  type LabCategory,
  type StructureToolId,
} from '../strings/lab';
import {
  brushRule,
  labCount,
  labDoseIndex,
  labRadius,
  labTool,
  labTray,
  materialDose,
  selectLabTool,
  setLabRadius,
  type LabToolId,
} from '../views/LabView';
import { IconCompare } from './CompareIcon';
import {
  IconBead,
  IconCharts,
  IconErase,
  IconGel,
  IconLineage,
  IconSediment,
  IconShade,
  IconSnapshot,
  IconStone,
  IconSun,
  IconWall,
  IconWater,
} from './LabTrayIcons';
import { inSentence } from './LabTrayNames';
import {
  beginSample,
  cleanFraction,
  endSession,
  heldSample,
  isSessionTool,
  labSession,
  sampleMode,
  type LabSessionId,
} from './SampleSession';
import { CLEAN_WATER_FRACTIONS, type CleanWaterFraction } from '@sim/tools';
import { SAMPLE_MODES } from '@sim/sampleSlot';
import { CLEAN_WATER_LABELS, SAMPLE_MODE_HINTS, SAMPLE_MODE_LABELS, TOOLS_COPY } from '../strings/tools';
import { OverlayPicker } from './OverlayPicker';
import {
  dietLine,
  dishStructureIds,
  habitatTools,
  isPhage,
  paintRecord,
  shadeFactorOf,
  structureRecord,
  structureTools,
} from './LabTrayContent';

interface TrayItem {
  readonly id: LabToolId;
  readonly name: string;
  readonly icon: JSX.Element;
}

const HABITAT_ICONS: Record<HabitatToolId, () => JSX.Element> = {
  'paint:water': IconWater,
  'paint:gel': IconGel,
  'paint:sediment': IconSediment,
  'shade:paint': IconShade,
  'shade:erase': IconSun,
};
const STRUCTURE_ICONS: Record<StructureToolId, () => JSX.Element> = {
  'place:stone': IconStone,
  'place:wall': IconWall,
  'place:bead': IconBead,
  erase: IconErase,
};

function Thumb({ asset }: { asset: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    void loadAtlas()
      .then((a) => {
        if (ref.current) drawFrame(ref.current, a, asset);
      })
      .catch(() => undefined);
  }, [asset]);
  return <canvas ref={ref} width={32} height={32} aria-hidden="true" class="lab-thumb" />;
}

/** A material swatch: colour plus a per-material pattern, so meaning never rests on colour alone. */
function Swatch({ id }: { id: string }) {
  return <span class={`lab-swatch sw-${id.toLowerCase()}`} aria-hidden="true" />;
}

/** The tray items of a category, from this dish's recorded content. */
export function trayItems(category: LabCategory): TrayItem[] {
  const info = dishInfo.value;
  if (!info) return [];
  switch (category) {
    case 'life':
      return info.speciesIds.map((id, i) => ({
        id: `life:${id}` as LabToolId,
        name: info.speciesNames[i] ?? id,
        icon: <Thumb asset={info.speciesAssets[i] ?? ''} />,
      }));
    case 'food':
    case 'chemistry': {
      // In the tray's own order (CT §5.1), only what this dish's recorded content enables.
      const allowed = category === 'food' ? FOOD_MATERIALS : CHEMISTRY_MATERIALS;
      const items = allowed.flatMap((id) => {
        const m = info.materials.find((x) => x.id === id);
        return m ? [{ id: `material:${m.id}` as LabToolId, name: m.name, icon: <Swatch id={m.id} /> }] : [];
      });
      // P3.6: finite food objects (one per tap) follow the brushed foods, when this dish records them.
      if (category === 'food')
        for (const id of FOOD_OBJECTS) {
          const m = info.materials.find((x) => x.id === id && x.kind === 'object');
          if (m) items.push({ id: `object:${m.id}` as LabToolId, name: m.name, icon: <Swatch id={m.id} /> });
        }
      return items;
    }
    case 'habitat':
      // Only the paints this dish's recorded content has (content is data; D-0024).
      return (habitatTools(info) as HabitatToolId[]).map((id) => {
        const Icon = HABITAT_ICONS[id];
        return { id, name: itemCopy(id)?.name ?? id, icon: <Icon /> };
      });
    case 'tools': {
      // Only the structures this dish's recorded manifest enables.
      const items: TrayItem[] = (structureTools(info) as StructureToolId[]).map((id) => {
        const Icon = STRUCTURE_ICONS[id];
        return { id, name: itemCopy(id)?.name ?? id, icon: <Icon /> };
      });
      // P3.5 (D-0037): Sample and Clean water on every world, g2-recorded ones included; Transfer while a
      // sample is held.
      items.push({ id: 'sample', name: TOOLS_COPY.sampleName, icon: <IconSampleTool /> });
      if (heldSample.value !== null) items.push({ id: 'transfer', name: TOOLS_COPY.transferName, icon: <IconTransferTool /> });
      items.push({ id: 'cleanWater', name: TOOLS_COPY.cleanWaterName, icon: <IconCleanWaterTool /> });
      return items;
    }
    default:
      return [];
  }
}

/** P3.5 tray icons (inline, 24 px, currentColor; meaning is always also in the label). */
function IconSampleTool() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="10" cy="10" r="6" stroke-dasharray="3 2" />
      <path d="M14.5 14.5 20 20" />
    </svg>
  );
}
function IconTransferTool() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="7" cy="12" r="3" />
      <path d="M12 12h9M17 8l4 4-4 4" />
    </svg>
  );
}
function IconCleanWaterTool() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z" />
      <path d="M9 15h6" />
    </svg>
  );
}

/** A Tools-tray session item picked (P3.5): Sample begins (pauses the dish); the others take the next gesture. */
function pickSession(id: LabSessionId): void {
  if (id === 'sample') {
    if (labSession.value === 'sample') return;
    endSession();
    void beginSample();
    return;
  }
  endSession();
  labSession.value = id;
}

/** Which tray a tool lives in. */
export function categoryOf(id: LabToolId): LabCategory {
  if (isSessionTool(id)) return 'tools';
  if (id.startsWith('life:')) return 'life';
  if (id.startsWith('object:')) return 'food';
  if (id.startsWith('material:'))
    return CHEMISTRY_MATERIALS.includes(id.slice('material:'.length)) ? 'chemistry' : 'food';
  if (id.startsWith('paint:') || id.startsWith('shade:')) return 'habitat';
  if (id.startsWith('place:') || id === 'erase') return 'tools';
  return 'inspect';
}

/** The detail lines of a tool, from this dish's recorded content plus the Lab copy. */
export function itemCopy(id: LabToolId): ItemCopy | null {
  const info = dishInfo.value;
  if (!info) return null;
  if (id.startsWith('life:')) {
    const sp = id.slice('life:'.length);
    const i = info.speciesIds.indexOf(sp);
    if (i < 0) return null;
    const name = info.speciesNames[i] ?? sp;
    // A phage dose adds viral units to every covered cell, never organisms (SPEC §10.2; W2-14).
    if (isPhage(info, sp))
      return {
        name,
        purpose: info.speciesSummaries?.[i] ?? 'A virus recorded in this dish.',
        habitats: LIFE_COPY.phageHabitats,
        dose: LIFE_COPY.phageDose(labCount.value, name),
        changes: LIFE_COPY.phageChanges,
        unchanged: LIFE_COPY.phageUnchanged,
        watch: LIFE_COPY.phageWatch,
      };
    return {
      name,
      purpose: info.speciesSummaries?.[i] ?? 'An organism recorded in this dish.',
      habitats: habitatList(info.speciesHabitats?.[i], info.speciesAttachment?.[i]),
      dose: LIFE_COPY.dose(labCount.value),
      changes: LIFE_COPY.changes,
      unchanged: LIFE_COPY.unchanged,
      watch: LIFE_COPY.watch,
    };
  }
  if (id.startsWith('material:')) {
    const mid = id.slice('material:'.length);
    const j = info.materials.findIndex((m) => m.id === mid);
    const mat = info.materials[j];
    if (!mat) return null;
    const c = MATERIAL_COPY[mid] ?? FALLBACK_MATERIAL_COPY;
    const unit = c.unit ? ` ${c.unit}` : '';
    return {
      name: mat.name,
      purpose: info.materialSummaries?.[j] ?? '',
      habitats: c.habitats,
      dose: `${materialDose(mid)}${unit} per covered cell (choose ${mat.doses.join(', ')}).`,
      changes: c.changes,
      unchanged: c.unchanged,
      watch: c.watch,
    };
  }
  if (id.startsWith('paint:')) {
    const sub = id.slice('paint:'.length) as SubstrateName;
    const rec = paintRecord(info, sub);
    if (!rec) return null;
    return {
      name: rec.name,
      purpose: rec.summary,
      habitats: BRUSH_COPY.substrate.habitats,
      dose: BRUSH_COPY.substrate.dose,
      // The content rules text is true in every dish; who lives here comes from this dish's species.
      changes: rec.rules || rec.summary,
      lives: livesHereText(sub, info.speciesNames, info.speciesHabitats, inSentence(rec.name), {
        attachment: info.speciesAttachment,
        structureIds: dishStructureIds(info),
      }),
      unchanged: BRUSH_COPY.substrate.unchanged,
      watch: rec.example,
    };
  }
  if (id === 'shade:paint' || id === 'shade:erase') {
    const rec = paintRecord(info, 'shade');
    const factor = shadeFactorOf(info);
    if (!rec || factor === null) return null;
    if (id === 'shade:erase') return SHADE_ERASE;
    return {
      name: rec.name,
      purpose: rec.summary,
      habitats: BRUSH_COPY.shade.habitats,
      dose: BRUSH_COPY.shade.dose(factor),
      changes: rec.rules || rec.summary,
      unchanged: BRUSH_COPY.shade.unchanged,
      watch: rec.example,
    };
  }
  if (id.startsWith('place:')) {
    const which = id.slice('place:'.length) as PlaceableStructure;
    const rec = structureRecord(info, which);
    if (!rec) return null;
    const p = BRUSH_COPY.place;
    return {
      name: rec.name,
      purpose: rec.summary,
      habitats: which === 'wall' ? p.wallHabitats : p.habitats,
      dose: p.dose,
      changes: rec.rules || rec.summary,
      unchanged: which === 'bead' ? p.beadUnchanged : p.sealedUnchanged,
      watch: rec.example,
    };
  }
  if (id === 'erase') return structureTools(info).includes('erase') ? ERASE_STRUCTURE : null;
  // P3.5: player tools offered on every world (D-0037).
  if (id === 'sample' || id === 'transfer') {
    const c = TOOLS_COPY.sample;
    return { name: id === 'sample' ? TOOLS_COPY.sampleName : TOOLS_COPY.transferName, purpose: c.purpose, habitats: c.habitats, dose: id === 'sample' ? c.dose : TOOLS_COPY.transferHint, changes: c.changes, unchanged: c.unchanged, watch: c.watch };
  }
  if (id === 'cleanWater') {
    const c = TOOLS_COPY.cleanWater;
    return { name: TOOLS_COPY.cleanWaterName, purpose: c.purpose, habitats: c.habitats, dose: c.dose(CLEAN_WATER_LABELS[String(cleanFraction.value)] ?? ''), changes: c.changes, unchanged: c.unchanged, watch: c.watch };
  }
  if (id.startsWith('object:')) {
    // P3.6: a food object, named and summarised by the dish's recorded content.
    const mid = id.slice('object:'.length);
    const j = info.materials.findIndex((m) => m.id === mid && m.kind === 'object');
    const c = OBJECT_COPY[mid];
    if (j < 0 || !c) return null;
    return { name: info.materials[j]!.name, purpose: info.materialSummaries?.[j] ?? '', ...c };
  }
  return null;
}

function Segmented<T extends number>({
  label,
  values,
  value,
  onPick,
  prefix = '',
  testid,
  format,
}: {
  label: string;
  values: readonly T[];
  value: T;
  onPick: (v: T) => void;
  prefix?: string;
  testid: string;
  /** P3.5: how a value reads on its button (default: the number). */
  format?: (v: T) => string;
}) {
  return (
    <div class="lab-option">
      <span class="lab-option-label" id={`${testid}-label`}>
        {label}
      </span>
      <div class="segmented" role="group" aria-labelledby={`${testid}-label`}>
        {values.map((v) => (
          <button
            key={v}
            class="btn"
            aria-pressed={v === value}
            onClick={() => onPick(v)}
            data-testid={`${testid}-${v}`}
          >
            {prefix}
            {format ? format(v) : v}
          </button>
        ))}
      </div>
    </div>
  );
}

function ItemDetails({ id }: { id: LabToolId }) {
  const copy = itemCopy(id);
  if (!copy) return null;
  const brush = brushRule(id) !== null || id.startsWith('life:') || id === 'sample';
  const t = LAB_TEXT.details;
  const info = dishInfo.value;
  // The species' diet line (UX §4.3; W2-13), from the dish's own records.
  const diet = info && id.startsWith('life:') ? dietLine(info, id.slice('life:'.length)) : null;
  return (
    <section class="lab-details" aria-label={`${copy.name}: what it does`} data-testid="lab-details">
      <h3>{copy.name}</h3>
      <dl>
        <dt>{t.purpose}</dt>
        <dd>{copy.purpose}</dd>
        {diet ? (
          <>
            <dt>{LIFE_COPY.dietLabel}</dt>
            <dd data-testid="lab-diet">{diet.text}</dd>
          </>
        ) : null}
        <dt>{t.habitats}</dt>
        <dd>{copy.habitats}</dd>
        <dt>{t.dose}</dt>
        <dd>{copy.dose}</dd>
        <dt>{t.radius}</dt>
        <dd>{brush ? `${labRadius.value} cells (choose 1, 3 or 6).` : 'Not a brush.'}</dd>
        <dt>{t.changes}</dt>
        <dd>{copy.changes}</dd>
        {copy.lives !== undefined ? (
          <>
            <dt>{t.lives}</dt>
            <dd data-testid="lab-lives">{copy.lives}</dd>
          </>
        ) : null}
        <dt>{t.unchanged}</dt>
        <dd>{copy.unchanged}</dd>
        <dt>{t.watch}</dt>
        <dd>{copy.watch}</dd>
      </dl>
    </section>
  );
}

function ToolOptions({ id }: { id: LabToolId }) {
  const info = dishInfo.value;
  const opts: JSX.Element[] = [];
  if (id.startsWith('life:'))
    opts.push(
      <Segmented
        key="count"
        label={info && isPhage(info, id.slice('life:'.length)) ? LIFE_COPY.phageCountLabel : LAB_TEXT.count}
        values={COUNTS}
        value={labCount.value}
        onPick={(v) => (labCount.value = v)}
        testid="lab-count"
      />,
    );
  if (id.startsWith('material:')) {
    const mat = info?.materials.find((m) => m.id === id.slice('material:'.length));
    if (mat) {
      const idx = [0, 1, 2].filter((i) => mat.doses[i] !== undefined);
      opts.push(
        <div key="dose" class="lab-option">
          <span class="lab-option-label" id="lab-dose-label">
            {LAB_TEXT.dose}
          </span>
          <div class="segmented" role="group" aria-labelledby="lab-dose-label">
            {idx.map((i) => (
              <button
                key={i}
                class="btn"
                aria-pressed={labDoseIndex.value === i}
                onClick={() => (labDoseIndex.value = i)}
                data-testid={`lab-dose-${i}`}
              >
                {mat.doses[i]}
              </button>
            ))}
          </div>
        </div>,
      );
    }
  }
  // P3.5: what Sample takes, and how much water Clean water replaces.
  if (id === 'sample')
    opts.push(
      <div key="mode" class="lab-option">
        <span class="lab-option-label" id="sample-mode-label">
          {TOOLS_COPY.modeLabel}
        </span>
        <div class="segmented" role="group" aria-labelledby="sample-mode-label">
          {SAMPLE_MODES.map((m) => (
            <button key={m} class="btn" aria-pressed={sampleMode.value === m} title={SAMPLE_MODE_HINTS[m]} onClick={() => (sampleMode.value = m)} data-testid={`sample-mode-${m}`}>
              {SAMPLE_MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <p class="lab-sub">{SAMPLE_MODE_HINTS[sampleMode.value]}</p>
      </div>,
    );
  if (id === 'cleanWater')
    opts.push(
      <Segmented<CleanWaterFraction>
        key="fraction"
        label={TOOLS_COPY.fractionLabel}
        values={CLEAN_WATER_FRACTIONS}
        value={cleanFraction.value}
        onPick={(v) => (cleanFraction.value = v)}
        testid="clean-fraction"
        format={(v) => CLEAN_WATER_LABELS[String(v)] ?? String(v)}
      />,
    );
  if (brushRule(id) !== null || id.startsWith('life:') || id === 'sample')
    opts.push(
      <Segmented
        key="radius"
        label={LAB_TEXT.radius}
        values={RADII}
        value={labRadius.value}
        onPick={setLabRadius}
        prefix="r "
        testid="lab-radius"
      />,
    );
  return opts.length > 0 ? <div class="lab-options">{opts}</div> : null;
}

function ToolsActions() {
  const m = meta.value;
  return (
    <div class="lab-actions" role="group" aria-label="Dish actions">
      <button
        class="btn"
        onClick={() => {
          labTray.value = null;
          sheet.value = 'save';
        }}
        data-testid="lab-snapshot"
      >
        <IconSnapshot /> {LAB_TEXT.snapshot}
      </button>
      <button
        class="btn"
        onClick={() => {
          labTray.value = null;
          void duplicateCurrent();
        }}
        data-testid="lab-duplicate"
      >
        <IconCopy /> {LAB_TEXT.duplicate}
      </button>
      <button
        class="btn"
        onClick={() => {
          labTray.value = null;
          void openCompare();
        }}
        data-testid="lab-compare"
      >
        <IconCompare /> {LAB_TEXT.compare}
      </button>
      <button
        class="btn"
        disabled={!m?.undoAvailable}
        onClick={() => void undo()}
        data-testid="lab-tray-undo"
      >
        <IconUndo /> {LAB_TEXT.undo}
      </button>
    </div>
  );
}

let lidCommands = 0;

/**
 * The dish's lid, open or closed (SPEC §4.5; P3.1): a world setting changed by the setLid command, one
 * recorded, undoable change like any gesture. Shows the setting the dish's latest snapshot reported.
 */
function LidToggle() {
  const info = dishInfo.value;
  const dishId = info?.dishId ?? null;
  const [lid, setLid] = useState<'open' | 'closed' | null>(() => (dishId ? getClient().lidOf(dishId) : null));
  useEffect(() => {
    if (!dishId) return;
    const c = getClient();
    setLid(c.lidOf(dishId));
    return c.onSnapshot((s) => {
      if (s.dishId === dishId && s.lid) setLid(s.lid);
    });
  }, [dishId]);
  if (!dishId) return null;
  const choose = (want: 'open' | 'closed') => {
    if (want === lid) return;
    void getClient()
      .command(dishId, `lab-lid-${++lidCommands}`, { kind: 'setLid', lid: want }, true)
      .then((res) => {
        if (dishInfo.value?.dishId !== dishId) return;
        showToast(res && res.accepted > 0 ? LID_COPY.outcome(want) : LID_COPY.failed, 4000);
      })
      .catch(() => showToast(LID_COPY.failed, 4000));
  };
  return (
    <div class="lab-option" data-testid="lab-lid">
      <span class="lab-option-label" id="lab-lid-label">
        {LID_COPY.label}
      </span>
      <div class="segmented" role="group" aria-labelledby="lab-lid-label" aria-describedby="lab-lid-rule">
        {(['open', 'closed'] as const).map((v) => (
          <button
            key={v}
            class="btn"
            aria-pressed={lid === v}
            onClick={() => choose(v)}
            data-testid={`lab-lid-${v}`}
          >
            {v === 'open' ? LID_COPY.open : LID_COPY.closed}
          </button>
        ))}
      </div>
      <p class="lab-sub" id="lab-lid-rule">
        {LID_COPY.rule}
      </p>
    </div>
  );
}

function ObserveActions() {
  return (
    <div class="lab-actions" role="group" aria-label="Charts and family">
      <button
        class="btn"
        onClick={() => {
          labTray.value = null;
          sheet.value = 'history';
        }}
        data-testid="lab-charts"
      >
        <IconCharts /> {LAB_TEXT.charts}
      </button>
      {/* The family tree is the lineage panel's sheet (P2.3). */}
      <button
        class="btn"
        onClick={() => {
          labTray.value = null;
          sheet.value = 'lineage';
        }}
        data-testid="lab-lineage"
      >
        <IconLineage /> {LAB_TEXT.lineage}
      </button>
    </div>
  );
}

export function LabTray({ category }: { category: LabCategory }) {
  const cat = LAB_CATEGORIES.find((c) => c.id === category)!;
  const items = trayItems(category);
  // P3.5: a Tools-tray session (Sample, Transfer, Clean water) is the selected item while it runs.
  const selected = labSession.value ?? labTool.value;
  const inThisTray = selected !== 'inspect' && categoryOf(selected) === category;
  return (
    <section
      class="lab-tray"
      aria-labelledby="lab-tray-title"
      data-testid="lab-tray"
      data-category={category}
    >
      <div class="sheet-scroll">
        <header>
          <h2 id="lab-tray-title">{cat.label}</h2>
          <button
            class="btn ghost"
            aria-label={`Close ${cat.label}`}
            onClick={() => (labTray.value = null)}
            data-testid="lab-tray-close"
          >
            <IconClose />
          </button>
        </header>
        <p class="lab-sub">{cat.hint}</p>
        {category === 'observe' ? (
          <>
            <OverlayPicker />
            <ObserveActions />
          </>
        ) : (
          <>
            {items.length > 0 ? (
              <div class="lab-items" role="group" aria-label={`${cat.label} items`}>
                {items.map((it) => (
                  <button
                    key={it.id}
                    class="btn lab-item"
                    aria-pressed={selected === it.id}
                    onClick={() => (isSessionTool(it.id) ? pickSession(it.id) : selectLabTool(it.id))}
                    data-testid={`lab-item-${it.id}`}
                  >
                    {it.icon}
                    <span>{it.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {inThisTray ? (
              <>
                <ToolOptions id={selected} />
                <button
                  class="btn primary lab-use"
                  onClick={() => (labTray.value = null)}
                  data-testid="lab-use"
                >
                  {LAB_TEXT.use}
                </button>
                <ItemDetails id={selected} />
              </>
            ) : items.length > 0 ? (
              <p class="lab-sub">{LAB_TEXT.pickItem}</p>
            ) : category === 'habitat' || category === 'tools' ? (
              <p class="lab-sub" data-testid="lab-none-in-dish">
                {category === 'habitat' ? LAB_TEXT.noPaint : LAB_TEXT.noStructures}
              </p>
            ) : null}
            {category === 'tools' ? <ToolsActions /> : null}
            {category === 'habitat' ? <LidToggle /> : null}
          </>
        )}
      </div>
    </section>
  );
}
