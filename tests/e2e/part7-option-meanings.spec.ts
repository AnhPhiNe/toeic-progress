import { test, expect } from '@playwright/test';
import { openCard } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

const question = 'What is indicated about delivery?';
const options = ['(A) It is free in every region.', '(B) It takes three business days.', '(C) It is available only on weekends.', '(D) It requires a membership.'];
const meanings = ['Giao hàng miễn phí ở mọi khu vực.', 'Giao hàng mất ba ngày làm việc.', 'Chỉ giao hàng vào cuối tuần.', 'Cần có tư cách hội viên.'];

test('Part 7 meanings stay inside explanations in saved cards and answered review', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoPage(page, '/so-tay');
  await page.evaluate(({ question, options, meanings }) => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = [{
      id: 'p7-meanings', part: 7, question, context: 'Standard delivery takes three business days.',
      questionContext: question, options, correctAnswer: options[1], answerSource: 'AI_PROPOSED',
      userMistake: '', category: 'OTHER', tags: [], trapTip: '', sourceTestName: 'ETS Test 1',
      status: 'NEEDS_REVIEW', reviewStage: 0, nextReviewDate: '2020-01-01',
      optionNotes: meanings.map((meaning, index) => ({ label: 'ABCD'[index], pos: '', meaning })),
      explanation: null, createdAt: now, updatedAt: now, deletedAt: null
    }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  }, { question, options, meanings });
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
});
