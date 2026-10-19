/**
 * Phase 5 experiment cards for tests/e2e/experiments-p5.spec.ts (wave 15 p5-polish; D-0131). Read in Node from the
 * content in the tree (the same files the app's registry loads), so the journey names what the build ships and
 * never restates a card by hand: stage 1's cards (EXP_205 … EXP_211, measures-overrides) now, stage 2's (EXP_213 …
 * EXP_218, cards-curated) once they land. Also the screen helpers the journey shares with tests/e2e/experiments.spec.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface P5Card {
  readonly id: string;
  readonly title: string;
  readonly paired: boolean;
}

/** Every phase 5 experiment card in content/experiments, sorted by id. */
export function phase5Cards(): P5Card[] {
  const dir = join(ROOT, 'content', 'experiments');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as { id: string; title: string; paired?: boolean; phase?: number })
    .filter((d) => d.phase === 5)
    .map((d) => ({ id: d.id, title: d.title, paired: d.paired === true }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** Stage 1's cards (P5.6 E205 … E211). */
export const STAGE1_IDS = ['EXP_205', 'EXP_206', 'EXP_207', 'EXP_208', 'EXP_209', 'EXP_210', 'EXP_211'] as const;

/** Stage 2's cards (P5.6 E213 … E218, cards-curated). */
export const STAGE2_IDS = ['EXP_213', 'EXP_214', 'EXP_215', 'EXP_216', 'EXP_217', 'EXP_218'] as const;

/** UX §3.3's label, with its non-breaking hyphen (strings/modes.ts TEST_ONLY_LABEL). */
export const TEST_ONLY = 'test‑only override';

/** Home → Notebook → Experiments. */
export async function openExperiments(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('home-notebook').click();
  await expect(page.getByTestId('notebook')).toBeVisible();
  await page.getByTestId('notebook-tab-experiments').click();
  await expect(page.getByTestId('notebook-tab-experiments')).toHaveAttribute('aria-selected', 'true');
}

/** Every visible text inside `selector` is at least 16 px (UX §9), as experiments.spec.ts checks it. */
export async function expectTextAtLeast16px(page: Page, selector: string): Promise<void> {
  const small = await page.evaluate((sel) => {
    const out: string[] = [];
    for (const root of Array.from(document.querySelectorAll(sel))) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim() ?? '';
        const el = n.parentElement;
        if (!text || !el || el.closest('.sr-only')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 15.9) out.push(`${el.tagName.toLowerCase()}.${el.className}: ${fs}px “${text.slice(0, 40)}”`);
      }
    }
    return out;
  }, selector);
  expect(small).toEqual([]);
}

/** Every visible button inside `selector` is at least 48 × 48 CSS px (UX §9 touch targets). */
export async function expectTouchTargets(page: Page, selector: string): Promise<void> {
  const small = await page.evaluate((sel) => {
    const out: string[] = [];
    for (const root of Array.from(document.querySelectorAll(sel)))
      for (const b of Array.from(root.querySelectorAll('button'))) {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < 47.5 || r.height < 47.5) out.push(`${b.textContent?.trim() || b.getAttribute('aria-label')}: ${r.width}×${r.height}`);
      }
    return out;
  }, selector);
  expect(small).toEqual([]);
}
