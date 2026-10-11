import { chooseNoteSource } from './helpers/noteSource';
import { test, expect } from '@playwright/test';

const question = 'What problem does the man mention?';
const transcript = '(M-Cn) The warehouse was out of the small food containers.\n(W-Am) Sales are slow today.';
const options = ['(A) Sales are slow.', '(B) More staff is needed.', '(C) An order is incomplete.', '(D) Some equipment is broken.'];

test('AI extracts the stem in one analysis; context folds without changing choices, review or saved content', async ({ page }, testInfo) => {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true }; }
      export async function extractMistakeWithAI(text, captcha, input) {
        window.__analysisCount = (window.__analysisCount || 0) + 1;
        window.__lastAIInput = input;
        return { usage: {}, draft: {
          part: 3, questionContext: ${JSON.stringify(question + '\n\n' + transcript)}, options: input.options,
          question: ${JSON.stringify(question)}, context: ${JSON.stringify(transcript)},
          correctAnswer: input.options[2], answerSource: 'AI_PROPOSED', userChoice: 'D', userMistake: '',
          category: 'OTHER', tags: [], trapTip: 'Check the missing containers.', optionNotes: [],
          explanation: null, missingInformation: []
        } };
      }`
  }));
  await page.goto('/so-tay');
  await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const modal = page.getByRole('dialog');
  await chooseNoteSource(modal); await modal.getByLabel('Part', { exact: true }).selectOption('3');
  await modal.getByLabel('Câu hỏi + phương án').fill(
    'Questions 53 through 55 refer to the following conversation.\n' + transcript + '\n\n' + question + '\n' + options.join('\n')
  );
  await modal.getByRole('button', { name: 'Bạn chọn A', exact: true }).click();
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByRole('heading', { name: 'Kiểm tra và lưu' })).toBeVisible();
  await expect(modal.getByText(question, { exact: true })).toBeVisible();
  await expect(modal.getByText(transcript, { exact: true })).not.toBeVisible();
  const context = modal.locator('details').filter({ has: page.locator('summary', { hasText: /^Transcript$/ }) });
  await context.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(modal.getByText(transcript, { exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(modal.getByText(transcript, { exact: true })).not.toBeVisible();
  const calls = await page.evaluate(() => {
    const fixture = window as Window & { __analysisCount: number; __lastAIInput: { question: string; options: string[] } };
    return { count: fixture.__analysisCount, input: fixture.__lastAIInput };
  });
  expect(calls.count).toBe(1);
  expect(calls.input.question).toContain(transcript);
  expect(calls.input.question).toContain(question);
  expect(calls.input.options).toEqual(options);
  await modal.getByRole('button', { name: 'Lưu lỗi sai', exact: true }).click();
  const row = page.getByRole('button', { name: `Mở câu: ${question}`, exact: true });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator('.notebook-card').getByText(transcript, { exact: true })).not.toBeVisible();
  await expect(page.locator('.notebook-card').getByText('AI đề xuất', { exact: true })).toBeVisible();
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('listening-compact.png'), fullPage: true });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.questionContext).toBe(question + '\n\n' + transcript);
  expect(saved.question).toBe(question); expect(saved.context).toBe(transcript);
  expect(saved.userChoice).toBe('A');
  expect(saved.correctAnswer).toBe(options[2]);
  await page.getByRole('button', { name: 'Ôn câu này', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Ôn tập' });
  await expect(review.getByText(transcript, { exact: true })).toBeVisible();
  await review.getByRole('button', { name: /^C\s+An order is incomplete/ }).click();
  await expect(review.getByRole('status')).toContainText('Đúng · ôn sau 3 ngày');
  await review.getByRole('button', { name: 'Xem kết quả' }).click();
  await review.getByRole('button', { name: 'Đóng', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: `Mở câu: ${question}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tùy chọn thẻ', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sửa', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Câu hỏi + phương án')).toHaveValue(question + '\n' + options.join('\n'));
  await expect(page.getByRole('dialog').getByLabel('Transcript', { exact: true })).toHaveValue(transcript);
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  const edited = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(edited.question).toBe(question); expect(edited.context).toBe(transcript);
  expect(edited.correctAnswer).toBe(options[2]); expect(edited.reviewStage).toBe(1);
});
