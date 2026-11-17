import { chooseNoteSource } from './helpers/noteSource';
import { PHONE_VIEWPORT, noteModal, openAnswerKey, openCard, openNoteForm } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';
import { test, expect, type Page } from '@playwright/test';

async function seed(page: Page, count = 2) {
  await gotoPage(page, '/so-tay');
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

test('marking mastered confirms a real save and failure never claims success', async ({ page }) => {
  await seed(page);
  await openCard(page, 'Reports 1 should');
  await page.getByRole('button', { name: 'Đã thuộc', exact: true }).click();
  await expect(page.getByText('Đã chuyển sang Đã thuộc', { exact: true })).toBeVisible();
  // The card stays open and now offers to start it again.
  await expect(page.getByRole('button', { name: 'Ôn lại từ đầu', exact: true })).toBeVisible();
  const status = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0].status);
  expect(status).toBe('MASTERED');
  await page.getByRole('button', { name: 'Đóng thông báo', exact: true }).click();
  await page.getByRole('button', { name: '← Sổ tay', exact: true }).click();
  await failWrites(page);
  await openCard(page, 'Reports 2 should');
  await page.getByRole('button', { name: 'Đã thuộc', exact: true }).click();
  await expect(page.locator('.notebook-feedback.is-error')).toBeVisible();
  await expect(page.getByText('Đã chuyển sang Đã thuộc', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[1].status)).toBe('NEEDS_REVIEW');
  await restoreWrites(page);
});

test('save confirmation appears only after persistence, respects reduced motion and editing uses a dismissible timed receipt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(PHONE_VIEWPORT);
  await seed(page, 1);
  const editor = await openNoteForm(page);
  await chooseNoteSource(editor); await editor.getByRole('button', { name: 'Part 5', exact: true }).click();
  await editor.getByLabel('Câu hỏi + phương án').fill('Part 5:\nForms should ____ submitted.\n(A) are\n(B) be');

  await openAnswerKey(editor);
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
  await openCard(page, undefined, 0);
  await page.getByRole('button', { name: 'Sửa', exact: true }).click();
  await page.clock.install();
  await noteModal(page).getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(page.getByText('Đã lưu thay đổi', { exact: true })).toBeVisible();
  await page.clock.fastForward(4100);
  await expect(page.getByText('Đã lưu thay đổi', { exact: true })).toHaveCount(0);
});

for (const width of [1280, 375]) test(`review completion reports actual results and an interrupted session shows no completion receipt at ${width}`, async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width, height: 812 });
  await seed(page);
  await page.getByRole('button', { name: /^Ôn 2 câu/ }).click();
  const review = page.getByRole('dialog', { name: 'Ôn câu sai', exact: true });
  await review.getByRole('button', { name: /^\(?B\)?\s*be/ }).click();
  await review.getByRole('button', { name: 'Hiểu rồi', exact: true }).click();
  await review.getByRole('button', { name: /^\(?A\)?\s*are/ }).click();
  await review.getByRole('button', { name: 'Vẫn chưa chắc', exact: true }).click();
  const done = page.getByRole('dialog', { name: 'Ôn xong', exact: true });
  await expect(done).toContainText('Xong 2 câu!');
  await expect(done).toContainText('Hiểu rồi 1');
  await expect(done).toContainText('Ôn lại ngày mai 1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`review-completion-${width}.png`), fullPage: true });
  await done.getByRole('button', { name: 'Về Sổ tay', exact: true }).click();
  await seed(page, 1);
  await page.getByRole('button', { name: /^Ôn 1 câu/ }).click();
  await review.getByRole('button', { name: /Thoát/ }).click();
  await expect(page.getByText(/^Xong \d+ câu/)).toHaveCount(0);
});

test('skipping an unavailable card does not celebrate or report a schedule update', async ({ page }) => {
  await seed(page, 1);
  await page.getByRole('button', { name: /^Ôn 1 câu/ }).click();
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.mistakes[0].deletedAt = new Date().toISOString();
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  const review = page.getByRole('dialog', { name: 'Ôn câu sai', exact: true });
  await review.getByRole('button', { name: /^\(B\)\s*be/ }).click();
  await review.getByRole('button', { name: 'Hiểu rồi', exact: true }).click();
  await expect(review.getByRole('alert')).toContainText('Thẻ đã bị xóa');
  await expect(page.getByRole('dialog', { name: 'Ôn xong' })).toHaveCount(0);
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0])).reviewCount).toBeUndefined();
});

// Removed with the redesign: "a correct early review ... keeping its existing schedule". Reviewing a card that is not due yet is no
// longer offered (the card page shows "Ôn câu này" only when it is due and the notebook starts only due cards), so it cannot be reached.

test('save-and-add-next confirms inside the existing header and keeps the next form ready', async ({ page }) => {
  await page.route('**/src/features/mistakes/services/aiMistakeExtractor.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    export async function getAIConfiguration() { return { provider: 'openai', structuredInput: true }; }
    export async function extractMistakeWithAI(text, captcha, input) {
      return { usage: {}, draft: { part: 5, questionContext: input.question, options: input.options,
        correctAnswer: input.options[1], answerSource: 'AI_PROPOSED', userMistake: '', category: 'OTHER',
        tags: [], trapTip: '', optionNotes: [], explanation: null, missingInformation: [] } };
    }
  ` }));
  await page.setViewportSize(PHONE_VIEWPORT);
  await gotoPage(page, '/so-tay');
  const editor = await openNoteForm(page);
  const heading = editor.getByRole('heading');
  const before = await heading.boundingBox();
  await chooseNoteSource(editor); await editor.getByRole('button', { name: 'Part 5', exact: true }).click();
  await editor.getByLabel('Câu hỏi + phương án').fill('Part 5:\nForms should ____ submitted.\n(A) are\n(B) be');

  await editor.getByRole('button', { name: 'Phân tích với AI', exact: true }).click();
  await editor.getByRole('button', { name: 'Lưu & thêm tiếp', exact: true }).click();
  await expect(editor.getByRole('status').filter({ hasText: 'Đã lưu ghi chú' })).toHaveText('Đã lưu ghi chú');
  // The phone form's receipt grows the header by 2px (the check mark is taller than its text line); more than that would be a jump.
  expect((await heading.boundingBox())!.height).toBeLessThanOrEqual(before!.height + 2);
  await expect(editor.getByLabel('Câu hỏi + phương án')).toHaveValue('');
  await expect(editor.getByLabel('Câu hỏi + phương án')).toBeFocused();
  await expect(editor.getByRole('button', { name: 'Part 5', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(editor.getByRole('button', { name: 'Chọn đề', exact: true })).toHaveText('ETS Test 1');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.length)).toBe(1);
  await editor.getByLabel('Câu hỏi + phương án').fill('Next question');
  await expect(editor.getByRole('status').filter({ hasText: 'Đã lưu ghi chú' })).toHaveCount(0);
});
