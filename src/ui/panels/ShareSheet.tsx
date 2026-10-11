/**
 * P4.6 Share sheet (UX §5.10; SPEC §14.4; D09 lines 140-160; D-0080). Three labelled choices with their
 * one-line descriptions, a preview and options for the chosen one, and one Share button that hands the
 * file to the OS share sheet or saves it. Opening it paused the dish (src/ui/share.ts openShare); closing
 * it restores the prior speed. Nothing here changes the world: the picture is drawn from a copy of the
 * latest snapshot, and the recipe and living-dish files are read-only worker answers.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { IconClose, IconCopy } from '../icons';
import { loadAtlas, type LoadedAtlas } from '../atlas';
import { dishClock, dishInfo, getClient } from '../state';
import { copyText } from './WhatIfState';
import {
  closeShare,
  deliverFile,
  dishFile,
  makePicture,
  PICTURE_DEFAULTS,
  paintPicture,
  pictureFile,
  pictureInputNow,
  pictureOptionsFor,
  restoreShareSpeed,
  shareRequest,
  type ShareOutcome,
} from '../share';
import { fileSizeText, SHARE_CHOICES, SHARE_TEXT, type ShareChoice } from '../strings/share';

/** Share glyph (ARCH §10.2 style): a box with an arrow leaving it. */
export function IconShare() {
  return (
    <svg
      class="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
      <path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2" />
    </svg>
  );
}

type RecipeState =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ok';
      readonly text: string;
      readonly filename: string;
      readonly name: string;
      readonly question: string | null;
      readonly identity: string | null;
      readonly versions: {
        readonly simulationVersion: number;
        readonly evolutionRulesVersion: number;
        readonly contentVersion: number;
      };
    }
  | { readonly kind: 'none'; readonly message: string };

function outcomeText(o: ShareOutcome, filename: string): string {
  return o === 'shared'
    ? SHARE_TEXT.shared
    : o === 'saved'
      ? SHARE_TEXT.saved(filename)
      : SHARE_TEXT.cancelled;
}

export function ShareSheet() {
  const req = shareRequest.value;
  const info = dishInfo.value;
  const dishId = info?.dishId ?? '';
  const [choice, setChoice] = useState<ShareChoice>(req?.choice ?? 'picture');
  const [recipe, setRecipe] = useState<RecipeState>({ kind: 'loading' });
  const [question, setQuestion] = useState<string | null>(req?.question ?? null);
  const [hideLabels, setHideLabels] = useState(PICTURE_DEFAULTS.hideLabels);
  const [stripMetadata, setStripMetadata] = useState(PICTURE_DEFAULTS.stripMetadata);
  const [picNicknames, setPicNicknames] = useState(PICTURE_DEFAULTS.includeNicknames);
  const [legend, setLegend] = useState(PICTURE_DEFAULTS.legend);
  const [stripNames, setStripNames] = useState(false);
  const [livingNicknames, setLivingNicknames] = useState(false);
  const [livingBytes, setLivingBytes] = useState<number | null>(null);
  const [atlas, setAtlas] = useState<LoadedAtlas | null>(null);
  const [atlasFailed, setAtlasFailed] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The picture is the dish as it was published when the sheet opened (the dish is paused meanwhile).
  const input = useMemo(() => pictureInputNow(), []);

  useEffect(() => {
    headingRef.current?.focus();
    let live = true;
    void getClient()
      .recipeExport(dishId)
      .then((r) => {
        if (!live) return;
        setRecipe({
          kind: 'ok',
          text: r.text,
          filename: r.filename,
          name: r.name,
          question: r.question,
          identity: r.identity,
          versions: r.versions,
        });
        setQuestion((q) => (q === null ? (r.question ?? '') : q));
      })
      .catch((e: Error) => {
        if (!live) return;
        setRecipe({ kind: 'none', message: e.message });
        setQuestion((q) => (q === null ? '' : q));
      });
    void loadAtlas()
      .then((a) => live && setAtlas(a))
      .catch(() => live && setAtlasFailed(true));
    // However the sheet goes away, the dish's prior run state comes back once.
    return () => {
      live = false;
      restoreShareSpeed();
    };
  }, []);

  // Living dish: the file's size as it would be written now with these options.
  useEffect(() => {
    if (choice !== 'living') return;
    let live = true;
    setLivingBytes(null);
    void getClient()
      .exportDish(dishId, stripNames, livingNicknames && !stripNames)
      .then((r) => live && setLivingBytes(new Blob([r.text]).size))
      .catch(() => live && setLivingBytes(null));
    return () => {
      live = false;
    };
  }, [choice, stripNames, livingNicknames]);

  const identity = recipe.kind === 'ok' ? recipe.identity : null;
  const picOpts = input
    ? pictureOptionsFor(
        {
          question: question ?? '',
          hideLabels,
          stripMetadata,
          includeNicknames: picNicknames,
          legend,
          fromStory: req?.fromStory === true,
        },
        { name: info?.name ?? '', tick: input.tick, identity },
      )
    : null;

  useEffect(() => {
    if (choice !== 'picture' || !atlas || !input || !picOpts || !canvasRef.current) return;
    try {
      paintPicture(canvasRef.current, input, atlas, picOpts);
    } catch {
      setAtlasFailed(true);
    }
  }, [choice, atlas, input, question, hideLabels, stripMetadata, picNicknames, legend, identity]);

  if (!info) return null;

  const share = async () => {
    if (working) return;
    setWorking(true);
    setStatus(SHARE_TEXT.working);
    try {
      let outcome: ShareOutcome;
      let filename: string;
      if (choice === 'picture') {
        if (!input || !picOpts) throw new Error(SHARE_TEXT.pictureUnavailable);
        const f = pictureFile(await makePicture(input, picOpts));
        filename = f.filename;
        outcome = await deliverFile(f);
      } else if (choice === 'recipe') {
        if (recipe.kind !== 'ok')
          throw new Error(recipe.kind === 'none' ? recipe.message : SHARE_TEXT.recipeReading);
        const f = dishFile(recipe.text, recipe.filename, recipe.name);
        filename = f.filename;
        outcome = await deliverFile(f);
      } else {
        const r = await getClient().exportDish(dishId, stripNames, livingNicknames && !stripNames);
        const f = dishFile(r.text, r.filename, info.name);
        filename = f.filename;
        outcome = await deliverFile(f);
      }
      setStatus(outcomeText(outcome, filename));
    } catch (e) {
      setStatus(SHARE_TEXT.failed((e as Error).message));
    } finally {
      setWorking(false);
    }
  };

  const recipeDisabled = recipe.kind === 'none';
  const shareDisabled =
    working ||
    (choice === 'recipe' && recipe.kind !== 'ok') ||
    (choice === 'picture' && (!input || atlasFailed));

  return (
    <section class="sheet share-sheet" aria-labelledby="share-title" data-testid="share-sheet">
      <div class="sheet-scroll">
        <header>
          <h2 id="share-title" ref={headingRef} tabIndex={-1}>
            {SHARE_TEXT.title}
          </h2>
          <button class="btn ghost" aria-label="Close" onClick={closeShare} data-testid="share-close">
            <IconClose />
          </button>
        </header>
        <p class="sub">
          {SHARE_TEXT.intro} {SHARE_TEXT.paused}
        </p>
        <fieldset class="share-choices">
          <legend class="sr-only">What to share</legend>
          {SHARE_CHOICES.map((c) => {
            const disabled = c.id === 'recipe' && recipeDisabled;
            const reasonId = `share-reason-${c.id}`;
            return (
              <label
                key={c.id}
                class={`share-choice${choice === c.id ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
                data-testid={`share-choice-${c.id}`}
              >
                <input
                  type="radio"
                  name="share-choice"
                  value={c.id}
                  checked={choice === c.id}
                  disabled={disabled}
                  aria-describedby={disabled ? reasonId : undefined}
                  onChange={() => {
                    setChoice(c.id);
                    setStatus(null);
                  }}
                />
                <span class="share-choice-text">
                  <strong>{c.label}</strong>
                  <span>{c.line}</span>
                  {disabled && recipe.kind === 'none' ? (
                    <span id={reasonId} class="share-reason" data-testid="share-recipe-reason">
                      {recipe.message}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>

        {choice === 'picture' ? (
          <div class="share-options" data-testid="share-picture">
            {req?.fromStory ? <p class="constraint">{SHARE_TEXT.storyTime}</p> : null}
            <div class="share-preview">
              {input && !atlasFailed ? (
                <canvas
                  ref={canvasRef}
                  width={1080}
                  height={1080}
                  role="img"
                  aria-label={SHARE_TEXT.pictureAlt(dishClock(input.tick))}
                  data-testid="share-picture-preview"
                />
              ) : (
                <p class="sub">{SHARE_TEXT.pictureUnavailable}</p>
              )}
              {input && !atlas && !atlasFailed ? <p class="sub">{SHARE_TEXT.pictureWaiting}</p> : null}
            </div>
            <label class="share-field">
              {SHARE_TEXT.question}
              <input
                type="text"
                maxLength={120}
                value={question ?? ''}
                onInput={(e) => setQuestion(e.currentTarget.value)}
                data-testid="share-question"
              />
            </label>
            <label class="fav-share-option">
              <input
                type="checkbox"
                checked={hideLabels}
                onChange={(e) => setHideLabels(e.currentTarget.checked)}
                data-testid="share-hide-labels"
              />
              <span>
                {SHARE_TEXT.hideLabels} <span class="sub">— {SHARE_TEXT.hideLabelsHint}</span>
              </span>
            </label>
            <label class="fav-share-option">
              <input
                type="checkbox"
                checked={stripMetadata}
                onChange={(e) => setStripMetadata(e.currentTarget.checked)}
                data-testid="share-strip-metadata"
              />
              <span>
                {SHARE_TEXT.stripMetadata} <span class="sub">— {SHARE_TEXT.stripMetadataHint}</span>
              </span>
            </label>
            <label class="fav-share-option">
              <input
                type="checkbox"
                checked={legend}
                onChange={(e) => setLegend(e.currentTarget.checked)}
                data-testid="share-legend"
              />
              {SHARE_TEXT.legend}
            </label>
            <label class="fav-share-option">
              <input
                type="checkbox"
                checked={picNicknames}
                onChange={(e) => setPicNicknames(e.currentTarget.checked)}
                data-testid="share-picture-nicknames"
              />
              {SHARE_TEXT.includeNicknames}
            </label>
          </div>
        ) : null}

        {choice === 'recipe' ? (
          <div class="share-options" data-testid="share-recipe">
            {recipe.kind === 'loading' ? <p class="sub">{SHARE_TEXT.recipeReading}</p> : null}
            {recipe.kind === 'ok' ? (
              <>
                <p>
                  <strong>{recipe.name}</strong>
                </p>
                {recipe.identity ? (
                  <div class="share-identity">
                    <code data-testid="share-recipe-identity">{recipe.identity}</code>
                    <button
                      class="btn"
                      onClick={() =>
                        void copyText(recipe.identity!).then((ok) =>
                          setCopied(ok ? SHARE_TEXT.copied : SHARE_TEXT.copyFailed),
                        )
                      }
                      data-testid="share-copy-recipe"
                    >
                      <IconCopy /> {SHARE_TEXT.copyDetails}
                    </button>
                  </div>
                ) : (
                  <p class="sub">{SHARE_TEXT.recipeCustom}</p>
                )}
                {copied ? (
                  <p class="sub" role="status">
                    {copied}
                  </p>
                ) : null}
                <p class="sub" data-testid="share-recipe-versions">
                  {SHARE_TEXT.recipeVersions(
                    recipe.versions.simulationVersion,
                    recipe.versions.evolutionRulesVersion,
                    recipe.versions.contentVersion,
                  )}
                </p>
              </>
            ) : null}
          </div>
        ) : null}

        {choice === 'living' ? (
          <div class="share-options" data-testid="share-living">
            <p data-testid="share-living-line">
              {SHARE_TEXT.livingLine(
                info.name,
                dishClock(input?.tick ?? info.tick),
                livingBytes === null ? '…' : fileSizeText(livingBytes),
              )}
            </p>
            <p class="constraint">{SHARE_TEXT.livingNote}</p>
            <label class="fav-share-option">
              <input
                type="checkbox"
                checked={stripNames}
                onChange={(e) => setStripNames(e.currentTarget.checked)}
                data-testid="share-strip-names"
              />
              <span>
                {SHARE_TEXT.stripNames} <span class="sub">— {SHARE_TEXT.stripNamesHint}</span>
              </span>
            </label>
            <label class="fav-share-option">
              <input
                type="checkbox"
                checked={livingNicknames && !stripNames}
                disabled={stripNames}
                onChange={(e) => setLivingNicknames(e.currentTarget.checked)}
                data-testid="share-living-nicknames"
              />
              {SHARE_TEXT.includeNicknames}
            </label>
          </div>
        ) : null}

        <button
          class="btn primary share-go"
          disabled={shareDisabled}
          onClick={() => void share()}
          data-testid="share-go"
        >
          {SHARE_TEXT.share}
        </button>
        <p class="sub share-status" role="status" aria-live="polite" data-testid="share-status">
          {status ?? ''}
        </p>
      </div>
    </section>
  );
}
