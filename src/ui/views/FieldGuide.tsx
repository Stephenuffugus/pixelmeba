/**
 * Field Guide (UX §5.7; SPEC §14 "Discovery and knowledge"; P3.8). Four tabs: Species · Materials ·
 * Structures & tools · Rules glossary. Every enabled entry is listed at once; nothing is locked.
 * Species entries show silhouette, food, where it lives, preferred conditions, predators, prey, hosts,
 * products, the abilities it can gain, one example and two headed sections: General biology and Rules
 * of this game. Structures and tools show Changes / Does not change / Watch for. '/' focuses search
 * (this page's own key handler, active only while the guide is shown). "Seen in your dishes" and the
 * cosmetic badges come only from the device record (src/ui/badges.ts); they change nothing anywhere.
 */
import { uiDemoScope } from '@platform/web'; // P4.11
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { IconBack } from '../icons';
import { drawFrame, loadAtlas } from '../atlas';
import { badgesFrom, deviceStorage, readRelationships, relationshipsVersion, seenFor, type Badge, type RelationshipRecord } from '../badges';
import { BADGE_COPY, GLOSSARY, GUIDE_TABS, GUIDE_TEXT, relationshipSentence, type GuideTab } from '../strings/guide';
import { simTime } from '../strings/modes';
import type { EquipmentEntry, GuideEntry, GuideModel, MaterialEntry, ModuleEntry, NamedLink, SpeciesEntry } from './FieldGuideData';
import { guideBack, syncRelationships } from './FieldGuideNav';

const T = GUIDE_TEXT;

export function FieldGuide() {
  const [model, setModel] = useState<GuideModel | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tab, setTab] = useState<GuideTab>('species');
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  void relationshipsVersion.value; // re-read the device record when this session stores new ones
  const storage = deviceStorage();
  const records = readRelationships(storage);

  useEffect(() => {
    let live = true;
    void import('./FieldGuideData')
      .then((m) => {
        if (live) setModel(m.loadGuideModel());
      })
      .catch((e: unknown) => {
        if (live) setFailed(e instanceof Error ? e.message : String(e));
      });
    void syncRelationships();
    return () => {
      live = false;
    };
  }, []);

  // UX §4.2: '/' searches the Field Guide. This page's own handler (the dish screen is not mounted).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  const q = query.trim().toLowerCase();
  const tabs = useMemo(() => (model ? tabEntries(model) : null), [model]);
  const match = (e: GuideEntry) => q === '' || e.search.includes(q);
  const nameOf = (id: string) => model?.names[id] ?? id;

  return (
    <main class="page guide-page" aria-labelledby="guide-title" data-testid="field-guide">
      <div class="home-grid">
        <header class="guide-head">
          <button class="btn ghost" style={{ color: 'inherit' }} onClick={guideBack} aria-label={T.back} data-testid="guide-back">
            <IconBack />
          </button>
          <h1 id="guide-title">{T.title}</h1>
        </header>
        <section class="card guide-intro">
          <p>{T.intro}</p>
          <p>{T.notReal}</p>
          <p data-testid="guide-fictional">{T.fictional}</p>
          <label class="guide-search">
            <span>{T.searchHint}</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              aria-label={T.searchLabel}
              onInput={(e) => setQuery(e.currentTarget.value)}
              data-testid="guide-search"
            />
          </label>
        </section>
        <BadgesCard records={records} storageOk={storage !== null} />
        <div class="guide-tabs" role="tablist" aria-label={T.title}>
          {GUIDE_TABS.map((t) => {
            const count = tabs && q !== '' ? tabs[t.id].filter(match).length : null;
            return (
              <button
                key={t.id}
                class="btn"
                role="tab"
                id={`guide-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="guide-panel"
                onClick={() => setTab(t.id)}
                data-testid={`guide-tab-${t.id}`}
              >
                {t.label}
                {count !== null ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>
        <section id="guide-panel" role="tabpanel" aria-labelledby={`guide-tab-${tab}`} class="guide-panel">
          {failed ? <p class="card">{failed}</p> : null}
          {!model || !tabs ? (
            failed ? null : <p class="card">Loading…</p>
          ) : tab === 'glossary' ? (
            <Glossary q={q} />
          ) : (
            <EntryList entries={tabs[tab].filter(match)} q={query} records={records} nameOf={nameOf} />
          )}
        </section>
      </div>
    </main>
  );
}

function tabEntries(m: GuideModel): Record<GuideTab, readonly GuideEntry[]> {
  // P4.11 DEMO_MODE: the Species tab lists the demo's five organisms (other entries are unchanged).
  const scope = uiDemoScope();
  const species = scope === null ? m.species : m.species.filter((e) => scope.species.includes(e.id));
  return { species: [...species, ...m.modules], materials: m.materials, tools: m.equipment, glossary: [] };
}

function EntryList({ entries, q, records, nameOf }: { entries: readonly GuideEntry[]; q: string; records: readonly RelationshipRecord[]; nameOf: (id: string) => string }) {
  if (entries.length === 0) return <p class="card">{T.noMatch(q.trim())}</p>;
  return (
    <>
      {entries.map((e) => (
        <Entry key={`${e.kind}:${e.id}`} entry={e} records={records} nameOf={nameOf} />
      ))}
    </>
  );
}

function Entry({ entry, records, nameOf }: { entry: GuideEntry; records: readonly RelationshipRecord[]; nameOf: (id: string) => string }) {
  const headingId = `guide-${entry.kind}-${entry.id}`;
  const seen =
    entry.kind === 'species'
      ? seenFor(records, { speciesId: entry.id })
      : entry.kind === 'material'
        ? seenFor(records, { pools: (entry as MaterialEntry).pools, enzymes: (entry as MaterialEntry).enzymes })
        : null; // modules, structures, tools and habitats: no relationship is noted about them (a module says what its carriers can be noted for)
  return (
    <article class="card guide-entry" aria-labelledby={headingId} data-testid={`guide-entry-${entry.id}`}>
      <div class="guide-entry-head">
        {entry.kind === 'species' ? <Thumb asset={(entry as SpeciesEntry).assetId} /> : null}
        <div>
          <h2 id={headingId}>{entry.name}</h2>
          <p class="guide-kind">
            {entry.kind === 'species' ? (entry as SpeciesEntry).category : KIND_WORDS[entry.kind]} · {entry.id}
          </p>
        </div>
      </div>
      <p class="guide-summary">{entry.summary}</p>
      {entry.kind === 'species' ? <SpeciesFacts s={entry as SpeciesEntry} /> : null}
      {entry.kind === 'module' ? <Fact label={T.abilityFor} value={links((entry as ModuleEntry).eligible, T.none)} /> : null}
      {entry.kind === 'structure' || entry.kind === 'tool' ? <EquipmentFacts e={entry as EquipmentEntry} /> : null}
      <section class="guide-section" aria-label={T.generalBiology}>
        <h3>{T.generalBiology}</h3>
        <p data-testid="guide-biology">{entry.biology}</p>
      </section>
      <section class="guide-section" aria-label={T.rulesOfGame}>
        <h3>{T.rulesOfGame}</h3>
        <p data-testid="guide-rules">{entry.rules}</p>
      </section>
      {/* A structure's example is already its Watch for line (the tray's mapping); a tool has both. */}
      {entry.kind !== 'structure' ? <Fact label={T.example} value={entry.example} testid="guide-example" /> : null}
      <Seen records={seen} nameOf={nameOf} notNoted={entry.kind === 'module' ? T.seenModule((entry as ModuleEntry).notes) : T.seenNotNoted} />
    </article>
  );
}

const KIND_WORDS: Readonly<Record<string, string>> = {
  module: 'Ability (can be inherited)',
  material: 'Material',
  structure: 'Structure',
  tool: 'Tool',
  habitat: 'Habitat preset',
};

function links(items: readonly NamedLink[], none: string): string {
  return items.length > 0 ? items.map((i) => i.text).join(', ') : none;
}

function Fact({ label, value, testid }: { label: string; value: string | JSX.Element; testid?: string }) {
  return (
    <div class="guide-fact" data-testid={testid}>
      <h3>{label}</h3>
      <p>{value}</p>
    </div>
  );
}

function SpeciesFacts({ s }: { s: SpeciesEntry }) {
  return (
    <div class="guide-facts">
      <Fact label={T.diet} value={s.diet} />
      <Fact label={T.habitat} value={s.habitat} />
      <Fact label={T.preferred} value={`${s.ranges.join(' · ')}. ${T.fictional}`} />
      {s.hunts ? <Fact label={T.prey} value={links(s.prey, T.noneEnabled)} testid="guide-prey" /> : null}
      <Fact label={T.predators} value={links(s.predators, T.none)} testid="guide-predators" />
      {s.targetsHosts ? <Fact label={T.hosts} value={links(s.hosts, T.noneEnabled)} testid="guide-hosts" /> : null}
      {s.parasites.length > 0 ? <Fact label={T.parasites} value={links(s.parasites, T.none)} testid="guide-parasites" /> : null}
      <Fact label={T.products} value={s.products.length > 0 ? `${s.products.join('; ')}.` : T.none} />
      <Fact label={T.abilities} value={links(s.abilities, T.abilitiesNone)} />
    </div>
  );
}

function EquipmentFacts({ e }: { e: EquipmentEntry }) {
  return (
    <div class="guide-facts" data-testid="guide-equipment">
      <Fact label={T.changes} value={e.changes ?? ''} testid="guide-changes" />
      <Fact label={T.doesNotChange} value={e.doesNotChange ?? ''} testid="guide-unchanged" />
      <Fact label={T.watchFor} value={e.watchFor ?? ''} testid="guide-watch" />
    </div>
  );
}

/** `records` null: an entry no relationship is ever noted about (modules, structures, tools, habitats). */
function Seen({ records, nameOf, notNoted }: { records: readonly RelationshipRecord[] | null; nameOf: (id: string) => string; /** The line when `records` is null. */ notNoted: string }) {
  const badges = records ? badgesFrom(records) : [];
  return (
    <section class="guide-section guide-seen" aria-label={T.seen} data-testid="guide-seen">
      <h3>{T.seen}</h3>
      {records === null ? (
        <p>{notNoted}</p>
      ) : records.length === 0 ? (
        <p>{T.seenNone}</p>
      ) : (
        <ul>
          {records.map((r) => {
            const text = relationshipSentence(r.relationshipId, nameOf);
            return text ? (
              <li key={r.relationshipId} data-testid={`seen-${r.relationshipId}`}>
                {text}, {T.seenIn(r.dishName, simTime(r.second * 10))}
              </li>
            ) : null;
          })}
        </ul>
      )}
      {badges.length > 0 ? <BadgeList badges={badges} /> : null}
    </section>
  );
}

function BadgeList({ badges }: { badges: readonly Badge[] }) {
  return (
    <ul class="guide-badges" aria-label={T.badges}>
      {badges.map((b) => (
        <li key={b.kind} class="guide-badge" data-testid={`badge-${b.kind}`}>
          <BadgeMark />
          <span>
            <strong>{BADGE_COPY[b.kind]?.name ?? b.kind}</strong> — {BADGE_COPY[b.kind]?.meaning ?? ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function BadgeMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" class="icon">
      <circle cx="12" cy="10" r="6" />
      <path d="M8.5 15 7 21l5-2.5 5 2.5-1.5-6" />
    </svg>
  );
}

function BadgesCard({ records, storageOk }: { records: readonly RelationshipRecord[]; storageOk: boolean }) {
  const badges = badgesFrom(records);
  return (
    <section class="card guide-badges-card" aria-labelledby="guide-badges-title" data-testid="guide-badges">
      <h2 id="guide-badges-title">{T.badges}</h2>
      <p>{T.badgesIntro}</p>
      {!storageOk ? <p>{T.storeUnavailable}</p> : badges.length === 0 ? <p>{T.badgesNone}</p> : <BadgeList badges={badges} />}
    </section>
  );
}

function Glossary({ q }: { q: string }) {
  const items = GLOSSARY.filter((g) => q === '' || g.term.toLowerCase().includes(q) || g.meaning.toLowerCase().includes(q));
  return (
    <section class="card guide-glossary" aria-labelledby="guide-glossary-title" data-testid="guide-glossary">
      <h2 id="guide-glossary-title">{GUIDE_TABS[3]!.label}</h2>
      <p>{T.glossaryIntro}</p>
      {items.length === 0 ? (
        <p>{T.noMatch(q)}</p>
      ) : (
        <dl>
          {items.map((g) => (
            <div key={g.term} class="guide-term">
              <dt>{g.term}</dt>
              <dd>{g.meaning}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function Thumb({ asset }: { asset: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    void loadAtlas()
      .then((a) => {
        if (ref.current) drawFrame(ref.current, a, asset);
      })
      .catch(() => undefined);
  }, [asset]);
  return <canvas ref={ref} width={48} height={48} aria-hidden="true" class="guide-thumb" />;
}
