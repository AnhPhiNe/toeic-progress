import { test, expect } from '@playwright/test';
import { chooseNoteSource } from './helpers/noteSource';

const question = 'What is indicated about delivery?';
const options = ['(A) It is free in every region.', '(B) It takes three business days.', '(C) It is available only on weekends.', '(D) It requires a membership.'];
const meanings = ['Giao hàng miễn phí ở mọi khu vực.', 'Giao hàng mất ba ngày làm việc.', 'Chỉ giao hàng vào cuối tuần.', 'Cần có tư cách hội viên.'];

test('Part 7 meanings stay inside explanations in preview, saved cards and answered review', async ({ page }) => {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true }; }
    export async function extractMistakeWithAI(text, captcha, input) {
      const meanings = ${JSON.stringify(meanings)};
      return { usage: {}, draft: { part: 7, question: ${JSON.stringify(question)}, context: 'Standard delivery takes three business days.',
        questionContext: ${JSON.stringify(question)}, options: input.options, correctAnswer: input.options[1], answerSource: 'AI_PROPOSED',
        userMistake: '', category: 'OTHER', tags: [], trapTip: '', explanation: null, missingInformation: [],
        optionNotes: meanings.map((meaning, index) => ({ label: 'ABCD'[index], pos: '', meaning })) } };
    }` }));
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
  const modal = page.getByRole('dialog'); await chooseNoteSource(modal);
  await modal.getByRole('button', { name: 'Part 7', exact: true }).click();
  await modal.getByLabel('Câu hỏi + phương án').fill(question + '\n' + options.join('\n'));
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  for (const meaning of meanings) await expect(modal.getByText(meaning, { exact: true })).toHaveCount(0);
  await expect(modal.getByText('It takes three business days.', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Xem giải thích', exact: true }).click();
  for (const meaning of meanings) await expect(modal.getByRole('region', { name: 'Nghĩa các phương án' }).getByText(meaning, { exact: true })).toBeVisible();
  await expect(modal.getByText('It takes three business days.', { exact: true }).locator('..')).not.toContainText(meanings[1]);
  await modal.getByRole('button', { name: 'Lưu lỗi sai', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: `Mở câu: ${question}`, exact: true }).click();
  const card = page.locator('.notebook-card');
  for (const meaning of meanings) await expect(card.getByText(meaning, { exact: true })).toHaveCount(0);
  await card.getByRole('button', { name: 'Xem giải thích', exact: true }).click();
  for (const meaning of meanings) await expect(card.getByRole('region', { name: 'Nghĩa các phương án' }).getByText(meaning, { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Ôn câu này', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Ôn tập', exact: true });
  await expect(review.getByRole('button', { name: 'Xem giải thích', exact: true })).toHaveCount(0);
  for (const meaning of meanings) await expect(review.getByText(meaning, { exact: true })).toHaveCount(0);
  await review.getByRole('button', { name: /^B\s+It takes three business days/ }).click();
  for (const meaning of meanings) await expect(review.getByText(meaning, { exact: true })).toHaveCount(0);
  await review.getByRole('button', { name: 'Xem giải thích', exact: true }).click();
  for (const meaning of meanings) await expect(review.getByRole('region', { name: 'Nghĩa các phương án' }).getByText(meaning, { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.optionNotes.map((note: { meaning: string }) => note.meaning)).toEqual(meanings);
});
