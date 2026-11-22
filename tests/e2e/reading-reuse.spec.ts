import { test, expect, type Page } from '@playwright/test';
import { PHONE_VIEWPORT, expectPart, openAnswerKey, noteModal, openCardEditor, openNoteForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';
import { resolve } from 'node:path';
import { chooseNoteSource } from './helpers/noteSource';

const passage = 'Document 1: Registered members pay the member rate.\n\nDocument 2: Workshop schedule.\nWorkshop | Member rate | Public rate\nData Basics | $0 | $20\nBusiness Writing | $10 | $30\n\nDocument 3: Contact reception to register.';
const choices = ['(A) Project Planning.', '(B) Business Writing.', '(C) Data Basics.', '(D) Team Leadership.'];
const question = (number: number) => `Which workshop is free for registered members (question ${number})?`;

// Removed with the redesign: "reuse keeps its draft separate from an unfinished standalone note" and the "Thêm câu cùng bài đọc"
// entry of a saved card. That entry lived in the old card menu (MistakeCard); the new card page has no such action, so a reading
// can only be reused inside the form via "Lưu & thêm câu cùng bài" (covered below).

async function mockAnalysis(page: Page) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, part7Images: true }; }
    export async function extractMistakeWithAI(text, captcha, input, images) {
      window.__readingCalls = [...(window.__readingCalls || []), { input, imageCount: images.length }];
      const context = images.length ? ${JSON.stringify(passage)} : 'Data Basics | $0 | $20';
      return { usage: {}, draft: { part: 7, question: input.question, context,
        questionContext: input.question + '\\n\\n' + context, options: input.options,
        correctAnswer: input.options[2], answerSource: 'AI_PROPOSED', userMistake: '', category: 'VOCABULARY_TRAP',
        tags: ['workshop'], trapTip: 'Read the member rate.', optionNotes: [], explanation: null,
        missingInformation: images.length ? ['Ngữ cảnh trích từ ảnh; kiểm tra chữ và số trước khi lưu.'] : [] } };
    }` }));
}

test('five questions reuse three images once and preserve the full source without carrying answers or explanations', async ({ page }, testInfo) => {
  await mockAnalysis(page); await page.setViewportSize(PHONE_VIEWPORT); await gotoPage(page, '/so-tay');
  const modal = await openNoteForm(page); await chooseNoteSource(modal, 'ETS Reuse');
  await modal.getByRole('button', { name: 'Part 7', exact: true }).click();
  await modal.getByRole('button', { name: 'Ảnh', exact: true }).click();
  await modal.getByLabel('Câu hỏi + phương án').fill(question(1) + '\n' + choices.join('\n'));
  await modal.getByRole('button', { name: 'Bạn chọn A', exact: true }).click();
  await modal.getByLabel('Lý do chọn').fill('First question only.');
  await openAnswerKey(modal);
  await modal.getByLabel('Lỗi sai', { exact: true }).selectOption('TIME_PRESSURE');
  await modal.getByLabel('Chọn ảnh Part 7').setInputFiles([
    resolve('tests/fixtures/part7-notice.png'), resolve('tests/fixtures/part7-table-question.png'), resolve('tests/fixtures/part7-notice.png')
  ]);
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByText('Đoạn đọc / ngữ cảnh', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 820 });
  await expect(modal.getByRole('button', { name: 'Lưu & thêm câu cùng bài', exact: true })).toBeInViewport();
  await expect(modal.getByRole('button', { name: 'Lưu câu sai', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('after-ai-same-reading-mobile.png') });
  await modal.getByRole('button', { name: 'Lưu & thêm câu cùng bài', exact: true }).click();
  for (let number = 2; number <= 5; number++) {
    await expect(modal.getByText('Đang dùng bài đọc trước', { exact: true })).toBeVisible();
    await expectPart(modal, '7');
    await expect(modal.getByRole('button', { name: 'Chọn đề', exact: true })).toHaveText('ETS Reuse');
    await expect(modal.getByLabel('Câu hỏi + phương án')).toHaveValue('');
    await expect(modal.getByLabel('Câu hỏi + phương án')).toBeFocused();
    // Phones show the reason field only after an answer is chosen; when present it must start empty.
    if (await modal.getByLabel('Lý do chọn').count()) await expect(modal.getByLabel('Lý do chọn')).toHaveValue('');
    await expect(modal.getByLabel('Lỗi sai', { exact: true })).toHaveValue('');
    await expect(modal.getByRole('button', { name: 'Bạn chọn A', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(modal.getByLabel('Chọn ảnh Part 7')).toHaveCount(0);
    await modal.getByLabel('Câu hỏi + phương án').fill(question(number) + '\n' + choices.join('\n'));
    if (number === 2) {
      await expect(modal.getByText('Xem bài đọc', { exact: true })).toHaveCount(0);
      await expect(modal.getByText(passage, { exact: true })).toHaveCount(0);
      await modal.getByText('Đối chiếu ảnh (3)', { exact: true }).click();
      await expect(modal.getByRole('img', { name: 'Ảnh nguồn Part 7 3', exact: true })).toBeVisible();
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.screenshot({ path: testInfo.outputPath('reused-reading.png') });
      await modal.getByText('Đối chiếu ảnh (3)', { exact: true }).click();
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({ path: testInfo.outputPath(`reused-reading-compact-${width}.png`) });
      }
      // Verified text can be saved manually without reading the images again.
      await modal.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
      await expect(modal.getByRole('status')).toContainText('Chưa có đáp án');
      await modal.getByRole('button', { name: 'Thêm câu cùng bài đọc', exact: true }).click();
    } else {
      await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
      if (number < 5) await modal.getByRole('button', { name: 'Lưu & thêm câu cùng bài', exact: true }).click();
      else await modal.getByRole('button', { name: 'Lưu câu sai', exact: true }).click();
    }
  }
  const calls = await page.evaluate(() => (window as Window & { __readingCalls: Array<{ input: { question: string; context: string }; imageCount: number }> }).__readingCalls);
  expect(calls.map(call => call.imageCount)).toEqual([3, 0, 0, 0]);
  expect(calls.slice(1).every(call => call.input.context === passage)).toBe(true);
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes);
  expect(saved).toHaveLength(5); expect(new Set(saved.map((entry: { id: string }) => entry.id)).size).toBe(5);
  for (const entry of saved) {
    expect(entry.context).toBe(passage); expect(entry.sourceTestName).toBe('ETS Reuse');
    expect(JSON.stringify(entry)).not.toContain('data:image');
  }
  const manual = saved.find((entry: { question: string }) => entry.question === question(2));
  expect(manual.correctAnswer).toBe(''); expect(manual.trapTip).toBeUndefined();
  expect(manual.tags).toEqual([]); expect(manual.userChoice).toBeUndefined(); expect(manual.userReason).toBe('');
});

test('editing a saved Part 7 card keeps its stored reading without an extra reuse prompt', async ({ page }) => {
  await gotoPage(page, '/so-tay');
  await page.evaluate(({ passage, choices }) => {
    const bundle = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!); const now = new Date().toISOString();
    bundle.mistakes = [{ id: 'reading-original', part: 7, question: 'Which workshop is free?', context: passage,
      questionContext: 'Which workshop is free?\n\n' + passage, options: choices, correctAnswer: choices[2],
      answerSource: 'AI_PROPOSED', category: 'OTHER', userChoiceState: 'UNKNOWN', userMistake: '', tags: [],
      sourceTestName: 'ETS Reuse', status: 'NEEDS_REVIEW', createdAt: now, updatedAt: now, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(bundle));
  }, { passage, choices });
  await page.reload();
  const modal = await openCardEditor(page);
  await expect(modal.getByLabel('Câu hỏi + phương án')).toHaveValue('Which workshop is free?\n' + choices.join('\n'));
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes);
  expect(saved).toHaveLength(1); expect(saved[0].context).toBe(passage);
});
