import { test, expect, type Page } from '@playwright/test';
import { gotoPage } from './helpers/nav';

async function openReview(page: Page) {
  await gotoPage(page, '/so-tay');
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!);
    const now = new Date().toISOString();
    data.mistakes = [{ id: 'rating-card', part: 5, category: 'OTHER', status: 'NEEDS_REVIEW',
      question: 'Reports should ____ submitted.', questionContext: 'Reports should ____ submitted.',
      options: ['(A) are', '(B) be'], correctAnswer: '(B) be', userMistake: '', answerSource: 'PROVIDED',
      tags: [], sourceTestName: 'Review regression', reviewStage: 2, reviewCount: 2,
      nextReviewDate: '2020-01-01', createdAt: now, updatedAt: now, deletedAt: null }];
    localStorage.setItem('toeic_progress_bundle_v3', JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole('button', { name: /^Ôn 1 câu/ }).click();
  return page.getByRole('dialog', { name: 'Ôn câu sai', exact: true });
}

// The old four self-ratings (Quên / Khó / Tốt / Dễ) became two buttons: "Vẫn chưa chắc" is AGAIN, "Hiểu rồi" is GOOD after a
// right pick and HARD after a wrong one. The "Dễ" (EASY) rating is no longer offered, so its case was dropped.
for (const [label, pick, button, stage, days] of [
  ['Vẫn chưa chắc after a right pick (again)', 'B', 'Vẫn chưa chắc', 0, 1],
  ['Hiểu rồi after a wrong pick (hard)', 'A', 'Hiểu rồi', 2, 4],
  ['Hiểu rồi after a right pick (good)', 'B', 'Hiểu rồi', 3, 14],
] as const) {
  test(`self-rating ${label} persists its own schedule and survives reload`, async ({ page }) => {
    const review = await openReview(page);
    await review.getByRole('button', { name: new RegExp(`^\\(${pick}\\)`) }).click();
    await review.getByRole('button', { name: button, exact: true }).click();
    const saved = await page.evaluate(() => {
      const card = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0];
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const due = new Date(`${card.nextReviewDate}T00:00:00`);
      return { stage: card.reviewStage, count: card.reviewCount, status: card.status,
        // Round across daylight-saving boundaries in the browser's local zone.
        days: Math.round((due.getTime() - today.getTime()) / 86400000), date: card.nextReviewDate };
    });
    expect(saved).toMatchObject({ stage, count: 3, status: 'NEEDS_REVIEW', days });
    const done = page.getByRole('dialog', { name: 'Ôn xong', exact: true });
    await expect(done).toContainText(button === 'Hiểu rồi' ? 'Hiểu rồi 1' : 'Ôn lại ngày mai 1');
    await done.getByRole('button', { name: 'Về Sổ tay', exact: true }).click();
    await page.reload();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0].nextReviewDate)).toBe(saved.date);
  });
}

test('keyboard traversal stays inside the phone review dialog and wraps on its visible controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const review = await openReview(page);
  const inside = () => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"][aria-label="Ôn câu sai"]')));
  const wrongPick = review.getByRole('button', { name: /^A\s*are/ });
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); expect(await inside()).toBe(true); }
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Shift+Tab'); expect(await inside()).toBe(true); }
  await wrongPick.click();
  await expect(review.getByRole('button', { name: 'Hiểu rồi', exact: true })).toBeVisible();
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); expect(await inside()).toBe(true); }
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Shift+Tab'); expect(await inside()).toBe(true); }
});
