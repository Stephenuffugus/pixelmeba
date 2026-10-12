/**
 * Notebook → Gallery (P4.8b; UX §2; SPEC §12.8 "specimen gallery (image + species + inspector summary; never
 * spawns)"; D02 §20 "Gallery images do not spawn organisms or alter inventory"). Each entry shows its picture
 * (re-drawn from the stored crop), the species name, the inspector lines as they were shown, the dish time and
 * Delete only: no entry has a way to add anything to a dish. Kept with each dish (D-0070).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { autosave, dishInfo, getClient } from '../state';
import { notebook } from '../favorites';
import { galleryOf, type GalleryEntry } from '@persist/notebookGallery';
import { bookmarkClock } from '@persist/notebookBookmarks';
import { composePicture, drawPicture } from '@render/picture';
import { loadAtlas } from '../atlas';
import { deleteSpecimen, GALLERY_PICTURE_PX, galleryPicture } from '../gallery';
import { GALLERY_UI } from '../strings/notebookTools';

function SpecimenPicture({ entry, alt }: { entry: GalleryEntry; alt: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const info = dishInfo.value;
  useEffect(() => {
    let cancelled = false;
    if (!info) return;
    const pic = galleryPicture(entry, { ids: info.speciesIds, assets: info.speciesAssets, names: info.speciesNames });
    if (!pic) return;
    void loadAtlas()
      .then((atlas) => {
        const canvas = ref.current;
        if (cancelled || !canvas) return;
        const list = composePicture(pic.input, atlas.manifest, pic.options);
        canvas.width = list.width;
        canvas.height = list.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) drawPicture(ctx, list, atlas.image);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [entry.id, info?.dishId]);
  return <canvas ref={ref} class="gallery-picture" width={GALLERY_PICTURE_PX} height={GALLERY_PICTURE_PX} role="img" aria-label={alt} data-testid="gallery-picture" />;
}

export function NotebookGallery() {
  const info = dishInfo.value;
  const nb = notebook.value;
  const [confirm, setConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (!info) return <p class="nb-empty">{GALLERY_UI.noDish}</p>;
  if (!nb) return <p class="nb-empty">{GALLERY_UI.reading}</p>;
  const list = [...galleryOf(nb)].reverse();
  const speciesName = (id: string) => info.speciesNames[info.speciesIds.indexOf(id)] ?? id;
  return (
    <>
      <p class="nb-intro">{list.length === 0 ? GALLERY_UI.none : GALLERY_UI.intro(info.name)}</p>
      {message ? (
        <p class="constraint" role="status">
          {message}
        </p>
      ) : null}
      <ul class="nb-cards gallery-list" aria-label="Gallery" data-testid="gallery-list">
        {list.map((e) => {
          const name = speciesName(e.speciesId);
          const time = bookmarkClock(e.tick);
          return (
            <li key={e.id} data-testid="gallery-entry">
              <article class="card nb-card gallery-card" aria-labelledby={`gal-${e.id}`}>
                <SpecimenPicture entry={e} alt={GALLERY_UI.pictureAlt(name, e.birthId, time)} />
                <div>
                  <h2 id={`gal-${e.id}`}>
                    {name} <span class="sub">#{e.birthId}</span>
                  </h2>
                  <p class="sub">Dish time {time}</p>
                  <ul class="gallery-summary" aria-label="What the inspector showed" data-testid="gallery-summary">
                    {e.summary.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                  <div class="nb-actions">
                    {confirm === e.id ? (
                      <>
                        <p class="sub" id={`gal-del-${e.id}`}>
                          {GALLERY_UI.deleteQuestion}
                        </p>
                        <button
                          class="btn"
                          style={{ color: 'var(--danger)' }}
                          aria-describedby={`gal-del-${e.id}`}
                          data-testid="gallery-delete-confirm"
                          onClick={() => {
                            setConfirm(null);
                            void deleteSpecimen(getClient(), info.dishId, e.id).then((r) => {
                              if (r.record && dishInfo.value?.dishId === info.dishId) notebook.value = r.record;
                              if (r.refused === null) void autosave();
                              setMessage(r.refused ?? GALLERY_UI.deleted);
                            });
                          }}
                        >
                          {GALLERY_UI.deleteConfirm}
                        </button>
                        <button class="btn" data-testid="gallery-keep" onClick={() => setConfirm(null)}>
                          {GALLERY_UI.keep}
                        </button>
                      </>
                    ) : (
                      <button class="btn" aria-label={`Delete ${name} #${e.birthId} from the gallery…`} data-testid="gallery-delete" onClick={() => setConfirm(e.id)}>
                        {GALLERY_UI.delete}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </>
  );
}
