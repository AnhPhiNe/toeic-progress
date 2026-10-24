import { test, expect, type Page } from '@playwright/test';

async function openReview(page: Page) {
  await page.goto('/so-tay');
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
  await page.getByRole('button', { name: /^Ôn 1 (thẻ|câu đến hạn)$/ }).click();
  return page.getByRole('dialog', { name: 'Ôn tập', exact: true });
}

for (const [label, stage, days] of [['Quên', 0, 1], ['Khó', 2, 4], ['Tốt', 3, 14], ['Dễ', 4, 30]] as const) {
  test(`self-rating ${label} persists its own schedule and survives reload`, async ({ page }) => {
    const review = await openReview(page);
    await review.getByRole('button', { name: 'Xem giải thích / Đáp án', exact: true }).last().click();
    await review.getByRole('button', { name: label, exact: true }).click();
    const saved = await page.evaluate(() => {
      const card = JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0];
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const due = new Date(`${card.nextReviewDate}T00:00:00`);
      return { stage: card.reviewStage, count: card.reviewCount, status: card.status,
        // Round across daylight-saving boundaries in the browser's local zone.
        days: Math.round((due.getTime() - today.getTime()) / 86400000), date: card.nextReviewDate };
    });
    expect(saved).toMatchObject({ stage, count: 3, status: 'NEEDS_REVIEW', days });
    await expect(review.getByRole('status')).toContainText(label);
    await review.getByRole('button', { name: 'Xem kết quả', exact: true }).click();
    await expect(review.getByRole('button', { name: 'Đóng', exact: true })).toBeFocused();
    await page.reload();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('toeic_progress_bundle_v3')!).mistakes[0].nextReviewDate)).toBe(saved.date);
  });
}

test('keyboard traversal never enters an inactive flashcard face and wraps on the visible controls', async ({ page }) => {
  const review = await openReview(page);
  const close = review.getByRole('button', { name: 'Đóng phiên ôn tập', exact: true });
  await expect(close).toBeFocused();
  const assertVisibleFocus = async () => {
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[inert], [aria-hidden="true"]')))).toBe(false);
    await expect(review.locator(':focus')).toBeVisible();
  };
  // Shift+Tab from the first control wraps to the visible front-face footer.
  await page.keyboard.press('Shift+Tab');
  await expect(review.getByRole('button', { name: 'Xem giải thích / Đáp án', exact: true }).last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); await assertVisibleFocus(); }
  await review.getByRole('button', { name: 'Xem giải thích / Đáp án', exact: true }).last().click();
  const flipBack = review.getByRole('button', { name: 'Xem lại câu hỏi', exact: true });
  await expect(flipBack).toBeFocused();
  await expect(review.locator('[aria-hidden="true"][inert]')).toHaveCount(1);
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(review.getByRole('button', { name: 'Dễ', exact: true })).toBeFocused();
  for (let i = 0; i < 10; i++) { await page.keyboard.press('Shift+Tab'); await assertVisibleFocus(); }
  await flipBack.click();
  await expect(review.getByRole('button', { name: /^A\s*are/ })).toBeFocused();
  await assertVisibleFocus();
});
