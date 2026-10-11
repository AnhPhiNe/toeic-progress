import { chooseNoteSource } from './helpers/noteSource';
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const question = 'Which workshop is free for registered members?';
const options = ['(A) Project Planning.', '(B) Business Writing.', '(C) Data Basics.', '(D) Team Leadership.'];
const context = 'Registered members pay the member rate.\nData Basics: member rate $0; public rate $20.';
const notice = resolve('tests/fixtures/part7-notice.png');
const table = resolve('tests/fixtures/part7-table-question.png');

async function mockAI(page: Page, capable = true) {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts', route => route.fulfill({
    contentType: 'application/javascript', body: `
      export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, part7Images: ${capable} }; }
      export async function extractMistakeWithAI(text, captcha, input, images) {
        window.__visionCalls = (window.__visionCalls || 0) + 1;
        window.__visionInput = { input, images };
        const options = ${JSON.stringify(options)};
        return { usage: {}, draft: { part: 7, question: ${JSON.stringify(question)}, context: ${JSON.stringify(context)},
          questionContext: ${JSON.stringify(question + '\n\n' + context)}, options,
          correctAnswer: options[2], answerSource: 'AI_PROPOSED', userChoice: 'D', userMistake: 'Invented',
          category: 'OTHER', tags: [], trapTip: 'Read the member rate.', optionNotes: [], explanation: null,
          missingInformation: ['Nội dung trích từ ảnh; kiểm tra chữ, số và phương án trước khi lưu.'] } };
      }`
  }));
  await page.goto('/so-tay');
  await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  await chooseNoteSource(page.getByRole('dialog'));
  await page.getByLabel('Part', { exact: true }).selectOption('7');
}

test('Part 7 requires pasted text and uses images solely for context while saving an image-free card', async ({ page }, testInfo) => {
  await mockAI(page);
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Chọn ảnh Part 7').setInputFiles([notice, table]);
  await expect(modal.getByRole('img', { name: 'Ảnh Part 7 2', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Dán câu hỏi và phương án');
  await expect(modal.getByRole('button', { name: 'Bạn chọn A', exact: true })).toBeDisabled();
  await modal.getByLabel('Câu hỏi + phương án').fill(question + '\n' + options.join('\n'));
  await modal.getByRole('button', { name: 'Bạn chọn A', exact: true }).click();
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Phân tích ảnh trước khi lưu');
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByRole('heading', { name: 'Kiểm tra và lưu' })).toBeVisible();
  await expect(modal.getByText(question, { exact: true })).toBeVisible();
  await expect(modal.getByText('AI đề xuất', { exact: true })).toBeVisible();
  await modal.getByText('Đối chiếu ảnh (2)', { exact: true }).click();
  await expect(modal.getByRole('img', { name: 'Ảnh nguồn Part 7 1', exact: true })).toBeVisible();
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('part7-image-preview.png'), fullPage: true });
  const call = await page.evaluate(() => {
    const fixture = window as Window & { __visionCalls: number; __visionInput: { input: { part: number; options: string[]; userChoice: string }; images: Array<{ dataUrl: string }> } };
    return { count: fixture.__visionCalls, value: fixture.__visionInput };
  });
  expect(call.count).toBe(1); expect(call.value.input.part).toBe(7);
  expect(call.value.input.options).toEqual(options); expect(call.value.input.userChoice).toBe('A');
  expect(call.value.images).toHaveLength(2);
  expect(call.value.images.every(image => image.dataUrl.startsWith('data:image/jpeg;base64,'))).toBe(true);
  // An OCR warning requires checking the preview, not opening the manual answer editor.
  await modal.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click();
  await expect(modal.getByRole('heading', { name: 'Kiểm tra và lưu' })).toBeVisible();
  await expect(modal.getByText('Chỉnh đáp án / lời giải', { exact: true })).toHaveCount(0);
  await expect(modal.getByLabel('Giải thích / mẹo ghi nhớ', { exact: true })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Lưu lỗi sai', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.question).toBe(question); expect(saved.context).toBe(context); expect(saved.options).toEqual(options);
  expect(saved.userChoice).toBe('A'); expect(saved.userMistake).toBe(options[0]); expect(saved.correctAnswer).toBe(options[2]);
  expect(JSON.stringify(saved)).not.toContain('data:image'); expect(saved.images).toBeUndefined();
  await page.reload(); await page.getByRole('button', { name: `Mở câu: ${question}`, exact: true }).click();
  await page.getByRole('button', { name: 'Ôn câu này', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Ôn tập' });
  await expect(review.getByText(context, { exact: true })).toBeVisible();
  await review.getByRole('button', { name: /^C\s+Data Basics/ }).click();
  await expect(review.getByRole('status')).toContainText('Đúng');
});

test('invalid files and too many images retain the current attachments; changing an image invalidates quick save', async ({ page }) => {
  await mockAI(page);
  const modal = page.getByRole('dialog'), picker = modal.getByLabel('Chọn ảnh Part 7');
  await picker.setInputFiles(notice);
  await expect(modal.getByRole('img', { name: 'Ảnh Part 7 1', exact: true })).toBeVisible();
  await picker.setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(modal.getByRole('alert')).toContainText('PNG, JPG hoặc WebP');
  await expect(modal.getByRole('img', { name: 'Ảnh Part 7 1', exact: true })).toBeVisible();
  await picker.setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(modal.getByRole('alert')).toContainText('tối đa 5 MB');
  await expect(modal.getByRole('img', { name: 'Ảnh Part 7 1', exact: true })).toBeVisible();
  await picker.setInputFiles([notice, table, notice]);
  await expect(modal.getByRole('alert')).toContainText('tối đa 3 ảnh');
  await modal.getByLabel('Câu hỏi + phương án').fill(question + '\n' + options.join('\n'));

  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await modal.getByRole('button', { name: 'Quay lại', exact: true }).click();
  await modal.getByRole('button', { name: 'Bỏ ảnh 1', exact: true }).click();
  await picker.setInputFiles(table);
  await expect(modal.getByRole('img', { name: 'Ảnh Part 7 1', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Lưu nhanh', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Phân tích ảnh trước khi lưu');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes)).toEqual([]);
});

test('clipboard paste works and an older backend cannot silently drop the image', async ({ page }) => {
  await mockAI(page, false);
  const bytes = (await readFile(notice)).toString('base64');
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Câu hỏi + phương án').evaluate((element, encoded) => {
    const data = new DataTransfer();
    const values = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    data.items.add(new File([values], 'clipboard.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, bytes);
  await expect(modal.getByRole('img', { name: 'Ảnh Part 7 1', exact: true })).toBeVisible();
  await modal.getByLabel('Câu hỏi + phương án').fill(question + '\n' + options.join('\n'));

  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Backend chưa hỗ trợ ảnh Part 7');
  await expect(modal.getByRole('img', { name: 'Ảnh Part 7 1', exact: true })).toBeVisible();
});

test('the illustrated area supports file picking, keyboard paste and dropping without calling AI', async ({ page }, testInfo) => {
  await mockAI(page);
  const modal = page.getByRole('dialog');
  const group = modal.getByRole('group', { name: 'Ảnh ngữ cảnh · Part 7', exact: true });
  const zone = modal.getByRole('button', { name: 'Vùng thêm ảnh Part 7', exact: true });
  await expect(zone).toContainText('Kéo ảnh vào đây');
  await zone.focus(); await expect(zone).toBeFocused();
  const chooser = page.waitForEvent('filechooser');
  await zone.press('Enter');
  await (await chooser).setFiles(notice);
  await expect(modal.getByRole('img', { name: 'Ảnh Part 7 1', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Bỏ ảnh 1', exact: true }).click();

  const encoded = (await readFile(notice)).toString('base64');
  await zone.focus();
  await zone.evaluate((element, encoded) => {
    const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
    const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, encoded);
  await expect(modal.getByRole('img', { name: 'Ảnh Part 7 1', exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Bỏ ảnh 1', exact: true }).click();

  const transfer = await page.evaluateHandle(encoded => {
    const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
    const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
    return transfer;
  }, encoded);
  await group.dispatchEvent('dragenter', { dataTransfer: transfer });
  await expect(zone).toContainText('Thả ảnh để thêm');
  await group.dispatchEvent('dragover', { dataTransfer: transfer });
  await group.dispatchEvent('drop', { dataTransfer: transfer });
  await expect(modal.getByRole('img', { name: 'Ảnh Part 7 1', exact: true })).toBeVisible();
  await expect(zone).not.toContainText('Thả ảnh để thêm');
  await transfer.dispose();
  const invalid = await page.evaluateHandle(() => {
    const transfer = new DataTransfer(); transfer.items.add(new File(['<svg/>'], 'invalid.svg', { type: 'image/svg+xml' }));
    return transfer;
  });
  await group.dispatchEvent('drop', { dataTransfer: invalid });
  await expect(modal.getByRole('alert')).toContainText('PNG, JPG hoặc WebP');
  await expect(modal.getByRole('img', { name: 'Ảnh Part 7 1', exact: true })).toBeVisible();
  await invalid.dispose();
  expect(await page.evaluate(() => (window as Window & { __visionCalls?: number }).__visionCalls ?? 0)).toBe(0);
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await modal.getByRole('button', { name: 'Bỏ ảnh 1', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('part7-image-dropzone.png'), fullPage: true });
});
