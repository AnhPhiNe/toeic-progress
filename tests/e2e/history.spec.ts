import { test, expect, type Page } from '@playwright/test';
import { openScoreLogger } from './helpers/nav';
import { openManualEntry } from './helpers/manualEntry';
import { openHistoryEdit, sessionDialog, usePartCounts } from './helpers/sessionForm';

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

const testsTab = (page: Page) => page.getByRole('tab', { name: /^Các đề/ }).click();

test('a test opens in a keyboard-reachable drawer and leads to the source-based notebook', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await testsTab(page);
  // The second ETS Test 1 is spelled "  ｅｔｓ   Test 1 "; it is told apart by its score.
  const row = page.getByRole('button', { name: /810/ });
  await expect(row).toHaveCount(1);
  await row.focus(); await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('Part 7', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await row.click();
  await drawer.getByRole('button', { name: /^(Chụp trang chữa bài Part \d|Mở Sổ tay đề này)$/ }).click();
  await expect(page).toHaveURL(/\/so-tay$/);
  await expect(page.getByRole('button', { name: /^Part 5 History note/ })).toHaveCount(2);
});

test('previous-score context is clear and stays chronological', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await testsTab(page);
  await expect(page.getByRole('heading', { name: '4 đề đã ghi, từ 800 lên 830' })).toBeVisible();
  const rows = page.locator('.jr-tl > li');
  await expect(rows).toHaveCount(4);
  // Newest first; every row carries its change against the test before it.
  await expect(rows.nth(0)).toContainText('830');
  await expect(rows.nth(0)).toContainText('+10');
  await expect(rows.nth(2)).toContainText('810');
  await expect(rows.nth(3)).toContainText('800');
  await expect(rows.nth(3).locator('.jr-dl')).toHaveCount(0);
});

test('a same-named SW result does not count as an earlier LR attempt', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    data.sessions = [{ ...data.sessions[0], skillType: 'SW', testName: 'Shared source', attemptNumber: 3, totalScore: 300 }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await openScoreLogger(page);
  const modal = sessionDialog(page);
  await openManualEntry(page, modal);
  const nameField = modal.getByLabel(/^Tên (đề|Đề Thi \/ Nguồn)$/);
  await nameField.click();
  await nameField.fill('Shared source');
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
  await openHistoryEdit(page, 'ETS Test 1');
  const modal = page.getByRole('dialog');
  await modal.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(modal).not.toBeVisible();
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.find((session: { id: string }) => session.id === 'history-0'));
  expect(result).toMatchObject({ id: 'history-0', attemptNumber: 1, totalScore: 800 });
  // The oldest row is still the first try: it is not tagged as a retake.
  await testsTab(page);
  await expect(page.locator('.jr-tl > li').last()).not.toContainText('làm lại');
  await expect(page.locator('.jr-tl > li').last()).toContainText('800');
});

test('deleting a test from its drawer asks first, cancel preserves data and the list updates', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page, 7);
  await testsTab(page);
  const rows = page.locator('.jr-tl > li');
  await expect(rows).toHaveCount(7);
  await rows.first().getByRole('button').click();
  const drawer = page.getByRole('dialog');
  page.once('dialog', dialog => dialog.dismiss());
  await drawer.getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect(drawer).toBeVisible();
  await expect(rows).toHaveCount(7);
  page.once('dialog', dialog => dialog.accept());
  await drawer.getByRole('button', { name: 'Xoá', exact: true }).click();
  await expect(rows).toHaveCount(6);
  await expect(page.getByRole('heading', { name: /^6 đề đã ghi/ })).toBeVisible();
  await page.reload(); await testsTab(page); await expect(rows).toHaveCount(6);
});

test('a total-only test shows missing L/R as a dash and says it has no wrong questions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const base = data.sessions[0];
    data.sessions.push({ ...base, id: 'total', testName: 'Total only', date: '2026-10-06', totalScore: 850, scoreSource: 'MANUAL_TOTAL', partScores: undefined, scaledListening: undefined, scaledReading: undefined });
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await testsTab(page);
  const row = page.getByRole('button', { name: /Total only/ });
  await expect(row).toContainText('Nghe — · Đọc —');
  await row.click();
  const drawer = page.getByRole('dialog', { name: 'Total only' });
  await expect(drawer.getByText('Đề này chỉ ghi điểm, chưa có câu sai.', { exact: false })).toBeVisible();
});

test('Hành trình and a test detail fit phones, tablets and desktops', async ({ page }, testInfo) => {
  await seed(page);
  for (const width of [320, 375, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await overflow()).toBe(true);
    await testsTab(page);
    await page.getByRole('button', { name: /ETS Test/ }).first().click();
    const detail = page.getByRole('dialog');
    await expect(detail).toBeVisible();
    expect(await overflow()).toBe(true);
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
  }
  await page.screenshot({ path: testInfo.outputPath('history-light.png'), fullPage: true });
});
