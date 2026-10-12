/**
 * P4.8b the specimen gallery (SPEC §12.8 "specimen gallery (image + species + inspector summary; never
 * spawns)"; D02 §20 "Gallery images do not spawn organisms or alter inventory"; CT §12.10 "gallery 100").
 *
 * - static: src/ui/gallery.ts and src/ui/views/NotebookGallery.tsx import no command path (no
 *   @sim/commands, no sendCommand, no Add Life or Sample module) and the gallery view's only buttons are
 *   Delete…, its confirmation and Keep;
 * - behaviour: an entry built from a real dish's published snapshot and inspector answer is valid, holds no
 *   organism data beyond the crop, and saving it through the only gallery request ('galleryAdd') leaves the
 *   dish exactly as it was (stateHash, command log, birth counter, living count);
 * - the picture re-drawn from the stored crop is a bare 224 × 224 list with the specimen's sprite;
 * - the 100 limit copy.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { galleryEntryProblem, galleryOf, GALLERY_MAX, GALLERY_TEXT } from '../../src/persistence/notebookGallery';
import type { NotebookRecord } from '../../src/persistence/notebook';
import { composePicture } from '../../src/render/picture';
import type { AtlasManifestLike } from '../../src/render/renderer';
import { stateHash } from '../../src/sim/serialize';
import { DishHost } from '../../src/worker/host';
import type { EntityInspect, FromWorker, GalleryEntryInput, SnapshotMsg, ToWorker } from '../../src/worker/protocol';
import { buildGalleryEntry, GALLERY_PICTURE_PX, galleryPicture, saveSpecimen, type GalleryClient } from '../../src/ui/gallery';
import { registry } from '../helpers/world';

const REG = registry();
const manifest = JSON.parse(readFileSync('public/atlas/manifest.json', 'utf8')) as AtlasManifestLike;

/** The module specifiers a source file imports. */
function importsOf(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  return Array.from(text.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gmu), (m) => m[1]!);
}

/** The names a source file imports from `spec`. */
function namesFrom(path: string, spec: string): string[] {
  const text = readFileSync(path, 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/gmu)) if (m[2] === spec) out.push(...m[1]!.split(',').map((n) => n.trim().replace(/^type\s+/u, '')).filter(Boolean));
  return out;
}

const COMMAND_PATHS = ['@sim/commands', '@sim/tick', '@sim/sample', '../panels/AddLifeSheet', './panels/AddLifeSheet', '../panels/SampleSession', '../feed'];
const COMMAND_NAMES = ['sendCommand', 'undo', 'setTool', 'startCustom', 'startRecipe', 'queueOnB', 'importFile', 'loadSlot'];

describe('the gallery exposes no command and no spawn path', () => {
  it('static: gallery.ts and NotebookGallery.tsx import no command path; the view’s only buttons are Delete…, its confirmation and Keep', () => {
    for (const file of ['src/ui/gallery.ts', 'src/ui/views/NotebookGallery.tsx']) {
      const specs = importsOf(file);
      for (const p of COMMAND_PATHS) expect(specs, `${file} imports ${p}`).not.toContain(p);
      const fromState = namesFrom(file, '../state').concat(namesFrom(file, './state'));
      for (const n of COMMAND_NAMES) expect(fromState, `${file} imports ${n}`).not.toContain(n);
      const text = readFileSync(file, 'utf8');
      expect(text).not.toMatch(/\.command\(|commandAck\(|inoculate|applyNow|genomes\.|genomeId/u);
    }
    // gallery.ts reads no app state at all: the only worker requests are the GalleryClient's two notebook requests.
    expect(importsOf('src/ui/gallery.ts').some((s) => s.endsWith('/state') || s === './state')).toBe(false);
    const view = readFileSync('src/ui/views/NotebookGallery.tsx', 'utf8');
    expect((view.match(/<button/gu) ?? []).length).toBe(3);
    const ids = Array.from(view.matchAll(/data-testid="([^"]+)"/gu), (m) => m[1]).sort();
    expect(ids).toEqual(['gallery-delete', 'gallery-delete-confirm', 'gallery-entry', 'gallery-keep', 'gallery-list', 'gallery-picture', 'gallery-summary']);
  });

  it('behaviour: an entry from a real snapshot and inspector answer is valid, and saving it changes nothing in the dish', async () => {
    const out: FromWorker[] = [];
    const host = new DishHost(REG, (m) => out.push(m), { now: () => 0 });
    let req = 0;
    const send = (msg: ToWorker): FromWorker => {
      host.handle(msg);
      const id = (msg as { requestId: number }).requestId;
      return out.find((m) => (m as { requestId?: number }).requestId === id)!;
    };
    send({ type: 'create', requestId: ++req, dishId: 'd1', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
    const w = host.world('d1')!;
    for (let i = 0; i < 50; i++) host.handle({ type: 'step', dishId: 'd1' });
    const snaps = out.filter((m): m is SnapshotMsg => m.type === 'snapshot' && m.dishId === 'd1');
    const snap = snaps.at(-1)!;
    const geom = snaps.filter((s) => s.geometry).at(-1)!.geometry!;
    const birthId = snap.ids[0]!;
    const nb = send({ type: 'notebookGet', requestId: ++req, dishId: 'd1', inspect: birthId });
    if (nb.type !== 'notebook' || !nb.inspected) throw new Error('no inspector answer');
    const e: EntityInspect = nb.inspected;
    const name = w.species[e.speciesIdx]!.def.name;
    const entry = buildGalleryEntry(e, name, { tick: snap.tick, count: snap.count, ents: snap.ents.slice(), ids: snap.ids.slice(), substrate: geom.substrate.slice(), structure: geom.structure.slice(), shade: geom.shade.slice() })!;
    expect(entry).not.toBeNull();
    expect(galleryEntryProblem({ ...entry, id: 'gal-1' })).toBeNull();
    expect(Object.keys(entry).sort()).toEqual(['birthId', 'crop', 'speciesId', 'summary', 'tick']);
    expect(entry.summary[0]).toBe(`${name} #${birthId}`);
    expect(entry.crop.sprites[0]![0]).toBe(e.speciesIdx); // the specimen comes first
    expect(entry.crop.sprites.length).toBeGreaterThan(0);

    const before = { hash: stateHash(w), seq: w.commands.nextSeq, log: w.commands.log.length, births: w.counters.nextBirthId, alive: snap.count };
    const calls: string[] = [];
    const client: GalleryClient = {
      galleryAdd: (dishId: string, input: GalleryEntryInput) => {
        calls.push('galleryAdd');
        const r = send({ type: 'galleryAdd', requestId: ++req, dishId, entry: input });
        if (r.type !== 'notebook') throw new Error('no answer');
        return Promise.resolve(r);
      },
      galleryDelete: () => {
        calls.push('galleryDelete');
        return Promise.reject(new Error('not used'));
      },
    };
    const saved = await saveSpecimen(client, 'd1', entry);
    expect(saved.refused).toBeNull();
    expect(calls).toEqual(['galleryAdd']);
    const w2 = host.world('d1')!;
    expect(w2).toBe(w);
    expect({ hash: stateHash(w2), seq: w2.commands.nextSeq, log: w2.commands.log.length, births: w2.counters.nextBirthId }).toEqual({ hash: before.hash, seq: before.seq, log: before.log, births: before.births });
    host.handle({ type: 'step', dishId: 'd1' });
    const after = out.filter((m): m is SnapshotMsg => m.type === 'snapshot' && m.dishId === 'd1').at(-1)!;
    expect(after.events.filter((ev) => ev.type === 'introduce')).toEqual([]); // nothing was added to the dish
    const stored = galleryOf(saved.record as NotebookRecord)[0]!;
    expect(stored).toEqual({ ...entry, id: 'gal-1' });

    // The picture, re-drawn from the stored crop only.
    const pic = galleryPicture(stored, { ids: w.species.map((s) => s.id), assets: w.species.map((s) => s.def.assetId), names: w.species.map((s) => s.def.name) })!;
    const list = composePicture(pic.input, manifest, pic.options);
    expect(list.width).toBe(GALLERY_PICTURE_PX);
    expect(list.height).toBe(224);
    expect(list.items.some((it) => it.kind === 'text')).toBe(false);
    expect(list.items.filter((it) => it.kind === 'blit').length).toBeGreaterThan(0);
    expect(list.items.every((it) => it.kind !== 'pixels' || (it.x === 0 && it.y === 0 && it.w === 224))).toBe(true);
  });

  it(`the ${GALLERY_MAX} limit copy`, () => {
    expect(GALLERY_TEXT.full).toBe('This dish keeps 100 gallery specimens. Delete one to add another.');
  });
});
