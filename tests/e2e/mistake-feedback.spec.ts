import { test, expect, type Page } from '@playwright/test';
import { PHONE_VIEWPORT, noteModal, openCard, openManualForm, setManualSource } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';

async function seed(page: Page, count = 2) {
  await gotoPage(page, '/so-tay');
  await page.evaluate(count => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = Array.from({ length: count }, (_, index) => ({
      id: `feedback-${index}`, part: 5, category: 'OTHER', status: 'NEEDS_REVIEW',
      questionContext: `Reports ${index + 1} should ____ submitted.`, options: ['(A) are', '(B) be'],
      correctAnswer: '(B) be', answerSource: 'PROVIDED', userMistake: '', tags: [], sourceTestName: 'ETS Test 1',
      nextReviewDate: '2020-01-01', reviewStage: 0, createdAt: now, updatedAt: now, deletedAt: null
    }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  }, count);
  await page.reload();
}

const failWrites = (page: Page) => page.evaluate(() => {
  const original = Storage.prototype.setItem;
  (window as Window & { __origSetItem?: typeof Storage.prototype.setItem }).__origSetItem = original;
  Storage.prototype.setItem = function (key: string, value: string) {
    if (key === 'toeic_progress_bundle_v3') throw new DOMException('full', 'QuotaExceededError');
    return original.call(this, key, value);
  };
});

const restoreWrites = (page: Page) => page.evaluate(() => {
  const w = window as Window & { __origSetItem?: typeof Storage.prototype.setItem };
  if (w.__origSetItem) Storage.prototype.setItem = w.__origSetItem;
});

test('marking mastered confirms a real save and failure never claims success', async ({ page }) => {
  await seed(page);
  await openCard(page, 'Reports 1 should');
  await page.getByRole('button', { name: 'Đã thuộc', exact: true }).click();
  await expect(page.getByText('Đã chuyển sang Đã thuộc', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ôn lại từ đầu', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0].status)).toBe('MASTERED');
  await page.getByRole('button', { name: 'Đóng thông báo', exact: true }).click();
  await page.locator('.cd-back').click();

  await failWrites(page);
  await openCard(page, 'Reports 2 should');
  await page.getByRole('button', { name: 'Đã thuộc', exact: true }).click();
  await expect(page.locator('.notebook-feedback.is-error')).toBeVisible();
  await expect(page.getByText('Đã chuyển sang Đã thuộc', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[1].status)).toBe('NEEDS_REVIEW');
  await restoreWrites(page);
});

test('save confirmation appears only after persistence and editing uses a dismissible timed receipt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(PHONE_VIEWPORT);
  await seed(page, 1);
  const manual = await openManualForm(page);
  await setManualSource(manual, 'ETS Test 1');
  await manual.getByLabel('Câu hỏi và các phương án').fill('Part 5:\nForms should ____ submitted.\n(A) are\n(B) be');
  await manual.getByRole('button', { name: 'Đáp án đúng: B', exact: true }).click();
  await failWrites(page);
  await manual.getByRole('button', { name: /^Lưu(, Sóc giải thích giúp| vào Sổ tay)$/ }).click();
  await expect(manual.getByRole('alert')).toBeVisible();
  await expect(manual.getByLabel('Câu hỏi và các phương án')).toHaveValue(/Forms should/);
  await restoreWrites(page);
  await manual.getByRole('button', { name: /^Lưu(, Sóc giải thích giúp| vào Sổ tay)$/ }).click();
  await expect(manual).toHaveCount(0);
  await expect(page.locator('.pn-row')).toHaveCount(2);

  await openCard(page, undefined, 0);
  await page.getByRole('button', { name: 'Thêm thao tác', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sửa câu này', exact: true }).click();
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
  await review.getByRole('button', { name: 'Tiếp', exact: true }).click();
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
