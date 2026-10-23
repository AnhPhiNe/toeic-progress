import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const screenshot = resolve('tests/fixtures/part7-notice.png');
const passage = 'Library Reopens\n(14 March) The Ashcombe Public Library welcomed residents back on Monday, 11 March, following a renovation...';
const draft = (question: string, options: string[], correct: string, choice: string) => ({
  // Reading a screenshot copies the page only; the explanation is asked for later on the card.
  part: 6, category: 'OTHER', question, context: passage, questionContext: question + '\n\n' + passage, options,
  correctAnswer: correct, answerSource: 'PROVIDED', userChoice: choice, userChoiceState: 'CHOSEN', userMistake: '', trapTip: '',
  tags: [], missingInformation: [], optionNotes: [], explanation: null
});
export const TIP = 'Trước phân từ financed cần trạng từ.';
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
        const body = btoa(JSON.stringify({ e: Math.floor(Date.now() / 1000) + 86400 })).replace(/=+$/, '');
        return { ...${JSON.stringify(PAGE)}, explainTicket: body + '.signature', usage: {} };
      }
      // Explanations arrive after a short delay, or fail when window.__explainFails is set.
      export async function explainBatchWithAI(ticket, items) {
        (window.__explainCalls = window.__explainCalls || []).push(items.map(item => item.number));
        await new Promise(resolve => setTimeout(resolve, window.__explainDelay ?? 300));
        window.__explainFinished = (window.__explainFinished || 0) + 1;
        if (window.__explainFails) throw new Error('offline');
        return { failed: [], items: items.map(({ number, input }) => ({ number, draft: { part: input.part, category: 'ADVANCED_GRAMMAR',
          question: input.question, context: input.context, questionContext: input.question, options: input.options,
          correctAnswer: input.options[3], answerSource: 'PROVIDED', userChoice: input.userChoice, userMistake: '', tags: ['adverb'],
          missingInformation: [], trapTip: 'Mẹo 10s: ' + ${JSON.stringify(TIP)}, optionNotes: [],
          explanation: { quickTip: ${JSON.stringify(TIP)}, translation: '', questionType: '', evidence: '', paraphrase: '', analysis: 'Dấu hiệu: ____ trước financed.', keyVocabulary: '' } } })) };
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

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes
  .filter((card: { sourceTestName?: string }) => card.sourceTestName === 'ETS Screen'));

test('on a phone one screenshot fills every wrong question on it, and the list is saved together', async ({ page }) => {
  const flow = await openFlow(page);
  await expect(flow.locator('[data-row-toggle]')).toHaveText(['Câu 107', 'Câu 131', 'Câu 132']);
  await flow.getByLabel('Ảnh màn hình đề').setInputFiles(screenshot);

  await expect(flow.getByRole('status')).toHaveText('Đã đọc 2 câu, cần kiểm tra trước khi lưu. Chưa đọc được câu: 107. Chỉ thêm ảnh cho các câu này.');
  const call = await page.evaluate(() => (window as Window & { __pageCall: { questions: unknown; images: number } }).__pageCall);
  expect(call).toEqual({ questions: [{ number: 107, part: 5 }, { number: 131, part: 6 }, { number: 132, part: 6 }], images: 1 });
  await expect(flow.getByRole('button', { name: 'Câu 131 Bạn chọn C, đáp án D', exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Câu 132 Bạn chọn B, đáp án D', exact: true })).toBeVisible();

  await flow.getByRole('button', { name: /^Câu 131/ }).click();
  await flow.getByRole('button', { name: /^Đoạn văn: Library Reopens/ }).click();
  await expect(flow.getByText(/following a renovation/)).toBeVisible();
  // The explanation is written in the background with the reading's ticket; the full one is a tap away.
  await expect(flow.getByText(TIP)).toBeVisible();
  await flow.getByRole('button', { name: 'Xem giải thích', exact: true }).click();
  await expect(flow.getByText('Dấu hiệu: ____ trước financed.')).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { __explainCalls: number[][] }).__explainCalls)).toEqual([[131, 132]]);

  // Correcting the learner's choice invalidates the rationale written for the screenshot's earlier choice.
  await flow.getByRole('button', { name: /^Câu 132/ }).click();
  await flow.getByRole('button', { name: 'Sửa đáp án', exact: true }).click();
  await flow.getByRole('group', { name: 'Bạn chọn' }).getByRole('button', { name: 'A', exact: true }).click();
  await expect(flow.getByLabel('Vì sao sai câu 132')).toHaveValue('');
  await expect(flow.getByText(TIP, { exact: true })).toHaveCount(0);
  await flow.getByRole('button', { name: 'Lưu 2 câu', exact: true }).click();
  await expect(flow).toHaveCount(0);

  const cards = await stored(page);
  const q132 = cards.find((card: { questionNumber: number }) => card.questionNumber === 132);
  expect(q132).toMatchObject({ part: 6, context: passage, options: ['(A) larger', '(B) largeness', '(C) large', '(D) largely'],
    userChoice: 'A', userChoiceState: 'CHOSEN', correctAnswer: '(D) largely', answerSource: 'PROVIDED', answerProvidedBy: 'SOURCE',
    category: 'OTHER' });
  expect(q132.explanation).toBeUndefined();
  expect(q132.trapTip).toBe('');
  expect(q132.tags).toEqual([]);
  expect(q132.question).toBe('The entire project was ____ financed through municipal funds.');
  // The question the screenshot did not show stays a draft for later.
  expect(cards.find((card: { questionNumber: number }) => card.questionNumber === 107).question).toBe('');
});

test('a corrected answer is kept as the learner’s', async ({ page }) => {
  const flow = await openFlow(page);
  await flow.getByLabel('Ảnh màn hình đề').setInputFiles(screenshot);
  await flow.getByRole('button', { name: /^Câu 131/ }).click();
  await flow.getByRole('button', { name: 'Sửa đáp án', exact: true }).click();
  await flow.getByRole('group', { name: 'Đáp án' }).getByRole('button', { name: 'B', exact: true }).click();
  await flow.getByRole('button', { name: 'Lưu 2 câu', exact: true }).click();
  const cards = await stored(page);
  expect(cards.find((card: { questionNumber: number }) => card.questionNumber === 131))
    .toMatchObject({ correctAnswer: '(B) The library will close early.', answerSource: 'PROVIDED', answerProvidedBy: 'LEARNER' });
  expect(cards.find((card: { questionNumber: number }) => card.questionNumber === 132))
    .toMatchObject({ correctAnswer: '(D) largely', answerProvidedBy: 'SOURCE' });
});

test('an explanation that never arrived is asked for again on the card without a new AI use', async ({ page }) => {
  const flow = await openFlow(page);
  await page.evaluate(() => { (window as Window & { __explainFails?: boolean }).__explainFails = true; });
  await flow.getByLabel('Ảnh màn hình đề').setInputFiles(screenshot);
  await expect(flow.getByRole('img', { name: 'Đang viết lời giải' }).first()).toBeVisible();
  await page.waitForFunction(() => (window as Window & { __explainFinished?: number }).__explainFinished === 1);
  await expect(flow.getByRole('img', { name: 'Đang viết lời giải' })).toHaveCount(0);
  await flow.getByRole('button', { name: 'Lưu 2 câu', exact: true }).click();
  await expect(flow).toHaveCount(0);

  await page.evaluate(() => { (window as Window & { __explainFails?: boolean }).__explainFails = false; });
  await page.getByRole('button', { name: /The entire project was/ }).first().click();
  const retry = page.getByRole('button', { name: 'Viết lời giải', exact: true });
  await retry.click();
  await expect(page.getByText(TIP).first()).toBeVisible();
  await expect(retry).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __explainCalls: number[][] }).__explainCalls)).toEqual([[131, 132], [132]]);
  const q132 = (await stored(page)).find((card: { questionNumber: number }) => card.questionNumber === 132);
  expect(q132.explanation.quickTip).toBe(TIP);
});
