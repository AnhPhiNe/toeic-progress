import { chooseNoteSource } from './helpers/noteSource';
import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

const options = ['(A) A man is standing.', '(B) A man is seated at a table.', '(C) Two people are talking.', '(D) A woman is cooking.'];
const description = 'Một người đang ngồi trước bàn; có một chiếc cốc trên bàn.';

test('Part 1 uses one picture and four pasted options, saves a labelled AI description, and remains reviewable', async ({ page }, testInfo) => {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts*', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true, part1Images: true }; }
    export async function extractMistakeWithAI(text, captcha, input, images) {
      window.__pictureRequest = { input, count: images.length };
      return { usage: {}, draft: { part: 1, question: input.question, context: ${JSON.stringify(description)},
        questionContext: input.question + '\\n\\n' + ${JSON.stringify(description)}, options: input.options,
        correctAnswer: input.options[1], answerSource: 'AI_PROPOSED', userChoice: 'D', userMistake: '', category: 'OTHER',
        tags: [], trapTip: 'Phân biệt seated với standing.', optionNotes: [], explanation: null,
        missingInformation: ['Mô tả tranh do AI viết; đối chiếu với tranh trước khi lưu.'] } };
    }` }));
  await page.goto('/so-tay'); await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const modal = page.getByRole('dialog');
  await chooseNoteSource(modal); await modal.getByLabel('Part', { exact: true }).selectOption('1');
  await modal.getByLabel('Phương án nghe A–D').fill(options.join('\n'));
  await expect(modal.getByText('Dán bốn mô tả nghe A–D bằng văn bản và thêm một ảnh tranh. Không cần nhập câu hỏi.', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Bạn chọn A', exact: true }).click();
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText('Thêm một ảnh tranh');
  const picker = modal.getByLabel('Chọn ảnh Part 1');
  await picker.setInputFiles(resolve('tests/fixtures/part1-seated-person.png'));
  await expect(modal.getByRole('img', { name: 'Ảnh Part 1 1', exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Thêm ảnh', exact: true })).toBeDisabled();
  await modal.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await expect(modal.getByText('Part 1 · Mô tả tranh', { exact: true })).toBeVisible();
  await expect(modal.getByText('Mô tả tranh · AI', { exact: true })).toHaveCount(0);
  await expect(modal.getByText(description, { exact: true })).toHaveCount(0);
  await modal.getByText('Đối chiếu ảnh (1)', { exact: true }).click();
  await expect(modal.getByRole('img', { name: 'Ảnh nguồn Part 1 1', exact: true })).toBeVisible();
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('part1-picture-preview.png'), fullPage: true });
  const sent = await page.evaluate(() => (window as Window & { __pictureRequest: { input: { part: number; question: string; options: string[] }; count: number } }).__pictureRequest);
  expect(sent.count).toBe(1); expect(sent.input.part).toBe(1); expect(sent.input.options).toEqual(options);
  await modal.getByRole('button', { name: 'Lưu & thêm tiếp', exact: true }).click();
  await expect(modal.getByLabel('Part', { exact: true })).toHaveValue('1');
  await expect(modal.getByLabel('Phương án nghe A–D')).toBeFocused();
  await expect(modal.getByLabel('Phương án nghe A–D')).toHaveValue('');
  await expect(modal.getByLabel('Chọn ảnh Part 1')).toBeAttached();
  await expect(modal.getByRole('img', { name: 'Ảnh Part 1 1', exact: true })).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0]);
  expect(saved.part).toBe(1); expect(saved.context).toBe(description); expect(saved.userChoice).toBe('A'); expect(saved.options).toEqual(options);
  expect(JSON.stringify(saved)).not.toContain('data:image');
  await page.reload(); await page.getByRole('button', { name: 'Ôn 1 thẻ', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Ôn tập' });
  await expect(review.getByText(description, { exact: true })).toBeVisible();
  await review.getByRole('button', { name: /^B\s+A man is seated/ }).click();
  await expect(review.getByRole('status')).toContainText('Đúng');
});
