/**
 * P4.6 Import recipe ID (UX §2 "Import recipe ID"; D09 "Bundled recipe identifiers"; SPEC §14.4): one
 * text field and Start. The worker resolves only exact bundled ids, revisions and valid seeds; a variant
 * starts as What if? starts it, a recipe as the Play shelf / New Dish starts it with that seed, paused,
 * after the open dish is kept (D-0033). A refusal is shown here, exactly as the worker words it, and
 * changes nothing.
 */
import { useState } from 'preact/hooks';
import { busy, startRecipeId } from '../state';
import { RECIPE_ID_TEXT } from '../strings/share';

export function RecipeIdImport({ idPrefix }: { readonly idPrefix: string }) {
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const fieldId = `${idPrefix}-recipe-id`;
  const hintId = `${idPrefix}-recipe-id-hint`;
  const msgId = `${idPrefix}-recipe-id-msg`;
  const start = async () => {
    if (working) return;
    if (text.trim().length === 0) {
      setMessage(RECIPE_ID_TEXT.empty);
      return;
    }
    setWorking(true);
    setMessage(null);
    try {
      const outcome = await startRecipeId(text);
      if (outcome.kind === 'refused') setMessage(outcome.message);
    } finally {
      setWorking(false);
    }
  };
  return (
    <section
      class="card recipe-id"
      aria-labelledby={`${idPrefix}-recipe-id-title`}
      data-testid="recipe-id-import"
    >
      <h2 id={`${idPrefix}-recipe-id-title`}>{RECIPE_ID_TEXT.title}</h2>
      <p id={hintId} class="sub">
        {RECIPE_ID_TEXT.hint}
      </p>
      <form
        class="recipe-id-row"
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <label for={fieldId} class="sr-only">
          {RECIPE_ID_TEXT.label}
        </label>
        <input
          id={fieldId}
          type="text"
          maxLength={80}
          autoComplete="off"
          spellcheck={false}
          placeholder="R-G3 / revision 1 / seed 104729"
          value={text}
          aria-describedby={message ? `${hintId} ${msgId}` : hintId}
          aria-invalid={message !== null && message !== RECIPE_ID_TEXT.empty ? true : undefined}
          onInput={(e) => {
            setText(e.currentTarget.value);
            if (message) setMessage(null);
          }}
          data-testid="recipe-id-input"
        />
        <button
          class="btn primary"
          type="submit"
          disabled={working || busy.value}
          data-testid="recipe-id-start"
        >
          {working ? RECIPE_ID_TEXT.starting : RECIPE_ID_TEXT.start}
        </button>
      </form>
      <p
        id={msgId}
        class="constraint recipe-id-msg"
        role="alert"
        hidden={message === null}
        data-testid="recipe-id-message"
      >
        {message ?? ''}
      </p>
    </section>
  );
}
