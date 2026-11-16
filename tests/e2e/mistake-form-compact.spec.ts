import { test, expect } from '@playwright/test';
import { chooseNoteSource } from './helpers/noteSource';
import { PHONE_VIEWPORT, openNoteForm, choosePart, openCard } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

// The full note form is reached from the phone's + Ghi sheet; computers only open it to edit a card.
test.use({ viewport: PHONE_VIEWPORT });

for (const { selected, capable } of [
  { selected: 'TIME_PRESSURE', capable: true },
  { selected: '', capable: true },
  { selected: 'TIME_PRESSURE', capable: false },
]) test(`source is required before AI; category ${selected || 'automatic'} survives analysis (capable ${capable})`, async ({ page }) => {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, learnerCategory: ${capable} }; }
    export async function extractMistakeWithAI(text, captcha, input) {
      window.__categoryInput = input;
      return { usage: {}, draft: { part: 5, questionContext: input.question, options: input.options,
        correctAnswer: input.options[1], answerSource: 'AI_PROPOSED', userMistake: '', category: 'ADVANCED_GRAMMAR',
        tags: ['passive'], trapTip: 'Use the infinitive.', optionNotes: [], explanation: null, missingInformation: [] } };
    }` }));
  await gotoPage(page, '/so-tay'); const modal = await openNoteForm(page);
  await choosePart(modal, '5');
  await modal.getByLabel('Câu hỏi + phương án').fill('Reports should ____ submitted.\n(A) are\n(B) be');
  await modal.locator('summary').filter({ hasText: 'Đáp án, loại lỗi' }).click();
  await modal.getByRole('combobox', { name: 'Lỗi sai', exact: true }).selectOption(selected);
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Chọn hoặc thêm tên đề');
  expect(await page.evaluate(() => '__categoryInput' in window)).toBe(false);
  await chooseNoteSource(modal);
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByRole('heading', { name: 'Kiểm tra và lưu' })).toBeVisible();
  const sent = await page.evaluate(() => (window as Window & { __categoryInput: { errorCategory?: string; sourceTestName?: string } }).__categoryInput);
  expect(sent.errorCategory).toBe(selected && capable ? selected : undefined);
  expect(sent.sourceTestName).toBeUndefined();
  await modal.getByRole('button', { name: 'Lưu câu sai', exact: true }).click();
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.category).toBe(selected || 'ADVANCED_GRAMMAR');
  expect(saved.tags).toEqual(['passive']); expect(saved.trapTip).toBe('Use the infinitive.');
});

test('one source textbox replaces extra context and choices are optional', async ({ page }, testInfo) => {
  // The one-row Part + test layout of tablets/computers is gone: only phones open this form to add a card now.
  await gotoPage(page, '/so-tay'); const modal = await openNoteForm(page);
  const part = modal.getByRole('group', { name: 'Part', exact: true });
  const source = modal.getByRole('button', { name: 'Chọn đề', exact: true });
  await expect(modal.getByRole('button', { name: 'Sửa', exact: true })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'Không nhớ', exact: true })).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'Bỏ trống', exact: true })).toHaveCount(0);
  await expect(modal.getByLabel('Ngữ cảnh bổ sung', { exact: true })).toHaveCount(0);
  await expect(modal.getByText('Ghi chú bổ sung', { exact: true })).toHaveCount(0);
  await modal.locator('summary').filter({ hasText: 'Đáp án, loại lỗi' }).click();
  await modal.getByRole('combobox', { name: 'Lỗi sai', exact: true }).selectOption('TIME_PRESSURE');
  await part.getByRole('button', { name: 'Part 5', exact: true }).click();
  await source.click();
  await modal.getByRole('combobox', { name: 'Tìm hoặc thêm tên đề', exact: true }).fill('ETS Compact');
  await page.getByRole('option', { name: '+ Thêm tên đề “ETS Compact”', exact: true }).click();
  await modal.getByLabel('Câu hỏi + phương án').fill('Reports should ____ submitted.\n(A) are\n(B) be');
  const choice = modal.getByRole('button', { name: 'Bạn chọn A', exact: true });
  await choice.click(); await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await choice.click(); await expect(choice).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('compact-note-form-mobile.png'), fullPage: true });
  await modal.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.category).toBe('TIME_PRESSURE'); expect(saved.part).toBe(5); expect(saved.sourceTestName).toBe('ETS Compact');
  expect(saved.userChoiceState).toBe('UNKNOWN'); expect(saved.userChoice).toBeUndefined();
});

test('editing preserves explicit context and historical blank choice without duplicate inputs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoPage(page, '/so-tay');
  await page.evaluate(() => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const stamp = new Date().toISOString();
    bundle.mistakes = [{ id: 'context', sourceTestName: 'ETS Context', part: 3, question: 'What does the man need?', context: '(M) I need the report today.',
      questionContext: 'What does the man need?\n\n(M) I need the report today.', options: ['(A) A report.', '(B) A car.'],
      correctAnswer: '(A) A report.', answerSource: 'PROVIDED', userChoiceState: 'BLANK', userMistake: 'Bỏ trống',
      category: 'OTHER', status: 'NEEDS_REVIEW', tags: [], createdAt: stamp, updatedAt: stamp, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  });
  await page.reload(); await openCard(page, 'What does the man need?');
  await page.getByRole('button', { name: 'Sửa', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByLabel('Câu hỏi + phương án')).toHaveValue('What does the man need?\n(A) A report.\n(B) A car.');
  await expect(modal.getByLabel('Transcript', { exact: true })).toHaveValue('(M) I need the report today.');
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.question).toBe('What does the man need?'); expect(saved.context).toBe('(M) I need the report today.');
  expect(saved.userChoiceState).toBe('BLANK');
  await page.getByRole('button', { name: 'Sửa', exact: true }).click();
  await modal.getByLabel('Transcript', { exact: true }).fill('(M) I need the report tomorrow.');
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.questionContext).toContain('tomorrow'); expect(saved.context ?? '').not.toContain('today');
});
