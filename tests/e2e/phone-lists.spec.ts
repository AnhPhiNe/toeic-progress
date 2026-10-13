import { expect, test } from '@playwright/test';

test('phone notebook groups cards by status, keeps review above the bottom bar and fits the card actions on one row', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('/so-tay');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    const card = (id: string, status: string, extra = {}) => ({ id, part: 5, category: 'OTHER', status, questionContext: `Câu 12: Reports ${id} should ____ submitted.`,
      options: ['(A) are', '(B) be'], correctAnswer: '(B) be', answerSource: 'PROVIDED', userMistake: '', tags: [], sourceTestName: 'ETS Test 1',
      createdAt: now, updatedAt: now, deletedAt: null, ...extra });
    data.mistakes = [card('a', 'NEEDS_REVIEW'), card('b', 'NEEDS_REVIEW'), card('c', 'MASTERED')];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();

  await expect(page.getByRole('region', { name: 'Cần ôn · 2' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xem 1 câu đã thuộc' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ghi Chú Bẫy', exact: true })).toBeHidden();
  // The number prefix is dropped from the row.
  await expect(page.getByText('Reports a should ____ submitted.', { exact: true })).toBeVisible();

  const review = page.getByRole('button', { name: 'Ôn 2 câu đến hạn', exact: true });
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính', exact: true });
  const reviewBox = (await review.boundingBox())!, navBox = (await nav.boundingBox())!;
  expect(reviewBox.y + reviewBox.height).toBeLessThanOrEqual(navBox.y);
  expect(navBox.y - (reviewBox.y + reviewBox.height)).toBeLessThan(24);

  await page.getByRole('button', { name: /^Mở câu:.*Reports a/ }).click();
  const actions = page.getByRole('group', { name: 'Thao tác với thẻ' });
  const tops = await actions.getByRole('button').evaluateAll(buttons => buttons.map(button => Math.round(button.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('phone history groups by month, opens the detail from the row and deletes from there', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lich-su');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.sessions = [['s1', 'ETS A', '2026-08-20', 800], ['s2', 'ETS B', '2026-09-03', 850]].map(([id, testName, date, totalScore]) => ({
      id, skillType: 'LR', sessionType: 'FULL_TEST', testName, date, totalScore, scaledListening: 400, scaledReading: Number(totalScore) - 400,
      durationMinutes: 120, createdAt: now, updatedAt: now, deletedAt: null }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await expect(page.getByRole('region', { name: 'Tháng 9 · 2026' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tháng 8 · 2026' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Sửa bản ghi/ })).toHaveCount(0);

  await page.getByRole('button', { name: /^Xem chi tiết ETS B/ }).click();
  const detail = page.getByRole('dialog');
  await detail.getByRole('button', { name: 'Xóa', exact: true }).click();
  await expect(detail).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Xem chi tiết ETS B/ })).toHaveCount(0);
  const live = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.filter((s: { deletedAt: unknown }) => !s.deletedAt).length);
  expect(live).toBe(1);
});
