import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chooseNoteSource } from './helpers/noteSource';

const ids = ['a'.repeat(64), 'b'.repeat(64)];
const fixture = resolve('tests/fixtures/part7-notice.png');
const question = 'Which workshop is free?';
const options = ['(A) Writing.', '(B) Planning.', '(C) Data Basics.', '(D) Leadership.'];

async function mockImages(page: Page, failure = false) {
  await page.route('**/src/features/mistakes/services/sourceImages.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function sourceImageAccount() { return 'owner'; }
    export async function uploadSourceImages(images) {
      window.__uploads = (window.__uploads || 0) + 1;
      if (${failure} && window.__uploads === 1) throw new Error('Chưa lưu được ảnh nguồn. Ảnh đang chọn được giữ để thử lại.');
      return ${JSON.stringify(ids)}.slice(0, images.length);
    }
    export async function sourceImageUrls(ids) { return ids.map(id => ({ id, url: '/__image/' + id })); }
  ` }));
  await page.route('**/__image/*', async route => route.fulfill({ contentType: 'image/png', body: await readFile(fixture) }));
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, part7Images: true, part1Images: true, persistentImages: true }; }
    export async function extractMistakeWithAI(text, captcha, input, images, sourceImageIds) {
      window.__imageCalls = [...(window.__imageCalls || []), { input, images, sourceImageIds }];
      return { usage: {}, draft: { part: input.part, question: input.question, context: 'OCR text should not display.', questionContext: input.question,
        options: input.options, correctAnswer: input.options[2], answerSource: 'AI_PROPOSED', userMistake: '', category: 'OTHER', tags: [],
        trapTip: 'Read the image.', optionNotes: [], explanation: null, missingInformation: [] } };
    }
  ` }));
}

test('Part 7 retains source images after save/reload/review and reuses them for each new question without OCR', async ({ page }, testInfo) => {
  await mockImages(page); await page.goto('/so-tay');
  await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const modal = page.getByRole('dialog'); await chooseNoteSource(modal, 'ETS Images');
  await modal.getByLabel('Part', { exact: true }).selectOption('7');
  await modal.getByRole('button', { name: 'Ảnh', exact: true }).click();
  await modal.getByLabel('Câu hỏi + phương án').fill('**Câu hỏi**\n**178**\n**' + question + '**\n' + options.join('&#x20;\n') + '\u00a0');
  await modal.getByLabel('Chọn ảnh Part 7').setInputFiles([fixture, resolve('tests/fixtures/part7-table-question.png')]);
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByText('Đoạn đọc / ngữ cảnh', { exact: true })).toHaveCount(0);
  await expect(modal.getByRole('img', { name: 'Ảnh nguồn Part 7 1', exact: true })).toBeHidden();
  await modal.getByText('Ảnh nguồn (2)', { exact: true }).click();
  await expect(modal.getByRole('img', { name: 'Ảnh nguồn Part 7 1', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Ảnh 2', exact: true }).click();
  await expect(modal.getByRole('img', { name: 'Ảnh nguồn Part 7 2', exact: true })).toBeVisible();
  await expect(modal.getByRole('link', { name: 'Mở ảnh lớn', exact: true })).toHaveAttribute('target', '_blank');
  await page.screenshot({ path: testInfo.outputPath('persistent-image-preview.png') });
  await modal.getByRole('button', { name: 'Lưu & thêm câu cùng bài', exact: true }).click();
  await expect(modal.getByText('Đang dùng bài đọc trước', { exact: true })).toBeVisible();
  await expect(modal.getByLabel('Chọn ảnh Part 7')).toHaveCount(0);
  await modal.getByLabel('Câu hỏi + phương án').fill('How can members register?\n' + options.join('\n'));
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await modal.getByRole('button', { name: 'Lưu lỗi sai', exact: true }).click();
  const calls = await page.evaluate(() => {
    const fixture = window as Window & { __imageCalls: Array<{ images: unknown[]; sourceImageIds: string[]; input: { context: string } }>; __uploads: number };
    return { __imageCalls: fixture.__imageCalls, __uploads: fixture.__uploads };
  });
  expect(calls.__uploads).toBe(1); expect(calls.__imageCalls).toHaveLength(2);
  expect(calls.__imageCalls.every(call => call.images.length === 0 && call.sourceImageIds.join(',') === ids.join(',') && call.input.context === '')).toBe(true);
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes);
  expect(saved).toHaveLength(2);
  for (const entry of saved) { expect(entry.sourceImageIds).toEqual(ids); expect(entry.context).toBe(''); expect(JSON.stringify(entry)).not.toContain('data:image'); }
  const row = page.getByRole('button', { name: `Mở câu: ${question}`, exact: true }); await row.click();
  const card = page.locator('.notebook-card').filter({ hasText: question });
  await expect(card.getByRole('img', { name: 'Ảnh nguồn Part 7 1', exact: true })).toBeHidden();
  await card.getByText('Ảnh nguồn (2)', { exact: true }).click();
  await expect(card.getByRole('img', { name: 'Ảnh nguồn Part 7 1', exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Ôn câu này', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Ôn tập', exact: true });
  await expect(review.getByRole('img', { name: 'Ảnh nguồn Part 7 1', exact: true })).toBeHidden();
  await review.getByText('Ảnh nguồn (2)', { exact: true }).click();
  await expect(review.getByRole('img', { name: 'Ảnh nguồn Part 7 1', exact: true })).toBeVisible();
  await expect(review.getByText('Đoạn đọc / ngữ cảnh', { exact: true })).toHaveCount(0);
  for (const width of [375, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
});

test('upload failure preserves the selected image and manual save can retry without an AI call', async ({ page }) => {
  await mockImages(page, true); await page.goto('/so-tay');
  await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const modal = page.getByRole('dialog'); await chooseNoteSource(modal);
  await modal.getByLabel('Part', { exact: true }).selectOption('7');
  await modal.getByRole('button', { name: 'Ảnh', exact: true }).click();
  await modal.getByLabel('Câu hỏi + phương án').fill(question + '\n' + options.join('\n'));
  await modal.getByLabel('Chọn ảnh Part 7').setInputFiles(fixture);
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Chưa lưu được ảnh nguồn');
  await expect(modal.getByRole('img', { name: 'Ảnh Part 7 1', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.length)).toBe(0);
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click();
  await expect(modal.getByRole('status')).toContainText('Đã lưu lỗi sai');
  expect(await page.evaluate(() => '__imageCalls' in window)).toBe(false);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.sourceImageIds).toEqual(ids.slice(0, 1)); expect(saved.correctAnswer).toBe('');
});
