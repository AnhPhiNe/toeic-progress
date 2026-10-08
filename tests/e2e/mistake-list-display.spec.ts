import { test, expect } from '@playwright/test';

test('the notebook starts with five cards but searches, filters and reviews the complete matching set', async ({ page }) => {
  await page.goto('/so-tay');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = Array.from({ length: 13 }, (_, index) => ({
      id: `display-${index}`, part: 5, category: 'OTHER', status: 'NEEDS_REVIEW',
      questionContext: `${index === 12 ? 'Hidden needle' : 'Reports'} ${index + 1} should ____ submitted.`,
      options: ['(A) are', '(B) be', '(C) were', '(D) been'], userMistake: '', correctAnswer: '(B) be',
      answerSource: 'PROVIDED', tags: [], sourceTestName: index >= 10 ? 'ETS Test 2' : 'ETS Test 1',
      createdAt: now, updatedAt: now, deletedAt: null,
    }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  const rows = page.getByRole('button', { name: /^Mở câu:/ });
  await expect(rows).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Tất cả 13', exact: true })).toBeVisible();
  await expect(page.getByText('Hiển thị 5/13 thẻ', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ôn 13 thẻ', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Ôn tập' });
  await expect(review.getByText('1 / 13', { exact: true })).toBeVisible();
  await review.getByRole('button', { name: 'Đóng phiên ôn tập' }).click();
  await page.getByRole('button', { name: 'Xem tất cả (13)', exact: true }).click();
  await expect(rows).toHaveCount(13);
  await expect(page.getByRole('button', { name: 'Thu gọn', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Thu gọn', exact: true }).click();
  await expect(rows).toHaveCount(5);
  await page.getByRole('button', { name: 'Xem tất cả (13)', exact: true }).click();
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await page.getByLabel('Đề', { exact: true }).selectOption({ label: 'ETS Test 1' });
  await expect(rows).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Xem tất cả (10)', exact: true })).toBeVisible();
  await page.getByLabel('Đề', { exact: true }).selectOption({ label: 'ETS Test 2' });
  await expect(rows).toHaveCount(3);
  await expect(page.getByRole('button', { name: /Xem tất cả/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Đặt lại bộ lọc', exact: true }).click();
  await expect(rows).toHaveCount(5);
  await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
  await page.getByLabel('Tìm trong sổ tay').filter({ visible: true }).fill('Hidden needle');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Hidden needle 13');
  await expect(page.getByRole('button', { name: /Xem tất cả/ })).toHaveCount(0);
  const count = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.length);
  expect(count).toBe(13);
});
