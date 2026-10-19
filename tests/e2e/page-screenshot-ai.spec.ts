import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const screenshot = resolve('tests/fixtures/part7-notice.png');
const passage = 'Library Reopens\n(14 March) The Ashcombe Public Library welcomed residents back on Monday, 11 March, following a renovation...';
const explanation = { quickTip: 'Trước tính từ/phân từ cần trạng từ bổ nghĩa.', translation: '', questionType: '', evidence: '', paraphrase: '', analysis: 'Dấu hiệu: was ____ financed.', keyVocabulary: '' };
const draft = (question: string, options: string[], correct: string, choice: string) => ({
  part: 6, category: 'ADVANCED_GRAMMAR', question, context: passage, questionContext: question + '\n\n' + passage, options,
  correctAnswer: correct, answerSource: 'PROVIDED', userChoice: choice, userChoiceState: 'CHOSEN', userMistake: '', trapTip: 'Mẹo: trạng từ.',
  tags: ['adverb'], missingInformation: [], optionNotes: [], explanation
});
export const PAGE = {
  items: [
    { number: 131, draft: draft('--(131)--. Its main reading room has been enlarged.', ['(A) A used-book sale will be held.', '(B) The library will close early.', '(C) A nearby center underwent similar work.', '(D) The renovation has transformed nearly every part of the building.'], '(D) The renovation has transformed nearly every part of the building.', 'C') },
    { number: 132, draft: draft('The entire project was ____ financed through municipal funds.', ['(A) larger', '(B) largeness', '(C) large', '(D) largely'], '(D) largely', 'B') }
  ],
  missing: [107]
};

/** Replaces the AI module in the browser: screenshots of a page return the two Part 6 questions above. */
export async function mockPageAI(page: Page) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, pageImages: true }; }
      export async function getAIUsage() { return null; }
      export async function extractMistakeWithAI() { throw new Error('not used'); }
      export async function extractPageWithAI(questions, images) {
        window.__pageCall = { questions, images: images.length };
        return { ...${JSON.stringify(PAGE)}, usage: {} };
      }`
  }));
}

async function openFlow(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPageAI(page);
  await page.goto('/lich-su');
  await page.getByRole('button', { name: 'Ghi lại kết quả học', exact: true }).click();
  await page.getByRole('dialog', { name: 'Ghi lại', exact: true }).getByRole('button', { name: /^Điểm đề thi/ }).click();
  const form = page.getByRole('dialog', { name: 'Ghi điểm', exact: true });
  await form.locator('#session-test-name').fill('ETS Screen');
  await form.getByRole('button', { name: 'Gõ số câu thay vì chạm', exact: true }).click();
  await form.getByLabel('Số câu sai', { exact: true }).fill('107 131 132');
  await form.getByRole('button', { name: 'Áp dụng', exact: true }).click();
  await form.getByRole('button', { name: 'Lưu điểm', exact: true }).click();
  await page.getByRole('button', { name: 'Ghi chi tiết câu sai ›', exact: true }).click();
  return page.getByRole('dialog', { name: /^Ghi câu sai/ });
}

test('one screenshot fills every wrong question on it; they are checked as tabs and saved together', async ({ page }) => {
  const flow = await openFlow(page);
  await expect(flow.getByText('Câu 107 · Part 5 · ETS Screen', { exact: true })).toBeVisible();
  await flow.getByLabel('Ảnh màn hình đề').setInputFiles(screenshot);

  await expect(flow.getByRole('status')).toContainText('Ảnh có 2 câu sai của bạn: 131, 132.');
  const call = await page.evaluate(() => (window as Window & { __pageCall: { questions: unknown; images: number } }).__pageCall);
  expect(call).toEqual({ questions: [{ number: 107, part: 5 }, { number: 131, part: 6 }, { number: 132, part: 6 }], images: 1 });

  const tabs = flow.getByRole('tablist', { name: 'Câu trong ảnh' });
  await expect(tabs.getByRole('tab')).toHaveCount(2);
  await expect(flow.getByText('Câu 131 · Part 6 · ETS Screen', { exact: true })).toBeVisible();
  await expect(flow.getByRole('group', { name: /Bạn chọn/ }).getByRole('button', { name: 'C', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(flow.getByRole('group', { name: /Đáp án đúng/ }).getByRole('button', { name: 'D', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(flow.getByText('theo đề', { exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Ngữ pháp', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await flow.getByRole('button', { name: /^Đoạn văn: Library Reopens/ }).click();
  await expect(flow.getByText(/following a renovation/)).toBeVisible();

  await flow.getByRole('button', { name: 'Tiếp: Câu 132 ›', exact: true }).click();
  await expect(flow.getByText('The entire project was ____ financed through municipal funds.', { exact: true })).toBeVisible();
  // The learner corrects a choice the screenshot showed differently.
  await flow.getByRole('group', { name: /Bạn chọn/ }).getByRole('button', { name: 'A', exact: true }).click();
  await flow.getByRole('button', { name: 'Lưu 2 câu', exact: true }).click();

  // The flow goes on with the question the screenshot did not show.
  await expect(flow.getByText('Câu 107 · Part 5 · ETS Screen', { exact: true })).toBeVisible();
  const cards = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
    .filter((card: { sourceTestName?: string }) => card.sourceTestName === 'ETS Screen'));
  const q132 = cards.find((card: { questionNumber: number }) => card.questionNumber === 132);
  expect(q132).toMatchObject({ part: 6, context: passage, options: ['(A) larger', '(B) largeness', '(C) large', '(D) largely'],
    userChoice: 'A', userChoiceState: 'CHOSEN', correctAnswer: '(D) largely', answerSource: 'PROVIDED', answerProvidedBy: 'SOURCE',
    category: 'ADVANCED_GRAMMAR', explanation });
  expect(q132.question).toBe('The entire project was ____ financed through municipal funds.');
  const q107 = cards.find((card: { questionNumber: number }) => card.questionNumber === 107);
  expect(q107.question).toBe('');
});

test('a corrected answer is kept as the learner’s, and a skipped tab stays for later', async ({ page }) => {
  const flow = await openFlow(page);
  await flow.getByLabel('Ảnh màn hình đề').setInputFiles(screenshot);
  await flow.getByRole('group', { name: /Đáp án đúng/ }).getByRole('button', { name: 'B', exact: true }).click();
  await expect(flow.getByText('theo đề', { exact: true })).toHaveCount(0);
  await flow.getByRole('button', { name: 'Tiếp: Câu 132 ›', exact: true }).click();
  await flow.getByRole('button', { name: 'Bỏ câu này', exact: true }).click();
  await expect(flow.getByRole('tablist')).toHaveCount(0);
  await flow.getByRole('button', { name: 'Lưu · câu tiếp ›', exact: true }).click();
  const cards = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
    .filter((card: { sourceTestName?: string }) => card.sourceTestName === 'ETS Screen'));
  expect(cards.find((card: { questionNumber: number }) => card.questionNumber === 131))
    .toMatchObject({ correctAnswer: '(B) The library will close early.', answerSource: 'PROVIDED', answerProvidedBy: 'LEARNER' });
  expect(cards.find((card: { questionNumber: number }) => card.questionNumber === 132).question).toBe('');
});
