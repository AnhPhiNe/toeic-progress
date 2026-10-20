import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chooseNoteSource } from './helpers/noteSource';

const passage = 'Email 1: Registration opens Monday.\n\nEmail 2: Members can join the workshop for free.\n\nNotice 3: The event is on Friday.';
const options = ['(A) Writing.', '(B) Planning.', '(C) Data Basics.', '(D) Leadership.'];
const image = resolve('tests/fixtures/part7-notice.png');
const id = 'a'.repeat(64);

test('the shared context area retains text and pictures across mode changes and reuses only the selected source', async ({ page }, info) => {
  await page.route('**/src/features/mistakes/services/sourceImages.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function sourceImageAccount() { return 'owner'; }
    export async function uploadSourceImages() { window.__uploads = (window.__uploads || 0) + 1; return ['${id}']; }
    export async function sourceImageUrls(ids) { return ids.map(id => ({id, url: '/__source-picture'})); }
  ` }));
  await page.route('**/__source-picture', async route => route.fulfill({ contentType: 'image/png', body: await readFile(image) }));
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return {provider: 'openai', structuredInput: true, freeformInput: true, part7Images: true, persistentImages: true}; }
    export async function extractMistakeWithAI(text, captcha, input, images, sourceImageIds) {
      window.__sources = [...(window.__sources || []), {input, images, sourceImageIds}];
      const question = input.rawText.split('\\n')[0];
      return {usage: {}, draft: {part: 7, question, context: input.context, questionContext: question, options: ${JSON.stringify(options)},
        correctAnswer: '${options[2]}', answerSource: 'AI_PROPOSED', userMistake: '', category: 'OTHER', tags: [], trapTip: 'Read the source.',
        optionNotes: [], explanation: null, missingInformation: []}};
    }
  ` }));
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
  const modal = page.getByRole('dialog'); await chooseNoteSource(modal);
  await modal.getByRole('button', { name: 'Part 7', exact: true }).click();
  await modal.getByLabel('Câu hỏi + phương án').fill('Which workshop is free?\n' + options.join('\n'));
  await modal.getByLabel('Đoạn đọc', { exact: true }).fill(passage);
  await modal.getByRole('button', { name: 'Ảnh', exact: true }).click();
  await modal.getByLabel('Chọn ảnh Part 7').setInputFiles(image);
  await modal.getByRole('button', { name: 'Văn bản', exact: true }).click();
  await expect(modal.getByLabel('Đoạn đọc', { exact: true })).toHaveValue(passage);
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await modal.getByRole('button', { name: 'Lưu & thêm câu cùng bài', exact: true }).click();
  await expect(modal.getByLabel('Câu hỏi + phương án')).toHaveValue('');
  await expect(modal.getByLabel('Đoạn đọc', { exact: true })).toHaveValue(passage);
  await modal.getByLabel('Câu hỏi + phương án').fill('When is the workshop?\n' + options.join('\n'));
  // Add an image for this source; then toggling modes preserves both drafts.
  await modal.getByRole('button', { name: 'Ảnh', exact: true }).click();
  await modal.getByLabel('Chọn ảnh Part 7').setInputFiles(image);
  await modal.getByRole('button', { name: 'Văn bản', exact: true }).click();
  await expect(modal.getByLabel('Đoạn đọc', { exact: true })).toHaveValue(passage);
  await modal.getByRole('button', { name: 'Ảnh', exact: true }).click();
  await expect(modal.getByRole('img', { name: 'Ảnh Part 7 1', exact: true })).toBeVisible();
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath('split-context-form.png') });
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByText('Đoạn đọc / ngữ cảnh', { exact: true })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Lưu lỗi sai', exact: true }).click();
  const result = await page.evaluate(() => ({ saved: JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes,
    calls: (window as Window & { __sources: Array<{input: {context: string}; images: unknown[]; sourceImageIds: string[]}> }).__sources }));
  expect(result.calls).toHaveLength(2);
  expect(result.calls[0].input.context).toBe(passage); expect(result.calls[0].sourceImageIds).toEqual([]); expect(result.calls[0].images).toEqual([]);
  expect(result.calls[1].input.context).toBe(''); expect(result.calls[1].sourceImageIds).toEqual([id]);
  const textCard = result.saved.find((entry: { question: string }) => entry.question === 'Which workshop is free?');
  const imageCard = result.saved.find((entry: { question: string }) => entry.question === 'When is the workshop?');
  expect(textCard.context).toBe(passage); expect(textCard.sourceImageIds).toBeUndefined();
  expect(imageCard.context).toBe(''); expect(imageCard.sourceImageIds).toEqual([id]);
});

test('Part 5 context is optional and collapsed; Part 6 manual save keeps the question and reading separate', async ({ page }) => {
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Thêm câu sai', exact: true }).click();
  const modal = page.getByRole('dialog'); await chooseNoteSource(modal);
  await modal.getByRole('button', { name: 'Part 5', exact: true }).click();
  await expect(modal.getByLabel('Ngữ cảnh', { exact: true })).toBeHidden();
  await modal.locator('summary', { hasText: 'Ngữ cảnh' }).click();
  await expect(modal.getByLabel('Ngữ cảnh', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Part 6', exact: true }).click();
  await modal.getByLabel('Câu hỏi + phương án').fill('The workshop is ____.\n' + options.join('\n'));
  await modal.getByLabel('Đoạn đọc', { exact: true }).fill(passage);
  await modal.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.question).toBe('The workshop is ____.'); expect(saved.context).toBe(passage);
});
