import { test, expect } from '@playwright/test';
import { chooseNoteSource } from './helpers/noteSource';
import { PHONE_VIEWPORT, openCard, openNoteForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

const question = 'What is indicated about delivery?';
const options = ['(A) It is free in every region.', '(B) It takes three business days.', '(C) It is available only on weekends.', '(D) It requires a membership.'];
const meanings = ['Giao hàng miễn phí ở mọi khu vực.', 'Giao hàng mất ba ngày làm việc.', 'Chỉ giao hàng vào cuối tuần.', 'Cần có tư cách hội viên.'];

test('Part 7 meanings stay inside explanations in preview, saved cards and answered review', async ({ page }) => {
  // Vite may append an HMR timestamp after a source edit during a local run.
  await page.route(/\/src\/features\/mistakes\/services\/aiMistakeExtractor\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true }; }
    export async function extractMistakeWithAI(text, captcha, input) {
      const meanings = ${JSON.stringify(meanings)};
      return { usage: {}, draft: { part: 7, question: ${JSON.stringify(question)}, context: 'Standard delivery takes three business days.',
        questionContext: ${JSON.stringify(question)}, options: input.options, correctAnswer: input.options[1], answerSource: 'AI_PROPOSED',
        userMistake: '', category: 'OTHER', tags: [], trapTip: '', explanation: null, missingInformation: [],
        optionNotes: meanings.map((meaning, index) => ({ label: 'ABCD'[index], pos: '', meaning })) } };
    }` }));
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoPage(page, '/so-tay'); const modal = await openNoteForm(page); await chooseNoteSource(modal);
  await modal.getByRole('button', { name: 'Part 7', exact: true }).click();
  await modal.getByLabel('Câu hỏi + phương án').fill(question + '\n' + options.join('\n'));
  await expect(modal.getByRole('button', { name: 'Phân tích với AI', exact: true })).toBeEnabled();
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  for (const meaning of meanings) await expect(modal.getByText(meaning, { exact: true })).toHaveCount(0);
  await expect(modal.getByText('It takes three business days.', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Xem giải thích', exact: true }).click();
  for (const meaning of meanings) await expect(modal.getByRole('region', { name: 'Nghĩa các phương án' }).getByText(meaning, { exact: true })).toBeVisible();
  await expect(modal.getByText('It takes three business days.', { exact: true }).locator('..')).not.toContainText(meanings[1]);
  await modal.getByRole('button', { name: 'Lưu câu sai', exact: true }).click();
  // The saved card and the review are read on a computer.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await openCard(page, question);
  // Card v2: the answer's meaning shows on its row; the others open with their own "Vì sao" button.
  await expect(page.locator('.cd-why').getByText(meanings[1], { exact: true })).toBeVisible();
  for (const index of [0, 2, 3]) {
    await expect(page.locator('.cd').getByText(meanings[index], { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: `Vì sao ${'ABCD'[index]}`, exact: true }).click();
    await expect(page.locator('.cd-why').getByText(meanings[index], { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Ôn câu này', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Ôn câu sai', exact: true });
  for (const meaning of meanings) await expect(review.getByText(meaning, { exact: true })).toHaveCount(0);
  await review.getByRole('button', { name: /^\(B\)\s*It takes three business days/ }).click();
  for (const meaning of meanings) await expect(review.getByText(meaning, { exact: true })).toHaveCount(0);
  await review.getByRole('button', { name: 'Xem nghĩa từng phương án', exact: true }).click();
  for (const meaning of meanings) await expect(review.getByText(meaning, { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.optionNotes.map((note: { meaning: string }) => note.meaning)).toEqual(meanings);
});
