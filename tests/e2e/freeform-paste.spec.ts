import { test, expect, type Page } from '@playwright/test';
import { chooseNoteSource } from './helpers/noteSource';

const question = 'Reports should ____ submitted.';
const options = ['(A) are', '(B) be', '(C) were', '(D) being'];
const raw = '**Câu hỏi**\n108\n' + question + '\nB. be\nA. are\nC. were\nD. being';

async function mockFreeform(page: Page, issue = false) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, freeformInput: true }; }
    export async function extractMistakeWithAI(text, captcha, input, images) {
      window.__pasteCalls = [...(window.__pasteCalls || []), { input, images }];
      if (${issue}) throw new Error('Nội dung có nhiều câu hỏi. Giữ lại một câu cần ghi lỗi rồi phân tích lại. Nội dung đang nhập vẫn được giữ.');
      return { usage: {}, draft: { part: 5, question: ${JSON.stringify(question)}, context: '', questionContext: ${JSON.stringify(question)},
        options: ${JSON.stringify(options)}, correctAnswer: '(B) be', answerSource: input.sourceAnswer ? 'PROVIDED' : 'AI_PROPOSED',
        userMistake: '', category: 'ADVANCED_GRAMMAR', tags: [], trapTip: 'Use should be submitted.', optionNotes: [],
        explanation: null, missingInformation: [] } };
    }
  ` }));
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const modal = page.getByRole('dialog'); await chooseNoteSource(modal);
  await modal.getByLabel('Part', { exact: true }).selectOption('5');
  return modal;
}

test('freeform paste bypasses the manual parser, keeps learner metadata and saves the extracted draft', async ({ page }) => {
  const modal = await mockFreeform(page);
  await modal.getByLabel('Câu hỏi + phương án').fill(raw);
  await expect(modal.getByRole('alert')).toHaveCount(0);
  await modal.getByRole('button', { name: 'Bạn chọn D', exact: true }).click();
  await modal.getByLabel('Lý do chọn').fill('I thought it required being.');
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByText(question, { exact: true })).toBeVisible();
  const calls = await page.evaluate(() => (window as Window & { __pasteCalls: Array<{ input: unknown }> }).__pasteCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0].input).toMatchObject({ rawText: raw, question: '', options: [], part: 5,
    userChoice: 'D', userReason: 'I thought it required being.', sourceAnswer: '' });
  await modal.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await expect(modal.getByLabel('Câu hỏi + phương án')).toHaveValue(raw);
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.question).toBe(question); expect(saved.options).toEqual(options); expect(saved.correctAnswer).toBe('(B) be');
  expect(saved.userChoice).toBe('D'); expect(saved.userMistake).toContain('(D) being');
});

test('multiple questions preserve pasted data and attachments instead of picking a question silently', async ({ page }) => {
  const modal = await mockFreeform(page, true);
  const multiple = raw + '\n109\nAnother question?\nA. One\nB. Two\nC. Three\nD. Four';
  await modal.getByLabel('Câu hỏi + phương án').fill(multiple);
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('nhiều câu hỏi');
  await expect(modal.getByLabel('Câu hỏi + phương án')).toHaveValue(multiple);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes)).toHaveLength(0);
});
