import { expect, test } from '@playwright/test';
import { openCard } from './helpers/mistakeForm';
import { gotoPage } from './helpers/nav';
import { answerConfirm } from './helpers/confirmDialog';

test('phone notebook splits cards by status, keeps review above the bottom bar and fits the card actions on one row', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await gotoPage(page, '/so-tay');
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

  // Status tabs replace the old grouped sections: "Cần ôn" (due) opens first, "Đã thuộc" holds the mastered card.
  const tabs = page.getByRole('group', { name: 'Lọc theo trạng thái' });
  await expect(tabs.getByRole('button', { name: /^Cần ôn\s*2$/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pn-row')).toHaveCount(2);
  await tabs.getByRole('button', { name: /^Đã thuộc\s*1$/ }).click();
  await expect(page.locator('.pn-row')).toHaveCount(1);
  await tabs.getByRole('button', { name: /^Cần ôn/ }).click();
  await expect(page.getByRole('button', { name: 'Thêm câu sai', exact: true })).toHaveCount(0);

  const review = page.getByRole('button', { name: /^Ôn 2 câu$/ });
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính', exact: true });
  const reviewBox = (await review.boundingBox())!, navBox = (await nav.boundingBox())!;
  expect(reviewBox.y + reviewBox.height).toBeLessThanOrEqual(navBox.y);

  await openCard(page);
  const actions = page.locator('.cdp-foot');
  // The old card kept its three actions on one row at 320px. The redesigned card page stacks them (full-width buttons), so the check
  // is now that every action stays on screen inside the viewport.
  const boxes = await actions.getByRole('button').evaluateAll(buttons => buttons.map(button => { const r = button.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
  expect(boxes.length).toBeGreaterThan(1);
  for (const box of boxes) { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(320); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('phone history groups by month, opens the detail from the row and deletes from there', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoPage(page, '/lich-su');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.sessions = [['s1', 'ETS A', '2026-08-20', 800], ['s2', 'ETS B', '2026-09-03', 850]].map(([id, testName, date, totalScore]) => ({
      id, skillType: 'LR', sessionType: 'FULL_TEST', testName, date, totalScore, scaledListening: 400, scaledReading: Number(totalScore) - 400,
      durationMinutes: 120, createdAt: now, updatedAt: now, deletedAt: null }));
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('tab', { name: /^Các đề/ }).click();
  await expect(page.getByRole('heading', { name: /^Tháng 9/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Tháng 8/i })).toBeVisible();

  await page.getByRole('button', { name: /ETS B/ }).first().click();
  const detail = page.getByRole('dialog');
  await detail.getByRole('button', { name: 'Xoá bản ghi này', exact: true }).click();
  await answerConfirm(page, true);
  await expect(detail).toHaveCount(0);
  await expect(page.getByRole('button', { name: /ETS B/ })).toHaveCount(0);
  const live = await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).sessions.filter((s: { deletedAt: unknown }) => !s.deletedAt).length);
  expect(live).toBe(1);
});
