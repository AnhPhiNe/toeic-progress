import { chooseNoteSource } from './helpers/noteSource';
import { test, expect, type Page } from '@playwright/test';

async function seed(page: Page, count = 2) {
  await page.goto('/so-tay');
  await page.evaluate(count => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = Array.from({ length: count }, (_, index) => ({ id: `receipt-${index}`, part: 5, category: 'OTHER', status: 'NEEDS_REVIEW',
      questionContext: `Reports ${index + 1} should ____ submitted.`, options: ['(A) are', '(B) be'], correctAnswer: '(B) be',
      userMistake: '', answerSource: 'PROVIDED', tags: [], sourceTestName: 'ETS Test 1', createdAt: now, updatedAt: now, deletedAt: null }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  }, count);
  await page.reload();
}

async function failWrites(page: Page) {
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as typeof window & { restoreReceiptWrites?: () => void }).restoreReceiptWrites = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'toeic_progress_bundle_v3') throw new DOMException('Receipt save failed', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
}
async function restoreWrites(page: Page) {
  await page.evaluate(() => (window as typeof window & { restoreReceiptWrites?: () => void }).restoreReceiptWrites?.());
}

test('marking mastered confirms a real save without moving the list and failure never claims success', async ({ page }) => {
  await seed(page);
  const first = page.getByRole('button', { name: 'Mở câu: Reports 1 should ____ submitted.', exact: true });
  const before = await first.boundingBox();
  await page.getByRole('button', { name: 'Tùy chọn thẻ', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'Đánh dấu đã thuộc', exact: true }).click();
  await expect(page.getByText('Đã đánh dấu Thông suốt', { exact: true })).toBeVisible();
  expect((await first.boundingBox())!.y).toBe(before!.y);
  const status = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0].status);
  expect(status).toBe('MASTERED');
  await page.getByRole('button', { name: 'Đóng thông báo', exact: true }).click();
  await failWrites(page);
  await page.getByRole('button', { name: 'Tùy chọn thẻ', exact: true }).nth(1).click();
  await page.getByRole('menuitem', { name: 'Đánh dấu đã thuộc', exact: true }).click();
  await expect(page.locator('.notebook-feedback.is-error')).toBeVisible();
  await expect(page.getByText('Đã đánh dấu Thông suốt', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[1].status)).toBe('NEEDS_REVIEW');
  await restoreWrites(page);
});

test('save confirmation appears only after persistence, respects reduced motion and editing uses a dismissible timed receipt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, 1);
  await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const editor = page.getByRole('dialog');
  await chooseNoteSource(editor); await editor.getByLabel('Part', { exact: true }).selectOption('5');
  await editor.getByLabel('Câu hỏi + phương án').fill('Part 5:\nForms should ____ submitted.\n(A) are\n(B) be');

  await editor.getByText('Đáp án đúng từ đề', { exact: false }).click();
  await editor.getByRole('button', { name: 'Đáp án từ đề: B', exact: true }).click();
  await failWrites(page);
  await editor.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
  await expect(editor.getByRole('alert')).toBeVisible();
  await expect(editor.locator('.study-success-mark')).toHaveCount(0);
  await expect(editor.getByLabel('Câu hỏi + phương án')).toHaveValue(/Forms should/);
  await restoreWrites(page);
  await editor.getByRole('button', { name: 'Lưu thủ công', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('Đã lưu lỗi sai');
  expect(await editor.locator('.study-success-mark').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await editor.getByRole('button', { name: 'Đóng', exact: true }).last().click();
  await page.getByRole('button', { name: 'Tùy chọn thẻ', exact: true }).first().click();
  await page.getByRole('menuitem', { name: 'Sửa', exact: true }).click();
  await page.clock.install();
  await editor.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(page.getByText('Đã lưu thay đổi', { exact: true })).toBeVisible();
  await page.clock.fastForward(4100);
  await expect(page.getByText('Đã lưu thay đổi', { exact: true })).toHaveCount(0);
});

test('review completion reports actual results and an interrupted session shows no completion receipt', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await page.getByRole('button', { name: 'Ôn 2 thẻ', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Ôn tập', exact: true });
  await review.getByRole('button', { name: /^B\s*be/ }).click();
  await expect(review.locator('.study-success-mark')).toHaveCount(0);
  await review.getByRole('button', { name: 'Tiếp', exact: true }).click();
  await review.getByRole('button', { name: /^A\s*are/ }).click();
  await review.getByRole('button', { name: 'Xem kết quả', exact: true }).click();
  await expect(review.getByRole('status')).toContainText('Xong 2 thẻ');
  await expect(review.getByRole('status')).toContainText('Trả lời đúng 1/2. Lịch ôn đã được cập nhật.');
  await expect(review.getByRole('button', { name: 'Đóng', exact: true })).toBeFocused();
  expect(await review.locator('.study-success-mark').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('review-completion-mobile.png'), fullPage: true });
  await review.getByRole('button', { name: 'Đóng', exact: true }).click();
  await seed(page, 1);
  await page.getByRole('button', { name: 'Ôn 1 thẻ', exact: true }).click();
  await review.getByRole('button', { name: 'Đóng phiên ôn tập', exact: true }).click();
  await expect(page.getByText(/^Xong \d+ thẻ/)).toHaveCount(0);
});

test('skipping an unavailable card does not celebrate or report a schedule update', async ({ page }) => {
  await seed(page, 1);
  await page.getByRole('button', { name: 'Ôn 1 thẻ', exact: true }).click();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.mistakes[0].deletedAt = new Date().toISOString();
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  const review = page.getByRole('dialog', { name: 'Ôn tập', exact: true });
  await review.getByRole('button', { name: /^B\s*be/ }).click();
  await expect(review.getByRole('alert')).toBeVisible();
  await review.getByRole('button', { name: 'Tải lại thẻ', exact: true }).click();
  await expect(review.getByRole('status')).toContainText('Chưa có thẻ nào được ôn');
  await expect(review.getByRole('status')).toContainText('Không có lịch ôn nào được cập nhật.');
  await expect(review.locator('.study-success-mark')).toHaveCount(0);
});

test('a correct early review reports completed practice while keeping its existing schedule', async ({ page }) => {
  await seed(page, 1);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.mistakes[0].nextReviewDate = '2099-01-01';
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Tùy chọn thẻ', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Ôn câu này', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Ôn tập', exact: true });
  await review.getByRole('button', { name: /^B\s*be/ }).click();
  await review.getByRole('button', { name: 'Xem kết quả', exact: true }).click();
  await expect(review.getByRole('status')).toContainText('Xong 1 thẻ');
  await expect(review.getByRole('status')).toContainText('Trả lời đúng 1/1. Lịch ôn giữ nguyên.');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0].nextReviewDate)).toBe('2099-01-01');
});

test('save-and-add-next confirms inside the existing header and keeps the next form ready', async ({ page }) => {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true }; }
    export async function extractMistakeWithAI(text, captcha, input) {
      return { usage: {}, draft: { part: 5, questionContext: input.question, options: input.options,
        correctAnswer: input.options[1], answerSource: 'AI_PROPOSED', userMistake: '', category: 'OTHER',
        tags: [], trapTip: '', optionNotes: [], explanation: null, missingInformation: [] } };
    }
  ` }));
  await page.goto('/so-tay');
  await page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true }).click();
  const editor = page.getByRole('dialog');
  const heading = editor.getByRole('heading');
  const before = await heading.boundingBox();
  await chooseNoteSource(editor); await editor.getByLabel('Part', { exact: true }).selectOption('5');
  await editor.getByLabel('Câu hỏi + phương án').fill('Part 5:\nForms should ____ submitted.\n(A) are\n(B) be');

  await editor.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await editor.getByRole('button', { name: 'Lưu & thêm tiếp', exact: true }).click();
  await expect(editor.getByRole('status')).toHaveText('Đã lưu ghi chú');
  expect((await heading.boundingBox())!.height).toBe(before!.height);
  await expect(editor.getByLabel('Câu hỏi + phương án')).toHaveValue('');
  await expect(editor.getByLabel('Câu hỏi + phương án')).toBeFocused();
  await expect(editor.getByLabel('Part', { exact: true })).toHaveValue('5');
  await expect(editor.getByRole('button', { name: 'Chọn đề', exact: true })).toHaveText('ETS Test 1');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.length)).toBe(1);
  await editor.getByLabel('Câu hỏi + phương án').fill('Next question');
  await expect(editor.getByRole('status')).toHaveCount(0);
});
