/**
 * P4.8c journey (SPEC §13.5; D02 §20; D07 line 107; D09 line 134): Garden → More → Make a challenge (keep
 * Sprinters alive 60 s; allowed: Feed only; up to 2 actions) → Save → More → Start challenge: the
 * restrictions show first → Start: a paused challenge turn → Add Life is refused with the challenge's words
 * and the worker hash is unchanged → two feeds are accepted, the third is refused → Undo → one feed is
 * accepted again → Export challenge downloads a file whose checksum is the baseline's, and importing it
 * offers "Start challenge". No serious axe violations on the editor and the start sheet; controls ≥ 48 px.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PROTOCOL_VERSION } from '../../src/worker/protocol';
import { expectNoSeriousA11yViolations, startGarden, tapViewport } from './helpers';

/** Wrap Worker (as tests/e2e/lab-tools.spec.ts does) and follow the open dish, including challenge turns. */
async function watchWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { Worker: typeof Worker; __pm: { workers: Worker[]; dishId: string | null; next: number } };
    const Orig = w.Worker;
    w.__pm = { workers: [], dishId: null, next: 1_000_000_000 };
    w.Worker = class extends Orig {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        w.__pm.workers.push(this);
        this.addEventListener('message', (e: MessageEvent<{ type?: string; info?: { dishId: string } }>) => {
          const t = e.data?.type;
          if ((t === 'ready' || t === 'loaded' || t === 'tryStarted' || t === 'challengeStarted') && e.data.info) w.__pm.dishId = e.data.info.dishId;
        });
      }
    };
  });
}

/** The open dish's state hash, asked of the worker with the read-only 'hash' request. */
async function workerHash(page: Page): Promise<string> {
  return page.evaluate(async (protocolVersion) => {
    const pm = (window as unknown as { __pm: { workers: Worker[]; dishId: string | null; next: number } }).__pm;
    const worker = pm.workers[pm.workers.length - 1];
    if (!worker || !pm.dishId) throw new Error('no worker or dish yet');
    const requestId = pm.next++;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no hash reply')), 10_000);
      const on = (e: MessageEvent<{ type: string; requestId?: number; hash?: string; message?: string }>) => {
        if (e.data?.requestId !== requestId) return;
        worker.removeEventListener('message', on);
        clearTimeout(timer);
        if (e.data.type === 'hash' && e.data.hash) resolve(e.data.hash);
        else reject(new Error(e.data.message ?? e.data.type));
      };
      worker.addEventListener('message', on);
      worker.postMessage({ type: 'hash', requestId, dishId: pm.dishId, protocolVersion });
    });
  }, PROTOCOL_VERSION);
}

async function expectTargets(page: Page, selector: string): Promise<void> {
  for (const el of await page.locator(selector).all()) {
    if (!(await el.isVisible())) continue;
    expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  }
}

const status = (page: Page, text: string | RegExp) => page.getByRole('status').filter({ hasText: text });

async function openMore(page: Page): Promise<void> {
  if (!(await page.getByTestId('more-challenge').isVisible())) await page.getByTestId('more').click();
  await expect(page.getByTestId('more-challenge')).toBeVisible();
}

/** One sugar dose by tapping the dish (Feed → Place sugar → tap); the tool returns to Look. */
async function feedOnce(page: Page, fx: number, fy: number): Promise<void> {
  await page.getByTestId('action-feed').click();
  await page.getByTestId('feed-choose').click();
  await tapViewport(page, fx, fy);
}

const FEED_ONLY = 'Allowed: Feed. Up to 2 actions. Inspecting and looking are always free. These limits apply only inside this challenge.';

test('custom challenge: make, start with the restrictions first, refusals, budget and Undo, export and import', async ({ page }) => {
  test.setTimeout(300_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await watchWorker(page);
  await startGarden(page);

  // More → Make a challenge…: the editor (typed choices only).
  await openMore(page);
  await page.getByTestId('more-challenge').click();
  const editor = page.getByTestId('challenge-editor');
  await expect(editor).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Keep a kind alive/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Move material across a gate/ })).toBeDisabled();
  await expect(page.getByTestId('ch-type-transferAcrossGate')).toContainText('This dish has no gate to measure.');
  await page.getByTestId('ch-name').fill('Keep Sprinters going');
  await page.getByTestId('ch-species').selectOption('B01');
  await page.getByTestId('ch-duration').fill('60');
  for (const t of ['addLife', 'habitat', 'sample', 'cleanWater', 'lid', 'evolution']) await page.getByTestId(`ch-tool-${t}`).locator('input').uncheck();
  await expect(page.getByTestId('ch-tool-feed').locator('input')).toBeChecked();
  await page.getByTestId('ch-budget').fill('2');
  await expect(page.getByTestId('ch-restrictions')).toHaveText(FEED_ONLY);
  await expectTargets(page, '.ch-sheet .goal-choice, .ch-sheet .btn, .ch-sheet input:not([type=checkbox]):not([type=radio]), .ch-sheet select');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('ch-save').click();
  await expect(editor).toHaveCount(0);
  await expect(status(page, 'Challenge “Keep Sprinters going” saved. Start it from More.')).toBeVisible();

  // More → Start challenge: the restrictions show before Start.
  await openMore(page);
  await expect(page.getByTestId('more-challenge-start')).toHaveText('Start challenge: Keep Sprinters going');
  await page.getByTestId('more-challenge-start').click();
  const start = page.getByTestId('challenge-start');
  await expect(start).toBeVisible();
  await expect(page.getByTestId('ch-start-restrictions')).toHaveText(FEED_ONLY);
  await expect(page.getByTestId('ch-start-goal')).toHaveText('Keep at least one Sprinter alive for 60 s of dish time.');
  await expect(page.getByTestId('ch-start')).toBeEnabled();
  await expectTargets(page, '.ch-sheet .btn');
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('ch-start').click();
  await expect(start).toHaveCount(0);
  await expect(page.getByTestId('try-badge')).toHaveText('Challenge · Turn 1 · 3:00 left');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const h0 = await workerHash(page);

  // Add Life is refused with the challenge's words; the dish is unchanged.
  await page.getByTestId('action-addlife').click();
  await page.getByTestId('species-B01').click();
  await tapViewport(page, 0.5, 0.5);
  await expect(status(page, "This challenge doesn't allow Add Life. The limit applies only inside this challenge.")).toBeVisible();
  expect(await workerHash(page)).toBe(h0);

  // Two feeds are accepted; the third is refused (the dish unchanged by it).
  await feedOnce(page, 0.62, 0.3);
  await expect(status(page, /Added sugar to \d+ cells/)).toBeVisible();
  await feedOnce(page, 0.38, 0.62);
  await expect(status(page, /Added sugar to \d+ cells/)).toBeVisible();
  const h2 = await workerHash(page);
  expect(h2).not.toBe(h0);
  await feedOnce(page, 0.62, 0.62);
  await expect(status(page, "This challenge's 2 actions are used.")).toBeVisible();
  expect(await workerHash(page)).toBe(h2);

  // Undo gives one action back: one feed is accepted again, and the next is refused.
  await page.getByRole('navigation', { name: 'Actions' }).getByRole('button', { name: 'Undo (rewinds time)' }).click();
  await expect(status(page, 'Undone')).toBeVisible();
  // The goal is evaluated as any goal: Undo ends the attempt (D-0078); dismiss its sentence.
  await expect(page.getByText('Keep Sprinters going: Undo rewound the dish, so this attempt ended. The dish keeps going.')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss this goal sentence' }).click();
  await feedOnce(page, 0.7, 0.4); // open water (a stone sits near the centre-right on wide screens)
  await expect(status(page, /Added sugar to \d+ cells/)).toBeVisible();
  await feedOnce(page, 0.5, 0.75);
  await expect(status(page, "This challenge's 2 actions are used.")).toBeVisible();

  // Export challenge: the baseline save with only this challenge; its checksum is the challenge's baseline checksum.
  await openMore(page);
  const download = page.waitForEvent('download');
  await page.getByTestId('more-challenge-export').click();
  const path = await (await download).path();
  const file = JSON.parse(readFileSync(path, 'utf8')) as { checksum: string; tick: number; notebook: { challenges: { id: string; name: string; baseline: { checksum: string }; allowedTools: string[]; commandBudget: number }[] } };
  expect(file.notebook.challenges).toHaveLength(1);
  expect(file.notebook.challenges[0]).toMatchObject({ id: 'ch-1', name: 'Keep Sprinters going', allowedTools: ['feed'], commandBudget: 2 });
  expect(file.notebook.challenges[0]!.baseline.checksum).toBe(file.checksum);

  // Import it (the ordinary Import): the dish opens paused and offers Start challenge, which can start.
  await openMore(page);
  await page.locator('input[aria-label="Import a dish file"]').setInputFiles(path);
  await expect(status(page, /Imported “.*” — paused\./)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('try-badge')).toHaveCount(0);
  await openMore(page);
  await expect(page.getByTestId('more-challenge-start')).toHaveText('Start challenge: Keep Sprinters going');
  await page.getByTestId('more-challenge-start').click();
  await expect(page.getByTestId('ch-start-restrictions')).toHaveText(FEED_ONLY);
  await expect(page.getByTestId('ch-start')).toBeEnabled();
  await expect(page.getByTestId('ch-start-refusal')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('challenge-start')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
