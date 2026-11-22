import { expect, test } from '@playwright/test';
import { chooseNoteSource } from './helpers/noteSource';
import { PHONE_VIEWPORT, openNoteForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

test('a single-question form passes its captured owner and invalidates the request when closed', async ({ page }) => {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true }; }
      export async function getAIUsage() { return null; }
      export async function extractMistakeWithAI(text, captcha, input, images, owner, isCurrent) {
        window.__singleStart = { owner, hasGuard: typeof isCurrent === 'function', current: isCurrent?.() };
        await new Promise(resolve => { window.__releaseSingle = resolve; });
        window.__singleStillCurrent = isCurrent?.();
        return { usage: {}, draft: { part: 5, category: 'OTHER', question: input.question, context: '', questionContext: input.question,
          options: input.options, correctAnswer: '(B) be', answerSource: 'AI_PROPOSED', userMistake: '', trapTip: '', tags: [], optionNotes: [], explanation: null, missingInformation: [] } };
      }
    `
  }));
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoPage(page, '/so-tay');
  const form = await openNoteForm(page);
  await chooseNoteSource(form, 'QA single cancellation');
  await form.getByRole('button', { name: 'Part 5', exact: true }).click();
  await form.getByLabel('Câu hỏi + phương án').fill('Reports should ____ submitted.\n(A) are\n(B) be\n(C) were\n(D) been');
  await form.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __singleStart?: unknown }).__singleStart)).toEqual({ owner: null, hasGuard: true, current: true });
  page.once('dialog', dialog => dialog.accept());
  await form.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.evaluate(() => (window as Window & { __releaseSingle: () => void }).__releaseSingle());
  await expect.poll(() => page.evaluate(() => (window as Window & { __singleStillCurrent?: boolean }).__singleStillCurrent)).toBe(false);
  await expect(page.getByRole('heading', { name: 'Kiểm tra và lưu', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes)).toEqual([]);
});
