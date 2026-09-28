/**
 * Lab trays (UX §4.4): a category opens a shallow tray of labelled items; selecting an item makes it
 * the Lab's persistent tool and shows its purpose, suitable habitats, dose, radius, and what it
 * changes / does not change / what to watch for. Tools also carries dish actions (snapshot,
 * duplicate, compare, undo); Observe carries overlays, charts (the History sheet) and the family tree
 * (the lineage panel's sheet, P2.3).
 */
import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { drawFrame, loadAtlas } from '../atlas';
import { IconClose, IconCopy, IconUndo } from '../icons';
import { dishInfo, duplicateCurrent, meta, openCompare, sheet, undo } from '../state';
import type { PlaceableStructure, SubstrateName } from '@sim/grid';
import {
  BRUSH_COPY,
  cannotLiveIn,
  CHEMISTRY_MATERIALS,
  COUNTS,
  ERASE_STRUCTURE,
  FALLBACK_MATERIAL_COPY,
  FOOD_MATERIALS,
  habitatList,
  LAB_CATEGORIES,
  LAB_TEXT,
  LIFE_COPY,
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
import { OverlayPicker } from './OverlayPicker';
import { habitatTools, paintRecord, shadeFactorOf, structureRecord, structureTools } from './LabTrayContent';

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
      const allowed = category === 'food' ? FOOD_MATERIALS : CHEMISTRY_MATERIALS;
      return info.materials
        .filter((m) => allowed.includes(m.id))
        .map((m) => ({ id: `material:${m.id}` as LabToolId, name: m.name, icon: <Swatch id={m.id} /> }));
    }
    case 'habitat':
      // Only the paints this dish's recorded content has (content is data; D-0024).
      return (habitatTools(info) as HabitatToolId[]).map((id) => {
        const Icon = HABITAT_ICONS[id];
        return { id, name: itemCopy(id)?.name ?? id, icon: <Icon /> };
      });
    case 'tools':
      // Only the structures this dish's recorded manifest enables.
      return (structureTools(info) as StructureToolId[]).map((id) => {
        const Icon = STRUCTURE_ICONS[id];
        return { id, name: itemCopy(id)?.name ?? id, icon: <Icon /> };
      });
    default:
      return [];
  }
}

/** Which tray a tool lives in. */
export function categoryOf(id: LabToolId): LabCategory {
  if (id.startsWith('life:')) return 'life';
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
    return {
      name: info.speciesNames[i] ?? sp,
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
    const cannot = cannotLiveIn(sub, info.speciesNames, info.speciesHabitats);
    const also = cannot.length > 0 ? ` In this dish, ${cannot.join(', ')} cannot live in ${sub}.` : '';
    return {
      name: rec.name,
      purpose: rec.summary,
      habitats: BRUSH_COPY.substrate.habitats,
      dose: BRUSH_COPY.substrate.dose,
      changes: rec.rules || rec.summary,
      unchanged: BRUSH_COPY.substrate.unchanged,
      watch: `${rec.example}${also}`.trim(),
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
  return null;
}

function Segmented<T extends number>({
  label,
  values,
  value,
  onPick,
  prefix = '',
  testid,
}: {
  label: string;
  values: readonly T[];
  value: T;
  onPick: (v: T) => void;
  prefix?: string;
  testid: string;
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
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

function ItemDetails({ id }: { id: LabToolId }) {
  const copy = itemCopy(id);
  if (!copy) return null;
  const brush = brushRule(id) !== null || id.startsWith('life:');
  const t = LAB_TEXT.details;
  return (
    <section class="lab-details" aria-label={`${copy.name}: what it does`} data-testid="lab-details">
      <h3>{copy.name}</h3>
      <dl>
        <dt>{t.purpose}</dt>
        <dd>{copy.purpose}</dd>
        <dt>{t.habitats}</dt>
        <dd>{copy.habitats}</dd>
        <dt>{t.dose}</dt>
        <dd>{copy.dose}</dd>
        <dt>{t.radius}</dt>
        <dd>{brush ? `${labRadius.value} cells (choose 1, 3 or 6).` : 'Not a brush.'}</dd>
        <dt>{t.changes}</dt>
        <dd>{copy.changes}</dd>
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
        label={LAB_TEXT.count}
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
  if (brushRule(id) !== null || id.startsWith('life:'))
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
  const selected = labTool.value;
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
                    onClick={() => selectLabTool(it.id)}
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
          </>
        )}
      </div>
    </section>
  );
}
