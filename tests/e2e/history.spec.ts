import { test, expect, type Page } from '@playwright/test';
import { usePartCounts } from './helpers/sessionForm';

async function seed(page: Page, count = 4) {
  await page.goto('/lich-su');
  await page.evaluate(count => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.sessions = Array.from({ length: count }, (_, index) => ({ id: `history-${index}`, testName: index < 2 ? index ? '  ｅｔｓ   Test 1 ' : 'ETS Test 1' : `ETS Test ${index + 1}`,
      skillType: 'LR', sessionType: 'FULL_TEST', date: `2026-10-${String(index + 1).padStart(2, '0')}`, durationMinutes: 110 + index,
      totalScore: 800 + index * 10, scaledListening: 400 + index * 5, scaledReading: 400 + index * 5, scoreSource: 'MANUAL_SECTIONS',
      partScores: { part1: 6, part2: 22, part3: 34, part4: 23, part5: 27, part6: 13, part7: 43 }, attemptNumber: 1,
      notes: 'Keep track of time.', createdAt: now, updatedAt: now, deletedAt: null }));
    data.mistakes = [
      { id: 'source', sourceTestName: 'ETS Test 1' }, { id: 'legacy', sessionId: 'history-1' },
      { id: 'clear', sessionId: 'history-0', sourceTestName: '' }, { id: 'other', sourceTestName: 'ETS Test 3' }
    ].map((source, index) => ({ ...source, part: 5, category: 'OTHER', status: 'NEEDS_REVIEW', questionContext: `History note ${index} should ____ submitted.`,
      userMistake: '', correctAnswer: '(B) be', options: ['(A) are', '(B) be'], tags: [], createdAt: now, updatedAt: now, deletedAt: null }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  }, count);
  await page.reload();
}

test('history uses keyboard details, normalized attempts and source-based notebook navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.getByLabel('Lọc lượt thi').selectOption('RETEST_ONLY');
  const name = page.getByRole('button', { name: /Xem chi tiết.*02\/10\/2026/ });
  await expect(name).toHaveCount(1);
  await name.focus(); await page.keyboard.press('Enter');
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  await expect(modal.getByText('2 lỗi đã ghi của đề này', { exact: true })).toBeVisible();
  const close = modal.getByRole('button', { name: 'Đóng chi tiết', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(modal.getByRole('button', { name: 'Sửa kết quả', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await page.keyboard.press('Escape'); await expect(name).toBeFocused();
  await name.click();
  await modal.getByRole('button', { name: 'Mở Sổ tay', exact: true }).click();
  await expect(page).toHaveURL(/\/so-tay$/);
  await expect(page.getByRole('button', { name: /^Mở câu:/ })).toHaveCount(2);
});

test('previous-score context is clear and remains chronological after search or sorting', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.getByRole('button', { name: 'Sắp xếp theo Tổng', exact: true }).click();
  await page.getByLabel('Tìm tên đề hoặc ghi chú').fill('Test 3');
  const comparison = page.locator('[title^="So với"]:visible');
  await expect(comparison).toHaveText('+10đ');
  await expect(comparison).toHaveAttribute('title', /02\/10\/2026 · 810 điểm/);
});

test('a same-named SW result does not count as an earlier LR attempt', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.sessions = [{ ...data.sessions[0], skillType: 'SW', testName: 'Shared source', attemptNumber: 3, totalScore: 300 }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Ghi điểm, phím tắt N', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Tên Đề Thi / Nguồn').fill('Shared source');
  await page.getByRole('option', { name: 'Shared source', exact: true }).click();
  await expect(modal.getByText('Lần 4', { exact: true })).toHaveCount(0);
  await usePartCounts(modal);
  await modal.getByRole('button', { name: 'Lưu kết quả', exact: true }).click();
  await expect(modal).not.toBeVisible();
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.find((session: { skillType: string }) => session.skillType === 'LR'));
  expect(result).toMatchObject({ testName: 'Shared source', attemptNumber: 1 });
});

test('editing a legacy first attempt keeps its inferred order instead of assigning the next attempt', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.sessions.forEach((session: { attemptNumber?: number }) => { delete session.attemptNumber; });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Sửa bản ghi ETS Test 1', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(modal).not.toBeVisible();
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.find((session: { id: string }) => session.id === 'history-0'));
  expect(result).toMatchObject({ id: 'history-0', attemptNumber: 1, totalScore: 800 });
  await page.getByLabel('Lọc lượt thi').selectOption('FIRST_ONLY');
  await expect(page.getByRole('button', { name: 'Xem chi tiết ETS Test 1, 01/10/2026', exact: true })).toBeVisible();
});

test('deleting the last row on the final page returns to a populated page and cancel preserves data', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, 11);
  await page.getByRole('button', { name: 'Sau', exact: true }).click();
  const remove = page.getByRole('button', { name: /^Xóa bản ghi/ });
  await expect(remove).toHaveCount(1);
  page.once('dialog', dialog => dialog.dismiss());
  await remove.click(); await expect(remove).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await remove.click();
  await expect(page.getByRole('button', { name: /^Xem chi tiết/ })).toHaveCount(10);
  await expect(page.getByText('10 bài làm', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole('button', { name: /^Xem chi tiết/ })).toHaveCount(10);
});

test('history shows ten rows at a time and searches the hidden older records', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, 12);
  const rows = page.getByRole('button', { name: /^Xem chi tiết/ });
  await expect(rows).toHaveCount(10);
  await expect(page.getByText('1–10 / 12 bài làm', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sau', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('11–12 / 12 bài làm', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Trước', exact: true }).click();
  await page.getByLabel('Tìm tên đề hoặc ghi chú').fill('ets test 1');
  // Both spellings of ETS Test 1 plus Tests 10–12.
  await expect(rows).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Sau', exact: true })).toHaveCount(0);
});

test('Part practice has its own results, ignores hidden attempt filter and missing L/R never appear as zero', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const base = data.sessions[0];
    data.sessions.push({ ...base, id: 'practice', sessionType: 'PART_PRACTICE', testName: 'Practice 5 and 6', practiceParts: [{ part: 5, correct: 28, total: 30 }, { part: 6, correct: 14, total: 16 }], partScores: undefined, scaledListening: undefined, scaledReading: undefined, totalScore: undefined });
    data.sessions.push({ ...base, id: 'total', testName: 'Total only', date: '2026-10-06', totalScore: 850, scoreSource: 'MANUAL_TOTAL', partScores: undefined, scaledListening: undefined, scaledReading: undefined });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: /Xem chi tiết Total only/ }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByText('Chưa ghi', { exact: true })).toHaveCount(2);
  await expect(modal.getByText('Chưa ghi chi tiết Part.', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Đóng chi tiết' }).click();
  await page.getByLabel('Lọc lượt thi').selectOption('RETEST_ONLY');
  await page.getByRole('button', { name: 'Luyện Part 1', exact: true }).click();
  await expect(page.getByLabel('Lọc lượt thi')).toHaveCount(0);
  await expect(page.getByRole('table').getByText(/91,3%/)).toBeVisible();
  await page.getByRole('button', { name: /Xem chi tiết Practice/ }).click();
  await expect(modal.getByText('Part 5', { exact: true })).toBeVisible();
  await expect(modal.getByText('Part 6', { exact: true })).toBeVisible();
});

test('history and details fit mobile, desktop and dark mode', async ({ page }, testInfo) => {
  await seed(page);
  for (const width of [320, 375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await overflow()).toBe(true);
    await page.getByRole('button', { name: /^Xem chi tiết/ }).first().click();
    const modal = page.getByRole('dialog'); await expect(modal).toBeVisible();
    expect(await modal.locator('..').evaluate(element => element.getBoundingClientRect().top)).toBe(0);
    expect(await overflow()).toBe(true);
    await modal.getByRole('button', { name: 'Đóng chi tiết' }).click();
  }
  await page.screenshot({ path: testInfo.outputPath('history-light.png'), fullPage: true });
  await page.getByRole('button', { name: /^Xem chi tiết/ }).first().click();
  await page.screenshot({ path: testInfo.outputPath('history-detail.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Chuyển sang giao diện Tối', exact: true }).click();
  await expect.poll(() => page.locator('.history-view > section').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(17, 26, 44)');
  await page.screenshot({ path: testInfo.outputPath('history-dark.png'), fullPage: true });
});
