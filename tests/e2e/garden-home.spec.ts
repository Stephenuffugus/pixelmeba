/**
 * P4.3 journey: Home → Play shows the Garden's live-state thumbnail (a canvas drawn from the worker's
 * preview of the start, not a painting); Start → the arrival line → Run → "Tap a Sprinter." → select;
 * the one optional prompt advances only with evidence; the Feed prompt's "Show me" highlights Feed
 * without pressing it (the worker's state hash is unchanged and no sheet opens); Save and leave → Home
 * shows the session memory (dish name, picture, dish time, one recorded change) → Continue opens the dish
 * paused at the same moment. The state hash is asked of the worker through the protocol's read-only
 * 'hash' request (an init script records the page's Worker; the app has no test hook).
 */
import { expect, test, type Page } from '@playwright/test';
import { PROTOCOL_VERSION } from '../../src/worker/protocol';
import { chooseSpeed, expectNoSeriousA11yViolations, expectReachable, seedSettings, selectOrganism, simSeconds } from './helpers';

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
          if ((e.data?.type === 'ready' || e.data?.type === 'loaded') && e.data.info) w.__pm.dishId = e.data.info.dishId;
        });
      }
    };
  });
}

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

const FEED_PROMPT = 'Try Feed: choose a food, see where it lands, then place it.';

test('Garden card thumbnail, the one optional prompt with Show me, and session memory on Save and leave', async ({ page }) => {
  test.setTimeout(300_000);
  await watchWorker(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await seedSettings(page, { showPrompts: true });
  await page.goto('/');

  // First launch, no saves: Play is offered, Continue is hidden (UX §2.1).
  await expect(page.getByTestId('home-play')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Continue' })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // Play shelf: the Garden card's thumbnail is a canvas of the start the worker builds.
  await page.getByTestId('home-play').click();
  const thumb = page.getByTestId('garden-thumb');
  await expect(thumb).toBeVisible();
  await expect(thumb).toHaveJSProperty('tagName', 'CANVAS');
  await expect(thumb).toHaveAttribute('role', 'img');
  await expect(thumb).toHaveAccessibleName('Picture of Little Living Garden');
  // The canvas holds the Garden's organisms in their species colours: Sprinter coral (#EF7B6C) is drawn.
  const coral = await thumb.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === 0xef && d[i + 1] === 0x7b && d[i + 2] === 0x6c) n++;
    return n;
  });
  expect(coral).toBeGreaterThan(0);
  await expectNoSeriousA11yViolations(page);

  // Start → the arrival line; nothing else shows while it does.
  await page.getByTestId('start-garden').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('56 alive');
  const notice = page.locator('.prompt');
  await expect(notice.locator('p')).toHaveText('Press play and look closely.');
  await expect(notice).toHaveAttribute('role', 'status');
  await expectNoSeriousA11yViolations(page);

  // Run clears it; the first optional prompt follows.
  await page.getByTestId('run-toggle').click();
  await expect(notice.locator('p')).toHaveText('Tap a Sprinter.');
  await expect(notice).toHaveCount(1);
  await expectNoSeriousA11yViolations(page);
  // Paused when the organism is selected → "Press Run." (UX §3.2 step 2), done when the dish runs.
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expect(notice.locator('p')).toHaveText('Tap a Sprinter.');
  // Step 1 is done when any organism is selected; Sunbeads (12 founders at 48, 48) stay put, Sprinters dart off.
  await selectOrganism(page, [48.5, 48.5]);
  await expect(notice.locator('p')).toHaveText('Press Run.');
  await page.getByTestId('run-toggle').click();
  await expect(page.getByText('Press Run.')).toHaveCount(0);
  await expect(page.getByText('Tap a Sprinter.')).toHaveCount(0);

  // Later steps need their evidence (a feeding cue, a division or 120 dish seconds). Dismiss each one that
  // shows (✕ moves to the next eligible one) until the Feed prompt is offered.
  await chooseSpeed(page, 4);
  const seen: string[] = [];
  await expect
    .poll(
      async () => {
        // Read the line and press its ✕ in one page task, so the ✕ can only dismiss the line that was read: a
        // read and a later click raced when "A cell split." gave way to the Feed prompt in between (fix round 1).
        // A click event rather than a pointer press: at 4× with several hundred organisms the desktop frames under
        // SwiftShader are too slow for Playwright's "stable" check; the ✕ is checked reachable and uncovered below.
        const text = await page.evaluate((feedPrompt) => {
          const n = document.querySelector('.prompt');
          const t = n?.querySelector('p')?.textContent ?? '';
          if (t !== '' && t !== feedPrompt) n?.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')?.click();
          return t;
        }, FEED_PROMPT);
        if (text !== '' && seen[seen.length - 1] !== text) seen.push(text);
        return text;
      },
      { timeout: 150_000, intervals: [500] },
    )
    .toBe(FEED_PROMPT);
  // Only the documented lines appeared, one at a time, and each before the Feed prompt had its evidence.
  for (const t of seen)
    expect([
      'It’s eating sugar — tap to see how much.',
      'A cell split.',
      'Nothing has split yet — tap one to see what’s stopping it.',
      FEED_PROMPT,
    ]).toContain(t);
  expect(seen.some((t) => t === 'A cell split.' || t.startsWith('Nothing has split yet'))).toBe(true);

  // Pause, then Show me: Feed is highlighted, not pressed — no sheet opens and the world is unchanged.
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expect(notice.locator('p')).toHaveText(FEED_PROMPT);
  const h0 = await workerHash(page);
  const showMe = notice.getByRole('button', { name: 'Show me' });
  await expectReachable(showMe);
  // The notice's buttons are on top (no zoom button or side sheet covers them) and 48 px targets.
  const dismiss = notice.getByRole('button', { name: 'Dismiss' });
  await expectReachable(dismiss);
  for (const b of [showMe, dismiss]) {
    const topmost = await b.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit !== null && (hit === el || el.contains(hit));
    });
    expect(topmost).toBe(true);
  }
  await showMe.click();
  const feedButton = page.getByTestId('action-feed');
  await expect(feedButton).toHaveClass(/\bshow-me\b/);
  await expect(feedButton).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { name: 'Feed' })).toHaveCount(0);
  expect(await workerHash(page)).toBe(h0);
  await expect(feedButton).not.toHaveClass(/\bshow-me\b/, { timeout: 6000 }); // 3 s, then gone
  expect(await workerHash(page)).toBe(h0);
  await expectNoSeriousA11yViolations(page);

  // Save and leave → Home shows this visit's memory.
  const t = await simSeconds(page);
  const alive = await page.getByTestId('sim-time').innerText();
  await page.getByTestId('more').click();
  await page.getByTestId('more-save').click();
  await expectReachable(page.getByTestId('save-leave'));
  await page.getByTestId('save-leave').click();
  const memory = page.getByTestId('session-memory');
  await expect(memory).toBeVisible();
  await expect(memory.getByTestId('session-memory-text')).toContainText('Little Living Garden');
  const memThumb = memory.getByTestId('session-memory-thumb');
  await expect(memThumb).toHaveJSProperty('tagName', 'CANVAS');
  await expect(memThumb).toHaveAccessibleName('Picture of Little Living Garden');
  await expect(memory).toContainText('Paused');
  // Sprinters divided during this visit, so the one recorded change is the births line.
  await expect(memory.getByTestId('session-memory-line')).toHaveText(/^\d+ births? (was|were) recorded since you opened it\.$/);
  await expectNoSeriousA11yViolations(page);

  // Continue: the dish opens paused at the same moment.
  await memory.getByTestId('home-continue').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  expect(await simSeconds(page)).toBe(t);
  await expect(page.getByTestId('sim-time')).toHaveText(alive);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  expect(pageErrors).toEqual([]);
});
