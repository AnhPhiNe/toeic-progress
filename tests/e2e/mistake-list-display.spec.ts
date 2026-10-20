import { test, expect } from '@playwright/test';

test('the notebook paginates ten cards while searching, filtering and reviewing the complete matching set', async ({ page }) => {
  await page.goto('/so-tay');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = Array.from({ length: 23 }, (_, index) => ({
      id: `display-${index}`, part: 5, category: 'OTHER', status: 'NEEDS_REVIEW',
      questionContext: `${index === 22 ? 'Hidden needle' : 'Reports'} ${index + 1} should ____ submitted.`,
      options: ['(A) are', '(B) be', '(C) were', '(D) been'], userMistake: '', correctAnswer: '(B) be',
      answerSource: 'PROVIDED', tags: [], sourceTestName: index >= 20 ? 'ETS Test 2' : 'ETS Test 1',
      createdAt: now, updatedAt: now, deletedAt: null,
    }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  const rows = page.getByRole('button', { name: /^Mở câu:/ });
  await expect(rows).toHaveCount(10);
  await expect(page.getByRole('button', { name: 'Tất cả 23', exact: true })).toBeVisible();
  await expect(page.getByText('1–10 / 23 thẻ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ôn 23 thẻ', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Ôn tập' });
  await expect(review.getByText('1 / 23', { exact: true })).toBeVisible();
  await review.getByRole('button', { name: 'Đóng phiên ôn tập' }).click();
  const pagination = page.getByRole('navigation', { name: 'Trang Sổ tay', exact: true });
  await expect(pagination.getByRole('button', { name: 'Trước', exact: true })).toBeDisabled();
  await pagination.getByRole('button', { name: 'Sau', exact: true }).click();
  await expect(rows).toHaveCount(10);
  await expect(page.getByText('11–20 / 23 thẻ', { exact: true })).toBeVisible();
  await pagination.getByRole('button', { name: 'Sau', exact: true }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.getByText('21–23 / 23 thẻ', { exact: true })).toBeVisible();
  await expect(pagination.getByRole('button', { name: 'Sau', exact: true })).toBeDisabled();
  await pagination.getByRole('button', { name: 'Trước', exact: true }).click();
  await expect(page.getByText('11–20 / 23 thẻ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await page.getByLabel('Đề', { exact: true }).selectOption({ label: 'ETS Test 1' });
  await expect(rows).toHaveCount(10);
  await expect(page.getByText('1–10 / 20 thẻ', { exact: true })).toBeVisible();
  await page.getByLabel('Đề', { exact: true }).selectOption({ label: 'ETS Test 2' });
  await expect(rows).toHaveCount(3);
  await expect(pagination).toHaveCount(0);
  await page.getByRole('button', { name: 'Đặt lại bộ lọc', exact: true }).click();
  await expect(rows).toHaveCount(10);
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await page.getByLabel('Tìm trong sổ tay').filter({ visible: true }).fill('Hidden needle');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Hidden needle 23');
  await expect(pagination).toHaveCount(0);
  const count = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.length);
  expect(count).toBe(23);
});

test('deleting the final card returns to a populated page and notebook pagination fits both themes', async ({ page }, testInfo) => {
  await page.goto('/so-tay');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = Array.from({ length: 11 }, (_, index) => ({ id: `page-${index}`, part: 5, category: 'OTHER', status: 'NEEDS_REVIEW',
      questionContext: `Reports ${index + 1} should ____ submitted.`, options: ['(A) are', '(B) be'], correctAnswer: '(B) be',
      answerSource: 'PROVIDED', userMistake: '', tags: [], sourceTestName: 'ETS Test 1', createdAt: now, updatedAt: now, deletedAt: null }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  const pagination = page.getByRole('navigation', { name: 'Trang Sổ tay', exact: true });
  // Paging is for tablet and desktop; phones group the list and load more (phone-notebook.spec.ts).
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await pagination.getByRole('button', { name: 'Sau', exact: true }).click();
    await expect(page.getByText('11–11 / 11 thẻ', { exact: true })).toBeVisible();
    await pagination.getByRole('button', { name: 'Trước', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Chuyển sang giao diện Tối', exact: true }).click();
  await page.setViewportSize({ width: 768, height: 900 });
  await expect.poll(() => page.locator('.notebook-view > section').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(18, 26, 43)');
  await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {}))); });
  await page.screenshot({ path: testInfo.outputPath('notebook-pagination-mobile.png'), fullPage: true });
  await pagination.getByRole('button', { name: 'Sau', exact: true }).click();
  await page.getByRole('button', { name: 'Tùy chọn thẻ', exact: true }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('menuitem', { name: 'Xóa', exact: true }).click();
  await expect(page.getByText('11–11 / 11 thẻ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tùy chọn thẻ', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('menuitem', { name: 'Xóa', exact: true }).click();
  await expect(page.getByText('1–10 / 10 thẻ', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Mở câu:/ })).toHaveCount(10);
  await expect(pagination).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('1–10 / 10 thẻ', { exact: true })).toBeVisible();
});
