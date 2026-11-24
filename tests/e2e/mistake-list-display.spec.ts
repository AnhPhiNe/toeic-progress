import { test, expect } from '@playwright/test';
import { gotoPage } from './helpers/nav';
import { answerConfirm } from './helpers/confirmDialog';

// Sổ tay on computers pages its list 8 rows at a time ("‹ Trước 1 / 3 Sau ›"); phones use the grouped list in phone-notebook specs.

test('the notebook paginates cards while searching, filtering and reviewing the complete matching set', async ({ page }) => {
  await gotoPage(page, '/so-tay');
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
  const rows = page.locator('.nb-row');
  await expect(rows).toHaveCount(8);
  await expect(page.getByRole('button', { name: /^Tất cả\s*23$/ })).toBeVisible();
  const pagination = page.getByRole('navigation', { name: 'Trang Sổ tay', exact: true });
  await expect(pagination).toContainText('1 / 3');
  // One session holds at most 15 cards; the button says how many wait for the next round.
  await page.getByRole('button', { name: /^Ôn 15 câu · còn 8/ }).click();
  const review = page.getByRole('dialog', { name: 'Ôn câu sai' });
  await expect(review.getByText('1 / 15', { exact: true })).toBeVisible();
  await review.getByRole('button', { name: /Thoát/ }).click();
  await expect(pagination.getByRole('button', { name: /Trước/ })).toBeDisabled();
  await pagination.getByRole('button', { name: /Sau/ }).click();
  await expect(rows).toHaveCount(8);
  await expect(pagination).toContainText('2 / 3');
  await pagination.getByRole('button', { name: /Sau/ }).click();
  await expect(rows).toHaveCount(7);
  await expect(pagination).toContainText('3 / 3');
  await expect(pagination.getByRole('button', { name: /Sau/ })).toBeDisabled();
  await pagination.getByRole('button', { name: /Trước/ }).click();
  await expect(pagination).toContainText('2 / 3');
  await page.getByRole('button', { name: /^Lọc/ }).click();
  const filter = page.getByRole('dialog', { name: 'Bộ lọc' });
  await filter.getByRole('button', { name: 'ETS Test 1', exact: true }).click();
  await expect(rows).toHaveCount(8);
  await expect(pagination).toContainText('1 / 3');
  await expect(filter).toContainText('20 câu khớp');
  await filter.getByRole('button', { name: 'ETS Test 2', exact: true }).click();
  await expect(rows).toHaveCount(3);
  await expect(pagination).toHaveCount(0);
  await filter.getByRole('button', { name: 'Xong', exact: true }).click();
  await page.getByRole('button', { name: 'Bỏ lọc', exact: true }).click();
  await expect(rows).toHaveCount(8);
  await page.getByLabel('Tìm trong Sổ tay').fill('Hidden needle');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Hidden needle 23');
  await expect(pagination).toHaveCount(0);
  const count = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes.length);
  expect(count).toBe(23);
});

test('deleting the final card on the last page returns to a populated page and the pager fits tablet and desktop', async ({ page }) => {
  await gotoPage(page, '/so-tay');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = Array.from({ length: 9 }, (_, index) => ({ id: `page-${index}`, part: 5, category: 'OTHER', status: 'NEEDS_REVIEW',
      questionContext: `Reports ${index + 1} should ____ submitted.`, options: ['(A) are', '(B) be'], correctAnswer: '(B) be',
      answerSource: 'PROVIDED', userMistake: '', tags: [], sourceTestName: 'ETS Test 1', createdAt: now, updatedAt: now, deletedAt: null }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  const pagination = page.getByRole('navigation', { name: 'Trang Sổ tay', exact: true });
  const rows = page.locator('.nb-row');
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await pagination.getByRole('button', { name: /Sau/ }).click();
    await expect(pagination).toContainText('2 / 2');
    await expect(rows).toHaveCount(1);
    await pagination.getByRole('button', { name: /Trước/ }).click();
    await expect(rows).toHaveCount(8);
  }
  await pagination.getByRole('button', { name: /Sau/ }).click();
  await rows.first().click();
  await page.getByRole('button', { name: 'Xoá câu này', exact: true }).click();
  await answerConfirm(page, false);
  await expect(page.getByRole('button', { name: 'Xoá câu này', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xoá câu này', exact: true }).click();
  await answerConfirm(page, true);
  await expect(rows).toHaveCount(8);
  await expect(pagination).toHaveCount(0);
  await page.reload();
  await expect(rows).toHaveCount(8);
});
